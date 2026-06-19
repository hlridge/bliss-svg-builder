import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { BlissElement } from '../src/lib/bliss-element.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins BlissElement tree-shape contracts. Two surfaces feed the same
 * underlying structure: the immutable snapshot tree exposed by
 * `builder.elements` (equivalent to `element.snapshot()` on a direct
 * `BlissElement`) and the element-instance getters that walk the live
 * tree (`parentElement`, `previousElement`, `effectiveBounds`, `width`,
 * `height`). Snapshots document each element's identity (key, parentKey,
 * codeName), position in the tree (level, index, parent linkage),
 * geometry (x, y, width, height, advanceX, bounds), and content kind
 * (isRoot/isGroup/isGlyph/isPart, isBlissGlyph/isExternalGlyph, isShape,
 * isHeadGlyph, isIndicator). The element-instance side surfaces the
 * same relationships and geometry without going through the snapshot.
 *
 * Covers:
 * - `builder.elements` getter contract: returns a frozen root node; the
 *   reference is identity-cached across accesses; children arrays are
 *   frozen too.
 * - Snapshot field shape: every required field is present on a root node
 *   (key, codeName, x, y, width, height, advanceX, level, isRoot, isGroup,
 *   isGlyph, isPart, bounds, isIndicator, isShape, isBlissGlyph,
 *   isExternalGlyph, isHeadGlyph, index, parentKey, children).
 * - `char` field on non-glyph snapshots (root, group, part): the
 *   level-conditional `#char` assignment leaves `#char` undefined on all
 *   non-glyph levels, and the snapshot's `?? ''` fallback surfaces `''`.
 * - Level-derived booleans: isRoot at level 0, isGroup at level 1,
 *   isGlyph at level 2, isPart at level 3.
 * - `bounds`: frozen object with {minX, maxX, minY, maxY, width, height}.
 * - Key system: every element has a unique key; root has parentKey=null;
 *   children's parentKey points back at their parent's key.
 * - Index system: root has index 0; siblings have sequential indices.
 * - Positioning: absolute x for multi-word inputs reflects kerning;
 *   positive width/height; advanceX advances the cursor for sibling glyphs.
 * - Content-kind flags: isBlissGlyph for B-codes, isExternalGlyph for
 *   X-prefix glyphs, isShape for leaf shape elements.
 * - isHeadGlyph: the query-time resolved head of every group (first
 *   non-excluded glyph; single-glyph words self-head), exactly one per group.
 * - Immutability: throws on direct assignment to any snapshot property,
 *   push to the children array, or assignment to a bounds property.
 * - Element-instance navigation: `parentElement` back-references the
 *   immediate parent (or null at the root); `previousElement` references
 *   the immediate previous sibling (or null at the start of a children
 *   array).
 * - Snapshot bounds across nested levels: absolute positions, local
 *   offsets, parent/index relationships, isHeadGlyph, and tight bounds
 *   propagate to every level, matching `element.effectiveBounds` from
 *   the same tree at every level.
 * - Empty-group bounds: an empty `glyphs: []` leaves the children array
 *   empty and the bounds zeroed on both the snapshot and the element.
 * - Incomplete-box leaf bounds: when a leaf definition omits one of the
 *   four box properties (e.g. height only, no width), `width` and
 *   `effectiveBounds` collapse to zero along the missing axis.
 *
 * Does NOT cover:
 * - Level-derived boolean accessors and content-kind boolean accessors in
 *   broader depth (every code-class pair, every level variant), see
 *   `BlissElement.taxonomy.test.js`.
 * - The codeName + char contract (when identity surfaces vs hides), see
 *   `BlissElement.codename-contract.test.js`.
 * - baseWidth dimension semantics (width without indicators), see
 *   `BlissElement.base-width.test.js`.
 * - Per-element handle semantics (read/write through mutating handles,
 *   handle identity, handle resilience across mutations), see the
 *   `ElementHandle.*` cluster (apply-indicators, dimensions, parity,
 *   resilience, taxonomy).
 * - Snapshot ↔ JSON output equivalence, see
 *   `BlissSVGBuilder.json-output.test.js`.
 * - Element key continuity across mutations, see
 *   `BlissSVGBuilder.element-keys.test.js`.
 */

describe('BlissElement snapshots', () => {
  describe('when accessing builder.elements', () => {
    it('returns a frozen root snapshot', () => {
      const builder = new BlissSVGBuilder('H');
      const root = builder.elements;
      expect(root).not.toBeNull();
      expect(root.isRoot).toBe(true);
      expect(Object.isFrozen(root)).toBe(true);
    });

    it('is cached across accesses', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.elements).toBe(builder.elements);
    });

    it('has frozen children arrays', () => {
      const builder = new BlissSVGBuilder('H');
      const root = builder.elements;
      expect(Object.isFrozen(root.children)).toBe(true);
    });
  });

  describe('when inspecting the snapshot structure', () => {
    it('exposes all documented fields on the root snapshot', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(root).toHaveProperty('key');
      expect(root).toHaveProperty('codeName');
      expect(root).toHaveProperty('x');
      expect(root).toHaveProperty('y');
      expect(root).toHaveProperty('width');
      expect(root).toHaveProperty('height');
      expect(root).toHaveProperty('advanceX');
      expect(root).toHaveProperty('level');
      expect(root).toHaveProperty('isRoot');
      expect(root).toHaveProperty('isGroup');
      expect(root).toHaveProperty('isGlyph');
      expect(root).toHaveProperty('isPart');
      expect(root).toHaveProperty('bounds');
      expect(root).toHaveProperty('isIndicator');
      expect(root).toHaveProperty('isShape');
      expect(root).toHaveProperty('isBlissGlyph');
      expect(root).toHaveProperty('isExternalGlyph');
      expect(root).toHaveProperty('isHeadGlyph');
      expect(root).toHaveProperty('index');
      expect(root).toHaveProperty('parentKey');
      expect(root).toHaveProperty('children');
    });

    it('sets level=0/1/2/3 with the matching isRoot/isGroup/isGlyph/isPart boolean at each depth', () => {
      const root = new BlissSVGBuilder('B291//B292').elements;
      expect(root.isRoot).toBe(true);
      expect(root.level).toBe(0);

      const group = root.children[0];
      expect(group.isGroup).toBe(true);
      expect(group.level).toBe(1);

      const glyph = group.children[0];
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.level).toBe(2);

      if (glyph.children.length > 0) {
        expect(glyph.children[0].isPart).toBe(true);
        expect(glyph.children[0].level).toBe(3);
      }
    });

    it('exposes a frozen bounds object with minX/maxX/minY/maxY/width/height', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(Object.isFrozen(root.bounds)).toBe(true);
      expect(root.bounds).toHaveProperty('minX');
      expect(root.bounds).toHaveProperty('maxX');
      expect(root.bounds).toHaveProperty('minY');
      expect(root.bounds).toHaveProperty('maxY');
      expect(root.bounds).toHaveProperty('width');
      expect(root.bounds).toHaveProperty('height');
    });
  });

  describe('when reading the char field on a snapshot without a glyph identity', () => {
    it('returns an empty string at root, group, and part levels', () => {
      const root = new BlissSVGBuilder('B291').elements;
      const group = root.children[0];
      const glyph = group.children[0];
      const part = glyph.children[0];

      expect(root.char).toBe('');
      expect(group.char).toBe('');
      expect(part.char).toBe('');
    });
  });

  describe('when reading element keys and parentKey references', () => {
    it('assigns a unique key to every element in the tree', () => {
      const root = new BlissSVGBuilder('B291/B292//B293').elements;
      const keys = new Set();
      function collect(el) {
        keys.add(el.key);
        el.children.forEach(collect);
      }
      collect(root);
      let count = 0;
      function countAll(el) { count++; el.children.forEach(countAll); }
      countAll(root);
      expect(keys.size).toBe(count);
    });

    it('reports parentKey=null on the root', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(root.parentKey).toBeNull();
    });

    it('sets every child node\'s parentKey to its parent\'s key', () => {
      const root = new BlissSVGBuilder('H').elements;
      const group = root.children[0];
      expect(group.parentKey).toBe(root.key);
      const glyph = group.children[0];
      expect(glyph.parentKey).toBe(group.key);
    });
  });

  describe('when reading element indices', () => {
    it('reports index=0 on the root', () => {
      expect(new BlissSVGBuilder('H').elements.index).toBe(0);
    });

    it('assigns sequential indices to siblings', () => {
      const root = new BlissSVGBuilder('B291/B292//B293').elements;
      root.children.forEach((child, i) => {
        expect(child.index).toBe(i);
      });
    });
  });

  describe('when reading positioning and dimensions', () => {
    it('exposes absolute x positions ordered along the rendering axis', () => {
      const root = new BlissSVGBuilder('B291//B292').elements;
      const firstWord = root.children[0];
      const space = root.children[1];
      const secondWord = root.children[2];

      // second word's absolute x lies past the first word + the intervening space group
      expect(secondWord.x).toBeGreaterThan(firstWord.x);
    });

    it('exposes positive width and height on glyph nodes', () => {
      const root = new BlissSVGBuilder('H').elements;
      const glyph = root.children[0].children[0];
      expect(glyph.width).toBeGreaterThan(0);
      expect(glyph.height).toBeGreaterThan(0);
    });

    it('advances sibling-glyph cursors by advanceX', () => {
      const root = new BlissSVGBuilder('B291/B292').elements;
      const word = root.children[0];
      const firstGlyph = word.children[0];
      const secondGlyph = word.children[1];

      expect(firstGlyph.advanceX).toBeGreaterThan(0);
      // second glyph starts at or past the first's x + advanceX (kerning may extend, not retract)
      expect(secondGlyph.x).toBeGreaterThanOrEqual(firstGlyph.x + firstGlyph.advanceX);
    });
  });

  describe('when checking content-kind boolean flags', () => {
    it('sets isBlissGlyph=true and isExternalGlyph=false for a B-code glyph', () => {
      const root = new BlissSVGBuilder('B291').elements;
      const glyph = root.children[0].children[0];
      expect(glyph.isBlissGlyph).toBe(true);
      expect(glyph.isExternalGlyph).toBe(false);
    });

    it('sets isExternalGlyph=true and isBlissGlyph=false for an X-prefix glyph', () => {
      const root = new BlissSVGBuilder('Xa').elements;
      const glyph = root.children[0].children[0];
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.isBlissGlyph).toBe(false);
    });

    it('sets isShape=true on leaf shape elements', () => {
      const root = new BlissSVGBuilder('H').elements;
      function findShape(el) {
        if (el.isShape) return el;
        for (const c of el.children) {
          const found = findShape(c);
          if (found) return found;
        }
        return null;
      }
      const shape = findShape(root);
      expect(shape).not.toBeNull();
      expect(shape.isShape).toBe(true);
    });
  });

  describe('when checking isHeadGlyph', () => {
    it('marks the first glyph of a multi-glyph word as head', () => {
      const root = new BlissSVGBuilder('B291/B292').elements;
      const word = root.children[0];
      expect(word.children[0].isHeadGlyph).toBe(true);
      expect(word.children[1].isHeadGlyph).toBe(false);
    });

    it('resolves the head past an excluded base via the exclusion scan', () => {
      // B486 (opposite-to) is a head-glyph exclusion, so the head is B368 at
      // index 1, resolved here at query time (R15 WS-4) rather than defaulting
      // to index 0. Pins the snapshot's resolveHeadIndex use against a revert.
      const word = new BlissSVGBuilder('B486/B368').elements.children[0];
      expect(word.children[0].isHeadGlyph).toBe(false);
      expect(word.children[1].isHeadGlyph).toBe(true);
    });

    it('flips the head after addPart on a custom glyph wrapping an exclusion (R15 F2 tripwire)', () => {
      // TRIPWIRE for review finding F2 (gated to RR3-2 / GitHub #30, the
      // insertPart/addPart identity-loss bug). MYG's identity is non-excluded so
      // it heads `MYG/B208` (index 0); addPart deletes its glyphCode, so query-time
      // head resolution (R15 WS-4) then falls through to the inner B486 (an
      // exclusion) and the crown flips to B208 (index 1). Pre-WS-4 it stayed at 0.
      // When RR3-2 makes part mutation preserve head identity, flip the post-addPart
      // expectation back to 0 and delete this note.
      const headOf = (b) => b.elements.children[0].children.filter(c => c.isGlyph).findIndex(g => g.isHeadGlyph);
      BlissSVGBuilder.define({ MYG_F2: { type: 'glyph', codeString: 'B486;B303' } });
      try {
        const b = new BlissSVGBuilder('MYG_F2/B208');
        expect(headOf(b)).toBe(0);
        b.group(0).glyph(0).addPart('B303');
        expect(headOf(b)).toBe(1);
      } finally {
        BlissSVGBuilder.removeDefinition('MYG_F2');
      }
    });

    it('has exactly one head glyph per group across multi-word inputs', () => {
      const root = new BlissSVGBuilder('B291/B292//B293/B294').elements;
      for (const group of root.children) {
        if (group.isGroup) {
          const headCount = group.children.filter(c => c.isHeadGlyph).length;
          expect(headCount).toBe(1);
        }
      }
    });

    it('self-heads the lone glyph in a single-glyph word', () => {
      const root = new BlissSVGBuilder('B291').elements;
      const word = root.children[0];
      expect(word.children[0].isHeadGlyph).toBe(true);
    });
  });

  describe('when navigating elements via parentElement and previousElement', () => {
    it('back-references the immediate parent and previous sibling at every level, returning null at tree boundaries', () => {
      const element = new BlissElement({
        key: 'root-c12',
        groups: [{
          key: 'group-c12',
          glyphs: [
            { key: 'glyph-a-c12', parts: [{ key: 'part-a-c12', codeName: 'HL2' }] },
            { key: 'glyph-b-c12', parts: [{ key: 'part-b-c12', codeName: 'HL2' }] }
          ]
        }]
      });
      const group = element.children[0];
      const [firstGlyph, secondGlyph] = group.children;
      const firstPart = firstGlyph.children[0];

      expect(element.parentElement).toBeNull();
      expect(group.parentElement).toBe(element);
      expect(firstGlyph.parentElement).toBe(group);
      expect(firstPart.parentElement).toBe(firstGlyph);
      expect(firstGlyph.previousElement).toBeNull();
      expect(secondGlyph.previousElement).toBe(firstGlyph);
      expect(element.key).toBe('root-c12');
      expect(group.key).toBe('group-c12');
      expect(firstPart.key).toBe('part-a-c12');
    });
  });

  describe('when capturing snapshot bounds across a nested element tree', () => {
    const BOUNDS_LEAF = '_C13_BOUNDS_LEAF';
    let previousBoundsLeaf;

    beforeAll(() => {
      previousBoundsLeaf = blissElementDefinitions[BOUNDS_LEAF];
      blissElementDefinitions[BOUNDS_LEAF] = {
        getPath: (x, y) => `M${x},${y}h4v5h-4z`,
        width: 4,
        height: 5,
        x: 2,
        y: 3,
        isShape: true
      };
    });

    afterAll(() => {
      if (previousBoundsLeaf === undefined) {
        delete blissElementDefinitions[BOUNDS_LEAF];
      } else {
        blissElementDefinitions[BOUNDS_LEAF] = previousBoundsLeaf;
      }
    });

    it('exposes absolute positions, local offsets, parent/index relationships, isHeadGlyph, and tight bounds at every level', () => {
      const element = new BlissElement({
        key: 'root-c13',
        groups: [{
          key: 'group-c13',
          x: 3,
          y: 5,
          glyphs: [{
            key: 'glyph-c13',
            x: 4,
            y: 6,
            parts: [{
              key: 'part-c13',
              codeName: BOUNDS_LEAF,
              x: 7,
              y: 8
            }]
          }]
        }]
      });
      const root = element.snapshot();
      const group = root.children[0];
      const glyph = group.children[0];
      const part = glyph.children[0];
      const bounds = {
        minX: 16,
        maxX: 20,
        minY: 22,
        maxY: 27,
        width: 4,
        height: 5
      };

      expect(root.children).toHaveLength(1);
      expect(group.children).toHaveLength(1);
      expect(glyph.children).toHaveLength(1);

      expect(group.parentKey).toBe('root-c13');
      expect(glyph.parentKey).toBe('group-c13');
      expect(part.parentKey).toBe('glyph-c13');
      expect(group.index).toBe(0);
      expect(glyph.index).toBe(0);
      expect(part.index).toBe(0);

      expect(group).toMatchObject({ x: 3, y: 5, offsetX: 3, offsetY: 5 });
      expect(glyph).toMatchObject({ x: 7, y: 11, offsetX: 4, offsetY: 6 });
      expect(part).toMatchObject({ x: 14, y: 19, offsetX: 7, offsetY: 8 });

      expect(root.isHeadGlyph).toBe(false);
      expect(group.isHeadGlyph).toBe(false);
      expect(glyph.isHeadGlyph).toBe(true);
      expect(part.isHeadGlyph).toBe(false);

      expect(root.bounds).toEqual(bounds);
      expect(group.bounds).toEqual(bounds);
      expect(glyph.bounds).toEqual(bounds);
      expect(part.bounds).toEqual(bounds);
      expect(element.effectiveBounds).toEqual(bounds);
      expect(element.children[0].effectiveBounds).toEqual(bounds);
      expect(element.children[0].children[0].effectiveBounds).toEqual(bounds);
      expect(element.children[0].children[0].children[0].effectiveBounds).toEqual(bounds);
    });
  });

  describe('when an element tree contains an empty group', () => {
    it('leaves children empty and bounds zeroed on both the snapshot and the element', () => {
      const element = new BlissElement({ groups: [{ glyphs: [] }] });
      const root = element.snapshot();
      const group = root.children[0];
      const emptyBounds = {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        width: 0,
        height: 0
      };

      expect(group.children).toEqual([]);
      expect(group.isHeadGlyph).toBe(false);
      expect(group.bounds).toEqual(emptyBounds);
      expect(element.effectiveBounds).toEqual(emptyBounds);
    });
  });

  describe('when a leaf definition is missing geometric properties', () => {
    const HEIGHT_ONLY_LEAF = '_C13_HEIGHT_ONLY_LEAF';
    let previousHeightOnlyLeaf;

    beforeAll(() => {
      previousHeightOnlyLeaf = blissElementDefinitions[HEIGHT_ONLY_LEAF];
      blissElementDefinitions[HEIGHT_ONLY_LEAF] = {
        getPath: (x, y) => `M${x},${y}v5`,
        height: 5,
        isShape: true
      };
    });

    afterAll(() => {
      if (previousHeightOnlyLeaf === undefined) {
        delete blissElementDefinitions[HEIGHT_ONLY_LEAF];
      } else {
        blissElementDefinitions[HEIGHT_ONLY_LEAF] = previousHeightOnlyLeaf;
      }
    });

    it('reports zero width and zero-area effectiveBounds when a leaf supplies only a height', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            parts: [{
              codeName: HEIGHT_ONLY_LEAF,
              x: 5,
              y: 6
            }]
          }]
        }]
      });
      const part = element.children[0].children[0].children[0];

      expect(part.width).toBe(0);
      expect(part.height).toBe(5);
      expect(part.effectiveBounds).toEqual({
        minX: 5,
        maxX: 5,
        minY: 6,
        maxY: 6,
        width: 0,
        height: 0
      });
    });
  });

  describe('when mutating a frozen snapshot', () => {
    it('throws on direct assignment to a snapshot property', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(() => { root.x = 999; }).toThrow();
      expect(() => { root.key = 'hacked'; }).toThrow();
    });

    it('throws on push to the children array', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(() => { root.children.push({}); }).toThrow();
    });

    it('throws on assignment to a bounds property', () => {
      const root = new BlissSVGBuilder('H').elements;
      expect(() => { root.bounds.minX = 999; }).toThrow();
    });
  });
});
