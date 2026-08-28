import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the structural class each emitted layer carries, and the rule that a
 * class an author writes is APPENDED to the structural name rather than
 * replacing it. Replacing would break the embedded <style> block, every
 * consumer selector, and the layer lookups downstream apps do by class.
 *
 * Covers:
 * - The root <svg> carrying `bliss-root`, and the content group carrying
 *   `bliss-content`, when no class is written.
 * - A global `class` merging onto `bliss-root`, from the DSL and from the
 *   constructor options object.
 * - Exactly one `class` attribute per layer after a merge.
 *
 * Does NOT cover:
 * - Element-scope `class` (no structural name to collide with), see
 *   `BlissSVGBuilder.attribute-collisions.test.js`.
 * - The grid-line and background-zone class names, see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const countAttr = (tag, name) => (tag.match(new RegExp(`${name}="`, 'g')) || []).length;

describe('BlissSVGBuilder structural classes', () => {
  describe('when no class is written', () => {
    it('names the root bliss-root', () => {
      const svg = new BlissSVGBuilder('B291').svgCode;

      expect(rootTag(svg)).toContain('class="bliss-root"');
    });

    it('leaves the content group named bliss-content', () => {
      const svg = new BlissSVGBuilder('B291').svgCode;

      expect(svg.match(/<g class="bliss-content"[^>]*>/)[0]).toBe('<g class="bliss-content">');
    });
  });

  describe('when a class is written at global scope', () => {
    it('merges with the structural name instead of replacing it', () => {
      const svg = new BlissSVGBuilder('[class=mine]||B291').svgCode;

      expect(rootTag(svg)).toContain('class="bliss-root mine"');
      expect(countAttr(rootTag(svg), 'class')).toBe(1);
    });

    it('merges identically through the constructor options object', () => {
      const dsl = new BlissSVGBuilder('[class=mine]||B291');
      const api = new BlissSVGBuilder('B291', { class: 'mine' });

      expect(api.svgCode).toBe(dsl.svgCode);
      expect(rootTag(api.svgCode)).toContain('class="bliss-root mine"');
    });

    it('keeps the structural name leading when several classes are written', () => {
      const svg = new BlissSVGBuilder('[class="one two"]||B291').svgCode;

      expect(rootTag(svg)).toContain('class="bliss-root one two"');
    });
  });
});
