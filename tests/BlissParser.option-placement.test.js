import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the option-placement scope gate: an option written at the wrong
 * granularity warns, is dropped, and the content still renders — mirroring
 * the strict-indicator-separation `;` gate (`[opts]>`↔part, `[opts]`↔
 * character, `[opts]||`↔whole content).
 *
 * Covers:
 * - `[opts]>` on a word alias warns MISPLACED_PART_OPTION (not WORD_AS_PART),
 *   drops the option, and renders the word (single-word and multi-word).
 * - `[opts]>` over a `;`-bearing bare alias runs the MISPLACED gate the
 *   part-option early return used to bypass (F2): the `;`-part warns
 *   MISPLACED_CHARACTER_INDICATOR and is dropped; the option stays.
 * - `[opts]>` on an alias whose codeString bakes its own part option parses
 *   and merges structurally (inner wins per attribute), matching the
 *   multi-code sibling instead of failing as one unknown token.
 * - Character-level `[opts]` on ANY word alias (single-word, multi-word, or
 *   an alias chain ending in a word) warns MISPLACED_CHARACTER_OPTION and is
 *   dropped instead of silently landing on the first character.
 * - A dropped option never re-serializes: `toString` (default and preserve)
 *   omits it and the reparse is warn-free.
 * - Valid placements stay warn-free and byte-unchanged.
 *
 * Does NOT cover:
 * - Builder-canvas option KEYS at element level (N-2 scope gate), a separate
 *   arm (rc.4 pre-Phase-D Chunk 5b; backlog "Builder-canvas options ...
 *   silently inert").
 * - Multi-character X-text words (`[opts]>Xab`), which keep WORD_AS_PART; the
 *   gate covers alias-based words only.
 * - `[opts]>WORD` in a `;`-part slot (`B291;[opts]>WORD`), which keeps
 *   WORD_AS_PART: a word can never BE a part of a character, options or not.
 * - The bare (un-prefixed) `;`-on-alias gate itself, see
 *   `BlissParser.strict-indicator-separation.test.js`.
 *
 * Nested scope: the part-option-on-word gate fires at ANY level (a baked
 * `[opts]>WORDALIAS` behaves like a written one; pre-gate it fail-rendered
 * WORD_AS_PART whose toString re-parsed differently). Baked CHARACTER options
 * keep the legacy first-character prepend (define-side hygiene, out of scope)
 * -- both pinned below.
 */
describe('BlissParser option placement', () => {
  // Bare aliases register through the public define() API. OPTG_INNEROPT's
  // codeString bakes a part option on a SINGLE code (the shape that used to
  // fail at parse); OPTG_INNERPAIR is its multi-code sibling (always parsed).
  const FIXTURES = {
    OPTG_ALIAS: { codeString: 'B291' },                    // bare alias -> single character
    OPTG_WORD: { codeString: 'B291/C8' },                  // bare alias -> one word, two characters
    OPTG_WORDS: { codeString: 'B291//C8' },                // bare alias -> two words
    OPTG_NEST: { codeString: 'OPTG_WORD' },                // direct alias reference (define() inlines it)
    OPTG_DECOR: { codeString: '[color=green]OPTG_WORD' },  // decorated alias hop (NOT inlined)
    OPTG_MARKED: { codeString: 'OPTG_WORD^' },             // head-marked alias hop (NOT inlined)
    OPTG_INNEROPT: { codeString: '[color=red]>B291' },     // single code with baked part option
    OPTG_INNERPAIR: { codeString: '[color=red]>B291;C8' }, // multi-code sibling
    OPTG_SHAPE: { type: 'shape', codeString: 'HL4;VL4' },  // composite shape (one character)
    OPTG_GLYPH: { type: 'glyph', codeString: 'H;S2' },     // real glyph (one character)
    OPTG_BAKED_PART: { codeString: '[color=red]>OPTG_WORD' },   // def baking a misplaced part option
    OPTG_BAKED_CHAR: { codeString: '[color=red]OPTG_WORD' },    // def baking a char option on a word
    OPTG_BAKED_CHARS: { codeString: '[color=red]OPTG_WORDS' },  // def baking a char option on words
    OPTG_BAKED_COMPOSE: { codeString: '[color=red]>OPTG_ALIAS;B81' }, // def composing onto a bare alias
  };
  beforeAll(() => {
    // A coordinate-decorated hop ('OPTG_WORD:1,2') is only definable as a
    // FORWARD reference (validation skips unknown targets); a same-batch or
    // later define is silently not registered, and patchDefinition inlines
    // the target instead. Define it BEFORE its target to get a real hop.
    BlissSVGBuilder.define({ OPTG_SHIFTED: { codeString: 'OPTG_WORD:1,2' } });
    BlissSVGBuilder.define(FIXTURES);
  });
  afterAll(() => ['OPTG_SHIFTED', ...Object.keys(FIXTURES)]
    .forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  const build = (input) => new BlissSVGBuilder(input);
  const codes = (input) => build(input).warnings.map((w) => w.code);

  describe('when a part option [...]> wraps a word alias', () => {
    it('warns MISPLACED_PART_OPTION instead of WORD_AS_PART', () => {
      const warned = codes('[color=red]>OPTG_WORD');
      expect(warned).toContain('MISPLACED_PART_OPTION');
      expect(warned).not.toContain('WORD_AS_PART');
    });

    it('drops the option and renders the word', () => {
      expect(build('[color=red]>OPTG_WORD').svgCode).toBe(build('OPTG_WORD').svgCode);
    });

    it('emits exactly one warning for the dropped option', () => {
      expect(codes('[color=red]>OPTG_WORD')).toEqual(['MISPLACED_PART_OPTION']);
    });

    it('does not re-serialize the dropped option', () => {
      const b = build('[color=red]>OPTG_WORD');
      expect(b.toString()).toBe('B291/C8');
      expect(b.toString({ preserve: true })).toBe('B291/C8');
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('warns and renders both words on a multi-word alias', () => {
      expect(codes('[color=red]>OPTG_WORDS')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[color=red]>OPTG_WORDS').svgCode).toBe(build('OPTG_WORDS').svgCode);
    });

    it('names the option and the alias in the message', () => {
      const warning = build('[color=red]>OPTG_WORD').warnings[0];
      expect(warning.message).toContain('[color=red]');
      expect(warning.message).toContain('OPTG_WORD');
    });

    it('still gates a word alias carrying a coordinate suffix', () => {
      expect(codes('[color=red]>OPTG_WORD:1,2')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[color=red]>OPTG_WORD:1,2').svgCode).toBe(build('OPTG_WORD:1,2').svgCode);
    });

    // regression: external review 2026-07-02 F2 — word detection followed only
    // exact registry-key hops, so a DECORATED alias hop escaped the gate and
    // failed as UNKNOWN_CODE (define() inlines undecorated direct references,
    // so only decorated hops survive as real chains).
    it('gates an option-decorated alias hop that resolves to a word', () => {
      expect(codes('[stroke-width=1.2]>OPTG_DECOR')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[stroke-width=1.2]>OPTG_DECOR').svgCode).toBe(build('OPTG_DECOR').svgCode);
    });

    it('gates a head-marked alias hop that resolves to a word', () => {
      const warned = codes('[color=red]>OPTG_MARKED');
      expect(warned).toContain('MISPLACED_PART_OPTION');
      expect(warned).not.toContain('UNKNOWN_CODE');
      expect(build('[color=red]>OPTG_MARKED').svgCode).toBe(build('OPTG_MARKED').svgCode);
    });

    it('gates a coordinate-decorated alias hop that resolves to a word', () => {
      expect(codes('[color=red]>OPTG_SHIFTED')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[color=red]>OPTG_SHIFTED').svgCode).toBe(build('OPTG_SHIFTED').svgCode);
    });
  });

  describe('when a part option [...]> wraps a ;-bearing bare alias', () => {
    // F2: the [...]> early return used to skip the gate that the bare form
    // C5-style input hits (strict-indicator-separation contract).
    it('warns MISPLACED_CHARACTER_INDICATOR like the un-prefixed form', () => {
      expect(codes('[color=red]>OPTG_ALIAS;B97')).toEqual(['MISPLACED_CHARACTER_INDICATOR']);
    });

    it('drops the ;-part but keeps the validly placed option', () => {
      const b = build('[color=red]>OPTG_ALIAS;B97');
      expect(b.toString()).toBe('[color=red]>B291');
      expect(b.toString({ preserve: true })).toBe('[color=red]>OPTG_ALIAS');
      expect(b.svgCode).toBe(build('[color=red]>OPTG_ALIAS').svgCode);
    });

    it('round-trips warn-free after the drop', () => {
      const b = build('[color=red]>OPTG_ALIAS;B97');
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('warns both codes on a ;-bearing word alias and renders the word', () => {
      const warned = codes('[color=red]>OPTG_WORD;B97');
      expect(warned).toContain('MISPLACED_PART_OPTION');
      expect(warned).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(build('[color=red]>OPTG_WORD;B97').svgCode).toBe(build('OPTG_WORD').svgCode);
    });

    it('warns both codes on a ;-bearing multi-word alias and renders the words', () => {
      const warned = codes('[color=red]>OPTG_WORDS;B97');
      expect(warned).toContain('MISPLACED_PART_OPTION');
      expect(warned).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(build('[color=red]>OPTG_WORDS;B97').svgCode).toBe(build('OPTG_WORDS').svgCode);
    });

    it('names the dropped ;-part and the alias in the message', () => {
      const warning = build('[color=red]>OPTG_ALIAS;B97').warnings[0];
      expect(warning.message).toContain(';B97');
      expect(warning.message).toContain('OPTG_ALIAS');
    });

    it('leaves a trailing ; inert behind the option', () => {
      const b = build('[color=red]>OPTG_ALIAS;');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]>B291');
    });

    it('dumb-appends the ;-part on a composite shape alias', () => {
      // pins the !isShape discriminator conjunct: a composite shape is a
      // single character, so ; composes onto it rather than being misplaced
      const warned = codes('[color=red]>OPTG_SHAPE;B81');
      expect(warned).toEqual([]);
      expect(build('[color=red]>OPTG_SHAPE;B81').toString()).toContain(';B81');
    });

    it('dumb-appends the ;-part on a glyph alias', () => {
      // pins the glyph-flag discriminator conjuncts: a glyph is a single
      // character, so ; composes onto it rather than being misplaced
      expect(codes('[color=red]>OPTG_GLYPH;B97')).toEqual([]);
    });
  });

  describe('when a part option [...]> wraps an alias with its own baked part option', () => {
    // Chunk 3 finding: this single-code shape failed at parse as one unknown
    // token while the multi-code sibling parsed fine.
    it('parses without UNKNOWN_CODE and renders the glyph', () => {
      const b = build('[color=blue]>OPTG_INNEROPT');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('<path');
    });

    it('serializes with the baked option winning on the shared attribute', () => {
      // structural-merge parity with the multi-code sibling (inner wins)
      expect(build('[color=blue]>OPTG_INNEROPT').toString()).toBe('[color=red]>B291');
    });

    it('keeps the alias name under preserve mode', () => {
      expect(build('[color=blue]>OPTG_INNEROPT').toString({ preserve: true }))
        .toBe('[color=blue]>OPTG_INNEROPT');
    });

    it('merges a disjoint outer key alongside the baked option', () => {
      expect(build('[stroke-width=1.2]>OPTG_INNEROPT').toString())
        .toBe('[stroke-width=1.2;color=red]>B291');
    });

    it('reaches a warn-free serialization fixpoint', () => {
      const b = build('[color=blue]>OPTG_INNEROPT');
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.toString()).toBe(b.toString());
    });

    it('keeps the multi-code sibling byte-unchanged', () => {
      const b = build('[color=blue]>OPTG_INNERPAIR');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]>B291;[color=blue]>C8');
    });

    // regression: external review 2026-07-02 F1 — the nest-parse fix covered
    // only the string parser; the object-rebuild paths (default toJSON strips
    // nested parts) still turned the baked option into one unknown codeName.
    it('rebuilds identically from default toJSON()', () => {
      const orig = build('[color=blue]>OPTG_INNEROPT');
      const rebuilt = new BlissSVGBuilder(orig.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.svgCode).toBe(orig.svgCode);
    });

    it('rebuilds identically from preserve toJSON()', () => {
      const orig = build('[color=blue]>OPTG_INNEROPT');
      const rebuilt = new BlissSVGBuilder(orig.toJSON({ preserve: true }));
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.svgCode).toBe(orig.svgCode);
    });

    it('parses a positioned use of the alias and rebuilds it', () => {
      const orig = build('OPTG_INNEROPT:1,2');
      expect(orig.warnings).toEqual([]);
      const rebuilt = new BlissSVGBuilder(orig.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.svgCode).toBe(orig.svgCode);
    });

    it('nest-parses in a ;-part slot and rebuilds it', () => {
      const orig = build('B291;[x=2]>OPTG_INNEROPT');
      expect(orig.warnings).toEqual([]);
      const rebuilt = new BlissSVGBuilder(orig.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.svgCode).toBe(orig.svgCode);
    });
  });

  describe('when a coordinate suffix omits an axis', () => {
    // regression: external review 2026-07-02 F3 — the gate suffix regexes
    // required an x value while the coordinate grammar accepts either axis
    // omitted, so equivalent spellings (:,2 vs :0,2) took different paths
    it('gates a part option on a y-only positioned word alias', () => {
      expect(codes('[color=blue]>OPTG_WORD:,2')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[color=blue]>OPTG_WORD:,2').svgCode).toBe(build('OPTG_WORD:0,2').svgCode);
    });

    it('gates a part option on an x-only positioned word alias', () => {
      expect(codes('[color=blue]>OPTG_WORD:2')).toEqual(['MISPLACED_PART_OPTION']);
      expect(build('[color=blue]>OPTG_WORD:2').svgCode).toBe(build('OPTG_WORD:2,0').svgCode);
    });

    it('gates a char option on a y-only positioned word alias', () => {
      expect(codes('[color=blue]OPTG_WORD:,2')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(build('[color=blue]OPTG_WORD:,2').svgCode).toBe(build('OPTG_WORD:0,2').svgCode);
    });

    it('runs the ;-gate behind a part option with a y-only coordinate', () => {
      expect(codes('[color=blue]>OPTG_ALIAS:,2;B97')).toEqual(['MISPLACED_CHARACTER_INDICATOR']);
      expect(build('[color=blue]>OPTG_ALIAS:,2;B97').svgCode)
        .toBe(build('[color=blue]>OPTG_ALIAS:,2').svgCode);
    });

    it('renders a y-only positioned word alias like its explicit-zero form', () => {
      const b = build('OPTG_WORD:,2');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toBe(build('OPTG_WORD:0,2').svgCode);
    });

    it('keeps a y-only coordinate on a glyph unchanged', () => {
      const b = build('B291:,2');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('B291:0,2');
    });
  });

  describe('when a character option [opts] sits on a word alias', () => {
    // B4 (folds audit N-3): the option used to land silently on the FIRST
    // character only.
    it('warns MISPLACED_CHARACTER_OPTION on a single-word alias', () => {
      expect(codes('[color=red]OPTG_WORD')).toEqual(['MISPLACED_CHARACTER_OPTION']);
    });

    it('drops the option instead of landing it on the first character', () => {
      const b = build('[color=red]OPTG_WORD');
      expect(b.toString()).toBe('B291/C8');
      expect(b.svgCode).toBe(build('OPTG_WORD').svgCode);
    });

    it('warns and renders both words on a multi-word alias', () => {
      expect(codes('[color=red]OPTG_WORDS')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(build('[color=red]OPTG_WORDS').svgCode).toBe(build('OPTG_WORDS').svgCode);
    });

    it('warns on an alias chain that ends in a word', () => {
      expect(codes('[color=red]OPTG_NEST')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(build('[color=red]OPTG_NEST').svgCode).toBe(build('OPTG_NEST').svgCode);
    });

    it('warns on a decorated alias hop that resolves to a word', () => {
      expect(codes('[color=red]OPTG_DECOR')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(build('[color=red]OPTG_DECOR').svgCode).toBe(build('OPTG_DECOR').svgCode);
    });

    it('round-trips warn-free after the drop', () => {
      const b = build('[color=red]OPTG_WORD');
      const reparsed = build(b.toString());
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('adds the indicator warning when a ;-part is also present', () => {
      const warned = codes('[color=red]OPTG_WORD;B97');
      expect(warned).toContain('MISPLACED_CHARACTER_OPTION');
      expect(warned).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(build('[color=red]OPTG_WORD;B97').svgCode).toBe(build('OPTG_WORD').svgCode);
    });

    it('gates a word-alias segment inside a written word', () => {
      const b = build('B313/[color=red]OPTG_WORD');
      expect(codes('B313/[color=red]OPTG_WORD')).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(b.svgCode).toBe(build('B313/OPTG_WORD').svgCode);
    });

    it('names the option and the alias in the message', () => {
      const warning = build('[color=red]OPTG_WORD').warnings[0];
      expect(warning.message).toContain('[color=red]');
      expect(warning.message).toContain('OPTG_WORD');
    });
  });

  describe('when the misplacement is baked inside a definition', () => {
    it('gates a baked part option on a word alias at any level', () => {
      // a def baking [opts]>WORDALIAS behaves like the written form; the old
      // WORD_AS_PART fail toString'd to a form that re-parsed differently
      const b = build('OPTG_BAKED_PART');
      expect(codes('OPTG_BAKED_PART')).toEqual(['MISPLACED_PART_OPTION']);
      expect(b.toString()).toBe('B291/C8');
      expect(b.svgCode).toBe(build('OPTG_WORD').svgCode);
    });

    it('keeps the legacy first-character prepend for a baked char option on a word', () => {
      // define-side hygiene is out of the gate's scope: only WRITTEN char
      // options are gated; a baked one keeps the pre-gate behavior
      const b = build('OPTG_BAKED_CHAR');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]B291/C8');
    });

    it('keeps the legacy first-character prepend for a baked char option on a multi-word', () => {
      const b = build('OPTG_BAKED_CHARS');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]B291//C8');
    });

    it('keeps a baked ;-part composing on a bare alias inside a definition', () => {
      // pins the F2 gate's top-level scope: definitions compose (nested ; on
      // a bare alias dumb-appends), only WRITTEN input meets the gate
      const b = build('OPTG_BAKED_COMPOSE');
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe('[color=red]>B291;B81');
    });
  });

  describe('when options are validly placed', () => {
    it.each([
      ['[color=red]B291'],
      ['[color=red]OPTG_ALIAS', '[color=red]B291'],
      ['[color=red]B291/C8'],
      ['[color=red]>B291'],
      ['[color=red]>OPTG_ALIAS', '[color=red]>B291'],
      ['[color=red]>B291;B81'],
    ])('keeps %s warn-free and stable', (input, expected = input) => {
      const b = build(input);
      expect(b.warnings).toEqual([]);
      expect(b.toString()).toBe(expected);
    });

    it('keeps the char option when only the ;-part of a single-glyph alias is misplaced', () => {
      const b = build('[color=red]OPTG_ALIAS;B97');
      expect(codes('[color=red]OPTG_ALIAS;B97')).toEqual(['MISPLACED_CHARACTER_INDICATOR']);
      expect(b.toString()).toBe('[color=red]B291');
    });

    it('leaves an unknown ;-bearing base out of the gate', () => {
      // an unknown code is a single-character slot: dumb behavior, no gate
      const warned = codes('[color=red]>ZZOPTG;B97');
      expect(warned).not.toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(warned).not.toContain('MISPLACED_PART_OPTION');
    });
  });
});
