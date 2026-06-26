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
 * - Promotion requires EVERY applied code to be a real indicator: a mixed
 *   applied list (real indicator + non-indicator primitive) appends at
 *   character level instead.
 * - Promotion requires the alias's baked tail to be all indicators: a tail
 *   mixing an indicator and a non-indicator does not support replacement, so an
 *   applied indicator appends at character level instead.
 * - A `!`-stripped applied indicator routes to a `;;!` overlay.
 * - Round-trip svg-identity for the promoted form.
 * - An indicator applied to a base+indicator alias in a multi-glyph word: the
 *   word-level `;;` slot is a word property owned by the FIRST glyph
 *   (first-wins), so a later glyph's promoted overlay is dropped with a
 *   `DROPPED_WORD_INDICATOR` warning while every glyph keeps its own baked
 *   character-level indicator. Composing with `/` is byte-identical to
 *   `mergeWithNext`.
 * - Single-glyph promotion records no `DROPPED_WORD_INDICATOR` (nothing to drop).
 * - A promoted overlay colliding with an explicit `;;` in one word: the leftmost
 *   glyph's word-overlay wins and the later one is dropped + `DROPPED_WORD_INDICATOR`
 *   (the same first-wins rule as `mergeWithNext`, so `/`-composition stays
 *   byte-identical to it).
 *
 * Does NOT cover:
 * - Per-glyph (glyph-scoped) reversibility: the `;;` slot is word-scoped and
 *   first-glyph-owned, so a non-first glyph's applied indicator is dropped, not
 *   given its own reversible slot (a deliberate non-goal).
 * - Split/merge round-trip of the word-slot and query-time head resolution
 *   (WS-2…WS-4), see the `ElementHandle.*` suites.
 * - The define-time guard rejecting base+indicator glyph definitions (D-S1a,
 *   Task 3b-2), see `BlissSVGBuilder.define.test.js`.
 * - The composite-as-part warning for a composed unflagged alias used as a
 *   non-leading `;`-part, see `BlissSVGBuilder.composite-part.test.js`.
 * - Programmatic `glyph().applyIndicators()` char-path parity (Task 5), see
 *   `ElementHandle.apply-indicators.test.js`.
 * - Rendered pixel output: promotion is render-neutral by design (no e2e).
 */
describe('BlissSVGBuilder indicator promotion', () => {
  const PROMO_DEFS = {
    NOUN_BI: { codeString: 'B291;B81' }, // base + grammatical (verbal) indicator
    NOUN_S: { codeString: 'B291;B97' },  // base + semantic ('thing') indicator
    NOUN_B: { codeString: 'B291' },      // clean base, no baked indicator
    GRAMBASE: { codeString: 'B291;B99' }, // base + indicator; gates promotion on the APPLIED list
    MIXEDTAIL: { codeString: 'B291;B99;VL4' }, // tail mixes indicator (B99) + non-indicator (VL4)
  };
  const svg = (dsl) => new BlissSVGBuilder(dsl).svgCode;

  beforeAll(() => BlissSVGBuilder.define(PROMO_DEFS));
  afterAll(() => Object.keys(PROMO_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  describe('when an indicator is applied to a grammatical base+indicator alias', () => {
    it('routes the applied indicator into a reversible ;; overlay', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97');
      expect(b.toString()).toBe('B291;B81;;B97');
      expect(b.warnings.map((w) => w.code)).not.toContain('DROPPED_WORD_INDICATOR');
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

  describe('when not all applied indicators are real indicators', () => {
    // GRAMBASE = 'B291;B99' is a base+indicator alias, but the applied list
    // B81;VL4 mixes a real indicator (B81) with a non-indicator primitive
    // (VL4). Promotion requires EVERY applied code to be a real indicator, so
    // this appends at character level instead of routing to the ;; overlay.
    it('appends at character level without creating an overlay', () => {
      // pins inputIndicatorsAreReal's .every (parser L686); killed the .every->
      // .some mutant in the 2026-06-26 Stryker run, which promotes when only
      // SOME of the applied codes are real indicators.
      const b = new BlissSVGBuilder('GRAMBASE;B81;VL4');
      expect(b.toString()).toBe('B291;B99;B81;VL4');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
    });
  });

  describe('when the alias baked tail mixes indicator and non-indicator parts', () => {
    // MIXEDTAIL = 'B291;B99;VL4': the codeString tail mixes an indicator (B99)
    // and a non-indicator primitive (VL4), so the base does NOT support
    // indicator replacement. Applying a real indicator appends at character
    // level rather than promoting to the ;; overlay.
    it('appends at character level without creating an overlay', () => {
      // pins baseCodeSupportsReplacement's .every (parser L701); killed the
      // .every->.some mutant in the 2026-06-26 Stryker run, which treats a tail
      // with ANY indicator as replacement-capable and promotes.
      const b = new BlissSVGBuilder('MIXEDTAIL;B81');
      expect(b.toString()).toBe('B291;B99;VL4;B81');
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

  describe('when an indicator is applied to an alias in a multi-glyph word', () => {
    // note: the word-level ;; slot is a WORD property owned by the first glyph
    // (first-wins), so composing glyphs with `/` behaves byte-identically to
    // mergeWithNext: a later glyph's promoted overlay is dropped + warned, and
    // every glyph keeps its own baked character-level indicator (R15 word-slot
    // model, supersedes the 85b67a7 single-glyph gate).
    it('drops a later glyph overlay when the first glyph has an empty word-slot', () => {
      const b = new BlissSVGBuilder('H/NOUN_BI;B97');
      expect(b.toString()).toBe('H/B291;B81');
      expect(b.warnings.map((w) => w.code)).toContain('DROPPED_WORD_INDICATOR');
      expect(b.toJSON().groups[0].wordIndicators).toBeUndefined();
      expect(b.svgCode).toBe(svg('H/B291;B81'));
    });

    it('keeps a first-glyph overlay with no warning when later glyphs are plain', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/E');
      expect(b.toString()).toBe('B291;B81/E;;B97');
      expect(b.warnings.map((w) => w.code)).not.toContain('DROPPED_WORD_INDICATOR');
      expect(svg(b.toString())).toBe(b.svgCode);
    });

    it('keeps the first glyph overlay and drops the second when two aliases promote', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/NOUN_BI;B86');
      expect(b.toString()).toBe('B291;B81/B291;B81;;B97');
      expect(b.warnings.map((w) => w.code)).toContain('DROPPED_WORD_INDICATOR');
      expect(svg(b.toString())).toBe(b.svgCode);
    });

    it('describes the dropped overlay with a ;;B86 source', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/NOUN_BI;B86');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;B86');
    });

    it('preserves the ! marker in a dropped strip-semantic overlay source', () => {
      const b = new BlissSVGBuilder('NOUN_S;!B86/NOUN_S;!B81');
      expect(b.toString()).toBe('B291;B97/B291;B97;;!B86');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;!B81');
    });

    it('keeps every applied code in a multi-indicator dropped source', () => {
      const b = new BlissSVGBuilder('E/NOUN_BI;B97;B81');
      expect(b.toString()).toBe('E/B291;B81');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;B97;B81');
    });

    it('warns once per dropped overlay when several later glyphs promote', () => {
      const b = new BlissSVGBuilder('E/NOUN_BI;B97/NOUN_BI;B86');
      const drops = b.warnings.filter((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(drops.map((w) => w.source)).toEqual([';;B97', ';;B86']);
    });
  });

  describe('when a promoted overlay and an explicit ;; collide in one word', () => {
    // note: an explicit `;;` does NOT automatically win; the leftmost glyph's
    // word-overlay wins and the later one is dropped + warned, whether the
    // leftmost is promoted or explicit. This is the same first-wins rule as
    // mergeWithNext, which keeps `/`-composition byte-identical to it (R15
    // Finding A: the ;;-handler now respects an already-promoted slot instead
    // of silently clobbering it). The stray trailing `;;` on an empty `;;`
    // (`NOUN_BI;B97/E;;`) is a SEPARATE pre-existing issue (`H/E;;` emits it
    // too, no promotion involved).
    it('keeps the leading promoted overlay and drops the trailing explicit ;;', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/E;;B86');
      expect(b.toString()).toBe('B291;B81/E;;B97');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;B86');
    });

    it('keeps the leading promoted overlay when an explicit ;; trails a plain glyph', () => {
      const b = new BlissSVGBuilder('NOUN_BI;B97/H;;B86');
      expect(b.toString()).toBe('B291;B81/H;;B97');
      expect(b.warnings.map((w) => w.code)).toContain('DROPPED_WORD_INDICATOR');
    });

    it('keeps a leading explicit overlay and drops a later promoted glyph', () => {
      const b = new BlissSVGBuilder('E/NOUN_BI;B97;;B86');
      expect(b.toString()).toBe('E/B291;B81;;B86');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;B97');
    });

    it('preserves the ! marker and every code in a dropped explicit overlay source', () => {
      // pins the dropped-source build in the ;;-handler collision path; a
      // multi-code strip-semantic explicit overlay distinguishes join(';') from
      // join('') and the '!' branch from ''
      const b = new BlissSVGBuilder('NOUN_BI;B97/E;;!B86;B81');
      expect(b.toString()).toBe('B291;B81/E;;B97');
      const dropped = b.warnings.find((w) => w.code === 'DROPPED_WORD_INDICATOR');
      expect(dropped?.source).toBe(';;!B86;B81');
    });
  });
});
