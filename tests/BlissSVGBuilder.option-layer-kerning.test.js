import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how a kerning value meets the two layers of a JavaScript options
 * argument (`{ defaults, overrides }`): kerning is one channel per character,
 * whichever key writes it, so a default of either key fills it only when the
 * character has none and no override in the same call fills it, and an
 * override replaces the character's own value in silence.
 *
 * Covers:
 * - A default under the character's own kerning, through every route that
 *   takes a character's options (`setOptions`, `addGlyph`, `insertGlyph`,
 *   `replaceGlyph`, `replace`): the character's value stays, nothing reported.
 * - Every pairing of the character's key with the default's key
 *   (`relativeKerning`/`absoluteKerning`), since the channel is one.
 * - A default into an unkerned character, through the same routes.
 * - An override over the character's own kerning, through the same routes.
 * - A default and an override of different keys in one call: the override
 *   fills the channel, so the default yields in silence.
 * - Unchanged control: two kerning values in one layer still compete and
 *   report `MULTIPLE_KERNING_VALUES`.
 * - Each result saves, exports, draws and reports exactly as the DSL spelling
 *   of the same value, and its exported composition reloads to the same
 *   drawing.
 *
 * Does NOT cover:
 * - Positions, the other value with a home outside the options bag, see
 *   `BlissSVGBuilder.option-layer-positions.test.js`.
 * - Which kerning value wins when several are written in DSL text, see
 *   `BlissSVGBuilder.kerning-options.test.js`.
 * - Kerning refused outside character scope (`MISPLACED_KERNING_OPTION`), see
 *   `BlissSVGBuilder.option-scope-admission.test.js`.
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

// Each route, as [name, apply, saved]: `apply(code, opts)` writes the
// character `code` second in a word, after B291, so its kerning moves it; and
// `saved(token)` is the whole string saved when that character saves as `token`.
const KERNED_ROUTES = [
  ['setOptions', (code, opts) => after(`B291/${code}`, (b) => b.glyph(1).setOptions(opts)), (token) => `B291/${token}`],
  ['addGlyph', (code, opts) => after('B291', (b) => b.group(0).addGlyph(code, opts)), (token) => `B291/${token}`],
  ['insertGlyph', (code, opts) => after('B291/B313', (b) => b.group(0).insertGlyph(1, code, opts)), (token) => `B291/${token}/B313`],
  ['replaceGlyph', (code, opts) => after('B291/B313', (b) => b.group(0).replaceGlyph(1, code, opts)), (token) => `B291/${token}`],
  ['replace', (code, opts) => after('B291/B313', (b) => b.glyph(1).replace(code, opts)), (token) => `B291/${token}`],
];

describe('BlissSVGBuilder option layer kerning', () => {
  describe('when a default meets a character that is already kerned', () => {
    it.each(KERNED_ROUTES)('keeps the character\'s own kerning through %s', (_route, apply, saved) => {
      expectSavedAs(apply('RK:2/B291', { defaults: { relativeKerning: 5 } }), saved('RK:2/B291'));
    });

    it.each([
      ['RK:2/B291', 'absoluteKerning'],
      ['AK:2/B291', 'relativeKerning'],
      ['AK:2/B291', 'absoluteKerning'],
    ])('keeps %s under a default of %s', (own, key) => {
      const built = after(`B291/${own}`, (b) => b.glyph(1).setOptions({ defaults: { [key]: 5 } }));
      expectSavedAs(built, `B291/${own}`);
    });

    it('keeps the kerning of a character that carries another option beside it', () => {
      const built = after('B291/RK:2/[color=red]B291', (b) => b.glyph(1).setOptions({ defaults: { relativeKerning: 5 } }));
      expectSavedAs(built, 'B291/RK:2/[color=red]B291');
    });
  });

  describe('when a default meets a character with no kerning', () => {
    it.each(KERNED_ROUTES)('kerns the character through %s', (_route, apply, saved) => {
      expectSavedAs(apply('B291', { defaults: { relativeKerning: 5 } }), saved('RK:5/B291'));
    });
  });

  describe('when an override meets a character that is already kerned', () => {
    it.each(KERNED_ROUTES)('replaces the character\'s kerning in silence through %s', (_route, apply, saved) => {
      expectSavedAs(apply('RK:2/B291', { overrides: { absoluteKerning: 5 } }), saved('AK:5/B291'));
    });
  });

  describe('when one call carries a default and an override of different keys', () => {
    it.each(KERNED_ROUTES)('kerns by the override alone through %s', (_route, apply, saved) => {
      const opts = { defaults: { relativeKerning: 2 }, overrides: { absoluteKerning: 3 } };
      expectSavedAs(apply('B291', opts), saved('AK:3/B291'));
    });

    it('kerns by the override alone when the override carries another option too', () => {
      const opts = { defaults: { relativeKerning: 2 }, overrides: { color: 'red', absoluteKerning: 3 } };
      const built = after('B291/B291', (b) => b.glyph(1).setOptions(opts));
      expectSavedAs(built, 'B291/AK:3/[color=red]B291');
    });
  });

  describe('when one layer carries two kerning values', () => {
    it.each([
      ['overrides', { overrides: { relativeKerning: 2, absoluteKerning: 3 } }],
      ['defaults', { defaults: { relativeKerning: 2, absoluteKerning: 3 } }],
    ])('still reports the displaced one from %s', (_layer, opts) => {
      const built = after('B291/B291', (b) => b.glyph(1).setOptions(opts));
      expect(built.toString()).toBe('B291/AK:3/B291');
      expect(built.warnings.map(({ code, source }) => ({ code, source })))
        .toEqual([{ code: 'MULTIPLE_KERNING_VALUES', source: 'relative-kerning=2' }]);
    });
  });
});
