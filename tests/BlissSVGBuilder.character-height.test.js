import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the level-2 character-height invariant: every Bliss character on
 * a `BlissSVGBuilder` snapshot tree reports `.height === 20`, regardless
 * of how the character was composed (predefined glyph, indicator,
 * part-superimposed glyph, shape, part-superimposed shape, or a multi-
 * character word).
 *
 * Covers:
 * - Predefined glyph (`B291`).
 * - External glyph (`Xa`).
 * - Indicator (`B86`).
 * - Part-superimposed glyph and indicator (`B291;B86`).
 * - Raw shape primitives (`H`, `S8`, `C8`).
 * - Part-superimposed shape and named shape (`H;DOT`).
 * - First character of a multi-character word (`B291/H`).
 *
 * Does NOT cover:
 * - The rendered SVG's `height` attribute, see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 * - Numeric dimensions on level-3 parts, see
 *   `ElementHandle.dimensions.test.js`.
 * - Other level-2 geometry (isGlyph flags, effectiveBounds, x-offset
 *   width / advanceX), see `BlissSVGBuilder.element-bounds.test.js`.
 */
describe('BlissSVGBuilder character-height invariant', () => {
  const firstCharacter = (b) => b.elements.children[0].children.find(c => c.isGlyph);

  describe('when probing the first character of a snapshot tree', () => {
    it.each([
      ['B291',     'predefined glyph'],
      ['Xa',       'external glyph'],
      ['B86',      'indicator'],
      ['B291;B86', 'part-superimposed glyph and indicator'],
      ['H',        'shape'],
      ['S8',       'raw shape primitive'],
      ['C8',       'raw shape primitive'],
      ['H;DOT',    'part-superimposed shape and named shape'],
      ['B291/H',   'first character of a multi-character word'],
    ])('reports height 20 for %s (%s)', (code) => {
      const c = firstCharacter(new BlissSVGBuilder(code));
      expect(c.level).toBe(2);
      expect(c.height).toBe(20);
    });
  });
});
