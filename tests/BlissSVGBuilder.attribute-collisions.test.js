import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that option collisions never emit the same SVG attribute name twice on
 * one element: the explicitly-named attribute wins over an alias, and a global
 * `class` option merges with the structural `bliss-content` class.
 *
 * Covers:
 * - Global `class` merges into a single `class="bliss-content <value>"` on the
 *   content group (DSL `||` form and the constructor object-options form).
 * - Element-scope `color` (alias for `stroke`) and an explicit `stroke` collapse
 *   to one `stroke` attribute; the explicit value wins, order-independently
 *   (DSL `[...]` form and the `addGlyph` object-options form).
 * - Regression guards for the "not affected" cases: global pass-through
 *   attributes still override (no duplication), element-scope `class` stays a
 *   single attribute, and the content group keeps `bliss-content` with no
 *   trailing artifact when no `class` option is given.
 *
 * Does NOT cover:
 * - General stroke/color rendering and the `color`->`stroke` mapping across all
 *   scopes, see `BlissSVGBuilder.stroke-color.test.js`.
 * - Unsafe / prototype-polluting attribute-key handling, see
 *   `BlissSVGBuilder.option-hardening.test.js`.
 * - The full 4-level option cascade matrix, see
 *   `BlissSVGBuilder.hierarchical-options.test.js`.
 *
 * @issue: #28
 */

const contentGroupTag = (svg) => svg.match(/<g [^>]*bliss-content[^>]*>/)[0];
const elementStrokeTag = (svg) => svg.match(/<g stroke="[^"]*"[^>]*>/)[0];
const countAttr = (tag, name) => (tag.match(new RegExp(`${name}="`, 'g')) || []).length;

describe('BlissSVGBuilder attribute collisions', () => {

  describe('when a global class option collides with the structural bliss-content class', () => {
    it('merges the option class with bliss-content into a single class attribute', () => {
      const tag = contentGroupTag(new BlissSVGBuilder('[class=my-class]||B313').svgCode);

      // regression: #28 - bliss-content must lead, the option class is appended
      expect(tag).toContain('class="bliss-content my-class"');
      expect(countAttr(tag, 'class')).toBe(1);
    });

    it('merges the class via the constructor object-options form identically', () => {
      const tag = contentGroupTag(new BlissSVGBuilder('B313', { class: 'my-class' }).svgCode);

      expect(tag).toContain('class="bliss-content my-class"');
      expect(countAttr(tag, 'class')).toBe(1);
    });
  });

  describe('when color and an explicit stroke target the same attribute on an element', () => {
    it('collapses to a single stroke attribute with the explicit value', () => {
      const svg = new BlissSVGBuilder('[color=red;stroke=blue]B313').svgCode;
      const tag = elementStrokeTag(svg);

      expect(tag).toContain('stroke="blue"');
      expect(countAttr(tag, 'stroke')).toBe(1);
      expect(svg).not.toContain('stroke="red"');
    });

    it('lets the explicit stroke win regardless of option order', () => {
      const svg = new BlissSVGBuilder('[stroke=blue;color=red]B313').svgCode;
      const tag = elementStrokeTag(svg);

      // regression: #28 - explicit attribute name wins; not last-write-wins
      expect(tag).toContain('stroke="blue"');
      expect(countAttr(tag, 'stroke')).toBe(1);
      expect(svg).not.toContain('stroke="red"');
    });

    it('collapses to a single stroke via the addGlyph object-options form', () => {
      const builder = new BlissSVGBuilder('B313');
      builder.addGlyph('B313', { color: 'red', stroke: 'blue' });
      const svg = builder.svgCode;
      const tag = elementStrokeTag(svg);

      expect(tag).toContain('stroke="blue"');
      expect(countAttr(tag, 'stroke')).toBe(1);
      expect(svg).not.toContain('stroke="red"');
    });
  });

  describe('when attributes do not collide', () => {
    it('keeps each global pass-through attribute emitted once', () => {
      const tag = contentGroupTag(new BlissSVGBuilder('[fill=blue;opacity=0.5]||H').svgCode);

      expect(tag).toContain('fill="blue"');
      expect(tag).toContain('opacity="0.5"');
      expect(countAttr(tag, 'fill')).toBe(1);
      expect(countAttr(tag, 'opacity')).toBe(1);
    });

    it('keeps element-scope class as a single attribute', () => {
      const svg = new BlissSVGBuilder('[class=foo]|B313').svgCode;

      expect(svg).toContain('<g class="foo">');
      expect(contentGroupTag(svg)).toContain('class="bliss-content"');
    });

    it('keeps bliss-content intact when no class option is set', () => {
      const tag = contentGroupTag(new BlissSVGBuilder('B313').svgCode);

      expect(tag).toContain('class="bliss-content"');
      expect(countAttr(tag, 'class')).toBe(1);
      expect(tag).not.toContain('undefined');
    });
  });
});
