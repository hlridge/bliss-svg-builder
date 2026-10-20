import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how far an element's background and its link's area reach:
 * `background-padding` and `link-padding`, one number in grid units replacing
 * whichever default applies (a word's or a character's box 1, a part's box
 * 0.5, an ink area 0.4), inherited down the levels.
 *
 * Covers:
 * - Admission: both kept as options, saved where written, never written into
 *   the picture; a negative (OUT_OF_RANGE_OPTION_VALUE), a unit and a bare key
 *   (INVALID_OPTION_VALUE) refused, the area reaching as if they were not
 *   written; 0 allowed; on a space, MISPLACED_SPACE_DECORATION.
 * - A box reaching its padding beyond the band and the base span, written on
 *   the character or inherited from its word or the symbol; a word's box at
 *   the word's padding whatever its characters write; a part's box beyond its
 *   ink box; the picture's own background staying the whole picture.
 * - Painted neighbours with unequal paddings: one stopping short of halfway
 *   keeping its padding while the other reaches to meet it; equal ones meeting
 *   halfway; a neighbour painted twice counting its larger padding; a halo
 *   neighbour reaching half its line width plus its padding beyond its span,
 *   the width its character's own, also inside a word painted by its ink.
 * - An ink area's lines widened by twice the padding, a dot from its own width.
 * - `link-padding` alike for a box link, a part link (one shape, and one built
 *   from shapes) and an ink link, unequal
 *   linked neighbours, each padding leaving the other kind at its default, and
 *   the global link staying clickable across the whole picture.
 * - Every route alike, and reloads from `toString()` and both `toJSON()` modes.
 *
 * Does NOT cover:
 * - The default geometry, see `BlissSVGBuilder.element-backgrounds.test.js`,
 *   `BlissSVGBuilder.ink-areas.test.js` and
 *   `BlissSVGBuilder.element-link-area.test.js`.
 * - A value with no text form, which the text gate refuses first, see
 *   `BlissSVGBuilder.text-option-values.test.js`.
 * - A crop: `crop=auto` trims to the ink, and a background past the picture's
 *   edge is cut there, whatever its padding.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box, exactly as emitted.
const box = (x, y, width, height, paint) =>
  `<rect class="bliss-element-background bliss-element-background--box" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"/>`;
// Every box in a picture, in document order.
const boxes = (svg) => svg.match(/<rect class="bliss-element-background[^>]*\/>/g) ?? [];
// One link's transparent rect, exactly as emitted.
const hitRect = (x, y, width, height) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="transparent" stroke="none"/>`;
const inkArea = (paint, width, lines) =>
  `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="${paint}" stroke-width="${width}">${lines}</g>`;
const linkInk = (width, lines) => `<g fill="none" stroke="transparent" stroke-width="${width}">${lines}</g>`;
const linkOpen = (href) => `<a href="${href}" style="cursor: pointer;">`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
// The action indicator's ink in `B313;B81`: x 3 to 5, y 4 to 6.
const B81_ON_B313 = '<path d="M3,6l1,-2M4,4l1,2"/>';
const DOT = '<path d="M-0.20825,12a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"/>';
// `S8;…>H`: the square S8 holding H, a part drawn as one shape, its ink box
// x 0 to 8, y 0 to 8.
const S8 = '<path d="M0,0h8M0,8h8M0,0v8M8,0v8"/>';
const H_ON_S8 = '<path d="M0,2a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';

describe('BlissSVGBuilder area padding', () => {
  describe('when a padding is written', () => {
    it.each([
      '[background-padding=0.6;background=yellow]B313',
      '[link-padding=0.6;href=#a]B313',
    ])('keeps %s as an option, silently, saved where written and never written into the picture', (input) => {
      // an unknown key would pass through as an attribute on the element's <g>
      const builder = build(input);

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
      expect(builder.svgCode).not.toContain('padding');
    });

    it.each([
      ['[background-padding=-1;background=yellow]B313', '[background=yellow]B313', 'OUT_OF_RANGE_OPTION_VALUE',
        '"background-padding" cannot be -1, because a negative padding cannot be drawn, so it was ignored: '
          + 'the padding keeps the value it would have had without it.', 'background-padding=-1'],
      ['[link-padding=-1;href=#a]B313', '[href=#a]B313', 'OUT_OF_RANGE_OPTION_VALUE',
        '"link-padding" cannot be -1, because a negative padding cannot be drawn, so it was ignored: '
          + 'the padding keeps the value it would have had without it.', 'link-padding=-1'],
      ['[background-padding=1px;background=yellow]B313', '[background=yellow]B313', 'INVALID_OPTION_VALUE',
        '"background-padding" needs a number and "1px" is not one, so it was ignored: '
          + 'the padding keeps the value it would have had without it.', 'background-padding=1px'],
      ['[background-padding;background=yellow]B313', '[background=yellow]B313', 'INVALID_OPTION_VALUE',
        '"background-padding" needs a number and was written without one, so it was ignored: '
          + 'the padding keeps the value it would have had without it.', 'background-padding'],
    ])('refuses %s, drawing it as if the padding were not written', (input, unwritten, code, message, source) => {
      const builder = build(input);

      expect(builder.warnings).toEqual([{ code, message, source }]);
      expect(builder.svgCode).toBe(build(unwritten).svgCode);
    });

    it('allows 0, a box then hugging the band and the base span', () => {
      const builder = build('[background=yellow;background-padding=0]B313');

      expect(boxes(builder.svgCode)).toEqual([box(0, 0, 8, 20, 'yellow')]);
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['B313/[background-padding=1]TSP/B291', '[background-padding=1]'],
      ['B313/[link-padding=1]TSP/B291', '[link-padding=1]'],
    ])('reports %s as a space decoration only, and saves it without the option', (input, source) => {
      const builder = build(input);

      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['MISPLACED_SPACE_DECORATION', source]]);
      expect(builder.toString()).toBe('B313//B291');
    });
  });

  describe('when a character\'s or a word\'s box has a padding', () => {
    it.each([
      ['written on the character', '[background=yellow;background-padding=0.5]B313'],
      ['inherited from its word', '[background-padding=0.5]|[background=yellow]B313/B291'],
      ['inherited from the symbol', '[background-padding=0.5]||[background=yellow]B313'],
    ])('reaches the padding beyond the band and the base span, %s', (_case, input) => {
      // pins the padding on both axes: the band's own reach fixed at 1 gives
      // y="-1" height="22"
      expect(boxes(build(input).svgCode)).toEqual([box(-0.5, -0.5, 9, 21, 'yellow')]);
    });

    it('paints a word at its own padding, not at one its character writes', () => {
      // pins the word's area drawn from the word's padding: joining its
      // characters' areas at their own paddings starts the box at x="-0.2"
      const svg = build('[background=yellow;background-padding=0.5]|[background-padding=0.2]B313/B291').svgCode;

      expect(boxes(svg)).toEqual([box(-0.5, -0.5, 19, 21, 'yellow')]);
    });

    it('keeps the picture\'s own background the whole picture', () => {
      const svg = build('[background-padding=0.5;background=white]||B313').svgCode;

      expect(svg).toContain(
        '<rect class="bliss-background-zone" x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="white"/>');
      expect(boxes(svg)).toEqual([]);
    });
  });

  describe('when a part\'s box has a padding', () => {
    it.each([
      ['written on the part', 'B313;[background=yellow;background-padding=0.25]>B81'],
      ['inherited from its character', '[background-padding=0.25]B313;[background=yellow]>B81'],
    ])('reaches the padding beyond its ink box, %s', (_case, input) => {
      // pins the part's own reach: fixed at 0.5 it gives x="2.5" width="3"
      expect(boxes(build(input).svgCode)).toEqual([box(2.75, 3.75, 2.5, 2.5, 'yellow')]);
    });
  });

  describe('when two painted neighbours have different paddings', () => {
    it.each([
      ['one stopping short of halfway, which the other reaches to meet',
        '[background=yellow]B313/AK:1/[background=green;background-padding=0.25]B291',
        [box(-1, -1, 9.75, 22, 'yellow'), box(8.75, -0.25, 8.5, 20.5, 'green')]],
      ['both reaching past halfway, which meet there',
        '[background=yellow;background-padding=0.75]B313/AK:1/[background=green;background-padding=0.75]B291',
        [box(-0.75, -0.75, 9.25, 21.5, 'yellow'), box(8.5, -0.75, 9.25, 21.5, 'green')]],
    ])('meets %s', (_case, input, expected) => {
      // pins the share, min(own, max(gap / 2, gap - other's)): halving the gap
      // whatever the other reaches stops the yellow box at 8.5 in the first
      // row, and dropping the half leaves the green box at 9
      expect(boxes(build(input).svgCode)).toEqual(expected);
    });

    it('counts the larger padding of a neighbour painted by its word and by itself', () => {
      // pins the larger: B291 reaches 1 by its word and 0.25 by itself, and
      // the smaller would let the yellow box reach 8.75
      const svg = build('[word-space=1]||[background=yellow]B313//[background=red]|[background=green;background-padding=0.25]B291').svgCode;

      expect(boxes(svg)).toEqual([
        box(-1, -1, 9.5, 22, 'yellow'), box(8.5, -1, 9.5, 22, 'red'), box(8.75, -0.25, 8.5, 20.5, 'green'),
      ]);
    });

    it.each([
      ['at the default width', '[background-area=ink;background=yellow]B313/AK:1.6/[background=green]B291',
        box(8.65, -1, 9.95, 22, 'green')],
      ['at a written width', '[stroke-width=1;background-area=ink;background=yellow]B313/AK:1.6/[background=green]B291',
        box(8.8, -1, 9.8, 22, 'green')],
      ['at a width its character writes, inside the word whose halo it is',
        '[background-area=ink;background=yellow]|[stroke-width=1]B313/AK:1.6/[background-area=box;background=green]B291',
        box(8.8, -1, 9.8, 22, 'green')],
    ])('reaches to meet a halo, which reaches half its line width plus its padding beyond its span, %s', (_case, input, expected) => {
      // B313's halo ends at 8 + 0.25 + 0.4 = 8.65 (8.9 at width 1); B291 starts
      // at 9.6. Half the gap whatever the halo reaches gives 8.8 in all three
      // rows, and the halo's padding alone, 0.4, gives 8.6. The third pins the
      // width read from the character the halo runs along: the word's own,
      // the default, gives 8.65 (survived the 2026-10-20 hand mutants without it)
      expect(boxes(build(input).svgCode)).toEqual([expected]);
    });
  });

  describe('when an ink area has a padding', () => {
    it.each([
      ['a line twice the padding wider than the line', '[background-area=ink;background=yellow;background-padding=0.6]B313',
        `${inkArea('yellow', 1.7, B313)}${B313}`],
      ['a line at the line\'s own width under a padding of 0, hidden beneath it',
        '[background-area=ink;background=yellow;background-padding=0]B313', `${inkArea('yellow', 0.5, B313)}${B313}`],
      ['a dot twice the padding wider than the dot\'s own width', '[background-area=ink;background=yellow;background-padding=0.5]B270',
        `${inkArea('yellow', 1.5, `<g stroke-width="1.4165">${DOT}</g>`)}<g stroke-width="0.4165">${DOT}</g>`],
    ])('draws the area of %s', (_case, input, expected) => {
      // pins the outline as twice the padding: once gives 1.1 for the line
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });
  });

  describe('when a link has a padding', () => {
    it.each([
      ['a character\'s box', '[link-padding=0.5;href=#a]B313', `${linkOpen('#a')}${hitRect(-0.5, -0.5, 9, 21)}${B313}</a>`],
      ['a character\'s box, inherited from the symbol', '[link-padding=0.5]||[href=#a]B313',
        `${linkOpen('#a')}${hitRect(-0.5, -0.5, 9, 21)}${B313}</a>`],
      // a part drawn as one shape and one built from shapes draw their links
      // on separate paths; the shape row pins the first, which survived the
      // 2026-10-20 hand mutants without it
      ['a part\'s box, built from shapes', 'B313;[link-padding=0.25;href=#p]>B81',
        `${B313}${linkOpen('#p')}${hitRect(2.75, 3.75, 2.5, 2.5)}${B81_ON_B313}</a>`],
      ['a part\'s box, drawn as one shape', 'S8;[link-padding=0.25;href=#p]>H',
        `${S8}${linkOpen('#p')}${hitRect(-0.25, -0.25, 8.5, 8.5)}${H_ON_S8}</a>`],
      ['an ink link', '[link-area=ink;link-padding=0.6;href=#a]B313', `${linkOpen('#a')}${linkInk(1.7, B313)}${B313}</a>`],
    ])('reaches the padding for %s', (_case, input, expected) => {
      expect(contentOf(build(input).svgCode)).toBe(expected);
    });

    it('meets an unequal linked neighbour as two paints meet', () => {
      const svg = build('[href=#a]B313/AK:1/[href=#b;link-padding=0.25]B291').svgCode;

      expect(svg).toContain(`${linkOpen('#a')}${hitRect(-1, -1, 9.75, 22)}`);
      expect(svg).toContain(`${linkOpen('#b')}${hitRect(8.75, -0.25, 8.5, 20.5)}`);
    });

    it.each([
      ['a background\'s padding leaves a link\'s rect', '[background-padding=0.5;href=#a]B313',
        `${linkOpen('#a')}${hitRect(-1, -1, 10, 22)}`],
      ['a link\'s padding leaves a background\'s box', '[link-padding=0.5;background=yellow]B313',
        box(-1, -1, 10, 22, 'yellow')],
    ])('keeps the two apart: %s at its default', (_case, input, expected) => {
      // pins each kind reading its own option
      expect(build(input).svgCode).toContain(expected);
    });

    it('keeps the global link clickable across the whole picture', () => {
      const svg = build('[link-padding=0.5;href=#g]||B313').svgCode;

      expect(svg).toContain('<rect x="-0.75" y="-0.75" width="100%" height="100%" fill="transparent" stroke="none"/>');
    });
  });

  describe('when the same options arrive by different routes', () => {
    it('draws a padded word identically from the DSL, a composition object, setOptions and the transient options', () => {
      const dsl = build('[background-padding=0.5;background=yellow]|B313/B291');
      const composition = build({
        groups: [{ options: { backgroundPadding: 0.5, background: 'yellow' }, glyphs: [
          { parts: [{ codeName: 'B313' }] },
          { parts: [{ codeName: 'B291' }] },
        ] }],
      });
      const handle = build('B313/B291');
      handle.group(0).setOptions({ backgroundPadding: 0.5, background: 'yellow' });
      const transient = build('[background=yellow]|B313/B291');
      transient.group(0).setTransientOptions({ backgroundPadding: 0.5 });

      expect(boxes(dsl.svgCode)).toEqual([box(-0.5, -0.5, 19, 21, 'yellow')]);
      for (const builder of [composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
        expect(builder.warnings).toEqual([]);
      }
      expect(composition.toString()).toBe(dsl.toString());
      expect(handle.toString()).toBe(dsl.toString());
      expect(transient.toString()).toBe('[background=yellow]|B313/B291');
    });

    it.each([
      ['[background-padding=0.5;background=yellow]B313', 'width="9"'],
      ['[link-padding=0.5;href=#a]B313', 'width="9"'],
    ])('reloads %s from toString() and both toJSON() modes to the same picture', (input, marker) => {
      const builder = build(input);

      expect(builder.svgCode).toContain(marker);
      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });
});
