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
 * Covers (Codex-formulated property 4 of the run-to-stable Phase 3 spec):
 * - No throw across construction, rendering, toString(), and toJSON() (within
 *   the documented 10,000-char input cap; see Does NOT cover).
 * - No non-finite geometry (NaN/Infinity) in the rendered SVG for inputs whose
 *   numeric values fit in a double-precision float (the fuzz's numeric range).
 * - No hang (enforced by the vitest test timeout).
 *
 * Does NOT cover:
 * - Round-trip / idempotence, which malformed input cannot satisfy (it drops by
 *   design); see `BlissSVGBuilder.serialization-roundtrip.property.test.js`.
 * - The specific warning code emitted for a given malformation; that is pinned
 *   by the example-based parser/warning suites.
 * - Numeric values large enough to OVERFLOW a double (>=309 integer digits in a
 *   coordinate, `min-width`, `margin`, `RK`/`AK`, ...) render silently non-finite
 *   SVG (`width="Infinity"`/`"NaN"`, zero warnings). This is a registered,
 *   currently-deferred library gap (`.claude/backlog/option-content-validation.md`,
 *   "malformed NUMERIC option values"). The 40-char fuzz bound cannot reach the
 *   ~1.8e308 threshold, so the NaN/Infinity check above cannot exercise it at gate
 *   scope; the `it.todo` below is the tripwire for when that gap is fixed.
 * - Runaway output: `MAX_OUTPUT_CHARS` is a generous backstop that the bounded
 *   input (linear expansion, <=10k input cap) cannot reach at gate scope; it
 *   guards against a future superlinear regression, not a currently-reachable one.
 * - Inputs past the documented 10,000-char cap, which THROW by design (a DoS
 *   guard, `bliss-parser.js`); the fuzz stays far under it.
 */

const config = { seed: SEED, numRuns: FUZZ_RUNS };

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
          // bound cannot assemble (see the header + the it.todo below).
          expect(svg).not.toMatch(/NaN|Infinity/);
          expect(svg.length).toBeLessThan(MAX_OUTPUT_CHARS);
        }),
        config,
      );
    });

    // Tripwire for the registered numeric-value-validation gap
    // (.claude/backlog/option-content-validation.md, "malformed NUMERIC option
    // values"). A >=309-digit numeric coordinate / min-width / margin / RK
    // overflows a double to Infinity/NaN and lands in the SVG silently; the
    // 40-char fuzz cannot reach the ~1.8e308 threshold, so the NaN/Infinity
    // assertion above is dead at gate scope. When that gap is fixed (overflow
    // warns or clamps instead of emitting non-finite SVG), implement this with a
    // huge-numeric arbitrary so the finite-geometry check gains real teeth.
    it.todo('warns or clamps numeric values that overflow a double (option-content-validation.md)');
  });
});
