import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins { preserve: true } indicator-delta re-emission on custom glyphs: a
 * custom glyph whose indicators are modified per-instance (via the `;` DSL or
 * applyIndicators) re-emits the delta against the definition's baked indicator
 * state (`_X;B81`, `_X;!B81`, `_X;!`, bare `_X` when unchanged) instead of
 * collapsing to the bare name, so parse(toString(x, { preserve: true }))
 * renders identically to parse(x). The DSL and applyIndicators paths emit
 * the same string and the same SVG for the same operation.
 *
 * Covers:
 * - Preserve-mode exact toString for the four canonical delta forms (added,
 *   strip-semantic-plus-added, strip-semantic-only, unchanged/bare).
 * - Preserve-mode round-trip SVG parity for the delta family.
 * - DSL vs applyIndicators parity: identical preserve string, retained
 *   custom-glyph identity, identical SVG.
 * - A delta-bearing custom glyph embedded in a multi-glyph word.
 * - Negative control: a typeless multi-glyph alias still decomposes under
 *   preserve (no glyph identity to retain).
 *
 * Does NOT cover:
 * - Default (non-preserve) toString, which always decomposes
 *   character-by-character; default-mode indicator round-trips live in
 *   `BlissSVGBuilder.round-trip.test.js` ("when round-tripping characters
 *   with indicators").
 * - Which indicators attach and in what order (semantic preservation), see
 *   `tests/indicator-utils.semantic-goes-last.test.js` and
 *   `tests/ElementHandle.apply-indicators.test.js`.
 * - Bare-name preserve of unmodified custom glyphs, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 */
describe('BlissSVGBuilder indicator round-trip', () => {
  const IRT_DEFS = {
    // Custom glyph that bakes B97 (the 'thing'/nominal semantic indicator)
    // into its definition, so per-instance `;` deltas have a baked state to
    // differ from.
    _IRT_NOUN: { type: 'glyph', codeString: 'B291;B97' },
    // Typeless multi-glyph alias: decomposes at parse, carries no glyph
    // identity. Negative control for the preserve fix.
    _IRT_WORD: { codeString: 'B313/B208' },
  };
  beforeAll(() => BlissSVGBuilder.define(IRT_DEFS));
  afterAll(() => Object.keys(IRT_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const roundTripPreserve = (input) => {
    const original = new BlissSVGBuilder(input);
    const str = original.toString({ preserve: true });
    const rebuilt = new BlissSVGBuilder(str);
    return { str, originalSvg: original.svgCode, rebuiltSvg: rebuilt.svgCode };
  };

  describe('when a custom glyph carries per-instance indicator deltas via the ; DSL', () => {
    it('re-emits an added indicator against the baked semantic', () => {
      expect(roundTripPreserve('_IRT_NOUN;B81').str).toBe('_IRT_NOUN;B81');
    });

    it('re-emits strip-semantic with a replacement indicator', () => {
      // note: ;! strips the baked semantic (B97); the ! survives in the delta
      // so the re-parse re-strips rather than re-preserving the semantic.
      expect(roundTripPreserve('_IRT_NOUN;!B81').str).toBe('_IRT_NOUN;!B81');
    });

    it('re-emits a bare strip-semantic', () => {
      expect(roundTripPreserve('_IRT_NOUN;!').str).toBe('_IRT_NOUN;!');
    });

    it('emits the bare name when indicators match the baked state', () => {
      expect(roundTripPreserve('_IRT_NOUN').str).toBe('_IRT_NOUN');
      expect(roundTripPreserve('_IRT_NOUN;').str).toBe('_IRT_NOUN');
    });

    it.each([
      '_IRT_NOUN',
      '_IRT_NOUN;B81',
      '_IRT_NOUN;!B81',
      '_IRT_NOUN;!',
    ])('renders identically after a preserve round-trip for "%s"', (input) => {
      const { originalSvg, rebuiltSvg } = roundTripPreserve(input);
      expect(rebuiltSvg).toBe(originalSvg);
    });
  });

  describe('when the indicator delta is applied through applyIndicators', () => {
    const applyOnNoun = (code) => {
      const b = new BlissSVGBuilder('_IRT_NOUN');
      b.group(0).glyph(0).applyIndicators(code);
      return b;
    };

    it('emits the same preserve string as the ; DSL', () => {
      const api = applyOnNoun('B81').toString({ preserve: true });
      const dsl = new BlissSVGBuilder('_IRT_NOUN;B81').toString({ preserve: true });
      expect(api).toBe(dsl);
      expect(api).toBe('_IRT_NOUN;B81');
    });

    it('keeps the custom-glyph identity after the change', () => {
      const glyph = applyOnNoun('B81').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(glyph.isBlissGlyph).toBe(true);
      expect(glyph.codeName).toBe('_IRT_NOUN');
    });

    it('renders identically to the ; DSL', () => {
      expect(applyOnNoun('B81').svgCode).toBe(new BlissSVGBuilder('_IRT_NOUN;B81').svgCode);
    });
  });

  describe('when a delta-bearing custom glyph sits inside a multi-glyph word', () => {
    it('re-emits the delta on the embedded custom glyph', () => {
      expect(roundTripPreserve('B313/_IRT_NOUN;B81').str).toBe('B313/_IRT_NOUN;B81');
    });

    it('renders the word identically after a preserve round-trip', () => {
      const { originalSvg, rebuiltSvg } = roundTripPreserve('B313/_IRT_NOUN;B81');
      expect(rebuiltSvg).toBe(originalSvg);
    });
  });

  describe('when the modified element is not a custom glyph (delta scoping)', () => {
    it('leaves a typeless multi-glyph alias decomposed under preserve', () => {
      // The alias has no glyph identity; the delta fix is scoped to custom
      // glyphs and must not start retaining word-level alias names.
      expect(roundTripPreserve('_IRT_WORD').str).toBe('B313/B208');
    });

    it('decomposes a built-in glyph modified via applyIndicators', () => {
      // Built-ins decompose under preserve; identity retention is scoped to
      // custom glyphs so a built-in's delta is not dropped to the bare code.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B81');
      expect(b.toString({ preserve: true })).toBe('B291;B81');
    });
  });
});
