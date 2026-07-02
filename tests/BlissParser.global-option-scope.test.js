import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { GLOBAL_ONLY_OPTION_KEYS } from '../src/lib/bliss-constants.js';

/**
 * Pins the global-only option KEY gate (audit N-2): a builder-canvas option
 * key written at group, character, or part level warns MISPLACED_GLOBAL_OPTION,
 * is dropped from the bracket, and the content still renders byte-identically
 * (every gated key is inert at those levels; the drop is render-neutral).
 *
 * Covers:
 * - The curated key set as an exact-set pin against GLOBAL_ONLY_OPTION_KEYS.
 * - Every curated key at group `[k]|`, character `[k]`, and part `[k]>` level:
 *   warn + drop + byte-identical render + the key never re-serializes.
 * - Mixed brackets drop only the global-only key(s), one warning per key.
 * - `;;`-overlay codes (`B303;;[k]>B81`): the key is stripped from the STORED
 *   overlay string (SIB-2 stores codes verbatim, parsed only at render-merge),
 *   clean overlay codes stay verbatim.
 * - Definition-baked keys gate at use (uniform key-scope rule; unlike the 5a
 *   B4 bracket-placement precedent, a canvas key never renders at these
 *   levels, so the def-baked drop is render-neutral).
 * - toJSON object rebuilds do not resurrect a dropped key (5a review F1 class).
 * - Exclusions stay untouched: `text` (silent no-op stub at EVERY level incl.
 *   global), the dot-sizing family, per-element keys, x/y positioning.
 * - The setOptions scope boundary: an API-stored key serializes and surfaces
 *   the warning at the NEXT parse of the serialized form.
 *
 * Does NOT cover:
 * - Gating of structured API input itself (setOptions objects, hand-authored
 *   toJSON input): the trusted structured surface is deliberately ungated;
 *   only its serialized form warns on reparse (boundary pinned here and in
 *   `ElementHandle.mutation-parse-warnings.test.js`).
 * - What each key DOES at the global level (grid rendering in
 *   `BlissSVGBuilder.grid.test.js`, margins/crop in the options suites).
 * - The group-option bracket-placement arm, see
 *   `BlissParser.group-option-placement.test.js`.
 * - Quoted option values with special characters (pre-existing serializeOptions
 *   emission class; backlog "Quoted ] inside an option value").
 *
 * The 36-key matrix exceeds the ~30-test soft cap as one it.each data table
 * (the guide's sanctioned inline-table form); splitting it would separate the
 * set pin from the behavior it pins.
 */
describe('BlissParser global option scope', () => {
  // Kebab keys as written in the DSL. Deliberately a literal list, asserted
  // set-equal to the exported registry below: a key wrongly ADDED to the
  // registry fails the set pin instead of silently passing its own gate tests.
  const CURATED_KEYS = [
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'crop', 'crop-top', 'crop-bottom', 'crop-left', 'crop-right',
    'grid', 'grid-color', 'grid-major-color', 'grid-medium-color',
    'grid-minor-color', 'grid-sky-color', 'grid-earth-color',
    'grid-stroke-width', 'grid-major-stroke-width', 'grid-medium-stroke-width',
    'grid-minor-stroke-width', 'grid-sky-stroke-width', 'grid-earth-stroke-width',
    'background', 'background-top', 'background-mid', 'background-bottom',
    'center', 'min-width', 'char-space', 'word-space', 'external-glyph-space',
    'svg-title', 'svg-desc', 'svg-height', 'error-placeholder',
  ];
  const BOOLEAN_KEYS = new Set(['grid', 'center', 'error-placeholder', 'crop']);
  // Bracket text for a key: boolean keys use the bare form, color-like keys
  // get a color value, the rest a small number ('hi' for the svg-text pair).
  const bracketFor = (key) => {
    if (BOOLEAN_KEYS.has(key)) return `[${key}]`;
    if (/color|background/.test(key)) return `[${key}=red]`;
    if (/title|desc/.test(key)) return `[${key}=hi]`;
    return `[${key}=2]`;
  };

  const FIXTURES = {
    GOPT_PARTOPT: { codeString: '[margin=2]>B291' },     // def baking a part-level canvas key
    GOPT_NESTCHAR: { codeString: '[margin=2]B291/C8' },  // def carrying a char-level canvas key on a word
    // compound indicator baking a canvas key: reaches the gate only through the
    // ;; render-merge parse (external review 2026-07-02 F1)
    GOPT_BAKEDIND: { type: 'glyph', codeString: '[margin=2]>B81', isIndicator: true },
  };
  beforeAll(() => BlissSVGBuilder.define(FIXTURES));
  afterAll(() => Object.keys(FIXTURES).forEach((k) => BlissSVGBuilder.removeDefinition(k)));

  const build = (input) => new BlissSVGBuilder(input);
  const codes = (input) => build(input).warnings.map((w) => w.code);

  describe('when the curated key set is compared to the exported registry', () => {
    it('matches GLOBAL_ONLY_OPTION_KEYS as an exact set', () => {
      expect([...GLOBAL_ONLY_OPTION_KEYS].sort()).toEqual([...CURATED_KEYS].sort());
    });
  });

  describe('when a global-only key is written at a non-global level', () => {
    // pins render-neutrality: every gated key is inert at group/char/part, so
    // the drop must leave the svg byte-identical to the bare control.
    it.each(CURATED_KEYS)('gates %s at group, character, and part level', (key) => {
      const forms = [
        { input: `${bracketFor(key)}|B291/C8`, bare: 'B291/C8' },
        { input: `${bracketFor(key)}B291`, bare: 'B291' },
        { input: `${bracketFor(key)}>B291`, bare: 'B291' },
      ];
      for (const { input, bare } of forms) {
        const gated = build(input);
        expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
        expect(gated.toString()).toBe(bare);
        expect(gated.svgCode).toBe(build(bare).svgCode);
      }
    });

    it('suggests the global form in the warning message', () => {
      const [warning] = build('[margin=2]>B291').warnings;
      expect(warning.message).toContain('[margin=2]||');
      expect(warning.message).toContain('part level');
      expect(warning.source).toBe('margin=2');
    });

    it('names the level the key was written at', () => {
      expect(build('[margin=2]|B291/C8').warnings[0].message).toContain('group level');
      expect(build('[margin=2]B291').warnings[0].message).toContain('character level');
    });

    it('gates a part bracket inside a ;-composition', () => {
      const gated = build('H;[grid]>B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      // pins the boolean written form: a bare key reports itself bare, not key=true
      expect(gated.warnings[0].source).toBe('grid');
      expect(gated.warnings[0].message).toContain('[grid]||');
      expect(gated.toString()).toBe('H;B81');
      expect(gated.svgCode).toBe(build('H;B81').svgCode);
    });

    it('reparses its own toString without warnings', () => {
      const roundTripped = build(build('[margin=2]B291').toString());
      expect(roundTripped.warnings).toEqual([]);
      expect(roundTripped.toString()).toBe('B291');
    });
  });

  describe('when a bracket mixes a global-only key with per-element keys', () => {
    it('drops only the global-only key at part level', () => {
      const gated = build('[margin=2;color=red]>B291');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('[color=red]>B291');
      expect(gated.svgCode).toBe(build('[color=red]>B291').svgCode);
    });

    it('drops only the global-only key at character level', () => {
      const gated = build('[svg-title=hi;color=red]B291');
      expect(gated.toString()).toBe('[color=red]B291');
      expect(gated.svgCode).toBe(build('[color=red]B291').svgCode);
    });

    it('warns once per dropped key', () => {
      const gated = build('[margin=2;crop-top=1]B291');
      expect(gated.warnings.map((w) => w.code))
        .toEqual(['MISPLACED_GLOBAL_OPTION', 'MISPLACED_GLOBAL_OPTION']);
      expect(gated.warnings.map((w) => w.source)).toEqual(['margin=2', 'crop-top=1']);
      expect(gated.toString()).toBe('B291');
    });
  });

  describe('when a ;; overlay code carries a global-only key in its part option', () => {
    // The overlay stores code STRINGS verbatim and parses them only at
    // render-merge (SIB-2), so the key must be stripped from the STORED string
    // or toString would re-serialize the warned no-op forever.
    it('strips the key from the stored overlay code and warns', () => {
      const gated = build('B303;;[margin=2]>B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B303;;B81');
      expect(gated.svgCode).toBe(build('B303;;B81').svgCode);
    });

    it('keeps the remaining option keys on the overlay code', () => {
      const gated = build('B303;;[margin=2;color=red]>B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B303;;[color=red]>B81');
      expect(gated.svgCode).toBe(build('B303;;[color=red]>B81').svgCode);
    });

    it('stores a clean overlay code verbatim', () => {
      // regression control: SIB-2 option preservation must survive the gate
      const clean = build('B303;;[color=red]>B81');
      expect(clean.warnings).toEqual([]);
      expect(clean.toString()).toBe('B303;;[color=red]>B81');
    });

    it('keeps a clean quoted value byte-identical instead of rebuilding it', () => {
      // pins the nothing-dropped short-circuit: the rebuild emission is
      // unquoted (toString's serializeOptions class), so a clean code that
      // went through it would lose its quotes
      const quoted = build('B303;;[data-t="a b"]>B81');
      expect(quoted.warnings).toEqual([]);
      expect(quoted.toString()).toBe('B303;;[data-t="a b"]>B81');
    });

    it('re-emits a kept bare key in its bare form', () => {
      const gated = build('B303;;[margin=2;data-flag]>B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B303;;[data-flag]>B81');
    });

    it('leaves a baseless option prefix to the unknown-code path', () => {
      // pins the (.+) base requirement: '[margin=2]>' has no code to keep, so
      // it stays verbatim and classifies UNKNOWN_CODE instead of stripping to
      // an empty string (which would store a deliberate-clear overlay)
      const baseless = build('B303;;[margin=2]>');
      expect(baseless.warnings.map((w) => w.code)).toEqual(['UNKNOWN_CODE']);
      expect(baseless.toString()).toBe('B303');
    });

    it('leaves a baseless character-form bracket to the unknown-code path', () => {
      // pins the char-form arm's (.+) requirement symmetrically (round-3
      // review F3): a bracket-only code has no code to keep, so it must not
      // strip to an empty string with a spurious placement warning
      const baseless = build('B303;;[margin=2]');
      expect(baseless.warnings.map((w) => w.code)).toEqual(['UNKNOWN_CODE']);
      expect(baseless.toString()).toBe('B303');
    });

    it('drops a character-form option prefix from an overlay code', () => {
      // regression: external review 2026-07-02 F2 — the [...]-without-> form
      // slipped the gate, re-serializing forever with no warning anywhere
      const gated = build('B303;;[margin=2]B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(gated.toString()).toBe('B303;;B81');
      expect(gated.svgCode).toBe(build('B303;;B81').svgCode);
    });

    it('drops a character-form prefix regardless of its keys', () => {
      // a char-form prefix is inert in overlay position even for stylable
      // keys (the merge extracts parts only; [opts]> is the styled form), so
      // the whole bracket is misplaced, not just canvas keys
      const gated = build('B303;;[color=red]B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(gated.toString()).toBe('B303;;B81');
      expect(gated.svgCode).toBe(build('B303;;B81').svgCode);
    });

    it('warns once per character-form bracket, not per key', () => {
      const gated = build('B303;;[margin=2;color=red]B81');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(gated.toString()).toBe('B303;;B81');
    });

    it('normalizes stacked brackets in one pass, keeping the valid part option', () => {
      // regression: review-fix round 2, F2 — the part-form regex backtracked
      // across [a][b]>CODE as one prefix, so bracket order decided whether a
      // misplaced key re-serialized forever or a VALID later bracket was lost
      const misplacedFirst = build('B303;;[margin=2][color=red]>B81');
      expect(misplacedFirst.warnings.map((w) => w.code)).toEqual(['MISPLACED_CHARACTER_OPTION']);
      expect(misplacedFirst.toString()).toBe('B303;;[color=red]>B81');
      expect(misplacedFirst.svgCode).toBe(build('B303;;[color=red]>B81').svgCode);

      const misplacedSecond = build('B303;;[color=red][margin=2]>B81');
      expect(misplacedSecond.warnings.map((w) => w.code))
        .toEqual(['MISPLACED_CHARACTER_OPTION', 'MISPLACED_GLOBAL_OPTION']);
      expect(misplacedSecond.toString()).toBe('B303;;B81');
      expect(build(misplacedSecond.toString()).warnings).toEqual([]);
    });

    it('strips every stacked character-form bracket in one pass', () => {
      const stacked = build('B303;;[a][b]B81');
      expect(stacked.warnings.map((w) => w.code))
        .toEqual(['MISPLACED_CHARACTER_OPTION', 'MISPLACED_CHARACTER_OPTION']);
      expect(stacked.toString()).toBe('B303;;B81');
      expect(build(stacked.toString()).warnings).toEqual([]);
    });

    it('surfaces a definition-baked key when the definition rides the overlay', () => {
      // regression: external review 2026-07-02 F1 — the overlay stores the def
      // NAME, so the def's baked key is first observable at the render-merge
      // parse; its warnings now reach builder.warnings (re-derived per rebuild)
      const gated = build('B303;;GOPT_BAKEDIND');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.svgCode).toBe(build('B303;;B81').svgCode);
      // the name (not the key) round-trips; the definition still carries the
      // key, so each use re-warns — the def-baked accepted class
      expect(gated.toString()).toBe('B303;;GOPT_BAKEDIND');
      expect(build(gated.toString()).warnings.map((w) => w.code))
        .toEqual(['MISPLACED_GLOBAL_OPTION']);
    });
  });

  describe('when a definition bakes a global-only key', () => {
    // note: unlike the 5a B4 precedent (baked CHARACTER options keep their
    // legacy prepend because they render), a canvas key renders at no
    // non-global level, so the uniform key-scope rule gates baked keys too.
    it('drops the key at use and decomposes without it', () => {
      const gated = build('GOPT_PARTOPT');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B291');
    });

    it('keeps the definition name under preserve', () => {
      // The definition itself still carries the key, so each use re-warns; the
      // preserve form re-emits the NAME, not the gated expansion.
      const gated = build('H;GOPT_PARTOPT');
      expect(gated.toString()).toBe('H;B291');
      expect(gated.toString({ preserve: true })).toBe('H;GOPT_PARTOPT');
    });

    it('drops a nested character-level key carried by a word alias', () => {
      const gated = build('GOPT_NESTCHAR');
      expect(gated.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(gated.toString()).toBe('B291/C8');
      expect(gated.svgCode).toBe(build('B291/C8').svgCode);
    });
  });

  describe('when a definition supplies global-only defaultOptions', () => {
    // regression: review-fix round 2, F1 — defaultOptions carry no parse
    // warning, and a ;; overlay stores the definition NAME, so a global-only
    // key in defaultOptions never reached any warning boundary (silent
    // forever). A definition must be clean: reject at the source, like the
    // codeString guards.
    it('rejects define() with a global-only key', () => {
      const result = BlissSVGBuilder.define({
        GOPT_DEFBAD: { type: 'glyph', codeString: 'B81', isIndicator: true, defaultOptions: { margin: 2 } },
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('margin');
      expect(BlissSVGBuilder.isDefined('GOPT_DEFBAD')).toBe(false);
    });

    it('rejects the camelCase spelling of a global-only key', () => {
      const result = BlissSVGBuilder.define({
        GOPT_DEFCAMEL: { codeString: 'B291', defaultOptions: { marginTop: 2 } },
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('marginTop');
      expect(BlissSVGBuilder.isDefined('GOPT_DEFCAMEL')).toBe(false);
    });

    it('rejects the shape and external-glyph define paths too', () => {
      // pins the guard call on the remaining two define paths (one shared
      // helper, four call sites; glyph and bare are pinned above)
      const shape = BlissSVGBuilder.define({
        GOPT_DEFSHAPE: { type: 'shape', codeString: 'HL4', defaultOptions: { center: true } },
      });
      expect(shape.errors).toHaveLength(1);
      expect(shape.errors[0]).toContain('center');
      const external = BlissSVGBuilder.define({
        GOPT_DEFEXT: { type: 'externalGlyph', getPath: () => 'M0,0h1', char: 'x', width: 4, defaultOptions: { 'svg-height': 2 } },
      });
      expect(external.errors).toHaveLength(1);
      expect(external.errors[0]).toContain('svg-height');
      expect(BlissSVGBuilder.isDefined('GOPT_DEFSHAPE')).toBe(false);
      expect(BlissSVGBuilder.isDefined('GOPT_DEFEXT')).toBe(false);
    });

    it('rejects patchDefinition() adding a global-only key', () => {
      BlissSVGBuilder.define({ GOPT_DEFPATCH: { codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition('GOPT_DEFPATCH', { defaultOptions: { 'svg-title': 'hi' } }))
        .toThrow(/svg-title/);
      BlissSVGBuilder.removeDefinition('GOPT_DEFPATCH');
    });

    it('rejects a key that is not a well-formed option name', () => {
      // regression: round-4 self-review — a key like 'margin=2;color' is not
      // in the curated set, but the serializer emits it unquoted, so the
      // bracket '[margin=2;color=red]' parses as a REAL margin key at the
      // next boundary; definition keys must be option names, full stop
      for (const key of ['margin=2;color', 'mar gin', '-margin', 'b]ad']) {
        const result = BlissSVGBuilder.define({
          GOPT_DEFSMUG: { codeString: 'B291', defaultOptions: { [key]: 'red' } },
        });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('not a valid option name');
        expect(BlissSVGBuilder.isDefined('GOPT_DEFSMUG')).toBe(false);
      }
    });

    it('rejects a whitespace-padded spelling of a global-only key', () => {
      // regression: round-3 review F1 — the serializer emits '[ margin=2]',
      // which the option parser reads as plain margin, so a padded key is the
      // same key at the next boundary (and a ;; overlay never reaches one)
      for (const key of [' margin', 'margin ']) {
        const result = BlissSVGBuilder.define({
          GOPT_DEFPAD: { codeString: 'B291', defaultOptions: { [key]: 2 } },
        });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('margin');
        expect(BlissSVGBuilder.isDefined('GOPT_DEFPAD')).toBe(false);
      }
    });

    it('leaves the definition untouched when a patch is rejected', () => {
      // regression: round-3 review F2 — the guard used to run inside the
      // apply loop, so a rejected patch had already committed earlier
      // properties (property order decided the damage)
      BlissSVGBuilder.define({ GOPT_DEFATOMIC: { codeString: 'B291', defaultOptions: { color: 'blue' } } });
      for (const changes of [
        { codeString: 'C8', defaultOptions: { margin: 2 } },
        { defaultOptions: { margin: 2 }, codeString: 'C8' },
      ]) {
        expect(() => BlissSVGBuilder.patchDefinition('GOPT_DEFATOMIC', changes)).toThrow(/margin/);
        expect(BlissSVGBuilder.getDefinition('GOPT_DEFATOMIC').codeString).toBe('B291');
        expect(BlissSVGBuilder.getDefinition('GOPT_DEFATOMIC').defaultOptions).toEqual({ color: 'blue' });
      }
      BlissSVGBuilder.removeDefinition('GOPT_DEFATOMIC');
    });

    it('accepts per-element defaultOptions unchanged', () => {
      BlissSVGBuilder.define({
        GOPT_DEFOK: { type: 'glyph', codeString: 'B81', isIndicator: true, defaultOptions: { color: 'red' } },
      });
      expect(new BlissSVGBuilder('GOPT_DEFOK').warnings).toEqual([]);
      BlissSVGBuilder.removeDefinition('GOPT_DEFOK');
    });
  });

  describe('when the parse result is rebuilt from toJSON', () => {
    it('does not resurrect the dropped key', () => {
      const gated = build('[margin=2]B291');
      const rebuilt = new BlissSVGBuilder(gated.toJSON());
      expect(rebuilt.warnings).toEqual([]);
      expect(rebuilt.toString()).toBe('B291');
      expect(rebuilt.svgCode).toBe(build('B291').svgCode);
    });

    it('stores no empty options object for a fully gated bracket', () => {
      expect(build('[margin=2]B291').toJSON().groups[0].glyphs[0].options).toBeUndefined();
      expect(build('[margin=2]>B291').toJSON().groups[0].glyphs[0].parts[0].options).toBeUndefined();
    });
  });

  describe('when valid placements use the same keys', () => {
    it.each(CURATED_KEYS)('keeps %s at the global level', (key) => {
      const valid = build(`${bracketFor(key)}||B291`);
      expect(valid.warnings).toEqual([]);
      expect(valid.toString()).toContain(key);
      const roundTripped = build(valid.toString());
      expect(roundTripped.warnings).toEqual([]);
      expect(roundTripped.svgCode).toBe(valid.svgCode);
    });

    it('leaves per-element keys untouched at every level', () => {
      for (const input of ['[color=red]|B291/C8', '[color=red]B291',
        '[stroke-width=1.2]>B291', '[data-foo=1]>B291']) {
        const valid = build(input);
        expect(valid.warnings).toEqual([]);
        expect(valid.toString()).toBe(input);
      }
    });

    it('leaves the dot-sizing family untouched at character and part level', () => {
      const partDot = build('[dot-width=1.4]>B270');
      expect(partDot.warnings).toEqual([]);
      expect(partDot.svgCode).not.toBe(build('B270').svgCode);
      const charDot = build('[sdot-extra-width=0.8]B83');
      expect(charDot.warnings).toEqual([]);
      expect(charDot.svgCode).not.toBe(build('B83').svgCode);
    });

    it('leaves x and y positioning untouched at part level', () => {
      const positioned = build('[x=2;y=3]>B291');
      expect(positioned.warnings).toEqual([]);
      expect(positioned.svgCode).toBe(build('B291:2,3').svgCode);
    });

    it('keeps text as a silent no-op at every level', () => {
      // `text` is an unimplemented stub at EVERY level including global, so it
      // is not "misplaced" anywhere; it stays un-warned until the feature lands.
      for (const { input, bare } of [
        { input: '[text=hello]||B291', bare: 'B291' },
        { input: '[text=hello]|B291/C8', bare: 'B291/C8' },
        { input: '[text=hello]B291', bare: 'B291' },
        { input: '[text=hello]>B291', bare: 'B291' },
      ]) {
        const stub = build(input);
        expect(stub.warnings).toEqual([]);
        expect(stub.svgCode).toBe(build(bare).svgCode);
        expect(stub.toString()).toContain('text=hello');
      }
    });
  });

  describe('when the API stores a global-only key without a parse boundary', () => {
    it('surfaces the warning at the next parse of the serialized form', () => {
      // pins the scope boundary: structured input is trusted as written; the
      // gate lives in the parser, so the key warns when its serialized form
      // crosses the next parse.
      const stored = build('B291');
      stored.glyph(0).setOptions({ margin: 2 });
      expect(stored.warnings).toEqual([]);
      expect(stored.toString()).toBe('[margin=2]B291');
      const reparsed = build(stored.toString());
      expect(reparsed.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(reparsed.toString()).toBe('B291');
    });
  });
});
