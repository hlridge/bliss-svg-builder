import { BlissElement } from '../src/lib/bliss-element.js';

/**
 * BlissElement composite handling
 *
 * Pins how BlissElement assigns level numbers and codeName identity to
 * nested composite parts, and how composite children are positioned:
 * non-indicator composites and indicators below level 3 are normalized
 * to the leftmost child, but level-3 indicators preserve explicit x
 * offsets on their children.
 *
 * Covers:
 * - level numbering increments with each nested composite layer
 * - composite parts surface an empty codeName while their leaf children keep theirs
 * - non-indicator composite children at level 3 are shifted so the leftmost lands at zero
 * - indicator composite children at level 3 keep their explicit x offsets
 * - indicator composite children below level 3 are normalized like non-indicators
 *
 * Does NOT cover:
 * - getPath validation when a predefined leaf lacks a callable getPath (BlissElement.internal-mechanics.test.js)
 * - MAX_RECURSION_DEPTH boundary for composite chains (BlissElement.internal-mechanics.test.js)
 * - raw/tagged wrapping of composite output (BlissElement.path-wrapping.test.js)
 */
describe('BlissElement composite handling', () => {
  const treeWithParts = (parts) => ({
    groups: [{ glyphs: [{ parts }] }]
  });

  describe('when reading composite metadata from the snapshot', () => {
    test('increments the level for each nested composite layer', () => {
      const element = new BlissElement(treeWithParts([{
        parts: [{
          parts: [{ codeName: 'HL2' }]
        }]
      }]));
      const composite = element.snapshot().children[0].children[0].children[0];
      const nestedComposite = composite.children[0];
      const leaf = nestedComposite.children[0];

      expect(composite.level).toBe(3);
      expect(nestedComposite.level).toBe(4);
      expect(leaf.level).toBe(5);
      expect(nestedComposite.isPart).toBe(true);
    });

    test('keeps the composite codeName empty while the leaf keeps its own', () => {
      const element = new BlissElement(treeWithParts([{
        parts: [{ codeName: 'HL2' }]
      }]));
      const composite = element.snapshot().children[0].children[0].children[0];

      expect(composite.codeName).toBe('');
      expect(composite.children[0].codeName).toBe('HL2');
      // pins composite identity; killed line 642 string-literal mutant in 2026-05 Stryker run.
    });
  });

  describe('when composite children carry explicit x offsets', () => {
    test('aligns non-indicator children so the leftmost lands at zero', () => {
      const element = new BlissElement(treeWithParts([{
        parts: [
          { codeName: 'HL2', x: 5 },
          { codeName: 'HL2', x: 7 }
        ]
      }]));
      const composite = element.snapshot().children[0].children[0].children[0];

      expect(composite.children.map(child => child.offsetX)).toEqual([0, 2]);
      expect(element.getSvgContent()).toBe('M0,0h2M2,0h2');
    });

    test('preserves child offsets for indicator composites at level 3', () => {
      const element = new BlissElement(treeWithParts([{
        isIndicator: true,
        parts: [{ codeName: 'HL2', x: 5 }]
      }]));
      const indicator = element.snapshot().children[0].children[0].children[0];

      expect(indicator.isIndicator).toBe(true);
      expect(indicator.children[0].offsetX).toBe(5);
      expect(element.getSvgContent()).toBe('M5,0h2');
    });

    test('normalizes indicator children when the indicator sits below level 3', () => {
      const element = new BlissElement(treeWithParts([{
        parts: [{
          isIndicator: true,
          parts: [
            { codeName: 'HL2', x: 5 },
            { codeName: 'HL2', x: 7 }
          ]
        }]
      }]));
      const outerComposite = element.snapshot().children[0].children[0].children[0];
      const nestedIndicator = outerComposite.children[0];

      expect(nestedIndicator.level).toBe(4);
      expect(nestedIndicator.isIndicator).toBe(true);
      expect(nestedIndicator.children.map(child => child.offsetX)).toEqual([0, 2]);
      expect(element.getSvgContent()).toBe('M0,0h2M2,0h2');
    });
  });
});
