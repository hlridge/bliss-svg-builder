/**
 * Pins the singular-argument contract shared by the six group-level mutation
 * methods (addGroup, insertGroup, replaceGroup, addElement, insertElement,
 * replaceElement): exactly one parsed group per call, empty/omitted code
 * creates a first-class empty group, non-string args throw a designed
 * TypeError, and every rejected call leaves the builder untouched.
 *
 * Covers:
 * - multi-group, trailing-separator, and zero-group codes throw with the raw
 *   parsed group count (the // separator materializes a space group, so
 *   B291//B208 produces 3; matches the glyph-family message precedent)
 * - '' / whitespace / omitted code creates {glyphs:[]} on every method with
 *   its own space management (spaced for the *Group family, raw for *Element)
 * - replaceGroup/replaceElement empty-code destructive swap
 * - validation ordering: TypeError guard before index checks, index no-op
 *   checks before content validation (replace family)
 * - options-carrying empty group serializing as the [opts]| token (round-trip)
 * - accepted args keep surfacing their kept-node warnings (UNKNOWN_CODE);
 *   rejected args leak no warnings
 * - '//' parses to a single space group and stays accepted
 * - document-level options ("[opts]||CODE") throw on every method; a bare
 *   empty "||" prefix stays plain accepted content
 *
 * Does NOT cover:
 * - glyph/part-family singular rules, see ElementHandle.glyph-mutation-args.test.js
 *   and ElementHandle.part-mutation-args.test.js
 * - full DSL/API/object parity for empty content, see
 *   BlissSVGBuilder.empty-content-parity.test.js
 * - serialization runs and document extent of empty groups, see
 *   BlissSVGBuilder.empty-content-serialization.test.js and
 *   BlissSVGBuilder.empty-content-extent.test.js
 *
 * @issue: #33
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const rawGroups = (b) => b.toJSON().groups;
const stateOf = (b) => JSON.stringify(b.toJSON());

const METHODS = [
  { name: 'addGroup', invoke: (b, ...args) => b.addGroup(...args) },
  { name: 'insertGroup', invoke: (b, ...args) => b.insertGroup(0, ...args) },
  { name: 'replaceGroup', invoke: (b, ...args) => b.replaceGroup(0, ...args) },
  { name: 'addElement', invoke: (b, ...args) => b.addElement(...args) },
  { name: 'insertElement', invoke: (b, ...args) => b.insertElement(0, ...args) },
  { name: 'replaceElement', invoke: (b, ...args) => b.replaceElement(0, ...args) },
];

describe('BlissSVGBuilder group mutation args', () => {
  describe.each(METHODS.map((m) => [m.name, m]))('%s', (name, { invoke }) => {
    describe('when the code parses to more than one group', () => {
      it('throws the produced group count and leaves the builder untouched', () => {
        const b = new BlissSVGBuilder('B291');
        const before = stateOf(b);
        // raw parse count: // materializes a space group, [B291, TSP, B208]
        expect(() => invoke(b, 'B291//B208'))
          .toThrow('Expected a single group, but code "B291//B208" produced 3 groups');
        expect(stateOf(b)).toBe(before);
      });
    });

    describe('when the code is not a string', () => {
      it('throws a designed TypeError naming the method and leaves the builder untouched', () => {
        const b = new BlissSVGBuilder('B291');
        const before = stateOf(b);
        expect(() => invoke(b, null)).toThrow(TypeError);
        expect(() => invoke(b, null)).toThrow(`${name}() requires a DSL code string`);
        expect(() => invoke(b, 42)).toThrow(`${name}() requires a DSL code string`);
        expect(() => invoke(b, {})).toThrow(`${name}() requires a DSL code string`);
        expect(() => invoke(b, true)).toThrow(`${name}() requires a DSL code string`);
        expect(stateOf(b)).toBe(before);
      });
    });

    describe('when the code carries document-level options', () => {
      it('throws the document-options error and leaves the builder untouched', () => {
        // the constructor applies "[opts]||" document options; a group arg has
        // no document to attach them to, so silently stripping them was loss
        const b = new BlissSVGBuilder('B291');
        const before = stateOf(b);
        expect(() => invoke(b, '[color=red]||B208'))
          .toThrow('Code "[color=red]||B208" carries document-level options ("[opts]||")');
        expect(stateOf(b)).toBe(before);
      });
    });
  });

  describe('when the code parses to no group at all', () => {
    it('throws the produced zero count for a global-options-only code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.addGroup('[color=red]||'))
        .toThrow('Expected a single group, but code "[color=red]||" produced 0 groups');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the code carries a bare empty global-options prefix', () => {
    it('accepts ||CODE as its single parsed group and points the throw message home', () => {
      // "||" with nothing before it sets no document options (parser pin), so
      // the document-options gate must key on option CONTENT, not the token
      const b = new BlissSVGBuilder('B291');
      b.addGroup('||B208');
      expect(b.toString()).toBe('B291//B208');
      expect(b.warnings).toHaveLength(0);
    });

    it('names the builder input and the word spelling in the document-options error', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.addGroup('[color=red]||B208')).toThrow('builder input');
      expect(() => b.addGroup('[color=red]||B208')).toThrow('opts parameter');
    });
  });

  describe('when the code carries a trailing word separator', () => {
    it('throws for a word plus its trailing space run', () => {
      // seam: B291// parses to [B291, TSP]; the trailing space group is a
      // second unit, never silently dropped
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.addGroup('B291//'))
        .toThrow('Expected a single group, but code "B291//" produced 2 groups');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when addGroup receives an empty or omitted code', () => {
    it.each([
      ['an empty string', (b) => b.addGroup('')],
      ['a whitespace-only string', (b) => b.addGroup('   ')],
      ['an omitted argument', (b) => b.addGroup()],
    ])('appends an empty group with space management for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b);
      expect(b.stats.groupCount).toBe(2);
      const groups = rawGroups(b);
      expect(groups).toHaveLength(3);
      expect(groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
      expect(groups[2]).toEqual({ glyphs: [] });
    });
  });

  describe('when insertGroup receives an empty or omitted code', () => {
    it.each([
      ['an empty string', (b) => b.insertGroup(0, '')],
      ['a whitespace-only string', (b) => b.insertGroup(0, '   ')],
      ['an omitted argument', (b) => b.insertGroup(0)],
    ])('inserts an empty group at the index with space management for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b);
      const groups = rawGroups(b);
      expect(groups).toHaveLength(3);
      expect(groups[0]).toEqual({ glyphs: [] });
      expect(groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
      expect(b.stats.groupCount).toBe(2);
    });
  });

  describe('when addElement or insertElement receives an empty or omitted code', () => {
    it.each([
      ['an empty string', (b) => b.addElement('')],
      ['a whitespace-only string', (b) => b.addElement('   ')],
      ['an omitted argument', (b) => b.addElement()],
    ])('addElement appends a bare empty group with no space management for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b);
      const groups = rawGroups(b);
      expect(groups).toHaveLength(2);
      expect(groups[1]).toEqual({ glyphs: [] });
    });

    it.each([
      ['an empty string', (b) => b.insertElement(0, '')],
      ['a whitespace-only string', (b) => b.insertElement(0, '   ')],
      ['an omitted argument', (b) => b.insertElement(0)],
    ])('insertElement inserts a bare empty group with no space management for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b);
      const groups = rawGroups(b);
      expect(groups).toHaveLength(2);
      expect(groups[0]).toEqual({ glyphs: [] });
    });
  });

  describe('when replaceGroup or replaceElement receives an empty or omitted code', () => {
    it.each([
      ['an empty string', (b) => b.replaceGroup(0, '')],
      ['a whitespace-only string', (b) => b.replaceGroup(0, '   ')],
      ['an omitted argument', (b) => b.replaceGroup(0)],
    ])('replaceGroup swaps the target for an empty group for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291//B208');
      act(b);
      const groups = rawGroups(b);
      expect(groups).toHaveLength(3);
      expect(groups[0]).toEqual({ glyphs: [] });
      // the empty group still counts in navigation (empty-group contract)
      expect(b.stats.groupCount).toBe(2);
    });

    it.each([
      ['an empty string', (b) => b.replaceElement(0, '')],
      ['a whitespace-only string', (b) => b.replaceElement(0, '   ')],
      ['an omitted argument', (b) => b.replaceElement(0)],
    ])('replaceElement swaps the raw target for an empty group for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b);
      expect(rawGroups(b)).toEqual([{ glyphs: [] }]);
    });
  });

  describe('when replace targets an out-of-range index', () => {
    it('stays a silent no-op for an empty code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      b.replaceGroup(99, '');
      b.replaceElement(99, '');
      expect(stateOf(b)).toBe(before);
    });

    it('stays a silent no-op even for a multi-group code', () => {
      // index no-op checks precede content validation in the replace family
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.replaceGroup(99, 'B291//B208')).not.toThrow();
      expect(() => b.replaceElement(99, 'B291//B208')).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('still throws the designed TypeError for a non-string code', () => {
      // a non-string arg is a malformed call: the TypeError guard precedes index checks
      const b = new BlissSVGBuilder('B291');
      expect(() => b.replaceGroup(99, 42)).toThrow(TypeError);
      expect(() => b.replaceElement(99, 42)).toThrow(TypeError);
    });
  });

  describe('when an empty code carries options', () => {
    it('creates an options-carrying empty group that serializes as the [opts]| token', () => {
      const b = new BlissSVGBuilder('');
      b.addGroup('', { color: 'red' });
      expect(rawGroups(b)[0]).toEqual({ glyphs: [], options: { color: 'red' } });
      expect(b.toString()).toBe('[color=red]|');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toString()).toBe('[color=red]|');
      expect(reparsed.toJSON().groups).toEqual(rawGroups(b));
    });
  });

  describe('when an accepted code carries a warning', () => {
    it('keeps surfacing the unknown-code warning on builder.warnings', () => {
      // the kept node carries the unknown code, so its warning survives the
      // mutation; parse-time-only warnings are a separate, pre-existing gap
      const b = new BlissSVGBuilder('B208');
      b.addGroup('B291;ZZ9');
      expect(b.warnings.some(w => w.code === 'UNKNOWN_CODE')).toBe(true);
    });

    it('gains no warning from a rejected multi-group code', () => {
      // the discarded-warnings leak dies with the discard: nothing from a
      // rejected arg reaches the tree, so no warning surfaces either
      const b = new BlissSVGBuilder('B208');
      expect(() => b.addGroup('B291;ZZ9//B208')).toThrow('produced 3 groups');
      expect(b.warnings.some(w => w.code === 'UNKNOWN_CODE')).toBe(false);
    });
  });

  describe('when the code is a bare space run', () => {
    it('accepts // as the single space group it parses to', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGroup('//');
      expect(b.toString()).toBe('B291///');
      expect(b.stats.groupCount).toBe(1);
      expect(b.elementCount).toBe(3);
    });
  });
});
