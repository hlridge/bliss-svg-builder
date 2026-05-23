import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins ElementHandle group-level head-indicator API: applyHeadIndicators(code, options?)
 * and clearHeadIndicators(options?) target the head glyph of a group, with
 * semantic-preserving behavior unless { stripSemantic: true } is passed.
 *
 * Covers:
 * - Application onto multi-glyph and single-glyph groups (head = first glyph).
 * - Semantic indicator preservation; opt-in stripSemantic on apply and clear.
 * - Chaining (apply and clear both return the group handle).
 * - No-op on non-group handles (level !== 1).
 * - Group-handle stability across the delegated mutation.
 * - DSL equivalence with the `;;` word-level indicator marker (apply:
 *   `word;;B86`; clear: trailing bare `;;`).
 *
 * Does NOT cover:
 * - The character-level applyIndicators / clearIndicators APIs and their
 *   semantic-ordering rules, see `ElementHandle.apply-indicators.test.js`
 *   and `ElementHandle.clear-indicators.test.js`. The head-level methods
 *   delegate to these after picking the head glyph.
 * - Parser grammar for `;;` and the head-glyph selection algorithm, see
 *   `BlissParser.double-semicolon.test.js`.
 * - Visual/SVG-output rendering of indicator placement, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js` and
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 */

const partCodes = (builder, groupIdx = 0, glyphIdx = 0) => {
  const json = builder.toJSON();
  const glyph = json.groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

describe('ElementHandle head indicators', () => {
  describe('when applying head indicators to a group', () => {
    it('applies the indicator to the head glyph of a multi-glyph group', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyHeadIndicators('B86');
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('preserves a semantic indicator already on the head glyph', () => {
      // note: B97 is semantic, B81 is verbal; semantic always sorts last
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyHeadIndicators('B81');
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B81', 'B97']);
    });

    it('strips the semantic indicator with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyHeadIndicators('B86', { stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const result = b.group(0).applyHeadIndicators('B86');
      expect(result.level).toBe(1);
    });

    it('is a no-op on non-group handles (level !== 1)', () => {
      const b = new BlissSVGBuilder('B291');
      const glyph = b.group(0).glyph(0);
      const result = glyph.applyHeadIndicators('B86');
      expect(result.level).toBe(2);
      expect(partCodes(b)).toEqual(['B291']);
    });

    it('applies to the only glyph when the group has just one', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).applyHeadIndicators('B86');
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('matches the `;;B86` DSL marker on a multi-glyph word', () => {
      const dsl = new BlissSVGBuilder('B291/B303;;B86');
      const mut = new BlissSVGBuilder('B291/B303');
      mut.group(0).applyHeadIndicators('B86');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches the `;;B81` DSL marker on a base with a semantic indicator', () => {
      const dsl = new BlissSVGBuilder('B291;B97/B303;;B81');
      const mut = new BlissSVGBuilder('B291;B97/B303');
      mut.group(0).applyHeadIndicators('B81');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('keeps the group handle valid after the delegated mutation', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const group = b.group(0);
      group.applyHeadIndicators('B86');
      expect(group.level).toBe(1);
      expect(() => group.glyph(0)).not.toThrow();
    });
  });

  describe('when clearing head indicators from a group', () => {
    it('clears grammatical indicators from the head glyph and preserves semantic', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearHeadIndicators();
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B97']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('clears every indicator (grammatical and semantic) with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearHeadIndicators({ stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86/B303');
      const result = b.group(0).clearHeadIndicators();
      expect(result.level).toBe(1);
    });

    it('is a no-op on non-group handles (level !== 1)', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.group(0).glyph(0);
      const result = glyph.clearHeadIndicators();
      expect(result.level).toBe(2);
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('matches the bare trailing `;;` DSL marker on a base with semantic content', () => {
      // note: bare `;;` clears grammatical indicators only; semantic (B97) is preserved
      const dsl = new BlissSVGBuilder('B291;B86;B97/B303;;');
      const mut = new BlissSVGBuilder('B291;B86;B97/B303');
      mut.group(0).clearHeadIndicators();
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('chained apply then clear with stripSemantic restores the bare base', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyHeadIndicators('B86').clearHeadIndicators({ stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });
  });
});
