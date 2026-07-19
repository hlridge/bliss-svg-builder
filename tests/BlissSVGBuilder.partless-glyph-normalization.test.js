import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins object-input normalization of a degenerate partless glyph node: a glyph
 * with no `parts` array and no code identity (`{}`, `{ options }`, junk keys)
 * is the empty glyph, not a glyph that is one empty part. It normalizes to the
 * first-class `{ parts: [] }` form, so it renders invisibly and matches its
 * omitting serialization instead of warning UNKNOWN_CODE and reserving a
 * phantom advance (svg round-trip false). DSL never produces such a node, so
 * this is object-input only.
 *
 * Covers:
 * - `{}` inside a group normalizes to the empty glyph: width-neutral beside a
 *   real glyph, zero warnings, svg round-trip true, byte-identical to the
 *   first-class `{ parts: [] }` node in toString/toJSON/svg.
 * - A solo partless-glyph document renders at empty-document width and
 *   serializes to the empty string.
 * - An options-carrying partless node (`{ options: {...} }`) becomes an
 *   options-carrying empty glyph (serializes its options token, round-trips).
 * - Over-fire guards: a glyph WITH parts (single-part and multi-part without a
 *   glyph codeName) is left untouched; a code-bearing partless node keeps its
 *   UNKNOWN_CODE warning rather than being silently emptied.
 *
 * Does NOT cover:
 * - The empty-glyph LAYOUT contract (zero advance, kerning across empties),
 *   see `BlissSVGBuilder.empty-glyph-layout.test.js`.
 * - Empty GROUP (`{ glyphs: [] }`) extent, see
 *   `BlissSVGBuilder.empty-content-extent.test.js`.
 * - The pre-existing bare-codeName glyph shorthand (`{ codeName: 'B291' }`
 *   with no parts) failing to resolve as a leaf: object input, distinct bug.
 */

// Width is the third number of the svg viewBox.
const viewBoxWidth = (b) =>
  Number(b.svgCode.match(/viewBox="[^"]+ [^"]+ ([^" ]+) [^"]+"/)[1]);

const warningCodes = (b) => b.warnings.map((w) => w.code);

const realGlyph = (code) => ({ parts: [{ codeName: code }], codeName: code });

describe('BlissSVGBuilder partless glyph normalization', () => {
  describe('when a partless glyph node has no content', () => {
    it('renders a trailing `{}` glyph width-neutral with no warnings', () => {
      const withPartless = new BlissSVGBuilder({
        groups: [{ glyphs: [realGlyph('B291')] }, { glyphs: [{}] }],
      });

      expect(viewBoxWidth(withPartless)).toBe(9.5);
      expect(viewBoxWidth(withPartless)).toBe(viewBoxWidth(new BlissSVGBuilder('B291')));
      expect(warningCodes(withPartless)).toEqual([]);
    });

    it('closes the svg round-trip that the phantom advance previously broke', () => {
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [realGlyph('B291')] }, { glyphs: [{}] }],
      });

      expect(b.toString()).toBe('B291');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('matches the first-class `{ parts: [] }` node in toString, toJSON, and svg', () => {
      const partless = new BlissSVGBuilder({
        groups: [{ glyphs: [realGlyph('B291')] }, { glyphs: [{}] }],
      });
      const firstClass = new BlissSVGBuilder({
        groups: [{ glyphs: [realGlyph('B291')] }, { glyphs: [{ parts: [] }] }],
      });

      expect(partless.toString()).toBe(firstClass.toString());
      expect(partless.toJSON()).toEqual(firstClass.toJSON());
      expect(partless.svgCode).toBe(firstClass.svgCode);
    });

    it('normalizes a `{}` glyph sitting beside a real glyph in the same group', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [realGlyph('B291'), {}] }] });

      expect(viewBoxWidth(b)).toBe(9.5);
      expect(warningCodes(b)).toEqual([]);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('renders a solo partless-glyph document at empty-document width', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{}] }] });

      expect(b.toString()).toBe('');
      expect(warningCodes(b)).toEqual([]);
      expect(b.toJSON().groups[0].glyphs[0]).toEqual({ parts: [] });
    });

    it('normalizes a node whose only key is unrecognized', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ foo: 1 }] }, { glyphs: [realGlyph('B291')] }] });

      expect(viewBoxWidth(b)).toBe(9.5);
      expect(warningCodes(b)).toEqual([]);
    });
  });

  describe('when a partless glyph node carries options', () => {
    it('becomes an options-carrying empty glyph that serializes its token and round-trips', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ options: { color: 'red' } }] }] });

      expect(b.toString()).toBe('[color=red]');
      expect(warningCodes(b)).toEqual([]);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });

  describe('when a glyph node carries content', () => {
    it('leaves a single-part glyph untouched', () => {
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [realGlyph('B291')] }] });

      expect(b.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(warningCodes(b)).toEqual([]);
    });

    it('leaves a multi-part glyph with no glyph codeName untouched', () => {
      // pins the `!glyph.parts` guard: a composite glyph carries no glyph-level
      // codeName, so dropping the parts check would wrongly empty it
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'HL8', x: 0, y: 4 }, { codeName: 'VL8', x: 4, y: 0 }] }] }],
      });

      expect(b.toString()).toBe('HL8:0,4;VL8:4,0');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('keeps a code-bearing partless node visible instead of silently emptying it', () => {
      // pins the `!glyph.glyphCode` guard (visible-not-silent): a node that
      // names a code but resolves to nothing keeps its warning rather than
      // being swallowed like a truly-contentless `{}`
      const b = new BlissSVGBuilder({ groups: [{ glyphs: [{ codeName: 'B291' }] }] });

      expect(warningCodes(b)).toContain('UNKNOWN_CODE');
    });
  });
});
