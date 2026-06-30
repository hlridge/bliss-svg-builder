import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins indicator round-trips across both toString modes under Strict Indicator
 * Separation. A base+indicator combo is a bare ALIAS (not a glyph); a char-level
 * `;` indicator on such an alias is MISPLACED (dropped, the alias renders as
 * defined), so it does NOT promote into a `;;` overlay. The smart API
 * (applyIndicators) still applies the indicator - a separate surface, not a `;`
 * parity partner (the DSL disallows `;` on a bare alias). Word-level `;;`
 * overlays are kept and re-emitted across the round-trip.
 *
 * Covers:
 * - Preserve-mode toString + round-trip for a base+indicator alias: a misplaced
 *   `;`/`;!` part drops, leaving the decomposed alias (`BASE;SEMANTIC`); a bare
 *   or trailing-`;` form decomposes the same. parse(toString(x)) renders == x.
 * - The smart API applies the indicator (B291;B81;B97) while the DSL `;`
 *   misplaces it (B291;B97): different surfaces, not a parity pair.
 * - A `;` on an alias in a non-leading word position is misplaced (warn + drop),
 *   not a dropped word-slot overlay.
 * - Negative control: a typeless multi-glyph alias decomposes under preserve.
 * - A built-in glyph modified via applyIndicators decomposes under preserve.
 * - Default-mode round-trip of the char-level delta family (`;`, `;B81`) on a
 *   plain glyph (dumb append) and on aliases (misplaced): SVG identity + toString
 *   stability. The invalid `;!`/`;!B81` delta on a glyph is a UNKNOWN_CODE
 *   toString fixpoint (the invalid part drops; its render does not round-trip).
 * - Default-mode word-level (`;;`) indicators across a multi-glyph word,
 *   including `^`+`;;`, kept as a reversible overlay across the round-trip.
 * - Word-level (`;;`) round-trip when the resolved head is an alias baking a
 *   semantic indicator: the semantic resolves exactly once, no doubling (N9).
 *
 * Does NOT cover:
 * - The char-level `;` MISPLACED contract in depth, see
 *   `BlissParser.strict-indicator-separation.test.js`.
 * - The promotion-removal regression suite, see
 *   `BlissSVGBuilder.indicator-promotion.test.js`.
 * - The define-time guard rejecting base+indicator glyph definitions (D-S1a),
 *   see `BlissSVGBuilder.define.test.js`.
 * - General round-trip identity across all input kinds and the toJSON snapshot
 *   shape, see `BlissSVGBuilder.round-trip.test.js`.
 * - Which indicators attach and in what order (semantic preservation), see
 *   `BlissSVGBuilder.semantic-preservation.test.js`.
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

  describe('when a ; indicator is applied to a base+indicator alias (misplaced)', () => {
    it('drops a misplaced added indicator, leaving the decomposed alias', () => {
      expect(roundTripPreserve('_IRT_NOUN;B81').str).toBe('B291;B97');
      expect(new BlissSVGBuilder('_IRT_NOUN;B81').warnings.map(w => w.code))
        .toContain('MISPLACED_CHARACTER_INDICATOR');
    });

    it('drops a misplaced strip-semantic added indicator the same way', () => {
      expect(roundTripPreserve('_IRT_NOUN;!B81').str).toBe('B291;B97');
      expect(new BlissSVGBuilder('_IRT_NOUN;!B81').warnings.map(w => w.code))
        .toContain('MISPLACED_CHARACTER_INDICATOR');
    });

    it('drops a misplaced lone strip-semantic, keeping the baked semantic', () => {
      // ;! on a bare alias is misplaced (dropped before content validation), so
      // the baked B97 is kept - there is no character-level strip.
      expect(roundTripPreserve('_IRT_NOUN;!').str).toBe('B291;B97');
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

  describe('when the same indicator is applied through applyIndicators (not a ; parity pair)', () => {
    const applyOnNoun = (code) => {
      const b = new BlissSVGBuilder('_IRT_NOUN');
      b.group(0).glyph(0).applyIndicators(code);
      return b;
    };

    it('applies the indicator via the API, unlike the misplaced DSL ;', () => {
      // The smart glyph API applies B81 (semantic-preserved: B291;B81;B97); the
      // DSL `;` on the bare alias is MISPLACED and renders bare (B291;B97). These
      // are different surfaces, NOT a parity pair: the DSL disallows `;` on a bare
      // alias (feedback_parity_scoped_to_valid_inputs), so neither serialization
      // nor render matches.
      const api = applyOnNoun('B81');
      const dsl = new BlissSVGBuilder('_IRT_NOUN;B81');
      expect(api.toString({ preserve: true })).toBe('B291;B81;B97');
      expect(dsl.toString({ preserve: true })).toBe('B291;B97');
      expect(api.svgCode).not.toBe(dsl.svgCode);
    });
  });

  describe('when a ; indicator is applied to an alias in a non-leading word position', () => {
    it('is misplaced (warn + drop), rendering the word bare', () => {
      // The `;B81` targets the second glyph (the _IRT_NOUN alias), a bare alias,
      // so it is misplaced (warn + drop) - not a dropped word-slot overlay.
      const b = new BlissSVGBuilder('B313/_IRT_NOUN;B81');
      expect(b.toString({ preserve: true })).toBe('B313/B291;B97');
      expect(b.warnings.map((w) => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.warnings.map((w) => w.code)).not.toContain('DROPPED_WORD_INDICATOR');
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
    // Default toString decomposes every custom glyph to primitives. A valid
    // char-level delta (a dumb append on a glyph, or a misplaced part on an
    // alias, which drops) round-trips in both SVG and toString. An INVALID
    // `;!`/`;!B81` delta on a plain glyph is the exception: it warns UNKNOWN_CODE
    // and the invalid part drops from toString (a stable fixpoint), so its render
    // does not round-trip - pinned separately below.
    const FAMILY_BASES = ['_IRT_PLAIN', '_IRT_NOUN', '_IRT_NONSEM'];
    const VALID_DELTAS = [';', ';B81'];
    const validInputs = FAMILY_BASES.flatMap(base => VALID_DELTAS.map(delta => base + delta));
    // `;!`/`;!B81` on an ALIAS is misplaced (drops, renders bare), so it still
    // round-trips; on the plain GLYPH it is an invalid append (handled below).
    const aliasStripInputs = ['_IRT_NOUN;!', '_IRT_NOUN;!B81', '_IRT_NONSEM;!', '_IRT_NONSEM;!B81'];
    const roundTrippingInputs = [...validInputs, ...aliasStripInputs];
    const glyphStripInputs = ['_IRT_PLAIN;!', '_IRT_PLAIN;!B81'];

    it.each(roundTrippingInputs)('renders identically after a default-mode round-trip for "%s"', (input) => {
      const { originalSvg, rebuiltSvg } = roundTripDefault(input);
      expect(rebuiltSvg).toBe(originalSvg);
    });

    it.each([...roundTrippingInputs, ...glyphStripInputs])('emits a toString-stable canonical form for "%s"', (input) => {
      const { str, reStr } = roundTripDefault(input);
      expect(reStr).toBe(str);
    });

    it.each(glyphStripInputs)('warns UNKNOWN_CODE and drops the invalid part on a glyph for "%s"', (input) => {
      // `;!`/`;!B81` on a glyph dumb-appends an invalid code: UNKNOWN_CODE at
      // parse, dropped from toString to a stable fixpoint (B291), so the render
      // does not round-trip the invalid part (the contract-file F1 behavior).
      const b = new BlissSVGBuilder(input);
      expect(b.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(b.toString()).toBe('B291');
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
