# Color & Stroke

Control the visual appearance of Bliss characters with color and stroke options.

## Color

Set the stroke color with the `color` option:

<Demo code="[color=#dc2626]||B313" title="Red (#dc2626)" />

<Demo code="[color=#2563eb]||B313" title="Blue (#2563eb)" />

### Color Formats

The `color` option accepts any CSS color value:

| Format | Example | Notes |
|--------|---------|-------|
| Hex (6-digit) | `#ff0000` | Full hex color |
| Hex (3-digit) | `#f00` | Shorthand hex |
| Named | `red`, `blue`, `green` | CSS color names |
| RGB | `rgb(255,0,0)` | RGB values |
| RGBA | `rgba(255,0,0,0.5)` | RGB with alpha |

<Demo code="[color=tomato]||B313" title="Named color: tomato" />

<Demo code="[color=rgb(70,130,180)]||B313" title="RGB: steel blue" />

## Stroke Width

Control line thickness with `stroke-width` (default `0.5`, range 0.1–1.5):

<Demo code="[stroke-width=0.2]||B313" title="Thin: 0.2" />

<Demo code="[stroke-width=0.5]||B313" title="Default: 0.5" />

<Demo code="[stroke-width=1.2]||B313" title="Thick: 1.2" />

## Fill

Add a solid fill color behind the stroke paths:

<Demo code="[fill=#fef08a]||B313" title="Yellow fill" />

<Demo code="[fill=#fecaca;color=#dc2626]||B313" title="Red fill with red stroke" />

The fill renders behind the stroke, so choosing a lighter fill with a darker stroke color creates a clean layered look:

<Demo code="[fill=#c4b5fd;color=#5b21b6;stroke-width=0.8]||B431" title="Purple filled heart" />

## Opacity

Control transparency with `opacity` (default `1`, range 0–1). Opacity wraps the entire character — both stroke and fill are affected together:

<Demo code="[opacity=1]||B313" title="Full opacity (default)" />

<Demo code="[opacity=0.4]||B313" title="40% opacity" />

## SVG Attributes, Styles, Classes, and IDs

Beyond the named options above, you can pass through arbitrary SVG attributes, inline CSS styles, classes, and IDs. These are applied directly to each character's SVG group element:

<Demo code="[class=bliss-word;id=greeting]||B313//B431" title="Class and ID attributes" />

```
[class=bliss-word;id=greeting]||B313//B431
```

This lets your application's CSS or JavaScript target specific characters. Like visual options, these work at [any scope level](/handbook/dsl-syntax/options-system).

## Scoping

Visual options (`color`, `stroke-width`, `fill`, `opacity`), SVG attributes, styles, classes, and IDs can all be applied at any scope — global, word, character, or part. Layout options (grid, margin, crop, etc.) are global-only. See the [Options System](/handbook/dsl-syntax/options-system) for how scoping and cascade work.

## Options Reference

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `color` | `#000000` | Any CSS color | Stroke color |
| `stroke-width` | `0.5` | 0.1 - 1.5 | Line thickness |
| `fill` | none | Any CSS color | Fill color |
| `opacity` | `1` | 0 - 1 | Transparency |
