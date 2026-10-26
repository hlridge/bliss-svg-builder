import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the retention-family contract (run-to-stable Phase 2.1, rows 31/80):
 * serializations hold CONTENT; malformed SYNTAX is a parse-time warning that is
 * never persisted. A malformed part token (a pure error node: `!`, or a code
 * with a malformed `:x,y` suffix) fails HARD and drops its WHOLE character; a
 * malformed word-level indicator (a doubled `;;`) fails HARD and drops its
 * WHOLE word. Both vanish from toString() AND toJSON() (no `{error}` node, no
 * group `errorCode`/`errorSource`) and reserve no render extent, leaving only
 * the warning. A well-formed-but-UNKNOWN code (`ZZ9`) is content that cannot yet
 * resolve: it is KEPT in both serializations and warned, never dropped.
 *
 * Covers:
 * - Malformed `!` part drops the whole character (not just the bad part), so a
 *   valid sibling can never survive into a DIFFERENT valid character (the E->F
 *   hazard): `B291;!;B97` -> "" (was "B291;B97").
 * - A malformed coordinate suffix (`B97:zz`) is the same pure-error-node case
 *   and drops the whole character, warning MALFORMED_COORDINATES.
 * - The dropped character/word leaves no persisted error node in toJSON.
 * - A doubled `;;` word drops the whole word from both serializations, keeping
 *   exactly one MALFORMED_WORD_INDICATOR warning; extent follows the drop (a
 *   dropped trailing word reserves no phantom extent).
 * - Round-trip stability: the dropped forms serialize to a string that
 *   re-parses to the same (drop-free) state with no new warning.
 * - A malformed part inside a definition the character names (a typed glyph
 *   or shape, alone, as a part, in a word) drops the whole character exactly
 *   as its code string written in place does; an unknown code there is kept.
 * - Retention control: an unknown code (`ZZ9`) is unchanged (kept + warned) at
 *   both the part and word level.
 *
 * Does NOT cover:
 * - The PARSER-level flag itself (the parser still produces group.errorCode /
 *   part error nodes; the builder drops them at rebuild), see
 *   `BlissParser.double-semicolon.test.js`.
 * - WORD_AS_PART / COMPOSITE_AS_PART (a word/composite misused as a part) which
 *   keep their visible codeName and re-emit, see
 *   `BlissElement.warning-behavior.test.js`.
 * - Direct BlissElement construction with an error node, see
 *   `BlissElement.error-placeholder.test.js` and
 *   `BlissElement.warning-behavior.test.js`.
 *
 * @contract: malformed-retention-drop
 */

const MALFORMED_DEFINITIONS = {
  MR_DOUBLED: { type: 'glyph', codeString: 'B291;>>B313' },
  MR_BANG: { type: 'glyph', codeString: 'B291;!B81' },
  MR_SHAPE: { type: 'shape', codeString: 'HL8;!VL8' },
  MR_UNKNOWN: { type: 'glyph', codeString: 'B291;ZZ9' },
};

const codesOf = (b) => b.warnings.map((w) => w.code);
const reportsOf = (b) => b.warnings.map(({ code, source }) => [code, source]);
const allParts = (b) => b.toJSON().groups.flatMap((g) => g.glyphs ?? []).flatMap((gl) => gl.parts ?? []);
const vbWidth = (b) => Number(b.svgCode.match(/viewBox="\S+ \S+ (\S+) \S+"/)[1]);

describe('BlissSVGBuilder malformed retention', () => {
  describe('when a malformed part token fails the character', () => {
    it('drops the whole character rather than keeping a valid sibling part', () => {
      // The E->F hazard: dropping only `!` would leave `B291;B97`, a DIFFERENT
      // valid character the user never wrote.
      const b = new BlissSVGBuilder('B291;!;B97');
      expect(b.toString()).toBe('');
      expect(codesOf(b)).toEqual(['UNKNOWN_CODE']);
    });

    it('drops the character with a bare `!` and reserves no extent', () => {
      const b = new BlissSVGBuilder('B291;!');
      expect(b.toString()).toBe('');
      expect(b.toJSON().groups[0].glyphs).toEqual([]);
    });

    it('persists no error node in toJSON for the dropped character', () => {
      const b = new BlissSVGBuilder('B291;!');
      expect(allParts(b)).toEqual([]);
      expect(JSON.stringify(b.toJSON())).not.toContain('Invalid format');
    });

    it('drops a character with a malformed coordinate suffix, warning MALFORMED_COORDINATES', () => {
      // A recognizable code with an unparseable `:x,y` is a pure error node too.
      const b = new BlissSVGBuilder('B291;B97:zz');
      expect(b.toString()).toBe('');
      expect(codesOf(b)).toEqual(['MALFORMED_COORDINATES']);
      expect(allParts(b)).toEqual([]);
    });

    it('drops a standalone malformed glyph to an empty composition', () => {
      const b = new BlissSVGBuilder('!');
      expect(b.toString()).toBe('');
      expect(b.toJSON().groups[0].glyphs).toEqual([]);
    });

    it('round-trips the dropped form to the same drop-free state with no new warning', () => {
      const b = new BlissSVGBuilder('B291;!;B97');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toString()).toBe('');
      expect(reparsed.warnings).toEqual([]);
    });
  });

  describe('when a malformed part token sits beside surviving neighbor words', () => {
    it('drops only the failed character, keeping the valid neighbor words', () => {
      const b = new BlissSVGBuilder('B291//B208;!//B313');
      const str = b.toString();
      expect(str.startsWith('B291')).toBe(true);
      expect(str.endsWith('B313')).toBe(true);
      expect(str).not.toContain('B208');
      expect(str).not.toContain('!');
      expect(codesOf(b)).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when a definition the character names holds a malformed part', () => {
    // note: a typed definition written alone is stored as one part named after
    // it, so the malformed part sits a level below the character's own parts
    beforeAll(() => {
      const { errors } = BlissSVGBuilder.define(MALFORMED_DEFINITIONS);
      expect(errors).toEqual([]);
    });
    afterAll(() => Object.keys(MALFORMED_DEFINITIONS).forEach((code) => BlissSVGBuilder.removeDefinition(code)));

    it.each([
      ['MR_DOUBLED', 'B291;>>B313'],
      ['MR_BANG', 'B291;!B81'],
      ['MR_SHAPE', 'HL8;!VL8'],
      ['B313;MR_DOUBLED', 'B313;B291;>>B313'],
      ['B313;MR_SHAPE', 'B313;HL8;!VL8'],
      ['B313/MR_DOUBLED', 'B313/B291;>>B313'],
      ['MR_BANG/B313', 'B291;!B81/B313'],
      ['B313//MR_DOUBLED', 'B313//B291;>>B313'],
    ])('drops %s whole, as %s written in place is dropped', (input, twin) => {
      const named = new BlissSVGBuilder(input);
      const written = new BlissSVGBuilder(twin);
      expect(codesOf(named)).toEqual(['UNKNOWN_CODE']);
      expect(reportsOf(named)).toEqual(reportsOf(written));
      expect(named.svgCode).toBe(written.svgCode);
      expect(named.toString()).toBe(written.toString());
      expect(named.toString({ preserve: true })).toBe(written.toString({ preserve: true }));
      expect(named.toJSON()).toEqual(written.toJSON());
      expect(named.toJSON({ preserve: true })).toEqual(written.toJSON({ preserve: true }));
    });

    it('keeps a character whose definition holds an unknown code, as content', () => {
      const b = new BlissSVGBuilder('B313/MR_UNKNOWN');
      expect(codesOf(b)).toEqual(['UNKNOWN_CODE']);
      expect(b.toString()).toBe('B313/B291;ZZ9');
      expect(b.toString({ preserve: true })).toBe('B313/MR_UNKNOWN');
    });
  });

  describe('when a word-level indicator is malformed (doubled ;;)', () => {
    it('drops the whole word from both serializations', () => {
      const b = new BlissSVGBuilder('B291;;B81;;B86');
      expect(b.toString()).toBe('');
      expect(b.toJSON().groups).toEqual([]);
    });

    it('keeps exactly one MALFORMED_WORD_INDICATOR warning for the dropped word', () => {
      const b = new BlissSVGBuilder('B291;;B81;;B86');
      expect(codesOf(b)).toEqual(['MALFORMED_WORD_INDICATOR']);
    });

    it('persists no errorCode or errorSource in toJSON', () => {
      const json = new BlissSVGBuilder('B291;;B81;;B86').toJSON();
      expect(JSON.stringify(json)).not.toContain('errorCode');
      expect(JSON.stringify(json)).not.toContain('errorSource');
    });

    it('drops a trailing failed word so it reserves no phantom extent', () => {
      // Was viewBox width 17.5 (extent reserved up to the failed word's origin);
      // now the failed word is gone, leaving the separator space only.
      const b = new BlissSVGBuilder('B291//B313;;B84;;B97');
      expect(b.toString()).toBe('B291//');
      expect(vbWidth(b)).toBeLessThan(vbWidth(new BlissSVGBuilder('B291//B313')));
    });

    it('round-trips the dropped word to the same state with no new warning', () => {
      const b = new BlissSVGBuilder('B313//B291;;B81;;B86');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toString()).toBe(b.toString());
      expect(reparsed.warnings).toEqual([]);
    });
  });

  describe('when a code is well-formed but unknown (retention control)', () => {
    it('keeps an unknown part through both serializations and warns', () => {
      const b = new BlissSVGBuilder('B291;ZZ9');
      expect(b.toString()).toBe('B291;ZZ9');
      expect(codesOf(b)).toEqual(['UNKNOWN_CODE']);
      expect(allParts(b).map((p) => p.codeName)).toEqual(['B291', 'ZZ9']);
    });

    it('keeps a standalone unknown code as its own glyph', () => {
      const b = new BlissSVGBuilder('ZZ9');
      expect(b.toString()).toBe('ZZ9');
      expect(codesOf(b)).toEqual(['UNKNOWN_CODE']);
    });
  });
});
