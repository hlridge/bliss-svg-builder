import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the parser's rules for grouping space-only glyphs (TSP, QSP) and
 * word-separator markers (`//`) into composition.children entries.
 *
 * Key insights:
 * - `//` is syntactic sugar for `/TSP/`.
 * - Space glyphs (TSP, QSP) always form their own group, separate from
 *   non-space glyphs.
 * - Adjacent space glyphs (whether explicit or from `//` expansion)
 *   merge into a single space group.
 *
 * - `/` alone (separator between nothing and nothing) produces 0 groups.
 * - `//` produces 1 group with 1 TSP.
 * - `///` produces 1 group with 2 TSPs.
 * - `TSP//TSP` (= TSP/TSP/TSP after `//` expansion) produces 1 group
 *   with 3 TSPs (all space-type merge).
 * - `H/TSP/H` produces 3 groups: [H], [TSP], [H].
 *
 * Covers:
 * - Empty inputs and slash-only inputs producing zero groups.
 * - `//`, `///`, `////` producing a single space group with 1, 2, 3 TSPs.
 * - Trailing space-runs (`H//`, `H///`) producing two groups.
 * - Leading space-runs (`//H`, `///H`) producing two groups.
 * - Wrapping space-runs (`//H//`, `///H///`) producing three groups.
 * - Explicit `TSP` and `QSP` glyphs alone, paired (`TSP/TSP`), and
 *   merged with `//` separators (`TSP//TSP`, `QSP//QSP`).
 *
 * Does NOT cover:
 * - TSP/QSP advance-width formulas, see
 *   `BlissSVGBuilder.space-glyphs.test.js`.
 * - Effect of `word-space` and `char-space` options on group positions
 *   or widths, see `BlissSVGBuilder.spacing.test.js`.
 */

// Helper to get the code from a glyph (first part's codeName)
const getCode = (glyph) => glyph?.children?.[0]?.codeName;

describe('BlissSVGBuilder space grouping', () => {
  describe('when the input is empty or contains only /', () => {
    it('empty string produces zero groups', () => {
      const builder = new BlissSVGBuilder('');
      expect(builder.composition.children.length).toBe(0);
      expect(builder.composition.width).toBe(0);
    });

    it('single slash "/" produces zero groups (separator between nothing)', () => {
      // "/" is a character separator between two empty strings = nothing
      const builder = new BlissSVGBuilder('/');
      expect(builder.composition.children.length).toBe(0);
      expect(builder.composition.width).toBe(0);
    });
  });

  describe('when the input contains only word separators', () => {
    it('"//" produces one group with one TSP (// = /TSP/)', () => {
      const builder = new BlissSVGBuilder('//');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(1);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
    });

    it('"///" produces one group with two TSPs (/// = /TSP/TSP/)', () => {
      const builder = new BlissSVGBuilder('///');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(2);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
      expect(getCode(comp.children[0].children[1])).toBe('TSP');
    });

    it('"////" produces one group with three TSPs', () => {
      const builder = new BlissSVGBuilder('////');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(3);
    });
  });

  describe('when /-runs trail a visible glyph', () => {
    it('"H//" produces two groups: H group + space group with one TSP', () => {
      const builder = new BlissSVGBuilder('H//');
      const comp = builder.composition;

      expect(comp.children.length).toBe(2);
      expect(getCode(comp.children[0].children[0])).toBe('H');
      expect(comp.children[1].children.length).toBe(1);
      expect(getCode(comp.children[1].children[0])).toBe('TSP');
    });

    it('"H///" produces two groups: H group + space group with two TSPs', () => {
      const builder = new BlissSVGBuilder('H///');
      const comp = builder.composition;

      expect(comp.children.length).toBe(2);
      expect(getCode(comp.children[0].children[0])).toBe('H');
      expect(comp.children[1].children.length).toBe(2);
      expect(getCode(comp.children[1].children[0])).toBe('TSP');
      expect(getCode(comp.children[1].children[1])).toBe('TSP');
    });
  });

  describe('when /-runs lead a visible glyph', () => {
    it('"//H" produces two groups: space group with one TSP + H group', () => {
      const builder = new BlissSVGBuilder('//H');
      const comp = builder.composition;

      expect(comp.children.length).toBe(2);
      expect(comp.children[0].children.length).toBe(1);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
      expect(getCode(comp.children[1].children[0])).toBe('H');
    });

    it('"///H" produces two groups: space group with two TSPs + H group', () => {
      const builder = new BlissSVGBuilder('///H');
      const comp = builder.composition;

      expect(comp.children.length).toBe(2);
      expect(comp.children[0].children.length).toBe(2);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
      expect(getCode(comp.children[0].children[1])).toBe('TSP');
      expect(getCode(comp.children[1].children[0])).toBe('H');
    });
  });

  describe('when /-runs wrap a visible glyph', () => {
    it('"//H//" produces three groups: space + H + space', () => {
      const builder = new BlissSVGBuilder('//H//');
      const comp = builder.composition;

      expect(comp.children.length).toBe(3);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
      expect(getCode(comp.children[1].children[0])).toBe('H');
      expect(getCode(comp.children[2].children[0])).toBe('TSP');
    });

    it('"///H///" produces three groups: 2-TSP space + H + 2-TSP space', () => {
      const builder = new BlissSVGBuilder('///H///');
      const comp = builder.composition;

      expect(comp.children.length).toBe(3);
      expect(comp.children[0].children.length).toBe(2);
      expect(getCode(comp.children[1].children[0])).toBe('H');
      expect(comp.children[2].children.length).toBe(2);
    });
  });

  describe('when explicit TSP/QSP glyphs combine with / separators', () => {
    it('TSP alone has one group with one TSP', () => {
      const builder = new BlissSVGBuilder('TSP');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(1);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
    });

    it('QSP alone has one group with one QSP', () => {
      const builder = new BlissSVGBuilder('QSP');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(1);
      expect(getCode(comp.children[0].children[0])).toBe('QSP');
    });

    it('TSP/TSP creates one group with two TSPs', () => {
      const builder = new BlissSVGBuilder('TSP/TSP');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(2);
    });

    it('TSP//TSP creates one group with three TSPs (TSP + /TSP/ + TSP)', () => {
      // TSP//TSP = TSP/SP/TSP = one space group with 3 TSPs (all space type merge)
      const builder = new BlissSVGBuilder('TSP//TSP');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(3);
      expect(getCode(comp.children[0].children[0])).toBe('TSP');
      expect(getCode(comp.children[0].children[1])).toBe('TSP');
      expect(getCode(comp.children[0].children[2])).toBe('TSP');
    });

    it('QSP//QSP creates one group with three glyphs (QSP + TSP + QSP)', () => {
      // QSP//QSP = QSP/SP/QSP: the SP becomes TSP, all merge into one space group
      const builder = new BlissSVGBuilder('QSP//QSP');
      const comp = builder.composition;

      expect(comp.children.length).toBe(1);
      expect(comp.children[0].children.length).toBe(3);
      expect(getCode(comp.children[0].children[0])).toBe('QSP');
      expect(getCode(comp.children[0].children[1])).toBe('TSP');
      expect(getCode(comp.children[0].children[2])).toBe('QSP');
    });
  });
});
