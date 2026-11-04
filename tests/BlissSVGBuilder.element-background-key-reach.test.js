import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins what an `element-background--` key written on a word, a character or a
 * part reaches: every element background inside that element, its own
 * included, each attribute taken from the nearest key.
 *
 * Covers:
 * - Each target reaching the backgrounds it names: `element-background` boxes
 *   and ink areas, `--box` boxes only, `--ink` ink areas only.
 * - The subtree: a word's key on the word's box, its characters' and their
 *   parts'; a character's key on nothing outside the character.
 * - Per attribute, the nearest key: a part's over its character's, a
 *   character's over its word's, a word's over the one after `||`; a farther
 *   key's other attributes still reaching. Within one element the more
 *   specific target wins in either order; across elements nearness comes
 *   first.
 * - `class` appended to the structural classes, `class` and `style` each
 *   replaced whole by a nearer key, never accumulated; `style` on a box and on
 *   an ink area.
 * - The key never on its element's own group, link or lines, and no effect:
 *   no copy of it wraps the background; two keys naming filters drawn as two
 *   filters side by side before it.
 * - `svgContent`.
 *
 * Does NOT cover:
 * - Where a key may be written, what is reported, the routes and the saves,
 *   see `BlissSVGBuilder.element-background-keys.test.js`.
 * - An element's own effects reaching its background, see
 *   `BlissSVGBuilder.background-effects.test.js`; the keys after `||`, see
 *   `BlissSVGBuilder.element-background-layer.test.js`.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);

// One element background's box as emitted, `extra` attributes after its own
// and `more` classes after its structural ones.
const box = (x, y, width, height, paint, extra = '', more = '') =>
  `<rect class="bliss-element-background bliss-element-background--box${more}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${paint}" stroke="none"${extra}/>`;
// One painted ink area around the given lines, `extra` attributes after its own.
const inkArea = (paint, width, lines, extra = '') =>
  `<g class="bliss-element-background bliss-element-background--ink" fill="none" stroke="${paint}" stroke-width="${width}"${extra}>${lines}</g>`;
// The content group's inner markup, which the element tree writes on one line.
const contentOf = (svg) => {
  const start = svg.indexOf('\n', svg.indexOf('<g class="bliss-content"')) + 1;
  return svg.slice(start, svg.indexOf('\n', start)).trim();
};

const B313 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"/>';
const B291_AT_10 = '<path d="M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const B313_B81_B291 = '<path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M3,6l1,-2M4,4l1,2M10,8h8M10,16h8M10,8v8M18,8v8"/>';
const KEYED = ' data-k="1"';

describe('BlissSVGBuilder element background key reach', () => {
  describe('when a word holds a box and an ink area', () => {
    it.each([
      ['element-background--data-k', KEYED, KEYED],
      ['element-background--box--data-k', KEYED, ''],
      ['element-background--ink--data-k', '', KEYED],
    ])('reaches with %s only what the target names', (key, onBox, onInk) => {
      const svg = build(`[${key}=1]|[background=yellow]B313/[background-area=ink;background=green]B291`).svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', onBox)}${inkArea('green', 1.3, B291_AT_10, onInk)}${B313_B291}`);
    });
  });

  describe('when a key is written on an element holding backgrounds', () => {
    it('reaches every background inside it, its own included', () => {
      const svg = build('[element-background--data-k=1;background=red]|[background=yellow]B313;[background=blue]>B81/B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 20, 22, 'red', KEYED)}${box(-1, -1, 10, 22, 'yellow', KEYED)}`
        + `${box(2.5, 3.5, 3, 3, 'blue', KEYED)}${B313_B81_B291}`);
    });

    it('reaches no background outside it, its word\'s and its neighbour\'s included', () => {
      const svg = build('[background=red]|[element-background--data-k=1;background=yellow]B313/[background=green]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 20, 22, 'red')}${box(-1, -1, 10, 22, 'yellow', KEYED)}`
        + `${box(9, -1, 10, 22, 'green')}${B313_B291}`);
    });
  });

  describe('when keys at several levels set one attribute', () => {
    it('takes it from the nearest: a part\'s over its character\'s, a character\'s over its word\'s, a word\'s over the one after ||', () => {
      const svg = build('[element-background--data-k=g]||[element-background--data-k=w;background=red]|'
        + '[element-background--data-k=c;background=yellow]B313;[element-background--data-k=p;background=blue]>B81/[background=green]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 20, 22, 'red', ' data-k="w"')}${box(-1, -1, 10, 22, 'yellow', ' data-k="c"')}`
        + `${box(2.5, 3.5, 3, 3, 'blue', ' data-k="p"')}${box(9, -1, 10, 22, 'green', ' data-k="w"')}${B313_B81_B291}`);
    });

    it('still takes from a farther key an attribute no nearer key sets', () => {
      const svg = build('[element-background--data-k=w;element-background--data-j=w]|'
        + '[element-background--data-k=c;background=yellow]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' data-k="c" data-j="w"')}${B313_B291}`);
    });

    it('puts nearness before specificity: a word\'s key for every background beats one after || for boxes', () => {
      const svg = build('[element-background--box--data-k=g]||[element-background--data-k=w]|[background=yellow]B313/B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' data-k="w"')}${B313_B291}`);
    });

    it.each([
      '[element-background--data-k=a;element-background--box--data-k=b;background=yellow]B313',
      '[element-background--box--data-k=b;element-background--data-k=a;background=yellow]B313',
    ])('lets the more specific target win within one element, in either order: %s', (input) => {
      // the contract's own precedence, class order and not write order, as
      // after `||`
      expect(contentOf(build(input).svgCode)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' data-k="b"')}${B313}`);
    });
  });

  describe('when a class or a style is written', () => {
    it('appends a class to the structural classes, the nearest replacing a farther one', () => {
      // nothing accumulates: `class=noun` on the word and `class=verb` on a
      // character give that character's background `verb` alone
      const svg = build('[element-background--class=g]||[element-background--class=noun]|'
        + '[element-background--class=verb;background=yellow]B313/[background=green]B291').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', '', ' verb')}${box(9, -1, 10, 22, 'green', '', ' noun')}${B313_B291}`);
    });

    it('writes a style on a box and on an ink area as written', () => {
      const boxed = build('[element-background--style=fill-opacity:0.5;background=yellow]B313').svgCode;
      const inked = build('[background-area=ink;element-background--style=stroke-opacity:0.5;background=yellow]B313').svgCode;

      expect(contentOf(boxed)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' style="fill-opacity:0.5"')}${B313}`);
      expect(contentOf(inked)).toBe(`${inkArea('yellow', 1.3, B313, ' style="stroke-opacity:0.5"')}${B313}`);
    });

    it('replaces a farther style whole with a nearer one, never merging the two', () => {
      const svg = build('[element-background--style=fill-opacity:0.5]||[element-background--style=stroke:red;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' style="stroke:red"')}${B313}`);
    });
  });

  describe('when an element writes a key beside its own attributes', () => {
    it('keeps the key off the element\'s own group, its link and its lines', () => {
      // unrouted, the key would pass through as an unknown attribute
      const svg = build('[element-background--data-k=1;href=#a;color=red;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', KEYED)}<a href="#a" style="cursor: pointer;"><g stroke="red">`
        + `<rect x="-1" y="-1" width="10" height="22" fill="transparent" stroke="none"/>${B313}</g></a>`);
    });

    it('writes an effect named by a key on the background alone, with no copy around it', () => {
      // a key is an attribute of the background, not an effect of its element
      const svg = build('[element-background--opacity=0.5;background=yellow]B313').svgCode;

      expect(contentOf(svg)).toBe(`${box(-1, -1, 10, 22, 'yellow', ' opacity="0.5"')}${B313}`);
    });

    it('writes the filters two keys name one after the other, before the background', () => {
      // pins the background's filters written side by side: a survivor of the
      // 2026-11 stryker run wrote other text between them
      const svg = build('[element-background--filter=blur(1px);element-background--style=filter:blur(2px);background=yellow]B313').svgCode;
      const [defs] = contentOf(svg).split('<rect');

      expect(defs).toMatch(/^(<filter [^>]*>.*?<\/filter>){2}$/);
    });
  });

  describe('when reading svgContent', () => {
    it('includes the keyed background, as the content group\'s inner markup', () => {
      const builder = build('[element-background--data-k=1;background=yellow]B313');

      expect(builder.svgContent).toBe(`${box(-1, -1, 10, 22, 'yellow', KEYED)}${B313}`);
      expect(builder.svgContent).toBe(contentOf(builder.svgCode));
    });
  });
});
