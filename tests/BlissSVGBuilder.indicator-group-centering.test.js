/**
 * Pins multi-indicator group centering: auto-positioned indicators lay out
 * left-to-right with 1-unit gaps, and the group's CONTENT span is centered
 * over the base character's anchor point. Content = what a reader reads as
 * the indicator marks: B84/B85 carry an annotation dot outside their arrow
 * (that is what their anchorOffsetX records — the arrow center sits at
 * width/2 + a, the dot occupies 2|a| on the other side), and an edge dot
 * facing OUTWARD hangs off the row exactly as it does on a lone indicator,
 * excluded from the centering. Equivalently:
 *   firstX = anchorX - totalWidth/2 - max(0, a1) - min(0, aN)
 * A dot facing INTO the row, and any middle member's dot, never shifts the
 * group; all-zero offsets give pure visual centering (member widths never
 * skew); n = 1 degenerates to the single-attachment rule
 * x = anchorX - width/2 - a (the arrow itself centers on the anchor).
 *
 * The matrix realizes the combination triples of (1) indicator widths,
 * (2) anchorOffsetX values (member and base), and (3) indicator count from
 * the 2026-07-08 bug report: the old first/last anchor-MIDPOINT rule sat
 * `B391;B81;B90` / `B391;B90;B81` ±0.875 off the anchor, order-dependently.
 * Its (wN-w1)/4 width term was the bug. Old and new agree exactly where the
 * edge members' CONTENT widths (width minus the outer 2|a| dot allowance)
 * are equal — every B84/B85-beside-w2 pair, hence their unchanged renders —
 * and differ otherwise, per the follow-up reports: `B291;B85;B99` leans a
 * full 0.5 left, `B291;B99;B84` a full 0.5 right.
 *
 * Width/anchor fixtures (built-in): B92 w=0.5, B81/B97/B99 w=2, B84 w=3
 * a=-0.5, B85 w=3 a=+0.5, B90 w=5.5; bases B291 (w=8, default anchor) and
 * B391 (w=14, anchorOffsetX -3, anchor at x=4 like B291). Custom defs cover
 * the width x offset cells built-ins cannot reach (wide+positive-offset,
 * narrow+negative-offset indicators; positive/negative-anchor bases).
 *
 * Covers:
 * - Pair and triple exact offsetX positions for unequal widths in both
 *   orders, on default-anchor, negative-anchor (B391), and custom
 *   positive/negative-anchor bases.
 * - Member anchorOffsetX as content marker (B84/B85 and custom offset
 *   indicators): an outward edge dot shifts the group by half its 2|a|
 *   dot allowance (0.5 for B84/B85), an inward or middle dot shifts
 *   nothing, outward dots on both edges balance.
 * - Single-indicator anchor attachment across width and offset variants
 *   (unchanged contract, regression guards).
 * - Public byte-parity: the auto-positioned svg equals the explicit
 *   `:x` coordinate form at the contract positions.
 * - Surface parity: `;` DSL, `;;` DSL, glyph-level and group-level
 *   `applyIndicators` render byte-identically for the same indicator set.
 * - Baseless stacks (left-to-right from 0) and all-explicit coordinates
 *   unchanged by group centering.
 *
 * Does NOT cover:
 * - Width getters, y-positioning, overhang, and irregular patterns, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - Displaced/composite-base ink-span centering (XC-1/XC-2), see
 *   `BlissSVGBuilder.indicator-centering.test.js`.
 * - Mixed explicit/auto coordinate chains (one indicator explicit, the next
 *   auto): pre-existing chain semantics, unpinned.
 * - Rendered-pixel references for the matrix, see the 2026-07-08 group in
 *   `BlissSVGBuilder.visual-regression.e2e.cases.js`.
 *
 * @regression: 2026-07-08 indicator-group-centering
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// custom cells the built-in indicator/base inventory cannot realize
const matrixDefs = {
  INDWIDE: { type: 'glyph', isIndicator: true, codeString: 'B91;B88:3,0', width: 5.5, anchorOffsetX: 1.5 },
  INDNARROW: { type: 'glyph', isIndicator: true, codeString: 'HW2W:0,4', width: 0.5, anchorOffsetX: -0.5 },
  POSBASE: { type: 'glyph', codeString: 'B291', anchorOffsetX: 2 },
  NEGBASE: { type: 'glyph', codeString: 'B291', anchorOffsetX: -2 },
};

beforeAll(() => {
  BlissSVGBuilder.define(matrixDefs, { overwrite: true });
});

afterAll(() => {
  for (const code of Object.keys(matrixDefs)) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

// parent-relative x of every level-3 indicator part, in document order
const indicatorOffsets = (code) =>
  new BlissSVGBuilder(code)
    .query((el) => el.level === 3 && el.isIndicator)
    .map((el) => el.offsetX);

const svgOf = (code) => new BlissSVGBuilder(code).svgCode;

describe('BlissSVGBuilder indicator group centering', () => {
  describe('when two indicators of different widths compose on a base', () => {
    // group span = totalWidth (widths + 1-unit gaps) centered on the anchor:
    // firstX = anchorX - totalWidth/2, nextX = prevX + prevWidth + 1
    it.each([
      ['B291;B81;B90', [-0.25, 2.75]],
      ['B291;B90;B81', [-0.25, 6.25]],
      ['B391;B81;B90', [-0.25, 2.75]], // regression: 2026-07-08 report case
      ['B391;B90;B81', [-0.25, 6.25]], // regression: 2026-07-08 report case
      ['B291;B92;B90', [0.5, 2]],
      ['B291;B90;B92', [0.5, 7]],
    ])('centers the group span of %s at offsets %j', (code, offsets) => {
      expect(indicatorOffsets(code)).toEqual(offsets);
    });

    it('keeps the base part at its own origin while the group overhangs', () => {
      const baseOffsets = new BlissSVGBuilder('B391;B90;B81')
        .query((el) => el.level === 3 && !el.isIndicator)
        .map((el) => el.offsetX);
      expect(baseOffsets).toEqual([0]);
    });
  });

  describe('when composed indicators carry their own anchorOffsetX', () => {
    // the CONTENT span is centered: an edge member's annotation dot facing
    // OUTWARD (B85 first: dot leads left; B84 last: dot trails right) hangs
    // off the row and is excluded, pulling the group by half the dot's 2|a|
    // allowance (0.5 for B84/B85); a dot facing INTO the row is part of the
    // internal gap and shifts nothing; outward dots on both edges balance
    it.each([
      ['B291;B81;B84', [1.5, 4.5]],
      ['B291;B84;B81', [1, 5]],
      ['B291;B81;B85', [1, 4]],
      ['B291;B85;B81', [0.5, 4.5]],
      ['B291;B85;B99', [0.5, 4.5]], // regression: 2026-07-08 report case (leans left)
      ['B291;B99;B84', [1.5, 4.5]], // regression: 2026-07-08 report case (leans right)
      ['B291;B84;B85', [0.5, 4.5]],
      ['B291;B85;B84', [0.5, 4.5]],
      ['B291;INDWIDE;B81', [-1.75, 4.75]],
      ['B291;B81;INDWIDE', [-0.25, 2.75]],
      ['B291;INDNARROW;B90', [0.5, 2]],
      ['B291;B90;INDNARROW', [1, 7.5]],
    ])('centers the content span of %s at offsets %j', (code, offsets) => {
      expect(indicatorOffsets(code)).toEqual(offsets);
    });
  });

  describe('when three indicators compose on a base', () => {
    it.each([
      ['B291;B92;B81;B90', [-1, 0.5, 3.5]],
      ['B291;B90;B81;B92', [-1, 5.5, 8.5]],
      ['B291;B84;B81;B90', [-2.25, 1.75, 4.75]],
      ['B291;B90;B81;B85', [-2.25, 4.25, 7.25]],
      ['B291;B85;B81;B90', [-2.75, 1.25, 4.25]],
      ['B291;B90;B81;B84', [-1.75, 4.75, 7.75]],
      ['B291;B81;B97;B99', [0, 3, 6]],
      ['B391;B92;B81;B90', [-1, 0.5, 3.5]],
      ['B391;B84;B81;B90', [-2.25, 1.75, 4.75]],
    ])('centers the three-indicator span of %s at offsets %j', (code, offsets) => {
      expect(indicatorOffsets(code)).toEqual(offsets);
    });

    it('ignores a middle member anchorOffsetX (span edges are unmoved)', () => {
      // B84's offset sits between two zero-offset members: total 9, no shift
      expect(indicatorOffsets('B291;B81;B84;B99')).toEqual([-0.5, 2.5, 6.5]);
    });
  });

  describe('when the base carries a non-default anchorOffsetX', () => {
    // POSBASE anchor at 4+2=6, NEGBASE at 4-2=2; the whole group follows
    it.each([
      ['POSBASE;B81;B90', [1.75, 4.75]],
      ['NEGBASE;B90;B81', [-2.25, 4.25]],
      ['B391;B99;B84', [1.5, 4.5]],
    ])('centers the group of %s on the shifted base anchor at %j', (code, offsets) => {
      expect(indicatorOffsets(code)).toEqual(offsets);
    });
  });

  describe('when a single indicator attaches', () => {
    // unchanged contract: x = anchorX - width/2 - indicatorAnchorOffsetX
    it.each([
      ['B391;B81', [3]],
      ['B391;B90', [1.25]],
      ['B391;B92', [3.75]],
      ['B391;B84', [3]],
      ['B391;B85', [2]],
      ['B291;INDWIDE', [-0.25]],
      ['B291;INDNARROW', [4.25]],
      ['POSBASE;B84', [5]],
      ['NEGBASE;B85', [0]],
    ])('attaches the single indicator of %s at offset %j', (code, offsets) => {
      expect(indicatorOffsets(code)).toEqual(offsets);
    });
  });

  describe('when the group is auto-positioned versus explicitly placed', () => {
    it('renders B391;B81;B90 byte-identical to its explicit-coordinate form', () => {
      expect(svgOf('B391;B81;B90')).toBe(svgOf('B391;B81:-0.25;B90:2.75'));
    });

    it('renders B391;B90;B81 byte-identical to its explicit-coordinate form', () => {
      expect(svgOf('B391;B90;B81')).toBe(svgOf('B391;B90:-0.25;B81:6.25'));
    });
  });

  describe('when the same indicator set attaches through other surfaces', () => {
    it('renders the `;;` overlay form byte-identical to the `;` form', () => {
      expect(svgOf('B291;;B81;B90')).toBe(svgOf('B291;B81;B90'));
    });

    it('renders glyph-level applyIndicators byte-identical to the `;` form', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).applyIndicators('B81;B90');
      expect(builder.svgCode).toBe(svgOf('B291;B81;B90'));
    });

    it('renders group-level applyIndicators byte-identical to the `;` form', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.group(0).applyIndicators('B81;B90');
      expect(builder.svgCode).toBe(svgOf('B291;B81;B90'));
    });
  });

  describe('when the stack is baseless or explicitly positioned', () => {
    it('lays a baseless stack out left-to-right from the origin', () => {
      expect(indicatorOffsets('B81;B90')).toEqual([0, 3]);
    });

    it('keeps explicit coordinates over group centering', () => {
      expect(indicatorOffsets('B291;B81:1;B90:6')).toEqual([1, 6]);
    });
  });
});
