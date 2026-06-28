import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WARNING_CODES } from '../src/lib/bliss-constants.js';

/**
 * Pins exact set-equality between the public `WarningCode` union in
 * `src/index.d.ts` and the runtime `WARNING_CODES` registry in
 * `src/lib/bliss-constants.js` (the source of truth every emitted warning's
 * `code` is drawn from). A code added to the registry but not the union (or the
 * reverse) ships a `.d.ts` that lies about the possible `code` values; this test
 * fails the moment they diverge. `tsc` cannot catch this: the union is a hand-
 * maintained mirror of a plain frozen object, not a type derived from it.
 *
 * Covers:
 * - Every `WARNING_CODES` value appears in the `WarningCode` union.
 * - Every `WarningCode` union member appears in `WARNING_CODES`.
 * - Exact set-equality of the two sides.
 * - The registry's self-mapping (each key equals its own value).
 *
 * Does NOT cover:
 * - That each code is actually emitted on some input: the per-warning
 *   behavioural tests pin emission (e.g. `BlissParser.kerning.test.js` for
 *   MALFORMED_KERNING_VALUE).
 * - Runtime presence of the public API surface on the built bundle, see
 *   `BlissSVGBuilder.public-surface.dist.test.js`.
 *
 * @contract: warning-code-vocabulary
 */
const dtsPath = resolve(import.meta.dirname, '..', 'src', 'index.d.ts');

// Pulls the string-literal members out of the `export type WarningCode = ...;`
// union in the shipped declaration file. Throws (rather than returning []) when
// the union can't be located, so a structural rename fails loudly instead of
// passing vacuously.
const parseWarningCodeUnion = () => {
  const text = readFileSync(dtsPath, 'utf8');
  const union = text.match(/export type WarningCode\s*=([\s\S]*?);/);
  if (!union) throw new Error('WarningCode union not found in src/index.d.ts');
  return [...union[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('BlissSVGBuilder warning code parity', () => {
  describe('when comparing the WarningCode union to the WARNING_CODES registry', () => {
    it('lists every registry code in the .d.ts union', () => {
      const union = parseWarningCodeUnion();
      for (const code of Object.values(WARNING_CODES)) {
        expect(union).toContain(code);
      }
    });

    it('has no .d.ts union member absent from the registry', () => {
      const registry = Object.values(WARNING_CODES);
      for (const code of parseWarningCodeUnion()) {
        expect(registry).toContain(code);
      }
    });

    it('matches the registry as an exact set', () => {
      const union = [...new Set(parseWarningCodeUnion())].sort();
      const registry = [...new Set(Object.values(WARNING_CODES))].sort();
      expect(union).toEqual(registry);
    });
  });

  describe('when reading the WARNING_CODES registry itself', () => {
    it('maps every key to an identical value', () => {
      for (const [key, value] of Object.entries(WARNING_CODES)) {
        expect(value).toBe(key);
      }
    });
  });
});
