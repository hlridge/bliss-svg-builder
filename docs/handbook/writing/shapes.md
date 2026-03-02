# Shapes

Shapes are the geometric primitives used to construct Bliss characters. Most users work with B-codes, but shapes give you the power to create custom characters.

## When to Use Shapes

**Use B-codes** when a standard Blissymbolics character exists:

<Demo code="B313" title="B313 - use the B-code" />

**Use shapes** when you need to create something custom that doesn't exist in the dictionary:

<Demo code="[grid=1;crop=auto-vertical]||C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14" title="Custom smiley (no B-code exists)" />

Most users never need shapes directly. B-codes handle the vast majority of use cases.

## Shape Categories

Shapes fall into several categories:

| Category | Examples | Purpose |
|----------|----------|---------|
| Iconic | `H`, `E`, `F` | Symbolic shapes (heart, ear, fiber) |
| Circles | `C8`, `C4`, `C2`, `C1` | Sized circles |
| Half Circles | `HC8N`, `HC8S`, `HC8E`, `HC8W` | Cardinal orientations |
| Quarter Circles | `QC4NE`, `QC4NW`, `QC4SE`, `QC4SW` | Corner quarters |
| Lines | `VL8`, `HL8`, `DL8NE`, `DL8NW` | Vertical, horizontal, diagonal |
| Angles | `RA90NE`, `AA60N` | Right angles, acute angles |
| Arrows | `AN`, `AS`, `AE`, `AW` | Directional arrows |
| Crosses | `SC8`, `DC8` | Straight and diagonal crosses |
| Dots | `DOT` | Point marker |
| Waves | `W8`, `HW4N` | Wave patterns |
| Squares | `SQ8`, `SQ4` | Solid squares |
| Rectangles | `RE84`, `RE82` | Width × height rectangles |

See the [Shapes Gallery](/reference/shapes-gallery) for a complete visual reference.

## Shape Naming Conventions

Shapes follow predictable naming patterns:

### Size Suffixes

`8`, `4`, `2`, `1` indicate size in grid units:

<Demo code="[grid=1;crop=auto-vertical]||C8:0,8" title="C8 - circle, 8 units" />

<Demo code="[grid=1;crop=auto-vertical]||C4:0,8" title="C4 - circle, 4 units" />

<Demo code="[grid=1;crop=auto-vertical]||C2:0,8" title="C2 - circle, 2 units" />

### Direction Suffixes

`N`, `S`, `E`, `W`, `NE`, `SE`, `SW`, `NW` indicate orientation:

<Demo code="[grid=1;crop=auto-vertical]||HC8N:0,8" title="HC8N - half circle, opening north" />

<Demo code="[grid=1;crop=auto-vertical]||HC8S:0,8" title="HC8S - half circle, opening south" />

<Demo code="[grid=1;crop=auto-vertical]||AN:0,8" title="AN - arrow pointing north" />

<Demo code="[grid=1;crop=auto-vertical]||DL8NE:0,8" title="DL8NE - diagonal line, northeast" />

### Combined Patterns

Some shapes use both size and direction:

<Demo code="[grid=1;crop=auto-vertical]||QC4NE:0,8" title="QC4NE - quarter circle, 4 units, northeast" />

<Demo code="[grid=1;crop=auto-vertical]||QC4SW:0,8" title="QC4SW - quarter circle, 4 units, southwest" />

## Building Custom Characters

### Positioning Shapes

Use `:x,y` to place shapes on the grid:

<Demo code="[grid=1;crop=auto-vertical]||C8:0,8" title="Circle at (0,8)" />

<Demo code="[grid=1;crop=auto-vertical]||C8:4,8" title="Circle at (4,8) - shifted right" />

<Demo code="[grid=1;crop=auto-vertical]||C8:0,12" title="Circle at (0,12) - shifted down" />

### Combining Shapes

Use `;` to combine shapes into a single character:

<Demo code="[grid=1;crop=auto-vertical]||C8:0,8;DOT:4,12" title="Circle + centered dot" />

<Demo code="[grid=1;crop=auto-vertical]||VL8:0,8;VL8:8,8;HL8:0,8;HL8:0,16" title="Rectangle from lines" />

<Demo code="[grid=1;crop=auto-vertical]||C8:0,8;DOT:2,10;DOT:6,10;HC4S:4,13" title="Smiley face" />

Each shape is positioned independently. Enable `grid=1` to visualize the coordinate system.

### The `crop=auto-vertical` Option

When building with shapes directly, use `crop=auto-vertical` to fit the SVG height to the actual content instead of the fixed 20-unit grid:

```
[crop=auto-vertical]||C8:0,8;DOT:4,12
```

Without it, the builder assumes standard character dimensions. See the [Sizing guide](/handbook/spacing-layout/sizing) for details on all crop modes.

## How B-Codes Use Shapes

B-codes are defined using shapes internally:

<Demo code="B313" title="B313 - feeling" />

<Demo code="[grid=1]||H:0,8" title="Defined as H:0,8 (heart at 0,8)" />

Compound characters combine multiple elements:

<Demo code="B1103" title="B1103 - understanding" />

<Demo code="[grid=1]||B335;B412:4,0" title="Defined as B335;B412:4,0 (knowledge + into)" />

Understanding these definitions helps when creating custom characters that integrate with standard ones.

## Registering Custom Characters

Once you've designed a character from shapes, you can register it as a reusable code so it works just like a B-code. See the [Custom Codes guide](/handbook/writing/custom-codes) for how to define and register custom characters.

## Best Practices

1. **Prefer B-codes** — Only use shapes when no B-code exists
2. **Use the grid** — Enable `grid=1` while designing to see coordinates
3. **Standard positioning** — Character content normally stays within y=8 and y=16

