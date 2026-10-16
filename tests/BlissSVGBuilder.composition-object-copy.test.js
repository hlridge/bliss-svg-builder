/**
 * Pins the copy the constructor makes of a composition object: it reads the
 * object as data, so a value no save can carry no longer throws out of the
 * constructor; it meets the judge of the place it sits in, or is left out
 * where nothing reads it.
 *
 * Covers:
 * - A function or a symbol in an options bag at every level and in a transient
 *   bag, refused with `INVALID_OPTION_VALUE` in the words `setOptions()` uses
 *   for the same value, and not stored.
 * - A function or a symbol as a position (`x`, `y`) or as the key beside an
 *   element, at every level, refused in that judge's words.
 * - A function where nothing reads it (a field of the object's own, a method
 *   set in a class's constructor) left out, reporting nothing, as JSON leaves
 *   it out; a function as a part's code read as a part with no code.
 * - An object behind a Proxy, whole or one element, read as the object it
 *   wraps.
 * - A bigint read as the text it spells, so `toJSON()` stays valid JSON.
 * - A date and a map in a field of the object's own, and a back-reference
 *   inside one, kept as the clone kept them.
 * - The caller's object left as it was.
 *
 * Does NOT cover:
 * - The element key's own values, see
 *   `BlissSVGBuilder.element-key-values.test.js`.
 * - A key spelled `__proto__`, see `BlissSVGBuilder.name-refusal-values.test.js`.
 * - A field the library reads holding a value of the wrong type (`codeName:
 *   5`), which still throws: backlog row "A composition object field the
 *   library reads, holding the wrong type" (the `it.todo` below).
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const fn = () => 1;
const sym = Symbol('s');
const b291 = (extra) => ({ codeName: 'B291', ...extra });
const oneGlyph = (glyph, extra) => ({ groups: [{ glyphs: [glyph] }], ...extra });
const plain = () => new BlissSVGBuilder('B291');

const reports = (builder) => builder.warnings.map((w) => [w.code, w.source]);

// The deep save of `B291` with a function written into its part's own part.
const withInnerFunction = () => {
  const json = new BlissSVGBuilder('B291').toJSON({ deep: true });
  json.groups[0].glyphs[0].parts[0].parts[0].options = { color: fn };
  return json;
};

describe('BlissSVGBuilder composition object copy', () => {
  describe('when a function or a symbol sits in an options bag', () => {
    it.each([
      ["the composition's options", () => oneGlyph({ parts: [b291()] }, { options: { fill: fn } }), 'fill=() => 1'],
      ["a word's options", () => ({ groups: [{ options: { fill: fn }, glyphs: [{ parts: [b291()] }] }] }), 'fill=() => 1'],
      ["a character's options", () => oneGlyph({ parts: [b291()], options: { color: sym } }), 'color=Symbol(s)'],
      ["a part's options", () => oneGlyph({ parts: [b291({ options: { color: fn } })] }), 'color=() => 1'],
      ["a part's own part's options", withInnerFunction, 'color=() => 1'],
      ['a transient bag', () => oneGlyph({ parts: [b291()], transientOptions: { fill: fn } }), 'fill=() => 1'],
    ])('refuses it in %s, where the constructor threw', (_place, input, source) => {
      // regression: structuredClone threw DataCloneError ("() => 1 could not be
      // cloned.") before anything was judged
      const builder = new BlissSVGBuilder(input());
      expect(reports(builder)).toEqual([['INVALID_OPTION_VALUE', source]]);
      expect(builder.svgCode).not.toContain('=&gt;');
      expect(builder.svgCode).not.toContain('Symbol(');
    });

    it('refuses it in the words setOptions() uses for the same value', () => {
      const fromObject = new BlissSVGBuilder(oneGlyph({ parts: [b291()], options: { color: fn } }));
      const fromSetter = plain();
      fromSetter.glyph(0).setOptions({ color: fn });
      expect(fromObject.warnings).toEqual(fromSetter.warnings);
    });

    it('stores nothing of it', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()], options: { color: fn, 'data-x': '1' } }));
      expect(builder.toJSON().groups[0].glyphs[0].options).toEqual({ 'data-x': '1' });
      expect(builder.toString()).toBe('[data-x=1]B291');
    });
  });

  describe('when a function or a symbol is a position or the key beside an element', () => {
    it.each([
      ['x on the composition', () => oneGlyph({ parts: [b291()] }, { x: fn }), 'MALFORMED_COORDINATES', 'x=() => 1'],
      ['x on a word', () => ({ groups: [{ x: fn, glyphs: [{ parts: [b291()] }] }] }), 'MALFORMED_COORDINATES', 'x=() => 1'],
      ['y on a character', () => oneGlyph({ parts: [b291()], y: sym }), 'MALFORMED_COORDINATES', 'y=Symbol(s)'],
      ['x on a part', () => oneGlyph({ parts: [b291({ x: fn })] }), 'MALFORMED_COORDINATES', 'x=() => 1'],
      ['the key on a character', () => oneGlyph({ parts: [b291()], key: fn }), 'INVALID_OPTION_VALUE', 'key=() => 1'],
      ['the key on a part', () => oneGlyph({ parts: [b291({ key: sym })] }), 'INVALID_OPTION_VALUE', 'key=Symbol(s)'],
    ])('refuses %s in its judge\'s words, where the constructor threw', (_place, input, code, source) => {
      const builder = new BlissSVGBuilder(input());
      expect(reports(builder)).toEqual([[code, source]]);
      expect(builder.svgCode).toBe(plain().svgCode);
    });

    it('refuses a key with no text form in a character\'s options too', () => {
      // note: the key's other values are its own file's; a function or a
      // symbol reaches its judge only through this copy
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()], options: { key: fn } }));
      expect(reports(builder)).toEqual([['INVALID_OPTION_VALUE', 'key=() => 1']]);
    });
  });

  describe('when a function or a symbol sits where nothing reads it', () => {
    it('leaves a field of the object\'s own out, reporting nothing', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()] }, { onChange: fn, tag: sym, note: 'kept' }));
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON()).not.toHaveProperty('onChange');
      expect(builder.toJSON()).not.toHaveProperty('tag');
      expect(builder.toJSON().note).toBe('kept');
      expect(builder.svgCode).toBe(plain().svgCode);
    });

    it('leaves out a method a class sets on its instances', () => {
      class Glyph {
        constructor() {
          this.parts = [b291()];
          this.describe = () => 'a character';
        }
      }
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [new Glyph()] }] });
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291');
    });

    it('reads a function in a list as null, as JSON does', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()] }, { notes: ['a', fn] }));
      expect(builder.toJSON().notes).toEqual(['a', null]);
    });

    it('reads a part whose code is a function as a part with no code', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: fn }] }));
      expect(builder.warnings.map((w) => w.code)).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when the object sits behind a Proxy', () => {
    it.each([
      ['the whole object', () => new Proxy(oneGlyph({ parts: [b291()] }), {})],
      ['one character', () => ({ groups: [{ glyphs: [new Proxy({ parts: [b291()] }, {})] }] })],
    ])('reads %s as the object it wraps', (_wrapped, input) => {
      // regression: structuredClone threw DataCloneError ("#<Object> could not
      // be cloned."), as it does for a Vue reactive object
      const builder = new BlissSVGBuilder(input());
      expect(builder.svgCode).toBe(plain().svgCode);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when the object holds a bigint', () => {
    it('reads one in an option as the text it spells', () => {
      // regression: `toJSON()` returned the bigint, so JSON.stringify threw
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()], options: { 'data-id': 12345678901234567890n } }));
      expect(builder.toJSON().groups[0].glyphs[0].options['data-id']).toBe('12345678901234567890');
      expect(() => JSON.stringify(builder.toJSON())).not.toThrow();
      expect(builder.svgCode).toContain('data-id="12345678901234567890"');
    });

    it('reads one as a position as the number it spells', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291({ x: 2n })] }));
      expect(builder.toString()).toBe('B291:2');
    });

    it('reads one in a field of the object\'s own as its text', () => {
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()] }, { id: 5n }));
      expect(builder.toJSON().id).toBe('5');
    });
  });

  describe('when a field of the object\'s own holds a date or a map', () => {
    it('keeps them as the clone did', () => {
      // pins the copy handing an object it does not read key by key to the
      // clone; killed hand mutants c11 and c12 (C28, every object read key by
      // key, and every such object left out)
      const meta = { created: new Date(0), tags: new Map([['a', 1]]) };
      const { meta: saved } = new BlissSVGBuilder(oneGlyph({ parts: [b291()] }, { meta })).toJSON();
      expect(saved.created).toBeInstanceOf(Date);
      expect(saved.created.getTime()).toBe(0);
      expect(saved.tags.get('a')).toBe(1);
      expect(saved.created).not.toBe(meta.created);
    });
  });

  describe('when the object holds a back-reference', () => {
    it('keeps it, as the clone did', () => {
      const meta = { name: 'board' };
      meta.self = meta;
      const builder = new BlissSVGBuilder(oneGlyph({ parts: [b291()] }, { meta }));
      const { meta: saved } = builder.toJSON();
      expect(builder.warnings).toEqual([]);
      expect(saved.self).toBe(saved);
      expect(saved).not.toBe(meta);
    });
  });

  describe("when the caller's object is read", () => {
    it('leaves it as it was, the function in it included', () => {
      const input = oneGlyph({ parts: [b291({ x: 1 })], options: { color: fn, 'data-x': 2 } }, { options: { margin: 1 } });
      const before = JSON.stringify(input);
      const builder = new BlissSVGBuilder(input);
      builder.glyph(0).setOptions({ color: 'red' });
      expect(JSON.stringify(input)).toBe(before);
      expect(input.groups[0].glyphs[0].options.color).toBe(fn);
      expect(input.groups[0].glyphs[0]).not.toHaveProperty('key');
    });
  });

  describe('when a field the library reads holds a value of the wrong type', () => {
    it.todo('refuses it in the documented words, naming where it is, instead of an internal TypeError');
  });
});
