import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the margin option family on BlissSVGBuilder: how `[margin=N]` (bulk),
 * `[margin-{top,bottom,left,right}=N]` (per-side), and the cascade between
 * the bulk default and per-side overrides influence the rendered SVG
 * viewBox.
 *
 * Covers:
 * - `margin=N` (bulk): all four sides become N; viewBox x/y shift by -N,
 *   width and height grow by 2N.
 * - Default `margin=0.75` when no margin option is set.
 * - Per-side `margin-{top,bottom,left,right}=N`: each side shifts/grows
 *   viewBox independently; orthogonal sides keep the default 0.75.
 * - Cascade: explicit `margin-top` / `margin-right` override the bulk
 *   `margin` default (CSS-shorthand semantics, per the Universal Options
 *   Principle).
 *
 * Does NOT cover:
 * - Margin + crop viewBox math, see `BlissSVGBuilder.crop.test.js`
 *   (the bulk/per-side cascade is the same; that file pins the crop side).
 * - Margin behavior under `crop=auto*` modes, see
 *   `BlissSVGBuilder.crop.test.js`.
 * - Margin's effect on `element-bounds` or `effective-bounds`, see
 *   `BlissSVGBuilder.element-bounds.test.js` and
 *   `BlissSVGBuilder.effective-bounds.test.js`.
 * - Margin combined with grid / stroke-width in a multi-option scenario,
 *   see those option files.
 */
describe('BlissSVGBuilder margin', () => {
  describe('when margin is set as a bulk option', () => {
    it('applies the value to all four sides (viewBox grows by 2N, shifts by -N)', () => {
      const builder = new BlissSVGBuilder('[margin=2]||H');
      const svg = builder.svgCode;

      // H intrinsic width=8, height=20. With margin=2 on all sides:
      // viewBoxX = -2, viewBoxY = -2
      // viewBoxWidth = 8 + 2 + 2 = 12, viewBoxHeight = 20 + 2 + 2 = 24
      expect(svg).toContain('viewBox="-2 -2 12 24"');
    });

    it('uses 0.75 on every side when no margin option is set', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      // Default margins: 0.75 on each side.
      // viewBoxX/Y = -0.75; viewBoxWidth = 8 + 0.75 + 0.75 = 9.5;
      // viewBoxHeight = 20 + 0.75 + 0.75 = 21.5.
      expect(svg).toContain('viewBox="-0.75 -0.75 9.5 21.5"');
    });
  });

  describe('when individual margin sides are set', () => {
    it('shifts only the top side under margin-top, leaving other sides at 0.75', () => {
      const builder = new BlissSVGBuilder('[margin-top=3]||H');
      const svg = builder.svgCode;

      // viewBoxY = -3 (top overridden); height grows: 20 + 3 + 0.75 = 23.75.
      // X and width keep the 0.75 default on left/right.
      expect(svg).toContain('viewBox="-0.75 -3 9.5 23.75"');
    });

    it('grows only the bottom under margin-bottom, leaving other sides at 0.75', () => {
      const builder = new BlissSVGBuilder('[margin-bottom=3]||H');
      const svg = builder.svgCode;

      // viewBoxY stays at -0.75 (top default); height: 20 + 0.75 + 3 = 23.75.
      expect(svg).toContain('viewBox="-0.75 -0.75 9.5 23.75"');
    });

    it('shifts only the left side under margin-left, leaving other sides at 0.75', () => {
      const builder = new BlissSVGBuilder('[margin-left=3]||H');
      const svg = builder.svgCode;

      // viewBoxX = -3; width: 8 + 3 + 0.75 = 11.75.
      expect(svg).toContain('viewBox="-3 -0.75 11.75 21.5"');
    });

    it('grows only the right side under margin-right, leaving other sides at 0.75', () => {
      const builder = new BlissSVGBuilder('[margin-right=3]||H');
      const svg = builder.svgCode;

      // viewBoxX stays at -0.75 (left default); width: 8 + 0.75 + 3 = 11.75.
      expect(svg).toContain('viewBox="-0.75 -0.75 11.75 21.5"');
    });

    it('lets per-side options override the bulk margin value (CSS-shorthand cascade)', () => {
      const builder = new BlissSVGBuilder('[margin=2;margin-top=5;margin-right=10]||H');
      const svg = builder.svgCode;

      // margin=2 sets the default for all sides; margin-top=5 and
      // margin-right=10 override their sides; bottom/left stay at 2.
      // viewBoxX = -2, viewBoxY = -5;
      // viewBoxWidth = 8 + 2 (left) + 10 (right) = 20;
      // viewBoxHeight = 20 + 5 (top) + 2 (bottom) = 27.
      expect(svg).toContain('viewBox="-2 -5 20 27"');
    });
  });
});
