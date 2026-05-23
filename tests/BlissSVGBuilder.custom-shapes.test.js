import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins `type: 'shape'` definitions: composite (codeString-based) custom
 * shapes decompose to their built-in shape primitives in toString output
 * (with coordinate adjustment for positioned references), while primitive
 * (getPath-based) custom shapes preserve their custom name (no codeString
 * to decompose into).
 *
 * Covers:
 * - Composite shape decomposition with coordinate adjustment for positioned shapes.
 * - Composite shapes nested through glyph compositions and through other shapes.
 * - Primitive (getPath) shapes preserve their name (no codeString to decompose).
 * - Preserve option for toString on a composite shape.
 * - define() validation: a `type: 'shape'` codeString may only reference other shapes
 *   (built-in primitives or custom shapes); not B-code glyphs, custom glyphs, or external glyphs.
 * - define() circular reference detection on shapes (self, chain A->B->A).
 *
 * Does NOT cover:
 * - Typeless aliases, see `BlissSVGBuilder.custom-aliases.test.js`.
 * - `type: 'glyph'` definitions, see `BlissSVGBuilder.custom-glyphs.test.js`.
 * - Built-in shape primitives (HL, VL, C8, DOT, etc.), see
 *   `BlissSVGBuilder.shapes.test.js`.
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

describe('BlissSVGBuilder custom shapes', () => {

  describe('when serializing a composite custom shape via toString', () => {
    it('decomposes the shape to its built-in shape primitives', () => {
      defineAndTrack({
        'CROSS': { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      const str = new BlissSVGBuilder('CROSS:0,8').toString();
      expect(str).not.toContain('CROSS');
      expect(str).toContain('HL8');
      expect(str).toContain('VL8');
    });

    it('adjusts coordinates when the composite shape is positioned', () => {
      defineAndTrack({
        'CROSS': { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      // CROSS at position 0,8 adds (0,8) to each internal shape position.
      const str = new BlissSVGBuilder('CROSS:0,8').toString();
      expect(str).toContain('HL8:0,12');
      expect(str).toContain('VL8:4,8');
    });

    it('decomposes a composite shape used inside a glyph composition', () => {
      defineAndTrack({
        'CROSS': { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      defineAndTrack({
        'CROSSGLYPH': { type: 'glyph', codeString: 'CROSS:0,8' }
      });
      const str = new BlissSVGBuilder('CROSSGLYPH').toString();
      expect(str).not.toContain('CROSS');
      expect(str).toContain('HL8');
      expect(str).toContain('VL8');
    });

    it('decomposes nested composite shapes (shapes referencing shapes)', () => {
      defineAndTrack({
        'HALFCROSS': { type: 'shape', codeString: 'HL8:0,4;VL4:4,0' }
      });
      defineAndTrack({
        'FULLCROSS': { type: 'shape', codeString: 'HALFCROSS;HALFCROSS:0,4' }
      });
      const str = new BlissSVGBuilder('FULLCROSS:0,8').toString();
      expect(str).not.toContain('HALFCROSS');
      expect(str).not.toContain('FULLCROSS');
      expect(str).toContain('HL8');
      expect(str).toContain('VL4');
    });

    it('produces SVG byte-identical to the inlined shape primitives', () => {
      defineAndTrack({
        'CROSS': { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      const fromCustom = new BlissSVGBuilder('CROSS:0,8').svgCode;
      const fromDirect = new BlissSVGBuilder('HL8:0,12;VL8:4,8').svgCode;
      expect(fromCustom).toBe(fromDirect);
    });
  });

  describe('when serializing a primitive (getPath-based) custom shape', () => {
    it('preserves the custom name (getPath shapes have no codeString to decompose)', () => {
      defineAndTrack({
        'DIAMOND': {
          type: 'shape',
          getPath: (x, y) => {
            const cx = x + 4, cy = y + 4;
            return `M${cx},${y} L${x + 8},${cy} L${cx},${y + 8} L${x},${cy} Z`;
          },
          width: 8,
          height: 8
        }
      });
      const str = new BlissSVGBuilder('DIAMOND:0,8').toString();
      expect(str).toBe('DIAMOND:0,8');
    });
  });

  describe('when serializing a composite custom shape with preserve', () => {
    it('keeps the custom name on a positioned composite shape', () => {
      defineAndTrack({
        'CROSS': { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      const str = new BlissSVGBuilder('CROSS:0,8').toString({ preserve: true });
      expect(str).toBe('CROSS:0,8');
    });
  });

  describe('when define() validates shape references', () => {
    it('rejects a shape referencing a B-code glyph', () => {
      const result = BlissSVGBuilder.define({
        'BADSHAPE': { type: 'shape', codeString: 'B431:0,8' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.defined).not.toContain('BADSHAPE');
    });

    it('rejects a shape referencing a custom glyph', () => {
      defineAndTrack({ 'MYGLYPH': { type: 'glyph', codeString: 'H:0,8' } });
      const result = BlissSVGBuilder.define({
        'BADSHAPE': { type: 'shape', codeString: 'MYGLYPH:0,8' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.defined).not.toContain('BADSHAPE');
    });

    it('rejects a shape referencing an external glyph', () => {
      const result = BlissSVGBuilder.define({
        'BADSHAPE': { type: 'shape', codeString: 'Xa:0,8' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.defined).not.toContain('BADSHAPE');
    });

    it('accepts a shape referencing built-in shape primitives', () => {
      const code = track('GOODSHAPE');
      const result = BlissSVGBuilder.define({
        [code]: { type: 'shape', codeString: 'HL8:0,4;VL8:4,0' }
      });
      expect(result.defined).toContain(code);
    });

    it('accepts a shape referencing other custom shapes', () => {
      defineAndTrack({ 'MYSHAPE': { type: 'shape', codeString: 'HL8;VL8' } });
      const code = track('COMPSHAPE');
      const result = BlissSVGBuilder.define({
        [code]: { type: 'shape', codeString: 'MYSHAPE:0,0;MYSHAPE:4,4' }
      });
      expect(result.defined).toContain(code);
    });
  });

  describe('when define() detects circular shape references', () => {
    it('rejects a self-referencing shape', () => {
      const result = BlissSVGBuilder.define({
        'SELFSHAPE': { type: 'shape', codeString: 'SELFSHAPE:0,0' }
      });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects a circular shape chain A -> B -> A', () => {
      defineAndTrack({ 'SHAPEA': { type: 'shape', codeString: 'HL8' } });
      defineAndTrack({ 'SHAPEB': { type: 'shape', codeString: 'SHAPEA:0,0' } });
      // Redefine SHAPEA to reference SHAPEB, closing the loop.
      const result = BlissSVGBuilder.define(
        { 'SHAPEA': { type: 'shape', codeString: 'SHAPEB:0,0' } },
        { overwrite: true }
      );
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
