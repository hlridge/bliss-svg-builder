import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Pins that the built ESM bundle exposes, at runtime, every public member
 * documented in `src/index.d.ts`: the named/default exports, the
 * `BlissSVGBuilder` statics + instance methods + instance getters, and the full
 * `ElementHandle` method + getter surface reached through a live handle.
 *
 * This is the `.d.ts` <-> JS parity guard that `pnpm run typecheck` cannot
 * provide: `tsc` only proves `src/index.d.ts` is valid TypeScript, never that
 * the shipped JavaScript actually implements what the types promise. The
 * expected member lists below are a deliberate second statement of the public
 * surface and must move in lockstep with `src/index.d.ts` (the pre-push
 * export-drift hook nudges that update at push time; this test fails at build
 * time if the built surface and the contract disagree).
 *
 * Covers:
 * - Named exports `BlissSVGBuilder` (class) + `LIB_VERSION` (string) and the
 *   default export, present on the built ESM bundle.
 * - Every documented `BlissSVGBuilder` static method, plus the `LIB_VERSION`
 *   static string.
 * - Every documented `BlissSVGBuilder` instance method (own on the prototype,
 *   so an inherited `toString` cannot mask a missing override).
 * - Every documented `BlissSVGBuilder` instance getter (checked via descriptor,
 *   never invoked, so the DOM-only `svgElement` getter is safe in a node run).
 * - Every documented `ElementHandle` method + getter, reached through a group
 *   handle (the handle class is not exported; its prototype is reached by
 *   navigation).
 *
 * Does NOT cover:
 * - Per-format export smoke (ESM/CJS/IIFE shape, default===named, LIB_VERSION
 *   matching package.json, a render round-trip): see
 *   `BlissSVGBuilder.bundles.dist.test.js`.
 * - Source-entry export shape + constructor input contract: see
 *   `BlissSVGBuilder.public-api.test.js`.
 * - Member SIGNATURES or BEHAVIOUR (only presence + kind is pinned here); the
 *   behavioural contracts live in the feature suites.
 * - `WarningCode` union vs `WARNING_CODES` registry parity: see
 *   `BlissSVGBuilder.warning-code-parity.test.js`.
 *
 * @contract: public-surface
 */

const distEsm = resolve(import.meta.dirname, '..', 'dist', 'bliss-svg-builder.esm.js');
const distMissing = !existsSync(distEsm);

const STATIC_METHODS = [
  'define', 'isDefined', 'getDefinition', 'listDefinitions',
  'removeDefinition', 'patchDefinition',
];

const INSTANCE_METHODS = [
  'traverse', 'query', 'getElementByKey', 'group', 'element', 'glyph', 'part',
  'snapshot', 'addGroup', 'addGlyph', 'addPart', 'insertGroup', 'removeGroup',
  'replaceGroup', 'merge', 'splitAt', 'addElement', 'insertElement',
  'removeElement', 'replaceElement', 'clear', 'toString', 'toJSON',
];

const INSTANCE_GETTERS = [
  'svgContent', 'svgElement', 'svgCode', 'standaloneSvg', 'warnings',
  'elements', 'groups', 'stats', 'elementCount',
];

const HANDLE_METHODS = [
  'measure', 'headGlyph', 'glyph', 'part', 'addGlyph', 'insertGlyph', 'addPart',
  'insertPart', 'remove', 'detach', 'replace', 'removeGlyph', 'replaceGlyph',
  'removePart', 'replacePart', 'applyIndicators', 'clearIndicators',
  'splitAt', 'mergeWithNext',
  'setOptions', 'removeOptions',
];

const HANDLE_GETTERS = [
  'level', 'isGroup', 'isGlyph', 'isPart', 'codeName', 'char', 'key',
  'isIndicator', 'indicatorLevel', 'indicatorKind', 'isShape', 'isBlissGlyph',
  'isExternalGlyph', 'isHeadGlyph', 'isSpaceGroup', 'x', 'y', 'offsetX',
  'offsetY', 'width', 'height', 'bounds', 'advanceX', 'baseWidth',
];

// BlissSVGBuilder and ElementHandle are base classes (no `extends`), so every
// documented member is an own property of the direct prototype. A one-level
// `Object.getOwnPropertyDescriptor` therefore finds it without consulting
// Object.prototype (so an inherited `toString` cannot mask a missing override)
// and without reading the value (so the DOM-only `svgElement` getter, which
// throws in a node run, is never invoked).

describe.skipIf(distMissing)('BlissSVGBuilder public surface', () => {
  let BlissSVGBuilder;
  let LIB_VERSION;
  let defaultExport;
  let handle;
  let handleProto;

  beforeAll(async () => {
    const mod = await import(pathToFileURL(distEsm).href);
    BlissSVGBuilder = mod.BlissSVGBuilder;
    LIB_VERSION = mod.LIB_VERSION;
    defaultExport = mod.default;
    handle = new BlissSVGBuilder('B313').group(0);
    handleProto = handle && Object.getPrototypeOf(handle);
  });

  describe('when reading the bundle exports', () => {
    it('exports BlissSVGBuilder as a constructor', () => {
      expect(typeof BlissSVGBuilder).toBe('function');
    });

    it('exports LIB_VERSION as a string', () => {
      expect(typeof LIB_VERSION).toBe('string');
    });

    it('exports a default that is the BlissSVGBuilder class', () => {
      expect(defaultExport).toBe(BlissSVGBuilder);
    });
  });

  describe('when reading the BlissSVGBuilder static surface', () => {
    it('exposes LIB_VERSION as a static string', () => {
      expect(typeof BlissSVGBuilder.LIB_VERSION).toBe('string');
    });

    it.each(STATIC_METHODS)('exposes the %s static method', (name) => {
      expect(typeof BlissSVGBuilder[name]).toBe('function');
    });
  });

  describe('when reading the BlissSVGBuilder instance surface', () => {
    it.each(INSTANCE_METHODS)('exposes the %s instance method', (name) => {
      const d = Object.getOwnPropertyDescriptor(BlissSVGBuilder.prototype, name);
      expect(typeof d?.value).toBe('function');
    });

    it.each(INSTANCE_GETTERS)('exposes the %s instance getter', (name) => {
      const d = Object.getOwnPropertyDescriptor(BlissSVGBuilder.prototype, name);
      expect(typeof d?.get).toBe('function');
    });
  });

  describe('when reading the ElementHandle surface through a handle', () => {
    it('returns a working ElementHandle from group(0)', () => {
      expect(typeof handle).toBe('object');
      expect(handle).not.toBeNull();
      expect(handle.level).toBe(1);
    });

    it.each(HANDLE_METHODS)('exposes the %s handle method', (name) => {
      const d = Object.getOwnPropertyDescriptor(handleProto, name);
      expect(typeof d?.value).toBe('function');
    });

    it.each(HANDLE_GETTERS)('exposes the %s handle getter', (name) => {
      const d = Object.getOwnPropertyDescriptor(handleProto, name);
      expect(typeof d?.get).toBe('function');
    });
  });
});

describe.skipIf(!distMissing)('BlissSVGBuilder public surface (skipped: dist/ incomplete)', () => {
  it.skip('dist/bliss-svg-builder.esm.js missing; run `pnpm run build` (or `pnpm run test:dist`)', () => {});
});
