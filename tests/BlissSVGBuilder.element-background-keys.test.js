import { describe, it, expect, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { LAYER_TARGETS } from '../src/lib/bliss-constants.js';

/**
 * Pins where an `element-background--` key may be written and what is
 * reported: the three element-background targets are kept on a word, a
 * character or a part, as after `||`, while every other target stays global.
 *
 * Covers:
 * - `element-background`, `element-background--box` and
 *   `element-background--ink` keys on a word, a character and a part: silent,
 *   drawn, saved where written; every route alike (the DSL, a composition
 *   object, `setOptions`, the transient options) and every reload.
 * - A name the global form refuses (an event handler, a namespace
 *   declaration, no attribute at all): the same report as after `||`, nothing
 *   emitted, the key kept in the save and reported again on reload.
 * - A near miss of the target refused as an unknown one, and dropped; every
 *   other target still MISPLACED_LAYER_OPTION below `||`; a bare name one
 *   letter past a target passed through as any attribute is.
 * - A key on a space: MISPLACED_SPACE_DECORATION.
 * - A key that displaces a written `background`: MULTIPLE_ATTRIBUTE_VALUES as
 *   after `||`, once per key whatever it reaches, naming the nearest key; no
 *   report where a key reaches no painted background.
 * - A definition carrying a key as a default or in the bracket leading its
 *   code string, styling the background each use draws.
 *
 * Does NOT cover:
 * - What each key reaches and which key wins (the targets, the subtree, the
 *   nearest key, `class` and `style`), see
 *   `BlissSVGBuilder.element-background-key-reach.test.js`.
 * - The keys after `||`, see `BlissSVGBuilder.element-background-layer.test.js`
 *   and `BlissSVGBuilder.ink-areas.test.js`; the refusals of the other targets
 *   below `||`, see `BlissSVGBuilder.layer-attributes.test.js` and
 *   `BlissSVGBuilder.name-refusal-scope.test.js`.
 * - A key's `href`, written as an inert attribute and not reported, as after
 *   `||` (backlog: "A layer key's `href` lands as an inert attribute").
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box as emitted, `extra` attributes after its own
// and `more` classes after its structural ones.
const box = (x, y, width, height, paint, extra = '', more = '') =>
  `<rect class="bliss-element-background bliss-element-background--box${more}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"${extra}/>`;
// One painted ink area around the given lines, exactly as emitted.
const inkArea = (paint, width, lines) =>
  `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="${paint}" stroke-width="${width}">${lines}</g>`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};
// The report a key earns for displacing a written `background`, worded as after `||`.
const displaced = (key, attribute, element) => ({
  code: 'MULTIPLE_ATTRIBUTE_VALUES',
  message: `"${key}" and "background" both set "${attribute}" on ${element}, so "${key}" was used: `
    + 'a key that names its target beats one that has to be resolved to it. Remove whichever you did not mean.',
  source: 'background',
});

const ELEMENT_TARGETS = ['element-background', 'element-background--box', 'element-background--ink'];
const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B313_B81 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M3,6l1,-2M4,4l1,2"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B81_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M3,6l1,-2M4,4l1,2M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const YELLOW_B313 = box(-1, -1, 10, 22, 'yellow');
const KEYED = ' data-k="1"';

afterAll(() => {
  for (const code of ['EBKDEF', 'EBKOWN']) BlissSVGBuilder.removeDefinition(code);
});

describe('BlissSVGBuilder element background keys', () => {
  describe('when a key is written on a word, a character or a part', () => {
    it.each([
      ['a word', '[element-background--data-k=1;background=yellow]|B313/B291', `${box(-1, -1, 20, 22, 'yellow', KEYED)}${B313_B291}`],
      ['a character', '[element-background--data-k=1;background=yellow]B313', `${box(-1, -1, 10, 22, 'yellow', KEYED)}${B313}`],
      ['a part', 'B313;[element-background--data-k=1;background=blue]>B81', `${box(2.5, 3.5, 3, 3, 'blue', KEYED)}${B313_B81}`],
    ])('keeps it on %s, silently, draws it and saves it where it was written', (_case, input, content) => {
      // pins the three targets leaving the scope judge's layer row: there they
      // are reported as MISPLACED_LAYER_OPTION and dropped from the save
      const builder = build(input);

      expect(contentOf(builder.svgCode)).toBe(content);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
    });
  });

  describe('when the key carries a name the global form refuses', () => {
    it.each([
      ['an event handler', 'element-background--onclick', 'UNSAFE_ATTRIBUTE_NAME'],
      ['a namespace declaration', 'element-background--box--xmlns', 'RESERVED_ATTRIBUTE_NAME'],
      ['no attribute at all', 'element-background--', 'UNKNOWN_LAYER'],
    ])('reports %s as after ||, emits nothing, and keeps it in the save', (_case, key, code) => {
      // at home below `||`, so kept and reported on every load, as a bare
      // `[onclick=x]B313` is; dropped only where a key cannot act at all
      const input = `[${key}=x;background=yellow]B313`;
      const builder = build(input);

      expect(builder.warnings.map((w) => w.code)).toEqual([code]);
      expect(builder.warnings).toEqual(build(`[${key}=x]||[background=yellow]B313`).warnings);
      expect(contentOf(builder.svgCode)).toBe(`${YELLOW_B313}${B313}`);
      expect(builder.toString()).toBe(input);
      expect(build(builder.toString()).warnings).toEqual(builder.warnings);
    });
  });

  describe('when the key names a target that is not one of the three', () => {
    it.each([
      ['a near miss of the target', 'element-backgrounds--data-k'],
      ['the target followed by an empty one', 'element-background----data-k'],
    ])('refuses %s as an unknown target and drops it', (_case, key) => {
      // pins the three targets being matched exactly, on the target before the
      // LAST `--`, as the global split reads a key
      const builder = build(`[${key}=1;background=yellow]B313`);

      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['UNKNOWN_LAYER', key]]);
      expect(builder.toString()).toBe('[background=yellow]B313');
      expect(contentOf(builder.svgCode)).toBe(`${YELLOW_B313}${B313}`);
    });

    it('still drops every other target with MISPLACED_LAYER_OPTION', () => {
      const others = [...LAYER_TARGETS].filter((target) => !ELEMENT_TARGETS.includes(target));
      const results = others.map((target) => build(`[${target}--opacity=0.5]B313`))
        .map((builder) => [builder.warnings.map((w) => w.code), builder.toString()]);

      expect(ELEMENT_TARGETS.every((target) => LAYER_TARGETS.has(target))).toBe(true);
      expect(others).toEqual(expect.arrayContaining(['content', 'grid', 'background', 'root']));
      expect(results).toEqual(others.map(() => [['MISPLACED_LAYER_OPTION'], 'B313']));
    });
  });

  describe('when a bare name only resembles a target', () => {
    it('passes it through to the element\'s own group, as any attribute', () => {
      // pins the `--` a key must carry: read without it, a name one letter past
      // a target was taken as that target's key (a hand mutant, 2026-10)
      const input = '[element-backgrounds=1;background=yellow]B313';
      const builder = build(input);

      expect(contentOf(builder.svgCode)).toBe(`${YELLOW_B313}<g element-backgrounds="1">${B313}</g>`);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
    });
  });

  describe('when a space carries a key', () => {
    it.each([
      ['B313/[element-background--data-k=1]TSP/B291', '[element-background--data-k=1]', 'B313//B291'],
      ['[element-background--data-k=1]|TSP', '[element-background--data-k=1]', '//'],
    ])('reports %s as a space decoration only, and saves it without the key', (input, source, saved) => {
      const builder = build(input);

      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['MISPLACED_SPACE_DECORATION', source]]);
      expect(builder.toString()).toBe(saved);
    });
  });

  describe('when a key displaces a written background', () => {
    it.each([
      ['a box', '[element-background--fill=red;background=yellow]B313',
        '[element-background--fill=red]||[background=yellow]B313', box(-1, -1, 10, 22, 'red')],
      ['an ink area', '[element-background--ink--stroke=red;background-area=ink;background=yellow]B313',
        '[element-background--ink--stroke=red]||[background-area=ink;background=yellow]B313', inkArea('red', 1.3, B313)],
    ])('reports a key on %s as it does after ||', (_case, input, global, drawn) => {
      const builder = build(input);

      expect(contentOf(builder.svgCode)).toBe(`${drawn}${B313}`);
      expect(builder.warnings.map((w) => [w.code, w.source])).toEqual([['MULTIPLE_ATTRIBUTE_VALUES', 'background']]);
      expect(builder.warnings).toEqual(build(global).warnings);
    });

    it('reports a word\'s key once, however many backgrounds it reaches', () => {
      const builder = build('[element-background--fill=red]|[background=yellow]B313/[background=green]B291');

      expect(contentOf(builder.svgCode)).toBe(`${box(-1, -1, 10, 22, 'red')}${box(9, -1, 10, 22, 'red')}${B313_B291}`);
      expect(builder.warnings).toEqual([displaced('element-background--fill', 'fill', 'element-background--box')]);
    });

    it('names the nearest key where a farther one sets the same attribute', () => {
      const builder = build('[element-background--fill=red]||[element-background--box--fill=blue;background=yellow]B313');

      expect(contentOf(builder.svgCode)).toBe(`${box(-1, -1, 10, 22, 'blue')}${B313}`);
      expect(builder.warnings).toEqual([displaced('element-background--box--fill', 'fill', 'element-background--box')]);
    });

    it.each([
      ['nothing is painted', '[element-background--fill=red]B313'],
      ['only a neighbour is painted', '[element-background--fill=red]B313/[background=yellow]B291'],
      ['only the word around it is painted', '[background=yellow]|[element-background--fill=red]B313/B291'],
    ])('reports nothing and keeps the key when %s', (_case, input) => {
      // a key reaches only the backgrounds inside its own element, so it
      // displaces none here
      const builder = build(input);

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
    });
  });

  describe('when the same keys arrive by different routes', () => {
    it('draws them identically from the DSL, a composition object, setOptions and the transient options', () => {
      const word = { 'element-background--class': 'noun' };
      const character = { 'element-background--data-k': '1', background: 'yellow' };
      const part = { 'element-background--rx': '1', background: 'blue' };
      const input = '[element-background--class=noun]|[element-background--data-k=1;background=yellow]B313;'
        + '[element-background--rx=1;background=blue]>B81/B291';
      const dsl = build(input);
      const json = build('B313;B81/B291').toJSON();
      json.groups[0].options = word;
      json.groups[0].glyphs[0].options = character;
      json.groups[0].glyphs[0].parts[1].options = part;
      const composition = build(json);
      const handle = build('B313;B81/B291');
      handle.group(0).setOptions(word);
      handle.glyph(0).setOptions(character);
      handle.glyph(0).part(1).setOptions(part);
      const transient = build('B313;B81/B291');
      transient.group(0).setTransientOptions(word);
      transient.glyph(0).setTransientOptions(character);
      transient.glyph(0).part(1).setTransientOptions(part);

      expect(contentOf(dsl.svgCode)).toBe(`${box(-1, -1, 10, 22, 'yellow', KEYED, ' noun')}`
        + `${box(2.5, 3.5, 3, 3, 'blue', `${KEYED} rx="1"`, ' noun')}${B313_B81_B291}`);
      for (const builder of [composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
        expect(builder.warnings).toEqual([]);
      }
      expect(dsl.toString()).toBe(input);
      expect(composition.toString()).toBe(input);
      expect(handle.toString()).toBe(input);
      expect(transient.toString()).toBe('B313;B81/B291');
    });

    it('reloads from toString() and both toJSON() modes to the same picture', () => {
      const builder = build('[element-background--class=g]||[element-background--class=noun;element-background--rx=2]|'
        + '[element-background--style=fill-opacity:0.5;background=yellow]B313;[element-background--rx=1;background=blue]>B81/B291');

      expect(contentOf(builder.svgCode)).toContain(box(2.5, 3.5, 3, 3, 'blue', ' rx="1" style="fill-opacity:0.5"', ' noun'));
      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a definition carries a key', () => {
    it('accepts it as a default and in the bracket leading its code string, styling the background each use draws', () => {
      // a definition's defaults attach to the part it draws (a part's box);
      // the key acts on the element it is written on, so unlike the other
      // targets it is not inert there
      const { errors } = BlissSVGBuilder.define({
        EBKDEF: { type: 'glyph', codeString: 'B313', defaultOptions: { background: 'yellow', 'element-background--data-k': '1' } },
        EBKOWN: { type: 'glyph', codeString: '[background=yellow;element-background--data-k=1]B313' },
      });

      expect(errors).toEqual([]);
      for (const code of ['EBKDEF', 'EBKOWN']) {
        const builder = build(code);
        expect(contentOf(builder.svgCode)).toBe(`${box(-0.5, 7.5, 9, 9, 'yellow', KEYED)}${B313}`);
        expect(builder.warnings).toEqual([]);
      }
    });
  });
});
