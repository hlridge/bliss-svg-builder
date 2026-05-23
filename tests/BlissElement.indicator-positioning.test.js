import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the single-indicator positioning contract on the BlissElement
 * tree: X-centering of an indicator over the explicit span of its base
 * parts, Y-alignment by subtracting the indicator anchor offset from
 * the base anchor offset, and invalidation of indicator classification
 * when a non-indicator part trails the candidate indicator.
 *
 * Covers:
 * - Indicator X-offset centered on the midpoint of two explicitly
 *   positioned base parts.
 * - Indicator Y-offset computed by subtracting the indicator's
 *   anchorOffsetY from the base part's anchorOffsetY on a directly
 *   constructed BlissElement.
 * - Invalid mixed pattern (`B291;B81;H`): a potential indicator (B81)
 *   followed by a non-indicator raw part (H) is exposed as a regular
 *   part with offsetX=0, not centered.
 * - Default x positioning (no explicit coord): plural indicator centers
 *   on Line vs Enclosure bases; combined plural-thing indicator centers
 *   on Enclosure; explicit y-only suffix preserves default x centering.
 * - Default y positioning (no explicit coord): plural indicator at
 *   baseline y on Line vs God-extended bases.
 * - Explicit x coordinate on a plural indicator: overrides default
 *   centering at negative/zero/positive values; treated as absolute on
 *   Enclosure (not relative to the default centered position).
 * - Explicit y coordinate on a plural indicator: across Line, Enclosure,
 *   and God-extended bases; explicit y matching the default; explicit
 *   y combined with explicit x.
 *
 * Does NOT cover:
 * - Multi-indicator stacking math, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - Width-getter interaction with indicator overhang, see
 *   `BlissElement.base-width.test.js`.
 * - isIndicator classification surface and indicator API, see
 *   `BlissElement.taxonomy.test.js` and
 *   `ElementHandle.indicator-api.test.js`.
 * - Empty-indicator-slot stripping, see
 *   `BlissSVGBuilder.empty-indicator-strip.test.js`.
 * - SVG output of positioned indicators, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */
describe('BlissElement indicator positioning', () => {
  describe('when positioning an indicator over its base parts', () => {
    it('centers the indicator on the midpoint of two positioned base parts', () => {
      const builder = new BlissSVGBuilder('HL2:4;HL2:10;B81');
      const [firstPart, secondPart, indicator] = builder.elements.children[0].children[0].children;

      expect(firstPart.offsetX).toBe(4);
      expect(secondPart.offsetX).toBe(10);
      expect(indicator.codeName).toBe('B81');
      expect(indicator.offsetX).toBe(7);
    });

    it('subtracts the indicator anchorOffsetY from the base anchorOffsetY when aligning', () => {
      const element = new BlissElement({
        parts: [
          {
            parts: [{ codeName: 'HL4', x: 2, y: 8 }],
            anchorOffsetX: -1,
            anchorOffsetY: -3
          },
          {
            parts: [{ codeName: 'HL2', y: 4 }],
            isIndicator: true,
            anchorOffsetX: 1,
            anchorOffsetY: 2
          }
        ]
      });
      const [, indicator] = element.snapshot().children[0].children[0].children;

      expect(indicator.offsetX).toBe(-1);
      expect(indicator.offsetY).toBe(-5);
    });
  });

  describe('when a trailing non-indicator part invalidates the indicator pattern', () => {
    it('exposes the would-be indicator as a regular part with no centering', () => {
      const builder = new BlissSVGBuilder('B291;B81;H');
      const [, indicator, trailingPart] = builder.elements.children[0].children[0].children;

      expect(indicator.codeName).toBe('B81');
      expect(indicator.offsetX).toBe(0);
      expect(trailingPart.codeName).toBe('H');
      expect(trailingPart.offsetX).toBe(0);
    });
  });

  // Uses BlissElement + BlissParser directly (not BlissSVGBuilder.elements)
  // because BlissSVGBuilder.elements applies layout normalization that shifts
  // negative x values to zero, masking the pre-normalization offsets these
  // tests pin.
  const indicatorOf = (input) => new BlissElement(BlissParser.parse(input)).children[0].children[0].children[1];

  describe('when an indicator has no explicit x coordinate (centered on base)', () => {
    it('centers a plural indicator on a Line base (B428;B99 → x=-1)', () => {
      expect(indicatorOf('B428;B99').x).toBe(-1);
    });

    it('centers a plural indicator on an Enclosure base (B291;B99 → x=3)', () => {
      expect(indicatorOf('B291;B99').x).toBe(3);
    });

    it('centers a plural indicator on Enclosure when only y is explicit (B291;B99:,0 → x=3)', () => {
      expect(indicatorOf('B291;B99:,0').x).toBe(3);
    });

    it('centers a combined plural-thing indicator on Enclosure (B291;B98 → x=1.5)', () => {
      expect(indicatorOf('B291;B98').x).toBe(1.5);
    });
  });

  describe('when an indicator has no explicit y coordinate (matches base extension)', () => {
    it('uses the default y for a plural indicator on Line (B428;B99 → y=0, draws at y=4)', () => {
      expect(indicatorOf('B428;B99').y).toBe(0);
    });

    it('shifts y for a plural indicator on God-extended base (B355;B99 → y=-4, draws at y=0)', () => {
      expect(indicatorOf('B355;B99').y).toBe(-4);
    });
  });

  describe('when a plural indicator has an explicit x coordinate', () => {
    it('overrides default centering with negative left extension on Line (B428;B99:-3 → x=-3)', () => {
      expect(indicatorOf('B428;B99:-3').x).toBe(-3);
    });

    it('overrides default centering at the natural center on Line (B428;B99:-1 → x=-1)', () => {
      expect(indicatorOf('B428;B99:-1').x).toBe(-1);
    });

    it('overrides default centering at zero on Line (B428;B99:0 → x=0)', () => {
      expect(indicatorOf('B428;B99:0').x).toBe(0);
    });

    it('overrides default centering with positive right extension on Line (B428;B99:1 → x=1)', () => {
      expect(indicatorOf('B428;B99:1').x).toBe(1);
    });

    it('treats explicit x as absolute on Enclosure, not relative to default (B291;B99:1,0 → x=1, not 3)', () => {
      expect(indicatorOf('B291;B99:1,0').x).toBe(1);
    });

    it('treats explicit x=0 as absolute on Enclosure, not as default centered (B291;B99:0 → x=0)', () => {
      expect(indicatorOf('B291;B99:0').x).toBe(0);
    });

    it('treats explicit negative x as absolute on Enclosure (B291;B99:-1 → x=-1)', () => {
      expect(indicatorOf('B291;B99:-1').x).toBe(-1);
    });
  });

  describe('when a plural indicator has an explicit y coordinate', () => {
    it('offsets from default on Line (B428;B99:,2 → y=2)', () => {
      expect(indicatorOf('B428;B99:,2').y).toBe(2);
    });

    it('offsets from default on God-extended base (B355;B99:,2 → y=2)', () => {
      expect(indicatorOf('B355;B99:,2').y).toBe(2);
    });

    it('offsets from default on Enclosure (B291;B99:,4 → y=4)', () => {
      expect(indicatorOf('B291;B99:,4').y).toBe(4);
    });

    it('offsets from default on Enclosure (B291;B99:,8 → y=8)', () => {
      expect(indicatorOf('B291;B99:,8').y).toBe(8);
    });

    it('offsets from default at zero on Line (B428;B99:,0 → y=0)', () => {
      expect(indicatorOf('B428;B99:,0').y).toBe(0);
    });

    it('offsets from default at zero on God-extended base (B355;B99:,0 → y=0)', () => {
      expect(indicatorOf('B355;B99:,0').y).toBe(0);
    });

    it('accepts explicit y matching the default on God-extended base (B355;B99:3,-4 → y=-4)', () => {
      expect(indicatorOf('B355;B99:3,-4').y).toBe(-4);
    });

    it('accepts explicit y offset on God-extended base (B355;B99:3,0 → y=0)', () => {
      expect(indicatorOf('B355;B99:3,0').y).toBe(0);
    });
  });
});
