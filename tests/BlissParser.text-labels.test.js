import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the interim contract of the `{text}` placeholder pre-pass: EVERY
 * `{...}` block warns `UNSUPPORTED_TEXT_BLOCKS` (run-to-stable Phase 2.2 —
 * the text parses onto `group.text` but renders nothing and is dropped from
 * `toString()`, so a silent single block violated visible-not-silent); a
 * single trailing block per group is still captured verbatim; multiple
 * blocks keep documented-undefined parse behavior. The block count is taken
 * AFTER bracket tokenization, so a literal `{` inside a quoted option value
 * never counts and a whole `{...}` block counts once regardless of nested
 * braces in its content.
 *
 * Background (2026-05-03 parser audit): the previous behavior silently
 * merged two `{...}` blocks into one text label and dropped the glyphs
 * between them. The interim compromise surfaces the limitation as a
 * warning rather than letting it be silent. The eventual fix is a
 * stateful tokenizer that supports arbitrary content AND multiple text
 * blocks; see the project's text-overlay backlog.
 *
 * Covers:
 * - Single trailing `{text}`: clean capture, preserved glyphs, and the
 *   UNSUPPORTED_TEXT_BLOCKS warning (the visibility witness).
 * - Builder-level swallow visibility: the warning surfaces on
 *   `builder.warnings`, the base still renders, `toString()` drops the block.
 * - Verbatim content including whitespace, punctuation, empty `{}`, and
 *   placeholder-ID-shaped content.
 * - Nested braces in a single block count as ONE block (content preserved).
 * - A `{` inside a quoted option value never triggers the warning.
 * - A mid-string (non-trailing) block warns instead of garbling silently.
 * - Multiple blocks (same group, across groups, adjacent) keep the warning
 *   and the documented-undefined merged capture.
 *
 * Does NOT cover:
 * - The rendered SVG output of `{text}` overlays (feature not yet
 *   shipped); see the project's text-overlay backlog.
 * - The final per-group capture semantics that will replace this
 *   regex pre-pass when the tokenizer lands.
 */
describe('BlissParser text-label placeholder pre-pass', () => {
  const textWarnings = (r) =>
    (r._parseWarnings ?? []).filter((w) => w.code === 'UNSUPPORTED_TEXT_BLOCKS');

  describe('when the input has a single trailing {text} block', () => {
    it('captures the text, preserves all glyphs, and warns UNSUPPORTED_TEXT_BLOCKS', () => {
      const r = BlissParser.parse('H/B313{a}');
      expect(r.groups[0].glyphs).toHaveLength(2);
      expect(r.groups[0].text).toBe('a');
      // regression (Phase 2.2): a single block used to parse with zero
      // warnings while rendering and toString() dropped it silently
      expect(textWarnings(r)).toHaveLength(1);
      // the source names the ORIGINAL input, not the tokenized form
      expect(textWarnings(r)[0].source).toBe('H/B313{a}');
    });

    it('preserves arbitrary content verbatim including spaces and punctuation', () => {
      const r = BlissParser.parse('B313{hello world!}');
      expect(r.groups[0].text).toBe('hello world!');
      expect(textWarnings(r)).toHaveLength(1);
    });

    it('captures empty content as the empty string', () => {
      const r = BlissParser.parse('B313{}');
      expect(r.groups[0].text).toBe('');
      expect(textWarnings(r)).toHaveLength(1);
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

  describe('when the swallow is observed on the builder surface', () => {
    it('warns, renders the base, and drops the block from toString()', () => {
      const b = new BlissSVGBuilder('B291{hej}');
      expect(b.warnings.map((w) => w.code)).toContain('UNSUPPORTED_TEXT_BLOCKS');
      expect(b.svgCode).toContain('<path');
      expect(b.toString()).toBe('B291');
    });
  });

  describe('when {text} content contains brackets, braces, or other delimiters', () => {
    it.each([
      ['square brackets', 'H//C8{hello [world]}', 'hello [world]'],
      ['curly brackets', 'H//C8{hello {world}}', 'hello {world}'],
      ['mixed brackets', 'H//C8{hello [world] and {stuff}}', 'hello [world] and {stuff}'],
      ['delimiters', 'H//C8{text with []{}():;,/}', 'text with []{}():;,/']
    ])('preserves %s verbatim in {text} content', (description, input, expectedText) => {
      const result = BlissParser.parse(input);

      // With implicit space groups interleaved as [H, TSP, C8], C8 is at index 2.
      expect(result.groups[2].text).toBe(expectedText);
      expect(textWarnings(result)).toHaveLength(1);
    });
  });

  describe('when the {text} content contains nested braces', () => {
    it('counts the block once and preserves the nested characters', () => {
      const r = BlissParser.parse('B313{hello {world} and [stuff]}');
      expect(r.groups[0].text).toBe('hello {world} and [stuff]');
      // the greedy pre-pass captures the whole span as ONE tokenized block,
      // so the post-tokenization count sees one block, not two braces
      expect(textWarnings(r)).toHaveLength(1);
    });
  });

  describe('when a literal { sits inside a quoted option value', () => {
    // regression (Phase 2.2): the pre-move check counted raw `{` characters
    // BEFORE tokenization, so two quoted braces spuriously warned
    it.each([
      ['one quoted brace', '[data-t="a{b"]||B291'],
      ['two quoted braces', '[data-t="a{b{c"]||B291']
    ])('does not warn for %s', (description, input) => {
      const r = BlissParser.parse(input);
      expect(textWarnings(r)).toHaveLength(0);
    });
  });

  describe('when a single block sits mid-string instead of trailing', () => {
    it('warns instead of garbling silently', () => {
      // the block lands inside a glyph token (undefined interim parse);
      // the warning is the visibility witness
      const r = BlissParser.parse('B291{hej}/B313');
      expect(textWarnings(r)).toHaveLength(1);
    });
  });

  describe('when the input has multiple {...} blocks (interim limitation)', () => {
    it('emits a UNSUPPORTED_TEXT_BLOCKS warning when blocks live in different groups', () => {
      // The greedy regex eats from the first `{` to the last `}` and merges
      // across the `//`. The actual parse output is documented-as-undefined
      // until the tokenizer ships. When that lands, this test should flip
      // to asserting per-group text capture.
      const r = BlissParser.parse('B313{first}//B431{second}');
      expect(textWarnings(r)).toHaveLength(1);
    });

    it('emits a UNSUPPORTED_TEXT_BLOCKS warning when multiple blocks live in the same group', () => {
      const r = BlissParser.parse('H/B313{a}/B313{b}');
      const [warning] = textWarnings(r);
      expect(warning).toBeDefined();
      expect(warning.message).toMatch(/not supported/i);
    });

    it('captures the merged span between the first `{` and the last `}` when two blocks sit adjacent on one part', () => {
      // `B313{a}{b}` → the greedy regex captures from the first `{` to the
      // last `}`, producing `a}{b` as the text content. Pinning the interim
      // contract: content is preserved (the inner `}{` survives).
      const r = BlissParser.parse('B313{a}{b}');
      expect(r.groups[0].text).toBe('a}{b');
    });
  });
});
