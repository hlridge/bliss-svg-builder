/**
 * Pins the authoritative corpus enumeration the regeneration engine renders
 * (`buildCorpusCases` in `tests/utils/case-reference.js`). The engine and the
 * e2e visual-regression suite must agree on the exact set of (code, filename)
 * cases, so an enumeration that double-counts or drops a case would make the
 * engine's status diverge from what the e2e actually tests.
 *
 * Covers:
 * - Each legacy extension def (B291B81/B291B97/B291B97B81) is enumerated EXACTLY
 *   once — via customTests, NOT also via a separate legacy loop (regression for
 *   the 2026-06-25 double-count the adversarial review surfaced).
 * - Every case carries a source tag and a `.svg` filename.
 * - The legacy defs are still returned in `defs` so their customTests codes
 *   resolve when rendered.
 *
 * Does NOT cover:
 * - The committed-corpus SETS (`buildExistingCorpus`), consumed by the corpus
 *   `.tmp` tooling.
 * - The filename derivation rules: see `tests/utils/case-filename.js`.
 */
import { describe, it, expect } from 'vitest';
import { buildCorpusCases, LEGACY_EXTENSION_DEFS } from './utils/case-reference.js';

describe('buildCorpusCases', () => {
  describe('when enumerating the authoritative corpus', () => {
    it('lists each legacy extension def filename exactly once', () => {
      const { cases } = buildCorpusCases();

      for (const code of Object.keys(LEGACY_EXTENSION_DEFS)) {
        const matches = cases.filter((c) => c.filename === `${code}.svg`);
        expect(matches).toHaveLength(1);
      }
    });

    it('tags every case with a source and a .svg filename', () => {
      const { cases } = buildCorpusCases();

      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        expect(c.source).toBeTruthy();
        expect(c.filename.endsWith('.svg')).toBe(true);
        expect(typeof c.code).toBe('string');
      }
    });

    it('still returns the legacy defs so their customTests codes resolve', () => {
      const { defs } = buildCorpusCases();

      for (const code of Object.keys(LEGACY_EXTENSION_DEFS)) {
        expect(defs[code]).toBeDefined();
      }
    });
  });
});
