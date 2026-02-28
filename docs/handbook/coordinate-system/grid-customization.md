# Grid Customization

Customize the grid's appearance for better visibility during design.

## Enabling the Grid

Use `grid=1` to show the grid overlay:

<Demo code="[grid=1]||B313" title="Grid enabled" />

<Demo code="B313" title="Grid disabled (default)" />

| Option | Default | Values |
|--------|---------|--------|
| `grid` | `0` | `0` or `1` |

## Grid Colors

### All Grid Lines

Set all grid lines to a single color with `grid-color`:

<Demo code="[grid=1;grid-color=#ff0000]||B313" title="Red grid" />

<Demo code="[grid=1;grid-color=#0066cc]||B313" title="Blue grid" />

<Demo code="[grid=1;grid-color=#888888]||B313" title="Gray grid" />

### Category Colors

Control colors by grid line category:

| Option | Description |
|--------|-------------|
| `grid-major-color` | Major lines (every 4 units) |
| `grid-medium-color` | Medium lines (every 2 units) |
| `grid-minor-color` | Minor lines (every 1 unit) |

<Demo code="[grid=1;grid-major-color=#0000ff;grid-minor-color=#ccccff]||B313" title="Blue major, light blue minor" />

<Demo code="[grid=1;grid-major-color=#cc0000;grid-medium-color=#ff6666;grid-minor-color=#ffcccc]||B313" title="Red gradient" />

### Reference Line Colors

Customize the sky and earth reference lines:

| Option | Description |
|--------|-------------|
| `grid-sky-color` | Sky line (y=8) |
| `grid-earth-color` | Earth line (y=16) |

<Demo code="[grid=1;grid-sky-color=#00cc00;grid-earth-color=#cc6600]||B313" title="Green sky, orange earth" />

## Grid Stroke Width

Control the thickness of grid lines:

### All Lines

<Demo code="[grid=1;grid-stroke-width=0.3]||B313" title="Thin grid lines" />

<Demo code="[grid=1;grid-stroke-width=1]||B313" title="Thick grid lines" />

### By Category

| Option | Description |
|--------|-------------|
| `grid-stroke-width` | All grid lines |
| `grid-major-stroke-width` | Major lines only |
| `grid-minor-stroke-width` | Minor lines only |

<Demo code="[grid=1;grid-major-stroke-width=1;grid-minor-stroke-width=0.2]||B313" title="Bold major, subtle minor" />

## Color Hierarchy

Grid options follow a hierarchy from general to specific:

1. `grid-color` (most general) - Sets all lines
2. `grid-major-color`, `grid-minor-color` (category) - Override for category
3. `grid-sky-color`, `grid-earth-color` (specific) - Override for specific lines

Example:

```
[grid=1;grid-color=#cccccc;grid-major-color=#666666;grid-sky-color=#00aa00]||B313
```

This sets:
- All lines to light gray (`#cccccc`)
- Major lines override to dark gray (`#666666`)
- Sky line overrides to green (`#00aa00`)

<Demo code="[grid=1;grid-color=#cccccc;grid-major-color=#666666;grid-sky-color=#00aa00]||B313" title="Color hierarchy example" />

## Practical Examples

### High Contrast Grid

For precise positioning work:

<Demo code="[grid=1;grid-color=#000000;grid-stroke-width=0.5]||B313" title="High contrast for precision" />

### Subtle Background Grid

For screenshots or documentation:

<Demo code="[grid=1;grid-color=#e0e0e0;grid-stroke-width=0.3]||B313" title="Subtle grid" />

### Content Area Emphasis

Highlight the main content zone:

<Demo code="[grid=1;grid-color=#dddddd;grid-sky-color=#4488ff;grid-earth-color=#4488ff]||B313" title="Emphasized content area" />

### Minimal Major Lines Only

<Demo code="[grid=1;grid-minor-color=#f5f5f5;grid-major-color=#cccccc]||B313" title="Major lines prominent" />

## Options Reference

### Color Options

| Option | Default | Description |
|--------|---------|-------------|
| `grid-color` | `#ccc` | All grid lines |
| `grid-major-color` | - | Major lines (every 4 units) |
| `grid-medium-color` | - | Medium lines (every 2 units) |
| `grid-minor-color` | - | Minor lines (every 1 unit) |
| `grid-sky-color` | - | Sky line (y=8) |
| `grid-earth-color` | - | Earth line (y=16) |

### Stroke Width Options

| Option | Default | Description |
|--------|---------|-------------|
| `grid-stroke-width` | `0.5` | All grid lines |
| `grid-major-stroke-width` | - | Major lines only |
| `grid-minor-stroke-width` | - | Minor lines only |

