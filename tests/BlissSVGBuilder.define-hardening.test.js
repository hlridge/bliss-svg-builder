import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the define()/patchDefinition() registry-integrity guards: built-in
 * definitions cannot be overwritten, reserved and invisible names are
 * rejected, and the indicator-bake invariant holds regardless of definition
 * order (deferred validation of forward references) and on every patch route.
 *
 * Covers:
 * - define(..., {overwrite:true}) on a built-in code errors instead of
 *   silently replacing it (B291, TSP, C8); without overwrite built-ins keep
 *   landing in skipped[]; custom definitions still overwrite freely.
 * - Reserved syntax names RK / AK / SP error at define.
 * - X-followed-by-letters names (Latin, Cyrillic, Greek recognition ranges)
 *   error at define; bare X and X-plus-digits stay definable.
 * - Typed (glyph/shape) definitions reject a codeString that expands to a
 *   letter sequence (XOH is shorthand for XO/XH), on define and on patch,
 *   while a run collapsing to one text glyph and a bare alias stay legal.
 * - Definition keys containing control or format characters (zero-width
 *   space, NUL, BOM, RTL mark) error at define.
 * - Deferred validation: a later define/patch that would make an existing
 *   glyph definition bake an indicator is rejected with an error naming the
 *   dependent, whether it completes a forward reference directly, through a
 *   bare alias, via overwrite, or via a patch isIndicator flip.
 * - patchDefinition rejects a glyph codeString that bakes an indicator (the
 *   guard define() always had) in both directions: baking anatomy into a
 *   plain glyph, and un-flagging a compound indicator that has indicator
 *   anatomy. codeString + isIndicator:true together stay legal.
 * - isIndicator is honored only on a type:'glyph' definition: a flagged bare
 *   alias, shape, or auto-detected shape errors at define, and patchDefinition
 *   rejects flagging a bare definition.
 *
 * Does NOT cover:
 * - codeString CONTENT rules (kerning, spaces, coordinates, multi-word
 *   aliases); see `BlissSVGBuilder.define-codestring-content.test.js`.
 * - Indicator-ness carrying through aliases at use sites; see
 *   `BlissSVGBuilder.alias-indicator.test.js`.
 * - The general define() type/property validation; see
 *   `BlissSVGBuilder.define.test.js`.
 */
describe('BlissSVGBuilder define hardening', () => {

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

  describe('when overwriting a built-in definition', () => {
    it('errors for a built-in glyph and leaves its rendering untouched', () => {
      const before = new BlissSVGBuilder('B291').svgCode;
      const result = BlissSVGBuilder.define({ B291: { codeString: 'B313' } }, { overwrite: true });
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('cannot overwrite built-in definitions');
      expect(new BlissSVGBuilder('B291').svgCode).toBe(before);
    });

    it.each(['TSP', 'C8'])('errors for the built-in %s', (code) => {
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291' } }, { overwrite: true });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot overwrite built-in definitions');
    });

    it('keeps skipping built-ins without overwrite', () => {
      const result = BlissSVGBuilder.define({ B291: { codeString: 'B313' } });
      expect(result.skipped).toEqual(['B291']);
      expect(result.errors).toEqual([]);
    });

    it('still replaces a custom definition with overwrite', () => {
      const code = trackCode('OWCUSTOM1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291' } });
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B313' } }, { overwrite: true });
      expect(result.defined).toEqual([code]);
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B313');
    });

    it('classifies a rejected entry as an error even when its name says already exists', () => {
      // regression: skipped-vs-error was classified by message text, so a
      // code NAMED "already exists" turned a validation error into a
      // "skipped" report (review MINOR-5, 2026-07-18)
      const result = BlissSVGBuilder.define({ 'already exists': { codeString: 'H/C8:1,1' } });
      expect(result.skipped).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('internal coordinates');
    });
  });

  describe('when targeting a letter alias (B29-B80)', () => {
    // regression: the letter aliases register after the builtInCodes
    // snapshot, so all three replacement routes accepted them (review
    // MINOR-3, 2026-07-18); they are shipped permanent vocabulary
    it('errors on an overwrite define', () => {
      const result = BlissSVGBuilder.define({ B29: { codeString: 'B291' } }, { overwrite: true });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot overwrite built-in definitions');
    });

    it('throws on patchDefinition', () => {
      expect(() => BlissSVGBuilder.patchDefinition('B29', { codeString: 'C8' }))
        .toThrow(/cannot patch built-in definitions/);
    });

    it('throws on removeDefinition', () => {
      expect(() => BlissSVGBuilder.removeDefinition('B29')).toThrow(/cannot remove built-in definitions/);
    });

    it('reports isBuiltIn true while keeping the alias emission', () => {
      expect(BlissSVGBuilder.getDefinition('B29').isBuiltIn).toBe(true);
      expect(new BlissSVGBuilder('B29').toString()).toBe('Xa');
      expect(new BlissSVGBuilder('B29').svgCode).toBe(new BlissSVGBuilder('Xa').svgCode);
    });
  });

  describe('when defining a reserved syntax name', () => {
    it.each(['RK', 'AK', 'SP'])('errors for %s', (code) => {
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('reserved');
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it('leaves kerning syntax working after the rejected define', () => {
      BlissSVGBuilder.define({ RK: { codeString: 'B291' } });
      const builder = new BlissSVGBuilder('B313/RK:-2/B516');
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B313/RK:-2/B516');
    });
  });

  describe('when defining an X-namespace name', () => {
    it.each(['XAB', 'XЖД', 'Xλμ'])('errors for %s (X followed by letters)', (code) => {
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('external-character namespace');
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it('errors for a built-in outlined letter name and keeps the built-in', () => {
      const result = BlissSVGBuilder.define({ Xq: { codeString: 'B291' } }, { overwrite: true });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('external-character namespace');
      expect(BlissSVGBuilder.getDefinition('Xq').isBuiltIn).toBe(true);
      expect(BlissSVGBuilder.getDefinition('Xq').codeString).toBeUndefined();
    });

    it.each(['X', 'X9'])('still accepts the out-of-namespace name %s', (code) => {
      const result = BlissSVGBuilder.define({ [trackCode(code)]: { codeString: 'B291' } });
      expect(result.defined).toEqual([code]);
    });
  });

  describe('when a definition key contains an invisible character', () => {
    it('errors for a zero-width space, naming the code point', () => {
      const result = BlissSVGBuilder.define({ 'Q​Z': { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('invisible character');
      expect(result.errors[0]).toContain('U+200B');
    });

    it.each([
      ['a NUL control character', 'Q Z1'],
      ['a leading BOM', '﻿QZ2'],
      ['a right-to-left mark', 'QZ‏3'],
    ])('errors for %s', (label, code) => {
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('invisible character');
    });

    it('errors for a no-break space, naming the code point', () => {
      const result = BlissSVGBuilder.define({ 'Q Z9': { codeString: 'B291' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('U+00A0');
    });

    it('still accepts an interior plain space', () => {
      // boundary pin: the full code grammar (rejecting 'A B'-style names) is a
      // separate post-1.0.0 decision; only invisible characters reject here
      const code = trackCode('A B1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291' } });
      expect(result.defined).toEqual([code]);
    });
  });

  describe('when a later definition completes a forward reference into an indicator bake', () => {
    it('rejects defining the referenced code as an indicator glyph, naming the dependent', () => {
      const dependent = trackCode('FWGLYPH1');
      BlissSVGBuilder.define({ [dependent]: { type: 'glyph', codeString: 'B291;FWIND1' } });
      const result = BlissSVGBuilder.define({ FWIND1: { type: 'glyph', isIndicator: true, codeString: 'B86' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain(dependent);
      expect(BlissSVGBuilder.isDefined('FWIND1')).toBe(false);
    });

    it('rejects defining the referenced code as a bare alias to an indicator', () => {
      const dependent = trackCode('FWGLYPH2');
      BlissSVGBuilder.define({ [dependent]: { type: 'glyph', codeString: 'B291;FWIND2' } });
      const result = BlissSVGBuilder.define({ FWIND2: { codeString: 'B81' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain(dependent);
      expect(BlissSVGBuilder.isDefined('FWIND2')).toBe(false);
    });

    it('accepts the same define once the dependent is removed', () => {
      const dependent = 'FWGLYPH3';
      BlissSVGBuilder.define({ [dependent]: { type: 'glyph', codeString: 'B291;FWIND3' } });
      BlissSVGBuilder.removeDefinition(dependent);
      const result = BlissSVGBuilder.define({ [trackCode('FWIND3')]: { type: 'glyph', isIndicator: true, codeString: 'B86' } });
      expect(result.defined).toEqual(['FWIND3']);
    });

    it('rejects an overwrite that turns a referenced glyph into an indicator', () => {
      const target = trackCode('OWIND1');
      const dependent = trackCode('OWGLYPH1');
      BlissSVGBuilder.define({ [target]: { type: 'glyph', codeString: 'C8' } });
      BlissSVGBuilder.define({ [dependent]: { type: 'glyph', codeString: `B291;${target}` } });
      const result = BlissSVGBuilder.define(
        { [target]: { type: 'glyph', isIndicator: true, codeString: 'B86' } },
        { overwrite: true }
      );
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain(dependent);
      expect(BlissSVGBuilder.getDefinition(target).isIndicator).toBeUndefined();
    });

    it('rejects a patch isIndicator flip on a referenced glyph', () => {
      const target = trackCode('PFIND1');
      const dependent = trackCode('PFGLYPH1');
      BlissSVGBuilder.define({ [target]: { type: 'glyph', codeString: 'C8' } });
      BlissSVGBuilder.define({ [dependent]: { type: 'glyph', codeString: `B291;${target}` } });
      expect(() => BlissSVGBuilder.patchDefinition(target, { isIndicator: true }))
        .toThrow(new RegExp(dependent));
      expect(BlissSVGBuilder.getDefinition(target).isIndicator).toBeUndefined();
    });

    it('accepts an indicator definition nobody references', () => {
      const result = BlissSVGBuilder.define({ [trackCode('FREEIND1')]: { type: 'glyph', isIndicator: true, codeString: 'B86' } });
      expect(result.defined).toEqual(['FREEIND1']);
    });
  });

  describe('when patching a glyph codeString that bakes an indicator', () => {
    it('rejects the patch and leaves the definition unchanged', () => {
      // regression: patchDefinition omitted the define()-side D-S1a guard
      // (run-to-stable Phase 2.3; probed 2026-07-18)
      const code = trackCode('PBGLYPH1');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { codeString: 'B291;B81' }))
        .toThrow(/cannot bake in an indicator/);
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291');
    });

    it('accepts codeString with isIndicator:true in the same patch (compound indicator)', () => {
      const code = trackCode('PBGLYPH2');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'C8' } });
      const result = BlissSVGBuilder.patchDefinition(code, { codeString: 'B86;SDOT:3,4', isIndicator: true });
      expect(result).toEqual({ patched: true });
      expect(BlissSVGBuilder.getDefinition(code).isIndicator).toBe(true);
    });

    it('rejects un-flagging a compound indicator whose anatomy bakes an indicator', () => {
      const code = trackCode('PBGLYPH3');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', isIndicator: true, codeString: 'B86;SDOT:3,4' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { isIndicator: false }))
        .toThrow(/cannot bake in an indicator/);
      expect(BlissSVGBuilder.getDefinition(code).isIndicator).toBe(true);
    });
  });

  describe('when flagging a non-glyph definition as an indicator', () => {
    // run-to-stable Phase 2.4c: isIndicator declares a compound indicator
    // glyph, so it is honored only on type:'glyph'. On a bare alias, shape, or
    // external glyph the flag was silently dropped, so the `;` and `;;`
    // surfaces disagreed with the stated intent; define() now rejects it.
    it('errors for a typeless flagged alias and does not register it', () => {
      const result = BlissSVGBuilder.define({ [trackCode('FLAGBARE1')]: { isIndicator: true, codeString: 'C2' } });
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("type:'glyph'");
      expect(BlissSVGBuilder.isDefined('FLAGBARE1')).toBe(false);
    });

    it('errors for a flagged shape definition', () => {
      const result = BlissSVGBuilder.define({ [trackCode('FLAGSHAPE1')]: { type: 'shape', isIndicator: true, codeString: 'C8' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain("type:'glyph'");
      expect(BlissSVGBuilder.isDefined('FLAGSHAPE1')).toBe(false);
    });

    it('errors for a flagged auto-detected shape (getPath, no type)', () => {
      const result = BlissSVGBuilder.define({
        [trackCode('FLAGGP1')]: { isIndicator: true, getPath: (x, y) => `M${x},${y}h2v2h-2Z`, width: 2, height: 2 },
      });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain("type:'glyph'");
      expect(BlissSVGBuilder.isDefined('FLAGGP1')).toBe(false);
    });

    it('still accepts isIndicator on a type:glyph definition', () => {
      const result = BlissSVGBuilder.define({ [trackCode('FLAGGLYPH1')]: { type: 'glyph', isIndicator: true, codeString: 'C2' } });
      expect(result.defined).toEqual(['FLAGGLYPH1']);
      expect(BlissSVGBuilder.getDefinition('FLAGGLYPH1').isIndicator).toBe(true);
    });

    it('registers a bare alias when isIndicator is absent', () => {
      const result = BlissSVGBuilder.define({ [trackCode('PLAINBARE1')]: { codeString: 'C2' } });
      expect(result.defined).toEqual(['PLAINBARE1']);
    });

    it('registers a bare alias when isIndicator is explicitly false', () => {
      // boundary: only isIndicator:true rejects, matching the strict === true
      // read the glyph path uses; a falsy flag is a no-op, not a rejection
      const result = BlissSVGBuilder.define({ [trackCode('PLAINBARE2')]: { isIndicator: false, codeString: 'C2' } });
      expect(result.defined).toEqual(['PLAINBARE2']);
    });

    it('registers a bare alias when isIndicator is a truthy non-true value', () => {
      // pins the strict `=== true` read (matching the glyph path at #defineGlyph):
      // a truthy non-true flag is ignored, not rejected. kills the ===true->truthy mutant
      const result = BlissSVGBuilder.define({ [trackCode('PLAINBARE3')]: { isIndicator: 1, codeString: 'C2' } });
      expect(result.defined).toEqual(['PLAINBARE3']);
      expect(BlissSVGBuilder.getDefinition('PLAINBARE3').isIndicator).toBeUndefined();
    });

    it('rejects patching isIndicator onto a bare definition', () => {
      const code = trackCode('PATCHBARE1');
      BlissSVGBuilder.define({ [code]: { codeString: 'C2' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { isIndicator: true }))
        .toThrow(/not a valid property for type "bare"/);
      expect(BlissSVGBuilder.getDefinition(code).isIndicator).toBeUndefined();
    });
  });

  // regression: see issue #39. The typed-definition word guards reject a
  // codeString containing `/`, but a multi-letter external-letter run is a word
  // WITHOUT a `/`: `XOH` is shorthand for `XO/XH`. Such a definition used to
  // register as one character and then expand to two glyphs at use, dropping
  // its glyph identity. The guard cannot be a plain string test, since a run
  // holding a letter with no built-in outline is one text glyph and stays legal.
  describe('when a typed definition codeString is a multi-letter external-letter run', () => {
    it('rejects a glyph definition whose codeString expands to a letter sequence', () => {
      const code = trackCode('XRUNGLYPH1');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'XOH' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('multi-character word');
      expect(result.errors[0]).toContain('XO/XH');
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it('rejects a shape definition whose codeString expands to a letter sequence', () => {
      const code = trackCode('XRUNSHAPE1');
      const result = BlissSVGBuilder.define({ [code]: { type: 'shape', codeString: 'XOH' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('multi-character word');
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it('rejects patching a typed definition onto a letter sequence', () => {
      const code = trackCode('XRUNPATCH1');
      BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { codeString: 'XOH' }))
        .toThrow(/multi-character word/);
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291');
    });

    it('keeps accepting a run that collapses to a single text-fallback glyph', () => {
      // Greek lambda has no built-in outline, so Xaλ is ONE text glyph, not a
      // word; rejecting it would over-apply the guard
      const code = trackCode('XRUNTEXT1');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'Xaλ' } });
      expect(result.defined).toEqual([code]);
    });

    it('rejects a glyph definition whose run carries a ;-part', () => {
      // the ;-part suppresses expansion, so the codeString holds no `/` and a
      // guard that only looked at the expanded string let this through
      const code = trackCode('XRUNPART1');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'Xab;C8' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('multi-character word');
      expect(BlissSVGBuilder.isDefined(code)).toBe(false);
    });

    it('keeps accepting a one-glyph run that carries a ;-part', () => {
      // Xaλ is one text glyph, so composing a part onto it is a single character
      const code = trackCode('XRUNPART2');
      const result = BlissSVGBuilder.define({ [code]: { type: 'glyph', codeString: 'Xaλ;C8' } });
      expect(result.defined).toEqual([code]);
    });

    it('keeps accepting a bare alias whose codeString is a letter sequence', () => {
      // a bare alias IS the way to name a word, so the guard must not reach it
      const code = trackCode('XRUNBARE1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'XOH' } });
      expect(result.defined).toEqual([code]);
    });
  });
});
