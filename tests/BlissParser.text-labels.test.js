import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the interim contract of the `{text}` placeholder pre-pass: a
 * single trailing `{...}` block per group is captured verbatim;
 * multiple `{...}` blocks (whether in one group or spread across `//`)
 * produce a `UNSUPPORTED_TEXT_BLOCKS` warning with documented-undefined
 * parse behavior. The pre-pass uses a regex, so any nested `{` inside
 * a single block raises the same warning even though the content is
 * still preserved.
 *
 * Background (2026-05-03 parser audit): the previous behavior silently
 * merged two `{...}` blocks into one text label and dropped the glyphs
 * between them. The interim compromise surfaces the limitation as a
 * warning rather than letting it be silent. The eventual fix is a
 * stateful tokenizer that supports arbitrary content AND multiple text
 * blocks; see the project's text-overlay backlog.
 *
 * Covers:
 * - Single trailing `{text}`: clean capture, preserved glyphs, no warning.
 * - Verbatim content including whitespace, punctuation, and empty `{}`.
 * - Placeholder-ID-shaped content (e.g. `{PLACEHOLDER_0}`) does not
 *   collide with internal pre-pass markers, including when the text
 *   content is `[PLACEHOLDER_0]` and a real bracket-option block is
 *   also present in the same input.
 * - Verbatim preservation of `[`, `]`, `{`, `}`, and other delimiter
 *   characters inside `{...}` blocks, across multi-group inputs that
 *   interleave implicit space groups (e.g. `H//C8{...}`).
 * - Nested braces in a single block: content preserved, warning fires.
 * - Multiple blocks across groups (`{a}//{b}`): warning fires.
 * - Multiple blocks in one group (`{a}/{b}`): warning fires with
 *   "not supported" message.
 *
 * Does NOT cover:
 * - The rendered SVG output of `{text}` overlays (feature not yet
 *   shipped); see the project's text-overlay backlog.
 * - The final per-group capture semantics that will replace this
 *   regex pre-pass when the tokenizer lands.
 */
describe('BlissParser text-label placeholder pre-pass', () => {
  describe('when the input has a single trailing {text} block', () => {
    it('captures the text and preserves all glyphs', () => {
      const r = BlissParser.parse('H/B313{a}');
      expect(r.groups[0].glyphs).toHaveLength(2);
      expect(r.groups[0].text).toBe('a');
      expect(r._parseWarnings).toBeUndefined();
    });

    it('preserves arbitrary content verbatim including spaces and punctuation', () => {
      const r = BlissParser.parse('B313{hello world!}');
      expect(r.groups[0].text).toBe('hello world!');
      expect(r._parseWarnings).toBeUndefined();
    });

    it('captures empty content as the empty string', () => {
      const r = BlissParser.parse('B313{}');
      expect(r.groups[0].text).toBe('');
      expect(r._parseWarnings).toBeUndefined();
    });

    it('accepts placeholder-ID-shaped content without colliding with internal markers', () => {
      // A user writing `{PLACEHOLDER_0}` literally must round-trip.
      const r = BlissParser.parse('B313{PLACEHOLDER_0}');
      expect(r.groups[0].text).toBe('PLACEHOLDER_0');
    });

    it('preserves `[PLACEHOLDER_0]`-shaped text content alongside a real bracket-option block', () => {
      // The real `[color=red]` becomes an internal PLACEHOLDER_0 token
      // during the bracket pre-pass; the `{[PLACEHOLDER_0]}` text content
      // is captured verbatim afterwards and must not be re-replaced.
      const r = BlissParser.parse('[color=red]||B313{[PLACEHOLDER_0]}');
      expect(r.options).toEqual({ color: 'red' });
      expect(r.groups[0].text).toBe('[PLACEHOLDER_0]');
    });
  });

  describe('when {text} content contains brackets, braces, or other delimiters', () => {
    it.each([
      ['square brackets', 'H//C8{hello [world]}', 'hello [world]', false],
      ['curly brackets', 'H//C8{hello {world}}', 'hello {world}', true],
      ['mixed brackets', 'H//C8{hello [world] and {stuff}}', 'hello [world] and {stuff}', true],
      ['delimiters', 'H//C8{text with []{}():;,/}', 'text with []{}():;,/', true]
    ])('preserves %s verbatim in {text} content', (description, input, expectedText, expectsWarning) => {
      const result = BlissParser.parse(input);

      // With implicit space groups interleaved as [H, TSP, C8], C8 is at index 2.
      expect(result.groups[2].text).toBe(expectedText);

      // A nested `{` bumps the brace count, so the interim contract fires
      // UNSUPPORTED_TEXT_BLOCKS (visible, not silent); the square-bracket row
      // has no nested brace and parses without a warning.
      if (expectsWarning) {
        expect(result._parseWarnings?.[0]?.code).toBe('UNSUPPORTED_TEXT_BLOCKS');
      } else {
        expect(result._parseWarnings).toBeUndefined();
      }
    });
  });

  describe('when the {text} content contains nested braces', () => {
    it('preserves the nested characters and emits a UNSUPPORTED_TEXT_BLOCKS warning', () => {
      const r = BlissParser.parse('B313{hello {world} and [stuff]}');
      expect(r.groups[0].text).toBe('hello {world} and [stuff]');
      // Nested `{}` bumps the `{` count, so the warning fires too. That is
      // the documented trade-off of the interim contract: visible, not silent.
      expect(r._parseWarnings?.[0]?.code).toBe('UNSUPPORTED_TEXT_BLOCKS');
    });
  });

  describe('when the input has multiple {...} blocks (interim limitation)', () => {
    it('emits a UNSUPPORTED_TEXT_BLOCKS warning when blocks live in different groups', () => {
      // Two `{` characters anywhere in the input, even split across groups,
      // currently means the greedy regex eats from the first `{` to the last
      // `}` and merges across the `//`. We flag this with a warning; the
      // actual parse output is documented-as-undefined until the tokenizer
      // ships. When that lands, this test should flip to asserting per-group
      // text capture.
      const r = BlissParser.parse('B313{first}//B431{second}');
      expect(r._parseWarnings?.[0]?.code).toBe('UNSUPPORTED_TEXT_BLOCKS');
    });

    it('emits a UNSUPPORTED_TEXT_BLOCKS warning when multiple blocks live in the same group', () => {
      const r = BlissParser.parse('H/B313{a}/B313{b}');
      const warning = r._parseWarnings?.find(w => w.code === 'UNSUPPORTED_TEXT_BLOCKS');
      expect(warning).toBeDefined();
      expect(warning.message).toMatch(/not supported/i);
    });

    it('captures the merged span between the first `{` and the last `}` when two blocks sit adjacent on one part', () => {
      // `B313{a}{b}` has two `{` characters → the greedy regex captures
      // from the first `{` to the last `}`, producing `a}{b` as the
      // text content. Pinning the interim contract: content is preserved
      // (the inner `}{` survives), and the multi-block limitation
      // surfaces via the same warning mechanism as the cross-glyph case.
      const r = BlissParser.parse('B313{a}{b}');
      expect(r.groups[0].text).toBe('a}{b');
    });
  });
});
