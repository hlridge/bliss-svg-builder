/**
 * Pins the default saves writing the plain parts of a word-level (`;;`) code
 * named by a custom definition on the word's head, since a word-level list
 * holds indicators only: after the head's base parts and where the builder
 * drew them, the word written as the flattened save writes it where no code
 * is left in its list.
 *
 * Covers:
 * - A word whose codes all go to the head, written flattened, so a head
 *   indicator the codes replaced, or a semantic root they dropped, stays off.
 * - A plain part beside the head's own indicators, beside another word-level
 *   code (plain in the JSON too), and on a head that is itself an indicator;
 *   each of two words alike given its own copy in the JSON; the plain parts
 *   of two codes; a plain part written before a custom indicator the codes
 *   replace, which the JSON keeps flagged.
 * - The deep JSON merge() re-ingests, left as stored.
 * - A digit or a full stop as the head: the string's plain part makes it
 *   another character on reload, losing the digit's kerning (best effort),
 *   while a full stop's tighter word space is written out; the JSON keeps an
 *   indicator flag where it can.
 *
 * Does NOT cover:
 * - A word whose one code is a plain shape, or a compound holding a plain
 *   part alone, see `BlissSVGBuilder.portable-word-indicators.test.js`.
 * - A custom indicator on the head that the word's codes replace, see the
 *   same file and `BlissSVGBuilder.portable-shape-indicators.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PP_RING: { type: 'glyph', isIndicator: true, codeString: 'C2' },
  PP_MIXED: { type: 'glyph', isIndicator: true, codeString: 'B270;B86' },
  PP_RINGPLURAL: { type: 'glyph', isIndicator: true, codeString: 'C2;B99:3,0' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// What a builder draws whatever the drawing order: its frame and every
// subpath it strokes, sorted.
const inkOf = (builder) => [builder.svgCode.match(/viewBox="[^"]*"/)[0],
  ...[...builder.svgCode.matchAll(/ d="([^"]+)"/g)].flatMap(([, d]) => d.split(/(?=M)/)).sort()];

describe('BlissSVGBuilder portable word plain parts', () => {
  describe('when every word-level code goes to the head', () => {
    it.each([
      ['B291;B86;;PP_RING', 'B291;C2:3'],
      ['B291;B97;;!PP_RING', 'B291;C2:3'],
      ['B291;B97;;PP_RING', 'B291;B97:1.5;C2:4.5'],
      // pins every code of the list judged, not a word of one code only
      ['B291;B86;;PP_RING;PP_RING', 'B291;C2:1.5;C2:4.5'],
    ])('writes %s as the flattened save does, %s, both default saves reloading as drawn', (input, saved) => {
      // note: with no code left in the word-level list, nothing would replace
      // the head's own B86 or drop its semantic root B97 on reload
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(builder.toString({ flattenIndicators: true })).toBe(saved);
      expect(builder.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(builder.toString({ preserve: true })).toBe(input);
    });
  });

  describe('when a plain part taken off a word-level code meets the head\'s own parts or another code', () => {
    it.each([
      // pins the plain part written after the head's base parts: after its
      // B86, the reload's merge would leave the head as written
      ['B291;B86;;PP_MIXED', 'B291;B270:3;B86;;B86', ['B86']],
      ['B291;B97;;!PP_MIXED', 'B291;B270:3;B97;;!B86', ['B86']],
      // pins the plain part written plain in the JSON too: flagged as an
      // indicator, it would be replaced by the code left in the list
      ['B291;;PP_RING;B81', 'B291;C2:1.5;;B81:4.5', ['B81:4.5']],
      ['B291;B81;;PP_RING;B86', 'B291;C2:1.5;B81;;B86:4.5', ['B86:4.5']],
      // pins the plain part written where it was drawn though it lies
      // outside the head's ink: with no position, a reload reads the
      // indicator heading the character as misplaced and drops it
      ['B81;;PP_MIXED', 'B81;B270:3;;B86:3', ['B86:3']],
    ])('saves %s as %s, both default saves reloading as drawn', (input, saved, codes) => {
      const builder = new BlissSVGBuilder(input);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(codes);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('saves B291;;B86:1.5;PP_RING as B291;C2:4.5;;B86:1.5, which reloads with the same ink drawn in another order', () => {
      // pins the list counted, not only compared code by code: the code left
      // in it is written as stored, and the code taken off is not written
      const builder = new BlissSVGBuilder('B291;;B86:1.5;PP_RING');
      expect(builder.toString()).toBe('B291;C2:4.5;;B86:1.5');
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(['B86:1.5']);
      expect(inkOf(new BlissSVGBuilder(builder.toString()))).toEqual(inkOf(builder));
      expect(inkOf(new BlissSVGBuilder(builder.toJSON()))).toEqual(inkOf(builder));
    });

    it('writes the plain parts of two word-level codes on the head (B291;;PP_MIXED;PP_RINGPLURAL), both saves reloading with the same ink', () => {
      // pins every plain part taken off the list written, not the first only
      const builder = new BlissSVGBuilder('B291;;PP_MIXED;PP_RINGPLURAL');
      expect(builder.toString()).toBe('B291;B270;C2:3;;B86:0;B99:6,0');
      expect(builder.toJSON().groups[0].glyphs[0].parts.map((part) => part.codeName)).toEqual(['B291', 'B270', 'C2']);
      expect(inkOf(new BlissSVGBuilder(builder.toString()))).toEqual(inkOf(builder));
      expect(inkOf(new BlissSVGBuilder(builder.toJSON()))).toEqual(inkOf(builder));
    });

    it('writes the plain part before a custom indicator the word-level codes replace (B291;PP_RING;;PP_MIXED), so the JSON reloads as drawn', () => {
      // regression: the plain part went after the spelled-out ring, which the
      // JSON keeps flagged as an indicator; a reload then read the ring as an
      // ordinary part and drew it
      const builder = new BlissSVGBuilder('B291;PP_RING;;PP_MIXED');
      expect(builder.toString()).toBe('B291;B270:3;C2:3;;B86');
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      // note (best effort): the string writes the ring as plain ink, which
      // no word-level code replaces on reload
      expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
    });

    it('gives each of two words alike its own copy of the plain part in the JSON', () => {
      // pins the part a save writes for each word as its own object, though
      // one placement serves both: a change to one leaves the other as saved
      const json = new BlissSVGBuilder('B291;;PP_MIXED//B291;;PP_MIXED').toJSON();
      const [first, , second] = json.groups;
      first.glyphs[0].parts[1].x = 7;
      expect(second.glyphs[0].parts[1]).toEqual({ codeName: 'B270', x: 3 });
    });
  });

  describe('when the word is merged into another builder', () => {
    it('keeps B291;;PP_RING as written, since the deep JSON merge() reads is left as stored', () => {
      // pins the flattening kept to the default saves: deep output is the
      // composition itself
      const builder = new BlissSVGBuilder('B291');
      builder.merge(new BlissSVGBuilder('B291;;PP_RING'));
      expect(builder.toString({ preserve: true })).toBe('B291//B291;;PP_RING');
      expect(builder.toString()).toBe('B291//B291;C2:3');
    });
  });

  describe('when the word\'s head is a digit or a full stop', () => {
    it('writes B9/B10;;PP_RING as B9/B10;C2, whose reload loses the digit kerning, while the JSON reloads as drawn', () => {
      // note (best effort): written on a digit, a plain part makes it another
      // character on reload, so the digit is no longer kerned; the JSON keeps
      // the part's indicator flag
      const builder = new BlissSVGBuilder('B9/B10;;PP_RING');
      expect(builder.toString()).toBe('B9/B10;C2');
      expect(new BlissSVGBuilder('B9/B10;C2').svgCode).not.toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('writes B291//B4;;PP_RING as B291/QSP/B4;C2, its tighter space written out though the ring moves on reload, while the JSON reloads as drawn', () => {
      // note (best effort): written on a full stop, a plain part makes it
      // another character on reload, which reads `//` as the ordinary space,
      // so the save writes the quarter space out; the ring, a plain part,
      // still sits elsewhere on reload. The JSON keeps the indicator flag
      const builder = new BlissSVGBuilder('B291//B4;;PP_RING');
      expect(builder.toString()).toBe('B291/QSP/B4;C2');
      expect(new BlissSVGBuilder('B291/QSP/B4;C2').svgCode).not.toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('writes B9/B10;;PP_MIXED as B9/B10;B270;;B86, whose reloads both lose the kerning', () => {
      // note (best effort): the part taken off the code is plain in the JSON
      // too, so neither save keeps the digit kerned
      const builder = new BlissSVGBuilder('B9/B10;;PP_MIXED');
      expect(builder.toString()).toBe('B9/B10;B270;;B86');
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(['B86']);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).not.toBe(builder.svgCode);
    });
  });
});
