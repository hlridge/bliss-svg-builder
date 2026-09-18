import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the argument guard on the three removal methods: a key is a name, and a
 * call carrying anything else is refused before it touches the composition.
 *
 * `removeOptions(...keys: string[])` is what `src/index.d.ts` declares, so a
 * TypeScript caller cannot reach this; a JavaScript one can, and used to get an
 * internal message from whichever string helper happened to run first. The
 * all-or-nothing property is the other half: the refusal used to land mid-loop,
 * so an earlier key in the same call had already been applied.
 *
 * Covers:
 * - All three removal sites, on every non-name a caller can pass.
 * - The thrown error naming the method the caller called.
 * - Nothing applied when one key in a call is bad.
 * - A call with no keys at all, which asks for nothing and is not an error.
 *
 * Does NOT cover:
 * - WHICH option a name resolves to, see
 *   `BlissSVGBuilder.option-removal-naming.test.js`.
 * - The options argument of the setters, guarded separately by assertOptsArg.
 */

const NOT_A_NAME = [
  ['a number', 5],
  ['null', null],
  ['undefined', undefined],
  ['a symbol', Symbol('x')],
  ['an object', {}],
  ['an array', []],
  ['a boolean', true],
];

const decoratedGlyph = () => new BlissSVGBuilder('[color=red]B291');

const glyphWithTransient = () => {
  const builder = new BlissSVGBuilder('B291');
  builder.glyph(0).setTransientOptions({ opacity: '0.5' });
  return builder;
};

const builderWithTransient = () => {
  const builder = new BlissSVGBuilder('B291');
  builder.setTransientOptions({ opacity: '0.5' });
  return builder;
};

describe('BlissSVGBuilder removal argument guard', () => {
  describe('when a removal is handed a key that is not a name', () => {
    it.each(NOT_A_NAME)('removeOptions refuses %s', (_label, key) => {
      expect(() => decoratedGlyph().glyph(0).removeOptions(key)).toThrow(TypeError);
      expect(() => decoratedGlyph().glyph(0).removeOptions(key))
        .toThrow('removeOptions() option names must be strings');
    });

    it.each(NOT_A_NAME)("an element's removeTransientOptions refuses %s", (_label, key) => {
      expect(() => glyphWithTransient().glyph(0).removeTransientOptions(key)).toThrow(TypeError);
      expect(() => glyphWithTransient().glyph(0).removeTransientOptions(key))
        .toThrow('removeTransientOptions() option names must be strings');
    });

    it.each(NOT_A_NAME)("the builder's removeTransientOptions refuses %s", (_label, key) => {
      expect(() => builderWithTransient().removeTransientOptions(key)).toThrow(TypeError);
      expect(() => builderWithTransient().removeTransientOptions(key))
        .toThrow('removeTransientOptions() option names must be strings');
    });
  });

  describe('when a bad key sits beside a good one', () => {
    it('leaves the option the caller named alongside it untouched', () => {
      // regression: the refusal used to land mid-loop, so `color` was already
      // deleted by the time the second key threw
      const builder = decoratedGlyph();
      expect(() => builder.glyph(0).removeOptions('color', null)).toThrow(TypeError);
      expect(builder.toString()).toBe('[color=red]B291');
    });

    it('refuses on a bad key written first, before anything is read', () => {
      const builder = decoratedGlyph();
      expect(() => builder.glyph(0).removeOptions(null, 'color')).toThrow(TypeError);
      expect(builder.toString()).toBe('[color=red]B291');
    });
  });

  describe('when every key is a name', () => {
    it('removes the option named', () => {
      const builder = decoratedGlyph();
      builder.glyph(0).removeOptions('color');
      expect(builder.toString()).toBe('B291');
    });

    it('removes a transient option named on an element', () => {
      const builder = glyphWithTransient();
      builder.glyph(0).removeTransientOptions('opacity');
      expect(builder.svgCode).not.toContain('opacity="0.5"');
    });

    it('removes a transient option named on the builder', () => {
      const builder = builderWithTransient();
      builder.removeTransientOptions('opacity');
      expect(builder.svgCode).not.toContain('opacity="0.5"');
    });

    it('accepts a call naming no key at all', () => {
      const builder = decoratedGlyph();
      expect(() => builder.glyph(0).removeOptions()).not.toThrow();
      expect(() => builder.glyph(0).removeTransientOptions()).not.toThrow();
      expect(() => builder.removeTransientOptions()).not.toThrow();
      expect(builder.toString()).toBe('[color=red]B291');
    });
  });
});
