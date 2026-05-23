import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Pins the published `dist/` bundles' export contract: each format exposes
 * `BlissSVGBuilder` as a class, a `LIB_VERSION` string matching
 * `package.json#version`, and a working `new Cls('B313').svgCode` round-trip.
 *
 * Covers:
 * - ESM bundle loaded via dynamic `import()` of `dist/bliss-svg-builder.esm.js`.
 * - CJS bundle loaded via `createRequire()` of `dist/bliss-svg-builder.cjs`.
 * - IIFE bundle loaded into a `vm` sandbox with a `window` global; the global
 *   is read off `sandbox.BlissSVGBuilder`.
 * - For each: class shape, LIB_VERSION matches package.json, and a
 *   `new Cls('B313').svgCode` smoke returning an `<svg>` string.
 * - ESM-specific: `default` export equals the named `BlissSVGBuilder` export.
 * - IIFE-specific: the global is the class itself (`typeof === 'function'`),
 *   not an object bag. This is the regression guard for
 *   `output.exports: 'default'` getting flipped to `'named'` in vite config.
 * - Auto-skip with a helpful message when `dist/` is incomplete, so the
 *   `pnpm test` dev loop never breaks on a missing build.
 *
 * Does NOT cover:
 * - Source-level exports shape: see `BlissSVGBuilder.public-api.test.js`.
 * - Rendering correctness: see the default lib suite plus
 *   `BlissSVGBuilder.visual-regression.e2e.test.js`.
 * - Consumer integrations beyond the basic `new Cls('B313').svgCode` smoke.
 *
 * Note: vitest's `describe.skipIf` still walks the suite body to collect
 * tests, so all file I/O lives in `beforeAll` (not at describe-body level)
 * to avoid ENOENT during collection when bundles are missing.
 */

const repoRoot = resolve(import.meta.dirname, '..');
const distDir = resolve(repoRoot, 'dist');
const esmPath = resolve(distDir, 'bliss-svg-builder.esm.js');
const cjsPath = resolve(distDir, 'bliss-svg-builder.cjs');
const iifePath = resolve(distDir, 'bliss-svg-builder.iife.js');
const pkgPath = resolve(repoRoot, 'package.json');

const distMissing =
  !existsSync(esmPath) || !existsSync(cjsPath) || !existsSync(iifePath);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

// `getBundle` is called lazily inside each `it`, so `beforeAll`-loaded
// bundles are fully populated by the time the assertions run.
function assertBundleContract(getBundle) {
  it('exports BlissSVGBuilder as a class', () => {
    const { Cls } = getBundle();
    expect(typeof Cls).toBe('function');
    expect(Cls.prototype).toBeDefined();
  });

  it('LIB_VERSION matches package.json#version', () => {
    const { LIB_VERSION } = getBundle();
    expect(typeof LIB_VERSION).toBe('string');
    expect(LIB_VERSION).toBe(pkg.version);
  });

  it('constructs from a B-code and returns an <svg> string from .svgCode', () => {
    const { Cls } = getBundle();
    const svgCode = new Cls('B313').svgCode;
    expect(typeof svgCode).toBe('string');
    expect(svgCode.startsWith('<svg')).toBe(true);
  });
}

describe.skipIf(distMissing)('BlissSVGBuilder bundles', () => {
  describe('when loaded as the ESM bundle (dist/bliss-svg-builder.esm.js)', () => {
    let mod;
    beforeAll(async () => {
      mod = await import(pathToFileURL(esmPath).href);
    });
    assertBundleContract(() => ({
      Cls: mod.BlissSVGBuilder,
      LIB_VERSION: mod.LIB_VERSION,
    }));

    it('default export is the BlissSVGBuilder class', () => {
      expect(mod.default).toBe(mod.BlissSVGBuilder);
    });
  });

  describe('when loaded as the CommonJS bundle (dist/bliss-svg-builder.cjs)', () => {
    let mod;
    beforeAll(() => {
      const require = createRequire(import.meta.url);
      mod = require(cjsPath);
    });
    assertBundleContract(() => ({
      Cls: mod.BlissSVGBuilder,
      LIB_VERSION: mod.LIB_VERSION,
    }));
  });

  describe('when loaded as the IIFE bundle (dist/bliss-svg-builder.iife.js) into a window-bearing context', () => {
    let Cls;
    beforeAll(() => {
      const sandbox = {
        structuredClone,
        console,
        TextEncoder,
        TextDecoder,
        URL,
        URLSearchParams,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      runInContext(readFileSync(iifePath, 'utf8'), createContext(sandbox), {
        filename: 'bliss-svg-builder.iife.js',
      });
      Cls = sandbox.BlissSVGBuilder;
    });
    assertBundleContract(() => ({ Cls, LIB_VERSION: Cls?.LIB_VERSION }));

    it('window.BlissSVGBuilder is the class itself, not an object bag', () => {
      expect(typeof Cls).toBe('function');
      expect(typeof Cls).not.toBe('object');
    });
  });
});

describe.skipIf(!distMissing)('BlissSVGBuilder bundles (skipped: dist/ incomplete)', () => {
  it.skip('one or more dist bundles missing; run `pnpm run build` (or `pnpm run test:dist`)', () => {});
});
