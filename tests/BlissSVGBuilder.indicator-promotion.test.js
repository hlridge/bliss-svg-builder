import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that the former character-level indicator *promotion* is gone. A `;`-part
 * on a bare alias (a word unit) no longer routes into a reversible `;;` word-
 * level overlay. It is now MISPLACED: the parser warns
 * MISPLACED_CHARACTER_INDICATOR, drops the part, and renders the alias as
 * defined, creating no `wordIndicators` overlay and no DROPPED_WORD_INDICATOR.
 * The reversible word overlay is reached only via `;;` (or the smart API);
 * `addPart` still composes at the character level.
 *
 * The fixtures are the exact bases that used to promote (single-character bare
 * aliases, with and without a baked indicator); this file is the regression
 * guard that promotion stays removed.
 *
 * Covers:
 * - A `;`-part on a single-character bare alias (grammatical-baked, semantic-
 *   baked, clean-base, multi-part base): MISPLACED + drop + render-as-defined,
 *   with no word overlay.
 * - A `;`-part on a bare alias inside a multi-glyph word: MISPLACED, no overlay,
 *   and no DROPPED_WORD_INDICATOR (the old first-wins word-slot machinery is
 *   gone); an explicit `;;` overlay elsewhere in the same word is untouched.
 * - The supported replacement: `;;` on the same alias still builds a reversible
 *   word overlay.
 *
 * Does NOT cover:
 * - The core dumb-`;` / MISPLACED contract, `;`<->addPart parity on a real
 *   glyph, trailing-`;` inertness, and `;!` content-drop, see
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - `addPart`'s per-glyph semantics (it composes onto a navigated glyph node,
 *   independent of the DSL token rules, so it is not a parity peer of a
 *   *misplaced* `;`), see the ElementHandle indicator suites.
 * - `;` on a multi-character word / alias chain / multi-word `//` alias and head
 *   resolution via `;;`, see `BlissParser.word-indicators.test.js`.
 * - The `;;` overlay store shape, first-wins ownership, and DROPPED_WORD_INDICATOR
 *   collision rules, see `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.compose-merge-parity.test.js`.
 */
describe('BlissSVGBuilder indicator promotion', () => {
  const PROMO_DEFS = {
    NOUN_BI: { codeString: 'B291;B81' },       // bare alias, grammatical baked
    NOUN_S: { codeString: 'B291;B97' },        // bare alias, semantic baked
    NOUN_B: { codeString: 'B291' },            // bare alias, clean base (no baked indicator)
    // bare alias, multi-part base. Re-anchored during row 67: the old
    // 'B291;B99;VL4' baked a mid-list indicator, which now normalizes away
    // (MISPLACED_INDICATOR_PART); the multi-part-survival pin needs a base
    // that is valid on its own.
    MIXEDTAIL: { codeString: 'B291;H;VL4' },
  };
  const codes = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);
  const svg = (dsl) => new BlissSVGBuilder(dsl).svgCode;

  beforeAll(() => BlissSVGBuilder.define(PROMO_DEFS));
  afterAll(() => Object.keys(PROMO_DEFS).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  describe('when a character ; is applied to a single-character bare alias', () => {
    it('warns MISPLACED, drops the part, and creates no word overlay', () => {
      // The defining "promotion is gone" pin: no reversible ;; overlay is built.
      const b = new BlissSVGBuilder('NOUN_BI;B97');
      expect(codes('NOUN_BI;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;B81');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(b.svgCode).toBe(svg('B291;B81'));
    });

    it('drops the misplaced part on a semantic-baked alias too', () => {
      const b = new BlissSVGBuilder('NOUN_S;B81');
      expect(codes('NOUN_S;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;B97');
    });

    it('treats a ; on a clean-base alias as misplaced', () => {
      // The discriminator is bare-alias-ness, not the presence of a baked
      // indicator: NOUN_B = 'B291' is a clean base, yet ; is still misplaced.
      // (This was a plain character-append in the old promotion model.)
      const b = new BlissSVGBuilder('NOUN_B;B97');
      expect(codes('NOUN_B;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291');
    });

    it('preserves a multi-part baked base when dropping the misplaced part', () => {
      // MIXEDTAIL = 'B291;H;VL4': the whole 3-part base survives, not just the
      // first part.
      const b = new BlissSVGBuilder('MIXEDTAIL;B81');
      expect(codes('MIXEDTAIL;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString()).toBe('B291;H;VL4');
    });
  });

  describe('when a character ; is applied to a bare alias inside a multi-glyph word', () => {
    it('warns MISPLACED with no overlay and no DROPPED_WORD_INDICATOR', () => {
      // The old promotion path built a word-slot overlay on this glyph and then
      // dropped it (first-wins) with DROPPED_WORD_INDICATOR. That machinery is
      // gone: the ; is simply misplaced and the word renders as defined.
      const b = new BlissSVGBuilder('H/NOUN_BI;B97');
      expect(codes('H/NOUN_BI;B97')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(codes('H/NOUN_BI;B97')).not.toContain('DROPPED_WORD_INDICATOR');
      expect(b.toString()).toBe('H/B291;B81');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(b.svgCode).toBe(svg('H/B291;B81'));
    });

    it('warns once per misplaced glyph with no promotion machinery', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/NOUN_BI;B86');
      expect(codes('NOUN_BI;B97/NOUN_BI;B86'))
        .toEqual(['MISPLACED_CHARACTER_INDICATOR', 'MISPLACED_CHARACTER_INDICATOR']);
      expect(b.toString()).toBe('B291;B81/B291;B81');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });

    it('leaves an explicit ;; overlay in the same word intact', () => {
      // The misplaced ; and a genuine word-level ;; are independent: ;B97 drops,
      // ;;B86 still builds its reversible overlay on the word.
      const b = new BlissSVGBuilder('NOUN_BI;B97/E;;B86');
      expect(codes('NOUN_BI;B97/E;;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(codes('NOUN_BI;B97/E;;B86')).not.toContain('DROPPED_WORD_INDICATOR');
      expect(b.toString()).toBe('B291;B81/E;;B86');
    });
  });

  describe('when a word-level ;; is applied to a former-promotion alias', () => {
    it('builds a reversible word overlay (the supported replacement for promotion)', () => {
      const b = new BlissSVGBuilder('NOUN_BI;;B97');
      expect(b.toString()).toBe('B291;B81;;B97');
      // existence only; the overlay's shape is owned by the ;; overlay suites
      // (see "Does NOT cover"). toString already pins the serialized form.
      expect(b.toJSON().groups[0].wordIndicators).toBeDefined();
      expect(b.warnings).toEqual([]);
    });
  });
});
