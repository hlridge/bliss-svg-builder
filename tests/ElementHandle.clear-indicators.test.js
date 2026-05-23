import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins ElementHandle.clearIndicators on a glyph handle: the call removes
 * grammatical indicator parts from the glyph by default, preserves the
 * semantic indicator (B97 / B6436 / B98) unless { stripSemantic: true } is
 * passed, restores glyph identity once the part list reverts to a known
 * bare-glyph code, and is a no-op when there are no grammatical indicators
 * to remove.
 *
 * Covers:
 * - Default behaviour: grammatical indicator parts removed, semantic
 *   preserved, no-op on a glyph without indicators or with only a semantic
 *   indicator, returns the handle for chaining.
 * - With { stripSemantic: true }: all indicator parts removed including
 *   the semantic; glyph identity restored when the cleared part list
 *   matches a known bare-glyph code; mutation-built output equals the
 *   DSL-built bare glyph byte-for-byte.
 *
 * Does NOT cover:
 * - applyIndicators on its own surface, see
 *   `ElementHandle.apply-indicators.test.js`. The chaining of
 *   clearIndicators followed by applyIndicators is covered there.
 * - isIndicator detection at part level, see
 *   `ElementHandle.indicator-api.test.js`.
 * - Indicator-utility primitives (filterToIndicators, hasSemantic, etc.),
 *   see `tests/indicator-utils.*.test.js`.
 */

// Helper: extract part codeNames from first glyph
function partCodes(builder, groupIdx = 0, glyphIdx = 0) {
  const json = builder.toJSON();
  const glyph = json.groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
}

describe('ElementHandle clear indicators', () => {
  describe('when clearing without stripping the semantic', () => {
    it('removes grammatical indicators and preserves the semantic indicator', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).clearIndicators();
      // B86 removed, B97 (semantic) preserved
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });

    it('is a no-op on a glyph that has no indicators', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).clearIndicators();
      expect(partCodes(b)).toEqual(['B291']);
    });

    it('is a no-op on a glyph whose only indicator is a semantic', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).clearIndicators();
      // B97 (semantic) preserved, nothing else to clear
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });

    it('returns the glyph handle for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const result = b.group(0).glyph(0).clearIndicators();
      expect(result.level).toBe(2);
    });
  });

  describe('when clearing with { stripSemantic: true }', () => {
    it('removes all indicators including the semantic', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(partCodes(b)).toEqual(['B291']);
    });

    it('restores glyph identity once the cleared part list matches a known bare glyph', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(b.toJSON().groups[0].glyphs[0].isBlissGlyph).toBe(true);
      expect(b.toJSON().groups[0].glyphs[0].codeName).toBe('B291');
    });

    it('matches DSL-built output for the equivalent bare glyph', () => {
      const dsl = new BlissSVGBuilder('B291');
      const mut = new BlissSVGBuilder('B291;B86');
      mut.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(mut.svgCode).toBe(dsl.svgCode);
    });
  });
});
