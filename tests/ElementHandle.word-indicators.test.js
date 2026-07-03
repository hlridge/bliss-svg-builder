import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins ElementHandle word-level indicator API on a group handle:
 * applyIndicators / clearIndicators operate on the reversible
 * `group.wordIndicators` overlay (the DSL `;;` channel), not on the head
 * glyph's baked parts. The base glyphs stay intact, so a later clear restores
 * them (including a semantic the overlay suppressed). A `flatten` flag bakes
 * the overlay onto the head as character-level parts instead (the pre-overlay,
 * character-level shape).
 *
 * Covers:
 * - apply default: stores the requested codes as an overlay, base parts
 *   untouched; replace-all over an existing overlay; { stripSemantic: true }
 *   stores the strip flag.
 * - apply of a non-indicator code: warns NON_INDICATOR_AS_WORD_INDICATOR and
 *   drops it (a mixed list keeps the valid indicators), mirroring the DSL `;;`
 *   non-indicator rule instead of silently storing an unrenderable overlay; an
 *   unrecognized code warns UNKNOWN_CODE and is dropped (DSL/API parity).
 * - apply { flatten: true }: bakes onto the head, no overlay; drops a
 *   pre-existing overlay before baking, but keeps it when the flattened code
 *   applies no indicator (N15).
 * - clear default: removes the overlay and restores the base, including a
 *   semantic the overlay's `!` strip had suppressed (N12). Clear is the pure
 *   undo (rc.4): the removed { stripSemantic } option is ignored — the
 *   empty-codes strip overlay is now spelled
 *   `applyIndicators('', { stripSemantic: true })`, see
 *   `ElementHandle.indicator-mutation-fidelity.test.js`.
 * - DSL/API parity: the overlay set by the API is byte-identical (toString,
 *   svgCode, toJSON) to the equivalent `;;` / `;;!` DSL marker, including the
 *   invalid-code case (no internal _parseWarnings leaking) and a clean JSON
 *   rebuild; and a multi-key option block (`[color=red;stroke-width=2]>B81`) is
 *   tokenized on top-level `;` only, matching the DSL.
 * - The glyph-level (character) applyIndicators path is unchanged.
 *
 * Does NOT cover:
 * - Character-level applyIndicators / clearIndicators on a glyph handle, see
 *   `ElementHandle.apply-indicators.test.js` and
 *   `ElementHandle.clear-indicators.test.js`.
 * - The flatten (head-baking) variant in depth, see
 *   `ElementHandle.head-indicators.test.js`; the removal of the former
 *   applyHeadIndicators / clearHeadIndicators aliases, see
 *   `ElementHandle.head-indicator-removal.test.js`.
 * - Parser grammar for `;;` and overlay render/serialize internals, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 * - The `flattenIndicators` serialization opt-out on toString/toJSON, see
 *   `BlissSVGBuilder.flatten-indicators.test.js`.
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

// Reads a glyph's base part codes by index (the head is glyph 0 in every word
// used here). Named for what it does, not "head", so a future crowned-word
// case can't pass spuriously against the wrong glyph.
const glyphParts = (builder, groupIdx = 0, glyphIdx = 0) => {
  const glyph = builder.toJSON().groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

describe('ElementHandle word indicators', () => {
  describe('when applying a word-level indicator to a group handle', () => {
    it('stores the requested code as a reversible overlay leaving the base intact', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86');
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(glyphParts(b)).toEqual(['B313']);
    });

    it('replaces an existing overlay (replace-all)', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B86');
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;B86');
    });

    it('stores multiple semicolon-separated codes in order', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B81;B86');
      expect(overlay(b)).toEqual({ codes: ['B81', 'B86'], stripSemantic: false });
    });

    it('records the strip flag with { stripSemantic: true }', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86', { stripSemantic: true });
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: true });
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      const result = b.group(0).applyIndicators('B86');
      expect(result.level).toBe(1);
    });
  });

  describe('when applying a non-indicator as a word-level overlay', () => {
    // A `;;` word-level indicator must BE an indicator. Applying a real base
    // (B291) as one warns and drops it rather than silently storing it in the
    // overlay (where it can never render), mirroring the DSL `;;` non-indicator
    // rule. (feedback_error_granularity: a bad decoration on valid content.)
    it('warns NON_INDICATOR_AS_WORD_INDICATOR and stores no overlay', () => {
      const b = new BlissSVGBuilder('B303');
      b.group(0).applyIndicators('B291');
      const w = b.warnings.filter((x) => x.code === 'NON_INDICATOR_AS_WORD_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B291');
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B303');
    });

    it('warns UNKNOWN_CODE and stores no overlay for an unrecognized code', () => {
      // parity with the DSL `;;ZZ9` path: an unrecognized ;; code warns
      // UNKNOWN_CODE (not NON_INDICATOR) and is dropped.
      const b = new BlissSVGBuilder('B303');
      b.group(0).applyIndicators('ZZ9');
      const w = b.warnings.filter((x) => x.code === 'UNKNOWN_CODE');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('ZZ9');
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B303');
    });

    it('drops only the offender in a mixed apply, keeping the valid indicator', () => {
      const b = new BlissSVGBuilder('B303');
      b.group(0).applyIndicators('B81;B291');
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      const w = b.warnings.filter((x) => x.code === 'NON_INDICATOR_AS_WORD_INDICATOR');
      expect(w[0]?.source).toBe('B291');
      expect(b.toString()).toBe('B303;;B81');
    });

    it('matches the DSL `;;` non-indicator handling in toString, svgCode, and toJSON', () => {
      // regression: chunk-2 external review F1. The invalid DSL and API forms
      // must be byte-identical composition data, incl. toJSON (no internal
      // _parseWarnings leaking on either side).
      const api = new BlissSVGBuilder('B303');
      api.group(0).applyIndicators('B291');
      const dsl = new BlissSVGBuilder('B303;;B291');
      expect(api.toString()).toBe(dsl.toString());
      expect(api.svgCode).toBe(dsl.svgCode);
      expect(JSON.stringify(api.toJSON())).toBe(JSON.stringify(dsl.toJSON()));
    });

    it('rebuilds the dropped-overlay JSON without re-warning', () => {
      // regression: chunk-2 external review F1. The offender is dropped, so the
      // normalized JSON is clean and reconstructing it emits no warning.
      const dsl = new BlissSVGBuilder('B303;;B291');
      const rebuilt = new BlissSVGBuilder(dsl.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.toString()).toBe('B303');
    });
  });

  describe('when applying with the flatten flag', () => {
    it('bakes the indicator onto the head as character-level parts with no overlay', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B313', 'B86']);
      expect(b.toString()).toBe('B313;B86/B1103');
    });

    it('renders identically to the character-level ;-baked DSL form', () => {
      // the flatten bake is byte-identical to writing the indicator as a
      // character-level `;` part on the head glyph (DSL/API parity).
      const flat = new BlissSVGBuilder('B313/B1103');
      flat.group(0).applyIndicators('B86', { flatten: true });
      const baked = new BlissSVGBuilder('B313;B86/B1103');
      expect(flat.toString()).toBe(baked.toString());
      expect(flat.svgCode).toBe(baked.svgCode);
    });

    it('drops a pre-existing overlay before baking the new indicator', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B313', 'B86']);
    });

    it('keeps a pre-existing overlay when the flattened code applies no indicator', () => {
      // N15 (R15 Task 5): a non-indicator code bakes nothing, so the overlay must
      // not be silently destroyed.
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('B303', { flatten: true });
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;B81');
    });

    it('preserves the head semantic on a default (non-strip) flatten apply', () => {
      // pins that the flatten apply forwards stripSemantic only when asked:
      // baking B86 over the baked semantic B97 keeps B97 (B86 is adjectival, so
      // the semantic goes last). kills an always-strip mutant on the delegated
      // flatten apply (R15 Task 5 review F2 fix).
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).applyIndicators('B86', { flatten: true });
      expect(b.toString()).toBe('B291;B86;B97');
    });
  });

  describe('when clearing word-level indicators from a group handle', () => {
    it('removes the overlay and restores a base semantic the strip had suppressed', () => {
      // regression: N12 — a ;;! strip must keep the base recoverable
      const b = new BlissSVGBuilder('B303;B97;;!B86');
      b.group(0).clearIndicators();
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B303', 'B97']);
      expect(b.toString()).toBe('B303;B97');
    });

    it('restores a multi-glyph word to its bare base', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).clearIndicators();
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B313/B1103');
    });

    it('ignores the removed stripSemantic option and just removes the overlay', () => {
      // rc.4 retarget: clearIndicators({stripSemantic:true}) used to INSTALL a
      // `;;!` strip overlay (the opposite state effect of a clear); that
      // spelling is now applyIndicators('', { stripSemantic: true }).
      const b = new BlissSVGBuilder('B303;B97;;B81');
      b.group(0).clearIndicators({ stripSemantic: true });
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B303', 'B97']);
      expect(b.toString()).toBe('B303;B97');
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      const result = b.group(0).clearIndicators();
      expect(result.level).toBe(1);
    });
  });

  describe('when comparing the overlay API to the DSL marker', () => {
    it('matches `;;B86` byte-for-byte across toString, svgCode, and toJSON', () => {
      const dsl = new BlissSVGBuilder('B313/B1103;;B86');
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('B86');
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });

    it('matches `;;!B86` byte-for-byte for a stripping overlay', () => {
      const dsl = new BlissSVGBuilder('B313/B1103;;!B86');
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('B86', { stripSemantic: true });
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });
  });

  describe('when applying an option-bearing word-level indicator', () => {
    // regression: chunk-2 external review F2. The API must tokenize a multi-key
    // option block the same way the DSL does -- splitting only on TOP-LEVEL `;`,
    // not the `;` inside `[color=red;stroke-width=2]`. A naive code.split(';')
    // shattered the option into unknown fragments and broke DSL/API parity.
    it('keeps a multi-key option intact, matching the DSL `;;` marker', () => {
      const code = '[color=red;stroke-width=2]>B81';
      const api = new BlissSVGBuilder('B303');
      api.group(0).applyIndicators(code);
      const dsl = new BlissSVGBuilder(`B303;;${code}`);
      expect(api.toString()).toBe(dsl.toString());
      expect(api.svgCode).toBe(dsl.svgCode);
      expect(JSON.stringify(api.toJSON())).toBe(JSON.stringify(dsl.toJSON()));
      expect(overlay(api)).toEqual({ codes: [code], stripSemantic: false });
    });

    it('warns once for a rejected multi-key-option non-indicator, naming the bare code', () => {
      // the bare code (B291) is the offender, not the option fragments; a naive
      // split emitted two UNKNOWN warnings for `[color=red` and `stroke-width=2]>B291`.
      const api = new BlissSVGBuilder('B303');
      api.group(0).applyIndicators('[color=red;stroke-width=2]>B291');
      const w = api.warnings.filter((x) => x.code === 'NON_INDICATOR_AS_WORD_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B291');
    });
  });

  describe('when the handle is a glyph', () => {
    it('leaves the character-level applyIndicators path baking onto parts', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('B86');
      expect(overlay(b)).toBeUndefined();
      expect(glyphParts(b)).toEqual(['B291', 'B86']);
    });
  });

  describe('when the word head is itself a lone indicator', () => {
    // R15 Task 5: the two surfaces now AGREE. The overlay (default) path treats
    // the first part as the base and APPENDS; the flatten path bakes onto the
    // head, which under the symmetric i>0 rule also treats the lone indicator as
    // the base and attaches. The old flatten no-op (the new code was dropped) is
    // gone.
    it('appends via the overlay path', () => {
      const b = new BlissSVGBuilder('B81');
      b.group(0).applyIndicators('B86');
      expect(b.toString()).toBe('B81;;B86');
    });

    it('bakes onto the lone-indicator head via the flatten path', () => {
      const flat = new BlissSVGBuilder('B81');
      flat.group(0).applyIndicators('B86', { flatten: true });
      const baked = new BlissSVGBuilder('B81;B86');
      expect(flat.toString()).toBe('B81;B86');
      expect(flat.svgCode).toBe(baked.svgCode);
    });
  });
});
