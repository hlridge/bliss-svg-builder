import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins reversible-overlay promotion: applying a character-level indicator
 * (`;<ind>`) to a use-site code that resolves to a base+indicator *alias*
 * routes the applied indicator into the reversible word-level `;;` overlay
 * instead of the destructive char-level replace-all.
 *
 * The render is deliberately UNCHANGED: the word-level overlay hides the
 * alias's baked indicator (override-except-semantic), so the pixels equal the
 * old char-level result. The value is reversibility: the baked indicator is
 * retained on the character and reappears when the overlay is stripped,
 * whereas the old char-level apply destroyed it permanently.
 *
 * Covers:
 * - A grammatical base+indicator alias: the `;`-applied indicator routes to
 *   `;;`, the render stays identical to the char-level result, and clearing
 *   the overlay recovers the alias.
 * - A semantic base+indicator alias: the semantic baked indicator is kept and
 *   the applied indicator still routes to the overlay.
 * - A clean-base alias is NOT promoted (stays plain `;`, no overlay).
 * - A `!`-stripped applied indicator routes to a `;;!` overlay.
 * - Round-trip svg-identity for the promoted form.
 *
 * Does NOT cover:
 * - The define-time guard rejecting base+indicator glyph definitions (D-S1a,
 *   Task 3b-2), see `BlissSVGBuilder.define.test.js`.
 * - The buried-indicator warning for an alias used as a non-leading `;`-part
 *   (D-S1b, Task 3b-3).
 * - Programmatic `glyph().applyIndicators()` char-path parity (Task 5), see
 *   `ElementHandle.apply-indicators.test.js`.
 * - Rendered pixel output: promotion is render-neutral by design (no e2e).
 */
describe('BlissSVGBuilder indicator promotion', () => {
  const PROMO_DEFS = {
    NOUN_BI: { codeString: 'B291;B81' }, // base + grammatical (verbal) indicator
    NOUN_S: { codeString: 'B291;B97' },  // base + semantic ('thing') indicator
    NOUN_B: { codeString: 'B291' },      // clean base, no baked indicator
  };
  const svg = (dsl) => new BlissSVGBuilder(dsl).svgCode;

  beforeAll(() => BlissSVGBuilder.define(PROMO_DEFS));
  afterAll(() => Object.keys(PROMO_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  describe('when an indicator is applied to a grammatical base+indicator alias', () => {
    it('routes the applied indicator into a reversible ;; overlay', () => {
      expect(new BlissSVGBuilder('NOUN_BI;B97').toString()).toBe('B291;B81;;B97');
    });

    it('leaves the render unchanged from the char-level result', () => {
      // note: the word-level ;; overlay HIDES the baked B81 (override-except-
      // semantic), so the pixels equal B291;B97; promotion buys reversibility,
      // not a visual change.
      expect(svg('NOUN_BI;B97')).toBe(svg('B291;B97'));
    });

    it('recovers the baked indicator when the overlay is cleared', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97');
      b.group(0).clearIndicators();
      expect(b.toString()).toBe('B291;B81');
      expect(b.svgCode).toBe(svg('B291;B81'));
    });

    it('round-trips svg-identically', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97');
      expect(svg(b.toString())).toBe(b.svgCode);
    });
  });

  describe('when an indicator is applied to a semantic base+indicator alias', () => {
    it('routes the applied indicator into the overlay and keeps the semantic part', () => {
      expect(new BlissSVGBuilder('NOUN_S;B81').toString()).toBe('B291;B97;;B81');
    });

    it('leaves the render unchanged from the char-level result', () => {
      expect(svg('NOUN_S;B81')).toBe(svg('B291;B81;B97'));
    });

    it('recovers the semantic baked indicator when the overlay is cleared', () => {
      const b = new BlissSVGBuilder('NOUN_S;B81');
      b.group(0).clearIndicators();
      expect(b.toString()).toBe('B291;B97');
      expect(b.svgCode).toBe(svg('B291;B97'));
    });
  });

  describe('when an indicator is applied to a clean-base alias', () => {
    it('keeps the plain character-level ; and creates no overlay', () => {
      const b = new BlissSVGBuilder('NOUN_B;B97');
      expect(b.toString()).toBe('B291;B97');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });
  });

  describe('when the applied indicator strips the semantic root', () => {
    it('routes a !-prefixed indicator into a ;;! overlay', () => {
      const b = new BlissSVGBuilder('NOUN_S;!B81');
      expect(b.toString()).toBe('B291;B97;;!B81');
      expect(b.svgCode).toBe(svg('B291;B81'));
    });
  });
});
