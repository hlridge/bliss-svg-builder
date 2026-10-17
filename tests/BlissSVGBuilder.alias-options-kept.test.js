/**
 * Pins what an alias's options are once they sit on the parts it expands to:
 * part of what the code is where the alias is written alone, so a clear and a
 * `preserve` save treat them as the definition's; ordinary part options where
 * it spells several parts; and a name read in a part slot saved so that it
 * reloads as drawn.
 *
 * Covers:
 * - A clear (of the part, or of everything) or a key removal on the part of an
 *   alias written alone keeping what the name gives that part: an alias, every
 *   link of a chain, and the look of the built-in an alias renames.
 * - An alias that draws several parts or characters losing its options to a
 *   clear, as written ones are lost.
 * - The `preserve` save of an alias written alone: the name alone for a chain
 *   and for an alias of `REFSQUARE`, an option of the part's own beside it in
 *   a part bracket; the `preserve` JSON of a chain reloading as drawn.
 * - A name read in a part slot that is the one part of its character, saved
 *   under `preserve` by its name alone, and in its slot where the name alone
 *   draws otherwise (an alias of several codes).
 * - A key two links set: the alias's own over the code it renames, a part
 *   bracket in the alias's code string over the alias's own.
 * - A composition object naming an alias as its character: the parts it
 *   draws get its options, under the object's own; other parts get none.
 * - A space an alias spells taking none of its options.
 *
 * Does NOT cover:
 * - Where an alias's options land and the routes that add an indicator, see
 *   `BlissSVGBuilder.alias-options-on-parts.test.js`.
 * - A part named by a definition in a `;` slot, see
 *   `BlissSVGBuilder.definition-options-kept.test.js`.
 * - An alias used in a `;` slot beside other parts, see
 *   `BlissSVGBuilder.alias-in-part-slot.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const DOTS = { 'stroke-dasharray': '0 0.999' };

const FIXTURES = {
  AK_ALIAS: { codeString: 'B291', defaultOptions: DOTS },
  AK_ALIAS2: { codeString: 'B291;C8', defaultOptions: DOTS },
  AK_WORD: { codeString: 'B291/C8', defaultOptions: DOTS },
  AK_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
  AK_A2: { codeString: 'AK_A1', defaultOptions: { 'stroke-width': 0.5 } },
  AK_BLUE: { codeString: 'AK_A1', defaultOptions: { color: 'blue' } },
  AK_RS: { codeString: 'REFSQUARE', defaultOptions: { color: 'red' } },
  AK_RSD: { codeString: 'REFSQUARE', defaultOptions: { 'stroke-dasharray': '1 1' } },
  AK_PB: { codeString: '[color=red]>B291;C8', defaultOptions: { color: 'blue' } },
  AK_SPW: { codeString: 'B291/TSP/C8', defaultOptions: { color: 'red' } },
  AK_TEXT: { codeString: 'Xα', defaultOptions: { color: 'red' } },
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

describe('BlissSVGBuilder alias options kept', () => {
  describe('when the part of an alias written alone is cleared or has a key removed', () => {
    it.each([
      ['AK_ALIAS', 'clearing everything', (b) => b.clearAllOptions()],
      // a chain is where the name alone and the name in a slot give the part
      // different options, so this row needs the clear to know the character
      // the part belongs to
      ['AK_A2', 'clearing everything', (b) => b.clearAllOptions()],
      ['AK_A2', 'clearing its part', (b) => b.glyph(0).part(0).clearOptions()],
      ['AK_A2', 'removing color from its part', (b) => b.glyph(0).part(0).removeOptions('color')],
      ['AK_RS', 'clearing its part', (b) => b.glyph(0).part(0).clearOptions()],
      ['AK_RS', 'removing stroke-dasharray from its part', (b) => b.glyph(0).part(0).removeOptions('stroke-dasharray')],
    ])('keeps what %s gives its part after %s', (input, _label, change) => {
      // note: what the name gives the part where it stands alone is part of
      // what the code is: the alias's own options, every link's, and the look
      // of the code it renames
      const builder = changed(input, change);
      const untouched = new BlissSVGBuilder(input);
      expect(builder.svgCode).toBe(untouched.svgCode);
      expect(builder.toString()).toBe(untouched.toString());
      expect(builder.toString({ preserve: true })).toBe(untouched.toString({ preserve: true }));
    });
  });

  describe('when an alias that draws several parts or characters is cleared', () => {
    it.each([
      ['AK_ALIAS2', 'B291;C8'],
      ['AK_WORD', 'B291/C8'],
    ])('takes the options off %s, leaving %s', (input, plain) => {
      // note: expanded into several parts, the alias leaves no record of itself
      // on them, so its options are theirs as written ones are: every save
      // writes them as part brackets, and a clear takes them
      const builder = changed(input, (b) => b.clearAllOptions());
      expect(builder.svgCode).toBe(new BlissSVGBuilder(plain).svgCode);
      expect(builder.toString({ preserve: true })).toBe(plain);
    });
  });

  describe('when an alias written alone is saved', () => {
    it.each([
      ['AK_A2', '[color=red;stroke-width=0.5]>B291'],
      ['AK_BLUE', '[color=blue]>B291'],
      ['AK_RS', '[color=red]>REFSQUARE'],
    ])('writes %s by its name alone under preserve, and as %s by default', (input, spelled) => {
      // regression: with its options on its part, the part was judged by what
      // the name gives a part in a `;` slot, where a link nests a part of its
      // own, so the save dropped the name
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString({ preserve: true })).toBe(input);
      expect(builder.toString()).toBe(spelled);
      expect(new BlissSVGBuilder(input).toString({ preserve: true })).toBe(input);
      expect(new BlissSVGBuilder(spelled).svgCode).toBe(builder.svgCode);
    });

    it('writes an option given to the part beside the name, in a part bracket', () => {
      const builder = changed('AK_ALIAS', (b) => b.glyph(0).part(0).setOptions({ color: 'green' }));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('[color=green]>AK_ALIAS');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('reloads a chain from its preserve JSON as the builder draws it', () => {
      // note: the JSON writes every part in a slot, which reads the chain as
      // the name written alone reads it
      const builder = new BlissSVGBuilder('AK_A2');
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when an alias read in a part slot is the one part of its character', () => {
    it('keeps ;AK_ALIAS2 in its slot under preserve', () => {
      // regression: the save wrote the name alone, which reads as the alias
      // written alone; expanded there, several parts are styled one by one
      const builder = new BlissSVGBuilder(';AK_ALIAS2');
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe(';AK_ALIAS2');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it.each([
      [';AK_BLUE', 'AK_BLUE'],
      [';AK_RSD', 'AK_RSD'],
    ])('writes %s by its name alone under preserve, as %s, which draws the same', (input, name) => {
      // re-pinned: a part slot now reads an alias as the name written alone
      // reads it, so the name alone reloads the drawing; the slot was kept
      // while a chain, or the look of the code an alias renames, resolved a
      // key the other way there
      const builder = new BlissSVGBuilder(input);
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe(name);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('writes AK_BLUE by its name alone after an override on it is cleared', () => {
      // re-pinned with the rows above: the cleared part reads as AK_BLUE alone
      const builder = changed('[color=green]>AK_BLUE', (b) => b.glyph(0).part(0).clearOptions());
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('AK_BLUE');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('writes an alias that reads alike alone by its name alone', () => {
      // control: passes before C23
      expect(new BlissSVGBuilder(';AK_ALIAS').toString({ preserve: true })).toBe('AK_ALIAS');
    });
  });

  describe('when a link of an alias written alone brings a key the alias sets too', () => {
    it('draws AK_RSD with the alias\'s dashes over the ones REFSQUARE brings', () => {
      // note: written alone, the alias's own options sit over what the code it
      // renames brings, as a part bracket written on that code would
      expect(new BlissSVGBuilder('AK_RSD').svgCode).toBe(new BlissSVGBuilder('[stroke-dasharray=1 1]>REFSQUARE').svgCode);
    });

    it('draws AK_PB with the colour its code string writes on B291, over the alias\'s own', () => {
      // note: a part bracket in the alias's code string names one part, so it
      // sits over the options the alias gives every part, as on a typed glyph
      expect(new BlissSVGBuilder('AK_PB').svgCode).toBe(new BlissSVGBuilder('[color=red]>B291;[color=blue]>C8').svgCode);
    });
  });

  describe('when a composition object names an alias as its character', () => {
    it.each([
      ['AK_A1', ['B291']],
      ['AK_ALIAS2', ['B291', 'C8']],
      // pins the object's part codes read before they are compared: the letter
      // is published as `Xα` and drawn under its routing key
      ['AK_TEXT', ['Xα']],
    ])('draws %s as the alias written alone', (name, codes) => {
      // regression: the object gave the character the options the name put on
      // a character, and an alias's now sit on the parts it draws
      const object = { groups: [{ glyphs: [{ codeName: name, parts: codes.map((codeName) => ({ codeName })) }] }] };
      expect(new BlissSVGBuilder(object).svgCode).toBe(new BlissSVGBuilder(name).svgCode);
    });

    it.each([
      ['a part of another code', { codeName: 'C8' }, 'C8'],
      ['a part moved from where the alias draws it', { codeName: 'B291', x: 2 }, 'B291:2'],
    ])('gives nothing to %s', (_label, part, plain) => {
      const object = { groups: [{ glyphs: [{ codeName: 'AK_A1', parts: [part] }] }] };
      expect(new BlissSVGBuilder(object).svgCode).toBe(new BlissSVGBuilder(plain).svgCode);
    });

    it('keeps an option the object writes on a part over the alias\'s', () => {
      const object = { groups: [{ glyphs: [{ codeName: 'AK_A1', parts: [{ codeName: 'B291', options: { color: 'blue' } }] }] }] };
      expect(new BlissSVGBuilder(object).svgCode).toBe(new BlissSVGBuilder('[color=blue]>B291').svgCode);
    });
  });

  describe('when an alias spells a space', () => {
    it('gives AK_SPW\'s options to its characters and none to the space', () => {
      // note: a space takes no option; a part bracket on one is refused
      const builder = new BlissSVGBuilder('AK_SPW');
      expect(builder.toString()).toBe('[color=red]>B291//[color=red]>C8');
      expect(builder.warnings).toEqual([]);
      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });
  });
});
