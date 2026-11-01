import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index';
import { BlissElement } from '../src/lib/bliss-element.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the `[href=...]` bracket option's <a>-tag wrapping behavior across the
 * BlissSVGBuilder pipeline and the BlissElement element-rendering layer: the
 * rendered SVG places an `<a>` element around the styled group/path content,
 * carries a configured set of anchor attributes, partitions anchor- vs
 * group-bound attributes at the element layer, rejects HTML injection and
 * unsafe protocols, strips event-handler attributes, and respects the four
 * hierarchical option levels.
 *
 * Covers:
 * - `<a>` wrapping when `href` is set; `style="cursor: pointer;"` and a
 *   transparent hit rect as the first child, inside the element's `<g>` when
 *   it has one, are part of the wrapper contract (the rect's geometry is
 *   pinned in `BlissSVGBuilder.element-link-area.test.js`).
 * - Standard anchor attribute pass-through: `target`, `rel`, `download`,
 *   `hreflang`, `type`, `referrerpolicy`, and combinations.
 * - Anchor / group attribute separation: stroke/fill/opacity stay on `<g>`,
 *   never bleed onto `<a>`; a custom `pointer-events` lands on that `<g>`,
 *   around the hit rect.
 * - `href` applied at the global / word / character / part levels, including
 *   stacked hrefs at multiple levels in one expression.
 * - Mixed clickable + non-clickable content: characters or words without
 *   `href` render as `<g>` siblings to anchor-wrapped ones.
 * - HTML injection in `href` values escaped (markup or a quote in a value with
 *   no scheme links as escaped text) and ampersand escaping in safe href
 *   values.
 * - Event-handler attribute blocking on `on*` bracket-option keys, including
 *   case-insensitive variants, while preserving legitimate sibling attributes.
 * - `href` protocol allowlist: `javascript:` / `data:` / `vbscript:` (including
 *   case-insensitive and leading-whitespace variants) are rejected; `http:`,
 *   `https:`, relative, and fragment URLs are accepted.
 * - Element-rendering layer anchor mechanics: the `<a>` wraps raw-path and
 *   already-tagged child content correctly, `download`/`hreflang` stay on the
 *   anchor (not the inner group), and only anchor-related options pass through
 *   the root wrapper from `new BlissElement({ options })` direct construction.
 * - Edge-case href input handling: surrounding whitespace is preserved in the
 *   emitted href; control characters in the href value pass protocol
 *   validation (validator strips them before allowlist matching) and remain
 *   in the rendered attribute.
 * - Defensive group-wrapping safety: `parts: [{ options: null }]` at the leaf
 *   level does not throw and renders the path content directly.
 *
 * Does NOT cover:
 * - Which `href` values build a link (relative references, the four schemes,
 *   the scheme grammar, an `href` with no address), see
 *   `BlissSVGBuilder.link-href-schemes.test.js`.
 * - Global-scope link attributes staying off the content wrapper
 *   `<g class="bliss-content">`, see
 *   `BlissSVGBuilder.global-link-attributes.test.js`.
 * - The four-level hierarchical option cascade for non-href options (color,
 *   stroke-width, fill), see `BlissSVGBuilder.hierarchical-options.test.js`.
 * - Stroke/color cascade behavior outside the anchor-wrapped scope, see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - HTML-escaping in non-href contexts (svg-title, svg-desc), see
 *   `BlissSVGBuilder.svg-metadata.test.js`.
 */
describe('BlissSVGBuilder clickable links', () => {
  describe('when href creates the anchor wrapper', () => {
    it('wraps element in <a> tag when href is provided', () => {
      const builder = new BlissSVGBuilder('[href="https://example.com"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
      expect(svg).toContain('</a>');
    });

    it('includes style="cursor: pointer;" on <a> tags', () => {
      const builder = new BlissSVGBuilder('[href=#test]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('style="cursor: pointer;"');
    });

    it('does not create <a> tag without href attribute', () => {
      const builder = new BlissSVGBuilder('[target=_blank]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<a');
      expect(svg).not.toContain('</a>');
    });

    it('puts a transparent hit rect first inside the anchor when href is provided', () => {
      const builder = new BlissSVGBuilder('[href="/page"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="/page" style="cursor: pointer;">');
      expect(svg).toMatch(/<a href="\/page" style="cursor: pointer;"><rect [^>]*fill="transparent" stroke="none"\/><path d="/);
      expect(svg).not.toContain('pointer-events');
    });
  });

  describe('when standard anchor attributes are set', () => {
    it('includes target attribute', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com;target=_blank]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('href="https://example.com"');
      expect(svg).toContain('target="_blank"');
      expect(svg).toContain('<a');
    });

    it('includes rel attribute', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com;rel="noopener noreferrer"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('rel="noopener noreferrer"');
    });

    it('includes download attribute', () => {
      const builder = new BlissSVGBuilder('[href="/file.pdf";download=document.pdf]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('download="document.pdf"');
    });

    it('includes hreflang attribute', () => {
      const builder = new BlissSVGBuilder('[href="/en/page";hreflang=en]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('hreflang="en"');
    });

    it('includes type attribute', () => {
      const builder = new BlissSVGBuilder('[href="/file.pdf";type="application/pdf"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('type="application/pdf"');
    });

    it('includes referrerpolicy attribute', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com;referrerpolicy=no-referrer]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('referrerpolicy="no-referrer"');
    });

    it('includes multiple anchor attributes', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com;target=_blank;rel=noopener;download=file]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('href="https://example.com"');
      expect(svg).toContain('target="_blank"');
      expect(svg).toContain('rel="noopener"');
      expect(svg).toContain('download="file"');
    });
  });

  describe('when an anchor wraps a styled group', () => {
    it('separates anchor attributes from group attributes', () => {
      const builder = new BlissSVGBuilder('[href=https://example.com;stroke=red]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
      expect(svg).toContain('<g stroke="red"');
      expect(svg).toContain('</g></a>');
    });

    it('puts the hit rect first inside the <g> inside <a>', () => {
      const builder = new BlissSVGBuilder('[href=#test;fill=blue]B291');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<a href="#test" style="cursor: pointer;"><g fill="blue"><rect [^>]*fill="transparent" stroke="none"\/><path d="/);
    });

    it('handles multiple styling attributes in <g> tag', () => {
      const builder = new BlissSVGBuilder('[href="/page";stroke=red;fill=blue;opacity=0.5]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="/page"');
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('fill="blue"');
      expect(svg).toContain('opacity="0.5"');
      expect(svg).toMatch(/<g stroke="red" fill="blue" opacity="0.5"><rect [^>]*fill="transparent" stroke="none"\/>/);
      expect(svg).not.toContain('pointer-events');
    });

    it('puts the hit rect inside a custom pointer-events group, which governs it', () => {
      const builder = new BlissSVGBuilder('[href=#test;pointer-events=none]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('pointer-events="none"');
      expect(svg).not.toContain('pointer-events="bounding-box"');
      expect(svg).toMatch(/<g pointer-events="none"><rect [^>]*fill="transparent" stroke="none"\/>/);
    });
  });

  describe('when href is applied at different hierarchical levels', () => {
    it('applies href at global level', () => {
      const builder = new BlissSVGBuilder('[href="https://example.com"]||B291/B318');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
    });

    it('applies href at word level', () => {
      const builder = new BlissSVGBuilder('[href="/page"]|B291/B318');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="/page" style="cursor: pointer;">');
    });

    it('applies href at character level', () => {
      const builder = new BlissSVGBuilder('[href=#char]B291/[href=#other]B318');
      const svg = builder.svgCode;

      expect(svg).toContain('href="#char"');
      expect(svg).toContain('href="#other"');
    });

    it('applies href at part level', () => {
      const builder = new BlissSVGBuilder('[href="#part"]>H;E');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="#part" style="cursor: pointer;">');
    });

    it('handles multiple levels with different hrefs', () => {
      const builder = new BlissSVGBuilder('[href="/global"]||[href="/word"]|[href="/char"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('href="/global"');
      expect(svg).toContain('href="/word"');
      expect(svg).toContain('href="/char"');
    });
  });

  describe('when content mixes clickable and non-clickable elements', () => {
    it('creates <a> for elements with href, <g> for elements without', () => {
      const builder = new BlissSVGBuilder('[href="#link"]B291/[stroke="red"]B318');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="#link"');
      expect(svg).toContain('</a>');
      expect(svg).toContain('<g stroke="red">');
      expect(svg).toContain('</g>');
    });

    it('handles words with different link configurations', () => {
      const builder = new BlissSVGBuilder('[href="/page1"]|B291//[stroke="blue"]|B318');
      const svg = builder.svgCode;

      const linkMatch = svg.match(/<a href="\/page1"/);
      const groupMatch = svg.match(/<g stroke="blue"/);

      expect(linkMatch).toBeTruthy();
      expect(groupMatch).toBeTruthy();
    });
  });

  describe('when href values contain HTML injection attempts', () => {
    it('escapes markup in an href, which links as text', () => {
      const builder = new BlissSVGBuilder('[href="<script>alert(1)</script>"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="&lt;script&gt;alert(1)&lt;/script&gt;"');
      expect(svg).not.toContain('<script>');
    });

    it('escapes a quote in an href, so it cannot close the attribute', () => {
      const builder = new BlissSVGBuilder('[href="test\\"value"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="test&quot;value"');
    });

    it('escapes ampersands in href', () => {
      const builder = new BlissSVGBuilder('[href="/page?foo=1&bar=2"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('&amp;');
    });
  });

  describe('when bracket options contain event-handler attributes', () => {
    it('blocks onclick at element level', () => {
      const builder = new BlissSVGBuilder('[onclick=alert(1)]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('onclick');
    });

    it('blocks onload at global level', () => {
      const builder = new BlissSVGBuilder('[onload=alert(1)]||B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('onload');
    });

    it('blocks onmouseover (case-insensitive)', () => {
      const builder = new BlissSVGBuilder('[OnMouseOver=alert(1)]B291');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/onmouseover/i);
    });

    it('preserves legitimate attributes alongside blocked ones', () => {
      const builder = new BlissSVGBuilder('[fill=red;onclick=alert(1)]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('fill="red"');
      expect(svg).not.toContain('onclick');
    });
  });

  describe('when href protocols are validated against an allowlist', () => {
    it('blocks javascript: protocol', () => {
      const builder = new BlissSVGBuilder('[href="javascript:alert(1)"]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('javascript:');
      expect(svg).not.toContain('<a');
    });

    it('blocks data: protocol', () => {
      const builder = new BlissSVGBuilder('[href="data:text/html,<script>alert(1)</script>"]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<a');
    });

    it('blocks vbscript: protocol', () => {
      const builder = new BlissSVGBuilder('[href="vbscript:msgbox"]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<a');
    });

    it('blocks javascript: with leading whitespace', () => {
      const builder = new BlissSVGBuilder('[href="  javascript:alert(1)"]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<a');
    });

    it('blocks javascript: case-insensitively', () => {
      const builder = new BlissSVGBuilder('[href="JAVASCRIPT:alert(1)"]B291');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<a');
    });

    it('allows safe http: URLs', () => {
      const builder = new BlissSVGBuilder('[href="http://example.com"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="http://example.com"');
    });

    it('allows safe https: URLs', () => {
      const builder = new BlissSVGBuilder('[href="https://example.com"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="https://example.com"');
    });

    it('allows relative URLs', () => {
      const builder = new BlissSVGBuilder('[href="/page"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="/page"');
    });

    it('allows fragment URLs', () => {
      const builder = new BlissSVGBuilder('[href="#section"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="#section"');
    });
  });

  describe('when clickable links combine with cascade and styling', () => {
    it('handles nested structure with links at multiple levels', () => {
      const builder = new BlissSVGBuilder('[href="/global";stroke="black"]||[href="/word";fill="red"]|B291/B318');
      const svg = builder.svgCode;

      expect(svg).toContain('href="/global"');
      expect(svg).toContain('href="/word"');
      expect(svg).toContain('stroke="black"');
      expect(svg).toContain('fill="red"');
      expect(svg).not.toContain('bounding-box');
      // one hit rect for the global link, one for the word's
      expect(svg.match(/fill="transparent" stroke="none"/g)).toHaveLength(2);
    });

    it('handles all anchor attributes together with styling', () => {
      const builder = new BlissSVGBuilder('[href="https://example.com";target="_blank";rel="noopener";download="file";stroke="red";fill="blue"]B291');
      const svg = builder.svgCode;

      expect(svg).toContain('<a href="https://example.com" target="_blank" rel="noopener" download="file" style="cursor: pointer;">');
      expect(svg).toMatch(/<g stroke="red" fill="blue"><rect [^>]*fill="transparent" stroke="none"\/>/);
    });

    it('nests <a> > <g> > <path> in that order', () => {
      const builder = new BlissSVGBuilder('[href="/test";color="green"]B291');
      const svg = builder.svgCode;

      const aIndex = svg.indexOf('<a ');
      const gIndex = svg.indexOf('<g stroke');
      const pathIndex = svg.indexOf('<path');
      const closeGIndex = svg.lastIndexOf('</g>', svg.indexOf('</a>'));
      const closeAIndex = svg.indexOf('</a>');

      expect(aIndex).toBeLessThan(gIndex);
      expect(gIndex).toBeLessThan(pathIndex);
      expect(pathIndex).toBeLessThan(closeGIndex);
      expect(closeGIndex).toBeLessThan(closeAIndex);
    });
  });

  describe('when the anchor wraps element-rendering output', () => {
    const RAW_LEAF = '_C15_RAW_LEAF';
    let previousRawLeaf;

    beforeAll(() => {
      previousRawLeaf = blissElementDefinitions[RAW_LEAF];
      blissElementDefinitions[RAW_LEAF] = {
        getPath: (x, y) => `M${x},${y}h2`,
        width: 2,
        height: 1,
        isShape: true
      };
    });

    afterAll(() => {
      if (previousRawLeaf === undefined) {
        delete blissElementDefinitions[RAW_LEAF];
      } else {
        blissElementDefinitions[RAW_LEAF] = previousRawLeaf;
      }
    });

    it('wraps raw path content in a path when a linked element also has group attributes', () => {
      const builder = new BlissSVGBuilder('[href=/root;fill=red]B291');

      expect(builder.svgCode)
        .toMatch(/<a href="\/root" style="cursor: pointer;"><g fill="red"><rect [^>]*fill="transparent" stroke="none"\/><path d="/);
    });

    it('does not wrap already-tagged child content as path data', () => {
      const builder = new BlissSVGBuilder('[href=/root]||[fill=red]|B291');

      // the global link sits outside the content group, holding its rect; the
      // word's tagged group stays inside
      expect(builder.svgCode).toContain(
        '<a href="/root" style="cursor: pointer;">\n    <rect x="-0.75" y="-0.75" width="100%" height="100%" fill="transparent" stroke="none"/>\n    <g class="bliss-content"');
      expect(builder.svgCode).toMatch(/<g class="bliss-content"[^>]*>\n\s*<g fill="red"><path d="/);
      expect(builder.svgCode).not.toContain('<path d="<g');
    });

    it('keeps download and hreflang on the anchor rather than the inner group', () => {
      const builder = new BlissSVGBuilder('[href=/file.pdf;download=document.pdf;hreflang=sv;fill=red]B291');
      const anchorTag = builder.svgCode.match(/<a [^>]+>/)?.[0];
      const groupTag = builder.svgCode.match(/<g fill="red"[^>]*>/)?.[0];

      expect(anchorTag).toContain('download="document.pdf"');
      expect(anchorTag).toContain('hreflang="sv"');
      expect(groupTag).not.toContain('download=');
      expect(groupTag).not.toContain('hreflang=');
    });

    it('writes no link at the root level from direct BlissElement construction', () => {
      // The whole anchor family and `fill` are uncurated, so the builder's
      // options pass puts every one of them in the author's bag. A hand-built
      // node carries them where a built one would, and the root level writes
      // none of them: the builder draws the global link around the content
      // group, see global-link-attributes.test.js.
      const element = new BlissElement({
        authoredOptions: {
          href: '/root',
          target: '_blank',
          rel: 'noopener',
          download: 'file.svg',
          hreflang: 'sv',
          type: 'image/svg+xml',
          fill: 'red'
        },
        groups: [{ glyphs: [{ parts: [{ codeName: RAW_LEAF }] }] }]
      });
      const content = element.getSvgContent();

      expect(content).toBe('M0,0h2');
    });
  });

  describe('when href values contain edge-case characters', () => {
    it('preserves surrounding whitespace verbatim in the rendered href', () => {
      const builder = new BlissSVGBuilder('[href="  /page  "]B291');

      expect(builder.svgCode).toContain('<a href="  /page  "');
    });

    it('passes protocol validation when the href contains an embedded control character', () => {
      const href = `ht${String.fromCharCode(0)}tp://example.com`;
      const builder = new BlissSVGBuilder('B291', { overrides: { href } });

      expect(builder.svgCode).toContain(`<a href="${href}"`);
    });
  });

  describe('when a leaf part carries explicit null options', () => {
    it('renders the path content without throwing during group wrapping', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{ codeName: 'HL2', options: null }]
          }]
        }]
      });

      expect(() => element.getSvgContent()).not.toThrow();
      expect(element.getSvgContent()).toBe('M0,0h2');
    });
  });
});
