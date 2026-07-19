import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins composite common-offset displacement (XC-2, extended to n=1): a custom
 * glyph whose parts ALL share a baked min-x — including a SINGLE part, whose
 * own x IS the common min — keeps that offset as DISPLACEMENT of the composite
 * (the L3 re-origin aligns only the parts' relative layout), so the composite's
 * frame equals its ink span, the render agrees with the serializer's
 * already-correct decomposed output, and the svg round-trip closes.
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
 *   both.
 * - SINGLE-child composites under the same rule (the former "negative
 *   composite canvas width" defect): negative baked offsets, negative-total
 *   use-site coordinates on positive baked offsets, exact cancellation, and
 *   nesting — full svg identity with the absolute form (canvas and advance
 *   included), with and without an indicator, plus the svg round-trip.
 * - The composite part snapshot exposing the displacement, and an adjacent
 *   character advancing from the true ink width.
 *
 * Does NOT cover:
 * - Indicator centering math over displaced heads, see
 *   `BlissSVGBuilder.indicator-centering.test.js`.
 * - Element-tree child/composite offset split for displaced composites, see
 *   `BlissElement.composite-handling.test.js`.
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

  describe('when a single-child custom glyph bakes a negative offset', () => {
    // regression: the "negative composite canvas width" defect (Chunk 6
    // review F1 residue). The lone child's baked negative x made the
    // composite's frame a span SIZE wider than its ink, feeding a phantom
    // right gap into the canvas and advance. The child's x is the n=1 common
    // min and moves onto the composite like the multi-part cases above.
    it('renders the indicator form byte-identical to the absolute form, canvas included', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2;B81');
      const absolute = new BlissSVGBuilder('B291:-1,5;B81');

      // canvas truth: ink spans [-1,7], width 8 → viewBox 9.5 with margins
      expect(displaced.svgCode).toContain('viewBox="-0.75 -0.75 9.5 21.5"');
      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('renders the indicator-less form byte-identical to the absolute form', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2');
      const absolute = new BlissSVGBuilder('B291:-1,5');

      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('keeps a sibling character advance free of the phantom frame gap', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('B291/NEGSHIFT:1,2/C8');
      const absolute = new BlissSVGBuilder('B291/B291:-1,5/C8');

      expect(displaced.svgCode).toBe(absolute.svgCode);
    });

    it('accumulates nested negative offsets without widening the canvas', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      defineAndTrack({ NEGNEST: { type: 'glyph', codeString: 'NEGSHIFT:1,1' } });
      const displaced = new BlissSVGBuilder('NEGNEST:1,1;B81');
      const absolute = new BlissSVGBuilder('B291:0,5;B81');

      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('exposes the negative displacement on the composite part snapshot', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2;B81');
      const part = displaced.part(0, 0, 0);

      // use-site 1 + baked -2 rides the composite; the child re-origins to 0
      expect(part.offsetX).toBe(-1);
    });

    it('round-trips preserve mode for the single-child form', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:1,2');

      expect(displaced.toString({ preserve: true })).toBe('NEGSHIFT:1,2');
      const reparsed = new BlissSVGBuilder(displaced.toString({ preserve: true }));
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });
  });

  describe('when a use-site coordinate drives a single-child composite negative', () => {
    it('re-normalizes a negative-total position identically to the absolute form', () => {
      // positive baked +2, use-site -5: the frame min (use-site x) and the
      // ink min (use-site + baked) disagree, so only the moved-min rule
      // shifts this form the same way the decomposed form shifts
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:-5,0');
      const absolute = new BlissSVGBuilder('B291:-3,3');

      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });

    it('renders an exactly-cancelled offset identically to the absolute form', () => {
      defineAndTrack({ NEGSHIFT: { type: 'glyph', codeString: 'B291:-2,3' } });
      const displaced = new BlissSVGBuilder('NEGSHIFT:2,0');
      const absolute = new BlissSVGBuilder('B291:0,3');

      expect(displaced.svgCode).toBe(absolute.svgCode);
      const reparsed = new BlissSVGBuilder(displaced.toString());
      expect(reparsed.svgCode).toBe(displaced.svgCode);
    });
  });

  describe('when a single-child custom glyph bakes a positive offset', () => {
    it('keeps the displaced render and moves the offset onto the composite', () => {
      defineAndTrack({ SHIFTBOX: { type: 'glyph', codeString: 'B291:2,3' } });
      const displaced = new BlissSVGBuilder('SHIFTBOX:1,2;B81');
      const absolute = new BlissSVGBuilder('B291:3,5;B81');

      expect(displaced.svgCode).toBe(absolute.svgCode);
      // pins where the n=1 min lands: use-site 1 + baked 2 on the composite,
      // mirroring the multi-part snapshot pin above
      expect(displaced.part(0, 0, 0).offsetX).toBe(3);
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
