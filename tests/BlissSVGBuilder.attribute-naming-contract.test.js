import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { KNOWN_OPTION_KEYS } from '../src/lib/bliss-constants.js';

/**
 * Pins the ratified naming contract's table as a whole: a name the library or a
 * standard owns works in either casing and comes back in its owner's spelling, a
 * name nobody owns comes back exactly as it was written, and a `<target>--name`
 * key suspends all of that.
 *
 * The table was landed one column at a time, and every earlier column has a file
 * of its own. This is the first point where all six are live at once, so it is
 * the first point where the table can be pinned as a table rather than as a
 * column. The last column to arrive is the serializer: `toJSON()` used to emit
 * the stored spelling throughout, which is kebab for the library's own
 * vocabulary, and now emits the spelling each name's OWNER publishes.
 *
 * The stored spelling and the published one are deliberately different things.
 * Storage is kebab for the curated vocabulary because that is what a bracket
 * carries and what the options pass dispatches on; publication is camelCase
 * because that is how JavaScript spells a name, and `toJSON()` output is
 * JavaScript's view of the composition. `toString()` is the DSL's view and keeps
 * the kebab spelling, which is why the two serializers disagree on purpose.
 *
 * Covers:
 * - Every row of the contract's table, in both spellings where it accepts two,
 *   across all six columns: it works in a bracket, it works in the options
 *   argument, the two agree byte for byte, the attribute it does or does not
 *   emit, the spelling `toString()` gives back, and the key `toJSON()` publishes.
 * - Publication at all four scopes an options bag can sit at (document, word,
 *   character, part). A document-only implementation passes a table written at
 *   document scope and leaves the other three wrong.
 * - The published spelling DERIVED from the curated vocabulary, so an option
 *   added later is covered the day it lands.
 * - The controls that keep publication about the curated vocabulary rather than
 *   about hyphens: a name a standard owns keeps its owner's hyphens
 *   (`stroke-dasharray`, `aria-label`), an author's name is never touched
 *   (`data-attr`), and a `<target>--` key is literal in both spellings.
 * - `{ deep: true }` output, which feeds `toString()` and `merge()`, keeps the
 *   STORED spelling. Publishing there would move the DSL serializer with it.
 * - The round trip, one input per class, twice over: the published spelling
 *   re-ingests to the same picture and republishes identically.
 * - Kerning, the one curated name whose stored spelling differs by scope, which
 *   publication converges.
 *
 * Does NOT cover:
 * - How a written name is resolved on the way IN; that is
 *   `BlissSVGBuilder.option-spelling.test.js` (the library's own vocabulary),
 *   `BlissSVGBuilder.svg-attribute-vocabulary.test.js` (a standard's) and
 *   `BlissSVGBuilder.object-input-options.test.js` (the composition-object
 *   channel).
 * - `MULTIPLE_OPTION_SPELLINGS`, which is about two spellings meeting in one
 *   bag rather than about what one spelling becomes.
 * - Option VALUE handling, see `BlissSVGBuilder.option-value-gate.test.js`.
 */

const render = (input, opts) => (opts ? new BlissSVGBuilder(input, opts) : new BlissSVGBuilder(input));
const optionKeys = (json) => Object.keys(json.options ?? {});

// Every curated option whose camelCase spelling differs from its kebab one,
// DERIVED so an option added later is covered the day it lands. Built here by
// this file's own transform rather than imported from the implementation: a
// restated constant tests the restatement, and a test that publishes through
// the code under test asserts only that the code agrees with itself.
const CURATED_CAMEL_SPELLINGS = [...KNOWN_OPTION_KEYS]
  .filter((key) => key.includes('-'))
  .map((key) => key.replace(/-(.)/g, (_, letter) => letter.toUpperCase()));

describe('the attribute naming contract', () => {
  describe('the contract table, all six columns', () => {
    // The ratified table, transcribed row for row. Where it and this file ever
    // disagree, the contract wins.
    //
    //  written-a         | written-b        | attribute        | toString()             | toJSON()
    it.each([
      ['margin-top', 'marginTop', null, '[margin-top=3]||B291', 'marginTop'],
      ['stroke-width', 'strokeWidth', 'stroke-width', '[stroke-width=3]||B291', 'strokeWidth'],
      ['view-box', 'viewBox', 'viewBox', '[viewBox=3]||B291', 'viewBox'],
      ['stroke-dasharray', 'strokeDasharray', 'stroke-dasharray', '[stroke-dasharray=3]||B291', 'stroke-dasharray'],
      ['aria-label', 'ariaLabel', 'aria-label', '[aria-label=3]||B291', 'aria-label'],
    ])('%s and %s are one name with one behaviour', (a, b, attribute, serialized, published) => {
      for (const written of [a, b]) {
        const dsl = render(`[${written}=3]||B291`);
        const js = render('B291', { [written]: 3 });

        expect(dsl.warnings).toEqual([]);
        expect(js.warnings).toEqual([]);
        expect(dsl.svgCode).toBe(js.svgCode);

        if (attribute) expect(dsl.svgCode).toContain(`${attribute}="3"`);
        // A curated option computes and emits nothing of its own name. The
        // second half of the check is what catches a name that was resolved
        // into the bag but never dispatched on: it would ship as markup.
        else expect(dsl.svgCode).not.toMatch(/margin-?[Tt]op=/);

        expect(dsl.toString()).toBe(serialized);
        expect(optionKeys(dsl.toJSON())).toEqual([published]);
        // The options argument reaches the bag through a different ingest site
        // than a bracket does, so it publishes on its own evidence.
        expect(optionKeys(js.toJSON())).toEqual([published]);
      }
    });

    it.each(['data-attr', 'dataAttr', 'myOwnAttr'])('%s is the author\'s, in every column', (name) => {
      // Class 3 keeps two rows in the table where the others collapse to one,
      // because there is nobody to canonicalize to.
      const dsl = render(`[${name}=3]||B291`);
      const js = render('B291', { [name]: 3 });

      expect(dsl.warnings).toEqual([]);
      expect(js.warnings).toEqual([]);
      expect(dsl.svgCode).toBe(js.svgCode);
      expect(dsl.svgCode).toContain(`${name}="3"`);
      expect(dsl.toString()).toBe(`[${name}=3]||B291`);
      expect(optionKeys(dsl.toJSON())).toEqual([name]);
      expect(optionKeys(js.toJSON())).toEqual([name]);
    });
  });

  describe('when the serializer publishes a curated option', () => {
    it('has spellings to test in the derived list', () => {
      // An `it.each` over an empty array generates no rows and reports success,
      // so the derivation is asserted before anything rests on it.
      expect(CURATED_CAMEL_SPELLINGS)
        .toEqual(expect.arrayContaining(['strokeWidth', 'marginTop', 'gridSkyColor', 'svgHeight']));
    });

    it.each(CURATED_CAMEL_SPELLINGS)('publishes %s under that spelling, however it was written', (camel) => {
      const kebab = camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      for (const written of [camel, kebab]) {
        expect(optionKeys(render(`[${written}=1]||B291`).toJSON())).toEqual([camel]);
      }
    });

    it.each(['color', 'grid', 'center', 'text'])('leaves the single-word option %s alone', (name) => {
      // The control that keeps publication about the vocabulary rather than
      // about hyphens: these have one spelling and it is already published.
      expect(optionKeys(render(`[${name}=1]||B291`).toJSON())).toEqual([name]);
    });

    // An options bag sits at four places in published output, and a document-only
    // implementation passes every row above with the other three still storing
    // kebab.
    it.each([
      ['document', '[stroke-width=2]||B291', (json) => json.options],
      ['word', '[stroke-width=2]|B291', (json) => json.groups[0].options],
      ['character', '[stroke-width=2]B291', (json) => json.groups[0].glyphs[0].options],
      ['part', '[stroke-width=2]>B291;B81', (json) => json.groups[0].glyphs[0].parts[0].options],
    ])('publishes a %s-scope bag', (_scope, input, bagOf) => {
      const b = render(input);
      expect(b.warnings).toEqual([]);
      expect(Object.keys(bagOf(b.toJSON()))).toEqual(['strokeWidth']);
    });
  });

  describe('what publication must not touch', () => {
    it.each([
      ['stroke-dasharray', 'stroke-dasharray'],
      ['strokeDasharray', 'stroke-dasharray'],
      ['aria-label', 'aria-label'],
      ['ariaLabel', 'aria-label'],
      ['view-box', 'viewBox'],
    ])('publishes %s under its owner\'s spelling, not ours', (written, owner) => {
      // A standard owns its names in a fixed spelling, and the library's house
      // style has no standing to rewrite them. A rule keyed on hyphens rather
      // than on the vocabulary turns all three of these into camelCase.
      expect(optionKeys(render(`[${written}=3]||B291`).toJSON())).toEqual([owner]);
    });

    it.each(['root--stroke-width', 'root--strokeWidth', 'text--stroke-width'])(
      'leaves the layer key %s exactly as written', (key) => {
        // A `<target>--name` key means its attribute literally, which is the one
        // way to demand a name the library would otherwise resolve. Stripping
        // the prefix off `root--stroke-width` and publishing the remainder would
        // rewrite a layer key into the library's own spelling.
        expect(optionKeys(render(`[${key}=3]||B291`).toJSON())).toEqual([key]);
      });

    it('leaves a hyphenated name of the author\'s alone, through the object channel', () => {
      // The carrier was `x` until a position stopped being kept in the bag at
      // all. A hyphenated name that belongs to nobody is the sharper
      // replacement: it is the shape a rule keyed on hyphens rather than on the
      // vocabulary would rewrite, and the author's names covered elsewhere are
      // either camelCase or `data-` prefixed, which such a rule could spare.
      expect(optionKeys(render('B291', { 'my-own-attr': 5 }).toJSON())).toEqual(['my-own-attr']);
    });

    it.each([
      ['[margin-top=1;data-a=2]||B291', ['marginTop', 'data-a']],
      ['[data-a=2;margin-top=1]||B291', ['data-a', 'marginTop']],
    ])('keeps %s in the order it was written', (input, expected) => {
      // Bag order is the order the attributes are emitted in, so a publication
      // that reorders repaints the SVG the moment its own output is read back:
      // `data-a="1" data-b="2"` and the reverse are different bytes. The
      // round-trip rows below catch that only through byte equality, which pins
      // it by accident rather than by claim. Renaming a key must therefore leave
      // it where it was, which is why one curated name shares each bag with one
      // of the author's.
      expect(Object.keys(render(input).toJSON().options)).toEqual(expected);
    });

    it('keeps the stored spelling in deep output', () => {
      // Deep output feeds `toString()` and `merge()`, which re-ingest it as DSL
      // text and as a raw tree. Publishing there moves the DSL serializer with
      // it, and the contract gives the two serializers different columns.
      const b = render('[margin-top=3]||[stroke-width=2]|[color=red]B291');
      const deep = b.toJSON({ deep: true });
      expect(Object.keys(deep.options)).toEqual(['margin-top']);
      expect(Object.keys(deep.groups[0].options)).toEqual(['stroke-width']);
      expect(b.toString()).toBe('[margin-top=3]||[stroke-width=2]|[color=red]B291');
    });
  });

  describe('when published output is read back', () => {
    it.each([
      ['class 1', '[margin-top=3]||[stroke-width=2]|B291'],
      ['class 2', '[viewBox=0 0 9 9;aria-label=x]||B291'],
      ['class 3', '[dataAttr=1;data-attr=2]||B291'],
      ['class 4', '[root--stroke-width=3]||B291'],
    ])('re-ingests %s to the same picture, and republishes it unchanged', (_klass, input) => {
      const original = render(input);
      const published = original.toJSON();
      const reingested = new BlissSVGBuilder(published);

      expect(reingested.warnings).toEqual([]);
      expect(reingested.svgCode).toBe(original.svgCode);
      // Publication has to be a fixed point, not merely accepted: a transform
      // that moved a name a second time would pass the picture check on the
      // first pass and drift on every one after it.
      expect(reingested.toJSON()).toEqual(published);
    });
  });

  describe('kerning, the name whose storage differs by route', () => {
    it('publishes the same spelling from both routes', () => {
      // A bracket is promoted onto the glyph under the camelCase spelling; the
      // handle setter stores the kebab one it resolved on the way in. They are
      // one curated name, so they publish alike. (The kebab carrier used to be
      // the options argument at document scope, which kerning is now refused
      // at, see `BlissSVGBuilder.option-scope-admission.test.js`.)
      const bracket = render('[relative-kerning=3]B291');
      const setter = render('B291');
      setter.glyph(0).setOptions({ relativeKerning: 3 });

      expect(Object.keys(bracket.toJSON().groups[0].glyphs[0].options)).toEqual(['relativeKerning']);
      expect(Object.keys(setter.toJSON().groups[0].glyphs[0].options)).toEqual(['relativeKerning']);
    });
  });
});
