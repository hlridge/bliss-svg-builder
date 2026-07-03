import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins glyph-level `applyIndicators()` code validation: every requested code
 * must be an indicator. A rejected code warns individually on the persistent
 * mutation channel — a recognized non-indicator as
 * `NON_INDICATOR_AS_CHARACTER_INDICATOR`, an unknown code as `UNKNOWN_CODE` —
 * mirroring the group overlay's per-code classification (shared
 * `partitionWordIndicators`). These per-code warnings REPLACE the old single
 * "applied no indicator" NOOP arm. An apply whose requested codes are ALL
 * rejected REFUSES the mutation (rc.4 indicator-mutation fidelity): the
 * existing indicator stack stays untouched, matching the group overlay's
 * refuse arm — explicit failed content is not deliberate emptiness (that
 * spelling is `applyIndicators('')`, see
 * `ElementHandle.indicator-mutation-fidelity.test.js`).
 *
 * Covers:
 * - A recognized non-indicator warns with the exact code + bare source and
 *   refuses: the existing grammatical indicator stays.
 * - A mixed list applies the valid subset and warns only for the rejected code.
 * - An unknown code warns `UNKNOWN_CODE` and leaves the stack untouched.
 * - The no-change case (semantic-only glyph + non-indicator) warns the
 *   validation code and no longer NOOP-warns.
 * - A bare glyph + recognized non-indicator warns the validation code, not NOOP.
 * - A fully valid apply warns nothing.
 * - Group-level parity control: the group overlay path still classifies with
 *   `NON_INDICATOR_AS_WORD_INDICATOR` (unchanged by this gate).
 *
 * Does NOT cover:
 * - The surviving NOOP matrix (space target, invalid part pattern, clear with
 *   nothing to remove), see `ElementHandle.indicator-noop-warning.test.js`.
 * - Group `;;` overlay validation details (store decision, option-prefix
 *   strip), see `BlissParser.word-indicator-validation.test.js` and
 *   `ElementHandle.word-indicators.test.js`.
 */

const validationWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'NON_INDICATOR_AS_CHARACTER_INDICATOR');
const unknownWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'UNKNOWN_CODE');
const noopWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'NOOP_INDICATOR_MUTATION');

describe('ElementHandle character indicator validation', () => {
  describe('when applying a recognized non-indicator to a glyph with an indicator', () => {
    it('warns NON_INDICATOR_AS_CHARACTER_INDICATOR naming the bare code', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('C8');
      const w = validationWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].code).toBe('NON_INDICATOR_AS_CHARACTER_INDICATOR');
      expect(w[0].source).toBe('C8');
      expect(w[0].message).toContain("applyIndicators('C8')");
      expect(w[0].message).toContain('not an indicator');
    });

    it('refuses the mutation, keeping the existing grammatical indicator', () => {
      // rc.4 retarget: the pre-rc.4 replace-all arm stripped B81 away on an
      // all-invalid apply; a zero-valid-codes apply now mutates nothing.
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('C8');
      expect(b.toString()).toBe('B291;B81');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when applying a mixed list of a non-indicator and an indicator', () => {
    it('applies the valid indicator and warns only for the rejected code', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('C8;B86');
      expect(b.toString()).toBe('B291;B86');
      const w = validationWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('C8');
      expect(unknownWarnings(b)).toHaveLength(0);
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when applying an unknown code', () => {
    it('warns UNKNOWN_CODE naming the code and leaves the stack untouched', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('ZZ9');
      const w = unknownWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('ZZ9');
      expect(w[0].message).toContain("applyIndicators('ZZ9')");
      expect(validationWarnings(b)).toHaveLength(0);
      expect(b.toString()).toBe('B291;B81');
    });
  });

  describe('when a non-indicator code changes nothing on a semantic-only glyph', () => {
    it('warns the validation code instead of the old no-op warning', () => {
      // The all-invalid apply refuses (rc.4), so the call changes nothing;
      // visibility comes from the per-code validation warning, not
      // NOOP_INDICATOR_MUTATION.
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('H');
      expect(b.toString()).toBe('B291;B97');
      const w = validationWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('H');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when applying a recognized non-indicator to a bare glyph', () => {
    it('warns the validation code, not the no-op warning', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B303');
      const w = validationWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B303');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when every requested code is a valid indicator', () => {
    it('warns nothing', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('B86');
      expect(b.toString()).toBe('B291;B86');
      expect(b.warnings).toHaveLength(0);
    });
  });

  describe('when the group overlay path receives a non-indicator', () => {
    it('keeps warning the word-level code (parity control, unchanged)', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyIndicators('C8');
      const word = b.warnings.filter(w => w.code === 'NON_INDICATOR_AS_WORD_INDICATOR');
      expect(word).toHaveLength(1);
      expect(word[0].source).toBe('C8');
      expect(validationWarnings(b)).toHaveLength(0);
    });
  });
});
