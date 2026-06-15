import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins ElementHandle group-level head-indicator API: applyHeadIndicators(code, options?)
 * and clearHeadIndicators(options?), now DEPRECATED aliases of the flatten variant
 * of the polymorphic indicator API: applyHeadIndicators(c, o) delegates to
 * applyIndicators(c, { ...o, flatten: true }) and clearHeadIndicators(o) to
 * clearIndicators({ ...o, flatten: true }). Both target the group's head glyph,
 * baking onto its character-level parts (the pre-overlay shape), with
 * semantic-preserving behavior unless { stripSemantic: true } is passed.
 *
 * Covers:
 * - Application onto multi-glyph and single-glyph groups (head = first glyph).
 * - Semantic indicator preservation; opt-in stripSemantic on apply and clear.
 * - Chaining (apply and clear both return the group handle).
 * - No-op on non-group handles (level !== 1).
 * - Group-handle stability across the delegated mutation.
 * - DSL equivalence with the `;;` word-level indicator marker (apply:
 *   `word;;B86`; clear: trailing bare `;;`).
 * - Delegation to the flatten variant: byte-identical svgCode and toString to
 *   applyIndicators(c, { flatten: true }) / clearIndicators({ flatten: true }).
 * - Correct handling of a `;;`-authored (overlay) word: clear removes the
 *   overlay (no silent no-op); apply replaces it without doubling (no stale
 *   overlay left alongside the baked indicator).
 *
 * Does NOT cover:
 * - The character-level applyIndicators / clearIndicators APIs and their
 *   semantic-ordering rules, see `ElementHandle.apply-indicators.test.js`
 *   and `ElementHandle.clear-indicators.test.js`. The head-level methods
 *   delegate to these (via the group flatten path) after picking the head glyph.
 * - The word-level overlay (non-flatten) channel and its reversibility, see
 *   `ElementHandle.word-indicators.test.js`.
 * - Parser grammar for `;;` and the head-glyph selection algorithm, see
 *   `BlissParser.double-semicolon.test.js`.
 * - Visual/SVG-output rendering of indicator placement, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js` and
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 */

const partCodes = (builder, groupIdx = 0, glyphIdx = 0) => {
  const json = builder.toJSON();
  const glyph = json.groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

describe('ElementHandle head indicators', () => {
  describe('when applying head indicators to a group', () => {
    it('applies the indicator to the head glyph of a multi-glyph group', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyHeadIndicators('B86');
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('preserves a semantic indicator already on the head glyph', () => {
      // note: B97 is semantic, B81 is verbal; semantic always sorts last
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyHeadIndicators('B81');
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B81', 'B97']);
    });

    it('strips the semantic indicator with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyHeadIndicators('B86', { stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const result = b.group(0).applyHeadIndicators('B86');
      expect(result.level).toBe(1);
    });

    it('is a no-op on non-group handles (level !== 1)', () => {
      const b = new BlissSVGBuilder('B291');
      const glyph = b.group(0).glyph(0);
      const result = glyph.applyHeadIndicators('B86');
      expect(result.level).toBe(2);
      expect(partCodes(b)).toEqual(['B291']);
    });

    it('applies to the only glyph when the group has just one', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).applyHeadIndicators('B86');
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('matches the `;;B86` DSL marker on a multi-glyph word', () => {
      const dsl = new BlissSVGBuilder('B291/B303;;B86');
      const mut = new BlissSVGBuilder('B291/B303');
      mut.group(0).applyHeadIndicators('B86');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches the `;;B81` DSL marker on a base with a semantic indicator', () => {
      const dsl = new BlissSVGBuilder('B291;B97/B303;;B81');
      const mut = new BlissSVGBuilder('B291;B97/B303');
      mut.group(0).applyHeadIndicators('B81');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('keeps the group handle valid after the delegated mutation', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const group = b.group(0);
      group.applyHeadIndicators('B86');
      expect(group.level).toBe(1);
      expect(() => group.glyph(0)).not.toThrow();
    });
  });

  describe('when clearing head indicators from a group', () => {
    it('clears grammatical indicators from the head glyph and preserves semantic', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearHeadIndicators();
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B97']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('clears every indicator (grammatical and semantic) with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearHeadIndicators({ stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86/B303');
      const result = b.group(0).clearHeadIndicators();
      expect(result.level).toBe(1);
    });

    it('is a no-op on non-group handles (level !== 1)', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.group(0).glyph(0);
      const result = glyph.clearHeadIndicators();
      expect(result.level).toBe(2);
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('matches the bare trailing `;;` DSL marker on a base with semantic content', () => {
      // note: bare `;;` clears grammatical indicators only; semantic (B97) is preserved
      const dsl = new BlissSVGBuilder('B291;B86;B97/B303;;');
      const mut = new BlissSVGBuilder('B291;B86;B97/B303');
      mut.group(0).clearHeadIndicators();
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('chained apply then clear with stripSemantic restores the bare base', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyHeadIndicators('B86').clearHeadIndicators({ stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });
  });

  describe('when the group was authored with the ;; word-level overlay', () => {
    // regression: post-R14 these methods delegated to the head glyph's char-level
    // API, which only sees base parts; a ;;-authored indicator lives in the group
    // overlay, so clear silently no-opped and apply left a stale overlay beside
    // the baked indicator. Delegating to the flatten variant clears/replaces both
    // channels. See Task 4, plan 2026-06-14-word-level-indicator-overlay.
    it('clears the overlay rather than silently no-opping', () => {
      const b = new BlissSVGBuilder('B291/B303;;B86');
      b.group(0).clearHeadIndicators();
      expect(b.toString()).toBe('B291/B303');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });

    it('replaces the overlay indicator without doubling on apply', () => {
      const b = new BlissSVGBuilder('B291/B303;;B81');
      b.group(0).applyHeadIndicators('B86');
      expect(b.toString()).toBe('B291;B86/B303');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
    });
  });

  describe('when used as the deprecated alias of the flatten variant', () => {
    it('applyHeadIndicators matches applyIndicators with { flatten: true }', () => {
      const alias = new BlissSVGBuilder('B291/B303;;B81');
      alias.group(0).applyHeadIndicators('B86');
      const flat = new BlissSVGBuilder('B291/B303;;B81');
      flat.group(0).applyIndicators('B86', { flatten: true });
      expect(alias.toString()).toBe(flat.toString());
      expect(alias.svgCode).toBe(flat.svgCode);
    });

    it('clearHeadIndicators matches clearIndicators with { flatten: true }', () => {
      const alias = new BlissSVGBuilder('B291/B303;;B86');
      alias.group(0).clearHeadIndicators();
      const flat = new BlissSVGBuilder('B291/B303;;B86');
      flat.group(0).clearIndicators({ flatten: true });
      expect(alias.toString()).toBe(flat.toString());
      expect(alias.svgCode).toBe(flat.svgCode);
    });
  });
});
