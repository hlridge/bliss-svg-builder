import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the strip-semantic indicator contract across the surfaces that still
 * carry it: the word-level DSL `;;!` and the API call
 * `handle.applyIndicators(IND, { stripSemantic: true })`.
 *
 * Under Strict Indicator Separation the char-level DSL `;!` is no longer a
 * strip-semantic surface. `;` is dumb part-composition, so `base;!IND` just
 * dumb-appends the invalid code `!IND` (UNKNOWN_CODE) on a glyph, or is
 * MISPLACED on a bare alias / multi-character word. That char-level behavior is
 * pinned in `BlissParser.strict-indicator-separation.test.js`; this file pins
 * only the strip-semantic surfaces (`;;!` and the API), which are unchanged.
 *
 * The word-level `;;!` is stored as a reversible overlay, so its serialization
 * KEEPS the `;;!` form rather than decomposing; the API bakes. The behavioral
 * contract is unchanged: applicable surfaces render byte-identical `svgCode`
 * and emit no warnings.
 *
 * Covers:
 * - Single-character bases (no baked indicator): byte-identical svgCode between
 *   word-level `;;!` and the glyph API; the word overlay keeps its `;;!` form
 *   while the API bakes. Parameterized over a simple base (B313) and a composite
 *   base (B431).
 * - Compound-indicator bases (B85, itself an indicator): dumb part-composition
 *   (`B85;B81`) and the word overlay (`B85;;!B81`) render identically (the strip
 *   has no semantic root to remove on an indicator base, so it reduces to
 *   overlaying the part); the overlay keeps its `;;!` serialization.
 * - Custom definitions with a baked semantic root: the word-level surfaces (DSL
 *   `;;!` and the group API) strip the baked B97 and serialize to the reversible
 *   `B291;B97;;!B86` overlay (keeping the baked root recoverable); the
 *   CHARACTER-level glyph-handle API bakes to `B291;B86`. That is the deliberate
 *   level distinction, NOT a parity gap: `glyph().applyIndicators` is
 *   character-level, while `group().applyIndicators` is word-level.
 * - Multi-glyph words: word-level `;;!` and the head-glyph API render
 *   identically; the API bakes onto the head, the overlay keeps `;;!`.
 *
 * Does NOT cover:
 * - The char-level DSL `;!` (no longer strip-semantic), see
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - The flatten serialization parity (word `;;!` collapsing to the baked
 *   form), see the indicator round-trip tests.
 * - The character-level applyIndicators API in isolation (without the
 *   stripSemantic option), see `ElementHandle.apply-indicators.test.js`.
 * - The group-level head-indicator API (applyHeadIndicators with
 *   stripSemantic), see `ElementHandle.head-indicators.test.js`.
 *
 * @regression: 2026-05-04 strip-semantic-bug
 */

describe('BlissSVGBuilder strip-semantic parity', () => {
  describe('when applying to a single-character base (no baked indicator)', () => {
    it.each([
      ['simple character (B313)', 'B313', 'B81'],
      ['composite character (B431)', 'B431', 'B81'],
    ])('renders byte-identically across word-level (;;!) and API surfaces (%s)', (_label, base, newInd) => {
      const wordLevel = new BlissSVGBuilder(`${base};;!${newInd}`);

      const apiBuilder = new BlissSVGBuilder(base);
      apiBuilder.group(0).glyph(0).applyIndicators(newInd, { stripSemantic: true });

      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      // Render parity holds between the word overlay and the glyph API.
      expect(wordLevel.svgCode).toBe(apiBuilder.svgCode);

      // The API bakes; the word overlay keeps `;;!`.
      expect(apiBuilder.toString()).toBe(`${base};${newInd}`);
      expect(wordLevel.toString()).toBe(`${base};;!${newInd}`);
    });
  });

  describe('when the base is itself a compound indicator (B85)', () => {
    /*
     * B85 is itself an indicator (isIndicator: true). The DSL `;` separator at
     * part level is generic part-superimposition, not indicator-attachment, so
     * `B85;B81` produces two parts overlaid at the same position (the same way
     * `B999;B998` would). The word-level overlay treats B85 as the base (never
     * dropping it) and adds B81; B85 has no semantic root for the strip to
     * remove, so the overlay reduces to the same overlaid parts and the two
     * forms render identically. (The char-level `;!` is no longer a
     * strip-semantic surface, so it is excluded here.)
     */
    it('renders byte-identically across part-composition (;) and word-level (;;!) DSL forms', () => {
      const partComposition = new BlissSVGBuilder('B85;B81');
      const wordLevel = new BlissSVGBuilder('B85;;!B81');

      expect(partComposition.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);

      expect(partComposition.svgCode).toBe(wordLevel.svgCode);
      // The part composition bakes (B85;B81); the word overlay keeps its `;;!` form.
      expect(partComposition.toString()).toBe('B85;B81');
      expect(wordLevel.toString()).toBe('B85;;!B81');
    });
  });

  describe('when the base has a baked semantic root (custom TEST_THING = B291;B97)', () => {
    /*
     * Bliss semantic roots (e.g. B97 for "thing-being") are indicators that
     * mark a code's semantic category. The `applyIndicators` API normally
     * preserves them when attaching new indicators; `{ stripSemantic: true }`
     * removes them.
     *
     * TEST_THING is a bare alias, so the char-level DSL `;` cannot reach into it
     * to strip (that is MISPLACED, covered in the strict-separation contract
     * file). The strip-semantic surfaces here are the word-level DSL `;;!` and
     * the group/glyph API.
     */
    beforeAll(() => {
      BlissSVGBuilder.define({
        TEST_THING: { codeString: 'B291;B97' }
      });
    });
    afterAll(() => {
      BlissSVGBuilder.removeDefinition('TEST_THING');
    });

    it('distinguishes the character-level glyph API (bakes) from the word-level surfaces (overlay)', () => {
      const wordDSL = new BlissSVGBuilder('TEST_THING;;!B86');  // explicit word-level
      const glyphApi = new BlissSVGBuilder('TEST_THING');       // character-level: bakes
      glyphApi.group(0).glyph(0).applyIndicators('B86', { stripSemantic: true });
      const groupApi = new BlissSVGBuilder('TEST_THING');       // word-level: overlay
      groupApi.group(0).applyIndicators('B86', { stripSemantic: true });

      expect(wordDSL.warnings).toEqual([]);
      expect(glyphApi.warnings).toEqual([]);
      expect(groupApi.warnings).toEqual([]);

      // Render parity holds across every surface: the word-level overlay resolves
      // to the same parts the character-level bake produces.
      expect(wordDSL.svgCode).toBe(glyphApi.svgCode);
      expect(wordDSL.svgCode).toBe(groupApi.svgCode);

      // The two WORD-level surfaces serialize identically to the reversible
      // overlay (the baked B97 stays recoverable); the CHARACTER-level glyph API
      // bakes destructively. This is the deliberate level distinction, NOT a
      // parity gap: glyph().applyIndicators is character-level, while
      // group().applyIndicators is word-level.
      expect(wordDSL.toString()).toBe('B291;B97;;!B86');
      expect(groupApi.toString()).toBe('B291;B97;;!B86');
      expect(glyphApi.toString()).toBe('B291;B86');
    });
  });

  describe('when applying to a multi-glyph word', () => {
    // note: char-level `;!` follows the last glyph (different target), so the
    // char-level surface is excluded from this case; only word-level `;;!`
    // and the head-glyph API call target the head glyph.
    it('renders identically between word-level (;;!) and headGlyph().applyIndicators({stripSemantic: true})', () => {
      const wordLevel = new BlissSVGBuilder('B431/B1103;;!B81');

      const apiBuilder = new BlissSVGBuilder('B431/B1103');
      apiBuilder.group(0).headGlyph().applyIndicators('B81', { stripSemantic: true });

      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      expect(wordLevel.svgCode).toBe(apiBuilder.svgCode);
      // The API bakes onto the head; the word overlay keeps its `;;!` form.
      expect(apiBuilder.toString()).toBe('B431;B81/B1103');
      expect(wordLevel.toString()).toBe('B431/B1103;;!B81');
    });
  });
});
