import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the `<target>--<attribute>` channel past layer level: any class the
 * library writes into the markup is a target, spelled without the `bliss-`
 * prefix, and the key splits at the LAST `--`. That reaches the parts inside a
 * layer and the root `<svg>` alike, the root being the one target a bare global
 * key already reaches under another spelling.
 *
 * Covers:
 * - A key naming one grid-line family landing on that family alone, and a key
 *   naming a shared class reaching every line that carries it, which is how the
 *   raw channel reproduces the curated `grid-major-color` cascade.
 * - Class-order precedence: the more specific class wins where both are written.
 * - Background parts: the paper rect, and one zone by name.
 * - A raw key beating a WRITTEN curated option: the raw value paints, the curated
 *   option is named once and the elements it lost are listed, and nothing is said
 *   where only a library default was displaced or the layer is switched off.
 * - `root--` naming the outermost element: it beats the bare spelling of the
 *   same attribute in either order and reports `MULTIPLE_ATTRIBUTE_VALUES`, it
 *   faces every guard the bare spelling faces, and it is left out of the
 *   `vector-effect` relocation the bare channel gets.
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

  describe('when a key names the root', () => {
    it('paints the root and not the content group', () => {
      const svg = new BlissSVGBuilder('[root--fill=red]||B291').svgCode;

      expect(svg.split('\n')[0]).toContain('fill="red"');
      expect(svg).toContain('<g class="bliss-content">');
    });

    it.each([
      ['the curated alias', '[color=red;root--stroke=blue]||B291', 'stroke="blue"', 'color', 'root--stroke'],
      ['the reverse written order', '[root--stroke=blue;color=red]||B291', 'stroke="blue"', 'color', 'root--stroke'],
      ['two explicit widths', '[stroke-width=2;root--stroke-width=3]||B291', 'stroke-width="3"', 'stroke-width', 'root--stroke-width'],
    ])('lets the named target beat %s and reports the loser', (_case, input, expected, loser, winner) => {
      const builder = new BlissSVGBuilder(input);
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(builder.svgCode.split('\n')[0]).toContain(expected);
      expect(warning).toBeDefined();
      // the spelling the author could have written, never the internal camelCase
      expect(warning.source).toBe(loser);
      expect(warning.message).not.toContain('strokeWidth');
      // pins the surviving key by name; "remove whichever you did not mean" is
      // unusable if the message names the wrong one, and a mutant that swapped
      // the two survived the whole suite until this line existed
      expect(warning.message).toContain(`so "${winner}" was used`);
    });

    it.each([
      ['ahead of it', '[root--fill=red;fill=blue]||B291'],
      ['behind it', '[fill=blue;root--fill=red]||B291'],
    ])('wins and names the bare key with that key %s', (_case, input) => {
      // pins explicit-beats-resolved in the loop order the rows above cannot
      // reach; killed the two mutants that narrowed the collision guard to
      // `prior && explicit` and dropped its `if (!explicit) return`.
      // The curated spellings above cannot show this: the options pass hands
      // every curated key to the split loop BEFORE any raw key, whatever order
      // they were written in, so `color` and `stroke-width` only ever arrive
      // bare-first. `fill` is not curated and keeps its written position, which
      // is the only way to run the loop the other way round
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode.split('\n')[0]).toContain('fill="red"');
      expect(builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES').source).toBe('fill');
    });

    it('reports a duplicate even when the two values are equal', () => {
      // MULTIPLE_ reports more-than-one, not value-lost
      const builder = new BlissSVGBuilder('[fill=red;root--fill=red]||B291');

      expect(builder.warnings.map(w => w.code)).toContain('MULTIPLE_ATTRIBUTE_VALUES');
    });

    it('leaves two bare keys alone', () => {
      // one channel, unchanged: last-wins and silent, exactly as before
      expect(new BlissSVGBuilder('[color=red;stroke=blue]||B291').warnings).toHaveLength(0);
    });

    it('reports the geometry it displaced', () => {
      const builder = new BlissSVGBuilder('[margin=2;root--viewBox=0 0 10 10]||B291');

      expect(builder.warnings.map(w => w.code)).toContain('MULTIPLE_GEOMETRY_VALUES');
      expect(builder.svgCode).toContain('viewBox="0 0 10 10"');
    });

    it.each([
      ['the provenance stamp', '[root--data-generator=mine]||B291', 'RESERVED_ATTRIBUTE_NAME', 'mine'],
      ['the namespace',        '[root--xmlns=x]||B291',             'RESERVED_ATTRIBUTE_NAME', 'xmlns="x"'],
      ['a link attribute',     '[root--href=https://example.com]||B291', 'MISPLACED_LINK_ATTRIBUTE', 'example.com'],
    ])('refuses %s', (_case, input, code, absent) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.map(w => w.code)).toContain(code);
      expect(builder.svgCode).toContain('data-generator="bliss-svg-builder');
      expect(builder.svgCode).not.toContain(absent);
    });

    it('does not relocate a vector-effect that names the root', () => {
      // the relocation repairs OUR default destination, so it belongs to the bare
      // channel; a prefixed key names a destination the author chose
      const prefixed = new BlissSVGBuilder('[root--vector-effect=non-scaling-stroke]||B291').svgCode;
      const bare = new BlissSVGBuilder('[vector-effect=non-scaling-stroke]||B291').svgCode;

      expect(prefixed.split('\n')[0]).toContain('vector-effect="non-scaling-stroke"');
      expect(prefixed).not.toMatch(/<path[^>]*vector-effect/);
      expect(bare.split('\n')[0]).not.toContain('vector-effect');
      expect(bare).toMatch(/<path[^>]*vector-effect/);
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

  describe('when a raw key displaces a curated one', () => {
    it('paints the raw value and names the curated option', () => {
      const builder = new BlissSVGBuilder('[grid;grid-sky-color=blue;grid-line--stroke=red]||B291');
      const sky = linesWithClass(builder.svgCode, 'bliss-grid-line--sky')[0];
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(sky).toContain('stroke="red"');
      expect(sky).not.toContain('stroke="blue"');
      expect(warning.source).toBe('grid-sky-color');
      expect(warning.message).toContain('grid-line--sky');
      // pins the surviving key by name: "remove whichever you did not mean" is
      // unusable if the message names the wrong one, and naming both keys
      // without saying which won reads either way round
      expect(warning.message).toContain('so "grid-line--stroke" was used');
    });

    it('says nothing when the raw key only displaces a default', () => {
      // overriding what the library chose is not two statements from the author
      expect(new BlissSVGBuilder('[grid;grid-line--stroke=red]||B291').warnings).toHaveLength(0);
    });

    it('says nothing when the layer is switched off', () => {
      // a statement about what an attribute DOES is silent where nothing draws
      expect(new BlissSVGBuilder('[grid-sky-color=blue;grid-line--stroke=red]||B291').warnings)
        .toHaveLength(0);
    });

    it('names each displaced option once, listing every element it reached', () => {
      const builder = new BlissSVGBuilder(
        '[grid;grid-color=blue;grid-sky-color=green;grid-line--stroke=red]||B291');
      const displaced = builder.warnings.filter(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(displaced.map(w => w.source)).toEqual(['grid-color', 'grid-sky-color']);
      // grid-color still reaches four families; the sky one went to grid-sky-color
      expect(displaced[0].message).toContain('grid-line--minor');
      expect(displaced[0].message).toContain('grid-line--earth');
      expect(displaced[0].message).not.toContain('grid-line--sky');
    });

    it('names the most specific raw key when several could displace', () => {
      const builder = new BlissSVGBuilder(
        '[grid;grid-sky-color=blue;grid-line--stroke=red;grid-line--sky--stroke=green]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning.message).toContain('grid-line--sky--stroke');
      expect(warning.message).not.toContain('"grid-line--stroke"');
    });

    it('does not report a raw key that a more specific raw key overrides', () => {
      // two targets naming overlapping sets is the point of the feature, not a
      // collision, so class-order precedence is silent
      expect(new BlissSVGBuilder(
        '[grid;grid-line--stroke=red;grid-line--sky--stroke=blue]||B291').warnings).toHaveLength(0);
    });

    it('reports a displaced background colour', () => {
      const builder = new BlissSVGBuilder('[background-top=red;background-zone--top--fill=blue]||B291');

      expect(builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES').source)
        .toBe('background-top');
    });

    it('names the paper rect alone when no zones are drawn', () => {
      // which of the paper rect and the three zones draws is settled before the
      // report runs, so naming a zone the author never asked for would name an
      // element their output does not contain
      const builder = new BlissSVGBuilder('[background=beige;background-zone--fill=blue]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(builder.svgCode).toMatch(/<rect class="bliss-background-zone"[^>]*fill="blue"/);
      expect(warning.source).toBe('background');
      expect(warning.message).toContain('background-zone');
      expect(warning.message).not.toContain('--top');
    });

    it('names the kebab spelling of an option written in camelCase', () => {
      // object input is the one surface that keeps a camelCase key (the DSL,
      // the constructor and the transient channel all canonicalize on the way
      // in), and the key still reaches the curated destination, so the report
      // has to recognise it and name a spelling a bracket could carry
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }],
        options: { grid: true, gridSkyColor: 'blue', 'grid-line--stroke': 'red' },
      });
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning.source).toBe('grid-sky-color');
      expect(warning.message).not.toContain('gridSkyColor');
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
