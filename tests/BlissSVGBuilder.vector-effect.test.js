import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins vector-effect pass-through relocation: vector-effect is a non-inherited
 * SVG property with no effect on a <g>, so a pass-through vector-effect is
 * stamped onto the rendered <path> element(s) and removed from the group, at
 * every option scope.
 *
 * Covers:
 * - Global scope: vector-effect lands on the glyph path, not the content <g>.
 * - Character scope: vector-effect lands on the path, not a wrapping <g>.
 * - Word scope: same relocation for a word-level option.
 * - Combination: a co-located element option (opacity) stays on the <g> while
 *   vector-effect moves to the path.
 * - Nesting / innermost-wins: an inner element's own vector-effect is not
 *   overwritten by an outer (global) vector-effect; bare sibling paths still
 *   receive the outer value (exact-count guard against double-stamping).
 * - DSL/API parity: global DSL form equals the flat-options constructor form.
 * - Absence: no vector-effect option leaves output free of vector-effect.
 *
 * Does NOT cover:
 * - The rendered visual effect of non-scaling-stroke (a browser concern, not
 *   an output-string concern).
 * - Other non-inherited properties; only vector-effect is relocated.
 */
describe('BlissSVGBuilder vector-effect', () => {
  const render = (dsl) => new BlissSVGBuilder(dsl).svgCode;
  const groupHasVectorEffect = (svg) => /<g[^>]*\bvector-effect=/.test(svg);

  describe('when set at global scope', () => {
    it('relocates vector-effect from the content group onto the glyph path', () => {
      const svg = render('[vector-effect=non-scaling-stroke]||B313');
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
    });
  });

  describe('when set at character scope', () => {
    it('relocates vector-effect onto the path without leaving it on a group', () => {
      const svg = render('[vector-effect=non-scaling-stroke]B313');
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
    });
  });

  describe('when set at word scope', () => {
    it('relocates vector-effect onto the word path', () => {
      const svg = render('[vector-effect=non-scaling-stroke]|B313/B1103');
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
    });
  });

  describe('when combined with another element-scope attribute', () => {
    it('keeps the other attribute on the group and moves vector-effect to the path', () => {
      const svg = render('[vector-effect=non-scaling-stroke;opacity=0.5]B313');
      expect(svg).toMatch(/<g[^>]*\bopacity="0.5"/);
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
    });
  });

  describe('when an inner element overrides an outer vector-effect', () => {
    it('preserves the inner value and applies the outer value to sibling paths only', () => {
      const svg = render('[vector-effect=non-scaling-stroke]||[opacity=0.5;vector-effect=none]B313//B431');
      expect(svg).toMatch(/<path[^>]*\bvector-effect="none"/);
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
      // exact count guards against double-stamping: one value per path, no more
      expect((svg.match(/vector-effect=/g) || []).length).toBe(2);
    });
  });

  describe('when the same value is set via the flat-options constructor', () => {
    it('produces output identical to the global DSL form', () => {
      const dsl = render('[vector-effect=non-scaling-stroke]||B313');
      const api = new BlissSVGBuilder('B313', { 'vector-effect': 'non-scaling-stroke' }).svgCode;
      expect(api).toBe(dsl);
    });
  });

  describe('when combined with a link (href)', () => {
    it('stamps vector-effect on the linked path, not on the anchor or group', () => {
      const svg = render('[href=https://example.com;vector-effect=non-scaling-stroke]B313');
      expect(svg).toContain('<a ');
      expect(svg).toMatch(/<path[^>]*\bvector-effect="non-scaling-stroke"/);
      expect(groupHasVectorEffect(svg)).toBe(false);
      expect(svg).not.toMatch(/<a[^>]*\bvector-effect=/);
    });
  });

  describe('when no vector-effect is set', () => {
    it('emits no vector-effect attribute', () => {
      expect(render('B313')).not.toContain('vector-effect');
    });
  });

  describe('when the value is empty', () => {
    // an empty vector-effect is meaningless; it must not be left on the <g>
    // (the dead-attribute-on-a-group case this feature removes), and global
    // and character scope must agree
    it('drops an empty global vector-effect instead of leaving it on the content group', () => {
      expect(render('[vector-effect=]||B313')).not.toContain('vector-effect');
    });

    it('drops an empty character-scope vector-effect', () => {
      expect(render('[vector-effect=]B313')).not.toContain('vector-effect');
    });
  });
});
