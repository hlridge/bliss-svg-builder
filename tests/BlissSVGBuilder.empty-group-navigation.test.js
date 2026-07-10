/**
 * Pins that content-empty groups are first-class in navigation: never
 * classified as space groups, visible in .groups, aligned with group(i)
 * and stats, and preserved by toJSON at every option.
 *
 * Covers:
 * - {glyphs:[]} object input, [opts]| DSL input, and glyph-detach as sources
 * - .groups / stats.groupCount / group(i) agreement with empties present
 * - snapshot isSpaceGroup === false on a content-empty group
 * - toJSON keeps {glyphs:[]} (default, {deep:true}, {flattenIndicators:true}
 *   with an overlay on an empty group)
 * - advance coupling: an interior empty group advances nothing (regression
 *   guard for the space-classification flip)
 * - real space groups keep their space classification
 *
 * Does NOT cover:
 * - document extent of empties, see
 *   BlissSVGBuilder.empty-content-extent.test.js
 * - toString emission of empty/space runs, see
 *   BlissSVGBuilder.empty-content-serialization.test.js
 *
 * @issue: #33
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Width is the third number of the svg viewBox.
const viewBoxWidth = (b) =>
  Number(b.svgCode.match(/viewBox="[^"]+ [^"]+ ([^" ]+) [^"]+"/)[1]);

// [B291, space, empty, space, B208]
const EMPTY_MID = { groups: [
  { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [{ parts: [{ codeName: 'B208' }] }] },
] };

// EMPTY_MID without the empty group: the layout twin it must match in width.
const TWO_SPACES = { groups: [
  { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [{ parts: [{ codeName: 'B208' }] }] },
] };

describe('BlissSVGBuilder empty-group navigation', () => {
  describe('when a document holds a content-empty group', () => {
    it('reports the empty group in .groups', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }, { glyphs: [] }] });
      expect(b.groups).toHaveLength(2);
    });

    it('classifies the empty group as not a space group in the snapshot', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [] }] });
      expect(b.elements.children[0].isSpaceGroup).toBe(false);
    });

    it('agrees between .groups length, stats.groupCount, and group(i) reach', () => {
      const b = new BlissSVGBuilder(EMPTY_MID);
      expect(b.stats.groupCount).toBe(3);
      expect(b.groups).toHaveLength(3);
      expect(b.group(2)).not.toBeNull();
      expect(b.group(3)).toBeNull();
    });
  });

  describe('when the DSL input is an options-only word token', () => {
    it('parses [color=red]| to one visible group with zero glyphs and carried options', () => {
      const b = new BlissSVGBuilder('[color=red]|');
      expect(b.groups).toHaveLength(1);
      expect(b.elements.children[0].isSpaceGroup).toBe(false);
      expect(b.toJSON().groups[0]).toEqual({ glyphs: [], options: { color: 'red' } });
    });
  });

  describe('when every glyph of a group is detached', () => {
    it('keeps the emptied group visible in .groups', () => {
      const b = new BlissSVGBuilder('B291/B208');
      b.group(0).glyph(0).detach();
      b.group(0).glyph(0).detach();
      expect(b.toJSON().groups).toEqual([{ glyphs: [] }]);
      expect(b.groups).toHaveLength(1);
    });
  });

  describe('when an empty group serializes to JSON', () => {
    it('keeps {glyphs: []} at default and deep', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }, { glyphs: [] }] });
      expect(b.toJSON().groups[1]).toEqual({ glyphs: [] });
      expect(b.toJSON({ deep: true }).groups[1]).toEqual({ glyphs: [] });
    });

    it('keeps a word-indicator overlay on an empty group under flattenIndicators', () => {
      // Flattening bakes an overlay into the word's head glyph; with zero
      // glyphs there is nothing to bake into, so the overlay must survive
      // as an overlay instead of vanishing.
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [], wordIndicators: { codes: ['B81'] } }] });
      const flattened = b.toJSON({ flattenIndicators: true }).groups[0];
      expect(flattened.glyphs).toEqual([]);
      expect(flattened.wordIndicators.codes).toEqual(['B81']);
      expect(b.warnings).toHaveLength(0);
    });
  });

  describe('when an interior empty group sits between space groups', () => {
    it('advances nothing, matching the same document without the empty group', () => {
      // regression guard: the space-classification flip moves empty groups
      // onto the empty-glyphs advance branch, which must also yield 0.
      const emptyMidWidth = viewBoxWidth(new BlissSVGBuilder(EMPTY_MID));
      expect(emptyMidWidth).toBe(31.5);
      expect(emptyMidWidth).toBe(viewBoxWidth(new BlissSVGBuilder(TWO_SPACES)));
    });
  });

  describe('when groups hold real space glyphs', () => {
    it('still classifies space groups as spaces and hides them from .groups', () => {
      const b = new BlissSVGBuilder('B291//B208');
      expect(b.groups).toHaveLength(2);
      expect(b.elements.children[1].isSpaceGroup).toBe(true);
    });
  });
});
