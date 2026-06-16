import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the fate of a word-level indicator overlay (the `;;` channel,
 * `group.wordIndicators`) when a word's glyph list is restructured. The overlay
 * is group-scoped and floats to whichever glyph currently resolves as the head,
 * so glyph-list edits that keep the group intact re-anchor it automatically;
 * splitAt and mergeWithNext, which create or destroy a group, route it
 * explicitly.
 *
 * Covers:
 * - splitAt: the overlay follows the head — it stays on the left half when the
 *   head stays left, and moves to the right half (clearing the left) when the
 *   head moves right; stripSemantic travels with it.
 * - mergeWithNext: the merged word keeps the first word's overlay; an absorbed
 *   word's overlay is dropped with a loud DROPPED_WORD_INDICATOR warning,
 *   whether or not the first word also carried one.
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
  describe('when splitting a word whose head stays in the left half', () => {
    it('keeps the overlay on the left half and gives the right half none', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B313;;B86//B1103');
      // toJSON groups are [left, space, right]; the overlay rides the left word.
      expect(overlay(b, 0)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(overlay(b, 2)).toBeUndefined();
    });
  });

  describe('when splitting a word whose head moves to the right half', () => {
    it('moves the overlay to the right half and clears it from the left', () => {
      const b = new BlissSVGBuilder('B313/B1103^;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B313//B1103;;B86');
      expect(overlay(b, 0)).toBeUndefined();
      expect(overlay(b, 2)).toEqual({ codes: ['B86'], stripSemantic: false });
    });

    it('carries the stripSemantic flag with the moved overlay', () => {
      const b = new BlissSVGBuilder('B303/B313^;;!B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B303//B313;;!B86');
      expect(overlay(b, 2)).toEqual({ codes: ['B86'], stripSemantic: true });
    });
  });

  describe('when splitting a word whose head is past the split point', () => {
    it('moves the overlay to the right half across more than one glyph', () => {
      // pins the headIndex > glyphIndex branch (a >=-to-=== mutant survives the
      // two-glyph cases, where headIndex only ever equals or undercuts the split)
      const b = new BlissSVGBuilder('B303/B313/B431^;;B86');
      b.group(0).splitAt(1);
      expect(b.toString()).toBe('B303//B313/B431^;;B86');
      expect(overlay(b, 0)).toBeUndefined();
      expect(overlay(b, 2)).toEqual({ codes: ['B86'], stripSemantic: false });
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

  describe('when the merged head comes from the absorbed word', () => {
    it('floats the kept overlay onto the absorbed-origin head', () => {
      // settled float-to-current-head consequence: the first word's overlay
      // resolves onto the head marker carried by the second (absorbed) word
      const b = new BlissSVGBuilder('B303;;B86//B313/B431^');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B303/B313/B431^;;B86');
      expect(dropWarnings(b)).toHaveLength(0);
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
