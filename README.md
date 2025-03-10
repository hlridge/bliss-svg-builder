# Bliss-SVG-Builder

This package builds SVG code for Bliss (Blissymbolics) text using a specific Domain-Specific Language referencing typical Bliss building blocks and their positions.

[![npm version](https://img.shields.io/npm/v/bliss-svg-builder)](https://www.npmjs.com/package/bliss-svg-builder)


## Table of Contents

- [Stability Notice](#stability-notice)
- [Installation](#installation)
- [Usage](#usage)
  - [Server-side (Node.js)](#server-side-nodejs)
  - [Client-side](#client-side)
- [License](#license)

## Stability notice

:warning: This package is currently in early stages of active development and considered unstable. Updates may introduce breaking changes without prior notice. Use at your own risk.

## Installation

### Using npm

```javascript
npm install bliss-svg-builder@alpha
```

### Using yarn

```javascript
yarn add bliss-svg-builder@alpha
```

# Usage

## Server-side (Node.js)

This package supports both ES Module and CommonJS syntax and is targeting Node 16 and above.

### Using ES Modules

```javascript
import { BlissSVGBuilder } from 'bliss-svg-builder';
const builder = new BlissSVGBuilder("H:0,8");

// Get the SVG code as a string
const svgCode = builder.svgCode;

// Or get the SVG element directly
const svgElement = builder.svgElement;
```

To use ES Modules, the `type` field in your `package.json` should be set to `"module"`.

### Using CommonJS

```javascript
const { BlissSVGBuilder } = require('bliss-svg-builder');
const builder = new BlissSVGBuilder("H:0,8");

const svgCode = builder.svgCode;
```

## Client-side

### Using ES Modules with Bundlers (Webpack, Vite, etc.)

```html
<div id="bliss-container" style="height: 68px;"></div>
<script type="module">
  import { BlissSVGBuilder } from 'bliss-svg-builder';
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

### Using ES Modules Directly in Browser

```html
<div id="bliss-container" style="height: 68px;"></div>
<script type="module">
  import { BlissSVGBuilder } from './node_modules/bliss-svg-builder/dist/bliss-svg-builder.esm.js';
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

### Using UMD

```html
<div id="bliss-container" style="height: 68px;"></div>
<script src="./node_modules/bliss-svg-builder/dist/bliss-svg-builder.umd.js"></script>
<script>
  const { BlissSVGBuilder } = window.BlissSVGBuilder;
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

## License

This project is licensed under the Mozilla Public License 2.0. For more details, see the [LICENSE](./LICENSE) file.