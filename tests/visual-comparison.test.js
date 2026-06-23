/**
 * Pins that the visual-regression comparison pipeline (`compareImages` in
 * `tests/utils/visual-comparison.js`) actually distinguishes equivalent renders
 * from divergent ones. This is the pipeline's only self-test: the e2e suite
 * trusts `compareImages` to FAIL on a real regression, but nothing else proves
 * it can rather than silently passing. (Workstream A of the SVG-regeneration
 * effort, `.claude/plans/svg-regeneration-and-pipeline-validation.md`.)
 *
 * Covers:
 * - Byte-identical renders report a match at 100% similarity (no false negative).
 * - A large visible pixel divergence reports no match (no false positive / silent
 *   pass, the core fear motivating this file).
 * - A viewBox divergence reports no match even when the rasterized pixels are
 *   identical (the viewBox gate is independent of the pixel gate).
 * - Mismatched image sizes throw rather than silently passing.
 *
 * Does NOT cover:
 * - The sub-threshold sensitivity floor: a per-channel delta <= 10 and overall
 *   similarity >= 99.999% are tolerated by design, so a regression smaller than
 *   that floor is intentionally not caught. See the plan's "Comparison tolerance"
 *   note (UPDATE 2026-06-23).
 * - The e2e harness's missing-reference behaviour (a `fs.readFileSync` throw in
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`, not in `compareImages`).
 * - Exhaustive comparator edge cases (whitespace, attribute order, namespaces,
 *   embedded images) and the dead `toMatchImage` matcher: deferred to
 *   `.claude/backlog/visual-regression-pipeline-thorough-validation.md`.
 */
import { describe, it, expect } from 'vitest';
import { renderSVGToPNG, compareImages } from './utils/visual-comparison.js';

const CANVAS = 300;

// A 200x200 black square on a 300x300 white field: ~40000 dark pixels.
const filledSquareSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect x="50" y="50" width="200" height="200" fill="black"/></svg>';

// Same canvas, nothing drawn: an all-white field.
const blankSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"></svg>';

// Identical ink to filledSquareSvg but a different viewBox, for isolating the
// viewBox gate from the pixel gate.
const narrowViewBoxSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 200 200"><rect x="50" y="50" width="200" height="200" fill="black"/></svg>';

describe('compareImages', () => {
  describe('when two renders are byte-identical', () => {
    it('reports a match at 100% similarity', async () => {
      const a = await renderSVGToPNG(filledSquareSvg, CANVAS, CANVAS);
      const b = await renderSVGToPNG(filledSquareSvg, CANVAS, CANVAS);

      const result = await compareImages(a, b, 'meta-identical', 0.00001, filledSquareSvg, filledSquareSvg);

      expect(result.match).toBe(true);
      expect(result.similarity).toBe(1);
      expect(result.diffPixels).toBe(0);
    });
  });

  describe('when two renders differ by a large visible region', () => {
    it('reports no match rather than silently passing', async () => {
      const filled = await renderSVGToPNG(filledSquareSvg, CANVAS, CANVAS);
      const blank = await renderSVGToPNG(blankSvg, CANVAS, CANVAS);

      const result = await compareImages(filled, blank, 'meta-divergent', 0.00001, filledSquareSvg, blankSvg);

      expect(result.match).toBe(false);
      expect(result.pixelMatch).toBe(false);
      expect(result.diffPixels).toBeGreaterThan(0);
    });
  });

  describe('when the pixels are identical but the viewBoxes differ', () => {
    it('reports no match on the viewBox gate alone', async () => {
      const png = await renderSVGToPNG(filledSquareSvg, CANVAS, CANVAS);

      const result = await compareImages(png, png, 'meta-viewbox', 0.00001, filledSquareSvg, narrowViewBoxSvg);

      expect(result.pixelMatch).toBe(true);
      expect(result.viewBoxMatch).toBe(false);
      expect(result.match).toBe(false);
    });
  });

  describe('when the two images are different sizes', () => {
    it('throws rather than silently passing', async () => {
      const big = await renderSVGToPNG(filledSquareSvg, CANVAS, CANVAS);
      const small = await renderSVGToPNG(filledSquareSvg, 200, 200);

      await expect(
        compareImages(big, small, 'meta-size-mismatch', 0.00001, filledSquareSvg, filledSquareSvg)
      ).rejects.toThrow('Images are not the same size');
    });
  });
});
