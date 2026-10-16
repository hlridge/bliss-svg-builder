/**
 * Pins a `false` written from JavaScript as a value like any other: drawn as
 * the text it spells, and written by the string save, so every save reloads
 * the picture the builder draws. A switch alone reads it as off.
 *
 * Covers:
 * - `false` on a curated text option (`color`, `svgTitle`, `gridColor`) and on
 *   a pass-through attribute (`aria-hidden`, a `data-` name), at each level,
 *   through each JavaScript route (a setter, a composition object, the
 *   builder's options): drawn as `false`, saved as `[name=false]`.
 * - Both strings and both JSON saves of each reloading the drawing byte for
 *   byte.
 * - The bracket text `[color=false]` drawing and saving what the JavaScript
 *   `false` does.
 * - An empty character holding only a `false`: written as its option token, so
 *   the character and its head designation stay in the string.
 * - The switches (`grid`, `center`, `errorPlaceholder`): `false` turns one off,
 *   and the string leaves it out.
 * - A custom code's own option set to `false` on its part: the default save
 *   spells the code out with the `false` written, `preserve` keeps the name
 *   with the `false` beside it, for a glyph, an alias and a shape written
 *   alone.
 *
 * Does NOT cover:
 * - `false` on a numeric option, which is refused, see
 *   `BlissSVGBuilder.text-option-values.test.js` and
 *   `BlissSVGBuilder.option-value-gate.test.js`.
 * - A `false` inside a part saved by its name, which `preserve` spells out,
 *   see `BlissSVGBuilder.preserve-removed-default.test.js`.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  FV_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  FV_ALIAS: { codeString: 'B291', defaultOptions: { color: 'red' } },
  FV_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `code` after `change` has been applied to it.
const changed = (code, change) => {
  const builder = new BlissSVGBuilder(code);
  change(builder);
  return builder;
};

const oneGlyph = (glyph) => ({ groups: [{ glyphs: [glyph] }] });

// What each save route reloads to.
const SAVE_ROUTES = [
  ['toString()', (builder) => new BlissSVGBuilder(builder.toString())],
  ['toString({ preserve: true })', (builder) => new BlissSVGBuilder(builder.toString({ preserve: true }))],
  ['toJSON()', (builder) => new BlissSVGBuilder(builder.toJSON())],
  ['toJSON({ preserve: true })', (builder) => new BlissSVGBuilder(builder.toJSON({ preserve: true }))],
];

// Every way this file writes a `false`, with the string each saves as.
const WRITTEN = [
  ['a character setter', () => changed('B291', (b) => b.glyph(0).setOptions({ color: false })), '[color=false]B291'],
  ['a word setter', () => changed('B291', (b) => b.group(0).setOptions({ color: false })), '[color=false]|B291'],
  ['a part setter', () => changed('B291;B81', (b) => b.glyph(0).part(1).setOptions({ color: false })), 'B291;[color=false]>B81'],
  ['a composition object on a character', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B291' }], options: { color: false } })), '[color=false]B291'],
  ['a composition object on a part', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B291', options: { 'aria-hidden': false } }] })), '[aria-hidden=false]>B291'],
  ["the builder's options", () => new BlissSVGBuilder('B291', { color: false }), '[color=false]||B291'],
  ["the builder's options, for the title", () => new BlissSVGBuilder('B291', { svgTitle: false }), '[svg-title=false]||B291'],
  ["the builder's options, for the grid colour", () => new BlissSVGBuilder('B291', { grid: true, gridColor: false }), '[grid;grid-color=false]||B291'],
  ['a character setter, for a name of your own', () => changed('B291', (b) => b.glyph(0).setOptions({ 'data-state': false })), '[data-state=false]B291'],
];

describe('BlissSVGBuilder false option value', () => {
  describe('when an option that is not a switch is set to false from JavaScript', () => {
    it.each(WRITTEN)('writes it in the saved string, set through %s', (_route, build, expected) => {
      expect(build().toString()).toBe(expected);
    });

    it.each(WRITTEN)('saves a string that reloads as drawn, set through %s', (_route, build) => {
      // regression: the string left the `false` out, so its reload lost the
      // attribute the builder had drawn (backlog row "A `false` option value")
      const builder = build();
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a curated text option', () => changed('B291', (b) => b.glyph(0).setOptions({ color: false })), 'stroke="false"'],
      ['a pass-through attribute', () => changed('B291', (b) => b.glyph(0).setOptions({ 'aria-hidden': false })), 'aria-hidden="false"'],
      ['the title', () => new BlissSVGBuilder('B291', { svgTitle: false }), '<title>false</title>'],
    ])('draws %s as the text false, with nothing reported', (_label, build, drawn) => {
      const builder = build();
      expect(builder.svgCode).toContain(drawn);
      expect(builder.warnings).toEqual([]);
    });
  });

  describe.each(SAVE_ROUTES)('when such a builder is saved through %s and read back', (_route, reload) => {
    it.each([
      ['a colour on a character', () => changed('B291', (b) => b.glyph(0).setOptions({ color: false }))],
      ['a pass-through attribute on a part', () => new BlissSVGBuilder(oneGlyph({ parts: [{ codeName: 'B291', options: { 'aria-hidden': false } }] }))],
      ['the grid colour', () => new BlissSVGBuilder('B291', { grid: true, gridColor: false })],
    ])('draws %s as the builder draws it', (_label, build) => {
      const builder = build();
      expect(reload(builder).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the saved string is read back and saved again', () => {
    it('saves the same string', () => {
      const saved = changed('B291', (b) => b.glyph(0).setOptions({ 'aria-hidden': false })).toString();
      expect(new BlissSVGBuilder(saved).toString()).toBe(saved);
    });
  });

  describe('when the same value is written in a bracket', () => {
    it('draws and saves what the JavaScript false does', () => {
      const fromBracket = new BlissSVGBuilder('[color=false]B291');
      const fromSetter = changed('B291', (b) => b.glyph(0).setOptions({ color: false }));
      expect(fromSetter.svgCode).toBe(fromBracket.svgCode);
      expect(fromSetter.toString()).toBe(fromBracket.toString());
    });
  });

  describe('when an empty character holds only a false option', () => {
    it('writes the character as its option token', () => {
      // pins the empty-character token test sharing the string's rule: with
      // `false` left out there, the character vanished from the string and
      // stayed in the JSON
      const builder = changed('B291', (b) => {
        b.group(0).addGlyph('');
        b.glyph(1).setOptions({ color: false });
      });
      expect(builder.toString()).toBe('B291/[color=false]');
      expect(new BlissSVGBuilder(builder.toString()).toJSON().groups[0].glyphs).toHaveLength(2);
    });

    it('keeps its head designation in the string', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }, { parts: [], options: { 'aria-hidden': false }, isHeadGlyph: true }] }],
      });
      expect(builder.toString()).toBe('B291/[aria-hidden=false]^');
      expect(builder.toJSON().groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });
  });

  describe('when a switch is set to false', () => {
    it.each([
      ['the grid over a [grid] in the string', () => new BlissSVGBuilder('[grid]||B291', { overrides: { grid: false } }), 'B291'],
      ['the grid in a composition object', () => new BlissSVGBuilder({ options: { grid: false }, ...oneGlyph({ parts: [{ codeName: 'B291' }] }) }), 'B291'],
      ['centring', () => new BlissSVGBuilder('B291', { center: false }), 'B291'],
      ['the error placeholder', () => new BlissSVGBuilder('ZZ9', { errorPlaceholder: false }), 'ZZ9'],
    ])('leaves %s out of the string, which reloads as drawn', (_label, build, expected) => {
      // pins the switches' exemption: a `false` there is what absence means
      const builder = build();
      expect(builder.toString()).toBe(expected);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('draws no grid where the grid is turned off over a [grid] in the string', () => {
      const builder = new BlissSVGBuilder('[grid]||B291', { overrides: { grid: false } });
      expect(builder.svgCode).not.toContain('class="bliss-grid');
    });
  });

  describe("when a custom code's own option is set to false on its part", () => {
    const leftOut = () => changed('FV_RED', (b) => b.glyph(0).part(0).setOptions({ color: false }));

    it('spells the code out with the false written, in the default save', () => {
      expect(leftOut().toString()).toBe('[color=false]>B291');
    });

    it('keeps the name with the false beside it, under preserve', () => {
      // note: a `false` beside the name is written like any other value there
      // (`[color=green]>FV_RED`), so the name stays; inside a part saved by its
      // name it is still spelled out, since the name would bring the default back
      expect(leftOut().toString({ preserve: true })).toBe('[color=false]>FV_RED');
    });

    it.each(SAVE_ROUTES)('reloads through %s as the builder draws it, without the red', (_route, reload) => {
      const builder = leftOut();
      expect(reload(builder).svgCode).toBe(builder.svgCode);
      expect(reload(builder).svgCode).not.toContain('stroke="red"');
    });

    it.each([
      ['an alias', 'FV_ALIAS'],
      ['a shape', 'FV_SHAPE'],
    ])('keeps the name of %s written alone, with the false beside it, under preserve', (_kind, name) => {
      // pins the own-options test of a part written alone sharing the string's
      // rule: with `false` left out there, the part counted as having nothing of
      // its own to write and the name was spelled out
      const builder = changed(name, (b) => b.glyph(0).part(0).setOptions({ color: false }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe(`[color=false]>${name}`);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });
  });
});
