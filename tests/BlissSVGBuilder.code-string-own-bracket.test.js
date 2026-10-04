/**
 * Pins a leading character bracket in a definition's code string as the
 * definition's own options: the definition is a part, so the bracket styles
 * that part wherever the code is used, a `;` slot included.
 *
 * Covers:
 * - A typed glyph, a two-part typed glyph, a one-character bare alias and a
 *   typed shape whose code string leads with `[color=red]`, used in a `;` slot,
 *   drawing as the same bracket written as a part bracket, with no warning.
 * - The bracket winning over the definition's `defaultOptions` in a slot, as it
 *   does where the definition stands alone.
 * - The default save writing the bracket on the part it styles, reloading the
 *   same drawing.
 * - A decorated use (`NAME:1/...`) spacing as the character behind the
 *   bracket does: a letter's spacing and a digit's kerning.
 * - The bracket indistinguishable from the same options given as
 *   defaultOptions, for a typed glyph, a typed shape, a bare alias of a Bliss
 *   character, a custom glyph, a letter or an indicator, a compound
 *   indicator, and a typed glyph holding such a shape, and an empty bracket
 *   from none: drawing, warnings, both saves and the JSON in every use, a `;;`
 *   indicator included.
 * - The bracket under a part bracket written behind it in the same code
 *   string (a `;;` indicator), and over the options of a shape drawn by its
 *   own function that an alias names.
 * - A second bracket leading the code string, reported once in every use (the
 *   definition written alone, decorated, in a word, in a slot, under an
 *   alias) and dropped.
 * - A composition object naming such a definition as a part, directly or
 *   inside another definition, drawing as the DSL.
 * - Control: a word alias keeps a leading bracket on its first character.
 *
 * Does NOT cover:
 * - Which keys `define()` and `patchDefinition()` refuse in that bracket, see
 *   `BlissSVGBuilder.code-string-own-bracket-refusals.test.js`.
 * - The same definitions written alone, which store their options on the one
 *   part they are, see `BlissSVGBuilder.definition-is-a-part.test.js`.
 * - The `preserve` save of such a part, which writes the name without repeating
 *   the bracket, see `BlissSVGBuilder.definition-options-kept.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Each kind of definition whose code string can lead with a character
// bracket, with the uses its twins are compared in (`%` stands for the name).
const BASE_USES = ['%', 'B291;%', '%:1', '%;B99', '[color=blue]%', '[color=blue]>%', '%/B291'];
const INDICATOR_USES = ['%', 'B291;%', 'B291;;%'];
// The uses a doubled bracket is checked in: no `;` part after the name, which
// an alias refuses in its own way.
const BASE_DOUBLE_USES = ['%', '[color=green]%', '%/B291', 'B291;%', '[color=green]>%'];
const TWIN_KINDS = [
  ['a typed glyph', 'OB_TW_GLYPH', { type: 'glyph' }, 'B291', BASE_USES],
  ['a typed shape', 'OB_TW_SHAPE', { type: 'shape' }, 'C8', BASE_USES],
  ['a bare alias of a Bliss character', 'OB_TW_ALIAS', {}, 'B291', BASE_USES],
  ['a bare alias of a custom glyph', 'OB_TW_CUSTOM', {}, 'OB_PLAIN', BASE_USES],
  ['a bare alias of a letter', 'OB_TW_LETTER', {}, 'Xa', BASE_USES],
  ['a bare alias of an indicator', 'OB_TW_IND', {}, 'B81', INDICATOR_USES],
  ['a compound indicator', 'OB_TW_COMPOUND', { type: 'glyph', isIndicator: true }, 'B81;B86', INDICATOR_USES],
];

// Each kind twice: its options in the bracket leading its code string
// (`_B`), and the same options as defaultOptions (`_D`). Then two pairs made
// by hand: a typed glyph holding each typed shape twin, and an empty bracket
// beside no options at all.
const TWINS = {
  ...Object.fromEntries(TWIN_KINDS.flatMap(([, name, kind, body]) => [
    [`${name}_B`, { ...kind, codeString: `[color=red;stroke-width=0.5]${body}` }],
    [`${name}_D`, { ...kind, codeString: body, defaultOptions: { color: 'red', 'stroke-width': '0.5' } }],
  ])),
  OB_TW_HOLDER_B: { type: 'glyph', codeString: 'OB_TW_SHAPE_B;C8' },
  OB_TW_HOLDER_D: { type: 'glyph', codeString: 'OB_TW_SHAPE_D;C8' },
  OB_TW_EMPTY_B: { type: 'glyph', codeString: '[]B291' },
  OB_TW_EMPTY_D: { type: 'glyph', codeString: 'B291' },
};

const TWIN_ROWS = [
  ...TWIN_KINDS.map(([label, name, , , uses]) => [label, name, uses]),
  ['a typed glyph holding such a typed shape', 'OB_TW_HOLDER', BASE_USES],
  ['a typed glyph whose bracket is empty', 'OB_TW_EMPTY', BASE_USES],
];

const FIXTURES = {
  OB_RED: { type: 'glyph', codeString: '[color=red]B291' },
  OB_TWO: { type: 'glyph', codeString: '[color=red]B291;C8' },
  OB_ALIAS: { codeString: '[color=red]B291' },
  OB_SHAPE: { type: 'shape', codeString: '[color=red]C8' },
  OB_OVER: { type: 'glyph', codeString: '[color=red]B291', defaultOptions: { color: 'blue' } },
  OB_LETTER: { codeString: '[color=red]Xa' },
  OB_DIGIT: { type: 'glyph', codeString: '[color=red]B9' },
  OB_PLAIN: { type: 'glyph', codeString: 'B291' },
  OB_PLAIN2: { type: 'glyph', codeString: 'B291;C8' },
  OB_WORD: { codeString: '[color=red]B291/C8' },
  OB_NEST: { type: 'glyph', codeString: 'OB_RED;C8' },
  OB_IND_PART: { type: 'glyph', isIndicator: true, codeString: '[color=red][color=blue]>B81' },
  OB_FN: { type: 'shape', getPath: () => 'M0,0 L4,0', width: 4, height: 0, defaultOptions: { color: 'red' } },
  OB_FN_ALIAS: { codeString: '[stroke-width=0.5]OB_FN' },
  OB_DOUBLE: { type: 'glyph', codeString: '[color=red][color=blue]B291' },
  OB_DOUBLE_SHAPE: { type: 'shape', codeString: '[color=red][color=blue]C8' },
  OB_DOUBLE_ALIAS: { codeString: 'OB_DOUBLE' },
  OB_RED_ALIAS: { codeString: 'OB_RED' },
  OB_DOUBLE_IND: { type: 'glyph', isIndicator: true, codeString: '[color=red][color=blue]B81' },
  OB_RED_IND: { type: 'glyph', isIndicator: true, codeString: '[color=red]B81' },
  ...TWINS,
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// Gap in grid units between a word's first two characters, read from the
// laid-out snapshot, so it measures spacing rather than ink.
const gapAfterFirst = (input) => {
  const [first, second] = new BlissSVGBuilder(input).groups[0].children;
  return second.x - (first.x + first.width);
};

// What one use of a definition draws, warns, saves and publishes, with every
// twin's name written without its `_B` or `_D`, so the uses of two twins
// compare equal when they behave alike.
const useOf = (use, name) => {
  const builder = new BlissSVGBuilder(use.replaceAll('%', name));
  const unnamed = (text) => text.replace(/(OB_TW_[A-Z]+)_[BD]\b/g, '$1');
  return {
    use,
    warnings: builder.warnings.map((warning) => warning.code),
    saved: unnamed(builder.toString()),
    preserved: unnamed(builder.toString({ preserve: true })),
    json: unnamed(JSON.stringify(builder.toJSON())),
    svg: builder.svgCode,
  };
};

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

describe('BlissSVGBuilder code string own bracket', () => {
  describe('when a definition whose code string leads with a character bracket sits in a ; slot', () => {
    it.each([
      // regression: drew nothing, warning UNKNOWN_CODE
      ['OB_RED;B99', '[color=red]>OB_PLAIN;B99'],
      // regression: drew nothing and saved `C8;B99`, losing B291
      ['OB_TWO;B99', '[color=red]>OB_PLAIN2;B99'],
      ['B291;OB_ALIAS', 'B291;[color=red]>B291'],
      ['B291;OB_SHAPE', 'B291;[color=red]>C8'],
      // note: the bracket is the definition's own options written in its code
      // string, so it wins over its defaultOptions, as where it stands alone
      ['OB_OVER;B99', '[color=red]>OB_PLAIN;B99'],
    ])('draws %s as %s, with no warning', (input, target) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(target).svgCode);
    });

    it('draws OB_OVER alone in the bracket\'s colour', () => {
      // control: passes before C23. It keeps passing once a lone typed glyph is
      // one named part only because the bracket is read as that part's own
      // options; without that read the lone glyph draws nothing
      expect(new BlissSVGBuilder('OB_OVER').svgCode).toBe(new BlissSVGBuilder('[color=red]B291').svgCode);
    });
  });

  describe('when such a composition is saved', () => {
    it.each([
      ['OB_RED;B99', '[color=red]>B291;B99'],
      ['OB_TWO;B99', '[color=red]>B291;[color=red]>C8;B99'],
    ])('writes %s as %s, the bracket on the part it styles', (input, saved) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(styledInkOf(new BlissSVGBuilder(saved).svgCode)).toEqual(styledInkOf(builder.svgCode));
    });
  });

  describe('when a decorated use needs the layout of the character behind the bracket', () => {
    it.each([
      ['OB_LETTER:1/Xb', 'Xa:1/Xb'],
      ['OB_DIGIT:1/B10', 'B9:1/B10'],
    ])('spaces %s as %s', (input, target) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toEqual([]);
      expect(gapAfterFirst(input)).toBeCloseTo(gapAfterFirst(target), 6);
    });
  });

  describe('when the same options are given as defaultOptions instead', () => {
    it.each(TWIN_ROWS)('draws, warns, saves and publishes %s exactly as its twin with defaultOptions, in every use', (_kind, name, uses) => {
      // note: the bracket is the definition's own options, so nothing tells
      // it from defaultOptions: not the drawing, the warnings, the saves, the
      // name a preserve save keeps, or the JSON
      expect(uses.map((use) => useOf(use, `${name}_B`))).toEqual(uses.map((use) => useOf(use, `${name}_D`)));
    });
  });

  describe('when the bracket meets options from elsewhere', () => {
    it('lets the part bracket in the code string of a ;; indicator win over its own, as the ; slot does', () => {
      // Pins the merge order of a ;; indicator's own options under what its
      // code string writes on its part. Re-pinned at C23 (D2, D9): the
      // compound indicator is one part named after it on both surfaces, its
      // own colour on that part and the bracket's on the part inside, so the
      // ;; form draws as the ; slot does, the same ink and colour as the
      // bracket written alone in one more group (was byte-identical to it)
      const builder = new BlissSVGBuilder('B291;;OB_IND_PART');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;OB_IND_PART').svgCode);
      expect(styledInkOf(builder.svgCode)).toEqual(styledInkOf(new BlissSVGBuilder('B291;;[color=blue]>B81').svgCode));
    });

    it('lays an alias\'s bracket over the options of the shape it names, the shape drawn by its own function', () => {
      const builder = new BlissSVGBuilder('B291;OB_FN_ALIAS');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;[color=red;stroke-width=0.5]>OB_FN').svgCode);
    });
  });

  describe('when the code string leads with a second character bracket', () => {
    it.each([
      ['OB_DOUBLE', 'OB_RED', BASE_DOUBLE_USES],
      ['OB_DOUBLE_SHAPE', 'OB_SHAPE', BASE_DOUBLE_USES],
      ['OB_DOUBLE_ALIAS', 'OB_RED_ALIAS', BASE_DOUBLE_USES],
      ['OB_DOUBLE_IND', 'OB_RED_IND', INDICATOR_USES],
    ])('reports it once in every use of %s, which draws as %s does', (name, twin, uses) => {
      // regression: a typed glyph or shape written alone, named by an alias
      // or after `;;`, is read where its name is expanded and again where its
      // one named part is built, and both reads reported the second bracket
      for (const use of uses) {
        const builder = new BlissSVGBuilder(use.replace('%', name));
        const doubled = builder.warnings.filter((warning) => warning.code === 'MULTIPLE_OPTION_BRACKETS');
        expect(doubled.map((warning) => warning.source)).toEqual(['[color=blue]']);
        expect(styledInkOf(builder.svgCode)).toEqual(styledInkOf(new BlissSVGBuilder(use.replace('%', twin)).svgCode));
      }
    });
  });

  describe('when a composition object names such a definition as a part', () => {
    it.each([
      ['OB_RED;B99', [{ codeName: 'OB_RED' }, { codeName: 'B99' }]],
      ['B291;OB_NEST', [{ codeName: 'B291' }, { codeName: 'OB_NEST' }]],
    ])('draws as the DSL %s does', (dsl, parts) => {
      const builder = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts }] }] });
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(dsl).svgCode);
    });
  });

  describe('when a word alias leads with a character bracket', () => {
    it('keeps the bracket on its first character, as the written form does', () => {
      // control: passes before C23
      const builder = new BlissSVGBuilder('OB_WORD');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=red]B291/C8').svgCode);
      expect(builder.toString()).toBe('[color=red]B291/C8');
    });
  });
});
