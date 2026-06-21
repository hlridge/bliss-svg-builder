import { describe, it, expect } from 'vitest';
import { headScanCode } from '../src/lib/bliss-head-glyph-exclusions.js';

/**
 * Pins headScanCode: the per-glyph head-scan code that feeds resolveHeadIndex,
 * encoding the rule that a head-exclusion (e.g. B486 "opposite-to") excludes
 * only when it stands alone as a single glyph, never when combined with other
 * parts into one fused character. The single source of truth shared by the
 * builder render path and the element snapshot so the two cannot drift.
 *
 * Covers:
 * - A named identity (custom glyph code or single built-in code) is returned
 *   verbatim, so the scan classifies the glyph by its own code.
 * - A multi-part glyph with no identity returns undefined (non-excludable): a
 *   fused character is a character, not a leading operator.
 * - A single-part glyph with no identity returns that part's code, so a lone
 *   exclusion part still excludes.
 *
 * Does NOT cover:
 * - resolveHeadIndex selection across a code list, exercised end-to-end via the
 *   builder in `BlissElement.snapshots.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - Parse-time head crowning, see `BlissParser.head-glyph-exclusions.test.js`.
 */
describe('bliss-head-glyph-exclusions.headScanCode', () => {
  describe('when the glyph has a named identity', () => {
    it('returns the identity code so the scan classifies by the glyph code', () => {
      expect(headScanCode('MYG', 2, 'B486')).toBe('MYG');
    });

    it('prefers the identity over the first part on a single-part glyph', () => {
      expect(headScanCode('B486', 1, 'B486')).toBe('B486');
    });
  });

  describe('when the glyph is a fused multi-part character with no identity', () => {
    it('returns undefined so a leading exclusion part does not exclude the character', () => {
      // pins the rule that B486 excludes only as a lone glyph; the multi-part
      // case must be non-excludable. Kills the partCount boundary (>1 -> >=1).
      expect(headScanCode(undefined, 2, 'B486')).toBeUndefined();
    });

    it('stays non-excludable regardless of how many parts follow', () => {
      expect(headScanCode('', 3, 'B486')).toBeUndefined();
    });
  });

  describe('when the glyph is a single part with no identity', () => {
    it('returns the part code so a lone exclusion part still excludes', () => {
      expect(headScanCode(undefined, 1, 'B486')).toBe('B486');
    });

    it('returns undefined when there are no parts', () => {
      expect(headScanCode(undefined, 0, undefined)).toBeUndefined();
    });
  });
});
