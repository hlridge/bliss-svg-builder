/**
 * Pins `toString({ omitOptions: true })` where an option does not sit in a
 * bracket of the composition itself: inside a word-level (`;;`) indicator code,
 * inside a definition, or holding an empty character's head marker.
 *
 * Covers:
 * - A `;;` code's own brackets, which the composition stores as written text:
 *   the options go, the code and its position stay (`[x=2]>B81` comes back as
 *   `B81:2`), on the DSL and through `applyIndicators()` on a word.
 * - A `;;` code naming a definition that carries options: written out without
 *   them under every serializer option, at the position the definition and the
 *   code add up to; and the one name that has no spelling a `;;` list accepts,
 *   which keeps its name and its colour.
 * - An empty character that held its head marker only through its options: the
 *   marker goes with them, so a word-level indicator lands on the head that is
 *   left, flattened or not.
 * - A definition whose code string styles its parts: a styled glyph and a
 *   multi-part shape in the DSL, a styled shape as an object part, a styled
 *   shape defined after the composition was built, and a glyph object with no
 *   parts, which draws nothing and now saves as nothing.
 * - No `[` in any output of this file.
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
  ['one code of two, after the semantic strip', 'B291;;!B86;[color=red]>B81', 'B291;;!B86;B81'],
];

const DEFINED_OVERLAY_ROWS = [
  ['plain', {}, 'B291;;B81'],
  ['preserve', { preserve: true }, 'B291;;B81'],
  ['flattenIndicators', { flattenIndicators: true }, 'B291;B81'],
  ['preserve and flattenIndicators', { preserve: true, flattenIndicators: true }, 'B291;B81'],
];

const EVERY_STRING_INPUT = [
  ...OVERLAY_ROWS.map(([, input]) => input),
  'B291;;OE_REDIND',
  '[color=red]^/B291;;B81',
  'OE_STYGL',
  'B291;OE_MSHP',
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
    it.each(DEFINED_OVERLAY_ROWS)('writes the code out without them under %s', (_label, options, expected) => {
      const saved = withoutOptions('B291;;OE_REDIND', options);
      expect(saved).toBe(expected);
      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('writes the code out where the definition and the code together place it', () => {
      // pins the positions adding up on the way down: the definition's own `:1`
      // plus the code's `:2`, which is where the overlay draws it
      const saved = withoutOptions('B291;;OE_OFFIND:2');
      expect(saved).toBe('B291;;B81:3');
      expect(inkOf(new BlissSVGBuilder(saved).svgCode)).toBe(inkOf(new BlissSVGBuilder('B291;;OE_OFFIND:2').svgCode));
    });

    it('keeps a name whose definition has no spelling a word-level list accepts, colour and all', () => {
      // note: written out, OE_RINGIND would be C2, which a ;; list refuses as not
      // an indicator, so the name stays and brings its definition's colour with it
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
    it.each([
      ['a styled glyph written in the DSL', 'OE_STYGL', 'B291'],
      ['a multi-part shape written in the DSL', 'B291;OE_MSHP', 'B291;C8;C8'],
    ])('drops the options of %s', (_label, input, expected) => {
      expect(withoutOptions(input)).toBe(expected);
    });

    it('drops the options a styled shape brings as an object part', () => {
      expect(styledShapePart().toString({ omitOptions: true })).toBe('B291;C8');
    });

    it('drops the options of a styled shape defined after the composition was built', () => {
      // regression: the save copied the definition's text, bracket included
      // (`B291;[color=red]>C8:3`)
      const builder = new BlissSVGBuilder('B291;OE_LATESH:3');
      BlissSVGBuilder.define({ OE_LATESH: { type: 'shape', codeString: '[color=red]>C8' } });
      expect(builder.toString({ omitOptions: true })).toBe('B291;C8:3');
      expect(builder.toString({ omitOptions: true, preserve: true })).not.toContain('[');
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

    it.each([
      ['a glyph object with no parts', partlessStyledGlyph],
      ['a styled shape as an object part', styledShapePart],
    ])('leaves no bracket in %s', (_label, build) => {
      expect(build().toString({ omitOptions: true })).not.toContain('[');
      expect(build().toString({ omitOptions: true, preserve: true })).not.toContain('[');
    });
  });
});
