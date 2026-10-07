/**
 * Pins the first character's overhang reading the leading indicator's ink: a
 * custom compound indicator whose parts start away from its own origin adds
 * no blank space before the first character.
 *
 * Covers:
 * - A compound flagged as an indicator whose parts sit away from its origin
 *   (`B86:5,0;B97:7,0`), leading the first character by `;`, by `;;` and by
 *   `glyph(0).applyIndicators()`: drawn as its parts written where they are
 *   drawn.
 * - A compound whose parts reach left of its origin (`B86:-6,0;B97:-3,0`),
 *   leading the first character: drawn as its parts written where they are
 *   drawn, its ink inside the drawing rather than past its left edge.
 * - Controls: the same compound on a later character, where no overhang
 *   applies; compounds whose frame starts at their ink (one nesting the
 *   displaced compound, one with a baked offset); a built-in indicator
 *   reaching left of a narrow character, still shifting the drawing.
 *
 * Does NOT cover:
 * - Where the saves write such a compound's parts, see
 *   `BlissSVGBuilder.portable-compound-indicators.test.js`.
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
  });
});
