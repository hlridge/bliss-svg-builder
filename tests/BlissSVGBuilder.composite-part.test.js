import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the part-merge operand rule: `;` is part-merge, so a non-leading `;`-part
 * operand must be a PART (a primitive, or a flagged reusable definition: an
 * indicator, a `type:'glyph'`, or a `type:'shape'`). A composed UNFLAGGED alias
 * (a character/word alias that expands to multiple parts) used as a non-leading
 * `;`-part is a level violation, so that character records a COMPOSITE_AS_PART
 * warning and fails to render. Generalizes the former BURIED_INDICATOR guard
 * (base+indicator only) to every composed unflagged alias. Sibling of the
 * WORD_AS_PART rule (a word used as a `;`-part).
 *
 * Covers:
 * - DSL positives: a base+indicator (`NOUN_BI`), an all-indicator (`ALL_IND`),
 *   and a multi-base (`MULTIBASE`) alias each warn COMPOSITE_AS_PART naming the
 *   alias and fail to render (empty by default; REFSQUARE/B699 placeholder under
 *   error-placeholder). ALL_IND and MULTIBASE are new failures under the
 *   generalized rule (the old base+indicator guard exempted them).
 * - The equivalent hand-built object input warns and fails the same way; a
 *   leading composed alias built as object input does not warn (pins index>0,
 *   which the DSL path flattens away); a part flagged isIndicator is exempt (the
 *   only surface where that clause is observable). An alias added as a
 *   non-leading part via the mutation API (addPart) warns; inserted as the
 *   leading part it does not.
 * - Exemptions that must NOT fire: a primitive (`H;B291`), a single-code rename
 *   alias (`H;SIMPLE`), explicit literal parts (`H;B291;B81`), a flagged built-in
 *   indicator (`H;B85`), a custom `type:'glyph'` (`H;CGLYPH`), a custom
 *   `type:'shape'` (`H;CSHAPE`), and a built-in composite character (`H;B1`).
 * - toString of a failed composite part decomposes to the explicit literal form
 *   (`H;NOUN_BI` -> `H;B291;B81`), which re-parses clean (review F2, by-design).
 *
 * Does NOT cover:
 * - The define-time guards (a composed-alias `;`-operand inside a definition's
 *   codeString; circular definitions), see `BlissSVGBuilder.define.test.js`.
 * - The `/`-glyph sibling `H/NOUN_BI;B97` (now MISPLACED on the bare-alias
 *   glyph), see `BlissSVGBuilder.indicator-promotion.test.js`.
 * - WORD_AS_PART (a word used as a `;`-part), see `BlissSVGBuilder.word-as-part.test.js`.
 */
describe('BlissSVGBuilder composite part', () => {
  const COMPOSITE_DEFS = {
    NOUN_BI:  { codeString: 'B291;B81' },                   // base + indicator
    ALL_IND:  { codeString: 'B97;B81' },                    // all-indicator (indicator first)
    MULTIBASE:{ codeString: 'B291;B431' },                  // two bases, no indicator
    SIMPLE:   { codeString: 'B291' },                       // single-code rename
    CGLYPH:   { type: 'glyph', codeString: 'HL8;HL8:0,8' }, // flagged custom glyph
    CSHAPE:   { type: 'shape', codeString: 'HL8;HL8:0,8' }, // flagged custom shape
  };
  const warningCodes = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);
  const firstGlyph = (b) => b.elements.children[0].children[0];

  beforeAll(() => BlissSVGBuilder.define(COMPOSITE_DEFS));
  afterAll(() => Object.keys(COMPOSITE_DEFS).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  describe('when a composed unflagged alias is a non-leading ; part', () => {
    it('records a COMPOSITE_AS_PART warning naming the alias', () => {
      const warning = new BlissSVGBuilder('H;NOUN_BI').warnings.find((w) => w.code === 'COMPOSITE_AS_PART');
      expect(warning?.source).toBe('NOUN_BI');
      expect(warning?.message).toMatch(/cannot be a part/i); // pins the message literal (Stryker survivor)
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

    it('fires for an all-indicator alias', () => {
      // new under the generalized rule: a composed alias is illegal regardless of
      // what it contains; B97;B81 (indicator-first) used to be exempt
      expect(warningCodes('H;ALL_IND')).toContain('COMPOSITE_AS_PART');
    });

    it('fires for a multi-base alias', () => {
      // new under the generalized rule: two bases with no indicator is still a
      // composition, so it cannot be a ; part
      expect(warningCodes('H;MULTIBASE')).toContain('COMPOSITE_AS_PART');
    });
  });

  describe('when parts are built as object input', () => {
    it('warns and fails to render a composed alias the same as the DSL form', () => {
      const obj = { groups: [{ glyphs: [{ parts: [{ codeName: 'H' }, { codeName: 'NOUN_BI' }] }] }] };
      const b = new BlissSVGBuilder(obj);
      expect(b.warnings.find((w) => w.code === 'COMPOSITE_AS_PART')?.source).toBe('NOUN_BI');
      expect(firstGlyph(b).children).toEqual([]);
    });

    it('does not fire for a leading composed alias', () => {
      // pins index>0: object input keeps a leading alias composite (DSL input
      // flattens it), so the leading composed alias must not warn here
      const obj = { groups: [{ glyphs: [{ parts: [{ codeName: 'NOUN_BI' }, { codeName: 'H' }] }] }] };
      expect(new BlissSVGBuilder(obj).warnings.map((w) => w.code)).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a part flagged as an indicator', () => {
      // pins the part.isIndicator exemption: every built-in indicator is also
      // isBlissGlyph, so the object surface is the only place this clause is
      // observable. A part flagged isIndicator with sub-parts is a legal operand;
      // the same shape WITHOUT the flag fires (control below).
      const flagged = { groups: [{ glyphs: [{ parts: [
        { codeName: 'H' },
        { codeName: 'XIND', isIndicator: true, parts: [{ codeName: 'B97' }, { codeName: 'B99' }] },
      ] }] }] };
      const unflagged = { groups: [{ glyphs: [{ parts: [
        { codeName: 'H' },
        { codeName: 'XIND', parts: [{ codeName: 'B97' }, { codeName: 'B99' }] },
      ] }] }] };
      expect(new BlissSVGBuilder(flagged).warnings.map((w) => w.code)).not.toContain('COMPOSITE_AS_PART');
      expect(new BlissSVGBuilder(unflagged).warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
    });
  });

  describe('when the composed part is added through the mutation API', () => {
    it('warns when an alias is added as a non-leading part', () => {
      // pins the object/programmatic surface: addPart rebuilds through
      // expandParts, so the guard must fire on mutation too, not only on parse
      const b = new BlissSVGBuilder('H');
      b.glyph(0).addPart('NOUN_BI');
      expect(b.warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
    });

    it('does not fire when an alias is inserted as the LEADING part', () => {
      // insertPart parses the new part through an `H;<code>` scaffold (index 1),
      // which stamps a position-dependent flag; landing it at index 0 must clear
      // that stale flag so the leading composed alias is flattened, not misplaced.
      // No DSL parity here: the DSL form NOUN_BI;B291 is MISPLACED on the
      // bare-alias base (feedback_parity_scoped_to_valid_inputs), so the mutation
      // result is pinned directly: the leading alias flattens and B291 appends.
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).insertPart(0, 'NOUN_BI');
      expect(b.warnings.map((w) => w.code)).not.toContain('COMPOSITE_AS_PART');
      expect(b.toString()).toBe('B291;B81;B291');
    });
  });

  describe('when the alias is leading or standalone', () => {
    it('does not fire for the alias as the leading part', () => {
      // kills the idx>0 boundary mutant: the alias is a valid character when leading
      expect(warningCodes('NOUN_BI;B81')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for the alias standalone', () => {
      expect(warningCodes('NOUN_BI')).not.toContain('COMPOSITE_AS_PART');
    });
  });

  describe('when the ; part is a primitive or a flagged definition', () => {
    it('does not fire for a primitive code', () => {
      expect(warningCodes('H;B291')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a single-code rename alias', () => {
      // kills the parts.length>1 boundary mutant: SIMPLE expands to one part
      expect(warningCodes('H;SIMPLE')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for explicit literal parts', () => {
      // each ; operand is individually a primitive, so none is a composition
      expect(warningCodes('H;B291;B81')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a flagged built-in indicator', () => {
      // a built-in compound indicator is a flagged glyph (isBlissGlyph) and stays
      // legal; the part.isIndicator clause is pinned separately via object input
      expect(warningCodes('H;B85')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a custom type:glyph definition', () => {
      // pins the isBlissGlyph exemption read from the DEFINITION (parts never
      // carry isBlissGlyph), so a flagged glyph is a legal composed part
      expect(warningCodes('H;CGLYPH')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a custom type:shape definition', () => {
      // pins the isShape exemption read from the definition
      expect(warningCodes('H;CSHAPE')).not.toContain('COMPOSITE_AS_PART');
    });

    it('does not fire for a built-in composite character', () => {
      // regression pin: ~1000 built-in characters (B1, B2, ...) are composite
      // (parts.length>1) and isBlissGlyph; reading the flag from the definition
      // keeps them legal as ; parts. A part.isBlissGlyph check would break all of them.
      expect(warningCodes('H;B1')).not.toContain('COMPOSITE_AS_PART');
    });
  });

  describe('when a failed composite part is serialized', () => {
    it('re-emits by its written name so the warned string round-trips to the same failure', () => {
      // row 80 (supersedes the old decompose-to-literal behavior): decomposing
      // H;NOUN_BI to the explicit H;B291;B81 changed what the warned string meant
      // (a legitimate character, the COMPOSITE_AS_PART lost, svg drift). The
      // failed part now re-emits by name, so the reparse fails identically.
      const failed = new BlissSVGBuilder('H;NOUN_BI');
      expect(failed.warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
      expect(failed.toString()).toBe('H;NOUN_BI');
      const roundTripped = new BlissSVGBuilder(failed.toString());
      expect(roundTripped.warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
      expect(roundTripped.svgCode).toBe(failed.svgCode);
    });
  });
});
