import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins ElementHandle dimension getters: x, y, width, height, bounds,
 * advanceX, baseWidth at group/glyph/part levels, plus the composite
 * .measure() getter and resilience under tree mutation.
 *
 * Covers:
 * - Per-level dimension getters returning the same values as the
 *   underlying ElementSnapshot tree (group, glyph, part).
 * - baseWidth excluding indicator parts on a composite glyph (B291;B86).
 * - .measure() returning all dimension properties in one call, with
 *   values matching the individual getters at every level.
 * - Dimension values reflecting tree mutations (addGlyph).
 * - Dimension getters throwing on removed handles.
 *
 * Does NOT cover:
 * - Snapshot-side baseWidth field presence, see
 *   `BlissElement.base-width.test.js`.
 * - Parity of all handle/snapshot fields beyond dimensions, see
 *   `ElementHandle.parity.test.js`.
 * - Absolute layout-value correctness for advanceX or baseWidth (these
 *   tests assert handle/snapshot agreement, not raw layout numbers);
 *   pinned indirectly via
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */
describe('ElementHandle dimensions', () => {
  const DSL = 'B291/B119//B138';

  describe('when probing dimensions at group level', () => {
    it('returns the absolute x position matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.x).toBe(snap.x);
    });

    it('returns 0 for y on the first group', () => {
      const b = new BlissSVGBuilder(DSL);
      expect(b.group(0).y).toBe(0);
    });

    it('returns the total width matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.width).toBe(snap.width);
    });

    it('returns the total height matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.height).toBe(snap.height);
    });

    it('returns the bounds object matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.bounds).toEqual(snap.bounds);
    });

    it('returns the spacing-step advanceX matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.advanceX).toBe(snap.advanceX);
    });

    it('returns the baseWidth (width excluding indicators) matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const group = b.group(0);
      const snap = b.snapshot().children[0];
      expect(group.baseWidth).toBe(snap.baseWidth);
    });
  });

  describe('when probing dimensions at glyph level', () => {
    it('returns the absolute x position of a non-first glyph matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const glyph = b.group(0).glyph(1);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(glyph.x).toBe(glyphs[1].x);
    });

    it('returns the total width matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const glyph = b.group(0).glyph(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(glyph.width).toBe(glyphs[0].width);
    });

    it('returns the bounds object matching the snapshot', () => {
      const b = new BlissSVGBuilder(DSL);
      const glyph = b.group(0).glyph(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(glyph.bounds).toEqual(glyphs[0].bounds);
    });

    it('returns a baseWidth that excludes indicator parts of a composite glyph (B291;B86)', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.group(0).glyph(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(glyph.baseWidth).toBe(glyphs[0].baseWidth);
      expect(glyph.baseWidth).toBeLessThanOrEqual(glyph.width);
    });
  });

  describe('when probing dimensions at part level', () => {
    it('returns the absolute x position matching the snapshot part node', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(part.x).toBe(glyphs[0].children[0].x);
    });

    it('returns the part width matching the snapshot part node', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(part.width).toBe(glyphs[0].children[0].width);
    });

    it('returns the bounds object matching the snapshot part node', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(part.bounds).toEqual(glyphs[0].children[0].bounds);
    });
  });

  describe('when the handle tree mutates', () => {
    it('reflects updated dimension values after addGlyph', () => {
      const b = new BlissSVGBuilder('B291');
      const group = b.group(0);
      const widthBefore = group.width;
      group.addGlyph('B119');
      expect(group.width).toBeGreaterThan(widthBefore);
    });

    it('throws when reading dimensions on a removed handle', () => {
      const b = new BlissSVGBuilder('B291/B119');
      const glyph = b.group(0).glyph(1);
      glyph.remove();
      expect(() => glyph.x).toThrow(/removed/);
    });
  });

  describe('when reading multiple dimensions via measure()', () => {
    it('returns an object exposing all dimension properties at once', () => {
      const b = new BlissSVGBuilder('B291');
      const group = b.group(0);
      const m = group.measure();
      expect(m).toHaveProperty('x');
      expect(m).toHaveProperty('y');
      expect(m).toHaveProperty('width');
      expect(m).toHaveProperty('height');
      expect(m).toHaveProperty('bounds');
      expect(m).toHaveProperty('advanceX');
      expect(m).toHaveProperty('baseWidth');
    });

    it('returns values that match the individual getters at group level', () => {
      const b = new BlissSVGBuilder('B291/B119//B138');
      const group = b.group(1);
      const m = group.measure();
      expect(m.x).toBe(group.x);
      expect(m.y).toBe(group.y);
      expect(m.width).toBe(group.width);
      expect(m.height).toBe(group.height);
      expect(m.bounds).toEqual(group.bounds);
      expect(m.advanceX).toBe(group.advanceX);
      expect(m.baseWidth).toBe(group.baseWidth);
    });

    it('returns dimensions at glyph level matching the individual getters', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.group(0).glyph(0);
      const m = glyph.measure();
      expect(m.width).toBe(glyph.width);
      expect(m.baseWidth).toBe(glyph.baseWidth);
    });

    it('returns dimensions at part level matching the individual getters', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      const m = part.measure();
      expect(m.x).toBe(part.x);
      expect(m.bounds).toEqual(part.bounds);
    });
  });
});
