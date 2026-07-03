import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the rc.4 indicator-mutation fidelity contract: every mutation is
 * state-effect-consistent. `applyIndicators` SETS the indicator state
 * (including the deliberate empty set — an empty/whitespace/missing code is
 * allowed, not an error), `clearIndicators` is the PURE UNDO at both levels
 * (no `stripSemantic` arm — that option lives on apply only), and an apply
 * whose requested codes are ALL invalid refuses (mutates nothing) instead of
 * clearing as a side effect.
 *
 * Covers:
 * - Group empty apply: stores the empty `;;` overlay (hides the head's
 *   character-level indicators, adds none); `{ stripSemantic: true }` stores
 *   the `;;!` strip overlay (the former `clearIndicators({ stripSemantic })`
 *   spelling); DSL/API/object parity byte-for-byte; idempotent re-apply.
 * - Glyph empty apply: same state effect as `clearIndicators()` (removes
 *   grammatical indicators, preserves the semantic unless stripSemantic);
 *   silent harmless no-op on a bare base (like a trailing `;` in the DSL),
 *   unlike clear which NOOP-warns.
 * - Glyph all-invalid apply: refuses — existing indicator stack untouched,
 *   per-code warnings only, no strip side effect even with stripSemantic;
 *   the flatten path inherits the refusal.
 * - Group clear: pure undo (removes the overlay, un-hiding the head's own
 *   character-level indicators); warns NOOP_INDICATOR_MUTATION when there is
 *   no overlay to remove; `stripSemantic` on clear is ignored at both levels.
 *
 * Does NOT cover:
 * - Valid-code apply semantics (replacement, semantic ordering), see
 *   `ElementHandle.apply-indicators.test.js` and
 *   `ElementHandle.word-indicators.test.js`.
 * - The full NOOP warning matrix (space target, invalid pattern), see
 *   `ElementHandle.indicator-noop-warning.test.js`.
 * - Per-code validation warning shapes, see
 *   `ElementHandle.character-indicator-validation.test.js`.
 * - Head-marker (`^`) serialization fidelity, see
 *   `BlissSVGBuilder.head-marker-round-trip.test.js`.
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

const partCodes = (builder, groupIdx = 0, glyphIdx = 0) => {
  const glyph = builder.toJSON().groups[groupIdx]?.glyphs?.[glyphIdx];
  return glyph?.parts?.map(p => p.codeName) ?? [];
};

const noopWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'NOOP_INDICATOR_MUTATION');

describe('ElementHandle indicator mutation fidelity', () => {
  describe('when applyIndicators is called empty on a group handle', () => {
    it('stores the deliberate empty overlay, leaving the base intact', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('');
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;');
      expect(b.warnings).toEqual([]);
    });

    it('accepts a missing code argument as the empty overlay', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators();
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: false });
    });

    it('trims a whitespace-only code argument to the empty overlay', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('   ');
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;');
    });

    it('replaces an existing codes overlay with the empty overlay (replace-all)', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).applyIndicators('');
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: false });
      expect(b.toString()).toBe('B313/B1103;;');
    });

    it('hides the head\'s character-level indicators at render, adding none', () => {
      // The empty overlay is render-significant: `;;` replaces the head's baked
      // grammatical indicator with nothing.
      const withOverlay = new BlissSVGBuilder('B313;B81/B1103');
      withOverlay.group(0).applyIndicators('');
      const bare = new BlissSVGBuilder('B313/B1103');
      expect(withOverlay.svgCode).toBe(bare.svgCode);
    });

    it('stores the ;;! strip overlay with { stripSemantic: true }', () => {
      // The former group clearIndicators({ stripSemantic: true }) spelling.
      const b = new BlissSVGBuilder('B303;B97');
      b.group(0).applyIndicators('', { stripSemantic: true });
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: true });
      expect(partCodes(b)).toEqual(['B303', 'B97']);
      expect(b.toString()).toBe('B303;B97;;!');
    });

    it('matches the DSL `;;` marker byte-for-byte', () => {
      const dsl = new BlissSVGBuilder('B313/B1103;;');
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('');
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });

    it('matches the DSL `;;!` marker byte-for-byte with { stripSemantic: true }', () => {
      const dsl = new BlissSVGBuilder('B303;B97;;!');
      const mut = new BlissSVGBuilder('B303;B97');
      mut.group(0).applyIndicators('', { stripSemantic: true });
      expect(mut.toString()).toBe(dsl.toString());
      expect(mut.svgCode).toBe(dsl.svgCode);
      expect(mut.toJSON()).toEqual(dsl.toJSON());
    });

    it('rebuilds the empty overlay from its own toJSON without warnings (object parity)', () => {
      const mut = new BlissSVGBuilder('B313/B1103');
      mut.group(0).applyIndicators('');
      const rebuilt = new BlissSVGBuilder(mut.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.toString()).toBe('B313/B1103;;');
    });

    it('is idempotent: re-applying the empty overlay keeps the same state silently', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).applyIndicators('').applyIndicators('');
      expect(overlay(b)).toEqual({ codes: [], stripSemantic: false });
      expect(b.warnings).toEqual([]);
    });

    it('treats a whitespace-only code as empty through the flatten path (overlay dropped)', () => {
      // pins the whitespace-trims-to-empty normalization: only the normalized
      // '' makes the flatten bake apply, so without it the overlay would
      // survive beside the cleared head (divergent state).
      const b = new BlissSVGBuilder('B291;B86;B97/B303;;B81');
      b.group(0).applyIndicators('   ', { flatten: true });
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });
  });

  describe('when applyIndicators is called empty on a glyph handle', () => {
    it('removes grammatical indicators like clearIndicators(), preserving the semantic', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).applyIndicators('');
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });

    it('strips the semantic too with { stripSemantic: true }', () => {
      // The former glyph clearIndicators({ stripSemantic: true }) spelling.
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).applyIndicators('', { stripSemantic: true });
      expect(partCodes(b)).toEqual(['B291']);
    });

    it('is a silent harmless no-op on a bare base', () => {
      // Empty apply is a declarative set ("indicators = none"), vacuously
      // satisfied on a bare base — like a trailing `;` in the DSL. Only the
      // undo verb (clearIndicators) NOOP-warns when there is nothing to undo.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).applyIndicators('');
      expect(partCodes(b)).toEqual(['B291']);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when every requested code is invalid on a glyph handle', () => {
    it('refuses the mutation, keeping the existing grammatical indicator', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('C8');
      expect(partCodes(b)).toEqual(['B291', 'B81']);
      const w = b.warnings.filter(x => x.code === 'NON_INDICATOR_AS_CHARACTER_INDICATOR');
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('C8');
    });

    it('refuses for an unknown code, keeping the existing grammatical indicator', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('ZZ9');
      expect(partCodes(b)).toEqual(['B291', 'B81']);
      const w = b.warnings.filter(x => x.code === 'UNKNOWN_CODE');
      expect(w).toHaveLength(1);
    });

    it('refuses without stripping even when stripSemantic is requested', () => {
      // F2 generalized: failed content must not strip the semantic as a side
      // effect. The deliberate strip spelling is applyIndicators('', { stripSemantic: true }).
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).applyIndicators('C8', { stripSemantic: true });
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });

    it('still applies the valid subset of a mixed list', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.group(0).glyph(0).applyIndicators('C8;B86');
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });

    it('refuses through the flatten path, keeping the baked head indicator and the overlay', () => {
      const b = new BlissSVGBuilder('B313;B81/B1103;;B86');
      b.group(0).applyIndicators('ZZ9', { flatten: true });
      expect(partCodes(b)).toEqual(['B313', 'B81']);
      expect(overlay(b)).toEqual({ codes: ['B86'], stripSemantic: false });
    });
  });

  describe('when clearIndicators is called on a group handle', () => {
    it('removes the overlay, un-hiding the head\'s own character-level indicators', () => {
      // Pure undo: while the overlay existed it replaced the head's baked B81
      // at render; removing it restores the original characters.
      const b = new BlissSVGBuilder('B313;B81/B1103;;B86');
      b.group(0).clearIndicators();
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B313;B81/B1103');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313;B81/B1103').svgCode);
      expect(noopWarnings(b)).toHaveLength(0);
    });

    it('warns NOOP_INDICATOR_MUTATION when there is no overlay to remove', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).clearIndicators();
      const w = noopWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe('B313');
      expect(w[0].message).toContain('clearIndicators()');
      expect(w[0].message).toContain(';;');
    });

    it('ignores the removed stripSemantic option instead of installing a strip overlay', () => {
      // Pre-rc.4 deviation: clearIndicators({ stripSemantic: true }) SET the
      // `;;!` overlay — the opposite state effect of a clear. The spelling
      // migrated to applyIndicators('', { stripSemantic: true }).
      const b = new BlissSVGBuilder('B303;B97');
      b.group(0).clearIndicators({ stripSemantic: true });
      expect(overlay(b)).toBeUndefined();
      expect(b.toString()).toBe('B303;B97');
      expect(noopWarnings(b)).toHaveLength(1);
    });
  });

  describe('when clearIndicators is called on a glyph handle with the removed stripSemantic option', () => {
    it('preserves the semantic root exactly like a plain clear', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.group(0).glyph(0).clearIndicators({ stripSemantic: true });
      expect(partCodes(b)).toEqual(['B291', 'B97']);
    });
  });

  describe('when applyIndicators is given a non-string code', () => {
    // external review F2: a number tokenized to zero codes and silently stored
    // the render-significant empty `;;` overlay; a type-violating argument is
    // an error, not the deliberate empty spelling.
    it('throws a TypeError on a group handle instead of storing the empty overlay', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      expect(() => b.group(0).applyIndicators(5)).toThrow(TypeError);
      expect(overlay(b)).toBeUndefined();
    });

    it('throws a TypeError on a glyph handle instead of clearing', () => {
      const b = new BlissSVGBuilder('B291;B86');
      expect(() => b.group(0).glyph(0).applyIndicators(5)).toThrow(TypeError);
      expect(partCodes(b)).toEqual(['B291', 'B86']);
    });
  });
});
