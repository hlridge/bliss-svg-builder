import { describe, it, expect } from 'vitest';
import defaultExport, { BlissSVGBuilder, LIB_VERSION } from '../src/index';

/**
 * Pins the package entry point's export shape (named exports, default export,
 * class-static LIB_VERSION) and the constructor's input contract: which JS
 * value shapes the constructor accepts, which it rejects with an explicit
 * error, and how it treats whitespace-only strings.
 *
 * Covers:
 * - Named exports `BlissSVGBuilder` (class) and `LIB_VERSION` (string).
 * - Default export equals the named `BlissSVGBuilder` class.
 * - `BlissSVGBuilder.LIB_VERSION` static (added 2026-04-27 to support the IIFE
 *   bundle's flat `window.BlissSVGBuilder` global; UMD consumers previously
 *   needed `const { BlissSVGBuilder } = window.BlissSVGBuilder`).
 * - Round-trip identity: default, named, and class-static all reference the
 *   same identifiers.
 * - Constructor rejects `null`, numbers, booleans, and arrays with the
 *   `Input must be a DSL string or a plain object` error.
 * - Constructor accepts DSL strings, plain objects produced by `toJSON()`,
 *   and `undefined` (the undefined case yields an empty builder with
 *   `stats.groupCount === 0`).
 * - Whitespace-only DSL strings (space, tab, newline) are accepted without
 *   throwing and still produce SVG output.
 *
 * Does NOT cover:
 * - Built-bundle behaviour (IIFE / ESM / CJS smoke tests), see
 *   `BlissSVGBuilder.bundles.dist.test.js`.
 * - SVG-generation behaviour and mutation API surface, see
 *   `BlissSVGBuilder.mutation-api.test.js` and the broader
 *   integration suite.
 *
 * @regression: 2026-04-27 umd-to-iife-migration
 */
describe('BlissSVGBuilder public API', () => {
  describe('when importing the named exports', () => {
    it('exports BlissSVGBuilder as a class (constructor function)', () => {
      expect(typeof BlissSVGBuilder).toBe('function');
      expect(BlissSVGBuilder.prototype).toBeDefined();
    });

    it('exports LIB_VERSION as a string', () => {
      expect(typeof LIB_VERSION).toBe('string');
    });
  });

  describe('when importing the default export', () => {
    it('is the same identifier as the named BlissSVGBuilder export', () => {
      expect(defaultExport).toBe(BlissSVGBuilder);
    });

    it('is constructable as a BlissSVGBuilder instance', () => {
      const builder = new defaultExport('B313');
      expect(builder).toBeInstanceOf(BlissSVGBuilder);
    });
  });

  describe('when reading LIB_VERSION as a class static', () => {
    it('is defined', () => {
      expect(BlissSVGBuilder.LIB_VERSION).toBeDefined();
    });

    it('equals the named LIB_VERSION export', () => {
      expect(BlissSVGBuilder.LIB_VERSION).toBe(LIB_VERSION);
    });

    it('is a string', () => {
      expect(typeof BlissSVGBuilder.LIB_VERSION).toBe('string');
    });
  });

  describe('when comparing default, named, and class-static references', () => {
    it('all three reference the same identifiers', () => {
      expect(defaultExport).toBe(BlissSVGBuilder);
      expect(defaultExport.LIB_VERSION).toBe(LIB_VERSION);
      expect(BlissSVGBuilder.LIB_VERSION).toBe(LIB_VERSION);
    });
  });

  describe('when the constructor is given a non-string, non-object input', () => {
    it('throws on null with the expected message', () => {
      expect(() => new BlissSVGBuilder(null)).toThrow('Input must be a DSL string or a plain object');
    });

    it('throws on a number with the expected message', () => {
      expect(() => new BlissSVGBuilder(42)).toThrow('Input must be a DSL string or a plain object');
    });

    it('throws on a boolean with the expected message', () => {
      expect(() => new BlissSVGBuilder(true)).toThrow('Input must be a DSL string or a plain object');
    });

    it('throws on an array with the expected message', () => {
      expect(() => new BlissSVGBuilder(['H'])).toThrow('Input must be a DSL string or a plain object');
    });
  });

  describe('when the constructor is given a valid input shape', () => {
    it('accepts a DSL string', () => {
      expect(() => new BlissSVGBuilder('H')).not.toThrow();
    });

    it('accepts a plain object produced by toJSON', () => {
      const json = new BlissSVGBuilder('H').toJSON();
      expect(() => new BlissSVGBuilder(json)).not.toThrow();
    });

    it('accepts undefined and creates an empty builder', () => {
      const b = new BlissSVGBuilder(undefined);
      expect(b.stats.groupCount).toBe(0);
    });
  });

  describe('when the input is whitespace-only', () => {
    it('accepts a space-only string', () => {
      expect(() => new BlissSVGBuilder('   ')).not.toThrow();
    });

    it('accepts a tab-only string', () => {
      expect(() => new BlissSVGBuilder('\t')).not.toThrow();
    });

    it('accepts a newline-only string', () => {
      expect(() => new BlissSVGBuilder('\n')).not.toThrow();
    });

    it('produces SVG output for a whitespace-only input', () => {
      const builder = new BlissSVGBuilder('   ');
      expect(builder.svgCode).toBeTruthy();
    });
  });
});
