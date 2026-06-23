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
});
