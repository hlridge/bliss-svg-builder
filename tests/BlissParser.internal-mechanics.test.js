import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the internal-mechanics behaviors of BlissParser that fall outside
 * the feature-cross-cutting sibling files: parsePartString grammar,
 * head-glyph detection mechanics, the WORD;INDICATORS (`;`) reattach-and-
 * strip code path through replaceWithDefinitionHelpers (getBaseCode /
 * getIndicatorParts), post-expand glyph object construction in
 * fromStringPostprocess, and the small public utility methods (parse
 * caller-options merge, expandParts defensive guards).
 *
 * Note: these getBaseCode / getIndicatorParts mechanics were previously
 * exercised through the `;;` bake path; after R14 (`;;` is a reversible
 * overlay, not a bake) they are reached only through the single-`;`
 * WORD;INDICATORS path, which still uses the same closures, so the inputs
 * here use `;`. The `;;`-only updateGlyphIdentity restore-after-strip
 * closure was removed with the bake; its tests are gone.
 *
 * Covers:
 * - parsePartString DSL-fragment parsing: option-bracket extraction with
 *   the default identity restoreFunction; the regex's leading-character-class
 *   anchor; multi-digit decimal x/y coordinates; the Invalid-format error
 *   path.
 * - Head-glyph detection during parse: tie-breaking at priority 0
 *   (absoluteNeverHead); single-char composite code resolution preferring
 *   the outer glyphCode over part-derived bareCodes.
 * - WORD;INDICATORS (`;`) reattach through replaceWithDefinitionHelpers:
 *   simple-shape glyphCode early return; position-independent base/indicator
 *   extraction on an inline-composite head (indicator-first and all-indicator
 *   heads, with an unknown-bareCode guard); the existing-indicator scan not
 *   double-counting an all-indicator head.
 * - Post-expand glyph construction in fromStringPostprocess: leading
 *   `_wordBreak` guard; empty-part filter; optional-property propagation
 *   (isIndicator, isExternalGlyph, kerningRules, isHeadGlyph); parseParts
 *   recursion at MAX_RECURSION_DEPTH (50).
 * - BlissParser.parse caller-options merging with parsed global options;
 *   BlissParser.expandParts defensive guards on inputs without groups.
 *
 * Does NOT cover:
 * - Bracket-options grammar, see `BlissParser.bracket-options.test.js`.
 * - Kerning marker grammar, see `BlissParser.kerning.test.js`.
 * - Implicit-space TSP/QSP resolution, see
 *   `BlissParser.space-resolution.test.js`.
 * - `;;` operator's user-facing semantics, see
 *   `BlissParser.double-semicolon.test.js`.
 * - Definition expansion algorithm and head-glyph fallback heuristics,
 *   see `BlissParser.definition-expansion.test.js`,
 *   `BlissParser.head-glyph.test.js`,
 *   `BlissParser.head-glyph-exclusions.test.js`.
 * - Word indicator replacement, see `BlissParser.word-indicators.test.js`.
 * - Semantic-indicator preservation, see
 *   `BlissParser.semantic-preservation.test.js`.
 * - `{text}` content preservation, see `BlissParser.text-labels.test.js`.
 * - X-code expansion, see `BlissParser.x-codes.test.js`.
 * - Input preamble (length guard, placeholder restoration), see
 *   `BlissParser.input-preamble.test.js`.
 *
 * @contract: parser-internal-mechanics
 */
describe('BlissParser', () => {
  beforeAll(() => {
    // Test-only definitions exercised by the head-glyph / ;;-strip /
    // identity-restoration scenarios below. Hoisted from the legacy
    // `BlissParser.replaceWithDefinitionHelpers (via parse)` outer, which
    // had no afterAll; the module-home-level beforeAll preserves that
    // read-only-fixtures-for-the-file lifecycle.

    // Single-char composite whose codeString contains a non-indicator part (S2).
    // Used to pin getBaseCode's simple-glyphCode early-return and updateGlyphIdentity.
    blissElementDefinitions['_C5_simple'] = {
      codeString: 'B291;S2',
      glyphCode: '_C5_simple',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_word'] = {
      codeString: '_C5_simple/H',
      glyphCode: '_C5_word',
      isBlissGlyph: true
    };

    // Single-char composite whose underlying is a head-glyph modifier (B486).
    // Used to pin getCode's `||` over `&&` (outer glyphCode wins, not part-derived).
    blissElementDefinitions['_C5_modifier'] = {
      codeString: 'B486',
      glyphCode: '_C5_modifier',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_word_with_modifier'] = {
      codeString: '_C5_modifier/H',
      glyphCode: '_C5_word_with_modifier',
      isBlissGlyph: true
    };

    // Inline composite (no glyphCode) whose first part is an indicator (B97 = thing).
    // Pins getBaseCode's position-independent base extraction: the base is the
    // non-indicator parts (C), not "keep index 0", so an indicator-first head reads base=C.
    blissElementDefinitions['_C5_inline_b97_c'] = {
      codeString: 'B97;C',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_word_inline'] = {
      codeString: '_C5_inline_b97_c/H',
      glyphCode: '_C5_word_inline',
      isBlissGlyph: true
    };

    // Inline composite where second part is an unknown bareCode.
    // Used to pin the `?.` optional-chaining in getBaseCode and getIndicatorParts.
    blissElementDefinitions['_C5_inline_b97_unk'] = {
      codeString: 'B97;__UNK__',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_word_inline_unk'] = {
      codeString: '_C5_inline_b97_unk/H',
      glyphCode: '_C5_word_inline_unk',
      isBlissGlyph: true
    };

    // Single-char composite where the unknown code sits AFTER a known head (B291).
    // Used to pin `?.` in getIndicatorParts via the simple-glyphCode head path.
    blissElementDefinitions['_C5_unknown_after'] = {
      codeString: 'B291;__UNKNOWN_CODE__',
      glyphCode: '_C5_unknown_after',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_unknown_word'] = {
      codeString: '_C5_unknown_after/H',
      glyphCode: '_C5_unknown_word',
      isBlissGlyph: true
    };

    // Multi-glyph word whose head bareCode is itself a real indicator (B97).
    // Pins getIndicatorParts' position-independent extraction: indicator parts are
    // selected by isIndicator (not by slice-after-index-0), and an all-indicator head is atomic.
    blissElementDefinitions['_C5_b97_word'] = {
      codeString: 'B97/H',
      glyphCode: '_C5_b97_word',
      isBlissGlyph: true
    };

    // Custom non-indicator def carrying a semanticIndicator flag.
    // Lets us verify that getIndicatorParts' `=== true` filter only admits real
    // indicators (not "isIndicator: undefined but semanticIndicator: thing" defs).
    blissElementDefinitions['_C5_fake_semantic'] = {
      codeString: 'B291',
      semanticIndicator: 'thing',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_inline_with_fake_sem'] = {
      codeString: 'B291;_C5_fake_semantic',
      glyphCode: '_C5_inline_with_fake_sem',
      isBlissGlyph: true
    };
    blissElementDefinitions['_C5_word_with_fake_sem'] = {
      codeString: '_C5_inline_with_fake_sem/H',
      glyphCode: '_C5_word_with_fake_sem',
      isBlissGlyph: true
    };
  });

  describe('when parsePartString receives a part with bracketed options', () => {
    it('parses options with default identity restoreFunction (no second arg)', () => {
      // Pin the default restoreFunction = (s) => s. Without it (e.g. mutated to
      // () => undefined), parseOptions would receive undefined and skip parsing.
      const part = BlissParser.parsePartString('[color=red]>B81');
      expect(part.options).toEqual({ color: 'red' });
      expect(part.codeName).toBe('B81');
    });
  });

  describe('when parsePartString accepts multi-digit decimal coordinates', () => {
    it('parses decimal x with multiple fraction digits', () => {
      // Pins that the x-position pattern accepts \.\d+ (one or more fraction
      // digits), not just \.\d (single digit) or \.\D+ (non-digits).
      const part = BlissParser.parsePartString('B81:.55,3');
      expect(part.codeName).toBe('B81');
      expect(part.x).toBe(0.55);
      expect(part.y).toBe(3);
    });

    it('parses decimal y with multiple fraction digits', () => {
      const part = BlissParser.parsePartString('B81:0,.55');
      expect(part.codeName).toBe('B81');
      expect(part.x).toBe(0);
      expect(part.y).toBe(0.55);
    });
  });

  describe('when parsePartString rejects input that does not match the code-string format', () => {
    it('rejects code with a leading non-class character (^ anchor)', () => {
      // Without the ^ anchor, the regex would search for the first matching
      // position and silently strip the leading '!', returning codeName='B81'.
      const part = BlissParser.parsePartString('!B81');
      expect(part.error).toBeDefined();
      expect(part.codeName).toBeUndefined();
    });

    it('sets Invalid format error with the offending codeString', () => {
      // Pins both that the error branch executes (else block kept) and that
      // the message wording is the documented contract.
      const part = BlissParser.parsePartString('!');
      expect(part.error).toBe('Invalid format: !');
    });
  });

  describe('when parse processes the `;` part-superimposition separator', () => {
    it('builds a single glyph with multiple parts joined by `;`', () => {
      const renderStructure = BlissParser.parse('HL2;HL4');
      expect(renderStructure).toEqual({ options: {}, groups: [{ glyphs: [{ parts: [{ codeName: 'HL2' }, { codeName: 'HL4' }] }] }] });
    });

    it('attaches a trailing position suffix to the part it follows, not earlier parts', () => {
      const renderStructure = BlissParser.parse('HL2;HL4:1,2');
      expect(renderStructure).toEqual({ options: {}, groups: [{ glyphs: [{ parts: [{ codeName: 'HL2' }, { codeName: 'HL4', x: 1, y: 2 }] }] }] });
    });
  });

  describe('when parse processes the `/` glyph separator within a group', () => {
    it('builds one group with multiple glyphs, each a single-part glyph', () => {
      const renderStructure = BlissParser.parse('HL2/HL4');
      expect(renderStructure).toEqual({ options: {}, groups: [{ glyphs: [{ parts: [{ codeName: 'HL2' }] }, { parts: [{ codeName: 'HL4' }] }] }] });
    });
  });

  describe('when parse encounters head-glyph candidate ties', () => {
    it('keeps first index as best when ties occur at priority 0 (absoluteNeverHead)', () => {
      // All-B233 input: every part is in absoluteNeverHead (priority 0). The
      // `priority > bestPriority` check (line 350) must use strict `>`; with
      // `>=` mutation, ties at priority 0 would update best to the last index,
      // marking the trailing B233 as head when it should stay default (index 0).
      const r = BlissParser.parse('B233/B233');
      expect(r.groups[0].glyphs.every(g => g.isHeadGlyph !== true)).toBe(true);
    });
  });

  describe('when parse evaluates a single-char composite during head detection', () => {
    it('uses outer glyphCode (not part-derived bareCode) for single-char composites', () => {
      // _C5_modifier wraps B486 (a modifier in blissHeadGlyphExclusions).
      // Outer glyphCode '_C5_modifier' wins for single-char composites; the
      // `||` in getCode prefers it. Mutating `||` to `&&` would derive code
      // from the part (`B486`), skip the wrapper as a modifier, and mark H
      // as head; observable as glyphs[1].isHeadGlyph === true.
      const r = BlissParser.parse('_C5_word_with_modifier');
      expect(r.groups[0].glyphs[1].isHeadGlyph).toBeUndefined();
    });
  });

  describe('when WORD; targets a simple-shape glyphCode composite', () => {
    it('returns the outer glyphCode (not part-derived) when ; reattaches indicators', () => {
      // _C5_simple has glyphCode '_C5_simple' (no `/` and no `;`), so
      // getBaseCode's simple-path returns it directly. After `;B86`, the
      // head's part becomes '_C5_simple;B86'. Mutations that disable the
      // simple-path send the call through the filter else-branch, returning
      // 'B291;S2', which then concatenates to 'B291;S2;B86' and decomposes
      // into a different parts list ([B291, S2, B86]) on the head glyph.
      const r = BlissParser.parse('_C5_word;B86');
      expect(r.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['_C5_simple', 'B86']);
    });
  });

  describe('when WORD; reattaches indicators on an inline-composite head', () => {
    it('reads an indicator-first head segment as a semantic indicator, not part of the base', () => {
      // _C5_inline_b97_c is an inline composite 'B97;C': B97 is an indicator,
      // C is the base. The position-independent getBaseCode / getIndicatorParts
      // (R15 3b-5, which replaced the old i===0 head-preserve guard) read the
      // base as the non-indicator part (C) and B97 as a semantic indicator, so
      // applying ;B86 stacks B86 and preserves the semantic B97 last.
      const r = BlissParser.parse('_C5_word_inline;B86');
      expect(r.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['C', 'B86', 'B97']);
    });

    it('does not throw on an unknown bareCode in the head\'s composite parts', () => {
      // The optional chaining `definitions[bareCode]?.isIndicator` shields
      // against undefined defs. Removing `?.` would throw a TypeError when
      // a `;`-segment has an unrecognized code (here `__UNK__`).
      expect(() => BlissParser.parse('_C5_word_inline_unk;B86')).not.toThrow();
    });
  });

  describe('when parse scans a multi-segment head for existing indicators', () => {
    it('does not throw on an unknown bareCode after the head segment', () => {
      // Same defensive `?.` lives in getIndicatorParts. The _C5_unknown_after
      // fixture forces this filter to evaluate
      // `definitions['__UNKNOWN_CODE__']?.isIndicator`, which must be safe.
      expect(() => BlissParser.parse('_C5_unknown_word;B86')).not.toThrow();
    });

    it('does not double-count an all-indicator head in the existing-indicator scan', () => {
      // B97 is itself a semantic indicator. When it's the head glyph of a
      // multi-glyph word, getIndicatorParts must not include it in
      // existingInds (it's the head, not an attached indicator). The
      // position-independent helper returns [] for an all-indicator head
      // (R15 3b-5), so B97 is not detected as an existing semantic root and
      // re-injected by buildWithSemantic, which would duplicate it.
      const r = BlissParser.parse('_C5_b97_word;B86');
      const codeNames = r.groups[0].glyphs[0].parts.map(p => p.codeName);
      expect(codeNames.filter(c => c === 'B97').length).toBe(1);
      expect(codeNames).toContain('B86');
    });

    it('only treats parts with explicit isIndicator: true as indicators', () => {
      // _C5_fake_semantic has semanticIndicator: 'thing' but no
      // isIndicator: true. The strict `=== true` filter (and the filter
      // call itself) excludes it from existingInds, so getSemanticRoot
      // returns null and ;B86 produces a clean replacement. If the filter
      // admitted everything (or were dropped), _C5_fake_semantic's semantic
      // root B97 would be auto-preserved and appear in the head's parts.
      const r = BlissParser.parse('_C5_word_with_fake_sem;B86');
      const codeNames = r.groups[0].glyphs[0].parts.map(p => p.codeName);
      expect(codeNames).not.toContain('B97');
    });
  });

  describe('when WORD; strips indicators and parse keeps the head identity', () => {
    it('preserves glyphCode and isBlissGlyph when ; leaves the head as a known simple glyph', () => {
      // _C5_word; (empty strip) reduces head.part to '_C5_simple'. The
      // simple-path keeps the existing identity; mutations that wreck the
      // bareCode extraction (split-character substitutions), the if-branch
      // condition, or the `isBlissGlyph = true` literal would all flip
      // glyphCode/isBlissGlyph to undefined on the resulting glyph.
      const r = BlissParser.parse('_C5_word;');
      const head = r.groups[0].glyphs[0];
      expect(head.glyphCode).toBe('_C5_simple');
      expect(head.isBlissGlyph).toBe(true);
    });
  });

  describe('when an expanded definition emits a leading _wordBreak before any glyph', () => {
    beforeAll(() => {
      // codeString starts with `//` so expand emits an empty leading part
      // followed by a _wordBreak before any real glyph is pushed to `group`.
      blissElementDefinitions._C7_LEAD_BREAK = { codeString: '//B81' };
    });
    afterAll(() => {
      delete blissElementDefinitions._C7_LEAD_BREAK;
    });

    it('does not push an empty group when _wordBreak fires before any glyph', () => {
      // kills 2319 (cond → true), 2321 (> → >=). Both make the empty-group
      // push happen at length 0; original suppresses it.
      const r = BlissParser.parse('_C7_LEAD_BREAK');
      // Original: [spaceGroup, group{B81}]. Mutant: [emptyGroup, spaceGroup, group{B81}].
      expect(r.groups).toHaveLength(2);
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('B81');
    });
  });

  describe('when expansion emits an empty part', () => {
    it('skips empty parts emitted by the expand pipeline', () => {
      // kills 2335 (part === "" → false). H/; produces an empty
      // expand entry (without _wordBreak, since `;` alone hits the
      // base-case isBareEmptyStrip path). Mutant would create a second
      // glyph with parts: [{}].
      const r = BlissParser.parse('H/;');
      expect(r.groups[0].glyphs).toHaveLength(1);
      expect(r.groups[0].glyphs[0].parts).toEqual([{ codeName: 'H' }]);
    });
  });

  describe('when parse builds glyph objects from expanded parts', () => {
    it('propagates isIndicator: true on indicator glyphs', () => {
      // kills 2348 (cond → false), 2349 (&& → ||), 2353 ({isIndicator} → {})
      const r = BlissParser.parse('B81');
      expect(r.groups[0].glyphs[0].isIndicator).toBe(true);
    });

    it('omits isIndicator from non-indicator glyphs', () => {
      // kills 2350 (typeof === "boolean" → true), 2351 (=== → !==).
      // Both mutants spread `{ isIndicator: undefined }` for non-indicators,
      // adding the key as own-undefined.
      const r = BlissParser.parse('H');
      expect(Object.hasOwn(r.groups[0].glyphs[0], 'isIndicator')).toBe(false);
    });

    it('propagates isExternalGlyph: true on external glyphs', () => {
      // kills 2357 (typeof === "boolean" → false on isExternalGlyph spread)
      const r = BlissParser.parse('Xa');
      expect(r.groups[0].glyphs[0].isExternalGlyph).toBe(true);
    });

    it('propagates kerningRules on external glyphs', () => {
      // kills 2375 (kerningRules guard → false). Xa carries an empty
      // kerningRules object that nonetheless must appear on the glyph.
      const r = BlissParser.parse('Xa');
      expect(Object.hasOwn(r.groups[0].glyphs[0], 'kerningRules')).toBe(true);
    });

    it('omits isHeadGlyph from non-head glyphs', () => {
      // kills 2396 (=== true → true). Mutant would spread
      // `{ isHeadGlyph: undefined }` for plain glyphs.
      const r = BlissParser.parse('H');
      expect(Object.hasOwn(r.groups[0].glyphs[0], 'isHeadGlyph')).toBe(false);
    });
  });

  describe('when parseParts recurses through chained definition aliases', () => {
    beforeAll(() => {
      // 51 chained alias defs: each codeString is `_C7_DEPTH_{i+1};H` so
      // parseParts recurses through 50 levels. _C7_DEPTH_51 terminates with
      // codeString 'H' (no recursion). Indicators are 'H' (a shape, not a
      // real indicator) so expand drops to base-case and emits a single
      // 'D{i+1};H' part; the depth growth happens in parseParts, not expand.
      for (let i = 0; i <= 50; i++) {
        blissElementDefinitions[`_C7_DEPTH_${i}`] = { codeString: `_C7_DEPTH_${i + 1};H` };
      }
      blissElementDefinitions._C7_DEPTH_51 = { codeString: 'H' };
    });
    afterAll(() => {
      for (let i = 0; i <= 51; i++) {
        delete blissElementDefinitions[`_C7_DEPTH_${i}`];
      }
    });

    it('allows recursion at exactly MAX_RECURSION_DEPTH (50)', () => {
      // kills 2449 (depth > MAX → depth >= MAX). Original's strict `>`
      // permits depth=50; mutant's `>=` throws on entry to that frame.
      expect(() => BlissParser.parse('_C7_DEPTH_0')).not.toThrow();
    });
  });

  describe('when parse receives a caller options object', () => {
    it('merges caller options onto parsed global options', () => {
      const r = BlissParser.parse('[grid]||H', { color: 'red' });

      expect(r.options).toEqual({ grid: true, color: 'red' });
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });
  });

  describe('when expandParts hits its defensive guards', () => {
    it('returns inputs without groups unchanged', () => {
      expect(BlissParser.expandParts(undefined)).toBeUndefined();

      const obj = { options: { color: 'red' } };
      expect(BlissParser.expandParts(obj)).toBe(obj);
      expect(obj).toEqual({ options: { color: 'red' } });
    });

    it('skips groups without glyphs and glyphs without parts', () => {
      const obj = { groups: [{}, { glyphs: [{}] }] };

      expect(() => BlissParser.expandParts(obj)).not.toThrow();
      expect(obj.groups[0]).toEqual({});
      expect(obj.groups[1].glyphs[0]).toEqual({});
    });
  });
});
