import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins what the `<layer>--<attribute>` channel refuses. The channel is RAW,
 * which means the library does not rename or reinterpret an attribute; it does
 * not mean the library will help write a file that cannot be parsed, or ship
 * an attribute that looks like a working link and is not one. Three refusals,
 * each on its own reason.
 *
 * Covers:
 * - `xmlns` refused on every layer, not only the root: a second namespace
 *   declaration moves that subtree out of SVG.
 * - `data-generator` left alone on a layer, where it collides with nothing,
 *   and still guarded on the root, where it is the library's own stamp.
 * - The link attributes dropped from every layer with a report, since a link
 *   is an `<a>` element and no layer is one.
 * - A key naming a layer that does not exist, an empty layer half and an empty
 *   attribute half, each reported once and each round-tripping.
 * - A layer attribute name refused by the safety gate.
 *
 * Does NOT cover:
 * - The channel working: which element each prefix lands on, and the raw name
 *   emission, see `BlissSVGBuilder.layer-attributes.test.js`.
 * - A layer key written below global scope, see the same file.
 * - The bare global `href` building an `<a>` wrap, see
 *   `BlissSVGBuilder.global-link-attributes.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const codes = (builder) => builder.warnings.map(w => w.code);
const occurrences = (svg, needle) => (svg.match(new RegExp(needle, 'g')) || []).length;

describe('BlissSVGBuilder layer attribute refusals', () => {
  describe('when a layer key names the attribute that declares the document', () => {
    it.each([
      ['content', '[content--xmlns=http://example.com]||B291'],
      ['grid', '[grid;grid--xmlns=http://example.com]||B291'],
      ['background', '[background=beige;background--xmlns=http://example.com]||B291'],
    ])('refuses xmlns on the %s layer and reports it', (_layer, input) => {
      const builder = new BlissSVGBuilder(input);

      // a second namespace declaration moves the subtree out of SVG, so the
      // document stops being one no matter which level it is written at
      expect(builder.svgCode).not.toContain('http://example.com');
      expect(occurrences(builder.svgCode, 'xmlns=')).toBe(1);
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('names the refused attribute rather than the whole key', () => {
      const warning = new BlissSVGBuilder('[content--xmlns=x]||B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      expect(warning.source).toBe('xmlns');
    });

    it('keeps the root parseable as SVG', () => {
      const builder = new BlissSVGBuilder('[content--xmlns=http://example.com]||B291');

      expect(rootTag(builder.svgCode)).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
  });

  describe('when a layer key names the library stamp the root carries', () => {
    it('emits data-generator on the layer, where it collides with nothing', () => {
      const builder = new BlissSVGBuilder('[content--data-generator=me]||B291');

      expect(builder.svgCode).toContain('<g class="bliss-content" data-generator="me">');
      expect(codes(builder)).not.toContain('RESERVED_ATTRIBUTE_NAME');
    });

    it('keeps the library stamp on the root itself', () => {
      const builder = new BlissSVGBuilder('[content--data-generator=me]||B291');

      expect(rootTag(builder.svgCode)).toMatch(/data-generator="bliss-svg-builder/);
    });
  });

  describe('when a layer key names a link attribute', () => {
    it.each([
      ['href', '[content--href=https://example.com]||B291'],
      ['target', '[content--target=_blank]||B291'],
      ['rel', '[content--rel=noopener]||B291'],
      ['download', '[content--download=x]||B291'],
      ['hreflang', '[content--hreflang=en]||B291'],
      ['type', '[content--type=text]||B291'],
      ['referrerpolicy', '[content--referrerpolicy=no-referrer]||B291'],
    ])('drops %s from the content layer and reports it', (name, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).not.toContain(`${name}=`);
      expect(codes(builder)).toContain('MISPLACED_LINK_ATTRIBUTE');
    });

    it.each([
      ['grid', '[grid;grid--href=https://example.com]||B291'],
      ['background', '[background=beige;background--href=https://example.com]||B291'],
    ])('drops href from the %s layer and reports it', (_layer, input) => {
      const builder = new BlissSVGBuilder(input);

      // it was emitted onto a bare <rect> or <g>, which does nothing at all,
      // so the markup looked like a link that had simply stopped working
      expect(builder.svgCode).not.toContain('https://example.com');
      expect(codes(builder)).toContain('MISPLACED_LINK_ATTRIBUTE');
    });

    it('names the attribute and the layer in the warning', () => {
      const warning = new BlissSVGBuilder('[content--href=https://example.com]||B291').warnings
        .find(w => w.code === 'MISPLACED_LINK_ATTRIBUTE');

      expect(warning.source).toBe('content--href');
      expect(warning.message).toContain('href');
      expect(warning.message).toContain('content');
    });

    it('reports the layer spelling even when the layer is not drawn', () => {
      const builder = new BlissSVGBuilder('[grid--href=https://example.com]||B291');

      expect(codes(builder)).toContain('MISPLACED_LINK_ATTRIBUTE');
    });

    it('leaves the bare global spelling building its anchor wrap', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com]||B291');

      expect(builder.svgCode).toContain('<a href="https://example.com"');
      expect(codes(builder)).not.toContain('MISPLACED_LINK_ATTRIBUTE');
    });

    it('keeps the refused key in the serialized string', () => {
      const builder = new BlissSVGBuilder('[content--href=https://example.com]||B291');

      expect(builder.toString()).toContain('content--href=https://example.com');
    });
  });

  describe('when a global key names a layer that is not emitted', () => {
    it.each([
      ['an unknown layer', '[foo--x=1]||B291', 'foo--x=1'],
      ['an empty layer name', '[--x=1]||B291', '--x=1'],
      ['no attribute at all', '[content--=oops]||B291', 'content--=oops'],
    ])('warns UNKNOWN_LAYER for %s, emits nothing, and round-trips', (_case, input, written) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.some(w => w.code === 'UNKNOWN_LAYER')).toBe(true);
      expect(builder.svgCode).not.toContain('foo--x');
      expect(builder.svgCode).not.toContain('="oops"');
      expect(builder.svgCode).not.toMatch(/\s="/);
      expect(builder.toString()).toContain(written);
    });
  });

  describe('when a layer attribute name is refused by the safety gate', () => {
    it('keeps an event handler out of the markup', () => {
      const svg = new BlissSVGBuilder('[content--onclick=alert(1)]||B291').svgCode;

      expect(svg).not.toContain('onclick');
      expect(svg).not.toContain('alert(1)');
    });
  });
});
