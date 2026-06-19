import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the fate of a word-level indicator overlay (the `;;` channel,
 * `group.wordIndicators`) when a word's glyph list is restructured. The overlay
 * is a WORD property: glyph-list edits that keep the group intact re-anchor it
 * onto the current head automatically, while splitAt and mergeWithNext, which
 * create or destroy a group, route it by a first-wins rule.
 *
 * Covers:
 * - splitAt: the first (left) part always keeps the overlay (word-scoped, not
 *   head-bound), with stripSemantic; `^` is kept iff its glyph lands in the
 *   first part, else it is dropped and the second part re-derives its head, so
 *   split -> merge round-trips the word-slot losslessly.
 * - mergeWithNext: the merged word keeps the first word's overlay; an absorbed
 *   word's overlay is dropped with a loud DROPPED_WORD_INDICATOR warning,
 *   whether or not the first word also carried one. The first word's `^` head
 *   marker is kept and the absorbed word's `^` is dropped silently (the merged
 *   word re-derives a single head), mirroring splitAt's first-wins rule.
 * - Glyph-list edits that keep the group (addGlyph, removeGlyph, replaceGlyph)
 *   and head base-part edits (addPart) leave the overlay floating onto the
 *   current head, with no per-op overlay handling needed.
 *
 * Does NOT cover:
 * - The applyIndicators / clearIndicators overlay API itself, see
 *   `ElementHandle.word-indicators.test.js`.
 * - Builder-level merge / splitAt (whole-builder, group-boundary), see
 *   `BlissSVGBuilder.merge-split.test.js`.
 * - Overlay render / serialize internals, see
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - Warning on no-op indicator mutations (D4), Task 7 (not yet wired).
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

const dropWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'DROPPED_WORD_INDICATOR');

describe('ElementHandle word indicators under structural mutation', () => {
  describe('when splitting a word', () => {
    // The overlay is a WORD property, not head-bound: the FIRST (left) part
    // always keeps it, wherever the head sits. `^` is kept iff its glyph lands
    // in the first part; a marked glyph moved to the second part loses its `^`
    // and that part re-derives its head from defaults (glyph 0). This keeps
    // split -> merge lossless for the word-slot and matches mergeWithNext (R15
    // WS-2 word-slot model, supersedes the R14 "overlay follows the head").
    it('keeps the overlay on the first part when the head stays there', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B313;;B86//B1103');
      // toJSON groups are [left, space, right]; the overlay rides the left word.
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(overlay(b, 2)).toBeUndefined();
    });

    it('keeps the overlay on the first part even when the head moves right', () => {
      const b = new BlissSVGBuilder('B313/B1103^;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B313;;B86//B1103');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(overlay(b, 2)).toBeUndefined();
    });

    it('keeps the stripSemantic flag on the retained first-part overlay', () => {
      const b = new BlissSVGBuilder('B303/B313^;;!B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B303;;!B86//B313');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: true });
    });

    it('drops a head marker that lands in the second part and re-derives its head', () => {
      const b = new BlissSVGBuilder('B303/B313/B431^;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B303;;B86//B313/B431');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(overlay(b, 2)).toBeUndefined();
    });

    it('keeps a head marker that stays in the first part', () => {
      const b = new BlissSVGBuilder('B303/B313^/B431;;B86');
      b.group(0).splitAt(2);
      expect(b.toString()).toBe('B303/B313^;;B86//B431');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });

  describe('when round-tripping a word-slot through split and merge', () => {
    it('keeps the word-slot (split to first part, merge to first word)', () => {
      // WS-2 canonical: the `^` head is in the second part after the split, so it
      // is dropped, but the word-slot survives on the first part and the merge
      // keeps the first word's overlay. Today the slot followed the head into the
      // second part and the merge then dropped it (losing B97 with a warning).
      const b = new BlissSVGBuilder('H/E^;;B97');
      b.group(0).splitAt(1);
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('H/E;;B97');
      expect(overlay(b, 0)).toEqual({ codes: ['B97'], stripSemantic: false });
      expect(dropWarnings(b)).toHaveLength(0);
    });

    it('restores the word byte-identically when no head marker moves', () => {
      // The strongest form of the guarantee: with no `^` to relocate, split then
      // merge returns the exact input (serialize and render), so the word-slot
      // is lossless, not merely surviving.
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      const originalSvg = b.svgCode;
      b.group(0).splitAt(1);
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B313/B1103;;B86');
      expect(b.svgCode).toBe(originalSvg);
      expect(dropWarnings(b)).toHaveLength(0);
    });

    it('restores the word and its head marker when the marker stays in the first part', () => {
      // The `^` glyph lands in the first part, so first-wins keeps it: the merge
      // reconstructs the input byte-for-byte, marker included.
      const b = new BlissSVGBuilder('B303/B313^/B431;;B86');
      const originalSvg = b.svgCode;
      b.group(0).splitAt(2);
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B303/B313^/B431;;B86');
      expect(b.svgCode).toBe(originalSvg);
      expect(dropWarnings(b)).toHaveLength(0);
    });
  });

  describe('when merging two words that both carry an overlay', () => {
    it('keeps the first word overlay on the merged word', () => {
      const b = new BlissSVGBuilder('B313;;B86//B431;;B81');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B313/B431;;B86');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
    });

    it('warns once, naming the dropped absorbed overlay', () => {
      const b = new BlissSVGBuilder('B313;;B86//B431;;B81');
      b.group(0).mergeWithNext();
      const dropped = dropWarnings(b);
      expect(dropped).toHaveLength(1);
      expect(dropped[0].source).toBe(';;B81');
    });

    it('preserves the ; separator when the dropped overlay has multiple codes', () => {
      // pins codes.join(';') in the warning source; a join(',') mutant survives
      // a single-code drop
      const b = new BlissSVGBuilder('B313;;B86//B431;;B81;B82');
      b.group(0).mergeWithNext();
      expect(dropWarnings(b)[0].source).toBe(';;B81;B82');
    });

    it('records the strip marker when the dropped overlay stripped semantics', () => {
      // pins the (stripSemantic ? '!' : '') branch in the warning source; an
      // '!'-to-'' mutant survives drops of plain (non-strip) overlays
      const b = new BlissSVGBuilder('B313;;B86//B431;;!B81');
      b.group(0).mergeWithNext();
      expect(dropWarnings(b)[0].source).toBe(';;!B81');
    });
  });

  describe('when merging an overlaid word into one with no overlay', () => {
    it('drops the absorbed overlay and warns', () => {
      const b = new BlissSVGBuilder('B313//B431;;B81');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B313/B431');
      expect(overlay(b, 0)).toBeUndefined();
      expect(dropWarnings(b)).toHaveLength(1);
    });
  });

  describe('when the absorbed neighbor carries no overlay', () => {
    it('keeps the overlay and warns nothing', () => {
      // pins the `if (nextGroup.wordIndicators)` guard: an `if (true)` mutant
      // would destructure undefined and throw on this merge
      const b = new BlissSVGBuilder('B313;;B86//B431');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B313/B431;;B86');
      expect(dropWarnings(b)).toHaveLength(0);
    });
  });

  describe('when the absorbed word carries the head marker', () => {
    it('drops the absorbed head marker and re-derives the merged head', () => {
      // WS-3 word-slot model: `^` is word-scoped and first-wins, so the absorbed
      // (second) word's head marker is dropped silently and the merged word
      // re-derives its head from glyph 0; the first word's overlay then floats
      // onto that re-derived head. Supersedes the R14 "float onto the
      // absorbed-origin head" (which kept B431^).
      const b = new BlissSVGBuilder('B303;;B86//B313/B431^');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B303/B313/B431;;B86');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(dropWarnings(b)).toHaveLength(0);
    });

    it('keeps the first word head marker and drops only the absorbed one', () => {
      // pins clear-absorbed-only (not clear-all): the first word's `^` on a
      // non-zero glyph survives the merge while the absorbed word's `^` is
      // dropped, leaving a single head. A clear-all mutant would drop B304^;
      // a clear-none mutant would keep B431^.
      const b = new BlissSVGBuilder('B303/B304^;;B86//B313/B431^');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B303/B304^/B313/B431;;B86');
      expect(dropWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a merged-away head marker could resurface after a later edit', () => {
    it('clears the absorbed head stamp so removing the first head re-derives glyph 0', () => {
      // F1 (WS-3 review): merging two `^`-words must DE-DUPE the head stamps,
      // not just mask the second one behind the first. Without clearing the
      // absorbed `^`, removing the first word's head later surfaces B431 as a
      // stale head; clearing it lets the merged word re-derive glyph 0.
      const b = new BlissSVGBuilder('B303/B304^;;B86//B313/B431^');
      b.group(0).mergeWithNext();
      b.group(0).removeGlyph(1);
      expect(b.toString()).toBe('B303/B313/B431;;B86');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });

  describe('when a later mutation rebuilds after a dropped overlay', () => {
    it('keeps the drop warning across the subsequent rebuild', () => {
      // pins the #mutationWarnings lifetime: it is not reset by #rebuild, so a
      // second structural mutation must not wipe the earlier drop warning
      const b = new BlissSVGBuilder('B313;;B86//B431;;B81');
      b.group(0).mergeWithNext();
      b.group(0).addGlyph('B291');
      expect(dropWarnings(b)).toHaveLength(1);
    });
  });

  describe('when removing the head glyph of an overlaid word', () => {
    it('re-anchors the overlay to the new head', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).removeGlyph(0);
      expect(b.toString()).toBe('B1103;;B86');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });

  describe('when removing a non-head glyph of an overlaid word', () => {
    it('keeps the overlay on the head', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).removeGlyph(1);
      expect(b.toString()).toBe('B313;;B86');
    });
  });

  describe('when appending a glyph to an overlaid word', () => {
    it('keeps the overlay on the existing head', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).addGlyph('B431');
      expect(b.toString()).toBe('B313/B1103/B431;;B86');
    });
  });

  describe('when replacing the head glyph of an overlaid word', () => {
    it('floats the overlay onto the replacement head', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).replaceGlyph(0, 'B431');
      expect(b.toString()).toBe('B431/B1103;;B86');
    });
  });

  describe('when editing the head glyph base parts of an overlaid word', () => {
    it('re-resolves the overlay onto the edited head', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).glyph(0).addPart('B331');
      expect(b.toString()).toBe('B313;B331/B1103;;B86');
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });
});
