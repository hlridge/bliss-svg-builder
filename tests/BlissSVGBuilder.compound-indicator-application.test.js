import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins compound-indicator indicator-application parity (R15 Task 3b-5): applying
 * an indicator to a word whose resolved head is a baseless compound indicator
 * stacks the indicator, so the word renders identically to the same indicators
 * written as standalone B-codes. Strip-semantic (`;!`) has no base semantic
 * indicator to strip on such a head, so it still stacks but emits a
 * STRIP_SEMANTIC_NOOP warning.
 *
 * The fix is position-independent base/indicator extraction in the word-head
 * merge (getBaseCode/getIndicatorParts): the base is the non-indicator parts,
 * the strippable indicators are the indicator parts, and an all-indicator head
 * is atomic (nothing strippable). The old "segment 0 is the base" assumption
 * doubled, reordered, or dropped the baked indicators of an all-indicator head.
 *
 * Covers:
 * - Word alias with a flagged compound-indicator head (COMBO_IND/B291): an
 *   applied indicator stacks (render == standalone), an empty strip keeps it.
 * - Word alias with an unflagged all-indicator head (BARE_AI/B291): an applied
 *   indicator stacks without reordering the baked indicators.
 * - Strip-semantic at a compound-indicator word head: no drop + a
 *   STRIP_SEMANTIC_NOOP warning, for both flagged and unflagged heads.
 * - A plain (no `!`) applied indicator emits no strip-semantic warning.
 * - Guard: no definable indicator-first base reaches the single-glyph
 *   replace path (define rejects an indicator-baking glyph; a flagged compound
 *   indicator stacks rather than char-replaces).
 *
 * Does NOT cover:
 * - The single-glyph strip-semantic no-op warning on a baseless compound-indicator
 *   glyph (COMBO_IND;!B81), see `BlissSVGBuilder.custom-glyphs.test.js`
 *   (describe 'when applying a strip-semantic indicator to a baseless
 *   compound-indicator glyph').
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
  BlissSVGBuilder.define({ NORMAL_WORD: { codeString: 'B291/B431' } });
  customCodes.push('COMBO_IND', 'WORD_CI', 'BARE_AI', 'WORD_BARE', 'NORMAL_WORD');
});

afterAll(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

const stripSemanticNoops = (input) =>
  new BlissSVGBuilder(input).warnings.filter(w => w.code === 'STRIP_SEMANTIC_NOOP');

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
    it('stacks without dropping the baked indicator and warns the strip is a no-op', () => {
      const word = new BlissSVGBuilder('WORD_BARE;!B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(stripSemanticNoops('WORD_BARE;!B81')).toHaveLength(1);
    });

    it('warns for a flagged compound-indicator head as well', () => {
      const word = new BlissSVGBuilder('WORD_CI;!B81');
      expect(word.toString()).toBe('B86;B97;B81/B291');
      expect(stripSemanticNoops('WORD_CI;!B81')).toHaveLength(1);
    });

    it('warns on an empty strip-semantic (no applied indicator) too', () => {
      const word = new BlissSVGBuilder('WORD_CI;!');
      expect(word.toString()).toBe('B86;B97/B291');
      expect(stripSemanticNoops('WORD_CI;!')).toHaveLength(1);
    });
  });

  describe('when a plain indicator is applied to a compound-indicator word head', () => {
    it('emits no strip-semantic no-op warning', () => {
      expect(stripSemanticNoops('WORD_CI;B81')).toEqual([]);
    });
  });

  describe('when strip-semantic is applied to a non-compound-indicator base', () => {
    it('emits no strip-semantic no-op warning for a single base glyph', () => {
      expect(stripSemanticNoops('B291;!B86')).toEqual([]);
    });

    it('emits no strip-semantic no-op warning for a normal-headed word', () => {
      expect(stripSemanticNoops('NORMAL_WORD;!B86')).toEqual([]);
    });

    it('emits no strip-semantic no-op warning for a normal-headed empty strip', () => {
      expect(stripSemanticNoops('NORMAL_WORD;!')).toEqual([]);
    });
  });

  describe('when strip-semantic is applied to a single all-indicator bare alias', () => {
    it('routes through promotion and emits no strip-semantic no-op warning', () => {
      // A bare alias (not a flagged glyph) promotes the applied indicator into a
      // ;; overlay rather than stacking on this path, so the single-glyph
      // strip-semantic warning (gated by the isIndicator flag) does not fire.
      expect(stripSemanticNoops('BARE_AI;!B81')).toEqual([]);
    });
  });

  describe('when an indicator-first base could reach the single-glyph replace path', () => {
    it('rejects a glyph definition that bakes an indicator-first codeString', () => {
      // guard for the bliss-parser.js single-glyph replace/strip path
      // (the `.slice(1)` "segment 0 is the base" sites): D-S1a makes such a
      // base undefinable, so the path is unreachable. If this guard is removed,
      // the indicator-first base would slip through and the slice would mishandle it.
      const result = BlissSVGBuilder.define({ IND_FIRST_GLYPH: { type: 'glyph', codeString: 'B86;B291' } });
      expect(result.errors).toHaveLength(1);
    });

    it('stacks rather than char-replaces an indicator on a flagged compound indicator', () => {
      // toString proves stacking (B86;B97;B81), not char-replace (which would
      // drop the baked B97 -> B86;B81).
      const single = new BlissSVGBuilder('COMBO_IND;B81');
      expect(single.toString()).toBe('B86;B97;B81');
      expect(single.warnings.filter(w => w.code === 'STRIP_SEMANTIC_NOOP')).toEqual([]);
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
  });
});
