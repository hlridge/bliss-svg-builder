// Standalone Vite config for the minified IIFE browser bundle
// (window.BlissSVGBuilder). Runs chained after the main ESM/CJS build via
// package.json scripts; both writes share dist/, which is why
// emptyOutDir is false on both sides.

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

// Duplicated from vite.config.js to keep this config standalone.
// If you edit one, edit both.
const banner = `/*!
 * Contains glyph data derived from Liberation Sans Regular (Liberation Fonts Project)
 * Copyright © 2012 Red Hat, Inc.
 * Glyph data licensed under Apache License 2.0; see FONT_LICENSE.
 */
`;

function addBanner() {
  return {
    name: 'add-banner',
    renderChunk(code) {
      if (!code.startsWith(banner)) {
        return banner + code;
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  define: {
    // Mirrors vite.config.js. Consumed by src/lib/bliss-constants.js to
    // populate LIB_VERSION; must stay in sync with the main config.
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: command === 'build' ? [addBanner()] : [],
  build: {
    // Same reason as in vite.config.js: the chained build shares dist/.
    emptyOutDir: false,
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.browser.js'),
      name: 'BlissSVGBuilder', // becomes window.BlissSVGBuilder
      formats: ['iife'],
      fileName: () => 'bliss-svg-builder.iife.js',
    },
    rollupOptions: {
      output: {
        // Flatten: emit the class as the global directly, not as
        // {default: class}. src/index.browser.js exports BlissSVGBuilder
        // as default.
        exports: 'default',
      },
    },
  },
}));
