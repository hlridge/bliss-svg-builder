import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a part position serializes by PRESENCE, not by value: an axis the
 * author wrote comes back written, whatever its value, and an axis nobody
 * wrote comes back unset instead of coming back as a literal `0`.
 *
 * The difference is only visible on a part whose own default position is not
 * the origin, which in this library means an indicator: `B291;B86` places the
 * indicator for you, `B291;B86:0,0` pins it at the base's left edge, and those
 * are two different instructions. Every other part defaults to the origin, so
 * for those the same rule moves bytes without moving ink.
 *
 * Covers:
 * - The ten written coordinate forms and the exact string each emits,
 *   including the empty-slot spellings (`:0,`, `:,0`, `:,`).
 * - Render stability across a `toString()` round-trip, on both a base whose
 *   default indicator y is 0 and bases that carry an anchor offset.
 * - The indicator-ordering exemption reading presence: a following part with
 *   ANY written axis, an all-zero one included, no longer convicts a preceding
 *   indicator, while a part with no written axis still does.
 * - An ordinary part, whose default position really is the origin, keeping its
 *   rendered position whether that origin is written or not.
 * - The `[x=N;y=M]>` option channel and the `:x,y` coordinate channel emitting
 *   one string for one position.
 *
 * Does NOT cover:
 * - The parent-offset approximation when a nested composite decomposes: an
 *   unset axis under a non-zero offset is emitted as a value, because the
 *   serializer cannot compute the layout default it would have to add the
 *   offset to. Nothing pins it yet; it lands with the coupled call sites.
 * - The preserve path's own copies of the presence test, see
 *   `BlissSVGBuilder.custom-definition-serialization.test.js` (a preserved
 *   name shedding a coordinate) and `BlissSVGBuilder.typed-name-preserve.test.js`
 *   (a decorated anatomy blocking a name restore).
 * - The warning `source` text for a misplaced part that carries a coordinate,
 *   see `BlissSVGBuilder.indicator-sequencing.test.js`.
 * - The coordinate-suffix grammar itself (what parses, what warns
 *   MALFORMED_COORDINATES), see `BlissSVGBuilder.coordinate-syntax.test.js`.
 * - Glyph, word and composition scope positions, which are written as options
 *   and already carry presence, see
 *   `BlissSVGBuilder.positioning-options.test.js`.
 */
describe('BlissSVGBuilder part position presence', () => {
  const rebuilt = (dsl) => {
    const source = new BlissSVGBuilder(dsl);
    return { svg: source.svgCode, reloadedSvg: new BlissSVGBuilder(source.toString()).svgCode };
  };

  describe('when a written coordinate is serialized', () => {
    it.each([
      ['B291;B86:0,0', 'B291;B86:0,0'],
      ['B291;B86:0,',  'B291;B86:0'],
      ['B291;B86:,0',  'B291;B86:,0'],
      ['B291;B86:3,',  'B291;B86:3'],
      ['B291;B86:,3',  'B291;B86:,3'],
      ['B291;B86:3,0', 'B291;B86:3,0'],
      ['B291;B86:0,3', 'B291;B86:0,3'],
      ['B291;B86:3',   'B291;B86:3'],
      ['B291;B86:0',   'B291;B86:0'],
      ['B291;B86:,',   'B291;B86'],
    ])('writes %s back as %s', (dsl, expected) => {
      expect(new BlissSVGBuilder(dsl).toString()).toBe(expected);
    });
  });

  describe('when a serialized composition is rebuilt', () => {
    // B291's default indicator y works out to exactly 0, so on that base an
    // x-only form round-trips by luck even while the y half is lossy. B119 and
    // B138 carry an anchor offset, so both axes are observable there.
    it.each([
      'B291;B86:0,0',
      'B291;B86:0,',
      'B291;B86:0',
      'B291;B86:,3',
      'B119;B86:3',
      'B119;B86:,3',
      'B119;B86:0,0',
      'B138;B86:3',
    ])('renders %s identically after a toString() round-trip', (dsl) => {
      const { svg, reloadedSvg } = rebuilt(dsl);
      expect(reloadedSvg).toBe(svg);
    });
  });

  describe('when an indicator precedes an explicitly positioned part', () => {
    // The exemption asks whether the FOLLOWING content was hand-placed: content
    // the author positioned deliberately does not convict the indicator before
    // it. Reading presence puts the all-zero spellings inside that exemption,
    // because a written `:0,0` now survives serialization and so can carry the
    // exemption across a round-trip.
    it.each([
      ['B86;C8:0,0', 'B86;C8:0,0'],
      ['B86;C8:0,',  'B86;C8:0'],
      ['B86;C8:,0',  'B86;C8:,0'],
      ['B86;C8:0',   'B86;C8:0'],
      ['B86;C8:3,0', 'B86;C8:3,0'],
    ])('keeps the indicator in %s, writing %s and warning nothing', (dsl, expected) => {
      const b = new BlissSVGBuilder(dsl);
      expect(b.toString()).toBe(expected);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when an indicator precedes a part with no written axis', () => {
    it.each(['B86;C8', 'B86;C8:,'])(
      'drops the indicator in %s with MISPLACED_INDICATOR_PART', (dsl) => {
        const b = new BlissSVGBuilder(dsl);
        expect(b.toString()).toBe('C8');
        expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_INDICATOR_PART']);
        expect(b.warnings[0].source).toBe('B86');
      });
  });

  describe('when a part takes the origin as its own default', () => {
    it('writes a part with no written coordinate as a bare code', () => {
      expect(new BlissSVGBuilder('B291;C8').toString()).toBe('B291;C8');
    });

    it('writes an explicit origin back without moving the ink', () => {
      // A written `:0,0` is a position the author stated, so it survives. On a
      // part whose default already IS the origin that changes the string and
      // not the picture: the cost of asking one question instead of two.
      const asPart = new BlissSVGBuilder('B291;C8:0,0');
      expect(asPart.toString()).toBe('B291;C8:0,0');
      expect(asPart.svgCode).toBe(new BlissSVGBuilder('B291;C8').svgCode);

      const asWholeGlyph = new BlissSVGBuilder('B291:0,0');
      expect(asWholeGlyph.toString()).toBe('B291:0,0');
      expect(asWholeGlyph.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });
  });

  describe('when the position is written as an option instead of a coordinate', () => {
    it('writes an option-set axis and a coordinate-set axis as one string', () => {
      const option = new BlissSVGBuilder('B291;[y=3]>B86');
      const coordinate = new BlissSVGBuilder('B291;B86:,3');
      expect(option.toString()).toBe('B291;B86:,3');
      expect(coordinate.toString()).toBe('B291;B86:,3');
      expect(option.svgCode).toBe(coordinate.svgCode);
    });

    it('fills x from the option and y from the coordinate without warning', () => {
      const b = new BlissSVGBuilder('B291;[x=3]>B86:,5');
      expect(b.toString()).toBe('B291;B86:3,5');
      expect(b.warnings).toEqual([]);
    });

    it('reports MULTIPLE_POSITION_VALUES when both name the same axis', () => {
      const b = new BlissSVGBuilder('B291;[x=3]>B86:9,5');
      expect(b.toString()).toBe('B291;B86:3,5');
      expect(b.warnings.map(w => w.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
    });
  });
});
