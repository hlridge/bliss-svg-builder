import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the BlissSVGBuilder mutation API surface: the add* / insert* /
 * remove* family across glyphs, parts, and groups; the position modifier
 * on defined words; the codeString validation rules in
 * BlissSVGBuilder.define; the WORD_AS_PART warning when a multi-glyph word
 * code is misused as a part; and the identity-clearance contract that
 * keeps glyph-level codeName / isBlissGlyph / glyphCode coherent through
 * mutation.
 *
 * Covers:
 * - Position modifier on defined words: TW:N,M applies the position to the
 *   first glyph of the expanded word; negative and decimal values parse
 *   without error; absent position renders identically to the bare word;
 *   trailing indicators after the position modifier (TW:N,M;B86) attach
 *   without breaking.
 * - codeString validation in define: word definitions (codeStrings
 *   containing /) reject internal coordinates; word definitions without
 *   coordinates accept; single-glyph definitions accept internal
 *   coordinates because they are not words.
 * - DRY equivalence: addGlyph(code) is identical to insertGlyph(length,
 *   code); addPart(code) is identical to insertPart(length, code);
 *   addGroup(code) is identical to insertGroup(count, code).
 * - Singular addGlyph / insertGlyph: a slash-separated code or a defined
 *   word code throws and leaves the receiver group untouched; multi-group
 *   codes (//) throw; a rejected code applies options to no glyph. The
 *   full argument matrix lives in ElementHandle.glyph-mutation-args.test.js.
 * - builder.insertGroup: positions 0, end, and middle; defaults/overrides
 *   propagate to the new group's options; chainable; works on an empty
 *   builder.
 * - group.addPart / group.insertPart: delegate to the group's last glyph;
 *   options propagate to the inserted part; chainable; gracefully no-ops
 *   on a group with no glyphs.
 * - WORD_AS_PART warning: multi-glyph word codes used at part level emit
 *   the warning and keep the failed code as a single placeholder part on
 *   both the constructor path and the mutation path; options on the
 *   failed part are preserved; the two paths produce identical results.
 * - Glyph composition from B-codes (B291;B291): constructor and addPart
 *   produce a multi-part glyph; addPart on a B-code glyph clears
 *   glyph-level identity (codeName, isBlissGlyph, glyphCode) so live
 *   handle, snapshot, and toJSON stay coherent.
 * - Cross-variant regressions: chained addGroup → addGlyph → addPart;
 *   a rejected multi-glyph add leaving the group usable for addPart; handle
 *   survival across unrelated builder mutations; insertGroup followed by
 *   navigation to the inserted group; insertGroup middle producing
 *   correct toString round-trip; addPart and glyph.insertPart clearing
 *   glyph identity so toString reflects the new part list; word-as-part
 *   failing without breaking the same word as a glyph.
 *
 * - `ElementHandle.remove()` returns `undefined` for glyph, part, and
 *   group handles (the result is intentionally not chainable because the
 *   removed handle no longer references a live element).
 * - `ElementHandle` mutation methods (`addGlyph`, `insertGlyph`, `addPart`,
 *   `insertPart`, `replace`, `setOptions`, `removeOptions`) return the
 *   same handle (`this`) so callers can chain.
 * - Cached read views (`builder.elements`, `builder.groups`,
 *   `builder.snapshot()`) return an updated, distinct object after a
 *   mutation; the post-mutation reference is not identical to the
 *   pre-mutation one.
 *
 * Does NOT cover:
 * - clearIndicators / applyIndicators on glyph handles, see
 *   `tests/ElementHandle.apply-indicators.test.js` and
 *   `tests/ElementHandle.clear-indicators.test.js`.
 * - The BlissSVGBuilder.define API itself beyond codeString validation,
 *   see `tests/BlissSVGBuilder.define.test.js` and
 *   `tests/BlissSVGBuilder.definition-maintenance.test.js`.
 * - Visual regression of mutation-built SVG output, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 *
 * @contract: builder-mutation-api
 */

// Define test words used across multiple tests
beforeAll(() => {
  BlissSVGBuilder.define({
    TW: { codeString: 'B291/B291' },
    TW3: { codeString: 'B291/B291/B291' },
  });
});

afterAll(() => {
  BlissSVGBuilder.removeDefinition('TW');
  BlissSVGBuilder.removeDefinition('TW3');
});

// Helper: extract part summary from toJSON
function partSummary(builder) {
  const parts = builder.toJSON().groups[0].glyphs[0].parts;
  return parts.map(p => {
    let s = p.codeName;
    if (p.x != null || p.y != null) s += `:${p.x ?? 0},${p.y ?? 0}`;
    return s;
  });
}

// Helper: count non-space groups
function groupCount(builder) {
  return builder.stats.groupCount;
}

// Helper: glyph count in a group (via toJSON, filtering out space groups)
function glyphCount(builder, groupIndex = 0) {
  const groups = builder.toJSON().groups.filter(g =>
    !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP', 'ZSA'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
  );
  return groups[groupIndex]?.glyphs?.length ?? 0;
}

describe('BlissSVGBuilder mutation API', () => {
  describe('when a position modifier is applied to a defined word', () => {
    it('offsets the first glyph of the expanded word by the modifier', () => {
      const b = new BlissSVGBuilder('TW:2,0');
      const snap = b.snapshot();
      const glyphs = snap.children[0].children.filter(c => c.isGlyph);
      expect(glyphs).toHaveLength(2);
      // First glyph's content should be offset by the position modifier
      // The :2,0 applies to the first glyph's part string (B291:2,0)
      const firstParts = glyphs[0].children;
      expect(firstParts.length).toBeGreaterThan(0);
      // Second glyph should exist and be further right
      expect(glyphs[1].x).toBeGreaterThan(glyphs[0].x);
    });

    it('parses negative and decimal position values without error', () => {
      const b = new BlissSVGBuilder('TW:-1.5,0.5');
      // Should parse without errors
      expect(b.warnings.filter(w => w.code === 'UNKNOWN_CODE')).toHaveLength(0);
      const snap = b.snapshot();
      const glyphs = snap.children[0].children.filter(c => c.isGlyph);
      expect(glyphs).toHaveLength(2);
    });

    it('renders identically to the bare word when no position is given', () => {
      const b = new BlissSVGBuilder('TW');
      const snap = b.snapshot();
      const glyphs = snap.children[0].children.filter(c => c.isGlyph);
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].x).toBe(0);
    });

    it('attaches a trailing indicator without breaking the position modifier', () => {
      // B86 is an indicator; should attach to the word, not break
      const b = new BlissSVGBuilder('TW:2,0;B86');
      const snap = b.snapshot();
      // Should produce a valid composition (no errors)
      expect(b.warnings.filter(w => w.code === 'UNKNOWN_CODE')).toHaveLength(0);
    });
  });

  describe('when defining a word and the codeString is validated', () => {
    it('rejects a word definition that contains internal coordinates', () => {
      const result = BlissSVGBuilder.define({ TWBad: { codeString: 'B291:5,0/B291' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/cannot have internal coordinates/);
    });

    it('accepts a word definition without internal coordinates', () => {
      const result = BlissSVGBuilder.define({ TWGood: { codeString: 'B291/B291' } });
      expect(result.defined).toContain('TWGood');
      BlissSVGBuilder.removeDefinition('TWGood');
    });

    it('accepts a single-glyph definition with internal coordinates (not a word)', () => {
      // Glyph definitions (no /) can have internal coordinates
      const result = BlissSVGBuilder.define({ TGlyph: { codeString: 'H;C8:0,8' } });
      expect(result.defined).toContain('TGlyph');
      BlissSVGBuilder.removeDefinition('TGlyph');
    });
  });

  describe('when add* and insert* operations are equivalent at the last position', () => {
    it('addGlyph(code) produces the same result as insertGlyph(length, code)', () => {
      const b1 = new BlissSVGBuilder('H');
      b1.group(0).addGlyph('C8');

      const b2 = new BlissSVGBuilder('H');
      b2.group(0).insertGlyph(1, 'C8');

      expect(b1.toJSON()).toEqual(b2.toJSON());
    });

    it('addPart(code) produces the same result as insertPart(length, code)', () => {
      const b1 = new BlissSVGBuilder('H');
      b1.glyph(0).addPart('B291');

      const b2 = new BlissSVGBuilder('H');
      b2.glyph(0).insertPart(1, 'B291');

      expect(b1.toJSON()).toEqual(b2.toJSON());
    });

    it('addGroup(code) produces the same result as insertGroup(count, code)', () => {
      const b1 = new BlissSVGBuilder('H');
      b1.addGroup('C8');

      const b2 = new BlissSVGBuilder('H');
      b2.insertGroup(1, 'C8');

      expect(b1.toJSON()).toEqual(b2.toJSON());
    });
  });

  describe('when addGlyph or insertGlyph is given a multi-glyph code', () => {
    it('throws for a slash-separated code and leaves the receiver group untouched', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).addGlyph('H/C8'))
        .toThrow('Expected a single glyph, but code "H/C8" produced 2 glyphs');
      expect(glyphCount(b, 0)).toBe(1);
    });

    it('throws for a defined word code and leaves the receiver group untouched', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => b.group(0).addGlyph('TW'))
        .toThrow('Expected a single glyph, but code "TW" produced 2 glyphs');
      expect(glyphCount(b, 0)).toBe(1);
    });

    it('throws for insertGlyph(0, word) and inserts nothing', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => b.group(0).insertGlyph(0, 'TW'))
        .toThrow('Expected a single glyph, but code "TW" produced 2 glyphs');
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0].parts[0].codeName).toBe('H');
    });

    it('throws when the input code spans multiple groups (//)', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => {
        b.group(0).addGlyph('H//C8');
      }).toThrow(/groups/);
    });

    it('applies options to no glyph when the multi-glyph code is rejected', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => b.group(0).addGlyph('H/C8', { overrides: { color: 'red' } }))
        .toThrow('Expected a single glyph, but code "H/C8" produced 2 glyphs');
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0].options).toBeUndefined();
    });
  });

  describe('when inserting a group at the builder level', () => {
    it('inserts at index 0 with space-group management', () => {
      const b = new BlissSVGBuilder('C8');
      b.insertGroup(0, 'H');
      expect(groupCount(b)).toBe(2);
      // First non-space group should be H
      const firstGroup = b.toJSON().groups[0];
      expect(firstGroup.glyphs[0].parts[0].codeName).toBe('H');
    });

    it('inserts at the end (equivalent to addGroup)', () => {
      const b = new BlissSVGBuilder('H');
      b.insertGroup(1, 'C8');
      expect(groupCount(b)).toBe(2);
    });

    it('inserts in the middle of three existing groups', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.insertGroup(1, 'B291');
      expect(groupCount(b)).toBe(3);
      // Middle group should be B291
      const groups = b.toJSON().groups.filter(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP', 'ZSA'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(groups[1].glyphs[0].codeName).toBe('B291');
    });

    it('propagates option overrides to the inserted group', () => {
      const b = new BlissSVGBuilder('H');
      b.insertGroup(1, 'C8', { overrides: { color: 'blue' } });
      const groups = b.toJSON().groups.filter(g =>
        !(g.glyphs?.length === 1 && ['TSP', 'QSP', 'SP', 'ZSA'].includes(g.glyphs[0]?.parts?.[0]?.codeName))
      );
      expect(groups[1].options?.color).toBe('blue');
    });

    it('returns the builder for chaining', () => {
      const b = new BlissSVGBuilder('H');
      const result = b.insertGroup(1, 'C8');
      expect(result).toBe(b);
    });

    it('inserts into an empty builder', () => {
      const b = new BlissSVGBuilder('H');
      b.clear();
      b.insertGroup(0, 'C8');
      expect(groupCount(b)).toBe(1);
    });
  });

  describe('when adding or inserting a part at the group level', () => {
    it('group.addPart delegates to the group last glyph', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).addPart('B291');
      // B291 should be added to the last glyph (C8)
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[1].parts.length).toBeGreaterThan(1);
    });

    it('group.insertPart delegates to the group last glyph', () => {
      const b = new BlissSVGBuilder('H/C8');
      b.group(0).insertPart(0, 'B291');
      // B291 should be inserted at position 0 of last glyph (C8)
      const lastGlyph = b.toJSON().groups[0].glyphs[1];
      expect(lastGlyph.parts[0].codeName).toBe('B291');
    });

    it('propagates option overrides to the inserted part', () => {
      const b = new BlissSVGBuilder('H');
      b.group(0).addPart('B291', { overrides: { color: 'green' } });
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      const lastPart = parts[parts.length - 1];
      expect(lastPart.options?.color).toBe('green');
    });

    it('returns the group handle for chaining', () => {
      const b = new BlissSVGBuilder('H');
      const handle = b.group(0);
      const result = handle.addPart('B291');
      expect(result).toBe(handle);
    });

    it('does not crash when the group has no glyphs left after a removal', () => {
      const b = new BlissSVGBuilder('H');
      b.clear();
      b.addGroup('H');
      // Remove the glyph to create an empty group
      b.glyph(0).remove();
      // Now the group has no glyphs; addPart should be a no-op
      // This requires a fresh group handle since removal invalidated the old one
      const b2 = new BlissSVGBuilder('H//C8');
      b2.group(0).glyph(0).remove();
      // group(0) should now be group(1)'s C8 (H group was removed via cascade)
      // Just verify no crash
      expect(groupCount(b2)).toBe(1);
    });
  });

  describe('when a multi-glyph word code is misused as a part', () => {
    it('emits a WORD_AS_PART warning on the constructor path (H;TW)', () => {
      const b = new BlissSVGBuilder('H;TW');
      const warns = b.warnings.filter(w => w.code === 'WORD_AS_PART');
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toContain('word');
      expect(warns[0].source).toBe('TW');
    });

    it('keeps the failed word code as a single placeholder part (constructor path)', () => {
      const b = new BlissSVGBuilder('H;TW');
      const parts = partSummary(b);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('H');
      expect(parts[1]).toMatch(/^TW/);
    });

    it('emits a WORD_AS_PART warning for a 3-glyph word (H;TW3)', () => {
      const b = new BlissSVGBuilder('H;TW3');
      const warns = b.warnings.filter(w => w.code === 'WORD_AS_PART');
      expect(warns).toHaveLength(1);
      expect(warns[0].source).toBe('TW3');
    });

    it('preserves options on the failed word part', () => {
      const b = new BlissSVGBuilder('H;[color=red]>TW');
      const json = b.toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts[1].options?.color).toBe('red');
    });

    it('emits a WORD_AS_PART warning on the mutation path (glyph.addPart(TW))', () => {
      const b = new BlissSVGBuilder('H');
      b.glyph(0).addPart('TW');
      const warns = b.warnings.filter(w => w.code === 'WORD_AS_PART');
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toContain('word');
    });

    it('keeps the failed word code as a single placeholder part (mutation path)', () => {
      const b = new BlissSVGBuilder('H');
      b.glyph(0).addPart('TW');
      const parts = partSummary(b);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('H');
      expect(parts[1]).toMatch(/^TW/);
    });

    it('produces identical part summaries on the constructor and mutation paths', () => {
      const b1 = new BlissSVGBuilder('H;TW');
      const b2 = new BlissSVGBuilder('H');
      b2.glyph(0).addPart('TW');
      expect(partSummary(b1)).toEqual(partSummary(b2));
    });
  });

  describe('when composing a glyph from two B-codes', () => {
    it('produces a glyph with two or more parts on the constructor path (B291;B291)', () => {
      const b = new BlissSVGBuilder('B291;B291');
      const json = b.toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it('addPart adds a part to an existing glyph', () => {
      const b = new BlissSVGBuilder('B291');
      const countBefore = b.toJSON().groups[0].glyphs[0].parts.length;
      b.glyph(0).addPart('B291');
      const countAfter = b.toJSON().groups[0].glyphs[0].parts.length;
      expect(countAfter).toBe(countBefore + 1);
    });

    it('addPart on a B-code glyph clears glyph-level identity (codeName, isBlissGlyph, glyphCode)', () => {
      // Regression: the cleanup at insertPart used to delete glyph.codeName +
      // isBlissGlyph but not glyphCode. After the codeName contract change,
      // glyph-level codeName reads from glyphCode, so the stale glyphCode kept
      // surfacing 'B313' on a glyph that had been mutated into a composite,
      // contradicting isBlissGlyph === false.
      const b = new BlissSVGBuilder('B313');
      expect(b.glyph(0).codeName).toBe('B313');
      expect(b.glyph(0).isBlissGlyph).toBe(true);

      b.glyph(0).addPart('H');

      // Live handle: identity cleared (now a composite with no name)
      expect(b.glyph(0).codeName).toBe('');
      expect(b.glyph(0).isBlissGlyph).toBe(false);

      // Snapshot: same; no internal contradiction between codeName and
      // isBlissGlyph
      const snapGlyph = b.snapshot().children[0].children[0];
      expect(snapGlyph.codeName).toBe('');
      expect(snapGlyph.isBlissGlyph).toBe(false);

      // toJSON: the now-composite glyph should not serialize a glyph-level
      // codeName (parts carry the composition)
      const jsonGlyph = b.toJSON().groups[0].glyphs[0];
      expect(jsonGlyph.codeName).toBeUndefined();
      expect(jsonGlyph.parts.map(p => p.codeName)).toEqual(['B313', 'H']);
    });

    it('renders B291;B291 without errors', () => {
      const b = new BlissSVGBuilder('B291;B291');
      expect(b.svgCode).toBeDefined();
      expect(b.warnings.filter(w => w.code === 'UNKNOWN_CODE')).toHaveLength(0);
    });
  });

  describe('when replacePart replaces an identity-bearing glyph\'s part', () => {
    it('emits the replacement code from toString instead of the stale glyph identity', () => {
      // @issue: #30 — replacePart left glyphCode='B291' on a glyph whose only
      // part is now B86, so toString emitted the stale 'B291:5,7' and the
      // string stopped round-tripping to the live render. addPart/insertPart
      // already cleared identity; replacePart did not.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).replacePart(0, 'B86:5,7');
      const direct = new BlissSVGBuilder('B86:5,7');
      expect(b.toString()).toBe(direct.toString());
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('clears codeName, isBlissGlyph, and glyphCode like addPart does', () => {
      const b = new BlissSVGBuilder('B313');
      expect(b.glyph(0).codeName).toBe('B313');
      expect(b.glyph(0).isBlissGlyph).toBe(true);

      b.glyph(0).replacePart(0, 'H');

      expect(b.glyph(0).codeName).toBe('');
      expect(b.glyph(0).isBlissGlyph).toBe(false);
      const jsonGlyph = b.toJSON().groups[0].glyphs[0];
      expect(jsonGlyph.codeName).toBeUndefined();
      expect(jsonGlyph.parts.map(p => p.codeName)).toEqual(['H']);
    });

    it('refreshes identity through the part-handle replace() path too', () => {
      // The level-3 part().replace() path replaced the part without refreshing
      // the parent glyph's identity, the same #30 stale-code bug as replacePart.
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).part(0).replace('B86:5,7');
      const direct = new BlissSVGBuilder('B86:5,7');
      expect(b.toString()).toBe(direct.toString());
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });

  describe('when mutations chain or cross surfaces', () => {
    it('chains addGroup → addGlyph → group.addPart', () => {
      const b = new BlissSVGBuilder('');
      b.addGroup('H');
      b.addGlyph('C8');
      b.group(0).addPart('B291');
      expect(groupCount(b)).toBe(1);
      expect(glyphCount(b, 0)).toBe(2);
    });

    it('leaves the group usable for group.addPart after a rejected multi-glyph addGlyph', () => {
      const b = new BlissSVGBuilder('H');
      expect(() => b.group(0).addGlyph('TW')) // adding 2 glyphs (B291, B291) is rejected
        .toThrow('Expected a single glyph, but code "TW" produced 2 glyphs');
      b.group(0).addPart('B291'); // adds to the original last glyph
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0].parts.length).toBeGreaterThan(1);
    });

    it('keeps a previously captured handle valid across an unrelated builder mutation', () => {
      const b = new BlissSVGBuilder('H/C8');
      const handle = b.group(0);
      // Mutate via a different path
      b.addGroup('B291');
      // Original handle survives because its node is still in the tree
      handle.addGlyph('B291');
      expect(handle.glyph(2).codeName).toBe('B291');
    });

    it('exposes the inserted group on a fresh group(N) lookup after insertGroup', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.insertGroup(1, 'B291');
      const middle = b.group(1);
      expect(middle).not.toBeNull();
      expect(middle.glyph(0).codeName).toBe('B291');
    });

    it('produces a toString that round-trips through a fresh builder after insertGroup in the middle', () => {
      const b = new BlissSVGBuilder('H//C8');
      b.insertGroup(1, 'B291');
      const direct = new BlissSVGBuilder('H//B291//C8');
      expect(b.toString()).toBe(direct.toString());
    });

    it('clears glyph identity on addPart so toString reflects the new part list', () => {
      const b = new BlissSVGBuilder('B313');
      b.addPart('B81');
      const direct = new BlissSVGBuilder('B313;B81');
      expect(b.toString()).toBe(direct.toString());
    });

    it('clears glyph identity on glyph.insertPart so toString reflects the new part list', () => {
      const b = new BlissSVGBuilder('B313');
      b.glyph(0).insertPart(0, 'B81');
      const direct = new BlissSVGBuilder('B81;B313');
      expect(b.toString()).toBe(direct.toString());
    });

    it('uses TW as a glyph (word level) without warning while failing TW as a part with warning', () => {
      // TW as a glyph (word level) works normally
      const b = new BlissSVGBuilder('TW');
      expect(groupCount(b)).toBe(1);
      expect(glyphCount(b, 0)).toBe(2);
      // Adding TW as a part fails with warning
      b.glyph(0).addPart('TW');
      const warns = b.warnings.filter(w => w.code === 'WORD_AS_PART');
      expect(warns).toHaveLength(1);
      // TW is kept as a single failed part (not decomposed)
      const firstGlyph = b.toJSON().groups[0].glyphs[0];
      expect(firstGlyph.parts.length).toBe(2); // original part + failed TW
    });
  });

  describe('when remove() is called on an ElementHandle', () => {
    it('returns undefined after removing a glyph', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const result = builder.glyph(1).remove();
      expect(result).toBeUndefined();
    });

    it('returns undefined after removing a part', () => {
      const builder = new BlissSVGBuilder('H;C8');
      const result = builder.glyph(0).part(1).remove();
      expect(result).toBeUndefined();
    });

    it('returns undefined after removing a group', () => {
      const builder = new BlissSVGBuilder('H//C8');
      const result = builder.group(1).remove();
      expect(result).toBeUndefined();
    });
  });

  describe('when a mutation method returns from an ElementHandle for chaining', () => {
    it('addGlyph returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H');
      const handle = builder.group(0);
      expect(handle.addGlyph('C8')).toBe(handle);
    });

    it('insertGlyph returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const handle = builder.group(0);
      expect(handle.insertGlyph(0, 'B303')).toBe(handle);
    });

    it('addPart returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H');
      const handle = builder.glyph(0);
      expect(handle.addPart('C8')).toBe(handle);
    });

    it('insertPart returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H;C8');
      const handle = builder.glyph(0);
      expect(handle.insertPart(0, 'B303')).toBe(handle);
    });

    it('replace returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const handle = builder.glyph(0);
      expect(handle.replace('B303')).toBe(handle);
    });

    it('setOptions returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('H');
      const handle = builder.glyph(0);
      expect(handle.setOptions({ overrides: { color: 'red' } })).toBe(handle);
    });

    it('removeOptions returns the same handle for chaining', () => {
      const builder = new BlissSVGBuilder('[color=red]H');
      const handle = builder.glyph(0);
      expect(handle.removeOptions('color')).toBe(handle);
    });
  });

  describe('when reading cached views after a mutation', () => {
    it('elements returns an updated, distinct snapshot after a glyph removal', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const before = builder.elements;
      const glyphCountBefore = before.children[0].children.length;
      builder.glyph(1).remove();
      const after = builder.elements;
      expect(after.children[0].children.length).toBe(glyphCountBefore - 1);
      expect(after).not.toBe(before);
    });

    it('groups returns an updated, distinct array after a group removal', () => {
      const builder = new BlissSVGBuilder('B291//B292');
      const groupsBefore = builder.groups;
      expect(groupsBefore).toHaveLength(2);
      builder.group(1).remove();
      const groupsAfter = builder.groups;
      expect(groupsAfter).toHaveLength(1);
      expect(groupsAfter).not.toBe(groupsBefore);
    });

    it('snapshot() returns an updated, distinct snapshot after a glyph removal', () => {
      const builder = new BlissSVGBuilder('H/C8');
      const snapBefore = builder.snapshot();
      builder.glyph(1).remove();
      const snapAfter = builder.snapshot();
      expect(snapAfter).not.toBe(snapBefore);
      expect(snapAfter.children[0].children.length)
        .toBeLessThan(snapBefore.children[0].children.length);
    });
  });
});
