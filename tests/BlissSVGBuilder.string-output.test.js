import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins toString() serialization: how a parsed BlissSVGBuilder reflects back
 * to its DSL string form, including option brackets, kerning markers,
 * normalization of compositions, the //, TSP, and QSP space-shorthand,
 * and decomposition of typed glyphs and typeless aliases.
 *
 * Covers:
 * - Bracket-option preservation at global, group, glyph, and part scope.
 * - Kerning markers serialized as RK/AK codes inline, not bracket options.
 * - Constructor-default options surfaced as global bracket options.
 * - Empty options emit no brackets.
 * - Predefined B-codes, /-separated words, //-separated multi-words, ;-compositions, and shape codes preserved verbatim.
 * - // shorthand chosen when the implicit space matches the default for context (TSP for letters, QSP for punctuation).
 * - Typeless aliases expand to their underlying B-code.
 * - type:'glyph' definitions decompose to the underlying code (the alias name is dropped).
 *
 * Does NOT cover:
 * - SVG output equivalence after a string round-trip; see `BlissSVGBuilder.round-trip.test.js`.
 * - The toJSON() shape; see `BlissSVGBuilder.json-output.test.js`.
 * - Custom-code definition lifecycle (define / removeDefinition); see `BlissSVGBuilder.define.test.js`.
 */
describe('BlissSVGBuilder string output', () => {

  describe('when serializing bracket options at any scope', () => {
    it('preserves global options', () => {
      const str = new BlissSVGBuilder('[color=red]||H').toString();
      expect(str).toBe('[color=red]||H');
    });

    it('preserves boolean global options', () => {
      const str = new BlissSVGBuilder('[grid]||B291').toString();
      expect(str).toBe('[grid]||B291');
    });

    it('preserves multiple global options', () => {
      const str = new BlissSVGBuilder('[color=red;stroke-width=0.3]||H').toString();
      expect(str).toBe('[color=red;stroke-width=0.3]||H');
    });

    it('preserves group options', () => {
      const str = new BlissSVGBuilder('[color=blue]|B291//B292').toString();
      expect(str).toBe('[color=blue]|B291//B292');
    });

    it('preserves global + group options', () => {
      const str = new BlissSVGBuilder('[stroke-width=0.4]||[color=blue]|B291//B292').toString();
      expect(str).toBe('[stroke-width=0.4]||[color=blue]|B291//B292');
    });

    it('preserves part-level options', () => {
      const str = new BlissSVGBuilder('[color=red]>H;E:10,0').toString();
      expect(str).toBe('[color=red]>H;E:10,0');
    });

    it('preserves glyph-level bracket options', () => {
      const str = new BlissSVGBuilder('[color=green]B291//B292').toString();
      expect(str).toBe('[color=green]B291//B292');
    });

    it('does not emit brackets for empty options', () => {
      const str = new BlissSVGBuilder('H').toString();
      expect(str).toBe('H');
      expect(str).not.toContain('[');
    });
  });

  describe('when serializing kerning markers', () => {
    it('serializes relativeKerning as RK code, not bracket option', () => {
      const str = new BlissSVGBuilder('B291/RK:2/B292').toString();
      expect(str).toBe('B291/RK:2/B292');
    });

    it('serializes absoluteKerning as AK code, not bracket option', () => {
      const str = new BlissSVGBuilder('B291/AK:5/B292').toString();
      expect(str).toBe('B291/AK:5/B292');
    });
  });

  describe('when serializing constructor-default options', () => {
    it('includes constructor defaults in global options', () => {
      const str = new BlissSVGBuilder('H', { defaults: { color: 'blue' } }).toString();
      expect(str).toBe('[color=blue]||H');
    });
  });

  describe('when normalizing predefined codes and compositions', () => {
    it('preserves B-codes as character codes, not decomposed shapes', () => {
      expect(new BlissSVGBuilder('B313').toString()).toBe('B313');
    });

    it('preserves multi-character words with /', () => {
      const str = new BlissSVGBuilder('B291/B292').toString();
      expect(str).toBe('B291/B292');
    });

    it('preserves multi-word with //', () => {
      const str = new BlissSVGBuilder('B291//B292').toString();
      expect(str).toBe('B291//B292');
    });

    it('preserves explicit compositions', () => {
      const str = new BlissSVGBuilder('H;E:10,0').toString();
      expect(str).toBe('H;E:10,0');
    });

    it('preserves shape codes', () => {
      expect(new BlissSVGBuilder('H').toString()).toBe('H');
    });
  });

  describe('when normalizing the //, TSP, and QSP space-glyph shorthand', () => {
    it('toString() uses // shorthand for default spaces', () => {
      // Before punctuation (B1), // resolves to QSP
      expect(new BlissSVGBuilder('B291//B1').toString()).toBe('B291//B1');
      // Explicit QSP before punctuation matches default, normalize to //
      expect(new BlissSVGBuilder('B291/QSP/B1').toString()).toBe('B291//B1');
      // Explicit TSP before punctuation differs from default QSP, keep explicit
      expect(new BlissSVGBuilder('B291/TSP/B1').toString()).toBe('B291/TSP/B1');

      // Before normal glyph, // resolves to TSP
      expect(new BlissSVGBuilder('B291//B291').toString()).toBe('B291//B291');
      // Explicit TSP before normal matches default, normalize to //
      expect(new BlissSVGBuilder('B291/TSP/B291').toString()).toBe('B291//B291');
      // Explicit QSP before normal differs from default TSP, keep explicit
      expect(new BlissSVGBuilder('B291/QSP/B291').toString()).toBe('B291/QSP/B291');
    });
  });

  describe('when normalizing aliases and typed-glyph decompositions', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch {}
      }
      customCodes.length = 0;
    });

    it('resolves aliases to canonical codes', () => {
      customCodes.push('FEELING');
      BlissSVGBuilder.define({ FEELING: { codeString: 'B313' } });
      const str = new BlissSVGBuilder('FEELING').toString();
      expect(str).toBe('B313');
    });

    it('typed glyph decomposes in toString', () => {
      customCodes.push('SMILEY');
      BlissSVGBuilder.define({'SMILEY': { type: 'glyph', codeString: 'C8:0,8' }});
      const str = new BlissSVGBuilder('SMILEY').toString();
      expect(str).toContain('C8');
      expect(str).not.toContain('SMILEY');
    });

    it('bare alias expands to resolved code', () => {
      // Typeless define: bare alias, expands to underlying code
      customCodes.push('MYALIAS');
      BlissSVGBuilder.define({'MYALIAS': { codeString: 'B291' }});
      const str = new BlissSVGBuilder('MYALIAS').toString();
      expect(str).toBe('B291');
    });
  });
});
