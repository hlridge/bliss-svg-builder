import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';
import { MAX_RECURSION_DEPTH } from '../src/lib/bliss-constants.js';

/**
 * Pins internal-mechanics behaviors of BlissElement that fall outside the
 * feature-cross-cutting BlissElement.* sibling files: shared-options
 * warning-collection on duplicate input keys, direct-construction throw vs
 * warning-collection contract, height and position getter mechanics on
 * BlissElement instances, the predefined-element invariant for
 * non-callable getPath, and the MAX_RECURSION_DEPTH boundary.
 *
 * Covers:
 * - Constructor sharedOptions integration: duplicate-key detection appends
 *   a DUPLICATE_KEY warning into the shared options object and registers
 *   the key in the shared keys Set.
 * - Direct-construction throw contract: building a BlissElement directly at
 *   level 3 with an unknown codeName, a caller-supplied error, or empty
 *   input throws an explicit error and bypasses the warning-collection
 *   pipeline.
 * - Height and position getter mechanics on BlissElement instances:
 *   definition-supplied leaf geometry (width/height/baseX/x/y/isCharacter/
 *   isShape); defensive zero-returns on empty input shapes; vertical
 *   y-offset additivity into parent height; root and group y pinned to
 *   zero while descendants expose their local offsets; multi-child
 *   height aggregation reports the largest child y+height (max, not min).
 * - Predefined-element invariant: a definition whose getPath is not a
 *   function throws on construction.
 * - Maximum nesting depth: composite recursion past MAX_RECURSION_DEPTH
 *   throws the documented depth-exceeded error.
 * - Circular definitions (A → B → A) are rejected at define() so the builder
 *   constructs without recursing, for both the single-code (expand) and
 *   composite (parseParts) cycle shapes; legitimate deeply-nested built-in
 *   composites (B291) do not throw.
 * - A deep non-circular custom glyph chain still trips the parser
 *   MAX_RECURSION_DEPTH guard ("Maximum recursion depth exceeded").
 *
 * Does NOT cover:
 * - Snapshot tree shape (level/index/key/parentKey/bounds, immutability),
 *   see `BlissElement.snapshots.test.js`.
 * - Snapshot baseWidth field and width-helper getters, see
 *   `BlissElement.base-width.test.js`.
 * - Snapshot toString and toJSON serialization, see
 *   `BlissElement.serialization.test.js`.
 * - Snapshot codeName / char identity contract and XTXT non-leak, see
 *   `BlissElement.codename-contract.test.js`.
 * - Level booleans and content classification (isBlissGlyph,
 *   isExternalGlyph, isShape), see `BlissElement.taxonomy.test.js`.
 * - Coordinate accumulation through nested input levels, see
 *   `BlissElement.coordinate-accumulation.test.js`.
 * - Sibling positioning, glyph advance, and kerning at the parts,
 *   character, and word levels, see
 *   `BlissElement.sibling-positioning.test.js`.
 * - Indicator centering and Y-anchor subtraction, see
 *   `BlissElement.indicator-positioning.test.js`.
 * - Composite child level numbering and codeName identity, see
 *   `BlissElement.composite-handling.test.js`.
 * - Raw/tagged path wrapping and extraPathOptions propagation, see
 *   `BlissElement.path-wrapping.test.js`.
 * - Root-construction mechanics and getSvgContent caller offsets, see
 *   `BlissElement.constructor-mechanics.test.js`.
 * - Implicit-vs-explicit structure equivalence, see
 *   `BlissElement.flexible-structure.test.js`.
 * - Error-placeholder visibility policy, see
 *   `BlissElement.error-placeholder.test.js`.
 * - UNKNOWN_CODE and WORD_AS_PART warning-collection contract, see
 *   `BlissElement.warning-behavior.test.js`.
 *
 * @contract: element-internal-mechanics
 */
describe('BlissElement', () => {
  const RAW_LEAF = '_C15_RAW_LEAF';
  const OFFSET_LEAF = '_C12_OFFSET_LEAF';
  const BAD_GET_PATH_LEAF = '_C14_BAD_GET_PATH_LEAF';
  const definitionKeys = [RAW_LEAF, OFFSET_LEAF, BAD_GET_PATH_LEAF];
  const previousDefinitions = new Map();

  const sharedOptions = (overrides = {}) => ({
    charSpace: 2,
    wordSpace: 8,
    externalGlyphSpace: 0.8,
    warnings: [],
    ...overrides,
  });

  const rawGlyph = (options = {}) => ({
    ...options,
    parts: [{ codeName: RAW_LEAF }]
  });

  const treeWithParts = (parts) => ({
    groups: [{ glyphs: [{ parts }] }]
  });

  const compositeChain = (depth) => (
    depth === 0
      ? { codeName: 'HL2' }
      : { parts: [compositeChain(depth - 1)] }
  );

  beforeAll(() => {
    for (const key of definitionKeys) {
      previousDefinitions.set(key, blissElementDefinitions[key]);
    }

    blissElementDefinitions[RAW_LEAF] = {
      getPath: (x, y) => `M${x},${y}h2`,
      width: 2,
      height: 1,
      isShape: true
    };

    blissElementDefinitions[OFFSET_LEAF] = {
      getPath: (x, y) => `M${x},${y}h4`,
      width: 4,
      height: 5,
      x: 2,
      y: 3,
      isShape: true,
      isCharacter: true
    };

    blissElementDefinitions[BAD_GET_PATH_LEAF] = {
      getPath: 'not-callable'
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

  describe('when the constructor encounters duplicate keys across input groups', () => {
    test('records a DUPLICATE_KEY warning into the shared options object', () => {
      const shared = sharedOptions({ keys: new Set() });
      new BlissElement({
        groups: [
          { key: 'dup-c15', glyphs: [rawGlyph()] },
          { key: 'dup-c15', glyphs: [rawGlyph()] }
        ]
      }, { sharedOptions: shared });

      expect(shared.warnings).toContainEqual({
        code: 'DUPLICATE_KEY',
        message: 'Duplicate element key: "dup-c15"',
        source: 'dup-c15'
      });
      expect(shared.keys.has('dup-c15')).toBe(true);
    });
  });

  describe('when a part is directly constructed at level 3 with invalid input', () => {
    test('throws an explicit error for unknown, caller-error, and empty inputs', () => {
      expect(() => new BlissElement({ codeName: 'NO_SUCH_CODE' }, { level: 3 }))
        .toThrow('Unable to create Bliss element: NO_SUCH_CODE');
      expect(() => new BlissElement({ error: 'custom failure' }, { level: 3 }))
        .toThrow('Unable to create Bliss element: custom failure');
      expect(() => new BlissElement({}, { level: 3 }))
        .toThrow('Unable to create Bliss element: unknown');
    });
  });

  describe('when reading geometry getters on a leaf with definition-supplied offsets', () => {
    test('exposes the leaf width, height, baseX, x, y, isCharacter, and isShape', () => {
      const element = new BlissElement({
        groups: [{ glyphs: [{ parts: [{ codeName: OFFSET_LEAF }] }] }]
      });
      const part = element.children[0].children[0].children[0];

      expect(part.width).toBe(4);
      expect(part.height).toBe(5);
      expect(part.baseX).toBe(2);
      expect(part.x).toBe(2);
      expect(part.y).toBe(3);
      expect(part.isCharacter).toBe(true);
      expect(part.isShape).toBe(true);
    });
  });

  describe('when reading geometry getters on an empty element', () => {
    test('returns zero for every width, height, baseWidth, baseX, x, and y getter', () => {
      const emptyRoot = new BlissElement({ groups: [], x: 5, y: 7 });
      const emptyGlyph = new BlissElement({
        groups: [{ glyphs: [{ parts: [], x: 4, y: 6 }] }]
      }).children[0].children[0];

      expect(emptyRoot.width).toBe(0);
      expect(emptyRoot.height).toBe(0);
      expect(emptyRoot.baseWidth).toBe(0);
      expect(emptyRoot.baseX).toBe(0);
      expect(emptyRoot.x).toBe(0);
      expect(emptyRoot.y).toBe(0);
      expect(emptyGlyph.baseX).toBe(0);
      expect(emptyGlyph.x).toBe(0);
      expect(emptyGlyph.y).toBe(0);
    });
  });

  describe('when a glyph carries an explicit vertical y offset', () => {
    test('adds the offset into the parent height while the glyph keeps its grid height', () => {
      const element = new BlissElement({
        groups: [{ glyphs: [{ y: 3, parts: [{ codeName: 'HL2' }] }] }]
      });
      const group = element.children[0];
      const glyph = group.children[0];

      expect(element.height).toBe(23);
      expect(group.height).toBe(23);
      expect(glyph.height).toBe(20);
      expect(glyph.y).toBe(3);
    });
  });

  describe('when a group has multiple glyphs at different vertical offsets', () => {
    test('reports the largest child y+height as the group and root height', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [
            { y: 0,  parts: [{ codeName: 'HL2' }] },
            { y: 10, parts: [{ codeName: 'HL2' }] }
          ]
        }]
      });
      const group = element.children[0];

      expect(group.height).toBe(30);
      expect(element.height).toBe(30);
    });
  });

  describe('when y is supplied at the root and group levels', () => {
    test('pins root and group y to zero while descendants report local offsets', () => {
      const element = new BlissElement({
        y: 11,
        groups: [{
          y: 9,
          glyphs: [{ y: 3, parts: [{ codeName: OFFSET_LEAF }] }]
        }]
      });
      const group = element.children[0];
      const glyph = group.children[0];
      const part = glyph.children[0];

      expect(element.y).toBe(0);
      expect(group.y).toBe(0);
      expect(glyph.y).toBe(3);
      expect(part.y).toBe(3);
    });
  });

  describe('when a predefined leaf has a non-callable getPath', () => {
    test('throws the predefined-element invariant on construction', () => {
      expect(() => new BlissElement(treeWithParts([{ codeName: BAD_GET_PATH_LEAF }])))
        .toThrow('An element is only predefined if has a proper getPath function.');
    });
  });

  describe('when composite recursion reaches the maximum nesting depth', () => {
    test('throws once the allowed boundary is crossed', () => {
      expect(() => new BlissElement(treeWithParts([
        compositeChain(MAX_RECURSION_DEPTH - 2)
      ]))).not.toThrow();

      expect(() => new BlissElement(treeWithParts([
        compositeChain(MAX_RECURSION_DEPTH - 1)
      ]))).toThrow('Maximum element nesting depth exceeded');
    });
  });

  describe('when a definition forms a circular reference', () => {
    // R15 part-merge hardening: a circular definition is now rejected at define()
    // (one side fails to register, see define.test.js), so it can no longer be
    // stored and crash at render with "Maximum recursion depth exceeded" - the
    // chain terminates at the unregistered code. These pin that the builder
    // constructs without recursing for the single-code (expand) and composite
    // (parseParts) cycle shapes.
    test('rejects a single-code cycle so the builder does not recurse (CircularA / CircularB)', () => {
      const result = BlissSVGBuilder.define({
        CircularA: { codeString: 'CircularB' },
        CircularB: { codeString: 'CircularA' },
      }, { overwrite: true });
      try {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(() => new BlissSVGBuilder('CircularA')).not.toThrow();
      } finally {
        BlissSVGBuilder.removeDefinition('CircularA');
        BlissSVGBuilder.removeDefinition('CircularB');
      }
    });

    test('rejects a composite cycle so the builder does not recurse (CircularC / CircularD via ;H)', () => {
      const result = BlissSVGBuilder.define({
        CircularC: { codeString: 'CircularD;H' },
        CircularD: { codeString: 'CircularC;H' },
      }, { overwrite: true });
      try {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(() => new BlissSVGBuilder('CircularC')).not.toThrow();
      } finally {
        BlissSVGBuilder.removeDefinition('CircularC');
        BlissSVGBuilder.removeDefinition('CircularD');
      }
    });

    test('does not throw for a legitimate deeply-nested built-in composite (B291 enclosure)', () => {
      expect(() => new BlissSVGBuilder('B291')).not.toThrow();
    });
  });

  describe('when a non-circular custom chain exceeds the parse recursion depth', () => {
    test('throws "Maximum recursion depth exceeded" for a deep glyph chain', () => {
      // post-hardening the parser depth guard is reached via a legitimate deep
      // chain (cycles are now rejected at define). Glyph defs are not flattened by
      // bare-alias resolution, so the chain survives parse-time expansion. This
      // keeps the parser MAX_RECURSION_DEPTH coverage the circular tests used to
      // provide before define() began rejecting cycles.
      const depth = MAX_RECURSION_DEPTH + 5;
      const codes = Array.from({ length: depth + 1 }, (_, k) => `DeepChain${k}`);
      BlissSVGBuilder.define({ [codes[0]]: { type: 'glyph', codeString: 'B291' } });
      for (let k = 1; k <= depth; k++) {
        BlissSVGBuilder.define({ [codes[k]]: { type: 'glyph', codeString: codes[k - 1] } });
      }
      try {
        expect(() => new BlissSVGBuilder(codes[depth])).toThrow('Maximum recursion depth exceeded');
      } finally {
        for (const code of codes) BlissSVGBuilder.removeDefinition(code);
      }
    });
  });
});
