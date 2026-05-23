import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins three-way parity of the strip-semantic indicator-attachment contract:
 * the char-level DSL `;!`, the word-level DSL `;;!`, and the API call
 * `handle.applyIndicators(IND, { stripSemantic: true })` produce byte-identical
 * `toString` output, byte-identical `svgCode` output, and empty `warnings`
 * arrays for every input where all three surfaces are applicable.
 *
 * Covers:
 * - Single-character bases (no baked indicator): all three surfaces produce
 *   identical output, parameterized over a simple base (B313) and a composite
 *   base (B431).
 * - Compound-indicator bases (B85, itself an indicator): char-level ≡
 *   word-level DSL parity only; the API is intentionally a no-op on bases
 *   that are themselves indicators (DSL `;` at part level is generic
 *   part-superimposition, not indicator-attachment).
 * - Custom definitions with a baked semantic root: all three surfaces strip
 *   the baked B97 semantic root and the resulting toString matches the
 *   expected post-strip form.
 * - Multi-glyph words: word-level `;;!` ≡ API on the head glyph
 *   (`headGlyph().applyIndicators(...)`); char-level `;!` is excluded
 *   because it follows the last glyph (different target).
 *
 * Does NOT cover:
 * - Parser grammar for `;` (part-superimposition) and `;;` (word-level
 *   indicator marker), see `BlissParser.double-semicolon.test.js` and
 *   `BlissParser.semantic-preservation.test.js`.
 * - The character-level applyIndicators API in isolation (without the
 *   stripSemantic option), see `ElementHandle.apply-indicators.test.js`.
 * - The group-level head-indicator API (applyHeadIndicators with
 *   stripSemantic), see `ElementHandle.head-indicators.test.js`.
 *
 * @regression: 2026-05-04 strip-semantic-bug
 */

describe('BlissSVGBuilder strip-semantic parity', () => {
  describe('when applying to a single-character base (no baked indicator)', () => {
    // note: char-level `;!` and word-level `;;!` resolve to the same target on
    // single-character inputs; both attach to the only glyph in the only word.
    it.each([
      ['simple character (B313)', 'B313', 'B81'],
      ['composite character (B431)', 'B431', 'B81'],
    ])('produces byte-identical output across char-level (;!), word-level (;;!), and API surfaces (%s)', (_label, base, newInd) => {
      const charLevel = new BlissSVGBuilder(`${base};!${newInd}`);
      const wordLevel = new BlissSVGBuilder(`${base};;!${newInd}`);

      const apiBuilder = new BlissSVGBuilder(base);
      apiBuilder.group(0).glyph(0).applyIndicators(newInd, { stripSemantic: true });

      expect(charLevel.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      expect(charLevel.toString()).toBe(wordLevel.toString());
      expect(charLevel.toString()).toBe(apiBuilder.toString());

      expect(charLevel.svgCode).toBe(wordLevel.svgCode);
      expect(charLevel.svgCode).toBe(apiBuilder.svgCode);
    });
  });

  describe('when the base is itself a compound indicator (B85)', () => {
    /*
     * B85 is itself an indicator (isIndicator: true). The DSL `;` separator
     * at part level is generic part-superimposition, not indicator-attachment,
     * so `B85;B81` produces two parts overlaid at the same position (the
     * same way `B999;B998` would. The applyIndicators API has narrower scope
     * (it only operates on actual indicator-supporting bases) and is
     * intentionally a no-op here. So we can only assert DSL ≡ DSL parity
     * for this case; API parity does not apply.
     */
    it('produces byte-identical output across char-level (;!) and word-level (;;!) DSL forms', () => {
      const charLevel = new BlissSVGBuilder('B85;!B81');
      const wordLevel = new BlissSVGBuilder('B85;;!B81');

      expect(charLevel.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);

      expect(charLevel.toString()).toBe(wordLevel.toString());
      expect(charLevel.svgCode).toBe(wordLevel.svgCode);
    });
  });

  describe('when the base has a baked semantic root (custom TEST_THING = B291;B97)', () => {
    /*
     * Bliss semantic roots (e.g. B97 for "thing-being") are indicators that
     * mark a code's semantic category. The `applyIndicators` API normally
     * preserves them when attaching new indicators; `{ stripSemantic: true }`
     * removes them. The DSL forms `;!` and `;;!` should match.
     *
     * No built-in B-code is both (a) not itself an indicator AND (b) has a
     * baked semantic root in its codeString. The codepath where the parser
     * goes through the shouldReplace branch (lines 600-616 of bliss-parser.js)
     * with a non-null semantic root needs a custom definition to exercise.
     * TEST_THING below covers it.
     */
    beforeAll(() => {
      BlissSVGBuilder.define({
        TEST_THING: { codeString: 'B291;B97' }
      });
    });
    afterAll(() => {
      BlissSVGBuilder.removeDefinition('TEST_THING');
    });

    it('produces byte-identical output across all three surfaces and strips the baked B97 semantic root', () => {
      const charLevel = new BlissSVGBuilder('TEST_THING;!B86');
      const wordLevel = new BlissSVGBuilder('TEST_THING;;!B86');

      const apiBuilder = new BlissSVGBuilder('TEST_THING');
      apiBuilder.group(0).glyph(0).applyIndicators('B86', { stripSemantic: true });

      expect(charLevel.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      expect(charLevel.toString()).toBe(wordLevel.toString());
      expect(charLevel.toString()).toBe(apiBuilder.toString());

      expect(charLevel.svgCode).toBe(wordLevel.svgCode);
      expect(charLevel.svgCode).toBe(apiBuilder.svgCode);

      expect(charLevel.toString()).toBe('B291;B86');
    });
  });

  describe('when applying to a multi-glyph word', () => {
    // note: char-level `;!` follows the last glyph (different target), so the
    // char-level surface is excluded from this case; only word-level `;;!`
    // and the head-glyph API call target the head glyph.
    it('produces byte-identical output between word-level (;;!) and headGlyph().applyIndicators({stripSemantic: true})', () => {
      const wordLevel = new BlissSVGBuilder('B431/B1103;;!B81');

      const apiBuilder = new BlissSVGBuilder('B431/B1103');
      apiBuilder.group(0).headGlyph().applyIndicators('B81', { stripSemantic: true });

      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      expect(wordLevel.toString()).toBe(apiBuilder.toString());
      expect(wordLevel.svgCode).toBe(apiBuilder.svgCode);
    });
  });
});
