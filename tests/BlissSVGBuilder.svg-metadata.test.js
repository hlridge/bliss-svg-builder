import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how SVG-metadata and presentation options shape the rendered output:
 * svg-height aspect-ratio handling, svg-title and svg-desc accessibility
 * elements, HTML-entity escaping across metadata and color/passthrough
 * surfaces, the text-overlay parse-but-no-render placeholder, and
 * background-rect rendering with z-order across title/desc, grid, and
 * content layers.
 *
 * Covers:
 * - `svg-height=N` controls explicit pixel height with aspect-ratio-preserving
 *   width derived from the active viewBox; default (no option) auto-calculates
 *   both at 6x viewBox dimensions; edge cases (0, very large numeric, non-
 *   numeric fallback to default).
 * - `svg-height` interacts correctly with `margin` and `crop` (the viewBox
 *   actually used for the aspect ratio is the post-margin / post-crop one).
 * - `svg-title=TEXT` renders a `<title>` element inside `<svg>`; `svg-desc`
 *   renders a `<desc>`; when both are set, `<title>` appears before `<desc>`;
 *   empty string omits the element; both are omitted by default.
 * - Special characters (`&`, `<`, `>`) inside `svg-title` / `svg-desc` are
 *   HTML-entity escaped in the output.
 * - Long text inside `svg-title` (and by extension `svg-desc`) is preserved
 *   without an arbitrary length limit.
 * - HTML-injection hardening: `<script>` / `<img onerror=...>` payloads inside
 *   `svg-title`, `svg-desc`, `color`, `grid-color`, and unknown passthrough
 *   attribute values are escaped; quote-escaping prevents attribute-breakout
 *   in `background` and `grid-color`; values without unsafe characters are
 *   not double-escaped.
 * - `text=...` option is accepted by the parser but does not currently render
 *   a `<text>` element (placeholder; future feature).
 * - `background=COLOR` renders a `<rect class="bliss-background" ... fill="…"/>`
 *   that covers the full viewBox via `width="100%" height="100%"` and is
 *   positioned at the viewBox origin (margin- and crop-aware).
 * - Default background is transparent (no `<rect>` emitted); empty-string
 *   value is treated as no background.
 * - Background color value formats: named colors, hex (`#rrggbb`), hsl(),
 *   rgba() with comma-delimited args.
 * - Z-order: background rect appears after `<title>`/`<desc>`, before the
 *   grid layer, and before the content paths.
 *
 * Does NOT cover:
 * - Multi-zone bliss-background top/mid/bottom rendering (per-zone class
 *   names, zone defaults, bulk-with-override interactions), see
 *   `BlissSVGBuilder.svg-structure.test.js`.
 * - Prototype-polluting bracket option key names (`__proto__`, `constructor`),
 *   see `BlissSVGBuilder.option-hardening.test.js`.
 * - Stroke-width and color cascade rendering across global / element / part
 *   scopes, see `BlissSVGBuilder.stroke-color.test.js`.
 * - Grid-line rendering and grid color cascade, see
 *   `BlissSVGBuilder.grid.test.js`.
 * - Margin and crop viewBox math (the inputs `svg-height` consumes), see
 *   `BlissSVGBuilder.margin.test.js` and `BlissSVGBuilder.crop.test.js`.
 * - 4-level hierarchical option cascade across global / word / character /
 *   part scopes, see `BlissSVGBuilder.hierarchical-options.test.js`.
 * - Visual regression of metadata-bearing or background-bearing SVGs, see
 *   `BlissSVGBuilder.VisualRegression.e2e.test.js`.
 * - Top-level `<svg>` element structure (root attributes, content group
 *   wrapping, CSS class naming), see `BlissSVGBuilder.svg-structure.test.js`.
 */
describe('BlissSVGBuilder svg metadata', () => {

  describe('when svg-height controls output dimensions', () => {
    it('uses default auto-calculated dimensions (6x viewBox)', () => {
      const builder = new BlissSVGBuilder('[margin=0]||H');
      const svg = builder.svgCode;

      // H has width=8, height=20, margin=0 → viewBox="0 0 8 20"
      // Default: svgWidth = 6 * 8 = 48, svgHeight = 6 * 20 = 120
      expect(svg).toMatch(/<svg[^>]*width="48"/);
      expect(svg).toMatch(/<svg[^>]*height="120"/);
      expect(svg).toContain('viewBox="0 0 8 20"');
    });

    it('sets custom height and auto-calculates width to maintain aspect ratio', () => {
      const builder = new BlissSVGBuilder('[margin=0;svg-height=100]||H');
      const svg = builder.svgCode;

      // viewBox="0 0 8 20" → aspect ratio = 8/20 = 0.4
      // svgHeight = 100, svgWidth = (8 / 20) * 100 = 40
      expect(svg).toMatch(/<svg[^>]*width="40"/);
      expect(svg).toMatch(/<svg[^>]*height="100"/);
      expect(svg).toContain('viewBox="0 0 8 20"');
    });

    it('maintains aspect ratio with different viewBox dimensions', () => {
      const builder = new BlissSVGBuilder('[margin=5;svg-height=150]||H');
      const svg = builder.svgCode;

      // H: width=8, height=20; margin=5 → viewBox="-5 -5 18 30"
      // aspect ratio = 18/30 = 0.6, svgWidth = (18 / 30) * 150 = 90
      expect(svg).toMatch(/<svg[^>]*width="90"/);
      expect(svg).toMatch(/<svg[^>]*height="150"/);
      expect(svg).toContain('viewBox="-5 -5 18 30"');
    });

    it('handles svg-height with crop (smaller viewBox)', () => {
      const builder = new BlissSVGBuilder('[margin=0;crop=2;svg-height=80]||H');
      const svg = builder.svgCode;

      // H: width=8, height=20; margin=0, crop=2 → viewBox="2 2 4 16"
      // aspect ratio = 4/16 = 0.25, svgWidth = (4 / 16) * 80 = 20
      expect(svg).toMatch(/<svg[^>]*width="20"/);
      expect(svg).toMatch(/<svg[^>]*height="80"/);
      expect(svg).toContain('viewBox="2 2 4 16"');
    });

    it('handles edge case: svg-height=0', () => {
      const builder = new BlissSVGBuilder('[margin=0;svg-height=0]||H');
      const svg = builder.svgCode;

      // svgHeight = 0, svgWidth = (8/20) * 0 = 0
      expect(svg).toMatch(/<svg[^>]*width="0"/);
      expect(svg).toMatch(/<svg[^>]*height="0"/);
    });

    it('handles edge case: very large svg-height value', () => {
      const builder = new BlissSVGBuilder('[margin=0;svg-height=10000]||H');
      const svg = builder.svgCode;

      // svgHeight = 10000, svgWidth = (8/20) * 10000 = 4000
      expect(svg).toMatch(/<svg[^>]*width="4000"/);
      expect(svg).toMatch(/<svg[^>]*height="10000"/);
    });

    it('ignores non-numeric svg-height values (uses default)', () => {
      const builder = new BlissSVGBuilder('[margin=0;svg-height=invalid]||H');
      const svg = builder.svgCode;

      // Non-numeric value ignored, falls back to default 6x viewBox dimensions
      expect(svg).toMatch(/<svg[^>]*width="48"/);
      expect(svg).toMatch(/<svg[^>]*height="120"/);
    });
  });

  describe('when svg-title and svg-desc add accessibility metadata', () => {
    it('adds <title> element when svg-title is specified', () => {
      const builder = new BlissSVGBuilder('[svg-title=Letter H]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<title>Letter H</title>');

      const svgMatch = svg.match(/<svg[^>]*>(.*)<\/svg>/s);
      expect(svgMatch).toBeTruthy();
      const svgContent = svgMatch[1];
      expect(svgContent).toMatch(/<title>Letter H<\/title>/);
    });

    it('adds <desc> element when svg-desc is specified', () => {
      const builder = new BlissSVGBuilder('[svg-desc=A capital letter H in Bliss]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<desc>A capital letter H in Bliss</desc>');
    });

    it('adds both title and desc when both are specified', () => {
      const builder = new BlissSVGBuilder('[svg-title=Letter H;svg-desc=A capital letter H]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<title>Letter H</title>');
      expect(svg).toContain('<desc>A capital letter H</desc>');

      const titleIndex = svg.indexOf('<title>');
      const descIndex = svg.indexOf('<desc>');
      expect(titleIndex).toBeGreaterThan(-1);
      expect(descIndex).toBeGreaterThan(-1);
      expect(titleIndex).toBeLessThan(descIndex);
    });

    it('handles empty string for svg-title (no title element)', () => {
      const builder = new BlissSVGBuilder('[svg-title=]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<title>');
    });

    it('handles empty string for svg-desc (no desc element)', () => {
      const builder = new BlissSVGBuilder('[svg-desc=]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<desc>');
    });

    it('handles special characters in svg-title', () => {
      const builder = new BlissSVGBuilder('[svg-title=H & I]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<title>H &amp; I</title>');
      expect(svg).not.toContain('<title>H & I</title>');
    });

    it('handles special characters in svg-desc', () => {
      const builder = new BlissSVGBuilder('[svg-desc=Greater > and less <]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<desc>Greater &gt; and less &lt;</desc>');
      expect(svg).not.toContain('<desc>Greater > and less <</desc>');
    });

    it('handles long text in svg-title (no arbitrary limits)', () => {
      const longTitle = 'A'.repeat(500);
      const builder = new BlissSVGBuilder(`[svg-title=${longTitle}]||H`);
      const svg = builder.svgCode;

      expect(svg).toContain(`<title>${longTitle}</title>`);
    });

    it('omits title and desc by default', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<title>');
      expect(svg).not.toContain('<desc>');
    });
  });

  describe('when SVG outputs escape unsafe characters', () => {
    it('escapes script injection in svg-title', () => {
      const builder = new BlissSVGBuilder('[svg-title=<script>alert(1)</script>]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('escapes script injection in svg-desc', () => {
      const builder = new BlissSVGBuilder('[svg-desc=<img onerror=alert(1)>]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<img');
      expect(svg).toContain('&lt;img');
    });

    it('escapes injection in background color', () => {
      const builder = new BlissSVGBuilder('[background=red" onload="alert(1)]||H');
      const svg = builder.svgCode;

      // Quotes are escaped, so onload= is trapped as harmless text inside
      // the fill value rather than breaking out into a real attribute
      expect(svg).toContain('&quot;');
      expect(svg).not.toMatch(/"\sonload=/);
    });

    it('escapes injection in color option', () => {
      const builder = new BlissSVGBuilder('[color=red"><script>]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('escapes injection in grid color', () => {
      const builder = new BlissSVGBuilder('[grid;grid-color=red" onclick="alert(1)]||H');
      const svg = builder.svgCode;

      // Quotes are escaped, so onclick= is trapped as harmless text inside
      // the stroke value rather than breaking out into a real attribute
      expect(svg).toContain('&quot;');
      expect(svg).not.toMatch(/"\sonclick=/);
    });

    it('escapes passthrough attribute values', () => {
      const builder = new BlissSVGBuilder('[data-info=<b>bold</b>]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<b>');
      expect(svg).toContain('&lt;b&gt;');
    });

    it('does not double-escape already safe values', () => {
      const builder = new BlissSVGBuilder('[svg-title=Hello World]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('<title>Hello World</title>');
    });
  });

  describe('when the text overlay option is set', () => {
    it('text option is parsed but not yet implemented', () => {
      const builder = new BlissSVGBuilder('[text=Hello]||H');
      const svg = builder.svgCode;

      // Option is stored on the builder, but `_getSvgText()` is commented
      // out in the source; no <text> element appears in the output yet
      expect(svg).not.toMatch(/<text[^>]*>Hello<\/text>/);
    });

    it.todo('wires text overlay rendering into svgCode output');
  });

  describe('when background color is set', () => {
    it('adds background rect when background color is specified', () => {
      const builder = new BlissSVGBuilder('[margin=0;background=red]||H');
      const svg = builder.svgCode;

      // H with margin=0 → viewBox="0 0 8 20"; rect covers full viewBox
      expect(svg).toContain('<rect class="bliss-background" x="0" y="0" width="100%" height="100%" stroke="none" fill="red"/>');
    });

    it('has transparent background by default (no rect)', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<rect');
    });

    it('handles empty string background (same as no background)', () => {
      const builder = new BlissSVGBuilder('[background=]||H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('<rect');
    });

    it('supports different color formats (hex)', () => {
      const builder = new BlissSVGBuilder('[margin=0;background=#ff0000]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('fill="#ff0000"');
    });

    it('supports different color formats (hsl)', () => {
      const builder = new BlissSVGBuilder('[margin=0;background=hsl(0,100%,50%)]||H');
      const svg = builder.svgCode;

      // Commas inside color functions are safe; semicolons would be split
      // by the bracket-option parser
      expect(svg).toContain('fill="hsl(0,100%,50%)"');
    });

    it('handles rgb/rgba with commas (semicolons inside functions need special handling)', () => {
      // Semicolons inside rgb()/rgba() are split by the parser (known
      // limitation); comma-delimited color functions are the safe form
      const builder = new BlissSVGBuilder('[margin=0;background=rgba(255,0,0,0.5)]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('fill="rgba(255,0,0,0.5)"');
    });

    it('supports named colors', () => {
      const builder = new BlissSVGBuilder('[margin=0;background=blue]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('fill="blue"');
    });

    it('positions rect correctly with margin', () => {
      const builder = new BlissSVGBuilder('[margin=2;background=yellow]||H');
      const svg = builder.svgCode;

      // H with margin=2 → viewBox="-2 -2 12 24"
      expect(svg).toContain('<rect class="bliss-background" x="-2" y="-2" width="100%" height="100%" stroke="none" fill="yellow"/>');
    });

    it('positions rect correctly with crop', () => {
      const builder = new BlissSVGBuilder('[margin=0;crop=1;background=green]||H');
      const svg = builder.svgCode;

      // H with margin=0, crop=1 → viewBox="1 1 6 18"
      expect(svg).toContain('<rect class="bliss-background" x="1" y="1" width="100%" height="100%" stroke="none" fill="green"/>');
    });

    it('background rect comes before content (z-order)', () => {
      const builder = new BlissSVGBuilder('[background=white]||H');
      const svg = builder.svgCode;

      const rectIndex = svg.indexOf('<rect');
      const pathIndex = svg.indexOf('<path');

      expect(rectIndex).toBeGreaterThan(-1);
      expect(pathIndex).toBeGreaterThan(-1);
      expect(rectIndex).toBeLessThan(pathIndex);
    });

    it('background rect comes after title and desc (z-order)', () => {
      const builder = new BlissSVGBuilder('[svg-title=Test;svg-desc=Description;background=white]||H');
      const svg = builder.svgCode;

      const titleIndex = svg.indexOf('<title>');
      const descIndex = svg.indexOf('<desc>');
      const rectIndex = svg.indexOf('<rect');

      expect(titleIndex).toBeGreaterThan(-1);
      expect(descIndex).toBeGreaterThan(-1);
      expect(rectIndex).toBeGreaterThan(-1);
      expect(titleIndex).toBeLessThan(rectIndex);
      expect(descIndex).toBeLessThan(rectIndex);
    });

    it('background works with grid (correct z-order)', () => {
      const builder = new BlissSVGBuilder('[grid;background=lightgray]||H');
      const svg = builder.svgCode;

      const rectIndex = svg.indexOf('<rect');
      const gridIndex = svg.indexOf('class="bliss-grid-line');

      expect(rectIndex).toBeGreaterThan(-1);
      expect(gridIndex).toBeGreaterThan(-1);
      expect(rectIndex).toBeLessThan(gridIndex);
    });

    it('background rect covers entire viewBox with 100% dimensions', () => {
      const builder = new BlissSVGBuilder('[margin=3;crop=1;background=pink]||H');
      const svg = builder.svgCode;

      expect(svg).toMatch(/<rect[^>]*width="100%"[^>]*height="100%"/);
    });
  });

});
