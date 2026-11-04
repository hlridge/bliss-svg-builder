import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a native filter's region covers a square end a raw key writes:
 * where the nearest `stroke-linecap` written around a line is anything but
 * `round` or `butt`, an end's corners may reach √2 half widths from it, and
 * the region grows by how far that is past the half width the drawn box
 * holds, as by an effect's reach.
 *
 * Covers:
 * - A square cap written on the content group or the character, and one the
 *   character inherits from the content group.
 * - `round` and `butt`, and the nearest cap winning over one written further
 *   out.
 * - A diagonal's square ends, which a wide line drew past the region before.
 * - A square cap beside a join that may draw a miter: the larger reach wins.
 * - An ink area's own square cap.
 * - What does not change: the invisible shape a thin line keeps, and a grid
 *   line's region, as its ends run along its own axis.
 *
 * Does NOT cover:
 * - Joins and the miter limit, see
 *   `BlissSVGBuilder.native-filter-miter-joins.test.js`.
 * - A cap set by a `style` key or the page's CSS, which the library does not
 *   read.
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
// Each <filter>'s region as [x, y, width, height], in the order the markup writes them.
const regionsOf = (svg) => [...svg.matchAll(/<filter id="[^"]*" filterUnits="userSpaceOnUse" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
  .map(match => match.slice(1).map(Number));
const regionsFor = (input) => regionsOf(build(input).svgCode);
const THIN_SHAPE = '<rect x="0" y="-0.5" width="8" height="1" fill="none" stroke="none"/>';

// B313 spans x 0 to 8; at the default width 0.5 its box spans -0.25 to 8.25,
// and a blur(0.1px) reaches 0.3 past it
const PLAIN = '[margin=5]||[filter=blur(0.1px)]B313';
// a square end's corner reaches √2 x 0.25 from the end, 0.1036 past the box
const SQUARE = [[-1.6536, -5.4036, 11.3071, 30.8071]];

describe('BlissSVGBuilder native filter square caps', () => {
  describe('when a key writes a square cap', () => {
    it('grows the region by how far past half a width an end\'s corner reaches', () => {
      // the box alone drew [-1.55, -5.3, 11.1, 30.6]
      expect(regionsFor('[margin=5;content--stroke-linecap=square]||[filter=blur(0.1px)]B313')).toEqual(SQUARE);
    });

    it.each([
      ['on the character beside its filter', '[margin=5]||[stroke-linecap=square;filter=blur(0.1px)]B313'],
      ['inherited on the character from the content group', '[margin=5;content--stroke-linecap=square]||[stroke-linecap=inherit;filter=blur(0.1px)]B313'],
    ])('draws the same region %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(SQUARE);
    });

    it('holds a wide diagonal\'s square ends, and their blur', () => {
      // DL8N runs from (0, 8) to (8, 0); at width 8 its ends' corners reach
      // x -5.66 and 13.66, and the box's half width alone cut the region at
      // -5.3 and 13.3
      const [[x, , width]] = regionsFor('[margin=9;stroke-width=8;content--stroke-linecap=square]||[filter=blur(0.1px)]DL8N');
      expect(x).toBeLessThanOrEqual(-4 * Math.SQRT2 - 0.3);
      expect(x + width).toBeGreaterThanOrEqual(8 + 4 * Math.SQRT2 + 0.3);
    });

    it('draws the larger reach beside a join that may draw a miter', () => {
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter;content--stroke-linecap=square]||[filter=blur(0.1px)]B313'))
        .toEqual(regionsFor('[margin=5]||[filter=blur(0.35px)]B313'));
    });

    it('grows an ink area\'s region by its own square cap, at the area\'s width', () => {
      // the area strokes at 1.3: its corners reach 0.2692 past its box
      expect(regionsFor('[margin=5;element-background--ink--stroke-linecap=square;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313'))
        .toEqual([[-2.2192, -5.5692, 12.4385, 31.1385]]);
    });
  });

  describe('when the nearest cap written around the lines is round or butt', () => {
    it.each([
      ['butt on the content group', '[margin=5;content--stroke-linecap=butt]||[filter=blur(0.1px)]B313'],
      ['round on the character over a square cap on the content group', '[margin=5;content--stroke-linecap=square]||[stroke-linecap=round;filter=blur(0.1px)]B313'],
    ])('draws the region it draws with no cap written, %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor(PLAIN));
    });
  });

  describe('when a square end draws no further than the drawn box', () => {
    it('keeps the invisible shape a thin line needs, as its ends run along it', () => {
      expect(build('[margin=5;content--stroke-linecap=square]||[filter=drop-shadow(1px 1px 0 red)]HL8').svgCode).toContain(THIN_SHAPE);
    });

    it('leaves a grid line\'s region as it was, as its ends run along its own axis', () => {
      expect(regionsFor('[grid;grid-line--stroke-linecap=square;grid-line--filter=blur(0.1px)]||B313'))
        .toEqual(regionsFor('[grid;grid-line--filter=blur(0.1px)]||B313'));
    });
  });
});
