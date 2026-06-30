import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins how a compound indicator (a `type:'glyph'` definition flagged
 * `isIndicator`, or a built-in like B98) behaves as a single-character `;` base
 * versus as the head of a multi-glyph word, under Strict Indicator Separation.
 *
 * A compound indicator is an ATOMIC single character. As a `;` base it
 * dumb-appends the part (COMBO_IND;B81 -> B86;B97;B81), rendering identically to
 * the same indicators written as standalone B-codes (no doubling/reordering/
 * dropping). As the HEAD of a multi-glyph word alias (WORD_CI = COMBO_IND/B291),
 * a char-level `;`-part has no single character to attach to, so it is MISPLACED
 * (warn + drop + render the word bare). A trailing `;` is inert.
 *
 * Covers:
 * - Single baseless compound-indicator glyph as a `;` base: dumb-appends and
 *   renders == standalone, including a baked sub-part offset (the x===undefined
 *   element-layer guard) and the `.every` all-indicator baseless-stack gate.
 * - `;!` on a compound-indicator glyph: `!CODE` is an invalid part, so it
 *   dumb-appends and warns UNKNOWN_CODE (no special strip parse).
 * - A char-`;`-part on a multi-glyph word with a compound-indicator head
 *   (flagged or unflagged): MISPLACED + drop + render bare; `;!`/lone-`!` parts
 *   are dropped-before-validation (MISPLACED only, no UNKNOWN_CODE, per D3);
 *   trailing `;` is inert.
 * - Guard: define() rejects a glyph that bakes an indicator-first codeString.
 *
 * Does NOT cover:
 * - The general MISPLACED-on-a-word contract, see
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - Single-glyph strip-semantic silence on a baseless compound-indicator glyph,
 *   see `BlissSVGBuilder.custom-glyphs.test.js`.
 * - The from-origin x layout of a baseless indicator stack, see
 *   `BlissElement.indicator-positioning.test.js`.
 */

const customCodes = [];

beforeAll(() => {
  BlissSVGBuilder.define({ COMBO_IND: { type: 'glyph', codeString: 'B86;B97', isIndicator: true } });
  BlissSVGBuilder.define({ WORD_CI: { codeString: 'COMBO_IND/B291' } });
  BlissSVGBuilder.define({ BARE_AI: { codeString: 'B86;B97' } });
  BlissSVGBuilder.define({ WORD_BARE: { codeString: 'BARE_AI/B291' } });
  BlissSVGBuilder.define({ CI_OFFSET: { type: 'glyph', codeString: 'B86;B97:5,0', isIndicator: true } });
  BlissSVGBuilder.define({ MIX_CI: { type: 'glyph', codeString: 'B270;B86', isIndicator: true } });
  customCodes.push('COMBO_IND', 'WORD_CI', 'BARE_AI', 'WORD_BARE', 'CI_OFFSET', 'MIX_CI');
});

afterAll(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

describe('BlissSVGBuilder compound indicator application', () => {

  describe('when a char-indicator (;) targets a multi-glyph word with a compound-indicator head', () => {
    it('is misplaced on a flagged compound-indicator head, rendering the word bare', () => {
      const word = new BlissSVGBuilder('WORD_CI;B81');
      expect(word.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(word.toString()).toBe('B86;B97/B291');
      expect(word.svgCode).toBe(new BlissSVGBuilder('WORD_CI').svgCode);
    });

    it('is misplaced on an unflagged all-indicator head too (the flag no longer matters)', () => {
      const word = new BlissSVGBuilder('WORD_BARE;B81');
      expect(word.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(word.toString()).toBe('B86;B97/B291');
    });

    it('leaves a trailing ; inert, keeping the compound-indicator head', () => {
      const word = new BlissSVGBuilder('WORD_CI;');
      expect(word.toString()).toBe('B86;B97/B291');
      expect(word.warnings).toEqual([]);
    });
  });

  describe('when a !-prefixed or lone-! ;-part targets a compound-indicator word head', () => {
    // D3: a misplaced ;-part is dropped BEFORE its content is validated, so only
    // MISPLACED fires - never UNKNOWN_CODE for the invalid !CODE / lone !.
    it('drops a ;!CODE part as misplaced only, with no UNKNOWN_CODE', () => {
      const word = new BlissSVGBuilder('WORD_CI;!B81');
      expect(word.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(word.warnings.map(w => w.code)).not.toContain('UNKNOWN_CODE');
      expect(word.toString()).toBe('B86;B97/B291');
    });

    it('drops a lone ;! part as misplaced only, with no UNKNOWN_CODE', () => {
      const word = new BlissSVGBuilder('WORD_CI;!');
      expect(word.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(word.warnings.map(w => w.code)).not.toContain('UNKNOWN_CODE');
      expect(word.toString()).toBe('B86;B97/B291');
    });

    it('drops the same on an unflagged all-indicator head', () => {
      const word = new BlissSVGBuilder('WORD_BARE;!B81');
      expect(word.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(word.toString()).toBe('B86;B97/B291');
    });
  });

  describe('when a single baseless compound-indicator glyph is a ; base', () => {
    it('dumb-appends the part, rendering as the indicators written standalone', () => {
      // toString proves stacking (B86;B97;B81), not char-replace (which would
      // drop the baked B97 -> B86;B81); the render matches the standalone form.
      const single = new BlissSVGBuilder('COMBO_IND;B81');
      expect(single.toString()).toBe('B86;B97;B81');
      expect(single.svgCode).toBe(new BlissSVGBuilder('B86;B97;B81').svgCode);
    });

    it('warns UNKNOWN_CODE for a ;!-part (no special strip parse), keeping the base', () => {
      // `!B81` is an invalid code dumb-appended onto the glyph; it is not a
      // strip-semantic operation. The base compound indicator is unchanged.
      const single = new BlissSVGBuilder('COMBO_IND;!B81');
      expect(single.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(single.toString()).toBe('B86;B97');
    });

    it('keeps a baked sub-part offset instead of the from-origin stack position', () => {
      // pins the x===undefined element-layer guard (R15 3b-5): CI_OFFSET bakes B97
      // at x=5, so the from-origin baseless-stack layout (which would place it at
      // width+gap=3) must NOT override it. Removing the guard regresses the render
      // to the from-origin form.
      const baked = new BlissSVGBuilder('CI_OFFSET;B81');
      expect(baked.toString()).toBe('B86;B97:5,0;B81');
      expect(baked.svgCode).not.toBe(new BlissSVGBuilder('B86;B97;B81').svgCode);
    });
  });

  describe('when a mixed base-and-indicator composite is used with an applied indicator', () => {
    it('is not laid out as a baseless stack (the all-indicator gate excludes it)', () => {
      // pins the `.every(c => c.isIndicator)` gate (R15 3b-5): MIX_CI = B270;B86
      // has a non-indicator base part (B270), so the baseless-stack layout must
      // NOT run. A `.some` mutant relays the base from origin, widening the glyph
      // (viewBox 6.5 -> 7.5).
      expect(new BlissSVGBuilder('MIX_CI;B81').svgCode)
        .toContain('viewBox="-0.75 -0.75 6.5 21.5"');
    });
  });

  describe('when a glyph definition would bake an indicator-first codeString', () => {
    it('is rejected by define() (such a base is undefinable)', () => {
      // D-S1a: a glyph cannot bake an indicator, so an indicator-first base never
      // exists; the dumb-; base case never meets one. (The earlier "no built-in
      // reaches the .slice(1) replace path" scan was dropped as vacuous: that
      // single-glyph replace path no longer exists under dumb ;.)
      const result = BlissSVGBuilder.define({ IND_FIRST_GLYPH: { type: 'glyph', codeString: 'B86;B291' } });
      expect(result.errors).toHaveLength(1);
    });
  });
});
