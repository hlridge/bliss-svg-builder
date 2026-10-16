import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins what an indicator kept before a part you positioned is: an ordinary
 * part of its character, saved where you wrote it, which an indicator added
 * to the character never replaces.
 *
 * Covers:
 * - Every kind of indicator written before a part is kept when that part
 *   wrote an axis and dropped when it wrote none: a flagged one-code
 *   indicator glyph, a built-in compound indicator (B84), a custom compound
 *   indicator, an indicator with a position of its own, and one written
 *   between two parts.
 * - Both saves write it where it was written, the default ones spelling a
 *   custom one out into built-in codes, and every save (string and JSON,
 *   default and `preserve`) reloads to the same drawing.
 * - A digit after it keeps no digit kerning through a save
 *   (`B86;B9:0,0/B10`): written after the digit, the indicator would hand
 *   the digit its kerning back.
 * - A word-level `;;` indicator, `applyIndicators()` and `flattenIndicators`
 *   add to it and never replace it, on the reload of a save too;
 *   `clearIndicators()` leaves it and reports that nothing changed.
 *
 * Does NOT cover:
 * - The drop rule, its warning text and the built-in indicator before each
 *   axis spelling, see `BlissSVGBuilder.indicator-sequencing.test.js` and
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
 * - How such a character is spaced beside a digit or letter, see
 *   `BlissSVGBuilder.decorated-character-layout.test.js`.
 * - Where an indicator added after it is drawn. The layout reads the parts as
 *   an indicator pattern broken by a plain part and places none of them, so
 *   the added indicator sits at the character's origin, over the leading
 *   one. No placement is right there, since the leading indicator already
 *   fills the indicator band; left as it falls, and every save reloads it.
 * - A custom compound of several indicators written first, under a
 *   word-level indicator: spelled out, its second indicator meets the word's
 *   in the merge, so the default saves do not reload it as drawn, and no
 *   built-in spelling would. `preserve` does.
 */

const DEFINITIONS = {
  LEADONE: { type: 'glyph', isIndicator: true, codeString: 'B81' },
  LEADPAIR: { type: 'glyph', isIndicator: true, codeString: 'B86;SDOT:3,4' },
};

// The gap between a word's first two characters, from the laid-out snapshot.
const gapAfterFirst = (builder) => {
  const [first, second] = builder.groups[0].children;
  return second.x - (first.x + first.width);
};

describe('BlissSVGBuilder leading indicator', () => {
  beforeAll(() => {
    expect(BlissSVGBuilder.define(DEFINITIONS).defined).toEqual(Object.keys(DEFINITIONS));
  });

  afterAll(() => {
    for (const code of Object.keys(DEFINITIONS)) BlissSVGBuilder.removeDefinition(code);
  });

  describe('when the part after it wrote an axis', () => {
    it.each([
      ['a flagged one-code indicator glyph', 'LEADONE;B303:0,0'],
      ['a built-in compound indicator', 'B84;B303:0,0'],
      ['a custom compound indicator', 'LEADPAIR;B303:0'],
      ['an indicator with a position of its own', 'B86:1,2;B303:,0'],
      ['an indicator between two parts', 'B291;B86;C8:0,0'],
    ])('keeps %s in %s without a warning', (_, input) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString({ preserve: true })).toBe(input);
    });
  });

  describe('when the part after it wrote no axis', () => {
    it.each([
      ['LEADONE;B303', 'LEADONE'],
      ['B84;B303', 'B84'],
      ['LEADPAIR;B303', 'LEADPAIR'],
    ])('drops the indicator in %s and names %s', (input, source) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe('B303');
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['MISPLACED_INDICATOR_PART', source]]);
    });
  });

  describe('when the composition is saved', () => {
    it.each([
      ['LEADONE;B303:0,0', 'B81;B303:0,0'],
      ['B84;B303:0,0', 'B84;B303:0,0'],
      ['LEADPAIR;B303:0', 'B86;SDOT:3,4;B303:0'],
      ['B86:1,2;B303:,0', 'B86:1,2;B303:,0'],
      ['B291;B86;C8:0,0', 'B291;B86;C8:0,0'],
    ])('writes the indicator in %s where it was written: %s', (input, saved) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(saved);
    });

    it.each([
      'LEADONE;B303:0,0', 'B84;B303:0,0', 'LEADPAIR;B303:0', 'B86:1,2;B303:,0', 'B291;B86;C8:0,0',
    ])('reloads %s to the same drawing from every save', (input) => {
      const builder = new BlissSVGBuilder(input);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });

    it('keeps the digit after it unkerned through a save of B86;B9:0,0/B10', () => {
      const builder = new BlissSVGBuilder('B86;B9:0,0/B10');
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(builder.toString()).toBe('B86;B9:0,0/B10');
      expect(gapAfterFirst(reloaded)).toBeCloseTo(2, 6);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when an indicator is added to the character', () => {
    // note: `applyIndicators()` and the `;;` merge read a character's first
    // part as its base whatever it is, so a leading indicator belongs to the
    // base they add to
    it('keeps it under a word-level indicator, so B86;B303:0,0;;B81 flattens to B86;B303:0,0;B81', () => {
      const builder = new BlissSVGBuilder('B86;B303:0,0;;B81');
      expect(builder.toString()).toBe('B86;B303:0,0;;B81');
      expect(builder.toString({ flattenIndicators: true })).toBe('B86;B303:0,0;B81');
    });

    it('adds an applied indicator after the positioned part instead of replacing it', () => {
      const builder = new BlissSVGBuilder('B86;B303:0,0');
      builder.glyph(0).applyIndicators('B81');
      expect(builder.toString()).toBe('B86;B303:0,0;B81');
      expect(builder.warnings).toEqual([]);
    });

    it('adds an applied indicator the same way on the reload of a save', () => {
      const reloaded = new BlissSVGBuilder(new BlissSVGBuilder('B86;B303:0,0').toString());
      reloaded.glyph(0).applyIndicators('B81');
      expect(reloaded.toString()).toBe('B86;B303:0,0;B81');
    });

    it('leaves it in place on clearIndicators() and reports that nothing changed', () => {
      const builder = new BlissSVGBuilder('B86;B303:0,0');
      builder.glyph(0).clearIndicators();
      expect(builder.toString()).toBe('B86;B303:0,0');
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['NOOP_INDICATOR_MUTATION', 'B86']]);
    });
  });
});
