import { describe, it, expect } from 'vitest';
import { readFilterValue } from '../src/lib/bliss-filters.js';

/**
 * Pins how the filter module reads one CSS `filter` value: which values it
 * translates into native primitives, that it keeps every other value as
 * written, and the colour a `drop-shadow` is given.
 *
 * Covers:
 * - Every spelling CSS accepts translating: function and unit names in any
 *   case, comments and whitespace anywhere, the drop-shadow colour before or
 *   after its lengths, omitted arguments filled as CSS fills them, CSS's
 *   number syntax, the absolute length units and the four angle units.
 * - Every other value kept as written, never sorted into invalid or
 *   unsupported: `none`, a CSS-wide keyword, a list of `url()` alone, an
 *   empty value, what CSS refuses, and what the library cannot convert (a
 *   relative or percentage length, `calc()`, `var()` or `env()` anywhere, the
 *   shadow colour included, a `url()` beside a function, an unknown function,
 *   `!important` written in the attribute).
 * - The colour rewrite: an `rgb()` or `hsl()` colour written in the comma form
 *   with a number alpha, every other colour copied as written (a word that is
 *   not a colour included, unjudged), an omitted one written as
 *   `currentColor`.
 *
 * Does NOT cover:
 * - A `filter` declaration inside a `style`, see
 *   `bliss-filters.style.test.js`.
 * - The primitive each function becomes at other arguments, chaining, the
 *   reach, the region, the thin-element shape and the picture hash, see
 *   `bliss-filters.primitives.test.js`.
 * - Where the library writes a translation, and that a value it keeps is
 *   reported nowhere, see `BlissSVGBuilder.native-filters.test.js` and
 *   `BlissSVGBuilder.native-filter-layers.test.js`.
 * - How a renderer draws the result, and the newer colour functions
 *   (`oklch()`, `color-mix()`), copied as written and not measured in resvg.
 *
 * @issue: #34
 */

const blur = (deviation) => `<feGaussianBlur stdDeviation="${deviation}"/>`;
const shadow = (dx, dy, deviation, color) =>
  `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${deviation}" flood-color="${color}"/>`;
const opacity = (amount) => `<feComponentTransfer><feFuncA type="table" tableValues="0 ${amount}"/></feComponentTransfer>`;
const hueRotate = (degrees) => `<feColorMatrix type="hueRotate" values="${degrees}"/>`;
// saturate(10), Filter Effects 1's saturate matrix at amount 10
const SATURATE_10 = '<feColorMatrix type="matrix" values="8.083 -6.435 -0.648 0 0 -1.917 3.565 -0.648 0 0 -1.917 -6.435 9.352 0 0 0 0 0 1 0"/>';
const brightness = (amount) => '<feComponentTransfer>'
  + `<feFuncR type="linear" slope="${amount}"/><feFuncG type="linear" slope="${amount}"/><feFuncB type="linear" slope="${amount}"/>`
  + '</feComponentTransfer>';
// grayscale(1), Filter Effects 1's matrix at amount 1
const GRAYSCALE_1 = '<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>';

describe('bliss-filters reader', () => {
  describe('when a filter value is spelled any way CSS accepts', () => {
    it.each([
      ['blur(1px)', [blur(1)]],
      ['BLUR(1PX)', [blur(1)]],
      ['Blur(1Px)', [blur(1)]],
      ['/*c*/blur(1px)', [blur(1)]],
      ['blur(/*c*/1px/*c*/)', [blur(1)]],
      [' blur( 1px ) ', [blur(1)]],
      ['blur(1px)/**/grayscale(1)', [blur(1), GRAYSCALE_1]],
      ['blur(1px)\ngrayscale(1)', [blur(1), GRAYSCALE_1]],
      ['drop-shadow(red 1px 1px)', [shadow(1, 1, 0, 'red')]],
      ['drop-shadow(1px 1px red)', [shadow(1, 1, 0, 'red')]],
      ['drop-shadow(.5px .5px red)', [shadow(0.5, 0.5, 0, 'red')]],
      ['blur()', [blur(0)]],
      ['grayscale()', [GRAYSCALE_1]],
      ['opacity(.5)', [opacity(0.5)]],
      ['opacity(50%)', [opacity(0.5)]],
      ['brightness(+1)', [brightness(1)]],
      ['saturate(1e1)', [SATURATE_10]],
      ['blur(1e0px)', [blur(1)]],
      ['blur(0)', [blur(0)]],
      ['hue-rotate(0)', [hueRotate(0)]],
    ])('translates %s', (value, primitives) => {
      expect(readFilterValue(value)).toEqual({ kind: 'translated', primitives, reach: expect.any(Number) });
    });

    it.each([
      ['blur(1in)', 96],
      ['blur(2.54cm)', 96],
      ['blur(10mm)', 37.7953],
      ['blur(1Q)', 0.9449],
      ['blur(1pt)', 1.3333],
      ['blur(1pc)', 16],
    ])('converts %s to %s grid units at 96 px per inch', (value, units) => {
      expect(readFilterValue(value).primitives).toEqual([blur(units)]);
    });

    it.each([
      ['hue-rotate(0.5turn)', 180],
      ['hue-rotate(100grad)', 90],
      ['hue-rotate(1rad)', 57.2958],
      ['hue-rotate(90DEG)', 90],
    ])('converts %s to %s degrees', (value, degrees) => {
      expect(readFilterValue(value).primitives).toEqual([hueRotate(degrees)]);
    });
  });

  describe('when a filter value is anything but a list of the functions it converts', () => {
    it.each([
      'none', 'NONE', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', '', ' ', '/**/',
      // pins the url()-only list: it is already native, so translating it
      // would only rename what the author's own definition draws
      'url(#a)', 'url(#a) url(#b)',
      'blur(1em)', 'blur(10%)', 'blur(1)', 'blur(-1px)', 'blur(1 px)', 'blur(1px 2px)', 'blur(1e999px)',
      'brightness(1 2)', 'hue-rotate(1deg 2deg)', 'blur(calc(1px))', 'calc(1px)', 'var(--x)', 'blur(var(--x))',
      'url(#a) blur(1px)', 'blur(1px) url(#a)', 'foo(1)', 'blur(1px),grayscale(1)', 'blur(1px',
      'none blur(1px)', 'drop-shadow(1px)', 'drop-shadow(1px 1px 1px 1px red)', 'drop-shadow(1px 1px red blue)',
      // pins the call head's ^ anchor (hand mutant, C9 Task 2): text before
      // a call, with a stray ) after it, must not shift the parse into a
      // translation
      'xx drop-shadow(1px 1px) 1px 1px)',
      'drop-shadow(1px red 1px)', 'drop-shadow(1px 1px -1px red)', 'drop-shadow(1em 1em red)',
      'brightness(-1)', 'opacity(-0.5)', 'opacity(1px)', 'hue-rotate(90)', 'hue-rotate(50%)',
      // var() or env() anywhere keeps the value, the shadow colour included,
      // as only CSS substitutes them
      'drop-shadow(1px 1px var(--c))', 'drop-shadow(1px 1px VAR(--c))', 'drop-shadow(1px 1px rgb(var(--r) 0 0))',
      'drop-shadow(1px 1px env(--c))',
      // a presentation attribute's grammar has no !important, so the
      // attribute draws nothing today; in a style it is read past instead
      'blur(1px) !important',
    ])('keeps %j as written', (value) => {
      expect(readFilterValue(value)).toEqual({ kind: 'kept' });
    });

    it('keeps a value spaced by a no-break space, which CSS does not read as spacing', () => {
      expect(readFilterValue(' blur(1px)')).toEqual({ kind: 'kept' });
      expect(readFilterValue('blur( 1px)')).toEqual({ kind: 'kept' });
      expect(readFilterValue('blur(1px) grayscale(1)')).toEqual({ kind: 'kept' });
    });
  });

  describe('when a drop-shadow names its colour', () => {
    it.each([
      ['rgb(0 0 0 / 30%)', 'rgba(0,0,0,0.3)'],
      ['rgb(0 0 0 / 0.3)', 'rgba(0,0,0,0.3)'],
      ['rgba(0,0,0,30%)', 'rgba(0,0,0,0.3)'],
      ['rgba(0, 0, 0, 0.3)', 'rgba(0,0,0,0.3)'],
      ['rgb(0,0,0,0.3)', 'rgba(0,0,0,0.3)'],
      ['RGB(0 0 0 / 12.5%)', 'rgba(0,0,0,0.125)'],
      ['rgb(0 0 0)', 'rgb(0,0,0)'],
      ['rgb(100% 0% 0% / 50%)', 'rgba(100%,0%,0%,0.5)'],
      ['hsl(120 100% 50% / 30%)', 'hsla(120,100%,50%,0.3)'],
      ['hsl(120deg 100% 50% / 0.3)', 'hsla(120deg,100%,50%,0.3)'],
      ['hsla(120, 100%, 50%, 30%)', 'hsla(120,100%,50%,0.3)'],
    ])('writes %s as flood-color="%s", the one form resvg draws translucent', (color, flood) => {
      // pins the alpha's /100: a percentage alpha left as written draws an
      // opaque black shadow in resvg
      expect(readFilterValue(`drop-shadow(1px 1px ${color})`).primitives).toEqual([shadow(1, 1, 0, flood)]);
      expect(readFilterValue(`drop-shadow(${color} 1px 1px)`).primitives).toEqual([shadow(1, 1, 0, flood)]);
    });

    it('clamps the alpha to 0..1, as CSS does', () => {
      expect(readFilterValue('drop-shadow(1px 1px rgb(0 0 0 / 150%))').primitives).toEqual([shadow(1, 1, 0, 'rgba(0,0,0,1)')]);
      expect(readFilterValue('drop-shadow(1px 1px rgb(0 0 0 / -50%))').primitives).toEqual([shadow(1, 1, 0, 'rgba(0,0,0,0)')]);
    });

    it.each([
      'red', '#f00', '#00000080', 'transparent', 'currentColor',
      'rgb(none 0 0)', 'rgb(calc(10) 0 0)', 'oklch(0.5 0.1 120 / 30%)', 'color-mix(in srgb, red, blue)',
      // a word that is not a colour is copied unjudged: a typo draws black,
      // as invalid CSS carries no promise
      'foo', 'xrgb(0 0 0)', 'rgb(0 0 0)x',
    ])('copies %s as written', (color) => {
      expect(readFilterValue(`drop-shadow(1px 1px ${color})`).primitives).toEqual([shadow(1, 1, 0, color)]);
    });

    it('writes an omitted colour as currentColor, where the primitive alone would draw black', () => {
      expect(readFilterValue('drop-shadow(1px 1px)').primitives).toEqual([shadow(1, 1, 0, 'currentColor')]);
      expect(readFilterValue('drop-shadow(1px 1px 2px)').primitives).toEqual([shadow(1, 1, 2, 'currentColor')]);
    });
  });
});
