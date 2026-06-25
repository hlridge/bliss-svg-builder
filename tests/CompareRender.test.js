/**
 * Pins that `compareRenderToReference` drives the SAME render-and-compare path
 * the visual-regression e2e suite uses (Hard Constraint 4 of the R2 plan): a
 * generated SVG and a reference SVG go through viewBox-combination, PNG
 * rasterization at the canvas size, and `compareImages` at the committed
 * `0.00001` threshold. The reference-SVG regeneration engine classifies the real
 * corpus through this single function, so it must agree with the e2e verdict.
 *
 * Covers:
 * - Identical renders report a match.
 * - A large visible divergence reports no match (no silent pass).
 *
 * Does NOT cover:
 * - The comparator's internals / sensitivity floor: see `visual-comparison.test.js`.
 * - viewBox-combination math for differing viewBoxes: exercised transitively by the
 *   real corpus run, not isolated here.
 */
import { describe, it, expect } from 'vitest';
import { compareRenderToReference } from './utils/compare-render.js';

const filledSquareSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect x="50" y="50" width="200" height="200" fill="black"/></svg>';
const blankSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"></svg>';

describe('compareRenderToReference', () => {
  describe('when the generated and reference SVGs are identical', () => {
    it('reports a match', async () => {
      const result = await compareRenderToReference(filledSquareSvg, filledSquareSvg, 'compare-render-identical');

      expect(result.match).toBe(true);
    });
  });

  describe('when the generated and reference SVGs diverge visibly', () => {
    it('reports no match', async () => {
      const result = await compareRenderToReference(filledSquareSvg, blankSvg, 'compare-render-divergent');

      expect(result.match).toBe(false);
    });
  });
});
