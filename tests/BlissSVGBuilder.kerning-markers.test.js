import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the bare-vs-explicit kerning-marker contract: a bare RK/AK marker is
 * absent (applies no kerning, omitted from toString), while an explicit value
 * (including :0) is kept verbatim and re-emitted.
 *
 * Covers:
 * - Bare RK: renders identically to no marker and omits from toString (never
 *   materializes RK:0, a value the author never wrote).
 * - Bare AK: renders at the pair's DEFAULT gap (not AK:0's collapsed gap) and
 *   omits from toString.
 * - Explicit RK:0 / AK:0 kept verbatim (AK:0 is the deliberate zero-gap
 *   spelling; RK:0 is kept although it renders like no marker).
 * - Explicit AK:2 (== the default gap) kept verbatim, distinguishing an
 *   explicit value from an absent bare marker even when they render alike.
 * - Round-trip: bare-marker inputs are idempotent under toString and
 *   svg-stable across a reparse.
 *
 * Does NOT cover:
 * - Parser grammar for the markers (decimal forms, malformed fallthrough,
 *   bare-marker parse result), see `BlissParser.kerning.test.js`.
 * - Rendered inter-character positions from EXPLICIT kerning values, see
 *   `BlissSVGBuilder.spacing.test.js`.
 */
describe('BlissSVGBuilder kerning markers', () => {
  const svg = (dsl) => new BlissSVGBuilder(dsl).svgCode;
  const emitted = (dsl) => new BlissSVGBuilder(dsl).toString();

  describe('when a bare RK marker is applied', () => {
    it('omits the marker from toString rather than materializing RK:0', () => {
      expect(emitted('B291/RK/B291')).toBe('B291/B291');
    });

    it('renders identically to the same input without the marker', () => {
      expect(svg('B291/RK/B291')).toBe(svg('B291/B291'));
    });
  });

  describe('when a bare AK marker is applied', () => {
    it('omits the marker from toString rather than materializing AK:0', () => {
      expect(emitted('B291/AK/B291')).toBe('B291/B291');
    });

    it('renders at the default gap, not the collapsed gap of AK:0', () => {
      expect(svg('B291/AK/B291')).toBe(svg('B291/B291'));
      expect(svg('B291/AK/B291')).not.toBe(svg('B291/AK:0/B291'));
    });
  });

  describe('when an explicit kerning value is applied', () => {
    it('keeps AK:0 verbatim as the deliberate zero-gap spelling', () => {
      expect(emitted('B291/AK:0/B291')).toBe('B291/AK:0/B291');
      expect(svg('B291/AK:0/B291')).not.toBe(svg('B291/B291'));
    });

    it('keeps RK:0 verbatim even though it renders like no marker', () => {
      expect(emitted('B291/RK:0/B291')).toBe('B291/RK:0/B291');
      expect(svg('B291/RK:0/B291')).toBe(svg('B291/B291'));
    });

    it('keeps AK:2 verbatim though it renders at the default gap', () => {
      // distinguishes an explicit value from an absent bare marker even when
      // they render alike: AK:2 == the default gap == a bare (absent) AK
      expect(emitted('B291/AK:2/B291')).toBe('B291/AK:2/B291');
      expect(svg('B291/AK:2/B291')).toBe(svg('B291/B291'));
    });
  });

  describe('when a bare-marker input is round-tripped', () => {
    it.each(['B291/RK/B291', 'B291/AK/B291'])(
      'reparses %s to a byte-identical string and svg', (input) => {
        const b = new BlissSVGBuilder(input);
        const reparsed = new BlissSVGBuilder(b.toString());
        expect(reparsed.toString()).toBe(b.toString());
        expect(reparsed.svgCode).toBe(b.svgCode);
      });
  });
});
