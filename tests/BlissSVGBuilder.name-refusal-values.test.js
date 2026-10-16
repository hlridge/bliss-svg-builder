/**
 * Pins that a value with no text form never enters a composition under any
 * key, and that when the key is refused for its name as well, the author hears
 * about the name, in the words the same key earns holding text.
 *
 * A value with no text form cannot be saved or read back, so the admission
 * stage refuses it whatever the key. Under a name a later pass refuses (an
 * event handler, `xmlns`, the library's stamp on the root, a target that does
 * not exist) the report is that name refusal rather than the value's: told only
 * that `null` is not a text value, an author fixes the value and the key is
 * just as dead. Under a key the transient channel cannot carry, it is that
 * channel's refusal.
 *
 * Covers:
 * - Every route and level against every shape of refused name, with every
 *   value kind the route can carry: the report equal to the one a text value
 *   earns (code, message, source), once, still there after a later edit, and
 *   the markup and both saves as if the key had never been written.
 * - A function or a symbol on a refused name, no longer saved as its source
 *   text, and a bag mixing refused names with an ordinary refused value.
 * - A refused name holding text, kept and reported again on reload.
 * - The two retired crop names (`autoVertical`, `cropCompact`), which name no
 *   option and refuse nothing: a value with no text form is refused there as
 *   on a name of your own.
 * - A definition's `xmlns` default with no text form: reported when the
 *   definition is made, through `define()` and `patchDefinition()`, and gone
 *   from every use. The library's stamp there is a name of your own, since a
 *   definition never sets the root.
 * - Keys refused for what they do rather than for their name, which keep the
 *   value's own refusal.
 *
 * Does NOT cover:
 * - A refused name holding TEXT, see `BlissSVGBuilder.unsafe-attribute-names.test.js`,
 *   `BlissSVGBuilder.layer-attribute-refusals.test.js` and
 *   `BlissSVGBuilder.name-refusal-scope.test.js`.
 * - The transient channel's own wording and a target-prefixed key written on
 *   it, see `BlissSVGBuilder.transient-refusal-values.test.js`.
 * - The switches and the element key, see
 *   `BlissSVGBuilder.refused-value-retention.test.js`.
 * - A composition object holding a function or a symbol, which its copy hands
 *   to the judge of the place it sits in, see
 *   `BlissSVGBuilder.composition-object-copy.test.js`.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

// Built from a real toJSON() rather than written by hand: a glyph literal
// without `parts` serializes to its code but renders as an unknown one.
const compositionWith = (level, options) => {
  const json = new BlissSVGBuilder('B291').toJSON();
  const glyph = json.groups[0].glyphs[0];
  ({ global: json, group: json.groups[0], character: glyph, part: glyph.parts[0] })[level].options = options;
  return json;
};

const compositionWithTransient = (transientOptions) => ({ ...new BlissSVGBuilder('B291').toJSON(), transientOptions });

const afterMutating = (mutate) => {
  const builder = new BlissSVGBuilder('B291');
  mutate(builder);
  return builder;
};

// merge() takes whatever answers toJSON(). A builder from another copy of the
// library answers with whatever that copy kept.
const savedBy = (json) => ({ toJSON: () => structuredClone(json) });

const reports = (builder) => builder.warnings.map(({ code, message, source }) => ({ code, message, source }));
const codes = (builder) => builder.warnings.map((w) => w.code);

// What a value with no text form can be. A composition object is cloned
// before anything is judged, and cloning throws on a function or a symbol (an
// open backlog row); saved data is another builder's toJSON(), which holds
// neither. So the routes that take either carry the first four only.
const OBJECT_KINDS = [['null', null], ['undefined', undefined], ['an object', { a: 1 }], ['a list', [1]]];
const JAVASCRIPT_KINDS = [...OBJECT_KINDS, ['a function', () => 1], ['a symbol', Symbol('s')]];

// [route, the level it writes at, a transient bag, the value kinds it can carry, build(bag)]
const ROUTES = [
  ['a composition object at global scope', 'global', false, OBJECT_KINDS, (bag) => new BlissSVGBuilder(compositionWith('global', bag))],
  ['a composition object on a word', 'group', false, OBJECT_KINDS, (bag) => new BlissSVGBuilder(compositionWith('group', bag))],
  ['a composition object on a character', 'character', false, OBJECT_KINDS, (bag) => new BlissSVGBuilder(compositionWith('character', bag))],
  ['a composition object on a part', 'part', false, OBJECT_KINDS, (bag) => new BlissSVGBuilder(compositionWith('part', bag))],
  ["a composition object's transientOptions", 'global', true, OBJECT_KINDS, (bag) => new BlissSVGBuilder(compositionWithTransient(bag))],
  ['the builder options', 'global', false, JAVASCRIPT_KINDS, (bag) => new BlissSVGBuilder('B291', bag)],
  ["the builder options' defaults", 'global', false, JAVASCRIPT_KINDS, (bag) => new BlissSVGBuilder('B291', { defaults: bag })],
  ['setOptions on a word', 'group', false, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.group(0).setOptions(bag))],
  ['setOptions on a character', 'character', false, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.glyph(0).setOptions(bag))],
  ['setOptions on a part', 'part', false, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.glyph(0).part(0).setOptions(bag))],
  ['the options of addGlyph', 'character', false, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.group(0).addGlyph('B99', bag))],
  ['the options of addGroup', 'group', false, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.addGroup('B99', bag))],
  ['saved data handed to merge() on a word', 'group', false, OBJECT_KINDS, (bag) => afterMutating((b) => b.merge(savedBy(compositionWith('group', bag))))],
  ['saved data handed to merge() on a character', 'character', false, OBJECT_KINDS, (bag) => afterMutating((b) => b.merge(savedBy(compositionWith('character', bag))))],
  ['saved data handed to merge() on a part', 'part', false, OBJECT_KINDS, (bag) => afterMutating((b) => b.merge(savedBy(compositionWith('part', bag))))],
  ['setTransientOptions on the builder', 'global', true, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.setTransientOptions(bag))],
  ['setTransientOptions on a character', 'character', true, JAVASCRIPT_KINDS, (bag) => afterMutating((b) => b.glyph(0).setTransientOptions(bag))],
];

// [key, the report its name earns holding text, where it earns it]. One row
// per shape a judge refuses: an unsafe bare name, the namespace declaration in
// two casings, the library's stamp (refused on the root alone), a target
// whose attribute is refused or which does not exist, and the keys the
// transient channel cannot carry.
const REFUSED_KEYS = [
  ['onclick', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['onClick', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['a b', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['xmlns:xlink', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  // pins the bags each route builds having no prototype: assigned on a plain
  // object, `__proto__` holding text is swallowed and nothing reports it
  ['__proto__', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['xmlns', 'RESERVED_ATTRIBUTE_NAME', 'everywhere'],
  ['XMLNS', 'RESERVED_ATTRIBUTE_NAME', 'everywhere'],
  ['data-generator', 'RESERVED_ATTRIBUTE_NAME', 'at global scope'],
  ['DATA-GENERATOR', 'RESERVED_ATTRIBUTE_NAME', 'at global scope'],
  ['root--data-generator', 'RESERVED_ATTRIBUTE_NAME', 'everywhere'],
  ['content--xmlns', 'RESERVED_ATTRIBUTE_NAME', 'everywhere'],
  ['content--onclick', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['grid-line--sky--onclick', 'UNSAFE_ATTRIBUTE_NAME', 'everywhere'],
  ['nosuch--fill', 'UNKNOWN_LAYER', 'everywhere'],
  ['root--', 'UNKNOWN_LAYER', 'everywhere'],
  // pins the target judged before the attribute: judged whole, `--x` is an
  // unsafe name and would report UNSAFE_ATTRIBUTE_NAME
  ['--x', 'UNKNOWN_LAYER', 'everywhere'],
  ['x', 'MISPLACED_TRANSIENT_OPTION', 'in a transient bag'],
  ['y', 'MISPLACED_TRANSIENT_OPTION', 'in a transient bag'],
  ['key', 'MISPLACED_TRANSIENT_OPTION', 'in a transient bag'],
  ['relativeKerning', 'MISPLACED_TRANSIENT_OPTION', 'in a transient bag'],
  ['absolute-kerning', 'MISPLACED_TRANSIENT_OPTION', 'in a transient bag'],
];

const reaches = (where, [, level, transient]) => where === 'everywhere'
  || (where === 'at global scope' && level === 'global')
  || (where === 'in a transient bag' && transient);

const PAIRS = REFUSED_KEYS.flatMap(([key, code, where]) => ROUTES
  .filter((route) => reaches(where, route))
  .map(([route, , , kinds, build]) => [key, route, code, kinds, build]));

// The report a definition's `xmlns` default earns, prefixed with its code.
const xmlnsRefusal = (code) => ({
  code: 'RESERVED_ATTRIBUTE_NAME',
  message: `"${code}": "xmlns" declares what the file is rather than anything about the picture, `
    + 'and a second declaration moves everything under it out of SVG, where no renderer draws it, '
    + 'so the written value was refused.',
  source: 'xmlns',
});

describe('BlissSVGBuilder name refusal values', () => {
  describe('when a refused name carries a value with no text form', () => {
    it('derives one row for each route that refuses each key', () => {
      // The 14 keys refused at every level through all 17 routes, the stamp's
      // 2 casings through the 5 at global scope, the 5 transient keys through
      // the 3 transient bags: 14 x 17 + 2 x 5 + 5 x 3. Stops the derivation
      // going vacuous in silence.
      expect(PAIRS).toHaveLength(263);
    });

    it.each(PAIRS)('reports %s written through %s for its name, as for a text value', (key, _route, code, kinds, build) => {
      const control = build({ [key]: 'x' });
      const empty = build({});
      expect(codes(control)).toEqual([code]);

      for (const [kind, value] of kinds) {
        const builder = build({ [key]: value });
        expect(reports(builder), kind).toEqual(reports(control));
        expect(builder.svgCode, kind).toBe(empty.svgCode);
        expect(builder.toString(), kind).toBe(empty.toString());
        // strict: `toEqual` would pass a key kept holding `undefined`
        expect(builder.toJSON(), kind).toStrictEqual(empty.toJSON());

        builder.addGroup('B99');
        expect(reports(builder), kind).toEqual(reports(control));
      }
    });

    it.each(ROUTES)('refuses a value with no text form on a name of your own through %s', (_route, _level, _transient, _kinds, build) => {
      expect(codes(build({ 'data-note': null }))).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('reports each key of a bag once, in the order written', () => {
      const builder = new BlissSVGBuilder('B291', { onclick: null, color: null, 'nosuch--fill': [1] });

      expect(builder.warnings.map(({ code, source }) => [code, source])).toEqual([
        ['UNSAFE_ATTRIBUTE_NAME', 'onclick'],
        ['INVALID_OPTION_VALUE', 'color=null'],
        ['UNKNOWN_LAYER', 'nosuch--fill'],
      ]);
      expect(builder.toString()).toBe('B291');
    });

    it('saves neither the key nor the source text of a function or a symbol', () => {
      const withFunction = new BlissSVGBuilder('B291', { onclick: () => 1 });
      const withSymbol = new BlissSVGBuilder('B291', { onclick: Symbol('s') });

      expect(codes(withFunction)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(withFunction.toString()).toBe('B291');
      expect(codes(withSymbol)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(withSymbol.toString()).toBe('B291');
    });

    it('keeps a refused name holding text, which reports again on reload', () => {
      // pins that only a value with no text form is dropped for its name: text
      // is input the author can read and fix, so it stays and re-warns
      const builder = new BlissSVGBuilder('B291', { onclick: 'x' });

      expect(builder.toString()).toBe('[onclick=x]||B291');
      expect(codes(new BlissSVGBuilder(builder.toString()))).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
    });
  });

  describe('when a retired crop name carries a value with no text form', () => {
    // note: `autoVertical` and `cropCompact` are the library's internal names
    // for two crop values. They are not options and not refused names: a value
    // written under one passes through with a hint naming the option that
    // works, so a value with no text form is refused as on a name of your own.
    // A function's `source` is its coerced form, an open row, so the function
    // rows assert codes only.
    it('refuses an object written as cropCompact on a character, and draws as if unwritten', () => {
      const builder = new BlissSVGBuilder(compositionWith('character', { cropCompact: { a: 1 } }));

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(builder.toString()).toBe('B291');
    });

    it('refuses a function written as autoVertical in the builder options, and emits nothing', () => {
      const builder = new BlissSVGBuilder('B291', { autoVertical: () => 1 });

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(builder.toString()).toBe('B291');
    });

    it('refuses a list written as cropCompact through setOptions', () => {
      const builder = afterMutating((b) => b.glyph(0).setOptions({ cropCompact: [1] }));

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('refuses a null written as autoVertical on the transient channel', () => {
      const builder = afterMutating((b) => b.setTransientOptions({ autoVertical: null }));

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('keeps the hint for a value it can write, which is emitted on the root as written', () => {
      const builder = new BlissSVGBuilder(compositionWith('global', { autoVertical: true }));

      expect(codes(builder)).toEqual(['MISPLACED_OPTION_SPELLING']);
      expect(builder.svgCode).toMatch(/^<svg [^>]*autoVertical="true"/);
      expect(builder.toString()).toBe('[autoVertical]||B291');
    });
  });

  describe("when a definition's defaults hold a value with no text form", () => {
    // `xmlns` is the one refused name `define()` accepts in a definition's
    // defaults; it refuses an unsafe name itself, as a definition error. The
    // library's stamp is refused on the root alone, which a definition's
    // defaults never reach, so there it is a name of your own.
    // [code, definition]; the two NV_PATCH codes get their defaults from
    // patchDefinition() in their own row.
    const DEFINITIONS = [
      ['NV_NULL', { codeString: 'B291', defaultOptions: { xmlns: null } }],
      ['NV_CASE', { codeString: 'B291', defaultOptions: { XMLNS: { a: 1 } } }],
      ['NV_FN', { codeString: 'B291', defaultOptions: { xmlns: () => 1 } }],
      ['NV_SYM', { codeString: 'B291', defaultOptions: { xmlns: Symbol('s') } }],
      ['NV_PART', { codeString: 'B99', defaultOptions: { xmlns: null } }],
      ['NV_WORD', { codeString: 'B81', defaultOptions: { xmlns: null } }],
      ['NV_TEXT', { codeString: 'B291', defaultOptions: { xmlns: 'x' } }],
      ['NV_STAMP', { codeString: 'B291', defaultOptions: { 'data-generator': null } }],
      ['NV_PATCH', { codeString: 'B291' }],
      ['NV_PATCHFN', { codeString: 'B291' }],
    ];
    const definedWith = new Map();

    beforeAll(() => {
      for (const [code, definition] of DEFINITIONS) {
        const result = BlissSVGBuilder.define({ [code]: definition });
        // the warnings are the subject here; a definition that was not made is
        // a broken fixture
        expect(result.defined).toEqual([code]);
        definedWith.set(code, result);
      }
    });
    afterAll(() => DEFINITIONS.forEach(([code]) => BlissSVGBuilder.removeDefinition(code)));

    const plainDrawing = () => new BlissSVGBuilder('B291').svgCode;

    it('reports xmlns when the definition is made, prefixed with its code, and keeps no such default', () => {
      expect(definedWith.get('NV_NULL')).toEqual({
        defined: ['NV_NULL'], skipped: [], errors: [], warnings: [xmlnsRefusal('NV_NULL')],
      });
      // strict: `toEqual` would pass a default kept holding `undefined`
      expect(BlissSVGBuilder.getDefinition('NV_NULL').defaultOptions).toStrictEqual({});
    });

    it('reports xmlns in any casing, quoting the name as written', () => {
      const { warnings } = definedWith.get('NV_CASE');

      expect(warnings.map(({ code, source }) => [code, source])).toEqual([['RESERVED_ATTRIBUTE_NAME', 'XMLNS']]);
      expect(warnings[0].message).toMatch(/^"NV_CASE": "XMLNS" declares what the file is/);
    });

    it('lets every use draw with nothing to report, saving the code spelled out', () => {
      const builder = new BlissSVGBuilder('NV_NULL');

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291');
      expect(builder.toString({ preserve: true })).toBe('NV_NULL');
      expect(builder.svgCode).toBe(plainDrawing());
    });

    it('no longer makes every use throw when the default is a function or a symbol', () => {
      // regression: `define()` accepted the value and every later use threw
      // DataCloneError out of the constructor
      for (const code of ['NV_FN', 'NV_SYM']) {
        expect(codes(definedWith.get(code)), code).toEqual(['RESERVED_ATTRIBUTE_NAME']);
        expect(() => new BlissSVGBuilder(code), code).not.toThrow();
        const builder = new BlissSVGBuilder(code);
        expect(builder.warnings, code).toEqual([]);
        expect(builder.svgCode, code).toBe(plainDrawing());
      }
    });

    it('drops the default where the code is used as a part or as a ;; code', () => {
      const asPart = new BlissSVGBuilder('B291;NV_PART');
      const asOverlay = new BlissSVGBuilder('B291;;NV_WORD');

      expect(asPart.warnings).toEqual([]);
      expect(asPart.toString()).toBe('B291;B99');
      expect(asOverlay.warnings).toEqual([]);
      expect(asOverlay.toString()).toBe('B291;;B81');
    });

    it('reports xmlns through patchDefinition() the same way, and lets every use draw', () => {
      const nullPatch = BlissSVGBuilder.patchDefinition('NV_PATCH', { defaultOptions: { xmlns: null } });
      const functionPatch = BlissSVGBuilder.patchDefinition('NV_PATCHFN', { defaultOptions: { xmlns: () => 1 } });

      expect(nullPatch).toEqual({ patched: true, warnings: [xmlnsRefusal('NV_PATCH')] });
      expect(functionPatch).toEqual({ patched: true, warnings: [xmlnsRefusal('NV_PATCHFN')] });
      expect(new BlissSVGBuilder('NV_PATCH').warnings).toEqual([]);
      expect(() => new BlissSVGBuilder('NV_PATCHFN')).not.toThrow();
      expect(new BlissSVGBuilder('NV_PATCHFN').svgCode).toBe(plainDrawing());
    });

    it('keeps a default written as text, which every use reports again', () => {
      const builder = new BlissSVGBuilder('NV_TEXT');

      expect(definedWith.get('NV_TEXT').warnings).toEqual([]);
      expect(codes(builder)).toEqual(['RESERVED_ATTRIBUTE_NAME']);
      expect(builder.toString()).toBe('[xmlns=x]>B291');
    });

    it("refuses the library's stamp as a value under a name of your own, since a definition never sets the root", () => {
      // pins the defaults judged with no level: judged as the root's, the
      // stamp would be refused for its name (RESERVED_ATTRIBUTE_NAME)
      const builder = new BlissSVGBuilder('NV_STAMP');

      expect(definedWith.get('NV_STAMP').warnings.map(({ code, source }) => [code, source]))
        .toEqual([['INVALID_OPTION_VALUE', 'data-generator=null']]);
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(plainDrawing());
    });
  });

  describe('when a key is refused for what it does rather than for its name', () => {
    // note: these names are usable and the report is about the attribute's
    // effect, so a value with no text form is refused as on a name of your own
    it('refuses a value with no text form on a link attribute behind a target as an ordinary value', () => {
      const withText = new BlissSVGBuilder('B291', { 'content--href': 'x' });

      expect(codes(new BlissSVGBuilder('B291', { 'content--href': null }))).toEqual(['INVALID_OPTION_VALUE']);
      expect(codes(withText)).toEqual(['MISPLACED_LINK_ATTRIBUTE']);
      expect(withText.toString()).toBe('[content--href=x]||B291');
    });

    it("refuses a value with no text form on an attribute the container's shapes override as an ordinary value", () => {
      const withNull = new BlissSVGBuilder('B291', { grid: true, 'grid--stroke': null });
      const withText = new BlissSVGBuilder('B291', { grid: true, 'grid--stroke': 'x' });

      expect(codes(withNull)).toEqual(['INVALID_OPTION_VALUE']);
      expect(withNull.toString()).toBe('[grid]||B291');
      expect(codes(withText)).toEqual(['MISPLACED_CONTAINER_ATTRIBUTE']);
      expect(withText.toString()).toBe('[grid;grid--stroke=x]||B291');
    });
  });
});
