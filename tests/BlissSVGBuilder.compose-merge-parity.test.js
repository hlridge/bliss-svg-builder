import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the R15 word-slot-model invariant that building one word by `/`
 * composition is byte-identical to building it by `//` plus mergeWithNext:
 * the same first-wins rule governs both the word-level `;;` slot and the `^`
 * head marker, so the two surfaces cannot silently diverge.
 *
 * This is the cross-path tie the sibling suites assert only in prose: the
 * promotion suite pins the `/`-compose result against fixed strings and the
 * structure suite pins mergeWithNext against fixed strings, but neither runs
 * the same content through both paths and compares them. A regression that
 * touches only one path (the Finding A class) survives the per-path pins and
 * is caught only here (feedback_dsl_api_parity, feedback_invariant_over_blast_radius).
 *
 * Covers:
 * - Word-slot first-wins parity: two promoted overlays colliding, a leading
 *   empty slot dropping a later overlay, a lone surviving overlay, and a
 *   strip-semantic overlay, each byte-identical in toString, svgCode, and the
 *   DROPPED_WORD_INDICATOR sources across `/` and `//`+mergeWithNext.
 * - Head-marker first-wins parity: colliding `^` markers and a lone `^` resolve
 *   to the same serialized word on both paths (the `^` drop stays silent).
 *
 * Does NOT cover:
 * - The concrete per-path values and the promotion mechanism, see
 *   `BlissSVGBuilder.indicator-promotion.test.js`.
 * - mergeWithNext / splitAt overlay mechanics and the split<->merge round-trip,
 *   see `ElementHandle.word-indicator-structure.test.js`.
 * - Overlay render / serialize internals, see
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 */
describe('BlissSVGBuilder compose-merge parity', () => {
  const PARITY_DEFS = {
    NOUN_BI: { codeString: 'B291;B81' }, // base + grammatical (verbal) indicator
    NOUN_S: { codeString: 'B291;B97' },  // base + semantic ('thing') indicator
  };

  beforeAll(() => BlissSVGBuilder.define(PARITY_DEFS));
  afterAll(() => Object.keys(PARITY_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  // Builds the same word two ways: `/`-composition (one parse) and
  // `//`+mergeWithNext (two words merged), returning both builders to compare.
  const composeVsMerge = (composeStr, mergeStr) => {
    const composed = new BlissSVGBuilder(composeStr);
    const merged = new BlissSVGBuilder(mergeStr);
    merged.group(0).mergeWithNext();
    return { composed, merged };
  };

  const dropSources = (builder) =>
    builder.warnings.filter(w => w.code === 'DROPPED_WORD_INDICATOR').map(w => w.source);

  describe('when a word-level slot is built by composition versus merge', () => {
    it('matches when two promoted slots collide and the second is dropped', () => {
      const { composed, merged } = composeVsMerge(
        'NOUN_BI;B97/NOUN_BI;B86', 'NOUN_BI;B97//NOUN_BI;B86');
      expect(composed.toString()).toBe('B291;B81/B291;B81;;B97');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(merged)).toEqual(dropSources(composed));
      expect(dropSources(composed)).toEqual([';;B86']);
    });

    it('matches when a leading empty slot drops a later overlay', () => {
      const { composed, merged } = composeVsMerge(
        'H/NOUN_BI;B97', 'H//NOUN_BI;B97');
      expect(composed.toString()).toBe('H/B291;B81');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(merged)).toEqual(dropSources(composed));
      expect(dropSources(composed)).toEqual([';;B97']);
    });

    it('matches when a single promoted slot survives with no collision', () => {
      const { composed, merged } = composeVsMerge(
        'NOUN_BI;B97/E', 'NOUN_BI;B97//E');
      expect(composed.toString()).toBe('B291;B81/E;;B97');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(merged)).toEqual(dropSources(composed));
      expect(dropSources(composed)).toEqual([]);
    });

    it('matches when the surviving slot strips the semantic root', () => {
      const { composed, merged } = composeVsMerge(
        'NOUN_S;!B81/NOUN_S;B86', 'NOUN_S;!B81//NOUN_S;B86');
      expect(composed.toString()).toBe('B291;B97/B291;B97;;!B81');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(merged)).toEqual(dropSources(composed));
      expect(dropSources(composed)).toEqual([';;B86']);
    });
  });

  describe('when a head marker is built by composition versus merge', () => {
    it('matches when two head markers collide and the first wins', () => {
      // `^` is word-scoped and first-wins like the slot, but its drop is silent
      // (a structural re-derive, not lost data), so no DROPPED_WORD_INDICATOR.
      const { composed, merged } = composeVsMerge('B313^/B431^', 'B313^//B431^');
      expect(composed.toString()).toBe('B313/B431');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
      expect(dropSources(composed)).toEqual([]);
      expect(dropSources(merged)).toEqual([]);
    });

    it('matches when only the first word carries the head marker', () => {
      const { composed, merged } = composeVsMerge('B313^/B431', 'B313^//B431');
      expect(composed.toString()).toBe('B313/B431');
      expect(merged.toString()).toBe(composed.toString());
      expect(merged.svgCode).toBe(composed.svgCode);
    });
  });
});
