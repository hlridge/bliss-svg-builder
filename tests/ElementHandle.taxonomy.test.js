import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the taxonomy-related accessors on `ElementHandle`: the level
 * field with its derived boolean flags (`isGroup`/`isGlyph`/`isPart`)
 * at every handle level, and the glyph-level `codeName` contract that
 * exposes user-written input only when the glyph has identity at the
 * glyph level.
 *
 * Covers:
 * - `level` plus `isGroup`/`isGlyph`/`isPart` on group, glyph, and part handles.
 * - `codeName === ''` on glyph handles for shape primitives (codeName
 *   lives at part level).
 * - `codeName === input` on glyph handles for single-char external-glyph
 *   fallback (e.g. `Xα`).
 * - `codeName === ''` on glyph handles for multi-char external-glyph
 *   fallback (e.g. `Xαllo`).
 *
 * Does NOT cover:
 * - The full `codeName` contract across part level and through
 *   semantic-strip operations, see
 *   `BlissSVGBuilder.stripSemanticParity.test.js`.
 * - The element-tree taxonomy of the snapshot side (raw blissObj
 *   shape), see `element-taxonomy.test.js`.
 */
describe('ElementHandle taxonomy', () => {
  describe('when checking level-derived boolean accessors', () => {
    const b = new BlissSVGBuilder('B291;B86/B313//B431');
    const grp = b.group(0);
    const gly = grp.glyph(0);
    const prt = gly.part(0);

    it('classifies a group handle as level 1 with isGroup=true', () => {
      expect(grp.level).toBe(1);
      expect(grp.isGroup).toBe(true);
      expect(grp.isGlyph).toBe(false);
      expect(grp.isPart).toBe(false);
    });

    it('classifies a glyph handle as level 2 with isGlyph=true', () => {
      expect(gly.level).toBe(2);
      expect(gly.isGroup).toBe(false);
      expect(gly.isGlyph).toBe(true);
      expect(gly.isPart).toBe(false);
    });

    it('classifies a part handle as level 3 with isPart=true', () => {
      expect(prt.level).toBe(3);
      expect(prt.isGroup).toBe(false);
      expect(prt.isGlyph).toBe(false);
      expect(prt.isPart).toBe(true);
    });
  });

  describe('when probing codeName at glyph level', () => {
    it('returns empty string for a shape primitive (codeName lives at part level)', () => {
      const b = new BlissSVGBuilder('H');
      const glyph = b.glyph(0);
      expect(glyph.codeName).toBe('');
      expect(glyph.part(0).codeName).toBe('H');
    });

    it('surfaces the input code for a single-char external-glyph fallback', () => {
      const b = new BlissSVGBuilder('Xα');
      const glyph = b.glyph(0);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.codeName).toBe('Xα');
      expect(glyph.char).toBe('α');
    });

    it('returns empty string for a multi-char external-glyph fallback', () => {
      const b = new BlissSVGBuilder('Xαllo');
      const glyph = b.glyph(0);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.codeName).toBe('');
      expect(glyph.char).toBe('');
    });
  });
});
