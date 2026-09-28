/**
 * Pins `toString({ omitOptions: true })`: the canonical string with every option
 * bracket removed, leaving the content, the part coordinates and the kerning.
 *
 * Covers:
 * - Options written at every scope at once (the design's own example).
 * - Options that only change how ink looks (colour, stroke width, pass-through
 *   attributes, a target-prefixed key, the `text` stub, the SVG's own metadata,
 *   background and grid), at each scope they can be written at: dropped, and the
 *   reload draws the same ink.
 * - Options that place, space or size ink (character, word and composition
 *   positions, spacing, margin, crop, centring, dot sizes): dropped, so the ink
 *   moves, which is the design's accepted consequence.
 * - What stays: part coordinates in both entry spellings, kerning in every entry
 *   spelling, `;;` and `;;!`, the `^` head marker, space codes, external
 *   letters, a failed part and an unknown part.
 * - Every option name the library knows, written where it acts.
 * - No `[` in any output of this file.
 *
 * Does NOT cover:
 * - Options hidden in text rather than in a bracket of the composition (a `;;`
 *   code's own brackets, a `;;` name whose definition carries options, a
 *   definition's code string) and a head marker held only by options, see
 *   `BlissSVGBuilder.omit-options-edges.test.js`.
 * - `toJSON({ omitOptions: true })` and how the flag composes with `preserve`
 *   and `flattenIndicators`, see `BlissSVGBuilder.omit-options-json.test.js`.
 * - The in-place twins `clearOptions()` / `clearAllOptions()` and their parity
 *   with this flag, see `BlissSVGBuilder.clear-options.test.js`.
 * - Custom names kept by `preserve`, see
 *   `BlissSVGBuilder.preserve-removed-default.test.js`.
 * - A built-in's own look (`REFSQUARE`'s dotted line), see
 *   `BlissSVGBuilder.builtin-own-look.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import {
  BOOLEAN_OPTION_KEYS,
  GLOBAL_ONLY_OPTION_KEYS,
  KNOWN_OPTION_KEYS,
  TEXT_OPTION_KEYS,
} from '../src/lib/bliss-constants.js';

// What the flag writes for `input`.
const withoutOptions = (input) => new BlissSVGBuilder(input).toString({ omitOptions: true });

// Every path and transform in the content group, joined, so a styled part drawn
// as a <path> of its own compares equal to the same part merged into its neighbour.
const inkOf = (svg) => [...svg.slice(svg.indexOf('class="bliss-content"')).matchAll(/ (?:d|transform)="([^"]*)"/g)]
  .map((match) => match[1])
  .join('');

const LOOK_ROWS = [
  ['a colour on the composition', '[color=red]||B291/B313', 'B291/B313'],
  ['a colour on a word', '[color=red]|B291/B313//B291', 'B291/B313//B291'],
  ['a colour on a character', 'B313/[color=red]B291', 'B313/B291'],
  ['a colour on a part', 'B291;[color=red]>C8', 'B291;C8'],
  ['a stroke width on the composition', '[stroke-width=0.8]||B291', 'B291'],
  ['a stroke width on a word', '[stroke-width=0.8]|B291/B313', 'B291/B313'],
  ['a stroke width on a character', '[stroke-width=0.8]B291', 'B291'],
  ['a stroke width on a part', 'B291;[stroke-width=0.8]>C8', 'B291;C8'],
  ['a pass-through attribute on the composition', '[aria-label=house]||B291', 'B291'],
  ['a pass-through attribute on a word', '[data-x=1]|B291', 'B291'],
  ['a pass-through attribute on a character', '[data-foo=bar]B291', 'B291'],
  ['a pass-through attribute on a part', 'B291;[aria-label=circle]>C8', 'B291;C8'],
  ['a target-prefixed key', '[content--opacity=0.5]||B291', 'B291'],
  ['the text stub', '[text=hi]B291', 'B291'],
  ['the SVG title, description and height', '[svg-title=House;svg-desc=More;svg-height=40]||B291', 'B291'],
  ['a background and a grid', '[background=yellow;grid]||B291', 'B291'],
];

const PLACEMENT_ROWS = [
  ['a character position', '[x=2]B291', 'B291'],
  ['a character position on y', '[y=3]B291/B313', 'B291/B313'],
  ['a word position', '[x=2]|B291/B313', 'B291/B313'],
  ['a composition position', '[x=5;y=1]||B291', 'B291'],
  ['a character spacing', '[char-space=4]||B291/B291', 'B291/B291'],
  ['a word spacing', '[word-space=4]||B291//B291', 'B291//B291'],
  ['an external-letter spacing', '[external-glyph-space=2]||Xab/B291', 'Xab/B291'],
  ['a margin', '[margin=2]||B291', 'B291'],
  ['a crop', '[crop=6]||B291', 'B291'],
  ['a centred minimum width', '[center;min-width=20]||B291', 'B291'],
  ['a dot size', '[dot-width=2]B270', 'B270'],
];

const KEPT_ROWS = [
  ['a part coordinate', 'B291;C8:3,4', 'B291;C8:3,4'],
  ['a part position written as options', 'B291;[x=3;y=4]>C8', 'B291;C8:3,4'],
  ['a part position written beside a colour', 'B291;[x=3;color=red]>C8', 'B291;C8:3'],
  ['a lone part position', '[x=1]>C8', 'C8:1'],
  ['a word-level indicator', '[color=red]|B291;;B81', 'B291;;B81'],
  ['a word-level indicator that strips the semantic one', 'B291;;!B81', 'B291;;!B81'],
  ['a head marker', '[color=red]B291^/B313', 'B291^/B313'],
  ['space codes', 'B291//QSP/B313', 'B291//QSP/B313'],
  ['an external-letter run', '[color=red]Xhello', 'Xhello'],
  ['a styled letter inside a run', 'Xhe/[color=red]Xl/Xlo', 'Xhello'],
  ['a failed part', 'B291;[color=red]>Xab', 'B291;Xab'],
  ['an unknown part', 'B291;[color=red]>ZZZZ', 'B291;ZZZZ'],
];

const KERNING_ROWS = [
  ['the relative marker', 'B313/RK:2/B291', 'B313/RK:2/B291'],
  ['the absolute marker', 'B313/AK:0/B291', 'B313/AK:0/B291'],
  ['the relative option beside a colour', 'B313/[relative-kerning=2;color=red]B291', 'B313/RK:2/B291'],
  ['the absolute option beside a colour', 'B313/[absolute-kerning=0;color=red]B291', 'B313/AK:0/B291'],
];

// Every option the library names except `key`, which no serializer writes, each
// with a value it accepts: a switch is written bare, a text value as a colour.
const OPTION_ROWS = [
  ...[...BOOLEAN_OPTION_KEYS].map((key) => [key, key]),
  ...[...TEXT_OPTION_KEYS].map((key) => [key, `${key}=red`]),
  ...[...KNOWN_OPTION_KEYS]
    .filter((key) => key !== 'key' && !BOOLEAN_OPTION_KEYS.has(key) && !TEXT_OPTION_KEYS.has(key))
    .map((key) => [key, `${key}=1`]),
];
const CANVAS_OPTION_ROWS = OPTION_ROWS.filter(([key]) => GLOBAL_ONLY_OPTION_KEYS.has(key));
const ELEMENT_OPTION_ROWS = OPTION_ROWS.filter(([key]) => !GLOBAL_ONLY_OPTION_KEYS.has(key));

const EVERY_INPUT = [...LOOK_ROWS, ...PLACEMENT_ROWS, ...KEPT_ROWS, ...KERNING_ROWS].map(([, input]) => input);

describe('BlissSVGBuilder omit options', () => {
  describe('when options are written at every scope at once', () => {
    it('keeps the codes, the part coordinates and the kerning of the design\'s example', () => {
      expect(withoutOptions(
        '[color=red;grid;x=5]||[stroke-width=0.8;x=2]|[color=blue;y=3]B291:1,2;[color=green]>C8:3,4/RK:2/[x=2]B313',
      )).toBe('B291:1,2;C8:3,4/RK:2/B313');
    });
  });

  describe('when the options only change how the ink looks', () => {
    it.each(LOOK_ROWS)('drops %s and the reload draws the same ink', (_label, input, expected) => {
      const saved = withoutOptions(input);
      expect(saved).toBe(expected);
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(new BlissSVGBuilder(input).svgCode));
    });
  });

  describe('when the options place, space or size the ink', () => {
    it.each(PLACEMENT_ROWS)('drops %s', (_label, input, expected) => {
      expect(withoutOptions(input)).toBe(expected);
    });
  });

  describe('when the composition carries what is not an option', () => {
    it.each(KEPT_ROWS)('keeps %s and the reload draws the same ink', (_label, input, expected) => {
      const saved = withoutOptions(input);
      expect(saved).toBe(expected);
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(new BlissSVGBuilder(input).svgCode));
    });
  });

  describe('when a character is kerned', () => {
    it.each(KERNING_ROWS)('keeps %s as its marker', (_label, input, expected) => {
      expect(withoutOptions(input)).toBe(expected);
    });

    it('keeps kerning set through JavaScript beside a colour', () => {
      const builder = new BlissSVGBuilder('B313/B291');
      builder.glyph(1).setOptions({ relativeKerning: 2, color: 'red' });
      expect(builder.toString({ omitOptions: true })).toBe('B313/RK:2/B291');
    });
  });

  describe('when every option the library knows is written where it acts', () => {
    it('has a row for every known option except key', () => {
      expect(OPTION_ROWS.map(([key]) => key).sort())
        .toEqual([...KNOWN_OPTION_KEYS].filter((key) => key !== 'key').sort());
    });

    it.each(CANVAS_OPTION_ROWS)('drops %s from the composition bracket', (_key, written) => {
      const input = `[${written}]||B291`;
      expect(new BlissSVGBuilder(input).toString()).not.toBe('B291');
      expect(withoutOptions(input)).toBe('B291');
    });

    it.each(ELEMENT_OPTION_ROWS)('drops %s from a character bracket', (_key, written) => {
      const input = `[${written}]B291`;
      expect(new BlissSVGBuilder(input).toString()).not.toBe('B291');
      expect(withoutOptions(input)).toBe('B291');
    });
  });

  describe('when any input of this file is written without options', () => {
    it.each(EVERY_INPUT)('leaves no bracket in %s', (input) => {
      expect(withoutOptions(input)).not.toContain('[');
    });
  });
});
