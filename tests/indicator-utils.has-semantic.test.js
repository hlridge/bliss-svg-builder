import { describe, it, expect } from 'vitest';
import { hasSemantic } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.hasSemantic: boolean form of getSemanticRoot.
 * Returns true when at least one semantic indicator is present in the
 * input list; false for empty, unknown, or non-semantic-only inputs.
 *
 * Covers:
 * - True for a direct semantic indicator (B97).
 * - True for a compound semantic indicator (B98).
 * - True when mixed with non-semantic indicators (B86 + B97).
 * - False for empty, unknown, and non-semantic-only inputs.
 * - Position-coordinate stripping (`:x,y`) before role lookup.
 * - Option-prefix stripping (`[color=red]>...`) before role lookup.
 *
 * Does NOT cover:
 * - Returning the root identifier itself, see
 *   `indicator-utils.get-semantic-root.test.js`.
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

describe('indicator-utils.hasSemantic', () => {
  describe('when the input contains a semantic indicator', () => {
    it('returns true for a direct semantic indicator (B97)', () => {
      expect(hasSemantic(['B97'], defs)).toBe(true);
    });

    it('returns true for a compound semantic indicator (B98)', () => {
      expect(hasSemantic(['B98'], defs)).toBe(true);
    });

    it('returns true when mixed with non-semantic indicators', () => {
      expect(hasSemantic(['B86', 'B97'], defs)).toBe(true);
    });
  });

  describe('when the input has no semantic indicator', () => {
    it('returns false for a list of non-semantic indicators', () => {
      expect(hasSemantic(['B81', 'B86'], defs)).toBe(false);
    });

    it('returns false for an empty array', () => {
      expect(hasSemantic([], defs)).toBe(false);
    });

    it('returns false for unknown codes', () => {
      expect(hasSemantic(['XYZZY'], defs)).toBe(false);
    });
  });

  describe('when codes carry position coordinates or option prefixes', () => {
    it('strips :x,y position coordinates before role lookup', () => {
      expect(hasSemantic(['B97:0,4'], defs)).toBe(true);
    });

    it('strips option prefixes before role lookup', () => {
      expect(hasSemantic(['[color=red]>B97'], defs)).toBe(true);
    });
  });
});
