# Quick Start

## Your First SVG

Creating a Bliss symbol is as simple as passing a code string:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('H');
const svg = builder.svgCode;
```

<Demo code="H" title="Heart symbol" />

## Basic Shapes

Here are some basic primitive shapes:

<Demo code="C8" title="Circle (diameter 8)" />

<Demo code="C4" title="Circle (diameter 4)" />

<Demo code="VL8" title="Vertical line (length 8)" />

<Demo code="HL8" title="Horizontal line (length 8)" />

## Combining Shapes

Use semicolons (`;`) to combine multiple shapes into a character:

<Demo code="H;C4:2,2" title="Heart with small circle" />

## Using Options

Control appearance with options in square brackets:

<Demo code="[color=red]||H" title="Red heart" />

<Demo code="[color=blue;stroke-width=0.8]||C8" title="Blue circle with thick stroke" />

<Demo code="[grid=1]||H:0,8" title="Heart with grid" />

## Next Steps

- Learn the [DSL Syntax](/guide/dsl-syntax) in detail
- Explore all available [shapes](/reference/shapes)
- Browse [options](/guide/options)
