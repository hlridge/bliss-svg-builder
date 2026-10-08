/**
 * Pins the layout reading a custom compound indicator's ink, not its frame,
 * where the two differ: the first character's overhang, a character's width
 * and a word's extent add no blank space for one whose parts start away from
 * its own origin.
 *
 * Covers:
 * - A compound flagged as an indicator whose parts sit away from its origin
 *   (`B86:5,0;B97:7,0`), leading the first character by `;`, by `;;` and by
 *   `glyph(0).applyIndicators()`: drawn as its parts written where they are
 *   drawn.
 * - A compound whose parts reach left of its origin (`B86:-6,0;B97:-3,0`),
 *   leading the first character: drawn as its parts written where they are
 *   drawn, its ink inside the drawing rather than past its left edge.
 * - Spacing that measures a character's width (absolute kerning, a digit's
 *   kerning rule) and a word's extent, around such a compound: drawn as its
 *   parts written where they are drawn.
 * - A default save spelling such a compound out of a word's `;;` codes, with
 *   a character after the head spaced by its width (absolute kerning, a
 *   letter pair): the save reloads as drawn.
 * - Controls: the same compound on a later character, where no overhang
 *   applies; compounds whose frame starts at their ink (one nesting the
 *   displaced compound, one with a baked offset); a built-in indicator
 *   reaching left of a narrow character, still shifting the drawing and still
 *   counted in the character's width.
 *
 * Does NOT cover:
 * - Where the saves write such a compound's parts in the other slots and
 *   routes, see `BlissSVGBuilder.portable-compound-indicators.test.js`.
 * - A character's advance under plain spacing, which reads its base parts
 *   only, never an indicator: `BlissSVGBuilder.spacing.test.js`.
 * - Built-in indicators in leading positions: none starts away from its
 *   origin, and `BlissSVGBuilder.visual-regression.e2e.test.js` holds their
 *   drawings.
 * - Ink that a later indicator or a base part places left of the first
 *   character's start: the overhang reads the first indicator only (backlog
 *   row "The first character's overhang reads only its first indicator").
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PO_INNER: { type: 'glyph', isIndicator: true, codeString: 'B86:5,0;B97:7,0' },
  PO_OUTER: { type: 'glyph', isIndicator: true, codeString: 'PO_INNER;B81' },
  PO_BAKED: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' },
  PO_LEFT: { type: 'glyph', isIndicator: true, codeString: 'B86:-6,0;B97:-3,0' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

describe('BlissSVGBuilder indicator overhang', () => {
  describe('when a compound whose parts start away from its origin leads the first character', () => {
    it.each(['B291;PO_INNER', 'B291;;PO_INNER'])('draws %s as B291;B86:4.5,0;B97:6.5,0, with no blank space before B291', (input) => {
      // regression: the overhang read the compound's frame, which starts left
      // of its ink, so the drawing gained half a unit of blank space on the
      // left (identical on v1.0.0)
      expect(svgOf(input)).toBe(svgOf('B291;B86:4.5,0;B97:6.5,0'));
    });

    it('draws B291 given PO_INNER by glyph(0).applyIndicators as B291;B86:4.5,0;B97:6.5,0', () => {
      expect(changed('B291', (b) => b.glyph(0).applyIndicators('PO_INNER')).svgCode).toBe(svgOf('B291;B86:4.5,0;B97:6.5,0'));
    });
  });

  describe('when a compound whose parts reach left of its origin leads the first character', () => {
    it.each(['B291;PO_LEFT', 'B291;;PO_LEFT'])('draws %s as B291;B86:-4.5,0;B97:-1.5,0, with its ink inside the drawing', (input) => {
      // regression: the overhang read the compound's frame, which starts right
      // of its ink, so the ink was drawn past the drawing's left edge
      // (identical on v1.0.0)
      expect(svgOf(input)).toBe(svgOf('B291;B86:-4.5,0;B97:-1.5,0'));
    });
  });

  describe('when the compound is on a later character, or its frame starts at its ink', () => {
    it.each([
      // note: not the first character, so no overhang applies
      ['B291/B291;PO_INNER', 'B291/B291;B86:4.5,0;B97:6.5,0'],
      ['B291;PO_OUTER', 'B291;B86:0.5,0;B97:2.5,0;B81:5.5'],
      ['B291;PO_BAKED', 'B291;B97;B99:4.5,0'],
    ])('draws %s as %s', (input, twin) => {
      // control: passes before C25
      expect(svgOf(input)).toBe(svgOf(twin));
    });
  });

  describe('when a built-in indicator reaches left of the first character', () => {
    it('shifts B4;B81 right by the overhang, drawing it as B4:1;B81:0,0, where nothing overhangs', () => {
      // control: passes before C25; B81 centred on the narrow B4 starts one
      // unit left of it, and the drawing still takes that unit up
      expect(svgOf('B4;B81')).toBe(svgOf('B4:1;B81:0,0'));
      expect(svgOf('B4;B81')).toBe(svgOf('B4;B81:-1'));
    });

    it('places B291 at x 6 in B4;B81/AK:3/B291, the unit B81 reaches left of B4 counted in the width', () => {
      // control: passes before C25; the overhang (1) plus the width B81 spans
      // from its left edge (2) plus the kerning (3)
      expect(new BlissSVGBuilder('B4;B81/AK:3/B291').group(0).glyph(1).x).toBe(6);
    });
  });

  describe('when spacing measures the width of a character holding such a compound', () => {
    it.each([
      // absolute kerning places the next character from the width
      ['B291;PO_INNER/AK:3/B291', 'B291;B86:4.5,0;B97:6.5,0/AK:3/B291'],
      // a digit's kerning rule with the next digit does too
      ['B9;PO_LEFT/B9', 'B9;B86:-7.5,0;B97:-4.5,0/B9'],
    ])('draws %s as %s', (input, twin) => {
      // regression: the width read the compound's frame, which reaches past
      // its ink, so the next character moved (identical on v1.0.0)
      expect(svgOf(input)).toBe(svgOf(twin));
    });

    it('draws B4;PO_LEFT as B4;B86:-8.5,0;B97:-5.5,0, the drawing ending where its ink does', () => {
      // regression: the word's extent read the compound's frame, so the
      // drawing ran on past the ink (identical on v1.0.0)
      expect(svgOf('B4;PO_LEFT')).toBe(svgOf('B4;B86:-8.5,0;B97:-5.5,0'));
    });
  });

  describe('when a default save spells such a compound out of a word\'s ;; codes', () => {
    it('saves B291/AK:3/B291;;PO_INNER as B291/AK:3/B291;;B86:4.5,0;B97:6.5,0, which reloads as drawn', () => {
      const builder = new BlissSVGBuilder('B291/AK:3/B291;;PO_INNER');
      expect(builder.toString()).toBe('B291/AK:3/B291;;B86:4.5,0;B97:6.5,0');
      expect(svgOf(builder.toString())).toBe(builder.svgCode);
    });

    it('saves Xa/Xb/B291;;PO_INNER in built-in codes, which reload with Xb where it was drawn', () => {
      // note: the head is Xa, and Xb is spaced by Xa's width
      const builder = new BlissSVGBuilder('Xa/Xb/B291;;PO_INNER');
      expect(builder.toString()).not.toContain('PO_INNER');
      expect(svgOf(builder.toString())).toBe(builder.svgCode);
    });
  });
});
