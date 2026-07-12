import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the render-only `attributes` bag on ElementHandle: attributes render to
 * the SVG `<g>`/path wrapper but are excluded from every serialization path
 * (`toString()`, `toJSON()`). The bag is stored RAW and escaped exactly once
 * on the rebuild clone (mirroring `setOptions`'s raw->escape-once flow), so
 * repeated rebuilds never compound HTML escapes.
 *
 * Covers:
 * - `setAttributes` renders to the SVG output (test 1).
 * - `toString()` and `toJSON()` (default + `{ preserve: true }` + `{ deep: true }`)
 *   exclude `attributes` and any attribute values (tests 2-4).
 * - `removeAttributes` drops an attribute from the SVG (test 5).
 * - `setAttributes` + `setOptions` coexist: both render, only options serialize
 *   (test 6).
 * - Round-trip via constructor: `new BlissSVGBuilder(toJSON())` carries no
 *   `attributes` and its `toString()` is clean (test 7).
 * - XSS boundary: unsafe attribute names (`on*`) are rejected with a warning;
 *   string values with `"`/`<` are HTML-escaped exactly once (test 8).
 * - Idempotency: repeated `setAttributes` + rebuild never compounds escapes
 *   (test 9 — pins the C1 escape-once fix).
 * - Collision precedence: when the same attribute name is set via both
 *   `setAttributes` and `setOptions`, the options value wins (test 10 — pins
 *   the merge order in `#separateAnchorAndGroupOptions`).
 * - Object-input constructor with raw `attributes` on a part: `#processAttributes`
 *   escapes values exactly once on the rebuild clone, independent of
 *   `setAttributes` (test 11 — pins the escape point for the constructor path;
 *   catches the "escape moved to setAttributes, #processAttributes deleted"
 *   mutant that test 9 misses because it re-applies the same raw value).
 * - Object-input constructor with an unsafe attribute name (`on*`): the
 *   render-path `isSafeAttributeName` check in `#separateAnchorAndGroupOptions`
 *   rejects it (test 12 — pins the defense-in-depth check that `setAttributes`
 *   alone cannot exercise, since `setAttributes` rejects unsafe names before
 *   they reach the node).
 *
 * Does NOT cover:
 * - General `setOptions`/`removeOptions` behavior, see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - The full option-collision dedup matrix (alias vs explicit), see
 *   `BlissSVGBuilder.attribute-collisions.test.js`.
 * - Attribute rendering at the sentence (level 0) scope — sentence-level
 *   carries no part attributes by design (only anchor attrs pass through).
 */

describe('ElementHandle render-only attributes', () => {

  describe('when setAttributes renders to the SVG', () => {
    it('emits the attribute on the part <g> wrapper', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });

      // pins: render-only attributes reach the SVG output
      expect(b.svgCode).toContain('<g data-draggable="true">');
    });
  });

  describe('when toString serializes the builder', () => {
    it('excludes render-only attributes from the DSL string', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });

      // pins: the core invariant — attributes never leak into serialization
      expect(b.toString()).not.toContain('data-draggable');
    });
  });

  describe('when toJSON serializes with preserve true', () => {
    it('excludes the attributes field and attribute values from options', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });
      const json = b.toJSON({ preserve: true });
      const part = json.groups[0].glyphs[0].parts[0];

      expect(part.attributes).toBeUndefined();
      expect(part.options?.['data-draggable']).toBeUndefined();
    });
  });

  describe('when toJSON serializes with deep true', () => {
    it('excludes the attributes field from the deep object', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });
      const json = b.toJSON({ deep: true });
      const part = json.groups[0].glyphs[0].parts[0];

      // pins: the toString path goes through toJSON({deep:true})
      expect(part.attributes).toBeUndefined();
    });
  });

  describe('when removeAttributes drops a key', () => {
    it('removes the attribute from the rendered SVG', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });
      b.part(0).removeAttributes('data-draggable');

      expect(b.svgCode).not.toContain('data-draggable');
    });
  });

  describe('when setAttributes and setOptions coexist on the same part', () => {
    it('renders both but serializes only the option', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });
      b.part(0).setOptions({ 'data-preview': 'true' });
      const svg = b.svgCode;
      const dsl = b.toString();

      // pins: both render to SVG
      expect(svg).toContain('data-draggable="true"');
      expect(svg).toContain('data-preview="true"');
      // pins: only the option serializes
      expect(dsl).toContain('[data-preview=true]');
      expect(dsl).not.toContain('data-draggable');
    });
  });

  describe('when round-tripping through the constructor', () => {
    it('produces a clean builder with no attributes and a clean toString', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'data-draggable': 'true' });
      const json = b.toJSON({ preserve: true });
      const roundTripped = new BlissSVGBuilder(json);

      expect(roundTripped.toJSON({ preserve: true }).groups[0].glyphs[0].parts[0].attributes).toBeUndefined();
      expect(roundTripped.toString()).not.toContain('data-draggable');
    });
  });

  describe('when validating the XSS boundary', () => {
    it('rejects unsafe attribute names and escapes special characters in values once', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({
        'on-click': 'x',
        'data-label': 'a"b<c',
      });
      const svg = b.svgCode;

      // pins: on* event handler names are rejected (never rendered)
      expect(svg).not.toContain('on-click');
      // pins: special characters are HTML-escaped exactly once
      expect(svg).toContain('data-label="a&quot;b&lt;c"');
      expect(svg).not.toContain('data-label="a"');
      // pins: the rejection surfaces as a builder warning
      expect(b.warnings.some(w => w.source === 'on-click')).toBe(true);
    });
  });

  describe('when setAttributes is reapplied after a rebuild', () => {
    it('does not compound HTML escapes across repeated rebuilds', () => {
      const b = new BlissSVGBuilder('B313');
      // First set + a mutation triggers #rebuild (structuredClone + #processAllOptions)
      b.part(0).setAttributes({ 'data-x': 'a&b' });
      b.addGlyph('B431');
      // Re-apply the same raw value — #processAttributes escapes the raw value
      // on the rebuild clone, so the stored raw is never double-escaped.
      b.part(0).setAttributes({ 'data-x': 'a&b' });

      // pins C1: exactly one escape pass, never compounded
      expect(b.svgCode).toContain('data-x="a&amp;b"');
      expect(b.svgCode).not.toContain('a&amp;amp;b');
    });
  });

  describe('when an attribute collides with an option of the same name', () => {
    it('lets the option value win in the rendered SVG', () => {
      const b = new BlissSVGBuilder('B313');
      b.part(0).setAttributes({ 'stroke': 'red' });
      b.part(0).setOptions({ 'stroke': 'blue' });
      const svg = b.svgCode;

      // pins: options are semantic and win on collision; attributes are additive
      expect(svg).toContain('stroke="blue"');
      expect(svg).not.toContain('stroke="red"');
    });
  });

  describe('when the constructor receives object input with raw attributes', () => {
    it('escapes attribute values exactly once via #processAttributes', () => {
      // Object input bypasses setAttributes — the constructor does
      // structuredClone(raw) then #processAllOptions, which calls
      // #processAttributes on the rebuild clone. If #processAttributes were
      // deleted (the "escape moved to setAttributes" mutant), these raw
      // values would render UNESCAPED. Test 9 misses this because it
      // re-applies the same raw value via setAttributes, masking the gap.
      const b = new BlissSVGBuilder({
        groups: [{
          glyphs: [{
            parts: [{
              codeName: 'B313',
              attributes: { 'data-x': 'a&b' },
            }],
          }],
        }],
      });

      // pins: #processAttributes is the escape point for the constructor path
      expect(b.svgCode).toContain('data-x="a&amp;b"');
      expect(b.svgCode).not.toContain('a&amp;amp;b');
      // pins: attributes are still render-only — toString is clean
      expect(b.toString()).not.toContain('data-x');
    });
  });

  describe('when the constructor receives object input with an unsafe attribute name', () => {
    it('rejects the unsafe name via the render-path isSafeAttributeName check', () => {
      // setAttributes rejects unsafe names before they reach the node, so the
      // render-path `isSafeAttributeName` check in #separateAnchorAndGroupOptions
      // is a no-op for the public API. Object input with hand-authored
      // attributes is the only path that exercises this defense-in-depth.
      const b = new BlissSVGBuilder({
        groups: [{
          glyphs: [{
            parts: [{
              codeName: 'B313',
              attributes: { 'on-click': 'x', 'data-safe': 'ok' },
            }],
          }],
        }],
      });

      // pins: on* event handler names never reach the SVG
      expect(b.svgCode).not.toContain('on-click');
      // pins: safe attribute names still render
      expect(b.svgCode).toContain('data-safe="ok"');
    });
  });
});
