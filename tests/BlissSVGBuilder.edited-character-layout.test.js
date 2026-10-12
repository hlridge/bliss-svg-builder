import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that the spacing a character keeps follows its parts after the API
 * edits them, as the written form of the result is spaced: taking a second
 * base part away gives a letter, a digit or a punctuation mark its spacing
 * back, and an indicator inserted before a part you positioned takes it away;
 * every save reloads to the same drawing.
 *
 * Covers:
 * - A second base part removed, or replaced by an indicator, on a digit (on
 *   either side of a pair), a letter and a full stop; the word space before
 *   the full stop keeps the width it was read with, and the save names it.
 * - An indicator inserted before a positioned digit, letter or full stop,
 *   which is drawn where it stands, an ordinary part of a character composed
 *   on the fly, on either side of a pair.
 * - The letter a handle reports after `addPart` of a shape and of an
 *   indicator.
 *
 * Does NOT cover:
 * - The same characters written directly or named by a definition, see
 *   `BlissSVGBuilder.decorated-character-layout.test.js` and
 *   `BlissSVGBuilder.named-character-layout.test.js`.
 * - `replacePart` of the base part itself, which keeps the spacing of the
 *   code it replaced (backlog).
 */

// Gap in grid units between a word's first two characters, read from the
// laid-out snapshot, so it measures spacing rather than ink.
const gapAfterFirstIn = (builder) => {
  const [first, second] = builder.groups[0].children;
  return second.x - (first.x + first.width);
};

const reloadsOfBothSaves = (builder) => [
  new BlissSVGBuilder(builder.toString()).svgCode,
  new BlissSVGBuilder(builder.toJSON()).svgCode,
];

describe('BlissSVGBuilder edited character layout', () => {
  describe('when the API takes a second base part away', () => {
    it.each([
      ['remove takes the shape off the first digit', 'B9;B303/B10', (b) => b.glyph(0).part(1).remove(), 'B9/B10', 1],
      ['remove takes the shape off the second digit', 'B9/B10;B303', (b) => b.glyph(1).part(1).remove(), 'B9/B10', 1],
      ['replacePart makes the second base part of a digit an indicator', 'B9;B303/B10', (b) => b.glyph(0).replacePart(1, 'B86'), 'B9;B86/B10', 1],
      ['remove takes the shape off a letter', 'Xa;C8/Xb', (b) => b.glyph(0).part(1).remove(), 'Xab', 0.8],
    ])('gives the spacing back after %s, and both saves reload as drawn', (_label, input, edit, saved, gap) => {
      // pins the character carrying its base code's spacing while a second
      // base part turns it off, so the layout can turn it on again; dropped
      // when read, the edited character stays apart while its save reloads
      // spaced (2026-10 hand mutants)
      const builder = new BlissSVGBuilder(input);
      expect(gapAfterFirstIn(builder)).toBeCloseTo(2, 6);
      edit(builder);
      expect(gapAfterFirstIn(builder)).toBeCloseTo(gap, 6);
      expect(builder.toString()).toBe(saved);
      expect(reloadsOfBothSaves(builder)).toEqual([builder.svgCode, builder.svgCode]);
    });

    it('keeps the ordinary word space read before a full stop fused with a shape once the shape is removed, and the save names it', () => {
      // note: a word space is decided when it is read, and an edit to the next
      // word keeps it, so the full stop pulls in no space it did not pull in
      // when read; the save writes that space out
      const builder = new BlissSVGBuilder('B291//B4;C8');
      expect(builder.groups[1].x).toBe(16);
      builder.group(1).glyph(0).part(1).remove();
      expect(builder.groups[1].x).toBe(16);
      expect(builder.toString()).toBe('B291/TSP/B4');
      expect(reloadsOfBothSaves(builder)).toEqual([builder.svgCode, builder.svgCode]);
    });
  });

  describe('when the API inserts an indicator before a part you positioned', () => {
    it.each([
      ['the first digit', 'B9:0,0/B10', (b) => b.glyph(0).insertPart(0, 'B86'), 'B86;B9:0,0/B10'],
      ['the second digit', 'B9/B10:0,0', (b) => b.glyph(1).insertPart(0, 'B86'), 'B9/B86;B10:0,0'],
      ['the first letter', 'Xa:0,0/Xb', (b) => b.glyph(0).insertPart(0, 'B86'), 'B86;Xa:0,0/Xb'],
    ])('spaces %s as a Bliss character, as its written form is spaced, and both saves reload as drawn', (_label, input, edit, saved) => {
      // control: written first, the indicator is drawn where it stands, an
      // ordinary part of a character composed on the fly, on the API route as
      // in the written form; pins the base parts counted in the layout's
      // order, not by the indicator flag alone (2026-10 hand mutants)
      const builder = new BlissSVGBuilder(input);
      edit(builder);
      expect(gapAfterFirstIn(builder)).toBeCloseTo(2, 6);
      expect(builder.toString()).toBe(saved);
      expect(reloadsOfBothSaves(builder)).toEqual([builder.svgCode, builder.svgCode]);
    });

    it('keeps the tighter word space read before the full stop, and the save names it', () => {
      const builder = new BlissSVGBuilder('B291//B4:0,0');
      builder.group(1).glyph(0).insertPart(0, 'B86');
      expect(builder.groups[1].x).toBe(12);
      expect(builder.toString()).toBe('B291/QSP/B86;B4:0,0');
      expect(reloadsOfBothSaves(builder)).toEqual([builder.svgCode, builder.svgCode]);
    });
  });

  describe('when the API adds a part to a letter', () => {
    it('reports no letter once a shape makes it another character', () => {
      // pins the handle reporting the letter the layout spaces by, not the
      // one stored on the character, which the shape leaves in place
      const builder = new BlissSVGBuilder('Xa/Xb');
      builder.glyph(0).addPart('C8');
      expect(builder.glyph(0).char).toBe('');
      expect(builder.glyph(0).isExternalGlyph).toBe(false);
    });

    it('reports the letter it still is with an indicator', () => {
      const builder = new BlissSVGBuilder('Xa/Xb');
      builder.glyph(0).addPart('B86');
      expect(builder.glyph(0).char).toBe('a');
      expect(builder.glyph(0).isExternalGlyph).toBe(true);
    });
  });
});
