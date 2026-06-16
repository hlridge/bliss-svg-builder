import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the INDICATOR_MUTATION_NOOP warning: applyIndicators / clearIndicators
 * surface a warning (instead of silently no-opping) when the mutation cannot
 * apply or remove any indicator. The warning lives on the persistent mutation
 * channel, so it survives later rebuilds and reads through `warnings`.
 *
 * Covers:
 * - apply whose requested codes contain no recognized indicator AND leaves the
 *   indicator list unchanged (a plain character code). The trigger gates on the
 *   actual effect: a non-indicator code that strips an existing indicator
 *   (replace-all / stripSemantic) is a real mutation and is NOT warned.
 * - apply on a glyph with no base part to carry an indicator (an
 *   indicator-only glyph), including the flatten path's lone-indicator-head
 *   data loss (a word-level flatten that drops the requested code).
 * - apply on an invalid part pattern (a non-indicator part after an indicator).
 * - clear that finds no indicators to remove, including stripSemantic clearing
 *   a glyph that has no semantic.
 * - The warning source falls back to a placeholder when the target part has no
 *   resolvable code name (malformed input).
 * - Negative controls: a real apply / real clear does NOT warn; a default clear
 *   that only preserves a semantic root is a documented no-op and is NOT warned;
 *   a flatten clear that removes a `;;` overlay does NOT warn at any of the three
 *   char-level warning sites (the overlay removal is the effect, so the
 *   delegated clear is suppressed), yet a flatten clear with no overlay and no
 *   baked indicators DOES warn.
 * - Tripwire: a flatten apply of an unrecognized code over a valid `;;` overlay
 *   warns about the dropped code but does not yet report the lost overlay.
 *
 * Does NOT cover:
 * - The no-op behaviour itself (parts left unchanged), see
 *   `ElementHandle.apply-indicators.test.js`.
 * - Word-level overlay no-ops on the default (non-flatten) channel:
 *   `group.applyIndicators` stores the codes for render-time resolution and
 *   round-trips them, so it is not a silent drop, see
 *   `ElementHandle.word-indicators.test.js`.
 * - The DROPPED_WORD_INDICATOR mergeWithNext warning, see
 *   `ElementHandle.word-indicator-structure.test.js`.
 */

const noopWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'INDICATOR_MUTATION_NOOP');

describe('ElementHandle indicator no-op warning', () => {
  describe('when applyIndicators is given no recognized indicator', () => {
    it('warns naming the requested code that is not an indicator', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B303');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].code).toBe('INDICATOR_MUTATION_NOOP');
      expect(w[0].source).toBe('B303');
      expect(w[0].message).toContain("applyIndicators('B303')");
    });

    it('does not warn when at least one requested code is a valid indicator', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('H;B86');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a non-indicator code changes the existing indicators', () => {
    // regression: the warning gates on the ACTUAL effect, not merely on whether
    // the requested codes are indicators. A non-indicator input that strips an
    // existing indicator (replace-all / stripSemantic) is a real mutation, not a
    // no-op, so it must NOT warn.
    it('does not warn when a non-indicator code strips an existing grammatical indicator', () => {
      const b = new BlissSVGBuilder('B291;B97;B81');
      b.group(0).glyph(0).applyIndicators('H');
      expect(b.toString()).toBe('B291;B97');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn when stripSemantic removes the semantic via a non-indicator code', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B303', { stripSemantic: true });
      expect(b.toString()).toBe('B291');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('warns when a non-indicator code leaves the indicators unchanged', () => {
      // B97 (semantic) is preserved and there is no grammatical to strip, so the
      // call is a genuine no-op.
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('H');
      expect(b.toString()).toBe('B291;B97');
      expect(noopWarnings(b)).toHaveLength(1);
    });
  });

  describe('when applyIndicators targets a glyph with no base part', () => {
    it('warns that an indicator-only glyph has no base to carry an indicator', () => {
      const b = new BlissSVGBuilder('B86');
      b.group(0).glyph(0).applyIndicators('B81');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B81');
      expect(w[0].message).toContain("applyIndicators('B81')");
      expect(w[0].message).toContain('indicator-only');
    });

    it('warns when an indicator part precedes the base parts', () => {
      const b = new BlissSVGBuilder('B86;B291');
      b.group(0).glyph(0).applyIndicators('B81');
      expect(noopWarnings(b)).toHaveLength(1);
    });

    it('surfaces the dropped code when flattening a word whose head is a lone indicator', () => {
      // regression: DECIDED 2-A (plan 2026-06-14). A flatten onto a
      // lone-indicator head silently dropped the requested code; D4 surfaces it.
      const b = new BlissSVGBuilder('B81');
      b.group(0).applyIndicators('B86', { flatten: true });
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B86');
    });
  });

  describe('when applyIndicators targets an invalid part pattern', () => {
    it('warns when a non-indicator part follows an indicator part', () => {
      const b = new BlissSVGBuilder('B291;B86;B303');
      b.group(0).glyph(0).applyIndicators('B81');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].message).toContain('invalid indicator pattern');
    });
  });

  describe('when clearIndicators finds nothing to clear', () => {
    it('warns on a bare glyph with no indicators', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).clearIndicators();
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B291');
      expect(w[0].message).toContain('clearIndicators()');
    });

    it('warns when stripSemantic clears a glyph that has no semantic', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(noopWarnings(b)).toHaveLength(1);
    });
  });

  describe('when a real indicator mutation succeeds', () => {
    it('does not warn on a genuine apply', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B86');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn on a genuine clear', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.group(0).glyph(0).clearIndicators();
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn when stripSemantic clears an existing semantic', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn on a semantic-only glyph cleared without stripSemantic', () => {
      // A plain clearIndicators() preserves the semantic by default, so on a
      // semantic-only glyph it changes nothing. That is documented behavior, not
      // a surprising no-op, so it is intentionally not warned.
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).clearIndicators();
      expect(b.toString()).toBe('B291;B97');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when the target part has no resolvable code name', () => {
    it('uses a placeholder name rather than an empty name in the clear warning', () => {
      const b = new BlissSVGBuilder('@@@');
      b.group(0).glyph(0).clearIndicators();
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('unknown');
    });
  });

  describe('when a flatten clear removes a word-level overlay', () => {
    it('does not warn even though the head glyph has no baked indicators', () => {
      // The overlay removal is the real effect; the delegated char-level
      // clear-nothing must be suppressed so it is not reported as a no-op.
      const b = new BlissSVGBuilder('B291/B303;;B86');
      b.group(0).clearHeadIndicators();
      expect(b.toString()).toBe('B291/B303');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('still warns when there is no overlay and no baked indicator to clear', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).clearHeadIndicators();
      expect(noopWarnings(b)).toHaveLength(1);
    });

    it('does not warn when the overlay head is a lone indicator (suppressed at the no-base site)', () => {
      // The suppress signal must reach the baseParts-empty site, not just the
      // clear-nothing site. Head B81 is a lone indicator (no base part).
      const b = new BlissSVGBuilder('B81;;B86');
      b.group(0).clearHeadIndicators();
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn when the overlay head has an invalid part pattern (suppressed at the pattern site)', () => {
      // The suppress signal must also reach the invalid-pattern site. Head
      // B291;B86;B303 has a non-indicator (B303) after an indicator (B86).
      const b = new BlissSVGBuilder('B291;B86;B303;;B85');
      b.group(0).clearHeadIndicators();
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a flatten apply drops a valid overlay for an unrecognized code', () => {
    // Tripwire pinning TODAY's behavior (gated backlog item
    // .claude/backlog/indicator-on-atypical-base.md): a flatten apply deletes the
    // pre-existing valid `;;` overlay BEFORE baking, so applying a non-indicator
    // code loses BOTH the overlay and the code. Only the dropped code is warned
    // today; the lost overlay is not separately reported. A future fix that warns
    // about (or preserves) the dropped overlay must update this test.
    it('warns about the dropped code but not yet the lost overlay', () => {
      const b = new BlissSVGBuilder('B291;;B86');
      b.group(0).applyIndicators('B303', { flatten: true });
      expect(b.toString()).toBe('B291');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B303');
    });
  });
});
