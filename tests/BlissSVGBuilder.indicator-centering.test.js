import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins indicator X-centering over a base's TRUE INK SPAN when the base is a
 * displaced composite: a custom glyph whose lone child keeps a baked offset
 * (SIB-3) reports a width that spans from its origin, and the leading gap
 * must not pull the indicator center left of the ink (XC-1).
 *
 * Covers:
 * - Word-level `;;` overlay on a displaced custom-glyph head: byte-parity
 *   with the absolute form and svg-identity round-trip.
 * - Character-level `;` indicator on a displaced custom glyph (same
 *   positioning path as the overlay).
 * - Nested displacement (a displaced glyph referencing a displaced glyph):
 *   leading ink offsets accumulate through nesting.
 * - NEGATIVE displacement: a baked negative offset overstates the reported
 *   width's right edge (span size, not edge coordinate), so the ink END is
 *   read symmetrically; covered plain and nested.
 * - Multi-part (re-origined) composite head: centering over the displaced
 *   ink span (the common baked min rides the composite since XC-2).
 * - Non-displaced head: centering unchanged.
 *
 * Does NOT cover:
 * - Canvas width/viewBox truthfulness for a NEGATIVE-displaced SINGLE-child
 *   composite (the reported width counts the frame gap, so the full svg still
 *   diverges from the absolute form) — separate width-semantics defect, see
 *   the backlog "negative composite canvas width" row; the pins here compare
 *   ink geometry.
 * - Multi-indicator stacking math, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - Element-tree offsetX/offsetY positioning contract, see
 *   `BlissElement.indicator-positioning.test.js`.
 * - The multi-part displaced composite BASE render/round-trip contract
 *   (XC-2 displacement), see
 *   `BlissSVGBuilder.composite-displacement.test.js`; only indicator
 *   centering is pinned here.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function defineAndTrack(definitions) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions);
}

// all path data of a build, in document order (ink geometry without the canvas)
const inkPathsOf = (builder) => (builder.svgCode.match(/ d="[^"]*"/g) || []).join(' ');

// concatenated path data (ink geometry tolerant of <path> split boundaries)
const inkOf = (builder) =>
  (builder.svgCode.match(/ d="[^"]*"/g) || []).map((s) => s.slice(4, -1)).join('');

describe('BlissSVGBuilder indicator centering', () => {
  describe('when a word-level overlay indicator sits on a displaced custom-glyph head', () => {
    it('renders the overlay byte-identical to the absolute form', () => {
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:1,2');
      displaced.group(0).applyIndicators('[color=red]>B81');
      const absolute = new BlissSVGBuilder('B291:3,5;;[color=red]>B81');

      // base ink spans [3,11] (center 7); the indicator (width 2) starts at 6,
      // not 5 (a center read from the composite frame [1,11] sits 1 left)
      expect(displaced.svgCode).toContain('<g stroke="red"><path d="M6,6l1,-2M7,4l1,2"/></g>');
      expect(displaced.svgCode).toBe(absolute.svgCode);
    });

    it('round-trips the overlay svg-identity-true', () => {
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:1,2');
      displaced.group(0).applyIndicators('[color=red]>B81');

      expect(displaced.toString()).toBe('B291:3,5;;[color=red]>B81');
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });
  });

  describe('when a character-level indicator sits on a displaced custom glyph', () => {
    it('renders the `;` form byte-identical to the absolute form', () => {
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:1,2;B81');
      const absolute = new BlissSVGBuilder('B291:3,5;B81');

      expect(displaced.svgCode).toContain('M6,6l1,-2M7,4l1,2');
      expect(displaced.svgCode).toBe(absolute.svgCode);
    });

    it('round-trips the `;` form svg-identity-true', () => {
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:1,2;B81');

      expect(displaced.toString()).toBe('B291:3,5;B81');
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });
  });

  describe('when displaced glyphs nest', () => {
    it('accumulates leading ink offsets through nested displacement', () => {
      // pins the recursive ink walk: reading only the outer composite's child
      // offset (1) without descending into SHIFTBOX's own baked 2 mis-centers
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      defineAndTrack({ SHIFTNEST: { type: 'glyph', codeString: 'SHIFTBOX:1,1' } });
      const displaced = new BlissSVGBuilder('SHIFTNEST:1,1;B81');
      const absolute = new BlissSVGBuilder('B291:4,5;B81');

      expect(displaced.svgCode).toBe(absolute.svgCode);
    });
  });

  describe('when the displaced custom glyph carries a negative baked offset', () => {
    // regression: external review F1 (2026-07-02). The reported width of a
    // negative-min composite is a span SIZE (max - min), not the right-edge
    // coordinate, so reading it as the ink end centered the indicator 1 right.
    //
    // These pins compare INK GEOMETRY (all path data), not the full svg: the
    // composite's reported width still counts its frame gap, so the CANVAS
    // (svg width/viewBox) diverges from the absolute form — a separate
    // pre-existing width-semantics defect, backlogged (out of XC-1's scope).
    it('centers the indicator identically to the absolute form', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2;B81');
      const absolute = new BlissSVGBuilder('B291:-1,5;B81');

      // base ink spans [-1,7] (center 3); the indicator (width 2) starts at 2
      expect(displaced.svgCode).toContain('M2,6l1,-2M3,4l1,2');
      expect(inkPathsOf(displaced)).toBe(inkPathsOf(absolute));
    });

    it('round-trips the `;` form ink-identity-true', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2;B81');

      expect(displaced.toString()).toBe('B291:-1,5;B81');
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(inkPathsOf(reparsed)).toBe(inkPathsOf(displaced));
    });

    it('accumulates a nested negative offset into the ink end', () => {
      // pins the recursive ink-end walk: reading the outer child's reported
      // width (span 8) instead of its true right edge (6) mis-centers
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      defineAndTrack({ NEGNEST: { type: 'glyph', codeString: 'NEGSHIFT:1,1' } });
      const displaced = new BlissSVGBuilder('NEGNEST:1,1;B81');
      const absolute = new BlissSVGBuilder('B291:0,5;B81');

      expect(inkPathsOf(displaced)).toBe(inkPathsOf(absolute));
    });
  });

  describe('when the composite head is multi-part (re-origined)', () => {
    it('keeps the indicator centered over the rendered ink span', () => {
      // a multi-child composite re-origins its children against their common
      // min, which rides the composite as displacement (XC-2) — centering
      // reads the composite's offset plus the leftmost child's ink edge
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const builder = new BlissSVGBuilder('SHIFTPAIR:1,2');
      builder.group(0).applyIndicators('[color=red]>B81');
      const absolute = new BlissSVGBuilder('B291:3,5;C8:11,5');
      absolute.group(0).applyIndicators('[color=red]>B81');

      // rendered base ink spans [3,19] (center 11); indicator starts at 10
      expect(builder.svgCode).toContain('<g stroke="red"><path d="M10,6l1,-2M11,4l1,2"/></g>');
      // ink parity, not full-svg parity: the composite joins its parts into
      // one <path> while the decomposed form emits one per part (pre-existing
      // DOM nesting; raster-identical here because the ink is opaque and these
      // parts never overlap — a semi-transparent stroke on OVERLAPPING parts
      // compounds differently per <path>, see the backlog "path grouping
      // varies" row); base render/round-trip parity is pinned in
      // `BlissSVGBuilder.composite-displacement.test.js`
      expect(inkOf(builder)).toBe(inkOf(absolute));
    });
  });

  describe('when the head is not displaced', () => {
    it('keeps the existing overlay centering byte-stable', () => {
      const plain = new BlissSVGBuilder('B291;;[color=red]>B81');

      expect(plain.svgCode).toContain('<g stroke="red"><path d="M3,6l1,-2M4,4l1,2"/></g>');
      const reparsed = new BlissSVGBuilder(plain.toString());
      expect(reparsed.svgCode).toBe(plain.svgCode);
    });
  });
});
