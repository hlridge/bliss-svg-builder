import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that mutation methods parsing DSL strings (addPart, addGlyph,
 * insertGlyph, character-level applyIndicators) forward the parse's warnings
 * to `builder.warnings` instead of discarding them with the scaffold parse.
 * Without forwarding, the global-only option key gate (MISPLACED_GLOBAL_OPTION)
 * would drop a key from an API-supplied string SILENTLY.
 *
 * Covers:
 * - addPart / insertGlyph-family / character-level applyIndicators strings
 *   carrying a global-only key: the key is dropped AND the warning surfaces
 *   (exactly once) on builder.warnings, persisting across rebuilds.
 * - Valid option keys in the same string survive the drop.
 * - Clean mutation strings add no warnings.
 * - The group-overlay applyIndicators boundary: the overlay stores its code
 *   verbatim (no parse at store time), so the warning surfaces only at the
 *   next parse of the serialized form.
 *
 * Does NOT cover:
 * - The key gate's own semantics (level rules, curated set), see
 *   `BlissParser.global-option-scope.test.js`.
 * - setOptions / object input (no DSL parse involved; boundary pinned in the
 *   same file's API-boundary describe).
 * - Warning forwarding for other warning classes (none of the other parse
 *   warnings arises from a single-part mutation string today; forwarding is
 *   generic by construction).
 */
describe('ElementHandle mutation parse warnings', () => {
  const build = (input) => new BlissSVGBuilder(input);

  describe('when addPart parses a code carrying a global-only key', () => {
    it('surfaces MISPLACED_GLOBAL_OPTION once and drops the key', () => {
      const builder = build('H;B81');
      builder.glyph(0).addPart('[margin=2]>B97');
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(builder.toString()).toBe('H;B81;B97');
    });

    it('keeps the valid option keys of the same bracket', () => {
      const builder = build('H;B81');
      builder.glyph(0).addPart('[margin=2;color=red]>B97');
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(builder.toString()).toBe('H;B81;[color=red]>B97');
    });

    it('persists the warning across a later rebuild', () => {
      const builder = build('H;B81');
      builder.glyph(0).addPart('[margin=2]>B97');
      builder.glyph(0).setOptions({ color: 'blue' });
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
    });
  });

  describe('when addGlyph parses a code carrying a global-only key', () => {
    it('surfaces the warning and drops the key', () => {
      const builder = build('B291');
      builder.group(0).addGlyph('[margin=2]C8');
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(builder.toString()).toBe('B291/C8');
    });
  });

  describe('when character-level applyIndicators parses an option-prefixed indicator', () => {
    it('surfaces the warning and bakes the indicator without the key', () => {
      const builder = build('B291');
      builder.glyph(0).applyIndicators('[margin=2]>B81');
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(builder.toString()).toBe('B291;B81');
    });

    it('keeps a valid option key on the baked indicator', () => {
      const builder = build('B291');
      builder.glyph(0).applyIndicators('[margin=2;color=red]>B81');
      expect(builder.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(builder.toString()).toBe('B291;[color=red]>B81');
    });
  });

  describe('when a mutation string parses clean', () => {
    it('adds no warnings', () => {
      const builder = build('H;B81');
      builder.glyph(0).addPart('[color=red]>B97');
      builder.group(0).addGlyph('C8');
      expect(builder.warnings).toEqual([]);
    });
  });

  describe('when the group overlay stores an option-prefixed code', () => {
    it('defers the warning to the next parse of the serialized form', () => {
      // pins the scope boundary: the ;; overlay stores code strings verbatim
      // (SIB-2) with no parse at store time, so the API call itself cannot
      // warn; the parser's ;; gate strips + warns when the serialized form is
      // next parsed.
      const builder = build('B303');
      builder.group(0).applyIndicators('[margin=2]>B81');
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B303;;[margin=2]>B81');
      const reparsed = build(builder.toString());
      expect(reparsed.warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      expect(reparsed.toString()).toBe('B303;;B81');
    });
  });
});
