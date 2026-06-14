import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';
import { mergeWordIndicatorsOntoHead } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.mergeWordIndicatorsOntoHead: the decode-time merge of
 * a word-level overlay ({ codes, stripSemantic }) onto a head glyph's parts.
 * It is the single resolve used at render and (under flatten) at serialize, so
 * the DSL `;;` path and the API word-level path cannot drift.
 *
 * Contract: returns a NEW parts array of [...baseParts, ...resolvedIndicators]
 * where the resolved indicators come from resolveIndicatorCodes (replace-all
 * with semantic-root preservation), are appended strictly after every base
 * part, and each carry an `_indicatorOrigin: 'word'` tag for introspection.
 * Base parts are returned untouched (no origin tag, no mutation of the input).
 *
 * Covers:
 * - Appending a new indicator after a base with no existing indicator.
 * - The word-origin tag on appended parts; none on base parts.
 * - Semantic-root placement and preservation via resolveIndicatorCodes.
 * - stripSemantic dropping the root; empty overlay clearing to base-only.
 * - Replace-all of an existing grammatical indicator.
 * - No doubling when the overlay already carries a semantic indicator.
 * - The defensive guard: parts with a non-indicator after an indicator are
 *   returned unchanged.
 * - Non-mutation of the input glyph.
 *
 * Does NOT cover:
 * - The decision logic itself, see
 *   `indicator-utils.resolve-indicator-codes.test.js`.
 * - Wiring into render (#rebuild) and serialize, see the builder-level
 *   `;;` round-trip tests.
 *
 * @contract: indicator-placement-rule
 */
const parse = (code) => BlissParser.parse(code);
const headFrom = (dsl) => BlissParser.parse(dsl).groups[0].glyphs[0];
const codesOf = (parts) => parts.map(p => p.codeName);
const merge = (head, overlay) =>
  mergeWordIndicatorsOntoHead(head, overlay, blissElementDefinitions, parse);

describe('indicator-utils.mergeWordIndicatorsOntoHead', () => {
  describe('when the head has no existing indicator', () => {
    it('appends the new indicator after the base part', () => {
      expect(codesOf(merge(headFrom('B291'), { codes: ['B86'] }))).toEqual(['B291', 'B86']);
    });

    it('tags the appended indicator part with word origin', () => {
      const merged = merge(headFrom('B291'), { codes: ['B86'] });
      expect(merged[1]._indicatorOrigin).toBe('word');
    });

    it('leaves the base part without an origin tag', () => {
      const merged = merge(headFrom('B291'), { codes: ['B86'] });
      expect(merged[0]._indicatorOrigin).toBeUndefined();
    });
  });

  describe('when the head carries a semantic root', () => {
    it('places the root after a verbal addition', () => {
      expect(codesOf(merge(headFrom('B291;B97'), { codes: ['B81'] }))).toEqual(['B291', 'B81', 'B97']);
    });

    it('keeps the root alone when the overlay is empty', () => {
      expect(codesOf(merge(headFrom('B291;B97'), { codes: [] }))).toEqual(['B291', 'B97']);
    });
  });

  describe('when stripSemantic is set', () => {
    it('drops the root, keeping only the new indicator', () => {
      expect(codesOf(merge(headFrom('B303;B97'), { codes: ['B86'], stripSemantic: true })))
        .toEqual(['B303', 'B86']);
    });

    it('clears to base-only when the overlay is empty', () => {
      expect(codesOf(merge(headFrom('B291;B97'), { codes: [], stripSemantic: true })))
        .toEqual(['B291']);
    });
  });

  describe('when the head carries a grammatical indicator', () => {
    it('replaces it with the new indicator (replace-all)', () => {
      expect(codesOf(merge(headFrom('B291;B81'), { codes: ['B86'] }))).toEqual(['B291', 'B86']);
    });
  });

  describe('when the overlay codes already include a semantic indicator', () => {
    it('does not double the root', () => {
      expect(codesOf(merge(headFrom('B291;B97'), { codes: ['B98'] }))).toEqual(['B291', 'B98']);
    });
  });

  describe('when parts contain a non-indicator after an indicator', () => {
    it('returns the parts unchanged (defensive guard)', () => {
      // A clean base+indicator shape is the norm from the parser; this pins
      // the guard that refuses to merge onto an ambiguous mixed shape.
      const messy = { parts: [{ codeName: 'B291' }, { codeName: 'B81', isIndicator: true }, { codeName: 'B291' }] };
      expect(codesOf(merge(messy, { codes: ['B86'] }))).toEqual(['B291', 'B81', 'B291']);
    });
  });

  describe('when the merge completes', () => {
    it('does not mutate the input glyph parts', () => {
      const head = headFrom('B291;B97');
      const before = codesOf(head.parts);
      merge(head, { codes: ['B81'] });
      expect(codesOf(head.parts)).toEqual(before);
    });
  });
});
