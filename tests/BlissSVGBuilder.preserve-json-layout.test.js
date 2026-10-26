import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a glyph named by a definition, read back from a `preserve` JSON,
 * takes the layout data its code gives it, as the DSL read of the same name
 * does: a digit's kerning, a letter's spacing, a full stop's word space.
 *
 * Covers:
 * - A one-code typed glyph of a digit (B9) beside a digit, of a letter (Xa)
 *   beside a letter, bare and decorated, drawn from its `preserve` JSON as
 *   from the DSL.
 * - splitAt and merge() inserting the quarter space before a typed full stop
 *   (B4) read back from a `preserve` JSON, as before the built-in one.
 * - Controls that already kept their layout: a digit after the typed digit,
 *   the typed digit under an indicator, a stored space before the typed full
 *   stop.
 *
 * Does NOT cover:
 * - The default JSON, which writes the built-in codes and so reloads them
 *   with their own layout data, see `BlissSVGBuilder.json-word-space.test.js`.
 * - insertGroup before such a full stop, see
 *   `BlissSVGBuilder.written-word-space.test.js`.
 * - An object glyph with no code of its own, which gets no layout data from
 *   its parts (backlog, post-1.1.0).
 */

const FIXTURES = {
  PJ_NINE: { type: 'glyph', codeString: 'B9' },
  PJ_STOP: { type: 'glyph', codeString: 'B4' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of [...Object.keys(FIXTURES), 'PJ_A']) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
});

// The builder its own `preserve` JSON reloads to.
const fromPreserveJson = (input) => new BlissSVGBuilder(new BlissSVGBuilder(input).toJSON({ preserve: true }));
const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

describe('BlissSVGBuilder preserve JSON layout', () => {
  describe('when a typed glyph of a digit is read back from a preserve JSON', () => {
    it.each([
      ['PJ_NINE/B9', 'B9/B9'],
      ['PJ_NINE;B86/B9', 'B9;B86/B9'],
      ['B9/PJ_NINE', 'B9/B9'],
    ])('draws %s as %s, kerned as the digit is', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(fromPreserveJson(input).svgCode).toBe(svgOf(input));
      expect(fromPreserveJson(input).toString({ preserve: true })).toBe(input);
    });
  });

  describe('when a typed glyph of a letter is read back from a preserve JSON', () => {
    it.each([
      ['PJ_A/Xb', 'Xa/Xb'],
      ['PJ_A;B86/Xb', 'Xa;B86/Xb'],
      ['Xb/PJ_A', 'Xb/Xa'],
    ])('draws %s as %s, spaced as the letter is', (input, twin) => {
      const { errors } = BlissSVGBuilder.define({ PJ_A: { type: 'glyph', codeString: 'Xa' } }, { overwrite: true });
      expect(errors).toEqual([]);
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(fromPreserveJson(input).svgCode).toBe(svgOf(input));
    });
  });

  describe('when an API edit puts a space before a typed full stop read back from a preserve JSON', () => {
    it.each([
      ['splitAt', () => {
        const builder = fromPreserveJson('B291/PJ_STOP');
        builder.group(0).splitAt(1);
        return builder;
      }],
      ['merge()', () => new BlissSVGBuilder('B291').merge(fromPreserveJson('PJ_STOP'))],
    ])('%s inserts the quarter space', (_, make) => {
      const builder = make();
      expect(builder.svgCode).toBe(svgOf('B291//B4'));
      expect(builder.toString()).toBe('B291//B4');
      expect(builder.toString({ preserve: true })).toBe('B291//PJ_STOP');
    });

    it('keeps a space stored before it', () => {
      expect(fromPreserveJson('B291/TSP/PJ_STOP').svgCode).toBe(svgOf('B291/TSP/B4'));
      expect(fromPreserveJson('B291//PJ_STOP').svgCode).toBe(svgOf('B291//B4'));
    });
  });
});
