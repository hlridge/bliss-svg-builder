/**
 * Pins the default `toJSON()` breaking every part named by a custom definition
 * with a code string down into built-in codes, in any position, so the JSON
 * draws in an instance that never defined the name, as its JSDoc promises.
 *
 * Covers:
 * - A custom glyph in a `;` slot, a custom glyph made of another custom glyph,
 *   with and without an indicator appended, a two-part custom glyph, and a bare
 *   alias in a slot: each published as the built-in codes it draws, its options
 *   merged onto each inner part and its positions kept.
 * - A position written on the custom part, a zero included, reaching each part
 *   it is published as; a compound indicator in a slot, broken down too.
 * - A shape defined after the composition was built, published as the codes
 *   it draws once it is defined.
 * - The invariant over every row: every code the JSON publishes is built in or
 *   drawn by its own function (`getPath`, an external glyph).
 * - Each JSON rebuilt saving the original's string and drawing its ink and
 *   colours.
 * - Controls: a `getPath` shape and an external glyph stay named, having
 *   nothing to break down into; a typed shape renaming one code is published as
 *   that code; `preserve` and `deep` keep the custom names.
 *
 * Does NOT cover:
 * - A custom glyph written alone, whose default JSON is pinned with its stored
 *   shape, see `BlissSVGBuilder.definition-is-a-part.test.js`.
 * - The string saves, which already break custom codes down, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`; this JSON spells a custom code
 *   out with the same step.
 * - A compound indicator holding a plain part on a base narrower than it,
 *   with or without a position: its string reloads as another picture
 *   (backlog: "Mixed-base compound indicator doesn't round-trip through
 *   primitive decomposition"), its JSON as drawn, see
 *   `BlissSVGBuilder.portable-compound-indicators.test.js`.
 * - A word-level (`;;`) code named by a custom definition, spelled out in
 *   both default saves, see `BlissSVGBuilder.portable-word-indicators.test.js`
 *   and `BlissSVGBuilder.portable-word-plain-parts.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  JP_DOT: { type: 'glyph', codeString: 'B291', defaultOptions: { 'stroke-dasharray': '0 0.999' } },
  JP_INNER: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  JP_OUTER: { type: 'glyph', codeString: 'JP_INNER;C8:1,2' },
  JP_TWO: { type: 'glyph', codeString: 'B291;C8', defaultOptions: { color: 'red' } },
  JP_ALIAS: { codeString: 'B291', defaultOptions: { color: 'red' } },
  JP_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue' } },
  JP_FN: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { color: 'red' } },
  JP_EXT: { type: 'externalGlyph', getPath: () => 'M0,8h4', width: 4, char: 'q' },
  JP_PD: { type: 'glyph', isIndicator: true, codeString: 'B86;B97' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const B99 = { codeName: 'B99', isIndicator: true, width: 2 };
const B81 = { codeName: 'B81', isIndicator: true, width: 2 };
const B86 = { codeName: 'B86', isIndicator: true, width: 2 };
const B97 = { codeName: 'B97', isIndicator: true, width: 2 };

// The parts of the first character of `input`'s JSON under `options`.
const publishedParts = (input, options) => new BlissSVGBuilder(input).toJSON(options).groups[0].glyphs[0].parts;

// Every code a JSON names, on its characters and on their parts.
const publishedCodeNames = (json) => json.groups.flatMap((group) => group.glyphs ?? [])
  .flatMap((glyph) => [glyph.codeName, ...(glyph.parts ?? []).map((part) => part.codeName)])
  .filter((code) => code !== undefined);

// Whether any instance draws `code` without a definition of its own: a
// built-in, or a code drawn by its own function, which the JSON can only name.
const drawsAnywhere = (code) => BlissSVGBuilder.getDefinition(code)?.isBuiltIn === true
  || typeof BlissSVGBuilder.getDefinition(code)?.getPath === 'function';

// Each sub-path's ink with the styling that reaches it, the nearest group
// winning, in document order: a look held by one named part and the same look
// written once per part compare equal, however the renderer groups the paths.
// Only the content group is read: options on the root <svg> fall outside it.
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

const BROKEN_DOWN = [
  ['JP_DOT;B99', [{ codeName: 'B291', options: { 'stroke-dasharray': '0 0.999' } }, B99]],
  ['JP_OUTER', [{ codeName: 'B291', options: { color: 'red' } }, { codeName: 'C8', x: 1, y: 2 }]],
  ['JP_OUTER;B81', [{ codeName: 'B291', options: { color: 'red' } }, { codeName: 'C8', x: 1, y: 2 }, B81]],
  ['JP_TWO;B81', [{ codeName: 'B291', options: { color: 'red' } }, { codeName: 'C8', options: { color: 'red' } }, B81]],
  ['B291;JP_ALIAS', [{ codeName: 'B291' }, { codeName: 'B291', options: { color: 'red' } }]],
  ['B291;JP_TWO:0,1', [
    { codeName: 'B291' },
    { codeName: 'B291', x: 0, y: 1, options: { color: 'red' } },
    { codeName: 'C8', x: 0, y: 1, options: { color: 'red' } },
  ]],
  // note: an indicator's place is the indicator layout's, so its parts are
  // published with no position, as the string writes them
  ['B291;JP_PD', [{ codeName: 'B291' }, B86, B97]],
];

describe('BlissSVGBuilder JSON portable parts', () => {
  describe('when the default JSON publishes a part named by a custom definition with a code string', () => {
    it.each(BROKEN_DOWN)('breaks %s down into the built-in codes it draws', (input, parts) => {
      // regression: the custom name was published as a part, which only an
      // instance holding the same definition can draw
      expect(publishedParts(input)).toEqual(parts);
    });

    it.each(BROKEN_DOWN.map(([input]) => input))('rebuilds %s from its JSON with the same string and drawing', (input) => {
      // control: passes before C23
      const builder = new BlissSVGBuilder(input);
      const rebuilt = new BlissSVGBuilder(builder.toJSON());
      expect(rebuilt.toString()).toBe(builder.toString());
      expect(styledInkOf(rebuilt.svgCode)).toEqual(styledInkOf(builder.svgCode));
    });

    it.each([
      ...BROKEN_DOWN.map(([input]) => input),
      // controls: pass before C23
      'B291;JP_FN', 'B291;JP_EXT', 'B291;JP_SHAPE',
    ])('publishes only codes any instance can draw for %s', (input) => {
      const codes = publishedCodeNames(new BlissSVGBuilder(input).toJSON());
      expect(codes.length).toBeGreaterThan(0);
      expect(codes.filter((code) => !drawsAnywhere(code))).toEqual([]);
    });
  });

  describe('when a part names a shape defined after the composition was built', () => {
    it('publishes it as the codes it draws once it is defined', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'JP_LATE', x: 1 }] }] }] });
      const { errors } = BlissSVGBuilder.define({ JP_LATE: { type: 'shape', codeString: 'HL8;VL8', defaultOptions: { color: 'blue' } } });
      try {
        expect(errors).toEqual([]);
        expect(builder.toJSON().groups[0].glyphs[0].parts).toEqual([
          { codeName: 'B291' },
          { codeName: 'HL8', x: 1, options: { color: 'blue' } },
          { codeName: 'VL8', x: 1, options: { color: 'blue' } },
        ]);
        expect(builder.toString()).toBe('B291;[color=blue]>HL8:1;[color=blue]>VL8:1');
      } finally {
        BlissSVGBuilder.removeDefinition('JP_LATE');
      }
    });
  });

  describe('when a part has nothing to break down into, or is already one code', () => {
    it.each([
      ['B291;JP_FN', [{ codeName: 'B291' }, { codeName: 'JP_FN', options: { color: 'red' } }]],
      ['B291;JP_EXT', [{ codeName: 'B291' }, { codeName: 'JP_EXT' }]],
      ['B291;JP_SHAPE', [{ codeName: 'B291' }, { codeName: 'C8', options: { color: 'blue' } }]],
    ])('publishes %s as it always has', (input, parts) => {
      // control: passes before C23
      expect(publishedParts(input)).toEqual(parts);
    });
  });

  describe('when the JSON keeps names', () => {
    it.each([
      ['JP_DOT;B99', 'preserve', { preserve: true }, ['JP_DOT', 'B99']],
      ['JP_DOT;B99', 'deep', { deep: true }, ['JP_DOT', 'B99']],
      ['JP_OUTER;B81', 'preserve', { preserve: true }, ['JP_OUTER', 'B81']],
      ['JP_OUTER;B81', 'deep', { deep: true }, ['JP_OUTER', 'B81']],
    ])('keeps the custom name in %s under %s', (input, _label, options, codes) => {
      // control: passes before C23
      expect(publishedParts(input, options).map((part) => part.codeName)).toEqual(codes);
    });
  });
});
