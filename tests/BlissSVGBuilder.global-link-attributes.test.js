import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that global-scope link attributes (the anchor family: href, target,
 * rel, download, hreflang, type, referrerpolicy) flow only through the
 * level-0 anchor wrap (`<a>` around the content) and never land on a layer:
 * not on the root `<svg>`, where every other global attribute now goes, and
 * not on the content wrapper `<g class="bliss-content">`.
 *
 * Covers:
 * - Global `[href=...]||`: the `<a>` carries the href, neither the root nor
 *   the content `<g>` does (was an invalid `<g ... href="...">`, sweep
 *   report A13).
 * - The full anchor-attribute family stripped from both layers while the
 *   `<a>` carries every member.
 * - Non-href anchor attributes without an href (global `target`) drop
 *   entirely, matching the element-scope sibling behavior.
 * - An allowlist-rejected unsafe href (javascript:) no longer resurfaces as
 *   a plain layer attribute after the anchor wrap refuses it.
 * - Non-link pass-through attributes (stroke-dasharray) still reach the root
 *   (the strip is scoped to the anchor family).
 *
 * Does NOT cover:
 * - Element-scope anchor mechanics (`<a>` wrapping, protocol allowlist,
 *   anchor/group attribute separation, hierarchical href levels), see
 *   `BlissSVGBuilder.clickable-links.test.js`.
 */

// The root <svg ...> open tag, which carries every global attribute that is
// not stripped, and the <g class="bliss-content" ...> open tag below it.
const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const contentGroupTag = (svg) => svg.match(/<g class="bliss-content"[^>]*>/)[0];

describe('BlissSVGBuilder global link attributes', () => {
  describe('when href is set at the global level', () => {
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

    it('leaves the element-scope anchor untouched', () => {
      const svg = new BlissSVGBuilder('[href=https://example.com]B313').svgCode;
      expect(rootTag(svg)).not.toContain('href=');
      expect(contentGroupTag(svg)).not.toContain('href=');
      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
    });

    it('emits byte-identical SVG for the DSL global bracket and the constructor options object', () => {
      const dsl = new BlissSVGBuilder('[href=https://example.com;target=_blank]||B313');
      const api = new BlissSVGBuilder('B313', { href: 'https://example.com', target: '_blank' });
      expect(api.svgCode).toBe(dsl.svgCode);
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
      const svg = new BlissSVGBuilder('[href=javascript:alert(1)]||B313').svgCode;
      expect(svg).not.toContain('javascript:');
      expect(svg).not.toContain('<a ');
    });
  });

  describe('when non-link pass-through attributes are set globally', () => {
    it('keeps stroke-dasharray on the root', () => {
      const svg = new BlissSVGBuilder('[stroke-dasharray="4 1"]||B313').svgCode;
      expect(rootTag(svg)).toContain('stroke-dasharray="4 1"');
    });
  });
});
