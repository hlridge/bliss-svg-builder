/**
 * Pins an alias read through a link of any spelling the DSL reads as one
 * code, by every walk that follows a rename: the part slot, both `preserve`
 * restores, the `;;` indicator check and the indicator a word reuses.
 *
 * Covers:
 * - A link named with a hyphen, a dot, a letter outside ASCII, a comma, a `#`
 *   or a parenthesis: the alias keeps its name under `preserve`, written
 *   alone, in a slot, as a character's one part, behind a part bracket and
 *   with a position, each save reloading as drawn.
 * - A link whose name holds a character the DSL reads as structure (`;`, `:`,
 *   `[`, `]`, `^`, `/`, `|`, `>`, `{`, `}`, a space): a slot does not read
 *   through it, failing as before the slot read aliases through.
 * - A word indicator written through such a link attaching as the code it
 *   names.
 * - An indicator a typed definition names through such a link, reused when
 *   the word brings the same code.
 * - An alias of a letter drawn as text, in a slot, alone in one, through
 *   `addPart()` and a composition object, drawing as the letter written there
 *   and reloading as drawn; its name kept under `preserve` written alone too,
 *   where its link places the letter as well; its part handle naming the
 *   letter. A typed glyph named with an X is no such letter.
 *
 * Does NOT cover:
 * - An alias of a code with a position, or of several codes, whose codes
 *   bring their own defaults, see
 *   `BlissSVGBuilder.alias-over-held-defaults.test.js`.
 * - Chains whose links are all named in ASCII letters, digits and `_`, see
 *   `BlissSVGBuilder.alias-in-part-slot.test.js`.
 * - A name holding a separator written directly, see
 *   `BlissSVGBuilder.preserve-divergence.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const RED = { color: 'red' };
const BLUE = { color: 'blue' };

// The links the aliases below name, each spelled with the character it tests.
const LINKS = {
  'CN_W-I': { codeString: 'B291', defaultOptions: RED },
  'CN_W.I': { codeString: 'B291', defaultOptions: RED },
  'CN_WÅI': { codeString: 'B291', defaultOptions: RED },
  'CN_W,I': { codeString: 'B291', defaultOptions: RED },
  'CN_W#I': { codeString: 'B291', defaultOptions: RED },
  'CN_W(I': { codeString: 'B291', defaultOptions: RED },
  'CN_S;N': { codeString: 'B291', defaultOptions: RED },
  'CN_S:N': { codeString: 'B291', defaultOptions: RED },
  'CN_S[N': { codeString: 'B291', defaultOptions: RED },
  'CN_S^N': { codeString: 'B291', defaultOptions: RED },
  'CN_S/N': { codeString: 'B291', defaultOptions: RED },
  'CN_S|N': { codeString: 'B291', defaultOptions: RED },
  'CN_S]N': { codeString: 'B291', defaultOptions: RED },
  'CN_S>N': { codeString: 'B291', defaultOptions: RED },
  'CN_S{N': { codeString: 'B291', defaultOptions: RED },
  'CN_S}N': { codeString: 'B291', defaultOptions: RED },
  'CN_S N': { codeString: 'B291', defaultOptions: RED },
  'CN_IN-D': { codeString: 'B81' },
  'CN_TI-D': { type: 'glyph', isIndicator: true, codeString: 'B81' },
  CN_LL: { codeString: 'Xλ', defaultOptions: RED },
  CN_LLP: { codeString: 'Xλ:1,0' },
  XCN_TG: { type: 'glyph', codeString: 'B291', defaultOptions: RED },
};

const ALIASES = {
  CN_OHYPHEN: { codeString: 'CN_W-I', defaultOptions: BLUE },
  CN_ODOT: { codeString: 'CN_W.I', defaultOptions: BLUE },
  CN_ORING: { codeString: 'CN_WÅI', defaultOptions: BLUE },
  CN_OCOMMA: { codeString: 'CN_W,I', defaultOptions: BLUE },
  CN_OHASH: { codeString: 'CN_W#I', defaultOptions: BLUE },
  CN_OPAREN: { codeString: 'CN_W(I', defaultOptions: BLUE },
  CN_OSEMI: { codeString: 'CN_S;N', defaultOptions: BLUE },
  CN_OCOLON: { codeString: 'CN_S:N', defaultOptions: BLUE },
  CN_OBRACKET: { codeString: 'CN_S[N', defaultOptions: BLUE },
  CN_OCARET: { codeString: 'CN_S^N', defaultOptions: BLUE },
  CN_OSLASH: { codeString: 'CN_S/N', defaultOptions: BLUE },
  CN_OBAR: { codeString: 'CN_S|N', defaultOptions: BLUE },
  CN_OCLOSE: { codeString: 'CN_S]N', defaultOptions: BLUE },
  CN_OANGLE: { codeString: 'CN_S>N', defaultOptions: BLUE },
  CN_OBRACEL: { codeString: 'CN_S{N', defaultOptions: BLUE },
  CN_OBRACER: { codeString: 'CN_S}N', defaultOptions: BLUE },
  CN_OSPACE: { codeString: 'CN_S N', defaultOptions: BLUE },
  CN_IND2: { codeString: 'CN_IN-D' },
  CN_TIND2: { type: 'glyph', isIndicator: true, codeString: 'CN_TI-D', defaultOptions: RED },
  CN_LL2: { codeString: 'CN_LL', defaultOptions: BLUE },
  CN_LLP2: { codeString: 'CN_LLP', defaultOptions: BLUE },
  CN_AXTG: { codeString: 'XCN_TG', defaultOptions: BLUE },
};

const SPELLED = ['CN_OHYPHEN', 'CN_ODOT', 'CN_ORING', 'CN_OCOMMA', 'CN_OHASH', 'CN_OPAREN'];

beforeAll(() => {
  for (const fixtures of [LINKS, ALIASES]) {
    const { defined, errors } = BlissSVGBuilder.define(fixtures);
    expect(errors).toEqual([]);
    expect(defined).toEqual(Object.keys(fixtures));
  }
});

afterAll(() => {
  for (const code of [...Object.keys(ALIASES), ...Object.keys(LINKS)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

const preserveOf = (input) => new BlissSVGBuilder(input).toString({ preserve: true });

describe('BlissSVGBuilder alias chain names', () => {
  describe('when the link an alias names is spelled with a character the DSL reads inside a code', () => {
    it.each(SPELLED)('keeps %s written in a slot under preserve, reloading as drawn', (alias) => {
      // regression: a link named outside ASCII letters, digits and `_` was
      // not taken for one code, so the save wrote the code drawn instead
      expect(preserveOf(`B313;${alias}`)).toBe(`B313;${alias}`);
      expect(svgOf(`B313;${alias}`)).toBe(svgOf('B313;[color=blue]>B291'));
    });

    it.each(SPELLED)('keeps %s written alone under preserve, reloading as drawn', (alias) => {
      expect(preserveOf(alias)).toBe(alias);
      expect(svgOf(preserveOf(alias))).toBe(svgOf('[color=blue]>B291'));
    });

    it.each([
      [';CN_OHYPHEN', 'CN_OHYPHEN'],
      ['B313;[color=green]>CN_OHYPHEN', 'B313;[color=green]>CN_OHYPHEN'],
      ['B313;CN_OHYPHEN:1,0', 'B313;CN_OHYPHEN:1,0'],
    ])('saves %s as %s under preserve, reloading as drawn', (input, saved) => {
      expect(preserveOf(input)).toBe(saved);
      expect(svgOf(saved)).toBe(svgOf(input));
    });
  });

  describe('when the link an alias names holds a character the DSL reads as structure', () => {
    it.each([
      ['CN_OSEMI', 'COMPOSITE_AS_PART'],
      ['CN_OCOLON', 'MALFORMED_COORDINATES'],
      ['CN_OBRACKET', 'UNKNOWN_CODE'],
      ['CN_OCARET', 'UNKNOWN_CODE'],
      ['CN_OSLASH', 'WORD_AS_PART'],
      ['CN_OBAR', 'UNKNOWN_CODE'],
      ['CN_OCLOSE', 'UNKNOWN_CODE'],
      ['CN_OANGLE', 'UNKNOWN_CODE'],
      ['CN_OBRACEL', 'UNKNOWN_CODE'],
      ['CN_OBRACER', 'UNKNOWN_CODE'],
      ['CN_OSPACE', 'UNKNOWN_CODE'],
    ])('does not read B313;%s through that link, reporting %s', (alias, code) => {
      // note: no DSL string reaches such a name in a slot (the parser splits
      // it before it looks it up), so a slot does not reach it through an
      // alias either. Pins each character the one-code test refuses: a name
      // read whole across `|`, `]`, `>`, a brace or a space survived the
      // 2026-10-17 hand mutants
      const builder = new BlissSVGBuilder(`B313;${alias}`);
      expect(builder.warnings.map((warning) => warning.code)).toEqual([code]);
      expect(builder.svgCode).not.toContain('stroke="blue"');
    });
  });

  describe('when a word indicator is written through such a link', () => {
    it('attaches B291;;CN_IND2 as B291;;B81, with no report', () => {
      // regression: the indicator check did not read through the link, so
      // the code was refused as no indicator
      const builder = new BlissSVGBuilder('B291;;CN_IND2');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(svgOf('B291;;B81'));
    });
  });

  describe('when a word brings the indicator a typed definition names through such a link', () => {
    it('reuses the head\'s red B81, its default string reloading as drawn', () => {
      // regression: the code the definition stands for stopped at the link,
      // so the word's B81 replaced the red one instead of meeting it
      const builder = new BlissSVGBuilder('B291;CN_TIND2');
      builder.group(0).applyIndicators('B81');
      expect(builder.svgCode).toContain('stroke="red"');
      expect(svgOf(builder.toString())).toBe(builder.svgCode);
    });
  });

  describe('when an alias names a letter drawn as text', () => {
    it.each([
      ['B313;CN_LL', 'B313;[color=red]>Xλ'],
      ['B313;CN_LL2', 'B313;[color=blue]>Xλ'],
      [';CN_LL2', 'CN_LL2'],
    ])('draws %s as %s, with no report', (input, expansion) => {
      // regression: the slot read the letter as an unknown code
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(svgOf(expansion));
    });

    it('draws CN_LL2 added by addPart() as written in the slot', () => {
      const builder = new BlissSVGBuilder('B313');
      builder.glyph(0).addPart('CN_LL2');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>Xλ'));
    });

    it('draws CN_LL2 named by a composition object as written in the slot', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, { codeName: 'CN_LL2' }] }] }] });
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>Xλ'));
    });

    it.each([{}, { preserve: true }])('reloads B313;CN_LL2 as drawn from the string saved with %o', (saveOptions) => {
      const builder = new BlissSVGBuilder('B313;CN_LL2');
      expect(svgOf(builder.toString(saveOptions))).toBe(builder.svgCode);
    });

    it.each(['CN_LL', 'CN_LL2', 'B313;CN_LL2', 'CN_LLP2', 'B313;CN_LLP2'])('keeps the name of %s under preserve, each save reloading as drawn', (input) => {
      // regression: written alone, the save wrote the letter, since the
      // character's code for the letter kept the name off its one part.
      // CN_LLP2's link places the letter (`Xλ:1,0`): pins that link's code
      // read as a slot reads a letter, which the 2026-10-17 hand mutants left
      // unread
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString({ preserve: true })).toBe(input);
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });

    it('names the letter on the part handle of an alias whose link places it', () => {
      const part = new BlissSVGBuilder('B313;CN_LLP2').glyph(0).part(1);
      expect(part.codeName).toBe('Xλ');
      expect([part.x, part.y]).toEqual([1, 0]);
    });

    it('keeps the name of an alias of a typed glyph named with an X on the character, as for any typed glyph', () => {
      // pins the letter test reading the text fallback's own prefix: a glyph
      // whose name starts with an X is no letter, so its one part keeps the
      // glyph's name
      const glyph = new BlissSVGBuilder('CN_AXTG').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(glyph.codeName).toBe('CN_AXTG');
      expect(glyph.parts[0].codeName).toBe('XCN_TG');
    });
  });
});
