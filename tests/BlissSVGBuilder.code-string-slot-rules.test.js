import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a composition object naming a definition reads the definition's
 * code string by the part-slot rules a string naming it is read by, so a
 * `preserve` JSON reloads to the picture, the reports and the saves of the
 * string it was saved from, alone and as a part.
 *
 * Covers:
 * - A character bracket in a later part, one or two, and behind an empty
 *   option region: dropped and reported (MISPLACED_CHARACTER_OPTION).
 * - An empty option region leading a later part (`B291;>B313`), read past.
 * - A second part bracket on a part, in the first slot or a later one
 *   (MULTIPLE_OPTION_BRACKETS).
 * - An empty first part, which leaves a bracket after it in a later slot.
 * - Typed glyphs and shapes, a definition one deeper, a bare alias of several
 *   codes named as a part, a composition object written by hand, and merge()
 *   expanding a definition made after the builder it merges.
 * - A run of outlined letters in a later part (`Xab`, `XTXT_ab`): a word,
 *   reported as the string reports it rather than drawn as text.
 * - Controls that reloaded as drawn already: a letter, a text letter, a
 *   routing key, a part bracket placing its part.
 *
 * Does NOT cover:
 * - The same spellings written in a string, or baked in a definition a string
 *   names, see `BlissParser.part-slot-char-option.test.js`.
 * - A part bracket holding a quoted `]`, which a string naming the definition
 *   fails too (backlog "Definition-reference hygiene nits").
 * - The default `toJSON()`, which spells a custom part out and so names no
 *   definition; a run of letters it writes reloads as text (backlog "Object
 *   input does not apply DSL X-run shorthand").
 * - A key a part bracket cannot act on, see
 *   `BlissSVGBuilder.definition-scope-admission.test.js`.
 */

const DEFINITIONS = {
  RS_TITLE: { type: 'glyph', codeString: 'B291;[title=x]B313' },
  RS_RED: { type: 'glyph', codeString: 'B291;[color=red]B313' },
  RS_RED_BLUE: { type: 'glyph', codeString: 'B291;[color=red][fill=blue]B313' },
  RS_REGION_RED: { type: 'glyph', codeString: 'B291;>[color=red]B313' },
  RS_SHAPE_RED: { type: 'shape', codeString: 'HL8;[color=red]VL8' },
  RS_DEEPER: { type: 'glyph', codeString: 'B313;RS_RED' },
  RS_REGION: { type: 'glyph', codeString: 'B291;>B313' },
  RS_SHAPE_REGION: { type: 'shape', codeString: 'HL8;>VL8' },
  RS_PLAIN: { type: 'glyph', codeString: 'B291;B313' },
  RS_SHAPE_PLAIN: { type: 'shape', codeString: 'HL8;VL8' },
  RS_LATER_TWO: { type: 'glyph', codeString: 'B291;[color=red]>[fill=blue]>B313' },
  RS_FIRST_TWO: { type: 'glyph', codeString: '[color=red]>[fill=blue]>B291;B313' },
  RS_SHAPE_FIRST_TWO: { type: 'shape', codeString: '[color=red]>[color=blue]>HL8;VL8' },
  RS_EMPTY_FIRST: { type: 'glyph', codeString: ';[color=red]B86', isIndicator: true },
  RS_ALIAS_EMPTY_FIRST: { codeString: ';[color=red]B86' },
  RS_ALIAS_RED: { codeString: 'B291;[color=red]B313' },
  RS_RUN: { type: 'glyph', codeString: 'B291;Xab' },
  RS_KEY_RUN: { type: 'glyph', codeString: 'B291;XTXT_ab' },
  RS_LETTER: { type: 'glyph', codeString: 'B291;Xa' },
  RS_TEXT_LETTER: { type: 'glyph', codeString: 'B291;Xλ' },
  RS_KEY: { type: 'glyph', codeString: 'B291;XTXT_λ' },
  RS_PLACED: { type: 'glyph', codeString: 'B291;[x=2]>B313' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(DEFINITIONS);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(DEFINITIONS));
});

afterAll(() => {
  for (const code of [...Object.keys(DEFINITIONS), 'RS_LATE']) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
});

// The builder a `preserve` JSON of `input` reloads to.
const fromPreserveJson = (input) => new BlissSVGBuilder(new BlissSVGBuilder(input).toJSON({ preserve: true }));
const reportsOf = (builder) => builder.warnings.map(({ code, source }) => [code, source]);
const codesOf = (builder) => builder.warnings.map(({ code }) => code);

describe('BlissSVGBuilder code string slot rules', () => {
  describe('when a later part of a code string wears a character bracket', () => {
    it.each([
      'RS_TITLE', 'B313;RS_TITLE',
      'RS_RED', 'B313;RS_RED',
      'RS_RED_BLUE', 'B313;RS_RED_BLUE',
      'RS_REGION_RED', 'B313;RS_REGION_RED',
      'RS_SHAPE_RED', 'B313;RS_SHAPE_RED',
      'RS_DEEPER', 'B291;RS_DEEPER',
    ])('reloads %s from its preserve JSON as the string draws, reports and saves it', (input) => {
      const written = new BlissSVGBuilder(input);
      const reloaded = fromPreserveJson(input);
      expect(codesOf(written)).toContain('MISPLACED_CHARACTER_OPTION');
      expect(reloaded.svgCode).toBe(written.svgCode);
      expect(reportsOf(reloaded)).toEqual(reportsOf(written));
      expect(reloaded.toString()).toBe(written.toString());
      expect(reloaded.toString({ preserve: true })).toBe(input);
    });
  });

  describe('when a later part of a code string is led by an empty option region', () => {
    it.each([
      ['RS_REGION', 'RS_PLAIN'],
      ['B313;RS_REGION', 'B313;RS_PLAIN'],
      ['RS_SHAPE_REGION', 'RS_SHAPE_PLAIN'],
      ['B313;RS_SHAPE_REGION', 'B313;RS_SHAPE_PLAIN'],
    ])('reloads %s from its preserve JSON drawn as %s, silently', (input, twin) => {
      const reloaded = fromPreserveJson(input);
      expect(new BlissSVGBuilder(input).svgCode).toBe(new BlissSVGBuilder(twin).svgCode);
      expect(reloaded.svgCode).toBe(new BlissSVGBuilder(twin).svgCode);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.toString({ preserve: true })).toBe(input);
    });
  });

  describe('when a part of a code string wears two part brackets', () => {
    it.each([
      'RS_LATER_TWO', 'B313;RS_LATER_TWO',
      'RS_FIRST_TWO', 'B313;RS_FIRST_TWO',
      'RS_SHAPE_FIRST_TWO', 'B313;RS_SHAPE_FIRST_TWO',
    ])('reloads %s from its preserve JSON with the first bracket applied and the second reported', (input) => {
      const written = new BlissSVGBuilder(input);
      const reloaded = fromPreserveJson(input);
      expect(codesOf(written)).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(reloaded.svgCode).toBe(written.svgCode);
      expect(reportsOf(reloaded)).toEqual(reportsOf(written));
      expect(reloaded.toString({ preserve: true })).toBe(input);
    });
  });

  describe('when an empty first part leaves a character bracket in a later slot', () => {
    // note: the slot is counted on the raw `;` split, so `;[color=red]B86`
    // puts the bracket in a later slot although B86 is the first real part
    it.each([
      'RS_EMPTY_FIRST', 'B313;RS_EMPTY_FIRST', 'B313;RS_ALIAS_EMPTY_FIRST',
    ])('reloads %s from its preserve JSON with the bracket reported as misplaced', (input) => {
      const written = new BlissSVGBuilder(input);
      const reloaded = fromPreserveJson(input);
      expect(codesOf(written)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(reloaded.svgCode).toBe(written.svgCode);
      expect(reportsOf(reloaded)).toEqual(reportsOf(written));
    });
  });

  describe('when a bare alias of several codes is named as a later part', () => {
    it('reports the misplaced bracket in its code string on reload, beside the composite part', () => {
      const written = new BlissSVGBuilder('B313;RS_ALIAS_RED');
      const reloaded = fromPreserveJson('B313;RS_ALIAS_RED');
      expect(codesOf(written)).toEqual(['MISPLACED_CHARACTER_OPTION', 'COMPOSITE_AS_PART']);
      expect(reportsOf(reloaded)).toEqual(reportsOf(written));
      expect(reloaded.svgCode).toBe(written.svgCode);
    });
  });

  describe('when a later part of a code string holds a run of outlined letters', () => {
    // note: `XTXT_ab` names letters that all have outlines, so a slot reads it
    // as the run `Xab`, a word, which cannot be a part. These rows also pin
    // that a composition object's codes are read before its definitions are
    // expanded; read after, the run became a text glyph that drew
    // (killed mutant, C30 Task 3b)
    it.each([
      'RS_RUN', 'B313;RS_RUN', 'RS_KEY_RUN', 'B313;RS_KEY_RUN',
    ])('reloads %s from its preserve JSON reporting the word, not drawing it as text', (input) => {
      const written = new BlissSVGBuilder(input);
      const reloaded = fromPreserveJson(input);
      expect(codesOf(written)).toEqual(['WORD_AS_PART']);
      expect(reportsOf(reloaded)).toEqual(reportsOf(written));
      expect(reloaded.svgCode).toBe(written.svgCode);
      expect(reloaded.svgCode).not.toContain('<text');
    });
  });

  describe('when a composition object names the definition', () => {
    it('reads a definition written by hand as a later part as the string naming it does', () => {
      const fromObject = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, { codeName: 'RS_RED' }] }] }] });
      const written = new BlissSVGBuilder('B313;RS_RED');
      expect(fromObject.svgCode).toBe(written.svgCode);
      expect(reportsOf(fromObject)).toEqual([['MISPLACED_CHARACTER_OPTION', '[color=red]B313']]);
      expect(reportsOf(fromObject)).toEqual(reportsOf(written));
    });

    it('reads a definition made after the merged builder was built as the string naming it does', () => {
      const other = new BlissSVGBuilder('B313;RS_LATE');
      BlissSVGBuilder.define({ RS_LATE: { type: 'shape', codeString: 'HL8;[color=red]VL8' } });
      const target = new BlissSVGBuilder('B291');
      target.merge(other);
      const written = new BlissSVGBuilder('B291//B313;RS_LATE');
      expect(target.svgCode).toBe(written.svgCode);
      expect(reportsOf(target)).toEqual([['MISPLACED_CHARACTER_OPTION', '[color=red]VL8']]);
      expect(reportsOf(target)).toEqual(reportsOf(written));
    });
  });

  describe('when a later part holds a letter or a placed part', () => {
    it.each([
      'RS_LETTER', 'B313;RS_LETTER',
      'RS_TEXT_LETTER', 'B313;RS_TEXT_LETTER',
      'RS_KEY', 'B313;RS_KEY',
      'RS_PLACED', 'B313;RS_PLACED',
    ])('reloads %s from its preserve JSON as the string draws and saves it, silently', (input) => {
      const written = new BlissSVGBuilder(input);
      const reloaded = fromPreserveJson(input);
      expect(written.warnings).toEqual([]);
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(written.svgCode);
      expect(reloaded.toString()).toBe(written.toString());
      expect(reloaded.toString({ preserve: true })).toBe(input);
    });
  });
});
