import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that an attribute name the safety gate refuses is REPORTED at every
 * scope, not skipped in silence. The refusal itself is old behaviour and is
 * correct; what was missing is that only the transient channel said so, while
 * the global, word, character, part and layer scopes dropped the key without a
 * word and handed it straight back from `toString()`.
 *
 * Covers:
 * - `UNSAFE_ATTRIBUTE_NAME` at global, word, character, part and layer scope,
 *   from the DSL and from object input.
 * - The refused name never reaching the markup, and the other options in the
 *   same bracket surviving.
 * - The key surviving `toString()` and re-warning on reparse, so a stored
 *   composition never goes quiet about it.
 * - One warning per rebuild rather than one per render.
 *
 * Does NOT cover:
 * - The transient channel, which already reported this, see
 *   `BlissSVGBuilder.transient-options.test.js`.
 * - Prototype-polluting key names not mutating Object.prototype, see
 *   `BlissSVGBuilder.option-hardening.test.js`.
 * - Which element a safe attribute lands on, see
 *   `BlissSVGBuilder.layer-attributes.test.js`.
 */

const unsafeWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'UNSAFE_ATTRIBUTE_NAME');

describe('BlissSVGBuilder unsafe attribute names', () => {
  describe('when an event handler is written at any scope', () => {
    it.each([
      ['global', '[onclick=alert(1)]||B291'],
      ['word', '[onclick=alert(1)]|B291'],
      ['character', '[onclick=alert(1)]B291'],
      ['part', '[onclick=alert(1)]>B291'],
      ['layer', '[content--onclick=alert(1)]||B291'],
    ])('warns UNSAFE_ATTRIBUTE_NAME at %s scope and emits nothing', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(unsafeWarnings(builder)).toHaveLength(1);
      expect(builder.svgCode).not.toContain('onclick');
      expect(builder.svgCode).not.toContain('alert(1)');
      expect(builder.svgCode).toContain('<path');
    });

    it.each([
      ['a bare global key', '[onclick=alert(1)]||B291', 'onclick'],
      ['a layer key', '[content--onclick=alert(1)]||B291', 'content--onclick'],
    ])('names %s alone, without the value that came with it', (_case, input, expected) => {
      const [warning] = unsafeWarnings(new BlissSVGBuilder(input));

      // the name is what was refused, so the name is the whole fragment that
      // triggered the warning; the value triggered nothing
      expect(warning.source).toBe(expected);
    });

    it('keeps the other options written in the same bracket', () => {
      const builder = new BlissSVGBuilder('[onclick=alert(1);fill=red]|B291');

      expect(unsafeWarnings(builder)).toHaveLength(1);
      expect(builder.svgCode).toContain('fill="red"');
    });
  });

  describe('when a name carries characters outside the legal set', () => {
    it.each([
      ['a leading underscore', '[__proto__=x]||B291'],
      ['a digit first', '[9lives=x]||B291'],
    ])('warns UNSAFE_ATTRIBUTE_NAME for %s', (_case, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(unsafeWarnings(builder)).toHaveLength(1);
    });
  });

  describe('when the composition is stored and read back', () => {
    it('keeps the key in the string and warns again on reparse', () => {
      const builder = new BlissSVGBuilder('[onclick=alert(1)]||B291');
      const reparsed = new BlissSVGBuilder(builder.toString());

      expect(builder.toString()).toContain('onclick');
      expect(unsafeWarnings(reparsed)).toHaveLength(1);
      expect(reparsed.svgCode).not.toContain('onclick');
    });
  });

  describe('when the same builder is rendered repeatedly', () => {
    it('reports the refusal once rather than once per render', () => {
      const builder = new BlissSVGBuilder('[onclick=alert(1)]||B291');
      builder.svgCode;
      builder.svgCode;

      expect(unsafeWarnings(builder)).toHaveLength(1);
    });
  });

  describe('when the key arrives through object input', () => {
    it('warns for a global key and for an element-level one alike', () => {
      const global = new BlissSVGBuilder('B291', { onclick: 'alert(1)' });
      const element = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], options: { onclick: 'alert(1)' } }] }],
      });

      expect(unsafeWarnings(global)).toHaveLength(1);
      expect(unsafeWarnings(element)).toHaveLength(1);
      expect(global.svgCode).not.toContain('onclick');
      expect(element.svgCode).not.toContain('onclick');
    });
  });

  describe('when a legal name resembles a refused one', () => {
    it('leaves the curated vocabulary and ordinary attributes alone', () => {
      const builder = new BlissSVGBuilder('[opacity=0.5;stroke-dasharray=2;data-x=1]||[x=2]B291');

      expect(unsafeWarnings(builder)).toHaveLength(0);
    });
  });
});
