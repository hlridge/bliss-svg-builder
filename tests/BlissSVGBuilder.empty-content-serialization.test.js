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
 * - mixed runs hold their per-space spelling (each default space a bare
 *   separator, each divergent space its explicit code, GH #19) and stay
 *   byte-stable across serialize cycles
 * - the default judged as a reload judges it: the whole run against the word
 *   written after it (a space added beside another, an empty word inside the
 *   run, a written QSP whose next word was replaced), that word being the
 *   characters written, so an empty character written as nothing leaves the
 *   word and one written as a bracket (or as `[]` after its kerning) stays
 * - bare empties never trigger a separator: trailing without a space, solo,
 *   and run-of-only-empties documents
 * - options-carrying empties emit their own [opts]| segment, split runs,
 *   and round-trip
 * - a word the builder drops as failed (MALFORMED_WORD_INDICATOR) leaves its
 *   spaces to merge into one run, which round-trips
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
      expect(viewBoxWidth(b)).toBe(23.5);
      expect(reparsedWidth(b)).toBe(23.5);
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
      // Since #19 each space is spelled on its own, so only the QSP that
      // diverges from the default is written out; the run is still one segment.
      const b = new BlissSVGBuilder({ groups: [word('B291'), qspSpace(), empty(), space(), word('B208')] });
      expect(b.toString()).toBe('B291/QSP//B208');
      expect(viewBoxWidth(b)).toBe(27.5);
      expect(reparsedWidth(b)).toBe(27.5);
      expect(new BlissSVGBuilder(b.toString()).toString()).toBe(b.toString());
    });
  });

  describe('when bare empty groups sit at the document edges', () => {
    it('keeps a trailing space-and-empty emission unchanged', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty()] });
      expect(b.toString()).toBe('B291//');
      expect(viewBoxWidth(b)).toBe(17.5);
      expect(reparsedWidth(b)).toBe(17.5);
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

    it('keeps the quarter space before a full stop when an empty group is added after it', () => {
      // pins the run before the full stop spelled once the composition ends,
      // even where its last group writes nothing
      const b = new BlissSVGBuilder('B291//B4').addElement('');
      expect(b.toString()).toBe('B291//B4');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
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
    it('drops the failed word so the surrounding spaces coalesce and round-trip', () => {
      // The malformed ;; chain flags the word (MALFORMED_WORD_INDICATOR) and the
      // builder drops it (retention family, rows 31/80). Its two separating
      // spaces are now adjacent and merge into one run, staying round-trip
      // stable in both serialization and rendered width.
      const b = new BlissSVGBuilder('B291//B313;;B81;;B86//B208');
      expect(b.toString()).toBe('B291///B208');
      expect(b.warnings.map(w => w.code)).toEqual(['MALFORMED_WORD_INDICATOR']);
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

  describe('when the word after a space holds an empty character', () => {
    // note: a character the string writes as nothing is no part of the word
    // a reload reads after the space; one written as a bracket is
    it.each([
      ['B291//[grid]/B4'],
      ['B291//B4/[grid]'],
    ])('writes out the ordinary space read in %s before a full stop beside a character a refused option emptied', (input) => {
      const b = new BlissSVGBuilder(input);
      expect(b.toString()).toBe('B291/TSP/B4');
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('keeps a written TSP before a full stop given an empty character', () => {
      const b = new BlissSVGBuilder('B291/TSP/B4');
      b.group(1).addGlyph('');
      expect(b.toString()).toBe('B291/TSP/B4');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('writes out the quarter space before a full stop given an empty character holding only kerning', () => {
      // note: the character is written `[]` after its kerning marker, so a
      // reload reads it as part of the word
      const b = new BlissSVGBuilder('B291//B4');
      b.group(1).insertGlyph(0, '', { relativeKerning: 2 });
      expect(b.toString()).toBe('B291/QSP/RK:2/[]/B4');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('writes out the quarter space before a full stop given an empty character with an option', () => {
      const b = new BlissSVGBuilder('B291//B4');
      b.group(1).addGlyph('', { color: 'red' });
      expect(b.toString()).toBe('B291/QSP/B4/[color=red]');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });

  describe('when a run of spaces comes before a full stop', () => {
    // note: a reload reads the whole run against the word after it, where a
    // full stop (B4) makes the quarter space (QSP) the default, so a space of
    // the run decided elsewhere is the one written out
    it.each([
      ['a space added after a trailing space', 'H/TSP//B4', () => new BlissSVGBuilder('H//').addGroup('B4')],
      ['a space added after an empty word', 'B291/TSP//B4', () => new BlissSVGBuilder('B291').addGroup('').addGroup('B4')],
      ['a word merged in with its leading space', 'B291/TSP//B4', () => new BlissSVGBuilder('B291').merge(new BlissSVGBuilder('//B4'))],
      ['a written QSP whose next word was replaced', 'B291//B4', () => new BlissSVGBuilder('B291/QSP/B300').replaceGroup(1, 'B4')],
    ])('spells %s against the word after the run and saves %s', (_, spelling, make) => {
      const b = make();
      expect(b.toString()).toBe(spelling);
      expect(new BlissSVGBuilder(spelling).svgCode).toBe(b.svgCode);
      expect(new BlissSVGBuilder(b.toJSON()).svgCode).toBe(b.svgCode);
    });

    it('spells a run split by a word a refused option emptied against the full stop', () => {
      const b = new BlissSVGBuilder('B291//[grid]|//B4');
      expect(b.toString()).toBe('B291/TSP//B4');
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });
});
