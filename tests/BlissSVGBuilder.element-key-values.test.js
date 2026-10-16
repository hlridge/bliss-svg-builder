/**
 * Pins the element key judged like every other option's value: a value with no
 * text form is refused and reported, and the element keeps the key it had; any
 * other value names the element by its text, whichever way it was written.
 *
 * Covers:
 * - A number, a bigint, a boolean and a string naming the element by their
 *   text (`5` as `'5'`, `[key]` as `'true'`), written in a bracket, in a
 *   composition object (in the options and beside the element), through
 *   `setOptions()` and through the options of an adding method, on a word, a
 *   character and a part.
 * - A value with no text form refused with `INVALID_OPTION_VALUE` on each
 *   JavaScript route, in the same words: `null`, `undefined`, an object and a
 *   list in a composition object, those and a function and a symbol through
 *   `setOptions()`; the element keeping its own key, or the key set before.
 * - An empty key naming nothing, so the element keeps its own, in silence and
 *   across changes; set through a setter, it takes away a key set before.
 * - `getElementByKey()` finding an element keyed by a number under its text,
 *   and two keys that differ only by type reported as one (`DUPLICATE_KEY`).
 * - `getElementByKey()` finding a part by a key set on it, written in a
 *   bracket, through `setOptions()` and in a composition object.
 * - The key kept out of both saves, whatever it was written as.
 *
 * Does NOT cover:
 * - A function or a symbol as the key in a composition object, which the
 *   constructor's copy hands to this judge, see
 *   `BlissSVGBuilder.composition-object-copy.test.js`.
 * - Generated keys, lookup by key and the `[id]` attribute, see
 *   `BlissSVGBuilder.element-keys.test.js`.
 * - A key on the transient channel, which is refused there, see
 *   `BlissSVGBuilder.transient-refusal-values.test.js`.
 * - A key in a definition's options, which `define()` refuses, see
 *   `BlissSVGBuilder.definition-use-site-options.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const oneGlyph = (glyph) => ({ groups: [{ glyphs: [glyph] }] });
const b291 = (extra) => ({ parts: [{ codeName: 'B291' }], ...extra });

// A builder for `code` after `change` has been applied to it.
const changed = (code, change) => {
  const builder = new BlissSVGBuilder(code);
  change(builder);
  return builder;
};

// The text the library generates for a key nobody gave.
const GENERATED = /^[a-z0-9]{8}$/;

const codes = (builder) => builder.warnings.map((w) => w.code);

describe('BlissSVGBuilder element key values', () => {
  describe('when a key with a text form is written', () => {
    it.each([
      ['a number in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: 5 } }))).glyph(0), '5'],
      ['zero in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: 0 } }))).glyph(0), '0'],
      ['a bigint in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: 5n } }))).glyph(0), '5'],
      ['true in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: true } }))).glyph(0), 'true'],
      ['a number beside the element in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ key: 5 }))).glyph(0), '5'],
      ['a number through setOptions()', () => changed('B291', (b) => b.glyph(0).setOptions({ key: 5 })).glyph(0), '5'],
      ['false through setOptions()', () => changed('B291', (b) => b.glyph(0).setOptions({ key: false })).glyph(0), 'false'],
      ["a number through an adding method's options", () => changed('B291', (b) => b.group(0).addGlyph('B303', { key: 5 })).glyph(1), '5'],
      ['a bare key in a bracket', () => new BlissSVGBuilder('[key]B291').glyph(0), 'true'],
      ['a number in a bracket', () => new BlissSVGBuilder('[key=5]B291').glyph(0), '5'],
      ['a number on a word in a composition object', () => new BlissSVGBuilder({ groups: [{ options: { key: 7 }, glyphs: [b291()] }] }).group(0), '7'],
      ['a number on a part in a composition object', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B291', options: { key: 9 } }] })).glyph(0).part(0), '9'],
    ])('names the element by its text, written as %s', (_route, handleOf, expected) => {
      // regression: the key reached `handle.key` (typed string) as the number,
      // boolean or bigint written
      expect(handleOf().key).toBe(expected);
    });

    it('names the composition by its text at document scope', () => {
      expect(new BlissSVGBuilder('B291', { key: 5 }).snapshot().key).toBe('5');
    });

    it('reports nothing for any of them', () => {
      expect(codes(new BlissSVGBuilder(oneGlyph(b291({ options: { key: 5 } }))))).toEqual([]);
      expect(codes(changed('B291', (b) => b.glyph(0).setOptions({ key: true })))).toEqual([]);
    });
  });

  describe('when a key with no text form is written', () => {
    // A function or a symbol in a composition object is the constructor's
    // copy's to hand over, see `BlissSVGBuilder.composition-object-copy.test.js`.
    const CLONEABLE = [
      ['null', null, 'key=null'],
      ['undefined', undefined, 'key=undefined'],
      ['an object', { a: 1 }, 'key=[object Object]'],
      ['a list', [1], 'key=1'],
    ];
    const VALUES = [
      ...CLONEABLE,
      ['a function', () => 1, 'key=() => 1'],
      ['a symbol', Symbol('k'), 'key=Symbol(k)'],
    ];

    it.each(CLONEABLE)('refuses %s in a composition object, keeping the generated key', (_label, value, source) => {
      const builder = new BlissSVGBuilder(oneGlyph(b291({ options: { key: value } })));
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['INVALID_OPTION_VALUE', source]]);
      expect(builder.glyph(0).key).toMatch(GENERATED);
    });

    it.each(CLONEABLE)('refuses %s written beside the element in a composition object', (_label, value, source) => {
      const builder = new BlissSVGBuilder(oneGlyph(b291({ key: value })));
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['INVALID_OPTION_VALUE', source]]);
      expect(builder.glyph(0).key).toMatch(GENERATED);
    });

    it.each(VALUES)('refuses %s through setOptions(), keeping the key set before', (_label, value, source) => {
      // regression: a function was kept as its source text, and an object or
      // a null was dropped in silence
      const builder = changed('B291', (b) => {
        b.glyph(0).setOptions({ key: 'subject' });
        b.glyph(0).setOptions({ key: value });
      });
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['INVALID_OPTION_VALUE', source]]);
      expect(builder.glyph(0).key).toBe('subject');
    });

    it.each([
      ['in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: { a: 1 } } })))],
      ['beside the element in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ key: { a: 1 } })))],
      ['through setOptions()', () => changed('B291', (b) => b.glyph(0).setOptions({ key: { a: 1 } }))],
      ["through an adding method's options", () => changed('B291', (b) => b.group(0).addGlyph('B303', { key: { a: 1 } }))],
    ])('refuses an object in the words every option uses, written %s', (_route, build) => {
      expect(build().warnings).toEqual([{
        code: 'INVALID_OPTION_VALUE',
        message: '"key" needs a text value and {"a":1} is not one, so it was ignored: the element keeps the key it would have had without it.',
        source: 'key=[object Object]',
      }]);
    });
  });

  describe('when a key is empty', () => {
    it.each([
      ['in a bracket', () => new BlissSVGBuilder('[key=]B291')],
      ['in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: '' } })))],
    ])('names nothing, so the element keeps its own key in silence, written %s', (_route, build) => {
      const builder = build();
      expect(builder.glyph(0).key).toMatch(GENERATED);
      expect(builder.warnings).toEqual([]);
    });

    it('keeps that key across a change elsewhere', () => {
      // regression: the element got a fresh key at every rebuild, so the one a
      // caller had read no longer found it
      const builder = new BlissSVGBuilder('[key=]B291/B303');
      const own = builder.glyph(0).key;
      builder.glyph(1).setOptions({ color: 'red' });
      expect(builder.glyph(0).key).toBe(own);
      expect(builder.getElementByKey(own)?.isGlyph).toBe(true);
    });

    it('takes away a key set before, leaving the element its own', () => {
      const builder = changed('B291', (b) => b.glyph(0).setOptions({ key: 'subject' }));
      builder.glyph(0).setOptions({ key: '' });
      expect(builder.glyph(0).key).toMatch(GENERATED);
      expect(builder.getElementByKey('subject')).toBeNull();
    });
  });

  describe('when an element is looked up by a key written as a number', () => {
    it('finds it under the text the number names it by', () => {
      const builder = new BlissSVGBuilder(oneGlyph(b291({ options: { key: 5 } })));
      expect(builder.getElementByKey('5')?.key).toBe('5');
    });

    it('reports two keys that differ only by type as the same key', () => {
      // regression: the number 5 and the text '5' were two keys in silence
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [b291({ options: { key: 5 } }), { parts: [{ codeName: 'B303' }], options: { key: '5' } }] }] });
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['DUPLICATE_KEY', '5']]);
    });
  });

  describe('when a part is looked up by a key set on it', () => {
    it.each([
      ['in a bracket', () => new BlissSVGBuilder('B291;[key=k]>B81'), 'B81'],
      ['through setOptions()', () => changed('B291;B81', (b) => b.glyph(0).part(1).setOptions({ key: 'k' })), 'B81'],
      ['in a composition object', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B291', options: { key: 'k' } }] })), 'B291'],
    ])('finds it, the key written %s', (_route, build, codeName) => {
      // regression: getElementByKey() found a word or a character by a key set
      // on it, but never a part
      const found = build().getElementByKey('k');
      expect(found?.codeName).toBe(codeName);
      expect(found?.key).toBe('k');
    });

    it('reads it as its own snapshot where a word indicator reorders the parts', () => {
      // pins a part handle matching its snapshot by the key it is drawn with:
      // the `;;` code is drawn before `B97`, so `B97`'s place among the
      // snapshot's parts is not its place among the character's
      const builder = new BlissSVGBuilder('B313;[key=ind]>B97;;B81');
      const drawn = builder.snapshot().children[0].children[0].children.find((part) => part.key === 'ind');
      expect(builder.glyph(0).part(1).x).toBe(drawn.x);
      expect(builder.getElementByKey('ind').x).toBe(drawn.x);
    });
  });

  describe('when the composition is saved', () => {
    it.each([
      ['a number in a composition object', () => new BlissSVGBuilder(oneGlyph(b291({ options: { key: 5 } })))],
      ['a number beside the element', () => new BlissSVGBuilder(oneGlyph(b291({ key: 5 })))],
      ['true through setOptions()', () => changed('B291', (b) => b.glyph(0).setOptions({ key: true }))],
    ])('keeps the key out of both strings and both JSON saves, written as %s', (_route, build) => {
      const builder = build();
      expect(builder.toString()).toBe('B291');
      expect(builder.toString({ preserve: true })).toBe('B291');
      expect(JSON.stringify(builder.toJSON())).not.toContain('"key"');
      expect(JSON.stringify(builder.toJSON({ preserve: true }))).not.toContain('"key"');
    });
  });
});
