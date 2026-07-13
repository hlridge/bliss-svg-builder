import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that crop never emits a negative viewBox dimension or a negative /
 * NaN svg width/height: when crop insets past the available box, the cropped
 * width/height floors at 0 instead of going negative.
 *
 * Covers:
 * - All-empty document (composition.width 0) under a numeric crop that exceeds
 *   the margin: viewBox width and svg width clamp to 0 (were -0.5 / -3).
 * - `crop:true` coerces to numeric 1 and clamps identically.
 * - The clamp holds for every empty state that renders identically: the
 *   `''` string, object input `{groups:[{glyphs:[]}]}`, and `addGroup('')`.
 * - The crop==margin boundary (0.75) already yields width 0; a within-margin
 *   crop (0.5) is left untouched (the clamp does not over-clamp positives).
 * - Over-cropping a non-empty document (crop:100 on B291, single-side
 *   crop-right:100): the same negative-dimension class, clamped per axis.
 * - The svg-height aspect-ratio branch: a zero-width viewBox yields svg
 *   width 0, and a fully-collapsed box (both viewBox dims 0) does not divide
 *   by zero into NaN.
 *
 * Does NOT cover:
 * - Normal in-bounds crop math (per-side, auto, compact, margin interaction),
 *   see `BlissSVGBuilder.crop.test.js`.
 * - Empty-document extent without crop, see
 *   `BlissSVGBuilder.empty-content-extent.test.js`.
 */

// Parse the <svg> open-tag geometry: viewBox as [x,y,w,h] plus the width /
// height attributes (first match is the open tag, which precedes any content).
function render(input, opts) {
  const svg = new BlissSVGBuilder(input, opts).svgCode;
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const width = Number(svg.match(/\bwidth="([^"]+)"/)[1]);
  const height = Number(svg.match(/\bheight="([^"]+)"/)[1]);
  return { vb, width, height, svg };
}

describe('BlissSVGBuilder crop dimension clamp', () => {
  describe('when an all-empty document is cropped', () => {
    it('clamps viewBox width and svg width to 0 instead of negative under crop:1', () => {
      const { vb, width, height } = render('', { crop: 1 });
      // pins the viewBox-width floor; unclamped this is -0.5 (invalid SVG)
      expect(vb).toEqual([0.25, 0.25, 0, 19.5]);
      // pins the svg width attribute floor; unclamped this is -3
      expect(width).toBe(0);
      expect(height).toBe(117);
    });

    it('treats crop:true as numeric 1 and clamps identically', () => {
      // note: crop:true coerces to numeric 1 (isNaN(true) === false)
      const asTrue = render('', { crop: true });
      const asOne = render('', { crop: 1 });
      expect(asTrue.svg).toBe(asOne.svg);
      expect(asTrue.vb[2]).toBe(0);
    });

    it('clamps identically for object-input {groups:[{glyphs:[]}]}', () => {
      const obj = render({ groups: [{ glyphs: [] }] }, { crop: 1 });
      expect(obj.vb[2]).toBe(0);
      expect(obj.width).toBe(0);
      // the row's sibling empty state renders byte-identically to ''
      expect(obj.svg).toBe(render('', { crop: 1 }).svg);
    });

    it('clamps after addGroup("") on a cropped empty builder', () => {
      const builder = new BlissSVGBuilder('', { crop: 1 });
      builder.addGroup('');
      const vb = builder.svgCode.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      expect(vb[2]).toBe(0);
    });

    it('leaves a within-margin crop:0.5 untouched (still positive)', () => {
      // regression: a crop that stays inside the box must not be clamped
      const { vb, width } = render('', { crop: 0.5 });
      expect(vb).toEqual([-0.25, -0.25, 0.5, 20.5]);
      expect(width).toBe(3);
    });

    it('yields a zero-width box at the crop==margin boundary (crop:0.75)', () => {
      // the boundary already produces width 0 today; the clamp keeps it 0,
      // making the crop 0.75 -> 1 transition monotonic (0 then 0), never negative
      const { vb, width } = render('', { crop: 0.75 });
      expect(vb).toEqual([0, 0, 0, 20]);
      expect(width).toBe(0);
    });

    it('keeps the normal empty-document box when uncropped', () => {
      // regression: the clamp must not disturb the uncropped empty render
      const { vb, width, height } = render('', undefined);
      expect(vb).toEqual([-0.75, -0.75, 1.5, 21.5]);
      expect(width).toBe(9);
      expect(height).toBe(129);
    });
  });

  describe('when crop exceeds the content of a non-empty document', () => {
    it('clamps both width and height to 0 under crop:100 on B291', () => {
      // over-crop is a general class, not empty-only: both axes were negative
      const { vb, width, height } = render('B291', { crop: 100 });
      expect(vb[2]).toBe(0);
      expect(vb[3]).toBe(0);
      expect(width).toBe(0);
      expect(height).toBe(0);
    });

    it('clamps only the over-cropped axis under a single-side crop-right:100 on B291', () => {
      const { vb, width, height } = render('B291', { 'crop-right': 100 });
      expect(vb[2]).toBe(0); // width was -90.5
      expect(vb[3]).toBe(21.5); // height untouched
      expect(width).toBe(0);
      expect(height).toBe(129);
    });

    it('leaves an in-bounds crop:2 on B291 untouched', () => {
      // regression: a crop within the content is unaffected by the clamp
      const { vb } = render('B291', { crop: 2 });
      expect(vb[2]).toBe(5.5); // 9.5 - 2 - 2
    });
  });

  describe('when a degenerate crop combines with svg-height', () => {
    it('keeps svg width finite at 0 rather than negative under crop:1', () => {
      const { vb, width, height } = render('', { crop: 1, 'svg-height': 100 });
      expect(vb[2]).toBe(0);
      // aspect-ratio branch: (0 / 19.5) * 100 = 0, not the unclamped -2.5641
      expect(width).toBe(0);
      expect(height).toBe(100);
    });

    it('keeps svg width at 0 rather than NaN when both viewBox dims collapse under crop:11', () => {
      const { vb, width, height } = render('', { crop: 11, 'svg-height': 100 });
      expect(vb[2]).toBe(0);
      expect(vb[3]).toBe(0);
      // pins the divide-by-zero guard: with viewBoxHeight 0, (0/0)*100 = NaN
      expect(width).toBe(0);
      expect(height).toBe(100);
    });

    it('guards on the viewBox height divisor under a vertical-only over-crop', () => {
      // height collapses to 0 while width stays positive: the guard is on the
      // divisor (height), so svg width is 0, not Infinity
      const { vb, width, height } = render('B291', { 'crop-top': 11, 'crop-bottom': 11, 'svg-height': 100 });
      expect(vb[3]).toBe(0);
      expect(vb[2]).toBe(9.5);
      expect(width).toBe(0);
      expect(height).toBe(100);
    });
  });
});
