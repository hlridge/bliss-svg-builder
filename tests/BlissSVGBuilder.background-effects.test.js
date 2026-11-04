import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how an element's effects reach its background: a word's, a character's
 * or a part's `transform` (with `transform-origin` and `transform-box`),
 * `opacity`, `filter`, `clip-path`, `mask`, `display` and `visibility`,
 * written as an option or in `style`, are copied onto a group around its
 * background in the shared layer, so the background moves, fades and hides
 * with its lines while staying beneath every line.
 *
 * Covers:
 * - Each of the nine effects, as an option and in `style`, around a box and
 *   around an ink area, the painted element's own never repeated inside its
 *   ink area; paint, `class`, `id` and the other pass-through attributes
 *   (`mix-blend-mode`, `isolation`, `pointer-events`, `cursor`,
 *   `vector-effect`) never copied, nor a `data-` attribute whose value reads
 *   as a style.
 * - Reading a `style`: split at each `;` outside parentheses, quotes and
 *   comments, a property read in any case, spacing and comments, each effect
 *   declaration copied as written and in order, and no copy for a `style`
 *   with none.
 * - A filter's copy drawn as its own native filter, its region from what the
 *   copy holds (#34); a filter option beside a filter in `style` drawn as two
 *   filters side by side, in a word's copy and in its ink area's.
 * - The layer as the tree pared down to its effects: copies nested outermost
 *   first, one copy shared by every background under one element, none for
 *   an element with nothing painted beneath it, the whole layer still first.
 * - A box ignoring a descendant's effects, and the layout ignoring them all.
 * - A word's ink area, and a `link-area=ink` link's lines, carrying a
 *   descendant's effects where its lines carry them, with its width on the
 *   same group; an ink area with no line drawing nothing and reporting
 *   nothing, whatever group its character writes.
 * - `svgContent`, every route, and reloads.
 *
 * Does NOT cover:
 * - Where the layer sits and what it holds without effects, see
 *   `BlissSVGBuilder.element-background-layer.test.js`; the boxes, see
 *   `BlissSVGBuilder.element-backgrounds.test.js`; the ink areas, see
 *   `BlissSVGBuilder.ink-areas.test.js`.
 * - Styling written after `||`, which lands on the content group and so
 *   reaches the layer whole, the root writing no copy of its own, see
 *   `BlissSVGBuilder.element-background-layer.test.js`.
 * - An `element-background--` key written on an element, an attribute of
 *   its backgrounds and not an effect, see
 *   `BlissSVGBuilder.element-background-key-reach.test.js`.
 * - How a browser draws a copy (opacity as two layers, a clip or a
 *   `transform-box` origin measured on the background's own box, a filter
 *   run on each), which no test in this suite can observe.
 * - An effect written through a custom property
 *   (`transform:rotate(var(--r))`): the custom property is not copied, so the
 *   effect does not reach the background. CSS escapes inside a `style` are
 *   not read.
 * - A filter's copy under a crop, in a word's ink area or in a link's lines,
 *   see `BlissSVGBuilder.native-filters.test.js`.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box, exactly as emitted.
const box = (x, y, width, height, paint) =>
  `<rect class="bliss-element-background bliss-element-background--box" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"/>`;
// One painted ink area around the given lines, exactly as emitted.
const inkArea = (paint, width, lines) =>
  `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="${paint}" stroke-width="${width}">${lines}</g>`;
// One link's ink area, which takes the rect's place inside the link.
const linkInk = (width, lines) => `<g fill="none" stroke="transparent" stroke-width="${width}">${lines}</g>`;
const linkOpen = (href) => `<a href="${href}" style="cursor: pointer;">`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

// A filter is drawn as a native one (#34): its id, read from the picture's
// hash, and the <filter> exactly as emitted, its region as [x, y, width, height].
const idIn = (svg, n) => `bliss-filter-${svg.match(/bliss-filter-([0-9a-f]{8})-\d/)?.[1]}-${n}`;
const filterDef = (id, [x, y, width, height]) => `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}"`
  + ` width="${width}" height="${height}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1"/></filter>`;
// blur(1px) reaches 3: B313's viewBox (-0.75 -0.75 9.5 21.5) grown by it, and its box (-1..9 x -1..21)
const VIEWBOX_REGION = [-3.75, -3.75, 15.5, 27.5];
const BOX_REGION = [-4, -4, 16, 28];

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B291_AT_10 = '<path d="M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const YELLOW_B313 = box(-1, -1, 10, 22, 'yellow');
const YELLOW_HALO = inkArea('yellow', 1.3, B313);

describe('BlissSVGBuilder background effects', () => {
  describe('when a painted element writes an effect', () => {
    it.each([
      ['transform', 'scale(2)'],
      ['transform-origin', 'center'],
      ['transform-box', 'fill-box'],
      ['opacity', '0.5'],
      ['clip-path', 'inset(0 0 50% 0)'],
      ['mask', 'url(#m)'],
      ['display', 'none'],
      ['visibility', 'hidden'],
    ])('copies %s=%s around its box and its ink area, written as an option or in style', (name, value) => {
      // the ink area's lines carry no second copy: the one around the area is
      // the painted element's own
      const attribute = `${name}="${value}"`;
      const style = `style="${name}:${value}"`;

      expect(contentOf(build(`[${name}=${value};background=yellow]B313`).svgCode))
        .toBe(`<g ${attribute}>${YELLOW_B313}</g><g ${attribute}>${B313}</g>`);
      expect(contentOf(build(`[style=${name}:${value};background=yellow]B313`).svgCode))
        .toBe(`<g ${style}>${YELLOW_B313}</g><g ${style}>${B313}</g>`);
      expect(contentOf(build(`[${name}=${value};background-area=ink;background=yellow]B313`).svgCode))
        .toBe(`<g ${attribute}>${YELLOW_HALO}</g><g ${attribute}>${B313}</g>`);
      expect(contentOf(build(`[style=${name}:${value};background-area=ink;background=yellow]B313`).svgCode))
        .toBe(`<g ${style}>${YELLOW_HALO}</g><g ${style}>${B313}</g>`);
    });

    it('copies filter=blur(1px) around its box and its ink area, written as an option or in style', () => {
      // the copy and the lines each draw their own native filter, the copy's
      // region from what it holds: the box reaches past the lines, the ink
      // area stays inside the viewBox
      const [attribute, style, inkAttribute, inkStyle] = [
        '[filter=blur(1px);background=yellow]B313', '[style=filter:blur(1px);background=yellow]B313',
        '[filter=blur(1px);background-area=ink;background=yellow]B313', '[style=filter:blur(1px);background-area=ink;background=yellow]B313',
      ].map(input => build(input).svgCode);
      const copied = (svg, channel, region, background) =>
        `<g ${channel(idIn(svg, 1))}>${filterDef(idIn(svg, 1), region)}${background}</g>`
        + `<g ${channel(idIn(svg, 2))}>${filterDef(idIn(svg, 2), VIEWBOX_REGION)}${B313}</g>`;
      const asAttribute = (id) => `filter="url(#${id})"`;
      const asStyle = (id) => `style="filter:url(#${id})"`;

      expect(contentOf(attribute)).toBe(copied(attribute, asAttribute, BOX_REGION, YELLOW_B313));
      expect(contentOf(style)).toBe(copied(style, asStyle, BOX_REGION, YELLOW_B313));
      expect(contentOf(inkAttribute)).toBe(copied(inkAttribute, asAttribute, VIEWBOX_REGION, YELLOW_HALO));
      expect(contentOf(inkStyle)).toBe(copied(inkStyle, asStyle, VIEWBOX_REGION, YELLOW_HALO));
    });
  });

  describe('when an element writes paint or another attribute', () => {
    it.each([
      ['paint, a class and an id', '[class=noun;id=x;color=red;stroke-width=1;fill=blue;stroke-dasharray=1;background=yellow]B313',
        `${YELLOW_B313}<g stroke-width="1" stroke="red" class="noun" id="x" fill="blue" stroke-dasharray="1">${B313}</g>`],
      ['how its lines blend, take clicks or scale', '[mix-blend-mode=multiply;isolation=isolate;pointer-events=none;cursor=pointer;vector-effect=non-scaling-stroke;background=yellow]B313',
        `${YELLOW_B313}<g mix-blend-mode="multiply" isolation="isolate" pointer-events="none" cursor="pointer">`
        + '<path vector-effect="non-scaling-stroke" d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/></g>'],
      ['a character\'s paint and class, into its word\'s ink area', '[background-area=ink;background=yellow]|[color=red;class=noun]B313/B291',
        `${inkArea('yellow', 1.3, B313_B291)}<g stroke="red" class="noun">${B313}</g>${B291_AT_10}`],
      // pins a style read only from `style`: a survivor of the 2026-11 stryker
      // run read this value as one and blurred the box
      ['a data attribute whose value reads as a style', '[data-note=filter:blur(1px);background=yellow]B313',
        `${YELLOW_B313}<g data-note="filter:blur(1px)">${B313}</g>`],
    ])('copies none of %s', (_case, input, expected) => {
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });
  });

  describe('when an effect is written in a style', () => {
    it.each([
      ['a style of several declarations', 'transform:scale(2);color:red;opacity:0.5',
        'transform:scale(2);color:red;opacity:0.5', 'transform:scale(2);opacity:0.5'],
      ['a style with a ; inside parentheses', 'mask:url(data:image/png;base64,AAAA);color:red',
        'mask:url(data:image/png;base64,AAAA);color:red', 'mask:url(data:image/png;base64,AAAA)'],
      ['a style naming a property in capitals, spaced', 'color:red; OPACITY :0.5',
        'color:red; OPACITY :0.5', ' OPACITY :0.5'],
      ['a style with a parenthesis inside quotes', 'font-family:\'a(b\';opacity:0.5',
        'font-family:&#39;a(b&#39;;opacity:0.5', 'opacity:0.5'],
      ['a style with an unmatched closing parenthesis', 'color:red);opacity:0.5',
        'color:red);opacity:0.5', 'opacity:0.5'],
      ['a style with a comment before a property', '/*x*/opacity:0.5;color:red',
        '/*x*/opacity:0.5;color:red', '/*x*/opacity:0.5'],
    ])('copies only the effects from %s, as written and in order', (_case, style, emitted, copied) => {
      // the lines keep the whole style, the copy its effect declarations; pins
      // the reader: each row fails if parentheses, quotes, an escape, a
      // comment, or a property's case or spacing were read otherwise (hand
      // mutants, 2026-10-20; the comment rows since the shared splitter, #34)
      const svg = build(`[style="${style}";background=yellow]B313`).svgCode;

      expect(contentOf(svg)).toBe(`<g style="${copied}">${YELLOW_B313}</g><g style="${emitted}">${B313}</g>`);
    });

    it.each([
      ['no effect', 'color:red;stroke-dasharray:1', 'color:red;stroke-dasharray:1'],
      ['an effect named only inside quotes', 'content:\'a;opacity:0\'', 'content:&#39;a;opacity:0&#39;'],
      // regression: the splitter once broke at a ; inside a comment, so the
      // copy faded a background the lines never faded
      ['an effect named only inside a comment', 'color:red/*;opacity:0;*/', 'color:red/*;opacity:0;*/'],
    ])('writes no copy for a style with %s', (_case, style, emitted) => {
      expect(contentOf(build(`[style="${style}";background=yellow]B313`).svgCode))
        .toBe(`${YELLOW_B313}<g style="${emitted}">${B313}</g>`);
    });
  });

  describe('when an element writes one filter as an option and another in its style', () => {
    it('writes the two filters of its word\'s copy one after the other, before the box', () => {
      // pins the copy's filters written side by side: a survivor of the
      // 2026-11 stryker run wrote other text between them
      const svg = build('[filter=blur(1px);style=filter:blur(2px);background=yellow]|B313/B291').svgCode;
      const [copy] = contentOf(svg).split('<rect');

      expect(copy).toMatch(/^<g [^>]*>(<filter [^>]*>.*?<\/filter>){2}$/);
    });

    it('writes the two filters of its copy in its word\'s ink area one after the other, before its lines', () => {
      // pins the ink area copy's filters written side by side: a survivor of
      // the 2026-11 stryker run wrote other text between them
      const svg = build('[background-area=ink;background=yellow]|[filter=blur(1px);style=filter:blur(2px)]B313/B291').svgCode;
      const [copy] = contentOf(svg).split('<path');

      expect(copy).toMatch(/^<g class="bliss-element-background bliss-element-background--ink"[^>]*><g [^>]*>(<filter [^>]*>.*?<\/filter>){2}$/);
    });
  });

  describe('when effects are written at several levels', () => {
    it('nests the copies outermost first, as the lines nest their groups', () => {
      // each filter's region is cut along x 4 past what it covers: the box
      // from 2.5 to 5.5, B81's lines from 2.75 to 5.25
      const svg = build('[transform=rotate(10)]|[opacity=0.5]B313;[background=yellow;filter=blur(1px)]>B81').svgCode;

      expect(contentOf(svg)).toBe(
        `<g transform="rotate(10)"><g opacity="0.5"><g filter="url(#${idIn(svg, 1)})">${filterDef(idIn(svg, 1), [-1.5, -3.75, 11, 27.5])}`
        + `${box(2.5, 3.5, 3, 3, 'yellow')}</g></g></g>`
        + `<g transform="rotate(10)"><g opacity="0.5">${B313}<g filter="url(#${idIn(svg, 2)})">${filterDef(idIn(svg, 2), [-1.25, -3.75, 10.5, 27.5])}`
        + '<path d="M3,6l1,-2M4,4l1,2"/></g></g></g>');
    });

    it('shares one copy between every background under one element', () => {
      // the two boxes fade as one layer, as one picture of them would
      const svg = build('[opacity=0.5]|[background=yellow]B313/[background=green]B291').svgCode;

      expect(contentOf(svg)).toBe(
        `<g opacity="0.5">${YELLOW_B313}${box(9, -1, 10, 22, 'green')}</g><g opacity="0.5">${B313_B291}</g>`);
    });

    it('writes no copy for an element with nothing painted beneath it', () => {
      const svg = build('[opacity=0.5]B313/[background=yellow]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(9, -1, 10, 22, 'yellow')}<g opacity="0.5">${B313}</g>${B291_AT_10}`);
    });

    it('draws the whole layer, copies included, before the first line', () => {
      const svg = build('[transform=rotate(10);background=yellow]B313/[background=green]B291').svgCode;

      expect(contentOf(svg)).toBe(`<g transform="rotate(10)">${YELLOW_B313}</g>${box(9, -1, 10, 22, 'green')}`
        + `<g transform="rotate(10)">${B313}</g>${B291_AT_10}`);
    });
  });

  describe('when a descendant of a painted element writes an effect', () => {
    it('leaves its word\'s box where the layout puts it', () => {
      const svg = build('[background=yellow]|B313/[transform=rotate(30 14 12)]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 20, 22, 'yellow')}${B313}<g transform="rotate(30 14 12)">${B291_AT_10}</g>`);
    });

    it.each([
      ['transform', 'rotate(20 14 12)'],
      ['display', 'none'],
    ])('carries its %s into its word\'s ink area, where its lines carry it', (name, value) => {
      const svg = build(`[background-area=ink;background=yellow]|B313/[${name}=${value}]B291`).svgCode;
      const lines = `${B313}<g ${name}="${value}">${B291_AT_10}</g>`;

      expect(contentOf(svg)).toBe(`${inkArea('yellow', 1.3, lines)}${lines}`);
    });

    it('writes its width and its effects on one group in its word\'s ink area, as its lines have them', () => {
      const svg = build('[background-area=ink;background=yellow]|[stroke-width=1;transform=rotate(20 4 12)]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(
        inkArea('yellow', 1.3, `<g stroke-width="1.8" transform="rotate(20 4 12)">${B313}</g>${B291_AT_10}`)
        + `<g stroke-width="1" transform="rotate(20 4 12)">${B313}</g>${B291_AT_10}`);
    });
  });

  describe('when a painted neighbour is hidden', () => {
    it('still counts it as painted, as the layout ignores effects', () => {
      const svg = build('[background=yellow]B313/AK:1/[background=red;display=none]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 9.5, 22, 'yellow')}<g display="none">${box(8.5, -1, 9.5, 22, 'red')}</g>`
        + `${B313}<g display="none"><path d="M9,8h8M9,16h8M9,8v8M17,8v8"/></g>`);
    });
  });

  describe('when a link answers on its ink', () => {
    it.each([
      ['transform', 'rotate(20 14 12)'],
      ['display', 'none'],
    ])('carries a descendant\'s %s into the link\'s lines', (name, value) => {
      // so a hidden character answers no click
      const svg = build(`[link-area=ink;href=#a]|B313/[${name}=${value}]B291`).svgCode;
      const lines = `${B313}<g ${name}="${value}">${B291_AT_10}</g>`;

      expect(contentOf(svg)).toBe(`${linkOpen('#a')}${linkInk(1.3, lines)}${lines}</a>`);
    });

    it('keeps the linked element\'s own effects on its group, never repeated inside its lines', () => {
      const svg = build('[link-area=ink;href=#a;transform=rotate(45)]B313').svgCode;

      expect(contentOf(svg)).toBe(`${linkOpen('#a')}<g transform="rotate(45)">${linkInk(1.3, B313)}${B313}</g></a>`);
    });
  });

  describe('when a word painted by its ink holds only a character with no line', () => {
    it.each([
      ['a width', '[stroke-width=1]ZSA'],
      ['an effect', '[opacity=0.5]ZSA'],
    ])('draws no ink area and reports nothing for a character with %s', (_case, character) => {
      // pins an empty ink area: the character's group around no line is not
      // a line, so there is nothing to paint and no paint to report displaced
      const builder = build(`[element-background--ink--stroke=red]||[background-area=ink;background=yellow]|${character}`);

      expect(builder.svgCode).not.toContain('bliss-element-background');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when reading svgContent', () => {
    it('includes the copies, as the content group\'s inner markup', () => {
      const builder = build('[transform=rotate(10);background=yellow]B313');

      expect(builder.svgContent).toBe(`<g transform="rotate(10)">${YELLOW_B313}</g><g transform="rotate(10)">${B313}</g>`);
      expect(builder.svgContent).toBe(contentOf(builder.svgCode));
    });
  });

  describe('when the same options arrive by different routes', () => {
    it('draws the copies identically from the DSL, a composition object, setOptions and the transient options', () => {
      const options = { transform: 'rotate(10)', style: 'opacity:0.5;color:red', background: 'yellow' };
      const dsl = build('[transform=rotate(10);style="opacity:0.5;color:red";background=yellow]B313/B291');
      const composition = build({
        groups: [{ glyphs: [{ options, parts: [{ codeName: 'B313' }] }, { parts: [{ codeName: 'B291' }] }] }],
      });
      const handle = build('B313/B291');
      handle.glyph(0).setOptions(options);
      const transient = build('B313/B291');
      transient.glyph(0).setTransientOptions(options);

      expect(contentOf(dsl.svgCode)).toBe(`<g transform="rotate(10)" style="opacity:0.5">${YELLOW_B313}</g>`
        + `<g transform="rotate(10)" style="opacity:0.5;color:red">${B313}</g>${B291_AT_10}`);
      for (const builder of [composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
        expect(builder.warnings).toEqual([]);
      }
      expect(composition.toString()).toBe(dsl.toString());
      expect(handle.toString()).toBe(dsl.toString());
      expect(transient.toString()).toBe('B313/B291');
    });

    it('reloads from toString() and both toJSON() modes to the same picture', () => {
      const builder = build('[transform=rotate(10)]|[style="opacity:0.5;color:red";background=yellow]B313;[filter=blur(1px);background=green]>B81/B291');

      expect(builder.svgCode).toContain('<g transform="rotate(10)"><g style="opacity:0.5">');
      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });
});
