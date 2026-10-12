import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a character keeps the layout of the code it is made from however
 * that code is decorated: a letter keeps the external-letter spacing and its
 * pair kerning, a digit its digit kerning, and a punctuation mark the tighter
 * word space in front of it, whether it is written bare, with a coordinate,
 * with `;` indicators or behind an option bracket, on either side of a pair;
 * a second base part makes it another character, spaced as a Bliss character.
 *
 * Covers:
 * - Each decoration on a letter, a digit and a punctuation mark lays out like
 *   the bare code, measured as the gap its layout decides, on either side of
 *   a pair (a vertical nudge included).
 * - A second base part dropping that spacing, written or added by `addPart`
 *   (a word space keeps the width it was read with, and the save names it),
 *   and a character starting with an indicator kept before a positioned
 *   part, which is composed on the fly and spaced as a Bliss character.
 * - A Bliss character with no layout data of its own, and a letter beside a
 *   Bliss character, keep the ordinary character space, and so does a
 *   built-in drawn from letters (B118, B972), bare or decorated.
 * - A digit or letter beside an unknown code, which fails: drawn as nothing,
 *   it takes no space and lends no spacing.
 * - A decorated character still has no code of its own; it reports the letter
 *   it is made from.
 * - Every save of such a character reloads to the same drawing: a flattened
 *   word-level indicator on a letter, digit or punctuation head, a part
 *   position written as an option, and the saves after `addPart`,
 *   `applyIndicators` and a part position or colour set through `setOptions`.
 *
 * Does NOT cover:
 * - A character named by a definition, bare or decorated, and the JSON of a
 *   typed glyph spelled out to anonymous parts, see
 *   `BlissSVGBuilder.named-character-layout.test.js`.
 * - A second base part the API takes away, and an indicator it inserts before
 *   a positioned part, see `BlissSVGBuilder.edited-character-layout.test.js`.
 * - A hand-written object glyph with no code of its own (backlog, triage).
 * - A text-fallback letter merging with a neighbouring letter on reload, see
 *   `BlissSVGBuilder.serialization-canonicalization.test.js`.
 * - The spacing values themselves and the flags `toJSON()` writes for a glyph
 *   with no code, see `BlissSVGBuilder.external-glyphs.test.js`,
 *   `BlissSVGBuilder.digit-kerning.test.js` and `BlissSVGBuilder.spacing.test.js`.
 *
 * The cases are it.each tables (the guide's sanctioned inline-table form),
 * which take the file past the ~30-test soft cap at about 300 lines; the API
 * edits that take a part away or put one first have their own file (above).
 */

// Gap in grid units between a word's first two characters, read from the
// laid-out snapshot, so it measures spacing rather than ink.
const gapAfterFirst = (input) => {
  const [first, second] = new BlissSVGBuilder(input).groups[0].children;
  return second.x - (first.x + first.width);
};

// The same gap in a builder the API has changed.
const gapAfterFirstIn = (builder) => {
  const [first, second] = builder.groups[0].children;
  return second.x - (first.x + first.width);
};

// Where the second word starts, which a word-space-tightening mark pulls in.
const secondWordX = (input) => new BlissSVGBuilder(input).groups[1].x;

describe('BlissSVGBuilder decorated character layout', () => {
  describe('when a letter is written with decoration', () => {
    it.each([
      ['a `;` indicator', 'Xa;B86/Xb'],
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

    it.each([
      ['a `;` indicator', 'Xa/Xb;B86'],
      ['a part bracket', 'Xa/[color=red]>Xb'],
      ['a coordinate', 'Xa/Xb:1'],
      ['a vertical nudge', 'Xa/Xb:0,1'],
    ])('keeps the external-letter gap from the letter before it with %s (%s)', (_label, input) => {
      expect(gapAfterFirst(input)).toBeCloseTo(gapAfterFirst('Xa/Xb'), 6);
    });

    it('keeps the pair kerning of a letter nudged vertically, on either side', () => {
      expect(gapAfterFirst('XA:0,1/XV')).toBeCloseTo(gapAfterFirst('XA/XV'), 6);
      expect(gapAfterFirst('XV/XA:0,1')).toBeCloseTo(gapAfterFirst('XV/XA'), 6);
    });
  });

  describe('when a letter is fused with a second base part', () => {
    it.each([
      ['Xa;C8/Xb'], ['Xa/Xb;C8'], ['XA;C8/XV'], ['XV/XA;C8'],
    ])('spaces the fused character as a Bliss character in %s', (input) => {
      // a second base part makes another character, so the letter's spacing
      // and pair kerning no longer apply on either side (ruled 4A, H chunk)
      expect(gapAfterFirst(input)).toBeCloseTo(2, 6);
    });

    it('reports no letter and no external-letter flag for the fused character', () => {
      const glyph = new BlissSVGBuilder('Xa;C8/Xb').glyph(0);
      expect(glyph.isExternalGlyph).toBe(false);
      expect(glyph.char).toBe('');
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

    it.each([
      ['a vertical nudge on the first digit', 'B9:0,1/B10'],
      ['a `;` indicator on the second digit', 'B9/B10;B86'],
      ['two `;` indicators on the second digit', 'B9/B10;B86;B97'],
      ['a part bracket on the second digit', 'B9/[color=red]>B10'],
      ['a coordinate on the second digit', 'B9/B10:1'],
      ['a vertical nudge on the second digit', 'B9/B10:0,1'],
    ])('keeps the digit kerning with %s (%s)', (_label, input) => {
      // regression (row 92): the second digit was kerned by its own code,
      // which a digit written with a part, a coordinate or a part bracket
      // does not have
      expect(gapAfterFirst(input)).toBe(1);
    });
  });

  describe('when a digit is fused with a second base part', () => {
    it.each([
      ['B9;B303/B10'], ['B9/B10;B303'],
    ])('drops the digit kerning in %s', (input) => {
      // a second base part makes another character (ruled 4A, H chunk)
      expect(gapAfterFirst(input)).toBe(2);
    });
  });

  describe('when a character starts with an indicator kept before a part you positioned', () => {
    it.each([
      ['B86;B9:0,0/B10'], ['B9/B86;B10:0,0'], ['B86;Xa:0,0/Xb'], ['Xa/B86;Xb:0,0'],
    ])('spaces it as a Bliss character in %s, not as the digit or letter in it', (input) => {
      // control: written first, the indicator is not placed as an indicator
      // but drawn where it stands, an ordinary part of a character composed
      // on the fly (owner, 2026-10-12), so the character keeps no digit or
      // letter spacing on either side
      expect(gapAfterFirst(input)).toBeCloseTo(2, 6);
    });

    it('leaves the ordinary word space in front of a full stop written after such an indicator (B291//B86;B4:0,0)', () => {
      expect(secondWordX('B291//B86;B4:0,0')).toBe(16);
    });
  });

  describe('when a character fails on an unknown code beside its base code', () => {
    it.each([['B9;ZZZ/B10'], ['Xa;ZZZ/Xb']])('takes no space and lends its neighbour no digit or letter spacing in %s', (input) => {
      // the unknown code counts as a base part, as it does where the word
      // space before a punctuation mark is decided, so the character drawn as
      // nothing keeps none of the spacing of the code beside it; pins the
      // parts judged as written, before the failed character is emptied
      // (2026-10 hand mutants)
      expect(new BlissSVGBuilder(input).warnings.map((w) => w.code)).toEqual(['UNKNOWN_CODE']);
      expect(gapAfterFirst(input)).toBe(0);
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

    it('keeps the tighter word space in front of it with a vertical nudge (B291//B4:0,1)', () => {
      expect(secondWordX('B291//B4:0,1')).toBe(12);
    });

    it('leaves the ordinary word space in front of it when fused with a second base part (B291//B4;C8)', () => {
      // a second base part makes another character (ruled 4A, H chunk)
      expect(secondWordX('B291//B4;C8')).toBe(16);
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

    it.each([
      ['B118/Xd'], ['B118;B86/Xd'], ['B118:1/Xd'], ['Xd/B118;B86'], ['B972;B86/XD'],
    ])('keeps the Bliss character space of a built-in drawn from letters in %s', (input) => {
      // B118 and B972 are Bliss characters (the Latin alphabet) whose code
      // strings start with a letter; decorated, they stay what they are bare,
      // not the letter they start with
      expect(gapAfterFirst(input)).toBe(2);
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
      ['a flattened word-level indicator on a digit head', 'B9/B10;;B86', { flattenIndicators: true }, 'B9/B10;B86'],
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

    it.each([
      ['addPart gives the second digit an indicator', 'B9/B10', (b) => b.glyph(1).addPart('B86'), 'B9/B10;B86', 1],
      ['applyIndicators gives the second digit an indicator', 'B9/B10', (b) => b.glyph(1).applyIndicators('B86'), 'B9/B10;B86', 1],
      ['setOptions moves the second digit', 'B9/B10', (b) => b.glyph(1).part(0).setOptions({ x: 1 }), 'B9/B10:1', 1],
      ['setOptions nudges the second digit vertically', 'B9/B10', (b) => b.glyph(1).part(0).setOptions({ y: 1 }), 'B9/B10:,1', 1],
      ['setOptions colours the second digit', 'B9/B10', (b) => b.glyph(1).part(0).setOptions({ color: 'red' }), 'B9/[color=red]>B10', 1],
      ['addPart fuses the first digit with a second base part', 'B9/B10', (b) => b.glyph(0).addPart('B303'), 'B9;B303/B10', 2],
      ['addPart fuses the second digit with a second base part', 'B9/B10', (b) => b.glyph(1).addPart('B303'), 'B9/B10;B303', 2],
      ['addPart fuses the first letter with a shape', 'Xa/Xb', (b) => b.glyph(0).addPart('C8'), 'Xa;C8/Xb', 2],
      ['addPart fuses the second letter with a shape', 'Xa/Xb', (b) => b.glyph(1).addPart('C8'), 'Xa/Xb;C8', 2],
    ])('draws the gap after %s as the written form does, and both saves reload as drawn', (_label, input, decorate, saved, gap) => {
      // regression (row 92): the API kept the second digit's kerning that its
      // save lost on reload; a second base part now drops the spacing on both
      // routes alike (ruled 4A, H chunk)
      const builder = new BlissSVGBuilder(input);
      decorate(builder);
      expect(gapAfterFirstIn(builder)).toBeCloseTo(gap, 6);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('keeps the stored word space before a full stop that addPart fuses with a shape, and its save writes that space out', () => {
      // note: a word space is decided when it is read, and an edit to the next
      // word keeps it, as replacing the full stop does (B291/QSP/B291); fused
      // with a shape the mark no longer pulls the space in (ruled 4A, H
      // chunk), so the save names the tighter space it keeps
      const builder = new BlissSVGBuilder('B291//B4');
      builder.group(1).glyph(0).addPart('C8');
      expect(builder.groups[1].x).toBe(12);
      expect(builder.toString()).toBe('B291/QSP/B4;C8');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });
});
