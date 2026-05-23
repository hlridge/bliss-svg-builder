import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the parser input-preamble surface: the maximum input length
 * guard that fires before any parsing work, and the placeholder
 * restoration step that runs after the whitespace-stripping pre-pass
 * so bracket and text payloads survive intact.
 *
 * Covers:
 * - Maximum input length guard (10,000 characters): throws when the
 *   raw input string is longer than the documented ceiling; accepts
 *   input at exactly the 10,000-character boundary.
 * - Bracket placeholder restoration: bracketed payloads (e.g.
 *   `[color=red]`) round-trip through the whitespace pre-pass so
 *   downstream group-option parsing sees the original brackets.
 * - Multi-digit placeholder ids: the restoration regex accepts one
 *   or more digits, so the 11th (PLACEHOLDER_10) and later
 *   placeholders restore correctly, not just PLACEHOLDER_0..9.
 * - Text placeholder restoration: `{...}` payloads keep their
 *   original content (including nested `[]`) without leaking
 *   placeholder braces into the parsed group text.
 *
 * Does NOT cover:
 * - Group / global option prefix parsing (the `|` / `||` grammar),
 *   see `BlissParser.bracket-options.test.js`.
 * - Implicit space grouping (TSP insertion between groups), see
 *   `BlissParser.space-resolution.test.js`.
 */
describe('BlissParser input preamble', () => {
  describe('when the input string exceeds the maximum length guard', () => {
    it('rejects input strings longer than 10000 characters', () => {
      expect(() => BlissParser.parse('H'.repeat(10001)))
        .toThrow('Input string exceeds maximum length of 10,000 characters');
    });

    it('accepts input exactly at the 10000-character boundary', () => {
      const input = 'H/'.repeat(4999) + 'C8';
      expect(input.length).toBe(10_000);
      expect(() => BlissParser.parse(input)).not.toThrow();
    });
  });

  describe('when placeholders are restored after the whitespace pre-pass', () => {
    it('restores bracket placeholders before parsing group options', () => {
      // Pins restorePlaceholders returning the restored string rather than
      // the placeholder token used while whitespace is stripped.
      const r = BlissParser.parse('[color=red]|H');

      expect(r.groups[0].options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });

    it('restores placeholder ids with multiple digits', () => {
      // The eleventh bracketed option receives PLACEHOLDER_10. The restore
      // regex must accept one or more digits, not exactly one digit.
      const prefixedGlyphs = Array.from(
        { length: 10 },
        (_, i) => `[data-${i}=${i}]H`
      ).join('/');
      const r = BlissParser.parse(`${prefixedGlyphs}/[color=red]H`);

      expect(r.groups[0].glyphs[10].options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[10].parts[0].codeName).toBe('H');
    });

    it('preserves group text content without keeping placeholder braces', () => {
      const r = BlissParser.parse('H{hello [world]}');

      expect(r.groups[0].text).toBe('hello [world]');
      expect(r.groups[0].glyphs[0].parts[0].codeName).toBe('H');
    });
  });
});
