import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins ElementHandle.applyIndicators on a glyph handle: the call removes
 * existing grammatical indicator parts, appends the parsed input as
 * indicator parts, preserves the existing semantic indicator unless the new
 * input is itself semantic, orders the semantic relative to the new
 * grammatical indicator by the new indicator's class (nominal / verbal /
 * adjectival), filters non-indicator codes silently, and clears glyph
 * identity once the part list no longer matches a known glyph.
 *
 * Covers:
 * - Basic application: single and multi-indicator inputs, replacement of
 *   existing indicator parts, silent filtering of non-indicator codes,
 *   preservation of multiple base parts, return-this for chaining, glyph
 *   identity clearance after part-list mutation.
 * - Semantic preservation: B97 (concrete) and B6436 (abstract) survive a
 *   non-semantic indicator application, ordered by the new indicator's
 *   class (nominal first, verbal last, adjectival last); a semantic input
 *   replaces an existing semantic; the compound B98 carries semantic
 *   identity and replaces an existing B97; { stripSemantic: true }
 *   suppresses preservation.
 * - Invalid handle or input: missing/empty codes throw; non-indicator-only
 *   inputs no-op (semantic preserved); apply on an all-indicator glyph or
 *   on a glyph with indicator parts preceding base parts is a no-op; apply
 *   on a part handle is a no-op that still returns the handle.
 * - Chaining: applyIndicators followed by applyIndicators replaces;
 *   clearIndicators({stripSemantic:true}).applyIndicators(...) yields a
 *   single new indicator over the bare base.
 * - Handle resilience: a second handle to the same glyph survives mutation
 *   by the first.
 * - DSL/API parity: mutation-built composition matches DSL-built
 *   composition byte-for-byte across simple, semantic, compound, and
 *   nominal/adjectival ordering inputs.
 *
 * Does NOT cover:
 * - clearIndicators on its own surface, see
 *   `ElementHandle.clear-indicators.test.js`.
 * - The word-level overlay API: applyIndicators / clearIndicators on a GROUP
 *   handle now set `group.wordIndicators` rather than no-opping, see
 *   `ElementHandle.word-indicators.test.js`.
 * - isIndicator detection at part level, see
 *   `ElementHandle.indicator-api.test.js`.
 * - Indicator-utility primitives (getBareCode, getSemanticRoot,
 *   buildWithSemantic, etc.), see `tests/indicator-utils.*.test.js`.
 * - Visual regression of mutation-built vs DSL-built SVG output beyond the
 *   `svgCode` byte-for-byte parity tests, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

// Helper: extract part codeNames from first glyph
function partCodes(builder, groupIdx = 0, glyphIdx = 0) {
  const json = builder.toJSON();
  const glyph = json.groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
}

describe('ElementHandle apply indicators', () => {
  describe('when applying indicators to a glyph handle', () => {
    it('applies a single indicator to a bare glyph', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B86');
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('applies multiple semicolon-separated indicators in order', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B81;B86');
      expect(partCodes(b)).toEqual(['B291', 'B81', 'B86']);
    });

    it('replaces the existing grammatical indicator when no semantic is present', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.group(0).glyph(0).applyIndicators('B81');
      // B86 removed, B81 added. No semantic preservation since neither has semanticIndicator.
      expect(partCodes(b)).toEqual(['B291', 'B81']);
    });

    it('silently filters non-indicator codes from the input', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('H;B86');
      // H is not an indicator, silently dropped
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('preserves multiple base parts when replacing indicators', () => {
      const b = new BlissSVGBuilder('B291;B303;B86');
      b.group(0).glyph(0).applyIndicators('B81');
      // Both base parts preserved, only indicator replaced
      expect(partCodes(b)).toEqual(['B291', 'B303', 'B81']);
    });

    it('returns the glyph handle for chaining', () => {
      const b = new BlissSVGBuilder('B291');
      const result = b.group(0).glyph(0).applyIndicators('B86');
      expect(result.level).toBe(2);
    });

    it('clears glyph identity once indicators are added', () => {
      const b = new BlissSVGBuilder('B291');
      expect(b.toJSON().groups[0].glyphs[0].isBlissGlyph).toBe(true);
      b.group(0).glyph(0).applyIndicators('B86');
      // Should no longer be identified as a bare glyph
      expect(b.toJSON().groups[0].glyphs[0].isBlissGlyph).toBeUndefined();
    });
  });

  describe('when applying indicators with semantic preservation', () => {
    it('preserves a concrete semantic (B97) when applying a non-semantic adjectival indicator', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B86');
      // B97 preserved, B86 goes first (adjectival = semantic last)
      expect(partCodes(b)).toEqual(['B291', 'B86', 'B97']);
    });

    it('replaces the existing concrete semantic when the new indicator is itself semantic', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B6436');
      // B6436 replaces B97 (both semantic)
      expect(partCodes(b)).toEqual(['B291', 'B6436']);
    });

    it('strips the existing semantic when called with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B86', { stripSemantic: true });
      // B97 NOT preserved
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('puts the preserved concrete semantic last when the new indicator is verbal', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B81');
      // B81 is verbal, semantic goes last
      expect(partCodes(b)).toEqual(['B291', 'B81', 'B97']);
    });

    it('puts the preserved concrete semantic first when the new indicator is nominal', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B99');
      // B99 is nominal, semantic goes first
      expect(partCodes(b)).toEqual(['B291', 'B97', 'B99']);
    });

    it('replaces an existing concrete semantic when applying a compound semantic indicator (B98)', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('B98');
      // B98 has semanticIndicator:'thing', so it replaces B97 (not preserved)
      expect(partCodes(b)).toEqual(['B291', 'B98']);
    });

    it('applies a compound semantic indicator (B98) to a bare glyph', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B98');
      expect(partCodes(b)).toEqual(['B291', 'B98']);
    });

    it('preserves an abstract semantic (B6436) when applying a non-semantic adjectival indicator', () => {
      const b = new BlissSVGBuilder('B291;B6436');
      b.group(0).glyph(0).applyIndicators('B86');
      // B6436 preserved, B86 is adjectival so semantic goes last
      expect(partCodes(b)).toEqual(['B291', 'B86', 'B6436']);
    });

    it('puts the preserved abstract semantic first when the new indicator is nominal', () => {
      const b = new BlissSVGBuilder('B291;B6436');
      b.group(0).glyph(0).applyIndicators('B99');
      // B99 is nominal, semantic goes first
      expect(partCodes(b)).toEqual(['B291', 'B6436', 'B99']);
    });

    it('puts the preserved abstract semantic last when the new indicator is verbal', () => {
      const b = new BlissSVGBuilder('B291;B6436');
      b.group(0).glyph(0).applyIndicators('B81');
      // B81 is verbal, semantic goes last
      expect(partCodes(b)).toEqual(['B291', 'B81', 'B6436']);
    });
  });

  describe('when applyIndicators is called on an invalid handle or input', () => {
    it('is a no-op on a part-level handle and returns the handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      const result = part.applyIndicators('B81');
      expect(result.level).toBe(3);
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('throws when the codes argument is missing', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).applyIndicators()).toThrow();
    });

    it('throws when the codes argument is the empty string', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).applyIndicators('')).toThrow();
    });

    it('strips existing grammatical indicators but preserves the semantic when all input codes are non-indicators', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('H');
      // H filtered out, but semantic preserved, existing non-semantic indicators removed
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });

    it('is a no-op on an all-indicator glyph (no base parts to attach to)', () => {
      const b = new BlissSVGBuilder('B86');
      b.group(0).glyph(0).applyIndicators('B81');
      // B86 is the only part and is an indicator; baseParts is empty, so no-op
      expect(partCodes(b)).toEqual(['B86']);
    });

    it('is a no-op when an indicator part precedes the base parts (B86;B291)', () => {
      const b = new BlissSVGBuilder('B86;B291');
      b.group(0).glyph(0).applyIndicators('B81');
      // firstIndicatorIndex is 0, so baseParts is empty, no-op
      expect(partCodes(b)).toEqual(['B86', 'B291']);
    });

    it('is a no-op when a non-indicator part follows an indicator part (invalid pattern)', () => {
      const b = new BlissSVGBuilder('B291;B86;B303');
      b.group(0).glyph(0).applyIndicators('B81');
      // B303 (non-indicator) after B86 (indicator) violates the valid pattern rule
      expect(partCodes(b)).toEqual(['B291', 'B86', 'B303']);
    });

    // Deferred (burndown D4, folds into R14): these silent no-ops should surface
    // a warning so a caller knows the call did nothing. Needs a mutation-time
    // warning channel (the mutation API has none today; #warnings resets on each
    // rebuild). Spec: .claude/backlog/applyindicators-warn-on-noop.md; gated as an
    // R14 acceptance criterion (findings doc N8).
    it.todo('warns when applyIndicators is called out of scope instead of silently no-opping');
  });

  describe('when applyIndicators is chained', () => {
    it('replaces the first application when chained with itself', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B86').applyIndicators('B81');
      // Second call replaces B86 with B81
      expect(partCodes(b)).toEqual(['B291', 'B81']);
    });

    it('applies a fresh indicator after a stripping clearIndicators', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true }).applyIndicators('B81');
      // Clear strips all, then apply adds B81
      expect(partCodes(b)).toEqual(['B291', 'B81']);
    });
  });

  describe('when multiple handles reference the same glyph', () => {
    it('a second handle survives mutation by the first', () => {
      const b = new BlissSVGBuilder('B291');
      const glyph1 = b.group(0).glyph(0);
      const glyph2 = b.group(0).glyph(0);
      glyph1.applyIndicators('B86');
      // glyph2 points to the same node, which is still in the tree
      glyph2.applyIndicators('B81');
      expect(glyph2.codeName).toBe('');
    });
  });

  describe('when comparing mutation-built output to DSL-built output', () => {
    it('matches DSL-built output for a simple indicator application', () => {
      const dsl = new BlissSVGBuilder('B291;B86');
      const mut = new BlissSVGBuilder('B291');
      mut.group(0).glyph(0).applyIndicators('B86');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches DSL-built output for a verbal indicator over a concrete semantic', () => {
      const dsl = new BlissSVGBuilder('B291;B81;B97');
      const mut = new BlissSVGBuilder('B291;B97');
      mut.group(0).glyph(0).applyIndicators('B81');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches DSL-built output for a compound semantic indicator (B98)', () => {
      const dsl = new BlissSVGBuilder('B291;B98');
      const mut = new BlissSVGBuilder('B291');
      mut.group(0).glyph(0).applyIndicators('B98');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches DSL-built output for an adjectival indicator over an abstract semantic', () => {
      const dsl = new BlissSVGBuilder('B291;B86;B6436');
      const mut = new BlissSVGBuilder('B291;B6436');
      mut.group(0).glyph(0).applyIndicators('B86');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });

    it('matches DSL-built output for a nominal indicator over a concrete semantic (semantic first)', () => {
      const dsl = new BlissSVGBuilder('B291;B97;B99');
      const mut = new BlissSVGBuilder('B291;B97');
      mut.group(0).glyph(0).applyIndicators('B99');
      expect(mut.svgCode).toBe(dsl.svgCode);
    });
  });
});
