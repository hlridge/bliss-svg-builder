/**
 * Pins the part methods' reading of a `|` written outside an option bracket:
 * the separator that ends word or document options, which a part cannot
 * carry, so the call throws and leaves the builder untouched.
 *
 * Covers:
 * - an empty or malformed options slot before a `|` or `||` (`|B313`,
 *   `||B313`, `[]|B313`, `B313|B431`), a word that fails on a later `|`
 *   (`|B313|B431`), and a `|` with nothing after it (`B313|`): one message
 *   on every part surface, no warning left behind
 * - a parsed word options bracket keeps its own message with no code after it
 * - a `|` inside an option bracket is option text, not a separator
 * - a whole word keeps the WORD_AS_PART route, `|` and all
 *
 * Does NOT cover:
 * - a bare `|` alone and the other degenerate parses, and the parsed options
 *   brackets followed by a code, see ElementHandle.part-mutation-args.test.js
 * - the character methods, which read `|B208` and `||B208` as a string does,
 *   see ElementHandle.glyph-mutation-args.test.js
 * - a `|` inside a word of a string, see BlissParser.pipe-inside-word.test.js
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const stateOf = (b) => JSON.stringify(b.toJSON());

const SURFACES = [
  { label: 'glyph(0).addPart', invoke: (b, code) => b.group(0).glyph(0).addPart(code) },
  { label: 'glyph(0).insertPart(0, ...)', invoke: (b, code) => b.group(0).glyph(0).insertPart(0, code) },
  { label: 'glyph(0).replacePart(0, ...)', invoke: (b, code) => b.group(0).glyph(0).replacePart(0, code) },
  { label: 'part(0).replace', invoke: (b, code) => b.group(0).glyph(0).part(0).replace(code) },
  { label: 'group(0).addPart', invoke: (b, code) => b.group(0).addPart(code) },
  { label: 'builder.addPart', invoke: (b, code) => b.addPart(code) },
];
const EACH_SURFACE = SURFACES.map((s) => [s.label, s]);

const PIPED_CODES = ['|B313', '||B313', '[]|B313', '[]||B313', 'B313|B431', 'B313/|B431', '|B313|B431', 'B313|'];
const EACH_SURFACE_AND_PIPED_CODE = SURFACES.flatMap((s) => PIPED_CODES.map((code) => [s.label, code, s]));

describe('ElementHandle part arg pipe', () => {
  describe('when a part\'s code holds a | outside an option bracket', () => {
    it.each(EACH_SURFACE_AND_PIPED_CODE)('%s throws for %s and leaves the builder untouched', (label, code, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, code)).toThrow(`Code "${code}" holds a "|" outside an option bracket`);
      expect(stateOf(b)).toBe(before);
      expect(b.warnings).toEqual([]);
    });

    it('names both separators and the part-level alternatives', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).addPart('|B313')).toThrow(
        'Code "|B313" holds a "|" outside an option bracket: "|" and "||" end word and document options, '
        + 'which a part cannot carry. Pass the part alone ("CODE" or "[opts]>CODE"), or use addGroup() for word content',
      );
    });

    it('throws on an empty builder and leaves it empty', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart('B313|B431')).toThrow('holds a "|" outside an option bracket');
      expect(b.toJSON().groups).toEqual([]);
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the | ends a parsed word options bracket', () => {
    it('throws the word-level options message with no code after the bracket', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart('[color=red]|')).toThrow('carries word-level options ("[opts]|")');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the | stands inside an option bracket', () => {
    it.each(EACH_SURFACE)('%s keeps the | as option text', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      invoke(b, '[data-note=a|b]>B313');
      expect(b.toString()).toContain('[data-note="a|b"]>B313');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the code is a whole word', () => {
    it.each(['[color=red]|B313/B431', '|B313/B431'])('keeps %s as a WORD_AS_PART failed part', (code) => {
      // note: the word row wins over the | rule, as it does over ;; (the
      // documented WORD_AS_PART exception for a word passed as a part)
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart(code);
      expect(b.toJSON().groups[0].glyphs[0].parts[1].errorCode).toBe('WORD_AS_PART');
      expect(b.warnings.map((w) => [w.code, w.source])).toEqual([['WORD_AS_PART', code]]);
    });
  });
});
