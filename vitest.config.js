// vitest.config.js
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
    // Keep vitest's default module isolation (`isolate: true`) on: several
    // parser/element test files mutate the shared blissElementDefinitions
    // singleton. Most pair their setup with afterAll cleanup, but do not switch
    // to `isolate: false` for speed without first auditing tests/ for definition
    // leaks; an un-cleaned file would then bleed definitions into later files.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Stryker sandboxes hold full copies of tests/; never discover those.
      '**/.stryker-tmp/**',
      '**/.worktrees/**',
    ],
    root: '.',
    reporters: ['verbose'],
    projects: [
      {
        extends: true,
        test: {
          include: ['tests/**/*.{test,spec}.js'],
          exclude: [
            'tests/**/*.e2e.{test,spec}.js',
            'tests/**/*.dist.{test,spec}.js',
          ],
          name: 'lib',
        }
      },
      {
        extends: true,
        test: {
          include: ['tests/**/*.e2e.{test,spec}.js'],
          name: 'e2e',
          testTimeout: 30000,
          hookTimeout: 30000,
        }
      },
      {
        extends: true,
        test: {
          include: ['tests/**/*.dist.{test,spec}.js'],
          name: 'dist',
        }
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});