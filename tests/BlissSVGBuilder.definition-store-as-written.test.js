import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the store-as-written definition contract (run-to-stable, ratified
 * 2026-07-22): a definition codeString stores bare-alias references as the
 * user wrote them, so definition content is late-bound like native codes and
 * resolves at parse time. Redefining a referenced code flows through to every
 * composition that uses it.
 *
 * Covers:
 * - Written-form storage on define() and patchDefinition() (getDefinition
 *   returns what was written, not a registration-time resolution).
 * - Late binding: redefines of a referenced alias flow through; the
 *   referenced alias's defaultOptions apply like the written twin's.
 * - Parse-time resolution parity with the written twin: render bytes,
 *   digit-leading names, nested word aliases, rename chains, space edges,
 *   and mutation (splitAt) survival.
 * - Guards that must keep working without a stored resolution: the
 *   word-internal-coordinate guard resolving through a referenced alias, and
 *   cycle rejection at the completing define of a forward-referenced chain.
 *
 * Does NOT cover:
 * - Preserve-mode name emission for stored references, see
 *   `BlissSVGBuilder.char-alias-preserve.test.js`.
 * - `/SP/` registration-time normalization to `//` (unchanged by this
 *   contract), see `BlissSVGBuilder.define-codestring-content.test.js`.
 * - `;;` indicator-ness resolution through aliases at the use site, see
 *   `BlissSVGBuilder.alias-indicator.test.js`.
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

const defineLove = () => defineAndTrack({ LOVE: { codeString: 'B431' } });

describe('BlissSVGBuilder definition store-as-written', () => {

  describe('when a definition codeString references a bare alias', () => {
    it('stores the written form', () => {
      defineLove();
      defineAndTrack({ PAIR: { codeString: 'LOVE/B313' } });
      defineAndTrack({ LOVE2: { codeString: 'LOVE' } });
      expect(BlissSVGBuilder.getDefinition('PAIR').codeString).toBe('LOVE/B313');
      expect(BlissSVGBuilder.getDefinition('LOVE2').codeString).toBe('LOVE');
    });

    it('renders byte-identically to the written twin', () => {
      defineLove();
      defineAndTrack({ PAIR: { codeString: 'LOVE/B313' } });
      expect(new BlissSVGBuilder('PAIR').svgCode).toBe(new BlissSVGBuilder('LOVE/B313').svgCode);
      expect(new BlissSVGBuilder('PAIR').warnings).toEqual([]);
    });

    it('applies the referenced alias defaultOptions like the written twin', () => {
      defineAndTrack({ DOPT: { codeString: 'B431', defaultOptions: { color: 'red' } } });
      defineAndTrack({ PAIRD: { codeString: 'DOPT/B313' } });
      expect(new BlissSVGBuilder('PAIRD').svgCode).toBe(new BlissSVGBuilder('DOPT/B313').svgCode);
    });

    it('stores the written form on patchDefinition', () => {
      defineLove();
      defineAndTrack({ PATCHME: { codeString: 'B208' } });
      BlissSVGBuilder.patchDefinition('PATCHME', { codeString: 'LOVE/B313' });
      expect(BlissSVGBuilder.getDefinition('PATCHME').codeString).toBe('LOVE/B313');
      expect(new BlissSVGBuilder('PATCHME').svgCode).toBe(new BlissSVGBuilder('LOVE/B313').svgCode);
    });
  });

  describe('when a referenced code is redefined after registration', () => {
    it('re-renders compositions with the new target', () => {
      defineLove();
      defineAndTrack({ PAIR: { codeString: 'LOVE/B313' } });
      BlissSVGBuilder.define({ LOVE: { codeString: 'B208' } }, { overwrite: true });
      expect(new BlissSVGBuilder('PAIR').toString()).toBe('B208/B313');
      expect(new BlissSVGBuilder('PAIR').svgCode).toBe(new BlissSVGBuilder('LOVE/B313').svgCode);
    });

    it('survives mutation like the written twin', () => {
      defineLove();
      defineAndTrack({ PAIR: { codeString: 'LOVE/B313' } });
      const viaDef = new BlissSVGBuilder('PAIR');
      viaDef.group(0).splitAt(1);
      const written = new BlissSVGBuilder('LOVE/B313');
      written.group(0).splitAt(1);
      expect(viaDef.toString({ preserve: true })).toBe('LOVE//B313');
      expect(viaDef.toString({ preserve: true })).toBe(written.toString({ preserve: true }));
    });
  });

  describe('when stored references resolve at parse time', () => {
    it('renders a digit-leading alias reference like its written twin', () => {
      defineAndTrack({ 9111: { codeString: 'B431' } });
      defineAndTrack({ WDIGIT: { codeString: '9111/B313' } });
      expect(BlissSVGBuilder.getDefinition('WDIGIT').codeString).toBe('9111/B313');
      expect(new BlissSVGBuilder('WDIGIT').svgCode).toBe(new BlissSVGBuilder('9111/B313').svgCode);
    });

    it('renders a nested multi-code word alias like its written twin', () => {
      defineAndTrack({ INNERW: { codeString: 'B431/B313' } });
      defineAndTrack({ OUTERW: { codeString: 'INNERW/B208' } });
      expect(BlissSVGBuilder.getDefinition('OUTERW').codeString).toBe('INNERW/B208');
      expect(new BlissSVGBuilder('OUTERW').toString()).toBe('B431/B313/B208');
      expect(new BlissSVGBuilder('OUTERW').svgCode).toBe(new BlissSVGBuilder('INNERW/B208').svgCode);
    });

    it('resolves a rename chain with no warnings', () => {
      defineAndTrack({ CH0: { codeString: 'B291' } });
      for (let i = 1; i <= 10; i++) {
        defineAndTrack({ ['CH' + i]: { codeString: 'CH' + (i - 1) } });
      }
      const b = new BlissSVGBuilder('CH10/B313');
      expect(b.toString()).toBe('B291/B313');
      expect(b.warnings).toEqual([]);
    });

    it('throws the recursion error past the parser depth cap', () => {
      // pins the MAX_RECURSION_DEPTH=50 boundary as designed behavior (GLM
      // review NOTE 1): stored chains resolve at parse, so a rename ladder of
      // 50+ rungs hits the parser's existing cap visibly instead of silently
      // pre-collapsing at each define; 49 rungs still resolve clean
      defineAndTrack({ LAD0: { codeString: 'B291' } });
      for (let i = 1; i <= 50; i++) {
        defineAndTrack({ ['LAD' + i]: { codeString: 'LAD' + (i - 1) } });
      }
      expect(new BlissSVGBuilder('LAD49').toString()).toBe('B291');
      expect(() => new BlissSVGBuilder('LAD50')).toThrow('Maximum recursion depth exceeded');
    });

    it('keeps a space-edge alias rendering canonically', () => {
      // EDGE itself normalized /SP/ content to // at ITS registration, so the
      // reference resolves to the same canonical spacing as the written twin
      defineAndTrack({ EDGE: { codeString: 'SP/B291' } });
      defineAndTrack({ WEDGE: { codeString: 'EDGE/B313' } });
      expect(BlissSVGBuilder.getDefinition('EDGE').codeString).toBe('//B291');
      expect(new BlissSVGBuilder('WEDGE').toString()).toBe('//B291/B313');
      expect(new BlissSVGBuilder('WEDGE').svgCode).toBe(new BlissSVGBuilder('EDGE/B313').svgCode);
    });
  });

  describe('when a definition would smuggle word-internal coordinates through an alias', () => {
    it('rejects the define with the word-internal-coordinates error', () => {
      // the guard must judge the RESOLVED view even though storage keeps the
      // written form (a stored 'POSX/B313' would bake coordinates indirectly)
      defineAndTrack({ POSX: { codeString: 'B291:2,3' } });
      const result = defineAndTrack({ WPOS: { codeString: 'POSX/B313' } });
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('word definitions (containing /) cannot have internal coordinates');
      expect(BlissSVGBuilder.getDefinition('WPOS')).toBeNull();
    });

    it('rejects the patchDefinition', () => {
      defineAndTrack({ POSX: { codeString: 'B291:2,3' } });
      defineAndTrack({ PATCH2: { codeString: 'B208' } });
      expect(() => BlissSVGBuilder.patchDefinition('PATCH2', { codeString: 'POSX/B313' }))
        .toThrow('word definitions (containing /) cannot have internal coordinates');
      expect(BlissSVGBuilder.getDefinition('PATCH2').codeString).toBe('B208');
    });
  });

  describe('when a completing definition closes an alias cycle', () => {
    it('rejects the completing define and keeps the forward reference dangling', () => {
      defineAndTrack({ CYA: { codeString: 'CYFUT' } });
      const result = defineAndTrack({ CYFUT: { codeString: 'CYA' } });
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('circular reference');
      expect(BlissSVGBuilder.getDefinition('CYFUT')).toBeNull();
      expect(new BlissSVGBuilder('CYA').warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
    });

    it('rejects a patch that closes the cycle', () => {
      defineAndTrack({ CYB: { codeString: 'CYTGT' } });
      defineAndTrack({ CYTGT: { codeString: 'B291' } });
      expect(() => BlissSVGBuilder.patchDefinition('CYTGT', { codeString: 'CYB' }))
        .toThrow('circular reference');
      expect(BlissSVGBuilder.getDefinition('CYTGT').codeString).toBe('B291');
    });
  });

});
