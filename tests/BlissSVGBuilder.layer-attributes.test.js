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
 * - `background--` landing on EACH zone rect when zones are on, never on the
 *   wrapper group.
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

  describe('when an attribute names the background layer', () => {
    it('puts it on the single background rect', () => {
      const svg = new BlissSVGBuilder('[background=beige;background--rx=2]||B291').svgCode;

      expect(svg).toMatch(/<rect class="bliss-background"[^>]*rx="2"/);
      expect(rootTag(svg)).not.toContain('rx=');
      expect(svg).not.toContain('background--rx');
    });

    it('puts it on each zone rect and never on the wrapper group', () => {
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-bottom=blue;background--rx=2]||B291'
      ).svgCode;

      expect(svg.match(/<rect [^>]*rx="2"/g)).toHaveLength(3);
      expect(svg.match(/<g class="bliss-background"[^>]*>/)[0]).toBe('<g class="bliss-background">');
    });

    it('keeps each zone rect its own structural class', () => {
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-bottom=blue;background--class=mine]||B291'
      ).svgCode;

      expect(svg).toContain('class="bliss-background--top mine"');
      expect(svg).toContain('class="bliss-background--mid mine"');
      expect(svg).toContain('class="bliss-background--bottom mine"');
    });
  });

  describe('when a layer key is written below global scope', () => {
    it.each([
      ['word', '[grid--opacity=0.3]|B291'],
      ['character', '[grid--opacity=0.3]B291'],
      ['part', '[grid--opacity=0.3]>B291'],
    ])('warns MISPLACED_LAYER_OPTION at %s scope and emits no attribute', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.some(w => w.code === 'MISPLACED_LAYER_OPTION')).toBe(true);
      expect(builder.svgCode).not.toContain('grid--opacity');
      expect(builder.svgCode).toContain('<path');
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

    it('emits no attribute from object input either, which warns nothing', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], options: { 'grid--opacity': 0.3 } }] }],
      });

      expect(builder.svgCode).not.toContain('grid--opacity');
      expect(builder.warnings.some(w => w.code === 'MISPLACED_LAYER_OPTION')).toBe(false);
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
      expect(rootTag(builder.svgCode)).toContain('viewBox="0 0 10 10"');
    });

    it('stays silent when only the override is written', () => {
      const builder = new BlissSVGBuilder('[viewBox="0 0 10 10"]||B291');

      expect(builder.warnings.some(w => w.code === 'MULTIPLE_GEOMETRY_VALUES')).toBe(false);
    });

    it('stays silent when only the geometry option is written', () => {
      const builder = new BlissSVGBuilder('[margin=2]||B291');

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
  });
});
