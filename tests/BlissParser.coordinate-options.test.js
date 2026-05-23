import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins parser handling of the `[x=N]` and `[y=N]` bracket-option syntax: the
 * parser extracts these coordinate values at every scope of the element tree
 * (global, word, character, part), accepts negative and zero values, and
 * yields to the inline `CODE:x,y` suffix when both forms appear on the same
 * part.
 *
 * Covers:
 * - Extraction of `[x=N]` and `[y=N]` at each of the four parser scopes
 *   (global / word / character / part), assigned to the matching node on the
 *   parsed tree.
 * - Combined `[x=N;y=M]` blocks where both axes are set in the same options
 *   group.
 * - Negative and zero coordinate values.
 * - Part-level precedence: inline `CODE:x,y` overrides `[x=N]` / `[y=N]`
 *   when both forms appear on the same part; the bracket option is used when
 *   no inline suffix is given.
 * - Mixed-scope expressions where every level sets distinct x/y values.
 *
 * Does NOT cover:
 * - The inline `CODE:x,y` coordinate-suffix grammar (well-formed and
 *   malformed forms), see `BlissSVGBuilder.coordinate-syntax.test.js`.
 * - Effect of coordinate options on rendered glyph positions, see
 *   `BlissSVGBuilder.spacing-options.test.js`.
 * - Other bracket options (color, stroke-width, grid, svg-*, etc.):
 *   for parser-side parsing see `BlissParser.internal-mechanics.test.js`; for rendering
 *   see `BlissSVGBuilder.stroke-color.test.js`,
 *   `BlissSVGBuilder.grid.test.js`, `BlissSVGBuilder.svg-metadata.test.js`,
 *   and `BlissSVGBuilder.hierarchical-options.test.js`.
 */
describe('BlissParser coordinate options', () => {
  const scopeReaders = {
    global: (r, axis) => r[axis],
    word: (r, axis) => r.groups[0][axis],
    character: (r, axis) => r.groups[0].glyphs[0][axis],
    part: (r, axis) => r.groups[0].glyphs[0].parts[0][axis],
  };

  describe('when an `[x=N]` option appears at a single scope', () => {
    it.each([
      [5, 'global',    '[x=5]||B291'],
      [5, 'word',      '[x=5]|B291'],
      [3, 'character', '[x=3]B291'],
      [2, 'part',      '[x=2]>B291'],
    ])('extracts x=%i at %s scope from %s', (expectedX, scope, input) => {
      const result = BlissParser.parse(input);
      expect(scopeReaders[scope](result, 'x')).toBe(expectedX);
    });
  });

  describe('when a `[y=N]` option appears at a single scope', () => {
    it.each([
      [10, 'global',    '[y=10]||B291'],
      [10, 'word',      '[y=10]|B291'],
      [8,  'character', '[y=8]B291'],
      [4,  'part',      '[y=4]>B291'],
    ])('extracts y=%i at %s scope from %s', (expectedY, scope, input) => {
      const result = BlissParser.parse(input);
      expect(scopeReaders[scope](result, 'y')).toBe(expectedY);
    });
  });

  describe('when an options block sets both x and y at the global scope', () => {
    it('extracts result.x and result.y from `[x=3;y=7]||B291`', () => {
      const result = BlissParser.parse('[x=3;y=7]||B291');
      expect(result.x).toBe(3);
      expect(result.y).toBe(7);
    });
  });

  describe('when coordinate values are signed or zero', () => {
    it('extracts a negative x from `[x=-2]||B291`', () => {
      const result = BlissParser.parse('[x=-2]||B291');
      expect(result.x).toBe(-2);
    });

    it('extracts a negative y from `[y=-5]||B291`', () => {
      const result = BlissParser.parse('[y=-5]||B291');
      expect(result.y).toBe(-5);
    });

    it('extracts explicit zero x and y from `[x=0;y=0]||B291`', () => {
      const result = BlissParser.parse('[x=0;y=0]||B291');
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });

  describe('when inline `:x,y` coordinates compete with bracket-option coordinates at part level', () => {
    it('lets inline `:3,7` override `[x=5;y=10]` on the same part', () => {
      const result = BlissParser.parse('[x=5;y=10]>B291:3,7');
      expect(result.groups[0].glyphs[0].parts[0].x).toBe(3);
      expect(result.groups[0].glyphs[0].parts[0].y).toBe(7);
    });

    it('uses the bracket-option `[x=5]` when no inline coordinate is given', () => {
      const result = BlissParser.parse('[x=5]>B291');
      expect(result.groups[0].glyphs[0].parts[0].x).toBe(5);
    });
  });

  describe('when bracket-option coordinates appear at every scope simultaneously', () => {
    it('extracts distinct x/y values at the global, word, character, and part scopes', () => {
      const result = BlissParser.parse('[x=1;y=2]||[x=3;y=4]|[x=5;y=6]B291');
      expect(result.x).toBe(1);
      expect(result.y).toBe(2);
      expect(result.groups[0].x).toBe(3);
      expect(result.groups[0].y).toBe(4);
      expect(result.groups[0].glyphs[0].x).toBe(5);
      expect(result.groups[0].glyphs[0].y).toBe(6);
    });
  });
});
