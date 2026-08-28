# Options Quick Reference

Quick reference for all available options.

Options can be set in the [DSL string](/handbook/syntax-options/options-system) or [programmatically](/handbook/syntax-options/programmatic-options) via the constructor.

**Scope:** the [Rendering](#rendering) and [Dots](#dots) options (plus [SVG pass-through attributes](/handbook/syntax-options/svg-pass-through)) cascade at every scope: global `[opts]||`, word `[opts]|`, character `[opts]`, part `[opts]>`. Everything else on this page is canvas-wide and takes effect only at global scope; at any other scope the key is dropped with a [`MISPLACED_GLOBAL_OPTION`](/reference/warning-codes#misplaced-global-option) warning.

**Where a pass-through attribute lands:** at global scope it goes on the root `<svg>`, so it applies to the whole picture. Prefix it with `background--`, `grid--` or `content--` to target one layer instead. At any other scope it goes on the `<g>` wrapping that element, and a layer prefix there is dropped with a [`MISPLACED_LAYER_OPTION`](/reference/warning-codes#misplaced-layer-option) warning. See [SVG pass-through attributes](/handbook/syntax-options/svg-pass-through).

---

## Rendering

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `color` | `#000000` | Any color | Stroke color. This name is taken, so the raw `color` attribute is written `content--color` (see [layer targeting](/handbook/syntax-options/svg-pass-through#targeting-one-layer)) |
| `stroke-width` | `0.5` | Any number | Line thickness |
| `fill` | `none` | Any color | Fill color |
| `opacity` | `1` | 0-1 | Transparency |

---

## Dots

`DOT` is the full-size dot, `SDOT` the small dot (used by indicators); `COMMA` rides the DOT family. Dot size is controlled separately from the line stroke, with two relative options and two absolute ones.

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `dot-extra-width` | `0.333` | 0-1 | Relative extra width over the stroke for the DOT family. Bulk knob: SDOT follows at half. Rendered diameter = `stroke-width + value` |
| `sdot-extra-width` | `0.1665` | 0-1 | Relative extra for SDOT only, overriding the `dot-extra-width` half-default |
| `dot-width` | unset | 0-1.5 | Absolute rendered DOT diameter, independent of stroke-width. Overrides `dot-extra-width` |
| `sdot-width` | unset | 0-1.5 | Absolute rendered SDOT diameter. Overrides `sdot-extra-width` and the half-default |

Precedence within a dot type: **absolute wins over relative**. These options cascade at every scope (global, word, character, part), like `color` and `stroke-width`.

---

## Spacing

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `word-space` | `8` | 0-20 | Space between words |
| `char-space` | `2` | 0-10 | Space between characters |
| `external-glyph-space` | `0.8` | 0-3 | Space between external glyphs (X-codes) |

---

## Positioning

These four are the exception to the scope note above: they are not canvas-wide, they position one element, and what they mean depends on which scope you write them at. They work identically in the DSL and through an options object (`{ x: 5 }`, `{ relativeKerning: -1 }`), including the opts argument of `addGlyph`, `insertPart`, `replaceGlyph` and the rest of that family.

| Option | Scope | Description |
|--------|-------|-------------|
| `x` | part `[opts]>` | Position inside the character. Same as the `CODE:x,y` suffix, and the option wins when both are written ([`MULTIPLE_POSITION_VALUES`](/reference/warning-codes)) |
| `x` | character `[opts]` | Leading blank owned by the character: it widens the character and moves its ink in, without moving the character. See [Positioning](/handbook/appearance/positioning#character-level-x-is-leading-blank) |
| `x` | word `[opts]\|`, global `[opts]\|\|` | Moves the word itself, measured from the end of what precedes it, so `[x=0]\|` drops the word space back to a character space |
| `y` | any | A plain offset at every scope, since nothing else decides the vertical |
| `relative-kerning` | character `[opts]` only | The `RK:` marker as an option: adjusts the gap before this character. At any other scope it is dropped with a [`MISPLACED_KERNING_OPTION`](/reference/warning-codes) warning |
| `absolute-kerning` | character `[opts]` only | The `AK:` marker as an option: sets the gap before this character. Same rule about other scopes |

One position per part and one kerning value per character, however you spell it. The last value written wins, an option beats the positional shorthand, and every value that loses is reported rather than dropped in silence.

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

One bracket per scope: combine options with `;` (`[grid;grid-color=red]||`); a second bracket at the same scope is ignored with a [`MULTIPLE_OPTION_BRACKETS`](/reference/warning-codes#multiple-option-brackets) warning. Misplaced options are dropped with a warning and the content still renders; see [Option Placement Is Checked](/handbook/syntax-options/options-system#option-placement-is-checked).

---

## Color Values

All color options accept:
- Hex: `#ff0000`, `#f00`
- RGB: `rgb(255, 0, 0)`
- HSL: `hsl(0, 100%, 50%)`
- Named: `red`, `blue`, `green`, etc.

