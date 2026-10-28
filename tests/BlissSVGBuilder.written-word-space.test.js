import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that the string save spells each word space against the word after it
 * as the save writes that word, which is what a reload reads: a space is
 * written `//` only where a reload of the written word reads `//` as that
 * space, so the string reloads with the spaces the builder draws.
 *
 * Covers:
 * - A definition that pulls in the word space on a drawing whose own code does
 *   not (a glyph drawing an evergreen tree, B300), read from the DSL or added
 *   by addGroup, insertGroup, merge() or splitAt: drawn with the quarter space
 *   (QSP), which the default save, flattened or without options too, writes
 *   out; the `preserve` save writes the name, whose reload reads it, and `//`.
 * - The same definition under an indicator, a character option or a
 *   word-level code, beside a full stop (B4), after a written QSP, TSP or run
 *   of two spaces; a glyph fusing a full stop and a shape (two base parts, so
 *   written as another character) that pulls in the word space itself.
 * - The other way round: object input whose character does not pull in the
 *   word space while the code the save writes for it does (a character with
 *   no code of its own drawing a full stop, a glyph named by a definition
 *   drawing one), saved with the ordinary space written out, and a written
 *   QSP there saved as `//`.
 * - A glyph named by a definition drawing a full stop, read back from a
 *   `preserve` JSON, pulling in the word space as its code does: the space
 *   inserted before it saves as `//`.
 * - Groups written side by side after a space, read as the one word a reload
 *   reads them as.
 * - Controls saving `//` as before: a definition drawing a full stop, one
 *   setting the flag false on a full stop, one drawing an evergreen tree
 *   without the flag, a built-in full stop.
 * - A word longer than a reload reads, saved without reading it back: judged
 *   as the builder stores it, every group written side by side, less the
 *   characters written as nothing of their own (an empty character; one
 *   holding only kerning is written `[]` and counts).
 *
 * Does NOT cover:
 * - The space an API edit inserts and where it goes, see
 *   `BlissSVGBuilder.api-word-space.test.js`.
 * - A builder read from JSON or object input taking a punctuation mark's
 *   word space from its code, see `BlissSVGBuilder.json-word-space.test.js`.
 * - How a run of spaces and empty groups is spelled, see
 *   `BlissSVGBuilder.empty-content-serialization.test.js`.
 * - A word-level code spelled onto a full stop as a plain part, see
 *   `BlissSVGBuilder.portable-word-plain-parts.test.js`.
 * - An object glyph with no code of its own, which gets no layout data from
 *   its parts (backlog, post-1.1.0): here only its save.
 */

const FIXTURES = {
  WW_TREE_PULLS: { type: 'glyph', codeString: 'B300', shrinksPrecedingWordSpace: true },
  WW_FUSED_PULLS: { type: 'glyph', codeString: 'B4;C8', shrinksPrecedingWordSpace: true },
  WW_STOP: { type: 'glyph', codeString: 'B4' },
  WW_STOP_FALSE: { type: 'glyph', codeString: 'B4', shrinksPrecedingWordSpace: false },
  WW_TREE: { type: 'glyph', codeString: 'B300' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

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
const fullStops = (count) => ({ glyphs: Array.from({ length: count }, () => ({ codeName: 'B4', parts: [{ codeName: 'B4' }] })) });

describe('BlissSVGBuilder written word space', () => {
  describe('when a definition pulls in the word space on a drawing whose own code does not', () => {
    it.each([
      ['read from the DSL', () => new BlissSVGBuilder('B291//WW_TREE_PULLS')],
      ['added by addGroup', () => new BlissSVGBuilder('B291').addGroup('WW_TREE_PULLS')],
      ['added by insertGroup at the end', () => new BlissSVGBuilder('B291').insertGroup(1, 'WW_TREE_PULLS')],
      ['given a word before it by insertGroup', () => new BlissSVGBuilder('WW_TREE_PULLS').insertGroup(0, 'B291')],
      ['added by merge()', () => new BlissSVGBuilder('B291').merge(new BlissSVGBuilder('WW_TREE_PULLS'))],
      ['split off by splitAt', () => {
        const builder = new BlissSVGBuilder('B291/WW_TREE_PULLS');
        builder.group(0).splitAt(1);
        return builder;
      }],
    ])('%s, it draws the quarter space, which the save writes out', (_, make) => {
      const builder = make();
      expect(drawsAs(builder, 'B291/QSP/B300')).toBe(true);
      expect(builder.toString()).toBe('B291/QSP/B300');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['flattened', { flattenIndicators: true }],
      ['without options', { omitOptions: true }],
    ])('writes the quarter space out in the save %s', (_, options) => {
      const builder = new BlissSVGBuilder('B291//WW_TREE_PULLS');
      expect(builder.toString(options)).toBe('B291/QSP/B300');
      expect(new BlissSVGBuilder(builder.toString(options)).svgCode).toBe(builder.svgCode);
    });

    it('writes the name and // in the preserve save, whose reload reads the definition', () => {
      const builder = new BlissSVGBuilder('B291//WW_TREE_PULLS');
      expect(builder.toString({ preserve: true })).toBe('B291//WW_TREE_PULLS');
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the definition is decorated, stands beside a full stop or follows written spaces', () => {
    it.each([
      ['B291//WW_TREE_PULLS;B81', 'B291/QSP/B300;B81'],
      ['B291//[color=red]WW_TREE_PULLS', 'B291/QSP/[color=red]B300'],
      ['B291//WW_TREE_PULLS;;B81', 'B291/QSP/B300;;B81'],
      ['B291//WW_TREE_PULLS/B4', 'B291/QSP/B300/B4'],
      ['B291/QSP/WW_TREE_PULLS', 'B291/QSP/B300'],
      ['B291///WW_TREE_PULLS', 'B291/QSP/QSP/B300'],
      ['B291//WW_FUSED_PULLS', 'B291/QSP/B4;C8'],
      ['B291/TSP/WW_TREE_PULLS', 'B291//B300'],
    ])('saves %s as %s, which reloads as drawn', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when a character read from object input does not pull in the word space and the code saved for it does', () => {
    it.each([
      ['a character with no code of its own drawing a full stop, after TSP', 'B291/TSP/B4',
        [word('B291'), space('TSP'), { glyphs: [{ parts: [{ codeName: 'B4' }] }] }]],
      ['a character with no code of its own drawing a full stop, after QSP', 'B291//B4',
        [word('B291'), space('QSP'), { glyphs: [{ parts: [{ codeName: 'B4' }] }] }]],
      ['a glyph named WW_STOP drawing a full stop, after TSP', 'B291/TSP/B4',
        [word('B291'), space('TSP'), { glyphs: [{ codeName: 'WW_STOP', parts: [{ codeName: 'B4' }] }] }]],
    ])('saves %s as %s', (_, saved, groups) => {
      const builder = new BlissSVGBuilder({ groups });
      expect(builder.toString()).toBe(saved);
      expect(drawsAs(builder, saved)).toBe(true);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });

    it('writes the ordinary space out in the preserve save of a glyph named WW_STOP', () => {
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space('TSP'),
        { glyphs: [{ codeName: 'WW_STOP', parts: [{ codeName: 'B4' }] }] }] });
      expect(builder.toString({ preserve: true })).toBe('B291/TSP/WW_STOP');
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
    });

  });

  describe('when a glyph named by a definition drawing a full stop is read back from a preserve JSON', () => {
    it('saves a glyph named WW_STOP read from a preserve JSON, given a word before it, as B291//B4', () => {
      // note: read back from a preserve JSON, the glyph takes the word-space
      // flag from its code, B4, as the DSL read does, so the space inserted
      // before it is the quarter one
      const builder = new BlissSVGBuilder(new BlissSVGBuilder('WW_STOP').toJSON({ preserve: true })).insertGroup(0, 'B291');
      expect(drawsAs(builder, 'B291//B4')).toBe(true);
      expect(builder.toString()).toBe('B291//B4');
      expect(builder.toString({ preserve: true })).toBe('B291//WW_STOP');
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when groups written side by side make the word after a space', () => {
    it.each([
      ['TSP', 'B291/TSP/B4/B5'],
      ['QSP', 'B291//B4/B5'],
    ])('reads a full stop and a comma in groups of their own as one word after %s, saving %s', (spaceCode, saved) => {
      // note: a reload reads groups with no space between them as one word,
      // here all punctuation, so its default space is the quarter one
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space(spaceCode), word('B4'), word('B5')] });
      expect(builder.toString()).toBe(saved);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when the word after a space reads as the builder stores it', () => {
    it.each([
      ['B291//WW_STOP', 'B291//B4'],
      ['B291//WW_STOP_FALSE', 'B291//B4'],
      ['B291//WW_TREE', 'B291//B300'],
      ['B291//B4', 'B291//B4'],
    ])('saves %s as %s, which reloads as drawn', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(reloadsAsDrawn(builder)).toEqual({ string: true, json: true });
    });
  });

  describe('when the word after a space is longer than a reload reads', () => {
    it('saves it as the builder stores it, without reading it back', () => {
      // note: the parser refuses an input of over 10,000 characters, so no
      // reload reads this word; reading it back would throw
      const glyphs = Array.from({ length: 2100 }, () => ({ codeName: 'B291', parts: [{ codeName: 'B291' }] }));
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space('TSP'), { glyphs }] });
      expect(builder.toString()).toBe(`B291//${Array(2100).fill('B291').join('/')}`);
    });

    it('judges every group written side by side: a stored TSP before full stops beside an evergreen tree saves as //', () => {
      // pins the whole word judged; judging only its first group, all full
      // stops, wrote the stored TSP out
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space('TSP'), fullStops(3400), word('B300')] });
      const saved = builder.toString();
      expect(saved).toBe(`B291//${Array(3400).fill('B4').join('/')}/B300`);
      expect(() => new BlissSVGBuilder(saved)).toThrow(/maximum length/);
    });

    it('leaves out an empty character: a stored QSP before full stops saves as //', () => {
      // pins the characters written as nothing left out; counting them wrote
      // the stored QSP out
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space('QSP'), fullStops(3400)] });
      builder.group(1).addGlyph('');
      const saved = builder.toString();
      expect(saved).toBe(`B291//${Array(3400).fill('B4').join('/')}`);
      expect(() => new BlissSVGBuilder(saved)).toThrow(/maximum length/);
    });

    it('counts an empty character holding only kerning, written as []: a stored QSP before full stops is written out', () => {
      // pins the character counted by its own token, `[]`, written after its
      // kerning marker
      const builder = new BlissSVGBuilder({ groups: [word('B291'), space('QSP'), fullStops(3400)] });
      builder.group(1).insertGlyph(0, '', { relativeKerning: 2 });
      const saved = builder.toString();
      expect(saved).toBe(`B291/QSP/RK:2/[]/${Array(3400).fill('B4').join('/')}`);
      expect(() => new BlissSVGBuilder(saved)).toThrow(/maximum length/);
    });
  });
});
