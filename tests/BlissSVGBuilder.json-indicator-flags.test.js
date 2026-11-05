/**
 * Pins the default `toJSON()` writing every part it spells out of a custom
 * indicator as an indicator: a part holding no flag of its own carries the
 * flag and the `width` of the nearest flagged code it was spelled out of, so
 * a builder rebuilt from the JSON draws it as drawn and treats it as an
 * indicator.
 *
 * Covers:
 * - An indicator drawn from one shape over a coordinate on either axis, a
 *   zero, left of the base's start, past its end, with an anchor of its own,
 *   through a custom shape, and through a bare alias: the exact JSON parts,
 *   each reloading as drawn; the reload's part read as an indicator, which
 *   `glyph(0).clearIndicators()` removes.
 * - Compounds: of plain shapes with and without a `width`, mixing a built-in
 *   indicator (which keeps its own flag and width), and nesting a flagged
 *   indicator (each part takes the nearest one's width).
 * - Word-level (`;;`) codes: one alone, flattened onto the head and flagged;
 *   one with a code left in the list, its part written plain with no
 *   indicator metadata; a character-level one the list replaces.
 * - The placement reading the JSON's flags back as its reload does, after
 *   another custom indicator.
 * - A flagged part naming a shape defined after the build: each part the
 *   shape draws flagged, no width written where none was stored.
 * - Controls: the string, which has no spelling for the flag, unchanged;
 *   `preserve` and `deep` keeping the name.
 *
 * Does NOT cover:
 * - Compounds of built-in indicators, and one holding a plain built-in code,
 *   see `BlissSVGBuilder.portable-compound-indicators.test.js`.
 * - An indicator drawn from one shape with no coordinate, stored as the shape
 *   itself with the flag, see `BlissSVGBuilder.portable-shape-indicators.test.js`.
 * - Where a replaced indicator shows once the word's `;;` codes are cleared on
 *   the reload (backlog: "A part the word's `;;` codes replace is written at
 *   its own offset...").
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  JF_RING: { type: 'glyph', isIndicator: true, codeString: 'C2:3', width: 7 },
  JF_RING_XY: { type: 'glyph', isIndicator: true, codeString: 'C2:3,2' },
  JF_RING_Y: { type: 'glyph', isIndicator: true, codeString: 'C2:,2' },
  JF_RING_ZERO: { type: 'glyph', isIndicator: true, codeString: 'C2:0,0' },
  JF_RING_LEFT: { type: 'glyph', isIndicator: true, codeString: 'C2:-6' },
  JF_RING_RIGHT: { type: 'glyph', isIndicator: true, codeString: 'C2:12' },
  JF_RING_ANCHORED: { type: 'glyph', isIndicator: true, codeString: 'C2:3', anchorOffsetX: 0.5 },
  JF_SHAPE: { type: 'shape', codeString: 'C2' },
  JF_SHAPE_RING: { type: 'glyph', isIndicator: true, codeString: 'JF_SHAPE:3', width: 7 },
  JF_ALIAS: { codeString: 'JF_RING' },
  JF_PLAIN_RING: { type: 'glyph', isIndicator: true, codeString: 'C2' },
  JF_PAIR_WIDE: { type: 'glyph', isIndicator: true, codeString: 'C2;C2:3,0', width: 5 },
  JF_PAIR: { type: 'glyph', isIndicator: true, codeString: 'C2;C2:3,0' },
  JF_MIXED: { type: 'glyph', isIndicator: true, codeString: 'B97;C2:3,0', width: 5 },
  JF_NESTED: { type: 'glyph', isIndicator: true, codeString: 'JF_RING;C2:6,0', width: 9 },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// The default JSON's parts of the first character.
const jsonParts = (builder) => builder.toJSON().groups[0].glyphs[0].parts;

const B291 = { codeName: 'B291' };

const ONE_SHAPE = [
  ['B291;JF_RING', [B291, { codeName: 'C2', x: 4.5, isIndicator: true, width: 7 }]],
  ['B291;JF_RING_XY', [B291, { codeName: 'C2', x: 4.5, y: 2, isIndicator: true, width: 2 }]],
  ['B291;JF_RING_Y', [B291, { codeName: 'C2', y: 2, isIndicator: true, width: 2 }]],
  ['B291;JF_RING_ZERO', [B291, { codeName: 'C2', x: 3, y: 0, isIndicator: true, width: 2 }]],
  // regression: written plain at x -6, the ring reloaded elsewhere
  ['B291;JF_RING_LEFT', [B291, { codeName: 'C2', x: -3, isIndicator: true, width: 2 }]],
  ['B291;JF_RING_RIGHT', [B291, { codeName: 'C2', x: 9, isIndicator: true, width: 2 }]],
  ['B291;JF_RING_ANCHORED', [B291, { codeName: 'C2', x: 4, isIndicator: true, width: 2 }]],
  ['B291;JF_SHAPE_RING', [B291, { codeName: 'C2', x: 4.5, isIndicator: true, width: 7 }]],
  ['B291;JF_ALIAS', [B291, { codeName: 'C2', x: 4.5, isIndicator: true, width: 7 }]],
];

const COMPOUNDS = [
  ['B291;JF_PAIR_WIDE', [B291, { codeName: 'C2', isIndicator: true, width: 5 },
    { codeName: 'C2', x: 4.5, y: 0, isIndicator: true, width: 5 }]],
  ['B291;JF_PAIR', [B291, { codeName: 'C2', isIndicator: true, width: 2 },
    { codeName: 'C2', x: 4.5, y: 0, isIndicator: true, width: 2 }]],
  // pins a built-in indicator inside keeping its own width, not the compound's
  ['B291;JF_MIXED', [B291, { codeName: 'B97', isIndicator: true, width: 2 },
    { codeName: 'C2', x: 4.5, y: 0, isIndicator: true, width: 5 }]],
  // pins each part taking the width of the nearest flagged code it came from
  ['B291;JF_NESTED', [B291, { codeName: 'C2', x: 3, isIndicator: true, width: 7 },
    { codeName: 'C2', x: 6, y: 0, isIndicator: true, width: 9 }]],
];

describe('BlissSVGBuilder JSON indicator flags', () => {
  describe('when a custom indicator drawn from one shape is written with a coordinate', () => {
    it.each(ONE_SHAPE)('writes %s with the flag and width on its part, reloading as drawn', (input, parts) => {
      const builder = new BlissSVGBuilder(input);
      expect(jsonParts(builder)).toEqual(parts);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('reloads the part of B291;JF_RING as an indicator, which glyph(0).clearIndicators() removes', () => {
      // regression: the part reloaded as plain ink, which the clear kept
      // (backlog: "A flagged indicator whose code string writes a coordinate
      // loses isIndicator and width in the default toJSON()")
      const reloaded = new BlissSVGBuilder(new BlissSVGBuilder('B291;JF_RING').toJSON());
      expect(reloaded.glyph(0).part(1).isIndicator).toBe(true);
      reloaded.glyph(0).clearIndicators();
      expect(reloaded.toString()).toBe('B291');
    });
  });

  describe('when a custom compound indicator is written', () => {
    it.each(COMPOUNDS)('writes %s with a flag and width on every part, reloading as drawn', (input, parts) => {
      const builder = new BlissSVGBuilder(input);
      expect(jsonParts(builder)).toEqual(parts);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the custom indicator is a word-level code', () => {
    it('writes B291;;JF_RING on the head as a flagged part, as for a ring with no coordinate', () => {
      const builder = new BlissSVGBuilder('B291;;JF_RING');
      const json = builder.toJSON();
      expect(json.groups[0].glyphs[0].parts).toEqual([B291, { codeName: 'C2', x: 4.5, isIndicator: true, width: 7 }]);
      expect(json.groups[0].wordIndicators).toBeUndefined();
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['B291;;JF_RING;B81', { codeName: 'C2', x: 3 }, ['B81:6']],
      // pins the indicator's width dropped with its flag
      ['B291;;JF_PLAIN_RING;B81', { codeName: 'C2', x: 1.5 }, ['B81:4.5']],
    ])('writes the ring of %s on the head as plain ink, beside the codes left in the list', (input, ring, codes) => {
      // note: flagged, the ring would be replaced on reload by the codes left
      // in the word's list
      const builder = new BlissSVGBuilder(input);
      const json = builder.toJSON();
      expect(json.groups[0].glyphs[0].parts).toEqual([B291, ring]);
      expect(json.groups[0].wordIndicators.codes).toEqual(codes);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });

    it('writes B291;JF_RING;;B81 with the ring flagged, so the list replaces it on reload as drawn', () => {
      // regression: written plain, the ring reloaded beside B81
      const builder = new BlissSVGBuilder('B291;JF_RING;;B81');
      const json = builder.toJSON();
      expect(json.groups[0].glyphs[0].parts).toEqual([B291, { codeName: 'C2', x: 3, isIndicator: true, width: 7 }]);
      expect(json.groups[0].wordIndicators.codes).toEqual(['B81']);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when another custom indicator stands before it', () => {
    it.each([
      // pins the placement reading the written flags back as the reload does:
      // read back as plain ink, the first ring is left unpositioned and
      // reloads 1.5 to the right
      ['B291;JF_PLAIN_RING;JF_RING', [B291, { codeName: 'C2', x: 0, isIndicator: true, width: 2 },
        { codeName: 'C2', x: 6, isIndicator: true, width: 7 }]],
      // regression: written plain, the last ring reloaded elsewhere
      ['B291;JF_PLAIN_RING;B81;JF_RING', [B291, { codeName: 'C2', x: -1.5, isIndicator: true, width: 2 },
        { codeName: 'B81', x: 1.5, isIndicator: true, width: 2 }, { codeName: 'C2', x: 7.5, isIndicator: true, width: 7 }]],
    ])('writes every part of %s where it was drawn, reloading as drawn', (input, parts) => {
      const builder = new BlissSVGBuilder(input);
      expect(jsonParts(builder)).toEqual(parts);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a flagged part names a shape defined after the build', () => {
    it('writes each part the shape draws flagged, with no width where none was stored', () => {
      // pins the way down ending at the shape, which stored no parts, and a
      // width written only where the flagged code holds one
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [B291, { codeName: 'JF_LATE', isIndicator: true }] }] }] });
      const { errors } = BlissSVGBuilder.define({ JF_LATE: { type: 'shape', codeString: 'C2;C2:3,0' } });
      try {
        expect(errors).toEqual([]);
        expect(jsonParts(builder)).toStrictEqual([B291, { codeName: 'C2', isIndicator: true },
          { codeName: 'C2', x: 3, y: 0, isIndicator: true }]);
      } finally {
        BlissSVGBuilder.removeDefinition('JF_LATE');
      }
    });
  });

  describe('when the same composition is saved another way', () => {
    it.each([
      ['B291;JF_RING', 'B291;C2:4.5'],
      // pins the flag kept to the JSON: flagged in the step both saves share,
      // the string's span guard would write B291;C2:12, which reloads elsewhere
      ['B291;JF_RING_RIGHT', 'B291;C2:9'],
    ])('writes %s as the string %s, which reloads as drawn', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('keeps the name under preserve', () => {
      expect(new BlissSVGBuilder('B291;JF_RING').toJSON({ preserve: true }).groups[0].glyphs[0].parts)
        .toEqual([B291, { codeName: 'JF_RING', isIndicator: true, width: 7 }]);
    });

    it('keeps the stored part, flag on the name alone, in the deep JSON', () => {
      expect(new BlissSVGBuilder('B291;JF_RING').toJSON({ deep: true }).groups[0].glyphs[0].parts[1])
        .toEqual({ codeName: 'JF_RING', parts: [{ codeName: 'C2', x: 3 }], isIndicator: true, width: 7 });
    });
  });
});
