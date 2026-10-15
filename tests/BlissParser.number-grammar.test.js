import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins that every number written as text is read by one grammar, the decimal
 * notation JavaScript writes, so all its spellings agree and every number a
 * save writes reads back.
 *
 * Covers:
 * - A kerning marker and a coordinate suffix taking an exponent and a sign,
 *   on a code and on a word alias.
 * - A marker or a coordinate axis that reads as no finite number, the axis
 *   quoted as written.
 * - Positions and kerning values a save writes with an exponent reading back.
 * - Hex, binary and octal text refused wherever a number is written as text,
 *   while a number handed over as a number is unchanged.
 * - Padded and signed decimals, and `Infinity`, read as before.
 * - `define()`'s word-internal coordinate guard, and the alias expansion's own
 *   check before it appends a coordinate, seeing a signed or `Infinity` one.
 *
 * Does NOT cover:
 * - Each numeric option's own range rules, see
 *   `BlissSVGBuilder.option-value-gate.test.js`.
 * - The marker's decimal forms, see `BlissParser.kerning.test.js`.
 * - The coordinate grammar's malformed forms, see
 *   `BlissSVGBuilder.coordinate-syntax.test.js`.
 * - What the shared coordinate check still misreads (a `:` and a digit inside
 *   a bracket value, a y-only coordinate in a word): open on the backlog's
 *   definition-reference hygiene row.
 */

// Each warning as `${code} ${source}`, so a row fails on either.
const reported = (builder) => builder.warnings.map(w => `${w.code} ${w.source}`);
const codes = (builder) => builder.warnings.map(w => w.code);
const firstPart = (input) => BlissParser.parse(input).groups[0]?.glyphs[0]?.parts[0];

describe('BlissParser number grammar', () => {
  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
    }
    customCodes.length = 0;
  });

  // Defines one code and remembers it for cleanup, returning define()'s result.
  const defineTracked = (name, definition) => {
    customCodes.push(name);
    return BlissSVGBuilder.define({ [name]: definition });
  };

  describe('when a kerning marker carries an exponent', () => {
    it.each([
      ['RK:1e3', 'RK:1000', '[relative-kerning=1e3]'],
      ['RK:1E3', 'RK:1000', '[relative-kerning=1E3]'],
      ['RK:1e-3', 'RK:0.001', '[relative-kerning=1e-3]'],
      ['RK:1e+3', 'RK:1000', '[relative-kerning=1e+3]'],
      ['RK:-2.5e1', 'RK:-25', '[relative-kerning=-2.5e1]'],
      ['AK:1e1', 'AK:10', '[absolute-kerning=1e1]'],
    ])('kerns %s, saves it as %s and draws as %s does', (marker, saved, option) => {
      const builder = new BlissSVGBuilder(`B291/${marker}/B291`);

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(`B291/${saved}/B291`);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(`B291/${option}B291`).svgCode);
    });
  });

  describe('when a kerning marker cannot be a finite number', () => {
    it.each(['RK:1e400', 'RK:Infinity', 'RK:-Infinity', 'AK:1e400', 'RK:0x10', 'RK:1_000', 'RK:1e', 'RK:e3', 'RK:1e3.5'])(
      'reports %s and applies no kerning', (marker) => {
        // note: 1e400 and Infinity are numbers to the grammar; they are refused
        // because no gap can be infinite
        const builder = new BlissSVGBuilder(`B291/${marker}/B291`);

        expect(reported(builder)).toEqual([`MALFORMED_KERNING_VALUE ${marker}`]);
        expect(builder.toString()).toBe('B291/B291');
        expect(builder.svgCode).toBe(new BlissSVGBuilder('B291/B291').svgCode);
      });
  });

  describe('when a coordinate carries an exponent or a sign', () => {
    it.each([
      ['B291:1e1', 10, undefined, 'B291:10'],
      ['B291:+5', 5, undefined, 'B291:5'],
      ['B291:,1e-1', undefined, 0.1, 'B291:,0.1'],
      ['B291:-1.5e1,+2', -15, 2, 'B291:-15,2'],
      ['B291:1E2', 100, undefined, 'B291:100'],
    ])('reads %s as x=%s, y=%s and saves it as %s', (input, x, y, saved) => {
      const part = firstPart(input);
      expect(part.codeName).toBe('B291');
      expect(part.x).toBe(x);
      expect(part.y).toBe(y);

      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(saved);
    });

    it('strips an exponent coordinate from a word alias before it expands', () => {
      // pins the suffix pattern the definition lookup strips with: left on the
      // old grammar, C15_WORD:1e1 stays one unknown code instead of expanding
      defineTracked('C15_WORD', { codeString: 'H/B86' });
      const glyphs = BlissParser.parse('C15_WORD:1e1').groups[0].glyphs;

      expect(glyphs).toHaveLength(2);
      expect(glyphs[0].parts[0].codeName).toBe('H');
      expect(glyphs[0].parts[0].x).toBe(10);
      expect(glyphs[1].parts[0].codeName).toBe('B86');
    });
  });

  describe('when a coordinate axis is not finite', () => {
    it.each([
      ['B291;ZSA:1e400,0', 'B291;ZSA:,0', 'x=1e400'],
      ['B291;ZSA:Infinity,0', 'B291;ZSA:,0', 'x=Infinity'],
      ['B291;ZSA:-Infinity,0', 'B291;ZSA:,0', 'x=-Infinity'],
      ['B291;ZSA:0,1e400', 'B291;ZSA:0', 'y=1e400'],
    ])('refuses the axis of %s, saves %s and quotes %s', (input, saved, source) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.toString()).toBe(saved);
      expect(reported(builder)).toEqual([`MALFORMED_COORDINATES ${source}`]);
    });

    it('reports the axis as its option spelling does', () => {
      // pins the axis handed over as written: read as a number, the coordinate
      // quoted x=Infinity where the option quotes x=1e400
      expect(reported(new BlissSVGBuilder('B291;ZSA:1e400,0')))
        .toEqual(reported(new BlissSVGBuilder('B291;[x=1e400]>ZSA:,0')));
    });
  });

  describe('when a saved number is written with an exponent', () => {
    it.each([1e-7, 5e-7, 1e21, 0.1 + 0.2 - 0.3])('reads back a position of %s', (x) => {
      const builder = new BlissSVGBuilder('B291/B313');
      builder.glyph(1).part(0).setOptions({ x });
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toContain(String(x));

      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(reloaded.toString()).toBe(builder.toString());
    });

    it('reads back a small kerning value written as an option', () => {
      const builder = new BlissSVGBuilder('B291/[relative-kerning=0.0000001]B291');
      expect(builder.toString()).toBe('B291/RK:1e-7/B291');

      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(reloaded.toString()).toBe(builder.toString());
    });

    it('reads back a large kerning value handed over as a number', () => {
      const composition = new BlissSVGBuilder('B291').toJSON();
      composition.groups[0].glyphs.push({ parts: [{ codeName: 'B291' }], options: { relativeKerning: 1e21 } });
      const builder = new BlissSVGBuilder(composition);
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291/RK:1e+21/B291');

      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
      expect(reloaded.toString()).toBe(builder.toString());
    });
  });

  describe('when a number is written in hex, binary or octal', () => {
    it.each([
      ['[x=0x10]>B291', 'MALFORMED_COORDINATES', 'B291'],
      ['B291/[relative-kerning=0x10]B291', 'MALFORMED_KERNING_VALUE', 'B291/B291'],
      ['[stroke-width=0x1]||B291', 'INVALID_OPTION_VALUE', 'B291'],
      ['[margin=0b11]||B291', 'INVALID_OPTION_VALUE', 'B291'],
      ['[char-space=0o7]||B291/B291', 'INVALID_OPTION_VALUE', 'B291/B291'],
    ])('reports %s as %s and draws as %s does', (input, code, unaffected) => {
      const builder = new BlissSVGBuilder(input);

      expect(codes(builder)).toEqual([code]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(unaffected).svgCode);
    });

    it('reports a part position handed over as hex text', () => {
      const composition = new BlissSVGBuilder('B291').toJSON();
      composition.groups[0].glyphs[0].parts[0].x = '0x10';
      const builder = new BlissSVGBuilder(composition);

      expect(codes(builder)).toEqual(['MALFORMED_COORDINATES']);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });

    it('places a part position handed over as a number', () => {
      const composition = new BlissSVGBuilder('B291').toJSON();
      composition.groups[0].glyphs[0].parts[0].x = 16;
      const builder = new BlissSVGBuilder(composition);

      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[x=16]>B291').svgCode);
    });
  });

  describe('when a padded or signed decimal is written', () => {
    it.each(['[x= 5 ]>B291', '[x=" 5 "]>B291'])('reads the position in %s', (input) => {
      expect(new BlissSVGBuilder(input).toString()).toBe('B291:5');
    });

    it('honours a numeric option written with a plus sign', () => {
      const builder = new BlissSVGBuilder('[stroke-width=+0.8]||B291');

      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[stroke-width=0.8]||B291').svgCode);
    });

    it('kerns a marker written with a plus sign', () => {
      expect(new BlissSVGBuilder('B291/RK:+0.5/B291').svgCode)
        .toBe(new BlissSVGBuilder('B291/RK:0.5/B291').svgCode);
    });

    it('still reads Infinity as a number, out of range for a margin', () => {
      expect(reported(new BlissSVGBuilder('[margin=Infinity]||B291')))
        .toEqual(['OUT_OF_RANGE_OPTION_VALUE margin=Infinity']);
    });
  });

  describe('when a word definition holds a signed or non-finite coordinate', () => {
    it.each(['B291:+5/B291', 'B291:Infinity/B291', 'B291:5/B291'])('refuses %s as a coordinate inside a word', (codeString) => {
      const result = defineTracked('C15_SIGNED', { codeString });

      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('cannot have internal coordinates');
    });
  });

  describe('when a word starts with an alias that carries its own coordinate', () => {
    it.each(['/', '//'])('draws B291:+5 as it draws B291:5 at the start of a word joined by %s', (separator) => {
      // pins the expansion's own coordinate check on the shared grammar: blind
      // to the `+`, it appended the word's coordinate as well (B291:+5:3), which
      // nothing reads, and the character was dropped
      defineTracked('C15_AT_5', { codeString: 'B291:5' });
      defineTracked('C15_AT_PLUS_5', { codeString: 'B291:+5' });
      defineTracked('C15_WORD_5', { codeString: `[color=red]C15_AT_5${separator}B313` });
      defineTracked('C15_WORD_PLUS_5', { codeString: `[color=red]C15_AT_PLUS_5${separator}B313` });
      const plain = new BlissSVGBuilder('C15_WORD_5:3');
      const signed = new BlissSVGBuilder('C15_WORD_PLUS_5:3');

      expect(signed.warnings).toEqual([]);
      expect(signed.svgCode).toBe(plain.svgCode);
      expect(signed.toString()).toBe(plain.toString());
    });
  });
});
