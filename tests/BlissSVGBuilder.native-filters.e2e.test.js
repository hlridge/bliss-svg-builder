/**
 * Pins that a CSS `blur` or `drop-shadow` drawn as a native filter looks as
 * the CSS filter itself does: node-canvas draws the builder's markup and the
 * same markup with each filter reference swapped back to the CSS text alike,
 * at the default size, with no pixel past the visual-regression suite's
 * channel tolerance (10 of 255).
 *
 * Covers:
 * - On an element: both channels (`filter`, `style`); a blur of 0.5, 1 and
 *   2 units; a shadow sharp and blurred, with a negative and a sub-unit
 *   offset, the default colour and a translucent one.
 * - Each level: a word, a character inside a word, a part, a word and its
 *   character both filtered, ink a crop leaves outside the viewBox.
 * - The picture's layers: the whole symbol, the grid, the background, one
 *   background zone, the element backgrounds.
 * - The copies of an element's effects (around its box, its ink area, a
 *   word's ink area, a `link-area=ink` link's lines) and a link's rect.
 * - Each row draws its effect: its picture differs from the same input
 *   without the filter, so no row passes with neither form drawing it.
 *
 * Does NOT cover:
 * - The colour functions, a length in `mm`, a chain through a blur and a
 *   filtered thin line: node-canvas draws their CSS form itself wrongly, so
 *   no CSS form can judge them here. Their own references
 *   (`BlissSVGBuilder.visual-regression.e2e.cases.js`) pin how the markup
 *   draws.
 * - The markup (primitives, regions, ids), see
 *   `BlissSVGBuilder.native-filters.test.js` and its siblings.
 * - Browsers and resvg: measured outside the suite.
 *
 * @issue: #34
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { renderSVGToPNG, compareImages } from './utils/visual-comparison.js';

// Every native filter reference the builder writes: url(#bliss-filter-<hash>-<n>).
const FILTER_REFERENCE = /url\(#bliss-filter-[0-9a-f]{8}-\d+\)/g;
const drawn = (input) => renderSVGToPNG(new BlissSVGBuilder(input).standaloneSvg);
// The builder's picture against its CSS form, each filter reference swapped
// back to the CSS text, both drawn by node-canvas and compared as the
// visual-regression suite compares (a failure saves its diff under temp/).
const againstCssForm = async (input, css) => {
  const svg = new BlissSVGBuilder(input).standaloneSvg;
  const native = await renderSVGToPNG(svg);
  const cssForm = await renderSVGToPNG(svg.replace(FILTER_REFERENCE, css));
  return {
    references: (svg.match(FILTER_REFERENCE) ?? []).length,
    native,
    comparison: await compareImages(native, cssForm, `native-filter-${input.replace(/[^\w.-]+/g, '_')}`),
  };
};

describe('BlissSVGBuilder native filters', () => {
  describe('when an element carries a blur or a shadow', () => {
    it.each([
      ['[filter=blur(1px)]B313', 'blur(1px)', 1, 'B313'],
      ['[style=filter:blur(1px)]B313', 'blur(1px)', 1, 'B313'],
      ['[filter=blur(0.5px)]B313', 'blur(0.5px)', 1, 'B313'],
      ['[filter=blur(2px)]B313', 'blur(2px)', 1, 'B313'],
      ['[filter=drop-shadow(1px 1px 0 red)]B313', 'drop-shadow(1px 1px 0 red)', 1, 'B313'],
      ['[style=filter:drop-shadow(1px 1px 0 red)]B313', 'drop-shadow(1px 1px 0 red)', 1, 'B313'],
      ['[filter=drop-shadow(1px 1px 1px blue)]B313', 'drop-shadow(1px 1px 1px blue)', 1, 'B313'],
      ['[filter=drop-shadow(-1px 2px 0 blue)]B313', 'drop-shadow(-1px 2px 0 blue)', 1, 'B313'],
      ['[filter=drop-shadow(0.25px 0.25px 0 red)]B313', 'drop-shadow(0.25px 0.25px 0 red)', 1, 'B313'],
      ['[color=red;filter=drop-shadow(1px 1px)]B313', 'drop-shadow(1px 1px)', 1, '[color=red]B313'],
      ['[filter=drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]B313', 'drop-shadow(2px 2px 2px rgba(0,0,0,0.3))', 1, 'B313'],
    ])('draws %s as the CSS filter %s draws', async (input, css, references, plain) => {
      const result = await againstCssForm(input, css);

      expect(result.references).toBe(references);
      expect(result.comparison.diffPixels, `see ${result.comparison.paths.diff}`).toBe(0);
      expect(result.native.equals(await drawn(plain))).toBe(false);
    });
  });

  describe('when the filter sits at another level', () => {
    it.each([
      ['[filter=blur(1px)]|B313/B291', 'blur(1px)', 1, 'B313/B291'],
      ['B313/[filter=blur(1px)]B291', 'blur(1px)', 1, 'B313/B291'],
      ['B313;[filter=blur(1px)]>B81', 'blur(1px)', 1, 'B313;B81'],
      ['B313;[filter=drop-shadow(1px 1px 0 red)]>B81', 'drop-shadow(1px 1px 0 red)', 1, 'B313;B81'],
      ['[filter=blur(1px)]|[filter=blur(1px)]B313/B291', 'blur(1px)', 2, 'B313/B291'],
      ['[crop-left=6]||[filter=blur(1px)]B313/B291', 'blur(1px)', 1, '[crop-left=6]||B313/B291'],
    ])('draws %s as the CSS filter %s draws', async (input, css, references, plain) => {
      const result = await againstCssForm(input, css);

      expect(result.references).toBe(references);
      expect(result.comparison.diffPixels, `see ${result.comparison.paths.diff}`).toBe(0);
      expect(result.native.equals(await drawn(plain))).toBe(false);
    });
  });

  describe('when a layer of the picture is filtered', () => {
    it.each([
      ['[filter=blur(1px)]||B313', 'blur(1px)', 1, 'B313'],
      ['[filter=drop-shadow(1px 1px 0 red)]||B313/B291//B313', 'drop-shadow(1px 1px 0 red)', 1, 'B313/B291//B313'],
      ['[grid;grid--filter=blur(1px)]||B313', 'blur(1px)', 1, '[grid]||B313'],
      ['[background=yellow;background--filter=blur(1px)]||B313', 'blur(1px)', 1, '[background=yellow]||B313'],
      ['[background-top=yellow;background-zone--top--filter=blur(1px)]||B313', 'blur(1px)', 1, '[background-top=yellow]||B313'],
      ['[element-background--filter=blur(1px)]||[background=yellow]B313', 'blur(1px)', 1, '[background=yellow]B313'],
    ])('draws %s as the CSS filter %s draws', async (input, css, references, plain) => {
      const result = await againstCssForm(input, css);

      expect(result.references).toBe(references);
      expect(result.comparison.diffPixels, `see ${result.comparison.paths.diff}`).toBe(0);
      expect(result.native.equals(await drawn(plain))).toBe(false);
    });
  });

  describe('when an element\'s effects are copied, or the element is a link', () => {
    it.each([
      ['[filter=blur(1px);background=yellow]B313', 'blur(1px)', 2, '[background=yellow]B313'],
      ['[filter=blur(1px);background-area=ink;background=yellow]B313/B291', 'blur(1px)', 2,
        '[background-area=ink;background=yellow]B313/B291'],
      ['[background-area=ink;background=yellow]|[filter=drop-shadow(1px 1px 0 red)]B313/B291', 'drop-shadow(1px 1px 0 red)', 2,
        '[background-area=ink;background=yellow]|B313/B291'],
      ['[link-area=ink;href=#a]|B313/[filter=blur(1px)]B291', 'blur(1px)', 2, '[link-area=ink;href=#a]|B313/B291'],
      ['[href=#a;filter=blur(1px)]B313', 'blur(1px)', 1, '[href=#a]B313'],
    ])('draws %s as the CSS filter %s draws', async (input, css, references, plain) => {
      const result = await againstCssForm(input, css);

      expect(result.references).toBe(references);
      expect(result.comparison.diffPixels, `see ${result.comparison.paths.diff}`).toBe(0);
      expect(result.native.equals(await drawn(plain))).toBe(false);
    });
  });
});
