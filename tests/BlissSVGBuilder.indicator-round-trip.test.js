import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins indicator round-trips on custom glyphs across both toString modes.
 * Under { preserve: true } a per-instance indicator delta (via the `;` DSL or
 * applyIndicators) re-emits against the definition's baked indicator state
 * (`_X;B81`, `_X;!B81`, `_X;!`, bare `_X` when unchanged) instead of
 * collapsing to the bare name; under default toString the same glyph fully
 * decomposes to primitives. Either way parse(toString(x)) renders identically
 * to parse(x), and the DSL and applyIndicators paths emit the same string and
 * the same SVG for the same operation.
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
 * - Default-mode toString decomposing the character-level indicator delta
 *   family (`;`, `;!`, `;B81`, `;!B81`) on plain, semantic-rooted, and
 *   non-semantic-baked bases: SVG round-trip identity and toString stability.
 * - Default-mode word-level (`;;`) indicators across a multi-glyph word,
 *   including `^`+`;;`, decomposing onto the resolved head.
 *
 * Does NOT cover:
 * - Word-level (`;;`) round-trip when the resolved head is a custom glyph
 *   that bakes an indicator: the semantic doubles on decompose. Tracked as
 *   findings N9 / register R14 (word-level indicator model).
 * - General round-trip identity across all input kinds (options, kerning,
 *   spaces, external glyphs) and the toJSON snapshot shape, see
 *   `BlissSVGBuilder.round-trip.test.js`.
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
    // differ from. Doubles as the semantic-rooted base for the default-mode
    // family below.
    _IRT_NOUN: { type: 'glyph', codeString: 'B291;B97' },
    // Typeless multi-glyph alias: decomposes at parse, carries no glyph
    // identity. Negative control for the preserve fix.
    _IRT_WORD: { codeString: 'B313/B208' },
    // Default-mode family bases: the same B291 body with no baked indicator
    // and with a non-semantic one (B86 'description', adjectival). Together
    // with _IRT_NOUN they form the plain / semantic-rooted / non-semantic-baked
    // trio that the strip-semantic (`;!`) delta has to treat differently.
    _IRT_PLAIN: { type: 'glyph', codeString: 'B291' },
    _IRT_NONSEM: { type: 'glyph', codeString: 'B291;B86' },
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
    // `;;` attaches the indicator to the resolved head; default toString
    // decomposes it onto that head as a character-level `;`, so the word
    // round-trips. An explicit `^` that deviates from the fallback re-emits on
    // export (pinned in `BlissSVGBuilder.head-marker-round-trip.test.js`).
    // Note: when the resolved head is itself a custom glyph that bakes an
    // indicator, the semantic doubles on decompose; that divergence is tracked
    // as findings N9 / register R14 (word-level indicator model), not here.
    const wordCases = [
      'B313/B208;;B81',    // ;; routes to the fallback head (index 0)
      'B313/B208;;!B81',   // strip-semantic word-level (no semantic to strip)
      'B313/B208;;',       // bare word-level marker decomposes away
      'B486/B313;;B81',    // ;; routes past the B486 exclusion
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

    // N9: when the resolved head is a custom glyph baking an indicator, the
    // semantic doubles on decompose, so this case is NOT green yet. It is
    // deferred to the R14 word-level indicator model, whose acceptance criteria
    // require turning it green (findings doc N9 + R14 register row). Tracked as
    // a todo so it stays visible every run without a red in the green suite.
    it.todo('round-trips a ;; indicator on a custom-glyph-baked head once the R14 word-level model lands (N9)');
  });
});
