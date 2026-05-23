import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins typeless custom code aliases as transparent macros: an alias name
 * resolves to its codeString expansion in the element tree, in toString
 * output, and in rendered SVG, with no separate identity preserved.
 *
 * Covers:
 * - Single-glyph aliases (alias resolves to one B-code).
 * - Multi-character word aliases (`/`-separated expansion).
 * - Character-composition aliases (`;`-separated inline expansion).
 * - Sentence-level aliases (`//`-separated multi-word expansion).
 * - Alias chaining (alias referencing another alias, multi-level resolution).
 * - Type restriction: bare aliases rejected as references inside `type: 'glyph'` definitions.
 * - Multi-word, with-options, and many-at-once registration scenarios.
 * - Round-trip portability: toString output reproduces the SVG without the original definition.
 *
 * Does NOT cover:
 * - `type: 'glyph'` definitions (identity preserved on opt-in), see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 * - `type: 'shape'` definitions, see
 *   `BlissSVGBuilder.custom-shapes.test.js`.
 * - `define()` API mechanics (overwrite option, removeDefinition), see
 *   `BlissSVGBuilder.define.test.js` and
 *   `BlissSVGBuilder.definition-maintenance.test.js`.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function defineAndTrack(definitions, options) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions, options);
}

describe('BlissSVGBuilder custom aliases', () => {

  describe('when defining a single-glyph alias', () => {
    it('resolves to the target B-code in the element tree', () => {
      defineAndTrack({ 'LOVE': { codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBe('B431');
      expect(glyph.isBlissGlyph).toBe(true);
    });

    it('serializes via toString to the target B-code', () => {
      defineAndTrack({ 'FEELING': { codeString: 'B313' } });
      expect(new BlissSVGBuilder('FEELING').toString()).toBe('B313');
    });

    it('rejects use as a bare reference inside a glyph definition', () => {
      defineAndTrack({ 'LOVE': { codeString: 'B431' } });
      // Glyphs cannot reference bare (typeless) definitions
      const result = defineAndTrack({ 'TESTCOMP': { type: 'glyph', codeString: 'LOVE:2,3;B313' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('bare');
    });

    it('produces SVG byte-identical to the target B-code', () => {
      defineAndTrack({ 'LOVE': { codeString: 'B431' } });
      const fromAlias = new BlissSVGBuilder('LOVE').svgCode;
      const fromBCode = new BlissSVGBuilder('B431').svgCode;
      expect(fromAlias).toBe(fromBCode);
    });
  });

  describe('when defining a multi-character word alias (/ separator)', () => {
    it('expands to separate glyphs in the tree', () => {
      defineAndTrack({ 'MYWORD': { codeString: 'B335/B412' } });
      const json = new BlissSVGBuilder('MYWORD').toJSON();
      const glyphs = json.groups[0].glyphs;
      expect(glyphs.length).toBe(2);
      expect(glyphs[0].codeName).toBe('B335');
      expect(glyphs[1].codeName).toBe('B412');
    });

    it('serializes via toString to the expanded characters', () => {
      defineAndTrack({ 'MYWORD': { codeString: 'B335/B412' } });
      expect(new BlissSVGBuilder('MYWORD').toString()).toBe('B335/B412');
    });

    it('produces SVG byte-identical to the expanded characters', () => {
      defineAndTrack({ 'MYWORD': { codeString: 'B335/B412' } });
      const fromAlias = new BlissSVGBuilder('MYWORD').svgCode;
      const fromBCodes = new BlissSVGBuilder('B335/B412').svgCode;
      expect(fromAlias).toBe(fromBCodes);
    });
  });

  describe('when defining a character-composition alias (; separator)', () => {
    it('expands inline as part-superimposition, not as a glyph with the alias name', () => {
      defineAndTrack({ 'B2661': { codeString: 'B1103;B81' } });
      const json = new BlissSVGBuilder('B2661').toJSON();
      // Note: ';' is part-superimposition. The alias name (which looks like a B-code)
      // does NOT become the glyph codeName; it expands to a B1103 base + B81 indicator.
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).not.toBe('B2661');
    });

    it('serializes via toString to the expanded composition', () => {
      defineAndTrack({ 'B2661': { codeString: 'B1103;B81' } });
      const str = new BlissSVGBuilder('B2661').toString();
      expect(str).toBe('B1103;B81');
    });

    it('produces SVG byte-identical to the inline composition', () => {
      defineAndTrack({ 'B2661': { codeString: 'B1103;B81' } });
      const fromAlias = new BlissSVGBuilder('B2661').svgCode;
      const fromDirect = new BlissSVGBuilder('B1103;B81').svgCode;
      expect(fromAlias).toBe(fromDirect);
    });
  });

  describe('when defining a sentence-level alias (// separator)', () => {
    it('expands to three groups (word, space, word)', () => {
      defineAndTrack({ 'GREETING': { codeString: 'B313//B431' } });
      const json = new BlissSVGBuilder('GREETING').toJSON();
      expect(json.groups.length).toBe(3);
    });

    it('serializes via toString preserving the // separator', () => {
      defineAndTrack({ 'GREETING': { codeString: 'B313//B431' } });
      expect(new BlissSVGBuilder('GREETING').toString()).toBe('B313//B431');
    });

    it('produces SVG byte-identical to the inlined DSL', () => {
      defineAndTrack({ 'GREETING': { codeString: 'B313//B431' } });
      const fromAlias = new BlissSVGBuilder('GREETING').svgCode;
      const fromDirect = new BlissSVGBuilder('B313//B431').svgCode;
      expect(fromAlias).toBe(fromDirect);
    });

    it('inlines correctly when embedded in a larger DSL string', () => {
      defineAndTrack({ 'GREETING': { codeString: 'B313//B431' } });
      const builder = new BlissSVGBuilder('B1//GREETING//B4');
      const direct = new BlissSVGBuilder('B1//B313//B431//B4');
      expect(builder.svgCode).toBe(direct.svgCode);
    });
  });

  describe('when aliases reference other aliases (chaining)', () => {
    it('resolves a single-step chain', () => {
      defineAndTrack({ 'ALIAS1': { codeString: 'B431' } });
      defineAndTrack({ 'ALIAS2': { codeString: 'ALIAS1' } });
      expect(new BlissSVGBuilder('ALIAS2').toString()).toBe('B431');
    });

    it('resolves a three-level chain to its terminal B-code', () => {
      defineAndTrack({ 'CHAIN1': { codeString: 'B431' } });
      defineAndTrack({ 'CHAIN2': { codeString: 'CHAIN1' } });
      defineAndTrack({ 'CHAIN3': { codeString: 'CHAIN2' } });
      expect(new BlissSVGBuilder('CHAIN3').toString()).toBe('B431');
    });

    it('resolves a composition alias referenced through another alias', () => {
      defineAndTrack({ 'WORD1': { codeString: 'B1103;B81' } });
      defineAndTrack({ 'WORD2': { codeString: 'WORD1' } });
      const str = new BlissSVGBuilder('WORD2').toString();
      expect(str).toBe('B1103;B81');
    });

    it('resolves a sentence alias referenced through another alias', () => {
      defineAndTrack({ 'GREET_WORD': { codeString: 'B313//B431' } });
      defineAndTrack({ 'GREET_ALIAS': { codeString: 'GREET_WORD' } });
      const builder = new BlissSVGBuilder('GREET_ALIAS');
      const direct = new BlissSVGBuilder('B313//B431');
      expect(builder.svgCode).toBe(direct.svgCode);
      expect(builder.toString()).toBe('B313//B431');
    });

    it('resolves a word alias containing / through another alias', () => {
      defineAndTrack({ 'BASE': { codeString: 'B335/B412' } });
      defineAndTrack({ 'WRAPPED': { codeString: 'BASE' } });
      expect(new BlissSVGBuilder('WRAPPED').toString()).toBe('B335/B412');
      expect(new BlissSVGBuilder('WRAPPED').svgCode)
        .toBe(new BlissSVGBuilder('B335/B412').svgCode);
    });

    it('resolves a sentence alias chain embedded in a larger string', () => {
      defineAndTrack({ 'PHRASE': { codeString: 'B313//B431' } });
      defineAndTrack({ 'PHRASE2': { codeString: 'PHRASE' } });
      const builder = new BlissSVGBuilder('B1//PHRASE2//B4');
      const direct = new BlissSVGBuilder('B1//B313//B431//B4');
      expect(builder.svgCode).toBe(direct.svgCode);
    });
  });

  describe('when an alias appears in a multi-word sentence', () => {
    it('expands at every occurrence', () => {
      defineAndTrack({ 'B2661': { codeString: 'B1103;B81' } });
      const str = new BlissSVGBuilder('B2661//B2661//B4').toString();
      expect(str).toBe('B1103;B81//B1103;B81//B4');
    });
  });

  describe('when an alias appears with bracket options in the DSL', () => {
    it('preserves the option block and decomposes the alias in toString', () => {
      defineAndTrack({ 'LOVE': { codeString: 'B431' } });
      const builder = new BlissSVGBuilder('[color=red]||LOVE');
      expect(builder.toString()).toBe('[color=red]||B431');
      expect(builder.svgCode).toContain('red');
    });
  });

  describe('when typeless and typed custom codes appear in the same string', () => {
    it('decomposes both surfaces in the portable toString output', () => {
      defineAndTrack({ 'ALIAS1': { codeString: 'B431' } });
      defineAndTrack({ 'GLYPH1': { type: 'glyph', codeString: 'B313' } });
      const builder = new BlissSVGBuilder('ALIAS1//GLYPH1');
      const str = builder.toString();
      expect(str).toBe('B431//B313');
    });
  });

  describe('when registering many aliases at once', () => {
    it('records all definitions from a single define() call', () => {
      const result = defineAndTrack({
        'WORD_A': { codeString: 'B313/B431' },
        'WORD_B': { codeString: 'B1103;B81' },
        'GLYPH_A': { type: 'glyph', codeString: 'H:0,8;VL8:4,0' }
      });
      expect(result.defined).toHaveLength(3);
      expect(new BlissSVGBuilder('WORD_A').toString()).toBe('B313/B431');
      expect(new BlissSVGBuilder('WORD_B').toString()).toBe('B1103;B81');
    });

    it('handles a batch of 50 word-level definitions', () => {
      // Simulate registering many word codes (like Blissary B-codes)
      const defs = {};
      for (let i = 2000; i < 2050; i++) {
        defs[`B${i}`] = { codeString: 'B313/B431' };
      }
      const result = defineAndTrack(defs);
      expect(result.defined).toHaveLength(50);
      expect(new BlissSVGBuilder('B2000').toString()).toBe('B313/B431');
    });
  });

  describe('when round-tripping an alias through portable toString', () => {
    it('reproduces the same SVG without the original definition', () => {
      defineAndTrack({ 'B2661': { codeString: 'B1103;B81' } });
      const original = new BlissSVGBuilder('B2661');
      const portable = original.toString();
      BlissSVGBuilder.removeDefinition('B2661');
      customCodes.length = 0;
      const rebuilt = new BlissSVGBuilder(portable);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });
});
