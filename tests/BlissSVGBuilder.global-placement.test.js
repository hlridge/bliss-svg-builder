import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins where a bare global key lands: the attributes that describe the image
 * (`role`, `aria-*`, `id`, `class`, `data-*`, `lang`, `tabindex`,
 * `preserveAspectRatio`, `overflow`, `viewBox`, `width`, `height`) on the root
 * `<svg>`, and every other key on the symbol's content group, beside the five
 * paint defaults.
 *
 * Covers:
 * - The paint defaults on the content group and none of them on the root.
 * - Each image attribute on the root, matched on its stored name, and each
 *   styling attribute (an unknown name of your own included) on the content
 *   group.
 * - The grid and the background never restyled by a bare key.
 * - `root--` reaching the root as written, and a root paint name reported as
 *   shadowed by the content group's own value.
 * - Collisions judged per element: a bare key against `content--` on the
 *   content group, against `root--` on the root, explicit beating resolved in
 *   either loop order; two bare keys silent.
 * - A bare `vector-effect` relocated onto the paths beside either prefixed
 *   spelling, silently.
 * - Byte parity across the DSL, the constructor options and the transient
 *   channel, and a reload from both serializers.
 *
 * Does NOT cover:
 * - The global link, see `BlissSVGBuilder.global-link-attributes.test.js`,
 *   and an element link's clickable area, see
 *   `BlissSVGBuilder.element-link-area.test.js`.
 * - The prefixed channel's own targets and refusals, see
 *   `BlissSVGBuilder.layer-attributes.test.js`,
 *   `BlissSVGBuilder.layer-sub-targets.test.js` and
 *   `BlissSVGBuilder.layer-attribute-refusals.test.js`.
 * - Converting a CSS `filter` function into an in-picture `<filter>`, which is
 *   not built yet (backlog, CSS filter pass-through).
 */

const rootTag = (svg) => svg.match(/<svg[^>]*>/)[0];
// Class-prefix matched, so the tag stays findable when a class is appended.
const contentTag = (svg) => svg.match(/<g class="bliss-content[^"]*"[^>]*>/)[0];
// Leading-space anchored, so counting `stroke` does not also count `stroke-width`.
const countAttr = (tag, name) => (tag.match(new RegExp(`\\s${name}="`, 'g')) || []).length;

// The content group exactly as v1.0.0 wrote it for a plain symbol.
const DEFAULT_CONTENT_TAG = '<g class="bliss-content" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">';
const PAINT_ON_ROOT = /\s(fill|stroke|stroke-linejoin|stroke-linecap|stroke-width)="/;

describe('BlissSVGBuilder global placement', () => {
  describe('when no global key is written', () => {
    it('puts the five paint defaults on the content group and none on the root', () => {
      const svg = new BlissSVGBuilder('B313').svgCode;

      expect(contentTag(svg)).toBe(DEFAULT_CONTENT_TAG);
      expect(rootTag(svg)).not.toMatch(PAINT_ON_ROOT);
    });
  });

  describe('when a global key styles the drawing', () => {
    it('writes the curated pair and opacity on the content group, each once', () => {
      const svg = new BlissSVGBuilder('[color=red;stroke-width=1;opacity=0.5]||B313').svgCode;

      expect(contentTag(svg)).toBe('<g class="bliss-content" fill="none" stroke="red" stroke-linejoin="round" stroke-linecap="round" stroke-width="1" opacity="0.5">');
      expect(rootTag(svg)).not.toMatch(PAINT_ON_ROOT);
      expect(rootTag(svg)).not.toContain('opacity');
    });

    it.each([
      ['filter=url(#f)', 'filter="url(#f)"'],
      ['style=filter:blur(1px)', 'style="filter:blur(1px)"'],
      ['clip-path=url(#c)', 'clip-path="url(#c)"'],
      ['mask=url(#m)', 'mask="url(#m)"'],
      ['transform=rotate(20)', 'transform="rotate(20)"'],
      ['stroke-dasharray=1 1', 'stroke-dasharray="1 1"'],
      ['pointer-events=none', 'pointer-events="none"'],
      ['cursor=pointer', 'cursor="pointer"'],
      ['fill-opacity=0.5', 'fill-opacity="0.5"'],
      // names of your own: XML names are case-sensitive, so none of these is
      // the image attribute it resembles
      ['myAttr=1', 'myAttr="1"'],
      ['Role=img', 'Role="img"'],
      ['dataX=1', 'dataX="1"'],
      // pins the prefix boundary: the list matches `aria-` with its dash, so a
      // name that only begins with the letters is the author's own
      ['ariadne=1', 'ariadne="1"'],
    ])('puts %s on the content group after the defaults and not on the root', (option, attribute) => {
      const svg = new BlissSVGBuilder(`[${option}]||B313`).svgCode;

      expect(contentTag(svg)).toBe(DEFAULT_CONTENT_TAG.replace(/>$/, ` ${attribute}>`));
      expect(rootTag(svg)).not.toContain(attribute.split('=')[0] + '=');
    });

    it('leaves every grid line undashed', () => {
      const svg = new BlissSVGBuilder('[grid;stroke-dasharray=1 1]||B313').svgCode;
      const gridLines = svg.split('\n').filter(l => l.includes('class="bliss-grid-line'));

      expect(gridLines).toHaveLength(5);
      expect(gridLines.filter(l => l.includes('stroke-dasharray'))).toHaveLength(0);
      expect(rootTag(svg)).not.toContain('stroke-dasharray');
      expect(contentTag(svg)).toContain('stroke-dasharray="1 1"');
    });

    it('leaves the background unfaded', () => {
      const svg = new BlissSVGBuilder('[background=red;opacity=0.5]||B313').svgCode;

      expect(svg).toContain('<g class="bliss-background">');
      expect(svg).toMatch(/<rect class="bliss-background-zone"(?![^>]*opacity)[^>]*>/);
      expect(rootTag(svg)).not.toContain('opacity');
      expect(contentTag(svg)).toContain('opacity="0.5"');
    });
  });

  describe('when a global key describes the image', () => {
    it.each([
      ['role=img', 'role="img"'],
      ['aria-label=water', 'aria-label="water"'],
      ['ariaLabel=water', 'aria-label="water"'],
      ['id=w', 'id="w"'],
      ['data-x=1', 'data-x="1"'],
      ['lang=sv', 'lang="sv"'],
      ['tabindex=0', 'tabindex="0"'],
      ['TabIndex=0', 'tabindex="0"'],
      ['preserveAspectRatio=none', 'preserveAspectRatio="none"'],
      ['overflow=visible', 'overflow="visible"'],
      ['viewBox=0 0 10 10', 'viewBox="0 0 10 10"'],
      ['width=100', 'width="100"'],
      ['height=200', 'height="200"'],
    ])('puts %s on the root and leaves the content group plain', (option, attribute) => {
      const svg = new BlissSVGBuilder(`[${option}]||B313`).svgCode;

      expect(rootTag(svg)).toContain(` ${attribute}`);
      expect(contentTag(svg)).toBe(DEFAULT_CONTENT_TAG);
    });

    it('appends a class to the root and leaves the content class alone', () => {
      const svg = new BlissSVGBuilder('[class=mine]||B313').svgCode;

      expect(rootTag(svg)).toContain('class="bliss-root mine"');
      expect(contentTag(svg)).toBe(DEFAULT_CONTENT_TAG);
    });
  });

  describe('when a key names the root', () => {
    it.each([
      ['root--opacity=0.5', 'opacity="0.5"'],
      ['root--style=filter:blur(1px)', 'style="filter:blur(1px)"'],
      ['root--transform=scale(2)', 'transform="scale(2)"'],
    ])('emits %s on the root as written, silently', (option, attribute) => {
      const builder = new BlissSVGBuilder(`[${option}]||B313`);

      expect(rootTag(builder.svgCode)).toContain(` ${attribute}`);
      expect(contentTag(builder.svgCode)).toBe(DEFAULT_CONTENT_TAG);
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['fill', 'blue'],
      ['stroke', 'blue'],
      ['stroke-width', '3'],
      ['stroke-linecap', 'butt'],
      ['stroke-linejoin', 'bevel'],
    ])('keeps root--%s on the root and reports it as shadowed by the content group', (name, value) => {
      const builder = new BlissSVGBuilder(`[root--${name}=${value}]||B313`);
      const [warning] = builder.warnings;

      expect(rootTag(builder.svgCode)).toContain(` ${name}="${value}"`);
      expect(contentTag(builder.svgCode)).toBe(DEFAULT_CONTENT_TAG);
      expect(builder.warnings.map(w => w.code)).toEqual(['MISPLACED_CONTAINER_ATTRIBUTE']);
      expect(warning.source).toBe(`root--${name}`);
      expect(warning.message).toContain('the root <svg>');
      expect(warning.message).toContain(`"content--${name}"`);
      // observable facts only: inheritance is the mechanism, not what an author sees
      expect(warning.message).not.toMatch(/inherit/i);
    });
  });

  describe('when a bare key and a prefixed key reach the same element', () => {
    it.each([
      ['the curated alias', '[color=red;content--stroke=blue]||B313', 'stroke', 'blue', 'color', 'content--stroke'],
      ['two explicit widths', '[stroke-width=2;content--stroke-width=3]||B313', 'stroke-width', '3', 'stroke-width', 'content--stroke-width'],
    ])('lets content-- beat %s on the content group and reports the loser', (_case, input, name, value, loser, winner) => {
      const builder = new BlissSVGBuilder(input);
      const reports = builder.warnings.filter(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES');

      expect(contentTag(builder.svgCode)).toContain(` ${name}="${value}"`);
      expect(countAttr(contentTag(builder.svgCode), name)).toBe(1);
      expect(reports).toHaveLength(1);
      expect(reports[0].source).toBe(loser);
      expect(reports[0].message).toContain(`so "${winner}" was used`);
      expect(reports[0].message).toContain('the content group');
      expect(reports[0].message).not.toContain('strokeWidth');
    });

    it.each([
      ['ahead of it', '[content--fill=red;fill=blue]||B313'],
      ['behind it', '[fill=blue;content--fill=red]||B313'],
    ])('lets content--fill win with the bare key %s', (_case, input) => {
      // pins explicit-beats-resolved in both loop orders on the content group;
      // `fill` is uncurated, so it keeps its written position in the walk, which
      // is what kills a guard narrowed to `prior && explicit` or a dropped
      // `if (!explicit) return`
      const builder = new BlissSVGBuilder(input);

      expect(contentTag(builder.svgCode)).toContain(' fill="red"');
      expect(countAttr(contentTag(builder.svgCode), 'fill')).toBe(1);
      expect(builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES').source).toBe('fill');
    });

    it('reports a duplicate on the content group even when the two values are equal', () => {
      const builder = new BlissSVGBuilder('[fill=red;content--fill=red]||B313');

      expect(builder.warnings.map(w => w.code)).toContain('MULTIPLE_ATTRIBUTE_VALUES');
    });

    it.each([
      ['ahead of it', '[root--role=a;role=b]||B313'],
      ['behind it', '[role=b;root--role=a]||B313'],
    ])('lets root--role win on the root with the bare key %s', (_case, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(rootTag(builder.svgCode)).toContain(' role="a"');
      expect(builder.svgCode).not.toContain('role="b"');
      expect(builder.warnings.find(w => w.code === 'MULTIPLE_ATTRIBUTE_VALUES').source).toBe('role');
    });

    it('reports a duplicated image attribute on the root even when the values are equal', () => {
      const builder = new BlissSVGBuilder('[aria-label=x;root--aria-label=x]||B313');

      expect(builder.warnings.map(w => w.code)).toContain('MULTIPLE_ATTRIBUTE_VALUES');
    });

    it('keeps two bare keys one silent channel', () => {
      const builder = new BlissSVGBuilder('[color=red;stroke=blue]||B313');

      expect(contentTag(builder.svgCode)).toContain(' stroke="blue"');
      expect(countAttr(contentTag(builder.svgCode), 'stroke')).toBe(1);
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when vector-effect is written globally', () => {
    it('stamps every content path and neither group nor root', () => {
      const svg = new BlissSVGBuilder('[vector-effect=non-scaling-stroke]||B313/B291').svgCode;
      const paths = svg.match(/<path [^>]*>/g);

      expect(paths.every(p => p.includes('vector-effect="non-scaling-stroke"'))).toBe(true);
      expect(rootTag(svg)).not.toContain('vector-effect');
      expect(contentTag(svg)).not.toContain('vector-effect');
    });

    it.each([
      ['content', '[content--vector-effect=none]||B313', contentTag],
      ['root', '[root--vector-effect=none]||B313', rootTag],
    ])('keeps a %s-- vector-effect where it was written and leaves the paths alone', (_target, input, tagOf) => {
      const svg = new BlissSVGBuilder(input).svgCode;

      expect(tagOf(svg)).toContain(' vector-effect="none"');
      expect(svg).not.toMatch(/<path[^>]*vector-effect/);
    });

    it.each([
      ['content', '[vector-effect=non-scaling-stroke;content--vector-effect=none]||B313', contentTag],
      ['root', '[vector-effect=non-scaling-stroke;root--vector-effect=none]||B313', rootTag],
    ])('applies a bare vector-effect beside its %s-- twin without a report', (_target, input, tagOf) => {
      // the bare key's destination is the paths, so it collides with neither
      // prefixed spelling
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toMatch(/<path vector-effect="non-scaling-stroke"/);
      expect(tagOf(builder.svgCode)).toContain(' vector-effect="none"');
      expect(builder.warnings).toEqual([]);
    });

    it('unstamps the paths when a transient vector-effect is removed', () => {
      // pins the per-rebuild reset of the relocated value, which lives apart
      // from both elements' attribute maps and would otherwise outlive its key
      const builder = new BlissSVGBuilder('B313').setTransientOptions({ 'vector-effect': 'non-scaling-stroke' });
      expect(builder.svgCode).toMatch(/<path vector-effect="non-scaling-stroke"/);

      builder.removeTransientOptions('vector-effect');

      expect(builder.svgCode).not.toContain('vector-effect');
    });
  });

  describe('when the same global key arrives from different surfaces', () => {
    it.each([
      ['color=red', { color: 'red' }, contentTag, 'stroke="red"'],
      ['role=img', { role: 'img' }, rootTag, 'role="img"'],
      ['opacity=0.5', { opacity: 0.5 }, contentTag, 'opacity="0.5"'],
      ['root--opacity=0.5', { 'root--opacity': 0.5 }, rootTag, 'opacity="0.5"'],
    ])('renders %s identically from the DSL, the constructor and the transient channel', (option, object, tagOf, attribute) => {
      const dsl = new BlissSVGBuilder(`[${option}]||B313`).svgCode;
      const api = new BlissSVGBuilder('B313', object).svgCode;
      const transient = new BlissSVGBuilder('B313').setTransientOptions(object).svgCode;

      expect(tagOf(dsl)).toContain(` ${attribute}`);
      expect(api).toBe(dsl);
      expect(transient).toBe(dsl);
    });

    it.each([
      '[color=red;stroke-width=1;opacity=0.5]||B313',
      '[role=img;aria-label=water;class=mine]||B313',
      '[root--opacity=0.5]||B313',
      '[root--stroke=blue]||B313',
    ])('reloads %s from both serializers to the same picture and warnings', (input) => {
      const builder = new BlissSVGBuilder(input);
      const fromString = new BlissSVGBuilder(builder.toString());
      const fromJSON = new BlissSVGBuilder(builder.toJSON());

      expect(fromString.svgCode).toBe(builder.svgCode);
      expect(fromJSON.svgCode).toBe(builder.svgCode);
      expect(fromString.warnings).toEqual(builder.warnings);
      expect(fromJSON.warnings).toEqual(builder.warnings);
    });
  });
});
