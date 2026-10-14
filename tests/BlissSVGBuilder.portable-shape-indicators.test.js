/**
 * Pins the default string writing a custom indicator drawn from one plain
 * shape where it was drawn: such an indicator is stored as the shape, which
 * a reload reads as plain ink at its character's origin, so the string
 * writes the drawn position. The JSON keeps the indicator flag on the part,
 * reloads as drawn already, and is left as it was.
 *
 * Covers:
 * - A glyph flagged as an indicator drawing `C2` (also with an x anchor of
 *   its own) or `HL4`, on a character, beside another indicator on either
 *   side, before and after another character, over a base of two parts,
 *   flattened from `;;`, given through the API, and given an indicator
 *   itself: the exact default string, reloading as drawn and naming only
 *   built-in codes.
 * - The JSON of each: no position written, the flag kept, reloading as drawn.
 * - Where the shape lies outside the ink span of its character's other
 *   parts, the string written as before, its reload still drawn differently:
 *   as a plain part it moves the character's start or widens it, which no
 *   position written on it undoes (backlog: "The default string saves a
 *   custom indicator drawn from one plain shape at its character's origin",
 *   the residue it keeps).
 * - The shape leading a character of indicators with another character
 *   after it: placed, yet the next character reloads elsewhere, since the
 *   plain shape changes how far the character advances (the same residue).
 * - A compound indicator after the shape, placed while the shape stays put.
 * - The shape on a word's head that the word's `;;` codes replace: written
 *   where it shows without them, its reload still drawn differently (as a
 *   plain part the codes no longer replace it), the JSON reloading as drawn
 *   (backlog: "A word's `;;` overlay resolves against a head part a portable
 *   save spelled out", the residue its fourth case keeps); written where it
 *   shows even where it overhangs its base; two such shapes, each placed.
 * - Controls: a position the author wrote, the shape written alone, and the
 *   `;;` form's default string, the shape written on the head.
 *
 * Does NOT cover:
 * - The `;;` form's other default saves, a word-level list holding no plain
 *   shape, see `BlissSVGBuilder.portable-word-indicators.test.js`.
 * - `preserve` keeping the name, see
 *   `BlissSVGBuilder.custom-definition-serialization.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  PS_RING: { type: 'glyph', isIndicator: true, codeString: 'C2' },
  PS_RINGX: { type: 'glyph', isIndicator: true, codeString: 'C2', anchorOffsetX: 0.5 },
  PS_LINE: { type: 'glyph', isIndicator: true, codeString: 'HL4' },
  PS_WIDE: { type: 'glyph', isIndicator: true, codeString: 'HL8' },
  PS_RIGHT: { type: 'glyph', codeString: 'B291', anchorOffsetX: 4 },
  PS_BAKED: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' },
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

// Every code a DSL string names, its option brackets left out.
const codesOfString = (text) => [...text.replace(/\[[^\]]*\]>?/g, '').matchAll(/[A-Za-z]\w*/g)].map(([code]) => code);

// The codes only an instance holding their definitions can draw.
const notBuiltIn = (codes) => codes.filter((code) => BlissSVGBuilder.getDefinition(code)?.isBuiltIn !== true);

// What a builder draws whatever the drawing order: its frame and every
// subpath it strokes, sorted.
const inkOf = (builder) => [builder.svgCode.match(/viewBox="[^"]*"/)[0],
  ...[...builder.svgCode.matchAll(/ d="([^"]+)"/g)].flatMap(([, d]) => d.split(/(?=M)/)).sort()];

// The parts of a JSON that carry a position.
const positionedParts = (json) => json.groups.flatMap((group) => group.glyphs ?? [])
  .flatMap((glyph) => glyph.parts ?? [])
  .filter((part) => part.x !== undefined || part.y !== undefined);

const PLACED = [
  ['B291;PS_RING', 'B291;C2:3'],
  ['B291;PS_RINGX', 'B291;C2:3'],
  ['B291;PS_LINE', 'B291;HL4:2'],
  ['B291;PS_RING;B81', 'B291;C2:1.5;B81:4.5'],
  ['B291;B81;PS_RING', 'B291;B81:1.5;C2:4.5'],
  ['B291;PS_RING/B291', 'B291;C2:3/B291'],
  ['B291/B291;PS_RING', 'B291/B291;C2:3'],
];

describe('BlissSVGBuilder portable shape indicators', () => {
  describe('when a custom indicator drawn from one plain shape is saved', () => {
    it.each(PLACED)('saves %s as %s, which reloads as drawn', (input, saved) => {
      // regression: the string wrote the shape alone, which a reload draws as
      // plain ink at the character's origin (identical on v1.0.0)
      const builder = new BlissSVGBuilder(input);
      const string = builder.toString();
      expect(string).toBe(saved);
      expect(new BlissSVGBuilder(string).svgCode).toBe(builder.svgCode);
      expect(notBuiltIn(codesOfString(string))).toEqual([]);
    });

    it.each(PLACED.map(([input]) => input))('leaves the JSON of %s unpositioned, reloading as drawn', (input) => {
      // control: passes before C25; the JSON part keeps the flag, so its
      // reload lays the shape out as an indicator again
      const builder = new BlissSVGBuilder(input);
      const json = builder.toJSON();
      expect(positionedParts(json)).toEqual([]);
      expect(new BlissSVGBuilder(json).svgCode).toBe(builder.svgCode);
    });

    it('saves C4;C4:4;PS_RING as C4;C4:4;C2:3, inside the span of its two base parts, which reloads as drawn', () => {
      // pins the base span as the union of the base parts: the ring (3 to 5)
      // lies outside either circle alone (0 to 4, 4 to 8)
      const builder = new BlissSVGBuilder('C4;C4:4;PS_RING');
      expect(builder.toString()).toBe('C4;C4:4;C2:3');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('keeps the flag and width on the JSON part of B291;PS_RING', () => {
      // control: passes before C25
      expect(new BlissSVGBuilder('B291;PS_RING').toJSON().groups[0].glyphs[0].parts)
        .toEqual([{ codeName: 'B291' }, { codeName: 'C2', isIndicator: true, width: 2 }]);
    });

    it('flattens B291;;PS_RING to B291;C2:3, which reloads as drawn, as the flattened JSON does', () => {
      const builder = new BlissSVGBuilder('B291;;PS_RING');
      const flattened = builder.toString({ flattenIndicators: true });
      expect(flattened).toBe('B291;C2:3');
      expect(new BlissSVGBuilder(flattened).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON({ flattenIndicators: true })).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the shape is given through the API', () => {
    it.each([
      ['glyph(0).applyIndicators', (b) => b.glyph(0).applyIndicators('PS_RING')],
      ['glyph(0).addPart', (b) => b.glyph(0).addPart('PS_RING')],
    ])('saves B291 given PS_RING by %s as B291;C2:3, which reloads as drawn, as the JSON does', (_route, change) => {
      const builder = changed('B291', change);
      expect(builder.toString()).toBe('B291;C2:3');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('saves PS_RING given B81 by glyph(0).applyIndicators as C2;B81:3, which reloads as drawn, as the JSON does', () => {
      const builder = changed('PS_RING', (b) => b.glyph(0).applyIndicators('B81'));
      expect(builder.toString()).toBe('C2;B81:3');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the shape leads a character of indicators that another character follows', () => {
    it('saves PS_RING/B291 given B81 by glyph(0).applyIndicators as C2;B81:3/B291, its reload still drawn differently', () => {
      // note: placed as when alone (C2;B81:3, above), yet B291 reloads 3 units
      // further left, as it did from the string before (C2;B81/B291). The
      // builder advances past the whole character of indicators; a reload
      // reads C2 as a plain base under B81 and advances past C2 alone. Pins
      // the residue of backlog row "The default string saves a custom
      // indicator drawn from one plain shape at its character's origin"
      const builder = changed('PS_RING/B291', (b) => b.glyph(0).applyIndicators('B81'));
      expect(builder.toString()).toBe('C2;B81:3/B291');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
    });
  });

  describe('when the shape lies outside the ink span of its character\'s other parts', () => {
    it.each([
      // pins writing a placement only where a reread draws every part as
      // drawn: an unsettled guess wrote a position on B4 itself
      ['B4;PS_RING', 'B4;C2'],
      ['B4;PS_RING/B291', 'B4;C2/B291'],
      ['PS_RIGHT;PS_RING/B291', 'B291;C2/B291'],
      ['B291;PS_WIDE;B81', 'B291;HL8;B81'],
    ])('saves %s as %s, as before, its reload still drawn differently', (input, saved) => {
      // control: passes before C25. Pins the residue of backlog row "The
      // default string saves a custom indicator drawn from one plain shape at
      // its character's origin": a plain part there moves the character's
      // start or widens it, which a position written on it cannot undo
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).not.toBe(builder.svgCode);
    });
  });

  describe('when the word\'s ;; codes replace the shape on its head', () => {
    it.each([
      ['B291;PS_RING;;B81', 'B291;PS_RING;;B81', () => {}],
      ['B291;PS_RING given B81 by group(0).applyIndicators', 'B291;PS_RING', (b) => b.group(0).applyIndicators('B81')],
    ])('saves %s as B291;C2:3;;B81, the shape where it shows, its reload still drawn differently', (_label, input, change) => {
      // re-pinned (H chunk Task 5, 2026-10-12): the string wrote C2 with no
      // position; it now writes it where the character draws it without the
      // word's codes. Pins the residue of backlog row "A word's ;; overlay
      // resolves against a head part a portable save spelled out" (its fourth
      // case): the builder replaces the shape with B81, while a reload reads
      // C2 as a plain part the overlay keeps
      const builder = changed(input, change);
      expect(builder.toString()).toBe('B291;C2:3;;B81');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).not.toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('saves B291;PS_RING:1;PS_RING;;B81 as B291;C2:1;C2:4.5;;B81, each shape where it shows', () => {
      // pins every replaced shape placed, not the first only: with the word's
      // codes cleared, the reload draws both shapes where the builder does
      const builder = new BlissSVGBuilder('B291;PS_RING:1;PS_RING;;B81');
      expect(builder.toString()).toBe('B291;C2:1;C2:4.5;;B81');
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
      const reloaded = new BlissSVGBuilder(builder.toString());
      reloaded.group(0).clearIndicators();
      builder.group(0).clearIndicators();
      expect(inkOf(reloaded)).toEqual(inkOf(builder));
    });

    it('saves B1;PS_RING;;B81 as B1;C2:-1;;B81:-1, the shape where it shows though it overhangs the base', () => {
      // pins a replaced shape left out of the span guard: the builder does not
      // draw it, so it is written where it shows without the word's codes
      const builder = new BlissSVGBuilder('B1;PS_RING;;B81');
      expect(builder.toString()).toBe('B1;C2:-1;;B81:-1');
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a compound indicator follows the shape', () => {
    it('saves B291;PS_RING;PS_BAKED as B291;C2;B97:3;B99:6,0, which reloads as drawn', () => {
      // note: the shape already sits at the character's origin, where it was
      // drawn; the compound's parts are written where they were drawn
      const builder = new BlissSVGBuilder('B291;PS_RING;PS_BAKED');
      expect(builder.toString()).toBe('B291;C2;B97:3;B99:6,0');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the string already draws the shape where it was drawn, or writes a word-level shape on the head', () => {
    it.each([
      ['B291;PS_RING:1,0', 'B291;C2:1,0'],
      ['PS_RING', 'C2'],
    ])('saves %s as %s, which reloads as drawn', (input, saved) => {
      // control: passes before C25
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString()).toBe(saved);
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('writes the shape of B291;;PS_RING on the head where it was drawn, in the default string', () => {
      // re-pinned (H chunk Task 5, 2026-10-12): the string kept the name; a
      // word-level list holds no plain shape, so the shape goes to the head
      const builder = new BlissSVGBuilder('B291;;PS_RING');
      expect(builder.toString()).toBe('B291;C2:3');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });
  });
});
