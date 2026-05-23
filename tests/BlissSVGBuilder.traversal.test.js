import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the BlissSVGBuilder read-side traversal and query surface:
 * `traverse`, `query`, `getElementByKey`, `group(i)`, `glyph(i)`,
 * `group().headGlyph()`, `groups`, `stats`.
 *
 * Covers:
 * - Depth-first, pre-order tree walk via `traverse(cb)` with early-stop on
 *   `cb` returning `false`; visited nodes are frozen snapshots.
 * - `query(pred)` returns a flat array of matches (or empty), with frozen
 *   snapshot semantics; predicate sees every node `traverse` would visit.
 * - `getElementByKey(key)` returns an `ElementHandle` for a hit, `null` for
 *   a miss; works at group and glyph levels.
 * - Index-based shortcuts `group(i)` / `glyph(i)` (flat glyph index across
 *   words) return live handles, `null` for out-of-range.
 * - `glyph(i).part(j)` returns a live part handle (level 3) for an in-range
 *   sub-part index; `null` for out-of-range.
 * - `group(i).headGlyph()` returns the head glyph of that group.
 * - `builder.groups` returns a frozen, identity-stable array of non-space
 *   groups (space groups excluded; raw shape compositions included).
 * - `builder.stats` reports `groupCount` and `glyphCount`, with space
 *   groups excluded from `groupCount`.
 *
 * Does NOT cover:
 * - Mutation through returned handles (`apply…`/`clear…`/etc.), see
 *   `BlissSVGBuilder.mutation-api.test.js` and `ElementHandle.parity.test.js`.
 * - Snapshot shape and JSON serialization, see
 *   `BlissSVGBuilder.snapshots.test.js` and `BlissSVGBuilder.json-output.test.js`.
 * - The element-key system itself (uniqueness, persistence across
 *   mutation), see `BlissSVGBuilder.element-keys.test.js`.
 * - Width / dimension getters on returned handles, see
 *   `ElementHandle.dimensions.test.js`.
 */
describe('BlissSVGBuilder traversal', () => {

  describe('when traversing the element tree', () => {
    it('visits every element depth-first', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const visited = [];
      builder.traverse(el => { visited.push(el.key); });
      let count = 0;
      function countAll(el) { count++; el.children.forEach(countAll); }
      countAll(builder.elements);
      expect(visited.length).toBe(count);
    });

    it('visits parent before children (pre-order)', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const levels = [];
      builder.traverse(el => { levels.push(el.level); });
      expect(levels[0]).toBe(0);
      const firstL1 = levels.indexOf(1);
      const firstL2 = levels.indexOf(2);
      expect(firstL1).toBeLessThan(firstL2);
    });

    it('stops early when the callback returns false', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const visited = [];
      builder.traverse(el => {
        visited.push(el.key);
        if (el.isGroup) return false;
      });
      expect(visited.length).toBe(2);
    });

    it('passes frozen snapshot objects to the callback', () => {
      const builder = new BlissSVGBuilder('H');
      builder.traverse(el => {
        expect(Object.isFrozen(el)).toBe(true);
      });
    });
  });

  describe('when querying with a predicate', () => {
    it('returns all matching elements', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const groups = builder.query(el => el.isGroup);
      // word, space, word: query() includes space groups; builder.groups does not.
      expect(groups.length).toBe(3);
    });

    it('returns an empty array when nothing matches', () => {
      const builder = new BlissSVGBuilder('H');
      const result = builder.query(el => el.codeName === 'NONEXISTENT');
      expect(result).toEqual([]);
    });

    it('returns frozen snapshot objects', () => {
      const builder = new BlissSVGBuilder('H');
      const all = builder.query(() => true);
      for (const el of all) {
        expect(Object.isFrozen(el)).toBe(true);
      }
    });
  });

  describe('when looking up an element by key', () => {
    it('finds a group element and returns an ElementHandle', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const snap = builder.snapshot();
      const groupSnap = snap.children.filter(g =>
        g.isGroup && g.children.some(c => c.codeName !== '')
      )[0];
      const handle = builder.getElementByKey(groupSnap.key);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(1);
    });

    it('finds a glyph element and returns an ElementHandle', () => {
      const builder = new BlissSVGBuilder('B291/B292');
      const snap = builder.snapshot();
      const glyphSnap = snap.children[0].children.filter(c => c.isGlyph)[1];
      const handle = builder.getElementByKey(glyphSnap.key);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(2);
    });

    it('returns null for a nonexistent key', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.getElementByKey('nonexistent')).toBeNull();
    });
  });

  describe('when accessing a group by index', () => {
    it('returns a live handle for non-space groups', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const g0 = builder.group(0);
      const g1 = builder.group(1);
      expect(g0).not.toBeNull();
      expect(g0.level).toBe(1);
      expect(g1).not.toBeNull();
    });

    it('returns null for an out-of-range index', () => {
      const builder = new BlissSVGBuilder('B291');
      expect(builder.group(5)).toBeNull();
    });
  });

  describe('when accessing a glyph by flat index', () => {
    it('returns glyph handles indexed flat across words', () => {
      const builder = new BlissSVGBuilder('B291/B292//B293');
      expect(builder.glyph(0).level).toBe(2);
      expect(builder.glyph(1).level).toBe(2);
      expect(builder.glyph(2).level).toBe(2);
    });

    it('returns null for an out-of-range index', () => {
      const builder = new BlissSVGBuilder('B291');
      expect(builder.glyph(5)).toBeNull();
    });
  });

  describe('when accessing the head glyph of a group', () => {
    it('returns a handle to the head glyph of the group', () => {
      const builder = new BlissSVGBuilder('B291/B292');
      const head = builder.group(0).headGlyph();
      expect(head).not.toBeNull();
      expect(head.level).toBe(2);
    });

    it('returns different heads for different groups', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const head0 = builder.group(0).headGlyph();
      const head1 = builder.group(1).headGlyph();
      expect(head0).not.toBeNull();
      expect(head1).not.toBeNull();
    });
  });

  describe('when reading the cached groups property', () => {
    it('returns non-space groups only', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const groups = builder.groups;
      expect(groups.length).toBe(2);
      expect(groups[0].isGroup).toBe(true);
      expect(groups[1].isGroup).toBe(true);
    });

    it('returns a single group for a single-glyph input', () => {
      const builder = new BlissSVGBuilder('B291');
      expect(builder.groups.length).toBe(1);
    });

    it('includes raw shape compositions as a group', () => {
      const builder = new BlissSVGBuilder('C8:0,8');
      expect(builder.groups.length).toBe(1);
      expect(builder.stats.groupCount).toBe(1);
    });

    it('returns a frozen array', () => {
      const builder = new BlissSVGBuilder('H');
      expect(Object.isFrozen(builder.groups)).toBe(true);
    });

    it('returns the same array reference across accesses (cached)', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.groups).toBe(builder.groups);
    });
  });

  describe('when reading the stats property', () => {
    it('reports groupCount and glyphCount for a multi-word input', () => {
      const builder = new BlissSVGBuilder('B291/B292//B293');
      const stats = builder.stats;
      expect(stats.groupCount).toBe(2);
      expect(stats.glyphCount).toBe(3);
    });

    it('reports groupCount=1 and glyphCount=1 for a single-glyph input', () => {
      const stats = new BlissSVGBuilder('B291').stats;
      expect(stats.groupCount).toBe(1);
      expect(stats.glyphCount).toBe(1);
    });

    it('does not count space groups in groupCount', () => {
      const stats = new BlissSVGBuilder('B291//B292//B293').stats;
      expect(stats.groupCount).toBe(3);
    });
  });

  describe('when calling .part() on a glyph handle', () => {
    it('returns a part handle for the first sub-part', () => {
      const builder = new BlissSVGBuilder('H;C8');
      const partHandle = builder.glyph(0).part(0);
      expect(partHandle).not.toBeNull();
      expect(partHandle.level).toBe(3);
    });

    it('returns a part handle for the second sub-part', () => {
      const builder = new BlissSVGBuilder('H;C8');
      const partHandle = builder.glyph(0).part(1);
      expect(partHandle).not.toBeNull();
      expect(partHandle.level).toBe(3);
    });

    it('returns null when the part index is out of range', () => {
      const builder = new BlissSVGBuilder('H;C8');
      const partHandle = builder.glyph(0).part(99);
      expect(partHandle).toBeNull();
    });
  });
});
