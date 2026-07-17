import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the NOOP_INDICATOR_MUTATION warning: applyIndicators / clearIndicators
 * surface a warning (instead of silently no-opping) when the mutation cannot
 * apply or remove any indicator. The warning lives on the persistent mutation
 * channel, so it survives later rebuilds and reads through `warnings`.
 *
 * Covers:
 * - apply whose requested codes contain no recognized indicator no longer
 *   NOOP-warns AT ALL: each rejected code now warns individually
 *   (`NON_INDICATOR_AS_CHARACTER_INDICATOR` / `UNKNOWN_CODE`, strictly more
 *   informative), see `ElementHandle.character-indicator-validation.test.js`.
 *   This file pins the NOOP absence for those scenarios. An all-invalid apply
 *   REFUSES (rc.4 indicator-mutation fidelity): it mutates nothing, so the
 *   per-code warnings are its only visible effect, see
 *   `ElementHandle.indicator-mutation-fidelity.test.js`.
 * - apply on a glyph that cannot carry an indicator (a space glyph; a
 *   non-indicator code on an empty glyph). A lone indicator or empty glyph
 *   given a real indicator now attaches it (R15 Task 5), so it is not warned.
 * - apply/clear on a SPACE GROUP handle (round-2 review F1): refuses + warns
 *   instead of storing an overlay the space serialization would eat.
 * - apply on an invalid part pattern (a non-indicator part after an indicator),
 *   including the empty apply's warning source falling back to the target code
 *   (never the empty string).
 * - clear that finds no indicators to remove, including with the removed
 *   stripSemantic option (ignored on clear since rc.4; clear is the pure undo).
 * - The warning source falls back to a placeholder when the target part has no
 *   resolvable code name (malformed input).
 * - Negative controls: a real apply / real clear does NOT warn; a default clear
 *   that only preserves a semantic root is a documented no-op and is NOT warned;
 *   a flatten clear that removes a `;;` overlay does NOT warn at any char-level
 *   warning site (the overlay removal is the effect, so the delegated clear is
 *   suppressed), yet a flatten clear with no overlay and no baked indicators
 *   DOES warn.
 * - N15: a flatten apply of a non-indicator code over a valid `;;` overlay keeps
 *   the overlay and warns about the rejected code (the overlay is not lost);
 *   the warning is the per-code validation code, not NOOP.
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
  builder.warnings.filter(w => w.code === 'NOOP_INDICATOR_MUTATION');

describe('ElementHandle indicator no-op warning', () => {
  describe('when applyIndicators is given no recognized indicator', () => {
    it('does not NOOP-warn; the per-code validation warning covers it', () => {
      // retarget: the old single "applied no indicator" NOOP arm is replaced by
      // per-code NON_INDICATOR_AS_CHARACTER_INDICATOR / UNKNOWN_CODE warnings,
      // pinned in ElementHandle.character-indicator-validation.test.js.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B303');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn when at least one requested code is a valid indicator', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('H;B86');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a non-indicator code leaves the existing indicators untouched', () => {
    // rc.4 retarget: an all-invalid apply REFUSES (mutates nothing), so there
    // is never an "actual effect" to exempt. The per-code validation warning
    // is the visibility channel; NOOP stays silent for apply.
    it('does not NOOP-warn when a non-indicator code is refused over a grammatical indicator', () => {
      const b = new BlissSVGBuilder('B291;B97;B81');
      b.group(0).glyph(0).applyIndicators('H');
      expect(b.toString()).toBe('B291;B97;B81');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not NOOP-warn and does not strip when a refused code requests stripSemantic', () => {
      // F2 generalized (rc.4): failed content must not strip the semantic as a
      // side effect; the deliberate spelling is applyIndicators('', { stripSemantic: true }).
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B303', { stripSemantic: true });
      expect(b.toString()).toBe('B291;B97');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not NOOP-warn when a non-indicator code leaves the indicators unchanged', () => {
      // The all-invalid apply refuses, so the call changes nothing; visibility
      // comes from the per-code validation warning
      // (ElementHandle.character-indicator-validation.test.js), not NOOP.
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('H');
      expect(b.toString()).toBe('B291;B97');
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when applyIndicators targets a glyph that cannot carry an indicator', () => {
    it('warns that a space glyph cannot carry an indicator', () => {
      const b = new BlissSVGBuilder('B291//B291');
      b.element(1).glyph(0).applyIndicators('B86');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].message).toContain('space');
    });

    it('falls the warning source back to the target code on an empty apply', () => {
      // external review F4: '' is a legal code since rc.4; the source must
      // name the space glyph, not become an empty string.
      const b = new BlissSVGBuilder('B291//B291');
      b.element(1).glyph(0).applyIndicators('');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('TSP');
    });

    it('warns the validation code when a non-indicator is applied to an empty glyph', () => {
      // regression (R15 Task 5): an empty glyph attaches a real indicator
      // (matching addPart), but a non-indicator code applies nothing and warns
      // rather than silently no-opping. Retarget: the warning is now the
      // per-code validation code, not NOOP.
      const b = new BlissSVGBuilder('B291;B86');
      b.group(0).glyph(0).part(1).detach();
      b.group(0).glyph(0).part(0).detach();
      b.group(0).glyph(0).applyIndicators('B303');
      expect(noopWarnings(b)).toHaveLength(0);
      const w = b.warnings.filter(x => x.code === 'NON_INDICATOR_AS_CHARACTER_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B303');
    });
  });

  describe('when applyIndicators targets an invalid part pattern', () => {
    it('warns when a non-indicator part follows an indicator part', () => {
      // the invalid pattern is only constructible through the unknown-code
      // retention path since row 67 normalizes known misplacements away
      const b = new BlissSVGBuilder('B291;B86;ZZ9');
      b.group(0).glyph(0).applyIndicators('B81');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].message).toContain('invalid indicator pattern');
    });

    it('sources an empty apply with the target code, not the empty string', () => {
      // pins the `code || targetCode` fallback (|| deliberately, not ??): the
      // empty apply's '' must never become an empty warning source.
      const b = new BlissSVGBuilder('B291;B86;ZZ9');
      b.group(0).glyph(0).applyIndicators('');
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B291');
    });
  });

  describe('when the word-level channel targets a space group', () => {
    // regression: round-2 external review F1 — the overlay was stored on the
    // space group with zero warnings, then the '//' serialization ate it.
    // Parity with the glyph-level space arm: refuse + warn.
    it('refuses an apply and warns instead of storing an overlay', () => {
      const b = new BlissSVGBuilder('TSP');
      b.element(0).applyIndicators('B81');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B81');
      expect(w[0].message).toContain('space');
      expect(b.toString()).toBe('//');
    });

    it('warns the space no-op on a clear too', () => {
      const b = new BlissSVGBuilder('TSP');
      b.element(0).clearIndicators();
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].message).toContain('clearIndicators()');
      expect(w[0].message).toContain('space');
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

    it('warns when a clear with the removed stripSemantic option finds nothing to clear', () => {
      // stripSemantic is ignored on clear since rc.4; the call is a plain clear.
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

    it('does not warn when an empty apply with stripSemantic clears an existing semantic', () => {
      // rc.4: the strip-everything spelling moved from clearIndicators({stripSemantic})
      // to applyIndicators('', { stripSemantic: true }); a real strip is a real
      // mutation, so it does not NOOP-warn.
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('', { stripSemantic: true });
      expect(b.toString()).toBe('B291');
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
      b.group(0).clearIndicators({ flatten: true });
      expect(b.toString()).toBe('B291/B303');
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('still warns when there is no overlay and no baked indicator to clear', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).clearIndicators({ flatten: true });
      expect(noopWarnings(b)).toHaveLength(1);
    });

    it('does not warn when the overlay head is a lone indicator', () => {
      // R15 Task 5: B81 is now a base (i>0 rule), so the delegated clear finds
      // nothing to clear; the suppress signal keeps that from warning, because
      // removing the overlay is the real effect.
      const b = new BlissSVGBuilder('B81;;B86');
      b.group(0).clearIndicators({ flatten: true });
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('does not warn when the overlay head has an invalid part pattern (suppressed at the pattern site)', () => {
      // The suppress signal must also reach the invalid-pattern site. Head
      // B291;B86;B303 has a non-indicator (B303) after an indicator (B86).
      const b = new BlissSVGBuilder('B291;B86;B303;;B85');
      b.group(0).clearIndicators({ flatten: true });
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(noopWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a flatten apply cannot bake a non-indicator code', () => {
    it('keeps the overlay and warns the validation code for the rejected code', () => {
      // N15 (R15 Task 5): a flatten apply only drops the `;;` overlay when the
      // bake actually lands. A non-indicator code bakes nothing, so the overlay
      // is preserved; the rejected code warns (per-code validation, not NOOP).
      const b = new BlissSVGBuilder('B291;;B86');
      b.group(0).applyIndicators('B303', { flatten: true });
      expect(b.toString()).toBe('B291;;B86');
      expect(noopWarnings(b)).toHaveLength(0);
      const w = b.warnings.filter(x => x.code === 'NON_INDICATOR_AS_CHARACTER_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B303');
    });

    it('does not strip the head when the non-indicator code also requests stripSemantic', () => {
      // F2 (R15 Task 5 review): a non-indicator flatten apply is a pure no-op even
      // with stripSemantic — it must not strip the head's baked semantic as a side
      // effect while keeping the overlay. The deliberate strip spelling is
      // applyIndicators('', { flatten: true, stripSemantic: true }).
      const b = new BlissSVGBuilder('B291;B97;;B81');
      b.group(0).applyIndicators('B303', { flatten: true, stripSemantic: true });
      expect(b.toString()).toBe('B291;B97;;B81');
      expect(noopWarnings(b)).toHaveLength(0);
      const w = b.warnings.filter(x => x.code === 'NON_INDICATOR_AS_CHARACTER_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B303');
    });
  });
});
