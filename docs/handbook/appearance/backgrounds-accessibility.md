# Backgrounds & Accessibility

## Background Color

Add a background with the `background` option:

<Demo code="[background=#f5f5f5]||B313" title="Light gray background" />

## Zone Backgrounds

Color the three vertical zones of the Bliss coordinate system independently with `background-top`, `background-mid`, and `background-bottom`. This is especially useful in educational materials to help learners see where symbols sit and why position matters:

<Demo code="[background-top=#fce4ec;background-mid=#e8f5e9;background-bottom=#e3f2fd;grid;grid-color=rgba(0,0,0,0.08);grid-major-color=rgba(0,0,0,0.22);grid-earth-color=rgba(0,0,0,0.22);grid-sky-color=rgba(0,0,0,0.44);]||B313" title="Three zones colored with grid overlay" />

Each zone maps to a region in the 20-unit Bliss coordinate space:

| Option | Zone | Y range |
|--------|------|---------|
| `background-top` | Top zone area | above y=8 |
| `background-mid` | Mid zone area | y=8 to y=16 |
| `background-bottom` | Bottom zone area | below y=16 |

### CSS Classes

Each background rect gets a CSS class matching its option name:

| Class | Applies to |
|-------|-----------|
| `bliss-background` | Full background rect (or zone wrapper `<g>`) |
| `bliss-background--top` | Top zone rect |
| `bliss-background--mid` | Mid zone rect |
| `bliss-background--bottom` | Bottom zone rect |

When `background` is used alone, it produces a single `<rect class="bliss-background">`. When zone options are present, the zone rects are wrapped in `<g class="bliss-background">`.

### Bulk Default with Zone Overrides

The `background` option acts as a default for all three zones when any zone option is also present. Specific zone options override the bulk default:

<Demo code="[background=#f5f5f5;background-mid=#e8f5e9]||B313" title="Gray default, green mid override" />

When `background` is used alone (without any zone options), it produces a single full background as before.

## Accessible Labels

Add accessible metadata with `svg-title` and `svg-desc`. These create `<title>` and `<desc>` elements inside the SVG that screen readers use to announce the symbol:

```js
const builder = new BlissSVGBuilder(
  '[svg-title=Feeling;svg-desc=Heart symbol representing emotion]||B313'
);
```

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="...">
  <title>Feeling</title>
  <desc>Heart symbol representing emotion</desc>
  <g class="bliss-content" fill="none" stroke="#000000" ...>
    <!-- paths -->
  </g>
</svg>
```

For inline SVGs, you can also add `aria-label` directly on the surrounding HTML element as an alternative.

## Fixed Height

Set an explicit pixel height with `svg-height`. The width is auto-calculated to maintain the aspect ratio.

```js
const builder = new BlissSVGBuilder('[svg-height=516]||B313');
// Produces an SVG with height="516" and width calculated proportionally
// The default height is 129 (6x the default viewBox height 21.5).
```

Since SVG is vector-based, symbols scale cleanly to any size. However, at specific pixel dimensions, sub-pixel rounding in the browser can cause visual artifacts like uneven or blurry strokes. This is inherent to how browsers render SVG, not specific to bliss-svg-builder.

## Options Reference

See [Options Quick Reference](/reference/options-quick-reference) for defaults and the complete option list.
