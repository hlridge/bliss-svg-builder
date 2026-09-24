import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `<layer>--<attribute>` channel: a global option whose key names a
 * layer emits that attribute on that layer's element and on nothing else. This
 * is the RAW channel, so the name is never remapped (`content--color` emits a
 * real `color`, where the bare `color` option emits `stroke`).
 *
 * Covers:
 * - `grid--`, `content--` and `background--` each landing on their own element
 *   and on no other layer.
 * - `background--` landing on the wrapper group, which is the background's
 *   single node; the rects that paint are reached with `background-zone--`.
 * - A layer attribute replacing a value the library computed for that layer.
 * - The structural class of each layer surviving a `<layer>--class`.
 * - Cross-surface parity: DSL, constructor options and the transient channel
 *   produce identical SVG for the same key.
 * - The key surviving both serializers verbatim, and rendering identically
 *   after a round trip through either of them.
 *
 * Does NOT cover:
 * - What the channel refuses (`xmlns`, the link attributes, an unknown layer,
 *   an unsafe name), see `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 * - Bare global attributes, which target the root, see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 * - Verbatim attribute-name emission, see
 *   `BlissSVGBuilder.attribute-name-fidelity.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
// Leading-space anchored, so counting `width` does not also count `stroke-width`.
const countAttr = (tag, name) => (tag.match(new RegExp(`\\s${name}="`, 'g')) || []).length;
// Class-prefix matched, not exact: a `<layer>--class` appends to the
// structural name, so the opening tag stays findable after a merge.
const contentTag = (svg) => svg.match(/<g class="bliss-content[^"]*"[^>]*>/)[0];
const gridTag = (svg) => svg.match(/<g class="bliss-grid[^"]*"[^>]*>/)[0];

describe('BlissSVGBuilder layer attributes', () => {
  describe('when an attribute names the grid layer', () => {
    it('puts it on the grid group only', () => {
      const svg = new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291').svgCode;

      expect(gridTag(svg)).toContain('opacity="0.3"');
      expect(rootTag(svg)).not.toContain('opacity');
      expect(contentTag(svg)).not.toContain('opacity');
      expect(svg).not.toContain('grid--opacity');
    });

    it('replaces a value the library computed for that layer', () => {
      const svg = new BlissSVGBuilder('[grid;grid--shape-rendering=geometricPrecision]||B291').svgCode;

      expect(gridTag(svg)).toContain('shape-rendering="geometricPrecision"');
      expect(gridTag(svg)).not.toContain('crispEdges');
    });

    it('keeps the structural class when a class is written for the layer', () => {
      const svg = new BlissSVGBuilder('[grid;grid--class=mine]||B291').svgCode;

      expect(gridTag(svg)).toContain('class="bliss-grid mine"');
    });
  });

  describe('when an attribute names the content layer', () => {
    it('puts it on the content group only', () => {
      const svg = new BlissSVGBuilder('[content--opacity=0.5]||B291').svgCode;

      expect(contentTag(svg)).toContain('opacity="0.5"');
      expect(rootTag(svg)).not.toContain('opacity');
      expect(svg).not.toContain('content--opacity');
    });

    it('emits a real color attribute, unlike the bare option that aliases stroke', () => {
      const raw = new BlissSVGBuilder('[content--color=red]||B291').svgCode;
      const named = new BlissSVGBuilder('[color=red]||B291').svgCode;

      expect(contentTag(raw)).toContain('color="red"');
      expect(contentTag(raw)).not.toContain('stroke=');
      expect(rootTag(named)).toContain('stroke="red"');
      expect(named).not.toContain('color="red"');
    });

    it('keeps the structural class when a class is written for the layer', () => {
      const svg = new BlissSVGBuilder('[content--class=mine]||B291').svgCode;

      expect(contentTag(svg)).toContain('class="bliss-content mine"');
    });
  });

  describe('when an attribute names the background group', () => {
    it('puts it on the wrapper and not on the paper', () => {
      const svg = new BlissSVGBuilder('[background=beige;background--opacity=0.5]||B291').svgCode;

      expect(svg).toContain('<g class="bliss-background" opacity="0.5">');
      expect(svg).not.toMatch(/<rect[^>]*opacity="0.5"/);
    });

    it('goes silently dead for an attribute a group cannot carry', () => {
      // rx is meaningless on a <g>; warning about it would need a table of SVG
      // semantics, which is the open-ended thing this library refuses to build.
      // background-zone--rx is the spelling that paints.
      const builder = new BlissSVGBuilder('[background=beige;background--rx=2]||B291');

      expect(builder.svgCode).toContain('<g class="bliss-background" rx="2">');
      expect(builder.svgCode).not.toMatch(/<rect[^>]*rx="2"/);
      expect(new BlissSVGBuilder('[background=beige;background-zone--rx=2]||B291').svgCode)
        .toMatch(/<rect class="bliss-background-zone"[^>]*rx="2"/);
    });

    it('keeps each zone rect its own structural classes', () => {
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-bottom=blue;background-zone--class=mine]||B291'
      ).svgCode;

      expect(svg).toContain('class="bliss-background-zone bliss-background-zone--top mine"');
      expect(svg).toContain('class="bliss-background-zone bliss-background-zone--mid mine"');
      expect(svg).toContain('class="bliss-background-zone bliss-background-zone--bottom mine"');
    });
  });

  describe('when a layer key is written below global scope', () => {
    it.each([
      ['word', '[grid--opacity=0.3]|B291', 'grid--opacity'],
      ['character', '[grid--opacity=0.3]B291', 'grid--opacity'],
      ['part', '[grid--opacity=0.3]>B291', 'grid--opacity'],
      // a sub-element target is refused below global scope on the same rule; it
      // is a separate row because the gate reads the key shape and not the
      // vocabulary, so a compound target must be shown to reach it
      ['character, for a sub-element target', '[grid-line--sky--stroke=red]B291', 'grid-line--sky--stroke'],
    ])('warns MISPLACED_LAYER_OPTION at %s scope and emits no attribute', (_scope, input, key) => {
      const builder = new BlissSVGBuilder(input);

      const warning = builder.warnings.find(w => w.code === 'MISPLACED_LAYER_OPTION');

      expect(warning).toBeDefined();
      expect(builder.svgCode).not.toContain(key);
      expect(builder.svgCode).toContain('<path');
      // the remedy is the half an author acts on: without it the message says
      // the key was ignored and nothing about the spelling that works here
      expect(warning.message).toContain('without a layer prefix');
    });

    it('keeps the other options written in the same bracket', () => {
      const builder = new BlissSVGBuilder('[grid--opacity=0.3;fill=red]|B291');

      expect(builder.svgCode).toContain('fill="red"');
      expect(builder.svgCode).not.toContain('grid--opacity');
    });

    it('drops the key from the serialized string', () => {
      const builder = new BlissSVGBuilder('[grid--opacity=0.3;fill=red]|B291');

      expect(builder.toString()).not.toContain('grid--opacity');
      expect(builder.toString()).toContain('fill=red');
    });

    it('emits no attribute from object input either, and reports it there too', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], options: { 'grid--opacity': 0.3 } }] }],
      });

      expect(builder.svgCode).not.toContain('grid--opacity');
      // regression: object input used to drop this key in silence while the
      // same key in a bracket was reported
      expect(builder.warnings.map(w => w.code)).toEqual(['MISPLACED_LAYER_OPTION']);
    });

    it('leaves element-scope pass-through untouched', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=1]>B291');

      expect(builder.svgCode).toContain('stroke-dasharray="1"');
      expect(builder.warnings).toHaveLength(0);
    });
  });

  describe('when a root attribute the library computes is overridden', () => {
    it('replaces the computed viewBox and carries exactly one', () => {
      const tag = rootTag(new BlissSVGBuilder('[viewBox="0 0 10 10"]||B291').svgCode);

      expect(tag).toContain('viewBox="0 0 10 10"');
      expect(countAttr(tag, 'viewBox')).toBe(1);
    });

    it('replaces the computed width and height, carrying exactly one of each', () => {
      const tag = rootTag(new BlissSVGBuilder('[width=99;height=77]||B291').svgCode);

      expect(tag).toContain('width="99"');
      expect(tag).toContain('height="77"');
      expect(countAttr(tag, 'width')).toBe(1);
      expect(countAttr(tag, 'height')).toBe(1);
    });
  });

  describe('when a root attribute the library owns is overridden', () => {
    it('keeps the library xmlns and warns RESERVED_ATTRIBUTE_NAME', () => {
      const builder = new BlissSVGBuilder('[xmlns="http://example.com"]||B291');
      const tag = rootTag(builder.svgCode);

      // the guard exists so the output stays parseable: a non-SVG namespace is
      // what `svgElement` hands to DOMParser, and it is the one value that
      // cannot be a matter of taste.
      expect(tag).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(countAttr(tag, 'xmlns')).toBe(1);
      expect(builder.warnings.some(w => w.code === 'RESERVED_ATTRIBUTE_NAME')).toBe(true);
    });

    it('keeps the library data-generator and warns RESERVED_ATTRIBUTE_NAME', () => {
      const builder = new BlissSVGBuilder('[data-generator=me]||B291');

      expect(rootTag(builder.svgCode)).toMatch(/data-generator="bliss-svg-builder/);
      expect(builder.svgCode).not.toContain('data-generator="me"');
      expect(builder.warnings.some(w => w.code === 'RESERVED_ATTRIBUTE_NAME')).toBe(true);
    });

    it('names the refused attribute in the warning', () => {
      const builder = new BlissSVGBuilder('[xmlns=x]||B291');
      const warning = builder.warnings.find(w => w.code === 'RESERVED_ATTRIBUTE_NAME');

      expect(warning.source).toContain('xmlns');
    });
  });

  describe('when a written geometry option is displaced by a written viewBox', () => {
    it('warns MULTIPLE_GEOMETRY_VALUES and names the displaced option', () => {
      const builder = new BlissSVGBuilder('[margin=2;viewBox="0 0 10 10"]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_GEOMETRY_VALUES');

      expect(warning).toBeDefined();
      expect(warning.source).toContain('margin');
      // the message names what it displaced, and that clause is the one the
      // author reads: `source` alone can stay right while the sentence stops
      // saying which option went dead
      expect(warning.message).toContain('"margin" no longer shapes it');
      expect(rootTag(builder.svgCode)).toContain('viewBox="0 0 10 10"');
    });

    it.each([
      ['crop', '[crop=2;viewBox="0 0 10 10"]||B291'],
      ['min-width', '[min-width=20;viewBox="0 0 10 10"]||B291'],
      ['center', '[center;viewBox="0 0 10 10"]||B291'],
      ['margin-top', '[margin-top=2;viewBox="0 0 10 10"]||B291'],
    ])('names %s too, since every geometry option can be displaced', (option, input) => {
      const warning = new BlissSVGBuilder(input).warnings
        .find(w => w.code === 'MULTIPLE_GEOMETRY_VALUES');

      expect(warning).toBeDefined();
      expect(warning.source).toContain(option);
    });

    it('stays silent when only the override is written', () => {
      const builder = new BlissSVGBuilder('[viewBox="0 0 10 10"]||B291');

      expect(builder.warnings.some(w => w.code === 'MULTIPLE_GEOMETRY_VALUES')).toBe(false);
    });

    it('stays silent when only the geometry option is written', () => {
      const builder = new BlissSVGBuilder('[margin=2]||B291');

      expect(builder.warnings.some(w => w.code === 'MULTIPLE_GEOMETRY_VALUES')).toBe(false);
    });

    it.each([
      ['svg-height', '[svg-height=200;viewBox="0 0 10 10"]||B291'],
      ['char-space', '[char-space=9;viewBox="0 0 10 10"]||B291'],
      ['word-space', '[word-space=9;viewBox="0 0 10 10"]||B291'],
      ['external-glyph-space', '[external-glyph-space=9;viewBox="0 0 10 10"]||B291'],
    ])('stays silent for %s, which sizes the picture but never shaped the viewBox', (_option, input) => {
      // These four are the difference between the two sets the report reads
      // from: `SIZE_OPTION_KEYS` is every option that can reach one of the six
      // numbers the root carries, and the narrower `GEOMETRY_OPTION_KEYS` is the
      // subset a hand-written viewBox actually displaces. `svg-height` sizes the
      // root without shaping the viewBox; the three spacings widen the
      // composition the viewBox is measured FROM, and it still measures them.
      // Nothing else distinguishes the two sets, so widening this filter to the
      // wider one told the author these had gone dead and left the whole suite
      // green.
      const builder = new BlissSVGBuilder(input);
      void builder.svgCode;

      expect(builder.warnings.some(w => w.code === 'MULTIPLE_GEOMETRY_VALUES')).toBe(false);
    });
  });

  describe('when a valid layer key is serialized', () => {
    it('comes back from toString() exactly as written', () => {
      const builder = new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291');

      expect(builder.toString()).toBe('[grid;grid--opacity=0.3]||B291');
    });

    it('keeps the key verbatim in toJSON(), with no re-hyphenation', () => {
      // the prefixed channel bypasses the pipeline's kebab-casing, so a
      // serializer that put it back would ship content--preserve-aspect-ratio
      const builder = new BlissSVGBuilder('[content--preserveAspectRatio=xMidYMid]||B291');

      expect(builder.toJSON().options['content--preserveAspectRatio']).toBe('xMidYMid');
    });

    it('renders identically after a round trip through either serializer', () => {
      const builder = new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291');

      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the same layer key arrives from different surfaces', () => {
    it('renders identically from the DSL, the constructor and the transient channel', () => {
      const dsl = new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291').svgCode;
      const api = new BlissSVGBuilder('B291', { grid: true, 'grid--opacity': 0.3 }).svgCode;
      const transient = new BlissSVGBuilder('[grid]||B291')
        .setTransientOptions({ 'grid--opacity': 0.3 }).svgCode;

      expect(api).toBe(dsl);
      expect(transient).toBe(dsl);
    });

    it('renders a sub-element target identically from every surface', () => {
      const key = 'grid-line--sky--stroke-dasharray';
      const dsl = new BlissSVGBuilder(`[grid;${key}=2]||B291`).svgCode;
      const api = new BlissSVGBuilder('B291', { grid: true, [key]: 2 }).svgCode;
      const object = new BlissSVGBuilder(new BlissSVGBuilder(`[grid;${key}=2]||B291`).toJSON()).svgCode;
      const transient = new BlissSVGBuilder('[grid]||B291').setTransientOptions({ [key]: 2 }).svgCode;

      expect(api).toBe(dsl);
      expect(object).toBe(dsl);
      expect(transient).toBe(dsl);
    });
  });
});
