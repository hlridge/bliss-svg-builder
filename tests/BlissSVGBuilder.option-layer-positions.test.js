import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how a position meets the two layers of a JavaScript options argument
 * (`{ defaults, overrides }`): a default fills only an axis the element leaves
 * unset, and an override replaces the element's own value in silence, at every
 * scope and through every route that takes an options argument.
 *
 * A position has two homes on an element, the option and the promoted field a
 * bracket's `[x=5]` or a part's `C8:2,3` lands on, so a default that only
 * looked at the options bag would land in a channel the element already fills.
 *
 * Covers:
 * - A default under the element's own position, at composition, word,
 *   character and part scope: the element's value stays and nothing is
 *   reported. Routes: the constructor (over a string and over a composition
 *   object), the builder's `setOptions`, an element's `setOptions`,
 *   `addGroup`, `insertGroup`, `replaceGroup`,
 *   `addElement`, `insertElement`, `replaceElement`, `addGlyph`,
 *   `insertGlyph`, `replaceGlyph`, `replace`, `addPart`, `insertPart`,
 *   `replacePart`.
 * - A default under a held position of zero or below, at each scope: a
 *   position is held when it is set at all, whatever its value.
 * - A default into an element with no position, through the same routes.
 * - An override over the element's own position, through the same routes,
 *   with no `MULTIPLE_POSITION_VALUES` for a conflict nobody wrote.
 * - A default that names both axes over an element that sets one.
 * - Unchanged controls: an override beats a default in the same call, a
 *   position written twice in the code string still reports, two spellings
 *   of one axis in one layer still report, and a default colour still yields.
 * - Each result saves, exports, draws and reports exactly as the DSL spelling
 *   of the same value, and its exported composition reloads to the same
 *   drawing.
 *
 * Does NOT cover:
 * - Kerning, the other value with a home outside the options bag, see
 *   `BlissSVGBuilder.option-layer-kerning.test.js`.
 * - Which value wins when a part's option and its coordinate are both written
 *   in DSL text, see `BlissSVGBuilder.positioning-options.test.js`.
 * - How the layers order an ordinary option, see
 *   `BlissSVGBuilder.object-options.test.js`.
 */

// A builder made from `start`, after `mutate` has run on it.
const after = (start, mutate) => {
  const builder = new BlissSVGBuilder(start);
  mutate(builder);
  return builder;
};

// Everything a caller can read off a builder.
const readout = (builder) => ({
  saved: builder.toString(),
  json: builder.toJSON(),
  svg: builder.svgCode,
  warnings: builder.warnings.map(({ code, source }) => ({ code, source })),
});

// Asserts a builder saves as `expected`, reads, draws and reports exactly as a
// builder made from that string, and reloads from its export unchanged.
const expectSavedAs = (built, expected) => {
  expect(built.toString()).toBe(expected);
  expect(readout(built)).toEqual(readout(new BlissSVGBuilder(expected)));
  expect(new BlissSVGBuilder(built.toJSON()).svgCode).toBe(built.svgCode);
};

// Each route, as [name, apply, saved]: `apply(code, opts)` writes `code` with
// `opts` and returns the builder; `saved(token)` is the whole string the
// builder saves when the written element saves as `token`.
const COMPOSITION_ROUTES = [
  ['the constructor', (code, opts) => new BlissSVGBuilder(code, opts), (token) => token],
  ['the constructor over a composition object',
    (code, opts) => new BlissSVGBuilder(new BlissSVGBuilder(code).toJSON(), opts), (token) => token],
  ['the builder\'s setOptions', (code, opts) => after(code, (b) => b.setOptions(opts)), (token) => token],
];

const WORD_ROUTES = [
  ['setOptions', (code, opts) => after(code, (b) => b.group(0).setOptions(opts)), (token) => token],
  ['addGroup', (code, opts) => new BlissSVGBuilder('B313').addGroup(code, opts), (token) => `B313//${token}`],
  ['insertGroup', (code, opts) => new BlissSVGBuilder('B313').insertGroup(0, code, opts), (token) => `${token}//B313`],
  ['replaceGroup', (code, opts) => new BlissSVGBuilder('B313//B313').replaceGroup(0, code, opts), (token) => `${token}//B313`],
  ['addElement', (code, opts) => new BlissSVGBuilder().addElement(code, opts), (token) => token],
  ['insertElement', (code, opts) => new BlissSVGBuilder().insertElement(0, code, opts), (token) => token],
  ['replaceElement', (code, opts) => new BlissSVGBuilder('B313//B313').replaceElement(0, code, opts), (token) => `${token}//B313`],
];

const CHARACTER_ROUTES = [
  ['setOptions', (code, opts) => after(code, (b) => b.glyph(0).setOptions(opts)), (token) => token],
  ['addGlyph', (code, opts) => after('B313', (b) => b.group(0).addGlyph(code, opts)), (token) => `B313/${token}`],
  ['insertGlyph', (code, opts) => after('B313', (b) => b.group(0).insertGlyph(0, code, opts)), (token) => `${token}/B313`],
  ['replaceGlyph', (code, opts) => after('B313/B313', (b) => b.group(0).replaceGlyph(1, code, opts)), (token) => `B313/${token}`],
  ['replace', (code, opts) => after('B313', (b) => b.glyph(0).replace(code, opts)), (token) => token],
];

const PART_ROUTES = [
  ['setOptions', (code, opts) => after(`B313;${code}`, (b) => b.glyph(0).part(1).setOptions(opts)), (token) => `B313;${token}`],
  ['addPart', (code, opts) => after('B313', (b) => b.glyph(0).addPart(code, opts)), (token) => `B313;${token}`],
  ['insertPart', (code, opts) => after('B313', (b) => b.glyph(0).insertPart(1, code, opts)), (token) => `B313;${token}`],
  ['replacePart', (code, opts) => after('B313;HL2', (b) => b.glyph(0).replacePart(1, code, opts)), (token) => `B313;${token}`],
  ['replace', (code, opts) => after('B313;HL2', (b) => b.glyph(0).part(1).replace(code, opts)), (token) => `B313;${token}`],
  ['addPart on an empty builder', (code, opts) => after('', (b) => b.addPart(code, opts)), (token) => token],
];

describe('BlissSVGBuilder option layer positions', () => {
  describe('when a default meets a position the element already has', () => {
    it.each(COMPOSITION_ROUTES)('keeps the composition\'s own position through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]||H', { defaults: { x: 3 } }), saved('[x=5]||H'));
    });

    it.each(WORD_ROUTES)('keeps a word\'s own position through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]|H', { defaults: { x: 3 } }), saved('[x=5]|H'));
    });

    it.each(CHARACTER_ROUTES)('keeps a character\'s own position through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]H', { defaults: { x: 3 } }), saved('[x=5]H'));
    });

    it.each(PART_ROUTES)('keeps a part\'s own coordinate through %s', (_route, apply, saved) => {
      expectSavedAs(apply('C8:2,3', { defaults: { x: 1 } }), saved('C8:2,3'));
    });

    it('keeps a position a composition object holds in its options', () => {
      const built = new BlissSVGBuilder(
        { options: { x: 5 }, groups: [{ glyphs: [{ parts: [{ codeName: 'H' }] }] }] },
        { defaults: { x: 3 } },
      );
      expectSavedAs(built, '[x=5]||H');
    });
  });

  describe('when a default meets a position of zero or below', () => {
    // pins presence as the held test: a check on the value's sign or truth
    // would let the default in over a zero or a negative
    it.each([
      ['the composition', '0', () => after('[x=0]||H', (b) => b.setOptions({ defaults: { x: 1 } })), '[x=0]||H'],
      ['the composition', '-2', () => after('[x=-2]||H', (b) => b.setOptions({ defaults: { x: 1 } })), '[x=-2]||H'],
      ['a word', '0', () => after('[x=0]|H', (b) => b.group(0).setOptions({ defaults: { x: 1 } })), '[x=0]|H'],
      ['a word', '-2', () => after('[x=-2]|H', (b) => b.group(0).setOptions({ defaults: { x: 1 } })), '[x=-2]|H'],
      ['a character', '0', () => after('[x=0]H', (b) => b.glyph(0).setOptions({ defaults: { x: 1 } })), '[x=0]H'],
      ['a character', '-2', () => after('[x=-2]H', (b) => b.glyph(0).setOptions({ defaults: { x: 1 } })), '[x=-2]H'],
      ['a part', '0', () => after('B313;C8:0,3', (b) => b.glyph(0).part(1).setOptions({ defaults: { x: 1 } })), 'B313;C8:0,3'],
      ['a part', '-1', () => after('B313;C8:-1,3', (b) => b.glyph(0).part(1).setOptions({ defaults: { x: 1 } })), 'B313;C8:-1,3'],
    ])('keeps %s\'s own x of %s', (_scope, _value, build, expected) => {
      expectSavedAs(build(), expected);
    });
  });

  describe('when a default meets an element with no position', () => {
    it.each(COMPOSITION_ROUTES)('positions the composition through %s', (_route, apply, saved) => {
      expectSavedAs(apply('H', { defaults: { x: 3 } }), saved('[x=3]||H'));
    });

    it.each(WORD_ROUTES)('positions a word through %s', (_route, apply, saved) => {
      expectSavedAs(apply('H', { defaults: { x: 3 } }), saved('[x=3]|H'));
    });

    it.each(CHARACTER_ROUTES)('positions a character through %s', (_route, apply, saved) => {
      expectSavedAs(apply('H', { defaults: { x: 3 } }), saved('[x=3]H'));
    });

    it.each(PART_ROUTES)('positions a part through %s', (_route, apply, saved) => {
      expectSavedAs(apply('C8', { defaults: { x: 1 } }), saved('C8:1'));
    });
  });

  describe('when an override meets a position the element already has', () => {
    it.each(COMPOSITION_ROUTES)('replaces the composition\'s position in silence through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]||H', { overrides: { x: 3 } }), saved('[x=3]||H'));
    });

    it.each(WORD_ROUTES)('replaces a word\'s position in silence through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]|H', { overrides: { x: 3 } }), saved('[x=3]|H'));
    });

    it.each(CHARACTER_ROUTES)('replaces a character\'s position in silence through %s', (_route, apply, saved) => {
      expectSavedAs(apply('[x=5]H', { overrides: { x: 3 } }), saved('[x=3]H'));
    });

    it.each(PART_ROUTES)('replaces a part\'s coordinate in silence through %s', (_route, apply, saved) => {
      expectSavedAs(apply('C8:2,3', { overrides: { x: 1 } }), saved('C8:1,3'));
    });
  });

  describe('when a default names both axes and the element sets one', () => {
    it.each([
      ['the composition sets x', () => new BlissSVGBuilder('[x=5]||H', { defaults: { x: 3, y: 4 } }), '[x=5;y=4]||H'],
      ['the composition sets y', () => new BlissSVGBuilder('[y=5]||H', { defaults: { x: 3, y: 4 } }), '[x=3;y=5]||H'],
      ['a word sets x', () => after('[x=5]|H', (b) => b.group(0).setOptions({ defaults: { x: 3, y: 4 } })), '[x=5;y=4]|H'],
      ['a character sets x', () => after('[x=5]H', (b) => b.glyph(0).setOptions({ defaults: { x: 3, y: 4 } })), '[x=5;y=4]H'],
      ['a character sets y', () => after('[y=5]H', (b) => b.glyph(0).setOptions({ defaults: { x: 3, y: 4 } })), '[x=3;y=5]H'],
      ['a part sets x', () => after('B313;C8:2', (b) => b.glyph(0).part(1).setOptions({ defaults: { x: 1, y: 4 } })), 'B313;C8:2,4'],
      ['a part sets y', () => after('B313;C8:,3', (b) => b.glyph(0).part(1).setOptions({ defaults: { x: 1, y: 4 } })), 'B313;C8:1,3'],
    ])('keeps the axis %s and fills the other', (_scope, build, expected) => {
      expectSavedAs(build(), expected);
    });
  });

  describe('when an override names y', () => {
    it.each([
      ['the constructor', () => new BlissSVGBuilder('[y=5]||H', { overrides: { y: 4 } }), '[y=4]||H'],
      ['addGroup', () => new BlissSVGBuilder('B313').addGroup('[y=5]|H', { y: 4 }), 'B313//[y=4]|H'],
      ['a part\'s setOptions', () => after('B313;C8:2,3', (b) => b.glyph(0).part(1).setOptions({ y: 4 })), 'B313;C8:2,4'],
    ])('replaces the element\'s own y in silence through %s', (_route, build, expected) => {
      expectSavedAs(build(), expected);
    });
  });

  describe('when one call carries a default and an override for the same axis', () => {
    it('positions by the override', () => {
      const built = after('[x=5]H', (b) => b.glyph(0).setOptions({ defaults: { x: 3 }, overrides: { x: 4 } }));
      expectSavedAs(built, '[x=4]H');
    });
  });

  describe('when the code string itself writes a position twice', () => {
    it('still reports the coordinate the option displaced, and keeps the option under a default', () => {
      const built = after('B313', (b) => b.glyph(0).addPart('[x=5]>C8:2', { defaults: { x: 1 } }));
      expect(built.toString()).toBe('B313;C8:5');
      expect(built.warnings.map(({ code, source }) => ({ code, source })))
        .toEqual([{ code: 'MULTIPLE_POSITION_VALUES', source: ':2' }]);
    });
  });

  describe('when one layer spells one axis twice', () => {
    it.each([
      ['overrides', { overrides: { x: 3, X: 4 } }],
      ['defaults', { defaults: { x: 3, X: 4 } }],
    ])('still reports the earlier spelling from %s', (_layer, opts) => {
      const built = after('B291', (b) => b.glyph(0).setOptions(opts));
      expect(built.toString()).toBe('[x=4]B291');
      expect(built.warnings.map(({ code, source }) => ({ code, source })))
        .toEqual([{ code: 'MULTIPLE_OPTION_SPELLINGS', source: 'x=3' }]);
    });
  });

  describe('when a default names an option other than a position', () => {
    it.each([
      ['the constructor', () => new BlissSVGBuilder('[color=red]||H', { defaults: { color: 'blue' } }), '[color=red]||H'],
      ['the builder\'s setOptions', () => after('[color=red]||H', (b) => b.setOptions({ defaults: { color: 'blue' } })), '[color=red]||H'],
      ['addGroup', () => new BlissSVGBuilder('B313').addGroup('[color=red]|H', { defaults: { color: 'blue' } }), 'B313//[color=red]|H'],
      ['setOptions', () => after('[color=red]|H', (b) => b.group(0).setOptions({ defaults: { color: 'blue' } })), '[color=red]|H'],
    ])('lets the element\'s own colour beat a default through %s', (_route, build, expected) => {
      expectSavedAs(build(), expected);
    });
  });
});
