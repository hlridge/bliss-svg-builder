import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the strip-semantic indicator-attachment contract across surfaces: the
 * char-level DSL `;!`, the word-level DSL `;;!`, and the API call
 * `handle.applyIndicators(IND, { stripSemantic: true })`.
 *
 * After R14 the word-level `;;!` is stored as a reversible overlay, so its
 * serialization KEEPS the `;;!` form rather than decomposing. The behavioral
 * contract is unchanged: all applicable surfaces render byte-identical
 * `svgCode` and emit no warnings. The baking surfaces (char `;!`, glyph API)
 * still serialize identically; the word-level overlay serializes to its kept
 * `;;!` form. The flatten serialization parity (word-level `;;!` decomposing to
 * match the baking surfaces) is covered with the `flatten` option in Task 2.
 *
 * Covers:
 * - Single-character bases (no baked indicator): byte-identical svgCode across
 *   all three surfaces; char `;!` ≡ glyph-API toString; word `;;!` keeps its
 *   overlay form. Parameterized over a simple base (B313) and a composite
 *   base (B431).
 * - Compound-indicator bases (B85, itself an indicator): char `;!` and word
 *   `;;!` render identically; the word overlay adds onto the indicator base
 *   (the base part is never dropped) and keeps its `;;!` serialization.
 * - Custom definitions with a baked semantic root: all surfaces strip the baked
 *   B97 and render identically. The WORD-level surfaces (the DSL `;!`-on-alias
 *   use-site auto-promotion, the DSL `;;!`, and the group-handle API) serialize
 *   to the reversible `B291;B97;;!B86` overlay (keeping the baked root
 *   recoverable); the CHARACTER-level glyph-handle API bakes to `B291;B86`. That
 *   is the deliberate level distinction, NOT a parity gap (R15 T3b1-2):
 *   `glyph().applyIndicators` is character-level, while `group().applyIndicators`
 *   and the DSL `;`-on-alias promotion are word-level.
 * - Multi-glyph words: word-level `;;!` and the head-glyph API render
 *   identically; char-level `;!` is excluded because it follows the last
 *   glyph (different target).
 *
 * Does NOT cover:
 * - The flatten serialization parity (word `;;!` collapsing to the baked
 *   form), see Task 2 / the indicator round-trip tests.
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
    ])('renders byte-identically across char-level (;!), word-level (;;!), and API surfaces (%s)', (_label, base, newInd) => {
      const charLevel = new BlissSVGBuilder(`${base};!${newInd}`);
      const wordLevel = new BlissSVGBuilder(`${base};;!${newInd}`);

      const apiBuilder = new BlissSVGBuilder(base);
      apiBuilder.group(0).glyph(0).applyIndicators(newInd, { stripSemantic: true });

      expect(charLevel.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);
      expect(apiBuilder.warnings).toEqual([]);

      // Render parity holds across all three surfaces.
      expect(charLevel.svgCode).toBe(wordLevel.svgCode);
      expect(charLevel.svgCode).toBe(apiBuilder.svgCode);

      // The baking surfaces serialize identically; the word overlay keeps `;;!`.
      expect(charLevel.toString()).toBe(apiBuilder.toString());
      expect(wordLevel.toString()).toBe(`${base};;!${newInd}`);
    });
  });

  describe('when the base is itself a compound indicator (B85)', () => {
    /*
     * B85 is itself an indicator (isIndicator: true). The DSL `;` separator
     * at part level is generic part-superimposition, not indicator-attachment,
     * so `B85;B81` produces two parts overlaid at the same position (the
     * same way `B999;B998` would). The word-level overlay treats B85 as the
     * base (never dropping it) and adds B81, so the two DSL forms render
     * identically. The applyIndicators API has narrower scope (it no-ops on
     * bases that are themselves indicators), so API parity does not apply.
     */
    it('renders byte-identically across char-level (;!) and word-level (;;!) DSL forms', () => {
      const charLevel = new BlissSVGBuilder('B85;!B81');
      const wordLevel = new BlissSVGBuilder('B85;;!B81');

      expect(charLevel.warnings).toEqual([]);
      expect(wordLevel.warnings).toEqual([]);

      expect(charLevel.svgCode).toBe(wordLevel.svgCode);
      // The char form bakes (B85;B81); the word overlay keeps its `;;!` form.
      expect(charLevel.toString()).toBe('B85;B81');
      expect(wordLevel.toString()).toBe('B85;;!B81');
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

    it('distinguishes the character-level glyph API (bakes) from the word-level surfaces (promote)', () => {
      const charDSL = new BlissSVGBuilder('TEST_THING;!B86');   // use-site `;` auto-promotes
      const wordDSL = new BlissSVGBuilder('TEST_THING;;!B86');  // explicit word-level
      const glyphApi = new BlissSVGBuilder('TEST_THING');       // character-level: bakes
      glyphApi.group(0).glyph(0).applyIndicators('B86', { stripSemantic: true });
      const groupApi = new BlissSVGBuilder('TEST_THING');       // word-level: overlay
      groupApi.group(0).applyIndicators('B86', { stripSemantic: true });

      expect(charDSL.warnings).toEqual([]);
      expect(wordDSL.warnings).toEqual([]);
      expect(glyphApi.warnings).toEqual([]);
      expect(groupApi.warnings).toEqual([]);

      // Render parity holds across every surface: the word-level overlay resolves
      // to the same parts the character-level bake produces.
      expect(charDSL.svgCode).toBe(wordDSL.svgCode);
      expect(charDSL.svgCode).toBe(glyphApi.svgCode);
      expect(charDSL.svgCode).toBe(groupApi.svgCode);

      // The three WORD-level surfaces serialize identically to the reversible
      // overlay (the baked B97 stays recoverable); the CHARACTER-level glyph API
      // bakes destructively. This is the deliberate level distinction, NOT a
      // parity gap (R15 T3b1-2): glyph().applyIndicators is character-level,
      // while group().applyIndicators and the DSL `;`-on-alias promotion are
      // word-level.
      expect(charDSL.toString()).toBe('B291;B97;;!B86');
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
