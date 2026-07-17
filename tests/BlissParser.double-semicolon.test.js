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
 *   ;  = part separator (character-level: composes a part onto the preceding
 *        character; misplaced on a bare alias or multi-glyph word)
 *   ;; = word-level indicator (stored as a group overlay; resolves to the head)
 *
 * Covers:
 * - Store shape: codes list, stripSemantic flag, empty overlay, and base
 *   glyphs staying unbaked (no indicator baked into any glyph's parts).
 * - Head targeting at render via explicit ^ marker and the query-time
 *   fallback scan (modifier-exclusion and index-0 defaults; fallback heads
 *   carry no parser isHeadGlyph flag, resolved at render instead).
 * - Multiple indicators resolving onto the head in one overlay.
 * - Non-indicator codes after ;; warned + dropped at parse (no overlay stored),
 *   leaving the base render unchanged; the dropped overlay does NOT clear the
 *   head's own indicators. (The warning contract lives in
 *   `BlissParser.word-indicator-validation.test.js`.)
 * - Single-character ;; storing an overlay (kept reversible).
 * - Positioning and glyph-level options surviving alongside the overlay.
 * - Pre-defined words: ;; stores an overlay; the single-; form is misplaced on
 *   a multi-glyph word, so the two now diverge.
 * - The ; (character-level) vs ;; (word-level) target distinction.
 * - Overlay scoping to its own word group in a multi-word sentence.
 * - Degenerate inputs (no base, two-glyph default).
 * - Single ; on a pre-defined multi-glyph word is misplaced (warn + drop, no
 *   overlay), not baked onto the head.
 * - Malformed ;; (a glyph follows the indicators, or ;; repeats) flagging the
 *   whole word at the PARSER (group.errorCode = MALFORMED_WORD_INDICATOR); the
 *   BUILDER then DROPS the failed word from render and both serializations,
 *   emitting exactly one warning and persisting no errorCode/errorSource
 *   (retention family, rows 31/80; retired the pre-2.1 errorSource round-trip).
 * - A ;; bound to a MULTI-WORD ALIAS (one token expanding past a word break)
 *   failing the whole unit (group.errorCode) instead of overlaying only the
 *   first word; uniform with the char-level `;` multi-word-alias fail in
 *   `BlissParser.word-indicators.test.js`.
 *
 * Does NOT cover:
 * - The semantic-root placement/preservation rules, see
 *   `BlissSVGBuilder.semantic-preservation.test.js`.
 * - Head-glyph algorithm internals, see `BlissParser.head-glyph.test.js`
 *   and `BlissParser.head-glyph-exclusions.test.js`.
 * - The single-; misplaced-on-a-word path in depth, see
 *   `BlissParser.word-indicators.test.js` and
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - The L1 fail-render mechanism itself (placeholder vs invisible, advance),
 *   see `BlissElement.error-placeholder.test.js`.
 * - WELL-FORMED ;; toString/toJSON re-emission and round-trip, see
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
      // R15 WS-4: the parser leaves a fallback head unstamped; the resolved
      // head above (index 1) is derived at query time, not from a parse stamp.
      expect(BlissParser.parse('B486/B291;;B86').groups[0].glyphs[1].isHeadGlyph).toBeUndefined();
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
    // Chunk 2 (rc.4): a ;; non-indicator is warned + DROPPED at parse, not
    // stored-and-filtered-at-render. The whole ;; construct is discarded (no
    // overlay stored), so the base renders exactly as written -- its own
    // character-level indicators are untouched. See
    // BlissParser.word-indicator-validation.test.js for the warning contract.
    const warningCodesFor = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);

    it('drops the non-indicator, stores no overlay, and leaves the render unchanged', () => {
      // C8 is a known shape, not an indicator; the ;; overlay is dropped.
      expect(overlay('H/C;;C8')).toBeUndefined();
      expect(warningCodesFor('H/C;;C8')).toContain('NON_INDICATOR_AS_WORD_INDICATOR');
      expect(svgEq('H/C;;C8', 'H/C')).toBe(true);
    });

    it('leaves an existing grammatical indicator on the head intact', () => {
      // The dropped overlay has no effect, so the base keeps its own B81 (the old
      // stored-empty-overlay behavior that cleared it at resolve is gone).
      expect(baseGlyphParts('B291;B81/C;;C8')[0]).toEqual(['B291', 'B81']);
      expect(svgEq('B291;B81/C;;C8', 'B291;B81/C')).toBe(true);
    });

    it('leaves an existing semantic root on the head intact', () => {
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

    it('diverges from the misplaced single-; (which renders the bare word)', () => {
      // Single ; on a multi-glyph word is MISPLACED: it drops and renders the
      // bare word. ;; overlays the indicator, so the two now diverge.
      expect(svgEq('TestWord1;B86', 'TestWord1')).toBe(true);
      expect(svgEq('TestWord1;;B86', 'TestWord1')).toBe(false);
    });
  });

  describe('when comparing inline ;; to a pre-defined word with the same expansion', () => {
    it('renders inline H^/C;;B86 identically to TestWord1;;B86', () => {
      expect(svgEq('H^/C;;B86', 'TestWord1;;B86')).toBe(true);
    });

    it('applies modifier-skip heuristics on inline B486/H;;B86 like TestWord3;;B86', () => {
      expect(svgEq('B486/H;;B86', 'TestWord3;;B86')).toBe(true);
    });
  });

  describe('when distinguishing ; from ;;', () => {
    it('attaches ; to the last character (character-level), not the head', () => {
      // Inline `;` is dumb part-composition on the LAST character, not on a word
      // unit: B291/.../B291;B86 appends B86 to the final glyph. This is NOT the
      // misplaced-on-an-alias case (an alias token like WORD;B86 is misplaced);
      // do not "fix" it to MISPLACED. The ^-marked head is unaffected.
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
    // A word-level indicator must be the TRAILING part of a word. When a
    // `/`-separated glyph follows the indicators (B313;;B81/B431), or a second
    // ;; appears (B313;;B84;;B97), the word is invalid: the PARSER flags the
    // whole GROUP (group.errorCode = MALFORMED_WORD_INDICATOR). The builder then
    // DROPS the failed word from render and both serializations (retention
    // family, rows 31/80), emitting exactly ONE MALFORMED_WORD_INDICATOR
    // warning. The drop supersedes the earlier fail-render-to-placeholder
    // behavior: a malformed word is not content, so error-placeholder shows
    // nothing for it (only retained unknown codes still get a placeholder).
    const warningCodes = (dsl) => new BlissSVGBuilder(dsl).warnings.map((w) => w.code);
    const flaggedGroup = (dsl) => BlissParser.parse(dsl).groups[0];

    it.each([
      'B313;;B81/B431',       // a glyph follows the indicators
      'B313;;B84;;B97',       // a second ;; repeats
      'B313;;B81/B431;;B86',  // non-trailing AND repeated
    ])('flags the whole word with group.errorCode at the parser for %s', (dsl) => {
      expect(flaggedGroup(dsl).errorCode).toBe('MALFORMED_WORD_INDICATOR');
      expect(flaggedGroup(dsl).errorSource).toBe(dsl);
    });

    it('emits exactly one MALFORMED_WORD_INDICATOR warning for the dropped word', () => {
      // The warning is re-emitted once by the drop normalizer as the only trace.
      const malformed = new BlissSVGBuilder('B313;;B84;;B97').warnings
        .filter((w) => w.code === 'MALFORMED_WORD_INDICATOR');
      expect(malformed).toHaveLength(1);
    });

    it('drops the failed word entirely even when error-placeholder is on', () => {
      // A malformed word is not content; error-placeholder shows nothing for it.
      const snap = new BlissSVGBuilder('[error-placeholder]||B313;;B81/B431').snapshot();
      expect(snap.children).toEqual([]);
    });

    it('drops the failed word with no children when error-placeholder is off', () => {
      const snap = new BlissSVGBuilder('B313;;B81/B431').snapshot();
      expect(snap.children).toEqual([]);
    });

    it('does not flag or warn for a well-formed trailing ;; (B313/B1103;;B81)', () => {
      expect(flaggedGroup('B313/B1103;;B81').errorCode).toBeUndefined();
      expect(warningCodes('B313/B1103;;B81')).not.toContain('MALFORMED_WORD_INDICATOR');
    });
  });

  describe('when a malformed-;; word is dropped through the builder', () => {
    // Retention family (rows 31/80): the builder drops a fail-flagged word from
    // BOTH serializations and persists no errorCode/errorSource. The parser
    // still produces the flag (asserted above); the builder never carries it
    // into toString/toJSON. This retired the pre-2.1 errorSource round-trip
    // pins (verbatim re-emit + toJSON flag fields), where the serializer
    // replayed non-valid DSL that re-flagged on reparse.
    it('drops the failed word from toString instead of replaying errorSource', () => {
      const builder = new BlissSVGBuilder('B313;;B81/B431');
      expect(builder.toString()).toBe('');
      // parse(toString(x)) is now clean: nothing to re-flag.
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
    });

    it('persists no errorCode or errorSource in toJSON', () => {
      const json = new BlissSVGBuilder('B313;;B84;;B97').toJSON();
      expect(json.groups).toEqual([]);
      expect(JSON.stringify(json)).not.toContain('errorCode');
      expect(JSON.stringify(json)).not.toContain('errorSource');
    });

    it('keeps one warning and the drop after a sibling-word mutation rebuilds', () => {
      const builder = new BlissSVGBuilder('B291//B313;;B81/B431');
      builder.addGroup('B208'); // mutates a sibling word, triggering a rebuild
      const malformed = builder.warnings.filter((w) => w.code === 'MALFORMED_WORD_INDICATOR');
      expect(malformed).toHaveLength(1); // not re-emitted per rebuild
      const str = builder.toString();
      expect(str).not.toContain('B313');
      expect(str).not.toContain('B431');
      expect(str).toContain('B208');
    });

    // regression: chunk-5a external review 2026-07-02 F4 (pre-existing) — the
    // malformed handler stored the PLACEHOLDERIZED string in its warning
    // source, so an option bracket surfaced as a literal [PLACEHOLDER_0] token.
    // The word now drops, but the warning source (from errorSource) must still
    // restore the option text, not leak a placeholder token.
    it('restores option text in the drop warning source, not a placeholder token', () => {
      blissElementDefinitions['PHWORDS'] = { codeString: 'B291//C8' };
      const builder = new BlissSVGBuilder('PHWORDS;;[color=red]>B81');
      expect(builder.toString()).toBe('');
      expect(builder.warnings[0].source).not.toContain('PLACEHOLDER');
      expect(builder.warnings[0].message).not.toContain('PLACEHOLDER');
    });
  });

  describe('when ;; is bound to a multi-word alias', () => {
    // A ;; word-level overlay also targets a single word. Bound to a multi-word
    // alias (one token expanding past a word break), it has no single head, so
    // the whole unit fails (group.errorCode = MALFORMED_WORD_INDICATOR) instead
    // of attaching the overlay to only the first word. Uniform with the
    // character-level (;) multi-word-alias fail in
    // BlissParser.word-indicators.test.js (Decision 6).
    const MULTIWORD_DEFS = {
      _MWSEMI_DIRECT: { codeString: 'B291//B313' },
      _MWSEMI_INNER: { codeString: 'B291//B303' },
      _MWSEMI_NESTED: { codeString: 'B208/_MWSEMI_INNER' },
      _MWSEMI_SINGLE: { codeString: 'B291/B313' },
    };
    beforeAll(() => BlissSVGBuilder.define(MULTIWORD_DEFS));
    afterAll(() => Object.keys(MULTIWORD_DEFS).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

    const flaggedGroup = (dsl) => BlissParser.parse(dsl).groups[0];

    it.each([
      '_MWSEMI_DIRECT;;B81',  // direct // codeString alias
      '_MWSEMI_NESTED;;B81',  // nested alias, // inside the referenced alias
    ])('flags the whole unit with group.errorCode for %s', (dsl) => {
      expect(flaggedGroup(dsl).errorCode).toBe('MALFORMED_WORD_INDICATOR');
      expect(flaggedGroup(dsl).errorSource).toBe(dsl);
    });

    it('stores no overlay on the failed unit', () => {
      // The overlay path is abandoned for the fail; no group.wordIndicators set.
      expect(flaggedGroup('_MWSEMI_DIRECT;;B81').wordIndicators).toBeUndefined();
    });

    it('drops the failed unit entirely even when error-placeholder is on', () => {
      const children = new BlissSVGBuilder('[error-placeholder]||_MWSEMI_DIRECT;;B81')
        .snapshot().children;
      expect(children).toEqual([]);
    });

    it('still overlays ;; on a single-word alias without failing', () => {
      // Control: _MWSEMI_SINGLE = 'B291/B313' is ONE word; ;; overlays its head.
      expect(flaggedGroup('_MWSEMI_SINGLE;;B81').errorCode).toBeUndefined();
      expect(overlay('_MWSEMI_SINGLE;;B81')).toEqual({ codes: ['B81'], stripSemantic: false });
    });
  });

  describe('single ; on a pre-defined multi-glyph word is misplaced', () => {
    it('warns MISPLACED, stores no overlay, and does not bake onto the head (TestWord1;B86)', () => {
      // TestWord1 = 'H^/C' is a multi-glyph word, so a char-level ;-part has no
      // single character to attach to: it is misplaced (warn + drop), the head
      // keeps only its base part, and no overlay is stored. Use ;; for a word
      // indicator.
      const parsed = BlissParser.parse('TestWord1;B86');
      expect(parsed.groups[0].wordIndicators).toBeUndefined();
      expect(parsed.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['H']);
      expect(new BlissSVGBuilder('TestWord1;B86').warnings.map(w => w.code))
        .toContain('MISPLACED_CHARACTER_INDICATOR');
    });
  });

  describe('when a ;; overlay indicator carries a part-level option', () => {
    it('stores the restored option in the overlay codes, not a placeholder token', () => {
      // regression: SIB-2 (serializer-fidelity external review 2026-07-01).
      // Options are placeholder-substituted early (`[color=red]` -> `[PLACEHOLDER_n]`);
      // the ;; overlay stored the code with the placeholder unrestored, so the
      // option never applied on resolve. The overlay must restore it.
      expect(overlay('H;;[color=red]>B81').codes).toEqual(['[color=red]>B81']);
    });

    it('keeps a multi-key option (internal ;) intact by restoring after the split', () => {
      // pins split-before-restore: the ; inside the option is protected by the
      // placeholder, so the code list must be split before the option is restored
      // (restoring first would split the option on its internal ;).
      expect(overlay('H;;[color=red;stroke-width=2]>B81').codes).toEqual(['[color=red;stroke-width=2]>B81']);
    });

    it('restores the option on every code when the overlay carries more than one', () => {
      // SIB-2U (review follow-up): restoration maps over the whole code list, so a
      // second option-bearing indicator must also come back; a "restore only the
      // first code" mutant would leave the second placeholder unrestored.
      expect(overlay('H;;[color=red]>B81;[color=blue]>B97').codes)
        .toEqual(['[color=red]>B81', '[color=blue]>B97']);
    });

    it('applies the option on the resolved head indicator through a round-trip', () => {
      const b = new BlissSVGBuilder('H');
      b.group(0).applyIndicators('[color=red]>B81');
      const rebuilt = new BlissSVGBuilder(b.toString());
      expect(rebuilt.svgCode).toContain('stroke="red"');
    });
  });
});
