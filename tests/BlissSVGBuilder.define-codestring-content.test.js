import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins what a definition codeString may contain (the GH #36 enumeration,
 * ratified 2026-07-18): kerning markers are legal inside word codeStrings
 * (they are spacing, not coordinates), SP segments silently normalize to
 * word breaks, real internal coordinates stay rejected for words (and now
 * for patches too), decorated references to known targets register visibly,
 * and multi-word aliases are a supported form.
 *
 * Covers:
 * - define() accepts RK:/AK: kerning markers inside a word codeString (the
 *   GH #36 false-positive) and the use site renders byte-identically to the
 *   inline twin; real coordinates (alone or mixed with kerning) still
 *   reject; single-character definitions keep their coordinate freedom.
 * - patchDefinition parity: kerning patches into a word codeString are
 *   accepted, internal-coordinate patches now throw (the guard
 *   patchDefinition lacked).
 * - SP segments in a bare codeString normalize to `//` at define AND patch
 *   time (stored form pinned); explicit TSP stays as written and renders.
 * - Coordinate-decorated references to KNOWN targets register, render, and
 *   round-trip (row 96(1): the historical silent no-register is gone); a
 *   decorated reference resolving to a word rejects visibly.
 * - Multi-word aliases (`//` in a bare codeString) define, render
 *   byte-identically to the written twin, compose in sentences, and a `;;`
 *   on one warns MALFORMED_WORD_INDICATOR and fails the word (ratified
 *   keep-and-document decision, 2026-07-18).
 *
 * Does NOT cover:
 * - Name/key validation and the indicator-bake guards; see
 *   `BlissSVGBuilder.define-hardening.test.js`.
 * - Composed space segments (`SP;B81`) inside definitions (quote-unaware
 *   ingestion family, post-1.0.0 backlog).
 * - Quoted option values inside definition codeStrings (same family).
 *
 * @issue: #36
 */
describe('BlissSVGBuilder define codeString content', () => {

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

  describe('when a word codeString contains kerning markers', () => {
    it('accepts the GH #36 repro and renders like the inline twin', () => {
      // regression: see issue #36 (the coordinate guard misread RK:-2 as coordinates)
      const code = trackCode('1170');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B313/RK:-2/B516/B1162' } });
      expect(result.defined).toEqual([code]);
      const viaAlias = new BlissSVGBuilder(code);
      const inline = new BlissSVGBuilder('B313/RK:-2/B516/B1162');
      expect(viaAlias.warnings).toEqual([]);
      expect(viaAlias.svgCode).toBe(inline.svgCode);
    });

    it('accepts an absolute kerning marker', () => {
      const code = trackCode('KAK1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B313/AK:1/B516' } });
      expect(result.defined).toEqual([code]);
    });

    it('accepts a bare RK marker', () => {
      const code = trackCode('KBARE1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B313/RK/B516' } });
      expect(result.defined).toEqual([code]);
    });

    it('still rejects real internal coordinates in a word', () => {
      const result = BlissSVGBuilder.define({ KBAD1: { codeString: 'B313/B516:2,0' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot have internal coordinates');
    });

    it('still rejects coordinates when kerning markers are also present', () => {
      const result = BlissSVGBuilder.define({ KBAD2: { codeString: 'B313/RK:-2/B516:2,0' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot have internal coordinates');
    });

    it('keeps coordinate freedom for a single-character definition', () => {
      const code = trackCode('KONE1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B313:2,0' } });
      expect(result.defined).toEqual([code]);
    });
  });

  describe('when patching a bare word codeString', () => {
    it('accepts a kerning patch and renders it', () => {
      const code = trackCode('PW1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B313/B516' } });
      BlissSVGBuilder.patchDefinition(code, { codeString: 'B313/RK:-2/B516' });
      const viaAlias = new BlissSVGBuilder(code);
      const inline = new BlissSVGBuilder('B313/RK:-2/B516');
      expect(viaAlias.svgCode).toBe(inline.svgCode);
    });

    it('rejects an internal-coordinate patch and leaves the definition unchanged', () => {
      // regression: patchDefinition lacked the word-coordinate guard define()
      // has (run-to-stable Phase 2.3; probed 2026-07-18)
      const code = trackCode('PW2');
      BlissSVGBuilder.define({ [code]: { codeString: 'B313/B516' } });
      expect(() => BlissSVGBuilder.patchDefinition(code, { codeString: 'B313/B516:2,0' }))
        .toThrow(/cannot have internal coordinates/);
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B313/B516');
    });
  });

  describe('when a codeString contains SP segments', () => {
    it('normalizes /SP/ to // at define time and renders the space', () => {
      const code = trackCode('SPDEF1');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291/SP/C8' } });
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291//C8');
      const viaAlias = new BlissSVGBuilder(code);
      const written = new BlissSVGBuilder('B291//C8');
      expect(viaAlias.warnings).toEqual([]);
      expect(viaAlias.groups).toHaveLength(2);
      expect(viaAlias.svgCode).toBe(written.svgCode);
    });

    it('normalizes an SP segment at patch time', () => {
      const code = trackCode('SPDEF2');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291/C8' } });
      BlissSVGBuilder.patchDefinition(code, { codeString: 'B291/SP/C8' });
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291//C8');
    });

    it('keeps an explicit TSP segment as written and renders two words', () => {
      const code = trackCode('SPDEF3');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291/TSP/C8' } });
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291/TSP/C8');
      const viaAlias = new BlissSVGBuilder(code);
      expect(viaAlias.groups).toHaveLength(2);
      const reparsed = new BlissSVGBuilder(viaAlias.toString());
      expect(reparsed.svgCode).toBe(viaAlias.svgCode);
    });
  });

  describe('when a codeString references a decorated known target', () => {
    it('registers a coordinate-decorated built-in reference and round-trips it', () => {
      // pins row 96(1): the historical silent no-register is gone; the
      // decorated reference registers, renders, and round-trips
      const code = trackCode('DECREF1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291:1,2' } });
      expect(result.defined).toEqual([code]);
      const builder = new BlissSVGBuilder(code);
      expect(builder.warnings).toEqual([]);
      const reparsed = new BlissSVGBuilder(builder.toString());
      expect(reparsed.svgCode).toBe(builder.svgCode);
    });

    it('inlines a decorated reference to a custom bare target', () => {
      trackCode('DECTGT1');
      BlissSVGBuilder.define({ DECTGT1: { codeString: 'B291' } });
      const code = trackCode('DECREF2');
      BlissSVGBuilder.define({ [code]: { codeString: 'DECTGT1:1,2' } });
      expect(BlissSVGBuilder.getDefinition(code).codeString).toBe('B291:1,2');
    });

    it('rejects a decorated reference that resolves to a word, visibly', () => {
      trackCode('DECWORD1');
      BlissSVGBuilder.define({ DECWORD1: { codeString: 'B291/B313' } });
      const result = BlissSVGBuilder.define({ DECREF3: { codeString: 'DECWORD1:1,2' } });
      expect(result.defined).toEqual([]);
      expect(result.errors[0]).toContain('cannot have internal coordinates');
      expect(BlissSVGBuilder.isDefined('DECREF3')).toBe(false);
    });
  });

  describe('when a codeString is a multi-word alias', () => {
    it('defines and renders byte-identically to the written twin', () => {
      // ratified 2026-07-18: multi-word aliases are a supported form
      const code = trackCode('TEAM1');
      const result = BlissSVGBuilder.define({ [code]: { codeString: 'B291//C8' } });
      expect(result.defined).toEqual([code]);
      const viaAlias = new BlissSVGBuilder(code);
      const written = new BlissSVGBuilder('B291//C8');
      expect(viaAlias.groups).toHaveLength(2);
      expect(viaAlias.svgCode).toBe(written.svgCode);
      expect(viaAlias.toString()).toBe('B291//C8');
    });

    it('composes inside a sentence', () => {
      const code = trackCode('TEAM2');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291//C8' } });
      const builder = new BlissSVGBuilder(`B313//${code}`);
      expect(builder.groups).toHaveLength(3);
      expect(builder.toString()).toBe('B313//B291//C8');
    });

    it('fails the word with MALFORMED_WORD_INDICATOR when ;; is applied to it', () => {
      // a word indicator needs one word; a multi-word alias expands past a
      // word break, so the whole unit fails (error-granularity contract)
      const code = trackCode('TEAM3');
      BlissSVGBuilder.define({ [code]: { codeString: 'B291//C8' } });
      const builder = new BlissSVGBuilder(`${code};;B81`);
      expect(builder.warnings.map(w => w.code)).toEqual(['MALFORMED_WORD_INDICATOR']);
      expect(builder.toString()).toBe('');
    });
  });
});
