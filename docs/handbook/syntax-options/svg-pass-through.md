# SVG Pass-Through Attributes

Any option that Bliss SVG Builder doesn't recognize as a built-in option is passed through directly as an SVG attribute. This page documents how the mechanism works and what it enables.

## How It Works

The builder maintains a set of known option keys (`color`, `stroke-width`, `margin`, `grid`, etc.). When you set an option that isn't in this set, it passes through to the SVG output as-is.

At the **global level**, pass-through attributes are added to the `<g class="bliss-content">` wrapper. At the **element level**, they are added to a wrapping `<g>` element around that character.

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

The `style` attribute passes through like any other, allowing inline CSS on the SVG element:

```
[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313
```

<Demo code="[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313" title="CSS filter via style pass-through" />

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

The SVG root element is purely structural (`xmlns`, `width`, `height`, `viewBox`) and includes a `data-generator` attribute identifying the library version. All styling and pass-through attributes live on the `<g class="bliss-content">` wrapper inside it:

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
| `style` | `filter:blur(1px)` | Inline CSS |
