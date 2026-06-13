import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how the stroke and color option family on BlissSVGBuilder renders
 * stroke-width, color, dot-extra-width, and adjacent SVG-attribute
 * passthrough options at global (`||`), element (`|`), character
 * (`Code`), and part (`>Code`) scopes, together with the DOT/COMMA
 * stroke-width formula, the empty-path cleanup pass, and the
 * stroke-bearing-output well-formedness checks.
 *
 * Covers:
 * - `stroke-width=N` at global level (on the content group, clamped to
 *   max 1.5) and at element level (on the inner `<g>` wrapper).
 * - `stroke-width` multi-level semantics: option appears at global AND
 *   element levels (not in internalOptions).
 * - DOT and COMMA element stroke-width formula:
 *   dotStrokeWidth = (baseStrokeWidth + extraDotWidth) / 2 with
 *   stroke-width clamped to max 1.5 and dot-extra-width clamped to
 *   max 1; COMMA tail stroke-width = dot stroke-width * 2/3.
 * - Empty `<path d=""/>` cleanup for DOT, COMMA, external glyphs,
 *   and element-level wrappers; valid path data preserved.
 * - SVG well-formedness for stroke-bearing output: properly quoted
 *   attributes, no malformed `="..."<` runs, tag-balance for
 *   complex DOT/COMMA compositions; `standaloneSvg` carries the XML
 *   declaration prologue, `svgCode` does not.
 * - `color=VALUE` at global level (maps to `stroke` on the content
 *   group), at element level (maps to `stroke` on the `<g>` wrapper),
 *   and the element-overrides-global visual cascade.
 * - `color` multi-level semantics: option appears at global AND
 *   element levels (not in internalOptions).
 * - `rgba(...)` / `rgb(...)` color values pass through to the `stroke`
 *   attribute unchanged (no canonicalization to hex).
 * - Part-level options (`[k=v]>Code:x,y`) wrap each part in a `<g>`;
 *   different colors apply to different parts.
 * - Character-level options (`[k=v]Code:x,y`) wrap the character
 *   in a `<g>`.
 * - Cascade rendering across global/element/part wrappers
 *   (`[a]||[b]|[c]H/C8` produces nested `<g>` layers).
 * - SVG-attribute mapping: `color` -> `stroke`, passthrough of
 *   `fill`/`opacity`/etc. onto the content group, HTML-entity
 *   escaping of attribute values.
 * - `dot-extra-width` (it.todo placeholder; option is parsed but
 *   not yet wired through to DOT/COMMA rendering at the option
 *   level; DOT/COMMA currently use the hardcoded extraDotWidth
 *   from element definitions).
 *
 * Does NOT cover:
 * - Per-definition `defaultOptions` and the inner-`<g>`-wins cascade,
 *   see `BlissSVGBuilder.default-options.test.js`.
 * - Object-form options (defaults/overrides via constructor arg 2),
 *   see `BlissSVGBuilder.object-options.test.js`.
 * - Grid-line stroke-width and color (`grid-*-stroke-width`,
 *   `grid-*-color` cascade), see `BlissSVGBuilder.grid.test.js`.
 * - The 4-level cascade matrix (global/word/character/part single,
 *   pair, triple, and full-quad combinations), see
 *   `BlissSVGBuilder.hierarchical-options.test.js`.
 * - SVG metadata (svg-height/width, svg-title, svg-desc, text
 *   overlay, background) and HTML-escaping in metadata, see
 *   `BlissSVGBuilder.svg-metadata.test.js`. Prototype-polluting
 *   bracket-option key safety (__proto__, constructor) is in
 *   `BlissSVGBuilder.option-hardening.test.js`.
 * - Clickable-link wrapping (`href`/`target`) and stroke/fill cascade
 *   through `<a><g>` anchor wrappers, see
 *   `BlissSVGBuilder.clickable-links.test.js`.
 * - Alpha compositing of an `rgba` opacity channel with a separate
 *   `opacity` option (the alpha passes through verbatim, uncomposited);
 *   not covered anywhere in the suite.
 * - External-glyph rendering for non-X-prefix codes and the
 *   text-fallback boundary, see `BlissSVGBuilder.external-glyphs.test.js`
 *   and `BlissSVGBuilder.text-fallback.test.js`.
 */
describe('BlissSVGBuilder stroke and color', () => {

  describe('when stroke-width is set', () => {
    it('applies stroke-width at global level (on content group)', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1.0]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="1"/);
    });

    it('clamps stroke-width on content group to max 1.5', () => {
      const builder = new BlissSVGBuilder('[stroke-width=2]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="1.5"/);
    });

    it('applies stroke-width at element level (on <g> wrapper only)', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]|H');
      const svg = builder.svgCode;

      // Element-scope option leaves content group at the default 0.5 stroke-width
      // and renders the requested value on an inner <g> wrapper.
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.5"/);
      expect(svg).toMatch(/<g stroke-width="1"/);
    });

    it('allows element-level stroke-width to override global visually', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.8]||[stroke-width=1.2]|H');
      const svg = builder.svgCode;

      // Global value lands on the content group; the inner <g stroke-width="1.2">
      // visually overrides for the wrapped element.
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.8"/);
      expect(svg).toMatch(/<g stroke-width="1.2"/);
    });

    it('renders stroke-width at both global and element scopes (multi-level option, not in internalOptions)', () => {
      const globalBuilder = new BlissSVGBuilder('[stroke-width=1]||H');
      const elementBuilder = new BlissSVGBuilder('[stroke-width=1]|H');

      expect(globalBuilder.svgCode).toContain('stroke-width="1"');
      expect(elementBuilder.svgCode).toContain('stroke-width="1"');
    });
  });

  describe('when stroke-width and dot-extra-width affect DOT and COMMA elements', () => {
    it('applies stroke-width to DOT element', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]||DOT');
      const svg = builder.svgCode;

      // DOT formula: dotStrokeWidth = (baseStrokeWidth + extraDotWidth) / 2
      // (1 + 0.333) / 2 = 0.6665
      expect(svg).toContain('stroke-width="0.6665"');
    });

    it('applies dot-extra-width to DOT element', () => {
      const builder = new BlissSVGBuilder('[dot-extra-width=1]||DOT');
      const svg = builder.svgCode;

      // (default 0.5 + 1) / 2 = 0.75
      expect(svg).toContain('stroke-width="0.75"');
    });

    it('applies both stroke-width and dot-extra-width to DOT element', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1;dot-extra-width=1]||DOT');
      const svg = builder.svgCode;

      // (1 + 1) / 2 = 1
      expect(svg).toContain('stroke-width="1"');
    });

    it('applies stroke-width to COMMA element (dot and tail)', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]||COMMA');
      const svg = builder.svgCode;

      // COMMA has two parts. Dot: (1 + 0.333) / 2 = 0.6665.
      // Tail: dotStrokeWidth * 2/3 = 0.6665 * 2/3 ≈ 0.4443.
      expect(svg).toContain('stroke-width="0.6665"');
      expect(svg).toContain('stroke-width="0.4443333333333333"');
    });

    it('applies stroke-width=0.5 and dot-extra-width=0 to make DOT match SDOT', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.5;dot-extra-width=0]||DOT');
      const svg = builder.svgCode;

      // (0.5 + 0) / 2 = 0.25; matches SDOT (small dot) behavior.
      expect(svg).toContain('stroke-width="0.25"');
    });

    it('inherits stroke-width from global options at element level', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.8]||H/DOT');
      const svg = builder.svgCode;

      // DOT inherits global stroke-width=0.8: (0.8 + 0.333) / 2 ≈ 0.5665
      expect(svg).toContain('stroke-width="0.5665"');
    });

    it('feeds element-level stroke-width into the DOT formula', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.5]||[stroke-width=1]|DOT');
      const svg = builder.svgCode;

      // Element wrapper carries stroke-width=1; DOT inherits the element-level
      // value into its own formula: (1 + 0.333) / 2 = 0.6665.
      expect(svg).toMatch(/<g[^>]*stroke-width="1"/);
      expect(svg).toContain('stroke-width="0.6665"');
    });

    it('clamps stroke-width before applying to DOT (max 1.5)', () => {
      const builder = new BlissSVGBuilder('[stroke-width=2]||DOT');
      const svg = builder.svgCode;

      // stroke-width clamped to 1.5 before the formula: (1.5 + 0.333) / 2 ≈ 0.9165
      expect(svg).toContain('stroke-width="0.9165"');
    });

    it('clamps dot-extra-width before applying to DOT (max 1)', () => {
      const builder = new BlissSVGBuilder('[dot-extra-width=2]||DOT');
      const svg = builder.svgCode;

      // dot-extra-width clamped to 1: (0.5 + 1) / 2 = 0.75
      expect(svg).toContain('stroke-width="0.75"');
    });
  });

  describe('when DOT, COMMA, or external glyphs are rendered (empty path cleanup)', () => {
    it('DOT at global level does not create empty paths', () => {
      const builder = new BlissSVGBuilder('DOT');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<path d=""/>');
    });

    it('DOT with element-level wrapper does not create empty paths', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]|DOT');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<path d=""/>');
      expect(svg).toContain('<g stroke-width="1">');
      expect(svg).toContain('<g stroke-width="0.6665">');
    });

    it('COMMA does not create empty paths', () => {
      const builder = new BlissSVGBuilder('COMMA');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<path d=""/>');
    });

    it('external glyph with wrapper does not create empty paths', () => {
      const builder = new BlissSVGBuilder('[color=red]|XR');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<path d=""/>');
      expect(svg).toContain('<g stroke="red">');
    });

    it('multiple external glyphs do not create empty paths', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]|Xhello');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<path d=""/>');
    });

    it('cleanup does not remove valid paths', () => {
      const builder = new BlissSVGBuilder('[color=blue]|H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<path d="[^"]+"\/>/);
      expect(svg).not.toContain('<path d=""/>');
    });
  });

  describe('when checking SVG well-formedness of stroke-bearing output', () => {
    it('DOT produces valid SVG with properly quoted attributes', () => {
      const builder = new BlissSVGBuilder('DOT');
      const svg = builder.svgCode;

      // No unclosed quote bleeds into the next tag (path d, stroke-width).
      expect(svg).not.toMatch(/<path d="[^"]*</);
      expect(svg).not.toMatch(/stroke-width="[^"]*</);
      expect(svg).toMatch(/<path d="[^"]*"\/>/);
    });

    it('COMMA produces valid SVG with properly quoted attributes', () => {
      const builder = new BlissSVGBuilder('COMMA');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/<path d="[^"]*</);
      expect(svg).not.toMatch(/stroke-width="[^"]*</);

      const pathMatches = svg.match(/<path d="[^"]*"\/>/g);
      expect(pathMatches).toBeTruthy();
      expect(pathMatches.length).toBeGreaterThan(0);
    });

    it('element-level DOT wrapper produces valid SVG', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1]|DOT');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/<g stroke-width="[^"]*</);
      expect(svg).not.toMatch(/<path d="[^"]*</);
      expect(svg).toMatch(/<g stroke-width="[^"]*"><path d="[^"]*"\/><\/g>/);
    });

    it('standaloneSvg includes XML declaration', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.standaloneSvg;

      expect(svg).toMatch(/^<\?xml version="1\.0" encoding="utf-8"\?>\n/);
    });

    it('svgCode does not include XML declaration', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<?xml');
      expect(svg).toMatch(/^<svg /);
    });

    it('complex code with DOT/COMMA produces valid SVG', () => {
      const builder = new BlissSVGBuilder('B109;B99//B291');
      const svg = builder.svgCode;

      expect(svg).not.toMatch(/="[^"]*</);

      // Open-tag count equals close-tag count; self-closing tags count as both.
      const selfClosing = (svg.match(/<(path|rect)[^>]*\/>/g) || []).length;
      const openTags = (svg.match(/<(svg|g|path)[^>]*(?<!\/)>/g) || []).length;
      const closeTags = (svg.match(/<\/(svg|g|path)>/g) || []).length;
      expect(openTags).toBe(closeTags);
    });
  });

  describe('when color is set', () => {
    it('applies color (maps to stroke) at global level (on content group)', () => {
      const builder = new BlissSVGBuilder('[color=red]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
    });

    it('applies color (maps to stroke) at element level (on <g> wrapper)', () => {
      const builder = new BlissSVGBuilder('[color=blue]|H');
      const svg = builder.svgCode;

      // Element scope leaves content group at the default stroke (#000000)
      // and renders stroke="blue" on the inner <g>.
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="#000000"/);
      expect(svg).toMatch(/<g stroke="blue"/);
    });

    it('allows element-level color to override global visually', () => {
      const builder = new BlissSVGBuilder('[color=red]||[color=blue]|H');
      const svg = builder.svgCode;

      // Global color lands on the content group; the inner <g stroke="blue">
      // visually overrides for the wrapped element.
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).toMatch(/<g stroke="blue"/);
    });

    it('renders color at both global and element scopes (multi-level option, not in internalOptions)', () => {
      const globalBuilder = new BlissSVGBuilder('[color=green]||H');
      const elementBuilder = new BlissSVGBuilder('[color=green]|H');

      expect(globalBuilder.svgCode).toContain('stroke="green"');
      expect(elementBuilder.svgCode).toContain('stroke="green"');
    });

    it('passes an rgba() color value through to the stroke attribute unchanged', () => {
      const builder = new BlissSVGBuilder('[color=rgba(255,0,0,0.5)]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="rgba\(255,0,0,0\.5\)"/);
    });

    it('passes an rgb() color value through to the stroke attribute unchanged', () => {
      const builder = new BlissSVGBuilder('[color=rgb(0,128,255)]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="rgb\(0,128,255\)"/);
    });
  });

  describe('when options appear at the part level', () => {
    it('wraps each part with options in <g> tags', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.2;stroke-dasharray=0.6 0.6]>C8:0,8');
      const svg = builder.svgContent;

      expect(svg).toContain('<g stroke-width="0.2" stroke-dasharray="0.6 0.6">');
      expect(svg).toContain('</g>');
    });

    it('applies different colors to different parts', () => {
      const builder = new BlissSVGBuilder('[color=red]>H:0,8;[color=green]>H:2,8;[color=blue]>H:4,8');
      const svg = builder.svgContent;

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke="green"');
      expect(svg).toContain('stroke="blue"');
    });
  });

  describe('when options appear at the character level', () => {
    it('wraps character with options in <g> tags', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.2]H:3,4;E:2,4');
      const svg = builder.svgContent;

      expect(svg).toContain('<g stroke-width="0.2">');
      expect(svg).toContain('</g>');
    });
  });

  describe('when global, element, and part options cascade through wrapper levels', () => {
    it('places a global stroke-width on the content group for a multi-character composition', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.4]||H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.4"/);
    });

    it('applies global to content group while element and part scopes create their own <g> wrappers', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.4]||[color=red]|[stroke-width=0.5]H/C8');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.4"/);
      expect(svg).toContain('<g stroke="red">');
      expect(svg).toContain('<g stroke-width="0.5">');
    });
  });

  describe('when options map to SVG attributes', () => {
    it('maps "color" to "stroke" attribute on content group', () => {
      const builder = new BlissSVGBuilder('[color=red]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).not.toContain('color="red"');
    });

    it('passes through standard SVG attributes to content group', () => {
      const builder = new BlissSVGBuilder('[stroke-width=1.5;fill=blue;opacity=0.5]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="1.5"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*fill="blue"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*opacity="0.5"/);
    });

    it('escapes HTML entities in attribute values on content group', () => {
      const builder = new BlissSVGBuilder('[id=test&value]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*id="test&amp;value"/);
    });
  });

  describe('when dot-extra-width is wired through to DOT and COMMA rendering', () => {
    // dot-extra-width is currently parsed and stored but not used at the option
    // level; DOT/COMMA elements read the hardcoded extraDotWidth from their
    // element definitions. Activating this contract requires wiring the builder
    // option through to override DOT/COMMA rendering while leaving SDOT unaffected.
    it.todo('wires dot-extra-width through to DOT/COMMA rendering');
  });
});
