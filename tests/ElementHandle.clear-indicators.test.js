import { describe, it, expect, afterEach } from 'vitest';
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
 * - Relocated base offset round-trips: clearing an indicator from a
 *   relocated base (built-in or custom) keeps its :x,y in toString, so the
 *   round-trip is lossless (R15 Task 3; the offset was previously dropped
 *   from toString while still driving the render).
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
  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch {}
    }
    customCodes.length = 0;
  });

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
      // pins the zero-offset boundary of the relocation re-emit (R15 Task 3):
      // a restored built-in with no offset stays bare, never B291:0,0.
      expect(b.toString()).toBe('B291');
    });

    it('matches DSL-built output for the equivalent bare glyph', () => {
      const dsl = new BlissSVGBuilder('B291');
      const mut = new BlissSVGBuilder('B291;B86');
      mut.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(mut.svgCode).toBe(dsl.svgCode);
    });
  });

  describe('when the cleared glyph has a relocated base', () => {
    // Clearing the indicator reduces the glyph to a single base part, which
    // re-stamps its built-in identity (codeName='B291'). serializeGlyph must
    // still consult the part's x/y and re-emit :x,y so the relocation offset
    // round-trips through toString instead of collapsing to the bare code.
    // The offset always drove the render; before R15 Task 3 it was lost from
    // toString only (round-trip lossy). Surfaced by the R14 Task 4 review.
    it('re-emits the base offset in toString so the round-trip is lossless', () => {
      const b = new BlissSVGBuilder('B291:2,3;B86/B303');
      b.group(0).glyph(0).clearIndicators();
      expect(b.toString()).toBe('B291:2,3/B303');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
      expect(b.toJSON().groups[0].glyphs[0].parts[0]).toMatchObject({ x: 2, y: 3 });
    });

    it('round-trips a custom relocated base through decomposition', () => {
      // A custom base never re-stamps a built-in identity, so it serializes
      // via the decompose path (already offset-correct) rather than the
      // identityful-built-in fall-through. Pins the contract for both paths.
      customCodes.push('RELO_COMP');
      BlissSVGBuilder.define({ RELO_COMP: { codeString: 'H;E:10,0' } });
      const b = new BlissSVGBuilder('RELO_COMP:2,3;B86/B303');
      b.group(0).glyph(0).clearIndicators();
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
      expect(b.toJSON().groups[0].glyphs[0].parts[0]).toMatchObject({ x: 2, y: 3 });
    });

    it('re-emits a single-axis base offset where one coordinate is zero', () => {
      // pins the OR in the offset guard (x !== 0 || y !== 0): a single-axis
      // offset must still emit when the other axis is 0. Kills the ||->&& mutant
      // on the relocation re-emit (which would drop the offset for x=0 or y=0).
      const b = new BlissSVGBuilder('B291:0,3;B86/B303');
      b.group(0).glyph(0).clearIndicators();
      expect(b.toString()).toBe('B291:0,3/B303');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });
});
