import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins option-value quoting (rc.4 Chunk 11): an option VALUE carrying
 * DSL-significant characters (`;`, `]`, `[`, `|`, quotes, leading/trailing
 * whitespace) is emitted quoted by toString and re-parses to the same data,
 * on every surface (DSL input, setOptions, defaultOptions, the `;;` overlay
 * store) — closing the round-4 F2 scope injection, where a value like
 * `red;margin=2]||[color=blue` re-parsed as an UNWARNED global margin.
 *
 * Covers:
 * - Quote-aware bracket tokenization: quoted `]` / `;` / `][` no longer
 *   truncate or split a bracket at the pre-pass or at option extraction.
 * - Emission quoting on both stored-string sites (toString serializeOptions
 *   and the parser's `;;`-overlay rebuild after a canvas-key strip).
 * - The injection contained on the API surfaces (setOptions, defaultOptions):
 *   value round-trips as data, no global key materializes, no warning,
 *   byte-identical SVG.
 * - One-pass normal form: any input spelling re-emits byte-stable from the
 *   first toString onward (single-quoted input normalizes to double quotes).
 * - Plain values stay byte-unchanged (no quoting churn).
 * - Unclosed-bracket inputs stay linear-time and fall through to the
 *   existing malformed/unknown warn paths.
 *
 * Does NOT cover:
 * - Values where a backslash abuts the escaping (`a\"b` class, trailing
 *   `\`): the parser unescapes ONLY `\"`, so these cannot round-trip —
 *   accepted residue, tracked with the definition-reference hygiene-nits
 *   backlog row.
 * - Definition codeStrings carrying quoted values (`define({X: {codeString:
 *   '[data-t="a;b"]>B291;C8'}})`): the definition-ingestion split is
 *   quote-unaware (visible UNKNOWN_CODE, not silent) — same backlog row.
 * - `{`/`}` inside a value when the input also has a `{...}` text block:
 *   the greedy text-block match predates this (backlog text-overlay).
 * - Duplicate-bracket COUNTING with quote junk, see
 *   `BlissParser.bracket-options.test.js`.
 */
describe('BlissSVGBuilder option-value quoting', () => {
  const INJECTION = 'red;margin=2]||[color=blue';

  beforeAll(() => {
    BlissSVGBuilder.define({
      QVAL_INJDEF: { codeString: 'B291', defaultOptions: { color: INJECTION } },
    });
  });
  afterAll(() => {
    BlissSVGBuilder.removeDefinition('QVAL_INJDEF');
  });

  // Round-trips one hostile part-option value through toString and back;
  // returns the re-parsed value plus both emissions for fixpoint checks.
  const roundTripPartValue = (value) => {
    const b = new BlissSVGBuilder('B291;B81');
    b.glyph(0).part(1).setOptions({ 'data-t': value });
    const once = b.toString();
    const again = new BlissSVGBuilder(once);
    return {
      once,
      twice: again.toString(),
      value: again.toJSON().groups[0].glyphs[0].parts[1].options['data-t'],
      warnings: again.warnings.map((w) => w.code),
    };
  };

  describe('when a quoted value appears in DSL input', () => {
    it('parses a quoted ] in a global option value as data', () => {
      // regression: the quote-unaware pre-pass tokenized [svg-title="a]b"]
      // as [svg-title="a] and the title became '"a' (backlog gate case)
      const b = new BlissSVGBuilder('[svg-title="a]b"]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.toJSON().options['svg-title']).toBe('a]b');
      expect(b.toString()).toBe('[svg-title="a]b"]||B291');
    });

    it('parses a single-quoted ] value and normalizes it to double quotes', () => {
      // pins the '...' alternative of the bracket-content grammar; a mutant
      // dropping it re-truncates at the quoted ]
      const b = new BlissSVGBuilder("[data-t='a]b']>B291");
      expect(b.warnings).toEqual([]);
      expect(b.toJSON().groups[0].glyphs[0].parts[0].options['data-t']).toBe('a]b');
      expect(b.toString()).toBe('[data-t="a]b"]>B291');
    });

    it('keeps a quoted ; part-option value as one value through re-parse', () => {
      const b = new BlissSVGBuilder('[data-t="a;b"]>B291');
      expect(b.toJSON().groups[0].glyphs[0].parts[0].options['data-t']).toBe('a;b');
      expect(b.toString()).toBe('[data-t="a;b"]>B291');

      const again = new BlissSVGBuilder(b.toString());
      expect(again.toJSON().groups[0].glyphs[0].parts[0].options).toEqual({ 'data-t': 'a;b' });
      expect(again.toString()).toBe('[data-t="a;b"]>B291');
    });

    it('preserves leading whitespace in a quoted value across the round-trip', () => {
      const b = new BlissSVGBuilder('[svg-title=" hi"]||B291');
      expect(b.toJSON().options['svg-title']).toBe(' hi');
      expect(b.toString()).toBe('[svg-title=" hi"]||B291');
      expect(new BlissSVGBuilder(b.toString()).toJSON().options['svg-title']).toBe(' hi');
    });

    it('re-emits a pipe-bearing value quoted so it stays one value', () => {
      const b = new BlissSVGBuilder('[svg-title="a|b"]||B291');
      expect(b.toJSON().options['svg-title']).toBe('a|b');
      expect(b.toString()).toBe('[svg-title="a|b"]||B291');
    });

    it('parses a value containing ][ without splitting the bracket', () => {
      // companion to the counting pins in BlissParser.bracket-options.test.js:
      // the value itself now survives (it used to truncate at the quoted ])
      const b = new BlissSVGBuilder('[k="]["]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.toJSON().options.k).toBe('][');
      expect(b.toString()).toBe('[k="]["]||B291');
    });

    it('keeps the first bracket value intact on a genuine duplicate', () => {
      const b = new BlissSVGBuilder('[k="a]b"][x=2]||B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toJSON().options.k).toBe('a]b');
      expect(b.toJSON().options.x).toBeUndefined();
    });

    it.each([
      ['[color=red]B291'],
      ['[grid]||B291'],
      ['[stroke-width=0.4]||B291'],
      ['[color=red]>B291;C8'],
    ])('leaves the plain-value input %s byte-unchanged', (input) => {
      const b = new BlissSVGBuilder(input);
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe(input);
    });
  });

  describe('when an API-set option value carries DSL-significant characters', () => {
    it('contains the scope injection: the value stays data, no global key', () => {
      // regression: round-4 review F2 — this value re-parsed as an UNWARNED
      // global margin with a changed viewBox
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ color: INJECTION });
      const emitted = b.toString();
      expect(emitted).toBe('[color="red;margin=2]||[color=blue"]B291');

      const reparsed = new BlissSVGBuilder(emitted);
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.toJSON().options.margin).toBeUndefined();
      expect(reparsed.toJSON().groups[0].glyphs[0].options.color).toBe(INJECTION);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('contains the injection when it arrives via defaultOptions', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGlyph('QVAL_INJDEF');
      const emitted = b.toString();
      expect(emitted).toBe('B291/[color="red;margin=2]||[color=blue"]B291');

      const reparsed = new BlissSVGBuilder(emitted);
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.toJSON().options.margin).toBeUndefined();
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it.each([
      ['a;b'],
      ['a]b'],
      ['a[b'],
      ['a|b'],
      ['say "hi"'],
      [' leading'],
      ['trailing '],
      ["a'b"],
    ])('round-trips the part-option value %j as data', (value) => {
      const r = roundTripPartValue(value);
      expect(r.value).toBe(value);
      expect(r.warnings).toEqual([]);
      expect(r.twice).toBe(r.once);
    });

    it('leaves numeric and plain string values unquoted', () => {
      const b = new BlissSVGBuilder('B291;B81');
      b.glyph(0).part(1).setOptions({ 'data-n': 5, 'data-s': 'plain' });
      expect(b.toString()).toBe('B291;[data-n=5;data-s=plain]>B81');
    });
  });

  describe('when the overlay store rebuilds after a canvas-key strip', () => {
    it('re-emits the kept quoted value quoted', () => {
      // pins the rebuild emission path: kept keys used to re-serialize raw,
      // so 'a;b' became data-t=a plus a stray bare key b on the next parse
      const b = new BlissSVGBuilder('B303;;[margin=2;data-t="a;b"]>B81');
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(b.toString()).toBe('B303;;[data-t="a;b"]>B81');

      const again = new BlissSVGBuilder(b.toString());
      expect(again.warnings).toEqual([]);
      expect(again.toString()).toBe('B303;;[data-t="a;b"]>B81');
    });

    it('stores a clean quoted ; value verbatim', () => {
      // control (SIB-2 verbatim store): nothing dropped, no rebuild
      const b = new BlissSVGBuilder('B303;;[data-t="a;b"]>B81');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B303;;[data-t="a;b"]>B81');
    });

    it('does not misread a quoted ] value as a character-form bracket', () => {
      // pins quote-awareness of the overlay char-form prefix match: the lazy
      // form stopped at the ] inside the value and warned
      // MISPLACED_CHARACTER_OPTION on a validly placed part option
      const b = new BlissSVGBuilder('B303;;[data-t="a]b"]>B81');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B303;;[data-t="a]b"]>B81');
      expect(b.svgCode).toContain('data-t=');
    });

    it('does not misread a quoted ]> value as the bracket end', () => {
      // pins quote-awareness of the overlay part-form prefix match
      const b = new BlissSVGBuilder('B303;;[data-t="a]>b"]>B81');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B303;;[data-t="a]>b"]>B81');
      expect(b.svgCode).toContain('data-t=');
    });

    it('strips the gated key without cutting a quoted ]> value', () => {
      // pins the part-form matcher ON the rebuild path: a lazy quote-unaware
      // match cuts the bracket at the ]> inside the value, so the rebuild
      // re-emits a mangled fragment; on a clean bracket the same mutant is
      // masked by the nothing-dropped verbatim return
      const b = new BlissSVGBuilder('B303;;[margin=2;data-t="a]>b"]>B81');
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(b.toString()).toBe('B303;;[data-t="a]>b"]>B81');
      expect(new BlissSVGBuilder(b.toString()).warnings).toEqual([]);
    });
  });

  describe('when a bracket never closes', () => {
    it('tokenizes a pathological quote run in linear time', () => {
      // pins the atomic-lookahead form of the bracket-content grammar: the
      // plain alternation backtracks exponentially here (hours at this size),
      // so a mutant reverting it fails this test by timeout
      const b = new BlissSVGBuilder('[' + '"'.repeat(200) + 'B291');
      expect(b.warnings.length).toBeGreaterThan(0);
    });

    it('falls through to the malformed-options path when the only ] is quoted', () => {
      // an unclosed bracket whose ] sits inside a complete quoted span does
      // not tokenize; the global-options arm warns and drops it, as before
      const b = new BlissSVGBuilder('[k="]"||B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['MALFORMED_GLOBAL_OPTIONS']);
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });
  });
});
