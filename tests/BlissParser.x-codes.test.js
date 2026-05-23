import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the parser X-code handling surface: multi-character Xword
 * expansion into per-character X-codes, semicolon-adjacency
 * boundary rules that suppress expansion, and the WORD_AS_PART
 * error emitted when multi-character X-text is used in a ;-part
 * position.
 *
 * Covers:
 * - Multi-character Xword expansion into per-character X-codes
 *   when every character has built-in path data.
 * - Fallback to XTXT_word when any character of the Xword lacks
 *   path data (e.g. Greek alpha).
 * - Semicolon-adjacency suppression: an Xword preceded or followed
 *   by ; (composition boundary) is preserved as a single literal
 *   part rather than expanded.
 * - Non-semicolon adjacency: an Xword preceded or followed by /
 *   (glyph boundary, not composition) is expanded normally.
 * - WORD_AS_PART error: multi-character X-text used as a ;-part
 *   carries the documented `errorCode` and message.
 *
 * Does NOT cover:
 * - XTXT_ fallback metadata propagation (isExternalGlyph / char
 *   fields on the expanded glyph), see
 *   `BlissParser.definition-expansion.test.js`.
 * - Single-character X-codes (`Xh` etc.) outside the Xword
 *   expansion path, see `BlissParser.internal-mechanics.test.js`.
 */
describe('BlissParser X-codes', () => {
  describe('when Xword has path data for every character', () => {
    it('expands Xhello into per-character X-codes', () => {
      const result = BlissParser.parse('Xhello');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName))
        .toEqual(['Xh', 'Xe', 'Xl', 'Xl', 'Xo']);
    });
  });

  describe('when Xword contains a character lacking path data', () => {
    it('falls back to XTXT_word for the whole word', () => {
      // Greek alpha (α) has no built-in path; the whole word becomes XTXT_.
      const result = BlissParser.parse('Xhαllo');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('XTXT_hαllo');
    });
  });

  describe('when Xword is adjacent to ; (composition boundary)', () => {
    it('does not expand Xword preceded by ;', () => {
      // B81;Xhello: original keeps Xhello literal as one glyph's part.
      // If "before" check is broken, Xhello expands into Xh/Xe/Xl/Xl/Xo,
      // splitting the single glyph across multiple glyphs.
      const result = BlissParser.parse('B81;Xhello');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['B81', 'Xhello']);
    });

    it('does not expand Xword followed by ;', () => {
      const result = BlissParser.parse('Xhello;B81');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['Xhello', 'B81']);
    });
  });

  describe('when Xword is adjacent to / (glyph boundary, not composition)', () => {
    it('expands Xword preceded by /', () => {
      // Distinguishes "before is true at offset>0" (mutant: || makes it always
      // true mid-string) from the actual && requirement that prev char === ;.
      const result = BlissParser.parse('B81/Xhello');
      expect(result.groups[0].glyphs.length).toBe(6);
    });

    it('expands Xword followed by /', () => {
      const result = BlissParser.parse('Xhello/B81');
      expect(result.groups[0].glyphs.length).toBe(6);
    });
  });

  describe('when multi-character X-text is used as a ;-part', () => {
    it('flags the part with a WORD_AS_PART error and a descriptive message', () => {
      // kills 2488 (cond → false), 2491 ({2,} → {}), 2492 (char-class flip),
      // 2493 (block → empty), 2494 (template literal → empty),
      // 2495 (slice(1) → codeName), 2496 ('WORD_AS_PART' → '').
      const r = BlissParser.parse('B291;Xab');
      const part = r.groups[0].glyphs[0].parts[1];
      expect(part.error).toBe('Multi-character text "ab" is a word and cannot be composed with ;');
      expect(part.errorCode).toBe('WORD_AS_PART');
    });
  });
});
