import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the read-surface parity between `ElementHandle` and the
 * corresponding `ElementSnapshot` node: every observable read on a
 * handle (content-classification flags, identity key, dimension
 * fields, `measure()` result) must agree with the snapshot side for
 * the same underlying tree node.
 *
 * Covers:
 * - Content flags: `isBlissGlyph`, `isExternalGlyph`, `isHeadGlyph`,
 *   `isSpaceGroup`, `isShape`.
 * - Identity: `key` matches between handle and snapshot, and round-
 *   trips via `getElementByKey`.
 * - Dimensions: `offsetX` and `offsetY` on the handle equal the
 *   snapshot's offsets, and `measure()` exposes the same values.
 *
 * Does NOT cover:
 * - Mutation operations through the handle, see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - The full `ElementHandle.dimensions` API surface (height, width,
 *   anchor offsets), see `ElementHandle.dimensions.test.js`.
 */
describe('ElementHandle parity with ElementSnapshot', () => {
  describe('when comparing content-classification flags', () => {
    it('returns isBlissGlyph=true on a glyph handle for a Bliss code (B291)', () => {
      const b = new BlissSVGBuilder('B291');
      expect(b.glyph(0).isBlissGlyph).toBe(true);
      expect(b.glyph(0).isExternalGlyph).toBe(false);
    });

    it('returns isExternalGlyph=true on a glyph handle for an external code (Xa)', () => {
      const b = new BlissSVGBuilder('Xa');
      expect(b.glyph(0).isExternalGlyph).toBe(true);
      expect(b.glyph(0).isBlissGlyph).toBe(false);
    });

    it('returns isHeadGlyph=true only on the first glyph in a word', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      expect(b.group(0).headGlyph().isHeadGlyph).toBe(true);
      const glyphs = [b.glyph(0), b.glyph(1)];
      const heads = glyphs.filter(g => g.isHeadGlyph);
      expect(heads).toHaveLength(1);
    });

    it('returns isSpaceGroup=true only on space-group handles', () => {
      const b = new BlissSVGBuilder('B313//B431');
      expect(b.element(1).isSpaceGroup).toBe(true);
      expect(b.group(0).isSpaceGroup).toBe(false);
    });

    it('returns isShape=true on a part handle for a shape primitive (H)', () => {
      const b = new BlissSVGBuilder('H');
      expect(b.glyph(0).part(0).isShape).toBe(true);
      expect(b.glyph(0).part(0).isBlissGlyph).toBe(false);
    });
  });

  describe('when comparing identity keys', () => {
    it('returns the same key on the handle and the matching snapshot node', () => {
      const b = new BlissSVGBuilder('B291');
      const handleKey = b.glyph(0).key;
      const snapKey = b.elements.children[0].children[0].key;
      expect(handleKey).toBe(snapKey);
      expect(typeof handleKey).toBe('string');
    });

    it('roundtrips a handle key through getElementByKey', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const partHandle = b.glyph(0).part(1);
      const key = partHandle.key;
      const recovered = b.getElementByKey(key);
      expect(recovered.codeName).toBe(partHandle.codeName);
    });
  });

  describe('when comparing dimension fields', () => {
    it('reports the explicit shape offsets on a handle (H:0,8 yields offsetY=8)', () => {
      const b = new BlissSVGBuilder('H:0,8');
      const part = b.glyph(0).part(0);
      expect(part.offsetX).toBe(0);
      expect(part.offsetY).toBe(8);
    });

    it('reports offsetX/offsetY on the handle that match the snapshot offsets', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const partHandle = b.glyph(0).part(1);
      const partSnap = b.elements.children[0].children[0].children[1];
      expect(partHandle.offsetX).toBe(partSnap.offsetX);
      expect(partHandle.offsetY).toBe(partSnap.offsetY);
    });

    it('exposes offsetX and offsetY on the handle.measure() result', () => {
      const b = new BlissSVGBuilder('H:0,8');
      const m = b.glyph(0).part(0).measure();
      expect(m.offsetX).toBe(0);
      expect(m.offsetY).toBe(8);
    });
  });
});
