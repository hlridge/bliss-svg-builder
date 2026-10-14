import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the word space an API edit inserts: the space `//` would read as in
 * the same place (the tighter quarter space, QSP, before a word every
 * character of which is a punctuation mark, else the ordinary TSP), so it
 * saves as `//`; and where a word inserted between two words goes, so every
 * space already there keeps the word after it.
 *
 * Covers:
 * - addGroup, insertGroup at the start and at the end, merge() and splitAt
 *   putting a full stop (B4) after a word: drawn and saved as `B291//B4`,
 *   reloading as drawn from the string and from the JSON, without warnings.
 * - A comma (B5), a word of two marks (B4/B5) and a full stop under an
 *   indicator (B4;B81) alike.
 * - The ordinary space kept before a word that is not all punctuation: a
 *   mark leading another character (B4/B291), a full stop made another
 *   character by a second base part (B4;C8), an evergreen tree (B300), a
 *   letter (Xa), a digit after a digit (B9).
 * - The word after the space read as a reload reads it: an empty character
 *   the string writes as nothing does not count, one written as a position
 *   or option bracket does.
 * - An inserted space kept through a later edit of the word after it, as a
 *   space read from the DSL is.
 * - A middle insertGroup putting the new word right after the previous word
 *   with a new space before it, so a written space (TSP, QSP, a run of two)
 *   stays where it was written, and insert-then-remove gives the original
 *   string and drawing back.
 *
 * Does NOT cover:
 * - How `//` itself resolves when read, see
 *   `BlissParser.space-resolution.test.js`.
 * - A builder read from JSON or object input, and groups written side by
 *   side with no space between them, see
 *   `BlissSVGBuilder.json-word-space.test.js`.
 * - How a run of spaces is spelled against the word after it, see
 *   `BlissSVGBuilder.empty-content-serialization.test.js`.
 * - How an edit that changes the word after an existing space keeps that
 *   space and names it, see `BlissSVGBuilder.decorated-character-layout.test.js`
 *   (a shape added to a full stop) and
 *   `BlissSVGBuilder.edited-character-layout.test.js` (the shape removed).
 * - TSP and QSP advance widths, see `BlissSVGBuilder.space-glyphs.test.js`.
 */

// Whether the default string and the default JSON each reload to the drawing.
const reloadsAsDrawn = (builder) => ({
  string: new BlissSVGBuilder(builder.toString()).svgCode === builder.svgCode,
  json: new BlissSVGBuilder(builder.toJSON()).svgCode === builder.svgCode,
});

// Whether the builder draws exactly what the DSL spelling draws.
const drawsAs = (builder, spelling) => builder.svgCode === new BlissSVGBuilder(spelling).svgCode;

describe('BlissSVGBuilder API word space', () => {
  describe('when an edit puts a full stop after a word', () => {
    it.each([
      ['addGroup', () => new BlissSVGBuilder('B291').addGroup('B4')],
      ['insertGroup at the end', () => new BlissSVGBuilder('B291').insertGroup(1, 'B4')],
      ['insertGroup at the start', () => new BlissSVGBuilder('B4').insertGroup(0, 'B291')],
      ['merge()', () => new BlissSVGBuilder('B291').merge(new BlissSVGBuilder('B4'))],
      ['splitAt', () => {
        const builder = new BlissSVGBuilder('B291/B4');
        builder.group(0).splitAt(1);
        return builder;
      }],
    ])('%s inserts the quarter space `//` gives a full stop', (_, make) => {
      const builder = make();
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
      expect(builder.toString()).toBe('B291//B4');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when an added word is all punctuation', () => {
    it.each([
      ['B5', 'B291//B5'],
      ['B4/B5', 'B291//B4/B5'],
      ['B4;B81', 'B291//B4;B81'],
    ])('addGroup(%s) inserts the quarter space and saves %s', (code, spelling) => {
      const builder = new BlissSVGBuilder('B291').addGroup(code);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(drawsAs(builder, spelling.replace('//', '/TSP/'))).toBe(false);
      expect(builder.toString()).toBe(spelling);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when an added word is not all punctuation', () => {
    it.each([
      ['B291', 'B4/B291', 'B291//B4/B291'],
      ['B291', 'B4;C8', 'B291//B4;C8'],
      ['B291', 'B300', 'B291//B300'],
      ['B291', 'Xa', 'B291//Xa'],
      ['B9', 'B9', 'B9//B9'],
    ])('on %s, addGroup(%s) inserts the ordinary word space and saves %s', (start, code, spelling) => {
      const builder = new BlissSVGBuilder(start).addGroup(code);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(drawsAs(builder, spelling.replace('//', '/QSP/'))).toBe(false);
      expect(builder.toString()).toBe(spelling);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when the word after the inserted space holds an empty character', () => {
    it('judges the word without the empty character, as the reload reads it', () => {
      // note: the empty character is written as nothing, so the reload reads
      // the word as the full stop alone and draws the quarter space
      const builder = new BlissSVGBuilder('B4');
      builder.group(0).addGlyph('');
      builder.insertGroup(0, 'B291');
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
      expect(builder.toString()).toBe('B291//B4');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });

    it.each([
      ['[x=2]/B4', 'B291//[x=2]/B4'],
      ['[color=red]/B4', 'B291//[color=red]/B4'],
      // pins the vertical position read as well as the horizontal one
      ['[y=2]/B4', 'B291//[y=2]/B4'],
    ])('counts an empty character written as a bracket: insertGroup(0, B291) on %s saves %s', (start, spelling) => {
      const builder = new BlissSVGBuilder(start).insertGroup(0, 'B291');
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(builder.toString()).toBe(spelling);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when the word after the inserted space comes from a composition object', () => {
    it('judges the full stop past an empty group before it, which the string writes as nothing', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [] }, { glyphs: [{ codeName: 'B4', parts: [{ codeName: 'B4' }] }] }] });
      builder.insertGroup(0, 'B291');
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
      expect(builder.toString()).toBe('B291//B4');
    });

    it('counts a character holding a code and no parts, which the string writes, so the space stays the ordinary one', () => {
      // note: such a character draws nothing yet the string writes its code
      // (backlog: "A glyph authored with only codeName and no parts serializes
      // to a code it never rendered"); the space follows what the string writes
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ codeName: 'B300', parts: [] }, { codeName: 'B4', parts: [{ codeName: 'B4' }] }] }] });
      builder.insertGroup(0, 'B291');
      expect(builder.toJSON().groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
    });

    it('puts insertGroup(1, B291) right after an empty first group', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [] }, { glyphs: [{ codeName: 'B4', parts: [{ codeName: 'B4' }] }] }] });
      builder.insertGroup(1, 'B291');
      expect(builder.toJSON().groups.map((group) => group.glyphs.map((glyph) => glyph.codeName ?? glyph.parts?.[0]?.codeName)))
        .toEqual([[], ['TSP'], ['B291'], ['B4']]);
    });
  });

  describe('when the word after an inserted space is edited later', () => {
    it('keeps the quarter space and names it once a shape makes the full stop another character', () => {
      // note: as for a space read from the DSL, the edit keeps the space and
      // the save writes it out, since `//` would now read as the ordinary one
      const builder = new BlissSVGBuilder('B291').addGroup('B4');
      builder.group(1).glyph(0).addPart('C8');
      expect(builder.toString()).toBe('B291/QSP/B4;C8');
      expect(drawsAs(builder, 'B291/QSP/B4;C8')).toBe(true);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when insertGroup puts a word between two words', () => {
    it.each([
      ['B291//B4', 'B300', 'B291//B300//B4'],
      ['B291//B300', 'B4', 'B291//B4//B300'],
      ['B291//B4', 'B5', 'B291//B5//B4'],
    ])('on %s, insertGroup(1, %s) saves %s', (start, code, spelling) => {
      const builder = new BlissSVGBuilder(start).insertGroup(1, code);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(builder.toString()).toBe(spelling);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });

    it.each([
      ['B291/QSP/B300', 'B4', 'B291//B4/QSP/B300'],
      ['B291/TSP/B4', 'B300', 'B291//B300/TSP/B4'],
      ['B291///B4', 'B300', 'B291//B300///B4'],
    ])('keeps the space written in %s with the word after it: insertGroup(1, %s) saves %s', (start, code, spelling) => {
      const builder = new BlissSVGBuilder(start).insertGroup(1, code);
      expect(drawsAs(builder, spelling)).toBe(true);
      expect(builder.toString()).toBe(spelling);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when a word inserted between two words is removed again', () => {
    it.each([
      ['B291//B4', 'B300'],
      ['B291/TSP/B4', 'B300'],
      ['B291/QSP/B300', 'B4'],
    ])('gives %s back after insertGroup(1, %s) and removeGroup(1)', (start, code) => {
      const builder = new BlissSVGBuilder(start).insertGroup(1, code).removeGroup(1);
      expect(builder.toString()).toBe(start);
      expect(drawsAs(builder, start)).toBe(true);
    });
  });
});
