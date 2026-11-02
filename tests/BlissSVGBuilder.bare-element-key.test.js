/**
 * Pins the element key written with no value: refused and reported, and the
 * element keeps the key it would have had without it.
 *
 * A bare key arrives as `true`. A key names an element rather than describing
 * it, so the gate that refuses a bare color or title never reached it, and
 * `[key]B313` named the character "true" in silence. A key written with no
 * value names nothing, as an empty one does, so it is refused as every other
 * bare library option is.
 *
 * Covers:
 * - The bracket on the whole composition, a word, a character and a part: one
 *   `INVALID_OPTION_VALUE` naming the key alone, in exact words, the element
 *   keeping a key of its own, and `getElementByKey('true')` finding nothing.
 * - The rest of the bracket honoured, and a bare key written after a key with
 *   a value refused as the one written last.
 * - The JavaScript `true`, which is what the bare key is stored as: in a
 *   composition object's options and beside the element, through the
 *   constructor's options, the builder's `setOptions()`, a handle's
 *   `setOptions()` and an adding method's options, with the same report.
 * - A key set before the bare one: the element falls back to its own key, as
 *   a bare color falls back to its default rather than to the color before it.
 * - The bare key kept in the composition: reported once after a change
 *   elsewhere with the element's key unchanged, and no longer once a key is
 *   set over it or it is removed.
 * - Two bare keys: two refusals and no `DUPLICATE_KEY`.
 * - Both saves leaving it out, as they leave out every key, so the reload is
 *   silent.
 * - An object naming a typed definition by its code, whose first part's key
 *   becomes the key of the part the definition is: a bare key there refused,
 *   a number named by its text, a key in its options named over one beside
 *   it (as on any element), and the definition still saved by its name.
 * - A definition whose own bracket holds a bare key, refused by `define()` as
 *   any key is.
 * - The controls: `[key=true]`, the text, names the element "true", `false`
 *   names it "false" and `1` names it "1".
 *
 * Does NOT cover:
 * - Other key values (a number, an empty key, a value with no text form), see
 *   `BlissSVGBuilder.element-key-values.test.js`.
 * - A key in a definition's `defaultOptions`, refused whatever it holds, see
 *   `BlissSVGBuilder.definition-use-site-options.test.js`.
 * - A key on the transient channel, refused there, see
 *   `BlissSVGBuilder.transient-refusal-values.test.js`.
 * - A bare color or title option, see `BlissSVGBuilder.bare-text-option.test.js`;
 *   a bare number option, see `BlissSVGBuilder.option-value-gate.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const KEY_REFUSAL = {
  code: 'INVALID_OPTION_VALUE',
  message: '"key" needs a text value and was written without one, so it was ignored: the element keeps the key it would have had without it.',
  source: 'key',
};

// The text the library generates for a key nobody gave.
const GENERATED = /^[a-z0-9]{8}$/;

const oneGlyph = (glyph) => ({ groups: [{ glyphs: [glyph] }] });
const b313 = (extra) => ({ parts: [{ codeName: 'B313' }], ...extra });

// A builder for `code` after `change` has been applied to it.
const changed = (code, change) => {
  const builder = new BlissSVGBuilder(code);
  change(builder);
  return builder;
};

// A typed glyph an object can name by its code (`glyphCode`) beside the parts
// it draws, which the constructor turns into the one part the definition is.
const TYPED = { BAREKEYTG: { type: 'glyph', codeString: 'B313;C8' } };
const namingTyped = (firstPart) => oneGlyph({ glyphCode: 'BAREKEYTG', parts: [{ codeName: 'B313', ...firstPart }, { codeName: 'C8' }] });

describe('BlissSVGBuilder bare element key', () => {
  describe('when the key is written bare in a bracket', () => {
    it.each([
      ['a character', '[key]B313', (builder) => builder.glyph(0).key],
      ['a word', '[key]|B313', (builder) => builder.group(0).key],
      ['a part', 'B313;[key]>C8', (builder) => builder.glyph(0).part(1).key],
      ['the whole composition', '[key]||B313', (builder) => builder.snapshot().key],
    ])('refuses it on %s, which keeps a key of its own', (_scope, input, keyOf) => {
      // regression: the element was named "true" in silence
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(keyOf(builder)).toMatch(GENERATED);
      expect(builder.getElementByKey('true')).toBeNull();
    });

    it('refuses the key alone and honours the rest of the bracket', () => {
      const builder = new BlissSVGBuilder('[key;color=red]B313');
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(builder.glyph(0).key).toMatch(GENERATED);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=red]B313').svgCode);
    });

    it('refuses a bare key written after a key with a value, as the one written last', () => {
      // note: an option holds one value and the last one written wins, so
      // `[key=subject;key]` is a bare key, as `[color=red;color]` is a bare color
      const builder = new BlissSVGBuilder('[key=subject;key]B313');
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(builder.glyph(0).key).toMatch(GENERATED);
      expect(builder.getElementByKey('subject')).toBeNull();
    });
  });

  describe('when the bare value arrives through JavaScript as true', () => {
    it.each([
      ['in a composition object', () => new BlissSVGBuilder(oneGlyph(b313({ options: { key: true } }))), (builder) => builder.glyph(0).key],
      ['beside the element in a composition object', () => new BlissSVGBuilder(oneGlyph(b313({ key: true }))), (builder) => builder.glyph(0).key],
      ['on a word in a composition object', () => new BlissSVGBuilder({ groups: [{ options: { key: true }, glyphs: [b313()] }] }), (builder) => builder.group(0).key],
      ['on a part in a composition object', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B313', options: { key: true } }] })), (builder) => builder.glyph(0).part(0).key],
      ['on the composition in a composition object', () => new BlissSVGBuilder({ options: { key: true }, groups: [{ glyphs: [b313()] }] }), (builder) => builder.snapshot().key],
      ['beside the composition in a composition object', () => new BlissSVGBuilder({ key: true, groups: [{ glyphs: [b313()] }] }), (builder) => builder.snapshot().key],
      ["through the constructor's options", () => new BlissSVGBuilder('B313', { key: true }), (builder) => builder.snapshot().key],
      ["through the builder's setOptions()", () => changed('B313', (b) => b.setOptions({ key: true })), (builder) => builder.snapshot().key],
      ["through a character's setOptions()", () => changed('B313', (b) => b.glyph(0).setOptions({ key: true })), (builder) => builder.glyph(0).key],
      ["through a word's setOptions()", () => changed('B313', (b) => b.group(0).setOptions({ key: true })), (builder) => builder.group(0).key],
      ["through a part's setOptions()", () => changed('B313;C8', (b) => b.glyph(0).part(1).setOptions({ key: true })), (builder) => builder.glyph(0).part(1).key],
      ["through an adding method's options", () => changed('B313', (b) => b.group(0).addGlyph('B303', { key: true })), (builder) => builder.glyph(1).key],
    ])('refuses it written %s, as the bracket is refused', (_route, build, keyOf) => {
      // regression: the element was named "true" in silence
      const builder = build();
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(keyOf(builder)).toMatch(GENERATED);
    });
  });

  describe('when a key was set before the bare one', () => {
    it('falls back to its own key, not to the key set before', () => {
      // note: the bare key replaces the key written before it and is then
      // refused, as `setOptions({ color: true })` falls back to the default
      // color rather than to a color set before it
      const builder = new BlissSVGBuilder('B313');
      const own = builder.glyph(0).key;
      builder.glyph(0).setOptions({ key: 'subject' });
      builder.glyph(0).setOptions({ key: true });
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(builder.glyph(0).key).toBe(own);
      expect(builder.getElementByKey('subject')).toBeNull();
    });
  });

  describe('when the composition keeps a bare key across changes', () => {
    it('reports it once after a change elsewhere and keeps the same key', () => {
      const builder = new BlissSVGBuilder('[key]B313/B303');
      const own = builder.glyph(0).key;
      builder.glyph(1).setOptions({ color: 'red' });
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(builder.glyph(0).key).toBe(own);
    });

    it('stops reporting it once a key is set over it', () => {
      const builder = changed('[key]B313', (b) => b.glyph(0).setOptions({ key: 'subject' }));
      expect(builder.warnings).toEqual([]);
      expect(builder.glyph(0).key).toBe('subject');
    });

    it('stops reporting it once it is removed', () => {
      const builder = changed('[key]B313', (b) => b.glyph(0).removeOptions('key'));
      expect(builder.warnings).toEqual([]);
      expect(builder.glyph(0).key).toMatch(GENERATED);
    });
  });

  describe('when two elements are both written with a bare key', () => {
    it('refuses each and reports no duplicate, since neither names its element', () => {
      // regression: both were named "true", so DUPLICATE_KEY was reported on a
      // key nobody wrote
      const builder = new BlissSVGBuilder('[key]B313/[key]B303');
      expect(builder.warnings).toEqual([KEY_REFUSAL, KEY_REFUSAL]);
      expect(builder.glyph(0).key).not.toBe(builder.glyph(1).key);
    });
  });

  describe('when the composition is saved and loaded again', () => {
    it('leaves the bare key out of both saves, as every key, so the reload says nothing', () => {
      const builder = new BlissSVGBuilder('[key]B313');
      expect(builder.toString()).toBe('B313');
      expect(builder.toString({ preserve: true })).toBe('B313');
      expect(JSON.stringify(builder.toJSON())).not.toContain('"key"');
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
      expect(new BlissSVGBuilder(builder.toJSON()).warnings).toEqual([]);
    });
  });

  describe('when an object names a typed definition by its code', () => {
    beforeAll(() => {
      const { errors } = BlissSVGBuilder.define(TYPED);
      if (errors.length) throw new Error(`fixture definitions refused: ${errors.join('; ')}`);
    });

    afterAll(() => {
      for (const code of Object.keys(TYPED)) BlissSVGBuilder.removeDefinition(code);
    });

    it('refuses a bare key on the first of the parts it draws', () => {
      // regression: the part the definition is was keyed by the boolean true
      const builder = new BlissSVGBuilder(namingTyped({ options: { key: true } }));
      expect(builder.warnings).toEqual([KEY_REFUSAL]);
      expect(builder.glyph(0).part(0).key).toMatch(GENERATED);
    });

    it.each([
      ['a number in its options', { options: { key: 5 } }, '5'],
      ['a text beside it', { key: 'k' }, 'k'],
    ])('names the part by %s, written on the first of the parts it draws', (_written, firstPart, name) => {
      // regression: a number was carried as the number, so `handle.key`, typed
      // as a string, was 5 and `getElementByKey('5')` found nothing
      const builder = new BlissSVGBuilder(namingTyped(firstPart));
      expect(builder.glyph(0).part(0).key).toBe(name);
      expect(builder.getElementByKey(name)?.key).toBe(name);
      expect(builder.toString({ preserve: true })).toBe('BAREKEYTG');
      expect(builder.warnings).toEqual([]);
    });

    it('names the part by the key in its options over the one beside it, as any element is named', () => {
      // regression: the key beside the first part won, where on every other
      // element the key in its options does
      const builder = new BlissSVGBuilder(namingTyped({ key: 'k', options: { key: 'j' } }));
      expect(builder.glyph(0).part(0).key).toBe('j');
      expect(builder.getElementByKey('k')).toBeNull();
    });
  });

  describe('when a definition holds a bare key in its own bracket', () => {
    it('is refused by define(), as a key with a value is', () => {
      const result = BlissSVGBuilder.define({ BAREKEYDEF: { codeString: '[key]B313' } });
      expect(result.defined).toEqual([]);
      expect(result.errors).toEqual([
        '"BAREKEYDEF": define("BAREKEYDEF"): the character bracket leading its codeString cannot include "key"; a key identifies one element, so every use of the definition would share it. Set it on the element where the code is used instead.',
      ]);
    });
  });

  describe('when the key is written with a value', () => {
    it('names the element "true" when the text true follows an equals sign', () => {
      // note: `[key]` stores the JavaScript `true`, `[key=true]` the text
      // "true"; only the first is a key written without a value
      const builder = new BlissSVGBuilder('[key=true]B313');
      expect(builder.warnings).toEqual([]);
      expect(builder.getElementByKey('true')?.key).toBe('true');
    });

    it.each([
      ['false', false, 'false'],
      ['1', 1, '1'],
    ])('names the element by the text of the JavaScript %s', (_label, key, name) => {
      // pins the bare key as `true` itself: a test for any truthy value, or a
      // loose `== true`, would refuse `1` as well
      const builder = changed('B313', (b) => b.glyph(0).setOptions({ key }));
      expect(builder.warnings).toEqual([]);
      expect(builder.glyph(0).key).toBe(name);
    });
  });
});
