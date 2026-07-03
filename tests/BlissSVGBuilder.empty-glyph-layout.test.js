import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the empty-glyph layout contract: a glyph with no parts (mutation-
 * emptied via part detach, or DSL-authored via an options-only token) is
 * invisible to layout — zero width, zero advance, no character spacing —
 * so the live render always equals the reparse of toString() and the
 * directly-authored equivalent composition.
 *
 * Covers:
 * - Render round-trip (reparse of toString() renders byte-identically) for
 *   an emptied glyph in leading, middle, and trailing position.
 * - Byte-equality with the directly-authored composition (no residual gap
 *   or widened canvas where the emptied glyph sat).
 * - Group extents ignoring a trailing emptied glyph (single-word canvas
 *   width and next-word position in multi-word input).
 * - Kerning pairing across an emptied glyph: digit kerning rules and
 *   external-glyph spacing both apply between the surviving neighbors, and
 *   an emptied glyph that kept external identity metadata does not re-space
 *   its neighbor.
 * - A word whose every glyph empties, in LEADING position (no NaN/-Infinity
 *   leaking into svg).
 * - Indicator-overhang compensation from the first content-bearing character
 *   when the leading glyph is emptied.
 * - The DSL options-only token route (`B313/[color=red]`) taking the same
 *   zero-advance path, keeping its round-trip and toString fixpoint.
 * - Word-level `;;` overlay resolution skipping empty glyphs: the rendered
 *   (and flattened) overlay lands on a content-bearing glyph, an all-empty
 *   word renders nothing while keeping the stored overlay, and the snapshot
 *   head crown agrees.
 *
 * Does NOT cover:
 * - Serialization rules for emptied glyphs (toString omission, designation
 *   deletion), see `BlissSVGBuilder.head-marker-round-trip.test.js`.
 * - A contentless WORD (all-empty or glyphs: []) in trailing or middle
 *   position: its serialized form is eaten by `//` (flanking spaces fuse on
 *   reparse), so the svg round-trip is false there — an open design
 *   question, see the backlog row "Contentless word in trailing/middle
 *   position breaks svg round-trip".
 * - snapshot-level advanceX of an empty glyph, see
 *   `BlissElement.sibling-positioning.test.js`.
 */
describe('BlissSVGBuilder empty-glyph layout', () => {
  // Reparse of the serialized form: the render fidelity oracle throughout.
  const reparse = (b) => new BlissSVGBuilder(b.toString());

  describe('when a mid-word glyph is emptied by part detach', () => {
    it('renders identically to the reparse of toString()', () => {
      const b = new BlissSVGBuilder('B313/B208/B1103');
      b.glyph(1).part(0).detach();

      expect(b.toString()).toBe('B313/B1103');
      expect(reparse(b).svgCode).toBe(b.svgCode);
    });

    it('renders identically to the directly-authored composition', () => {
      const b = new BlissSVGBuilder('B313/B208/B1103');
      b.glyph(1).part(0).detach();

      expect(b.svgCode).toBe(new BlissSVGBuilder('B313/B1103').svgCode);
    });
  });

  describe('when the leading glyph is emptied', () => {
    it('starts the surviving glyph at the word origin', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.glyph(0).part(0).detach();

      expect(b.toString()).toBe('B1103');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B1103').svgCode);
    });

    it('compensates indicator overhang from the first content-bearing character', () => {
      // pins the first-character scan skipping empty glyphs: B98 overhangs
      // B19 to the left, and without the compensation its ink is clipped
      // (adversarial review F4)
      const b = new BlissSVGBuilder('B313/B19;B98');
      b.glyph(0).part(0).detach();

      expect(b.toString()).toBe('B19;B98');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B19;B98').svgCode);
    });
  });

  describe('when the trailing glyph is emptied', () => {
    // pins the group-extent filters (width, baseGroupWidth): a trailing
    // empty glyph must not widen the canvas by its inherited charSpace slot
    it('does not widen the canvas past the surviving glyph', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.glyph(1).part(0).detach();

      expect(b.toString()).toBe('B313');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
    });

    it('does not shift the following word in a multi-word composition', () => {
      const b = new BlissSVGBuilder('B313/B208//B291');
      b.group(0).glyph(1).part(0).detach();

      expect(b.toString()).toBe('B313//B291');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B313//B291').svgCode);
    });
  });

  describe('when kerned glyphs surround the emptied glyph', () => {
    // pins the sibling-chain skip: layout pairs the surviving neighbors, so
    // kerning rules between them apply exactly as in the reparse
    it('applies digit kerning between the surviving digits', () => {
      const b = new BlissSVGBuilder('X1/B208/X7');
      b.glyph(1).part(0).detach();

      expect(b.toString()).toBe('X1/X7');
      expect(b.svgCode).toBe(new BlissSVGBuilder('X1/X7').svgCode);
    });

    it('applies external-glyph spacing between the surviving text glyphs', () => {
      const b = new BlissSVGBuilder('XA/B208/XV');
      b.glyph(1).part(0).detach();

      expect(b.toString()).toBe('XA/XV');
      expect(b.svgCode).toBe(new BlissSVGBuilder('XA/XV').svgCode);
    });

    it('does not re-space the survivors when the emptied glyph kept external identity', () => {
      // detach clears the code but keeps isExternalGlyph/char metadata; the
      // emptied glyph must not apply external-pair spacing to its neighbor
      // (adversarial review F1)
      const b = new BlissSVGBuilder('XA/XV/B291');
      b.glyph(1).part(0).detach();

      expect(b.toString()).toBe('XA/B291');
      expect(b.svgCode).toBe(new BlissSVGBuilder('XA/B291').svgCode);
    });
  });

  describe('when every glyph in a word is emptied', () => {
    it('renders identically to the reparse of toString()', () => {
      const b = new BlissSVGBuilder('B313/B208//B291');
      b.group(0).glyph(0).part(0).detach();
      b.group(0).glyph(1).part(0).detach();

      expect(reparse(b).svgCode).toBe(b.svgCode);
      expect(b.svgCode).not.toMatch(/NaN|Infinity/);
      // pins the snapshot all-empty guard: a word of only empty glyphs has
      // no head crown (and snapshotting it does not throw)
      expect(b.snapshot().children[0].children.some(g => g.isHeadGlyph)).toBe(false);
    });
  });

  describe('when the snapshot resolves the word head', () => {
    it('crowns a content-bearing glyph, never the emptied one', () => {
      // pins the snapshot fallback skipping empty glyphs, matching the
      // overlay resolver and the reparse (adversarial review F6)
      const b = new BlissSVGBuilder('B313/B1103');
      b.glyph(0).part(0).detach();
      const glyphs = b.snapshot().children[0].children;

      expect(glyphs[0].isHeadGlyph).toBe(false);
      expect(glyphs[1].isHeadGlyph).toBe(true);
    });
  });

  describe('when a word-level ;; overlay accompanies an emptied glyph', () => {
    it('resolves the rendered overlay onto a content-bearing glyph', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.glyph(0).part(0).detach();

      expect(b.toString()).toBe('B1103;;B81');
      expect(reparse(b).svgCode).toBe(b.svgCode);
    });

    it('bakes the flattened overlay onto the content-bearing glyph', () => {
      const b = new BlissSVGBuilder('B313/B1103;;B81');
      b.glyph(0).part(0).detach();
      const flat = b.toJSON({ flattenIndicators: true });

      expect(flat.groups[0].glyphs[0].parts).toEqual([]);
      expect(flat.groups[0].glyphs[1].parts.length).toBeGreaterThan(1);
    });

    it('renders nothing when every glyph is empty, keeping the stored overlay', () => {
      // The overlay persists as pure state (it re-applies if content
      // returns via addGlyph) but nothing can carry it at render, exactly
      // like the reparse of the serialized form.
      const b = new BlissSVGBuilder('B313;;B81');
      b.glyph(0).part(0).detach();

      expect(reparse(b).svgCode).toBe(b.svgCode);
      expect(b.toJSON().groups[0].wordIndicators).toEqual({ codes: ['B81'], stripSemantic: false });
    });
  });

  describe('when the DSL authors an empty glyph via an options-only token', () => {
    // `B313/[color=red]` parses to an empty-parts glyph carrying options;
    // it takes the same zero-advance path as a mutation-emptied glyph.
    it('contributes no advance to the rendered composition', () => {
      const b = new BlissSVGBuilder('B313/[color=red]');

      expect(b.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
    });

    it('keeps its render round-trip and toString fixpoint', () => {
      const b = new BlissSVGBuilder('B313/[color=red]');

      expect(b.toString()).toBe('B313/[color=red]');
      expect(reparse(b).svgCode).toBe(b.svgCode);
      expect(reparse(b).toString()).toBe(b.toString());
    });
  });
});
