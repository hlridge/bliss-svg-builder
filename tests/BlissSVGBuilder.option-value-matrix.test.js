import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import {
  NUMERIC_OPTION_POLICY, KNOWN_OPTION_KEYS, GLOBAL_ONLY_OPTION_KEYS,
} from '../src/lib/bliss-constants.js';
import { SVG_ATTRIBUTE_NAMES, normalizeAttributeName } from '../src/lib/bliss-svg-attribute-names.js';

/**
 * Pins the value gate as a MATRIX rather than as a sample: every gated numeric
 * option, every value a number cannot carry, every surface that can write one.
 * The sibling files pin the rule; this one pins that no key and no surface is
 * an exception to it.
 *
 * The whole table is derived from `NUMERIC_OPTION_POLICY`, so an option added
 * to the vocabulary is covered on every surface the day it lands, and an
 * option removed takes its rows with it. Nothing here is hand-listed except
 * the carriers, and those carry their own guard.
 *
 * Covers:
 * - The six values that are refused whatever the key is (non-finite either
 *   way, `NaN`, a word, an empty value, a bare key), asserted on six
 *   composition-scope surfaces at once: a bracket, the options argument in
 *   both spellings, a composition object in both spellings, and the transient
 *   channel. Each cell asserts the picture is byte-identical to the one the
 *   same composition draws with the option unwritten, plus the exact warning
 *   code and the exact `source`.
 * - The seventh value, a negative one, which splits on the policy's own `kind`:
 *   refused on a LENGTH, honoured on an OFFSET, derived from the table rather
 *   than listed.
 * - The eighth, a value at the top of the double range, which is never refused
 *   by this gate on any key or any surface. That is the no-upper-bound ruling
 *   stated across the whole vocabulary at once.
 * - The four element-scope surfaces (a bracket at character scope, `addGlyph`,
 *   `setOptions`, `setTransientOptions`) on the five keys that are legal at
 *   element scope.
 * - A LEGAL value on every key: the six composition surfaces draw one picture
 *   between them, byte for byte, and warn nothing. A refusal matrix alone
 *   passes against a build where nothing is honoured anywhere.
 * - That every carrier below can actually fail: two legal values render
 *   differently on it, so a row written on it is not asserting a difference
 *   that can never appear.
 * - The disjointness the contract's precedence rule rests on: the curated
 *   vocabulary and the names a standard owns share exactly `stroke-width` and
 *   `color`.
 * - A refused value surviving `toString()` unchanged, warning again on
 *   reparse, and never accumulating across repeated reads.
 *
 * Does NOT cover:
 * - What a refusal MEANS for each option, its message wording, the bulk-versus-
 *   specific interaction and the computed-geometry overflow a huge but legal
 *   value causes, all in `BlissSVGBuilder.option-value-gate.test.js`.
 * - `stroke-width`'s own four-scope behaviour, see
 *   `BlissSVGBuilder.stroke-width-range.test.js`.
 * - The string half of the gate, see `BlissSVGBuilder.text-option-values.test.js`.
 * - How a written NAME is resolved and republished, see
 *   `BlissSVGBuilder.attribute-naming-contract.test.js`.
 * - A global-only key written at element scope, which is silently kept and
 *   re-emitted on the mutation surfaces while a bracket reports
 *   `MISPLACED_GLOBAL_OPTION`. That divergence is chunk C14's, not this
 *   gate's, which is why the element-scope rows below are scoped to the five
 *   keys both kinds of surface accept.
 */

// A composition each key demonstrably acts on, plus whatever else has to be
// written for it to act at all. The six grid widths draw nothing without a
// `grid`, so their carrier writes one; `min-width` is inert below the natural
// width, so its legal pair is wider. Both are asserted, not assumed, by the
// carrier guard at the foot of this file.
const CARRIER = {
  'stroke-width': { code: 'B291' },
  'dot-width': { code: 'B4' },
  'dot-extra-width': { code: 'B4' },
  'sdot-width': { code: 'SDOT' },
  'sdot-extra-width': { code: 'SDOT' },
  'char-space': { code: 'B291/B291' },
  'word-space': { code: 'B291//B291' },
  'external-glyph-space': { code: 'Xm/XV/XA' },
  'grid-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
  'grid-major-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
  'grid-medium-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
  'grid-minor-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
  'grid-sky-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
  'grid-earth-stroke-width': { code: 'B291', dsl: 'grid;', js: { grid: true } },
};

const carrierFor = (key) => ({ code: 'B291', dsl: '', js: {}, ...CARRIER[key] });

const camel = (key) => key.replace(/-(.)/g, (_, letter) => letter.toUpperCase());

const GATED_KEYS = [...NUMERIC_OPTION_POLICY.keys()];
const ELEMENT_SCOPE_KEYS = GATED_KEYS.filter((key) => !GLOBAL_ONLY_OPTION_KEYS.has(key));

// `written` is the text the report quotes back after the key; `null` is the
// bare form, which has no value to quote.
const REFUSED = [
  { label: 'above what a double can hold', js: Infinity, dsl: '=Infinity', written: 'Infinity', code: 'OUT_OF_RANGE_OPTION_VALUE' },
  { label: 'below what a double can hold', js: -Infinity, dsl: '=-Infinity', written: '-Infinity', code: 'OUT_OF_RANGE_OPTION_VALUE' },
  { label: 'a number that is not a number', js: NaN, dsl: '=NaN', written: 'NaN', code: 'INVALID_OPTION_VALUE' },
  { label: 'a word', js: 'abc', dsl: '=abc', written: 'abc', code: 'INVALID_OPTION_VALUE' },
  { label: 'nothing after the equals sign', js: '', dsl: '=', written: '', code: 'INVALID_OPTION_VALUE' },
  { label: 'the bare key', js: true, dsl: '', written: null, code: 'INVALID_OPTION_VALUE' },
];

const NEGATIVE = { js: -5, dsl: '=-5', written: '-5' };
const AT_THE_TOP_OF_THE_RANGE = { js: 1e308, dsl: '=1e308' };

const objectWith = (carrier, options) => {
  const composition = new BlissSVGBuilder(carrier.code, carrier.js).toJSON();
  composition.options = { ...(composition.options ?? {}), ...options };
  return new BlissSVGBuilder(composition);
};

const transientWith = (carrier, options) => {
  const builder = new BlissSVGBuilder(carrier.code, carrier.js);
  builder.setTransientOptions(options);
  return builder;
};

// Every way a value can reach a gated key on the composition itself. Each
// entry takes the key and one row of the value table and returns a builder;
// `base` is the same surface with nothing written, which is what a refusal
// has to match byte for byte.
const COMPOSITION_SURFACES = {
  'a bracket': {
    base: (c) => new BlissSVGBuilder(c.dsl ? `[${c.dsl.slice(0, -1)}]||${c.code}` : c.code),
    write: (c, key, value) => new BlissSVGBuilder(`[${c.dsl}${key}${value.dsl}]||${c.code}`),
  },
  'the options argument': {
    base: (c) => new BlissSVGBuilder(c.code, c.js),
    write: (c, key, value) => new BlissSVGBuilder(c.code, { ...c.js, [key]: value.js }),
  },
  'the options argument in camelCase': {
    base: (c) => new BlissSVGBuilder(c.code, c.js),
    write: (c, key, value) => new BlissSVGBuilder(c.code, { ...c.js, [camel(key)]: value.js }),
  },
  'a composition object': {
    base: (c) => objectWith(c, {}),
    write: (c, key, value) => objectWith(c, { [key]: value.js }),
  },
  'a composition object in camelCase': {
    base: (c) => objectWith(c, {}),
    write: (c, key, value) => objectWith(c, { [camel(key)]: value.js }),
  },
  'the transient channel': {
    base: (c) => transientWith(c, {}),
    write: (c, key, value) => transientWith(c, { [camel(key)]: value.js }),
  },
};

const ELEMENT_SURFACES = {
  'a bracket at character scope': {
    base: (c) => new BlissSVGBuilder(c.code),
    write: (c, key, value) => new BlissSVGBuilder(`[${key}${value.dsl}]${c.code}`),
  },
  addGlyph: {
    base: (c) => new BlissSVGBuilder('').addGlyph(c.code),
    write: (c, key, value) => new BlissSVGBuilder('').addGlyph(c.code, { [key]: value.js }),
  },
  setOptions: {
    base: (c) => new BlissSVGBuilder(c.code),
    write: (c, key, value) => {
      const builder = new BlissSVGBuilder(c.code);
      builder.glyph(0).setOptions({ [camel(key)]: value.js });
      return builder;
    },
  },
  setTransientOptions: {
    base: (c) => new BlissSVGBuilder(c.code),
    write: (c, key, value) => {
      const builder = new BlissSVGBuilder(c.code);
      builder.glyph(0).setTransientOptions({ [camel(key)]: value.js });
      return builder;
    },
  },
};

// What one cell of the matrix reports, in the shape the expectations below are
// written in. `picture` says whether the option reached the drawing at all.
const cell = (builder, baseline) => ({
  picture: builder.svgCode === baseline ? 'unchanged' : 'moved',
  codes: builder.warnings.map((w) => w.code),
  sources: builder.warnings.map((w) => w.source),
});

const refusedCell = (key, value) => ({
  picture: 'unchanged',
  codes: [value.code],
  sources: [value.written === null ? key : `${key}=${value.written}`],
});

const across = (surfaces, key, value) => Object.fromEntries(
  Object.entries(surfaces).map(([name, surface]) => {
    const carrier = carrierFor(key);
    return [name, cell(surface.write(carrier, key, value), surface.base(carrier).svgCode)];
  })
);

const sameOnEvery = (surfaces, expected) => Object.fromEntries(
  Object.keys(surfaces).map((name) => [name, expected])
);

// Every surface's rendered picture, deduplicated. Parity holds when one
// picture comes back: `across` only proves each surface moved from its OWN
// baseline, which several different pictures would also satisfy.
const distinctPictures = (surfaces, key, value) => [...new Set(
  Object.values(surfaces).map((surface) => surface.write(carrierFor(key), key, value).svgCode)
)];

const LEGAL_PAIR = { length: [0.4, 1.7], offset: [1, 4] };
// B291 is already wider than any small number, so min-width only bites above
// the natural width. Measured, not guessed: 0.4 and 1.7 render identically.
const LEGAL_PAIR_OVERRIDE = { 'min-width': [12, 30] };
const legalPairFor = (key) => LEGAL_PAIR_OVERRIDE[key] ?? LEGAL_PAIR[NUMERIC_OPTION_POLICY.get(key).kind];

describe('BlissSVGBuilder option value matrix', () => {
  describe('when a value no number can carry is written on a gated key', () => {
    // pins the gate itself, the type check in front of Number(), the non-finite
    // arm and the bare-key source: each of those four mutants turns 31 or more
    // of these rows red (hand-applied 2026-09-17).
    it.each(GATED_KEYS)('%s refuses all six of them identically on every composition surface', (key) => {
      const matrix = Object.fromEntries(
        REFUSED.map((value) => [value.label, across(COMPOSITION_SURFACES, key, value)])
      );
      const expected = Object.fromEntries(
        REFUSED.map((value) => [value.label, sameOnEvery(COMPOSITION_SURFACES, refusedCell(key, value))])
      );
      expect(matrix).toEqual(expected);
    });

    it.each(ELEMENT_SCOPE_KEYS)('%s refuses all six on the element surfaces too', (key) => {
      const matrix = Object.fromEntries(
        REFUSED.map((value) => [value.label, across(ELEMENT_SURFACES, key, value)])
      );
      const expected = Object.fromEntries(
        REFUSED.map((value) => [value.label, sameOnEvery(ELEMENT_SURFACES, refusedCell(key, value))])
      );
      expect(matrix).toEqual(expected);
    });
  });

  // The two arms are read off the policy's own `kind`, so swapping the word in
  // the source turns both sets red at once (hand-applied 2026-09-17).
  describe('when a negative value is written on a gated key', () => {
    const lengths = GATED_KEYS.filter((key) => NUMERIC_OPTION_POLICY.get(key).kind === 'length');
    const offsets = GATED_KEYS.filter((key) => NUMERIC_OPTION_POLICY.get(key).kind === 'offset');

    it.each(lengths)('%s refuses it on every surface, because a length cannot be negative', (key) => {
      expect(across(COMPOSITION_SURFACES, key, NEGATIVE)).toEqual(
        sameOnEvery(COMPOSITION_SURFACES, {
          picture: 'unchanged',
          codes: ['OUT_OF_RANGE_OPTION_VALUE'],
          sources: [`${key}=-5`],
        })
      );
    });

    it.each(offsets)('%s honours it in silence on every surface, because an offset can be', (key) => {
      expect(across(COMPOSITION_SURFACES, key, NEGATIVE)).toEqual(
        sameOnEvery(COMPOSITION_SURFACES, { picture: 'moved', codes: [], sources: [] })
      );
    });
  });

  describe('when a value at the top of the double range is written', () => {
    it.each(GATED_KEYS)('%s never refuses it, because the table carries no upper bound', (key) => {
      // pins the seven removed ceilings as a property of the whole vocabulary:
      // a restored ceiling on any one key turns one of these cells red.
      const reported = Object.values(across(COMPOSITION_SURFACES, key, AT_THE_TOP_OF_THE_RANGE))
        .flatMap((c) => c.codes);
      expect(reported).not.toContain('OUT_OF_RANGE_OPTION_VALUE');
      expect(reported).not.toContain('INVALID_OPTION_VALUE');
    });
  });

  describe('when a legal value is written on a gated key', () => {
    it.each(GATED_KEYS)('%s draws one picture, whichever of the six surfaces writes it', (key) => {
      const [, high] = legalPairFor(key);
      const value = { js: high, dsl: `=${high}` };
      expect(distinctPictures(COMPOSITION_SURFACES, key, value)).toHaveLength(1);
      expect(across(COMPOSITION_SURFACES, key, value)).toEqual(
        sameOnEvery(COMPOSITION_SURFACES, { picture: 'moved', codes: [], sources: [] })
      );
    });

    it.each(GATED_KEYS)('%s draws differently at a second legal value, so a row on it can fail', (key) => {
      const carrier = carrierFor(key);
      const [low, high] = legalPairFor(key);
      const at = (value) => new BlissSVGBuilder(carrier.code, { ...carrier.js, [key]: value });
      expect(at(low).warnings).toEqual([]);
      expect(at(low).svgCode).not.toBe(at(high).svgCode);
    });
  });

  describe('when the curated vocabulary is compared with the names a standard owns', () => {
    const owned = new Set([...SVG_ATTRIBUTE_NAMES].map(normalizeAttributeName));

    it('shares exactly stroke-width and color, which is what the precedence rule is for', () => {
      const shared = [...KNOWN_OPTION_KEYS].filter((key) => owned.has(normalizeAttributeName(key)));
      expect(shared.sort()).toEqual(['color', 'stroke-width']);
    });

    it('shares only stroke-width once the curated names are spelled in camelCase', () => {
      const shared = [...KNOWN_OPTION_KEYS]
        .filter((key) => key.includes('-'))
        .filter((key) => owned.has(normalizeAttributeName(camel(key))));
      expect(shared).toEqual(['stroke-width']);
    });
  });

  describe('when a refused value is read back and written out again', () => {
    it('keeps the value the author wrote rather than the one it fell back to', () => {
      const builder = new BlissSVGBuilder('[char-space=abc]||B291/B291');
      expect(builder.toString()).toBe('[char-space=abc]||B291/B291');
    });

    it('reports it again when that string is read back in', () => {
      const reparsed = new BlissSVGBuilder(new BlissSVGBuilder('[char-space=abc]||B291/B291').toString());
      expect(reparsed.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('does not accumulate the report across repeated reads of the picture', () => {
      const builder = new BlissSVGBuilder('[char-space=abc]||B291/B291');
      builder.svgCode;
      builder.svgCode;
      expect(builder.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
    });
  });
});
