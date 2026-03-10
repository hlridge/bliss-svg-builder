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

## Scoping

Visual options (`color`, `stroke-width`) can be applied at any scope: global, word, character, or part. Layout options (grid, margin, crop, etc.) are global-only. See the [Options System](/handbook/syntax-options/options-system) for how scoping and cascade work.

Beyond the named options above, you can pass through arbitrary SVG attributes, inline CSS styles, classes, and IDs. See [SVG Pass-Through Attributes](/handbook/syntax-options/svg-pass-through) for details.

## Options Reference

See [Options Quick Reference](/reference/options-quick-reference) for defaults, value ranges, and the complete option list.
