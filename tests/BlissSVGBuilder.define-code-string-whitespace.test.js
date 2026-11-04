import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins a definition's code string read as an input string is read: the
 * whitespace outside its option brackets and text blocks is dropped before the
 * code string is judged and stored, in define() and patchDefinition(), with
 * nothing reported, as an input string reports nothing.
 *
 * Covers:
 * - Whitespace before, after and inside a code string (around `;` and `/`,
 *   before a coordinate, between a bracket and its `>`, a newline and a tab),
 *   on a bare alias, a typed glyph and a typed shape: stored without it, and
 *   every use (alone, as a character, as a part) drawing, saving and
 *   reporting as the same definition written without it.
 * - Whitespace inside a quoted bracket value, kept.
 * - A code string that reads as a `;;` once its whitespace is dropped
 *   (`B313; ;B86`), refused as `B313;;B86` is.
 * - patchDefinition() reading a new code string the same way.
 * - The definition or patch otherwise read as given: a class instance keeps
 *   the getPath it inherits (define and patch), a code string its class
 *   computes is read, and a frozen definition is read.
 *
 * Does NOT cover:
 * - A whitespace-only code string (refused) and a getPath shape given one
 *   (accepted), see `BlissSVGBuilder.define.test.js`.
 * - Other parts the definition reader cannot read (`B291;!`, a quoted `]`),
 *   backlog row "`define()` accepts a code string holding a part the reader
 *   cannot take for a code at all".
 */
describe('BlissSVGBuilder define code string whitespace', () => {
  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
    }
    customCodes.length = 0;
  });

  const defineTracked = (definitions, options) => {
    customCodes.push(...Object.keys(definitions));
    return BlissSVGBuilder.define(definitions, options);
  };

  const definitionOf = (type, codeString) => (type === 'bare' ? { codeString } : { type, codeString });

  // What each use of the name draws, saves and reports.
  const usesOf = (name) => [name, `B291/${name}`, `B291;${name}`].map((input) => {
    const builder = new BlissSVGBuilder(input);
    return { svg: builder.svgCode, text: builder.toString(), reports: builder.warnings.map((w) => [w.code, w.source]) };
  });

  describe('when a code string holds whitespace outside its brackets', () => {
    it.each([
      ['bare', ' B313', 'B313'],
      ['bare', 'B313 ', 'B313'],
      ['bare', 'B313; C8', 'B313;C8'],
      ['bare', 'B313;\n\tC8', 'B313;C8'],
      ['bare', 'B313 / B291', 'B313/B291'],
      ['bare', '[color=red] >B313', '[color=red]>B313'],
      ['bare', 'B313 :1,0', 'B313:1,0'],
      ['glyph', ' B313;C8', 'B313;C8'],
      ['shape', ' HL8; VL8 ', 'HL8;VL8'],
      // re-pinned 2026-11-04 from define-readable-code-string's refusals: a
      // space inside a coordinate failed every use while it was kept
      ['shape', 'C8: 1', 'C8:1'],
    ])('stores the %s code string %j as %j, with nothing reported', (type, written, read) => {
      // regression: the whitespace was kept, so every use failed as an unknown code
      const result = defineTracked({ WS_CODE: definitionOf(type, written) });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(BlissSVGBuilder.getDefinition('WS_CODE').codeString).toBe(read);
    });

    it.each([
      ['bare', ' B313', 'B313'],
      ['bare', 'B313;\n\tC8', 'B313;C8'],
      ['bare', 'B313 / B291', 'B313/B291'],
      ['bare', '[color=red] >B313', '[color=red]>B313'],
      ['bare', 'B313 :1,0', 'B313:1,0'],
      ['glyph', ' B313;C8', 'B313;C8'],
      ['shape', ' HL8; VL8 ', 'HL8;VL8'],
      ['shape', 'C8: 1', 'C8:1'],
    ])('draws every use of the %s code string %j as the one written %j', (type, written, read) => {
      defineTracked({ WS_CODE: definitionOf(type, written) });
      const padded = usesOf('WS_CODE');
      BlissSVGBuilder.define({ WS_CODE: definitionOf(type, read) }, { overwrite: true });
      expect(padded).toEqual(usesOf('WS_CODE'));
    });
  });

  describe('when whitespace stands inside a quoted bracket value', () => {
    it('keeps it in the value', () => {
      // pins the brackets kept whole: only the whitespace outside them is dropped
      defineTracked({ WS_NOTE: { codeString: '[data-note="a b"] >B313' } });
      expect(BlissSVGBuilder.getDefinition('WS_NOTE').codeString).toBe('[data-note="a b"]>B313');
    });
  });

  describe('when the code string reads as a word indicator list once its whitespace is dropped', () => {
    it('refuses B313; ;B86 as it refuses B313;;B86', () => {
      const result = defineTracked({ WS_LIST: { codeString: 'B313; ;B86' } });
      expect(result.defined).toEqual([]);
      expect(result.errors).toEqual([expect.stringContaining('a definition cannot contain a word-level indicator (";;")')]);
    });
  });

  describe('when patchDefinition() is given a code string holding whitespace', () => {
    it('stores it without the whitespace and draws it', () => {
      defineTracked({ WS_PATCH: { codeString: 'B313' } });
      BlissSVGBuilder.patchDefinition('WS_PATCH', { codeString: ' B291 ' });
      expect(BlissSVGBuilder.getDefinition('WS_PATCH').codeString).toBe('B291');
      const builder = new BlissSVGBuilder('B313/WS_PATCH');
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B313/B291');
    });
  });

  describe('when the definition is a class instance or a frozen object', () => {
    // A shape keeps its getPath over a code string, so the code string beside
    // the inherited method is never drawn.
    class Stroke {
      type = 'shape';
      width = 8;
      height = 8;
      constructor(codeString) { this.codeString = codeString; }
      getPath() { return 'M0,0L8,8'; }
    }

    it.each(['C8', ' C8 ', ''])('draws the getPath its class carries beside the code string %j', (codeString) => {
      // regression: the copy made to read the code string kept only own properties, losing the inherited getPath
      const result = defineTracked({ WS_CLASS: new Stroke(codeString) });
      expect(result.errors).toEqual([]);
      expect(new BlissSVGBuilder('WS_CLASS').svgCode).toContain('d="M0,0L8,8"');
    });

    it('reads a code string its class computes', () => {
      // pins the copy defining its code string: assigned, it met the inherited getter and threw
      class Word { get codeString() { return ' B313 / B291 '; } }
      defineTracked({ WS_COMPUTED: new Word() });
      expect(BlissSVGBuilder.getDefinition('WS_COMPUTED').codeString).toBe('B313/B291');
    });

    it('reads the code string of a frozen definition', () => {
      defineTracked({ WS_FROZEN: Object.freeze({ codeString: ' B313 ' }) });
      expect(BlissSVGBuilder.getDefinition('WS_FROZEN').codeString).toBe('B313');
    });

    it('refuses a shape patch whose class carries a getPath beside the code string', () => {
      // regression: the patch was read through the same own-properties copy, so the getPath went unseen
      class Redraw { codeString = ' HL8 '; getPath() { return 'M0,0L8,8'; } }
      defineTracked({ WS_PATCH_SHAPE: { type: 'shape', codeString: 'C8' } });
      expect(() => BlissSVGBuilder.patchDefinition('WS_PATCH_SHAPE', new Redraw()))
        .toThrow('a shape is drawn either by its getPath function or by its codeString');
      expect(BlissSVGBuilder.getDefinition('WS_PATCH_SHAPE').codeString).toBe('C8');
    });
  });
});
