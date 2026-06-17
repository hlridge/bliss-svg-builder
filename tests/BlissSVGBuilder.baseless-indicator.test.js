import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the public DSL contract for a baseless indicator stack written with a
 * leading ';' (an empty base): the leading ';' is inert (yields an
 * indicator-only glyph), it emits no UNKNOWN_CODE warning, and it renders
 * identically to the same indicators written without the leading ';'.
 *
 * Covers:
 * - `;B86` emits no UNKNOWN_CODE warning (the leading empty segment is dropped,
 *   not parsed as a failed part).
 * - `;B86` renders byte-identically to `B86` (leading ';' is inert).
 * - `;B86;B97` emits no UNKNOWN_CODE warning and renders byte-identically to
 *   `B86;B97` (the baseless stack lays out from origin either way).
 *
 * Does NOT cover:
 * - The from-origin x layout math of a baseless stack (B97;B99 → B99 at x=3),
 *   see `BlissElement.indicator-positioning.test.js`
 *   (describe 'when the base is empty (a baseless indicator stack)').
 * - The part-level UNKNOWN_CODE warning mechanism itself, see
 *   `BlissElement.warning-behavior.test.js`.
 * - Word-level (`;;`) overlays, see `BlissParser.double-semicolon.test.js`.
 */
describe('BlissSVGBuilder baseless indicator', () => {
  const unknownCodeWarnings = (input) =>
    new BlissSVGBuilder(input).warnings.filter(w => w.code === 'UNKNOWN_CODE');

  describe('when a single indicator is written with a leading semicolon', () => {
    it('emits no UNKNOWN_CODE warning for ;B86', () => {
      expect(unknownCodeWarnings(';B86')).toEqual([]);
    });

    it('renders ;B86 identically to B86 (the leading semicolon is inert)', () => {
      expect(new BlissSVGBuilder(';B86').svgCode)
        .toBe(new BlissSVGBuilder('B86').svgCode);
    });
  });

  describe('when an indicator stack is written with a leading semicolon', () => {
    it('emits no UNKNOWN_CODE warning for ;B86;B97', () => {
      expect(unknownCodeWarnings(';B86;B97')).toEqual([]);
    });

    it('renders ;B86;B97 identically to B86;B97 (baseless stack from origin)', () => {
      expect(new BlissSVGBuilder(';B86;B97').svgCode)
        .toBe(new BlissSVGBuilder('B86;B97').svgCode);
    });
  });
});
