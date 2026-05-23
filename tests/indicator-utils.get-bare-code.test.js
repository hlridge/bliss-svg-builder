import { describe, it, expect } from 'vitest';
import { getBareCode } from '../src/lib/indicator-utils.js';

/**
 * Pins indicator-utils.getBareCode: stripping structural suffixes
 * (:x,y position, ;... composition) and option prefixes ([...] or
 * [...]>...) from a single code, returning the bare code identifier.
 *
 * Covers:
 * - Bare code returned unchanged.
 * - :x,y position suffix stripped.
 * - ;... inline composition suffix stripped.
 * - Single-char and multi-char options prefixes ([a] and [color=red]) stripped.
 * - Part-level prefix [...]>code stripped (the > variant).
 * - Combined prefix + position stripped together.
 * - Anchor regression: prefix not at index 0 is preserved (^ anchor in regex).
 *
 * Does NOT cover:
 * - Multi-code strings; the function is single-code only. Higher-level
 *   helpers (filterToIndicators, getSemanticRoot) drive per-code stripping
 *   on lists.
 *
 * @contract: indicator-placement-rule
 */
describe('indicator-utils.getBareCode', () => {
  describe('when given a code with no prefix or suffix', () => {
    it('returns the input unchanged', () => {
      expect(getBareCode('B81')).toBe('B81');
    });
  });

  describe('when given a code with a structural suffix', () => {
    it('strips a :x,y position suffix', () => {
      expect(getBareCode('B81:0,4')).toBe('B81');
    });

    it('strips a ;... inline composition suffix', () => {
      expect(getBareCode('B81;B86')).toBe('B81');
    });
  });

  describe('when given a code with an options prefix', () => {
    it('strips a multi-char options prefix without > (e.g. [color=red])', () => {
      // pins regex /^(\[.*?\])(?!>)/ with .*? not .; single char [a] would still
      // match either form, multi-char only matches with .*?
      expect(getBareCode('[color=red]B81')).toBe('B81');
    });

    it('strips a single-char options prefix [a]', () => {
      expect(getBareCode('[a]B81')).toBe('B81');
    });

    it('strips a part-level prefix [...]>code', () => {
      expect(getBareCode('[color=red]>B81')).toBe('B81');
    });

    it('strips a part-level prefix and position together', () => {
      expect(getBareCode('[color=red]>B81:0,4')).toBe('B81');
    });
  });

  describe('when an options prefix appears mid-string (^ anchor regression)', () => {
    it('does NOT strip the prefix and returns the full input', () => {
      // pins ^ anchor: without it the regex matches at any [...]>... in the string.
      // For getBareCode that would yield 'B82'; with ^ anchor it must return the full input.
      expect(getBareCode('B81[color=red]>B82')).toBe('B81[color=red]>B82');
    });
  });
});
