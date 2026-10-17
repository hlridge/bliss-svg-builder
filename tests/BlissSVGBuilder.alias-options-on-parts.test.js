/**
 * Pins a bare alias's options landing on every part it expands to, never on
 * the character: an alias stays shorthand, and its options style exactly what
 * it draws, through every link of a chain and every word it spells.
 *
 * Covers:
 * - Where a one-code, a two-part and a word alias store their options: on the
 *   parts, none on the characters.
 * - Every route that adds `B99` to a lone alias and to a word alias (the `;;`
 *   overlay, both group applies, the glyph apply, `addPart`, the reloads of
 *   both flattened saves) drawing byte-identical to the spelling with the
 *   options as part brackets.
 * - A multi-word (`//`) alias styling both words.
 * - An alias of an alias, and an alias of a typed glyph, drawing both links'
 *   options; the outer link winning a key both set.
 * - A character option over an alias leaving the alias's own colour; a part
 *   bracket restyling it.
 * - The saves: the options as part brackets by default; under `preserve` a
 *   one-code alias's name, and the shorthand spelled out.
 * - A second character bracket on an alias or a typed glyph reported once, as
 *   on a built-in.
 * - An alias renaming a built-in reloading from its `preserve` JSON as the
 *   builder draws it.
 *
 * Does NOT cover:
 * - An alias used in a `;` slot, read there as it is written alone, see
 *   `BlissSVGBuilder.alias-in-part-slot.test.js`.
 * - The clears and the `preserve` saves of an alias once its options sit on
 *   its parts, see `BlissSVGBuilder.alias-options-kept.test.js`.
 * - Typed definitions written alone, see
 *   `BlissSVGBuilder.definition-is-a-part.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const DOTS = { 'stroke-dasharray': '0 0.999' };

const FIXTURES = {
  AO_ALIAS: { codeString: 'B291', defaultOptions: DOTS },
  AO_ALIAS2: { codeString: 'B291;C8', defaultOptions: DOTS },
  AO_WORD: { codeString: 'B291/C8', defaultOptions: DOTS },
  AO_WORDS: { codeString: 'B291//C8', defaultOptions: { color: 'red' } },
  AO_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
  AO_A2: { codeString: 'AO_A1', defaultOptions: { 'stroke-width': 0.5 } },
  AO_TG: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  AO_AT: { codeString: 'AO_TG', defaultOptions: { 'stroke-width': 0.5 } },
  AO_BLUE: { codeString: 'AO_A1', defaultOptions: { color: 'blue' } },
  AO_DOPT: { codeString: 'B431', defaultOptions: { color: 'red' } },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

// The characters of `input` as the builder stores them, options included.
const storedCharacters = (input) => new BlissSVGBuilder(input).toJSON({ deep: true }).groups[0].glyphs;

// Each sub-path's ink with the styling that reaches it, the nearest group
// winning, in document order: the same look reached through one group or
// through two nested ones compares equal, however the renderer groups paths.
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

// Every route that adds B99 to a lone alias as an indicator, by name.
const ROUTES = [
  ['the ;; overlay', (base) => new BlissSVGBuilder(`${base};;B99`)],
  ['group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B99'))],
  ['group(0).applyIndicators with flatten', (base) => changed(base, (b) => b.group(0).applyIndicators('B99', { flatten: true }))],
  ['glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B99'))],
  ['glyph(0).addPart', (base) => changed(base, (b) => b.glyph(0).addPart('B99'))],
  ['reloading the flattened string', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toString({ flattenIndicators: true }))],
  ['reloading the flattened JSON', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toJSON({ flattenIndicators: true }))],
];

const ROUTE_CASES = [
  ['AO_ALIAS', '[stroke-dasharray=0 0.999]>B291;B99'],
  ['AO_WORD', '[stroke-dasharray=0 0.999]>B291;B99/[stroke-dasharray=0 0.999]>C8'],
].flatMap(([base, target]) => ROUTES.map(([route, build]) => [base, route, target, build]));

describe('BlissSVGBuilder alias options on parts', () => {
  describe('when an alias that brings options is written alone', () => {
    it.each([
      ['AO_ALIAS', [[DOTS]]],
      ['AO_ALIAS2', [[DOTS, DOTS]]],
      ['AO_WORD', [[DOTS], [DOTS]]],
    ])('stores the options of %s on the parts it expands to and none on its characters', (input, partOptions) => {
      // regression: the options sat on the character (on a word alias, its
      // first character only), where they styled every part added later
      const characters = storedCharacters(input);
      expect(characters.map((character) => character.options)).toEqual(characters.map(() => undefined));
      expect(characters.map((character) => character.parts.map((part) => part.options))).toEqual(partOptions);
    });
  });

  describe('when an indicator is added to a lone alias', () => {
    it.each(ROUTE_CASES)('draws %s given B99 by %s as %s', (base, _route, target, build) => {
      const builder = build(base);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(target).svgCode);
      expect(builder.toString({ flattenIndicators: true })).toBe(target);
    });
  });

  describe('when an alias spells more than one word', () => {
    it('styles both words of AO_WORDS', () => {
      // regression: a multi-word alias's options were dropped
      expect(new BlissSVGBuilder('AO_WORDS').svgCode).toBe(new BlissSVGBuilder('[color=red]>B291//[color=red]>C8').svgCode);
    });
  });

  describe('when an alias names another definition that brings options', () => {
    it.each(['AO_A2', 'AO_AT'])('draws %s with both links\' options', (input) => {
      // regression: the outer link's options replaced the inner link's, so the
      // red was lost where the outer link brought a stroke width
      const builder = new BlissSVGBuilder(input);
      expect(styledInkOf(builder.svgCode)).toEqual(styledInkOf(new BlissSVGBuilder('[color=red;stroke-width=0.5]>B291').svgCode));
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('draws the outer link\'s colour where both links set one', () => {
      // control: passes before C23
      expect(styledInkOf(new BlissSVGBuilder('AO_BLUE').svgCode)).toEqual(styledInkOf(new BlissSVGBuilder('[color=blue]>B291').svgCode));
    });
  });

  describe('when an option is written over an alias that brings its own', () => {
    it('keeps the alias\'s colour under a character option', () => {
      expect(new BlissSVGBuilder('[color=blue]AO_A1').svgCode).toBe(new BlissSVGBuilder('[color=blue][color=red]>B291').svgCode);
    });

    it('restyles the alias under a part bracket', () => {
      // control: passes before C23
      expect(new BlissSVGBuilder('[color=blue]>AO_A1').svgCode).toBe(new BlissSVGBuilder('[color=blue]>B291').svgCode);
    });
  });

  describe('when an alias that brings options is saved', () => {
    it.each([
      ['AO_ALIAS', '[stroke-dasharray=0 0.999]>B291', 'AO_ALIAS'],
      ['AO_ALIAS2', '[stroke-dasharray=0 0.999]>B291;[stroke-dasharray=0 0.999]>C8', '[stroke-dasharray=0 0.999]>B291;[stroke-dasharray=0 0.999]>C8'],
      ['AO_WORD', '[stroke-dasharray=0 0.999]>B291/[stroke-dasharray=0 0.999]>C8', '[stroke-dasharray=0 0.999]>B291/[stroke-dasharray=0 0.999]>C8'],
    ])('writes %s as %s, and as %s under preserve', (input, saved, preserved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(builder.toString({ preserve: true })).toBe(preserved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(preserved).svgCode).toBe(builder.svgCode);
    });

    it('reloads AO_DOPT from its preserve JSON as the builder draws it', () => {
      // regression: the JSON put the colour on the character and the name on
      // its part, which the reload styled a second time
      const builder = new BlissSVGBuilder('AO_DOPT');
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a second character bracket is written on a definition\'s name', () => {
    it.each(['AO_ALIAS', 'AO_TG'])('reports the second bracket on %s once and applies the first', (name) => {
      // regression: the second bracket was dropped in silence, where on a
      // built-in it is reported
      const builder = new BlissSVGBuilder(`[color=red][color=blue]${name}`);
      expect(builder.warnings.map((warning) => [warning.code, warning.source])).toEqual([['MULTIPLE_OPTION_BRACKETS', '[color=blue]']]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(`[color=red]${name}`).svgCode);
    });
  });
});
