/**
 * Pins the non-integer-index contract shared by every index-taking method on
 * ElementHandle: a NaN or fractional index (the shape a `parseInt(userInput)`
 * or a computed index produces) is rejected exactly the way an out-of-range
 * integer already is, never silently mutating state or handing back a
 * non-null "zombie" handle whose accessors throw "Snapshot not found".
 *
 * Covers:
 * - Navigation (glyph/part) returns null for NaN, positive, and negative
 *   fractional indices instead of a non-null handle.
 * - Insert/remove (insertGlyph/insertPart/removeGlyph/removePart) stay a
 *   no-op, leaving toString() unchanged, instead of splicing at index 0,
 *   including insertPart reached through the group-handle level-1 delegation.
 * - splitAt() throws its documented out-of-range Error before any mutation, so
 *   the word is left intact (it previously emptied the left half).
 *
 * Does NOT cover:
 * - The replace family (replaceGlyph/replacePart), whose non-integer no-op
 *   already shipped in f9b1608; pinned in
 *   ElementHandle.glyph-mutation-args.test.js and
 *   ElementHandle.part-mutation-args.test.js.
 * - The part() level-3 sub-part branch (a part whose node holds nested parts):
 *   its guard is character-identical to the level-2 branch pinned here, and no
 *   supported input reaches a healthy level-3 part handle (compound-indicator
 *   and hand-authored nested inputs return zombie handles even for a valid
 *   integer index), so the level-3 guard is verified by construction, not a
 *   live pin.
 * - Builder-level index methods, see
 *   BlissSVGBuilder.non-integer-index.test.js.
 * - Non-string code/opts argument validation, see
 *   ElementHandle.glyph-mutation-args.test.js and
 *   ElementHandle.part-mutation-args.test.js.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

describe('ElementHandle non-integer index', () => {
  describe('when navigating with a non-integer index', () => {
    it('glyph() returns null instead of a zombie handle', () => {
      const g = new BlissSVGBuilder('B291/B92').group(0);
      expect(g.glyph(1.5)).toBeNull();
      expect(g.glyph(NaN)).toBeNull();
      expect(g.glyph(-1.5)).toBeNull();
      expect(g.glyph(0)).not.toBeNull();
    });

    it('part() returns null instead of a zombie handle', () => {
      const glyph = new BlissSVGBuilder('B291;B97').group(0).glyph(0);
      expect(glyph.part(1.5)).toBeNull();
      expect(glyph.part(NaN)).toBeNull();
      expect(glyph.part(-1.5)).toBeNull();
      expect(glyph.part(0)).not.toBeNull();
    });
  });

  describe('when mutating with a non-integer index', () => {
    it('insertGlyph() leaves the word untouched', () => {
      const b = new BlissSVGBuilder('B291/B92');
      b.group(0).insertGlyph(NaN, 'C8');
      b.group(0).insertGlyph(1.5, 'C8');
      b.group(0).insertGlyph(-1.5, 'C8');
      expect(b.toString()).toBe('B291/B92');
    });

    it('insertPart() leaves the glyph untouched', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).insertPart(NaN, 'B81');
      b.group(0).glyph(0).insertPart(1.5, 'B81');
      b.group(0).glyph(0).insertPart(-1.5, 'B81');
      expect(b.toString()).toBe('B291;B97');
    });

    it('insertPart() on a group handle stays a no-op through the level-1 delegation', () => {
      // a group handle's insertPart delegates to its last glyph's level-2 guard;
      // the non-integer index must be rejected on that path too
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).insertPart(NaN, 'B81');
      b.group(0).insertPart(1.5, 'B81');
      expect(b.toString()).toBe('B291;B97');
    });

    it('removeGlyph() leaves the word untouched', () => {
      const b = new BlissSVGBuilder('B291/B92');
      b.group(0).removeGlyph(NaN);
      b.group(0).removeGlyph(1.5);
      b.group(0).removeGlyph(-1.5);
      expect(b.toString()).toBe('B291/B92');
    });

    it('removePart() leaves the glyph untouched', () => {
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).removePart(NaN);
      b.group(0).glyph(0).removePart(1.5);
      b.group(0).glyph(0).removePart(-1.5);
      expect(b.toString()).toBe('B291;B97');
    });
  });

  describe('when splitting at a non-integer index', () => {
    it('splitAt() throws the out-of-range error and leaves the word intact', () => {
      const b = new BlissSVGBuilder('B291/B92/B208');
      expect(() => b.group(0).splitAt(NaN)).toThrow(/out of range/);
      expect(() => b.group(0).splitAt(1.5)).toThrow(/out of range/);
      expect(b.toString()).toBe('B291/B92/B208');
      const c = new BlissSVGBuilder('B291/B92/B208');
      c.group(0).splitAt(1);
      expect(c.toString()).toBe('B291//B92/B208');
    });
  });
});
