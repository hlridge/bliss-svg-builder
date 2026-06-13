import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins baseWidth and width-helper getters across all BlissElement levels
 * and both surfaces (snapshot serialization and live element tree),
 * including the delegation contract and defensive level-validation throws.
 *
 * Covers:
 * - baseWidth presence on root/group/glyph/part snapshot nodes (typed as number).
 * - Width-helper math at glyph level (baseGlyphWidth,
 *   rightExtendedGlyphWidth, width, advanceX): indicator-overhang
 *   inclusion, left-overhanging glyph-part inclusion (negative part
 *   offset preserved by a trailing indicator), all-indicator glyph edge
 *   case, non-indicator part contribution, positioned-part outer-edge
 *   measurement, and empty-parts early-return (no NaN/-Infinity contamination).
 * - Width-helper math at group level (baseGroupWidth, baseWidth, width)
 *   when the first glyph carries an explicit base-x offset.
 * - Root-level baseWidth across multiple groups when the first group
 *   carries a non-zero local x offset: subtracts the first group's
 *   offset from the last group's far edge (not adds).
 * - baseWidth delegation by element level (element/group/glyph/part) and
 *   exclusion of root indicator overhang from element baseWidth.
 * - Defensive throws when a level-scoped width helper is called on the
 *   wrong level (rightExtendedGlyphWidth, baseGlyphWidth, baseGroupWidth).
 * - Root-level width on a single bare character (Enclosure full width,
 *   Line zero width).
 * - Root-level width on a character with a default-positioned indicator
 *   (Line + plural-indicator overhang, Enclosure containing the indicator,
 *   custom-definition wrapping, adverb-indicator overhang, multi-glyph
 *   word with overhang in the first glyph).
 * - Root-level width on a character with an explicit indicator position:
 *   left extension, right extension, baseGlyphWidth/width separation,
 *   within-bounds containment, and zero-offset boundary on both Line and
 *   Enclosure bases.
 * - Standalone indicator codes acting as spacing characters (B98/B97).
 * - Element-level baseWidth on a character with an indicator: zero on
 *   zero-width Line bases regardless of indicator position; equals base
 *   character width on Enclosure with default indicator placement.
 * - Structurally empty containers: width helpers return 0 (not NaN) and
 *   construction does not throw on an empty glyphs array, on empty
 *   glyphs between valid words, or on an empty groups array.
 *
 * Does NOT cover:
 * - Indicator centering math and Y-anchor subtraction, see
 *   `BlissElement.indicator-positioning.test.js`.
 * - Snapshot tree shape, immutability, and serialization, see
 *   `BlissElement.snapshots.test.js`.
 * - Element-tree taxonomy and content classification, see
 *   `BlissElement.taxonomy.test.js`.
 * - codeName / char contract, see `BlissElement.codename-contract.test.js`.
 * - Handle-side dimension API, see `ElementHandle.dimensions.test.js`.
 */
describe('BlissElement baseWidth and width helpers', () => {
  describe('when probing baseWidth on snapshot nodes', () => {
    it('exposes baseWidth on the root snapshot node, typed as a number', () => {
      const b = new BlissSVGBuilder('B291');
      const snap = b.snapshot();
      expect(snap).toHaveProperty('baseWidth');
      expect(typeof snap.baseWidth).toBe('number');
    });

    it('exposes baseWidth on a group snapshot node', () => {
      const b = new BlissSVGBuilder('B291');
      const group = b.snapshot().children[0];
      expect(group).toHaveProperty('baseWidth');
    });

    it('exposes baseWidth on a glyph snapshot node', () => {
      const b = new BlissSVGBuilder('B291');
      const glyphs = b.snapshot().children[0].children.filter(c => c.isGlyph);
      expect(glyphs[0]).toHaveProperty('baseWidth');
    });

    it('exposes baseWidth on a part snapshot node', () => {
      const b = new BlissSVGBuilder('B291');
      const glyph = b.snapshot().children[0].children.filter(c => c.isGlyph)[0];
      const part = glyph.children[0];
      expect(part).toHaveProperty('baseWidth');
      expect(typeof part.baseWidth).toBe('number');
      expect(part.baseWidth).toBe(8);
    });
  });

  describe('when probing width helpers at glyph and group levels', () => {
    it('uses every non-indicator part when computing glyph baseWidth', () => {
      const builder = new BlissSVGBuilder('HL2;HL2:10/HL2');
      const glyphs = builder.elements.children[0].children;

      expect(glyphs[0].baseWidth).toBe(12);
      expect(glyphs[1].offsetX).toBe(14);
    });

    it('includes far-right indicator overhang only in total glyph width', () => {
      const element = new BlissElement(BlissParser.parse('B291;B99:7,0'));
      const glyph = element.children[0].children[0];

      expect(glyph.baseGlyphWidth).toBe(8);
      expect(glyph.rightExtendedGlyphWidth).toBe(9);
      expect(glyph.width).toBe(9);
    });

    it('uses all parts when an all-indicator glyph is measured as content', () => {
      const element = new BlissElement(BlissParser.parse('B81'));
      const glyph = element.children[0].children[0];

      expect(glyph.baseGlyphWidth).toBe(2);
      expect(glyph.rightExtendedGlyphWidth).toBe(2);
    });

    it('measures positioned non-indicator parts by their outer edges', () => {
      const element = new BlissElement(BlissParser.parse('HL2;HL2:10'));
      const glyph = element.children[0].children[0];

      expect(glyph.baseGlyphWidth).toBe(12);
      expect(glyph.width).toBe(12);
      expect(glyph.advanceX).toBe(14);
    });

    it('subtracts the first glyph offset from group baseWidth', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            { x: 3, parts: [{ codeName: 'HL2' }] },
            { parts: [{ codeName: 'HL2' }] }
          ]
        }]
      });
      const group = element.children[0];
      const [firstGlyph, secondGlyph] = group.children;

      expect(firstGlyph.baseX).toBe(3);
      expect(secondGlyph.baseX).toBe(7);
      expect(group.baseGroupWidth).toBe(6);
      expect(group.baseWidth).toBe(6);
      expect(group.width).toBe(9);
    });
  });

  describe('when a glyph has no parts', () => {
    it('returns zero from rightExtendedGlyphWidth instead of NaN or -Infinity', () => {
      const element = new BlissElement({ groups: [{ glyphs: [{ parts: [] }] }] });
      const glyph = element.children[0].children[0];

      expect(glyph.rightExtendedGlyphWidth).toBe(0);
    });
  });

  describe('when a glyph part extends left of the origin', () => {
    it('includes the left-overhanging glyph part in baseGlyphWidth and rightExtendedGlyphWidth', () => {
      // The trailing indicator (B81) suppresses character normalization, so the
      // explicit -3 glyph-part offset survives into the width getters. Pins that
      // baseGlyphWidth and rightExtendedGlyphWidth subtract the negative
      // minRelativeX (left overhang) instead of clamping it to 0; killed the
      // Math.min->Math.max and -/+ mutants on both getters (2026-05-21 stryker).
      const glyph = new BlissElement(BlissParser.parse('HL2:-3;HL2:4;B81')).children[0].children[0];

      expect(glyph.baseGlyphWidth).toBe(9);
      expect(glyph.rightExtendedGlyphWidth).toBe(9);
      expect(glyph.width).toBe(9);
      expect(glyph.advanceX).toBe(11);
    });
  });

  describe('when the root has multiple groups and the first group has a non-zero x offset', () => {
    it('returns the last-group end minus the first-group offset', () => {
      const element = new BlissElement({
        groups: [
          { x: 5, glyphs: [{ parts: [{ codeName: 'HL2' }] }] },
          {       glyphs: [{ parts: [{ codeName: 'HL2' }] }] }
        ]
      });
      const firstGroup = element.children[0];
      const lastGroup = element.children[1];

      // HL2 has width 2; second group lands at x=9 (kerning past first group).
      // baseWidth = lastGroup.x + lastGroupBaseWidth - firstGroup.x = 9 + 2 - 5 = 6
      expect(firstGroup.x).toBe(5);
      expect(lastGroup.x).toBe(9);
      expect(element.baseWidth).toBe(6);
    });
  });

  describe('when baseWidth delegation chains across element levels', () => {
    it('delegates baseWidth by level and excludes root indicator overhang', () => {
      const element = new BlissElement(BlissParser.parse('B291;B99:-1'));
      const group = element.children[0];
      const glyph = group.children[0];
      const part = glyph.children[0];

      expect(element.width).toBe(9);
      expect(element.baseWidth).toBe(8);
      expect(group.baseWidth).toBe(group.baseGroupWidth);
      expect(glyph.baseWidth).toBe(glyph.baseGlyphWidth);
      expect(part.baseWidth).toBe(part.width);
    });
  });

  describe('when width helpers are called on the wrong element level', () => {
    it('throws exact errors for glyph-only and group-only width helpers', () => {
      const element = new BlissElement({ groups: [{ glyphs: [{ parts: [{ codeName: 'HL2' }] }] }] });
      const group = element.children[0];
      const glyph = group.children[0];

      expect(() => element.rightExtendedGlyphWidth)
        .toThrow('rightExtendedGlyphWidth can only be called on glyph elements (level 2)');
      expect(() => group.baseGlyphWidth)
        .toThrow('baseGlyphWidth can only be called on glyph elements (level 2)');
      expect(() => glyph.baseGroupWidth)
        .toThrow('baseGroupWidth can only be called on group elements (level 1)');
    });
  });

  const elementOf = (input) => new BlissElement(BlissParser.parse(input));

  describe('when calculating root-level width on a single bare character', () => {
    it('returns the character\'s natural width for Enclosure (B291 → 8)', () => {
      expect(elementOf('B291').width).toBe(8);
    });

    it('returns zero width for Line (B428 → 0)', () => {
      expect(elementOf('B428').width).toBe(0);
    });
  });

  describe('when calculating root-level width on a character with a default-positioned indicator', () => {
    it('includes the plural-indicator overhang past a zero-width Line (B428;B99 → 2)', () => {
      expect(elementOf('B428;B99').width).toBe(2);
    });

    it('keeps the plural indicator within an Enclosure base (B291;B99 → 8)', () => {
      expect(elementOf('B291;B99').width).toBe(8);
    });

    it('keeps the plural indicator within Enclosure when wrapped by a custom definition (BCI99999 = B291;B99 → 8)', () => {
      blissElementDefinitions['BCI99999'] = { codeString: 'B291;B99' };
      try {
        expect(elementOf('BCI99999').width).toBe(8);
      } finally {
        delete blissElementDefinitions['BCI99999'];
      }
    });

    it('adds the adverb-indicator overhang past a zero-width Line (B428;B902 → 4)', () => {
      expect(elementOf('B428;B902').width).toBe(4);
    });

    it('computes baseWidth and width separately for an adverb-indicator-then-Enclosure word (B428;B902/B291 → baseWidth 10, width 12)', () => {
      const element = elementOf('B428;B902/B291');
      expect(element.baseWidth).toBe(10);
      expect(element.width).toBe(12);
    });
  });

  describe('when calculating root-level width on a character with an explicit indicator position', () => {
    it('expands width when the indicator extends left of Enclosure (B291;B99:-1 → 9)', () => {
      expect(elementOf('B291;B99:-1').width).toBe(9);
    });

    it('separates baseGlyphWidth (8) from total width (9) when the indicator extends left of Enclosure', () => {
      const element = elementOf('B291;B99:-1');
      const glyph = element.children[0].children[0];
      expect(glyph.baseGlyphWidth).toBe(8);
      expect(glyph.width).toBe(9);
    });

    it('separates baseGlyphWidth (8) from total width (9) when the indicator extends right of Enclosure (B291;B99:7,0)', () => {
      const element = elementOf('B291;B99:7,0');
      const glyph = element.children[0].children[0];
      expect(glyph.baseGlyphWidth).toBe(8);
      expect(glyph.width).toBe(9);
    });

    it('keeps width within Enclosure bounds when the indicator stays inside (B291;B99:4 → 8)', () => {
      expect(elementOf('B291;B99:4').width).toBe(8);
    });

    it('includes left extension on Line at x=-3 (B428;B99:-3 → 3)', () => {
      expect(elementOf('B428;B99:-3').width).toBe(3);
    });

    it('includes left extension on Line at x=-1 (B428;B99:-1 → 2)', () => {
      expect(elementOf('B428;B99:-1').width).toBe(2);
    });

    it('has no left extension on Line at x=0 (B428;B99:0 → 2)', () => {
      expect(elementOf('B428;B99:0').width).toBe(2);
    });

    it('includes right extension on Line at x=1 (B428;B99:1 → 3)', () => {
      expect(elementOf('B428;B99:1').width).toBe(3);
    });
  });

  describe('when standalone indicators are used as spacing characters', () => {
    it('treats plural-thing/thing indicators alone as normal characters (B98/B97 → baseWidth 9, width 9)', () => {
      const element = elementOf('B98/B97');
      expect(element.baseWidth).toBe(9);
      expect(element.width).toBe(9);
    });
  });

  describe('when calculating element.baseWidth on a character with an indicator', () => {
    it('reports baseWidth=0 for a zero-width Line + default-positioned plural indicator (B428;B99)', () => {
      expect(elementOf('B428;B99').baseWidth).toBe(0);
    });

    it('reports baseWidth=8 for Enclosure + default-positioned plural indicator (B291;B99)', () => {
      expect(elementOf('B291;B99').baseWidth).toBe(8);
    });

    it('reports baseWidth=0 for Line + explicitly left-extended plural indicator (B428;B99:-3)', () => {
      expect(elementOf('B428;B99:-3').baseWidth).toBe(0);
    });
  });

  describe('when the input contains a structurally empty word (no glyphs)', () => {
    const emptyWord = () => new BlissElement({ groups: [{ glyphs: [] }] });

    it('returns 0 for baseGroupWidth on the empty word', () => {
      expect(emptyWord().children[0].baseGroupWidth).toBe(0);
    });

    it('returns 0 for width on the empty word', () => {
      expect(emptyWord().children[0].width).toBe(0);
    });

    it('does not throw on construction', () => {
      expect(() => emptyWord()).not.toThrow();
    });

    it('does not throw when the empty word sits between two valid words', () => {
      expect(() => new BlissElement({
        groups: [
          { glyphs: [{ parts: [{ codeName: 'H' }] }] },
          { glyphs: [] },
          { glyphs: [{ parts: [{ codeName: 'H' }] }] },
        ],
      })).not.toThrow();
    });
  });

  describe('when the input contains no words at all (empty groups array)', () => {
    const emptyElement = () => new BlissElement({ groups: [] });

    it('returns 0 for baseWidth on the empty element', () => {
      expect(emptyElement().baseWidth).toBe(0);
    });

    it('returns 0 for width on the empty element', () => {
      expect(emptyElement().width).toBe(0);
    });
  });
});
