/**
 * Pins a built-in's own look (the dotted line `REFSQUARE` and `ANCHORRING` draw
 * with) styling only the part the built-in is: an indicator or a part added
 * beside it, by any route, draws and saves as the DSL `;` spelling does.
 *
 * Covers:
 * - Every route that adds `B99` to a lone `REFSQUARE`, `[color=red]REFSQUARE`
 *   or `ANCHORRING` (the `;;` overlay, both group applies, the glyph apply,
 *   `addPart`, and the reloads of both flattened saves) drawing byte-identical
 *   to `<base>;B99` and flatten-saving to its string.
 * - A lone `REFSQUARE` holding its look on its part only, so it draws one
 *   dotted group, and a clear or removal on its character leaving it so, also
 *   once an indicator has been applied and cleared again.
 * - An indicator applied and cleared again giving back what `REFSQUARE` parses
 *   to.
 * - `replacePart(0, 'B291')` on a lone `REFSQUARE` drawing a plain `B291`.
 * - A dash pattern the author writes on the character, the built-in's own
 *   value included, saved as written and styling a `;;` indicator as its `;`
 *   spelling does.
 * - A built-in written with a part bracket whose option is removed or cleared
 *   reloading from its save as the builder draws it.
 * - Controls: an ordinary code's `;;` and `;` spellings agree, and a different
 *   dash pattern on the character leaves the square's own dots in place.
 *
 * Does NOT cover:
 * - A custom definition's options on the same routes, see
 *   `BlissSVGBuilder.definition-is-a-part-routes.test.js`.
 * - Removing, clearing or overriding the look on the part itself, see
 *   `BlissSVGBuilder.builtin-own-look.test.js`.
 * - How the dotted line renders, see `BlissSVGBuilder.default-options.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

// Every dash pattern the SVG draws with, in document order.
const dashesOf = (svg) => svg.match(/stroke-dasharray="[^"]*"/g) ?? [];

// Every route that adds B99 to a lone code as an indicator, by name.
const ROUTES = [
  ['the ;; overlay', (base) => new BlissSVGBuilder(`${base};;B99`)],
  ['group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B99'))],
  ['group(0).applyIndicators with flatten', (base) => changed(base, (b) => b.group(0).applyIndicators('B99', { flatten: true }))],
  ['glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B99'))],
  ['glyph(0).addPart', (base) => changed(base, (b) => b.glyph(0).addPart('B99'))],
  ['reloading the flattened string', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toString({ flattenIndicators: true }))],
  ['reloading the flattened JSON', (base) => new BlissSVGBuilder(new BlissSVGBuilder(`${base};;B99`).toJSON({ flattenIndicators: true }))],
];

const ROUTE_CASES = ['REFSQUARE', '[color=red]REFSQUARE', 'ANCHORRING']
  .flatMap((base) => ROUTES.map(([route, build]) => [base, route, build]));

describe('BlissSVGBuilder built-in look routes', () => {
  describe('when an indicator is added to a lone built-in that has a look of its own', () => {
    it.each(ROUTE_CASES)('draws %s given B99 by %s as the ; spelling does', (base, _route, build) => {
      // regression: every route but `;` drew the indicator dotted, and the
      // flattened saves wrote the look out as an option nobody wrote
      const target = new BlissSVGBuilder(`${base};B99`);
      const builder = build(base);
      expect(builder.svgCode).toBe(target.svgCode);
      expect(builder.toString({ flattenIndicators: true })).toBe(target.toString());
    });
  });

  describe('when REFSQUARE stands alone', () => {
    it('holds its look on its part only and draws one dotted group', () => {
      const builder = new BlissSVGBuilder('REFSQUARE');
      const [glyph] = builder.toJSON().groups[0].glyphs;
      expect(glyph.options).toBeUndefined();
      expect(glyph.parts).toEqual([{ codeName: 'REFSQUARE', options: { 'stroke-dasharray': '0 0.999' } }]);
      expect(dashesOf(builder.svgCode)).toEqual(['stroke-dasharray="0 0.999"']);
    });

    it.each([
      ['clearing the character', (b) => b.glyph(0).clearOptions()],
      ['removing the look from the character', (b) => b.glyph(0).removeOptions('stroke-dasharray')],
      // pins the reader on a character that took its code's name back when its
      // indicator went; killed the `level >= 2` boundary mutant of the own-look
      // reader (hand-run 2026-10-02), which the two rows above let survive
      ['clearing the character once an indicator has come and gone', (b) => {
        b.glyph(0).applyIndicators('B99');
        b.glyph(0).clearIndicators();
        b.glyph(0).clearOptions();
      }],
    ])('keeps the look off the character after %s', (_label, change) => {
      // pins the character reading no own look: the code is its one part, so
      // a clear at character level must not put the look back there
      const builder = changed('REFSQUARE', change);
      expect(builder.toJSON().groups[0].glyphs[0].options).toBeUndefined();
      expect(builder.svgCode).toBe(new BlissSVGBuilder('REFSQUARE').svgCode);
    });

    it('gives back what it parses to when an indicator is applied and cleared', () => {
      // control: passes before C23
      const builder = changed('REFSQUARE', (b) => {
        b.glyph(0).applyIndicators('B99');
        b.glyph(0).clearIndicators();
      });
      const plain = new BlissSVGBuilder('REFSQUARE');
      expect(builder.toJSON({ deep: true })).toEqual(plain.toJSON({ deep: true }));
      expect(builder.svgCode).toBe(plain.svgCode);
    });

    it('draws a plain B291 once its only part is replaced by B291', () => {
      // regression: the character kept the square's dotted line, drew a dotted
      // B291 and saved `[stroke-dasharray=0 0.999]B291`
      const builder = changed('REFSQUARE', (b) => b.glyph(0).replacePart(0, 'B291'));
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when the author writes a dash pattern on the character', () => {
    it('saves the built-in\'s own value written on the character as written', () => {
      // regression: the author's bracket was swallowed as the look's copy and
      // saved as `REFSQUARE`
      const builder = new BlissSVGBuilder('[stroke-dasharray=0 0.999]REFSQUARE');
      expect(builder.toString()).toBe('[stroke-dasharray=0 0.999]REFSQUARE');
    });

    it('styles a ;; indicator with it, as its ; spelling does', () => {
      // control: passes before C23
      const overlay = new BlissSVGBuilder('[stroke-dasharray=0 0.999]REFSQUARE;;B99');
      const target = new BlissSVGBuilder('[stroke-dasharray=0 0.999]REFSQUARE;B99');
      expect(overlay.svgCode).toBe(target.svgCode);
      expect(overlay.toString({ flattenIndicators: true })).toBe(target.toString());
    });

    it('keeps the square\'s own dots inside a different dash pattern', () => {
      // control: passes before C23
      const builder = new BlissSVGBuilder('[stroke-dasharray=1 1]REFSQUARE');
      expect(dashesOf(builder.svgCode)).toEqual(['stroke-dasharray="1 1"', 'stroke-dasharray="0 0.999"']);
    });
  });

  describe('when the code has no look of its own', () => {
    it('draws B291 given B99 by the ;; overlay as the ; spelling does', () => {
      // control: passes before C23
      const overlay = new BlissSVGBuilder('B291;;B99');
      expect(overlay.svgCode).toBe(new BlissSVGBuilder('B291;B99').svgCode);
      expect(overlay.toString({ flattenIndicators: true })).toBe('B291;B99');
    });
  });

  describe('when a built-in written with a part bracket loses the bracket\'s option', () => {
    it.each([
      ['removing it', (b) => b.glyph(0).part(0).removeOptions('title')],
      ['clearing everything', (b) => b.clearAllOptions()],
    ])('reloads its save as the builder draws it after %s', (_label, change) => {
      // regression: the reload wrapped the square in the character's copy of
      // the look on top of the part's, two dotted groups where the builder had one
      const builder = changed('[title=a:b]>REFSQUARE', change);
      const saved = builder.toString();
      expect(saved).toBe('REFSQUARE');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });
  });
});
