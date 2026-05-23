import { describe, it, expect } from 'vitest';
import { BlissElement } from '../src/lib/bliss-element.js';

/**
 * Pins BlissElement's implicit-level structural equivalence: a single
 * `codeName` value renders to the same SVG path regardless of how
 * many of the `groups` / `glyphs` / `parts` container levels are
 * written explicitly versus inferred from the input shape. The
 * contract is exercised across 9 alternative input shapes covering
 * every combination of implicit vs explicit container levels plus a
 * redundant extra-nested `parts` wrapper.
 *
 * Covers:
 * - Each of `groups`, `glyphs`, and `parts` independently omitted
 *   from or present in the input, across all 8 combinations.
 * - A 9th shape with a redundant extra-nested
 *   `parts: [{ parts: [...] }]` wrapper, confirming structural
 *   collapse rather than rejection.
 * - The resulting SVG path output is byte-identical (`M0,0h2`) for
 *   all 9 input shapes.
 *
 * Does NOT cover:
 * - x/y coordinate accumulation through implicit container levels,
 *   see `BlissElement.coordinate-accumulation.test.js`.
 * - codeName / char surfaces over implicitly structured inputs, see
 *   `BlissElement.codename-contract.test.js`.
 * - Warning collection for malformed input shapes, see
 *   `BlissElement.warning-behavior.test.js`.
 * - SVG path output beyond the simple `HL2` shape (varied glyph
 *   geometry across other codes), see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */
describe('BlissElement flexible structure', () => {
  describe('when constructed with implicit structural levels', () => {
    const EXAMPLE_CODE = 'HL2';
    const EXPECTED_PATH = 'M0,0h2';

    it.each([
      ['(groups)->(glyphs)->(parts)-> code',          { codeName: EXAMPLE_CODE }],
      ['(groups)->(glyphs)-> parts -> code',          { parts: [{ codeName: EXAMPLE_CODE }] }],
      ['(groups)-> glyphs ->(parts)-> code',          { glyphs: [{ codeName: EXAMPLE_CODE }] }],
      ['(groups)-> glyphs -> parts -> code',          { glyphs: [{ parts: [{ codeName: EXAMPLE_CODE }] }] }],
      [' groups ->(glyphs)->(parts)-> code',          { groups: [{ codeName: EXAMPLE_CODE }] }],
      [' groups ->(glyphs)-> parts -> code',          { groups: [{ parts: [{ codeName: EXAMPLE_CODE }] }] }],
      [' groups -> glyphs ->(parts)-> code',          { groups: [{ glyphs: [{ codeName: EXAMPLE_CODE }] }] }],
      [' groups -> glyphs -> parts -> code',          { groups: [{ glyphs: [{ parts: [{ codeName: EXAMPLE_CODE }] }] }] }],
      [' groups -> glyphs -> parts -> parts -> code', { groups: [{ glyphs: [{ parts: [{ parts: [{ codeName: EXAMPLE_CODE }] }] }] }] }]
    ])('produces the same SVG path for input %s', (description, structure) => {
      const element = new BlissElement(structure);
      expect(element.getSvgContent()).toBe(EXPECTED_PATH);
    });
  });
});
