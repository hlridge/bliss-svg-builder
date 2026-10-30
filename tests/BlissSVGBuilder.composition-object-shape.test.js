/**
 * Pins the one shape a composition object is read in, the shape `toJSON()`
 * writes: a composition `{ groups }`, a word `{ glyphs }`, a character
 * `{ parts }` and a part `{ codeName }`, which may hold `parts` of its own. A
 * list left out is read as empty; a wrong shape is left out and reported with
 * `MALFORMED_ELEMENT`, never thrown.
 *
 * Covers:
 * - A list that is missing, `null` or `undefined`, read as empty in silence at
 *   the composition, a word and a character (`{}` reads as `''`), and as no
 *   parts of its own on a part; the editing methods working afterwards.
 * - An object of another level handed in as the composition or as a word: an
 *   empty unit keeping the object's fields as fields of your own, which
 *   nothing judges.
 * - An entry of a list that is not an element object (a number, a string,
 *   `null`, `undefined`, a list, a function, a symbol): the entry left out,
 *   and an entry of a `parts` list, at any depth, taking its whole character.
 * - A list that is not a list: the word or character holding it left out, a
 *   part's own taking its character, and the composition read with no words,
 *   keeping its options.
 * - The report: one `MALFORMED_ELEMENT` per wrong shape, with the entry's path
 *   in the object as its `source`, kept through an edit.
 * - A composition that is not a plain object (a date, a map), refused with the
 *   constructor's documented error.
 *
 * Does NOT cover:
 * - One object used twice, or inside itself, see
 *   `BlissSVGBuilder.composition-object-references.test.js`.
 * - A function or a symbol in an options bag, as a position or as the key, and
 *   the copy itself, see `BlissSVGBuilder.composition-object-copy.test.js`.
 * - A field the library reads holding a value of the wrong type (`codeName:
 *   5`): backlog row "A composition object field the library reads, holding
 *   the wrong type".
 * - A character with a `codeName` and no parts, which draws nothing but saves
 *   its name: backlog row "A character with a `codeName` and no parts draws
 *   nothing, but the string writes the name".
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const fn = () => 1;
const sym = Symbol('s');
const part = (codeName, extra) => ({ codeName, ...extra });
const character = (...codes) => ({ parts: codes.map((code) => part(code)) });
const word = (...characters) => ({ glyphs: characters });
const b313 = () => word(character('B313'));

const reports = (builder) => builder.warnings.map((w) => [w.code, w.source]);

// A character holding what each judge refuses: a value the options are
// admitted without, and a name the options pass and the transient pass refuse.
const judgedCharacter = () => ({
  parts: [part('B313')],
  options: { onclick: 'x', color: null },
  transientOptions: { onclick: 'x' },
});

describe('BlissSVGBuilder composition object shape', () => {
  describe('when a list is missing', () => {
    it.each([
      ['{}', '', {}],
      ['options alone', '[color=red]||', { options: { color: 'red' } }],
      ['groups: null', '', { groups: null }],
      ['groups: undefined', '', { groups: undefined }],
    ])('reads %s as %j reads, in silence', (_label, dsl, input) => {
      // regression: the root was read as its own word, warning DUPLICATE_KEY
      // three times on one generated key and UNKNOWN_CODE "unknown"
      const builder = new BlissSVGBuilder(input);
      const expected = new BlissSVGBuilder(dsl);
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
      expect(builder.toString()).toBe(dsl);
    });

    it.each([
      ['addGroup', (builder) => builder.addGroup('B431')],
      ['insertGroup', (builder) => builder.insertGroup(0, 'B431')],
      ['addElement', (builder) => builder.addElement('B431')],
    ])('lets %s add the first word', (_method, edit) => {
      // regression: each threw a TypeError reading the missing list's length
      const builder = new BlissSVGBuilder({ options: { color: 'red' } });
      edit(builder);
      expect(builder.toString()).toBe('[color=red]||B431');
    });

    it.each([
      ['no glyphs', {}],
      ['glyphs: null', { glyphs: null }],
      ['glyphs: undefined', { glyphs: undefined }],
    ])("reads a word with %s as the empty word addGroup('') makes", (_label, emptyWord) => {
      const builder = new BlissSVGBuilder({ groups: [emptyWord] });
      const expected = new BlissSVGBuilder();
      expected.addGroup('');
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it.each([
      ['no parts', {}],
      ['parts: null', { parts: null }],
    ])('reads a character with %s as an empty character', (_label, emptyCharacter) => {
      const builder = new BlissSVGBuilder({ groups: [word(emptyCharacter, character('B313'))] });
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON().groups[0].glyphs).toEqual([{ parts: [] }, { parts: [{ codeName: 'B313' }] }]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
    });

    it.each([
      ['parts: null', { parts: null }],
      ['parts: undefined', { parts: undefined }],
    ])('reads a part with %s as the part its code draws', (_label, emptyList) => {
      const builder = new BlissSVGBuilder({ groups: [word({ parts: [part('H', emptyList)] })] });
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON({ deep: true })).toStrictEqual(new BlissSVGBuilder('H').toJSON({ deep: true }));
    });
  });

  describe('when an object of another level is handed in', () => {
    it.each([
      ['a part', { codeName: 'B313' }],
      ['a character', { parts: [part('B313')] }],
      ['a word', { glyphs: [character('B313')] }],
    ])('reads %s given as the composition as an empty one keeping its fields', (_level, input) => {
      // regression: it was read as its own word, warning DUPLICATE_KEY and
      // reporting the known B313 as UNKNOWN_CODE, and every edit then threw
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('').svgCode);
      expect(builder.toString()).toBe('');
      expect(builder.toJSON()).toEqual({ ...input, groups: [], options: {} });
      builder.addGroup('B431');
      expect(builder.toString()).toBe('B431');
    });

    it.each([
      ['a part', { codeName: 'B313' }],
      ['a character', { parts: [part('B313')] }],
    ])('reads %s given as a word as an empty word keeping its fields', (_level, entry) => {
      const builder = new BlissSVGBuilder({ groups: [entry] });
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('').svgCode);
      expect(builder.toString()).toBe('');
      expect(builder.toJSON().groups).toEqual([{ ...entry, glyphs: [] }]);
    });

    it.each([
      ['the composition', () => ({ glyphs: [judgedCharacter()] }), (json) => json.glyphs],
      ['a word', () => ({ groups: [{ glyphs: [], parts: [judgedCharacter()] }] }), (json) => json.groups[0].parts],
      ['a character', () => ({ groups: [word({ parts: [], glyphs: [judgedCharacter()] })] }), (json) => json.groups[0].glyphs[0].glyphs],
    ])('leaves a list of another level on %s unjudged, as a field of your own', (_holder, input, field) => {
      const builder = new BlissSVGBuilder(input());
      expect(builder.warnings).toEqual([]);
      expect(field(builder.toJSON())).toEqual([judgedCharacter()]);
    });
  });

  describe('when an entry of a list is not an element object', () => {
    it.each([
      ['a number as a word', { groups: [5, b313()] }, 'groups[0]'],
      ['a string as a word', { groups: [b313(), 'B431'] }, 'groups[1]'],
      ['null as a word', { groups: [null, b313()] }, 'groups[0]'],
      ['undefined as a word', { groups: [b313(), undefined] }, 'groups[1]'],
      ['a list as a word', { groups: [[character('B431')], b313()] }, 'groups[0]'],
      ['a function as a word', { groups: [fn, b313()] }, 'groups[0]'],
      ['a symbol as a word', { groups: [b313(), sym] }, 'groups[1]'],
      ['a number as a character', { groups: [word(5, character('B313'))] }, 'groups[0].glyphs[0]'],
      ['a function as a character', { groups: [word(character('B313'), fn)] }, 'groups[0].glyphs[1]'],
      ['a symbol as a character', { groups: [word(sym, character('B313'))] }, 'groups[0].glyphs[0]'],
    ])('leaves out %s, reporting it at its path', (_label, input, source) => {
      // regression: the constructor threw a bare TypeError
      const builder = new BlissSVGBuilder(input);
      const expected = new BlissSVGBuilder({ groups: [b313()] });
      expect(reports(builder)).toEqual([['MALFORMED_ELEMENT', source]]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it.each([
      ['a string', { parts: [part('H'), 'C8'] }, 'groups[0].glyphs[1].parts[1]'],
      ['null', { parts: [null, part('C8')] }, 'groups[0].glyphs[1].parts[0]'],
      ['a function', { parts: [part('H'), fn] }, 'groups[0].glyphs[1].parts[1]'],
      ['a symbol', { parts: [sym, part('C8')] }, 'groups[0].glyphs[1].parts[0]'],
      ['a number in a part of its own', { parts: [part('H', { parts: [5] })] }, 'groups[0].glyphs[1].parts[0].parts[0]'],
    ])('leaves out the whole character holding %s as a part', (_label, broken, source) => {
      // note: the parts left could form another character, so the character
      // goes, as it does for a malformed part in the DSL
      const builder = new BlissSVGBuilder({ groups: [word(character('B313'), broken)] });
      const expected = new BlissSVGBuilder({ groups: [b313()] });
      expect(reports(builder)).toEqual([['MALFORMED_ELEMENT', source]]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('when a list is not a list', () => {
    it.each([
      ['a number', 5],
      ['a string', 'B313'],
      ['an object', {}],
      ['a function', fn],
    ])('reads the composition whose words are %s with no words, keeping its options', (_label, groups) => {
      const builder = new BlissSVGBuilder({ groups, options: { color: 'red' } });
      const expected = new BlissSVGBuilder('[color=red]||');
      expect(reports(builder)).toEqual([['MALFORMED_ELEMENT', 'groups']]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
      builder.addGroup('B431');
      expect(builder.toString()).toBe('[color=red]||B431');
    });

    it.each([
      ['a word whose characters are a number', { groups: [b313(), { glyphs: 5 }] }, 'groups[1].glyphs'],
      ['a word whose characters are a string', { groups: [{ glyphs: 'B431' }, b313()] }, 'groups[0].glyphs'],
      ['a character whose parts are an object', { groups: [word(character('B313'), { parts: {} })] }, 'groups[0].glyphs[1].parts'],
      ['the character holding a part whose own parts are a number', { groups: [word(character('B313'), { parts: [part('H', { parts: 5 })] })] }, 'groups[0].glyphs[1].parts[0].parts'],
    ])('leaves out %s, reporting the list at its path', (_label, input, source) => {
      const builder = new BlissSVGBuilder(input);
      const expected = new BlissSVGBuilder({ groups: [b313()] });
      expect(reports(builder)).toEqual([['MALFORMED_ELEMENT', source]]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('when a wrong shape is reported', () => {
    it('reports each wrong shape once by its path, and still after an edit', () => {
      const builder = new BlissSVGBuilder({ groups: [5, word(character('B313'), { parts: [5, 'C8'] })] });
      const expected = [
        ['MALFORMED_ELEMENT', 'groups[0]'],
        ['MALFORMED_ELEMENT', 'groups[1].glyphs[1].parts[0]'],
        ['MALFORMED_ELEMENT', 'groups[1].glyphs[1].parts[1]'],
      ];
      expect(reports(builder)).toEqual(expected);
      builder.addGroup('B431');
      expect(reports(builder)).toEqual(expected);
      expect(builder.toString()).toBe('B313//B431');
    });

    it('reports a wrong shape at each place one object fills, and leaves out each', () => {
      const broken = { glyphs: 5 };
      const builder = new BlissSVGBuilder({ groups: [broken, b313(), broken] });
      expect(reports(builder)).toEqual([
        ['MALFORMED_ELEMENT', 'groups[0].glyphs'],
        ['MALFORMED_ELEMENT', 'groups[2].glyphs'],
      ]);
      expect(builder.toJSON()).toEqual(new BlissSVGBuilder({ groups: [b313()] }).toJSON());
    });

    it.each([
      ['a word', { groups: [5] }, 'groups[0] is not a word (an object with a "glyphs" list), so it is left out.'],
      ['a character', { groups: [word(5)] }, 'groups[0].glyphs[0] is not a character (an object with a "parts" list), so it is left out.'],
      ['a part', { groups: [word({ parts: [5] })] }, 'groups[0].glyphs[0].parts[0] is not a part (an object with a "codeName"), so its character is left out.'],
      ["the composition's words", { groups: 5 }, 'groups is not a list, so the composition is read with no words.'],
      ["a word's characters", { groups: [{ glyphs: 5 }] }, 'groups[0].glyphs is not a list, so the word is left out.'],
      ["a character's parts", { groups: [word({ parts: 5 })] }, 'groups[0].glyphs[0].parts is not a list, so the character is left out.'],
      ["a part's own parts", { groups: [word({ parts: [part('H', { parts: 5 })] })] }, 'groups[0].glyphs[0].parts[0].parts is not a list, so its character is left out.'],
    ])('names what %s should be and what is left out', (_what, input, message) => {
      expect(new BlissSVGBuilder(input).warnings.map((w) => w.message)).toEqual([message]);
    });
  });

  describe('when the composition is not a plain object', () => {
    it.each([
      ['a date', () => new Date(0)],
      ['a map', () => new Map([['groups', [b313()]]])],
    ])('throws the documented error for %s', (_label, input) => {
      // regression: it was read, warning UNKNOWN_CODE "unknown", and a date's
      // toJSON() returned the date's text
      expect(() => new BlissSVGBuilder(input())).toThrow('Input must be a DSL string or a plain object from toJSON()');
    });

    it('reads a class instance as the object it is', () => {
      class Composition {
        constructor() {
          this.groups = [b313()];
        }
      }
      const builder = new BlissSVGBuilder(new Composition());
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B313');
    });
  });
});
