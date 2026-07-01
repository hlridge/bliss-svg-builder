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
 * - Content guards: a glyph definition cannot bake in an indicator part (D-S1a);
 *   a definition cannot use a composed unflagged alias as a ; part (part-merge
 *   operand rule) - a word-member via / or a flagged glyph part is fine; no
 *   definition (glyph, shape, or bare alias) may carry a ;; word-level indicator
 *   (a use-site construct: WORD;;IND), regardless of whether the code after ;; is
 *   itself an indicator.
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

  describe('when a glyph or shape definition is a multi-character word', () => {
    // note: a glyph and a shape are each a single character; `/` and `//` are
    // word separators, so a `/`-bearing codeString is a word, not a character.
    // Define a word as a bare alias (omit the type flag). The parser already
    // treats such a def as a word (isWordDefinition) and warns MISPLACED on a
    // `;`-part, contradicting the single-character type flag; rejecting at define
    // removes the contradiction. (Strict Indicator Separation, F4.)
    it('rejects a glyph whose codeString is a multi-character word', () => {
      const code = trackCode('GLYPH_WORD');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'H/S2' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('rejects a glyph whose codeString is a multi-word sequence', () => {
      const code = trackCode('GLYPH_MULTIWORD');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291//B313' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('rejects a shape whose codeString is a multi-character word', () => {
      const code = trackCode('SHAPE_WORD');
      const result = BlissSVGBuilder.define({ [code]: { type: 'shape', codeString: 'HL8/VL8' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('names the word problem and the bare-alias alternative in the message', () => {
      const code = trackCode('GLYPH_WORD_MSG');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'H/S2' } });
      expect(result.errors[0]).toContain('word');
      expect(result.errors[0]).toContain('alias');
    });

    it('still accepts a single-character composite glyph (no /)', () => {
      const code = trackCode('GLYPH_COMPOSITE_OK');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'H;S2' } });
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('glyph');
    });

    it('still accepts a word defined as a bare alias', () => {
      const code = trackCode('BARE_WORD_OK');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291/B313' } });
      expect(BlissSVGBuilder.getDefinition(code).type).toBe('bare');
    });
  });

  describe('when a glyph or shape definition contains a word-level indicator (;;)', () => {
    // note: `;;` is a word-level construct (it sets a word's part-of-speech); a
    // glyph and a shape are each a single character, so `;;` cannot appear in
    // their codeString. (Strict Indicator Separation.)
    it('rejects a glyph whose codeString contains ;;', () => {
      const code = trackCode('GLYPH_WORDIND');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B303;;B291' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('rejects a shape whose codeString contains ;;', () => {
      const code = trackCode('SHAPE_WORDIND');
      const result = BlissSVGBuilder.define({ [code]: { type: 'shape', codeString: 'HL8;;VL8' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('names the word-level indicator in the message', () => {
      const code = trackCode('GLYPH_WORDIND_MSG');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B303;;B291' } });
      expect(result.errors[0]).toContain(';;');
    });
  });

  describe('when a bare definition contains a word-level indicator (;;)', () => {
    // A `;;` word-level indicator is a USE-SITE construct (applied to a word in a
    // given usage: WORD;;IND), never baked into a stored definition -- the same
    // rule the glyph and shape guards enforce, extended to bare aliases. Baking
    // it in is nonsensical: referencing such a definition with a further use-site
    // `;;` would nest word-indicators (`((BAKED;;IND);;IND);;IND`), yet a word
    // carries only one. So ANY `;;` in a definition's codeString is rejected,
    // whether or not the code after it is itself an indicator. (Strict Indicator
    // Separation.)
    it('rejects a bare alias whose codeString contains ;; (non-indicator code)', () => {
      const code = trackCode('BARE_WORDIND');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B303;;B291' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('rejects a bare alias whose codeString contains ;; even with a valid indicator', () => {
      // the ban is on the `;;` construct inside a definition, not on the code
      // after it: B81 IS an indicator, but `WORD;;IND` belongs at the use site,
      // so baking it into a def is still rejected.
      const code = trackCode('BARE_WORDIND_VALID');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B303;;B81' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });

    it('names the word-level indicator in the rejection message', () => {
      const code = trackCode('BARE_WORDIND_MSG');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B303;;B291' } });
      expect(result.errors[0]).toContain(';;');
    });
  });

  describe('when a shape definition bakes an indicator', () => {
    // a shape can only reference other shapes; an indicator is a glyph-type
    // character, so a shape codeString that bakes one is rejected. Pins the
    // indicator case of the shape-only-reference rule explicitly.
    it('rejects a shape whose codeString references an indicator', () => {
      const code = trackCode('SHAPE_INDICATOR');
      const result = BlissSVGBuilder.define({ [code]: { type: 'shape', codeString: 'HL8;B86' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition(code)).toBeNull();
    });
  });

  describe('when a definition uses a composed alias as a ; part', () => {
    // note: ; is part-merge, so a ;-part operand must be a part (a primitive or a
    // flagged glyph/indicator). A composed unflagged alias (B291;B81) is a
    // character, not a part; using it as a non-leading ;-part inside a definition
    // is rejected, matching the use-site failure. The check runs on the raw
    // codeString before bare-alias resolution would flatten H;<alias> to the
    // legal explicit H;B291;B81 (a glyph def's composed-alias part is already
    // rejected upstream: a glyph cannot reference a bare alias).
    it('rejects a bare definition that uses a composed alias as a ; part', () => {
      BlissSVGBuilder.define({ [trackCode('CompAlias')]: { codeString: 'B291;B81' } });
      const result = BlissSVGBuilder.define({ [trackCode('CompWrap')]: { codeString: 'H;CompAlias' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition('CompWrap')).toBeNull();
    });

    it('names the part-merge rule in the rejection message', () => {
      BlissSVGBuilder.define({ [trackCode('CompAliasMsg')]: { codeString: 'B291;B81' } });
      const result = BlissSVGBuilder.define({ [trackCode('CompWrapMsg')]: { codeString: 'H;CompAliasMsg' } });
      expect(result.errors[0]).toMatch(/cannot be a composition/i);
    });

    it('accepts a composed alias as a word-member via /', () => {
      BlissSVGBuilder.define({ [trackCode('CompAliasWord')]: { codeString: 'B291;B81' } });
      const result = BlissSVGBuilder.define({ [trackCode('CompWord')]: { codeString: 'B313/CompAliasWord' } });
      expect(result.errors).toEqual([]);
      expect(BlissSVGBuilder.getDefinition('CompWord')).not.toBeNull();
    });

    it('accepts a flagged glyph as a ; part', () => {
      BlissSVGBuilder.define({ [trackCode('FlagGlyph')]: { type: 'glyph', codeString: 'HL8;HL8:0,8' } });
      const result = BlissSVGBuilder.define({ [trackCode('FlagWrap')]: { codeString: 'H;FlagGlyph' } });
      expect(result.errors).toEqual([]);
      expect(BlissSVGBuilder.getDefinition('FlagWrap')).not.toBeNull();
    });

    it('still defines a base+indicator alias on its own', () => {
      // the guard fires on a composed alias used AS a ; part, never on defining
      // the alias itself (a bare base+indicator alias is the supported form)
      const result = BlissSVGBuilder.define({ [trackCode('CompAliasSolo')]: { codeString: 'B291;B81' } });
      expect(result.errors).toEqual([]);
      expect(BlissSVGBuilder.getDefinition('CompAliasSolo').type).toBe('bare');
    });
  });

  describe('when a definition forms a reference cycle', () => {
    // complements the glyph-cycle coverage in custom-glyphs.test.js: bare aliases
    // can reference any type, so #defineBare must also reject a cycle or it would
    // store a self-referential codeString and crash at render with "Maximum
    // recursion depth". One side fails to register, terminating the chain.
    it('rejects a bare-alias cycle and renders without recursing', () => {
      const result = BlissSVGBuilder.define({
        [trackCode('CycleA')]: { codeString: 'CycleB;B291' },
        [trackCode('CycleB')]: { codeString: 'CycleA' },
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(() => new BlissSVGBuilder('H;CycleA').svgCode).not.toThrow();
    });

    it('rejects a direct bare-alias self-reference', () => {
      const result = BlissSVGBuilder.define({ [trackCode('SelfRef')]: { codeString: 'SelfRef;B291' } });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(BlissSVGBuilder.getDefinition('SelfRef')).toBeNull();
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
