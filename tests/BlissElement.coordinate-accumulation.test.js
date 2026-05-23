import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins coordinate accumulation in the BlissElement hierarchy: x and y supplied
 * at any level cascade and add to the coordinates inherited from ancestors,
 * producing absolute positions at the leaf path.
 *
 * Covers:
 *   - x accumulates across explicit group / glyph / part levels
 *   - y accumulates with the same propagation rules as x
 *   - missing x or y at a level defaults to 0
 *   - deep nesting still accumulates correctly across many layers
 *   - implied-levels input produces the same cascade as explicit-levels input
 *   - direct construction at level 1 makes the topmost coordinates absolute
 *   - the snapshot exposes both local offsetX/offsetY and accumulated x/y
 *   - cascading x / baseX / advanceX through the root, group, character,
 *     base-character, and indicator layers for a Line + plural-indicator
 *     glyph; consistent propagation under explicit indicator x = -1 and
 *     x = 0 (overhang vs no overhang)
 *   - positive x offset on a part survives normalization (only negative
 *     offsets are normalized to zero); character width and word advanceX
 *     extend accordingly
 *   - Zero-Sized Anchor (ZSA) anchors the leftmost position so non-ZSA
 *     parts retain their explicit x offsets instead of being normalized
 *
 * Does NOT cover:
 *   - sibling positioning (kerning, glyph advance, space-group classification),
 *       see tests/BlissElement.sibling-positioning.test.js.
 *   - composite child offset normalization (indicator vs non-indicator);
 *       see tests/BlissElement.composite-handling.test.js.
 *   - indicator centering and Y-anchor subtraction;
 *       see tests/BlissElement.indicator-positioning.test.js.
 */
describe('BlissElement coordinate accumulation', () => {
  const EXAMPLE_CODE = 'HL2';
  const C15_RAW = '_C15_RAW_LEAF';
  const previousRawLeaf = new Map();

  const rawGlyph = () => ({ parts: [{ codeName: C15_RAW }] });

  beforeAll(() => {
    previousRawLeaf.set(C15_RAW, blissElementDefinitions[C15_RAW]);
    blissElementDefinitions[C15_RAW] = {
      getPath: (x, y) => `M${x},${y}h2`,
      width: 2,
      height: 1,
      isShape: true
    };
  });

  afterAll(() => {
    const previous = previousRawLeaf.get(C15_RAW);
    if (previous === undefined) {
      delete blissElementDefinitions[C15_RAW];
    } else {
      blissElementDefinitions[C15_RAW] = previous;
    }
  });

  describe('when coordinates accumulate through nested input levels', () => {
    test('accumulates x from a group level down to a part', () => {
      const element = new BlissElement({
        groups: [{ parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 5 }], x: 3 }]
      });
      expect(element.getSvgContent()).toBe('M8,0h2'); // 3+5 = 8
    });

    test('accumulates x at every level from root to part', () => {
      // Each level adds its x value
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{
              parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 1 }],
              x: 0
            }, {
              parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 2 }],
              x: 2
            }],
            x: 3
          }],
          x: 4
        }],
        x: 5
      });
      expect(element.getSvgContent()).toBe('M13,0h2M16,0h2'); // 5+4+3+0+1, 5+4+3+2+2
    });

    test('treats a missing x at any level as zero', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 8 }]
            // no x at character level
          }]
          // no x at word level
        }]
        // no x at root level
      });
      expect(element.getSvgContent()).toBe('M8,0h2'); // 0+8
    });

    test('accumulates y across nested levels the same way as x', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{
              codeName: EXAMPLE_CODE,
              y: 3
            }],
            y: 2
          }],
          y: 1
        }]
      });
      expect(element.getSvgContent()).toBe('M0,6h2'); // y coordinates: 1+2+3 = 6
    });

    test('accumulates x and y independently across the same levels', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 5, y: 3 }],
            x: 2,
            y: 1
          }]
        }],
        x: 1,
        y: 1
      });
      expect(element.getSvgContent()).toBe('M8,5h2'); // x: 1+2+5; y: 1+1+3
    });

    test('accumulates positions through several layers of nested parts', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{
              parts: [{
                parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 2 }],
                x: 0
              }, {
                parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 2 }],
                x: 2
              }],
              x: 0
            }, {
              parts: [{
                parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 2 }],
                x: 0
              }],
              x: 2
            }],
            x: 2
          }],
          x: 2
        }]
      });
      expect(element.getSvgContent()).toBe('M6,0h2M8,0h2M8,0h2'); // 2+2+2+0+2, 2+2+2+2+2, 2+2+2+2+2
    });

    test('produces the same x cascade whether levels are explicit or implied', () => {
      // Both structures need anchor at x=0 to prevent normalization
      const directX = new BlissElement({
        parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 10 }]
      });
      const nestedX = new BlissElement({
        groups: [{ glyphs: [{ parts: [{ codeName: 'ZSA' }, { codeName: EXAMPLE_CODE, x: 10 }] }] }]
      });

      // Both should produce the same result with anchor at x=0 and element at x=10
      expect(directX.getSvgContent()).toBe('M10,0h2');
      expect(nestedX.getSvgContent()).toBe('M10,0h2');
      expect(directX.getSvgContent()).toBe(nestedX.getSvgContent());
    });
  });

  describe('when the topmost element supplies the parent coordinates for the first child', () => {
    test('treats the topmost coordinates as absolute when constructed at level 1', () => {
      const group = new BlissElement({
        x: 3,
        y: 4,
        glyphs: [rawGlyph()]
      }, { level: 1 });

      expect(group.getSvgContent()).toBe('M3,4h2');
    });

    test('exposes both the local offset and the accumulated coordinate via the snapshot', () => {
      const element = new BlissElement({
        x: 5,
        y: 7,
        groups: [{
          x: 3,
          y: 4,
          glyphs: [rawGlyph()]
        }]
      });
      const group = element.snapshot().children[0];

      expect(group.offsetX).toBe(3);
      expect(group.offsetY).toBe(4);
      expect(group.x).toBe(8);
      expect(group.y).toBe(11);
      expect(element.getSvgContent()).toBe('M8,11h2');
    });
  });

  describe('when reading cascading x / baseX / advanceX through the hierarchy', () => {
    test('B428;B99 (Line + plural indicator) accumulates x, baseX, advanceX, and indicator overhang correctly', () => {
      const element = new BlissElement(BlissParser.parse('B428;B99'));
      const word = element.children[0];
      const character = word.children[0];
      const baseCharacter = character.children[0];
      const indicator = character.children[1];

      expect(element.x).toBe(0);
      expect(element.baseX).toBe(1);
      expect(word.x).toBe(-1);
      expect(word.baseX).toBe(0);
      expect(character.x).toBe(-1);
      expect(character.baseX).toBe(0);
      expect(baseCharacter.x).toBe(0);
      expect(baseCharacter.baseX).toBe(0);
      expect(indicator.x).toBe(-1);
      expect(indicator.baseX).toBe(-1);
    });

    test('B428;B99:-1 propagates baseX and advanceX values consistent with the leftward overhang', () => {
      const element = new BlissElement(BlissParser.parse('B428;B99:-1'));
      expect(element.x).toBe(0);
      expect(element.baseX).toBe(1);
      expect(element.children[0].baseX).toBe(0);
      expect(element.children[0].advanceX).toBe(2); // baseGroupWidth 0 + charSpace 2
      expect(element.children[0].children[0].advanceX).toBe(2); // baseGlyphWidth 0 + charSpace 2
    });

    test('B428;B99:0 zeroes baseX (no left offset) while preserving the advanceX charSpace', () => {
      const element = new BlissElement(BlissParser.parse('B428;B99:0'));
      expect(element.x).toBe(0);
      expect(element.baseX).toBe(0);
      expect(element.children[0].advanceX).toBe(2);
      expect(element.children[0].children[0].advanceX).toBe(2);
    });
  });

  describe('when a positive x offset on a character part is preserved through normalization', () => {
    test('B291:3,3 keeps the positive x offset on the part and extends the character/group width accordingly', () => {
      const element = new BlissElement(BlissParser.parse('B291:3,3'));
      const word = element.children[0];
      const character = word.children[0];
      const part = character.children[0];

      // Normalization only corrects negative x; the +3 offset survives
      expect(part.x).toBe(3);
      expect(part.y).toBe(3);
      expect(part.width).toBe(8);

      // Character width extends from origin out to (3 + 8) = 11
      expect(character.width).toBe(11);

      // Word advanceX adds the inter-character spacing (2)
      expect(word.advanceX).toBe(13);
    });
  });

  describe('when a Zero-Sized Anchor (ZSA) prevents normalization of explicit offsets', () => {
    test('B291;ZSA:10 keeps B291 at x=0 (ZSA anchors the leftmost position)', () => {
      const element = new BlissElement(BlissParser.parse('B291;ZSA:10'));
      const character = element.children[0].children[0];
      const b291Part = character.children[0];
      expect(b291Part.x).toBe(0);
    });

    test('B291;ZSA:10 extends character width from B291 (x=0) to ZSA (x=10)', () => {
      const element = new BlissElement(BlissParser.parse('B291;ZSA:10'));
      const character = element.children[0].children[0];
      expect(character.width).toBe(10);
    });

    test('ZSA;B291:2 prevents normalization, leaving B291 at its explicit x=2', () => {
      const element = new BlissElement(BlissParser.parse('ZSA;B291:2'));
      const character = element.children[0].children[0];
      const b291Part = character.children[1];
      expect(b291Part.x).toBe(2);
    });

    test('ZSA;B291:2 extends character width from ZSA (x=0) to B291 right edge (x=2+8)', () => {
      const element = new BlissElement(BlissParser.parse('ZSA;B291:2'));
      const character = element.children[0].children[0];
      expect(character.width).toBe(10);
    });
  });
});
