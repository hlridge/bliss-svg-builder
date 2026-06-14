import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins ;; (double-semicolon) DSL syntax: word-level indicator attachment
 * applied to ad-hoc inline expressions, equivalent to expanding the inline
 * glyphs as a word and running the head-glyph algorithm.
 *
 * Single (/) vs double (//) separators recap:
 *   /  = character separator (character-level)
 *   // = word separator (word-level)
 *   ;  = indicator separator (character-level: attaches to preceding character)
 *   ;; = indicator separator (word-level: attaches to head glyph)
 *
 * Covers:
 * - Basic ;;-attachment via explicit ^ marker (B291/B291^/B291;;B86).
 * - Fallback heuristics on inline (modifier exclusion) when no marker is present.
 * - Default-to-first-glyph behaviour when no marker and no exclusions match.
 * - The `targetIndex > 0` guard that leaves the default-index head without an `isHeadGlyph` flag.
 * - Multiple indicators following ;;, including single-glyph inputs where the head/indicator `;` separators must be preserved.
 * - Filtering when ;; supplies only non-indicators: existing indicators drop, bareCode survives, and an existing semantic root is preserved on both multi-glyph and single-glyph inputs.
 * - Empty `;;` with an existing `bareCode;semanticRoot` shape preserves the semantic root.
 * - ;; with positioned glyphs and glyph-level options.
 * - Equivalence between inline ;; and a pre-defined word with ;.
 * - Distinction from ; (character-level fallback) on multi-character inputs.
 * - Edge cases: two-character word, single-character degenerate, empty base.
 *
 * Does NOT cover:
 * - The ; (single-semicolon) syntax on pre-defined words and characters, see
 *   `BlissParser.word-indicators.test.js`.
 * - Head-glyph algorithm internals, see `BlissParser.head-glyph.test.js`
 *   and `BlissParser.head-glyph-exclusions.test.js`.
 * - Rendered SVG output for word-level indicator attachment, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

describe('BlissParser ;; syntax', () => {

  // Snapshot built-in definition keys so afterAll strips exactly the
  // test-only definitions registered below, with no key list to maintain.
  const builtInDefinitionKeys = new Set(Object.keys(blissElementDefinitions));

  beforeAll(() => {
    // Pre-defined word fixtures used in the inline-vs-word equivalence tests
    blissElementDefinitions['TestWord1'] = {
      codeString: 'H^/C',
      glyphCode: 'TestWord1',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWord3'] = {
      codeString: 'B486/H',  // Uses modifier, NO explicit marker - tests fallback heuristics
      glyphCode: 'TestWord3',
      isBlissGlyph: true
    };
  });

  afterAll(() => {
    for (const code of Object.keys(blissElementDefinitions)) {
      if (!builtInDefinitionKeys.has(code)) delete blissElementDefinitions[code];
    }
  });

  describe('when ;; is used on a basic inline expression', () => {
    it('attaches the indicator to the head glyph using the ^ marker', () => {
      const result = BlissParser.parse('B291/B291^/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // First B291 should not have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);

      // Middle B291 (head glyph via ^) should have indicator
      // When indicator is attached, the character code is preserved
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);

      // Last B291 should not have indicator
      expect(result.groups[0].glyphs[2].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[2].parts.length).toBe(1);
    });

    it('attaches the indicator to the head glyph via fallback heuristics', () => {
      // B486 is in exclusion list, so head glyph should be B291
      const result = BlissParser.parse('B486/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // B486 (modifier) should not have indicator
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B486');
      expect(result.groups[0].glyphs[0].parts.every(p => p.codeName !== 'B86')).toBe(true);

      // B291 (head glyph via heuristics) should have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('defaults to the first glyph when no marker and no exclusions apply', () => {
      const result = BlissParser.parse('B291/B291/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // First B291 (default head) should have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      // No isHeadGlyph flag when using default (index 0)

      // Other B291s should not have indicator (expanded to S8)
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
      expect(result.groups[0].glyphs[2].parts.length).toBe(1);
    });

    it('does not set isHeadGlyph on the default-index head', () => {
      // No explicit ^ marker, no exclusions, so targetIndex falls back to 0.
      // The `targetIndex > 0` guard prevents marking the default head.
      // Mutations that widen the guard (always-true, >=0, ||) would set
      // glyphs[0].isHeadGlyph=true.
      const r = BlissParser.parse('H/C;;B81');
      expect(r.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
    });
  });

  describe('when ;; is followed by multiple indicators', () => {
    it('attaches all indicators to the head glyph', () => {
      const result = BlissParser.parse('B291/B291^/B291;;B86;B97');

      expect(result.groups[0].glyphs.length).toBe(3);

      // Middle B291 (head glyph) should have both indicators
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[1].parts[2].codeName).toBe('B97');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('separates the head from multiple new indicators with `;` on a single-glyph input', () => {
      // Single B291 with ;;B81;B82 (two real indicators). The single-glyph
      // attach line builds part = baseCode + ';' + newInds.join(';'). A
      // string mutation of either `;` literal would either lose the head/
      // first-indicator boundary ('B291B81;B82') or fuse the indicators
      // ('B291;B81B82'); both surface as a missing or merged codeName.
      const r = BlissParser.parse('B291;;B81;B82');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291', 'B81', 'B82']);
    });
  });

  describe('when ;; supplies only non-indicators', () => {
    it('reduces a multi-glyph head to bareCode when no semantic root exists', () => {
      // H/C with ;;C8 (C8 is a shape, not an indicator). Head is H (index 0,
      // default). No existing indicator on H, no semantic root. The outer-else
      // path assigns part = bareCode. A `newInds.length > 0` mutation (always
      // true / >= 0) would route through the inner-else and produce 'H;'
      // instead, surfacing as an extra empty part on the head glyph.
      const r = BlissParser.parse('H/C;;C8');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['H']);
    });

    it('drops a real existing indicator from a multi-glyph head', () => {
      // B291;B81 has real indicator B81 (non-semantic verb). With ;;C8, newInds
      // is empty, semanticRoot is null, so the outer-else assigns part='B291'
      // and B81 is dropped. A block-statement mutation that voids the else
      // would leave part='B291;B81' (B81 still attached).
      const r = BlissParser.parse('B291;B81/C;;C8');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291']);
    });

    it('preserves an existing semantic root on a multi-glyph head', () => {
      // B291;B97 has the semantic-thing indicator B97. With ;;C8, newInds is
      // empty, semanticRoot is preserved, so part stays 'B291;B97'. A string
      // mutation of the `;` separator in `bareCode + ';' + semanticRoot`
      // would collapse the parts to a single 'B291B97' codeName.
      const r = BlissParser.parse('B291;B97/C;;C8');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291', 'B97']);
    });

    it('drops an existing indicator on a single-glyph input', () => {
      // Single B291;B81 with ;;C8. newInds is empty, semanticRoot null, so
      // the inner-else (single-glyph "indicators non-empty but all filtered
      // out") assigns part='B291'. Three mutations diverge here:
      //   - `newInds.length > 0` always-true / >=0 routes through the
      //     inner-else to produce 'B291;'.
      //   - block-statement-empty on the inner-else leaves 'B291;B81'.
      const r = BlissParser.parse('B291;B81;;C8');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291']);
    });

    it('preserves an existing semantic root on a single-glyph input', () => {
      // Single B291;B97 (semantic) with ;;C8. The inner-else assigns
      // 'B291;B97'. A string mutation of the `;` separator in
      // `baseCode + ';' + semanticRoot` would collapse to 'B291B97'.
      const r = BlissParser.parse('B291;B97;;C8');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291', 'B97']);
    });
  });

  describe('when ;; is used on a single character', () => {
    it('degenerates to ; behavior', () => {
      // When only one glyph, ;; behaves like ;
      const result = BlissParser.parse('B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });
  });

  describe('when the inline expression has positioned glyphs', () => {
    it('attaches the indicator while preserving glyph positioning', () => {
      const result = BlissParser.parse('B291/B291:2,3^/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // Middle B291 with positioning should have indicator
      // Note: positioning is on the character, indicator attached to character code
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });
  });

  describe('when the inline expression has glyph-level options', () => {
    it('preserves the options on the first glyph and attaches the indicator to the head', () => {
      const result = BlissParser.parse('[color=red]B291/B291^/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // First glyph should have options
      expect(result.groups[0].glyphs[0].options.color).toBe('red');

      // Middle B291 (head glyph) should have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
    });
  });

  describe('when ;; is used on a pre-defined word', () => {
    it('attaches the indicator to the head glyph (same as single ;)', () => {
      // TestWord1 = 'H^/C', ;; should work the same as ; for pre-defined words
      const result = BlissParser.parse('TestWord1;;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // H (head glyph via ^) should have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);

      // C should not have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('produces the same result as single ; for a pre-defined word', () => {
      const resultSingle = BlissParser.parse('TestWord1;B86');
      const resultDouble = BlissParser.parse('TestWord1;;B86');

      // Both should produce identical structure
      expect(resultDouble.groups[0].glyphs.length).toBe(resultSingle.groups[0].glyphs.length);
      expect(resultDouble.groups[0].glyphs[0].parts[1].codeName).toBe(resultSingle.groups[0].glyphs[0].parts[1].codeName);
    });
  });

  describe('when comparing inline ;; to a pre-defined word with the same expansion', () => {
    it('parses inline H^/C;;B86 to the same shape as TestWord1;;B86', () => {
      // TestWord1 has codeString 'H^/C'
      const inlineResult = BlissParser.parse('H^/C;;B86');
      const wordResult = BlissParser.parse('TestWord1;;B86');

      // Both should have 2 glyphs
      expect(inlineResult.groups[0].glyphs.length).toBe(2);
      expect(wordResult.groups[0].glyphs.length).toBe(2);

      // H should have indicator in both
      expect(inlineResult.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(wordResult.groups[0].glyphs[0].parts[1].codeName).toBe('B86');

      // C should not have indicator in both
      expect(inlineResult.groups[0].glyphs[1].parts.length).toBe(1);
      expect(wordResult.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('applies modifier-skip heuristics on inline B486/H;;B86 the same as on TestWord3;B86', () => {
      // TestWord3 has codeString 'B486/H' (no explicit marker)
      const inlineResult = BlissParser.parse('B486/H;;B86');
      const wordResult = BlissParser.parse('TestWord3;B86');

      // Both should have 2 glyphs
      expect(inlineResult.groups[0].glyphs.length).toBe(2);
      expect(wordResult.groups[0].glyphs.length).toBe(2);

      // H should have indicator in both (B486 is excluded)
      expect(inlineResult.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(wordResult.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
    });
  });

  describe('when distinguishing ; from ;;', () => {
    it('attaches ; to the last character (character-level)', () => {
      const result = BlissParser.parse('B291/B291^/B291;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // B86 should be on last B291 (character-level), not middle B291 (head glyph)
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);
      expect(result.groups[0].glyphs[1].parts.length).toBe(1); // No indicator despite ^
      expect(result.groups[0].glyphs[2].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[2].parts[1].codeName).toBe('B86');
    });

    it('attaches ;; to the head glyph (word-level)', () => {
      const result = BlissParser.parse('B291/B291^/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // B86 should be on middle B291 (head glyph), not last B291
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[2].parts.length).toBe(1);
    });
  });

  describe('when the inline expression has complex modifier patterns', () => {
    it('handles a multi-glyph modifier pattern with ;;', () => {
      // B1060/B578/B303 is a multi-glyph modifier pattern ("looks similar to")
      const result = BlissParser.parse('B1060/B578/B303/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(4);

      // First 3 glyphs are modifiers, no indicator
      expect(result.groups[0].glyphs[0].parts.every(p => p.codeName !== 'B86')).toBe(true);
      expect(result.groups[0].glyphs[1].parts.every(p => p.codeName !== 'B86')).toBe(true);
      expect(result.groups[0].glyphs[2].parts.every(p => p.codeName !== 'B86')).toBe(true);

      // B291 (head glyph via heuristics) should have indicator
      expect(result.groups[0].glyphs[3].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[3].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[3].isHeadGlyph).toBe(true);
    });

    it('respects an explicit ^ marker over heuristics', () => {
      // Explicit ^ on B486 overrides exclusion list
      const result = BlissParser.parse('B486^/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // B486 (explicit ^ marker) should have indicator
      // ;; changes glyph identity; glyphCode is cleared since it's no longer just B486
      expect(result.groups[0].glyphs[0].glyphCode).toBeUndefined();
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts.some(p => p.codeName === 'B86')).toBe(true);

      // B291 should not have indicator
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });
  });

  describe('when ;; is used in a multi-word sentence', () => {
    it('applies the indicator only within its enclosing word group', () => {
      const result = BlissParser.parse('B291//B291/B291^/B291;;B86//B291');

      expect(result.groups.length).toBe(5); // word, space, word, space, word

      // Middle word (B291/B291^/B291;;B86)
      const wordGroup = result.groups[2];
      expect(wordGroup.glyphs.length).toBe(3);

      // Middle B291 (head glyph) should have indicator
      expect(wordGroup.glyphs[1].parts[0].codeName).toBe('B291');
      expect(wordGroup.glyphs[1].parts[1].codeName).toBe('B86');
      expect(wordGroup.glyphs[1].isHeadGlyph).toBe(true);
    });
  });

  describe('when ;; is empty (no new indicators follow)', () => {
    it('preserves the existing `bareCode;semanticRoot` shape', () => {
      // Single B291;B97 with empty ;;. indicators is falsy, semanticRoot is
      // 'B97', so the outer-else assigns part='B291;B97'. A string mutation
      // of the `;` separator on the single-glyph outer-else would emit
      // 'B291B97' as a single fused codeName. The multi-glyph counterpart is
      // already covered by BlissParser.semanticPreservation tests.
      const r = BlissParser.parse('B291;B97;;');
      const head = r.groups[0].glyphs[0];
      expect(head.parts.map(p => p.codeName)).toEqual(['B291', 'B97']);
    });
  });

  describe('when the input is a degenerate or two-glyph case', () => {
    it('attaches the indicator to the first glyph by default in a two-glyph inline word', () => {
      const result = BlissParser.parse('B291/B291;;B86');

      expect(result.groups[0].glyphs.length).toBe(2);
      // First B291 should be head (default)
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });

    it('does not crash on ;;B86 with no preceding base', () => {
      // Edge case: ;;IND with no base code
      const result = BlissParser.parse(';;B86');

      expect(result).toBeDefined();
      // Should not crash
    });

    it('attaches a single non-default indicator (B81) when only one follows ;;', () => {
      const result = BlissParser.parse('B291/B291;;B81');

      expect(result.groups[0].glyphs.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B81');
    });
  });
});
