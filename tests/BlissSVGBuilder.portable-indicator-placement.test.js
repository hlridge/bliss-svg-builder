/**
 * Pins the portable saves writing where an indicator was drawn on a custom
 * glyph that places indicators by an anchor of its own: the built-in codes
 * the glyph is saved as would place it by theirs, so the save writes the
 * drawn position, on the axis that differs only.
 *
 * Covers:
 * - A glyph with its own y anchor, x anchor, both, a glyph of two codes with
 *   an x anchor, a wrap whose written 0 overrides its code's anchor, and a
 *   bare alias of an anchored glyph, given an indicator by `;;` or `;`: the
 *   exact default string, and the default JSON; each reloading as drawn and
 *   naming only built-in codes.
 * - The JSON's word-level codes and parts holding the written position, the
 *   axis that does not differ left unwritten; the flattened saves.
 * - The word's `;;` codes placed with the head they merge onto: a semantic
 *   root the merge keeps from the head, a head that is not the word's first
 *   character, several words in one save each with its own codes, and a code
 *   whose own bracket names it.
 * - The same glyph meeting its indicator through `replacePart()` (either
 *   part replaced), `merge()`, and a composition object (a part, or a
 *   word-level code).
 * - A position the author wrote on the indicator, kept as written.
 * - Options beside the written position, and `omitOptions` leaving them out.
 * - `preserve`, which keeps the names and writes no position.
 * - An indicator applied through the API to the character before an anchored
 *   glyph, which then heads the word and takes its `;;` code: the saves place
 *   nothing by the anchored glyph.
 * - Controls: a built-in base, a glyph of two codes and no anchor of its own,
 *   a wrap taking its code's anchor, a typed shape with an anchor.
 *
 * Does NOT cover:
 * - Every route that adds an indicator crossed with every portable save, see
 *   `BlissSVGBuilder.portable-placement-routes.test.js`.
 * - Custom compound indicators, see
 *   `BlissSVGBuilder.portable-compound-indicators.test.js`; a `;;` code named
 *   by a custom definition, see
 *   `BlissSVGBuilder.portable-word-indicators.test.js`.
 * - How the builder places an indicator by a glyph's own anchor, see
 *   `BlissSVGBuilder.definition-is-a-part.test.js` and
 *   `BlissSVGBuilder.wrapped-code-anchor.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PP_ANC: { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
  PP_ANCX: { type: 'glyph', codeString: 'B291', anchorOffsetX: 1.5 },
  PP_ANC2: { type: 'glyph', codeString: 'B291', anchorOffsetX: 1, anchorOffsetY: 2 },
  PP_NEWX: { type: 'glyph', codeString: 'B291;C8', anchorOffsetX: 1.5 },
  PP_W138Z: { type: 'glyph', codeString: 'B138', anchorOffsetY: 0 },
  PP_ALANC: { codeString: 'PP_ANC' },
  PP_PLAIN: { type: 'glyph', codeString: 'B291;C8' },
  PP_W138: { type: 'glyph', codeString: 'B138' },
  PP_SANC: { type: 'shape', codeString: 'C8', anchorOffsetY: 2 },
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

const PLACED = [
  ['PP_ANC;;B81', 'B291;;B81:,2'],
  ['PP_ANC;B81', 'B291;B81:,2'],
  ['PP_ANCX;B81', 'B291;B81:4.5'],
  ['PP_ANCX;;B81', 'B291;;B81:4.5'],
  ['PP_ANC2;B81', 'B291;B81:4,2'],
  ['PP_NEWX;;B81', 'B291;C8;;B81:4.5'],
  // note: a written 0 is a position; left out, B138's own anchor would move B81
  ['PP_W138Z;;B81', 'B138;;B81:,0'],
  ['PP_ALANC;;B81', 'B291;;B81:,2'],
  ['PP_ANC;;B86;B81', 'B291;;B86:,2;B81:,2'],
  // pins the semantic root the word's merge keeps: it reuses the head's own
  // B97, so the position is written on the head's part
  ['PP_ANC;B97;;B81', 'B291;B97:,2;;B81:,2'],
  // the word's codes go onto its head, which B937 is skipped as
  ['B937/PP_ANC;;B81', 'B937/B291;;B81:,2'],
  // pins each word's codes as placed with its own head, the last word's unplaced
  ['PP_ANC;;B81//PP_ANC;;B86//B291;;B99', 'B291;;B81:,2//B291;;B86:,2//B291;;B99'],
  // the position follows the code, not the code's name inside its own bracket
  ['PP_ANC;;[data-x=B81]>B81', 'B291;;[data-x=B81]>B81:,2'],
];

const KEPT = [
  ['PP_ANC;;B81:,1', 'B291;;B81:,1'],
  ['PP_ANC;B81:1,0', 'B291;B81:1,0'],
];

const WITH_OPTIONS = '[color=red]PP_ANC;;[color=blue]>B81';

describe('BlissSVGBuilder portable indicator placement', () => {
  describe('when a glyph with an anchor of its own is given an indicator', () => {
    it.each(PLACED)('saves %s as %s, and both default saves reload as drawn', (input, saved) => {
      // regression: the saves wrote the built-in codes alone, whose reload
      // places the indicator by the built-in code's anchor
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn([...codesOfString(string), ...codesOfJson(json)])).toEqual([]);
    });

    it('writes the drawn y into the JSON\'s word-level code of PP_ANC;;B81', () => {
      expect(new BlissSVGBuilder('PP_ANC;;B81').toJSON().groups[0].wordIndicators.codes).toEqual(['B81:,2']);
    });

    it('writes only the drawn x on the JSON part of PP_ANCX;B81', () => {
      // pins writing the axis that differs only: B291's anchor already gives B81 its y
      expect(new BlissSVGBuilder('PP_ANCX;B81').toJSON().groups[0].glyphs[0].parts)
        .toEqual([{ codeName: 'B291' }, { codeName: 'B81', isIndicator: true, width: 2, x: 4.5 }]);
    });

    it('flattens PP_ANC;;B81 to B291;B81:,2, the flattened JSON reloading as drawn too', () => {
      const builder = new BlissSVGBuilder('PP_ANC;;B81');
      const flattened = builder.toString({ flattenIndicators: true });
      expect(flattened).toBe('B291;B81:,2');
      expect(new BlissSVGBuilder(flattened).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ flattenIndicators: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the author wrote a position on the indicator', () => {
    it.each(KEPT)('saves %s as %s, the written position kept', (input, saved) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when options are written beside the indicator', () => {
    it(`saves ${WITH_OPTIONS} with the drawn position beside the options`, () => {
      const builder = new BlissSVGBuilder(WITH_OPTIONS);
      expect(builder.toString()).toBe('[color=red]B291;;[color=blue]>B81:,2');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it(`saves ${WITH_OPTIONS} under omitOptions with the position and no options`, () => {
      const saved = new BlissSVGBuilder(WITH_OPTIONS).toString({ omitOptions: true });
      const cleared = changed(WITH_OPTIONS, (b) => b.clearAllOptions());
      expect(saved).toBe('B291;;B81:,2');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(cleared.svgCode);
    });
  });

  describe('when saved with preserve', () => {
    it('keeps every input as written, the names kept and no position added', () => {
      // control: passes before C25; a preserve save reloads with the
      // definitions, so the glyph's own anchor places the indicator again
      const inputs = [...PLACED, ...KEPT].map(([input]) => input).concat(WITH_OPTIONS);
      const preserved = Object.fromEntries(inputs.map((input) => [input, new BlissSVGBuilder(input).toString({ preserve: true })]));
      expect(preserved).toEqual(Object.fromEntries(inputs.map((input) => [input, input])));
    });
  });

  describe('when the anchored glyph and its indicator meet by another route', () => {
    it.each([
      ['PP_ANC;B86 after replacePart(1, \'B81\')', 'B291;B81:,2', () => changed('PP_ANC;B86', (b) => b.glyph(0).replacePart(1, 'B81'))],
      ['B291;B81 after replacePart(0, \'PP_ANC\')', 'B291;B81:,2', () => changed('B291;B81', (b) => b.glyph(0).replacePart(0, 'PP_ANC'))],
      ['B291 after merge() of PP_ANC;;B81', 'B291//B291;;B81:,2', () => changed('B291', (b) => b.merge(new BlissSVGBuilder('PP_ANC;;B81')))],
      ['an object naming PP_ANC and B81 as parts', 'B291;B81:,2', () => new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'PP_ANC' }, { codeName: 'B81' }] }] }] })],
      ['an object naming PP_ANC with a word-level B81', 'B291;;B81:,2', () => new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'PP_ANC' }] }], wordIndicators: { codes: ['B81'] } }] })],
    ])('saves %s as %s, and both default saves reload as drawn', (_route, saved, build) => {
      const builder = build();
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn([...codesOfString(string), ...codesOfJson(json)])).toEqual([]);
    });
  });

  describe('when an indicator given through the API moves the word\'s head off the anchored glyph', () => {
    it('saves B937/PP_ANC;;B99 given B81 on B937 so both default saves reload as drawn', () => {
      // control: passes before C25. Given B81, B937 becomes a character of two
      // codes, which the head scan does not skip, so the word's B99 goes onto
      // it: the saves must not place B99 by PP_ANC's anchor
      const builder = changed('B937/PP_ANC;;B99', (b) => b.glyph(0).applyIndicators('B81'));
      expect(builder.warnings).toEqual([]);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the built-in codes already place the indicator where it was drawn', () => {
    it.each([
      ['B291;;B81', 'B291;;B81'],
      ['PP_PLAIN;B81', 'B291;C8;B81'],
      ['PP_W138;;B81', 'B138;;B81'],
      ['PP_SANC;B81', 'C8;B81'],
    ])('saves %s as %s, writing no position', (input, saved) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });
});
