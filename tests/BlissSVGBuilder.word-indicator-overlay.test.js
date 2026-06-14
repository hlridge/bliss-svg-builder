import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the R14 word-level indicator overlay integration at the builder
 * boundary: the overlay stored by the parser is resolved onto the head at
 * render (site 1), survives a default toJSON->constructor round-trip
 * (authoring-faithful ingestion), and the overlay-injected head part is not
 * handle-addressable (it has no raw node).
 *
 * Covers:
 * - Site-1 resolve invariant: a `;;` head's resolved snapshot parts equal the
 *   base parts plus the resolved indicator parts (append-trailing), so the
 *   render-path readers that index the resolved head cannot silently regress.
 * - Constructor ingestion: default toJSON carries `group.wordIndicators`, and
 *   rebuilding from it renders identically and re-emits `;;` (authoring-faithful
 *   default round-trip).
 * - getElementByKey on a `;;` head: base parts stay addressable by key; the
 *   overlay-injected indicator part returns null (lives only in the resolved
 *   tree, no raw node to mutate).
 *
 * Does NOT cover:
 * - Parser store shape and head targeting, see
 *   `BlissParser.double-semicolon.test.js`.
 * - toString/preserve round-trip families, see
 *   `BlissSVGBuilder.indicator-round-trip.test.js`.
 * - General getElementByKey behavior, see
 *   `BlissSVGBuilder.element-keys.test.js`.
 */
describe('BlissSVGBuilder word-indicator overlay', () => {
  const headGlyphSnap = (builder) =>
    builder.snapshot().children[0].children.filter(c => c.isGlyph)[0];

  describe('when the overlay resolves onto the head at render', () => {
    it('appends the indicator after the base parts on the resolved head', () => {
      // B313 head (1 base part) + 1 word indicator = 2 resolved parts.
      const head = headGlyphSnap(new BlissSVGBuilder('B313/B1103;;B81'));
      expect(head.children.map(p => p.codeName)).toEqual(['B313', 'B81']);
      expect(head.children[head.children.length - 1].isIndicator).toBe(true);
    });

    it('keeps a retained char-level semantic ahead of the resolved word indicator', () => {
      // B303;B97 head: base keeps B97; the verbal B81 overlay resolves before it.
      const head = headGlyphSnap(new BlissSVGBuilder('B303;B97/C;;B81'));
      expect(head.children.map(p => p.codeName)).toEqual(['B303', 'B81', 'B97']);
    });
  });

  describe('when rebuilding from a default toJSON snapshot', () => {
    it('carries the overlay field on the group', () => {
      const json = new BlissSVGBuilder('B313/B1103;;B81').toJSON();
      expect(json.groups[0].wordIndicators).toEqual({ codes: ['B81'], stripSemantic: false });
    });

    it('renders identically and re-emits the ;; (authoring-faithful round-trip)', () => {
      const original = new BlissSVGBuilder('B313/B1103;;B81');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
      expect(rebuilt.toString()).toBe('B313/B1103;;B81');
    });

    it('ingests a single-glyph strip overlay reversibly', () => {
      const original = new BlissSVGBuilder('B303;B97;;!B86');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
      expect(rebuilt.toString()).toBe('B303;B97;;!B86');
    });
  });

  describe('when addressing parts of a ;; head by key', () => {
    it('resolves a base part to a live handle', () => {
      const builder = new BlissSVGBuilder('B313/B1103;;B81');
      const baseKey = headGlyphSnap(builder).children[0].key;
      const handle = builder.getElementByKey(baseKey);
      expect(handle).not.toBeNull();
      expect(() => handle.measure()).not.toThrow();
    });

    it('returns null for the overlay-injected indicator part', () => {
      const builder = new BlissSVGBuilder('B313/B1103;;B81');
      const parts = headGlyphSnap(builder).children;
      const overlayPart = parts.find(p => p.isIndicator);
      expect(builder.getElementByKey(overlayPart.key)).toBeNull();
    });
  });
});
