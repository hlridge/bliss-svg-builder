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
 *   exactly as a marker on that character; `^` on a space (TSP/QSP/ZSA) is
 *   dropped with the same warning — a space cannot be a word's head (round-2
 *   review F1).
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

  describe('when ^ is misplaced on the base before the character indicator (rule 1)', () => {
    // A head marker attaches to the END of a character, after its indicators
    // (B291;B81^). A character includes its indicators, so B291;B81 does not end
    // after B291: writing the marker on the base before the indicator separator
    // (B291^;B81) is MISPLACED, not a synonym for the trailing form. The marker
    // is dropped with a MISPLACED_HEAD_MARKER warning (parallel to a ^ on a
    // multi-character alias), but the base and indicator are preserved.
    // Previously `B291^` was looked up as an unknown code and the base was
    // SILENTLY dropped (parts became [null, B81]).
    const partsOf = (input) =>
      BlissParser.parse(input).groups[0].glyphs.map(g => g.parts.map(p => p.codeName));

    it('preserves the base and indicator but drops the misplaced marker (B291^;B81)', () => {
      const r = BlissParser.parse('B291^;B81');

      expect(partsOf('B291^;B81')).toEqual([['B291', 'B81']]);
      expect(markedIndexes(r)).toEqual([]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
      // pins drop+warn for a ^ before the indicator; previously the base was lost to [null, B81].
    });

    it('names the offending token and points to the trailing form in the warning', () => {
      const r = BlissParser.parse('B291^;B81');

      expect(r._parseWarnings[0].source).toBe('B291^;B81');
      expect(r._parseWarnings[0].message).toContain('B291;B81^');
    });

    it('does not crown a misplaced marker in a multi-glyph word (B291/B313^;B81)', () => {
      // The marker is ignored, so the head falls back to the default (index 0),
      // unlike the valid trailing form B291/B313;B81^ which crowns B313.
      const r = BlissParser.parse('B291/B313^;B81');

      expect(partsOf('B291/B313^;B81')).toEqual([['B291'], ['B313', 'B81']]);
      expect(markedIndexes(r)).toEqual([]);
      expect(markedIndexes(BlissParser.parse('B291/B313;B81^'))).toEqual([1]);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' })]);
    });
  });

  describe('when ^ is written on a space (rule 1 target validity)', () => {
    // regression: round-2 external review F1 — 'TSP^' stored isHeadGlyph on
    // the space glyph with zero warnings while toString emitted '//', so the
    // designation silently vanished on reparse. A space cannot be a word's
    // head: the marker is dropped with a warning at parse.
    it.each(['TSP^', 'QSP^', 'ZSA^'])('drops the marker on %s with a MISPLACED_HEAD_MARKER warning', (input) => {
      const b = new BlissSVGBuilder(input);
      expect(b.warnings.map(w => w.code)).toContain('MISPLACED_HEAD_MARKER');
      const marked = b.toJSON().groups.flatMap(g => g.glyphs ?? []).filter(g => g.isHeadGlyph === true);
      expect(marked).toHaveLength(0);
    });

    it('stores no designation for the space serialization to eat', () => {
      const b = new BlissSVGBuilder('TSP^');
      expect(b.toString()).toBe('//');
      expect(b.toJSON().groups.flatMap(g => g.glyphs ?? []).some(g => g.isHeadGlyph === true)).toBe(false);
    });

    it('drops a marker on a space inside a mixed word too', () => {
      // the designation itself is invalid on a space; the in-word space then
      // canonicalizes into a real space group (round-4 review F1), so the
      // output is the word plus a trailing space.
      const b = new BlissSVGBuilder('B291/TSP^');
      expect(b.warnings.map(w => w.code)).toContain('MISPLACED_HEAD_MARKER');
      expect(b.toString()).toBe('B291//');
    });

    it('leaves ordinary space words untouched (no over-reach)', () => {
      const b = new BlissSVGBuilder('B291//B291');
      expect(b.toString()).toBe('B291//B291');
      expect(b.warnings).toEqual([]);
    });
  });
});
