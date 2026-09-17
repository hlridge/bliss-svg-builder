import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that naming an axis removes the position, whichever spelling wrote it:
 * the numeric x/y the layout reads is cleared at this element's own scope,
 * and a part coordinate goes the same way an `[x=5]` option does.
 *
 * A position has two spellings that address the same part, the `[x=5]>` option
 * and the `:x,y` suffix, and both land on one numeric field. That field is what
 * the render and `toJSON()` read. Removal used to delete the option key alone,
 * so the two serializers disagreed: `toString()` reported the position gone
 * while the picture and the JSON still carried it. Removal then learned to
 * clear the field, but only when an option had been behind it, which made the
 * answer depend on which serializer the composition had last been saved
 * through. A position is one value however it was entered, so removal now goes
 * on the name alone.
 *
 * Scope is the one thing that still limits the reach, and it is a different
 * question from spelling. A handle clears the position on its OWN node, so
 * clearing a character's x never reaches a coordinate on a part beneath it.
 *
 * Covers:
 * - All three element scopes, each of which has its own promotion site.
 * - The two axes independently, and the half position that leaves behind,
 *   spelled with one slot per axis that is still set (`B291:,3`, not
 *   `B291:0,3`): the surviving axis is reported, the cleared one is not
 *   re-spelled as a zero.
 * - A written coordinate going under a removal that names its axis.
 * - The same call answering the same before and after a `toString()` round
 *   trip, which is the asymmetry that motivated the one-value ruling.
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
 * - The axis-presence spelling rule itself, across all ten written coordinate
 *   forms, which is what decides how many slots survive a removal; see
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
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
      expect(builder.toString()).toBe('B291:5');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('B291');
      expect(builder.svgCode).toBe(render('B291'));
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(render('B291'));
    });
  });

  describe('when a position was written as a coordinate', () => {
    // A coordinate and an option are two spellings of one value, so naming the
    // axis takes it off either. The sibling option is left standing, which is
    // what keeps this from reading as "removal clears the whole part".
    it('clears it even though no option ever carried that axis', () => {
      const builder = new BlissSVGBuilder('[color=red]>B291:5,0');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('[color=red]>B291:,0');
      expect(builder.svgCode).toBe(render('[color=red]>B291:,0'));
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

      expect(builder.toString()).toBe('B291:,3');
      const reparsed = new BlissSVGBuilder(builder.toString());
      expect(reparsed.toString()).toBe('B291:,3');
      expect(reparsed.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the parser already resolved a position collision', () => {
    // The option beat the coordinate's x at parse time and the displaced `5`
    // left the model then, not at removal time, so there is nothing to fall
    // back to. The y is a different story: the author wrote `:5,0`, so the 0 in
    // the y slot is a value they typed and no option ever contested it. Clearing
    // the option therefore leaves `:,0` standing rather than nothing at all.
    it('clears only the axis the option owned, and the displaced coordinate does not return', () => {
      const builder = new BlissSVGBuilder('[x=3]>B291:5,0');
      expect(builder.warnings.map((warning) => warning.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
      expect(builder.toString()).toBe('B291:3,0');

      builder.part(0).removeOptions('x');

      expect(builder.toString()).toBe('B291:,0');
      expect(builder.svgCode).toBe(render('B291'));
      expect(builder.svgCode).not.toBe(render('B291:5,0'));
    });
  });

  describe('when several names are removed in one call', () => {
    // pins that every key is processed, not just the first: the axis branch
    // sits inside the loop, so stopping after it leaves later names standing.
    it('takes off a position and an ordinary option together', () => {
      const builder = new BlissSVGBuilder('[color=red]>B291:5,0');

      builder.part(0).removeOptions('x', 'color');

      expect(builder.toString()).toBe('B291:,0');
      expect(builder.svgCode).toBe(render('B291:,0'));
    });

    it('takes off an ordinary option and a position in the other order', () => {
      const builder = new BlissSVGBuilder('[color=red]>B291:5,0');

      builder.part(0).removeOptions('color', 'x');

      expect(builder.toString()).toBe('B291:,0');
    });
  });

  describe('when the composition was saved and reloaded first', () => {
    // `[x=2]>DOT` saves as `DOT:2`, so the position is a coordinate on reload.
    // The identical call used to work on the fresh composition and be a silent
    // no-op on the reloaded one, which made "can I undo this" depend on which
    // serializer the composition had been through.
    it('answers the same before and after a toString round-trip', () => {
      const fresh = new BlissSVGBuilder('[x=2]>DOT');
      expect(fresh.toString()).toBe('DOT:2');
      const reloaded = new BlissSVGBuilder(fresh.toString());

      fresh.part(0).removeOptions('x');
      reloaded.part(0).removeOptions('x');

      expect(fresh.toString()).toBe('DOT');
      expect(reloaded.toString()).toBe('DOT');
      expect(reloaded.svgCode).toBe(fresh.svgCode);
    });
  });

  describe('when the axis is named another way', () => {
    it.each(['x', 'X'])('clears the position under %s, which a standard owns in either casing', (named) => {
      const builder = new BlissSVGBuilder('B291/B291');
      builder.glyph(1).setOptions({ x: 5 });

      builder.glyph(1).removeOptions(named);

      expect(builder.svgCode).toBe(render('B291/B291'));
    });

    // pins the axis test itself: removal reaches a field on the node now, so
    // without that test every node field a caller can name is deletable, and
    // codeName is the one that costs the element its identity.
    it.each(['codeName', 'parts'])('leaves the element intact under %s, which names its anatomy rather than an option', (named) => {
      const builder = new BlissSVGBuilder('B291;C8');

      builder.part(0).removeOptions(named);

      expect(builder.toString()).toBe('B291;C8');
      expect(builder.svgCode).toBe(render('B291;C8'));
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
