import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that `xmlns` is refused wherever it is written, and reported once. It
 * is the one attribute name that states what the FILE is rather than anything
 * about the picture: a second declaration re-binds the default namespace for
 * that element and everything under it, so those paths stop being SVG, no
 * renderer draws them, and this library's own `svgElement` getter cannot parse
 * the result. The reach is the point, since the damage does not depend on
 * which element carries it.
 *
 * Covers:
 * - Refusal at global, word, character and part scope, from the DSL, from
 *   object input, and from the transient channel.
 * - Exactly one `xmlns` surviving in the document, the library's own.
 * - One report per rebuild, not one per render.
 * - `data-generator` NOT refused below the root, where the name collides with
 *   nothing and is an ordinary data attribute the author set.
 * - The refused key surviving `toString()` and reporting again on reparse.
 *
 * Does NOT cover:
 * - The three layer spellings (`content--xmlns` and its siblings), which the
 *   layer channel owns, see `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 * - The layer channel's other refusals (the link attributes, an unknown
 *   layer, an unsafe name), see the same file.
 * - Which element an accepted attribute lands on, see
 *   `BlissSVGBuilder.layer-attributes.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const codes = (builder) => builder.warnings.map(w => w.code);
const namespaceCount = (svg) => (svg.match(/xmlns=/g) || []).length;

describe('BlissSVGBuilder document namespace', () => {
  describe('when xmlns is written at any scope', () => {
    it.each([
      ['global', '[xmlns=http://example.com]||B291'],
      ['word', '[xmlns=http://example.com]|B291'],
      ['character', '[xmlns=http://example.com]B291'],
      ['part', '[xmlns=http://example.com]>B291'],
    ])('refuses it at %s scope and reports it once', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).not.toContain('http://example.com');
      expect(namespaceCount(builder.svgCode)).toBe(1);
      // exactly one, in both directions: global scope is judged in the split
      // loop and every other scope in the every-scope pass, so a guard that
      // ran in both would report the global spelling twice
      expect(codes(builder).filter(c => c === 'RESERVED_ATTRIBUTE_NAME')).toHaveLength(1);
    });

    it('keeps the library declaration on the root', () => {
      const builder = new BlissSVGBuilder('[xmlns=http://example.com]B291');

      expect(rootTag(builder.svgCode)).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('reports it exactly once per rebuild, not once per render', () => {
      const builder = new BlissSVGBuilder('[xmlns=http://example.com]B291');
      builder.svgCode;
      builder.svgCode;

      expect(codes(builder).filter(c => c === 'RESERVED_ATTRIBUTE_NAME')).toHaveLength(1);
    });

    it('names the key that was written', () => {
      const warning = new BlissSVGBuilder('[xmlns=http://example.com]B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      expect(warning.source).toBe('xmlns');
      expect(warning.message).toContain('out of SVG');
    });

    it.each([
      ['a word', { groups: [{ options: { xmlns: 'http://example.com' }, glyphs: [{ parts: [{ codeName: 'B291' }] }] }] }],
      ['a character', { groups: [{ glyphs: [{ options: { xmlns: 'http://example.com' }, parts: [{ codeName: 'B291' }] }] }] }],
      ['a part', { groups: [{ glyphs: [{ parts: [{ codeName: 'B291', options: { xmlns: 'http://example.com' } }] }] }] }],
    ])('refuses it on %s from object input too', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).not.toContain('http://example.com');
      expect(namespaceCount(builder.svgCode)).toBe(1);
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('refuses it in the transient channel of a single character', () => {
      const builder = new BlissSVGBuilder('B291/B313');
      builder.element(0).glyph(0).setTransientOptions({ xmlns: 'http://example.com' });

      expect(builder.svgCode).not.toContain('http://example.com');
      expect(namespaceCount(builder.svgCode)).toBe(1);
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('keeps the written key so a stored composition reports it again', () => {
      const builder = new BlissSVGBuilder('[xmlns=http://example.com]B291');

      expect(builder.toString()).toContain('xmlns=http://example.com');
      expect(codes(new BlissSVGBuilder(builder.toString()))).toContain('RESERVED_ATTRIBUTE_NAME');
    });
  });

  describe('when the library stamp is written below the root', () => {
    it('emits it at character scope, where the name collides with nothing', () => {
      const builder = new BlissSVGBuilder('[data-generator=me]B291');

      expect(builder.svgCode).toContain('data-generator="me"');
      expect(codes(builder)).not.toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('still refuses it on the root itself', () => {
      const builder = new BlissSVGBuilder('[data-generator=me]||B291');

      expect(builder.svgCode).not.toContain('data-generator="me"');
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });
  });
});
