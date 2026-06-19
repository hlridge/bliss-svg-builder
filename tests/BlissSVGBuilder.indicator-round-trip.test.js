import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins indicator round-trips on base+indicator alias definitions across both
 * toString modes. R15 D-S1a makes a base+indicator combo a bare ALIAS (not a
 * glyph); applying a `;` indicator to it promotes into the reversible word-level
 * `;;` overlay (3b-1). An alias carries no local glyph identity, so under
 * { preserve: true } it decomposes and the promoted form serializes as the
 * primitive `BASE;SEMANTIC;;APPLIED`; under default toString the same holds.
 * Either way parse(toString(x)) renders identically to parse(x).
 *
 * Covers:
 * - Preserve-mode toString for the promotion delta forms (added -> ;;,
 *   strip-semantic added -> ;;!, bare strip-semantic -> semantic removed,
 *   empty/absent delta -> bare decomposed alias).
 * - Preserve-mode round-trip SVG parity for the promotion family.
 * - DSL vs applyIndicators: identical SVG (render parity) but divergent
 *   serialization pending Task 5 (the DSL promotes, the API char-path bakes).
 * - A promoted alias in a non-leading word position: first-wins drops the
 *   overlay with a DROPPED_WORD_INDICATOR warning.
 * - Negative control: a typeless multi-glyph alias decomposes under preserve.
 * - A built-in glyph modified via applyIndicators decomposes under preserve.
 * - Default-mode round-trip of the character-level delta family (`;`, `;!`,
 *   `;B81`, `;!B81`) on plain, semantic-rooted, and non-semantic-baked bases:
 *   SVG identity and toString stability.
 * - Default-mode word-level (`;;`) indicators across a multi-glyph word,
 *   including `^`+`;;`, kept as a reversible overlay across the round-trip.
 * - Word-level (`;;`) round-trip when the resolved head is an alias baking a
 *   semantic indicator: the semantic resolves exactly once, no doubling (N9).
 *
 * Does NOT cover:
 * - The render-neutral promotion mechanics in default toString, see
 *   `BlissSVGBuilder.indicator-promotion.test.js`.
 * - Programmatic applyIndicators char-path promotion parity (Task 5), gated in
 *   `BlissSVGBuilder.strip-semantic-parity.test.js`.
 * - The define-time guard rejecting base+indicator glyph definitions (D-S1a),
 *   see `BlissSVGBuilder.define.test.js`.
 * - General round-trip identity across all input kinds and the toJSON snapshot
 *   shape, see `BlissSVGBuilder.round-trip.test.js`.
 * - Which indicators attach and in what order (semantic preservation), see
 *   `tests/indicator-utils.semantic-goes-last.test.js`.
 * - Bare-name preserve of unmodified custom glyphs, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 */
describe('BlissSVGBuilder indicator round-trip', () => {
  const IRT_DEFS = {
    // Base+indicator alias baking B97 (the 'thing'/nominal semantic indicator).
    // R15 D-S1a: a base+indicator combo is an alias, not a glyph; applying a `;`
    // indicator to it promotes into the reversible `;;` overlay (3b-1).
    _IRT_NOUN: { codeString: 'B291;B97' },
    // Typeless multi-glyph alias: decomposes at parse, carries no glyph
    // identity. Negative control for preserve-mode name scoping.
    _IRT_WORD: { codeString: 'B313/B208' },
    // Default-mode family bases: a plain base-only glyph, plus base+indicator
    // aliases with a semantic (B97) and a non-semantic (B86 'description',
    // adjectival) baked indicator. The strip-semantic (`;!`) delta treats the
    // three differently (plain / semantic-rooted / non-semantic-baked).
    _IRT_PLAIN: { type: 'glyph', codeString: 'B291' },
    _IRT_NONSEM: { codeString: 'B291;B86' },
  };
  beforeAll(() => BlissSVGBuilder.define(IRT_DEFS));
  afterAll(() => Object.keys(IRT_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const roundTripPreserve = (input) => {
    const original = new BlissSVGBuilder(input);
    const str = original.toString({ preserve: true });
    const rebuilt = new BlissSVGBuilder(str);
    return { str, originalSvg: original.svgCode, rebuiltSvg: rebuilt.svgCode };
  };

  const roundTripDefault = (input) => {
    const original = new BlissSVGBuilder(input);
    const str = original.toString();
    const rebuilt = new BlissSVGBuilder(str);
    return {
      str,
      reStr: rebuilt.toString(),
      originalSvg: original.svgCode,
      rebuiltSvg: rebuilt.svgCode,
    };
  };

  describe('when an indicator is applied to a base+indicator alias via the ; DSL', () => {
    it('routes an added indicator into the reversible ;; overlay', () => {
      expect(roundTripPreserve('_IRT_NOUN;B81').str).toBe('B291;B97;;B81');
    });

    it('routes a strip-semantic added indicator into a ;;! overlay', () => {
      // note: ;! strips the baked semantic (B97); the ! survives in the overlay
      // so the re-parse re-strips rather than re-preserving the semantic.
      expect(roundTripPreserve('_IRT_NOUN;!B81').str).toBe('B291;B97;;!B81');
    });

    it('strips the semantic entirely for a bare strip-semantic', () => {
      expect(roundTripPreserve('_IRT_NOUN;!').str).toBe('B291');
    });

    it('decomposes the alias when the applied delta is empty or absent', () => {
      expect(roundTripPreserve('_IRT_NOUN').str).toBe('B291;B97');
      expect(roundTripPreserve('_IRT_NOUN;').str).toBe('B291;B97');
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

  describe('when the same indicator is applied through applyIndicators', () => {
    const applyOnNoun = (code) => {
      const b = new BlissSVGBuilder('_IRT_NOUN');
      b.group(0).glyph(0).applyIndicators(code);
      return b;
    };

    it('renders identically to the ; DSL', () => {
      expect(applyOnNoun('B81').svgCode).toBe(new BlissSVGBuilder('_IRT_NOUN;B81').svgCode);
    });

    it('serializes differently from the ; DSL pending Task 5 parity', () => {
      // T3b1-2 gate: the DSL promotes the applied indicator into the reversible
      // `;;` overlay, while the programmatic char-path still bakes it onto the
      // character. Render parity holds (asserted above); only serialization
      // diverges. Task 5 resolves this (make applyIndicators promote on a
      // base+indicator alias, or document the divergence) -- flip when it lands.
      const api = applyOnNoun('B81').toString({ preserve: true });
      const dsl = new BlissSVGBuilder('_IRT_NOUN;B81').toString({ preserve: true });
      expect(api).toBe('B291;B81;B97');
      expect(dsl).toBe('B291;B97;;B81');
      expect(api).not.toBe(dsl);
    });
  });

  describe('when an indicator is applied to an alias in a non-leading word position', () => {
    it('drops the promoted overlay with a warning (first-wins word slot)', () => {
      // The leading glyph (B313) owns the empty word-level slot, so the alias's
      // promoted overlay is dropped + warned (first-wins, mirrors mergeWithNext).
      const b = new BlissSVGBuilder('B313/_IRT_NOUN;B81');
      expect(b.toString({ preserve: true })).toBe('B313/B291;B97');
      expect(b.warnings.map((w) => w.code)).toContain('DROPPED_WORD_INDICATOR');
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

  describe('when round-tripping the character-level indicator delta family through default toString', () => {
    // Default toString decomposes every custom glyph to primitives, so a
    // per-instance character-level delta is fully encoded in the exported
    // string and re-parses identically, independent of whether the base bakes
    // a semantic root, a non-semantic indicator, or nothing. This is the
    // default-mode counterpart to the preserve-mode delta re-emission above.
    const FAMILY_BASES = ['_IRT_PLAIN', '_IRT_NOUN', '_IRT_NONSEM'];
    const FAMILY_DELTAS = [';', ';!', ';B81', ';!B81'];
    const familyInputs = FAMILY_BASES.flatMap(base => FAMILY_DELTAS.map(delta => base + delta));

    it.each(familyInputs)('renders identically after a default-mode round-trip for "%s"', (input) => {
      const { originalSvg, rebuiltSvg } = roundTripDefault(input);
      expect(rebuiltSvg).toBe(originalSvg);
    });

    it.each(familyInputs)('emits a toString-stable canonical form for "%s"', (input) => {
      const { str, reStr } = roundTripDefault(input);
      expect(reStr).toBe(str);
    });
  });

  describe('when round-tripping word-level (;;) indicators across a multi-glyph word through default toString', () => {
    // R14: `;;` is stored as a reversible overlay and KEPT in default output
    // (it is universal grammar, not a local name), so the word round-trips by
    // re-emitting `;;`. An explicit `^` that deviates from the fallback also
    // re-emits on export (pinned in `BlissSVGBuilder.head-marker-round-trip.test.js`).
    const wordCases = [
      'B313/B208;;B81',    // ;; routes to the fallback head (index 0)
      'B313/B208;;!B81',   // strip-semantic word-level (no semantic to strip)
      'B313/B208;;',       // bare word-level marker, kept and re-emitted as ;;
      'B486/B313;;B81',    // ;; routes past the B486 exclusion
      'B291/B291;;B86;B97', // multiple indicators in one overlay (separator pin)
      'B313^/B208;;B81',   // ^ marks the fallback head; ;; routes to it
      'B313/B208^;;B81',   // ^ marks a deviating head; export re-emits ^
    ];

    it.each(wordCases)('renders identically after a default-mode round-trip for "%s"', (input) => {
      const { originalSvg, rebuiltSvg } = roundTripDefault(input);
      expect(rebuiltSvg).toBe(originalSvg);
    });

    it.each(wordCases)('emits a toString-stable canonical form for "%s"', (input) => {
      const { str, reStr } = roundTripDefault(input);
      expect(reStr).toBe(str);
    });

    it('keeps `;;` in default output rather than decomposing it to `;`', () => {
      expect(new BlissSVGBuilder('B313/B208;;B81').toString()).toBe('B313/B208;;B81');
    });

    it('re-emits a multi-code overlay with `;`-separated codes', () => {
      // pins the codes.join(';') separator: a single-code overlay is blind to
      // the separator, so the multi-code case is what kills a join-char mutant.
      expect(new BlissSVGBuilder('B291/B291;;B86;B97').toString()).toBe('B291/B291;;B86;B97');
    });

    // N9: when the resolved head is an alias baking a semantic root
    // (_IRT_NOUN = B291;B97), the semantic once doubled on decompose
    // (B291;B97;B81;B97). The R14 overlay resolves it exactly once.
    it('round-trips a ;; indicator on an alias-baked head without doubling the semantic (N9)', () => {
      const { originalSvg, rebuiltSvg, str, reStr } = roundTripDefault('_IRT_NOUN;;B81');
      expect(rebuiltSvg).toBe(originalSvg);
      expect(reStr).toBe(str);
      expect(str.match(/B97/g) ?? []).toHaveLength(1);
    });
  });
});
