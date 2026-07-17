import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the space invariant across structural mutation and object input: a
 * space glyph never carries a head designation and an all-space word never
 * carries a `;;` overlay — state the space serialization (`//`) would eat,
 * making toString diverge from toJSON and the reparse lose it (round-3
 * external review F1). The invariant is enforced once, at rebuild, so every
 * mutation route (replaceGlyph, removeGlyph, replacePart, detach,
 * addGlyph-on-empty) and the object constructor normalize identically: the
 * overlay is dropped LOUDLY (`DROPPED_WORD_INDICATOR`, matching
 * mergeWithNext), the designation silently (matching splitAt/mergeWithNext's
 * structural `^` drops).
 *
 * Covers:
 * - Every reported became-space mutation route drops the overlay with one
 *   DROPPED_WORD_INDICATOR warning; toString/toJSON agree and the string
 *   svg-round-trips.
 * - The detach route (unreported sibling) behaves the same.
 * - Object input with an overlay on a space group drops + warns (parity with
 *   the mutation routes).
 * - A designation on a became-space glyph is deleted silently, in an all-space
 *   group and inside a mixed word alike.
 * - Canonicalization (round-4 review F1, user decision 2026-07-03): an in-word
 *   bare space glyph always splits out into a real space group at rebuild
 *   (silent; first word run keeps the group node, overlay, and options —
 *   options are copied to later word runs, splitAt parity; later runs keep
 *   their own designations). Covers the DSL-authorable `B313/TSP;;B81` form
 *   too, and adjacent space groups merge so the structure matches its own
 *   reparse.
 * - No over-reach: a word that stays a word keeps its overlay; a designation
 *   on a non-space glyph survives a sibling turning into a space; an EMPTY
 *   group keeps its overlay (the F3 pure-state-op contract); a multi-part
 *   glyph led by a space-code part (the corpus-blessed `ZSA;B291:2` anchor
 *   composition) is never touched (the single-part boundary).
 *
 * Does NOT cover:
 * - The parse-side space gates (`TSP^`, `TSP;;B81`), see
 *   `BlissParser.head-marker-contract.test.js` and
 *   `BlissParser.word-indicator-validation.test.js`.
 * - The applyIndicators/clearIndicators space-group refusal, see
 *   `ElementHandle.indicator-noop-warning.test.js`.
 * - Overlay routing across splitAt/mergeWithNext, see
 *   `ElementHandle.word-indicator-structure.test.js`.
 */

const overlay = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.wordIndicators;

const droppedWarnings = (builder) =>
  builder.warnings.filter(w => w.code === 'DROPPED_WORD_INDICATOR');

const markedFlags = (builder, groupIdx = 0) =>
  builder.toJSON().groups[groupIdx]?.glyphs?.map(g => g.isHeadGlyph === true) ?? [];

describe('BlissSVGBuilder space invariant', () => {
  describe('when a structural mutation turns an overlay word into a space', () => {
    // regression: round-3 external review F1 — the overlay stayed stored on
    // the now-space group, toString emitted bare '//' (svg round-trip drift),
    // and the clearIndicators space guard then refused to remove it.
    // The former removeGlyph/detach routes (removing the last inked glyph of
    // a word that also held a space glyph) are structurally EXTINCT under
    // canonicalization: a word can no longer contain a space glyph to be
    // reduced to, so only whole-glyph/part replacement and addGlyph onto an
    // emptied word can produce an all-space word.
    it.each([
      ['replaceGlyph', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.group(0).replaceGlyph(0, 'TSP');
        return b;
      }],
      ['replacePart', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.glyph(0).replacePart(0, 'TSP');
        return b;
      }],
      ['addGlyph onto an emptied word', () => {
        const b = new BlissSVGBuilder('B313;;B81');
        b.glyph(0).detach();
        b.group(0).addGlyph('TSP');
        return b;
      }],
    ])('%s drops the overlay with one DROPPED_WORD_INDICATOR warning', (_name, mutate) => {
      const b = mutate();
      expect(overlay(b)).toBeUndefined();
      const w = droppedWarnings(b);
      expect(w).toHaveLength(1);
      expect(w[0].source).toBe(';;B81');
      expect(b.toString()).toBe('//');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('warns once, not again on later rebuilds', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.group(0).replaceGlyph(0, 'TSP');
      b.element(0).setOptions({ color: 'red' });
      expect(droppedWarnings(b)).toHaveLength(1);
    });
  });

  describe('when object input carries an overlay on a space group', () => {
    it('drops the overlay with a DROPPED_WORD_INDICATOR warning (surface parity)', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'TSP' }] }], wordIndicators: { codes: ['B81'], stripSemantic: false } }],
      });
      expect(overlay(b)).toBeUndefined();
      expect(droppedWarnings(b)).toHaveLength(1);
      expect(b.toString()).toBe('//');
    });
  });

  describe('when a marked glyph becomes a space', () => {
    // The designation is deleted silently, matching the structural `^` drops
    // in splitAt/mergeWithNext (a space can never head a word), so toString
    // and toJSON agree instead of storing a marker '//' cannot re-emit.
    it('deletes the designation in an all-space word', () => {
      const b = new BlissSVGBuilder('B313^');
      b.glyph(0).replacePart(0, 'TSP');
      expect(markedFlags(b)).toEqual([false]);
      expect(b.toString()).toBe('//');
    });

    it('deletes the designation on a became-space glyph, which then splits out', () => {
      const b = new BlissSVGBuilder('B313^/B1103');
      b.glyph(0).replacePart(0, 'TSP');
      expect(b.toJSON().groups.flatMap(g => g.glyphs ?? []).some(g => g.isHeadGlyph === true)).toBe(false);
      expect(b.toString()).toBe('//B1103');
    });
  });

  describe('when the mutation keeps a real word', () => {
    it('keeps the overlay when a glyph is replaced with a non-space glyph', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.group(0).replaceGlyph(0, 'B1103');
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
    });

    it('keeps the overlay on a mixed word when one glyph becomes a space', () => {
      // one inked glyph is enough to carry the word; the space glyph itself
      // canonicalizes into a trailing space group (round-4 review F1).
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.group(0).replaceGlyph(1, 'TSP');
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
      expect(b.toString()).toBe('B313;;B81//');
    });

    it('keeps a designation on the non-space glyph when a sibling becomes a space', () => {
      const b = new BlissSVGBuilder('B313^/B1103');
      b.group(0).replaceGlyph(1, 'TSP');
      expect(markedFlags(b)).toEqual([true]);
      expect(b.toString()).toBe('B313^//');
    });

    it('keeps the overlay on an EMPTY word (the F3 pure-state-op contract)', () => {
      const b = new BlissSVGBuilder('B313;;B81');
      b.glyph(0).detach();
      expect(overlay(b)).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(droppedWarnings(b)).toHaveLength(0);
    });
  });

  describe('when a mutation leaves a bare space glyph inside a word', () => {
    // regression: round-4 external review F1 — the DSL cannot express a bare
    // space glyph inside a word (the parser always splits there), so the
    // serialized form re-split into more groups than the live tree held:
    // 'TSP/B1103;;B81' reparsed as TWO groups with a different svg and no
    // warning. Canonicalize at rebuild instead (user decision 2026-07-03):
    // in-word bare space glyphs split out into real space groups, silently
    // (nothing is lost — glyph nodes move, overlay/options stay with the
    // first word run, matching splitAt's first-wins).
    it('splits a leading space out, keeping the overlay on the word', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.glyph(0).replacePart(0, 'TSP');
      expect(b.toJSON().groups).toHaveLength(2);
      expect(b.toJSON().groups[1].wordIndicators).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(b.toString()).toBe('//B1103;;B81');
      expect(b.warnings).toEqual([]);
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toJSON().groups).toHaveLength(2);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('splits a middle space, first word run keeping the overlay (splitAt parity)', () => {
      const b = new BlissSVGBuilder('B313/B1103/B431;;B81');
      b.glyph(1).replacePart(0, 'TSP');
      expect(b.toJSON().groups).toHaveLength(3);
      expect(b.toJSON().groups[0].wordIndicators).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(b.toString()).toBe('B313;;B81//B431');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });

    it('splits an undecorated trailing space into a trailing space group', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.glyph(1).replacePart(0, 'TSP');
      expect(b.toString()).toBe('B313//');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
      expect(JSON.stringify(reparsed.toJSON().groups)).toBe(JSON.stringify(b.toJSON().groups));
    });

    it('keeps a later word run\'s own designation (it round-trips per word)', () => {
      const b = new BlissSVGBuilder('B313/B431^');
      b.group(0).insertGlyph(1, 'TSP');
      expect(b.toString()).toBe('B313//B431^');
      expect(b.toJSON().groups.map(g => g.glyphs.some(x => x.isHeadGlyph === true))).toEqual([false, false, true]);
    });

    it('copies group options onto a later word run (splitAt parity)', () => {
      const b = new BlissSVGBuilder('[color=red]|B313/B431');
      b.group(0).insertGlyph(1, 'TSP');
      const groups = b.toJSON().groups;
      expect(groups).toHaveLength(3);
      expect(groups[0].options).toEqual({ color: 'red' });
      expect(groups[2].options).toEqual({ color: 'red' });
    });

    it('keeps a held group handle usable on the word run that keeps the node', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      const g = b.group(0);
      b.glyph(0).replacePart(0, 'TSP');
      g.addGlyph('B431');
      expect(b.toString()).toBe('//B1103/B431;;B81');
    });
  });

  describe('when the DSL itself authors an in-word space', () => {
    it('canonicalizes the ;;-protected trailing form to word + space group', () => {
      // 'B313/TSP;;B81' used to keep the space INSIDE the word (the ;; suffix
      // protected its token from re-splitting); it renders byte-identically
      // as word + space group, so it now canonicalizes on output
      // (user decision 2026-07-03; serialization-canonicalization direction).
      const b = new BlissSVGBuilder('B313/TSP;;B81');
      expect(b.toJSON().groups).toHaveLength(2);
      expect(b.toJSON().groups[0].wordIndicators).toEqual({ codes: ['B81'], stripSemantic: false });
      expect(b.toString()).toBe('B313;;B81//');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });
  });

  describe('when normalization creates adjacent space groups', () => {
    it('merges them so the structure matches its own reparse', () => {
      // reparse groups consecutive space tokens into ONE space group; two
      // adjacent space groups would silently re-merge on round-trip.
      const b = new BlissSVGBuilder('B313//B431');
      b.group(0).addGlyph('TSP');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toString()).toBe(b.toString());
      expect(reparsed.toJSON().groups).toHaveLength(b.toJSON().groups.length);
      expect(reparsed.svgCode).toBe(b.svgCode);
    });
  });

  describe('when a fail-flagged word contains a bare space glyph', () => {
    it('drops the whole word, so the space-split pass never reaches it', () => {
      // reachable via an alias expanding an in-word space under a malformed ;;.
      // The word is fail-flagged at parse and dropped at rebuild (retention
      // family, rows 31/80), so the bare in-word space never surfaces for the
      // space-split canonicalization: there is nothing left to split.
      BlissSVGBuilder.define({ _SIT_X: { codeString: 'B291/TSP/B313' } });
      try {
        const b = new BlissSVGBuilder('_SIT_X;;B81;;B86');
        expect(b.toJSON().groups).toEqual([]);
        expect(b.toString()).toBe('');
        expect(b.warnings.map(w => w.code)).toEqual(['MALFORMED_WORD_INDICATOR']);
      } finally {
        BlissSVGBuilder.removeDefinition('_SIT_X');
      }
    });
  });

  describe('when a space code is a composed part of a glyph', () => {
    it('never touches a multi-part glyph led by a space-code part', () => {
      // pins the single-part boundary of the space classification with the
      // corpus-blessed ZSA anchor composition (ZSA;B291:2 is a real fixture).
      const b = new BlissSVGBuilder('ZSA;B291:2');
      expect(b.toJSON().groups).toHaveLength(1);
      expect(b.toString()).toBe('ZSA;B291:2,0');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
    });
  });
});
