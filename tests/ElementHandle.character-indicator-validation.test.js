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
 * - Parse-first validation (round-2 review F2): a code whose decoration fails
 *   to parse (`B81:bad`) refuses without stripping or appending an error part
 *   (the forwarded parse warning is the visibility channel); a mixed list
 *   applies only the parseable subset; a code carrying a top-level `/`
 *   (`B81:1,2/B86`) warns `MISPLACED_CHARACTER_INDICATOR` and refuses (a
 *   quoted slash inside an option value is not structure).
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

  describe('when a requested code fails to parse as an indicator part', () => {
    it('refuses a malformed coordinate decoration, keeping the stack and the semantic', () => {
      // regression: round-2 external review F2 — the malformed decoration used
      // to parse into a codeName-less error part that replaced the stack, and
      // stripSemantic still stripped, so a failed apply destroyed state.
      const b = new BlissSVGBuilder('B291;B81;B97');
      b.group(0).glyph(0).applyIndicators('B81:bad', { stripSemantic: true });
      expect(b.toString()).toBe('B291;B81;B97');
      expect(b.warnings.map(w => w.code)).toContain('MALFORMED_COORDINATES');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('applies the parseable subset of a mixed list, dropping the malformed code', () => {
      const b = new BlissSVGBuilder('B291;B81;B97');
      b.group(0).glyph(0).applyIndicators('B81:1,2;B81:bad');
      expect(b.toString()).toBe('B291;B81:1,2;B97');
      // no codeName-less error part between the applied indicator and the root
      expect(b.toJSON().groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'B81', 'B97']);
      expect(b.warnings.map(w => w.code)).toContain('MALFORMED_COORDINATES');
    });
  });

  describe('when a requested code contains a character separator', () => {
    it('warns MISPLACED_CHARACTER_INDICATOR and refuses instead of applying a fragment', () => {
      // 'B81:1,2/B86' used to apply B81:1,2 and silently DROP B86: the top-level
      // '/' splits at parse, so the code can never be one indicator part.
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('B81:1,2/B86');
      expect(b.toString()).toBe('B291;B81');
      const w = b.warnings.filter(x => x.code === 'MISPLACED_CHARACTER_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B81:1,2/B86');
    });

    it('does not misread a quoted slash inside an option value as structure', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('[data-t="a/b"]>B81');
      expect(b.toJSON().groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'B81']);
      expect(b.warnings.filter(x => x.code === 'MISPLACED_CHARACTER_INDICATOR')).toHaveLength(0);
    });

    it('does not misread an unquoted slash inside an option bracket as structure', () => {
      // pins the depth-0 condition of the top-level-slash scan: a slash inside
      // a bracket is option-value content whether quoted or not.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('[data-t=a/b]>B81');
      expect(b.toJSON().groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'B81']);
      expect(b.warnings).toHaveLength(0);
    });
  });

  describe('when a requested code carries its own parse warning but still attaches', () => {
    it('forwards the parse warning exactly once (validation parse is reused)', () => {
      // pins the part-node reuse in the assembly loop: re-parsing an applied
      // code would forward its _parseWarnings a second time.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('[grid]>B81');
      expect(b.toJSON().groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'B81']);
      expect(b.warnings.filter(w => w.code === 'MISPLACED_GLOBAL_OPTION')).toHaveLength(1);
    });
  });
});
