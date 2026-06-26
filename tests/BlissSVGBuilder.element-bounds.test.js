import { describe, it, expect } from 'vitest';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the geometric properties of a level-2 Bliss character built through
 * the parser → element pipeline: the isGlyph / isBlissGlyph /
 * isExternalGlyph identification flags, the effectiveBounds content
 * extents, and the width / advanceX behaviour when the input carries
 * positive or negative x offsets.
 *
 * Covers:
 * - isGlyph identification across glyph kinds: a Bliss glyph (B291) reports
 *   isGlyph=true and isBlissGlyph=true; an external glyph (Xa) reports
 *   isGlyph=true and isExternalGlyph=true; a raw shape primitive (H)
 *   reports isGlyph=true and isBlissGlyph=false.
 * - effectiveBounds at level 2: predefined glyph (B291) reflects exact
 *   content extents (y∈[8,16]); external glyph (Xa) reflects approximate
 *   content extents (minY=11); two external glyphs sharing the
 *   approxMinY=11 default report identical minY.
 * - Positive x offsets in the DSL (`B291:N`): preserved on the part rather
 *   than normalised away; the character width includes the offset; the
 *   advanceX accounts for full character width including offset; an
 *   un-offset glyph reports its base width unchanged.
 * - Negative x offsets in inline composites: normalised to ≥ 0 so no part
 *   sits at a negative x.
 *
 * Does NOT cover:
 * - Crop options and viewBox geometry, see
 *   `BlissSVGBuilder.crop.test.js`.
 * - Snapshot-side level-derived booleans on the public API
 *   (`isGlyph` on a snapshot node), see
 *   `tests/BlissElement.taxonomy.test.js`.
 * - The level-2 default-mode height invariant (every character reports
 *   height=20), now consolidated in its named home
 *   `tests/BlissSVGBuilder.character-height.test.js` (which covers Bliss
 *   glyphs, external glyphs, raw shapes, indicators, and multi-part
 *   characters in one place).
 * - Visual regression of the rendered SVG, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

// Helper: parse input and return the element tree
function buildElement(input) {
  const renderStructure = BlissParser.parse(input);
  return new BlissElement(renderStructure);
}

// Helper: get the first character element (level 2)
function getFirstCharacter(input) {
  const element = buildElement(input);
  return element.children[0].children[0]; // root -> word -> character
}

describe('BlissSVGBuilder element bounds', () => {
  describe('when probing isGlyph and the glyph-kind flags', () => {
    it('reports isGlyph=true and isBlissGlyph=true for a Bliss glyph (B291)', () => {
      const character = getFirstCharacter('B291');
      expect(character.isGlyph).toBe(true);
      expect(character.isBlissGlyph).toBe(true);
    });

    it('reports isGlyph=true and isExternalGlyph=true for an external glyph (Xa)', () => {
      const character = getFirstCharacter('Xa');
      expect(character.isGlyph).toBe(true);
      expect(character.isExternalGlyph).toBe(true);
    });

    it('reports isGlyph=true and isBlissGlyph=false for a raw shape primitive (H)', () => {
      const character = getFirstCharacter('H');
      expect(character.isGlyph).toBe(true);
      expect(character.isBlissGlyph).toBe(false);
    });
  });

  describe('when computing effectiveBounds for a level-2 character', () => {
    it('reflects exact content extents for a Bliss glyph (B291: y∈[8,16])', () => {
      // B291 = S8:0,8 -> content from y=8 to y=16
      const character = getFirstCharacter('B291');
      const bounds = character.effectiveBounds;
      expect(bounds.minY).toBe(8);
      expect(bounds.maxY).toBe(16);
      expect(bounds.height).toBe(8);
    });

    it('reflects approximate content extents for an external glyph (Xa)', () => {
      // External glyphs use approxMinY=11, maxY from font data (~16)
      const character = getFirstCharacter('Xa');
      const bounds = character.effectiveBounds;
      expect(bounds.minY).toBe(11); // Approximate (TODO: compute from path data)
      expect(bounds.maxY).toBeGreaterThan(15);
      expect(bounds.maxY).toBeLessThan(17);
    });

    it('reports the same approxMinY=11 across distinct external glyphs (Xa and XA)', () => {
      // All external glyphs use approxMinY=11 for now (TODO: compute from path data)
      const xa = getFirstCharacter('Xa');
      const xA = getFirstCharacter('XA');
      expect(xa.effectiveBounds.minY).toBe(11);
      expect(xA.effectiveBounds.minY).toBe(11);
    });
  });

  describe('when the input includes x offsets', () => {
    it('preserves a positive x offset on the part rather than normalising it to 0', () => {
      // B291:3,3 positions the character part at x=3
      const character = getFirstCharacter('B291:3,3');
      const part = character.children[0];
      expect(part.x).toBe(3);
    });

    it('still normalises a negative x offset to ≥ 0', () => {
      // Create a composition where parts have negative x
      // B291;B291:-5,0 -> second part at x=-5 should trigger normalization
      const character = getFirstCharacter('B291;B291:-5,0');
      const parts = character.children;
      const minX = Math.min(...parts.map(p => p.x));
      expect(minX).toBeGreaterThanOrEqual(0);
    });

    it('reports character width 8 for an unoffset glyph (baseline)', () => {
      const character = getFirstCharacter('B291');
      expect(character.width).toBe(8);
    });

    it('extends character width to include the positive x offset of its part', () => {
      // B291:5 has its part (S8) at x=5, width=8 -> character width = 5+8 = 13
      const character = getFirstCharacter('B291:5');
      expect(character.children[0].x).toBe(5);
      expect(character.children[0].width).toBe(8);
      expect(character.width).toBe(13);
    });

    it('advances the next character past the full width including offset', () => {
      // B291:5/B291: first character should advance past its full extent
      const element = buildElement('B291:5/B291');
      const word = element.children[0];
      const char1 = word.children[0];
      const char2 = word.children[1];

      // char1 width = 13 (5 offset + 8 content), advanceX = 13 + 2 charSpace = 15
      expect(char1.width).toBe(13);
      expect(char2.x).toBe(char1.x + char1.advanceX);
      // char2 should not overlap with char1's content
      expect(char2.x).toBeGreaterThanOrEqual(13);
    });
  });
});
