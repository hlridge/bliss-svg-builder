/**
 * Pins `toString({ omitOptions: true })` where an option does not sit in a
 * bracket of the composition itself: inside a word-level (`;;`) indicator code,
 * inside a definition, or holding an empty character's head marker.
 *
 * Covers:
 * - A `;;` code's own brackets, which the composition stores as written text:
 *   the options go, the code and its position stay (`[x=2]>B81` comes back as
 *   `B81:2`), on the DSL and through `applyIndicators()` on a word.
 * - A `;;` code naming a definition that carries options: the options are part
 *   of what the code is, so the name stays, with its position, under every
 *   serializer option but a flatten without `preserve`, which spells it out
 *   with them as a part bracket; the reload draws what the original draws.
 * - An empty character that held its head marker only through its options: the
 *   marker goes with them, so a word-level indicator lands on the head that is
 *   left, flattened or not.
 * - A definition whose code string styles its parts keeping that styling,
 *   written alone (the one part it is) or naming a part (a multi-part shape in
 *   the DSL, a styled shape as an object part, a styled shape defined after
 *   the composition was built), as part brackets where a save spells it out
 *   and by the name alone under `preserve`; and a glyph object with no parts,
 *   which draws nothing and now saves as nothing.
 * - No `[` in any output of this file but a definition's own options, which a
 *   save that spells the definition out writes as part brackets.
 *
 * Does NOT cover:
 * - Options written in brackets of the composition itself, see
 *   `BlissSVGBuilder.omit-options.test.js`.
 * - The JSON form of these cases, see `BlissSVGBuilder.omit-options-json.test.js`.
 * - A custom glyph or part name whose definition carries options under
 *   `preserve` without the flag, see
 *   `BlissSVGBuilder.preserve-removed-default.test.js`.
 * - Flattening a word-level indicator that keeps its name because no other
 *   spelling stands in a `;;` list: the flatten writes it out with its
 *   definition's values, brackets included, with the flag or without it. Ruled
 *   2026-09-28 not worth special handling: what belongs to a character stays
 *   unless a save has to write it out. Without `preserve` that form also moves
 *   the indicator (pre-existing).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  OE_REDIND: { type: 'glyph', isIndicator: true, codeString: 'B81', defaultOptions: { color: 'red' } },
  OE_OFFIND: { type: 'glyph', isIndicator: true, codeString: 'B81:1', defaultOptions: { color: 'red' } },
  OE_RINGIND: { type: 'glyph', isIndicator: true, codeString: 'C2', defaultOptions: { color: 'red' } },
  OE_STYGL: { type: 'glyph', codeString: '[color=red]>B291' },
  OE_STYSH: { type: 'shape', codeString: '[color=red]>C8' },
  OE_MSHP: { type: 'shape', codeString: 'C8;[color=red]>C8' },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
});

afterAll(() => {
  for (const code of [...Object.keys(FIXTURES), 'OE_LATESH']) BlissSVGBuilder.removeDefinition(code);
});

// What the flag writes for `input`, with any other serializer options.
const withoutOptions = (input, options = {}) =>
  new BlissSVGBuilder(input).toString({ ...options, omitOptions: true });

// Every path and transform in the content group, joined, so a styled part drawn
// as a <path> of its own compares equal to the same part merged into its neighbour.
const inkOf = (svg) => [...svg.slice(svg.indexOf('class="bliss-content"')).matchAll(/ (?:d|transform)="([^"]*)"/g)]
  .map((match) => match[1])
  .join('');

const partlessStyledGlyph = () => new BlissSVGBuilder({ groups: [{ glyphs: [{ codeName: 'OE_STYGL' }] }] });
const styledShapePart = () =>
  new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'OE_STYSH' }] }] }] });

const OVERLAY_ROWS = [
  ['a colour', 'B291;;[color=red]>B81', 'B291;;B81'],
  ['a position beside a colour', 'B291;;[x=2;color=red]>B81', 'B291;;B81:2'],
  // pins the position kept when the bracket holds nothing else, a path of its
  // own: dropping the suffix there went unnoticed until these two rows
  ['a bracket holding only a position', 'B291;;[x=2]>B81', 'B291;;B81:2'],
  ['a bracket holding only a vertical position', 'B291;;[y=1]>B81', 'B291;;B81:,1'],
  ['one code of two, after the semantic strip', 'B291;;!B86;[color=red]>B81', 'B291;;!B86;B81'],
];

const DEFINED_OVERLAY_ROWS = [
  ['plain', {}, 'B291;;OE_REDIND'],
  ['preserve', { preserve: true }, 'B291;;OE_REDIND'],
  ['flattenIndicators', { flattenIndicators: true }, 'B291;[color=red]>B81'],
  ['preserve and flattenIndicators', { preserve: true, flattenIndicators: true }, 'B291;OE_REDIND'],
];

// note: `OE_STYGL` left at C23 (D2): its plain save holds the definition's
// own bracket, pinned exactly in its row
const EVERY_STRING_INPUT = [
  ...OVERLAY_ROWS.map(([, input]) => input),
  'B291;;OE_REDIND',
  '[color=red]^/B291;;B81',
];

describe('BlissSVGBuilder omit options edges', () => {
  describe('when a word-level indicator code carries its own options', () => {
    it.each(OVERLAY_ROWS)('drops %s and the reload draws the same ink', (_label, input, expected) => {
      const saved = withoutOptions(input);
      expect(saved).toBe(expected);
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(new BlissSVGBuilder(input).svgCode));
    });

    it('drops the options of a code applied to a word through applyIndicators', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.group(0).applyIndicators('[color=red]>B81');
      expect(builder.toString({ omitOptions: true })).toBe('B291;;B81');
    });
  });

  describe('when a word-level indicator code names a definition that carries options', () => {
    it.each(DEFINED_OVERLAY_ROWS)('keeps the definition\'s options under %s', (_label, options, expected) => {
      // note: a definition's options are part of what its code is, so leaving
      // options out has nothing of the definition's to take; a flatten
      // without preserve spells the code out and writes them as a part bracket
      const saved = withoutOptions('B291;;OE_REDIND', options);
      expect(saved).toBe(expected);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(new BlissSVGBuilder('B291;;OE_REDIND').svgCode);
    });

    it('keeps the name at the position written on it', () => {
      // note: the definition's own `:1` stays inside the name, under the
      // code's `:2`, which is where the overlay draws it
      const saved = withoutOptions('B291;;OE_OFFIND:2');
      expect(saved).toBe('B291;;OE_OFFIND:2');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(new BlissSVGBuilder('B291;;OE_OFFIND:2').svgCode);
    });

    it('keeps a name whose definition has no spelling a word-level list accepts, colour and all', () => {
      // control: passes before and after a definition's options became part
      // of its code; written out, OE_RINGIND would be C2, which a ;; list
      // refuses as not an indicator
      const saved = withoutOptions('B291;;OE_RINGIND');
      expect(saved).toBe('B291;;OE_RINGIND');
      expect(new BlissSVGBuilder(saved).svgCode).toContain('stroke="red"');
    });
  });

  describe('when an empty character held its head marker only through its options', () => {
    it('drops the marker with the options, so the word-level indicator lands on the head that is left', () => {
      expect(withoutOptions('[color=red]^/B291;;B81')).toBe('B291;;B81');
    });

    it('flattens the word-level indicator onto the head that is left', () => {
      // regression: flattening before the strip baked the
      // indicator onto the emptied character, `B81^/B291`
      expect(withoutOptions('[color=red]^/B291;;B81', { flattenIndicators: true })).toBe('B291;B81');
    });
  });

  describe('when a definition\'s code string styles its parts', () => {
    it('keeps the options inside a styled glyph written alone, the one part it is', () => {
      // re-pinned at C23 (D2): was "drops the options of a styled glyph
      // written alone, whose parts are the character's own" (`B291`). Written
      // alone the glyph is one part named after it, so what sits inside it is
      // the definition's, as in a part slot
      expect(withoutOptions('OE_STYGL')).toBe('[color=red]>B291');
      expect(withoutOptions('OE_STYGL', { preserve: true })).toBe('OE_STYGL');
      expect(new BlissSVGBuilder(withoutOptions('OE_STYGL')).svgCode).toBe(new BlissSVGBuilder('OE_STYGL').svgCode);
    });

    it('keeps the options inside a part named by a multi-part shape written in the DSL', () => {
      // note: what sits inside a part named by a definition is the
      // definition's, so leaving options out stops at that part
      expect(withoutOptions('B291;OE_MSHP')).toBe('B291;C8;[color=red]>C8');
      expect(withoutOptions('B291;OE_MSHP', { preserve: true })).toBe('B291;OE_MSHP');
      expect(new BlissSVGBuilder(withoutOptions('B291;OE_MSHP')).svgCode).toBe(new BlissSVGBuilder('B291;OE_MSHP').svgCode);
    });

    it('keeps the options a styled shape brings as an object part', () => {
      expect(styledShapePart().toString({ omitOptions: true })).toBe('B291;[color=red]>C8');
      expect(styledShapePart().toString({ omitOptions: true, preserve: true })).toBe('B291;OE_STYSH');
    });

    it('keeps the options of a styled shape defined after the composition was built', () => {
      // note: the save spells out the part the definition gives the bare name,
      // so the bracket is the shape's own, at the part's position
      const builder = new BlissSVGBuilder('B291;OE_LATESH:3');
      BlissSVGBuilder.define({ OE_LATESH: { type: 'shape', codeString: '[color=red]>C8' } });
      expect(builder.toString({ omitOptions: true })).toBe('B291;[color=red]>C8:3');
      expect(builder.toString({ omitOptions: true, preserve: true })).toBe('B291;OE_LATESH:3');
    });

    it('saves a glyph object with no parts as nothing, which is what it draws', () => {
      // regression: the name resolved to its definition's
      // text, so the object saved as `[color=red]>B291` while drawing no ink
      const builder = partlessStyledGlyph();
      expect(builder.svgCode).not.toMatch(/ d="/);
      expect(builder.toString()).toBe('');
      expect(builder.toString({ omitOptions: true })).toBe('');
    });
  });

  describe('when any input of this file is written without options', () => {
    it.each(EVERY_STRING_INPUT)('leaves no bracket in %s', (input) => {
      expect(withoutOptions(input)).not.toContain('[');
      expect(withoutOptions(input, { preserve: true, flattenIndicators: true })).not.toContain('[');
    });

    it('leaves no bracket in a glyph object with no parts', () => {
      expect(partlessStyledGlyph().toString({ omitOptions: true })).not.toContain('[');
      expect(partlessStyledGlyph().toString({ omitOptions: true, preserve: true })).not.toContain('[');
    });
  });
});
