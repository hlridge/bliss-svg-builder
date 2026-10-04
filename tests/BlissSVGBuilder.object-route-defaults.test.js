/**
 * Pins a composition object naming a definition drawing what the same name
 * draws in the DSL: the definition's `defaultOptions` apply at the level the
 * DSL applies them, whichever definition it is.
 *
 * Covers:
 * - A custom glyph's defaults on an object that names it, on the one part the
 *   glyph is, as in the DSL, with and without an empty options bag; an option
 *   the object writes on the character drawing as the DSL draws it, under
 *   them, and one written on the definition's part winning over them.
 * - The saved JSON of such an object carrying the default as the DSL's does.
 * - A built-in whose definition carries values (`REFSQUARE`).
 * - A shape drawn by its own function (`getPath`), as a part, alone and named
 *   on the character too, and an option the object writes winning.
 * - A codeName that is not a defined name (bracket text) supplying nothing, and
 *   a defined name the DSL cannot read (one holding a separator) likewise.
 * - `merge()` of an object naming a custom glyph, and of a builder whose
 *   definition's part had its default overridden.
 * - A default overridden on an object-built character's definition part
 *   staying overridden through later edits.
 *
 * Does NOT cover:
 * - Saves of a glyph whose default was removed, which must not name it once the
 *   name would bring the default back, see
 *   `BlissSVGBuilder.preserve-removed-default.test.js`.
 * - An object glyph with a name and no parts, see backlog row "A glyph authored
 *   with only `codeName`".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  OR_REDB: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  OR_PRIM: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { color: 'red' } },
  'OR_SEP/X': { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for a composition object holding one glyph.
const fromGlyphObject = (glyph) => new BlissSVGBuilder({ groups: [{ glyphs: [glyph] }] });

describe('BlissSVGBuilder object route defaults', () => {
  describe('when a composition object names a custom glyph whose definition carries defaults', () => {
    it.each([
      ['with no options bag', { codeName: 'OR_REDB', parts: [{ codeName: 'B291' }] }],
      ['with an empty options bag', { codeName: 'OR_REDB', parts: [{ codeName: 'B291' }], options: {} }],
    ])('draws what the name draws in the DSL %s', (_label, glyph) => {
      // regression: `v1.0.0` drew this black
      expect(fromGlyphObject(glyph).svgCode).toBe(new BlissSVGBuilder('OR_REDB').svgCode);
    });

    it('draws an option the object writes on the character as the DSL does, under the default', () => {
      // re-pinned at C23 (D7): was "lets an option the object writes win over
      // the default". The default is the definition's part's own, which a
      // character option does not restyle; a part option does, below
      const builder = fromGlyphObject({ codeName: 'OR_REDB', parts: [{ codeName: 'B291' }], options: { color: 'blue' } });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=blue]OR_REDB').svgCode);
    });

    it('lets an option the object writes on the definition\'s part win over the default', () => {
      const builder = fromGlyphObject({ codeName: 'OR_REDB', parts: [{ codeName: 'OR_REDB', options: { color: 'blue' } }] });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=blue]>OR_REDB').svgCode);
    });

    it('saves the default on its part as the DSL does', () => {
      // re-pinned at C23 (D2): was "saves the default in the glyph's options";
      // the DSL keeps it on the one part the glyph is, and so does the object
      const builder = fromGlyphObject({ codeName: 'OR_REDB', parts: [{ codeName: 'B291' }] });
      expect(builder.toJSON().groups[0].glyphs[0]).toEqual(new BlissSVGBuilder('OR_REDB').toJSON().groups[0].glyphs[0]);
    });
  });

  describe('when a composition object names a built-in whose definition carries values', () => {
    it('draws what the DSL draws', () => {
      const builder = fromGlyphObject({ codeName: 'REFSQUARE', parts: [{ codeName: 'REFSQUARE' }] });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('REFSQUARE').svgCode);
    });
  });

  describe('when a composition object names a shape drawn by its own function', () => {
    it.each([
      ['as a part', { parts: [{ codeName: 'B291' }, { codeName: 'OR_PRIM' }] }, 'B291;OR_PRIM'],
      ['alone', { parts: [{ codeName: 'OR_PRIM' }] }, 'OR_PRIM'],
      // pins the level: the DSL puts such a shape's defaults on its part, so a
      // character named by it gets none of its own
      ['named on the character too', { codeName: 'OR_PRIM', parts: [{ codeName: 'OR_PRIM' }] }, 'OR_PRIM'],
    ])('draws what the DSL draws %s', (_label, glyph, dsl) => {
      expect(fromGlyphObject(glyph).svgCode).toBe(new BlissSVGBuilder(dsl).svgCode);
    });

    it('lets an option the object writes win over the default', () => {
      const builder = fromGlyphObject({ parts: [{ codeName: 'B291' }, { codeName: 'OR_PRIM', options: { color: 'blue' } }] });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;[color=blue]>OR_PRIM').svgCode);
    });
  });

  describe('when a composition object\'s codeName is bracket text rather than a defined name', () => {
    it('takes no option from the text', () => {
      // pins reading only a defined name: read as DSL, this text would style the character
      const builder = fromGlyphObject({ codeName: '[color=red]B291', parts: [{ codeName: 'B291' }] });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });
  });

  describe('when a composition object names a definition the DSL cannot read', () => {
    it('takes none of its defaults, as the name reads as nothing', () => {
      // note: define() accepts a name holding a separator, which the DSL splits
      // before it looks the name up; the object reads a name the way the DSL does
      const builder = fromGlyphObject({ codeName: 'OR_SEP/X', parts: [{ codeName: 'B291' }] });
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });
  });

  describe('when an object naming a custom glyph is merged in', () => {
    it('draws what merging a builder of the same name draws', () => {
      const composition = { groups: [{ glyphs: [{ codeName: 'OR_REDB', parts: [{ codeName: 'B291' }] }] }] };
      const mergedObject = new BlissSVGBuilder('B313').merge({ toJSON: () => structuredClone(composition) });
      const mergedBuilder = new BlissSVGBuilder('B313').merge(new BlissSVGBuilder('OR_REDB'));
      expect(mergedObject.svgCode).toBe(mergedBuilder.svgCode);
    });

    it('does not bring back a default the merged builder had overridden', () => {
      // re-pinned at C23 (D8): was "... had removed", with the removal on the
      // character. The default is the definition's part's own, which
      // removeOptions returns it to, so an override on that part is what the
      // merge must keep, whatever name the deep save records beside it
      const source = new BlissSVGBuilder('OR_REDB');
      source.glyph(0).part(0).setOptions({ color: 'blue' });
      const merged = new BlissSVGBuilder('B313').merge(source);
      expect(merged.svgCode).toBe(new BlissSVGBuilder('B313').merge(new BlissSVGBuilder('[color=blue]>OR_REDB')).svgCode);
    });
  });

  describe('when a default is overridden on an object-built character', () => {
    it('stays overridden through later edits', () => {
      // re-pinned at C23 (D8): was "when a default is removed from an
      // object-built character / stays removed through later edits", for the
      // reason the merge row above gives. Note: the object is built into the
      // DSL's shape where it is read, never on a rebuild, which would undo
      // the override
      const builder = fromGlyphObject({ codeName: 'OR_REDB', parts: [{ codeName: 'B291' }] });
      builder.glyph(0).part(0).setOptions({ color: 'blue' });
      builder.addGlyph('B313');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=blue]>OR_REDB/B313').svgCode);
    });
  });
});
