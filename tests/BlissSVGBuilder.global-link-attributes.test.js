import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the global link: a bare global `href` builds one `<a>` around the
 * symbol's content group, from outside it, holding a transparent rect over the
 * whole viewBox, so the picture is clickable anywhere. The anchor family (href,
 * target, rel, download, hreflang, type, referrerpolicy) goes on that `<a>` and
 * on no other element.
 *
 * Covers:
 * - The exact markup: the `<a>` after the paper and the grid, the rect first
 *   inside it at the viewBox's origin, then the content group.
 * - The full anchor family on the `<a>`, kept off the root and the content
 *   group; a non-link key beside it landing on the content group.
 * - No link at all for an href the allowlist refuses, or for link attributes
 *   without an href.
 * - One emitted viewBox for the link rect, the paper and the zones: an author's
 *   `viewBox` when it reads as four numbers with a non-negative size, else the
 *   computed one.
 * - `svgContent` holding the composition alone, without the global link.
 * - An element link staying inside the content group.
 * - Byte parity across the DSL, the constructor options and the transient
 *   channel, a reload from both serializers, and a removed transient `href`
 *   taking its link with it.
 *
 * Does NOT cover:
 * - Element-scope anchor mechanics (attribute separation, the protocol
 *   allowlist, href at each level), see `BlissSVGBuilder.clickable-links.test.js`.
 * - An element link's clickable area, see
 *   `BlissSVGBuilder.element-link-area.test.js`.
 * - The `<target>--` spelling of an anchor name, written as is, see
 *   `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 * - Where every other bare global key lands, see
 *   `BlissSVGBuilder.global-placement.test.js`.
 */

// The root <svg ...> open tag, and the <g class="bliss-content" ...> open tag.
const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const contentGroupTag = (svg) => svg.match(/<g class="bliss-content"[^>]*>/)[0];
const viewBoxOf = (svg) => rootTag(svg).match(/viewBox="([^"]*)"/)[1].split(' ');
const linkRect = (x, y) =>
  `<rect x="${x}" y="${y}" width="100%" height="100%" fill="transparent" stroke="none"/>`;

describe('BlissSVGBuilder global link attributes', () => {
  describe('when href is set at the global level', () => {
    it('wraps the content group in one link holding a rect over the viewBox', () => {
      const svg = new BlissSVGBuilder('[href=https://a.b]||B313').svgCode;

      expect(svg.slice(svg.indexOf('  <a '))).toBe([
        '  <a href="https://a.b" style="cursor: pointer;">',
        `    ${linkRect(-0.75, -0.75)}`,
        '    <g class="bliss-content" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">',
        '      <path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>',
        '    </g>',
        '  </a>',
        '</svg>',
      ].join('\n'));
      expect(svg).not.toContain('pointer-events');
    });

    it('draws the paper and the grid before the link', () => {
      const svg = new BlissSVGBuilder('[href=#x;background=red;grid]||B313').svgCode;
      const at = (text) => svg.indexOf(text);

      expect(at('<g class="bliss-background"')).toBeGreaterThan(-1);
      expect(at('<g class="bliss-background"')).toBeLessThan(at('<g class="bliss-grid"'));
      expect(at('<g class="bliss-grid"')).toBeLessThan(at('<a href="#x"'));
      expect(svg).toContain(`<a href="#x" style="cursor: pointer;">\n    ${linkRect(-0.75, -0.75)}\n    <g class="bliss-content"`);
    });

    it('keeps href off both layers and on the anchor', () => {
      const svg = new BlissSVGBuilder('[href=https://example.com]||B313').svgCode;
      expect(rootTag(svg)).not.toContain('href=');
      expect(contentGroupTag(svg)).not.toContain('href=');
      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
    });

    it('strips the full anchor-attribute family from both layers while the anchor carries it', () => {
      const svg = new BlissSVGBuilder(
        '[href=https://example.com;target=_blank;rel=noopener;download=file;hreflang=en;type="image/svg+xml";referrerpolicy=no-referrer]||B313'
      ).svgCode;
      const contentTag = contentGroupTag(svg);
      const anchorTag = svg.match(/<a [^>]+>/)[0];
      for (const attr of ['href=', 'target=', 'rel=', 'download=', 'hreflang=', 'type=', 'referrerpolicy=']) {
        expect(rootTag(svg)).not.toContain(attr);
        expect(contentTag).not.toContain(attr);
        expect(anchorTag).toContain(attr);
      }
    });

    it('writes every anchor attribute in order on the link and a styling key on the content group', () => {
      // pins each member of the anchor family by name: a name dropped from the
      // list would land on the content group instead
      const svg = new BlissSVGBuilder(
        '[href=/root;target=_blank;rel=noopener;download=file.svg;hreflang=sv;type=image/svg+xml;referrerpolicy=no-referrer;fill=red]||B291'
      ).svgCode;

      expect(svg).toContain('<a href="/root" target="_blank" rel="noopener" download="file.svg" hreflang="sv" type="image/svg+xml" referrerpolicy="no-referrer" style="cursor: pointer;">');
      expect(contentGroupTag(svg)).toContain(' fill="red"');
      expect(contentGroupTag(svg)).not.toMatch(/\s(href|target|rel|download|hreflang|type|referrerpolicy)=/);
      expect(rootTag(svg)).not.toMatch(/\s(href|target|rel|download|hreflang|type|referrerpolicy)=/);
    });

    it('leaves the element-scope anchor untouched', () => {
      const svg = new BlissSVGBuilder('[href=https://example.com]B313').svgCode;
      expect(rootTag(svg)).not.toContain('href=');
      expect(contentGroupTag(svg)).not.toContain('href=');
      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
    });

    it('keeps an element link inside the content group, with no rect over the viewBox', () => {
      const svg = new BlissSVGBuilder('[href=#x]B313').svgCode;

      expect(svg.indexOf('<a href="#x"')).toBeGreaterThan(svg.indexOf('<g class="bliss-content"'));
      expect(svg).not.toContain('width="100%"');
    });

    it('leaves the link out of svgContent, which holds the composition alone', () => {
      const builder = new BlissSVGBuilder('[href=#x]||B313');

      expect(builder.svgContent).not.toContain('<a');
      expect(builder.svgCode).toContain('<a href="#x"');
    });
  });

  describe('when the viewBox is cropped or written', () => {
    it('puts the rect at the cropped viewBox origin', () => {
      const svg = new BlissSVGBuilder('[crop-left=2;href=#x]||B313').svgCode;
      const [x, y] = viewBoxOf(svg);

      expect(x).toBe('1.25');
      expect(svg).toContain(linkRect(x, y));
    });

    it.each([
      ['a written viewBox', '[viewBox=0 0 10 10;href=#x]||B313'],
      ['a root-- viewBox', '[root--viewBox=0 0 10 10;href=#x]||B313'],
    ])('puts the rect at the origin of %s', (_case, input) => {
      expect(new BlissSVGBuilder(input).svgCode).toContain(linkRect(0, 0));
    });

    it.each([
      ['spaces', '[background=red;viewBox=0 0 10 10]||B313'],
      ['commas', '[background=red;viewBox=0,0,10,10]||B313'],
    ])('places the paper at a written viewBox separated by %s', (_case, input) => {
      // the paper and the zones read the viewBox the root carries; a computed
      // origin left a strip of the written one bare
      expect(new BlissSVGBuilder(input).svgCode)
        .toContain('<rect class="bliss-background-zone" x="0" y="0" width="100%" height="100%"');
    });

    it('sizes the top zone from a written viewBox', () => {
      const svg = new BlissSVGBuilder('[background-top=red;viewBox=0 0 10 10]||B313').svgCode;

      expect(svg).toContain('<rect class="bliss-background-zone bliss-background-zone--top" x="0" y="0" width="10" height="8"');
    });

    it('sizes the bottom zone from a written viewBox', () => {
      // pins the bottom height's read of the written size; the computed one
      // gives 4.75
      const svg = new BlissSVGBuilder('[background-bottom=red;viewBox=0 0 10 20]||B313').svgCode;

      expect(svg).toContain('<rect class="bliss-background-zone bliss-background-zone--bottom" x="0" y="16" width="10" height="4"');
    });

    it.each([
      ['a word', 'bad'],
      ['three numbers', '0 0 10'],
      ['a negative width', '0 0 -10 10'],
      // pins the count and the finite check, which the size check would hide
      // in the rows above: a fifth number, or a word in the origin, passes it
      ['five numbers', '0 0 10 10 10'],
      ['a word in the origin', '0 top 10 10'],
    ])('keeps the computed origin for a written viewBox of %s', (_case, viewBox) => {
      const svg = new BlissSVGBuilder(`[viewBox=${viewBox};background=red]||B313`).svgCode;

      expect(svg).toContain('<rect class="bliss-background-zone" x="-0.75" y="-0.75" width="100%" height="100%"');
    });
  });

  describe('when the same global link arrives from different surfaces', () => {
    it('emits byte-identical SVG for the DSL global bracket and the constructor options object', () => {
      const dsl = new BlissSVGBuilder('[href=https://example.com;target=_blank]||B313');
      const api = new BlissSVGBuilder('B313', { href: 'https://example.com', target: '_blank' });
      expect(api.svgCode).toBe(dsl.svgCode);
    });

    it('renders identically from the DSL, the constructor and the transient channel', () => {
      const dsl = new BlissSVGBuilder('[href=#x]||B313').svgCode;
      const api = new BlissSVGBuilder('B313', { href: '#x' }).svgCode;
      const transient = new BlissSVGBuilder('B313').setTransientOptions({ href: '#x' }).svgCode;

      expect(dsl).toContain(`<a href="#x" style="cursor: pointer;">\n    ${linkRect(-0.75, -0.75)}`);
      expect(api).toBe(dsl);
      expect(transient).toBe(dsl);
    });

    it('reloads from both serializers to the same picture', () => {
      const builder = new BlissSVGBuilder('[href=#x]||B313');

      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('drops the link when a transient href is removed', () => {
      // pins the per-rebuild reset of the link attributes, which live apart
      // from every element's attribute map and would otherwise outlive the key
      const builder = new BlissSVGBuilder('B313').setTransientOptions({ href: '#x' });
      expect(builder.svgCode).toContain('<a href="#x"');

      builder.removeTransientOptions('href');

      expect(builder.svgCode).not.toContain('<a ');
      expect(builder.svgCode).not.toContain('<rect');
    });
  });

  describe('when link attributes are set globally without an href', () => {
    it('drops a bare target instead of leaking it onto a layer', () => {
      // matches the element-scope sibling: anchor attributes without an href
      // never emit (no <a> forms to carry them)
      const svg = new BlissSVGBuilder('[target=_blank]||B313').svgCode;
      expect(svg).not.toContain('target=');
      expect(svg).not.toContain('<a ');
    });
  });

  describe('when the global href fails the safety allowlist', () => {
    it('keeps a rejected javascript: href out of the output entirely', () => {
      // the anchor wrap already refused it; the leak resurfaced the raw value
      // as a content-<g> attribute
      const builder = new BlissSVGBuilder('[href=javascript:alert(1)]||B313');
      const svg = builder.svgCode;
      expect(svg).not.toContain('javascript:');
      expect(svg).not.toContain('<a ');
      expect(svg).not.toContain('<rect');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when non-link pass-through attributes are set globally', () => {
    it('keeps stroke-dasharray on the content group', () => {
      const svg = new BlissSVGBuilder('[stroke-dasharray="4 1"]||B313').svgCode;
      expect(contentGroupTag(svg)).toContain('stroke-dasharray="4 1"');
      expect(rootTag(svg)).not.toContain('stroke-dasharray');
    });
  });
});
