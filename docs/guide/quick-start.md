# Quick Start

## Your First SVG

Creating a Bliss symbol is as simple as passing an input string:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('[freestyle=1]||H');
const svg = builder.svgCode;
```

<Demo code="[freestyle=1]||H" title="Heart shape" />

### Why `freestyle=1`?

Bliss characters have a standard height of 20 units. When working with primitive shapes, use `freestyle=1` to fit the SVG to the actual content (instead of the full 20-unit height).

Compare with grid visible:

<Demo code="[grid=1]||H" title="Without freestyle (standard 20-unit height)" />

<Demo code="[grid=1;freestyle=1]||H" title="With freestyle (fits content)" />

## Basic Shapes

Here are some basic primitive shapes with `freestyle=1`:

<Demo code="[freestyle=1]||C8" title="Circle (diameter 8)" />

<Demo code="[freestyle=1]||VL8" title="Vertical line (length 8)" />

<Demo code="[freestyle=1]||HL8" title="Horizontal line (length 8)" />

## Combining Shapes

Use semicolons (`;`) to combine multiple shapes:

<Demo code="[freestyle=1]||H;C4:2,2" title="Heart with small circle" />

## Using Options

Control appearance with options in square brackets:

<Demo code="[color=red;freestyle=1]||H" title="Red heart" />

<Demo code="[color=blue;stroke-width=0.8;freestyle=1]||C8" title="Blue circle with thick stroke" />

## Next Steps

- Learn the [DSL Syntax](/guide/dsl-syntax) in detail
- Explore all available [shapes](/reference/shapes)
- Browse [options](/guide/options)
