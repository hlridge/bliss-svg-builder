import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a native filter's region covers a corner a raw key lets the
 * renderer draw as a miter: where the nearest `stroke-linejoin` written
 * around a line is anything but `round` or `bevel`, its corners may reach
 * the miter limit's half widths from the corner, and the region grows by how
 * far that is past the half width the drawn box holds, as by an effect's
 * reach.
 *
 * Covers:
 * - A join written on the content group (a bare global key or `content--`,
 *   which wins over a bare one), on the word, the character or a part;
 *   `miter-clip`, `arcs`, capitals, and a value no renderer reads (a bare
 *   key writes `true`), which falls back to the initial `miter`.
 * - `round` and `bevel`, in any case and with the spaces CSS skips around
 *   them, but not padded with a no-break space, which a renderer refuses;
 *   the nearest join winning over one written further out, both ways.
 * - The miter limit: the nearest one that reads as CSS reads a number (not
 *   a trailing point or a no-break space, which the DSL's own grammar
 *   reads), from the lines up to the content group, else 4; a limit of 1,
 *   which draws no miter; a huge one, which grows the region no further than
 *   an absurd effect does past the picture.
 * - An ink area: its own join, the content group's, which it inherits, and
 *   not the element's own or those of the elements inside it, which the
 *   area's copy of the lines does not write; its limit read past one the
 *   grammar cannot read; a filtered character's copy inside the area.
 * - The transparent lines a link answers on (`link-area=ink`), drawn inside
 *   the linked element's own group, so inside its join.
 * - The content group's own filter, over the lines, a character's own join
 *   and an ink area.
 * - What does not change: the invisible shape a thin line keeps, and a box
 *   background's rect, whose right angles reach no further than its box.
 *
 * Does NOT cover:
 * - A square cap, see `BlissSVGBuilder.native-filter-square-caps.test.js`.
 * - A raw width, see `BlissSVGBuilder.native-filter-raw-widths.test.js`, and
 *   regions sized by the options alone, see
 *   `BlissSVGBuilder.native-filter-regions.test.js`.
 * - A join or limit set by a `style` key or the page's CSS, which the library
 *   does not read.
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
// Each <filter>'s region as [x, y, width, height], in the order the markup writes them.
const regionsOf = (svg) => [...svg.matchAll(/<filter id="[^"]*" filterUnits="userSpaceOnUse" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
  .map(match => match.slice(1).map(Number));
const regionsFor = (input) => regionsOf(build(input).svgCode);
const THIN_SHAPE = '<rect x="0" y="-0.5" width="8" height="1" fill="none" stroke="none"/>';

// A '>' whose tip, at (8, 10), turns 40 degrees: drawn as a miter, the tip
// reaches 1 / sin(20 deg) = 2.92 half widths from the corner, inside the
// default limit of 4.
const TIP = 'ZZMITERTIP';
const TIP_HALF_HEIGHT = 8 * Math.tan(Math.PI / 9);

beforeAll(() => {
  BlissSVGBuilder.define({
    [TIP]: {
      getPath: ({ x = 0, y = 0 }) => `M${x},${y + 10 - TIP_HALF_HEIGHT}L${x + 8},${y + 10}L${x},${y + 10 + TIP_HALF_HEIGHT}`,
      width: 8,
      height: 16,
    },
  });
});

afterAll(() => {
  BlissSVGBuilder.removeDefinition(TIP);
});

// B313 spans x 0 to 8; at the default width 0.5 its box spans -0.25 to 8.25,
// and a blur(0.1px) reaches 0.3 past it
const PLAIN = '[margin=5]||[filter=blur(0.1px)]B313';
// as far as a miter at the default limit reaches past the box: 4 half widths
// from the corner, 0.75 past the 0.25 the box holds, added to the blur's 0.3
const DEFAULT_LIMIT = '[margin=5]||[filter=blur(0.35px)]B313';

describe('BlissSVGBuilder native filter miter joins', () => {
  describe('when a key writes a join that may draw a miter', () => {
    it('grows the region by how far past half a width the default limit lets a tip reach', () => {
      // the box alone drew [-1.55, -5.3, 11.1, 30.6]
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter]||[filter=blur(0.1px)]B313'))
        .toEqual([[-2.3, -6.05, 12.6, 32.1]]);
    });

    it.each([
      ['written globally as a bare key', '[margin=5;stroke-linejoin=miter]||[filter=blur(0.1px)]B313'],
      ['as miter-clip', '[margin=5;content--stroke-linejoin=miter-clip]||[filter=blur(0.1px)]B313'],
      ['as arcs', '[margin=5;content--stroke-linejoin=arcs]||[filter=blur(0.1px)]B313'],
      ['in capitals', '[margin=5;content--stroke-linejoin=MITER]||[filter=blur(0.1px)]B313'],
      // a value no renderer reads leaves the content group the initial `miter`
      ['as a value no renderer reads', '[margin=5;content--stroke-linejoin=pointy]||[filter=blur(0.1px)]B313'],
      // pins a value read as text whatever it arrives as: a bare key arrives
      // as true and writes "true", which no renderer reads
      ['as a bare key', '[margin=5;content--stroke-linejoin]||[filter=blur(0.1px)]B313'],
      // pins the word trimmed only of the whitespace CSS skips: a renderer
      // refuses `round` padded with a no-break space and draws the initial miter
      ['as round padded with a no-break space', '[margin=5;content--stroke-linejoin="round\u00a0"]||[filter=blur(0.1px)]B313'],
      // pins the content group's join read once, as the content group writes
      // it: its `content--` key over the bare global one
      ['with content-- over a bare global round', '[margin=5;stroke-linejoin=round;content--stroke-linejoin=miter]||[filter=blur(0.1px)]B313'],
      ['on the word around the character', '[margin=5]||[stroke-linejoin=miter]|[filter=blur(0.1px)]B313'],
      ['on the character beside its filter', '[margin=5]||[stroke-linejoin=miter;filter=blur(0.1px)]B313'],
      ['inherited on the character from the content group', '[margin=5;content--stroke-linejoin=miter]||[stroke-linejoin=inherit;filter=blur(0.1px)]B313'],
      ['on a part inside the character', '[margin=5]||[filter=blur(0.1px)][stroke-linejoin=miter]>B313'],
    ])('draws the region a blur reaching that much further draws, %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor(DEFAULT_LIMIT));
    });

    it('holds the tip of a sharp corner drawn as a miter, and its blur', () => {
      // at width 2 the tip reaches x 10.92 and its blur 11.22; the box's
      // half width alone ended the region at 10.3, inside the picture
      const [[x, , width]] = regionsFor(`[margin=5;stroke-width=2;content--stroke-linejoin=miter]||[filter=blur(0.1px)]${TIP}`);
      expect(x + width).toBeGreaterThanOrEqual(8 + 1 / Math.sin(Math.PI / 9) + 0.3);
    });
  });

  describe('when the nearest join written around the lines is round or bevel', () => {
    it.each([
      ['bevel on the content group', '[margin=5;content--stroke-linejoin=bevel]||[filter=blur(0.1px)]B313'],
      ['round in capitals on the content group', '[margin=5;content--stroke-linejoin=ROUND]||[filter=blur(0.1px)]B313'],
      // pins the word read trimmed, as a renderer reads it
      ['round quoted with spaces around it on the content group', '[margin=5;content--stroke-linejoin="  round  "]||[filter=blur(0.1px)]B313'],
      // pins each whitespace CSS skips, trimmed from both ends
      ['round padded with every whitespace CSS skips on the content group', '[margin=5;content--stroke-linejoin="\t\n\f\r round\t\n\f\r "]||[filter=blur(0.1px)]B313'],
      ['round on the character over a miter on the content group', '[margin=5;content--stroke-linejoin=miter]||[stroke-linejoin=round;filter=blur(0.1px)]B313'],
      ['bevel on the word over a miter on the content group', '[margin=5;content--stroke-linejoin=miter]||[stroke-linejoin=bevel]|[filter=blur(0.1px)]B313'],
      ['round on a part over a miter on its character', '[margin=5]||[stroke-linejoin=miter;filter=blur(0.1px)][stroke-linejoin=round]>B313'],
    ])('draws the region it draws with no join written, %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor(PLAIN));
    });
  });

  describe('when a key writes a miter limit', () => {
    it('grows the region by how far past half a width the limit lets a tip reach', () => {
      // 10 half widths from the corner, 2.25 past the box; as blur(0.85px)
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[filter=blur(0.1px)]B313'))
        .toEqual([[-3.8, -7.55, 15.6, 35.1]]);
    });

    it.each([
      ['on the character', '[margin=5;content--stroke-linejoin=miter]||[stroke-miterlimit=10;filter=blur(0.1px)]B313'],
      ['on the word over a lower one on the content group', '[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=2]||[stroke-miterlimit=10]|[filter=blur(0.1px)]B313'],
      // a renderer ignores a limit it cannot read and inherits the one outside
      ['on the content group, read past one the grammar cannot read on the character', '[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[stroke-miterlimit=abc;filter=blur(0.1px)]B313'],
      // pins the limit read as CSS reads a number: a renderer refuses a
      // trailing point and a no-break space, which the DSL's own grammar reads
      ['on the content group, read past one written with a trailing point on the character', '[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[stroke-miterlimit=4.;filter=blur(0.1px)]B313'],
      ['on the content group, read past one padded with a no-break space on the character', '[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[stroke-miterlimit="4\u00a0";filter=blur(0.1px)]B313'],
    ])('reads the nearest limit it can, %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor('[margin=5]||[filter=blur(0.85px)]B313'));
    });

    it.each(['abc', '0.5', '1e400'])('reads a limit of %s as the default 4', (limit) => {
      expect(regionsFor(`[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=${limit}]||[filter=blur(0.1px)]B313`))
        .toEqual(regionsFor(DEFAULT_LIMIT));
    });

    it('draws the region it draws with no join written at a limit of 1, which draws no miter', () => {
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=1]||[filter=blur(0.1px)]B313'))
        .toEqual(regionsFor(PLAIN));
    });

    it('grows the region no further than 8 past the picture at a huge limit, as an absurd effect does', () => {
      // the viewBox spans x -5 to 13 and y -5 to 25
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=1000]||[filter=blur(0.1px)]B313'))
        .toEqual([[-13, -13, 34, 46]]);
    });
  });

  // the ink area strokes B313 at 1.3 and spans -0.65 to 8.65; alone it drew
  // [-1.95, -5.3, 11.9, 30.6]
  describe('when a key writes an ink area\'s join', () => {
    const PAINTED = '[background=yellow;background-area=ink]B313';

    it('grows the area\'s region by how far past half its width a tip reaches', () => {
      // 4 half widths, 1.95 past the box; as blur(0.75px)
      expect(regionsFor(`[margin=5;element-background--ink--stroke-linejoin=miter;element-background--ink--filter=blur(0.1px)]||${PAINTED}`))
        .toEqual([[-3.9, -7.25, 15.8, 34.5]]);
    });

    it.each([
      ['by the content group\'s join, which the area inherits', `[margin=5;content--stroke-linejoin=miter;element-background--ink--filter=blur(0.1px)]||${PAINTED}`],
      ['by the area\'s own join, written on the element', '[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;element-background--ink--stroke-linejoin=miter]B313'],
    ])('draws the region a blur reaching that much further draws, %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor(`[margin=5;element-background--ink--filter=blur(0.75px)]||${PAINTED}`));
    });

    it.each([
      // the area's copy of the lines writes none of the groups of the
      // elements it copies, the painted one's or those inside it
      ['the element\'s own join', '[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;stroke-linejoin=miter]B313'],
      ['the join of a character inside the painted word', '[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]|[stroke-linejoin=miter]B313'],
      ['a round join of its own over the content group\'s miter', `[margin=5;content--stroke-linejoin=miter;element-background--ink--stroke-linejoin=round;element-background--ink--filter=blur(0.1px)]||${PAINTED}`],
    ])('draws the region it draws with no join written, under %s', (_case, input) => {
      expect(regionsFor(input)).toEqual(regionsFor(`[margin=5;element-background--ink--filter=blur(0.1px)]||${PAINTED}`));
    });

    it('reads the content group\'s limit, past one of its own the grammar cannot read', () => {
      // 10 half widths, 5.85 past the box
      expect(regionsFor(`[margin=5;content--stroke-miterlimit=10;element-background--ink--stroke-miterlimit=abc;element-background--ink--stroke-linejoin=miter;element-background--ink--filter=blur(0.1px)]||${PAINTED}`))
        .toEqual([[-7.8, -11.15, 23.6, 42.3]]);
    });

    it('grows the region of a filtered character\'s copy inside the area', () => {
      // the copy first, at the area's width; then the character's own lines,
      // which the content group's round join draws
      expect(regionsFor('[margin=5;element-background--ink--stroke-linejoin=miter]||[background=yellow;background-area=ink]|[filter=blur(0.1px)]B313'))
        .toEqual([[-3.9, -7.25, 15.8, 34.5], [-1.55, -5.3, 11.1, 30.6]]);
    });
  });

  describe('when a link answers on the ink of its lines', () => {
    it('grows the region of a filtered character\'s copy among the hit lines by the linked word\'s own join', () => {
      // the hit lines first, stroked at 1.3 inside the word's own group; then
      // the character's own lines, at 0.5
      expect(regionsFor('[margin=5]||[href=https://example.com;link-area=ink;stroke-linejoin=miter]|[filter=blur(0.1px)]B313'))
        .toEqual([[-3.9, -7.25, 15.8, 34.5], [-2.3, -6.05, 12.6, 32.1]]);
    });
  });

  describe('when the content group carries the filter', () => {
    it('grows its region by how far the lines\' tips reach', () => {
      expect(regionsFor('[margin=5;content--stroke-linejoin=miter;content--filter=blur(0.1px)]||B313'))
        .toEqual(regionsFor('[margin=5;content--filter=blur(0.35px)]||B313'));
    });

    it('grows its region by how far the tips of a character\'s own join reach', () => {
      expect(regionsFor('[margin=5;content--filter=blur(0.1px)]||[stroke-linejoin=miter]B313'))
        .toEqual(regionsFor('[margin=5;content--filter=blur(0.35px)]||B313'));
    });

    it('grows its region by how far an ink area\'s tips reach', () => {
      expect(regionsFor('[margin=5;element-background--ink--stroke-linejoin=miter;content--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313'))
        .toEqual(regionsFor('[margin=5;content--filter=blur(0.75px)]||[background=yellow;background-area=ink]B313'));
    });
  });

  describe('when a miter draws no further than the drawn box', () => {
    it('keeps the invisible shape a thin line needs, as a straight line has no corner', () => {
      expect(build('[margin=5;content--stroke-linejoin=miter]||[filter=drop-shadow(1px 1px 0 red)]HL8').svgCode).toContain(THIN_SHAPE);
    });

    it('leaves a box background\'s region as it was, as its right angles reach its own corners', () => {
      const boxed = 'element-background--box--stroke=red;element-background--box--stroke-width=2;element-background--box--filter=blur(0.1px)]||[background=yellow]B313';
      expect(regionsFor(`[margin=5;content--stroke-linejoin=miter;element-background--box--stroke-miterlimit=10;${boxed}`))
        .toEqual(regionsFor(`[margin=5;${boxed}`));
    });
  });
});
