import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the parser bracket-option grammar: how option key=value pairs and
 * bare keys are tokenized inside [...], how whitespace and quoting are
 * handled inside option values, the start-anchored regex that gates
 * glyph-level option extraction, and the prefix-grammar rules for group
 * options (before |) and global options (before ||).
 *
 * Covers:
 * - Multiple options separated by ; inside one bracket pair, with and
 *   without whitespace around the separator.
 * - Option values that literally match the parser's internal placeholder
 *   format (PLACEHOLDER_N) are preserved verbatim, not confused with
 *   replaced bracket blocks.
 * - Whitespace stripped outside the brackets, preserved inside option
 *   values, trimmed around keys and unquoted values.
 * - Bare keys (no =value) parsed as boolean true at global, character,
 *   and part levels, in any position relative to key=value options.
 * - Hierarchical option levels: part [opt]>code, character [opt]code,
 *   global [opt]||code, and all three coexisting in one input.
 * - Empty brackets [] yielding no options on a part.
 * - Quoted values: matching ' or " pairs stripped symmetrically, lone
 *   quotes preserved, ; inside a quoted value preserved as data not
 *   delimiter, \" and \' escape sequences unescaped inside their
 *   matching quote type.
 * - Glyph-level option regex anchored at start of the part (no
 *   mid-string extraction).
 * - Group option prefix before single |: bracketed form required,
 *   non-bracket prefixes warn MALFORMED_GROUP_OPTIONS without throwing,
 *   empty | accepted as no options, text placeholders restored inside
 *   warning sources, prefix and suffix around an otherwise valid bracket
 *   block both rejected.
 * - Global option prefix before ||: bracketed form required, non-bracket
 *   prefixes warn MALFORMED_GLOBAL_OPTIONS without throwing, empty ||
 *   accepted as no options, text placeholders restored inside warning
 *   sources, prefix and suffix around an otherwise valid bracket block
 *   both rejected.
 * - More than one option bracket at the same level (two before || or two
 *   before |): warns MULTIPLE_OPTION_BRACKETS, applies the first bracket
 *   (first-wins), still renders the content, and the dropped bracket does
 *   not re-serialize or re-warn on round-trip. Adjacent brackets at
 *   different levels ([char][part]>) are valid and do not warn; a bracket
 *   character inside a quoted option value is not miscounted.
 *
 * Does NOT cover:
 * - Coordinate suffix parsing (:x,y) on parts that carry bracket
 *   options, see `BlissParser.coordinate-options.test.js`.
 * - Specific option keys' rendering effects (color, stroke-width, grid,
 *   crop, margin, etc.), see `BlissSVGBuilder.hierarchical-options.test.js`
 *   and the per-option-area files.
 * - Kerning markers (RK:, AK:) coexisting with bracket options, see
 *   `BlissParser.kerning.test.js`.
 * - Text-label `{text}` payload restoration inside the whitespace
 *   pre-pass, see `BlissParser.text-labels.test.js` and
 *   `BlissParser.input-preamble.test.js`.
 * - Indicator (`;`, `;;`) interaction with bracket options, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissParser.word-indicators.test.js`.
 */

const invalidGroupOptionsWarning = source => ({
  code: 'MALFORMED_GROUP_OPTIONS',
  message: `Invalid group options syntax: "${source}|" - expected [options]| format. Ignoring.`,
  source
});

const invalidGlobalOptionsWarning = source => ({
  code: 'MALFORMED_GLOBAL_OPTIONS',
  message: `Invalid global options syntax: "${source}||" - expected [options]|| format. Ignoring.`,
  source
});

const multipleGlobalOptionBracketsWarning = source => ({
  code: 'MULTIPLE_OPTION_BRACKETS',
  message: `Multiple option brackets before ||: "${source}". Only the first is applied; combine options in one bracket, e.g. [a;b]||.`,
  source
});

const multipleGroupOptionBracketsWarning = source => ({
  code: 'MULTIPLE_OPTION_BRACKETS',
  message: `Multiple option brackets before |: "${source}". Only the first is applied; combine options in one bracket, e.g. [a;b]|.`,
  source
});

describe('BlissParser bracket options', () => {
  describe('when the option brackets are empty', () => {
    it('treats empty brackets as no options on parts', () => {
      // Pins the early-return on empty extractedContent. At the global level
      // line 156 normalizes via `|| {}`, so we check the direct assignment in
      // parsePartString where the difference is observable.
      const part = BlissParser.parsePartString('[]>B81');
      expect(part.options).toBeUndefined();
      expect(part.codeName).toBe('B81');
    });
  });

  describe('when multiple options share one bracket pair separated by ;', () => {
    it('parses options without spaces around the separator', () => {
      const result = BlissParser.parse('[stroke-width=0.2;stroke-dasharray=0.6 0.6]>C8:0,8');

      expect(result.groups[0].glyphs[0].parts[0].options).toEqual({
        'stroke-width': '0.2',
        'stroke-dasharray': '0.6 0.6'
      });
    });

    it('parses options with spaces around the separator', () => {
      const result = BlissParser.parse('[stroke-width=0.2; stroke-dasharray=0.6 0.6]>C8:0,8');

      expect(result.groups[0].glyphs[0].parts[0].options).toEqual({
        'stroke-width': '0.2',
        'stroke-dasharray': '0.6 0.6'
      });
    });

    it('preserves spaces within option values', () => {
      const result = BlissParser.parse('[stroke-dasharray=0.6 0.6]>C8:0,8');

      expect(result.groups[0].glyphs[0].parts[0].options['stroke-dasharray']).toBe('0.6 0.6');
    });

    it('trims whitespace around keys and values', () => {
      const result = BlissParser.parse('[  stroke-width = 0.2  ;  color = red  ]>C8');

      expect(result.groups[0].glyphs[0].parts[0].options).toEqual({
        'stroke-width': '0.2',
        'color': 'red'
      });
    });
  });

  describe('when an option value literally matches an internal placeholder token', () => {
    it('preserves a PLACEHOLDER_0-shaped option value verbatim', () => {
      // A user-written option value that happens to look like the parser's
      // own internal bracket-replacement marker must round-trip as data,
      // not be re-interpreted as a placeholder.
      const result = BlissParser.parse('[svg-title=PLACEHOLDER_0]||B313');
      expect(result.options).toEqual({ 'svg-title': 'PLACEHOLDER_0' });
    });
  });

  describe('when whitespace appears around the brackets or inside the code', () => {
    it.each([
      ['H / C8', 'H/C8'],
      ['H : 3 , 4', 'H:3,4'],
      ['H ; E', 'H;E']
    ])('treats "%s" same as "%s"', (withSpaces, withoutSpaces) => {
      const result1 = BlissParser.parse(withSpaces);
      const result2 = BlissParser.parse(withoutSpaces);

      expect(result1).toEqual(result2);
    });

    it('removes spaces outside brackets while preserving them inside', () => {
      const result = BlissParser.parse('[stroke-dasharray=0.6 0.6] > C8 : 0 , 8');

      expect(result.groups[0].glyphs[0].parts[0].options['stroke-dasharray']).toBe('0.6 0.6');
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('C8');
      expect(result.groups[0].glyphs[0].parts[0].x).toBe(0);
      expect(result.groups[0].glyphs[0].parts[0].y).toBe(8);
    });
  });

  describe('when an option appears as a bare key without a value', () => {
    it('parses a bare key as boolean true', () => {
      const result = BlissParser.parse('[grid]||H');
      expect(result.options).toEqual({ grid: true });
    });

    it('parses bare key mixed with key=value options', () => {
      const result = BlissParser.parse('[grid;color=red]||H');
      expect(result.options).toEqual({ grid: true, color: 'red' });
    });

    it('parses multiple bare keys', () => {
      const result = BlissParser.parse('[grid;center]||H');
      expect(result.options).toEqual({ grid: true, center: true });
    });

    it('parses bare key followed by key=value', () => {
      const result = BlissParser.parse('[grid;stroke-width=0.4]||H');
      expect(result.options).toEqual({ grid: true, 'stroke-width': '0.4' });
    });

    it('parses key=value followed by bare key', () => {
      const result = BlissParser.parse('[color=red;grid]||H');
      expect(result.options).toEqual({ color: 'red', grid: true });
    });

    it('parses bare key with hyphenated name', () => {
      const result = BlissParser.parse('[error-placeholder]||H');
      expect(result.options).toEqual({ 'error-placeholder': true });
    });

    it('parses bare key at part level', () => {
      const result = BlissParser.parse('[grid]>C8:0,8');
      expect(result.groups[0].glyphs[0].parts[0].options).toEqual({ grid: true });
    });
  });

  describe('when an option value is quoted and contains a semicolon', () => {
    it('preserves a semicolon inside a double-quoted value', () => {
      // The double-quoted alt (?:[^"\\]|\\.)* must repeat to swallow the ;
      // that would otherwise terminate the option.
      const result = BlissParser.parse('[k="a;b"]||H');
      expect(result.options.k).toBe('a;b');
    });

    it('preserves a semicolon inside a single-quoted value', () => {
      const result = BlissParser.parse("[k='a;b']||H");
      expect(result.options.k).toBe('a;b');
    });
  });

  describe('when an option value carries quote characters at its boundaries', () => {
    it('does not strip a lone trailing double-quote from an unquoted value', () => {
      // The strip-quote check is `startsWith && endsWith`: both must hold.
      const result = BlissParser.parse('[k=a"]||H');
      expect(result.options.k).toBe('a"');
    });

    it('does not strip a lone leading double-quote from an unquoted value', () => {
      const result = BlissParser.parse('[k="a]||H');
      expect(result.options.k).toBe('"a');
    });

    it('does not strip a lone trailing single-quote from an unquoted value', () => {
      const result = BlissParser.parse("[k=a']||H");
      expect(result.options.k).toBe("a'");
    });

    it('does not strip a lone leading single-quote from an unquoted value', () => {
      const result = BlissParser.parse("[k='a]||H");
      expect(result.options.k).toBe("'a");
    });

    it('strips matching single quotes around a value', () => {
      // Pins the entire single-quote strip block: the slice(1,-1) and the
      // -1 (not +1) end index, and that the block is reachable.
      const result = BlissParser.parse("[k='a']||H");
      expect(result.options.k).toBe('a');
    });
  });

  describe('when an option value contains an escape sequence inside its quotes', () => {
    it('unescapes \\" inside a double-quoted value', () => {
      // Replacement string in .replace(/\\"/g, '"') must restore the quote.
      const result = BlissParser.parse('[k="a\\"b"]||H');
      expect(result.options.k).toBe('a"b');
    });

    it("unescapes \\' inside a single-quoted value", () => {
      const result = BlissParser.parse("[k='a\\'b']||H");
      expect(result.options.k).toBe("a'b");
    });
  });

  describe('when options appear at multiple hierarchical levels', () => {
    it('parses part-level options for multiple parts', () => {
      const result = BlissParser.parse('[color=red]>H:0,8;[color=green]>H:2,8;[color=blue]>H:4,8');

      expect(result.groups[0].glyphs[0].parts[0].options).toEqual({ color: 'red' });
      expect(result.groups[0].glyphs[0].parts[1].options).toEqual({ color: 'green' });
      expect(result.groups[0].glyphs[0].parts[2].options).toEqual({ color: 'blue' });
    });

    it('parses character-level options', () => {
      const result = BlissParser.parse('[stroke-width=0.2]H:3,4;E:2,4');

      expect(result.groups[0].glyphs[0].options).toEqual({ 'stroke-width': '0.2' });
    });

    it('parses global options', () => {
      const result = BlissParser.parse('[stroke-width=0.4]||H/C8');

      expect(result.options).toEqual({ 'stroke-width': '0.4' });
    });

    it('parses global, character, and part options in the same expression', () => {
      const result = BlissParser.parse('[stroke-width=0.4]||[stroke-width=0.2]|[stroke-width=0.3]H:3,4;E:2,4/C8:0,8;[color=green]>E:0,11');

      expect(result.options).toEqual({ 'stroke-width': '0.4' });
      expect(result.groups[0].glyphs[0].options).toEqual({ 'stroke-width': '0.3' });
      expect(result.groups[0].glyphs[1].parts[1].options).toEqual({ color: 'green' });
    });
  });

  describe('when option brackets do not appear at the start of a glyph or part', () => {
    it('does not extract options from brackets that are not at the start of a part', () => {
      // kills 2438 (^ anchor dropped). Mutant would treat 'B291[opt=red]X'
      // as if the brackets were a glyph-level options prefix, producing
      // codeName 'X' with options applied. Original surfaces an Invalid
      // format error because the part doesn't match the codeName regex.
      const r = BlissParser.parse('B291[opt=red]X');
      const glyph = r.groups[0].glyphs[0];
      expect(glyph.parts[0].error).toMatch(/^Invalid format:/);
      expect(glyph.parts[0].codeName).toBeUndefined();
      expect(glyph.options).toBeUndefined();
    });
  });

  describe('when a group option prefix appears before a single | separator', () => {
    it('treats a leading pipe as no group options without warning', () => {
      const r = BlissParser.parse('|H');

      expect(r._parseWarnings).toBeUndefined();
      expect(r.groups[0].options).toBeUndefined();
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });

    it('warns and ignores a non-bracket group option prefix', () => {
      const r = BlissParser.parse('bad|H');

      expect(r._parseWarnings).toEqual([invalidGroupOptionsWarning('bad')]);
      expect(r.groups[0].options).toBeUndefined();
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });

    it('restores text placeholders inside invalid group option warnings', () => {
      const r = BlissParser.parse('bad{with space}|H');

      expect(r._parseWarnings).toEqual([
        invalidGroupOptionsWarning('bad{with space}')
      ]);
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });

    it('requires group options to start with the opening bracket', () => {
      const r = BlissParser.parse('bad[color=red]|H');

      expect(r._parseWarnings).toEqual([
        invalidGroupOptionsWarning('bad[color=red]')
      ]);
      expect(r.groups[0].options).toBeUndefined();
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });

    it('requires group options to end with the closing bracket', () => {
      const r = BlissParser.parse('[color=red]bad|H');

      expect(r._parseWarnings).toEqual([
        invalidGroupOptionsWarning('[color=red]bad')
      ]);
      expect(r.groups[0].options).toBeUndefined();
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });
  });

  describe('when a global option prefix appears before a || separator', () => {
    it('parses valid bracketed global options without warning', () => {
      const r = BlissParser.parse('[color=red]||B313');

      expect(r._parseWarnings).toBeUndefined();
      expect(r.options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B313');
    });

    it('treats empty brackets before || as no global options without warning', () => {
      const r = BlissParser.parse('||B313');

      expect(r._parseWarnings).toBeUndefined();
      expect(r.options).toEqual({});
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B313');
    });

    it('warns and drops a non-bracketed global option prefix', () => {
      // Regression: commit 91b440f tightened #parseOptions to throw on
      // non-bracketed input, which turned this previously-lossy-but-safe
      // input into a hard crash. The fix gates the call site with the same
      // bracket check used for group options.
      const r = BlissParser.parse('B313||B414');

      expect(r._parseWarnings).toEqual([invalidGlobalOptionsWarning('B313')]);
      expect(r.options).toEqual({});
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B414');
    });

    it('restores text placeholders inside invalid global option warnings', () => {
      const r = BlissParser.parse('bad{with space}||B313');

      expect(r._parseWarnings).toEqual([
        invalidGlobalOptionsWarning('bad{with space}')
      ]);
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B313');
    });

    it('rejects a prefix before an otherwise valid bracketed option block', () => {
      const parsed = BlissParser.parse('bad[color=red]||B313');

      expect(parsed.options).toEqual({});
      expect(parsed._parseWarnings?.[0]?.code).toBe('MALFORMED_GLOBAL_OPTIONS');
      // pins start-anchor strictness; killed line 174 start-anchor regex mutant in 2026-05 Stryker run.
    });

    it('rejects a suffix after an otherwise valid bracketed option block', () => {
      const parsed = BlissParser.parse('[color=red]bad||B313');

      expect(parsed.options).toEqual({});
      expect(parsed._parseWarnings?.[0]?.code).toBe('MALFORMED_GLOBAL_OPTIONS');
      // pins end-anchor strictness; killed line 174 end-anchor regex mutant in 2026-05 Stryker run.
    });
  });

  describe('when more than one option bracket appears at the same level', () => {
    it('warns and applies only the first bracket when two brackets precede ||', () => {
      // note: [a][b]|| is not valid syntax (one bracket per level); the
      // canonical multi-option form is [a;b]||. First-wins matches the
      // MULTIPLE_ verb ("resolved by picking the first").
      const r = BlissParser.parse('[grid][grid-color=red]||B291');

      expect(r._parseWarnings).toEqual([
        multipleGlobalOptionBracketsWarning('[grid][grid-color=red]')
      ]);
      expect(r.options).toEqual({ grid: true });
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B291');
    });

    it('warns and applies only the first bracket when two brackets precede |', () => {
      const r = BlissParser.parse('[color=red][color=blue]|B291');

      expect(r._parseWarnings).toEqual([
        multipleGroupOptionBracketsWarning('[color=red][color=blue]')
      ]);
      expect(r.groups[0].options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('B291');
    });

    it('does not re-serialize or re-warn the dropped bracket after a round-trip', () => {
      const builder = new BlissSVGBuilder('[grid][grid-color=red]||B291');

      expect(builder.toString()).toBe('[grid]||B291');
      expect(new BlissSVGBuilder(builder.toString()).warnings).toEqual([]);
    });

    it('counts top-level brackets, not a bracket inside a quoted option value', () => {
      // The '[' inside the quoted value must not be miscounted as a second
      // top-level bracket; counting happens on the placeholder form.
      const r = BlissParser.parse('[k="a[b"]||B291');

      expect(r._parseWarnings).toBeUndefined();
      expect(r.options).toEqual({ k: 'a[b' });
    });

    it('does not warn on adjacent brackets at different levels ([char][part]>)', () => {
      const r = BlissParser.parse('[color=red][stroke-width=0.6]>B291');

      expect(r._parseWarnings).toBeUndefined();
      expect(r.groups[0].glyphs[0].options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[0].parts[0].options).toEqual({ 'stroke-width': '0.6' });
    });
  });
});
