import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the head-marker (`^`) contract cross-product matrix: marker
 * placement x fragment position x exclusion interplay x word shape x
 * decorations, per the test-matrix requirement in
 * `.claude/backlog/head-marker-contract.md`.
 *
 * Covers:
 * - Markers riding single-character alias chains and aliases to composed
 *   characters (rule 1 character equivalence).
 * - Definition-internal markers at first/middle/last position and on an
 *   exclusion character; designation redirect from any scan stop inside
 *   the fragment (rule 4).
 * - Nested designations at alias depth 2: active redirect chains and
 *   dormancy through an outer alias whose own head is plain fallback.
 * - Exclusion interplay: multi-exclusion prefixes, never-head B233,
 *   all-exclusion fragments, the B10/B4 conditional exception across a
 *   fragment boundary, low-priority-only words.
 * - Multi-word definitions (`//` in codeString) merging into surrounding
 *   words: per-segment designations redirect only within their final word.
 * - `;`/`;;` word indicators attaching to the contract-resolved head.
 * - Decorations (options prefix, position suffix) on marked and unmarked
 *   alias invocations, and scan immunity to decorations on characters.
 *
 * Does NOT cover:
 * - The ten acceptance fixtures and warning exactness, see
 *   `BlissParser.head-marker-contract.test.js`.
 * - toString()/toJSON() re-emission, see
 *   `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - Exclusion priority tiers without aliases involved, see
 *   `BlissParser.head-glyph-exclusions.test.js`.
 *
 * @contract: head-marker-contract
 */
describe('BlissParser head-marker matrix', () => {
  const HMM_DEFS = {
    _HMM_CD: { codeString: 'B313/B208' },
    _HMM_CDH: { codeString: 'B313/B208^' },
    _HMM_CHAIN1: { codeString: 'B313' },
    _HMM_CHAIN2: { codeString: '_HMM_CHAIN1' },
    _HMM_COMPOSED: { codeString: 'B313;B303' },
    _HMM_MID: { codeString: 'B291/B313^/B208' },
    _HMM_LAST: { codeString: 'B291/B313/B208^' },
    _HMM_OPP_MARK: { codeString: 'B313/B486^/B208' },
    _HMM_NEST_OUTER: { codeString: 'B486/_HMM_CDH' },
    _HMM_NEST_PLAIN: { codeString: 'B291/_HMM_CDH' },
    _HMM_ALL_OPP_MARK: { codeString: 'B486^/B368' },
    _HMM_COND: { codeString: 'B10/B4' },
    _HMM_CONDH: { codeString: 'B10/B4^' },
    _HMM_LOWP_MARK: { codeString: 'B401^/B699' },
    _HMM_SENT: { codeString: 'B313/B208^//B291' },
    _HMM_SENT_PLAIN: { codeString: 'B313//B291' },
  };
  beforeAll(() => BlissSVGBuilder.define(HMM_DEFS));
  afterAll(() => Object.keys(HMM_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const markedIndexes = (parsed, groupIndex = 0) =>
    parsed.groups[groupIndex].glyphs.flatMap((g, i) => (g.isHeadGlyph === true ? [i] : []));

  // Resolved per-glyph part codes (first group) after the R14 `;;` overlay is
  // merged onto the contract-resolved head at render.
  const resolvedGlyphParts = (dsl) =>
    new BlissSVGBuilder(dsl).snapshot().children[0].children
      .filter(c => c.isGlyph)
      .map(g => g.children.map(p => p.codeName));

  describe('when ^ rides a single-character alias chain', () => {
    it('honors the marker through a two-level chain to a single character', () => {
      const r = BlissParser.parse('B101/_HMM_CHAIN2^');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('honors the marker on an alias resolving to a composed character', () => {
      const r = BlissParser.parse('B101/_HMM_COMPOSED^');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r.groups[0].glyphs[1].parts.map(p => p.codeName)).toEqual(['B313', 'B303']);
      expect(r._parseWarnings).toBeUndefined();
    });
  });

  describe('when a definition designates its head at different positions', () => {
    it('crowns a middle-marked character when the definition stands alone', () => {
      expect(markedIndexes(BlissParser.parse('_HMM_MID'))).toEqual([1]);
    });

    it('crowns a last-marked character when the definition stands alone', () => {
      expect(markedIndexes(BlissParser.parse('_HMM_LAST'))).toEqual([2]);
    });

    it('crowns a marked exclusion even though the scan stops on an earlier fragment character', () => {
      // Scan stops at B313 (index 0); the fragment designates B486 (rule 4
      // redirect targets the designation, not the scan stop).
      expect(markedIndexes(BlissParser.parse('_HMM_OPP_MARK'))).toEqual([1]);
    });
  });

  describe('when the designation sits at nested alias depth 2', () => {
    it('redirects through both levels when the outer alias stands alone', () => {
      expect(markedIndexes(BlissParser.parse('_HMM_NEST_OUTER'))).toEqual([2]);
    });

    it('redirects through both levels behind an exclusion prefix', () => {
      expect(markedIndexes(BlissParser.parse('B486/_HMM_NEST_OUTER'))).toEqual([3]);
    });

    it('keeps a depth-2 designation dormant when the scan stops before the outer alias', () => {
      const r = BlissParser.parse('B291/_HMM_NEST_OUTER');

      expect(markedIndexes(r)).toEqual([]);
      expect(r._parseWarnings).toBeUndefined();
    });

    it('keeps an inner designation dormant when the outer alias resolves to a plain fallback head', () => {
      // _HMM_NEST_PLAIN's own scan stops on plain B291, so the alias
      // contributes no designation; the inner B208 marker never surfaces.
      expect(markedIndexes(BlissParser.parse('B486/_HMM_NEST_PLAIN'))).toEqual([1]);
    });
  });

  describe('when exclusions interact with embedded designations', () => {
    it('redirects after skipping multiple exclusion characters', () => {
      expect(markedIndexes(BlissParser.parse('B486/B368/_HMM_CDH'))).toEqual([3]);
    });

    it('redirects after skipping the never-head B233', () => {
      expect(markedIndexes(BlissParser.parse('B233/_HMM_CDH'))).toEqual([2]);
    });

    it('crowns the transparent alias characters by plain scan when nothing is designated', () => {
      expect(markedIndexes(BlissParser.parse('B486/_HMM_CD'))).toEqual([1]);
    });

    it('redirects inside an all-exclusion fragment to its marked exclusion', () => {
      // All characters are exclusions: the priority pick lands on B368
      // (index 1), inside the fragment, whose designation is B486.
      expect(markedIndexes(BlissParser.parse('_HMM_ALL_OPP_MARK'))).toEqual([0]);
    });

    it('keeps an all-exclusion fragment designation dormant behind a non-excluded character', () => {
      expect(markedIndexes(BlissParser.parse('B291/_HMM_ALL_OPP_MARK'))).toEqual([]);
    });

    it('applies the B10/B4 conditional exception across the fragment boundary', () => {
      // B10 is not excluded when followed by B4, so the scan stops at B10.
      expect(markedIndexes(BlissParser.parse('B486/_HMM_COND'))).toEqual([1]);
    });

    it('redirects from the conditional-exception stop to the fragment designation', () => {
      expect(markedIndexes(BlissParser.parse('B486/_HMM_CONDH'))).toEqual([2]);
    });

    it('redirects inside a low-priority-only fragment to its marked character', () => {
      // B401 and B699 are both low-priority; the pick lands on the last
      // (B699), inside the fragment, whose designation is B401.
      expect(markedIndexes(BlissParser.parse('_HMM_LOWP_MARK'))).toEqual([0]);
    });
  });

  describe('when a multi-word definition merges into surrounding words', () => {
    it('crowns each word of the bare definition by its own resolution', () => {
      const r = BlissParser.parse('_HMM_SENT');

      expect(markedIndexes(r, 0)).toEqual([1]);
      expect(markedIndexes(r, 2)).toEqual([]);
    });

    it('redirects within the merged first word behind an exclusion', () => {
      const r = BlissParser.parse('B486/_HMM_SENT');

      expect(markedIndexes(r, 0)).toEqual([2]);
      expect(markedIndexes(r, 2)).toEqual([]);
    });

    it('keeps the first-segment designation dormant behind a plain character', () => {
      const r = BlissParser.parse('B291/_HMM_SENT');

      expect(markedIndexes(r, 0)).toEqual([]);
      expect(markedIndexes(r, 2)).toEqual([]);
    });

    it('resolves markers on each side of a definition word-break in their own words', () => {
      // The definition's // splits the input into two final words; the two
      // written markers land in different word-strings, so both crown and
      // neither triggers MULTIPLE_HEAD_MARKERS.
      const r = BlissParser.parse('B208^/_HMM_SENT_PLAIN/B101^');

      expect(markedIndexes(r, 0)).toEqual([0]);
      expect(markedIndexes(r, 2)).toEqual([1]);
      expect(r._parseWarnings).toBeUndefined();
    });
  });

  describe('when word-level indicators attach via the resolved head', () => {
    it('attaches ;; indicators to the designated character of a standalone alias', () => {
      const glyphs = resolvedGlyphParts('_HMM_CDH;;B86');

      expect(glyphs[1]).toEqual(['B208', 'B86']);
      expect(glyphs[0]).toEqual(['B313']);
    });

    it('attaches ;; indicators to the redirect target behind an exclusion', () => {
      const glyphs = resolvedGlyphParts('B486/_HMM_CDH;;B86');

      expect(glyphs[2]).toEqual(['B208', 'B86']);
    });

    it('attaches ;; indicators to the scan stop when the designation is dormant', () => {
      const glyphs = resolvedGlyphParts('B291/_HMM_CDH;;B86');

      expect(glyphs[0]).toEqual(['B291', 'B86']);
      expect(glyphs[2]).toEqual(['B208']);
    });

    it('attaches ; indicators to the designated character of an alias invocation', () => {
      const r = BlissParser.parse('_HMM_CDH;B86');

      expect(r.groups[0].glyphs[1].parts.map(p => p.codeName)).toEqual(['B208', 'B86']);
    });
  });

  describe('when alias invocations carry decorations', () => {
    it('keeps the designation active under an options prefix', () => {
      const r = BlissParser.parse('[color=red]_HMM_CDH');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r.groups[0].glyphs[0].options).toEqual({ color: 'red' });
    });

    it('keeps the designation active under a position suffix', () => {
      const r = BlissParser.parse('_HMM_CDH:2,0');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r.groups[0].glyphs[0].parts[0].x).toBe(2);
    });

    it('redirects past an exclusion onto a decorated alias invocation', () => {
      // The [color=red] prefix decorates the fragment's first part string;
      // the scan must still recognize B313 underneath and redirect to B208.
      expect(markedIndexes(BlissParser.parse('B486/[color=red]_HMM_CDH'))).toEqual([2]);
    });

    it('honors a marker on a decorated single-character alias', () => {
      const r = BlissParser.parse('B101/[color=red]_HMM_CHAIN2^');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r.groups[0].glyphs[1].options).toEqual({ color: 'red' });
      expect(r._parseWarnings).toBeUndefined();
    });

    it('drops a marker on a decorated multi-character alias and keeps the decoration', () => {
      const r = BlissParser.parse('[color=red]_HMM_CDH^');

      expect(markedIndexes(r)).toEqual([1]);
      expect(r.groups[0].glyphs[0].options).toEqual({ color: 'red' });
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'HEAD_MARKER_ON_WORD' })]);
    });

    it('drops a marker on a position-suffixed multi-character alias and keeps the position', () => {
      const r = BlissParser.parse('_HMM_CD:2,0^');

      expect(markedIndexes(r)).toEqual([]);
      expect(r.groups[0].glyphs[0].parts[0].x).toBe(2);
      expect(r._parseWarnings).toEqual([expect.objectContaining({ code: 'HEAD_MARKER_ON_WORD' })]);
    });
  });

  describe('when the scan meets decorated characters', () => {
    it('skips a part-level-optioned exclusion character', () => {
      expect(markedIndexes(BlissParser.parse('[color=red]>B486/B208'))).toEqual([1]);
    });

    it('skips an options-prefixed composite exclusion character', () => {
      expect(markedIndexes(BlissParser.parse('[color=red]B486;B303/B291'))).toEqual([1]);
    });
  });
});
