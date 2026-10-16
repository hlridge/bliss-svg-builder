import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins WORD_AS_PART diagnostics when object input contains a word definition
 * in part position.
 *
 * Covers:
 * - Object-input expansion preserves the custom word code long enough for
 *   WORD_AS_PART detection to report the original source.
 *
 * Does NOT cover:
 * - DSL constructor and mutation API word-as-part paths, see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - Parser-only WORD_AS_PART tagging for text fallback, see
 *   `BlissParser.internal-mechanics.test.js`.
 * - The string save of a character a word part failed through the API
 *   (`addPart('B9/B10')`): it writes `B303;B9/B10`, which reloads as two
 *   drawn characters. A `[post-1.1.0]` backlog row; tripwire below.
 */
describe('BlissSVGBuilder word-as-part diagnostics', () => {
  describe('when object input contains a word definition as a part', () => {
    it('reports the original custom code as the WORD_AS_PART warning source', () => {
      const code = 'OBJECT_WORD_PART_PIN';
      BlissSVGBuilder.define({ [code]: { codeString: 'B313/B431' } }, { overwrite: true });

      try {
        const builder = new BlissSVGBuilder({
          groups: [{ glyphs: [{ parts: [{ codeName: code }] }] }],
        });
        const warning = builder.warnings.find(w => w.code === 'WORD_AS_PART');

        expect(warning?.source).toBe(code);
        // pins word-code preservation; killed line 1029 slash-guard mutant in 2026-05 Stryker run.
      } finally {
        BlissSVGBuilder.removeDefinition(code);
      }
    });
  });

  describe('when a word is added as one part through the API', () => {
    it.todo('saves the failed character so its reload fails too, not as B303;B9/B10, which draws two characters');
  });
});
