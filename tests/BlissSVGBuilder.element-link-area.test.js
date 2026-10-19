import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the clickable area of an element link: every linked word, character and
 * part holds a transparent rect as its first child, covering the element's
 * area, so the link answers a click anywhere in that area and not only on the
 * strokes.
 *
 * Covers:
 * - A character's area: its base span (stroke centres) plus 1 unit on each
 *   side, and y -1 to 21 in its own frame however short its ink. Toward a
 *   linked neighbour (the next character in reading order, linked itself or
 *   by its word) closer than 2 units, half the gap, across a word space too;
 *   toward any other, the full unit at any gap, a neighbour that only holds a
 *   linked part, sits under the global link or has its href refused included.
 *   A character that draws nothing is nobody's neighbour, and one overlapped
 *   from both sides by linked neighbours keeps an area of no width, never a
 *   negative one.
 * - A word's area: its characters' areas joined; a word of no characters
 *   holds no rect.
 * - A part's area: its ink box plus 0.5 all round, wherever its character
 *   sits, for a shape and for a code built from shapes.
 * - An indicator never widening its character's area.
 * - The rect's numbers rounded to 4 decimals, as the picture's are.
 * - The rect's place: first inside the element's own `<g>` when it has one,
 *   else first inside the `<a>`; never stamped by `vector-effect`.
 * - Precedence by document order: a part's link after its character's rect, a
 *   later part's link after an earlier one's, a nested link inside its word's.
 * - A link that holds another link: its content in a bare `<g>`, so no `<a>`
 *   is ever the direct child of an `<a>`; none added where the outer link has
 *   its own group, or where it holds no link.
 * - No `pointer-events="bounding-box"` anywhere.
 *
 * Does NOT cover:
 * - The global link's rect over the whole picture, see
 *   `BlissSVGBuilder.global-link-attributes.test.js`.
 * - Anchor mechanics (attribute separation, the protocol allowlist, href at
 *   each level), see `BlissSVGBuilder.clickable-links.test.js`.
 * - A link set in an alias's `defaultOptions`: like any alias option it lands
 *   on each part the alias draws, so a two-mark alias gives two part links (a
 *   part bracket on the same alias gives one over both); the alias rule is
 *   pinned in `BlissSVGBuilder.alias-options-on-parts.test.js`.
 * - Linking by ink instead of area (`link-area=ink`), not built yet (backlog,
 *   "Link an element by its ink instead of its area").
 * - How a browser hit-tests the rect, which no test in this suite can observe.
 */

// One element's hit rect, exactly as emitted.
const hitRect = (x, y, width, height) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="transparent" stroke="none"/>`;
const hitRects = (svg) => svg.match(/<rect [^>]*fill="transparent" stroke="none"\/>/g) ?? [];
const linkOpen = (href) => `<a href="${href}" style="cursor: pointer;">`;

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
// The action indicator's ink in `B313;B81`: x 3 to 5, y 4 to 6.
const B81_ON_B313 = '<path d="M3,6l1,-2M4,4l1,2"/>';

describe('BlissSVGBuilder element link area', () => {
  describe('when a character is linked', () => {
    it('holds a rect over its base span plus 1 unit, the full band high', () => {
      // B313's ink is y 8 to 16; the area is the band, y -1 to 21, regardless
      const svg = new BlissSVGBuilder('[href=#x]B313').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(-1, -1, 10, 22)}${B313}</a>`);
    });

    it.each([
      ['2 units away', 'B313/[href=#x]B291', hitRect(9, -1, 10, 22)],
      ['4 units away', '[char-space=4]||B313/[href=#x]B291', hitRect(11, -1, 10, 22)],
      ['1 unit away on its left', 'B313/AK:1/[href=#x]B291', hitRect(8, -1, 10, 22)],
      ['1 unit away on its right', '[href=#x]B313/AK:1/B291', hitRect(-1, -1, 10, 22)],
      ['in the previous word, 1 unit away', '[word-space=1]||B313//[href=#x]B291', hitRect(8, -1, 10, 22)],
      ['in the next word, 1 unit away', '[word-space=1]||[href=#x]B313//B291', hitRect(-1, -1, 10, 22)],
      ['0.7 units away', '[char-space=0.7]||B313/B291/[href=#x]B291', hitRect(16.4, -1, 10, 22)],
      ['overlapping it on both sides', 'B313/AK:-6/[href=#x]B1/AK:-4/B291', hitRect(1, -1, 2, 22)],
    ])('takes the full unit toward an unlinked neighbour %s', (_case, input, rect) => {
      // pins the full margin beside an unlinked neighbour: no other link
      // collides there, so nothing cuts the area short (half the gap whatever
      // the neighbour, the rule this replaced, gives 8.5 and 9.5 on the 1-unit
      // rows)
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${rect}`);
      expect(hitRects(svg)).toEqual([rect]);
    });

    it.each([
      ['each linked itself, in one word', '[href=#a]B313/AK:1/[href=#b]B291'],
      ['each linked itself, across a word space', '[word-space=1]||[href=#a]B313//[href=#b]B291'],
      ['the earlier linked by its word', '[word-space=1]||[href=#w]|B313//[href=#c]B291'],
      ['the later linked by its word', '[word-space=1]||[href=#c]B313//[href=#w]|B291'],
    ])('meets a linked neighbour halfway when they are 1 unit apart, %s', (_case, input) => {
      // pins the half gap between two links, sought across a word space too (a
      // full margin always, or neighbours sought only within the word, give 9
      // and 8), and a character of a linked word counting as linked (counting
      // only a character's own link, or only a word's, gives 8 or 9)
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(hitRects(svg)).toEqual([hitRect(-1, -1, 9.5, 22), hitRect(8.5, -1, 9.5, 22)]);
    });

    it('leaves the strip between two linked neighbours bare when they are 4 units apart', () => {
      const svg = new BlissSVGBuilder('[char-space=4]||[href=#a]B313/[href=#b]B291').svgCode;

      expect(hitRects(svg)).toEqual([hitRect(-1, -1, 10, 22), hitRect(11, -1, 10, 22)]);
    });

    it.each([
      ['only a part of it is linked', 'B313;[href=#p]>B81/AK:1/[href=#x]B291'],
      ['only the global link covers it', '[href=#g]||B313/AK:1/[href=#x]B291'],
      ['its href is refused', '[href=javascript:alert(1)]B313/AK:1/[href=#x]B291'],
    ])('treats a neighbour as unlinked when %s', (_case, input) => {
      // pins what counts as linked: a character's own link or its word's, and
      // only one that is drawn (counting these would give x="8.5")
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(8, -1, 10, 22)}`);
    });

    it.each([
      ['an options-only token', 'B313/[color=red]/[href=#x]B291', [hitRect(9, -1, 10, 22)]],
      ['an unknown code', 'B313/QQQ/[href=#x]B291', [hitRect(9, -1, 10, 22)]],
      ['an options-only token in a linked word', '[href=#w]|B313/[color=red]/[href=#x]B291',
        [hitRect(-1, -1, 20, 22), hitRect(9, -1, 10, 22)]],
      ['an unknown code in a linked word', '[href=#w]|B313/QQQ/[href=#x]B291',
        [hitRect(-1, -1, 20, 22), hitRect(9, -1, 10, 22)]],
    ])('measures the gap past a character that draws nothing, here %s', (_case, input, rects) => {
      // the token between sits at x=10, where B291 starts: counted as a
      // neighbour, and linked by its word, it would leave B291 no margin on its
      // left (x="10")
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(hitRects(svg)).toEqual(rects);
    });

    it('leaves a character overlapped from both sides by linked neighbours an area of no width', () => {
      // B313 ends at 8 and B291 starts at -2 around B1 at 2, so halfway on each
      // side crosses over (5 on the left, 0 on the right); pins the width
      // stopping at 0 rather than going negative
      const svg = new BlissSVGBuilder('[href=#a]B313/AK:-6/[href=#x]B1/AK:-4/[href=#b]B291').svgCode;

      expect(hitRects(svg)).toEqual([hitRect(-1, -1, 6, 22), hitRect(5, -1, 0, 22), hitRect(0, -1, 7, 22)]);
    });

    it('rounds the rect to 4 decimals, as the picture rounds its own numbers', () => {
      // pins the rounding: the linked B291 sits at 8.7 + 8 + 0.7, and unrounded
      // its rect reads x="17.049999999999997" width="9.350000000000001"
      const svg = new BlissSVGBuilder('[char-space=0.7]||B313/[href=#a]B291/[href=#x]B291').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(17.05, -1, 9.35, 22)}`);
    });

    it('keeps the base span when an indicator overhangs it', () => {
      // B1's base is 0 wide at x=1 and the indicator's ink runs 0 to 2: the base
      // span plus 1 is 0 to 2, where the ink plus 1 would be -1 to 3
      const svg = new BlissSVGBuilder('[href=#x]B1;B81').svgCode;

      expect(hitRects(svg)).toEqual([hitRect(0, -1, 2, 22)]);
    });

    it('moves the band with a character moved vertically', () => {
      const svg = new BlissSVGBuilder('[y=2;href=#x]B313').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(-1, 1, 10, 22)}<path d="M0,12`);
    });
  });

  describe('when a word is linked', () => {
    it.each([
      ['two characters', '[href=#x]|B313/B291', hitRect(-1, -1, 20, 22)],
      ['the second word', 'B313//[href=#x]|B291', hitRect(15, -1, 10, 22)],
    ])('holds a rect over its characters\' areas joined, for %s', (_case, input, rect) => {
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${rect}<path d="`);
      expect(hitRects(svg)).toEqual([rect]);
    });

    it('puts the word\'s rect first and the character\'s inside its own link', () => {
      const svg = new BlissSVGBuilder('[href=#w]|[href=#c]B313').svgCode;

      expect(svg).toContain(
        `${linkOpen('#w')}${hitRect(-1, -1, 10, 22)}<g>${linkOpen('#c')}${hitRect(-1, -1, 10, 22)}${B313}</a></g></a>`);
    });

    it('holds no rect when the word has no characters', () => {
      const svg = new BlissSVGBuilder('[href=#x]|[color=red]').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}</a>`);
      expect(hitRects(svg)).toEqual([]);
    });
  });

  describe('when a part is linked', () => {
    it('holds a rect over its ink box plus half a unit', () => {
      const svg = new BlissSVGBuilder('B313;[href=#x]>B81').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(2.5, 3.5, 3, 3)}${B81_ON_B313}</a>`);
    });

    it.each([
      ['a shape', 'B291/[y=2]S8;[href=#x]>H', hitRect(9.5, 1.5, 9, 9),
        '<path d="M10,4a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>'],
      ['a code built from shapes', 'B291/[y=2]B313;[href=#x]>B81', hitRect(12.5, 5.5, 3, 3),
        '<path d="M13,8l1,-2M14,6l1,2"/>'],
    ])('places the rect where its character sits, for %s', (_case, input, rect, path) => {
      // the character is the second, moved down 2: its part's ink box moves with
      // it (a shape and a built code draw their links on separate paths)
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${rect}${path}</a>`);
    });

    it('comes after its linked character\'s rect, so the part wins where they overlap', () => {
      const svg = new BlissSVGBuilder('[href=#c]B313;[href=#p]>B81').svgCode;

      expect(svg).toContain(
        `${linkOpen('#c')}${hitRect(-1, -1, 10, 22)}<g>${B313}${linkOpen('#p')}${hitRect(2.5, 3.5, 3, 3)}${B81_ON_B313}</a></g></a>`);
    });

    it('lets the later of two overlapping linked parts come last', () => {
      // a square and a heart over the same 8 by 8 box: the heart is written
      // second, so its link paints over the square's and wins
      const svg = new BlissSVGBuilder('[href=#s]>S8;[href=#h]>H').svgCode;

      expect(svg).toContain(
        `${linkOpen('#s')}${hitRect(-0.5, -0.5, 9, 9)}<path d="M0,0h8M0,8h8M0,0v8M8,0v8"/></a>`
        + `${linkOpen('#h')}${hitRect(-0.5, -0.5, 9, 9)}<path d="M0,2a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/></a>`);
    });
  });

  describe('when the linked element also carries a group', () => {
    it.each([
      ['a colour', '[href=#x;color=red]B313', '<g stroke="red">'],
      ['its own pointer-events', '[href=#x;pointer-events=none]B313', '<g pointer-events="none">'],
    ])('puts the rect first inside the group for %s', (_case, input, group) => {
      // inside the group, so an author's transform or pointer-events there
      // governs the rect too
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${group}${hitRect(-1, -1, 10, 22)}${B313}</g></a>`);
    });

    it('stamps vector-effect on the path and not on the rect', () => {
      const svg = new BlissSVGBuilder('[href=#x;vector-effect=non-scaling-stroke]B313').svgCode;

      expect(svg).toContain(`${linkOpen('#x')}${hitRect(-1, -1, 10, 22)}<path vector-effect="non-scaling-stroke" d="M0,10`);
    });
  });

  describe('when a link holds another link', () => {
    // note: Chromium and WebKit draw nothing of an <a> whose parent is an <a>
    // (SVG 1.1 lets an a element hold anything but itself): written directly
    // inside its word's link, a linked character vanished in Chrome and Safari
    // while Firefox, resvg and librsvg drew it (measured 2026-10-19)
    it.each([
      ['a linked character in a linked word', '[href=#w]|B313/[href=#c]B291',
        `${linkOpen('#w')}${hitRect(-1, -1, 20, 22)}<g><path d="M0,10`],
      ['a linked part in an unlinked character of a linked word', '[href=#w]|B313;[href=#p]>B81',
        `${linkOpen('#w')}${hitRect(-1, -1, 10, 22)}<g>${B313}${linkOpen('#p')}`],
      ['three links, word, character and part', '[href=#w]|[href=#c]B313;[href=#p]>B81',
        `${linkOpen('#w')}${hitRect(-1, -1, 10, 22)}<g>${linkOpen('#c')}${hitRect(-1, -1, 10, 22)}<g>${B313}${linkOpen('#p')}`],
      ['a global link around them', '[href=#g]||[href=#w]|[href=#c]B313',
        `${linkOpen('#w')}${hitRect(-1, -1, 10, 22)}<g>${linkOpen('#c')}`],
    ])('puts the outer link\'s content in a bare group, for %s', (_case, input, expected) => {
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(svg).toContain(expected);
      expect(svg).not.toMatch(/<a [^>]*>(<rect [^>]*\/>)?(<path [^>]*\/>)*<a /);
    });

    it('adds no group when the outer link already has one of its own', () => {
      // pins the bare group to the branch without one: the coloured word's
      // own <g> already keeps the character's link off the word's <a>
      const svg = new BlissSVGBuilder('[href=#w;color=red]|[href=#c]B313').svgCode;

      expect(svg).toContain(`${linkOpen('#w')}<g stroke="red">${hitRect(-1, -1, 10, 22)}${linkOpen('#c')}`);
    });
  });

  describe('when any link is drawn', () => {
    it.each([
      '[href=#x]B313',
      '[href=#x]|B313/B291',
      'B313;[href=#x]>B81',
      '[href=#x;color=red]B313',
      '[href=#x]||B313',
    ])('writes no pointer-events="bounding-box" for %s', (input) => {
      expect(new BlissSVGBuilder(input).svgCode).not.toContain('bounding-box');
    });
  });
});
