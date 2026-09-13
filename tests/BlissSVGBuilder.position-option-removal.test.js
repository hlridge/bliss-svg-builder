import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that removing a position option removes the position: the numeric x/y
 * the layout reads is cleared alongside the bag key, and cleared ONLY when the
 * bag really carried that axis.
 *
 * A position written as `[x=5]` is stored twice. The bag keeps the option and
 * the parser promotes a numeric `x` onto the node beside it, and that promoted
 * field is what the render and `toJSON()` read. Removal used to delete the bag
 * key alone, so the two serializers disagreed: `toString()` reported the
 * position gone while the picture and the JSON still carried it, and saving a
 * composition through the DSL and saving it through JSON gave different
 * compositions.
 *
 * The guard is what stops the fix overreaching. A part coordinate written as
 * `B291:5,0` lands on the same numeric field with no option behind it, so
 * clearing that field unconditionally would eat a position nobody named.
 *
 * Covers:
 * - All three element scopes, each of which has its own promotion site.
 * - The two axes independently, and the half position that leaves behind.
 * - A written coordinate surviving a removal aimed at the option channel.
 * - `[x=5]>`, the part-scope DSL form, which is the one route where a promoted
 *   position and a written coordinate share a slot.
 * - Removal after the parser has already resolved a `MULTIPLE_POSITION_VALUES`
 *   collision, where the displaced coordinate is gone from the model and there
 *   is nothing to fall back to.
 * - Either casing of the axis name, and names nobody owns staying no-ops.
 *
 * Does NOT cover:
 * - Which position value WINS when both channels are written, see
 *   `BlissParser.coordinate-options.test.js`.
 * - How a removal reads an option NAME, see
 *   `BlissSVGBuilder.option-removal-naming.test.js`.
 * - The transient channel, which refuses a position outright with
 *   `MISPLACED_TRANSIENT_OPTION`, so it never promotes a field to clear.
 */

const render = (dsl) => new BlissSVGBuilder(dsl).svgCode;

describe('BlissSVGBuilder position option removal', () => {
  describe('when a position was written as an option', () => {
    it('clears it on toString, the render and toJSON at once', () => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.glyph(1).setOptions({ x: 5 });
      expect(builder.svgCode).not.toBe(render('B291/B291'));

      builder.glyph(1).removeOptions('x');

      expect(builder.toString()).toBe('B291/B291');
      expect(builder.svgCode).toBe(render('B291/B291'));
      expect(builder.toJSON().groups[0].glyphs[1]).not.toHaveProperty('x');
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(render('B291/B291'));
    });

    it('clears it at word scope', () => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.group(0).setOptions({ x: 5 });
      expect(builder.svgCode).not.toBe(render('B291/B291'));

      builder.group(0).removeOptions('x');

      expect(builder.toString()).toBe('B291/B291');
      expect(builder.svgCode).toBe(render('B291/B291'));
    });

    it('clears it at part scope', () => {
      const builder = new BlissSVGBuilder('B291;B291');
      builder.part(1).setOptions({ x: 5 });
      expect(builder.svgCode).not.toBe(render('B291;B291'));

      builder.part(1).removeOptions('x');

      expect(builder.toString()).toBe('B291;B291');
      expect(builder.svgCode).toBe(render('B291;B291'));
    });

    // `[opts]>` is the part-scope option form, and a written coordinate lands on
    // the part too, so this is the one route where the option channel and the
    // coordinate channel share a single slot.
    it('clears a part position the DSL wrote as [x=5]>', () => {
      const builder = new BlissSVGBuilder('[x=5]>B291');
      expect(builder.toString()).toBe('B291:5,0');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('B291');
      expect(builder.svgCode).toBe(render('B291'));
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(render('B291'));
    });
  });

  describe('when a position was written as a coordinate', () => {
    // pins the guard itself: the two near-misses that clear the field whenever
    // the caller names an axis, or whenever the NODE carries one, both eat this
    // coordinate and are killed here and nowhere else.
    it('leaves it standing when the bag never carried that axis', () => {
      const builder = new BlissSVGBuilder('[color=red]>B291:5,0');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('[color=red]>B291:5,0');
      expect(builder.svgCode).toBe(render('[color=red]>B291:5,0'));
    });

    it('leaves it standing when the coordinate sits under a glyph the caller is clearing', () => {
      const builder = new BlissSVGBuilder('B291:5,0');
      builder.glyph(0).setOptions({ x: 9 });
      expect(builder.toString()).toBe('[x=9]B291:5,0');

      builder.glyph(0).removeOptions('x');

      expect(builder.toString()).toBe('B291:5,0');
      expect(builder.svgCode).toBe(render('B291:5,0'));
    });
  });

  describe('when both axes are live', () => {
    it.each([
      ['x', 'B291/[y=3]B291'],
      ['y', 'B291/[x=5]B291'],
    ])('clears %s alone, leaving %s', (axis, expected) => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.glyph(1).setOptions({ x: 5, y: 3 });

      builder.glyph(1).removeOptions(axis);

      expect(builder.toString()).toBe(expected);
      expect(builder.svgCode).toBe(render(expected));
    });

    it('leaves a serializable half position that reparses byte-stable', () => {
      const builder = new BlissSVGBuilder('[x=5;y=3]>B291');
      expect(builder.toString()).toBe('B291:5,3');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('B291:0,3');
      const reparsed = new BlissSVGBuilder(builder.toString());
      expect(reparsed.toString()).toBe('B291:0,3');
      expect(reparsed.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the parser already resolved a position collision', () => {
    // The option beat the coordinate at parse time and the displaced `:5,0` left
    // the model then, not at removal time, so there is nothing to fall back to.
    it('leaves no position at all, and the displaced coordinate does not return', () => {
      const builder = new BlissSVGBuilder('[x=3]>B291:5,0');
      expect(builder.warnings.map((warning) => warning.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
      expect(builder.toString()).toBe('B291:3,0');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('B291');
      expect(builder.svgCode).toBe(render('B291'));
      expect(builder.svgCode).not.toBe(render('B291:5,0'));
    });
  });

  describe('when the axis is named another way', () => {
    it.each(['x', 'X'])('clears the position under %s, which a standard owns in either casing', (named) => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.glyph(1).setOptions({ x: 5 });

      builder.glyph(1).removeOptions(named);

      expect(builder.svgCode).toBe(render('B291/B291'));
    });

    it.each(['position', 'data-x'])('leaves the position alone under %s, which names nothing the element carries', (named) => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.glyph(1).setOptions({ x: 5 });
      const moved = builder.svgCode;

      builder.glyph(1).removeOptions(named);

      expect(builder.svgCode).toBe(moved);
      expect(builder.toString()).toBe('B291/[x=5]B291');
    });
  });
});
