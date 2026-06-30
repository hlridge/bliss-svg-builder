import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that serializing a MODIFIED custom glyph re-emits every per-instance
 * detail (an applied indicator, a per-instance indicator coordinate, a
 * part-level option, a baked base offset) rather than silently collapsing to a
 * bare code or a lossy `name;codes` delta. Two distinct serializer surfaces:
 *
 * - Default mode: a base-only custom glyph whose identity collapsed to a single
 *   built-in (`{codeString:'B291'}` -> codeName `B291`) after `applyIndicators`
 *   must decompose its parts, not emit the bare built-in (the `if(!code)`
 *   fallback in `serializeGlyph`). [external Review #5, F-INFO-2]
 * - Preserve mode: the base-only `name;codes` delta in `serializeCustomGlyphDelta`
 *   maps `p.codeName` only and re-references the base at 0,0, so a baked base
 *   offset / indicator coord / part-option is dropped; it must fall back to
 *   decomposition when any part carries one. [external Review #5, F-D / F-A / F-B]
 *
 * Covers:
 * - Default `toString()` of a built-in-identity custom glyph + applied indicator
 *   re-emits the indicator (`B291;B81`) and round-trips, instead of dropping it.
 * - Preserve `toString()` of a base-only custom glyph round-trips when the parts
 *   carry a baked base offset, a per-instance indicator coordinate, or a
 *   part-level option (the value survives in the output).
 * - Preserve still keeps the LOCAL name for the bare case (R3b2-2 orthogonality
 *   is not regressed by the new decompose-on-coords/options fallback).
 *
 * Does NOT cover:
 * - Compound-indicator glyph preserve decomposition (D2), see
 *   `BlissSVGBuilder.indicator-round-trip.test.js`.
 * - The `flattenIndicators` x `preserve` orthogonality matrix, see
 *   `BlissSVGBuilder.flatten-indicators.test.js`.
 * - Bare-name preserve of UNMODIFIED custom glyphs, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 * - The char-level `;` MISPLACED contract, see
 *   `BlissParser.strict-indicator-separation.test.js`.
 */
describe('BlissSVGBuilder serializer fidelity', () => {
  const FIDELITY_DEFS = {
    // Base-only custom glyph, no offset: its default-mode identity collapses to
    // the bare built-in `B291` once an indicator is applied (the F-INFO-2 path).
    _FID_PLAIN: { type: 'glyph', codeString: 'B291' },
    // Base-only custom glyph whose definition bakes a base position offset: the
    // preserve `name;codes` delta cannot restore the 2,3 (the F-D path).
    _FID_OFFSET: { type: 'glyph', codeString: 'B291:2,3' },
  };
  beforeAll(() => BlissSVGBuilder.define(FIDELITY_DEFS));
  afterAll(() => Object.keys(FIDELITY_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const applied = (code, indicator) => {
    const b = new BlissSVGBuilder(code);
    b.group(0).glyph(0).applyIndicators(indicator);
    return b;
  };

  describe('when a built-in-identity custom glyph carries an applied indicator', () => {
    it('re-emits the applied indicator in default toString instead of the bare built-in code', () => {
      // regression: external Review #5 F-INFO-2 - default toString returned the
      // bare collapsed identity `B291`, dropping the applied B81.
      expect(applied('_FID_PLAIN', 'B81').toString()).toBe('B291;B81');
    });

    it('renders identically after a default-mode round-trip', () => {
      const b = applied('_FID_PLAIN', 'B81');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });

  describe('when a modified base-only custom glyph carries coordinates or options', () => {
    it('re-emits a baked base offset under preserve rather than re-referencing the base at 0,0', () => {
      // regression: external Review #5 F-D - `_FID_OFFSET;B81` lost the 2,3 base
      // offset (the name re-references its base opaquely at 0,0).
      const b = applied('_FID_OFFSET', 'B81');
      const str = b.toString({ preserve: true });
      expect(str).toContain(':2,3');
      expect(new BlissSVGBuilder(str).svgCode).toBe(b.svgCode);
    });

    it('re-emits a per-instance indicator coordinate under preserve', () => {
      // regression: external Review #5 F-A - the `:1,2` coord was dropped by the
      // `p.codeName`-only delta join.
      const b = applied('_FID_PLAIN', 'B81:1,2');
      const str = b.toString({ preserve: true });
      expect(str).toContain(':1,2');
      expect(new BlissSVGBuilder(str).svgCode).toBe(b.svgCode);
    });

    it('re-emits a per-instance part-level option on the indicator under preserve', () => {
      // regression: external Review #5 F-B - the `[color=red]` option was dropped
      // by the `p.codeName`-only delta join.
      const b = applied('_FID_PLAIN', '[color=red]>B81');
      const str = b.toString({ preserve: true });
      expect(str).toContain('color=red');
      expect(new BlissSVGBuilder(str).svgCode).toBe(b.svgCode);
    });

    it('keeps the local name under preserve when every modified part is bare', () => {
      // R3b2-2: the decompose-on-coords/options fallback must NOT fire for the
      // bare case; the local name is still kept.
      expect(applied('_FID_PLAIN', 'B81').toString({ preserve: true })).toBe('_FID_PLAIN;B81');
    });
  });
});
