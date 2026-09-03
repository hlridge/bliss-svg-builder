import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { NUMERIC_OPTION_POLICY, KNOWN_OPTION_KEYS } from '../src/lib/bliss-constants.js';

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
 * - The transcription of `NUMERIC_OPTION_POLICY` itself: membership against
 *   `KNOWN_OPTION_KEYS`, a complete row per key, and the absence of any
 *   upper bound.
 *
 * Does NOT cover:
 * - The nineteen keys gated in the following task (`stroke-width`, the five
 *   margins, `min-width`, the five crops, `svg-height` and the six grid stroke
 *   widths). Their rows are added to this file there. **The policy table's
 *   `offset` arm is therefore unexercised by behaviour here**, because all
 *   seven keys gated in this task are lengths: the negative-is-honoured half of
 *   the rule arrives with the margins and crops.
 * - A geometry that overflows out of accepted values (`[margin=1e308]`, or a
 *   single `[char-space=1e308]` reaching the six-times width multiplier),
 *   which no input gate can see because every value going in was legal.
 * - The camelCase namespace collision, see
 *   `BlissSVGBuilder.option-namespace-split.test.js`.
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
  crop: 'B291',
  'crop-top': 'B291',
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
    // Non-finite is refused for both kinds of quantity; only the negative rule
    // splits them, and the offset half of that split lands with the margins.
    it.each([
      ['char-space', 'Infinity'], ['char-space', '-Infinity'], ['char-space', '-5'],
      ['word-space', '-5'],
      ['dot-width', '-1'],
    ])('refuses %s=%s with OUT_OF_RANGE_OPTION_VALUE', (key, value) => {
      const dsl = `[${key}=${value}]||${CARRIER[key]}`;
      expect(render(dsl).svgCode).toBe(plain(key));
      expect(codes(dsl)).toEqual(['OUT_OF_RANGE_OPTION_VALUE']);
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
});
