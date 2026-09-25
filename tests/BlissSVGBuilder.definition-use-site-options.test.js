/**
 * Pins that a definition's `defaultOptions` cannot hold an option that belongs
 * to one use of a character: its position (`x`, `y`), its kerning
 * (`relativeKerning`, `absoluteKerning`, in either spelling) or its `key`.
 * `define()` reports one in `errors` and registers nothing; `patchDefinition()`
 * throws and changes nothing.
 *
 * A definition says what a character is. Where one use of it sits, the gap
 * before it and which element it is are said where it is used, so a default for
 * any of them had no single meaning: a kerning default applied where the
 * definition stood as a character and was saved as a misplaced bracket where it
 * stood as a part, a position default beat the coordinate written at the use
 * site and blamed the author for the clash, and a key default gave every use the
 * same identity.
 *
 * Covers:
 * - Each of the seven spellings on each define path (glyph, shape, external
 *   glyph, bare alias) and through `patchDefinition()`, named as typed, and
 *   `X` / `Y`, which the name resolution stores as `x` / `y`.
 * - A whitespace-padded spelling, which is the same key at the next boundary.
 * - What each refusal says, word for word, and that the canvas and layer
 *   refusals of the same guard still say what they said.
 * - The definitions that showed each defect, refused.
 * - What must not change: a presentation default still registers and applies,
 *   and a position, kerning or key written where a custom code is used behaves
 *   as it does on a built-in code.
 *
 * Does NOT cover:
 * - The canvas and layer refusals per key and per path, see
 *   `BlissParser.global-option-scope.test.js`.
 * - A misplaced key inside a definition's code string, see
 *   `BlissSVGBuilder.definition-scope-admission.test.js`.
 * - How written kerning values resolve against each other, see
 *   `BlissSVGBuilder.kerning-options.test.js`.
 * - How the defaults a definition may hold merge and yield, see
 *   `BlissSVGBuilder.default-options.test.js`.
 *
 * The refusal matrix exceeds the ~30-test soft cap as one it.each data table
 * (the guide's sanctioned inline-table form); split per path it would hide
 * which key a path forgot.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// `X` and `Y` are here because the option name resolution stores them as `x`
// and `y`: they are those keys in all but spelling.
const USE_SITE_KEYS = ['x', 'y', 'X', 'Y', 'relativeKerning', 'relative-kerning', 'absoluteKerning', 'absolute-kerning', 'key'];

const DEFINE_PATHS = [
  ['glyph', { type: 'glyph', codeString: 'B291' }],
  ['shape', { type: 'shape', codeString: 'HL8;VL8' }],
  ['external glyph', { type: 'externalGlyph', getPath: (x, y) => `M${x},${y}h2v8h-2z`, width: 2, char: 't' }],
  ['bare alias', { codeString: 'B291' }],
];

// One code per row, so a row that wrongly registers cannot make a later row
// read `skipped` instead of its own result.
const REFUSAL_MATRIX = DEFINE_PATHS.flatMap(([path, definition], p) =>
  USE_SITE_KEYS.map((key, k) => [key, path, definition, `USO${p}${k}`]));

const KEEP = { UCHR: { type: 'glyph', codeString: 'B291' } };

beforeAll(() => {
  const { errors } = BlissSVGBuilder.define(KEEP);
  if (errors.length) throw new Error(`fixture definitions refused: ${errors.join('; ')}`);
});

afterAll(() => {
  for (const code of Object.keys(KEEP)) BlissSVGBuilder.removeDefinition(code);
});

describe('BlissSVGBuilder definition use-site options', () => {
  describe('when a definition declares one in defaultOptions', () => {
    it.each(REFUSAL_MATRIX)('refuses %s on the %s path, naming it as typed', (key, _path, definition, code) => {
      const result = BlissSVGBuilder.define({ [code]: { ...definition, defaultOptions: { [key]: 3 } } });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`"${key}"`);
      expect(result.defined).toEqual([]);
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it.each(USE_SITE_KEYS.map((key, k) => [key, `USOP${k}`]))(
      'refuses %s through patchDefinition(), changing nothing',
      (key, code) => {
        BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } } });
        expect(() => BlissSVGBuilder.patchDefinition(code, { codeString: 'C8', defaultOptions: { [key]: 3 } }))
          .toThrow(`"${key}"`);
        expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291');
        expect(BlissSVGBuilder.getDefinition(code).defaultOptions).toEqual({ color: 'red' });
      },
    );

    it.each([
      [' x', 'the position option', 'the x option on that element', 'USOPAD0'],
      ['y ', 'the position option', 'the y option on that element', 'USOPAD1'],
      [' relativeKerning', 'the kerning option', 'in the kerningRules of the character before it', 'USOPAD2'],
      ['absolute-kerning ', 'the kerning option', 'in the kerningRules of the character before it', 'USOPAD3'],
      [' key ', 'a key identifies one element', 'on the element where the code is used', 'USOPAD4'],
    ])('refuses the padded spelling %j as the key it becomes', (key, family, advice, code) => {
      // The serializer writes a padded key into a bracket, and the option parser
      // trims it there, so ' x' IS x one save later. Refused as that key, not
      // merely as a malformed name.
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291', defaultOptions: { [key]: 3 } } });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`"${key}"`);
      expect(result.errors[0]).toContain(family);
      // pins the trimmed axis in the advice; a mutant printing the key as typed
      // advised "the  x option" and survived without this
      expect(result.errors[0]).toContain(advice);
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it.each([
      ['X', 'the x option on that element', 'USOCASE0'],
      ['Y', 'the y option on that element', 'USOCASE1'],
    ])('refuses %j as the axis it is stored as, and advises that axis', (key, advice, code) => {
      // regression: the guard read the key as typed and let X through, stored as
      // x, so a position default beat the coordinate written at the use site again
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291', defaultOptions: { [key]: 3 } } });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`the position option "${key}"`);
      expect(result.errors[0]).toContain(advice);
    });
  });

  describe('when the refusal is read', () => {
    it('sends a position to the use site, as a coordinate or an option', () => {
      const { errors } = BlissSVGBuilder.define({ USOMX: { type: 'glyph', codeString: 'B291', defaultOptions: { x: 3 } } });
      expect(errors).toEqual([
        '"USOMX": define("USOMX"): defaultOptions cannot include the position option "x"; a position says where one use of a character sits, not what the character is. Set it where the code is used instead, as a coordinate (USOMX:x,y) or the x option on that element.',
      ]);
    });

    it('names the axis that was written, from patchDefinition() too', () => {
      BlissSVGBuilder.define({ USOMY: { type: 'glyph', codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition('USOMY', { defaultOptions: { y: 3 } })).toThrow(
        'patchDefinition("USOMY"): defaultOptions cannot include the position option "y"; a position says where one use of a character sits, not what the character is. Set it where the code is used instead, as a coordinate (USOMY:x,y) or the y option on that element.',
      );
    });

    it('sends kerning to the use site, or to the kerningRules of the character before it', () => {
      // note: kerningRules adjust the gap AFTER the character that carries them,
      // keyed by the code that follows, so a pair's gap lives on its first half
      const { errors } = BlissSVGBuilder.define({ USOMK: { type: 'glyph', codeString: 'B291', defaultOptions: { 'absolute-kerning': 3 } } });
      expect(errors).toEqual([
        '"USOMK": define("USOMK"): defaultOptions cannot include the kerning option "absolute-kerning"; kerning is the gap before one use of a character, not part of what the character is. Set it where the code is used instead, with an RK:/AK: marker before it or in that character\'s options, or in the kerningRules of the character before it when the gap depends on the pair.',
      ]);
    });

    it('sends a key to the element that is meant', () => {
      const { errors } = BlissSVGBuilder.define({ USOMI: { type: 'glyph', codeString: 'B291', defaultOptions: { key: 'k1' } } });
      expect(errors).toEqual([
        '"USOMI": define("USOMI"): defaultOptions cannot include "key"; a key identifies one element, so every use of the definition would share it. Set it on the element where the code is used instead.',
      ]);
    });

    it.each([
      ['margin', 'USOMG', 'the global-only option "margin"; it configures the whole SVG and would be inert on a definition.'],
      ['content--fill', 'USOML', 'the layer option "content--fill"; it targets a layer of the whole SVG and would be inert on a definition.'],
    ])('still words the %s refusal as before', (key, code, middle) => {
      const { errors } = BlissSVGBuilder.define({ [code]: { codeString: 'B291', defaultOptions: { [key]: 2 } } });
      expect(errors).toEqual([
        `"${code}": define("${code}"): defaultOptions cannot include ${middle} Set it in the global bracket ([...]||) or the builder options instead.`,
      ]);
    });
  });

  describe('when a definition that showed a defect is declared', () => {
    it.each([
      // regression: kept in silence, then saved as B291;[relative-kerning=3]>HL8;
      // [relative-kerning=3]>VL8, whose reload reported it twice; a reloaded
      // toJSON() reported it AND saved it, and merge() of such a builder reported it
      ['a kerning default on a shape used as a part', 'CTKA', { type: 'shape', codeString: 'HL8;VL8', defaultOptions: { relativeKerning: 3 } }],
      // regression: H;CTKB saved H;[relative-kerning=3]>B291
      ['a kerning default on a bare alias', 'CTKB', { codeString: 'B291', defaultOptions: { relativeKerning: 3 } }],
      // regression: B313/DPX:2,0 drew at x=3 and reported MULTIPLE_POSITION_VALUES,
      // blaming the coordinate the author wrote
      ['a position default', 'DPX', { type: 'glyph', codeString: 'B291', defaultOptions: { x: 3 } }],
      // regression: DKY/DKY gave two elements one identity, DUPLICATE_KEY(k1)
      ['a key default', 'DKY', { type: 'glyph', codeString: 'B291', defaultOptions: { key: 'k1' } }],
    ])('refuses %s', (_, code, definition) => {
      const result = BlissSVGBuilder.define({ [code]: definition });
      expect(result.errors).toHaveLength(1);
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });
  });

  describe('when the same values are written where the code is used', () => {
    it.each([
      ['a relative kerning marker', 'B313/RK:3/'],
      ['an absolute kerning marker', 'B313/AK:1/'],
      ['a position option', 'B313/[x=2]'],
    ])('draws and saves %s before a custom code as before a built-in one', (_, prefix) => {
      const custom = new BlissSVGBuilder(`${prefix}UCHR`);
      const builtIn = new BlissSVGBuilder(`${prefix}B291`);
      expect(custom.warnings).toEqual([]);
      expect(custom.svgCode.replaceAll('UCHR', 'B291')).toBe(builtIn.svgCode);
      expect(custom.toString()).toBe(builtIn.toString());
    });

    it('draws a coordinate after a custom code as after a built-in one', () => {
      const custom = new BlissSVGBuilder('B313/UCHR:2,0');
      expect(custom.warnings).toEqual([]);
      expect(custom.svgCode.replaceAll('UCHR', 'B291')).toBe(new BlissSVGBuilder('B313/B291:2,0').svgCode);
      expect(new BlissSVGBuilder(custom.toString()).svgCode).toBe(new BlissSVGBuilder('B313/B291:2,0').svgCode);
    });

    it('gives the key to the one element written with it', () => {
      const b = new BlissSVGBuilder('B313/[key=k1]UCHR');
      expect(b.warnings).toEqual([]);
      expect(b.glyph(1).key).toBe('k1');
      expect(b.getElementByKey('k1').codeName).toBe('UCHR');
    });

    it('passes a default named like a JavaScript built-in through, as a bracket does', () => {
      // pins the own-key test: asking `in` takes an inherited name for a kerning
      // key, the defect a bracket once had with [constructor=x]||B291
      const { errors } = BlissSVGBuilder.define({
        USOBUILTIN: { type: 'glyph', codeString: 'B291', defaultOptions: { constructor: 'x' } },
      });
      expect(errors).toEqual([]);
      expect(new BlissSVGBuilder('USOBUILTIN').svgCode).toContain('constructor="x"');
    });

    it('registers and applies a presentation default', () => {
      const { errors } = BlissSVGBuilder.define({
        USOKEEP: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red', strokeWidth: 0.3, 'data-role': 'mark' } },
      });
      expect(errors).toEqual([]);
      const svg = new BlissSVGBuilder('USOKEEP').svgCode;
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="0.3"');
      expect(svg).toContain('data-role="mark"');
    });
  });
});
