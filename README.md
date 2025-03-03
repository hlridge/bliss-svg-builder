# Bliss-SVG-Builder

This package builds SVG code for Bliss (Blissymbolics) text using a specific Domain-Specific Language referencing typical Bliss building blocks and their positions.

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

const svgCode = builder.svgCode;
```

To use ES Modules, the `type` field in your `package.json` should be set to `"module"`.

### Using CommonJS

```javascript
const { BlissSVGBuilder } = require('bliss-svg-builder');
const builder = new BlissSVGBuilder("H:0,8");

const svgCode = builder.svgCode;
```

## Client-side

To use this package in a client-side project, first, include the following script tag in your HTML file:

### Using ES Modules

```javascript
<div id="bliss-container" style="height: 68px;"></div>
<script type="module">
  import { BlissSVGBuilder } from './<path-to-bliss-text-package>/bliss-svg-builder.js';
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

Replace `./<path-to-bliss-text-package>/` with the actual path to the package's `src` directory. If you're using a bundler like Webpack or Vite, you can simply import the package like this:

```html
<div id="bliss-container" style="height: 68px;"></div>
<script type="module">
  import { BlissSVGBuilder } from 'bliss-svg-builder';
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

### Using CommonJS

```html
<div id="bliss-container" style="height: 68px;"></div>
<script src="../dist/bliss-svg-builder.umd.cjs"></script>
<script>
  const { BlissSVGBuilder } = window.BlissSVGBuilder;
  const builder = new BlissSVGBuilder("H:0,8");
  
  document.getElementById('bliss-container').appendChild(builder.svgElement);
</script>
```

## Examples

You can find example implementations in the `examples/` folder.

## License

This project is licensed under the Mozilla Public License 2.0. For more details, see the [LICENSE](./LICENSE) file.