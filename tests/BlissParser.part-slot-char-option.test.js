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
 *   (MISPLACED_SPACE_PART) afterwards.
 * - Unchanged contracts: valid placements stay warn-free; a dangling
 *   bracket with no code and slot-0 doubled char brackets keep failing the
 *   whole character.
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
      expect(warned).toContain('MISPLACED_SPACE_PART');
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

    // slot 0 is the character's own option position; a SECOND bracket there
    // is a doubled character option, not a part-slot misplacement — the peel
    // must not fire (unchanged contract: the leftover fails the character)
    it('leaves slot-0 doubled character brackets to the whole-character fail', () => {
      const warned = codes('[color=red][fill=green]B291');
      expect(warned).toContain('UNKNOWN_CODE');
      expect(warned).not.toContain('MISPLACED_CHARACTER_OPTION');
    });
  });
});
