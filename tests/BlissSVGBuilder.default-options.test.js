import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the defaultOptions feature on BlissSVGBuilder definitions: a
 * definition (glyph, shape, externalGlyph; user-defined or built-in) may
 * carry default SVG presentation attributes that surface on the rendered
 * `<g>` wrapper, are overridable by element-level options
 * (`[opt=val]>CODE`) but not by global options (because the SVG cascade
 * makes the inner `<g>` win over the outer `<svg>`), and survive
 * toJSON/fromJSON round-trips.
 *
 * Covers:
 * - `BlissSVGBuilder.define` accepts a `defaultOptions` field on glyph,
 *   externalGlyph, and shape definitions (both `getPath`-based and
 *   `codeString`-based shapes); the field is returned frozen by
 *   `getDefinition`; an empty `{}` is treated as undefined; multiple
 *   attributes are stored together; batch `define` propagates the field.
 * - The default attribute renders on the element's `<g>` wrapper in the
 *   SVG output; multiple defaults render as multiple attributes; a
 *   definition without defaultOptions emits no attribute.
 * - Element-level options on a CODE override matching defaultOptions and
 *   leave the others intact.
 * - Global options (`||`), constructor `defaults`, and constructor
 *   `overrides` do NOT replace a definition's defaultOptions; the
 *   definition's value wins because the inner `<g>` cascades over the
 *   outer `<svg>`.
 * - Compositions: defaultOptions survive when the definition is used as a
 *   sub-part inside another definition's codeString, in inline `;`
 *   composition, in a multi-glyph word with `/`, and through nested
 *   codeString references; in a multi-glyph builder, only the glyph that
 *   declares defaultOptions gets the attribute.
 * - `define` with `{ overwrite: true }` replaces an existing definition's
 *   defaultOptions with the new value; an overwrite without
 *   defaultOptions removes the previous defaultOptions.
 * - toJSON/fromJSON round-trips preserve defaultOptions rendering and any
 *   element-level override on top of them.
 * - The project-shipped built-ins REFSQUARE and ANCHORRING carry
 *   stroke-dasharray defaultOptions; both render with the dashed stroke
 *   and accept element-level overrides.
 *
 * Does NOT cover:
 * - The full `BlissSVGBuilder.define` API beyond the defaultOptions
 *   field, see `tests/BlissSVGBuilder.define.test.js` and
 *   `tests/BlissSVGBuilder.definition-maintenance.test.js`.
 * - Visual regression of the rendered defaultOptions output, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 *
 * @contract: definition-default-options
 */

describe('BlissSVGBuilder defaultOptions', () => {

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

  function defineTracked(definitions, options) {
    for (const code of Object.keys(definitions)) trackCode(code);
    return BlissSVGBuilder.define(definitions, options);
  }

  describe('when a definition declares defaultOptions', () => {

    it('accepts the defaultOptions field on a glyph definition', () => {
      const code = trackCode('DEFOPT1');
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

    it('returns frozen defaultOptions from getDefinition', () => {
      const code = trackCode('DEFOPT2');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'C2:0,4',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.777' }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(Object.isFrozen(def.defaultOptions)).toBe(true);
    });

    it('omits defaultOptions on a definition that does not declare any (backward compatible)', () => {
      const code = trackCode('DEFOPT3');
      BlissSVGBuilder.define({ [code]: { codeString: 'H:0,8', type: 'glyph' } });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toBeUndefined();
    });

    it('treats an empty defaultOptions object as undefined', () => {
      const code = trackCode('DEFOPT4');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'H:0,8',
          type: 'glyph',
          defaultOptions: {}
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toBeUndefined();
    });

    it('stores multiple default attributes together', () => {
      const code = trackCode('DEFOPT5');
      BlissSVGBuilder.define({
        [code]: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: {
            'stroke-dasharray': '2 2',
            'opacity': '0.5'
          }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({
        'stroke-dasharray': '2 2',
        'opacity': '0.5'
      });
    });

    it('passes defaultOptions through a batch define call', () => {
      const code = trackCode('BATCHOPT1');
      const result = BlissSVGBuilder.define({
        [code]: {
          codeString: 'S8:0,8',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      expect(result.defined).toContain(code);
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '0 0.999' });
    });

    it('passes defaultOptions through on an externalGlyph-type definition', () => {
      const code = trackCode('EXTOPT1');
      BlissSVGBuilder.define({
        [code]: {
          type: 'externalGlyph',
          getPath: (x, y) => `M${x},${y}h2v8h-2z`,
          width: 2,
          char: 'τ',
          defaultOptions: { 'opacity': '0.7' }
        }
      });
      const def = BlissSVGBuilder.getDefinition(code);
      expect(def.defaultOptions).toEqual({ 'opacity': '0.7' });
    });
  });

  describe('when a definition with defaultOptions is rendered to SVG', () => {

    it('emits the default attribute on the element <g> wrapper', () => {
      defineTracked({
        SVGOPT1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('SVGOPT1');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('emits multiple default attributes on the wrapper', () => {
      defineTracked({
        SVGOPT2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: {
            'stroke-dasharray': '2 2',
            'opacity': '0.5'
          }
        }
      });
      const builder = new BlissSVGBuilder('SVGOPT2');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="2 2"');
      expect(svg).toContain('opacity="0.5"');
    });

    it('emits no default attribute when the definition declares none', () => {
      const builder = new BlissSVGBuilder('S8:0,8');
      expect(builder.svgCode).not.toContain('stroke-dasharray');
    });
  });

  describe('when an element-level option overrides defaultOptions', () => {

    it('replaces the matching default attribute with the element-level value', () => {
      defineTracked({
        OVERRIDE1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('[stroke-dasharray=5 5]>OVERRIDE1');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="5 5"');
      expect(svg).not.toContain('stroke-dasharray="0 0.999"');
    });

    it('replaces only the named default attribute and leaves the others intact', () => {
      defineTracked({
        OVERRIDE2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: {
            'stroke-dasharray': '0 0.999',
            'opacity': '0.5'
          }
        }
      });
      const builder = new BlissSVGBuilder('[stroke-dasharray=3 3]>OVERRIDE2');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="3 3"');
      expect(svg).not.toContain('stroke-dasharray="0 0.999"');
      expect(svg).toContain('opacity="0.5"');
    });
  });

  describe('when global or constructor-level options coexist with defaultOptions', () => {

    it('keeps the definition default when a global option (||) sets the same attribute', () => {
      defineTracked({
        GLOBAL1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('[stroke-dasharray=10 10]||GLOBAL1');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="0 0.999"');
      expect(svg).toContain('stroke-dasharray="10 10"');
    });

    it('keeps the definition default when constructor `defaults` sets the same attribute', () => {
      defineTracked({
        GLOBAL2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('GLOBAL2', {
        defaults: { strokeDasharray: '10 10' }
      });
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('keeps the definition default when constructor `overrides` sets the same attribute', () => {
      defineTracked({
        GLOBAL3: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('GLOBAL3', {
        overrides: { strokeDasharray: '10 10' }
      });
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });
  });

  describe('when a definition with defaultOptions is used as a sub-part', () => {

    it('preserves defaultOptions when referenced by codeString from another definition', () => {
      defineTracked({
        DASHSQ: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      defineTracked({
        COMPO1: { codeString: 'DASHSQ;VL8:4,0', type: 'glyph' }
      });
      const builder = new BlissSVGBuilder('COMPO1');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('preserves defaultOptions in inline composition with ;', () => {
      defineTracked({
        DASHSQ2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('DASHSQ2;VL8:4,0');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('preserves defaultOptions in a multi-glyph word with /', () => {
      defineTracked({
        DASHSQ3: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('H/DASHSQ3');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('preserves defaultOptions through nested codeString references', () => {
      defineTracked({
        DASHSQ4: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      defineTracked({
        // a word (the `/`) is a bare alias, not a glyph; it still nests the
        // defaultOptions-bearing DASHSQ4 glyph (Strict Indicator Separation, F4).
        WORDCOMP1: { codeString: 'DASHSQ4/H' }
      });
      const builder = new BlissSVGBuilder('WORDCOMP1');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });
  });

  describe('when defaultOptions glyphs are mixed with non-defaultOptions glyphs', () => {

    it('emits the default attribute exactly once, on the glyph that declared it', () => {
      defineTracked({
        DASHM1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const builder = new BlissSVGBuilder('H//DASHM1');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="0 0.999"');
      const matches = svg.match(/stroke-dasharray="0 0\.999"/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('when an existing definition is overwritten', () => {

    it('replaces the previous defaultOptions with the new ones', () => {
      defineTracked({
        OVERWRITE1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      BlissSVGBuilder.define({
        OVERWRITE1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '3 3' }
        }
      }, { overwrite: true });
      const def = BlissSVGBuilder.getDefinition('OVERWRITE1');
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '3 3' });
    });

    it('removes the previous defaultOptions when the overwrite omits the field', () => {
      defineTracked({
        OVERWRITE2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      BlissSVGBuilder.define({
        OVERWRITE2: { codeString: 'S8:0,8', type: 'glyph' }
      }, { overwrite: true });
      const def = BlissSVGBuilder.getDefinition('OVERWRITE2');
      expect(def.defaultOptions).toBeUndefined();
    });
  });

  describe('when a definition with defaultOptions round-trips through toJSON', () => {

    it('produces identical SVG output after toJSON → new BlissSVGBuilder(json)', () => {
      defineTracked({
        ROUNDTRIP1: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const original = new BlissSVGBuilder('ROUNDTRIP1');
      const json = original.toJSON();
      const restored = new BlissSVGBuilder(json);
      expect(restored.svgCode).toBe(original.svgCode);
    });

    it('preserves an element-level override of defaultOptions through the round-trip', () => {
      defineTracked({
        ROUNDTRIP2: {
          codeString: 'S8:0,8',
          type: 'glyph',
          defaultOptions: { 'stroke-dasharray': '0 0.999' }
        }
      });
      const original = new BlissSVGBuilder('[stroke-dasharray=5 5]>ROUNDTRIP2');
      const json = original.toJSON();
      const restored = new BlissSVGBuilder(json);
      expect(restored.svgCode).toContain('stroke-dasharray="5 5"');
      expect(restored.svgCode).not.toContain('stroke-dasharray="0 0.999"');
    });
  });

  describe('when a built-in definition (REFSQUARE / ANCHORRING) carries defaultOptions', () => {

    it('REFSQUARE is shipped with the stroke-dasharray default', () => {
      const def = BlissSVGBuilder.getDefinition('REFSQUARE');
      expect(def).not.toBeNull();
      expect(def.codeString).toBe('S8:0,8');
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '0 0.999' });
    });

    it('REFSQUARE renders with the dashed stroke', () => {
      const builder = new BlissSVGBuilder('REFSQUARE');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.999"');
    });

    it('REFSQUARE accepts an element-level stroke-dasharray override', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=4 4]>REFSQUARE');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="4 4"');
      expect(svg).not.toContain('stroke-dasharray="0 0.999"');
    });

    it('ANCHORRING is shipped with the stroke-dasharray default', () => {
      const def = BlissSVGBuilder.getDefinition('ANCHORRING');
      expect(def).not.toBeNull();
      expect(def.codeString).toBe('C2:0,4');
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '0 0.777' });
    });

    it('ANCHORRING renders with the dashed stroke', () => {
      const builder = new BlissSVGBuilder('ANCHORRING');
      expect(builder.svgCode).toContain('stroke-dasharray="0 0.777"');
    });

    it('ANCHORRING accepts an element-level stroke-dasharray override', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=2 2]>ANCHORRING');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="2 2"');
      expect(svg).not.toContain('stroke-dasharray="0 0.777"');
    });
  });

  describe('when a shape-type definition carries defaultOptions', () => {

    it('accepts defaultOptions on a getPath shape definition', () => {
      defineTracked({
        SHAPEOPT1: {
          type: 'shape',
          getPath: (x, y) => `M${x},${y}h4v4h-4z`,
          width: 4,
          height: 4,
          defaultOptions: { 'stroke-dasharray': '1 1' }
        }
      });
      const def = BlissSVGBuilder.getDefinition('SHAPEOPT1');
      expect(def.defaultOptions).toEqual({ 'stroke-dasharray': '1 1' });
    });

    it('emits the default attribute on a getPath shape', () => {
      defineTracked({
        SHAPEOPT2: {
          type: 'shape',
          getPath: (x, y) => `M${x},${y}h4v4h-4z`,
          width: 4,
          height: 4,
          defaultOptions: { 'stroke-dasharray': '1 1' }
        }
      });
      const builder = new BlissSVGBuilder('SHAPEOPT2:0,8');
      expect(builder.svgCode).toContain('stroke-dasharray="1 1"');
    });

    it('honours an element-level override on a getPath shape', () => {
      defineTracked({
        SHAPEOPT3: {
          type: 'shape',
          getPath: (x, y) => `M${x},${y}h4v4h-4z`,
          width: 4,
          height: 4,
          defaultOptions: { 'stroke-dasharray': '1 1' }
        }
      });
      const builder = new BlissSVGBuilder('[stroke-dasharray=3 3]>SHAPEOPT3:0,8');
      const svg = builder.svgCode;
      expect(svg).toContain('stroke-dasharray="3 3"');
      expect(svg).not.toContain('stroke-dasharray="1 1"');
    });

    it('accepts defaultOptions on a codeString shape definition', () => {
      defineTracked({
        SHAPEOPT5: {
          type: 'shape',
          codeString: 'S8:0,8',
          defaultOptions: { 'stroke-dasharray': '2 2' }
        }
      });
      const builder = new BlissSVGBuilder('SHAPEOPT5');
      expect(builder.svgCode).toContain('stroke-dasharray="2 2"');
    });

    it('omits defaultOptions on a shape definition that does not declare any (backward compatible)', () => {
      defineTracked({
        SHAPEOPT4: {
          type: 'shape',
          getPath: (x, y) => `M${x},${y}h4v4h-4z`,
          width: 4,
          height: 4
        }
      });
      const def = BlissSVGBuilder.getDefinition('SHAPEOPT4');
      expect(def.defaultOptions).toBeUndefined();
    });
  });

});
