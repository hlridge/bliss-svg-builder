# SVG Pass-Through Attributes

Any option that Bliss SVG Builder doesn't recognize as a built-in option is passed through directly as an SVG attribute. This page documents how the mechanism works and what it enables.

## How It Works

The builder maintains a set of known option keys (`color`, `stroke-width`, `margin`, `grid`, etc.). When you set an option that isn't in this set, it passes through to the SVG output as-is.

Where a pass-through attribute lands depends on the level you set it at. A **global** option goes on the root `<svg>` element, so it applies to the whole picture: the artwork, and the paper and grid if you have switched them on. A **word**, **character**, or **part** option goes on a `<g>` that wraps just that word, character, or part.

The name you write is the name that is emitted, exactly as you typed it. That matters for the SVG attributes spelled in camelCase, such as `preserveAspectRatio` and `gradientUnits`, and for your own `data-` attributes.

```
[opacity=0.5]||B313
```

<Demo code="[opacity=0.5]||B313" title="opacity fades the whole picture" />

## Targeting One Layer

A global option applies to everything. When you want just one part of the output, prefix the attribute with the layer you mean, using a double dash:

| Prefix | Where it lands |
|--------|----------------|
| *(none)* | the root `<svg>`, so the whole picture |
| `background--` | the paper rectangle, or each of the three zone rectangles when you have set them separately |
| `grid--` | the reference grid group |
| `content--` | the group holding the Bliss artwork |

```
[grid;grid--opacity=0.3]||B313
```

<Demo code="[grid;grid--opacity=0.3]||B313" title="A faded grid behind full-strength artwork" />

Compare that with the unprefixed spelling, which fades the grid and the artwork together:

<Demo code="[grid;opacity=0.3]||B313" title="Everything faded" />

The prefixed form is a raw channel: the attribute name is emitted exactly as written, with no interpretation. That is what makes `content--color` reach the real `color` attribute, where the plain `color` option is a friendlier name for `stroke`.

A layer prefix only means something at global scope, since the layers belong to the document as a whole. Written on a word, character or part it is reported and dropped. A prefix naming a layer that does not exist, such as `foo--x`, is reported too, and nothing is emitted for it.

```
[stroke-dasharray=2,1]||B313
```

<Demo code="[stroke-dasharray=2,1]||B313" title="stroke-dasharray passes through" />

## Stroke Line Joins & Caps

Bliss SVG Builder sets `stroke-linejoin` and `stroke-linecap` to `round` by default. These produce the smooth, rounded line endings that are characteristic of Blissymbolics. They can be overridden via pass-through:

<Demo code="B313" title="Default: round joins and caps" />

<Demo code="[stroke-linejoin=miter;stroke-linecap=butt]||B313" title="Overridden: miter joins, butt caps" />

## Style Attribute

The `style` attribute passes through like any other, so you can apply inline CSS at whichever level you target (global, one layer, word, character, or part):

```
[content--style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313
```

<Demo code="[content--style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313" title="CSS filter via style pass-through" />

### Using CSS `filter`

Which spelling you use decides what the lengths mean, and the difference is large enough to surprise you.

**Inside the picture** (`content--style`, or a word, character or part option) the filter applies to a `<g>` within the SVG coordinate system. It behaves as part of the artwork: the effect stays locked to the symbol and scales with it.

- **Filter lengths are in grid units, not screen pixels.** Inside the SVG a CSS length is read in the symbol's own coordinate system, the same units as the strokes, so `drop-shadow(2px 2px 2px ...)` really means `drop-shadow(2 2 2 ...)` in grid units. At this scale that is a lot: a stroke is only 0.5 units wide, and most symbols span just 4 to 8 units (some as little as 2), so a 2-unit offset and blur is several times the line width and about the size of a small symbol, nothing like the 2 pixels the `px` suffix suggests. Grid units are also what let the shadow scale with the symbol rather than stay a fixed screen size, so its size in pixels depends on how large the SVG is displayed. Think in grid units, where even `1px` (one grid unit) is already a prominent shadow.
- **Multiple `drop-shadow()`s chain,** exactly as they do in any CSS filter list: each one is applied to the result of the previous.
- **A tight viewBox clips an outward shadow.** Add margin to give it room.

**On the whole picture** (a plain global `style`) the filter applies to the root `<svg>`, which your page treats like any other element. Lengths are ordinary CSS pixels there, so `2px` really is 2 pixels, the effect covers the paper and grid as well as the artwork, and it is not clipped by the viewBox. It does not scale with the symbol.

Browsers render CSS filters on SVG groups inconsistently. This is a browser limitation, not specific to Bliss SVG Builder:

- **Firefox** renders them faithfully.
- **Chromium and Edge** drop offsets and blur radii below about 1 grid unit, so keep filter lengths at 1 grid unit or more (go a little above 1 for effects that must stay visible in these engines).
- **Safari (WebKit)** does not apply a CSS `filter` to an SVG group at all, at any size.

Because of that, a CSS `filter` set this way is not dependable in every browser today. For an effect that must look identical everywhere, prefer the pass-through properties that render consistently: `stroke-width`, `stroke-dasharray`, `transform`, `fill`, `opacity`, and `mix-blend-mode`.

Reliable cross-browser filters are planned through a native SVG `<filter>`; follow [#34](https://github.com/hlridge/bliss-svg-builder/issues/34) for progress.

## ID Attribute

You can assign an `id` to the root `<svg>` via pass-through:

```
[id=my-bliss-symbol]||B313
```

This is useful when you need to reference the SVG from external CSS or JavaScript. To put an id on one layer instead, use its prefix: `[content--id=ink]||`.

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

The root `<svg>` carries the document's own attributes: the size and `viewBox`, a `data-generator` attribute naming the library version, the default painting values, and anything you set globally. Each layer below it carries its own `<layer>--` attributes; word-, character-, and part-level attributes go on nested `<g>` elements inside the content group.

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="..."
     class="bliss-root" fill="none" stroke="#000000" stroke-width="0.5" ...>
  <rect class="bliss-background" .../>
  <g class="bliss-grid" ...>...</g>
  <g class="bliss-content">
    <!-- character paths -->
  </g>
</svg>
```

Because the painting defaults sit on the root, an attribute you set globally sits beside them and replaces the one it names, rather than being overruled by markup further down.

### Class names

Each layer carries a class you can select on: `bliss-root`, `bliss-background` (or `bliss-background--top`, `--mid` and `--bottom` when you set the zones separately), `bliss-grid` and `bliss-content`. These names are stable, so it is safe to write CSS and query selectors against them.

A `class` you set is added to the layer's own name rather than replacing it, so `[class=mine]||` produces `class="bliss-root mine"` and your stylesheet and ours can coexist.

### Attributes the library keeps

Two names on the root belong to the library and are reported rather than applied if you set them: `xmlns`, which has one legal value and produces a file no browser can read if it is changed, and `data-generator`, which records what produced the file. Everything else about the root is yours, including `width`, `height` and `viewBox`, which replace the computed values when you write them. If you write a `viewBox` while also setting `margin`, `crop`, `min-width` or `center`, those options no longer shape it and you are told so.

## Common Pass-Through Attributes

| Attribute | Example Value | Effect |
|-----------|---------------|--------|
| `opacity` | `0.5` | Transparency |
| `stroke-dasharray` | `2,1` | Dashed lines |
| `fill` | `#eee` | Fill color |
| `transform` | `rotate(15)` | SVG transform |
| `class` | `my-class` | CSS class, added to the layer's own name |
| `id` | `my-symbol` | Element ID |
| `style` | `filter:blur(1px)` | Inline CSS (lengths mean different things on the root and inside the picture, and Safari does not apply a `filter` to a group at all, see [Style Attribute](#style-attribute)) |
| `preserveAspectRatio` | `xMidYMid` | How the picture fits its box (global only, since it belongs to the root) |
