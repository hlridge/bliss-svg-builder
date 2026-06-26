import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins parser semantic-indicator preservation: when overriding indicators with
 * `;`, `;!`, `;;`, or `;;!`, semantic indicators (B97 = THING, B6436 = ABSTRACT,
 * compound B98) are preserved by default. The `!` prefix strips them.
 *
 * Rule:
 * - If any new indicator carries semanticIndicator, no auto-preservation
 *   happens (the new semantic replaces the old).
 * - Otherwise, the existing semantic root is preserved and ordered around the
 *   new indicators by role (semantic first for nominal companions, last for
 *   verbal / adjectival companions).
 *
 * Covers:
 * - Single-character `;` override: preserves B97 / B6436 unless the replacement
 *   is itself semantic; B98 compound resolves to B97 root on extraction.
 * - Strip-semantic with `;!` (single character): drops semantic root regardless
 *   of replacement role.
 * - Word-level `;;` override: preserves semantic on the head glyph; `;;!`
 *   strips it.
 * - Word definitions (codeString with explicit `^` head marker): semantic on
 *   head glyph survives `;` override and is stripped by `;!`.
 * - Single-glyph word with `;;`: behaves like `;` for indicator override.
 * - Non-indicator composition parts (e.g. B303): preserved across both override
 *   and strip-semantic; `!` strips indicators only, never composition parts.
 * - Explicit semantic in new-indicator list: not duplicated by auto-preserve.
 * - Role-based ordering of preserved semantic alongside new indicators
 *   (semantic first for nominal, last for verbal / adjectival).
 *
 * Does NOT cover:
 * - Char-level `;!` parity with the builder API stripSemantic option, see
 *   `BlissSVGBuilder.stripSemanticParity.test.js`.
 * - Indicator role assignment and the semantic-goes-last placement rule on the
 *   utility side, see `indicator-utils.semantic-goes-last.test.js`.
 * - Head-glyph detection itself (which glyph the `;;` syntax targets), see
 *   `BlissParser.head-glyph.test.js`.
 * - Indicator detection mechanics (hasSemantic, filterToIndicators), see
 *   `indicator-utils.has-semantic.test.js` and
 *   `indicator-utils.filter-to-indicators.test.js`.
 *
 * @contract: semantic-indicator-preservation
 */

describe('BlissParser semantic indicator preservation', () => {

  // Snapshot built-in definition keys so afterAll strips exactly the
  // test-only definitions registered below, with no key list to maintain.
  const builtInDefinitionKeys = new Set(Object.keys(blissElementDefinitions));

  beforeAll(() => {
    blissElementDefinitions['SemTestThingChar'] = {
      codeString: 'B291;B97',
      glyphCode: 'SemTestThingChar',
      isBlissGlyph: true
    };
    blissElementDefinitions['SemTestCompoundChar'] = {
      codeString: 'B291;B98',
      glyphCode: 'SemTestCompoundChar',
      isBlissGlyph: true
    };
    blissElementDefinitions['SemTestAbstractChar'] = {
      codeString: 'B291;B6436',
      glyphCode: 'SemTestAbstractChar',
      isBlissGlyph: true
    };
    // ^ marks B291;B97 as the head glyph in this multi-glyph word definition.
    blissElementDefinitions['SemTestThingWord'] = {
      codeString: 'H/B291;B97^',
      glyphCode: 'SemTestThingWord',
      isBlissGlyph: true
    };
    blissElementDefinitions['SemTestNonSemanticChar'] = {
      codeString: 'B291;B81',
      glyphCode: 'SemTestNonSemanticChar',
      isBlissGlyph: true
    };
    // Multi-glyph word whose marked head (B291) carries the semantic B97.
    // B486 is an excluded modifier, so the head is the second glyph either way.
    blissElementDefinitions['SemTestSemanticHeadWord'] = {
      codeString: 'B486/B291;B97^',
      glyphCode: 'SemTestSemanticHeadWord',
      isBlissGlyph: true
    };
  });

  afterAll(() => {
    for (const code of Object.keys(blissElementDefinitions)) {
      if (!builtInDefinitionKeys.has(code)) delete blissElementDefinitions[code];
    }
  });

  // Resolved head-glyph part codes after the R14 `;;` overlay is merged onto
  // the head at render. (The semantic ordering lives in the merge, not in the
  // stored overlay, so these end-to-end pins resolve through the builder.)
  const resolvedHeadParts = (dsl) => {
    const glyphs = new BlissSVGBuilder(dsl).snapshot().children[0].children.filter(c => c.isGlyph);
    const head = glyphs.find(g => g.children?.some(p => p.isIndicator)) ?? glyphs[0];
    return head.children.map(p => p.codeName);
  };

  describe('when overriding indicators on a single character with ;', () => {

    it('preserves B97 when replacing with a verbal indicator (semantic last)', () => {
      const result = BlissParser.parse('SemTestThingChar;B81');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(3);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B81');
      expect(parts[2].codeName).toBe('B97');
    });

    it('extracts B97 root from compound indicator B98 when replacing with a verbal indicator', () => {
      const result = BlissParser.parse('SemTestCompoundChar;B81');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(3);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B81');
      expect(parts[2].codeName).toBe('B97');
    });

    it('preserves B6436 (abstract) when replacing with a verbal indicator (semantic last)', () => {
      const result = BlissParser.parse('SemTestAbstractChar;B81');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(3);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B81');
      expect(parts[2].codeName).toBe('B6436');
    });

    it('does not preserve when the new indicator is itself semantic (B6436 replaces B97)', () => {
      const result = BlissParser.parse('SemTestThingChar;B6436');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B6436');
    });

    it('does not preserve when the new indicator is compound semantic (B98)', () => {
      // note: B98 carries semanticIndicator='thing', so auto-preserve of the
      // existing B97 is suppressed. B98 stays as a single indicator code at
      // parser level (not expanded to B97;B99). The length-2 assertion pins
      // that B97 is dropped, not merely that B98 is present.
      const result = BlissParser.parse('SemTestThingChar;B98');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B98');
    });

    it('preserves the semantic root on an empty strip (;)', () => {
      const result = BlissParser.parse('SemTestThingChar;');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B97');
    });

    it('does not preserve a non-semantic indicator (B81) when it is replaced', () => {
      const result = BlissParser.parse('SemTestNonSemanticChar;B99');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B99');
    });
  });

  describe('when stripping indicators on a single character with ;!', () => {

    it('strips the B97 semantic indicator before adding the new one', () => {
      const result = BlissParser.parse('SemTestThingChar;!B81');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B81');
    });

    it('strips all indicators on an empty ;! strip', () => {
      const result = BlissParser.parse('SemTestThingChar;!');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(1);
      expect(parts[0].codeName).toBe('B291');
    });

    it('strips the B6436 abstract semantic indicator before adding the new one', () => {
      const result = BlissParser.parse('SemTestAbstractChar;!B81');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts.length).toBe(2);
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B81');
    });
  });

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

  describe('when overriding indicators on a word definition (WORD;...)', () => {

    it('preserves the semantic indicator carried on the word definition head glyph', () => {
      // SemTestThingWord = H/B291;B97^: the head glyph carries B97.
      const result = BlissParser.parse('SemTestThingWord;B81');
      const glyphs = result.groups[0].glyphs;

      const headGlyph = glyphs.find(g => g.isHeadGlyph) || glyphs[glyphs.length - 1];
      const partNames = headGlyph.parts.map(p => p.codeName);
      expect(partNames).toContain('B97');
      expect(partNames).toContain('B81');
    });

    it('strips the semantic indicator on a word definition with ;!', () => {
      const result = BlissParser.parse('SemTestThingWord;!B81');
      const glyphs = result.groups[0].glyphs;

      const headGlyph = glyphs.find(g => g.isHeadGlyph) || glyphs[glyphs.length - 1];
      const partNames = headGlyph.parts.map(p => p.codeName);
      expect(partNames).toContain('B81');
      expect(partNames).not.toContain('B97');
    });

    it('preserves the semantic indicator on an empty strip from a word definition', () => {
      const result = BlissParser.parse('SemTestThingWord;');
      const glyphs = result.groups[0].glyphs;

      const headGlyph = glyphs.find(g => g.isHeadGlyph) || glyphs[glyphs.length - 1];
      const partNames = headGlyph.parts.map(p => p.codeName);
      expect(partNames).toContain('B97');
    });

    it('strips all indicators on an empty ;! from a word definition', () => {
      const result = BlissParser.parse('SemTestThingWord;!');
      const glyphs = result.groups[0].glyphs;

      const headGlyph = glyphs.find(g => g.isHeadGlyph) || glyphs[glyphs.length - 1];
      const partNames = headGlyph.parts.map(p => p.codeName);
      expect(partNames).not.toContain('B97');
    });

    it('does not double the semantic root when the replacement is itself semantic', () => {
      // SemTestSemanticHeadWord = B486/B291;B97^: the head (B291) carries the
      // semantic B97. Replacing with the (compound) semantic B98 must REPLACE
      // B97, leaving exactly B291;B98 on the head, not a doubled B291;B97;B98.
      // pins the (semanticRoot && !hasSemantic) gate on the multi-glyph
      // WORD;IND reattach (parser L903); killed the ConditionalExpression->true
      // and LogicalOperator &&->|| mutants in the 2026-06-26 Stryker run, both
      // of which re-inject the old B97 -> B291;B97;B98.
      const result = BlissParser.parse('SemTestSemanticHeadWord;B98');
      const glyphs = result.groups[0].glyphs;

      const headGlyph = glyphs.find(g => g.isHeadGlyph) || glyphs[glyphs.length - 1];
      expect(headGlyph.parts.map(p => p.codeName)).toEqual(['B291', 'B98']);
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

    it('places the semantic root FIRST when a nominal indicator is applied to a single character (;B99)', () => {
      const result = BlissParser.parse('SemTestThingChar;B99');
      const parts = result.groups[0].glyphs[0].parts;

      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B97');
      expect(parts[2].codeName).toBe('B99');
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
