/**
 * Pins the option cascade over a definition's options: they are a part's own
 * options, so a character, word or global option written over the definition
 * does not restyle it, a part bracket where it is used does, and what is
 * written on the character still styles an indicator added to it.
 *
 * Covers:
 * - A colour written on the character, the word or the whole composition over
 *   a custom glyph that brings its own colour, each drawing byte-identical to
 *   the same bracket over that colour written as a part bracket.
 * - A part bracket restyling the definition.
 * - A `;;` indicator taking the character's colour while the definition keeps
 *   its own.
 * - The saves: the definition's options written as a part bracket under the
 *   author's bracket by default, reloading the same drawing, and the input as
 *   written under `preserve`.
 * - Control: dot sizing on the character still reaching a dot inside the
 *   definition.
 *
 * Does NOT cover:
 * - The stored shape and saves of a definition written alone, see
 *   `BlissSVGBuilder.definition-is-a-part.test.js`.
 * - The cascade of options written by the author at each level, see
 *   `BlissSVGBuilder.hierarchical-options.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  DC_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  DC_DOTTED: { type: 'glyph', codeString: 'B291;DOT:4,4', defaultOptions: { color: 'red' } },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

describe('BlissSVGBuilder definition cascade', () => {
  describe('when an option is written above a definition that brings its own', () => {
    it.each([
      // regression: the character's colour replaced the definition's
      ['[color=blue]DC_RED', '[color=blue][color=red]>B291'],
      // control: passes before C23
      ['[color=blue]|DC_RED', '[color=blue]|[color=red]>B291'],
      // control: passes before C23
      ['[color=blue]||DC_RED', '[color=blue]||[color=red]>B291'],
    ])('draws %s in the definition\'s colour, as %s', (input, target) => {
      expect(new BlissSVGBuilder(input).svgCode).toBe(new BlissSVGBuilder(target).svgCode);
    });

    it('draws [color=blue]>DC_RED in the part bracket\'s colour', () => {
      // control: passes before C23
      expect(new BlissSVGBuilder('[color=blue]>DC_RED').svgCode).toBe(new BlissSVGBuilder('[color=blue]>B291').svgCode);
    });

    it('draws a ;; indicator in the character\'s colour and the definition in its own', () => {
      expect(new BlissSVGBuilder('[color=blue]DC_RED;;B99').svgCode)
        .toBe(new BlissSVGBuilder('[color=blue][color=red]>B291;;B99').svgCode);
    });

    it('widens the dot inside DC_DOTTED under dot-extra-width on the character', () => {
      // control: passes before C23
      // note: dot sizing reaches a dot through its own option family, so it is
      // not an override of the definition's options
      expect(new BlissSVGBuilder('DC_DOTTED').svgCode).not.toContain('stroke-width="0.75"');
      expect(new BlissSVGBuilder('[dot-extra-width=1]DC_DOTTED').svgCode).toContain('stroke-width="0.75"');
    });
  });

  describe('when such a composition is saved', () => {
    it.each([
      ['[color=blue]DC_RED', '[color=blue][color=red]>B291'],
      ['[color=blue]|DC_RED', '[color=blue]|[color=red]>B291'],
      ['[color=blue]||DC_RED', '[color=blue]||[color=red]>B291'],
    ])('writes %s as %s, and as written under preserve', (input, spelled) => {
      // regression: the default save wrote the definition's colour as a
      // character option, and `preserve` repeated it beside the name
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(spelled);
      expect(builder.toString({ preserve: true })).toBe(input);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });
  });
});
