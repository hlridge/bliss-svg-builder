/**
 * Pins `toJSON({ omitOptions: true })`, and how the flag composes with
 * `preserve` and `flattenIndicators` on both serializers.
 *
 * Covers:
 * - The saved shape: the composition keeps `options: {}`, every other options
 *   bag is emptied except a character's kerning, the position of a character, a
 *   word and the composition is gone, and a part keeps its coordinates.
 * - A `;;` code saved without its options, its position in the `:x,y` spelling.
 * - An emptied character's head designation going with its options.
 * - A definition whose code string carries an option bracket, or only its
 *   part-scope marker, never publishing that text as a `codeName`, with the
 *   flag or without it; a character bracket leading it is the definition's
 *   own options, so the glyph is named by the code behind it, as
 *   `defaultOptions` would leave it named.
 * - The algebra: the flag is idempotent wherever no definition's options are
 *   spelled out (a save that spells one out writes them as part brackets,
 *   which the next pass takes as the composition's own; under `preserve` the
 *   name stays and the flag is idempotent), changes nothing on a composition
 *   without options (a `;;` code's written spelling, a renamed `;;` code and
 *   an empty options bag included), composes with `preserve` and
 *   `flattenIndicators`, and the string equals a rebuild of the JSON written
 *   back out.
 *
 * Does NOT cover:
 * - Which options each scope drops or keeps in the string form, see
 *   `BlissSVGBuilder.omit-options.test.js` and
 *   `BlissSVGBuilder.omit-options-edges.test.js`.
 * - The in-place twins and their parity with the flag, see
 *   `BlissSVGBuilder.clear-options.test.js`.
 * - A built-in's own look staying in its bags, see
 *   `BlissSVGBuilder.builtin-own-look.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  OJ_BASE: { type: 'glyph', codeString: 'B291;C8' },
  OJ_STYGL: { type: 'glyph', codeString: '[color=red]>B291' },
  OJ_CHARBR: { type: 'glyph', codeString: '[color=red]B291' },
  OJ_LONEGT: { type: 'glyph', codeString: '>B291' },
  OJ_REDB: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  OJ_BAREIND: { codeString: 'B81' },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const DESIGN_EXAMPLE =
  '[color=red;grid;x=5]||[stroke-width=0.8;x=2]|[color=blue;y=3]B291:1,2;[color=green]>C8:3,4/RK:2/[x=2]B313';
const DECORATED_CUSTOM_WORD = '[color=red]|OJ_BASE;;[color=red]>B81';

const COMPOSED_ROWS = [
  ['plain', {}, 'B291;C8;;B81'],
  ['preserve', { preserve: true }, 'OJ_BASE;;B81'],
  ['flattenIndicators', { flattenIndicators: true }, 'B291;C8;B81'],
  ['preserve and flattenIndicators', { preserve: true, flattenIndicators: true }, 'OJ_BASE;B81'],
];

const ROUND_TRIP_INPUTS = [
  DESIGN_EXAMPLE,
  DECORATED_CUSTOM_WORD,
  'OJ_REDB',
  '[color=red]^/B291;;B81',
  'B291;;[x=2;color=red]>B81',
];
const ROUND_TRIP_ROWS = ROUND_TRIP_INPUTS.flatMap((input) => [
  [input, 'plain', {}],
  [input, 'preserve', { preserve: true }],
]);

describe('BlissSVGBuilder omit options JSON', () => {
  describe('when a composition with options at every scope is saved as JSON', () => {
    it('keeps the part coordinates and the kerning, and nothing else of the options', () => {
      expect(new BlissSVGBuilder(DESIGN_EXAMPLE).toJSON({ omitOptions: true })).toEqual({
        options: {},
        groups: [{
          glyphs: [
            { parts: [{ codeName: 'B291', x: 1, y: 2 }, { codeName: 'C8', x: 3, y: 4 }] },
            { parts: [{ codeName: 'B313' }], options: { relativeKerning: 2 }, codeName: 'B313' },
          ],
        }],
      });
    });
  });

  describe('when a word-level indicator code carries options', () => {
    it('saves the code without them, its position as a coordinate', () => {
      const json = new BlissSVGBuilder('B291;;[x=2;color=red]>B81').toJSON({ omitOptions: true });
      expect(json.groups[0].wordIndicators).toEqual({ codes: ['B81:2'], stripSemantic: false });
    });
  });

  describe('when an empty character held its head marker only through its options', () => {
    it('saves the character with neither', () => {
      const json = new BlissSVGBuilder('[color=red]^/B291;;B81').toJSON({ omitOptions: true });
      expect(json.groups[0].glyphs[0]).toEqual({ parts: [] });
    });
  });

  describe('when a definition\'s code string carries a bracket', () => {
    it('publishes no codeName for the glyph, since no single code draws it', () => {
      // regression: the resolver stopped at `;`, `/` and `:` but not
      // at `[` or `>`, so the definition's own text became the codeName
      const builder = new BlissSVGBuilder('OJ_STYGL');
      expect(builder.toJSON().groups[0].glyphs[0]).toEqual({ parts: [{ codeName: 'B291', options: { color: 'red' } }] });
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('publishes no bracketed codeName under the flag either', () => {
      expect(JSON.stringify(new BlissSVGBuilder('OJ_STYGL').toJSON({ omitOptions: true }))).not.toMatch(/"codeName":"[^"]*\[/);
    });

    it('keeps the name under preserve, where it stands for the glyph', () => {
      expect(new BlissSVGBuilder('OJ_STYGL').toJSON({ preserve: true }).groups[0].glyphs[0].codeName).toBe('OJ_STYGL');
    });

    it('names the glyph by the code behind a lone part-scope marker, never by the marker\'s text', () => {
      // re-pinned at C23 (Task 7): was "publishes no codeName when the code
      // string holds only a lone part-scope marker". A `>` with nothing before
      // it is an empty option region, so `>B291` names B291, as OJ_CHARBR's
      // code string is named below; the text `>B291` is never published
      expect(new BlissSVGBuilder('OJ_LONEGT').toJSON().groups[0].glyphs[0]).toEqual({ codeName: 'B291', parts: [{ codeName: 'B291' }] });
    });

    it('names the glyph by the code behind a character bracket leading the code string, as defaultOptions would', () => {
      // note: that bracket is the definition's own options, not text the
      // resolver could publish, so OJ_CHARBR is named as OJ_REDB is. It used
      // to publish no codeName, and pinned the `[` in the resolver's stop set,
      // which no longer meets a bracket on any route that keeps a glyph
      const glyph = new BlissSVGBuilder('OJ_CHARBR').toJSON().groups[0].glyphs[0];
      // re-pinned at C23 (D2): the options sit on the one part the glyph is,
      // which the JSON spells out, not on the character
      expect(glyph).toEqual({ codeName: 'B291', parts: [{ codeName: 'B291', options: { color: 'red' } }] });
      expect(glyph).toEqual(new BlissSVGBuilder('OJ_REDB').toJSON().groups[0].glyphs[0]);
    });
  });

  describe('when the flag is applied to its own output', () => {
    it.each([DESIGN_EXAMPLE, DECORATED_CUSTOM_WORD, '[color=red]^/B291;;B81'])(
      'writes the same string again for %s',
      (input) => {
        const once = new BlissSVGBuilder(input).toString({ omitOptions: true });
        expect(new BlissSVGBuilder(once).toString({ omitOptions: true })).toBe(once);
      },
    );

    it('writes OJ_REDB\'s own options where it spells OJ_REDB out, and the same name again under preserve', () => {
      // re-pinned at C23 (D2, D8): OJ_REDB left the row above. Its options are
      // part of what its code is, so the flag keeps them; the save without
      // `preserve` spells it out with them as a part bracket, which a reload
      // reads as the composition's own, so a second pass takes them
      const once = new BlissSVGBuilder('OJ_REDB').toString({ omitOptions: true });
      expect(once).toBe('[color=red]>B291');
      expect(new BlissSVGBuilder(once).toString({ omitOptions: true })).toBe('B291');
      const preserved = new BlissSVGBuilder('OJ_REDB').toString({ omitOptions: true, preserve: true });
      expect(preserved).toBe('OJ_REDB');
      expect(new BlissSVGBuilder(preserved).toString({ omitOptions: true, preserve: true })).toBe(preserved);
    });
  });

  describe('when a composition carries no options', () => {
    it.each([
      'B291;C8:3,4/RK:2/B313',
      'B291;;B81',
      'B291^/B313',
      'Xhello',
      'B291//QSP/B313',
      'B291;;B81:2.0',
      'B291;;OJ_BAREIND',
    ])(
      'writes %s exactly as the plain string does',
      (input) => {
        const builder = new BlissSVGBuilder(input);
        expect(builder.toString({ omitOptions: true })).toBe(builder.toString());
        expect(builder.toJSON({ omitOptions: true })).toEqual(builder.toJSON());
      },
    );

    it('leaves an empty options bag in place', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], options: {} }] }] });
      expect(builder.toJSON({ omitOptions: true })).toEqual(builder.toJSON());
    });
  });

  describe('when the flag is combined with the other serializer options', () => {
    it.each(COMPOSED_ROWS)('writes the decorated custom word under %s', (_label, options, expected) => {
      expect(new BlissSVGBuilder(DECORATED_CUSTOM_WORD).toString({ ...options, omitOptions: true })).toBe(expected);
    });
  });

  describe('when the string and the JSON are both saved without options', () => {
    it.each(ROUND_TRIP_ROWS)('rebuilds the JSON to the same string for %s under %s', (input, _label, options) => {
      const builder = new BlissSVGBuilder(input);
      const rebuilt = new BlissSVGBuilder(builder.toJSON({ ...options, omitOptions: true }));
      expect(rebuilt.toString(options)).toBe(builder.toString({ ...options, omitOptions: true }));
    });
  });
});
