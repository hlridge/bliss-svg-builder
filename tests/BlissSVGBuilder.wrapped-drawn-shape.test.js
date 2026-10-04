/**
 * Pins a typed glyph or shape whose code string names a shape drawn by its own
 * function (`getPath`): the definition draws that shape, so the shape's own
 * options style it wherever the definition is used, as they would if the
 * shape were held as a part inside it.
 *
 * Covers:
 * - A typed glyph and a typed shape naming such a shape, written alone and in
 *   a `;` slot, drawing with the shape's options, and an indicator added
 *   beside them drawing without.
 * - Precedence: the shape's own options win over the wrapping definition's,
 *   as a typed shape's do when a typed glyph holds it; a part bracket written
 *   on the use wins over both. Control: a bare alias naming the shape keeps
 *   its own options over the shape's.
 * - The saves (spelled out to the shape's name, which brings its options;
 *   `preserve` keeping the definition's name) and their reloads.
 * - The clears returning the part to those options.
 * - A composition object naming the definition, as the character or as a
 *   part, directly or inside another definition, drawing as the DSL does.
 *
 * Does NOT cover:
 * - A bare alias naming such a shape, which brings the shape's options by
 *   another route, see `BlissSVGBuilder.code-string-own-bracket.test.js` and
 *   `BlissSVGBuilder.alias-options-kept.test.js`.
 * - The shape used by its own name, see
 *   `BlissSVGBuilder.definition-options-kept.test.js`.
 * - The anchor of a code a typed glyph wraps, which the glyph does not take,
 *   see `BlissSVGBuilder.definition-is-a-part.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  WF_LINE: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { color: 'red' } },
  WF_GLYPH: { type: 'glyph', codeString: 'WF_LINE' },
  WF_SHAPE: { type: 'shape', codeString: 'WF_LINE' },
  WF_BLUE: { type: 'glyph', codeString: 'WF_LINE', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  WF_HOLDER: { type: 'glyph', codeString: 'WF_GLYPH;C8' },
  WF_RING: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'red' } },
  WF_RING_BLUE: { type: 'glyph', codeString: 'WF_RING', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  WF_ALIAS_BLUE: { codeString: 'WF_LINE', defaultOptions: { color: 'blue' } },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// Each sub-path's ink with the styling that reaches it, the nearest group
// winning, in document order: one look reached through one group or through
// two nested ones compares equal.
const styledInkOf = (svg) => {
  const content = svg.slice(svg.indexOf('class="bliss-content"'));
  const flat = [1, 2, 3, 4, 5, 6].reduce((text) => text.replace(/<g ([^>]*)>((?:(?!<\/?g[ >])[\s\S])*?)<\/g>/g,
    (_, attrs, inner) => inner.replaceAll('<path ', `<path ${attrs} `)), content);
  return [...flat.matchAll(/<path ([^>]*?)\/>/g)].flatMap(([, attrs]) => {
    const { d, ...look } = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const style = Object.keys(look).sort().map((key) => `${key}=${look[key]}`).join(';');
    return d.split(/(?=M)/).map((stroke) => `${stroke} ${style}`);
  });
};

const build = (input) => new BlissSVGBuilder(input);
const objectOf = (glyph) => ({ groups: [{ glyphs: [glyph] }] });

describe('BlissSVGBuilder wrapped drawn shape', () => {
  describe('when a definition naming the shape is written alone', () => {
    it.each(['WF_GLYPH', 'WF_SHAPE'])('draws %s with the shape\'s own options, as the shape written alone does', (name) => {
      // regression: a lone typed glyph or shape read as one named part lost
      // the options of the drawn shape it renames to, and its save, which
      // names the shape, reloaded them
      expect(styledInkOf(build(name).svgCode)).toEqual(styledInkOf(build('WF_LINE').svgCode));
      expect(build(name).warnings).toEqual([]);
    });

    it('keeps the shape\'s options off an indicator added with ;;, as the ; spelling does', () => {
      expect(build('WF_GLYPH;;B81').svgCode).toBe(build('WF_GLYPH;B81').svgCode);
      expect(styledInkOf(build('WF_GLYPH;B81').svgCode)).toEqual(styledInkOf(build('WF_LINE;B81').svgCode));
    });
  });

  describe('when a definition naming the shape sits in a ; slot', () => {
    it.each(['WF_GLYPH', 'WF_SHAPE'])('draws B291;%s with the shape\'s own options', (name) => {
      // regression: the slot reading renamed the part to the shape and never
      // gave it the shape's options (identical on v1.0.0)
      expect(styledInkOf(build(`B291;${name}`).svgCode)).toEqual(styledInkOf(build('B291;WF_LINE').svgCode));
    });

    it('draws a glyph holding such a definition with the shape\'s own options', () => {
      expect(styledInkOf(build('B291;WF_HOLDER').svgCode)).toEqual(styledInkOf(build('B291;WF_LINE;C8').svgCode));
    });
  });

  describe('when the wrapping definition brings options of its own', () => {
    it('draws WF_RING_BLUE with the held shape\'s colour over the glyph\'s and the glyph\'s stroke width', () => {
      // control: passes before the fix; the nested form the rename must match
      expect(styledInkOf(build('WF_RING_BLUE').svgCode)).toEqual(styledInkOf(build('[stroke-width=0.5]>WF_RING').svgCode));
    });

    it.each(['WF_BLUE', 'B291;WF_BLUE'])('draws %s as the nested form does: the shape\'s colour, the glyph\'s stroke width', (input) => {
      const twin = input.replace('WF_BLUE', '[stroke-width=0.5]>WF_LINE');
      expect(styledInkOf(build(input).svgCode)).toEqual(styledInkOf(build(twin).svgCode));
    });

    it('lets a part bracket written on the use win over both', () => {
      expect(styledInkOf(build('[color=green]>WF_BLUE').svgCode))
        .toEqual(styledInkOf(build('[color=green;stroke-width=0.5]>WF_LINE').svgCode));
    });

    it.each(['WF_ALIAS_BLUE', 'B291;WF_ALIAS_BLUE'])('lets a bare alias naming the shape keep its own colour over the shape\'s in %s', (input) => {
      // control: passes before the fix; an alias is shorthand for the code it
      // names, so its options win over what that code brings, unlike a typed
      // definition, which holds the code
      const twin = input.replace('WF_ALIAS_BLUE', '[color=blue]>WF_LINE');
      expect(styledInkOf(build(input).svgCode)).toEqual(styledInkOf(build(twin).svgCode));
    });
  });

  describe('when such a composition is saved', () => {
    it.each([
      ['WF_GLYPH', 'WF_LINE', 'WF_GLYPH'],
      ['B291;WF_GLYPH', 'B291;WF_LINE', 'B291;WF_GLYPH'],
      ['WF_BLUE', '[stroke-width=0.5]>WF_LINE', 'WF_BLUE'],
    ])('saves %s as %s, and as %s under preserve, each reloading the same drawing', (input, saved, preserved) => {
      const builder = build(input);
      expect(builder.toString()).toBe(saved);
      expect(builder.toString({ preserve: true })).toBe(preserved);
      expect(styledInkOf(build(saved).svgCode)).toEqual(styledInkOf(builder.svgCode));
      expect(build(preserved).svgCode).toBe(builder.svgCode);
      expect(styledInkOf(new BlissSVGBuilder(builder.toJSON()).svgCode)).toEqual(styledInkOf(builder.svgCode));
    });
  });

  describe('when its options are cleared', () => {
    it.each([
      ['the character', (builder) => builder.glyph(0).clearOptions()],
      ['the part', (builder) => builder.glyph(0).part(0).clearOptions()],
      ['the part\'s colour', (builder) => builder.glyph(0).part(0).removeOptions('color')],
      ['everything', (builder) => builder.clearAllOptions()],
    ])('keeps the shape\'s options after clearing %s', (_target, clear) => {
      const builder = build('WF_GLYPH');
      clear(builder);
      expect(styledInkOf(builder.svgCode)).toEqual(styledInkOf(build('WF_LINE').svgCode));
      expect(builder.toString({ preserve: true })).toBe('WF_GLYPH');
    });
  });

  describe('when a composition object names such a definition', () => {
    it.each([
      ['as the character over the shape it draws', objectOf({ codeName: 'WF_GLYPH', parts: [{ codeName: 'WF_LINE' }] }), 'WF_GLYPH'],
      ['as a part', objectOf({ parts: [{ codeName: 'B291' }, { codeName: 'WF_GLYPH' }] }), 'B291;WF_GLYPH'],
      ['inside another definition', objectOf({ parts: [{ codeName: 'B291' }, { codeName: 'WF_HOLDER' }] }), 'B291;WF_HOLDER'],
    ])('draws it %s as the DSL does', (_where, object, dsl) => {
      expect(new BlissSVGBuilder(object).svgCode).toBe(build(dsl).svgCode);
    });
  });
});
