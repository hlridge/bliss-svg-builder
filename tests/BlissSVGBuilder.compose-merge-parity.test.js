import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the word-slot-model invariant that merging two word-level-overlay words
 * with `//`+mergeWithNext converges to exactly the canonical single-overlay word
 * written directly by `/` composition: byte-identical toString and svgCode.
 *
 * Under Strict Indicator Separation a single `/`-composed word carries at most
 * one trailing `;;` overlay (a non-trailing `;;` is malformed), so the canonical
 * compose side never collides. The first-wins collision is therefore exercised
 * only on the merge side: when two overlay words merge, the first overlay wins
 * and the rest are dropped (DROPPED_WORD_INDICATOR). The render still matches the
 * canonical compose, so the two construction paths cannot silently diverge
 * (feedback_invariant_over_blast_radius, feedback_dsl_api_parity).
 *
 * Covers:
 * - Merge-converges-to-canonical for a word-level overlay: two overlays colliding
 *   (second dropped), a leading plain slot dropping a trailing overlay, a lone
 *   surviving overlay, and a surviving strip-semantic overlay - each byte-identical
 *   in toString and svgCode, with the DROPPED_WORD_INDICATOR sources on the merge
 *   side and none on the canonical compose side.
 * - Head-marker first-wins parity: colliding `^` markers and a lone `^` resolve to
 *   the same serialized word on both paths (the `^` drop stays silent).
 *
 * Does NOT cover:
 * - The per-path overlay values and the ;; store mechanism, see
 *   `BlissParser.double-semicolon.test.js`.
 * - mergeWithNext / splitAt overlay mechanics and the split<->merge round-trip,
 *   see `ElementHandle.word-indicator-structure.test.js`.
 * - Overlay render / serialize internals, see
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - The removed `;`-on-alias promotion that used to be the compose-side collision
 *   source, see `BlissSVGBuilder.indicator-promotion.test.js`.
 */
describe('BlissSVGBuilder compose-merge parity', () => {
  // Builds the same word two ways: `/`-composition (one parse, the canonical
  // single-overlay form) and `//`+mergeWithNext (two overlay words merged),
  // returning both builders to compare.
  const composeVsMerge = (composeStr, mergeStr) => {
    const composed = new BlissSVGBuilder(composeStr);
    const merged = new BlissSVGBuilder(mergeStr);
    merged.group(0).mergeWithNext();
    return { composed, merged };
  };

  const dropSources = (builder) =>
    builder.warnings.filter(w => w.code === 'DROPPED_WORD_INDICATOR').map(w => w.source);

  describe('when a word-level overlay is built by composition versus merge', () => {
    it('converges for two overlays colliding (second dropped on merge)', () => {
      const { composed, merged } = composeVsMerge(
        'B291;B81/B291;B81;;B97', 'B291;B81;;B97//B291;B81;;B86');
      expect(composed.toString()).toBe('B291;B81/B291;B81;;B97');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      // The canonical compose has no collision; the merge collides first-wins.
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([';;B86']);
    });

    it('converges for a leading plain slot dropping a trailing overlay', () => {
      const { composed, merged } = composeVsMerge(
        'H/B291;B81', 'H//B291;B81;;B97');
      expect(composed.toString()).toBe('H/B291;B81');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([';;B97']);
    });

    it('converges for a single overlay surviving with no collision', () => {
      const { composed, merged } = composeVsMerge(
        'B291;B81/E;;B97', 'B291;B81;;B97//E');
      expect(composed.toString()).toBe('B291;B81/E;;B97');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([]);
    });

    it('converges for a surviving overlay that strips the semantic root', () => {
      const { composed, merged } = composeVsMerge(
        'B291;B97/B291;B97;;!B81', 'B291;B97;;!B81//B291;B97;;B86');
      expect(composed.toString()).toBe('B291;B97/B291;B97;;!B81');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([';;B86']);
    });
  });

  describe('when a head marker is built by composition versus merge', () => {
    it('holds for two head markers colliding (first wins)', () => {
      // `^` is word-scoped and first-wins like the slot, but its drop is silent
      // (a structural re-derive, not lost data), so no DROPPED_WORD_INDICATOR.
      // rc.4 head-marker fidelity: the surviving stored designation re-emits.
      const { composed, merged } = composeVsMerge('B313^/B431^', 'B313^//B431^');
      expect(composed.toString()).toBe('B313^/B431');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([]);
    });

    it('holds for a lone first-word head marker', () => {
      const { composed, merged } = composeVsMerge('B313^/B431', 'B313^//B431');
      expect(composed.toString()).toBe('B313^/B431');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
    });
  });
});
