import { describe, it, expect } from 'vitest';
import { hasPathData, createTextFallbackGlyph } from '../src/lib/bliss-shape-creators.js';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the text-fallback rendering path: characters with hardcoded SVG path
 * data render via <path>, characters without fall back to a single <text>
 * element. The boundary is `hasPathData`, the fallback constructor is
 * `createTextFallbackGlyph`, and the user-visible surface is the X-prefix
 * DSL (Xhello, Xα, Xc/Xa/Xf/Xé, Xhello//Xpiǎ).
 *
 * Covers:
 * - `hasPathData` predicate across the hardcoded character set (ASCII a-z /
 *   A-Z, Swedish å/ä/ö/Å/Ä/Ö, Latin Extended é/ñ/ü/ç, Cyrillic) and outside
 *   it (Greek, CJK).
 * - `createTextFallbackGlyph` shape: getPath emits a <text> element with
 *   font-family + color; single-char glyphs carry `char` + `glyphCode`,
 *   multi-char glyphs carry only an alias-style `codeName` (`XTXT_<str>`).
 * - Builder rendering of X-prefixed multi-character strings (Xhello → 5
 *   paths, Xα → 1 text, Xcafé → 4 paths) and explicit X-code sequences
 *   joined by `/` (Xh/Xα/Xl/Xl/Xo collapses to 1 text since one char lacks
 *   hardcoded data; Xh/Xe/Xl/Xl/Xo → 5 paths).
 * - Hardcoded diacritic letters (é/ñ/ü/ç/å/Å) render as <path>, never
 *   <text>; kerning is intact (monotonically increasing x-coordinates
 *   across the glyphs of Xcafé).
 * - Out-of-range X-prefix inputs (Xǎ, Xǔ, Xḿ; mid-word Xpiǎ; cross-word
 *   Xhello//Xpiǎ) are surfaced as UNKNOWN_CODE warnings rather than
 *   silently dropped.
 * - Round-trip of partial-fallback inputs through `toJSON` preserves
 *   the rendered SVG byte-identically.
 *
 * Does NOT cover:
 * - XTXT_ singleton isolation across builders (state-isolation across the
 *   global definitions registry), see
 *   `BlissSVGBuilder.round-trip.test.js` describe-path
 *   `... > when XTXT_ inputs round-trip without polluting global state`.
 * - External glyph rendering for non-text X-codes (the canonical Xa
 *   single-char form is touched here as a regression check; the broader
 *   external-glyph contract lives in `BlissSVGBuilder.external-glyphs.test.js`).
 * - Wider X-prefix character coverage: the desired XTXT-fallback contract
 *   for characters outside the parser's accepted ranges (Latin Extended-B+,
 *   CJK, etc.) is captured as it.todo placeholders in the
 *   `when a base+diacritic combination lies outside the supported
 *   X-prefix character set` describe; tracked at issue #26.
 * - Expanding the hardcoded path-data set to cover more diacritic
 *   variants (a separate, future task; not currently prioritized).
 */
describe('BlissSVGBuilder text fallback', () => {
  const renderSvg = (input) => new BlissSVGBuilder(input).svgCode;
  const externalGlyphPaths = (svg) => svg.match(/<path[^>]*stroke="none"[^>]*>/g) ?? [];
  const externalGlyphPathDs = (svg) => [...svg.matchAll(/<path[^>]*stroke="none"[^>]*d="([^"]+)"/g)];
  const firstMx = (d) => {
    const m = d.match(/M(-?\d+\.?\d*),/);
    return m ? parseFloat(m[1]) : null;
  };

  describe('when checking hasPathData for individual characters', () => {
    it('reports true for hardcoded ASCII lowercase characters', () => {
      expect(hasPathData('a')).toBe(true);
      expect(hasPathData('z')).toBe(true);
      expect(hasPathData('m')).toBe(true);
    });

    it('reports true for hardcoded ASCII uppercase characters', () => {
      expect(hasPathData('A')).toBe(true);
      expect(hasPathData('Z')).toBe(true);
    });

    it('reports true for hardcoded Swedish characters (å/ä/ö/Å/Ä/Ö)', () => {
      expect(hasPathData('å')).toBe(true);
      expect(hasPathData('ä')).toBe(true);
      expect(hasPathData('ö')).toBe(true);
      expect(hasPathData('Å')).toBe(true);
      expect(hasPathData('Ä')).toBe(true);
      expect(hasPathData('Ö')).toBe(true);
    });

    it('reports false for characters not in the hardcoded set', () => {
      expect(hasPathData('α')).toBe(false); // Greek alpha
      expect(hasPathData('β')).toBe(false); // Greek beta
      expect(hasPathData('漢')).toBe(false); // Chinese
      expect(hasPathData('あ')).toBe(false); // Japanese hiragana
    });

    it('reports true for hardcoded Latin Extended characters', () => {
      expect(hasPathData('é')).toBe(true);
      expect(hasPathData('ñ')).toBe(true);
      expect(hasPathData('ü')).toBe(true);
      expect(hasPathData('ç')).toBe(true);
    });

    it('reports true for hardcoded Cyrillic characters', () => {
      expect(hasPathData('я')).toBe(true);
      expect(hasPathData('б')).toBe(true);
      expect(hasPathData('Ж')).toBe(true);
    });
  });

  describe('when creating a text fallback glyph directly', () => {
    it('returns a glyph object with required properties for a single character', () => {
      const glyph = createTextFallbackGlyph('é');
      expect(glyph).toHaveProperty('getPath');
      expect(glyph).toHaveProperty('width');
      expect(glyph).toHaveProperty('height');
      expect(glyph).toHaveProperty('isExternalGlyph', true);
      expect(glyph).toHaveProperty('char', 'é');
    });

    it('emits an SVG <text> element from getPath', () => {
      const glyph = createTextFallbackGlyph('é');
      const pathOutput = glyph.getPath(0, 0, {});
      expect(pathOutput).toContain('<text');
      expect(pathOutput).toContain('é');
      expect(pathOutput).toContain('font-family=');
      expect(pathOutput).toContain('</text>');
    });

    it('applies the color option to the rendered text element', () => {
      const glyph = createTextFallbackGlyph('ñ');
      const pathOutput = glyph.getPath(0, 0, { color: 'red' });
      expect(pathOutput).toContain('fill="red"');
    });

    it('exposes only an alias-style codeName (no char, no glyphCode) for multi-character strings', () => {
      const glyph = createTextFallbackGlyph('héllo');
      const pathOutput = glyph.getPath(0, 0, {});
      expect(pathOutput).toContain('héllo');
      // Multi-char text fallback isn't a single glyph: no `char`, no
      // `glyphCode`. Identity is carried by an alias-style `codeName`.
      expect(glyph.char).toBeUndefined();
      expect(glyph.glyphCode).toBeUndefined();
      expect(glyph.codeName).toBe('XTXT_héllo');
    });
  });

  describe('when rendering X-prefixed multi-character strings via the builder', () => {
    it('renders Xhello as five path elements (all chars have hardcoded data)', () => {
      const svg = renderSvg('Xhello');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xhéllo as five path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xhéllo');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xα as a single text element since Greek alpha lacks hardcoded data', () => {
      const svg = renderSvg('Xα');
      expect(svg).toContain('<text');
      expect(svg).toContain('α');
    });

    it('renders Xcafé as path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xcafé');
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('keeps the existing Xa single-character syntax rendering as path', () => {
      const svg = renderSvg('Xa');
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('renders Xhello with monotonically increasing x-coordinates per glyph', () => {
      const svg = renderSvg('Xhello');
      const paths = externalGlyphPathDs(svg);
      expect(paths).toHaveLength(5);
      const xCoords = paths.map(m => firstMx(m[1]));
      for (let i = 1; i < xCoords.length; i++) {
        expect(xCoords[i]).toBeGreaterThan(xCoords[i - 1]);
      }
    });
  });

  describe('when rendering explicit X-code sequences joined by /', () => {
    it('renders Xh/Xα/Xl/Xl/Xo as a single text element since one char lacks hardcoded data', () => {
      const svg = renderSvg('Xh/Xα/Xl/Xl/Xo');
      expect(svg).toContain('<text');
      expect(svg).toContain('hαllo');
      expect(svg).not.toMatch(/<path[^>]*stroke="none"[^>]*>/);
    });

    it('renders Xh/Xe/Xl/Xl/Xo as five path elements when all chars have hardcoded data', () => {
      const svg = renderSvg('Xh/Xe/Xl/Xl/Xo');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xc/Xa/Xf/Xé as four path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xc/Xa/Xf/Xé');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(4);
    });
  });

  describe('when rendering hardcoded diacritic letters', () => {
    it.each([
      ['Xé'],
      ['Xñ'],
      ['Xü'],
      ['Xç'],
      ['Xå'],
      ['XÅ'],
    ])('renders %s as a path element with no <text> fallback', (input) => {
      const svg = renderSvg(input);
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('renders Xcafé with monotonically increasing x-coordinates per glyph (kerning intact for diacritic-bearing words)', () => {
      const svg = renderSvg('Xcafé');
      const paths = externalGlyphPathDs(svg);
      expect(paths).toHaveLength(4);
      const xCoords = paths.map(m => firstMx(m[1]));
      for (let i = 1; i < xCoords.length; i++) {
        expect(xCoords[i]).toBeGreaterThan(xCoords[i - 1]);
      }
    });
  });

  // The X-prefix DSL today accepts only ASCII letters, Latin Extended-A,
  // Greek, and Cyrillic. Characters outside that set are surfaced as
  // UNKNOWN_CODE warnings (not silently dropped); the active tests below
  // pin that warning contract. Wider character support (so the parser
  // falls through to the XTXT <text> path instead of rejecting) is
  // tracked at https://github.com/hlridge/bliss-svg-builder/issues/26;
  // the it.todo lines pin the desired future contract.
  describe('when a base+diacritic combination lies outside the supported X-prefix character set', () => {
    it.each([
      ['Xǎ'],
      ['Xǔ'],
      ['Xḿ'],
    ])('emits an UNKNOWN_CODE warning for %s', (input) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: `Invalid format: ${input}`,
      }));
    });

    it('emits an UNKNOWN_CODE warning for the failing portion of Xpiǎ (mid-word)', () => {
      const builder = new BlissSVGBuilder('Xpiǎ');
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: 'Invalid format: Xiǎ',
      }));
    });

    it('emits an UNKNOWN_CODE warning for the failing word in Xhello//Xpiǎ (cross-word)', () => {
      const builder = new BlissSVGBuilder('Xhello//Xpiǎ');
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: 'Invalid format: Xiǎ',
      }));
    });

    it('round-trips Xpiǎ through toJSON with byte-identical SVG output', () => {
      const original = new BlissSVGBuilder('Xpiǎ');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it.todo('renders Xǎ as a single text element since the base char lacks hardcoded data (a with caron, Pinyin)');
    it.todo('renders Xǔ as a single text element since the base char lacks hardcoded data (u with caron, Pinyin)');
    it.todo('renders Xḿ as a single text element since the base char lacks hardcoded data (m with acute)');
    it.todo('renders Xpiǎ as a single text element when one mid-word char lacks hardcoded data');
    it.todo('renders Xhello//Xpiǎ as paths for the hardcoded word and a single text element for the fallback word');
  });
});
