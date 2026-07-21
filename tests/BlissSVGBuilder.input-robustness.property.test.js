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
 * - No throw across construction, rendering, toString(), and toJSON().
 * - No non-finite geometry (NaN/Infinity) in the rendered SVG.
 * - No runaway output (bounded input cannot expand past MAX_OUTPUT_CHARS).
 * - No hang (enforced by the vitest test timeout).
 *
 * Does NOT cover:
 * - Round-trip / idempotence, which malformed input cannot satisfy (it drops by
 *   design); see `BlissSVGBuilder.serialization-roundtrip.property.test.js`.
 * - The specific warning code emitted for a given malformation; that is pinned
 *   by the example-based parser/warning suites.
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
          // The fuzz alphabet cannot spell 'NaN'/'Infinity', so any match is
          // non-finite geometry the renderer emitted, not passed-through input.
          expect(svg).not.toMatch(/NaN|Infinity/);
          expect(svg.length).toBeLessThan(MAX_OUTPUT_CHARS);
        }),
        config,
      );
    });
  });
});
