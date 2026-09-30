import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a character keeps the layout of the code it is made from however
 * that code is decorated: a letter keeps the external-letter spacing and its
 * pair kerning, a digit its digit kerning, and a punctuation mark the tighter
 * word space in front of it, whether it is written bare, with a coordinate,
 * with `;` parts or behind an option bracket.
 *
 * Covers:
 * - Each decoration on a letter, a digit and a punctuation mark lays out like
 *   the bare code, measured as the gap its layout decides.
 * - A Bliss character with no layout data of its own, and a letter beside a
 *   Bliss character, keep the ordinary character space.
 * - A decorated character still has no code of its own; it reports the letter
 *   it is made from.
 * - Every save of such a character reloads to the same drawing: a flattened
 *   word-level indicator on a letter or punctuation head, a part position
 *   written as an option, and the saves after `addPart`, `applyIndicators`
 *   and a part position set through `setOptions`.
 *
 * Does NOT cover:
 * - A character named by a definition, bare or decorated, and the JSON of a
 *   typed glyph spelled out to anonymous parts, see
 *   `BlissSVGBuilder.named-character-layout.test.js`.
 * - A flattened word-level indicator on a DIGIT head, which still loses the
 *   kerning: digit kerning reads the next character's own code, which a
 *   character with a `;` part does not have (backlog, triage).
 * - A hand-written object glyph with no code of its own (backlog, triage).
 * - A text-fallback letter merging with a neighbouring letter on reload, see
 *   `BlissSVGBuilder.serialization-canonicalization.test.js`.
 * - The spacing values themselves and the flags `toJSON()` writes for a glyph
 *   with no code, see `BlissSVGBuilder.external-glyphs.test.js`,
 *   `BlissSVGBuilder.digit-kerning.test.js` and `BlissSVGBuilder.spacing.test.js`.
 */

// Gap in grid units between a word's first two characters, read from the
// laid-out snapshot, so it measures spacing rather than ink.
const gapAfterFirst = (input) => {
  const [first, second] = new BlissSVGBuilder(input).groups[0].children;
  return second.x - (first.x + first.width);
};

// Where the second word starts, which a word-space-tightening mark pulls in.
const secondWordX = (input) => new BlissSVGBuilder(input).groups[1].x;

describe('BlissSVGBuilder decorated character layout', () => {
  describe('when a letter is written with decoration', () => {
    it.each([
      ['a `;` indicator', 'Xa;B86/Xb'],
      ['a `;` shape', 'Xa;C8/Xb'],
      ['a coordinate', 'Xa:1/Xb'],
      ['a coordinate at the origin', 'Xa:0/Xb'],
      ['a y-only coordinate', 'Xa:,2/Xb'],
      ['a coordinate and a part', 'Xa:1;B86/Xb'],
      ['a part bracket and a part', '[color=red]>Xa;B86/Xb'],
      ['a character bracket and a part', '[color=red]Xa;B86/Xb'],
    ])('keeps the external-letter gap to the next letter with %s (%s)', (_label, input) => {
      expect(gapAfterFirst(input)).toBeCloseTo(gapAfterFirst('Xa/Xb'), 6);
    });

    it('keeps the pair kerning on either side of a letter carrying a part', () => {
      // the bare pair really kerns, so a letter that lost its kerning data
      // would show here as the plain external-letter gap
      expect(gapAfterFirst('XA/XV')).toBeLessThan(gapAfterFirst('Xa/Xb') - 0.1);
      expect(gapAfterFirst('XA;B86/XV')).toBeCloseTo(gapAfterFirst('XA/XV'), 6);
      expect(gapAfterFirst('XV/XA;B86')).toBeCloseTo(gapAfterFirst('XV/XA'), 6);
      expect(gapAfterFirst('XA:1/XV')).toBeCloseTo(gapAfterFirst('XA/XV'), 6);
    });

    it('reports the letter it is made from, and no code of its own', () => {
      const glyph = new BlissSVGBuilder('Xa;B86/Xb').glyph(0);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.char).toBe('a');
      expect(glyph.codeName).toBe('');
    });

    it('reports a letter without an outline as that one letter', () => {
      expect(new BlissSVGBuilder('Xλ;B86').glyph(0).char).toBe('λ');
    });
  });

  describe('when a digit is written with decoration', () => {
    it.each([
      ['a `;` indicator', 'B9;B86/B10'],
      ['a coordinate', 'B9:1/B10'],
      ['a part bracket and a part', '[color=red]>B9;B86/B10'],
    ])('keeps the digit kerning to the next digit with %s (%s)', (_label, input) => {
      expect(gapAfterFirst('B9/B10')).toBe(1);
      expect(gapAfterFirst(input)).toBe(1);
    });
  });

  describe('when a punctuation mark is written with decoration', () => {
    it.each([
      ['a `;` indicator', 'B291//B4;B86'],
      ['a part bracket', 'B291//[color=red]>B4'],
      ['a coordinate at the origin', 'B291//B4:0'],
    ])('keeps the tighter word space in front of it with %s (%s)', (_label, input) => {
      expect(secondWordX('B291//B291')).toBe(16);
      expect(secondWordX(input)).toBe(secondWordX('B291//B4'));
      expect(secondWordX(input)).toBe(12);
    });
  });

  describe('when a character with no layout data of its own is written with decoration', () => {
    it('keeps the ordinary character space after a Bliss character carrying a part', () => {
      expect(gapAfterFirst('B291;B86/B313')).toBe(2);
      expect(gapAfterFirst('B291;C8/B313')).toBe(2);
    });

    it('keeps the ordinary character space between a decorated letter and a Bliss character', () => {
      expect(gapAfterFirst('Xa;B86/B291')).toBeCloseTo(2, 6);
    });
  });

  describe('when a composition holding a decorated character is saved', () => {
    // regression: both saves write the decorated spelling (a flattened
    // indicator becomes a `;` part, a part position written as an option
    // becomes a coordinate), and that spelling used to lose the letter spacing,
    // the digit kerning and the tighter word space, so the reload drew a
    // different picture
    it.each([
      ['a flattened word-level indicator on a letter run', 'Xab;;B86', { flattenIndicators: true }, 'Xa;B86/Xb'],
      ['a flattened word-level indicator on a kerned letter pair', 'XAV;;B86', { flattenIndicators: true }, 'XA;B86/XV'],
      ['a flattened word-level indicator on a punctuation mark', 'B291//B4;;B86', { flattenIndicators: true }, 'B291//B4;B86'],
      ['a part position written as an option on a letter', '[x=1]>Xa/Xb', {}, 'Xa:1/Xb'],
      ['a y position written as an option on a letter', '[y=2]>Xa/Xb', {}, 'Xa:,2/Xb'],
      ['a part position written as an option on a digit', '[x=1]>B9/B10', {}, 'B9:1/B10'],
    ])('reloads %s (%s) to the same drawing', (_label, input, options, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString(options)).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the API decorates a character and the composition is saved', () => {
    it.each([
      ['addPart gives a letter an indicator', 'Xa/Xb', (b) => b.glyph(0).addPart('B86'), 'Xa;B86/Xb'],
      ['addPart gives a letter a shape', 'Xa/Xb', (b) => b.glyph(0).addPart('C8'), 'Xa;C8/Xb'],
      ['addPart gives a digit an indicator', 'B9/B10', (b) => b.glyph(0).addPart('B86'), 'B9;B86/B10'],
      ['applyIndicators gives a letter an indicator', 'Xa/Xb', (b) => b.glyph(0).applyIndicators('B86'), 'Xa;B86/Xb'],
      ['setOptions positions a letter', 'Xa/Xb', (b) => b.glyph(0).part(0).setOptions({ x: 1 }), 'Xa:1/Xb'],
      ['setOptions positions a digit', 'B9/B10', (b) => b.glyph(0).part(0).setOptions({ x: 1 }), 'B9:1/B10'],
    ])('reloads the save after %s to the same drawing', (_label, input, decorate, saved) => {
      const builder = new BlissSVGBuilder(input);
      decorate(builder);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });
  });
});
