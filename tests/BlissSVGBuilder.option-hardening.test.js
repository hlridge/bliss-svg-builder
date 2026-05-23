import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that DSL bracket-option keys with prototype-polluting or
 * reserved names cannot mutate global Object state or trigger errors
 * inside the parser → element → SVG pipeline.
 *
 * Covers:
 * - `[__proto__=VALUE]` does not pollute `Object.prototype` (the
 *   key is processed safely without setting a prototype property
 *   visible on plain objects).
 * - `[constructor=VALUE]` does not throw when used as a bracket
 *   option key.
 * - Invalid numeric option values for recognized keys: `NaN` and
 *   non-numeric strings for `stroke-width` are accepted without
 *   throwing, and the builder still produces a complete `<svg>` /
 *   `</svg>` document around the malformed value.
 * - Empty option values (`[color=]`) are accepted without throwing.
 *
 * Does NOT cover:
 * - SVG metadata, HTML escaping, text overlay, and background
 *   rendering, see `BlissSVGBuilder.svg-metadata.test.js`.
 * - Parser-level malformed-syntax error handling and warning
 *   emission, see `BlissParser.internal-mechanics.test.js` (to be carved in Section E2).
 * - Option key normalization rules (kebab-to-camelCase, recognized
 *   option keys, internal vs multi-level option taxonomy), see
 *   `BlissSVGBuilder.hierarchical-options.test.js` (which pins that
 *   internal option keys like `grid`, `x`/`y`, and kerning keys do
 *   not leak as SVG attributes) and `BlissParser.internal-mechanics.test.js`.
 */
describe('BlissSVGBuilder option hardening', () => {

  describe('when DSL bracket options carry prototype-polluting key names', () => {
    it('__proto__ key does not pollute Object prototype', () => {
      const before = ({}).polluted;
      const builder = new BlissSVGBuilder('[__proto__=polluted]||H');
      const after = ({}).polluted;

      expect(before).toBeUndefined();
      expect(after).toBeUndefined();
    });

    it('constructor key does not cause errors', () => {
      expect(() => new BlissSVGBuilder('[constructor=test]||H')).not.toThrow();
    });
  });

  describe('when an option value is non-numeric or empty', () => {
    it('accepts a NaN stroke-width without throwing', () => {
      expect(() => new BlissSVGBuilder('[stroke-width=NaN]||H')).not.toThrow();
    });

    it('accepts a non-numeric stroke-width without throwing', () => {
      expect(() => new BlissSVGBuilder('[stroke-width=abc]||H')).not.toThrow();
    });

    it('accepts an empty option value without throwing', () => {
      expect(() => new BlissSVGBuilder('[color=]||H')).not.toThrow();
    });

    it('still produces a complete <svg>...</svg> document with a non-numeric stroke-width', () => {
      const svg = new BlissSVGBuilder('[stroke-width=abc]||H').svgCode;
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  });

});
