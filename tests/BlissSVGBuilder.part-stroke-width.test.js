import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a part-level stroke-width renders (reaches the part <g>, the
 * child path inherits it) and round-trips on every path that can carry
 * one — the SW-1 regression net. SW-1 ("part stroke-width never reaches
 * svgCode") was found already resolved on HEAD by the 2026-07-01 options
 * audit (fixed as a side effect of the ;;-overlay option fix, 0f11d11);
 * this file locks it against regression.
 *
 * Every pin uses the below-clamp value 1.2: stroke-width clamps to max
 * 1.5 at EVERY level, so a value >= 1.5 could pass even on a broken
 * per-part path by inheriting another level's clamped value.
 *
 * Covers:
 * - Render + toString + svg round-trip stability for a standalone part
 *   (`[stroke-width=1.2]>B291`), a ;-composed part (`H;[..]>B81`), the
 *   ;; word-indicator overlay (`H;;[..]>B81`), and the API overlay
 *   (`group().applyIndicators('[..]>B81')`), incl. API/DSL byte-parity.
 * - The global `[stroke-width=1.2]||` path unchanged (content group).
 * - Dot glyphs: the dot ink tracks a part-level stroke-width linearly
 *   via the dot-sizing formula ((stroke-width + extra) / 2 on an inner
 *   <g>), not as a literal stroke-width on the dot path.
 * - External-font X-codes render filled (stroke="none"), so stroke-width
 *   never touches their ink — symmetrically at all four levels (a
 *   filled-shape property, not a per-part defect).
 *
 * Does NOT cover:
 * - The 4-level cascade/override matrix, see
 *   `BlissSVGBuilder.hierarchical-options.test.js`.
 * - The DOT/COMMA formula constants and clamping, see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - The per-family dot sizing knobs (dot-width/dot-extra-width/...), see
 *   `BlissSVGBuilder.dot-sizing.test.js`.
 */

// Re-parses a builder's own toString and returns the re-rendered svg;
// equality with the original svgCode is the round-trip stability pin.
const roundTripSvg = (builder) => new BlissSVGBuilder(builder.toString()).svgCode;

// Extracts the filled external-glyph path (stroke="none" + path data).
const filledPath = (svg) => svg.match(/<path stroke="none"[^>]*d="[^"]*"/)[0];

describe('BlissSVGBuilder part-level stroke-width', () => {
  describe('when stroke-width is set on a standalone part', () => {
    it('renders the value on the part <g> and round-trips', () => {
      const b = new BlissSVGBuilder('[stroke-width=1.2]>B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('<g stroke-width="1.2">');
      expect(b.toString()).toBe('[stroke-width=1.2]>B291');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });
  });

  describe('when stroke-width is set on a ;-composed part', () => {
    it('renders the value on the indicator part alone and round-trips', () => {
      const b = new BlissSVGBuilder('H;[stroke-width=1.2]>B81');
      expect(b.warnings).toEqual([]);
      // Full-snippet pin: the wrapper holds exactly the B81 path, the H base
      // path stays a bare sibling — an option leaking to character level
      // (wrapping both paths) would pass a bare toContain('<g stroke-width').
      expect(b.svgCode).toContain('<g stroke-width="1.2"><path d="M3,6l1,-2M4,4l1,2"/></g>');
      expect(b.toString()).toBe('H;[stroke-width=1.2]>B81');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });
  });

  describe('when stroke-width is set via the ;; word-indicator overlay', () => {
    it('renders the value on the overlay part alone and round-trips', () => {
      const b = new BlissSVGBuilder('H;;[stroke-width=1.2]>B81');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('<g stroke-width="1.2"><path d="M3,6l1,-2M4,4l1,2"/></g>');
      expect(b.toString()).toBe('H;;[stroke-width=1.2]>B81');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });

    it('renders byte-identically through group().applyIndicators()', () => {
      const api = new BlissSVGBuilder('H');
      api.group(0).applyIndicators('[stroke-width=1.2]>B81');
      const dsl = new BlissSVGBuilder('H;;[stroke-width=1.2]>B81');
      expect(api.warnings).toEqual([]);
      expect(api.toString()).toBe('H;;[stroke-width=1.2]>B81');
      expect(api.svgCode).toBe(dsl.svgCode);
      expect(roundTripSvg(api)).toBe(api.svgCode);
    });
  });

  describe('when stroke-width is set globally', () => {
    it('renders the value on the content group and round-trips', () => {
      const b = new BlissSVGBuilder('[stroke-width=1.2]||H');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toMatch(/<g class="bliss-content"[^>]*stroke-width="1\.2"/);
      expect(b.toString()).toBe('[stroke-width=1.2]||H');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });
  });

  describe('when the part is a dot glyph', () => {
    // A dot expresses stroke-width through the dot-sizing formula on an
    // inner <g> (ink = (stroke-width + extra) / 2), which overrides the
    // literal part wrapper for the dot path — the widened ink, not the
    // raw 1.2, is the proof the part value arrived.
    it('widens the DOT ink via the dot-sizing formula', () => {
      const b = new BlissSVGBuilder('[stroke-width=1.2]>DOT');
      // (1.2 + DOT default extra 0.333) / 2 = 0.7665
      expect(b.svgCode).toContain('<g stroke-width="1.2"><g stroke-width="0.7665">');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });

    it('widens an SDOT-based indicator dot via the dot-sizing formula', () => {
      const b = new BlissSVGBuilder('H;[stroke-width=1.2]>B83');
      // (1.2 + SDOT default extra 0.1665) / 2 = 0.68325
      expect(b.svgCode).toContain('stroke-width="0.68325"');
      expect(roundTripSvg(b)).toBe(b.svgCode);
    });
  });

  describe('when the code is an external-font X-code', () => {
    it('leaves the filled glyph path identical at part, character, word, and global levels', () => {
      const plain = filledPath(new BlissSVGBuilder('Xh').svgCode);
      expect(plain).toContain('stroke="none"');
      expect(filledPath(new BlissSVGBuilder('[stroke-width=1.2]>Xh').svgCode)).toBe(plain);
      expect(filledPath(new BlissSVGBuilder('[stroke-width=1.2]Xh').svgCode)).toBe(plain);
      expect(filledPath(new BlissSVGBuilder('[stroke-width=1.2]|Xh').svgCode)).toBe(plain);
      expect(filledPath(new BlissSVGBuilder('[stroke-width=1.2]||Xh').svgCode)).toBe(plain);
    });
  });
});
