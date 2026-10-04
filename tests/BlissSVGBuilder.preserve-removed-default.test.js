/**
 * Pins `preserve` keeping a custom name only while the element still carries
 * every option key that reading the name alone supplies, at every level the
 * name reaches, so a default you removed does not come back on reload.
 *
 * Covers:
 * - A default set to `false` on the one part a glyph written alone is, and on
 *   a part named by a definition: every save route reloads what the builder
 *   draws. A definition's options are part of what its code is, so
 *   `removeOptions` on a part named by one returns them; `false` is how a part
 *   leaves one out.
 * - A default set to `false` inside a part saved by its own name, or inside a
 *   part of a glyph saved by its own name: the `preserve` string spells it out.
 * - A default set to `false`, which no save writes, counting as removed; the
 *   same key set to `false` on the character reaching no option of the
 *   definition's, so the name stays.
 * - A flattened word-level indicator's head that lost its default, saved as a
 *   save without `preserve` saves it.
 * - Names kept while the keys are there: a value of the key on the character,
 *   an overriding part value, an untouched element, and a removed default
 *   written back; and a changed value on a part still written out by the
 *   anatomy comparison the key check adds to.
 * - A renamed part standing alone in its character: saved by its name alone,
 *   the alias's default on the part not repeated, and the save's reload
 *   saving the same; an option of the part's own written in a part bracket
 *   beside the name.
 * - The JSON, which writes a character's parts out beside its name, keeping
 *   the name when only a part lost a default.
 * - A name the DSL cannot read (`define()` accepts one holding a separator,
 *   which only a composition object can name), spelled out in the JSON.
 * - Under `omitOptions`, a name whose definition carries options kept, since
 *   its options are the definition's: written alone (glyph defaults, a code
 *   string's brackets, a flattened head) or naming a part (part defaults, a
 *   styled nested shape); and a built-in keeping its code.
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
 * - An untouched character written by an alias that brings defaults,
 *   reloading from `toJSON({ preserve: true })` as the builder draws it, see
 *   `BlissSVGBuilder.alias-options-on-parts.test.js`.
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

// Every path and transform in the content group, joined, so a styled part drawn
// as a <path> of its own compares equal to the same part merged into its neighbour.
const inkOf = (svg) => [...svg.slice(svg.indexOf('class="bliss-content"')).matchAll(/ (?:d|transform)="([^"]*)"/g)]
  .map((match) => match[1])
  .join('');

describe('BlissSVGBuilder preserve removed default', () => {
  describe('when a default the name supplies has been removed', () => {
    it.each(SAVE_ROUTES)('reloads a glyph without its removed default through %s', (_route, reload) => {
      // re-pinned at C23 (D2, D8): was `removeOptions('color')` on the
      // character, which removes nothing now: the default is on the one part
      // the glyph is, where `false` is how it is left out, so the reload is
      // compared as the part rows below compare theirs
      const builder = changed('PR_REDB', (g) => g.part(0).setOptions({ color: false }));
      expect(inkOf(reload(builder).svgCode)).toBe(inkOf(builder.svgCode));
      expect(reload(builder).svgCode).not.toContain('stroke="red"');
    });

    it.each(SAVE_ROUTES)('reloads a part without a default set to false through %s', (_route, reload) => {
      // note: the builder draws `false` as an attribute value no save writes
      // (backlog row "A `false` option value: admitted in silence for a text
      // option, and dropped by `toString()`"), so the reload is compared by its
      // ink and the colour it must not bring back
      const builder = changed('B291;PR_SHAPE', (g) => g.part(1).setOptions({ color: false }));
      expect(inkOf(reload(builder).svgCode)).toBe(inkOf(builder.svgCode));
      expect(reload(builder).svgCode).not.toContain('stroke="blue"');
    });

    it('spells the glyph out in the preserve string', () => {
      // regression: the name reloaded red. Re-pinned at C23 (D2, D8): the
      // default is left out on the one part the glyph is, not removed from
      // the character, which holds none of it
      const builder = changed('PR_REDB', (g) => g.part(0).setOptions({ color: false }));
      expect(builder.toString({ preserve: true })).toBe('B291');
    });

    it('spells the part out in the preserve string, keeping the default that is left', () => {
      // regression: the name reloaded blue
      const builder = changed('B291;PR_SHAPE', (g) => g.part(1).setOptions({ color: false }));
      expect(builder.toString({ preserve: true })).toBe('B291;[stroke-width=0.5]>C8');
    });

    it('spells a part out when a default was set to false inside it', () => {
      const builder = changed('B291;PR_MULTI', (g) => g.part(1).part(0).setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291;C8;HL8:0,8');
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(builder.svgCode));
      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('spells a glyph out when a default was set to false inside one of its parts', () => {
      // note: the string writes the glyph's name alone, and reading it back
      // restores every level the name reaches, its parts' own parts included.
      // Re-pinned at C23 (D2): the glyph's parts are inside the one part it
      // is, so the part is reached one level further down
      const builder = changed('PR_GLMULTI', (g) => g.part(0).part(1).part(0).setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291;C8;HL8:0,8');
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(builder.svgCode));
      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('counts a default set to false on its part as removed, since no save writes false', () => {
      // re-pinned at C23 (D2): was `false` on the character, which the default
      // no longer sits on (that case is the row below)
      const builder = changed('PR_REDB', (g) => g.part(0).setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('B291');
      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('keeps the name when the character sets the default\'s key to false, which reaches no option of the definition\'s', () => {
      // re-pinned at C23 (D2, D7): was "counts a default set to false as
      // removed" (saved `B291`). A character option does not restyle the
      // definition's part, so the colour stays, and so does the name
      const builder = changed('PR_REDB', (g) => g.setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('PR_REDB');
      expect(builder.svgCode).toContain('stroke="red"');
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(builder.svgCode));
      expect(new BlissSVGBuilder(saved).svgCode).toContain('stroke="red"');
    });

    it('saves a flattened head that lost its default as a save without preserve does', () => {
      // re-pinned at C23 (D2, D8): was `removeOptions('color')` on the
      // character, and the JSON equal to the save without preserve. The
      // default is left out on the head's named part now, so the JSON keeps
      // the name beside the part it writes out, as the row on the JSON below
      // says, and reloads what the builder draws
      const builder = changed('PR_REDB;;B81', (g) => g.part(0).setOptions({ color: false }));
      expect(builder.toString({ preserve: true, flattenIndicators: true })).toBe('B291;B81');
      expect(builder.toString({ preserve: true, flattenIndicators: true })).toBe(builder.toString({ flattenIndicators: true }));
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true, flattenIndicators: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a renamed part stands alone in its character', () => {
    it('keeps the name alone where the default on the part is the definition\'s own', () => {
      // note: a definition's options are part of what its code is, so the
      // save does not repeat them as a part bracket
      const builder = new BlissSVGBuilder(';PR_RING');
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('PR_RING');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      // an alias written alone holds its options on its part too (C23 D4), so
      // the save's own reload saves the same
      expect(new BlissSVGBuilder(saved).toString({ preserve: true })).toBe(saved);
    });

    it('keeps the name with an option of the part\'s own written in a part bracket', () => {
      // re-pinned at C23 (D4): was "spells the part out when it carries
      // options of its own and the default sits on the character". An alias's
      // default now sits on its part, where the part slot that a part bracket
      // reads the name in puts it too, so the name is kept and the default is
      // not repeated
      const builder = changed('PR_DOPT', (g) => g.part(0).setOptions({ 'stroke-width': 1 }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('[stroke-width=1]>PR_DOPT');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the JSON writes the parts out beside the name', () => {
    it('keeps the name when only a part lost a default the name supplies', () => {
      // note: the parts are written out, so the name brings back only the
      // character's own options; the string spells this glyph out instead.
      // Re-pinned at C23 (D2): was `part(1).removeOptions('color')` on a lone
      // PR_TWO, whose bracketed parts sit inside the one part it is now, where
      // a change is backlog row "A part saved by its name forgets a change
      // made inside it"; the part a lone PR_REDB is leaves its default out
      const builder = changed('PR_REDB', (g) => g.part(0).setOptions({ color: false }));
      const json = builder.toJSON({ preserve: true });
      expect(json.groups[0].glyphs[0].codeName).toBe('PR_REDB');
      expect(builder.toString({ preserve: true })).toBe('B291');
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
    // re-pinned at C23 (D2, D7, D8): a lone PR_REDB is one part named after it,
    // carrying the default, so the character holds none. A character value of
    // the key is the author's own, saved as written, and does not override
    // the default (was "an overriding value"); the part bracket does; the
    // untouched glyph is saved by its name alone (was `[color=red]PR_REDB`);
    // the default is written back on the part (was removed and written back
    // on the character, which removes nothing now)
    it.each([
      ['a value of the key on the character', () => new BlissSVGBuilder('[color=blue]PR_REDB'), '[color=blue]PR_REDB'],
      ['an overriding value', () => new BlissSVGBuilder('[color=blue]>PR_REDB'), '[color=blue]>PR_REDB'],
      ['an untouched glyph', () => new BlissSVGBuilder('PR_REDB'), 'PR_REDB'],
      // note: the part's defaults are the definition's own, so the name alone
      // brings them back
      ['an untouched part', () => new BlissSVGBuilder('B291;PR_SHAPE'), 'B291;PR_SHAPE'],
      ['a removed default written back', () => changed('PR_REDB', (g) => { g.part(0).setOptions({ color: false }); g.part(0).setOptions({ color: 'red' }); }), 'PR_REDB'],
    ])('keeps the name for %s', (_label, build, expected) => {
      const builder = build();
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe(expected);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('still spells a glyph out when a part keeps its key with another value', () => {
      // pins the key check as an addition to the anatomy comparison, not a
      // replacement: presence alone would keep PR_REDB and lose the green.
      // Re-pinned at C23 (D2): was part 1 of a lone PR_TWO, for the reason the
      // JSON row above gives; the glyph's own part keeps its name with the
      // green beside it (was `[color=red]>B291;[color=green]>C8`)
      const builder = changed('PR_REDB', (g) => g.part(0).setOptions({ color: 'green' }));
      expect(builder.toString({ preserve: true })).toBe('[color=green]>PR_REDB');
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the flag removes every option from a preserve save', () => {
    it.each([
      ['a part with defaults', 'B291;PR_SHAPE', {}, 'B291;PR_SHAPE'],
      ['a shape whose inner part has a default', 'B291;PR_MULTI', {}, 'B291;PR_MULTI'],
      // re-pinned at C23 (D2, D8): these four were spelled out (`B291`,
      // `B291`, `B291;C8`, `B291;B81`) with no option left in the reload.
      // Written alone, each is one part named after its definition, whose
      // options are the definition's, as a part's are above
      ['a glyph with a default', 'PR_REDB', {}, 'PR_REDB'],
      ['a glyph whose code string styles its part', 'PR_STYGL', {}, 'PR_STYGL'],
      ['a glyph whose code string styles two parts', 'PR_TWO', {}, 'PR_TWO'],
      ['a flattened head with a default', 'PR_REDB;;B81', { flattenIndicators: true }, 'PR_REDB;B81'],
    ])('keeps the name of %s, whose options are the definition\'s', (_label, input, options, expected) => {
      // note: what a part named by a definition brings is part of its code,
      // and what sits inside it is the definition's, so nothing is left out
      const saved = new BlissSVGBuilder(input).toString({ ...options, preserve: true, omitOptions: true });
      expect(saved).toBe(expected);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(new BlissSVGBuilder(input).svgCode);
    });

    it('keeps a built-in\'s code, whose own look is part of the code', () => {
      expect(new BlissSVGBuilder('[color=red]REFSQUARE').toString({ preserve: true, omitOptions: true })).toBe('REFSQUARE');
    });
  });
});
