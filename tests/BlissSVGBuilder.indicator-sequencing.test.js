import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the misplaced-indicator part invariant (row 67): an indicator part is
 * only meaningful in its glyph's trailing indicator run (BASE;INDICATOR); an
 * indicator followed by default-positioned known content is dropped from both
 * render and serialization with MISPLACED_INDICATOR_PART, and the rest of the
 * character renders normally (warn + drop, the misplaced-`^` model, NOT the
 * error-placeholder whole-character failure).
 *
 * Covers:
 * - DSL drops: leading indicator, mid-sequence indicator, multiple drops,
 *   warning payload (code/source/message) and reading order.
 * - Valid forms unchanged: trailing run, all-indicator stack, standalone
 *   indicator, trailing run behind the last base.
 * - The explicit-position exemption: content at a non-origin `:x,y` does not
 *   convict a preceding indicator (compound-indicator decomposed anatomy must
 *   round-trip); `:0,0` counts as default-positioned because serialization
 *   drops it, so an origin coordinate cannot carry the exemption across a
 *   round-trip.
 * - Uncertainty retention: an indicator followed only by an unknown code is
 *   kept (the unknown-code retention contract), while a known witness before
 *   the unknown still convicts.
 * - `;;` overlay interplay: the overlay survives a dropped leading indicator.
 * - Mutation-API backdoors: insertPart(0), addPart orphaning a trailing
 *   indicator, hand-authored object input.
 * - Round-trip stability: reparse and toJSON of a normalized builder warn
 *   nothing further and render identically.
 *
 * Does NOT cover:
 * - `;;` overlay code validation, see BlissParser.word-indicator-validation.test.js.
 * - Compound-indicator atomic layout and application, see
 *   BlissSVGBuilder.compound-indicator-application.test.js.
 * - The applyIndicators invalid-pattern no-op gate, see
 *   ElementHandle.apply-indicators.test.js.
 */
describe('BlissSVGBuilder indicator sequencing', () => {
  const misplacedWarnings = (builder) =>
    builder.warnings.filter((w) => w.code === 'MISPLACED_INDICATOR_PART');

  describe('when an indicator precedes default-positioned content', () => {
    it('drops a leading indicator and renders the remaining base', () => {
      const b = new BlissSVGBuilder('B86;B291');
      expect(b.toString()).toBe('B291');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('drops a mid-sequence indicator and keeps the parts around it', () => {
      const b = new BlissSVGBuilder('B291;B86;C8');
      expect(b.toString()).toBe('B291;C8');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('keeps the trailing indicator run behind the last base', () => {
      const b = new BlissSVGBuilder('B291;B86;C8;B97');
      expect(b.toString()).toBe('B291;C8;B97');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('drops each misplaced indicator with its own warning in reading order', () => {
      const b = new BlissSVGBuilder('B86;B90;B291');
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86', 'B90']);
    });

    it('names the dropped indicator in the warning message', () => {
      const [warning] = misplacedWarnings(new BlissSVGBuilder('B86;B291'));
      expect(warning.message).toContain('"B86"');
      expect(warning.message).toContain('dropped');
    });

    it('drops a leading indicator before a shape part', () => {
      const b = new BlissSVGBuilder('B86;C8');
      expect(b.toString()).toBe('C8');
      expect(misplacedWarnings(b)).toHaveLength(1);
    });

    it('convicts every indicator before the last default-positioned base', () => {
      // pins the rightmost-witness scan: an early-exit removal that settles on
      // the leftmost witness would spare B90
      const b = new BlissSVGBuilder('B291;B86;C8;B90;H');
      expect(b.toString()).toBe('B291;C8;H');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86', 'B90']);
    });

    it('includes the coordinate suffix in the dropped source', () => {
      // the exemption reads the FOLLOWER's position, so a hand-placed
      // indicator before default-positioned content is still misplaced
      const b = new BlissSVGBuilder('B86:1,2;B291');
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86:1,2']);
    });

    it('treats an explicit :0,0 as default-positioned', () => {
      // :0,0 never re-emits from toString, so an origin coordinate cannot be
      // the hand-positioned exemption without breaking round-trip stability
      const b = new BlissSVGBuilder('B86;B291:0,0');
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });
  });

  describe('when the part sequence is already valid', () => {
    it('keeps a trailing indicator unchanged', () => {
      const b = new BlissSVGBuilder('B291;B86');
      expect(b.toString()).toBe('B291;B86');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps a trailing run of two indicators', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      expect(b.toString()).toBe('B291;B86;B97');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps an all-indicator stack', () => {
      const b = new BlissSVGBuilder('B86;B97');
      expect(b.toString()).toBe('B86;B97');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps a standalone indicator', () => {
      const b = new BlissSVGBuilder('B86');
      expect(b.toString()).toBe('B86');
      expect(b.warnings).toHaveLength(0);
    });
  });

  describe('when following content is explicitly positioned', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch {}
      }
      customCodes.length = 0;
    });

    it('keeps an indicator before artwork at a non-origin position', () => {
      const b = new BlissSVGBuilder('B86;SDOT:3,4');
      expect(b.toString()).toBe('B86;SDOT:3,4');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps an indicator before artwork positioned on one axis only', () => {
      // pins the OR in the meaningful-coordinate check: an x without a y is
      // still hand-placed
      const b = new BlissSVGBuilder('B86;C8:2');
      expect(b.toString()).toBe('B86;C8:2,0');
      expect(b.warnings).toHaveLength(0);
    });

    it('leaves a compound indicator glyph with default-positioned anatomy intact', () => {
      // pins the glyph-level isIndicator exemption (the atomic-unit contract):
      // without it, the anatomy's default-positioned C8 would convict B86
      customCodes.push('MISEQFLAT');
      BlissSVGBuilder.define({
        MISEQFLAT: { type: 'glyph', isIndicator: true, codeString: 'B86;C8', width: 2 },
      });
      const b = new BlissSVGBuilder('MISEQFLAT');
      expect(b.warnings).toHaveLength(0);
      expect(b.toString()).toBe('B86;C8');
    });

    it('round-trips a custom compound indicator decomposition', () => {
      // regression guard for the composition portability contract: a custom
      // compound indicator serializes by decomposition, and the decomposed
      // reparse has no glyph-level isIndicator flag to exempt it
      customCodes.push('MISEQMIX');
      BlissSVGBuilder.define({
        MISEQMIX: { type: 'glyph', isIndicator: true, codeString: 'B86;SDOT:3,4', anchorOffsetX: -0.5, width: 3 },
      });
      const b = new BlissSVGBuilder('MISEQMIX');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(b.toString()).toBe('B86;SDOT:3,4');
      expect(reparsed.toString()).toBe('B86;SDOT:3,4');
      expect(reparsed.svgCode).toBe(b.svgCode);
      expect(reparsed.warnings).toHaveLength(0);
    });
  });

  describe('when a definition expands to a misplaced sequence', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch {}
      }
      customCodes.length = 0;
    });

    it('normalizes a bare-alias expansion that bakes a leading indicator', () => {
      customCodes.push('MISEQALIAS');
      BlissSVGBuilder.define({ MISEQALIAS: { codeString: 'B86;B291' } });
      const b = new BlissSVGBuilder('MISEQALIAS');
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });
  });

  describe('when a following part cannot be classified', () => {
    it('keeps an indicator followed only by an unknown code', () => {
      // the unknown code is retained by contract and may later resolve to an
      // indicator, so the sequence must survive the round-trip untouched
      const b = new BlissSVGBuilder('B291;B86;ZZ9');
      expect(b.toString()).toBe('B291;B86;ZZ9');
      expect(misplacedWarnings(b)).toHaveLength(0);
      expect(b.warnings.map((w) => w.code)).toContain('UNKNOWN_CODE');
    });

    it('still drops when a known base sits between the indicator and the unknown code', () => {
      const b = new BlissSVGBuilder('B86;B291;ZZ9');
      expect(b.toString()).toBe('B291;ZZ9');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('does not let a failed composite part convict the indicator', () => {
      // a defined multi-part alias in a non-leading slot fails the character
      // (COMPOSITE_AS_PART); a failed part is no witness, matching the
      // unknown-code retention above
      try {
        BlissSVGBuilder.define({ MISEQBI: { codeString: 'B291;B81' } });
        const b = new BlissSVGBuilder('B303;B86;MISEQBI');
        expect(misplacedWarnings(b)).toHaveLength(0);
        const parts = b.toJSON().groups[0].glyphs[0].parts;
        expect(parts.map((p) => p.codeName)).toEqual(['B303', 'B86', 'MISEQBI']);
      } finally {
        try { BlissSVGBuilder.removeDefinition('MISEQBI'); } catch {}
      }
    });
  });

  describe('when the word is fail-flagged', () => {
    it('leaves a terminal word untouched, misplaced indicator included', () => {
      // pins the group.errorCode skip (replay fidelity): a fail-flagged word
      // re-emits verbatim, so its leading indicator must survive normalize
      const b = new BlissSVGBuilder('B86;B291;;X;;Y');
      expect(b.toString()).toBe('B86;B291;;X;;Y');
      expect(misplacedWarnings(b)).toHaveLength(0);
      expect(b.warnings.map((w) => w.code)).toContain('MALFORMED_WORD_INDICATOR');
    });
  });

  describe('when the word carries a ;; overlay', () => {
    it('drops the misplaced indicator and keeps the overlay', () => {
      const b = new BlissSVGBuilder('B86;B291;;B90');
      expect(b.toString()).toBe('B291;;B90');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291;;B90').svgCode);
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });
  });

  describe('when the mutation API recreates the misplaced state', () => {
    it('drops an indicator inserted before the base', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).insertPart(0, 'B86');
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('drops a trailing indicator orphaned by an appended base', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.glyph(0).addPart('C8');
      expect(b.toString()).toBe('B291;C8');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });

    it('normalizes hand-authored object input', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B86', isIndicator: true }, { codeName: 'B291' }] }] }],
      });
      expect(b.toString()).toBe('B291');
      expect(misplacedWarnings(b).map((w) => w.source)).toEqual(['B86']);
    });
  });

  describe('when the normalized result round-trips', () => {
    it('reparses without further warnings and renders identically', () => {
      const b = new BlissSVGBuilder('B86;B291');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.warnings).toHaveLength(0);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('rebuilds from toJSON without further warnings', () => {
      const b = new BlissSVGBuilder('B86;B291');
      const rebuilt = new BlissSVGBuilder(b.toJSON());
      expect(rebuilt.warnings).toHaveLength(0);
      expect(rebuilt.svgCode).toBe(b.svgCode);
    });
  });
});
