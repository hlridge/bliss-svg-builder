import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how a CSS `filter` on the whole symbol or on one of the picture's
 * layers is drawn: as a native `<filter>` on its own line, first inside a
 * group or just before a single shape, numbered after the composition's own,
 * while a filter on the root stays page CSS.
 *
 * Covers:
 * - A plain global `filter` or `style`, and `content--`, on the content
 *   group, its `<filter>` the group's first child and left out of
 *   `svgContent`; the region from the viewBox, the composition's drawn box
 *   and every element background, including what a crop leaves outside, and
 *   the viewBox alone where the composition draws nothing; the invisible
 *   shape after its `<filter>` where the whole symbol is under 1 unit wide or
 *   tall.
 * - `root--filter` and `root--style` written exactly as before, silently.
 * - The grid group, every grid line (five lines, five filters), one named
 *   grid line, the background group, the paper, one zone, and an element
 *   background as a box (the filter its preceding sibling) and as an ink
 *   area (its first child, its region from the lines widened by the area).
 * - What a zone or the grid draws outside the viewBox (a crop, a negative
 *   margin), each grid line by its own width and the grid by its widest.
 * - A drop-shadow colour copied into its filter escaped, as the markup
 *   carries it.
 * - Numbering: the composition first, then the layers in document order,
 *   and an element's own filters in the order its attributes are written.
 *
 * Does NOT cover:
 * - A filter on a word, character or part, see
 *   `BlissSVGBuilder.native-filters.test.js`; ids and saves, see
 *   `BlissSVGBuilder.native-filter-ids.test.js`.
 * - A filtered sky or earth line, or zone, drawn in Safari: a single shape
 *   holds no invisible widening shape (the design's accepted residual).
 * - How a browser draws a filter on the root (page CSS, page pixels).
 *
 * @issue: #34
 */

const build = (input) => new BlissSVGBuilder(input);
const hashOf = (svg) => svg.match(/bliss-filter-([0-9a-f]{8})-\d/)?.[1];
const idIn = (svg, n) => `bliss-filter-${hashOf(svg)}-${n}`;
const filterDef = (id, [x, y, width, height], primitives) => `<filter id="${id}" filterUnits="userSpaceOnUse"`
  + ` x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB">${primitives}</filter>`;
const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const DEFAULT_CONTENT_TAG = '<g class="bliss-content" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">';
const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const BLUR_1 = '<feGaussianBlur stdDeviation="1"/>';
const GRAYSCALE_1 = '<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>';
// B313's viewBox (-0.75 -0.75 9.5 21.5), which holds every layer here, grown by blur(1px)'s reach
const B313_BLUR = [-3.75, -3.75, 15.5, 27.5];

describe('BlissSVGBuilder native filter layers', () => {
  describe('when a global filter styles the whole symbol', () => {
    it.each([
      ['filter=blur(1px)', (id) => `filter="url(#${id})"`],
      ['style=filter:blur(1px)', (id) => `style="filter:url(#${id})"`],
      ['content--filter=blur(1px)', (id) => `filter="url(#${id})"`],
      ['content--style=filter:blur(1px)', (id) => `style="filter:url(#${id})"`],
    ])('puts %s on the content group, its filter the group\'s first child', (option, attribute) => {
      const builder = build(`[${option}]||B313`);
      const id = idIn(builder.svgCode, 1);

      expect(builder.svgCode).toContain([
        `  ${DEFAULT_CONTENT_TAG.replace(/>$/, ` ${attribute(id)}>`)}`,
        `    ${filterDef(id, B313_BLUR, BLUR_1)}`,
        `    ${B313}`,
        '  </g>',
      ].join('\n'));
      expect(builder.svgContent).toBe(B313);
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['the composition', '[crop-left=6;filter=blur(1px)]||B313/B291', [-3.25, -3.75, 25, 27.5]],
      ['an element background', '[crop-left=6;filter=blur(1px)]||[background=yellow]B313/B291', [-4, -4, 25.75, 28]],
      // pins the drawn box skipping a word space, as the bounds do: its point
      // at y=0 would pull the region up to -3.25
      ['the words but not the space between them', '[crop-top=10;filter=blur(1px)]||B313//B291', [-3.75, 4.75, 31.5, 19]],
    ])('covers %s where a crop leaves it outside the viewBox', (_case, input, region) => {
      // crop-left=6: viewBox 5.25 -0.75 13.5 21.5, B313 drawn from -0.25 and
      // its box from -1; crop-top=10: viewBox -0.75 9.25 25.5 11.5, the lines from 7.75
      const svg = build(input).svgCode;

      expect(svg).toContain(`\n    ${filterDef(idIn(svg, 1), region, BLUR_1)}\n`);
    });

    it('covers the viewBox alone where the composition draws nothing', () => {
      // viewBox -0.75 9.25 1.5 11.5: a zero box standing for "nothing drawn" would pull the region up to y=0
      const svg = build('[crop-top=10;filter=blur(1px)]||').svgCode;

      expect(svg).toContain(`filter="url(#${idIn(svg, 1)})">\n    ${filterDef(idIn(svg, 1), [-3.75, 6.25, 7.5, 17.5], BLUR_1)}\n    \n  </g>`);
    });

    it.each([
      ['HL8', [-1.75, -1.75, 11.5, 23.5], '<rect x="0" y="-0.5" width="8" height="1" fill="none" stroke="none"/>', '<path d="M0,0h8"/>'],
      ['DOT', [-1.75, -1.75, 3.5, 23.5], '<rect x="-0.5" y="-0.5" width="1" height="1" fill="none" stroke="none"/>',
        '<g stroke-width="0.4165"><path d="M-0.20825,0a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"/></g>'],
    ])('adds the invisible shape after the content group\'s filter where the whole symbol is thin: %s', (code, region, shape, ink) => {
      // WebKit drops a filtered group under 1 unit wide or tall, the content group too
      const svg = build(`[filter=drop-shadow(1px 1px 0 red)]||${code}`).svgCode;
      const id = idIn(svg, 1);

      expect(svg).toContain([
        `  ${DEFAULT_CONTENT_TAG.replace(/>$/, ` filter="url(#${id})">`)}`,
        `    ${filterDef(id, region, '<feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="red"/>')}`,
        `    ${shape}`,
        `    ${ink}`,
        '  </g>',
      ].join('\n'));
    });

    it('numbers a style filter and a filter attribute in the order they are written', () => {
      const svg = build('[style=filter:grayscale(1);filter=blur(1px)]||B313').svgCode;
      const [first, second] = [1, 2].map(n => idIn(svg, n));

      expect(svg).toContain([
        `  ${DEFAULT_CONTENT_TAG.replace(/>$/, ` style="filter:url(#${first})" filter="url(#${second})">`)}`,
        `    ${filterDef(first, [-0.75, -0.75, 9.5, 21.5], GRAYSCALE_1)}`,
        `    ${filterDef(second, B313_BLUR, BLUR_1)}`,
        `    ${B313}`,
      ].join('\n'));
    });
  });

  describe('when a filter names the root', () => {
    it.each([
      ['root--filter=blur(1px)', 'filter="blur(1px)"'],
      ['root--style=filter:blur(1px)', 'style="filter:blur(1px)"'],
    ])('writes %s on the root as page CSS, untranslated and silent', (option, attribute) => {
      const builder = build(`[${option}]||B313`);

      expect(rootTag(builder.svgCode)).toContain(` ${attribute}`);
      expect(builder.svgCode).not.toContain('<filter');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when a filter names one of the picture\'s layers', () => {
    it('puts a grid filter first in the grid group', () => {
      const svg = build('[grid;grid--filter=blur(1px)]||B313').svgCode;

      expect(svg).toContain(`<g class="bliss-grid" shape-rendering="crispEdges" filter="url(#${idIn(svg, 1)})">\n`
        + `    ${filterDef(idIn(svg, 1), B313_BLUR, BLUR_1)}\n    <path class="bliss-grid-line bliss-grid-line--minor"`);
    });

    it('gives each of the five grid lines its own filter, just before it', () => {
      const lines = build('[grid;grid-line--filter=blur(1px)]||B313').svgCode.split('\n');
      const svg = lines.join('\n');
      const gridLines = lines.flatMap((line, i) => (line.includes('class="bliss-grid-line') ? [[lines[i - 1], line]] : []));

      expect(gridLines).toHaveLength(5);
      gridLines.forEach(([before, line], i) => {
        expect(before).toBe(`    ${filterDef(idIn(svg, i + 1), B313_BLUR, BLUR_1)}`);
        expect(line).toMatch(new RegExp(` filter="url\\(#${idIn(svg, i + 1)}\\)"/>$`));
      });
    });

    it('filters only the named grid line', () => {
      const svg = build('[grid;grid-line--sky--filter=blur(1px)]||B313').svgCode;

      expect(svg.match(/<filter /g)).toHaveLength(1);
      expect(svg).toContain(`    ${filterDef(idIn(svg, 1), B313_BLUR, BLUR_1)}\n`
        + `    <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="#858585"`
        + ` stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8" filter="url(#${idIn(svg, 1)})"/>`);
    });

    it.each([
      ['the background group', '[background=yellow;background--filter=blur(1px)]||B313',
        (id) => `  <g class="bliss-background" filter="url(#${id})">\n    ${filterDef(id, B313_BLUR, BLUR_1)}\n    <rect class="bliss-background-zone" x="-0.75"`],
      ['the paper', '[background=yellow;background-zone--filter=blur(1px)]||B313',
        (id) => `    ${filterDef(id, B313_BLUR, BLUR_1)}\n    <rect class="bliss-background-zone" x="-0.75" y="-0.75"`
          + ` width="100%" height="100%" stroke="none" fill="yellow" filter="url(#${id})"/>`],
      ['one zone', '[background-top=yellow;background-zone--top--filter=blur(1px)]||B313',
        (id) => `    ${filterDef(id, B313_BLUR, BLUR_1)}\n    <rect class="bliss-background-zone bliss-background-zone--top"`
          + ` x="-0.75" y="-0.75" width="9.5" height="8.75" stroke="none" fill="yellow" filter="url(#${id})"/>`],
    ])('translates a filter on %s', (_layer, input, markup) => {
      const svg = build(input).svgCode;

      expect(svg).toContain(markup(idIn(svg, 1)));
    });

    it('covers a zone, and the background group holding it, where a crop leaves it outside the viewBox', () => {
      // viewBox -0.75 9.25 9.5 11.5; the middle zone is drawn from y=8
      const svg = build('[crop-top=10;background-mid=yellow;background--filter=blur(1px);background-zone--mid--filter=blur(1px)]||B313').svgCode;
      const [group, zone] = [1, 2].map(n => idIn(svg, n));

      expect(svg).toContain([
        `  <g class="bliss-background" filter="url(#${group})">`,
        `    ${filterDef(group, [-3.75, 5, 15.5, 18.75], BLUR_1)}`,
        `    ${filterDef(zone, [-3.75, 5, 15.5, 18.75], BLUR_1)}`,
        `    <rect class="bliss-background-zone bliss-background-zone--mid" x="-0.75" y="8" width="9.5" height="8"`
          + ` stroke="none" fill="yellow" filter="url(#${zone})"/>`,
      ].join('\n'));
    });

    it('covers the grid by its widest line, and each grid line by its own width, outside the viewBox', () => {
      // viewBox 1 1 6 18; the lines run 0..8 x 0..20, the sky line 2 wide, the minor lines 0.166
      const svg = build('[grid;margin=-1;grid-sky-stroke-width=2;grid--filter=blur(1px);grid-line--minor--filter=blur(1px)]||B313').svgCode;
      const [grid, minor] = [1, 2].map(n => idIn(svg, n));

      expect(svg).toContain([
        `  <g class="bliss-grid" shape-rendering="crispEdges" filter="url(#${grid})">`,
        `    ${filterDef(grid, [-4, -4, 16, 28], BLUR_1)}`,
        `    ${filterDef(minor, [-3.083, -3.083, 14.166, 26.166], BLUR_1)}`,
        '    <path class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166"',
      ].join('\n'));
    });

    it('copies a drop-shadow colour into its filter as the markup carries it, escaped', () => {
      const svg = build('[grid;grid--filter=drop-shadow(1px 1px "red")]||B313').svgCode;

      expect(svg).toContain(`    ${filterDef(idIn(svg, 1), [-1.75, -1.75, 11.5, 23.5],
        '<feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="&quot;red&quot;"/>')}\n`);
      expect(svg).not.toContain('"red"');
    });

    it.each([
      ['a box, the filter its preceding sibling', '[element-background--filter=blur(1px)]||[background=yellow]B313',
        (id) => `${filterDef(id, [-4, -4, 16, 28], BLUR_1)}<rect class="bliss-element-background bliss-element-background--box"`
          + ` x="-1" y="-1" width="10" height="22" fill="yellow" stroke="none" filter="url(#${id})"/>${B313}`],
      ['an ink area, the filter its first child', '[element-background--filter=blur(1px)]||[background-area=ink;background=yellow]B313',
        (id) => `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="yellow" stroke-width="1.3"`
          + ` filter="url(#${id})">${filterDef(id, B313_BLUR, BLUR_1)}${B313}</g>${B313}`],
      ['a cropped ink area, its region from the lines widened by the area',
        '[crop-left=6;element-background--filter=blur(1px)]||[background-area=ink;background=yellow]B313/B291',
        (id) => `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="yellow" stroke-width="1.3"`
          + ` filter="url(#${id})">${filterDef(id, [-3.65, -3.75, 25.4, 27.5], BLUR_1)}${B313}</g>${B313_B291}`],
    ])('translates an element background\'s filter on %s', (_case, input, markup) => {
      const svg = build(input).svgCode;

      expect(contentOf(svg)).toBe(markup(idIn(svg, 1)));
    });
  });

  describe('when several layers carry a filter', () => {
    it('numbers them in document order: the background, its paper, the grid, a grid line, the content group', () => {
      const svg = build('[background=yellow;background--filter=blur(1px);background-zone--filter=blur(1px);'
        + 'grid;grid--filter=blur(1px);grid-line--sky--filter=blur(1px);filter=blur(1px)]||B313').svgCode;
      const users = svg.split('\n').filter(line => line.includes('url(#'))
        .map(line => [line.match(/class="([^"]*)"/)[1], line.match(/url\(#bliss-filter-[0-9a-f]{8}-(\d+)\)/)[1]]);

      expect(users).toEqual([
        ['bliss-background', '1'],
        ['bliss-background-zone', '2'],
        ['bliss-grid', '3'],
        ['bliss-grid-line bliss-grid-line--major bliss-grid-line--sky', '4'],
        ['bliss-content', '5'],
      ]);
      expect([...svg.matchAll(/<filter id="bliss-filter-[0-9a-f]{8}-(\d+)"/g)].map(match => match[1])).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  describe('when the composition and the layers both carry a filter', () => {
    it('numbers the composition first, then the layers in document order', () => {
      // the grid is written before the content group but numbered after it
      const builder = build('[filter=blur(2px);grid;grid--filter=grayscale(1)]||[filter=blur(1px)]B313');
      const svg = builder.svgCode;
      const [element, grid, content] = [1, 2, 3].map(n => idIn(svg, n));

      expect(svg).toContain(`<g class="bliss-grid" shape-rendering="crispEdges" filter="url(#${grid})">\n`
        + `    ${filterDef(grid, [-0.75, -0.75, 9.5, 21.5], GRAYSCALE_1)}\n`);
      expect(svg).toContain(`${DEFAULT_CONTENT_TAG.replace(/>$/, ` filter="url(#${content})">`)}\n`
        + `    ${filterDef(content, [-6.75, -6.75, 21.5, 33.5], '<feGaussianBlur stdDeviation="2"/>')}\n`
        + `    <g filter="url(#${element})">${filterDef(element, B313_BLUR, BLUR_1)}${B313}</g>\n`);
      expect(builder.svgContent).toBe(`<g filter="url(#${element})">${filterDef(element, B313_BLUR, BLUR_1)}${B313}</g>`);
    });

    it('numbers the content group right after the composition, an ink area\'s copy included', () => {
      // pins the numbering held for the content's render alone: measuring the
      // content group's region renders the ink area again, numbering nothing
      const svg = build('[filter=blur(2px)]||[background-area=ink;background=yellow]|[filter=blur(1px)]B313/B291').svgCode;
      const content = idIn(svg, 3);

      expect(svg.match(/<filter /g)).toHaveLength(3);
      expect(svg).toContain(`${DEFAULT_CONTENT_TAG.replace(/>$/, ` filter="url(#${content})">`)}\n`
        + `    ${filterDef(content, [-6.75, -6.75, 31.5, 33.5], '<feGaussianBlur stdDeviation="2"/>')}\n`);
    });
  });
});
