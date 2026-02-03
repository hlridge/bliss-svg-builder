# Installation & Setup

Get Bliss SVG Builder installed and render your first SVG.

## Installation

### Using npm

```bash
npm install bliss-svg-builder@alpha
```

### Using pnpm

```bash
pnpm add bliss-svg-builder@alpha
```

### Using yarn

```bash
yarn add bliss-svg-builder@alpha
```

## Import Patterns

### Node.js (ES Modules)

```js
import { BlissSVGBuilder } from 'bliss-svg-builder@alpha';

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```

### Node.js (CommonJS)

```js
const { BlissSVGBuilder } = require('bliss-svg-builder@alpha');

const builder = new BlissSVGBuilder('B313');  // "feeling"
console.log(builder.svgCode);
```

### Browser (ES Modules)

```html
<script type="module">
  import { BlissSVGBuilder } from 'bliss-svg-builder@alpha';

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

## Sharing Examples

Create shareable examples on CodePen or JSFiddle using unpkg.

Paste this in the JavaScript panel (with module mode enabled):

```js
import { BlissSVGBuilder } from 'https://unpkg.com/bliss-svg-builder@alpha/dist/bliss-svg-builder.esm.js';

const builder = new BlissSVGBuilder('B313');  // "feeling"
document.body.appendChild(builder.svgElement);
```

Perfect for bug reports, demos, or collaborating with others.
