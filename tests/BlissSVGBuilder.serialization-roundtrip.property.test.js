import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BlissSVGBuilder } from '../src/index.js';
import { validCompositionArb, SEED, VALID_AST_RUNS } from './utils/property-arbitraries.js';

/**
 * Pins the serialization round-trip invariants over a GENERATED space of valid
 * compositions. This file uses property-based testing (fast-check): the
 * `validCompositionArb` generator (see `tests/utils/property-arbitraries.js`)
 * emits well-formed DSL over built-in codes, and each property must hold for
 * every generated input. It is the randomized-sweep complement to the
 * example-based `BlissSVGBuilder.round-trip.test.js` and
 * `BlissSVGBuilder.svg-code-idempotency.test.js`.
 *
 * A fixed seed + fixed run count make this a deterministic release gate; a
 * failure prints the seed and a shrunk counterexample for replay.
 *
 * Covers (Codex-formulated properties 1-3 of the run-to-stable Phase 3 spec):
 * - Generated valid compositions emit zero warnings (generator-scope + the
 *   library invariant that well-formed built-in input does not spuriously warn).
 * - toString() idempotence: canonicalize(canonicalize(s)) === canonicalize(s).
 * - svg round-trip: rebuilding from toString() renders byte-identical SVG.
 * - toJSON round-trip: rebuilding from EMITTED toJSON() yields a structurally
 *   identical toJSON().
 *
 * Does NOT cover:
 * - Robustness on malformed/arbitrary strings (no-crash); see
 *   `BlissSVGBuilder.input-robustness.property.test.js`.
 * - Custom define()d codes, external X-characters, and letter aliases B29-B80:
 *   deliberately excluded from the generator (not portable / experimental font
 *   path per the 1.0.0 contract); a future expansion wave.
 * - The toJSON()/toString() output FORMAT itself; see
 *   `BlissSVGBuilder.json-output.test.js` / `.string-output.test.js`.
 */

const config = { seed: SEED, numRuns: VALID_AST_RUNS };
const canonicalize = (s) => new BlissSVGBuilder(s).toString();

describe('BlissSVGBuilder serialization round-trip (property-based)', { tags: ['@property'] }, () => {
  describe('when the generated composition is well-formed', () => {
    it('emits zero warnings for every generated composition', () => {
      fc.assert(
        fc.property(validCompositionArb, (s) => {
          expect(new BlissSVGBuilder(s).warnings).toHaveLength(0);
        }),
        config,
      );
    });
  });

  describe('when re-serializing through toString()', () => {
    it('is idempotent under repeated canonicalization', () => {
      fc.assert(
        fc.property(validCompositionArb, (s) => {
          const once = canonicalize(s);
          expect(canonicalize(once)).toBe(once);
        }),
        config,
      );
    });
  });

  describe('when rebuilding from toString()', () => {
    it('renders byte-identical SVG', () => {
      fc.assert(
        fc.property(validCompositionArb, (s) => {
          const b = new BlissSVGBuilder(s);
          expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
        }),
        config,
      );
    });
  });

  describe('when rebuilding from emitted toJSON()', () => {
    it('produces a structurally identical toJSON()', () => {
      fc.assert(
        fc.property(validCompositionArb, (s) => {
          const emitted = new BlissSVGBuilder(s).toJSON();
          const rebuilt = new BlissSVGBuilder(emitted).toJSON();
          expect(rebuilt).toEqual(emitted);
        }),
        config,
      );
    });
  });
});
