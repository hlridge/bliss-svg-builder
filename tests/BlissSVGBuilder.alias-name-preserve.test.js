/**
 * Pins `preserve` keeping the name a part was read through in every save,
 * each save reloading as drawn: the deep JSON writes that name with nothing
 * below it, and an alias of a typed shape or glyph of several codes keeps its
 * name when it brings options or a position.
 *
 * Covers:
 * - `toJSON({ deep: true, preserve: true })` of a part read through a name
 *   that places its code (a built-in, an indicator, `REFSQUARE`, an alias of
 *   one with options of its own), or through to a typed shape or glyph of
 *   several codes, placed or not: in a slot, written alone, with a position
 *   or a part bracket where it is used, through `addPart()`, a composition
 *   object and `merge()`. Its reload draws byte-identical with the same
 *   reports, and every save of that reload is the original's.
 * - The part that save writes: the name and its options, with nothing below
 *   it; a typed definition's own name keeps the parts below it, in a slot and
 *   written alone.
 * - `preserve` keeping the name of an alias of a typed shape or glyph of
 *   several codes that brings options or a position: alone, in a slot,
 *   through an alias of it, with a position or a part bracket where it is
 *   used; each `preserve` save reloading byte-identical.
 *
 * Does NOT cover:
 * - The default saves of such an alias, which spell its codes out as parts
 *   of the character: the same ink, grouped otherwise on reload.
 * - What an alias in a slot draws, see
 *   `BlissSVGBuilder.alias-in-part-slot.test.js`; its other saves, see
 *   `BlissSVGBuilder.alias-in-part-slot-routes.test.js`.
 * - The string saves of an alias of a positioned code, see
 *   `BlissSVGBuilder.alias-over-held-defaults.test.js`.
 * - A typed definition's own name under `preserve`, see
 *   `BlissSVGBuilder.typed-name-preserve.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// The codes the aliases below name, defined first so each alias names a code
// that exists when it is defined. The last three place the code they name.
const TARGETS = {
  NP_SHAPE: { type: 'shape', codeString: 'HL8;VL8' },
  NP_GLYPH: { type: 'glyph', codeString: 'B291;C8' },
  NP_SHAPE1: { type: 'shape', codeString: 'HL8' },
  NP_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  NP_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
  NP_POS: { codeString: 'B291:1,0' },
  NP_PIND: { codeString: 'B81:1,0' },
  NP_RSQ: { codeString: 'REFSQUARE:1,0' },
};

const ALIASES = {
  NP_AS: { codeString: 'NP_SHAPE' },
  NP_ASB: { codeString: 'NP_SHAPE', defaultOptions: { color: 'blue' } },
  NP_PS: { codeString: 'NP_SHAPE:1,0' },
  NP_PSB: { codeString: 'NP_SHAPE:1,0', defaultOptions: { color: 'blue' } },
  NP_AG: { codeString: 'NP_GLYPH' },
  NP_PG: { codeString: 'NP_GLYPH:1,0' },
  NP_PGB: { codeString: 'NP_GLYPH:1,0', defaultOptions: { color: 'blue' } },
  NP_PS1B: { codeString: 'NP_SHAPE1:1,0', defaultOptions: { color: 'blue' } },
  NP_APOS: { codeString: 'NP_POS', defaultOptions: { color: 'blue' } },
  NP_A2: { codeString: 'NP_A1', defaultOptions: { color: 'blue' } },
  NP_ARED: { codeString: 'NP_RED', defaultOptions: { color: 'blue' } },
};

const OF_ALIASES = {
  NP_ALPSB: { codeString: 'NP_PSB' },
};

beforeAll(() => {
  for (const fixtures of [TARGETS, ALIASES, OF_ALIASES]) {
    const { defined, errors } = BlissSVGBuilder.define(fixtures);
    expect(errors).toEqual([]);
    expect(defined).toEqual(Object.keys(fixtures));
  }
});

afterAll(() => {
  for (const code of [...Object.keys(OF_ALIASES), ...Object.keys(ALIASES), ...Object.keys(TARGETS)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

const deepPreserveOf = (builder) => builder.toJSON({ deep: true, preserve: true });

const reportsOf = (builder) => builder.warnings.map(({ code, source }) => [code, source]);

// Every save a caller can make of `builder`, by how it was made.
const savesOf = (builder) => ({
  string: builder.toString(),
  preserveString: builder.toString({ preserve: true }),
  json: builder.toJSON(),
  preserveJson: builder.toJSON({ preserve: true }),
  deepJson: builder.toJSON({ deep: true }),
  deepPreserveJson: deepPreserveOf(builder),
});

// The part at `index` of the first character a deep preserve save writes.
const deepPreservePartOf = (input, index) => deepPreserveOf(new BlissSVGBuilder(input)).groups[0].glyphs[0].parts[index];

describe('BlissSVGBuilder alias name preserve', () => {
  describe('when a part read through a name is reloaded from its deep preserve JSON', () => {
    it.each([
      'B313;NP_POS', 'NP_POS', 'B313;NP_POS:2,3', 'B313;[color=green]>NP_POS',
      'B313;NP_APOS', 'NP_APOS', 'B291;NP_PIND', 'NP_PIND', 'B313;NP_RSQ', 'NP_RSQ',
      'B313;NP_AS', 'B313;NP_PS', 'NP_PS', 'B313;NP_AG', 'B313;NP_PG', 'NP_PG',
      // pins the name kept on a decorated alias of a typed definition of
      // several codes written with nothing below it: with those codes below
      // the name, the reload refused them as several
      'B313;NP_ASB', 'NP_PSB', 'B313;NP_PSB:2,3', 'B313;[color=green]>NP_AS',
    ])('reloads %s as drawn, with the same reports', (input) => {
      // regression: the save kept the parts below the name, which a reload
      // takes as they stand: the position the name's links add was lost, and
      // a name read through to a typed definition of several codes held them,
      // refused as a part of several codes
      const builder = new BlissSVGBuilder(input);
      const reloaded = new BlissSVGBuilder(deepPreserveOf(builder));
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(reportsOf(reloaded)).toEqual(reportsOf(builder));
    });

    it.each([
      ['addPart()', () => changed('B313', (b) => b.glyph(0).addPart('NP_POS'))],
      ['a composition object', () => new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, { codeName: 'NP_POS' }] }] }] })],
      ['merge()', () => changed('B313;NP_POS', (b) => b.merge(new BlissSVGBuilder('C8')))],
      ['merge(), through to a typed shape of several codes', () => changed('B313;NP_AS', (b) => b.merge(new BlissSVGBuilder('C8')))],
    ])('reloads a part named through %s as drawn', (_label, build) => {
      const builder = build();
      expect(new BlissSVGBuilder(deepPreserveOf(builder)).svgCode).toBe(builder.svgCode);
    });

    it.each(['B313;NP_POS:2,3', 'NP_APOS', 'B291;NP_PIND', 'B313;NP_AS', 'B313;NP_A2', 'B313;NP_PSB'])(
      'reloads %s as a builder whose every save is the original\'s', (input) => {
        const builder = new BlissSVGBuilder(input);
        expect(savesOf(new BlissSVGBuilder(deepPreserveOf(builder)))).toEqual(savesOf(builder));
      });
  });

  describe('when a deep preserve save writes a part kept by a name it was read through', () => {
    it('writes the name with its options and position and nothing below it', () => {
      const named = deepPreservePartOf('B313;NP_A2', 1);
      expect(named.codeName).toBe('NP_A2');
      expect(named.options).toEqual({ color: 'blue' });
      expect(named).not.toHaveProperty('parts');
      const placed = deepPreservePartOf('B313;NP_POS:2,3', 1);
      expect([placed.codeName, placed.x, placed.y]).toEqual(['NP_POS', 2, 3]);
      expect(placed).not.toHaveProperty('parts');
    });

    it.each([
      ['B313;NP_RED', 1, ['B291']],
      // pins the parts left out only below a name read through to another
      // code: a typed shape written alone carries its own name as its record,
      // and the parts below it are its own
      ['NP_SHAPE', 0, ['HL8', 'VL8']],
    ])('keeps the parts below the typed definition %s names', (input, index, below) => {
      expect(deepPreservePartOf(input, index).parts.map(({ codeName }) => codeName)).toEqual(below);
    });
  });

  describe('when an alias of a typed definition of several codes is saved under preserve', () => {
    it.each([
      ['B313;NP_PSB', 'B313;NP_PSB'],
      ['NP_PSB', 'NP_PSB'],
      ['B313;NP_PGB', 'B313;NP_PGB'],
      ['NP_PGB', 'NP_PGB'],
      ['B313;NP_ASB', 'B313;NP_ASB'],
      ['B313;NP_ALPSB', 'B313;NP_ALPSB'],
      ['B313;NP_PSB:2', 'B313;NP_PSB:2'],
      ['B313;NP_PGB:2,3', 'B313;NP_PGB:2,3'],
      ['B313;[color=red]>NP_PSB', 'B313;[color=red]>NP_PSB'],
      ['NP_ASB', 'NP_ASB'],
      ['B313;NP_PS', 'B313;NP_PS'],
      ['B313;NP_PS1B', 'B313;NP_PS1B'],
      // pins a typed definition ending the walk as a name the part may keep:
      // ending it there as one it may not, an alias of a typed glyph of one
      // code lost its name too
      ['B313;NP_ARED', 'B313;NP_ARED'],
    ])('saves %s as %s, each preserve save reloading byte-identical', (input, saved) => {
      // regression: deciding whether a decorated part's name brings anything
      // the part does not hold, the save read past the typed definition into
      // its codes and took them for an anatomy dissolved into the part
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString({ preserve: true })).toBe(saved);
      for (const save of [builder.toString({ preserve: true }), builder.toJSON({ preserve: true }), deepPreserveOf(builder)]) {
        expect(new BlissSVGBuilder(save).svgCode).toBe(builder.svgCode);
      }
    });
  });
});
