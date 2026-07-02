import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins how a character-level `;` and a word-level `;;` interact with a
 * pre-defined word (or alias chain) after Strict Indicator Separation.
 *
 * A character-level `;` is dumb part-composition on a SINGLE character, so on a
 * multi-character word, an alias (a word unit), or a multi-word `//` alias it is
 * MISPLACED: the parser warns MISPLACED_CHARACTER_INDICATOR, drops the part, and
 * still renders the base as defined (the head keeps any baked indicator). Word-
 * level head resolution (modifier-skip fallback, explicit `^`, multi-part head
 * re-join, alias-chain expansion) is exercised through `;;`, whose overlay
 * resolves onto the head at render.
 *
 * Covers:
 * - Character `;` on a multi-character word / alias chain / word that already
 *   carries a baked indicator: MISPLACED + drop + render-as-defined, with the
 *   head's baked indicator preserved.
 * - Trailing `;` on a word: inert (no strip, no warning, baked indicator kept).
 * - Word `;;` resolving onto the head across modifier patterns, an explicit `^`
 *   marker, a multi-primitive-part head (re-joined with `;`, not fused), and a
 *   multi-word sentence scope.
 * - Legitimate single-character dumb append (`H;B86`, `TestChar;E`).
 * - Character `;` on a multi-word `//` alias: MISPLACED + render every word
 *   (Decision D1), with the explicit-`//` and trailing-`;` controls intact.
 * - Composite indicator (indicator-of-indicators) structure preservation.
 *
 * Does NOT cover:
 * - The core dumb-`;` / MISPLACED contract in isolation (glyph vs bare alias),
 *   see `BlissParser.strict-indicator-separation.test.js`.
 * - The `;;` overlay store shape and resolve rules, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - Head-glyph algorithm internals, see `BlissParser.head-glyph.test.js` and
 *   `BlissParser.head-glyph-exclusions.test.js`.
 * - Semantic-indicator ordering rules in isolation, see
 *   `BlissSVGBuilder.semantic-preservation.test.js`.
 * - Rendered SVG output, see `BlissSVGBuilder.VisualRegression.e2e.test.js`.
 */

describe('BlissParser word-indicator syntax', () => {

  const partCodes = glyph => glyph.parts.map(part => part.codeName);
  const warningCodes = dsl => new BlissSVGBuilder(dsl).warnings.map(w => w.code);
  // The ;; overlay resolves onto the head at render; report its index and part
  // codes (mirrors the helper in BlissParser.double-semicolon.test.js).
  const resolvedHead = dsl => {
    const glyphs = new BlissSVGBuilder(dsl).snapshot().children[0].children.filter(c => c.isGlyph);
    const index = glyphs.findIndex(g => g.children?.some(p => p.isIndicator));
    return { index, parts: index === -1 ? [] : glyphs[index].children.map(p => p.codeName) };
  };

  // Snapshot built-in definition keys so afterAll strips exactly the
  // test-only definitions registered below, with no key list to maintain.
  const builtInDefinitionKeys = new Set(Object.keys(blissElementDefinitions));

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

    // Word whose marked head is a bare alias resolving to a TWO-primitive-part
    // base (no glyphCode), to exercise the multi-part head re-join on reattach.
    blissElementDefinitions['_MultiPartBase'] = { codeString: 'S8:0,8;VL4:0,0' };
    blissElementDefinitions['_WordMultiPartHead'] = {
      codeString: 'B291/_MultiPartBase^',
      glyphCode: '_WordMultiPartHead',
      isBlissGlyph: true
    };

  });

  afterAll(() => {
    for (const code of Object.keys(blissElementDefinitions)) {
      if (!builtInDefinitionKeys.has(code)) delete blissElementDefinitions[code];
    }
  });

  describe('when a character ; targets a multi-character word', () => {
    it('drops the misplaced part and renders the word with its head designation', () => {
      const result = BlissParser.parse('TestWord1;B86');

      expect(warningCodes('TestWord1;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      // The head ^ designation survives; the misplaced B86 is dropped.
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
    });

    it('drops multiple misplaced ;-parts together', () => {
      const result = BlissParser.parse('TestWord1;B86;B99');

      expect(warningCodes('TestWord1;B86;B99')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
    });

    it('drops the misplaced part on a mid-word head, rendering every glyph', () => {
      const result = BlissParser.parse('TestWord2;B86');

      expect(warningCodes('TestWord2;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(partCodes(result.groups[0].glyphs[2])).toEqual(['E']);
    });
  });

  describe('when a word-level ;; resolves onto a multi-primitive-part head', () => {
    // _WordMultiPartHead = B291/_MultiPartBase^ where _MultiPartBase resolves to
    // 'S8:0,8;VL4:0,0': the marked head is a base of TWO primitive parts and no
    // glyphCode. Merging the ;; overlay onto it must re-join those base parts
    // with ';' so S8 and VL4 stay separate, not fused into one malformed token.
    it('re-joins the multi-part base with ; when the overlay merges at render', () => {
      // pins that the ;; overlay resolves onto a multi-primitive-part head
      // without fusing its base: S8 and VL4 stay separate parts. Re-homed from
      // the removed char-`;` reattach; a base-fusing mutation gives 'S8:0,8VL4'.
      expect(resolvedHead('_WordMultiPartHead;;B81').parts).toEqual(['S8', 'VL4', 'B81']);
    });

    it('emits no MALFORMED_COORDINATES warning for the re-joined base', () => {
      expect(warningCodes('_WordMultiPartHead;;B81')).not.toContain('MALFORMED_COORDINATES');
    });
  });

  describe('when a word-level ;; resolves past modifier glyphs (fallback heuristics)', () => {
    it('skips a single modifier (B486) and resolves onto the next glyph', () => {
      // R15 WS-4 / Strict Indicator Separation: the parser leaves a fallback
      // head unstamped; the ;; overlay resolves onto it at query time.
      const parsed = BlissParser.parse('TestWord3;;B86');
      expect(parsed.groups[0].glyphs[0].glyphCode).toBe('B486');
      expect(parsed.groups[0].glyphs[1].isHeadGlyph).toBeUndefined();

      const head = resolvedHead('TestWord3;;B86');
      expect(head.index).toBe(1);
      expect(head.parts).toEqual(['H', 'B86']);
    });

    it('skips a multi-glyph modifier pattern and resolves after it', () => {
      const parsed = BlissParser.parse('TestWordMultiModifier;;B86');
      expect(parsed.groups[0].glyphs.map(g => g.glyphCode)).toEqual(['B1060', 'B578', 'B303', undefined]);

      const head = resolvedHead('TestWordMultiModifier;;B86');
      expect(head.index).toBe(3);
      expect(head.parts).toEqual(['H', 'B86']);
    });

    it('skips multiple B486 modifiers in sequence', () => {
      const head = resolvedHead('TestWordDoubleModifier;;B86');
      expect(head.index).toBe(2);
      expect(head.parts).toEqual(['H', 'B86']);
    });

    it('honors an explicit ^ marker on a modifier (overrides fallback)', () => {
      // B486^ is the marked head even though B486 is normally a modifier.
      expect(BlissParser.parse('TestWordModifierWithMarker;;B86').groups[0].glyphs[0].isHeadGlyph).toBe(true);

      const head = resolvedHead('TestWordModifierWithMarker;;B86');
      expect(head.index).toBe(0);
      expect(head.parts).toEqual(['B486', 'B86']);
    });

    it('skips a combine marker (B233) and modifier pattern sequentially', () => {
      const head = resolvedHead('TestWordCombineMarkerWithModifier;;B86');
      expect(head.index).toBe(4);
      expect(head.parts).toEqual(['H', 'B86']);
    });
  });

  describe('when a character ; targets an alias chain', () => {
    it('expands a one-level alias and drops the misplaced part', () => {
      // TestAlias -> TestWord1 -> H^/C: the alias resolves, then the misplaced
      // character indicator drops, leaving the word rendered as defined.
      const result = BlissParser.parse('TestAlias;B86');

      expect(warningCodes('TestAlias;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
    });

    it('resolves a 3-level alias chain and drops the misplaced part', () => {
      // TestDeepAlias1 -> TestAlias -> TestWord1 -> 'H^/C'
      const result = BlissParser.parse('TestDeepAlias1;B86');

      expect(warningCodes('TestDeepAlias1;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
    });

    it('resolves a 4-level alias chain and drops the misplaced part', () => {
      // TestDeepAlias2 -> TestDeepAlias1 -> TestAlias -> TestWord1 -> 'H^/C'
      const result = BlissParser.parse('TestDeepAlias2;B86');

      expect(warningCodes('TestDeepAlias2;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C']);
    });
  });

  describe('when a trailing ; carries no part on a word', () => {
    it('keeps the head baked indicator (inert, not a strip)', () => {
      // TestWordWithIndicator = 'H/C;B81^': trailing ; is inert under Strict
      // Indicator Separation, so the head's baked B81 survives (stripping is
      // now API-only via clearIndicators).
      const result = BlissParser.parse('TestWordWithIndicator;');

      expect(warningCodes('TestWordWithIndicator;')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C', 'B81']);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('keeps a grammatical head indicator inert (no strip)', () => {
      // _C15B_WORD_NONSEM = 'B486/B291;B81/B313': B81 stays on the head.
      expect(partCodes(BlissParser.parse('_C15B_WORD_NONSEM;').groups[0].glyphs[1])).toEqual(['B291', 'B81']);
    });

    it('keeps a semantic head indicator inert (no strip)', () => {
      // _C15B_WORD_SEMANTIC = 'B486/B291;B97/B313': B97 stays on the head.
      expect(partCodes(BlissParser.parse('_C15B_WORD_SEMANTIC;').groups[0].glyphs[1])).toEqual(['B291', 'B97']);
    });
  });

  describe('when a character ; targets a word that already carries a baked indicator', () => {
    it('drops the misplaced part and preserves the head baked indicator', () => {
      // TestWordWithIndicator = 'H/C;B81^': the misplaced B99 drops; B81 stays.
      const result = BlissParser.parse('TestWordWithIndicator;B99');

      expect(warningCodes('TestWordWithIndicator;B99')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
      expect(partCodes(result.groups[0].glyphs[1])).toEqual(['C', 'B81']);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('preserves a baked semantic root when dropping the misplaced part', () => {
      // _C15B_WORD_SEMANTIC: B97 (semantic) stays on the head; B81 is dropped.
      expect(warningCodes('_C15B_WORD_SEMANTIC;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(BlissParser.parse('_C15B_WORD_SEMANTIC;B81').groups[0].glyphs[1])).toEqual(['B291', 'B97']);
    });

    it('treats a non-indicator ;-part as misplaced too, preserving the baked indicator', () => {
      // _C15B_WORD_NONSEM: C8 is not an indicator, but any ;-part on a word is
      // misplaced; the baked B81 survives.
      expect(warningCodes('_C15B_WORD_NONSEM;C8')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(partCodes(BlissParser.parse('_C15B_WORD_NONSEM;C8').groups[0].glyphs[1])).toEqual(['B291', 'B81']);
    });

    it('drops a ;!-part on a word as misplaced only, never validating it (D3)', () => {
      // The ;-part is dropped before its content is checked, so only MISPLACED
      // fires, never UNKNOWN_CODE; the baked semantic B97 survives.
      expect(warningCodes('_C15B_WORD_SEMANTIC;!')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(warningCodes('_C15B_WORD_SEMANTIC;!')).not.toContain('UNKNOWN_CODE');
      expect(partCodes(BlissParser.parse('_C15B_WORD_SEMANTIC;!').groups[0].glyphs[1])).toEqual(['B291', 'B97']);
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

  describe('when ; appends to a single character', () => {
    it('appends the indicator directly to a literal character', () => {
      const result = BlissParser.parse('H;B86');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H', 'B86']);
    });

    it('expands a glyph definition and appends the part as a sibling', () => {
      // TestChar = 'H;S2' is a real glyph (S2 is not an indicator), so ; dumb-
      // appends E alongside the expanded base. A glyph never bakes an indicator,
      // so dumb ; never meets a baked semantic; see
      // BlissParser.strict-indicator-separation.test.js.
      const result = BlissParser.parse('TestChar;E');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(2);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('TestChar');
      expect(result.groups[0].glyphs[0].parts[0].parts[0].codeName).toBe('H');
      expect(result.groups[0].glyphs[0].parts[0].parts[1].codeName).toBe('S2');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('E');
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
    it('drops the misplaced part within its enclosing word group only', () => {
      const result = BlissParser.parse('H//TestWord1;B86//C');

      expect(warningCodes('H//TestWord1;B86//C')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(result.groups.length).toBe(5);  // word, space, word, space, word

      // The TestWord1 group renders as defined (head H, then C); B86 is dropped.
      const wordGroup = result.groups[2];
      expect(partCodes(wordGroup.glyphs[0])).toEqual(['H']);
      expect(wordGroup.glyphs[0].isHeadGlyph).toBe(true);
      expect(partCodes(wordGroup.glyphs[1])).toEqual(['C']);
    });
  });

  describe('when the input is malformed or has options', () => {
    it('parses ;B86 with no preceding base as an indicator-only glyph', () => {
      const result = BlissParser.parse(';B86');

      // R15 contract change (Decision Log #2): a leading ';' (empty base) is
      // inert and yields an indicator-only glyph, NOT a glyph with an undefined
      // failed base part. Previously parts[0].codeName was undefined and an
      // UNKNOWN_CODE warning fired. See BlissSVGBuilder.baseless-indicator.test.js
      // for the no-warning render contract.
      expect(result).toBeDefined();
      expect(result.groups.length).toBe(1);
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B86');
    });

    it('appends the part to an unknown bare code as a single character', () => {
      // An undefined code is a single (unknown) character, so ; dumb-appends.
      const result = BlissParser.parse('NonExistentWord;B86');

      expect(result.groups[0].glyphs.length).toBe(1);
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['NonExistentWord', 'B86']);
    });

    it('drops both the glyph-level option and the misplaced part on a word', () => {
      // retargeted: rc.4 option-placement gate (B4) — the char option on a
      // word alias is MISPLACED (warn + drop), no longer kept on the first
      // character. See BlissParser.option-placement.test.js.
      const result = BlissParser.parse('[color=red]TestWord1;B86');

      expect(warningCodes('[color=red]TestWord1;B86')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(warningCodes('[color=red]TestWord1;B86')).toContain('MISPLACED_CHARACTER_OPTION');
      expect(result.groups[0].glyphs[0].options).toBeUndefined();
      expect(partCodes(result.groups[0].glyphs[0])).toEqual(['H']);
    });
  });

  describe('when a character ; targets a multi-word (//) alias', () => {
    // A // alias is ONE token that expands to valid multi-word content. A dumb
    // character `;`-part has no single character to attach to, so per Decision
    // D1 it is MISPLACED: warn + drop + render every word (NOT the legacy
    // whole-unit MALFORMED_WORD_INDICATOR fail). The `;;` word-level facet is a
    // genuine word binding with no single head, so it still fails the unit; that
    // is pinned in BlissParser.double-semicolon.test.js.
    const MULTIWORD_DEFS = {
      _MWORD_DIRECT: { codeString: 'B291//B313' },        // // directly in the codeString
      _MWORD_INNER: { codeString: 'B291//B303' },
      _MWORD_NESTED: { codeString: 'B208/_MWORD_INNER' },  // // lives in a referenced alias
      _MWORD_SINGLE: { codeString: 'B291/B313' },          // one word (single /), control
    };
    beforeAll(() => BlissSVGBuilder.define(MULTIWORD_DEFS));
    afterAll(() => Object.keys(MULTIWORD_DEFS).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

    const parsedGroups = (dsl) => BlissParser.parse(dsl).groups;
    const groupChildren = (dsl) => new BlissSVGBuilder(dsl).snapshot().children;

    it.each([
      '_MWORD_DIRECT;B81',  // direct // codeString alias
      '_MWORD_NESTED;B81',  // nested alias, // inside the referenced alias
    ])('warns MISPLACED and never flags the unit for %s', (dsl) => {
      expect(warningCodes(dsl)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(parsedGroups(dsl).every((g) => g.errorCode === undefined)).toBe(true);
    });

    it('renders every word of the alias, with no collapse to a failed unit', () => {
      // The alias renders as 3 groups (word, space, word); the misplaced ;-part
      // is dropped and never collapses the unit.
      expect(groupChildren('_MWORD_DIRECT;B81')).toHaveLength(3);
      expect(new BlissSVGBuilder('_MWORD_DIRECT;B81').toString()).toBe('B291//B313');
    });

    it('emits exactly one MISPLACED_CHARACTER_INDICATOR warning for the unit', () => {
      const misplaced = new BlissSVGBuilder('_MWORD_NESTED;B81').warnings
        .filter((w) => w.code === 'MISPLACED_CHARACTER_INDICATOR');
      expect(misplaced).toHaveLength(1);
    });

    it('renders the words normally even with error-placeholder on', () => {
      // Nothing fails, so error-placeholder has nothing to placehold: 3 groups.
      const children = groupChildren('[error-placeholder]||_MWORD_DIRECT;B81');
      expect(children).toHaveLength(3);
      children.forEach((c) => expect(c.children).toHaveLength(1));
    });

    it('drops the misplaced part from toString, leaving a stable round-trip', () => {
      const builder = new BlissSVGBuilder('_MWORD_DIRECT;B81');
      expect(builder.toString()).toBe('B291//B313');
      expect(BlissParser.parse(builder.toString()).groups.every((g) => g.errorCode === undefined)).toBe(true);
    });

    it('drops the misplaced part on a single-word alias too', () => {
      // _MWORD_SINGLE = 'B291/B313' is ONE word; the ;-part is misplaced on it
      // and dropped (a word has no single character to take the part).
      expect(warningCodes('_MWORD_SINGLE;B81')).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(parsedGroups('_MWORD_SINGLE;B81')[0].errorCode).toBeUndefined();
      expect(partCodes(parsedGroups('_MWORD_SINGLE;B81')[0].glyphs[0])).toEqual(['B291']);
    });

    it('appends to the second word of an explicit // sentence without warning', () => {
      // Control: explicit DSL // splits into word groups BEFORE alias expansion,
      // so ;B81 dumb-appends onto the single character B313, never misplaced.
      const parsed = BlissParser.parse('B291//B313;B81');
      expect(warningCodes('B291//B313;B81')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(parsed.groups.every((g) => g.errorCode === undefined)).toBe(true);
      expect(partCodes(parsed.groups[2].glyphs[0])).toEqual(['B313', 'B81']);
    });

    it('keeps a trailing ; inert on a multi-word alias (no warning)', () => {
      // A trailing `;` has no part, so it is inert, never misplaced.
      expect(warningCodes('_MWORD_DIRECT;')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(parsedGroups('_MWORD_DIRECT;')[0].errorCode).toBeUndefined();
    });

    it('does not warn for a multi-word-alias indicator embedded in a definition', () => {
      // Scope boundary: MISPLACED is for a USER-written ;-part (isTopLevel). An
      // alias whose codeString embeds `<multi-word>;<indicator>` is an internal
      // expansion and is not re-flagged.
      BlissSVGBuilder.define({ _MWORD_WRAPS: { codeString: '_MWORD_DIRECT;B81' } });
      try {
        expect(warningCodes('_MWORD_WRAPS')).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      } finally {
        BlissSVGBuilder.removeDefinition('_MWORD_WRAPS');
      }
    });

    it('emits exactly the one misplaced warning for an alias with markers in two words', () => {
      // A // alias whose word-strings each carry a `^` head marker still emits
      // only MISPLACED_CHARACTER_INDICATOR; the per-word markers are sealed to
      // designations during expansion, so rendering the words adds no
      // MULTIPLE_HEAD_MARKERS.
      BlissSVGBuilder.define({ _MWORD_TWOMARK: { codeString: 'B291^//B303^' } });
      try {
        expect(warningCodes('_MWORD_TWOMARK;B81')).toEqual(['MISPLACED_CHARACTER_INDICATOR']);
      } finally {
        BlissSVGBuilder.removeDefinition('_MWORD_TWOMARK');
      }
    });
  });

});
