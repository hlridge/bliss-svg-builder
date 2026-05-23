import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins ElementHandle resilience: a handle stays valid across unrelated
 * mutations elsewhere in the tree, and only throws when its own node
 * is removed. Relocations (mergeWithNext, splitAt) move the underlying
 * node but leave the handle valid.
 *
 * Covers:
 * - Survival when a sibling group, glyph, or part is mutated through a
 *   different handle.
 * - Survival when the builder mutates the tree at the group level
 *   (addGroup, removeGroup of a different index, insertGroup,
 *   replaceGroup of a different index).
 * - Survival when the underlying node is relocated by mergeWithNext
 *   or splitAt.
 * - Throw semantics when the handle's own node, its ancestor group,
 *   or its enclosing glyph (cascade-removed after the last part) is
 *   removed, and when its own group is replaced.
 * - Reuse of a surviving handle for further reads, writes, and method
 *   chaining after a mutation.
 * - Independence of two handles pointing to the same underlying node.
 * - Acquisition of a fresh handle after an unrelated prior mutation.
 *
 * Does NOT cover:
 * - The mutation operations themselves; see
 *   `BlissSVGBuilder.mutation-api.test.js` for addGroup / removeGroup /
 *   insertGroup / replaceGroup, and `BlissSVGBuilder.merge-split.test.js`
 *   for mergeWithNext / splitAt.
 * - Index-based handle accessors `group(i)`, `glyph(i)`, `part(i)`; see
 *   `BlissSVGBuilder.traversal.test.js`.
 * - Element-key continuity across mutations; see
 *   `BlissSVGBuilder.element-keys.test.js`.
 * - Method parity across handle types (group / glyph / part); see
 *   `ElementHandle.parity.test.js`.
 */
describe('ElementHandle resilience', () => {

  describe('when another group is mutated through its own handle', () => {
    it('group handle survives mutation to a different group', () => {
      const b = new BlissSVGBuilder('B313/B1103//B431');
      const h0 = b.group(0);
      const h1 = b.group(1);

      h0.addGlyph('B291');

      expect(h1.glyph(0).codeName).toBe('B431');
    });

    it('glyph handle survives mutation to a different group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const g = b.glyph(0); // B313 in group 0

      b.group(1).addGlyph('B291');

      expect(g.codeName).toBe('B313');
    });

    it('part handle survives mutation to a different group', () => {
      const b = new BlissSVGBuilder('B313;B1103//B431');
      const p = b.part(1); // B1103 in group 0

      b.group(1).setOptions({ color: 'red' });

      expect(p.codeName).toBe('B1103');
    });
  });

  describe('when a builder-level mutation modifies the tree shape', () => {
    it('handle survives addGroup on builder', () => {
      const b = new BlissSVGBuilder('B313');
      const h = b.group(0);

      b.addGroup('B431');

      expect(h.glyph(0).codeName).toBe('B313');
    });

    it('handle survives removeGroup of a different group', () => {
      const b = new BlissSVGBuilder('B313//B431//B291');
      const h = b.group(0);

      b.removeGroup(1); // remove B431

      expect(h.glyph(0).codeName).toBe('B313');
    });

    it('handle survives insertGroup at a different index', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(1); // B431

      b.insertGroup(0, 'B291');

      expect(h.glyph(0).codeName).toBe('B431');
    });
  });

  describe('when the handle\'s own node is removed', () => {
    it('throws when group was removed', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(0);

      b.removeGroup(0);

      expect(() => h.glyph(0)).toThrow(/removed/);
    });

    it('throws when glyph was removed', () => {
      const b = new BlissSVGBuilder('B313/B431');
      const h = b.glyph(0); // B313

      b.group(0).removeGlyph(0);

      expect(() => h.codeName).toThrow(/removed/);
    });

    it('throws when part was removed', () => {
      const b = new BlissSVGBuilder('B313;B1103');
      const p = b.part(1); // B1103

      b.glyph(0).removePart(1);

      expect(() => p.codeName).toThrow(/removed/);
    });

    it('throws when ancestor group was removed (glyph handle)', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const g = b.glyph(0); // B313 in group 0

      b.removeGroup(0);

      expect(() => g.codeName).toThrow(/removed/);
    });

    it('throws when ancestor group was removed (part handle)', () => {
      const b = new BlissSVGBuilder('B313;B1103//B431');
      const p = b.part(0); // B313 in group 0

      b.removeGroup(0);

      expect(() => p.codeName).toThrow(/removed/);
    });

    it('throws when glyph was cascade-removed after last part removed', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const g = b.glyph(0); // B313 (single-part glyph)

      b.glyph(0).removePart(0);

      expect(() => g.codeName).toThrow(/removed/);
    });

    it('throws when own group was replaced', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(0);

      b.replaceGroup(0, 'B291');

      expect(() => h.glyph(0)).toThrow(/removed/);
    });
  });

  describe('when the node is relocated by mergeWithNext', () => {
    it('glyph handle survives a merge that relocates it', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const g = b.glyph(1); // B431 in group 1

      b.group(0).mergeWithNext(); // B431 absorbed into group 0

      // B431 still exists in the tree, just under a different parent
      expect(g.codeName).toBe('B431');
    });
  });

  describe('when the node is relocated by splitAt', () => {
    it('glyph handle survives a split that relocates it', () => {
      const b = new BlissSVGBuilder('B313/B431');
      const g = b.glyph(1); // B431 in group 0

      b.group(0).splitAt(1); // B431 moves to a new group

      expect(g.codeName).toBe('B431');
    });
  });

  describe('when a builder-level replaceGroup modifies a different group', () => {
    it('handle survives replaceGroup of a different group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(1);

      b.replaceGroup(0, 'B291');

      expect(h.glyph(0).codeName).toBe('B431');
    });
  });

  describe('when a surviving handle is reused after an unrelated mutation', () => {
    it('reads and writes through the surviving handle', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(1);

      b.group(0).addGlyph('B291');

      h.setOptions({ color: 'red' });
      expect(h.glyph(0).codeName).toBe('B431');
    });

    it('survives a sequence of mutations on itself', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(0);

      h.addGlyph('B291');
      h.setOptions({ color: 'red' });

      expect(h.glyph(1).codeName).toBe('B291');
    });
  });

  describe('when two handles point to the same node', () => {
    it('second handle to same group survives mutation by first', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h1 = b.group(0);
      const h2 = b.group(0);

      h1.addGlyph('B291');

      expect(h2.glyph(0).codeName).toBe('B313');
    });
  });

  describe('when a method chain spans a mutation', () => {
    it('chains addGlyph and setOptions on the same handle', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const h = b.group(0);

      h.addGlyph('B291').setOptions({ color: 'red' });

      expect(b.group(0).glyph(1).codeName).toBe('B291');
    });
  });

  describe('when a new handle is acquired after a prior mutation', () => {
    it('returns a working handle to an unaffected group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      b.group(0).addGlyph('B291');

      const h = b.group(1);
      expect(h.glyph(0).codeName).toBe('B431');
    });
  });
});
