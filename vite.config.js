import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => {
  return {
    build: {
      minify: false,
      lib: {
        entry: resolve(__dirname, 'src/index.js'),
        name: 'BlissSVGBuilder',
        formats: ['es', 'umd', 'cjs'],
        fileName: (format) => {
          switch (format) {
            case 'es':
              return 'bliss-svg-builder.esm.js'; // For ESM (both browser and Node.js)
            case 'umd':
              return 'bliss-svg-builder.umd.js'; // For browsers using UMD
            case 'cjs':
              return 'bliss-svg-builder.cjs'; // For Node.js CommonJS
            default:
              throw new Error(`Unsupported format: ${format}`);
          }
        },
      },
    },
  };
});