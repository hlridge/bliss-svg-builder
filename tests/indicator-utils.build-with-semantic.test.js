import { describe, it, expect } from 'vitest';
import { buildWithSemantic } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.buildWithSemantic: composing a final code list
 * by placing the semantic root (B97 thing or B6436 abstract) before
 * or after the user's non-semantic indicators per the placement rule.
 *
 * Covers:
 * - Root-first placement when the user adds a nominal indicator.
 * - Root-last placement when the user adds a verbal or adjectival indicator.
 * - Array (not string) return shape: the key contract difference from
 *   the parser-side composition path.
 * - Multiple non-semantic indicators with both first and last placements.
 * - Position-coordinate preservation in the output array elements.
 * - Both thing (B97) and abstract (B6436) semantic roots.
 *
 * Does NOT cover:
 * - The placement-rule decision itself, see
 *   `indicator-utils.semantic-goes-last.test.js`.
 *
 * @contract: indicator-placement-rule
 */
const defs = {
  B81: { isIndicator: true, indicatorRole: 'verbal' },
  B86: { isIndicator: true, indicatorRole: 'adjectival' },
  B97: { isIndicator: true, semanticIndicator: 'thing', indicatorRole: 'nominal' },
  B98: { isIndicator: true, semanticIndicator: 'thing', indicatorRole: 'nominal', width: 5 },
  B99: { isIndicator: true, indicatorRole: 'nominal' },
  B6436: { isIndicator: true, semanticIndicator: 'abstract', indicatorRole: 'nominal' },
  B291: { isBlissGlyph: true },
  H: { width: 8, height: 8 },
};

describe('indicator-utils.buildWithSemantic', () => {
  describe('when the user adds a single non-semantic indicator', () => {
    it('places the thing root (B97) FIRST for a nominal indicator', () => {
      expect(buildWithSemantic('B97', ['B99'], defs)).toEqual(['B97', 'B99']);
    });

    it('places the thing root (B97) LAST for a verbal indicator', () => {
      expect(buildWithSemantic('B97', ['B81'], defs)).toEqual(['B81', 'B97']);
    });

    it('places the thing root (B97) LAST for an adjectival indicator', () => {
      expect(buildWithSemantic('B97', ['B86'], defs)).toEqual(['B86', 'B97']);
    });

    it('places the abstract root (B6436) FIRST for a nominal indicator', () => {
      expect(buildWithSemantic('B6436', ['B99'], defs)).toEqual(['B6436', 'B99']);
    });

    it('places the abstract root (B6436) LAST for a verbal indicator', () => {
      expect(buildWithSemantic('B6436', ['B81'], defs)).toEqual(['B81', 'B6436']);
    });
  });

  describe('when the user adds multiple non-semantic indicators', () => {
    it('places the root FIRST when all are nominal', () => {
      expect(buildWithSemantic('B97', ['B99', 'B99'], defs)).toEqual(['B97', 'B99', 'B99']);
    });

    it('places the root LAST when all are verbal+adjectival', () => {
      expect(buildWithSemantic('B97', ['B81', 'B86'], defs)).toEqual(['B81', 'B86', 'B97']);
    });
  });

  describe('when codes carry position coordinates', () => {
    it('preserves :x,y on non-semantic indicators in the output array', () => {
      expect(buildWithSemantic('B97', ['B86:0,4'], defs)).toEqual(['B86:0,4', 'B97']);
    });
  });

  describe('return-shape contract', () => {
    it('returns an array, not a string (key difference from the parser version)', () => {
      const result = buildWithSemantic('B97', ['B86'], defs);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
