import { describe, it, expect } from 'vitest';
import { getSemanticRoot } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.getSemanticRoot: returning the semantic root
 * (B97 for thing, B6436 for abstract) on a list of indicator codes;
 * null when no semantic indicator is present, the input is empty, or
 * codes are unknown.
 *
 * Covers:
 * - Direct semantic roots: B97 (thing), B6436 (abstract).
 * - Compound semantic indicator B98 → resolves to its root B97 (thing).
 * - Null return for empty input, unknown codes, or non-semantic-only lists.
 * - First-match-wins behavior when multiple semantic indicators are present.
 * - Position-coordinate stripping (`:x,y`) before role lookup.
 *
 * Does NOT cover:
 * - Option-prefix stripping for getSemanticRoot specifically; covered
 *   under hasSemantic (`indicator-utils.has-semantic.test.js`).
 * - The placement rule consuming this root, see
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

describe('indicator-utils.getSemanticRoot', () => {
  describe('when the input contains a semantic indicator', () => {
    it('returns B97 for the thing semantic indicator', () => {
      expect(getSemanticRoot(['B97'], defs)).toBe('B97');
    });

    it('returns B6436 for the abstract semantic indicator', () => {
      expect(getSemanticRoot(['B6436'], defs)).toBe('B6436');
    });

    it('returns B97 for the compound thing indicator (B98)', () => {
      expect(getSemanticRoot(['B98'], defs)).toBe('B97');
    });

    it('returns the first semantic root when multiple are present', () => {
      expect(getSemanticRoot(['B97', 'B6436'], defs)).toBe('B97');
    });
  });

  describe('when the input has no semantic indicator', () => {
    it('returns null for a list of non-semantic indicators', () => {
      expect(getSemanticRoot(['B81', 'B86'], defs)).toBeNull();
    });

    it('returns null for an empty array', () => {
      expect(getSemanticRoot([], defs)).toBeNull();
    });

    it('returns null for unknown codes', () => {
      expect(getSemanticRoot(['XYZZY'], defs)).toBeNull();
    });
  });

  describe('when codes carry position coordinates', () => {
    it('strips :x,y from a thing semantic indicator before lookup', () => {
      expect(getSemanticRoot(['B97:0,4'], defs)).toBe('B97');
    });

    it('strips :x,y from an abstract semantic indicator before lookup', () => {
      expect(getSemanticRoot(['B6436:2,0'], defs)).toBe('B6436');
    });
  });
});
