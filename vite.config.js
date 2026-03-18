import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

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

function copyFontLicense() {
  return {
    name: 'copy-font-license',
    writeBundle() {
      const src = resolve(__dirname, 'src/external-font-data/FONT_LICENSE');
      const outDir = resolve(__dirname, 'dist');
      const dest = resolve(outDir, 'FONT_LICENSE');

      if (!existsSync(src)) {
        throw new Error(`FONT_LICENSE not found at ${src}`);
      }

      mkdirSync(outDir, { recursive: true });
      copyFileSync(src, dest);
    },
  };
}

export default defineConfig(({ command }) => ({
  define: {
    __LIB_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: command === 'build' ? [addBanner(), copyFontLicense()] : [],
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return;
        warn(warning);
      },
    },
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'BlissSVGBuilder',
      formats: ['es', 'umd', 'cjs'],
      fileName: (format) => {
        switch (format) {
          case 'es':
            return 'bliss-svg-builder.esm.js';
          case 'umd':
            return 'bliss-svg-builder.umd.js';
          case 'cjs':
            return 'bliss-svg-builder.cjs';
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      },
    },
  },
}));
