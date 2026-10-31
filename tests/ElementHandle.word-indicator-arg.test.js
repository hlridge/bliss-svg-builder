/**
 * Pins the part and character methods' reading of a `;;` written outside an
 * option bracket: the separator of a word's indicator list, which neither a
 * part nor a character can carry, so the call throws and leaves the builder
 * untouched wherever the `;;` stands, including first in the code.
 *
 * Covers:
 * - a `;;` with no character before it (`;;B81`, `;;`, `;;B81;B86`,
 *   `/;;B81`, and a part's `;;[color=red]>B81` or a character's
 *   `;;B81/B291`), which a string reads as empty parts: one message on every
 *   part surface and every character surface, no warning left behind, on an
 *   empty builder too
 * - a single `;` with no character before it stays an empty part, as a
 *   string reads it, and a character of two parts stays accepted
 * - a `;;` inside an option bracket or a text block is not a separator
 * - inputs refused or kept before keep their outcome: `;;;B81` produces no
 *   glyphs in the part methods, a `;;` is named before a head marker, and a
 *   whole word keeps the WORD_AS_PART route
 *
 * Does NOT cover:
 * - a `;;` after a character (`B97;;B81`, `B97;;`) and a malformed `;;`
 *   list (`B291;;B81;;B86`, which fails as a word), see
 *   ElementHandle.part-mutation-args.test.js and
 *   ElementHandle.glyph-mutation-args.test.js
 * - a string's own reading of a `;;` with no character before it, unchanged
 *   (backlog row "A word that starts with `;;`...")
 * - a `|` outside an option bracket, see ElementHandle.part-arg-pipe.test.js
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const stateOf = (b) => JSON.stringify(b.toJSON());

const PART_SURFACES = [
  { label: 'glyph(0).addPart', invoke: (b, code) => b.group(0).glyph(0).addPart(code) },
  { label: 'glyph(0).insertPart(0, ...)', invoke: (b, code) => b.group(0).glyph(0).insertPart(0, code) },
  { label: 'glyph(0).replacePart(0, ...)', invoke: (b, code) => b.group(0).glyph(0).replacePart(0, code) },
  { label: 'part(0).replace', invoke: (b, code) => b.group(0).glyph(0).part(0).replace(code) },
  { label: 'group(0).addPart', invoke: (b, code) => b.group(0).addPart(code) },
  { label: 'builder.addPart', invoke: (b, code) => b.addPart(code) },
];
const GLYPH_SURFACES = [
  { label: 'group(0).addGlyph', invoke: (b, code) => b.group(0).addGlyph(code) },
  { label: 'group(0).insertGlyph(0, ...)', invoke: (b, code) => b.group(0).insertGlyph(0, code) },
  { label: 'group(0).replaceGlyph(0, ...)', invoke: (b, code) => b.group(0).replaceGlyph(0, code) },
  { label: 'glyph(0).replace', invoke: (b, code) => b.group(0).glyph(0).replace(code) },
  { label: 'builder.addGlyph', invoke: (b, code) => b.addGlyph(code) },
];

const PART_CODES = [';;B81', ';;', ';;B81;B86', '/;;B81', ';;[color=red]>B81'];
const GLYPH_CODES = [';;B81', ';;', ';;B81;B86', '/;;B81', ';;B81/B291'];
const EACH_PART_SURFACE_AND_CODE = PART_SURFACES.flatMap((s) => PART_CODES.map((code) => [s.label, code, s]));
const EACH_GLYPH_SURFACE_AND_CODE = GLYPH_SURFACES.flatMap((s) => GLYPH_CODES.map((code) => [s.label, code, s]));

const WORD_INDICATOR_MESSAGE = (code) => `Code "${code}" carries a word-level indicator list (";;"). `
  + 'Use applyIndicators() on the word, or addGroup() for word content';

describe('ElementHandle word indicator arg', () => {
  describe('when a part\'s code writes ;; with no character before it', () => {
    it.each(EACH_PART_SURFACE_AND_CODE)('%s throws for %s and leaves the builder untouched', (label, code, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, code)).toThrow(`Code "${code}" carries a word-level indicator list (";;")`);
      expect(stateOf(b)).toBe(before);
      expect(b.warnings).toEqual([]);
    });

    it('names the word-level alternatives', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).addPart(';;B81')).toThrow(WORD_INDICATOR_MESSAGE(';;B81'));
    });

    it('throws on an empty builder and leaves it empty', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart(';;B81')).toThrow('carries a word-level indicator list');
      expect(b.toJSON().groups).toEqual([]);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when a character\'s code writes ;; with no character before it', () => {
    it.each(EACH_GLYPH_SURFACE_AND_CODE)('%s throws for %s and leaves the builder untouched', (label, code, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, code)).toThrow(`Code "${code}" carries a word-level indicator list (";;")`);
      expect(stateOf(b)).toBe(before);
      expect(b.warnings).toEqual([]);
    });

    it('names the word-level alternatives', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).addGlyph(';;B81')).toThrow(WORD_INDICATOR_MESSAGE(';;B81'));
    });

    it('throws on an empty builder and leaves it empty', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addGlyph(';;B81')).toThrow('carries a word-level indicator list');
      expect(b.toJSON().groups).toEqual([]);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the code writes a single ; with no character before it', () => {
    // note: a lone `;` is the part separator with an empty part before it,
    // which a string drops (`;B81` saves `B81`); only `;;` belongs to a word
    it('adds the part as a string reads it', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart(';B81');
      expect(b.toString()).toBe('B291;B81');
      expect(b.warnings).toEqual([]);
    });

    it('adds the character as a string reads it', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph(';B81');
      expect(b.toString()).toBe('B291/B81');
      expect(b.warnings).toEqual([]);
    });

    it('keeps a character of two parts', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('B313;B81');
      expect(b.toString()).toBe('B291/B313;B81');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the ;; stands inside an option bracket or a text block', () => {
    it('keeps a quoted ;; as a part option\'s text', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('[data-note="a;;b"]>B313');
      expect(b.toString()).toBe('B291;[data-note="a;;b"]>B313');
      expect(b.warnings).toEqual([]);
    });

    it('keeps a quoted ;; as a character option\'s text', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('[data-note="a;;b"]B313');
      expect(b.toString()).toBe('B291/[data-note="a;;b"]B313');
      expect(b.warnings).toEqual([]);
    });

    it('reads a ;; inside a part\'s text block as the block\'s text', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('B313{a;;b}');
      expect(b.toString()).toBe('B291;B313');
      expect(b.warnings.map((w) => [w.code, w.source])).toEqual([['UNSUPPORTED_TEXT_BLOCKS', 'B313{a;;b}']]);
    });

    it('reads a ;; inside a character\'s text block as the block\'s text', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('B313{a;;b}');
      expect(b.toString()).toBe('B291/B313');
      expect(b.warnings.map((w) => [w.code, w.source])).toEqual([['UNSUPPORTED_TEXT_BLOCKS', 'B313{a;;b}']]);
    });
  });

  describe('when the part\'s code holds no character at all', () => {
    it('keeps the no-glyphs message for an indicator list after an empty part', () => {
      // pins the ;; check's place after the counts in the part methods: moved
      // before the no-glyphs check, it would rename this rejection
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart(';;;B81'))
        .toThrow('Expected a single part, but code ";;;B81" produced no glyphs');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the part\'s code also carries a head marker', () => {
    it.each(['B97^;;B81', ';;B97^'])('names the ;; first for %s', (code) => {
      // pins the ;; check's place before the head-marker check, the order
      // since 1.0.0; killed the mutant that moves it after
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).addPart(code)).toThrow(WORD_INDICATOR_MESSAGE(code));
    });
  });

  describe('when the part\'s code is a whole word', () => {
    it('keeps a word that starts with ;; as a WORD_AS_PART failed part', () => {
      // note: the word row wins over the ;; rule, as it does for
      // B313/B1103;;B81 (the documented WORD_AS_PART exception)
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart(';;B81/B291');
      expect(b.toJSON().groups[0].glyphs[0].parts[1].errorCode).toBe('WORD_AS_PART');
      expect(b.warnings.map((w) => [w.code, w.source])).toEqual([['WORD_AS_PART', ';;B81/B291']]);
    });
  });
});
