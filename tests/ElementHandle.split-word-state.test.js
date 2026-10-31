/**
 * Pins what a word's splitAt() does with the word's `;;` overlay and head
 * mark: the overlay stays with the first word only while the character it is
 * drawn on does, and is dropped with a warning when the split sends that
 * character to the second word.
 *
 * Covers:
 * - An overlay whose character stays in the first word: kept there, with its
 *   strip marker, an empty overlay included.
 * - An overlay whose character goes to the second word: dropped from both
 *   words with one DROPPED_WORD_INDICATOR naming it, also where the first
 *   word's own head pick would have carried it onto another character.
 * - An overlay with no character to sit on, kept on the first word.
 * - The head mark: kept in the first word, dropped in the second, in a word
 *   with no overlay too.
 * - A split undone by mergeWithNext(), and a merge undone by a split.
 *
 * Does NOT cover:
 * - mergeWithNext()'s own overlay and head rules, see
 *   `ElementHandle.word-indicator-structure.test.js`.
 * - Options copied to both words and the index checks, see
 *   `BlissSVGBuilder.element-api.test.js`.
 * - The builder-level splitAt(groupIndex) between words, see
 *   `BlissSVGBuilder.merge-split.test.js`.
 * - A word split by a space glyph left inside it, see
 *   `BlissSVGBuilder.space-invariant.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// A builder for `input` with its first word split at `index`.
const split = (input, index) => {
  const builder = new BlissSVGBuilder(input);
  builder.group(0).splitAt(index);
  return builder;
};

// Each group's stored overlay, a word space included.
const overlays = (builder) => builder.toJSON().groups.map((group) => group.wordIndicators);

const dropWarnings = (builder) => builder.warnings.filter((warning) => warning.code === 'DROPPED_WORD_INDICATOR');

const KEPT = [
  ['B313/B1103;;B86', 1, 'B313;;B86//B1103', { codes: ['B86'], stripSemantic: false }],
  ['B313/B431;;B81', 1, 'B313;;B81//B431', { codes: ['B81'], stripSemantic: false }],
  ['B303/B313^/B431;;B86', 2, 'B303/B313^;;B86//B431', { codes: ['B86'], stripSemantic: false }],
  ['B303^/B313;;!B86', 1, 'B303^;;!B86//B313', { codes: ['B86'], stripSemantic: true }],
  ['B313/B431;;', 1, 'B313;;//B431', { codes: [], stripSemantic: false }],
];

const DROPPED = [
  ['B313/B1103^;;B86', 1, 'B313//B1103', ';;B86'],
  ['B303/B313^;;!B86', 1, 'B303//B313', ';;!B86'],
  ['B303/B313/B431^;;B86', 1, 'B303//B313/B431', ';;B86'],
  ['B937/B313;;B81', 1, 'B937//B313', ';;B81'],
  ['B313/B431^;;', 1, 'B313//B431', ';;'],
];

describe('ElementHandle split word state', () => {
  describe('when the overlay\'s character stays in the first word', () => {
    it.each(KEPT)('splits %s at %i into %s, the overlay kept on the first word', (input, index, saved, overlay) => {
      const builder = split(input, index);
      expect(builder.toString()).toBe(saved);
      expect(overlays(builder)).toEqual([overlay, undefined, undefined]);
      expect(dropWarnings(builder)).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(saved).svgCode);
    });
  });

  describe('when the overlay\'s character goes to the second word', () => {
    it.each(DROPPED)('splits %s at %i into %s, the overlay dropped', (input, index, saved, source) => {
      const builder = split(input, index);
      expect(builder.toString()).toBe(saved);
      expect(overlays(builder)).toEqual([undefined, undefined, undefined]);
      expect(dropWarnings(builder).map((warning) => warning.source)).toEqual([source]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(saved).svgCode);
    });

    it('names the split and the dropped overlay in the warning', () => {
      const builder = split('B313/B1103^;;B86', 1);
      expect(dropWarnings(builder)[0].message).toBe(
        'splitAt(1) dropped the word\'s word-level indicator overlay (;;B86). The character it was drawn on went to the second word.');
    });
  });

  describe('when the word has no overlay', () => {
    // pins the overlay check before the head is looked for; a split past the
    // head of a word with no overlay threw when it was left out (2026-10-31)
    it('splits B313/B431^/B291 at 1 into B313//B431/B291, the head mark in the second word dropped', () => {
      const builder = split('B313/B431^/B291', 1);
      expect(builder.toString()).toBe('B313//B431/B291');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the overlay has no character to sit on', () => {
    it('keeps the overlay on the first word', () => {
      const builder = new BlissSVGBuilder({ groups: [{
        glyphs: [{ options: { color: 'red' } }, { options: { color: 'blue' } }],
        wordIndicators: { codes: ['B81'] },
      }] });
      builder.group(0).splitAt(1);
      expect(overlays(builder)[0]).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(dropWarnings(builder)).toEqual([]);
    });
  });

  describe('when a split is undone by mergeWithNext()', () => {
    it('restores the word byte-identically when no head marker moves', () => {
      const builder = new BlissSVGBuilder('B313/B1103;;B86');
      const before = builder.svgCode;
      builder.group(0).splitAt(1);
      builder.group(0).mergeWithNext();
      expect(builder.toString()).toBe('B313/B1103;;B86');
      expect(builder.svgCode).toBe(before);
      expect(dropWarnings(builder)).toEqual([]);
    });

    it('restores the word and its head marker when the marker stays in the first word', () => {
      const builder = new BlissSVGBuilder('B303/B313^/B431;;B86');
      const before = builder.svgCode;
      builder.group(0).splitAt(2);
      builder.group(0).mergeWithNext();
      expect(builder.toString()).toBe('B303/B313^/B431;;B86');
      expect(builder.svgCode).toBe(before);
      expect(dropWarnings(builder)).toEqual([]);
    });

    it('loses the overlay whose character the split sent to the second word', () => {
      const builder = new BlissSVGBuilder('H/E^;;B97');
      builder.group(0).splitAt(1);
      builder.group(0).mergeWithNext();
      expect(builder.toString()).toBe('H/E');
      expect(dropWarnings(builder).map((warning) => warning.source)).toEqual([';;B97']);
    });
  });

  describe('when a merge is undone by splitAt()', () => {
    it('gives both words back when the first word\'s overlay stays on its own character', () => {
      const builder = new BlissSVGBuilder('B313;;B81//B431');
      const before = builder.svgCode;
      builder.group(0).mergeWithNext();
      builder.group(0).splitAt(1);
      expect(builder.toString()).toBe('B313;;B81//B431');
      expect(builder.svgCode).toBe(before);
      expect(dropWarnings(builder)).toEqual([]);
    });

    it('drops an overlay the merge drew on the absorbed word\'s character', () => {
      const builder = new BlissSVGBuilder('B486;;B81//B313');
      builder.group(0).mergeWithNext();
      builder.group(0).splitAt(1);
      expect(builder.toString()).toBe('B486//B313');
      expect(dropWarnings(builder).map((warning) => warning.source)).toEqual([';;B81']);
    });
  });
});
