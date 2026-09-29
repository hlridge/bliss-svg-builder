/**
 * Pins a code's own look as part of the character: what a built-in's definition
 * (`REFSQUARE`'s and `ANCHORRING`'s dotted line) or a shape drawn by its own
 * function supplies by name is not written back as an option, not removed by
 * the options methods, and not dropped by `omitOptions`.
 *
 * Covers:
 * - The canonical string no longer repeating a built-in's own look, flattened
 *   output included, and every such save reloading what the builder draws.
 * - An override of the look written and kept, `none` drawing a solid line.
 * - `removeOptions`, `clearOptions()` and `clearAllOptions()` returning the look
 *   to the definition's instead of stripping it.
 * - The flag writing the bare code, its JSON keeping the look in the bags.
 * - A shape drawn by its own function (`getPath`) with `defaultOptions`, which
 *   the string can only name, behaving the same way, its own value typed out
 *   in the DSL included.
 * - A custom glyph's defaults, by contrast, still written as options.
 *
 * Does NOT cover:
 * - A custom name whose definition carries options under `preserve`, see
 *   `BlissSVGBuilder.preserve-removed-default.test.js`.
 * - How the dotted line itself renders, see
 *   `BlissSVGBuilder.default-options.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  BL_PRIM: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { color: 'red' } },
  BL_WIDEPRIM: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { 'stroke-width': 0.5 } },
  BL_REDB: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
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

// Every dash pattern the SVG draws with, in document order.
const dashesOf = (svg) => svg.match(/stroke-dasharray="[^"]*"/g) ?? [];

// Every path and transform in the content group, joined, so a styled part drawn
// as a <path> of its own compares equal to the same part merged into its neighbour.
const inkOf = (svg) => [...svg.slice(svg.indexOf('class="bliss-content"')).matchAll(/ (?:d|transform)="([^"]*)"/g)]
  .map((match) => match[1])
  .join('');

describe('BlissSVGBuilder built-in own look', () => {
  describe('when a built-in is written with nothing of its own', () => {
    it.each([
      ['REFSQUARE', 'REFSQUARE'],
      ['B291/REFSQUARE', 'B291/REFSQUARE'],
      ['B291;ANCHORRING', 'B291;ANCHORRING'],
    ])('writes %s by its code alone', (input, expected) => {
      // regression: the dotted line came back as two brackets,
      // `[stroke-dasharray=0 0.999][stroke-dasharray=0 0.999]>REFSQUARE`
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(expected);
      expect(new BlissSVGBuilder(expected).svgCode).toBe(builder.svgCode);
    });

    it('writes a flattened word-level ANCHORRING by its code alone', () => {
      const builder = new BlissSVGBuilder('B291;;ANCHORRING');
      const saved = builder.toString({ flattenIndicators: true });
      expect(saved).toBe('B291;ANCHORRING');
      expect(dashesOf(new BlissSVGBuilder(saved).svgCode)).toEqual(dashesOf(builder.svgCode));
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(builder.svgCode));
    });
  });

  describe('when the look is overridden', () => {
    it.each([
      ['[stroke-dasharray=4 4]>REFSQUARE', ['stroke-dasharray="4 4"']],
      ['[stroke-dasharray=none]>REFSQUARE', ['stroke-dasharray="none"']],
    ])('writes %s back and draws the override', (input, dashes) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(input);
      expect(dashesOf(builder.svgCode)).toEqual(dashes);
      expect(new BlissSVGBuilder(input).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the look is removed or cleared', () => {
    it.each([
      ['removing it from the character', (b) => b.glyph(0).removeOptions('stroke-dasharray')],
      ['removing it from the part', (b) => b.glyph(0).part(0).removeOptions('stroke-dasharray')],
      ['removing it from both', (b) => { b.glyph(0).removeOptions('stroke-dasharray'); b.glyph(0).part(0).removeOptions('stroke-dasharray'); }],
      // pins matching the look's keys the way removal reads a name: the
      // JavaScript spelling removes the same stored key, so it returns too
      ['removing it under its JavaScript spelling', (b) => b.glyph(0).part(0).removeOptions('strokeDasharray')],
      ['clearing the character', (b) => b.glyph(0).clearOptions()],
      ['clearing everything', (b) => b.clearAllOptions()],
    ])('keeps the dotted line of REFSQUARE after %s', (_label, change) => {
      // note: the options methods take off what was written on top of a
      // built-in; its own look is part of the character, like its strokes
      const builder = changed('REFSQUARE', change);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('REFSQUARE').svgCode);
      expect(builder.toString()).toBe('REFSQUARE');
    });

    it.each([
      ['removing it', (b) => b.glyph(0).part(0).removeOptions('stroke-dasharray')],
      ['clearing the part', (b) => b.glyph(0).part(0).clearOptions()],
    ])('returns an overridden REFSQUARE to its own look after %s', (_label, change) => {
      const builder = changed('[stroke-dasharray=4 4]>REFSQUARE', change);
      expect(dashesOf(builder.svgCode)).not.toContain('stroke-dasharray="4 4"');
      expect(dashesOf(builder.svgCode)).toContain('stroke-dasharray="0 0.999"');
      expect(builder.toString()).toBe('REFSQUARE');
      expect(inkOf(new BlissSVGBuilder('REFSQUARE').svgCode)).toBe(inkOf(builder.svgCode));
    });

    it('returns a REFSQUARE drawn solid to its own look after clearing the part', () => {
      const builder = changed('[stroke-dasharray=none]>REFSQUARE', (b) => b.glyph(0).part(0).clearOptions());
      expect(dashesOf(builder.svgCode)).not.toContain('stroke-dasharray="none"');
      expect(dashesOf(builder.svgCode)).toContain('stroke-dasharray="0 0.999"');
      expect(builder.toString()).toBe('REFSQUARE');
    });

    it('keeps the dotted line of ANCHORRING when it is removed from the part', () => {
      const builder = changed('B291;ANCHORRING', (b) => b.glyph(0).part(1).removeOptions('stroke-dasharray'));
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;ANCHORRING').svgCode);
    });
  });

  describe('when the flag saves a built-in', () => {
    it.each([
      ['a styled REFSQUARE', '[color=red]REFSQUARE'],
      ['an overridden REFSQUARE', '[stroke-dasharray=4 4]>REFSQUARE'],
    ])('writes the bare code for %s, which reloads dotted', (_label, input) => {
      const saved = new BlissSVGBuilder(input).toString({ omitOptions: true });
      expect(saved).toBe('REFSQUARE');
      expect(dashesOf(new BlissSVGBuilder(saved).svgCode)).toContain('stroke-dasharray="0 0.999"');
    });

    it('keeps the look in the bags of the saved JSON', () => {
      const builder = new BlissSVGBuilder('REFSQUARE');
      expect(builder.toJSON({ omitOptions: true })).toEqual(builder.toJSON());
    });
  });

  describe('when a shape drawn by its own function carries defaults', () => {
    it('writes it by its code alone', () => {
      const builder = new BlissSVGBuilder('B291;BL_PRIM');
      expect(builder.toString()).toBe('B291;BL_PRIM');
      expect(new BlissSVGBuilder('B291;BL_PRIM').svgCode).toBe(builder.svgCode);
    });

    it('writes it by its code alone when its own value is written out as text', () => {
      // pins comparing the values as the string writes them: the DSL reads
      // `0.5` as text while the definition holds the number
      const builder = new BlissSVGBuilder('B291;[stroke-width=0.5]>BL_WIDEPRIM');
      expect(builder.toString()).toBe('B291;BL_WIDEPRIM');
      expect(new BlissSVGBuilder('B291;BL_WIDEPRIM').svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['removing the default', (b) => b.glyph(0).part(1).removeOptions('color')],
      ['clearing the part', (b) => b.glyph(0).part(1).clearOptions()],
      ['clearing an override', (b) => { b.glyph(0).part(1).setOptions({ color: 'blue' }); b.clearAllOptions(); }],
    ])('keeps its own colour after %s', (_label, change) => {
      const builder = changed('B291;BL_PRIM', change);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;BL_PRIM').svgCode);
      expect(builder.toString()).toBe('B291;BL_PRIM');
    });

    it('keeps its code and colour under the flag', () => {
      const saved = new BlissSVGBuilder('[color=blue]|B291;BL_PRIM').toString({ omitOptions: true });
      expect(saved).toBe('B291;BL_PRIM');
      expect(new BlissSVGBuilder(saved).svgCode).toContain('stroke="red"');
    });
  });

  describe('when a custom glyph carries defaults', () => {
    it('still writes them as options, since the glyph can be written without them', () => {
      expect(new BlissSVGBuilder('BL_REDB').toString()).toBe('[color=red]B291');
    });
  });
});
