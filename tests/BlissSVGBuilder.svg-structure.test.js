import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the structural shape of the generated SVG: which attributes live on
 * the root <svg>, the bliss-content wrapper, the optional bliss-grid wrapper,
 * and the optional bliss-background group; and the layer ordering between
 * them.
 *
 * Covers:
 * - Root <svg> attributes: xmlns, width, height, viewBox, data-generator;
 *   absence of version and baseProfile.
 * - Default styling attributes (fill, stroke, stroke-width, stroke-linejoin,
 *   stroke-linecap) and pass-through attributes (opacity, color, custom
 *   stroke-width) sit on the bliss-content group, not on the root.
 * - bliss-grid wrapper attributes (shape-rendering="crispEdges") and the
 *   Safari geometricPrecision override in the embedded <style> block; grid
 *   absence when grid is disabled.
 * - bliss-grid-line CSS class names (--minor / --medium / --major /
 *   --major--sky / --major--earth) and absence of unprefixed grid-line
 *   classes.
 * - bliss-background group per-zone rendering (--top / --mid / --bottom);
 *   bulk background as zone default; single bliss-background rect when
 *   background is set without zones; absence when no background option.
 * - Background zone Y coordinates under default margin (top extends into
 *   top margin to y=-0.75; mid covers y=8..16; bottom extends into bottom
 *   margin to y+height=20.75).
 * - Layer ordering: background before grid before content.
 * - `builder.svgElement` throws in a Node.js environment when no DOM
 *   parser is available.
 * - `builder.standaloneSvg` is a complete XML document: it starts with the
 *   `<?xml ?>` declaration, contains an `<svg ... xmlns="...">` element
 *   and a closing `</svg>`, and embeds the `svgCode` after the
 *   declaration. The XML declaration omits the `standalone` attribute.
 * - `svgCode` emission discipline: no empty lines, no trailing whitespace,
 *   2-space indentation on direct `<svg>` children, 4-space indentation on
 *   grandchildren, closing `</g>` indented at 2 spaces, self-closing
 *   `<path .../>` tags (no `</path>`), no XML declaration in `svgCode`,
 *   and no inter-element gaps when optional elements (title, background,
 *   grid) are absent.
 * - `builder.svgContent` returns the inner body only: no `<svg>` wrapper,
 *   contains `<path>` content, and is a substring of `svgCode`.
 *
 * Does NOT cover:
 * - Visual pixel-level regression of the rendered SVG, see
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 * - Stroke-width, color, and opacity option-value parsing, multi-scope
 *   rendering, and DOT/COMMA-formula handling, see
 *   `BlissSVGBuilder.stroke-color.test.js`. Grid option rendering is in
 *   `BlissSVGBuilder.grid.test.js`; background option rendering (single
 *   bulk-color rect, color formats, positioning with margin/crop,
 *   z-order against title/desc/grid/content) is in
 *   `BlissSVGBuilder.svg-metadata.test.js`.
 * - SVG serialization to / from the JSON snapshot or the toString form,
 *   see `BlissSVGBuilder.json-output.test.js` and
 *   `BlissSVGBuilder.string-output.test.js`.
 * - Height/width numeric semantics on the BlissElement tree, see
 *   `BlissSVGBuilder.character-height.test.js` and
 *   `BlissSVGBuilder.element-bounds.test.js`.
 */
describe('BlissSVGBuilder svg structure', () => {

  describe('when reading the root <svg> element', () => {
    it('omits the version attribute', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toMatch(/\bversion="/);
    });

    it('omits the baseProfile attribute', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toMatch(/baseProfile="/);
    });

    it('includes a data-generator attribute prefixed with the package name', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).toMatch(/data-generator="bliss-svg-builder\//);
    });

    it('includes the SVG xmlns', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('includes width, height, and viewBox', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).toMatch(/<svg[^>]*width="/);
      expect(svg).toMatch(/<svg[^>]*height="/);
      expect(svg).toMatch(/<svg[^>]*viewBox="/);
    });
  });

  describe('when wrapping content in the bliss-content group', () => {
    it('wraps the rendered content in <g class="bliss-content">', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).toContain('<g class="bliss-content"');
    });

    it('places default styling attributes on the content group and not on the root', () => {
      const svg = new BlissSVGBuilder('H').svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*fill="none"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="#000000"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="0.5"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-linejoin="round"/);
      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-linecap="round"/);

      expect(svg).not.toMatch(/<svg[^>]*fill="/);
      expect(svg).not.toMatch(/<svg[^>]*stroke="/);
      expect(svg).not.toMatch(/<svg[^>]*stroke-width="/);
      expect(svg).not.toMatch(/<svg[^>]*stroke-linejoin="/);
      expect(svg).not.toMatch(/<svg[^>]*stroke-linecap="/);
    });

    it('places pass-through option attributes on the content group', () => {
      const svg = new BlissSVGBuilder('[opacity=0.5]||H').svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*opacity="0.5"/);
      expect(svg).not.toMatch(/<svg[^>]*opacity="/);
    });

    it('places a custom stroke-width on the content group', () => {
      const svg = new BlissSVGBuilder('[stroke-width=1]||H').svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke-width="1"/);
      expect(svg).not.toMatch(/<svg[^>]*stroke-width="/);
      expect(svg).not.toContain('strokeWidth=');
    });

    it('places a custom color as the stroke on the content group', () => {
      const svg = new BlissSVGBuilder('[color=red]||H').svgCode;

      expect(svg).toMatch(/<g class="bliss-content"[^>]*stroke="red"/);
      expect(svg).not.toMatch(/<svg[^>]*stroke="/);
    });

    it('closes the content group after the path content and before </svg>', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).toMatch(/<g class="bliss-content"[^>]*>[\s\S]*<path d="[^"]+"[\s\S]*<\/g>\s*<\/svg>/);
    });
  });

  describe('when grid is enabled', () => {
    it('wraps grid paths in <g class="bliss-grid">', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(svg).toContain('<g class="bliss-grid"');
      expect(svg).toMatch(/<g class="bliss-grid"[^>]*>[\s\S]*bliss-grid-line[\s\S]*<\/g>/);
    });

    it('places the grid group before the content group', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      const gridPos = svg.indexOf('bliss-grid');
      const contentPos = svg.indexOf('bliss-content');
      expect(gridPos).toBeLessThan(contentPos);
    });

    it('sets shape-rendering="crispEdges" on the grid group', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(svg).toMatch(/<g class="bliss-grid"[^>]*shape-rendering="crispEdges"/);
    });

    it('emits a Safari shape-rendering override in an embedded style block', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(svg).toContain('@supports (-webkit-hyphens: none)');
      expect(svg).toContain('.bliss-grid-line { shape-rendering: geometricPrecision; }');
    });

    it('uses the bliss- prefix on every grid-line class (minor, medium, major, sky, earth)', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth"');
    });

    it('does not emit unprefixed grid-line classes', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(svg).not.toMatch(/class="grid-line /);
      expect(svg).not.toMatch(/class="grid-line"/);
    });
  });

  describe('when grid is disabled', () => {
    it('omits the bliss-grid group entirely', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toContain('bliss-grid');
    });

    it('omits the embedded style block and shape-rendering override', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toContain('<style>');
      expect(svg).not.toContain('shape-rendering');
    });
  });

  describe('when individual background zone options are set', () => {
    it('renders the top zone rect when background-top is set', () => {
      const svg = new BlissSVGBuilder('[background-top=pink]||H').svgCode;
      expect(svg).toContain('class="bliss-background--top"');
      expect(svg).toContain('fill="pink"');
      expect(svg).toContain('<g class="bliss-background">');
    });

    it('renders the mid zone rect when background-mid is set', () => {
      const svg = new BlissSVGBuilder('[background-mid=lightgreen]||H').svgCode;
      expect(svg).toContain('class="bliss-background--mid"');
      expect(svg).toContain('fill="lightgreen"');
    });

    it('renders the bottom zone rect when background-bottom is set', () => {
      const svg = new BlissSVGBuilder('[background-bottom=lightblue]||H').svgCode;
      expect(svg).toContain('class="bliss-background--bottom"');
      expect(svg).toContain('fill="lightblue"');
    });

    it('renders all three zone rects when top, mid, and bottom are all set', () => {
      const svg = new BlissSVGBuilder('[background-top=red;background-mid=green;background-bottom=blue]||H').svgCode;
      expect(svg).toContain('bliss-background--top');
      expect(svg).toContain('bliss-background--mid');
      expect(svg).toContain('bliss-background--bottom');
    });
  });

  describe('when bulk background interacts with per-zone overrides', () => {
    it('uses the bulk value as the default fill for zones the per-zone option did not override', () => {
      const svg = new BlissSVGBuilder('[background=gray;background-top=pink]||H').svgCode;
      expect(svg).toMatch(/bliss-background--top[^>]*fill="pink"/);
      expect(svg).toMatch(/bliss-background--mid[^>]*fill="gray"/);
      expect(svg).toMatch(/bliss-background--bottom[^>]*fill="gray"/);
    });
  });

  describe('when bulk background is used alone without per-zone options', () => {
    it('renders a single full-height bliss-background rect with no per-zone classes', () => {
      const svg = new BlissSVGBuilder('[background=lightblue]||H').svgCode;
      expect(svg).not.toContain('bliss-background--');
      expect(svg).toContain('bliss-background');
      expect(svg).toContain('fill="lightblue"');
    });
  });

  describe('when no background option is set', () => {
    it('omits the bliss-background group entirely', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toContain('bliss-background');
    });
  });

  describe('when computing background zone Y coordinates with default margin', () => {
    // Default margin=0.75; top zone extends into the top margin (y starts at -0.75).
    it('extends the top zone into the top margin from y=-0.75 to y=8', () => {
      const svg = new BlissSVGBuilder('[background-top=pink]||H').svgCode;
      expect(svg).toMatch(/bliss-background--top[^>]*y="-0.75"/);
      expect(svg).toMatch(/bliss-background--top[^>]*height="8.75"/);
    });

    it('covers y=8 to y=16 for the mid zone', () => {
      const svg = new BlissSVGBuilder('[background-mid=pink]||H').svgCode;
      expect(svg).toMatch(/bliss-background--mid[^>]*y="8"/);
      expect(svg).toMatch(/bliss-background--mid[^>]*height="8"/);
    });

    // Default margin=0.75; bottom zone extends to viewBoxY + viewBoxHeight = 20.75.
    it('extends the bottom zone from y=16 into the bottom margin to y+height=20.75', () => {
      const svg = new BlissSVGBuilder('[background-bottom=pink]||H').svgCode;
      expect(svg).toMatch(/bliss-background--bottom[^>]*y="16"/);
      expect(svg).toMatch(/bliss-background--bottom[^>]*height="4.75"/);
    });
  });

  describe('when layering background, grid, and content', () => {
    it('emits the background group before the grid group before the content group', () => {
      const svg = new BlissSVGBuilder('[grid;background-top=pink]||H').svgCode;
      const bgPos = svg.indexOf('bliss-background');
      const gridPos = svg.indexOf('bliss-grid');
      const contentPos = svg.indexOf('bliss-content');
      expect(bgPos).toBeLessThan(gridPos);
      expect(gridPos).toBeLessThan(contentPos);
    });
  });

  describe('when reading svgElement in a Node environment without DOMParser', () => {
    it('throws because the DOM parser is unavailable', () => {
      const builder = new BlissSVGBuilder('H');
      expect(() => builder.svgElement).toThrow();
    });
  });

  describe('when reading standaloneSvg as a complete document', () => {
    it('starts with the XML declaration', () => {
      const standalone = new BlissSVGBuilder('H').standaloneSvg;
      expect(standalone).toMatch(/^<\?xml version="1\.0" encoding="utf-8"\?>/);
    });

    it('contains an opening <svg> with the SVG xmlns and a closing </svg>', () => {
      const standalone = new BlissSVGBuilder('H').standaloneSvg;
      expect(standalone).toContain('<svg');
      expect(standalone).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(standalone).toContain('</svg>');
    });

    it('embeds the svgCode after the XML declaration', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.standaloneSvg).toContain(builder.svgCode);
    });

    it('omits the standalone attribute from the XML declaration', () => {
      const standalone = new BlissSVGBuilder('H').standaloneSvg;
      expect(standalone).not.toContain('standalone');
    });
  });

  describe('when emitting svgCode, every line is non-empty', () => {
    const lines = (svg) => svg.split('\n');

    it('emits no empty lines for a minimal H input', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(lines(svg).some(l => l.trim() === '')).toBe(false);
    });

    it('emits no empty lines when title, desc, and background are set', () => {
      const svg = new BlissSVGBuilder('[svg-title=test;svg-desc=desc;background=#fff]||H').svgCode;
      expect(lines(svg).some(l => l.trim() === '')).toBe(false);
    });

    it('emits no empty lines when grid is enabled', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(lines(svg).some(l => l.trim() === '')).toBe(false);
    });

    it('emits no empty lines when title, desc, background, and grid are all set', () => {
      const svg = new BlissSVGBuilder('[svg-title=t;svg-desc=d;background=#eee;grid]||H').svgCode;
      expect(lines(svg).some(l => l.trim() === '')).toBe(false);
    });

    it('emits no empty lines in standaloneSvg', () => {
      const svg = new BlissSVGBuilder('[svg-title=t;grid]||H').standaloneSvg;
      expect(lines(svg).some(l => l.trim() === '')).toBe(false);
    });
  });

  describe('when emitting svgCode, indentation is consistent', () => {
    const lines = (svg) => svg.split('\n');

    it('opens <svg> at column 0', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(lines(svg)[0]).toMatch(/^<svg /);
    });

    it('closes </svg> at column 0', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(lines(svg).at(-1)).toBe('</svg>');
    });

    it('indents direct children of <svg> by 2 spaces', () => {
      const svg = new BlissSVGBuilder('[svg-title=t;svg-desc=d;background=#eee;grid]||H').svgCode;
      const childTags = lines(svg).filter(l =>
        /^\s+<(title|desc|rect|style|g\s)/.test(l)
      );
      expect(childTags.length).toBeGreaterThan(0);
      for (const line of childTags) {
        expect(line).toMatch(/^  </, `Expected 2-space indent: "${line}"`);
        expect(line).not.toMatch(/^    </, `Expected exactly 2 spaces, not 4: "${line}"`);
      }
    });

    it('indents grandchildren (grid paths, content path) by 4 spaces', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      const pathLines = lines(svg).filter(l => /^\s+<path /.test(l));
      expect(pathLines.length).toBeGreaterThan(0);
      for (const line of pathLines) {
        expect(line).toMatch(/^    <path /, `Expected 4-space indent: "${line}"`);
      }
    });

    it('indents closing </g> tags by 2 spaces', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      const closingGs = lines(svg).filter(l => l.includes('</g>'));
      expect(closingGs.length).toBeGreaterThan(0);
      for (const line of closingGs) {
        expect(line).toBe('  </g>');
      }
    });
  });

  describe('when emitting svgCode, there is no trailing whitespace', () => {
    it('emits no lines with trailing whitespace', () => {
      const svg = new BlissSVGBuilder('[svg-title=t;svg-desc=d;background=#eee;grid]||H').svgCode;
      for (const line of svg.split('\n')) {
        expect(line).not.toMatch(/\s$/, `Trailing whitespace found: "${line}"`);
      }
    });
  });

  describe('when emitting path elements, they are self-closing', () => {
    it('svgCode contains no </path> closing tags', () => {
      const svg = new BlissSVGBuilder('[grid]||H').svgCode;
      expect(svg).not.toContain('</path>');
    });

    it('svgContent contains only self-closing <path .../> tags', () => {
      const content = new BlissSVGBuilder('H').svgContent;
      expect(content).not.toContain('</path>');
      expect(content).toMatch(/<path [^>]*\/>/);
    });
  });

  describe('when emitting the XML declaration', () => {
    it('svgCode contains no XML declaration', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      expect(svg).not.toContain('<?xml');
    });
  });

  describe('when conditional elements (title, background, grid) are absent', () => {
    const lines = (svg) => svg.split('\n');

    it('leaves no gap between <svg> and the next element when title is absent', () => {
      const svg = new BlissSVGBuilder('H').svgCode;
      const svgLines = lines(svg);
      expect(svgLines[0]).toMatch(/^<svg /);
      expect(svgLines[1]).toMatch(/^  </);
    });

    it('leaves no gap after the title when background is absent', () => {
      const svg = new BlissSVGBuilder('[svg-title=t]||H').svgCode;
      const svgLines = lines(svg);
      const titleIdx = svgLines.findIndex(l => l.includes('<title>'));
      expect(svgLines[titleIdx + 1]).toMatch(/^  </);
    });

    it('leaves no gap after the background when grid is absent', () => {
      const svg = new BlissSVGBuilder('[svg-title=t;background=#fff]||H').svgCode;
      const svgLines = lines(svg);
      const bgIdx = svgLines.findIndex(l => l.includes('bliss-background'));
      expect(svgLines[bgIdx + 1]).toMatch(/^  </);
    });
  });

  describe('when reading svgContent without the <svg> wrapper', () => {
    it('does not include the <svg> wrapper or </svg> close', () => {
      const content = new BlissSVGBuilder('H').svgContent;
      expect(content).not.toMatch(/^<svg/);
      expect(content).not.toContain('</svg>');
    });

    it('contains <path> content', () => {
      const content = new BlissSVGBuilder('H').svgContent;
      expect(content).toContain('<path');
    });

    it('is a substring of svgCode', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.svgCode).toContain(builder.svgContent);
    });
  });
});
