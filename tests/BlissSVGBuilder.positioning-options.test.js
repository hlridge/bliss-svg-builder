import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the positioning contract for a glyph-level `x` (GH #18, chunk C5).
 *
 * THE MODEL, ratified 2026-08-25. A glyph-level `x` is LEADING BLANK owned by
 * that glyph, not a position for it:
 *
 *   - the glyph starts where the flow puts it, i.e. at the previous glyph's
 *     advance, exactly as it would without the option;
 *   - the glyph's own width grows by `x`;
 *   - its content (ink) begins `x` further in.
 *
 * So `advanceX` keeps meaning "where the next GLYPH starts", which is what the
 * API reference documents it as, and whether a glyph carries internal blank is
 * that glyph's own business.
 *
 * Worked example, `B99/[x=5]B291` (B99 has ink width 2 and advance 4):
 *
 *   B99 advance 4  ->  B291 glyph starts at 4
 *   B291 owns 5 units of leading blank, so its width is 5 + 8 = 13
 *   B291 ink starts at 4 + 5 = 9
 *
 * This REPLACED an incoherent rule that derived the next glyph's position from
 * the previous glyph's INK width (`previous.width + x`, so ink landed at 7 and
 * `x=0` silently deleted the char-space). No text system positions a pen from
 * ink extent; side bearings exist precisely to keep the two independent.
 *
 * `x` is treated differently from `y` on purpose: `x` runs along the writing
 * direction, where the flow already owns the position, so an authored value has
 * to say something the flow does not. `y` has no flow to negotiate with and
 * stays a plain offset.
 *
 * Does NOT cover:
 * - Global (`[x=5]||`) and word (`[x=5]|`) scope, unchanged by this model; see
 *   `BlissSVGBuilder.effective-bounds.test.js`.
 * - Part-level coordinates (`B291:2,3`, `[x=2]>B291`), which position a part
 *   inside its glyph and follow the coordinate-ownership rule; see
 *   `BlissParser.coordinate-options.test.js`.
 */

const inkXs = (builder) =>
  [...builder.svgCode.matchAll(/M(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[1]));

const glyphs = (builder) => builder.groups[0].children;

describe('BlissSVGBuilder positioning options', () => {
  describe('when a glyph carries a leading-blank x', () => {
    it('starts the glyph where the flow puts it, not where the ink lands', () => {
      const plain = new BlissSVGBuilder('B99/B291');
      const blanked = new BlissSVGBuilder('B99/[x=5]B291');
      expect(glyphs(plain)[1].x).toBe(4);
      expect(glyphs(blanked)[1].x).toBe(4);
    });

    it('grows the glyph by the blank it owns', () => {
      expect(glyphs(new BlissSVGBuilder('B99/B291'))[1].width).toBe(8);
      expect(glyphs(new BlissSVGBuilder('B99/[x=5]B291'))[1].width).toBe(13);
    });

    it('begins the ink that much further in', () => {
      expect(inkXs(new BlissSVGBuilder('B99/B291'))[2]).toBe(4);
      expect(inkXs(new BlissSVGBuilder('B99/[x=5]B291'))[2]).toBe(9);
    });

    it('keeps advanceX meaning where the next glyph starts', () => {
      // The invariant the API reference documents: `m.x + m.advanceX` is the
      // next sibling's origin. It must hold whatever a glyph carries.
      for (const input of ['B99/B291', 'B99/[x=5]B291', 'B99/[x=0]B291', 'B99/AK:5/B291']) {
        const [first, second] = glyphs(new BlissSVGBuilder(input));
        expect(first.x + first.advanceX).toBe(second.x);
      }
    });

    it('no longer lets x=0 delete the char-space', () => {
      // The old ink-derived rule put `[x=0]` at the previous glyph's ink edge,
      // silently removing the 2-unit char-space.
      expect(glyphs(new BlissSVGBuilder('B99/[x=0]B291'))[1].x)
        .toBe(glyphs(new BlissSVGBuilder('B99/B291'))[1].x);
    });

    it('carries its blank into the advance, so the rest of the line follows', () => {
      const [, second, third] = glyphs(new BlissSVGBuilder('B99/[x=5]B291/B99'));
      expect(second.x).toBe(4);
      expect(second.width).toBe(13);
      expect(third.x).toBe(second.x + second.advanceX);
    });

    it('applies the same rule to the first glyph of a word', () => {
      const b = new BlissSVGBuilder('[x=5]B291');
      expect(glyphs(b)[0].x).toBe(0);
      expect(glyphs(b)[0].width).toBe(13);
      expect(inkXs(b)[0]).toBe(5);
    });
  });

  describe('when a glyph carries leading blank alongside kerning', () => {
    it('keeps them independent: kerning moves the gap, x fills the glyph', () => {
      // AK:5 makes the PREVIOUS glyph's gap 5 (B291 still 8 wide, ink at its
      // own origin); [x=5] gives THIS glyph 5 units of blank. Different owners.
      const kerned = new BlissSVGBuilder('B99/AK:5/B291');
      expect(glyphs(kerned)[1].x).toBe(7);
      expect(glyphs(kerned)[1].width).toBe(8);

      const blanked = new BlissSVGBuilder('B99/[x=5]B291');
      expect(glyphs(blanked)[1].x).toBe(4);
      expect(glyphs(blanked)[1].width).toBe(13);
    });

    it('adds them when both are written', () => {
      const b = new BlissSVGBuilder('B99/AK:5/[x=5]B291');
      expect(glyphs(b)[1].x).toBe(7);
      expect(glyphs(b)[1].width).toBe(13);
      expect(inkXs(b)[2]).toBe(12);
    });
  });

  describe('when a glyph-level y is set', () => {
    it('stays a plain offset, since no flow owns the vertical', () => {
      const plain = new BlissSVGBuilder('B99/B291');
      const shifted = new BlissSVGBuilder('B99/[y=3]B291');
      expect(glyphs(shifted)[1].x).toBe(glyphs(plain)[1].x);
      expect(glyphs(shifted)[1].width).toBe(glyphs(plain)[1].width);
    });
  });

  describe('when the composition round-trips', () => {
    it.each([
      ['B99/[x=5]B291'],
      ['B99/[x=0]B291'],
      ['[x=5]B291'],
      ['B99/AK:5/[x=5]B291'],
      ['B99/[x=5]B291/B99'],
    ])('renders identically after a toString and a toJSON round-trip: %s', (input) => {
      const direct = new BlissSVGBuilder(input);
      expect(new BlissSVGBuilder(direct.toString()).svgCode).toBe(direct.svgCode);
      expect(new BlissSVGBuilder(direct.toJSON()).svgCode).toBe(direct.svgCode);
    });
  });
});
