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
 * - Both reserved names refused in any casing, since an SVG placed inline in an
 *   HTML page has its attribute names lowercased by the HTML parser, which
 *   turns a written `XMLNS` into a real second namespace declaration.
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

    it('names the key that was written and why the name is refused', () => {
      const warning = new BlissSVGBuilder('[xmlns=http://example.com]B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      expect(warning.source).toBe('xmlns');
      // the reason is the only thing carrying WHY, since one code covers both
      // reserved names and they are refused for unrelated reasons
      expect(warning.message).toContain('declares what the file is');
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

  describe('when a reserved name is written in another casing', () => {
    // An SVG served as its own file keeps `XMLNS` distinct from `xmlns` and the
    // name is merely dead; the same markup pasted into an HTML page is
    // lowercased by the parser and the declaration becomes real. Judging the
    // name case-insensitively is what makes the guard hold on both routes.
    it.each([
      ['the root', '[XMLNS=http://example.com]||B291', 'XMLNS'],
      ['a character', '[XMLNS=http://example.com]B291', 'XMLNS'],
      ['the root, mixed case', '[Xmlns=http://example.com]||B291', 'Xmlns'],
    ])('refuses the namespace declaration on %s', (_scope, input, written) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).not.toContain(`${written}=`);
      expect(builder.svgCode).not.toContain('http://example.com');
      expect(namespaceCount(builder.svgCode)).toBe(1);
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('refuses it from the options argument too', () => {
      const builder = new BlissSVGBuilder('B291', { XMLNS: 'http://example.com' });

      expect(builder.svgCode).not.toContain('XMLNS=');
      expect(namespaceCount(builder.svgCode)).toBe(1);
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('refuses the library stamp on the root in another casing', () => {
      const builder = new BlissSVGBuilder('[DATA-GENERATOR=me]||B291');

      expect(builder.svgCode).not.toContain('DATA-GENERATOR=');
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('still leaves the stamp alone below the root in any casing', () => {
      const builder = new BlissSVGBuilder('[DATA-GENERATOR=me]B291');

      expect(builder.svgCode).toContain('DATA-GENERATOR="me"');
      expect(codes(builder)).not.toContain('RESERVED_ATTRIBUTE_NAME');
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

    it('gives its own reason, not the namespace one', () => {
      const stamp = new BlissSVGBuilder('[data-generator=me]||B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');
      const namespace = new BlissSVGBuilder('[xmlns=x]||B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      // the two reserved sets were split apart precisely because one sentence
      // covering both would be true of neither, and nothing else checks that
      expect(stamp.message).toContain("the library's own stamp");
      expect(stamp.message).toContain('tells its reader nothing');
      expect(stamp.message).not.toContain('out of SVG');
      expect(namespace.message).not.toContain('stamp');
    });
  });
});
