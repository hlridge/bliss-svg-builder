import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the grid option family on BlissSVGBuilder: how `[grid]` (boolean
 * toggle), `grid-color` and its category/specific overrides, and
 * `grid-stroke-width` and its category/specific overrides render the
 * five grid lines and their BEM-class structure.
 *
 * The five grid lines are: `minor`, `medium`, `major` (sparse),
 * `major--sky` (y=8), `major--earth` (y=16). Color and width options
 * cascade by Universal Options Principle: bulk → category → specific
 * (CSS-shorthand semantics).
 *
 * Covers:
 * - `[grid]` boolean toggle: shows / hides the grid layer.
 * - BEM class structure: every grid path carries the base class
 *   `bliss-grid-line` plus a modifier (`--minor`, `--medium`, `--major`,
 *   plus `--sky` / `--earth` on the two major split lines).
 * - Sky/earth render as separate `<path>` elements at y=8 and y=16.
 * - `grid-color` bulk option: paints all five lines.
 * - `grid-{major,medium,minor}-color` category options: paint a tier
 *   (major paints sparse + sky + earth together); others keep defaults.
 * - `grid-{sky,earth}-color` specific options: paint a single split
 *   major line; the other split major keeps the default.
 * - Color cascade: bulk → category → specific override precedence,
 *   including the full three-layer chain.
 * - `grid-stroke-width` bulk + `grid-{category}-stroke-width` +
 *   `grid-{sky,earth}-stroke-width` cascade (same shape as color).
 * - Combined color and stroke-width: orthogonal cascades compose
 *   independently.
 * - DSL/API parity + round-trip: a grid option set via the canonical
 *   single-bracket DSL (`[grid;grid-color=red]||`) renders byte-identically
 *   to the JS-API form (`{ grid: true, gridColor: 'red' }`) and survives
 *   toString (default + preserve) and toJSON round-trips. (Regression pin
 *   for Chunk 9: the two-bracket form `[grid][grid-color=red]||` is invalid
 *   syntax and warns MULTIPLE_OPTION_BRACKETS, see
 *   `BlissParser.bracket-options.test.js`.)
 *
 * Does NOT cover:
 * - Grid alignment with `center` and `min-width`, see
 *   `BlissSVGBuilder.spacing-options.test.js`.
 * - Grid presence within SVG structural assertions (root, content group,
 *   layer ordering), see `BlissSVGBuilder.svg-structure.test.js`.
 * - Grid as part of multi-option scenarios in hierarchical syntax, see
 *   `BlissSVGBuilder.hierarchical-options.test.js`.
 */
describe('BlissSVGBuilder grid', () => {
  describe('when grid is enabled', () => {
    it('renders five grid-line paths covering minor, medium, major, sky, and earth', () => {
      const builder = new BlissSVGBuilder('[grid]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth"');
    });
  });

  describe('when grid is absent or omitted', () => {
    it('emits no grid markup when the input has no [grid] option', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('bliss-grid-line');
    });

    it('defaults to hidden when no grid option is supplied', () => {
      const builder = new BlissSVGBuilder('H');
      const svg = builder.svgCode;

      expect(svg).not.toContain('bliss-grid-line');
    });
  });

  describe('when reading the rendered grid-line CSS classes', () => {
    it('emits exactly five bliss-grid-line elements with the five expected modifiers', () => {
      const builder = new BlissSVGBuilder('[grid]||H');
      const svg = builder.svgCode;

      expect(svg.match(/class="bliss-grid-line/g)?.length).toBe(5);
      expect(svg).toContain('bliss-grid-line--minor');
      expect(svg).toContain('bliss-grid-line--medium');
      expect(svg).toContain('bliss-grid-line--major');
      expect(svg).toContain('bliss-grid-line--sky');
      expect(svg).toContain('bliss-grid-line--earth');
    });

    it('places the sky path at y=8 and the earth path at y=16, in separate <path> elements', () => {
      const builder = new BlissSVGBuilder('[grid]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('bliss-grid-line--sky');
      expect(svg).toMatch(/bliss-grid-line--sky[^>]*d="M0,8h/);
      expect(svg).toContain('bliss-grid-line--earth');
      expect(svg).toMatch(/bliss-grid-line--earth[^>]*d="M0,16h/);

      const skyPathMatch = svg.match(/<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky"[^>]*>/);
      const earthPathMatch = svg.match(/<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth"[^>]*>/);
      expect(skyPathMatch).toBeTruthy();
      expect(earthPathMatch).toBeTruthy();
    });
  });

  describe('when grid-color is set as a bulk option', () => {
    it('paints all five grid lines with that single color', () => {
      const builder = new BlissSVGBuilder('[grid;grid-color=red]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="red"');
    });
  });

  describe('when a category color option is set', () => {
    it('paints all three major tiers (sparse + sky + earth) under grid-major-color, leaving medium and minor at defaults', () => {
      const builder = new BlissSVGBuilder('[grid;grid-major-color=blue]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="#ebebeb"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="#ebebeb"');
    });

    it('paints only the medium tier under grid-medium-color, leaving the other four lines at defaults', () => {
      const builder = new BlissSVGBuilder('[grid;grid-medium-color=green]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="green"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="#ebebeb"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="#c7c7c7"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="#858585"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="#858585"');
    });

    it('paints only the minor tier under grid-minor-color, leaving the other four lines at defaults', () => {
      const builder = new BlissSVGBuilder('[grid;grid-minor-color=purple]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="purple"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="#ebebeb"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="#c7c7c7"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="#858585"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="#858585"');
    });
  });

  describe('when a specific (single-line) color option is set', () => {
    it('paints only the sky line under grid-sky-color, leaving earth and the sparse major at defaults', () => {
      const builder = new BlissSVGBuilder('[grid;grid-sky-color=orange]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="orange"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="#858585"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="#c7c7c7"');
    });

    it('paints only the earth line under grid-earth-color, leaving sky and the sparse major at defaults', () => {
      const builder = new BlissSVGBuilder('[grid;grid-earth-color=cyan]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="cyan"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="#858585"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="#c7c7c7"');
    });
  });

  describe('when multiple color options compete (bulk → category → specific cascade)', () => {
    it('lets a specific option override its category option for the same line', () => {
      const builder = new BlissSVGBuilder('[grid;grid-major-color=blue;grid-sky-color=red]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="blue"');
    });

    it('lets a category option override the bulk color for that tier', () => {
      const builder = new BlissSVGBuilder('[grid;grid-color=red;grid-major-color=blue]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="red"');
    });

    it('resolves the full chain bulk → category → specific so each line gets the most-specific color set on it', () => {
      const builder = new BlissSVGBuilder('[grid;grid-color=red;grid-major-color=blue;grid-sky-color=green]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166" stroke="green"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="red"');
    });
  });

  describe('when grid-stroke-width is set or overridden', () => {
    it('paints all five lines with the same width under bulk grid-stroke-width', () => {
      const builder = new BlissSVGBuilder('[grid;grid-stroke-width=0.5]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.5"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.5"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="0.5"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.5"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="0.5"');
    });

    it('lets a category width option override the bulk grid-stroke-width for its tier', () => {
      const builder = new BlissSVGBuilder('[grid;grid-stroke-width=0.5;grid-major-stroke-width=1.0]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="1"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="1"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="1"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.5"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.5"');
    });

    it('lets a specific width option override the category width for a single line', () => {
      const builder = new BlissSVGBuilder('[grid;grid-major-stroke-width=1.0;grid-sky-stroke-width=2.0]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="2"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="1"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="1"');
    });
  });

  describe('when color and stroke-width options are set together', () => {
    it('resolves each cascade independently so a line can carry a specific color and a category width', () => {
      const builder = new BlissSVGBuilder('[grid;grid-color=red;grid-major-stroke-width=1.0;grid-sky-color=blue]||H');
      const svg = builder.svgCode;

      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="1" stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="1" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major" stroke-width="1" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--medium" stroke-width="0.166" stroke="red"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor" stroke-width="0.166" stroke="red"');
    });
  });

  describe('when the same grid option is set via the DSL and the JS API', () => {
    const gridCases = [
      ['grid-color bulk', '[grid;grid-color=red]||B291', { grid: true, gridColor: 'red' }],
      ['grid-major-color category', '[grid;grid-major-color=blue]||B291', { grid: true, gridMajorColor: 'blue' }],
      ['grid-sky-color specific', '[grid;grid-sky-color=green]||B291', { grid: true, gridSkyColor: 'green' }],
      ['grid-earth-color specific', '[grid;grid-earth-color=orange]||B291', { grid: true, gridEarthColor: 'orange' }],
      ['grid-medium-color category', '[grid;grid-medium-color=pink]||B291', { grid: true, gridMediumColor: 'pink' }],
      ['grid-minor-color category', '[grid;grid-minor-color=cyan]||B291', { grid: true, gridMinorColor: 'cyan' }],
      ['grid-stroke-width bulk', '[grid;grid-stroke-width=0.5]||B291', { grid: true, gridStrokeWidth: 0.5 }],
    ];

    it.each(gridCases)('renders %s byte-identically from the DSL and the JS API', (_label, dsl, apiOpts) => {
      const fromDsl = new BlissSVGBuilder(dsl).svgCode;
      const fromApi = new BlissSVGBuilder('B291', apiOpts).svgCode;

      expect(fromDsl).toBe(fromApi);
    });

    it.each(gridCases)('round-trips %s through toString, preserve, and toJSON', (_label, dsl) => {
      const builder = new BlissSVGBuilder(dsl);
      const expected = builder.svgCode;

      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(expected);
      expect(new BlissSVGBuilder(builder.toString({ preserve: true })).svgCode).toBe(expected);
      expect(new BlissSVGBuilder(builder.toJSON()).svgCode).toBe(expected);
    });
  });
});
