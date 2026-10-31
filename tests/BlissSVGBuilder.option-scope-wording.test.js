/**
 * Pins what the report says when an option key is refused for its scope: the
 * same first sentence on every route, and a second sentence that sends the key
 * to its home in the notation the author was writing.
 *
 * A report is two sentences. The first (the diagnosis) names the key, the
 * level it was written at and why it cannot act there, and is identical
 * whether the key arrived in a bracket, a composition object or a JavaScript
 * call. The second (the fix) is `Use [key=value]||` for a bracket, the
 * composition's top-level options for an object, `builder.setOptions()` for a
 * call, `builder.setTransientOptions()` for a transient call, and for kerning
 * off the DSL the character's options, with no `RK:`/`AK:` marker offered.
 *
 * Covers:
 * - Parity with the bracket in code, `source` and diagnosis, one key per
 *   family, on the composition-object and setter routes, plus one misplaced
 *   key written in both spellings (reported twice, in written order, and never
 *   as a spelling collision).
 * - The fix sentence in each notation, including a transient bag inside a
 *   composition object.
 * - The bracket's full wording at each of the five places the parser hands a
 *   bracket to the admission stage, unchanged from before the other routes
 *   were gated.
 * - The level each adding and replacing method reports, one row per place a
 *   method names the level of the element it builds.
 *
 * Does NOT cover:
 * - Whether a key is refused at all, on which route, and what is saved, see
 *   `BlissSVGBuilder.option-scope-admission.test.js`.
 * - Which keys each scope refuses in a bracket, see
 *   `BlissParser.global-option-scope.test.js`, `BlissParser.kerning.test.js`
 *   and `BlissSVGBuilder.layer-attributes.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

// Built from a real toJSON() rather than written by hand: a glyph literal
// without `parts` serializes to its code but renders as an unknown one.
const bagAt = (scope, options) => {
  const json = new BlissSVGBuilder('B291').toJSON();
  const glyph = json.groups[0].glyphs[0];
  ({ composition: json, word: json.groups[0], character: glyph, part: glyph.parts[0] })[scope]
    .options = options;
  return json;
};

const transientAtCharacter = (options) => {
  const json = new BlissSVGBuilder('B291').toJSON();
  json.groups[0].glyphs[0].transientOptions = options;
  return json;
};

const afterMutating = (codeString, mutate) => {
  const builder = new BlissSVGBuilder(codeString);
  mutate(builder);
  return builder;
};

const messages = (builder) => builder.warnings.map((w) => w.message);

// The first sentence of each report, with the fields every route shares.
const diagnosed = (builder) =>
  builder.warnings.map(({ code, source, message }) => ({ code, source, diagnosis: message.split('. ')[0] }));

describe('BlissSVGBuilder option scope wording', () => {
  describe('when the same key reaches the same scope through a bracket', () => {
    it.each([
      ['a composition object', '[margin-top=3]B291', () => new BlissSVGBuilder(bagAt('character', { marginTop: 3 }))],
      ['setOptions', '[margin-top=3]B291', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ marginTop: 3 }))],
      ['a composition object', '[relative-kerning=3]|B291', () => new BlissSVGBuilder(bagAt('word', { relativeKerning: 3 }))],
      ['setOptions', '[relative-kerning=3]|B291', () => afterMutating('B291', (b) => b.group(0).setOptions({ relativeKerning: 3 }))],
      ['a composition object', '[content--fill=red]>B291', () => new BlissSVGBuilder(bagAt('part', { 'content--fill': 'red' }))],
      ['setOptions', '[content--fill=red]>B291', () => afterMutating('B291', (b) => b.group(0).glyph(0).part(0).setOptions({ 'content--fill': 'red' }))],
      // One misplaced key in both spellings: each is refused, and neither is
      // named as displacing the other, in the same order on every route.
      ['a composition object', '[marginTop=1;margin-top=2]B291', () => new BlissSVGBuilder(bagAt('character', { marginTop: 1, 'margin-top': 2 }))],
      ['setOptions', '[marginTop=1;margin-top=2]B291', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ marginTop: 1, 'margin-top': 2 }))],
    ])('reports what the bracket reports, in code, source and diagnosis, through %s, for %s', (_route, bracket, build) => {
      expect(diagnosed(build())).toEqual(diagnosed(new BlissSVGBuilder(bracket)));
    });
  });

  describe('when the report says where the key belongs', () => {
    it.each([
      ['a composition object', () => new BlissSVGBuilder(bagAt('character', { marginTop: 3 })),
        "Global option (margin-top=3) ignored at character level: it configures the whole SVG. Put it in the composition's top-level options to apply it globally."],
      ['a transient bag in a composition object', () => new BlissSVGBuilder(transientAtCharacter({ 'content--fill': 'red' })),
        "Layer option (content--fill=red) ignored at character level: it names a layer of the whole SVG. Put it in the composition's top-level transientOptions to apply it, or write the attribute without a layer prefix to put it on this element."],
      ['setOptions', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ marginTop: 3 })),
        'Global option (margin-top=3) ignored at character level: it configures the whole SVG. Pass it to builder.setOptions() to apply it globally.'],
      ['the builder addGroup', () => afterMutating('B291', (b) => b.addGroup('B313', { marginTop: 3 })),
        'Global option (margin-top=3) ignored at group level: it configures the whole SVG. Pass it to builder.setOptions() to apply it globally.'],
      ['setOptions, for a layer key', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ 'content--fill': 'red' })),
        'Layer option (content--fill=red) ignored at character level: it names a layer of the whole SVG. Pass it to builder.setOptions() to apply it, or write the attribute without a layer prefix to put it on this element.'],
      ['setTransientOptions', () => afterMutating('B291', (b) => b.group(0).glyph(0).setTransientOptions({ marginTop: 3 })),
        'Global option (margin-top=3) ignored at character level: it configures the whole SVG. Pass it to builder.setTransientOptions() to apply it globally.'],
    ])('names the whole-SVG home in the notation of %s', (_route, build, message) => {
      expect(messages(build())).toEqual([message]);
    });

    // One row per place the parser hands a bracket to the stage, so each keeps
    // the bracket's wording, which is unchanged from before the other routes
    // were gated.
    it.each([
      ['[relative-kerning=3]||B291', 'Kerning option (relative-kerning=3) ignored at global level: kerning is the gap before a character. Write it on the character, or use the RK:/AK: marker before it.'],
      ['[relative-kerning=3]|B291', 'Kerning option (relative-kerning=3) ignored at group level: kerning is the gap before a character. Write it on the character, or use the RK:/AK: marker before it.'],
      ['[margin-top=3]B291', 'Global option (margin-top=3) ignored at character level: it configures the whole SVG. Use [margin-top=3]|| to apply it globally.'],
      ['[content--fill=red]>B291', 'Layer option (content--fill=red) ignored at part level: it names a layer of the whole SVG. Use [content--fill=red]|| to apply it, or write the attribute without a layer prefix to put it on this element.'],
      ['B291;;[margin-top=3]>B81', 'Global option (margin-top=3) ignored at part level: it configures the whole SVG. Use [margin-top=3]|| to apply it globally.'],
    ])('keeps the bracket its own wording in %s', (input, message) => {
      expect(messages(new BlissSVGBuilder(input))).toEqual([message]);
    });

    it.each([
      ['setOptions on a word', () => afterMutating('B291', (b) => b.group(0).setOptions({ relativeKerning: 3 })), 'group'],
      ['the builder\'s setOptions', () => afterMutating('B291', (b) => b.setOptions({ relativeKerning: 3 })), 'global'],
      ['the document bag of a composition object', () => new BlissSVGBuilder(bagAt('composition', { relativeKerning: 3 })), 'global'],
    ])('sends kerning to the character with no code-string marker, through %s', (_route, build, level) => {
      expect(messages(build())).toEqual([
        `Kerning option (relative-kerning=3) ignored at ${level} level: kerning is the gap before a character. Set it on the character's options.`,
      ]);
    });
  });

  describe('when an adding or replacing method writes a new element', () => {
    // One row per place a method names the level of the element it builds, so
    // a method that names the wrong one reports the wrong level, or nothing.
    it.each([
      ['addGlyph', (b) => b.group(0).addGlyph('B313', { marginTop: 3 }), 'character'],
      ['insertGlyph', (b) => b.group(0).insertGlyph(0, 'B313', { marginTop: 3 }), 'character'],
      ['replaceGlyph', (b) => b.group(0).replaceGlyph(0, 'B313', { marginTop: 3 }), 'character'],
      ['replace on a character', (b) => b.group(0).glyph(0).replace('B313', { marginTop: 3 }), 'character'],
      ['addPart', (b) => b.group(0).glyph(0).addPart('H', { marginTop: 3 }), 'part'],
      ['insertPart', (b) => b.group(0).glyph(0).insertPart(0, 'H', { marginTop: 3 }), 'part'],
      ['replacePart', (b) => b.group(0).glyph(0).replacePart(0, 'H', { marginTop: 3 }), 'part'],
      ['replace on a part', (b) => b.group(0).glyph(0).part(0).replace('H', { marginTop: 3 }), 'part'],
      ['addPart on an empty word', (b) => b.addGroup().group(1).addPart('H', { marginTop: 3 }), 'part'],
      ['the builder addGroup', (b) => b.addGroup('B313', { marginTop: 3 }), 'group'],
    ])('judges the key at the level of that element, through %s', (_method, mutate, level) => {
      expect(diagnosed(afterMutating('B291', mutate))).toEqual([{
        code: 'MISPLACED_GLOBAL_OPTION',
        source: 'margin-top=3',
        diagnosis: `Global option (margin-top=3) ignored at ${level} level: it configures the whole SVG`,
      }]);
    });
  });
});
