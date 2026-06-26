import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the trailing-semicolon "strip indicator" DSL syntax: a `;` with nothing
 * after it removes the indicator from a target part, and is a silent no-op when
 * the target has no indicator. Users have no way to know whether a built-in
 * B-code carries a baked-in indicator, so attempting to strip a non-existent
 * indicator must never warn or fail.
 *
 * Targeting rules pinned here:
 * - On a bare built-in B-code, both `CODE;` and `CODE;;` target the code itself.
 * - On inline multi-char composition (A/B), `;` after a part targets that
 *   specific part; `;;` after the last part targets the head glyph.
 * - On a user-defined alias (single-char or multi-char), both `;` and `;;`
 *   target the head glyph, because alias decoration always attaches to the head.
 *
 * Covers:
 * - No-op stripping when the target has no indicator (bare built-in, plain alias).
 * - Stripping a baked-in indicator from a single-char alias.
 * - Stripping the head-glyph indicator from a multi-char alias.
 * - Part-level `;` vs word-level `;;` distinction in inline compositions.
 * - Robustness tripwire: the empty-strip semantic scan excludes the base
 *   segment, so a (synthetic) alias whose base is itself a semantic indicator
 *   strips cleanly to one part instead of doubling a bogus semantic root.
 *
 * Does NOT cover:
 * - Stripping via the apply/clear ElementHandle API surface, see
 *   `ElementHandle.apply-indicators.test.js`,
 *   `ElementHandle.clear-indicators.test.js`,
 *   `ElementHandle.indicator-api.test.js`.
 * - Multiple-indicator positioning math, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - The DSL `;;` semantic-indicator attachment counterpart of stripping, see
 *   `BlissParser.word-indicators.test.js`.
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
    // SYNTHETIC (not valid Bliss): base segment is itself a bare semantic
    // indicator (B97), used only to pin the base-exclusion invariant below.
    BADBASE: { codeString: 'B97;B99' },
  };

  beforeAll(() => BlissSVGBuilder.define(TEST_DEFS));
  afterAll(() => Object.keys(TEST_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  describe('when stripping an indicator from a bare built-in B-code', () => {

    it('leaves B291; equivalent to B291 (no indicator to strip)', () => {
      expect(warnings('B291;')).toHaveLength(0);
      expect(childCount('B291;')).toBe(childCount('B291'));
    });

    it('leaves B291;; equivalent to B291 (word-level strip on a single char)', () => {
      expect(warnings('B291;;')).toHaveLength(0);
      expect(childCount('B291;;')).toBe(childCount('B291'));
    });

    it('leaves B291;B291; equivalent to B291;B291 (trailing ; targets the last part, which has no own indicator)', () => {
      expect(warnings('B291;B291;')).toHaveLength(0);
      expect(childCount('B291;B291;')).toBe(childCount('B291;B291'));
    });

    it('leaves B291;B99; equivalent to B291;B99 (trailing ; targets B99, which has no sub-indicator)', () => {
      expect(warnings('B291;B99;')).toHaveLength(0);
      expect(childCount('B291;B99;')).toBe(childCount('B291;B99'));
    });

  });

  describe('when a single ";" follows a specific part in inline multi-char composition', () => {

    it('leaves B291;/B291 equivalent to B291/B291 (strip targets the first char, no indicator)', () => {
      expect(warnings('B291;/B291')).toHaveLength(0);
      expect(glyphCount('B291;/B291')).toBe(glyphCount('B291/B291'));
    });

    it('leaves B291/B291; equivalent to B291/B291 (strip targets the last char, no indicator)', () => {
      expect(warnings('B291/B291;')).toHaveLength(0);
      expect(glyphCount('B291/B291;')).toBe(glyphCount('B291/B291'));
    });

    it('preserves the first glyph indicator when the trailing ; in B291;B99/B291; targets only the last char', () => {
      expect(warnings('B291;B99/B291;')).toHaveLength(0);
      expect(glyphCount('B291;B99/B291;')).toBe(2);
      const b = new BlissSVGBuilder('B291;B99/B291;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(2);
    });

  });

  describe('when ";;" follows an inline multi-char composition (word-level strip)', () => {

    it('leaves B291/B291;; equivalent to B291/B291 (head glyph has no indicator)', () => {
      expect(warnings('B291/B291;;')).toHaveLength(0);
      expect(glyphCount('B291/B291;;')).toBe(glyphCount('B291/B291'));
    });

    it('strips the head-glyph indicator from B291;B99/B291;;, producing two plain B291s', () => {
      expect(warnings('B291;B99/B291;;')).toHaveLength(0);
      expect(glyphCount('B291;B99/B291;;')).toBe(2);
      const b = new BlissSVGBuilder('B291;B99/B291;;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(1);
    });

  });

  describe('when stripping from a user-defined single-char alias with no baked-in indicator (SC = B291)', () => {

    it('treats SC; as a no-op equivalent to B291', () => {
      expect(warnings('SC;')).toHaveLength(0);
      expect(childCount('SC;')).toBe(childCount('B291'));
    });

    it('treats SC;; as a no-op equivalent to B291 (word-level on a single char)', () => {
      expect(warnings('SC;;')).toHaveLength(0);
      expect(childCount('SC;;')).toBe(childCount('B291'));
    });

  });

  describe('when stripping from a user-defined single-char alias with a baked-in indicator (SI = B291;B99)', () => {

    it('strips the baked-in B99 indicator from SI;', () => {
      expect(warnings('SI;')).toHaveLength(0);
      expect(childCount('SI;')).toBe(1);
    });

    it('strips the baked-in B99 indicator from SI;; (word-level on a single char, same target)', () => {
      expect(warnings('SI;;')).toHaveLength(0);
      expect(childCount('SI;;')).toBe(1);
    });

  });

  describe('when stripping from a user-defined multi-char alias whose head glyph has a baked-in indicator (MWI = B291;B99/B291)', () => {

    it('strips the head-glyph B99 from MWI;, producing two plain B291s', () => {
      expect(warnings('MWI;')).toHaveLength(0);
      expect(glyphCount('MWI;')).toBe(2);
      const b = new BlissSVGBuilder('MWI;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(1);
    });

    it('strips the head-glyph B99 from MWI;; (word-level, same target as ; for user-defined words)', () => {
      expect(warnings('MWI;;')).toHaveLength(0);
      expect(glyphCount('MWI;;')).toBe(2);
      const b = new BlissSVGBuilder('MWI;;');
      const firstGlyph = b.elements.children[0]?.children[0];
      expect(firstGlyph?.children?.length).toBe(1);
    });

  });

  describe('when stripping from a user-defined multi-char alias whose head glyph has no baked-in indicator (MWI2 = B291/B291;B99)', () => {

    it('leaves MWI2; unchanged because the head glyph has no indicator (no-op)', () => {
      expect(warnings('MWI2;')).toHaveLength(0);
      expect(glyphCount('MWI2;')).toBe(2);
      const b = new BlissSVGBuilder('MWI2;');
      const secondGlyph = b.elements.children[0]?.children[1];
      expect(secondGlyph?.children?.length).toBe(2);
    });

    it('leaves MWI2;; unchanged because the head glyph has no indicator (word-level no-op)', () => {
      expect(warnings('MWI2;;')).toHaveLength(0);
      expect(glyphCount('MWI2;;')).toBe(2);
      const b = new BlissSVGBuilder('MWI2;;');
      const secondGlyph = b.elements.children[0]?.children[1];
      expect(secondGlyph?.children?.length).toBe(2);
    });

  });

  describe('when the base of a synthetic alias is itself a bare semantic indicator (BADBASE = B97;B99)', () => {
    // BADBASE is SYNTHETIC: no real Bliss character has a base segment that is
    // itself a bare semantic indicator (every built-in with a semantic-indicator
    // base is a compound indicator, gated out of this path). It exists only as a
    // robustness tripwire for the empty-strip semantic scan.
    it('strips BADBASE; to the single base part, not a doubled semantic root', () => {
      // pins existingIndicatorCodes = codeStringParts.slice(1) on the strip path
      // (parser L754); killed the .slice(1)->codeStringParts mutant in the
      // 2026-06-26 Stryker run, which includes the B97 base in the semantic
      // scan, finds it semantic, and preserves a bogus root -> B97;B97.
      expect(warnings('BADBASE;')).toHaveLength(0);
      expect(childCount('BADBASE;')).toBe(1);
    });
  });

});
