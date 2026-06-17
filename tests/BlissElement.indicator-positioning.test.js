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
 * - Order-independent base anchor: a multi-part base renders its
 *   indicator identically under base-part reordering (uses the default
 *   anchor, no single owner); a single base part still uses its own
 *   anchorOffset.
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
  const lastIndicatorOf = (input) => {
    const parts = new BlissElement(BlissParser.parse(input)).children[0].children[0].children;
    return parts[parts.length - 1];
  };
  const partsOf = (input) => new BlissElement(BlissParser.parse(input)).children[0].children[0].children;

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

  describe('when a multi-part base is reordered', () => {
    // regression: the base anchor offset was read from the positionally-first
    // base part (glyphParts[0]), so reordering equivalent base parts moved the
    // indicator. The anchor is now order-independent: a multi-part base has no
    // single owner, so it uses the default (0,0) anchor (coordinate ownership).
    // A single base part still uses its own anchorOffset (pinned by the
    // God-extended cases above).
    //
    // note: only the indicator's position is order-independent, NOT the full
    // SVG. The base parts keep their source order in the output (we do not
    // reorder a user's parts), so the two svgCode strings are not byte-identical
    // even though they render the same shapes at the same coordinates.
    const indicatorPosition = (input) => {
      const ind = lastIndicatorOf(input);
      return { x: ind.x, y: ind.y };
    };

    it('positions the indicator identically across a y-divergent base reorder', () => {
      // C8 and B233 differ in anchorOffset.y (0 vs -4); both have anchorOffset.x=0,
      // so this pair isolates the Y dimension.
      expect(indicatorPosition('C8:0,8;B233:0,-3;B84'))
        .toEqual(indicatorPosition('B233:0,-3;C8:0,8;B84'));
    });

    it('anchors the indicator at the default height on a multi-part base (y=-8)', () => {
      expect(lastIndicatorOf('B233:0,-3;C8:0,8;B84').y).toBe(-8);
    });

    it('positions the indicator identically across an x-divergent base reorder', () => {
      // B101 carries anchorOffset.x=1 (B8 has 0), so this pair diverges purely in
      // x and pins the X dimension non-vacuously (the C8/B233 pair above diverges
      // only in y). X is the larger surface: more glyphs carry a nonzero
      // anchorOffset.x than .y, so the default-anchor rule must apply on X too.
      expect(indicatorPosition('B101;B8;B99'))
        .toEqual(indicatorPosition('B8;B101;B99'));
    });

    it('anchors the indicator x at the geometric center on a multi-part base (x=4)', () => {
      expect(lastIndicatorOf('B101;B8;B99').x).toBe(4);
    });
  });

  describe('when the base is empty (a baseless indicator stack)', () => {
    // A stack with no base part (every part is an indicator) has nothing to
    // center over, so it lays its parts out left-to-right from the origin with
    // the standard 1-unit gap. A single standalone indicator stays at origin.
    // See BlissSVGBuilder.baseless-indicator.test.js for the leading-';' /
    // no-UNKNOWN_CODE rendering contract.
    it('lays out a two-indicator baseless stack from origin with a gap (B97;B99)', () => {
      // pins the length-0 path through #positionIndicatorGroup; kills the
      // length<=1 / length<2 boundary mutants on the base-anchor line that the
      // based-only suite cannot reach (the call gate forbade length 0 pre-R15).
      const [first, second] = partsOf('B97;B99');
      expect(first.codeName).toBe('B97');
      expect(first.x).toBe(0);
      expect(second.codeName).toBe('B99');
      expect(second.x).toBe(3);
    });

    it('leaves a standalone grammatical indicator at the origin (B86 → x=0)', () => {
      expect(partsOf('B86')[0].x).toBe(0);
    });

    it('leaves a standalone composite indicator glyph at the origin (B98 → x=0)', () => {
      expect(partsOf('B98')[0].x).toBe(0);
    });

    it('leaves a standalone verbal indicator at the origin (B81 → x=0)', () => {
      expect(partsOf('B81')[0].x).toBe(0);
    });
  });
});
