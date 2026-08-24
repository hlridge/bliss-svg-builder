import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the parser X-code handling surface: multi-character Xword
 * expansion into per-character X-codes, semicolon-adjacency
 * boundary rules that suppress expansion, and the WORD_AS_PART
 * error emitted when multi-character X-text is used in a ;-part
 * position.
 *
 * Covers:
 * - Multi-character Xword expansion into per-character X-codes
 *   when every character has built-in path data.
 * - Fallback to XTXT_word when any character of the Xword lacks
 *   path data (e.g. Greek alpha).
 * - Semicolon-adjacency suppression: an Xword preceded or followed
 *   by ; (composition boundary) is preserved as a single literal
 *   part rather than expanded.
 * - The limit of that suppression: a following ; that starts no
 *   part (a `;;` word-level overlay, or a bare trailing `;`) does
 *   NOT suppress expansion, because neither is a composition.
 * - Expansion inside a definition codeString, at any nesting
 *   depth, matching what the same run does at top level.
 * - Non-semicolon adjacency: an Xword preceded or followed by /
 *   (glyph boundary, not composition) is expanded normally.
 * - Glyph-boundary anchoring: an X+letters sequence embedded inside
 *   a longer code token (e.g. a custom code name) is NOT expanded,
 *   so the token can still be looked up as a definition.
 * - WORD_AS_PART error: multi-character X-text used as a ;-part
 *   carries the documented `errorCode` and message, anchored start
 *   (`^`) to end (`$`) so a code that merely contains `X<letters>`
 *   mid-string, or an X-code whose suffix ends in a non-letter, is
 *   NOT mis-flagged.
 * - Run-integrity floor for a run carrying a character outside the
 *   accepted ranges: the rejection is warned, never silent, and the
 *   in-range whole-run-fallback contrast still holds.
 *
 * Does NOT cover:
 * - Object input: a hand-authored `{codeName:'XOH'}` node is not
 *   run through the expansion pass at all, so it renders one text
 *   glyph where the DSL renders two outlined letters. Outside the
 *   documented object surface (a `toJSON()` form never contains a
 *   run); tracked in `backlog.md` with the object-input validation
 *   family.
 * - XTXT_ fallback metadata propagation (isExternalGlyph / char
 *   fields on the expanded glyph), see
 *   `BlissParser.definition-expansion.test.js`.
 * - Single-character X-codes (`Xh` etc.) outside the Xword
 *   expansion path, see `BlissParser.internal-mechanics.test.js`.
 * - WHICH characters an X-run should accept (the hyphen/apostrophe
 *   char-set question) — that is issue #26, pinned as it.todo in
 *   `BlissSVGBuilder.text-fallback.test.js`. The run-integrity
 *   tripwires below are about the failure MODE at whatever boundary
 *   #26 settles on, and are independent of it.
 */
describe('BlissParser X-codes', () => {
  describe('when Xword has path data for every character', () => {
    it('expands Xhello into per-character X-codes', () => {
      const result = BlissParser.parse('Xhello');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName))
        .toEqual(['Xh', 'Xe', 'Xl', 'Xl', 'Xo']);
    });
  });

  describe('when Xword contains a character lacking path data', () => {
    it('falls back to XTXT_word for the whole word', () => {
      // Greek alpha (α) has no built-in path; the whole word becomes XTXT_.
      const result = BlissParser.parse('Xhαllo');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts[0].codeName).toBe('XTXT_hαllo');
    });
  });

  describe('when Xword is adjacent to ; (composition boundary)', () => {
    it('does not expand Xword preceded by ;', () => {
      // B81;Xhello: Xhello sits after ; (not a glyph boundary), so the
      // glyph-boundary anchor leaves it literal as one glyph's part. If the
      // anchor were lost, Xhello would expand into Xh/Xe/Xl/Xl/Xo, splitting
      // the single glyph across multiple glyphs.
      const result = BlissParser.parse('B81;Xhello');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['B81', 'Xhello']);
    });

    it('does not expand Xword followed by ;', () => {
      const result = BlissParser.parse('Xhello;B81');
      expect(result.groups[0].glyphs.length).toBe(1);
      expect(result.groups[0].glyphs[0].parts.map(p => p.codeName))
        .toEqual(['Xhello', 'B81']);
    });
  });

  describe('when Xword is adjacent to / (glyph boundary, not composition)', () => {
    it('expands Xword preceded by /', () => {
      // Distinguishes "before is true at offset>0" (mutant: || makes it always
      // true mid-string) from the actual && requirement that prev char === ;.
      const result = BlissParser.parse('B81/Xhello');
      expect(result.groups[0].glyphs.length).toBe(6);
    });

    it('expands Xword followed by /', () => {
      const result = BlissParser.parse('Xhello/B81');
      expect(result.groups[0].glyphs.length).toBe(6);
    });
  });

  describe('when X appears embedded inside a longer code token', () => {
    // regression: the Xword expander was unanchored and rewrote any X+letters
    // mid-token, so a custom code like EXTRA became EXT/XR/XA and could never
    // be looked up (findings doc N5).
    const EMBED_DEFS = {
      EXTRA: { codeString: 'B291' },
      MAXVAL: { codeString: 'B303' },
    };
    beforeAll(() => BlissSVGBuilder.define(EMBED_DEFS));
    afterAll(() => Object.keys(EMBED_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('looks up a custom code whose name contains X+letters', () => {
      const result = BlissParser.parse('EXTRA');
      expect(result.groups[0].glyphs).toHaveLength(1);
      expect(result.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291']);
    });

    it('leaves an embedded X unexpanded when a glyph boundary precedes the token', () => {
      const result = BlissParser.parse('B81/MAXVAL');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName)).toEqual(['B81', 'B303']);
    });
  });

  describe('when multi-character X-text is used as a ;-part', () => {
    it('flags the part with a WORD_AS_PART error and a descriptive message', () => {
      // kills 2488 (cond → false), 2491 ({2,} → {}), 2492 (char-class flip),
      // 2493 (block → empty), 2494 (template literal → empty),
      // 2495 (slice(1) → codeName), 2496 ('WORD_AS_PART' → '').
      const r = BlissParser.parse('B291;Xab');
      const part = r.groups[0].glyphs[0].parts[1];
      expect(part.error).toBe('Multi-character text "ab" is a word and cannot be composed with ;');
      expect(part.errorCode).toBe('WORD_AS_PART');
    });

    it('does not flag a ;-part code whose name merely contains X<letters> mid-string', () => {
      // pins the ^ start-anchor on the WORD_AS_PART regex (parser L1127);
      // without it, 'MAXWELL' matches the trailing 'XWELL' and is mis-flagged
      // as a word. Killed the ^-drop mutant in the 2026-06-26 Stryker run.
      const r = BlissParser.parse('B291;MAXWELL');
      expect(r.groups[0].glyphs[0].parts[1].errorCode).not.toBe('WORD_AS_PART');
    });

    it('does not flag an X-code whose suffix ends in a non-letter', () => {
      // pins the $ end-anchor on the WORD_AS_PART regex (parser L1127); without
      // it, 'Xhello9' matches the 'Xhello' prefix and is mis-flagged. Killed the
      // $-drop mutant in the 2026-06-26 Stryker run.
      const r = BlissParser.parse('B291;Xhello9');
      expect(r.groups[0].glyphs[0].parts[1].errorCode).not.toBe('WORD_AS_PART');
    });
  });

  // note: the expander holds a run TOGETHER when a character inside the matched
  // sub-run lacks path data (whole-run XTXT_ fallback), but a character outside
  // the accepted ranges never enters that sub-run at all — the `{2,}` character
  // class stops early, so the untouched tail splices onto the LAST expanded code
  // and destroys the letter before it (`Xhello-world` renders `hell`, then fails
  // on `Xo-world`). The active tests below pin only the visible-not-silent floor
  // and the in-range contrast that already holds; the it.todo lines pin the
  // desired run-integrity contract. Backlog: "X-run truncation splices the
  // unmatched tail onto the last expanded letter".
  describe('when an X-run carries a character outside the accepted ranges', () => {
    it('holds the run together when an in-range character merely lacks path data', () => {
      // contrast case, correct today: Greek alpha IS inside the recognised
      // ranges, so the whole run reaches the fallback rule and no letter is lost
      const r = BlissParser.parse('Xhαllo');
      expect(r.groups[0].glyphs.map(g => g.parts[0].codeName)).toEqual(['XTXT_hαllo']);
    });

    it.each([
      ['XM-M'],
      ['XMM-M'],
      ['XAnna-Karin'],
      ['Xhello-world'],
    ])('warns rather than silently accepting %s', (input) => {
      expect(new BlissSVGBuilder(input).warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
    });

    it.each([
      ['XM-M'],
      ['XMM-M'],
      ['XAnna-Karin'],
    ])('serializes %s to a form that reparses to the same render', (input) => {
      const b = new BlissSVGBuilder(input);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it.todo('keeps every outlined letter of Xhello-world instead of absorbing the o into the tail token');
    it.todo('reports the whole written token as the failing source, not a sub-token starting mid-run');
    it.todo('treats XM-M and XMM-M alike, so the letter count before an unsupported character does not change the split');
  });

  // regression: see issue #37. The expansion pass ran on the top-level input
  // string only, so a run written inside a definition was never expanded and
  // was then rejected as a multi-character word.
  describe('when an X-run is written inside a definition codeString', () => {
    const RUN_DEFS = {
      DEFXRUNWORD: { codeString: 'B216/XOH' },
      DEFXRUNWRITTEN: { codeString: 'B216/XO/XH' },
      DEFXRUNNESTED: { codeString: 'DEFXRUNWORD/B291' },
      DEFXRUNMIXED: { codeString: 'Xa/Xλ' },
      DEFXTEXTKEY: { codeString: 'XTXT_hello' },
      DEFXOPTTEXTKEY: { codeString: '[color=red]XTXT_hello' },
      DEFXSEMIBREAK: { codeString: 'Xab;//B291' },
    };
    beforeAll(() => BlissSVGBuilder.define(RUN_DEFS));
    afterAll(() => Object.keys(RUN_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('expands the run into per-character X-codes', () => {
      const builder = new BlissSVGBuilder('DEFXRUNWORD');
      expect(builder.toString()).toBe('B216/XO/XH');
      expect(builder.warnings).toEqual([]);
    });

    it('renders the run identically to the written twin definition', () => {
      expect(new BlissSVGBuilder('DEFXRUNWORD').svgCode)
        .toBe(new BlissSVGBuilder('DEFXRUNWRITTEN').svgCode);
    });

    it('expands a run reached through a nested definition', () => {
      const builder = new BlissSVGBuilder('DEFXRUNNESTED');
      expect(builder.toString()).toBe('B216/XO/XH/B291');
      expect(builder.warnings).toEqual([]);
    });

    it('leaves the internal text-fallback routing key intact', () => {
      // regression: XTXT_<chars> is one glyph, but its leading XTXT matches the
      // run pattern, so expanding it produced XT/XX/XT plus an unknown tail
      const builder = new BlissSVGBuilder('DEFXTEXTKEY');
      expect(builder.toString()).toBe('Xhello');
      expect(builder.warnings).toEqual([]);
    });

    it('recognises the routing key behind an option bracket', () => {
      // pins that the key is looked for at the run, not at the start of the
      // string; a mutant reading offset 0 misses the prefixed form entirely
      const builder = new BlissSVGBuilder('DEFXOPTTEXTKEY');
      expect(builder.toString()).toBe('[color=red]Xhello');
      expect(builder.warnings).toEqual([]);
    });

    it('expands a run whose inert semicolon is followed by a word break', () => {
      // a definition keeps `//` raw, so unlike the top level the expansion pass
      // sees the ';//' sequence; the ';' there composes nothing
      const builder = new BlissSVGBuilder('DEFXSEMIBREAK');
      expect(builder.toString()).toBe('Xa/Xb//B291');
      expect(builder.warnings).toEqual([]);
    });

    it('merges a mixed run into one text-fallback glyph, as the top level does', () => {
      // Greek lambda has no outline, so the whole run falls back to one XTXT_
      // glyph. Without expansion on this path the lambda was UNKNOWN_CODE.
      const builder = new BlissSVGBuilder('DEFXRUNMIXED');
      expect(builder.toString()).toBe('Xaλ');
      expect(builder.warnings).toEqual([]);
    });
  });

  // regression: see issue #37. The ;-adjacency guard suppressed expansion for
  // ANY following ';'. A part composition is the only thing it exists to
  // protect; `;;` attaches a word-level overlay to the whole word, and a bare
  // trailing ';' composes nothing at all.
  describe('when an X-run is followed by a semicolon that starts no part', () => {
    it('expands a run carrying a word-level indicator overlay', () => {
      const builder = new BlissSVGBuilder('B216/XOH;;B99');
      expect(builder.toString()).toBe('B216/XO/XH;;B99');
      expect(builder.warnings).toEqual([]);
    });

    it('renders an overlaid run identically to its written twin', () => {
      expect(new BlissSVGBuilder('B216/XOH;;B99').svgCode)
        .toBe(new BlissSVGBuilder('B216/XO/XH;;B99').svgCode);
    });

    it('expands a run followed by an inert trailing semicolon', () => {
      const builder = new BlissSVGBuilder('Xab;');
      expect(builder.toString()).toBe('Xa/Xb');
      expect(builder.warnings).toEqual([]);
    });

    it('expands a run whose inert semicolon is followed by a glyph boundary', () => {
      expect(new BlissSVGBuilder('Xab;/B291').toString())
        .toBe(new BlissSVGBuilder('Xa/Xb;/B291').toString());
    });

    it('still refuses to expand a run that a real ;-part composes onto', () => {
      // pins the guard's remaining job; a guard deleted outright would expand
      // here and split the composition across glyphs
      expect(new BlissSVGBuilder('Xab;C8').warnings.map(w => w.code))
        .toContain('WORD_AS_PART');
    });

    it('counts a single-character part as a composition', () => {
      // pins the "there is something after the ;" length boundary: one
      // character is already a part, so this run must stay whole
      expect(new BlissSVGBuilder('Xab;H').warnings.map(w => w.code))
        .toContain('WORD_AS_PART');
    });

    it('expands an option-prefixed run carrying an overlay', () => {
      const builder = new BlissSVGBuilder('[color=red]Xab;;B81');
      expect(builder.toString()).toBe('[color=red]Xa/Xb;;B81');
      expect(builder.warnings).toEqual([]);
    });

    it('expands a run whose overlay is empty', () => {
      // rest is exactly ';;', which is neither a part nor an overlay code
      expect(new BlissSVGBuilder('Xab;;').toString())
        .toBe(new BlissSVGBuilder('Xa/Xb;;').toString());
    });

    it('is not confused by a semicolon inside a quoted option value', () => {
      // the value's ; is placeholder-stored before expansion runs; if it ever
      // leaked into the raw string the guard would read it as a part boundary
      const builder = new BlissSVGBuilder('[data-x="a;b"]Xab;;B81');
      expect(builder.toString()).toBe('[data-x="a;b"]Xa/Xb;;B81');
      expect(builder.warnings).toEqual([]);
    });
  });
});
