/**
 * Pins what a space character left inside a word does with the word's `;;`
 * overlay: the rebuild splits the word at its spaces, and the overlay stays
 * with the first word only while the character it is drawn on does, as a
 * word's splitAt() keeps it; otherwise it is dropped with a warning.
 *
 * Covers:
 * - An overlay whose character lands in a later word: dropped with one
 *   DROPPED_WORD_INDICATOR naming it, its strip marker and an empty overlay
 *   included; a head mark in the later word stays.
 * - An overlay whose character stays in the first word: kept with no
 *   warning, a leading space and a space after the head included, and a word
 *   whose one character the head pick skips (a space takes no part in the
 *   pick).
 * - An overlay with no character to sit on, kept on the first word.
 * - Every route that leaves a space inside a word: insertGlyph() with TSP or
 *   QSP, replaceGlyph(), a character's replacePart(), object input (two
 *   spaces too), and the one string that writes it (`B10/TSP;;B81`).
 * - Parity with splitAt(): the same overlay, warning and drawing for the
 *   same cut.
 *
 * Does NOT cover:
 * - The split itself (space runs, options copied to later words, adjacent
 *   space groups merged, a fail-flagged word left whole), see
 *   `BlissSVGBuilder.space-invariant.test.js`.
 * - A word turned all space, whose overlay is dropped for another reason,
 *   see `BlissSVGBuilder.space-invariant.test.js`.
 * - splitAt()'s own rule, its head mark included, see
 *   `ElementHandle.split-word-state.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// A builder for `input` with a space character inserted into its first word at `index`.
const inserted = (input, index, space = 'TSP') => {
  const builder = new BlissSVGBuilder(input);
  builder.group(0).insertGlyph(index, space);
  return builder;
};

// A builder for `input` with its first word split at `index`.
const split = (input, index) => {
  const builder = new BlissSVGBuilder(input);
  builder.group(0).splitAt(index);
  return builder;
};

// The characters of `input`'s first word as a composition object stores them.
const glyphsOf = (input) => new BlissSVGBuilder(input).toJSON().groups[0].glyphs;

const TSP_GLYPH = { parts: [{ codeName: 'TSP' }] };

// Each group's stored overlay, a word space included.
const overlays = (builder) => builder.toJSON().groups.map((group) => group.wordIndicators);

const dropWarnings = (builder) => builder.warnings.filter((warning) => warning.code === 'DROPPED_WORD_INDICATOR');

const DROPPED = [
  ['B313/B431^;;B81', 1, 'B313//B431^', ';;B81'],
  ['B937/B313;;B81', 1, 'B937//B313', ';;B81'],
  ['B303/B313/B431^;;!B86', 1, 'B303//B313/B431^', ';;!B86'],
  ['B313/B431^;;', 1, 'B313//B431^', ';;'],
  // pins the source's codes joined with ';' (killed a join(',') mutant)
  ['B313/B431^;;B81;B86', 1, 'B313//B431^', ';;B81;B86'],
];

const KEPT = [
  ['B313/B431;;B81', 1, 'B313;;B81//B431', { codes: ['B81'], stripSemantic: false }, ['B81', undefined, undefined]],
  ['B313/B431^/B291;;B81', 2, 'B313/B431^;;B81//B291', { codes: ['B81'], stripSemantic: false }, ['B81', undefined, undefined]],
  // pins the first word run, not the first run, as the keeper (killed a runs[0] mutant)
  ['B313;;B81', 0, '//B313;;B81', { codes: ['B81'], stripSemantic: false }, [undefined, 'B81']],
  // pins the spaces set aside before the head pick, which would crown the TSP after B10
  ['B10;;B81', 1, 'B10;;B81//', { codes: ['B81'], stripSemantic: false }, ['B81', undefined]],
];

describe('BlissSVGBuilder in-word space indicator', () => {
  describe('when the space lands before the character the overlay is drawn on', () => {
    it.each(DROPPED)('inserted into %s at %i saves %s, the overlay dropped', (input, index, saved, source) => {
      const builder = inserted(input, index);
      expect(builder.toString()).toBe(saved);
      expect(overlays(builder)).toEqual([undefined, undefined, undefined]);
      expect(dropWarnings(builder).map((warning) => warning.source)).toEqual([source]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(saved).svgCode);
    });

    it('reports the drop in words that name the overlay and where its character went', () => {
      expect(inserted('B313/B431^;;B81', 1).warnings).toEqual([{
        code: 'DROPPED_WORD_INDICATOR',
        message: 'A space inside the word split it, which dropped the word\'s word-level indicator overlay (;;B81). The character it was drawn on went to a later word.',
        source: ';;B81',
      }]);
    });
  });

  describe('when the character the overlay is drawn on stays in the first word', () => {
    it.each(KEPT)('inserted into %s at %i saves %s, the overlay kept', (input, index, saved, overlay, firstCodes) => {
      const builder = inserted(input, index);
      expect(builder.toString()).toBe(saved);
      expect(overlays(builder).map((stored) => stored?.codes[0])).toEqual(firstCodes);
      expect(overlays(builder).find(Boolean)).toEqual(overlay);
      expect(dropWarnings(builder)).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(saved).svgCode);
    });

    it('keeps an overlay that no character can carry on the first word', () => {
      // pins the no-character guard: an overlay on a word of empty characters has nothing to lose
      const builder = new BlissSVGBuilder({ groups: [{
        glyphs: [{ parts: [] }, TSP_GLYPH, { parts: [] }],
        wordIndicators: { codes: ['B81'], stripSemantic: false },
      }] });
      expect(overlays(builder)).toEqual([{ codes: ['B81'], stripSemantic: false }, undefined, undefined]);
      expect(dropWarnings(builder)).toEqual([]);
    });
  });

  describe('when another route leaves the space inside the word', () => {
    it.each([
      ['insertGlyph() with a quarter space', () => inserted('B313/B431^;;B81', 1, 'QSP'), 'B313/QSP/B431^'],
      ['replaceGlyph()', () => {
        const builder = new BlissSVGBuilder('B313/B1103/B431^;;B81');
        builder.group(0).replaceGlyph(1, 'TSP');
        return builder;
      }, 'B313//B431^'],
      ['a character\'s replacePart()', () => {
        const builder = new BlissSVGBuilder('B313/B1103/B431^;;B81');
        builder.group(0).glyph(1).replacePart(0, 'TSP');
        return builder;
      }, 'B313//B431^'],
      ['object input', () => {
        const [b313, b431] = glyphsOf('B313/B431^');
        return new BlissSVGBuilder({ groups: [{ glyphs: [b313, TSP_GLYPH, b431], wordIndicators: { codes: ['B81'], stripSemantic: false } }] });
      }, 'B313//B431^'],
      ['object input with two spaces', () => {
        const [b313, b431, b291] = glyphsOf('B313/B431/B291^');
        return new BlissSVGBuilder({ groups: [{ glyphs: [b313, TSP_GLYPH, b431, TSP_GLYPH, b291], wordIndicators: { codes: ['B81'], stripSemantic: false } }] });
      }, 'B313//B431//B291^'],
    ])('drops the overlay through %s', (_route, build, saved) => {
      const builder = build();
      expect(builder.toString()).toBe(saved);
      expect(overlays(builder).filter(Boolean)).toEqual([]);
      expect(dropWarnings(builder).map((warning) => warning.source)).toEqual([';;B81']);
    });

    it('keeps the overlay through object input with two spaces after its character', () => {
      const [b313, b431, b291] = glyphsOf('B313/B431/B291');
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [b313, TSP_GLYPH, b431, TSP_GLYPH, b291], wordIndicators: { codes: ['B81'], stripSemantic: false } }] });
      expect(builder.toString()).toBe('B313;;B81//B431//B291');
      expect(dropWarnings(builder)).toEqual([]);
    });

    it('keeps the overlay where the string writes a space at the end of the word it ends', () => {
      // note: the `;;` keeps the parser from splitting `B10/TSP` at its space, so the rebuild does it
      const builder = new BlissSVGBuilder('B10/TSP;;B81');
      expect(builder.toString()).toBe('B10;;B81//');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the same cut is made with splitAt()', () => {
    it.each([...DROPPED, ...KEPT.slice(0, 2)])('cuts %s at %i to the same overlay, warning and drawing', (input, index) => {
      const spaced = inserted(input, index);
      const cut = split(input, index);
      expect(overlays(spaced)).toEqual(overlays(cut));
      expect(dropWarnings(spaced).map((warning) => warning.source)).toEqual(dropWarnings(cut).map((warning) => warning.source));
      expect(spaced.svgCode).toBe(cut.svgCode);
    });
  });
});
