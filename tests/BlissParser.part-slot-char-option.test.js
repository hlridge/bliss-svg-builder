import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the part-slot character-option peel: a `[opts]` bracket WITHOUT `>` is
 * a CHARACTER option by syntax, so one appearing after a `;` in a part slot
 * is a misplaced character option on a valid code — it warns
 * MISPLACED_CHARACTER_OPTION, the bracket is dropped, and the part renders
 * (run-to-stable Phase 2.2). Before the fix the same inputs either silently
 * mangled (a leading part option let the char-option regex backtrack across
 * `]>…;[`, relocating the first option to character scope and eating every
 * part before the bracket) or failed the whole character as one
 * UNKNOWN_CODE token.
 *
 * Covers:
 * - Case a (silent-mangle regression): `[opts]>S8;[opts]C8` renders BOTH
 *   parts, keeps the leading part option at part scope, warns for the
 *   misplaced bracket, and serializes to the peeled form.
 * - Case b: `S8;[opts]C8` (and the indicator-part sibling `B291;[opts]B81`)
 *   warns + drops the bracket + renders, with part coordinates preserved.
 * - A genuinely-invalid code after the peeled bracket still fails the
 *   character (UNKNOWN_CODE; the unknown token is kept per the retention
 *   contract).
 * - Stacked brackets peel one warning each; a stacked prefix ending in a
 *   `[opts]>` part option keeps that part option (regression: the
 *   parsePartString blob-match silently merged the stack).
 * - The same misplacement baked in a definition codeString warns and
 *   renders like the written form.
 * - DSL/API parity: `addPart('[opts]CODE')` behaves byte-identically to the
 *   DSL spelling.
 * - A peeled space part still meets the space-part invariant
 *   (MISPLACED_SPACE) afterwards.
 * - Unchanged contracts: valid placements stay warn-free, and a dangling
 *   bracket with no code left to render still fails the whole character.
 * - Cross-scope consistency (GH #40). A separator written with no bracket
 *   carries no options at every scope, so the code stays plain content
 *   (`||CODE`, `|CODE`, `>CODE`), including in a later part slot
 *   (`S8;>C8` renders both parts) and over an empty slot (`S8;>` is inert);
 *   a doubled separator (`>>CODE`) is still refused. More than one bracket
 *   at ONE scope warns `MULTIPLE_OPTION_BRACKETS`, applies the first and
 *   renders, at every scope and for every code class including word aliases.
 *   The legal different-scope adjacency (`[char][part]>CODE`,
 *   `[global]||[word]|CODE`) stays warning-free, which is what the `>` stop
 *   condition in the peel is for. All of it pinned on the definition path
 *   too, where a codeString carries RAW brackets rather than placeholders.
 *
 * Does NOT cover:
 * - `;;` overlay char-form bracket strips, see
 *   `BlissParser.global-option-scope.test.js` and
 *   `BlissParser.double-semicolon.test.js`.
 * - X-run routing behind an option bracket, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 * - Object-input `{glyphs:[{codeString}]}` ingestion quirks (pre-existing
 *   DUPLICATE_KEY noise on that surface, unrelated to the peel).
 * - Global-only KEYS inside an otherwise valid bracket
 *   (MISPLACED_GLOBAL_OPTION), see `BlissParser.global-option-scope.test.js`.
 */
describe('BlissParser part-slot character options', () => {
  beforeAll(() => {
    BlissSVGBuilder.define({ PSLOT_DEF: { codeString: 'S8:0,8;[fill=green]C8:0,8' } });
    BlissSVGBuilder.define({ PSLOT_QDEF: { codeString: 'S8;[data-x="a]b"]C8' } });
  });
  afterAll(() => ['PSLOT_DEF', 'PSLOT_QDEF']
    .forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  const build = (input) => new BlissSVGBuilder(input);
  const codes = (input) => build(input).warnings.map((w) => w.code);

  describe('when a >-less bracket follows a leading part option', () => {
    // regression: the char-option regex backtracked across `]>…;[` and
    // captured `[fill=red]>S8:0,8;[fill=green]` as ONE character-option
    // blob — C8 rendered alone with fill=red at character scope, silently
    it('renders both parts and keeps the leading part option at part scope', () => {
      const b = build('[fill=red]>S8:0,8;[fill=green]C8:0,8');
      expect(b.svgCode).toBe(build('[fill=red]>S8:0,8;C8:0,8').svgCode);
    });

    it('warns MISPLACED_CHARACTER_OPTION for the misplaced bracket', () => {
      expect(codes('[fill=red]>S8:0,8;[fill=green]C8:0,8'))
        .toEqual(['MISPLACED_CHARACTER_OPTION']);
    });

    it('serializes to the peeled form and reparses warn-free', () => {
      const b = build('[fill=red]>S8:0,8;[fill=green]C8:0,8');
      expect(b.toString()).toBe('[fill=red]>S8:0,8;C8:0,8');
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });
  });

  describe('when a >-less bracket sits in a later part slot', () => {
    it('warns, drops the bracket, and renders both parts', () => {
      const b = build('S8:0,8;[fill=green]C8:0,8');
      expect(codes('S8:0,8;[fill=green]C8:0,8')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.svgCode).toBe(build('S8:0,8;C8:0,8').svgCode);
      expect(b.toString()).toBe('S8:0,8;C8:0,8');
    });

    it('preserves the part coordinates written after the bracket', () => {
      const parts = build('S8:0,8;[fill=green]C8:0,8').toJSON().groups[0].glyphs[0].parts;
      expect(parts[1].x).toBe(0);
      expect(parts[1].y).toBe(8);
    });

    it('drops a misplaced bracket before an indicator part', () => {
      const b = build('B291;[color=red]B81');
      expect(codes('B291;[color=red]B81')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.toString()).toBe('B291;B81');
      expect(b.svgCode).toBe(build('B291;B81').svgCode);
    });

    it('names the bracket and the part-option remedy in the message', () => {
      const warning = build('S8:0,8;[fill=green]C8:0,8').warnings[0];
      expect(warning.message).toContain('[fill=green]');
      expect(warning.message).toContain('[fill=green]>');
      expect(warning.message).toContain('C8');
    });
  });

  describe('when the code after the peeled bracket is invalid', () => {
    it('still fails the character and keeps the unknown token', () => {
      const b = build('S8:0,8;[fill=green]ZZ9');
      const warned = codes('S8:0,8;[fill=green]ZZ9');
      expect(warned).toContain('MISPLACED_CHARACTER_OPTION');
      expect(warned).toContain('UNKNOWN_CODE');
      // retention contract: the well-formed unknown code survives, the
      // character fail-renders
      expect(b.toString()).toBe('S8:0,8;ZZ9');
      expect(b.svgCode).not.toContain('<path');
    });
  });

  describe('when the bracket has no code after it', () => {
    // a dangling bracket invalidates the slot itself: no valid code exists
    // to render, so the whole character keeps failing (unchanged contract)
    it('keeps failing the whole character', () => {
      const warned = codes('S8;[fill=green]');
      expect(warned).toContain('UNKNOWN_CODE');
      expect(warned).not.toContain('MISPLACED_CHARACTER_OPTION');
      expect(build('S8;[fill=green]').svgCode).not.toContain('<path');
    });

    // regression: the Invalid-format message surfaced the internal token
    // literally ([PLACEHOLDER_0]) instead of the written bracket
    it('names the written bracket in the failure message, not the internal token', () => {
      const warning = build('S8;[fill=green]').warnings.find((w) => w.code === 'UNKNOWN_CODE');
      expect(warning.message).toContain('[fill=green]');
      expect(warning.message).not.toContain('PLACEHOLDER');
    });

    // pins the one-bracket-token peel class: a `.*?` body would backtrack
    // across `]>…[` and peel `[a]>[b]` as one blob instead of leaving the
    // part-option-then-bracket stack on the whole-character fail path
    it('keeps a part option followed by a stacked bracket on the fail path', () => {
      const warned = codes('S8;[color=red]>[fill=green]C8');
      expect(warned).toContain('UNKNOWN_CODE');
      expect(warned).not.toContain('MISPLACED_CHARACTER_OPTION');
    });
  });

  describe('when brackets stack in a part slot', () => {
    it('peels one warning per misplaced bracket and renders the part', () => {
      const b = build('S8;[color=red][fill=green]C8');
      expect(codes('S8;[color=red][fill=green]C8'))
        .toEqual(['MISPLACED_CHARACTER_OPTION', 'MISPLACED_CHARACTER_OPTION']);
      expect(b.toString()).toBe('S8;C8');
      expect(b.svgCode).toBe(build('S8;C8').svgCode);
    });

    // regression: parsePartString matched `[color=red][fill=green]` as one
    // options blob, applied color=red as a PART option, and silently lost
    // fill=green — zero warnings
    it('keeps a trailing part option behind a peeled bracket', () => {
      const b = build('S8;[color=red][fill=green]>C8');
      expect(codes('S8;[color=red][fill=green]>C8')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.toString()).toBe('S8;[fill=green]>C8');
      expect(b.svgCode).toBe(build('S8;[fill=green]>C8').svgCode);
    });
  });

  describe('when the misplaced bracket is baked in a definition codeString', () => {
    it('warns and renders like the written form', () => {
      const b = build('PSLOT_DEF');
      expect(codes('PSLOT_DEF')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.svgCode).toBe(build('S8:0,8;C8:0,8').svgCode);
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    // pins the quote-aware peel body: definition codeStrings carry RAW
    // brackets, so a bare [^\]] body truncated at the quoted `]` and
    // garbled the warning while the written (tokenized) twin peeled
    // cleanly (review fix, 2026-07-17)
    it('peels a quoted-bracket value in a definition like the written twin', () => {
      const b = build('PSLOT_QDEF');
      expect(codes('PSLOT_QDEF')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.warnings[0].message).toContain('[data-x="a]b"]');
      expect(b.svgCode).toBe(build('S8;C8').svgCode);
      const written = build('S8;[data-x="a]b"]C8');
      expect(written.warnings.map((w) => w.code)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(written.svgCode).toBe(b.svgCode);
    });
  });

  describe('when the bracket sits in a part slot with an empty base', () => {
    // a leading ';' makes an indicator-only glyph; the slot AFTER that ';'
    // is still a part slot, so the peel gates on the raw separator index,
    // not the filtered part position (review fix, 2026-07-17)
    it('peels the bracket and renders the indicator-only glyph', () => {
      const b = build(';[fill=green]B86');
      expect(codes(';[fill=green]B86')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.svgCode).toBe(build(';B86').svgCode);
      expect(b.toString()).toBe(build(';B86').toString());
    });
  });

  describe('when the misplaced spelling arrives through addPart', () => {
    it('matches the DSL twin byte for byte', () => {
      const viaApi = build('S8:0,8');
      viaApi.group(0).glyph(0).addPart('[fill=green]C8:0,8');
      const viaDsl = build('S8:0,8;[fill=green]C8:0,8');
      expect(viaApi.warnings.map((w) => w.code)).toContain('MISPLACED_CHARACTER_OPTION');
      expect(viaApi.toString()).toBe(viaDsl.toString());
      expect(viaApi.svgCode).toBe(viaDsl.svgCode);
    });
  });

  describe('when the peeled part is a space code', () => {
    it('drops the space part under the space invariant after the peel', () => {
      const b = build('B291;[color=red]QSP');
      const warned = codes('B291;[color=red]QSP');
      expect(warned).toContain('MISPLACED_CHARACTER_OPTION');
      expect(warned).toContain('MISPLACED_SPACE');
      expect(b.toString()).toBe('B291');
      expect(b.svgCode).toBe(build('B291').svgCode);
    });
  });

  describe('when option placement is valid', () => {
    it('keeps a slot-0 character option warn-free and applied', () => {
      const b = build('[color=red]B291;C8');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]B291;C8');
    });

    it('keeps a later-slot part option warn-free and applied', () => {
      const b = build('S8:0,8;[fill=green]>C8:0,8');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('S8:0,8;[fill=green]>C8:0,8');
      expect(b.toJSON().groups[0].glyphs[0].parts[1].options).toEqual({ fill: 'green' });
    });

    // slot 0 is the character's own option position; a SECOND bracket there is
    // a doubled character option, not a part-slot misplacement, so the peel
    // must not fire. This is what the test guards; the doubled bracket itself
    // is handled by the duplicate rule below (it used to fail the character).
    it('reports a doubled slot-0 bracket as a duplicate, not as a part-slot misplacement', () => {
      const warned = codes('[color=red][fill=green]B291');
      expect(warned).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(warned).not.toContain('MISPLACED_CHARACTER_OPTION');
    });
  });

  // An option separator written with no bracket in front of it carries no
  // options, and all four scopes now tolerate that: the code stays plain
  // content, warn-free. The part separator used to be the odd one out
  // (`>B291` failed the whole character, `S8;>C8` destroyed BOTH parts), which
  // is what GH #40 is about. The one whole-character fail here that IS settled
  // is the DANGLING bracket (`S8;[fill=green]`), which has no code left to
  // render; everywhere else a valid code sits right after the separator.
  describe('when an option separator is written without its bracket', () => {
    it('keeps a bare global separator as plain content', () => {
      const b = build('||B291');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B291');
      expect(b.svgCode).toBe(build('B291').svgCode);
    });

    it('keeps a bare word separator as plain content', () => {
      const b = build('|B291');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B291');
      expect(b.svgCode).toBe(build('B291').svgCode);
    });

    it.each([
      ['>B291', 'B291'],
      ['>Xm', 'Xm'],
      ['>B291/B99', 'B291/B99'],
    ])('keeps a bare part separator as plain content: %s', (input, plain) => {
      const b = build(input);
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe(plain);
      expect(b.svgCode).toBe(build(plain).svgCode);
    });

    it('keeps both parts when the bare separator opens a later part slot', () => {
      const b = build('S8;>C8');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('S8;C8');
      expect(b.svgCode).toBe(build('S8;C8').svgCode);
    });

    it('leaves a bracketed part option working exactly as before', () => {
      const b = build('[color=red]>B291');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]>B291');
      expect(b.svgCode).toContain('red');
    });

    it('treats a bare separator over an empty part slot as the inert slot it is', () => {
      // `S8;` is inert and renders S8; `S8;>` is the same empty slot with an
      // empty option region in front of it, so it must be inert too. It used
      // to fail and serialize to `S8`, which reparsed into a different render.
      const b = build('S8;>');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('S8');
      expect(b.svgCode).toBe(build('S8;').svgCode);
      expect(build(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('still refuses a doubled bare separator, as the global scope does', () => {
      // One empty option region is tolerated; two is not a spelling of
      // anything. `||||B291` is not tolerated at the global scope either.
      expect(codes('>>B291')).toContain('UNKNOWN_CODE');
    });

    it('gives a letter run behind a bare separator the same treatment as the other scopes', () => {
      // A letter run is expanded before the option regions are read, and the
      // pass only recognized a BRACKETED prefix, so a bare `>` blocked it: the
      // run reached the code lookup whole and failed. `||`, `|` and even an
      // empty `[]>` all rendered it, which left the part scope the odd one out
      // at exactly the boundary this describe exists to remove.
      for (const prefix of ['||', '|', '[]>', '>']) {
        const b = build(`${prefix}Xhello`);
        expect(b.warnings).toEqual([]);
        // the run expanded rather than reaching the code lookup whole: counted
        // in the tree, because toString() re-collapses it to `Xhello` (#19)
        expect(b.toJSON().groups[0].glyphs).toHaveLength(5);
        expect(b.toString()).toBe('Xhello');
        expect(b.svgCode).toBe(build('Xhello').svgCode);
      }
    });

    it('keeps the glyph identity, so the code is plain content and not an empty option region', () => {
      // The documented rule for a bare separator is that it "carries no options
      // and stays plain content", so `>B291` must be `B291`, not `[]>B291`
      // (which is a real, if empty, part-option region and leaves the glyph
      // anonymous). Identity is what tells the two apart.
      expect(build('>B291').toJSON().groups[0].glyphs[0].codeName).toBe('B291');
      expect(build('>B291').toJSON()).toEqual(build('B291').toJSON());
    });
  });

  // Two adjacent brackets at ONE scope are invalid syntax ("one bracket per
  // scope"), and all four scopes now handle it the same way: warn
  // MULTIPLE_OPTION_BRACKETS, apply the first bracket, render. Character and
  // part used to report UNKNOWN_CODE and destroy the whole character instead;
  // the warning had been scoped to the two option-REGION levels on the grounds
  // that char/part duplicates "already surface UNKNOWN_CODE", i.e. were not
  // silent, but non-silent is weaker than the option system's documented
  // "content still renders", which the other two scopes met.
  //
  // The constraint the fix had to respect: adjacent brackets at DIFFERENT
  // scopes are VALID and warning-free (`[char][part]>CODE`,
  // `[global]||[word]|CODE`), so the rule cannot simply count brackets. It is
  // the `>` that separates the scopes, so the peel stops at a bracket wearing
  // one, which is what tells `[a][b]` from `[a][b]>`. GH #40.
  describe('when two option brackets are written at one scope', () => {
    it('warns and still renders at global scope, applying the first bracket', () => {
      const b = build('[grid][grid-color=red]||B291');
      expect(codes('[grid][grid-color=red]||B291')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toString()).toBe('[grid]||B291');
      expect(b.toJSON().options).toEqual({ grid: true });
    });

    it('warns and still renders at word scope, applying the first bracket', () => {
      const b = build('[color=red][fill=green]|B291');
      expect(codes('[color=red][fill=green]|B291')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toString()).toBe('[color=red]|B291');
    });

    it('warns and still renders at character scope, applying the first bracket', () => {
      const b = build('[color=red][fill=green]B291');
      expect(codes('[color=red][fill=green]B291')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toString()).toBe('[color=red]B291');
      expect(b.svgCode).toBe(build('[color=red]B291').svgCode);
    });

    it('warns and still renders at part scope, applying the first bracket', () => {
      const b = build('[color=red]>[fill=green]>B291');
      expect(codes('[color=red]>[fill=green]>B291')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toString()).toBe('[color=red]>B291');
      expect(b.svgCode).toBe(build('[color=red]>B291').svgCode);
    });

    it('warns once per extra bracket, however many are written', () => {
      expect(codes('[color=red][fill=green][stroke-width=1]B291'))
        .toEqual(['MULTIPLE_OPTION_BRACKETS', 'MULTIPLE_OPTION_BRACKETS']);
      expect(build('[color=red][fill=green][stroke-width=1]B291').toString()).toBe('[color=red]B291');
    });

    it('names the dropped bracket in the warning', () => {
      const [warning] = build('[color=red][fill=green]B291').warnings;
      expect(warning.source).toBe('[fill=green]');
      expect(warning.message).toContain('[fill=green]');
    });

    it('applies the same rule in a later part slot', () => {
      const b = build('S8;[color=red]>[fill=green]>C8');
      expect(codes('S8;[color=red]>[fill=green]>C8')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(b.toString()).toBe('S8;[color=red]>C8');
      expect(b.svgCode).toBe(build('S8;[color=red]>C8').svgCode);
    });

    it('still fails a dangling bracket, which has no code left to render', () => {
      // The one whole-character fail in this family that IS settled.
      expect(codes('S8;[fill=green]')).toContain('UNKNOWN_CODE');
    });

    it('renders a word alias behind a doubled bracket, not just a single one', () => {
      // "the content still renders" has to hold for every code class, not only
      // single characters. The code behind the brackets must still RESOLVE, so
      // the doubled spelling reaches the same word path the single one does.
      BlissSVGBuilder.define({ _DUPWORD: { codeString: 'B291/B431' } });
      try {
        const single = build('[color=red]_DUPWORD');
        const doubled = build('[color=red][fill=green]_DUPWORD');
        expect(codes('[color=red]_DUPWORD')).toEqual(['MISPLACED_CHARACTER_OPTION']);
        expect(codes('[color=red][fill=green]_DUPWORD'))
          .toEqual(['MULTIPLE_OPTION_BRACKETS', 'MISPLACED_CHARACTER_OPTION']);
        expect(doubled.svgCode).toBe(single.svgCode);
        const partSingle = build('[color=red]>_DUPWORD');
        const partDoubled = build('[color=red]>[fill=green]>_DUPWORD');
        expect(codes('[color=red]>_DUPWORD')).toEqual(['MISPLACED_PART_OPTION']);
        expect(codes('[color=red]>[fill=green]>_DUPWORD'))
          .toEqual(['MULTIPLE_OPTION_BRACKETS', 'MISPLACED_PART_OPTION']);
        expect(partDoubled.svgCode).toBe(partSingle.svgCode);
      } finally {
        BlissSVGBuilder.removeDefinition('_DUPWORD');
      }
    });
  });

  // The legal adjacency the widened detector above must not break: two brackets
  // in a row belonging to DIFFERENT scopes. Both options apply, warning-free.
  describe('when adjacent brackets belong to different scopes', () => {
    it('applies a character option and a part option written back to back', () => {
      const b = build('[color=red][fill=green]>B291');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red][fill=green]>B291');
      const glyph = b.toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(glyph.options).toEqual({ color: 'red' });
      expect(glyph.parts[0].options).toEqual({ fill: 'green' });
    });

    it.each([
      ['[grid]||[color=red]|B291'],
      ['[grid]||[color=red]B291'],
    ])('stays warn-free for %s', (input) => {
      expect(build(input).warnings).toEqual([]);
    });
  });

  // Three brackets before a `>` silently lose one. The part-level matcher uses a
  // lazy `.*?` bracket class, so when the first bracket is not followed by `>`
  // it backtracks ACROSS the following brackets until it finds one, capturing
  // several as a single "bracket" whose option parse keeps only the first. The
  // character-level matcher was tightened to `[^\[\]]*` for exactly this reason;
  // the part-level one was not. The option written with the `>` is the one that
  // vanishes, and nothing warns. Backlog: the GH #40 row, extra criteria (e)/(f).
  describe('when three option brackets precede a part separator', () => {
    it('keeps the two-bracket case whole, the boundary the three-bracket case crosses', () => {
      const b = build('[color=red][fill=blue]>B291');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red][fill=blue]>B291');
    });

    it('applies the outer bracket at character scope and the one wearing the > at part scope', () => {
      const b = build('[color=red][fill=blue][stroke-width=2]>B291');
      expect(codes('[color=red][fill=blue][stroke-width=2]>B291')).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      const glyph = b.toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(glyph.options).toEqual({ color: 'red' });
      expect(glyph.parts[0].options).toEqual({ 'stroke-width': '2' });
    });

    it('names the middle bracket it drops instead of losing it silently', () => {
      const [warning] = build('[color=red][fill=blue][stroke-width=2]>B291').warnings;
      expect(warning.source).toBe('[fill=blue]');
    });

    it('round-trips the surviving spelling', () => {
      const b = build('[color=red][fill=blue][stroke-width=2]>B291');
      expect(b.toString()).toBe('[color=red][stroke-width=2]>B291');
      expect(build(b.toString()).svgCode).toBe(b.svgCode);
      expect(build(b.toString()).warnings).toEqual([]);
    });
  });

  // A definition's codeString carries RAW brackets rather than the tokenized
  // placeholders the top-level input uses, so it reaches the bracket peels by a
  // different route. Every rule above must mean the same thing on both, which is
  // the divergence class the GH #37 chunk had to fix for letter runs.
  describe('when the same spelling is baked in a definition codeString', () => {
    const DEFS = {
      _OPT_CHAR: { codeString: '[color=red]B291' },
      _OPT_DUP_CHAR: { codeString: '[color=red][fill=green]B291' },
      _OPT_PART: { codeString: '[color=red]>B291' },
      _OPT_DUP_PART: { codeString: '[color=red]>[fill=green]>B291' },
      _OPT_CROSS: { codeString: '[color=red][fill=green]>B291' },
      _OPT_BARE: { codeString: '>B291' },
      _OPT_BARE_SLOT: { codeString: 'S8;>C8' },
    };
    beforeAll(() => BlissSVGBuilder.define(DEFS));
    afterAll(() => Object.keys(DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it.each(Object.entries(DEFS))('renders %s exactly like its written twin', (name, def) => {
      const viaDefinition = build(name);
      const written = build(def.codeString);
      expect(viaDefinition.svgCode).toBe(written.svgCode);
      expect(viaDefinition.warnings.map(w => w.code)).toEqual(written.warnings.map(w => w.code));
    });
  });

  // A definition used in a LATER part slot is re-parsed by a nested pass that
  // no glyph-level peel has run over, so a doubled bracket baked in its
  // codeString still reaches the raw string. Parity breaks there: the written
  // twin renders, the definition does not. Pre-existing (both spellings failed
  // before GH #40 too) and it belongs to the registered "definition-side
  // ingestion is quote-unaware" family, so it is pinned, not fixed here. The
  // active tests pin the floor that DOES hold, visible-not-silent, and they are
  // also what kills the surviving lazy-bracket-class mutant recorded in
  // mutation-testing.md.
  describe('when a definition bakes a doubled bracket and is used as a later part', () => {
    const NESTED = {
      _DUP_NESTED: { codeString: '[color=red][fill=green]>[stroke-width=2]>C8' },
      _DUP_QUOTED: { codeString: '[data-x="a]b"]>[fill=green]>C8' },
    };
    beforeAll(() => BlissSVGBuilder.define(NESTED));
    afterAll(() => Object.keys(NESTED).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it.each(Object.keys(NESTED))('fails %s visibly rather than applying a bracket silently', (name) => {
      const b = build(`S8;${name}`);
      expect(b.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(b.toString()).toBe('S8');
    });

    it('renders the written twin of each, which is what parity would give', () => {
      for (const def of Object.values(NESTED)) {
        expect(build(`S8;${def.codeString}`).svgCode).not.toBe(build('S8').svgCode);
      }
    });

    it.todo('renders a definition-baked doubled bracket like its written twin in a part slot');
  });
});
