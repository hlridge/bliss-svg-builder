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
 *   default), wins over `dot-extra-width` for SDOT, never touches DOT, is
 *   honoured above the retired ceiling of 1, and is refused below 0.
 * - Absolute `dot-width`/`sdot-width`: pin the rendered diameter (inked
 *   stroke-width = value/2), beat the relative knobs, stay independent of
 *   `stroke-width`, are honoured above the retired cap of 1.5, and are
 *   refused below 0.
 * - Indicator dots render at SDOT ink (0.33325): the directly-composed
 *   B83/B907 dots, the B84/B85/B912 dots relocated off the shared PERIOD
 *   glyph B270, and the inherited dot inside composites (B88). The shared
 *   PERIOD glyph B270 stays at full DOT size.
 *
 * Does NOT cover:
 * - The DOT/COMMA stroke-width formula and clamping, see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - The rendered visual dot SIZE as pixels (the SDOT-default and
 *   indicator-retarget pixel diffs are vetted by the visual-regression
 *   e2e suite / R2 baseline regen).
 * - Custom dot definitions (custom getPath primitives are not portable;
 *   out of R16 scope).
 */
describe('BlissSVGBuilder dot sizing', () => {
  // A bare dot's emitted stroke-width is the inked disc width; the root <svg>
  // separately carries the default stroke-width 0.5 that the disc is sized from.
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

    it('honours a value above the retired ceiling of 1', () => {
      // no ceiling any more: (0.5 + 2) / 2 = 1.25, where 2 used to clamp to 1
      const builder = new BlissSVGBuilder('[sdot-extra-width=2]||SDOT');
      expect(builder.svgCode).toContain('stroke-width="1.25"');
      expect(builder.warnings).toEqual([]);
    });

    it('refuses a negative value and sizes the dot as if it were unwritten', () => {
      // Refused rather than floored to 0, so SDOT keeps its own default extra
      // 0.1665: (0.5 + 0.1665) / 2 = 0.33325, where the floor drew 0.25.
      const builder = new BlissSVGBuilder('[sdot-extra-width=-0.5]||SDOT');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('SDOT').svgCode);
      expect(builder.svgCode).toContain('stroke-width="0.33325"');
      expect(builder.warnings.map(warning => warning.code)).toEqual(['OUT_OF_RANGE_OPTION_VALUE']);
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

    it('honours an oversized dot-width instead of capping it at 1.5', () => {
      // no cap any more: dot-width=5 → 5 / 2 = 2.5, where it used to draw 0.75
      const builder = new BlissSVGBuilder('[dot-width=5]||DOT');
      expect(builder.svgCode).toContain('stroke-width="2.5"');
      expect(builder.warnings).toEqual([]);
    });

    it('honours an oversized sdot-width instead of capping it at 1.5', () => {
      // the shared cap is gone for both families: 5 / 2 = 2.5
      const builder = new BlissSVGBuilder('[sdot-width=5]||SDOT');
      expect(builder.svgCode).toContain('stroke-width="2.5"');
      expect(builder.warnings).toEqual([]);
    });

    it('refuses a negative dot-width and sizes the dot as if it were unwritten', () => {
      // Refused rather than floored to 0, so DOT keeps its own default extra
      // 0.333: (0.5 + 0.333) / 2 = 0.4165, where the floor drew an invisible 0.
      const builder = new BlissSVGBuilder('[dot-width=-1]||DOT');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('DOT').svgCode);
      expect(builder.svgCode).toContain('stroke-width="0.4165"');
      expect(builder.warnings.map(warning => warning.code)).toEqual(['OUT_OF_RANGE_OPTION_VALUE']);
    });
  });

  describe('when an indicator carries a dot', () => {
    // Indicator dots retarget DOT -> SDOT: SDOT ink (0.5 + 0.1665) / 2 = 0.33325
    // replaces the old DOT ink 0.4165. B84/B85/B912 reach their dot through the
    // shared PERIOD glyph B270 (DOT:0,12), relocated inline; only the indicator
    // definitions retarget, never B270 itself (it stays the full-size period).
    it('renders the directly-composed B83 dot at SDOT size', () => {
      const svg = new BlissSVGBuilder('B291;B83').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
    });

    it('renders the directly-composed B907 dot at SDOT size', () => {
      const svg = new BlissSVGBuilder('B291;B907').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
    });

    // B84/B85/B912 reach their dot via the shared PERIOD glyph B270 (DOT:0,12),
    // inlined as SDOT at the compensated coords (-8 + 12 = 4). Each also pins the
    // dot's rendered center (M = center - radius) so a miscalculated compensation
    // is caught here, not only in the e2e baseline.
    it('renders the B270-relocated B84 dot at SDOT size and original center', () => {
      const svg = new BlissSVGBuilder('B291;B84').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
      expect(svg).toContain('M5.833375,4a'); // dot centered at (6, 4)
    });

    it('renders the B270-relocated B85 dot at SDOT size and original center', () => {
      const svg = new BlissSVGBuilder('B291;B85').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
      expect(svg).toContain('M1.833375,4a'); // dot centered at (2, 4)
    });

    it('renders the B270-relocated B912 dot at SDOT size, shifted by its anchorOffsetX', () => {
      const svg = new BlissSVGBuilder('B291;B912').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
      // B912 carries anchorOffsetX:-0.5 (2026-06-24, matching B84); the dot sits at
      // center 5.25 (was 4.75 before the offset). Negative offset shifts it right.
      expect(svg).toContain('M5.083375,4a'); // dot centered at (5.25, 4)
    });

    it('shrinks the inherited B83 dot inside the composite B88', () => {
      const svg = new BlissSVGBuilder('B291;B88').svgCode;
      expect(svg).toContain('stroke-width="0.33325"');
      expect(svg).not.toContain('stroke-width="0.4165"');
    });

    it('leaves the shared PERIOD glyph (B270) at full DOT size', () => {
      const svg = new BlissSVGBuilder('B270').svgCode;
      expect(svg).toContain('stroke-width="0.4165"');
      expect(svg).not.toContain('stroke-width="0.33325"');
    });
  });
});
