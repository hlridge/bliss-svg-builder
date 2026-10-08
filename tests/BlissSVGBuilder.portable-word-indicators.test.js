/**
 * Pins the default saves writing a word-level (`;;`) code named by a custom
 * definition as the built-in indicator codes it draws, each with the
 * definition's options and, where needed, its drawn position, as they write
 * a `;` part; the name stays where no built-in spelling reloads as drawn.
 *
 * Covers:
 * - A bare alias of an indicator, with and without options; a typed
 *   indicator, with and without an x anchor of its own; a compound; an alias
 *   of the plural indicator: the default string and the JSON's word-level
 *   codes, each reloading as drawn and naming only built-in codes.
 * - Options written on the code over the definition's, a position, a
 *   leading `!`, a code beside a built-in one (written as stored), an
 *   anchored head, a head of several codes, a head whose own compound the
 *   code replaces, a built-in code after a compound, and a built-in's own
 *   look left unwritten.
 * - `omitOptions`, which keeps the definition's own options.
 * - Codes given by `group(0).applyIndicators()`.
 * - The flattened saves, which write the code as a part where it was drawn.
 * - `preserve` and the deep JSON, which keep every name.
 * - The names that stay: a definition with no `;;` spelling (a plain shape, a
 *   compound holding a plain part), one whose spelling would meet the head's
 *   parts otherwise (the semantic root reordered, a head part reused, a part
 *   the head's own compound is written as reused), still written where it
 *   was drawn, and one whose definition was removed after the build.
 * - Today's behaviour where a head's own custom indicator meets the word's
 *   codes (backlog: "A word's `;;` overlay resolves against a head part a
 *   portable save spelled out"): `preserve` reloads as drawn, the default
 *   string does not.
 *
 * Does NOT cover:
 * - A built-in `;;` code placed by an anchored glyph, see
 *   `BlissSVGBuilder.portable-indicator-placement.test.js`.
 * - The head marker a save writes where a word's codes would land on another
 *   character, see `BlissSVGBuilder.portable-head-marker.test.js`.
 * - Clearing a definition's own options, see
 *   `BlissSVGBuilder.definition-options-kept.test.js`.
 *
 * The spelled-out saves are one it.each data table (the guide's sanctioned
 * inline-table form), which takes the file past the ~30-test soft cap;
 * splitting it would part the rows from the one assertion set they share.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PW_REN: { codeString: 'B81' },
  PW_RED: { codeString: 'B81', defaultOptions: { color: 'red' } },
  PW_TY: { type: 'glyph', isIndicator: true, codeString: 'B86' },
  PW_IANCX: { type: 'glyph', isIndicator: true, codeString: 'B86', anchorOffsetX: 0.5 },
  PW_BAKED: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' },
  PW_PLURAL: { codeString: 'B99' },
  PW_RING: { type: 'glyph', isIndicator: true, codeString: 'C2' },
  PW_MIXED: { type: 'glyph', isIndicator: true, codeString: 'B270;B86' },
  PW_ANC: { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
  PW_AR: { codeString: 'ANCHORRING' },
  PW_NEWX: { type: 'glyph', codeString: 'B291;C8', anchorOffsetX: 1.5 },
  PW_PAIR: { type: 'glyph', isIndicator: true, codeString: 'B86;B99:3,0' },
  PW_THING: { codeString: 'B97' },
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

const SPELLED = [
  ['B291;;PW_REN', 'B291;;B81', ['B81']],
  ['B291;;PW_RED', 'B291;;[color=red]>B81', ['[color=red]>B81']],
  ['B291;;PW_TY', 'B291;;B86', ['B86']],
  ['B291;;PW_IANCX', 'B291;;B86:2.5', ['B86:2.5']],
  ['B291;;PW_BAKED', 'B291;;B97;B99:4.5,0', ['B97', 'B99:4.5,0']],
  ['B291;;PW_PLURAL', 'B291;;B99', ['B99']],
  ['B291;;[color=green]>PW_RED', 'B291;;[color=green]>B81', ['[color=green]>B81']],
  ['B291;;PW_REN:,1', 'B291;;B81:,1', ['B81:,1']],
  ['B291;;B86;PW_REN', 'B291;;B86;B81', ['B86', 'B81']],
  // note: the JSON carries a leading `!` as the word's stripSemantic flag, not in its codes
  ['B291;;!PW_REN', 'B291;;!B81', ['B81']],
  ['PW_ANC;;PW_REN', 'B291;;B81:,2', ['B81:,2']],
  ['B291;;PW_BAKED;B81', 'B291;;B97;B99:3,0;B81', ['B97', 'B99:3,0', 'B81']],
  // pins the look a built-in code brings (ANCHORRING's dotted line) left
  // unwritten, as the code writes it again
  ['B291;;PW_AR', 'B291;;ANCHORRING', ['ANCHORRING']],
  // pins a built-in code beside a custom one written as stored
  ['B291;;[x=1]>B86;PW_REN', 'B291;;[x=1]>B86;B81', ['[x=1]>B86', 'B81']],
  // pins a head spelled out into several codes read back part by part
  ['PW_NEWX;;PW_REN', 'B291;C8;;B81:4.5', ['B81:4.5']],
  // pins the code replacing every part the head's own compound is written
  // as, as it replaced the compound
  ['B291;PW_PAIR;;PW_REN', 'B291;B86;B99:3,0;;B81', ['B81']],
];

const APPLIED = [
  ['PW_REN', 'B291;;B81'],
  ['PW_BAKED', 'B291;;B97;B99:4.5,0'],
];

describe('BlissSVGBuilder portable word indicators', () => {
  describe('when a word-level code is named by a custom definition', () => {
    it.each(SPELLED)('saves %s as %s, with the JSON\'s word-level codes %j, each reloading as drawn', (input, saved, codes) => {
      // regression: the default saves kept the name, which an instance
      // without the definition draws as no indicator (identical on v1.0.0)
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(json.groups[0].wordIndicators.codes).toEqual(codes);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn([...codesOfString(string), ...codesOfJson(json)])).toEqual([]);
    });
  });

  describe('when saved without options', () => {
    it.each([
      ['B291;;PW_RED', 'B291;;[color=red]>B81'],
      ['B291;;[color=green]>PW_RED', 'B291;;[color=red]>B81'],
    ])('saves %s as %s, keeping the definition\'s own options', (input, saved) => {
      // note: a definition's options belong to its code, so leaving out the
      // options written in the composition keeps them, as clearAllOptions() does
      const string = new BlissSVGBuilder(input).toString({ omitOptions: true });
      const cleared = changed(input, (b) => b.clearAllOptions());
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(cleared.svgCode);
    });
  });

  describe('when the code is given by group(0).applyIndicators', () => {
    it.each(APPLIED)('saves B291 given %s as %s, both default saves reloading as drawn', (code, saved) => {
      const builder = changed('B291', (b) => b.group(0).applyIndicators(code));
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the code is saved flattened', () => {
    it.each([
      // control: passes before C25
      ['B291;;PW_REN', 'B291;B81'],
      ['B291;;PW_IANCX', 'B291;B86:2.5'],
    ])('flattens %s to %s, in the string and the JSON, each reloading as drawn', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString({ flattenIndicators: true });
      const json = builder.toJSON({ flattenIndicators: true });
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(json).toString()).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when saved with preserve, or as the deep JSON', () => {
    it('keeps every name, as written', () => {
      // control: passes before C25
      const inputs = SPELLED.map(([input]) => input);
      const preserved = Object.fromEntries(inputs.map((input) => [input, new BlissSVGBuilder(input).toString({ preserve: true })]));
      expect(preserved).toEqual(Object.fromEntries(inputs.map((input) => [input, input])));
      expect(APPLIED.map(([code]) => changed('B291', (b) => b.group(0).applyIndicators(code)).toString({ preserve: true })))
        .toEqual(['B291;;PW_REN', 'B291;;PW_BAKED']);
    });

    it.each(['PW_REN', 'PW_BAKED'])('keeps B291;;%s named in the deep and the preserve JSON', (code) => {
      // control: passes before C25; those views keep what the composition stores
      const builder = new BlissSVGBuilder(`B291;;${code}`);
      expect(builder.toJSON({ deep: true }).groups[0].wordIndicators.codes).toEqual([code]);
      expect(builder.toJSON({ preserve: true }).groups[0].wordIndicators.codes).toEqual([code]);
    });
  });

  describe('when no built-in spelling of the code reloads as drawn', () => {
    it.each([
      // note: a word-level list holds indicators only; these spell out to a plain part
      ['B291;;PW_RING', 'PW_RING'],
      ['B291;;PW_MIXED', 'PW_MIXED'],
      // note: spelled out as B86, the code would be merged before the head's
      // semantic root B97, drawing the two in the other order
      ['B291;B97;;PW_IANCX', 'PW_IANCX'],
      // note: spelled out as B81, the code would reuse the head's own B81,
      // with its options and position, where the name replaces it
      ['B291;B81;;PW_REN', 'PW_REN'],
    ])('keeps the name in both default saves of %s, which reload here as drawn', (input, code) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(input);
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual([code]);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      // control: passes before C25. Pins the reuse a spelled-out code would
      // make: as B97 it would take the B97 the head's own compound is written
      // as, where the name replaced the compound
      ['B291;PW_BAKED;;PW_THING', 'B291;B97;B99:3,0;;PW_THING', 'PW_THING'],
      // pins the name that stays still written where it was drawn: spelled
      // out as B81, the code would reuse the head's own B81
      ['PW_ANC;B81;;PW_REN', 'B291;B81;;PW_REN:,2', 'PW_REN:,2'],
    ])('keeps the name in both default saves of %s, saving %s, which reloads here as drawn', (input, saved, code) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual([code]);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('keeps the name of a code whose definition was removed after the build', () => {
      // control: passes before C25. Pins a code the registry no longer
      // holds, which has nothing to spell out into, kept as written in both
      // default saves
      const { errors } = BlissSVGBuilder.define({ PW_GONE: { codeString: 'B81' } });
      expect(errors).toEqual([]);
      const builder = new BlissSVGBuilder('B291;;PW_GONE');
      BlissSVGBuilder.removeDefinition('PW_GONE');
      expect(builder.toString()).toBe('B291;;PW_GONE');
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(['PW_GONE']);
    });
  });

  describe('when a head\'s own custom indicator meets the word\'s codes', () => {
    it.each(['B291;PW_BAKED', 'B291;PW_RED', 'PW_BAKED'])(
      'reloads %s given B81 by group(0).applyIndicators as drawn from preserve, not from the default string', (input) => {
        // control: passes before C25. Pins backlog row "A word's `;;` overlay
        // resolves against a head part a portable save spelled out": the
        // word's codes meet the head's parts by code, so the spelled-out parts
        // resolve otherwise, which no written position changes
        const builder = changed(input, (b) => b.group(0).applyIndicators('B81'));
        expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
        expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
      });
  });
});
