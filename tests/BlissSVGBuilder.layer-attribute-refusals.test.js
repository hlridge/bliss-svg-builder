import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins what the `<target>--<attribute>` channel refuses, and what it writes as
 * is. The channel is RAW, which means the library does not rename or
 * reinterpret an attribute; it does not mean the library will help write a
 * file that cannot be parsed.
 *
 * Covers:
 * - `xmlns` refused on every layer, not only the root: a second namespace
 *   declaration moves that subtree out of SVG.
 * - `data-generator` left alone on a layer, where it collides with nothing,
 *   and still guarded on the root, where it is the library's own stamp.
 * - The link attributes behind a target, the root's included, written as is
 *   and in silence like any other attribute behind a prefix, saved as written
 *   and reloaded silently: only the bare global `href` builds a link.
 * - A key naming a target that does not exist, an empty target half and an
 *   empty attribute half, each reported once, each with its own reason, and
 *   each round-tripping. An attribute name carrying its own `--` joins them,
 *   behind any prefix, because the last-dash split reads it as a target nothing
 *   carries.
 * - The root facing the library's own refusals behind its own prefix, the
 *   provenance stamp among them: naming the root deliberately does not get past
 *   a guard the bare spelling faces.
 * - A known layer that is not currently drawn staying silent, since the
 *   criterion is a target the library knows and not one it is emitting.
 * - A layer attribute name refused by the safety gate.
 *
 * Does NOT cover:
 * - `xmlns` at the scopes that are not layers (word, character, part, object
 *   input, the transient channel), where the same refusal reaches, see
 *   `BlissSVGBuilder.document-namespace.test.js`.
 * - The channel working: which element each prefix lands on, and the raw name
 *   emission, see `BlissSVGBuilder.layer-attributes.test.js`.
 * - A layer key written below global scope, see the same file, and one whose
 *   name is refused here, which reports this file's refusal there too, see
 *   `BlissSVGBuilder.name-refusal-scope.test.js`.
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

    it('names the whole key that was written', () => {
      const warning = new BlissSVGBuilder('[content--xmlns=x]||B291').warnings
        .find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      // `source` is the fragment the author can search their own input for,
      // and `xmlns` is not a fragment of `content--xmlns`; the prefix is what
      // tells this refusal apart from the bare one
      expect(warning.source).toBe('content--xmlns');
    });

    it('tells two refusals in one bracket apart', () => {
      const sources = new BlissSVGBuilder('[xmlns=a;grid--xmlns=b]||B291').warnings
        .filter(w => w.code === 'RESERVED_ATTRIBUTE_NAME')
        .map(w => w.source);

      expect(sources).toEqual(['xmlns', 'grid--xmlns']);
    });

    it('keeps the root parseable as SVG', () => {
      const builder = new BlissSVGBuilder('[content--xmlns=http://example.com]||B291');

      expect(rootTag(builder.svgCode)).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    // The prefix suspends name RESOLUTION, never the guards, and the guard is
    // judged case-insensitively because an SVG pasted into an HTML page has its
    // attribute names lowercased there, turning XMLNS into a real declaration.
    it('refuses it behind a prefix in another casing', () => {
      const builder = new BlissSVGBuilder('[content--XMLNS=http://example.com]||B291');

      expect(builder.svgCode).not.toContain('XMLNS=');
      expect(builder.svgCode).not.toContain('http://example.com');
      expect(codes(builder)).toContain('RESERVED_ATTRIBUTE_NAME');
    });
  });

  describe('when a layer key names the library stamp the root carries', () => {
    it('emits data-generator on the layer, where it collides with nothing', () => {
      const builder = new BlissSVGBuilder('[content--data-generator=me]||B291');

      expect(builder.svgCode).toMatch(/<g class="bliss-content"[^>]* data-generator="me">/);
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
    ])('writes %s on the content group as written, silently', (name, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toMatch(new RegExp(`<g class="bliss-content"[^>]* ${name}="`));
      expect(builder.svgCode).not.toContain('<a ');
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['grid group', '[grid;grid--href=https://example.com]||B291', /<g class="bliss-grid"[^>]* href="https:\/\/example\.com"/],
      ['background group', '[background=beige;background--href=https://example.com]||B291', /<g class="bliss-background"[^>]* href="https:\/\/example\.com"/],
      ['sky line', '[grid;grid-line--sky--href=https://example.com]||B291', /class="[^"]*bliss-grid-line--sky"[^>]* href="https:\/\/example\.com"/],
      ['root', '[root--href=https://example.com]||B291', /<svg [^>]* href="https:\/\/example\.com"/],
    ])('writes href on the %s as written, silently, and builds no link', (_target, input, placed) => {
      // a link attribute behind a prefix is an attribute like any other: the
      // author named where it goes, and only the bare global href builds an <a>
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toMatch(placed);
      expect(builder.svgCode).not.toContain('<a ');
      expect(builder.warnings).toEqual([]);
    });

    it('emits content--href on the content group and on nothing else', () => {
      const svg = new BlissSVGBuilder('[content--href=https://example.com]||B291').svgCode;

      expect(occurrences(svg, 'href=')).toBe(1);
      expect(rootTag(svg)).not.toContain('href=');
    });

    it('emits nothing and stays silent when the layer is not drawn', () => {
      const builder = new BlissSVGBuilder('[grid--href=https://example.com]||B291');

      expect(builder.svgCode).not.toContain('example.com');
      expect(builder.warnings).toEqual([]);
    });

    it('leaves the bare global spelling building its anchor wrap', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com]||B291');

      expect(builder.svgCode).toContain('<a href="https://example.com"');
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      '[content--href=https://example.com]||B291',
      '[grid;grid--href=https://example.com]||B291',
      '[background=beige;background--href=https://example.com]||B291',
      '[grid;grid-line--sky--href=https://example.com]||B291',
      '[root--href=https://example.com]||B291',
      '[grid--href=https://example.com]||B291',
    ])('saves %s as written and reloads it silently to the same picture', (input) => {
      const builder = new BlissSVGBuilder(input);
      const reloaded = new BlissSVGBuilder(builder.toString());

      expect(builder.toString()).toBe(input);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(reloaded.warnings).toEqual([]);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('keeps the key in the serialized string', () => {
      const builder = new BlissSVGBuilder('[content--href=https://example.com]||B291');

      expect(builder.toString()).toContain('content--href=https://example.com');
    });
  });

  describe('when a layer key does not resolve to a layer and an attribute', () => {
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

    it.each([
      ['an unknown layer', '[foo--x=1]||B291'],
      ['an empty layer name', '[--x=1]||B291'],
      ['no attribute at all', '[content--=oops]||B291'],
    ])('reports %s exactly once', (_case, input) => {
      // `--x` used to draw UNSAFE_ATTRIBUTE_NAME as well, because the whole key
      // was judged as the attribute name when the layer half did not resolve
      expect(new BlissSVGBuilder(input).warnings).toHaveLength(1);
    });

    it('tells an unknown target name from an empty one', () => {
      const unknown = new BlissSVGBuilder('[foo--x=1]||B291').warnings[0];
      const empty = new BlissSVGBuilder('[--x=1]||B291').warnings[0];

      // `source` is the fragment the author searches their own input for, and
      // nothing else in the suite pins it for this code
      expect(unknown.source).toBe('foo--x');
      expect(empty.source).toBe('--x');
      expect(unknown.message).toContain('names no target the library knows');
      expect(unknown.message).toContain('grid-line--sky');
      expect(empty.message).toContain('no target name');
      expect(empty.message).not.toContain('names no target the library knows');
      // both carry the remedy, and it is the clause an author ACTS on: the one
      // wrong spelling it could name is the prefixed one, which this vocabulary
      // refuses (`bliss-grid--opacity` is an UNKNOWN_LAYER row above)
      for (const warning of [unknown, empty]) {
        expect(warning.message).toContain('Write the attribute with no prefix to put it on the symbol.');
      }
    });

    it('sends an attribute that describes the image to the root in the remedy', () => {
      // a bare global key styles the symbol, except the closed list of
      // attributes that describe the image, which go on the root <svg>
      const warning = new BlissSVGBuilder('[foo--role=img]||B291').warnings[0];

      expect(warning.message).toContain('Write the attribute with no prefix to put it on the root <svg>.');
    });

    it('does not call the content target unknown when only the attribute is missing', () => {
      const warning = new BlissSVGBuilder('[content--=oops]||B291').warnings[0];

      expect(warning.message).toContain('no attribute');
      expect(warning.message).not.toMatch(/no target/);
    });

    it.each([
      ['content', '[content--=oops]||B291'],
      ['grid', '[grid--=oops]||B291'],
      ['background', '[background--=oops]||B291'],
      ['grid-line--sky', '[grid-line--sky--=oops]||B291'],
    ])('names the %s target it did resolve', (target, input) => {
      const warning = new BlissSVGBuilder(input).warnings[0];

      // several targets, because a message that hardcoded one name, or dropped
      // the name entirely, would still read correctly against a single case; the
      // last row is a compound target, which the split must read whole
      expect(warning.message).toContain(`names the ${target} target`);
    });
  });

  describe('when a refused layer key is stored and read back', () => {
    it.each([
      ['a reserved name', '[content--xmlns=x]||B291', 'RESERVED_ATTRIBUTE_NAME'],
      ['an unsafe name', '[content--onclick=alert(1)]||B291', 'UNSAFE_ATTRIBUTE_NAME'],
      ['an unknown layer', '[foo--x=1]||B291', 'UNKNOWN_LAYER'],
      ['an empty layer name', '[--x=1]||B291', 'UNKNOWN_LAYER'],
      ['an empty attribute name', '[content--=oops]||B291', 'UNKNOWN_LAYER'],
      ['a forged provenance stamp', '[root--data-generator=mine]||B291', 'RESERVED_ATTRIBUTE_NAME'],
      ['an unreachable attribute name', '[content--data--foo=1]||B291', 'UNKNOWN_LAYER'],
    ])('reports %s again after a round trip', (_case, input, code) => {
      const written = new BlissSVGBuilder(input).toString();

      // the key is kept rather than deleted so a stored composition keeps
      // telling its author what is wrong with it; keeping it and then going
      // quiet on reparse would be the worst of both
      expect(written).toBe(input);
      expect(codes(new BlissSVGBuilder(written))).toContain(code);
    });
  });

  describe('when a layer key names a layer that is known but not drawn', () => {
    it('emits nothing and stays silent, matching the named grid options', () => {
      const builder = new BlissSVGBuilder('[grid--opacity=0.3]||B291');

      // the criterion is a layer the library KNOWS, not one it happens to be
      // drawing; `[grid-color=red]` with the grid off is silent the same way
      expect(builder.svgCode).not.toContain('opacity');
      expect(builder.warnings).toEqual([]);
    });

    it('emits it as soon as that layer is switched on', () => {
      const builder = new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291');

      expect(builder.svgCode).toContain('opacity="0.3"');
      expect(builder.warnings).toEqual([]);
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
