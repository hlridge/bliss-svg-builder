import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the BlissElement root-construction surface: how the constructor
 * maps an input groups array to root children, and how the root's
 * getSvgContent forwards caller-supplied offsets to the rendered output.
 *
 * Covers:
 * - Multi-group input: each top-level group becomes a separate root child
 *   with an empty codeName (no auto-consolidation), and getSvgContent
 *   concatenates their output with the configured inter-group spacing.
 * - Empty-input edge case: an empty groups array yields no children and
 *   an empty SVG string, with no first-character overhang consultation.
 * - Caller offsets passed to getSvgContent(x, y) propagate directly to
 *   the rendered M coordinates of the first child.
 * - Direct codeName-only root construction: accepts primitive codes
 *   (parsed and direct produce identical SVG); throws on non-primitive
 *   codeNames (shapes with codeString, user-defined character or word
 *   aliases) because non-primitive expansion requires a parser pre-pass.
 *
 * Does NOT cover:
 * - Warning collection during construction (WORD_AS_PART, UNKNOWN_CODE),
 *   see `BlissElement.warning-behavior.test.js`.
 * - Error-placeholder rendering policy for failed characters, see
 *   `BlissElement.error-placeholder.test.js`.
 * - Nested-element construction recursion at level >= 1 and composite
 *   handling, see the composite-handling tests still in
 *   `BlissElement.internal-mechanics.test.js` (slated to move to
 *   `BlissElement.composite-handling.test.js`).
 */
describe('BlissElement constructor mechanics', () => {
  const RAW_LEAF = '_C15_RAW_LEAF';
  let previousDefinition;

  const rawGlyph = () => ({ parts: [{ codeName: RAW_LEAF }] });

  beforeAll(() => {
    previousDefinition = blissElementDefinitions[RAW_LEAF];
    blissElementDefinitions[RAW_LEAF] = {
      getPath: (x, y) => `M${x},${y}h2`,
      width: 2,
      height: 1,
      isShape: true,
    };
  });

  afterAll(() => {
    if (previousDefinition === undefined) {
      delete blissElementDefinitions[RAW_LEAF];
    } else {
      blissElementDefinitions[RAW_LEAF] = previousDefinition;
    }
  });

  describe('when constructing the root from an input groups array', () => {
    test('produces one anonymous child per input group', () => {
      const element = new BlissElement({
        groups: [
          { glyphs: [rawGlyph()] },
          { glyphs: [rawGlyph()] },
        ],
      });

      expect(element.children).toHaveLength(2);
      expect(element.children.every(child => child.codeName === '')).toBe(true);
      expect(element.getSvgContent()).toBe('M0,0h2M4,0h2');
    });

    test('produces no children and an empty SVG for an empty array', () => {
      const element = new BlissElement({ groups: [] });

      expect(element.children).toEqual([]);
      expect(element.getSvgContent()).toBe('');
    });
  });

  describe('when calling getSvgContent with explicit offsets', () => {
    test('forwards the offsets to the rendered SVG', () => {
      const element = new BlissElement({
        groups: [{ glyphs: [rawGlyph()] }],
      });

      expect(element.getSvgContent(10, 20)).toBe('M10,20h2');
    });
  });

  describe('when constructing the root directly from a codeName (no parser pre-pass)', () => {
    const TEST_DEFS = {
      BlissChar: { codeString: 'HL2;HL2:0,2' },
      BlissWord: { codeString: 'BlissChar/BlissChar' },
    };
    const previousDefs = new Map();

    beforeAll(() => {
      Object.entries(TEST_DEFS).forEach(([key, value]) => {
        previousDefs.set(key, blissElementDefinitions[key]);
        blissElementDefinitions[key] = value;
      });
    });

    afterAll(() => {
      previousDefs.forEach((value, key) => {
        if (value === undefined) {
          delete blissElementDefinitions[key];
        } else {
          blissElementDefinitions[key] = value;
        }
      });
    });

    test('accepts a primitive codeName and produces the same SVG path as a parsed equivalent', () => {
      const primitiveCode = 'HL2';
      const expectedPath = 'M0,0h2';

      const renderStructure = BlissParser.parse(primitiveCode);
      const fromParsed = new BlissElement(renderStructure);
      const fromDirect = new BlissElement({ codeName: primitiveCode });

      expect(fromParsed.getSvgContent()).toBe(expectedPath);
      expect(fromDirect.getSvgContent()).toBe(expectedPath);
    });

    test('renders a non-primitive shape (S2) only when supplied via parsed input', () => {
      const nonPrimitiveCode = 'S2';
      const expectedPath = 'M0,0h2M0,2h2M0,0v2M2,0v2';

      const renderStructure = BlissParser.parse(nonPrimitiveCode);
      const fromParsed = new BlissElement(renderStructure);
      expect(fromParsed.getSvgContent()).toBe(expectedPath);
    });

    test('throws on direct construction with any non-primitive codeName (S2 shape, BlissChar alias, BlissWord word-alias)', () => {
      expect(() => new BlissElement({ codeName: 'S2' })).toThrow(/Unable to create Bliss element/i);
      expect(() => new BlissElement({ codeName: 'BlissChar' })).toThrow(/Unable to create Bliss element/i);
      expect(() => new BlissElement({ codeName: 'BlissWord' })).toThrow(/Unable to create Bliss element/i);
    });
  });
});
