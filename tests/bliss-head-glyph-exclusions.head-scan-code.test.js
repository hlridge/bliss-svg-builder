import { describe, it, expect } from 'vitest';
import { headScanCode } from '../src/lib/bliss-head-glyph-exclusions.js';

/**
 * Pins headScanCode: the per-glyph head-scan code that feeds resolveHeadIndex,
 * encoding the rule that a head-exclusion (e.g. B486 "opposite-to") excludes
 * only when it stands alone as a single glyph, never when combined with other
 * parts into one character. The single source of truth shared by the parser's
 * scan, the builder render path and the element snapshot so the three cannot
 * drift.
 *
 * Covers:
 * - A named identity (custom glyph code or single built-in code) on a glyph of
 *   one part is returned verbatim, so the scan classifies the glyph by its own
 *   code; on a glyph of several parts it is not read (returns undefined).
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
    it('returns undefined when the named glyph holds two parts, the part count read before the name', () => {
      expect(headScanCode('MYG', 2, 'B486')).toBeUndefined();
    });

    it('prefers the identity over the first part on a single-part glyph', () => {
      // pins the identity read before the part's code; the row that pinned it
      // with two different codes flipped when the part count came to be read
      // first
      expect(headScanCode('MYG', 1, 'B486')).toBe('MYG');
    });

    it('returns a skip-list code that names a single-part glyph, so that glyph is still skipped', () => {
      expect(headScanCode('B486', 1, 'B486')).toBe('B486');
    });
  });

  describe('when the glyph names a skip-list code and holds more than one part', () => {
    it.each([
      ['B449', 'an indicator of its own (B449;B81)'],
      ['B486', 'a second base part (B486;B303)'],
    ])('returns undefined for %s carrying %s, so its own code does not skip it', (code) => {
      // pins the part count read before the glyph's own code (H chunk P1): a
      // composition object can name the code on a character of several parts
      expect(headScanCode(code, 2, code)).toBeUndefined();
    });
  });

  describe('when the glyph is a fused multi-part character with no identity', () => {
    it('returns undefined so a leading exclusion part does not exclude the character', () => {
      // pins the rule that B486 excludes only as a lone glyph; the multi-part
      // case must be non-excludable
      expect(headScanCode(undefined, 2, 'B486')).toBeUndefined();
    });

    it('stays non-excludable regardless of how many parts follow', () => {
      expect(headScanCode('', 3, 'B486')).toBeUndefined();
    });
  });

  describe('when the glyph is a single part with no identity', () => {
    it('returns the part code so a lone exclusion part still excludes', () => {
      // pins the part-count boundary: a glyph of one part is compared (> 1,
      // not >= 1)
      expect(headScanCode(undefined, 1, 'B486')).toBe('B486');
    });

    it('returns undefined when there are no parts', () => {
      expect(headScanCode(undefined, 0, undefined)).toBeUndefined();
    });
  });
});
