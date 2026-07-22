import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that global-scope link attributes (the anchor family: href, target,
 * rel, download, hreflang, type, referrerpolicy) flow only through the
 * level-0 anchor wrap (`<a>` around the content) and never land on the
 * content wrapper `<g class="bliss-content">`, where href is not a valid
 * attribute.
 *
 * Covers:
 * - Global `[href=...]||`: the `<a>` carries the href, the content `<g>`
 *   does not (was an invalid `<g ... href="...">`, sweep report A13).
 * - The full anchor-attribute family stripped from the content `<g>` while
 *   the `<a>` carries every member.
 * - Non-href anchor attributes without an href (global `target`) drop
 *   entirely, matching the element-scope sibling behavior.
 * - An allowlist-rejected unsafe href (javascript:) no longer resurfaces as
 *   a plain content-`<g>` attribute after the anchor wrap refuses it.
 * - Non-link pass-through attributes (stroke-dasharray) still reach the
 *   content `<g>` (the strip is scoped to the anchor family).
 *
 * Does NOT cover:
 * - Element-scope anchor mechanics (`<a>` wrapping, protocol allowlist,
 *   anchor/group attribute separation, hierarchical href levels), see
 *   `BlissSVGBuilder.clickable-links.test.js`.
 */

// The <g class="bliss-content" ...> open tag (always present, one per svg).
const contentGroupTag = (svg) => svg.match(/<g class="bliss-content"[^>]*>/)[0];

describe('BlissSVGBuilder global link attributes', () => {
  describe('when href is set at the global level', () => {
    it('keeps href off the content group and on the anchor', () => {
      const svg = new BlissSVGBuilder('[href=https://example.com]||B313').svgCode;
      expect(contentGroupTag(svg)).not.toContain('href=');
      expect(svg).toContain('<a href="https://example.com" style="cursor: pointer;">');
    });

    it('strips the full anchor-attribute family from the content group while the anchor carries it', () => {
      const svg = new BlissSVGBuilder(
        '[href=https://example.com;target=_blank;rel=noopener;download=file;hreflang=en;type="image/svg+xml";referrerpolicy=no-referrer]||B313'
      ).svgCode;
      const contentTag = contentGroupTag(svg);
      const anchorTag = svg.match(/<a [^>]+>/)[0];
      for (const attr of ['href=', 'target=', 'rel=', 'download=', 'hreflang=', 'type=', 'referrerpolicy=']) {
        expect(contentTag).not.toContain(attr);
        expect(anchorTag).toContain(attr);
      }
    });

    it('leaves the element-scope anchor untouched', () => {
      const svg = new BlissSVGBuilder('[href=https://example.com]B313').svgCode;
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
    it('drops a bare target instead of leaking it onto the content group', () => {
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
    it('keeps stroke-dasharray on the content group', () => {
      const svg = new BlissSVGBuilder('[stroke-dasharray="4 1"]||B313').svgCode;
      expect(contentGroupTag(svg)).toContain('stroke-dasharray="4 1"');
    });
  });
});
