/**
 * Pins the part methods, composition objects and saves reading an alias in a
 * part slot as the string does: as its expansion, the outer link's options
 * over the inner one's, a part bracket written where it is used over all.
 *
 * Covers:
 * - `addPart()`, `insertPart()`, `replacePart()` with an alias, and
 *   `setOptions()` and `clearOptions()` on a part named by one, drawing
 *   byte-identical to the expansion written in the string.
 * - A composition object naming an alias as a part, with and without options
 *   of its own, or naming an alias of several codes that holds one, drawing
 *   as the string does; an alias that places its code given an x of its own
 *   as text, in its options, or as text no position can be.
 * - An alias placing several codes, refused as a part through `addPart()` and
 *   a composition object as the string refuses it.
 * - Both saves of a slot holding an alias: the default spells it out in the
 *   code it draws with the merged options, `preserve` keeps the name; each
 *   string and each JSON reloading byte-identical.
 * - An alias inserted before a part, whose `preserve` save kept the part
 *   after it.
 * - An alias of a typed shape written alone reloading from its `preserve`
 *   JSON as drawn.
 *
 * Does NOT cover:
 * - What an alias in a slot draws in the string itself, its handle and its
 *   reports, see `BlissSVGBuilder.alias-in-part-slot.test.js`.
 * - The saves of an alias written alone, see
 *   `BlissSVGBuilder.alias-options-kept.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const TARGETS = {
  SR_RED: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  SR_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'red' } },
  SR_A1: { codeString: 'B291', defaultOptions: { color: 'red' } },
  SR_POS: { codeString: 'B291:1,0', defaultOptions: { color: 'red' } },
  SR_MULTI: { codeString: 'B291;C8' },
};

const ALIASES = {
  SR_PM: { codeString: 'SR_MULTI:1,0' },
  SR_AL: { codeString: 'SR_RED' },
  SR_SHB: { codeString: 'SR_SHAPE', defaultOptions: { color: 'blue' } },
  SR_A2: { codeString: 'SR_A1', defaultOptions: { color: 'blue' } },
  SR_RSA: { codeString: 'REFSQUARE', defaultOptions: { 'stroke-dasharray': '1 1' } },
  SR_ALPOS: { codeString: 'SR_POS', defaultOptions: { color: 'blue' } },
};

// An alias of several codes, one of them an alias, defined once that alias exists.
const HOLDERS = {
  SR_MC: { codeString: 'B313;SR_A2' },
};

beforeAll(() => {
  for (const fixtures of [TARGETS, ALIASES, HOLDERS]) {
    const { defined, errors } = BlissSVGBuilder.define(fixtures);
    expect(errors).toEqual([]);
    expect(defined).toEqual(Object.keys(fixtures));
  }
});

afterAll(() => {
  for (const code of [...Object.keys(HOLDERS), ...Object.keys(ALIASES), ...Object.keys(TARGETS)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

const objectWithPart = (part) => ({ groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, part] }] }] });

describe('BlissSVGBuilder alias in a part slot routes', () => {
  describe('when an alias reaches a part slot through a part method', () => {
    it.each([
      ['addPart()', 'B313', (b) => b.glyph(0).addPart('SR_A2'), 'B313;[color=blue]>B291'],
      ['insertPart() at the start', 'B313', (b) => b.glyph(0).insertPart(0, 'SR_A2'), '[color=blue]>B291;B313'],
      ['replacePart()', 'B291', (b) => b.glyph(0).replacePart(0, 'SR_A2'), '[color=blue]>B291'],
      ['setOptions() on its part', 'B313;SR_A2', (b) => b.glyph(0).part(1).setOptions({ color: 'green' }), 'B313;[color=green]>B291'],
      ['clearOptions() on its part', 'B313;[color=green]>SR_A2', (b) => b.glyph(0).part(1).clearOptions(), 'B313;[color=blue]>B291'],
    ])('draws the alias as its expansion after %s', (_label, input, change, expansion) => {
      expect(changed(input, change).svgCode).toBe(svgOf(expansion));
    });
  });

  describe('when a composition object names an alias as a part', () => {
    it.each([
      ['with nothing of its own', { codeName: 'SR_A2' }, 'B313;[color=blue]>B291'],
      ['with a colour of its own', { codeName: 'SR_A2', options: { color: 'green' } }, 'B313;[color=green]>B291'],
      ['over a typed glyph, with a colour of its own', { codeName: 'SR_AL', options: { color: 'green' } }, 'B313;[color=green]>SR_RED'],
    ])('draws the part %s as the string %s', (_label, part, expansion) => {
      expect(new BlissSVGBuilder(objectWithPart(part)).svgCode).toBe(svgOf(expansion));
    });

    it.each([
      ['written as text', { codeName: 'SR_ALPOS', x: '2' }],
      ['in its options', { codeName: 'SR_ALPOS', options: { x: 2 } }],
    ])('places an alias that places its code at its own x %s beside the links\' position', (_label, part) => {
      // pins the part's own position read, from both its channels, before the
      // links' is added: added as text, x 2 drew at 21
      const builder = new BlissSVGBuilder(objectWithPart(part));
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>B291:3,0'));
    });

    it('reports an x of its own that no position can be, drawing the part at the links\' position', () => {
      const builder = new BlissSVGBuilder(objectWithPart({ codeName: 'SR_ALPOS', x: 'abc' }));
      expect(builder.warnings.map(({ code, source }) => ({ code, source }))).toEqual([{ code: 'MALFORMED_COORDINATES', source: 'x=abc' }]);
      expect(builder.svgCode).toBe(svgOf('B313;[color=blue]>B291:1,0'));
    });

    it('draws an alias of several codes holding an alias as the string does', () => {
      // note: the object reads the holder's code string itself, a route of
      // its own, so the alias inside it is read through there too
      const object = { groups: [{ glyphs: [{ parts: [{ codeName: 'SR_MC' }] }] }] };
      expect(new BlissSVGBuilder(object).svgCode).toBe(svgOf('B313;[color=blue]>B291'));
    });
  });

  describe('when a part method or a composition object names a positioned alias of several codes', () => {
    it.each([
      ['addPart()', () => changed('B313', (b) => b.glyph(0).addPart('SR_PM'))],
      ['a composition object', () => new BlissSVGBuilder(objectWithPart({ codeName: 'SR_PM' }))],
    ])('refuses it as a part through %s, as the string refuses it', (_label, build) => {
      // regression: the link placing the codes held them under a part of its
      // own, so the part was not counted as several
      const builder = build();
      expect(builder.warnings.map(({ code, source }) => ({ code, source }))).toEqual([{ code: 'COMPOSITE_AS_PART', source: 'SR_PM' }]);
      expect(builder.svgCode).toBe(svgOf('B313;SR_PM'));
    });
  });

  describe('when a composition holding an alias in a part slot is saved', () => {
    it.each([
      ['B313;SR_A2', 'B313;[color=blue]>B291', 'B313;SR_A2'],
      ['B313;[color=green]>SR_AL', 'B313;[color=green]>B291', 'B313;[color=green]>SR_AL'],
      ['B313;SR_RSA', 'B313;[stroke-dasharray=1 1]>REFSQUARE', 'B313;SR_RSA'],
      ['B313;SR_ALPOS', 'B313;[color=blue]>B291:1,0', 'B313;SR_ALPOS'],
      // pins the name written over the one a typed shape records for itself
      ['B313;SR_SHB', 'B313;[color=blue]>C8', 'B313;SR_SHB'],
    ])('saves %s as %s by default and as %s under preserve', (input, spelled, preserved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(spelled);
      expect(builder.toString({ preserve: true })).toBe(preserved);
    });

    it.each(['B313;SR_A2', 'B313;[color=green]>SR_AL', 'B313;SR_RSA', 'B313;SR_ALPOS'])(
      'reloads %s from each string and each JSON byte-identical', (input) => {
        const builder = new BlissSVGBuilder(input);
        for (const saved of [
          builder.toString(), builder.toString({ preserve: true }),
          builder.toJSON(), builder.toJSON({ preserve: true }),
        ]) {
          expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
        }
      });

    it('keeps the part after an alias inserted before it under preserve', () => {
      // regression: the save wrote an inner link's name as the base
      // (`SR_A1;B313`), which reloads with B313 dropped as misplaced
      const builder = changed('B313', (b) => b.glyph(0).insertPart(0, 'SR_A2'));
      const saved = builder.toString({ preserve: true });
      expect(saved).toBe('[color=blue]>B291;B313');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('reloads an alias of a typed shape written alone from its preserve JSON as drawn', () => {
      // regression: the object route nested the link, so the shape's own red
      // won over the alias's blue on reload
      const builder = new BlissSVGBuilder('SR_SHB');
      expect(new BlissSVGBuilder(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });
});
