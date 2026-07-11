/**
 * Pins cross-surface parity and workflow sanity for first-class empty
 * content: DSL, API, and object surfaces agree, empty scaffolds fill at
 * every level, and merge/mergeWithNext/splitAt stay sane beside empty
 * groups.
 *
 * Covers:
 * - addGroup('', opts) vs the '[opts]|' DSL token and addGlyph('', opts)
 *   vs the options-only glyph token: byte-equal toString, deep-equal toJSON.
 * - toJSON -> constructor -> toJSON byte-identity for a document holding
 *   bare, options-carrying, and overlay-carrying empty groups.
 * - Scaffold fills: group(i).addGlyph on an empty group, builder addGlyph
 *   and addPart targeting an empty last group, glyph.addPart on an empty
 *   glyph.
 * - merge() with an empty builder (no-op), without an argument (throws),
 *   and with a builder holding a non-space empty group (group kept).
 * - mergeWithNext beside an empty group (no-op toward an empty next, fuse
 *   from an empty receiver) and splitAt on both sides of a middle empty.
 *
 * Does NOT cover:
 * - Per-method singular/empty/TypeError matrices, see
 *   BlissSVGBuilder.group-mutation-args.test.js,
 *   ElementHandle.glyph-mutation-args.test.js, and
 *   ElementHandle.part-mutation-args.test.js (the builder-guards-first vs
 *   handle-gates-first precedence pins live in those handle files).
 * - Emission run-coalescing rules, see
 *   BlissSVGBuilder.empty-content-serialization.test.js.
 * - Document extent of empties, see
 *   BlissSVGBuilder.empty-content-extent.test.js.
 * - Navigation and space classification of empties, see
 *   BlissSVGBuilder.empty-group-navigation.test.js.
 *
 * @issue: #33
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Width is the third number of the svg viewBox.
const viewBoxWidth = (b) =>
  Number(b.svgCode.match(/viewBox="[^"]+ [^"]+ ([^" ]+) [^"]+"/)[1]);

// [B291, space, empty, space, B208]: the shared middle-empty document.
const middleEmptyDoc = () => ({ groups: [
  { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [{ parts: [{ codeName: 'B208' }] }] },
] });

// [B291, space, bare empty, space, options empty, space, overlay empty].
const emptiesDoc = () => ({ groups: [
  { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [] },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [], options: { color: 'red' } },
  { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
  { glyphs: [], wordIndicators: { codes: ['B81'] } },
] });

describe('BlissSVGBuilder empty-content parity', () => {
  describe('when the same options-carrying empty is built via API and via DSL', () => {
    it('serializes addGroup("", opts) identically to the [opts]| token', () => {
      const api = new BlissSVGBuilder('B291').addGroup('', { color: 'red' });
      const dsl = new BlissSVGBuilder('B291//[color=red]|');
      expect(api.toString()).toBe('B291//[color=red]|');
      expect(dsl.toString()).toBe('B291//[color=red]|');
    });

    it('snapshots addGroup("", opts) identically to the [opts]| token', () => {
      const api = new BlissSVGBuilder('B291').addGroup('', { color: 'red' });
      const dsl = new BlissSVGBuilder('B291//[color=red]|');
      expect(api.toJSON()).toEqual(dsl.toJSON());
      expect(api.toJSON().groups.at(-1)).toEqual({ glyphs: [], options: { color: 'red' } });
    });

    it('serializes addGlyph("", opts) identically to the options-only glyph token', () => {
      // note: '[color=red]' with no code is the options-only token for an empty glyph
      const api = new BlissSVGBuilder('B313').addGlyph('', { color: 'red' });
      const dsl = new BlissSVGBuilder('B313/[color=red]');
      expect(api.toString()).toBe('B313/[color=red]');
      expect(dsl.toString()).toBe('B313/[color=red]');
    });

    it('snapshots addGlyph("", opts) identically to the options-only glyph token', () => {
      const api = new BlissSVGBuilder('B313').addGlyph('', { color: 'red' });
      const dsl = new BlissSVGBuilder('B313/[color=red]');
      expect(api.toJSON()).toEqual(dsl.toJSON());
      expect(api.toJSON().groups[0].glyphs.at(-1)).toEqual({ parts: [], options: { color: 'red' } });
    });
  });

  describe('when a document holding empty groups round-trips through toJSON', () => {
    it('rebuilds byte-identically from toJSON output', () => {
      const first = new BlissSVGBuilder(emptiesDoc()).toJSON();
      // presence pins: byte-identity alone passes vacuously if both sides drop the empties
      expect(first.groups).toHaveLength(7);
      expect(first.groups[2]).toEqual({ glyphs: [] });
      expect(first.groups[4]).toEqual({ glyphs: [], options: { color: 'red' } });
      expect(first.groups[6]).toEqual({ glyphs: [], wordIndicators: { codes: ['B81'], stripSemantic: false } });
      const second = new BlissSVGBuilder(first).toJSON();
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('rebuilds byte-identically from toJSON({ deep: true }) output', () => {
      const first = new BlissSVGBuilder(emptiesDoc()).toJSON({ deep: true });
      expect(first.groups).toHaveLength(7);
      const second = new BlissSVGBuilder(first).toJSON({ deep: true });
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  describe('when empty scaffolds are filled level by level', () => {
    it('fills an empty group through group(i).addGlyph', () => {
      const b = new BlissSVGBuilder('B313');
      b.addGroup('');
      b.group(1).addGlyph('B291');
      expect(b.toString()).toBe('B313//B291');
      expect(b.stats.groupCount).toBe(2);
    });

    it('fills the empty last group from builder.addGlyph instead of creating a new group', () => {
      const b = new BlissSVGBuilder('B313');
      b.addGroup('');
      b.addGlyph('B100');
      expect(b.toString()).toBe('B313//B100');
      expect(b.stats.groupCount).toBe(2); // pins last-group targeting: a fresh group would give 3
    });

    it('fills the empty last group from builder.addPart through a carrier glyph', () => {
      const b = new BlissSVGBuilder('B313');
      b.addGroup('');
      b.addPart('B81');
      expect(b.toString()).toBe('B313//B81');
      expect(b.stats.groupCount).toBe(2);
      expect(b.warnings).toHaveLength(0);
    });

    it('fills an empty glyph through glyph.addPart', () => {
      const b = new BlissSVGBuilder();
      b.addGlyph('');
      b.group(0).glyph(0).addPart('B81');
      expect(b.toString()).toBe('B81');
      expect(b.stats.groupCount).toBe(1);
      expect(b.stats.glyphCount).toBe(1);
    });
  });

  describe('when builders holding empty content merge', () => {
    it('keeps merging an empty builder a no-op', () => {
      const b = new BlissSVGBuilder('B291');
      b.merge(new BlissSVGBuilder());
      expect(b.toString()).toBe('B291');
      expect(b.stats.groupCount).toBe(1);
    });

    it('throws when merge is called without a builder', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.merge()).toThrow('merge() requires a BlissSVGBuilder instance');
    });

    it('keeps a non-space empty group from the merged builder', () => {
      const host = new BlissSVGBuilder('B291');
      host.merge(new BlissSVGBuilder({ groups: [{ glyphs: [] }] }));
      expect(host.stats.groupCount).toBe(2);
      expect(host.groups).toHaveLength(2);
      expect(host.toJSON().groups.at(-1)).toEqual({ glyphs: [] });
      // merge() inserts the '//' space; the bare empty itself is string-invisible
      expect(host.toString()).toBe('B291//');
    });
  });

  describe('when mergeWithNext runs beside an empty group', () => {
    it('no-ops when the next group is empty', () => {
      const b = new BlissSVGBuilder(middleEmptyDoc());
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B291///B208');
      expect(b.stats.groupCount).toBe(3); // pins the true no-op: absorbing the empty would give 2
    });

    it('fuses the next word into an empty group', () => {
      const b = new BlissSVGBuilder(middleEmptyDoc());
      b.group(1).mergeWithNext();
      expect(b.toString()).toBe('B291//B208');
      expect(b.stats.groupCount).toBe(2);
      expect(b.toJSON().groups.at(-1).glyphs[0].parts[0].codeName).toBe('B208');
    });
  });

  describe('when splitAt cuts beside a middle empty group', () => {
    it('keeps the empty group in the right half when splitting before it', () => {
      const left = new BlissSVGBuilder(middleEmptyDoc());
      const right = left.splitAt(1);
      expect(left.toString()).toBe('B291');
      expect(left.stats.groupCount).toBe(1);
      expect(right.toString()).toBe('//B208');
      expect(right.stats.groupCount).toBe(2);
      const leftReparse = new BlissSVGBuilder(left.toString());
      const rightReparse = new BlissSVGBuilder(right.toString());
      expect(leftReparse.toString()).toBe(left.toString());
      expect(viewBoxWidth(leftReparse)).toBe(viewBoxWidth(left));
      expect(rightReparse.toString()).toBe(right.toString());
      expect(viewBoxWidth(rightReparse)).toBe(viewBoxWidth(right));
    });

    it('keeps the empty group in the left half when splitting after it', () => {
      const left = new BlissSVGBuilder(middleEmptyDoc());
      const right = left.splitAt(2);
      expect(left.toString()).toBe('B291//');
      expect(left.stats.groupCount).toBe(2);
      expect(right.toString()).toBe('B208');
      expect(right.stats.groupCount).toBe(1);
      const leftReparse = new BlissSVGBuilder(left.toString());
      const rightReparse = new BlissSVGBuilder(right.toString());
      expect(leftReparse.toString()).toBe(left.toString());
      expect(viewBoxWidth(leftReparse)).toBe(viewBoxWidth(left));
      expect(rightReparse.toString()).toBe(right.toString());
      expect(viewBoxWidth(rightReparse)).toBe(viewBoxWidth(right));
    });
  });
});
