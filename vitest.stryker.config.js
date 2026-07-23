// vitest.stryker.config.js
//
// Stryker-only Vitest config. Mirrors the lib-project shape from
// vitest.config.js inline (no projects array) so the stryker-vitest-runner
// runs only the lib tests, not the e2e or dist projects.
//
// Why this exists: stryker-vitest-runner iterates over every project in
// ctx.projects with no --project filter. The 2026-05-08 mutation baseline
// (96.12% combined / 96.45% of-covered) predates the 2026-05-09 projects
// refactor, so its dry-run was effectively lib-only at the 10000ms timeout.
// This config restores that shape for apples-to-apples baseline parity.

import { defineConfig } from 'vitest/config';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  define: {
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'node',
    root: '.',
    reporters: ['verbose'],
    // Mirror the lib project's canvas cold-start allowance (vitest.config.js):
    // the visual-comparison meta-test would otherwise time out in Stryker's
    // dry run and abort the mutation run before it starts.
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/**/*.{test,spec}.js'],
    exclude: [
      'node_modules',
      'dist',
      'tests/**/*.e2e.{test,spec}.js',
      'tests/**/*.dist.{test,spec}.js',
      // The property project (fast-check, 2026-07-21) is its own gate and is
      // excluded from the lib loop; keep it out of the mutation run too. Its
      // '@property' tag is also undeclared in this config, so including the
      // files would fail Vitest 4.1's tag-declaration check in the dry run.
      'tests/**/*.property.{test,spec}.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
