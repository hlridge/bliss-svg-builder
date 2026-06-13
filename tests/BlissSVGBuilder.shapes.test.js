import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins shape primitive registry health: every non-B-code definition in
 * `blissElementDefinitions` has a renderable path source (`getPath` or
 * `codeString`), produces valid SVG output through the full builder
 * pipeline, and follows the agreed code-naming conventions.
 *
 * Covers:
 * - Definition shape: `getPath` (simple shape) or `codeString` (combined
 *   shape) present for every shape primitive.
 * - `getPath()` return value is a non-empty string (except the documented
 *   empty-output cases ZSA, TSP, QSP).
 * - Every shape primitive renders to SVG with a viewBox and no throws.
 * - viewBox attributes parse as numeric values with positive dimensions.
 * - Swedish/Nordic external glyph subset (Xå, Xä, Xö, XÅ, XÄ, XÖ).
 * - Code-consistency audits: no comma-containing codes; matching
 *   ascending/descending diagonal-line pairs (DL*N ↔ DL*S).
 * - Category coverage spot-checks: Special, Iconic, Dots, Circles,
 *   Vertical/Horizontal Lines, Squares, Arrows.
 *
 * Does NOT cover:
 * - B-code Bliss characters (those are not shape primitives), see
 *   `BlissParser.internal-mechanics.test.js` and `BlissElement.internal-mechanics.test.js`.
 * - Composition mechanics for combined shapes that use `codeString`, see
 *   `BlissSVGBuilder.custom-shapes.test.js` for the user-facing
 *   composition surface.
 * - Rendered visual fidelity (pixel-level), see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 * - XTXT_ text-fallback rendering for non-Latin Unicode, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 */
describe('BlissSVGBuilder shapes', () => {
  const allShapeCodes = Object.keys(blissElementDefinitions).filter(code => !code.startsWith('B'));

  describe('when reading the shape definition registry', () => {
    it('exposes either getPath (simple shape) or codeString (combined shape) for every primitive', () => {
      for (const code of allShapeCodes) {
        const def = blissElementDefinitions[code];
        expect(def, `Shape ${code} should have a definition`).toBeDefined();

        const hasGetPath = typeof def.getPath === 'function';
        const hasCodeString = typeof def.codeString === 'string';

        expect(
          hasGetPath || hasCodeString,
          `Shape ${code} should have either getPath (simple shape) or codeString (combined shape)`
        ).toBe(true);
      }
    });

    it('returns a non-empty path string from getPath() for every simple shape (except ZSA, TSP, QSP)', () => {
      for (const code of allShapeCodes) {
        const def = blissElementDefinitions[code];

        if (typeof def.getPath !== 'function') continue;

        const path = def.getPath();
        expect(typeof path, `Shape ${code} getPath() should return a string`).toBe('string');

        // ZSA (Zero-Sized Anchor) and space glyphs (TSP, QSP) intentionally
        // return empty path strings; they contribute to layout but render no ink.
        if (code !== 'ZSA' && code !== 'TSP' && code !== 'QSP') {
          expect(path.length, `Shape ${code} getPath() should not be empty`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('when rendering every shape primitive', () => {
    it('produces SVG output without throwing for every shape primitive', () => {
      const errors = [];

      for (const code of allShapeCodes) {
        try {
          const builder = new BlissSVGBuilder(code);
          expect(builder.svgCode).toBeDefined();
          expect(builder.svgCode.length).toBeGreaterThan(0);
          expect(builder.svgCode).toContain('<svg');
          expect(builder.svgCode).toContain('</svg>');
        } catch (error) {
          errors.push({ code, error: error.message });
        }
      }

      if (errors.length > 0) {
        const errorList = errors.map(e => `${e.code}: ${e.error}`).join('\n  ');
        throw new Error(`Failed to render ${errors.length} shapes:\n  ${errorList}`);
      }
    });

    it('emits a numeric, positive-dimension viewBox for every shape', () => {
      for (const code of allShapeCodes) {
        const builder = new BlissSVGBuilder(code);
        const svg = builder.svgCode;

        expect(svg, `Shape ${code} should contain viewBox`).toMatch(/viewBox="[^"]+"/);

        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        if (viewBoxMatch) {
          const [x, y, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);
          expect(isNaN(x), `Shape ${code} viewBox x should be a number`).toBe(false);
          expect(isNaN(y), `Shape ${code} viewBox y should be a number`).toBe(false);
          expect(isNaN(width), `Shape ${code} viewBox width should be a number`).toBe(false);
          expect(isNaN(height), `Shape ${code} viewBox height should be a number`).toBe(false);
          expect(width, `Shape ${code} viewBox width should be positive`).toBeGreaterThan(0);
          expect(height, `Shape ${code} viewBox height should be positive`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('when rendering Swedish/Nordic external glyphs', () => {
    const unicodeGlyphs = ['Xå', 'Xä', 'Xö', 'XÅ', 'XÄ', 'XÖ'];

    it('renders each Swedish/Nordic glyph to SVG', () => {
      for (const code of unicodeGlyphs) {
        expect(() => {
          const builder = new BlissSVGBuilder(code);
          expect(builder.svgCode).toContain('<svg');
        }, `Should render ${code}`).not.toThrow();
      }
    });

    it('defines a getPath function for each Swedish/Nordic glyph', () => {
      for (const code of unicodeGlyphs) {
        const def = blissElementDefinitions[code];
        expect(def, `Definition for ${code} should exist`).toBeDefined();
        expect(def.getPath, `${code} should have getPath function`).toBeDefined();
      }
    });
  });

  describe('when auditing shape codes for naming-convention violations', () => {
    it('contains no shape codes with commas (must use hyphens, e.g. DL2-3S not DL2,3S)', () => {
      const invalidCodes = allShapeCodes.filter(code => code.includes(','));

      if (invalidCodes.length > 0) {
        throw new Error(
          `Found ${invalidCodes.length} shape codes with commas (should use hyphens):\n  ${invalidCodes.join(', ')}`
        );
      }
    });

    it('pairs every ascending diagonal-line code DL*N with a descending DL*S', () => {
      const ascendingLines = allShapeCodes.filter(code => code.startsWith('DL') && code.endsWith('N'));
      const descendingLines = allShapeCodes.filter(code => code.startsWith('DL') && code.endsWith('S'));

      for (const ascCode of ascendingLines) {
        const descCode = ascCode.replace(/N$/, 'S');
        expect(
          descendingLines.includes(descCode),
          `Ascending line ${ascCode} should have matching descending line ${descCode}`
        ).toBe(true);
      }
    });

    it('pairs every descending diagonal-line code DL*S with an ascending DL*N', () => {
      // Mirror of the ascending check; catches an orphan descending code
      // (e.g. DL5S with no DL5N) that the ascending-only direction misses.
      const ascendingLines = allShapeCodes.filter(code => code.startsWith('DL') && code.endsWith('N'));
      const descendingLines = allShapeCodes.filter(code => code.startsWith('DL') && code.endsWith('S'));

      for (const descCode of descendingLines) {
        const ascCode = descCode.replace(/S$/, 'N');
        expect(
          ascendingLines.includes(ascCode),
          `Descending line ${descCode} should have matching ascending line ${ascCode}`
        ).toBe(true);
      }
    });
  });

  describe('when auditing category coverage', () => {
    const expectedCategories = [
      ['Special', ['ZSA']],
      ['Iconic', ['H', 'E', 'F']],
      ['Dots', ['DOT', 'SDOT', 'COMMA']],
      ['Circles', ['C8', 'C4', 'C2', 'C1']],
      ['Vertical Lines', ['VL12', 'VL10', 'VL8', 'VL6', 'VL4', 'VL1']],
      ['Horizontal Lines', ['HL16', 'HL12', 'HL8', 'HL4', 'HL1']],
      ['Squares', ['S8', 'S4', 'S2']],
      ['Arrows', ['ARR8N', 'ARR4E', 'LARR8W']],
    ];

    it.each(expectedCategories)('defines every %s shape', (category, sampleCodes) => {
      for (const code of sampleCodes) {
        expect(
          blissElementDefinitions[code],
          `${category} shape ${code} should be defined`
        ).toBeDefined();
      }
    });
  });
});
