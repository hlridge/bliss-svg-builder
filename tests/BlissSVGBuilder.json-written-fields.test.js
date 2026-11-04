/**
 * Pins where `toJSON()` writes a field: an options bag where a bracket or a
 * definition writes one, a position or an anchor only where a link sets it,
 * and the flag on an explicit space only where it is not the default.
 *
 * Covers:
 * - A word alias, a phrase alias and a placing alias that bring no options,
 *   alone, in a word and in a `;` slot: no options bag on any part, in each
 *   of the four saves (default, `preserve`, `deep`, both).
 * - A bracket holding only a position no number can be, at the word, the
 *   character and the part: the refusal leaves the bag empty and kept, where
 *   a position moved out of the bag removes it.
 * - A rename read through in a `;` slot that places nothing: no position the
 *   links add and no anchor key, in either deep save.
 * - An explicit `TSP` between characters: saved as `//` saves, in each save.
 *
 * Does NOT cover:
 * - The fields a save does write for a name read through (its name, its
 *   options, the position its links add), see
 *   `BlissSVGBuilder.alias-name-preserve.test.js` and
 *   `BlissSVGBuilder.custom-definition-serialization.test.js`.
 * - The default output leaving out definition-derived metadata, see
 *   `BlissSVGBuilder.json-output.test.js`.
 * - A bracket a scope refusal empties, which stores no bag, see
 *   `BlissSVGBuilder.definition-scope-admission.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const NAMES = {
  JW_WORD: { codeString: 'B313/B291' },
  JW_PHRASE: { codeString: 'B313//B291' },
  JW_DOT: { codeString: 'DOT:2,4' },
  JW_REN: { codeString: 'B313' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(NAMES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(NAMES));
});

afterAll(() => {
  for (const code of Object.keys(NAMES)) BlissSVGBuilder.removeDefinition(code);
});

const SAVES = [undefined, { preserve: true }, { deep: true }, { deep: true, preserve: true }];

// Every part directly below a character, in each of the four saves.
const savedPartsOf = (input) => SAVES.flatMap((mode) => new BlissSVGBuilder(input).toJSON(mode)
  .groups.flatMap((group) => group.glyphs.flatMap((glyph) => glyph.parts ?? [])));

// The first character's second part, in both deep saves.
const deepSlotPartsOf = (input) => [{ deep: true }, { deep: true, preserve: true }]
  .map((mode) => new BlissSVGBuilder(input).toJSON(mode).groups[0].glyphs[0].parts[1]);

const ELEMENT_AT = {
  word: (json) => json.groups[0],
  character: (json) => json.groups[0].glyphs[0],
  part: (json) => json.groups[0].glyphs[0].parts[0],
};

describe('BlissSVGBuilder JSON written fields', () => {
  describe('when a name that brings no options is used', () => {
    it.each(['JW_WORD', 'B291/JW_WORD', 'JW_PHRASE', 'JW_DOT', 'B313;JW_DOT'])(
      'writes no options bag on any part of %s, in each save', (input) => {
        // pins a bag written only where a bracket or a definition writes one:
        // survivors of the 2026-11 stryker run gave these parts an empty bag
        const parts = savedPartsOf(input);
        expect(parts.length).toBeGreaterThan(0);
        expect(parts.filter((part) => Object.hasOwn(part, 'options'))).toEqual([]);
      });
  });

  describe('when a bracket holds only a position no number can be', () => {
    it.each([
      ['[x=abc]|B313', 'word'],
      ['[x=abc]B313', 'character'],
      ['[x=abc]>B313', 'part'],
    ])('keeps the bag the refusal in %s empties, on the %s', (input, level) => {
      // pins the bag removed only where a position is moved out of it: a
      // survivor of the 2026-11 stryker run removed the one a refusal empties
      expect(ELEMENT_AT[level](new BlissSVGBuilder(input).toJSON()).options).toEqual({});
    });

    it('removes the bag a position moved out of it empties', () => {
      expect(Object.hasOwn(ELEMENT_AT.character(new BlissSVGBuilder('[x=1]B313').toJSON()), 'options')).toBe(false);
    });
  });

  describe('when a name read through in a slot places nothing', () => {
    it('writes no position the links add, in either deep save', () => {
      // pins the position recorded only where a link writes one: a survivor
      // of the 2026-11 stryker run recorded an empty one
      for (const part of deepSlotPartsOf('B291;JW_REN')) {
        expect(part._aliasCodeName).toBe('JW_REN');
        expect(Object.hasOwn(part, '_aliasPosition')).toBe(false);
      }
    });

    it('writes no anchor the links leave unset, in either deep save', () => {
      // pins an anchor taken from a link only where the link sets one: a
      // survivor of the 2026-11 stryker run left both keys holding undefined
      for (const part of deepSlotPartsOf('B291;JW_REN')) {
        expect(Object.hasOwn(part, 'anchorOffsetX')).toBe(false);
        expect(Object.hasOwn(part, 'anchorOffsetY')).toBe(false);
      }
    });
  });

  describe('when an explicit space is the default one', () => {
    it('saves B313/TSP/B291 as B313//B291 saves, in each save', () => {
      // pins the flag a space carries only where it is not the default: a
      // survivor of the 2026-11 stryker run flagged TSP too
      for (const mode of SAVES) {
        expect(new BlissSVGBuilder('B313/TSP/B291').toJSON(mode)).toEqual(new BlissSVGBuilder('B313//B291').toJSON(mode));
      }
    });
  });
});
