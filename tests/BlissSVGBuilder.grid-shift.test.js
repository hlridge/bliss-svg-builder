import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `grid-shift` option: one number, in grid units, that moves every
 * grid line right and down (left and up when negative) and leaves the symbol,
 * the paper, the zones and the picture's size where they were.
 *
 * Covers:
 * - Every grid coordinate moved by the value on both axes; an `h` run keeps
 *   its length; everything outside the grid lines byte-identical, with a
 *   paper and with zones.
 * - A negative value; 0 and the absent key byte-identical to the unmoved grid,
 *   whose coordinates are written unrounded.
 * - Moved coordinates rounded to 4 decimals (`1/6` writes `8.1667`).
 * - Refused values (not a number, bare, empty, non-finite, a fraction as
 *   text), each with its code and source, the grid left unmoved.
 * - Builder level only: on a character it is dropped with
 *   MISPLACED_GLOBAL_OPTION and not saved.
 * - Without `grid`: nothing drawn, nothing reported, saved as written.
 * - DSL, both option spellings and a composition object render
 *   byte-identically; the transient channel moves the grid and saves nothing.
 * - Saved as written, and reloaded from `toString()` and `toJSON()` (default
 *   and preserve) to the same picture.
 * - The lines drawn are chosen at their unmoved positions, then moved: with
 *   `center` and `min-width`, numeric crops and `margin=0`.
 * - An authored `grid--transform` stays on the group; a `grid--filter`
 *   region follows the moved lines.
 *
 * Does NOT cover:
 * - The rest of the grid option family, see `BlissSVGBuilder.grid.test.js`.
 * - A `grid-line--d` key naming the shift as displaced, see the one-row-per-name
 *   table in `BlissSVGBuilder.layer-sub-targets.test.js`.
 * - The gate at the word and part levels, see the key matrix in
 *   `BlissParser.global-option-scope.test.js`.
 * - The value gate's wording, shared by every numeric option, see
 *   `BlissSVGBuilder.option-value-gate.test.js`.
 * - How a builder option travels through `merge()`, `splitAt()`,
 *   `clearAllOptions()`, the transient channel's removal and the
 *   `omitOptions` saves, the same for every builder option, see
 *   `BlissSVGBuilder.merge-split.test.js`, `clear-options`,
 *   `option-removal-naming` and `omit-options` (each a
 *   `BlissSVGBuilder.<name>.test.js`).
 * - The rendered pictures, see `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

// The `d` of each grid line, in the order the grid group writes them.
const gridPathsOf = (svg) => [...svg.matchAll(/<path class="bliss-grid-line[^"]*"[^>]* d="([^"]*)"/g)].map((m) => m[1]);

// The picture with every grid line's `d` taken out: what the shift must not touch.
const withoutGridPaths = (svg) => svg.replace(/(<path class="bliss-grid-line[^>]*) d="[^"]*"/g, '$1');

const round = (n) => parseFloat(n.toFixed(4));

// An unmoved grid path with its positions (M's x and y, V's y) moved by `by`
// and rounded as the viewBox is. An `h` run is a length, so it stays.
const movedBy = (d, by) => d
  .replace(/M([^,]+),([^MVh]+)/g, (_, x, y) => `M${round(Number(x) + by)},${round(Number(y) + by)}`)
  .replace(/V([^MVh]+)/g, (_, y) => `V${round(Number(y) + by)}`);

// The first filter's region, as [x, y, width, height].
const filterRegionOf = (svg) => svg
  .match(/<filter [^>]*? x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/).slice(1).map(Number);

const UNMOVED = new BlissSVGBuilder('[grid]||B313').svgCode;

describe('BlissSVGBuilder grid shift', () => {
  describe('when a positive shift is written', () => {
    it('moves every grid line right and down by the value', () => {
      const paths = gridPathsOf(new BlissSVGBuilder('[grid;grid-shift=0.25]||B313').svgCode);

      expect(paths[2]).toBe('M0.25,0.25h8M0.25,4.25h8M0.25,12.25h8M0.25,20.25h8M0.25,0.25V20.25M4.25,0.25V20.25M8.25,0.25V20.25');
      expect(paths[3]).toBe('M0.25,8.25h8');
      expect(paths).toEqual(gridPathsOf(UNMOVED).map((d) => movedBy(d, 0.25)));
    });

    it.each([
      ['with no background', 'grid'],
      ['over a paper', 'grid;background=#ffd'],
      ['over the three zones', 'grid;background-top=#fee;background-mid=#efe;background-bottom=#eef'],
    ])('leaves everything but the grid lines byte-identical %s', (_scene, options) => {
      const moved = new BlissSVGBuilder(`[${options};grid-shift=0.25]||B313`).svgCode;
      const unmoved = new BlissSVGBuilder(`[${options}]||B313`).svgCode;

      expect(withoutGridPaths(moved)).toBe(withoutGridPaths(unmoved));
      expect(moved).not.toBe(unmoved);
    });
  });

  describe('when a negative shift is written', () => {
    it('moves every grid line left and up by the value', () => {
      const paths = gridPathsOf(new BlissSVGBuilder('[grid;grid-shift=-0.25]||B313').svgCode);

      expect(paths[3]).toBe('M-0.25,7.75h8');
      expect(paths).toEqual(gridPathsOf(UNMOVED).map((d) => movedBy(d, -0.25)));
    });
  });

  describe('when the shift is 0 or absent', () => {
    it.each([
      ['[grid;grid-shift=0]||B313', '[grid]||B313'],
      ['[grid;grid-shift=-0]||B313', '[grid]||B313'],
      ['[grid;crop=0.33333;grid-shift=0]||B313', '[grid;crop=0.33333]||B313'],
    ])('renders %s byte-identically to %s', (input, control) => {
      expect(new BlissSVGBuilder(input).svgCode).toBe(new BlissSVGBuilder(control).svgCode);
    });

    it('writes an unmoved coordinate unrounded', () => {
      // pins "untouched at 0": a grid that always rounded would write 0.3333
      // here, and the crop row above cannot show it, because its control is
      // drawn by the same code and rounded the same way
      const paths = gridPathsOf(new BlissSVGBuilder('[grid;crop=0.33333;grid-shift=0]||B313').svgCode);

      expect(paths[0]).toMatch(/^M0\.33333,1h7\.33334M/);
    });
  });

  describe('when the shift has no short decimal form', () => {
    it('rounds every moved coordinate to 4 decimals', () => {
      const paths = gridPathsOf(new BlissSVGBuilder('B313', { grid: true, gridShift: 1 / 6 }).svgCode);

      expect(paths[3]).toBe('M0.1667,8.1667h8');
      expect(paths[4]).toBe('M0.1667,16.1667h8');
      expect(paths.join('')).not.toMatch(/\d\.\d{5}/);
    });
  });

  describe('when the value is refused', () => {
    it.each([
      ['abc', 'INVALID_OPTION_VALUE', 'grid-shift=abc', () => new BlissSVGBuilder('[grid;grid-shift=abc]||B313')],
      ['a bare key', 'INVALID_OPTION_VALUE', 'grid-shift', () => new BlissSVGBuilder('[grid;grid-shift]||B313')],
      ['an empty value', 'INVALID_OPTION_VALUE', 'grid-shift=', () => new BlissSVGBuilder('[grid;grid-shift=]||B313')],
      ['Infinity', 'OUT_OF_RANGE_OPTION_VALUE', 'grid-shift=Infinity', () => new BlissSVGBuilder('[grid;grid-shift=Infinity]||B313')],
      ["'1/6' as text", 'INVALID_OPTION_VALUE', 'grid-shift=1/6', () => new BlissSVGBuilder('B313', { grid: true, gridShift: '1/6' })],
    ])('reports %s as %s and leaves the grid unmoved', (_written, code, source, build) => {
      const builder = build();

      expect(builder.warnings.map((w) => ({ code: w.code, source: w.source }))).toEqual([{ code, source }]);
      expect(builder.svgCode).toBe(UNMOVED);
    });
  });

  describe('when it is written on a character', () => {
    it('drops it with MISPLACED_GLOBAL_OPTION and saves nothing', () => {
      const builder = new BlissSVGBuilder('[grid]||[grid-shift=0.25]B313');

      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['MISPLACED_GLOBAL_OPTION', 'grid-shift=0.25']]);
      expect(builder.toString()).toBe('[grid]||B313');
      expect(builder.svgCode).toBe(UNMOVED);
    });
  });

  describe('when grid is not switched on', () => {
    it('draws nothing, reports nothing and saves the value as written', () => {
      const builder = new BlissSVGBuilder('[grid-shift=0.25]||B313');

      expect(builder.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('[grid-shift=0.25]||B313');
    });
  });

  describe('when the same shift arrives through each surface', () => {
    it('renders the DSL, both option spellings and a composition object byte-identically', () => {
      const fromDsl = new BlissSVGBuilder('[grid;grid-shift=0.25]||B313').svgCode;
      const fromCamel = new BlissSVGBuilder('B313', { grid: true, gridShift: 0.25 }).svgCode;
      const fromKebab = new BlissSVGBuilder('B313', { grid: true, 'grid-shift': 0.25 }).svgCode;
      const fromObject = new BlissSVGBuilder({
        ...new BlissSVGBuilder('B313').toJSON(), options: { grid: true, gridShift: 0.25 },
      }).svgCode;

      expect(gridPathsOf(fromDsl)[3]).toBe('M0.25,8.25h8');
      expect([fromCamel, fromKebab, fromObject]).toEqual([fromDsl, fromDsl, fromDsl]);
    });

    it('moves the grid through the transient channel and saves nothing of it', () => {
      const builder = new BlissSVGBuilder('[grid]||B313');
      builder.setTransientOptions({ gridShift: 0.25 });

      expect(builder.svgCode).toBe(new BlissSVGBuilder('[grid;grid-shift=0.25]||B313').svgCode);
      expect(builder.toString()).toBe('[grid]||B313');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the composition is saved and reloaded', () => {
    it('saves the value as written in the string and in the JSON', () => {
      const builder = new BlissSVGBuilder('B313', { grid: true, gridShift: 1 / 6 });

      expect(builder.toString()).toBe('[grid;grid-shift=0.16666666666666666]||B313');
      expect(builder.toJSON().options).toEqual({ grid: true, gridShift: '0.16666666666666666' });
    });

    it.each([
      ['toString()', (b) => b.toString()],
      ['toString({ preserve: true })', (b) => b.toString({ preserve: true })],
      ['toJSON()', (b) => b.toJSON()],
      ['toJSON({ preserve: true })', (b) => b.toJSON({ preserve: true })],
    ])('reloads from %s to the same picture', (_form, save) => {
      const builder = new BlissSVGBuilder('B313', { grid: true, gridShift: 1 / 6 });

      expect(new BlissSVGBuilder(save(builder)).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the grid is centred, cropped or has no margin', () => {
    it.each([
      ['centred in a wider picture', 'grid;center;min-width=20'],
      ['cropped on every side', 'grid;crop=1.5'],
      // pins the crop window read at the unmoved positions: the sky line (y=8)
      // and the first vertical (x=1) sit outside it and the earth line (y=16)
      // inside, and moved by 0.25 each would cross the edge
      ['cropped between a line and its moved position', 'grid;crop-top=8.1;crop-left=1.1;crop-bottom=3.9'],
      ['drawn with no margin', 'grid;margin=0'],
    ])('draws the lines an unmoved grid draws %s, each moved by the value', (_geometry, options) => {
      const moved = new BlissSVGBuilder(`[${options};grid-shift=0.25]||B313`).svgCode;
      const unmoved = new BlissSVGBuilder(`[${options}]||B313`).svgCode;

      expect(gridPathsOf(moved)).toEqual(gridPathsOf(unmoved).map((d) => movedBy(d, 0.25)));
      expect(withoutGridPaths(moved)).toBe(withoutGridPaths(unmoved));
    });
  });

  describe('when a layer key reaches the grid', () => {
    it('keeps an authored grid transform on the group and the shift in the lines', () => {
      const svg = new BlissSVGBuilder('[grid;grid-shift=0.25;grid--transform=rotate(1)]||B313').svgCode;

      expect(svg).toContain('<g class="bliss-grid" shape-rendering="crispEdges" transform="rotate(1)">');
      expect(gridPathsOf(svg)[3]).toBe('M0.25,8.25h8');
    });

    it('moves a grid filter region with the lines', () => {
      // margin=-1 pulls the viewBox inside the lines, so the lines' own extent
      // sets the region rather than the viewBox, which the shift leaves alone
      const unmoved = new BlissSVGBuilder('[grid;margin=-1;grid--filter=blur(1px)]||B313').svgCode;
      const moved = new BlissSVGBuilder('[grid;margin=-1;grid-shift=0.5;grid--filter=blur(1px)]||B313').svgCode;

      expect(filterRegionOf(unmoved)).toEqual([-3.083, -3.083, 14.166, 26.166]);
      expect(filterRegionOf(moved)).toEqual([-2.583, -2.583, 14.166, 26.166]);
    });
  });
});
