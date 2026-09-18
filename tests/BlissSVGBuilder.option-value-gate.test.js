import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import {
  NUMERIC_OPTION_POLICY, KNOWN_OPTION_KEYS, COMPUTED_GEOMETRY_INPUTS,
} from '../src/lib/bliss-constants.js';

/**
 * Pins the one rule every numeric option now follows: a written value is
 * honoured exactly as written, or it is refused and reported. Nothing in
 * between, so no silent clamp, no silent NaN and no invented value.
 *
 * Covers:
 * - The seven removed ceilings (`char-space`, `word-space`,
 *   `external-glyph-space`, `dot-width`, `sdot-width`, `dot-extra-width`,
 *   `sdot-extra-width`): a value above the old limit now renders.
 * - A non-numeric value on a gated key: refused, reported
 *   (`INVALID_OPTION_VALUE`), and the option falls back as if unwritten.
 * - The bare (`[char-space]`) and empty (`[char-space=]`) forms, which used to
 *   set 1 and 0 respectively because `Number(true)` is 1 and `Number('')` is 0.
 * - A well-formed number nothing can carry: non-finite at any scope, and
 *   negative where the quantity is a LENGTH (`OUT_OF_RANGE_OPTION_VALUE`).
 * - The ten keys that had no gate of any kind before: the four individual
 *   crops, the six grid stroke widths and `svg-height`, each of which used to
 *   ship `NaN` or a negative length straight into the markup in silence.
 * - Both arms of the policy table's `kind`. A negative LENGTH is refused; a
 *   negative OFFSET is honoured, because a negative margin or crop pushes the
 *   viewBox out and means something there.
 * - The bulk-versus-specific interaction: a refused `crop-top` must not wipe
 *   the `cropTop` an accepted `crop=2` already set.
 * - The transcription of `NUMERIC_OPTION_POLICY` itself: membership against
 *   `KNOWN_OPTION_KEYS`, a complete row per key, and the absence of any
 *   upper bound.
 * - The output side, where every written value was accepted and the COMPUTED
 *   size is what nothing can carry (`OUT_OF_RANGE_COMPUTED_GEOMETRY`): a
 *   margin that overflows, an origin that overflows while both dimensions stay
 *   finite, a root dimension that overflows while the whole viewBox is finite,
 *   the finite-but-absurd geometry the check must leave alone, and the one
 *   trigger (a spacing) the fallback cannot repair.
 *
 * Does NOT cover:
 * - `stroke-width`, which reaches the same gate but keeps its own file,
 *   `BlissSVGBuilder.stroke-width-range.test.js`, because it is the one key in
 *   the table that is written at four scopes and feeds path geometry.
 * - The camelCase namespace collision, see
 *   `BlissSVGBuilder.option-namespace-split.test.js`.
 * - The STRING half of the same gate, which refuses a value nothing can write
 *   as text on a name the numeric table does not list, see
 *   `BlissSVGBuilder.text-option-values.test.js`.
 */

const render = (dsl) => new BlissSVGBuilder(dsl);
const codes = (dsl) => render(dsl).warnings.map((w) => w.code);

/**
 * A code each option demonstrably ACTS on. Not decoration: three of these
 * options are inert on the obvious carrier, so a row using the wrong one asserts
 * a difference that can never appear and fails against a correct implementation.
 * Measured 2026-09-03 by rendering two legal sub-ceiling values and diffing:
 *
 *   sdot-width 1.5 vs 0.5 on B4        →  identical  (B4 carries no small dot)
 *   sdot-extra-width 1 vs 0 on B4      →  identical
 *   external-glyph-space 3 vs 1 on B291 →  identical  (needs two ADJACENT
 *                                          external glyphs; XTXT_A/B291 and
 *                                          Xm/B291 are inert too)
 *
 * Every entry below was then confirmed to render differently at two legal
 * values, so a row on it can fail. Extend this table, not the individual rows,
 * when a new numeric option arrives.
 *
 * The six grid stroke widths are deliberately absent: they need a companion
 * `grid` option to draw anything at all, so they cannot be written in the
 * `[key=value]||carrier` shape every helper here assumes. Their rows spell the
 * input out and carry their own plain-render comparison.
 */
const CARRIER = {
  'char-space': 'B291/B291',
  'word-space': 'B291//B291',
  'external-glyph-space': 'Xm/XV/XA',
  'dot-width': 'B4',
  'dot-extra-width': 'B4',
  'sdot-width': 'SDOT',
  'sdot-extra-width': 'SDOT',
  margin: 'B291',
  'margin-top': 'B291',
  'margin-bottom': 'B291',
  'margin-left': 'B291',
  'margin-right': 'B291',
  crop: 'B291',
  'crop-top': 'B291',
  'crop-bottom': 'B291',
  'crop-left': 'B291',
  'crop-right': 'B291',
  // H is 8 units wide, so a min-width above that widens the viewBox; B291 is
  // the same width and would work identically, but H is what the spacing
  // suite already uses for this option.
  'min-width': 'H',
  'svg-height': 'B291',
};
const plain = (key) => render(CARRIER[key]).svgCode;

describe('BlissSVGBuilder option value gate', () => {
  describe('when a spacing or dot option is written above its old ceiling', () => {
    // The ceilings were removed because they rewrote a written value in silence:
    // each pair below rendered byte-identically with an empty warnings array.
    it.each([
      ['char-space', 50, 10],
      ['word-space', 50, 20],
      ['external-glyph-space', 9, 3],
      ['dot-width', 5, 1.5],
      ['sdot-width', 5, 1.5],
      ['dot-extra-width', 5, 1],
      ['sdot-extra-width', 5, 1],
    ])('honours %s=%s instead of clamping it to %s', (key, above, ceiling) => {
      const high = render(`[${key}=${above}]||${CARRIER[key]}`);
      const clamped = render(`[${key}=${ceiling}]||${CARRIER[key]}`);
      expect(high.svgCode).not.toBe(clamped.svgCode);
      expect(high.warnings).toEqual([]);
    });
  });

  describe('when a numeric option is given something that is not a number', () => {
    // Both halves matter, but only the second can fail today: the `!isNaN` guard
    // already skips these branches, so the byte-equality half passes before and
    // after. It is kept because it is what dies under a mutant that falls back to
    // a wrong-but-finite value, which is the whole point of the carrier table.
    it.each([
      ['char-space', 'abc'],
      ['word-space', 'abc'],
      ['dot-width', 'abc'],
      ['external-glyph-space', 'aut0'],
    ])('refuses %s=%s and falls back as if unwritten', (key, value) => {
      const dsl = `[${key}=${value}]||${CARRIER[key]}`;
      expect(render(dsl).svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
    });

    // Number(true) is 1 and Number('') is 0, so both used to pass the !isNaN
    // guard and set a value the author never typed. The offset half of this pair
    // (`[margin]`, `[margin=]`) arrives with the margin gate in the next task,
    // since margin is ungated here and would fail against a correct tree.
    it.each([
      ['char-space'], ['dot-width'],
    ])('refuses the bare and the empty form of %s', (key) => {
      for (const dsl of [`[${key}]||${CARRIER[key]}`, `[${key}=]||${CARRIER[key]}`]) {
        expect(render(dsl).svgCode, dsl).toBe(plain(key));
        expect(codes(dsl), dsl).toEqual(['INVALID_OPTION_VALUE']);
      }
    });

    // A quoted blank reaches the gate as a string of spaces, where the bare and
    // unquoted forms arrive as `true` and `''`. `Number(' ')` is 0, so without
    // this the library sets a spacing of 0 that nobody typed, in silence, from
    // the DSL itself.
    it.each([
      ['char-space', '" "'],
      ['char-space', '"  "'],
      ['dot-width', '" "'],
    ])('refuses %s=%s, a value that is blank rather than absent', (key, value) => {
      const dsl = `[${key}=${value}]||${CARRIER[key]}`;
      expect(render(dsl).svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('still honours a number padded with spaces', () => {
      // The refusal above is about a value with no digits in it, not about
      // whitespace, so ` 5 ` keeps working.
      const padded = render('[char-space=" 5 "]||B291/B291');
      expect(padded.svgCode).toBe(render('[char-space=5]||B291/B291').svgCode);
      expect(padded.warnings).toEqual([]);
    });
  });

  describe('when a value that is not a number reaches a surface the DSL cannot spell', () => {
    // Every one of these coerces to a number the author never wrote:
    // Number(false), Number(null), Number([]) and Number(' ') are all 0, and
    // Number([5]) is 5. The DSL can only produce strings, so these arrive
    // through the constructor, through object input, and through the mutation
    // opts argument, which is why the gate judges the TYPE rather than trusting
    // Number() to fail.
    const objectInput = (value) => {
      const composition = new BlissSVGBuilder('B291/B291').toJSON();
      composition.options = { 'char-space': value };
      return new BlissSVGBuilder(composition);
    };
    const unwritten = () => new BlissSVGBuilder('B291/B291').svgCode;

    it.each([
      ['false', false], ['true', true], ['a blank string', ' '],
    ])('refuses %s in the constructor options', (label, value) => {
      const builder = new BlissSVGBuilder('B291/B291', { charSpace: value });
      expect(builder.svgCode, label).toBe(unwritten());
      expect(builder.warnings.map((w) => w.code), label).toEqual(['INVALID_OPTION_VALUE']);
    });

    it.each([
      ['null', null], ['undefined', undefined], ['an empty list', []],
      ['a list holding a number', [5]], ['an object', {}],
    ])('never sees %s in the constructor options, because #toRaw drops it first', (label, value) => {
      // Pre-existing and deliberately untouched: #toRaw skips null, undefined
      // and every object before the gate exists, so the option is genuinely
      // unwritten and the render is right. There is nothing to report because
      // nothing reached the option. Object input has no #toRaw in front of it,
      // which is why the rows below expect a warning for the same values.
      const builder = new BlissSVGBuilder('B291/B291', { charSpace: value });
      expect(builder.svgCode, label).toBe(unwritten());
      expect(builder.warnings, label).toEqual([]);
    });

    it.each([
      ['false', false], ['null', null], ['a blank string', ' '],
      ['an empty list', []], ['a list holding a number', [5]],
    ])('refuses %s in object input, which has no #toRaw filter in front of it', (label, value) => {
      const builder = objectInput(value);
      expect(builder.svgCode, label).toBe(unwritten());
      expect(builder.warnings.map((w) => w.code), label).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('shows the author what it was given rather than what it coerced to', () => {
      // `[5]` is the row that makes this matter: it coerces to 5, so a message
      // built from the coerced value would say a number is not a number.
      const composition = new BlissSVGBuilder('B291/B291').toJSON();
      composition.options = { 'char-space': [5] };
      expect(new BlissSVGBuilder(composition).warnings[0].message).toBe(
        '"char-space" needs a number and [5] is not one, so it was ignored: '
        + 'the spacing keeps the value it would have had without it.'
      );
    });
  });

  describe('when an option is given a value the format cannot carry', () => {
    // Non-finite is refused for BOTH kinds of quantity, which is why the
    // margin and crop rows sit beside the spacing ones here. Only the negative
    // rule splits the two kinds apart, and that split is pinned from both
    // sides below: a negative length here, a negative offset in the honoured
    // block further down.
    it.each([
      ['char-space', 'Infinity'], ['char-space', '-Infinity'], ['char-space', '-5'],
      ['word-space', '-5'],
      ['dot-width', '-1'],
      ['min-width', '-10'],
      ['svg-height', '-10'],
      ['margin', 'Infinity'], ['margin', '-Infinity'],
      ['crop', 'Infinity'],
      ['crop-top', 'Infinity'],
    ])('refuses %s=%s with OUT_OF_RANGE_OPTION_VALUE', (key, value) => {
      const dsl = `[${key}=${value}]||${CARRIER[key]}`;
      expect(render(dsl).svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['OUT_OF_RANGE_OPTION_VALUE']);
    });

    it('stops emitting a negative width and height on the root', () => {
      // The render-equality row above cannot say WHAT was wrong with the old
      // output, and `width="-4.4186"` is the thing an author actually saw.
      expect(render('[svg-height=-10]||B291').svgCode).not.toContain('width="-4.4186"');
    });

    it('stops emitting an infinite viewBox', () => {
      // `[margin=Infinity]` used to reach the markup verbatim, as
      // viewBox="-Infinity -Infinity Infinity Infinity".
      expect(render('[margin=Infinity]||B291').svgCode).not.toContain('Infinity');
    });
  });

  describe('when a key that never had a gate is given a bad value', () => {
    // Ten keys arrived at this task with no check of any kind: the four
    // individual crops, the six grid stroke widths and svg-height. Each shipped
    // its bad value straight into the markup.
    it.each([
      ['crop-top'], ['crop-bottom'], ['crop-left'], ['crop-right'],
    ])('refuses %s=aut0 instead of shipping NaN in the viewBox', (key) => {
      // A row per side, not one for the family: each side is its own
      // assignment, and a gate that reached only the first would leave three
      // keys shipping NaN with the suite green. `aut0` rather than `abc`
      // because the typo this is written for is a mistyped `auto`.
      const dsl = `[${key}=aut0]||${CARRIER[key]}`;
      const builder = render(dsl);
      expect(builder.svgCode).not.toContain('NaN');
      expect(builder.svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.warnings[0].source).toBe(`${key}=aut0`);
    });

    it.each([
      'grid-stroke-width', 'grid-major-stroke-width', 'grid-medium-stroke-width',
      'grid-minor-stroke-width', 'grid-sky-stroke-width', 'grid-earth-stroke-width',
    ])('refuses %s=abc instead of stamping stroke-width="NaN" on the lines', (key) => {
      // Spelled out rather than run through CARRIER: a grid width draws
      // nothing without the companion `grid` option, so the comparison render
      // needs that option too.
      const builder = render(`[grid;${key}=abc]||B291`);
      expect(builder.svgCode).not.toContain('NaN');
      expect(builder.svgCode).toBe(render('[grid]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
      // The six widths share one helper, and the key it is handed decides both
      // the message and the length-versus-offset rule. Without this the helper
      // could pass a fixed key and all six rows would still pass.
      expect(builder.warnings[0].source).toBe(`${key}=abc`);
    });

    it('refuses a negative grid stroke width, which is a length', () => {
      // The width reached the markup as stroke-width="-1", which is a length
      // no renderer draws. Separate from the row above because it is the other
      // arm of the gate, and the six-key row only ever enters the first.
      const builder = render('[grid;grid-stroke-width=-1]||B291');
      expect(builder.svgCode).not.toContain('stroke-width="-1"');
      expect(builder.svgCode).toBe(render('[grid]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_OPTION_VALUE']);
    });

    it('refuses a bare grid stroke width rather than drawing at 1', () => {
      // Number(true) is 1, so the bare key drew the lines six times thicker
      // than the 0.166 default, in silence.
      const builder = render('[grid;grid-stroke-width]||B291');
      expect(builder.svgCode).toBe(render('[grid]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it.each([
      ['svg-height'], ['min-width'],
    ])('refuses %s=abc, which used to be dropped without a word', (key) => {
      const dsl = `[${key}=abc]||${CARRIER[key]}`;
      expect(render(dsl).svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
    });

    // A row per SIDE, matching the four crop rows above. The margin loop hands
    // the gate a key built from the side it is on, and until these existed no
    // row anywhere wrote a bad value for `margin-bottom` or `margin-right`:
    // only accepted-value rows, which cannot see a misrouted key. A mutant
    // that judged those two sides under a different name passed all 4691.
    it.each([
      ['margin-top'], ['margin-bottom'], ['margin-left'], ['margin-right'],
    ])('refuses %s=abc and names the side that was written', (key) => {
      const dsl = `[${key}=abc]||${CARRIER[key]}`;
      const builder = render(dsl);
      expect(builder.svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.warnings[0].source).toBe(`${key}=abc`);
    });

    it.each([
      ['margin-top'], ['margin-bottom'], ['margin-left'], ['margin-right'],
    ])('refuses the bare form of %s and names it alone', (key) => {
      const dsl = `[${key}]||${CARRIER[key]}`;
      const builder = render(dsl);
      expect(builder.svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
      expect(builder.warnings[0].source).toBe(key);
    });

    it('refuses a crop value that is a word the option does not know', () => {
      // `crop` has three legal string values and used to drop anything else
      // silently, because the numeric tail was guarded by `!isNaN`.
      const dsl = '[crop=nonsense]||B291';
      expect(render(dsl).svgCode).toBe(plain('crop'));
      expect(codes(dsl)).toEqual(['INVALID_OPTION_VALUE']);
    });
  });

  describe('when an offset key is written bare or empty', () => {
    // The OFFSET half of the bare/empty pair. Number(true) is 1 and Number('')
    // is 0, so `[margin]` set a margin of 1 and `[margin=]` a margin of 0
    // against a default of 0.75, both in silence and neither typed.
    it.each([
      ['margin'], ['margin-top'], ['crop'], ['crop-top'],
    ])('refuses the bare and the empty form of %s', (key) => {
      for (const dsl of [`[${key}]||${CARRIER[key]}`, `[${key}=]||${CARRIER[key]}`]) {
        expect(render(dsl).svgCode, dsl).toBe(plain(key));
        expect(codes(dsl), dsl).toEqual(['INVALID_OPTION_VALUE']);
      }
    });
  });

  describe('when a bulk value and a specific one disagree', () => {
    // A refusal assigns nothing, which is what lets an accepted bulk value
    // stand. Assigning `undefined` instead would read as "no crop" and quietly
    // undo the `crop=2` the author did write and the library did accept.
    it('keeps an accepted crop when the specific one beside it is refused', () => {
      const builder = render('[crop=2;crop-top=abc]||B291');
      expect(builder.svgCode).not.toContain('NaN');
      expect(builder.svgCode).toBe(render('[crop=2]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('keeps an accepted margin when the specific one beside it is refused', () => {
      const builder = render('[margin=2;margin-top=abc]||B291');
      expect(builder.svgCode).toBe(render('[margin=2]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('refuses the bulk value alone and lets the specific one stand', () => {
      // The other direction, and the one that says the two refusals are
      // independent rather than one gate covering both.
      const builder = render('[crop=abc;crop-top=2]||B291');
      expect(builder.svgCode).toBe(render('[crop-top=2]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    // The grid widths run the same bulk-then-specific cascade through five
    // accumulators rather than through four assignments, so they need the
    // interaction pinned separately. Without this row the guard on each
    // category and specific step can be deleted and the whole suite still
    // passes: every other grid row writes ONE width option, and one option
    // never has an accepted value beneath it to wipe.
    it('keeps an accepted bulk grid width when a specific one beside it is refused', () => {
      const builder = render('[grid;grid-stroke-width=2;grid-sky-stroke-width=abc]||B291');
      expect(builder.svgCode).not.toContain('NaN');
      // the sky line keeps the bulk 2, rather than dropping to the 0.166
      // default as it would if the refusal overwrote the accepted value
      expect(builder.svgCode).toBe(render('[grid;grid-stroke-width=2]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('refuses the bulk grid width alone and lets the specific one stand', () => {
      const builder = render('[grid;grid-stroke-width=abc;grid-sky-stroke-width=2]||B291');
      expect(builder.svgCode).toBe(render('[grid;grid-sky-stroke-width=2]||B291').svgCode);
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });
  });

  describe('when a valid but unusual value is written', () => {
    // Zero is a legal length, so it sits on the refusal boundary and is the row
    // that separates "negative is refused" from "not positive is refused".
    // Without it a gate written `written <= 0` passes the whole suite.
    it.each([
      ['char-space'], ['dot-width'],
    ])('honours %s=0 in silence', (key) => {
      const builder = render(`[${key}=0]||${CARRIER[key]}`);
      expect(builder.svgCode).not.toBe(plain(key));
      expect(builder.warnings).toEqual([]);
    });

    // These already pass, and their job is to stop this task breaking them:
    // every one is a value a clamp would have rewritten.
    it.each([
      ['[svg-height=0]||B291', 'width="0" height="0"'],
      ['[svg-height=1e9]||B291', 'height="1000000000"'],
      ['[min-width=20]||H', 'viewBox="-0.75 -0.75 21.5 21.5"'],
    ])('honours %s in silence', (dsl, fragment) => {
      const builder = render(dsl);
      expect(builder.svgCode).toContain(fragment);
      expect(builder.warnings).toEqual([]);
    });

    // The OFFSET arm from the honoured side, one row per call site that can
    // reach it. Without these the gate could refuse every negative number and
    // only the `kind` transcription row would notice, which pins the table
    // rather than the behaviour. Per call site rather than per key because the
    // key a caller passes is what looks `kind` up: hand the bulk `crop` branch
    // the name of a length and every negative crop starts being refused, with
    // the transcription row still green.
    it.each([
      ['[margin=-5]||B291', 'viewBox="5 5 0 10"'],
      ['[margin-left=-5]||B291', 'viewBox="5 -0.75 3.75 21.5"'],
      ['[crop=-5]||B291', 'viewBox="-5.75 -5.75 19.5 31.5"'],
      ['[crop-top=-5]||B291', 'viewBox="-0.75 -5.75 9.5 26.5"'],
      ['[crop-left=-5]||B291', 'viewBox="-5.75 -0.75 14.5 21.5"'],
    ])('honours the negative offset in %s, because an offset may be negative', (dsl, fragment) => {
      const builder = render(dsl);
      expect(builder.svgCode).toContain(fragment);
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['[crop=auto]||B291', 'viewBox="-0.75 7.25 9.5 9.5"'],
      ['[crop=auto-vertical]||B291', 'viewBox="-0.75 7.25 9.5 9.5"'],
      ['[crop=compact]||B291', 'viewBox="-0.75 3.25 9.5 17.5"'],
      ['[crop-top=auto]||B291', 'viewBox="-0.75 7.25 9.5 13.5"'],
    ])('leaves the string values crop accepts alone: %s', (dsl, fragment) => {
      // The gate runs on the numeric path only. A gate written in front of the
      // string arms instead of behind them refuses all four of these, and
      // nothing else in the suite writes `crop-top=auto`.
      const builder = render(dsl);
      expect(builder.svgCode).toContain(fragment);
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the refusal is reported', () => {
    // The render assertions above pin that the value was dropped; nothing there
    // pins the words, so a mutant naming the internal key instead of the noun,
    // or swapping the two codes' messages, survives all of them.
    it('names the option as written and the thing that kept its old value', () => {
      const [warning] = render('[char-space=abc]||B291/B291').warnings;
      expect(warning).toEqual({
        code: 'INVALID_OPTION_VALUE',
        message: '"char-space" needs a number and "abc" is not one, so it was ignored: '
          + 'the spacing keeps the value it would have had without it.',
        source: 'char-space=abc',
      });
    });

    it('carries the bare key alone as the source when no value was written', () => {
      // There is no `=value` to quote, so `char-space=true` would name a value
      // the author never typed.
      const [warning] = render('[char-space]||B291/B291').warnings;
      expect(warning.source).toBe('char-space');
      expect(warning.message).toBe('"char-space" needs a number and was written without one, '
        + 'so it was ignored: the spacing keeps the value it would have had without it.');
    });

    it('says why a negative length is out of range rather than what it clamped to', () => {
      const [warning] = render('[dot-width=-1]||B4').warnings;
      expect(warning).toEqual({
        code: 'OUT_OF_RANGE_OPTION_VALUE',
        message: '"dot-width" cannot be -1, because a negative dot cannot be drawn, so it was '
          + 'ignored: the dot keeps the value it would have had without it.',
        source: 'dot-width=-1',
      });
    });

    it('distinguishes a non-finite value from a negative one', () => {
      expect(render('[char-space=Infinity]||B291/B291').warnings[0].message).toBe(
        '"char-space" cannot be Infinity, which is not a length the SVG format can carry, '
        + 'so it was ignored: the spacing keeps the value it would have had without it.'
      );
    });

    // One row per CALL SITE, not per key. The gate is handed a key by ten
    // different callers, and that key decides the message, the noun and
    // whether a negative value is refused. Every row elsewhere in this file
    // asserts the warning CODE, which is identical whichever key was passed,
    // so a caller handing over the wrong one survives all of them.
    it.each([
      ['[crop=abc]||B291', 'crop=abc'],
      ['[crop-left=abc]||B291', 'crop-left=abc'],
      ['[margin=Infinity]||B291', 'margin=Infinity'],
      ['[margin-left=abc]||B291', 'margin-left=abc'],
      ['[min-width=abc]||H', 'min-width=abc'],
      ['[svg-height=abc]||B291', 'svg-height=abc'],
      ['[stroke-width=abc]||B291', 'stroke-width=abc'],
    ])('names the option as written in %s', (dsl, source) => {
      expect(render(dsl).warnings[0].source).toBe(source);
    });
  });

  describe('when transcribing the policy table', () => {
    it('holds exactly the numeric members of the curated vocabulary', () => {
      // Membership, not just size. Without this a typo keeps the count at 26,
      // keeps every row's shape, and silently ungates the key it misspells,
      // because the gate returns null for a key it cannot find.
      const NON_NUMERIC = new Set([
        'center', 'grid', 'grid-color', 'grid-major-color', 'grid-medium-color',
        'grid-minor-color', 'grid-sky-color', 'grid-earth-color', 'color',
        'background', 'background-top', 'background-mid', 'background-bottom',
        'text', 'svg-desc', 'svg-title', 'error-placeholder', 'key',
      ]);
      const expected = [...KNOWN_OPTION_KEYS].filter((k) => !NON_NUMERIC.has(k));
      expect([...NUMERIC_OPTION_POLICY.keys()].sort()).toEqual(expected.sort());
      expect(NUMERIC_OPTION_POLICY.size).toBe(26);
    });

    it('carries the exact kind and noun for every key', () => {
      // Both halves are load-bearing and neither is checkable by shape: `kind`
      // decides whether a negative value is refused, and `noun` is shipped text
      // in every message the key can raise. A truthiness check passes on any
      // string, so a typo in a row no message row happens to cover ships a
      // garbled warning with the whole suite green.
      expect(Object.fromEntries(
        [...NUMERIC_OPTION_POLICY].map(([key, { kind, noun }]) => [key, `${kind}/${noun}`])
      )).toEqual({
        'stroke-width': 'length/stroke',
        'dot-extra-width': 'length/dot',
        'sdot-extra-width': 'length/dot',
        'dot-width': 'length/dot',
        'sdot-width': 'length/dot',
        'char-space': 'length/spacing',
        'word-space': 'length/spacing',
        'external-glyph-space': 'length/spacing',
        margin: 'offset/margin',
        'margin-top': 'offset/margin',
        'margin-bottom': 'offset/margin',
        'margin-left': 'offset/margin',
        'margin-right': 'offset/margin',
        'min-width': 'length/width',
        crop: 'offset/crop',
        'crop-top': 'offset/crop',
        'crop-bottom': 'offset/crop',
        'crop-left': 'offset/crop',
        'crop-right': 'offset/crop',
        'grid-stroke-width': 'length/grid line width',
        'grid-major-stroke-width': 'length/grid line width',
        'grid-medium-stroke-width': 'length/grid line width',
        'grid-minor-stroke-width': 'length/grid line width',
        'grid-sky-stroke-width': 'length/grid line width',
        'grid-earth-stroke-width': 'length/grid line width',
        'svg-height': 'length/height',
      });
    });

    it('records where every key falls back to', () => {
      // Documentation rather than behaviour, so truthiness is the right check:
      // nothing reads this string, and pinning prose would fail on a reword.
      for (const [key, policy] of NUMERIC_OPTION_POLICY) {
        expect(policy.fallback, key).toBeTruthy();
      }
    });

    it('has no upper bound in any row', () => {
      for (const [key, policy] of NUMERIC_OPTION_POLICY) {
        expect(Object.keys(policy), key).not.toContain('max');
      }
    });
  });

  describe('when accepted values compute a geometry the format cannot carry', () => {
    // Every value written below passes its own gate: 1e308 is finite, and a
    // margin or a crop may be negative. The refusal happens on the way OUT,
    // where two terms sum past the largest double or the six-times
    // presentation multiplier runs off the end of it.

    it('refuses an overflowing margin and sizes the picture as if none were written', () => {
      const b = render('[margin=1e308]||B291');
      expect(b.svgCode).not.toContain('Infinity');
      // The fallback is "as if the option were never written", so the margins
      // return to their 0.75 default. NOT [margin=0], which is a different
      // picture: viewBox="0 0 8 20" against the default "-0.75 -0.75 9.5 21.5".
      expect(b.svgCode).toBe(render('B291').svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      // Bare key names joined, matching MULTIPLE_GEOMETRY_VALUES, which is the
      // precedent for a geometry-family code no single key owns. NOT
      // "margin=1e308": no single value was refused, the computed result was.
      expect(b.warnings[0].source).toBe('margin');
    });

    it('has the warning before svgCode is ever read', () => {
      // The contract row. It fails if the check is written in the getter, which
      // is the shape a reader will reach for first, and which would make this
      // one code order-dependent when every other is raised by construction.
      const b = render('[margin=1e308]||B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
    });

    it('does not accumulate across repeated svgCode reads', () => {
      const b = render('[margin=1e308]||B291');
      void b.svgCode; void b.svgCode; void b.svgCode;
      expect(b.warnings.filter((w) => w.code === 'OUT_OF_RANGE_COMPUTED_GEOMETRY')).toHaveLength(1);
    });

    // Six numbers are judged, and `[margin=1e308]` above makes four of them
    // non-finite at once, so it vouches for a check that reads any one of the
    // four. Each row below leaves exactly ONE non-finite, so dropping that
    // number from the check kills exactly one row. Isolating inputs measured
    // 2026-09-04 by replaying the geometry arithmetic; the shapes they need are
    // why several carry four options:
    //
    //   viewBoxX       two terms of opposite sign, the width subtracting to 0
    //   viewBoxY       the same vertically
    //   viewBoxWidth   svg-height set, so svgWidth reads 0 off the zero-height
    //                  guard instead of overflowing with it
    //   viewBoxHeight  svg-height set, so svgHeight is the written value
    //   svgWidth       svg-height on a picture wide enough that the ratio
    //                  multiplies past the end (49.5 / 21.5, so 2.3 x 1e308)
    //   svgHeight      one margin, six-timesed, with the width left alone
    //
    // viewBoxWidth and viewBoxHeight also pin svg-height as one of the options
    // the fallback drops, which the narrower GEOMETRY_OPTION_KEYS does not hold.
    it.each([
      ['the viewBox origin x', '[margin-left=-1e308;crop-left=1e308]', 'B291', 'margin-left, crop-left'],
      ['the viewBox origin y', '[margin-top=-1e308;crop-top=1e308]', 'B291', 'margin-top, crop-top'],
      ['the viewBox width', '[svg-height=100;margin-left=1e308;margin-right=1e308;crop-top=25]', 'B291',
        'svg-height, margin-left, margin-right, crop-top'],
      ['the viewBox height', '[svg-height=100;margin-top=1e308;margin-bottom=1e308]', 'B291',
        'svg-height, margin-top, margin-bottom'],
      ['the root width', '[svg-height=1e308]', 'B291/B291/B291/B291/B291', 'svg-height'],
      ['the root height', '[margin-top=1e308]', 'B291', 'margin-top'],
    ])('catches %s when it is the only number that overflows', (_arm, options, carrier, source) => {
      const b = render(`${options}||${carrier}`);
      expect(b.svgCode).toBe(render(carrier).svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].source).toBe(source);
    });

    it('leaves a finite but absurd geometry alone', () => {
      // The boundary the check must not cross. A crop of 1e308 puts the origin
      // at 1e308 and empties the picture, which is valid SVG and a legal value
      // now that no option has a ceiling. Only NON-FINITE is refused, so a
      // check written against a magnitude threshold fails here.
      const b = render('[crop-top=1e308]||B291');
      expect(b.svgCode).toContain('viewBox="-0.75 1e+308 9.5 0"');
      expect(b.warnings).toEqual([]);
    });

    it('reports a spacing that overflows, though dropping options cannot repair it', () => {
      // RULED, DO NOT FILE THIS AS A GAP: the one trigger the fallback cannot
      // answer, and it stays that way deliberately. A spacing widens the
      // COMPOSITION, so by the time the geometry is judged the content is
      // already 1e308 units across and removing the sizing options narrows
      // nothing. Repairing it means building the composition a second time
      // without the spacing the author wrote, which is a render-path change
      // with a duplicate-warning risk, spent on a value no one writes. The
      // report names the spacing and says to reduce it, which is the remedy.
      //
      // The message is asserted because it is the one thing here that CAN be
      // wrong while the behaviour is right: the report must not claim the drop
      // put the size back when the markup still carries the overflow.
      const b = render('[char-space=1e308]||B291/B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].source).toBe('char-space');
      expect(b.svgCode).toContain('width="Infinity"');
      expect(b.warnings[0].message).toContain('the picture still carries that size');
      expect(b.warnings[0].message).not.toContain('was dropped');
    });

    it.each([
      ['a spacing alone', '[word-space=1e308]||B291//B291', 'word-space'],
      ['a spacing beside a sizing option', '[char-space=1e308;margin=2]||B291/B291', 'char-space, margin'],
    ])('says the size survived the drop when it did: %s', (_arm, input, source) => {
      // The second arm is the one that shows what the branch must ask. A margin
      // IS a sizing option and IS dropped here, so a message keyed on "was a
      // size option written" reports a repair; the markup still ships
      // Infinity. The question the author needs answered is whether the drop
      // worked, which only recomputing can tell.
      const b = render(input);
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].source).toBe(source);
      expect(b.svgCode).toContain('width="Infinity"');
      expect(b.warnings[0].message).toContain('the picture still carries that size');
    });

    it.each([
      ['a position', '[char-space=2]||[x=1e308]>B291'],
      ['a kerning value', '[char-space=2]||B291/[absolute-kerning=1e308]B291'],
    ])('does not accuse an innocent option when %s caused it', (_arm, input) => {
      // The option named here is at its own default and did not cause
      // anything: the position or the kerning sits at element scope, where the
      // builder-scope set of written size options cannot see it, so the
      // report names the only thing it can see. Naming it is settled. Telling
      // the author it "works out to" the bad size is not, because following
      // that advice does nothing: `[char-space=0]` leaves the width Infinite.
      // So the surviving arm must state the outcome, not the cause, and must
      // still offer the remedy that works.
      const b = render(input);
      expect(b.warnings[0].source).toBe('char-space');
      expect(b.svgCode).toContain('width="Infinity"');
      expect(b.warnings[0].message).not.toContain('"char-space" works out to');
      expect(b.warnings[0].message).toContain('positions and kerning');
    });

    it.each([
      ['no spacing written at all', '[margin=1e308]||B291', 'B291'],
      ['an INNOCENT spacing written beside the guilty option', '[char-space=2;margin=1e308]||B291/B291', 'B291/B291'],
    ])('says the options were dropped when dropping them repaired the size: %s', (_arm, input, bare) => {
      // The other side of the same branch, pinned here because nothing else
      // reads this message: a margin overflow IS repairable, the picture comes
      // back at its default size, and the report should say so.
      //
      // The second arm is what stops the predicate being faked. A shortcut
      // decidable from the written keys alone ("repaired unless a spacing was
      // written") passes every other row in this file and the whole suite, and
      // is wrong exactly here: the spacing is at its default and harmless, the
      // margin is the overflow, and dropping it really does put the size back.
      // Only asking the recomputed arithmetic separates the two.
      const b = render(input);
      expect(b.svgCode).toBe(render(bare).svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].message).toContain('every option that sizes the picture was dropped');
      expect(b.warnings[0].message).not.toContain('still carries');
    });

    it.each([
      ['crop=compact', 'cropCompact'],
      ['crop=auto-vertical', 'autoVertical'],
    ])('drops %s too, which only its own crop shows', (written, _internal) => {
      // Two entries in the deletion list whose effect no other row can see: a
      // refused margin already falls back to the plain picture, so a list that
      // forgot these two would look right on every margin row. B138 has room
      // above its ink, so a compact or auto-vertical crop MOVES the viewBox
      // (`-0.75 3.25 8.5 17.5` against the default `-0.75 -0.75 8.5 21.5`),
      // and the fallback is "as if no sizing option were written", which
      // includes this one.
      const b = render(`[${written};margin=1e308]||B138`);
      expect(b.svgCode).toBe(render('B138').svgCode);
      expect(b.svgCode).not.toBe(render(`[${written}]||B138`).svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
    });

    it('names nothing, and says so, when no sizing option was written', () => {
      // A glyph POSITION written as an option gates on finite alone, so it
      // widens the composition from element scope where the builder-scope set
      // of written sizing options cannot see it. The report used to open with
      // an empty pair of quotes and tell the author to reduce nothing.
      // `[y=1e308]` deliberately does NOT fire: the vertical extent is the
      // fixed 20-unit band, not the content's bounds.
      const b = render('[x=1e308]>B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].source).toBe('');
      expect(b.warnings[0].message).not.toContain('""');
      expect(b.warnings[0].message).toContain('no option that sizes the picture was written');
      expect(render('[y=1e308]>B291').warnings).toEqual([]);
    });

    it('drops every option the geometry reads', () => {
      // The fallback is a fixed list and the geometry it answers for is not.
      // An option added to #computeGeometry but not to the list would go on
      // shaping the picture after the report said every sizing option had been
      // dropped, with the whole suite green. This reads the method's own source
      // so the two cannot drift.
      //
      // What it does NOT see: the match stops at the first `}` sitting at two
      // spaces, which today is the method's own close, because no nested block
      // closes at that indent. A template literal in the body containing such a
      // line would truncate the match and hide the tail. There is none; check
      // this comment if one is ever added.
      const builderPath = resolve(import.meta.dirname, '..', 'src', 'lib', 'bliss-svg-builder.js');
      // `\r?` on both ends: this tree checks out CRLF, and an anchor written
      // with bare \n matches nothing, which would pass the method off as
      // missing rather than as unchanged.
      const body = readFileSync(builderPath, 'utf8').match(/#computeGeometry\(\) \{([\s\S]*?)\r?\n {2}\}\r?\n/);
      expect(body, '#computeGeometry not found in bliss-svg-builder.js').not.toBeNull();
      const read = [...body[1].matchAll(/#processedOptions\.(\w+)/g)].map((m) => m[1]);
      expect(read.length).toBeGreaterThan(0);
      expect([...new Set(read)].sort()).toEqual([...COMPUTED_GEOMETRY_INPUTS].sort());
    });
  });
});
