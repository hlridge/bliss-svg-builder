import { describe, it, expect } from 'vitest';
import { filterMarkup, filterReach, filterRegion, pictureHash, readFilterValue, thinShape } from '../src/lib/bliss-filters.js';

/**
 * Pins what the filter module writes: the native primitive each CSS filter
 * function becomes, a chain of them, the `<filter>` that holds them, the
 * region it covers, the invisible shape that keeps a thin element drawn, and
 * the hash the picture's filter ids carry.
 *
 * Covers:
 * - Each of the ten functions at an ordinary and an out-of-range argument,
 *   against Filter Effects 1's matrices and transfer functions written out
 *   here; the clamps CSS applies (grayscale, sepia, invert, opacity at 1).
 * - A drop-shadow as Filter Effects 1's own equivalent in SVG 1.1 primitives,
 *   never `<feDropShadow>`: its input named, a blur (left out at 0), an
 *   offset, a flood kept inside the offset, a merge under the input; the
 *   names carry the shadow's place in the value, so two shadows never share
 *   one.
 * - Chaining: primitives in written order, each reach added.
 * - The reach: a shadow's larger offset plus three times its blur, three
 *   times a blur, nothing for a colour function; an element's, the largest
 *   among its `filter` attribute and its style's `filter` declarations.
 * - The `<filter>` markup, in user space and sRGB, its numbers as given.
 * - The region: the viewBox and the drawn box together, grown by the spread
 *   (the reach plus the outset) but by no more than 8 units, cut along x to
 *   the drawn box plus the spread and 1 unit, never cut along y; the viewBox
 *   alone, grown, where nothing is drawn; rounded to 4 decimals.
 * - The thin-element shape: 1 unit centred on the drawn box in each dimension
 *   under 1 unit, the geometry's own extent in the other, none from 1 unit up.
 * - The hash: FNV-1a 32 over UTF-16 code units, as 8 lowercase hex digits.
 *
 * Does NOT cover:
 * - Which spellings translate, see `bliss-filters.reader.test.js` and
 *   `bliss-filters.style.test.js`.
 * - The boxes the tree and the builder pass in, see
 *   `BlissSVGBuilder.native-filters.test.js` and
 *   `BlissSVGBuilder.native-filter-layers.test.js`.
 * - Whether a renderer draws the primitives as CSS draws the function, which
 *   the browser and rasterizer check measures (C9 Task 7).
 *
 * @issue: #34
 */

const primitivesOf = (value) => readFilterValue(value).primitives;
const transfer = (funcs) => `<feComponentTransfer>${funcs}</feComponentTransfer>`;
const rgbFuncs = (attributes) => ['R', 'G', 'B'].map(channel => `<feFunc${channel} ${attributes}/>`).join('');
const matrix = (values) => `<feColorMatrix type="matrix" values="${values}"/>`;
const BLUR_1 = '<feGaussianBlur stdDeviation="1"/>';
// A drop-shadow at `place` in its value, as the chain the module writes for
// it; `blur` is its feGaussianBlur, '' where it has none.
const shadowAt = (place, { dx, dy, color, blur = '' }) => `<feOffset result="shadow-input-${place}"/>${blur}`
  + `<feOffset dx="${dx}" dy="${dy}" result="shadow-offset-${place}"/><feFlood flood-color="${color}"/>`
  + `<feComposite in2="shadow-offset-${place}" operator="in"/>`
  + `<feMerge><feMergeNode/><feMergeNode in="shadow-input-${place}"/></feMerge>`;
const SHADOW_RED = shadowAt(0, { dx: 1, dy: 1, color: 'red' });
const GRAYSCALE_1 = matrix('0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0');
const SEPIA_1 = matrix('0.393 0.769 0.189 0 0 0.349 0.686 0.168 0 0 0.272 0.534 0.131 0 0 0 0 0 1 0');
// B313's viewBox, and its drawn box: geometry 0..8 x 8..16 widened by half its 0.5 line
const B313_VIEWBOX = { x: -0.75, y: -0.75, width: 9.5, height: 21.5 };
const B313_DRAWN = { minX: -0.25, minY: 7.75, maxX: 8.25, maxY: 16.25 };
// A long line's viewBox, and one word drawn in its middle
const LINE = { x: 0, y: 0, width: 100, height: 20 };
const WORD = { minX: 40, minY: 5, maxX: 50, maxY: 15 };
const ghost = (x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="none"/>`;

describe('bliss-filters primitives', () => {
  describe('when each function is mapped to its primitive', () => {
    it.each([
      ['blur(2px)', '<feGaussianBlur stdDeviation="2"/>'],
      ['drop-shadow(1px 2px 3px red)', shadowAt(0, { dx: 1, dy: 2, color: 'red', blur: '<feGaussianBlur stdDeviation="3"/>' })],
      ['drop-shadow(-1px -2px blue)', shadowAt(0, { dx: -1, dy: -2, color: 'blue' })],
      ['brightness(1.5)', transfer(rgbFuncs('type="linear" slope="1.5"'))],
      ['brightness(250%)', transfer(rgbFuncs('type="linear" slope="2.5"'))],
      ['contrast(2)', transfer(rgbFuncs('type="linear" slope="2" intercept="-0.5"'))],
      ['contrast(0.5)', transfer(rgbFuncs('type="linear" slope="0.5" intercept="0.25"'))],
      ['grayscale(0.37)', matrix('0.7087 0.2646 0.0267 0 0 0.0787 0.8946 0.0267 0 0 0.0787 0.2646 0.6567 0 0 0 0 0 1 0')],
      ['grayscale(0)', matrix('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0')],
      ['grayscale(2)', GRAYSCALE_1],
      ['sepia(0.5)', matrix('0.6965 0.3845 0.0945 0 0 0.1745 0.843 0.084 0 0 0.136 0.267 0.5655 0 0 0 0 0 1 0')],
      ['sepia(150%)', SEPIA_1],
      // pins saturate as a matrix, never type="saturate": resvg reads that
      // type's value only from 0 to 1 and draws saturate(3) unchanged
      ['saturate(0.4)', matrix('0.5278 0.429 0.0432 0 0 0.1278 0.829 0.0432 0 0 0.1278 0.429 0.4432 0 0 0 0 0 1 0')],
      ['saturate(3)', matrix('2.574 -1.43 -0.144 0 0 -0.426 1.57 -0.144 0 0 -0.426 -1.43 2.856 0 0 0 0 0 1 0')],
      ['hue-rotate(-90deg)', '<feColorMatrix type="hueRotate" values="-90"/>'],
      ['hue-rotate(450deg)', '<feColorMatrix type="hueRotate" values="450"/>'],
      ['invert(0.25)', transfer(rgbFuncs('type="table" tableValues="0.25 0.75"'))],
      ['invert(2)', transfer(rgbFuncs('type="table" tableValues="1 0"'))],
      ['opacity(0.25)', transfer('<feFuncA type="table" tableValues="0 0.25"/>')],
      ['opacity(150%)', transfer('<feFuncA type="table" tableValues="0 1"/>')],
    ])('maps %s', (value, primitive) => {
      // pins stdDeviation = R for both blurs, not R/2: the design measured R
      // equal to CSS pixel for pixel and R/2 different in every renderer
      expect(primitivesOf(value)).toEqual([primitive]);
    });
  });

  describe('when a drop-shadow is drawn', () => {
    // regression: one <feDropShadow> drew nothing of the element at all in a
    // renderer without that primitive (node-canvas's Linux build, librsvg 2.52.8)
    it('writes Filter Effects 1\'s equivalent in SVG 1.1 primitives, the shadow merged under its input', () => {
      expect(primitivesOf('drop-shadow(1px 2px 3px red)')).toEqual([
        '<feOffset result="shadow-input-0"/>'
        + '<feGaussianBlur stdDeviation="3"/>'
        + '<feOffset dx="1" dy="2" result="shadow-offset-0"/>'
        + '<feFlood flood-color="red"/>'
        + '<feComposite in2="shadow-offset-0" operator="in"/>'
        + '<feMerge><feMergeNode/><feMergeNode in="shadow-input-0"/></feMerge>',
      ]);
    });

    it.each([
      'drop-shadow(1px 1px red)',
      'drop-shadow(1px 1px 0 red)',
      'drop-shadow(1px 1px 0px red)',
      // rounds to 0, so judged as written to the markup, not as read
      'drop-shadow(1px 1px 0.00001px red)',
    ])('leaves the blur out of %s, an unblurred shadow', (value) => {
      // pins the blur left out at 0: SVG 1.1's first edition draws a zero
      // blur as transparent black, which would lose the shadow
      expect(primitivesOf(value)).toEqual([SHADOW_RED]);
    });

    it('keeps the smallest blur written', () => {
      expect(primitivesOf('drop-shadow(1px 1px 0.0001px red)'))
        .toEqual([shadowAt(0, { dx: 1, dy: 1, color: 'red', blur: '<feGaussianBlur stdDeviation="0.0001"/>' })]);
    });

    it('names each shadow by its place in the value, so two never share a name', () => {
      expect(primitivesOf('drop-shadow(1px 1px red) grayscale(1) drop-shadow(2px 2px blue)')).toEqual([
        SHADOW_RED, GRAYSCALE_1, shadowAt(2, { dx: 2, dy: 2, color: 'blue' }),
      ]);
    });
  });

  describe('when functions are chained', () => {
    it('writes one primitive per function, in written order', () => {
      expect(primitivesOf('drop-shadow(1px 1px 0 red) blur(1px)')).toEqual([SHADOW_RED, BLUR_1]);
      expect(primitivesOf('blur(1px) drop-shadow(1px 1px 0 red)')).toEqual([BLUR_1, shadowAt(1, { dx: 1, dy: 1, color: 'red' })]);
    });
  });

  describe('when the reach of a value is read', () => {
    it.each([
      ['blur(1px)', 3],
      ['blur(0.5px)', 1.5],
      ['drop-shadow(1px 1px 0 red)', 1],
      ['drop-shadow(-2px 1px red)', 2],
      ['drop-shadow(1px -3px 2px red)', 9],
      ['grayscale(1)', 0],
      ['brightness(2) contrast(2) saturate(2) hue-rotate(90deg) invert(1) opacity(0.5) sepia(1) grayscale(1)', 0],
      ['drop-shadow(1px 1px 0 red) blur(1px)', 4],
      ['blur(1px) blur(2px)', 9],
    ])('reaches %s by %s grid units', (value, reach) => {
      expect(readFilterValue(value).reach).toBe(reach);
    });

    it.each([
      ['a filter attribute', [['filter', 'blur(1px)']], 3],
      ['a style\'s filter declaration among others', [['style', 'color:red;filter:drop-shadow(2px 1px red)']], 2],
      ['an important style declaration', [['style', 'filter:blur(1px) !important']], 3],
      ['an attribute and a style, the larger last', [['filter', 'blur(1px)'], ['style', 'filter:blur(2px)']], 6],
      ['two declarations, the larger first', [['style', 'filter:blur(2px);filter:blur(1px)']], 6],
      ['a value kept as written', [['filter', 'blur(1em)'], ['style', 'filter:var(--f)']], 0],
      ['a filter value under another name', [['mask', 'blur(1px)'], ['style', 'mask:blur(2px)']], 0],
      ['no entries', [], 0],
    ])('reads an element\'s reach from %s', (_case, entries, reach) => {
      expect(filterReach(entries)).toBe(reach);
    });
  });

  describe('when a filter element is written', () => {
    it('declares user-space units and sRGB, then the primitives in order', () => {
      // pins color-interpolation-filters: without it grayscale differs from
      // CSS by up to 27/255
      expect(filterMarkup('bliss-filter-0123abcd-1', [SHADOW_RED, BLUR_1], { x: -1.75, y: -1.75, width: 11.5, height: 23.5 }))
        .toBe('<filter id="bliss-filter-0123abcd-1" filterUnits="userSpaceOnUse" x="-1.75" y="-1.75" width="11.5" height="23.5"'
          + ` color-interpolation-filters="sRGB">${SHADOW_RED}${BLUR_1}</filter>`);
    });
  });

  describe('when the region is computed', () => {
    it.each([
      ['the design example, drawn inside the viewBox', B313_VIEWBOX, B313_DRAWN, 1, { x: -1.75, y: -1.75, width: 11.5, height: 23.5 }],
      ['ink left of a cropped viewBox, cut past the ink', { x: 5.25, y: -0.75, width: 13.5, height: 21.5 }, B313_DRAWN, 3,
        { x: -3.25, y: -3.75, width: 15.5, height: 27.5 }],
      ['ink past the viewBox on every side', { x: 0, y: 0, width: 4, height: 4 }, { minX: -1, minY: -2, maxX: 6, maxY: 7 }, 0,
        { x: -1, y: -2, width: 7, height: 9 }],
      ['float noise in the sums', { x: 0.3, y: 0, width: 1, height: 1 }, { minX: 0.3, minY: 0, maxX: 1.3, maxY: 1 }, 0.1,
        { x: 0.2, y: -0.1, width: 1.2, height: 1.2 }],
      // pins the cut along x only, 1 unit past the reach: the line's height stays whole
      ['a word in a long line, cut along it', LINE, WORD, 2, { x: 37, y: -2, width: 16, height: 24 }],
      ['the viewBox alone where nothing is drawn, uncut', LINE, undefined, 2, { x: -2, y: -2, width: 104, height: 24 }],
    ])('covers %s', (_case, viewBox, drawn, reach, region) => {
      expect(filterRegion(viewBox, drawn, reach)).toEqual(region);
    });

    it('widens the region by the outset as by the reach, along and across the line', () => {
      // pins the growth by reach + outset: by the reach alone y would stay at -2
      expect(filterRegion(LINE, WORD, 2, 4)).toEqual({ x: 33, y: -6, width: 24, height: 32 });
    });

    it.each([
      ['a spread of exactly 8', [LINE, WORD, 8], { x: 31, y: -8, width: 28, height: 36 }],
      ['a spread of 9, cut along the line at the whole spread', [LINE, WORD, 2, 7], { x: 30, y: -8, width: 30, height: 36 }],
      ['an absurd reach, past the line\'s ends', [LINE, WORD, 600], { x: -8, y: -8, width: 116, height: 36 }],
      ['an absurd reach where nothing is drawn', [LINE, undefined, 600], { x: -8, y: -8, width: 116, height: 36 }],
    ])('grows no more than 8 units past the picture and the ink, for %s', (_case, args, region) => {
      expect(filterRegion(...args)).toEqual(region);
    });
  });

  describe('when an element may be too thin to draw filtered', () => {
    it.each([
      ['a horizontal line', { minX: -0.25, minY: -0.25, maxX: 8.25, maxY: 0.25 }, { minX: 0, minY: 0, maxX: 8, maxY: 0 }, ghost(0, -0.5, 8, 1)],
      ['a vertical line', { minX: -0.25, minY: -0.25, maxX: 0.25, maxY: 8.25 }, { minX: 0, minY: 0, maxX: 0, maxY: 8 }, ghost(-0.5, 0, 1, 8)],
      ['a point', { minX: -0.25, minY: -0.25, maxX: 0.25, maxY: 0.25 }, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ghost(-0.5, -0.5, 1, 1)],
      ['a band off its own origin', { minX: -0.25, minY: 7.75, maxX: 8.25, maxY: 8.55 }, { minX: 0, minY: 8, maxX: 8, maxY: 8.3 },
        ghost(0, 7.65, 8, 1)],
    ])('adds a shape 1 unit across for %s', (_case, drawn, geometry, shape) => {
      // pins the centre: the shape sits on the drawn box's middle, not at
      // its minimum
      expect(thinShape(drawn, geometry)).toBe(shape);
    });

    it.each([
      ['a box exactly 1 unit tall', { minX: -0.25, minY: -0.25, maxX: 8.25, maxY: 0.75 }, { minX: 0, minY: 0, maxX: 8, maxY: 0.5 }],
      ['a box exactly 1 unit wide', { minX: -0.25, minY: -0.25, maxX: 0.75, maxY: 8.25 }, { minX: 0, minY: 0, maxX: 0.5, maxY: 8 }],
      ['a line drawn 2 units wide', { minX: -1, minY: -1, maxX: 1, maxY: 9 }, { minX: 0, minY: 0, maxX: 0, maxY: 8 }],
      ['B313', B313_DRAWN, { minX: 0, minY: 8, maxX: 8, maxY: 16 }],
    ])('adds none for %s', (_case, drawn, geometry) => {
      // pins the strict < 1: WebKit draws a box of exactly 1 unit
      expect(thinShape(drawn, geometry)).toBe('');
    });
  });

  describe('when a picture is hashed', () => {
    it.each([
      ['', '811c9dc5'],
      ['a', 'e40c292c'],
      ['foobar', 'bf9cf968'],
    ])('hashes %j to the published FNV-1a 32 value %s', (text, hash) => {
      expect(pictureHash(text)).toBe(hash);
    });

    it('hashes a UTF-16 code unit whole, not its bytes', () => {
      expect(pictureHash('Ω')).toBe('ac0d6404');
    });

    it('keeps a leading zero, always 8 digits', () => {
      expect(pictureHash('akd')).toBe('0d368b73');
    });
  });
});
