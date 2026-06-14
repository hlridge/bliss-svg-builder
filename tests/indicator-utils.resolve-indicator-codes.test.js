import { describe, it, expect } from 'vitest';
import { resolveIndicatorCodes } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.resolveIndicatorCodes: the shared decision logic
 * that turns (existing indicator codes, requested new codes, stripSemantic)
 * into the final indicator code list, preserving the semantic root unless
 * stripped and never doubling a semantic root the new codes already carry.
 *
 * This composition was inlined identically in the parser (wordLevelMatch)
 * and element-handle (#applyOrClearIndicators) before extraction; the
 * primitives it composes are tested separately (see Does NOT cover).
 *
 * Covers:
 * - Replace-all with no existing root: new codes pass through filtered.
 * - Semantic-root preservation and placement (root last for verbal/
 *   adjectival additions, root first for nominal additions).
 * - Compound semantic root (B98) resolving to its root (B97) on output.
 * - stripSemantic dropping the preserved root.
 * - No doubling when the new codes already include a semantic indicator.
 * - Empty new codes keeping the root alone (clear-but-keep-semantic), or
 *   the empty list when there is no root.
 * - Non-indicator codes filtered out of the new-code list.
 * - Omitted opts defaulting to non-stripping behavior.
 *
 * Does NOT cover:
 * - The primitives themselves: getSemanticRoot, hasSemantic,
 *   filterToIndicators, buildWithSemantic, semanticGoesLast (each has its
 *   own `indicator-utils.*.test.js`).
 * - Integration into the character-level mutation path, see
 *   `ElementHandle.apply-indicators.test.js`.
 * - Integration into the DSL `;;` parser path, see
 *   `BlissParser.double-semicolon.test.js`.
 *
 * @contract: indicator-placement-rule
 */
const defs = {
  B81: { isIndicator: true, indicatorRole: 'verbal' },
  B86: { isIndicator: true, indicatorRole: 'adjectival' },
  B97: { isIndicator: true, semanticIndicator: 'thing', indicatorRole: 'nominal' },
  B98: { isIndicator: true, semanticIndicator: 'thing', indicatorRole: 'nominal', width: 5 },
  B99: { isIndicator: true, indicatorRole: 'nominal' },
  B6436: { isIndicator: true, semanticIndicator: 'abstract', indicatorRole: 'nominal' },
  B291: { isBlissGlyph: true },
  H: { width: 8, height: 8 },
};

describe('indicator-utils.resolveIndicatorCodes', () => {
  describe('when the base carries no semantic root', () => {
    it('returns a single new indicator unchanged', () => {
      expect(resolveIndicatorCodes([], ['B86'], {}, defs)).toEqual(['B86']);
    });

    it('returns multiple new indicators in order', () => {
      expect(resolveIndicatorCodes([], ['B81', 'B86'], {}, defs)).toEqual(['B81', 'B86']);
    });

    it('returns an empty list when no new codes are given', () => {
      expect(resolveIndicatorCodes([], [], {}, defs)).toEqual([]);
    });
  });

  describe('when the base carries a semantic root', () => {
    it('places the root LAST after a verbal addition', () => {
      expect(resolveIndicatorCodes(['B97'], ['B81'], {}, defs)).toEqual(['B81', 'B97']);
    });

    it('places the root LAST after an adjectival addition', () => {
      expect(resolveIndicatorCodes(['B97'], ['B86'], {}, defs)).toEqual(['B86', 'B97']);
    });

    it('places the root FIRST before a nominal addition', () => {
      expect(resolveIndicatorCodes(['B97'], ['B99'], {}, defs)).toEqual(['B97', 'B99']);
    });

    it('resolves a compound semantic root (B98) to its root (B97) on output', () => {
      expect(resolveIndicatorCodes(['B98'], ['B81'], {}, defs)).toEqual(['B81', 'B97']);
    });

    it('keeps the root alone when no new codes are given', () => {
      expect(resolveIndicatorCodes(['B97'], [], {}, defs)).toEqual(['B97']);
    });
  });

  describe('when stripSemantic is set', () => {
    it('drops the preserved root, keeping only the new indicator', () => {
      expect(resolveIndicatorCodes(['B97'], ['B81'], { stripSemantic: true }, defs)).toEqual(['B81']);
    });

    it('returns an empty list when stripping with no new codes', () => {
      expect(resolveIndicatorCodes(['B97'], [], { stripSemantic: true }, defs)).toEqual([]);
    });
  });

  describe('when the new codes already include a semantic indicator', () => {
    it('does not double the root, returning the new codes as given', () => {
      // pins N9 doubling avoidance at the unit level: the new semantic wins,
      // the existing root is not re-appended
      expect(resolveIndicatorCodes(['B97'], ['B98'], {}, defs)).toEqual(['B98']);
    });
  });

  describe('when non-indicator codes are passed as new codes', () => {
    it('filters them out, returning an empty list when none survive', () => {
      expect(resolveIndicatorCodes([], ['H'], {}, defs)).toEqual([]);
    });

    it('filters them out but preserves the existing root', () => {
      expect(resolveIndicatorCodes(['B97'], ['H'], {}, defs)).toEqual(['B97']);
    });
  });

  describe('when opts is omitted', () => {
    it('defaults to non-stripping, preserving the root', () => {
      expect(resolveIndicatorCodes(['B97'], ['B81'], undefined, defs)).toEqual(['B81', 'B97']);
    });
  });
});
