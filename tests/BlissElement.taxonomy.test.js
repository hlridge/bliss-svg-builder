import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the taxonomy-related accessors on `BlissElement` snapshots and
 * trees: the level-derived boolean flags
 * (`isRoot`/`isGroup`/`isGlyph`/`isPart`) at every node, the
 * content-classification flags (`isBlissGlyph`, `isExternalGlyph`,
 * `isShape`, `isIndicator`) at glyph and part level, the part-level
 * `isCharacter` flag coerced from optional definition fields, and the
 * adjacent identity getters (`codeName`, `anchorOffset`, `kerningRules`)
 * that surface alongside taxonomy classification on the same nodes.
 *
 * Covers:
 * - `isRoot`/`isGroup`/`isGlyph`/`isPart` on the root, a group, a
 *   glyph, and a part snapshot node.
 * - `isGlyph` and `isBlissGlyph` for predefined glyphs (`B291`),
 *   inline-composite glyphs (`B291;B86`), and ad-hoc shape primitives
 *   (`H`).
 * - Default getter values (level booleans, content kinds,
 *   `codeName`/`char`, `kerningRules`, default `anchorOffset`) on a
 *   directly-constructed BlissElement tree mixing Bliss (`B291`),
 *   external (`Xa`), shape (`HL2`), and indicator (`B81`) glyph kinds.
 * - `anchorOffset` reading from composite-part `anchorOffsetX` /
 *   `anchorOffsetY` metadata on a directly-constructed BlissElement.
 * - `isCharacter` boolean coercion from predefined leaf definitions
 *   (true when the field is set, false when absent).
 *
 * Does NOT cover:
 * - The handle-side mirror of these flags, see
 *   `ElementHandle.taxonomy.test.js` and
 *   `ElementHandle.parity.test.js`.
 * - The `codeName`/`char` contract for text-fallback glyphs and the
 *   `XTXT_` non-leak invariant, see
 *   `BlissElement.codename-contract.test.js`.
 */
describe('BlissElement snapshot taxonomy', () => {
  describe('when checking level-derived boolean accessors', () => {
    const b = new BlissSVGBuilder('B291;B86');
    const root = b.elements;
    const group = root.children[0];
    const glyph = group.children.find(c => c.level === 2);
    const part = glyph.children[0];

    it('classifies the root snapshot node with isRoot=true', () => {
      expect(root.isRoot).toBe(true);
      expect(root.isGroup).toBe(false);
      expect(root.isGlyph).toBe(false);
      expect(root.isPart).toBe(false);
    });

    it('classifies a group snapshot node with isGroup=true', () => {
      expect(group.isRoot).toBe(false);
      expect(group.isGroup).toBe(true);
      expect(group.isGlyph).toBe(false);
      expect(group.isPart).toBe(false);
    });

    it('classifies a glyph snapshot node with isGlyph=true', () => {
      expect(glyph.isRoot).toBe(false);
      expect(glyph.isGroup).toBe(false);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isPart).toBe(false);
    });

    it('classifies a part snapshot node with isPart=true', () => {
      expect(part.isRoot).toBe(false);
      expect(part.isGroup).toBe(false);
      expect(part.isGlyph).toBe(false);
      expect(part.isPart).toBe(true);
    });
  });

  describe('when classifying glyph-content kinds', () => {
    it('reports isGlyph=true and isBlissGlyph=true for a predefined glyph (B291)', () => {
      const b = new BlissSVGBuilder('B291');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isBlissGlyph).toBe(true);
    });

    it('reports isGlyph=true but isBlissGlyph=false for an inline-composite glyph (B291;B86)', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isBlissGlyph).toBe(false);
    });

    it('reports isGlyph=true but isBlissGlyph=false for an ad-hoc shape primitive (H)', () => {
      const b = new BlissSVGBuilder('H');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isBlissGlyph).toBe(false);
      expect(glyph.isExternalGlyph).toBe(false);
      expect(glyph.codeName).toBe('');
      expect(glyph.children[0].codeName).toBe('H');
    });
  });

  describe('when a BlissElement is built from a tree mixing glyph kinds', () => {
    it('surfaces default getter values for each glyph kind', () => {
      const element = new BlissElement(BlissParser.parse('B291/Xa/HL2/B81'));
      const group = element.children[0];
      const [blissGlyph, externalGlyph, shapeGlyph, indicatorGlyph] = group.children;
      const shapePart = shapeGlyph.children[0];
      const indicatorPart = indicatorGlyph.children[0];

      expect(element.isRoot).toBe(true);
      expect(group.isGroup).toBe(true);
      expect(blissGlyph.isGlyph).toBe(true);
      expect(shapePart.isPart).toBe(true);

      expect(element.isPart).toBe(false);
      expect(group.isRoot).toBe(false);
      expect(group.isPart).toBe(false);
      expect(blissGlyph.isGroup).toBe(false);
      expect(blissGlyph.isPart).toBe(false);
      expect(shapePart.isGlyph).toBe(false);

      expect(blissGlyph.codeName).toBe('B291');
      expect(blissGlyph.isBlissGlyph).toBe(true);
      expect(blissGlyph.isExternalGlyph).toBe(false);
      expect(externalGlyph.codeName).toBe('Xa');
      expect(externalGlyph.char).toBe('a');
      expect(externalGlyph.isExternalGlyph).toBe(true);
      expect(shapeGlyph.codeName).toBe('');
      expect(shapePart.codeName).toBe('HL2');
      expect(shapePart.isShape).toBe(true);
      expect(indicatorGlyph.isIndicator).toBe(true);
      expect(indicatorPart.isIndicator).toBe(true);
      expect(externalGlyph.kerningRules).toEqual({});
      expect(shapePart.anchorOffset).toEqual({ x: 0, y: 0 });
    });
  });

  describe('when a composite part carries anchor-offset metadata', () => {
    it('surfaces the metadata x and y on the anchorOffset getter', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{
              parts: [{ codeName: 'HL2' }],
              anchorOffsetX: 3,
              anchorOffsetY: -2
            }]
          }]
        }]
      });
      const part = element.children[0].children[0].children[0];

      expect(part.anchorOffset).toEqual({ x: 3, y: -2 });
    });
  });

  describe('when a predefined leaf definition carries optional taxonomy flag fields', () => {
    const CHARACTER_LEAF = '_C14_CHARACTER_LEAF';
    const DEFAULT_FLAG_LEAF = '_C14_DEFAULT_FLAG_LEAF';
    let previousCharacter;
    let previousDefault;

    beforeAll(() => {
      previousCharacter = blissElementDefinitions[CHARACTER_LEAF];
      previousDefault = blissElementDefinitions[DEFAULT_FLAG_LEAF];

      blissElementDefinitions[CHARACTER_LEAF] = {
        getPath: (x, y) => `M${x},${y}h4`,
        width: 4,
        height: 5,
        x: 1,
        y: 2,
        isShape: true,
        isCharacter: true
      };

      blissElementDefinitions[DEFAULT_FLAG_LEAF] = {
        getPath: (x, y) => `M${x},${y}h3`,
        width: 3,
        height: 4
      };
    });

    afterAll(() => {
      if (previousCharacter === undefined) delete blissElementDefinitions[CHARACTER_LEAF];
      else blissElementDefinitions[CHARACTER_LEAF] = previousCharacter;
      if (previousDefault === undefined) delete blissElementDefinitions[DEFAULT_FLAG_LEAF];
      else blissElementDefinitions[DEFAULT_FLAG_LEAF] = previousDefault;
    });

    it('coerces an optional isCharacter flag to true when present and false when absent', () => {
      const element = new BlissElement({
        groups: [{ glyphs: [{ parts: [
          { codeName: CHARACTER_LEAF },
          { codeName: DEFAULT_FLAG_LEAF }
        ] }] }]
      });
      const [characterPart, defaultPart] = element.children[0].children[0].children;

      expect(characterPart.isCharacter).toBe(true);
      expect(defaultPart.isCharacter).toBe(false);
    });
  });
});
