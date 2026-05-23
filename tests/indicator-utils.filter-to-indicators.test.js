import { describe, it, expect } from 'vitest';
import { filterToIndicators } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.filterToIndicators: narrowing a code list to
 * only indicator codes, preserving position suffixes and option
 * prefixes verbatim in the output.
 *
 * Covers:
 * - Keeping known indicator codes; dropping non-indicators (H, B291)
 *   and unknown codes (XYZZY).
 * - Empty array return for inputs with no indicator codes and for
 *   empty input.
 * - Compound indicator codes (B98) pass through.
 * - Position coordinates and option prefixes stripped *for lookup* but
 *   preserved *in output*.
 *
 * Does NOT cover:
 * - The placement rule that consumes the filtered list, see
 *   `indicator-utils.semantic-goes-last.test.js` and
 *   `indicator-utils.build-with-semantic.test.js`.
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

describe('indicator-utils.filterToIndicators', () => {
  describe('when the input contains indicator codes', () => {
    it('keeps a single indicator code', () => {
      expect(filterToIndicators(['B86'], defs)).toEqual(['B86']);
    });

    it('keeps all indicator codes in input order', () => {
      expect(filterToIndicators(['B81', 'B86', 'B97'], defs)).toEqual(['B81', 'B86', 'B97']);
    });

    it('keeps a compound indicator code (B98)', () => {
      expect(filterToIndicators(['B98'], defs)).toEqual(['B98']);
    });
  });

  describe('when the input mixes indicator and non-indicator codes', () => {
    it('drops non-indicator codes (H) and keeps indicators', () => {
      expect(filterToIndicators(['H', 'B86'], defs)).toEqual(['B86']);
    });

    it('drops unknown codes and keeps indicators', () => {
      expect(filterToIndicators(['XYZZY', 'B86'], defs)).toEqual(['B86']);
    });
  });

  describe('when the input has no indicator codes', () => {
    it('returns an empty array for a list of non-indicators', () => {
      expect(filterToIndicators(['H', 'B291'], defs)).toEqual([]);
    });

    it('returns an empty array for an empty input', () => {
      expect(filterToIndicators([], defs)).toEqual([]);
    });
  });

  describe('when codes carry position coordinates or option prefixes', () => {
    it('strips :x,y for lookup but preserves it in the output', () => {
      expect(filterToIndicators(['B86:0,4'], defs)).toEqual(['B86:0,4']);
    });

    it('strips option prefixes for lookup but preserves them in the output', () => {
      expect(filterToIndicators(['[color=red]>B86'], defs)).toEqual(['[color=red]>B86']);
    });
  });
});
