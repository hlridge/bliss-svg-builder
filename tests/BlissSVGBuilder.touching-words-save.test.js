/**
 * Pins the save of words with no space between them: toString() writes them
 * as one word, the way mergeWithNext() leaves them, with the first word's
 * options, `;;` overlay and head mark over every word's characters.
 *
 * Covers:
 * - Plain words, digits and Latin letters written as one word.
 * - The first word's options, a position included, and the options of an
 *   empty word that comes first; a later word's options are left out.
 * - The first word's `;;` overlay, drawn on the joined word's head, also
 *   where the first word has no character of its own for it; a later word's
 *   overlay is left out. A custom glyph written as a code the head pick skips
 *   is marked `^` in the default save, not under `preserve`.
 * - The first word's head mark; a later word's is left out.
 * - The save against mergeWithNext(): the same string, by default and under
 *   `preserve`, and a reload that draws what the merged builder draws.
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
 * - mergeWithNext() itself, see `ElementHandle.word-indicator-structure.test.js`.
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

// The same two words made one by mergeWithNext().
const merged = (first, second) => changed(`${first}//${second}`, (builder) => builder.group(0).mergeWithNext());

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
  ['B313', '[color=red]|B431', 'B313/B431'],
  ['[color=red]|B313', '[color=blue]|B431', '[color=red]|B313/B431'],
  ['[color=red]|B313', '[x=2]|B431', '[color=red]|B313/B431'],
  ['[x=1]|B313', '[x=2;y=3]|B431', '[x=1]|B313/B431'],
  ['[color=red]|', 'B313', '[color=red]|B313'],
  ['B313', '[color=red]|', 'B313'],
  ['[color=red]|', '[x=2]|', '[color=red]|'],
];

const OVERLAYS = [
  ['B313;;B81', 'B431', 'B313/B431;;B81', [false, false]],
  ['B313', 'B431;;B81', 'B313/B431', [false, false]],
  ['B486;;B81', 'B313', 'B486/B313;;B81', [false, false]],
  ['B313^;;B81', 'B431', 'B313^/B431;;B81', [true, false]],
  ['B313;;B81', 'B431;;B86', 'B313/B431;;B81', [false, false]],
];

const HEAD_MARKS = [
  ['B313^/B291', 'B431^/B291', 'B313^/B291/B431/B291', [true, false, false, false]],
  ['B313/B291', 'B431^/B291', 'B313/B291/B431/B291', [false, false, false, false]],
  ['B313^/B291', 'B431;;B81', 'B313^/B291/B431', [true, false, false]],
  ['B313;;B81', 'B431^/B291', 'B313/B431/B291;;B81', [false, false, false]],
];

// Every pair above whose second word holds a character, which mergeWithNext()
// absorbs (it leaves a following empty word where it is).
const MERGEABLE = [
  ['B313', 'B431'], ['B9', 'B10'], ['Xa', 'Xb'],
  ['[color=red]|B313', 'B431'], ['B313', '[color=red]|B431'], ['[color=red]|B313', '[color=blue]|B431'],
  ['[color=red]|B313', '[x=2]|B431'], ['[x=1]|B313', '[x=2;y=3]|B431'], ['[color=red]|', 'B313'],
  ['B313;;B81', 'B431'], ['B313', 'B431;;B81'], ['B486;;B81', 'B313'], ['B313^;;B81', 'B431'],
  ['B313;;B81', 'B431;;B86'], ['B313^/B291', 'B431^/B291'], ['B313/B291', 'B431^/B291'],
  ['B313^/B291', 'B431;;B81'], ['B313;;B81', 'B431^/B291'], ['TW_MORE;;B81', 'B291'],
  ['B486;;B81', 'TW_MORE/B291'],
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
  ['addElement() of a word with options', () => changed('B291', (b) => b.addElement('[color=red]|B100')), 'B291/B100'],
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
    it.each(OPTIONS)('saves %s and %s as %s, the first word\'s options only', (first, second, saved) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.toJSON().groups).toHaveLength(1);
      expect(reloaded.toString()).toBe(saved);
    });
  });

  describe('when a word carries a ;; overlay', () => {
    it.each(OVERLAYS)('saves %s and %s as %s, the first word\'s overlay only', (first, second, saved, flags) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(headFlags(reloaded.toJSON())).toEqual(flags);
    });

    it('draws the overlay on the joined word\'s head, not on the character the builder drew it on', () => {
      const builder = touching('B486;;B81', 'B313');
      expect(drawing(builder)).toEqual(drawing(new BlissSVGBuilder('B486^/B313;;B81')));
      expect(drawing(new BlissSVGBuilder(builder.toString()))).not.toEqual(drawing(builder));
    });

    it('keeps the overlay of a first word with no character of its own, drawn on the joined word\'s head', () => {
      const words = { groups: [
        { glyphs: [{ options: { color: 'red' } }], wordIndicators: { codes: ['B81'] } },
        { glyphs: [{ parts: [{ codeName: 'B313' }] }], wordIndicators: { codes: ['B86'] } },
      ] };
      const merge = changed(words, (b) => b.group(0).mergeWithNext());
      expect(new BlissSVGBuilder(words).toString()).toBe('[color=red]/B313;;B81');
      expect(merge.toString()).toBe('[color=red]/B313;;B81');
    });

    it('keeps the overlay of a first word that has options and no characters', () => {
      const words = { groups: [
        { options: { color: 'red' }, glyphs: [], wordIndicators: { codes: ['B81'] } },
        { glyphs: [{ parts: [{ codeName: 'B313' }] }] },
      ] };
      const merge = changed(words, (b) => b.group(0).mergeWithNext());
      expect(new BlissSVGBuilder(words).toString()).toBe('[color=red]|B313;;B81');
      expect(merge.toString()).toBe('[color=red]|B313;;B81');
    });

    it('takes the state of the first of three words only', () => {
      const input = 'B313//[color=red]|B431//B291;;B81';
      const builder = changed(input, (b) => {
        b.removeElement(3);
        b.removeElement(1);
      });
      const merge = changed(input, (b) => {
        b.group(0).mergeWithNext();
        b.group(0).mergeWithNext();
      });
      expect(builder.toString()).toBe('B313/B431/B291');
      expect(merge.toString()).toBe('B313/B431/B291');
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
    });
  });

  describe('when a word carries a head mark', () => {
    it.each(HEAD_MARKS)('saves %s and %s as %s, the first word\'s head mark only', (first, second, saved, flags) => {
      const builder = touching(first, second);
      const reloaded = new BlissSVGBuilder(saved);
      expect(builder.toString()).toBe(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(headFlags(reloaded.toJSON())).toEqual(flags);
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

    it('marks the glyph where it is a later word\'s, the joined word\'s head', () => {
      const builder = touching('B486;;B81', 'TW_MORE/B291');
      expect(builder.toString()).toBe('B486/B937^/B291;;B81');
      expect(builder.toString({ preserve: true })).toBe('B486/TW_MORE/B291;;B81');
    });
  });

  describe('when the save is compared with mergeWithNext()', () => {
    it.each(MERGEABLE)('saves %s and %s as mergeWithNext() leaves them', (first, second) => {
      const builder = touching(first, second);
      const merge = merged(first, second);
      expect(builder.toString()).toBe(merge.toString());
      expect(builder.toString({ preserve: true })).toBe(merge.toString({ preserve: true }));
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(merge.svgCode);
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

    it('writes each word\'s overlay on its own head under flattenIndicators, before the words are joined', () => {
      const builder = touching('B313;;B81', 'B431;;B86');
      const reloaded = new BlissSVGBuilder(builder.toString({ flattenIndicators: true }));
      expect(builder.toString({ flattenIndicators: true })).toBe('B313;B81/B431;B86');
      expect(drawing(reloaded)).toEqual(drawing(builder));
    });
  });
});
