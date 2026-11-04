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
});
