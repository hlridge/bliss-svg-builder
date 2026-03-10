# Sizing

Control the dimensions and fitting of your Bliss SVG output.

## Standard Dimensions

Bliss characters use a standard 20-unit grid height. This keeps characters aligned in words and sentences:

<Demo code="[grid=1]||B313" title="Standard 20-unit height" />

Most glyph content sits between y=8 and y=16, with space above reserved for indicators.

## Why Shapes Need Cropping

When shapes are used in a DSL string, they are treated like parts of characters and get the full 20-unit canvas, even when the shape itself is much smaller. A heart shape is only 8 units tall, but the canvas is 20 units:

<Demo code="[grid=1]||H" title="Heart shape on a 20-unit canvas: 12 units of empty space" />

For characters, the 20-unit height is by design: it keeps them aligned in sentences. But when you're building with shapes, you typically want to remove that empty space.

### `crop=auto`

Crops all sides to the actual content bounds, the tightest possible fit:

<Demo code="[grid=1;crop=auto]||H" title="crop=auto: tight to content on all sides" />

This removes all available space from every direction.

### `crop=auto-vertical`

Crops only the vertical empty space, without affecting horizontal layout:

<Demo code="[grid=1]||H:4,8" title="Heart at x=4: intentional space on the left" />

<Demo code="[grid=1;crop=auto-vertical]||H:4,8" title="crop=auto-vertical: vertical space gone, left space preserved" />

Use `crop=auto-vertical` when you want to remove the empty grid above and below, but keep your horizontal positioning intact.

### Cropping Characters

For Bliss characters (B-codes), the 20-unit grid is intentional. If you need to reduce vertical space around characters, use numeric crop values or `crop=compact`:

<Demo code="[grid=1;crop-top=8;crop-bottom=4]||B313" title="Numeric: crop-top=8, crop-bottom=4" />

<Demo code="[grid=1;crop=compact]||B313" fullHeight title="Compact: 4 units auto-cropped" />

Compact mode is covered in detail in [Grid Customization](/handbook/appearance/grid-customization#use-zone-colors-with-crop-compact).

## Margins & Cropping

`margin` expands the SVG canvas outward, `crop` cuts into it from the edges. Both support uniform values and per-side overrides (`margin-top`, `crop-left`, etc.). Per-side values override the uniform value.

The default margin is **0.75 units** on all sides. Crop defaults to **0**.

Background color extends with the margin, while cropping cuts into the grid:

<Demo code="[grid=1;margin=4;background=#f5eb82;grid-color=#e1d878;grid-major-color=#bfb765;grid-sky-color=#7f7a44;grid-earth-color=#7f7a44]||B313" title="Background fills the margin area" />

<Demo code="[grid=1;crop-top=4;crop-bottom=4]||B313" title="Cropping cuts into the grid" />

**Per-side auto cropping.** Each crop direction also accepts `auto` to crop to the content bounds on that side. You can mix auto with numeric values:

<Demo code="[grid=1;crop-top=auto;crop-bottom=4]||B313" title="Auto top, manual bottom" />

## Minimum Width

Set a minimum width for the composition with `min-width`. This could be useful if you want a consistent width of the grid even if the Bliss composition is narrower:

<Demo code="[grid=1;min-width=16]||B313" title="min-width=16" />

<Demo code="[grid=1;crop=auto;min-width=16]||B313" title="crop=auto respects the min-width" />

## Centering

<Demo code="[grid=1;min-width=16]||B313" title="Left-aligned (default)" />

By default, content is left-aligned within its width. Enable centering with `center=1`:

<Demo code="[grid=1;min-width=16;center=1]||B313" title="Centered (center=1)" />

## Options Reference

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `margin` | `0.75` | Number | Margin on all sides |
| `margin-top` | `0.75` | Number | Top margin |
| `margin-bottom` | `0.75` | Number | Bottom margin |
| `margin-left` | `0.75` | Number | Left margin |
| `margin-right` | `0.75` | Number | Right margin |
| `crop` | `0` | Number, `auto`, `auto-vertical`, `compact` | Cropping mode |
| `crop-top` | `0` | Number or `auto` | Top crop |
| `crop-bottom` | `0` | Number or `auto` | Bottom crop |
| `crop-left` | `0` | Number or `auto` | Left crop |
| `crop-right` | `0` | Number or `auto` | Right crop |
| `min-width` | none | Number | Minimum composition width |
| `center` | `0` | `0`, `1` | Center content within width |
