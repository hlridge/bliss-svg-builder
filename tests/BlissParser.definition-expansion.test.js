import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins parser expansion of definitions: low-level expandParts() processing
 * and high-level parse()-with-definition behaviors, including recursive
 * expansion across `//` word breaks and `;` part superimposition.
 *
 * Covers:
 * - BlissParser.expandParts() resolves a part's codeName against its
 *   definition: replaces the codeName with the definition target, expands
 *   composite codeStrings into nested parts, and applies definition metadata
 *   (defaultOptions, anchor offsets) onto the part object.
 * - Recursive part expansion through nested codeString references is bounded
 *   by MAX_RECURSION_DEPTH; the parser allows exactly MAX_RECURSION_DEPTH
 *   recursion and throws above it (both at the part level and across `//`
 *   word segments).
 * - Indicator replacement on custom glyph definitions considers only the
 *   indicator suffix, not the base part, when preserving semantic roots.
 * - Unknown bases remain parseable when empty `;;` syntax leaves the base bare.
 * - Definition defaultOptions merge with pending glyph options instead of
 *   replacing them.
 * - Word-break definitions do not synthesize an explicit head marker when the
 *   definition was not explicitly marked.
 * - Part-level bracket options and position suffixes survive expansion onto
 *   word-alias parts; trailing-junk and leading-invalid position suffixes
 *   record an `Invalid format` error on the part.
 * - Built-in glyph identity (glyphCode, isBlissGlyph), indicator metadata,
 *   head markers, and defaultOptions propagate from definitions onto the
 *   parsed glyph; a non-indicator built-in carries no isIndicator through the
 *   fast-path; an explicit `isIndicator: false` declared by a definition
 *   is dropped rather than propagated.
 * - Base-case metadata (shrinksPrecedingWordSpace, isIndicator,
 *   isExternalGlyph, char, kerningRules) propagates from no-codeString
 *   definitions onto the parsed glyph alongside empty-strip options and a
 *   leading position.
 * - Word-level codeString splitting on `//` expands into separate groups
 *   with TSP insertion between them; an outer position lands on the first
 *   part of the leading word (without overwriting an existing one); glyph
 *   options and head marker prepend to the leading word; internal
 *   word-segment indicators stay literal across the split.
 * - A multi-word definition carrying an internal head marker, referenced
 *   through another alias, keeps its word break and the designated head of
 *   its non-first word, rendering identically to the directly-written form;
 *   a trailing indicator bound to the multi-word alias fails the whole unit
 *   (group.errorCode); adjacent // breaks seal into empty word chunks without
 *   throwing.
 * - XTXT_ fallback parts mark the enclosing glyph as an external glyph.
 *
 * Does NOT cover:
 * - Definition API validation and maintenance, see
 *   `BlissSVGBuilder.define.test.js` and
 *   `BlissSVGBuilder.definition-maintenance.test.js`.
 */
describe('BlissParser definition expansion', () => {
  const c9DefinitionKeys = [];

  const defineC9 = (key, definition) => {
    blissElementDefinitions[key] = definition;
    c9DefinitionKeys.push(key);
  };

  const c15bDefinitionKeys = [];

  const defineC15b = (key, definition) => {
    blissElementDefinitions[key] = definition;
    c15bDefinitionKeys.push(key);
  };

  const partCodes = glyph => glyph.parts.map(part => part.codeName);

  beforeAll(() => {
    defineC9('_C9_COMPOSITE', { codeString: 'VL8;HL8' });
    defineC9('_C9_SIMPLE_ALIAS', { codeString: 'Xa' });
    defineC9('_C9_UNKNOWN_ALIAS', { codeString: '_C9_MISSING_TARGET' });
    defineC9('_C9_METADATA', {
      codeString: 'C8',
      defaultOptions: { color: 'red' },
      anchorOffsetX: 3,
      anchorOffsetY: -2
    });

    defineC9('_C9_NESTED', { codeString: 'C8:0,8' });
    defineC9('_C9_OUTER_NESTED', { codeString: '_C9_NESTED;H' });
    defineC9('_C9_NESTED_ALIAS', { codeString: 'Xa' });
    defineC9('_C9_OUTER_ALIAS', { codeString: '_C9_NESTED_ALIAS;H' });
    defineC9('_C9_WORD_ALIAS', { codeString: 'H/C' });
    defineC9('_C9_OUTER_WORD', { codeString: '_C9_WORD_ALIAS;H' });
    defineC9('_C9_NESTED_UNKNOWN', { codeString: '_C9_MISSING_TARGET' });
    defineC9('_C9_OUTER_UNKNOWN', { codeString: '_C9_NESTED_UNKNOWN;H' });

    for (let i = 0; i <= 50; i++) {
      defineC9(`_C9_DEPTH_${i}`, { codeString: `_C9_DEPTH_${i + 1};H` });
    }
    defineC9('_C9_DEPTH_51', { codeString: 'H' });

    for (let i = 0; i <= 51; i++) {
      defineC9(`_C9_TOO_DEEP_${i}`, { codeString: `_C9_TOO_DEEP_${i + 1};H` });
    }
    defineC9('_C9_TOO_DEEP_52', { codeString: 'H' });

    defineC15b('_C15B_SENTENCE', {
      codeString: 'B291//B313',
      glyphCode: '_C15B_SENTENCE',
      isBlissGlyph: true
    });
    defineC15b('_C15B_SENTENCE_POSITIONED', { codeString: 'B291:9,8//B313' });
    defineC15b('_C15B_SENTENCE_SEMI_POSITION', { codeString: 'B291;B97//B313' });
    defineC15b('_C15B_SENTENCE_REPLACE_GUARD', {
      codeString: '_C15B_SINGLE_WITH_SEMANTIC;B81//B313'
    });
    defineC15b('_C15B_SENTENCE_TOO_DEEP', { codeString: '_C15B_TOO_DEEP_0//B313' });
    defineC15b('_C15B_POS_WORD', { codeString: 'B291/B313' });
    defineC15b('_C15B_POS_WORD_POSITIONED', { codeString: 'B291:9,8/B313' });

    defineC15b('_C15B_WORD_SEMANTIC', {
      codeString: 'B486/B291;B97/B313',
      glyphCode: '_C15B_WORD_SEMANTIC',
      isBlissGlyph: true
    });
    defineC15b('_C15B_WORD_NONSEM', { codeString: 'B486/B291;B81/B313' });
    defineC15b('_C15B_WORD_FIRST_MARKED', { codeString: 'B486^/B291/B313' });
    defineC15b('_C15B_MULTI_HEAD', { codeString: 'B486^/B291^/B313' });

    defineC15b('_C15B_SINGLE_WITH_SEMANTIC', {
      codeString: 'B291;B97',
      glyphCode: '_C15B_SINGLE_WITH_SEMANTIC',
      isBlissGlyph: true
    });
    defineC15b('_C15B_NESTED_REPLACE_GUARD', {
      codeString: '_C15B_SINGLE_WITH_SEMANTIC;B81',
      glyphCode: '_C15B_NESTED_REPLACE_GUARD',
      isBlissGlyph: true
    });
    defineC15b('_C15B_DEFAULTS', {
      codeString: 'C8:0,8',
      glyphCode: '_C15B_DEFAULTS',
      isBlissGlyph: true,
      defaultOptions: { color: 'orange' }
    });
    defineC15b('_C15B_PLAIN_COMPOSITE', {
      codeString: 'C8:0,8',
      glyphCode: '_C15B_PLAIN_COMPOSITE'
    });
    defineC15b('_C15B_SHRINKS_COMPOSITE', {
      codeString: 'C8:0,8',
      glyphCode: '_C15B_SHRINKS_COMPOSITE',
      isBlissGlyph: true,
      shrinksPrecedingWordSpace: true
    });
    defineC15b('_C15B_INDICATOR_COMPOSITE', {
      codeString: 'AA2N:0,4',
      glyphCode: '_C15B_INDICATOR_COMPOSITE',
      isBlissGlyph: true,
      isIndicator: true
    });
    defineC15b('_C15B_FALSE_INDICATOR_COMPOSITE', {
      codeString: 'C8:0,8',
      glyphCode: '_C15B_FALSE_INDICATOR_COMPOSITE',
      isBlissGlyph: true,
      isIndicator: false
    });
    defineC15b('_C15B_WORD_SHAPE', {
      codeString: 'C8/B291',
      glyphCode: '_C15B_WORD_SHAPE',
      isBlissGlyph: true
    });
    defineC15b('_C15B_RAW_BASE', {
      shrinksPrecedingWordSpace: true,
      isIndicator: true,
      isExternalGlyph: true,
      char: 'z',
      kerningRules: { H: -2 },
      glyphCode: '_C15B_RAW_BASE',
      isBlissGlyph: true
    });
    defineC15b('_C15B_RAW_PLAIN', {
      glyphCode: '_C15B_RAW_PLAIN'
    });

    for (let i = 0; i <= 49; i++) {
      defineC15b(`_C15B_DEPTH_${i}`, { codeString: `_C15B_DEPTH_${i + 1}` });
    }
    defineC15b('_C15B_DEPTH_50', {});

    for (let i = 0; i <= 50; i++) {
      defineC15b(`_C15B_TOO_DEEP_${i}`, { codeString: `_C15B_TOO_DEEP_${i + 1}` });
    }
    defineC15b('_C15B_TOO_DEEP_51', {});
  });

  afterAll(() => {
    for (const key of c9DefinitionKeys) {
      delete blissElementDefinitions[key];
    }
    for (const key of c15bDefinitionKeys) {
      delete blissElementDefinitions[key];
    }
  });

  describe('when expandParts expands a part referencing a direct definition', () => {
    it('leaves parts with existing expanded children unchanged', () => {
      const part = { codeName: '_C9_COMPOSITE', parts: [{ codeName: 'KEEP' }] };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.codeName).toBe('_C9_COMPOSITE');
      expect(part.parts).toEqual([{ codeName: 'KEEP' }]);
    });

    it('expands codeName parts when the parts array exists but is empty', () => {
      const part = { codeName: '_C9_COMPOSITE', parts: [] };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.parts.map(p => p.codeName)).toEqual(['VL8', 'HL8']);
    });

    it('leaves unknown code names untouched without throwing', () => {
      const part = { codeName: '_C9_NOT_DEFINED' };

      expect(() => BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] }))
        .not.toThrow();
      expect(part).toEqual({ codeName: '_C9_NOT_DEFINED' });
    });

    it('resolves simple aliases to their target codeName', () => {
      const part = { codeName: '_C9_SIMPLE_ALIAS' };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.codeName).toBe('Xa');
      expect(part.parts).toBeUndefined();
    });

    it('resolves aliases whose target is not defined without throwing', () => {
      const part = { codeName: '_C9_UNKNOWN_ALIAS' };

      expect(() => BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] }))
        .not.toThrow();
      expect(part.codeName).toBe('_C9_MISSING_TARGET');
      expect(part.parts).toBeUndefined();
    });

    it('applies definition metadata while expanding JSON parts', () => {
      const part = { codeName: '_C9_METADATA' };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.codeName).toBe('C8');
      expect(part.options).toEqual({ color: 'red' });
      expect(part.anchorOffsetX).toBe(3);
      expect(part.anchorOffsetY).toBe(-2);
    });
  });

  describe('when expandParts expands a part referencing a definition with a nested codeString', () => {
    it('expands nested part definitions inside composite codeStrings', () => {
      const part = { codeName: '_C9_OUTER_NESTED' };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.parts[0].codeName).toBe('_C9_NESTED');
      expect(part.parts[0].parts).toEqual([
        expect.objectContaining({ codeName: 'C8', x: 0, y: 8 })
      ]);
      expect(part.parts[1].codeName).toBe('H');
    });

    it('resolves nested simple aliases to their target codeName', () => {
      const part = { codeName: '_C9_OUTER_ALIAS' };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.parts[0].codeName).toBe('Xa');
      expect(part.parts[0].parts).toBeUndefined();
      expect(part.parts[1].codeName).toBe('H');
    });

    it('preserves word-level codeStrings at part level', () => {
      const part = { codeName: '_C9_OUTER_WORD' };
      BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] });

      expect(part.parts[0].codeName).toBe('_C9_WORD_ALIAS');
      expect(part.parts[0].parts).toBeUndefined();
      expect(part.parts[1].codeName).toBe('H');
    });

    it('resolves nested aliases whose target is not defined without throwing', () => {
      const part = { codeName: '_C9_OUTER_UNKNOWN' };

      expect(() => BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] }))
        .not.toThrow();
      expect(part.parts[0].codeName).toBe('_C9_MISSING_TARGET');
      expect(part.parts[0].parts).toBeUndefined();
      expect(part.parts[1].codeName).toBe('H');
    });

    it('allows recursion at exactly MAX_RECURSION_DEPTH', () => {
      const part = { codeName: '_C9_DEPTH_0' };

      expect(() => BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] }))
        .not.toThrow();
    });

    it('throws the exact recursion-depth error above MAX_RECURSION_DEPTH', () => {
      const part = { codeName: '_C9_TOO_DEEP_0' };

      expect(() => BlissParser.expandParts({ groups: [{ glyphs: [{ parts: [part] }] }] }))
        .toThrow('Maximum recursion depth exceeded');
    });
  });

  describe('when an indicator is applied to a compound-indicator glyph', () => {
    it('keeps the compound indicator whole instead of replacing its parts', () => {
      const code = 'COMPOUND_INDICATOR_PASSTHROUGH_PIN';
      // R15 D-S1a: B97;B81 is all-indicator, so it must be a compound indicator
      // (isIndicator:true). Applying an indicator to a compound indicator does
      // NOT decompose+replace its parts; the base-vs-indicator replace path is
      // for base+indicator characters, which are aliases now, not glyphs.
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B97;B81', isIndicator: true } }, { overwrite: true });

      try {
        const parsed = BlissParser.parse(`${code};B86`);
        const partCodes = parsed.groups[0].glyphs[0].parts.map(part => part.codeName);

        expect(partCodes).toEqual([code, 'B86']);
        // pins the compound-indicator replace guard (bliss-parser.js
        // baseIsCompoundIndicator): dropping it would decompose to ['B97','B86'].
      } finally {
        BlissSVGBuilder.removeDefinition(code);
      }
    });
  });

  describe('when empty word-level indicator syntax uses an unknown base', () => {
    it('keeps the unknown base parseable after stripping to the bare code', () => {
      const parsed = BlissParser.parse('UNKNOWNIDENTITYPIN;;');
      const partCodes = parsed.groups[0].glyphs[0].parts.map(part => part.codeName);

      expect(partCodes).toEqual(['UNKNOWNIDENTITYPIN']);
      // pins defensive identity update; killed line 412 optional-chain mutant in 2026-05 Stryker run.
    });
  });

  describe('when defaultOptions merge onto a glyph with pending options', () => {
    it('preserves pending relative kerning while applying definition defaults', () => {
      const code = 'DEFAULT_OPTIONS_KERNING_PIN';
      BlissSVGBuilder.define({ [code]: { codeString: 'B313', defaultOptions: { color: 'red' } } }, { overwrite: true });

      try {
        const parsed = BlissParser.parse(`RK:1/${code}`);
        const glyphOptions = parsed.groups[0].glyphs[0].options;

        expect(glyphOptions).toMatchObject({ color: 'red', relativeKerning: 1 });
        // pins option merge fallback; killed line 873 false-spread mutant in 2026-05 Stryker run.
      } finally {
        BlissSVGBuilder.removeDefinition(code);
      }
    });
  });

  describe('when an unmarked definition expands across a word break', () => {
    it('does not mark the first expanded glyph as an explicit head glyph', () => {
      const code = 'WORDBREAKHEADPIN';
      // a multi-word (`//`) definition is a bare alias, not a glyph (Strict
      // Indicator Separation, F4); the word-break head-marking is unchanged.
      BlissSVGBuilder.define({ [code]: { codeString: 'B10//B4' } }, { overwrite: true });

      try {
        const parsed = BlissParser.parse(code);
        const firstGlyph = parsed.groups[0].glyphs[0];

        expect(firstGlyph.isHeadGlyph).toBeUndefined();
        // pins head-marker propagation; killed line 665 forced-true mutant in 2026-05 Stryker run.
      } finally {
        BlissSVGBuilder.removeDefinition(code);
      }
    });
  });

  describe('when expanding a definition preserves part-level options and position suffixes', () => {
    it('keeps external metadata and head marker on part-level option input', () => {
      const r = BlissParser.parse('[color=red]>Xa^/B291');
      const externalGlyph = r.groups[0].glyphs[0];

      expect(externalGlyph.isHeadGlyph).toBe(true);
      expect(externalGlyph.isExternalGlyph).toBe(true);
      expect(externalGlyph.char).toBe('a');
      expect(Object.hasOwn(externalGlyph, 'kerningRules')).toBe(true);
      expect(externalGlyph.parts[0].options).toEqual({ color: 'red' });
      expect(r.groups[0].glyphs[1].glyphCode).toBe('B291');
    });

    it('applies a multi-digit positive x and a leading-dot negative y to a word alias', () => {
      const r = BlissParser.parse('_C15B_POS_WORD:12.34,-.75');

      expect(r.groups[0].glyphs[0].parts[0].x).toBe(12.34);
      expect(r.groups[0].glyphs[0].parts[0].y).toBe(-0.75);
      expect(r.groups[0].glyphs.map(glyph => glyph.glyphCode))
        .toEqual(['B291', 'B313']);
    });

    it('applies leading-dot positive decimals on both axes to a word alias', () => {
      const r = BlissParser.parse('_C15B_POS_WORD:.55,.75');

      expect(r.groups[0].glyphs[0].parts[0].x).toBe(0.55);
      expect(r.groups[0].glyphs[0].parts[0].y).toBe(0.75);
      expect(r.groups[0].glyphs.map(glyph => glyph.glyphCode))
        .toEqual(['B291', 'B313']);
    });

    it('applies a single-digit decimal x and a multi-digit negative y to a word alias', () => {
      const r = BlissParser.parse('_C15B_POS_WORD:1.2,-12.34');

      expect(r.groups[0].glyphs[0].parts[0].x).toBe(1.2);
      expect(r.groups[0].glyphs[0].parts[0].y).toBe(-12.34);
      expect(r.groups[0].glyphs.map(glyph => glyph.glyphCode))
        .toEqual(['B291', 'B313']);
    });

    it('does not overwrite an existing first-part position in word aliases', () => {
      const r = BlissParser.parse('_C15B_POS_WORD_POSITIONED:2,0');
      const firstPart = r.groups[0].glyphs[0].parts[0];

      expect(r.groups[0].glyphs.map(glyph => glyph.parts[0].codeName))
        .toEqual(['B291', 'B313']);
      expect(firstPart.x).toBe(9);
      expect(firstPart.y).toBe(8);
    });

    it('does not treat a trailing-junk suffix as a valid position', () => {
      const r = BlissParser.parse('_C15B_POS_WORD:2,0junk');

      expect(r.groups[0].glyphs[0].parts[0].error)
        .toBe('Invalid format: _C15B_POS_WORD:2,0junk');
    });

    it('does not recover a positioned alias after a leading invalid character', () => {
      const r = BlissParser.parse('!_C15B_POS_WORD:2,0');

      expect(r.groups[0].glyphs[0].parts[0].error)
        .toBe('Invalid format: !_C15B_POS_WORD:2,0');
    });
  });

  describe('when expanding a definition propagates built-in and base-case metadata onto the glyph', () => {
    it('keeps built-in glyph identity while carrying empty-strip options and position', () => {
      const r = BlissParser.parse('[color=blue]B291:2,0;');
      const glyph = r.groups[0].glyphs[0];

      expect(glyph.glyphCode).toBe('B291');
      expect(glyph.isBlissGlyph).toBe(true);
      expect(glyph.options).toEqual({ color: 'blue' });
      expect(glyph.parts).toHaveLength(1);
      expect(glyph.parts[0]).toEqual(expect.objectContaining({
        codeName: 'B291',
        x: 2,
        y: 0
      }));
    });

    it('preserves built-in indicator identity, head marker, and default options', () => {
      const r = BlissParser.parse('ANCHORRING^');
      const glyph = r.groups[0].glyphs[0];

      expect(glyph.isIndicator).toBe(true);
      expect(glyph.glyphCode).toBe('ANCHORRING');
      expect(glyph.isBlissGlyph).toBe(true);
      expect(glyph.isHeadGlyph).toBe(true);
      expect(glyph.options).toEqual({ 'stroke-dasharray': '0 0.777' });
    });

    it('does not mark a non-indicator built-in glyph as an indicator', () => {
      // The built-in fast-path spreads isIndicator only when the definition
      // declares it; B291 (Enclosure) is not an indicator. Killed the
      // `definition.isIndicator === true` -> true mutant (2026-05-21 stryker).
      const glyph = BlissParser.parse('B291').groups[0].glyphs[0];

      expect(Object.hasOwn(glyph, 'isIndicator')).toBe(false);
    });

    it('propagates glyphCode and defaultOptions from a custom composite definition', () => {
      const glyph = BlissParser.parse('_C15B_DEFAULTS').groups[0].glyphs[0];

      expect(glyph.glyphCode).toBe('_C15B_DEFAULTS');
      expect(glyph.options).toEqual({ color: 'orange' });
      expect(Object.hasOwn(glyph, 'isIndicator')).toBe(false);
    });

    it('propagates shrinksPrecedingWordSpace from a custom composite definition', () => {
      const glyph = BlissParser.parse('_C15B_SHRINKS_COMPOSITE').groups[0].glyphs[0];

      expect(glyph.shrinksPrecedingWordSpace).toBe(true);
    });

    it('propagates isIndicator from an indicator composite definition', () => {
      const glyph = BlissParser.parse('_C15B_INDICATOR_COMPOSITE').groups[0].glyphs[0];

      expect(glyph.isIndicator).toBe(true);
    });

    it('does not propagate an explicit isIndicator=false from a custom composite definition', () => {
      const glyph = BlissParser.parse('_C15B_FALSE_INDICATOR_COMPOSITE').groups[0].glyphs[0];

      expect(Object.hasOwn(glyph, 'isIndicator')).toBe(false);
    });

    it('does not propagate shrinksPrecedingWordSpace or isIndicator when the composite definition omits them', () => {
      const glyph = BlissParser.parse('_C15B_PLAIN_COMPOSITE').groups[0].glyphs[0];

      expect(Object.hasOwn(glyph, 'shrinksPrecedingWordSpace')).toBe(false);
      expect(Object.hasOwn(glyph, 'isIndicator')).toBe(false);
    });

    it('does not apply top-level indicator replacement inside slashless nested definitions', () => {
      const r = BlissParser.parse('_C15B_NESTED_REPLACE_GUARD');
      const glyph = r.groups[0].glyphs[0];

      expect(glyph.glyphCode).toBe('_C15B_NESTED_REPLACE_GUARD');
      expect(partCodes(glyph)).toEqual(['_C15B_SINGLE_WITH_SEMANTIC', 'B81']);
      expect(partCodes(glyph.parts[0])).toEqual(['B291', 'B97']);
    });

    it('keeps per-glyph identity for multi-glyph custom words', () => {
      const r = BlissParser.parse('_C15B_WORD_SHAPE');
      const [shapeGlyph, blissGlyph] = r.groups[0].glyphs;

      expect(shapeGlyph.parts[0].codeName).toBe('C8');
      expect(shapeGlyph.isBlissGlyph).toBe(true);
      expect(Object.hasOwn(shapeGlyph, 'glyphCode')).toBe(false);
      expect(blissGlyph.glyphCode).toBe('B291');
    });

    it('propagates all base-case metadata alongside empty-strip options and position', () => {
      const r = BlissParser.parse('[color=blue]_C15B_RAW_BASE:2,0;');
      const glyph = r.groups[0].glyphs[0];

      expect(glyph.shrinksPrecedingWordSpace).toBe(true);
      expect(glyph.isIndicator).toBe(true);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.char).toBe('z');
      expect(glyph.kerningRules).toEqual({ H: -2 });
      expect(glyph.glyphCode).toBe('_C15B_RAW_BASE');
      expect(glyph.isBlissGlyph).toBe(true);
      expect(glyph.options).toEqual({ color: 'blue' });
      expect(glyph.parts[0]).toEqual(expect.objectContaining({
        codeName: '_C15B_RAW_BASE',
        x: 2,
        y: 0
      }));
    });

    it('does not propagate base-case metadata when the definition declares none', () => {
      const glyph = BlissParser.parse('_C15B_RAW_PLAIN').groups[0].glyphs[0];

      expect(Object.hasOwn(glyph, 'shrinksPrecedingWordSpace')).toBe(false);
      expect(Object.hasOwn(glyph, 'isIndicator')).toBe(false);
    });
  });

  describe('when a definition codeString contains // word breaks', () => {
    it('splits // inside definitions into word groups with an implicit space', () => {
      const r = BlissParser.parse('_C15B_SENTENCE');

      expect(r.groups).toHaveLength(3);
      expect(r.groups[0].glyphs[0].glyphCode).toBe('B291');
      expect(Object.hasOwn(r.groups[0].glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
      expect(r.groups[2].glyphs[0].glyphCode).toBe('B313');
      expect(Object.hasOwn(r.groups[2].glyphs[0], 'isHeadGlyph')).toBe(false);
    });

    it('applies the outer position to the first part of the leading split word', () => {
      const r = BlissParser.parse('_C15B_SENTENCE:2,0');

      expect(r.groups[0].glyphs[0].parts[0]).toEqual(expect.objectContaining({
        codeName: 'B291',
        x: 2,
        y: 0
      }));
    });

    it('does not overwrite a leading part position that the definition already sets', () => {
      const r = BlissParser.parse('_C15B_SENTENCE_POSITIONED:2,0');

      expect(r.groups[0].glyphs[0].parts[0]).toEqual(expect.objectContaining({
        codeName: 'B291',
        x: 9,
        y: 8
      }));
    });

    it('places the outer position on the first part when the leading word has multiple ;-superimposed parts', () => {
      const r = BlissParser.parse('_C15B_SENTENCE_SEMI_POSITION:2,0');

      expect(r.groups[0].glyphs[0].parts.map(part => part.codeName))
        .toEqual(['B291', 'B97']);
      expect(r.groups[0].glyphs[0].parts[0].x).toBe(2);
      expect(r.groups[0].glyphs[0].parts[0].y).toBe(0);
    });

    it('prepends glyph options to the first split word and drops the head marker', () => {
      // Head-marker contract rule 1: a multi-word definition expands to
      // multiple characters, so the outer ^ is dropped with a warning.
      const r = BlissParser.parse('[color=red]_C15B_SENTENCE^');
      const firstGlyph = r.groups[0].glyphs[0];

      expect(firstGlyph.options).toEqual({ color: 'red' });
      expect(Object.hasOwn(firstGlyph, 'isHeadGlyph')).toBe(false);
      expect(r.groups[2].glyphs[0].options).toBeUndefined();
      expect(Object.hasOwn(r.groups[2].glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(r._parseWarnings).toEqual([
        expect.objectContaining({ code: 'MISPLACED_HEAD_MARKER' }),
      ]);
    });

    it('keeps internal word-segment indicators literal when expanding // definitions', () => {
      const r = BlissParser.parse('_C15B_SENTENCE_REPLACE_GUARD');
      const head = r.groups[0].glyphs[0];

      expect(head.parts[0].codeName).toBe('_C15B_SINGLE_WITH_SEMANTIC');
      expect(head.parts[0].parts.map(part => part.codeName)).toEqual(['B291', 'B97']);
      expect(head.parts[1].codeName).toBe('B81');
    });
  });

  describe('when a nested alias references a multi-word definition with a designated head', () => {
    // N6: a multi-word alias carrying an internal ^ head (_N6_INNER) is left
    // un-inlined by define() to protect marker scope, so it survives to parse
    // time referenced through _N6_OUTER. The word break and the designated
    // head of its non-first word must survive nested expansion, matching the
    // directly-written form.
    const N6_DEFS = {
      _N6_INNER: { codeString: 'B291//B303^' },
      _N6_OUTER: { codeString: 'B208/_N6_INNER' },
      _N6_DBL_INNER: { codeString: 'B291////B303^' },
      _N6_DBL_OUTER: { codeString: 'B208/_N6_DBL_INNER' },
    };
    beforeAll(() => BlissSVGBuilder.define(N6_DEFS));
    afterAll(() => Object.keys(N6_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('splits the nested multi-word alias into separate word groups with a space', () => {
      const r = BlissParser.parse('_N6_OUTER');
      expect(r.groups).toHaveLength(3);
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
    });

    it('keeps the designated head of the non-first word through nested expansion', () => {
      const r = BlissParser.parse('_N6_OUTER');
      expect(Object.hasOwn(r.groups[0].glyphs[0], 'isHeadGlyph')).toBe(false);
      expect(r.groups[2].glyphs[0].isHeadGlyph).toBe(true);
    });

    it('renders the nested form identically to the directly-written multi-word form', () => {
      const nested = new BlissSVGBuilder('_N6_OUTER').svgCode;
      const direct = new BlissSVGBuilder('B208/B291//B303^').svgCode;
      expect(nested).toBe(direct);
    });

    it('fails the whole unit when a trailing indicator binds to the multi-word alias', () => {
      // R2 corpus task 4 / Decision 6: an indicator bound to a multi-word alias
      // (one token expanding past a word break) targets no single head, so the
      // whole unit fails to one placeholder (group.errorCode), uniformly for
      // direct and nested aliases. Supersedes the earlier first-word-head attach
      // (;B81 -> B208), which was itself inconsistent: it attached only because
      // _N6_INNER carries a ^; without the ^ the same shape silently dropped.
      const r = BlissParser.parse('_N6_OUTER;B81');
      expect(r.groups).toHaveLength(1);
      expect(r.groups[0].errorCode).toBe('MALFORMED_WORD_INDICATOR');
      expect(r.groups[0].errorSource).toBe('_N6_OUTER;B81');
    });

    it('seals empty word chunks from adjacent breaks without throwing', () => {
      // Adjacent // breaks in a nested alias produce an empty middle chunk;
      // the chunk guard keeps resolveWordStringHead from running on [], and the
      // second word's designated head still survives.
      const r = BlissParser.parse('_N6_DBL_OUTER');
      expect(r.groups.map(g => g.glyphs[0].parts[0].codeName))
        .toEqual(['B208', 'TSP', 'TSP', 'B303']);
      expect(r.groups[3].glyphs[0].isHeadGlyph).toBe(true);
    });
  });

  describe('when recursive expansion approaches MAX_RECURSION_DEPTH', () => {
    it('allows expand recursion at exactly MAX_RECURSION_DEPTH', () => {
      expect(() => BlissParser.parse('_C15B_DEPTH_0')).not.toThrow();
    });

    it('throws the exact recursion-depth error above MAX_RECURSION_DEPTH', () => {
      expect(() => BlissParser.parse('_C15B_TOO_DEEP_0'))
        .toThrow('Maximum recursion depth exceeded');
    });

    it('throws the exact recursion-depth error inside // word segments', () => {
      expect(() => BlissParser.parse('_C15B_SENTENCE_TOO_DEEP'))
        .toThrow('Maximum recursion depth exceeded');
    });
  });

  describe('when an unrecognized Xword falls back to XTXT_ text rendering', () => {
    it('marks XTXT fallback glyphs as external glyphs', () => {
      const alpha = String.fromCharCode(0x03B1);
      const r = BlissParser.parse(`Xh${alpha}llo`);
      const glyph = r.groups[0].glyphs[0];

      expect(glyph.parts[0].codeName).toBe(`XTXT_h${alpha}llo`);
      expect(glyph.isExternalGlyph).toBe(true);
    });
  });
});
