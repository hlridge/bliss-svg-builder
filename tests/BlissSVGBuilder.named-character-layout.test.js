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
 * - The digit read behind a part bracket or a coordinate in the code string
 *   of a decorated typed glyph, and no digit spacing where that code string
 *   fuses the digit with a shape.
 * - A definition whose code string moves a digit keeping the kerning, and
 *   one fusing a digit, a letter or a full stop with a second base part
 *   spaced as a Bliss character, typed or bare, used bare, with a coordinate
 *   or behind a part bracket, on either side of a digit pair, each save
 *   reloading the same drawing; a typed glyph naming a digit kerned as that
 *   digit after another digit.
 * - A kerning table the definition sets winning over the digit it is made of,
 *   and applying where its code string fuses two base parts, as a word-space
 *   flag it sets does; a table listing a custom glyph kerns it by that name.
 * - An indicator named through an alias inside a definition's code string,
 *   read as the indicator it names, on either side of a digit pair.
 * - A typed glyph whose code string leads with a character bracket, read
 *   behind that bracket (the definition's own options) by a decorated use
 *   and by the layout lookup alike, each save reloading the same drawing.
 * - The JSON of a typed glyph spelled out to anonymous parts: its layout data
 *   written out, its identity not, and nothing added for a Bliss character.
 *
 * Does NOT cover:
 * - Codes written directly, see
 *   `BlissSVGBuilder.decorated-character-layout.test.js`.
 * - A kerning table a definition sets is lost by the default save, bare or
 *   decorated: definition metadata does not travel in the default string (see
 *   the custom-codes handbook page); `preserve` keeps the name.
 * - Why a name naming a letter without an outline fails where it stands
 *   decorated.
 * - How such a bracket draws and saves, see
 *   `BlissSVGBuilder.code-string-own-bracket.test.js`.
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
      expect(secondWordX('B291//B291')).toBe(16);
      expect(secondWordX(input)).toBe(12);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a part bracket', '[color=red]>B9'],
      ['a coordinate', 'B9:1'],
    ])('reads the digit behind %s in the code string of a decorated typed glyph (%s)', (_label, codeString) => {
      customCodes.push('DIGITLIKE');
      expect(BlissSVGBuilder.define({ DIGITLIKE: { type: 'glyph', codeString } }).defined).toEqual(['DIGITLIKE']);
      const builder = new BlissSVGBuilder('DIGITLIKE;B86/B10');
      expect(gapAfterFirst('DIGITLIKE;B86/B10')).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('spaces a decorated typed glyph whose code string fuses the digit with a shape as a Bliss character (B9;C8)', () => {
      // a second base part makes another character (ruled 4A, H chunk)
      customCodes.push('DIGITLIKE');
      expect(BlissSVGBuilder.define({ DIGITLIKE: { type: 'glyph', codeString: 'B9;C8' } }).defined).toEqual(['DIGITLIKE']);
      const builder = new BlissSVGBuilder('DIGITLIKE;B86/B10');
      expect(gapAfterFirst('DIGITLIKE;B86/B10')).toBe(2);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['a bare alias of B9 with a coordinate', { codeString: 'B9:1' }, 'NAMED/B10', 1],
      ['a bare alias of B9 fused with a second base part', { codeString: 'B9;B303' }, 'NAMED/B10', 2],
      ['a typed glyph of B9 fused with a second base part', { type: 'glyph', codeString: 'B9;B303' }, 'NAMED/B10', 2],
      ['a bare alias of the second digit with a coordinate', { codeString: 'B10:1' }, 'B9/NAMED', 1],
      ['a bare alias of the second digit fused with a second base part', { codeString: 'B10;B303' }, 'B9/NAMED', 2],
      ['a bare alias of a letter fused with a shape', { codeString: 'Xa;C8' }, 'NAMED/Xb', 2],
      ['a typed glyph of the second digit fused with a second base part', { type: 'glyph', codeString: 'B10;B303' }, 'B9/NAMED', 2],
      ['a typed glyph of B9 fused with a second base part, given a coordinate', { type: 'glyph', codeString: 'B9;B303' }, 'NAMED:1/B10', 2],
      ['a bare alias of B9 fused with a second base part, given a coordinate', { codeString: 'B9;B303' }, 'NAMED:1/B10', 2],
      ['a bare alias of B9 carrying an indicator, given a coordinate', { codeString: 'B9;B86' }, 'NAMED:1/B10', 1],
      ['a bare alias of the second digit carrying an indicator, given a coordinate', { codeString: 'B10;B86' }, 'B9/NAMED:1', 1],
    ])('spaces %s as the code string it stands for, and its save reloads the same drawing', (_label, definition, input, gap) => {
      // a coordinate keeps a digit's kerning on either side, a second base
      // part makes another character (ruled 4A, H chunk); a bare alias has no
      // code of its own, so the second digit is kerned by the digit it draws.
      // The rows of a typed glyph on the second digit and of an alias carrying
      // an indicator pin how a name's base parts are counted, indicators left
      // out, on either side (2026-10 hand mutants)
      customCodes.push('NAMED');
      expect(BlissSVGBuilder.define({ NAMED: definition }).defined).toEqual(['NAMED']);
      const builder = new BlissSVGBuilder(input);
      expect(gapAfterFirst(input)).toBeCloseTo(gap, 6);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('spaces a typed glyph fusing a letter without an outline with a shape as a Bliss character, reporting no letter, and both saves reload the same drawing', () => {
      // pins the stop for a typed glyph clearing the letter and the
      // external-letter flag its first part would lend (2026-10 hand mutants)
      customCodes.push('FUSEDLETTER');
      expect(BlissSVGBuilder.define({ FUSEDLETTER: { type: 'glyph', codeString: 'Xλ;C8' } }).defined).toEqual(['FUSEDLETTER']);
      const builder = new BlissSVGBuilder('FUSEDLETTER/Xb');
      expect(gapAfterFirst('FUSEDLETTER/Xb')).toBeCloseTo(2, 6);
      expect(builder.glyph(0).char).toBe('');
      expect(builder.glyph(0).isExternalGlyph).toBe(false);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('spaces a typed glyph of B9 fused with a second base part behind a part bracket as a Bliss character, and both saves reload with that gap', () => {
      // the saves write the bracket on each part, which draws the same ink in
      // two groups, so a reload is compared by its gap, not by its markup
      customCodes.push('NAMED');
      expect(BlissSVGBuilder.define({ NAMED: { type: 'glyph', codeString: 'B9;B303' } }).defined).toEqual(['NAMED']);
      const builder = new BlissSVGBuilder('[color=red]>NAMED/B10');
      expect(gapAfterFirst('[color=red]>NAMED/B10')).toBe(2);
      expect(gapAfterFirst(builder.toString())).toBe(2);
      expect(gapAfterFirst(builder.toJSON())).toBe(2);
    });

    it('kerns a typed glyph naming the second digit as that digit, and both saves reload the same drawing', () => {
      // regression (H chunk F6, owner 2026-10-12: it acts as B10): the glyph
      // was kerned by its own name, which B9's table does not list, while its
      // default save wrote B10, which the reload kerned (identical on v1.0.0)
      customCodes.push('NAMEDTEN');
      expect(BlissSVGBuilder.define({ NAMEDTEN: { type: 'glyph', codeString: 'B10' } }).defined).toEqual(['NAMEDTEN']);
      const builder = new BlissSVGBuilder('B9/NAMEDTEN');
      expect(gapAfterFirst('B9/NAMEDTEN')).toBe(gapAfterFirst('B9/B10'));
      expect(gapAfterFirst('B9/NAMEDTEN')).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('kerns a typed indicator drawing the second digit as that digit', () => {
      // pins the key read from the character's first part, whatever it is: a
      // character of one indicator has no base part to read it from
      customCodes.push('INDTEN');
      expect(BlissSVGBuilder.define({ INDTEN: { type: 'glyph', isIndicator: true, codeString: 'B10' } }).defined).toEqual(['INDTEN']);
      expect(gapAfterFirst('B9/INDTEN')).toBe(1);
    });

    it('leaves the ordinary word space before a bare alias of a full stop fused with a shape', () => {
      customCodes.push('NAMEDSTOP');
      expect(BlissSVGBuilder.define({ NAMEDSTOP: { codeString: 'B4;C8' } }).defined).toEqual(['NAMEDSTOP']);
      const builder = new BlissSVGBuilder('B291//NAMEDSTOP');
      expect(secondWordX('B291//NAMEDSTOP')).toBe(16);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['B291//TYPEDSTOP'], ['B291//TYPEDSTOP:1'],
    ])('leaves the ordinary word space before a typed glyph of a full stop fused with a shape in %s, and both saves reload the same drawing', (input) => {
      customCodes.push('TYPEDSTOP');
      expect(BlissSVGBuilder.define({ TYPEDSTOP: { type: 'glyph', codeString: 'B4;C8' } }).defined).toEqual(['TYPEDSTOP']);
      const builder = new BlissSVGBuilder(input);
      expect(secondWordX(input)).toBe(16);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it.each([
      ['OWNFUSED/B313'], ['OWNFUSED:1/B313'],
    ])('applies the kerning table a typed glyph fusing two base parts sets itself in %s, which preserve keeps and the default JSON leaves behind', (input) => {
      // pins the stop for a name fusing two base parts keeping what the
      // definition says of itself: it lends none of the digit's layout data,
      // but its own kerning table stays (2026-10 hand mutants)
      customCodes.push('OWNFUSED');
      expect(BlissSVGBuilder.define({ OWNFUSED: { type: 'glyph', codeString: 'B9;B303', kerningRules: { B313: -1 } } }).defined).toEqual(['OWNFUSED']);
      const builder = new BlissSVGBuilder(input);
      expect(gapAfterFirst(input)).toBe(1);
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
      // the default JSON spells the glyph out as its two base parts, which
      // leave the table the definition set behind, as the default string does
      expect(gapAfterFirst(builder.toJSON())).toBe(2);
    });

    it.each([
      ['B291//OWNSTOP'], ['B291//OWNSTOP:1'],
    ])('pulls in the word space before a typed glyph fusing two base parts that says it does in %s, and its preserve string and default JSON reload so', (input) => {
      // pins the same stop keeping a word-space flag the definition sets itself
      customCodes.push('OWNSTOP');
      expect(BlissSVGBuilder.define({ OWNSTOP: { type: 'glyph', codeString: 'B291;C8', shrinksPrecedingWordSpace: true } }).defined).toEqual(['OWNSTOP']);
      const builder = new BlissSVGBuilder(input);
      expect(secondWordX(input)).toBe(12);
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(builder.svgCode);
      expect(secondWordX(builder.toJSON())).toBe(12);
    });

    it.each([
      ['CARRIESIND:1/B10'], ['B9/CARRIESIND10:1'],
    ])('reads an indicator named through an alias in a code string as an indicator in %s, keeping the digit kerning', (input) => {
      // pins the count of a name's base parts resolving each part through an
      // alias chain, as the layout does (2026-10 hand mutants)
      customCodes.push('INDNAME', 'CARRIESIND', 'CARRIESIND10');
      expect(BlissSVGBuilder.define({
        INDNAME: { codeString: 'B86' },
        CARRIESIND: { codeString: 'B9;INDNAME' },
        CARRIESIND10: { codeString: 'B10;INDNAME' },
      }).defined).toEqual(['INDNAME', 'CARRIESIND', 'CARRIESIND10']);
      const builder = new BlissSVGBuilder(input);
      expect(gapAfterFirst(input)).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('kerns a typed glyph by its own name where the kerning table of the character before it lists that name', () => {
      // pins the own-name lookup ahead of the code the name draws, which the
      // table does not list here (2026-10 hand mutants)
      customCodes.push('LISTED313', 'LISTSNAME');
      expect(BlissSVGBuilder.define({
        LISTED313: { type: 'glyph', codeString: 'B313' },
        LISTSNAME: { type: 'glyph', codeString: 'B9', kerningRules: { LISTED313: -1 } },
      }).defined).toEqual(['LISTED313', 'LISTSNAME']);
      expect(gapAfterFirst('LISTSNAME/LISTED313')).toBe(1);
      expect(gapAfterFirst('LISTSNAME/B313')).toBe(2);
    });

    it('lets a kerning table the definition sets win over the digit it is made of, as the bare name does', () => {
      customCodes.push('OWNKERN');
      expect(BlissSVGBuilder.define({ OWNKERN: { type: 'glyph', codeString: 'B9', kerningRules: { B313: -1 } } }).defined).toEqual(['OWNKERN']);
      expect(gapAfterFirst('OWNKERN/B313')).toBe(1);
      expect(gapAfterFirst('OWNKERN:1/B313')).toBe(1);
      expect(gapAfterFirst('OWNKERN/B10')).toBe(2);
      expect(gapAfterFirst('OWNKERN:1/B10')).toBe(2);
    });

    it.each([
      ['a coordinate', 'CHARBRACKETDIGIT:1/B10'],
      ['a `;` part', 'CHARBRACKETDIGIT;B86/B10'],
      ['a part bracket', '[color=blue]>CHARBRACKETDIGIT/B10'],
    ])('reads the digit behind the character bracket leading the code string of a name decorated with %s (%s), and its save reloads the same drawing', (_label, input) => {
      // regression: the name failed with UNKNOWN_CODE wherever it stood
      // decorated. That bracket is the definition's own options, so the use
      // reads the digit behind it, and the layout lookup must read the same
      // digit or the working use draws without the digit's kerning
      customCodes.push('CHARBRACKETDIGIT');
      expect(BlissSVGBuilder.define({ CHARBRACKETDIGIT: { type: 'glyph', codeString: '[color=red]B9' } }).defined).toEqual(['CHARBRACKETDIGIT']);
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(gapAfterFirst(input)).toBe(1);
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
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
