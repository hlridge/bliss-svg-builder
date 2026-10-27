/**
 * Pins that a trailing space counts in full: the picture's box ends where a
 * word after the final space would start (the end of the space's advance),
 * while a final character still ends the box at its ink.
 *
 * Covers:
 * - A trailing `//`, TSP or QSP, a run of trailing spaces, and a composition
 *   of nothing but spaces (`B313//` 16, `B313/QSP` 12, `//` 6, `QSP` 2).
 * - `word-space` and `char-space` moving that end as they move the space's
 *   advance, including a word space narrower than the character space, where
 *   the advance is negative; a box of nothing but spaces is never below 0.
 * - Leading and inner spaces and a lone edge `/` unchanged.
 * - Sentence parity: a sentence ending in a space, followed by another, is
 *   as wide as the two joined.
 * - A numeric crop cutting from the full box; `crop=auto` still trimming to
 *   the ink.
 * - `center` with `min-width` centring the whole box: the root's `width`
 *   and `baseWidth` agree, and a space group's own width stays 0.
 * - A final group that starts with a space but keeps another part (an error
 *   placeholder) keeping its ink.
 * - Content-empty groups before or after the final space.
 * - An alias whose code string ends in `//`, the `toString()` and `toJSON()`
 *   round trips, `merge()` and `splitAt()`.
 *
 * Does NOT cover:
 * - How far a space advances between words, see
 *   `BlissSVGBuilder.space-glyphs.test.js`.
 * - The automatic crops past spaces on every side, see
 *   `BlissSVGBuilder.space-crop.test.js`.
 * - Content-empty groups in the extent without a trailing space, see
 *   `BlissSVGBuilder.empty-content-extent.test.js`.
 * - A decoration written on a space, see
 *   `BlissSVGBuilder.space-decoration.test.js`; kerning on one, see
 *   `BlissSVGBuilder.space-kerning.test.js`.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const viewBoxOf = (builder) =>
  builder.svgCode.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);

// Every input sets margin=0, so the viewBox width is the box itself.
const boxWidth = (input) => viewBoxOf(new BlissSVGBuilder(input))[2];

// Fresh raw-group nodes per call so no composition shares node references.
const word = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });
const empty = () => ({ glyphs: [] });

describe('BlissSVGBuilder trailing space', () => {
  describe('when a composition ends in a space', () => {
    it.each([
      ['[margin=0]||B313//', 16],
      ['[margin=0]||B313/TSP', 16],
      ['[margin=0]||B313/QSP', 12],
      ['[margin=0]||B313///', 22],
      ['[margin=0]||B313/TSP/QSP', 18],
      ['[margin=0]||B313//B313//', 32],
      ['[margin=0]||B313//[color=red]', 16],
      ['[margin=0]||[x=3]|B313//', 16],
    ])('ends the box of %s at the end of the last space, %d wide', (input, width) => {
      const builder = new BlissSVGBuilder(input);
      expect(viewBoxOf(builder)[2]).toBe(width);
      expect(builder.elements.baseWidth).toBe(width);
    });
  });

  describe('when the composition holds nothing but spaces', () => {
    it.each([
      ['[margin=0]||//', 6],
      ['[margin=0]||TSP', 6],
      ['[margin=0]||QSP', 2],
      ['[margin=0]||////', 18],
    ])('draws %s as wide as its spaces advance, %d', (input, width) => {
      expect(boxWidth(input)).toBe(width);
    });
  });

  describe('when no space ends the composition', () => {
    it.each([
      ['[margin=0]||B313', 8],
      ['[margin=0]||B313/', 8],
      ['[margin=0]||/B313', 8],
      ['[margin=0]||//B313', 14],
      ['[margin=0]||QSP/B313', 10],
      ['[margin=0]||///B313', 20],
      ['[margin=0]||B313//B313', 24],
    ])('ends the box of %s at the last ink, %d wide', (input, width) => {
      const builder = new BlissSVGBuilder(input);
      expect(viewBoxOf(builder)[2]).toBe(width);
      expect(builder.elements.baseWidth).toBe(width);
    });
  });

  describe('when the spacing options are overridden', () => {
    it.each([
      ['[word-space=10;margin=0]||B313//', 18],
      ['[char-space=3;margin=0]||B313//', 16],
    ])('moves the end of the box of %s with the space, %d wide', (input, width) => {
      expect(boxWidth(input)).toBe(width);
    });
  });

  describe('when the word space is narrower than the character space', () => {
    it('ends the box where the next word would start, not where the space starts', () => {
      // note: word-space=0 with the default char-space of 2 gives the space an
      // advance of -2, so the next word starts at 8, before the space's own x (10).
      // pins the end of the advance replacing the space's frame: counting both gives 10.
      expect(boxWidth('[word-space=0;margin=0]||B313//')).toBe(8);
      expect(boxWidth('[word-space=0;margin=0]||B313//') + boxWidth('[word-space=0;margin=0]||B313'))
        .toBe(boxWidth('[word-space=0;margin=0]||B313//B313'));
    });

    it('never draws a composition of nothing but spaces narrower than nothing', () => {
      // pins the floor at 0: the lone space's advance (-2) would make the box negative.
      const builder = new BlissSVGBuilder('[word-space=0;margin=0]||//');
      expect(builder.elements.width).toBe(0);
      expect(builder.elements.baseWidth).toBe(0);
      expect(viewBoxOf(builder)[2]).toBe(0);
      expect(viewBoxOf(new BlissSVGBuilder('[word-space=0;center;min-width=10;margin=0]||//'))[0]).toBe(-5);
    });
  });

  describe('when two sentences are joined', () => {
    it.each([
      ['[margin=0]||B313//', '[margin=0]||B313', '[margin=0]||B313//B313'],
      ['[margin=0]||//', '[margin=0]||B313', '[margin=0]||//B313'],
      ['[margin=0]||B313//', '[margin=0]||//', '[margin=0]||B313///'],
    ])('makes %s followed by %s as wide as %s', (left, right, joined) => {
      expect(boxWidth(left) + boxWidth(right)).toBe(boxWidth(joined));
    });
  });

  describe('when the box is cropped', () => {
    it('cuts a numeric crop from the full box', () => {
      expect(boxWidth('[crop-right=2;margin=0]||B313//')).toBe(14);
    });

    it('still trims crop=auto to the ink', () => {
      expect(boxWidth('[crop=auto;margin=0]||B313//')).toBe(8);
      expect(boxWidth('[crop=auto;margin=0]||//')).toBe(0);
    });
  });

  describe('when the box is centred in a minimum width', () => {
    it('centres the whole box, the trailing space included', () => {
      // pins baseWidth taking the trailing space: without it the centring reads
      // a 6-unit overhang on the right and places the box at -4.
      expect(viewBoxOf(new BlissSVGBuilder('[min-width=30;center;margin=0]||B313//'))[0]).toBe(-7);
    });

    it('centres a leading space as before', () => {
      expect(viewBoxOf(new BlissSVGBuilder('[min-width=30;center;margin=0]||//B313'))[0]).toBe(-8);
    });
  });

  describe('when reading the snapshot', () => {
    it('gives the root the same width and base width', () => {
      const { elements } = new BlissSVGBuilder('[margin=0]||B313//');
      expect(elements.width).toBe(16);
      expect(elements.baseWidth).toBe(16);
    });

    it('keeps the space group zero wide, with the advance in advanceX', () => {
      const space = new BlissSVGBuilder('[margin=0]||B313//').elements.children[1];
      expect(space.width).toBe(0);
      expect(space.advanceX).toBe(6);
    });
  });

  describe('when the final group starts with a space but keeps another part', () => {
    it('ends the box at that part\'s ink, not at the space\'s advance', () => {
      // pins the holds-only-spaces test: `TSP;ZZ9` reads as a space group by its
      // first part, yet its placeholder (8 wide) reaches past the space's 6.
      const builder = new BlissSVGBuilder('[margin=0;error-placeholder]||B291//TSP;ZZ9');
      expect(viewBoxOf(builder)[2]).toBe(24);
      expect(builder.elements.baseWidth).toBe(24);
      expect(boxWidth('[margin=0;error-placeholder]||TSP;ZZ9')).toBe(8);
    });
  });

  describe('when content-empty groups sit beside the final space', () => {
    it('counts the space when an empty group comes before it', () => {
      const builder = new BlissSVGBuilder({ options: { margin: 0 }, groups: [word('B313'), empty(), word('TSP')] });
      expect(viewBoxOf(builder)[2]).toBe(16);
    });

    it('counts the space when an empty group comes after it', () => {
      // pins the last LAYOUT group: the empty group after the space is not it.
      const builder = new BlissSVGBuilder({ options: { margin: 0 }, groups: [word('B313'), word('TSP'), empty()] });
      expect(viewBoxOf(builder)[2]).toBe(16);
      expect(builder.elements.baseWidth).toBe(16);
    });
  });

  describe('when an alias ends in a word break', () => {
    const FIXTURES = { TRAILING_BREAK_ALIAS: { codeString: 'B291//' } };
    beforeAll(() => BlissSVGBuilder.define(FIXTURES));
    afterAll(() => Object.keys(FIXTURES).forEach((code) => BlissSVGBuilder.removeDefinition(code)));

    it('draws and saves as the written form', () => {
      const alias = new BlissSVGBuilder('[margin=0]||TRAILING_BREAK_ALIAS');
      expect(viewBoxOf(alias)[2]).toBe(16);
      expect(viewBoxOf(alias)[2]).toBe(boxWidth('[margin=0]||B291//'));
      expect(alias.toString()).toBe('[margin=0]||B291//');
    });
  });

  describe('when the composition is saved and read back', () => {
    it('keeps the width through toString()', () => {
      const builder = new BlissSVGBuilder('[margin=0]||B313//');
      expect(builder.toString()).toBe('[margin=0]||B313//');
      expect(viewBoxOf(new BlissSVGBuilder(builder.toString()))[2]).toBe(16);
    });

    it('keeps the width through toJSON()', () => {
      const builder = new BlissSVGBuilder('[margin=0]||B313//');
      expect(viewBoxOf(new BlissSVGBuilder(builder.toJSON()))[2]).toBe(16);
    });
  });

  describe('when merge() joins two builders', () => {
    it('counts the space the merged builder ends in', () => {
      const merged = new BlissSVGBuilder('[margin=0]||B313').merge(new BlissSVGBuilder('B313//'));
      expect(merged.toString()).toBe('[margin=0]||B313//B313//');
      expect(viewBoxOf(merged)[2]).toBe(32);
    });

    it('keeps the left half\'s trailing space inside the sentence', () => {
      const merged = new BlissSVGBuilder('[margin=0]||B313//').merge(new BlissSVGBuilder('B313'));
      expect(merged.toString()).toBe('[margin=0]||B313///B313');
      expect(viewBoxOf(merged)[2]).toBe(30);
    });
  });

  describe('when splitAt() divides a sentence', () => {
    it('leaves no trailing space on the left half', () => {
      const left = new BlissSVGBuilder('[margin=0]||B313//B291');
      const right = left.splitAt(1);
      expect(left.toString()).toBe('[margin=0]||B313');
      expect(viewBoxOf(left)[2]).toBe(8);
      expect(viewBoxOf(right)[2]).toBe(8);
    });
  });
});
