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
 * - Run integrity for a run carrying a character outside the
 *   accepted ranges: the whole written token is judged as one unit,
 *   so no outlined letter is absorbed into a failing tail, and the
 *   warning names the token exactly as written.
 * - What a run DENOTES: an all-outlined run is a word (many glyphs)
 *   and refuses a ;-part; a run holding a letter with no outline is
 *   ONE text-fallback glyph and accepts one.
 * - Trailing decorations (head marker, coordinate, ;-part, ;;-overlay)
 *   on the last member of a written single-letter sequence, which
 *   ride the merged glyph instead of stranding it.
 * - Reachability of a definition name that starts with X but leaves
 *   the reserved letter namespace (XRAY1).
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

  // The glyph-boundary anchor that keeps a WORD from splitting across glyphs in a
  // part slot also keeps a part-position X code from ever reaching the XTXT_
  // route, so a letter that needs the text fallback fails there. An outlined
  // external letter is already a legal part (`B291;Xa` renders), so this is a
  // routing hole rather than a widening of what may be a part. The active tests
  // pin the two ends that already hold; the it.todo lines pin the gap. Backlog:
  // "A text-fallback letter or run cannot be used AS a ;-part".
  //
  // note: closing this gap means deliberately CHANGING an active test, not just
  // making a todo pass. `BlissSVGBuilder.text-fallback.test.js` describe-path
  // `... > when an X-code sits in a ;-part slot` pins `B291;Xλ` as UNKNOWN_CODE
  // and calls it the unchanged contract (the Phase 2.2 option-bracket work drew
  // that scope line on purpose). Decide it, then move both.
  describe('when a text-fallback X code is written in a ;-part slot', () => {
    it('accepts an outlined external letter as a part', () => {
      const r = BlissParser.parse('B291;Xa');
      expect(r.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'Xa']);
    });

    it('accepts the internal text-fallback key as a part', () => {
      // the same glyph the DSL spelling below cannot reach today
      const builder = new BlissSVGBuilder('B291;XTXT_λ');
      expect(builder.warnings).toEqual([]);
    });

    it('routes a single fallback letter written as a part to the text glyph (B291;Xλ)', () => {
      const builder = new BlissSVGBuilder('B291;Xλ');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;XTXT_λ').svgCode);
    });

    it('routes a run that collapses to one glyph written as a part to the text glyph (B291;Xaλ)', () => {
      const builder = new BlissSVGBuilder('B291;Xaλ');
      expect(builder.warnings).toEqual([]);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;XTXT_aλ').svgCode);
    });

    it('still refuses an all-outlined run as a part (B291;Xab stays WORD_AS_PART)', () => {
      const builder = new BlissSVGBuilder('B291;Xab');
      expect(builder.warnings.map(w => w.code)).toEqual(['WORD_AS_PART']);
    });

    it('keeps a routed part a single part rather than splitting it across glyphs', () => {
      // criterion (d): the boundary anchor exists so a WORD cannot split one
      // glyph into many here. Routing the one-glyph answer must not weaken it.
      const oneGlyph = BlissParser.parse('B81;Xhello');
      expect(oneGlyph.groups[0].glyphs).toHaveLength(1);
      const routed = BlissParser.parse('B291;Xaλ');
      expect(routed.groups[0].glyphs).toHaveLength(1);
      expect(routed.groups[0].glyphs[0].parts.map(p => p.codeName)).toEqual(['B291', 'XTXT_aλ']);
    });

    it('serializes a routed part back to the form that was written', () => {
      const builder = new BlissSVGBuilder('B291;Xaλ');
      expect(builder.toString()).toBe('B291;Xaλ');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(builder.svgCode);
    });

    it('routes a part behind a part option and a coordinate suffix too', () => {
      const options = new BlissSVGBuilder('B291;[color=red]>Xaλ');
      expect(options.warnings).toEqual([]);
      expect(options.svgCode).toContain('red');
      const placed = new BlissSVGBuilder('B291;Xaλ:2,3');
      expect(placed.warnings).toEqual([]);
      expect(placed.svgCode).toBe(new BlissSVGBuilder('B291;XTXT_aλ:2,3').svgCode);
    });

    it('leaves a part that is not X-plus-letters to fail as the code it is', () => {
      // `Xab9` is not a letter run, so the part slot must not invent a text
      // glyph for it: it stays the single unknown code it was written as,
      // matching what the same token does at the top level.
      const builder = new BlissSVGBuilder('B291;Xab9');
      expect(builder.warnings.map(w => w.code)).toEqual(['UNKNOWN_CODE']);
      expect(builder.warnings[0].source).toBe('Xab9');
    });

    it('matches what the same composition does through object input', () => {
      // Object input already routed these (its own normalization step rewrites
      // an unregistered X code); the DSL was the surface that could not.
      for (const code of ['Xλ', 'Xaλ']) {
        const dsl = new BlissSVGBuilder(`B291;${code}`);
        const obj = new BlissSVGBuilder({
          groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: code }] }] }],
        });
        expect(obj.svgCode).toBe(dsl.svgCode);
        expect(obj.warnings).toEqual(dsl.warnings);
      }
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

  // regression: see issue #39. The expander used to match only the letters
  // after the X, so a character outside the accepted ranges ended the match and
  // the untouched tail glued onto the LAST expanded code, destroying the letter
  // before it (`Xhello-world` rendered `hell` and failed on `Xo-world`). The
  // token is now taken as written, up to the next `/`, `;`, `^` or `:`, and an
  // out-of-range character makes the WHOLE token an unknown code. WHICH
  // characters an X-run should accept is a separate question, issue #26; this
  // describe pins the failure mode at whatever boundary that settles on.
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

    it('absorbs no outlined letter into a failing tail token', () => {
      const glyphs = BlissParser.parse('Xhello-world').groups[0].glyphs;
      expect(glyphs.map(g => g.parts[0].codeName)).toEqual(['Xhello-world']);
    });

    it('reports the token as written, not a sub-token starting mid-run', () => {
      expect(new BlissSVGBuilder('Xhello-world').warnings).toContainEqual(
        expect.objectContaining({ code: 'UNKNOWN_CODE', source: 'Xhello-world' })
      );
    });

    it('treats one and two letters before the unsupported character alike', () => {
      // the `{2,}` quantifier used to decide the outcome class on its own: XM-M
      // stayed one token, XMM-M split into an outlined M plus a failing XM-M
      const one = new BlissSVGBuilder('XM-M');
      const two = new BlissSVGBuilder('XMM-M');
      expect(one.toString()).toBe('XM-M');
      expect(two.toString()).toBe('XMM-M');
      expect(two.warnings.map(w => w.source)).toEqual(['XMM-M']);
    });

    it('holds a run together when the unsupported character is itself a letter', () => {
      // ǎ (U+01CE) sits just above Latin Extended-A, so it never enters the run;
      // the ordinary `i` before it used to be consumed by the failing tail
      const builder = new BlissSVGBuilder('Xpiǎ');
      expect(builder.toString()).toBe('');
      expect(builder.warnings).toContainEqual(
        expect.objectContaining({ code: 'UNKNOWN_CODE', source: 'Invalid format: Xpiǎ' })
      );
    });

    it('reports the token as written when it carries a head marker', () => {
      // the head marker ends the token; without that the `^` would be read as
      // part of the run and every marked word would fail
      expect(new BlissSVGBuilder('B291/Xhello-world^').warnings.map(w => w.source))
        .toEqual(['Xhello-world']);
    });
  });

  // The discriminator is what a run DENOTES, and it is the same question in
  // three places: whether a ;-part may attach, whether a written sequence
  // merges, and whether define() may call the run one character. An all-
  // outlined run is a word; a run holding a letter with no outline is one
  // text-fallback glyph. The refusal side is pinned above, under the
  // semicolon-adjacency describe.
  describe('when a real ;-part composes onto a run that collapses to one glyph', () => {
    it('composes the part instead of rejecting the run as a word', () => {
      const builder = new BlissSVGBuilder('Xaλ;C8');
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('Xaλ;C8');
    });

    it('renders it identically to the written twin of the same run', () => {
      expect(new BlissSVGBuilder('Xaλ;C8').svgCode)
        .toBe(new BlissSVGBuilder('Xa/Xλ;C8').svgCode);
    });
  });

  // regression: see issue #39. Phase 2 of the expander merged only BARE
  // single-letter tokens, so a decoration on the last member stranded that
  // letter outside the merge and it failed as an unknown code.
  describe('when the last letter of a written sequence carries a decoration', () => {
    it.each([
      [';;B81', 'a word-level overlay'],
      ['^', 'a head marker'],
      [':5', 'a coordinate'],
      [';C8', 'a ;-part'],
    ])('merges the sequence when the last letter carries %s (%s)', (decoration) => {
      const written = new BlissSVGBuilder(`Xa/Xλ${decoration}`);
      expect(written.warnings).toEqual([]);
      expect(written.toString()).toBe(new BlissSVGBuilder(`Xaλ${decoration}`).toString());
    });

    it('routes a lone decorated fallback letter to the text glyph', () => {
      const result = BlissParser.parse('B291/Xλ;;B81');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName)).toEqual(['B291', 'XTXT_λ']);
    });

    it('leaves an all-outlined sequence unmerged, with the decoration on its last letter', () => {
      const result = BlissParser.parse('Xa/Xb^');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName)).toEqual(['Xa', 'Xb']);
    });

    it('puts a run decoration on the last expanded glyph, not the first', () => {
      // absolute rather than twin-compared on purpose: a mutant that moves the
      // decoration to the first glyph moves it in the twin too, so comparing the
      // two spellings cannot see it. Also pins that ^ and : end the token; if
      // either left the boundary set the whole run would fail as one code
      expect(new BlissSVGBuilder('Xab^').toString()).toBe('Xa/Xb^');
      expect(new BlissSVGBuilder('Xab:5').toString()).toBe('Xa/Xb:5,0');
      expect(new BlissSVGBuilder('Xab^').warnings).toEqual([]);
    });
  });

  describe('when a definition name starts with X but leaves the letter namespace', () => {
    // define() refuses a name that is X followed only by letters, since the
    // parser would always read it as external text. XRAY1 carries a digit, so
    // it is outside that namespace and define() allows it, but the expander
    // used to eat the letters anyway and leave XY1 as an unknown code, so the
    // guard and the parser disagreed about which names are reachable.
    const DIGIT_DEFS = { XRAY1: { codeString: 'B291' } };
    beforeAll(() => BlissSVGBuilder.define(DIGIT_DEFS));
    afterAll(() => Object.keys(DIGIT_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('resolves the definition instead of expanding its letters', () => {
      const result = BlissParser.parse('XRAY1');
      expect(result.groups[0].glyphs.map(g => g.parts[0].codeName)).toEqual(['B291']);
    });
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
