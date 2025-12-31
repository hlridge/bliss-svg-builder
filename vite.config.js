import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

const banner = `/*!
 * Contains glyph data derived from Liberation Sans Regular (Liberation Fonts Project)
 * Copyright © 2012 Red Hat, Inc.
 * Glyph data licensed under Apache License 2.0; see FONT_LICENSE.
 */
`;

function addBanner() {
  return {
    name: 'add-banner',
    generateBundle(options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && !chunk.code.startsWith(banner)) {
          chunk.code = banner + chunk.code;
        }
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
  plugins: command === 'build' ? [addBanner(), copyFontLicense()] : [],
  build: {
    minify: 'esbuild',
    esbuild: {
      legalComments: 'inline',
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
