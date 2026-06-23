import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins compound-indicator application parity (R15 Task 3b-5): a compound
 * indicator - a `type:'glyph'` definition flagged `isIndicator`, or a built-in
 * like B98 - is an ATOMIC indicator unit. Applying an indicator at the use site,
 * or carrying it as a word head, decomposes/stacks consistently so the result
 * renders identically to the same indicators written as standalone B-codes: no
 * doubling, reordering, or dropping. Strip-semantic (`;!`) has no base semantic
 * indicator to strip on such a unit, so it follows the general rule SILENTLY
 * (stacks like `;`; no special warning).
 *
 * Covers:
 * - Word alias with a flagged compound-indicator head (COMBO_IND/B291): an
 *   applied indicator stacks (render == standalone); an empty strip keeps it.
 * - Word alias with an unflagged all-indicator head (BARE_AI/B291): stacks
 *   without reordering the baked indicators.
 * - Strip-semantic at a compound-indicator word head: stacks silently, no drop.
 * - Single baseless compound indicator (COMBO_IND;B81) renders == standalone,
 *   including a baked sub-part offset (the x===undefined element-layer guard).
 * - The .every all-indicator gate: a MIXED (base+indicator) composite is NOT
 *   laid out as a baseless stack.
 * - Guard: no definable indicator-first base reaches the single-glyph replace
 *   path, and no built-in carries an indicator-first all-indicator codeString.
 *
 * Does NOT cover:
 * - Single-glyph strip-semantic silence on a baseless compound-indicator glyph,
 *   see `BlissSVGBuilder.custom-glyphs.test.js`.
 * - Promotion of a single all-indicator bare alias to a `;;` overlay (3b-1),
 *   see `BlissSVGBuilder.indicator-promotion.test.js`.
 * - The from-origin x layout of a baseless indicator stack, see
 *   `BlissElement.indicator-positioning.test.js`.
 */

const customCodes = [];

beforeAll(() => {
  BlissSVGBuilder.define({ COMBO_IND: { type: 'glyph', codeString: 'B86;B97', isIndicator: true } });
  BlissSVGBuilder.define({ WORD_CI: { codeString: 'COMBO_IND/B291' } });
  BlissSVGBuilder.define({ BARE_AI: { codeString: 'B86;B97' } });
  BlissSVGBuilder.define({ WORD_BARE: { codeString: 'BARE_AI/B291' } });
  BlissSVGBuilder.define({ CI_OFFSET: { type: 'glyph', codeString: 'B86;B97:5,0', isIndicator: true } });
  BlissSVGBuilder.define({ MIX_CI: { type: 'glyph', codeString: 'B270;B86', isIndicator: true } });
  customCodes.push('COMBO_IND', 'WORD_CI', 'BARE_AI', 'WORD_BARE', 'CI_OFFSET', 'MIX_CI');
});

afterAll(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

describe('BlissSVGBuilder compound indicator application', () => {

  describe('when an indicator is applied to a word alias with a flagged compound-indicator head', () => {
    it('stacks the indicator, rendering as the indicators written standalone', () => {
      const word = new BlissSVGBuilder('WORD_CI;B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(word.svgCode).toBe(new BlissSVGBuilder('B86;B97;B81/B291').svgCode);
    });

    it('preserves the compound indicator under an empty strip', () => {
      expect(new BlissSVGBuilder('WORD_CI;').toString()).toBe('B86;B97/B291');
    });
  });

  describe('when an indicator is applied to a word alias with an unflagged all-indicator head', () => {
    it('stacks without reordering the baked indicators', () => {
      const word = new BlissSVGBuilder('WORD_BARE;B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(word.svgCode).toBe(new BlissSVGBuilder('B86;B97;B81/B291').svgCode);
    });
  });

  describe('when a strip-semantic indicator is applied to a compound-indicator word head', () => {
    it('stacks without dropping the baked indicator, silently', () => {
      const word = new BlissSVGBuilder('WORD_BARE;!B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(word.warnings).toEqual([]);
    });

    it('stacks the same for a flagged compound-indicator head', () => {
      const word = new BlissSVGBuilder('WORD_CI;!B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(word.warnings).toEqual([]);
    });

    it('keeps the compound indicator on an empty strip-semantic', () => {
      const word = new BlissSVGBuilder('WORD_CI;!');
      expect(word.toString()).toBe('B86;B97/B291');
      expect(word.warnings).toEqual([]);
    });
  });

  describe('when an indicator-first base could reach the single-glyph replace path', () => {
    it('rejects a glyph definition that bakes an indicator-first codeString', () => {
      // guard for the bliss-parser.js single-glyph replace/strip path
      // (the `.slice(1)` "segment 0 is the base" sites): D-S1a makes such a
      // base undefinable, so the path is unreachable.
      const result = BlissSVGBuilder.define({ IND_FIRST_GLYPH: { type: 'glyph', codeString: 'B86;B291' } });
      expect(result.errors).toHaveLength(1);
    });

    it('carries no indicator-first all-indicator codeString among the built-in glyphs', () => {
      // pins the parser's "no built-in reaches the .slice(1) sites" invariant
      // (R15 3b-5): an unflagged built-in GLYPH whose every ;-segment is an
      // indicator would slip an indicator-first base through the single-glyph
      // replace path. Bare aliases are exempt (they route through promotion);
      // flagged compound indicators are atomic, so both are excluded here.
      const isInd = (seg) => blissElementDefinitions[seg.split(':')[0]]?.isIndicator === true;
      const offenders = Object.entries(blissElementDefinitions).filter(([, def]) => {
        if (!def.isBlissGlyph || def.isIndicator || typeof def.codeString !== 'string') return false;
        const segs = def.codeString.split(';');
        return segs.length > 1 && segs.every(isInd);
      });
      expect(offenders).toEqual([]);
    });

    it('stacks rather than char-replaces an indicator on a flagged compound indicator', () => {
      // toString proves stacking (B86;B97;B81), not char-replace (which would
      // drop the baked B97 -> B86;B81).
      const single = new BlissSVGBuilder('COMBO_IND;B81');
      expect(single.toString()).toBe('B86;B97;B81');
    });
  });

  describe('when an indicator is applied to a single baseless compound-indicator glyph', () => {
    it('renders identically to the indicators written as standalone B-codes', () => {
      // The compound indicator's unpositioned sub-parts must lay out as a
      // baseless stack even when nested as a glyph part, so a directly-stacked
      // indicator does not overlap (R15 3b-5 element-layer fix).
      expect(new BlissSVGBuilder('COMBO_IND;B81').svgCode)
        .toBe(new BlissSVGBuilder('B86;B97;B81').svgCode);
    });

    it('renders the strip-semantic form identically too', () => {
      expect(new BlissSVGBuilder('COMBO_IND;!B81').svgCode)
        .toBe(new BlissSVGBuilder('B86;B97;B81').svgCode);
    });

    it('keeps a baked sub-part offset instead of the from-origin stack position', () => {
      // pins the x===undefined element-layer guard (R15 3b-5): CI_OFFSET bakes B97
      // at x=5, so the from-origin baseless-stack layout (which would place it at
      // width+gap=3) must NOT override it. Removing the guard regresses the render
      // to the from-origin form.
      const baked = new BlissSVGBuilder('CI_OFFSET;B81');
      expect(baked.toString()).toBe('B86;B97:5,0;B81');
      expect(baked.svgCode).not.toBe(new BlissSVGBuilder('B86;B97;B81').svgCode);
    });
  });

  describe('when a mixed base-and-indicator composite is used with an applied indicator', () => {
    it('is not laid out as a baseless stack (the all-indicator gate excludes it)', () => {
      // pins the `.every(c => c.isIndicator)` gate (R15 3b-5): MIX_CI = B270;B86
      // has a non-indicator base part (B270), so the baseless-stack layout must
      // NOT run. A `.some` mutant relays the base from origin, widening the glyph
      // (viewBox 6.5 -> 7.5).
      expect(new BlissSVGBuilder('MIX_CI;B81').svgCode)
        .toContain('viewBox="-0.75 -0.75 6.5 21.5"');
    });
  });
});
