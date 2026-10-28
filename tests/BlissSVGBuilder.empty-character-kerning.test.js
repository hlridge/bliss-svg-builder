/**
 * Pins that kerning held by an empty character (a slot with no parts) is the
 * slot's own option, kept like its colour: toString() writes the slot out
 * after its kerning marker (`B313/RK:3/[]`), so the save reloads to the same
 * picture and the same slot, with no warning.
 *
 * Covers:
 * - Every route to a kerned slot: a marker before `[]` and before a character
 *   whose space parts all drop (`QSP;QSP`), bracket kerning on a slot,
 *   `addGlyph`/`insertGlyph` with kerning, object input; at the word's end,
 *   before a space, before a character with kerning of its own and before one
 *   without.
 * - A marker meeting the slot's own bracket kerning: the bracket wins and is
 *   written before the slot.
 * - Editing: a part added to the slot (the character it becomes takes the
 *   kerning), a character added after it, the drawn character after it
 *   removed.
 * - A head marker on a kerned slot (`RK:3/[]^`): from the DSL, from object
 *   input, and in the save without options.
 * - The other saves: without options (kerning stays, so the slot is written)
 *   and `preserve`.
 * - Controls: a slot holding no kerning is written as nothing, one holding a
 *   colour as its bracket alone; a marker with no slot after it is still
 *   dropped and reported.
 *
 * Does NOT cover:
 * - A kerning marker with no character after it, see
 *   `BlissSVGBuilder.trailing-kerning.test.js`; one before a space, see
 *   `BlissSVGBuilder.space-kerning.test.js`.
 * - The space before a word led by a kerned slot: inserted by an API edit, see
 *   `BlissSVGBuilder.api-word-space.test.js`; saved, see
 *   `BlissSVGBuilder.empty-content-serialization.test.js` and
 *   `BlissSVGBuilder.written-word-space.test.js`.
 * - Kerning across empty characters in the layout, see
 *   `BlissSVGBuilder.empty-glyph-layout.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const B313 = { codeName: 'B313', parts: [{ codeName: 'B313' }] };
const B291 = { codeName: 'B291', parts: [{ codeName: 'B291' }] };

// The string save loaded again, as a reader compares it with the builder:
// its picture, its composition and the warnings the reload gave.
const reloadOf = (builder) => {
  const reload = new BlissSVGBuilder(builder.toString());
  return { svg: reload.svgCode, json: reload.toJSON(), warnings: reload.warnings.map((w) => w.code) };
};

// What a faithful save reloads to: the builder's own picture and
// composition, with no warning.
const asBuilt = (builder) => ({ svg: builder.svgCode, json: builder.toJSON(), warnings: [] });

// `start` with an empty character holding `kerning` inserted at `index` of
// its first word.
const withSlotInserted = (start, index, kerning) => {
  const builder = new BlissSVGBuilder(start);
  builder.group(0).insertGlyph(index, '', kerning);
  return builder;
};

describe('BlissSVGBuilder empty character kerning', () => {
  describe('when an empty character holding kerning ends its word', () => {
    it.each([
      ['B313/AK:10/[]', 'B313/AK:10/[]', () => new BlissSVGBuilder('B313/AK:10/[]')],
      ['B313/AK:10/QSP;QSP', 'B313/AK:10/[]', () => new BlissSVGBuilder('B313/AK:10/QSP;QSP')],
      ['B313/[relative-kerning=3]', 'B313/RK:3/[]', () => new BlissSVGBuilder('B313/[relative-kerning=3]')],
      ['RK:3/[]', 'RK:3/[]', () => new BlissSVGBuilder('RK:3/[]')],
      ['B313 given addGlyph with absoluteKerning 3', 'B313/AK:3/[]', () => new BlissSVGBuilder('B313').addGlyph('', { absoluteKerning: 3 })],
      ['object input holding relativeKerning 3', 'B313/RK:3/[]', () => new BlissSVGBuilder({ groups: [{ glyphs: [B313, { parts: [], options: { relativeKerning: 3 } }] }] })],
    ])('saves %s as %s, which reloads as built with no warning', (_, saved, make) => {
      const builder = make();
      expect(builder.toString()).toBe(saved);
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });
  });

  describe('when an empty character holding kerning comes before a space', () => {
    it.each([
      ['B313/AK:10/[]//B291', 'B313/AK:10/[]//B291', () => new BlissSVGBuilder('B313/AK:10/[]//B291')],
      ['B313/[relative-kerning=3]//B291', 'B313/RK:3/[]//B291', () => new BlissSVGBuilder('B313/[relative-kerning=3]//B291')],
      ['B313//B291 given insertGlyph(1) with relativeKerning 2', 'B313/RK:2/[]//B291', () => withSlotInserted('B313//B291', 1, { relativeKerning: 2 })],
    ])('saves %s as %s, which reloads as built with no warning', (_, saved, make) => {
      const builder = make();
      expect(builder.toString()).toBe(saved);
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });
  });

  describe('when an empty character holding kerning comes before a character', () => {
    it.each([
      // regression: written as a bare marker, the slot's value met the
      // character's own on reload and lost to it (MULTIPLE_KERNING_VALUES)
      ['B313/RK:3/[]/RK:2/B291', 'B313/RK:3/[]/RK:2/B291'],
      ['B313/[relative-kerning=3]/RK:2/B291', 'B313/RK:3/[]/RK:2/B291'],
      ['B313/AK:10/TSP;QSP/AK:4/B291', 'B313/AK:10/[]/AK:4/B291'],
      ['B313/AK:10/[]/B291', 'B313/AK:10/[]/B291'],
    ])('saves %s as %s, which reloads as built with no warning', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });
  });

  describe('when a kerning marker meets the slot\'s own bracket kerning', () => {
    it('reports the marker and saves the bracket value before the slot', () => {
      const builder = new BlissSVGBuilder('B313/AK:10/[relative-kerning=3]/B291');
      expect(builder.warnings.map((w) => ({ code: w.code, source: w.source })))
        .toEqual([{ code: 'MULTIPLE_KERNING_VALUES', source: 'AK:10' }]);
      expect(builder.toString()).toBe('B313/RK:3/[]/B291');
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });
  });

  describe('when the kerned slot is edited', () => {
    it('gives the kerning to the character a part added to the slot makes', () => {
      const builder = new BlissSVGBuilder('B313/AK:10/[]');
      builder.group(0).glyph(1).addPart('B291');
      expect(builder.toString()).toBe('B313/AK:10/B291');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B313/AK:10/B291').svgCode);
    });

    it('keeps the slot and the gap it sets before a character added after it', () => {
      const builder = new BlissSVGBuilder('B313/AK:10/[]').addGlyph('B291');
      expect(builder.toString()).toBe('B313/AK:10/[]/B291');
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });

    it('keeps the slot and its kerning when the character after it is removed', () => {
      const builder = new BlissSVGBuilder('B313/AK:10/[]/B291');
      builder.group(0).glyph(2).remove();
      expect(builder.toString()).toBe('B313/AK:10/[]');
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });
  });

  describe('when a head marker is on a kerned slot', () => {
    it('keeps the marker written in the DSL and saves it on the slot', () => {
      const builder = new BlissSVGBuilder('B313/RK:3/[]^/B291');
      expect(builder.toJSON().groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(builder.toString()).toBe('B313/RK:3/[]^/B291');
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });

    it('saves the marker of object input on the slot', () => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [B313, { parts: [], isHeadGlyph: true, options: { relativeKerning: 3 } }, B291] }] });
      expect(builder.toString()).toBe('B313/RK:3/[]^/B291');
      expect(reloadOf(builder)).toEqual(asBuilt(builder));
    });

    it('keeps the marker on a slot whose colour the save without options leaves out', () => {
      const builder = new BlissSVGBuilder('B313/RK:3/[color=red]^/B291');
      const saved = builder.toString({ omitOptions: true });
      expect(saved).toBe('B313/RK:3/[]^/B291');
      expect(new BlissSVGBuilder(saved).toJSON()).toEqual(builder.toJSON({ omitOptions: true }));
    });
  });

  describe('when the kerned slot is saved without options or with preserve', () => {
    it('writes the slot out without options, which keep kerning', () => {
      expect(new BlissSVGBuilder('B313/AK:10/[color=red]').toString({ omitOptions: true })).toBe('B313/AK:10/[]');
    });

    it('writes the slot out under preserve', () => {
      expect(new BlissSVGBuilder('B313/AK:10/[]').toString({ preserve: true })).toBe('B313/AK:10/[]');
    });
  });

  describe('when a slot holds no kerning, or a bracket of its own', () => {
    it.each([
      ['B313/[]/B291', 'B313/B291'],
      ['B313/AK:10/[color=red]', 'B313/AK:10/[color=red]'],
    ])('saves %s as %s', (input, saved) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(saved);
    });
  });

  describe('when a kerning marker has no slot after it', () => {
    it.each([
      ['B313/AK:10', 'MISPLACED_KERNING_OPTION'],
      ['B313/AK:10//B291', 'MISPLACED_SPACE_DECORATION'],
    ])('drops the marker in %s and reports %s', (input, code) => {
      expect(new BlissSVGBuilder(input).warnings.map((w) => w.code)).toEqual([code]);
    });
  });
});
