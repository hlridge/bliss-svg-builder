import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the terminal-word rule for fail-flagged words (a malformed `;;` sets
 * group.errorCode): the word renders as a single placeholder and toString
 * replays its stored errorSource verbatim, so EVERY content mutation — on the
 * group handle and on child glyph/part handles inside it — silently no-ops,
 * matching the shipped splitAt/mergeWithNext terminal arms ("terminal; only
 * replaceGroup recovers"). Without the gate the live tree mutated while the
 * serialization stayed frozen (round-2 external review F5).
 *
 * Covers:
 * - Group content mutators no-op: addGlyph, insertGlyph, removeGlyph,
 *   replaceGlyph, addPart, insertPart, applyIndicators, clearIndicators —
 *   toString, toJSON, and the warning count are unchanged (silent, matching
 *   splitAt).
 * - Child handles inside the failed word no-op the same way: glyph-level
 *   applyIndicators/clearIndicators, part add/insert/remove/replace, replace,
 *   setOptions/removeOptions, detach, remove; also part-level handles.
 * - The documented exemptions: group setOptions/removeOptions still apply
 *   (group options serialize OUTSIDE the error source, `[opts]|errorSource`,
 *   and round-trip); detach removes the whole failed word; replaceGroup
 *   replaces it (recovery).
 *
 * Does NOT cover:
 * - The splitAt / mergeWithNext terminal arms themselves (shipped pre-rc.4),
 *   see `ElementHandle.word-indicator-structure.test.js`.
 * - How a word becomes fail-flagged and its fail-render, see
 *   `BlissParser.double-semicolon.test.js` and
 *   `BlissElement.error-placeholder.test.js`.
 */

// One MALFORMED_WORD_INDICATOR parse warning is the fixture's baseline state.
const failedWord = () => new BlissSVGBuilder('B291;;B81;;B86');

const stateOf = (b) => ({
  str: b.toString(),
  json: JSON.stringify(b.toJSON()),
  warningCount: b.warnings.length,
});

describe('ElementHandle failed-word mutation', () => {
  describe('when content mutators target the fail-flagged group handle', () => {
    it.each([
      ['addGlyph', (g) => g.addGlyph('B313')],
      ['insertGlyph', (g) => g.insertGlyph(0, 'B313')],
      ['removeGlyph', (g) => g.removeGlyph(0)],
      ['replaceGlyph', (g) => g.replaceGlyph(0, 'B313')],
      ['addPart', (g) => g.addPart('B81')],
      ['insertPart', (g) => g.insertPart(0, 'B81')],
      ['applyIndicators', (g) => g.applyIndicators('B81')],
      ['clearIndicators', (g) => g.clearIndicators()],
    ])('%s is a silent no-op that keeps toString and toJSON in agreement', (_name, mutate) => {
      const b = failedWord();
      const before = stateOf(b);
      mutate(b.group(0));
      expect(stateOf(b)).toEqual(before);
      expect(b.toString()).toBe('B291;;B81;;B86');
    });
  });

  describe('when content mutators target a child handle inside the failed word', () => {
    it.each([
      ['glyph applyIndicators', (b) => b.glyph(0).applyIndicators('B86')],
      ['glyph clearIndicators', (b) => b.glyph(0).clearIndicators()],
      ['glyph addPart', (b) => b.glyph(0).addPart('B81')],
      ['glyph insertPart', (b) => b.glyph(0).insertPart(0, 'B81')],
      ['glyph removePart', (b) => b.glyph(0).removePart(0)],
      ['glyph replacePart', (b) => b.glyph(0).replacePart(0, 'B313')],
      ['glyph replace', (b) => b.glyph(0).replace('B313')],
      ['glyph setOptions', (b) => b.glyph(0).setOptions({ color: 'red' })],
      ['glyph removeOptions', (b) => b.glyph(0).removeOptions('color')],
      ['glyph detach', (b) => b.glyph(0).detach()],
      ['glyph remove', (b) => b.glyph(0).remove()],
      ['part replace', (b) => b.glyph(0).part(0).replace('B313')],
      ['part setOptions', (b) => b.glyph(0).part(0).setOptions({ color: 'red' })],
      ['part detach', (b) => b.glyph(0).part(0).detach()],
      ['part remove', (b) => b.glyph(0).part(0).remove()],
    ])('%s is a silent no-op that keeps the stored error source intact', (_name, mutate) => {
      // Child mutations changed the hidden glyphs while toString kept
      // replaying errorSource: the same divergence one level down.
      const b = failedWord();
      const before = stateOf(b);
      mutate(b);
      expect(stateOf(b)).toEqual(before);
    });
  });

  describe('when the exempt operations target the fail-flagged word', () => {
    it('group setOptions applies and round-trips outside the error source', () => {
      const b = failedWord();
      b.group(0).setOptions({ color: 'red' });
      expect(b.toString()).toBe('[color=red]|B291;;B81;;B86');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.svgCode).toBe(b.svgCode);
      expect(reparsed.toJSON().groups[0].options).toEqual({ color: 'red' });
    });

    it('group removeOptions applies too (the undo of the exempt setOptions)', () => {
      const b = failedWord();
      b.group(0).setOptions({ color: 'red' });
      b.group(0).removeOptions('color');
      expect(b.toString()).toBe('B291;;B81;;B86');
    });

    it('group detach removes the whole failed word (recovery by removal)', () => {
      const b = new BlissSVGBuilder('B313//B291;;B81;;B86');
      b.group(1).detach();
      expect(b.toString()).toBe('B313//');
    });

    it('replaceGroup replaces the failed word (the recovery path)', () => {
      const b = failedWord();
      b.replaceGroup(0, 'B313;;B81');
      expect(b.toString()).toBe('B313;;B81');
      expect(b.toJSON().groups[0].errorCode).toBeUndefined();
    });
  });
});
