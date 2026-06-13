import { describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins WORD;INDICATOR DSL syntax: indicator attachment to the head glyph
 * after a pre-defined word (or character) is expanded.
 *
 * Covers:
 * - Basic ;-attachment to a head glyph across word expansion (TestWord1;B86).
 * - Modifier-skipping fallback heuristics when the word has no explicit ^ marker.
 * - Alias-chain resolution (1-level, 3-level, 4-level).
 * - Indicator removal (WORD;) and replacement (WORD;NEW_IND).
 * - Semantic-indicator preservation rules (semantic stays last; grammatic replaceable).
 * - Word-definition-carries-indicators behavior across ;X / ; / ;! inputs:
 *   add-with-semantic-preserve, invalid-indicator no-op, empty-; strip
 *   non-semantic, empty-; preserve semantic, ;! strip even semantic.
 * - Composite-indicator structure preservation (B914 = B928;B86:3,0).
 * - Multi-word sentence context.
 * - Single-glyph character distinction from word-level behavior under ; / ;! /
 *   ;X-not-an-indicator inputs.
 * - Edge cases: undefined word code, empty base, glyph-level options.
 *
 * Does NOT cover:
 * - The ;; (double-semicolon) syntax on inline expressions, see
 *   `BlissParser.double-semicolon.test.js`.
 * - Head-glyph algorithm internals, see `BlissParser.head-glyph.test.js` and
 *   `BlissParser.head-glyph-exclusions.test.js`.
 * - Semantic-indicator ordering rules in isolation, see
 *   `BlissParser.semantic-preservation.test.js`.
 * - Rendered SVG output for indicator attachment, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

describe('BlissParser word-indicator syntax', () => {

  const partCodes = glyph => glyph.parts.map(part => part.codeName);

  beforeAll(() => {
    // Add test word definitions
    // These simulate real Bliss words for testing
    blissElementDefinitions['TestWord1'] = {
      codeString: 'H^/C',
      glyphCode: 'TestWord1',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWord2'] = {
      codeString: 'H/C^/E',
      glyphCode: 'TestWord2',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWord3'] = {
      codeString: 'B486/H',  // Uses modifier, NO explicit marker - tests fallback heuristics
      glyphCode: 'TestWord3',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWordMultiModifier'] = {
      codeString: 'B1060/B578/B303/H',  // Multi-glyph modifier pattern, no marker
      glyphCode: 'TestWordMultiModifier',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWordWithIndicator'] = {
      codeString: 'H/C;B81^',  // Already has indicator (B81 = real indicator)
      glyphCode: 'TestWordWithIndicator',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestAlias'] = {
      codeString: 'TestWord1',
      glyphCode: 'TestAlias',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestChar'] = {
      codeString: 'H;S2',  // Character (no slash), S2 is NOT an indicator
      glyphCode: 'TestChar',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWordDoubleModifier'] = {
      codeString: 'B486/B486/H',  // Two B486 modifiers in sequence
      glyphCode: 'TestWordDoubleModifier',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWordModifierWithMarker'] = {
      codeString: 'B486^/H',  // Explicit marker on modifier
      glyphCode: 'TestWordModifierWithMarker',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWordCombineMarkerWithModifier'] = {
      codeString: 'B233/B1060/B578/B303/H',
      glyphCode: 'TestWordCombineMarkerWithModifier',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestDeepAlias1'] = {
      codeString: 'TestAlias',  // → TestAlias → TestWord1 → 'H^/C'
      glyphCode: 'TestDeepAlias1',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestDeepAlias2'] = {
      codeString: 'TestDeepAlias1',  // 4 levels deep
      glyphCode: 'TestDeepAlias2',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestCharWithIndicator'] = {
      codeString: 'B291;B97',  // B291 with thing indicator (B97 is a real indicator)
      glyphCode: 'TestCharWithIndicator',
      isBlissGlyph: true
    };

    // Composite indicators (indicators composed of other indicators)
    // Simulates the B914 = B928;B86:3,0 nested structure
    blissElementDefinitions['TestCompositeInd1'] = {
      codeString: 'C3;C5:1.5,0',
      isIndicator: true,
      glyphCode: 'TestCompositeInd1',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestCompositeInd2'] = {
      codeString: 'C3;C5:1.5,0',
      isIndicator: true,
      glyphCode: 'TestCompositeInd2',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestCompositeInd3'] = {
      codeString: 'TestCompositeInd2;E:3,0',
      isIndicator: true,
      glyphCode: 'TestCompositeInd3',
      isBlissGlyph: true
    };

    blissElementDefinitions['_C15B_WORD_SEMANTIC'] = {
      codeString: 'B486/B291;B97/B313',
      glyphCode: '_C15B_WORD_SEMANTIC',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C15B_WORD_NONSEM'] = { codeString: 'B486/B291;B81/B313' };
    blissElementDefinitions['_C15B_SINGLE_WITH_SEMANTIC'] = {
      codeString: 'B291;B97',
      glyphCode: '_C15B_SINGLE_WITH_SEMANTIC',
      isBlissGlyph: true
    };

  });

  describe('when applying ; to a pre-defined word with explicit ^ marker', () => {
    it('attaches a single indicator to the head glyph', () => {
      const result = BlissParser.parse('TestWord1;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // First glyph (H) should have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);

      // Second glyph (C) should not have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('attaches multiple indicators to the head glyph', () => {
      const result = BlissParser.parse('TestWord1;B86;B99');

      expect(result.groups[0].glyphs.length).toBe(2);

      // First glyph (H) should have both indicators
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[0].parts[2].codeName).toBe('B99');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
    });

    it('attaches the indicator to a middle head glyph when ^ is mid-word', () => {
      const result = BlissParser.parse('TestWord2;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // Middle glyph (C) should have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);

      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);

      expect(result.groups[0].glyphs[2].parts[0].codeName).toBe('E');
      expect(result.groups[0].glyphs[2].parts.length).toBe(1);
    });
  });

  describe('when the word definition contains modifier glyphs (fallback heuristics)', () => {
    it('skips a single modifier (B486) and attaches the indicator to the next glyph', () => {
      const result = BlissParser.parse('TestWord3;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // First glyph (B486) should not have indicator - it's a modifier
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B486');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
      // B486 has no indicator parts
      expect(result.groups[0].glyphs[0].parts.every(p => p.codeName !== 'B86')).toBe(true);

      // Second glyph (H) should have indicator attached via fallback heuristics
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B86');
      // Parser sets isHeadGlyph for non-default fallback (index > 0)
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('skips a multi-glyph modifier pattern and attaches the indicator after it', () => {
      const result = BlissParser.parse('TestWordMultiModifier;B86');

      expect(result.groups[0].glyphs.length).toBe(4);

      // First 3 glyphs (B1060/B578/B303) form a modifier pattern - no indicator
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B1060');
      expect(result.groups[0].glyphs[1].glyphCode).toBe('B578');
      expect(result.groups[0].glyphs[2].glyphCode).toBe('B303');

      // Fourth glyph (H) should have indicator and isHeadGlyph (fallback index > 0)
      expect(result.groups[0].glyphs[3].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[3].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[3].isHeadGlyph).toBe(true);
    });

    it('skips multiple B486 modifiers in sequence', () => {
      const result = BlissParser.parse('TestWordDoubleModifier;B86');

      expect(result.groups[0].glyphs.length).toBe(3);

      // First two glyphs (B486/B486) are modifiers - no indicator
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B486');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[1].glyphCode).toBe('B486');
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBeUndefined();

      // Third glyph (H) should have indicator and isHeadGlyph
      expect(result.groups[0].glyphs[2].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[2].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[2].isHeadGlyph).toBe(true);
    });

    it('honors an explicit ^ marker on a modifier (overrides fallback)', () => {
      const result = BlissParser.parse('TestWordModifierWithMarker;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // First glyph (B486) has explicit ^ marker - should be head and get indicator
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B486');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts.some(p => p.codeName === 'B86')).toBe(true);

      // Second glyph (H) should NOT have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('skips combine marker (B233) and modifier pattern sequentially', () => {
      const result = BlissParser.parse('TestWordCombineMarkerWithModifier;B86');

      expect(result.groups[0].glyphs.length).toBe(5);

      // First glyph (B233) is a combine marker - no indicator
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B233');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();

      // Next three glyphs (B1060/B578/B303) form a modifier pattern - no indicator
      expect(result.groups[0].glyphs[1].glyphCode).toBe('B1060');
      expect(result.groups[0].glyphs[2].glyphCode).toBe('B578');
      expect(result.groups[0].glyphs[3].glyphCode).toBe('B303');

      // Fifth glyph (H) should have indicator and isHeadGlyph (fallback index > 0)
      expect(result.groups[0].glyphs[4].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[4].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[4].isHeadGlyph).toBe(true);
    });
  });

  describe('when the word is an alias chain', () => {
    it('expands a one-level alias and attaches the indicator to the head glyph', () => {
      const result = BlissParser.parse('TestAlias;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // TestAlias → TestWord1 → H^/C
      // Indicator should attach to H
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);

      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('resolves a 3-level alias chain and attaches the indicator', () => {
      // TestDeepAlias1 → TestAlias → TestWord1 → 'H^/C'
      const result = BlissParser.parse('TestDeepAlias1;B86');

      expect(result.groups[0].glyphs.length).toBe(2);

      // H (head glyph) should have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);

      // C should not have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('resolves a 4-level alias chain and attaches the indicator', () => {
      // TestDeepAlias2 → TestDeepAlias1 → TestAlias → TestWord1 → 'H^/C'
      const result = BlissParser.parse('TestDeepAlias2;B86');

      expect(result.groups[0].glyphs.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });
  });

  describe('when ; is used with no following indicator', () => {
    it('removes existing indicators from the expanded word', () => {
      const result = BlissParser.parse('TestWordWithIndicator;');

      expect(result.groups[0].glyphs.length).toBe(2);

      // First glyph (H) should not have indicator
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);

      // Second glyph (C) should not have indicator
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });
  });

  describe('when ; replaces existing indicators', () => {
    it('replaces an existing indicator with a new one', () => {
      const result = BlissParser.parse('TestWordWithIndicator;B99');

      expect(result.groups[0].glyphs.length).toBe(2);

      // Second glyph (C) should have new indicator (not B86)
      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts[1].codeName).toBe('B99');
      expect(result.groups[0].glyphs[1].parts.length).toBe(2);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('preserves a semantic indicator when replacing with a verbal (semantic stays last)', () => {
      // TestCharWithIndicator has codeString 'B291;B97' (B97 is a semantic indicator)
      // Using ;B81 (verbal) should preserve B97 but place it AFTER B81
      const result = BlissParser.parse('TestCharWithIndicator;B81');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(3);
      // B291 (base), B81 (verbal, first), B97 (preserved semantic, last)
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B81');
      expect(result.groups[0].glyphs[0].parts[1].isIndicator).toBe(true);
      expect(result.groups[0].glyphs[0].parts[2].codeName).toBe('B97');
      expect(result.groups[0].glyphs[0].parts[2].isIndicator).toBe(true);
    });

    it('preserves a semantic indicator when stripping grammatic with empty indicator', () => {
      // TestCharWithIndicator has codeString 'B291;B97'
      // Using ; should strip grammatic indicators but preserve B97 (semantic)
      const result = BlissParser.parse('TestCharWithIndicator;');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      // B291 (base) and B97 (semantic, preserved)
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B97');
    });

    it('does not replace when the new part is not a real indicator', () => {
      // TestChar has codeString 'H;S2' (S2 is NOT a real indicator)
      // Using ;E should ADD E, not replace S2, because E is not an indicator
      const result = BlissParser.parse('TestChar;E');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      // Original behavior: TestChar wrapper with E as sibling
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('TestChar');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('E');
    });

    it('preserves a semantic indicator when replacing with verbal + options (semantic stays last)', () => {
      // TestCharWithIndicator has codeString 'B291;B97'
      // Using ;[color=red]>B81 (verbal) should preserve B97 but place it AFTER B81
      const result = BlissParser.parse('TestCharWithIndicator;[color=red]>B81');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(3);
      // B291 (base), B81 (verbal with options, first), B97 (preserved semantic, last)
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B81');
      expect(result.groups[0].glyphs[0].parts[1].isIndicator).toBe(true);
      expect(result.groups[0].glyphs[0].parts[1].options.color).toBe('red');
      expect(result.groups[0].glyphs[0].parts[2].codeName).toBe('B97');
      expect(result.groups[0].glyphs[0].parts[2].isIndicator).toBe(true);
    });
  });

  describe('when the word definition already carries indicators', () => {
    it('preserves the semantic root when a non-semantic indicator is added to a word head', () => {
      const r = BlissParser.parse('_C15B_WORD_SEMANTIC;B81');
      const glyphs = r.groups[0].glyphs;

      expect(partCodes(glyphs[1])).toEqual(['B291', 'B81', 'B97']);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('leaves the existing word indicators unchanged when the provided indicator is not a real indicator', () => {
      const r = BlissParser.parse('_C15B_WORD_NONSEM;C8');
      const head = r.groups[0].glyphs[1];

      expect(partCodes(head)).toEqual(['B291', 'B81']);
    });

    it('strips non-semantic indicators from the word head on empty ;', () => {
      const r = BlissParser.parse('_C15B_WORD_NONSEM;');
      const head = r.groups[0].glyphs[1];

      expect(partCodes(head)).toEqual(['B291']);
      expect(head.isHeadGlyph).toBe(true);
    });

    it('preserves the semantic root on empty ;', () => {
      const preserved = BlissParser.parse('_C15B_WORD_SEMANTIC;');

      expect(partCodes(preserved.groups[0].glyphs[1])).toEqual(['B291', 'B97']);
    });

    it('strips even the semantic root with the ;! marker', () => {
      const stripped = BlissParser.parse('_C15B_WORD_SEMANTIC;!');

      expect(partCodes(stripped.groups[0].glyphs[1])).toEqual(['B291']);
    });
  });

  describe('when the indicator is itself a composite (indicator-of-indicators)', () => {
    // These tests verify that composite indicators like B914 (B928;B86:3,0)
    // preserve their internal structure when expanded standalone

    it('preserves all parts when a composite indicator is used standalone', () => {
      // TestCompositeInd1 has codeString 'C3;C5:1.5,0'
      // Both C3 and C5 should be present (C5 should NOT replace anything)
      const result = BlissParser.parse('TestCompositeInd1');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('C3');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('C5');
      expect(result.groups[0].glyphs[0].parts[1].x).toBe(1.5);
      expect(result.groups[0].glyphs[0].parts[1].y).toBe(0);
    });

    it('preserves a nested composite indicator structure', () => {
      // TestCompositeInd3 has codeString 'TestCompositeInd2;E:3,0'
      // TestCompositeInd2 has codeString 'C3;C5:1.5,0'
      // All three parts should be present: C3, C5 (at 1.5,0), E (at 3,0)
      const result = BlissParser.parse('TestCompositeInd3');

      expect(result.groups[0].glyphs.length).toBe(1);
      const parts = result.groups[0].glyphs[0].parts;
      // Should have TestCompositeInd2 expanded (with C3 and C5) plus E
      expect(parts.length).toBe(2);
      // First part is TestCompositeInd2 which contains C3 and C5
      expect(parts[0].codeName).toBe('TestCompositeInd2');
      expect(parts[0].parts.length).toBe(2);
      expect(parts[0].parts[0].codeName).toBe('C3');
      expect(parts[0].parts[1].codeName).toBe('C5');
      // Second part is E at position 3,0
      expect(parts[1].codeName).toBe('E');
      expect(parts[1].x).toBe(3);
      expect(parts[1].y).toBe(0);
    });

    it('preserves the composite indicator when used as an indicator on a character', () => {
      // B291;TestCompositeInd1 should have B291 with the full composite indicator
      const result = BlissParser.parse('B291;TestCompositeInd1');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      // The indicator part should be TestCompositeInd1 with its full structure
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('TestCompositeInd1');
      expect(result.groups[0].glyphs[0].parts[1].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[1].parts[0].codeName).toBe('C3');
      expect(result.groups[0].glyphs[0].parts[1].parts[1].codeName).toBe('C5');
    });

    it('preserves real B914 (B928;B86:3,0) structure when standalone', () => {
      // B914 = B928;B86:3,0
      // B928 = B92;B87:1.5,0
      // When B914 is standalone, B928 should keep BOTH B92 and B87
      const result = BlissParser.parse('B914');

      expect(result.groups[0].glyphs.length).toBe(1);
      const parts = result.groups[0].glyphs[0].parts;
      expect(parts.length).toBe(1);
      // B914 wraps its composition
      expect(parts[0].codeName).toBe('B914');
      expect(parts[0].parts.length).toBe(2);
      // First sub-part should be B928 with its full structure (B92 + B87)
      expect(parts[0].parts[0].codeName).toBe('B928');
      expect(parts[0].parts[0].parts.length).toBe(2);
      expect(parts[0].parts[0].parts[0].codeName).toBe('B92');
      expect(parts[0].parts[0].parts[1].codeName).toBe('B87');
      // Second sub-part should be B86 at position 3,0
      expect(parts[0].parts[1].codeName).toBe('B86');
      expect(parts[0].parts[1].x).toBe(3);
      expect(parts[0].parts[1].y).toBe(0);
    });

    it('preserves real B914 structure when used as an indicator on a character', () => {
      // B291;B914 should have B291 with the full B914 indicator
      const result = BlissParser.parse('B291;B914');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
      // B914 should have its full structure preserved
      const b914 = result.groups[0].glyphs[0].parts[1];
      expect(b914.codeName).toBe('B914');
      expect(b914.parts.length).toBe(2);
      // B928 with B92 and B87
      expect(b914.parts[0].codeName).toBe('B928');
      expect(b914.parts[0].parts[0].codeName).toBe('B92');
      expect(b914.parts[0].parts[1].codeName).toBe('B87');
      // B86 at position 3,0
      expect(b914.parts[1].codeName).toBe('B86');
    });

    it('renders B914 and B928;B86:3,0 to byte-identical SVG output', () => {
      // Character reference and expanded code should render identically
      const svg1 = new BlissSVGBuilder('B914').composition.getSvgContent();
      const svg2 = new BlissSVGBuilder('B928;B86:3,0').composition.getSvgContent();
      expect(svg1).toBe(svg2);
    });

    it('renders B291;B914 and B291;B928;B86 to byte-identical SVG output', () => {
      // Indicator on character: reference vs expanded code should render identically
      const svg1 = new BlissSVGBuilder('B291;B914').composition.getSvgContent();
      const svg2 = new BlissSVGBuilder('B291;B928;B86').composition.getSvgContent();
      expect(svg1).toBe(svg2);
    });
  });

  describe('when applying ; to a single character (not a word)', () => {
    it('attaches the indicator directly to the character', () => {
      const result = BlissParser.parse('H;B86');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });

    it('expands a character definition and adds the indicator as a sibling part', () => {
      const result = BlissParser.parse('TestChar;E');

      // Character (TestChar) stays as outer code, with nested parts for expansion
      // Indicator (E) is a separate part
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('TestChar');
      expect(result.groups[0].glyphs[0].parts[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[0].parts[1].codeName).toBe('S2');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('E');
    });

    it('leaves a single-glyph character with replaceable indicators intact when ; is not provided', () => {
      const unchanged = BlissParser.parse('_C15B_SINGLE_WITH_SEMANTIC');

      expect(partCodes(unchanged.groups[0].glyphs[0])).toEqual(['B291', 'B97']);
    });

    it('strips a single-glyph character\'s indicators with the ;! marker', () => {
      const stripped = BlissParser.parse('_C15B_SINGLE_WITH_SEMANTIC;!');

      expect(partCodes(stripped.groups[0].glyphs[0])).toEqual(['B291']);
    });

    it('attaches a non-indicator as a sibling part on a single-glyph character', () => {
      const invalidIndicator = BlissParser.parse('_C15B_SINGLE_WITH_SEMANTIC;C8');

      expect(partCodes(invalidIndicator.groups[0].glyphs[0]))
        .toEqual(['_C15B_SINGLE_WITH_SEMANTIC', 'C8']);
    });
  });

  describe('when the word is parsed without indicators', () => {
    it('expands the word normally and marks the head glyph', () => {
      const result = BlissParser.parse('TestWord1');

      expect(result.groups[0].glyphs.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);

      expect(result.groups[0].glyphs[1].parts[0].codeName).toBe('C');
      expect(result.groups[0].glyphs[1].parts.length).toBe(1);
    });

    it('preserves the existing word indicators when ; is not provided at all', () => {
      const r = BlissParser.parse('_C15B_WORD_NONSEM');
      const head = r.groups[0].glyphs[1];

      expect(partCodes(head)).toEqual(['B291', 'B81']);
    });
  });

  describe('when the word appears in a multi-word sentence', () => {
    it('applies the indicator only within its enclosing word group', () => {
      const result = BlissParser.parse('H//TestWord1;B86//C');

      expect(result.groups.length).toBe(5);  // word, space, word, space, word

      // Second word group (TestWord1;B86)
      const wordGroup = result.groups[2];
      expect(wordGroup.glyphs.length).toBe(2);
      expect(wordGroup.glyphs[0].parts[1].codeName).toBe('B86');
      expect(wordGroup.glyphs[0].isHeadGlyph).toBe(true);
    });
  });

  describe('when the input is malformed or has options', () => {
    it('parses ;B86 with no preceding base as a glyph with undefined base and the indicator attached', () => {
      const result = BlissParser.parse(';B86');

      // Edge case - should not crash
      expect(result).toBeDefined();
      expect(result.groups.length).toBe(1);
      expect(result.groups[0].glyphs.length).toBe(1);
      // Empty base results in undefined code, indicator is B86
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBeUndefined();
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });

    it('attaches the indicator at character level when the code is not a defined word', () => {
      const result = BlissParser.parse('NonExistentWord;B86');

      // Should treat as character (no expansion), indicator attached
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('NonExistentWord');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });

    it('preserves glyph-level options when applying ; to a word', () => {
      const result = BlissParser.parse('[color=red]TestWord1;B86');

      expect(result.groups[0].glyphs.length).toBe(2);
      expect(result.groups[0].glyphs[0].options.color).toBe('red');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B86');
    });
  });

  // These tests use real Bliss word definitions from bliss-element-definitions.js
  // They are skipped because:
  // 1. The definitions may not have head glyph markers (^) yet
  // 2. The codeStrings need verification against official Blissymbolics data
  //
  // To enable: remove .skip and verify the expected structure matches the actual
  // definition. They serve as documentation of intended real-world usage patterns.
  describe('when applied to real Bliss codes (placeholders pending head-glyph markers)', () => {
    it.skip('attaches the indicator correctly on B5663;B81 (to confuse)', () => {
      // B5663 = confuse = B313/B783
      const result = BlissParser.parse('B5663;B81');

      expect(result.groups[0].glyphs.length).toBe(2);
      // B313 should have B81, B783 should not
    });

    it.skip('removes the description indicator on B1437; (cold)', () => {
      // B1437 = cold = B486/B378;B86
      const result = BlissParser.parse('B1437;');

      expect(result.groups[0].glyphs.length).toBe(2);
      // B378 should not have B86
    });

    it.skip('replaces the indicator on B1437;B81 (to heat)', () => {
      // B1437 = cold = B486/B378;B86
      const result = BlissParser.parse('B1437;B81');

      expect(result.groups[0].glyphs.length).toBe(2);
      // B378 should have B81, not B86
    });
  });
});
