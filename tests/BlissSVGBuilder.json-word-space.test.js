import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a composition read from JSON or object input knows a punctuation
 * mark pulls in the word space, as one read from the DSL does: `toJSON()`
 * leaves that out as data the code gives, so the reload takes it from the
 * code, and the space before such a mark saves and draws as it would after
 * a DSL read.
 *
 * Covers:
 * - The JSON reload of `B291//B4` saving as written (not `B291/QSP/B4`).
 * - Object input with an explicit space: a TSP before a full stop saves as
 *   `/TSP/`, a QSP before a full stop written beside another word (one word
 *   to a reload, not all punctuation) as `/QSP/`, each reloading as drawn.
 * - splitAt, insertGroup at the start and merge() on a JSON-built builder
 *   inserting the quarter space before a full stop.
 * - A space inserted before a full stop written beside another word judged
 *   against the two, as the reload reads them.
 *
 * Does NOT cover:
 * - The space an API edit inserts on a builder read from the DSL, see
 *   `BlissSVGBuilder.api-word-space.test.js`.
 * - That `toJSON()` leaves the word-space flag out, see
 *   `BlissSVGBuilder.json-output.test.js`.
 * - An object glyph with no code of its own, which gets no layout data from
 *   its parts (backlog, post-1.1.0).
 */

// Whether the default string and the default JSON each reload to the drawing.
const reloadsAsDrawn = (builder) => ({
  string: new BlissSVGBuilder(builder.toString()).svgCode === builder.svgCode,
  json: new BlissSVGBuilder(builder.toJSON()).svgCode === builder.svgCode,
});

// Whether the builder draws exactly what the DSL spelling draws.
const drawsAs = (builder, spelling) => builder.svgCode === new BlissSVGBuilder(spelling).svgCode;

// Groups in the shape toJSON() writes them: a character named by its code,
// a space by its part alone.
const word = (code) => ({ glyphs: [{ codeName: code, parts: [{ codeName: code }] }] });
const space = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });

describe('BlissSVGBuilder JSON word space', () => {
  describe('when the JSON of a DSL read is reloaded', () => {
    it('saves the reload of B291//B4 as written', () => {
      const builder = new BlissSVGBuilder(new BlissSVGBuilder('B291//B4').toJSON());
      expect(builder.toString()).toBe('B291//B4');
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
    });
  });

  describe('when object input writes a space before a full stop', () => {
    it.each([
      ['B291, TSP, B4', 'B291/TSP/B4', [word('B291'), space('TSP'), word('B4')]],
      ['B291, QSP, B4 and B300 with no space between', 'B291/QSP/B4/B300', [word('B291'), space('QSP'), word('B4'), word('B300')]],
    ])('saves the groups %s as %s', (_, spelling, groups) => {
      const builder = new BlissSVGBuilder({ groups });
      expect(builder.toString()).toBe(spelling);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when an API edit puts a space before a full stop read from JSON', () => {
    it.each([
      ['splitAt', () => {
        const builder = new BlissSVGBuilder(new BlissSVGBuilder('B291/B4').toJSON());
        builder.group(0).splitAt(1);
        return builder;
      }],
      ['insertGroup at the start', () => new BlissSVGBuilder(new BlissSVGBuilder('B4').toJSON()).insertGroup(0, 'B291')],
      ['merge() of a JSON-built builder', () => new BlissSVGBuilder('B291').merge(new BlissSVGBuilder(new BlissSVGBuilder('B4').toJSON()))],
    ])('%s inserts the quarter space', (_, make) => {
      const builder = make();
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
      expect(builder.toString()).toBe('B291//B4');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });

    it('judges a full stop written beside another word as the reload reads the two', () => {
      // note: groups with no space between them save as one word, B4/B300,
      // which is not all punctuation, so the space before it is the ordinary one
      const builder = new BlissSVGBuilder({ groups: [word('B4'), word('B300')] }).insertGroup(0, 'B291');
      expect(drawsAs(builder, 'B291//B4/B300')).toBe(true);
      expect(builder.toString()).toBe('B291//B4/B300');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });
});
