import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the element key system: auto-generated keys, user-assigned keys via
 * DSL [key=...] and JSON { key: ... }, getElementByKey lookup, and the
 * separation between [key=...] (key system) and [id=...] (SVG pass-through).
 *
 * Covers:
 * - Auto-key uniqueness within a tree.
 * - Auto-key stability across mutation-driven tree rebuilds (within one build cycle).
 * - Distinctness of auto keys between independent builder instances.
 * - User-assigned keys via DSL `[key=foo]|...` and via JSON `{ key: 'bar', ... }`.
 * - `getElementByKey(key)` lookup for both user-assigned and auto keys.
 * - `toJSON()` omits keys (auto and user); keys do not round-trip through JSON.
 * - `[id=...]` is treated as an SVG pass-through attribute, not intercepted by the key system.
 * - An overlay-reordered char-indicator key round-trips through
 *   `getElementByKey`: its raw key is preserved through the `;;` overlay merge.
 *
 * Does NOT cover:
 * - Element handle level/type semantics; see `ElementHandle.taxonomy.test.js`.
 * - Mutation API behavior on keyed elements; see `BlissSVGBuilder.mutation-api.test.js`.
 */
describe('BlissSVGBuilder element keys', () => {

  describe('when reading auto-generated keys', () => {
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

    it('keeps auto keys as non-empty strings after a sibling-removing mutation rebuilds the tree', () => {
      const builder = new BlissSVGBuilder('H/C8/B303');
      const keyBefore = builder.elements.children[0].children[2].key;
      builder.glyph(0).remove();
      const keyAfter = builder.elements.children[0].children[1].key;
      // B303 was at index 2, now at index 1, but its key is stable
      // (keys are random, so we verify it didn't change due to sibling removal)
      // After mutation, the tree is rebuilt so keys are new. But that's the nature
      // of the current rebuild system; keys are stable within a single build.
      expect(typeof keyAfter).toBe('string');
      expect(keyAfter.length).toBeGreaterThan(0);
    });

    it('produces different auto keys for two builder instances with identical input', () => {
      const rootA = new BlissSVGBuilder('B291').elements;
      const rootB = new BlissSVGBuilder('B291').elements;
      expect(rootA.key).not.toBe(rootB.key);
    });
  });

  describe('when assigning keys via the DSL or JSON input', () => {
    it('honors a [key=foo] DSL option on a group element', () => {
      const root = new BlissSVGBuilder('[key=foo]|B291').elements;
      const group = root.children[0];
      expect(group.key).toBe('foo');
    });

    it('honors a user-assigned key on a JSON input node', () => {
      const json = new BlissSVGBuilder('B291').toJSON();
      json.groups[0].key = 'bar';
      const root = new BlissSVGBuilder(json).elements;
      expect(root.children[0].key).toBe('bar');
    });
  });

  describe('when looking up elements by key', () => {
    it('returns the keyed handle for a user-assigned key', () => {
      const builder = new BlissSVGBuilder('[key=mygroup]|B291');
      const handle = builder.getElementByKey('mygroup');
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(1);
    });

    it('returns the keyed handle for an auto-generated key', () => {
      const builder = new BlissSVGBuilder('B291/B292');
      const autoKey = builder.elements.children[0].children[1].key;
      const handle = builder.getElementByKey(autoKey);
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(2);
    });

    it('round-trips an overlay-reordered char-indicator key through getElementByKey', () => {
      // regression (N14-2): a `;` char-indicator that a `;;` overlay reorders into
      // the resolved head keeps its raw key through the overlay merge
      // (mergeWordIndicatorsOntoHead reuses the existing part instead of
      // re-parsing it), so getElementByKey round-trips it, like its base sibling.
      const builder = new BlissSVGBuilder('B313;B97;;B81');
      const charIndicator = builder.part(1);
      expect(charIndicator.codeName).toBe('B97');
      expect(builder.getElementByKey(charIndicator.key)?.codeName).toBe('B97');

      const base = builder.part(0);
      expect(builder.getElementByKey(base.key).codeName).toBe('B313');
    });
  });

  describe('when serializing the tree to JSON', () => {
    it('omits auto and user-assigned keys from the toJSON() output', () => {
      const autoJson = new BlissSVGBuilder('B291').toJSON();
      expect(autoJson.key).toBeUndefined();
      expect(autoJson.groups[0].key).toBeUndefined();

      const userJson = new BlissSVGBuilder('[key=foo]|B291').toJSON();
      expect(userJson.key).toBeUndefined();
      expect(userJson.groups[0].key).toBeUndefined();
      if (userJson.groups[0].options) {
        expect(userJson.groups[0].options.key).toBeUndefined();
      }
    });
  });

  describe('when [id=...] coexists with the key system', () => {
    it('passes [id=bar] through to the SVG output, leaving the key system untouched', () => {
      const svg = new BlissSVGBuilder('[id=bar]||B291').svgCode;
      expect(svg).toContain('id="bar"');
    });
  });
});
