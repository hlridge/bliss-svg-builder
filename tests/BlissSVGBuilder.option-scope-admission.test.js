/**
 * Pins that an option key written at a scope it cannot act on is reported and
 * dropped by whichever route it arrived through, exactly as a DSL bracket does.
 *
 * Three families of key are bound to one scope: the canvas-wide keys (global
 * only, `MISPLACED_GLOBAL_OPTION`), the two kerning keys (character only,
 * `MISPLACED_KERNING_OPTION`) and a target-prefixed key (global only,
 * `MISPLACED_LAYER_OPTION`). The bracket has refused them for a long time; the
 * other routes kept the key, said nothing, and wrote it back out through
 * `toString()`, so the same composition reported nothing until it was saved
 * and reloaded.
 *
 * Covers:
 * - Every route that saves what it is given: a composition object's bags at
 *   each level, the constructor's options argument, `setOptions` on a word, a
 *   character and a part, and the `opts` argument of `addGlyph`, `addPart`,
 *   `replace` and the builder's `addGroup`. Each reports once and leaves the
 *   key out of `toString()` and `toJSON()`.
 * - The transient channel at element scope, for the two families it can carry.
 * - The report outliving a later mutation, on both warning channels.
 * - A saved string that reloads clean and draws the same picture.
 * - A key that is wrong twice over (misplaced, and a value with no text form)
 *   reported once, as misplaced.
 * - What must not change: each key at its home scope, the other keys in the
 *   same bag, an unrecognized key passing through, and kerning in a transient
 *   bag, which the transient channel refuses at every scope, the builder's
 *   included, in its own words.
 *
 * Does NOT cover:
 * - What the report says, on each route and at each level, see
 *   `BlissSVGBuilder.option-scope-wording.test.js`.
 * - The bracket's own refusals, see
 *   `BlissSVGBuilder.layer-attributes.test.js`, `BlissParser.kerning.test.js`
 *   and the space-scope rows in `BlissSVGBuilder.space-decoration.test.js`.
 * - A definition's `defaultOptions`, which refuse a canvas or layer key as a
 *   definition error rather than a warning, see
 *   `BlissParser.global-option-scope.test.js`.
 * - A bracket inside a code string handed to an API method (`addPart('[margin=2]>B97')`,
 *   a `;;` overlay), which the parser reads, see
 *   `ElementHandle.mutation-parse-warnings.test.js`.
 * - That no route resolves a scope for itself, see
 *   `BlissSVGBuilder.option-admission-drift.test.js`.
 * - What becomes of a refused VALUE, see
 *   `BlissSVGBuilder.refused-value-retention.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

// Built from a real toJSON() rather than written by hand: a glyph literal
// without `parts` serializes to its code but renders as an unknown one.
const bagAt = (scope, options, codeString = 'B291') => {
  const json = new BlissSVGBuilder(codeString).toJSON();
  const glyph = json.groups[0].glyphs[0];
  ({ composition: json, word: json.groups[0], character: glyph, part: glyph.parts[0] })[scope]
    .options = options;
  return json;
};

const transientAt = (scope, options) => {
  const json = new BlissSVGBuilder('B291').toJSON();
  const glyph = json.groups[0].glyphs[0];
  ({ word: json.groups[0], character: glyph, part: glyph.parts[0] })[scope].transientOptions = options;
  return json;
};

const afterMutating = (codeString, mutate) => {
  const builder = new BlissSVGBuilder(codeString);
  mutate(builder);
  return builder;
};

const codes = (builder) => builder.warnings.map((w) => w.code);
const bothSaves = (builder) => `${builder.toString()} ${JSON.stringify(builder.toJSON())}`;

const KERNING = ['MISPLACED_KERNING_OPTION', /relative-?kerning/i];
const CANVAS = ['MISPLACED_GLOBAL_OPTION', /margin-?top/i];
const LAYER = ['MISPLACED_LAYER_OPTION', /content--fill/];

// Each family at every scope it is foreign to, and each handle level, so a
// route that tells the stage the wrong level lets at least one row through.
const SAVED_ROUTES = [
  ['a word bag in a composition object', () => new BlissSVGBuilder(bagAt('word', { 'relative-kerning': 3 })), KERNING],
  ['the document bag in a composition object', () => new BlissSVGBuilder(bagAt('composition', { relativeKerning: 3 })), KERNING],
  ['a part bag in a composition object', () => new BlissSVGBuilder(bagAt('part', { relativeKerning: 3 })), KERNING],
  ['a character bag in a composition object', () => new BlissSVGBuilder(bagAt('character', { marginTop: 3 })), CANVAS],
  ['a word bag in a composition object, canvas-wide', () => new BlissSVGBuilder(bagAt('word', { 'margin-top': 3 })), CANVAS],
  ['a part bag in a composition object, target-prefixed', () => new BlissSVGBuilder(bagAt('part', { 'content--fill': 'red' })), LAYER],
  ['the constructor options argument', () => new BlissSVGBuilder('B291', { relativeKerning: 3 }), KERNING],
  ['setOptions on a word', () => afterMutating('B291', (b) => b.group(0).setOptions({ 'relative-kerning': 3 })), KERNING],
  ['setOptions on a part', () => afterMutating('B291', (b) => b.group(0).glyph(0).part(0).setOptions({ relativeKerning: 3 })), KERNING],
  ['setOptions on a character', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ marginTop: 3 })), CANVAS],
  ['setOptions on a part, target-prefixed', () => afterMutating('B291', (b) => b.group(0).glyph(0).part(0).setOptions({ 'content--fill': 'red' })), LAYER],
  ['the options of addGlyph', () => afterMutating('B291', (b) => b.group(0).addGlyph('B313', { marginTop: 3 })), CANVAS],
  ['the options of addPart', () => afterMutating('B291', (b) => b.group(0).glyph(0).addPart('B81', { 'relative-kerning': 3 })), KERNING],
  ['the options of replace', () => afterMutating('B291', (b) => b.group(0).glyph(0).replace('B313', { marginTop: 3 })), CANVAS],
  ['the options of the builder addGroup', () => afterMutating('B291', (b) => b.addGroup('B313', { 'relative-kerning': 3 })), KERNING],
];

describe('BlissSVGBuilder option scope admission', () => {
  describe('when a key arrives at a scope it cannot act on, through a route that saves it', () => {
    it.each(SAVED_ROUTES)('reports it once, in the code a bracket uses, through %s', (_route, build, [code]) => {
      expect(codes(build())).toEqual([code]);
    });

    it.each(SAVED_ROUTES)('leaves it out of both saves, through %s', (_route, build, [, spelled]) => {
      expect(bothSaves(build())).not.toMatch(spelled);
    });
  });

  describe('when the composition is saved and reloaded', () => {
    it.each([
      ['a composition object', () => new BlissSVGBuilder(bagAt('character', { marginTop: 3 }))],
      ['setOptions', () => afterMutating('B291', (b) => b.group(0).setOptions({ 'relative-kerning': 3 }))],
    ])('reloads from its string with nothing to report and the same picture, through %s', (_route, build) => {
      const builder = build();
      const reloaded = new BlissSVGBuilder(builder.toString());

      // regression: the reload used to be the FIRST place the key was
      // reported, so one composition warned or not depending on a save
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the composition changes after the key was refused', () => {
    it('still reports a refusal made while the composition object was read', () => {
      const builder = new BlissSVGBuilder(bagAt('character', { marginTop: 3 }));
      builder.group(0).glyph(0).setOptions({ color: 'red' });

      expect(codes(builder)).toEqual(['MISPLACED_GLOBAL_OPTION']);
    });

    it('still reports a refusal made by a setter', () => {
      const builder = afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ marginTop: 3 }));
      builder.group(0).glyph(0).setOptions({ color: 'red' });

      expect(codes(builder)).toEqual(['MISPLACED_GLOBAL_OPTION']);
    });
  });

  describe('when the key is misplaced and its value has no text form as well', () => {
    it('reports it once, as misplaced, since no value would act at that scope', () => {
      const builder = new BlissSVGBuilder(bagAt('character', { 'margin-top': null }));

      expect(codes(builder)).toEqual(['MISPLACED_GLOBAL_OPTION']);
    });
  });

  describe('when the key sits in a transient bag', () => {
    it.each([
      ['a target-prefixed key set on a character', (b) => b.group(0).glyph(0).setTransientOptions({ 'content--fill': 'red' }), 'MISPLACED_LAYER_OPTION'],
      ['a canvas-wide key set on a character', (b) => b.group(0).glyph(0).setTransientOptions({ marginTop: 3 }), 'MISPLACED_GLOBAL_OPTION'],
      ['a canvas-wide key set on a word', (b) => b.group(0).setTransientOptions({ 'margin-top': 3 }), 'MISPLACED_GLOBAL_OPTION'],
    ])('reports %s', (_what, mutate, code) => {
      expect(codes(afterMutating('B291', mutate))).toEqual([code]);
    });

    it('reports a target-prefixed key in a character transient bag of a composition object', () => {
      const builder = new BlissSVGBuilder(transientAt('character', { 'content--fill': 'red' }));

      expect(codes(builder)).toEqual(['MISPLACED_LAYER_OPTION']);
    });

    it.each([
      ['the builder', (b) => b.setTransientOptions({ relativeKerning: 3 })],
      ['a word', (b) => b.group(0).setTransientOptions({ 'relative-kerning': 3 })],
      ['a character', (b) => b.group(0).glyph(0).setTransientOptions({ relativeKerning: 3 })],
      ['a part', (b) => b.group(0).glyph(0).part(0).setTransientOptions({ 'relative-kerning': 3 })],
    ])('leaves kerning to the transient refusal on %s, which names the real problem', (_scope, mutate) => {
      // note: kerning cannot be transient at ANY scope, so pointing the
      // caller at a character would only send them to a second refusal
      expect(codes(afterMutating('B291', mutate))).toEqual(['MISPLACED_TRANSIENT_OPTION']);
    });
  });

  describe('when each key is written at its home scope', () => {
    it.each([
      ['kerning in a character bag of a composition object', () => {
        const json = new BlissSVGBuilder('B291/B291').toJSON();
        json.groups[0].glyphs[1].options = { 'relative-kerning': 3 };
        return new BlissSVGBuilder(json);
      }, 'B291/RK:3/B291'],
      ['kerning set on a character', () => afterMutating('B291/B291', (b) => b.group(0).glyph(1).setOptions({ relativeKerning: 3 })), 'B291/RK:3/B291'],
      ['kerning in the options of addGlyph', () => afterMutating('B291', (b) => b.group(0).addGlyph('B313', { relativeKerning: 3 })), 'B291/RK:3/B313'],
      ['a canvas-wide key in the document bag of a composition object', () => new BlissSVGBuilder(bagAt('composition', { marginTop: 3 })), '[margin-top=3]||B291'],
      ['a canvas-wide key in the constructor options argument', () => new BlissSVGBuilder('B291', { marginTop: 3 }), '[margin-top=3]||B291'],
      ['a target-prefixed key in the document bag of a composition object', () => new BlissSVGBuilder(bagAt('composition', { 'content--fill': 'red' })), '[content--fill=red]||B291'],
    ])('keeps %s and reports nothing', (_what, build, saved) => {
      const builder = build();

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(saved);
    });

    it('leaves a canvas-wide transient key on the builder alone', () => {
      const builder = afterMutating('B291', (b) => b.setTransientOptions({ 'content--fill': 'red', marginTop: 3 }));

      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when a misplaced key shares its bag with keys that belong there', () => {
    it('keeps the other key', () => {
      const builder = new BlissSVGBuilder(bagAt('character', { marginTop: 3, color: 'red' }));

      expect(builder.toString()).toContain('color=red');
    });

    it('still passes an unrecognized key through as an attribute, silently', () => {
      const builder = new BlissSVGBuilder(bagAt('character', { 'data-foo': 'bar' }));

      expect(builder.svgCode).toContain('data-foo="bar"');
      expect(builder.warnings).toEqual([]);
    });
  });
});
