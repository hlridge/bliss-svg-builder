/**
 * Pins a handle to a part inside a part working as any part handle does: it
 * survives a change anywhere else, every getter reads its own part, its level
 * is its depth, and its key is stable and found by `getElementByKey()`.
 *
 * Covers:
 * - Every getter that reads the snapshot (`key`, the positions and sizes,
 *   `bounds`, `measure()`, the content flags, `char`), read through a part
 *   inside `B291` and equal to that part's node in `snapshot()`.
 * - The handle surviving a change to another character, to its own
 *   character, to the part holding it, a character added and a word added
 *   before it; following its part when its word is merged into the one
 *   before; and becoming stale, with the documented throw, once its part is
 *   gone.
 * - Options set through it after a change elsewhere; an option of a
 *   definition's own removed or cleared through it returning to the
 *   definition's value, as on a character's own part.
 * - An inner part that is an indicator reported as one.
 * - A part three levels down, read and surviving the same way.
 * - `level` as the depth, as the snapshot gives it, with `isPart` at every
 *   depth.
 * - The key of an inner part: stable across changes, found by
 *   `getElementByKey()`, a key set on it found too, written by no save; and a
 *   code used twice reporting no duplicate key.
 *
 * Does NOT cover:
 * - A top-level part handle's lifetime, see `ElementHandle.resilience.test.js`;
 *   the level accessors on top-level handles, see `ElementHandle.taxonomy.test.js`.
 * - Classifying an indicator inside a compound indicator, see
 *   `ElementHandle.indicator-introspection.test.js`.
 * - A change made inside a part reaching the saves, and a structural edit
 *   (`remove()`, `detach()`, `replace()`) through a handle to an inner part,
 *   which does nothing yet: backlog row "A part saved by its name forgets a
 *   change made inside it" (the `it.todo` below).
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = { NP_RED: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'red' } } };
const DEPENDENT_FIXTURES = { NP_TWO: { type: 'shape', codeString: 'NP_RED;HL8:0,8' } };

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
  BlissSVGBuilder.define(DEPENDENT_FIXTURES);
});

afterAll(() => {
  for (const code of [...Object.keys(DEPENDENT_FIXTURES), ...Object.keys(FIXTURES)]) BlissSVGBuilder.removeDefinition(code);
});

// The snapshot node of the first character's first part's first inner part.
const innerSnapshot = (builder) => builder.snapshot().children[0].children
  .filter((child) => child.isGlyph)[0].children[0].children[0];

const inner = (builder) => builder.glyph(0).part(0).part(0);

const SNAPSHOT_GETTERS = [
  'key', 'x', 'y', 'offsetX', 'offsetY', 'width', 'height', 'bounds', 'advanceX', 'baseWidth',
  'isShape', 'isBlissGlyph', 'isExternalGlyph', 'isHeadGlyph', 'isSpaceGroup', 'char',
];

describe('ElementHandle nested parts', () => {
  describe('when a part inside a part is read', () => {
    it.each(SNAPSHOT_GETTERS)('reads %s as the snapshot of that part holds it', (getter) => {
      // regression: every getter that reads the snapshot threw "Snapshot not
      // found" on a handle to a part inside a part
      const builder = new BlissSVGBuilder('B291/B303');
      expect(inner(builder)[getter]).toEqual(innerSnapshot(builder)[getter]);
    });

    it('measures it as the snapshot of that part does', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      const { x, y, width, height } = innerSnapshot(builder);
      expect(inner(builder).measure()).toMatchObject({ x, y, width, height });
    });
  });

  describe('when the tree changes after the handle is taken', () => {
    it.each([
      ['another character', (b) => b.glyph(1).setOptions({ color: 'red' })],
      ['its own character', (b) => b.glyph(0).setOptions({ color: 'red' })],
      ['the part holding it', (b) => b.glyph(0).part(0).setOptions({ color: 'red' })],
      ['a character added', (b) => b.group(0).addGlyph('B313')],
      ['a word added before it', (b) => b.insertGroup(0, 'B313')],
    ])('keeps reading its own part after a change to %s', (_change, change) => {
      // regression: every call threw "ElementHandle references an element that
      // has been removed" after any change (backlog row "A handle to a part
      // inside a part stops working after any other change")
      const builder = new BlissSVGBuilder('B291/B303');
      const handle = inner(builder);
      const { key, width } = handle;
      change(builder);
      expect(handle.codeName).toBe('S8');
      expect(handle.key).toBe(key);
      expect(handle.width).toBe(width);
    });

    it('follows its part when its word is merged into the one before', () => {
      const builder = new BlissSVGBuilder('B313//B291');
      const handle = builder.glyph(1).part(0).part(0);
      const { key } = handle;
      builder.group(0).mergeWithNext();
      expect(handle.codeName).toBe('S8');
      expect(handle.key).toBe(key);
    });

    it('becomes stale once its part is gone', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      const handle = inner(builder);
      builder.glyph(0).replace('B303');
      expect(() => handle.codeName).toThrow('ElementHandle references an element that has been removed.');
    });

    it('sets options through it, drawing them, where the call threw', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      const handle = inner(builder);
      builder.glyph(1).setOptions({ 'data-x': '1' });
      handle.setOptions({ color: 'red' });
      expect(builder.svgCode).toContain('stroke="red"');
    });
  });

  describe("when an option of a definition's own is changed through an inner part's handle", () => {
    // `NP_RED` is a part of `NP_TWO`'s, so the handle to it is a part inside a part
    const redInside = () => {
      const builder = new BlissSVGBuilder('B291;NP_TWO');
      const handle = builder.glyph(0).part(1).part(0);
      handle.setOptions({ color: 'blue' });
      return { builder, handle };
    };

    it("returns a removed option to the definition's own, as a part handle does", () => {
      // pins the options helpers reading an inner part as a part; killed hand
      // mutant n4 (C28, the helpers given the handle's depth)
      const { builder, handle } = redInside();
      handle.removeOptions('color');
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it("clears the options set on it back to the definition's own", () => {
      const { builder, handle } = redInside();
      handle.clearOptions();
      expect(builder.svgCode).toContain('stroke="red"');
    });
  });

  describe('when the part sits three levels down', () => {
    it('reads it and keeps reading it after a change elsewhere', () => {
      // note: `B291` holds `S8`, which holds the lines it is drawn with
      const builder = new BlissSVGBuilder('B291/B303');
      const handle = inner(builder).part(0);
      const { key, codeName } = handle;
      builder.glyph(1).setOptions({ color: 'red' });
      expect(handle.codeName).toBe(codeName);
      expect(handle.key).toBe(key);
      expect(handle.width).toBe(innerSnapshot(builder).children[0].width);
    });
  });

  describe('when an inner part is an indicator', () => {
    it('reports it as one', () => {
      // pins the indicator getters reading an inner part at its depth; killed
      // hand mutant n7 (C28, `isIndicator` at level 3 only)
      const handle = new BlissSVGBuilder('B303;B84').part(1).part(0);
      expect(handle.level).toBe(4);
      expect(handle.isIndicator).toBe(true);
    });
  });

  describe('when the level of a part handle is read', () => {
    it.each([
      ['a part of a character', (b) => b.glyph(0).part(0), 3],
      ['a part inside a part', (b) => inner(b), 4],
      ['a part one level further down', (b) => inner(b).part(0), 5],
    ])('reports %s at its depth, as the snapshot does', (_part, handleOf, depth) => {
      // regression: a handle to a part inside a part said 3 where its node in
      // the snapshot says 4 (`level` is "structural depth: 3+ = part")
      const builder = new BlissSVGBuilder('B291/B303');
      const handle = handleOf(builder);
      expect(handle.level).toBe(depth);
      expect(handle.isPart).toBe(true);
      expect(builder.getElementByKey(handle.key).level).toBe(depth);
    });
  });

  describe('when an inner part is looked up by its key', () => {
    it('keeps its key across changes elsewhere', () => {
      // regression: an inner part's key was a fresh random one at every rebuild
      const builder = new BlissSVGBuilder('B291/B303');
      const before = innerSnapshot(builder).key;
      builder.glyph(1).setOptions({ color: 'red' });
      expect(innerSnapshot(builder).key).toBe(before);
    });

    it('finds it with getElementByKey()', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      const found = builder.getElementByKey(innerSnapshot(builder).key);
      expect(found?.codeName).toBe('S8');
      expect(found?.level).toBe(4);
    });

    it('finds it by a key set on it', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      inner(builder).setOptions({ key: 'inner' });
      expect(builder.getElementByKey('inner')?.codeName).toBe('S8');
    });

    it('writes no inner key in any save', () => {
      const builder = new BlissSVGBuilder('B291/B303');
      inner(builder).setOptions({ key: 'inner' });
      expect(JSON.stringify(builder.toJSON({ deep: true }))).not.toContain('"key"');
      expect(JSON.stringify(builder.toJSON({ preserve: true }))).not.toContain('"key"');
      expect(builder.toString()).toBe('B291/B303');
    });

    it('reports no duplicate key for a code used twice', () => {
      const builder = new BlissSVGBuilder('B291/B291;B81//B291');
      builder.glyph(0).setOptions({ color: 'red' });
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when a part inside a part is removed through its handle', () => {
    it.todo('removes it, and every save writes the change');
  });
});
