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
 *
 * Does NOT cover:
 * - Bare global attributes, which target the root, see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 * - Verbatim attribute-name emission, see
 *   `BlissSVGBuilder.attribute-name-fidelity.test.js`.
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
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
