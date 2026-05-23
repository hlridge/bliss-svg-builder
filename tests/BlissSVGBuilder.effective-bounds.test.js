import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `effectiveBounds` getter on a `BlissSVGBuilder` composition:
 * the well-ordered-extent invariant for a default composition; the
 * vertical extents derived from glyph content; and the cascade of
 * `[x]` / `[y]` positioning options at the global, word, and character
 * levels into the composition's effective bounds.
 *
 * Covers:
 * - Default composition reports defined and well-ordered minX/maxX/minY/maxY,
 *   for both a single-character (B291) and a multi-word (B1098/B1117)
 *   input.
 * - Glyph-content-shaped vertical bounds for four representative B-codes:
 *   B1098 (characters at different y positions) → y∈[4,16]; B1117 (single
 *   character pushed down) → y∈[15,17]; B5998 (nested indicators) →
 *   y∈[4,6]; B85 (indicator with non-indicator) → y∈[4,6].
 * - Global positioning options shift the composition bounds: `[x=5]||B291`
 *   shifts minX≥5; `[y=10]||B291` shifts minY≥10; `[x=5;y=10]||B291`
 *   applies both axes; multi-level `[x=2;y=3]||[x=1;y=2]|[x=1;y=1]B291`
 *   accumulates across global, word, and character levels (minX≥4,
 *   minY≥6).
 * - Horizontal extent widens past a single-character width (>8) for the
 *   multi-character input B1098/B5998/B85.
 * - Word-level y positioning `[y=10]|B291/B291` propagates both to
 *   `word.effectiveBounds` (and each `char.effectiveBounds`) and to the
 *   root `composition.effectiveBounds`, with minY=18 and maxY=26.
 *
 * Does NOT cover:
 * - Level-2 character `effectiveBounds`, `isGlyph` / `isBlissGlyph` /
 *   `isExternalGlyph` flags, and x-offset effects on `width` /
 *   `advanceX`, see `BlissSVGBuilder.element-bounds.test.js` (parser +
 *   element only, no `BlissSVGBuilder` instantiation; different surface).
 * - Auto-crop modes that derive viewBox from `effectiveBounds`
 *   (`crop=auto`, `crop=auto-vertical`), see
 *   `BlissSVGBuilder.crop.test.js`.
 * - Default-mode `height=20` invariant on level-2 elements, see
 *   `BlissSVGBuilder.character-height.test.js`.
 * - SVG viewBox geometry shaped by margin or crop, see
 *   `BlissSVGBuilder.margin.test.js` and `BlissSVGBuilder.crop.test.js`.
 */
describe('BlissSVGBuilder effective bounds', () => {
  describe('when reading bounds for a default composition', () => {
    it('exposes well-ordered minX/maxX/minY/maxY for a single-character composition', () => {
      const builder = new BlissSVGBuilder('B291');
      const element = builder.composition;
      const bounds = element.effectiveBounds;

      expect(bounds).toBeDefined();
      expect(bounds.minX).toBeDefined();
      expect(bounds.maxX).toBeDefined();
      expect(bounds.minY).toBeDefined();
      expect(bounds.maxY).toBeDefined();
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
    });

    it('reports a positive horizontal extent for a single character', () => {
      const builder = new BlissSVGBuilder('B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minX).toBeDefined();
      expect(bounds.maxX).toBeDefined();
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    });

    it('reports well-ordered bounds across a multi-word composition', () => {
      const builder = new BlissSVGBuilder('B1098/B1117');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBeLessThanOrEqual(bounds.maxY);
      expect(bounds.minX).toBeLessThanOrEqual(bounds.maxX);
      expect(bounds.maxY - bounds.minY).toBeGreaterThan(0);
    });
  });

  describe('when the glyph has vertical content variation', () => {
    it('reports y∈[4,16] for B1098 (characters at different y positions)', () => {
      const builder = new BlissSVGBuilder('B1098');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBe(4);
      expect(bounds.maxY).toBe(16);
      expect(bounds.maxY - bounds.minY).toBe(12);
    });

    it('reports y∈[15,17] for B1117 (character pushed down)', () => {
      const builder = new BlissSVGBuilder('B1117');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBe(15);
      expect(bounds.maxY).toBe(17);
      expect(bounds.maxY - bounds.minY).toBe(2);
    });

    it('reports y∈[4,6] for B5998 (nested indicators)', () => {
      const builder = new BlissSVGBuilder('B5998');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBe(4);
      expect(bounds.maxY).toBe(6);
      expect(bounds.maxY - bounds.minY).toBe(2);
    });

    it('reports y∈[4,6] for B85 (indicator with non-indicator)', () => {
      const builder = new BlissSVGBuilder('B85');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBe(4);
      expect(bounds.maxY).toBe(6);
      expect(bounds.maxY - bounds.minY).toBe(2);
    });
  });

  describe('when global positioning options are set', () => {
    it('shifts minX to ≥ 5 when [x=5] is set globally', () => {
      const builder = new BlissSVGBuilder('[x=5]||B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minX).toBeGreaterThanOrEqual(5);
    });

    it('shifts minY to ≥ 10 when [y=10] is set globally', () => {
      const builder = new BlissSVGBuilder('[y=10]||B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBeGreaterThanOrEqual(10);
    });

    it('combines global x and y shifts in the bounds', () => {
      const builder = new BlissSVGBuilder('[x=5;y=10]||B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minX).toBeGreaterThanOrEqual(5);
      expect(bounds.minY).toBeGreaterThanOrEqual(10);
    });

    it('accumulates positioning across global, word, and character levels', () => {
      // x accumulates: 2 + 1 + 1 = 4; y accumulates: 3 + 2 + 1 = 6
      const builder = new BlissSVGBuilder('[x=2;y=3]||[x=1;y=2]|[x=1;y=1]B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minX).toBeGreaterThanOrEqual(4);
      expect(bounds.minY).toBeGreaterThanOrEqual(6);
    });

    it('widens the horizontal extent past a single-character width (>8) for a multi-character string', () => {
      const builder = new BlissSVGBuilder('B1098/B5998/B85');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds).toBeDefined();
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxX - bounds.minX).toBeGreaterThan(8);
    });
  });

  describe('when positioning cascades through the word level', () => {
    it('propagates word-level [y=10] to word.effectiveBounds and to each char.effectiveBounds', () => {
      const builder = new BlissSVGBuilder('[y=10]|B291/B291');
      const composition = builder.composition;
      const words = composition.children;

      expect(words.length).toBe(1);

      const word = words[0];
      expect(word.y).toBe(0);
      expect(word.children.length).toBe(2);

      const wordBounds = word.effectiveBounds;
      expect(wordBounds.minY).toEqual(18);
      expect(wordBounds.maxY).toEqual(26);

      word.children.forEach((char) => {
        const charBounds = char.effectiveBounds;
        expect(charBounds.minY).toEqual(18);
        expect(charBounds.maxY).toEqual(26);
      });
    });

    it('pins composition.effectiveBounds.minY=18 for [y=10]|B291/B291 (regression: returned 8 before fix; y offset 10 + B291 baseline 8 = 18)', () => {
      // regression: bounds were returning 8 (the B291 baseline only) instead of 18 (offset + baseline)
      const builder = new BlissSVGBuilder('[y=10]|B291/B291');
      const bounds = builder.composition.effectiveBounds;

      expect(bounds.minY).toBe(18);
    });
  });
});
