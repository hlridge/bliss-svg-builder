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
 * Note: the getBaseCode / getIndicatorParts `;`-reattach mechanics this file
 * once exercised are dead under Strict Indicator Separation (a char-level `;`
 * on a multi-glyph word is MISPLACED, not a reattach), so those scenarios were
 * dropped here; head-glyph detection and the generic parse mechanics remain.
 *
 * Covers:
 * - parsePartString DSL-fragment parsing: option-bracket extraction with
 *   the default identity restoreFunction; the regex's leading-character-class
 *   anchor; multi-digit decimal x/y coordinates; the Invalid-format error
 *   path.
 * - Head-glyph detection during parse: tie-breaking at priority 0
 *   (absoluteNeverHead); single-char composite code resolution preferring
 *   the outer glyphCode over part-derived bareCodes.
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
 *   `BlissSVGBuilder.semantic-preservation.test.js`.
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
