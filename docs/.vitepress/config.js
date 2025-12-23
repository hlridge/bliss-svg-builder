import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  title: 'Bliss SVG Builder',
  description: 'Generate SVG code for Blissymbolics using a Domain-Specific Language',
  base: '/bliss-svg-builder/',

  vite: {
    server: {
      fs: {
        // Allow serving files from the project root (for src/ imports)
        allow: [resolve(__dirname, '../..')]
      }
    }
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/installation' },
      { text: 'Reference', link: '/reference/shapes' },
      { text: 'Playground', link: '/playground/' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Writing with Bliss', link: '/guide/writing' },
            { text: 'DSL Syntax', link: '/guide/dsl-syntax' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Positioning', link: '/guide/positioning' },
            { text: 'Options', link: '/guide/options' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Shapes', link: '/reference/shapes' },
            { text: 'Options Table', link: '/reference/options-table' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hlridge/bliss-svg-builder' }
    ]
  }
});
