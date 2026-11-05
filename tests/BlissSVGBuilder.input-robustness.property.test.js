import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BlissSVGBuilder } from '../src/index.js';
import { boundedInputArb, SEED, FUZZ_RUNS, MAX_OUTPUT_CHARS } from './utils/property-arbitraries.js';

/**
 * Pins the input-robustness invariant over a GENERATED space of malformed and
 * near-valid strings. This file uses property-based testing (fast-check): the
 * `boundedInputArb` mutator (see `tests/utils/property-arbitraries.js`) emits
 * bounded random noise plus corrupted valid compositions, and the builder must
 * degrade gracefully on all of them. Recoverable problems become warnings, not
 * exceptions (the library's stated contract), so this is the no-crash net that
 * hand-written example tests almost never sweep.
 *
 * A fixed seed + fixed run count make this a deterministic release gate; a
 * failure prints the seed and a shrunk counterexample for replay.
 *
 * Covers:
 * - No throw across construction, rendering, toString(), and toJSON() (within
 *   the documented 10,000-char input cap; see Does NOT cover).
 * - No non-finite geometry (NaN/Infinity) in the rendered SVG for inputs whose
 *   numeric values fit in a double-precision float (the fuzz's numeric range).
 * - A number too large for a double (>=309 integer digits, either sign) written
 *   where the DSL reads a number (a coordinate, `RK`/`AK`, a numeric option)
 *   draws finite SVG and is reported. The 40-char fuzz cannot reach the ~1.8e308
 *   threshold, so a separate generator writes these numbers into each such slot.
 * - No hang (enforced by the vitest test timeout).
 *
 * Does NOT cover:
 * - Round-trip / idempotence, which malformed input cannot satisfy (it drops by
 *   design); see `BlissSVGBuilder.serialization-roundtrip.property.test.js`.
 * - The specific warning code emitted for a given malformation; that is pinned
 *   by the example-based parser/warning suites.
 * - Runaway output: `MAX_OUTPUT_CHARS` is a generous backstop that the bounded
 *   input (linear expansion, <=10k input cap) cannot reach at gate scope; it
 *   guards against a future superlinear regression, not a currently-reachable one.
 * - Inputs past the documented 10,000-char cap, which THROW by design (a DoS
 *   guard, `bliss-parser.js`); the fuzz stays far under it.
 */

const config = { seed: SEED, numRuns: FUZZ_RUNS };

// Each slot the DSL reads as a number, with `#` where the number goes.
// `svg-height` sits on a wide picture: the width is derived from the height by
// the picture's ratio, and only a ratio above ~1.8 carries a huge height past
// the double's range.
const NUMERIC_SLOTS = [
  'B313:#,0', 'B313:0,#', 'B313/RK:#/B291', 'B313/AK:#/B291', '[x=#]B313', '[y=#]B313',
  '[margin=#]||B313', '[min-width=#]||B313', '[crop=#]||B313', '[crop-right=#]||B313',
  '[svg-height=#]||B313/B313/B313/B313/B313', '[stroke-width=#]||B313',
  '[char-space=#]||B313/B291', '[word-space=#]||B313//B291', '[relative-kerning=#]B291',
  '[grid;grid-shift=#]||B313',
];

// A number past what a double holds (~1.8e308), either sign, in one of the slots.
const overflowInputArb = fc
  .tuple(fc.constantFrom(...NUMERIC_SLOTS), fc.constantFrom('', '-'), fc.integer({ min: 309, max: 400 }))
  .map(([slot, sign, digits]) => slot.replace('#', `${sign}${'9'.repeat(digits)}`));

describe('BlissSVGBuilder input robustness (property-based)', { tags: ['@property'] }, () => {
  describe('when constructing from an arbitrary bounded string', () => {
    it('does not throw across construction, rendering, and serialization', () => {
      fc.assert(
        fc.property(boundedInputArb, (s) => {
          let b;
          expect(() => { b = new BlissSVGBuilder(s); }).not.toThrow();
          expect(() => b.svgCode).not.toThrow();
          expect(() => b.toString()).not.toThrow();
          expect(() => b.toJSON()).not.toThrow();
        }),
        config,
      );
    });

    it('renders finite SVG within the output bound', () => {
      fc.assert(
        fc.property(boundedInputArb, (s) => {
          const svg = new BlissSVGBuilder(s).svgCode;
          expect(typeof svg).toBe('string');
          // No false positive: the fuzz alphabet cannot spell 'NaN'/'Infinity',
          // so any match is geometry the renderer emitted, not passed-through
          // input. Note this catches ARITHMETIC non-finiteness only; a numeric
          // value that OVERFLOWS a double needs >=309 digits, which the 40-char
          // bound cannot assemble (the next describe covers that).
          expect(svg).not.toMatch(/NaN|Infinity/);
          expect(svg.length).toBeLessThan(MAX_OUTPUT_CHARS);
        }),
        config,
      );
    });
  });

  describe('when a number too large for a double fills a numeric slot', () => {
    it('renders finite SVG and reports the value', () => {
      fc.assert(
        fc.property(overflowInputArb, (s) => {
          const b = new BlissSVGBuilder(s);
          expect(b.svgCode).not.toMatch(/NaN|Infinity/);
          expect(b.warnings.length).toBeGreaterThan(0);
        }),
        config,
      );
    });
  });
});
