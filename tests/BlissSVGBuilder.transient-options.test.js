import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the transient options channel: a second per-element options bag that
 * reaches the rendered SVG and never reaches `toString()` or `toJSON()`.
 *
 * Covers:
 * - A transient option renders, at part, character and global scope.
 * - Serialization excludes it: `toString()`, and `toJSON()` in default,
 *   `{ preserve: true }` and `{ deep: true }` modes.
 * - `removeTransientOptions` drops a key, and emptying the bag removes the field.
 * - Coexistence with normal options, and the collision rule (transient wins,
 *   because an overlay that lost to what it overlays would be useless).
 * - Known options work transiently, not only pass-through attributes: the
 *   channel is options, not markup.
 * - Object input carries `transientOptions`, escaped exactly once, and repeated
 *   application across rebuilds never compounds escapes.
 * - Refusals: unsafe attribute names (`UNSAFE_ATTRIBUTE_NAME`), keys the library
 *   consumes before the render clone (`MISPLACED_TRANSIENT_OPTION`), and
 *   decorations on a space (`MISPLACED_SPACE_DECORATION`).
 *
 * Does NOT cover:
 * - General `setOptions`/`removeOptions` behaviour, see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - The attribute-name safety gate itself as applied to ordinary options, see
 *   `BlissSVGBuilder.unsafe-attribute-names.test.js`.
 * - Any DSL spelling: there is none by construction, since the DSL is the
 *   serialized form. The standing DSL/API parity rule deliberately does not
 *   apply to this feature.
 */

describe('BlissSVGBuilder transient options', () => {

  describe('when a transient option is set on a part', () => {
    it('emits the value as an attribute on the part wrapper', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      expect(b.svgCode).toContain('data-part-index="0"');
    });

    it('leaves the value out of the DSL string', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      expect(b.toString()).toBe('B291');
    });
  });

  describe('when the builder is serialized to JSON', () => {
    it('omits the transientOptions field in default output', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      const part = b.toJSON().groups[0].glyphs[0].parts[0];
      expect(part.transientOptions).toBeUndefined();
      expect(part.options?.['data-part-index']).toBeUndefined();
    });

    it('omits the transientOptions field under preserve', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      expect(b.toJSON({ preserve: true }).groups[0].glyphs[0].parts[0].transientOptions).toBeUndefined();
    });

    it('omits the transientOptions field under deep, the form toString reads', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      expect(b.toJSON({ deep: true }).groups[0].glyphs[0].parts[0].transientOptions).toBeUndefined();
    });

    it('omits it at word, character and whole-SVG level too', () => {
      const b = new BlissSVGBuilder('B291');
      b.setTransientOptions({ 'data-doc': 'x' });
      b.group(0).setTransientOptions({ 'data-word': 'x' });
      b.glyph(0).setTransientOptions({ 'data-char': 'x' });

      const json = b.toJSON();
      expect(json.transientOptions).toBeUndefined();
      expect(json.groups[0].transientOptions).toBeUndefined();
      expect(json.groups[0].glyphs[0].transientOptions).toBeUndefined();
      // all three still reached the picture
      expect(b.svgCode).toContain('data-doc="x"');
      expect(b.svgCode).toContain('data-word="x"');
      expect(b.svgCode).toContain('data-char="x"');
      expect(b.toString()).toBe('B291');
    });
  });

  describe('when a word carrying transient options is split by a space inside it', () => {
    it('carries them onto every word the split produces', () => {
      // object input can place a space inside one word, which the space
      // invariant then splits into separate words; a transient option describes
      // that word and must follow it, exactly as a normal group option does
      const b = new BlissSVGBuilder({
        groups: [{
          transientOptions: { 'data-word': 'x' },
          glyphs: [
            { parts: [{ codeName: 'B291' }] },
            { parts: [{ codeName: 'TSP' }] },
            { parts: [{ codeName: 'B99' }] },
          ],
        }],
      });

      expect(b.svgCode.match(/data-word="x"/g)).toHaveLength(2);
    });
  });

  describe('when a transient option is removed', () => {
    it('drops the attribute from the rendered SVG', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });
      b.part(0).removeTransientOptions('data-part-index');

      expect(b.svgCode).not.toContain('data-part-index');
    });

    it('keeps the keys it was not asked to remove', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-a': '1', 'data-b': '2' });
      b.part(0).removeTransientOptions('data-a');

      expect(b.svgCode).not.toContain('data-a');
      expect(b.svgCode).toContain('data-b="2"');
    });
  });

  describe('when a normal option and a transient option coexist on one element', () => {
    it('renders both and serializes only the normal one', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setOptions({ 'data-kept': 'yes' });
      b.part(0).setTransientOptions({ 'data-dropped': 'yes' });

      expect(b.svgCode).toContain('data-kept="yes"');
      expect(b.svgCode).toContain('data-dropped="yes"');
      expect(b.toString()).toContain('data-kept');
      expect(b.toString()).not.toContain('data-dropped');
    });
  });

  describe('when a transient option collides with a normal option of the same name', () => {
    it('renders the transient value and serializes the normal one', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ color: 'red' });
      b.glyph(0).setTransientOptions({ color: 'blue' });

      // pins the overlay rule: an overlay that lost to what it overlays would
      // be useless, so transient wins the render while the document keeps red
      expect(b.svgCode).toContain('stroke="blue"');
      expect(b.toString()).toContain('color=red');
      expect(b.toString()).not.toContain('blue');
    });
  });

  describe('when a known option is set transiently rather than a pass-through attribute', () => {
    it('applies the option to the layout and leaves the string alone', () => {
      const plain = new BlissSVGBuilder('B291');
      const wide = new BlissSVGBuilder('B291');
      wide.setTransientOptions({ 'min-width': 40 });

      // pins that the channel carries OPTIONS, not just markup: min-width is a
      // named global option consumed by the layout, never emitted as an attribute
      expect(widthOf(wide.svgCode)).toBeGreaterThan(widthOf(plain.svgCode));
      expect(wide.toString()).toBe('B291');
      expect(wide.svgCode).not.toContain('min-width');
    });
  });

  describe('when transient options arrive through object input', () => {
    it('renders them and escapes the value exactly once', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291', transientOptions: { 'data-x': 'a&b' } }] }] }],
      });

      expect(b.svgCode).toContain('data-x="a&amp;b"');
      expect(b.svgCode).not.toContain('a&amp;amp;b');
      expect(b.toString()).not.toContain('data-x');
    });
  });

  describe('when the same transient value is applied again after a rebuild', () => {
    it('does not compound HTML escapes', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-x': 'a&b' });
      b.addGlyph('B99');
      b.part(0).setTransientOptions({ 'data-x': 'a&b' });

      expect(b.svgCode).toContain('data-x="a&amp;b"');
      expect(b.svgCode).not.toContain('a&amp;amp;b');
    });
  });

  describe('when a transient option names an unsafe attribute', () => {
    it('refuses an event handler name and warns UNSAFE_ATTRIBUTE_NAME', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'on-click': 'x' });

      expect(b.svgCode).not.toContain('on-click');
      expect(b.warnings.some(w => w.code === 'UNSAFE_ATTRIBUTE_NAME' && w.source === 'on-click')).toBe(true);
    });

    it('refuses it on the object-input path too, where no API call gates it', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291', transientOptions: { onload: 'steal()' } }] }] }],
      });

      expect(b.svgCode).not.toContain('onload');
      expect(b.warnings.some(w => w.code === 'UNSAFE_ATTRIBUTE_NAME')).toBe(true);
    });

    it('keeps the safe keys written in the same call', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'on-click': 'x', 'data-safe': 'yes' });

      expect(b.svgCode).not.toContain('on-click');
      expect(b.svgCode).toContain('data-safe="yes"');
    });
  });

  describe('when a transient option names a key the library consumes before rendering', () => {
    it.each([
      ['x', 5],
      ['y', 5],
      ['relative-kerning', 3],
      ['relativeKerning', 3],
      ['absolute-kerning', 3],
      ['absoluteKerning', 3],
      ['key', 'mine'],
      ['X', 5],
    ])('refuses %s and warns MISPLACED_TRANSIENT_OPTION', (key, value) => {
      const b = new BlissSVGBuilder('B291;C8');
      b.part(1).setTransientOptions({ [key]: value });

      expect(b.warnings.some(w => w.code === 'MISPLACED_TRANSIENT_OPTION')).toBe(true);
    });

    it('names the key as it was stored, which the setter kebab-cases', () => {
      const b = new BlissSVGBuilder('B291;C8');
      b.part(1).setTransientOptions({ relativeKerning: 3 });

      const warning = b.warnings.find(w => w.code === 'MISPLACED_TRANSIENT_OPTION');
      expect(warning.source).toBe('relative-kerning');
    });

    it('names a standard-owned key as it was stored too', () => {
      const b = new BlissSVGBuilder('B291;C8');
      b.part(1).setTransientOptions({ X: 5 });

      // the same rule as the row above, reached the other way: the refused set
      // holds `x`, and `X` is a casing of the name SVG owns, so the bag holds
      // `x` by the time anything judges it
      expect(b.warnings.find(w => w.code === 'MISPLACED_TRANSIENT_OPTION').source).toBe('x');
    });

    it('refuses the camelCase spelling that only object input can deliver', () => {
      // the setter canonicalizes to kebab, so the camel entries in the refused
      // set exist for this path alone
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291', transientOptions: { relativeKerning: 3 } }] }] }],
      });

      expect(b.warnings.some(w => w.code === 'MISPLACED_TRANSIENT_OPTION' && w.source === 'relativeKerning')).toBe(true);
    });

    it('leaves a normal kerning value untouched when a transient one is refused', () => {
      const b = new BlissSVGBuilder('B291/RK:3/C8');
      const before = b.toString();
      b.glyph(1).setTransientOptions({ relativeKerning: 9 });

      // pins that a refused key cannot damage the document channel on its way
      // out: the setter deliberately bypasses the stale-positioning clearing
      expect(b.toString()).toBe(before);
    });

    it('leaves the element where it was rather than silently ignoring the value', () => {
      const b = new BlissSVGBuilder('B291;C8');
      const before = b.part(1).x;
      b.part(1).setTransientOptions({ x: 5 });

      // pins refusal over silent no-op: the position is promoted before the
      // render clone, so a transient spelling could never have taken effect
      expect(b.part(1).x).toBe(before);
    });
  });

  describe('when a transient option decorates a space', () => {
    it('drops it with MISPLACED_SPACE_DECORATION like any other space decoration', () => {
      const b = new BlissSVGBuilder({
        groups: [
          { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
          { glyphs: [{ parts: [{ codeName: 'TSP' }], transientOptions: { opacity: '0.5' } }] },
          { glyphs: [{ parts: [{ codeName: 'B99' }] }] },
        ],
      });

      expect(b.svgCode).not.toContain('opacity="0.5"');
      expect(b.warnings.some(w => w.code === 'MISPLACED_SPACE_DECORATION')).toBe(true);
    });
  });

  describe('when precedence above the key level applies', () => {
    it('lets an explicitly-named normal attribute beat a transient alias of it', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ stroke: 'red' });
      b.glyph(0).setTransientOptions({ color: 'blue' });

      // pins the scope of the overlay rule: transient wins at the SAME key, but
      // the existing explicit-beats-alias resolution is channel-blind and still
      // applies above it (color is an alias for stroke)
      expect(b.svgCode).toContain('stroke="red"');
      expect(b.svgCode).not.toContain('stroke="blue"');
    });

    it('lets a specific normal option beat a transient bulk one', () => {
      const b = new BlissSVGBuilder('B291');
      b.setTransientOptions({ margin: 5 });
      const bulkOnly = widthOf(b.svgCode);

      const c = new BlissSVGBuilder('[margin-left=0]||B291');
      c.setTransientOptions({ margin: 5 });

      // the specific key refines the bulk one regardless of which channel each
      // arrived through, so the left margin stays 0 and the canvas is narrower
      expect(widthOf(c.svgCode)).toBeLessThan(bulkOnly);
    });
  });

  describe('when a transient option is set through a handle on a space group', () => {
    it('drops it with MISPLACED_SPACE_DECORATION, as object input is', () => {
      const b = new BlissSVGBuilder('B291//B99');
      b.element(1).setTransientOptions({ opacity: '0.5' });

      expect(b.svgCode).not.toContain('opacity="0.5"');
      expect(b.warnings.some(w => w.code === 'MISPLACED_SPACE_DECORATION')).toBe(true);
    });
  });

  describe('when a key is removed by its other spelling', () => {
    it('removes a kebab-stored key given its camelCase name', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setTransientOptions({ strokeWidth: 1.2 });
      expect(b.svgCode).toContain('stroke-width="1.2"');

      b.glyph(0).removeTransientOptions('strokeWidth');
      expect(b.svgCode).not.toContain('stroke-width="1.2"');
    });
  });

  describe('when a refused key stays in the bag across rebuilds', () => {
    it('reports it once rather than once per rebuild', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ x: 5 });
      const after = b.warnings.filter(w => w.code === 'MISPLACED_TRANSIENT_OPTION').length;

      b.addGlyph('B99');
      b.addGlyph('B99');

      expect(after).toBe(1);
      expect(b.warnings.filter(w => w.code === 'MISPLACED_TRANSIENT_OPTION')).toHaveLength(1);
    });
  });

  describe('when a builder is rebuilt from its own JSON', () => {
    it('produces one with no transient options and an unchanged string', () => {
      const b = new BlissSVGBuilder('B291');
      b.part(0).setTransientOptions({ 'data-part-index': '0' });

      const rebuilt = new BlissSVGBuilder(b.toJSON({ preserve: true }));

      expect(rebuilt.svgCode).not.toContain('data-part-index');
      expect(rebuilt.toString()).toBe(b.toString());
    });
  });
});

function widthOf(svgCode) {
  return parseFloat(svgCode.match(/<svg[^>]*\swidth="([\d.]+)"/)[1]);
}
