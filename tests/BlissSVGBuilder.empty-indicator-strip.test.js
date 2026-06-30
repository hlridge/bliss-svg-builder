import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the trailing-`;` tolerance contract and the `;;` empty-overlay behavior.
 * Under Strict Indicator Separation a trailing `;` (a `;` with no part after it)
 * is INERT: it neither strips nor warns, and any baked indicator is kept
 * (stripping is now an API-only operation via clearIndicators). The word-level
 * `;;` overlay, by contrast, HIDES a grammatical indicator on the head at render
 * (non-destructively and reversibly), keeping the base semantic.
 *
 * Targeting rules pinned here:
 * - A trailing `;` (CODE;, ALIAS;, A/B;) is inert: same render as without it.
 * - A trailing `;;` stores an empty word-level overlay that drops the head's
 *   grammatical indicator at render while keeping the base semantic.
 * - On inline multi-char composition (A/B), a `;` after a part is inert on that
 *   part; `;;` after the last part targets the head glyph.
 *
 * Covers:
 * - Trailing `;` inert on a bare built-in, a plain alias, and inline composition.
 * - Trailing `;` keeps a baked indicator on a single-char alias (SI;) and a
 *   multi-char alias head (MWI;): it does NOT strip.
 * - The `;;` empty overlay hides the head grammatical indicator (SI;;, MWI;;).
 * - Part-level `;` vs word-level `;;` distinction in inline compositions.
 *
 * Does NOT cover:
 * - Stripping via the apply/clear ElementHandle API surface, see
 *   `ElementHandle.apply-indicators.test.js`,
 *   `ElementHandle.clear-indicators.test.js`,
 *   `ElementHandle.indicator-api.test.js`.
 * - Multiple-indicator positioning math, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - The DSL `;`/`;;` attachment counterparts, see
 *   `BlissParser.word-indicators.test.js` and
 *   `BlissParser.strict-indicator-separation.test.js`.
 */
describe('BlissSVGBuilder empty indicator strip', () => {
  const warnings = (input) => new BlissSVGBuilder(input).warnings;
  const childCount = (input) => {
    const b = new BlissSVGBuilder(input);
    return b.elements.children[0]?.children[0]?.children?.length ?? null;
  };
  const glyphCount = (input) => {
    const b = new BlissSVGBuilder(input);
    return b.elements.children[0]?.children?.length ?? null;
  };

  const TEST_DEFS = {
    SC:   { codeString: 'B291' },           // single char, no baked-in indicator
    SI:   { codeString: 'B291;B99' },       // single char with B99 as baked-in indicator
    MWI:  { codeString: 'B291;B99/B291' }, // multi-char: head has B99 indicator
    MWI2: { codeString: 'B291/B291;B99' }, // multi-char: head is plain
  };

  beforeAll(() => BlissSVGBuilder.define(TEST_DEFS));
  afterAll(() => Object.keys(TEST_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  describe('when a trailing ; or ;; follows a bare built-in B-code', () => {

    it('leaves B291; equivalent to B291 (trailing ; is inert)', () => {
      expect(warnings('B291;')).toHaveLength(0);
      expect(childCount('B291;')).toBe(childCount('B291'));
    });

    it('leaves B291;; equivalent to B291 (empty word-level overlay on a single char)', () => {
      expect(warnings('B291;;')).toHaveLength(0);
      expect(childCount('B291;;')).toBe(childCount('B291'));
    });

    it('leaves B291;B291; equivalent to B291;B291 (trailing ; targets the last part, inert)', () => {
      expect(warnings('B291;B291;')).toHaveLength(0);
      expect(childCount('B291;B291;')).toBe(childCount('B291;B291'));
    });

    it('leaves B291;B99; equivalent to B291;B99 (trailing ; targets B99, inert)', () => {
      expect(warnings('B291;B99;')).toHaveLength(0);
      expect(childCount('B291;B99;')).toBe(childCount('B291;B99'));
    });

  });

  describe('when a single ";" follows a specific part in inline multi-char composition', () => {

    it('leaves B291;/B291 equivalent to B291/B291 (inert ; on the first char)', () => {
      expect(warnings('B291;/B291')).toHaveLength(0);
      expect(glyphCount('B291;/B291')).toBe(glyphCount('B291/B291'));
    });

    it('leaves B291/B291; equivalent to B291/B291 (inert ; on the last char)', () => {
      expect(warnings('B291/B291;')).toHaveLength(0);
      expect(glyphCount('B291/B291;')).toBe(glyphCount('B291/B291'));
    });

    it('keeps the first glyph indicator when the trailing ; in B291;B99/B291; is inert on the last char', () => {
      expect(warnings('B291;B99/B291;')).toHaveLength(0);
      expect(glyphCount('B291;B99/B291;')).toBe(2);
      const b = new BlissSVGBuilder('B291;B99/B291;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(2);
    });

  });

  describe('when ";;" follows an inline multi-char composition (word-level overlay)', () => {

    it('leaves B291/B291;; equivalent to B291/B291 (head glyph has no indicator)', () => {
      expect(warnings('B291/B291;;')).toHaveLength(0);
      expect(glyphCount('B291/B291;;')).toBe(glyphCount('B291/B291'));
    });

    it('hides the head-glyph indicator from B291;B99/B291;;, producing two plain B291s', () => {
      expect(warnings('B291;B99/B291;;')).toHaveLength(0);
      expect(glyphCount('B291;B99/B291;;')).toBe(2);
      const b = new BlissSVGBuilder('B291;B99/B291;;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(1);
    });

  });

  describe('when a trailing ; or ;; follows a single-char alias with no baked-in indicator (SC = B291)', () => {

    it('treats SC; as inert, equivalent to B291', () => {
      expect(warnings('SC;')).toHaveLength(0);
      expect(childCount('SC;')).toBe(childCount('B291'));
    });

    it('treats SC;; as an empty overlay, equivalent to B291', () => {
      expect(warnings('SC;;')).toHaveLength(0);
      expect(childCount('SC;;')).toBe(childCount('B291'));
    });

  });

  describe('when a trailing ; or ;; follows a single-char alias with a baked-in indicator (SI = B291;B99)', () => {

    it('keeps the baked-in B99 on SI; (trailing ; is inert, not a strip)', () => {
      expect(warnings('SI;')).toHaveLength(0);
      expect(childCount('SI;')).toBe(2);
    });

    it('hides the baked-in B99 on SI;; (empty word-level overlay)', () => {
      expect(warnings('SI;;')).toHaveLength(0);
      expect(childCount('SI;;')).toBe(1);
    });

  });

  describe('when a trailing ; or ;; follows a multi-char alias whose head glyph has a baked-in indicator (MWI = B291;B99/B291)', () => {

    it('keeps the head-glyph B99 on MWI; (trailing ; is inert, not a strip)', () => {
      expect(warnings('MWI;')).toHaveLength(0);
      expect(glyphCount('MWI;')).toBe(2);
      const b = new BlissSVGBuilder('MWI;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(2);
    });

    it('hides the head-glyph B99 on MWI;; (word-level overlay)', () => {
      expect(warnings('MWI;;')).toHaveLength(0);
      expect(glyphCount('MWI;;')).toBe(2);
      const b = new BlissSVGBuilder('MWI;;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(1);
    });

  });

  describe('when a trailing ; or ;; follows a multi-char alias whose head glyph has no baked-in indicator (MWI2 = B291/B291;B99)', () => {

    it('leaves MWI2; unchanged because the head glyph has no indicator (inert)', () => {
      expect(warnings('MWI2;')).toHaveLength(0);
      expect(glyphCount('MWI2;')).toBe(2);
      const b = new BlissSVGBuilder('MWI2;');
      const secondGlyph = b.elements.children[0]?.children[1];
      expect(secondGlyph?.children?.length).toBe(2);
    });

    it('leaves MWI2;; unchanged because the head glyph has no indicator (overlay no-op)', () => {
      expect(warnings('MWI2;;')).toHaveLength(0);
      expect(glyphCount('MWI2;;')).toBe(2);
      const b = new BlissSVGBuilder('MWI2;;');
      const secondGlyph = b.elements.children[0]?.children[1];
      expect(secondGlyph?.children?.length).toBe(2);
    });

  });

});
