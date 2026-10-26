import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a typed glyph whose code string is a letter with no outline
 * (`Xλ`, drawn as text) draws, spaces and saves as that letter written in
 * its place, on every route a code can be used by.
 *
 * Covers:
 * - Glyphs of `Xλ`, `Xaλ` (one text glyph) and `[color=red]Xλ`: alone,
 *   beside a Bliss character, under an indicator or a coordinate, in a word
 *   with `;;`, after a space, as a part, and named by another glyph.
 * - Decorated beside an outlined letter: spaced as the letter is, not as a
 *   Bliss character.
 * - The API routes (addGlyph, insertGlyph, addPart, replaceGlyph,
 *   replacePart, addGroup), each drawing as the letter passed the same way,
 *   and merge() taking in a builder that holds the letter or the glyph.
 * - Every save (default and preserve, string and JSON) reloading each of
 *   these to the same drawing; the `XTXT_` spelling, which drew all along.
 *
 * Does NOT cover:
 * - An outlined letter in a glyph, see `BlissSVGBuilder.letter-glyphs.test.js`.
 * - A text letter written bare beside an outlined letter, which a string
 *   reload reads as one text glyph (`Xλ/Xb` as `λb`; backlog, post-1.1.0).
 * - A shape holding a text letter, refused, see
 *   `BlissSVGBuilder.custom-shapes.test.js`.
 */

const FIXTURES = {
  TL_LAMBDA: { type: 'glyph', codeString: 'Xλ' },
  TL_A_LAMBDA: { type: 'glyph', codeString: 'Xaλ' },
  TL_RED_LAMBDA: { type: 'glyph', codeString: '[color=red]Xλ' },
  TL_KEYED: { type: 'glyph', codeString: 'XTXT_λ' },
  TL_NAMED: { type: 'glyph', codeString: 'TL_LAMBDA' },
  TL_ON_SQUARE: { type: 'glyph', codeString: 'B291;TL_LAMBDA:2,0' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

// Whether each save of the builder, default and preserve, string and JSON,
// reloads to the drawing it was saved from.
const reloadsOf = (builder) => {
  const drawn = builder.svgCode;
  return {
    string: new BlissSVGBuilder(builder.toString()).svgCode === drawn,
    json: new BlissSVGBuilder(builder.toJSON()).svgCode === drawn,
    preserveString: new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode === drawn,
    preserveJson: new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode === drawn,
  };
};
const EVERY_SAVE = { string: true, json: true, preserveString: true, preserveJson: true };

describe('BlissSVGBuilder text-letter glyphs', () => {
  // regression: a glyph of a text letter drew nothing (UNKNOWN_CODE) once a
  // lone custom glyph was stored as one part (2026-10-04)
  describe('when a glyph of a letter drawn as text is used where the letter is', () => {
    it.each([
      ['TL_LAMBDA', 'Xλ'],
      ['TL_A_LAMBDA', 'Xaλ'],
      ['TL_RED_LAMBDA', '[color=red]>Xλ'],
      ['TL_KEYED', 'Xλ'],
      ['TL_NAMED', 'Xλ'],
      ['B291/TL_LAMBDA', 'B291/Xλ'],
      ['TL_LAMBDA/B291', 'Xλ/B291'],
      ['TL_LAMBDA;B81', 'Xλ;B81'],
      ['TL_LAMBDA:2,0', 'Xλ:2,0'],
      ['[color=blue]TL_LAMBDA', '[color=blue]Xλ'],
      ['TL_LAMBDA;;B81', 'Xλ;;B81'],
      ['B291/TL_LAMBDA;;B81', 'B291/Xλ;;B81'],
      ['B291//TL_LAMBDA', 'B291//Xλ'],
      ['B313/TL_A_LAMBDA/B313', 'B313/Xaλ/B313'],
      ['B291;TL_LAMBDA', 'B291;Xλ'],
      ['TL_ON_SQUARE', 'B291;Xλ:2,0'],
    ])('draws %s as %s, with no warning', (input, twin) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.svgCode).toBe(svgOf(twin));
      expect(builder.warnings).toEqual([]);
      expect(reloadsOf(builder)).toEqual(EVERY_SAVE);
    });

    it.each([
      ['TL_LAMBDA', 'Xλ'],
      ['TL_A_LAMBDA', 'Xaλ'],
      ['B291;TL_LAMBDA', 'B291;Xλ'],
    ])('saves %s as the letter, %s', (input, saved) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(saved);
    });
  });

  describe('when a decorated glyph of a letter drawn as text stands beside an outlined letter', () => {
    it.each([
      ['TL_LAMBDA;B86/Xb', 'Xλ;B86/Xb'],
      ['TL_LAMBDA:1/Xb', 'Xλ:1/Xb'],
      ['[color=red]>TL_LAMBDA/Xb', '[color=red]>Xλ/Xb'],
      ['Xb/[color=red]>TL_LAMBDA', 'Xb/[color=red]>Xλ'],
      ['TL_LAMBDA;B86/XV', 'Xλ;B86/XV'],
    ])('spaces %s as the letter is spaced in %s', (input, twin) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.svgCode).toBe(svgOf(twin));
      expect(reloadsOf(builder)).toEqual(EVERY_SAVE);
    });
  });

  describe('when an API edit passes a glyph of a letter drawn as text', () => {
    it.each([
      ['addGlyph', 'B291', (builder, code) => builder.group(0).addGlyph(code)],
      ['insertGlyph', 'B291', (builder, code) => builder.group(0).insertGlyph(0, code)],
      ['addPart', 'B291', (builder, code) => builder.glyph(0).addPart(code)],
      ['replaceGlyph', 'Xb/B291', (builder, code) => builder.group(0).replaceGlyph(0, code)],
      ['replacePart', 'B291', (builder, code) => builder.glyph(0).replacePart(0, code)],
      ['addGroup', 'B291', (builder, code) => builder.addGroup(code)],
    ])('%s on %s draws as the letter passed the same way', (_, start, edit) => {
      const builder = new BlissSVGBuilder(start);
      edit(builder, 'TL_LAMBDA');
      const twin = new BlissSVGBuilder(start);
      edit(twin, 'Xλ');
      expect(builder.svgCode).toBe(twin.svgCode);
      expect(builder.warnings).toEqual([]);
      expect(reloadsOf(builder)).toEqual(EVERY_SAVE);
    });
  });

  describe('when merge() takes in a builder holding a letter drawn as text', () => {
    it.each(['Xλ', 'B291;Xλ', 'TL_LAMBDA', 'B291;TL_LAMBDA'])('draws %s merged after B313 as the string spelling does', (input) => {
      const target = new BlissSVGBuilder('B313');
      target.merge(new BlissSVGBuilder(input));
      // pins merge's reading of the part codes it takes in: without it the
      // letter drew nothing (UNKNOWN_CODE), a mutant no other row killed
      expect(target.svgCode).toBe(svgOf(`B313//${input}`));
      expect(target.warnings).toEqual([]);
    });
  });
});
