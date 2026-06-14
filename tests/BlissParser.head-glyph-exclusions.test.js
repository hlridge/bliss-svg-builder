import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins BlissParser head-glyph fallback heuristics: which character of a
 * multi-glyph word receives grammatical indicators when no explicit `^`
 * marker is present, given the project's exclusion-rule data
 * (`src/lib/bliss-head-glyph-exclusions.js`). Covers the priority
 * hierarchy:
 *   1. Non-exclusions: always head if present.
 *   2. Regular exclusions (B486, B368, B937, B449, B493, …):
 *      head only if no non-exclusions are available.
 *   3. Low-priority exclusions (B401, B699): head only when alone or
 *      together with same-or-lower-priority codes (no regular
 *      exclusions present).
 *   4. Absolute never-head (B233): can NEVER be head, even as a
 *      fallback (purely structural marker).
 * Plus the conditional-exclusion exception: B10 (one) is normally
 * excluded but is NOT excluded when followed immediately by B4.
 *
 * Each input-pattern scenario exercises both inline DSL (`;;` / `;`)
 * and defined-word forms (where applicable) to pin parity across
 * surfaces.
 *
 * Covers:
 * - All-exclusions words: regular + regular pairs (B486/B368,
 *   B486/B937, B449/B937, B493/B368): head is the last character.
 * - Standard skip: regular exclusion followed by non-exclusion.
 * - Recursive skip: 2- and 3-deep exclusion chains followed by a
 *   non-exclusion (B486/B449/B208, B578/B348/B225,
 *   B1060/B578/B303/B208).
 * - Low-priority semantics: B401 / B699 yield to non-excluded
 *   characters, yield to regular exclusions, and use last-position
 *   among themselves when alone.
 * - Absolute never-head B233 placement.
 * - Conditional-exception B10/B4 vs B10/B208.
 * - Non-excluded first character keeps head designation regardless
 *   of suffix.
 * - Explicit `^` marker overrides all heuristics.
 * - Edge cases: single non-exclusion glyph, single exclusion glyph,
 *   empty indicator list (`;;`).
 *
 * Does NOT cover:
 * - The `^` marker grammar itself, see
 *   `BlissParser.head-glyph.test.js` (sibling file).
 * - Indicator placement *after* the head is decided, see
 *   `indicator-utils.semantic-goes-last.test.js` and
 *   `indicator-utils.build-with-semantic.test.js`.
 * - Effect of head-glyph designation on rendered SVG output, see
 *   `BlissSVGBuilder.spacing.test.js` and the visual
 *   regression suite.
 *
 * @contract: head-glyph-exclusions
 */
describe('BlissParser head-glyph exclusions', () => {

  // Snapshot built-in definition keys so afterAll strips exactly the
  // test-only definitions registered below, with no key list to maintain.
  const builtInDefinitionKeys = new Set(Object.keys(blissElementDefinitions));

  beforeAll(() => {
    // All-exclusions words (both characters are regular exclusions)
    blissElementDefinitions['TestNarrowness'] = {
      codeString: 'B486/B368',  // opposite-to/many (both exclusions)
      glyphCode: 'TestNarrowness',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestMoreOpposite'] = {
      codeString: 'B486/B937',  // opposite-to/more (both exclusions)
      glyphCode: 'TestMoreOpposite',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestWithoutMore'] = {
      codeString: 'B449/B937',  // without/more (both exclusions)
      glyphCode: 'TestWithoutMore',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestOverMany'] = {
      codeString: 'B493/B368',  // over/many (both exclusions)
      glyphCode: 'TestOverMany',
      isBlissGlyph: true
    };

    // Standard exclusion skip (first is exclusion, second is not)
    blissElementDefinitions['TestOppositeB208'] = {
      codeString: 'B486/B208',  // opposite-to/B208 (B486 excluded, B208 not)
      glyphCode: 'TestOppositeB208',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestManyB208'] = {
      codeString: 'B368/B208',  // many/B208 (B368 excluded, B208 not)
      glyphCode: 'TestManyB208',
      isBlissGlyph: true
    };

    // Recursive exclusion checking
    blissElementDefinitions['TestSameGenB225'] = {
      codeString: 'B578/B348/B225',  // same-as/generalization/B225 (first two excluded)
      glyphCode: 'TestSameGenB225',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestDoubleExclB208'] = {
      codeString: 'B486/B449/B208',  // opposite/without/B208 (first two excluded)
      glyphCode: 'TestDoubleExclB208',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestMultiCharPattern'] = {
      codeString: 'B1060/B578/B303/B208',  // "looks similar to"/B208 (3-char pattern + non-excl)
      glyphCode: 'TestMultiCharPattern',
      isBlissGlyph: true
    };

    // Low-priority exclusion mixes
    blissElementDefinitions['TestWithNeverHead'] = {
      codeString: 'B120/B401/B401',  // B120 not excluded, B401 is low-priority
      glyphCode: 'TestWithNeverHead',
      isBlissGlyph: true
    };

    blissElementDefinitions['TestB208NeverHead'] = {
      codeString: 'B208/B401',  // B208 not excluded, B401 is low-priority
      glyphCode: 'TestB208NeverHead',
      isBlissGlyph: true
    };

    // Non-excluded first character
    blissElementDefinitions['TestB208Many'] = {
      codeString: 'B208/B368',  // B208 not excluded, B368 excluded
      glyphCode: 'TestB208Many',
      isBlissGlyph: true
    };
  });

  afterAll(() => {
    for (const code of Object.keys(blissElementDefinitions)) {
      if (!builtInDefinitionKeys.has(code)) delete blissElementDefinitions[code];
    }
  });

  // Returns the index of the character carrying indicators (i.e. the
  // computed head glyph), or -1 if no character has indicator children.
  // Built through BlissSVGBuilder so the R14 word-level (`;;`) overlay is
  // resolved onto the head at render; single-`;` word bakes resolve too.
  const getHeadGlyphIndex = (code) => {
    const word = new BlissSVGBuilder(code).snapshot().children[0];
    const glyphs = word.children.filter(c => c.isGlyph);
    return glyphs.findIndex(character =>
      character.children?.some(c => c.isIndicator)
    );
  };

  describe('when all characters of the word are exclusions', () => {
    describe('when the input is B486/B368 (opposite-to/many)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B486/B368;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ;; syntax', () => {
        expect(getHeadGlyphIndex('TestNarrowness;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestNarrowness;B86')).toBe(1);
      });

      it('marks the second glyph as head with an explicit ^ marker', () => {
        const result = BlissParser.parse('B486/B368^');
        expect(result.groups[0].glyphs[1].isHeadGlyph).toBe(true);
      });
    });

    describe('when the input is B486/B937 (opposite-to/more)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B486/B937;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestMoreOpposite;B86')).toBe(1);
      });
    });

    describe('when the input is B449/B937 (without/more)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B449/B937;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestWithoutMore;B86')).toBe(1);
      });
    });

    describe('when the input is B493/B368 (over/many)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B493/B368;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestOverMany;B86')).toBe(1);
      });
    });
  });

  describe('when the first character is an exclusion and the next is not', () => {
    describe('when the input is B486/B208 (opposite-to + non-excluded)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B486/B208;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestOppositeB208;B86')).toBe(1);
      });
    });

    describe('when the input is B368/B208 (many + non-excluded)', () => {
      it('places the indicator on the second character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B368/B208;;B86')).toBe(1);
      });

      it('places the indicator on the second character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestManyB208;B86')).toBe(1);
      });
    });
  });

  describe('when consecutive characters are exclusions', () => {
    describe('when the input is B578/B348/B225 (same-as/generalization + non-excluded)', () => {
      it('places the indicator on the third character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B578/B348/B225;;B86')).toBe(2);
      });

      it('places the indicator on the third character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestSameGenB225;B86')).toBe(2);
      });
    });

    describe('when the input is B486/B449/B208 (two single exclusions + non-excluded)', () => {
      it('places the indicator on the third character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B486/B449/B208;;B86')).toBe(2);
      });

      it('places the indicator on the third character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestDoubleExclB208;B86')).toBe(2);
      });
    });

    describe('when the input is B1060/B578/B303/B208 (skip-sequence prefix + non-excluded)', () => {
      it('places the indicator on the fourth character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B1060/B578/B303/B208;;B86')).toBe(3);
      });

      it('places the indicator on the fourth character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestMultiCharPattern;B86')).toBe(3);
      });
    });
  });

  describe('when the input mixes a non-excluded character with low-priority exclusions', () => {
    describe('when the input is B120/B401/B401 (non-excluded + low-priority B401s)', () => {
      it('places the indicator on the first character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B120/B401/B401;;B86')).toBe(0);
      });

      it('places the indicator on the first character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestWithNeverHead;B86')).toBe(0);
      });
    });

    describe('when the input is B208/B401 (non-excluded + low-priority B401)', () => {
      it('places the indicator on the first character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B208/B401;;B86')).toBe(0);
      });

      it('places the indicator on the first character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestB208NeverHead;B86')).toBe(0);
      });
    });
  });

  describe('when low-priority and regular exclusions are mixed', () => {
    it('places the indicator on B486 in B486/B401 (regular exclusion outranks low-priority)', () => {
      // B486 is a regular exclusion, B401 is low-priority; regular takes precedence.
      expect(getHeadGlyphIndex('B486/B401;;B86')).toBe(0);
    });

    it('places the indicator on B368 in B368/B699 (regular exclusion outranks low-priority)', () => {
      // B368 is a regular exclusion, B699 is low-priority.
      expect(getHeadGlyphIndex('B368/B699;;B86')).toBe(0);
    });

    it('places the indicator on B368 in B401/B368 (regular exclusion wins regardless of position)', () => {
      // B401 is low-priority, B368 is a regular exclusion; regular wins
      // even when it appears second.
      expect(getHeadGlyphIndex('B401/B368;;B86')).toBe(1);
    });

    it('places the indicator on B449 in B449/B401/B401 (single regular outranks two low-priority)', () => {
      // B449 is a regular exclusion (priority 2), B401s are low-priority
      // (priority 1); regular precedence holds against multiple low-priority.
      expect(getHeadGlyphIndex('B449/B401/B401;;B86')).toBe(0);
    });
  });

  describe('when only low-priority exclusions are present', () => {
    it('places the indicator on B401 when it is the entire word', () => {
      // A solitary low-priority exclusion can take an indicator.
      expect(getHeadGlyphIndex('B401;;B86')).toBe(0);
    });

    it('places the indicator on the last B401 in B401/B401', () => {
      // Both characters are low-priority; last-position rule applies.
      expect(getHeadGlyphIndex('B401/B401;;B86')).toBe(1);
    });

    it('places the indicator on B699 when it is the entire word', () => {
      expect(getHeadGlyphIndex('B699;;B86')).toBe(0);
    });

    it('places the indicator on the last low-priority character in B401/B699', () => {
      // Both characters are low-priority; last-position rule applies.
      expect(getHeadGlyphIndex('B401/B699;;B86')).toBe(1);
    });
  });

  describe('when the input contains the absolute never-head B233', () => {
    it('places the indicator on B401 in B233/B401 (B233 can never be head)', () => {
      // B233 is absolute never-head; B401 is low-priority but can be head.
      expect(getHeadGlyphIndex('B233/B401;;B86')).toBe(1);
    });

    it('places the indicator on B368 in B233/B368', () => {
      // B233 is absolute never-head; B368 takes the indicator.
      expect(getHeadGlyphIndex('B233/B368;;B86')).toBe(1);
    });

    it('falls back to position 0 when B233 is the entire word', () => {
      // Provisional behavior, NOT a settled contract: a lone absolute-never-head
      // glyph still receives the indicator at index 0 (something must be the
      // head). The principled contract for indicators on an atypical base (and
      // the relocation-ordering divergence behind it) is under review in
      // .claude/backlog/indicator-on-atypical-base.md (burndown T7). Do not treat
      // this 0 as decided.
      expect(getHeadGlyphIndex('B233;;B86')).toBe(0);
    });
  });

  describe('when B10 is followed by B4 (conditional-exclusion exception)', () => {
    it('places the indicator on the first character in B10/B4 (B10 is not excluded before B4)', () => {
      // B10 is normally excluded, but the B10/B4 sequence is an exception.
      expect(getHeadGlyphIndex('B10/B4;;B86')).toBe(0);
    });

    it('places the indicator on the second character in B10/B208 (B10 excluded normally)', () => {
      // B10 followed by something other than B4: normal exclusion applies.
      expect(getHeadGlyphIndex('B10/B208;;B86')).toBe(1);
    });

    it('keeps other excluded number glyphs excluded before B4', () => {
      expect(getHeadGlyphIndex('B11/B4;;B86')).toBe(1);
      // pins exception-code match; killed line 332 code-check mutant in 2026-05 Stryker run.
    });
  });

  describe('when the first character is not an exclusion', () => {
    describe('when the input is B208/B368 (non-excluded + exclusion)', () => {
      it('places the indicator on the first character with inline ;; syntax', () => {
        expect(getHeadGlyphIndex('B208/B368;;B86')).toBe(0);
      });

      it('places the indicator on the first character with the defined word and ; syntax', () => {
        expect(getHeadGlyphIndex('TestB208Many;B86')).toBe(0);
      });
    });
  });

  describe('when an explicit ^ marker is present', () => {
    it('uses the marked character regardless of exclusion rules', () => {
      const result = BlissParser.parse('B163/B548;B84^');
      const glyphs = result.groups[0].glyphs;
      expect(glyphs[0].isHeadGlyph).toBeUndefined();
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('combines the explicit ^ marker with a word-level indicator', () => {
      expect(getHeadGlyphIndex('B163/B548;B84^;;B84')).toBe(1);
    });
  });

  describe('when the input is a single non-exclusion character', () => {
    it('places the indicator on that character', () => {
      expect(getHeadGlyphIndex('B208;;B86')).toBe(0);
    });
  });

  describe('when the input is a single exclusion character', () => {
    it('places the indicator on that character', () => {
      expect(getHeadGlyphIndex('B486;;B86')).toBe(0);
    });
  });

  describe('when the indicator list is empty (;;)', () => {
    it('parses without error and yields the original glyph count', () => {
      const result = BlissParser.parse('B486/B368;;');
      expect(result).toBeDefined();
      expect(result.groups[0].glyphs.length).toBe(2);
    });
  });
});
