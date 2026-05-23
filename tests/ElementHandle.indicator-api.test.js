import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the `.isIndicator` boolean property on `ElementHandle`. Only
 * level-3 part handles whose underlying glyph is registered as an
 * indicator return `true`; every other handle level returns `false`.
 *
 * Covers:
 * - True for an indicator part of a composite glyph (B291;B86, part 1).
 * - False for a non-indicator part of a composite glyph (B291;B86, part 0).
 * - True for an indicator standalone glyph probed at part level (B86).
 * - False for a non-indicator standalone glyph probed at part level (B291).
 * - False for glyph-level (level 2) and group-level (level 1) handles.
 * - Property survives unrelated mutations to the same group.
 *
 * Does NOT cover:
 * - The set of codes that count as indicators (the underlying
 *   `blissElementDefinitions` registry), see
 *   `BlissParser.wordIndicators.test.js` and the indicator-utils
 *   tests for that vocabulary.
 * - How indicators position and render in the SVG, see
 *   `ElementHandle.headIndicators.test.js`.
 */
describe('ElementHandle isIndicator API', () => {
  describe('when the handle is at part level (level 3)', () => {
    it('returns true for an indicator part of a composite glyph', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(1);
      expect(part.isIndicator).toBe(true);
    });

    it('returns false for a non-indicator part of a composite glyph', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(0);
      expect(part.isIndicator).toBe(false);
    });

    it('returns true for an indicator standalone glyph probed at part level', () => {
      const b = new BlissSVGBuilder('B86');
      const part = b.group(0).glyph(0).part(0);
      expect(part.isIndicator).toBe(true);
    });

    it('returns false for a non-indicator standalone glyph probed at part level', () => {
      const b = new BlissSVGBuilder('B291');
      const part = b.group(0).glyph(0).part(0);
      expect(part.isIndicator).toBe(false);
    });
  });

  describe('when the handle is at glyph level or higher', () => {
    it('returns false on a glyph handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const glyph = b.group(0).glyph(0);
      expect(glyph.isIndicator).toBe(false);
    });

    it('returns false on a group handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const group = b.group(0);
      expect(group.isIndicator).toBe(false);
    });
  });

  describe('when an unrelated part of the tree is mutated', () => {
    it('preserves isIndicator on a previously captured part handle', () => {
      const b = new BlissSVGBuilder('B291;B86');
      const part = b.group(0).glyph(0).part(1);
      // Mutating elsewhere (adding a glyph to the same group) must not
      // invalidate the captured part handle's isIndicator.
      b.group(0).addGlyph('H');
      expect(part.isIndicator).toBe(true);
    });
  });
});
