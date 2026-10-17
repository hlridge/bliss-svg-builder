/**
 * Pins a bare alias read in a part slot as its expansion, as it is read
 * written alone: through every link of a chain, each link's options under the
 * ones further out, and a part bracket written where it is used over them all.
 *
 * Covers:
 * - An alias in a `;` slot drawing byte-identical to the slot written with
 *   the code it names and its options as a part bracket: a chain whose links
 *   set one key and one that does not, an alias of a typed glyph, of a typed
 *   shape, of `REFSQUARE`, and of an alias of a code with a position.
 * - An alias drawing the same alone and as the one part of a character
 *   (`;NAME`), and the same with a position written on it.
 * - A part bracket on an alias restyling what the alias draws, through every
 *   link and over a typed glyph's own colour; a character bracket leaving it.
 * - An alias of a typed indicator drawing with its own colour, still an
 *   indicator.
 * - The part handle naming the code drawn and holding what that code holds,
 *   as for the alias written alone.
 * - Where the reading stops: an alias of an alias of a positioned code keeps
 *   the name written; an alias of an alias of several codes is refused as a
 *   part, as those codes are, in a use and in `define()`; a rename of a word
 *   fails as the word does.
 * - A misplaced indicator or space written through a name, reported by the
 *   name written.
 * - A second bracket leading the code string of an alias in a slot, or of a
 *   link it is read through, reported once.
 *
 * Does NOT cover:
 * - The part methods, composition objects and the saves, see
 *   `BlissSVGBuilder.alias-in-part-slot-routes.test.js`.
 * - Where an alias's options land when it is written alone, see
 *   `BlissSVGBuilder.alias-options-on-parts.test.js`.
 * - The clears of an alias written alone, see
 *   `BlissSVGBuilder.alias-options-kept.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// The codes the aliases below name, defined first so each alias names a code
// that exists when it is defined.
const TARGETS = {
  SL_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  SL_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'red' } },
  SL_IND: { type: 'glyph', isIndicator: true, codeString: 'B81', defaultOptions: { color: 'red' } },
  SL_MYIND: { type: 'glyph', isIndicator: true, codeString: 'C2' },
  SL_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
  SL_POS: { codeString: 'B291:1,0', defaultOptions: { color: 'red' } },
  SL_MULTI: { codeString: 'B291;C8' },
  SL_WORD: { codeString: 'B291/C8' },
  SL_DBL: { codeString: '[color=red][color=blue]B291' },
  SL_DBLPOS: { codeString: '[color=red][color=blue]B291:1,0' },
};

const ALIASES = {
  SL_AL: { codeString: 'SL_RED' },
  SL_ALB: { codeString: 'SL_RED', defaultOptions: { color: 'blue' } },
  SL_SHB: { codeString: 'SL_SHAPE', defaultOptions: { color: 'blue' } },
  SL_INDB: { codeString: 'SL_IND', defaultOptions: { color: 'blue' } },
  SL_A2: { codeString: 'SL_A1', defaultOptions: { color: 'blue' } },
  SL_A3: { codeString: 'SL_A1', defaultOptions: { 'stroke-width': 0.8 } },
  SL_RSA: { codeString: 'REFSQUARE', defaultOptions: { 'stroke-dasharray': '1 1' } },
  SL_ACT: { codeString: 'B81' },
  SL_ALIND: { codeString: 'SL_MYIND' },
  SL_SP: { codeString: 'TSP' },
  SL_ALPOS: { codeString: 'SL_POS', defaultOptions: { color: 'blue' } },
  SL_ALMULTI: { codeString: 'SL_MULTI' },
  SL_ALWORD: { codeString: 'SL_WORD' },
  SL_ALDBL: { codeString: 'SL_DBL' },
  SL_ALDBLPOS: { codeString: 'SL_DBLPOS' },
};

beforeAll(() => {
  for (const fixtures of [TARGETS, ALIASES]) {
    const { defined, errors } = BlissSVGBuilder.define(fixtures);
    expect(errors).toEqual([]);
    expect(defined).toEqual(Object.keys(fixtures));
  }
});

afterAll(() => {
  for (const code of [...Object.keys(ALIASES), ...Object.keys(TARGETS), 'SL_HOLDS_ALMULTI']) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

const warningsOf = (input) => new BlissSVGBuilder(input).warnings.map(({ code, source }) => ({ code, source }));

describe('BlissSVGBuilder alias in a part slot', () => {
  describe('when an alias is written in a part slot', () => {
    it.each([
      ['SL_A2', '[color=blue]>B291'],
      ['SL_A3', '[color=red;stroke-width=0.8]>B291'],
      ['SL_ALB', '[color=blue]>SL_RED'],
      ['SL_SHB', '[color=blue]>SL_SHAPE'],
      ['SL_RSA', '[stroke-dasharray=1 1]>REFSQUARE'],
      ['SL_ALPOS', '[color=blue]>SL_POS'],
    ])('draws B313;%s as B313;%s', (alias, expansion) => {
      // regression: the slot nested one part per link, so the innermost
      // link's own options won where the alias written alone let the outer win
      expect(svgOf(`B313;${alias}`)).toBe(svgOf(`B313;${expansion}`));
    });
  });

  describe('when an alias stands alone or is the one part of its character', () => {
    it.each(['SL_A2', 'SL_A3', 'SL_ALB', 'SL_SHB', 'SL_RSA', 'SL_INDB', 'SL_ALPOS'])(
      'draws %s alone as it draws written in an empty character slot', (alias) => {
        expect(svgOf(`;${alias}`)).toBe(svgOf(alias));
      });
  });

  describe('when an alias is written with a position', () => {
    it.each([
      ['SL_A2:1', '[color=blue]>B291:1'],
      ['SL_ALB:1', '[color=blue]>SL_RED:1'],
      ['SL_RSA:1', '[stroke-dasharray=1 1]>REFSQUARE:1'],
      ['B313;SL_A2:1,2', 'B313;[color=blue]>B291:1,2'],
    ])('draws %s as %s', (input, expansion) => {
      // regression: a position sent the alias through the part-slot reading,
      // so moving it changed its colour
      expect(svgOf(input)).toBe(svgOf(expansion));
    });
  });

  describe('when a part bracket is written where an alias is used', () => {
    it.each([
      ['[color=green]>SL_AL', '[color=green]>SL_RED'],
      ['B313;[color=green]>SL_AL', 'B313;[color=green]>SL_RED'],
      ['[color=green]>SL_A2', '[color=green]>B291'],
      ['[color=green]>SL_A3', '[color=green;stroke-width=0.8]>B291'],
      ['B313;[stroke-dasharray=2 1]>SL_RSA', 'B313;[stroke-dasharray=2 1]>REFSQUARE'],
    ])('draws %s as %s', (input, expansion) => {
      // regression: the bracket sat on the alias's own link, under the
      // options a link further in brought, so it could not restyle them
      expect(svgOf(input)).toBe(svgOf(expansion));
    });

    it('leaves a character bracket under the options the alias brings', () => {
      expect(svgOf('[color=green]SL_AL')).toBe(svgOf('[color=green]SL_RED'));
    });
  });

  describe('when an alias of a typed indicator is used as a part', () => {
    it('draws it with the alias\'s colour, still as an indicator', () => {
      const builder = new BlissSVGBuilder('B291;SL_INDB');
      expect(builder.svgCode).toBe(svgOf('B291;[color=blue]>SL_IND'));
      expect(builder.glyph(0).part(1).isIndicator).toBe(true);
    });
  });

  describe('when the part handle of an alias in a part slot is read', () => {
    it('names the code the alias draws, as the alias written alone does', () => {
      expect(new BlissSVGBuilder('B313;SL_A2').glyph(0).part(1).codeName).toBe('B291');
      expect(new BlissSVGBuilder('SL_A2').glyph(0).part(0).codeName).toBe('B291');
    });

    it('holds what that code holds written in the slot, with no part per link', () => {
      const inner = new BlissSVGBuilder('B313;SL_A2').glyph(0).part(1).part(0);
      expect(inner.codeName).toBe(new BlissSVGBuilder('B313;B291').glyph(0).part(1).part(0).codeName);
    });
  });

  describe('when the alias names an alias of something other than one code', () => {
    it('keeps the name of an alias of a positioned code, holding what that draws', () => {
      // note: an alias of shorthand is shorthand for the same thing, so the
      // part keeps the name written rather than the inner alias's
      expect(new BlissSVGBuilder('B313;SL_ALPOS').glyph(0).part(1).codeName).toBe('SL_ALPOS');
    });

    it('refuses an alias of an alias of several codes as a part, as those codes are refused', () => {
      expect(warningsOf('B313;SL_ALMULTI')).toEqual([{ code: 'COMPOSITE_AS_PART', source: 'SL_ALMULTI' }]);
      expect(svgOf('B313;SL_ALMULTI')).toBe(svgOf('B313;SL_MULTI'));
    });

    it('refuses a definition holding such an alias as a part, as one holding those codes', () => {
      const { defined, errors } = BlissSVGBuilder.define({ SL_HOLDS_ALMULTI: { codeString: 'B313;SL_ALMULTI' } });
      expect(defined).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('a ; part cannot be a composition ("B313;SL_ALMULTI")');
    });

    it('fails a rename of a word as a part, under the name written', () => {
      // note: a word is no part, so its rename is left as written
      expect(warningsOf('B313;SL_ALWORD').map(({ code }) => code)).toEqual(['WORD_AS_PART']);
      expect(new BlissSVGBuilder('B313;SL_ALWORD').glyph(0).part(1).codeName).toBe('SL_ALWORD');
    });
  });

  describe('when an indicator or a space written through a name is misplaced', () => {
    it.each([
      [';SL_ACT;B313', 'MISPLACED_INDICATOR_PART', 'SL_ACT'],
      [';SL_ALIND;B313', 'MISPLACED_INDICATOR_PART', 'SL_ALIND'],
      [';SL_MYIND;B313', 'MISPLACED_INDICATOR_PART', 'SL_MYIND'],
      ['B291;SL_SP;B313', 'MISPLACED_SPACE', 'SL_SP'],
    ])('reports %s as %s with the name written, %s', (input, code, source) => {
      // regression: the report named the code the name draws (C2, TSP), not
      // the text written
      expect(warningsOf(input)).toEqual([{ code, source }]);
    });
  });

  describe('when the code string of an alias in a part slot leads with two brackets', () => {
    it.each(['B313;SL_DBL', 'B313;SL_DBLPOS', 'B313;SL_ALDBL', 'B313;SL_ALDBLPOS'])(
      'reports the second bracket of %s once', (input) => {
        // pins one report per code string read: a link read through to the
        // code it names is read once, and the one the part is left with once
        expect(warningsOf(input)).toEqual([{ code: 'MULTIPLE_OPTION_BRACKETS', source: '[color=blue]' }]);
      });
  });
});
