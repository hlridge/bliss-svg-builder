import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

// === PHASE 1: Infrastructure ===

describe('BlissSVGBuilder.Mutation.Infrastructure', () => {
  describe('#rebuild() internal consistency', () => {
    it('produces identical SVG after construction (no mutation)', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const svg1 = builder.svgCode;
      const svg2 = new BlissSVGBuilder("H/C8").svgCode;
      expect(svg1).toBe(svg2);
    });

    it('toJSON() still works after construction', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const json = builder.toJSON();
      expect(json.groups).toBeDefined();
      expect(json.groups[0].glyphs).toHaveLength(2);
    });
  });
});

// === PHASE 2 & 3: Navigation ===

describe('BlissSVGBuilder.Mutation.Navigation', () => {
  describe('group()', () => {
    it('returns an ElementHandle for a non-space group', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      const handle = builder.group(0);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(1);
    });

    it('skips space groups in indexing', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      const g0 = builder.group(0);
      const g1 = builder.group(1);
      expect(g0).not.toBeNull();
      expect(g1).not.toBeNull();
    });

    it('returns null for out-of-range index', () => {
      const builder = new BlissSVGBuilder("H/C8");
      expect(builder.group(5)).toBeNull();
    });
  });

  describe('glyph()', () => {
    it('returns an ElementHandle with flat indexing across groups', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      const g0 = builder.glyph(0);
      const g2 = builder.glyph(2);
      expect(g0).not.toBeNull();
      expect(g0.level).toBe(2);
      expect(g2).not.toBeNull();
    });

    it('returns null for out-of-range flat index', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      expect(builder.glyph(10)).toBeNull();
    });
  });

  describe('group().glyph()', () => {
    it('returns glyph within a specific group', () => {
      const builder = new BlissSVGBuilder("H/C8//B303/B291");
      const handle = builder.group(1).glyph(1);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(2);
    });
  });

  describe('part() (flat index)', () => {
    it('returns a part handle with flat indexing across all glyphs', () => {
      const builder = new BlissSVGBuilder("H//B431;B81");
      // H has 1 part (index 0), B431;B81 has 2 parts (index 1, 2)
      const p0 = builder.part(0);
      expect(p0).not.toBeNull();
      expect(p0.level).toBe(3);

      const p1 = builder.part(1);
      expect(p1).not.toBeNull();

      const p2 = builder.part(2);
      expect(p2).not.toBeNull();
    });

    it('returns null for out-of-range flat index', () => {
      const builder = new BlissSVGBuilder("H/C8");
      expect(builder.part(99)).toBeNull();
    });

    it('negative index returns the last part', () => {
      const builder = new BlissSVGBuilder("H");
      expect(builder.part(-1)).not.toBeNull();
    });

    it('returns a mutable handle', () => {
      const builder = new BlissSVGBuilder("H;C8");
      const svgBefore = builder.svgCode;
      builder.part(1).setOptions({ overrides: { color: 'red' } });
      expect(builder.svgCode).not.toBe(svgBefore);
    });
  });

  describe('glyph().part()', () => {
    it('returns part within a glyph', () => {
      const builder = new BlissSVGBuilder("B231;B290");
      const handle = builder.glyph(0).part(0);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(3);
    });

    it('returns null for out-of-range part index', () => {
      const builder = new BlissSVGBuilder("H");
      expect(builder.glyph(0).part(99)).toBeNull();
    });
  });

  describe('getElementByKey()', () => {
    it('returns a live ElementHandle for a known key', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const snap = builder.snapshot();
      const firstGlyphKey = snap.children[0].children[0].key;
      const handle = builder.getElementByKey(firstGlyphKey);
      expect(handle).not.toBeNull();
    });

    it('returns null for unknown key', () => {
      const builder = new BlissSVGBuilder("H/C8");
      expect(builder.getElementByKey("nonexistent")).toBeNull();
    });
  });

  describe('snapshot()', () => {
    it('returns a frozen tree', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const snap = builder.snapshot();
      expect(Object.isFrozen(snap)).toBe(true);
    });
  });
});

// === PHASE 3 & 4: Structural Mutation ===

describe('BlissSVGBuilder.Mutation.Structural', () => {
  describe('remove()', () => {
    it('removes a glyph and SVG reflects the change', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const svgBefore = builder.svgCode;
      builder.glyph(1).remove();
      const svgAfter = builder.svgCode;
      expect(svgAfter).not.toBe(svgBefore);
      const rebuilt = new BlissSVGBuilder("H");
      expect(svgAfter).toBe(rebuilt.svgCode);
    });

    it('removes a group and manages space groups', () => {
      const builder = new BlissSVGBuilder("H//C8");
      builder.group(1).remove();
      const expected = new BlissSVGBuilder("H");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('cascades: removing last glyph in group removes the group', () => {
      const builder = new BlissSVGBuilder("H//C8");
      builder.glyph(1).remove();
      const expected = new BlissSVGBuilder("H");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('cascades: removing last part in glyph removes the glyph', () => {
      const builder = new BlissSVGBuilder("H/C8");
      builder.glyph(0).part(0).remove();
      const expected = new BlissSVGBuilder("C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('addGlyph()', () => {
    it('adds a glyph to a group', () => {
      const builder = new BlissSVGBuilder("H");
      builder.group(0).addGlyph("C8");
      const expected = new BlissSVGBuilder("H/C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('parses DSL code string with inline options', () => {
      const builder = new BlissSVGBuilder("H");
      builder.group(0).addGlyph("[color=red]C8");
      const json = builder.toJSON();
      const lastGlyph = json.groups[0].glyphs[1];
      expect(lastGlyph).toBeDefined();
      expect(lastGlyph.options).toBeDefined();
    });
  });

  describe('insertGlyph()', () => {
    it('inserts a glyph at a specific position within a group', () => {
      const builder = new BlissSVGBuilder("H/B303");
      builder.group(0).insertGlyph(1, "C8");
      const expected = new BlissSVGBuilder("H/C8/B303");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('insert at 0 prepends', () => {
      const builder = new BlissSVGBuilder("H/B303");
      builder.group(0).insertGlyph(0, "C8");
      const expected = new BlissSVGBuilder("C8/H/B303");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('addPart()', () => {
    it('adds a part to a glyph', () => {
      const builder = new BlissSVGBuilder("H");
      builder.glyph(0).addPart("C8");
      const expected = new BlissSVGBuilder("H;C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('insertPart()', () => {
    it('inserts a part at a specific position within a glyph', () => {
      const builder = new BlissSVGBuilder("H;B303");
      builder.glyph(0).insertPart(1, "C8");
      const expected = new BlissSVGBuilder("H;C8;B303");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('replace()', () => {
    it('replaces a glyph with a new code', () => {
      const builder = new BlissSVGBuilder("H/C8");
      builder.glyph(0).replace("B303");
      const expected = new BlissSVGBuilder("B303/C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('replaces a part within a glyph', () => {
      const builder = new BlissSVGBuilder("H;C8");
      builder.glyph(0).part(1).replace("B303");
      const expected = new BlissSVGBuilder("H;B303");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });
});

// === PHASE 4: Builder Convenience Methods ===

describe('BlissSVGBuilder.Mutation.Convenience', () => {
  describe('addGroup()', () => {
    it('appends a new word group with automatic space management', () => {
      const builder = new BlissSVGBuilder("H");
      builder.addGroup("C8");
      const expected = new BlissSVGBuilder("H//C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('returns this for chaining', () => {
      const builder = new BlissSVGBuilder("H");
      const result = builder.addGroup("C8");
      expect(result).toBe(builder);
    });
  });

  describe('addGlyph()', () => {
    it('appends a glyph to the last non-space group', () => {
      const builder = new BlissSVGBuilder("H");
      builder.addGlyph("C8");
      const expected = new BlissSVGBuilder("H/C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it('creates a new group if builder is empty', () => {
      const builder = new BlissSVGBuilder("H");
      builder.clear();
      builder.addGlyph("C8");
      const expected = new BlissSVGBuilder("C8");
      expect(builder.svgCode).toBe(expected.svgCode);
    });
  });

  describe('clear()', () => {
    it('removes all content', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      builder.clear();
      const json = builder.toJSON();
      expect(json.groups).toEqual([]);
    });

    it('returns this for chaining', () => {
      const builder = new BlissSVGBuilder("H");
      expect(builder.clear()).toBe(builder);
    });
  });
});

// === PHASE: Options Mutation ===

describe('BlissSVGBuilder.Mutation.Options', () => {
  describe('setOptions() on a glyph', () => {
    it('sets options that affect SVG output', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const svgBefore = builder.svgCode;
      builder.glyph(0).setOptions({ overrides: { color: 'red' } });
      expect(builder.svgCode).not.toBe(svgBefore);
    });

    it('merges with existing options', () => {
      const builder = new BlissSVGBuilder("[color=red]H");
      builder.glyph(0).setOptions({ overrides: { fill: 'blue' } });
      const json = builder.toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.options).toHaveProperty('color');
      expect(glyph.options).toHaveProperty('fill');
    });

    it('returns this for chaining', () => {
      const builder = new BlissSVGBuilder("H");
      const handle = builder.glyph(0);
      expect(handle.setOptions({ overrides: { color: 'red' } })).toBe(handle);
    });
  });

  describe('setOptions() on a group', () => {
    it('sets options on a group', () => {
      const builder = new BlissSVGBuilder("H/C8");
      builder.group(0).setOptions({ overrides: { color: 'blue' } });
      const json = builder.toJSON();
      expect(json.groups[0].options).toHaveProperty('color');
    });
  });

  describe('setOptions() on a part', () => {
    it('sets options on a part', () => {
      const builder = new BlissSVGBuilder("H;C8");
      builder.glyph(0).part(1).setOptions({ overrides: { color: 'green' } });
      const json = builder.toJSON();
      const part = json.groups[0].glyphs[0].parts[1];
      expect(part.options).toHaveProperty('color');
    });
  });

  describe('removeOptions()', () => {
    it('removes specific option keys', () => {
      const builder = new BlissSVGBuilder("[color=red]H");
      builder.glyph(0).removeOptions('color');
      const json = builder.toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.options?.color).toBeUndefined();
    });
  });
});

// === PHASE: Defaults/Overrides on Mutations ===

describe('BlissSVGBuilder.Mutation.DefaultsOverrides', () => {
  it('applies defaults below DSL string options', () => {
    const builder = new BlissSVGBuilder("H");
    builder.group(0).addGlyph("[color=red]C8", {
      defaults: { color: 'blue' }
    });
    const json = builder.toJSON();
    const glyph = json.groups[0].glyphs[1];
    expect(glyph.options.color).toBe('red');
  });

  it('applies defaults when DSL string has no option', () => {
    const builder = new BlissSVGBuilder("H");
    builder.group(0).addGlyph("C8", {
      defaults: { color: 'blue' }
    });
    const json = builder.toJSON();
    const glyph = json.groups[0].glyphs[1];
    expect(glyph.options.color).toBe('blue');
  });

  it('applies overrides above DSL string options', () => {
    const builder = new BlissSVGBuilder("H");
    builder.group(0).addGlyph("[color=red]C8", {
      overrides: { color: 'green' }
    });
    const json = builder.toJSON();
    const glyph = json.groups[0].glyphs[1];
    expect(glyph.options.color).toBe('green');
  });

  it('works on replace()', () => {
    const builder = new BlissSVGBuilder("H/C8");
    builder.glyph(0).replace("B303", {
      overrides: { color: 'red' }
    });
    const json = builder.toJSON();
    const glyph = json.groups[0].glyphs[0];
    expect(glyph.options.color).toBe('red');
  });
});

// === PHASE: Chaining ===

describe('BlissSVGBuilder.Mutation.Chaining', () => {
  it('chains builder convenience methods', () => {
    const builder = new BlissSVGBuilder("H");
    const svg = builder.addGroup("C8").addGroup("B303").svgCode;
    const expected = new BlissSVGBuilder("H//C8//B303").svgCode;
    expect(svg).toBe(expected);
  });

  it('chains element handle methods', () => {
    const builder = new BlissSVGBuilder("H/C8");
    builder.group(0)
      .setOptions({ overrides: { color: 'red' } })
      .addGlyph("B303");
    const json = builder.toJSON();
    expect(json.groups[0].glyphs).toHaveLength(3);
    expect(json.groups[0].options).toHaveProperty('color');
  });
});

// === PHASE: Snapshot Isolation ===

describe('BlissSVGBuilder.Mutation.Snapshot', () => {
  it('snapshot is not affected by subsequent mutations', () => {
    const builder = new BlissSVGBuilder("H/C8");
    const snap = builder.snapshot();
    const childCountBefore = snap.children[0].children.length;
    builder.glyph(1).remove();
    expect(snap.children[0].children.length).toBe(childCountBefore);
  });

  it('snapshot is frozen', () => {
    const builder = new BlissSVGBuilder("H");
    const snap = builder.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });
});

// === PHASE: Round-Trip ===

describe('BlissSVGBuilder.Mutation.RoundTrip', () => {
  it('toJSON() after mutation produces valid input for constructor', () => {
    const builder = new BlissSVGBuilder("H/C8//B303");
    builder.glyph(1).remove();
    const json = builder.toJSON();
    const rebuilt = new BlissSVGBuilder(json);
    expect(rebuilt.svgCode).toBe(builder.svgCode);
  });

  it('multiple mutations round-trip correctly', () => {
    const builder = new BlissSVGBuilder("H");
    builder.addGroup("C8");
    builder.group(0).addGlyph("B303");
    builder.glyph(0).setOptions({ overrides: { color: 'red' } });

    const json = builder.toJSON();
    const rebuilt = new BlissSVGBuilder(json);
    expect(rebuilt.svgCode).toBe(builder.svgCode);
  });
});

// === PHASE: Edge Cases ===

describe('BlissSVGBuilder.Mutation.EdgeCases', () => {
  it('out-of-range group() returns null', () => {
    const builder = new BlissSVGBuilder("H");
    expect(builder.group(99)).toBeNull();
  });

  it('out-of-range glyph() returns null', () => {
    const builder = new BlissSVGBuilder("H");
    expect(builder.glyph(99)).toBeNull();
  });

  it('negative index returns the last element', () => {
    const builder = new BlissSVGBuilder("H");
    expect(builder.group(-1)).not.toBeNull();
    expect(builder.glyph(-1)).not.toBeNull();
  });

  it('remove() on single glyph leaves builder empty', () => {
    const builder = new BlissSVGBuilder("H");
    builder.glyph(0).remove();
    const json = builder.toJSON();
    expect(json.groups).toEqual([]);
  });

  it('addGlyph on empty builder after clear() creates a group', () => {
    const builder = new BlissSVGBuilder("H");
    builder.clear();
    builder.addGlyph("C8");
    const expected = new BlissSVGBuilder("C8");
    expect(builder.svgCode).toBe(expected.svgCode);
  });

  it('multiple removes in sequence work correctly', () => {
    const builder = new BlissSVGBuilder("H/C8/B303");
    builder.glyph(2).remove();
    builder.glyph(1).remove();
    const expected = new BlissSVGBuilder("H");
    expect(builder.svgCode).toBe(expected.svgCode);
  });
});

// === PHASE: Query Methods ===

describe('BlissSVGBuilder.Mutation.QueryMethods', () => {
  describe('traverse()', () => {
    it('walks all elements in the composition tree', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const types = [];
      builder.traverse(el => { types.push(el.type); });
      expect(types.length).toBeGreaterThan(0);
    });
  });

  describe('query()', () => {
    it('finds elements matching a predicate', () => {
      const builder = new BlissSVGBuilder("H/C8");
      const glyphs = builder.query(el => el.isGlyph);
      expect(glyphs.length).toBe(2);
    });
  });

  describe('stats', () => {
    it('returns groupCount and glyphCount', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      const stats = builder.stats;
      expect(stats.groupCount).toBe(2);
      expect(stats.glyphCount).toBe(3);
    });

    it('updates after mutation', () => {
      const builder = new BlissSVGBuilder("H/C8//B303");
      builder.glyph(2).remove();
      const stats = builder.stats;
      expect(stats.groupCount).toBe(1);
      expect(stats.glyphCount).toBe(2);
    });
  });
});

// === Key Persistence ===
// Keys are stable identifiers for DSL-visible elements (groups, glyphs, immediate parts).
// They persist across rebuilds so getElementByKey works after mutations.
// Deeper nested parts (definition expansions) and error placeholder parts
// have ephemeral keys that regenerate each rebuild; this is intentional.

describe('BlissSVGBuilder.Mutation.KeyPersistence', () => {
  // Helper: collect keys from a snapshot at the three DSL-visible levels
  function collectKeys(builder) {
    const snap = builder.snapshot();
    const keys = { groups: [], glyphs: [], parts: [] };
    for (const group of snap.children) {
      keys.groups.push(group.key);
      for (const glyph of group.children.filter(c => c.isGlyph)) {
        keys.glyphs.push(glyph.key);
        for (const part of glyph.children) {
          keys.parts.push(part.key);
        }
      }
    }
    return keys;
  }

  describe('keys are exactly 8 characters', () => {
    it('all auto-generated keys have length 8', () => {
      const builder = new BlissSVGBuilder('H/C8//B303');
      const keys = collectKeys(builder);
      const all = [...keys.groups, ...keys.glyphs, ...keys.parts];
      for (const key of all) {
        expect(key).toHaveLength(8);
      }
    });
  });

  describe('keys survive rebuilds triggered by mutations', () => {
    it('glyph keys persist after removing a different glyph', () => {
      const builder = new BlissSVGBuilder('H/C8/B303');
      const before = collectKeys(builder);

      // Remove the second glyph (C8)
      builder.glyph(1).remove();
      const after = collectKeys(builder);

      // H (index 0) and B303 (was index 2, now index 1) should keep their keys
      expect(after.glyphs).toContain(before.glyphs[0]); // H
      expect(after.glyphs).toContain(before.glyphs[2]); // B303
      expect(after.glyphs).not.toContain(before.glyphs[1]); // C8 removed
    });

    it('group keys persist after removing a different group', () => {
      const builder = new BlissSVGBuilder('H/C8//B303//B291');
      const before = collectKeys(builder);

      // Remove the second group (B303)
      builder.group(1).remove();
      const after = collectKeys(builder);

      expect(after.groups).toContain(before.groups[0]); // first group
      expect(after.groups).toContain(before.groups[4]); // third group (index 4 because space groups)
    });

    it('part keys persist after removing a different part', () => {
      const builder = new BlissSVGBuilder('H;C8;B303');
      const before = collectKeys(builder);

      // Remove the second part (C8)
      builder.part(1).remove();
      const after = collectKeys(builder);

      expect(after.parts).toContain(before.parts[0]); // H
      expect(after.parts).toContain(before.parts[2]); // B303
      expect(after.parts).not.toContain(before.parts[1]); // C8 removed
    });

    it('keys persist after addGroup', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const before = collectKeys(builder);

      builder.addGroup('B303');
      const after = collectKeys(builder);

      // All original keys should still be present
      for (const key of before.glyphs) {
        expect(after.glyphs).toContain(key);
      }
    });

    it('keys persist after setOptions on a handle', () => {
      const builder = new BlissSVGBuilder('H/C8//B303');
      const before = collectKeys(builder);

      builder.glyph(0).setOptions({ overrides: { color: 'red' } });
      const after = collectKeys(builder);

      expect(after.glyphs).toEqual(expect.arrayContaining(before.glyphs));
      expect(after.parts).toEqual(expect.arrayContaining(before.parts));
    });
  });

  describe('getElementByKey works after mutations', () => {
    it('can look up surviving elements by key after a removal', () => {
      // Use Bliss glyph codes so codeName is populated on the glyph level
      const builder = new BlissSVGBuilder('B291/B292/B303');
      const glyphs = builder.snapshot().children[0].children.filter(c => c.isGlyph);
      const key0 = glyphs[0].key;
      const key2 = glyphs[2].key;

      // Remove B292 (the middle glyph)
      builder.glyph(1).remove();

      // B291 and B303 should still be findable by their original keys
      const handle0 = builder.getElementByKey(key0);
      const handle2 = builder.getElementByKey(key2);
      expect(handle0).not.toBeNull();
      expect(handle0.level).toBe(2);
      expect(handle2).not.toBeNull();
      expect(handle2.level).toBe(2);
    });

    it('returns null for a removed element key', () => {
      const builder = new BlissSVGBuilder('H/C8/B303');
      const keyC8 = builder.snapshot().children[0].children[1].key;

      builder.glyph(1).remove();

      expect(builder.getElementByKey(keyC8)).toBeNull();
    });
  });

  describe('user-assigned keys take precedence', () => {
    it('preserves a user-assigned key from DSL (group level)', () => {
      const builder = new BlissSVGBuilder('[key=myGroup]|H/C8');
      const snap = builder.snapshot();
      // Single pipe = group-level options
      const group = snap.children[0];
      expect(group.key).toBe('myGroup');
    });

    it('preserves a user-assigned key from DSL (glyph level)', () => {
      const builder = new BlissSVGBuilder('[key=myH]H/C8');
      const snap = builder.snapshot();
      const glyphs = snap.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[0].key).toBe('myH');
    });

    it('user-assigned key survives mutations', () => {
      const builder = new BlissSVGBuilder('[key=myH]H/C8/B303');
      builder.glyph(1).remove(); // remove C8
      const handle = builder.getElementByKey('myH');
      expect(handle).not.toBeNull();
    });
  });

  describe('keys do not leak to output', () => {
    it('toJSON strips all keys', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const json = builder.toJSON();

      function assertNoKeys(obj) {
        expect(obj).not.toHaveProperty('key');
        if (obj.options) expect(obj.options).not.toHaveProperty('key');
        if (obj.groups) obj.groups.forEach(assertNoKeys);
        if (obj.glyphs) obj.glyphs.forEach(assertNoKeys);
        if (obj.parts) obj.parts.forEach(assertNoKeys);
      }
      assertNoKeys(json);
    });

    it('toString does not contain key assignments', () => {
      const builder = new BlissSVGBuilder('[key=myH]|H/C8');
      const str = builder.toString();
      expect(str).not.toContain('key=');
    });

    it('key does not appear as an SVG attribute', () => {
      const builder = new BlissSVGBuilder('[key=myH]|H');
      const svg = builder.svgCode;
      expect(svg).not.toContain('key=');
    });
  });

  describe('space group keys', () => {
    it('space groups receive stable keys', () => {
      const builder = new BlissSVGBuilder('H//C8');
      const snap = builder.snapshot();
      // Space group is between the two word groups
      const spaceGroup = snap.children.find(g =>
        g.children.every(c => c.codeName === '' || c.codeName === 'TSP')
      );
      expect(spaceGroup).toBeDefined();
      expect(spaceGroup.key).toHaveLength(8);
    });

    it('space group keys persist after mutation', () => {
      const builder = new BlissSVGBuilder('H//C8//B303');
      const before = builder.snapshot();
      const spaceKeys = before.children
        .filter(g => g.children.some(c => c.codeName === 'TSP' || c.codeName === ''))
        .map(g => g.key);

      builder.group(2).remove(); // remove B303
      const after = builder.snapshot();
      const spaceKeysAfter = after.children
        .filter(g => g.children.some(c => c.codeName === 'TSP' || c.codeName === ''))
        .map(g => g.key);

      // The space between H and C8 should still have its key
      expect(spaceKeysAfter).toContain(spaceKeys[0]);
    });
  });
});

// === PHASE: Unknown Codes and Warnings ===

describe('BlissSVGBuilder.Mutation.UnknownCodes', () => {
  describe('addGroup with unknown code', () => {
    it('adds the group to the tree (does not reject)', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('BADCODE');
      expect(builder.stats.groupCount).toBe(2);
    });

    it('produces an UNKNOWN_CODE warning', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('BADCODE');
      expect(builder.warnings).toEqual([
        expect.objectContaining({
          code: 'UNKNOWN_CODE',
          source: 'BADCODE',
        }),
      ]);
    });

    it('unknown group renders zero-width (no error-placeholder)', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('BADCODE');
      const snap = builder.snapshot();
      const groups = snap.children.filter(g =>
        !g.children.every(c => c.children.length === 1 && c.children[0].codeName === 'TSP')
      );
      const badGroup = groups[groups.length - 1];
      expect(badGroup.children[0].width).toBe(0);
    });

    it('toString() includes the unknown code', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('BADCODE');
      expect(builder.toString()).toBe('B291//BADCODE');
    });

    it('multiple unknown addGroup calls accumulate warnings', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('X');
      builder.addGroup('Y');
      builder.addGroup('Z');
      expect(builder.warnings).toHaveLength(3);
      expect(builder.warnings.map(w => w.source)).toEqual(['X', 'Y', 'Z']);
    });
  });

  describe('addGlyph with unknown code', () => {
    it('produces a warning and keeps existing content', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGlyph('NOPE');
      expect(builder.warnings).toHaveLength(1);
      expect(builder.warnings[0].source).toBe('NOPE');
      expect(builder.toString()).toBe('B291/NOPE');
    });
  });

  describe('addPart with unknown code', () => {
    it('produces a warning', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).addPart('NOPE');
      expect(builder.warnings).toHaveLength(1);
      expect(builder.warnings[0].source).toBe('NOPE');
    });
  });

  describe('replace with unknown code', () => {
    it('produces a warning and toString reflects the replacement', () => {
      const builder = new BlissSVGBuilder('H/C8');
      builder.glyph(0).replace('NOPE');
      expect(builder.warnings).toHaveLength(1);
      expect(builder.toString()).toBe('NOPE/C8');
    });
  });

  describe('warnings reset on each rebuild', () => {
    it('fixing an unknown code clears the warning', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.addGroup('BADCODE');
      expect(builder.warnings).toHaveLength(1);
      builder.glyph(1).replace('H');
      expect(builder.warnings).toHaveLength(0);
    });
  });

  describe('constructor and mutation produce same result for unknown codes', () => {
    it('same SVG whether unknown code comes from constructor or addGroup', () => {
      const fromConstructor = new BlissSVGBuilder('B291//BADCODE');
      const fromMutation = new BlissSVGBuilder('B291');
      fromMutation.addGroup('BADCODE');
      expect(fromMutation.svgCode).toBe(fromConstructor.svgCode);
    });

    it('same warnings whether from constructor or addGroup', () => {
      const fromConstructor = new BlissSVGBuilder('B291//BADCODE');
      const fromMutation = new BlissSVGBuilder('B291');
      fromMutation.addGroup('BADCODE');
      expect(fromMutation.warnings).toEqual(fromConstructor.warnings);
    });
  });
});

// === PHASE: toString Reflects Mutations ===

describe('BlissSVGBuilder.Mutation.ToString', () => {
  it('reflects addGroup', () => {
    const builder = new BlissSVGBuilder('H');
    builder.addGroup('C8');
    expect(builder.toString()).toBe('H//C8');
  });

  it('reflects addGlyph', () => {
    const builder = new BlissSVGBuilder('H');
    builder.addGlyph('C8');
    expect(builder.toString()).toBe('H/C8');
  });

  it('reflects addPart', () => {
    const builder = new BlissSVGBuilder('H');
    builder.glyph(0).addPart('C8');
    expect(builder.toString()).toBe('H;C8');
  });

  it('reflects remove glyph', () => {
    const builder = new BlissSVGBuilder('H/C8');
    builder.glyph(1).remove();
    expect(builder.toString()).toBe('H');
  });

  it('reflects remove group', () => {
    const builder = new BlissSVGBuilder('H//C8');
    builder.group(1).remove();
    expect(builder.toString()).toBe('H');
  });

  it('reflects replace', () => {
    const builder = new BlissSVGBuilder('H/C8');
    builder.glyph(0).replace('VL8');
    expect(builder.toString()).toBe('VL8/C8');
  });

  it('reflects insertGlyph', () => {
    const builder = new BlissSVGBuilder('H/C8');
    builder.group(0).insertGlyph(1, 'VL8');
    expect(builder.toString()).toBe('H/VL8/C8');
  });

  it('reflects insertPart', () => {
    const builder = new BlissSVGBuilder('H;C8');
    builder.glyph(0).insertPart(1, 'VL8');
    expect(builder.toString()).toBe('H;VL8;C8');
  });

  it('reflects clear', () => {
    const builder = new BlissSVGBuilder('H/C8');
    builder.clear();
    expect(builder.toString()).toBe('');
  });

  it('reflects chained mutations', () => {
    const builder = new BlissSVGBuilder('H');
    builder.addGroup('C8').addGroup('VL8');
    expect(builder.toString()).toBe('H//C8//VL8');
  });
});

// === PHASE: Negative Indexing ===

describe('BlissSVGBuilder.Mutation.NegativeIndexing', () => {
  describe('builder.group()', () => {
    it('group(-1) returns the last non-space group', () => {
      const b = new BlissSVGBuilder('H/C8//B303//B291');
      const last = b.group(-1);
      expect(last).not.toBeNull();
      expect(last.glyph(0).codeName).toBe('B291');
    });

    it('group(-2) returns the second-to-last group', () => {
      const b = new BlissSVGBuilder('H/C8//B303//B291');
      const g = b.group(-2);
      expect(g).not.toBeNull();
      expect(g.glyph(0).codeName).toBe('B303');
    });

    it('group(-99) returns null for out-of-range', () => {
      const b = new BlissSVGBuilder('H/C8');
      expect(b.group(-99)).toBeNull();
    });
  });

  describe('builder.glyph()', () => {
    it('glyph(-1) returns the last glyph across all groups', () => {
      const b = new BlissSVGBuilder('H/C8//B303');
      const last = b.glyph(-1);
      expect(last).not.toBeNull();
      expect(last.codeName).toBe('B303');
    });

    it('glyph(-2) returns the second-to-last glyph', () => {
      const b = new BlissSVGBuilder('H/C8//B303');
      const g = b.glyph(-2);
      expect(g).not.toBeNull();
      // C8 is a shape primitive (not a genuine named glyph); verify via part
      expect(g.part(0).codeName).toBe('C8');
    });
  });

  describe('builder.part()', () => {
    it('part(-1) returns the last part across all glyphs', () => {
      const b = new BlissSVGBuilder('H//B303');
      const last = b.part(-1);
      expect(last).not.toBeNull();
      expect(last.codeName).toBe('B303');
    });
  });

  describe('comprehensive glyph and part indexing', () => {
    // B303//C8/H;E:2,0
    // Group 0: [B303]: 1 glyph, 1 part
    // Group 1: [C8, H;E:2,0]: 2 glyphs, C8 has 1 part, H;E has 2 parts
    // Total: 3 glyphs, 4 parts
    it('positive and negative glyph indexing on B303//C8/H;E:2,0', () => {
      const b = new BlissSVGBuilder('B303//C8/H;E:2,0');
      expect(b.glyph(0).codeName).toBe('B303');
      expect(b.glyph(1).part(0).codeName).toBe('C8');
      // glyph(2) and glyph(-1) point to the same node
      expect(b.glyph(-1).part(0).codeName).toBe('H');
      expect(b.glyph(-1).part(-1).codeName).toBe('E');
    });

    it('flat part indexing across glyphs', () => {
      const b = new BlissSVGBuilder('B303//C8/H;E:2,0');
      expect(b.part(0).codeName).toBe('B303');
      expect(b.part(1).codeName).toBe('C8');
      expect(b.part(2).codeName).toBe('H');
      expect(b.part(3).codeName).toBe('E');
      expect(b.part(-1).codeName).toBe('E');
    });
  });

  describe('handle.glyph()', () => {
    it('group.glyph(-1) returns the last glyph in the group', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      const last = b.group(0).glyph(-1);
      expect(last).not.toBeNull();
      expect(last.codeName).toBe('B303');
    });
  });

  describe('handle.part()', () => {
    it('glyph.part(-1) returns the last part of the glyph', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const last = b.glyph(0).part(-1);
      expect(last).not.toBeNull();
      expect(last.codeName).toBe('B86');
    });
  });
});

// === PHASE: Negative Indexing for Insert ===

describe('BlissSVGBuilder.Mutation.NegativeInsert', () => {
  it('insertGlyph(-1) inserts before the last glyph', () => {
    const b = new BlissSVGBuilder('H/C8/B303');
    b.group(0).insertGlyph(-1, 'B291');
    const json = b.toJSON();
    const codes = json.groups[0].glyphs.map(g => g.glyphCode || g.parts?.[0]?.codeName);
    expect(codes).toEqual(['H', 'C8', 'B291', 'B303']);
  });

  it('insertPart(-1) inserts before the last part', () => {
    const b = new BlissSVGBuilder('B291;B86');
    b.glyph(0).insertPart(-1, 'B97');
    const parts = b.toJSON().groups[0].glyphs[0].parts;
    const codes = parts.map(p => p.codeName);
    expect(codes[1]).toBe('B97');
    expect(codes[2]).toBe('B86');
  });
});

// === PHASE: builder.addPart() ===

describe('BlissSVGBuilder.Mutation.BuilderAddPart', () => {
  it('adds a part to the last group\'s last glyph', () => {
    const b = new BlissSVGBuilder('B291');
    b.addPart('B86');
    const parts = b.toJSON().groups[0].glyphs[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[1].codeName).toBe('B86');
  });

  it('creates a group when builder is empty', () => {
    const b = new BlissSVGBuilder();
    b.addPart('H');
    expect(b.stats.groupCount).toBe(1);
    expect(b.stats.glyphCount).toBe(1);
  });

  it('targets the last group when multiple exist', () => {
    const b = new BlissSVGBuilder('H//B291');
    b.addPart('B86');
    const json = b.toJSON();
    const lastGroup = json.groups.filter(g =>
      !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
    ).pop();
    const lastGlyph = lastGroup.glyphs[lastGroup.glyphs.length - 1];
    expect(lastGlyph.parts.some(p => p.codeName === 'B86')).toBe(true);
  });

  it('accepts opts as { defaults, overrides }', () => {
    const b = new BlissSVGBuilder('B291');
    b.addPart('B86', { overrides: { color: 'red' } });
    const parts = b.toJSON().groups[0].glyphs[0].parts;
    expect(parts[1].options?.color).toBe('red');
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('B291');
    const result = b.addPart('B86');
    expect(result).toBe(b);
  });
});

// === PHASE: Parent-centric remove ===

describe('BlissSVGBuilder.Mutation.ParentCentricRemove', () => {
  describe('group.removeGlyph()', () => {
    it('removes glyph at the given index', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      b.group(0).removeGlyph(1); // remove C8
      const codes = b.toJSON().groups[0].glyphs.map(g => g.glyphCode || g.parts?.[0]?.codeName);
      expect(codes).toEqual(['H', 'B303']);
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      b.group(0).removeGlyph(-1); // remove B303
      const codes = b.toJSON().groups[0].glyphs.map(g => g.glyphCode || g.parts?.[0]?.codeName);
      expect(codes).toEqual(['H', 'C8']);
    });

    it('cascades: removing last glyph removes the group', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.group(1).removeGlyph(0);
      expect(b.stats.groupCount).toBe(1);
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      const group = b.group(0);
      expect(group.removeGlyph(0)).toBe(group);
    });

    it('is a no-op for out-of-range index', () => {
      const b = new BlissSVGBuilder('H/C8');
      const before = b.toString();
      b.group(0).removeGlyph(99);
      expect(b.toString()).toBe(before);
    });

    it('is a no-op when called on non-group handle', () => {
      const b = new BlissSVGBuilder('H/C8');
      const glyph = b.glyph(0);
      expect(glyph.removeGlyph).toBeDefined();
      expect(glyph.removeGlyph(0)).toBe(glyph);
    });
  });

  describe('glyph.removePart()', () => {
    it('removes part at the given index', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.glyph(0).removePart(1); // remove B86
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts.map(p => p.codeName)).toEqual(['B291', 'B97']);
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.glyph(0).removePart(-1); // remove B97
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts.map(p => p.codeName)).toEqual(['B291', 'B86']);
    });

    it('cascades: removing last part removes the glyph', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.glyph(0).removePart(0); // remove H's only part
      expect(b.stats.glyphCount).toBe(1);
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      const glyph = b.glyph(0);
      expect(glyph.removePart(0)).toBe(glyph);
    });

    it('is a no-op for out-of-range index', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const before = b.toString();
      b.glyph(0).removePart(99);
      expect(b.toString()).toBe(before);
    });

    it('is a no-op when called on non-glyph handle', () => {
      const b = new BlissSVGBuilder('H/C8');
      const group = b.group(0);
      expect(group.removePart(0)).toBe(group);
    });

    it('cascades through glyph to group removal', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.glyph(1).removePart(0); // remove C8's only part
      expect(b.stats.groupCount).toBe(1);
      expect(b.stats.glyphCount).toBe(1);
    });
  });
});

// === PHASE 7: Builder-level removeGroup/replaceGroup ===

describe('BlissSVGBuilder.Mutation.BuilderRemoveReplace', () => {
  describe('builder.removeGroup()', () => {
    it('removes the group at the given semantic index', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      b.removeGroup(1); // remove B303
      expect(b.stats.groupCount).toBe(2);
      expect(b.group(0).glyph(0).part(0).codeName).toBe('H');
      expect(b.group(1).glyph(0).codeName).toBe('B291');
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      b.removeGroup(-1); // remove B291
      expect(b.stats.groupCount).toBe(2);
      expect(b.group(-1).glyph(0).codeName).toBe('B303');
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H//B303');
      expect(b.removeGroup(0)).toBe(b);
    });

    it('is a no-op for out-of-range index', () => {
      const b = new BlissSVGBuilder('H');
      const before = b.toString();
      b.removeGroup(5);
      expect(b.toString()).toBe(before);
    });
  });

  describe('builder.replaceGroup()', () => {
    it('replaces the group at the given semantic index', () => {
      const b = new BlissSVGBuilder('H//B303//B291');
      b.replaceGroup(1, 'C8/B291');
      expect(b.stats.groupCount).toBe(3);
      expect(b.group(1).glyph(0).part(0).codeName).toBe('C8');
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.replaceGroup(-1, 'B291');
      expect(b.group(-1).glyph(0).codeName).toBe('B291');
    });

    it('accepts opts', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.replaceGroup(0, 'C8', { overrides: { color: 'red' } });
      const json = b.toJSON();
      const firstGroup = json.groups.find(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(firstGroup.options?.color).toBe('red');
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H//B303');
      expect(b.replaceGroup(0, 'C8')).toBe(b);
    });
  });
});

// === PHASE 8: Parent-centric replaceGlyph/replacePart ===

describe('BlissSVGBuilder.Mutation.ParentCentricReplace', () => {
  describe('group.replaceGlyph()', () => {
    it('replaces glyph at the given index', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      b.group(0).replaceGlyph(1, 'B291'); // replace C8 with B291
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].codeName).toBe('B291');
      expect(glyphs[2].codeName).toBe('B303');
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('H/C8/B303');
      b.group(0).replaceGlyph(-1, 'B291'); // replace B303
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[1].parts[0].codeName).toBe('C8');
      expect(glyphs[2].codeName).toBe('B291');
    });

    it('accepts opts', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).replaceGlyph(0, 'B291', { overrides: { color: 'red' } });
      const glyph = b.toJSON().groups[0].glyphs[0];
      expect(glyph.options?.color).toBe('red');
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('H/C8');
      const group = b.group(0);
      expect(group.replaceGlyph(0, 'B291')).toBe(group);
    });

    it('is a no-op for out-of-range index', () => {
      const b = new BlissSVGBuilder('H/C8');
      const before = b.toString();
      b.group(0).replaceGlyph(99, 'B291');
      expect(b.toString()).toBe(before);
    });

    it('is a no-op when called on non-group handle', () => {
      const b = new BlissSVGBuilder('H/C8');
      const glyph = b.glyph(0);
      expect(glyph.replaceGlyph(0, 'B291')).toBe(glyph);
    });
  });

  describe('glyph.replacePart()', () => {
    it('replaces part at the given index', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.glyph(0).replacePart(1, 'B81'); // replace B86 with B81
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[1].codeName).toBe('B81');
    });

    it('supports negative indexing', () => {
      const b = new BlissSVGBuilder('B291;B86;B97');
      b.glyph(0).replacePart(-1, 'B81'); // replace B97
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[parts.length - 1].codeName).toBe('B81');
    });

    it('accepts opts', () => {
      const b = new BlissSVGBuilder('B291;B86');
      b.glyph(0).replacePart(0, 'B303', { overrides: { color: 'red' } });
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[0].options?.color).toBe('red');
    });

    it('returns this for chaining', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.glyph(0);
      expect(glyph.replacePart(0, 'B303')).toBe(glyph);
    });

    it('is a no-op for out-of-range index', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const before = b.toString();
      b.glyph(0).replacePart(99, 'B303');
      expect(b.toString()).toBe(before);
    });

    it('is a no-op when called on non-glyph handle', () => {
      const b = new BlissSVGBuilder('H/C8');
      const group = b.group(0);
      expect(group.replacePart(0, 'B303')).toBe(group);
    });
  });
});

// === PHASE 9: setOptions({ defaults, overrides }) ===

describe('BlissSVGBuilder.Mutation.SetOptionsFormat', () => {
  it('overrides win over existing options', () => {
    const b = new BlissSVGBuilder('[color=red]H');
    b.glyph(0).setOptions({ overrides: { color: 'blue' } });
    const opts = b.toJSON().groups[0].glyphs[0].options;
    expect(opts.color).toBe('blue');
  });

  it('defaults do not override existing options', () => {
    const b = new BlissSVGBuilder('[color=red]H');
    b.glyph(0).setOptions({ defaults: { color: 'blue' } });
    const opts = b.toJSON().groups[0].glyphs[0].options;
    expect(opts.color).toBe('red');
  });

  it('defaults apply when option is not already set', () => {
    const b = new BlissSVGBuilder('H');
    b.glyph(0).setOptions({ defaults: { color: 'blue' } });
    const opts = b.toJSON().groups[0].glyphs[0].options;
    expect(opts.color).toBe('blue');
  });

  it('both defaults and overrides can be used together', () => {
    const b = new BlissSVGBuilder('[color=red]H');
    b.glyph(0).setOptions({
      defaults: { 'stroke-width': '0.5' },
      overrides: { color: 'green' }
    });
    const opts = b.toJSON().groups[0].glyphs[0].options;
    expect(opts.color).toBe('green');
    expect(opts['stroke-width']).toBe('0.5');
  });

  it('returns this for chaining', () => {
    const b = new BlissSVGBuilder('H');
    const glyph = b.glyph(0);
    expect(glyph.setOptions({ overrides: { color: 'red' } })).toBe(glyph);
  });
});

// === PHASE 10: Flat options accepted as overrides ===

describe('BlissSVGBuilder.Mutation.FlatOptions', () => {
  describe('setOptions() accepts flat format', () => {
    it('flat options are treated as overrides', () => {
      const b = new BlissSVGBuilder('H');
      b.glyph(0).setOptions({ color: 'red' });
      const opts = b.toJSON().groups[0].glyphs[0].options;
      expect(opts.color).toBe('red');
    });

    it('flat options override existing options', () => {
      const b = new BlissSVGBuilder('[color=red]H');
      b.glyph(0).setOptions({ color: 'blue' });
      const opts = b.toJSON().groups[0].glyphs[0].options;
      expect(opts.color).toBe('blue');
    });

    it('structured format still works alongside flat', () => {
      const b = new BlissSVGBuilder('[color=red]H');
      b.glyph(0).setOptions({ defaults: { 'stroke-width': '0.5' } });
      const opts = b.toJSON().groups[0].glyphs[0].options;
      expect(opts.color).toBe('red');
      expect(opts['stroke-width']).toBe('0.5');
    });
  });

  describe('addGlyph() accepts flat opts', () => {
    it('flat options applied as overrides', () => {
      const b = new BlissSVGBuilder('H');
      b.group(0).addGlyph('B291', { color: 'red' });
      const glyph = b.toJSON().groups[0].glyphs[1];
      expect(glyph.options?.color).toBe('red');
    });
  });

  describe('replace() accepts flat opts', () => {
    it('flat options applied as overrides', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.glyph(0).replace('B291', { color: 'red' });
      const glyph = b.toJSON().groups[0].glyphs[0];
      expect(glyph.options?.color).toBe('red');
    });
  });

  describe('constructor accepts flat opts', () => {
    it('flat options applied as overrides', () => {
      const b = new BlissSVGBuilder('[color=red]H', { color: 'blue' });
      const opts = b.toJSON().options;
      expect(opts.color).toBe('blue');
    });
  });

  describe('insertGroup() accepts flat opts', () => {
    it('flat options applied as overrides', () => {
      const b = new BlissSVGBuilder('H');
      b.insertGroup(1, 'B291', { color: 'red' });
      const json = b.toJSON();
      const groups = json.groups.filter(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(groups[1].options?.color).toBe('red');
    });
  });

  describe('replaceGroup() accepts flat opts', () => {
    it('flat options applied as overrides', () => {
      const b = new BlissSVGBuilder('H//B303');
      b.replaceGroup(0, 'B291', { color: 'red' });
      const json = b.toJSON();
      const firstGroup = json.groups.find(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(firstGroup.options?.color).toBe('red');
    });
  });
});

// === PHASE 11: Head glyph detection for top-level words ===

describe('BlissSVGBuilder.HeadGlyphDetection', () => {
  describe('top-level words (/ split, not from definitions)', () => {
    it('B368 (quantifier) is excluded; glyph 1 is head', () => {
      const b = new BlissSVGBuilder('B368/B428;B81;B97/B232');
      const glyphs = b.elements.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[0].isHeadGlyph).toBe(false);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('single excluded prefix is skipped', () => {
      const b = new BlissSVGBuilder('B486/B291');
      const glyphs = b.elements.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[0].isHeadGlyph).toBe(false);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('non-excluded first glyph remains head (default)', () => {
      const b = new BlissSVGBuilder('B291/B303');
      const glyphs = b.elements.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[0].isHeadGlyph).toBe(true);
    });

    it('explicit ^ marker still takes priority', () => {
      const b = new BlissSVGBuilder('B368/B428^/B232');
      const glyphs = b.elements.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });

    it('multiple excluded prefixes are all skipped', () => {
      const b = new BlissSVGBuilder('B486/B368/B291');
      const glyphs = b.elements.children[0].children.filter(c => c.isGlyph);
      expect(glyphs[2].isHeadGlyph).toBe(true);
    });
  });

});
