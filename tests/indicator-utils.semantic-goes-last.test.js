import { describe, it, expect } from 'vitest';
import { semanticGoesLast } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.semanticGoesLast: the placement rule itself.
 * Returns true when every non-semantic indicator in the input has a
 * verbal or adjectival role (semantic root goes LAST); false when any
 * non-semantic indicator is nominal, when the input is empty/unknown,
 * or when only semantic indicators are present.
 *
 * Covers:
 * - True for all-verbal, all-adjectival, and mixed verbal/adjectival lists.
 * - False for any-nominal lists (B81+B99, B86+B99; exercises .every() vs .some()).
 * - False for empty input and unknown codes.
 * - False when only semantic indicators are present (no non-semantic to decide on).
 * - Semantic indicators in the input are filtered out before role lookup
 *   (B81 + B97 → true, ignoring B97's nominal role).
 * - Position-coordinate stripping (`:x,y`) and option-prefix stripping
 *   (`[color=red]>...`) before role lookup.
 *
 * Does NOT cover:
 * - The composition step that uses this boolean to place the root, see
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

describe('indicator-utils.semanticGoesLast', () => {
  describe('when all non-semantic indicators are verbal or adjectival', () => {
    it('returns true for an all-verbal list', () => {
      expect(semanticGoesLast(['B81'], defs)).toBe(true);
    });

    it('returns true for an all-adjectival list', () => {
      expect(semanticGoesLast(['B86'], defs)).toBe(true);
    });

    it('returns true for a mixed verbal+adjectival list', () => {
      expect(semanticGoesLast(['B81', 'B86'], defs)).toBe(true);
    });
  });

  describe('when any non-semantic indicator is nominal (every-not-some)', () => {
    it('returns false for a single nominal indicator', () => {
      expect(semanticGoesLast(['B99'], defs)).toBe(false);
    });

    it('returns false for verbal + nominal', () => {
      // pins .every() vs .some(): every -> false (B99 fails), some -> true (B81 passes)
      expect(semanticGoesLast(['B81', 'B99'], defs)).toBe(false);
    });

    it('returns false for adjectival + nominal', () => {
      expect(semanticGoesLast(['B86', 'B99'], defs)).toBe(false);
    });
  });

  describe('when there is no non-semantic indicator to decide on', () => {
    it('returns false for an empty array', () => {
      expect(semanticGoesLast([], defs)).toBe(false);
    });

    it('returns false when all indicators are semantic', () => {
      expect(semanticGoesLast(['B97'], defs)).toBe(false);
    });

    it('returns false for unknown codes (no indicatorRole)', () => {
      expect(semanticGoesLast(['XYZZY'], defs)).toBe(false);
    });
  });

  describe('when semantic indicators appear in the input alongside non-semantic ones', () => {
    it('ignores the semantic indicator when computing placement', () => {
      // The filter step removes semantic indicators so only the user's
      // non-semantic additions decide placement. Without the filter,
      // B97's nominal role would force the result false.
      expect(semanticGoesLast(['B81', 'B97'], defs)).toBe(true);
    });
  });

  describe('when codes carry position coordinates or option prefixes', () => {
    it('strips :x,y position coordinates before role lookup', () => {
      expect(semanticGoesLast(['B81:0,4'], defs)).toBe(true);
    });

    it('strips option prefixes before role lookup', () => {
      expect(semanticGoesLast(['[color=red]>B81'], defs)).toBe(true);
    });
  });
});
