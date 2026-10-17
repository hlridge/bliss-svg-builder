/**
 * Pins an alias's options, and a part bracket written where it is used,
 * winning over the default the code it names brings when that code has a
 * position: the alias draws as it does written alone, on every route.
 *
 * Covers:
 * - An alias of a positioned code whose code brings its own colour, in a
 *   slot, as a character's one part, with a position of its own, behind a
 *   part bracket, through `addPart()` and a composition object; the
 *   positioned code itself behind a part bracket.
 * - Its part handle naming the code drawn, and an edit through the handle
 *   reaching the ink.
 * - Its saves: `preserve` keeps the name, writing only the position written
 *   where it is used, written alone and in a slot; the default string
 *   reloading as drawn.
 *
 * Does NOT cover:
 * - An alias of several codes, one of which brings its own option, as a
 *   character's one part, with a position or behind a part bracket: deferred
 *   past 1.1.0 (backlog row "An alias of several codes, as a character's only
 *   part, with a position or behind a part bracket, leaves a part whose own
 *   code brings an option in that option"), the `it.todo` rows below.
 * - An alias of one code in a slot, see
 *   `BlissSVGBuilder.alias-in-part-slot.test.js`.
 * - Links named outside ASCII letters, digits and `_`, see
 *   `BlissSVGBuilder.alias-chain-names.test.js`.
 * - Where an alias's options land when its codes bring none, see
 *   `BlissSVGBuilder.alias-options-on-parts.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Each code the definitions below hold brings its own red.
const TARGETS = {
  HD_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  HD_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
};

const HOLDERS = {
  HD_POS: { codeString: 'HD_RED:1,0' },
  HD_FPOS: { codeString: 'HD_RED:0.1,0.7' },
  HD_M2: { codeString: 'HD_RED;C8', defaultOptions: { color: 'blue' } },
  HD_M3: { codeString: 'HD_A1;C8', defaultOptions: { color: 'blue' } },
};

const ALIASES = {
  HD_ALPOS: { codeString: 'HD_POS', defaultOptions: { color: 'blue' } },
};

beforeAll(() => {
  for (const fixtures of [TARGETS, HOLDERS, ALIASES]) {
    const { defined, errors } = BlissSVGBuilder.define(fixtures);
    expect(errors).toEqual([]);
    expect(defined).toEqual(Object.keys(fixtures));
  }
});

afterAll(() => {
  for (const code of [...Object.keys(ALIASES), ...Object.keys(HOLDERS), ...Object.keys(TARGETS)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

const preserveOf = (input) => new BlissSVGBuilder(input).toString({ preserve: true });

describe('BlissSVGBuilder alias over held defaults', () => {
  describe('when an alias of a positioned code is used as a part', () => {
    it.each([
      ['B313;HD_ALPOS', 'B313;[color=blue]>HD_RED:1,0'],
      ['B313;HD_ALPOS:2,3', 'B313;[color=blue]>HD_RED:3,3'],
      [';HD_ALPOS', 'HD_ALPOS'],
      ['B313;[color=green]>HD_ALPOS', 'B313;[color=green]>HD_RED:1,0'],
      ['B313;[color=green]>HD_POS', 'B313;[color=green]>HD_RED:1,0'],
      ['B313;HD_POS', 'B313;HD_RED:1,0'],
    ])('draws %s as %s', (input, expansion) => {
      // regression: the slot held the positioned code as a part below the
      // alias's, whose own red beat the options above it
      expect(svgOf(input)).toBe(svgOf(expansion));
    });

    it('draws HD_ALPOS added by addPart() as written in the slot', () => {
      const builder = new BlissSVGBuilder('B313');
      builder.glyph(0).addPart('HD_ALPOS');
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>HD_RED:1,0'));
    });

    it('draws HD_ALPOS named by a composition object as written in the slot', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, { codeName: 'HD_ALPOS' }] }] }] });
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>HD_RED:1,0'));
    });
  });

  describe('when an alias of a positioned code is written alone with a position', () => {
    it('draws HD_ALPOS:2,3 as [color=blue]>HD_RED:3,3', () => {
      expect(svgOf('HD_ALPOS:2,3')).toBe(svgOf('[color=blue]>HD_RED:3,3'));
    });
  });

  describe('when the part handle of an alias of a positioned code is read', () => {
    it('names the code drawn, as the alias written alone does', () => {
      expect(new BlissSVGBuilder('B313;HD_ALPOS').glyph(0).part(1).codeName).toBe('HD_RED');
      expect(new BlissSVGBuilder('HD_ALPOS').glyph(0).part(0).codeName).toBe('HD_RED');
    });

    it('restyles the ink when an option is set through it', () => {
      // pins the part being the code drawn: options held on a part above it
      // drew right but left an edit through the handle under the code's own
      const builder = new BlissSVGBuilder('B313;HD_ALPOS');
      builder.glyph(0).part(1).setOptions({ color: 'green' });
      expect(builder.svgCode).toBe(svgOf('B313;[color=green]>HD_RED:1,0'));
    });
  });

  describe('when an alias of a positioned code is saved', () => {
    it.each([
      ['B313;HD_ALPOS', 'B313;HD_ALPOS'],
      ['B313;HD_ALPOS:2,3', 'B313;HD_ALPOS:2,3'],
      ['HD_ALPOS', 'HD_ALPOS'],
      ['HD_POS', 'HD_POS'],
      ['HD_ALPOS:2,3', 'HD_ALPOS:2,3'],
    ])('saves %s as %s under preserve, reloading as drawn', (input, saved) => {
      // note: the name stands for its own position, so only the position
      // written where it is used is written back
      expect(preserveOf(input)).toBe(saved);
      expect(svgOf(saved)).toBe(svgOf(input));
    });

    it.each(['HD_FPOS:0.2,0.1', 'B313;HD_FPOS:0.2,0.1'])(
      'saves %s as written under preserve, a decimal position with no binary residue', (input) => {
        // regression: 0.2 beside the name's 0.1 is placed at 0.30000000000000004,
        // and taking 0.1 back off that left 0.20000000000000004 in the save
        expect(preserveOf(input)).toBe(input);
        expect(svgOf(preserveOf(input))).toBe(svgOf(input));
      });

    it.each(['B313;HD_ALPOS', 'B313;HD_ALPOS:2,3', 'HD_ALPOS:2,3'])(
      'reloads %s as drawn from its default string', (input) => {
        const builder = new BlissSVGBuilder(input);
        expect(svgOf(builder.toString())).toBe(builder.svgCode);
      });
  });

  describe('when an alias of several codes is a character\'s one part or takes a part bracket', () => {
    // scenario: deferred past 1.1.0 (see the header); each row is an
    // acceptance criterion of that backlog row. A part holding the alias's
    // codes groups them under one <g> on every version, so the drawings
    // compare by ink unless the fix writes the options on each part.
    it.todo('draws ;HD_M2 as HD_M2, the alias\'s blue over the red HD_RED brings');
    it.todo('draws HD_M2:1 as HD_M2 placed one unit right');
    it.todo('draws [color=green]>HD_M2 as [color=green]>HD_RED;[color=green]>C8');
    it.todo('draws ;[color=green]>HD_M2 as [color=green]>HD_RED;[color=green]>C8');
    it.todo('draws [color=green]>HD_M3 as [color=green]>HD_A1;[color=green]>C8');
    it.todo('reloads ;HD_M2 and ;[color=green]>HD_M2 as drawn from both saves');
    it.todo('draws an option set through the part holding the alias on a key it did not set when read, and its preserve save reloads as drawn');
    it.todo('keeps both names under preserve for a part bracket on a key the alias does not set over a typed part that brings it');
  });
});
