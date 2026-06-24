import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins parser coordinate-suffix grammar: the `CODE:x,y` syntax accepts
 * decimals, negatives, and missing components; malformed values fall through
 * to a warning rather than silently parsing.
 *
 * Covers:
 * - Well-formed forms (CODE alone, CODE:x,y, CODE:x, CODE:,y, signed,
 *   leading-dot and trailing-dot decimal shorthand, omitted values, trailing
 *   comma).
 * - Malformed forms: a malformed coordinate suffix (`:.`, `:-`, `:-.`, `:3,.`,
 *   `:3,-`, `:5,5,5`, `:abc,5`, `:+5`) warns MALFORMED_COORDINATES and drops the
 *   token (invalid syntax is not carried into toString); a comma without a colon
 *   (`B291,`, `B291,4`) is a general UNKNOWN_CODE since the `:` is the coordinate
 *   trigger. A coordinate syntax error is reported before the unknown-code check
 *   (`ZZ:abc` → MALFORMED_COORDINATES, but bare `ZZ` → UNKNOWN_CODE).
 * - Word-definition expansion preserves single-coordinate positions
 *   (`WORD:x` without `,y`): pins the outer `?` quantifier on the
 *   coordinate regex's second-number group, so the position suffix
 *   strips correctly during base-code lookup.
 * - Regression guard: trailing `;` indicator stripping is unaffected by
 *   changes to the coordinate-suffix regex. The `parsePartString` regex and
 *   the `;` split share the same parser pipeline, so a regex change could
 *   indirectly break indicator stripping; these cases pin that contract.
 *
 * Does NOT cover:
 * - Effect of coordinate suffixes on rendered glyph positions, see
 *   `BlissSVGBuilder.spacing-options.test.js`.
 * - Interaction with the part-level options-API form (`options.x` /
 *   `options.y`) including precedence between inline coordinates and the
 *   options form, see `BlissParser.coordinate-options.test.js`.
 */
describe('BlissSVGBuilder coordinate syntax', () => {
  const firstPart = (input) => BlissParser.parse(input).groups[0]?.glyphs[0]?.parts[0];
  const warnings = (input) => new BlissSVGBuilder(input).warnings;

  describe('when the coordinate suffix is well-formed', () => {
    it.each([
      ['HL2',         undefined, undefined, 'no colon present'],
      ['HL2:3,4',     3,         4,         'both coordinates'],
      ['HL2:3',       3,         undefined, 'x only, y defaults'],
      ['HL2:,4',      undefined, 4,         'x defaults, explicit y'],
      ['HL2:-1,0.5',  -1,        0.5,       'negative x with decimal y'],
      ['HL2:,-1',     undefined, -1,        'negative y'],
      ['HL2:.5',      0.5,       undefined, 'leading-dot decimal'],
      ['HL2:3.',      3,         undefined, 'trailing-dot decimal'],
      ['HL2:0',       0,         undefined, 'zero x only'],
      ['HL2:,0',      undefined, 0,         'zero y only'],
      ['HL2:0,0',     0,         0,         'both zero'],
      ['HL2:-1,-1',  -1,        -1,         'both negative integers'],
      ['HL2:',        undefined, undefined, 'colon with no values'],
      ['HL2:,',       undefined, undefined, 'colon and comma with no values'],
      ['HL2:3,',      3,         undefined, 'trailing comma'],
    ])('parses %s as x=%s, y=%s (%s)', (input, x, y) => {
      const part = firstPart(input);
      expect(part.codeName).toBe('HL2');
      expect(part.x).toBe(x);
      expect(part.y).toBe(y);
    });
  });

  describe('when the coordinate suffix is malformed', () => {
    // A valid code with a malformed `:x,y` suffix warns MALFORMED_COORDINATES
    // (the code lexed fine; only the coordinate failed to parse), not the
    // misleading UNKNOWN_CODE the general code parser would emit.
    it.each([
      ['B291:.',     'bare dot is not a valid number'],
      ['B291:-',     'bare minus is not a valid number'],
      ['B291:-.',    'minus-dot with no digit is not a valid number'],
      ['B291:3,.',   'bare dot in the y position'],
      ['B291:3,-',   'bare minus in the y position'],
      ['B291:5,5,5', 'extra third coordinate component'],
      ['B291:abc,5', 'non-numeric x component'],
      ['B291:+5',    'plus sign is not allowed in coordinates'],
    ])('warns MALFORMED_COORDINATES on %s (%s)', (input) => {
      expect(warnings(input).map(w => w.code)).toEqual(['MALFORMED_COORDINATES']);
    });

    // The `:` is the coordinate trigger; without it the token is not a
    // coordinate suffix at all, so it stays a general UNKNOWN_CODE.
    it.each([
      ['B291,',  'bare comma without a colon'],
      ['B291,4', 'comma and digit without a colon'],
    ])('warns UNKNOWN_CODE (no colon, not a coordinate suffix) on %s (%s)', (input) => {
      expect(warnings(input).map(w => w.code)).toEqual(['UNKNOWN_CODE']);
    });

    it('drops the malformed token from toString instead of carrying invalid syntax forward', () => {
      expect(new BlissSVGBuilder('B291:abc').toString()).toBe('');
      expect(new BlissSVGBuilder('B291/B291:abc/B291').toString()).toBe('B291/B291');
    });

    it('does not treat leading junk before a code:coord as a malformed coordinate', () => {
      // pins the ^ anchor on the detection regex: the token must START with a
      // code for the suffix to be "its coordinate". !B291:abc is invalid from
      // the first character, so it is a general UNKNOWN_CODE.
      expect(warnings('!B291:abc').map(w => w.code)).toEqual(['UNKNOWN_CODE']);
    });

    it('reports the coordinate syntax error before the unknown-code check', () => {
      // ZZ:abc is BOTH an unknown code and a bad coordinate; the syntax error
      // comes first (ZZ cannot be extracted until :abc parses), so the
      // coordinate error wins. A valid-syntax unknown code stays UNKNOWN_CODE.
      expect(warnings('ZZ:abc').map(w => w.code)).toEqual(['MALFORMED_COORDINATES']);
      expect(warnings('ZZ').map(w => w.code)).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when a word definition carries a single-coordinate position suffix', () => {
    const WORD_DEF = { COORDWORD: { codeString: 'H/B86' } };

    beforeAll(() => BlissSVGBuilder.define(WORD_DEF));
    afterAll(() => Object.keys(WORD_DEF).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    // pins the outer `?` quantifier on the coordinate-suffix regex's
    // second-number group; without it, single-coordinate positions like
    // `COORDWORD:5` fail base-code lookup and the word stays unexpanded
    // as a single unknown-code glyph
    it('expands the word into its component glyphs and applies the x coordinate', () => {
      const result = BlissParser.parse('COORDWORD:5');
      const glyphs = result.groups[0].glyphs;

      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[0].parts[0].x).toBe(5);
      expect(glyphs[1].parts[0].codeName).toBe('B86');
    });
  });

  // scenario: trailing `;` strips a baked-in or explicit indicator. The
  // contract is pinned here (rather than in an indicator-specific file)
  // because the strip depends on the coordinate-suffix regex; a regex change
  // could silently break stripping without breaking coordinate parsing.
  describe('when a trailing semicolon strips an indicator (regression guard)', () => {
    const COORD_TEST_DEFS = {
      SI:  { codeString: 'B291;B99' },
      MWI: { codeString: 'B291;B99/B291' },
    };

    beforeAll(() => BlissSVGBuilder.define(COORD_TEST_DEFS));
    afterAll(() => Object.keys(COORD_TEST_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it.each([
      ['B291;',      'trailing semicolon on a non-indicator base is a no-op'],
      ['B291;B99;',  'trailing semicolon when an explicit indicator is already present'],
      ['B291;B291;', 'trailing semicolon when neither glyph is an indicator'],
      ['SI;',        'strips a baked-in B99 indicator from a custom definition'],
      ['MWI;',       'strips an indicator from the head glyph of a multi-character word'],
    ])('emits no warning for %s (%s)', (input) => {
      expect(warnings(input)).toHaveLength(0);
    });
  });
});
