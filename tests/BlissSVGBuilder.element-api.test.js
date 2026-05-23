import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

// === STEP 1: detach(): plain splice without cascade ===

describe('ElementHandle.detach()', () => {

  // --- Part level ---

  describe('part level', () => {
    it('removes the part from the glyph', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.glyph(0).part(1).detach();
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].codeName).toBe('B291');
    });

    it('does NOT cascade when last part is detached (empty glyph stays)', () => {
      const b = new BlissSVGBuilder('H/C8');
      // H has 1 part; detaching it leaves an empty glyph
      b.glyph(0).part(0).detach();
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2); // both glyphs still present
      expect(glyphs[0].parts).toHaveLength(0); // empty parts array
    });

    it('returns undefined', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const result = b.glyph(0).part(1).detach();
      expect(result).toBeUndefined();
    });
  });

  // --- Glyph level ---

  describe('glyph level', () => {
    it('removes the glyph from the group', () => {
      const b = new BlissSVGBuilder('B291/B303/B431');
      b.group(0).glyph(1).detach(); // detach middle glyph (B303)
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].codeName).toBe('B291');
      expect(glyphs[1].codeName).toBe('B431');
    });

    it('does NOT cascade when last glyph is detached (empty group stays)', () => {
      const b = new BlissSVGBuilder('H//B303');
      const groupCountBefore = b.stats.groupCount;
      // B303 is the only glyph in group 1; detaching leaves empty group
      b.group(1).glyph(0).detach();
      // Group count should NOT decrease (unlike remove() which cascades)
      expect(b.stats.groupCount).toBe(groupCountBefore);
    });

    it('does NOT remove adjacent spaces when group becomes empty', () => {
      const b = new BlissSVGBuilder('H//B303');
      const rawGroupsBefore = b.toJSON().groups.length;
      b.group(1).glyph(0).detach();
      // Raw groups count stays the same (space group still present)
      expect(b.toJSON().groups.length).toBe(rawGroupsBefore);
    });

    it('returns undefined', () => {
      const b = new BlissSVGBuilder('H/C8');
      const result = b.group(0).glyph(0).detach();
      expect(result).toBeUndefined();
    });
  });

  // --- Group level ---

  describe('group level', () => {
    it('removes the group from the builder', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      b.group(1).detach(); // detach B303 group
      // B303 group gone, but spaces still present
      // The non-space group count should decrease by 1
      expect(b.stats.groupCount).toBe(2);
    });

    it('does NOT remove adjacent space groups (unlike remove())', () => {
      const b = new BlissSVGBuilder('H//B303');
      const rawGroupsBefore = b.toJSON().groups.length; // [H, SP, B303] = 3
      b.group(1).detach(); // detach B303
      // Space group still present; raw count only drops by 1 (the word group)
      const rawGroups = b.toJSON().groups;
      expect(rawGroups.length).toBe(rawGroupsBefore - 1);
      // Verify the space group (TSP) is still actually there
      const hasSpace = rawGroups.some(g =>
        g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName)
      );
      expect(hasSpace).toBe(true);
    });

    it('detaching middle group leaves both adjacent spaces', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      b.group(1).detach(); // detach B303 (middle group)
      const rawGroups = b.toJSON().groups;
      // Both space groups should survive: [H, SP, SP, B291]
      const spaceCount = rawGroups.filter(g =>
        g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName)
      ).length;
      expect(spaceCount).toBe(2);
    });

    it('returns undefined', () => {
      const b = new BlissSVGBuilder('H//B303');
      const result = b.group(1).detach();
      expect(result).toBeUndefined();
    });
  });

  // --- Boundary: single-element builder ---

  describe('single-element boundary', () => {
    it('detaching only glyph in only group leaves empty group', () => {
      const b = new BlissSVGBuilder('H');
      b.glyph(0).detach();
      const rawGroups = b.toJSON().groups;
      expect(rawGroups).toHaveLength(1);
      expect(rawGroups[0].glyphs).toHaveLength(0);
    });
  });

  // --- Generation / staleness ---

  describe('generation tracking', () => {
    it('other handle survives detach of a sibling', () => {
      const b = new BlissSVGBuilder('H/C8');
      const h1 = b.glyph(0);
      const h2 = b.glyph(1);
      h1.detach();
      // h2 survives because its node is still in the tree
      expect(h2.level).toBe(2);
    });
  });

  // --- Contrast with remove() ---

  describe('contrast with remove()', () => {
    it('remove() cascades: last glyph removal removes group and space', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.group(1).glyph(0).remove();
      // remove() cascades: group removed, space removed
      expect(b.stats.groupCount).toBe(1);
    });

    it('detach() does not cascade: last glyph removal leaves group and space', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.group(1).glyph(0).detach();
      // detach() does NOT cascade: group stays (empty), space stays
      const rawGroups = b.toJSON().groups;
      // Should still have all 3 raw groups: [H, SP, empty]
      expect(rawGroups.length).toBe(3);
    });
  });
});

// === STEP 2: element() / elementCount: raw index navigation including spaces ===

describe('builder.element() and builder.elementCount', () => {

  // --- elementCount ---

  describe('elementCount', () => {
    it('counts all raw groups including spaces', () => {
      const b = new BlissSVGBuilder('B313//B431');
      // Raw layout: [B313, TSP, B431]
      expect(b.elementCount).toBe(3);
    });

    it('returns 1 for a single-word builder', () => {
      const b = new BlissSVGBuilder('H');
      expect(b.elementCount).toBe(1);
    });

    it('returns 0 for an empty builder', () => {
      const b = new BlissSVGBuilder('H');
      b.clear();
      expect(b.elementCount).toBe(0);
    });

    it('counts three words with two spaces', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      // Raw layout: [H, TSP, B303, TSP, B291]
      expect(b.elementCount).toBe(5);
    });

    it('updates after mutation', () => {
      const b = new BlissSVGBuilder('H//B303');
      expect(b.elementCount).toBe(3);
      b.addGroup('B291');
      // Now: [H, TSP, B303, TSP, B291]
      expect(b.elementCount).toBe(5);
    });
  });

  // --- element() positive indexing ---

  describe('positive indexing', () => {
    it('element(0) returns the first word group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(0);
      expect(handle).not.toBeNull();
      expect(handle.glyph(0).codeName).toBe('B313');
    });

    it('element(1) returns the space group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(1);
      expect(handle).not.toBeNull();
      expect(handle.glyph(0).part(0).codeName).toBe('TSP');
    });

    it('element(2) returns the second word group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(2);
      expect(handle).not.toBeNull();
      expect(handle.glyph(0).codeName).toBe('B431');
    });

    it('returns null for out-of-range index', () => {
      const b = new BlissSVGBuilder('B313//B431');
      expect(b.element(3)).toBeNull();
      expect(b.element(99)).toBeNull();
    });

    it('returns null on an empty builder', () => {
      const b = new BlissSVGBuilder('H');
      b.clear();
      expect(b.element(0)).toBeNull();
    });
  });

  // --- element() negative indexing ---

  describe('negative indexing', () => {
    it('element(-1) returns the last group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(-1);
      expect(handle).not.toBeNull();
      expect(handle.glyph(0).codeName).toBe('B431');
    });

    it('element(-2) returns the space group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(-2);
      expect(handle).not.toBeNull();
      expect(handle.glyph(0).part(0).codeName).toBe('TSP');
    });

    it('element(-3) returns the first group', () => {
      const b = new BlissSVGBuilder('B313//B431');
      expect(b.element(-3).glyph(0).codeName).toBe('B313');
    });

    it('element(-1) returns the only group in a single-word builder', () => {
      const b = new BlissSVGBuilder('H');
      expect(b.element(-1).glyph(0).part(0).codeName).toBe('H');
    });

    it('returns null for out-of-range negative index', () => {
      const b = new BlissSVGBuilder('B313//B431');
      expect(b.element(-4)).toBeNull();
      expect(b.element(-99)).toBeNull();
    });
  });

  // --- handle identity ---

  describe('handle identity', () => {
    it('element(0) and group(0) reach the same group data', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const fromElement = b.element(0);
      const fromGroup = b.group(0);
      expect(fromElement.glyph(0).codeName).toBe('B313');
      expect(fromElement.glyph(0).codeName).toBe(fromGroup.glyph(0).codeName);
    });

    it('element(4) and group(2) reach the same third word', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      // element(4) = raw index of B291, group(2) = semantic index of B291
      expect(b.element(4).glyph(0).codeName).toBe('B291');
      expect(b.element(4).glyph(0).codeName).toBe(b.group(2).glyph(0).codeName);
    });

    it('element handles support standard group methods', () => {
      const b = new BlissSVGBuilder('H/C8');
      const handle = b.element(0);
      // Should work like any group handle: navigate to glyphs
      expect(handle.glyph(0)).not.toBeNull();
      expect(handle.glyph(0).part(0).codeName).toBe('H');
    });
  });

  // --- generation tracking ---

  describe('generation tracking', () => {
    it('element handle survives unrelated mutation', () => {
      const b = new BlissSVGBuilder('B313//B431');
      const handle = b.element(1); // space group
      b.addGroup('B291'); // mutation to a different part of tree
      expect(handle.codeName).toBe('');
    });
  });
});

// === STEP 3: addElement / insertElement / removeElement / replaceElement ===
// Plain splice operations on the raw groups array. No automatic space management.

describe('builder.addElement()', () => {

  it('appends a word group at the end of the raw array', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('B303');
    // No space inserted: raw layout is [H, B303]
    expect(b.elementCount).toBe(2);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
    expect(b.element(1).glyph(0).codeName).toBe('B303');
  });

  it('does NOT insert a space group automatically', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('B303');
    // Contrast with addGroup which would give [H, TSP, B303]
    expect(b.elementCount).toBe(2);
  });

  it('appends a space group when passed TSP', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('TSP');
    expect(b.elementCount).toBe(2);
    expect(b.element(1).glyph(0).part(0).codeName).toBe('TSP');
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('H');
    const result = b.addElement('B303');
    expect(result).toBe(b);
  });

  it('applies options to the new group', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('B303', { color: 'red' });
    const json = b.toJSON();
    expect(json.groups[1].options?.color).toBe('red');
  });

  it('applies { defaults, overrides } option layers', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('B303', {
      defaults: { color: 'gray' },
      overrides: { 'stroke-width': '0.5' }
    });
    const opts = b.toJSON().groups[1].options;
    expect(opts?.color).toBe('gray');
    expect(opts?.['stroke-width']).toBe('0.5');
  });

  it('works on an empty builder', () => {
    const b = new BlissSVGBuilder();
    b.addElement('H');
    expect(b.elementCount).toBe(1);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
  });

  it('can build a manual word/space/word layout', () => {
    const b = new BlissSVGBuilder();
    b.addElement('H');
    b.addElement('TSP');
    b.addElement('B303');
    expect(b.elementCount).toBe(3);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
    expect(b.element(1).glyph(0).part(0).codeName).toBe('TSP');
    expect(b.element(2).glyph(0).codeName).toBe('B303');
  });
});

describe('builder.insertElement()', () => {

  it('inserts at raw index 0', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.insertElement(0, 'B303');
    // Now: [B303, B313, TSP, B431]
    expect(b.elementCount).toBe(4);
    expect(b.element(0).glyph(0).codeName).toBe('B303');
    expect(b.element(1).glyph(0).codeName).toBe('B313');
  });

  it('inserts at a middle raw index', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]; insert space at index 2
    b.insertElement(2, 'TSP');
    // Now: [B313, TSP, TSP, B431]
    expect(b.elementCount).toBe(4);
    expect(b.element(2).glyph(0).part(0).codeName).toBe('TSP');
  });

  it('inserts at end (same as addElement)', () => {
    const b = new BlissSVGBuilder('H');
    b.insertElement(1, 'B303');
    expect(b.elementCount).toBe(2);
    expect(b.element(1).glyph(0).codeName).toBe('B303');
  });

  it('supports negative indexing', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431], insert before last
    b.insertElement(-1, 'B303');
    // Now: [B313, TSP, B303, B431]
    expect(b.elementCount).toBe(4);
    expect(b.element(2).glyph(0).codeName).toBe('B303');
    expect(b.element(3).glyph(0).codeName).toBe('B431');
  });

  it('does NOT insert automatic spaces', () => {
    const b = new BlissSVGBuilder('H');
    b.insertElement(0, 'B303');
    // [B303, H], no space
    expect(b.elementCount).toBe(2);
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('H');
    const result = b.insertElement(0, 'B303');
    expect(result).toBe(b);
  });

  it('applies options to the inserted group', () => {
    const b = new BlissSVGBuilder('H');
    b.insertElement(0, 'B303', { color: 'red' });
    expect(b.toJSON().groups[0].options?.color).toBe('red');
  });

  it('clamps beyond-end index to append', () => {
    const b = new BlissSVGBuilder('H');
    b.insertElement(99, 'B303');
    expect(b.elementCount).toBe(2);
    expect(b.element(1).glyph(0).codeName).toBe('B303');
  });
});

describe('builder.removeElement()', () => {

  it('removes the raw group at the given index', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.removeElement(1); // remove the space
    // Now: [B313, B431]
    expect(b.elementCount).toBe(2);
    expect(b.element(0).glyph(0).codeName).toBe('B313');
    expect(b.element(1).glyph(0).codeName).toBe('B431');
  });

  it('does NOT clean up adjacent spaces (unlike removeGroup)', () => {
    const b = new BlissSVGBuilder('H//B303//B291');
    // Raw: [H, TSP, B303, TSP, B291]
    b.removeElement(2); // remove B303 word group
    // Now: [H, TSP, TSP, B291]; both spaces remain
    expect(b.elementCount).toBe(4);
    expect(b.element(1).glyph(0).part(0).codeName).toBe('TSP');
    expect(b.element(2).glyph(0).part(0).codeName).toBe('TSP');
  });

  it('supports negative indexing', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.removeElement(-1); // remove last (B431)
    expect(b.elementCount).toBe(2);
    expect(b.element(1).glyph(0).part(0).codeName).toBe('TSP');
  });

  it('is a no-op for out-of-range index', () => {
    const b = new BlissSVGBuilder('H');
    b.removeElement(5);
    expect(b.elementCount).toBe(1);
  });

  it('is a no-op for out-of-range negative index', () => {
    const b = new BlissSVGBuilder('H');
    b.removeElement(-5);
    expect(b.elementCount).toBe(1);
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('H');
    const result = b.removeElement(0);
    expect(result).toBe(b);
  });

  it('can remove a space group directly', () => {
    const b = new BlissSVGBuilder('H//B303');
    // Raw: [H, TSP, B303]
    b.removeElement(1); // remove space
    // Now: [H, B303]
    expect(b.elementCount).toBe(2);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
    expect(b.element(1).glyph(0).codeName).toBe('B303');
  });
});

describe('builder.replaceElement()', () => {

  it('replaces the raw group at the given index', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.replaceElement(0, 'B291');
    expect(b.element(0).glyph(0).codeName).toBe('B291');
    expect(b.elementCount).toBe(3); // unchanged count
  });

  it('can replace a word with a space', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.replaceElement(0, 'TSP');
    // Now: [TSP, TSP, B431]
    expect(b.elementCount).toBe(3);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('TSP');
  });

  it('can replace a space with a word', () => {
    const b = new BlissSVGBuilder('B313//B431');
    // Raw: [B313, TSP, B431]
    b.replaceElement(1, 'B291');
    // Now: [B313, B291, B431]
    expect(b.elementCount).toBe(3);
    expect(b.element(1).glyph(0).codeName).toBe('B291');
  });

  it('supports negative indexing', () => {
    const b = new BlissSVGBuilder('B313//B431');
    b.replaceElement(-1, 'B291');
    expect(b.element(-1).glyph(0).codeName).toBe('B291');
  });

  it('is a no-op for out-of-range index', () => {
    const b = new BlissSVGBuilder('H');
    b.replaceElement(5, 'B303');
    expect(b.elementCount).toBe(1);
    expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
  });

  it('is a no-op for out-of-range negative index', () => {
    const b = new BlissSVGBuilder('H');
    b.replaceElement(-5, 'B303');
    expect(b.elementCount).toBe(1);
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('H');
    const result = b.replaceElement(0, 'B303');
    expect(result).toBe(b);
  });

  it('applies options to the replacement group', () => {
    const b = new BlissSVGBuilder('H');
    b.replaceElement(0, 'B303', { color: 'red' });
    expect(b.toJSON().groups[0].options?.color).toBe('red');
  });

  it('applies { defaults, overrides } option layers', () => {
    const b = new BlissSVGBuilder('H');
    b.replaceElement(0, 'B303', {
      defaults: { color: 'gray' },
      overrides: { 'stroke-width': '0.5' }
    });
    const opts = b.toJSON().groups[0].options;
    expect(opts?.color).toBe('gray');
    expect(opts?.['stroke-width']).toBe('0.5');
  });
});

// --- Step 3 additional coverage ---

describe('raw element CRUD: generation tracking', () => {
  it('existing handle survives addElement', () => {
    const b = new BlissSVGBuilder('H');
    const handle = b.element(0);
    b.addElement('B303');
    expect(handle.level).toBe(1);
  });
});

describe('raw element CRUD: edge cases', () => {
  it('insertElement clamps deeply negative index to 0 (prepend)', () => {
    const b = new BlissSVGBuilder('H');
    b.insertElement(-99, 'B303');
    expect(b.elementCount).toBe(2);
    expect(b.element(0).glyph(0).codeName).toBe('B303');
    expect(b.element(1).glyph(0).part(0).codeName).toBe('H');
  });

  it('addElement is a no-op for empty/unparseable code', () => {
    const b = new BlissSVGBuilder('H');
    b.addElement('');
    expect(b.elementCount).toBe(1);
  });
});

describe('raw element CRUD: contrast with *Group methods', () => {
  it('addGroup inserts a space; addElement does not', () => {
    const withGroup = new BlissSVGBuilder('H');
    withGroup.addGroup('B303');
    // addGroup: [H, TSP, B303]
    expect(withGroup.elementCount).toBe(3);

    const withElement = new BlissSVGBuilder('H');
    withElement.addElement('B303');
    // addElement: [H, B303]
    expect(withElement.elementCount).toBe(2);
  });

  it('removeGroup cleans adjacent space; removeElement does not', () => {
    const withGroup = new BlissSVGBuilder('H//B303//B291');
    withGroup.removeGroup(1); // removes B303 + one space
    // [H, TSP, B291] or [H, TSP, B291]; either way, one space removed
    expect(withGroup.elementCount).toBe(3);

    const withElement = new BlissSVGBuilder('H//B303//B291');
    withElement.removeElement(2); // removes B303, spaces stay
    // [H, TSP, TSP, B291]
    expect(withElement.elementCount).toBe(4);
  });
});

// === STEP 5: getElementByKey for space groups + isSpaceGroup snapshot flag ===

describe('getElementByKey: space group support', () => {

  it('finds a space group by its snapshot key', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    // snap.children[1] is the space group
    const spaceKey = snap.children[1].key;
    const handle = b.getElementByKey(spaceKey);
    expect(handle).not.toBeNull();
    // Verify it's actually the space group
    expect(handle.glyph(0).part(0).codeName).toBe('TSP');
  });

  it('finds a glyph within a space group by key', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    // The space group's child glyph
    const spaceGlyphKey = snap.children[1].children[0].key;
    const handle = b.getElementByKey(spaceGlyphKey);
    expect(handle).not.toBeNull();
    expect(handle.part(0).codeName).toBe('TSP');
  });

  it('finds a part within a space group glyph by key', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    // The space group's glyph's part
    const spacePartKey = snap.children[1].children[0].children[0].key;
    const handle = b.getElementByKey(spacePartKey);
    expect(handle).not.toBeNull();
    expect(handle.codeName).toBe('TSP');
  });

  it('still finds word groups by key (unchanged behavior)', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    const wordKey = snap.children[0].key;
    const handle = b.getElementByKey(wordKey);
    expect(handle).not.toBeNull();
    expect(handle.glyph(0).codeName).toBe('B313');
  });

  it('still returns null for non-existent key', () => {
    const b = new BlissSVGBuilder('B313//B431');
    expect(b.getElementByKey('nonexistent-key')).toBeNull();
  });

  it('finds space groups in multi-word input', () => {
    const b = new BlissSVGBuilder('H//B303//B291');
    const snap = b.snapshot();
    // Two space groups: children[1] and children[3]
    const space1Key = snap.children[1].key;
    const space2Key = snap.children[3].key;
    const h1 = b.getElementByKey(space1Key);
    const h2 = b.getElementByKey(space2Key);
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1.glyph(0).part(0).codeName).toBe('TSP');
    expect(h2.glyph(0).part(0).codeName).toBe('TSP');
  });

  it('round-trip: element() handle key resolves via getElementByKey', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const spaceHandle = b.element(1); // space group
    const snap = b.snapshot();
    const spaceKey = snap.children[1].key;
    const found = b.getElementByKey(spaceKey);
    expect(found).not.toBeNull();
    expect(found.glyph(0).part(0).codeName).toBe('TSP');
  });
});

describe('snapshot: isSpaceGroup flag', () => {

  it('space groups have isSpaceGroup: true', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    expect(snap.children[1].isSpaceGroup).toBe(true);
  });

  it('word groups have isSpaceGroup: false', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    expect(snap.children[0].isSpaceGroup).toBe(false);
    expect(snap.children[2].isSpaceGroup).toBe(false);
  });

  it('root element has isSpaceGroup: false', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    expect(snap.isSpaceGroup).toBe(false);
  });

  it('single-word builder has no space groups', () => {
    const b = new BlissSVGBuilder('H');
    const snap = b.snapshot();
    expect(snap.children[0].isSpaceGroup).toBe(false);
  });

  it('glyph-level snapshots have isSpaceGroup: false', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    // Glyph within a word group
    expect(snap.children[0].children[0].isSpaceGroup).toBe(false);
    // Glyph within a space group
    expect(snap.children[1].children[0].isSpaceGroup).toBe(false);
  });

  it('part-level snapshots have isSpaceGroup: false', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    expect(snap.children[0].children[0].children[0].isSpaceGroup).toBe(false);
  });

  it('QSP space groups also have isSpaceGroup: true', () => {
    // Use explicit QSP via element API
    const b = new BlissSVGBuilder('H');
    b.addElement('QSP');
    b.addElement('B303');
    const snap = b.snapshot();
    expect(snap.children[1].isSpaceGroup).toBe(true);
  });

  it('multiple space groups all marked correctly', () => {
    const b = new BlissSVGBuilder('H//B303//B291');
    const snap = b.snapshot();
    // children: [H, TSP, B303, TSP, B291]
    expect(snap.children[0].isSpaceGroup).toBe(false); // H
    expect(snap.children[1].isSpaceGroup).toBe(true);  // TSP
    expect(snap.children[2].isSpaceGroup).toBe(false); // B303
    expect(snap.children[3].isSpaceGroup).toBe(true);  // TSP
    expect(snap.children[4].isSpaceGroup).toBe(false); // B291
  });

  it('isSpaceGroup flag is frozen (immutable snapshot)', () => {
    const b = new BlissSVGBuilder('B313//B431');
    const snap = b.snapshot();
    expect(() => { snap.children[1].isSpaceGroup = false; }).toThrow();
  });
});

// === STEP 6: splitAt(glyphIndex): split a word group into two with auto SP ===

describe('ElementHandle.splitAt()', () => {

  // --- Basic split ---

  describe('basic split', () => {
    it('splits a 3-glyph word into two groups with a space between', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).splitAt(1);
      // [H] + [SP] + [C8, B291]
      expect(b.elementCount).toBe(3);
      expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.snapshot().children[1].isSpaceGroup).toBe(true);
      expect(b.element(2).glyph(0).part(0).codeName).toBe('C8');
      expect(b.element(2).glyph(1).codeName).toBe('B291');
    });

    it('splits at last boundary (3-glyph word, splitAt(2))', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).splitAt(2);
      // [H, C8] + [SP] + [B291]
      expect(b.elementCount).toBe(3);
      expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.element(0).glyph(1).part(0).codeName).toBe('C8');
      expect(b.element(2).glyph(0).codeName).toBe('B291');
    });

    it('splits a 2-glyph word into two single-glyph groups', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).splitAt(1);
      // [H] + [SP] + [C8]
      expect(b.elementCount).toBe(3);
      expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.element(2).glyph(0).part(0).codeName).toBe('C8');
    });

    it('splits a 4-glyph word in the middle', () => {
      const b = new BlissSVGBuilder('H/C8/B291/B303');
      b.group(0).splitAt(2);
      // [H, C8] + [SP] + [B291, B303]
      expect(b.elementCount).toBe(3);
      expect(b.toJSON().groups[0].glyphs).toHaveLength(2);
      expect(b.toJSON().groups[2].glyphs).toHaveLength(2);
      expect(b.element(0).glyph(1).part(0).codeName).toBe('C8');
      expect(b.element(2).glyph(0).codeName).toBe('B291');
      expect(b.element(2).glyph(1).codeName).toBe('B303');
    });
  });

  // --- Options handling ---

  describe('options handling', () => {
    it('left half keeps original group options', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).splitAt(1);
      const json = b.toJSON();
      expect(json.groups[0].options?.color).toBe('red');
    });

    it('right half gets a copy of the options', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).splitAt(1);
      const json = b.toJSON();
      expect(json.groups[2].options?.color).toBe('red');
    });

    it('right half options are independent (not same reference)', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).splitAt(1);
      // Modify options on right half; left should be unaffected
      b.group(1).setOptions({ color: 'blue' });
      const json = b.toJSON();
      expect(json.groups[0].options?.color).toBe('red');
      expect(json.groups[2].options?.color).toBe('blue');
    });

    it('split works when group has no options', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).splitAt(1);
      const json = b.toJSON();
      // Neither half should have options
      expect(json.groups[0].options).toBeUndefined();
      expect(json.groups[2].options).toBeUndefined();
    });
  });

  // --- Handle stays valid ---

  describe('handle validity', () => {
    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      const handle = b.group(0);
      const result = handle.splitAt(1);
      expect(result).toBe(handle);
    });

    it('handle still references the left half after split', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      const handle = b.group(0);
      handle.splitAt(1);
      // The handle should still point to the left half (H)
      expect(handle.glyph(0).part(0).codeName).toBe('H');
    });
  });

  // --- Boundary validation ---

  describe('boundary validation', () => {
    it('throws if glyphIndex is 0 (would produce empty left half)', () => {
      const b = new BlissSVGBuilder('H/C8');
      expect(() => b.group(0).splitAt(0)).toThrow();
    });

    it('throws if glyphIndex equals glyphs.length (would produce empty right half)', () => {
      const b = new BlissSVGBuilder('H/C8');
      expect(() => b.group(0).splitAt(2)).toThrow();
    });

    it('throws if glyphIndex is negative', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      expect(() => b.group(0).splitAt(-1)).toThrow();
    });

    it('throws on a single-glyph group (no valid split point)', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => b.group(0).splitAt(0)).toThrow();
      expect(() => b.group(0).splitAt(1)).toThrow();
    });
  });

  // --- Level restriction ---

  describe('level restriction', () => {
    it('returns this (no-op) on glyph-level handle', () => {
      const b = new BlissSVGBuilder('H/C8');
      const glyphHandle = b.glyph(0);
      const result = glyphHandle.splitAt(1);
      expect(result).toBe(glyphHandle);
      expect(b.elementCount).toBe(1); // unchanged
    });

    it('returns this (no-op) on part-level handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const partHandle = b.glyph(0).part(0);
      const result = partHandle.splitAt(1);
      expect(result).toBe(partHandle);
      expect(b.elementCount).toBe(1); // unchanged
    });
  });

  // --- Multi-word context ---

  describe('multi-word context', () => {
    it('splits a middle word group correctly', () => {
      const b = new BlissSVGBuilder('H//B303/B291//C8');
      // Raw: [H, TSP, B303/B291, TSP, C8]
      b.group(1).splitAt(1); // split B303/B291
      // Raw: [H, TSP, B303, SP, B291, TSP, C8]
      expect(b.elementCount).toBe(7);
      expect(b.element(2).glyph(0).codeName).toBe('B303');
      expect(b.element(4).glyph(0).codeName).toBe('B291');
    });

    it('splits the first word group in a multi-word builder', () => {
      const b = new BlissSVGBuilder('H/C8//B303');
      // Raw: [H/C8, TSP, B303]
      b.group(0).splitAt(1);
      // Raw: [H, SP, C8, TSP, B303]
      expect(b.elementCount).toBe(5);
      expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.element(2).glyph(0).part(0).codeName).toBe('C8');
      expect(b.element(4).glyph(0).codeName).toBe('B303');
    });

    it('splits the last word group in a multi-word builder', () => {
      const b = new BlissSVGBuilder('H//B303/B291');
      // Raw: [H, TSP, B303/B291]
      b.group(1).splitAt(1);
      // Raw: [H, TSP, B303, SP, B291]
      expect(b.elementCount).toBe(5);
      expect(b.element(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.element(2).glyph(0).codeName).toBe('B303');
      expect(b.element(4).glyph(0).codeName).toBe('B291');
    });
  });

  // --- Space resolution ---

  describe('SP resolution', () => {
    it('inserted space is a TSP (standard word space)', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).splitAt(1);
      const snap = b.snapshot();
      // The space group's glyph's part should be TSP
      expect(snap.children[1].children[0].children[0].codeName).toBe('TSP');
    });
  });

  // --- toString round-trip ---

  describe('toString round-trip', () => {
    it('produces correct DSL after split', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      b.group(0).splitAt(1);
      const str = b.toString();
      // Rebuild from string and verify structure
      const b2 = new BlissSVGBuilder(str);
      expect(b2.stats.groupCount).toBe(2);
      expect(b2.group(0).glyph(0).part(0).codeName).toBe('H');
      expect(b2.group(1).glyph(0).part(0).codeName).toBe('C8');
      expect(b2.group(1).glyph(1).codeName).toBe('B291');
    });

    it('preserves group options in toString after split', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).splitAt(1);
      const str = b.toString();
      const b2 = new BlissSVGBuilder(str);
      expect(b2.stats.groupCount).toBe(2);
      const json = b2.toJSON();
      const wordGroups = json.groups.filter(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(wordGroups[0].options?.color).toBe('red');
      expect(wordGroups[1].options?.color).toBe('red');
    });
  });

  // --- Generation tracking ---

  describe('generation tracking', () => {
    it('other handle survives splitAt on a different group', () => {
      const b = new BlissSVGBuilder('H/C8//B303');
      const otherHandle = b.group(1);
      b.group(0).splitAt(1);
      expect(otherHandle.glyph(0).codeName).toBe('B303');
    });
  });
});

// === STEP 7: mergeWithNext(): absorb next word group, remove spaces between ===

describe('ElementHandle.mergeWithNext()', () => {

  // --- Basic merge ---

  describe('basic merge', () => {
    it('merges two single-glyph words into one group', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(0).mergeWithNext();
      // [H, C8] in one group, no space
      expect(b.elementCount).toBe(1);
      expect(b.stats.groupCount).toBe(1);
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
    });

    it('merges multi-glyph words into one group', () => {
      const b = new BlissSVGBuilder('H/C8//B291/B303');
      b.group(0).mergeWithNext();
      expect(b.elementCount).toBe(1);
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(4);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
      expect(glyphs[2].codeName).toBe('B291');
      expect(glyphs[3].codeName).toBe('B303');
    });

    it('removes the space group between the two words', () => {
      const b = new BlissSVGBuilder('H//C8');
      // Before: [H, TSP, C8]
      expect(b.elementCount).toBe(3);
      b.group(0).mergeWithNext();
      // After: [H/C8]
      expect(b.elementCount).toBe(1);
    });
  });

  // --- Multiple spaces between words ---

  describe('multiple spaces between words', () => {
    it('removes all space groups between the two words', () => {
      const b = new BlissSVGBuilder('H');
      // Build [H, SP, SP, C8] manually
      b.addElement('TSP');
      b.addElement('TSP');
      b.addElement('C8');
      expect(b.elementCount).toBe(4);
      b.group(0).mergeWithNext();
      // All spaces removed, words merged
      expect(b.elementCount).toBe(1);
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
    });
  });

  // --- Options handling ---

  describe('options handling', () => {
    it('keeps the first group options', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).mergeWithNext();
      const opts = b.toJSON().groups[0].options;
      expect(opts?.color).toBe('red');
    });

    it('discards the second group options', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(1).setOptions({ color: 'blue' });
      b.group(0).mergeWithNext();
      // Merged group should NOT have blue
      const opts = b.toJSON().groups[0].options;
      expect(opts?.color).toBeUndefined();
    });

    it('keeps first options and discards second when both have options', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(0).setOptions({ color: 'red' });
      b.group(1).setOptions({ color: 'blue', background: 'green' });
      b.group(0).mergeWithNext();
      const opts = b.toJSON().groups[0].options;
      expect(opts?.color).toBe('red');
      expect(opts?.background).toBeUndefined();
    });
  });

  // --- No-op cases ---

  describe('no-op cases', () => {
    it('is a no-op when this is the last word group', () => {
      const b = new BlissSVGBuilder('H//C8');
      const before = b.toString();
      b.group(1).mergeWithNext(); // C8 is last word
      expect(b.toString()).toBe(before);
    });

    it('is a no-op on a single-word builder', () => {
      const b = new BlissSVGBuilder('H');
      const before = b.toString();
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe(before);
    });

    it('is a no-op when only trailing spaces follow (no next word)', () => {
      const b = new BlissSVGBuilder('H');
      b.addElement('TSP'); // trailing space, no next word
      b.group(0).mergeWithNext();
      // Still just [H, TSP]
      expect(b.elementCount).toBe(2);
    });
  });

  // --- Multi-word context ---

  describe('multi-word context', () => {
    it('merges first with second, leaving third intact', () => {
      const b = new BlissSVGBuilder('H//C8//B291');
      // Raw: [H, TSP, C8, TSP, B291]
      b.group(0).mergeWithNext();
      // Now: [H/C8, TSP, B291]
      expect(b.stats.groupCount).toBe(2);
      expect(b.elementCount).toBe(3);
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
      expect(b.group(1).glyph(0).codeName).toBe('B291');
    });

    it('merges second with third, leaving first intact', () => {
      const b = new BlissSVGBuilder('H//C8//B291');
      b.group(1).mergeWithNext();
      // Now: [H, TSP, C8/B291]
      expect(b.stats.groupCount).toBe(2);
      expect(b.elementCount).toBe(3);
      expect(b.group(0).glyph(0).part(0).codeName).toBe('H');
      const glyphs = b.toJSON().groups[2].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('C8');
      expect(glyphs[1].codeName).toBe('B291');
    });
  });

  // --- Handle validity ---

  describe('handle validity', () => {
    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H//C8');
      const handle = b.group(0);
      const result = handle.mergeWithNext();
      expect(result).toBe(handle);
    });

    it('handle still references the merged group after merge', () => {
      const b = new BlissSVGBuilder('H//C8');
      const handle = b.group(0);
      handle.mergeWithNext();
      // Handle should still point to the merged group containing both glyphs
      expect(handle.glyph(0).part(0).codeName).toBe('H');
      expect(handle.glyph(1).part(0).codeName).toBe('C8');
    });
  });

  // --- Level restriction ---

  describe('level restriction', () => {
    it('returns this (no-op) on glyph-level handle', () => {
      const b = new BlissSVGBuilder('H//C8');
      const glyphHandle = b.glyph(0);
      const result = glyphHandle.mergeWithNext();
      expect(result).toBe(glyphHandle);
      expect(b.elementCount).toBe(3); // unchanged
    });

    it('returns this (no-op) on part-level handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const partHandle = b.glyph(0).part(0);
      const result = partHandle.mergeWithNext();
      expect(result).toBe(partHandle);
      expect(b.elementCount).toBe(1); // unchanged
    });

    it('is a no-op on a space group handle (via element())', () => {
      const b = new BlissSVGBuilder('H//C8');
      const spaceHandle = b.element(1); // TSP group
      const before = b.toString();
      spaceHandle.mergeWithNext();
      expect(b.toString()).toBe(before);
      expect(b.elementCount).toBe(3);
    });
  });

  // --- Chained merges ---

  describe('chained merges', () => {
    it('consecutive merges collapse three words into one', () => {
      const b = new BlissSVGBuilder('H//C8//B291');
      const handle = b.group(0);
      handle.mergeWithNext();
      // Now: [H/C8, TSP, B291]
      handle.mergeWithNext();
      // Now: [H/C8/B291]
      expect(b.elementCount).toBe(1);
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(3);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
      expect(glyphs[2].codeName).toBe('B291');
    });
  });

  // --- Glyph-level option preservation ---

  describe('glyph-level option preservation', () => {
    it('preserves glyph-level options on absorbed glyphs', () => {
      const b = new BlissSVGBuilder('H//C8');
      // Set glyph-level options on C8
      b.group(1).glyph(0).setOptions({ color: 'blue' });
      b.group(0).mergeWithNext();
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[1].options?.color).toBe('blue');
    });
  });

  // --- toString round-trip ---

  describe('toString round-trip', () => {
    it('produces correct DSL after merge', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(0).mergeWithNext();
      const str = b.toString();
      const b2 = new BlissSVGBuilder(str);
      expect(b2.stats.groupCount).toBe(1);
      const glyphs = b2.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
    });

    it('preserves first group options in toString after merge', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.group(0).setOptions({ color: 'red' });
      b.group(0).mergeWithNext();
      const str = b.toString();
      const b2 = new BlissSVGBuilder(str);
      expect(b2.toJSON().groups[0].options?.color).toBe('red');
    });
  });

  // --- Generation tracking ---

  describe('generation tracking', () => {
    it('other handle survives mergeWithNext on a different group', () => {
      const b = new BlissSVGBuilder('H//C8//B291');
      const otherHandle = b.group(2);
      b.group(0).mergeWithNext();
      expect(otherHandle.glyph(0).codeName).toBe('B291');
    });

    it('no generation bump when merge is a no-op', () => {
      const b = new BlissSVGBuilder('H');
      const handle = b.group(0);
      handle.mergeWithNext(); // no-op, only one group
      // Handle should still be alive (no generation bump)
      expect(() => handle.glyph(0)).not.toThrow();
    });
  });

  // --- Inverse of splitAt ---

  describe('inverse of splitAt', () => {
    it('mergeWithNext undoes a splitAt', () => {
      const b = new BlissSVGBuilder('H/C8/B291');
      const before = b.toString();
      b.group(0).splitAt(1);
      // Now: [H] + [SP] + [C8/B291]
      expect(b.stats.groupCount).toBe(2);
      b.group(0).mergeWithNext();
      // Back to: [H/C8/B291]
      expect(b.stats.groupCount).toBe(1);
      expect(b.toString()).toBe(before);
    });
  });
});
