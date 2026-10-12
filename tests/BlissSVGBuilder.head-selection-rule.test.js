import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins one rule for which character heads a word (takes the word's `;;`
 * codes), the same everywhere it is picked: the drawing, the snapshot's
 * crown, `headGlyph()`, the parser's scan and every save. A character is
 * compared with the skip list only when it is one part.
 *
 * Covers:
 * - A skip-list character carrying an indicator of its own heads the word,
 *   and so does one fused with another base part; written bare, it is
 *   skipped. Each in the DSL and as a composition object whose character
 *   names the skip-list code and holds the second part.
 * - The parser's scan before a predefined word that marks its own head
 *   reads such a character as the drawing does, nested too; an unknown code
 *   in a `;` slot is the boundary. A lone skip-list character behind a
 *   bracket stays one part there (the bracket's `;` and a trailing `;` add
 *   none) and is matched by the code it is made of.
 * - A word of skip-list characters only, whose head is picked by priority:
 *   the crown follows the word as written, not the parts its `;;` codes add.
 *
 * Does NOT cover:
 * - The head-scan code of one character, see
 *   `bliss-head-glyph-exclusions.head-scan-code.test.js`.
 * - Priority tiers and the B10/B4 exception, see
 *   `BlissParser.head-glyph-exclusions.test.js`.
 * - The head marker a save writes for a custom glyph the scan skips, and a
 *   word that came in through `merge()`, see
 *   `BlissSVGBuilder.portable-head-marker.test.js`.
 */

const FIXTURES = {
  HS_PAIR: { codeString: 'B303/B451^' },
  HS_PAIRB: { codeString: 'B303/B451' },
  HS_OUTER: { codeString: 'B449;B81/HS_PAIR' },
  HS_DECORATED: { codeString: '[color=red;stroke-width=0.3]B449/HS_PAIR' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// Where the first word's head shows: the character drawn with the word-level
// codes, the one the snapshot crowns, and the one headGlyph() returns.
const headIndexes = (builder) => {
  const glyphs = builder.snapshot().children[0].children;
  return {
    drawn: glyphs.findIndex((glyph) => glyph.children.some((part) => part.indicatorLevel === 'word')),
    crown: glyphs.findIndex((glyph) => glyph.isHeadGlyph),
    handle: glyphs.findIndex((glyph) => glyph.key === builder.group(0).headGlyph().key),
  };
};

// A composition object whose first character names `code` and holds `second`
// as its second part, before B451, with B99 as the word's `;;` code.
const objectNaming = (code, second) => ({
  groups: [{
    glyphs: [
      { codeName: code, parts: [{ codeName: code }, { codeName: second }] },
      { codeName: 'B451', parts: [{ codeName: 'B451' }] },
    ],
    wordIndicators: { codes: ['B99'], stripSemantic: false },
  }],
});

// One assertion set for every surface: the head, both saves, both reloads.
const expectHeadEverywhere = (builder, head, saved, flattened) => {
  expect(headIndexes(builder)).toEqual({ drawn: head, crown: head, handle: head });
  expect(builder.toString()).toBe(saved);
  expect(builder.toString({ flattenIndicators: true })).toBe(flattened);
  expect(new BlissSVGBuilder(builder.toJSON({ flattenIndicators: true })).toString()).toBe(flattened);
  expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
  expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
  expect(builder.warnings).toEqual([]);
};

describe('BlissSVGBuilder head selection rule', () => {
  describe('when a skip-list character is written with a second part', () => {
    it.each([
      ['an indicator of its own', 'B449;B81/B451;;B99', 0, 'B449;B99/B451'],
      ['an indicator of its own ("aboard")', 'B398;B86/B688;;B81', 0, 'B398;B81/B688'],
      ['a second base part', 'B486;B303/B208;;B86', 0, 'B486;B303;B86/B208'],
    ])('heads the word with %s (%s) on every surface', (_label, input, head, flattened) => {
      expectHeadEverywhere(new BlissSVGBuilder(input), head, input, flattened);
    });

    it.each([
      ['B449/B451;;B99', 1, 'B449/B451;B99'],
      ['B398/B243;B86;;B81', 1, 'B398/B243;B81'],
    ])('skips it written bare (%s), on every surface', (input, head, flattened) => {
      // control: "domestic" (B398/B243;B86) carries its indicator on the
      // character after the skip-list one, which the word's code then replaces
      expectHeadEverywhere(new BlissSVGBuilder(input), head, input, flattened);
    });
  });

  describe('when a composition object names a skip-list code on a character of two parts', () => {
    it.each([
      ['an indicator', 'B449', 'B81', 'B449;B81/B451;;B99', 'B449;B99/B451'],
      ['a second base part', 'B486', 'B303', 'B486;B303/B451;;B99', 'B486;B303;B99/B451'],
    ])('heads the word with %s, as its own save reloads it', (_label, code, second, saved, flattened) => {
      // regression: the character's own code was compared with the skip list
      // before its part count, so the object put B99 on B451 while its save
      // reloaded with B99 on the first character (identical on v1.0.0)
      expectHeadEverywhere(new BlissSVGBuilder(objectNaming(code, second)), 0, saved, flattened);
    });
  });

  describe('when a word holds a predefined word that marks its own head', () => {
    it.each([
      ['an indicator', 'B449;B81/HS_PAIR;;B99', 'B449;B81/B303/B451;;B99', 'B449;B99/B303/B451'],
      ['a second base part', 'B486;B303/HS_PAIR;;B99', 'B486;B303/B303/B451;;B99', 'B486;B303;B99/B303/B451'],
      ['an indicator, both inside a predefined word', 'HS_OUTER;;B99', 'B449;B81/B303/B451;;B99', 'B449;B99/B303/B451'],
    ])('heads the word with the skip-list character carrying %s (%s), saved without a marker', (_label, input, saved, flattened) => {
      // regression: the parser's scan read the character by its first code,
      // skipped it, and stopped inside HS_PAIR, whose ^ then took the head;
      // the save wrote that ^ out (identical on v1.0.0)
      expectHeadEverywhere(new BlissSVGBuilder(input), 0, saved, flattened);
    });

    it.each([
      ['B449;B81/HS_PAIRB;;B99', 0, 'B449;B81/B303/B451;;B99', 'B449;B99/B303/B451'],
      ['B449/HS_PAIR;;B99', 2, 'B449/B303/B451^;;B99', 'B449/B303/B451;B99^'],
      ['B486/HS_PAIR;;B99', 2, 'B486/B303/B451^;;B99', 'B486/B303/B451;B99^'],
    ])('places %s as before (control)', (input, head, saved, flattened) => {
      expectHeadEverywhere(new BlissSVGBuilder(input), head, saved, flattened);
    });

    it.each([
      ['a part bracket', '[color=red]>B449/HS_PAIR;;B99', '[color=red]>B449/B303/B451^;;B99', '[color=red]>B449/B303/B451;B99^'],
      ['a part bracket and a trailing `;`', '[color=red]>B449;/HS_PAIR;;B99', '[color=red]>B449/B303/B451^;;B99', '[color=red]>B449/B303/B451;B99^'],
      ['a definition\'s bracket of two options', 'HS_DECORATED;;B99', '[color=red;stroke-width=0.3]B449/B303/B451^;;B99', '[color=red;stroke-width=0.3]B449/B303/B451;B99^'],
    ])('skips a lone skip-list character written with %s, as the drawing does (%s, control)', (_label, input, saved, flattened) => {
      // pins the parser's scan reading the character through its decoration,
      // one row per mutant it kills: the first fails a scan that reads the
      // written text instead of the code the part is made of, the second one
      // that counts the empty segment after a trailing `;`, the third one that
      // counts the `;` inside a definition's bracket (unchanged since v1.0.0)
      expectHeadEverywhere(new BlissSVGBuilder(input), 2, saved, flattened);
    });

    it('reads a character holding an unknown code in a `;` slot as the drawing does (B449;ZZZ/HS_PAIR;;B99)', () => {
      // proposed (Task 1, 2026-10-12): the character holds two parts, so it is
      // not skipped and takes B99, which it draws as nothing, exactly like the
      // written-out B449;ZZZ/B303/B451;;B99 (today HS_PAIR's ^ took the head)
      const builder = new BlissSVGBuilder('B449;ZZZ/HS_PAIR;;B99');
      const writtenOut = new BlissSVGBuilder('B449;ZZZ/B303/B451;;B99');
      expect(headIndexes(builder).crown).toBe(0);
      expect(builder.svgCode).toBe(writtenOut.svgCode);
      expect(builder.toString()).toBe('B449;ZZZ/B303/B451;;B99');
      expect(builder.warnings.map((warning) => warning.code)).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when every character of a word is on the skip list', () => {
    it.each([
      ['B1060/B578;;B99', 'B1060/B578;B99'],
      ['B120/B120;;B99', 'B120/B120;B99'],
      ['B559/B11;;B99', 'B559/B11;B99'],
    ])('crowns the character drawn with the word\'s codes in %s', (input, flattened) => {
      // control: the snapshot reads the parts the word's codes add to the
      // head, so a rule that counts parts must count the word as written, or
      // the crown moves to the first character while B99 is drawn on the last
      expectHeadEverywhere(new BlissSVGBuilder(input), 1, input, flattened);
    });
  });
});
