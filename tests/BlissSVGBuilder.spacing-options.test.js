import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how the spacing/layout option family on BlissSVGBuilder shapes
 * inter-character spacing (`char-space`), composition expansion to a
 * minimum width (`min-width`), centering of that expanded space
 * (`center`), grid alignment under centered expansion, inline `:x,y`
 * coordinate syntax on parts, and explicit kerning markers
 * (`RK:`/`AK:`) on parsed-tree x positioning.
 *
 * Covers:
 * - `char-space=N` (default 2, clamp range [0, 10]) and its effect on
 *   `composition.children[].x` and total composition width.
 * - `min-width=N` left-aligned expansion of the viewBox; interaction
 *   with `margin`, `crop`, and `grid`; clamping of negative values.
 * - `min-width=N` with `[center]`: symmetric expansion around content
 *   baseWidth, padded by the larger of left/right indicator overhang
 *   (`Math.max`), and interaction with `margin`, `crop`, and `grid`.
 * - Grid offset shift to follow the centered viewBox under
 *   `[grid;min-width=N;center]`.
 * - Inline `:x,y` coordinate syntax on parts within characters and
 *   the resulting part-level x/y plus character-width expansion.
 * - `RK:N` (relative kerning) and `AK:N` (absolute kerning)
 *   parsed-tree x positioning.
 *
 * Does NOT cover:
 * - `word-space` and automatic punctuation-spacing derivation,
 *   see `BlissSVGBuilder.spacing.test.js`.
 * - TSP/QSP space-glyph advance-width formulas, see
 *   `BlissSVGBuilder.space-glyphs.test.js`.
 * - Composition-children grouping for empty or space-only inputs,
 *   see `BlissSVGBuilder.space-grouping.test.js`.
 * - Parser-side `RK:`/`AK:` grammar acceptance, see
 *   `BlissParser.kerning.test.js`.
 * - Rendered-position kerning (SVG transform/x attributes under
 *   `RK:`/`AK:`); no rendered-position test for kerning exists yet
 *   (backlog), tracked from `BlissSVGBuilder.spacing.test.js` header.
 * - Inline `:x,y` parser grammar (bracket-option form, validation,
 *   error cases), see `BlissParser.coordinate-options.test.js` and
 *   `BlissSVGBuilder.coordinate-syntax.test.js`.
 * - Margin option family, see `BlissSVGBuilder.margin.test.js`.
 * - Crop option family, see `BlissSVGBuilder.crop.test.js`.
 * - Grid option family on its own, see `BlissSVGBuilder.grid.test.js`.
 */
describe('BlissSVGBuilder spacing options', () => {
  // Build, render, and extract viewBox numbers + the builder.
  const getViewBox = (input) => {
    const builder = new BlissSVGBuilder(input);
    const svg = builder.svgCode;
    const m = svg.match(/viewBox="([^"]+)"/);
    const [x, y, w, h] = m[1].split(' ').map(Number);
    return { x, y, w, h, svg, builder };
  };

  describe('when char-space sets inter-character spacing within a word', () => {
    it('uses default spacing of 2 when no char-space option specified', () => {
      // Three Bliss characters in one word: default char-space=2
      // B313 contains H shape (width=8), B1 (punctuation, width=0), B4 (punctuation, width=0)
      const builder = new BlissSVGBuilder('B313/B1/B4');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B313
      const char2 = word.children[1]; // B1
      const char3 = word.children[2]; // B4

      // B313 width = 8, B1 width = 0, B4 width = 0
      // With default spacing=2: B313(0), B1(10), B4(12)
      expect(char1.x).toBe(0);
      expect(char2.x).toBe(10); // B313 width (8) + default spacing (2)
      expect(char3.x).toBe(12); // B1 x (10) + B1 width (0) + spacing (2)
    });

    it('sets spacing to 0 when char-space=0', () => {
      const builder = new BlissSVGBuilder('[char-space=0]||B313/B1/B4');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B313
      const char2 = word.children[1]; // B1
      const char3 = word.children[2]; // B4

      // With char-space=0, characters should be touching
      expect(char1.x).toBe(0);
      expect(char2.x).toBe(8); // B313 width (8) + 0 spacing
      expect(char3.x).toBe(8); // B1 x (8) + B1 width (0) + 0 spacing
    });

    it('sets wide spacing when char-space=10', () => {
      const builder = new BlissSVGBuilder('[char-space=10]||B313/B1/B4');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B313
      const char2 = word.children[1]; // B1

      // With char-space=10, characters should be far apart
      expect(char1.x).toBe(0);
      expect(char2.x).toBe(18); // B313 width (8) + spacing (10)
    });

    it('clamps char-space values below 0 to 0', () => {
      const builder = new BlissSVGBuilder('[char-space=-5]||B313/B1');

      const comp = builder.composition;
      const word = comp.children[0];
      const char2 = word.children[1]; // B1

      expect(char2.x).toBe(8); // B313 width (8) + clamped spacing (0)
    });

    it('clamps char-space values above 10 to 10', () => {
      const builder = new BlissSVGBuilder('[char-space=99]||B313/B1');

      const comp = builder.composition;
      const word = comp.children[0];
      const char2 = word.children[1]; // B1

      expect(char2.x).toBe(18); // B313 width (8) + clamped spacing (10)
    });

    it('affects total width of multiple characters', () => {
      // Three B313 characters with different spacing
      const defaultBuilder = new BlissSVGBuilder('B313/B313/B313');
      const wideBuilder = new BlissSVGBuilder('[char-space=5]||B313/B313/B313');
      const narrowBuilder = new BlissSVGBuilder('[char-space=0]||B313/B313/B313');

      // B313 width = 8, so with 3 B313's:
      // Default (char-space=2): 8 + 2 + 8 + 2 + 8 = 28
      // Wide (char-space=5): 8 + 5 + 8 + 5 + 8 = 34
      // Narrow (char-space=0): 8 + 0 + 8 + 0 + 8 = 24
      expect(defaultBuilder.composition.width).toBe(28);
      expect(wideBuilder.composition.width).toBe(34);
      expect(narrowBuilder.composition.width).toBe(24);
    });

    it('does not affect single character width', () => {
      const defaultBuilder = new BlissSVGBuilder('B313');
      const spacedBuilder = new BlissSVGBuilder('[char-space=10]||B313');

      // Single B313 should be 8 wide regardless of spacing
      expect(defaultBuilder.composition.width).toBe(8);
      expect(spacedBuilder.composition.width).toBe(8);
    });
  });

  describe('when min-width expands content without centering', () => {
    it('has no effect when min-width=0', () => {
      const builder = new BlissSVGBuilder('[min-width=0]||H');
      const builderNoMinWidth = new BlissSVGBuilder('H');

      // Both should have same composition width
      expect(builder.composition.width).toBe(builderNoMinWidth.composition.width);
      expect(builder.composition.width).toBe(8);
    });

    it('expands narrow content to min-width (left-aligned)', () => {
      const { x, w, builder } = getViewBox('[min-width=20]||H');

      expect(builder.composition.width).toBe(8);
      expect(w).toBeCloseTo(20 + 0.75 + 0.75);
      expect(x).toBeCloseTo(-0.75);
    });

    it('does not affect wide content when content > min-width', () => {
      const builder = new BlissSVGBuilder('[min-width=5]||B313/B313/B313');
      const builderNoMinWidth = new BlissSVGBuilder('B313/B313/B313');

      expect(builder.composition.width).toBe(28);
      expect(builderNoMinWidth.composition.width).toBe(28);
    });

    it('applies min-width before margin is added', () => {
      const { x, w } = getViewBox('[min-width=20;margin=5]||H');

      expect(w).toBeCloseTo(20 + 5 + 5);
      expect(x).toBeCloseTo(-5);
    });

    it('applies min-width before crop adjustments', () => {
      const { x, w } = getViewBox('[min-width=20;crop=2]||H');

      expect(w).toBeCloseTo(20 + 0.75 + 0.75 - 2 - 2);
      expect(x).toBeCloseTo(-0.75 + 2);
    });

    it('extends grid to min-width when grid is enabled', () => {
      const { svg } = getViewBox('[grid;min-width=20]||H');

      expect(svg).toContain('M0,8h20');
      expect(svg).toContain('M0,16h20');
    });

    it('clamps negative min-width to 0', () => {
      // Negative min-width clamps to 0 (no min-width effect, same as bare 'H')
      const builder = new BlissSVGBuilder('[min-width=-10]||H');
      const builderNoMinWidth = new BlissSVGBuilder('H');

      expect(builder.composition.width).toBe(builderNoMinWidth.composition.width);
      expect(builder.composition.width).toBe(8);
      expect(builder.svgCode).toBe(builderNoMinWidth.svgCode);
    });

    it('expands multiple characters to min-width', () => {
      const builder = new BlissSVGBuilder('[min-width=30]||B313/B313');

      expect(builder.composition.width).toBe(18);
    });

    it('works with very large min-width values', () => {
      const { w, builder } = getViewBox('[min-width=100]||H');

      expect(builder.composition.width).toBe(8);
      expect(w).toBeCloseTo(100 + 0.75 + 0.75);
    });
  });

  describe('when min-width expands content with center option', () => {
    it('centers simple character when min-width > content width', () => {
      const { x, w, builder } = getViewBox('[min-width=20;center]||H');

      expect(builder.composition.width).toBe(8);
      expect(builder.composition.baseWidth).toBe(8);

      const extraSpace = 20 - 8;
      const expectedX = -0.75 - (extraSpace / 2);
      expect(x).toBeCloseTo(expectedX);
      expect(w).toBeCloseTo(20 + 0.75 + 0.75);
    });

    it('defaults to left-aligned when center option not specified', () => {
      // Without center, min-width expansion is left-aligned: the viewBox x
      // stays at the default -0.75 margin instead of shifting to center the
      // 8-wide content inside the 20-wide min-width.
      const { x, builder } = getViewBox('[min-width=20]||H');

      expect(builder.composition.width).toBe(8);
      expect(x).toBeCloseTo(-0.75);
    });

    it('pads symmetrically for a single indicator overhang', () => {
      // note: B99:-1 is a left-placed indicator, but #childStartOffset shifts
      // the whole composition right to absorb it, so in composition coordinates
      // it reads as rightOverhang=1 (composition.x normalizes to 0). The pad is
      // that 1 unit on each side: -0.75 - (30 - (8 + 2*1))/2 = -10.75.
      const { x, builder } = getViewBox('[min-width=30;center]||B291;B99:-1');

      expect(builder.composition.x).toBeCloseTo(0);
      expect(x).toBeCloseTo(-10.75); // pins the concrete pad, not the source formula
    });

    it('pads by the larger of two competing overhangs (Math.max)', () => {
      // Genuine Math.max discrimination: two left indicators (B99:-1, B99:-3)
      // plus a right one (B99:8). #childStartOffset compensates only the FIRST
      // indicator part (B99:-1), so the deeper B99:-3 leaves composition.x
      // negative: a live leftOverhang=2. rightOverhang=1, so Math.max selects
      // the LEFT branch and pads by 2: -0.75 - (30 - (8 + 2*2))/2 = -9.75.
      // A rightOverhang-only or Math.min variant would land at -10.75.
      const { x, builder } = getViewBox('[min-width=30;center]||B291;B99:-1;B99:-3;B99:8');

      expect(builder.composition.x).toBe(-2); // left branch genuinely live
      expect(x).toBeCloseTo(-9.75); // pads by leftOverhang=2, not rightOverhang=1
    });

    it('works with multiple characters', () => {
      const { x, builder } = getViewBox('[min-width=50;center]||B313/B313');

      const baseWidth = builder.composition.baseWidth;
      const extraSpace = 50 - baseWidth;
      const expectedX = -0.75 - (extraSpace / 2);
      expect(x).toBeCloseTo(expectedX);
    });

    it('works with very large min-width', () => {
      const { x } = getViewBox('[min-width=100;center]||H');
      const extraSpace = 100 - 8;

      expect(x).toBeCloseTo(-0.75 - (extraSpace / 2));
    });

    it('interacts correctly with margin', () => {
      const { x } = getViewBox('[min-width=20;margin=5;center]||H');
      const extraSpace = 20 - 8;

      expect(x).toBeCloseTo(-5 - (extraSpace / 2));
    });

    it('interacts correctly with crop', () => {
      const { x } = getViewBox('[min-width=20;crop=2;center]||H');
      const extraSpace = 20 - 8;

      expect(x).toBeCloseTo(-0.75 + 2 - (extraSpace / 2));
    });

    it('extends grid to min-width and centers content', () => {
      const { x, svg } = getViewBox('[grid;min-width=30;center]||H');
      const extraSpace = 30 - 8;

      expect(x).toBeCloseTo(-0.75 - (extraSpace / 2));

      const gridOffsetX = x + 0.75;
      expect(svg).toContain(`M${gridOffsetX},8h30`);
      expect(svg).toContain(`M${gridOffsetX},16h30`);
    });
  });

  describe('when grid is enabled alongside min-width and center', () => {
    it('shifts grid with viewBox when center and min-width expands space', () => {
      const { x, svg } = getViewBox('[grid;min-width=20;center]||H');

      const gridOffsetX = x + 0.75;
      expect(svg).toContain(`M${gridOffsetX},8h20`);
      expect(svg).toContain(`M${gridOffsetX},16h20`);
    });

    it('shifts grid with viewBox for narrow content (B428, width=0)', () => {
      const { x, svg } = getViewBox('[grid;min-width=8;center]||B428');

      const gridOffsetX = x + 0.75;
      expect(svg).toContain(`M${gridOffsetX},8h8`);
      expect(svg).toContain(`M${gridOffsetX},16h8`);
    });

    it('keeps grid at 0 without center (no viewBox shift)', () => {
      const { x, svg } = getViewBox('[grid;min-width=15]||H');

      expect(x).toBeCloseTo(-0.75);
      expect(svg).toContain('M0,8h15');
      expect(svg).toContain('M0,16h15');
    });

    it('shifts grid when center with margin', () => {
      const { x, svg } = getViewBox('[grid;min-width=12;margin=3;center]||H');

      const gridOffsetX = x + 3;
      expect(svg).toContain(`M${gridOffsetX},8h12`);
    });

    it('shifts grid for very large min-width', () => {
      const { x, svg } = getViewBox('[grid;min-width=50]||H');

      const gridOffsetX = x + 0.75;
      expect(svg).toContain(`M${gridOffsetX},8h50`);
    });
  });

  describe('when parts use inline x/y coordinate syntax', () => {
    it('respects x positioning via coordinate syntax on parts', () => {
      // B313:5 sets x=5 on the part inside the character
      // The part is offset within the character, expanding its width
      const builder = new BlissSVGBuilder('B313:5');
      const comp = builder.composition;
      const word = comp.children[0];
      const char = word.children[0];

      // Part at x=5 extends the character: width = 5 + 8 = 13
      expect(char.width).toBe(13);
      expect(char.children[0].x).toBe(5);
    });

    it('respects y positioning via coordinate syntax on parts', () => {
      // B313:,4 shifts part down by 4 units
      const builder = new BlissSVGBuilder('B313:,4');
      const comp = builder.composition;
      const word = comp.children[0];
      const char = word.children[0];

      expect(char.children[0].y).toBe(4);
    });

    it('x and y positioning combine on same part', () => {
      // B313:3,4 sets x=3 and y=4 on the part
      const builder = new BlissSVGBuilder('B313:3,4');
      const comp = builder.composition;
      const word = comp.children[0];
      const char = word.children[0];

      expect(char.children[0].x).toBe(3);
      expect(char.children[0].y).toBe(4);
      expect(char.width).toBe(11); // 3 + 8
    });
  });

  describe('when RK/AK markers adjust inter-character spacing', () => {
    it('applies relative kerning (RK) to adjust spacing', () => {
      // RK:-1 reduces spacing by 1 between characters
      // Default: B313(x=0), B313(x=10) with char-space=2
      const builder = new BlissSVGBuilder('B313/RK:-1/B313');
      const word = builder.composition.children[0];

      expect(word.children[0].x).toBe(0);
      expect(word.children[1].x).toBe(9); // 10 - 1
    });

    it('applies absolute kerning (AK) to set exact gap', () => {
      // AK:5 sets gap to exactly previousWidth + 5
      // B313 width=8, so char2.x = 8 + 5 = 13
      const builder = new BlissSVGBuilder('B313/AK:5/B313');
      const word = builder.composition.children[0];

      expect(word.children[1].x).toBe(13);
    });

    it('absolute kerning overrides default char-space', () => {
      // Even with char-space=10, AK:1 forces gap to 1
      const builder = new BlissSVGBuilder('[char-space=10]||B313/AK:1/B313');
      const word = builder.composition.children[0];

      // B313 width=8, AK:1, so x = 8 + 1 = 9
      expect(word.children[1].x).toBe(9);
    });
  });
});
