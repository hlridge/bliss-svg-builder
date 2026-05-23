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
    exclude: [
      'node_modules',
      'dist'
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