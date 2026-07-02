import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the Strict Indicator Separation contract: DSL `;` is dumb
 * part-composition on a single character, `;;` stays smart at the word level.
 *
 * The discriminator is glyph-vs-bare-alias (the parser's `baseIsBareAlias`):
 * a `;`-part extends a single character (a glyph, literal, or unknown bare
 * code) but is MISPLACED on a bare alias or a multi-character word (a word
 * unit has no single character to take the part). A glyph never bakes an
 * indicator (the define() D-S1a guard forbids it, pinned in
 * `BlissSVGBuilder.define.test.js`), so dumb `;` never meets a baked semantic
 * indicator; semantic reordering is now exclusively an API concern.
 *
 * Covers:
 * - `;` appends a part to a glyph in written order, with no warning;
 *   byte-identical to `addPart`.
 * - `;` on a bare alias / multi-character word / multi-word (`//`) alias warns
 *   MISPLACED_CHARACTER_INDICATOR, drops the part, and still renders the base
 *   as defined (the word's head keeps any baked indicator).
 * - Trailing `;` is inert (no strip, no warning, baked indicator kept); leading
 *   `;` is tolerated.
 * - `!` after a single `;` has no special parse: it dumb-appends an invalid
 *   code on a glyph (UNKNOWN_CODE) but is dropped-before-validation when the
 *   base is misplaced (MISPLACED only, no UNKNOWN_CODE).
 * - `;;` still applies a smart word-level indicator (unchanged).
 *
 * Does NOT cover:
 * - The full `;;` reversible-overlay surface, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - The smart API (`addPart`, `glyph`/`group.applyIndicators`,
 *   `clearIndicators`), see the ElementHandle indicator tests.
 * - The define() guard that forbids a glyph baking an indicator, see
 *   `BlissSVGBuilder.define.test.js`.
 * - Rendered SVG positions for indicators, see the visual-regression e2e suite.
 *
 * @contract: strict-indicator-separation
 */
describe('BlissParser strict indicator separation', () => {
  // All fixtures are legitimate and register through the public define() API
  // (the kerning-exemplar pattern). Bare aliases carry no glyph flag (parser
  // `baseIsBareAlias` => `;` MISPLACED); GPLAIN is a real glyph whose parts are
  // a base + a shape, never an indicator (=> `;` dumb-appends).
  const FIXTURES = {
    NOUN: { codeString: 'B291;B81' },                          // bare alias, grammatical baked
    NOUN_S: { codeString: 'B291;B97' },                        // bare alias, semantic baked
    WORD: { codeString: 'B291/B313' },                         // multi-character word
    WORDN: { codeString: 'B291;B81/B313' },                    // multi-char word, head baked B81
    MWORD: { codeString: 'B291//B313' },                       // multi-word (//) alias
    GPLAIN: { type: 'glyph', codeString: 'H;S2' },             // real glyph; S2 is not an indicator
    SHCOMP: { type: 'shape', codeString: 'HL4;VL4' },          // composite shape (one character)
  };
  beforeAll(() => BlissSVGBuilder.define(FIXTURES));
  afterAll(() => Object.keys(FIXTURES).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  const codes = (input) => new BlissSVGBuilder(input).warnings.map((w) => w.code);
  const svg = (input) => new BlissSVGBuilder(input).svgCode;

  describe('when ; is applied to a single-character glyph', () => {
    it('appends the part and emits no warning', () => {
      const b = new BlissSVGBuilder('GPLAIN;B97');
      expect(b.toString()).toBe('H;S2;B97');
      expect(b.warnings).toEqual([]);
    });

    it('appends multiple parts in written order (dumb, never reordered)', () => {
      // pins dumb composition: `;` stacks parts as written; it does not apply
      // the smart semantic-last reordering the API uses.
      expect(new BlissSVGBuilder('GPLAIN;B97;B81').toString()).toBe('H;S2;B97;B81');
    });

    it('is byte-identical to addPart', () => {
      const dsl = new BlissSVGBuilder('GPLAIN;B97');
      const api = new BlissSVGBuilder('GPLAIN');
      api.group(0).glyph(0).addPart('B97');
      expect(dsl.toString()).toBe(api.toString());
      expect(dsl.svgCode).toBe(api.svgCode);
    });
  });

  describe('when ; is applied to a composite shape', () => {
    it('dumb-appends the part instead of flagging it misplaced', () => {
      // pins the !isShape discriminator: a composite shape is a single
      // character, so ; composes onto it rather than being misplaced.
      expect(codes('SHCOMP;B81')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
    });
  });

  describe('when ; is applied to a bare alias', () => {
    it('warns MISPLACED_CHARACTER_INDICATOR and renders the alias as defined', () => {
      const b = new BlissSVGBuilder('NOUN;B97');
      expect(codes('NOUN;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;B81');
      expect(b.svgCode).toBe(svg('B291;B81'));
    });

    it('drops the misplaced part for a semantic-baked alias too', () => {
      const b = new BlissSVGBuilder('NOUN_S;B81');
      expect(codes('NOUN_S;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;B97');
    });
  });

  describe('when ; is applied to a multi-character word', () => {
    it('warns and drops the part while still rendering the word', () => {
      const b = new BlissSVGBuilder('WORD;B97');
      expect(codes('WORD;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291/B313');
      expect(b.svgCode).toBe(svg('B291/B313'));
    });

    it('preserves the head baked indicator when dropping the misplaced part', () => {
      // regression: today the head's baked B81 is silently destroyed
      // (B291;B97/B313). The misplaced part must drop without touching it.
      const b = new BlissSVGBuilder('WORDN;B97');
      expect(codes('WORDN;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;B81/B313');
    });

    it('treats any ;-part as misplaced, even a non-indicator', () => {
      expect(codes('WORD;C8')).toContain('MISPLACED_CHARACTER_INDICATOR');
    });
  });

  describe('when ; is applied to a multi-word (//) alias', () => {
    it('warns MISPLACED and renders every word', () => {
      // D1: a // alias is valid multi-word content, so a stray ;-part is
      // misplaced (warn + drop + render), not a whole-unit fail.
      expect(codes('MWORD;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(codes('MWORD;B81')).not.toContain('MALFORMED_WORD_INDICATOR');
      expect(svg('MWORD;B81')).toBe(svg('B291//B313'));
    });
  });

  describe('when a leading or trailing ; carries no part', () => {
    it('keeps a trailing ; inert on an alias, preserving the baked indicator', () => {
      const b = new BlissSVGBuilder('NOUN;');
      expect(b.toString()).toBe('B291;B81');
      expect(b.warnings).toEqual([]);
    });

    it('does not flag a trailing ; on a word as misplaced', () => {
      const b = new BlissSVGBuilder('WORD;');
      expect(codes('WORD;')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291/B313');
    });

    it('tolerates a leading ; as equivalent to no ;', () => {
      expect(svg(';B97')).toBe(svg('B97'));
      expect(codes(';B97')).toEqual([]);
    });
  });

  describe('when ! follows a single ;', () => {
    it('dumb-appends an invalid code on a glyph (UNKNOWN_CODE, not misplaced)', () => {
      expect(codes('GPLAIN;!B81')).toContain('UNKNOWN_CODE');
      expect(codes('GPLAIN;!B81')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
    });

    it('normalizes a dropped invalid part to a toString fixpoint', () => {
      // `!B81` is lexically invalid, so it carries no codeName (the codeName
      // contract surfaces only real identity). It warns UNKNOWN_CODE at parse
      // (above) and is dropped from the output, so toString stabilizes at the
      // base `H;S2` rather than re-emitting the bad token. The fixpoint holds.
      const str = new BlissSVGBuilder('GPLAIN;!B81').toString();
      expect(new BlissSVGBuilder(str).toString()).toBe(str);
    });

    it('drops a ;!-part on a bare alias as misplaced, with no UNKNOWN_CODE', () => {
      expect(codes('NOUN_S;!B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(codes('NOUN_S;!B81')).not.toContain('UNKNOWN_CODE');
    });

    it('drops a ;!-part on a word as misplaced only', () => {
      expect(codes('WORD;!B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(codes('WORD;!B81')).not.toContain('UNKNOWN_CODE');
      expect(svg('WORD;!B81')).toBe(svg('B291/B313'));
    });
  });

  describe('when ;; applies a word-level indicator', () => {
    it('still applies a smart word-level indicator via ;;', () => {
      // unchanged: the ;; reversible overlay is untouched by this effort.
      expect(new BlissSVGBuilder('NOUN_S;;B81').toString()).toBe('B291;B97;;B81');
    });

    it('does not add a spurious character-indicator warning to a malformed ;;', () => {
      // A malformed ;; (a / after the indicators) fail-renders with
      // MALFORMED_WORD_INDICATOR; its internal fallback re-expansion must NOT
      // also report the char-level MISPLACED_CHARACTER_INDICATOR.
      const c = codes('WORD;;B81/B291');
      expect(c).toContain('MALFORMED_WORD_INDICATOR');
      expect(c).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      // and its round-trip is a stable fixpoint. M1 showed this property was
      // unpinned (the multi-word sibling grew unbounded); pin the single-word
      // case too so a future regression here cannot pass on warning-shape alone.
      const t1 = new BlissSVGBuilder('WORD;;B81/B291').toString();
      expect(new BlissSVGBuilder(t1).toString()).toBe(t1);
    });
  });

  describe('when a malformed ;; is applied to a multi-word (//) alias', () => {
    it('fail-renders without growing the toString round-trip', () => {
      // regression (M1): the malformed-;; fallback expanded the // alias into
      // separate word-groups, so toString re-emitted the whole expansion and the
      // round-trip grew by "//B313/B291" on every pass. Collapsing the multi-word
      // expansion to one fail-placeholder restores the verbatim fixpoint.
      const b = new BlissSVGBuilder('MWORD;;B81/B291');
      const t1 = b.toString();
      const t2 = new BlissSVGBuilder(t1).toString();
      expect(t1).toBe('MWORD;;B81/B291');
      expect(t2).toBe(t1);
    });

    it('warns MALFORMED_WORD_INDICATOR, not a character-indicator warning', () => {
      const c = codes('MWORD;;B81/B291');
      expect(c).toContain('MALFORMED_WORD_INDICATOR');
      expect(c).not.toContain('MISPLACED_CHARACTER_INDICATOR');
    });
  });

  describe('when a part-level options prefix [...]> wraps a ;-bearing base', () => {
    // regression: F2 — the parser's part-level-options early return used to
    // bypass the strict-separation MISPLACED gate (external review 2026-06-30;
    // fixed rc.4 pre-Phase-D Chunk 5a). Full option-placement coverage lives in
    // `BlissParser.option-placement.test.js`.
    it('warns MISPLACED on an options-prefixed ; over a bare alias (F2)', () => {
      const warned = codes('[color=red]>NOUN;B97');
      expect(warned).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(new BlissSVGBuilder('[color=red]>NOUN;B97').toString()).not.toContain('B97');
    });
  });
});
