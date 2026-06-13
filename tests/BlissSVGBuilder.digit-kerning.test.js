import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins digit kerning: regular digits (B9–B18) and small digits (B19–B28)
 * receive a -1 kerning offset between same-type adjacent glyphs in the same
 * word, yielding effective adjacent-digit spacing of 1 unit instead of the
 * default char-space of 2.
 *
 * Covers:
 * - Regular-digit (B9–B18) adjacency inside a word: -1 offset between two,
 *   three, and full-range sequences.
 * - Small-digit (B19–B28) adjacency inside a word: -1 offset between two,
 *   three, and full-range sequences.
 * - Suppression of digit kerning across a digit↔non-digit boundary.
 * - Suppression of digit kerning across a word boundary (//).
 * - Suppression of digit kerning across the regular↔small-digit boundary.
 * - Custom char-space pass-through: the -1 offset stacks on a user-supplied
 *   `[char-space=N]` option without altering the offset itself.
 * - Total composition width reflects the offset on every kerned gap.
 *
 * Does NOT cover:
 * - Effect of digit kerning on rendered SVG paths or stroke positions, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 * - Parser-level acceptance of digit codes themselves, see
 *   `BlissParser.internal-mechanics.test.js`.
 * - User-supplied RK / AK kerning markers on non-digit glyphs, see
 *   `BlissParser.kerning.test.js`.
 * - Suppression across the small-digit↔non-digit boundary as a standalone
 *   case at part-of-word level (covered indirectly inside the mixed-sequence
 *   test).
 */

describe('BlissSVGBuilder digit kerning', () => {
  describe('when regular digits (B9–B18) appear in a word', () => {
    it('applies a -1 kerning offset between two adjacent digits', () => {
      // B9 (width=2), B10 (width=2)
      // Default char-space=2, but with kerning=-1, effective spacing=1
      const builder = new BlissSVGBuilder('B9/B10');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B10

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(3); // B9 width (2) + char-space (2) + kerning (-1) = 3
    });

    it('applies the -1 kerning offset between three adjacent digits', () => {
      // B9, B11, B12 - all adjacent digits
      const builder = new BlissSVGBuilder('B9/B11/B12');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B11
      const char3 = word.children[2]; // B12

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(3); // B9 width (2) + spacing (2) - kerning (1) = 3
      expect(char3.x).toBe(6); // char2.x (3) + B11 width (2) + spacing (2) - kerning (1) = 6
    });

    it('applies the offset across all ten regular-digit combinations (B9–B18)', () => {
      // Test a sequence with different digits
      const builder = new BlissSVGBuilder('B9/B10/B11/B12/B13/B14/B15/B16/B17/B18');
      const comp = builder.composition;

      const word = comp.children[0];
      const digits = word.children;

      // Each digit should be spaced with kerning
      for (let i = 1; i < digits.length; i++) {
        const prevDigit = digits[i - 1];
        const currDigit = digits[i];
        const expectedX = prevDigit.x + prevDigit.width + 1; // char-space (2) - kerning (1)
        expect(currDigit.x).toBe(expectedX);
      }
    });

    it('does not apply kerning between a digit and a non-digit', () => {
      // B9 (digit), B313 (non-digit)
      const builder = new BlissSVGBuilder('B9/B313');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B313

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(4); // B9 width (2) + full char-space (2), no kerning
    });

    it('does not apply kerning across word boundaries', () => {
      // Two separate words, each with a digit
      // Structure: [B9 group, TSP group, B10 group]
      const builder = new BlissSVGBuilder('B9//B10');
      const comp = builder.composition;

      const word1 = comp.children[0]; // B9 word
      const word2 = comp.children[2]; // B10 word (index 2, skipping TSP)
      const char1 = word1.children[0]; // B9 in first word
      const char2 = word2.children[0]; // B10 in second word

      // No kerning across words - only word spacing applies
      expect(word2.x).toBe(10); // B9 width (2) + word-space (8)
    });

    it('stacks the -1 offset on a custom char-space without altering it', () => {
      // Custom char-space=4, kerning should still be -1
      const builder = new BlissSVGBuilder('[char-space=4]||B9/B10/B11');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B10
      const char3 = word.children[2]; // B11

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(5); // B9 width (2) + char-space (4) - kerning (1) = 5
      expect(char3.x).toBe(10); // char2.x (5) + B10 width (2) + char-space (4) - kerning (1) = 10
    });
  });

  describe('when small digits (B19–B28) appear in a word', () => {
    it('applies a -1 kerning offset between two adjacent small digits', () => {
      // B19 (width=1), B20 (width=1)
      // Default char-space=2, but with kerning=-1, effective spacing=1
      const builder = new BlissSVGBuilder('B19/B20');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B19
      const char2 = word.children[1]; // B20

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(2); // B19 width (1) + char-space (2) - kerning (1) = 2
    });

    it('applies the -1 kerning offset between three adjacent small digits', () => {
      // B19, B21, B22 - all adjacent small digits
      const builder = new BlissSVGBuilder('B19/B21/B22');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B19
      const char2 = word.children[1]; // B21
      const char3 = word.children[2]; // B22

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(2); // B19 width (1) + spacing (2) - kerning (1) = 2
      expect(char3.x).toBe(4); // char2.x (2) + B21 width (1) + spacing (2) - kerning (1) = 4
    });

    it('applies the offset across all ten small-digit combinations (B19–B28)', () => {
      // Test a sequence with different small digits
      const builder = new BlissSVGBuilder('B19/B20/B21/B22/B23/B24/B25/B26/B27/B28');
      const comp = builder.composition;

      const word = comp.children[0];
      const digits = word.children;

      // Each small digit should be spaced with kerning
      for (let i = 1; i < digits.length; i++) {
        const prevDigit = digits[i - 1];
        const currDigit = digits[i];
        const expectedX = prevDigit.x + prevDigit.width + 1; // char-space (2) - kerning (1)
        expect(currDigit.x).toBe(expectedX);
      }
    });

    it('does not apply kerning between a small digit and a non-digit', () => {
      // B19 (small digit), B313 (non-digit)
      const builder = new BlissSVGBuilder('B19/B313');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B19
      const char2 = word.children[1]; // B313

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(3); // B19 width (1) + full char-space (2), no kerning
    });

    it('does not apply kerning across word boundaries', () => {
      // Two separate small-digit words; only word spacing applies, no kerning.
      const builder = new BlissSVGBuilder('B19//B20');
      const comp = builder.composition;

      const word2 = comp.children[2]; // B20 word (index 2, skipping TSP)

      expect(word2.x).toBe(9); // B19 width (1) + word-space (8)
    });

    it('stacks the -1 offset on a custom char-space without altering it', () => {
      // Custom char-space=5, kerning should still be -1
      const builder = new BlissSVGBuilder('[char-space=5]||B19/B20/B21');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B19
      const char2 = word.children[1]; // B20
      const char3 = word.children[2]; // B21

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(5); // B19 width (1) + char-space (5) - kerning (1) = 5
      expect(char3.x).toBe(10); // char2.x (5) + B20 width (1) + char-space (5) - kerning (1) = 10
    });
  });

  describe('when regular and small digits are mixed in a word', () => {
    it('does not apply kerning between a regular digit and a small digit', () => {
      // B9 (regular digit), B19 (small digit)
      const builder = new BlissSVGBuilder('B9/B19');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B19

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(4); // B9 width (2) + full char-space (2), no kerning
    });

    it('does not apply kerning between a small digit and a regular digit', () => {
      // B19 (small digit), B9 (regular digit)
      const builder = new BlissSVGBuilder('B19/B9');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B19
      const char2 = word.children[1]; // B9

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(3); // B19 width (1) + full char-space (2), no kerning
    });

    it('kerns same-type runs separately when interrupted by a non-digit', () => {
      // Regular digits kerned together, then non-digit, then small digits kerned together
      const builder = new BlissSVGBuilder('B9/B10/B313/B19/B20');
      const comp = builder.composition;

      const word = comp.children[0];
      const char1 = word.children[0]; // B9
      const char2 = word.children[1]; // B10 (kerned with B9)
      const char3 = word.children[2]; // B313 (no kerning)
      const char4 = word.children[3]; // B19 (no kerning with B313)
      const char5 = word.children[4]; // B20 (kerned with B19)

      expect(char1.x).toBe(0);
      expect(char2.x).toBe(3); // B9 width (2) + char-space (2) - kerning (1)
      expect(char3.x).toBe(7); // char2.x (3) + B10 width (2) + char-space (2), no kerning
      expect(char4.x).toBe(17); // char3.x (7) + B313 width (8) + char-space (2), no kerning
      expect(char5.x).toBe(19); // char4.x (17) + B19 width (1) + char-space (2) - kerning (1)
    });
  });

  describe('when computing the composition total width with digit kerning', () => {
    it('subtracts one unit per kerned gap in a regular-digit run', () => {
      // 5 regular digits (B9-B13), each width=2
      // Without kerning: 5 * 2 + 4 * 2 = 18
      // With kerning (-1 for each gap): 18 - 4 = 14
      const builder = new BlissSVGBuilder('B9/B10/B11/B12/B13');
      const comp = builder.composition;

      expect(comp.width).toBe(14);
    });

    it('subtracts one unit per kerned gap in a small-digit run', () => {
      // 5 small digits (B19-B23), each width=1
      // Without kerning: 5 * 1 + 4 * 2 = 13
      // With kerning (-1 for each gap): 13 - 4 = 9
      const builder = new BlissSVGBuilder('B19/B20/B21/B22/B23');
      const comp = builder.composition;

      expect(comp.width).toBe(9);
    });

    it('subtracts one unit only on same-type kerned gaps in a mixed sequence', () => {
      // B9, B10 (kerned), B313 (no kern), B19, B20 (kerned)
      // B9 (2) + spacing (1 with kern) + B10 (2) + spacing (2 no kern) + B313 (8) + spacing (2 no kern) + B19 (1) + spacing (1 with kern) + B20 (1)
      // = 2 + 1 + 2 + 2 + 8 + 2 + 1 + 1 + 1 = 20
      const builder = new BlissSVGBuilder('B9/B10/B313/B19/B20');
      const comp = builder.composition;

      expect(comp.width).toBe(20);
    });
  });
});
