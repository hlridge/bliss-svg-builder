# SVG Pass-Through Attributes

Any option that Bliss SVG Builder doesn't recognize as a built-in option is passed through directly as an SVG attribute. This page documents how the mechanism works and what it enables.

## How It Works

The builder maintains a set of known option keys (`color`, `stroke-width`, `margin`, `grid`, etc.). When you set an option that isn't in this set, it passes through to the SVG output as-is.

Where a pass-through attribute lands depends on the level you set it at. A **global** option is merged onto the `<g class="bliss-content">` wrapper; a **word**, **character**, or **part** option is placed on a `<g>` that wraps just that word, character, or part. Every one of these targets sits inside the SVG `viewBox`, never on the root `<svg>` element.

```
[opacity=0.5]||B313
```

<Demo code="[opacity=0.5]||B313" title="opacity passes through to the SVG element" />

```
[stroke-dasharray=2,1]||B313
```

<Demo code="[stroke-dasharray=2,1]||B313" title="stroke-dasharray passes through" />

## Stroke Line Joins & Caps

Bliss SVG Builder sets `stroke-linejoin` and `stroke-linecap` to `round` by default. These produce the smooth, rounded line endings that are characteristic of Blissymbolics. They can be overridden via pass-through:

<Demo code="B313" title="Default: round joins and caps" />

<Demo code="[stroke-linejoin=miter;stroke-linecap=butt]||B313" title="Overridden: miter joins, butt caps" />

## Style Attribute

The `style` attribute passes through like any other, so you can apply inline CSS to the wrapper element for whichever level you target (global, word, character, or part):

```
[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313
```

<Demo code="[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313" title="CSS filter via style pass-through" />

### Using CSS `filter`

The `filter` property is worth a note because, like every pass-through, it applies to a `<g>` inside the SVG coordinate system rather than to the root `<svg>`. A filter therefore behaves as part of the artwork, which is intentional and matches how SVG works: the effect stays locked to the symbol and scales with it.

- **Filter lengths are in grid units, not screen pixels.** Inside the SVG a CSS length is read in the symbol's own coordinate system, the same units as the strokes, so `drop-shadow(2px 2px 2px ...)` really means `drop-shadow(2 2 2 ...)` in grid units. At this scale that is a lot: a stroke is only 0.5 units wide, and most symbols span just 4 to 8 units (some as little as 2), so a 2-unit offset and blur is several times the line width and about the size of a small symbol, nothing like the 2 pixels the `px` suffix suggests. Grid units are also what let the shadow scale with the symbol rather than stay a fixed screen size, so its size in pixels depends on how large the SVG is displayed. Think in grid units, where even `1px` (one grid unit) is already a prominent shadow.
- **Multiple `drop-shadow()`s chain,** exactly as they do in any CSS filter list: each one is applied to the result of the previous.
- **A tight viewBox clips an outward shadow.** Add margin to give it room.

Browsers render CSS filters on SVG groups inconsistently. This is a browser limitation, not specific to Bliss SVG Builder:

- **Firefox** renders them faithfully.
- **Chromium and Edge** drop offsets and blur radii below about 1 grid unit, so keep filter lengths at 1 grid unit or more (go a little above 1 for effects that must stay visible in these engines).
- **Safari (WebKit)** does not apply a CSS `filter` to an SVG group at all, at any size.

Because of that, a CSS `filter` set this way is not dependable in every browser today. For an effect that must look identical everywhere, prefer the pass-through properties that render consistently: `stroke-width`, `stroke-dasharray`, `transform`, `fill`, `opacity`, and `mix-blend-mode`.

Reliable cross-browser filters are planned through a native SVG `<filter>`; follow [#34](https://github.com/hlridge/bliss-svg-builder/issues/34) for progress.

## ID Attribute

You can assign an `id` to the SVG element via pass-through:

```
[id=my-bliss-symbol]||B313
```

This is useful when you need to reference the SVG from external CSS or JavaScript.

## Links with href

When an element-level option includes `href`, the builder wraps that character in an SVG `<a>` element, making it a clickable link:

```
B313/[href=https://blissary.com]B291
```

<Demo code="B313/[href=https://blissary.com]B291" title="Second character is a clickable link" />

### Supported Link Attributes

These attributes are placed on the `<a>` element (not the `<g>`):

| Attribute | Purpose |
|-----------|---------|
| `href` | Link URL (required to create a link) |
| `target` | Where to open (`_blank`, `_self`, etc.) |
| `rel` | Link relationship (`noopener`, etc.) |
| `download` | Suggest download instead of navigation |
| `hreflang` | Language of the linked resource |
| `type` | MIME type hint |
| `referrerpolicy` | Referrer policy |

All other element-level attributes go on the wrapping `<g>` element, so you can combine links with visual styling:

```
[href=https://example.com;color=blue]||B313
```

<Demo code="[href=https://example.com;color=blue]||B313" title="Linked and colored" />

### Automatic Behaviors

- **Pointer cursor**: Links automatically get `cursor: pointer`
- **Pointer events**: `pointer-events="bounding-box"` is added to the `<g>` wrapper so the entire character area is clickable, not just the strokes

## Safety

Pass-through attributes are sanitized:

- **String values** are HTML-escaped to prevent injection
- **Event handlers** (`onclick`, `onload`, etc.) are blocked entirely
- **Dangerous URLs** (`javascript:`, `data:`, `vbscript:`) are rejected in `href`

## SVG Structure

The SVG root element is purely structural (`xmlns`, `width`, `height`, `viewBox`) and includes a `data-generator` attribute identifying the library version. Global styling and pass-through attributes live on the `<g class="bliss-content">` wrapper inside it; word-, character-, and part-level attributes go on nested `<g>` elements within it:

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="...">
  <g class="bliss-content" fill="none" stroke="#000000" stroke-width="0.5" ...>
    <!-- character paths -->
  </g>
</svg>
```

## Common Pass-Through Attributes

| Attribute | Example Value | Effect |
|-----------|---------------|--------|
| `opacity` | `0.5` | Transparency |
| `stroke-dasharray` | `2,1` | Dashed lines |
| `fill` | `#eee` | Fill color |
| `transform` | `rotate(15)` | SVG transform |
| `class` | `my-class` | CSS class |
| `id` | `my-symbol` | Element ID |
| `style` | `filter:blur(1px)` | Inline CSS (`filter` scales with the symbol and is not applied by Safari, see [Style Attribute](#style-attribute)) |
