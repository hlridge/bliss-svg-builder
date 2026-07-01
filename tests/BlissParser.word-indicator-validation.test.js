import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the ;; (word-level indicator) CONTENT-validation contract: a `;;` code
 * must BE an indicator. A recognized non-indicator (a real base such as B291)
 * warns NON_INDICATOR_AS_WORD_INDICATOR; an unrecognized code warns
 * UNKNOWN_CODE; either way the offending code is dropped (not re-serialized) and
 * the base still renders (feedback_error_granularity: a bad decoration on valid
 * content). A mixed list drops only the offender and keeps the valid indicators.
 *
 * This revises the pre-Chunk-2 behavior pinned in
 * `BlissParser.double-semicolon.test.js` ("when ;; supplies only non-indicators"),
 * which stored the non-indicator in the overlay silently and filtered it only at
 * render. The render outcome (base only) is unchanged; the warning and the
 * dropped-not-stored serialization are new.
 *
 * Covers:
 * - Recognized non-indicator after ;; -> NON_INDICATOR_AS_WORD_INDICATOR
 *   (named source), dropped from serialization, base still renders.
 * - Unrecognized code after ;; -> UNKNOWN_CODE (named source), dropped.
 * - Mixed valid + non-indicator -> only the offender dropped; the valid
 *   indicator survives in the overlay and serialization.
 * - Negative control: a valid word-level indicator is unchanged (no warning,
 *   round-trips) -- the validation does not over-reach.
 * - stripSemantic (;;!) preserved as a reversible empty-codes strip overlay even
 *   when every supplied code is a dropped non-indicator.
 * - Granularity boundary: a STRUCTURALLY malformed ;; stays a whole-word
 *   MALFORMED_WORD_INDICATOR failure, NOT a content NON_INDICATOR warning.
 *
 * Does NOT cover:
 * - Structural malformed ;; fail-render, round-trip, and rebuild stickiness,
 *   see `BlissParser.double-semicolon.test.js`.
 * - The API overlay path (`group.applyIndicators('B291')`), see
 *   `ElementHandle.word-indicators.test.js`.
 * - The define-time rejection of a ;; baked into a definition, see
 *   `BlissSVGBuilder.define.test.js`.
 */

const warnings = (dsl) => new BlissSVGBuilder(dsl).warnings;
const warningCodes = (dsl) => warnings(dsl).map((w) => w.code);
const overlay = (dsl) => BlissParser.parse(dsl).groups[0]?.wordIndicators;
const svgEq = (a, b) =>
  new BlissSVGBuilder(a).svgCode === new BlissSVGBuilder(b).svgCode;

describe('BlissParser word-indicator validation', () => {
  describe('when ;; carries a recognized non-indicator code', () => {
    it('warns NON_INDICATOR_AS_WORD_INDICATOR naming the offending code', () => {
      const w = warnings('B303;;B291').find(
        (x) => x.code === 'NON_INDICATOR_AS_WORD_INDICATOR'
      );
      expect(w).toBeDefined();
      expect(w.source).toBe('B291');
      expect(w.message).toContain('B291');
    });

    it('drops the non-indicator so it does not re-serialize', () => {
      expect(new BlissSVGBuilder('B303;;B291').toString()).toBe('B303');
    });

    it('still renders the base character', () => {
      // warn + drop + STILL RENDER: the decoration is dropped, the content stays.
      expect(svgEq('B303;;B291', 'B303')).toBe(true);
    });
  });

  describe('when ;; carries an unrecognized code', () => {
    it('warns UNKNOWN_CODE naming the offending code', () => {
      const w = warnings('B303;;ZZ9').find((x) => x.code === 'UNKNOWN_CODE');
      expect(w).toBeDefined();
      expect(w.source).toBe('ZZ9');
    });

    it('drops the unknown code so it does not re-serialize', () => {
      expect(new BlissSVGBuilder('B303;;ZZ9').toString()).toBe('B303');
    });
  });

  describe('when ;; mixes a valid indicator with a non-indicator', () => {
    it('drops only the offender and keeps the valid indicator', () => {
      // B81 is an indicator, B291 is not; only B291 is dropped.
      expect(new BlissSVGBuilder('B303;;B81;B291').toString()).toBe('B303;;B81');
      expect(overlay('B303;;B81;B291')).toEqual({ codes: ['B81'], stripSemantic: false });
    });

    it('warns for the dropped non-indicator only', () => {
      const w = warnings('B303;;B81;B291').find(
        (x) => x.code === 'NON_INDICATOR_AS_WORD_INDICATOR'
      );
      expect(w).toBeDefined();
      expect(w.source).toBe('B291');
    });
  });

  describe('when ;; carries only valid indicators', () => {
    it('accepts the word-level indicator with no validation warning', () => {
      // control: the validation must not over-reach to a legitimate indicator.
      const codes = warningCodes('B303;;B81');
      expect(codes).not.toContain('NON_INDICATOR_AS_WORD_INDICATOR');
      expect(codes).not.toContain('UNKNOWN_CODE');
      expect(new BlissSVGBuilder('B303;;B81').toString()).toBe('B303;;B81');
    });
  });

  describe('when ;; strips the semantic but its only code is a non-indicator', () => {
    it('keeps the reversible strip overlay while warning and dropping the non-indicator', () => {
      // pins the stripSemantic branch of the store decision: the strip (;;!) is
      // meaningful even when every supplied code is dropped, so the empty-codes
      // strip overlay survives and re-serializes as ;;! (a "store only when a
      // code remains" mutant would silently lose the strip).
      expect(overlay('B291;B97;;!B291')).toEqual({ codes: [], stripSemantic: true });
      expect(new BlissSVGBuilder('B291;B97;;!B291').toString()).toBe('B291;B97;;!');
      expect(warningCodes('B291;B97;;!B291')).toContain('NON_INDICATOR_AS_WORD_INDICATOR');
    });
  });

  describe('when ;; is structurally malformed', () => {
    it('stays a whole-word MALFORMED failure, not a content non-indicator warning', () => {
      // granularity boundary: a glyph after the indicators (B303;;B81/B431) is a
      // STRUCTURAL fault -> the whole word fails; it must not be re-routed to the
      // content warn-and-drop path.
      const codes = warningCodes('B303;;B81/B431');
      expect(codes).toContain('MALFORMED_WORD_INDICATOR');
      expect(codes).not.toContain('NON_INDICATOR_AS_WORD_INDICATOR');
    });
  });
});
