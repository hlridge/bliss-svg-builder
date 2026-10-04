/**
 * Pins every route that adds an indicator to a typed custom glyph or shape
 * written alone drawing and saving as the DSL `;` spelling does: the
 * definition's options style the one part it is, never the indicator.
 *
 * Covers:
 * - A one-part and a two-part typed glyph with `defaultOptions`, a typed shape
 *   with a code string, and a typed glyph whose options come from its code
 *   string's character bracket, each given `B99` by the `;;` overlay, both
 *   group applies, the glyph apply and `addPart`: byte-identical to
 *   `<name>;B99`, flatten-saving to its string.
 * - The reloads of both flattened saves, which spell the definition out as
 *   built-in codes: the same string, and the same ink and colours.
 *
 * Does NOT cover:
 * - The same routes on a built-in's own look, see
 *   `BlissSVGBuilder.builtin-look-routes.test.js`.
 * - The same routes on a bare alias, see
 *   `BlissSVGBuilder.alias-options-on-parts.test.js`.
 * - How a lone definition is stored and saved without an indicator, see
 *   `BlissSVGBuilder.definition-is-a-part.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const DOTS = { 'stroke-dasharray': '0 0.999' };

const FIXTURES = {
  DR_DOT: { type: 'glyph', codeString: 'B291', defaultOptions: DOTS },
  DR_TWO: { type: 'glyph', codeString: 'B291;C8', defaultOptions: DOTS },
  DR_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: DOTS },
  DR_RED: { type: 'glyph', codeString: '[color=red]B291' },
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

const BASES = Object.keys(FIXTURES);

// Every route that adds B99 to a lone definition and keeps the definition named.
const LIVE_ROUTES = [
  ['the ;; overlay', (base) => new BlissSVGBuilder(`${base};;B99`)],
  ['group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B99'))],
  ['group(0).applyIndicators with flatten', (base) => changed(base, (b) => b.group(0).applyIndicators('B99', { flatten: true }))],
  ['glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B99'))],
  ['glyph(0).addPart', (base) => changed(base, (b) => b.glyph(0).addPart('B99'))],
];

// Every route that reloads a flattened save, which spells the definition out.
const RELOAD_ROUTES = [
  ['reloading the flattened string', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toString({ flattenIndicators: true }))],
  ['reloading the flattened JSON', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toJSON({ flattenIndicators: true }))],
];

describe('BlissSVGBuilder definition is a part routes', () => {
  describe('when an indicator is added to a lone typed definition that brings options', () => {
    it.each(BASES.flatMap((base) => LIVE_ROUTES.map(([route, build]) => [base, route, build])))(
      'draws %s given B99 by %s as the ; spelling does', (base, _route, build) => {
        // regression: the definition's options sat on the character, so every
        // route but `;` drew the indicator in them
        const target = new BlissSVGBuilder(`${base};B99`);
        const builder = build(base);
        // pins the target drawing at all: two empty drawings would compare equal
        expect(target.warnings).toEqual([]);
        expect(builder.svgCode).toBe(target.svgCode);
        expect(builder.toString({ flattenIndicators: true })).toBe(target.toString());
      });
  });

  describe('when a flattened save of a lone typed definition given an indicator is reloaded', () => {
    it.each(BASES.flatMap((base) => RELOAD_ROUTES.map(([route, build]) => [base, route, build])))(
      'draws %s given B99 by %s with the ink and colours of the ; spelling', (base, _route, build) => {
        // note: the save writes the definition's options as part brackets, so
        // the reload groups its paths per part where the name held them together
        const target = new BlissSVGBuilder(`${base};B99`);
        const builder = build(base);
        expect(target.warnings).toEqual([]);
        expect(builder.toString({ flattenIndicators: true })).toBe(target.toString());
        expect(styledInkOf(builder.svgCode)).toEqual(styledInkOf(target.svgCode));
      });
  });
});
