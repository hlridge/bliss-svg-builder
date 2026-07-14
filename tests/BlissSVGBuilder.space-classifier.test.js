import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the space-classifier contract: ZSA is content, not a space. It counts,
 * navigates, and serializes like any other shape across .groups, stats,
 * group(i), and toString (canonical space set = {TSP, QSP}). A stray SP (a
 * parser-internal placeholder only reachable via object input) is content on
 * every surface too. Head / word-indicator eligibility stays broader
 * ({TSP, QSP, ZSA}) to match the frozen parser: a ZSA still cannot be a word's
 * head or carry a ;; overlay, so a mutation that turns a marked word into a ZSA
 * still drops the designation while the ZSA is counted as content.
 *
 * Covers:
 * - .groups.length equals stats.groupCount for ZSA-containing input (the
 *   reported B291//ZSA divergence: was 2 vs 1).
 * - group(i) reaches every content group when a ZSA is present (was null).
 * - toString serializes a standalone ZSA as `ZSA`, not `//`, and round-trips
 *   (parse(toString) preserves the group count and svg; toString is idempotent).
 * - A stray object-input SP is content on the count surfaces (parity).
 * - A real TSP word-space is still excluded (the fix must not turn spaces into
 *   content).
 * - A mutation turning a marked word into a ZSA drops the head (parser parity)
 *   while the ZSA is still counted and serialized as content.
 *
 * Does NOT cover:
 * - ZSA as a composed part (`B291;ZSA:10`, `ZSA;B291:2`), a multi-part glyph
 *   that is never a space node; see `BlissElement.coordinate-accumulation.test.js`
 *   and `BlissSVGBuilder.space-invariant.test.js`.
 * - The parse-side space gates (`ZSA^`, `ZSA;;B81`), see
 *   `BlissParser.head-marker-contract.test.js`.
 * - The element-side space-LED multi-part predicate edge (`{parts:[TSP,B291]}`
 *   snapshots as a space), a deferred frozen-file item (backlog).
 */

describe('BlissSVGBuilder space classifier', () => {
  describe('when a ZSA group is counted', () => {
    it('counts a ZSA as content on both .groups and stats for B291//ZSA', () => {
      const b = new BlissSVGBuilder('B291//ZSA');
      expect(b.groups.length).toBe(2);
      expect(b.stats.groupCount).toBe(2);
      // pins ZSA as content on the raw count surface; distinguishes {TSP,QSP}
      // from the old {TSP,QSP,ZSA,SP} (ZSA-as-space gave groupCount 1).
    });

    it('counts a standalone ZSA as one content group', () => {
      const b = new BlissSVGBuilder('ZSA');
      expect(b.groups.length).toBe(1);
      expect(b.stats.groupCount).toBe(1);
    });

    it('agrees across .groups and stats for a leading ZSA', () => {
      const b = new BlissSVGBuilder('ZSA//B291');
      expect(b.groups.length).toBe(b.stats.groupCount);
      expect(b.stats.groupCount).toBe(2);
    });
  });

  describe('when navigating to a ZSA group', () => {
    it('reaches every content group via group(i) that .groups exposes', () => {
      const b = new BlissSVGBuilder('B291//ZSA');
      // regression: group(1) returned null while .groups[1] existed (raw-side
      // counted ZSA as a space, element-side as content).
      expect(b.groups.length).toBe(2);
      expect(b.group(0)).not.toBeNull();
      expect(b.group(1)).not.toBeNull();
      expect(b.group(2)).toBeNull();
    });
  });

  describe('when a real space is present', () => {
    it('still excludes a TSP word-space from the content count', () => {
      // control: the fix must not turn real spaces into content.
      const b = new BlissSVGBuilder('B291//B313');
      expect(b.groups.length).toBe(2);
      expect(b.stats.groupCount).toBe(2);
    });
  });

  describe('when serializing a ZSA', () => {
    it('serializes a standalone ZSA as its own code', () => {
      expect(new BlissSVGBuilder('ZSA').toString()).toBe('ZSA');
      // pins ZSA leaving the toString space closure; was `//`.
    });

    it('serializes a trailing ZSA word without collapsing it to slashes', () => {
      expect(new BlissSVGBuilder('B291//ZSA').toString()).toBe('B291//ZSA');
      // was `B291///`.
    });

    it('serializes a leading ZSA word', () => {
      expect(new BlissSVGBuilder('ZSA//B291').toString()).toBe('ZSA//B291');
    });
  });

  describe('when round-tripping a ZSA through toString', () => {
    it.each(['ZSA', 'B291//ZSA', 'ZSA//B291', 'B291/ZSA'])(
      'preserves the group count and svg for %s',
      (dsl) => {
        const b = new BlissSVGBuilder(dsl);
        const reparsed = new BlissSVGBuilder(b.toString());
        expect(reparsed.groups.length).toBe(b.groups.length);
        expect(reparsed.stats.groupCount).toBe(b.stats.groupCount);
        expect(reparsed.svgCode).toBe(b.svgCode);
        expect(reparsed.toString()).toBe(b.toString());
      }
    );
  });

  describe('when a stray SP reaches classification via object input', () => {
    it('treats an object-input SP as content on the count surfaces', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'SP' }] }] }] });
      expect(b.groups.length).toBe(b.stats.groupCount);
      expect(b.stats.groupCount).toBe(1);
      // pins SP dropped from the raw space set; distinguishes {TSP,QSP} from
      // {TSP,QSP,ZSA,SP} (SP-as-space gave groupCount 0).
    });
  });

  describe('when a mutation turns a marked word into a ZSA', () => {
    it('drops the head designation but keeps the ZSA as content', () => {
      const b = new BlissSVGBuilder('B313^');
      b.glyph(0).replacePart(0, 'ZSA');
      const marked = b.toJSON().groups
        .flatMap(g => g.glyphs ?? [])
        .some(g => g.isHeadGlyph === true);
      // pins ZSA in the non-head-marker set (parser parity: a ZSA cannot head a
      // word), distinct from the content set that now counts it.
      expect(marked).toBe(false);
      expect(b.toString()).toBe('ZSA');
      expect(b.groups.length).toBe(1);
    });
  });
});
