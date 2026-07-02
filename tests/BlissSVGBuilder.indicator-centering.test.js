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
 * - Multi-part (re-origined) composite head: centering unchanged.
 * - Non-displaced head: centering unchanged.
 *
 * Does NOT cover:
 * - Multi-indicator stacking math, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 * - Element-tree offsetX/offsetY positioning contract, see
 *   `BlissElement.indicator-positioning.test.js`.
 * - The multi-part displaced composite BASE round-trip (the L3 re-origin
 *   eats a common baked min-x that the serializer adds back) — a distinct
 *   composite-normalization quirk, backlog "multi-part composite common
 *   offset" row; only indicator centering is pinned here.
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

  describe('when the composite head is multi-part (re-origined)', () => {
    it('keeps the indicator centered over the rendered ink span', () => {
      // a multi-child composite re-origins its children (leading offset 0), so
      // centering must read the leftmost child's ink edge, not the rightmost
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const builder = new BlissSVGBuilder('SHIFTPAIR:1,2');
      builder.group(0).applyIndicators('[color=red]>B81');

      // rendered base ink spans [1,17] (center 9); indicator starts at 8.
      // The BASE's own round-trip quirk (re-origin vs serializer add) is out
      // of scope here — see the file header.
      expect(builder.svgCode).toContain('<g stroke="red"><path d="M8,6l1,-2M9,4l1,2"/></g>');
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
