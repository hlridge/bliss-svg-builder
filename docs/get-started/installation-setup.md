# Installation & Setup

Get Bliss SVG Builder installed and render your first SVG.

## Quickstart

Paste this into an `.html` file. Loads the library as a global from a CDN. No install or build step required.

```html
<script src="https://unpkg.com/bliss-svg-builder@next/dist/bliss-svg-builder.iife.js"></script>
<script>
  const builder = new BlissSVGBuilder('B313');  // "feeling"
  document.body.appendChild(builder.svgElement);
</script>
```

## Choose your setup

| Your situation | Go to |
| --- | --- |
| Building an app with a bundler (Vite, Webpack, etc.) | [Use with a bundler](#use-with-a-bundler) (most common for production apps) |
| Plain HTML page, no build step | [Use in plain HTML](#use-in-plain-html) (most common for demos and quick experiments) |
| Node.js script or backend | [Use in Node.js](#use-in-nodejs) |
| Hosting the bundle yourself, or other edge cases | [Advanced setups](#advanced-setups) |

## Use with a bundler

Works with Vite, Webpack, Rollup, esbuild, Parcel, and other modern bundlers that respect the `exports` field.

Install with your package manager:

```bash
npm install bliss-svg-builder@next
```

```bash
pnpm add bliss-svg-builder@next
```

```bash
yarn add bliss-svg-builder@next
```

Import it by name. The bundler resolves the right format via the package's [`exports`](https://nodejs.org/api/packages.html#exports) map:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('B313');  // "feeling"
document.body.appendChild(builder.svgElement);
```

## Use in plain HTML

In plain HTML, load the bundle directly from a CDN. No install needed.

The IIFE bundle uses a single `<script>` tag and is minified, making it the smaller download. The ESM bundle uses `<script type="module">` and `import`, and is unminified since bundlers minify their own output. Both render the same SVG; only the loading method differs.

### IIFE bundle

```html
<script src="https://unpkg.com/bliss-svg-builder@next/dist/bliss-svg-builder.iife.js"></script>
<script>
  const builder = new BlissSVGBuilder('B313');  // "feeling"
  document.body.appendChild(builder.svgElement);
</script>
```

### ESM bundle

```html
<script type="module">
  import { BlissSVGBuilder } from 'https://unpkg.com/bliss-svg-builder@next/dist/bliss-svg-builder.esm.js';

  const builder = new BlissSVGBuilder('B313');  // "feeling"
  document.body.appendChild(builder.svgElement);
</script>
```

These also work as-is in CodePen, JSFiddle, or any browser playground.

## Use in Node.js

Install with your package manager:

```bash
npm install bliss-svg-builder@next
```

```bash
pnpm add bliss-svg-builder@next
```

```bash
yarn add bliss-svg-builder@next
```

Import it by name:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```

::: details CommonJS (require)
For projects still on CommonJS, the same package works with `require`:

```js
const { BlissSVGBuilder } = require('bliss-svg-builder');

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```
:::

## Advanced setups

Only for uncommon setups. The sections above cover most projects.

::: details Self-hosting the bundle
After installing the package, both bundles are available in `node_modules/bliss-svg-builder/dist/`. Copy them into your own assets and serve them from your origin. Without a package manager, the same files can be downloaded directly from [unpkg](https://unpkg.com/browse/bliss-svg-builder@next/dist/).

The IIFE bundle is a single self-contained file:

```html
<script src="/path/to/bliss-svg-builder.iife.js"></script>
```

The ESM bundle can also be self-hosted, but the bare specifier `'bliss-svg-builder'` only resolves with a bundler or an [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap). For plain HTML, prefer the CDN URL.
:::

::: details Choosing a version
The examples on this page use `@next`, which tracks the current release candidate. After `1.0.0` ships you can pin to a major version with `@1` (recommended; gets patches and minor updates without breaking changes), a specific version like `@1.0.0`, or `@latest` for the most recent stable release.
:::

::: details Using jsDelivr instead of unpkg
The same paths work on jsDelivr: replace `https://unpkg.com/...` with `https://cdn.jsdelivr.net/npm/...`.
:::
