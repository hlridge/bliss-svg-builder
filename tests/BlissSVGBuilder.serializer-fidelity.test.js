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
 * - Default `toString()` of a multi-base custom glyph re-emits a part-level
 *   option before EACH decomposed part (`[opts]>B291;[opts]>C8`), reparse-stable;
 *   an outer option merges beneath a part's own options (inner keys win, the
 *   nearest-ancestor-wins order SVG attribute inheritance computes), colliding
 *   at the ATTRIBUTE level (`color` yields to/over `stroke`, not only to an
 *   identical key). [TF-3G]
 * - An invalid part (no codeName) decorated by `[opts]>` and/or a coordinate is
 *   dropped from `toString()` instead of emitting a literal `undefined`. [F3]
 * - A failed composite `;`-part (COMPOSITE_AS_PART) re-emits by its written name,
 *   not decomposed, so the warned string round-trips to the same failure instead
 *   of re-parsing to a different character. [row 80]
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
 * - The parser-side `[...]>` MISPLACED-gate bypass on aliases (F2), deferred to
 *   the option-placement gate; tripwire in
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - Byte-identical SVG round-trip of the one-wrapper form: per-part emission
 *   reparses to per-part wrappers (same computed styling for inheritable
 *   attributes). Accepted inherent limits of the per-part form: compositing
 *   attributes (`opacity`, `filter`) apply per part instead of once over the
 *   combined ink, and per-element semantics multiply (`id` duplicates, `href`
 *   anchors and `pointer-events` hit regions split per part). Old behavior
 *   dropped these options entirely; preserve mode round-trips the one-wrapper
 *   form losslessly. [external review 2026-07-02, accepted + documented]
 */
describe('BlissSVGBuilder serializer fidelity', () => {
  const FIDELITY_DEFS = {
    // Base-only custom glyph, no offset: its default-mode identity collapses to
    // the bare built-in `B291` once an indicator is applied (the F-INFO-2 path).
    _FID_PLAIN: { type: 'glyph', codeString: 'B291' },
    // Base-only custom glyph whose definition bakes a base position offset: the
    // preserve `name;codes` delta cannot restore the 2,3 (the F-D path).
    _FID_OFFSET: { type: 'glyph', codeString: 'B291:2,3' },
    // Multi-base `;`-composition: its default decomposition is multi-code, so a
    // part-level option is re-emitted before each decomposed part (TF-3G).
    _FID_TWOBASE: { type: 'glyph', codeString: 'B291;C8' },
    // Multi-base composition whose definition bakes a part option of its own:
    // an outer option must merge BENEATH it on decomposition (inner keys win).
    _FID_INNEROPT: { type: 'glyph', codeString: '[color=red]>B291;C8' },
    // Bare-alias composite (no type): a multi-part composition that is a legal
    // WORD/character on its own but NOT a legal `;`-part, so a non-leading use
    // fails COMPOSITE_AS_PART (a flagged glyph/shape would be exempt).
    _FID_COMPOSITE: { codeString: 'B291;B81' },
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

  describe('when a part-level option decorates a custom-glyph base', () => {
    it('re-emits the option on a bare custom-glyph base in default toString', () => {
      // regression: external review follow-up TF-3 (2026-07-01) - the
      // serializeParts recursive branch dropped part.options when decomposing a
      // custom glyph, so the option vanished from default output.
      const b = new BlissSVGBuilder('[color=blue]>_FID_PLAIN');
      const str = b.toString();
      expect(str).toContain('color=blue');
      expect(new BlissSVGBuilder(str).svgCode).toBe(b.svgCode);
    });

    it('re-emits the option when the decorated base also carries an applied indicator', () => {
      const b = new BlissSVGBuilder('[color=blue]>_FID_PLAIN');
      b.group(0).glyph(0).applyIndicators('B81');
      const str = b.toString();
      expect(str).toContain('color=blue');
      expect(new BlissSVGBuilder(str).svgCode).toBe(b.svgCode);
    });

  });

  describe('when a part-level option decorates a multi-base custom glyph', () => {
    it('re-emits the option before each decomposed part', () => {
      // TF-3G (directive A2, retargets the former drop-not-mis-wrap tripwire):
      // one `[opts]>` binds to one code, so a multi-code decomposition carries
      // the option per part instead of dropping it (or mis-wrapping only the
      // first code, `[color=blue]>B291;C8`, which renders differently).
      const b = new BlissSVGBuilder('[color=blue]>_FID_TWOBASE');
      expect(b.toString()).toBe('[color=blue]>B291;[color=blue]>C8');
    });

    it('serializes to a reparse-stable string', () => {
      const first = new BlissSVGBuilder('[color=blue]>_FID_TWOBASE').toString();
      const reparsed = new BlissSVGBuilder(first);
      expect(reparsed.toString()).toBe(first);
      expect(reparsed.warnings).toEqual([]);
    });

    it('applies the option to every decomposed part after a round-trip', () => {
      // The pre-round-trip SVG wraps the whole character in ONE optioned <g>;
      // the reparsed per-part form wraps EACH part. Computed styling is
      // identical for inheritable attributes, so the pin is per-part option
      // arrival, not byte-identical DOM.
      const b = new BlissSVGBuilder('[color=blue]>_FID_TWOBASE');
      const svg = new BlissSVGBuilder(b.toString()).svgCode;
      expect(svg).toContain('<g stroke="blue"><path d="M0,8h8M0,16h8M0,8v8M8,8v8"/></g>');
      expect(svg).toContain('<g stroke="blue"><path d="M0,4a4,4 0 1,1 8,0a4,4 0 1,1 -8,0"/></g>');
    });

    it('merges an outer option beneath a part\'s own option on decomposition', () => {
      // Inner keys win: the part's own [color=red] stays authoritative over the
      // outer option, matching what nested <g> attribute inheritance computed.
      const b = new BlissSVGBuilder('[stroke-width=1.2]>_FID_INNEROPT');
      const first = b.toString();
      expect(first).toBe('[stroke-width=1.2;color=red]>B291;[stroke-width=1.2]>C8');
      expect(new BlissSVGBuilder(first).toString()).toBe(first);
    });

    it('lets a part\'s own value win a same-key conflict with the outer option', () => {
      // pins the merge direction: outer-wins would repaint B291 blue on
      // round-trip (render computed red, the inner <g> being nearest the ink).
      const b = new BlissSVGBuilder('[color=blue]>_FID_INNEROPT');
      expect(b.toString()).toBe('[color=red]>B291;[color=blue]>C8');
    });

    it('yields an outer key to a part\'s own key aliasing the same attribute', () => {
      // regression: external review 2026-07-02 F1 - `color` aliases the stroke
      // attribute, so an outer [stroke=blue] merged NEXT TO a part's own
      // [color=red] let the renderer's explicit-beats-alias dedup flip the part
      // blue on round-trip; the collision resolves at the attribute level.
      const b = new BlissSVGBuilder('[stroke=blue]>_FID_INNEROPT');
      const first = b.toString();
      expect(first).toBe('[color=red]>B291;[stroke=blue]>C8');
      expect(new BlissSVGBuilder(first).svgCode)
        .toContain('<g stroke="red"><path d="M0,8h8M0,16h8M0,8v8M8,8v8"/></g>');
    });

    it('adds a use-site coordinate to a baked base offset beneath the option', () => {
      // pins the recursive call's offset forwarding (external review 2026-07-02
      // low finding: dropping the x,y arguments survived every other pin here).
      const b = new BlissSVGBuilder('[color=blue]>_FID_OFFSET:1,2');
      expect(b.toString()).toBe('[color=blue]>B291:3,5');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('keeps the custom name and single option wrap under preserve', () => {
      const b = new BlissSVGBuilder('[color=blue]>_FID_TWOBASE');
      expect(b.toString({ preserve: true })).toBe('[color=blue]>_FID_TWOBASE');
    });
  });

  describe('when an options-prefixed part has no serializable code', () => {
    it('drops the whole character rather than serializing a literal undefined', () => {
      // regression: F3 (Chunk 1 audit) - `_FID_PLAIN;[x=2]>!B81` serialized as
      // `B291;[x=2]>undefined:2,0` (the coord/option decoration turned the
      // codeName-less part into a truthy literal-`undefined` string). A malformed
      // part now fails the whole character (retention family, rows 31/80), so the
      // decorated error node never reaches the serializer.
      const b = new BlissSVGBuilder('_FID_PLAIN;[x=2]>!B81');
      expect(b.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(b.toString()).toBe('');
    });

    it('drops the whole character when only an option decorates the bad part', () => {
      const b = new BlissSVGBuilder('B291;[color=red]>!B81');
      expect(b.toString()).toBe('');
    });

    it('serializes to a fixpoint with no residual warning', () => {
      const first = new BlissSVGBuilder('_FID_PLAIN;[x=2]>!B81').toString();
      const reparsed = new BlissSVGBuilder(first);
      expect(reparsed.toString()).toBe(first);
      expect(reparsed.warnings).toEqual([]);
    });
  });

  describe('when a failed composite alias sits in a part slot', () => {
    it('re-emits the failed composite by its written name instead of decomposing it', () => {
      // regression (row 80): a COMPOSITE_AS_PART part keeps its expanded parts,
      // so default toString decomposed `_FID_COMPOSITE` to `B291;B81`, whose
      // reparse is a DIFFERENT character (the baked indicator no longer buried)
      const b = new BlissSVGBuilder('B303;_FID_COMPOSITE');
      expect(b.warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
      expect(b.toString()).toBe('B303;_FID_COMPOSITE');
    });

    it('round-trips the failed composite character svg-stably', () => {
      const b = new BlissSVGBuilder('B303;_FID_COMPOSITE');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('does not re-convict a preceding indicator after a round-trip', () => {
      // the expanded re-emission `B303;B86;B291;B81` re-convicted B86 under the
      // 1.2 misplaced-indicator rule; the faithful form reparses to the same
      // COMPOSITE_AS_PART instead of MISPLACED_INDICATOR_PART
      const b = new BlissSVGBuilder('B303;B86;_FID_COMPOSITE');
      expect(b.toString()).toBe('B303;B86;_FID_COMPOSITE');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.warnings.map((w) => w.code)).toContain('COMPOSITE_AS_PART');
      expect(reparsed.warnings.map((w) => w.code)).not.toContain('MISPLACED_INDICATOR_PART');
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('agrees with preserve mode, which already kept the name', () => {
      const b = new BlissSVGBuilder('B303;_FID_COMPOSITE');
      expect(b.toString()).toBe(b.toString({ preserve: true }));
    });
  });
});
