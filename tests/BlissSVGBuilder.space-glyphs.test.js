import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the advance-width formulas for the explicit space glyphs TSP
 * (Three-quarter Space) and QSP (Quarter Space), and how they respond
 * to overrides of `word-space` and `char-space`.
 *
 * Space glyphs are invisible characters with zero glyph width but
 * non-zero advance width:
 * - TSP advanceWidth = wordSpace - charSpace (default: 8 - 2 = 6).
 * - QSP advanceWidth = wordSpace/2 - charSpace (default: 4 - 2 = 2).
 *
 * Covers:
 * - The TSP advance-width formula across an H/TSP/H input.
 * - The QSP advance-width formula across an H/QSP/H input.
 * - QSP advancing exactly 4 less than TSP at default settings.
 * - Consecutive TSP/TSP and QSP/QSP runs accumulating advance width.
 * - Per-glyph space advance within a multi-space group: the second space
 *   glyph is positioned by the first's per-character advanceX, distinct from
 *   the group-level advance, under a wide word-space.
 * - Recomputation of TSP and QSP advance when `word-space` and/or
 *   `char-space` are overridden via bracket options.
 * - Mixed inputs where explicit space glyphs sit alongside word
 *   separators (`//`).
 *
 * Does NOT cover:
 * - The `word-space` and `char-space` options' parser/range/clamping
 *   behavior; see `BlissSVGBuilder.spacing.test.js`.
 * - How the parser groups consecutive space glyphs into composition
 *   children; see `BlissSVGBuilder.space-grouping.test.js`.
 */

describe('BlissSVGBuilder space glyphs', () => {
  describe('when TSP appears within a word', () => {
    it('computes total width 24 for H/TSP/H', () => {
      // H(8) + charSpace(2) + TSP(6) + H(8) = 24
      const builder = new BlissSVGBuilder('H/TSP/H');
      expect(builder.composition.width).toBe(24);
    });

    it('positions the three groups [H, TSP, H] at x=0, x=10, x=16', () => {
      // H/TSP/H now creates 3 groups: [H], [TSP], [H]
      const builder = new BlissSVGBuilder('H/TSP/H');
      const comp = builder.composition;
      const groups = comp.children;

      expect(groups.length).toBe(3);
      expect(groups[0].x).toBe(0);  // First H group
      expect(groups[1].x).toBe(10); // TSP group: H(8) + charSpace(2)
      expect(groups[2].x).toBe(16); // Second H group: TSP.x(10) + TSP.advanceWidth(6)
    });

    it('matches H//H total width when used as a sole space glyph', () => {
      // H//H with default word-space=8: H(8) + wordSpace(8) + H(8) = 24
      const wordSeparatorBuilder = new BlissSVGBuilder('H//H');
      // H/TSP/H: H(8) + charSpace(2) + TSP(6) + H(8) = 24
      const tspBuilder = new BlissSVGBuilder('H/TSP/H');

      expect(tspBuilder.composition.width).toBe(wordSeparatorBuilder.composition.width);
    });

    it('computes total width 30 for H/TSP/TSP/H', () => {
      // H(8) + charSpace(2) + TSP(6) + TSP(6) + H(8) = 30
      const builder = new BlissSVGBuilder('H/TSP/TSP/H');
      expect(builder.composition.width).toBe(30);
    });
  });

  describe('when QSP appears within a word', () => {
    it('computes total width 20 for H/QSP/H', () => {
      // H(8) + charSpace(2) + QSP(2) + H(8) = 20
      const builder = new BlissSVGBuilder('H/QSP/H');
      expect(builder.composition.width).toBe(20);
    });

    it('positions the three groups [H, QSP, H] at x=0, x=10, x=12', () => {
      // H/QSP/H now creates 3 groups: [H], [QSP], [H]
      const builder = new BlissSVGBuilder('H/QSP/H');
      const comp = builder.composition;
      const groups = comp.children;

      expect(groups.length).toBe(3);
      expect(groups[0].x).toBe(0);  // First H group
      expect(groups[1].x).toBe(10); // QSP group: H(8) + charSpace(2)
      expect(groups[2].x).toBe(12); // Second H group: QSP.x(10) + QSP.advanceWidth(2)
    });

    it('advances 4 less than TSP across the same H/_/H input', () => {
      const tspBuilder = new BlissSVGBuilder('H/TSP/H');
      const qspBuilder = new BlissSVGBuilder('H/QSP/H');

      // TSP advances 6, QSP advances 2, difference should be 4
      expect(tspBuilder.composition.width - qspBuilder.composition.width).toBe(4);
    });

    it('computes total width 22 for H/QSP/QSP/H', () => {
      // H(8) + charSpace(2) + QSP(2) + QSP(2) + H(8) = 22
      const builder = new BlissSVGBuilder('H/QSP/QSP/H');
      expect(builder.composition.width).toBe(22);
    });
  });

  describe('when consecutive space glyphs share a group under a wide word-space', () => {
    it('positions the second QSP by the per-glyph QSP advance, not the TSP advance', () => {
      // The first space glyph's per-character advanceX positions the second
      // within the group. With word-space=20: QSP = wordSpace/2 - charSpace = 8,
      // distinct from TSP = wordSpace - charSpace = 18. Pins the per-glyph QSP
      // branch; killed the `code === 'TSP'` -> true mutant (2026-05-21 stryker).
      const qspGroup = new BlissSVGBuilder('[word-space=20]||H/QSP/QSP/H').composition.children[1];
      const tspGroup = new BlissSVGBuilder('[word-space=20]||H/TSP/TSP/H').composition.children[1];

      expect(qspGroup.children[1].x).toBe(8);
      expect(tspGroup.children[1].x).toBe(18);
    });
  });

  describe('when word-space or char-space is overridden', () => {
    it('recomputes TSP advance from word-space=12 (TSP=10)', () => {
      // word-space=12, char-space=2 (default)
      // TSP = wordSpace - charSpace = 12 - 2 = 10
      // H(8) + charSpace(2) + TSP(10) + H(8) = 28
      const builder = new BlissSVGBuilder('[word-space=12]||H/TSP/H');
      expect(builder.composition.width).toBe(28);
    });

    it('recomputes QSP advance from word-space=12 (QSP=4)', () => {
      // word-space=12, char-space=2 (default)
      // QSP = wordSpace/2 - charSpace = 6 - 2 = 4
      // H(8) + charSpace(2) + QSP(4) + H(8) = 22
      const builder = new BlissSVGBuilder('[word-space=12]||H/QSP/H');
      expect(builder.composition.width).toBe(22);
    });

    it('recomputes TSP advance from char-space=4 (TSP=4)', () => {
      // word-space=8 (default), char-space=4
      // TSP = wordSpace - charSpace = 8 - 4 = 4
      // H(8) + charSpace(4) + TSP(4) + H(8) = 24
      const builder = new BlissSVGBuilder('[char-space=4]||H/TSP/H');
      expect(builder.composition.width).toBe(24);
    });

    it('recomputes QSP advance from char-space=4 (QSP=0)', () => {
      // word-space=8 (default), char-space=4
      // QSP = wordSpace/2 - charSpace = 4 - 4 = 0
      // H(8) + charSpace(4) + QSP(0) + H(8) = 20
      const builder = new BlissSVGBuilder('[char-space=4]||H/QSP/H');
      expect(builder.composition.width).toBe(20);
    });

    it('recomputes TSP and QSP advances when both word-space and char-space change', () => {
      // word-space=16, char-space=1
      // TSP = 16 - 1 = 15
      // QSP = 8 - 1 = 7
      // H/TSP/H: H(8) + charSpace(1) + TSP(15) + H(8) = 32
      // H/QSP/H: H(8) + charSpace(1) + QSP(7) + H(8) = 24
      const tspBuilder = new BlissSVGBuilder('[word-space=16;char-space=1]||H/TSP/H');
      const qspBuilder = new BlissSVGBuilder('[word-space=16;char-space=1]||H/QSP/H');

      expect(tspBuilder.composition.width).toBe(32);
      expect(qspBuilder.composition.width).toBe(24);
    });
  });

  describe('when space glyphs mix with word separators', () => {
    it('computes total width 40 for H/TSP/H//H', () => {
      // First word: H/TSP/H = H(8) + charSpace(2) + TSP(6) + H(8) = 24
      // Word separator: 8
      // Second word: H = 8
      // Total: 24 + 8 + 8 = 40
      const builder = new BlissSVGBuilder('H/TSP/H//H');
      expect(builder.composition.width).toBe(40);
    });

    it('computes total width 36 for H/QSP/H//H', () => {
      // First word: H/QSP/H = H(8) + charSpace(2) + QSP(2) + H(8) = 20
      // Word separator: 8
      // Second word: H = 8
      // Total: 20 + 8 + 8 = 36
      const builder = new BlissSVGBuilder('H/QSP/H//H');
      expect(builder.composition.width).toBe(36);
    });

    it('computes total width 30 for H//TSP/H', () => {
      // First word: H = 8
      // Word separator: 8
      // Another space: 6
      // H again: 8
      // Total: 8 + 8 + 6 + 8 = 30
      const builder = new BlissSVGBuilder('H//TSP/H');
      expect(builder.composition.width).toBe(30);
    });
  });
});
