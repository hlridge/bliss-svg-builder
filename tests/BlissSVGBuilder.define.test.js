import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins BlissSVGBuilder.define: the single public entry point for registering
 * custom definitions, accepting four type variants (bare, glyph, shape,
 * externalGlyph) plus auto-detection and validation.
 *
 * Covers:
 * - Bare definitions (no type, codeString-only) yield type 'bare' without
 *   isBlissGlyph or glyphCode fields, and render via the codeString chain.
 * - Explicit type variants ('glyph', 'shape', 'externalGlyph') accept their
 *   typed property bundles and produce the expected definition shape.
 * - Auto-detection: getPath without char resolves to 'shape'; getPath with
 *   char resolves to 'externalGlyph'.
 * - Validation: unknown type, undetectable input (no type, no getPath, no
 *   codeString), missing shape dimensions, missing externalGlyph char,
 *   empty codeString, empty code key, null input, duplicate codes
 *   (skipped without overwrite, replaced with overwrite: true).
 * - Acceptance of finite numeric fields on a typed glyph definition
 *   (negative anchorOffsetX, positive width).
 * - Batch define iterates own keys only, not properties inherited via
 *   the prototype chain (no Object.create proto pollution).
 * - defaultOptions pass-through across bare / glyph / shape variants.
 * - Per-type individual define helpers (defineGlyph, defineShape,
 *   defineExternalGlyph) are NOT exposed; define() is the only public entry.
 *
 * Does NOT cover:
 * - Lookup, listing, removal, or patching of registered definitions; see
 *   `BlissSVGBuilder.definition-maintenance.test.js`.
 * - End-to-end rendering of custom definitions beyond a smoke `<svg>` check;
 *   see `BlissSVGBuilder.customCodes.test.js` and the visual
 *   regression suite.
 * - defaultOptions' downstream interaction with the parser and renderer;
 *   see `BlissSVGBuilder.defaultOptions.test.js`.
 */
describe('BlissSVGBuilder.define', () => {

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

  describe('when checking the public class surface for individual define helpers', () => {
    it('does not expose defineGlyph as a public method', () => {
      expect(typeof BlissSVGBuilder.defineGlyph).not.toBe('function');
    });

    it('does not expose defineShape as a public method', () => {
      expect(typeof BlissSVGBuilder.defineShape).not.toBe('function');
    });

    it('does not expose defineExternalGlyph as a public method', () => {
      expect(typeof BlissSVGBuilder.defineExternalGlyph).not.toBe('function');
    });
  });

  describe('when called with no type field', () => {
    it('creates a bare definition without isBlissGlyph or glyphCode', () => {
      const code = trackCode('BAREDEF1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B431' } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def).not.toBeNull();
      expect(def.codeString).toBe('B431');
      expect(def.isBlissGlyph).toBeUndefined();
      expect(def.glyphCode).toBeUndefined();
    });

    it('renders a single-shape bare definition to <svg>', () => {
      const code = trackCode('BAREDEF2');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8' } });
      const builder = new BlissSVGBuilder(code);
      expect(builder.svgCode).toContain('<svg');
    });

    it('renders a multi-character-word bare definition to <svg>', () => {
      const code = trackCode('BAREWORD1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B313/B431' } });
      const builder = new BlissSVGBuilder(code);
      expect(builder.svgCode).toContain('<svg');
    });

    it('renders a character-with-indicator bare definition to <svg>', () => {
      const code = trackCode('BAREWORD2');
      BlissSVGBuilder.define({ [code]: { codeString: 'B1103;B81' } });
      const builder = new BlissSVGBuilder(code);
      expect(builder.svgCode).toContain('<svg');
    });
  });

  describe(`when called with type 'glyph'`, () => {
    it('creates a glyph definition with the given codeString and isBuiltIn false', () => {
      const code = trackCode('TYPEGLYPH1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8;VL8', type: 'glyph' } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('glyph');
      expect(def.codeString).toBe('H:0,8;VL8');
      expect(def.isBuiltIn).toBe(false);
    });

    it('accepts optional glyph properties (isIndicator, anchorOffsetX/Y, width, shrinksPrecedingWordSpace)', () => {
      const code = trackCode('TYPEGLYPH2');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'H',
          type: 'glyph',
          isIndicator: true,
          anchorOffsetX: 1.5,
          anchorOffsetY: -0.5,
          width: 4,
          shrinksPrecedingWordSpace: true
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.isIndicator).toBe(true);
      expect(def.anchorOffsetX).toBe(1.5);
      expect(def.anchorOffsetY).toBe(-0.5);
      expect(def.width).toBe(4);
    });

    it('renders the registered glyph definition to <svg>', () => {
      const code = trackCode('TYPEGLYPH3');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8;VL8', type: 'glyph' } });
      const builder = new BlissSVGBuilder(code);
      expect(builder.svgCode).toContain('<svg');
    });
  });

  describe('when a glyph definition references an indicator part', () => {
    // note: a glyph is a base character or a compound indicator, never a
    // base+indicator combo (R15 D-S1a). Combos are bare aliases; the indicator
    // attaches at the use site. The guard keys off each part's isIndicator flag.
    it('rejects a base+indicator glyph definition', () => {
      const code = trackCode('GLYPH_BASE_INDICATOR');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291;B86' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('names the indicator and the alias alternative in the rejection message', () => {
      const code = trackCode('GLYPH_BASE_INDICATOR_MSG');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291;B86' } });
      expect(result.errors[0]).toContain('indicator');
      expect(result.errors[0]).toContain('alias');
    });

    it('accepts an all-indicator definition flagged as a compound indicator', () => {
      const code = trackCode('COMPOUND_INDICATOR');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B97;B81', isIndicator: true } });
      expect(result.errors).toEqual([]);
      expect(BlissSVGBuilder.getDefinition(code).isIndicator).toBe(true);
    });

    it('accepts a base+indicator combination defined as a bare alias', () => {
      const code = trackCode('COMBO_ALIAS');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291;B86' } });
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('bare');
    });

    it('accepts a base-only glyph definition', () => {
      const code = trackCode('BASE_ONLY_GLYPH');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291' } });
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('glyph');
    });

    it('rejects an indicator part in any position, not only trailing', () => {
      // pins the position-independent .some scan: a leading indicator part is
      // rejected too (a .some -> findIndex===last or trailing-only check would miss this).
      const code = trackCode('GLYPH_LEADING_INDICATOR');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B86;B291' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });
  });

  describe(`when called with type 'shape'`, () => {
    it('creates a primitive shape from a getPath function', () => {
      const code = trackCode('TYPESHAPE1');
      BlissSVGBuilder.define({
        [code]: {
          type: 'shape',
          getPath: (x, y) => `M${x},${y}h4v4h-4z`,
          width: 4,
          height: 4
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('shape');
      expect(def.isBuiltIn).toBe(false);
      expect(typeof def.getPath).toBe('function');
    });

    it('creates a composite shape from a codeString', () => {
      const code = trackCode('TYPESHAPE2');
      BlissSVGBuilder.define({
        [code]: {
          type: 'shape',
          codeString: 'HL8;HL8:0,8;VL8;VL8:8,0'
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('shape');
      expect(def.isBuiltIn).toBe(false);
      expect(def.codeString).toBe('HL8;HL8:0,8;VL8;VL8:8,0');
    });

    it('renders a composite shape to <svg>', () => {
      const code = trackCode('TYPESHAPE3');
      BlissSVGBuilder.define({
        [code]: { type: 'shape', codeString: 'HL8;VL8' }
      });
      const builder = new BlissSVGBuilder(`${code}:0,8`);
      expect(builder.svgCode).toContain('<svg');
    });
  });

  describe(`when called with type 'externalGlyph'`, () => {
    it('creates an external glyph definition with isBuiltIn false', () => {
      const code = trackCode('TYPEEXT1');
      BlissSVGBuilder.define({
        [code]: {
          type: 'externalGlyph',
          getPath: (x, y) => `M${x},${y}h2v8h-2z`,
          width: 2,
          char: 'α'
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.type).toBe('externalGlyph');
      expect(def.isBuiltIn).toBe(false);
    });
  });

  describe('when type is omitted and getPath is provided', () => {
    it('auto-detects type as shape when char is absent', () => {
      const code = trackCode('AUTODET1');
      const result = BlissSVGBuilder.define({
        [code]: { getPath: () => '', width: 4, height: 4 }
      });
      expect(result.defined).toContain(code);
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('shape');
    });

    it('auto-detects type as externalGlyph when char is present', () => {
      const code = trackCode('AUTODET2');
      const result = BlissSVGBuilder.define({
        [code]: { getPath: () => '', width: 2, char: 'x' }
      });
      expect(result.defined).toContain(code);
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('externalGlyph');
    });
  });

  describe('when called with defaultOptions', () => {
    it('passes defaultOptions through for a glyph type definition', () => {
      const code = trackCode('DEFOPTG1');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '0 0.999' });
    });

    it('passes defaultOptions through for a bare definition', () => {
      const code = trackCode('DEFOPTB1');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'S8:0,8',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '0 0.999' });
    });

    it('passes defaultOptions through for a shape type definition', () => {
      const code = trackCode('DEFOPTS1');
      BlissSVGBuilder.define({
        [code]: {
          type: 'shape',
          codeString: 'S8:0,8',
          defaultOptions: { 'stroke-dasharray': '2 2' }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '2 2' });
    });
  });

  describe('when called with an unsupported type', () => {
    it('reports an unknown-type error and defines nothing', () => {
      const result = BlissSVGBuilder.define({
        BAD: { codeString: 'H', type: 'blah' }
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('unknown type');
      expect(result.defined).toHaveLength(0);
    });
  });

  describe('when called with input that cannot be classified', () => {
    it('reports an error for input with no type, no getPath, and no codeString', () => {
      const result = BlissSVGBuilder.define({ BAD: { noFields: true } });
      expect(result.errors).toHaveLength(1);
      expect(result.defined).toHaveLength(0);
    });

    it('reports an error for an empty codeString', () => {
      const result = BlissSVGBuilder.define({
        BAD: { codeString: '' }
      });
      expect(result.errors).toHaveLength(1);
    });

    it('reports an error for an empty code key', () => {
      const result = BlissSVGBuilder.define({ '': { codeString: 'H' } });
      expect(result.errors).toHaveLength(1);
    });
  });

  describe(`when called with a 'shape' definition missing dimensions`, () => {
    it('reports an error when width is missing', () => {
      const result = BlissSVGBuilder.define({
        BAD: { type: 'shape', getPath: () => '', height: 4 }
      });
      expect(result.errors).toHaveLength(1);
    });

    it('reports an error when height is missing', () => {
      const result = BlissSVGBuilder.define({
        BAD: { type: 'shape', getPath: () => '', width: 4 }
      });
      expect(result.errors).toHaveLength(1);
    });
  });

  describe(`when called with an 'externalGlyph' definition missing the glyph string`, () => {
    it('reports an error when char is missing', () => {
      const result = BlissSVGBuilder.define({
        BAD: { type: 'externalGlyph', getPath: () => '', width: 2 }
      });
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('when called with a duplicate code', () => {
    it('skips the duplicate and reports it under skipped without overwrite', () => {
      const code = trackCode('VALDUP1');
      BlissSVGBuilder.define({ [code]: { codeString: 'H' } });
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'VL8' } });
      expect(result.skipped).toContain(code);
    });

    it('replaces the existing definition when overwrite is true', () => {
      const code = trackCode('VALDUP2');
      BlissSVGBuilder.define({ [code]: { codeString: 'H' } });
      const result = BlissSVGBuilder.define(
        { [code]: { codeString: 'VL8' } },
        { overwrite: true }
      );
      expect(result.defined).toContain(code);
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('VL8');
    });
  });

  describe('when called with null input', () => {
    it('returns an empty result with no defined codes', () => {
      const result = BlissSVGBuilder.define(null);
      expect(result.defined).toHaveLength(0);
    });
  });

  describe('when a glyph definition supplies finite numeric fields', () => {
    it('accepts negative anchorOffsetX and positive width without throwing', () => {
      const code = trackCode('TestFinite');
      BlissSVGBuilder.define({ [code]: { codeString: 'H', type: 'glyph', anchorOffsetX: -1.5, width: 8 } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.codeString).toBe('H');
    });
  });

  describe('when a batch define receives an object with inherited prototype properties', () => {
    it('defines only own keys, not properties inherited via the prototype chain', () => {
      const code = trackCode('OwnProp');
      const data = Object.create({ inherited: { codeString: 'H' } });
      data[code] = { codeString: 'H' };
      BlissSVGBuilder.define(data, { overwrite: true });
      expect(BlissSVGBuilder.isDefined(code)).toBe(true);
      expect(BlissSVGBuilder.isDefined('inherited')).toBe(false);
    });
  });

});
