/**
 * Pins a typed custom glyph or shape written alone as a character holding one
 * part named after it, as a built-in is: the definition's contents sit inside
 * that part and its options on it, so they style what the definition draws and
 * nothing added beside it.
 *
 * Covers:
 * - The stored shape of a lone typed glyph (one or two parts, options from
 *   `defaultOptions` or from its code string's bracket) and of a typed shape:
 *   no options on the character, one part carrying them; one part handle.
 * - A compound indicator written alone kept whole when an indicator is
 *   applied to it, as `B98` is.
 * - An indicator added to a glyph with an anchor of its own, or wrapping a
 *   code with one (whose anchor it takes), placed the same way on every
 *   route, as `;` places it; a definition positioning its own part laid out
 *   as written.
 * - A lone custom glyph changed through its handle (an indicator applied or a
 *   part added; an indicator applied and cleared; its only part replaced)
 *   keeping or dropping its name as the DSL spelling of the result would.
 * - The saves of a lone definition: its options as part brackets by default,
 *   the name alone under `preserve`, with or without `omitOptions`; and every
 *   clear or removal, on the character or on its part, leaving them.
 * - The default JSON of a lone custom glyph: built-in codes, the look on the
 *   part.
 * - A composition object naming a custom glyph or shape built into the tree
 *   the DSL builds, appended parts kept, the key given to its contents kept on
 *   the part they become, one part per character naming the definition, and
 *   one whose parts are not the definition's contents drawn as written.
 * - A typed glyph wrapping a typed shape saved by its own name.
 *
 * Does NOT cover:
 * - Every route that adds an indicator to these definitions, see
 *   `BlissSVGBuilder.definition-is-a-part-routes.test.js`.
 * - Options written over a definition, see
 *   `BlissSVGBuilder.definition-cascade.test.js`.
 * - A change made through a part handle inside the named part, see backlog row
 *   "A part saved by its name forgets a change made inside it".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const DOTS = { 'stroke-dasharray': '0 0.999' };

const FIXTURES = {
  DP_DOT: { type: 'glyph', codeString: 'B291', defaultOptions: DOTS },
  DP_TWO: { type: 'glyph', codeString: 'B291;C8', defaultOptions: DOTS },
  DP_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: DOTS },
  DP_RED: { type: 'glyph', codeString: '[color=red]B291' },
  DP_COMPOUND: { type: 'glyph', isIndicator: true, codeString: 'B86;B97' },
  DP_ANC: { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
  DP_WRAP: { type: 'glyph', codeString: 'B138' },
  DP_NEG: { type: 'glyph', codeString: 'B291:-1,0' },
  DP_WRAPSH: { type: 'glyph', codeString: 'DP_SHAPE' },
  DP_PLAINSH: { type: 'shape', codeString: 'C8' },
  DP_WRAPPLAIN: { type: 'glyph', codeString: 'DP_PLAINSH' },
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

// The first character of `input` as the builder stores it, names and options included.
const storedCharacter = (input) => new BlissSVGBuilder(input).toJSON({ preserve: true, deep: true }).groups[0].glyphs[0];

// A composition object holding one character named `codeName` with `parts`.
const objectNaming = (codeName, parts) => ({ groups: [{ glyphs: [{ codeName, parts }] }] });

// Each sub-path's ink with the styling that reaches it, the nearest group
// winning, in document order: a look held by one named part and the same look
// written once per part compare equal, however the renderer groups the paths.
// Only the content group is read: options on the root <svg> fall outside it.
const styledInkOf = (svg) => {
  const content = svg.slice(svg.indexOf('class="bliss-content"'));
  const flat = [1, 2, 3, 4, 5, 6].reduce((text) => text.replace(/<g ([^>]*)>((?:(?!<\/?g[ >])[\s\S])*?)<\/g>/g,
    (_, attrs, inner) => inner.replaceAll('<path ', `<path ${attrs} `)), content);
  return [...flat.matchAll(/<path ([^>]*?)\/>/g)].flatMap(([, attrs]) => {
    const { d, ...look } = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const style = Object.keys(look).sort().map((key) => `${key}=${look[key]}`).join(';');
    return d.split(/(?=M)/).map((stroke) => `${stroke} ${style}`);
  });
};

describe('BlissSVGBuilder definition is a part', () => {
  describe('when a typed custom glyph stands alone', () => {
    it.each([
      ['DP_DOT', DOTS],
      ['DP_TWO', DOTS],
      ['DP_RED', { color: 'red' }],
    ])('stores %s as a character with no options holding one part named after it, which carries its options', (name, look) => {
      // regression: the options sat on the character, which styled every part
      // added later, and the definition's contents were the character's parts
      const character = storedCharacter(name);
      expect(character.codeName).toBe(name);
      expect(character.options).toBeUndefined();
      expect(character.parts.map((part) => [part.codeName, part.options])).toEqual([[name, look]]);
    });

    it('gives a lone DP_TWO one part handle, named after it', () => {
      const character = new BlissSVGBuilder('DP_TWO').glyph(0);
      expect(character.part(0).codeName).toBe('DP_TWO');
      expect(character.part(1)).toBeNull();
    });
  });

  describe('when a typed custom shape stands alone', () => {
    it('stores DP_SHAPE as a character with no options holding one part, which carries its options', () => {
      const character = storedCharacter('DP_SHAPE');
      expect(character.options).toBeUndefined();
      expect(character.parts.map((part) => part.options)).toEqual([DOTS]);
    });
  });

  describe('when an indicator is applied to a compound indicator written alone', () => {
    it('keeps DP_COMPOUND whole and appends the indicator, as its ; spelling does', () => {
      // note: a custom compound indicator is one atomic unit, as a built-in one
      // is; the orthogonality rule that decomposes one standing ON a base is
      // not this case
      const builder = changed('DP_COMPOUND', (b) => b.glyph(0).applyIndicators('B81'));
      const target = new BlissSVGBuilder('DP_COMPOUND;B81');
      expect(builder.toString({ preserve: true })).toBe('DP_COMPOUND;B81');
      expect(builder.toString()).toBe(target.toString());
      expect(builder.svgCode).toBe(target.svgCode);
    });

    it('keeps B98 whole and appends the indicator', () => {
      // control: passes before C23
      const builder = changed('B98', (b) => b.glyph(0).applyIndicators('B81'));
      expect(builder.toString({ preserve: true })).toBe('B98;B81');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B98;B81').svgCode);
    });
  });

  describe('when an indicator is added to a custom glyph with an anchor of its own', () => {
    it.each([
      ['DP_ANC', 'the ;; overlay', (base) => new BlissSVGBuilder(`${base};;B81`)],
      ['DP_ANC', 'glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B81'))],
      ['DP_ANC', 'group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B81'))],
      ['DP_WRAP', 'the ;; overlay', (base) => new BlissSVGBuilder(`${base};;B81`)],
      ['DP_WRAP', 'glyph(0).applyIndicators', (base) => changed(base, (b) => b.glyph(0).applyIndicators('B81'))],
      ['DP_WRAP', 'group(0).applyIndicators', (base) => changed(base, (b) => b.group(0).applyIndicators('B81'))],
    ])('places B81 on %s by %s where its ; spelling does', (base, _route, build) => {
      // note: a typed glyph is placed by its own anchor on every route; where
      // it sets none and draws one code it takes that code's, so DP_WRAP is
      // placed by B138's (see BlissSVGBuilder.wrapped-code-anchor.test.js)
      expect(build(base).svgCode).toBe(new BlissSVGBuilder(`${base};B81`).svgCode);
    });

    it('lays out DP_NEG, which positions its own part, as B291:-1,0', () => {
      // control: passes before C23
      expect(new BlissSVGBuilder('DP_NEG').svgCode).toBe(new BlissSVGBuilder('B291:-1,0').svgCode);
      expect(new BlissSVGBuilder('DP_NEG;;B81').svgCode).toBe(new BlissSVGBuilder('DP_NEG;B81').svgCode);
    });
  });

  describe('when a lone custom glyph is changed through its handle', () => {
    it.each([
      ['glyph(0).applyIndicators', (b) => b.glyph(0).applyIndicators('B99')],
      ['glyph(0).addPart', (b) => b.glyph(0).addPart('B99')],
    ])('keeps the name under preserve after %s, as its ; spelling does', (_route, change) => {
      // note: the definition is the character's first part, so a part added
      // beside it is a `;` delta on the name
      const builder = changed('DP_DOT', change);
      expect(builder.toString({ preserve: true })).toBe('DP_DOT;B99');
      expect(new BlissSVGBuilder('DP_DOT;B99').svgCode).toBe(builder.svgCode);
    });

    it('gives back what DP_DOT parses to when an indicator is applied and cleared', () => {
      const builder = changed('DP_DOT', (b) => {
        b.glyph(0).applyIndicators('B99');
        b.glyph(0).clearIndicators();
      });
      const plain = new BlissSVGBuilder('DP_DOT');
      expect(builder.toJSON({ deep: true })).toEqual(plain.toJSON({ deep: true }));
      expect(builder.svgCode).toBe(plain.svgCode);
      expect(builder.toString({ preserve: true })).toBe('DP_DOT');
    });

    it('draws a plain B291 once the only part of DP_DOT is replaced by B291', () => {
      // regression: the character kept the definition's look and drew a
      // dotted B291
      const builder = changed('DP_DOT', (b) => b.glyph(0).replacePart(0, 'B291'));
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(builder.toString()).toBe('B291');
      expect(builder.toString({ preserve: true })).toBe('B291');
    });
  });

  describe('when a custom definition standing alone is saved or cleared', () => {
    it.each([
      ['DP_DOT', '[stroke-dasharray=0 0.999]>B291'],
      ['DP_TWO', '[stroke-dasharray=0 0.999]>B291;[stroke-dasharray=0 0.999]>C8'],
      ['DP_SHAPE', '[stroke-dasharray=0 0.999]>C8'],
      ['DP_RED', '[color=red]>B291'],
    ])('writes %s as %s, and by its name alone under preserve', (name, spelled) => {
      const builder = new BlissSVGBuilder(name);
      expect(builder.toString()).toBe(spelled);
      expect(builder.toString({ preserve: true })).toBe(name);
      expect(builder.toString({ preserve: true, omitOptions: true })).toBe(name);
      expect(styledInkOf(new BlissSVGBuilder(spelled).svgCode)).toEqual(styledInkOf(builder.svgCode));
    });

    it('reloads DP_SHAPE from its preserve JSON as the builder draws it', () => {
      // regression: the JSON put the options on the character and the name on
      // its part, which the reload styled a second time (the typed-shape facet
      // of backlog row "An untouched character written by a name that brings
      // defaults reloads from toJSON({ preserve: true }) with its part styled
      // on its own", left to this task when C23 Task 6 closed its alias facet)
      const builder = new BlissSVGBuilder('DP_SHAPE');
      const reloaded = new BlissSVGBuilder(builder.toJSON({ preserve: true }));
      expect(reloaded.svgCode).toBe(builder.svgCode);
      // pins the reload's tree too: the JSON names the shape on its character,
      // which the DSL's tree records but does not code
      expect(reloaded.toJSON({ preserve: true, deep: true })).toEqual(builder.toJSON({ preserve: true, deep: true }));
    });

    it.each([
      ['clearing everything', (b) => b.clearAllOptions()],
      ['clearing the character', (b) => b.glyph(0).clearOptions()],
      ['removing the look from the character', (b) => b.glyph(0).removeOptions('stroke-dasharray')],
      ['clearing its part', (b) => b.glyph(0).part(0).clearOptions()],
      ['removing the look from its part', (b) => b.glyph(0).part(0).removeOptions('stroke-dasharray')],
    ])('keeps DP_DOT dotted after %s', (_label, change) => {
      // regression: a clear or removal on the character stripped the
      // definition's look, which sat there instead of on its part
      const builder = changed('DP_DOT', change);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('DP_DOT').svgCode);
      expect(builder.toString()).toBe('[stroke-dasharray=0 0.999]>B291');
      expect(builder.toString({ preserve: true })).toBe('DP_DOT');
    });

    it('publishes DP_DOT in the default JSON as built-in codes, its look on the part', () => {
      const builder = new BlissSVGBuilder('DP_DOT');
      const json = builder.toJSON();
      expect(json.groups[0].glyphs).toEqual([{ codeName: 'B291', parts: [{ codeName: 'B291', options: DOTS }] }]);
      expect(styledInkOf(new BlissSVGBuilder(json).svgCode)).toEqual(styledInkOf(builder.svgCode));
    });
  });

  describe('when a composition object names a custom glyph or shape', () => {
    it.each([
      // controls: pass before C23
      ['DP_DOT', 'its contents', [{ codeName: 'B291' }], (b) => b],
      ['DP_DOT', 'its contents and an indicator', [{ codeName: 'B291' }, { codeName: 'B86' }], (b) => b.glyph(0).applyIndicators('B86')],
      // the published JSON names the shape's character `C8`, where the DSL
      // character has no code
      ['DP_SHAPE', 'its contents', [{ codeName: 'C8' }], (b) => b],
    ])('builds what the DSL builds for %s when the parts are %s', (name, _label, parts, sameChange) => {
      const object = new BlissSVGBuilder(objectNaming(name, parts));
      const dsl = changed(name, sameChange);
      expect(object.svgCode).toBe(dsl.svgCode);
      expect(object.toJSON()).toEqual(dsl.toJSON());
      expect(object.toString()).toBe(dsl.toString());
      expect(object.toString({ preserve: true })).toBe(dsl.toString({ preserve: true }));
      // pins the stored tree itself, the shape's character without a code
      // and with the record of its name included
      expect(object.toJSON({ preserve: true, deep: true })).toEqual(dsl.toJSON({ preserve: true, deep: true }));
    });

    it('draws the parts as written when they are not the definition\'s contents', () => {
      // note: the name brings nothing to parts it does not describe
      const object = new BlissSVGBuilder(objectNaming('DP_DOT', [{ codeName: 'C8' }]));
      expect(object.svgCode).toBe(new BlissSVGBuilder('C8').svgCode);
      expect(object.toString()).toBe('C8');
      expect(object.toString({ preserve: true })).toBe('C8');
    });

    it('lets the one part the contents become answer to the key the object gave them', () => {
      // note: `key` names an element in a composition object; the comparison
      // with the definition's contents ignores it, and the part they become
      // keeps it, so getElementByKey still finds what was keyed
      const object = new BlissSVGBuilder(objectNaming('DP_DOT', [{ codeName: 'B291', options: { key: 'k1' } }]));
      expect(object.svgCode).toBe(new BlissSVGBuilder('DP_DOT').svgCode);
      expect(object.getElementByKey('k1').codeName).toBe('DP_DOT');
    });

    it('gives each character naming the same definition a part of its own', () => {
      const object = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'DP_DOT', parts: [{ codeName: 'B291' }] }, { codeName: 'DP_DOT', parts: [{ codeName: 'B291' }] }] }],
      });
      object.glyph(0).part(0).setOptions({ color: 'red' });
      expect(object.toString({ preserve: true })).toBe('[color=red]>DP_DOT/DP_DOT');
    });
  });

  describe('when a typed glyph wraps a typed shape', () => {
    it.each([
      ['DP_WRAPSH', 'DP_SHAPE, which brings options'],
      ['DP_WRAPPLAIN', 'DP_PLAINSH, which brings none'],
    ])('saves %s by its own name, not by the shape it wraps, %s', (name) => {
      // regression: the character took the shape's record of its name, so the
      // preserve save wrote the shape's (`[stroke-dasharray=0 0.999]DP_SHAPE`,
      // `DP_PLAINSH`), shipped. pins the record left out of the one part the
      // glyph is (C23 T7 hand mutant M9 survived the options row alone)
      const builder = new BlissSVGBuilder(name);
      expect(builder.toString({ preserve: true })).toBe(name);
      expect(builder.toJSON({ preserve: true }).groups[0].glyphs[0].codeName).toBe(name);
    });
  });
});
