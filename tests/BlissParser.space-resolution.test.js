import { describe, it, expect } from 'vitest';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins word-space handling at the parser layer: both the upstream
 * extraction of `shrinksPrecedingWordSpace` from glyph definitions and
 * the downstream resolution of implicit spaces at word boundaries
 * (`//`). The inserted space is QSP only when the next group is
 * non-empty AND every glyph in it shrinks the preceding word space;
 * otherwise the default is TSP.
 *
 * Covers:
 * - `shrinksPrecedingWordSpace` extracted to `true` on punctuation
 *   definitions (B4 period, B5 comma, B1 question mark) and left
 *   undefined on regular characters (H).
 * - The flag is extracted per-glyph through a multi-glyph word
 *   (B4/B5, H/B4).
 * - Next group contains a punctuation glyph (B4 comma): resolves to QSP.
 * - Next group mixes punctuation and regular glyphs (B1 + H): resolves
 *   to TSP, not QSP. Pins the `every` (not `some`) semantics of the
 *   punctuation detection.
 * - Next group contains a regular glyph (B313): resolves to TSP.
 * - Next group is empty (options-only group): resolves to TSP. This is a
 *   regression guard; `[].every(...) === true` would otherwise
 *   misclassify the empty case as punctuation (fixed 2026-05-03 during
 *   the parser audit).
 * - Previous group is empty (options-only group, no glyphs) and is
 *   followed by a `//`-separated regular group: the inserted space still
 *   resolves to TSP.
 * - A single `//` between two regular words inserts exactly one space
 *   group containing one TSP.
 * - Consecutive implicit spaces (`///`, `////`, ...) collapse into a
 *   single space group containing one TSP per implicit space.
 *
 * Does NOT cover:
 * - The rendered SVG width difference between TSP and QSP, see
 *   `BlissSVGBuilder.spacing.test.js`.
 * - Explicit space markers (TSP, QSP, FSP literals in the DSL), which
 *   bypass the implicit-space-resolution path entirely.
 * - Other property extraction surfaces on the glyph (anchorOffsetY,
 *   isIndicator, isExternalGlyph, kerningRules); module-home in
 *   `tests/BlissParser.internal-mechanics.test.js` retains those.
 */
describe('BlissParser space resolution', () => {
  describe('when the parser extracts shrinksPrecedingWordSpace from a glyph definition', () => {
    it('extracts shrinksPrecedingWordSpace on a period glyph (B4)', () => {
      const result = BlissParser.parse('B4');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBe(true);
    });

    it('extracts shrinksPrecedingWordSpace on a comma glyph (B5)', () => {
      const result = BlissParser.parse('B5');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBe(true);
    });

    it('extracts shrinksPrecedingWordSpace on a question-mark glyph (B1)', () => {
      const result = BlissParser.parse('B1');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBe(true);
    });

    it('leaves shrinksPrecedingWordSpace unset on a regular glyph (H)', () => {
      const result = BlissParser.parse('H');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBeUndefined();
    });
  });

  describe('when the parser propagates shrinksPrecedingWordSpace through a multi-glyph word', () => {
    it('extracts shrinksPrecedingWordSpace for every glyph in an all-punctuation word', () => {
      const result = BlissParser.parse('B4/B5');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBe(true);
      expect(result.groups[0].glyphs[1].shrinksPrecedingWordSpace).toBe(true);
    });

    it('extracts shrinksPrecedingWordSpace per-glyph when a word mixes a regular glyph and a punctuation glyph', () => {
      const result = BlissParser.parse('H/B4');

      expect(result.groups[0].glyphs[0].shrinksPrecedingWordSpace).toBeUndefined();
      expect(result.groups[0].glyphs[1].shrinksPrecedingWordSpace).toBe(true);
    });
  });

  describe('when the next group contains a punctuation glyph', () => {
    it('resolves the implicit space to QSP', () => {
      const r = BlissParser.parse('B313//B4');
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('QSP');
    });
  });

  describe('when the next group mixes punctuation and regular glyphs', () => {
    it('resolves the implicit space to TSP', () => {
      // kills 2513 (every → some). H//B1/H: next group after the SP has
      // [B1 (shrinks), H (does not)]. Original's `every` returns false →
      // TSP. Mutant's `some` returns true → QSP.
      const r = BlissParser.parse('H//B1/H');
      const spaceGlyph = r.groups[1].glyphs[0];
      expect(spaceGlyph.parts[0].codeName).toBe('TSP');
    });
  });

  describe('when the next group contains a regular glyph', () => {
    it('resolves the implicit space to TSP', () => {
      const r = BlissParser.parse('B313//B313');
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
    });
  });

  describe('when the next group is empty (options-only)', () => {
    it('resolves the implicit space to TSP, not QSP', () => {
      // Empty glyphs is not punctuation. Before the 2026-05-03 fix,
      // `[].every(...) === true` made the parser choose QSP here.
      const r = BlissParser.parse('B313//[color=red]|');
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
      expect(r.groups[2].glyphs).toHaveLength(0);
    });
  });

  describe('when the previous group is empty (options-only) and the next is a regular word', () => {
    it('resolves the implicit space to TSP and keeps the empty group intact', () => {
      // Symmetric counterpart of the empty-next-group case: an
      // options-only previous group must not affect the TSP/QSP
      // classification of the next group, which is regular.
      const r = BlissParser.parse('[color=red]|//B313');
      expect(r.groups[0].glyphs).toHaveLength(0);
      expect(r.groups[0].options).toEqual({ color: 'red' });
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
      expect(r.groups[2].glyphs[0].parts[0].codeName).toBe('B313');
    });
  });

  describe('when one or more implicit spaces appear between two words', () => {
    it('uses TSP for an implicit space before a regular word', () => {
      const r = BlissParser.parse('H//H');

      expect(r.groups).toHaveLength(3);
      expect(r.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
    });

    it('groups consecutive implicit spaces in one space group', () => {
      const r = BlissParser.parse('H///H');

      expect(r.groups).toHaveLength(3);
      expect(r.groups[1].glyphs.map(g => g.parts[0].codeName))
        .toEqual(['TSP', 'TSP']);
    });
  });
});
