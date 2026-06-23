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
 * - Flatten onto the query-time-resolved head for an excluded base (the head
 *   is not index 0), pinning the WS-4 head resolution at the flatten site.
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

    it('bakes onto the exclusion-resolved head, not index 0, for an excluded base', () => {
      // B486 (opposite-to) is a head-glyph exclusion, so the head is B368 at
      // index 1; the overlay must flatten onto it, not the leading excluded glyph.
      expect(new BlissSVGBuilder('B486/B368;;B86').toString({ flattenIndicators: true }))
        .toBe('B486/B368;B86');
      // pins query-time head resolution at the flatten site (R15 WS-4); kills
      // the Math.max(findIndex,0) -> index-0 mutant on bliss-svg-builder.js.
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
    // R15 D-S1a: a base+indicator combo cannot be a custom glyph (define rejects
    // a baked indicator), so the only name-preserving subject is a base-only
    // custom glyph. The two axes are independent: `preserve` governs the LOCAL
    // name (kept vs decomposed to portable codes), `flattenIndicators` governs
    // the WORD structure (`;;` kept vs baked onto the head as `;`).
    // regression (R3b2-2): a base-only custom head used to DROP its `;;` overlay
    // under flatten -- the identity-clear that forces baked parts to serialize
    // was built-in-only, so the custom head decomposed to a bare code and
    // serializeGlyph emitted the code alone, ignoring the baked parts. The
    // flatten-only and toJSON cases below pin the fix.
    const DEFS = { _LOVE: { type: 'glyph', codeString: 'B291' } };
    beforeAll(() => BlissSVGBuilder.define(DEFS));
    afterAll(() => Object.keys(DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('keeps the name and ;; when neither flag is set', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ preserve: true })).toBe('_LOVE;;B81');
    });

    it('decomposes the name and bakes ;; onto the head when only flatten is set', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ flattenIndicators: true })).toBe('B291;B81');
    });

    it('keeps the name and bakes ;; onto it when both preserve and flatten are set', () => {
      expect(new BlissSVGBuilder('_LOVE;;B81').toString({ preserve: true, flattenIndicators: true }))
        .toBe('_LOVE;B81');
    });

    it('toJSON drops the bare-code identity once the overlay is baked onto the parts', () => {
      const json = new BlissSVGBuilder('_LOVE;;B81').toJSON({ flattenIndicators: true });
      expect(json.groups[0].wordIndicators).toBeUndefined();
      expect(json.groups[0].glyphs[0].codeName).toBeUndefined();
      expect(json.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'B81']);
    });
  });
});
