/**
 * Pins how a word reads a `|` or `||` written after its first `|`: an option
 * bracket that starts a character before it is a misplaced option, reported
 * and left out while the rest of the word renders; any other later `|` or
 * `||` is a syntax error that drops the whole word, with one warning.
 *
 * Covers:
 * - A misplaced word option (`[opts]|`) and a misplaced global option
 *   (`[opts]||`) at the start of a character: after the word's own `|`,
 *   after a `/`, at the start of a later word, a run of brackets, several in
 *   one word, after a first `|` that holds no bracket.
 * - A later `|` or `||` anywhere else (after a code, beside a `/`, at the
 *   end, after a bracket that follows a code, a `||` with nothing before it,
 *   a run of three): the word dropped from the drawing and both saves.
 * - A dropped word reporting once: never its misplaced brackets, the text
 *   before its first `|`, or its options.
 * - A dropped word between two others, read as a malformed `;;` word is.
 * - The warning's code, message and source; the string, the drawing and the
 *   JSON of each result, each the same as its clean spelling, which reads
 *   with no warning; the routes through `addGroup` and `addGlyph`.
 * - A `|` inside an option value, which is not a separator.
 *
 * Does NOT cover:
 * - The first `|` of a word (a bracket, other text, nothing), see
 *   `BlissParser.bracket-options.test.js`.
 * - A malformed `;;`, which drops its word the same way, see
 *   `BlissParser.double-semicolon.test.js`.
 * - A word option on an alias that expands to several words, the other
 *   MISPLACED_GROUP_OPTION, see `BlissParser.group-option-placement.test.js`.
 * - A `|` in a part method's argument; backlog row "A part method given a
 *   code with a bare `|`...".
 * - A definition whose code string holds a `|`, reported as an unknown
 *   code; backlog row "`define()` accepts a code string holding a part
 *   the reader cannot take".
 * - Two words with no space between them, which the save writes as one
 *   word, see `BlissSVGBuilder.touching-words-save.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// A word option bracket left out: `dropped` is the spelling with its `|`,
// `word` the word as written.
const misplacedWordOptions = (dropped, word) => ({
  code: 'MISPLACED_GROUP_OPTION',
  message: `Group options "${dropped}" ignored in the word "${word}": word options go only at the start of a word, as [options]|.`,
  source: dropped,
});

// A global option bracket left out, with its `||`.
const misplacedGlobalOptions = (dropped, word) => ({
  code: 'MISPLACED_GLOBAL_OPTION',
  message: `Global options "${dropped}" ignored in the word "${word}": global options go only at the start of the input, as [options]||.`,
  source: dropped,
});

// The one report for a word dropped for a stray `|` or `||`.
const droppedWord = (word) => ({
  code: 'MALFORMED_GROUP_OPTIONS',
  message: `Invalid separator in the word "${word}": | goes only after a word's options at its start, as [options]|, and || only after the global options at the start of the input, as [options]||. The word was dropped.`,
  source: word,
});

// What a builder holds: its string, its drawing, its JSON and its warnings.
const reading = (builder) => ({
  string: builder.toString(),
  svg: builder.svgCode,
  json: builder.toJSON(),
  warnings: builder.warnings,
});

// What `clean` reads as, with the warnings `input` is expected to give.
const readingOf = (clean, warnings) => ({ ...reading(new BlissSVGBuilder(clean)), warnings });

describe('BlissParser pipe inside a word', () => {
  describe('when an option bracket starts a character before a later |', () => {
    it.each([
      ['[color=red]|B313/[color=blue]|B431', '[color=red]|B313/B431', '[color=blue]|'],
      ['[color=red]|[color=blue]|B313', '[color=red]|B313', '[color=blue]|'],
      ['[color=red]|B313/[color=blue][fill=green]|B431', '[color=red]|B313/B431', '[color=blue][fill=green]|'],
      ['[color=red]|B313/B291/[color=blue]|B431', '[color=red]|B313/B291/B431', '[color=blue]|'],
      ['|[color=blue]|B313', 'B313', '[color=blue]|'],
    ])('reads %s as %s, leaving out %s', (input, clean, dropped) => {
      expect(new BlissSVGBuilder(clean).warnings).toEqual([]);
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [misplacedWordOptions(dropped, input)]));
    });
  });

  describe('when an option bracket starts a character before a later ||', () => {
    it.each([
      ['[grid]||B313//[color=red]||B431', '[grid]||B313//B431', '[color=red]||', '[color=red]||B431'],
      ['[color=red]||[color=blue]||B313', '[color=red]||B313', '[color=blue]||', '[color=blue]||B313'],
      ['[color=red]|B313/[color=blue]||B431', '[color=red]|B313/B431', '[color=blue]||', '[color=red]|B313/[color=blue]||B431'],
      ['[color=red]||B313/[color=blue]||B431', '[color=red]||B313/B431', '[color=blue]||', 'B313/[color=blue]||B431'],
    ])('reads %s as %s, leaving out %s', (input, clean, dropped, word) => {
      expect(new BlissSVGBuilder(clean).warnings).toEqual([]);
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [misplacedGlobalOptions(dropped, word)]));
    });
  });

  describe('when a word holds several misplaced brackets', () => {
    it.each([
      ['[color=red]|[color=blue]|[fill=green]||B313', '[color=red]|B313'],
      ['[color=red]|B313/[color=blue]|B431/[fill=green]||B291', '[color=red]|B313/B431/B291'],
    ])('reports each one in %s, in the order written, and reads %s', (input, clean) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [
        misplacedWordOptions('[color=blue]|', input),
        misplacedGlobalOptions('[fill=green]||', input),
      ]));
    });
  });

  describe('when the word\'s first | holds no bracket', () => {
    it('reports that text as before, then the misplaced bracket', () => {
      const input = 'B313|[color=blue]|B431';
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf('B431', [
        {
          code: 'MALFORMED_GROUP_OPTIONS',
          message: 'Invalid group options syntax: "B313|" - expected [options]| format. Ignoring.',
          source: 'B313',
        },
        misplacedWordOptions('[color=blue]|', input),
      ]));
    });
  });

  describe('when a later | or || stands anywhere else', () => {
    it.each([
      ['[color=red]|B313/B291|B431', '[color=red]|B313/B291|B431', ''],
      ['[color=red]|B313/|B431', '[color=red]|B313/|B431', ''],
      ['[color=red]|B313|/B431', '[color=red]|B313|/B431', ''],
      ['[color=red]|B313|', '[color=red]|B313|', ''],
      ['|B313|B431', '|B313|B431', ''],
      ['[color=red]|B313/B291[color=blue]|B431', '[color=red]|B313/B291[color=blue]|B431', ''],
      ['[color=red]|B313/[fill=green]B291|B431', '[color=red]|B313/[fill=green]B291|B431', ''],
      ['[color=red]|B313/[fill=green]B291[color=blue]|B431', '[color=red]|B313/[fill=green]B291[color=blue]|B431', ''],
      ['[color=red]|B313|[fill=green]B431', '[color=red]|B313|[fill=green]B431', ''],
      ['[color=red]|B313/[color=blue]|||B431', '[color=red]|B313/[color=blue]|||B431', ''],
      ['[color=red]||B313||B431', 'B313||B431', '[color=red]||'],
      ['[color=red]||B313//||B431', '||B431', '[color=red]||B313//'],
    ])('drops the word in %s, reporting %s', (input, word, clean) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [droppedWord(word)]));
    });
  });

  describe('when a dropped word holds other problems', () => {
    it.each([
      ['[color=red]|B313/[color=blue]|B291|B431', 'a misplaced bracket'],
      ['B313|B431|B291', 'text before its first |'],
      ['[grid]|B313|B431', 'an option out of place in its own bracket'],
    ])('reports %s once, leaving out %s', (input) => {
      expect(new BlissSVGBuilder(input).warnings).toEqual([droppedWord(input)]);
    });
  });

  describe('when the dropped word stands between two others', () => {
    it('leaves its neighbours and both spaces, as a malformed ;; word does', () => {
      const { warnings, ...rest } = reading(new BlissSVGBuilder('B291//[color=red]|B313|B431//B291'));
      const { warnings: _, ...wordIndicatorRest } = reading(new BlissSVGBuilder('B291//B313;;B81;;B86//B291'));
      expect(rest).toEqual(wordIndicatorRest);
      expect(warnings).toEqual([droppedWord('[color=red]|B313|B431')]);
    });
  });

  describe('when the word arrives through an editing method', () => {
    it('drops a word added by addGroup and reports it on the builder', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('[color=red]|B313|B431');
      expect(builder.toString()).toBe('B291//');
      expect(builder.warnings).toEqual([droppedWord('[color=red]|B313|B431')]);
    });

    it('leaves a misplaced bracket out of a word added by addGroup', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('[color=red]|B313/[color=blue]|B431');
      expect(builder.toString()).toBe('B291//[color=red]|B313/B431');
      expect(builder.warnings).toEqual([misplacedWordOptions('[color=blue]|', '[color=red]|B313/[color=blue]|B431')]);
    });

    it('throws from addGlyph, as for any code that fails as a word', () => {
      const builder = new BlissSVGBuilder('B291');
      expect(() => builder.group(0).addGlyph('|B313|B431'))
        .toThrow('Code "|B313|B431" is not a single valid glyph (it fails as a word: MALFORMED_GROUP_OPTIONS)');
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when a | sits inside an option value', () => {
    it('reads it as part of the value, with no warning', () => {
      const builder = new BlissSVGBuilder('[color=red]|B313/[title="a|b"]B431');
      expect(builder.toString()).toBe('[color=red]|B313/[title="a|b"]B431');
      expect(builder.toJSON().groups[0].glyphs[1].options).toEqual({ title: 'a|b' });
      expect(builder.warnings).toEqual([]);
    });
  });
});
