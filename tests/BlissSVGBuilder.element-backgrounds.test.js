import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the box an element background paints: a rect over the painted word's,
 * character's or part's area, the area a link of that element covers, with
 * the margins shared between painted neighbours instead of linked ones.
 *
 * Covers:
 * - A character's box: its base span plus 1 unit on each side, indicators
 *   ignored, and y -1 to 21 in its own frame however short its ink. Toward a
 *   painted neighbour (the next character in reading order, painted itself or
 *   by its word, across a word space too) closer than 2 units, half the gap;
 *   toward any other, the full unit, a neighbour that is only linked, holds
 *   only a painted part, sits on the picture's own background or has an empty
 *   background included.
 * - A word's box: its characters' boxes joined, one rect for the whole word.
 * - A part's box: its ink box plus half a unit, wherever its character sits.
 * - The box's numbers rounded to 4 decimals, as the picture rounds its own.
 * - `background-area=box`, and a refused area value, painting the same box.
 * - What paints: an options-only token, a character whose code is unknown and
 *   a word of no characters paint nothing; the error placeholder paints like
 *   any character; ZSA, content that draws no line, paints its box.
 * - A painted character leaving a neighbouring link rect its full unit.
 * - A definition's background painting each part it draws by that part's
 *   box, and a background written where it is used painting the character.
 *
 * Does NOT cover:
 * - Where the boxes sit in the picture (order, depth, styling, links,
 *   `svgContent`, the layer attributes), see
 *   `BlissSVGBuilder.element-background-layer.test.js`.
 * - The options' admission and routes, see
 *   `BlissSVGBuilder.element-background-options.test.js`.
 * - The ink areas (`background-area=ink`), see
 *   `BlissSVGBuilder.ink-areas.test.js`.
 * - `background=none` counting as a paint: it paints nothing visible, yet its
 *   character is a painted neighbour, as at global scope; no special case.
 * - Definitions beyond the two here: a definition's options land on each part
 *   it draws, the rule pinned in `BlissSVGBuilder.alias-options-on-parts.test.js`.
 * - The link rects themselves, see `BlissSVGBuilder.element-link-area.test.js`.
 * - A crop: `crop=auto` trims to the ink, and a box past the picture's edge is
 *   cut there.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box, exactly as emitted.
const box = (x, y, width, height, paint) =>
  `<rect class="bliss-element-background bliss-element-background--box" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"/>`;
// Every box in a picture, in document order.
const boxes = (svg) => svg.match(/<rect class="bliss-element-background[^>]*\/>/g) ?? [];
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';

describe('BlissSVGBuilder element backgrounds', () => {
  describe('when a character is painted', () => {
    it.each([
      '[background=yellow]B313',
      '[background-area=box;background=yellow]B313',
      '[background-area=foo;background=yellow]B313',
    ])('paints %s as a box over its base span plus 1 unit, the full band high', (input) => {
      // B313's ink is y 8 to 16; the box is the band, y -1 to 21, regardless.
      // pins the rect's own stroke="none": the content group strokes at 0.5,
      // which would outline the box
      expect(contentOf(build(input).svgCode)).toBe(`${box(-1, -1, 10, 22, 'yellow')}${B313}`);
    });

    it.each([
      ['on its left', 'B313/AK:1/[background=yellow]B291', [box(8, -1, 10, 22, 'yellow')]],
      ['on its right', '[background=yellow]B313/AK:1/B291', [box(-1, -1, 10, 22, 'yellow')]],
    ])('takes the full unit toward an unpainted neighbour 1 unit away %s', (_case, input, expected) => {
      // it does not matter that the unit reaches under the neighbour's ink:
      // half the gap whatever the neighbour gives 8.5 and 9.5
      expect(boxes(build(input).svgCode)).toEqual(expected);
    });

    it.each([
      ['each painted itself, in one word', '[background=yellow]B313/AK:1/[background=red]B291',
        [box(-1, -1, 9.5, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red')]],
      ['each painted itself, across a word space', '[word-space=1]||[background=yellow]B313//[background=red]B291',
        [box(-1, -1, 9.5, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red')]],
      ['two painted words, across a word space', '[word-space=1]||[background=yellow]|B313//[background=red]|B291',
        [box(-1, -1, 9.5, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red')]],
      ['the earlier painted by its word, across a word space', '[word-space=1]||[background=yellow]|B313//[background=red]B291',
        [box(-1, -1, 9.5, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red')]],
      ['the earlier painted by its word, in one word', '[background=yellow]|B313/AK:1/[background=red]B291',
        [box(-1, -1, 19, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red')]],
    ])('meets a painted neighbour halfway when they are 1 unit apart, %s', (_case, input, expected) => {
      // pins the half gap between two paints, sought across a word space too,
      // and a character of a painted word counting as painted (counting only a
      // character's own background leaves the red box at 8 in the last row)
      expect(boxes(build(input).svgCode)).toEqual(expected);
    });

    it('leaves the strip between two painted neighbours bare when they are 4 units apart', () => {
      const svg = build('[char-space=4]||[background=yellow]B313/[background=red]B291').svgCode;

      expect(boxes(svg)).toEqual([box(-1, -1, 10, 22, 'yellow'), box(11, -1, 10, 22, 'red')]);
    });

    it.each([
      ['it is only linked', '[href=#a]B313/AK:1/[background=yellow]B291',
        [box(8, -1, 10, 22, 'yellow')]],
      ['only a part of it is painted', 'B313;[background=red]>B81/AK:1/[background=yellow]B291',
        [box(2.5, 3.5, 3, 3, 'red'), box(8, -1, 10, 22, 'yellow')]],
      ['only the picture\'s own background covers it', '[background=white]||B313/AK:1/[background=yellow]B291',
        [box(8, -1, 10, 22, 'yellow')]],
      ['its background is empty', '[background=]B313/AK:1/[background=yellow]B291',
        [box(8, -1, 10, 22, 'yellow')]],
    ])('treats a neighbour as unpainted when %s', (_case, input, expected) => {
      // pins what counts as painted: a character's own non-empty background
      // or its word's, never a link, a part or the paper (counting any of
      // these would give the yellow box x="8.5")
      expect(boxes(build(input).svgCode)).toEqual(expected);
    });

    it('keeps the base span when an indicator overhangs it', () => {
      // B1's base is 0 wide at x=1 and the indicator's ink runs 0 to 2: the base
      // span plus 1 is 0 to 2, where the ink plus 1 would be -1 to 3
      expect(boxes(build('[background=yellow]B1;B81').svgCode)).toEqual([box(0, -1, 2, 22, 'yellow')]);
    });

    it('moves the band with a character moved vertically', () => {
      expect(contentOf(build('[y=2;background=yellow]B313').svgCode))
        .toBe(`${box(-1, 1, 10, 22, 'yellow')}<path d="M0,12a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>`);
    });

    it('rounds the box to 4 decimals, as the picture rounds its own numbers', () => {
      // the yellow B291 sits at 8.7 + 8 + 0.7, and unrounded its box reads
      // x="17.049999999999997" width="9.350000000000001"
      const svg = build('[char-space=0.7]||B313/[background=red]B291/[background=yellow]B291').svgCode;

      expect(boxes(svg)).toContain(box(17.05, -1, 9.35, 22, 'yellow'));
    });
  });

  describe('when a word is painted', () => {
    it.each([
      ['two characters', '[background=yellow]|B313/B291', box(-1, -1, 20, 22, 'yellow')],
      ['the second word', 'B313//[background=yellow]|B291', box(15, -1, 10, 22, 'yellow')],
    ])('paints one box over its characters\' boxes joined, for %s', (_case, input, expected) => {
      // pins `background` as not inherited: a box per character would repeat
      // the markup and darken a translucent paint where two boxes overlap
      expect(boxes(build(input).svgCode)).toEqual([expected]);
    });
  });

  describe('when a part is painted', () => {
    it.each([
      ['in the first character', 'B313;[background=yellow]>B81', box(2.5, 3.5, 3, 3, 'yellow')],
      ['in a character moved down 2, second in its word', 'B291/[y=2]B313;[background=yellow]>B81', box(12.5, 5.5, 3, 3, 'yellow')],
    ])('paints a box over its ink plus half a unit, %s', (_case, input, expected) => {
      expect(boxes(build(input).svgCode)).toEqual([expected]);
    });
  });

  describe('when the painted element draws nothing', () => {
    it.each([
      ['an options-only token', 'B313/[background=yellow]/B291'],
      ['a character whose code is unknown', '[background=yellow]B313;NOPE'],
      ['a word of no characters', '[background=yellow]|[color=red]'],
    ])('paints nothing for %s', (_case, input) => {
      expect(boxes(build(input).svgCode)).toEqual([]);
    });

    it('paints the error placeholder like any character', () => {
      const svg = build('[error-placeholder]||[background=yellow]B313;NOPE').svgCode;

      expect(boxes(svg)).toEqual([box(-1, -1, 10, 22, 'yellow')]);
    });

    it('paints ZSA, which is content though it draws no line', () => {
      expect(boxes(build('[background=yellow]ZSA').svgCode)).toEqual([box(-1, -1, 2, 22, 'yellow')]);
    });
  });

  describe('when a link sits beside a painted character', () => {
    it('gives the link rect its full unit, a painted neighbour not being a linked one', () => {
      const svg = build('[background=yellow]B313/AK:1/[href=#b]B291').svgCode;

      expect(svg).toContain(
        '<a href="#b" style="cursor: pointer;"><rect x="8" y="-1" width="10" height="22" fill="transparent" stroke="none"/>');
    });
  });

  describe('when a definition carries a background', () => {
    const DEFINITIONS = {
      PAINTED_PAIR: { codeString: 'B313/B291', defaultOptions: { background: 'yellow' } },
      PAINTED_MARKED: { codeString: 'B313;B81', defaultOptions: { background: 'yellow' } },
    };
    beforeAll(() => BlissSVGBuilder.define(DEFINITIONS));
    afterAll(() => Object.keys(DEFINITIONS).forEach((code) => BlissSVGBuilder.removeDefinition(code)));

    it('paints each part it draws by that part\'s box', () => {
      const builder = build('PAINTED_PAIR');

      expect(boxes(builder.svgCode)).toEqual([box(-0.5, 7.5, 9, 9, 'yellow'), box(9.5, 7.5, 9, 9, 'yellow')]);
      expect(builder.toString()).toBe('[background=yellow]>B313/[background=yellow]>B291');
    });

    it('paints the character for a background written where it is used, then its parts', () => {
      const builder = build('[background=red]PAINTED_MARKED');

      expect(boxes(builder.svgCode))
        .toEqual([box(-1, -1, 10, 22, 'red'), box(-0.5, 7.5, 9, 9, 'yellow'), box(2.5, 3.5, 3, 3, 'yellow')]);
      expect(builder.toString()).toBe('[background=red][background=yellow]>B313;[background=yellow]>B81');
    });
  });
});
