import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins indicator introspection: a part exposes indicatorLevel
 * ('character' | 'word' | null) and indicatorKind ('semantic' |
 * 'grammatical' | null). indicatorLevel distinguishes a character-level
 * indicator (single `;` superimposition, lives in the raw tree) from a
 * word-level overlay indicator (`;;`, resolved onto the head at decode);
 * indicatorKind classifies by the definition's semanticIndicator flag.
 *
 * Surface contract (OQ1): a part HANDLE references a raw node, and a
 * word-level overlay indicator has no raw node, so a handle can only ever
 * surface 'character' or null. The 'word' level is introspected via the
 * resolved snapshot (`builder.snapshot()`), where the overlay part exists.
 *
 * Covers:
 * - Handle getters on a character-level indicator part ('character' +
 *   grammatical/semantic kind) and on a non-indicator base part (null/null).
 * - Both getters null on a non-part (group/glyph) handle.
 * - Snapshot fields on a word-level overlay part ('word' + kind).
 * - OQ1: the word overlay is not reachable via part() but is present and
 *   classified on the snapshot.
 *
 * Does NOT cover:
 * - The overlay mutation API (apply/clearIndicators), see
 *   `ElementHandle.word-indicators.test.js`.
 * - Parser `;;` grammar and overlay render/serialize, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissSVGBuilder.word-indicator-overlay.test.js`.
 */

// Reads the word-overlay indicator part off the resolved snapshot: the head
// glyph's last child (overlay parts are appended strictly after the base).
const wordOverlayPart = (builder, groupIdx = 0) => {
  const group = builder.snapshot().children[groupIdx];
  const glyphs = group.children.filter(c => c.isGlyph);
  const head = glyphs.find(g => g.isHeadGlyph) ?? glyphs[0];
  return head.children[head.children.length - 1];
};

describe('ElementHandle indicator introspection', () => {
  describe('when the part is a character-level grammatical indicator', () => {
    it('reports indicatorLevel character and indicatorKind grammatical', () => {
      const part = new BlissSVGBuilder('B303;B86').part(1);
      expect(part.codeName).toBe('B86');
      expect(part.indicatorLevel).toBe('character');
      expect(part.indicatorKind).toBe('grammatical');
    });
  });

  describe('when the part is a character-level semantic indicator', () => {
    it('reports indicatorKind semantic', () => {
      const part = new BlissSVGBuilder('B303;B97').part(1);
      expect(part.codeName).toBe('B97');
      expect(part.indicatorLevel).toBe('character');
      expect(part.indicatorKind).toBe('semantic');
    });
  });

  describe('when the part is a non-indicator base', () => {
    it('reports null for both getters', () => {
      const part = new BlissSVGBuilder('B303;B86').part(0);
      expect(part.codeName).toBe('B303');
      expect(part.isIndicator).toBe(false);
      expect(part.indicatorLevel).toBeNull();
      expect(part.indicatorKind).toBeNull();
    });
  });

  describe('when the handle is not a part', () => {
    it('reports null on a glyph handle', () => {
      const glyph = new BlissSVGBuilder('B303;B86').group(0).glyph(0);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.indicatorLevel).toBeNull();
      expect(glyph.indicatorKind).toBeNull();
    });

    it('reports null on a group handle', () => {
      const group = new BlissSVGBuilder('B303;B86').group(0);
      expect(group.isGroup).toBe(true);
      expect(group.indicatorLevel).toBeNull();
      expect(group.indicatorKind).toBeNull();
    });
  });

  describe('when the indicator is a word-level overlay', () => {
    it('classifies the overlay part as level word on the snapshot', () => {
      const part = wordOverlayPart(new BlissSVGBuilder('B313/B1103;;B86'));
      expect(part.codeName).toBe('B86');
      expect(part.isIndicator).toBe(true);
      expect(part.indicatorLevel).toBe('word');
      expect(part.indicatorKind).toBe('grammatical');
    });

    it('classifies a semantic word overlay as level word, kind semantic', () => {
      const part = wordOverlayPart(new BlissSVGBuilder('B313/B1103;;B97'));
      expect(part.codeName).toBe('B97');
      expect(part.indicatorLevel).toBe('word');
      expect(part.indicatorKind).toBe('semantic');
    });

    it('is not reachable through a part handle (OQ1)', () => {
      // regression: word overlay parts have no raw node; part() walks raw only.
      const builder = new BlissSVGBuilder('B313/B1103;;B86');
      expect(builder.part(0).indicatorLevel).toBeNull(); // B313 base
      expect(builder.part(1).indicatorLevel).toBeNull(); // B1103 base
      expect(builder.part(2)).toBeNull(); // only two raw parts; no word part
    });

    it('classifies every part of a multi-indicator overlay on the snapshot', () => {
      // helper "last child" alone would miss the first overlay part; classify all.
      const head = new BlissSVGBuilder('B313/B1103;;B86;B97')
        .snapshot().children[0].children.filter(c => c.isGlyph)[0];
      const overlay = head.children.filter(c => c.indicatorLevel === 'word');
      expect(overlay.map(c => c.codeName)).toEqual(['B86', 'B97']);
      expect(overlay.map(c => c.indicatorKind)).toEqual(['grammatical', 'semantic']);
    });

    it('leaves the base part unclassified on the snapshot', () => {
      // pins the snapshot classifier directly (the handle reads the raw node,
      // so a handle test cannot exercise the snapshot's non-indicator branch).
      const head = new BlissSVGBuilder('B313/B1103;;B86')
        .snapshot().children[0].children.filter(c => c.isGlyph)[0];
      const base = head.children[0];
      expect(base.codeName).toBe('B313');
      expect(base.isIndicator).toBe(false);
      expect(base.indicatorLevel).toBeNull();
      expect(base.indicatorKind).toBeNull();
    });
  });

  describe('when the head carries both a character indicator and a word overlay', () => {
    it('reports the handle by its own raw node, never the reordered overlay', () => {
      // regression: the head 'B313;B97;;B81' resolves to [B313, B81(word),
      // B97(word)] (semantic root B97 preserved + reordered), but the raw
      // handle part(1) IS B97 and must read its own classification, not the
      // positionally-mapped snapshot part B81. Reading the raw node honors OQ1
      // (never 'word' on a handle) and keeps identity and introspection aligned.
      const part = new BlissSVGBuilder('B313;B97;;B81').part(1);
      expect(part.codeName).toBe('B97');
      expect(part.indicatorLevel).toBe('character');
      expect(part.indicatorKind).toBe('semantic');
    });
  });

  describe('when the handle is a nested sub-part', () => {
    it('returns null without throwing for a non-indicator sub-part', () => {
      // regression: part().part() yields a level-3 nested handle the snapshot
      // index cannot resolve; the getters must read the raw node, not throw.
      const sub = new BlissSVGBuilder('B303;B86').part(1).part(0);
      expect(sub.codeName).toBe('AA2S');
      expect(sub.isIndicator).toBe(false);
      expect(sub.indicatorLevel).toBeNull();
      expect(sub.indicatorKind).toBeNull();
    });

    it('classifies an indicator sub-part of a composite indicator', () => {
      const sub = new BlissSVGBuilder('B303;B84').part(1).part(0);
      expect(sub.codeName).toBe('B86');
      expect(sub.indicatorLevel).toBe('character');
      expect(sub.indicatorKind).toBe('grammatical');
    });
  });

  describe('when a handle sits on an overlay-reordered head', () => {
    // tripwire (N14): a head carrying BOTH a ';' char indicator and a ';;'
    // overlay reorders its resolved parts (semantic-root preservation), so the
    // positional #findSnapshot mapping returns the WRONG part's geometry/key.
    // The introspection getters dodge this by reading the raw node (above);
    // the measure()/x/y/key fix folds into the N13/R15 coordinate-ownership
    // work. See the plan's "Task 6 review" / N14 entry.
    it.todo("measure() returns the handle's own part geometry, not the reordered overlay part");
  });
});
