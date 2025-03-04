import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => {
  const config = {
    publicDir: 'examples',
  };

  if (command === 'build') {
    return {
      build: {
        minify: false,
        lib: {
          entry: resolve(__dirname, 'src/index.js'),
          name: 'BlissSVGBuilder',
          formats: ['es', 'umd'],
        },
        rollupOptions: {
          //...
        },
      },
    };
  }

  return config;
});