import { describe, it, expect, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins what makes a translated filter portable and repeatable: the same
 * markup from every route options take, saves that never hold a translation,
 * and ids that are the same for the same picture and differ between pictures.
 *
 * Covers:
 * - One element's filter drawn byte for byte alike from the DSL, a
 *   composition object, `setOptions` and the transient options, and a
 *   definition's options drawn as the part options they expand to, each use
 *   with its own filter.
 * - `toString()` and both `toJSON()` modes giving the filter back as written,
 *   with no `url()` or generated id anywhere, and each reloading to the same
 *   `svgCode`.
 * - Ids `bliss-filter-<8 hex>-<n>`: identical for the same input, different
 *   for a different drawing (under an element's filter or a layer's), a
 *   different filter or a different root `id`; none in a picture with nothing
 *   translated; an author's text that spells a pending id left as written.
 * - `svgContent` carrying the same ids as `svgCode`, as the content group's
 *   inner markup.
 *
 * Does NOT cover:
 * - The markup of each element's filter, see
 *   `BlissSVGBuilder.native-filters.test.js`; the layers' filters and the
 *   numbering across layers, see `BlissSVGBuilder.native-filter-layers.test.js`.
 * - Two identical pictures on one page sharing ids (an accepted residual of
 *   the design: a distinct `id` on each picture gives distinct ids).
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
const hashOf = (svg) => svg.match(/bliss-filter-([0-9a-f]{8})-\d/)?.[1];
const idIn = (svg, n) => `bliss-filter-${hashOf(svg)}-${n}`;
const filterDef = (id, [x, y, width, height], primitives) => `<filter id="${id}" filterUnits="userSpaceOnUse"`
  + ` x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB">${primitives}</filter>`;
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B313_AT_10 = '<path d="M10,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B291_AT_10 = '<path d="M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const BLUR_1 = '<feGaussianBlur stdDeviation="1"/>';
// viewBox -0.75 -0.75 19.5 21.5, grown by blur(1px)'s reach of 3, and cut
// along x 4 past what the filtered element draws: B313 from -0.25 to 8.25,
// the second B313 from 9.75 to 18.25
const FIRST_BLUR = [-3.75, -3.75, 16, 27.5];
const SECOND_BLUR = [5.75, -3.75, 16, 27.5];
const DEFINED = { BLURRED: { codeString: 'B313', defaultOptions: { filter: 'blur(1px)' } } };

describe('BlissSVGBuilder native filter ids', () => {
  afterAll(() => Object.keys(DEFINED).forEach(code => BlissSVGBuilder.removeDefinition(code)));

  describe('when the same filter arrives by different routes', () => {
    it('draws it identically from the DSL, a composition object, setOptions and the transient options', () => {
      const dsl = build('[filter=blur(1px)]B313/B291');
      const composition = build({
        groups: [{ glyphs: [{ options: { filter: 'blur(1px)' }, parts: [{ codeName: 'B313' }] }, { parts: [{ codeName: 'B291' }] }] }],
      });
      const handle = build('B313/B291');
      handle.glyph(0).setOptions({ filter: 'blur(1px)' });
      const transient = build('B313/B291');
      transient.glyph(0).setTransientOptions({ filter: 'blur(1px)' });

      expect(contentOf(dsl.svgCode)).toBe(`<g filter="url(#${idIn(dsl.svgCode, 1)})">${filterDef(idIn(dsl.svgCode, 1), FIRST_BLUR, BLUR_1)}${B313}</g>${B291_AT_10}`);
      for (const builder of [composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
      }
    });

    it('draws a definition\'s filter as the part options it expands to, one filter per use', () => {
      BlissSVGBuilder.define(DEFINED);
      const svg = build('BLURRED/BLURRED').svgCode;

      expect(contentOf(svg)).toBe(`<g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), FIRST_BLUR, BLUR_1)}${B313}</g>`
        + `<g filter="url(#${idIn(svg, 2)})">${filterDef(idIn(svg, 2), SECOND_BLUR, BLUR_1)}${B313_AT_10}</g>`);
      expect(svg).toBe(build('[filter=blur(1px)]>B313/[filter=blur(1px)]>B313').svgCode);
    });
  });

  describe('when a picture with a translated filter is saved', () => {
    it.each([
      ['[style=filter:drop-shadow(1px 1px 0 red)]B313', 'drop-shadow(1px 1px 0 red)'],
      ['[filter=blur(1px)]B313/B291', 'blur(1px)'],
      ['[filter=blur(1px)]|[filter=blur(2px)]B313;[filter=grayscale(1)]>B81', 'grayscale(1)'],
      ['[filter=blur(1px);style="color:red;filter:grayscale(1)"]B313', 'color:red;filter:grayscale(1)'],
      ['[filter=drop-shadow(1px 1px 0 red)]DOT', 'drop-shadow(1px 1px 0 red)'],
    ])('saves %s as written and reloads it to the same picture', (input, written) => {
      const builder = build(input);
      const saves = [builder.toString(), JSON.stringify(builder.toJSON()), JSON.stringify(builder.toJSON({ preserve: true }))];

      expect(builder.svgCode).toContain('<filter ');
      expect(saves[0]).toContain(written);
      for (const save of saves) {
        expect(save).not.toContain('url(');
        expect(save).not.toContain('bliss-filter-');
      }
      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when ids are generated', () => {
    it('writes the same bytes for the same input', () => {
      const svg = build('[filter=blur(1px)]B313').svgCode;

      expect(hashOf(svg)).toMatch(/^[0-9a-f]{8}$/);
      expect(build('[filter=blur(1px)]B313').svgCode).toBe(svg);
    });

    it.each([
      ['a different drawing', '[filter=blur(1px)]B313', '[filter=blur(1px)]B291'],
      ['a different drawing under a layer filter', '[grid;grid--filter=blur(1px)]||B313', '[grid;grid--filter=blur(1px)]||B291'],
      ['a different filter', '[filter=blur(1px)]B313', '[filter=blur(2px)]B313'],
      ['a different root id', '[root--id=a]||[filter=blur(1px)]B313', '[root--id=b]||[filter=blur(1px)]B313'],
    ])('gives pictures with %s different ids', (_case, first, second) => {
      const [one, two] = [build(first).svgCode, build(second).svgCode].map(hashOf);

      expect(one).toMatch(/^[0-9a-f]{8}$/);
      expect(two).toMatch(/^[0-9a-f]{8}$/);
      expect(one).not.toBe(two);
    });

    it.each(['[opacity=0.5]B313', '[filter=blur(1em)]B313', '[filter=url(#mine)]B313'])(
      'writes no generated id for %s, where nothing is translated', (input) => {
        expect(build(input).svgCode).not.toContain('bliss-filter-');
      });

    it('leaves an author\'s text that spells a pending id as written', () => {
      // the placeholder holds a `<`, which every author value reaches the markup escaped from
      const svg = build('[svg-title=bliss-filter-<hash>-1;grid;grid--filter=blur(1px)]||B313').svgCode;

      expect(svg).toContain('<title>bliss-filter-&lt;hash&gt;-1</title>');
      expect(svg).toContain(`<g class="bliss-grid" shape-rendering="crispEdges" filter="url(#${idIn(svg, 1)})">`);
      expect(hashOf(svg)).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('when reading svgContent', () => {
    it('carries the same ids as svgCode, as the content group\'s inner markup', () => {
      const builder = build('[filter=blur(1px)]B313');

      expect(builder.svgContent).toContain(`filter="url(#${idIn(builder.svgCode, 1)})"`);
      expect(builder.svgContent).toBe(contentOf(builder.svgCode));
    });
  });
});
