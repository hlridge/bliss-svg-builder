import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins how the `word-space` (and indirectly `char-space`) options shape
 * inter-word and inter-punctuation positioning, including the parser's
 * automatic punctuation detection (B1-B7) that halves the spacing.
 *
 * Spacing hierarchy:
 * - char-space: spacing between glyphs within a group (default: 2)
 * - word-space: spacing between normal groups (default: 8)
 * - Punctuation spacing: automatically half of word-space (default: 4)
 *
 * A word counts as punctuation when every character has
 * shrinksPrecedingWordSpace=true. The punctuation glyphs are B1-B7
 * (question mark, exclamation, period, comma, etc.).
 *
 * Covers:
 * - The `word-space` numeric range [0, 20] with clamping at both ends.
 * - Default values (word-space=8, char-space=2) and their effect on
 *   composition.children[].x coordinates.
 * - Automatic punctuation-space derivation as word-space / 2 for words
 *   built from B1-B7 glyphs.
 * - Combined punctuation-mark words (B1/B4, B6/B4, ...) inheriting the
 *   reduced spacing.
 * - Word/punctuation alternation patterns (B313//B5//B313 etc.) mixing
 *   word and punctuation spacing across a sequence.
 * - Cross-comparison invariants (punctuation spacing < word spacing,
 *   total-width difference with/without punctuation).
 * - RK (relative kerning) and AK (absolute kerning) markers applied
 *   between glyphs: zero-marker preserves default char-space; cascading
 *   RK/AK adjustments propagate per-glyph through multiple words; total
 *   composition width reflects the cumulative kerning effect.
 *
 * Does NOT cover:
 * - TSP/QSP space-glyph advance-width formulas, see
 *   `BlissSVGBuilder.space-glyphs.test.js`.
 * - Parser composition-children grouping for empty or space-only inputs,
 *   see `BlissSVGBuilder.space-grouping.test.js`.
 * - Parser-side kerning grammar (decimal forms, malformed fallthrough),
 *   see `BlissParser.kerning.test.js`. This file pins the rendered
 *   inter-character positions and total composition width that result
 *   from EXPLICIT RK / AK values (RK:0, AK:0, cascading values).
 * - Bare RK/AK markers (absent-marker semantics: no kerning applied, omitted
 *   from toString; a bare AK renders the default gap, not AK:0's collapsed
 *   gap), see `BlissSVGBuilder.kerning-markers.test.js`.
 */

describe('BlissSVGBuilder spacing', () => {
  describe('when word-space is set on multi-word inputs', () => {
    it('uses default spacing of 8 when no word-space option specified', () => {
      // Two Bliss words: default word-space=8
      // B313 (width=8), TSP space group, B291 (width=8)
      const builder = new BlissSVGBuilder('B313//B291');
      const comp = builder.composition;

      // Structure: [B313 group, TSP group, B291 group]
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(16); // B291: B313 width (8) + word spacing (8)
    });

    it('sets spacing to 0 when word-space=0', () => {
      const builder = new BlissSVGBuilder('[word-space=0]||B313//B291');
      const comp = builder.composition;

      // With word-space=0: TSP advanceWidth = 0 - 2 = -2
      // B313 advanceX = 8 + 2 = 10, TSP advanceX = -2, B291 at x = 10 + (-2) = 8
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(8);  // B291: words touching
    });

    it('sets wide spacing when word-space=15', () => {
      const builder = new BlissSVGBuilder('[word-space=15]||B313//B291');
      const comp = builder.composition;

      // With word-space=15: TSP advanceWidth = 15 - 2 = 13
      // B313 advanceX = 8 + 2 = 10, TSP advanceX = 13, B291 at x = 10 + 13 = 23
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(23); // B291: wide spacing
    });

    it('clamps word-space values below 0 to 0', () => {
      const builder = new BlissSVGBuilder('[word-space=-5]||B313//B291');
      const comp = builder.composition;

      // word-space clamped to 0: TSP advanceWidth = 0 - 2 = -2
      // B313 advanceX = 10, TSP advanceX = -2, B291 at x = 8
      expect(comp.children[2].x).toBe(8);
    });

    it('clamps word-space values above 20 to 20', () => {
      const builder = new BlissSVGBuilder('[word-space=25]||B313//B291');
      const comp = builder.composition;

      // word-space clamped to 20: TSP advanceWidth = 20 - 2 = 18
      // B313 advanceX = 10, TSP advanceX = 18, B291 at x = 28
      expect(comp.children[2].x).toBe(28);
    });

    it('affects total width of multiple words', () => {
      const defaultBuilder = new BlissSVGBuilder('B313//B313//B313');
      const wideBuilder = new BlissSVGBuilder('[word-space=12]||B313//B313//B313');
      const narrowBuilder = new BlissSVGBuilder('[word-space=2]||B313//B313//B313');

      // B313 width = 8, so with 3 words:
      // Default (word-space=8): 8 + 8 + 8 + 8 + 8 = 40
      // Wide (word-space=12): 8 + 12 + 8 + 12 + 8 = 48
      // Narrow (word-space=2): 8 + 2 + 8 + 2 + 8 = 28
      expect(defaultBuilder.composition.width).toBe(40);
      expect(wideBuilder.composition.width).toBe(48);
      expect(narrowBuilder.composition.width).toBe(28);
    });

    it('does not affect single word width', () => {
      const defaultBuilder = new BlissSVGBuilder('B313');
      const spacedBuilder = new BlissSVGBuilder('[word-space=15]||B313');

      // Single word should be 8 wide regardless of word spacing
      expect(defaultBuilder.composition.width).toBe(8);
      expect(spacedBuilder.composition.width).toBe(8);
    });
  });

  describe('when a single punctuation glyph follows a word', () => {
    it('uses default punctuation spacing of 4 when period follows a word', () => {
      // B313 (width=8), QSP space group, B4 (punctuation period, width=0)
      const builder = new BlissSVGBuilder('B313//B4');
      const comp = builder.composition;

      // Structure: [B313 group, QSP group, B4 group]
      // QSP advanceWidth = 4 - 2 = 2
      // B313 advanceX = 10, QSP advanceX = 2, B4 at x = 12
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B4: punctuation spacing (4)
    });

    it('uses punctuation spacing for comma (B5)', () => {
      const builder = new BlissSVGBuilder('B313//B5');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B5: punctuation spacing (4)
    });

    it('uses punctuation spacing for question mark (B1)', () => {
      const builder = new BlissSVGBuilder('B291//B1');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B1: punctuation spacing (4)
    });

    it('uses punctuation spacing for exclamation mark (B2)', () => {
      const builder = new BlissSVGBuilder('B291//B2');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B2: punctuation spacing (4)
    });

    it('uses punctuation spacing for interrobang-like combination (B3)', () => {
      const builder = new BlissSVGBuilder('B291//B3');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B3: punctuation spacing (4)
    });

    it('uses punctuation spacing for colon-like combination (B6)', () => {
      const builder = new BlissSVGBuilder('B313//B6');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B6: punctuation spacing (4)
    });

    it('uses punctuation spacing for mid-height comma (B7)', () => {
      const builder = new BlissSVGBuilder('B313//B7');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B7: punctuation spacing (4)
    });
  });

  describe('when multiple punctuation marks combine in a word', () => {
    it('applies punctuation spacing to a B4/B5 combined-punctuation word', () => {
      const builder = new BlissSVGBuilder('B313//B4/B5');
      const comp = builder.composition;

      // Structure: [B313 group, QSP group, B4/B5 group]
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B4/B5: punctuation spacing (4)
    });

    it('applies punctuation spacing to a B1/B4 combined-punctuation word', () => {
      const builder = new BlissSVGBuilder('B291//B1/B4');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B1/B4: punctuation spacing (4)
    });

    it('applies punctuation spacing to a three-mark B1/B4/B5 word', () => {
      const builder = new BlissSVGBuilder('B313//B1/B4/B5');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B1/B4/B5: punctuation spacing (4)
    });

    it('applies punctuation spacing to a B6/B4 colon-period combination', () => {
      const builder = new BlissSVGBuilder('B291//B6/B4');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B6/B4: punctuation spacing (4)
    });
  });

  describe('when words and punctuation alternate in a sequence', () => {
    it('inserts word spacing after punctuation when followed by another word', () => {
      // B291, B5 (comma), B291
      // Structure: [B291, QSP, B5, TSP, B291] (5 groups)
      const builder = new BlissSVGBuilder('B291//B5//B291');
      const comp = builder.composition;

      // B291 advanceX = 10, QSP advanceX = 2, B5 at x = 12
      // B5 advanceX = 2 (0 + charSpace), TSP advanceX = 6, B291 at x = 12 + 2 + 6 = 20
      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(12); // B5 (punctuation)
      expect(comp.children[4].x).toBe(20); // B291: after punctuation with word spacing
    });

    it('alternates word and punctuation spacing across B313//B4//B313//B5//B313', () => {
      // B313, B4, B313, B5, B313
      // Structure: [B313, QSP, B4, TSP, B313, QSP, B5, TSP, B313] (9 groups)
      const builder = new BlissSVGBuilder('B313//B4//B313//B5//B313');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(12); // B4 (punctuation spacing 4)
      expect(comp.children[4].x).toBe(20); // B313 (B4 at 12, advanceX=2, TSP=6)
      expect(comp.children[6].x).toBe(32); // B5 (B313 at 20, advanceX=10, QSP=2)
      expect(comp.children[8].x).toBe(40); // B313 (B5 at 32, advanceX=2, TSP=6)
    });

    it('closes a B313//B291//B4 sentence with punctuation spacing on B4', () => {
      // B313, B291, B4
      // Structure: [B313, TSP, B291, QSP, B4] (5 groups)
      const builder = new BlissSVGBuilder('B313//B291//B4');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(16); // B291 (word spacing 8)
      expect(comp.children[4].x).toBe(28); // B4 (punctuation spacing 4)
    });

    it('spaces a B313//B291//B5//B313//B4 sentence with both word and punctuation spacing', () => {
      // B313, B291, B5, B313, B4
      // Structure: [B313, TSP, B291, QSP, B5, TSP, B313, QSP, B4] (9 groups)
      const builder = new BlissSVGBuilder('B313//B291//B5//B313//B4');
      const comp = builder.composition;

      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(16); // B291 (word spacing 8)
      expect(comp.children[4].x).toBe(28); // B5 (punctuation spacing 4)
      expect(comp.children[6].x).toBe(36); // B313 (word spacing 8)
      expect(comp.children[8].x).toBe(48); // B4 (punctuation spacing 4)
    });
  });

  describe('when word-space is overridden (punctuation-space derives from it)', () => {
    it('uses word-space=4 to get punctuation-space of 2', () => {
      const builder = new BlissSVGBuilder('[word-space=4]||B313//B4');
      const comp = builder.composition;

      // Structure: [B313 group, QSP group, B4 group]
      // word-space=4: punctuation-space = 4/2 = 2, QSP advanceWidth = 2 - 2 = 0
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(10); // B4: B313 width (8) + punctuation spacing (2)
    });

    it('uses word-space=0 for no spacing before punctuation', () => {
      const builder = new BlissSVGBuilder('[word-space=0]||B313//B4');
      const comp = builder.composition;

      // word-space=0: punctuation-space = 0/2 = 0, QSP advanceWidth = 0 - 2 = -2
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(8);  // B4: words touching
    });

    it('uses word-space=20 for wide punctuation spacing', () => {
      const builder = new BlissSVGBuilder('[word-space=20]||B313//B4');
      const comp = builder.composition;

      // word-space=20: punctuation-space = 20/2 = 10, QSP advanceWidth = 10 - 2 = 8
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(18); // B4: wide punctuation spacing (10)
    });

    it('applies proportional punctuation spacing in word-punctuation-word pattern', () => {
      const builder = new BlissSVGBuilder('[word-space=2]||B291//B5//B291');
      const comp = builder.composition;

      // Structure: [B291, QSP, B5, TSP, B291]
      // word-space=2: punctuation-space = 2/2 = 1, QSP advanceWidth = 1 - 2 = -1
      // word-space=2: TSP advanceWidth = 2 - 2 = 0
      expect(comp.children[0].x).toBe(0);  // B291
      expect(comp.children[2].x).toBe(9);  // B5: B291 width (8) + punctuation spacing (1)
      expect(comp.children[4].x).toBe(11); // B291: B5 x (9) + B5 advanceX (2) + TSP (0)
    });
  });

  describe('when comparing word-space and punctuation-space behavior', () => {
    it('punctuation spacing is less than word spacing by default', () => {
      const normalBuilder = new BlissSVGBuilder('B313//B313');
      const punctuationBuilder = new BlissSVGBuilder('B313//B4');

      // Structure: [B313, TSP/QSP, B313/B4]
      const normalWord2 = normalBuilder.composition.children[2];
      const punctuationWord2 = punctuationBuilder.composition.children[2];

      // Normal word spacing (8) should be greater than punctuation spacing (4)
      expect(normalWord2.x).toBe(16); // 8 + 8
      expect(punctuationWord2.x).toBe(12); // 8 + 4
      expect(normalWord2.x).toBeGreaterThan(punctuationWord2.x);
    });

    it('total width differs between sentences with and without punctuation', () => {
      // Two words with normal spacing
      const normalBuilder = new BlissSVGBuilder('B313//B313');
      // Two words where second is punctuation
      const punctuationBuilder = new BlissSVGBuilder('B313//B4');

      // Normal: 8 + 8 + 8 = 24
      // Punctuation: 8 + 4 + 0 = 12
      expect(normalBuilder.composition.width).toBe(24);
      expect(punctuationBuilder.composition.width).toBe(12);
    });

    it('different punctuation marks all use punctuation-space consistently', () => {
      const builder1 = new BlissSVGBuilder('B313//B1'); // question mark
      const builder2 = new BlissSVGBuilder('B313//B2'); // exclamation
      const builder3 = new BlissSVGBuilder('B313//B4'); // period
      const builder4 = new BlissSVGBuilder('B313//B5'); // comma

      // All should use same punctuation spacing (4) - group at index 2
      expect(builder1.composition.children[2].x).toBe(12);
      expect(builder2.composition.children[2].x).toBe(12);
      expect(builder3.composition.children[2].x).toBe(12);
      expect(builder4.composition.children[2].x).toBe(12);
    });

    it('very tight spacing configuration (word-space and char-space at minimum)', () => {
      const builder = new BlissSVGBuilder('[word-space=0;char-space=0]||B313//B291//B5//B313');
      const comp = builder.composition;

      // Structure: [B313, TSP, B291, QSP, B5, TSP, B313]
      // word-space=0, char-space=0: TSP = 0-0 = 0, QSP = 0/2-0 = 0
      // advanceX = baseWidth + 0
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(8);  // B291: B313 advanceX (8) + TSP (0)
      expect(comp.children[4].x).toBe(16); // B5: B291 advanceX (8) + QSP (0)
      expect(comp.children[6].x).toBe(16); // B313: B5 advanceX (0) + TSP (0)
    });

    it('very wide spacing configuration (word-space at maximum, char-space wide)', () => {
      const builder = new BlissSVGBuilder('[word-space=20;char-space=3]||B313//B291//B5');
      const comp = builder.composition;

      // Structure: [B313, TSP, B291, QSP, B5]
      // word-space=20, char-space=3: TSP = 20-3 = 17, QSP = 20/2-3 = 7
      // advanceX = baseWidth + 3
      expect(comp.children[0].x).toBe(0);  // B313
      expect(comp.children[2].x).toBe(28); // B291: B313 advanceX (11) + TSP (17)
      expect(comp.children[4].x).toBe(46); // B5: B291 advanceX (11) + QSP (7)
    });
  });

  describe('when relative kerning (RK) adjusts inter-character spacing', () => {
    it('leaves the default spacing unchanged when RK:0 is applied (B291/RK:0/B291)', () => {
      const comp = new BlissSVGBuilder('B291/RK:0/B291').composition;
      const word = comp.children[0];

      // B291 width 8, default char-space 2, RK:0 adds 0; second B291 at x=10
      expect(word.children[0].x).toBe(0);
      expect(word.children[1].x).toBe(10);
    });

    it('applies cascading RK adjustments across multiple characters and three words', () => {
      const comp = new BlissSVGBuilder(
        'B291/RK:-1/B291/RK:1/B291//B291/RK:-1/B291/RK:1/B292//B291/RK:-1/B291/RK:1/B291'
      ).composition;

      // Structure: [word1, TSP, word2, TSP, word3]
      const [word1, , word2, , word3] = comp.children;

      // Top-level word positions
      expect(word1.x).toBe(0);
      expect(word2.x).toBe(36);
      expect(word3.x).toBe(72);

      // Within each word: 3 characters with cascading RK adjustments
      for (const word of [word1, word2, word3]) {
        expect(word.children[0].x).toBe(0);
        expect(word.children[1].x).toBe(9);
        expect(word.children[2].x).toBe(20);
      }

      // Total rendered width
      expect(comp.width).toBe(100);
    });
  });

  describe('when absolute kerning (AK) sets explicit inter-character spacing', () => {
    it('produces zero spacing between characters when AK:0 is applied (B291/AK:0/B291)', () => {
      const comp = new BlissSVGBuilder('B291/AK:0/B291').composition;
      const word = comp.children[0];

      // AK:0 overrides default char-space; second B291 starts immediately after first
      expect(word.children[0].x).toBe(0);
      expect(word.children[1].x).toBe(8);
    });

    it('applies cascading AK adjustments across multiple characters and three words', () => {
      const comp = new BlissSVGBuilder(
        'B291/AK:7/B291/AK:9/B291//B291/AK:7/B291/AK:9/B292//B291/AK:7/B291/AK:9/B291'
      ).composition;

      // Structure: [word1, TSP, word2, TSP, word3]
      const [word1, , word2, , word3] = comp.children;

      // Top-level word positions
      expect(word1.x).toBe(0);
      expect(word2.x).toBe(48);
      expect(word3.x).toBe(96);

      // Within each word: 3 characters with cascading AK adjustments
      for (const word of [word1, word2, word3]) {
        expect(word.children[0].x).toBe(0);
        expect(word.children[1].x).toBe(15); // 0 + 8 (B291 width) + 7 (AK)
        expect(word.children[2].x).toBe(32); // 15 + 8 + 9 (AK)
      }

      // Total rendered width: 40 (word1) + 8 (spacing) + 40 (word2) + 8 (spacing) + 40 (word3) = 136
      expect(comp.width).toBe(136);
    });
  });
});
