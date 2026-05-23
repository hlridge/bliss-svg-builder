import { BlissElement } from '../src/lib/bliss-element.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins how BlissElement.getSvgContent wraps raw leaf-path output in
 * <path> elements when an element's child output mixes raw path data
 * with tagged group output, across every nesting level at which the
 * mix can occur, and how a predefined leaf's extraPathOptions flow
 * into the leaf's getPath function.
 *
 * Covers:
 * - Root level: raw group children mixed with tagged group children.
 * - Group level: raw glyph children mixed with tagged glyph children,
 *   with a fill option on the group wrapping the mix in a <g>.
 * - Glyph level: raw part children mixed with tagged part children,
 *   with a fill option on the glyph wrapping the mix in a <g>.
 * - Composite level: raw sub-part children mixed with tagged sub-part
 *   children, with a fill option on the composite wrapping the mix.
 * - Predefined leaf extraPathOptions passed through to the leaf's
 *   getPath function when no inherited override is present.
 *
 * Does NOT cover:
 * - The <g options> wrapping mechanism itself or option inheritance
 *   across levels, see `BlissSVGBuilder.hierarchical-options.test.js`.
 * - getPath callable-ness validation (predefined-element invariant), see
 *   `BlissElement.internal-mechanics.test.js`.
 * - Coordinate accumulation through nested levels, see
 *   `BlissElement.coordinate-accumulation.test.js`.
 */
describe('BlissElement path wrapping', () => {
  const C15_RAW = '_C15_RAW_LEAF';
  const C15_TAGGED = '_C15_TAGGED_LEAF';
  const C14_RAW = '_C14_RAW_LEAF';
  const C14_TAGGED = '_C14_TAGGED_LEAF';
  const C14_COLOR = '_C14_COLOR_LEAF';
  const definitionKeys = [C15_RAW, C15_TAGGED, C14_RAW, C14_TAGGED, C14_COLOR];
  const previousDefinitions = new Map();

  const rawGlyph = () => ({ parts: [{ codeName: C15_RAW }] });
  const taggedGlyph = () => ({ parts: [{ codeName: C15_TAGGED }] });
  const treeWithParts = (parts) => ({ groups: [{ glyphs: [{ parts }] }] });

  beforeAll(() => {
    for (const key of definitionKeys) {
      previousDefinitions.set(key, blissElementDefinitions[key]);
    }

    blissElementDefinitions[C15_RAW] = {
      getPath: (x, y) => `M${x},${y}h2`,
      width: 2,
      height: 1,
      isShape: true
    };

    blissElementDefinitions[C15_TAGGED] = {
      getPath: (x, y) => `<g data-c15="tagged"><path d="M${x},${y}h1"/></g>`,
      width: 1,
      height: 1,
      isShape: true
    };

    blissElementDefinitions[C14_RAW] = {
      getPath: (x, y) => `M${x},${y}h2`,
      width: 2,
      height: 1,
      isShape: true
    };

    blissElementDefinitions[C14_TAGGED] = {
      getPath: (x, y) => `<g data-leaf="tagged"><path d="M${x},${y}h1"/></g>`,
      width: 1,
      height: 1,
      isShape: true
    };

    blissElementDefinitions[C14_COLOR] = {
      getPath: (x, y, options) => options.color === 'red' ? `M${x},${y}h7` : `M${x},${y}h1`,
      width: 7,
      height: 1,
      isShape: true,
      extraPathOptions: { color: 'red' }
    };
  });

  afterAll(() => {
    for (const key of definitionKeys) {
      const previous = previousDefinitions.get(key);
      if (previous === undefined) {
        delete blissElementDefinitions[key];
      } else {
        blissElementDefinitions[key] = previous;
      }
    }
  });

  describe('when an element\'s children mix raw and tagged content', () => {
    test('wraps each raw child group of the root in a <path> element', () => {
      const element = new BlissElement({
        groups: [
          { glyphs: [rawGlyph()] },
          { glyphs: [taggedGlyph()] }
        ]
      });

      expect(element.getSvgContent())
        .toBe('<path d="M0,0h2"/><g data-c15="tagged"><path d="M4,0h1"/></g>');
    });

    test('wraps each raw child glyph of a group in a <path> element', () => {
      const element = new BlissElement({
        groups: [{
          options: { fill: 'red' },
          glyphs: [rawGlyph(), taggedGlyph()]
        }]
      });

      expect(element.children[0].getSvgContent())
        .toBe('<g fill="red"><path d="M0,0h2"/><g data-c15="tagged"><path d="M4,0h1"/></g></g>');
    });

    test('wraps each raw child part of a glyph in a <path> element', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            options: { fill: 'blue' },
            parts: [
              { codeName: C15_RAW },
              { codeName: C15_TAGGED, x: 3 }
            ]
          }]
        }]
      });

      expect(element.children[0].children[0].getSvgContent())
        .toBe('<g fill="blue"><path d="M0,0h2"/><g data-c15="tagged"><path d="M3,0h1"/></g></g>');
    });

    test('wraps each raw child sub-part of a composite in a <path> element', () => {
      const element = new BlissElement(treeWithParts([{
        parts: [
          { codeName: C14_TAGGED },
          { codeName: C14_RAW, x: 3 }
        ],
        options: { fill: 'red' }
      }]));

      expect(element.getSvgContent())
        .toBe('<g fill="red"><g data-leaf="tagged"><path d="M0,0h1"/></g><path d="M3,0h2"/></g>');
    });
  });

  describe('when a predefined leaf carries extraPathOptions', () => {
    test('passes the extra options through to the leaf getPath function', () => {
      const element = new BlissElement(treeWithParts([{ codeName: C14_COLOR }]));

      expect(element.getSvgContent()).toBe('M0,0h7');
      // pins path option inheritance; killed line 1068 forced-spread mutant in 2026-05 Stryker run.
    });
  });
});
