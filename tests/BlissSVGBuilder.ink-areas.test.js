import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the ink areas: `background-area=ink` paints an element's own lines again
 * beneath them, a quarter unit wider on each side, and `link-area=ink` puts the
 * same lines, transparent, in place of a link's rect, so the link answers on
 * its lines and a quarter unit around them.
 *
 * Covers:
 * - The area's markup: a group of the element's lines with `fill="none"`,
 *   stroked in the paint at the element's computed width plus half a unit,
 *   first in the content group, and no rect.
 * - What the lines are: a character's indicators included; an enclosure
 *   ringed, never filled, whatever fill the symbol carries; ZSA drawing no
 *   area, for a background or a link.
 * - Inheritance: the option written on a word or after `||` reaching every
 *   background below it; a character's own `box` beating its word's `ink`; the
 *   picture's own background staying the whole picture.
 * - Widths: a character's `stroke-width`, the symbol's, and one inside a
 *   painted word each widened by half a unit; a width written in `style` not
 *   followed; a dot's and a comma's own widths widened with their paths kept;
 *   a letter and a text character filled in the paint and outlined; a summed
 *   width rounded to four decimals.
 * - `link-area=ink`: the lines in transparent, in the rect's place, for a
 *   character, each character of a word that sets it, a part, a coloured
 *   character and a letter; the global link staying whole; a character linked
 *   by its ink still counting as a linked neighbour.
 * - The layer attributes: `element-background--ink--stroke` displacing
 *   `background`, reported; `element-background--fill` replacing the area's
 *   library default, silently.
 * - Every route alike for `link-area`, and reloads for both area options.
 *
 * Does NOT cover:
 * - The boxes, see `BlissSVGBuilder.element-backgrounds.test.js`, and their
 *   layer, see `BlissSVGBuilder.element-background-layer.test.js`.
 * - The options' admission, see
 *   `BlissSVGBuilder.element-background-options.test.js`.
 * - Pass-through attributes on the painted element (an author's attributes,
 *   `vector-effect`): none reaches its ink area.
 * - How a browser or a renderer draws and hit-tests the areas, which no test
 *   in this suite can observe.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

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

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B291 = '<path d="M0,8h8M0,16h8M0,8v8M8,8v8"/>';
const B291_AT_10 = '<path d="M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
// The action indicator's ink in `B313;B81`: x 3 to 5, y 4 to 6.
const B81_ON_B313 = '<path d="M3,6l1,-2M4,4l1,2"/>';
const DOT = '<path d="M-0.20825,12a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"/>';
const WIDE_DOT = '<path d="M-0.25,12a0.25,0.25 0 1,1 0.5,0a0.25,0.25 0 1,1 -0.5,0"/>';
const COMMA_DOT = '<path d="M-0.20825,16a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"/>';
const COMMA_TAIL = '<path d="M0.2776666666666667,16q0.06941666666666667,0.6941666666666667 -0.5553333333333333,1.1106666666666667"/>';
const textAlpha = (strokeWidth, fill) =>
  `<text x="-0.3" y="16" font-family="Liberation Sans, sans-serif" font-size="5.7" stroke-width="${strokeWidth}" fill="${fill}">α</text>`;
// The letter a, drawn alone: a filled outline, `stroke="none" fill="#000000"`.
const LETTER_A = contentOf(build('Xa').svgCode);
const letterA = (attributes) => LETTER_A.replace('stroke="none" fill="#000000"', attributes);

describe('BlissSVGBuilder ink areas', () => {
  describe('when a character is painted by its ink', () => {
    it('draws its lines again in the paint, half a unit wider, beneath them and with no box', () => {
      // pins the outline: none leaves the area at 0.5, hidden under the line,
      // and a quarter unit in all draws it at 0.75
      const svg = build('[background-area=ink;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${inkArea('yellow', 1, B313)}${B313}`);
      expect(svg).not.toContain('<rect');
    });

    it.each([
      ['alone', '[background-area=ink;background=yellow]B291'],
      ['under a fill written for the whole symbol', '[fill=red]||[background-area=ink;background=yellow]B291'],
    ])('rings an enclosure and never fills it, %s', (_case, input) => {
      // the area states fill="none" itself: a global fill lands on the content
      // group, and an area inheriting it would paint a filled square
      expect(contentOf(build(input).svgCode)).toBe(`${inkArea('yellow', 1, B291)}${B291}`);
    });

    it('includes its indicators', () => {
      const lines = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M3,6l1,-2M4,4l1,2"/>';

      expect(contentOf(build('[background-area=ink;background=yellow]B313;B81').svgCode))
        .toBe(`${inkArea('yellow', 1, lines)}${lines}`);
    });

    it('draws no area for ZSA, which has no line to follow, silently', () => {
      const builder = build('[background-area=ink;background=yellow]ZSA');

      expect(builder.svgCode).not.toContain('bliss-element-background');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the area option is inherited', () => {
    it.each([
      ['a word', '[background-area=ink]|[background=yellow]B313/[background=red]B291',
        `${inkArea('yellow', 1, B313)}${inkArea('red', 1, B291_AT_10)}${B313_B291}`],
      ['the symbol', '[background-area=ink]||[background=yellow]B313',
        `${inkArea('yellow', 1, B313)}${B313}`],
    ])('paints every background below %s by its ink', (_case, input, expected) => {
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });

    it('lets a character\'s own box beat its word\'s ink', () => {
      const svg = build('[background-area=ink]|[background-area=box;background=yellow]B313/B291').svgCode;

      expect(contentOf(svg)).toBe('<rect class="bliss-element-background bliss-element-background--box" '
        + `x="-1" y="-1" width="10" height="22" fill="yellow" stroke="none"/>${B313_B291}`);
    });
  });

  describe('when the picture has a background of its own', () => {
    it('keeps it the whole picture under an ink area option written after ||', () => {
      const svg = build('[background=white;background-area=ink]||B313').svgCode;

      expect(svg).toContain(
        '<rect class="bliss-background-zone" x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="white"/>');
      expect(svg).not.toContain('bliss-element-background');
    });

    it('draws a word\'s own white background as an ink area', () => {
      expect(contentOf(build('[background=white;background-area=ink]|B313').svgCode))
        .toBe(`${inkArea('white', 1, B313)}${B313}`);
    });
  });

  describe('when a line width is set', () => {
    it.each([
      ['the character\'s own', '[background-area=ink;background=yellow;stroke-width=1]B313',
        `${inkArea('yellow', 1.5, B313)}<g stroke-width="1">${B313}</g>`],
      ['the symbol\'s', '[stroke-width=1]||[background-area=ink;background=yellow]B313',
        `${inkArea('yellow', 1.5, B313)}${B313}`],
      ['a character\'s, inside a painted word', '[background-area=ink;background=yellow]|[stroke-width=1]B313/B291',
        `${inkArea('yellow', 1, `<g stroke-width="1.5">${B313}</g>${B291_AT_10}`)}<g stroke-width="1">${B313}</g>${B291_AT_10}`],
    ])('widens %s width by half a unit', (_case, input, expected) => {
      // pins the nested width: the word's area alone would draw the thicker
      // character at the word's width, inside its own line
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });

    it('ignores a width written in a style attribute', () => {
      // the area is built from the widths the library computes
      const svg = build('[style=stroke-width:2;background-area=ink;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${inkArea('yellow', 1, B313)}<g style="stroke-width:2">${B313}</g>`);
    });

    it('rounds each widened width to four decimals, as the picture\'s own numbers are', () => {
      // pins the rounding of both summed widths, the area's and a nested one:
      // unrounded, 0.07 + 0.5 and 0.33 + 0.5 carry float noise
      const svg = build('[background-area=ink;background=yellow;stroke-width=0.07]|[stroke-width=0.33]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`${inkArea('yellow', 0.57, `<g stroke-width="0.83">${B313}</g>${B291_AT_10}`)}`
        + `<g stroke-width="0.07"><g stroke-width="0.33">${B313}</g>${B291_AT_10}</g>`);
    });
  });

  describe('when the lines carry widths of their own', () => {
    it.each([
      ['a dot', '[background-area=ink;background=yellow]B270',
        `<g stroke-width="0.4165">${DOT}</g>`, `<g stroke-width="0.9165">${DOT}</g>`],
      ['a dot of a set width', '[dot-width=1;background-area=ink;background=yellow]B270',
        `<g stroke-width="0.5">${WIDE_DOT}</g>`, `<g stroke-width="1">${WIDE_DOT}</g>`],
      ['a character drawn with the comma shape', '[background-area=ink;background=yellow]B5',
        `<g stroke-width="0.4165">${COMMA_DOT}</g><g stroke-width="0.2776666666666667">${COMMA_TAIL}</g>`,
        `<g stroke-width="0.9165">${COMMA_DOT}</g><g stroke-width="0.7776666666666667">${COMMA_TAIL}</g>`],
    ])('widens each width of %s by half a unit and keeps its path', (_case, input, ink, area) => {
      // pins the geometry kept: widening a dot or a comma through its base
      // width would also grow the dot's circle and stretch the comma's tail
      expect(contentOf(build(input).svgCode)).toBe(`${inkArea('yellow', 1, area)}${ink}`);
    });
  });

  describe('when the lines are a filled letter or text', () => {
    it('fills a letter in the paint and outlines it by half a unit', () => {
      expect(LETTER_A).toMatch(/^<path stroke="none" fill="#000000" d="M0\.8628,16\.0301/);
      expect(contentOf(build('[background-area=ink;background=yellow]Xa').svgCode))
        .toBe(`${inkArea('yellow', 1, letterA('stroke-width="0.5" fill="yellow"'))}${LETTER_A}`);
    });

    it('fills and outlines a character drawn as text the same way', () => {
      expect(contentOf(build('[background-area=ink;background=yellow]Xα').svgCode))
        .toBe(`${inkArea('yellow', 1, textAlpha(0.5, 'yellow'))}${textAlpha(0, '#000000')}`);
    });
  });

  describe('when a link answers on its ink', () => {
    it('puts the lines, transparent and half a unit wider, in the link rect\'s place, with no class', () => {
      const svg = build('[link-area=ink;href=#a]B313').svgCode;

      expect(contentOf(svg)).toBe(`${linkOpen('#a')}${linkInk(1, B313)}${B313}</a>`);
      expect(svg).not.toContain('<rect');
    });

    it.each([
      ['each character of a word that sets it', '[link-area=ink]|[href=#a]B313/[href=#b]B291',
        `${linkOpen('#a')}${linkInk(1, B313)}${B313}</a>${linkOpen('#b')}${linkInk(1, B291_AT_10)}${B291_AT_10}</a>`],
      ['a part', 'B313;[link-area=ink;href=#p]>B81',
        `${B313}${linkOpen('#p')}${linkInk(1, B81_ON_B313)}${B81_ON_B313}</a>`],
      ['a coloured character, inside its group', '[link-area=ink;href=#a;color=red]B313',
        `${linkOpen('#a')}<g stroke="red">${linkInk(1, B313)}${B313}</g></a>`],
      ['a letter, filled in transparent', '[link-area=ink;href=#a]Xa',
        `${linkOpen('#a')}${linkInk(1, letterA('stroke-width="0.5" fill="transparent"'))}${LETTER_A}</a>`],
    ])('draws the link\'s lines for %s', (_case, input, expected) => {
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });

    it('builds a link with nothing to answer on for ZSA, which has no line', () => {
      // pins the empty ink: no area is drawn, and the link is still built
      // rather than the build failing on an area that is not there
      const builder = build('[link-area=ink;href=#a]ZSA');

      expect(contentOf(builder.svgCode)).toBe(`${linkOpen('#a')}</a>`);
      expect(builder.warnings).toEqual([]);
    });

    it('keeps the global link clickable across the whole picture', () => {
      const svg = build('[link-area=ink;href=#g]||B313').svgCode;

      expect(svg).toContain('<rect x="-0.75" y="-0.75" width="100%" height="100%" fill="transparent" stroke="none"/>');
      expect(contentOf(svg)).toBe(B313);
    });

    it('still counts as a linked neighbour for the next link\'s rect', () => {
      const svg = build('[link-area=ink;href=#a]B313/AK:1/[href=#b]B291').svgCode;

      expect(svg).toContain(`${linkOpen('#b')}<rect x="8.5" y="-1" width="9.5" height="22" fill="transparent" stroke="none"/>`);
    });
  });

  describe('when a layer attribute names the ink areas', () => {
    it('reports a written stroke displacing the background it paints', () => {
      const builder = build('[element-background--ink--stroke=red]||[background-area=ink;background=yellow]B313');

      expect(contentOf(builder.svgCode)).toBe(`${inkArea('red', 1, B313)}${B313}`);
      expect(builder.warnings).toEqual([{
        code: 'MULTIPLE_ATTRIBUTE_VALUES',
        message: '"element-background--ink--stroke" and "background" both set "stroke" on element-background--ink, '
          + 'so "element-background--ink--stroke" was used: a key that names its target beats one that has to be resolved to it. '
          + 'Remove whichever you did not mean.',
        source: 'background',
      }]);
    });

    it('fills an area silently, replacing only the library\'s own fill="none"', () => {
      const builder = build('[element-background--fill=red]||[background-area=ink;background=yellow]B313');

      expect(contentOf(builder.svgCode)).toBe(
        `<g class="bliss-element-background bliss-element-background--ink" fill="red" stroke="yellow" stroke-width="1">${B313}</g>${B313}`);
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the same options arrive by different routes', () => {
    it('draws an ink link identically from the DSL, a composition object, setOptions and the transient options', () => {
      const dsl = build('[link-area=ink]|[href=#a]B313/B291');
      const composition = build({
        groups: [{ options: { linkArea: 'ink' }, glyphs: [
          { options: { href: '#a' }, parts: [{ codeName: 'B313' }] },
          { parts: [{ codeName: 'B291' }] },
        ] }],
      });
      const handle = build('B313/B291');
      handle.group(0).setOptions({ linkArea: 'ink' });
      handle.glyph(0).setOptions({ href: '#a' });
      const transient = build('[href=#a]B313/B291');
      transient.group(0).setTransientOptions({ linkArea: 'ink' });

      expect(contentOf(dsl.svgCode)).toBe(`${linkOpen('#a')}${linkInk(1, B313)}${B313}</a>${B291_AT_10}`);
      for (const builder of [composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
        expect(builder.warnings).toEqual([]);
      }
      expect(composition.toString()).toBe(dsl.toString());
      expect(handle.toString()).toBe(dsl.toString());
      expect(transient.toString()).toBe('[href=#a]B313/B291');
    });

    it.each([
      ['[link-area=ink]|[href=#a]B313/B291', 'stroke="transparent"'],
      ['[background-area=ink;background=yellow]B313/B291', 'bliss-element-background--ink'],
    ])('reloads %s from toString() and both toJSON() modes to the same picture', (input, marker) => {
      const builder = build(input);

      expect(builder.svgCode).toContain(marker);
      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });
});
