import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the per-family dot sizing system: DOT and SDOT resolve their own
 * width independently, SDOT defaults to half of DOT's extra, and
 * `dot-extra-width` acts as a bulk knob that preserves the DOT:SDOT
 * half-relationship.
 *
 * Covers:
 * - SDOT default extra 0.1665 (half of DOT's 0.333): the default SDOT dot
 *   renders stroke-width 0.33325.
 * - `dot-extra-width` as a bulk knob: SDOT follows as half, DOT takes the
 *   full value.
 * - `sdot-extra-width`: overrides the SDOT half-default (and the SDOT
 *   default), wins over `dot-extra-width` for SDOT, never touches DOT, and
 *   clamps to 0-1.
 * - Absolute `dot-width`/`sdot-width`: pin the rendered diameter (inked
 *   stroke-width = value/2), beat the relative knobs, stay independent of
 *   `stroke-width`, and clamp to [0, 1.5].
 *
 * Does NOT cover:
 * - The DOT/COMMA stroke-width formula and clamping, see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - Rendered visual dot SIZE (pixel diff) and indicator-dot retargeting,
 *   vetted by the visual-regression e2e suite (R2 baseline regen).
 * - Custom dot definitions (custom getPath primitives are not portable;
 *   out of R16 scope).
 */
describe('BlissSVGBuilder dot sizing', () => {
  // A bare dot's emitted stroke-width is the inked disc width; the outer
  // content group separately carries the default stroke-width 0.5.
  describe('when SDOT renders by default', () => {
    it('renders the small dot at half of DOT extra (0.1665)', () => {
      // (0.5 + 0.1665) / 2 = 0.33325
      const svg = new BlissSVGBuilder('SDOT').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.25"'); // the retired extra-0 SDOT
    });
  });

  describe('when dot-extra-width is set as a bulk knob', () => {
    it('halves dot-extra-width for SDOT', () => {
      // SDOT follows as half: (0.5 + 0.6/2) / 2 = 0.4
      expect(new BlissSVGBuilder('[dot-extra-width=0.6]||SDOT').svgCode).toContain('stroke-width="0.4"');
    });

    it('keeps the full dot-extra-width for DOT', () => {
      // DOT takes the full value: (0.5 + 0.6) / 2 = 0.55
      expect(new BlissSVGBuilder('[dot-extra-width=0.6]||DOT').svgCode).toContain('stroke-width="0.55"');
    });
  });

  describe('when sdot-extra-width is set', () => {
    it('sizes SDOT independently', () => {
      // (0.5 + 0.8) / 2 = 0.65
      expect(new BlissSVGBuilder('[sdot-extra-width=0.8]||SDOT').svgCode).toContain('stroke-width="0.65"');
    });

    it('overrides the dot-extra-width half-default for SDOT', () => {
      // sdot override wins: (0.5 + 0.1) / 2 = 0.3, not the 0.6/2 half-default (0.4)
      const svg = new BlissSVGBuilder('[dot-extra-width=0.6;sdot-extra-width=0.1]||SDOT').svgCode;
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).not.toContain('stroke-width="0.4"');
    });

    it('leaves DOT untouched', () => {
      // DOT keeps its own default extra 0.333: (0.5 + 0.333) / 2 = 0.4165
      const svg = new BlissSVGBuilder('[sdot-extra-width=0.8]||DOT').svgCode;
      expect(svg).toContain('stroke-width="0.4165"');
      expect(svg).not.toContain('stroke-width="0.65"'); // the sdot value must not bleed into DOT
    });

    it('clamps to a maximum of 1', () => {
      // sdot-extra-width=2 clamps to 1: (0.5 + 1) / 2 = 0.75
      expect(new BlissSVGBuilder('[sdot-extra-width=2]||SDOT').svgCode).toContain('stroke-width="0.75"');
    });

    it('clamps to a minimum of 0', () => {
      // sdot-extra-width=-0.5 clamps to 0: (0.5 + 0) / 2 = 0.25
      expect(new BlissSVGBuilder('[sdot-extra-width=-0.5]||SDOT').svgCode).toContain('stroke-width="0.25"');
    });
  });

  describe('when an absolute width is set', () => {
    it('pins the DOT diameter at half the dot-width', () => {
      // dot-width=0.8 → inked stroke-width 0.8 / 2 = 0.4
      expect(new BlissSVGBuilder('[dot-width=0.8]||DOT').svgCode).toContain('stroke-width="0.4"');
    });

    it('pins the SDOT diameter at half the sdot-width', () => {
      // sdot-width=0.7 → 0.7 / 2 = 0.35 (0.5 would collide with the default outer stroke-width)
      expect(new BlissSVGBuilder('[sdot-width=0.7]||SDOT').svgCode).toContain('stroke-width="0.35"');
    });

    it('beats the relative dot-extra-width', () => {
      // absolute wins: dot-width=0.8 → 0.4, ignoring dot-extra-width=1 (which alone gives 0.75)
      expect(new BlissSVGBuilder('[dot-extra-width=1;dot-width=0.8]||DOT').svgCode).toContain('stroke-width="0.4"');
    });

    it('stays independent of stroke-width', () => {
      // dot ink fixed at 0.4 even when the line weight is 1.5
      expect(new BlissSVGBuilder('[stroke-width=1.5;dot-width=0.8]||DOT').svgCode).toContain('stroke-width="0.4"');
    });

    it('clamps an oversized dot-width to the maximum 1.5', () => {
      // dot-width=5 clamps to 1.5 → 1.5 / 2 = 0.75
      expect(new BlissSVGBuilder('[dot-width=5]||DOT').svgCode).toContain('stroke-width="0.75"');
    });

    it('clamps an oversized sdot-width to the maximum 1.5', () => {
      // sdot-width=5 clamps to 1.5 → 0.75 (the same shared cap as dot-width)
      expect(new BlissSVGBuilder('[sdot-width=5]||SDOT').svgCode).toContain('stroke-width="0.75"');
    });

    it('clamps a negative dot-width to 0', () => {
      // dot-width=-1 clamps to 0 → 0 (an invisible dot, no crash)
      expect(new BlissSVGBuilder('[dot-width=-1]||DOT').svgCode).toContain('stroke-width="0"');
    });
  });
});
