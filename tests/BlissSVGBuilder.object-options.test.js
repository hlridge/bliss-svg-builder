import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the constructor object-options API: a `{ defaults, overrides }`
 * second parameter to `new BlissSVGBuilder(input, opts)` provides
 * three-layer precedence (defaults < string options < overrides) over
 * the string-form options that appear inside the `[…]||` block of the
 * input.
 *
 * Covers:
 * - Defaults apply to inputs with no matching string options.
 * - String options override matching defaults.
 * - Overrides win over both defaults and string options.
 * - Three-layer combinations resolve per the precedence rule, including
 *   same-key and different-key cases.
 * - camelCase keys map to kebab-case SVG attributes; numeric values are
 *   clamped the same way as string options; string values are
 *   HTML-escaped.
 * - Bulk options (margin) and boolean options (grid) work through the
 *   object form, including a `grid: false` override disabling a grid set
 *   in the string.
 * - The second parameter is optional: undefined, null, empty objects, and
 *   absent are all accepted; null and undefined values inside
 *   defaults/overrides are skipped.
 *
 * Does NOT cover:
 * - Per-definition `defaultOptions` (which lives on glyph definitions,
 *   not on the constructor), see
 *   `BlissSVGBuilder.default-options.test.js`. The cascade rule there is
 *   different: a definition's defaultOptions wins over constructor
 *   defaults/overrides because the inner `<g>` cascades over the outer
 *   `<svg>`.
 * - The full string-form options pipeline (`[color=red]||H` etc.) and
 *   the four-level hierarchical cascade, see
 *   `BlissSVGBuilder.hierarchical-options.test.js`. Per-option rendering
 *   (stroke-width, color, fill/opacity passthrough) is in
 *   `BlissSVGBuilder.stroke-color.test.js`; SVG metadata in
 *   `BlissSVGBuilder.svg-metadata.test.js`.
 * - Mutation-API integration with object options (post-construction
 *   override mutation), see `BlissSVGBuilder.mutation-api.test.js`.
 */
describe('BlissSVGBuilder object options', () => {

  describe('when defaults are applied to a string with no matching options', () => {
    it('applies the default color to a string with no options', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { color: 'red' } });
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('produces grid lines when grid: true is the default', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { grid: true } });
      expect(builder.svgCode).toContain('class="bliss-grid-line');
    });

    it('accepts margin: 2 as a default and renders without error', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { margin: 2 } });
      expect(builder.svgCode).toContain('<svg');
    });

    it('applies a default color when the overrides key is omitted', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { color: 'red' } });
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('skips null and undefined values inside defaults', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { color: null, strokeWidth: undefined } });
      const svg = builder.svgCode;
      expect(svg).not.toContain('null');
      expect(svg).not.toContain('undefined');
    });
  });

  describe('when string options override matching defaults', () => {
    it('lets a string [color=blue] override a matching default color', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', { defaults: { color: 'red' } });
      const svg = builder.svgCode;
      expect(svg).toContain('stroke="blue"');
      expect(svg).not.toContain('stroke="red"');
    });

    it('leaves non-overlapping defaults intact when the string overrides another key', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', {
        defaults: { color: 'red', strokeWidth: 0.5 }
      });
      const svg = builder.svgCode;
      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('lets the string win when only defaults and string set the same key', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', {
        defaults: { color: 'red' }
      });
      expect(builder.svgCode).toContain('stroke="blue"');
    });
  });

  describe('when overrides take precedence over string and default options', () => {
    it('lets an override beat the string when both set the same option', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', { overrides: { color: 'red' } });
      const svg = builder.svgCode;
      expect(svg).toContain('stroke="red"');
      expect(svg).not.toContain('stroke="blue"');
    });

    it('applies an override when the string has no options', () => {
      const builder = new BlissSVGBuilder('H', { overrides: { color: 'green' } });
      expect(builder.svgCode).toContain('stroke="green"');
    });

    it('keeps non-overridden string options when the override sets a different key', () => {
      const builder = new BlissSVGBuilder('[color=blue;stroke-width=1]||H', {
        overrides: { color: 'red' }
      });
      const svg = builder.svgCode;
      expect(svg).toContain('stroke="red"');
      expect(svg).toContain('stroke-width="1"');
    });

    it('lets the override win when only the string and override set the same key', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', {
        overrides: { color: 'red' }
      });
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('applies an override color when the defaults key is omitted', () => {
      const builder = new BlissSVGBuilder('H', { overrides: { color: 'red' } });
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('accepts a hex color in overrides and surfaces it as the stroke attribute', () => {
      const builder = new BlissSVGBuilder('H', { overrides: { color: '#ff0000' } });
      expect(builder.svgCode).toContain('stroke="#ff0000"');
    });
  });

  describe('when defaults, string options, and overrides all combine', () => {
    it('lets the override win across all three layers (default < string < override)', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', {
        defaults: { color: 'green' },
        overrides: { color: 'red' }
      });
      expect(builder.svgCode).toContain('stroke="red"');
    });

    it('lets the override win when all three layers set the same numeric key', () => {
      const builder = new BlissSVGBuilder('[stroke-width=0.8]||H', {
        defaults: { strokeWidth: 0.3 },
        overrides: { strokeWidth: 1.2 }
      });
      expect(builder.svgCode).toContain('stroke-width="1.2"');
    });

    it('applies all three layers when each sets a different key', () => {
      const builder = new BlissSVGBuilder('[color=blue]||H', {
        defaults: { grid: true },
        overrides: { strokeWidth: 0.5 }
      });
      const svg = builder.svgCode;
      expect(svg).toContain('stroke="blue"');
      expect(svg).toContain('class="bliss-grid-line');
      expect(svg).toContain('stroke-width="0.5"');
    });
  });

  describe('when option keys and values are normalized through the object form', () => {
    it('accepts camelCase keys and maps strokeWidth to the stroke-width attribute', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { strokeWidth: 0.8 } });
      expect(builder.svgCode).toContain('stroke-width="0.8"');
    });

    it('clamps numeric values the same way as string options (strokeWidth=5 → 1.5)', () => {
      const builder = new BlissSVGBuilder('H', { overrides: { strokeWidth: 5 } });
      expect(builder.svgCode).toContain('stroke-width="1.5"');
    });

    it('HTML-escapes string values to prevent injection', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { color: '<script>' } });
      const svg = builder.svgCode;
      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('surfaces an override strokeWidth as the stroke-width attribute', () => {
      const builder = new BlissSVGBuilder('H', { overrides: { strokeWidth: 0.5 } });
      expect(builder.svgCode).toContain('stroke-width="0.5"');
    });
  });

  describe('when bulk and boolean options are passed via the object', () => {
    it('expands a bulk margin option to all four margins (renders without error)', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { margin: 2 } });
      expect(builder.svgCode).toContain('<svg');
    });

    it('accepts grid: true as a default and produces grid lines', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { grid: true } });
      expect(builder.svgCode).toContain('class="bliss-grid-line');
    });

    it('lets grid: false in overrides disable a grid set by the string', () => {
      const builder = new BlissSVGBuilder('[grid]||H', { overrides: { grid: false } });
      expect(builder.svgCode).not.toContain('class="bliss-grid-line');
    });

    it('produces both minor and major grid-line classes when grid is the default', () => {
      const builder = new BlissSVGBuilder('H', { defaults: { grid: true } });
      const svg = builder.svgCode;
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--minor"');
      expect(svg).toContain('class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky"');
    });
  });

  describe('when the second argument is absent, empty, undefined, or null', () => {
    it('accepts empty defaults and overrides objects', () => {
      const builder = new BlissSVGBuilder('H', { defaults: {}, overrides: {} });
      expect(builder.svgCode).toContain('<svg');
    });

    it('accepts undefined for both defaults and overrides', () => {
      const builder = new BlissSVGBuilder('H', { defaults: undefined, overrides: undefined });
      expect(builder.svgCode).toContain('<svg');
    });

    it('renders without a second parameter (backward compatibility)', () => {
      const builder = new BlissSVGBuilder('H');
      expect(builder.svgCode).toContain('<svg');
    });

    it('accepts null as the second parameter', () => {
      const builder = new BlissSVGBuilder('H', null);
      expect(builder.svgCode).toContain('<svg');
    });
  });
});
