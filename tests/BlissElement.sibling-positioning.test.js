import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins how BlissElement positions sibling elements within their parent:
 * the basic position math at each structural level (parts, characters,
 * word groups), the per-glyph and per-group advance computation that
 * determines where the next sibling lands, and the kerning rules that
 * adjust that advance between adjacent glyphs.
 *
 * Covers:
 *   - parts stack at their own coordinates with no automatic spacing
 *   - adjacent characters are separated by the default character spacing
 *   - word groups without explicit space glyphs are separated by character
 *       spacing only (parser-built TSP groups, which give full word spacing,
 *       are not exercised here)
 *   - group advance accounts for explicit x offsets, space-group classification,
 *       and the regular-group fallback when any glyph is not a space glyph
 *   - glyph advance accounts for explicit x offsets, empty-parts edge cases,
 *       and the standard width-plus-character-spacing computation
 *   - external-glyph kerning derived from adjacent character identities
 *       adjusts the advance between two external glyphs
 *   - custom non-external kerning rules apply between non-external glyphs and
 *       are ignored when either side of the pair is external
 *
 * Does NOT cover:
 *   - coordinate accumulation through nested levels, see
 *       tests/BlissElement.coordinate-accumulation.test.js.
 *   - composite child offset normalization, see
 *       tests/BlissElement.composite-handling.test.js.
 *   - indicator centering and Y-anchor subtraction, see
 *       tests/BlissElement.indicator-positioning.test.js.
 */
describe('BlissElement sibling positioning', () => {
  const EXAMPLE_CODE = 'HL2';
  const C15_RAW = '_C15_RAW_LEAF';
  const previousRawLeaf = new Map();

  const rawGlyph = (options = {}) => ({
    ...options,
    parts: [{ codeName: C15_RAW }]
  });

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

  describe('when siblings are positioned at the parts, character, and word levels', () => {
    test('places parts at their own coordinates without inserting any automatic spacing', () => {
      const element = new BlissElement({
        parts: [
          {codeName: EXAMPLE_CODE},
          {codeName: EXAMPLE_CODE, x: 1, y: 2}
        ]
      });
      expect(element.getSvgContent()).toBe('M0,0h2M1,2h2');
    });

    test('adds the parent x to each part position', () => {
      const element = new BlissElement({
        parts: [
          {codeName: EXAMPLE_CODE},
          {codeName: EXAMPLE_CODE, x: 1, y: 2}
        ],
        x: 5
      });
      expect(element.getSvgContent()).toBe('M5,0h2M6,2h2'); // part 1: 5+0,0+0, part 2: 5+1,0+2
    });

    test('separates adjacent characters by the default character spacing', () => {
      const element = new BlissElement({
        glyphs: [
          {parts: [{codeName: EXAMPLE_CODE}]},
          {parts: [{codeName: EXAMPLE_CODE}]}
        ]
      });
      expect(element.getSvgContent()).toBe('M0,0h2M4,0h2'); // 2 units character width + 2 units character spacing
    });

    test("applies the same character spacing when each character's parts are implied", () => {
      const element = new BlissElement({
        glyphs: [
          // Parts implied
          {codeName: EXAMPLE_CODE},
          {codeName: EXAMPLE_CODE}
        ]
      });
      expect(element.getSvgContent()).toBe('M0,0h2M4,0h2');
    });

    test("preserves each character's y while applying horizontal character spacing", () => {
      const element = new BlissElement({
        glyphs: [
          // Parts implied
          {codeName: EXAMPLE_CODE, y: 1},
          {codeName: EXAMPLE_CODE, y: 2}
        ]
      });
      expect(element.getSvgContent()).toBe('M0,1h2M4,2h2');
    });

    test('separates word groups by character spacing when no space glyphs are present', () => {
      // Raw structures without space groups only get charSpace (2) between words.
      // Full wordSpace (8) requires explicit TSP space groups (created by parser).
      const element = new BlissElement({
        groups: [
          // Characters and parts implied
          {codeName: EXAMPLE_CODE},
          {codeName: EXAMPLE_CODE}
        ]
      });
      // word1: width=2, advanceX = 2 + charSpace(2) = 4
      // word2: at x=4
      expect(element.getSvgContent()).toBe('M0,0h2M4,0h2');
    });

    test("preserves each word group's y while applying horizontal spacing", () => {
      const element = new BlissElement({
        groups: [
          // Characters and parts implied
          {codeName: EXAMPLE_CODE, y: 1},
          {codeName: EXAMPLE_CODE, y: 3}
        ]
      });
      expect(element.getSvgContent()).toBe('M0,1h2M4,3h2');
    });
  });

  describe('when computing the advance from one glyph or group to the next', () => {
    test("adds the previous group's width to a caller-specified group x offset", () => {
      const element = new BlissElement({
        groups: [
          { glyphs: [rawGlyph()] },
          { x: 3, glyphs: [rawGlyph()] }
        ]
      });
      const [, secondGroup] = element.snapshot().children;

      expect(secondGroup.offsetX).toBe(5);
      expect(element.getSvgContent()).toBe('M0,0h2M5,0h2');
    });

    test('falls back to regular-group advance when not every glyph in a group is a space glyph', () => {
      const element = new BlissElement({
        groups: [
          {
            glyphs: [
              { parts: [{ codeName: 'TSP' }] },
              { parts: [{ codeName: 'HL2' }] }
            ]
          },
          { glyphs: [rawGlyph()] }
        ]
      });
      const [mixedGroup, followingGroup] = element.snapshot().children;

      expect(mixedGroup.isSpaceGroup).toBe(false);
      expect(mixedGroup.advanceX).toBe(10);
      expect(followingGroup.offsetX).toBe(10);
    });

    test('advances a glyph with no parts by the character spacing alone', () => {
      const element = new BlissElement({
        groups: [
          { glyphs: [{ parts: [] }, rawGlyph()] }
        ]
      });
      const [emptyGlyph, followingGlyph] = element.snapshot().children[0].children;

      expect(emptyGlyph.children).toEqual([]);
      expect(emptyGlyph.advanceX).toBe(2);
      expect(followingGlyph.offsetX).toBe(2);
    });

    test('advances a non-space glyph by its width plus the character spacing', () => {
      const element = new BlissElement({
        groups: [{ glyphs: [rawGlyph()] }]
      });
      const glyph = element.snapshot().children[0].children[0];

      expect(glyph.width).toBe(2);
      expect(glyph.advanceX).toBe(4);
    });

    test("adds the previous glyph's width to a caller-specified glyph x offset", () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            rawGlyph(),
            rawGlyph({ x: 3 })
          ]
        }]
      });
      const [, secondGlyph] = element.snapshot().children[0].children;

      expect(secondGlyph.offsetX).toBe(5);
      expect(element.getSvgContent()).toBe('M0,0h2M5,0h2');
    });
  });

  describe('when kerning rules adjust the advance between adjacent glyphs', () => {
    test('applies external-glyph kerning between two adjacent external glyphs', () => {
      const element = new BlissElement(BlissParser.parse('XT/XA'));
      const [firstGlyph, secondGlyph] = element.children[0].children;

      expect(firstGlyph.char).toBe('T');
      expect(secondGlyph.char).toBe('A');
      expect(firstGlyph.advanceX).toBeCloseTo(3.1230337078651687);
      expect(secondGlyph.x).toBeCloseTo(3.1230337078651687);
    });

    test('applies custom kerning rules to reduce the advance before the next glyph', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            {
              glyphCode: '_C15_LEFT',
              kerningRules: { _C15_RIGHT: -1 },
              parts: [{ codeName: 'HL4' }]
            },
            {
              glyphCode: '_C15_RIGHT',
              parts: [{ codeName: 'HL2' }]
            }
          ]
        }]
      });
      const [firstGlyph, secondGlyph] = element.snapshot().children[0].children;

      expect(firstGlyph.advanceX).toBe(5);
      expect(secondGlyph.offsetX).toBe(5);
    });

    test('ignores custom kerning rules when both adjacent glyphs are external', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            {
              glyphCode: '_C15_EXT_LEFT',
              char: 'L',
              isExternalGlyph: true,
              kerningRules: { _C15_EXT_RIGHT: 5 },
              parts: [{ codeName: C15_RAW }]
            },
            {
              glyphCode: '_C15_EXT_RIGHT',
              char: 'R',
              isExternalGlyph: true,
              parts: [{ codeName: C15_RAW }]
            }
          ]
        }]
      });
      const [firstGlyph, secondGlyph] = element.snapshot().children[0].children;

      expect(firstGlyph.advanceX).toBe(2.8);
      expect(secondGlyph.offsetX).toBe(2.8);
    });

    test('ignores custom kerning rules when the previous glyph is external', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            {
              glyphCode: '_C15_EXT_LEFT',
              char: 'L',
              isExternalGlyph: true,
              kerningRules: { _C15_RIGHT: 5 },
              parts: [{ codeName: C15_RAW }]
            },
            {
              glyphCode: '_C15_RIGHT',
              parts: [{ codeName: C15_RAW }]
            }
          ]
        }]
      });
      const [firstGlyph, secondGlyph] = element.snapshot().children[0].children;

      expect(firstGlyph.advanceX).toBe(4);
      expect(secondGlyph.offsetX).toBe(4);
    });
  });
});
