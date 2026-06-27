import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins `type: 'glyph'` definitions as identity-preserving custom codes:
 * the custom name is decomposed by default in toString/toJSON output and
 * preserved on opt-in (`{ preserve: true }`), while element-tree behavior
 * matches the underlying codeString in either mode.
 *
 * Covers:
 * - Tree identity: custom code visible only with preserve; default decomposes.
 * - Portable toString: B-code-backed, shape-based, positioned, and nested glyphs.
 * - Preserve option for toString and toJSON (opt-in retention of custom name).
 * - define() validation: a `type: 'glyph'` codeString may reference B-code glyphs,
 *   shapes (built-in or custom), or other custom glyphs; not external glyphs or typeless aliases.
 * - define() circular reference detection (self, chain A->B->A, indirect A->B->C->A).
 * - Round-trip via portable toString reproduces the SVG without the original definition.
 *
 * Does NOT cover:
 * - Typeless aliases (transparent macros), see
 *   `BlissSVGBuilder.custom-aliases.test.js`.
 * - `type: 'shape'` definitions, see
 *   `BlissSVGBuilder.custom-shapes.test.js`.
 * - `define()` API mechanics (overwrite option, removeDefinition), see
 *   `BlissSVGBuilder.define.test.js` and
 *   `BlissSVGBuilder.definition-maintenance.test.js`.
 * - The word-alias head-merge form of compound-indicator application (applying
 *   an indicator to a word whose head is a baseless compound indicator), and the
 *   indicator-first-base guard, see
 *   `BlissSVGBuilder.compound-indicator-application.test.js`. The single-glyph
 *   strip-semantic no-op warning IS pinned in the describe below (R15 3b-5).
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function track(code) {
  customCodes.push(code);
  return code;
}

function defineAndTrack(definitions, options) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions, options);
}

describe('BlissSVGBuilder custom glyphs', () => {

  describe('when reading a custom glyph from the element tree', () => {
    it('decomposes the custom code in toJSON by default', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBe('B431');
    });

    it('preserves the custom code name in toJSON when preserve is true', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON({ preserve: true });
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBe('LOVE');
    });

    it('reports isBlissGlyph as true on a shape-backed custom glyph', () => {
      defineAndTrack({ 'MYGLYPH': { type: 'glyph', codeString: 'H:0,8' } });
      // isBlissGlyph is live identity, read from the handle (toJSON omits it)
      const glyph = new BlissSVGBuilder('MYGLYPH').group(0).glyph(0);
      expect(glyph.isBlissGlyph).toBe(true);
    });

    it('renders SVG when the glyph is positioned', () => {
      defineAndTrack({ 'MYGLYPH': { type: 'glyph', codeString: 'C8:0,8' } });
      const builder = new BlissSVGBuilder('MYGLYPH:2,0');
      expect(builder.svgCode).toContain('<svg');
    });

    it('renders SVG when the glyph carries an indicator', () => {
      defineAndTrack({ 'MYGLYPH': { type: 'glyph', codeString: 'H:0,8' } });
      const builder = new BlissSVGBuilder('MYGLYPH;B81');
      expect(builder.svgCode).toContain('<svg');
    });

    it('renders SVG when the glyph appears inside a multi-character word', () => {
      defineAndTrack({ 'MYGLYPH': { type: 'glyph', codeString: 'H:0,8' } });
      const builder = new BlissSVGBuilder('B313/MYGLYPH');
      expect(builder.svgCode).toContain('<svg');
    });

    it('decomposes a B-code-backed custom glyph in toJSON by default', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON();
      expect(json.groups[0].glyphs[0].codeName).toBe('B431');
    });

    it('preserves a B-code-backed custom glyph identity in toJSON with preserve', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON({ preserve: true });
      expect(json.groups[0].glyphs[0].codeName).toBe('LOVE');
    });
  });

  describe('when serializing a custom glyph via toString', () => {
    it('decomposes a single-B-code-backed glyph to its target B-code', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      expect(new BlissSVGBuilder('LOVE').toString()).toBe('B431');
    });

    it('decomposes a shape-based glyph to its shape composition', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      expect(new BlissSVGBuilder('SMILEY').toString())
        .toBe('C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14');
    });

    it('adjusts coordinates when decomposing a positioned custom glyph', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      // SMILEY:2,0 offsets all internal shape coordinates by (2,0)
      const str = new BlissSVGBuilder('SMILEY:2,0').toString();
      expect(str).toContain('C8:2,8');
      expect(str).toContain('DOT:4,11');
      expect(str).toContain('DOT:8,11');
      expect(str).toContain('HC4S:6,14');
    });

    it('decomposes nested custom glyphs all the way to shape primitives', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      defineAndTrack({
        'DOUBLESMILEY': {
          type: 'glyph',
          codeString: 'SMILEY;SMILEY:2,0'
        }
      });
      const str = new BlissSVGBuilder('DOUBLESMILEY').toString();
      expect(str).not.toContain('SMILEY');
      expect(str).not.toContain('DOUBLESMILEY');
      expect(str).toContain('C8');
      expect(str).toContain('DOT');
      expect(str).toContain('HC4S');
    });

    it('decomposes the glyph at every occurrence in a multi-character word', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const str = new BlissSVGBuilder('LOVE/LOVE').toString();
      expect(str).toBe('B431/B431');
    });

    it('decomposes the glyph at every occurrence in a multi-word sentence', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const str = new BlissSVGBuilder('LOVE//LOVE').toString();
      expect(str).toBe('B431//B431');
    });
  });

  describe('when serializing a custom glyph via toString with preserve', () => {
    it('keeps the custom name on a B-code-backed glyph', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const str = new BlissSVGBuilder('LOVE').toString({ preserve: true });
      expect(str).toBe('LOVE');
    });

    it('keeps the custom name on a shape-based glyph', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      const str = new BlissSVGBuilder('SMILEY').toString({ preserve: true });
      expect(str).toBe('SMILEY');
    });

    it('keeps the outermost custom name on a nested-glyph composition', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      defineAndTrack({
        'DOUBLESMILEY': {
          type: 'glyph',
          codeString: 'SMILEY;SMILEY:2,0'
        }
      });
      const str = new BlissSVGBuilder('DOUBLESMILEY').toString({ preserve: true });
      expect(str).toBe('DOUBLESMILEY');
    });

    it('still decomposes built-in B-codes (preserve only affects custom glyphs)', () => {
      const str = new BlissSVGBuilder('B431').toString({ preserve: true });
      expect(str).toBe('B431');
    });

    it('keeps the bare name on an unmodified baseless compound-indicator glyph', () => {
      // R15 Task 3b-4 (D-S2): an all-indicator (baseless) glyph has no base
      // segment, so the baked-indicator scan must not skip the first one.
      // Skipping it emitted a spurious `BASELESS_C;B86` delta that re-parsed to
      // a doubled indicator (divergent render). isIndicator:true is the D-S1a
      // gate for an all-indicator definition.
      defineAndTrack({ BASELESS_C: { type: 'glyph', codeString: 'B86;B97', isIndicator: true } });
      const original = new BlissSVGBuilder('BASELESS_C');
      const str = original.toString({ preserve: true });
      expect(str).toBe('BASELESS_C');
      expect(new BlissSVGBuilder(str).svgCode).toBe(original.svgCode);
    });
  });

  describe('when applying a strip-semantic indicator to a baseless compound-indicator glyph', () => {
    it('stacks the indicator silently (no base semantic indicator to strip)', () => {
      // R15 Task 3b-5 (R3b4-2): a baseless compound indicator is an atomic
      // indicator unit with no base semantic indicator, so `;!` strips nothing
      // and follows the general rule SILENTLY: the applied indicator stacks
      // (render == the indicators as standalone B-codes: COMBO_IND;!B81 ==
      // B86;B97;B81). No special strip-semantic warning is emitted.
      defineAndTrack({ COMBO_IND: { type: 'glyph', codeString: 'B86;B97', isIndicator: true } });
      const stripped = new BlissSVGBuilder('COMBO_IND;!B81');
      expect(stripped.toString()).toBe('B86;B97;B81');
      expect(stripped.warnings).toEqual([]);
    });
  });

  describe('when serializing a custom glyph via toJSON', () => {
    it('decomposes the custom code in JSON output by default', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBe('B431');
    });

    it('preserves the custom code name in JSON output with preserve true', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const json = new BlissSVGBuilder('LOVE').toJSON({ preserve: true });
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBe('LOVE');
    });

    it('decomposes a complex composition glyph (drops the custom code)', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      const json = new BlissSVGBuilder('SMILEY').toJSON();
      const glyph = json.groups[0].glyphs[0];
      expect(glyph.codeName).toBeUndefined();
      expect(glyph.parts).toHaveLength(4);
      expect(glyph.parts[0].codeName).toBe('C8');
    });

    it('round-trips a complex composition through toJSON and back', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      const json = new BlissSVGBuilder('SMILEY').toJSON();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.toString()).toBe('C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14');
    });
  });

  describe('when define() validates glyph references', () => {
    it('rejects a glyph referencing an external glyph', () => {
      const result = BlissSVGBuilder.define({
        'BADGLYPH': { type: 'glyph', codeString: 'Xa:0,8' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.defined).not.toContain('BADGLYPH');
    });

    it('accepts a glyph referencing a B-code glyph', () => {
      const code = track('GOODGLYPH1');
      const result = BlissSVGBuilder.define({
        [code]: { type: 'glyph', codeString: 'B431' }
      });
      expect(result.defined).toContain(code);
    });

    it('accepts a glyph referencing shape primitives', () => {
      const code = track('GOODGLYPH2');
      const result = BlissSVGBuilder.define({
        [code]: { type: 'glyph', codeString: 'H:0,8;VL8:4,0' }
      });
      expect(result.defined).toContain(code);
    });

    it('accepts a glyph referencing other custom glyphs', () => {
      defineAndTrack({ 'INNERGLYPH': { type: 'glyph', codeString: 'H:0,8' } });
      const code = track('OUTERGLYPH');
      const result = BlissSVGBuilder.define({
        [code]: { type: 'glyph', codeString: 'INNERGLYPH;INNERGLYPH:4,0' }
      });
      expect(result.defined).toContain(code);
    });

    it('rejects a glyph referencing a typeless alias', () => {
      defineAndTrack({ 'MYALIAS': { codeString: 'B431' } });
      const result = BlissSVGBuilder.define({
        'BADGLYPH': { type: 'glyph', codeString: 'MYALIAS' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.defined).not.toContain('BADGLYPH');
    });
  });

  describe('when define() detects circular glyph references', () => {
    it('rejects a self-referencing glyph', () => {
      const result = BlissSVGBuilder.define({
        'SELFGLYPH': { type: 'glyph', codeString: 'SELFGLYPH;B81' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a circular glyph chain A -> B -> A', () => {
      // note: chain links use a base second part (B313), not an indicator, so
      // the R15 D-S1a guard (no baked indicator in a glyph def) does not reject
      // the links before the loop forms; the assertion pins the *circular* error
      // so a non-circular rejection can't pass this test (3b-2 review).
      defineAndTrack({ 'GLYPHA': { type: 'glyph', codeString: 'H:0,8' } });
      defineAndTrack({ 'GLYPHB': { type: 'glyph', codeString: 'GLYPHA;B313' } });
      // Now redefine GLYPHA to reference GLYPHB, closing the loop.
      const result = BlissSVGBuilder.define(
        { 'GLYPHA': { type: 'glyph', codeString: 'GLYPHB;B313' } },
        { overwrite: true }
      );
      expect(result.errors.some(e => e.includes('circular'))).toBe(true);
    });

    it('rejects an indirect circular reference A -> B -> C -> A', () => {
      defineAndTrack({ 'CIRC_A': { type: 'glyph', codeString: 'H:0,8' } });
      defineAndTrack({ 'CIRC_B': { type: 'glyph', codeString: 'CIRC_A' } });
      defineAndTrack({ 'CIRC_C': { type: 'glyph', codeString: 'CIRC_B' } });
      const result = BlissSVGBuilder.define(
        { 'CIRC_A': { type: 'glyph', codeString: 'CIRC_C' } },
        { overwrite: true }
      );
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('when round-tripping a custom glyph through portable toString', () => {
    it('reproduces the same SVG from a portable B-code-backed string with no definition', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const original = new BlissSVGBuilder('LOVE');
      const portable = original.toString();
      BlissSVGBuilder.removeDefinition('LOVE');
      customCodes.length = 0;
      const rebuilt = new BlissSVGBuilder(portable);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('reproduces the same SVG from a portable shape-based string with no definition', () => {
      defineAndTrack({
        'SMILEY': {
          type: 'glyph',
          codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
        }
      });
      const original = new BlissSVGBuilder('SMILEY');
      const portable = original.toString();
      BlissSVGBuilder.removeDefinition('SMILEY');
      customCodes.length = 0;
      const rebuilt = new BlissSVGBuilder(portable);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('reproduces the same SVG from a preserved string while the definition still exists', () => {
      defineAndTrack({ 'LOVE': { type: 'glyph', codeString: 'B431' } });
      const original = new BlissSVGBuilder('LOVE');
      const preserved = original.toString({ preserve: true });
      const rebuilt = new BlissSVGBuilder(preserved);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });
});
