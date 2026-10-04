/**
 * Pins a definition whose code string leads with a bare `>`, an option region
 * carrying nothing, drawing the code behind it wherever the definition is
 * used, as the DSL reads `>B291` as `B291`.
 *
 * Covers:
 * - A typed glyph, a typed shape and a bare alias whose code string is
 *   `>CODE`, written alone and in a later `;` slot, an alias of an indicator
 *   after `;;` too, and a digit written with a coordinate before another
 *   character: drawn with no warning and saved by default exactly as the same
 *   definition without the `>`; one led by two failing as the DSL's `>>B291`
 *   does.
 * - A character bracket behind the `>` read as the definition's own options,
 *   by every use and by `define()`, which refuses a position there as it does
 *   in `defaultOptions`.
 *
 * Does NOT cover:
 * - A bare `>` written in the DSL itself, see
 *   `BlissParser.part-slot-char-option.test.js`.
 * - A character bracket leading a code string with no `>` before it, see
 *   `BlissSVGBuilder.code-string-own-bracket.test.js` and its refusals file.
 * - A bare `>` in a later slot of a code string read for a composition
 *   object, backlog row "Definition-reference hygiene nits".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  ER_GLYPH: { type: 'glyph', codeString: '>B291' },
  ER_GLYPH_TWIN: { type: 'glyph', codeString: 'B291' },
  ER_SHAPE: { type: 'shape', codeString: '>C8' },
  ER_SHAPE_TWIN: { type: 'shape', codeString: 'C8' },
  ER_ALIAS: { codeString: '>B291' },
  ER_ALIAS_TWIN: { codeString: 'B291' },
  ER_BRACKET: { type: 'glyph', codeString: '>[color=red]B291' },
  ER_BRACKET_TWIN: { type: 'glyph', codeString: '[color=red]B291' },
  ER_INDICATOR: { codeString: '>B81' },
  ER_INDICATOR_TWIN: { codeString: 'B81' },
  ER_DIGIT: { type: 'glyph', codeString: '>B9' },
  ER_DIGIT_TWIN: { type: 'glyph', codeString: 'B9' },
  ER_TWICE: { type: 'glyph', codeString: '>>B291' },
};

// The uses each kind is compared in (`%` stands for the name).
const BASE_USES = ['%', 'B291;%'];
const INDICATOR_USES = ['%', 'B291;%', 'B291;;%'];
const LAYOUT_USES = ['%', '%:1/B10'];

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// What `use` draws, warns and saves by default with `name` in place of its
// `%`, the name written back as `%` so two names compare by what they do (a
// `;;` code is saved by its name).
const drawnAndSaved = (use, name) => {
  const builder = new BlissSVGBuilder(use.replaceAll('%', name));
  return { svg: builder.svgCode, warnings: builder.warnings.map((warning) => warning.code), saved: builder.toString().replaceAll(name, '%') };
};

describe('BlissSVGBuilder code string empty region', () => {
  describe('when a definition\'s code string leads with a bare >', () => {
    it.each([
      ['a typed glyph', 'ER_GLYPH', BASE_USES],
      ['a typed shape', 'ER_SHAPE', BASE_USES],
      ['a bare alias', 'ER_ALIAS', BASE_USES],
      ['a typed glyph with a character bracket behind the >', 'ER_BRACKET', BASE_USES],
      ['a bare alias of an indicator', 'ER_INDICATOR', INDICATOR_USES],
      ['a typed glyph of a digit, whose kerning a decorated use reads', 'ER_DIGIT', LAYOUT_USES],
    ])('draws %s as the same definition without the >', (_kind, name, uses) => {
      // regression: the slot read `>B291` as one code and failed the whole
      // character as UNKNOWN_CODE (shipped); written alone it was expanded
      // and drew, until a lone typed glyph became the part it is (C23). Every
      // reader of the code string reads behind the `>`: the alias resolution
      // an indicator is recognised through, and the layout a decorated use
      // takes from the code behind the name
      for (const use of uses) {
        const written = drawnAndSaved(use, name);
        expect(written.warnings).toEqual([]);
        expect(written).toEqual(drawnAndSaved(use, `${name}_TWIN`));
      }
    });

    it('consumes only one, so a code string led by two fails as `>>B291` written does', () => {
      // pins one region consumed, not every one: two empty regions spell
      // nothing in the DSL either
      expect(drawnAndSaved('%', 'ER_TWICE').warnings).toEqual(drawnAndSaved('%', '>>B291').warnings);
      expect(drawnAndSaved('B291;%', 'ER_TWICE').warnings).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when define() reads the bracket behind the >', () => {
    it('refuses a position in it, as in defaultOptions, and registers nothing', () => {
      const { defined, errors } = BlissSVGBuilder.define({ ER_PLACED: { type: 'glyph', codeString: '>[x=2]B291' } });
      expect(defined).toEqual([]);
      expect(errors).toEqual([
        expect.stringContaining('the character bracket leading its codeString cannot include the position option "x"'),
      ]);
      expect(BlissSVGBuilder.isDefined('ER_PLACED')).toBe(false);
    });
  });
});
