import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the ;; (double-semicolon) DSL contract after R14: a word-level
 * indicator is stored as a reversible OVERLAY on the group
 * (`group.wordIndicators = { codes, stripSemantic }`) with the base glyphs
 * left unbaked. The overlay is merged onto the contract-resolved head glyph
 * at render (and serialize), never at parse, so it round-trips and clears.
 *
 * Separator recap:
 *   /  = character separator (character-level)
 *   // = word separator (word-level)
 *   ;  = indicator separator (character-level: attaches to preceding character)
 *   ;; = word-level indicator (stored as a group overlay; resolves to the head)
 *
 * Covers:
 * - Store shape: codes list, stripSemantic flag, empty overlay, and base
 *   glyphs staying unbaked (no indicator baked into any glyph's parts).
 * - Head targeting at render via explicit ^ marker, modifier-exclusion
 *   fallback, and the index-0 default (which carries no isHeadGlyph flag).
 * - Multiple indicators resolving onto the head in one overlay.
 * - Non-indicator codes filtered at resolve (render unchanged), with an
 *   existing grammatical indicator dropped and a semantic root preserved.
 * - Single-character ;; storing an overlay (kept reversible).
 * - Positioning and glyph-level options surviving alongside the overlay.
 * - Pre-defined words: ;; stores an overlay and renders identically to the
 *   single-; bake (render parity, not tree parity, since ; still bakes).
 * - The ; (character-level) vs ;; (word-level) target distinction.
 * - Overlay scoping to its own word group in a multi-word sentence.
 * - Degenerate inputs (no base, two-glyph default).
 * - Scope fence: single ; on a pre-defined word still bakes (no overlay).
 *
 * Does NOT cover:
 * - The semantic-root placement/preservation rules, see
 *   `BlissParser.semantic-preservation.test.js`.
 * - Head-glyph algorithm internals, see `BlissParser.head-glyph.test.js`
 *   and `BlissParser.head-glyph-exclusions.test.js`.
 * - The single-; WORD;INDICATORS bake path, see
 *   `BlissParser.word-indicators.test.js`.
 * - toString/toJSON re-emission and round-trip, see
 *   `BlissSVGBuilder.indicator-round-trip.test.js`.
 */

describe('BlissParser ;; syntax', () => {

  // Snapshot built-in definition keys so afterAll strips exactly the
  // test-only definitions registered below, with no key list to maintain.
  const builtInDefinitionKeys = new Set(Object.keys(blissElementDefinitions));

  beforeAll(() => {
    blissElementDefinitions['TestWord1'] = {
      codeString: 'H^/C',
      glyphCode: 'TestWord1',
      isBlissGlyph: true
    };
    blissElementDefinitions['TestWord3'] = {
      codeString: 'B486/H',  // modifier, NO explicit marker - tests fallback heuristics
      glyphCode: 'TestWord3',
      isBlissGlyph: true
    };
  });

  afterAll(() => {
    for (const code of Object.keys(blissElementDefinitions)) {
      if (!builtInDefinitionKeys.has(code)) delete blissElementDefinitions[code];
    }
  });

  // Stored overlay on the first group.
  const overlay = (dsl) => BlissParser.parse(dsl).groups[0].wordIndicators;
  // Per-glyph base part codes from the parse tree (unbaked, reliable for all
  // glyph kinds, unlike the snapshot which omits children for some shapes).
  const baseGlyphParts = (dsl) =>
    BlissParser.parse(dsl).groups[0].glyphs.map(g => g.parts.map(p => p.codeName));
  // The resolved head glyph (the one carrying an indicator after the overlay
  // merge at render): its index and its part codes.
  const resolvedHead = (dsl) => {
    const glyphs = new BlissSVGBuilder(dsl).snapshot().children[0].children.filter(c => c.isGlyph);
    const index = glyphs.findIndex(g => g.children?.some(p => p.isIndicator));
    return { index, parts: index === -1 ? [] : glyphs[index].children.map(p => p.codeName) };
  };
  const svgEq = (a, b) => new BlissSVGBuilder(a).svgCode === new BlissSVGBuilder(b).svgCode;

  describe('when ;; stores a word-level overlay on the group', () => {
    it('stores the indicator codes and leaves the base glyphs unbaked', () => {
      expect(overlay('B291/B291^/B291;;B86')).toEqual({ codes: ['B86'], stripSemantic: false });
      // No glyph's parts carry the overlay code; the head is base-only.
      expect(baseGlyphParts('B291/B291^/B291;;B86')).toEqual([['B291'], ['B291'], ['B291']]);
    });

    it('stores an overlay on a single-character base (kept reversible)', () => {
      expect(overlay('B291;;B86')).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(baseGlyphParts('B291;;B86')).toEqual([['B291']]);
    });

    it('stores multiple indicator codes in one overlay', () => {
      expect(overlay('B291/B291^/B291;;B86;B97')).toEqual({ codes: ['B86', 'B97'], stripSemantic: false });
    });

    it('stores an empty overlay for a bare ;;, retaining the base semantic', () => {
      expect(overlay('B291;B97;;')).toEqual({ codes: [], stripSemantic: false });
      expect(baseGlyphParts('B291;B97;;')).toEqual([['B291', 'B97']]);
    });

    it('sets stripSemantic for ;;! and retains the base semantic for reversal', () => {
      expect(overlay('B291;B97;;!B81')).toEqual({ codes: ['B81'], stripSemantic: true });
      // The base keeps B97 so clearing the overlay restores it.
      expect(baseGlyphParts('B291;B97;;!B81')).toEqual([['B291', 'B97']]);
    });
  });

  describe('when the overlay resolves onto the head at render', () => {
    it('targets the glyph marked with ^', () => {
      const head = resolvedHead('B291/B291^/B291;;B86');
      expect(head.index).toBe(1);
      expect(head.parts).toEqual(['B291', 'B86']);
    });

    it('targets the first non-excluded glyph via fallback heuristics', () => {
      // B486 is a modifier exclusion, so B291 at index 1 is the head.
      const head = resolvedHead('B486/B291;;B86');
      expect(head.index).toBe(1);
      expect(head.parts).toEqual(['B291', 'B86']);
      expect(BlissParser.parse('B486/B291;;B86').groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('defaults to the first glyph with no isHeadGlyph flag', () => {
      const head = resolvedHead('B291/B291/B291;;B86');
      expect(head.index).toBe(0);
      // The targetIndex > 0 guard leaves the default head unmarked.
      expect(BlissParser.parse('B291/B291/B291;;B86').groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
    });

    it('resolves multiple indicators onto the head together', () => {
      const head = resolvedHead('B291/B291^/B291;;B86;B97');
      expect(head.index).toBe(1);
      expect(head.parts).toEqual(['B291', 'B86', 'B97']);
    });

    it('resolves multiple indicators onto a single-glyph head', () => {
      expect(resolvedHead('B291;;B81;B82').parts).toEqual(['B291', 'B81', 'B82']);
    });
  });

  describe('when ;; supplies only non-indicators', () => {
    it('filters them out at resolve, leaving the render unchanged', () => {
      // C8 is a shape, not an indicator; it stores but renders as nothing.
      expect(overlay('H/C;;C8')).toEqual({ codes: ['C8'], stripSemantic: false });
      expect(svgEq('H/C;;C8', 'H/C')).toBe(true);
    });

    it('drops an existing grammatical indicator from the head at resolve', () => {
      // B81 lives in the base; the empty-effect overlay clears it at render.
      expect(baseGlyphParts('B291;B81/C;;C8')[0]).toEqual(['B291', 'B81']);
      expect(svgEq('B291;B81/C;;C8', 'B291/C')).toBe(true);
    });

    it('preserves an existing semantic root on the head at resolve', () => {
      expect(svgEq('B291;B97/C;;C8', 'B291;B97/C')).toBe(true);
    });
  });

  describe('when ;; combines with positioning and glyph options', () => {
    it('preserves glyph positioning while resolving the overlay onto the head', () => {
      const head = resolvedHead('B291/B291:2,3^/B291;;B86');
      expect(head.index).toBe(1);
      expect(head.parts).toEqual(['B291', 'B86']);
    });

    it('keeps glyph-level options on the first glyph alongside the overlay', () => {
      const parsed = BlissParser.parse('[color=red]B291/B291^/B291;;B86');
      expect(parsed.groups[0].glyphs[0].options.color).toBe('red');
      expect(parsed.groups[0].wordIndicators).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });

  describe('when ;; is used on a pre-defined word', () => {
    it('stores an overlay and resolves onto the designated head', () => {
      // TestWord1 = 'H^/C': H is the designated head.
      expect(overlay('TestWord1;;B86')).toEqual({ codes: ['B86'], stripSemantic: false });
      const head = resolvedHead('TestWord1;;B86');
      expect(head.index).toBe(0);
      expect(head.parts).toEqual(['H', 'B86']);
    });

    it('renders identically to the single-; bake (render parity, not tree parity)', () => {
      // Single ; still bakes (scope fence); ;; overlays. Same render.
      expect(svgEq('TestWord1;;B86', 'TestWord1;B86')).toBe(true);
    });
  });

  describe('when comparing inline ;; to a pre-defined word with the same expansion', () => {
    it('renders inline H^/C;;B86 identically to TestWord1;;B86', () => {
      expect(svgEq('H^/C;;B86', 'TestWord1;;B86')).toBe(true);
    });

    it('applies modifier-skip heuristics on inline B486/H;;B86 like TestWord3;B86', () => {
      expect(svgEq('B486/H;;B86', 'TestWord3;B86')).toBe(true);
    });
  });

  describe('when distinguishing ; from ;;', () => {
    it('attaches ; to the last character (character-level), not the head', () => {
      // ;B86 bakes onto the last glyph (character-level), not the ^-marked head.
      expect(baseGlyphParts('B291/B291^/B291;B86')).toEqual([['B291'], ['B291'], ['B291', 'B86']]);
      expect(BlissParser.parse('B291/B291^/B291;B86').groups[0].wordIndicators).toBeUndefined();
    });

    it('stores ;; as a word-level overlay resolving to the marked head', () => {
      expect(overlay('B291/B291^/B291;;B86')).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(resolvedHead('B291/B291^/B291;;B86').index).toBe(1);
    });
  });

  describe('when the inline expression has complex modifier patterns', () => {
    it('resolves the overlay onto the head past a multi-glyph modifier pattern', () => {
      // B1060/B578/B303 is a modifier pattern; B291 at index 3 is the head.
      const head = resolvedHead('B1060/B578/B303/B291;;B86');
      expect(head.index).toBe(3);
      expect(head.parts).toEqual(['B291', 'B86']);
    });

    it('respects an explicit ^ marker over the exclusion heuristics', () => {
      // B486 is normally excluded, but ^ marks it as the head. Its base
      // identity is untouched (overlay does not bake), so glyphCode stays.
      const parsed = BlissParser.parse('B486^/B291;;B86');
      expect(parsed.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(parsed.groups[0].glyphs[0].glyphCode).toBe('B486');
      const head = resolvedHead('B486^/B291;;B86');
      expect(head.index).toBe(0);
      expect(head.parts).toEqual(['B486', 'B86']);
    });
  });

  describe('when ;; is used in a multi-word sentence', () => {
    it('scopes the overlay to its own word group', () => {
      const parsed = BlissParser.parse('B291//B291/B291^/B291;;B86//B291');
      expect(parsed.groups.length).toBe(5); // word, space, word, space, word
      expect(parsed.groups[2].wordIndicators).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(parsed.groups[0].wordIndicators).toBeUndefined();
      expect(parsed.groups[4].wordIndicators).toBeUndefined();
      expect(resolvedHead('B291//B291/B291^/B291;;B86//B291' )).toBeDefined();
    });
  });

  describe('when the input is degenerate or two-glyph', () => {
    it('defaults the overlay to the first glyph in a two-glyph word', () => {
      expect(overlay('B291/B291;;B86')).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(resolvedHead('B291/B291;;B86').index).toBe(0);
    });

    it('does not crash on ;;B86 with no preceding base', () => {
      const result = BlissParser.parse(';;B86');
      expect(result).toBeDefined();
    });

    it('attaches a single non-default indicator (B81) when only one follows ;;', () => {
      expect(overlay('B291/B291;;B81')).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(resolvedHead('B291/B291;;B81').parts).toEqual(['B291', 'B81']);
    });
  });

  describe('when ;; is malformed (a glyph follows the indicators, or ;; repeats)', () => {
    // A word-level indicator list must be the trailing part of a word. When a
    // `/`-separated glyph follows the indicators, or a second `;;` appears, the
    // parser warns MALFORMED_WORD_INDICATOR and falls back to a character-level
    // (`;`) reading so nothing is dropped and no null part leaks into the tree.
    const warningCodes = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);
    const allParts = (dsl) =>
      BlissParser.parse(dsl).groups.flatMap((g) => g.glyphs ?? []).flatMap((g) => g.parts ?? []);
    const allCodeNames = (dsl) => allParts(dsl).map((p) => p.codeName);

    it('warns and drops nothing when a glyph follows the indicators (B313;;B81/B431)', () => {
      expect(warningCodes('B313;;B81/B431')).toContain('MALFORMED_WORD_INDICATOR');
      expect(allCodeNames('B313;;B81/B431')).toEqual(expect.arrayContaining(['B313', 'B81', 'B431']));
      expect(allParts('B313;;B81/B431').every((p) => p != null)).toBe(true);
    });

    it('warns and produces no null part for a repeated ;; (B313;;B84;;B97)', () => {
      expect(warningCodes('B313;;B84;;B97')).toContain('MALFORMED_WORD_INDICATOR');
      expect(allCodeNames('B313;;B84;;B97')).toEqual(expect.arrayContaining(['B313', 'B84', 'B97']));
      expect(allParts('B313;;B84;;B97').every((p) => p != null)).toBe(true);
    });

    it('warns and does not leak ;; for non-trailing + repeated (B313;;B81/B431;;B86)', () => {
      expect(warningCodes('B313;;B81/B431;;B86')).toContain('MALFORMED_WORD_INDICATOR');
      expect(allCodeNames('B313;;B81/B431;;B86')).toEqual(expect.arrayContaining(['B313', 'B81', 'B431', 'B86']));
      expect(allParts('B313;;B81/B431;;B86').every((p) => p != null)).toBe(true);
    });

    it('does not warn for a well-formed trailing ;; (B313/B1103;;B81)', () => {
      expect(warningCodes('B313/B1103;;B81')).not.toContain('MALFORMED_WORD_INDICATOR');
    });

    it('parses a malformed ;; identically to its character-level (;) collapse', () => {
      // The fallback must equal a fresh parse of the collapsed string, including
      // head crowning (B486 is excluded, so the collapse crowns index 1), so the
      // malformed reading is a faithful character-level one.
      const malformed = BlissParser.parse('B486/B291;;B81/B431');
      const collapsed = BlissParser.parse('B486/B291;B81/B431');
      delete malformed._parseWarnings;
      expect(malformed).toEqual(collapsed);
    });
  });

  describe('scope fence: single ; on a pre-defined word still bakes', () => {
    it('bakes the indicator onto the head with no overlay (TestWord1;B86)', () => {
      // The single-; WORD;INDICATORS path is out of R14 scope and unchanged.
      const parsed = BlissParser.parse('TestWord1;B86');
      expect(parsed.groups[0].wordIndicators).toBeUndefined();
      expect(parsed.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['H', 'B86']);
    });
  });
});
