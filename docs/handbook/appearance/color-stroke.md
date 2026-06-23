# Color & Stroke

## Color

Set the stroke color with the `color` option (default: black, `#000000`). The option accepts any CSS color value: hex codes (`#dc2626`, `#f00`), named colors (`red`, `tomato`), `rgb()`, and `rgba()`.

<Demo code="[color=#dc2626]||B313" title="Red stroke" />

### Per-Character Color

Color can be applied at [any scope](/handbook/syntax-options/options-system). When set on individual characters within a sentence, it draws attention to specific parts:

<Demo code="[color=gray]||B313/B431//[color=#dc2626]|B431;B81//B313" title="One word highlighted" />

This is useful in teaching materials where you want to focus on a particular word while keeping the rest neutral.

## Stroke Width

Control line thickness with `stroke-width` (default `0.5`, range 0.1 to 1.5):

<Demo code="[stroke-width=0.3]||B313" title="Thin: 0.3" />

<Demo code="[stroke-width=0.5]||B313" title="Default: 0.5" />

<Demo code="[stroke-width=1]||B313" title="Thick: 1.0" />

Thicker strokes improve visibility at small sizes or on low-contrast displays. Thinner strokes feel lighter and work well at larger sizes. The default 0.5 is a balance for typical use.

For AAC communication boards viewed at arm's length, consider `stroke-width=0.8` or higher. For decorative or large-format display, `0.3` may be enough.

## Dot Sizing

Bliss uses two dot sizes: `DOT` (full size) and `SDOT` (small dot). `COMMA` is built from the DOT family and scales with it. By default the small dot is half the extra width of the full dot, so the two stay visually distinct.

<Demo code="[grid]||DOT:2,10;SDOT:6,10" title="DOT (left) and SDOT (right) at default sizes" />

Dot size is controlled separately from the line `stroke-width`, with two relative options and two absolute ones.

### Relative sizing

`dot-extra-width` sets how much wider a dot is than the line stroke (rendered diameter = `stroke-width + value`, range 0 to 1). It is a **bulk** knob: it sizes the full `DOT`, and the small `SDOT` follows at half the value, preserving the size relationship.

<Demo code="[grid;dot-extra-width=1]||DOT:2,10;SDOT:6,10" title="dot-extra-width=1: DOT grows, SDOT follows at half" />

To size the small dot on its own, use `sdot-extra-width`, which overrides the half-default:

<Demo code="[grid;sdot-extra-width=0.8]||SDOT:4,10" title="sdot-extra-width=0.8: a larger small dot" />

### Absolute sizing

`dot-width` and `sdot-width` pin a dot's **rendered diameter** directly (range 0 to 1.5), independent of `stroke-width`. This is useful when you need predictable dot metrics regardless of line weight.

<Demo code="[grid;dot-width=1.5]||DOT:4,10" title="dot-width=1.5: absolute diameter" />

When both an absolute and a relative option apply to the same dot, **absolute wins** (`dot-width` over `dot-extra-width`, `sdot-width` over `sdot-extra-width`).

### Indicator and custom dots

Indicators that carry a dot render it at the small `SDOT` size, so it reads as a fine diacritic rather than an oversized mark, while structural dots inside a glyph keep their full size.

You can register a custom dot size through [custom codes](/handbook/writing/custom-codes), but a custom dot is a new drawing primitive, so it does not serialize portably: `toString()` emits the bare code name, which only renders in a builder that has the same definition. This matches every custom drawing primitive, not just dots.

## Scoping

Visual options (`color`, `stroke-width`, and the dot-sizing options) can be applied at any scope: global, word, character, or part. Layout options (grid, margin, crop, etc.) are global-only. See the [Options System](/handbook/syntax-options/options-system) for how scoping and cascade work.

Beyond the named options above, you can pass through arbitrary SVG attributes, inline CSS styles, classes, and IDs. See [SVG Pass-Through Attributes](/handbook/syntax-options/svg-pass-through) for details.

## Options Reference

See [Options Quick Reference](/reference/options-quick-reference) for defaults, value ranges, and the complete option list.
