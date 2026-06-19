import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the D-S1b buried-indicator guard: a base+indicator alias used as a
 * NON-leading ;-part buries its baked indicator (an indicator-of-a-part,
 * forbidden), so that character records a BURIED_INDICATOR warning and fails
 * to render. Sibling of the WORD_AS_PART rule (a word used as a ;-part).
 *
 * Covers:
 * - DSL `H;NOUN_BI` (NOUN_BI = B291;B81) warns BURIED_INDICATOR with the alias
 *   as source, and fails to render (empty by default; REFSQUARE/B699 placeholder
 *   under error-placeholder).
 * - The equivalent hand-built object input warns and fails the same way, so the
 *   guard holds on both surfaces (matching WORD_AS_PART).
 * - Negatives that must NOT fire: the alias leading (`NOUN_BI;B81`) or standalone
 *   (`NOUN_BI`); a compound-indicator alias as a part (`H;COMPOUND`); a multi-base
 *   alias with no indicator (`H;MULTIBASE`); a base-only alias (`H;BASEAL`);
 *   literal inline parts (`H;B291;B81`).
 * - A multi-base alias burying a TRAILING indicator (`H;MULTIBASE_IND`) fires.
 *
 * Does NOT cover:
 * - The define-time guard rejecting base+indicator glyph definitions (D-S1a,
 *   Task 3b-2), see `BlissSVGBuilder.define.test.js`.
 * - The `/`-glyph sibling `H/NOUN_BI;B97` (promotion + DROPPED_WORD_INDICATOR),
 *   see `BlissSVGBuilder.indicator-promotion.test.js`.
 * - WORD_AS_PART (a word used as a ;-part), see `BlissSVGBuilder.word-as-part.test.js`.
 */
describe('BlissSVGBuilder buried indicator', () => {
  const BURIED_DEFS = {
    NOUN_BI: { codeString: 'B291;B81' },            // base + indicator
    BASEAL: { codeString: 'B291' },                 // base-only alias
    MULTIBASE: { codeString: 'B291;B431' },         // two bases, no indicator
    ALL_IND: { codeString: 'B97;B81' },             // all-indicator alias (indicator first)
    MULTIBASE_IND: { codeString: 'B291;B431;B81' }, // two bases + trailing indicator
  };
  const warns = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);
  const firstGlyph = (b) => b.elements.children[0].children[0];

  beforeAll(() => BlissSVGBuilder.define(BURIED_DEFS));
  afterAll(() => Object.keys(BURIED_DEFS).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  describe('when a base+indicator alias is buried as a non-leading ; part', () => {
    it('records a BURIED_INDICATOR warning naming the alias', () => {
      const warning = new BlissSVGBuilder('H;NOUN_BI').warnings.find((w) => w.code === 'BURIED_INDICATOR');
      expect(warning?.source).toBe('NOUN_BI');
    });

    it('fails to render the character when error-placeholder is off', () => {
      const glyph = firstGlyph(new BlissSVGBuilder('H;NOUN_BI'));
      expect(glyph.children).toEqual([]);
      expect(glyph.width).toBe(0);
    });

    it('renders the placeholder when error-placeholder is on', () => {
      const glyph = firstGlyph(new BlissSVGBuilder('[error-placeholder]||H;NOUN_BI'));
      expect(glyph.children.map((c) => c.codeName)).toEqual(['REFSQUARE', 'B699']);
    });
  });

  describe('when the same buried part is built as object input', () => {
    it('warns and fails to render the same as the DSL form', () => {
      const obj = { groups: [{ glyphs: [{ parts: [{ codeName: 'H' }, { codeName: 'NOUN_BI' }] }] }] };
      const b = new BlissSVGBuilder(obj);
      expect(b.warnings.find((w) => w.code === 'BURIED_INDICATOR')?.source).toBe('NOUN_BI');
      expect(firstGlyph(b).children).toEqual([]);
    });

    it('does not fire for a leading alias built as object input', () => {
      // pins index>0: object input keeps a leading alias composite (DSL input
      // flattens it), so the leading base+indicator alias must not warn here
      const obj = { groups: [{ glyphs: [{ parts: [{ codeName: 'NOUN_BI' }, { codeName: 'H' }] }] }] };
      expect(new BlissSVGBuilder(obj).warnings.map((w) => w.code)).not.toContain('BURIED_INDICATOR');
    });
  });

  describe('when the alias is leading or standalone', () => {
    it('does not fire for the alias as the leading part', () => {
      // kills the idx>0 boundary mutant: the alias is a valid character when leading
      expect(warns('NOUN_BI;B81')).not.toContain('BURIED_INDICATOR');
    });

    it('does not fire for the alias standalone', () => {
      expect(warns('NOUN_BI')).not.toContain('BURIED_INDICATOR');
    });
  });

  describe('when a non-leading part is not a buried base+indicator alias', () => {
    it('does not fire for a built-in compound indicator as a part', () => {
      // pins part.isIndicator guard: B85 is a flagged indicator whose first
      // sub-part (B270) is NOT an indicator, so only the flag excludes it
      expect(warns('H;B85')).not.toContain('BURIED_INDICATOR');
    });

    it('does not fire for an all-indicator alias whose first part is an indicator', () => {
      // pins the parts[0]-not-indicator guard: define() strips a custom
      // isIndicator flag, so the indicator-first shape is the only signal left
      expect(warns('H;ALL_IND')).not.toContain('BURIED_INDICATOR');
    });

    it('does not fire for a multi-base alias with no indicator', () => {
      // kills the .some removal: an expanded part with bases only is allowed
      expect(warns('H;MULTIBASE')).not.toContain('BURIED_INDICATOR');
    });

    it('does not fire for a base-only alias as a part', () => {
      expect(warns('H;BASEAL')).not.toContain('BURIED_INDICATOR');
    });

    it('does not fire for literal inline parts', () => {
      expect(warns('H;B291;B81')).not.toContain('BURIED_INDICATOR');
    });
  });

  describe('when a multi-base alias buries a trailing indicator', () => {
    it('fires for the buried trailing indicator', () => {
      // pins .some over expanded parts; kills .every (B291,B431 are not indicators)
      expect(warns('H;MULTIBASE_IND')).toContain('BURIED_INDICATOR');
    });
  });
});
