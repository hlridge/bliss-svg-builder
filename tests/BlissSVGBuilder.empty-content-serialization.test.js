/**
 * Pins width-faithful toString() emission of space and empty groups: every
 * maximal run of space groups and bare content-empty groups emits exactly
 * once, so the serialized string reparses to the rendered width.
 *
 * Covers:
 * - run coalescing across interior empties (N default space glyphs in a run
 *   emit N+1 slashes once, not per group)
 * - native adjacent space groups (emission-side; reparse-side collapse is
 *   GH #19's, untouched here)
 * - mixed runs holding an explicit space code emit the code list joined
 *   with / and stay byte-stable across serialize cycles
 * - bare empties never trigger a separator: trailing without a space, solo,
 *   and run-of-only-empties documents
 * - options-carrying empties emit their own [opts]| segment, split runs,
 *   and round-trip
 * - fail-flagged words re-emit their errorSource in place and split runs
 * - a word-indicator overlay on an empty group stays string-invisible while
 *   toJSON still carries it
 *
 * Does NOT cover:
 * - document extent of empties, see BlissSVGBuilder.empty-content-extent.test.js
 * - navigation/classification of empties, see
 *   BlissSVGBuilder.empty-group-navigation.test.js
 * - reparse-side collapsing of adjacent space groups (GH #19)
 *
 * @issue: #33
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Width is the third number of the svg viewBox.
const viewBoxWidth = (b) =>
  Number(b.svgCode.match(/viewBox="[^"]+ [^"]+ ([^" ]+) [^"]+"/)[1]);

// Width the emitted string renders at when parsed back.
const reparsedWidth = (b) => viewBoxWidth(new BlissSVGBuilder(b.toString()));

// Fresh raw-group nodes per call so no document shares node references.
const word = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });
const space = () => word('TSP');
const empty = () => ({ glyphs: [] });
// Explicit non-default space, runtime-verified node shape: parsing
// B291/QSP//B208 marks the explicitly written QSP part with
// _differsFromDefault, and object input accepts the same shape.
const qspSpace = () => ({ glyphs: [{ parts: [{ codeName: 'QSP', _differsFromDefault: true }] }] });

describe('BlissSVGBuilder empty-content serialization', () => {
  describe('when space groups and interior empties form one run', () => {
    it('emits an interior space-empty-space run as one slash run', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty(), space(), word('B208')] });
      expect(b.toString()).toBe('B291///B208');
      expect(viewBoxWidth(b)).toBe(31.5);
      expect(reparsedWidth(b)).toBe(31.5);
      // pins per-GLYPH counting: the reparse coalesces the run into one
      // space group of two TSP glyphs, so a per-group count would re-emit //.
      expect(new BlissSVGBuilder(b.toString()).toString()).toBe(b.toString());
    });

    it('emits a trailing space-empty-space-empty run as one slash run', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty(), space(), empty()] });
      expect(b.toString()).toBe('B291///');
      expect(viewBoxWidth(b)).toBe(17.5);
      expect(reparsedWidth(b)).toBe(17.5);
    });

    it('coalesces a three-space run split by two interior empties', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty(), space(), empty(), space(), word('B208')] });
      expect(b.toString()).toBe('B291////B208');
      expect(viewBoxWidth(b)).toBe(37.5);
      expect(reparsedWidth(b)).toBe(37.5);
    });

    it('joins a run that starts with an empty group to the following space', () => {
      // regression: an empty group before a space used to emit its own
      // separator, over-counting the run (B291///B208 for one space).
      const b = new BlissSVGBuilder({ groups: [word('B291'), empty(), space(), word('B208')] });
      expect(b.toString()).toBe('B291//B208');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });

    it('coalesces native adjacent space groups', () => {
      // Deliberately in scope: object-authored adjacent space groups had the
      // identical over-count. Emission-side only; GH #19 owns reparse-side.
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), space(), word('B208')] });
      expect(b.toString()).toBe('B291///B208');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });
  });

  describe('when a run holds an explicit space code', () => {
    it('emits the explicit code list and stays stable across serialize cycles', () => {
      // regression: the per-group emission grew on every cycle
      // (B291/QSP///B208 reparsed to B291/QSP/TSP/TSP/B208).
      const b = new BlissSVGBuilder({ groups: [word('B291'), qspSpace(), empty(), space(), word('B208')] });
      expect(b.toString()).toBe('B291/QSP/TSP/B208');
      expect(viewBoxWidth(b)).toBe(27.5);
      expect(reparsedWidth(b)).toBe(27.5);
      expect(new BlissSVGBuilder(b.toString()).toString()).toBe(b.toString());
    });
  });

  describe('when bare empty groups sit at the document edges', () => {
    it('keeps a trailing space-and-empty emission unchanged', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty()] });
      expect(b.toString()).toBe('B291//');
      expect(viewBoxWidth(b)).toBe(11.5);
      expect(reparsedWidth(b)).toBe(11.5);
    });

    it('emits nothing for a document holding only empty groups', () => {
      const solo = new BlissSVGBuilder({ groups: [empty()] });
      expect(solo.toString()).toBe('');
      expect(reparsedWidth(solo)).toBe(viewBoxWidth(solo));
      const run = new BlissSVGBuilder({ groups: [empty(), empty()] });
      expect(run.toString()).toBe('');
    });

    it('emits no separator for a trailing empty group without a space', () => {
      // regression: the empty group used to push an empty segment, and the
      // join decorated it into a trailing slash (B291/).
      const b = new BlissSVGBuilder({ groups: [word('B291'), empty()] });
      expect(b.toString()).toBe('B291');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });

    it('keeps the leading empty-and-space emission unchanged', () => {
      const b = new BlissSVGBuilder({ groups: [empty(), space(), word('B291')] });
      expect(b.toString()).toBe('//B291');
      expect(viewBoxWidth(b)).toBe(15.5);
      expect(reparsedWidth(b)).toBe(15.5);
    });
  });

  describe('when an empty group carries options', () => {
    it('emits an options-only token that splits the space run', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), { glyphs: [], options: { color: 'red' } }, space(), word('B208')] });
      expect(b.toString()).toBe('B291//[color=red]|//B208');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
      expect(new BlissSVGBuilder(b.toString()).toString()).toBe(b.toString());
    });

    it('round-trips a DSL options-only empty word byte-identically', () => {
      const b = new BlissSVGBuilder('B291//[color=red]|');
      expect(b.toString()).toBe('B291//[color=red]|');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });
  });

  describe('when a space run meets a fail-flagged word', () => {
    it('re-emits the failed word in place between separate space runs', () => {
      // The malformed ;; chain flags the word (MALFORMED_WORD_INDICATOR) and
      // toString re-emits its errorSource verbatim; the surrounding space
      // runs must flush around it, never coalesce across it or trail it.
      const b = new BlissSVGBuilder('B291//B313;;B81;;B86//B208');
      expect(b.toString()).toBe('B291//B313;;B81;;B86//B208');
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });
  });

  describe('when an empty group carries a word-indicator overlay', () => {
    it('keeps the overlay string-invisible while toJSON carries it', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [], wordIndicators: { codes: ['B81'] } }] });
      expect(b.toString()).toBe('');
      expect(b.toJSON().groups[0].wordIndicators.codes).toEqual(['B81']);
      expect(reparsedWidth(b)).toBe(viewBoxWidth(b));
    });
  });
});
