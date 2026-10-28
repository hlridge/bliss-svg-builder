/**
 * Pins that a space takes no kerning: a kerning value written on or before a
 * TSP/QSP space is dropped with MISPLACED_SPACE_DECORATION on every route, the
 * picture is drawn as if it were never written, and `toString()` and `toJSON()`
 * agree.
 *
 * Covers:
 * - An RK:/AK: marker before a bare space (`B313/AK:10//`), between two word
 *   breaks, and at the start of the input; the report quotes the marker.
 * - A marker before a decorated space (`AK:10/[color=red]QSP`): one report per
 *   written decoration, and none of the one-value-per-character reports.
 * - Kerning in a character bracket on a space, in both key spellings, beside
 *   another option (one bracket, one report), with a value no gap can be, and
 *   inside a two-space run.
 * - An alias whose code string puts a marker before its `//` or before a space
 *   code, and an alias ending in a marker before a written `//`, each against
 *   its written form.
 * - The setters on a space glyph (each key spelling, a value given as text), a
 *   part replaced by a space under a kerned character, and object input.
 * - The kerning report ahead of a part bracket's report, in the order written.
 * - Controls: kerning at word and part scope keeps MISPLACED_KERNING_OPTION; a
 *   marker after a space, before a ZSA, or before a composite led by a space
 *   keeps its kerning; two markers before a space.
 *
 * Does NOT cover:
 * - A kerning marker with nothing after it (`B313/AK:10`): no space follows
 *   it, so it is not a space decoration, see
 *   `BlissSVGBuilder.trailing-kerning.test.js`.
 * - A coordinate or styling option on a space, see
 *   `BlissSVGBuilder.space-decoration.test.js`.
 * - Kerning grammar and kerning between characters, see
 *   `BlissParser.kerning.test.js` and `BlissSVGBuilder.kerning-markers.test.js`.
 * - How far a space advances, see `BlissSVGBuilder.space-glyphs.test.js` and
 *   `BlissSVGBuilder.trailing-space.test.js`.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const SPACE_DECORATION = 'MISPLACED_SPACE_DECORATION';

const codeAndSource = (warning) => ({ code: warning.code, source: warning.source });

// Everything a composition can be read back from: its picture, its string,
// each save loaded again, and whether the saved JSON still holds kerning.
// Comparing two compositions' surfaces asks whether any reader can tell them
// apart.
const surfacesOf = (builder) => ({
  svg: builder.svgCode,
  string: builder.toString(),
  stringReloaded: new BlissSVGBuilder(builder.toString()).svgCode,
  stringReloadWarns: new BlissSVGBuilder(builder.toString()).warnings.map(codeAndSource),
  jsonReloaded: new BlissSVGBuilder(builder.toJSON()).svgCode,
  jsonReloadWarns: new BlissSVGBuilder(builder.toJSON()).warnings.map(codeAndSource),
  jsonAsString: new BlissSVGBuilder(builder.toJSON()).toString(),
  jsonHoldsKerning: /kerning/i.test(JSON.stringify(builder.toJSON())),
});

const word = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });

describe('BlissSVGBuilder space kerning', () => {
  describe('when a kerning marker stands before a bare space', () => {
    it.each([
      ['B313/AK:10//', 'B313//', 'AK:10'],
      ['B313/AK:10//B291', 'B313//B291', 'AK:10'],
      ['B313/RK:3/QSP', 'B313/QSP', 'RK:3'],
      ['B313/RK:3/TSP/B291', 'B313//B291', 'RK:3'],
      ['H//RK:5//C8', 'H///C8', 'RK:5'],
      ['RK:3//B313', '//B313', 'RK:3'],
    ])('drops the marker in %s, reads as %s, and reports %s', (input, plain, source) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: SPACE_DECORATION, source }]);
      expect(builder.warnings[0].message)
        .toBe(`Kerning is the gap before a character, and a space is not one, so "${source}" was dropped.`);
      expect(builder.toString()).toBe(plain);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
    });

    it('reports a marker displaced by a later one, then the survivor before the space', () => {
      const builder = new BlissSVGBuilder('B313/RK:3/RK:4//');
      expect(builder.warnings.map(codeAndSource)).toEqual([
        { code: 'MULTIPLE_KERNING_VALUES', source: 'RK:3' },
        { code: SPACE_DECORATION, source: 'RK:4' },
      ]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313//')));
    });
  });

  describe('when a kerning marker stands before a decorated space', () => {
    it.each([
      ['B313/AK:10/[color=red]QSP', 'B313/QSP', ['AK:10', '[color=red]']],
      ['B313/RK:3/QSP:1,2/B291', 'B313/QSP/B291', ['RK:3', ':1,2']],
      ['B313/RK:3/[relative-kerning=5]QSP', 'B313/QSP', ['RK:3', '[relative-kerning=5]']],
    ])('drops the marker in %s with the decoration, reading as %s', (input, plain, sources) => {
      // The marker is a decoration of its own, so it gets its own report; and
      // since neither value can apply, neither displaces the other.
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource))
        .toEqual(sources.map((source) => ({ code: SPACE_DECORATION, source })));
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
    });
  });

  describe('when a character bracket on a space carries kerning', () => {
    it.each([
      ['B313/[relative-kerning=3]QSP', 'B313/QSP', '[relative-kerning=3]'],
      ['B313/[absolute-kerning=3]QSP', 'B313/QSP', '[absolute-kerning=3]'],
      ['B313/[relativeKerning=3]QSP', 'B313/QSP', '[relative-kerning=3]'],
      ['B313/[relative-kerning=3]TSP/B291', 'B313//B291', '[relative-kerning=3]'],
      ['B313/[relative-kerning=5;color=red]QSP', 'B313/QSP', '[relative-kerning=5;color=red]'],
      ['B313/[relative-kerning=3;preserveAspectRatio=none]QSP', 'B313/QSP', '[relative-kerning=3;preserveAspectRatio=none]'],
      ['B313/[relative-kerning=abc]QSP', 'B313/QSP', '[relative-kerning=abc]'],
    ])('drops the bracket in %s, reads as %s, and reports %s', (input, plain, source) => {
      // One bracket is one report, quoted in the spelling a bracket carries
      // (an attribute name exactly as written), and a value on a space is not
      // judged: `[stroke-width=abc]QSP` is reported the same way.
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: SPACE_DECORATION, source }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
    });

    it('draws a two-space run at its own width, not stretched by the kerning', () => {
      // regression: the second space of the run took the kerning as a gap
      // before itself, widening the picture by a value the string never wrote
      const builder = new BlissSVGBuilder('B313/TSP/[relative-kerning=30]QSP/B313');
      expect(builder.warnings.map(codeAndSource))
        .toEqual([{ code: SPACE_DECORATION, source: '[relative-kerning=30]' }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313//QSP/B313')));
    });
  });

  describe('when an alias puts kerning before a space', () => {
    const FIXTURES = {
      SPACE_KERNING_BREAK: { codeString: 'B313/AK:10//B291' },
      SPACE_KERNING_CODE: { codeString: 'B313/RK:3/QSP' },
      SPACE_KERNING_TAIL: { codeString: 'B313/AK:10' },
    };
    beforeAll(() => BlissSVGBuilder.define(FIXTURES));
    afterAll(() => Object.keys(FIXTURES).forEach((code) => BlissSVGBuilder.removeDefinition(code)));

    it.each([
      ['SPACE_KERNING_BREAK', 'B313/AK:10//B291', 'B313//B291', 'AK:10'],
      ['SPACE_KERNING_CODE', 'B313/RK:3/QSP', 'B313/QSP', 'RK:3'],
      ['SPACE_KERNING_TAIL//B291', 'B313/AK:10//B291', 'B313//B291', 'AK:10'],
    ])('reads %s as its written form %s, both as %s', (aliasInput, written, plain, source) => {
      const fromAlias = new BlissSVGBuilder(aliasInput);
      const fromWritten = new BlissSVGBuilder(written);
      expect(fromAlias.warnings.map(codeAndSource)).toEqual([{ code: SPACE_DECORATION, source }]);
      expect(fromWritten.warnings.map(codeAndSource)).toEqual([{ code: SPACE_DECORATION, source }]);
      expect(surfacesOf(fromAlias)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
      expect(surfacesOf(fromWritten)).toEqual(surfacesOf(fromAlias));
    });
  });

  describe('when the API or object input puts kerning on a space', () => {
    it.each([
      [{ relativeKerning: 3 }, '[relative-kerning=3]'],
      [{ 'relative-kerning': 3 }, '[relative-kerning=3]'],
      [{ absoluteKerning: 3 }, '[absolute-kerning=3]'],
      [{ 'absolute-kerning': 3 }, '[absolute-kerning=3]'],
      // a value given as text, a malformed one too, takes the space's report as
      // the bracket spelling does, never MALFORMED_KERNING_VALUE
      [{ relativeKerning: '3' }, '[relative-kerning=3]'],
      [{ 'absolute-kerning': 'abc' }, '[absolute-kerning=abc]'],
    ])('drops %o set on a space glyph and reports %s', (options, source) => {
      const builder = new BlissSVGBuilder('B313//B291');
      builder.element(1).glyph(0).setOptions(options);
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: SPACE_DECORATION, source }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313//B291')));
    });

    it('drops the kerning a character keeps when its part is replaced by a space', () => {
      const builder = new BlissSVGBuilder('B313/RK:3/B291');
      builder.glyph(1).part(0).replace('QSP');
      expect(builder.warnings.map(codeAndSource))
        .toEqual([{ code: SPACE_DECORATION, source: '[relative-kerning=3]' }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313/QSP')));
    });

    it('drops kerning on a space glyph in object input', () => {
      const builder = new BlissSVGBuilder({ groups: [
        word('B313'),
        { glyphs: [{ parts: [{ codeName: 'TSP' }], options: { relativeKerning: 3 } }] },
        word('B291'),
      ] });
      expect(builder.warnings.map(codeAndSource))
        .toEqual([{ code: SPACE_DECORATION, source: '[relative-kerning=3]' }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313//B291')));
    });
  });

  describe('when a part bracket reports beside the kerning', () => {
    it.each([
      ['B313/RK:3/[grid]>QSP', [[SPACE_DECORATION, 'RK:3'], ['MISPLACED_GLOBAL_OPTION', 'grid']]],
      ['B313/RK:3/[relative-kerning=5][grid]>B291', [['MULTIPLE_KERNING_VALUES', 'RK:3'], ['MISPLACED_GLOBAL_OPTION', 'grid']]],
    ])('reports the kerning in %s before the part bracket, in the order written', (input, reports) => {
      // pins the held-back part reports: the parts are read first, to learn
      // whether the character is a space, and reporting as they were read put
      // the part bracket ahead of the kerning written before it
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource))
        .toEqual(reports.map(([code, source]) => ({ code, source })));
    });
  });

  describe('when kerning on a space is written at a scope kerning has no home in', () => {
    it.each([
      ['[relative-kerning=3]|TSP', '//'],
      ['B313/[relative-kerning=3]>QSP', 'B313/QSP'],
    ])('reports %s by its scope, not as a space decoration', (input, plain) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource))
        .toEqual([{ code: 'MISPLACED_KERNING_OPTION', source: 'relative-kerning=3' }]);
      expect(builder.toString()).toBe(plain);
    });
  });

  describe('when the kerning lands on content beside a space', () => {
    it.each([
      ['B313//AK:10/B291'],
      ['B313/RK:3/ZSA'],
    ])('keeps the marker in %s on the content after it', (input) => {
      // note: ZSA is inkless content, not a space, so it takes kerning
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
      expect(JSON.stringify(builder.toJSON())).toMatch(/Kerning/);
    });

    it('keeps the marker on a composite whose first part is a space', () => {
      // The space part is dropped from the character (MISPLACED_SPACE), and
      // what remains is content, so the marker kerns it.
      const builder = new BlissSVGBuilder('B313/RK:3/TSP;B81');
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: 'MISPLACED_SPACE', source: 'TSP' }]);
      expect(builder.toString()).toBe('B313/RK:3/B81');
    });
  });
});
