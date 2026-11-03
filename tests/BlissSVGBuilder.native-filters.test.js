import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how a CSS `filter` written on a word, a character or a part is drawn:
 * as a native `<filter>` first inside the element's own group, in the channel
 * the author used, with a region covering the picture and the element's ink,
 * an invisible shape where the element is too thin for WebKit to draw
 * filtered, and its own copy wherever the element's effects are copied.
 *
 * Covers:
 * - The design's example, and both channels (`filter`, `style`) kept, the
 *   rest of a `style` left in place, two channels on one element numbered in
 *   attribute order.
 * - Each level (word, character, part), nested levels numbered outermost
 *   first.
 * - The region: the viewBox and the element's drawn box (each line widened by
 *   half its own width), grown by the reach, including ink a crop leaves
 *   outside the viewBox, cut along the line past the element's own ink; the
 *   viewBox alone for an element that draws nothing.
 * - The thin-element shape: after the `<filter>`, 1 unit across in each thin
 *   dimension, for a line, a dot and a vertical line; none for a line drawn
 *   wide enough, or for B313.
 * - The copies of an element's effects (an element background's box or ink
 *   area, a word's ink area carrying a descendant's, a `link-area=ink`
 *   link's lines): each with its own `<filter>` and a region from what it
 *   holds.
 * - A link: its `<filter>` before the transparent rect, the region covering
 *   the rect.
 * - A drop-shadow drawn from SVG 1.1 primitives at every level and on a copy,
 *   with no `<feDropShadow>` anywhere in the picture.
 * - A value left untranslated, a `url()` and `none` written exactly as today,
 *   and reported nowhere.
 *
 * Does NOT cover:
 * - Routes, saves, ids and `svgContent`, see
 *   `BlissSVGBuilder.native-filter-ids.test.js`.
 * - The picture's layers and the whole symbol, see
 *   `BlissSVGBuilder.native-filter-layers.test.js`; the copy around a box
 *   and an ink area in the ordinary case, see
 *   `BlissSVGBuilder.background-effects.test.js`.
 * - How the result draws: a blur or a shadow against its CSS form, see
 *   `BlissSVGBuilder.native-filters.e2e.test.js` (browsers and resvg are
 *   measured outside the suite); how far a region reaches in a longer line,
 *   past the filters inside the element, or past a link's padding, see
 *   `BlissSVGBuilder.native-filter-regions.test.js`.
 * - A copy too thin to draw filtered (an ink area at `background-padding=0`):
 *   no shape is pinned for a copy.
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
// The picture's filter hash, read from its first id: 8 hex digits, or nothing.
const hashOf = (svg) => svg.match(/bliss-filter-([0-9a-f]{8})-\d/)?.[1];
const idIn = (svg, n) => `bliss-filter-${hashOf(svg)}-${n}`;
// One <filter> as the translation writes it, its region as [x, y, width, height].
const filterDef = (id, [x, y, width, height], primitives) => `<filter id="${id}" filterUnits="userSpaceOnUse"`
  + ` x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB">${primitives}</filter>`;
const ghost = (x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="none"/>`;
const box = (x, y, width, height, paint) =>
  `<rect class="bliss-element-background bliss-element-background--box" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"/>`;
const inkArea = (paint, width, lines) =>
  `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="${paint}" stroke-width="${width}">${lines}</g>`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B81 = '<path d="M3,6l1,-2M4,4l1,2"/>';
const B291_AT_10 = '<path d="M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const BLUR_1 = '<feGaussianBlur stdDeviation="1"/>';
// drop-shadow(1px 1px 0 red), first in its value
const SHADOW_RED = '<feOffset result="shadow-input-0"/><feOffset dx="1" dy="1" result="shadow-offset-0"/>'
  + '<feFlood flood-color="red"/><feComposite in2="shadow-offset-0" operator="in"/>'
  + '<feMerge><feMergeNode/><feMergeNode in="shadow-input-0"/></feMerge>';
const GRAYSCALE_1 = '<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>';
// Regions derived from the viewBox (B313: -0.75 -0.75 9.5 21.5; B313/B291:
// -0.75 -0.75 19.5 21.5), each drawn box lying inside it, grown by the reach,
// and cut along x 1 unit past the reach from what the element draws (B313
// -0.25..8.25, B291 9.75..18.25).
const B313_BLUR = [-3.75, -3.75, 15.5, 27.5];
const WORD_BLUR = [-3.75, -3.75, 25.5, 27.5];
const B313_IN_WORD_BLUR = [-3.75, -3.75, 16, 27.5];
const B291_IN_WORD_BLUR = [5.75, -3.75, 16, 27.5];
// crop-left=6 (viewBox 5.25 -0.75 13.5 21.5) leaves B313 left of the viewBox
const B313_CROPPED_BLUR = [-3.25, -3.75, 15.5, 27.5];

describe('BlissSVGBuilder native filters', () => {
  describe('when a filter is written on an element', () => {
    it('draws the design example as a native filter, first in the element\'s group', () => {
      const svg = build('[style=filter:drop-shadow(1px 1px 0 red)]B313').svgCode;

      expect(contentOf(svg)).toBe(`<g style="filter:url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-1.75, -1.75, 11.5, 23.5], SHADOW_RED)}${B313}</g>`);
    });

    it('keeps the filter attribute as the channel', () => {
      const svg = build('[filter=blur(1px)]B313').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), B313_BLUR, BLUR_1)}${B313}</g>`);
    });

    it('rewrites the filter declaration in place, leaving the rest of the style', () => {
      const svg = build('[style="color:red;filter:blur(1px);opacity:0.5"]B313').svgCode;

      expect(contentOf(svg)).toBe(`<g style="color:red;filter:url(#${idIn(svg, 1)});opacity:0.5">${filterDef(idIn(svg, 1), B313_BLUR, BLUR_1)}${B313}</g>`);
    });

    it('gives each channel on one element its own filter, numbered in attribute order', () => {
      const svg = build('[filter=blur(1px);style=filter:grayscale(1)]B313').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})" style="filter:url(#${idIn(svg, 2)})">`
        + `${filterDef(idIn(svg, 1), B313_BLUR, BLUR_1)}${filterDef(idIn(svg, 2), [-0.75, -0.75, 9.5, 21.5], GRAYSCALE_1)}${B313}</g>`);
    });
  });

  describe('when a filter is written at each level', () => {
    it.each([
      ['a word', '[filter=blur(1px)]|B313/B291', (f) => `<g filter="url(#${f.id})">${f.def}${B313_B291}</g>`, WORD_BLUR],
      ['a character', 'B313/[filter=blur(1px)]B291', (f) => `${B313}<g filter="url(#${f.id})">${f.def}${B291_AT_10}</g>`, B291_IN_WORD_BLUR],
      // B81 is drawn 2.75..5.25: the cut sits 4 past it on each side
      ['a part', 'B313;[filter=blur(1px)]>B81', (f) => `${B313}<g filter="url(#${f.id})">${f.def}${B81}</g>`, [-1.25, -3.75, 10.5, 27.5]],
    ])('puts the filter first in %s\'s own group', (_level, input, markup, region) => {
      const svg = build(input).svgCode;
      const id = idIn(svg, 1);

      expect(contentOf(svg)).toBe(markup({ id, def: filterDef(id, region, BLUR_1) }));
    });

    it('gives each nested level its own filter, numbered outermost first', () => {
      // the word spreads its own 3 plus its character's 6, grown by 8 at most;
      // the part reaches nothing, so its region is cut 1 unit past B81
      const svg = build('[filter=blur(1px)]|[filter=blur(2px)]B313;[filter=grayscale(1)]>B81').svgCode;
      const [word, character, part] = [1, 2, 3].map(n => idIn(svg, n));

      expect(contentOf(svg)).toBe(`<g filter="url(#${word})">${filterDef(word, [-8.75, -8.75, 25.5, 37.5], BLUR_1)}`
        + `<g filter="url(#${character})">${filterDef(character, [-6.75, -6.75, 21.5, 33.5], '<feGaussianBlur stdDeviation="2"/>')}${B313}`
        + `<g filter="url(#${part})">${filterDef(part, [1.75, -0.75, 4.5, 21.5], GRAYSCALE_1)}${B81}</g></g></g>`);
    });
  });

  describe('when the element\'s ink lies outside the viewBox', () => {
    it('widens the region to the drawn box, not only the viewBox', () => {
      // crop-left=6 gives viewBox 5.25 -0.75 13.5 21.5; B313 is drawn from
      // -0.25, so the region starts at -3.25, not at the viewBox's 2.25
      const svg = build('[crop-left=6]||[filter=blur(1px)]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), B313_CROPPED_BLUR, BLUR_1)}${B313}</g>${B291_AT_10}`);
    });

    it('widens the region by the element\'s own line width', () => {
      // a 2-wide line reaches 1 unit past its geometry, past VL8's viewBox
      const svg = build('[stroke-width=2;filter=drop-shadow(1px 1px 0 red)]VL8').svgCode;

      expect(contentOf(svg)).toBe(`<g stroke-width="2" filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-2, -2, 4, 23.75], SHADOW_RED)}<path d="M0,0v8"/></g>`);
    });

    it('widens the region by each line\'s own width, not the filtered element\'s', () => {
      // pins the drawn box widened per line: the word's own width (0.5) would
      // leave VL8 thin, adding a shape, and the region inside the viewBox
      const svg = build('[filter=drop-shadow(1px 1px 0 red)]|[stroke-width=2]VL8').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-2, -2, 4, 23.75], SHADOW_RED)}`
        + '<g stroke-width="2"><path d="M0,0v8"/></g></g>');
    });
  });

  describe('when a filtered element draws nothing', () => {
    it('covers the viewBox alone and adds no shape, for an empty word', () => {
      // viewBox -0.75 9.25 1.5 11.5: the empty word's origin, at y=0, would
      // pull the region up to -3.25 and, as a point, be judged thin
      const svg = build('[crop-top=10]||[filter=blur(1px)]|').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-3.75, 6.25, 7.5, 17.5], BLUR_1)}</g>`);
    });
  });

  describe('when a filtered element is under 1 unit wide or tall', () => {
    it('adds an invisible shape after the filter, 1 unit across the line, for HL8', () => {
      const svg = build('[filter=drop-shadow(1px 1px 0 red)]HL8').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-1.75, -1.75, 11.5, 23.5], SHADOW_RED)}`
        + `${ghost(0, -0.5, 8, 1)}<path d="M0,0h8"/></g>`);
    });

    it('adds a 1 by 1 shape around a dot', () => {
      const svg = build('[filter=drop-shadow(1px 1px 0 red)]DOT').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-1.75, -1.75, 3.5, 23.5], SHADOW_RED)}`
        + `${ghost(-0.5, -0.5, 1, 1)}<g stroke-width="0.4165"><path d="M-0.20825,0a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"/></g></g>`);
    });

    it.each([
      ['VL8', ghost(-0.5, 0, 1, 8)],
      ['SDOT', ghost(-0.5, -0.5, 1, 1)],
    ])('adds a shape right after the filter for %s', (code, shape) => {
      expect(contentOf(build(`[filter=drop-shadow(1px 1px 0 red)]${code}`).svgCode)).toContain(`</filter>${shape}`);
    });

    it.each([
      '[stroke-width=2;filter=drop-shadow(1px 1px 0 red)]VL8',
      '[filter=drop-shadow(1px 1px 0 red)]B313',
    ])('adds no shape where the drawn box reaches 1 unit: %s', (input) => {
      const svg = build(input).svgCode;

      expect(svg).toContain('<filter ');
      expect(svg).not.toContain('fill="none" stroke="none"/>');
    });
  });

  describe('when the element\'s effects are copied', () => {
    it('gives the copy around a box its own filter, its region from the box', () => {
      const svg = build('[crop-left=6]||[filter=blur(1px);background=yellow]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-4, -4, 17, 28], BLUR_1)}${box(-1, -1, 10, 22, 'yellow')}</g>`
        + `<g filter="url(#${idIn(svg, 2)})">${filterDef(idIn(svg, 2), B313_CROPPED_BLUR, BLUR_1)}${B313}</g>${B291_AT_10}`);
    });

    it('gives the copy around an ink area a region from the lines widened by the area\'s outline', () => {
      // the area reaches 0.4 past the lines' own 0.25: from -0.65, region -3.65
      const svg = build('[crop-left=6]||[filter=blur(1px);background-area=ink;background=yellow]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-3.65, -3.75, 16.3, 27.5], BLUR_1)}${inkArea('yellow', 1.3, B313)}</g>`
        + `<g filter="url(#${idIn(svg, 2)})">${filterDef(idIn(svg, 2), B313_CROPPED_BLUR, BLUR_1)}${B313}</g>${B291_AT_10}`);
    });

    it.each([
      ['', [-3.75, -3.75, 16.4, 27.5], B313_IN_WORD_BLUR],
      ['[crop-left=6]||', [-3.65, -3.75, 16.3, 27.5], B313_CROPPED_BLUR],
    ])('translates a descendant\'s filter in its word\'s ink area too, %j', (globals, haloRegion, linesRegion) => {
      const svg = build(`${globals}[background-area=ink;background=yellow]|[filter=blur(1px)]B313/B291`).svgCode;
      const lines = (n, region) => `<g filter="url(#${idIn(svg, n)})">${filterDef(idIn(svg, n), region, BLUR_1)}${B313}</g>${B291_AT_10}`;

      expect(contentOf(svg)).toBe(`${inkArea('yellow', 1.3, lines(1, haloRegion))}${lines(2, linesRegion)}`);
    });

    it('translates a descendant\'s filter in a link\'s ink lines', () => {
      // the transparent copy is drawn 0.4 wider, the link's padding
      const svg = build('[link-area=ink;href=#a]|B313/[filter=blur(1px)]B291').svgCode;
      const lines = (n, region) => `${B313}<g filter="url(#${idIn(svg, n)})">${filterDef(idIn(svg, n), region, BLUR_1)}${B291_AT_10}</g>`;

      expect(contentOf(svg)).toBe(`<a href="#a" style="cursor: pointer;"><g fill="none" stroke="transparent" stroke-width="1.3">`
        + `${lines(1, [5.35, -3.75, 16.4, 27.5])}</g>${lines(2, B291_IN_WORD_BLUR)}</a>`);
    });
  });

  describe('when a filtered element is a link', () => {
    it('puts the filter before the link\'s rect, its region covering the rect', () => {
      // the rect runs -1..9 x -1..21, past B313's viewBox: Firefox answers a
      // click only inside the filter region
      const svg = build('[href=#a;filter=blur(1px)]B313').svgCode;

      expect(contentOf(svg)).toBe(`<a href="#a" style="cursor: pointer;"><g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-4, -4, 16, 28], BLUR_1)}`
        + `<rect x="-1" y="-1" width="10" height="22" fill="transparent" stroke="none"/>${B313}</g></a>`);
    });
  });

  describe('when a drop-shadow is drawn', () => {
    it.each([
      ['a word', '[filter=drop-shadow(1px 1px red)]|B313/B291'],
      ['a character', 'B313/[filter=drop-shadow(1px 1px 2px red)]B291'],
      ['a part', 'B313;[style=filter:drop-shadow(1px 1px red)]>B81'],
      ['an element background\'s copy', '[filter=drop-shadow(1px 1px red);background=yellow]B313'],
    ])('draws it on %s with no feDropShadow in the picture', (_case, input) => {
      // regression: a renderer without <feDropShadow> (node-canvas's Linux
      // build, librsvg 2.52.8) drew nothing of a shadowed element
      const svg = build(input).svgCode;

      expect(svg).toContain('<feFlood flood-color="red"/>');
      expect(svg).not.toContain('feDropShadow');
    });
  });

  describe('when a filter is not translated', () => {
    it.each([
      ['[filter=blur(1em)]B313', `<g filter="blur(1em)">${B313}</g>`],
      ['[filter=url(#mine)]B313', `<g filter="url(#mine)">${B313}</g>`],
      ['[style=filter:none]B313', `<g style="filter:none">${B313}</g>`],
      ['[style="filter:blur(1em);color:red"]B313', `<g style="filter:blur(1em);color:red">${B313}</g>`],
    ])('writes %s exactly as before, reporting nothing', (input, markup) => {
      // note: the library never judges a value it carries for CSS, so a
      // filter it cannot translate raises no warning
      const builder = build(input);
      const svg = builder.svgCode;

      expect(contentOf(svg)).toBe(markup);
      expect(svg).not.toContain('<filter');
      expect(builder.warnings).toEqual([]);
    });
  });
});
