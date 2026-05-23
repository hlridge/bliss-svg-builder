import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins BlissSVGBuilder.merge and BlissSVGBuilder.splitAt as inverse-pair
 * operations on the group-level composition.
 *
 * Covers:
 * - merge: receiver gains the source's groups; receiver-side global options
 *   win and source-side global options are stripped; source group-level
 *   options are preserved on the merged groups; a separator space group is
 *   inserted between non-empty bodies; the source builder is left
 *   unchanged; the call returns the receiver for chaining; empty and
 *   space-only operands are handled as no-ops or skip the leading space.
 * - splitAt: receiver shrinks to groups [0, n); returned builder gets the
 *   rest as an independent BlissSVGBuilder instance; trailing space on the
 *   left half and leading space on the right half are cleaned up; global
 *   options replicate to both halves; group-level options survive on both
 *   halves; multi-glyph groups split as opaque units.
 * - splitAt argument-validation: throws on index 0, negative index,
 *   index >= group count, and on single-group builders.
 * - Round-trip: splitAt followed by merge reconstructs the original group
 *   count.
 *
 * Does NOT cover:
 * - Merging more than two builders in one call (no fold / reduce semantics
 *   on the API).
 * - Splitting at glyph boundaries inside a group, see
 *   `BlissSVGBuilder.mutation.test.js` for in-place glyph
 *   manipulation.
 * - Visual regression of merged or split SVG output, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 */

describe('BlissSVGBuilder merge and splitAt', () => {
  describe('when merging two builders', () => {
    it('appends the source builder groups to the receiver', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431');

      a.merge(b);

      expect(a.stats.groupCount).toBe(2);
      expect(a.group(0).glyph(0).codeName).toBe('B313');
      expect(a.group(1).glyph(0).codeName).toBe('B431');
    });

    it('inserts a space group between the receiver and source bodies', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431');

      a.merge(b);

      // 3 raw elements: word, space, word
      expect(a.elementCount).toBe(3);
    });

    it('preserves multi-word content from the source builder', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431//B291');

      a.merge(b);

      expect(a.stats.groupCount).toBe(3);
      expect(a.group(2).glyph(0).codeName).toBe('B291');
    });

    it('preserves multi-glyph words from the source builder', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431/B291');

      a.merge(b);

      expect(a.stats.groupCount).toBe(2);
      expect(a.group(1).glyph(0).codeName).toBe('B431');
      expect(a.group(1).glyph(1).codeName).toBe('B291');
    });

    it('keeps the receiver global options and strips the source ones', () => {
      const a = new BlissSVGBuilder('[color=red]||B313');
      const b = new BlissSVGBuilder('[color=blue]||B431');

      a.merge(b);

      const json = a.toJSON();
      expect(json.options?.color).toBe('red');
      // B's global color should not bleed through
      const allGroupColors = json.groups.map(g => g.options?.color).filter(Boolean);
      expect(allGroupColors).not.toContain('blue');
    });

    it('preserves source group-level options on the merged groups', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431');
      b.group(0).setOptions({ color: 'blue' });

      a.merge(b);

      const json = a.toJSON();
      expect(json.groups[2].options?.color).toBe('blue');
    });

    it('leaves the source builder unchanged', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431');
      const bJsonBefore = JSON.stringify(b.toJSON());

      a.merge(b);

      expect(JSON.stringify(b.toJSON())).toBe(bJsonBefore);
    });

    it('returns the receiver for chaining', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder('B431');

      const result = a.merge(b);

      expect(result).toBe(a);
    });

    it('skips the leading space when merging into an empty receiver', () => {
      const a = new BlissSVGBuilder();
      const b = new BlissSVGBuilder('B431');

      a.merge(b);

      expect(a.stats.groupCount).toBe(1);
      expect(a.group(0).glyph(0).codeName).toBe('B431');
      // No leading space when merging into empty
      expect(a.elementCount).toBe(1);
    });

    it('treats merging an empty source builder as a no-op', () => {
      const a = new BlissSVGBuilder('B313');
      const b = new BlissSVGBuilder();

      a.merge(b);

      expect(a.stats.groupCount).toBe(1);
    });

    it('treats merging a space-only source builder as a no-op', () => {
      const a = new BlissSVGBuilder('B313');
      // Build a builder that has a word, then remove it (leaves space groups)
      const b = new BlissSVGBuilder('B431//B291');
      b.removeGroup(0);
      b.removeGroup(0);

      a.merge(b);

      expect(a.stats.groupCount).toBe(1);
      expect(a.elementCount).toBe(1);
    });
  });

  describe('when splitting a builder at a valid group index', () => {
    it('splits the receiver into two builders at the given index', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');
      const b = a.splitAt(1);

      expect(a.stats.groupCount).toBe(1);
      expect(a.group(0).glyph(0).codeName).toBe('B313');

      expect(b.stats.groupCount).toBe(2);
      expect(b.group(0).glyph(0).codeName).toBe('B431');
      expect(b.group(1).glyph(0).codeName).toBe('B291');
    });

    it('splits at the last group with the right half holding only that group', () => {
      const a = new BlissSVGBuilder('B313//B431');
      const b = a.splitAt(1);

      expect(a.stats.groupCount).toBe(1);
      expect(a.group(0).glyph(0).codeName).toBe('B313');

      expect(b.stats.groupCount).toBe(1);
      expect(b.group(0).glyph(0).codeName).toBe('B431');
    });

    it('replicates global options to both halves', () => {
      const a = new BlissSVGBuilder('[color=red]||B313//B431');
      const b = a.splitAt(1);

      expect(a.toJSON().options?.color).toBe('red');
      expect(b.toJSON().options?.color).toBe('red');
    });

    it('does not leave a trailing space group on the left half', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');
      a.splitAt(1);

      // Left builder: just B313, no trailing space
      expect(a.elementCount).toBe(1);
    });

    it('does not leave a leading space group on the right half', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');
      const b = a.splitAt(1);

      // Right builder: B431 space B291 (3 raw elements, no leading space)
      expect(b.elementCount).toBe(3);
    });

    it('preserves group-level options on the right half', () => {
      const a = new BlissSVGBuilder('B313//B431');
      a.group(1).setOptions({ color: 'blue' });

      const b = a.splitAt(1);

      const json = b.toJSON();
      expect(json.groups[0].options?.color).toBe('blue');
    });

    it('preserves group-level options on the left half', () => {
      const a = new BlissSVGBuilder('B313//B431');
      a.group(0).setOptions({ color: 'green' });

      a.splitAt(1);

      const json = a.toJSON();
      expect(json.groups[0].options?.color).toBe('green');
    });

    it('returns a new BlissSVGBuilder instance', () => {
      const a = new BlissSVGBuilder('B313//B431');
      const b = a.splitAt(1);

      expect(b).toBeInstanceOf(BlissSVGBuilder);
      expect(b).not.toBe(a);
    });

    it('returns a builder independent of the original', () => {
      const a = new BlissSVGBuilder('B313//B431');
      const b = a.splitAt(1);

      b.addGroup('B291');

      expect(a.stats.groupCount).toBe(1);
      expect(b.stats.groupCount).toBe(2);
    });

    it('splits at a middle boundary with two groups remaining on the left', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');
      const b = a.splitAt(2);

      expect(a.stats.groupCount).toBe(2);
      expect(b.stats.groupCount).toBe(1);
      expect(b.group(0).glyph(0).codeName).toBe('B291');
    });

    it('splits multi-glyph groups as opaque units in each half', () => {
      const a = new BlissSVGBuilder('B313/B1103//B431/B291');
      const b = a.splitAt(1);

      expect(a.group(0).glyph(0).codeName).toBe('B313');
      expect(a.group(0).glyph(1).codeName).toBe('B1103');
      expect(b.group(0).glyph(0).codeName).toBe('B431');
      expect(b.group(0).glyph(1).codeName).toBe('B291');
    });
  });

  describe('when splitAt is called with an invalid index', () => {
    it('throws when the index is 0 (nothing to split off)', () => {
      const a = new BlissSVGBuilder('B313//B431');

      expect(() => a.splitAt(0)).toThrow();
    });

    it('throws when the index is negative', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');

      expect(() => a.splitAt(-1)).toThrow();
    });

    it('throws when the index is past the end', () => {
      const a = new BlissSVGBuilder('B313//B431');

      expect(() => a.splitAt(5)).toThrow();
    });

    it('throws when the index equals the group count (right half empty)', () => {
      const a = new BlissSVGBuilder('B313//B431');

      expect(() => a.splitAt(2)).toThrow();
    });

    it('throws on a single-group builder', () => {
      const a = new BlissSVGBuilder('B313');

      expect(() => a.splitAt(1)).toThrow();
    });
  });

  describe('when round-tripping splitAt and merge', () => {
    it('reconstructs the original group count', () => {
      const a = new BlissSVGBuilder('B313//B431//B291');
      const b = a.splitAt(1);

      a.merge(b);

      expect(a.stats.groupCount).toBe(3);
    });
  });
});
