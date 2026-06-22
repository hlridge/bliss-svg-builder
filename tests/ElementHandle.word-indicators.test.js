import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins ElementHandle word-level indicator API on a group handle:
 * applyIndicators / clearIndicators operate on the reversible
 * `group.wordIndicators` overlay (the DSL `;;` channel), not on the head
 * glyph's baked parts. The base glyphs stay intact, so a later clear restores
 * them (including a semantic the overlay suppressed). A `flatten` flag bakes
 * the overlay onto the head as character-level parts instead, reproducing the
 * pre-overlay `applyHeadIndicators` shape.
 *
 * Covers:
 * - apply default: stores the requested codes as an overlay, base parts
 *   untouched; replace-all over an existing overlay; { stripSemantic: true }
 *   stores the strip flag.
 * - apply { flatten: true }: bakes onto the head, no overlay; drops a
 *   pre-existing overlay before baking, but keeps it when the flattened code
 *   applies no indicator (N15).
 * - clear default: removes the overlay and restores the base, including a
 *   semantic the overlay's `!` strip had suppressed (N12); { stripSemantic }
 *   keeps a reversible empty-codes strip overlay.
 * - DSL/API parity: the overlay set by the API is byte-identical (toString,
 *   svgCode, toJSON) to the equivalent `;;` / `;;!` DSL marker.
 * - The glyph-level (character) applyIndicators path is unchanged.
 *
 * Does NOT cover:
 * - Character-level applyIndicators / clearIndicators on a glyph handle, see
 *   `ElementHandle.apply-indicators.test.js` and
 *   `ElementHandle.clear-indicators.test.js`.
 * - The deprecated baking aliases applyHeadIndicators / clearHeadIndicators,
 *   see `ElementHandle.head-indicators.test.js`.
 * - Parser grammar for `;;` and overlay render/serialize internals, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - The `flattenIndicators` serialization opt-out on toString/toJSON, see
 *   `BlissSVGBuilder.flatten-indicators.test.js`.
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

// Reads a glyph's base part codes by index (the head is glyph 0 in every word
// used here). Named for what it does, not "head", so a future crowned-word
// case can't pass spuriously against the wrong glyph.
const glyphParts = (builder, groupIdx = 0, glyphIdx = 0) => {
  const glyph = builder.toJSON().groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

describe('ElementHandle word indicators', () => {
  describe('when applying a word-level indicator to a group handle', () => {
    it('stores the requested code as a reversible overlay leaving the base intact', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86');
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(glyphParts(b)).toEqual(['B313']);
    });

    it('replaces an existing overlay (replace-all)', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B86');
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;B86');
    });

    it('stores multiple semicolon-separated codes in order', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B81;B86');
      expect(overlay(b)).toEqual({ codes: ['B81', 'B86'], stripSemantic: false });
    });

    it('records the strip flag with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86', { stripSemantic: true });
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: true });
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      const result = b.group(0).applyIndicators('B86');
      expect(result.level).toBe(1);
    });
  });

  describe('when applying with the flatten flag', () => {
    it('bakes the indicator onto the head as character-level parts with no overlay', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B313', 'B86']);
      expect(b.toString()).toBe('B313;B86/B1103');
    });

    it('matches the pre-overlay applyHeadIndicators output', () => {
      const flat = new BlissSVGBuilder('B313/B1103');
      flat.group(0).applyIndicators('B86', { flatten: true });
      const head = new BlissSVGBuilder('B313/B1103');
      head.group(0).applyHeadIndicators('B86');
      expect(flat.toString()).toBe(head.toString());
      expect(flat.svgCode).toBe(head.svgCode);
    });

    it('drops a pre-existing overlay before baking the new indicator', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B313', 'B86']);
    });

    it('keeps a pre-existing overlay when the flattened code applies no indicator', () => {
      // N15 (R15 Task 5): a non-indicator code bakes nothing, so the overlay must
      // not be silently destroyed.
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B303', { flatten: true });
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;B81');
    });

    it('preserves the head semantic on a default (non-strip) flatten apply', () => {
      // pins that the flatten apply forwards stripSemantic only when asked:
      // baking B86 over the baked semantic B97 keeps B97 (B86 is adjectival, so
      // the semantic goes last). kills an always-strip mutant on the delegated
      // flatten apply (R15 Task 5 review F2 fix).
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(b.toString()).toBe('B291;B86;B97');
    });
  });

  describe('when clearing word-level indicators from a group handle', () => {
    it('removes the overlay and restores a base semantic the strip had suppressed', () => {
      // regression: N12 — a ;;! strip must keep the base recoverable
      const b = new BlissSVGBuilder('B303;B97;;!B86');
      b.group(0).clearIndicators();
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B303', 'B97']);
      expect(b.toString()).toBe('B303;B97');
    });

    it('restores a multi-glyph word to its bare base', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).clearIndicators();
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B313/B1103');
    });

    it('keeps a reversible empty-codes strip overlay with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B303;B97');
      b.group(0).clearIndicators({ stripSemantic: true });
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: true });
      expect(glyphParts(b)).toEqual(['B303', 'B97']);
      expect(b.toString()).toBe('B303;B97;;!');
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      const result = b.group(0).clearIndicators();
      expect(result.level).toBe(1);
    });
  });

  describe('when comparing the overlay API to the DSL marker', () => {
    it('matches `;;B86` byte-for-byte across toString, svgCode, and toJSON', () => {
      const dsl = new BlissSVGBuilder('B313/B1103;;B86');
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('B86');
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });

    it('matches `;;!B86` byte-for-byte for a stripping overlay', () => {
      const dsl = new BlissSVGBuilder('B313/B1103;;!B86');
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('B86', { stripSemantic: true });
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });
  });

  describe('when the handle is a glyph', () => {
    it('leaves the character-level applyIndicators path baking onto parts', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B86');
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B291', 'B86']);
    });
  });

  describe('when the word head is itself a lone indicator', () => {
    // R15 Task 5: the two surfaces now AGREE. The overlay (default) path treats
    // the first part as the base and APPENDS; the flatten path (and its legacy
    // applyHeadIndicators alias) bakes onto the head, which under the symmetric
    // i>0 rule also treats the lone indicator as the base and attaches. The old
    // flatten no-op (the new code was dropped) is gone.
    it('appends via the overlay path', () => {
      const b = new BlissSVGBuilder('B81');
      b.group(0).applyIndicators('B86');
      expect(b.toString()).toBe('B81;;B86');
    });

    it('bakes onto the lone-indicator head via the flatten path, matching legacy applyHeadIndicators', () => {
      const flat = new BlissSVGBuilder('B81');
      flat.group(0).applyIndicators('B86', { flatten: true });
      const legacy = new BlissSVGBuilder('B81');
      legacy.group(0).applyHeadIndicators('B86');
      expect(flat.toString()).toBe('B81;B86');
      expect(flat.toString()).toBe(legacy.toString());
      expect(flat.svgCode).toBe(legacy.svgCode);
    });
  });
});
