import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins which `href` values build a link: an address with no URL scheme (a
 * relative reference) and the `http:`, `https:`, `mailto:` and `tel:` schemes
 * build one; every other scheme, and an `href` that holds no address, builds
 * none, in silence.
 *
 * Covers:
 * - Relative references (`page.html`, `./rel`, `../up`, `?q=1`, `help`,
 *   `example.com/x`) building a link on a part, a character, a word and the
 *   whole picture.
 * - The four schemes building a link in any case, and other schemes (`ftp:`,
 *   `file:`, `blob:`) building none, with no warning.
 * - The scheme read by the URL grammar: a letter, then letters, digits, `+`,
 *   `-` and `.`, up to the first colon, so a scheme that only starts or ends
 *   like an allowed one is refused, and a colon after anything else (`1x:y`,
 *   `a b:c`) is no scheme.
 * - Control characters inside or before a scheme ignored, however many, so a
 *   split `javascript:` is still refused.
 * - A character reference never spelling a scheme: the `&` stays escaped on
 *   every input route, so the browser reads `&#106;avascript:` as text.
 * - An `href` that holds no address building no link: a bare key, an empty or
 *   blank value, and link attributes with no `href` at global scope.
 * - A JavaScript number or `false` drawing what its saved string draws.
 *
 * Does NOT cover:
 * - The `javascript:`, `data:` and `vbscript:` refusals, the `<a>` wrapper and
 *   its attributes, see `BlissSVGBuilder.clickable-links.test.js`.
 * - The global link's markup and hit rect, see
 *   `BlissSVGBuilder.global-link-attributes.test.js`.
 * - An element link's clickable area, see
 *   `BlissSVGBuilder.element-link-area.test.js`.
 */

const ENTITY_HREF = '&#106;avascript:alert(1)';

// The <a> open tag every link with nothing but an href gets.
const linkTo = (href) => `<a href="${href}" style="cursor: pointer;">`;

// A B313 whose character carries the href, set from JavaScript.
const characterWithHref = (href) => {
  const builder = new BlissSVGBuilder('B313');
  builder.glyph(0).setOptions({ href });
  return builder;
};

describe('BlissSVGBuilder link href schemes', () => {
  describe('when the href is a relative reference', () => {
    it.each(['page.html', './rel', '../up', '?q=1', 'help', 'example.com/x'])(
      'builds a link to %s, in silence',
      (href) => {
        const builder = new BlissSVGBuilder(`[href=${href}]B313`);

        expect(builder.svgCode).toContain(linkTo(href));
        expect(builder.warnings).toEqual([]);
      },
    );

    it.each([
      ['a part', 'B313;[href=page.html]>B81'],
      ['a word', '[href=page.html]|B313/B291'],
      ['the whole picture', '[href=page.html]||B313'],
    ])('builds the link on %s', (_scope, input) => {
      expect(new BlissSVGBuilder(input).svgCode).toContain(linkTo('page.html'));
    });
  });

  describe('when the href names a scheme', () => {
    it.each(['https://example.com', 'HTTP://example.com', 'mailto:a@example.com', 'tel:+46123'])(
      'builds a link to %s',
      (href) => {
        expect(new BlissSVGBuilder(`[href=${href}]B313`).svgCode).toContain(linkTo(href));
      },
    );

    it.each(['ftp://example.com/f', 'file:///etc/hosts', 'blob:https://example.com/id'])(
      'builds no link to %s, in silence',
      (href) => {
        const builder = new BlissSVGBuilder(`[href=${href}]B313`);

        expect(builder.svgCode).not.toContain('<a');
        expect(builder.warnings).toEqual([]);
      },
    );

    // pins the allowlist's anchors: a scheme that starts or ends like an
    // allowed one is a scheme of its own
    it.each(['telnet://example.com', 'hotel:x'])('builds no link to %s', (href) => {
      expect(new BlissSVGBuilder(`[href=${href}]B313`).svgCode).not.toContain('<a');
    });

    // pins the scheme grammar's characters after the first letter
    it.each(['h2:x', 'web+app:x', 'x-y:z', 'x.y:z'])(
      'reads all of %s before the colon as a scheme and builds no link',
      (href) => {
        expect(new BlissSVGBuilder(`[href=${href}]B313`).svgCode).not.toContain('<a');
      },
    );

    // pins the scheme's start: a letter, at the start of the value
    it.each(['1x:y', ':x', 'a b:c', 'é:x'])(
      'builds a link to %s, whose colon follows no scheme',
      (href) => {
        expect(new BlissSVGBuilder(`[href="${href}"]B313`).svgCode).toContain(linkTo(href));
      },
    );
  });

  describe('when control characters sit inside or before a scheme', () => {
    it.each([
      ['a tab', 'java\tscript:alert(1)'],
      ['a newline', 'java\nscript:alert(1)'],
      ['a carriage return', 'java\rscript:alert(1)'],
      ['a NUL', 'java\0script:alert(1)'],
      ['a DEL', 'java\x7fscript:alert(1)'],
      ['a control character before it', '\x01javascript:alert(1)'],
      // pins the removal of every control character, not only the first: one left in place
      // hides the scheme from the check, while a browser strips it and runs the script
      ['two control characters before it', '\x01\x02javascript:alert(1)'],
      ['two control characters inside it', 'java\t\nscript:alert(1)'],
    ])('still reads javascript: through %s and builds no link', (_what, href) => {
      expect(characterWithHref(href).svgCode).not.toContain('<a');
    });
  });

  describe('when a character reference could spell a scheme', () => {
    beforeAll(() => {
      BlissSVGBuilder.define({
        C36_LINKED: { type: 'glyph', codeString: 'B313', defaultOptions: { href: ENTITY_HREF } },
      });
    });
    afterAll(() => {
      BlissSVGBuilder.removeDefinition('C36_LINKED');
    });

    it.each([
      ['the DSL, on a character', () => new BlissSVGBuilder(`[href="${ENTITY_HREF}"]B313`)],
      ['the DSL, on the whole picture', () => new BlissSVGBuilder(`[href="${ENTITY_HREF}"]||B313`)],
      ["the constructor's options", () => new BlissSVGBuilder('B313', { href: ENTITY_HREF })],
      ["the builder's setOptions()", () => new BlissSVGBuilder('B313').setOptions({ href: ENTITY_HREF })],
      ["a handle's setOptions()", () => characterWithHref(ENTITY_HREF)],
      ['a composition object', () => new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'B313', parts: [{ codeName: 'B313' }], options: { href: ENTITY_HREF } }] }],
      })],
      ["a definition's own options", () => new BlissSVGBuilder('C36_LINKED')],
    ])('keeps the & escaped from %s, so the link holds text and no scheme', (_route, make) => {
      const svg = make().svgCode;

      expect(svg).toContain(linkTo('&amp;#106;avascript:alert(1)'));
      expect(svg).not.toContain('href="&#106;');
    });

    it('keeps the & of a named reference escaped too', () => {
      const svg = new BlissSVGBuilder('[href="javascript&colon;alert(1)"]B313').svgCode;

      expect(svg).toContain(linkTo('javascript&amp;colon;alert(1)'));
    });
  });

  describe('when the href holds no address', () => {
    it.each([
      ['a bare key', '[href]B313'],
      ['an empty value', '[href=]B313'],
      ['a blank value', '[href="  "]B313'],
      ['a bare key on the whole picture', '[href]||B313'],
      ['an empty value on the whole picture', '[href=]||B313'],
      ['link attributes with no href on the whole picture', '[target=_blank]||B313'],
    ])('builds no link from %s, in silence', (_what, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).not.toContain('<a');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when JavaScript gives the href as a number or false', () => {
    it.each([
      [404, '[href=404]B313'],
      [false, '[href=false]B313'],
    ])('draws %s as its saved string %s draws it', (value, saved) => {
      const builder = characterWithHref(value);

      expect(builder.toString()).toBe(saved);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(saved).svgCode);
    });

    it('builds a link to a number', () => {
      expect(characterWithHref(404).svgCode).toContain(linkTo('404'));
    });
  });
});
