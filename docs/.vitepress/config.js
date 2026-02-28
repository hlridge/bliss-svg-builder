import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  title: 'Bliss SVG Builder',
  description: 'Generate SVG code for Blissymbolics using a Domain-Specific Language',
  base: '/bliss-svg-builder/',
  cleanUrls: true,
  ignoreDeadLinks: true,

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
      { text: 'Get Started', link: '/get-started/installation-setup' },
      { text: 'Handbook', link: '/handbook/' },
      { text: 'Reference', link: '/reference/shapes-gallery' },
      { text: 'Playground', link: '/playground/' }
    ],

    sidebar: {
      '/get-started/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Installation & Setup', link: '/get-started/installation-setup' },
            { text: 'Characters & B-Codes', link: '/get-started/characters-bcodes' },
            { text: 'Words & Sentences', link: '/get-started/words-sentences' },
            { text: 'Styling Basics', link: '/get-started/styling-basics' }
          ]
        }
      ],
      '/handbook/': [
        {
          text: 'Writing',
          items: [
            { text: 'Characters & B-Codes', link: '/handbook/writing/characters-bcodes' },
            { text: 'Words & Sentences', link: '/handbook/writing/words-sentences' },
            { text: 'Shapes', link: '/handbook/writing/shapes' },
            { text: 'Latin & Cyrillic', link: '/handbook/writing/latin-cyrillic', badge: 'Soon' },
            { text: 'Custom Codes', link: '/handbook/writing/custom-codes', badge: 'Soon' }
          ]
        },
        {
          text: 'Styling',
          items: [
            { text: 'Color & Stroke', link: '/handbook/styling/color-stroke' },
            { text: 'Backgrounds & Accessibility', link: '/handbook/styling/backgrounds-accessibility' }
          ]
        },
        {
          text: 'Spacing & Layout',
          items: [
            { text: 'Spacing', link: '/handbook/spacing-layout/spacing' },
            { text: 'Sizing', link: '/handbook/spacing-layout/sizing' },
            { text: 'Margins & Cropping', link: '/handbook/spacing-layout/margins-cropping' },
            { text: 'Positioning', link: '/handbook/spacing-layout/positioning' }
          ]
        },
        {
          text: 'Coordinate System',
          items: [
            { text: 'Understanding the Grid', link: '/handbook/coordinate-system/understanding-the-grid' },
            { text: 'Grid Customization', link: '/handbook/coordinate-system/grid-customization' }
          ]
        },
        {
          text: 'DSL Syntax',
          items: [
            { text: 'Syntax Overview', link: '/handbook/dsl-syntax/syntax-overview' },
            { text: 'Options System', link: '/handbook/dsl-syntax/options-system' },
            { text: 'Programmatic Options', link: '/handbook/dsl-syntax/programmatic-options' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Shapes Gallery', link: '/reference/shapes-gallery' },
            { text: 'Indicators Reference', link: '/reference/indicators-reference' },
            { text: 'Options Quick Reference', link: '/reference/options-quick-reference' },
            { text: 'DSL Syntax Quick Reference', link: '/reference/dsl-syntax-quick-reference' },
            { text: 'API Documentation', link: '/reference/api-documentation' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hlridge/bliss-svg-builder' }
    ]
  }
});
