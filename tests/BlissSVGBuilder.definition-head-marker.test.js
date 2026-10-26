import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a head marker (`^`) in a typed glyph's or shape's code string is
 * the definition's head designation and nothing more: the definition draws
 * what its code string draws without the marker, alone, in a word and as a
 * part, and the marker acts on a word's head as the head-marker contract
 * says a definition's marker does.
 *
 * Covers:
 * - Each spelling (`B291^`, a bracket before it, a marker after a second
 *   part or a coordinate, a shape, a code the head scan passes over) drawn
 *   alone as the code string written in place, with no warning, saved with
 *   the marker and read back from every save to the same drawing.
 * - In a word with `;;` indicators: drawn as the same definition without the
 *   marker; the marker designates the head where the definition heads the
 *   word and stays dormant behind another character, as a bare alias of the
 *   same code string does.
 * - A marker before the code string's first indicator: warned once, as the
 *   same code string written in place; as a part, dormant like any marker.
 * - As a part, nested in another glyph, and a bare alias of a marked code in
 *   a part slot: drawn as the code it names, with no warning.
 * - A part bracket after the code string's first part, kept where the marker
 *   is left out.
 * - Layout and anchor data read through the marker under a decoration: a
 *   letter's spacing, a digit's kerning, a full stop's word space, an anchor.
 * - A `^` inside an option value, which is not a head marker.
 *
 * Does NOT cover:
 * - A marker written where the code is used, see
 *   `BlissParser.head-marker-contract.test.js`,
 *   `BlissParser.head-marker-matrix.test.js` and
 *   `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - define() accepting a marked code string, see
 *   `BlissSVGBuilder.define-readable-code-string.test.js`.
 * - A caret before a `;` inside a part bracket of the code string
 *   (`B291;[title=a^;color=red]>B313`): unobservable while a definition's
 *   part bracket is split at its `;` (backlog); the `it.todo` below is the
 *   tripwire.
 */

// Each marked definition beside the same definition without its marker.
const FIXTURES = {
  HM_B291: { type: 'glyph', codeString: 'B291^' },
  HM_RED: { type: 'glyph', codeString: '[color=red]B291^' },
  HM_PARTS: { type: 'glyph', codeString: 'B291;B313^' },
  HM_PLACED: { type: 'glyph', codeString: 'B291:1,0^' },
  HM_SHAPE: { type: 'shape', codeString: 'HL8^' },
  HM_SKIPPED: { type: 'glyph', codeString: 'B937^' },
  UN_B291: { type: 'glyph', codeString: 'B291' },
  UN_RED: { type: 'glyph', codeString: '[color=red]B291' },
  UN_PARTS: { type: 'glyph', codeString: 'B291;B313' },
  UN_PLACED: { type: 'glyph', codeString: 'B291:1,0' },
  UN_SHAPE: { type: 'shape', codeString: 'HL8' },
  UN_SKIPPED: { type: 'glyph', codeString: 'B937' },
  HM_EARLY: { type: 'glyph', codeString: 'B291^;B313' },
  HM_NESTED: { type: 'glyph', codeString: 'B313;HM_B291' },
  ALIAS_HM: { codeString: 'B291^' },
  HM_DIGIT: { type: 'glyph', codeString: 'B9^' },
  HM_STOP: { type: 'glyph', codeString: 'B4^' },
  HM_ANCHORED: { type: 'glyph', codeString: 'B119^' },
  HM_CARET_VALUE: { type: 'glyph', codeString: '[title=a^;color=red]B291' },
  HM_PART_BRACKET: { type: 'glyph', codeString: 'B291;[color=red]>B313^' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of [...Object.keys(FIXTURES), 'HM_LETTER']) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;
const warningCodesOf = (input) => new BlissSVGBuilder(input).warnings.map((w) => w.code);

// Whether each save of the input, default and preserve, string and JSON,
// reloads to the drawing it was saved from.
const reloadsOf = (input) => {
  const builder = new BlissSVGBuilder(input);
  const drawn = builder.svgCode;
  return {
    string: new BlissSVGBuilder(builder.toString()).svgCode === drawn,
    json: new BlissSVGBuilder(builder.toJSON()).svgCode === drawn,
    preserveString: new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode === drawn,
    preserveJson: new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode === drawn,
  };
};
const EVERY_SAVE = { string: true, json: true, preserveString: true, preserveJson: true };

const MARKED = [
  ['HM_B291', 'B291^', 'UN_B291'],
  ['HM_RED', '[color=red]B291^', 'UN_RED'],
  ['HM_PARTS', 'B291;B313^', 'UN_PARTS'],
  ['HM_PLACED', 'B291:1,0^', 'UN_PLACED'],
  ['HM_SHAPE', 'HL8^', 'UN_SHAPE'],
  ['HM_SKIPPED', 'B937^', 'UN_SKIPPED'],
];

describe('BlissSVGBuilder definition head marker', () => {
  // regression: each of these drew nothing (UNKNOWN_CODE) once a lone custom
  // glyph was stored as one part (2026-10-04); 1.0.0 drew them
  describe('when a definition whose code string holds a head marker stands alone', () => {
    it.each(MARKED)('draws %s as its code string %s written in place, with no warning', (name, codeString) => {
      expect(svgOf(name)).toBe(svgOf(codeString));
      expect(warningCodesOf(name)).toEqual([]);
    });

    it.each(MARKED)('reads every save of %s back to the same drawing', (name) => {
      expect(reloadsOf(name)).toEqual(EVERY_SAVE);
    });

    it.each([
      ['HM_B291', 'B291^'],
      ['HM_PARTS', 'B291;B313^'],
      ['HM_PLACED', 'B291:1,0^'],
      ['HM_SHAPE', 'HL8^'],
      ['HM_SKIPPED', 'B937^'],
    ])('saves %s as %s, the designation written out', (name, saved) => {
      expect(new BlissSVGBuilder(name).toString()).toBe(saved);
    });
  });

  describe('when a definition whose code string holds a head marker is in a word with word-level indicators', () => {
    it.each(MARKED)('draws %s at the head as the definition without its marker draws there', (name, _, unmarked) => {
      expect(svgOf(`${name}/B313;;B81`)).toBe(svgOf(`${unmarked}/B313;;B81`));
      expect(warningCodesOf(`${name}/B313;;B81`)).toEqual([]);
      expect(reloadsOf(`${name}/B313;;B81`)).toEqual(EVERY_SAVE);
    });

    it.each(MARKED)('draws %s after another character as the definition without its marker draws there', (name, _, unmarked) => {
      expect(svgOf(`B313/${name};;B81`)).toBe(svgOf(`B313/${unmarked};;B81`));
      expect(warningCodesOf(`B313/${name};;B81`)).toEqual([]);
      expect(reloadsOf(`B313/${name};;B81`)).toEqual(EVERY_SAVE);
    });

    it('marks the head where the marked definition heads the word, as a bare alias of the same code string does', () => {
      expect(new BlissSVGBuilder('HM_B291/B313;;B81').toString()).toBe('B291^/B313;;B81');
      expect(svgOf('HM_B291/B313;;B81')).toBe(svgOf('ALIAS_HM/B313;;B81'));
    });

    it('keeps the indicator on the character the head scan stops at before the marked definition', () => {
      // note: a definition's own marker stays dormant where the head scan
      // stops at a character before it, here B313 (the head-marker contract)
      expect(new BlissSVGBuilder('B313/HM_B291;;B81').toString()).toBe('B313/B291;;B81');
      expect(svgOf('B313/HM_B291;;B81')).toBe(svgOf('B313/ALIAS_HM;;B81'));
    });

    it('heads the word with a marked definition of a code the head scan passes over', () => {
      expect(new BlissSVGBuilder('HM_SKIPPED/B313;;B81').toString()).toBe('B937^/B313;;B81');
      expect(svgOf('HM_SKIPPED/B313;;B81')).toBe(svgOf('B937^/B313;;B81'));
    });
  });

  describe('when the head marker stands before the first indicator of the code string', () => {
    it('warns once that the marker is misplaced, as the code string written in place does', () => {
      expect(warningCodesOf('HM_EARLY')).toEqual(['MISPLACED_HEAD_MARKER']);
      expect(warningCodesOf('HM_EARLY')).toEqual(warningCodesOf('B291^;B313'));
    });

    it('draws the code string without the marker', () => {
      expect(svgOf('HM_EARLY')).toBe(svgOf('B291;B313'));
      expect(new BlissSVGBuilder('HM_EARLY').toString()).toBe('B291;B313');
    });
  });

  describe('when a definition whose code string holds a head marker is a part', () => {
    it.each([
      ['B313;HM_B291', 'B313;B291'],
      ['HM_B291;B81', 'B291;B81'],
      ['B313;HM_PARTS', 'B313;B291;B313'],
      ['B313;HM_PLACED', 'B313;B291:1,0'],
      ['B313;HM_SHAPE', 'B313;HL8'],
      ['B313;HM_RED', 'B313;UN_RED'],
      ['HM_NESTED', 'B313;B291'],
      ['B313;ALIAS_HM', 'B313;B291'],
      // note: the misplaced marker is dormant here, as a well-placed one is;
      // it is reported where a word is read (above)
      ['B313;HM_EARLY', 'B313;B291;B313'],
    ])('draws %s as %s, with no warning', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(warningCodesOf(input)).toEqual([]);
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });

    it.each([
      ['B313;HM_B291', 'B313;B291'],
      ['HM_B291;B81', 'B291;B81'],
      ['B313;ALIAS_HM', 'B313;B291'],
    ])('saves %s as %s, with no marker on the part', (input, saved) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(saved);
    });
  });

  describe('when the code string holds a part bracket after its first part', () => {
    it.each([
      ['HM_PART_BRACKET', 'B291;[color=red]>B313^'],
      ['B313;HM_PART_BRACKET', 'B313;B291;[color=red]>B313'],
    ])('keeps the bracket where the marker is left out: draws %s as %s', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(warningCodesOf(input)).toEqual([]);
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });
  });

  describe('when a decorated definition takes layout or anchor data through its head marker', () => {
    it.each([
      ['a digit kerned beside a digit', 'HM_DIGIT;B86/B10', 'B9;B86/B10'],
      ['a full stop after a space', 'B291//HM_STOP;B86', 'B291//B4;B86'],
      ['an indicator on a character with an anchor of its own', 'HM_ANCHORED;B81', 'B119;B81'],
    ])('places %s as its code: %s draws as %s', (_, input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
      expect(warningCodesOf(input)).toEqual([]);
      expect(reloadsOf(input)).toEqual(EVERY_SAVE);
    });

    it('spaces a head-marked letter under an indicator as the letter', () => {
      const { errors } = BlissSVGBuilder.define({ HM_LETTER: { type: 'glyph', codeString: 'Xa^' } });
      expect(errors).toEqual([]);
      expect(svgOf('HM_LETTER;B86/Xb')).toBe(svgOf('Xa;B86/Xb'));
      expect(reloadsOf('HM_LETTER;B86/Xb')).toEqual(EVERY_SAVE);
    });
  });

  describe('when an option value in the code string holds a caret', () => {
    it('keeps the caret in the value and reads no head marker', () => {
      const builder = new BlissSVGBuilder('HM_CARET_VALUE');
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('[title=a^;color=red]>B291');
      expect(reloadsOf('HM_CARET_VALUE')).toEqual(EVERY_SAVE);
    });

    // tripwire: the head-marker strip keeps a bracket whole, which no input
    // reaches until a definition's part bracket is read whole (backlog, "A
    // definition whose part bracket holds two keys is split at the bracket's `;`")
    it.todo('keeps a caret before a `;` inside a part bracket of the code string in its value');
  });
});
