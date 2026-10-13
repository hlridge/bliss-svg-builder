import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how insertGroup reads a negative index: it counts from the end, as
 * removeGroup and replaceGroup do, and inserts before the word it counts back
 * to, as insertGlyph, insertPart and insertElement do. On n words, -k inserts
 * where the index n - k does.
 *
 * Covers:
 * - -1 on one word, -1 and -2 on two and on three words: drawn as the DSL
 *   spelling, reloading as drawn from the string and from the JSON, without
 *   warnings.
 * - A negative index building exactly what its non-negative counterpart
 *   builds beside written spaces (QSP, TSP, a run of two), so a written space
 *   stays where it was written.
 * - An index counting back past the first word (-3, -5, -1e21 on two words)
 *   inserting at the start, and -0 inserting at the start as 0 does.
 * - -Infinity leaving the builder untouched.
 * - An empty builder taking the word at a negative index.
 * - insertGroup(-1) undone by removeGroup(-2).
 *
 * Does NOT cover:
 * - Non-negative positions (the start, the end, the middle), see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - NaN and fractional indices, see `BlissSVGBuilder.non-integer-index.test.js`.
 * - Which space an inserted word gets (the quarter space before a word of
 *   punctuation, else the ordinary one), see
 *   `BlissSVGBuilder.api-word-space.test.js`.
 * - Negative indices on insertGlyph and insertPart, see
 *   `BlissSVGBuilder.mutation.test.js`, and on insertElement, see
 *   `BlissSVGBuilder.element-api.test.js`.
 */

// Whether the default string and the default JSON each reload to the drawing.
const reloadsAsDrawn = (builder) => ({
  string: new BlissSVGBuilder(builder.toString()).svgCode === builder.svgCode,
  json: new BlissSVGBuilder(builder.toJSON()).svgCode === builder.svgCode,
});

// Whether the builder draws exactly what the DSL spelling draws.
const drawsAs = (builder, spelling) => builder.svgCode === new BlissSVGBuilder(spelling).svgCode;

describe('BlissSVGBuilder insertGroup index', () => {
  describe('when the index is negative', () => {
    it.each([
      ['B291', -1, 'B4//B291'],
      ['B291//B300', -1, 'B291//B4//B300'],
      ['B291//B300', -2, 'B4//B291//B300'],
      ['B291//B300//B313', -1, 'B291//B300//B4//B313'],
      ['B291//B300//B313', -2, 'B291//B4//B300//B313'],
    ])('inserts before the word it counts back to (%s, %s)', (input, index, spelling) => {
      const builder = new BlissSVGBuilder(input).insertGroup(index, 'B4');
      expect(builder.toString()).toBe(spelling);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['B291/QSP/B300', -1, 1, 'B4'],
      ['B291/QSP/B300', -1, 1, 'B300'],
      ['B291/TSP/B4', -1, 1, 'B300'],
      ['B291///B4', -1, 1, 'B300'],
      ['B4//B291//B5', -1, 2, 'B300'],
      ['B4//B291//B5', -2, 1, 'B300'],
    ])('on %s, index %s builds what index %s builds (inserting %s)', (input, negative, positive, code) => {
      const fromEnd = new BlissSVGBuilder(input).insertGroup(negative, code);
      const fromStart = new BlissSVGBuilder(input).insertGroup(positive, code);
      expect(fromEnd.toString()).toBe(fromStart.toString());
      expect(fromEnd.svgCode).toBe(fromStart.svgCode);
      expect(fromEnd.toJSON()).toEqual(fromStart.toJSON());
    });

    it('is undone by removeGroup(-2), which names the word it inserted', () => {
      const original = new BlissSVGBuilder('B291//B300');
      const builder = new BlissSVGBuilder('B291//B300').insertGroup(-1, 'B4').removeGroup(-2);
      expect(builder.toString()).toBe('B291//B300');
      expect(builder.svgCode).toBe(original.svgCode);
    });
  });

  describe('when the index counts back past the first word', () => {
    it.each([-3, -5, -1e21])('inserts at the start for %s on two words', (index) => {
      const builder = new BlissSVGBuilder('B291//B300').insertGroup(index, 'B4');
      expect(builder.toString()).toBe('B4//B291//B300');
    });
  });

  describe('when the index is negative zero', () => {
    it('inserts at the start, as 0 does', () => {
      const builder = new BlissSVGBuilder('B291//B300').insertGroup(-0, 'B4');
      expect(builder.toString()).toBe('B4//B291//B300');
    });
  });

  describe('when the index is negative infinity', () => {
    it('leaves the builder untouched', () => {
      const builder = new BlissSVGBuilder('B291//B300').insertGroup(-Infinity, 'B4');
      expect(builder.toString()).toBe('B291//B300');
    });
  });

  describe('when the builder is empty', () => {
    it('takes the word at a negative index', () => {
      const builder = new BlissSVGBuilder('').insertGroup(-1, 'B4');
      expect(builder.toString()).toBe('B4');
      expect(builder.warnings).toEqual([]);
    });
  });
});
