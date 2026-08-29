import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the widths a `stroke-width` option is allowed to carry. Retiring the
 * 0.1-1.5 clamp let a heavier stroke through, and un-gated the two values no
 * renderer can draw with: a negative width becomes a negative arc radius in
 * the path data it feeds, which is a path error, and a non-finite one is not
 * a length at all.
 *
 * Covers:
 * - A negative width floored to 0 (a legal invisible stroke) and reported.
 * - A non-finite width refused, leaving whatever width was already in force,
 *   and reported.
 * - A value that is not a number at all falling back to the library default
 *   in silence, which is the one member of the family that says nothing.
 * - The repair reaching the derived geometry, not only the attribute: a dot's
 *   radius is computed from the width.
 * - Every scope the option can be written at, and the object surface too.
 * - What is deliberately untouched: zero, and a width above the retired
 *   ceiling.
 * - The written value surviving serialization and being reported again.
 *
 * Does NOT cover:
 * - That a non-numeric width does not THROW and still closes the document,
 *   see `BlissSVGBuilder.option-hardening.test.js`, which pins the no-throw
 *   property rather than which width is drawn.
 * - Rendering and round-trip of a valid part-level width, see
 *   `BlissSVGBuilder.part-stroke-width.test.js`.
 * - The dot-sizing formula itself, see `BlissSVGBuilder.dot-sizing.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
const codes = (builder) => builder.warnings.map(w => w.code);

describe('BlissSVGBuilder stroke-width range', () => {
  describe('when the width is negative', () => {
    it('floors it to 0 on the root and reports it', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-2]||B291');

      expect(rootTag(builder.svgCode)).toContain('stroke-width="0"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });

    it('names the written width in the warning and what replaced it', () => {
      const warning = new BlissSVGBuilder('[stroke-width=-2]||B291').warnings
        .find(w => w.code === 'OUT_OF_RANGE_STROKE_WIDTH');

      expect(warning.source).toBe('stroke-width=-2');
      // the message has to carry the replacement and its consequence, since
      // the two refused widths are one code and only the message tells the
      // reader which repair was applied
      expect(warning.message).toContain('-2');
      expect(warning.message).toContain('0 was used instead');
      expect(warning.message).toContain('invisible stroke');
    });

    it('floors a width nearer zero than the one every other case writes', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-0.5]||B291');

      // pins the floor at 0 rather than at any particular negative value:
      // every other negative case here writes exactly -2, so `written < 0`
      // could be weakened to `written <= -2` and nothing would notice
      expect(rootTag(builder.svgCode)).toContain('stroke-width="0"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
      expect(builder.svgCode).not.toContain('stroke-width="-0.5"');
    });

    it('keeps the radius a dot derives from it positive', () => {
      const svg = new BlissSVGBuilder('[stroke-width=-2]||B4').svgCode;

      // the dot ink is (stroke-width + extra) / 2, so the negative width used
      // to reach the path data as `a-0.41675,-0.41675`, dropping the glyph
      expect(svg).toContain('<g stroke-width="0.1665">');
      expect(svg).not.toMatch(/a-\d/);
    });

    it.each([
      ['part', '[stroke-width=-2]>B291'],
      ['character', '[stroke-width=-2]B291'],
      ['word', '[stroke-width=-2]|B291'],
    ])('floors it at %s scope and reports it', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toContain('<g stroke-width="0">');
      expect(builder.svgCode).not.toContain('stroke-width="-2"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });

    it('floors it from object input too', () => {
      const builder = new BlissSVGBuilder({
        options: { 'stroke-width': -2 },
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }],
      });

      expect(rootTag(builder.svgCode)).toContain('stroke-width="0"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });
  });

  describe('when the width is not a finite number', () => {
    it('leaves the library default on the root and reports it', () => {
      const builder = new BlissSVGBuilder('[stroke-width=Infinity]||B291');

      expect(rootTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });

    it('emits no width of its own below global scope', () => {
      const builder = new BlissSVGBuilder('[stroke-width=Infinity]>B291');

      expect(builder.svgCode).not.toContain('Infinity');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });

    it('leaves the inherited width alone below global scope', () => {
      const builder = new BlissSVGBuilder('[stroke-width=3]||[stroke-width=Infinity]B291');

      // nothing is written for the character, so it draws at the width the
      // root sets, not at the library default; the message must not promise
      // the default here
      expect(rootTag(builder.svgCode)).toContain('stroke-width="3"');
      expect(builder.svgCode).not.toContain('<g stroke-width=');
    });

    it('says the width is left as it was rather than naming a replacement', () => {
      const warning = new BlissSVGBuilder('[stroke-width=Infinity]||B291').warnings
        .find(w => w.code === 'OUT_OF_RANGE_STROKE_WIDTH');

      expect(warning.source).toBe('stroke-width=Infinity');
      expect(warning.message).toContain('Infinity');
      expect(warning.message).toContain('not a length');
      expect(warning.message).toContain('keeps the width it would have had');
    });

    it('keeps a non-finite value out of the path data a dot derives', () => {
      const svg = new BlissSVGBuilder('[stroke-width=Infinity]||B4').svgCode;

      expect(svg).not.toContain('Infinity');
    });

    it('refuses a negative infinity rather than flooring it', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-Infinity]||B291');

      expect(rootTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });
  });

  describe('when the width is not a number at all', () => {
    it('falls back to the library default and says nothing', () => {
      const builder = new BlissSVGBuilder('[stroke-width=abc]||B291');

      // the third member of the family, and the only one that stays silent:
      // the gate that lets it through is `!isNaN`, and removing that gate
      // turns this into a warning nobody asked for
      expect(rootTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(builder.warnings).toEqual([]);
    });

    it('keeps the written value so the composition round-trips', () => {
      const builder = new BlissSVGBuilder('[stroke-width=abc]||B291');

      expect(builder.toString()).toBe('[stroke-width=abc]||B291');
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
    });
  });

  describe('when the width is one the renderer can draw', () => {
    it('accepts zero in silence', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0]||B291');

      expect(rootTag(builder.svgCode)).toContain('stroke-width="0"');
      expect(builder.warnings).toEqual([]);
    });

    it('accepts a width above the retired 1.5 ceiling in silence', () => {
      const builder = new BlissSVGBuilder('[stroke-width=5]||B291');

      expect(rootTag(builder.svgCode)).toContain('stroke-width="5"');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when a refused width is serialized', () => {
    it('keeps the written value and reports it again on reparse', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-2]||B291');

      expect(builder.toString()).toBe('[stroke-width=-2]||B291');
      expect(codes(new BlissSVGBuilder(builder.toString())))
        .toContain('OUT_OF_RANGE_STROKE_WIDTH');
    });
  });
});
