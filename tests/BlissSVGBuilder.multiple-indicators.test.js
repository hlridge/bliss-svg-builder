/**
 * Pins indicator-positioning math for characters with multiple indicators
 * stacked horizontally above the base glyph anchor.
 *
 * Covers:
 * - Two- and three-indicator x-positioning (centered group, equal y).
 * - Backwards-compatible single-indicator centering (B291;B99 -> x=3).
 * - Width getters: baseGlyphWidth excludes indicators; rightExtendedGlyphWidth
 *   includes overhang when indicators extend right of the glyph.
 * - anchorOffsetX shifting (B84/B85) for both single and grouped indicators.
 * - Left overhang at sequence start (B428;B99;B97 with zero-width base).
 * - Irregular patterns: bare base (B291), empty slot (B291;), all-indicator
 *   composite (B98), composite base with indicator (B291;H:0,4;B99), and
 *   non-indicator-after-indicator (B291;B99;H).
 * - Different-width indicator combinations (B291;B99;B84, B291;B84;B99).
 * - Width-getter caching consistency across repeated reads.
 * - Indicator overhang across word boundaries (B428;B99//B428;B97).
 *
 * Does NOT cover:
 * - SVG output of positioned indicators, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 * - isIndicator detection contract, see
 *   `ElementHandle.indicator-api.test.js` and
 *   `ElementHandle.apply-indicators.test.js`.
 * - Default-mode element-height invariants, see
 *   `BlissSVGBuilder.character-height.test.js` and
 *   `BlissSVGBuilder.element-bounds.test.js`.
 *
 * Positioning algorithm pinned by these tests:
 *   totalIndicatorWidth = sum(widths) + (n - 1) * 1
 *   anchorX            = glyphCenter + anchorOffsetX
 *   firstIndicator.x   = anchorX - totalIndicatorWidth / 2
 *   nextIndicator.x    = prevIndicator.x + prevIndicator.width + 1
 */

import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissElement } from '../src/lib/bliss-element.js';

const getCharacter = (code) => {
  const renderStructure = BlissParser.parse(code);
  const element = new BlissElement(renderStructure);
  const word = element.children[0];
  return word.children[0];
};

describe('BlissSVGBuilder multiple indicators', () => {

  describe('when positioning two indicators side-by-side', () => {
    // B291 (Enclosure): width 8, center 4
    // Indicators B99, B97: width 2 each
    // totalIndicatorWidth = 2 + 1 + 2 = 5
    // firstIndicator.x  = 4 - 5/2 = 1.5
    // secondIndicator.x = 1.5 + 2 + 1 = 4.5
    it('centers the indicator group on a width-8 enclosure base', () => {
      const character = getCharacter("B291;B99;B97");

      expect(character.children.length).toBe(3);

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(1.5);
      expect(secondIndicator.x).toBe(4.5);
    });

    it('places both indicators at the same y level', () => {
      const character = getCharacter("B291;B99;B97");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.y).toBe(secondIndicator.y);
      expect(firstIndicator.y).toBe(0); // default indicator y for standard-height glyph
    });

    // B428 (Line): width 0, center 0
    // firstIndicator.x  = 0 - 5/2 = -2.5
    // secondIndicator.x = -2.5 + 2 + 1 = 0.5
    it('centers the indicator group on a zero-width line base', () => {
      const character = getCharacter("B428;B99;B97");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(-2.5);
      expect(secondIndicator.x).toBe(0.5);
    });
  });

  describe('when positioning three indicators side-by-side', () => {
    // B291: width 8, center 4
    // Indicators B99, B97, B81: width 2 each
    // totalIndicatorWidth = 2 + 1 + 2 + 1 + 2 = 8
    // firstIndicator.x  = 4 - 8/2 = 0
    // secondIndicator.x = 0 + 2 + 1 = 3
    // thirdIndicator.x  = 3 + 2 + 1 = 6
    it('centers the three-indicator group on a width-8 enclosure base', () => {
      const character = getCharacter("B291;B99;B97;B81");

      expect(character.children.length).toBe(4);

      const indicators = [
        character.children[1],
        character.children[2],
        character.children[3]
      ];

      expect(indicators[0].x).toBe(0);
      expect(indicators[1].x).toBe(3);
      expect(indicators[2].x).toBe(6);
    });

    it('places all three indicators at the same y level', () => {
      const character = getCharacter("B291;B99;B97;B81");

      const indicators = [
        character.children[1],
        character.children[2],
        character.children[3]
      ];

      expect(indicators[0].y).toBe(indicators[1].y);
      expect(indicators[1].y).toBe(indicators[2].y);
    });
  });

  describe('when only a single indicator is attached (backwards compatible)', () => {
    // B291;B99 -> indicator at x = 3 (width 8, center 4, indicator width 2)
    it('centers a single indicator at x=3 over a width-8 enclosure base', () => {
      const character = getCharacter("B291;B99");

      expect(character.children.length).toBe(2);

      const indicator = character.children[1];
      expect(indicator.x).toBe(3);
    });
  });

  describe('when computing width getters with multiple indicators', () => {
    it('expands character width to include indicator overhang on a zero-width base', () => {
      // B428 (Line) has width 0
      // Two indicators at x = -2.5 and x = 0.5, each width 2
      // Character extent: -2.5 to 2.5, total width = 5
      const character = getCharacter("B428;B99;B97");

      expect(character.width).toBeGreaterThanOrEqual(5);
    });

    it('reports baseGlyphWidth as the glyph width without indicators', () => {
      const character = getCharacter("B291;B99;B97");

      expect(character.baseGlyphWidth).toBe(8);
    });

    it('excludes all indicators from baseGlyphWidth, not just the last one', () => {
      // B291 width 8; baseGlyphWidth must stay 8 regardless of indicator count.
      const character = getCharacter("B291;B99;B97");
      expect(character.baseGlyphWidth).toBe(8);

      const character3 = getCharacter("B291;B99;B97;B81");
      expect(character3.baseGlyphWidth).toBe(8);
    });

    it('reports rightExtendedGlyphWidth as max(glyphRightEdge, indicatorRightEdge)', () => {
      // B291 width 8; indicators B99 (w=2) at x=1.5 and B97 (w=2) at x=4.5
      // glyph extent 0..8; indicator extent 1.5..6.5
      // rightExtendedGlyphWidth = max(8, 6.5) - 0 = 8
      const character = getCharacter("B291;B99;B97");

      expect(character.rightExtendedGlyphWidth).toBe(8);
    });
  });

  describe('when indicators carry anchorOffsetX (B84, B85)', () => {
    // B84: width 3, anchorOffsetX -0.5 (anchor 0.5 left of center)
    // B85: width 3, anchorOffsetX +0.5 (anchor 0.5 right of center)
    // For grouped indicators we want a 1-unit visual gap between edges
    // regardless of anchorOffsetX.

    it('places B84 then B85 with a 1-unit visual gap between them', () => {
      // B291: width 8, center 4
      // totalIndicatorWidth = 3 + 1 + 3 = 7
      // firstIndicator.x  = 4 - 7/2 = 0.5
      // secondIndicator.x = 0.5 + 3 + 1 = 4.5
      const character = getCharacter("B291;B84;B85");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(0.5);
      expect(secondIndicator.x).toBe(4.5);

      const firstRightEdge = firstIndicator.x + firstIndicator.width;
      expect(secondIndicator.x - firstRightEdge).toBe(1);
    });

    it('places B85 then B84 (reversed order) with a 1-unit visual gap', () => {
      const character = getCharacter("B291;B85;B84");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(0.5);
      expect(secondIndicator.x).toBe(4.5);

      const firstRightEdge = firstIndicator.x + firstIndicator.width;
      expect(secondIndicator.x - firstRightEdge).toBe(1);
    });

    it('aligns a single B84 anchor with the glyph anchor', () => {
      // B291: width 8, center 4
      // B84: width 3, anchorOffsetX -0.5
      // visualCenter = 4 - 3/2 = 2.5; shift by -anchorOffsetX = +0.5
      // x = 2.5 + 0.5 = 3.0
      const character = getCharacter("B291;B84");
      const indicator = character.children[1];

      expect(indicator.x).toBe(3);
    });

    it('aligns a single B85 anchor with the glyph anchor', () => {
      // B291: width 8, center 4
      // B85: width 3, anchorOffsetX +0.5
      // visualCenter = 4 - 3/2 = 2.5; shift by -anchorOffsetX = -0.5
      // x = 2.5 - 0.5 = 2.0
      const character = getCharacter("B291;B85");
      const indicator = character.children[1];

      expect(indicator.x).toBe(2);
    });

    it('shifts the group right when the last indicator has negative anchorOffsetX (B291;B97;B84)', () => {
      // B291: width 8, center 4
      // B97: width 2, anchorOffsetX 0
      // B84: width 3, anchorOffsetX -0.5
      //
      // Without anchor shift:
      //   totalWidth        = 2 + 1 + 3 = 6
      //   firstIndicator.x  = 4 - 6/2 = 1
      //   secondIndicator.x = 1 + 2 + 1 = 4
      //
      // With anchor shift = -(first.anchorOffsetX + last.anchorOffsetX) = -(0 + -0.5) = +0.5
      //   firstIndicator.x  = 1 + 0.5 = 1.5
      //   secondIndicator.x = 4 + 0.5 = 4.5
      const character = getCharacter("B291;B97;B84");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(1.5);
      expect(secondIndicator.x).toBe(4.5);

      const firstRightEdge = firstIndicator.x + firstIndicator.width;
      expect(secondIndicator.x - firstRightEdge).toBe(1);
    });

    it('shifts the group left when the first indicator has positive anchorOffsetX (B291;B85;B97)', () => {
      // B291: width 8, center 4
      // B85: width 3, anchorOffsetX +0.5
      // B97: width 2, anchorOffsetX 0
      //
      // Without anchor shift:
      //   totalWidth        = 3 + 1 + 2 = 6
      //   firstIndicator.x  = 4 - 6/2 = 1
      //   secondIndicator.x = 1 + 3 + 1 = 5
      //
      // With anchor shift = -(0.5 + 0) = -0.5
      //   firstIndicator.x  = 1 - 0.5 = 0.5
      //   secondIndicator.x = 5 - 0.5 = 4.5
      const character = getCharacter("B291;B85;B97");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(0.5);
      expect(secondIndicator.x).toBe(4.5);

      const firstRightEdge = firstIndicator.x + firstIndicator.width;
      expect(secondIndicator.x - firstRightEdge).toBe(1);
    });
  });

  describe('when indicators extend left of the glyph at the start of a sequence', () => {
    it('reports a non-positive root x for the first character whose indicators overhang left', () => {
      // B428 (width 0) with two indicators at x = -2.5 and x = 0.5
      // Leftmost extent is -2.5, so root x must be <= 0.
      const renderStructure = BlissParser.parse("B428;B99;B97");
      const element = new BlissElement(renderStructure);

      expect(element.x).toBeLessThanOrEqual(0);
    });

    it('reports visual x including indicator overhang for a non-first character', () => {
      // B291 (width 8) followed by B428;B99;B97
      // charSpace = 2 -> B428's glyph position is 0 + 8 + 2 = 10
      // First indicator at -2.5 relative to char -> visual x = 10 - 2.5 = 7.5
      const renderStructure = BlissParser.parse("B291/B428;B99;B97");
      const element = new BlissElement(renderStructure);
      const word = element.children[0];
      const firstCharacter = word.children[0];
      const secondCharacter = word.children[1];

      expect(secondCharacter.x).toBe(7.5);

      const firstIndicator = secondCharacter.children[1];
      expect(firstIndicator.x).toBe(-2.5);

      expect(firstCharacter.x).toBe(0);
      expect(firstCharacter.width).toBe(8);
    });

    it('orders three consecutive overhanging characters so they do not overlap', () => {
      // Each B428;B99 has a zero-width base with one indicator.
      const renderStructure = BlissParser.parse("B428;B99/B428;B99/B428;B99");
      const element = new BlissElement(renderStructure);
      const word = element.children[0];

      const char1 = word.children[0];
      const char2 = word.children[1];
      const char3 = word.children[2];

      expect(char2.x).toBeGreaterThan(char1.x);
      expect(char3.x).toBeGreaterThan(char2.x);
    });
  });

  describe('when the input pattern is irregular', () => {
    it('returns one child for a bare base glyph with no indicator slot (B291)', () => {
      const character = getCharacter("B291");

      expect(character.children.length).toBe(1);
    });

    it('treats an empty indicator slot as a no-op (B291;)', () => {
      // note: B291 has no baked-in indicator, so B291; must not warn
      const character = getCharacter("B291;");

      expect(character.children.length).toBe(1);
    });

    it('falls back to using all parts when the glyph is an all-indicator composite (B98)', () => {
      // B98 has glyphParts empty; width getters must still return positive values.
      const character = getCharacter("B98");

      expect(character.children.length).toBeGreaterThan(0);
      expect(character.baseGlyphWidth).toBeGreaterThan(0);
      expect(character.rightExtendedGlyphWidth).toBeGreaterThan(0);
    });

    it('positions the indicator over a multi-part composite base (B291;H:0,4;B99)', () => {
      // B291 + H:0,4 are both glyph parts; B99 is the indicator.
      const character = getCharacter("B291;H:0,4;B99");

      expect(character.children.length).toBe(3);

      const indicator = character.children[2];
      expect(indicator.isIndicator).toBe(true);

      // baseGlyphWidth excludes the indicator; B291 width 8 dominates.
      expect(character.baseGlyphWidth).toBe(8);
    });

    it('skips indicator centering when a non-indicator follows the indicator (B291;B99;H)', () => {
      // Compare valid B291;B99 (B99 centered at x=3) vs invalid B291;B99;H
      // (B99 left at default x=0, no indicator centering applied).
      const validChar = getCharacter("B291;B99");
      const invalidChar = getCharacter("B291;B99;H");

      const validIndicator = validChar.children[1];
      expect(validIndicator.isIndicator).toBe(true);
      expect(validIndicator.x).toBe(3);

      const invalidIndicator = invalidChar.children[1];
      expect(invalidIndicator.isIndicator).toBe(true);
      expect(invalidIndicator.x).toBe(0);

      const thirdPart = invalidChar.children[2];
      expect(thirdPart.isIndicator).toBe(false);
    });
  });

  describe('when indicators in the group have different widths', () => {
    it('shifts the group to keep the anchor centered (B291;B99;B84)', () => {
      // B291: width 8, center 4
      // B99: w=2, anchorOffsetX 0; B84: w=3, anchorOffsetX -0.5
      // total = 2 + 1 + 3 = 6
      // shift = (w2 - w1)/4 - (a1 + a2)/2 = (3-2)/4 - (0 + -0.5)/2 = 0.25 + 0.25 = 0.5
      // firstIndicator.x  = (4 - 6/2) + 0.5 = 1.5
      // secondIndicator.x = 1.5 + 2 + 1 = 4.5
      const character = getCharacter("B291;B99;B84");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(1.5);
      expect(secondIndicator.x).toBe(4.5);

      expect(secondIndicator.x - (firstIndicator.x + firstIndicator.width)).toBe(1);
    });

    it('keeps the group centered without shift when reversed widths cancel anchor offsets (B291;B84;B99)', () => {
      // B291: width 8, center 4
      // B84: w=3, anchorOffsetX -0.5; B99: w=2, anchorOffsetX 0
      // total = 3 + 1 + 2 = 6
      // shift = (2-3)/4 - (-0.5 + 0)/2 = -0.25 + 0.25 = 0
      // firstIndicator.x  = 4 - 6/2 = 1
      // secondIndicator.x = 1 + 3 + 1 = 5
      const character = getCharacter("B291;B84;B99");

      const firstIndicator = character.children[1];
      const secondIndicator = character.children[2];

      expect(firstIndicator.x).toBe(1);
      expect(secondIndicator.x).toBe(5);

      expect(secondIndicator.x - (firstIndicator.x + firstIndicator.width)).toBe(1);
    });
  });

  describe('when a width getter is read multiple times on the same character', () => {
    it('returns the same baseGlyphWidth across repeated reads', () => {
      const character = getCharacter("B291;B99;B97");

      const width1 = character.baseGlyphWidth;
      const width2 = character.baseGlyphWidth;
      const width3 = character.baseGlyphWidth;

      expect(width1).toBe(8);
      expect(width2).toBe(width1);
      expect(width3).toBe(width1);
    });

    it('returns the same rightExtendedGlyphWidth across repeated reads', () => {
      const character = getCharacter("B291;B99;B97");

      const width1 = character.rightExtendedGlyphWidth;
      const width2 = character.rightExtendedGlyphWidth;
      const width3 = character.rightExtendedGlyphWidth;

      expect(width1).toBe(8);
      expect(width2).toBe(width1);
      expect(width3).toBe(width1);
    });
  });

  describe('when indicators appear across multiple words', () => {
    it('keeps the root x non-negative when the first character of the first word has indicator overhang', () => {
      // B428;B99//B428;B97 -> 3 groups (word1, TSP, word2)
      const renderStructure = BlissParser.parse("B428;B99//B428;B97");
      const element = new BlissElement(renderStructure);

      expect(element.children.length).toBe(3);

      const word1 = element.children[0];
      const word2 = element.children[2]; // skip TSP at index 1
      expect(word1.children.length).toBe(1);
      expect(word2.children.length).toBe(1);

      expect(element.x).toBeGreaterThanOrEqual(0);
    });

    it('places the second word to the right of the first when the first has indicator overhang', () => {
      const renderStructure = BlissParser.parse("B428;B99//B291");
      const element = new BlissElement(renderStructure);

      const word1 = element.children[0];
      const word2 = element.children[2]; // skip TSP at index 1

      expect(word2.x).toBeGreaterThan(word1.x);
    });
  });
});
