import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins which characters an X run may hold: letters of the accepted blocks,
 * joined by a hyphen-minus that stands between two letters, so a hyphenated
 * name such as `XAnna-Karin` draws as one text glyph instead of nothing.
 *
 * Covers:
 * - A hyphen between two letters: the run is one text glyph (no outline holds
 *   a hyphen), drawn without a warning and written back byte-identically
 *   through `toString()` and `toJSON()`, spaced from an outlined letter as any
 *   external glyph is.
 * - A hyphen that does not stand between two letters (leading, trailing,
 *   doubled, before a digit): the token is refused whole, as before.
 * - A hyphenated run in the other places a one-glyph run is written (a `;;`
 *   list, a `;` part slot, under a part, behind a bracket, with a head marker,
 *   inside a definition), read there as `Xhαllo` is read.
 * - define()'s namespace guard on a name with a hyphen: refused where the
 *   written name is a run (`XAB-C`), accepted where it is not (`XRAY-1`), and
 *   the guard's anchors (`MAXWELL`).
 * - The Latin blocks past Latin Extended-A (Latin Extended-B, IPA Extensions,
 *   Latin Extended Additional), each block's first and last letter, drawn as
 *   text; the code points just outside them, CJK, kana and a decomposed
 *   letter stay refused.
 *
 * Does NOT cover:
 * - How a token outside the grammar is taken whole and reported, see
 *   `BlissParser.x-codes.test.js`, describe `when an X-run carries a character
 *   outside the accepted ranges`.
 * - The text glyph itself, and the Pinyin letters ǎ, ǔ, ḿ written alone, in a
 *   word and beside an outlined word, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 * - define()'s guard on names of plain letters (`XAB`, `XЖД`), see
 *   `BlissSVGBuilder.define-hardening.test.js`.
 * - The GitHub issues' own examples (#26, #38, #39), see
 *   `BlissSVGBuilder.github-issue-examples.test.js`.
 */

const render = (input) => new BlissSVGBuilder(input);
const sources = (builder) => builder.warnings.map((w) => [w.code, w.source]);
const textCount = (builder) => (builder.svgCode.match(/<text/g) ?? []).length;
// Paths and text elements inside the content group: what the picture draws.
const inkCount = (builder) =>
  ((builder.svgCode.split('class="bliss-content"')[1] ?? '').match(/ d="|<text/g) ?? []).length;
const gapAfterFirstGlyph = (builder) => {
  const [first, second] = builder.groups[0].children;
  return second.x - first.x - first.width;
};

describe('BlissSVGBuilder x-run characters', () => {
  describe('when a hyphen joins two letters of a run', () => {
    it.each(['XM-M', 'XMM-M', 'XM-M-M', 'XAnna-Karin'])(
      'draws %s as one text glyph without a warning and writes it back as written',
      (input) => {
        const run = render(input);
        expect(run.warnings).toEqual([]);
        expect(run.toJSON().groups[0].glyphs).toHaveLength(1);
        expect(inkCount(run)).toBe(1);
        expect(run.svgCode).toContain(`>${input.slice(1)}</text>`);
        expect(run.toString()).toBe(input);
        expect(render(run.toString()).svgCode).toBe(run.svgCode);
      },
    );

    it.each(['XM-M', 'XAnna-Karin'])('rebuilds %s from toJSON() unwarned and byte-identically', (input) => {
      const run = render(input);
      const rebuilt = render(run.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.svgCode).toBe(run.svgCode);
      expect(rebuilt.toJSON()).toEqual(run.toJSON());
    });

    // pins the run pass reading a run whose second character is the hyphen: a
    // two-letter lookahead left XM-M to the part slot, which draws the same
    // text but spaces it as a Bliss character, 2 apart
    it.each(['XM/XAnna-Karin', 'XM/XM-M', 'XM-M/XM'])(
      'spaces %s 0.8 apart, the external-glyph space',
      (input) => {
        const pair = render(input);
        expect(gapAfterFirstGlyph(pair)).toBeCloseTo(0.8, 6);
        expect(pair.toString()).toBe(input);
      },
    );
  });

  describe('when a hyphen does not stand between two letters', () => {
    it.each(['X-M', 'XM-', 'XM--M', 'XM-1'])('refuses %s whole: one UNKNOWN_CODE naming it, nothing drawn', (input) => {
      const token = render(input);
      expect(sources(token)).toEqual([['UNKNOWN_CODE', input]]);
      expect(inkCount(token)).toBe(0);
    });
  });

  // scenario: Xhαllo is the documented one-glyph run (Greek has no outlines);
  // a hyphenated run is one glyph for the same reason and reads the same way.
  describe('when a hyphenated run is written where a one-glyph run can be', () => {
    it.each([
      ['before a ;; indicator list', (run) => `${run};;B81`],
      ['after a Bliss character, before a ;; list', (run) => `B291/${run};;B81`],
      ['in a ; part slot', (run) => `B291;${run}`],
      ['under a ; part', (run) => `${run};C8`],
      ['behind an option bracket', (run) => `[color=red]${run}`],
      ['with a head marker', (run) => `B291/${run}^`],
    ])('reads it %s as it reads Xhαllo there', (_, at) => {
      const hyphen = render(at('XAnna-Karin'));
      const greek = render(at('Xhαllo'));
      expect(hyphen.warnings).toEqual([]);
      expect(greek.warnings).toEqual([]);
      expect(textCount(hyphen)).toBe(textCount(greek));
      expect(hyphen.toString().replace('XAnna-Karin', 'Xhαllo')).toBe(greek.toString());
      expect(render(hyphen.toString()).svgCode).toBe(hyphen.svgCode);
    });
  });

  describe('when a hyphenated run is written inside a definition', () => {
    it('draws a word alias holding it as the written word draws', () => {
      BlissSVGBuilder.define({ HYPHENRUNWORD: { codeString: 'B216/XAnna-Karin' } });
      try {
        const word = render('HYPHENRUNWORD');
        expect(word.warnings).toEqual([]);
        expect(word.svgCode).toBe(render('B216/XAnna-Karin').svgCode);
      } finally {
        BlissSVGBuilder.removeDefinition('HYPHENRUNWORD');
      }
    });

    it('accepts it as the one character of a glyph definition', () => {
      const result = BlissSVGBuilder.define({ HYPHENRUNGLYPH: { type: 'glyph', codeString: 'XAnna-Karin' } });
      try {
        expect(result.errors).toEqual([]);
        const glyph = render('HYPHENRUNGLYPH');
        expect(glyph.warnings).toEqual([]);
        expect(glyph.svgCode).toBe(render('XAnna-Karin').svgCode);
      } finally {
        BlissSVGBuilder.removeDefinition('HYPHENRUNGLYPH');
      }
    });

    it('refuses it in a shape definition, as it refuses Xhαllo: a shape draws no letters', () => {
      const result = BlissSVGBuilder.define({ HYPHENRUNSHAPE: { type: 'shape', codeString: 'XAnna-Karin' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot reference externalGlyph "XAnna-Karin"');
    });
  });

  describe('when define() names a code that holds a hyphen', () => {
    it('refuses XAB-C, which written is a hyphenated run and so never reaches a definition', () => {
      const result = BlissSVGBuilder.define({ 'XAB-C': { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('external-character namespace');
    });

    // pins both anchors of the namespace guard: without `$` XRAY-1 is refused
    // for its XRAY, without `^` MAXWELL is refused for its XWELL
    it.each(['XRAY-1', 'MAXWELL'])('accepts %s, which written reaches its definition', (name) => {
      const result = BlissSVGBuilder.define({ [name]: { codeString: 'B291' } });
      try {
        expect(result.defined).toEqual([name]);
        expect(render(name).svgCode).toBe(render('B291').svgCode);
      } finally {
        BlissSVGBuilder.removeDefinition(name);
      }
    });
  });

  describe('when a run holds a letter of a Latin block past Latin Extended-A', () => {
    it.each([
      ['Xƀ', 'U+0180, the first letter of Latin Extended-B'],
      ['Xɏ', 'U+024F, the last letter of Latin Extended-B'],
      ['Xɐ', 'U+0250, the first letter of IPA Extensions'],
      ['Xʯ', 'U+02AF, the last letter of IPA Extensions'],
      ['XḀ', 'U+1E00, the first letter of Latin Extended Additional'],
      ['Xỿ', 'U+1EFF, the last letter of Latin Extended Additional'],
      ['XViệt', 'Vietnamese, outlined letters and one from Latin Extended Additional'],
    ])('draws %s as one text glyph without a warning (%s)', (input) => {
      const run = render(input);
      expect(run.warnings).toEqual([]);
      expect(inkCount(run)).toBe(1);
      expect(run.svgCode).toContain(`>${input.slice(1)}</text>`);
      expect(render(run.toString()).svgCode).toBe(run.svgCode);
    });

    it('merges a written sequence of single letters as it merges the run (Xp/Xi/Xǎ, Xpiǎ)', () => {
      expect(render('Xp/Xi/Xǎ').svgCode).toBe(render('Xpiǎ').svgCode);
    });

    // pins the code-name class the coordinate check is built from: read with
    // letters short of the new blocks, Xǎ:abc and Bǎ:abc fell to UNKNOWN_CODE
    it.each(['Xǎ:abc', 'Bǎ:abc', 'XAnna-Karin:abc'])('reports %s as a malformed coordinate, as Xλ:abc is', (input) => {
      expect(render(input).warnings.map((w) => w.code)).toEqual(['MALFORMED_COORDINATES']);
      expect(render('Xλ:abc').warnings.map((w) => w.code)).toEqual(['MALFORMED_COORDINATES']);
    });

    it.each([
      ['Xʰ', 'U+02B0, a modifier letter just past IPA Extensions'],
      ['Xἀ', 'U+1F00, Greek Extended, just past Latin Extended Additional'],
      ['X漢', 'CJK, GH #26'],
      ['Xあ', 'kana, GH #26'],
      ['Xǎ', 'a decomposed ǎ: a, then a combining caron'],
    ])('refuses %s whole (%s): one UNKNOWN_CODE naming it, nothing drawn', (input) => {
      const token = render(input);
      expect(sources(token)).toEqual([['UNKNOWN_CODE', input]]);
      expect(inkCount(token)).toBe(0);
    });
  });
});
