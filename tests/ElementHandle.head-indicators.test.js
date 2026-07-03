import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the flatten (head-baking) variant of the group-level indicator API:
 * applyIndicators(code, { flatten: true }) and clearIndicators({ flatten: true })
 * on a group handle bake onto the group's head glyph as character-level parts
 * (the pre-overlay shape) instead of setting the reversible `;;` overlay. Head is
 * the group's head glyph (the first glyph in every word used here). Semantic
 * indicators are preserved unless the APPLY carries { stripSemantic: true }
 * (rc.4: clear is the pure undo and ignores stripSemantic; the flatten
 * strip-everything spelling is
 * `applyIndicators('', { flatten: true, stripSemantic: true })`).
 *
 * (These paths were formerly reached through the applyHeadIndicators /
 * clearHeadIndicators aliases, removed in rc.4; see
 * `ElementHandle.head-indicator-removal.test.js`.)
 *
 * Covers:
 * - Baking onto multi-glyph and single-glyph groups (head = first glyph).
 * - Semantic indicator preservation and ordering; opt-in stripSemantic on the
 *   flatten apply (including the empty flatten apply); the flatten clear
 *   ignores the removed stripSemantic option.
 * - Chaining (apply and clear both return the group handle) and handle stability
 *   across the mutation.
 * - Render/serialize parity with the `;;` word-level indicator marker (apply:
 *   `word;;B86`; clear: trailing bare `;;`), which resolves the same indicators
 *   onto the head at render.
 * - Correct handling of a `;;`-authored (overlay) word: the flatten clear removes
 *   the overlay (no silent no-op); the flatten apply replaces it without doubling
 *   (no stale overlay left beside the baked indicator).
 *
 * Does NOT cover:
 * - The character-level applyIndicators / clearIndicators on a glyph handle and
 *   their semantic-ordering rules, see `ElementHandle.apply-indicators.test.js`
 *   and `ElementHandle.clear-indicators.test.js`. The flatten path bakes via
 *   these after picking the head glyph.
 * - The word-level overlay (non-flatten) channel and its reversibility, see
 *   `ElementHandle.word-indicators.test.js`.
 * - Parser grammar for `;;` and the head-glyph selection algorithm, see
 *   `BlissParser.double-semicolon.test.js`.
 * - Visual/SVG-output rendering of indicator placement, see the visual
 *   regression suite and `BlissSVGBuilder.multiple-indicators.test.js`.
 */

const partCodes = (builder, groupIdx = 0, glyphIdx = 0) => {
  const json = builder.toJSON();
  const glyph = json.groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

describe('ElementHandle head indicators', () => {
  describe('when baking indicators onto the head of a group', () => {
    it('bakes the indicator onto the head glyph of a multi-glyph group', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('preserves a semantic indicator already on the head glyph', () => {
      // note: B97 is semantic, B81 is verbal; semantic always sorts last
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyIndicators('B81', { flatten: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B81', 'B97']);
    });

    it('strips the semantic indicator with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B97/B303');
      b.group(0).applyIndicators('B86', { flatten: true, stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const result = b.group(0).applyIndicators('B86', { flatten: true });
      expect(result.level).toBe(1);
    });

    it('bakes onto the only glyph when the group has just one', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('matches the `;;B86` DSL marker on a multi-glyph word', () => {
      const dsl = new BlissSVGBuilder('B291/B303;;B86');
      const mut = new BlissSVGBuilder('B291/B303');
      mut.group(0).applyIndicators('B86', { flatten: true });
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches the `;;B81` DSL marker on a base with a semantic indicator', () => {
      const dsl = new BlissSVGBuilder('B291;B97/B303;;B81');
      const mut = new BlissSVGBuilder('B291;B97/B303');
      mut.group(0).applyIndicators('B81', { flatten: true });
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('keeps the group handle valid after the mutation', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const group = b.group(0);
      group.applyIndicators('B86', { flatten: true });
      expect(group.level).toBe(1);
      expect(() => group.glyph(0)).not.toThrow();
    });
  });

  describe('when clearing head indicators from a group by baking', () => {
    it('clears grammatical indicators from the head glyph and preserves semantic', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearIndicators({ flatten: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B97']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });

    it('ignores the removed stripSemantic option on a flatten clear (semantic survives)', () => {
      // rc.4 retarget: clear is the pure undo; stripSemantic lives on apply only.
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).clearIndicators({ flatten: true, stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B97']);
    });

    it('clears every indicator (grammatical and semantic) via the empty flatten apply with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B86;B97/B303');
      b.group(0).applyIndicators('', { flatten: true, stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86/B303');
      const result = b.group(0).clearIndicators({ flatten: true });
      expect(result.level).toBe(1);
    });

    it('matches the bare trailing `;;` DSL marker on a base with semantic content', () => {
      // note: bare `;;` clears grammatical indicators only; semantic (B97) is preserved
      const dsl = new BlissSVGBuilder('B291;B86;B97/B303;;');
      const mut = new BlissSVGBuilder('B291;B86;B97/B303');
      mut.group(0).clearIndicators({ flatten: true });
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('chained apply then clear restores the bare base (legacy stripSemantic ignored)', () => {
      const b = new BlissSVGBuilder('B291/B303');
      b.group(0).applyIndicators('B86', { flatten: true }).clearIndicators({ flatten: true, stripSemantic: true });
      expect(partCodes(b, 0, 0)).toEqual(['B291']);
      expect(partCodes(b, 0, 1)).toEqual(['B303']);
    });
  });

  describe('when the group was authored with the ;; word-level overlay', () => {
    // regression: a ;;-authored indicator lives in the group overlay, not the
    // head glyph's base parts. A naive char-level clear/apply on the head would
    // only see the base parts, so clear would silently no-op and apply would
    // leave a stale overlay beside the baked indicator. The flatten path
    // clears/replaces both channels. See Task 4, plan 2026-06-14-word-level-indicator-overlay.
    it('clears the overlay rather than silently no-opping', () => {
      const b = new BlissSVGBuilder('B291/B303;;B86');
      b.group(0).clearIndicators({ flatten: true });
      expect(b.toString()).toBe('B291/B303');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });

    it('replaces the overlay indicator without doubling on apply', () => {
      const b = new BlissSVGBuilder('B291/B303;;B81');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(b.toString()).toBe('B291;B86/B303');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(partCodes(b, 0, 0)).toEqual(['B291', 'B86']);
    });
  });
});
