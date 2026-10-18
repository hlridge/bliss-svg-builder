import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the widths a `stroke-width` option is allowed to carry. Retiring the
 * 0.1-1.5 clamp let a heavier stroke through, and un-gated the values no
 * renderer can draw with: a negative width becomes a negative arc radius in
 * the path data it feeds, which is a path error, and a non-finite one is not
 * a length at all.
 *
 * `stroke-width` reaches the same `judgeNumericOptionValue` gate as every
 * other numeric option, so the general rules are pinned once in
 * `BlissSVGBuilder.option-value-gate.test.js`. This file stays separate for
 * what is true of this key ALONE: it is the only member of the policy table
 * written at four scopes, and the only one whose value feeds path geometry as
 * well as an attribute.
 *
 * Covers:
 * - A negative width REFUSED, not floored to 0. Flooring was the same silent
 *   substitution the ceiling made: it drew an invisible stroke the author
 *   never asked for. The width now falls back to what it would have been.
 * - A non-finite width refused, leaving whatever width was already in force.
 * - A value that is not a number at all, and the bare and empty forms, all
 *   refused. All three used to be silent, and two of them invented a width
 *   (`Number(true)` is 1, `Number('')` is 0).
 * - The refusal reaching the derived geometry, not only the attribute: a
 *   dot's radius is computed from the width.
 * - Every scope the option can be written at, and the object surface too.
 * - What is deliberately untouched: zero, and a width above the retired
 *   ceiling.
 * - The written value surviving serialization and being reported again.
 *
 * Does NOT cover:
 * - The wording of the two refusal messages and the shape of `source`, which
 *   are one gate's output for all 26 keys and are pinned in
 *   `BlissSVGBuilder.option-value-gate.test.js`.
 * - That a non-numeric width does not THROW and still closes the document,
 *   see `BlissSVGBuilder.option-hardening.test.js`, which pins the no-throw
 *   property rather than which width is drawn.
 * - Rendering and round-trip of a valid part-level width, see
 *   `BlissSVGBuilder.part-stroke-width.test.js`.
 * - The dot-sizing formula itself, see `BlissSVGBuilder.dot-sizing.test.js`.
 */

const contentTag = (svg) => svg.match(/<g class="bliss-content"[^>]*>/)[0];
const codes = (builder) => builder.warnings.map(w => w.code);

describe('BlissSVGBuilder stroke-width range', () => {
  describe('when the width is negative', () => {
    it('refuses it and leaves the library default on the content group', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-2]||B291');

      // was floored to 0, which drew an invisible stroke nobody asked for
      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
    });

    it('names the written width in the warning and says why it cannot be drawn', () => {
      const warning = new BlissSVGBuilder('[stroke-width=-2]||B291').warnings
        .find(w => w.code === 'OUT_OF_RANGE_OPTION_VALUE');

      expect(warning.source).toBe('stroke-width=-2');
      // the message names no replacement, because nothing is written in place
      // of a refused value: at global scope the library default shows through, and
      // below it whatever the element inherits does, so naming one would be
      // false at three of the four scopes this option can be written at
      expect(warning.message).toContain('-2');
      expect(warning.message).toContain('a negative stroke cannot be drawn');
      expect(warning.message).toContain('keeps the value it would have had');
    });

    it('refuses a width nearer zero than the one every other case writes', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-0.5]||B291');

      // pins the boundary at 0 rather than at any particular negative value:
      // every other negative case here writes exactly -2, so `written < 0`
      // could be weakened to `written <= -2` and nothing would notice
      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
      expect(builder.svgCode).not.toContain('stroke-width="-0.5"');
    });

    it('keeps the radius a dot derives from it positive', () => {
      const svg = new BlissSVGBuilder('[stroke-width=-2]||B4').svgCode;

      // the dot ink is (stroke-width + extra) / 2, so the negative width used
      // to reach the path data as `a-0.41675,-0.41675`, dropping the glyph.
      // The refusal falls back to the default width, so the dot is drawn at
      // the size it would have been without the option: 0.4165, not the
      // 0.1665 the floor-to-0 produced.
      expect(svg).toContain('<g stroke-width="0.4165">');
      expect(svg).toBe(new BlissSVGBuilder('B4').svgCode);
      expect(svg).not.toMatch(/a-\d/);
    });

    it.each([
      ['part', '[stroke-width=-2]>B291'],
      ['character', '[stroke-width=-2]B291'],
      ['word', '[stroke-width=-2]|B291'],
    ])('refuses it at %s scope and writes no width of its own', (_scope, input) => {
      const builder = new BlissSVGBuilder(input);

      // was `<g stroke-width="0">`; nothing is written now, so the element
      // draws at the width it inherits from the content group
      expect(builder.svgCode).not.toContain('<g stroke-width=');
      expect(builder.svgCode).not.toContain('stroke-width="-2"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
    });

    it('refuses it from object input too', () => {
      const builder = new BlissSVGBuilder({
        options: { 'stroke-width': -2 },
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }],
      });

      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
    });
  });

  describe('when the width is not a finite number', () => {
    it('leaves the library default on the content group and reports it', () => {
      const builder = new BlissSVGBuilder('[stroke-width=Infinity]||B291');

      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
    });

    it('emits no width of its own below global scope', () => {
      const builder = new BlissSVGBuilder('[stroke-width=Infinity]>B291');

      expect(builder.svgCode).not.toContain('Infinity');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
    });

    it('leaves the inherited width alone below global scope', () => {
      const builder = new BlissSVGBuilder('[stroke-width=3]||[stroke-width=Infinity]B291');

      // nothing is written for the character, so it draws at the width the
      // content group sets, not at the library default; the message must not promise
      // the default here
      expect(contentTag(builder.svgCode)).toContain('stroke-width="3"');
      expect(builder.svgCode).not.toContain('<g stroke-width=');
    });

    it('says the width is left as it was rather than naming a replacement', () => {
      const warning = new BlissSVGBuilder('[stroke-width=Infinity]||B291').warnings
        .find(w => w.code === 'OUT_OF_RANGE_OPTION_VALUE');

      expect(warning.source).toBe('stroke-width=Infinity');
      expect(warning.message).toContain('Infinity');
      expect(warning.message).toContain('not a length');
      expect(warning.message).toContain('keeps the value it would have had');
    });

    it('keeps a non-finite value out of the path data a dot derives', () => {
      const svg = new BlissSVGBuilder('[stroke-width=Infinity]||B4').svgCode;

      expect(svg).not.toContain('Infinity');
    });

    it('refuses a negative infinity as non-finite rather than as negative', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-Infinity]||B291');

      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toContain('OUT_OF_RANGE_OPTION_VALUE');
      // both arms report the same code, so only the message separates them,
      // and the finiteness check has to run before the negative one or this
      // reads as an ordinary negative width
      expect(builder.warnings[0].message).toContain('not a length');
    });
  });

  describe('when the width is not a number at all', () => {
    it('falls back to the library default and reports it', () => {
      const builder = new BlissSVGBuilder('[stroke-width=abc]||B291');

      // was the one member of the family that stayed silent, because the
      // `!isNaN` guard skipped the branch without a word; the gate answers
      // that question and reports it now
      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it.each([
      ['bare', '[stroke-width]||B291'],
      ['empty', '[stroke-width=]||B291'],
    ])('refuses the %s form rather than inventing a width', (_form, input) => {
      // Number(true) is 1 and Number('') is 0, so these drew at double and at
      // zero against a default of 0.5, both silently and neither typed
      const builder = new BlissSVGBuilder(input);

      expect(contentTag(builder.svgCode)).toContain('stroke-width="0.5"');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(codes(builder)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('keeps the written value so the composition round-trips', () => {
      const builder = new BlissSVGBuilder('[stroke-width=abc]||B291');

      expect(builder.toString()).toBe('[stroke-width=abc]||B291');
      // the value is kept verbatim rather than repaired, so re-parsing the
      // serialized form reaches the same refusal rather than a clean parse
      expect(codes(new BlissSVGBuilder(builder.toString()))).toEqual(['INVALID_OPTION_VALUE']);
    });
  });

  describe('when the width is one the renderer can draw', () => {
    it('accepts zero in silence', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0]||B291');

      expect(contentTag(builder.svgCode)).toContain('stroke-width="0"');
      expect(builder.warnings).toEqual([]);
    });

    it('accepts a width above the retired 1.5 ceiling in silence', () => {
      const builder = new BlissSVGBuilder('[stroke-width=5]||B291');

      expect(contentTag(builder.svgCode)).toContain('stroke-width="5"');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when a refused width is serialized', () => {
    it('keeps the written value and reports it again on reparse', () => {
      const builder = new BlissSVGBuilder('[stroke-width=-2]||B291');

      expect(builder.toString()).toBe('[stroke-width=-2]||B291');
      expect(codes(new BlissSVGBuilder(builder.toString())))
        .toContain('OUT_OF_RANGE_OPTION_VALUE');
    });
  });
});
