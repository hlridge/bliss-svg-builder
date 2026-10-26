import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a typed glyph may be made of letters, and is then the letters it
 * is made of: it draws, spaces and saves as those letters written in its
 * place, so a custom character such as a copy of B118 (the letters abc as one
 * character) can be defined under a name of its own.
 *
 * Covers:
 * - define() and patchDefinition() accepting a glyph of letters in every
 *   spelling: one letter, a placed letter, a letter as a part, B118's and
 *   B972's code strings, a custom external glyph; a run of outlined letters
 *   still refused as a word.
 * - Copies of B118 and B972 drawing as the built-ins alone, under an
 *   indicator, beside a letter or a Bliss character, in a word with `;;`.
 * - A glyph of one letter being that letter: the letter gap, pair kerning,
 *   the letter's spacing kept under an indicator, a coordinate or an option,
 *   and the save writing the letters (joined into one run).
 * - A glyph naming a custom external glyph, drawn and spaced as it.
 * - A glyph of one letter flagged as a compound indicator: one indicator,
 *   centred, its position written out by the save.
 * - Every save (default and preserve, string and JSON) reloading each of
 *   these to the same drawing.
 *
 * Does NOT cover:
 * - A glyph of a letter with no outline, drawn as text, see
 *   `BlissSVGBuilder.text-letter-glyphs.test.js`.
 * - A shape holding a letter, refused, see
 *   `BlissSVGBuilder.custom-shapes.test.js`.
 * - A letter glyph read back from a `preserve` JSON keeping its letter's
 *   spacing beside another letter, see
 *   `BlissSVGBuilder.preserve-json-layout.test.js`.
 * - B118's and B972's letter offsets following the default letter run, see
 *   `BlissSVGBuilder.alphabet-characters.test.js`.
 */

const FIXTURES = {
  LG_ABC: { type: 'glyph', codeString: BlissSVGBuilder.getDefinition('B118').codeString },
  LG_ABC_CAPS: { type: 'glyph', codeString: BlissSVGBuilder.getDefinition('B972').codeString },
  LG_A: { type: 'glyph', codeString: 'Xa' },
  LG_CAP_V: { type: 'glyph', codeString: 'XV' },
  LG_A_PLACED: { type: 'glyph', codeString: 'Xa:2,0' },
  LG_ON_SQUARE: { type: 'glyph', codeString: 'B291;Xa:2,8' },
  MY_LETTER: { type: 'externalGlyph', char: 'ß', width: 4, getPath: (x, y) => `M${x},${y + 16}h4v-8h-4Z` },
  LG_MY_LETTER: { type: 'glyph', codeString: 'MY_LETTER' },
  LG_IND_A: { type: 'glyph', codeString: 'Xa', isIndicator: true },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const definedInTest = [];
afterEach(() => {
  for (const code of definedInTest) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  definedInTest.length = 0;
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

// Whether each save of the input, default and preserve, string and JSON,
// reloads to the drawing it was saved from.
const reloadsOf = (input) => {
  const builder = new BlissSVGBuilder(input);
  const drawn = builder.svgCode;
  return {
    string: new BlissSVGBuilder(builder.toString()).svgCode === drawn,
    json: new BlissSVGBuilder(builder.toJSON()).svgCode === drawn,
    preserveString: new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode === drawn,
    preserveJson: new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode === drawn,
  };
};
const EVERY_SAVE = { string: true, json: true, preserveString: true, preserveJson: true };

describe('BlissSVGBuilder letter glyphs', () => {
  describe('when define() is given a glyph made of letters', () => {
    it.each([
      ['one letter', 'Xa'],
      ['one capital letter', 'XA'],
      ['a placed letter', 'Xa:0,8'],
      ['a letter as a part', 'B291;Xa:2,8'],
      ["B118's code string", 'Xa;Xb:3.2353933,0;Xc:6.4707865,0'],
      ['a custom external glyph', 'MY_LETTER'],
    ])('accepts %s (%s)', (_, codeString) => {
      definedInTest.push('LG_NEW');
      const { defined, errors } = BlissSVGBuilder.define({ LG_NEW: { type: 'glyph', codeString } });
      expect(errors).toEqual([]);
      expect(defined).toEqual(['LG_NEW']);
    });

    it('still refuses a run of outlined letters, which is a word', () => {
      const { defined, errors } = BlissSVGBuilder.define({ LG_WORD: { type: 'glyph', codeString: 'Xab' } });
      expect(defined).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('a glyph definition cannot be a multi-character word');
    });
  });

  describe('when patchDefinition() turns a glyph into a letter', () => {
    it('accepts the letter and draws the glyph as it', () => {
      definedInTest.push('LG_PATCHED');
      BlissSVGBuilder.define({ LG_PATCHED: { type: 'glyph', codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition('LG_PATCHED', { codeString: 'Xa' })).not.toThrow();
      expect(svgOf('LG_PATCHED')).toBe(svgOf('Xa'));
    });
  });

  describe('when a copy of B118 or B972 is used where the built-in is', () => {
    it.each([
      ['LG_ABC', 'B118'],
      ['LG_ABC;B81', 'B118;B81'],
      ['LG_ABC/Xd', 'B118/Xd'],
      ['Xd/LG_ABC', 'Xd/B118'],
      ['B291/LG_ABC', 'B291/B118'],
      ['LG_ABC/B291;;B81', 'B118/B291;;B81'],
      ['B291/LG_ABC;;B81', 'B291/B118;;B81'],
      ['LG_ABC_CAPS', 'B972'],
      ['LG_ABC_CAPS/XD', 'B972/XD'],
      ['B291//LG_ABC_CAPS', 'B291//B972'],
    ])('draws %s as %s, with no warning', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(new BlissSVGBuilder(input).warnings).toEqual([]);
    });

    it.each(['LG_ABC;B81', 'Xd/LG_ABC', 'B291/LG_ABC;;B81', 'LG_ABC_CAPS/XD'])('reads every save of %s back to the same drawing', (input) => {
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });
  });

  describe('when a glyph of one letter is used where the letter is', () => {
    it.each([
      ['LG_A', 'Xa'],
      ['LG_A/Xb', 'Xa/Xb'],
      ['Xb/LG_A', 'Xb/Xa'],
      ['XA/LG_CAP_V', 'XA/XV'],
      ['LG_CAP_V/XA', 'XV/XA'],
      ['LG_A;B86/Xb', 'Xa;B86/Xb'],
      ['LG_A:1/Xb', 'Xa:1/Xb'],
      ['[color=red]>LG_A/Xb', '[color=red]>Xa/Xb'],
      ['B291/LG_A', 'B291/Xa'],
      ['LG_A_PLACED', 'Xa:2,0'],
      ['LG_ON_SQUARE', 'B291;Xa:2,8'],
    ])('draws %s as %s, with no warning', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(new BlissSVGBuilder(input).warnings).toEqual([]);
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });

    it.each([
      ['LG_A', 'Xa'],
      ['LG_A/Xb', 'Xab'],
      ['XA/LG_CAP_V', 'XAV'],
      ['LG_A;B86/Xb', 'Xa;B86/Xb'],
    ])('saves %s as the letters, %s', (input, saved) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(saved);
    });
  });

  describe('when a glyph names a custom external glyph', () => {
    it.each([
      ['LG_MY_LETTER', 'MY_LETTER'],
      ['LG_MY_LETTER/Xb', 'MY_LETTER/Xb'],
      ['B291/LG_MY_LETTER', 'B291/MY_LETTER'],
    ])('draws %s as %s', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(new BlissSVGBuilder(input).toString()).toBe(twin);
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });
  });

  describe('when a glyph of one letter is flagged as a compound indicator', () => {
    it.each([
      ['B291;LG_IND_A', 'B291;Xa:2.782303370786517'],
      ['B291;;LG_IND_A', 'B291;Xa:2.782303370786517'],
    ])('centres it as one indicator: %s draws and saves as %s', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(saved);
      expect(builder.svgCode).toBe(svgOf(saved));
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });
  });
});
