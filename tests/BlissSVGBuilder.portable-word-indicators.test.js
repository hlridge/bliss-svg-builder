/**
 * Pins the default saves writing a word-level (`;;`) code named by a custom
 * definition as the built-in indicator codes it draws, each with the
 * definition's options and, where needed, its drawn position, as they write
 * a `;` part; a plain part among them is written on the head, and the name
 * stays only where no built-in code can spell it.
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
 * - Codes with no like-for-like built-in spelling, spelled out all the same:
 *   a plain shape and a compound holding a plain part (the plain part on the
 *   head), and codes whose spelling meets the head's parts otherwise (the
 *   semantic root reordered, a head part reused, a part the head's own
 *   compound is written as reused), each written where it was drawn. The
 *   name that stays: one whose definition was removed after the build.
 * - Where a head's own custom indicator meets the word's codes (backlog: "A
 *   word's `;;` overlay resolves against a head part a portable save spelled
 *   out"): a name of one code is reused as that code, so the default string
 *   reloads as drawn; a compound of several codes is replaced whole, and
 *   only `preserve` reloads as drawn.
 * - A custom indicator drawn from one plain shape that the word's codes
 *   replace, spelled out where it showed (base ink and place kept in an
 *   instance without the definition); a word-level code spelling out only
 *   into such a part, written as a part of the head; a word-level name of one
 *   code meeting that code on the head, spelled out.
 *
 * Does NOT cover:
 * - A built-in `;;` code placed by an anchored glyph, see
 *   `BlissSVGBuilder.portable-indicator-placement.test.js`.
 * - The head marker a save writes where a word's codes would land on another
 *   character, see `BlissSVGBuilder.portable-head-marker.test.js`.
 * - A plain part taken off a code meeting the head's own parts or another
 *   code, a word whose codes all go to the head, and a digit or full stop as
 *   the head, see `BlissSVGBuilder.portable-word-plain-parts.test.js`.
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

// Each part of the first character: its code and where it is drawn.
const partsAt = (builder) => builder.snapshot().children[0].children[0].children
  .map((part) => ({ codeName: part.codeName, x: part.x, y: part.y }));

// What a builder draws whatever the drawing order: its frame and every
// subpath it strokes, sorted.
const inkOf = (builder) => [builder.svgCode.match(/viewBox="[^"]*"/)[0],
  ...[...builder.svgCode.matchAll(/ d="([^"]+)"/g)].flatMap(([, d]) => d.split(/(?=M)/)).sort()];

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

  describe('when the code\'s built-in spelling is not its name like for like', () => {
    it.each([
      // note: a word-level list holds indicators only, so the plain circle is
      // written on the head where it was drawn
      ['B291;;PW_RING', 'B291;C2:3', null],
      // note: the plain part goes to the head and the indicator stays at word
      // level (owner, 2026-10-12)
      ['B291;;PW_MIXED', 'B291;B270:3;;B86', ['B86']],
      // note: spelled out as B81, the code reuses the head's own B81, which
      // the name replaced; both are drawn in the same place
      ['B291;B81;;PW_REN', 'B291;B81;;B81', ['B81']],
      // note: spelled out as B97, the code takes the B97 the head's own
      // compound is written as, where the name replaced the compound
      ['B291;PW_BAKED;;PW_THING', 'B291;B97;B99:3,0;;B97', ['B97']],
      // pins the head part the code reuses written where it was drawn
      ['PW_ANC;B81;;PW_REN', 'B291;B81:,2;;B81', ['B81']],
    ])('spells %s out as %s in both default saves, each reloading as drawn', (input, saved, codes) => {
      // re-pinned (H chunk Task 5, 2026-10-12): the default saves kept these
      // names; they never write one now (C25's name-keeping withdrawn)
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(builder.toJSON().groups[0].wordIndicators?.codes ?? null).toEqual(codes);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('spells B291;B97;;PW_IANCX out as B291;B97:1.5;;B86:4.5, which reloads with the same ink drawn in another order', () => {
      // re-pinned (H chunk Task 5, 2026-10-12): spelled out as B86, the code
      // is merged before the head's semantic root B97, where the name came
      // after it; each is written where it was drawn
      const builder = new BlissSVGBuilder('B291;B97;;PW_IANCX');
      expect(builder.toString()).toBe('B291;B97:1.5;;B86:4.5');
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(['B86:4.5']);
      expect(inkOf(new BlissSVGBuilder(builder.toString()))).toEqual(inkOf(builder));
      expect(inkOf(new BlissSVGBuilder(builder.toJSON()))).toEqual(inkOf(builder));
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

  describe('when the word\'s codes replace a custom indicator drawn from one plain shape on the head', () => {
    it.each([
      ['written with the word\'s code', 'B291;PW_RING;;B81', () => {}],
      ['given B81 by group(0).applyIndicators', 'B291;PW_RING', (b) => b.group(0).applyIndicators('B81')],
    ])('spells the indicator out where it shows before the codes replace it, %s (%s)', (_label, input, change) => {
      // regression (H chunk P6): the default string wrote the circle with no
      // position, so a reload drew it at the character's origin
      const builder = changed(input, change);
      const saved = builder.toString();
      expect(saved).toBe('B291;C2:3;;B81');
      expect(builder.toString({ omitOptions: true })).toBe('B291;C2:3;;B81');
      expect(notBuiltIn([...codesOfString(saved), ...codesOfJson(builder.toJSON())])).toEqual([]);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(builder.toString({ flattenIndicators: true })).toBe('B291;B81');
      expect(builder.toString({ preserve: true })).toBe('B291;PW_RING;;B81');
    });

    it('reloads in an instance without the definition with the base and the circle where the indicator showed', () => {
      // note: a plain circle is no indicator, so the word's code no longer
      // replaces it; the base ink and the circle's place are what a built-in
      // spelling can keep (the owner's best-effort rule for the default save)
      const { errors } = BlissSVGBuilder.define({ PW_CIRCLE: { type: 'glyph', isIndicator: true, codeString: 'C2' } });
      expect(errors).toEqual([]);
      const shown = partsAt(new BlissSVGBuilder('B291;PW_CIRCLE'));
      const saved = new BlissSVGBuilder('B291;PW_CIRCLE;;B81').toString();
      BlissSVGBuilder.removeDefinition('PW_CIRCLE');
      const reloaded = new BlissSVGBuilder(saved);
      expect(reloaded.warnings).toEqual([]);
      expect(partsAt(reloaded).slice(0, 2)).toEqual(shown);
    });
  });

  describe('when a word-level code spells out only into a part a word-level list cannot hold', () => {
    it('writes it as a part of the head where it is drawn, in both default saves', () => {
      // regression (H chunk, C25's D8 withdrawn): the default saves kept the
      // name, which an instance without the definition draws as nothing
      const builder = new BlissSVGBuilder('B291;;PW_RING');
      const json = builder.toJSON();
      expect(builder.toString()).toBe('B291;C2:3');
      expect(builder.toString({ omitOptions: true })).toBe('B291;C2:3');
      expect(json.groups[0].wordIndicators).toBeUndefined();
      expect(notBuiltIn([...codesOfString(builder.toString()), ...codesOfJson(json)])).toEqual([]);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
      expect(builder.toString({ flattenIndicators: true })).toBe('B291;C2:3');
      expect(builder.toString({ preserve: true })).toBe('B291;;PW_RING');
    });
  });

  describe('when a word-level name of one code meets that code on the head', () => {
    it('saves B291;B81;;PW_REN as B291;B81;;B81, which reloads as drawn', () => {
      // regression (H chunk, F3 with C25's D8 withdrawn): the name stayed
      // because the spelled-out B81 would reuse the head's own, which the name
      // replaced; reused as the code it names, the spelling holds
      const builder = new BlissSVGBuilder('B291;B81;;PW_REN');
      expect(builder.toString()).toBe('B291;B81;;B81');
      expect(builder.toString({ omitOptions: true })).toBe('B291;B81;;B81');
      expect(builder.toJSON().groups[0].wordIndicators.codes).toEqual(['B81']);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(builder.toString({ flattenIndicators: true })).toBe('B291;B81');
      expect(builder.toString({ preserve: true })).toBe('B291;B81;;PW_REN');
    });
  });

  describe('when a head\'s own custom indicator meets the word\'s codes', () => {
    it.each(['B291;PW_BAKED', 'PW_BAKED'])(
      'reloads %s given B81 by group(0).applyIndicators as drawn from preserve, not from the default string', (input) => {
        // control: passes before C25. Pins backlog row "A word's `;;` overlay
        // resolves against a head part a portable save spelled out": the
        // word's codes replace a compound of several codes whole, while its
        // spelled-out parts meet them one by one, which no written position
        // changes
        const builder = changed(input, (b) => b.group(0).applyIndicators('B81'));
        expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
        expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
      });

    it('reloads B291;PW_RED given B81 by group(0).applyIndicators as drawn from preserve and from the default string', () => {
      // re-pinned (H chunk Task 5, 2026-10-12): the word's B81 now reuses the
      // head's red B81 written through a name, as it reuses [color=red]>B81,
      // so the spelled-out string reloads as drawn
      const builder = changed('B291;PW_RED', (b) => b.group(0).applyIndicators('B81'));
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(builder.svgCode).toContain('stroke="red"');
    });
  });
});
