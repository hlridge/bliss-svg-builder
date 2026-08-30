import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `<target>--<attribute>` channel below layer level: any class the
 * library writes into the markup is a target, spelled without the `bliss-`
 * prefix, and the key splits at the LAST `--`.
 *
 * Covers:
 * - A key naming one grid-line family landing on that family alone, and a key
 *   naming a shared class reaching every line that carries it, which is how the
 *   raw channel reproduces the curated `grid-major-color` cascade.
 * - Class-order precedence: the more specific class wins where both are written.
 * - Background parts: the paper rect, and one zone by name.
 * - `UNKNOWN_LAYER` for a target no class the library writes can supply,
 *   including an author-supplied class, a spelling that keeps the prefix, wrong
 *   case, a stray third dash, and an attribute name holding its own `--`.
 * - Silence when a target names a real class that nothing drew.
 * - A resolved target's attribute name being judged on the half after the last
 *   `--`, so an unsafe name reports the safety gate rather than the vocabulary.
 *
 * Does NOT cover:
 * - Layer-level targeting (`grid--`, `content--`, `background--`) and its
 *   cross-surface parity, see `BlissSVGBuilder.layer-attributes.test.js`.
 * - Why each layer-level refusal reads the way it does, see
 *   `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 * - The markup shape the targets are named after, see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 */

// A class is one whitespace-separated TOKEN of the class attribute. Substring or
// \b matching is wrong here and quietly so: \b sits between "bliss-grid" and the
// "-" of "bliss-grid-line", so a prefix would match every class that extends it.
const classesOf = (line) => new Set((line.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/));
const linesWithClass = (svg, cls) => svg.split('\n').filter(l => classesOf(l).has(cls));

describe('BlissSVGBuilder sub-element targets', () => {
  describe('when a key names one grid line family', () => {
    it('lands on the sky line and on nothing else', () => {
      const svg = new BlissSVGBuilder('[grid;grid-line--sky--stroke-dasharray=2]||B291').svgCode;
      const dashed = svg.split('\n').filter(l => l.includes('stroke-dasharray="2"'));

      expect(dashed).toHaveLength(1);
      expect(classesOf(dashed[0]).has('bliss-grid-line--sky')).toBe(true);
    });

    it('reaches every line when the key names the shared class', () => {
      const svg = new BlissSVGBuilder('[grid;grid-line--stroke-dasharray=2]||B291').svgCode;

      expect(svg.split('\n').filter(l => l.includes('stroke-dasharray="2"'))).toHaveLength(5);
    });

    it('reaches sky and earth through the major class, as the curated twin does', () => {
      // grid-major-color paints major, sky and earth; the raw channel reaches
      // the same three, because those paths CARRY bliss-grid-line--major
      const svg = new BlissSVGBuilder('[grid;grid-line--major--stroke-dasharray=2]||B291').svgCode;
      const dashed = svg.split('\n').filter(l => l.includes('stroke-dasharray="2"'));

      expect(dashed).toHaveLength(3);
      expect(dashed.filter(l => classesOf(l).has('bliss-grid-line--sky'))).toHaveLength(1);
      expect(dashed.filter(l => classesOf(l).has('bliss-grid-line--earth'))).toHaveLength(1);
    });

    it('lets the more specific class win where both are written', () => {
      const svg = new BlissSVGBuilder(
        '[grid;grid-line--stroke=red;grid-line--sky--stroke=blue]||B291').svgCode;

      expect(linesWithClass(svg, 'bliss-grid-line--sky')[0]).toContain('stroke="blue"');
      expect(linesWithClass(svg, 'bliss-grid-line--minor')[0]).toContain('stroke="red"');
    });
  });

  describe('when a key names a background part', () => {
    it('rounds the paper rect and not the wrapper', () => {
      const svg = new BlissSVGBuilder('[background=beige;background-zone--rx=3]||B291').svgCode;

      expect(svg).toMatch(/<rect class="bliss-background-zone"[^>]*rx="3"/);
      expect(svg).toContain('<g class="bliss-background">');
    });

    it('reaches one zone by name', () => {
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-zone--mid--rx=3]||B291').svgCode;
      const rounded = svg.split('\n').filter(l => l.includes('rx="3"'));

      expect(rounded).toHaveLength(1);
      expect(classesOf(rounded[0]).has('bliss-background-zone--mid')).toBe(true);
    });
  });

  describe('when a target names no class the library writes', () => {
    it.each([
      ['a class the author supplied', '[content--class=mine;mine--fill=red]||B291'],
      ['a class with the prefix still on it', '[bliss-grid--opacity=0.3]||B291'],
      ['a target in the wrong case', '[GRID--opacity=0.3]||B291'],
      ['a stray third dash', '[grid---stroke=red]||B291'],
      ['an attribute name holding a double dash', '[content--data--foo=1]||B291'],
    ])('reports %s as UNKNOWN_LAYER and emits nothing', (_case, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.filter(w => w.code === 'UNKNOWN_LAYER')).toHaveLength(1);
      expect(builder.svgCode).not.toContain('fill="red"');
      expect(builder.svgCode).not.toContain('data--foo');
      expect(builder.svgCode).not.toContain('opacity="0.3"');
    });
  });

  describe('when two targets both reach one element', () => {
    it('lets an authored class on the specific target replace the general one', () => {
      // `class` follows class-order precedence like every other attribute, so
      // the top rect carries `b` alone. Concatenating to `a b` would also have
      // been defensible, which is why the choice is pinned here rather than
      // left to be read off the merge order.
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-zone--class=a;background-zone--top--class=b]||B291'
      ).svgCode;

      expect(svg).toContain('class="bliss-background-zone bliss-background-zone--top b"');
      expect(svg).toContain('class="bliss-background-zone bliss-background-zone--mid a"');
    });

    it('lets the specific target win on an ordinary attribute too', () => {
      // pins the general-to-specific order of the zone class lists; listing a
      // zone's own class first would silently reverse this and nothing else
      // would notice
      const svg = new BlissSVGBuilder(
        '[background-top=red;background-mid=green;background-zone--rx=1;background-zone--top--rx=9]||B291'
      ).svgCode;

      expect(linesWithClass(svg, 'bliss-background-zone--top')[0]).toContain('rx="9"');
      expect(linesWithClass(svg, 'bliss-background-zone--mid')[0]).toContain('rx="1"');
    });
  });

  describe('when a working target key is stored and read back', () => {
    it('survives both serializers and renders identically', () => {
      const builder = new BlissSVGBuilder('[grid;grid-line--sky--stroke-dasharray=2]||B291');

      expect(builder.toString()).toBe('[grid;grid-line--sky--stroke-dasharray=2]||B291');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a target names a real class that nothing drew', () => {
    it.each([
      ['the grid is off', '[grid-line--sky--stroke=red]||B291'],
      // silence here is deliberate and not an oversight: what a crop draws is
      // known only at render, where raising a warning would double it on every
      // repeated svgCode read
      ['a crop removed the sky line', '[grid;crop-top=9;grid-line--sky--stroke=red]||B291'],
      ['the background is off', '[background-zone--rx=3]||B291'],
      ['only one zone is drawn', '[background-top=red;background-zone--bottom--rx=3]||B291'],
    ])('stays silent when %s', (_case, input) => {
      expect(new BlissSVGBuilder(input).warnings).toHaveLength(0);
    });
  });

  describe('when a resolved target carries a refused attribute name', () => {
    it('judges the name after the last dash, not the whole key', () => {
      // the vocabulary decides only whether the TARGET resolves; once it does,
      // an unsafe attribute name is the safety gate's refusal to report
      const builder = new BlissSVGBuilder('[grid;grid-line--onclick=alert(1)]||B291');

      expect(builder.warnings.map(w => w.code)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(builder.svgCode).not.toContain('onclick');
    });
  });
});
