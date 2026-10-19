import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins where element backgrounds sit in the picture: one layer of every word,
 * character and part background, written first inside the content group,
 * beneath every line and every link, over the grid and the picture's own
 * background.
 *
 * Covers:
 * - Order: a word's box, then its characters', then their parts', all before
 *   the first line.
 * - Depth: after the grid, and after the picture's own background, which stays
 *   in its own group outside the content group.
 * - Styling reach: styling written after `||` lands on the content group and
 *   so reaches the boxes along with the lines; an element's own `opacity`
 *   reaches its lines and not its box.
 * - Links: a box beneath its element's link and the link's rect; the global
 *   link around the content group, boxes included.
 * - `svgContent` carrying the boxes, still the content group's inner markup.
 * - The layer attributes: `element-background--` and
 *   `element-background--box--` reaching every box, silently; a written
 *   `fill` displacing `background` reported as MULTIPLE_ATTRIBUTE_VALUES, and
 *   nothing reported where no word, character or part is painted, the
 *   picture's own background included.
 *
 * Does NOT cover:
 * - The box each element paints, see
 *   `BlissSVGBuilder.element-backgrounds.test.js`.
 * - The ink areas and their layer attributes, see
 *   `BlissSVGBuilder.ink-areas.test.js`.
 * - An element's own `transform`, `filter` or `clip-path`: like `opacity`,
 *   each reaches the element's lines and leaves its box in the shared layer;
 *   pinned for `opacity` only.
 * - The target vocabulary as a whole, see
 *   `BlissSVGBuilder.layer-target-bijection.test.js`.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box, exactly as emitted.
const box = (x, y, width, height, paint) =>
  `<rect class="bliss-element-background bliss-element-background--box" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"/>`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const YELLOW_B313 = box(-1, -1, 10, 22, 'yellow');

describe('BlissSVGBuilder element background layer', () => {
  describe('when a word, a character and a part are all painted', () => {
    it('writes the word\'s box, then the character\'s, then the part\'s, all before the first line', () => {
      // a box drawn inside its own element would hide the ink of every earlier
      // neighbour or part it reaches under, so every box comes before any ink
      const svg = build('[background=red]|[background=yellow]B313;[background=blue]>B81/B291').svgCode;

      expect(contentOf(svg)).toBe(
        `${box(-1, -1, 20, 22, 'red')}${box(-1, -1, 10, 22, 'yellow')}${box(2.5, 3.5, 3, 3, 'blue')}`
        + '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M3,6l1,-2M4,4l1,2M10,8h8M10,16h8M10,8v8M18,8v8"/>');
    });
  });

  describe('when the picture has a grid or a background of its own', () => {
    it('draws the boxes over the grid, first inside the content group', () => {
      const svg = build('[grid]||[background=yellow]B313').svgCode;

      expect(svg).toMatch(/<g class="bliss-grid"[^]*<\/g>\n {2}<g class="bliss-content"/);
      expect(contentOf(svg)).toBe(`${YELLOW_B313}${B313}`);
    });

    it('keeps the picture\'s own background in its own group, beneath the content group', () => {
      const svg = build('[background=white]||[background=yellow]B313').svgCode;

      expect(svg).toContain(
        '<g class="bliss-background">\n    <rect class="bliss-background-zone" x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="white"/>\n  </g>\n  <g class="bliss-content"');
      expect(contentOf(svg)).toBe(`${YELLOW_B313}${B313}`);
    });
  });

  describe('when styling is written', () => {
    it.each([
      ['an opacity', '[opacity=0.5]||[background=yellow]B313', 'opacity="0.5"'],
      ['a transform', '[transform=rotate(10)]||[background=yellow]|B313', 'transform="rotate(10)"'],
    ])('carries %s written after || on the content group, around the boxes and the lines', (_case, input, attribute) => {
      // the boxes move and fade with the symbol: a word rotated out of its own
      // background is the alternative this layer's place rules out
      const svg = build(input).svgCode;

      expect(svg).toContain(`<g class="bliss-content" fill="none" stroke="#000000" stroke-linejoin="round" `
        + `stroke-linecap="round" stroke-width="0.5" ${attribute}>\n    ${YELLOW_B313}${B313}\n`);
    });

    it('fades an element\'s own lines and not its box', () => {
      const svg = build('[opacity=0.5;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${YELLOW_B313}<g opacity="0.5">${B313}</g>`);
    });
  });

  describe('when a link is drawn too', () => {
    it('puts the box beneath the element\'s link and its rect', () => {
      const svg = build('[href=#x;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${YELLOW_B313}<a href="#x" style="cursor: pointer;">`
        + `<rect x="-1" y="-1" width="10" height="22" fill="transparent" stroke="none"/>${B313}</a>`);
    });

    it('keeps the boxes inside the content group the global link holds', () => {
      const svg = build('[href=#g]||[background=yellow]B313').svgCode;

      expect(svg).toContain('<a href="#g" style="cursor: pointer;">\n    '
        + '<rect x="-0.75" y="-0.75" width="100%" height="100%" fill="transparent" stroke="none"/>\n    <g class="bliss-content"');
      expect(contentOf(svg)).toBe(`${YELLOW_B313}${B313}`);
    });
  });

  describe('when reading svgContent', () => {
    it('includes the boxes, as the content group\'s inner markup', () => {
      const builder = build('[background=yellow]B313');

      expect(builder.svgContent).toBe(`${YELLOW_B313}${B313}`);
      expect(builder.svgContent).toBe(contentOf(builder.svgCode));
    });
  });

  describe('when a layer attribute names the backgrounds', () => {
    it.each(['element-background--rx=1', 'element-background--box--rx=1'])('adds %s to every box, silently', (key) => {
      const builder = build(`[${key}]||[background=yellow]B313`);
      const rounded = '<rect class="bliss-element-background bliss-element-background--box" x="-1" y="-1" width="10" height="22" fill="yellow" stroke="none" rx="1"/>';

      expect(contentOf(builder.svgCode)).toBe(`${rounded}${B313}`);
      expect(builder.svgContent).toBe(`${rounded}${B313}`);
      expect(builder.warnings).toEqual([]);
    });

    it('reports a written fill displacing the background it paints', () => {
      const builder = build('[element-background--fill=red]||[background=yellow]B313');

      expect(contentOf(builder.svgCode)).toBe(`${box(-1, -1, 10, 22, 'red')}${B313}`);
      expect(builder.warnings).toEqual([{
        code: 'MULTIPLE_ATTRIBUTE_VALUES',
        message: '"element-background--fill" and "background" both set "fill" on element-background--box, '
          + 'so "element-background--fill" was used: a key that names its target beats one that has to be resolved to it. '
          + 'Remove whichever you did not mean.',
        source: 'background',
      }]);
    });

    it('reports nothing when nothing is painted', () => {
      expect(build('[element-background--fill=red]||B313').warnings).toEqual([]);
    });

    it('reports nothing when only the picture\'s own background is written', () => {
      // pins the global pass leaving the element backgrounds alone: judged
      // there, the paper's `background` would be named as displaced on a box
      // the picture does not hold (a hand mutant doing that survived every
      // other row, 2026-10-19)
      expect(build('[background=white;element-background--fill=red]||B313').warnings).toEqual([]);
    });
  });
});
