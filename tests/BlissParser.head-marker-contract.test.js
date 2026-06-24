import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the head-marker (`^`) contract decided 2026-06-11: `^` belongs to
 * characters. The ten acceptance fixtures from
 * `.claude/backlog/head-marker-contract.md` land here verbatim, plus the
 * warning-exactness rules (MISPLACED_HEAD_MARKER for markers on
 * multi-character aliases; MULTIPLE_HEAD_MARKERS only for two written
 * markers in the same word-string).
 *
 * Covers:
 * - Rule 1: `^` on a multi-character alias is dropped with a
 *   MISPLACED_HEAD_MARKER warning; `^` on a single-character alias behaves
 *   exactly as a marker on that character.
 * - Rule 2: one head per word-string; a written marker outranks a dormant
 *   embedded designation regardless of order; dropped markers do not count
 *   toward MULTIPLE_HEAD_MARKERS; `//`-words resolve independently.
 * - Rule 3: with no usable marker the automatic scan crowns the first
 *   non-excluded character (index 0 stays unmarked; downstream defaults).
 * - Rule 4: an embedded alias's internal `^` acts only when the automatic
 *   scan stops on that alias's characters (head-position courtesy),
 *   including the silent `(A^B)(C^D)` case that used to warn.
 *
 * Does NOT cover:
 * - The systematic placement/position/exclusion/decoration cross-product,
 *   see `BlissParser.head-marker-matrix.test.js`.
 * - toString()/toJSON() re-emission of resolved heads, see
 *   `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - Direct-on-character marker grammar and fallback heuristics predating
 *   the contract, see `BlissParser.head-glyph.test.js` and
 *   `BlissParser.head-glyph-exclusions.test.js`.
 *
 * @contract: head-marker-contract
 */
describe('BlissParser head-marker contract', () => {
  // Fixture notation from the contract doc: (...) = alias, letters =
  // characters, B486 = exclusion. A=B291, B=B1103, C=B313, D=B208,
  // E=B167, F=B431, W=B313.
  const HMC_DEFS = {
    _HMC_CD: { codeString: 'B313/B208' },
    _HMC_CDH: { codeString: 'B313/B208^' },
    _HMC_AH: { codeString: 'B291^/B313' },
    _HMC_CH: { codeString: 'B313^/B208' },
    _HMC_EF: { codeString: 'B167/B431' },
    _HMC_XW: { codeString: 'B486/B313' },
    _HMC_C1: { codeString: 'B313' },
  };
  beforeAll(() => BlissSVGBuilder.define(HMC_DEFS));
  afterAll(() => Object.keys(HMC_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  // Index of the effective head in the first word, via the snapshot tree
  // (resolves the parser's "index 0 stays unmarked" default to a crown).
  const crownOf = (input) => {
    const glyphs = new BlissSVGBuilder(input).elements.children[0].children.filter(c => c.isGlyph);
    return glyphs.findIndex(g => g.isHeadGlyph);
  };

  const markedIndexes = (parsed, groupIndex = 0) =>
    parsed.groups[groupIndex].glyphs.flatMap((g, i) => (g.isHeadGlyph === true ? [i] : []));

  describe('when ^ is written on a multi-character alias (rule 1)', () => {
    it('drops the marker, warns, and the scan crowns the first character (AB(CD)^)', () => {
      const r = BlissParser.parse('B291/B1103/_HMC_CD^');

      expect(markedIndexes(r)).toEqual([]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
      expect(crownOf('B291/B1103/_HMC_CD^')).toBe(0);
    });

    it('names the alias and the multi-character expansion in the warning', () => {
      const r = BlissParser.parse('B291/B1103/_HMC_CD^');

      expect(r._parseWarnings).toEqual([{
        code: 'MISPLACED_HEAD_MARKER',
        message: 'Head marker (^) ignored on "_HMC_CD": it expands to multiple characters. Mark a single character instead.',
        source: '_HMC_CD',
      }]);
    });

    it('drops an outer marker even when the alias carries an internal marker (AB(CD^)^)', () => {
      const r = BlissParser.parse('B291/B1103/_HMC_CDH^');

      expect(markedIndexes(r)).toEqual([]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
      expect(crownOf('B291/B1103/_HMC_CDH^')).toBe(0);
    });

    it('crowns the post-exclusion scan stop after dropping the marker ((B486 W)^)', () => {
      const r = BlissParser.parse('_HMC_XW^');

      // The dropped ^ leaves no designation; the post-exclusion scan stop
      // (B313, index 1) is now resolved at query time (R15 WS-4), not stamped.
      expect(markedIndexes(r)).toEqual([]);
      expect(crownOf('_HMC_XW^')).toBe(1);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
    });
  });

  describe('when ^ marks a single-character alias (rule 1)', () => {
    it('behaves exactly as a marker on that character (AB(C)^)', () => {
      const r = BlissParser.parse('B291/B1103/_HMC_C1^');

      expect(markedIndexes(r)).toEqual([2]);
      expect(r._parseWarnings).toBeUndefined();
    });
  });

  describe('when an embedded alias carries an internal marker (rule 4)', () => {
    it('keeps the designation dormant when the scan stops on a plain character (AB(CD^))', () => {
      const r = BlissParser.parse('B291/B1103/_HMC_CDH');

      expect(markedIndexes(r)).toEqual([]);
      expect(r._parseWarnings).toBeUndefined();
      expect(crownOf('B291/B1103/_HMC_CDH')).toBe(0);
    });

    it('redirects the crown to the designated character when the scan stops inside the alias (B486(CD^))', () => {
      const r = BlissParser.parse('B486/_HMC_CDH');

      expect(markedIndexes(r)).toEqual([2]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('crowns the designation when the marked fragment opens the word ((CD^)(EF))', () => {
      const r = BlissParser.parse('_HMC_CDH/_HMC_EF');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('crowns the designation when the marked fragment stands alone ((CD^))', () => {
      const r = BlissParser.parse('_HMC_CDH');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r._parseWarnings).toBeUndefined();
    });
  });

  describe('when designations exist in two embedded aliases (rule 2 scoping)', () => {
    it('crowns the head-position designation silently, leaving the second dormant ((A^B)(C^D))', () => {
      // Headline contract change: this input used to emit
      // MULTIPLE_HEAD_MARKERS. The markers sit in two different
      // word-strings, so the parser must stay silent.
      const r = BlissParser.parse('_HMC_AH/_HMC_CH');

      expect(markedIndexes(r)).toEqual([0]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('redirects to the first fragment designation after dropping an outer marker ((A^B)(CD)^)', () => {
      const r = BlissParser.parse('_HMC_AH/_HMC_CD^');

      expect(markedIndexes(r)).toEqual([0]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
    });
  });

  describe('when a written marker shares the word with a fragment designation (rule 2)', () => {
    it('prefers the written marker when it follows the marked fragment', () => {
      const r = BlissParser.parse('_HMC_CDH/B208^');

      expect(markedIndexes(r)).toEqual([2]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('prefers the written marker when it precedes the marked fragment', () => {
      const r = BlissParser.parse('B208^/_HMC_CDH');

      expect(markedIndexes(r)).toEqual([0]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('warns MULTIPLE_HEAD_MARKERS for two written markers in one word-string', () => {
      // The single-character alias counts as a written character marker.
      const r = BlissParser.parse('B291^/_HMC_C1^');

      expect(markedIndexes(r)).toEqual([0]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MULTIPLE_HEAD_MARKERS' })]);
    });

    it('does not count a dropped word-marker toward MULTIPLE_HEAD_MARKERS', () => {
      const r = BlissParser.parse('B291^/_HMC_CD^');

      expect(markedIndexes(r)).toEqual([0]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
    });
  });

  describe('when //-separated words each carry their own resolution (rule 2)', () => {
    it('crowns each word independently without cross-word warnings', () => {
      const r = BlissParser.parse('_HMC_CDH//B101/B208^');

      expect(markedIndexes(r, 0)).toEqual([1]);
      expect(markedIndexes(r, 2)).toEqual([1]);
      expect(r._parseWarnings).toBeUndefined();
    });
  });

  describe('when ^ sits on the base before the character indicator (rule 1)', () => {
    // A character may carry indicators (B291;B81); the head marker belongs to the
    // whole CHARACTER, so writing it on the base before the indicator separator
    // (B291^;B81) marks that character, identical to the canonical trailing form
    // (B291;B81^). Previously `B291^` was looked up as an unknown code and the
    // base was SILENTLY dropped (parts became [null, B81]).
    const partsOf = (input) =>
      BlissParser.parse(input).groups[0].glyphs.map(g => g.parts.map(p => p.codeName));
    const svgEq = (a, b) => new BlissSVGBuilder(a).svgCode === new BlissSVGBuilder(b).svgCode;

    it('marks the character and keeps its base and indicator (B291^;B81)', () => {
      expect(partsOf('B291^;B81')).toEqual([['B291', 'B81']]);
      expect(markedIndexes(BlissParser.parse('B291^;B81'))).toEqual([0]);
      expect(BlissParser.parse('B291^;B81')._parseWarnings).toBeUndefined();
      // pins the ^-before-; head marker; previously dropped the base to [null, B81].
    });

    it('resolves identically to the canonical trailing form (B291^;B81 == B291;B81^)', () => {
      expect(partsOf('B291^;B81')).toEqual(partsOf('B291;B81^'));
      expect(svgEq('B291^;B81', 'B291;B81^')).toBe(true);
    });

    it('marks the correct glyph in a multi-glyph word (B291/B313^;B81)', () => {
      expect(partsOf('B291/B313^;B81')).toEqual([['B291'], ['B313', 'B81']]);
      expect(markedIndexes(BlissParser.parse('B291/B313^;B81'))).toEqual([1]);
      expect(svgEq('B291/B313^;B81', 'B291/B313;B81^')).toBe(true);
    });

    it('crowns an explicitly-marked exclusion before its indicator (B486^;B81/B313)', () => {
      // Explicit ^ overrides the exclusion tier even when written before the
      // character's indicator; equivalent to the trailing form B486;B81^.
      expect(partsOf('B486^;B81/B313')).toEqual(partsOf('B486;B81^/B313'));
      expect(markedIndexes(BlissParser.parse('B486^;B81/B313')))
        .toEqual(markedIndexes(BlissParser.parse('B486;B81^/B313')));
    });
  });
});
