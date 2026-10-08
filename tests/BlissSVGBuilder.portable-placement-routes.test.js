/**
 * Pins every portable save of a custom glyph with an anchor of its own,
 * given an indicator by any route, reloading as drawn and naming only
 * built-in codes.
 *
 * Covers:
 * - Five bases (a glyph with its own y anchor, one with its own x anchor, a
 *   wrap whose written 0 overrides its code's anchor, a glyph of two codes
 *   with an x anchor, a bare alias of an anchored glyph) crossed with six
 *   routes: `;;B81` and `;B81` in the DSL, `glyph(0).applyIndicators('B81')`,
 *   `group(0).applyIndicators('B81')` with and without `{ flatten: true }`,
 *   and `glyph(0).addPart('B99')`.
 * - Six saves per row: `toString()` and `toJSON()`, each plain, flattened and
 *   with `omitOptions`, a save without options compared with the builder
 *   after `clearAllOptions()`.
 *
 * Does NOT cover:
 * - The exact strings these saves write, see
 *   `BlissSVGBuilder.portable-indicator-placement.test.js`.
 * - A bare alias given `;B81`, which drops the `;` part with
 *   `MISPLACED_CHARACTER_INDICATOR`, see
 *   `BlissSVGBuilder.char-alias-preserve.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PR_ANC: { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
  PR_ANCX: { type: 'glyph', codeString: 'B291', anchorOffsetX: 1.5 },
  PR_W138Z: { type: 'glyph', codeString: 'B138', anchorOffsetY: 0 },
  PR_NEWX: { type: 'glyph', codeString: 'B291;C8', anchorOffsetX: 1.5 },
  PR_ALANC: { codeString: 'PR_ANC' },
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

const ROUTES = [
  [';;B81', (base) => new BlissSVGBuilder(`${base};;B81`)],
  [';B81', (base) => new BlissSVGBuilder(`${base};B81`)],
  ['glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B81'))],
  ['group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B81'))],
  ['group(0).applyIndicators with flatten', (base) => changed(base, (b) => b.group(0).applyIndicators('B81', { flatten: true }))],
  ['glyph(0).addPart', (base) => changed(base, (b) => b.glyph(0).addPart('B99'))],
];

// note: a bare alias drops a `;` part (MISPLACED_CHARACTER_INDICATOR), so it has no `;B81` row
const ROWS = Object.keys(FIXTURES)
  .flatMap((base) => ROUTES.map(([route, build]) => [base, route, build]))
  .filter(([base, route]) => !(base === 'PR_ALANC' && route === ';B81'));

// Each portable save: how it is written, the drawing its reload must match,
// and how the codes it names are read.
const SAVES = [
  ['toString()', (b) => b.toString(), 'drawn', codesOfString],
  ['toJSON()', (b) => b.toJSON(), 'drawn', codesOfJson],
  ['toString({ flattenIndicators: true })', (b) => b.toString({ flattenIndicators: true }), 'drawn', codesOfString],
  ['toJSON({ flattenIndicators: true })', (b) => b.toJSON({ flattenIndicators: true }), 'drawn', codesOfJson],
  ['toString({ omitOptions: true })', (b) => b.toString({ omitOptions: true }), 'cleared', codesOfString],
  ['toJSON({ omitOptions: true })', (b) => b.toJSON({ omitOptions: true }), 'cleared', codesOfJson],
];

const EVERY_SAVE_RELOADS = Object.fromEntries(SAVES.map(([save]) => [save, true]));
const NO_SAVE_NAMES_A_DEFINITION = Object.fromEntries(SAVES.map(([save]) => [save, []]));

describe('BlissSVGBuilder portable placement routes', () => {
  describe('when a glyph with an anchor of its own is given an indicator and saved portably', () => {
    it.each(ROWS)('reloads %s given an indicator by %s as drawn from every portable save', (base, _route, build) => {
      // regression: every save wrote the built-in codes alone, whose reload
      // places the indicator by the built-in code's anchor
      const builder = build(base);
      const cleared = build(base);
      cleared.clearAllOptions();
      const drawings = { drawn: builder.svgCode, cleared: cleared.svgCode };
      const reloads = Object.fromEntries(SAVES.map(([save, write, drawing]) => [save, new BlissSVGBuilder(write(builder)).svgCode === drawings[drawing]]));
      const definitionsNamed = Object.fromEntries(SAVES.map(([save, write, , codesOf]) => [save, notBuiltIn(codesOf(write(builder)))]));
      // pins the drawing at all: two empty drawings would compare equal
      expect(builder.warnings).toEqual([]);
      expect(reloads).toEqual(EVERY_SAVE_RELOADS);
      expect(definitionsNamed).toEqual(NO_SAVE_NAMES_A_DEFINITION);
    });
  });
});
