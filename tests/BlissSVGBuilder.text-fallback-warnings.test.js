import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a warning about a letter or run drawn as text names it the way it
 * was written, in the X notation, never by the internal name (`XTXT_…`) the
 * parser reads it under.
 *
 * Covers:
 * - A position that cannot be read (MALFORMED_COORDINATES) on a letter or run
 *   drawn as text, alone, in a word, behind a character or part option, after a
 *   kerning marker, before a `;;`, and added through the mutation API.
 * - A part after such a letter that cannot be read (UNKNOWN_CODE).
 * - A misplaced head marker (MISPLACED_HEAD_MARKER), the fix the message
 *   suggests included, behind each kind of option bracket.
 * - A `;;` that is not the last part of a word holding such letters
 *   (MALFORMED_WORD_INDICATOR), with one or two of them in the word.
 * - Letters that merge into one text glyph (`Xa/Xλ`), named as the run.
 * - A bare alias holding such a letter, reported where it is used.
 * - The text around such a letter quoted unchanged: an option value holding
 *   the internal name's letters, and a code that merely contains them.
 * - No warning on any of a grid of such inputs naming the internal name.
 *
 * Does NOT cover:
 * - What a letter drawn as text draws, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 * - The X notation's grammar, see `BlissParser.x-codes.test.js`.
 * - The internal name on snapshots and in the saves, see
 *   `BlissElement.codename-contract.test.js`.
 * - The written `source` of codes that are not drawn as text (`B291:abc`), see
 *   `BlissSVGBuilder.malformed-part-source.test.js`.
 * - A malformed position on a run of outlined letters (`Xab:abc`), reported on
 *   its last letter (`Xb:abc`): the run is read as its letters and the
 *   position binds the last one (backlog row "A malformed position on a run
 *   of outlined letters...").
 */

const MALFORMED_POSITIONS = [
  ['Xλ:abc', 'Xλ:abc'],
  ['Xhαllo:abc', 'Xhαllo:abc'],
  ['XAnna-Karin:abc', 'XAnna-Karin:abc'],
  ['Xpiǎ:abc', 'Xpiǎ:abc'],
  ['Xλ:1,2,3', 'Xλ:1,2,3'],
  ['B313/Xλ:abc', 'Xλ:abc'],
  ['B313//Xhαllo:abc', 'Xhαllo:abc'],
  ['[color=red]Xλ:abc', 'Xλ:abc'],
  ['[color=red]>Xλ:abc', 'Xλ:abc'],
  ['RK:2/Xλ:abc', 'Xλ:abc'],
  ['Xλ:abc;;B81', 'Xλ:abc'],
];

const MISPLACED_HEAD_MARKERS = [
  ['Xλ^;B81', 'Xλ^;B81', 'Xλ;B81^'],
  ['Xhαllo^;B81', 'Xhαllo^;B81', 'Xhαllo;B81^'],
  ['[color=red]Xλ^;B81', '[color=red]Xλ^;B81', '[color=red]Xλ;B81^'],
  ['[color=red]>Xλ^;B81', '[color=red]>Xλ^;B81', '[color=red]>Xλ;B81^'],
  ['>Xλ^;B81', '>Xλ^;B81', '>Xλ;B81^'],
];

const MISPLACED_WORD_INDICATORS = [
  ['Xλ;;B81/B313', 'Xλ;;B81/B313'],
  ['B313/Xλ;;B81/B313', 'B313/Xλ;;B81/B313'],
  ['Xλ/B313/Xμ;;B81/B313', 'Xλ/B313/Xμ;;B81/B313'],
  ['Xhαllo;;B81;;B86', 'Xhαllo;;B81;;B86'],
];

const TEXT_BASES = ['Xλ', 'Xhαllo', 'XAnna-Karin', 'Xa/Xλ', '[color=red]Xλ', '[color=red]>Xλ'];
const BROKEN_DECORATIONS = [':abc', '^;B81', '^:abc', '^^', ';;B81/B313', ';;B81;;B86', ':1,2^;B81'];
const DECORATED_TEXT_INPUTS = TEXT_BASES.flatMap((base) => BROKEN_DECORATIONS.map((decoration) => base + decoration));

const FIXTURES = {
  TEXT_HEAD_LATE: { codeString: 'Xλ^;B81' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const warningsOf = (input) => new BlissSVGBuilder(input).warnings;
// Each warning as [code, source], so a row fails on either.
const reported = (warnings) => warnings.map((w) => [w.code, w.source]);

describe('BlissSVGBuilder text-fallback warnings', () => {
  describe('when a letter or run drawn as text has a position that cannot be read', () => {
    it.each(MALFORMED_POSITIONS)('reports %s with the source %s, quoted in the message', (input, source) => {
      expect(warningsOf(input)).toEqual([
        { code: 'MALFORMED_COORDINATES', message: `Invalid format: ${source}`, source },
      ]);
    });

    it('reports the run as written when the mutation API adds it', () => {
      const builder = new BlissSVGBuilder('B313');
      builder.addGlyph('Xhαllo:abc');
      expect(reported(builder.warnings)).toEqual([['MALFORMED_COORDINATES', 'Xhαllo:abc']]);
    });
  });

  describe('when a part after a letter drawn as text cannot be read', () => {
    it('reports Xλ^:abc as written, quoted in the message', () => {
      expect(warningsOf('Xλ^:abc')).toEqual([
        { code: 'UNKNOWN_CODE', message: 'Unknown or invalid code: "Xλ^:abc"', source: 'Xλ^:abc' },
      ]);
    });

    it('reports the part a doubled head marker leaves on a run as the run', () => {
      expect(reported(warningsOf('Xhαllo^^'))).toEqual([['UNKNOWN_CODE', 'Xhαllo^']]);
    });
  });

  describe('when a letter drawn as text carries a head marker before its indicator', () => {
    it.each(MISPLACED_HEAD_MARKERS)('reports %s as %s and suggests %s', (input, source, fix) => {
      expect(warningsOf(input)).toEqual([{
        code: 'MISPLACED_HEAD_MARKER',
        message: `Head marker (^) ignored on "${source}": it must mark the end of a character, after its indicators (e.g. "${fix}"), not the base before them.`,
        source,
      }]);
    });

    it('reports a bare alias holding one with the code string as defined', () => {
      expect(reported(warningsOf('B313/TEXT_HEAD_LATE'))).toEqual([['MISPLACED_HEAD_MARKER', 'Xλ^;B81']]);
    });
  });

  describe('when a word holding letters drawn as text has a ;; that is not its last part', () => {
    it.each(MISPLACED_WORD_INDICATORS)('reports %s with the word %s, quoted in the message', (input, source) => {
      expect(warningsOf(input)).toEqual([{
        code: 'MALFORMED_WORD_INDICATOR',
        message: `Malformed word-level indicator in "${source}": ;; must be the trailing part of a word.`,
        source,
      }]);
    });
  });

  describe('when single letters merge into one text glyph', () => {
    // note: Xa/Xλ is read as the run Xaλ, one glyph, so the position written on
    // its last letter is the run's and the warning names the run.
    it('names the run the letters draw', () => {
      expect(reported(warningsOf('Xa/Xλ:abc'))).toEqual([['MALFORMED_COORDINATES', 'Xaλ:abc']]);
    });
  });

  describe('when the text around a letter drawn as text holds the internal name', () => {
    it("quotes an option value's own text unchanged", () => {
      expect(reported(warningsOf('[data-note=a/XTXT_b]Xλ^;B81'))).toEqual([
        ['MISPLACED_HEAD_MARKER', '[data-note=a/XTXT_b]Xλ^;B81'],
      ]);
    });

    it('quotes a code that merely contains the letters unchanged', () => {
      // pins the start-of-character anchor: the name is only read where a character starts
      expect(reported(warningsOf('QXTXT_Q:abc'))).toEqual([['MALFORMED_COORDINATES', 'QXTXT_Q:abc']]);
    });
  });

  describe('when a grid of broken decorations meets letters drawn as text', () => {
    it.each(DECORATED_TEXT_INPUTS)('names no internal code in any warning on %s', (input) => {
      const warnings = warningsOf(input);
      expect(warnings.length).toBeGreaterThan(0);
      expect(JSON.stringify(warnings)).not.toContain('XTXT_');
    });
  });
});
