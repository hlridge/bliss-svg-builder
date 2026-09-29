/**
 * Pins `preserve` keeping a custom name only while the element still carries
 * every option key that reading the name alone supplies, at every level the
 * name reaches, so a default you removed does not come back on reload.
 *
 * Covers:
 * - A glyph default and a part default removed through `removeOptions`: every
 *   save route reloads what the builder draws.
 * - A default removed inside a part saved by its own name, or inside a part of
 *   a glyph saved by its own name: the `preserve` string spells it out.
 * - A default set to `false`, which no save writes, counting as removed.
 * - A flattened word-level indicator's head that lost its default, saved as a
 *   save without `preserve` saves it.
 * - Names kept while the keys are there: an overriding value, an untouched
 *   element, and a removed default written back; and a changed value on a part
 *   still spelled out by the anatomy comparison the key check adds to.
 * - A renamed part standing alone in its character, judged where its spelling
 *   puts the name's default: on the part in a part slot, on the character when
 *   written as the whole character.
 * - The JSON, which writes a character's parts out beside its name, keeping
 *   the name when only a part lost a default.
 * - A name the DSL cannot read (`define()` accepts one holding a separator,
 *   which only a composition object can name), spelled out in the JSON.
 * - Under `omitOptions`, every name whose definition carries options spelled
 *   out (glyph defaults, part defaults, a code string's brackets, a styled
 *   nested shape, a flattened head), a built-in keeping its code, and no reload
 *   carrying an option.
 *
 * Does NOT cover:
 * - A part-level change without a removed key (moved, recoloured, removed), see
 *   `BlissSVGBuilder.preserve-divergence.test.js`.
 * - A change inside a part saved by its own name reaching the JSON saves, which
 *   drop the part's inner parts and so lose it on every route, see backlog row
 *   "A part saved by its name forgets a change made inside it".
 * - A composition object naming a custom glyph, see
 *   `BlissSVGBuilder.object-route-defaults.test.js`.
 * - A built-in's own look, see `BlissSVGBuilder.builtin-own-look.test.js`.
 * - An untouched character written by an alias that brings defaults, whose
 *   `toJSON({ preserve: true })` reload styles its part on its own, see
 *   backlog row "An untouched character written by a name that brings
 *   defaults reloads from `toJSON({ preserve: true })` with its part styled on
 *   its own".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PR_REDB: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  PR_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  PR_TWO: { type: 'glyph', codeString: '[color=red]>B291;[color=blue]>C8' },
  PR_STYGL: { type: 'glyph', codeString: '[color=red]>B291' },
  PR_NESTED: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'red' } },
  PR_RING: { codeString: 'C2', defaultOptions: { color: 'red' } },
  PR_DOPT: { codeString: 'B431', defaultOptions: { color: 'red' } },
  'PR_SEP/X': { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
};
const DEPENDENT_FIXTURES = {
  PR_MULTI: { type: 'shape', codeString: 'PR_NESTED;HL8:0,8' },
};
const NESTING_FIXTURES = {
  PR_GLMULTI: { type: 'glyph', codeString: 'B291;PR_MULTI' },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
  BlissSVGBuilder.define(DEPENDENT_FIXTURES);
  BlissSVGBuilder.define(NESTING_FIXTURES);
});

afterAll(() => {
  for (const code of [...Object.keys(NESTING_FIXTURES), ...Object.keys(DEPENDENT_FIXTURES), ...Object.keys(FIXTURES)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

// A builder for `code` after `change` has been applied to its first glyph.
const changed = (code, change) => {
  const builder = new BlissSVGBuilder(code);
  change(builder.glyph(0));
  return builder;
};

// What each save route reloads to.
const SAVE_ROUTES = [
  ['toString()', (builder) => new BlissSVGBuilder(builder.toString())],
  ['toString({ preserve: true })', (builder) => new BlissSVGBuilder(builder.toString({ preserve: true }))],
  ['toJSON()', (builder) => new BlissSVGBuilder(builder.toJSON())],
  ['toJSON({ preserve: true })', (builder) => new BlissSVGBuilder(builder.toJSON({ preserve: true }))],
];

// Every options bag a deep save of `builder` carries, as JSON text.
const optionBagsIn = (builder) => JSON.stringify(builder.toJSON({ deep: true })).match(/"options":\{[^}]+\}/g) ?? [];

describe('BlissSVGBuilder preserve removed default', () => {
  describe('when a default the name supplies has been removed', () => {
    it.each(SAVE_ROUTES)('reloads a glyph without its removed default through %s', (_route, reload) => {
      const builder = changed('PR_REDB', (g) => g.removeOptions('color'));
      expect(reload(builder).svgCode).toBe(builder.svgCode);
    });

    it.each(SAVE_ROUTES)('reloads a part without its removed default through %s', (_route, reload) => {
      const builder = changed('B291;PR_SHAPE', (g) => g.part(1).removeOptions('color'));
      expect(reload(builder).svgCode).toBe(builder.svgCode);
    });

    it('spells the glyph out in the preserve string', () => {
      // regression: the name reloaded red
      const builder = changed('PR_REDB', (g) => g.removeOptions('color'));
      expect(builder.toString({ preserve: true })).toBe('B291');
    });

    it('spells the part out in the preserve string, keeping the default that is left', () => {
      // regression: the name reloaded blue
      const builder = changed('B291;PR_SHAPE', (g) => g.part(1).removeOptions('color'));
      expect(builder.toString({ preserve: true })).toBe('B291;[stroke-width=0.5]>C8');
    });

    it('spells a part out when a default was removed inside it', () => {
      const builder = changed('B291;PR_MULTI', (g) => g.part(1).part(0).removeOptions('color'));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291;C8;HL8:0,8');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('spells a glyph out when a default was removed inside one of its parts', () => {
      // note: the string writes the glyph's name alone, and reading it back
      // restores every level the name reaches, its parts' own parts included
      const builder = changed('PR_GLMULTI', (g) => g.part(1).part(0).removeOptions('color'));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291;C8;HL8:0,8');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('counts a default set to false as removed, since no save writes false', () => {
      const builder = changed('PR_REDB', (g) => g.setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291');
      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('saves a flattened head that lost its default as a save without preserve does', () => {
      const builder = changed('PR_REDB;;B81', (g) => g.removeOptions('color'));
      expect(builder.toString({ preserve: true, flattenIndicators: true })).toBe('B291;B81');
      expect(builder.toJSON({ preserve: true, flattenIndicators: true })).toEqual(builder.toJSON({ flattenIndicators: true }));
    });
  });

  describe('when a renamed part stands alone in its character', () => {
    it('keeps the name written in its part slot, where the default sits on the part', () => {
      const builder = new BlissSVGBuilder(';PR_RING');
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('[color=red]>PR_RING');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('spells the part out when it carries options of its own and the default sits on the character', () => {
      // note: a part with options of its own is written in a part slot
      // (`[stroke-width=1]>NAME`), where the name would put its colour on the part
      const builder = changed('PR_DOPT', (g) => g.part(0).setOptions({ 'stroke-width': 1 }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('[color=red][stroke-width=1]>B431');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the JSON writes the parts out beside the name', () => {
    it('keeps the name when only a part lost a default the name supplies', () => {
      // note: the parts are written out, so the name brings back only the
      // character's own options; the string spells this glyph out instead
      const builder = changed('PR_TWO', (g) => g.part(1).removeOptions('color'));
      const json = builder.toJSON({ preserve: true });
      expect(json.groups[0].glyphs[0].codeName).toBe('PR_TWO');
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the DSL cannot read the name', () => {
    it('spells the character out in the JSON, whose reload draws the same', () => {
      // pins a name that does not read as one character vouching for nothing
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ codeName: 'PR_SEP/X', parts: [{ codeName: 'B291' }] }] }] });
      const json = builder.toJSON({ preserve: true });
      expect(json.groups[0].glyphs[0].codeName).toBe('B291');
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the element still carries every key the name supplies', () => {
    it.each([
      ['an overriding value', () => new BlissSVGBuilder('[color=blue]PR_REDB'), '[color=blue]PR_REDB'],
      ['an untouched glyph', () => new BlissSVGBuilder('PR_REDB'), '[color=red]PR_REDB'],
      ['an untouched part', () => new BlissSVGBuilder('B291;PR_SHAPE'), 'B291;[color=blue;stroke-width=0.5]>PR_SHAPE'],
      ['a removed default written back', () => changed('PR_REDB', (g) => { g.removeOptions('color'); g.setOptions({ color: 'red' }); }), '[color=red]PR_REDB'],
    ])('keeps the name for %s', (_label, build, expected) => {
      const builder = build();
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe(expected);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('still spells a glyph out when a part keeps its key with another value', () => {
      // pins the key check as an addition to the anatomy comparison, not a
      // replacement: presence alone would keep PR_TWO and lose the green
      const builder = changed('PR_TWO', (g) => g.part(1).setOptions({ color: 'green' }));
      expect(builder.toString({ preserve: true })).toBe('[color=red]>B291;[color=green]>C8');
    });
  });

  describe('when the flag removes every option from a preserve save', () => {
    it.each([
      ['a glyph with a default', 'PR_REDB', {}, 'B291'],
      ['a part with defaults', 'B291;PR_SHAPE', {}, 'B291;C8'],
      ['a glyph whose code string styles its part', 'PR_STYGL', {}, 'B291'],
      ['a glyph whose code string styles two parts', 'PR_TWO', {}, 'B291;C8'],
      ['a shape whose inner part has a default', 'B291;PR_MULTI', {}, 'B291;C8;HL8:0,8'],
      ['a flattened head with a default', 'PR_REDB;;B81', { flattenIndicators: true }, 'B291;B81'],
    ])('spells out %s', (_label, input, options, expected) => {
      const saved = new BlissSVGBuilder(input).toString({ ...options, preserve: true, omitOptions: true });
      expect(saved).toBe(expected);
      expect(optionBagsIn(new BlissSVGBuilder(saved))).toEqual([]);
    });

    it('keeps a built-in\'s code, whose own look is part of the character', () => {
      expect(new BlissSVGBuilder('[color=red]REFSQUARE').toString({ preserve: true, omitOptions: true })).toBe('REFSQUARE');
    });
  });
});
