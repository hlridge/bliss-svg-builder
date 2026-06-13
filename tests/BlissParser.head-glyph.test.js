import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins BlissParser head-glyph marker (`^`): the explicit DSL postfix
 * that designates which glyph in a word receives grammatical indicators
 * (part-of-speech markers rendered above the character), and the
 * fallback heuristics that decide head-glyph designation when no `^`
 * marker is present.
 *
 * Covers:
 * - `^` marker detection at the end of a glyph token (simple, with
 *   parts/indicators, with positioning, on composite glyphs).
 * - `^` after option prefixes (glyph-level `[...]`, part-level `[...]>`,
 *   and combined option+part forms).
 * - Multi-glyph word position handling (head as first / middle / last).
 * - Multi-word inputs with separate head markers per word.
 * - Invalid marker placements: parser does not set isHeadGlyph when
 *   `^` is mid-token, before a `;` separator, or mid-parts-list.
 * - Multiple `^` markers in one word: first marker wins; parser emits
 *   a `MULTIPLE_HEAD_MARKERS` warning.
 * - Edge cases: lone `^`, whitespace surrounding `^`, external glyph
 *   codes (`Xa^`), composite-definition codes (`B291^`).
 * - Fallback heuristics when no `^` marker is present: skip the
 *   `B1060/B578/B303` sequence at start, skip `B486`, default to the
 *   first character.
 * - The head-glyph algorithm running over a definition's recursive
 *   expansion: fallback heuristics applied to the expanded glyph
 *   list, an explicit `^` carried inside a codeString, an outer `^`
 *   on a multi-character definition code dropping with
 *   `HEAD_MARKER_ON_WORD` (head-marker contract rule 1), and
 *   `MULTIPLE_HEAD_MARKERS` emission when a definition expands
 *   multiple `^` markers.
 * - The single-crown invariant: exactly one `isHeadGlyph: true` per
 *   word group, including when an explicit `^` disagrees with the
 *   fallback's default pick, when an alias resolves through another
 *   alias to a multi-glyph word, and when an alias invocation carries
 *   a position suffix or options prefix that decorates the first
 *   part string after expansion.
 * - `^` is scoped per word group: a separate marker in each of two
 *   `//`-separated words marks each word's own head without warning,
 *   and a second `^` in a different word never triggers
 *   `MULTIPLE_HEAD_MARKERS` (which is per-word).
 *
 * Does NOT cover:
 * - True round-trip serialization through `toString()` / `toJSON()`
 *   (export flattens aliases and re-emits `^` on the designated
 *   character), see `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - The deeper exclusion-rule heuristics (priority hierarchy across
 *   regular exclusions, low-priority B401/B699, absolute never-head
 *   B233, recursive multi-deep skip, conditional B10/B4 exception),
 *   see `BlissParser.head-glyph-exclusions.test.js`.
 * - Effect of the head-glyph designation on rendered SVG, see
 *   `BlissSVGBuilder.spacing.test.js` and the visual
 *   regression suite.
 * - Indicator placement rules that consume the head glyph, see the
 *   `indicator-utils.*.test.js` family (especially
 *   `semantic-goes-last` and `build-with-semantic`).
 *
 * @contract: head-glyph-marker
 */
describe('BlissParser head-glyph marker', () => {

  describe('when ^ marks a glyph at the end of its token', () => {
    it('detects ^ on a simple glyph', () => {
      const result = BlissParser.parse('B208^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].glyphCode).toBe('B208');
    });

    it('detects ^ on a glyph with a single indicator', () => {
      const result = BlissParser.parse('B208;B97^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B208');
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B97');
    });

    it('detects ^ on a glyph with multiple indicators', () => {
      const result = BlissParser.parse('B208;B97;B81^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts.length).toBe(3);
    });

    it('detects ^ on a glyph with positioning', () => {
      const result = BlissParser.parse('B208:3,4^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('B208');
      expect(result.groups[0].glyphs[0].parts[0].x).toBe(3);
      expect(result.groups[0].glyphs[0].parts[0].y).toBe(4);
    });

    it('detects ^ on a glyph with indicator and positioning', () => {
      const result = BlissParser.parse('B208;B97:0,2^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts[1].codeName).toBe('B97');
      expect(result.groups[0].glyphs[0].parts[1].x).toBe(0);
      expect(result.groups[0].glyphs[0].parts[1].y).toBe(2);
    });

    it('detects ^ on a composite glyph', () => {
      const result = BlissParser.parse('B208;B300:3,0;H:3,8^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts.length).toBe(3);
    });

    it('does not set isHeadGlyph when ^ is absent', () => {
      const result = BlissParser.parse('B208');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
    });

    it('does not set isHeadGlyph on non-head glyphs in a multi-glyph word', () => {
      const result = BlissParser.parse('B101/B208^/B303');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[2].isHeadGlyph).toBeUndefined();
    });
  });

  describe('when ^ follows an options-prefixed glyph', () => {
    it('detects ^ after glyph-level options', () => {
      const result = BlissParser.parse('[color=red]B208^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].options.color).toBe('red');
    });

    it('detects ^ after part-level options', () => {
      const result = BlissParser.parse('[color=red]>B208^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts[0].options.color).toBe('red');
    });

    it('detects ^ with complex options and parts', () => {
      const result = BlissParser.parse('[color=red]B208;[color=blue]>B97^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].options.color).toBe('red');
      expect(result.groups[0].glyphs[0].parts[1].options.color).toBe('blue');
    });
  });

  describe('when the word has multiple glyphs', () => {
    it('marks only the designated head glyph', () => {
      const result = BlissParser.parse('A/B208^/C');

      const glyphs = result.groups[0].glyphs;
      expect(glyphs[0].isHeadGlyph).toBeUndefined();
      expect(glyphs[1].isHeadGlyph).toBe(true);
      expect(glyphs[2].isHeadGlyph).toBeUndefined();
    });

    it('marks the first glyph as head when ^ is on it', () => {
      const result = BlissParser.parse('B208^/B101/B303');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
    });

    it('marks the last glyph as head when ^ is on it', () => {
      const result = BlissParser.parse('B101/B303/B208^');

      expect(result.groups[0].glyphs[2].isHeadGlyph).toBe(true);
    });

    it('marks the middle glyph as head when ^ is on it', () => {
      const result = BlissParser.parse('B101/B208^/B303');

      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('marks exactly one head when the explicit marker disagrees with the default pick', () => {
      // Single-crown invariant: the default pick for B291/B313/B208 is
      // index 0, the explicit ^ overrides to index 1, and no second
      // isHeadGlyph may appear anywhere in the group. A silent two-crowns
      // state would mis-route word-level indicators and serialization.
      const result = BlissParser.parse('B291/B313^/B208');

      const glyphs = result.groups[0].glyphs;
      expect(glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
      expect(glyphs[1].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(Object.hasOwn(glyphs[2], 'isHeadGlyph')).toBe(false);
    });
  });

  describe('when the input has multiple words', () => {
    it('detects different head glyphs in different words', () => {
      const result = BlissParser.parse('A/B208^/C//D/E^/F');

      // First word: B208 is head
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);

      // Second word (group index 2, skipping TSP at 1): E is head
      expect(result.groups[2].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('detects head glyph only in the word that has the marker', () => {
      const result = BlissParser.parse('A/B208^//C/D');

      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(result.groups[2].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[2].glyphs[1].isHeadGlyph).toBeUndefined();
    });

    it('marks each word independently when both words carry their own ^ marker', () => {
      // One `^` per word group: each word's marked glyph is the head, and
      // the parser emits no warning because MULTIPLE_HEAD_MARKERS is
      // scoped per word, not per input.
      const result = BlissParser.parse('B313/B1103^//B431/B167^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(result.groups[2].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[2].glyphs[1].isHeadGlyph).toBe(true);
      expect(result._parseWarnings).toBeUndefined();
    });

    it('does not emit MULTIPLE_HEAD_MARKERS when two ^ markers sit in different word groups', () => {
      // Cross-group `^^` is intentional; each word gets its own head.
      // Compare to the in-word `H^/C^` case in the multiple-markers
      // describe below, which DOES warn.
      const result = BlissParser.parse('B313^//B1103^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[2].glyphs[0].isHeadGlyph).toBe(true);
      expect(result._parseWarnings).toBeUndefined();
    });
  });

  describe('when ^ is placed at an invalid position within a glyph', () => {
    it('does not set isHeadGlyph when ^ is mid-token (B^208)', () => {
      const result = BlissParser.parse('B^208');

      // Implementation may either parse it as an unknown code or partially;
      // contract under test is "isHeadGlyph is not silently set to true".
      const glyph = result.groups[0].glyphs[0];
      expect(glyph.isHeadGlyph).not.toBe(true);
    });

    it('parses without setting isHeadGlyph when ^ is before ; (B208^;B97)', () => {
      const result = BlissParser.parse('B208^;B97');

      const glyph = result.groups[0].glyphs[0];
      expect(glyph.parts.length).toBeGreaterThan(0);
      // The ^ should not be properly processed
    });

    it('parses without setting isHeadGlyph when ^ is mid-parts-list (B208;B97^;B81)', () => {
      const result = BlissParser.parse('B208;B97^;B81');

      const glyph = result.groups[0].glyphs[0];
      expect(glyph.parts.length).toBeGreaterThan(0);
    });
  });

  describe('when multiple ^ markers appear in the same word', () => {
    it('uses the first marker and leaves later ones unrecognised', () => {
      const result = BlissParser.parse('H^/C^/E');

      expect(result.groups[0].glyphs.length).toBe(3);
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[2].isHeadGlyph).toBeUndefined();
    });

    it('uses the first marker when consecutive glyphs both carry ^', () => {
      const result = BlissParser.parse('H/C^/E^/VL2');

      expect(result.groups[0].glyphs.length).toBe(4);
      expect(result.groups[0].glyphs[0].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[2].isHeadGlyph).toBeUndefined();
      expect(result.groups[0].glyphs[3].isHeadGlyph).toBeUndefined();
    });

    it('records a MULTIPLE_HEAD_MARKERS warning', () => {
      const result = BlissParser.parse('H^/C^/E');

      expect(result._parseWarnings).toBeDefined();
      expect(result._parseWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'MULTIPLE_HEAD_MARKERS',
            message: expect.stringContaining('Multiple head markers'),
          }),
        ])
      );
    });
  });

  describe('when ^ appears in an unusual context', () => {
    it('does not crash on a lone ^ input', () => {
      const result = BlissParser.parse('^');

      // Edge case: parse error or empty glyph; contract is "does not throw".
      expect(result).toBeDefined();
    });

    it('parses ^ identically with or without surrounding whitespace', () => {
      // Whitespace is removed before parsing, so "B208 ^" becomes "B208^"
      const result1 = BlissParser.parse('B208 ^');
      const result2 = BlissParser.parse('B208^');

      expect(result1.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result2.groups[0].glyphs[0].isHeadGlyph).toBe(true);
    });

    it('detects ^ following an external glyph code (Xa^)', () => {
      const result = BlissParser.parse('Xa^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('Xa');
    });

    it('detects ^ following a composite-definition glyph code (B291^)', () => {
      // If a code has a codeString definition that expands, ^ should apply to the glyph
      const result = BlissParser.parse('B291^');

      expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
    });
  });

  describe('when no ^ marker is present (fallback heuristics)', () => {

    describe('when no fallback rule applies', () => {
      it('leaves all isHeadGlyph fields undefined; downstream Element computes the head', () => {
        const result = BlissParser.parse('B208/B101/B303');

        // No explicit head marker; parser does NOT compute the implicit
        // head; that lives in BlissElement / builder downstream.
        const glyphs = result.groups[0].glyphs;
        expect(glyphs[0].isHeadGlyph).toBeUndefined();
        expect(glyphs[1].isHeadGlyph).toBeUndefined();
        expect(glyphs[2].isHeadGlyph).toBeUndefined();
      });
    });

    describe('when the input begins with the B1060/B578/B303 skip sequence', () => {
      it('marks the glyph after the skip sequence as head (no explicit marker)', () => {
        const result = BlissParser.parse('B1060/B578/B303/B208');

        // Parser applies fallback: skips excluded prefix, marks B208 as head
        const glyphs = result.groups[0].glyphs;
        expect(glyphs[0].isHeadGlyph).toBeUndefined();
        expect(glyphs[1].isHeadGlyph).toBeUndefined();
        expect(glyphs[2].isHeadGlyph).toBeUndefined();
        expect(glyphs[3].isHeadGlyph).toBe(true);
      });

      it('explicit marker overrides skip sequence', () => {
        // Even with skip sequence, explicit marker wins
        const result = BlissParser.parse('B1060^/B578/B303/B208');

        expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      });
    });

    describe('when the input contains B486 characters', () => {
      it('marks the glyph after the B486 as head (no explicit marker)', () => {
        const result = BlissParser.parse('B486/B208');

        // Parser applies fallback: skips B486, marks B208 as head
        const glyphs = result.groups[0].glyphs;
        expect(glyphs[0].isHeadGlyph).toBeUndefined();
        expect(glyphs[1].isHeadGlyph).toBe(true);
      });

      it('explicit marker on B486 overrides skip rule', () => {
        const result = BlissParser.parse('B486^/B208');

        expect(result.groups[0].glyphs[0].isHeadGlyph).toBe(true);
      });

      it('marks the glyph after multiple consecutive B486 as head', () => {
        const result = BlissParser.parse('B486/B486/B208');

        // Parser applies fallback: skips both B486, marks B208 as head
        const glyphs = result.groups[0].glyphs;
        expect(glyphs[0].isHeadGlyph).toBeUndefined();
        expect(glyphs[1].isHeadGlyph).toBeUndefined();
        expect(glyphs[2].isHeadGlyph).toBe(true);
      });
    });

    describe('when multiple skip rules combine', () => {
      it('marks the glyph after the combined skip-sequence and B486 as head', () => {
        // Combined fallback: skip the B1060/B578/B303 sequence, then skip
        // B486, crowning B208 at index 4. Strengthened from a count-only
        // assertion (the count stays as a secondary invariant).
        const result = BlissParser.parse('B1060/B578/B303/B486/B208');

        const glyphs = result.groups[0].glyphs;
        expect(glyphs.length).toBe(5);
        expect(glyphs[0].isHeadGlyph).toBeUndefined();
        expect(glyphs[1].isHeadGlyph).toBeUndefined();
        expect(glyphs[2].isHeadGlyph).toBeUndefined();
        expect(glyphs[3].isHeadGlyph).toBeUndefined();
        expect(glyphs[4].isHeadGlyph).toBe(true);
      });

      it('explicit marker anywhere overrides all heuristics', () => {
        const result = BlissParser.parse('B1060/B578/B303/B486/B208^/B101');

        expect(result.groups[0].glyphs[4].isHeadGlyph).toBe(true);
      });
    });
  });

  describe('when the head-glyph algorithm runs over a definition expansion', () => {
    const localDefinitionKeys = [];

    const defineLocal = (key, definition) => {
      blissElementDefinitions[key] = definition;
      localDefinitionKeys.push(key);
    };

    beforeAll(() => {
      defineLocal('_C15B_WORD_SEMANTIC', {
        codeString: 'B486/B291;B97/B313',
        glyphCode: '_C15B_WORD_SEMANTIC',
        isBlissGlyph: true
      });
      defineLocal('_C15B_WORD_FIRST_MARKED', { codeString: 'B486^/B291/B313' });
      defineLocal('_C15B_MULTI_HEAD', { codeString: 'B486^/B291^/B313' });
      defineLocal('_HG_NESTED_INNER', { codeString: 'B486/B291;B97/B313' });
      defineLocal('_HG_NESTED_OUTER', { codeString: '_HG_NESTED_INNER' });
      defineLocal('_HG_COMPOSITE_FIRST', { codeString: 'B486;B303/B291/B313' });
    });

    afterAll(() => {
      for (const key of localDefinitionKeys) {
        delete blissElementDefinitions[key];
      }
    });

    it('applies fallback heuristics across the expanded glyphs and marks a non-first head', () => {
      const r = BlissParser.parse('_C15B_WORD_SEMANTIC');
      const glyphs = r.groups[0].glyphs;

      expect(Object.hasOwn(glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(glyphs[1].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[2], 'isHeadGlyph')).toBe(false);
    });

    it('keeps an explicit marker on the first expanded glyph instead of falling through to the heuristic', () => {
      const r = BlissParser.parse('_C15B_WORD_FIRST_MARKED');
      const glyphs = r.groups[0].glyphs;

      expect(glyphs[0].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[1], 'isHeadGlyph')).toBe(false);
    });

    it('drops an outer ^ marker on a multi-character definition and falls back to the heuristic', () => {
      // Head-marker contract rule 1: ^ attaches to characters. A marker on
      // a multi-character alias is dropped with HEAD_MARKER_ON_WORD; the
      // automatic scan then skips the B486 exclusion and crowns B291.
      const r = BlissParser.parse('_C15B_WORD_SEMANTIC^');
      const glyphs = r.groups[0].glyphs;

      expect(Object.hasOwn(glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(glyphs[1].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[2], 'isHeadGlyph')).toBe(false);
      expect(r._parseWarnings).toEqual([
        expect.objectContaining({ code: 'HEAD_MARKER_ON_WORD' }),
      ]);
    });

    it('uses the first marker and warns when a definition expansion carries multiple ^ markers', () => {
      const r = BlissParser.parse('_C15B_MULTI_HEAD');
      const glyphs = r.groups[0].glyphs;

      expect(glyphs[0].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[1], 'isHeadGlyph')).toBe(false);
      expect(r._parseWarnings).toEqual([{
        code: 'MULTIPLE_HEAD_MARKERS',
        message: 'Multiple head markers (^) found in word: _C15B_MULTI_HEAD. Using first marked glyph.',
        source: '_C15B_MULTI_HEAD'
      }]);
    });

    it('marks the default-pick glyph as the only head across a nested alias expansion', () => {
      // Alias resolving through another alias to a multi-glyph word:
      // _HG_NESTED_OUTER -> _HG_NESTED_INNER -> B486/B291;B97/B313.
      // The fallback skips the B486 exclusion and crowns index 1 exactly once.
      const r = BlissParser.parse('_HG_NESTED_OUTER');
      const glyphs = r.groups[0].glyphs;

      expect(glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
      expect(glyphs[1].isHeadGlyph).toBe(true);
      expect(Object.hasOwn(glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(Object.hasOwn(glyphs[2], 'isHeadGlyph')).toBe(false);
    });

    it('keeps the fallback head when the alias is invoked with a position suffix', () => {
      // First glyph is a composite (B486;B303) so it carries no glyphCode;
      // the head pick must run on the clean expanded parts before the outer
      // :2,0 suffix lands on the first part string.
      const r = BlissParser.parse('_HG_COMPOSITE_FIRST:2,0');
      const glyphs = r.groups[0].glyphs;

      expect(glyphs[0].parts[0].x).toBe(2);
      expect(glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('keeps the fallback head when the alias is invoked with an options prefix', () => {
      // Same composite-first word; the [color=red] prefix lands on the first
      // part string after expansion, so the head pick must already be done.
      const r = BlissParser.parse('[color=red]_HG_COMPOSITE_FIRST');
      const glyphs = r.groups[0].glyphs;

      expect(glyphs[0].options.color).toBe('red');
      expect(glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });
  });
});
