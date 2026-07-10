/**
 * Pins that content-empty groups contribute no document extent: the
 * rendered viewBox and the snapshot bounds end at real content no matter
 * where empty groups sit, matching what the serialized form renders.
 *
 * Covers:
 * - trailing empties no longer widen the viewBox (DSL [opts]| token and
 *   object input, single empty and space-and-empty runs)
 * - leading and interior empties stay width-neutral (regression pins)
 * - solo-empty and all-empty-glyph documents render at empty-document
 *   width with finite bounds (no Infinity from all-excluded aggregation)
 * - a group holding any content glyph keeps its full extent
 * - a trailing empty glyph inside a group stays width-neutral and no
 *   longer inflates the group's bounds
 * - snapshot bounds.maxX ends at the last content glyph
 * - [center] with min-width positions a trailing-empty document exactly
 *   like its serialized twin (baseWidth exclusion)
 *
 * Does NOT cover:
 * - navigation/classification of empty groups, see
 *   BlissSVGBuilder.empty-group-navigation.test.js
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

// Fresh raw-group nodes per call so no document shares node references.
const word = (code) => ({ glyphs: [{ parts: [{ codeName: code }] }] });
const space = () => word('TSP');
const empty = () => ({ glyphs: [] });

describe('BlissSVGBuilder empty-content extent', () => {
  describe('when a document ends in empty groups', () => {
    it('excludes a trailing options-only empty word from the viewBox', () => {
      const b = new BlissSVGBuilder('B291//[color=red]|');
      expect(viewBoxWidth(b)).toBe(11.5);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('B291//')));
    });

    it('excludes a trailing bare empty group from the viewBox', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty()] });
      expect(viewBoxWidth(b)).toBe(11.5);
      expect(viewBoxWidth(b)).toBe(
        viewBoxWidth(new BlissSVGBuilder({ groups: [word('B291'), space()] }))
      );
    });

    it('excludes a trailing group whose only glyphs are empty', () => {
      // pins the every-child-empty half of the classification: a zero-glyph
      // shortcut (glyphs.length === 0) would miss this group entirely.
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), { glyphs: [{ parts: [] }] }] });
      expect(viewBoxWidth(b)).toBe(11.5);
      expect(viewBoxWidth(b)).toBe(
        viewBoxWidth(new BlissSVGBuilder({ groups: [word('B291'), space()] }))
      );
    });

    it('excludes every empty group of a trailing space-and-empty run', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty(), space(), empty()] });
      expect(viewBoxWidth(b)).toBe(17.5);
      expect(viewBoxWidth(b)).toBe(
        viewBoxWidth(new BlissSVGBuilder({ groups: [word('B291'), space(), space()] }))
      );
    });

    it('ends the snapshot bounds at the last content glyph', () => {
      // pins the #calculateBounds exclusion separately from the width getter:
      // the default viewBox never reads bounds, so only this surface catches it.
      const withEmpty = new BlissSVGBuilder({ groups: [word('B291'), empty()] });
      const contentOnly = new BlissSVGBuilder({ groups: [word('B291')] });
      expect(withEmpty.elements.bounds.maxX).toBe(8);
      expect(withEmpty.elements.bounds.maxX).toBe(contentOnly.elements.bounds.maxX);
    });

    it('centers a trailing-empty document exactly like its serialized twin', () => {
      // pins the baseWidth exclusion: centering reads baseWidth, so a leaked
      // trailing-empty position term shifts the viewBox and clips ink.
      const viewBox = (s) => new BlissSVGBuilder(s).svgCode.match(/viewBox="([^"]+)"/)[1];
      expect(viewBox('[center;min-width=12]||B291//|'))
        .toBe(viewBox('[center;min-width=12]||B291//'));
    });
  });

  describe('when empty groups sit at the start or interior', () => {
    it('keeps a leading empty group width-neutral', () => {
      const b = new BlissSVGBuilder({ groups: [empty(), space(), word('B291')] });
      expect(viewBoxWidth(b)).toBe(15.5);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('//B291')));
    });

    it('keeps an interior empty group width-neutral', () => {
      const b = new BlissSVGBuilder({ groups: [word('B291'), space(), empty(), space(), word('B208')] });
      expect(viewBoxWidth(b)).toBe(31.5);
    });
  });

  describe('when a document holds only empty content', () => {
    it('renders a solo empty group at empty-document size with finite bounds', () => {
      // pins the all-excluded guard: aggregating zero layout children must
      // not produce Math.min(...[]) = Infinity in bounds or the viewBox.
      const b = new BlissSVGBuilder({ groups: [empty()] });
      expect(viewBoxWidth(b)).toBe(1.5);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('')));
      expect(b.svgCode).not.toMatch(/Infinity|NaN/);
      expect(Number.isFinite(b.elements.bounds.minX)).toBe(true);
      expect(Number.isFinite(b.elements.bounds.maxX)).toBe(true);
    });

    it('treats a group of only empty glyphs as content-empty', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [] }] }] });
      expect(viewBoxWidth(b)).toBe(1.5);
    });
  });

  describe('when a group mixes empty and content glyphs', () => {
    it('keeps a group holding any content glyph in the document extent', () => {
      // pins the every-glyph-empty classification: one content glyph means
      // the group is NOT content-empty and keeps its full extent.
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [] }, { parts: [{ codeName: 'B291' }] }] }] });
      expect(viewBoxWidth(b)).toBe(9.5);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('B291')));
    });

    it('keeps a trailing empty glyph inside a group width-neutral', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'H' }] }, { parts: [] }] }] });
      expect(viewBoxWidth(b)).toBe(9.5);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('H')));
    });

    it('ends the group bounds at the last content glyph when a trailing glyph is empty', () => {
      // pins the level-1 bounds exclusion (reachable via crop=auto): the
      // width getter filtered empty glyphs but bounds never did.
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'H' }] }, { parts: [] }] }] });
      expect(b.elements.bounds.maxX).toBe(8);
      expect(b.elements.bounds.maxX).toBe(new BlissSVGBuilder('H').elements.bounds.maxX);
    });
  });
});
