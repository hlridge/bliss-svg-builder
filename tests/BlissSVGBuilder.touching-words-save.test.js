/**
 * Pins the save of words with no space between them: toString() writes them
 * as one word, which takes each piece of word state from the first word that
 * has it, and keeps the `;;` overlay on the character it was drawn on.
 *
 * Covers:
 * - Plain words, digits and Latin letters written as one word.
 * - Options taken key by key from the first word that has each, a position
 *   included, and an empty word's options taken in from either side.
 * - The `;;` overlay of the first word that has one, marked `^` where the
 *   joined word's own head pick would carry it elsewhere, also where its
 *   character is a custom glyph written as a code that pick skips (the
 *   default save against `preserve`); a later word's overlay is left out.
 * - The head mark: the first one stored, and, where another word's overlay
 *   is kept, left out so that overlay stays where it was drawn.
 * - Three words, the joined word among spaced words, and every route that
 *   leaves two words touching.
 * - A word standing alone, written as before where its overlay has no
 *   character to sit on.
 * - The `omitOptions` and `flattenIndicators` saves.
 *
 * Does NOT cover:
 * - The live builder, which keeps the two words, see
 *   `BlissSVGBuilder.element-api.test.js`.
 * - `toJSON()`, which keeps the two words as they are (it has a spelling for
 *   them), see `BlissSVGBuilder.composition-object-shape.test.js`.
 * - A bare empty word, which writes nothing and makes no seam, see
 *   `BlissSVGBuilder.empty-content-serialization.test.js`.
 * - `mergeWithNext()`, see `BlissSVGBuilder.element-api.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  TW_MORE: { type: 'glyph', codeString: 'B937' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

// Two words written with a word space between them, the space then removed.
const touching = (first, second) => changed(`${first}//${second}`, (builder) => builder.removeElement(1));

// What a builder draws: its viewBox and each path's outline, in order.
const drawing = (builder) => [
  builder.svgCode.match(/viewBox="([^"]*)"/)[1],
  ...[...builder.svgCode.matchAll(/\sd="([^"]*)"/g)].map((match) => match[1]),
];

// Which characters of a JSON's first word are marked as its head.
const headFlags = (json) => json.groups[0].glyphs.map((glyph) => glyph.isHeadGlyph === true);

const PLAIN = [
  ['B313', 'B431', 'B313/B431', ['B313', 'B431']],
  ['B9', 'B10', 'B9/B10', ['B9', 'B10']],
  ['Xa', 'Xb', 'Xab', ['Xa', 'Xb']],
];

const OPTIONS = [
  ['[color=red]|B313', 'B431', '[color=red]|B313/B431'],
  ['B313', '[color=red]|B431', '[color=red]|B313/B431'],
  ['[color=red]|B313', '[color=blue]|B431', '[color=red]|B313/B431'],
  ['[color=red]|B313', '[x=2]|B431', '[x=2;color=red]|B313/B431'],
  ['[x=1]|B313', '[x=2;y=3]|B431', '[x=1;y=3]|B313/B431'],
  ['[color=red]|', 'B313', '[color=red]|B313'],
  ['B313', '[color=red]|', '[color=red]|B313'],
  ['[color=red]|', '[x=2]|', '[x=2;color=red]|'],
];

const OVERLAY_KEPT_IN_PLACE = [
  ['B313;;B81', 'B431', 'B313/B431;;B81', [false, false]],
  ['B313', 'B431;;B81', 'B313/B431^;;B81', [false, true]],
  ['B486;;B81', 'B313', 'B486^/B313;;B81', [true, false]],
  ['B313^;;B81', 'B431', 'B313^/B431;;B81', [true, false]],
];

const HEAD_MARKS = [
  ['B313^/B291', 'B431^/B291', 'B313^/B291/B431/B291', [true, false, false, false]],
  ['B313/B291', 'B431^/B291', 'B313/B291/B431^/B291', [false, false, true, false]],
  ['B313^/B291', 'B431;;B81', 'B313/B291/B431^;;B81', [false, false, true]],
  ['B313;;B81', 'B431^/B291', 'B313/B431/B291;;B81', [false, false, false]],
];

const OBJECT_WITH_NO_SPACE_GROUP = {
  groups: [
    { glyphs: [{ parts: [{ codeName: 'B313' }] }], wordIndicators: { codes: ['B81'] } },
    { glyphs: [{ parts: [{ codeName: 'B431' }] }] },
  ],
};

const ROUTES = [
  ['removeElement() on the space', () => touching('B313;;B81', 'B431'), 'B313/B431;;B81'],
  ['remove() on the space\'s handle', () => changed('B313;;B81//B431', (b) => b.element(1).remove()), 'B313/B431;;B81'],
  ['replaceElement() of the space with an empty word', () => changed('B313;;B81//B431', (b) => b.replaceElement(1, '')), 'B313/B431;;B81'],
  ['addElement()', () => changed('B313;;B81', (b) => b.addElement('B431')), 'B313/B431;;B81'],
  ['insertElement() before a space', () => changed('B313;;B81//B100', (b) => b.insertElement(1, 'B431')), 'B313/B431;;B81//B100'],
  ['addElement() of a word with options', () => changed('B291', (b) => b.addElement('[color=red]|B100')), '[color=red]|B291/B100'],
  ['a composition object with no space group', () => new BlissSVGBuilder(OBJECT_WITH_NO_SPACE_GROUP), 'B313/B431;;B81'],
];

describe('BlissSVGBuilder touching words save', () => {
  describe('when the words carry no word state', () => {
    it.each(PLAIN)('saves %s and %s as %s, one word holding both', (first, second, saved, codes) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.toJSON().groups).toHaveLength(1);
      expect(reloaded.toJSON().groups[0].glyphs.map((glyph) => glyph.codeName)).toEqual(codes);
    });

    it('draws on reload what the builder drew, plain characters spaced as inside a word either way', () => {
      const builder = touching('B313', 'B431');
      expect(drawing(new BlissSVGBuilder(builder.toString()))).toEqual(drawing(builder));
    });
  });

  describe('when the words carry options', () => {
    it.each(OPTIONS)('saves %s and %s as %s, each option from the first word that has it', (first, second, saved) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.toJSON().groups).toHaveLength(1);
      expect(reloaded.toString()).toBe(saved);
    });
  });

  describe('when a word carries a ;; overlay', () => {
    it.each(OVERLAY_KEPT_IN_PLACE)('saves %s and %s as %s, the overlay on the character it was drawn on', (first, second, saved, flags) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(headFlags(reloaded.toJSON())).toEqual(flags);
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });

    it('keeps the first word\'s overlay and leaves the second\'s out', () => {
      const builder = touching('B313;;B81', 'B431;;B86');
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(builder.toString()).toBe('B313/B431;;B81');
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.toJSON().groups[0].wordIndicators.codes).toEqual(['B81']);
    });

    it('keeps the overlay of the first word that draws one, past an overlay with no character to sit on', () => {
      const builder = new BlissSVGBuilder({ groups: [
        { glyphs: [{ options: { color: 'red' } }], wordIndicators: { codes: ['B81'] } },
        { glyphs: [{ parts: [{ codeName: 'B313' }] }], wordIndicators: { codes: ['B86'] } },
      ] });
      expect(builder.toString()).toBe('[color=red]/B313;;B86');
      expect(drawing(new BlissSVGBuilder(builder.toString()))).toEqual(drawing(builder));
    });

    it('takes each piece of state across three words from the first word that has it', () => {
      const builder = changed('B313//[color=red]|B431//B291;;B81', (b) => {
        b.removeElement(3);
        b.removeElement(1);
      });
      expect(builder.toString()).toBe('[color=red]|B313/B431/B291^;;B81');
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
    });
  });

  describe('when a word carries a head mark', () => {
    it.each(HEAD_MARKS)('saves %s and %s as %s, a mark that would move an overlay left out', (first, second, saved, flags) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(headFlags(reloaded.toJSON())).toEqual(flags);
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });
  });

  describe('when the overlay sits on a custom glyph written as a code the head pick skips', () => {
    it('marks the head in the default save, which writes the glyph as B937', () => {
      const builder = touching('TW_MORE;;B81', 'B291');
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(builder.toString()).toBe('B937^/B291;;B81');
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });

    it('writes no mark under preserve, whose reload ranks the glyph by its own name', () => {
      const builder = touching('TW_MORE;;B81', 'B291');
      const reloaded = new BlissSVGBuilder(builder.toString({ preserve: true }));
      expect(builder.toString({ preserve: true })).toBe('TW_MORE/B291;;B81');
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });
  });

  describe('when the joined word sits among spaced words', () => {
    it('keeps the word spaces on either side', () => {
      const builder = changed('B100//[color=red]|B313//B431//B200', (b) => b.removeElement(3));
      expect(builder.toString()).toBe('B100//[color=red]|B313/B431//B200');
    });
  });

  describe('when two words are left touching by a route', () => {
    it.each(ROUTES)('saves the words left by %s as one word', (route, build, saved) => {
      const builder = build();
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).warnings).toEqual([]);
    });
  });

  describe('when a word stands alone with an overlay that has no character to sit on', () => {
    it('writes the overlay after a character written as a bracket, which reloads it', () => {
      const builder = new BlissSVGBuilder({ groups: [
        { glyphs: [{ options: { color: 'red' } }], wordIndicators: { codes: ['B81'] } },
      ] });
      expect(builder.toString()).toBe('[color=red];;B81');
      expect(new BlissSVGBuilder(builder.toString()).toJSON().groups[0].wordIndicators.codes).toEqual(['B81']);
    });

    it('leaves the overlay out of an empty word written as its options bracket', () => {
      const builder = new BlissSVGBuilder({ groups: [
        { options: { color: 'red' }, glyphs: [], wordIndicators: { codes: ['B81'] } },
      ] });
      expect(builder.toString()).toBe('[color=red]|');
    });
  });

  describe('when saved with options of the save', () => {
    it('joins the words under omitOptions, their brackets left out', () => {
      const builder = touching('[color=red]|B313;;B81', '[color=blue]|B431');
      expect(builder.toString({ omitOptions: true })).toBe('B313/B431;;B81');
    });

    it('writes each overlay on its own character under flattenIndicators', () => {
      const builder = touching('B313;;B81', 'B431;;B86');
      const reloaded = new BlissSVGBuilder(builder.toString({ flattenIndicators: true }));
      expect(builder.toString({ flattenIndicators: true })).toBe('B313;B81/B431;B86');
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });
  });
});
