import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the space invariant across structural mutation and object input: a
 * space glyph never carries a head designation and an all-space word never
 * carries a `;;` overlay — state the space serialization (`//`) would eat,
 * making toString diverge from toJSON and the reparse lose it (round-3
 * external review F1). The invariant is enforced once, at rebuild, so every
 * mutation route (replaceGlyph, removeGlyph, replacePart, detach,
 * addGlyph-on-empty) and the object constructor normalize identically: the
 * overlay is dropped LOUDLY (`DROPPED_WORD_INDICATOR`, matching
 * mergeWithNext), the designation silently (matching splitAt/mergeWithNext's
 * structural `^` drops).
 *
 * Covers:
 * - Every reported became-space mutation route drops the overlay with one
 *   DROPPED_WORD_INDICATOR warning; toString/toJSON agree and the string
 *   svg-round-trips.
 * - The detach route (unreported sibling) behaves the same.
 * - Object input with an overlay on a space group drops + warns (parity with
 *   the mutation routes).
 * - A designation on a became-space glyph is deleted silently, in an all-space
 *   group and inside a mixed word alike.
 * - No over-reach: a word that stays a word keeps its overlay; a designation
 *   on a non-space glyph survives a sibling turning into a space; an EMPTY
 *   group keeps its overlay (the F3 pure-state-op contract).
 *
 * Does NOT cover:
 * - Multi-part glyphs LED by a space part (`TSP;B81` shapes): they classify as
 *   non-space (the single-part boundary of the space test) and keep their
 *   state, but such compositions have their own preexisting reparse quirks,
 *   so the boundary is deliberately unpinned here.
 * - The parse-side space gates (`TSP^`, `TSP;;B81`), see
 *   `BlissParser.head-marker-contract.test.js` and
 *   `BlissParser.word-indicator-validation.test.js`.
 * - The applyIndicators/clearIndicators space-group refusal, see
 *   `ElementHandle.indicator-noop-warning.test.js`.
 * - Overlay routing across splitAt/mergeWithNext, see
 *   `ElementHandle.word-indicator-structure.test.js`.
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

const droppedWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'DROPPED_WORD_INDICATOR');

const markedFlags = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.glyphs?.map(g => g.isHeadGlyph === true) ?? [];

describe('BlissSVGBuilder space invariant', () => {
  describe('when a structural mutation turns an overlay word into a space', () => {
    // regression: round-3 external review F1 — the overlay stayed stored on
    // the now-space group, toString emitted bare '//' (svg round-trip drift),
    // and the clearIndicators space guard then refused to remove it.
    it.each([
      ['replaceGlyph', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.group(0).replaceGlyph(0, 'TSP');
        return b;
      }],
      ['removeGlyph', () => {
        const b = new BlissSVGBuilder('B313/TSP;;B81');
        b.group(0).removeGlyph(0);
        return b;
      }],
      ['replacePart', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.glyph(0).replacePart(0, 'TSP');
        return b;
      }],
      ['glyph detach', () => {
        const b = new BlissSVGBuilder('B313/TSP;;B81');
        b.glyph(0).detach();
        return b;
      }],
      ['addGlyph onto an emptied word', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.glyph(0).detach();
        b.group(0).addGlyph('TSP');
        return b;
      }],
    ])('%s drops the overlay with one DROPPED_WORD_INDICATOR warning', (_name, mutate) => {
      const b = mutate();
      expect(overlay(b)).toBeUndefined();
      const w = droppedWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe(';;B81');
      expect(b.toString()).toBe('//');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('warns once, not again on later rebuilds', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.group(0).replaceGlyph(0, 'TSP');
      b.element(0).setOptions({ color: 'red' });
      expect(droppedWarnings(b)).toHaveLength(1);
    });
  });

  describe('when object input carries an overlay on a space group', () => {
    it('drops the overlay with a DROPPED_WORD_INDICATOR warning (surface parity)', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'TSP' }] }], wordIndicators: { codes: ['B81'], stripSemantic: false } }],
      });
      expect(overlay(b)).toBeUndefined();
      expect(droppedWarnings(b)).toHaveLength(1);
      expect(b.toString()).toBe('//');
    });
  });

  describe('when a marked glyph becomes a space', () => {
    // The designation is deleted silently, matching the structural `^` drops
    // in splitAt/mergeWithNext (a space can never head a word), so toString
    // and toJSON agree instead of storing a marker '//' cannot re-emit.
    it('deletes the designation in an all-space word', () => {
      const b = new BlissSVGBuilder('B313^');
      b.glyph(0).replacePart(0, 'TSP');
      expect(markedFlags(b)).toEqual([false]);
      expect(b.toString()).toBe('//');
    });

    it('deletes the designation on a space glyph inside a mixed word', () => {
      const b = new BlissSVGBuilder('B313^/B1103');
      b.glyph(0).replacePart(0, 'TSP');
      expect(markedFlags(b)).toEqual([false, false]);
      expect(b.toString()).toBe('TSP/B1103');
    });
  });

  describe('when the mutation keeps a real word', () => {
    it('keeps the overlay when a glyph is replaced with a non-space glyph', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.group(0).replaceGlyph(0, 'B1103');
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
    });

    it('keeps the overlay on a mixed word when one glyph becomes a space', () => {
      // every-glyph semantics: one inked glyph is enough to carry the word.
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).replaceGlyph(1, 'TSP');
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
    });

    it('keeps a designation on the non-space glyph when a sibling becomes a space', () => {
      const b = new BlissSVGBuilder('B313^/B1103');
      b.group(0).replaceGlyph(1, 'TSP');
      expect(markedFlags(b)).toEqual([true, false]);
    });

    it('keeps the overlay on an EMPTY word (the F3 pure-state-op contract)', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.glyph(0).detach();
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
    });
  });
});
