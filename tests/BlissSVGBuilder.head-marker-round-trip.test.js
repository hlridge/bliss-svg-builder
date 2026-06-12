import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins toString()/toJSON() re-emission of resolved head designations
 * under the head-marker contract: exports flatten aliases and re-emit `^`
 * on the designated character exactly when the bare codes would not
 * re-derive the same crown, so parse(toString(x)) always crowns the same
 * glyph.
 *
 * Covers:
 * - `^` emission for a redirect-designated head (`B486/(CD^)` exports as
 *   `B486/B313/B208^`).
 * - `^` emission for a direct marker that deviates from the fallback.
 * - `^` omission when the fallback re-derives the same head (explicit
 *   marker on the fallback pick, and fallback-marked words).
 * - Dropped word-markers never resurface on export.
 * - Crown stability across parse -> toString -> parse for redirect cases.
 * - toJSON preserving isHeadGlyph on the designated glyph.
 * - Per-word emission for multi-word inputs.
 *
 * Does NOT cover:
 * - Resolution semantics themselves (which glyph gets the crown), see
 *   `BlissParser.head-marker-contract.test.js` and
 *   `BlissParser.head-marker-matrix.test.js`.
 * - General toString flattening of aliases, options, and spaces, see
 *   `BlissSVGBuilder.string-output.test.js` and
 *   `BlissSVGBuilder.round-trip.test.js`.
 *
 * @contract: head-marker-contract
 */
describe('BlissSVGBuilder head-marker round-trip', () => {
  const HMR_DEFS = {
    _HMR_CD: { codeString: 'B313/B208' },
    _HMR_CDH: { codeString: 'B313/B208^' },
    _HMR_AH: { codeString: 'B291^/B313' },
  };
  beforeAll(() => BlissSVGBuilder.define(HMR_DEFS));
  afterAll(() => Object.keys(HMR_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const markedIndexes = (parsed, groupIndex = 0) =>
    parsed.groups[groupIndex].glyphs.flatMap((g, i) => (g.isHeadGlyph === true ? [i] : []));

  describe('when the resolved head deviates from what bare codes re-derive', () => {
    it('emits ^ on a redirect-designated character', () => {
      const b = new BlissSVGBuilder('B486/_HMR_CDH');

      expect(b.toString()).toBe('B486/B313/B208^');
    });

    it('emits ^ for a direct marker off the fallback pick', () => {
      const b = new BlissSVGBuilder('B101/B208^/B303');

      expect(b.toString()).toBe('B101/B208^/B303');
    });

    it('re-parses its own output to the same crown', () => {
      const exported = new BlissSVGBuilder('B486/_HMR_CDH').toString();
      const reparsed = BlissParser.parse(exported);

      expect(markedIndexes(reparsed)).toEqual([2]);
    });
  });

  describe('when the fallback re-derives the same head', () => {
    it('omits ^ for an explicit marker on the fallback pick', () => {
      const b = new BlissSVGBuilder('B486/B208^');

      expect(b.toString()).toBe('B486/B208');
    });

    it('omits ^ for a fallback-marked word', () => {
      const b = new BlissSVGBuilder('B486/B208');

      expect(b.toString()).toBe('B486/B208');
    });

    it('omits ^ for a designation the index-0 default re-derives', () => {
      // (A^B) standalone crowns A at index 0; bare B291/B313 re-parses with
      // no marks, and downstream defaults to index 0 — same crown, no ^.
      const b = new BlissSVGBuilder('_HMR_AH');

      expect(b.toString()).toBe('B291/B313');
    });
  });

  describe('when a word-marker was dropped at parse time', () => {
    it('does not resurrect the dropped marker on export', () => {
      const b = new BlissSVGBuilder('_HMR_CD^');

      expect(b.toString()).toBe('B313/B208');
    });
  });

  describe('when the composition is exported as JSON', () => {
    it('preserves isHeadGlyph on the redirect-designated glyph', () => {
      const json = new BlissSVGBuilder('B486/_HMR_CDH').toJSON();

      expect(json.groups[0].glyphs[2].isHeadGlyph).toBe(true);
      expect(json.groups[0].glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
    });
  });

  describe('when the input has multiple words', () => {
    it('emits each word\'s marker independently', () => {
      const b = new BlissSVGBuilder('_HMR_CDH//B101/B208^');

      expect(b.toString()).toBe('B313/B208^//B101/B208^');
    });
  });
});
