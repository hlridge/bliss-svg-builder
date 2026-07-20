import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the space-as-part invariant: a space (TSP/QSP) is a word-level
 * separator, never a `;`-part, so a space code inside a multi-part list is
 * dropped from both render and serialization with MISPLACED_SPACE while
 * the rest of the character renders (the warn + drop model of
 * MISPLACED_SPACE_DECORATION and MISPLACED_INDICATOR_PART). Any coordinate or
 * option on the dropped space part dies with it. A single-part space glyph IS
 * the space itself and is never touched.
 *
 * Covers:
 * - DSL drops: trailing, leading, and mid-sequence space parts; multiple drops
 *   in reading order; warning payload (code/source/message); the coordinate
 *   suffix in the dropped source.
 * - The chunk-6 tail: a part option on a space part (`B313;[color=red]>QSP`)
 *   drops with its carrier instead of surviving silently.
 * - Render effect: a far-positioned space part no longer widens the canvas.
 * - Navigation repair: a space-led part list no longer miscounts `.groups`.
 * - Untouched forms: genuine space words, ZSA parts (content, exempt),
 *   the parser-transient SP (unknown-code path, not a space classifier
 *   member). A fail-flagged word is dropped whole before the space-part pass
 *   (retention family, rows 31/80), so it never needs a separate exemption.
 * - The define() reference-type gate: a glyph definition cannot reference a
 *   space, so no definition anatomy legitimately contains a space part.
 * - Normalizer ordering: a space part is no indicator witness, so the
 *   space drop runs before the indicator-sequencing invariant.
 * - The uncertainty exemption: the drop is skipped when no definition-known
 *   part would remain beside the space (a sole surviving unknown token like
 *   SP would re-emit bare and silently morph on reparse); an all-space list
 *   still drops to an empty glyph.
 * - Alias expansion, hand-authored object input, and the mutation backdoors
 *   (addPart / insertPart / part.replace).
 * - Round-trip stability: reparse and toJSON rebuild warn nothing further.
 *
 * Does NOT cover:
 * - Decorations on a single-part space glyph (MISPLACED_SPACE_DECORATION),
 *   see BlissSVGBuilder.space-classifier.test.js and the space-invariant
 *   coverage in BlissSVGBuilder.space-handling.test.js.
 * - Indicator sequencing itself, see
 *   BlissSVGBuilder.indicator-sequencing.test.js.
 * - `;;` word-indicator slot validation, see
 *   BlissParser.word-indicator-validation.test.js.
 */
describe('BlissSVGBuilder space as a part', () => {
  const spaceWarnings = (builder) =>
    builder.warnings.filter((w) => w.code === 'MISPLACED_SPACE');

  describe('when a space code sits in a multi-part list', () => {
    it('drops a trailing space part and renders the base alone', () => {
      const b = new BlissSVGBuilder('B313;QSP');
      expect(b.toString()).toBe('B313');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });

    it('drops a trailing three-quarter space part', () => {
      const b = new BlissSVGBuilder('B313;TSP');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['TSP']);
    });

    it('drops a leading space part', () => {
      const b = new BlissSVGBuilder('QSP;B313');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });

    it('drops a mid-sequence space part and keeps the parts around it', () => {
      const b = new BlissSVGBuilder('B313;QSP;B81');
      expect(b.toString()).toBe('B313;B81');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });

    it('drops each space part with its own warning in reading order', () => {
      const b = new BlissSVGBuilder('TSP;B313;QSP');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['TSP', 'QSP']);
    });

    it('names the dropped space in the warning message', () => {
      const [warning] = spaceWarnings(new BlissSVGBuilder('B313;QSP'));
      expect(warning.message).toContain('"QSP"');
      expect(warning.message).toContain('dropped');
    });

    it('includes the coordinate suffix in the dropped source', () => {
      const b = new BlissSVGBuilder('B313;QSP:3,4');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP:3,4']);
    });

    it('narrows the canvas when a far-positioned space part is dropped', () => {
      // a coordinate cannot rescue a space part: ZSA is the positionable
      // inkless shape; a positioned space previously widened the viewBox
      const b = new BlissSVGBuilder('B313;QSP:10,0');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP:10,0']);
    });

    it('drops a part option along with its space part', () => {
      // regression: the space-decoration strip targeted only lone space
      // glyphs, so `B313;[color=red]>QSP` kept the option silently
      const b = new BlissSVGBuilder('B313;[color=red]>QSP');
      expect(b.toString()).toBe('B313');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_SPACE']);
    });

    it('restores group navigation over a space-led part list', () => {
      // regression: `QSP;B313` snapshotted as a space group, so `.groups`
      // reported 0 while the word rendered
      const b = new BlissSVGBuilder('QSP;B313');
      expect(b.groups).toHaveLength(1);
      expect(b.stats.groupCount).toBe(1);
    });
  });

  describe('when every part is a space', () => {
    it('drops all space parts and leaves an empty glyph', () => {
      const b = new BlissSVGBuilder('QSP;QSP');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP', 'QSP']);
      expect(b.toJSON().groups[0].glyphs[0].parts).toEqual([]);
      expect(b.toString()).toBe('');
    });
  });

  describe('when the space is a genuine word-level separator', () => {
    it('keeps an implicit space word untouched', () => {
      const b = new BlissSVGBuilder('B291//B313');
      expect(b.toString()).toBe('B291//B313');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps an explicit quarter-space word untouched', () => {
      const b = new BlissSVGBuilder('B291/QSP/B313');
      expect(b.toString()).toBe('B291/QSP/B313');
      expect(b.warnings).toHaveLength(0);
    });
  });

  describe('when the part is inkless content rather than a space', () => {
    it('keeps a ZSA part', () => {
      const b = new BlissSVGBuilder('B313;ZSA');
      expect(b.toString()).toBe('B313;ZSA');
      expect(b.warnings).toHaveLength(0);
    });

    it('keeps a positioned ZSA part', () => {
      const b = new BlissSVGBuilder('B313;ZSA:10');
      expect(b.toString()).toBe('B313;ZSA:10,0');
      expect(b.warnings).toHaveLength(0);
    });

    it('routes the parser-transient SP through the unknown-code path', () => {
      // pins the classifier boundary: the space set is {TSP, QSP}; SP is a
      // parser placeholder, never a space on any classifier
      const b = new BlissSVGBuilder('B313;SP');
      expect(spaceWarnings(b)).toHaveLength(0);
      expect(b.warnings.map((w) => w.code)).toContain('UNKNOWN_CODE');
      expect(b.toString()).toBe('B313;SP');
    });
  });

  describe('when a space part neighbors an indicator', () => {
    it('drops the space first so a trailing indicator survives', () => {
      // pins normalizer ordering: a space is not content, so it is no
      // indicator witness; before this invariant, the QSP convicted B86
      const b = new BlissSVGBuilder('B86;QSP');
      expect(b.toString()).toBe('B86');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B86').svgCode);
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_SPACE']);
    });
  });

  describe('when an unknown code shares the part list', () => {
    it('drops the space and keeps the unknown code', () => {
      const b = new BlissSVGBuilder('B313;ZZ9;QSP');
      expect(b.toString()).toBe('B313;ZZ9');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
      expect(b.warnings.map((w) => w.code)).toContain('UNKNOWN_CODE');
    });

    it('keeps the space when only an unknown code would remain', () => {
      // the uncertainty exemption: with no definition-known part left, the
      // drop is skipped; the character already fail-renders and is warned
      const b = new BlissSVGBuilder('TSP;ZZ9');
      expect(b.toString()).toBe('TSP;ZZ9');
      expect(spaceWarnings(b)).toHaveLength(0);
      expect(b.warnings.map((w) => w.code)).toContain('UNKNOWN_CODE');
    });

    it('keeps the space when only a transient token would remain', () => {
      // regression: review M1 (2026-07-17) — dropping the TSP left a bare
      // sole-survivor SP token that the reparse silently reinterpreted as a
      // real space, breaking parse-equivalence (render diverged, no warning)
      const b = new BlissSVGBuilder('B291/TSP;SP/B313');
      expect(b.toString()).toBe('B291/TSP;SP/B313');
      expect(spaceWarnings(b)).toHaveLength(0);
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });
  });

  describe('when the word is fail-flagged', () => {
    it('drops the whole word, so the space-part pass never reaches it', () => {
      // A fail-flagged word (doubled ;;) is dropped at rebuild (retention family,
      // rows 31/80) before the space-part normalizer runs, so its space part
      // never needs a separate exemption: the whole word is gone.
      const b = new BlissSVGBuilder('B313;QSP;;X;;Y');
      expect(b.toString()).toBe('');
      expect(spaceWarnings(b)).toHaveLength(0);
      expect(b.warnings.map((w) => w.code)).toContain('MALFORMED_WORD_INDICATOR');
    });
  });

  describe('when a glyph definition tries to bake a space part', () => {
    it('rejects the definition at define()', () => {
      // pins the define() reference-type gate: a glyph definition cannot
      // reference a space, so definition anatomy can never contain one and
      // the normalizer's atomic isIndicator skip has no legitimate producer
      const result = BlissSVGBuilder.define({
        SPPARTMIX: { type: 'glyph', isIndicator: true, codeString: 'C8;QSP', width: 2 },
      });
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('space');
      expect(result.errors[0]).toContain('QSP');
    });
  });

  describe('when a definition expands to a space part', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch {}
      }
      customCodes.length = 0;
    });

    it('normalizes a bare-alias expansion that bakes a space part', () => {
      customCodes.push('SPPARTALIAS');
      BlissSVGBuilder.define({ SPPARTALIAS: { codeString: 'B313;QSP' } });
      const b = new BlissSVGBuilder('SPPARTALIAS');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });
  });

  describe('when the mutation API recreates the space-part state', () => {
    it('drops a space appended as a part', () => {
      const b = new BlissSVGBuilder('B313');
      b.glyph(0).addPart('QSP');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });

    it('drops a space inserted before the base', () => {
      const b = new BlissSVGBuilder('B313;B81');
      b.glyph(0).insertPart(0, 'TSP');
      expect(b.toString()).toBe('B313;B81');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['TSP']);
    });

    it('drops a space swapped in by part replacement', () => {
      const b = new BlissSVGBuilder('B313;B81');
      b.part(1).replace('QSP');
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });

    it('normalizes hand-authored object input', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B313' }, { codeName: 'QSP' }] }] }],
      });
      expect(b.toString()).toBe('B313');
      expect(spaceWarnings(b).map((w) => w.source)).toEqual(['QSP']);
    });
  });

  describe('when the normalized result round-trips', () => {
    it('reparses without further warnings and renders identically', () => {
      const b = new BlissSVGBuilder('B313;QSP');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.warnings).toHaveLength(0);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('rebuilds from toJSON without further warnings', () => {
      const b = new BlissSVGBuilder('B313;QSP');
      const rebuilt = new BlissSVGBuilder(b.toJSON());
      expect(rebuilt.warnings).toHaveLength(0);
      expect(rebuilt.svgCode).toBe(b.svgCode);
    });
  });
});
