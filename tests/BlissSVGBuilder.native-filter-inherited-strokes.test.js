import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a native filter's region covers a line drawn at the width or
 * miter limit its group inherits: where a key writes a value a renderer
 * cannot read, or writes none, the renderer draws the one the groups around
 * the line write, up to the root, and the region reads the same chain, never
 * below the width the options give.
 *
 * Covers:
 * - The content group's width written as a word, a trailing point, a
 *   negative number, an empty value, or the CSS-wide `inherit`, `unset` and
 *   `initial`: drawn at the root's width where it reads as one (CSS refuses
 *   a trailing point or a no-break space there too), else at the initial 1;
 *   an option wider than that keeping its own region; a root
 *   width that does not reach the lines where the content group writes its
 *   own; the content group's own filter; a miter multiplying the width.
 * - An element background, drawn inside the content group: an ink area's
 *   unread width drawn at the content group's, where that is the wider; a
 *   box's outline at the width the root gives the content group.
 * - A grid line's unread width: drawn at the grid group's width where it
 *   reads as one, else the root's; the grid group's own filter; a line width that reads, or none,
 *   keeping the line's own region.
 * - The miter limit: the root's, reaching every line where nothing nearer
 *   reads as a limit, an ink area's lines too; the content group's winning
 *   over it; a join or cap on the root, which the content group's own round
 *   ones keep from the lines, unless the content group writes one a renderer
 *   cannot read.
 *
 * Does NOT cover:
 * - A width or limit that reads, see
 *   `BlissSVGBuilder.native-filter-raw-widths.test.js` and
 *   `BlissSVGBuilder.native-filter-miter-joins.test.js`; a width only the
 *   renderer reads (`5px`), read as one it cannot read, see the "no number"
 *   rows there and in `BlissSVGBuilder.native-filter-regions.test.js`.
 * - A value set by a `style` key or the page's CSS, and a stroke on the
 *   paper or a zone, whose filter region spans the whole picture.
 *
 * @issue: #34
 */

// Each <filter>'s region as [x, y, width, height], in the order the markup writes them.
const regionsFor = (input) => [...new BlissSVGBuilder(input).svgCode.matchAll(/<filter id="[^"]*" filterUnits="userSpaceOnUse" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
  .map(match => match.slice(1).map(Number));

describe('BlissSVGBuilder native filter inherited strokes', () => {
  describe('when a key writes the content group\'s width as a value a renderer cannot read', () => {
    it.each([
      ['a word', 'abc'],
      ['a trailing point', '2.'],
      ['a negative number', '-2'],
      ['an empty value', ''],
      ['inherit', 'inherit'],
      ['unset', 'unset'],
      ['initial', 'initial'],
    ])('draws the region of the initial width 1 over a thinner option, given %s', (_case, width) => {
      expect(regionsFor(`[margin=5;stroke-width=0.1;content--stroke-width=${width}]||[filter=blur(0.1px)]HL8`))
        .toEqual(regionsFor('[margin=5;stroke-width=0.1;content--stroke-width=1]||[filter=blur(0.1px)]HL8'));
    });

    it('keeps the region of an option wider than the initial width', () => {
      // pins the floor at the option's width; killed the dropped-max mutant in the 2026-11-04 hand-mutant run
      expect(regionsFor('[margin=5;stroke-width=3;content--stroke-width=abc]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;stroke-width=3]||[filter=blur(0.1px)]HL8'));
    });

    it.each(['abc', 'inherit', 'unset'])('draws the region of the root\'s width, given %s', (width) => {
      expect(regionsFor(`[margin=5;root--stroke-width=6;content--stroke-width=${width}]||[filter=blur(0.1px)]HL8`))
        .toEqual(regionsFor('[margin=5;content--stroke-width=6]||[filter=blur(0.1px)]HL8'));
    });

    it('draws the region of the initial width where the root\'s width is no number either', () => {
      expect(regionsFor('[margin=5;stroke-width=0.1;root--stroke-width=abc;content--stroke-width=abc]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;stroke-width=0.1;content--stroke-width=1]||[filter=blur(0.1px)]HL8'));
    });

    it.each([
      ['a trailing point', '2.'],
      ['a no-break space', '"2 "'],
    ])('draws the region of the initial width where the root\'s width carries %s, which CSS refuses', (_case, width) => {
      // pins CSS's number syntax on the width a line inherits; killed the
      // number-grammar mutant in the 2026-11-04 hand-mutant run
      expect(regionsFor(`[margin=5;stroke-width=0.1;root--stroke-width=${width};content--stroke-width=abc]||[filter=blur(0.1px)]HL8`))
        .toEqual(regionsFor('[margin=5;stroke-width=0.1;content--stroke-width=1]||[filter=blur(0.1px)]HL8'));
    });

    it('keeps the region of an option wider than the root\'s width', () => {
      expect(regionsFor('[margin=5;stroke-width=3;root--stroke-width=0.1;content--stroke-width=abc]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;stroke-width=3]||[filter=blur(0.1px)]HL8'));
    });

    it('covers the root\'s width under the content group\'s own filter', () => {
      expect(regionsFor('[margin=5;root--stroke-width=6;content--stroke-width=abc;content--filter=blur(0.1px)]||HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-width=6;content--filter=blur(0.1px)]||HL8'));
    });

    it('covers a miter drawn at the initial width, not the option\'s', () => {
      // regression: the region read the option's 0.1 where the line draws at 1,
      // and a limit of 10 carried a sharp tip 3 units past it, inside the picture
      expect(regionsFor('[margin=5;stroke-width=0.1;content--stroke-width=abc;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-width=1;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[filter=blur(0.1px)]HL8'));
    });
  });

  describe('when the root writes a width under the content group\'s own', () => {
    it('keeps the region of the width the content group writes', () => {
      expect(regionsFor('[margin=5;root--stroke-width=6]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5]||[filter=blur(0.1px)]HL8'));
    });
  });

  describe('when a key writes an element background\'s width as a value a renderer cannot read', () => {
    it.each(['abc', 'inherit', '2.'])('draws an ink area at the content group\'s wider width, given %s', (width) => {
      expect(regionsFor(`[margin=5;content--stroke-width=4;element-background--ink--stroke-width=${width};element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]HL8`))
        .toEqual(regionsFor('[margin=5;content--stroke-width=4;element-background--ink--stroke-width=4;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]HL8'));
    });

    it.each([
      ['given no width', ''],
      ['given a width a renderer cannot read', 'element-background--box--stroke-width=abc;'],
    ])('draws a box\'s outline at the root\'s width the content group inherits, %s', (_case, key) => {
      expect(regionsFor(`[margin=5;root--stroke-width=6;content--stroke-width=abc;element-background--box--stroke=red;${key}element-background--box--filter=blur(0.1px)]||[background=yellow]HL8`))
        .toEqual(regionsFor('[margin=5;content--stroke-width=6;element-background--box--stroke=red;element-background--box--filter=blur(0.1px)]||[background=yellow]HL8'));
    });
  });

  describe('when a key writes a grid line\'s width as a value a renderer cannot read', () => {
    it.each(['abc', 'inherit', 'unset'])('draws the region of the grid group\'s width, given %s', (width) => {
      expect(regionsFor(`[grid;margin=5;grid--stroke-width=6;grid-line--sky--stroke-width=${width};grid-line--sky--filter=blur(0.1px)]||B313`))
        .toEqual(regionsFor('[grid;margin=5;grid-line--sky--stroke-width=6;grid-line--sky--filter=blur(0.1px)]||B313'));
    });

    // pins the nearest group whose width reads, passing one that does not; in
    // the 2026-11-04 hand-mutant run the rows past a width that is no number
    // and the grid group's over the root's killed the farthest-first,
    // root-first and nearest-regardless mutants, and the two past a width CSS
    // refuses killed the number-grammar mutant
    it.each([
      ['the root\'s width', 'root--stroke-width=6'],
      ['the root\'s width past a grid group width that is no number', 'root--stroke-width=6;grid--stroke-width=abc'],
      ['the root\'s width past a grid group width CSS refuses for its trailing point', 'root--stroke-width=6;grid--stroke-width=2.'],
      ['the root\'s width past a grid group width CSS refuses for its no-break space', 'root--stroke-width=6;grid--stroke-width="2 "'],
      ['the grid group\'s width over the root\'s', 'root--stroke-width=2;grid--stroke-width=6'],
    ])('draws the region of %s', (_case, keys) => {
      expect(regionsFor(`[grid;margin=5;${keys};grid-line--sky--stroke-width=abc;grid-line--sky--filter=blur(0.1px)]||B313`))
        .toEqual(regionsFor('[grid;margin=5;grid-line--sky--stroke-width=6;grid-line--sky--filter=blur(0.1px)]||B313'));
    });

    it('keeps the region of an option wider than the width the line inherits', () => {
      // pins the floor at the option's width; killed the dropped-max mutant in the 2026-11-04 hand-mutant run
      expect(regionsFor('[grid;margin=5;grid-sky-stroke-width=3;grid-line--sky--stroke-width=abc;grid-line--sky--filter=blur(0.1px)]||B313'))
        .toEqual(regionsFor('[grid;margin=5;grid-sky-stroke-width=3;grid-line--sky--filter=blur(0.1px)]||B313'));
    });

    it('covers the line in the grid group\'s own region', () => {
      expect(regionsFor('[grid;margin=5;grid--stroke-width=6;grid--filter=blur(0.1px);grid-line--sky--stroke-width=abc]||B313'))
        .toEqual(regionsFor('[grid;margin=5;grid--filter=blur(0.1px);grid-line--sky--stroke-width=6]||B313'));
    });
  });

  describe('when the grid group writes a width over a line\'s own', () => {
    it.each([
      ['no key', ''],
      ['a key that reads', 'grid-line--sky--stroke-width=2;'],
    ])('keeps the line\'s region, given %s', (_case, key) => {
      expect(regionsFor(`[grid;margin=5;grid--stroke-width=6;${key}grid-line--sky--filter=blur(0.1px)]||B313`))
        .toEqual(regionsFor(`[grid;margin=5;${key}grid-line--sky--filter=blur(0.1px)]||B313`));
    });
  });

  describe('when the root writes a miter limit', () => {
    it('covers a miter at the root\'s limit', () => {
      expect(regionsFor('[margin=5;root--stroke-miterlimit=10;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-miterlimit=10;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'));
    });

    it('reads the root\'s limit past one the content group writes that a renderer cannot read', () => {
      expect(regionsFor('[margin=5;root--stroke-miterlimit=10;content--stroke-miterlimit=abc;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-miterlimit=10;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'));
    });

    it('keeps the content group\'s limit over the root\'s', () => {
      expect(regionsFor('[margin=5;root--stroke-miterlimit=10;content--stroke-miterlimit=2;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-miterlimit=2;content--stroke-linejoin=miter]||[filter=blur(0.1px)]HL8'));
    });

    it('covers an ink area\'s miter at the root\'s limit', () => {
      expect(regionsFor('[margin=5;root--stroke-miterlimit=10;content--stroke-linejoin=miter;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-miterlimit=10;content--stroke-linejoin=miter;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]HL8'));
    });
  });

  describe('when the root writes a join or a cap', () => {
    it.each([
      ['a miter join', 'root--stroke-linejoin=miter;root--stroke-miterlimit=10'],
      ['a square cap', 'root--stroke-linecap=square'],
    ])('keeps the region of the content group\'s own round ones, given %s', (_case, keys) => {
      // pins the round join and cap between the content group's keys and the
      // root's; killed the dropped and the reordered mutants in the
      // 2026-11-04 hand-mutant run
      expect(regionsFor(`[margin=5;${keys}]||[filter=blur(0.1px)]HL8`))
        .toEqual(regionsFor('[margin=5]||[filter=blur(0.1px)]HL8'));
    });

    it('covers the root\'s miter where the content group writes a join a renderer cannot read', () => {
      expect(regionsFor('[margin=5;root--stroke-linejoin=miter;root--stroke-miterlimit=10;content--stroke-linejoin=abc]||[filter=blur(0.1px)]HL8'))
        .toEqual(regionsFor('[margin=5;content--stroke-linejoin=miter;content--stroke-miterlimit=10]||[filter=blur(0.1px)]HL8'));
    });
  });
});
