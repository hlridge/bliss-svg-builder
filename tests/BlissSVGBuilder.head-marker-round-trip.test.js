import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins toString()/toJSON() re-emission of stored head designations under the
 * head-marker contract: exports flatten aliases and ALWAYS re-emit `^` on the
 * designated character, matching toJSON's isHeadGlyph, so a string round-trip
 * never loses the stored designation — even when the automatic head pick
 * would re-derive the same glyph (rc.4 head-marker fidelity; the pre-rc.4
 * rule emitted `^` only when the bare codes would not re-derive the crown).
 * A word with no stored designation stays unmarked (the automatic pick is
 * derived, not stored).
 *
 * Covers:
 * - `^` emission for a redirect-designated head (`B486/(CD^)` exports as
 *   `B486/B313/B208^`).
 * - `^` emission for a direct marker that deviates from the fallback.
 * - `^` re-emission for a REDUNDANT designation (explicit marker on the
 *   fallback pick, definition-baked index-0 designation, single-glyph word),
 *   verbatim round-trip and toString fixpoint.
 * - No `^` for a word with no stored designation (fallback-derived heads).
 * - Dropped word-markers never resurface on export.
 * - Crown stability across parse -> toString -> parse.
 * - toJSON preserving isHeadGlyph on the designated glyph.
 * - A detach that empties a marked glyph deletes its designation too, keeping
 *   toString, toJSON, and the rendered svg in agreement (round-2 review F4);
 *   a partial detach keeps it.
 * - Object input marking a bare empty glyph: the designation dies at rebuild
 *   (no serialized form); an options-carrying empty glyph keeps it (its
 *   `[opts]^` token re-emits).
 * - Per-word emission for multi-word inputs.
 *
 * Does NOT cover:
 * - Resolution semantics themselves (which glyph gets the crown), see
 *   `BlissParser.head-marker-contract.test.js` and
 *   `BlissParser.head-marker-matrix.test.js`.
 * - The full empty-glyph layout contract (zero advance in every position,
 *   kerning across empties, group extents), see
 *   `BlissSVGBuilder.empty-glyph-layout.test.js`.
 * - General toString flattening of aliases, options, and spaces, see
 *   `BlissSVGBuilder.string-output.test.js` and
 *   `BlissSVGBuilder.round-trip.test.js`.
 *
 * @contract: head-marker-contract
 */
describe('BlissSVGBuilder head-marker round-trip', () => {
  const HMR_DEFS = {
    _HMR_CD: { codeString: 'B313/B208' },
    _HMR_CDH: { codeString: 'B313/B208^' },
    _HMR_AH: { codeString: 'B291^/B313' },
  };
  beforeAll(() => BlissSVGBuilder.define(HMR_DEFS));
  afterAll(() => Object.keys(HMR_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

  const markedIndexes = (parsed, groupIndex = 0) =>
    parsed.groups[groupIndex].glyphs.flatMap((g, i) => (g.isHeadGlyph === true ? [i] : []));

  describe('when the resolved head deviates from what bare codes re-derive', () => {
    it('emits ^ on a redirect-designated character', () => {
      const b = new BlissSVGBuilder('B486/_HMR_CDH');

      expect(b.toString()).toBe('B486/B313/B208^');
    });

    it('emits ^ for a direct marker off the fallback pick', () => {
      const b = new BlissSVGBuilder('B101/B208^/B303');

      expect(b.toString()).toBe('B101/B208^/B303');
    });

    it('re-parses its own output to the same crown', () => {
      const exported = new BlissSVGBuilder('B486/_HMR_CDH').toString();
      const reparsed = BlissParser.parse(exported);

      expect(markedIndexes(reparsed)).toEqual([2]);
    });
  });

  describe('when the designation is redundant (the automatic pick re-derives it)', () => {
    // rc.4 head-marker fidelity: a stored designation always re-emits, exactly
    // as toJSON keeps isHeadGlyph — redundancy no longer drops it.
    it('keeps ^ for an explicit marker on the fallback pick', () => {
      const b = new BlissSVGBuilder('B486/B208^');

      expect(b.toString()).toBe('B486/B208^');
    });

    it('keeps ^ for a definition-baked designation the index-0 default re-derives', () => {
      // (A^B) standalone crowns A at index 0; the designation is stored, so it
      // re-emits even though a bare re-parse would default to the same crown.
      const b = new BlissSVGBuilder('_HMR_AH');

      expect(b.toString()).toBe('B291^/B313');
    });

    it('keeps ^ on a redundant index-0 marker, verbatim', () => {
      const b = new BlissSVGBuilder('B313^/B1103');

      expect(b.toString()).toBe('B313^/B1103');
      expect(markedIndexes(BlissParser.parse(b.toString()))).toEqual([0]);
    });

    it('keeps ^ on a single-glyph designation', () => {
      const b = new BlissSVGBuilder('B313^');

      expect(b.toString()).toBe('B313^');
    });

    it('keeps ^ alongside a word-level ;; overlay', () => {
      const b = new BlissSVGBuilder('B313^/B1103;;B81');

      expect(b.toString()).toBe('B313^/B1103;;B81');
    });

    it('reaches a toString fixpoint (the re-emitted marker is stable)', () => {
      const once = new BlissSVGBuilder('B313^/B1103').toString();
      const twice = new BlissSVGBuilder(once).toString();

      expect(twice).toBe(once);
    });
  });

  describe('when the word has no stored designation', () => {
    it('emits no ^ for a fallback-derived head', () => {
      // The automatic pick is derived at query time, never stored, so a word
      // written without ^ stays unmarked on export.
      const b = new BlissSVGBuilder('B486/B208');

      expect(b.toString()).toBe('B486/B208');
    });
  });

  describe('when a word-marker was dropped at parse time', () => {
    it('does not resurrect the dropped marker on export', () => {
      const b = new BlissSVGBuilder('_HMR_CD^');

      expect(b.toString()).toBe('B313/B208');
    });
  });

  describe('when the composition is exported as JSON', () => {
    it('preserves isHeadGlyph on the redirect-designated glyph', () => {
      const json = new BlissSVGBuilder('B486/_HMR_CDH').toJSON();

      expect(json.groups[0].glyphs[2].isHeadGlyph).toBe(true);
      expect(json.groups[0].glyphs.filter(g => g.isHeadGlyph === true)).toHaveLength(1);
    });
  });

  describe('when the input has multiple words', () => {
    it('emits each word\'s marker independently', () => {
      const b = new BlissSVGBuilder('_HMR_CDH//B101/B208^');

      expect(b.toString()).toBe('B313/B208^//B101/B208^');
    });
  });

  describe('when ^ is misplaced on the base before the character indicator', () => {
    // A ^ before the indicator (B291^;B81) is misplaced and dropped with a
    // warning at parse; export omits it (the base and indicator survive, no
    // crown), so the re-parsed output is clean.
    it('drops the misplaced ^ on export (B291^;B81 -> B291;B81)', () => {
      expect(new BlissSVGBuilder('B291^;B81').toString()).toBe('B291;B81');
    });

    it('drops the misplaced ^ in a multi-glyph word (B291/B313^;B81 -> B291/B313;B81)', () => {
      const b = new BlissSVGBuilder('B291/B313^;B81');

      expect(b.toString()).toBe('B291/B313;B81');
      expect(markedIndexes(BlissParser.parse(b.toString()))).toEqual([]);
    });
  });

  describe('when a marked glyph is emptied by part detach', () => {
    // regression: round-2 external review F4 — toJSON kept isHeadGlyph on the
    // emptied glyph while toString dropped both glyph and marker, so the
    // stored designation diverged from its serialization and died on reparse.
    // The designation dies visibly with its glyph's content.
    it('deletes the designation with the glyph content', () => {
      const b = new BlissSVGBuilder('B313^/B1103');
      b.glyph(0).part(0).detach();

      expect(b.toString()).toBe('B1103');
      expect(b.toJSON().groups[0].glyphs.some(g => g.isHeadGlyph === true)).toBe(false);
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toJSON().groups[0].glyphs.some(g => g.isHeadGlyph === true)).toBe(false);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('keeps the designation while the marked glyph still has parts', () => {
      const b = new BlissSVGBuilder('B313;B81^/B1103');
      b.glyph(0).part(1).detach();

      expect(b.toJSON().groups[0].glyphs[0].isHeadGlyph).toBe(true);
      expect(b.toString()).toBe('B313^/B1103');
    });
  });

  describe('when object input marks a glyph that serialization omits', () => {
    // The rebuild-chokepoint mirror of the detach rule above: a designation
    // on a bare empty-parts glyph has no serialized form, so it dies with
    // the glyph's content no matter how the state was authored.
    it('deletes the designation from a bare empty glyph', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [
        { parts: [], isHeadGlyph: true },
        { parts: [{ codeName: 'B1103' }], codeName: 'B1103' },
      ], wordIndicators: { codes: ['B81'], stripSemantic: false } }] });

      expect(b.toJSON().groups[0].glyphs.some(g => g.isHeadGlyph === true)).toBe(false);
      expect(b.toString()).toBe('B1103;;B81');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('keeps the designation on an options-carrying empty glyph', () => {
      // `[color=red]^` re-emits both token and marker, so this designation
      // has a serialized form and survives.
      const b = new BlissSVGBuilder('B313/[color=red]^');

      expect(b.toString()).toBe('B313/[color=red]^');
      expect(b.toJSON().groups[0].glyphs[1].isHeadGlyph).toBe(true);
    });

    it('deletes the designation when the options serialize to nothing', () => {
      // `key` never re-emits from toString, so `[key=k]^` on an empty glyph
      // has no serialized form either — the designation dies and the `;;`
      // overlay resolves onto the content glyph (adversarial review F5).
      const b = new BlissSVGBuilder('B313/[key=k]^;;B81');

      expect(b.toString()).toBe('B313;;B81');
      expect(b.toJSON().groups[0].glyphs.some(g => g.isHeadGlyph === true)).toBe(false);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });
});
