# Margins & Cropping

Add or remove space around your Bliss compositions with margin and crop options.

## Margins

Add space around the composition. Margins expand the SVG canvas.

### Uniform Margins

Use `margin` to add equal space on all sides:

<Demo code="[background=#f0f0f0]||B313" title="No margin" />

<Demo code="[margin=2;background=#f0f0f0]||B313" title="margin=2" />

<Demo code="[margin=4;background=#f0f0f0]||B313" title="margin=4" />

### Directional Margins

Control each side independently:

| Option | Description |
|--------|-------------|
| `margin-top` | Space above |
| `margin-bottom` | Space below |
| `margin-left` | Space on left |
| `margin-right` | Space on right |

<Demo code="[margin-top=4;background=#f0f0f0]||B313" title="Top margin only" />

<Demo code="[margin-left=4;margin-right=4;background=#f0f0f0]||B313" title="Horizontal margins" />

<Demo code="[margin-top=2;margin-bottom=6;background=#f0f0f0]||B313" title="Different top/bottom" />

### Combined with Uniform

Directional margins can override the uniform margin:

<Demo code="[margin=2;margin-top=6;background=#f0f0f0]||B313" title="margin=2 but margin-top=6" />

## Cropping

Remove space from the composition edges. Cropping reduces the SVG canvas.

### Uniform Cropping

Use `crop` to remove equal space from all sides:

<Demo code="[grid=1]||B313" title="No crop" />

<Demo code="[crop=2;grid=1]||B313" title="crop=2" />

<Demo code="[crop=4;grid=1]||B313" title="crop=4" />

### Directional Cropping

Control each side independently:

| Option | Description |
|--------|-------------|
| `crop-top` | Remove from top |
| `crop-bottom` | Remove from bottom |
| `crop-left` | Remove from left |
| `crop-right` | Remove from right |

<Demo code="[crop-top=4;grid=1]||B313" title="Top cropped by 4" />

<Demo code="[crop-bottom=4;grid=1]||B313" title="Bottom cropped by 4" />

<Demo code="[crop-top=4;crop-bottom=4;grid=1]||B313" title="Top and bottom cropped" />

### Auto Cropping

Each crop direction accepts the value `auto`, which crops to the actual rendered bounds on that side:

<Demo code="[crop=auto]||B313" title="crop=auto (all sides to content)" />

<Demo code="[crop-top=auto]||B313" title="crop-top=auto (only top)" />

You can mix `auto` with specific values:

<Demo code="[crop-top=auto;crop-bottom=4]||B313" title="Auto top, manual bottom" />

### Auto vs Manual Cropping

`crop=auto` detects content edges automatically. Manual values give you precise control:

<Demo code="B313" title="Standard" />

<Demo code="[crop=auto]||B313" title="Auto-cropped" />

<Demo code="[crop-top=8;crop-bottom=4]||B313" title="Manual crop (specific values)" />

## Common Use Cases

### Adding Padding for Buttons

<Demo code="[margin=3;background=#2563eb;color=#ffffff]||B313" title="Button-style with padding" />

### Removing Standard Margins

Bliss characters have built-in spacing for sentence alignment. Remove it for standalone use:

<Demo code="[crop-top=8;crop-bottom=4]||B313" title="Cropped for tight display" />

### Creating Consistent Heights

For UI elements that need uniform height:

<Demo code="[crop-top=8;crop-bottom=4;margin=2;background=#f0f0f0]||B313" title="Consistent frame" />

<Demo code="[crop-top=8;crop-bottom=4;margin=2;background=#f0f0f0]||B431" title="Same treatment" />

## Interaction with Other Options

### Margins + Background

Margins are included in the background area:

<Demo code="[margin=4;background=#fef3c7]||B313" title="Background extends into margins" />

### Cropping + Grid

The grid shows the coordinate system. Cropping removes visible grid area:

<Demo code="[grid=1]||B313" title="Full grid" />

<Demo code="[crop-top=4;crop-bottom=4;grid=1]||B313" title="Cropped grid" />

## Options Reference

### Margin Options

| Option | Default | Description |
|--------|---------|-------------|
| `margin` | `0.75` | All sides |
| `margin-top` | `0.75` | Top only |
| `margin-bottom` | `0.75` | Bottom only |
| `margin-left` | `0.75` | Left only |
| `margin-right` | `0.75` | Right only |

### Crop Options

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `crop` | `0` | Number, `auto`, `auto-height`, `compact` | All sides (see [Sizing](/handbook/spacing-layout/sizing) for named modes) |
| `crop-top` | `0` | Number or `auto` | Top only |
| `crop-bottom` | `0` | Number or `auto` | Bottom only |
| `crop-left` | `0` | Number or `auto` | Left only |
| `crop-right` | `0` | Number or `auto` | Right only |

