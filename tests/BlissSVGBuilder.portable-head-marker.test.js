/**
 * Pins the portable saves marking a word's head where a reload would carry
 * the word's `;;` indicators onto another character: a custom glyph is saved
 * as the code it draws, and where the head scan skips that code, the save
 * marks the builder's head (`^` in the string, `isHeadGlyph` in the JSON).
 *
 * Covers:
 * - A custom glyph drawing `B937`, before `B291` with `;;` codes written or
 *   given by `group(0).applyIndicators()`, with an anchored glyph as the
 *   next character, with an anchor of its own, and before a built-in `B937`:
 *   the marker in the string and the JSON, each reloading as drawn, and the
 *   reload keeping the designation.
 * - `omitOptions`, which keeps the marker, also where a character before the
 *   head is written as nothing.
 * - No marker where the reload resolves the same head: a built-in `B937`, a
 *   word with no `;;` codes, the custom glyph after the head, a head of two
 *   codes (also placing a code by its anchor); a designation already stored,
 *   written as before; `preserve`; the flattened save.
 * - A word that came in through `merge()`, whose character holds the custom
 *   glyph under the code it draws: the head the render reads, unmarked in the
 *   default saves, marked under `preserve`.
 *
 * Does NOT cover:
 * - How the head is chosen, see `BlissParser.head-glyph.test.js`.
 * - Re-emitting a stored designation, see
 *   `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - A `;;` code placed by an anchored head, see
 *   `BlissSVGBuilder.portable-indicator-placement.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PH_MORE: { type: 'glyph', codeString: 'B937' },
  PH_MOREANC: { type: 'glyph', codeString: 'B937', anchorOffsetY: 2 },
  PH_ANC: { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

// Which characters of a JSON's first word are marked as its head.
const headFlags = (json) => json.groups[0].glyphs.map((glyph) => glyph.isHeadGlyph === true);

const MARKED = [
  ['PH_MORE/B291;;B81', 'B937^/B291;;B81', [true, false]],
  ['PH_MORE/PH_ANC;;B99', 'B937^/B291;;B99', [true, false]],
  ['PH_MOREANC/B291;;B99', 'B937^/B291;;B99:,2', [true, false]],
  ['PH_MORE/B937/B291;;B81', 'B937^/B937/B291;;B81', [true, false, false]],
];

describe('BlissSVGBuilder portable head marker', () => {
  describe('when a custom glyph drawing a code the head scan skips heads a word with ;; codes', () => {
    it.each(MARKED)('saves %s as %s, marking the head in the JSON too, each reloading as drawn', (input, saved, flags) => {
      // regression: the saves wrote B937 unmarked, so a reload took the next
      // character as the head and drew the word's indicators there
      // (identical on v1.0.0)
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      const json = builder.toJSON();
      expect(string).toBe(saved);
      expect(headFlags(json)).toEqual(flags);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });

    it('stores the designation in a reload of either save', () => {
      const builder = new BlissSVGBuilder('PH_MORE/B291;;B81');
      expect(headFlags(new BlissSVGBuilder(builder.toString()).toJSON())).toEqual([true, false]);
      expect(headFlags(new BlissSVGBuilder(builder.toJSON()).toJSON())).toEqual([true, false]);
    });

    it('saves PH_MORE/B291 given B81 by group(0).applyIndicators as B937^/B291;;B81, which reloads as drawn', () => {
      const builder = changed('PH_MORE/B291', (b) => b.group(0).applyIndicators('B81'));
      expect(builder.toString()).toBe('B937^/B291;;B81');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('keeps the marker under omitOptions, in the string and the JSON', () => {
      const builder = new BlissSVGBuilder('PH_MORE/B291;;B81');
      expect(builder.toString({ omitOptions: true })).toBe('B937^/B291;;B81');
      expect(headFlags(builder.toJSON({ omitOptions: true }))).toEqual([true, false]);
    });

    it.each([
      '[color=red]/PH_MORE/B291;;B81',
      '[color=red]^/PH_MORE/B291;;B81',
    ])('marks the head of %s after a character that a save without options writes as nothing', (input) => {
      // pins the head counted among the characters the save writes: the
      // options-only character before it is left out with its options, and
      // a designation on it with them
      const builder = new BlissSVGBuilder(input);
      const cleared = changed(input, (b) => b.clearAllOptions());
      expect(builder.toString({ omitOptions: true })).toBe('B937^/B291;;B81');
      expect(headFlags(builder.toJSON({ omitOptions: true }))).toEqual([false, true, false]);
      expect(new BlissSVGBuilder('B937^/B291;;B81').svgCode).toBe(cleared.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ omitOptions: true })).svgCode).toBe(cleared.svgCode);
    });
  });

  describe('when the word came in through merge()', () => {
    it('saves B291 merged with PH_MOREANC/B291;;B99 by the head the merged builder draws on', () => {
      // pins the head read from the stored word, as the render reads it: the
      // merged character's own code is B937 while its part stays PH_MOREANC,
      // so B99 is drawn on B291 (backlog row "`merge()` moves a word's `;;`
      // indicators off a custom glyph that heads it"). Read from the save's
      // own copy, the head was PH_MOREANC, and the string placed B99 by its
      // anchor. Under preserve the name ranks as a head, so B291 is marked.
      const builder = new BlissSVGBuilder('B291');
      builder.merge(new BlissSVGBuilder('PH_MOREANC/B291;;B99'));
      expect(builder.toString()).toBe('B291//B937/B291;;B99');
      expect(builder.toString({ preserve: true })).toBe('B291//PH_MOREANC/B291^;;B99');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
    });

    it('marks the head in the string only where the JSON names the merged character by its own code', () => {
      // pins the JSON's reload read with each character's published code: the
      // merged character is published as B937, which the head scan skips,
      // while the string writes it as B937;B86, which the scan does not
      const other = changed('PH_MORE/B291;;B81', (b) => b.glyph(0).applyIndicators('B86'));
      const builder = new BlissSVGBuilder('B291');
      builder.merge(other);
      expect(builder.toString()).toBe('B291//B937;B86/B291^;;B81');
      expect(builder.toJSON().groups[2].glyphs.map((glyph) => glyph.isHeadGlyph === true)).toEqual([false, false]);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a reload resolves the same head without a marker', () => {
    it.each([
      ['B937/B291;;B81', 'B937/B291;;B81'],
      ['PH_MORE/B291', 'B937/B291'],
      ['B291/PH_MORE;;B81', 'B291/B937;;B81'],
      // note: a character of two codes is not skipped as a head
      ['PH_MORE;B81/B291;;B86', 'B937;B81/B291;;B86'],
      ['PH_MORE^/B291;;B81', 'B937^/B291;;B81'],
    ])('saves %s as %s, which reloads as drawn', (input, saved) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('saves PH_MOREANC;B81/B291;;B99 as B937;B81/B291;;B99:,2, unmarked, placing B99 by the head\'s own anchor', () => {
      // note: the head of two codes is resolved alike, so no marker; the word's
      // B99 lands on it and is placed by PH_MOREANC's anchor
      const builder = new BlissSVGBuilder('PH_MOREANC;B81/B291;;B99');
      expect(builder.toString()).toBe('B937;B81/B291;;B99:,2');
      expect(headFlags(builder.toJSON())).toEqual([false, false]);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('keeps PH_MORE/B291;;B81 under preserve with no marker', () => {
      // control: passes before C25; the name reloads with its definition, which the head scan does not skip
      const builder = new BlissSVGBuilder('PH_MORE/B291;;B81');
      expect(builder.toString({ preserve: true })).toBe('PH_MORE/B291;;B81');
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
    });

    it('flattens PH_MORE/B291;;B81 to B937;B81/B291, with no marker', () => {
      // control: passes before C25; flattened, the indicator sits on its character and no head is resolved
      const builder = new BlissSVGBuilder('PH_MORE/B291;;B81');
      expect(builder.toString({ flattenIndicators: true })).toBe('B937;B81/B291');
      expect(new BlissSVGBuilder('B937;B81/B291').svgCode).toBe(builder.svgCode);
    });
  });
});
