import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the external-glyph rendering contract: characters in the X-prefix DSL
 * that resolve to hardcoded SVG path data render as `<path stroke="none">`
 * with their coordinates baked into the `d` attribute (no `transform`
 * attribute), accept the standard color cascade at all scopes, and continue
 * to receive kerning when carrying bracket-level options.
 *
 * Covers:
 * - Coordinate transformation: external glyph paths bake coordinates into
 *   the `d` attribute (no `<path transform="translate(...)">`); every M
 *   command in a multi-subpath glyph is transformed.
 * - Path command vocabulary: only `M` (subpath start), `Z` (close), and
 *   relative commands; no absolute `L`/`H`/`V`/`C`/`S`/`Q`/`T`/`A`.
 * - Color cascade across the four scopes (default black, global, group,
 *   glyph) with glyph overriding group overriding global; hex values; mixed
 *   global+group+glyph.
 * - Kerning preservation when a glyph carries bracket-level options
 *   (single option, multiple options, color-with-other): the rendered
 *   gap matches the no-options baseline.
 * - Path structure invariants: `stroke="none"` on every external glyph
 *   path; one path per glyph in a multi-glyph word.
 * - BCI/X-code rendering equivalence: a B-code that resolves to an X-code
 *   (e.g. B55 → XA, B76 → XV) produces byte-identical SVG to its X-code
 *   counterpart, both as raw codes and when wrapped in a custom-definition
 *   alias (BCI55 = "B55", BCI76 = "B76").
 * - External-glyph spacing survives a `toJSON()` round-trip (GH #38), for both
 *   glyph shapes that carry no code of their own: one whose option is written
 *   in part scope (`[color=red]>Xm`) and a multi-character text fallback
 *   (`Xhαllo`). Includes the boundary in the other direction: a Bliss
 *   character, which has no metadata at risk, gains nothing in its JSON.
 *
 * Does NOT cover:
 * - The text-fallback boundary (multi-character X-prefix `Xhello`, `Xα`,
 *   `Xc/Xa/Xf/Xé`) and the `<text>` fallback element shape, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 * - UNKNOWN_CODE warning emission for out-of-range X-prefix character
 *   classes (`Xǎ`, `Xḿ`), see `BlissSVGBuilder.text-fallback.test.js`.
 * - The color->stroke attribute mapping, multi-scope cascade, and SVG
 *   attribute passthrough (fill/opacity, HTML-entity escaping), see
 *   `BlissSVGBuilder.stroke-color.test.js`.
 * - Rendered-position kerning math for non-X glyphs, see
 *   `BlissSVGBuilder.spacing.test.js` and
 *   `BlissSVGBuilder.digit-kerning.test.js`.
 */

function extractExternalGlyphPaths(svg) {
  const pathRegex = /<path\s+stroke="none"\s+fill="([^"]+)"[^>]*\s+d="([^"]+)"/g;
  const paths = [];
  let match;
  while ((match = pathRegex.exec(svg)) !== null) {
    paths.push({ fill: match[1], pathData: match[2] });
  }
  return paths;
}

function extractXCoordinates(svg) {
  const matches = [...svg.matchAll(/d="M(-?[\d.]+),/g)];
  return matches.map(m => parseFloat(m[1]));
}

// Ink-independent gap between the first two glyphs, in grid units: reads the
// laid-out element snapshots rather than path coordinates, so it measures a
// <text> fallback glyph the same way it measures an outlined one.
function glyphGap(builder) {
  const [first, second] = builder.groups[0].children;
  return second.x - (first.x + first.width);
}

describe('BlissSVGBuilder external glyphs', () => {
  describe('when transforming external-glyph coordinates', () => {
    it('omits the transform attribute on external glyph paths', () => {
      const builder = new BlissSVGBuilder('Xa');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/transform="translate\(/);
    });

    it('emits numeric M coordinates in the path data', () => {
      const builder = new BlissSVGBuilder('Xa');
      const svg = builder.svgCode;

      const pathMatch = svg.match(/<path[^>]*d="M(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      expect(pathMatch).not.toBeNull();

      const [, x, y] = pathMatch;
      expect(parseFloat(x)).not.toBeNaN();
      expect(parseFloat(y)).not.toBeNaN();
    });

    it('emits relative commands only (M for subpaths and Z for close)', () => {
      const builder = new BlissSVGBuilder('Xa');
      const svg = builder.svgCode;

      const pathMatch = svg.match(/<path[^>]*d="([^"]+)"/);
      expect(pathMatch).not.toBeNull();

      const pathData = pathMatch[1];
      expect(pathData).not.toMatch(/[LHVCSQTA]/);
    });

    it('transforms every M coordinate in glyphs with multiple subpaths', () => {
      // glyph 'a' has 2 subpaths (body + dot inside); each starts with M
      const builder = new BlissSVGBuilder('Xa');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(1);
      const pathData = paths[0].pathData;

      const mCommands = pathData.match(/M-?\d+\.?\d*,-?\d+\.?\d*/g);
      expect(mCommands.length).toBe(2);

      // the source font's glyph 'a' starts at M1.163...,16.045...; both axes shift after layout
      expect(pathData).not.toMatch(/M1\.163/);
      expect(pathData).not.toMatch(/,16\.045/);
    });
  });

  describe('when applying color options at different scopes', () => {
    it('uses #000000 fill when no color is specified', () => {
      const builder = new BlissSVGBuilder('Xa');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(1);
      expect(paths[0].fill).toBe('#000000');
    });

    it('applies a global color to every glyph', () => {
      const builder = new BlissSVGBuilder('[color=red]||Xa/Xb/Xc');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(3);
      expect(paths[0].fill).toBe('red'); // Xa
      expect(paths[1].fill).toBe('red'); // Xb
      expect(paths[2].fill).toBe('red'); // Xc
    });

    it('lets a glyph-level color override the global color', () => {
      const builder = new BlissSVGBuilder('[color=red]||[color=blue]Xa/Xb');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(2);
      expect(paths[0].fill).toBe('blue'); // Xa carries the glyph-level override
      expect(paths[1].fill).toBe('red');  // Xb inherits the global
    });

    it('applies a different glyph-level color to each glyph in a sequence', () => {
      const builder = new BlissSVGBuilder('[color=red]Xa/[color=green]Xb/[color=blue]Xc');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(3);
      expect(paths[0].fill).toBe('red');   // Xa
      expect(paths[1].fill).toBe('green'); // Xb
      expect(paths[2].fill).toBe('blue');  // Xc
    });

    it('applies a group-level color to every glyph in the group', () => {
      const builder = new BlissSVGBuilder('[color=purple]|Xa/Xb');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(2);
      expect(paths[0].fill).toBe('purple'); // Xa
      expect(paths[1].fill).toBe('purple'); // Xb
    });

    it('accepts hex color values', () => {
      const builder = new BlissSVGBuilder('[color=#FF5500]||Xa');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(1);
      expect(paths[0].fill).toBe('#FF5500');
    });

    it('lets glyph override group override global when all three set color', () => {
      const builder = new BlissSVGBuilder('[color=red]||[color=green]|[color=blue]Xa/Xb');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(2);
      expect(paths[0].fill).toBe('blue');  // Xa: glyph blue overrides group green
      expect(paths[1].fill).toBe('green'); // Xb: inherits group green (no glyph override)
    });
  });

  describe('when kerning interacts with glyph-level bracket options', () => {
    it('preserves the kerning gap when a glyph carries a single option', () => {
      // XV/XA pair has natural kerning (gap < default char-space)
      const svgWithoutOptions = new BlissSVGBuilder('XV/XA').svgCode;
      const svgWithOptions = new BlissSVGBuilder('XV/[color=green]XA').svgCode;

      const coordsWithout = extractXCoordinates(svgWithoutOptions);
      const coordsWith = extractXCoordinates(svgWithOptions);

      const gapWithout = coordsWithout[1] - coordsWithout[0];
      const gapWith = coordsWith[1] - coordsWith[0];

      expect(gapWith).toBeCloseTo(gapWithout, 4);
      // sanity: baseline gap below 7 (default char-space) confirms the pair actually kerns
      expect(gapWithout).toBeLessThan(7);
    });

    it('preserves the kerning gap when a glyph carries multiple options', () => {
      const svgWithoutOptions = new BlissSVGBuilder('XT/XA').svgCode;
      const svgWithOptions = new BlissSVGBuilder('XT/[color=red;stroke-width=0.3]XA').svgCode;

      const coordsWithout = extractXCoordinates(svgWithoutOptions);
      const coordsWith = extractXCoordinates(svgWithOptions);

      const gapWithout = coordsWithout[1] - coordsWithout[0];
      const gapWith = coordsWith[1] - coordsWith[0];

      expect(gapWith).toBeCloseTo(gapWithout, 4);
    });

    it('applies the color option only to the bracketed glyph in a kerned pair (XV/[color=green]XA)', () => {
      const builder = new BlissSVGBuilder('XV/[color=green]XA');
      const svg = builder.svgCode;
      const paths = extractExternalGlyphPaths(svg);

      expect(paths.length).toBe(2);
      expect(paths[0].fill).toBe('#000000'); // XV uses default
      expect(paths[1].fill).toBe('green');   // XA carries the option
    });

    it('renders without throwing and applies the color when an indicator carries bracket options ([color=red]>XW)', () => {
      const builder = new BlissSVGBuilder('XA/[color=red]>XW');
      const svg = builder.svgCode;

      expect(svg).toContain('<svg');
      expect(svg).toContain('red');
    });

    it('leaves composition.width unchanged when an indicator carries bracket options ([color=red]>XW)', () => {
      const builderWithOptions = new BlissSVGBuilder('XA/[color=red]>XW');
      const builderWithoutOptions = new BlissSVGBuilder('XA/XW');

      // indicator-options form must not nudge advance widths
      expect(builderWithOptions.composition.width).toBe(builderWithoutOptions.composition.width);
    });
  });

  describe('when rendering external-glyph path structure', () => {
    it('emits stroke="none" on every external glyph path', () => {
      const builder = new BlissSVGBuilder('Xa/Xb/Xc');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(3);
    });

    it('renders one path per glyph for a multi-glyph word', () => {
      // spelling 'hello' as five external glyphs
      const builder = new BlissSVGBuilder('Xh/Xe/Xl/Xl/Xo');
      const paths = extractExternalGlyphPaths(builder.svgCode);

      expect(paths.length).toBe(5);
    });
  });

  describe('when BCI codes are used interchangeably with their X-code equivalents', () => {
    it('produces identical SVG output across all-BCI, all-X, and mixed orderings', () => {
      const allBci  = new BlissSVGBuilder('B55/B76/B55').svgCode;
      const allX    = new BlissSVGBuilder('XA/XV/XA').svgCode;
      const mixedA  = new BlissSVGBuilder('B55/XV/XA').svgCode;
      const mixedB  = new BlissSVGBuilder('XA/B76/XA').svgCode;
      expect(allX).toBe(allBci);
      expect(mixedA).toBe(allBci);
      expect(mixedB).toBe(allBci);
    });

    it('produces identical SVG output when BCI codes are wrapped in custom-definition aliases', () => {
      BlissSVGBuilder.define({
        BCI55: { codeString: 'B55' },
        BCI76: { codeString: 'B76' },
      });
      try {
        const raw = new BlissSVGBuilder('B55/B76/B55').svgCode;
        const wrapped = new BlissSVGBuilder('BCI55/BCI76/BCI55').svgCode;
        expect(wrapped).toBe(raw);
      } finally {
        BlissSVGBuilder.removeDefinition('BCI55');
        BlissSVGBuilder.removeDefinition('BCI76');
      }
    });
  });

  // note: a DSL part-scope option (`[opts]>CODE`) makes `toJSON()` omit the
  // glyph's `codeName`, and rebuilding from that JSON loses the glyph's
  // external-glyph identity — so the gap to the next glyph falls back from
  // `external-glyph-space` (0.8) to `char-space` (2), a 1.2-unit widening.
  // The DIRECT render and the `toString()` round-trip are both correct; only
  // the toJSON path drifts, which breaks the documented "toJSON() output
  // round-trips via constructor" promise. A part option added through
  // `setOptions()` does NOT trigger it, only the DSL spelling. Backlog:
  // "toJSON drops external-glyph identity when a part carries a part-scope
  // option". Reported via Bliss Maker, whose display-min-width clone
  // round-trips through toJSON on the render path.
  describe('when an external glyph carries a DSL part-scope option', () => {
    const gapToNextGlyph = (input) => {
      const xs = extractXCoordinates(new BlissSVGBuilder(input).svgCode);
      return +(xs[1] - xs[0]).toFixed(4);
    };

    it('renders the same glyph advance as the no-option baseline', () => {
      expect(gapToNextGlyph('[color=red]>Xm/XV/XA')).toBe(gapToNextGlyph('Xm/XV/XA'));
    });

    it('renders the same glyph advance as the char-scope spelling', () => {
      expect(gapToNextGlyph('[color=red]>Xm/XV/XA')).toBe(gapToNextGlyph('[color=red]Xm/XV/XA'));
    });

    it('round-trips through toString with byte-identical SVG', () => {
      const direct = new BlissSVGBuilder('[color=red]>Xm/XV/XA');
      const reparsed = new BlissSVGBuilder(direct.toString({ preserve: true }));
      expect(reparsed.svgCode).toBe(direct.svgCode);
    });

    it('keeps the glyph codeName in toJSON for the char-scope and bare spellings', () => {
      const codeNameOf = (input) =>
        new BlissSVGBuilder(input).toJSON({ preserve: true }).groups[0].glyphs[0].codeName;
      expect(codeNameOf('Xm/XV/XA')).toBe('Xm');
      expect(codeNameOf('[color=red]Xm/XV/XA')).toBe('Xm');
    });

    it('keeps the glyph codeName in toJSON when the part option arrives via setOptions', () => {
      const b = new BlissSVGBuilder('Xm/XV/XA');
      b.group(0).glyph(0).part(0).setOptions({ 'data-draggable': 'true' });
      expect(b.toJSON({ preserve: true }).groups[0].glyphs[0].codeName).toBe('Xm');
    });

    it('keeps the external-glyph metadata in toJSON when the part carries a DSL part-scope option', () => {
      // `[opts]>` binds the code to the PART, so the glyph itself stays
      // anonymous by design and there is no glyph codeName to keep. toJSON
      // normally drops glyph-classification metadata because the code
      // re-derives it; with no code, it has to be written out instead.
      const glyph = new BlissSVGBuilder('[color=red]>Xm/XV/XA').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(glyph.codeName).toBeUndefined();
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.char).toBe('m');
    });

    it('round-trips through toJSON with byte-identical SVG, matching the toString round-trip', () => {
      const direct = new BlissSVGBuilder('[color=red]>Xm/XV/XA');
      const viaJson = new BlissSVGBuilder(direct.toJSON());
      const viaString = new BlissSVGBuilder(direct.toString());
      expect(viaJson.svgCode).toBe(direct.svgCode);
      expect(viaJson.svgCode).toBe(viaString.svgCode);
    });

    it('preserves external-glyph spacing after a toJSON round-trip instead of widening to char-space', () => {
      const direct = new BlissSVGBuilder('[color=red]>Xm/XV/XA');
      const rebuilt = new BlissSVGBuilder(direct.toJSON());
      // external-glyph-space is 0.8; char-space is 2, so the regression this
      // pins is a 1.2-unit widening of every gap after the affected glyph.
      expect(glyphGap(rebuilt)).toBeCloseTo(glyphGap(direct), 6);
      expect(glyphGap(rebuilt)).toBeCloseTo(0.8, 6);
    });

    it('adds nothing to the JSON of a Bliss character, which carries no metadata at risk', () => {
      // The metadata is written out only where nothing can re-derive it. A
      // Bliss character under the same spelling lifts no glyph-level metadata
      // in the first place, so its JSON must stay exactly as lean as before.
      const glyph = new BlissSVGBuilder('[color=red]>B291/B291').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(Object.keys(glyph)).toEqual(['parts']);
    });

    it('round-trips the composed and repositioned spellings through toJSON too', () => {
      for (const input of ['[color=red]>Xm;B81/XV', '[color=red]>Xm:2,3/XV']) {
        const direct = new BlissSVGBuilder(input);
        expect(new BlissSVGBuilder(direct.toJSON()).svgCode).toBe(direct.svgCode);
      }
    });
  });

  // note: a multi-character text-fallback glyph (`Xhαllo` — Greek alpha has no
  // outline, so the whole run renders as one `<text>` element) had no
  // glyph-level identity code at all. `toJSON()` therefore emitted no glyph
  // `codeName`, and rebuilding from that JSON could not tell the glyph was
  // external — so the gap to its neighbour widened from `external-glyph-space`
  // (0.8) to `char-space` (2). The single-character fallback (`Xλ`) never had
  // the problem because it carries an identity code. This is the second
  // trigger of the same user-visible symptom as the part-scope-option describe
  // above (external letters 1.2 units too far apart); GH #38 carries both.
  describe('when a multi-character text-fallback glyph is rebuilt from toJSON', () => {
    it('writes the external-glyph flag into the JSON, having no code to re-derive it from', () => {
      const glyph = new BlissSVGBuilder('XM/Xhαllo').toJSON({ preserve: true }).groups[0].glyphs[1];
      expect(glyph.codeName).toBeUndefined();
      expect(glyph.isExternalGlyph).toBe(true);
    });

    it('reports the rebuilt glyph as an external glyph', () => {
      const b = new BlissSVGBuilder('XM/Xhαllo');
      const rebuilt = new BlissSVGBuilder(b.toJSON());
      expect(b.groups[0].children[1].isExternalGlyph).toBe(true);
      expect(rebuilt.groups[0].children[1].isExternalGlyph).toBe(true);
    });

    it('renders byte-identical SVG after a toJSON round-trip', () => {
      const b = new BlissSVGBuilder('XM/Xhαllo');
      expect(new BlissSVGBuilder(b.toJSON()).svgCode).toBe(b.svgCode);
    });

    it('keeps external-glyph spacing on both sides of the fallback glyph', () => {
      for (const input of ['XM/Xhαllo', 'Xhαllo/XM']) {
        const b = new BlissSVGBuilder(input);
        const rebuilt = new BlissSVGBuilder(b.toJSON());
        expect(glyphGap(b)).toBeCloseTo(0.8, 6);
        expect(glyphGap(rebuilt)).toBeCloseTo(0.8, 6);
      }
    });

    it('restores external identity from authored object input written in the public form', () => {
      const authored = new BlissSVGBuilder({
        groups: [{ glyphs: [
          { codeName: 'XM', parts: [{ codeName: 'XM' }] },
          { codeName: 'Xhαllo', parts: [{ codeName: 'Xhαllo' }] },
        ] }],
      });
      expect(authored.warnings).toEqual([]);
      expect(authored.groups[0].children[1].isExternalGlyph).toBe(true);
      expect(glyphGap(authored)).toBeCloseTo(0.8, 6);
    });

    it('leaves the single-character fallback and the Bliss-character neighbour unchanged', () => {
      // Regression floor: the fix must not turn a Bliss character into an
      // external one, nor disturb the single-char fallback that already worked.
      expect(glyphGap(new BlissSVGBuilder('XM/B291'))).toBeCloseTo(2, 6);
      // `XM/Xλ` would merge into ONE fallback glyph (λ has no outline), so the
      // single-char floor needs a neighbour that does not merge with it.
      const single = new BlissSVGBuilder('B291/Xλ');
      expect(new BlissSVGBuilder(single.toJSON()).svgCode).toBe(single.svgCode);
      expect(single.groups[0].children[1].codeName).toBe('Xλ');
    });
  });
});
