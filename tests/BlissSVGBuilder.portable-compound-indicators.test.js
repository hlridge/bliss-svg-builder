/**
 * Pins the portable saves of a custom compound indicator writing its parts
 * where they were drawn: a coordinate inside the compound is relative to the
 * compound, but one written on a character's part is absolute in the
 * character, so the save writes each part's drawn position where they differ.
 *
 * Covers:
 * - Compounds flagged as indicators on a character: with a baked offset,
 *   written with a position (a written 0,0 included), holding a plain part,
 *   offset as a character's base, a single indicator with a baked offset on
 *   either axis, and one nesting a displaced compound: the exact default
 *   string, the same string flattened and without options, and the default
 *   JSON rebuilt to it (for one holding a plain part, the JSON's exact parts,
 *   the plain part flagged as an indicator); each reloading as drawn and
 *   naming only built-in codes.
 * - The flattened saves of a compound written as a word-level `;;` code.
 * - A compound after another indicator, and one before another indicator;
 *   the one holding a plain part reloading without a warning.
 * - A compound given through `glyph(0).applyIndicators()` and `addPart()`.
 * - A compound holding a plain part whose parts cannot settle where they were
 *   drawn, after another indicator on a base narrower than it: the string
 *   saved as before, no position written (its reload still differs, a
 *   residue).
 * - The same compound alone on that base: its parts written where they were
 *   drawn, the string's reload with identical ink but a wider character (a
 *   residue).
 * - The JSON of both, also given a position on either axis, which keeps the
 *   plain part flagged: every part placed, reloading as drawn without a
 *   warning.
 * - `preserve`, which keeps every name.
 * - Controls: a lone compound, a compound as a character's base, an
 *   unpositioned compound of indicators on a character.
 *
 * Does NOT cover:
 * - The default saves of a compound written as a `;;` code, spelled out
 *   there, see `BlissSVGBuilder.portable-word-indicators.test.js`.
 * - The blank space a displaced compound added before the first character,
 *   see `BlissSVGBuilder.indicator-overhang.test.js`.
 * - How the builder lays a compound out, see
 *   `BlissSVGBuilder.compound-indicator-application.test.js` and
 *   `BlissSVGBuilder.compound-indicator-overlay.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PC_BAKED: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' },
  PC_STACK: { type: 'glyph', isIndicator: true, codeString: 'B86;B97' },
  PC_MIXED: { type: 'glyph', isIndicator: true, codeString: 'B270;B86' },
  PC_OFFSET: { type: 'glyph', isIndicator: true, codeString: 'B86;B97:5,0' },
  PC_INDPOS: { type: 'glyph', isIndicator: true, codeString: 'B81:2,0' },
  PC_INDPOSY: { type: 'glyph', isIndicator: true, codeString: 'B81:0,2' },
  PC_INNER: { type: 'glyph', isIndicator: true, codeString: 'B86:5,0;B97:7,0' },
  PC_OUTER: { type: 'glyph', isIndicator: true, codeString: 'PC_INNER;B81' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

// Every code a DSL string names, its option brackets left out.
const codesOfString = (text) => [...text.replace(/\[[^\]]*\]>?/g, '').matchAll(/[A-Za-z]\w*/g)].map(([code]) => code);

// Every code a JSON names: its characters, their parts, and each word's `;;` codes.
const codesOfJson = (json) => json.groups.flatMap((group) => [
  ...(group.glyphs ?? []).flatMap((glyph) => [glyph.codeName, ...(glyph.parts ?? []).map((part) => part.codeName)]),
  ...(group.wordIndicators?.codes ?? []).flatMap(codesOfString),
]).filter((code) => code !== undefined);

// The codes only an instance holding their definitions can draw.
const notBuiltIn = (codes) => codes.filter((code) => BlissSVGBuilder.getDefinition(code)?.isBuiltIn !== true);

// An SVG without its root tag, which holds the drawing's size: the ink alone.
const inkOf = (svg) => svg.replace(/^<svg[^>]*>/, '');

const PLACED = [
  ['B291;PC_BAKED', 'B291;B97;B99:4.5,0'],
  ['B291;PC_STACK:1,0', 'B291;B86:1;B97:4'],
  ['B291;PC_STACK:3', 'B291;B86:3;B97:6'],
  // pins the written zeros reaching the save: left out, B86 would be centred;
  // the y the layout already gives is not written
  ['B291;PC_STACK:0,0', 'B291;B86:0;B97:3'],
  ['PC_OFFSET;B81', 'B86;B97:5,0;B81:8'],
  ['B291;PC_INDPOS', 'B291;B81:4,0'],
  ['B291;PC_INDPOSY', 'B291;B81:3,2'],
  ['B291;PC_OUTER', 'B291;B86:0.5,0;B97:2.5,0;B81:5.5'],
  ['B291;B81;PC_BAKED', 'B291;B81;B97;B99:6,0'],
];

// A compound holding a plain part: the string, then the default JSON's parts.
const PLACED_HOLDING_PLAIN = [
  ['B291;PC_MIXED', 'B291;B270:3;B86', [{ codeName: 'B291' },
    { codeName: 'B270', x: 3, isIndicator: true, width: 2 }, { codeName: 'B86', x: 3, isIndicator: true, width: 2 }]],
  ['B291;PC_MIXED;B81', 'B291;B270:1.5;B86;B81', [{ codeName: 'B291' },
    { codeName: 'B270', x: 1.5, isIndicator: true, width: 2 }, { codeName: 'B86', x: 1.5, isIndicator: true, width: 2 },
    { codeName: 'B81', x: 4.5, isIndicator: true, width: 2 }]],
];

const AS_DRAWN = [
  ['PC_BAKED', 'B97;B99:3,0'],
  ['PC_STACK;B81', 'B86;B97;B81'],
  ['B291;PC_STACK', 'B291;B86;B97'],
  ['PC_BAKED;B81', 'B97;B99:3,0;B81'],
];

describe('BlissSVGBuilder portable compound indicators', () => {
  describe('when a custom compound indicator on a character is saved', () => {
    it.each(PLACED)('saves %s as %s, in the string and the JSON, each reloading as drawn', (input, saved) => {
      // regression: the saves wrote the compound's own coordinates as the
      // character's, so a reload moved its parts (backlog: "Mixed-base
      // compound indicator doesn't round-trip through primitive decomposition")
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(builder.toString({ flattenIndicators: true })).toBe(saved);
      expect(builder.toString({ omitOptions: true })).toBe(saved);
      expect(new BlissSVGBuilder(json).toString()).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn([...codesOfString(string), ...codesOfJson(json)])).toEqual([]);
    });

    it.each(PLACED_HOLDING_PLAIN)('saves %s as %s, and the JSON with every part flagged and placed, each reloading as drawn', (input, saved, parts) => {
      // re-pinned: the JSON keeps B270 flagged as the compound it came from,
      // so B270 and B86 lay out as a row on reload and B86 is written where it
      // was drawn; the string, which has no spelling for the flag, is
      // unchanged (backlog: "A flagged indicator whose code string writes a
      // coordinate loses isIndicator and width in the default toJSON()")
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(builder.toString({ flattenIndicators: true })).toBe(saved);
      expect(builder.toString({ omitOptions: true })).toBe(saved);
      expect(json.groups[0].glyphs[0].parts).toEqual(parts);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn([...codesOfString(string), ...codesOfJson(json)])).toEqual([]);
    });

    it('saves B291;B81;PC_MIXED as B291;B81:1.5;B270:4.5;B86:4.5, which reloads as drawn without a warning', () => {
      // regression: the save wrote B291;B81;B270;B86, a plain part after an
      // indicator, which warns MISPLACED_INDICATOR_PART on reload
      const builder = new BlissSVGBuilder('B291;B81;PC_MIXED');
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291;B81:1.5;B270:4.5;B86:4.5');
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the spelled-out parts cannot settle where they were drawn', () => {
    it('saves the string of B4;B81;PC_MIXED as before, writing no position on any part', () => {
      // pins writing only a placement that settles: B270 reaches left of B4's
      // start, and a plain part after an indicator re-origins the character,
      // so every round moves every part. The reload still differs (backlog:
      // "Mixed-base compound indicator doesn't round-trip through primitive
      // decomposition")
      const builder = new BlissSVGBuilder('B4;B81;PC_MIXED');
      expect(builder.toString()).toBe('B4;B81;B270;B86');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
    });
  });

  describe('when the JSON keeps a compound\'s plain part flagged on a narrower base', () => {
    it.each([
      // re-pinned: written unplaced, B270 reloaded as a plain part after an
      // indicator, elsewhere and warning MISPLACED_INDICATOR_PART
      ['B4;B81;PC_MIXED', [{ codeName: 'B4' }, { codeName: 'B81', x: -2.5, isIndicator: true, width: 2 },
        { codeName: 'B270', x: 0.5, isIndicator: true, width: 2 }, { codeName: 'B86', x: 0.5, isIndicator: true, width: 2 }]],
      // regression: B270 reloaded as plain ink, widening the character
      ['B4;PC_MIXED', [{ codeName: 'B4' },
        { codeName: 'B270', x: -1, isIndicator: true, width: 2 }, { codeName: 'B86', x: -1, isIndicator: true, width: 2 }]],
      // regression: given a position, B270 reloaded as plain ink, after B81
      // its parts elsewhere and alone its character wider
      ['B4;B81;PC_MIXED:1', [{ codeName: 'B4' }, { codeName: 'B81', x: -2.5, isIndicator: true, width: 2 },
        { codeName: 'B270', x: 1, isIndicator: true, width: 2 }, { codeName: 'B86', x: 1, isIndicator: true, width: 2 }]],
      ['B4;B81;PC_MIXED:,1', [{ codeName: 'B4' }, { codeName: 'B81', x: -2.5, isIndicator: true, width: 2 },
        { codeName: 'B270', x: 0.5, y: 1, isIndicator: true, width: 2 }, { codeName: 'B86', x: 0.5, y: 1, isIndicator: true, width: 2 }]],
      ['B4;PC_MIXED:-2', [{ codeName: 'B4' },
        { codeName: 'B270', x: -2, isIndicator: true, width: 2 }, { codeName: 'B86', x: -2, isIndicator: true, width: 2 }]],
    ])('places every part of the JSON of %s, which reloads as drawn without a warning', (input, parts) => {
      const builder = new BlissSVGBuilder(input);
      const json = builder.toJSON();
      const reloaded = new BlissSVGBuilder(json);
      expect(json.groups[0].glyphs[0].parts).toEqual(parts);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a compound\'s plain part settles left of a narrower base', () => {
    it('saves B4;PC_MIXED as B4;B270:-1;B86:-1, its ink where drawn but its reload wider', () => {
      // note: the reload counts the plain B270 as base, so its character comes
      // back wider (backlog: "Mixed-base compound indicator doesn't round-trip
      // through primitive decomposition", the residue it keeps).
      // pins the string's span guard judging only a part drawn as an
      // indicator by its flag alone: B270 holds no flag of its own, and
      // judging it would write the string from before, B4;B270;B86
      const builder = new BlissSVGBuilder('B4;PC_MIXED');
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(builder.toString()).toBe('B4;B270:-1;B86:-1');
      expect(inkOf(reloaded.svgCode)).toBe(inkOf(builder.svgCode));
      expect(reloaded.svgCode).not.toBe(builder.svgCode);
    });
  });

  describe('when a compound written as a word-level code is saved flattened', () => {
    it.each([
      ['B291;;PC_BAKED', 'B291;B97;B99:4.5,0'],
      ['B291;;PC_OUTER', 'B291;B86:0.5,0;B97:2.5,0;B81:5.5'],
    ])('flattens %s to %s, in the string and the JSON, each reloading as drawn', (input, saved) => {
      // regression: backlog "Flattening a custom compound `;;` indicator moves its second part"
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString({ flattenIndicators: true });
      const json = builder.toJSON({ flattenIndicators: true });
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(json).toString()).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a compound is given through the API', () => {
    it.each([
      ['glyph(0).applyIndicators', (b) => b.glyph(0).applyIndicators('PC_BAKED')],
      ['glyph(0).addPart', (b) => b.glyph(0).addPart('PC_BAKED')],
    ])('saves B291 given PC_BAKED by %s as B291;B97;B99:4.5,0, which reloads as drawn', (_route, change) => {
      const builder = changed('B291', change);
      expect(builder.toString()).toBe('B291;B97;B99:4.5,0');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when saved with preserve', () => {
    it('keeps every compound named, as written', () => {
      // control: passes before C25
      const inputs = [...PLACED, ...PLACED_HOLDING_PLAIN, ...AS_DRAWN].map(([input]) => input).concat('B291;B81;PC_MIXED');
      const preserved = Object.fromEntries(inputs.map((input) => [input, new BlissSVGBuilder(input).toString({ preserve: true })]));
      expect(preserved).toEqual(Object.fromEntries(inputs.map((input) => [input, input])));
    });
  });

  describe('when the built-in codes already draw the compound\'s parts where they were drawn', () => {
    it.each(AS_DRAWN)('saves %s as %s, writing no position', (input, saved) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });
});
