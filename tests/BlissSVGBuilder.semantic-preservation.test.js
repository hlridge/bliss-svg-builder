import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins word-level (`;;` / `;;!`) semantic-indicator preservation, resolved onto
 * the head glyph at render. When overriding indicators with `;;`, semantic
 * indicators (B97 = THING, B6436 = ABSTRACT) are preserved by default and
 * ordered around the new indicators by role (semantic first for nominal
 * companions, last for verbal / adjectival); `;;!` strips them.
 *
 * Under Strict Indicator Separation the character-level smart `;` / `;!` surface
 * is removed: per-character semantic preservation is now an API concern
 * (`glyph.applyIndicators`), pinned in `ElementHandle.apply-indicators.test.js`.
 * The word-level `;;` overlay still carries the smart behavior, resolved at
 * render (the semantic ordering lives in the overlay merge, not the stored
 * overlay), so these end-to-end pins read through the builder.
 *
 * Covers:
 * - Word-level `;;` override on a multi-glyph word: preserves B97 / B6436 unless
 *   the replacement is itself semantic; an empty `;;` keeps the semantic root.
 * - Strip-semantic `;;!`: drops the semantic root before adding the new
 *   indicator; an empty `;;!` strips all indicators.
 * - Single-glyph word with `;;` / `;;!`: preserves / strips the semantic root.
 * - Non-indicator composition parts (e.g. B303): preserved across both override
 *   and strip-semantic (`!` strips indicators only, never composition parts).
 * - Explicit semantic in the new-indicator list: not duplicated by auto-preserve.
 * - Role-based ordering of the preserved semantic alongside new indicators
 *   (semantic first for nominal, last for verbal / adjectival), including a
 *   real-world multi-glyph input.
 *
 * Does NOT cover:
 * - Character-level semantic preservation via the glyph API, see
 *   `ElementHandle.apply-indicators.test.js`.
 * - Indicator role assignment and the semantic-goes-last placement rule on the
 *   utility side, see `indicator-utils.semantic-goes-last.test.js`.
 * - Head-glyph detection itself (which glyph the `;;` targets), see
 *   `BlissParser.head-glyph-exclusions.test.js`.
 * - Indicator detection mechanics (hasSemantic, filterToIndicators), see
 *   `indicator-utils.has-semantic.test.js`.
 *
 * @contract: semantic-indicator-preservation
 */

describe('BlissSVGBuilder semantic indicator preservation', () => {

  // Resolved head-glyph part codes after the R14 `;;` overlay is merged onto
  // the head at render. (The semantic ordering lives in the merge, not in the
  // stored overlay, so these end-to-end pins resolve through the builder.)
  const resolvedHeadParts = (dsl) => {
    const glyphs = new BlissSVGBuilder(dsl).snapshot().children[0].children.filter(c => c.isGlyph);
    const head = glyphs.find(g => g.children?.some(p => p.isIndicator)) ?? glyphs[0];
    return head.children.map(p => p.codeName);
  };

  describe('when overriding indicators on a multi-glyph word with ;;', () => {
    // The semantic-bearing glyph is placed first in these inputs so the head
    // scan selects it as head (first non-excluded glyph). Assertions read the
    // resolved head (overlay merged at render), not the stored base.

    it('preserves B97 on the head glyph when replacing with a grammatic indicator', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B97');
      expect(partNames).toContain('B81');
    });

    it('preserves B6436 on the head glyph when replacing with a grammatic indicator', () => {
      const partNames = resolvedHeadParts('B291;B6436/C;;B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B6436');
      expect(partNames).toContain('B81');
    });

    it('does not preserve when the new indicator is itself semantic (;;B6436 replaces B97)', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;B6436');
      expect(partNames).toContain('B6436');
      expect(partNames).not.toContain('B97');
    });

    it('preserves the semantic root on an empty ;; strip', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;');
      expect(partNames).toContain('B97');
    });

    it('strips the semantic root on ;;! before adding the new indicator', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;!B81');
      expect(partNames).toContain('B81');
      expect(partNames).not.toContain('B97');
    });

    it('strips all indicators on an empty ;;! strip', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;!');
      expect(partNames).not.toContain('B97');
    });

    it('adds the new indicator directly when no existing semantic root is present', () => {
      // H is the default head (index 0); ;;B99 attaches B99 with no preservation step.
      const partNames = resolvedHeadParts('H/C;;B99');
      expect(partNames).toContain('B99');
    });
  });

  describe('when applying ;; syntax to a single-glyph word', () => {
    // A single glyph with ;; stores an overlay (kept reversible); the semantic
    // base is retained so it can be restored. Assertions read the resolved head.

    it('preserves the semantic root with ;; on a single glyph', () => {
      const partNames = resolvedHeadParts('B291;B97;;B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B97');
      expect(partNames).toContain('B81');
    });

    it('strips the semantic root with ;;! on a single glyph', () => {
      const partNames = resolvedHeadParts('B291;B97;;!B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B81');
      expect(partNames).not.toContain('B97');
    });
  });

  describe('when the glyph carries non-indicator composition parts', () => {

    it('preserves a non-indicator composition part (B303) on an empty ;; strip', () => {
      // B291;B303 is a composite glyph (two stacked shapes); B303 is not an
      // indicator, so an empty ;; must not strip it.
      const partNames = resolvedHeadParts('B291;B303/B291;;');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B303');
    });

    it('preserves the non-indicator composition part when replacing indicators with ;;B81', () => {
      const partNames = resolvedHeadParts('B291;B303;B97/C;;B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B303');
      expect(partNames).toContain('B97');
      expect(partNames).toContain('B81');
    });

    it('strips indicators with ;;! but preserves the non-indicator composition part', () => {
      const partNames = resolvedHeadParts('B291;B303;B97/C;;!B81');
      expect(partNames).toContain('B291');
      expect(partNames).toContain('B303');
      expect(partNames).toContain('B81');
      expect(partNames).not.toContain('B97');
    });
  });

  describe('when the new-indicator list explicitly includes the semantic root', () => {

    it('does not double-add B97 when ;;B97;B99 is applied to a glyph already carrying B97', () => {
      // Auto-preserve is suppressed because B97 is in the new list, so no duplicate.
      const partNames = resolvedHeadParts('B291;B97/C;;B97;B99');
      const b97Count = partNames.filter(n => n === 'B97').length;
      expect(b97Count).toBe(1);
      expect(partNames).toContain('B99');
    });
  });

  describe('when the semantic root is preserved alongside new indicators', () => {

    it('places the semantic root FIRST when the new indicator is nominal (;;B99)', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;B99');
      expect(partNames.indexOf('B97')).toBeLessThan(partNames.indexOf('B99'));
    });

    it('places the semantic root LAST when the new indicator is verbal (;;B81)', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;B81');
      expect(partNames.indexOf('B81')).toBeLessThan(partNames.indexOf('B97'));
    });

    it('places the semantic root LAST when the new indicator is adjectival (;;B86)', () => {
      const partNames = resolvedHeadParts('B291;B97/C;;B86');
      expect(partNames.indexOf('B86')).toBeLessThan(partNames.indexOf('B97'));
    });

    it('places the abstract semantic root LAST when the new indicator is verbal', () => {
      const partNames = resolvedHeadParts('B291;B6436/C;;B81');
      expect(partNames.indexOf('B81')).toBeLessThan(partNames.indexOf('B6436'));
    });

    it('orders B81 before the preserved B97 on the head glyph in a real-world multi-glyph input', () => {
      // B368 is excluded (MANY), so B428 at index 1 is the head glyph carrying B97;
      // ;;B81 (verbal) must place B81 before B97.
      const headParts = resolvedHeadParts('B368/B428;B97/B232/B391;;B81');
      expect(headParts).toContain('B428');
      expect(headParts).toContain('B81');
      expect(headParts).toContain('B97');
      expect(headParts.indexOf('B81')).toBeLessThan(headParts.indexOf('B97'));
    });
  });
});
