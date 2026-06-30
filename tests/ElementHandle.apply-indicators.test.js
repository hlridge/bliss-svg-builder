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
 *   inputs no-op (semantic preserved); apply on a part handle is a no-op that
 *   still returns the handle; apply on a space glyph no-ops.
 * - Atypical/empty base (R15 Task 5): the first part is always the base (i>0
 *   rule), so apply onto a lone indicator, an indicator-led glyph, or a
 *   detach-emptied glyph attaches the indicator (matching addPart).
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
 * - The full NOOP_INDICATOR_MUTATION warning matrix across apply / clear /
 *   flatten no-op cases, see `ElementHandle.indicator-noop-warning.test.js`.
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
      // isBlissGlyph is live identity (read from the handle); toJSON omits it
      const b = new BlissSVGBuilder('B291');
      expect(b.group(0).glyph(0).isBlissGlyph).toBe(true);
      b.group(0).glyph(0).applyIndicators('B86');
      // Should no longer be identified as a bare glyph
      expect(b.group(0).glyph(0).isBlissGlyph).toBe(false);
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

    // Review #4 (A1-F1): a compound semantic BASE (B98) is currently decomposed to
    // its B97 root during preservation (B291;B98 + applyIndicators('B81') ->
    // [B291,B81,B97], not atomic [B291,B81,B98]). Whether that is correct, or a
    // compound should stay atomic per the compound-indicator-atomic-unit decision,
    // is an open design question; pin it once decided. Tracked in backlog.md.
    it.todo('pins whether a compound semantic base (B98) stays atomic or decomposes to B97 during preservation');
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

    it('attaches onto a lone-indicator glyph, treating the first part as the base', () => {
      const b = new BlissSVGBuilder('B86');
      b.group(0).glyph(0).applyIndicators('B81');
      // R15 Task 5: index 0 is always the base (i>0 rule), so a lone indicator
      // carries a further indicator rather than no-opping.
      expect(partCodes(b)).toEqual(['B86', 'B81']);
    });

    it('treats the first part as the base even when it is an indicator (B86;B291)', () => {
      const b = new BlissSVGBuilder('B86;B291');
      b.group(0).glyph(0).applyIndicators('B81');
      // R15 Task 5: index 0 is the base under the i>0 rule, so B81 appends.
      expect(partCodes(b)).toEqual(['B86', 'B291', 'B81']);
    });

    it('is a no-op when a non-indicator part follows an indicator part (invalid pattern)', () => {
      const b = new BlissSVGBuilder('B291;B86;B303');
      b.group(0).glyph(0).applyIndicators('B81');
      // B303 (non-indicator) after B86 (indicator) violates the valid pattern rule
      expect(partCodes(b)).toEqual(['B291', 'B86', 'B303']);
    });

    // regression: burndown D4 (folds into R14). The surviving no-ops (an invalid
    // part pattern; a space glyph; an unrecognized code) still surface an
    // NOOP_INDICATOR_MUTATION warning on the persistent mutation channel so a
    // caller knows the call did nothing. The full warning matrix lives in
    // ElementHandle.indicator-noop-warning.test.js; this pins the named gate.
    it('warns on a surviving no-op (invalid pattern) instead of silently no-opping', () => {
      const b = new BlissSVGBuilder('B291;B86;B303');
      b.group(0).glyph(0).applyIndicators('B81');
      const noop = b.warnings.filter(w => w.code === 'NOOP_INDICATOR_MUTATION');
      expect(noop).toHaveLength(1);
    });
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

  describe('when applying indicators to an atypical or empty base', () => {
    it('attaches onto an empty glyph, matching addPart', () => {
      // regression (R15 Task 5): a glyph emptied by detaching all its parts
      // accepts an indicator via applyIndicators, the same as addPart already does.
      const viaApply = new BlissSVGBuilder('B291;B86');
      viaApply.group(0).glyph(0).part(1).detach();
      viaApply.group(0).glyph(0).part(0).detach();
      viaApply.group(0).glyph(0).applyIndicators('B86');
      expect(partCodes(viaApply)).toEqual(['B86']);

      const viaAdd = new BlissSVGBuilder('B291;B86');
      viaAdd.group(0).glyph(0).part(1).detach();
      viaAdd.group(0).glyph(0).part(0).detach();
      viaAdd.group(0).glyph(0).addPart('B86');
      expect(partCodes(viaApply)).toEqual(partCodes(viaAdd));
    });

    it('does not attach an indicator to a space glyph', () => {
      const b = new BlissSVGBuilder('B291//B291');
      b.element(1).glyph(0).applyIndicators('B86');
      // the space part is untouched; no indicator is appended
      expect(b.element(1).glyph(0).part(1)).toBeNull();
      expect(b.element(1).glyph(0).part(0).codeName).toBe('TSP');
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
