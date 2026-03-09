import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export default defineConfig({
  title: 'Bliss SVG Builder',
  description: 'Generate SVG code for Blissymbolics using a Domain-Specific Language',
  base: '/bliss-svg-builder/',
  cleanUrls: true,
  ignoreDeadLinks: true,

  vite: {
    define: {
      __LIB_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      fs: {
        // Allow serving files from the project root (for src/ imports)
        allow: [resolve(__dirname, '../..')]
      }
    }
  },

  themeConfig: {
    externalLinkIcon: true,
    search: {
      provider: 'local'
    },
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
            { text: 'Custom Codes', link: '/handbook/writing/custom-codes' }
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
          text: 'Syntax & Options',
          items: [
            { text: 'DSL Syntax Overview', link: '/handbook/syntax-options/syntax-overview' },
            { text: 'Options System', link: '/handbook/syntax-options/options-system' },
            { text: 'SVG Pass-Through Attributes', link: '/handbook/syntax-options/svg-pass-through' },
            { text: 'Programmatic Options', link: '/handbook/syntax-options/programmatic-options' }
          ]
        },
        {
          text: 'Programmatic',
          items: [
            { text: 'Programmatic Mutation', link: '/handbook/programmatic/mutation' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Shapes Gallery', link: '/reference/shapes-gallery' },
            { text: 'Indicators Reference', link: '/reference/indicators-reference' },
            { text: 'Head Glyph Exclusions', link: '/reference/head-glyph-exclusions' },
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
