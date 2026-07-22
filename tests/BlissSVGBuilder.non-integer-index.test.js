/**
 * Pins the non-integer-index contract shared by every index-taking method on
 * the builder: a NaN or fractional index (the shape a `parseInt(userInput)`
 * or a computed index produces) is rejected exactly the way an out-of-range
 * integer already is, never silently mutating state or handing back a
 * non-null "zombie" handle whose accessors throw "Snapshot not found".
 *
 * Covers:
 * - Navigation (group/element/glyph/part) returns null for NaN, positive, and
 *   negative fractional indices instead of a non-null handle.
 * - Insert/remove (insertGroup/insertElement/removeGroup/removeElement) stay a
 *   no-op, leaving toString() unchanged, instead of splicing at index 0.
 * - splitAt() throws its documented out-of-range Error before any mutation, so
 *   the builder is left intact (it previously emptied the builder).
 *
 * Does NOT cover:
 * - The replace family (replaceGroup/replaceElement), whose non-integer no-op
 *   already shipped in f9b1608; pinned in
 *   BlissSVGBuilder.group-mutation-args.test.js.
 * - ElementHandle-level index methods, see
 *   ElementHandle.non-integer-index.test.js.
 * - Non-string code/opts argument validation, see
 *   BlissSVGBuilder.group-mutation-args.test.js and
 *   BlissSVGBuilder.opts-arg-validation.test.js.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

describe('BlissSVGBuilder non-integer index', () => {
  describe('when navigating with a non-integer index', () => {
    it('group() returns null instead of a zombie handle', () => {
      const b = new BlissSVGBuilder('B291//B208//C8');
      expect(b.group(1.5)).toBeNull();
      expect(b.group(NaN)).toBeNull();
      // -1.5 is the discriminating case: the integer guard sits AFTER the
      // negative-index normalization, so -1.5 becomes length-1.5 and is caught
      // only because !Number.isInteger runs on the normalized value
      expect(b.group(-1.5)).toBeNull();
      expect(b.group(0)).not.toBeNull();
    });

    it('element() returns null instead of a zombie handle', () => {
      const b = new BlissSVGBuilder('B291//B208//C8');
      expect(b.element(1.5)).toBeNull();
      expect(b.element(NaN)).toBeNull();
      expect(b.element(-1.5)).toBeNull();
      expect(b.element(0)).not.toBeNull();
    });

    it('glyph() returns null for a fractional flat index', () => {
      const b = new BlissSVGBuilder('B291/B92');
      expect(b.glyph(1.5)).toBeNull();
      expect(b.glyph(NaN)).toBeNull();
      expect(b.glyph(-1.5)).toBeNull();
      expect(b.glyph(0)).not.toBeNull();
    });

    it('part() returns null for a fractional flat index', () => {
      const b = new BlissSVGBuilder('B291;B97');
      expect(b.part(1.5)).toBeNull();
      expect(b.part(NaN)).toBeNull();
      expect(b.part(-1.5)).toBeNull();
      expect(b.part(0)).not.toBeNull();
    });
  });

  describe('when mutating with a non-integer index', () => {
    it('insertGroup() leaves the builder untouched', () => {
      const b = new BlissSVGBuilder('B291//B208');
      b.insertGroup(NaN, 'C8');
      b.insertGroup(1.5, 'C8');
      b.insertGroup(-1.5, 'C8');
      expect(b.toString()).toBe('B291//B208');
    });

    it('insertElement() leaves the builder untouched', () => {
      const b = new BlissSVGBuilder('B291//B208');
      b.insertElement(NaN, 'C8');
      b.insertElement(1.5, 'C8');
      b.insertElement(-1.5, 'C8');
      expect(b.toString()).toBe('B291//B208');
    });

    it('removeGroup() leaves the builder untouched', () => {
      const b = new BlissSVGBuilder('B291//B208//C8');
      b.removeGroup(NaN);
      b.removeGroup(1.5);
      b.removeGroup(-1.5);
      expect(b.toString()).toBe('B291//B208//C8');
    });

    it('removeElement() leaves the builder untouched', () => {
      const b = new BlissSVGBuilder('B291//B208//C8');
      b.removeElement(NaN);
      b.removeElement(1.5);
      b.removeElement(-1.5);
      expect(b.toString()).toBe('B291//B208//C8');
    });
  });

  describe('when splitting at a non-integer index', () => {
    it('splitAt() throws the out-of-range error and leaves the builder intact', () => {
      const b = new BlissSVGBuilder('B291//B208//C8');
      // a bare bounds check let NaN/1.5 fall through to splice(NaN) === splice(0),
      // silently emptying the left builder into the returned one
      expect(() => b.splitAt(NaN)).toThrow(/out of range/);
      expect(() => b.splitAt(1.5)).toThrow(/out of range/);
      expect(b.toString()).toBe('B291//B208//C8');
      const right = new BlissSVGBuilder('B291//B208//C8').splitAt(1);
      expect(right.toString()).toBe('B208//C8');
    });
  });
});
