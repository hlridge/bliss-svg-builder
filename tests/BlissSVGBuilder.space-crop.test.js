/**
 * Pins that a space never holds an automatic crop open: the automatic crop
 * modes reach past a word space (TSP or QSP) to the ink on every side, as
 * they do where no space is written, while a ZSA, which is placed to hold a
 * crop open, still holds it.
 *
 * Covers:
 * - `crop=compact` takes its 4 units off the top of a sentence whose top has
 *   room, as it does for a single word.
 * - `crop=auto`, `crop=auto-vertical` and the per-side `crop-{side}=auto`
 *   crop to the ink past a space between words, a leading space and a
 *   trailing space, with either space code.
 * - The composition's snapshot bounds (`elements.bounds`) end at the ink.
 * - A space from object input or from an API edit crops the same.
 * - A ZSA still holds the crop open: what is skipped is the space set, not
 *   whatever draws nothing.
 * - A composition of nothing but spaces crops like an empty one, with
 *   finite bounds.
 * - A glyph that starts with a space but keeps another part keeps that
 *   part's ink inside the crop.
 *
 * Does NOT cover:
 * - The crop modes on content without spaces, see
 *   `BlissSVGBuilder.crop.test.js`.
 * - Content-empty groups in the extent, see
 *   `BlissSVGBuilder.empty-content-extent.test.js`.
 * - How far a space advances, see `BlissSVGBuilder.space-glyphs.test.js`.
 *
 * @issue: #41
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const viewBox = (input, options) =>
  new BlissSVGBuilder(input, options).svgCode.match(/viewBox="([^"]+)"/)[1];

// Fresh raw-group nodes per call so no composition shares node references.
const word = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });

describe('BlissSVGBuilder space crop', () => {
  describe('when crop=compact meets a space between words', () => {
    it('takes the 4 units off the top, as it does without the space', () => {
      expect(viewBox('[crop=compact]||B291//B291')).toBe('-0.75 3.25 25.5 17.5');
      expect(viewBox('[crop=compact]||B291/B291')).toBe('-0.75 3.25 19.5 17.5');
    });
  });

  describe('when crop=auto meets a space between words', () => {
    it('crops the top and bottom to the ink', () => {
      expect(viewBox('[crop=auto]||B291//B291')).toBe('-0.75 7.25 25.5 9.5');
    });

    it('crops to the ink past a written TSP', () => {
      expect(viewBox('[crop=auto]||B291/TSP/B291')).toBe('-0.75 7.25 25.5 9.5');
    });

    it('crops to the ink past a written QSP', () => {
      expect(viewBox('[crop=auto]||B291/QSP/B291')).toBe('-0.75 7.25 21.5 9.5');
    });
  });

  describe('when a space leads or ends the composition', () => {
    it('crops the left edge past a leading space, to the same size as without it', () => {
      expect(viewBox('[crop=auto]||//H:4,8')).toBe('9.25 7.25 9.5 9.5');
      expect(viewBox('[crop=auto]||H:4,8')).toBe('3.25 7.25 9.5 9.5');
    });

    it('crops the right edge past a trailing space, as if it were not written', () => {
      expect(viewBox('[crop=auto]||H:4,8//')).toBe(viewBox('[crop=auto]||H:4,8'));
    });

    it('crops past a leading space before a character', () => {
      expect(viewBox('[crop=auto]||//B291')).toBe('5.25 7.25 9.5 9.5');
    });

    it('crops past a written QSP at either edge', () => {
      expect(viewBox('[crop=auto]||QSP/B291')).toBe('1.25 7.25 9.5 9.5');
      expect(viewBox('[crop=auto]||B291/QSP')).toBe(viewBox('[crop=auto]||B291'));
    });
  });

  describe('when a single side or axis is cropped automatically', () => {
    it('crops crop-top=auto to the ink past a space', () => {
      expect(viewBox('[crop-top=auto]||B291//B291')).toBe('-0.75 7.25 25.5 13.5');
    });

    it('crops crop-left=auto to the ink past a leading space', () => {
      expect(viewBox('[crop-left=auto]||//H:4,8')).toBe('9.25 -0.75 9.5 21.5');
    });

    it('crops crop-right=auto to the ink past a trailing space', () => {
      expect(viewBox('[crop-right=auto]||H//')).toBe(viewBox('[crop-right=auto]||H'));
    });

    it('crops crop=auto-vertical to the ink while a leading space keeps its width', () => {
      expect(viewBox('[crop=auto-vertical]||//H:4,8')).toBe('-0.75 7.25 19.5 9.5');
    });
  });

  describe('when reading the composition bounds', () => {
    it('ends the bounds at the ink on both sides of a space', () => {
      expect(new BlissSVGBuilder('B291//B291').elements.bounds).toEqual({
        minX: 0, maxX: 24, minY: 8, maxY: 16, width: 24, height: 8,
      });
    });

    it('starts the bounds at the ink after a leading space', () => {
      expect(new BlissSVGBuilder('//B291').elements.bounds.minX).toBe(6);
    });
  });

  describe('when the space comes from object input or an API edit', () => {
    it('crops past a space written as object input', () => {
      const composition = { groups: [word('B291'), word('TSP'), word('B291')] };
      expect(viewBox(composition, { crop: 'compact' })).toBe('-0.75 3.25 25.5 17.5');
    });

    it('crops past the space addGroup() inserts', () => {
      const builder = new BlissSVGBuilder('[crop=compact]||B291');
      builder.addGroup('B291');
      expect(builder.svgCode.match(/viewBox="([^"]+)"/)[1]).toBe('-0.75 3.25 25.5 17.5');
    });
  });

  describe('when a ZSA holds the crop open', () => {
    // note: ZSA draws nothing, like a space, but it is content placed to hold
    // a crop open; only TSP and QSP are spaces.
    it('keeps the top and right room a positioned ZSA marks', () => {
      expect(viewBox('[crop=auto]||ZSA:12,0;C4:4,10')).toBe('3.25 -0.75 9.5 15.5');
    });

    it('keeps the top room a ZSA marks inside a character', () => {
      expect(viewBox('[crop=auto]||B291;ZSA:0,0')).toBe('-0.75 -0.75 9.5 17.5');
    });

    it('keeps the room a leading ZSA word marks before a space', () => {
      expect(viewBox('[crop=auto]||ZSA//B291')).toBe('-0.75 -0.75 17.5 17.5');
    });
  });

  describe('when the composition holds nothing but spaces', () => {
    it('crops like an empty composition', () => {
      expect(viewBox('[crop=auto]||TSP/QSP')).toBe(viewBox('[crop=auto]||'));
      expect(viewBox('[crop=auto]||////')).toBe('-0.75 -0.75 1.5 1.5');
    });

    it('reports finite bounds at the origin', () => {
      // pins the all-excluded guard: skipping every group must collapse to a
      // point, not to Math.min over nothing (Infinity).
      expect(new BlissSVGBuilder('TSP/QSP').elements.bounds).toEqual({
        minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0,
      });
    });
  });

  describe('when a glyph starts with a space but keeps another part', () => {
    it('keeps the ink of an unknown code drawn as an error placeholder', () => {
      // pins the one-part test: `TSP;ZZ9` keeps its space part (its other part
      // is unknown), so its word reads as a space group by its first part,
      // yet the placeholder it draws must stay inside the crop.
      expect(viewBox('[crop=auto;error-placeholder]||TSP;ZZ9')).toBe('-0.75 7.25 9.5 9.5');
    });

    it('keeps that ink at the right edge of a saved composition', () => {
      // pins the one-part test on the object route: the shape toJSON() writes
      // for `B291//TSP;ZZ9`, whose placeholder is the last ink on the right.
      const saved = {
        options: { crop: 'auto', errorPlaceholder: true },
        groups: [word('B291'), word('TSP'), { glyphs: [{ parts: [{ codeName: 'TSP' }, { codeName: 'ZZ9' }] }] }],
      };
      expect(viewBox(saved)).toBe('-0.75 7.25 25.5 9.5');
    });
  });
});
