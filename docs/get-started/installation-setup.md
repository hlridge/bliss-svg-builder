# Installation & Setup

Get Bliss SVG Builder installed and render your first SVG.

## Installation

### Using npm

```bash
npm install bliss-svg-builder
```

### Using pnpm

```bash
pnpm add bliss-svg-builder
```

### Using yarn

```bash
yarn add bliss-svg-builder
```

## Import Patterns

### Node.js (ES Modules)

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```

### Node.js (CommonJS)

```js
const { BlissSVGBuilder } = require('bliss-svg-builder');

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```

### Browser (ES Modules)

```html
<script type="module">
  import { BlissSVGBuilder } from 'bliss-svg-builder';

  const builder = new BlissSVGBuilder('B313');  // "feeling"
  document.body.appendChild(builder.svgElement);
</script>
```

### Browser (UMD)

```html
<script src="bliss-svg-builder.umd.js"></script>
<script>
  const { BlissSVGBuilder } = window.BlissSVGBuilder;
  const builder = new BlissSVGBuilder('B313');  // "feeling"
  document.body.appendChild(builder.svgElement);
</script>
```
