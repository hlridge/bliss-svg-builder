import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a character named by a definition keeps the layout of the
 * character the definition draws, bare or decorated, whatever its code string
 * wraps that character in; and that the JSON of such a glyph, spelled out to
 * anonymous parts, keeps the layout data a rebuild cannot re-derive.
 *
 * Covers:
 * - A bare alias of a letter with a coordinate or behind a part bracket.
 * - A typed glyph naming a digit (its kerning) and a typed glyph or bare alias
 *   naming a punctuation mark (the tighter word space before it), bare and
 *   decorated, each save reloading the same drawing.
 * - The digit read behind a part bracket, a coordinate or `;` parts in the
 *   code string of a decorated typed glyph.
 * - A kerning table the definition sets winning over the digit it is made of.
 * - A name whose code string a decorated use cannot read lending the failed
 *   character nothing, so its save still reloads the same drawing, and a
 *   tripwire on that failure, which a later parser fix has to carry into the
 *   layout lookup.
 * - The JSON of a typed glyph spelled out to anonymous parts: its layout data
 *   written out, its identity not, and nothing added for a Bliss character.
 *
 * Does NOT cover:
 * - Codes written directly, see
 *   `BlissSVGBuilder.decorated-character-layout.test.js`.
 * - A kerning table a definition sets is lost by the default save, bare or
 *   decorated: definition metadata does not travel in the default string (see
 *   the custom-codes handbook page); `preserve` keeps the name.
 * - Why a name with a character bracket in its code string, or one naming a
 *   letter without an outline, fails where it stands decorated.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
  }
  customCodes.length = 0;
});

// Gap in grid units between a word's first two characters, read from the
// laid-out snapshot, so it measures spacing rather than ink.
const gapAfterFirst = (input) => {
  const [first, second] = new BlissSVGBuilder(input).groups[0].children;
  return second.x - (first.x + first.width);
};

// Where the second word starts, which a word-space-tightening mark pulls in.
const secondWordX = (input) => new BlissSVGBuilder(input).groups[1].x;

describe('BlissSVGBuilder named character layout', () => {
  describe('when a letter is named through a bare alias and decorated', () => {
    it.each([
      ['a coordinate', 'LETTERA:1/Xb'],
      ['a part bracket', '[color=red]>LETTERA/Xb'],
    ])('reads the letter the alias names with %s (%s)', (_label, input) => {
      customCodes.push('LETTERA');
      expect(BlissSVGBuilder.define({ LETTERA: { codeString: 'Xa' } }).defined).toEqual(['LETTERA']);
      expect(gapAfterFirst('LETTERA/Xb')).toBeCloseTo(gapAfterFirst('Xa/Xb'), 6);
      expect(gapAfterFirst(input)).toBeCloseTo(gapAfterFirst('Xa/Xb'), 6);
    });
  });

  describe('when a digit or punctuation mark is named by a definition', () => {
    // regression: a typed glyph naming a digit or a punctuation mark read no
    // layout data once decorated, while its save spells out the digit or mark
    // itself, which does; and a name of a punctuation mark never pulled in the
    // word space before it, bare or decorated
    const NAMES = {
      NAMEDDIGIT: { type: 'glyph', codeString: 'B9' },
      NAMEDPERIOD: { type: 'glyph', codeString: 'B4' },
      PERIODALIAS: { codeString: 'B4' },
    };

    it.each([
      ['a coordinate', 'NAMEDDIGIT:1/B10'],
      ['a `;` part', 'NAMEDDIGIT;B86/B10'],
      ['a part bracket', '[color=red]>NAMEDDIGIT/B10'],
    ])('keeps the digit kerning of a typed glyph naming a digit with %s (%s), and its save reloads the same drawing', (_label, input) => {
      customCodes.push(...Object.keys(NAMES));
      expect(BlissSVGBuilder.define(NAMES).defined).toHaveLength(3);
      const builder = new BlissSVGBuilder(input);
      expect(gapAfterFirst(input)).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a typed glyph', 'B291//NAMEDPERIOD'],
      ['a typed glyph with a coordinate', 'B291//NAMEDPERIOD:1'],
      ['a typed glyph with a `;` part', 'B291//NAMEDPERIOD;B86'],
      ['a typed glyph behind a part bracket', 'B291//[color=red]>NAMEDPERIOD'],
      ['a bare alias', 'B291//PERIODALIAS'],
      ['a bare alias at the origin', 'B291//PERIODALIAS:0'],
    ])('pulls in the word space before a punctuation mark named by %s (%s), and its save reloads the same drawing', (_label, input) => {
      customCodes.push(...Object.keys(NAMES));
      expect(BlissSVGBuilder.define(NAMES).defined).toHaveLength(3);
      const builder = new BlissSVGBuilder(input);
      expect(secondWordX(input)).toBe(12);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a part bracket', '[color=red]>B9'],
      ['a coordinate', 'B9:1'],
      ['a `;` part', 'B9;C8'],
    ])('reads the digit behind %s in the code string of a decorated typed glyph (%s)', (_label, codeString) => {
      customCodes.push('DIGITLIKE');
      expect(BlissSVGBuilder.define({ DIGITLIKE: { type: 'glyph', codeString } }).defined).toEqual(['DIGITLIKE']);
      const builder = new BlissSVGBuilder('DIGITLIKE;B86/B10');
      expect(gapAfterFirst('DIGITLIKE;B86/B10')).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('lets a kerning table the definition sets win over the digit it is made of, as the bare name does', () => {
      customCodes.push('OWNKERN');
      expect(BlissSVGBuilder.define({ OWNKERN: { type: 'glyph', codeString: 'B9', kerningRules: { B313: -1 } } }).defined).toEqual(['OWNKERN']);
      expect(gapAfterFirst('OWNKERN/B313')).toBe(1);
      expect(gapAfterFirst('OWNKERN:1/B313')).toBe(1);
      expect(gapAfterFirst('OWNKERN/B10')).toBe(2);
      expect(gapAfterFirst('OWNKERN:1/B10')).toBe(2);
    });

    it('lends nothing to a name its use cannot read, so the save still reloads the same drawing', () => {
      // a character bracket in a code string is not read where the name stands
      // decorated, so the character fails there; the spacing its neighbours
      // get must match what the save reloads to
      customCodes.push('CHARBRACKETDIGIT');
      expect(BlissSVGBuilder.define({ CHARBRACKETDIGIT: { type: 'glyph', codeString: '[color=red]B9' } }).defined).toEqual(['CHARBRACKETDIGIT']);
      const builder = new BlissSVGBuilder('[color=blue]>CHARBRACKETDIGIT/B10');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each(['CHARBRACKETDIGIT:1/B10', 'CHARBRACKETDIGIT;B86/B10', '[color=blue]>CHARBRACKETDIGIT/B10'])(
      'still fails the name in %s where it stands decorated', (input) => {
        // tripwire: a shipped parser limit (backlog, "Definition-reference
        // hygiene nits", niche 2). When a decorated use learns to read a
        // character bracket in a code string, the layout lookup has to read it
        // too (firstBaseCode strips part brackets only), or the newly working
        // use draws without the name's spacing
        customCodes.push('CHARBRACKETDIGIT');
        expect(BlissSVGBuilder.define({ CHARBRACKETDIGIT: { type: 'glyph', codeString: '[color=red]B9' } }).defined).toEqual(['CHARBRACKETDIGIT']);
        expect(new BlissSVGBuilder(input).warnings.map(w => w.code)).toEqual(['UNKNOWN_CODE']);
      });
  });

  describe('when a typed glyph spelled out to anonymous parts is saved as JSON', () => {
    it('writes out the layout data a rebuild cannot re-derive, and not the identity', () => {
      // regression: the glyph once had a code, so its layout data was dropped
      // on the belief that its parts bring it back; a rebuild reads layout data
      // from a glyph's own code only, so the digit kerning was lost
      customCodes.push('DECORATEDDIGIT');
      expect(BlissSVGBuilder.define({ DECORATEDDIGIT: { type: 'glyph', codeString: 'B9:1' } }).defined).toEqual(['DECORATEDDIGIT']);
      const builder = new BlissSVGBuilder('DECORATEDDIGIT/B10');
      const glyph = builder.toJSON().groups[0].glyphs[0];
      expect(Object.keys(glyph)).toEqual(['parts', 'kerningRules']);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('adds nothing when the character it is made of has no layout data of its own', () => {
      customCodes.push('BLISSPAIR');
      expect(BlissSVGBuilder.define({ BLISSPAIR: { type: 'glyph', codeString: 'B291;C8' } }).defined).toEqual(['BLISSPAIR']);
      const glyph = new BlissSVGBuilder('BLISSPAIR/B291').toJSON().groups[0].glyphs[0];
      expect(Object.keys(glyph)).toEqual(['parts']);
    });
  });
});
