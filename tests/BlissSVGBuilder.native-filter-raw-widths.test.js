import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a native filter's region covers an element background, and the
 * symbol's lines, at the width a raw `stroke-width` key draws them: an ink
 * area at the width written on it, a box given a stroke at the width it is
 * stroked with, and the lines at the width written on the content group.
 *
 * Covers:
 * - An ink area's width: the key both backgrounds share and the ink area's
 *   own, written globally and on the element, the most specific and the
 *   nearest key winning, a width thinner than the options draw; a character
 *   inside the area that states its own width keeping it; the copy of an
 *   element's effects around the area, a filtered character's copy inside
 *   the area, and the content group's region following.
 * - A box given a stroke: at the width written on it, else the width it
 *   inherits from the content group (a raw key or the option), never the
 *   element's own width option; no stroke, or `none`, leaves the box as it
 *   was; the content group's region following.
 * - The content group's width: a filtered character, a word whose character
 *   states its own width, the content group's own filter, a width thinner
 *   than the option; a filtered line's invisible shape judged by the width it
 *   is drawn at; a link under `link-area=ink` covered both where its lines
 *   draw and where its transparent lines, sized from the options, answer.
 * - A width the number grammar cannot read, or CSS refuses as a number (a
 *   trailing point, a no-break space): an ink area and a box keep the region
 *   the options give, the content group's lines draw the region of the
 *   initial width they inherit, over a thinner option.
 *
 * Does NOT cover:
 * - A grid line's raw width, and regions sized by the options alone, see
 *   `BlissSVGBuilder.native-filter-regions.test.js`.
 * - What an unread width inherits from the groups around it, the root's
 *   width and miter limit among them, see
 *   `BlissSVGBuilder.native-filter-inherited-strokes.test.js`.
 * - What a raw content width does to what the library draws itself: an ink
 *   area, a link's transparent lines and a dot keep the widths the options
 *   compute (pinned here only as far as the ink area's region follows them).
 * - A width set by a `style` key or the page's CSS, and a stroke on the paper
 *   or a zone, whose filter region spans the whole picture.
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
// Each <filter>'s region as [x, y, width, height], in the order the markup writes them.
const regionsOf = (svg) => [...svg.matchAll(/<filter id="[^"]*" filterUnits="userSpaceOnUse" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
  .map(match => match.slice(1).map(Number));
const THIN_SHAPE = '<rect x="0" y="-0.5" width="8" height="1" fill="none" stroke="none"/>';

describe('BlissSVGBuilder native filter raw widths', () => {
  describe('when a raw key writes an ink area\'s width', () => {
    it('covers the area at the width the key writes, inside a margin', () => {
      // the middle B313 spans x 16 to 24, its area drawn 3 past it; sized by
      // the options' 1.3, the region was cut at 14.05 and 25.95
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=6;element-background--ink--filter=blur(0.1px)]||B313//[background=yellow;background-area=ink]B313//B313').svgCode))
        .toEqual([[11.7, -5.3, 16.6, 30.6]]);
    });

    // background-padding=2.75 draws the area at 0.5 + 2 x 2.75 = 6, the same width
    it.each([
      ['by the key both backgrounds share, written globally',
        '[margin=5;element-background--stroke-width=6;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313'],
      ['by the ink area\'s own key, written on the element',
        '[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;element-background--ink--stroke-width=6]B313'],
      ['by the most specific key',
        '[margin=5;element-background--stroke-width=1;element-background--ink--stroke-width=6;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313'],
      ['by the nearest key',
        '[margin=5;element-background--ink--stroke-width=1;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;element-background--ink--stroke-width=6]B313'],
      ['by a key over the element\'s own width option',
        '[margin=5;element-background--ink--stroke-width=6;element-background--ink--filter=blur(0.1px)]||[stroke-width=2;background=yellow;background-area=ink]B313'],
    ])('draws the region its padding option draws, %s', (_case, input) => {
      expect(regionsOf(build(input).svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;background-padding=2.75]B313').svgCode));
    });

    it('draws the region its width options draw at a width thinner than theirs', () => {
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=0.1;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink;stroke-width=0.1;background-padding=0]B313').svgCode));
    });

    it('keeps the width a character inside the area states itself', () => {
      // B313 (x 0 to 8) takes the key's 0.1; B291 (x 10 to 18) keeps its own
      // 4, widened by the area's 0.8 to 4.8, and draws 2.4 past its geometry
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=0.1;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]|B313/[stroke-width=4]B291').svgCode))
        .toEqual([[-1.35, -5.3, 23.05, 30.6]]);
    });

    it('widens the copy of the element\'s effects around the area', () => {
      // the copy first, then the lines' own, which the key does not reach
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=6]||[background=yellow;background-area=ink;filter=grayscale(1)]B313').svgCode))
        .toEqual([[-4, -5, 16, 30], [-1.25, -5, 10.5, 30]]);
    });

    it('widens a filtered character\'s copy inside its word\'s area', () => {
      // B291 (x 10 to 18) is drawn in the area at the key's 6: its copy there
      // first, then its lines' own
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=6]||[background=yellow;background-area=ink]|B313/[filter=blur(0.1px)]B291').svgCode))
        .toEqual([[5.7, -5.3, 16.6, 30.6], [8.45, -5.3, 11.1, 30.6]]);
    });

    it.each([
      ['written globally', '[margin=5;content--filter=blur(0.1px);element-background--ink--stroke-width=6]||[background=yellow;background-area=ink]B313'],
      ['written on the element', '[margin=5;content--filter=blur(0.1px)]||[background=yellow;background-area=ink;element-background--ink--stroke-width=6]B313'],
    ])('widens the content group\'s region to the area, the key %s', (_case, input) => {
      expect(regionsOf(build(input).svgCode)).toEqual([[-4.3, -5.3, 16.6, 30.6]]);
    });

    it('keeps the options\' region where the key\'s width is no number', () => {
      expect(regionsOf(build('[margin=5;element-background--ink--stroke-width=5px;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313').svgCode));
    });

    // pins the width read as CSS reads a number: a renderer refuses a trailing
    // point and a no-break space, which the DSL's own grammar reads, and draws
    // the area at the width it inherits
    it.each(['5.', '"5 "'])('keeps the options\' region where CSS reads the key\'s width %s as no number', (width) => {
      expect(regionsOf(build(`[margin=5;element-background--ink--stroke-width=${width};element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313`).svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--ink--filter=blur(0.1px)]||[background=yellow;background-area=ink]B313').svgCode));
    });
  });

  describe('when a raw key gives a box background a stroke', () => {
    const boxed = '[margin=5;element-background--box--stroke=red;element-background--box--stroke-width=4;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313';

    it('covers the box at the width it is stroked with, inside a margin', () => {
      // the middle box spans x 15 to 25, its outline drawn 2 past it; sized
      // by the box alone, the region was cut at 13.7 and 26.3
      expect(regionsOf(build(boxed).svgCode)).toEqual([[11.7, -5.3, 16.6, 30.6]]);
    });

    it.each([
      ['by the content group\'s raw key', '[margin=5;content--stroke-width=4;element-background--stroke=red;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313'],
      ['by the width option', '[margin=5;stroke-width=4;element-background--box--stroke=red;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313'],
      ['by keys written on the element', '[margin=5;element-background--box--filter=blur(0.1px)]||B313//[background=yellow;element-background--box--stroke=red;element-background--box--stroke-width=4]B313//B313'],
    ])('covers the stroke at the width it is drawn with, set %s', (_case, input) => {
      expect(regionsOf(build(input).svgCode)).toEqual(regionsOf(build(boxed).svgCode));
    });

    it('covers the stroke at the content group\'s width, not the element\'s own', () => {
      // the box sits outside the element's lines, so the element's 4 never
      // reaches it: stroked at the content group's 0.5, it draws 0.25 past
      expect(regionsOf(build('[margin=5;element-background--box--stroke=red;element-background--box--filter=blur(0.1px)]||B313//[stroke-width=4;background=yellow]B313//B313').svgCode))
        .toEqual([[13.45, -5.3, 13.1, 30.6]]);
    });

    it.each([
      ['a stroke of none', 'element-background--box--stroke=none;element-background--box--stroke-width=4'],
      ['a width with no stroke', 'element-background--box--stroke-width=4'],
    ])('leaves the region as the box draws it, given %s', (_case, keys) => {
      expect(regionsOf(build(`[margin=5;${keys};element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313`).svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313').svgCode));
    });

    it('covers the stroke at the inherited width where the key\'s width is no number', () => {
      expect(regionsOf(build('[margin=5;element-background--box--stroke=red;element-background--box--stroke-width=5px;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--box--stroke=red;element-background--box--filter=blur(0.1px)]||B313//[background=yellow]B313//B313').svgCode));
    });

    it('widens the content group\'s region to the stroke', () => {
      // the box spans x -1 to 9, its outline drawn 2 past it
      expect(regionsOf(build('[margin=5;content--filter=blur(0.1px);element-background--box--stroke=red;element-background--box--stroke-width=4]||[background=yellow]B313').svgCode))
        .toEqual([[-4.3, -5.3, 16.6, 30.6]]);
    });
  });

  describe('when a raw key writes the content group\'s width', () => {
    it.each([
      ['a filtered character', 'margin=5', 'B313//[filter=blur(0.1px)]B313//B313'],
      ['a filtered word whose character states its own width', 'margin=5', '[filter=blur(0.1px)]|B313/[stroke-width=1]B291'],
      ['the content group\'s own filter', 'margin=5;content--filter=blur(0.1px)', 'B313'],
      ['a filtered line', 'margin=5', '[filter=drop-shadow(1px 1px 0 red)]HL8'],
    ])('draws the region its width option draws, on %s', (_case, keys, code) => {
      expect(regionsOf(build(`[${keys};content--stroke-width=5]||${code}`).svgCode))
        .toEqual(regionsOf(build(`[${keys};stroke-width=5]||${code}`).svgCode));
    });

    it('draws the region of the width it writes, thinner than the option', () => {
      expect(regionsOf(build('[margin=5;stroke-width=2;content--stroke-width=0.1]||B313//[filter=blur(0.1px)]B313//B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;stroke-width=0.1]||B313//[filter=blur(0.1px)]B313//B313').svgCode));
    });

    it('drops a filtered line\'s invisible shape where the key draws the line wide', () => {
      expect(build('[margin=5;content--stroke-width=5]||[filter=drop-shadow(1px 1px 0 red)]HL8').svgCode).not.toContain(THIN_SHAPE);
    });

    it('gives a filtered line the invisible shape where the key draws it thin', () => {
      expect(build('[margin=5;stroke-width=2;content--stroke-width=0.1]||[filter=drop-shadow(1px 1px 0 red)]HL8').svgCode).toContain(THIN_SHAPE);
    });

    // note: the renderer reads `5px` as 5 units, which the library does not
    // read; it counts as a width the renderer cannot read, drawn at the one
    // the content group inherits, the initial 1, over the option's 0.5
    it('draws the region of the initial width where the key\'s width is no number', () => {
      expect(regionsOf(build('[margin=5;content--stroke-width=5px]||B313//[filter=blur(0.1px)]B313//B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;content--stroke-width=1]||B313//[filter=blur(0.1px)]B313//B313').svgCode));
    });

    it('keeps an ink area\'s region at the width the options draw the area', () => {
      // note: the area is drawn at the options' widths, not the key's, so it
      // keeps the region it had without the key
      expect(regionsOf(build('[margin=5;content--stroke-width=5;element-background--ink--filter=blur(0.1px)]||B313//[background=yellow;background-area=ink]B313//B313').svgCode))
        .toEqual(regionsOf(build('[margin=5;element-background--ink--filter=blur(0.1px)]||B313//[background=yellow;background-area=ink]B313//B313').svgCode));
    });

    it('covers a link\'s lines under link-area=ink at the width the key writes', () => {
      // the middle B313 (x 16 to 24) is drawn 2.5 past its geometry; its
      // transparent lines, at the options' 1.3, stay inside that
      expect(regionsOf(build('[margin=5;content--stroke-width=5]||B313//[href=#a;link-area=ink;filter=blur(0.1px)]B313//B313').svgCode))
        .toEqual([[12.2, -5.3, 15.6, 30.6]]);
    });

    it('covers a link\'s transparent lines under link-area=ink at the options\' width', () => {
      // drawn at the key's 0.1, the lines answer a click through their
      // transparent copy at the option's 5 plus 0.8, 2.9 past the geometry
      expect(regionsOf(build('[margin=5;stroke-width=5;content--stroke-width=0.1]||B313//[href=#a;link-area=ink;filter=blur(0.1px)]B313//B313').svgCode))
        .toEqual([[11.8, -5.3, 16.4, 30.6]]);
    });
  });
});
