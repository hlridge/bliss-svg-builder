/**
 * Pins how a word reads a `|` written after its first one: each later `|`
 * is reported with MALFORMED_GROUP_OPTIONS and dropped together with the
 * option brackets written right before it, and the codes on either side
 * stay, as characters of the word.
 *
 * Covers:
 * - A later `|` after an option bracket (one, or a run of them), after a
 *   code, beside a `/`, at either end of the codes, and right after the
 *   word's own `|`.
 * - A bracket that is not bound to the later `|`: a character's own
 *   bracket before a code, and one at the start of the codes after it.
 * - Several later `|`s in one word, each reported once, in order.
 * - The bare word and the empty options position, where the first `|`
 *   reads as before and only the later ones are new.
 * - A second `||` in the input, which reaches a word as two `|`s.
 * - The warning's code, message and source; the string, the drawing and
 *   the JSON of the result, each the same as its clean spelling, which
 *   reads with no warning; the route through `addGroup`.
 * - A `|` inside an option value, which is not a separator.
 *
 * Does NOT cover:
 * - The first `|` of a word (a bracket, other text, nothing), see
 *   `BlissParser.bracket-options.test.js`.
 * - A definition whose code string holds a `|`, reported as an unknown
 *   code; backlog row "`define()` accepts a code string holding a part
 *   the reader cannot take".
 * - Two words with no space between them, which the save writes as one
 *   word, see `BlissSVGBuilder.touching-words-save.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// The report for one later `|`: `dropped` is the spelling left out, `word`
// the word as written.
const laterPipeWarning = (dropped, word) => ({
  code: 'MALFORMED_GROUP_OPTIONS',
  message: `Invalid group options syntax: "${dropped}" inside the word "${word}" - word options go only at the start of a word, as [options]|. Ignoring.`,
  source: dropped,
});

// The report for text before a word's first `|` that is not a bracket.
const firstPipeWarning = (source) => ({
  code: 'MALFORMED_GROUP_OPTIONS',
  message: `Invalid group options syntax: "${source}|" - expected [options]| format. Ignoring.`,
  source,
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
  describe('when a later | follows option brackets', () => {
    it.each([
      ['[color=red]|B313/[color=blue]|B431', '[color=red]|B313/B431', '[color=blue]|'],
      ['[color=red]|[color=blue]|B313', '[color=red]|B313', '[color=blue]|'],
      ['[color=red]|B313/[color=blue][fill=green]|B431', '[color=red]|B313/B431', '[color=blue][fill=green]|'],
      ['[color=red]|B313/B291[color=blue]|B431', '[color=red]|B313/B291/B431', '[color=blue]|'],
      ['[color=red]|B313/[fill=green]B291[color=blue]|B431', '[color=red]|B313/[fill=green]B291/B431', '[color=blue]|'],
    ])('reads %s as %s, leaving out %s with a warning', (input, clean, dropped) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [laterPipeWarning(dropped, input)]));
    });
  });

  describe('when a bracket near a later | is not bound to it', () => {
    it.each([
      ['[color=red]|B313/[fill=green]B291|B431', '[color=red]|B313/[fill=green]B291/B431'],
      ['[color=red]|B313|[fill=green]B431', '[color=red]|B313/[fill=green]B431'],
    ])('reads %s as %s, keeping the character bracket', (input, clean) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [laterPipeWarning('|', input)]));
    });
  });

  describe('when a later | follows a code or stands beside a /', () => {
    it.each([
      ['[color=red]|B313/B291|B431', '[color=red]|B313/B291/B431'],
      ['[color=red]|B313/|B431', '[color=red]|B313/B431'],
      ['[color=red]|B313|/B431', '[color=red]|B313/B431'],
    ])('reads %s as %s, keeping the codes on both sides', (input, clean) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [laterPipeWarning('|', input)]));
    });
  });

  describe('when a later | stands at an end of the codes', () => {
    it.each([
      ['[color=red]|B313|', '[color=red]|B313'],
      ['|B313|B431', 'B313/B431'],
    ])('reads %s as %s with a warning', (input, clean) => {
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf(clean, [laterPipeWarning('|', input)]));
    });
  });

  describe('when a word holds several later |s', () => {
    it('reports each one, in the order written', () => {
      const input = '[color=red]|B313/[color=blue]|B291|B431';
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf('[color=red]|B313/B291/B431', [
        laterPipeWarning('[color=blue]|', input),
        laterPipeWarning('|', input),
      ]));
    });

    it('reports two bare ones separately', () => {
      const input = '[color=red]|B313|B291|B431';
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf('[color=red]|B313/B291/B431', [
        laterPipeWarning('|', input),
        laterPipeWarning('|', input),
      ]));
    });
  });

  describe('when the word has no option bracket', () => {
    it('reads its first | as before and keeps the codes after a later one', () => {
      const input = 'B313|B431|B291';
      expect(reading(new BlissSVGBuilder(input))).toEqual(readingOf('B431/B291', [
        firstPipeWarning('B313'),
        laterPipeWarning('|', input),
      ]));
    });
  });

  describe('when the input repeats ||', () => {
    it('keeps the code after a second || in the same word', () => {
      expect(reading(new BlissSVGBuilder('[color=red]||B313||B431'))).toEqual(readingOf('[color=red]||B431', [
        firstPipeWarning('B313'),
        laterPipeWarning('|', 'B313||B431'),
      ]));
    });

    it('reads a second || after a word space as that word\'s options', () => {
      expect(reading(new BlissSVGBuilder('[color=red]||B313//[color=blue]||B431')))
        .toEqual(readingOf('[color=red]||B313//[color=blue]|B431', [laterPipeWarning('|', '[color=blue]||B431')]));
    });
  });

  describe('when the word arrives through addGroup', () => {
    it('reports the later | on the builder and keeps the codes', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('[color=red]|B313|B431');
      expect(builder.toString()).toBe('B291//[color=red]|B313/B431');
      expect(builder.warnings).toEqual([laterPipeWarning('|', '[color=red]|B313|B431')]);
    });
  });

  describe('when a result is read again', () => {
    it.each([
      '[color=red]|B313/B431',
      '[color=red]|B313',
      '[color=red]|B313/B291/B431',
      '[color=red]|B313/[fill=green]B291/B431',
      '[color=red]|B313/[fill=green]B431',
      'B313/B431',
      'B431/B291',
      '[color=red]||B431',
      '[color=red]||B313//[color=blue]|B431',
      'B291//[color=red]|B313/B431',
    ])('reads %s with no warning', (clean) => {
      expect(new BlissSVGBuilder(clean).warnings).toEqual([]);
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
