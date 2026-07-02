import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins multi-part composite common-offset displacement (XC-2): a custom glyph
 * whose parts ALL share a baked min-x keeps that common offset as DISPLACEMENT
 * of the composite (the L3 re-origin aligns only the parts' relative layout),
 * matching SIB-3's single-part rule, so the render agrees with the serializer's
 * already-correct decomposed output and the svg round-trip closes.
 *
 * Covers:
 * - Render byte-parity with the decomposed absolute form for a positive
 *   common min, and the svg-identity round-trip of the default toString.
 * - toJSON object round-trip and preserve-mode round-trip.
 * - Explicit `:0,0` use-site (displacement must not be lost to a truthiness
 *   check on the use-site coordinate).
 * - Zero-min multi-part composites (the common case) staying byte-identical.
 * - Nested composites: each layer's common min accumulates exactly once.
 * - NEGATIVE common min, with and without an indicator: every nonzero common
 *   min becomes displacement (either sign); level 2's negatives-only
 *   normalization then acts on the final absolute position, so the
 *   indicator-less form re-normalizes identically to the decomposed form and
 *   the indicator form keeps the negative displacement — full svg identity in
 *   both (children re-origin to 0 inside the composite, so the single-child
 *   negative canvas-width residue does not arise here).
 * - The composite part snapshot exposing the displacement, and an adjacent
 *   character advancing from the true ink width.
 *
 * Does NOT cover:
 * - Indicator centering math over displaced heads, see
 *   `BlissSVGBuilder.indicator-centering.test.js`.
 * - Single-part displaced composites (SIB-3), see
 *   `BlissSVGBuilder.custom-glyphs.test.js` and
 *   `BlissElement.composite-handling.test.js`.
 * - The NEGATIVE-displaced SINGLE-child composite canvas width (frame-gap
 *   width residue) — backlog "negative composite canvas width" row.
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

describe('BlissSVGBuilder composite displacement', () => {
  describe('when a multi-part custom glyph bakes a common positive offset', () => {
    it('renders byte-identical to the decomposed absolute form', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2');
      const absolute = new BlissSVGBuilder('B291:3,5;C8:11,5');

      // parts land at (3,5)/(11,5): common min 2 + use-site 1, not use-site alone
      expect(displaced.svgCode).toContain('M3,13h8');
      expect(displaced.svgCode).toBe(absolute.svgCode);
    });

    it('keeps the default toString and closes the svg round-trip', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2');

      expect(displaced.toString()).toBe('B291:3,5;C8:11,5');
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('round-trips through a toJSON rebuild', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2');
      const rebuilt = new BlissSVGBuilder(displaced.toJSON());

      expect(rebuilt.svgCode).toBe(displaced.svgCode);
    });

    it('round-trips through preserve mode', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2');

      expect(displaced.toString({ preserve: true })).toBe('SHIFTPAIR:1,2');
      const reparsed = new BlissSVGBuilder(displaced.toString({ preserve: true }));
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('exposes the displacement on the composite part snapshot', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2');
      const part = displaced.part(0, 0, 0);

      // pins where the kept min lands: use-site 1 + common min 2 on the
      // composite's own offset, children re-origined to 0
      expect(part.offsetX).toBe(3);
      expect(part.x).toBe(3);
    });

    it('advances an adjacent character from the true ink width', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const displaced = new BlissSVGBuilder('SHIFTPAIR:1,2/B291');
      const absolute = new BlissSVGBuilder('B291:3,5;C8:11,5/B291');

      expect(displaced.svgCode).toBe(absolute.svgCode);
    });
  });

  describe('when the use-site coordinate is an explicit :0,0', () => {
    it('keeps the baked common offset as displacement', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      const zeroCoord = new BlissSVGBuilder('SHIFTPAIR:0,0');
      const absolute = new BlissSVGBuilder('B291:2,3;C8:10,3');

      expect(zeroCoord.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(zeroCoord.toString());
      expect(reparsed.svgCode).toBe(zeroCoord.svgCode);
    });
  });

  describe('when the parts share no common offset', () => {
    it('keeps the zero-min composite byte-identical', () => {
      defineAndTrack({ PAIRZERO: { type: 'glyph', codeString: 'B291;C8:8,0' } });
      const composite = new BlissSVGBuilder('PAIRZERO:1,2');
      const absolute = new BlissSVGBuilder('B291:1,2;C8:9,2');

      expect(composite.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(composite.toString());
      expect(reparsed.svgCode).toBe(composite.svgCode);
    });
  });

  describe('when displaced composites nest', () => {
    it('accumulates each common offset exactly once', () => {
      defineAndTrack({ SHIFTPAIR: { type: 'glyph', codeString: 'B291:2,3;C8:10,3' } });
      defineAndTrack({ NESTPAIR: { type: 'glyph', codeString: 'SHIFTPAIR:1,1;B291:16,1' } });
      const nested = new BlissSVGBuilder('NESTPAIR:1,2');

      // inner min 2 rides the inner composite (1+2=3), outer min 3 rides the
      // outer (1+3=4); double-accumulation would land the inner parts at 6+
      expect(nested.toString()).toBe('B291:4,6;C8:12,6;B291:17,3');
      const reparsed = new BlissSVGBuilder(nested.toString());
      expect(reparsed.svgCode).toBe(nested.svgCode);
    });
  });

  describe('when the common offset is negative', () => {
    it('re-normalizes the indicator-less form identically to the decomposed form', () => {
      defineAndTrack({ NEGPAIR: { type: 'glyph', codeString: 'B291:-2,3;C8:6,3' } });
      const displaced = new BlissSVGBuilder('NEGPAIR:1,2');
      const absolute = new BlissSVGBuilder('B291:-1,5;C8:7,5');

      // both forms carry final x=-1 into level 2, whose negatives-only
      // normalization shifts both to 0 — shared normalization is the parity
      expect(displaced.svgCode).toContain('M0,13h8');
      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('keeps the negative displacement when an indicator is present', () => {
      defineAndTrack({ NEGPAIR: { type: 'glyph', codeString: 'B291:-2,3;C8:6,3' } });
      const displaced = new BlissSVGBuilder('NEGPAIR:1,2;B81');
      const absolute = new BlissSVGBuilder('B291:-1,5;C8:7,5;B81');

      // level 2 skips normalization when indicators are positioned, so the
      // retained -1 is exactly what parity with the decomposed form requires;
      // full svg identity (canvas included) — the children re-origin to 0, so
      // no frame-gap width arises (unlike the single-child NEGSHIFT residue)
      expect(displaced.svgCode).toContain('M-1,13h8');
      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });
  });
});
