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
 * - A key that names a CONTAINER whose children write the same attribute on
 *   themselves: every name in that list is reported, the sub-element spelling
 *   that reaches the children is named, the value stays where it was asked for,
 *   and nothing is said where the container is not drawn or the children write
 *   no such attribute.
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
 * - A working key surviving BOTH serializers unchanged, with the attribute still
 *   in the markup and the report still raised on the way back in. That is what
 *   these rows uniquely add: the codes themselves are pinned above.
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
      // NOT a reverse-order row, though it reads like one: the options pass hands
      // every curated key to the split loop first, so this runs the identical
      // iteration as the row above. The `fill` rows below are what reverse it.
      ['the curated alias written second', '[root--stroke=blue;color=red]||B291', 'stroke="blue"', 'color', 'root--stroke'],
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

    it('says nothing for the other four line families either', () => {
      // the row above reaches the gate through the sky family alone, so a gate
      // narrowed to that one family would pass it while reporting four elements
      // no output contains
      expect(new BlissSVGBuilder('[grid-color=blue;grid-line--stroke=red]||B291').warnings)
        .toHaveLength(0);
    });

    it('names each displaced option once, listing every element it reached', () => {
      const builder = new BlissSVGBuilder(
        '[grid;grid-color=blue;grid-sky-color=green;grid-line--stroke=red]||B291');
      const displaced = builder.warnings.filter(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(displaced.map(w => w.source)).toEqual(['grid-color', 'grid-sky-color']);
      // grid-color still reaches four families; the sky one went to grid-sky-color
      expect(displaced[0].message).toContain('grid-line--minor, grid-line--medium');
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

    it('names the winner PER ELEMENT when two raw keys displace one option', () => {
      // both raw keys beat `grid-color`, on different lines, so there is one
      // report each. Collapsing them onto the curated key alone would leave a
      // single warning saying the general key won on the sky line, and its
      // "remove whichever you did not mean" would point at the key that paints
      const builder = new BlissSVGBuilder(
        '[grid;grid-color=blue;grid-line--stroke=red;grid-line--sky--stroke=green]||B291');
      const displaced = builder.warnings.filter(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(displaced).toHaveLength(2);
      expect(displaced.map(w => w.source)).toEqual(['grid-color', 'grid-color']);
      expect(displaced[0].message)
        .toContain('on grid-line--minor, grid-line--medium, grid-line--major, grid-line--earth, so "grid-line--stroke" was used');
      expect(displaced[1].message)
        .toContain('on grid-line--sky, so "grid-line--sky--stroke" was used');
    });

    it('names a family the bulk option reaches only through the major chain', () => {
      // `grid-major-color` sits mid-chain for the sky and earth lines and first
      // for the major family: drop it from any one of the three and that family
      // silently stops being named
      const builder = new BlissSVGBuilder('[grid;grid-major-color=blue;grid-line--stroke=red]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning.source).toBe('grid-major-color');
      expect(warning.message).toContain('on grid-line--major, grid-line--sky, grid-line--earth');
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

    it('leaves the paper rect out once the zones are drawing', () => {
      // `background` paints the zones the author left out, so the bulk option is
      // displaced on those zones and the paper rect is not in the output at all
      const builder = new BlissSVGBuilder('[background=beige;background-top=red;background-zone--fill=blue]||B291');
      const displaced = builder.warnings.filter(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(displaced.map(w => w.source)).toEqual(['background-top', 'background']);
      expect(displaced[1].message).toContain('on background-zone--mid, background-zone--bottom');
      expect(displaced.every(w => !/on background-zone,/.test(w.message))).toBe(true);
    });

    it('reports a zone the bulk option painted', () => {
      // the mid zone here draws from `background`, not from a zone option, so a
      // gate reading the zone option alone would call it undrawn and go quiet
      const builder = new BlissSVGBuilder('[background=beige;background-top=red;background-zone--mid--fill=blue]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning.source).toBe('background');
      expect(warning.message).toContain('on background-zone--mid');
    });

    // One row per NAME in CURATED_ATTRIBUTE_SOURCES, because a chain entry that
    // no input reaches can be deleted with the whole suite green: eight of the
    // sixteen were in that state until this table existed. The rule this file
    // keeps relearning is that a row per table is not a row per entry.
    it.each([
      ['grid-color',               'grid-line--stroke'],
      ['grid-minor-color',         'grid-line--minor--stroke'],
      ['grid-medium-color',        'grid-line--medium--stroke'],
      ['grid-major-color',         'grid-line--major--stroke'],
      ['grid-sky-color',           'grid-line--sky--stroke'],
      ['grid-earth-color',         'grid-line--earth--stroke'],
      ['grid-stroke-width',        'grid-line--stroke-width'],
      ['grid-minor-stroke-width',  'grid-line--minor--stroke-width'],
      ['grid-medium-stroke-width', 'grid-line--medium--stroke-width'],
      ['grid-major-stroke-width',  'grid-line--major--stroke-width'],
      ['grid-sky-stroke-width',    'grid-line--sky--stroke-width'],
      ['grid-earth-stroke-width',  'grid-line--earth--stroke-width'],
    ])('names %s when a raw key displaces it', (curated, rawKey) => {
      const builder = new BlissSVGBuilder(`[grid;${curated}=2;${rawKey}=3]||B291`);
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning).toBeDefined();
      expect(warning.source).toBe(curated);
      // a bulk option sits in all five chains, so the source alone cannot see it
      // dropped from one of them: the element list is what changes there
      if (curated === 'grid-color' || curated === 'grid-stroke-width') {
        expect(warning.message).toContain(
          'on grid-line--minor, grid-line--medium, grid-line--major, grid-line--sky, grid-line--earth');
      }
    });

    it.each([
      ['background',        '[background=beige;background-zone--fill=blue]||B291'],
      ['background-top',    '[background-top=r;background-mid=g;background-bottom=b;background-zone--top--fill=blue]||B291'],
      ['background-mid',    '[background-top=r;background-mid=g;background-bottom=b;background-zone--mid--fill=blue]||B291'],
      ['background-bottom', '[background-top=r;background-mid=g;background-bottom=b;background-zone--bottom--fill=blue]||B291'],
    ])('names %s when a raw key displaces it', (curated, input) => {
      const warning = new BlissSVGBuilder(input).warnings
        .find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES' && w.source === curated);

      expect(warning).toBeDefined();
    });

    it('reports a displaced width as readily as a displaced colour', () => {
      const builder = new BlissSVGBuilder(
        '[grid;grid-sky-stroke-width=2;grid-line--sky--stroke-width=3]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(linesWithClass(builder.svgCode, 'bliss-grid-line--sky')[0])
        .toContain('stroke-width="3"');
      expect(warning.source).toBe('grid-sky-stroke-width');
      expect(warning.message).toContain('so "grid-line--sky--stroke-width" was used');
    });

    it('names the specific option over the bulk one on the earth line', () => {
      // pins this chain's order rather than the sky one's: a chain listed
      // least-specific-first would name grid-color here and read as if the bulk
      // option were the one the raw key beat
      const builder = new BlissSVGBuilder(
        '[grid;grid-color=blue;grid-earth-color=green;grid-line--earth--stroke=red]||B291');
      const warning = builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(warning.source).toBe('grid-earth-color');
    });

    it('says nothing for a spelling the options pass does not curate', () => {
      // `[grid;gridColor=blue]` paints nothing: the pass reads the key, escapes
      // it and files it with the author's own, but the camelCase form is not
      // curated vocabulary, so the grid stays grey and the key is emitted on the
      // root verbatim. Naming it as displaced would report a collision that
      // never happened.
      //
      // The spelling itself IS reported, by `MISPLACED_OPTION_SPELLING`, which
      // is a statement about the key rather than about two values meeting on one
      // attribute. Filtered out rather than counted, so this row keeps meaning
      // "no collision" and would fail if the displacement report came back.
      const builder = new BlissSVGBuilder('[grid;gridColor=blue;grid-line--stroke=red]||B291');
      expect(builder.warnings.filter(w => w.code !== 'MISPLACED_OPTION_SPELLING')).toHaveLength(0);
      expect(builder.svgCode).toContain('gridColor="blue"');
    });
  });

  describe('when an attribute lands on a container its children shadow', () => {
    // one row per name in CONTAINER_SHADOWED_ATTRIBUTES: the list is closed and
    // hand-written, so a name nothing exercises could be deleted from it and
    // every other row would still pass
    it.each([
      ['grid--stroke',          '[grid;grid--stroke=red]||B291',                    'grid-line--stroke'],
      ['grid--stroke-width',    '[grid;grid--stroke-width=2]||B291',                'grid-line--stroke-width'],
      ['grid--stroke-linecap',  '[grid;grid--stroke-linecap=butt]||B291',           'grid-line--stroke-linecap'],
      ['grid--stroke-linejoin', '[grid;grid--stroke-linejoin=bevel]||B291',         'grid-line--stroke-linejoin'],
      ['grid--d',               '[grid;grid--d=M0,0h8]||B291',                      'grid-line--d'],
      ['background--fill',      '[background=beige;background--fill=red]||B291',    'background-zone--fill'],
      ['background--stroke',    '[background=beige;background--stroke=red]||B291',  'background-zone--stroke'],
      ['background--x',         '[background=beige;background--x=1]||B291',         'background-zone--x'],
      ['background--y',         '[background=beige;background--y=1]||B291',         'background-zone--y'],
      ['background--width',     '[background=beige;background--width=5]||B291',     'background-zone--width'],
      ['background--height',    '[background=beige;background--height=5]||B291',    'background-zone--height'],
    ])('reports %s and names the spelling that works', (key, input, suggested) => {
      const builder = new BlissSVGBuilder(input);
      const warning = builder.warnings.find(w => w.code === 'MISPLACED_CONTAINER_ATTRIBUTE');

      expect(warning).toBeDefined();
      expect(warning.source).toBe(key);
      expect(warning.message).toContain(`on the ${key.split('--')[0]} group`);
      expect(warning.message).toContain(suggested);
    });

    it.each([
      ['only zones are drawn',      '[background-top=red;background--fill=blue]||B291'],
      ['a bulk and zones are drawn', '[background=beige;background-top=red;background--fill=blue]||B291'],
    ])('reports the background when %s', (_case, input) => {
      // the drawn-state gate reads every zone and not just the paper rect;
      // narrowing it to the paper silences every zones-only background, and the
      // rows above all draw the paper, so none of them would notice
      expect(new BlissSVGBuilder(input).warnings.map(w => w.code))
        .toContain('MISPLACED_CONTAINER_ATTRIBUTE');
    });

    it('still emits the value it was asked for', () => {
      // the report says where the value landed, it does not take it away
      expect(new BlissSVGBuilder('[grid;grid--stroke=red]||B291').svgCode)
        .toMatch(/<g class="bliss-grid"[^>]*stroke="red"/);
    });

    it.each([
      ['the grid is off',       '[grid--stroke=red]||B291'],
      ['the background is off', '[background--fill=red]||B291'],
    ])('stays silent when %s', (_case, input) => {
      // nothing was drawn, so a message about where the value landed would
      // describe an element the output does not contain
      expect(new BlissSVGBuilder(input).warnings).toHaveLength(0);
    });

    it.each([
      ['grid--class',       '[grid;grid--class=mine]||B291',                   'bliss-grid mine'],
      ['background--class', '[background=beige;background--class=mine]||B291', 'bliss-background mine'],
    ])('never reports %s, which merges and works', (_case, input, expected) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.map(w => w.code)).not.toContain('MISPLACED_CONTAINER_ATTRIBUTE');
      expect(builder.svgCode).toContain(`class="${expected}"`);
    });

    it('says nothing for an attribute the children do not write', () => {
      expect(new BlissSVGBuilder('[grid;grid--opacity=0.3]||B291').warnings).toHaveLength(0);
    });
  });

  describe('when a working target key is stored and read back', () => {
    it('survives both serializers and renders identically', () => {
      const builder = new BlissSVGBuilder('[grid;grid-line--sky--stroke-dasharray=2]||B291');

      expect(builder.toString()).toBe('[grid;grid-line--sky--stroke-dasharray=2]||B291');
      // reparsing that string and comparing would assert nothing: `toString()`
      // just returned the literal this builder was made from, so both sides
      // would be builds of one string. The markup and the JSON route can differ.
      expect(linesWithClass(builder.svgCode, 'bliss-grid-line--sky')[0])
        .toContain('stroke-dasharray="2"');
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a displaced curated option',     '[grid;grid-sky-color=blue;grid-line--stroke=red]||B291', 'MULTIPLE_ATTRIBUTE_VALUES',     'stroke="red"'],
      ['a duplicated root attribute',    '[fill=red;root--fill=red]||B291',                        'MULTIPLE_ATTRIBUTE_VALUES',     'fill="red"'],
      ['a shadowed container attribute', '[grid;grid--stroke=red]||B291',                          'MISPLACED_CONTAINER_ATTRIBUTE', '<g class="bliss-grid" shape-rendering="crispEdges" stroke="red">'],
    ])('reports %s again after a round trip', (_case, input, code, emitted) => {
      // nothing is refused in these three: every key is emitted and the picture
      // is unchanged by the round trip. What has to survive is the REPORT, since
      // a stored composition that renders the same way and goes quiet would hide
      // the very thing it was told about
      const written = new BlissSVGBuilder(input).toString();
      const reparsed = new BlissSVGBuilder(written);

      expect(written).toBe(input);
      expect(reparsed.warnings.map(w => w.code)).toContain(code);
      // The value has to come back with its report, so the reparse is checked
      // against the MARKUP and against the other serializer. Comparing it with a
      // fresh build of `input` would assert nothing at all: `written` is `input`
      // by the line above, so both sides would be builds of one string.
      expect(reparsed.svgCode).toContain(emitted);
      expect(new BlissSVGBuilder(new BlissSVGBuilder(input).toJSON()).svgCode).toBe(reparsed.svgCode);
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
