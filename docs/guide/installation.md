# Installation

## Using npm

```bash
npm install bliss-svg-builder
```

## Using pnpm

```bash
pnpm add bliss-svg-builder
```

## Using yarn

```bash
yarn add bliss-svg-builder
```

## Import Patterns

### ES Modules (Browser/Node.js)

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('H');
console.log(builder.svgCode);
```

### CommonJS (Node.js)

```js
const { BlissSVGBuilder } = require('bliss-svg-builder');

const builder = new BlissSVGBuilder('H');
console.log(builder.svgCode);
```

### UMD (Browser)

```html
<script src="bliss-svg-builder.umd.js"></script>
<script>
  const { BlissSVGBuilder } = window.BlissSVGBuilder;
  const builder = new BlissSVGBuilder('H');
  document.body.innerHTML = builder.svgCode;
</script>
```

## Next Steps

- [Quick Start Guide](/guide/quick-start)
- [DSL Syntax](/guide/dsl-syntax)
