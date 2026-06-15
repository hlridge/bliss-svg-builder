import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `flattenIndicators` serialization opt-out: `toString`/`toJSON`
 * collapse a word-level indicator overlay (the DSL `;;` form) down onto the
 * head glyph as character-level `;`, reproducing the pre-R14 "primitive"
 * bytes. Default output keeps `;;` (covered elsewhere); this is the escape
 * hatch back to the flattened form.
 *
 * `flattenIndicators` and `preserve` are orthogonal: `preserve` governs LOCAL
 * names (aliases/custom glyphs), `flattenIndicators` governs the WORD
 * structure (`;;`). They compose freely.
 *
 * Covers:
 * - toString flatten of a word-additive, a strip-semantic, and a multi-code
 *   overlay, byte-identical to the equivalent explicitly-baked input.
 * - toJSON flatten: the indicator is baked onto the head parts and the
 *   `group.wordIndicators` field is omitted.
 * - Default (flag off) keeps `;;` and the overlay field.
 * - Orthogonality with `preserve`: name kept vs decomposed, independent of
 *   whether `;;` is flattened.
 *
 * Does NOT cover:
 * - The default keep-`;;` round-trip families, see
 *   `BlissSVGBuilder.indicator-round-trip.test.js`.
 * - The parser store shape, see `BlissParser.double-semicolon.test.js`.
 * - The mutation-API `applyIndicators({ flatten })` (group-level), see
 *   `ElementHandle.apply-indicators.test.js` / the head-indicators tests.
 */
describe('BlissSVGBuilder flattenIndicators', () => {
  describe('when flattenIndicators collapses ;; onto the head', () => {
    it.each([
      ['word-additive', 'B313/B1103;;B81', 'B313;B81/B1103'],
      ['strip-semantic', 'B303;B97;;!B86', 'B303;B86'],
      ['multi-code', 'B291/B291;;B86;B97', 'B291;B86;B97/B291'],
    ])('toString flattens %s to the baked form', (_label, input, baked) => {
      expect(new BlissSVGBuilder(input).toString({ flattenIndicators: true })).toBe(baked);
    });

    it('matches the toString of the equivalent explicitly-baked input', () => {
      const flattened = new BlissSVGBuilder('B313/B1103;;B81').toString({ flattenIndicators: true });
      expect(flattened).toBe(new BlissSVGBuilder('B313;B81/B1103').toString());
    });

    it('toJSON bakes onto the head parts and omits the wordIndicators field', () => {
      const json = new BlissSVGBuilder('B313/B1103;;B81').toJSON({ flattenIndicators: true });
      expect(json.groups[0].wordIndicators).toBeUndefined();
      expect(json.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B313', 'B81']);
    });

    it('renders identically with and without flattening (output-only change)', () => {
      const builder = new BlissSVGBuilder('B313/B1103;;B81');
      const reFlattened = new BlissSVGBuilder(builder.toString({ flattenIndicators: true }));
      expect(reFlattened.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when flattenIndicators is off (default)', () => {
    it('keeps ;; in toString', () => {
      expect(new BlissSVGBuilder('B313/B1103;;B81').toString()).toBe('B313/B1103;;B81');
    });

    it('carries the wordIndicators field in toJSON', () => {
      expect(new BlissSVGBuilder('B313/B1103;;B81').toJSON().groups[0].wordIndicators)
        .toEqual({ codes: ['B81'], stripSemantic: false });
    });
  });

  describe('when flattenIndicators composes with preserve (orthogonality)', () => {
    const DEFS = { _LOVE: { type: 'glyph', codeString: 'B291;B97' } };
    beforeAll(() => BlissSVGBuilder.define(DEFS));
    afterAll(() => Object.keys(DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('preserve alone keeps the name and ;;', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ preserve: true })).toBe('_LOVE;;B81');
    });

    it('flattenIndicators alone decomposes the name and flattens ;;', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ flattenIndicators: true })).toBe('B291;B81;B97');
    });

    it('preserve + flattenIndicators keeps the name but flattens ;;', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ preserve: true, flattenIndicators: true }))
        .toBe('_LOVE;B81');
    });
  });
});
