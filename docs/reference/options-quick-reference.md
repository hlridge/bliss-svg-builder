# Options Quick Reference

Quick reference for all available options.

Options can be set in the [DSL string](/handbook/syntax-options/options-system) or [programmatically](/handbook/syntax-options/programmatic-options) via the constructor.

---

## Rendering

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `color` | `#000000` | Any color | Stroke color |
| `stroke-width` | `0.5` | 0.1-1.5 | Line thickness |
| `fill` | `none` | Any color | Fill color |
| `opacity` | `1` | 0-1 | Transparency |

---

## Spacing

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `word-space` | `8` | 0-20 | Space between words |
| `char-space` | `2` | 0-10 | Space between characters |
| `external-glyph-space` | `0.8` | 0-3 | Space between external glyphs (X-codes) |

---

## Sizing & Layout

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `min-width` | `0` | ≥0 | Minimum composition width |
| `center` | off | boolean | Center content in available width |

---

## Margins

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `margin` | - | Number | All sides |
| `margin-top` | `0.75` | Number | Top margin |
| `margin-bottom` | `0.75` | Number | Bottom margin |
| `margin-left` | `0.75` | Number | Left margin |
| `margin-right` | `0.75` | Number | Right margin |

---

## Cropping

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `crop` | `0` | Number, `auto`, `auto-vertical`, `compact` | All sides or named mode |
| `crop-top` | `0` | Number or `auto` | Crop from top |
| `crop-bottom` | `0` | Number or `auto` | Crop from bottom |
| `crop-left` | `0` | Number or `auto` | Crop from left |
| `crop-right` | `0` | Number or `auto` | Crop from right |

---

## Grid Visibility

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `grid` | off | boolean | Show alignment grid |

---

## Grid Colors

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `grid-color` | - | Color | All grid lines (bulk) |
| `grid-major-color` | `#c7c7c7` | Color | Major lines (every 4 units) |
| `grid-medium-color` | `#ebebeb` | Color | Medium lines (every 2 units) |
| `grid-minor-color` | `#ebebeb` | Color | Minor lines (every 1 unit) |
| `grid-sky-color` | `#858585` | Color | Sky reference line (y=8) |
| `grid-earth-color` | `#858585` | Color | Earth reference line (y=16) |

---

## Grid Stroke Widths

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `grid-stroke-width` | `0.166` | Number | All grid lines (bulk) |
| `grid-major-stroke-width` | `0.166` | Number | Major lines |
| `grid-medium-stroke-width` | `0.166` | Number | Medium lines |
| `grid-minor-stroke-width` | `0.166` | Number | Minor lines |
| `grid-sky-stroke-width` | `0.166` | Number | Sky line |
| `grid-earth-stroke-width` | `0.166` | Number | Earth line |

---

## SVG Output

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `svg-height` | Auto | Number (px) | SVG element height |
| `svg-title` | - | String | Accessible title |
| `svg-desc` | - | String | Accessible description |
| `background` | - | Color | Background color (or bulk default for zones) |
| `background-top` | - | Color | Top zone background (above y=8) |
| `background-mid` | - | Color | Mid zone background (y=8 to y=16) |
| `background-bottom` | - | Color | Bottom zone background (below y=16) |

---

## Error Handling

| Option | Default | Type | Description |
|--------|---------|------|-------------|
| `error-placeholder` | off | boolean | Show visual placeholder for unknown codes |

---

## Option Hierarchy

Options cascade from least to most specific:

1. **Global** `[opts]||` applies to everything
2. **Word** `[opts]|` overrides global for that word
3. **Character** `[opts]` overrides word for that character
4. **Part** `[opts]>` overrides all for that part

Grid color/stroke options have their own hierarchy:
- Bulk (`grid-color`) → Category (`grid-major-color`) → Specific (`grid-sky-color`)

---

## Color Values

All color options accept:
- Hex: `#ff0000`, `#f00`
- RGB: `rgb(255, 0, 0)`
- HSL: `hsl(0, 100%, 50%)`
- Named: `red`, `blue`, `green`, etc.

