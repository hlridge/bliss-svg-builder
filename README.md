# Bliss SVG Builder

A JavaScript library for generating SVG representations of Blissymbolics (Bliss) using a Domain-Specific Language.

[![npm version](https://img.shields.io/npm/v/bliss-svg-builder/alpha)](https://www.npmjs.com/package/bliss-svg-builder)

## What is Bliss SVG Builder?

Bliss SVG Builder enables you to **programmatically generate Bliss characters** in your JavaScript applications. It's designed as a library to power AAC applications, educational tools, communication boards, and any system that needs to create or display Bliss dynamically.

## Installation

```bash
npm install bliss-svg-builder@alpha
```

## Quick Start

```javascript
import { BlissSVGBuilder } from 'bliss-svg-builder';

// Create a builder instance with your DSL input
const builder = new BlissSVGBuilder('B313');

// Get SVG as string
const svgCode = builder.svgCode;

// Or get DOM element (browser)
const svgElement = builder.svgElement;
document.getElementById('container').appendChild(svgElement);
```

## Examples

**Simple shape** - Heart with freestyle mode

```
[freestyle=1;background=#fafafa]||H
```

![Heart shape](assets/heart-shape.svg)

**Bliss character** - B313 (FEELING)

```
[grid=1;background=#fafafa]||B313
```

![B313 FEELING](assets/b313-feeling.svg)

**Complex composition** - "I love Blissymbolics!"

```
[grid=1;background=#fafafa]||B513/B10//B431;B81//B414/B167//B1
```

![I love Blissymbolics](assets/i-love-blissymbolics.svg)

## Module Format Support

Bliss SVG Builder works everywhere JavaScript runs:

- **ES Modules (ESM)** - Modern bundlers (Vite, Webpack), Node.js, and browsers with `<script type="module">`
- **CommonJS (CJS)** - Traditional Node.js environments
- **UMD** - Direct browser usage via `<script>` tag

Both **browser** and **Node.js** environments are fully supported.

## Documentation

For complete documentation including DSL syntax, shapes reference, options, and examples, visit:

**[https://hlridge.github.io/bliss-svg-builder/](https://hlridge.github.io/bliss-svg-builder/)**

- [Quick Start Guide](https://hlridge.github.io/bliss-svg-builder/guide/quick-start)
- [Writing with Bliss](https://hlridge.github.io/bliss-svg-builder/guide/writing)
- [DSL Syntax Reference](https://hlridge.github.io/bliss-svg-builder/guide/dsl-syntax)
- [Shapes & Options](https://hlridge.github.io/bliss-svg-builder/reference/shapes)

## Stability Notice

**Alpha Software**: This package is in active development. Breaking changes may occur without notice. Use at your own risk.

## License

This project is licensed under the Mozilla Public License 2.0. See the [LICENSE](./LICENSE) file for details.
