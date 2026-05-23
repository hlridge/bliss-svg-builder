import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins BlissSVGBuilder's definition-maintenance surface: the read-only and
 * mutating helpers that operate on definitions already registered (built-in
 * or custom).
 *
 * Covers:
 * - isDefined: returns true for built-in shapes, B-code glyphs, and external
 *   glyphs; returns false for unknown codes.
 * - getDefinition: returns null for unknown codes; returns frozen objects
 *   carrying the correct type / isShape / isBuiltIn fields; exposes getPath
 *   as the same function reference for shapes and external glyphs; freezes
 *   nested objects (e.g. kerningRules); does not surface a hasGetPath flag.
 * - listDefinitions: returns all codes by default; filters by 'shape',
 *   'glyph', 'bare', 'externalGlyph', and 'space' types; the filter is
 *   consistent with per-code getDefinition().type.
 * - removeDefinition: removes a custom definition; returns false for unknown
 *   codes; throws when targeting a built-in shape, glyph, or external glyph.
 * - patchDefinition: patches glyph / shape / externalGlyph / bare properties
 *   selectively; replaces sub-objects (defaultOptions) wholesale rather than
 *   merging; rejects non-existent codes, built-in codes, type changes,
 *   internal flags, non-function getPath on a shape, and self-referencing
 *   codeString; resolves bare aliases when patching the codeString of a
 *   bare definition.
 *
 * Does NOT cover:
 * - Registration of new definitions via `define()`; see
 *   `BlissSVGBuilder.define.test.js`.
 * - End-to-end interaction between custom definitions and rendering; see
 *   `BlissSVGBuilder.customCodes.test.js` and the visual
 *   regression suite.
 * - Patched defaultOptions' downstream effect on parser / renderer; see
 *   `BlissSVGBuilder.defaultOptions.test.js`.
 */
describe('BlissSVGBuilder definition maintenance', () => {

  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch {}
    }
    customCodes.length = 0;
  });

  function trackCode(code) {
    customCodes.push(code);
    return code;
  }

  describe('when calling isDefined', () => {
    it('returns true for built-in shapes (H, C8)', () => {
      expect(BlissSVGBuilder.isDefined('H')).toBe(true);
      expect(BlissSVGBuilder.isDefined('C8')).toBe(true);
    });

    it('returns true for a built-in B-code glyph (B4)', () => {
      expect(BlissSVGBuilder.isDefined('B4')).toBe(true);
    });

    it('returns true for a built-in external glyph (Xa)', () => {
      expect(BlissSVGBuilder.isDefined('Xa')).toBe(true);
    });

    it('returns false for a code that is not defined', () => {
      expect(BlissSVGBuilder.isDefined('NONEXISTENT')).toBe(false);
    });
  });

  describe('when calling getDefinition', () => {
    it('returns null for a code that is not defined', () => {
      expect(BlissSVGBuilder.getDefinition('NONEXISTENT')).toBeNull();
    });

    it('returns a frozen object with type, isShape, isBuiltIn, and getPath for a built-in shape', () => {
      const def = BlissSVGBuilder.getDefinition('H');
      expect(def).not.toBeNull();
      expect(def.type).toBe('shape');
      expect(def.isShape).toBe(true);
      expect(def.isBuiltIn).toBe(true);
      expect(typeof def.getPath).toBe('function');
      expect(Object.isFrozen(def)).toBe(true);
    });

    it(`returns a definition with type 'glyph' and a codeString for a built-in B-code glyph`, () => {
      const def = BlissSVGBuilder.getDefinition('B4');
      expect(def.type).toBe('glyph');
      expect(def.isBuiltIn).toBe(true);
      expect(typeof def.codeString).toBe('string');
    });

    it(`returns a definition with type 'externalGlyph' and getPath for a built-in external glyph`, () => {
      const def = BlissSVGBuilder.getDefinition('Xa');
      expect(def.type).toBe('externalGlyph');
      expect(def.isBuiltIn).toBe(true);
      expect(typeof def.getPath).toBe('function');
    });

    it('exposes getPath as a function on a built-in shape', () => {
      const def = BlissSVGBuilder.getDefinition('H');
      expect(typeof def.getPath).toBe('function');
    });

    it('exposes getPath as a function on a built-in external glyph', () => {
      const def = BlissSVGBuilder.getDefinition('Xa');
      expect(typeof def.getPath).toBe('function');
    });

    it('returns the same function reference passed to define() at registration time', () => {
      const code = trackCode('GETPATHREF1');
      const myGetPath = (x, y) => `M${x},${y}h4v4h-4z`;
      BlissSVGBuilder.define({
        [code]: { type: 'shape', getPath: myGetPath, width: 4, height: 4 }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.getPath).toBe(myGetPath);
    });

    it('does not expose a hasGetPath property on the returned definition', () => {
      const def = BlissSVGBuilder.getDefinition('H');
      expect(def.hasGetPath).toBeUndefined();
    });

    it(`returns type 'bare' for a custom bare-defined code`, () => {
      const code = trackCode('BARETYPE1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B431' } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('bare');
    });

    it(`returns type 'glyph' (not 'bare') for a custom code defined with type 'glyph'`, () => {
      const code = trackCode('GLYPHTYPE1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8', type: 'glyph' } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('glyph');
    });

    it('freezes nested objects (e.g. kerningRules) on the returned definition', () => {
      const def = BlissSVGBuilder.getDefinition('B11');
      if (def.kerningRules) {
        expect(Object.isFrozen(def.kerningRules)).toBe(true);
      }
    });
  });

  describe('when calling listDefinitions', () => {
    it('returns all definition codes when called without a filter', () => {
      const all = BlissSVGBuilder.listDefinitions();
      expect(all.length).toBeGreaterThan(100);
    });

    it(`filters to shape codes when type is 'shape'`, () => {
      const shapes = BlissSVGBuilder.listDefinitions({ type: 'shape' });
      expect(shapes).toContain('H');
      expect(shapes).toContain('C8');
      expect(shapes).not.toContain('B4');
    });

    it(`filters to glyph codes when type is 'glyph'`, () => {
      const glyphs = BlissSVGBuilder.listDefinitions({ type: 'glyph' });
      expect(glyphs).toContain('B4');
      expect(glyphs).not.toContain('H');
    });

    it(`filters to bare-defined codes when type is 'bare'`, () => {
      const code = trackCode('BARELIST1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B431' } });
      const bareList = BlissSVGBuilder.listDefinitions({ type: 'bare' });
      expect(bareList).toContain(code);
    });

    it(`excludes bare-defined codes when filtering by type 'glyph'`, () => {
      const code = trackCode('BARELIST2');
      BlissSVGBuilder.define({ [code]: { codeString: 'B431' } });
      const glyphs = BlissSVGBuilder.listDefinitions({ type: 'glyph' });
      expect(glyphs).not.toContain(code);
    });

    it(`filters to external-glyph codes when type is 'externalGlyph'`, () => {
      const extGlyphs = BlissSVGBuilder.listDefinitions({ type: 'externalGlyph' });
      expect(extGlyphs).toContain('Xa');
      expect(extGlyphs).not.toContain('H');
    });

    it(`filters to space codes when type is 'space'`, () => {
      const spaces = BlissSVGBuilder.listDefinitions({ type: 'space' });
      expect(spaces).toContain('TSP');
      expect(spaces).toContain('QSP');
    });

    it('returns codes whose type filter is consistent with getDefinition().type', () => {
      const all = BlissSVGBuilder.listDefinitions();
      for (const code of all.slice(0, 30)) {
        const def = BlissSVGBuilder.getDefinition(code);
        const filtered = BlissSVGBuilder.listDefinitions({ type: def.type });
        expect(filtered).toContain(code);
      }
    });
  });

  describe('when calling removeDefinition', () => {
    it('removes a previously-defined custom code and returns true', () => {
      BlissSVGBuilder.define({ REMOVEME: { codeString: 'H' } });
      expect(BlissSVGBuilder.removeDefinition('REMOVEME')).toBe(true);
      expect(BlissSVGBuilder.isDefined('REMOVEME')).toBe(false);
    });

    it('returns false when the code is not defined', () => {
      expect(BlissSVGBuilder.removeDefinition('NONEXISTENT')).toBe(false);
    });

    it('throws when called on a built-in shape, B-code glyph, or external glyph', () => {
      expect(() => BlissSVGBuilder.removeDefinition('H')).toThrow('built-in');
      expect(() => BlissSVGBuilder.removeDefinition('B4')).toThrow('built-in');
      expect(() => BlissSVGBuilder.removeDefinition('Xa')).toThrow('built-in');
    });
  });

  describe('when calling patchDefinition', () => {
    it('patches a glyph property (anchorOffsetY) and preserves the others', () => {
      const code = trackCode('PATCHG1');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'H:0,8;VL8',
          type: 'glyph',
          anchorOffsetX: 1.5,
          width: 4
        }
      });
      const result = BlissSVGBuilder.patchDefinition(code, { anchorOffsetY: -2 });
      expect(result.patched).toBe(true);

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.anchorOffsetY).toBe(-2);
      expect(def.anchorOffsetX).toBe(1.5);
      expect(def.width).toBe(4);
      expect(def.codeString).toBe('H:0,8;VL8');
    });

    it('patches a shape width and preserves getPath and unaffected properties', () => {
      const code = trackCode('PATCHS1');
      const myPath = (x, y) => `M${x},${y}h4v4h-4z`;
      BlissSVGBuilder.define({
        [code]: { type: 'shape', getPath: myPath, width: 4, height: 4 }
      });
      BlissSVGBuilder.patchDefinition(code, { width: 8 });

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.width).toBe(8);
      expect(def.getPath).toBe(myPath);
      expect(def.height).toBe(4);
    });

    it('replaces the entire defaultOptions sub-object rather than merging it', () => {
      const code = trackCode('PATCHDO1');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'H:0,8',
          type: 'glyph',
          defaultOptions: { color: 'red', strokeWidth: 0.5 }
        }
      });
      BlissSVGBuilder.patchDefinition(code, {
        defaultOptions: { color: 'blue' }
      });

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ color: 'blue' });
      expect(def.defaultOptions.strokeWidth).toBeUndefined();
    });

    it('throws when the target code is not defined', () => {
      expect(() => BlissSVGBuilder.patchDefinition('NONEXISTENT', { width: 4 }))
        .toThrow('not defined');
    });

    it('throws when the target code is built-in', () => {
      expect(() => BlissSVGBuilder.patchDefinition('H', { width: 4 }))
        .toThrow('built-in');
    });

    it('rejects an attempt to change the type of an existing definition', () => {
      const code = trackCode('PATCHTYPE1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8', type: 'glyph' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { type: 'shape' }))
        .toThrow('type');
    });

    it('rejects an attempt to set internal flags (e.g. isBlissGlyph)', () => {
      const code = trackCode('PATCHFLAG1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8', type: 'glyph' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { isBlissGlyph: false }))
        .toThrow();
    });

    it('rejects a self-referencing codeString patch', () => {
      const code = trackCode('PATCHREF1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8', type: 'glyph' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { codeString: code }))
        .toThrow();
    });

    it('patches the codeString of a bare definition and keeps its type bare', () => {
      const code = trackCode('PATCHBARE1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B431' } });
      BlissSVGBuilder.patchDefinition(code, { codeString: 'B313' });

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.codeString).toBe('B313');
      expect(def.type).toBe('bare');
    });

    it('patches externalGlyph properties (getPath and width) and preserves char', () => {
      const code = trackCode('PATCHEXT1');
      const myPath = (x, y) => `M${x},${y}h2v8h-2z`;
      BlissSVGBuilder.define({
        [code]: {
          type: 'externalGlyph',
          getPath: myPath,
          width: 2,
          char: 'α'
        }
      });
      const newPath = (x, y) => `M${x},${y}h3v6h-3z`;
      BlissSVGBuilder.patchDefinition(code, { getPath: newPath, width: 3 });

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.getPath).toBe(newPath);
      expect(def.width).toBe(3);
      expect(def.char).toBe('α');
    });

    it('returns { patched: true } on a successful patch', () => {
      const code = trackCode('PATCHRET1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H', type: 'glyph' } });
      const result = BlissSVGBuilder.patchDefinition(code, { width: 6 });
      expect(result).toEqual({ patched: true });
    });

    it('returns { patched: true } when called with an empty changes object', () => {
      const code = trackCode('PATCHEMPTY1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H', type: 'glyph' } });
      const result = BlissSVGBuilder.patchDefinition(code, {});
      expect(result).toEqual({ patched: true });
    });

    it('removes defaultOptions from the definition when patched to null', () => {
      const code = trackCode('PATCHNULL1');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'H',
          type: 'glyph',
          defaultOptions: { color: 'red' }
        }
      });
      BlissSVGBuilder.patchDefinition(code, { defaultOptions: null });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toBeUndefined();
    });

    it('rejects a non-function getPath when patching a shape', () => {
      const code = trackCode('PATCHBADGP1');
      BlissSVGBuilder.define({
        [code]: { type: 'shape', getPath: () => '', width: 4, height: 4 }
      });
      expect(() => BlissSVGBuilder.patchDefinition(code, { getPath: 'not a function' }))
        .toThrow('getPath');
    });

    it('resolves bare aliases when the patched codeString is itself a bare-defined code', () => {
      const alias = trackCode('PATCHALIAS_SRC');
      const code = trackCode('PATCHALIAS_TGT');
      BlissSVGBuilder.define({ [alias]: { codeString: 'B431' } });
      BlissSVGBuilder.define({ [code]: { codeString: 'B313' } });
      BlissSVGBuilder.patchDefinition(code, { codeString: alias });

      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.codeString).toBe('B431');
    });
  });

});
