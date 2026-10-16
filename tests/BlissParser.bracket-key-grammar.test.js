import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a bracket key is read whole and judged by the name it spells, as
 * the same key in a composition object is.
 *
 * Covers:
 * - A key holding a character outside letters, digits and dashes (a colon, a
 *   dot, a space, a slash, an at sign, a non-ASCII letter) at global, word,
 *   character and part scope: one key, reported, kept out of the markup,
 *   saved as written, and reported again when the save is read back.
 * - A target-prefixed key with a non-ASCII target, judged as the target it
 *   names.
 * - Parity with the same key written in a composition object, whose save now
 *   reloads as the same key.
 * - The two hints the refusal gives: a kerning marker written inside a
 *   bracket, whose example repeats the key only when the reader takes it
 *   for a marker, and `xlink:href`.
 * - Nameless entries (`[=5]`, `[=]`) and empty ones (`[;;]`, `[ ]`).
 * - A quoted value followed by text, a value of two quoted spans, a `;`
 *   inside quotes, the first `=` splitting an entry, and the padding around
 *   a key and its value.
 * - `define()` reading a definition's own bracket the same way.
 *
 * Does NOT cover:
 * - Names a save could not write back (holding `=`, `;`, a closing square
 *   bracket, a quote, or edge whitespace), which are not stored at all, see
 *   `BlissSVGBuilder.unspellable-option-names.test.js`.
 * - The refusal's base wording and the event-handler names, see
 *   `BlissSVGBuilder.unsafe-attribute-names.test.js`.
 */

// Each warning as `${code} ${source}`, so a row fails on either.
const reported = (builder) => builder.warnings.map(w => `${w.code} ${w.source}`);

const OUTSIDE_THE_GRAMMAR = [
  ['xlink:href', 'https://example.com'],
  ['xml:lang', 'en'],
  ['foo.bar', '1'],
  ['stroke width', '2'],
  ['a/b', '1'],
  ['a@b', '1'],
  ['färg', 'red'],
];

const SCOPES = [
  ['global', (key, value) => `[${key}=${value}]||B291`],
  ['word', (key, value) => `[${key}=${value}]|B291`],
  ['character', (key, value) => `[${key}=${value}]B291`],
  ['part', (key, value) => `[${key}=${value}]>B291`],
];

const EVERY_KEY_AT_EVERY_SCOPE = OUTSIDE_THE_GRAMMAR.flatMap(([key, value]) =>
  SCOPES.map(([scope, write]) => [key, scope, write(key, value)]));

describe('BlissParser bracket key grammar', () => {
  describe('when a key holds a character outside letters, digits and dashes', () => {
    it.each(EVERY_KEY_AT_EVERY_SCOPE)('reads %s as one key at %s scope and reports it', (key, _scope, input) => {
      const builder = new BlissSVGBuilder(input);

      expect(reported(builder)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(builder.toString()).toBe(input);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });

    it.each(OUTSIDE_THE_GRAMMAR)('reports %s again when its save is read back', (key, value) => {
      const builder = new BlissSVGBuilder(`[${key}=${value}]||B291`);
      const reloaded = new BlissSVGBuilder(builder.toString());

      expect(reported(reloaded)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });

    it('reads a prefixed key with a non-ASCII target as the target it names', () => {
      const global = new BlissSVGBuilder('[grïd--fill=red]||B291');
      expect(reported(global)).toEqual(['UNKNOWN_LAYER grïd--fill']);
      expect(global.toString()).toBe('[grïd--fill=red]||B291');

      // below global scope a target-prefixed key is dropped as well as reported
      const character = new BlissSVGBuilder('[grïd--fill=red]B291');
      expect(reported(character)).toEqual(['UNKNOWN_LAYER grïd--fill']);
      expect(character.toString()).toBe('B291');
    });
  });

  describe('when the same key is written in a composition object', () => {
    it.each(['xlink:href', 'foo.bar', 'stroke width', 'färg'])(
      'reports %s as the bracket does and its save reloads the same picture', (key) => {
        const fromObject = new BlissSVGBuilder({ ...new BlissSVGBuilder('B291').toJSON(), options: { [key]: '1' } });
        const fromBracket = new BlissSVGBuilder(`[${key}=1]||B291`);

        expect(reported(fromObject)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
        expect(reported(fromBracket)).toEqual(reported(fromObject));
        expect(fromObject.toString()).toBe(fromBracket.toString());

        const reloaded = new BlissSVGBuilder(fromObject.toString());
        expect(reloaded.svgCode).toBe(fromObject.svgCode);
        expect(reported(reloaded)).toEqual(reported(fromObject));
      });
  });

  describe('when the key is a kerning marker written in a bracket', () => {
    it.each(['RK:5', 'AK:-1.5', 'RK:1e3'])('reports [%s] as one name, says where a marker goes and does not kern', (key) => {
      const { warnings, svgCode } = new BlissSVGBuilder(`B291/[${key}]B313`);

      expect(warnings).toHaveLength(1);
      expect(`${warnings[0].code} ${warnings[0].source}`).toBe(`UNSAFE_ATTRIBUTE_NAME ${key}`);
      expect(warnings[0].message).toContain(`B291/${key}/B313`);
      expect(new BlissSVGBuilder(`B291/${key}/B313`).warnings).toEqual([]);
      expect(svgCode).toBe(new BlissSVGBuilder('B291/B313').svgCode);
    });

    it.each([
      ['RK:', 'RK:5'],
      ['AK:', 'AK:5'],
      ['RK:abc', 'RK:5'],
      ['RK:1e400', 'RK:5'],
      ['RK:Infinity', 'RK:5'],
      ['RK: 5', 'RK:5'],
      ['AK:0x10', 'AK:5'],
    ])('answers [%s], which is no marker either, with the example %s', (key, marker) => {
      // pins the example repeating the key only when the reader would take it
      // for a marker: copied from the message, B291/RK:abc/B313 is refused too
      const { warnings } = new BlissSVGBuilder(`B291/[${key}]B313`);

      expect(warnings).toHaveLength(1);
      expect(`${warnings[0].code} ${warnings[0].source}`).toBe(`UNSAFE_ATTRIBUTE_NAME ${key}`);
      expect(warnings[0].message).toContain(`B291/${marker}/B313`);
      expect(warnings[0].message).not.toContain(`B291/${key}/B313`);
    });

    it.each(['XRK:5', 'rk:5'])('reports [%s] without the marker sentence', (key) => {
      // pins the start anchor and the case of the marker hint: neither name
      // begins with an uppercase RK: or AK:
      const { warnings } = new BlissSVGBuilder(`[${key}]B291`);

      expect(warnings).toHaveLength(1);
      expect(`${warnings[0].code} ${warnings[0].source}`).toBe(`UNSAFE_ATTRIBUTE_NAME ${key}`);
      expect(warnings[0].message).not.toContain('kerning marker');
    });
  });

  describe('when the key is xlink:href', () => {
    it.each(['xlink:href', 'XLINK:HREF'])('tells the author to write href for %s and draws no link', (key) => {
      // the upper-case row pins that the hint ignores case
      const { warnings, svgCode } = new BlissSVGBuilder(`[${key}=https://example.com]B291`);

      expect(warnings).toHaveLength(1);
      expect(`${warnings[0].code} ${warnings[0].source}`).toBe(`UNSAFE_ATTRIBUTE_NAME ${key}`);
      expect(warnings[0].message).toContain('Write "href"');
      expect(svgCode).not.toContain('<a ');
    });

    it('gives another namespaced name no href hint', () => {
      const { warnings } = new BlissSVGBuilder('[xml:lang=en]||B291');

      expect(warnings).toHaveLength(1);
      expect(`${warnings[0].code} ${warnings[0].source}`).toBe('UNSAFE_ATTRIBUTE_NAME xml:lang');
      expect(warnings[0].message).not.toContain('href');
    });
  });

  describe('when a bracket entry has no name or no content', () => {
    it.each(['[=5]||B291', '[=]||B291'])('reports %s as a name that is empty, saves it and reports it again on reload', (input) => {
      const builder = new BlissSVGBuilder(input);

      expect(reported(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME ']);
      expect(builder.toString()).toBe(input);
      expect(reported(new BlissSVGBuilder(builder.toString()))).toEqual(['UNSAFE_ATTRIBUTE_NAME ']);
    });

    it.each(['[;;]||B291', '[ ]||B291', '[ ; ]||B291', '[;]B291'])('adds nothing for %s', (input) => {
      // pins the blank-entry skip: read as an entry, `[ ]` would be a key with no name
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when a value is quoted', () => {
    it('reads a quoted value followed by more text as one value', () => {
      const builder = new BlissSVGBuilder('[data-a="x"y]||B291');

      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toContain('data-a="&quot;x&quot;y"');
    });

    it.each([
      ['[data-a="x" "y"]||B291', 'data-a="&quot;x&quot; &quot;y&quot;"'],
      ["[data-a='x' 'y']||B291", 'data-a="&#39;x&#39; &#39;y&#39;"'],
    ])('reads %s, two quoted spans, as written', (input, attribute) => {
      // pins that only ONE quoted span is unquoted: stripping the outer quotes
      // of two would leave `x" "y`, a value nobody wrote
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toContain(attribute);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('keeps a ; inside a quoted value within its entry', () => {
      const { svgCode } = new BlissSVGBuilder('[data-a="x;y";data-b=2]||B291');

      expect(svgCode).toContain('data-a="x;y"');
      expect(svgCode).toContain('data-b="2"');
    });

    it('splits an entry at its first =', () => {
      expect(new BlissSVGBuilder('[data-a=b=c]||B291').svgCode).toContain('data-a="b=c"');
    });

    it('trims the padding around a key and its value', () => {
      const builder = new BlissSVGBuilder('[ data-a = b ]||B291');

      expect(builder.svgCode).toContain('data-a="b"');
      expect(builder.toString()).toBe('[data-a=b]||B291');
    });

    it('trims the padding around a bare key', () => {
      // pins the bare key's trim: a space after a `;` is ordinary handwriting,
      // and an untrimmed ` grid` is a refused name, not the grid
      const builder = new BlissSVGBuilder('[color=red; grid ]||B291');

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('[color=red;grid]||B291');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=red;grid]||B291').svgCode);
    });
  });

  describe('when a definition code string carries the key in its own bracket', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
      }
      customCodes.length = 0;
    });

    // Defines one code and remembers it for cleanup, returning define()'s result.
    const defineTracked = (name, definition) => {
      customCodes.push(name);
      return BlissSVGBuilder.define({ [name]: definition });
    };

    it('refuses the definition, as it refuses the name in defaultOptions', () => {
      const result = defineTracked('C15_KEY', { codeString: '[xlink:href=x]B291' });

      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('"xlink:href"');
    });

    it('defines one whose bracket holds a usable name', () => {
      expect(defineTracked('C15_KEY', { codeString: '[data-a=x]B291' }).defined).toEqual(['C15_KEY']);
    });
  });
});
