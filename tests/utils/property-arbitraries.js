/**
 * fast-check arbitraries for the property-based layer (Phase 3 bootstrap).
 *
 * TWO separate generators, per the ratified spec: malformed input drops by
 * design (post-2.1) and cannot satisfy the valid-input round-trip properties,
 * so it never feeds them.
 *
 * - `validCompositionArb` — the valid-AST generator. Emits well-formed DSL over
 *   a curated pool of BUILT-IN codes and the documented grammar. Every element
 *   was verified (temp/probe-phase3-*.mjs) to render with ZERO warnings and be
 *   svg-round-trip + toString-idempotent stable, so a counterexample from
 *   properties 1-3 is a real library regression, not a bad fixture.
 * - `boundedInputArb` — the malformed-string mutator. Bounded random strings
 *   plus near-valid corruptions, for the no-crash robustness property only.
 *
 * Deliberately OUT of the valid-AST generator (documented exclusions, matching
 * the ratified 1.0.0 contract): custom define()d codes (not portable), external
 * X-characters and letter aliases B29-B80 (experimental/environment-dependent
 * font path, decision 9), and the registered post-1.0.0 lossy facets. These are
 * a future expansion wave, not the core bootstrap.
 */

import fc from 'fast-check';

// ==== Verified code pools (temp/probe-phase3-atomic.mjs) ====

/**
 * Atomic base glyphs: `toString() === code`, zero-warning, svg-rt stable, and
 * safe carrying parts. Excludes the indicator-ish compounds B97/B98/B99, which
 * trip MISPLACED_INDICATOR_PART when not in the trailing slot.
 */
export const BASE_CODES = [
  'B291', 'B313', 'B208', 'B431', 'B119', 'B138', 'B143', 'B355', 'B464',
  'B270', 'B101', 'B102', 'B120', 'B156', 'B440', 'B506',
];

/** True indicators: valid in the trailing `;` slot AND the `;;` word overlay. */
export const CHAR_INDICATORS = ['B81', 'B86', 'B90'];

/** Non-indicator shapes, zero-warning in ANY (incl. non-trailing) `;`-part slot. */
export const PART_SHAPES = ['C8', 'H', 'C1', 'C2', 'C4'];

// ==== Release-gate config: fixed seed + fixed run counts = deterministic gate ====

/** Fixed seed so the property run is a reproducible release gate. */
export const SEED = 424242;

/** Run count for the valid-AST round-trip properties (the release gate). */
export const VALID_AST_RUNS = 300;

/** Run count for the malformed-input robustness property (the release gate). */
export const FUZZ_RUNS = 1000;

/**
 * Runaway-output cap. A bounded (<=40 char) input cannot legitimately render
 * this much SVG; exceeding it signals superlinear blowup.
 */
export const MAX_OUTPUT_CHARS = 500_000;

// ==== Option-value arbitraries ====

// n-free color values so the fuzz non-finite check ('NaN'/'Infinity') can never
// false-positive on an input-passed-through option value.
const colorArb = fc.constantFrom('red', 'blue', 'black', 'gray', '#369', '#33aa77');
const strokeArb = fc.constantFrom('0.5', '1', '1.5', '2');

// Element-level bracket: color / stroke-width / both. The "both" form uses two
// distinct keys, so no bracket ever risks a DUPLICATE_KEY warning.
const elementBracketArb = fc.oneof(
  colorArb.map((v) => `[color=${v}]`),
  strokeArb.map((v) => `[stroke-width=${v}]`),
  fc.tuple(colorArb, strokeArb).map(([c, s]) => `[color=${c},stroke-width=${s}]`),
);

// Global-level bracket: element brackets plus single global-only options.
const globalBracketArb = fc.oneof(
  elementBracketArb,
  fc.integer({ min: 0, max: 5 }).map((v) => `[margin=${v}]`),
  fc.integer({ min: 0, max: 5 }).map((v) => `[word-space=${v}]`),
  fc.constantFrom('0.5', '1', '1.5', '2').map((v) => `[char-space=${v}]`),
  fc.integer({ min: 1, max: 30 }).map((v) => `[min-width=${v}]`),
);

const coordValueArb = fc.constantFrom(-3, -2, -1.5, -1, 1, 1.5, 2, 3);
const kernValueArb = fc.constantFrom(-2, -1.5, -1, 1, 1.5, 2, 3);

// ==== Structural arbitraries (built inside-out) ====

// A non-trailing `;`-part: an optional part-option (the `>` form), a shape, and
// optional coordinates. e.g. `[color=red]>C8:2,3`.
const partArb = fc.record({
  option: fc.option(elementBracketArb, { nil: undefined }),
  shape: fc.constantFrom(...PART_SHAPES),
  coords: fc.option(fc.tuple(coordValueArb, coordValueArb), { nil: undefined }),
}).map(({ option, shape, coords }) => {
  const prefix = option ? `${option}>` : '';
  const suffix = coords ? `:${coords[0]},${coords[1]}` : '';
  return `${prefix}${shape}${suffix}`;
});

// A glyph: optional option prefix, a base, zero or more shape parts, and an
// optional TRAILING indicator (the only position 1.2 lets an indicator hold).
const glyphArb = fc.record({
  option: fc.option(elementBracketArb, { nil: undefined }),
  base: fc.constantFrom(...BASE_CODES),
  parts: fc.array(partArb, { minLength: 0, maxLength: 2 }),
  indicator: fc.option(fc.constantFrom(...CHAR_INDICATORS), { nil: undefined }),
}).map(({ option, base, parts, indicator }) => {
  let s = (option ?? '') + base;
  for (const p of parts) s += `;${p}`;
  if (indicator) s += `;${indicator}`;
  return s;
});

// A word: optional word-option prefix, `/`-joined glyphs with optional kerning
// markers between them, an optional `^` head marker on one glyph, and an
// optional `;;` word-indicator overlay.
const wordArb = fc.record({
  option: fc.option(elementBracketArb, { nil: undefined }),
  glyphs: fc.array(glyphArb, { minLength: 1, maxLength: 3 }),
  kernings: fc.array(
    fc.option(fc.tuple(fc.constantFrom('RK', 'AK'), kernValueArb), { nil: undefined }),
    { minLength: 3, maxLength: 3 },
  ),
  headIndex: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  overlay: fc.option(
    fc.oneof(fc.constantFrom(...CHAR_INDICATORS).map((c) => `;;${c}`), fc.constant(';;!')),
    { nil: undefined },
  ),
}).map(({ option, glyphs, kernings, headIndex, overlay }) => {
  const tokens = glyphs.map((g, i) => {
    let t = g;
    if (headIndex === i) t += '^';
    if (i > 0 && kernings[i]) t = `${kernings[i][0]}:${kernings[i][1]}/${t}`;
    return t;
  });
  let s = (option ? `${option}|` : '') + tokens.join('/');
  if (overlay) s += overlay;
  return s;
});

/**
 * The valid-AST generator: an optional global-option prefix and `//`-joined
 * words. Every output is well-formed DSL over built-in codes.
 */
export const validCompositionArb = fc.record({
  globalOption: fc.option(globalBracketArb, { nil: undefined }),
  words: fc.array(wordArb, { minLength: 1, maxLength: 3 }),
}).map(({ globalOption, words }) => (globalOption ? `${globalOption}||` : '') + words.join('//'));

// ==== Malformed-input arbitraries ====

// DSL-relevant alphabet. Deliberately excludes the letters that spell 'NaN' /
// 'Infinity' (no 'N', 'f', 'i', 't', 'y'), so the non-finite-geometry check
// cannot false-positive on a passed-through value; 'α' and '界' stress unicode.
const FUZZ_ALPHABET = [
  'B', '2', '9', '1', '3', '0', '5', '/', ';', ':', '[', ']', ',', '=', '^',
  '|', '.', '-', '+', 'X', 'C', 'H', 'T', 'S', 'P', 'Q', 'R', 'K', 'A', ' ',
  '!', '{', '}', '(', ')', '#', 'a', 'α', '界',
];

const malformedStringArb = fc.string({
  unit: fc.constantFrom(...FUZZ_ALPHABET),
  minLength: 0,
  maxLength: 40,
});

// Apply a bounded list of single-character edits to a string.
const applyEdits = (s, edits) => {
  const chars = [...s];
  for (const { pos, kind, ch } of edits) {
    if (chars.length === 0 && kind !== 'ins') continue;
    const i = chars.length ? pos % chars.length : 0;
    if (kind === 'ins') chars.splice(i, 0, ch);
    else if (kind === 'del') chars.splice(i, 1);
    else chars[i] = ch;
  }
  return chars.join('');
};

// Near-valid corruptions: a valid composition with a few characters mutated.
// These probe the parser right at the boundary of valid syntax.
const mutatedStringArb = fc.tuple(
  validCompositionArb,
  fc.array(
    fc.record({
      pos: fc.integer({ min: 0, max: 60 }),
      kind: fc.constantFrom('ins', 'del', 'rep'),
      ch: fc.constantFrom(...FUZZ_ALPHABET),
    }),
    { minLength: 1, maxLength: 5 },
  ),
).map(([s, edits]) => applyEdits(s, edits));

/**
 * The malformed-string mutator: pure random noise plus near-valid corruptions.
 * Feeds the no-crash robustness property only.
 */
export const boundedInputArb = fc.oneof(malformedStringArb, mutatedStringArb);
