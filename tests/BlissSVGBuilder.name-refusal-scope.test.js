/**
 * Pins that a key's NAME is judged where the key would act: a target-prefixed
 * key the global form refuses by name earns that refusal wherever it is
 * written, and the library's own stamp is refused only where the root reads it.
 *
 * A target-prefixed key acts only at global scope, so written lower it is
 * dropped. When its name is one the global form refuses as well (an event
 * handler, `xmlns`, the root's stamp, a target that does not exist), the report
 * is that refusal, not `MISPLACED_LAYER_OPTION`: advice to move the key to the
 * global bracket only led the author to the refusal it never named.
 *
 * Covers:
 * - Each reason a name is refused, at word, character and part level in a
 *   bracket: the same code, `source` and message as the global form, except
 *   that an unknown target's closing advice names this element, not the root.
 * - The key dropped from the markup and from both saves, and the other keys in
 *   its bracket kept.
 * - The JavaScript routes: a composition object's bags, `setOptions`, the
 *   options of an adding method, a transient bag and `merge()`.
 * - A bracket the parser reads for an API call, and one on a `;;` overlay code,
 *   whose stored text loses the key.
 * - The keys that stay misplaced because the global form emits them, and the
 *   global form's own wording unchanged.
 * - The library's stamp, `data-generator`, below the root and behind any other
 *   target: an ordinary name whose value is judged like any other.
 *
 * Does NOT cover:
 * - What the global form refuses and why, see
 *   `BlissSVGBuilder.layer-attribute-refusals.test.js` and
 *   `BlissSVGBuilder.unsafe-attribute-names.test.js`.
 * - A target-prefixed key with a usable name written below global scope, see
 *   `BlissSVGBuilder.layer-attributes.test.js`, and the wording of that
 *   report in each notation, see `BlissSVGBuilder.option-scope-wording.test.js`.
 * - The stamp refused on the root, and a name refused while its value is
 *   wrong as well, see `BlissSVGBuilder.text-option-values.test.js`.
 * - A value with no text form on a refused name through the JavaScript
 *   channels, an open 1.1.0 backlog row whose acceptance criteria are the
 *   `it.todo` rows at the end of this file.
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

// Composition objects carrying a value the DSL cannot write, at the two levels
// where the stamp's two readings differ.
const atDocument = (options) => ({ options, groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }] });
const atCharacter = (options) => ({ groups: [{ glyphs: [{ codeName: 'B291', options, parts: [{ codeName: 'B291' }] }] }] });

const afterMutating = (codeString, mutate) => {
  const builder = new BlissSVGBuilder(codeString);
  mutate(builder);
  return builder;
};

const reports = (builder) => builder.warnings.map(({ code, source, message }) => ({ code, source, message }));
const codes = (builder) => builder.warnings.map((w) => w.code);
const globalForm = (key) => reports(new BlissSVGBuilder(`[${key}=x]||B291`));

// A bare attribute written below global scope lands on the element it is
// written on, so the one sentence of the global wording that names the root
// names this element instead.
const belowGlobal = (report) => ({ ...report, message: report.message.replace('put it on the root.', 'put it on this element.') });

const saves = (builder) => `${builder.toString()} ${JSON.stringify(builder.toJSON())}`;

// One row per reason the global form refuses a name, the reason first.
const REFUSED_NAMES = [
  ['an event handler', 'content--onclick', 'UNSAFE_ATTRIBUTE_NAME'],
  ['an event handler behind a sub-element target', 'grid-line--sky--onclick', 'UNSAFE_ATTRIBUTE_NAME'],
  ['the namespace declaration', 'content--xmlns', 'RESERVED_ATTRIBUTE_NAME'],
  ["the library's stamp behind the root prefix", 'root--data-generator', 'RESERVED_ATTRIBUTE_NAME'],
  ['a target the library does not know', 'nosuch--fill', 'UNKNOWN_LAYER'],
  ['an empty target', '--fill', 'UNKNOWN_LAYER'],
  ['a target with no attribute after it', 'content--', 'UNKNOWN_LAYER'],
];

const SITES = [['word', '|B291'], ['character', 'B291'], ['part', '>B291']];

const AT_EVERY_SITE = REFUSED_NAMES.flatMap(([why, key, code]) =>
  SITES.map(([level, site]) => [why, level, key, code, site]));

describe('BlissSVGBuilder name refusal scope', () => {
  describe('when a target-prefixed key the global form refuses by name is written below global scope', () => {
    it.each(AT_EVERY_SITE)('reports %s at %s level as the global form does', (_why, _level, key, code, site) => {
      const builder = new BlissSVGBuilder(`[${key}=x]${site}`);

      expect(codes(builder)).toEqual([code]);
      expect(reports(builder)).toEqual(globalForm(key).map(belowGlobal));
    });

    it.each(REFUSED_NAMES)('drops %s from the markup and from both saves', (_why, key) => {
      const builder = new BlissSVGBuilder(`[${key}=x]B291`);

      expect(builder.svgCode).not.toContain(key);
      expect(builder.svgCode).not.toContain('="x"');
      expect(saves(builder)).not.toContain(key);
      expect(builder.toString()).toBe('B291');
    });

    it('keeps the other keys written in the same bracket', () => {
      const builder = new BlissSVGBuilder('[content--onclick=x;fill=red]B291');

      expect(builder.toString()).toBe('[fill=red]B291');
      expect(builder.svgCode).toContain('fill="red"');
    });

    it('closes an unknown target with advice that is true where it was written', () => {
      // note: the global wording sends a bare attribute to the root, which is
      // where it lands only when written in the global bracket
      const [report] = reports(new BlissSVGBuilder('[nosuch--fill=x]B291'));

      expect(report.message).toMatch(/Write the attribute with no prefix to put it on this element\.$/);
      expect(globalForm('nosuch--fill')[0].message).toMatch(/Write the attribute with no prefix to put it on the root\.$/);
    });
  });

  describe('when the key arrives through a JavaScript route', () => {
    it.each([
      ['a word bag in a composition object', 'content--onclick', () => new BlissSVGBuilder(bagAt('word', { 'content--onclick': 'x' }))],
      ['a character bag in a composition object', 'content--xmlns', () => new BlissSVGBuilder(bagAt('character', { 'content--xmlns': 'x' }))],
      ['a part bag in a composition object', 'nosuch--fill', () => new BlissSVGBuilder(bagAt('part', { 'nosuch--fill': 'x' }))],
      ['setOptions on a character', 'root--data-generator', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ 'root--data-generator': 'x' }))],
      ['setOptions on a part', '--fill', () => afterMutating('B291', (b) => b.group(0).glyph(0).part(0).setOptions({ '--fill': 'x' }))],
      ['the options of addGlyph', 'content--onclick', () => afterMutating('B291', (b) => b.group(0).addGlyph('B313', { 'content--onclick': 'x' }))],
      ['a transient bag on a character', 'nosuch--fill', () => afterMutating('B291', (b) => b.group(0).glyph(0).setTransientOptions({ 'nosuch--fill': 'x' }))],
    ])('reports the global form through %s', (_route, key, build) => {
      const builder = build();

      expect(reports(builder)).toEqual(globalForm(key).map(belowGlobal));
      expect(saves(builder)).not.toContain(key);
    });

    it('reports the global form for saved data handed to merge()', () => {
      const target = new BlissSVGBuilder('B313');
      target.merge({ toJSON: () => bagAt('character', { 'content--onclick': 'x' }) });

      expect(reports(target)).toEqual(globalForm('content--onclick'));
      expect(`${saves(target)} ${target.svgCode}`).not.toContain('onclick');
    });
  });

  describe('when the key sits in a bracket the parser reads for an API call or a ;; overlay', () => {
    it('strips the key from the stored overlay code and reports the global form once', () => {
      // regression guard: the overlay keeps its code text verbatim unless the
      // stage drops a key for its scope, so a refusal it did not recognize as
      // one would re-serialize the dead key on every save
      const builder = new BlissSVGBuilder('B291;;[content--onclick=x]>B99');

      expect(builder.toString()).toBe('B291;;B99');
      expect(reports(builder)).toEqual(globalForm('content--onclick'));
    });

    it('words an unknown target in an overlay code for the part it was written on', () => {
      // the overlay inspection hands the stage its own level; the advice is
      // the one sentence of the report that depends on it
      const builder = new BlissSVGBuilder('B291;;[nosuch--fill=x]>B99');

      expect(builder.toString()).toBe('B291;;B99');
      expect(reports(builder)).toEqual(globalForm('nosuch--fill').map(belowGlobal));
    });

    it('reports the global form for a part added with a bracket', () => {
      const builder = afterMutating('B291', (b) => b.glyph(0).addPart('[content--xmlns=x]>B97'));

      expect(reports(builder)).toEqual(globalForm('content--xmlns'));
      expect(builder.toString()).toBe('B291;B97');
    });
  });

  describe('when the global form emits the name', () => {
    it.each([
      ['an ordinary attribute', 'content--fill'],
      ["the library's stamp on a target other than the root", 'content--data-generator'],
      ['a link attribute, which the global form refuses for what it does and not for its name', 'content--href'],
    ])('keeps reporting %s as misplaced', (_what, key) => {
      const builder = new BlissSVGBuilder(`[${key}=x]B291`);

      expect(codes(builder)).toEqual(['MISPLACED_LAYER_OPTION']);
      expect(builder.warnings[0].source).toBe(`${key}=x`);
    });
  });

  describe("when the library's stamp is written where the root does not read it", () => {
    it.each([
      ['on a word in a composition object', () => new BlissSVGBuilder(bagAt('word', { 'data-generator': null }))],
      ['on a character in a composition object', () => new BlissSVGBuilder(atCharacter({ 'data-generator': null }))],
      ['behind the content prefix in a composition object', () => new BlissSVGBuilder(atDocument({ 'content--data-generator': { a: 1 } }))],
      ['behind the content prefix in the builder options', () => new BlissSVGBuilder('B291', { 'content--data-generator': null })],
      ['on a character through setOptions', () => afterMutating('B291', (b) => b.group(0).glyph(0).setOptions({ 'data-generator': { a: 1 } }))],
      ['behind the content prefix as a transient option', () => afterMutating('B291', (b) => b.setTransientOptions({ 'content--data-generator': [1, 2] }))],
    ])('refuses a value with no text form written %s, as for a name of your own', (_where, build) => {
      // regression: the name judge counted the stamp as refused everywhere, so
      // such a value skipped the value gate and reached the markup as
      // `data-generator="null"`, or vanished with nothing said
      const builder = build();

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.svgCode.match(/data-generator=/g)).toHaveLength(1);
      expect(builder.toString()).not.toContain('data-generator');
    });

    it.each([
      ['written bare at global scope', () => new BlissSVGBuilder(atDocument({ 'data-generator': null }))],
      ['behind the root prefix', () => new BlissSVGBuilder(atDocument({ 'root--data-generator': { a: 1 } }))],
    ])('still refuses the name on the root when %s', (_where, build) => {
      expect(codes(build())).toEqual(['RESERVED_ATTRIBUTE_NAME']);
    });
  });

  // Acceptance criteria for an open 1.1.0 backlog row ("A value with no text
  // form on a refused name is dropped in silence by the JavaScript channels"):
  // today the options argument, the setters and the transient channel drop
  // such a value before any pass can report the name, and an internal-only
  // spelling carries it into the markup.
  describe('when a refused name carries a value with no text form', () => {
    it.todo('reports the name refusal through the builder options, setOptions and setTransientOptions, as a composition object does');
    it.todo('keeps an internal-only spelling with no text value (autoVertical: null) out of the markup and the saved string');
  });
});
