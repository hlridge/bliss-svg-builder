import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how far each native filter's region reaches: the picture and what the
 * filtered element draws, its link's area included, grown by the effect's
 * spread but by no more than 8 units, and cut along the line to what is drawn
 * plus the spread and 1 unit. The spread is the filter's own reach plus how
 * far the filters inside the element already carry what it draws.
 *
 * Covers:
 * - The cut along the line, and the picture's height kept whole.
 * - A word holding a filtered character, a filtered part through a character
 *   with no filter, and a filtered part inside a filtered character (the two
 *   reaches added).
 * - The copies of an element's effects: around a box with its own filter
 *   (written on the element and as a global key), around a child's copy,
 *   the widest of what a copy holds past a plain box before it, around an
 *   ink area whose lines hold a filtered part; an ink area's own filter; a
 *   character's copy in its word's ink area.
 * - The content group over an element background's filter; the grid group
 *   over its filtered lines.
 * - A raw `stroke-width` key on a grid line: the line's region and the
 *   group's sized by the width the key writes, as the width option would size
 *   them (the shared and the most specific key, a thinner and a zero width, a
 *   line given its own cap or `vector-effect`, the options object, a line past
 *   the picture's edge); a width the number grammar cannot read, or CSS
 *   refuses as a number (a trailing point, a no-break space), keeps the
 *   option's region.
 * - A link's area: a word's padded rect, `link-area=ink`, a part's rect, a
 *   one-shape part's padded rect; a thin linked element's invisible shape
 *   judged by its lines alone.
 * - An absurd reach: at most 8 units past the picture, the spread along the
 *   line kept whole inside it.
 *
 * Does NOT cover:
 * - The markup around each filter, see `BlissSVGBuilder.native-filters.test.js`
 *   and `BlissSVGBuilder.native-filter-layers.test.js`.
 * - The arithmetic on its own, see `bliss-filters.primitives.test.js`.
 * - How long a renderer takes over a region, measured outside the suite.
 * - What a part moved by an author's `transform` draws past the cut: no box
 *   the library computes can see it. Nor can it see a grid line's own path
 *   (`grid-line--d`), or a width set by a `style` key or the page's CSS.
 * - How a grid line's width lengthens its segments, see
 *   `BlissSVGBuilder.grid-line-ends.test.js`.
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
// Each <filter>'s region as [x, y, width, height], in the order the markup writes them.
const regionsOf = (svg) => [...svg.matchAll(/<filter id="[^"]*" filterUnits="userSpaceOnUse" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
  .map(match => match.slice(1).map(Number));

describe('BlissSVGBuilder native filter regions', () => {
  describe('when a filtered word sits inside a longer line', () => {
    it('cuts the region along the line past the word, keeping the picture\'s height', () => {
      // viewBox -0.75 -0.75 41.5 21.5; B291 drawn from 15.75 to 24.25, and
      // blur(1px) reaches 3: the cut sits 4 past the ink, y keeps the viewBox
      expect(regionsOf(build('B313//[filter=blur(1px)]|B291//B313').svgCode)).toEqual([[11.75, -3.75, 16.5, 27.5]]);
    });
  });

  describe('when the filters inside an element carry its ink past it', () => {
    it.each([
      ['a filtered character', '[filter=grayscale(1)]|B313/[filter=drop-shadow(3px 3px 0 red)]B291//B313',
        [[-3.75, -3.75, 26, 27.5], [5.75, -3.75, 16.5, 27.5]]],
      ['a filtered part, through a character with no filter', '[filter=grayscale(1)]|B313/B291;[filter=drop-shadow(5px 5px 0 red)]>B81//B313',
        [[-5.75, -5.75, 30, 31.5], [6.75, -5.75, 14.5, 31.5]]],
      ['a filtered part inside a filtered character, the two added',
        '[filter=grayscale(1)]|B313/[filter=drop-shadow(3px 3px 0 red)]B291;[filter=drop-shadow(5px 5px 0 red)]>B81//B313',
        [[-8.75, -8.75, 36, 37.5], [0.75, -8.75, 26.5, 37.5], [6.75, -5.75, 14.5, 31.5]]],
    ])('widens a grayscale word\'s region by %s', (_case, input, regions) => {
      // the word draws to 18.25 and has no reach of its own: without what is
      // inside it, its region would stop at 19.25
      expect(regionsOf(build(input).svgCode)).toEqual(regions);
    });
  });

  describe('when a copy of an element\'s effects holds what draws past it', () => {
    it.each([
      ['written on the element', '[filter=grayscale(1);background=yellow;element-background--filter=drop-shadow(5px 5px 0 red)]B313/B291'],
      ['written as a global key', '[element-background--filter=drop-shadow(5px 5px 0 red)]||[filter=grayscale(1);background=yellow]B313/B291'],
    ])('widens the copy around a box by the box\'s own filter, %s', (_case, input) => {
      // pins the copy's spread from what it holds: cut 1 unit past the box,
      // the copy would end the box's shadow (x 4 to 14) at x=10
      expect(regionsOf(build(input).svgCode)).toEqual([[-6, -6, 21, 32], [-6, -6, 21, 32], [-0.75, -0.75, 10, 21.5]]);
    });

    it('widens a word\'s copy by a character\'s copy inside it', () => {
      expect(regionsOf(build('[filter=grayscale(1)]|[background=yellow;filter=drop-shadow(5px 5px 0 red)]B313/B291').svgCode))
        .toEqual([[-6, -6, 21, 32], [-6, -6, 21, 32], [-5.75, -5.75, 29.5, 31.5], [-5.75, -5.75, 20, 31.5]]);
    });

    it('widens a word\'s copy by the widest of what it holds, not the first', () => {
      // pins the largest spread among what the copy holds: B313's plain box
      // first, B291's shadowed copy second; read from the first alone, the
      // word's copy would end the shadow (x 14 to 24) at x=20, inside the line
      expect(regionsOf(build('[filter=grayscale(1)]|[background=yellow]B313/[background=yellow;filter=drop-shadow(5px 5px 0 red)]B291//B313').svgCode))
        .toEqual([[-6, -6, 31, 32], [3, -6, 22, 32], [-5.75, -5.75, 30, 31.5], [3.75, -5.75, 20.5, 31.5]]);
    });

    it('widens the copy around an ink area by the filters its lines hold', () => {
      // the area's lines carry the part's shadow: copy, the part's copy in
      // the area, the character's lines, the part's lines
      expect(regionsOf(build('B313/[filter=grayscale(1);background-area=ink;background=yellow]B291;[filter=drop-shadow(5px 5px 0 red)]>B81').svgCode))
        .toEqual([[3.35, -5.75, 20.4, 31.5], [6.35, -5.75, 15.3, 31.5], [3.75, -5.75, 20, 31.5], [6.75, -5.75, 14.5, 31.5]]);
    });

    it('widens an ink area\'s own filter by the filters its lines hold', () => {
      expect(regionsOf(build('[element-background--filter=grayscale(1)]||B313/[background-area=ink;background=yellow]B291;[filter=drop-shadow(5px 5px 0 red)]>B81').svgCode))
        .toEqual([[3.35, -5.75, 20.4, 31.5], [6.35, -5.75, 15.3, 31.5], [6.75, -5.75, 14.5, 31.5]]);
    });

    it('widens a character\'s copy in its word\'s ink area by the filters inside the character', () => {
      expect(regionsOf(build('[background-area=ink;background=yellow]|B313/[filter=grayscale(1)]B291;[filter=drop-shadow(5px 5px 0 red)]>B81').svgCode))
        .toEqual([[3.35, -5.75, 20.4, 31.5], [6.35, -5.75, 15.3, 31.5], [3.75, -5.75, 20, 31.5], [6.75, -5.75, 14.5, 31.5]]);
    });
  });

  describe('when the whole symbol is filtered over a filtered element background', () => {
    it('widens the content group\'s region by the background\'s filter', () => {
      // the content group's <filter> is written first and numbered last
      expect(regionsOf(build('[filter=grayscale(1);element-background--filter=drop-shadow(5px 5px 0 red)]||B313/[background=yellow]B291').svgCode))
        .toEqual([[-5.75, -6, 29.75, 32], [3, -6, 21, 32]]);
    });
  });

  describe('when a layer group holds filtered shapes', () => {
    it('widens the grid group\'s region by the largest reach among its lines', () => {
      // five lines each reaching 1: the group spreads 1 past them, not 5
      expect(regionsOf(build('[grid;grid--filter=grayscale(1);grid-line--filter=drop-shadow(1px 1px 0 red)]||B313').svgCode))
        .toEqual(Array(6).fill([-1.75, -1.75, 11.5, 23.5]));
    });
  });

  describe('when a raw key writes a grid line\'s width', () => {
    it('covers the line at the width the key writes, inside a margin', () => {
      // the sky line draws from x -2.5 to 10.5; sized by the option's 0.166,
      // the region was cut at -1.383 and 9.383, inside the picture
      expect(regionsOf(build('[grid;margin=5;grid-line--sky--stroke-width=5;grid-line--sky--filter=blur(0.1px)]||B313').svgCode))
        .toEqual([[-3.8, -5.3, 15.6, 30.6]]);
    });

    it('covers a line reaching past the picture\'s edge, where a host lets it show', () => {
      // the major lines at x=0 and y=0 draw from -2.5, past the viewBox's -0.75
      expect(regionsOf(build('[grid;grid-line--major--stroke-width=5;grid-line--major--filter=blur(0.1px)]||B313').svgCode))
        .toEqual(Array(3).fill([-2.8, -2.8, 13.6, 25.6]));
    });

    it('covers it at the width the options object writes', () => {
      const svg = new BlissSVGBuilder('[margin=5]||B313', { grid: true, 'grid-line--sky--stroke-width': 5, 'grid-line--sky--filter': 'blur(0.1px)' }).svgCode;

      expect(regionsOf(svg)).toEqual([[-3.8, -5.3, 15.6, 30.6]]);
    });

    it.each([
      ['on the line\'s own filter', 'grid-line--sky--stroke-width=5', 'grid-sky-stroke-width=5', 'grid-line--sky--filter=blur(0.1px)'],
      ['on the group\'s filter', 'grid-line--sky--stroke-width=5', 'grid-sky-stroke-width=5', 'grid--filter=blur(0.1px)'],
      ['on every line, by the key they share', 'grid-line--stroke-width=5', 'grid-stroke-width=5', 'grid-line--filter=blur(0.1px)'],
      ['by the most specific key', 'grid-line--stroke-width=1;grid-line--sky--stroke-width=5', 'grid-stroke-width=1;grid-sky-stroke-width=5',
        'grid--filter=blur(0.1px);grid-line--filter=blur(0.1px)'],
      ['at a width thinner than the default', 'grid-line--sky--stroke-width=0.05', 'grid-sky-stroke-width=0.05', 'grid-line--sky--filter=blur(0.1px)'],
      ['at a zero width', 'grid-line--sky--stroke-width=0', 'grid-sky-stroke-width=0', 'grid-line--sky--filter=blur(0.1px)'],
      ['on a line given round ends', 'grid-line--sky--stroke-width=5;grid-line--sky--stroke-linecap=round',
        'grid-sky-stroke-width=5;grid-line--sky--stroke-linecap=round', 'grid-line--sky--filter=blur(0.1px)'],
      // note: a non-scaling width is drawn in screen pixels; read as picture
      // units it covers the line wherever a unit is drawn at least a pixel wide
      ['on a line given a vector-effect', 'grid-line--sky--stroke-width=5;grid-line--sky--vector-effect=non-scaling-stroke',
        'grid-sky-stroke-width=5;grid-line--sky--vector-effect=non-scaling-stroke', 'grid-line--sky--filter=blur(0.1px)'],
    ])('draws the region its width option draws, %s', (_case, key, option, filter) => {
      expect(regionsOf(build(`[grid;margin=5;${key};${filter}]||B313`).svgCode))
        .toEqual(regionsOf(build(`[grid;margin=5;${option};${filter}]||B313`).svgCode));
    });

    // pins the width read as CSS reads a number, in each form CSS reads
    it.each([
      ['with a sign', '+5'],
      ['as a bare fraction with an exponent', '.5e1'],
      ['with a capital, signed exponent', '0.5E+1'],
      ['padded with every whitespace CSS skips', '"\t\n\f\r 5\t\n\f\r "'],
    ])('draws the region a width of 5 draws, written %s', (_case, width) => {
      expect(regionsOf(build(`[grid;margin=5;grid-line--sky--stroke-width=${width};grid-line--sky--filter=blur(0.1px)]||B313`).svgCode))
        .toEqual(regionsOf(build('[grid;margin=5;grid-line--sky--stroke-width=5;grid-line--sky--filter=blur(0.1px)]||B313').svgCode));
    });

    // note: the renderer resolves a width the number grammar cannot read
    // (`5px` as 5 units, a word or a negative one as the inherited width); the
    // region keeps the option's width, as the line keeps its plain extents
    it.each([
      '5px', 'abc', '-1', '1e400',
      // pins the width read as CSS reads a number: a renderer refuses a
      // trailing point and a no-break space, which the DSL's own grammar reads
      '5.', '"5 "',
    ])('keeps the option\'s region where the key\'s width %s is no number', (width) => {
      expect(regionsOf(build(`[grid;margin=5;grid-line--sky--stroke-width=${width};grid-line--sky--filter=blur(0.1px)]||B313`).svgCode))
        .toEqual(regionsOf(build('[grid;margin=5;grid-line--sky--filter=blur(0.1px)]||B313').svgCode));
    });
  });

  describe('when a filtered element is a link', () => {
    it.each([
      ['its padded rect', 'B313//[href=#a;link-padding=6;filter=blur(1px)]|B291//B313', [6, -9, 28, 38]],
      ['its lines widened by its padding, under link-area=ink', 'B313//[link-area=ink;link-padding=2;href=#a;filter=blur(1px)]|B291//B313',
        [9.75, -3.75, 20.5, 27.5]],
      // B81's rect reaches 0.25 past its lines: the cut moves from -1.25 to -1.5
      ['a part\'s rect', 'B313;[href=#a;filter=blur(1px)]>B81', [-1.5, -3.75, 11, 27.5]],
      // C8 is one shape, drawn without a part of its own: the rect spans x 12
      // to 32; cut to the circle's lines, the region would span 13.75 to 30.25
      ['a one-shape part\'s padded rect', 'B313//B313;[href=#a;link-padding=6;filter=blur(1px)]>C8:2,8//B313', [8, -3.75, 28, 28.75]],
    ])('covers where the link answers a click: %s', (_case, input, region) => {
      // Firefox and WebKit answer a click only inside the filter region, so a
      // region cut to the ink would stop the link answering in its padding
      expect(regionsOf(build(input).svgCode)).toEqual([region]);
    });

    it('judges a thin linked element by its lines, not by the link\'s rect', () => {
      const svg = build('[href=#a;filter=drop-shadow(1px 1px 0 red)]HL8').svgCode;

      expect(regionsOf(svg)).toEqual([[-2, -2, 12, 24]]);
      expect(svg).toContain('</filter><rect x="0" y="-0.5" width="8" height="1" fill="none" stroke="none"/><rect x="-1" y="-1"');
    });
  });

  describe('when an effect reaches far past the picture', () => {
    it.each([
      ['a word alone', '[filter=blur(200px)]|B313/B291', [-8.75, -8.75, 35.5, 37.5]],
      ['a word inside a longer line, whole along it', 'B313//[filter=blur(200px)]|B291//B313', [-8.75, -8.75, 57.5, 37.5]],
    ])('grows the region no more than 8 units past the picture: %s', (_case, input, region) => {
      // blur(200px) reaches 600: grown by all of it, one word's region would
      // hold over a gigapixel at 30 px per unit
      expect(regionsOf(build(input).svgCode)).toEqual([region]);
    });
  });
});
