/**
 * Pins the opts-arg shape guard (assertOptsArg) shared by every mutation method
 * that takes an options argument: a non-object opts (string, number, boolean,
 * array) throws a designed TypeError BEFORE any parse or warning forward, so a
 * rejected call neither mutates state nor leaks the code's parse-time warnings.
 * Nullish opts (undefined/null) means "no options"; an empty object no longer
 * stamps options:{} into toJSON.
 *
 * Covers:
 * - the assertOptsArg predicate: string/number/boolean/array rejected, the
 *   designed message names the method
 * - every opts-taking mutator wires the guard: builder group family
 *   (addGroup/insertGroup/replaceGroup/addElement/insertElement/replaceElement),
 *   builder addGlyph/addPart (via the handle delegate), handle glyph/part/replace
 *   family, and setOptions; a rejected call leaves the builder byte-identical
 * - the core regression: a rejected opts no longer leaks the code's
 *   MISPLACED_GLOBAL_OPTION (previously forwarded before the raw crash)
 * - arrays are rejected (previously silently produced options:{'0':...})
 * - the opts-shape check precedes the range check: an out-of-range replace with
 *   a bad opts throws, mirroring the code-arg guard
 * - nullish opts is a no-op; flat and {defaults,overrides} objects still apply
 * - an empty-object opts no longer stamps options:{} onto the node (family-wide)
 *
 * Does NOT cover:
 * - the constructor's document-options arg (new BlissSVGBuilder(input, opts)),
 *   which still throws a raw TypeError on a non-object; adjacent, out of scope,
 *   tracked as a Standalone backlog row
 * - singular code-arg validation, see BlissSVGBuilder.group-mutation-args.test.js,
 *   ElementHandle.glyph-mutation-args.test.js, ElementHandle.part-mutation-args.test.js
 * - accept-only forwarding of a valid code's parse warnings, see
 *   BlissSVGBuilder.group-mutation-args.test.js
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const stateOf = (b) => JSON.stringify(b.toJSON());
const warningCodes = (b) => b.warnings.map((w) => w.code);

// Every opts-taking mutator, labelled by call site. `name` is the method named
// in the designed TypeError (the two replace forms both surface 'replace').
const MUTATORS = [
  { label: 'builder.addGroup', name: 'addGroup', invoke: (b, o) => b.addGroup('B291', o) },
  { label: 'builder.insertGroup', name: 'insertGroup', invoke: (b, o) => b.insertGroup(0, 'B291', o) },
  { label: 'builder.replaceGroup', name: 'replaceGroup', invoke: (b, o) => b.replaceGroup(0, 'B291', o) },
  { label: 'builder.addElement', name: 'addElement', invoke: (b, o) => b.addElement('B291', o) },
  { label: 'builder.insertElement', name: 'insertElement', invoke: (b, o) => b.insertElement(0, 'B291', o) },
  { label: 'builder.replaceElement', name: 'replaceElement', invoke: (b, o) => b.replaceElement(0, 'B291', o) },
  { label: 'builder.addGlyph', name: 'addGlyph', invoke: (b, o) => b.addGlyph('B291', o) },
  { label: 'builder.addPart', name: 'addPart', invoke: (b, o) => b.addPart('B81', o) },
  { label: 'handle.addGlyph', name: 'addGlyph', invoke: (b, o) => b.group(0).addGlyph('B291', o) },
  { label: 'handle.insertGlyph', name: 'insertGlyph', invoke: (b, o) => b.group(0).insertGlyph(0, 'B291', o) },
  { label: 'handle.replaceGlyph', name: 'replaceGlyph', invoke: (b, o) => b.group(0).replaceGlyph(0, 'B291', o) },
  { label: 'handle.addPart', name: 'addPart', invoke: (b, o) => b.group(0).glyph(0).addPart('B81', o) },
  { label: 'handle.insertPart', name: 'insertPart', invoke: (b, o) => b.group(0).glyph(0).insertPart(0, 'B81', o) },
  { label: 'handle.replacePart', name: 'replacePart', invoke: (b, o) => b.group(0).glyph(0).replacePart(0, 'B81', o) },
  { label: 'glyph.replace', name: 'replace', invoke: (b, o) => b.group(0).glyph(0).replace('B291', o) },
  { label: 'part.replace', name: 'replace', invoke: (b, o) => b.group(0).glyph(0).part(0).replace('B81', o) },
  { label: 'handle.setOptions', name: 'setOptions', invoke: (b, o) => b.group(0).setOptions(o) },
];

// Glyph-family call sites that forward a code's parse warnings before merging
// opts: pre-fix they leak MISPLACED_GLOBAL_OPTION, then crash raw.
const GLYPH_FORWARDING = [
  ['builder.addGlyph', (b) => b.addGlyph('[grid]B291', 'red')],
  ['handle.addGlyph', (b) => b.group(0).addGlyph('[grid]B291', 'red')],
  ['handle.insertGlyph', (b) => b.group(0).insertGlyph(0, '[grid]B291', 'red')],
  ['handle.replaceGlyph', (b) => b.group(0).replaceGlyph(0, '[grid]B291', 'red')],
];

describe('BlissSVGBuilder opts-arg validation', () => {
  describe('when opts is not an object', () => {
    it.each([
      ['a string', 'red'],
      ['a number', 5],
      ['a boolean', true],
      ['an array', ['red']],
      // falsy-but-not-nullish: the guard is "nullish or object", not "any
      // falsy value ok"; pins the opts == null boundary against a !opts mutant
      ['an empty string', ''],
      ['zero', 0],
      ['false', false],
    ])('rejects %s with a designed TypeError naming the method', (_label, badOpts) => {
      const b = new BlissSVGBuilder('B208');
      expect(() => b.addGlyph('B291', badOpts)).toThrow(TypeError);
      expect(() => b.addGlyph('B291', badOpts)).toThrow('addGlyph() options must be an object');
    });
  });

  describe('when a non-object opts is passed to any mutator', () => {
    describe.each(MUTATORS.map((m) => [m.label, m]))('%s', (_label, { name, invoke }) => {
      it('throws the designed TypeError and leaves the builder untouched', () => {
        const b = new BlissSVGBuilder('B208');
        const before = stateOf(b);
        expect(() => invoke(b, 'red')).toThrow(`${name}() options must be an object`);
        expect(stateOf(b)).toBe(before);
      });
    });
  });

  describe("when a rejected opts would have leaked the code's parse warning", () => {
    it.each(GLYPH_FORWARDING)(
      '%s throws without leaking the code warning',
      (_label, call) => {
        const b = new BlissSVGBuilder('B208');
        expect(() => call(b)).toThrow(TypeError);
        expect(warningCodes(b)).toEqual([]);
      }
    );

    it('empty-builder addGlyph throws without leaking or scaffolding a group', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addGlyph('[grid]B291', 'red')).toThrow(TypeError);
      expect(warningCodes(b)).toEqual([]);
      expect(b.toString()).toBe('');
    });
  });

  describe('when the replace index is out of range and opts is not an object', () => {
    // The opts guard sits beside the code guard, before the range check: a bad
    // opts is a bad opts whether or not the index would have resolved.
    it.each([
      ['builder.replaceGroup', (b) => b.replaceGroup(999, 'B291', 'red'), 'replaceGroup'],
      ['builder.replaceElement', (b) => b.replaceElement(999, 'B291', 'red'), 'replaceElement'],
      ['handle.replaceGlyph', (b) => b.group(0).replaceGlyph(999, 'B291', 'red'), 'replaceGlyph'],
      ['handle.replacePart', (b) => b.group(0).glyph(0).replacePart(999, 'B81', 'red'), 'replacePart'],
    ])('%s throws instead of silently no-opping', (_label, call, name) => {
      const b = new BlissSVGBuilder('B208');
      expect(() => call(b)).toThrow(`${name}() options must be an object`);
    });
  });

  describe('when opts is an empty object', () => {
    it('does not stamp options:{} onto an appended group', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGroup('B208', {});
      const groups = b.toJSON().groups;
      expect(groups[groups.length - 1].options).toBeUndefined();
    });

    it('does not stamp options:{} onto an appended glyph', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGlyph('B208', {});
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[glyphs.length - 1].options).toBeUndefined();
    });

    it('does not stamp options:{} onto an empty-created group', () => {
      const b = new BlissSVGBuilder('');
      b.addGroup('', {});
      const groups = b.toJSON().groups;
      expect(groups[groups.length - 1].options).toBeUndefined();
    });

    it('is a no-op on setOptions rather than a throw', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).setOptions({})).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when opts is nullish', () => {
    it('treats undefined as no options', () => {
      const b = new BlissSVGBuilder('B208');
      expect(() => b.addGlyph('B291', undefined)).not.toThrow();
      expect(b.toJSON().groups[0].glyphs[1].options).toBeUndefined();
    });

    it('treats null as no options', () => {
      const b = new BlissSVGBuilder('B208');
      expect(() => b.addGlyph('B291', null)).not.toThrow();
      expect(b.toJSON().groups[0].glyphs[1].options).toBeUndefined();
    });
  });

  describe('when opts is a valid options object', () => {
    it('applies a flat object as overrides', () => {
      const b = new BlissSVGBuilder('B208');
      b.addGlyph('B291', { color: 'red' });
      expect(b.toJSON().groups[0].glyphs[1].options).toEqual({ color: 'red' });
    });

    it('applies a defaults/overrides object with overrides winning', () => {
      const b = new BlissSVGBuilder('B208');
      b.addGlyph('B291', { defaults: { color: 'blue' }, overrides: { color: 'red' } });
      expect(b.toJSON().groups[0].glyphs[1].options).toEqual({ color: 'red' });
    });
  });
});
