/**
 * Pins that a kerning marker with no character after it is dropped with
 * MISPLACED_KERNING_OPTION: it has no gap to set, so the picture, the string
 * and the saved JSON are those of the input without it.
 *
 * Covers:
 * - An RK:/AK: marker ending the input: after a character, alone, in the last
 *   word, behind word and global options, and before a trailing `/`; the
 *   report quotes the marker as written, an explicit zero included.
 * - Two markers at the end: the displaced one keeps MULTIPLE_KERNING_VALUES,
 *   the last one written is reported here.
 * - An alias whose code string ends in a marker, used last, against its
 *   written form; used before a character, the marker kerns it.
 * - A code ending in a marker handed to an editing method (`addGroup`,
 *   `replace`), reported as the string reports it.
 * - Controls: a bare marker (`RK`) is absent and ends the input in silence; a
 *   marker before a character keeps its kerning.
 *
 * Does NOT cover:
 * - A marker before a space, see `BlissSVGBuilder.space-kerning.test.js`.
 * - Kerning held by an empty character (`B313/AK:10/[]`,
 *   `B313/[relative-kerning=3]`), which is written out as a bare marker: open
 *   (backlog: kerning held by an empty character).
 * - Kerning grammar, see `BlissParser.kerning.test.js`; bare markers between
 *   characters, see `BlissSVGBuilder.kerning-markers.test.js`.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const MISPLACED_KERNING = 'MISPLACED_KERNING_OPTION';

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

describe('BlissSVGBuilder trailing kerning', () => {
  describe('when a kerning marker ends the input', () => {
    it.each([
      ['B313/AK:10', 'B313', 'AK:10'],
      ['B313/RK:+.5', 'B313', 'RK:+.5'],
      ['B313/AK:0', 'B313', 'AK:0'],
      ['RK:3', '', 'RK:3'],
      ['B313//B291/AK:10', 'B313//B291', 'AK:10'],
      ['H//RK:5', 'H//', 'RK:5'],
      ['[color=red]|B313/AK:10', '[color=red]|B313', 'AK:10'],
      ['[margin=0]||B313/RK:3', '[margin=0]||B313', 'RK:3'],
      ['B313/AK:10/', 'B313', 'AK:10'],
    ])('drops the marker in %s, reads as %s, and reports %s', (input, plain, source) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: MISPLACED_KERNING, source }]);
      expect(builder.warnings[0].message)
        .toBe(`Kerning is the gap before a character, and no character follows "${source}", so it was dropped.`);
      expect(builder.toString()).toBe(plain);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
    });

    it('reports a marker displaced by a later one, then the last one written', () => {
      const builder = new BlissSVGBuilder('B313/RK:3/RK:4');
      expect(builder.warnings.map(codeAndSource)).toEqual([
        { code: 'MULTIPLE_KERNING_VALUES', source: 'RK:3' },
        { code: MISPLACED_KERNING, source: 'RK:4' },
      ]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder('B313')));
    });
  });

  describe('when an alias ends in a kerning marker', () => {
    const FIXTURES = {
      TRAILING_KERNING_WORD: { codeString: 'B313/AK:10' },
      TRAILING_KERNING_MARKER: { codeString: 'RK:3' },
    };
    beforeAll(() => BlissSVGBuilder.define(FIXTURES));
    afterAll(() => Object.keys(FIXTURES).forEach((code) => BlissSVGBuilder.removeDefinition(code)));

    it.each([
      ['TRAILING_KERNING_WORD', 'B313/AK:10', 'B313', 'AK:10'],
      ['B313/TRAILING_KERNING_MARKER', 'B313/RK:3', 'B313', 'RK:3'],
    ])('reads %s used last as its written form %s, both as %s', (aliasInput, written, plain, source) => {
      const fromAlias = new BlissSVGBuilder(aliasInput);
      const fromWritten = new BlissSVGBuilder(written);
      expect(fromAlias.warnings.map(codeAndSource)).toEqual([{ code: MISPLACED_KERNING, source }]);
      expect(fromWritten.warnings.map(codeAndSource)).toEqual([{ code: MISPLACED_KERNING, source }]);
      expect(surfacesOf(fromAlias)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
      expect(surfacesOf(fromWritten)).toEqual(surfacesOf(fromAlias));
    });

    it.each([
      ['TRAILING_KERNING_WORD/B291', 'B313/AK:10/B291'],
      ['TRAILING_KERNING_MARKER/B291', 'RK:3/B291'],
    ])('keeps the marker in %s on the character after it, as %s', (aliasInput, written) => {
      const builder = new BlissSVGBuilder(aliasInput);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(written);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(written)));
    });
  });

  describe('when an editing method is handed a code ending in a kerning marker', () => {
    it.each([
      ['addGroup', (builder) => builder.addGroup('B291/AK:4'), 'B313//B291', 'AK:4'],
      ['replace', (builder) => builder.glyph(0).replace('B291/RK:2'), 'B291', 'RK:2'],
    ])('reports the marker %s was handed, as the string reports it', (_method, edit, plain, source) => {
      const builder = new BlissSVGBuilder('B313');
      edit(builder);
      expect(builder.warnings.map(codeAndSource)).toEqual([{ code: MISPLACED_KERNING, source }]);
      expect(surfacesOf(builder)).toEqual(surfacesOf(new BlissSVGBuilder(plain)));
    });
  });

  describe('when the marker is bare or a character follows it', () => {
    it.each([
      ['B313/RK', 'B313'],
      ['B313/AK', 'B313'],
      ['B313/AK:10/B291', 'B313/AK:10/B291'],
    ])('reports nothing for %s, which reads as %s', (input, plain) => {
      // note: a bare marker holds no value, so there is nothing to drop
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(plain);
    });
  });
});
