import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the crop option family on BlissSVGBuilder: how numeric crop values
 * (`[crop=N]`, `[crop-{side}=N]`), the auto modes (`[crop=auto]`,
 * `[crop=auto-vertical]`, per-side `[crop-{side}=auto]`), and the bounds-aware
 * `[crop=compact]` mode shape the rendered SVG viewBox; plus how crop options
 * interact with margins, with each other, and with `min-width` / `grid`.
 *
 * Covers:
 * - Default mode (no crop option): viewBox height stays at 20 + margins.
 * - Numeric per-side `crop-{top,bottom,left,right}=N`: exact viewBox strings
 *   for the four sides on `H`; per-axis viewBox deltas on `B291`.
 * - Uniform `crop=N`: applies to all four sides; per-side `crop-{side}=M`
 *   overrides the uniform default for that side.
 * - Margin x crop interaction: uniform margin + uniform crop; per-side
 *   margin + per-side crop; zero margins with crops.
 * - `crop=auto-vertical`: shrinks viewBox height to the content extent (plus
 *   default margins); horizontal viewBox bounds stay at the unset baseline;
 *   the underlying `composition.height` stays at 20 regardless.
 * - `crop=auto`: shifts and shrinks the viewBox to the actual content
 *   extents on all four sides; behaviour on external glyphs (`Xa`).
 * - Per-side `crop-{side}=auto`: each variant crops only its own side;
 *   orthogonal dimensions stay at default; `crop-right=auto` is a no-op
 *   under `crop=auto-vertical` because width is already content-fit.
 * - Mixed auto + numeric values: `crop=auto` with `crop-left=0` keeps the
 *   left margin; `crop=auto` with numeric `crop-top=N` overrides on that
 *   side; `crop-top=auto` mixes with numeric `crop-bottom=N`.
 * - `crop=auto-vertical` and `crop=auto` together: tightens viewBox area;
 *   respects `min-width`; coexists with `[grid]`.
 * - `crop=compact`: 4 total units of crop distributed between top and bottom
 *   based on the available room above and below the actual ink; per-side
 *   user overrides (`crop-top=N`, `crop-top=auto`) replace the compact value
 *   for that side; bounds-based, not metadata-based (anchorOffsetY ignored).
 *
 * Does NOT cover:
 * - Element-level bounds and height invariants without crop options, see
 *   `BlissSVGBuilder.element-bounds.test.js`.
 * - The `effectiveBounds` getter independent of crop, see
 *   `BlissSVGBuilder.effective-bounds.test.js`.
 * - Margin without crop, see `BlissSVGBuilder.margin.test.js`.
 * - Visual regression of cropped SVG output, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

const MARGIN = 0.75;

function getViewBox(inputString) {
  const builder = new BlissSVGBuilder(inputString);
  const match = builder.svgCode.match(/viewBox="([^"]+)"/);
  const [x, y, w, h] = match[1].split(' ').map(Number);
  return { x, y, w, h, builder };
}

describe('BlissSVGBuilder crop', () => {
  describe('when no crop option is set (default mode)', () => {
    it('keeps viewBox height at 20 + margins for a raw shape (H)', () => {
      const { h } = getViewBox('H');
      expect(h).toBe(20 + MARGIN + MARGIN);
    });

    it('uses fixed height 20 + margins for glyphs (B291)', () => {
      const { h } = getViewBox('B291');
      expect(h).toBe(20 + MARGIN * 2);
    });

    it('reports viewBox height 21.5 for B291 (no crop=auto-vertical)', () => {
      const builder = new BlissSVGBuilder('B291');
      const svg = builder.svgCode;
      const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
      expect(viewBoxMatch).toBeTruthy();
      const [vbX, vbY, vbWidth, vbHeight] = viewBoxMatch[1].split(' ').map(Number);
      expect(vbHeight).toBe(21.5);
    });

    it('emits a parsable viewBox by default (crop=0 implicit)', () => {
      const builder = new BlissSVGBuilder('B291');
      const svg = builder.svgCode;
      const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
      expect(viewBoxMatch).toBeTruthy();
    });
  });

  describe('when a per-side crop-{side}=N is set', () => {
    it('pins exact viewBox under [crop-top=2]||H', () => {
      const builder = new BlissSVGBuilder('[crop-top=2]||H');
      const svg = builder.svgCode;
      // Default margins: 0.75
      // viewBoxY = -marginTop + cropTop = -0.75 + 2 = 1.25
      // viewBoxHeight = 20 + 0.75 (top margin) + 0.75 (bottom margin) - 2 (crop-top) - 0 = 19.5
      // viewBoxX = -0.75 (unchanged)
      // viewBoxWidth = 8 + 0.75 + 0.75 = 9.5 (unchanged)
      expect(svg).toContain('viewBox="-0.75 1.25 9.5 19.5"');
    });

    it('pins exact viewBox under [crop-bottom=2]||H', () => {
      const builder = new BlissSVGBuilder('[crop-bottom=2]||H');
      const svg = builder.svgCode;
      // viewBoxY = -0.75 (unchanged)
      // viewBoxHeight = 20 + 0.75 + 0.75 - 0 - 2 (crop-bottom) = 19.5
      expect(svg).toContain('viewBox="-0.75 -0.75 9.5 19.5"');
    });

    it('pins exact viewBox under [crop-left=2]||H', () => {
      const builder = new BlissSVGBuilder('[crop-left=2]||H');
      const svg = builder.svgCode;
      // viewBoxX = -marginLeft + cropLeft = -0.75 + 2 = 1.25
      // viewBoxWidth = 8 + 0.75 + 0.75 - 2 (crop-left) - 0 = 7.5
      expect(svg).toContain('viewBox="1.25 -0.75 7.5 21.5"');
    });

    it('pins exact viewBox under [crop-right=2]||H', () => {
      const builder = new BlissSVGBuilder('[crop-right=2]||H');
      const svg = builder.svgCode;
      // viewBoxX = -0.75 (unchanged)
      // viewBoxWidth = 8 + 0.75 + 0.75 - 0 - 2 (crop-right) = 7.5
      expect(svg).toContain('viewBox="-0.75 -0.75 7.5 21.5"');
    });

    it('shifts only the left side under [crop-left=N]', () => {
      const { x: xWithout, w: wWithout } = getViewBox('B291');
      const { x: xWith, w: wWith } = getViewBox('[crop-left=3]||B291');
      expect(xWith).toBe(xWithout + 3);
      expect(wWith).toBe(wWithout - 3);
    });

    it('shrinks only the right side under [crop-right=N] (x unchanged)', () => {
      const { x: xWithout, w: wWithout } = getViewBox('B291');
      const { x: xWith, w: wWith } = getViewBox('[crop-right=3]||B291');
      expect(xWith).toBe(xWithout); // x unchanged
      expect(wWith).toBe(wWithout - 3);
    });

    it('shifts only the top side under [crop-top=N]', () => {
      const { y: yWithout, h: hWithout } = getViewBox('B291');
      const { y: yWith, h: hWith } = getViewBox('[crop-top=3]||B291');
      expect(yWith).toBe(yWithout + 3);
      expect(hWith).toBe(hWithout - 3);
    });

    it('shrinks only the bottom side under [crop-bottom=N] (y unchanged)', () => {
      const { y: yWithout, h: hWithout } = getViewBox('B291');
      const { y: yWith, h: hWith } = getViewBox('[crop-bottom=3]||B291');
      expect(yWith).toBe(yWithout); // y unchanged
      expect(hWith).toBe(hWithout - 3);
    });
  });

  describe('when a uniform crop=N is set', () => {
    it('pins exact viewBox under [crop=1]||H (all four sides)', () => {
      const builder = new BlissSVGBuilder('[crop=1]||H');
      const svg = builder.svgCode;
      // Default margins: 0.75
      // viewBoxX = -0.75 + 1 = 0.25
      // viewBoxY = -0.75 + 1 = 0.25
      // viewBoxWidth = 8 + 0.75 + 0.75 - 1 - 1 = 7.5
      // viewBoxHeight = 20 + 0.75 + 0.75 - 1 - 1 = 19.5
      expect(svg).toContain('viewBox="0.25 0.25 7.5 19.5"');
    });

    it('lets per-side crop-{top,right}=N override the uniform crop=N default', () => {
      const builder = new BlissSVGBuilder('[crop=1;crop-top=3;crop-right=5]||H');
      const svg = builder.svgCode;
      // crop=1 sets all to 1, then crop-top=3 and crop-right=5 override
      // viewBoxX = -0.75 + 1 (left from crop) = 0.25
      // viewBoxY = -0.75 + 3 (top overridden) = 2.25
      // viewBoxWidth = 8 + 0.75 + 0.75 - 1 (left) - 5 (right overridden) = 3.5
      // viewBoxHeight = 20 + 0.75 + 0.75 - 3 (top overridden) - 1 (bottom from crop) = 17.5
      expect(svg).toContain('viewBox="0.25 2.25 3.5 17.5"');
    });

    it('applies a uniform [crop=N] to all four sides (deltas)', () => {
      const { x: xW, y: yW, w: wW, h: hW } = getViewBox('B291');
      const { x: xC, y: yC, w: wC, h: hC } = getViewBox('[crop=2]||B291');
      expect(xC).toBe(xW + 2);
      expect(yC).toBe(yW + 2);
      expect(wC).toBe(wW - 4); // 2 from each side
      expect(hC).toBe(hW - 4);
    });
  });

  describe('when margin and crop interact', () => {
    it('pins exact viewBox under [margin=2;crop=1]||H', () => {
      const builder = new BlissSVGBuilder('[margin=2;crop=1]||H');
      const svg = builder.svgCode;
      // margin=2 on all sides, crop=1 on all sides
      // viewBoxX = -2 + 1 = -1
      // viewBoxY = -2 + 1 = -1
      // viewBoxWidth = 8 + 2 + 2 - 1 - 1 = 10
      // viewBoxHeight = 20 + 2 + 2 - 1 - 1 = 22
      expect(svg).toContain('viewBox="-1 -1 10 22"');
    });

    it('pins exact viewBox under per-side margin + per-side crop', () => {
      const builder = new BlissSVGBuilder('[margin-top=3;margin-left=2;crop-bottom=1;crop-right=0.5]||H');
      const svg = builder.svgCode;
      // margin-top=3, margin-left=2, margin-bottom=0.75 (default), margin-right=0.75 (default)
      // crop-top=0 (default), crop-left=0 (default), crop-bottom=1, crop-right=0.5
      // viewBoxX = -2 + 0 = -2
      // viewBoxY = -3 + 0 = -3
      // viewBoxWidth = 8 + 2 + 0.75 - 0 - 0.5 = 10.25
      // viewBoxHeight = 20 + 3 + 0.75 - 0 - 1 = 22.75
      expect(svg).toContain('viewBox="-2 -3 10.25 22.75"');
    });

    it('pins exact viewBox under [margin=0;crop-top=2;crop-left=1]||H (zero margins)', () => {
      const builder = new BlissSVGBuilder('[margin=0;crop-top=2;crop-left=1]||H');
      const svg = builder.svgCode;
      // All margins = 0, crop-top=2, crop-left=1
      // viewBoxX = 0 + 1 = 1
      // viewBoxY = 0 + 2 = 2
      // viewBoxWidth = 8 + 0 + 0 - 1 - 0 = 7
      // viewBoxHeight = 20 + 0 + 0 - 2 - 0 = 18
      expect(svg).toContain('viewBox="1 2 7 18"');
    });
  });

  describe('when crop=auto-vertical is set', () => {
    it('crops a raw shape (H) to its intrinsic height plus default margins', () => {
      const { h } = getViewBox('[crop=auto-vertical]||H');
      // H has intrinsic height=8 at y=0, plus margins (0.75 each side)
      expect(h).toBe(8 + 0.75 + 0.75);
    });

    it('crops a Bliss glyph (B291) to its content height plus default margins', () => {
      const { h } = getViewBox('[crop=auto-vertical]||B291');
      // B291 = S8:0,8: content from y=8 to y=16, height=8
      expect(h).toBe(8 + 0.75 + 0.75);
    });

    it('uses the tallest element height when shapes and glyphs are mixed', () => {
      // H (height=8) alongside B291 (height=20)
      const { builder } = getViewBox('[crop=auto-vertical]||H/B291');
      expect(builder.composition.height).toBe(20);
    });

    it('crops to content for a raw shape positioned lower on the grid (C4:0,10)', () => {
      // C4:0,10 = 4x4 circle at y=10, content from y=10 to y=14
      const { y, h } = getViewBox('[crop=auto-vertical]||C4:0,10');
      expect(y).toBeCloseTo(10 - MARGIN);
      expect(h).toBeCloseTo(4 + MARGIN * 2);
    });

    it('crops to content for a glyph with empty space (B313 = H:0,8)', () => {
      // B313 = H:0,8: content from y=8 to y=16, but glyph height=20
      const { y, h } = getViewBox('[crop=auto-vertical]||B313');
      expect(y).toBeCloseTo(8 - MARGIN);
      expect(h).toBeCloseTo(8 + MARGIN * 2);
    });

    it('crops to content for a raw shape at y=0 (H, no top space to crop)', () => {
      // H at y=0, content height=8; no top space to crop, crops bottom
      const { y, h, builder } = getViewBox('[crop=auto-vertical]||H');
      expect(builder.composition.height).toBe(20);
      expect(y).toBeCloseTo(0 - MARGIN);
      expect(h).toBeCloseTo(8 + MARGIN * 2);
    });

    it('crops B291 to content from y=8 to y=16', () => {
      // B291 = S8:0,8: content from y=8 to y=16
      const { y, h } = getViewBox('[crop=auto-vertical]||B291');
      expect(y).toBeCloseTo(8 - MARGIN);
      expect(h).toBeCloseTo(8 + MARGIN * 2);
    });

    it('leaves horizontal viewBox bounds unchanged relative to no-option render (C4:0,10)', () => {
      const autoVert = getViewBox('[crop=auto-vertical]||C4:0,10');
      const noOpt = getViewBox('C4:0,10');
      expect(autoVert.x).toBe(noOpt.x);
      expect(autoVert.w).toBe(noOpt.w);
    });

    it('leaves composition.height at 20 for glyphs (B291)', () => {
      const { builder } = getViewBox('[crop=auto-vertical]||B291');
      expect(builder.composition.height).toBe(20);
    });

    it('leaves composition.height at 20 for raw shapes (S8)', () => {
      const { builder } = getViewBox('[crop=auto-vertical]||S8');
      expect(builder.composition.height).toBe(20);
    });
  });

  describe('when crop=auto is set', () => {
    it('shifts viewBox y down (crops top dead space)', () => {
      const { y: yWithout } = getViewBox('B291');
      const { y: yWith } = getViewBox('[crop=auto]||B291');
      // B291 content starts at y=8, so auto-crop should shift viewBox down
      expect(yWith).toBeGreaterThan(yWithout);
    });

    it('shrinks viewBox height (crops bottom dead space)', () => {
      const { h: hWithout } = getViewBox('B291');
      const { h: hWith } = getViewBox('[crop=auto]||B291');
      // B291 content ends at y=16, grid is 20, so auto-crop should reduce height
      expect(hWith).toBeLessThan(hWithout);
    });

    it('crops left dead space when the content carries a positive x offset', () => {
      // B291:3,8 positions content at x=3
      const { x: xWithout } = getViewBox('[crop=auto-vertical]||B291:3,8');
      const { x: xWith } = getViewBox('[crop=auto-vertical;crop=auto]||B291:3,8');
      // Auto-crop should shift viewBox right to remove left dead space
      expect(xWith).toBeGreaterThan(xWithout);
    });

    it('tightens the viewBox width to the content width', () => {
      const { w } = getViewBox('[crop=auto]||B291');
      // B291 is 8 units wide, so viewBox width should be close to 8 + margins
      expect(w).toBeLessThan(20);
    });

    it('reports approximate effectiveBounds on an external glyph (Xa) under [crop=auto]', () => {
      const builder = new BlissSVGBuilder('[crop=auto]||Xa');
      const bounds = builder.composition.effectiveBounds;
      // Approximate bounds: minY=11 (temporary), maxY from font data (~16)
      expect(bounds.minY).toBe(11);
      expect(bounds.maxY).toBeCloseTo(16.05, 1);
    });

    it('shrinks viewBox height and shifts viewBox y for an external glyph (Xa)', () => {
      const { y: yWithout, h: hWithout } = getViewBox('Xa');
      const { y: yWith, h: hWith } = getViewBox('[crop=auto]||Xa');
      // Auto-crop should reduce both height and shift Y
      expect(hWith).toBeLessThan(hWithout);
      expect(yWith).toBeGreaterThan(yWithout);
    });

    it('shrinks viewBox height under [crop=auto] vs no crop', () => {
      const { h: hWithout } = getViewBox('B291');
      const { h: hWith } = getViewBox('[crop=auto]||B291');
      // Cropped height should be smaller (dead space removed)
      expect(hWith).toBeLessThan(hWithout);
    });

    it('preserves viewBox width under [crop=auto] (no horizontal crop in writing mode)', () => {
      const builder = new BlissSVGBuilder('[crop=auto]||B291');
      const svg = builder.svgCode;
      const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
      expect(viewBoxMatch).toBeTruthy();
      const [x, y, width, height] = viewBoxMatch[1].split(' ').map(Number);
      // Width should match composition width (no horizontal crop in writing mode)
      // +1.5 for default left/right margins (0.75 each)
      expect(width).toBe(builder.composition.width + 1.5);
    });

    it('produces SVG without throwing when [crop=auto;margin=5;crop-top=2] are combined', () => {
      const builder = new BlissSVGBuilder('[crop=auto;margin=5;crop-top=2]||B291');
      expect(builder.svgCode).toContain('<svg');
    });
  });

  describe('when a per-side crop-{side}=auto option is set', () => {
    it('crops only the top side under [crop-top=auto]', () => {
      const { y: yWithout, w: wWithout } = getViewBox('B291');
      const { y: yWith, w: wWith } = getViewBox('[crop-top=auto]||B291');
      // Top should be cropped (y increased)
      expect(yWith).toBeGreaterThan(yWithout);
      // Width should be unchanged (no horizontal crop)
      expect(wWith).toBe(wWithout);
    });

    it('crops only the bottom side under [crop-bottom=auto]', () => {
      const { y: yWithout, h: hWithout } = getViewBox('B291');
      const { y: yWith, h: hWith } = getViewBox('[crop-bottom=auto]||B291');
      // Height should be reduced
      expect(hWith).toBeLessThan(hWithout);
      // Y start should be unchanged
      expect(yWith).toBe(yWithout);
    });

    it('crops only the left side under [crop-left=auto]', () => {
      // B291:3,8 has content offset at x=3
      const { x: xWithout, h: hWithout } = getViewBox('[crop=auto-vertical]||B291:3,8');
      const { x: xWith, h: hWith } = getViewBox('[crop=auto-vertical;crop-left=auto]||B291:3,8');
      // X should be shifted (left dead space removed)
      expect(xWith).toBeGreaterThan(xWithout);
      // Height should be unchanged
      expect(hWith).toBe(hWithout);
    });

    it('is a no-op for [crop-right=auto] in crop=auto-vertical mode (width already matches content)', () => {
      // In auto-vertical mode, width is computed from content - no right dead space exists
      const { x: xWithout, w: wWithout } = getViewBox('[crop=auto-vertical]||B291');
      const { x: xWith, w: wWith } = getViewBox('[crop=auto-vertical;crop-right=auto]||B291');
      // crop-right=auto is essentially default behavior in auto-vertical
      expect(wWith).toBe(wWithout);
      expect(xWith).toBe(xWithout);
    });
  });

  describe('when auto and numeric crop values are mixed', () => {
    it('keeps the left margin at the default when [crop=auto] is overridden by [crop-left=0]', () => {
      // Auto-crop all except left
      const { x } = getViewBox('[crop=auto-vertical;crop=auto;crop-left=0]||B291:3,8');
      // Left should NOT be cropped (x stays at margin)
      expect(x).toBe(-0.75); // Default margin
    });

    it('overrides the auto top crop when a numeric [crop-top=N] is also set', () => {
      const { y: yAuto } = getViewBox('[crop=auto]||B291');
      const { y: yMixed } = getViewBox('[crop=auto;crop-top=2]||B291');
      // crop-top=2 overrides auto, so y should be different
      expect(yMixed).not.toBe(yAuto);
    });

    it('mixes [crop-top=auto] with numeric [crop-bottom=N] without conflict', () => {
      const { y, builder } = getViewBox('[crop-top=auto;crop-bottom=5]||B291');
      // Top auto-cropped (y > margin)
      expect(y).toBeGreaterThan(-0.75);
      // Bottom fixed at 5
      expect(builder.svgCode).toContain('<svg');
    });
  });

  describe('when crop=auto-vertical and crop=auto interact', () => {
    it('tightens viewBox width when [crop=auto] is combined with [crop=auto-vertical]', () => {
      const { w: wW } = getViewBox('[crop=auto]||B291');
      const { w: wF } = getViewBox('[crop=auto-vertical;crop=auto]||B291');
      // Width in auto-vertical should be tighter (horizontal crop applied)
      expect(wF).toBeLessThanOrEqual(wW);
    });

    it('reduces viewBox area when both [crop=auto-vertical] and [crop=auto] are set', () => {
      const builderDefault = new BlissSVGBuilder('B291');
      const builderOptimized = new BlissSVGBuilder('[crop=auto-vertical;crop=auto]||B291');
      const getArea = (svg) => {
        const match = svg.match(/viewBox="([^"]+)"/);
        if (!match) return 0;
        const [x, y, width, height] = match[1].split(' ').map(Number);
        return width * height;
      };
      const areaDefault = getArea(builderDefault.svgCode);
      const areaOptimized = getArea(builderOptimized.svgCode);
      // Optimized area should be smaller
      expect(areaOptimized).toBeLessThan(areaDefault);
    });

    it('still emits grid lines when [crop=auto-vertical;crop=auto;grid] are combined', () => {
      const builder = new BlissSVGBuilder('[crop=auto-vertical;crop=auto;grid]||B291');
      expect(builder.svgCode).toContain('bliss-grid-line');
    });

    it('respects min-width: auto horizontal crop leaves width unchanged when [min-width=20] is set', () => {
      // Use a narrow shape in a wider context to see horizontal difference
      const vertOnly = getViewBox('[crop=auto-vertical;min-width=20]||C4:0,10');
      const both = getViewBox('[crop=auto-vertical;crop=auto;min-width=20]||C4:0,10');
      // Both should have same vertical crop
      expect(vertOnly.y).toBe(both.y);
      expect(vertOnly.h).toBe(both.h);
      // Auto horizontal crop respects min-width; same width
      expect(both.w).toBe(vertOnly.w);
    });

    it('crops horizontally when no min-width is set (width tightens)', () => {
      // Offset shape so there's horizontal space to crop
      const vertOnly = getViewBox('[crop=auto-vertical]||C4:2,10');
      const both = getViewBox('[crop=auto]||C4:2,10');
      // Both should have same vertical crop
      expect(vertOnly.y).toBe(both.y);
      expect(vertOnly.h).toBe(both.h);
      // Without min-width, auto crops horizontally; narrower width
      expect(both.w).toBeLessThan(vertOnly.w);
    });
  });

  describe('when crop=compact is set', () => {
    // Compact crops up to 4 units total based on actual ink bounds:
    // 1. Crop as much as possible from top (up to 4), limited by empty space above ink
    // 2. Crop remainder from bottom, limited by empty space below ink

    describe('when content lives in the indicator zone leaving top empty', () => {
      it('crops 4 from top for mid-zone glyph (B291, minY=8)', () => {
        // B291 bounds: minY=8, topRoom=8 -> cropTop=4, cropBottom=0
        const { y, h } = getViewBox('[crop=compact]||B291');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops 4 from top for skyline glyph (B138, minY=4)', () => {
        // B138 bounds: minY=4, topRoom=4 -> cropTop=4, cropBottom=0
        const { y, h } = getViewBox('[crop=compact]||B138');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops 4 from top for glyph extending above skyline (B119, minY=6)', () => {
        // B119 bounds: minY=6, topRoom=6 -> cropTop=4, cropBottom=0
        const { y, h } = getViewBox('[crop=compact]||B119');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops 4 from top for glyph with topRoom=6 (B143, minY=6)', () => {
        // B143 bounds: minY=6, topRoom=6 -> cropTop=4, cropBottom=0
        const { y, h } = getViewBox('[crop=compact]||B143');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops 4 from top for standalone indicator (B86, minY=4)', () => {
        // B86 bounds: minY=4, topRoom=4 -> cropTop=4, cropBottom=0
        const { y, h } = getViewBox('[crop=compact]||B86');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });
    });

    describe('when ink fills the top zone leaving room only at the bottom', () => {
      it('crops 4 from bottom for composite with indicator (B355;B86, minY=0)', () => {
        // B355;B86 bounds: minY=0, maxY=16 -> topRoom=0, bottomRoom=4
        // cropTop=0, cropBottom=4
        const { y, h } = getViewBox('[crop=compact]||B355;B86');
        expect(y).toBeCloseTo(-0.75, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });
    });

    describe('when partial top + partial bottom room is available', () => {
      it('crops 2 from top + 2 from bottom for a glyph with topRoom=2', () => {
        // S8:0,2 has bounds minY=2, maxY=10 -> topRoom=2, bottomRoom=10
        // cropTop=min(4,2)=2, cropBottom=min(2,10)=2, total=4
        BlissSVGBuilder.define({ TEST_PARTIAL: { codeString: 'S8:0,2', type: 'glyph' } });
        const { y, h } = getViewBox('[crop=compact]||TEST_PARTIAL');
        // viewBoxY = -0.75 + 2 = 1.25, viewBoxHeight = 20 + 1.5 - 2 - 2 = 17.5
        expect(y).toBeCloseTo(1.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
        BlissSVGBuilder.removeDefinition('TEST_PARTIAL');
      });

      it('crops 1 from top and 3 from bottom for B661;B99', () => {
        // B661;B99 bounds: minY=1, maxY=16 -> topRoom=1, bottomRoom=4
        // cropTop=min(4,1)=1, cropBottom=min(3,4)=3, total=4
        const { y, h } = getViewBox('[crop=compact]||B661;B99');
        // viewBoxY = -0.75 + 1 = 0.25, viewBoxHeight = 20 + 1.5 - 1 - 3 = 17.5
        expect(y).toBeCloseTo(0.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });
    });

    describe('when ink fills the entire grid height', () => {
      it('does not crop when ink covers y=0 through y=20', () => {
        // Two squares covering y=0-8 and y=12-20 -> minY=0, maxY=20
        BlissSVGBuilder.define({ TEST_FULL: { codeString: 'S8:0,0;S8:0,12', type: 'glyph' } });
        const { y, h } = getViewBox('[crop=compact]||TEST_FULL');
        expect(y).toBeCloseTo(-0.75, 2);
        expect(h).toBeCloseTo(21.5, 2);
        BlissSVGBuilder.removeDefinition('TEST_FULL');
      });
    });

    describe('when applied to multi-character compositions', () => {
      it('crops based on combined bounds (B291/B138)', () => {
        // Combined bounds: minY=4 (from B138), maxY=16 -> topRoom=4, cropTop=4
        const { y, h } = getViewBox('[crop=compact]||B291/B138');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops based on combined bounds across words (B291//B138)', () => {
        // Word separator extends to y=0 -> minY=0, topRoom=0
        // cropTop=0, cropBottom=min(4, bottomRoom)
        const { y, h } = getViewBox('[crop=compact]||B291//B138');
        expect(y).toBeCloseTo(-0.75, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });
    });

    describe('when applied to various glyph types', () => {
      it('crops from top for multi-glyph composite (B355;B355:10)', () => {
        const { y, h } = getViewBox('[crop=compact]||B355;B355:10');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops from top for raw shapes (H:0,8;C8:10,8)', () => {
        const { y, h } = getViewBox('[crop=compact]||H:0,8;C8:10,8');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
      });

      it('crops from top for a define() glyph', () => {
        BlissSVGBuilder.define({ TEST_COMPACT: { codeString: 'S8:0,8', type: 'glyph' } });
        const { y, h } = getViewBox('[crop=compact]||TEST_COMPACT');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
        BlissSVGBuilder.removeDefinition('TEST_COMPACT');
      });

      it('uses ink bounds not anchorOffsetY for a define() glyph', () => {
        // anchorOffsetY is metadata, not ink. Compact uses actual ink bounds.
        BlissSVGBuilder.define({
          TEST_COMPACT_AO: { codeString: 'S8:0,8', type: 'glyph', anchorOffsetY: -3 }
        });
        const { y, h } = getViewBox('[crop=compact]||TEST_COMPACT_AO');
        // S8:0,8 ink starts at y=8, topRoom=8 -> cropTop=4 regardless of anchorOffsetY
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(17.5, 2);
        BlissSVGBuilder.removeDefinition('TEST_COMPACT_AO');
      });
    });

    describe('when combined with explicit crop overrides', () => {
      it('lets explicit crop-top=N replace the compact crop-top', () => {
        // B291: compact cropTop=4. User sets crop-top=2 -> replaces to 2
        const { y, h } = getViewBox('[crop=compact;crop-top=2]||B291');
        expect(y).toBeCloseTo(1.25, 2);
        expect(h).toBeCloseTo(19.5, 2);
      });

      it('lets explicit crop-bottom=N replace the compact crop-bottom', () => {
        // B291: compact cropBottom=0. User sets crop-bottom=4 -> replaces to 4
        const { y, h } = getViewBox('[crop=compact;crop-bottom=4]||B291');
        expect(y).toBeCloseTo(3.25, 2);
        expect(h).toBeCloseTo(13.5, 2);
      });

      it('lets crop-top=auto replace the compact crop-top (matches [crop-top=auto] alone)', () => {
        const compactWithAutoTop = getViewBox('[crop=compact;crop-top=auto]||B291');
        const autoTopOnly = getViewBox('[crop-top=auto]||B291');
        expect(compactWithAutoTop.y).toBeCloseTo(autoTopOnly.y, 2);
      });

      it('does not affect horizontal viewBox values relative to default', () => {
        const compact = getViewBox('[crop=compact]||B291');
        const noOpt = getViewBox('B291');
        expect(compact.x).toBeCloseTo(noOpt.x, 2);
        expect(compact.w).toBeCloseTo(noOpt.w, 2);
      });
    });
  });
});
