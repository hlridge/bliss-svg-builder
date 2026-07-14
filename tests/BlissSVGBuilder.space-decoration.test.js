import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index';

/**
 * Pins the space-decoration contract: a TSP/QSP space is a pure word-separator
 * and cannot carry a coordinate or an option. A coordinate (`:x,y`) or an option
 * (`[opts]` at any scope) on a space is dropped with a MISPLACED_SPACE_DECORATION
 * warning; the space keeps its identity (a QSP stays a quarter-space, a TSP the
 * default `//`) so render / toString / toJSON no longer diverge. ZSA is content
 * and keeps its coordinate and options untouched. Kerning on a space glyph is
 * preserved (the RK/AK-around-spaces question is separate and backlogged).
 *
 * Covers:
 * - Standalone QSP/TSP with a coordinate: dropped + warned, identity kept, and
 *   the svg round-trip becomes true (the reported `QSP:1,2` -> `//` loss).
 * - An option on a space at every scope (word `[o]|`, character `[o]`, part
 *   `[o]>`): dropped + warned; no empty styled `<g>` is emitted.
 * - Coordinate and option together: two warnings, both dropped.
 * - Multiple decorated spaces, and an inline decorated space (the rule applies
 *   to every space, not only a standalone one).
 * - Object-input and mutation (`addGroup`) parity with the DSL surface.
 * - Controls: plain QSP / `//` unchanged and unwarned; ZSA keeps its
 *   coordinate/option (content); kerning survives the coordinate strip.
 *
 * Does NOT cover:
 * - ZSA classification/counting, see `BlissSVGBuilder.space-classifier.test.js`.
 * - The word-space / RK-AK-after-space sizing question (backlog).
 * - A space-LED multi-part glyph (`{parts:[TSP, B291]}`), never a space node;
 *   see `BlissSVGBuilder.space-invariant.test.js`.
 */

const SPACE_DECORATION = 'MISPLACED_SPACE_DECORATION';

const roundTripsSvg = (input) => {
  const b = new BlissSVGBuilder(input);
  return b.svgCode === new BlissSVGBuilder(b.toString()).svgCode;
};

describe('BlissSVGBuilder space decoration', () => {
  describe('when a standalone space carries a coordinate', () => {
    it('drops the coordinate from a QSP and keeps the quarter-space identity', () => {
      const b = new BlissSVGBuilder('QSP:1,2');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings).toEqual([
        { code: SPACE_DECORATION, message: expect.stringContaining('coordinate'), source: ':1,2' },
      ]);
      // pins identity-kept: the bared QSP must re-flag _differsFromDefault or it
      // would serialize to the default '//' (the reported quarter-space loss).
    });

    it('drops the coordinate from a TSP and keeps the default space', () => {
      const b = new BlissSVGBuilder('TSP:1,2');
      expect(b.toString()).toBe('//');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });

    it('renders a coordinate-bearing space identically to the bare space', () => {
      // pins the coordinate no longer stretches the bounding box at an edge.
      expect(new BlissSVGBuilder('QSP:5,0').svgCode).toBe(new BlissSVGBuilder('QSP').svgCode);
    });

    it('makes a coordinate-bearing space round-trip its svg', () => {
      expect(roundTripsSvg('QSP:1,2')).toBe(true);
      expect(roundTripsSvg('TSP:1,2')).toBe(true);
    });

    it('drops an explicit zero coordinate without warning', () => {
      // `:0,0` is a no-op coordinate, normalized away like content's `:0,0`; the
      // identity is still preserved (QSP, not //), but nothing meaningful drops.
      const b = new BlissSVGBuilder('QSP:0,0');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when a standalone space carries an option', () => {
    it('drops a word-scope option from a QSP and warns', () => {
      const b = new BlissSVGBuilder('[color=red]|QSP');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings).toEqual([
        { code: SPACE_DECORATION, message: expect.stringContaining('option'), source: '[color=red]' },
      ]);
    });

    it('drops a character-scope option from a QSP and warns', () => {
      const b = new BlissSVGBuilder('[color=red]QSP');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });

    it('drops a part-scope option from a QSP and warns', () => {
      const b = new BlissSVGBuilder('[color=red]>QSP');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });

    it('drops a word-scope option from a TSP and warns', () => {
      const b = new BlissSVGBuilder('[color=red]|TSP');
      expect(b.toString()).toBe('//');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });

    it('emits no styled group for an option-bearing space', () => {
      // pins the empty <g stroke="red"> DOM node is gone: renders like a plain space.
      const b = new BlissSVGBuilder('[color=red]|QSP');
      expect(b.svgCode).not.toContain('stroke="red"');
      expect(b.svgCode).toBe(new BlissSVGBuilder('QSP').svgCode);
    });
  });

  describe('when a space carries both a coordinate and an option', () => {
    it('drops both and emits one warning per dropped decoration', () => {
      const b = new BlissSVGBuilder('[color=red]|QSP:1,2');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION, SPACE_DECORATION]);
      expect(b.warnings.map(w => w.source).sort()).toEqual([':1,2', '[color=red]']);
    });
  });

  describe('when several spaces or an inline space are decorated', () => {
    it('drops the coordinate from every space in a run', () => {
      const b = new BlissSVGBuilder('QSP:1,2/QSP:3,4');
      expect(b.toString()).toBe('QSP/QSP');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION, SPACE_DECORATION]);
      expect(roundTripsSvg('QSP:1,2/QSP:3,4')).toBe(true);
    });

    it('drops the coordinate from an inline space between two words', () => {
      const b = new BlissSVGBuilder('B291/QSP:1,2/C8');
      expect(b.toString()).toBe('B291/QSP/C8');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
      expect(roundTripsSvg('B291/QSP:1,2/C8')).toBe(true);
    });
  });

  describe('when the decoration arrives via object input or mutation', () => {
    it('drops a coordinate supplied through object input', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'QSP', x: 1, y: 2 }] }] }] });
      expect(b.toString()).toBe('QSP');
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });

    it('drops a coordinate supplied through addGroup', () => {
      // pins the mutation path warns and drops the coordinate too; asserted via
      // render parity to avoid coupling to raw-API adjacency serialization (a
      // separate concern, backlog: adjacent content/space groups re-merge).
      const withCoord = new BlissSVGBuilder('B291').addGroup('QSP:1,2');
      const withoutCoord = new BlissSVGBuilder('B291').addGroup('QSP');
      expect(withCoord.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
      expect(withCoord.svgCode).toBe(withoutCoord.svgCode);
    });
  });

  describe('when the space is plain', () => {
    it('leaves a bare QSP unchanged and unwarned', () => {
      const b = new BlissSVGBuilder('QSP');
      expect(b.toString()).toBe('QSP');
      expect(b.warnings).toEqual([]);
    });

    it('leaves a default space run unchanged and unwarned', () => {
      const b = new BlissSVGBuilder('TSP/TSP');
      expect(b.toString()).toBe('///');
      expect(b.warnings).toEqual([]);
    });

    it('leaves an inline space word unchanged and unwarned', () => {
      const b = new BlissSVGBuilder('B291//C8');
      expect(b.toString()).toBe('B291//C8');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when the target is a ZSA (content, not a space)', () => {
    it('keeps a coordinate on a ZSA', () => {
      // regression guard: ZSA is content, positionable; the strip must exclude it.
      const b = new BlissSVGBuilder('ZSA:1,2');
      expect(b.toString()).toBe('ZSA:1,2');
      expect(b.warnings).toEqual([]);
    });

    it('keeps an option on a ZSA', () => {
      const b = new BlissSVGBuilder('[color=red]|ZSA');
      expect(b.toString()).toBe('[color=red]|ZSA');
      expect(b.warnings).toEqual([]);
    });
  });

  describe('when a space glyph carries kerning', () => {
    it('spares the kerning while dropping the coordinate', () => {
      // pins that the strip spares GLYPH_INTERNAL_KEYS (relative/absolute
      // kerning) and drops only the coordinate. Asserted on toJSON: whether a
      // space-glyph's kerning survives toString is the separate RK/AK-around-
      // spaces question (backlog), untouched here.
      const b = new BlissSVGBuilder('RK:0.5/QSP:1,2');
      const glyph = b.toJSON().groups[0].glyphs[0];
      expect(glyph.options?.relativeKerning).toBe(0.5);
      expect(glyph.parts[0].x).toBeUndefined();
      expect(b.warnings.map(w => w.code)).toEqual([SPACE_DECORATION]);
    });
  });
});
