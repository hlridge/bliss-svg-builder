# Bliss SVG Builder

A JavaScript library for generating SVG representations of Blissymbolics (Bliss) using a Domain-Specific Language.

[![npm version](https://img.shields.io/npm/v/bliss-svg-builder/alpha)](https://www.npmjs.com/package/bliss-svg-builder)

## What is Bliss SVG Builder?

Bliss SVG Builder enables you to **programmatically generate Bliss characters** in your JavaScript applications. It's designed as a library to power AAC applications, educational tools, communication boards, and any system that needs to create or display Bliss dynamically.

Using a simple DSL (Domain-Specific Language), you can create everything from basic shapes to complex Bliss compositions:

```javascript
import { BlissSVGBuilder } from 'bliss-svg-builder';

// Simple shape
const heart = new BlissSVGBuilder('[grid=1;freestyle=1;background=#fafafa]||H');

// Bliss character
const feeling = new BlissSVGBuilder('[grid=1;background=#fafafa]||B313');

// Complex composition - "I love Blissymbolics!"
const sentence = new BlissSVGBuilder('[grid=1;background=#fafafa]||B513/B10//B431;B81//B414/B167//B1');
```

### Visual Examples

**Simple shape** - Heart with freestyle mode:
```
Input:  [grid=1;freestyle=1;background=#fafafa]||H
```
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="57" height="57" viewBox="-0.75 -0.75 9.5 9.5" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5" freestyle="true">
  <rect x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="#fafafa"/><path class="grid-line grid-line--minor" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,1h8M0,3h8M0,5h8M0,7h8M0,9h8M0,11h8M0,13h8M0,15h8M0,17h8M0,19h8M1,0V8M3,0V8M5,0V8M7,0V8"/>
  <path class="grid-line grid-line--medium" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,2h8M0,6h8M0,10h8M0,14h8M0,18h8M2,0V8M6,0V8"/>
  <path class="grid-line grid-line--major" stroke-width="0.166" stroke="#c7c7c7" stroke-linecap="square" stroke-linejoin="miter" d="M0,0h8M0,4h8M0,12h8M0,20h8M0,0V8M4,0V8M8,0V8"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,16h8"/>
  <path d="M0,2a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"></path>
</svg>

**Bliss character** - B313 (FEELING):
```
Input:  [grid=1;background=#fafafa]||B313
```
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="57" height="129" viewBox="-0.75 -0.75 9.5 21.5" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
  <rect x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="#fafafa"/><path class="grid-line grid-line--minor" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,1h8M0,3h8M0,5h8M0,7h8M0,9h8M0,11h8M0,13h8M0,15h8M0,17h8M0,19h8M1,0V20M3,0V20M5,0V20M7,0V20"/>
  <path class="grid-line grid-line--medium" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,2h8M0,6h8M0,10h8M0,14h8M0,18h8M2,0V20M6,0V20"/>
  <path class="grid-line grid-line--major" stroke-width="0.166" stroke="#c7c7c7" stroke-linecap="square" stroke-linejoin="miter" d="M0,0h8M0,4h8M0,12h8M0,20h8M0,0V20M4,0V20M8,0V20"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,16h8"/>
  <path d="M0,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6"></path>
</svg>

**Complex composition** - "I love Blissymbolics!":
```
Input:  [grid=1;background=#fafafa]||B513/B10//B431;B81//B414/B167//B1
```
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="369" height="129" viewBox="-0.75 -0.75 61.5 21.5" fill="none" stroke="#000000" stroke-linejoin="round" stroke-linecap="round" stroke-width="0.5">
  <rect x="-0.75" y="-0.75" width="100%" height="100%" stroke="none" fill="#fafafa"/><path class="grid-line grid-line--minor" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,1h60M0,3h60M0,5h60M0,7h60M0,9h60M0,11h60M0,13h60M0,15h60M0,17h60M0,19h60M1,0V20M3,0V20M5,0V20M7,0V20M9,0V20M11,0V20M13,0V20M15,0V20M17,0V20M19,0V20M21,0V20M23,0V20M25,0V20M27,0V20M29,0V20M31,0V20M33,0V20M35,0V20M37,0V20M39,0V20M41,0V20M43,0V20M45,0V20M47,0V20M49,0V20M51,0V20M53,0V20M55,0V20M57,0V20M59,0V20"/>
  <path class="grid-line grid-line--medium" stroke-width="0.166" stroke="#ebebeb" stroke-linecap="square" stroke-linejoin="miter" d="M0,2h60M0,6h60M0,10h60M0,14h60M0,18h60M2,0V20M6,0V20M10,0V20M14,0V20M18,0V20M22,0V20M26,0V20M30,0V20M34,0V20M38,0V20M42,0V20M46,0V20M50,0V20M54,0V20M58,0V20"/>
  <path class="grid-line grid-line--major" stroke-width="0.166" stroke="#c7c7c7" stroke-linecap="square" stroke-linejoin="miter" d="M0,0h60M0,4h60M0,12h60M0,20h60M0,0V20M4,0V20M8,0V20M12,0V20M16,0V20M20,0V20M24,0V20M28,0V20M32,0V20M36,0V20M40,0V20M44,0V20M48,0V20M52,0V20M56,0V20M60,0V20"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,8h60"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="0.166" stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,16h60"/>
  <path d="M0,16h4M2,8v8M6,13l1,-1M7,12v4M6,16h2M16,12h4M20,10a2,2 0 1,1 4,0a2,2 0 1,1 4,0q0,3 -4,6q-4,-3 -4,-6M24,12h8M30,10l2,2M30,14l2,-2M23,6l1,-2M24,4l1,2M40,12a2,2 0 1,1 4,0a2,2 0 1,1 -4,0M42,10a2,2 0 1,1 4,0q0,3 -4,6M48,8h8M48,16h8M48,8l8,8M60,8v6"></path><path stroke-width="0.4165" d="M59.79175,16a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0"></path><path d=""></path>
</svg>

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

## Module Format Support

Bliss SVG Builder works everywhere JavaScript runs:

- **ES Modules (ESM)** - Modern bundlers (Vite, Webpack, etc.) and Node.js
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
