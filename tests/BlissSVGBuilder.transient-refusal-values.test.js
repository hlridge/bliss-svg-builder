/**
 * Pins how the transient channel refuses a key it cannot carry, whatever the
 * key holds, and that a target-prefixed key written on it is judged as on
 * every other route.
 *
 * A key read while the composition is built rather than while it is drawn (a
 * position, a kerning value, the element key) cannot be a transient option.
 * Holding a value with no text form, it is reported as that misplacement and
 * not as a bad value, so the value does not decide which defect the author
 * hears about. A target-prefixed key has its target judged before its
 * attribute here too, so `--x` reports the unknown target it reports in a
 * bracket.
 *
 * Covers:
 * - A refused key holding a value with no text form, through the builder, a
 *   character and a composition object's `transientOptions`: the misplacement
 *   in the channel's exact words, once per key, still there after an edit.
 * - The one report a bag of text values gets, its keys joined.
 * - An ordinary key with no text form, and a position written outside the
 *   channel, each keeping its own report.
 * - A target-prefixed key whose whole key is not a usable name (`--x`,
 *   `nosuch--a b`): reported for its target, as in a bracket, and re-derived on
 *   every rebuild rather than repeated; a known target's unusable attribute
 *   still reported as unsafe.
 *
 * Does NOT cover:
 * - The channel's rules for text values, see
 *   `BlissSVGBuilder.transient-options.test.js`.
 * - Every refused key through each of the three transient routes, see the
 *   sweep in `BlissSVGBuilder.name-refusal-values.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

const afterMutating = (mutate) => {
  const builder = new BlissSVGBuilder('B291');
  mutate(builder);
  return builder;
};

const compositionWithTransient = (transientOptions) => ({ ...new BlissSVGBuilder('B291').toJSON(), transientOptions });

const reports = (builder) => builder.warnings.map(({ code, message, source }) => ({ code, message, source }));
const codesAndSources = (builder) => builder.warnings.map(({ code, source }) => [code, source]);
const codes = (builder) => builder.warnings.map((w) => w.code);

// The channel's refusal, after the quoted keys it names.
const CANNOT_BE_TRANSIENT = 'cannot be a transient option: the value is read while the composition is built, '
  + 'not while it is drawn, so it would never reach the picture. Set it with setOptions() instead.';

describe('BlissSVGBuilder transient refusal values', () => {
  describe('when a key the transient channel refuses carries a value with no text form', () => {
    it('reports a position holding null as a key the channel refuses, in its exact words', () => {
      // pins the refusal's wording, which the two places that report it share
      const builder = afterMutating((b) => b.setTransientOptions({ x: null }));

      expect(reports(builder)).toEqual([
        { code: 'MISPLACED_TRANSIENT_OPTION', message: `"x" ${CANNOT_BE_TRANSIENT}`, source: 'x' },
      ]);
    });

    it('reports the element key holding null', () => {
      const builder = afterMutating((b) => b.setTransientOptions({ key: null }));

      expect(codesAndSources(builder)).toEqual([['MISPLACED_TRANSIENT_OPTION', 'key']]);
    });

    it('names a kerning key by the spelling it is stored under', () => {
      const builder = afterMutating((b) => b.glyph(0).setTransientOptions({ relativeKerning: undefined }));

      expect(codesAndSources(builder)).toEqual([['MISPLACED_TRANSIENT_OPTION', 'relative-kerning']]);
    });

    it("reports one in a composition object's transientOptions", () => {
      const builder = new BlissSVGBuilder(compositionWithTransient({ 'absolute-kerning': { a: 1 } }));

      expect(codes(builder)).toEqual(['MISPLACED_TRANSIENT_OPTION']);
    });

    it('still reports it after the composition has been rebuilt', () => {
      // the key is dropped, so a report derived again from the rebuilt tree
      // would vanish on the first edit
      const builder = afterMutating((b) => b.setTransientOptions({ x: null }));
      builder.addGroup('B99');

      expect(codesAndSources(builder)).toEqual([['MISPLACED_TRANSIENT_OPTION', 'x']]);
    });

    it('reports such a key on its own beside the keys of the bag that hold text', () => {
      const builder = afterMutating((b) => b.setTransientOptions({ x: null, y: 5 }));

      expect(reports(builder)).toEqual([
        { code: 'MISPLACED_TRANSIENT_OPTION', message: `"x" ${CANNOT_BE_TRANSIENT}`, source: 'x' },
        { code: 'MISPLACED_TRANSIENT_OPTION', message: `"y" ${CANNOT_BE_TRANSIENT}`, source: 'y' },
      ]);
    });

    it('joins the keys of a bag holding text into one report', () => {
      // pins how the keys are joined, which the one-key rows cannot see
      const builder = afterMutating((b) => b.setTransientOptions({ x: 1, y: 5 }));

      expect(reports(builder)).toEqual([
        { code: 'MISPLACED_TRANSIENT_OPTION', message: `"x", "y" ${CANNOT_BE_TRANSIENT}`, source: 'x' },
      ]);
    });

    it('leaves an ordinary key holding null to the value refusal', () => {
      // pins that only the keys the channel cannot carry are its to refuse
      const builder = afterMutating((b) => b.setTransientOptions({ color: null }));

      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('leaves a position written outside the channel to the position gate', () => {
      // pins that the misplacement is the transient channel's alone
      const builder = afterMutating((b) => b.glyph(0).setOptions({ x: null }));

      expect(codes(builder)).toEqual(['MALFORMED_COORDINATES']);
    });
  });

  describe('when a target-prefixed key is written on the transient channel', () => {
    it('reports an empty target as a bracket does', () => {
      // pins the target judged before the whole key: judged whole, `--x` is an
      // unsafe name and would report UNSAFE_ATTRIBUTE_NAME
      const builder = afterMutating((b) => b.setTransientOptions({ '--x': 'x' }));

      expect(codes(builder)).toEqual(['UNKNOWN_LAYER']);
      expect(reports(builder)).toEqual(reports(new BlissSVGBuilder('[--x=1]||B291')));
    });

    it('reports a target that does not exist even when its attribute is not a usable name', () => {
      const builder = afterMutating((b) => b.setTransientOptions({ 'nosuch--a b': 'x' }));

      expect(codesAndSources(builder)).toEqual([['UNKNOWN_LAYER', 'nosuch--a b']]);
    });

    it("reports one in a composition object's transientOptions for its target", () => {
      const builder = new BlissSVGBuilder(compositionWithTransient({ '--x': 'x' }));

      expect(codes(builder)).toEqual(['UNKNOWN_LAYER']);
    });

    it('emits nothing for it, and reports it once however often the composition is rebuilt', () => {
      // note: the key stays in the transient bag, which no save reads, so its
      // report is derived again on each rebuild, like any kept name refusal
      const builder = afterMutating((b) => b.setTransientOptions({ '--x': 'x' }));

      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      builder.addGroup('B99');
      builder.addGroup('B99');
      expect(codes(builder)).toEqual(['UNKNOWN_LAYER']);
    });

    it("still reports a known target's attribute that is not a usable name as unsafe", () => {
      const builder = afterMutating((b) => b.setTransientOptions({ 'content--a b': 'x' }));

      expect(codes(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(reports(builder)).toEqual(reports(new BlissSVGBuilder('B291', { 'content--a b': 'x' })));
    });

    it('words the advice for the character when the key is written on one', () => {
      const builder = afterMutating((b) => b.glyph(0).setTransientOptions({ '--x': 'x' }));

      expect(codes(builder)).toEqual(['UNKNOWN_LAYER']);
      expect(builder.warnings[0].message).toMatch(/put it on this element\.$/);
    });
  });
});
