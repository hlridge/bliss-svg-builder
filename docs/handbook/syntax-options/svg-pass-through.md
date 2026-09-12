# SVG Pass-Through Attributes

Any option that Bliss SVG Builder doesn't recognize as a built-in option is passed through directly as an SVG attribute. This page documents how the mechanism works and what it enables.

## How It Works

The builder maintains a set of known option keys (`color`, `stroke-width`, `margin`, `grid`, etc.). When you set an option that isn't in this set, it passes through to the SVG output as an attribute.

Where a pass-through attribute lands depends on the level you set it at. A **global** option goes on the root `<svg>` element, so it covers the whole picture: the artwork, and the paper and grid if you have switched them on. Anything inside that sets its own value for that attribute keeps it, which is what the prefixed spellings further down are for. A **word**, **character**, or **part** option goes on a `<g>` that wraps just that word, character, or part.

**A name the library or a standard owns works in either casing and comes back in its owner's spelling. A name nobody owns comes back exactly as you wrote it.** So `preserveAspectRatio` comes out as `preserveAspectRatio` whether you write it that way, as `preserve-aspect-ratio`, or all in lower case, while a `data-` attribute of your own is emitted letter for letter as you typed it.

```
[opacity=0.5]||B313
```

<Demo code="[opacity=0.5]||B313" title="opacity fades the whole picture" />

```
[stroke-dasharray=2,1]||B313
```

<Demo code="[stroke-dasharray=2,1]||B313" title="stroke-dasharray passes through" />

### Which name is emitted

Casing and hyphenation carry no meaning inside a name that already has an owner, so there is nothing worth preserving there, and every reason to hand back the one spelling that works:

| What you write | Who owns the name | What comes back |
|---|---|---|
| `stroke-width` or `strokeWidth`, `margin-top` or `marginTop` | the library, as a [named option](/reference/options-quick-reference) | the option itself, whichever way you spelled it. `toString()` writes it back as `[stroke-width=…]` and `toJSON()` as `strokeWidth` |
| `viewBox`, `view-box` or `viewbox`; `strokeDasharray` or `stroke-dasharray`; `ariaLabel` or `aria-label` | SVG or ARIA | the standard's own spelling, in the markup and in both serializations: `viewBox`, `stroke-dasharray`, `aria-label` |
| `data-attr`, `dataAttr`, `myOwnAttr` | you | exactly what you typed, everywhere, never converted |
| `root--view-box`, `content--color` | nobody, because the prefix suspends all of the above | the name after the last `--`, meant literally, on the part you named: a raw `view-box`, a raw `color` |

The casing or hyphenation you choose is never reported. Nothing is lost by the choice either: the value applies exactly as you meant it, and your own `toString()` shows you which spelling it settled on. Some libraries do warn here, React among them when a DOM attribute looks misspelled, and this one deliberately does not. Write one name twice under two spellings and the last one you wrote is the one that applies, with the other reported as [`MULTIPLE_OPTION_SPELLINGS`](/reference/warning-codes#multiple-option-spellings).

The SVG names this covers are the ones SVG defines for the elements the library draws: `<svg>`, `<g>`, `<path>`, `<rect>`, `<text>`, `<a>`, `<title>`, `<desc>` and `<style>`. A name from elsewhere in SVG has nothing in the picture to sit on, so it counts as one of your own and is emitted as typed: `[gradientUnits=userSpaceOnUse]||` emits `gradientUnits`, and `[gradient-units=userSpaceOnUse]||` emits `gradient-units`.

## Targeting One Part of the Picture

A global option applies to everything. When you want just one part of the output, prefix the attribute with the name of the thing you mean, using a double dash.

**The rule is one sentence: every class the library writes is addressable, by that same name with the `bliss-` prefix removed.** The group with `class="bliss-grid"` is `grid--`, the sky line with `class="bliss-grid-line bliss-grid-line--sky"` is `grid-line--sky--`, and the root `<svg>`, which carries `class="bliss-root"`, is `root--`. The table below is the whole vocabulary, and the library derives it from the classes its own drawing writes rather than keeping it by hand, so it cannot drift from the markup, and a class added in a later release is targetable the moment it exists. A class of your own, added with the `class` option, is not a target: it names your rule, not one of ours.

| Target | Where it lands |
|--------|----------------|
| *(none)* | the root `<svg>`, so the whole picture |
| `root--` | the same root `<svg>`, named rather than assumed |
| `background--` | the group holding the background rectangles |
| `background-zone--` | every background rectangle |
| `background-zone--top--`, `--mid--`, `--bottom--` | one zone rectangle |
| `grid--` | the reference grid group |
| `grid-line--` | every grid line |
| `grid-line--minor--`, `--medium--`, `--major--` | one family of grid lines |
| `grid-line--sky--`, `--earth--` | the sky line, or the earth line |
| `content--` | the group holding the Bliss artwork |

```
[grid;grid-line--sky--stroke-dasharray=0.5]||B313
```

<Demo code="[grid;grid-line--sky--stroke-dasharray=0.5]||B313" title="Only the sky line is dashed" />

**The key splits at its LAST double dash**, which is what lets a target carry one of its own: in `grid-line--sky--stroke-dasharray` the target is `grid-line--sky` and the attribute is `stroke-dasharray`. The one thing that costs is an attribute name with a double dash inside it, so `content--data--foo` reads as a target called `content--data`, which nothing carries, and is reported instead of emitted.

The families overlap exactly as the classes do. The sky and earth lines carry `bliss-grid-line--major` as well as their own class, so `grid-line--major--` reaches all three of them, the same three that the `grid-major-color` option paints. Where two targets both reach one element, the more specific class wins, so writing `grid-line--stroke=red` and `grid-line--sky--stroke=blue` together turns every line red except the sky line, which is blue.

<Demo code="[grid;grid-line--stroke=red;grid-line--sky--stroke=blue]||B313" title="Every line red, the sky line blue" />

```
[grid;grid--opacity=0.3]||B313
```

<Demo code="[grid;grid--opacity=0.3]||B313" title="A faded grid behind full-strength artwork" />

Compare that with the unprefixed spelling, which fades the grid and the artwork together:

<Demo code="[grid;opacity=0.3]||B313" title="Everything faded" />

The prefixed form is a raw channel: the attribute name is emitted exactly as written, and it goes where you sent it, with no interpretation. That is what makes `content--color` reach the real `color` attribute, where the plain `color` option is a friendlier name for `stroke`. It is also why the two spellings of `vector-effect` do different things: written plain, the library knows it only works on the shapes themselves and moves it down onto the character paths, while `root--vector-effect` writes it on the root `<svg>`, where it has no effect, because naming a target asks for a place and not for a result.

Being raw, it is the one channel where [the naming rule](#which-name-is-emitted) does not run, so it is also how you ask for a spelling that rule would otherwise settle for you. `[root--view-box=0 0 5 5]||` puts a literal `view-box` on the root, beside the real `viewBox` the library computed, and the two sit there as the different attributes they are.

A target prefix only means something at global scope, since these parts belong to the document as a whole. Written on a word, character or part it is dropped: reported when you wrote it in a bracket, and in silence when it arrived through object input or `setTransientOptions`. A prefix that matches no class the library writes, such as `foo--x`, is reported too, and nothing is emitted for it.

Those two facts have one consequence worth stating outright. A literal spelling can be asked for at global scope and nowhere else: on a word, character or part, a name SVG or ARIA owns arrives under its owner's spelling and there is no way to insist on another, because the only channel that would have carried one is refused there. Nothing you would want is lost, since the spelling you are denied is a misspelling no renderer acts on. The exception worth naming is SVG's own `color`, which is a real attribute rather than a misspelling and which the friendlier `color` option occupies at every scope. Set it through `style` instead, which passes through untouched: `[style=color:red]B313` puts `style="color:red"` on that character's group.

Raw means the library does not rename or reinterpret your attribute. It does not mean it will write a file that cannot be parsed, or markup that reads as a working link and is not one, so two names are refused behind a prefix, each reported:

- `xmlns`, on any target. A second namespace declaration moves that whole subtree out of SVG, and nothing renders it. This one is refused wherever you write it, on the root and at word, character and part scope as well. See [`RESERVED_ATTRIBUTE_NAME`](/reference/warning-codes#reserved-attribute-name).
- The link attributes (`href`, `target`, `rel`, `download`, `hreflang`, `type`, `referrerpolicy`), on any target. A link is an `<a>` element wrapping the content it links, and no target is one, so the attribute would sit where every engine ignores it. Written without a prefix they are not refused. They belong to the `<a>` wrapper described under [Links with href](#links-with-href): write an `href` and they travel onto it. Write one without an `href` and there is no wrapper to carry it, so it is dropped. See [`MISPLACED_LINK_ATTRIBUTE`](/reference/warning-codes#misplaced-link-attribute).

`data-generator` is not in that list: the library owns it on the root, where it stamps what produced the file, so `root--data-generator` is refused there like the bare spelling, but `[content--data-generator=mine]||` collides with nothing and is emitted like any other data attribute.

### When a value is written but cannot show

Two of the targets are containers. `background--` and `grid--` name groups, and a value written on a group can fail to show for either of two reasons: a paint name such as `stroke` is passed down to the shapes inside, which set their own and so beat it, and a geometry name such as `width` is inert on a group, which carries no geometry to begin with. Both end the same way, so both are reported the same way. The value is emitted where you asked for it, and you are told which target reaches the shapes:

```
[grid;grid--stroke=red]||B313   →  reports, and points at grid-line--stroke
```

The names this covers are the ones the group's own drawing writes on its children: `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin` and `d` for the grid, and `x`, `y`, `width`, `height`, `stroke` and `fill` for the background. Every other name lands on the group and behaves as SVG says it should, so `grid--opacity` fades the whole grid as a unit and `grid--shape-rendering` replaces the value the grid sets for itself (in Safari the lines keep their own, which an inline `@supports` rule gives them). A name outside the list that a group cannot use is inert without a word from us, `background--rx` among them, since a group has no corners to round: saying which of those are meaningful would mean publishing a judgement about every SVG attribute, and this list only claims to know the names the library writes itself. See [`MISPLACED_CONTAINER_ATTRIBUTE`](/reference/warning-codes#misplaced-container-attribute).

A third case says nothing at all, because there is nothing to say. A target whose element this picture does not contain is silent: `[grid-line--sky--stroke=red]||` with no `grid` emits nothing and reports nothing, and so does `background-zone--mid--fill` when no zones are set. Switch the grid or the zone on, and the same key works.

The other report is for two keys that set one attribute on one target. The key that names its target wins, because the other one has to be resolved to a target first, and the one that lost is named:

```
[grid;grid-color=red;grid-line--stroke=blue]||B313  →  blue lines; "grid-color" is named
[color=red;root--stroke=blue]||B313                 →  blue strokes; "color" is named
```

See [`MULTIPLE_ATTRIBUTE_VALUES`](/reference/warning-codes#multiple-attribute-values).

## Stroke Line Joins & Caps

Bliss SVG Builder sets `stroke-linejoin` and `stroke-linecap` to `round` by default. These produce the smooth, rounded line endings that are characteristic of Blissymbolics. They can be overridden via pass-through:

<Demo code="B313" title="Default: round joins and caps" />

<Demo code="[stroke-linejoin=miter;stroke-linecap=butt]||B313" title="Overridden: miter joins, butt caps" />

## Style Attribute

The `style` attribute passes through like any other, so you can apply inline CSS at whichever level you target (global, one part of the picture, word, character, or part):

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

This is useful when you need to reference the SVG from external CSS or JavaScript. To put an id on one part of the picture instead, name it: `[content--id=ink]||`.

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

The root `<svg>` carries the document's own attributes: the size and `viewBox`, a `data-generator` attribute naming the library version, the default painting values, and anything you set globally. Each part below it carries its own `<target>--` attributes; word-, character-, and part-level attributes go on nested `<g>` elements inside the content group.

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="..."
     class="bliss-root" fill="none" stroke="#000000" stroke-width="0.5" ...>
  <g class="bliss-background">
    <rect class="bliss-background-zone" .../>
  </g>
  <style>...</style>            <!-- only with a grid: keeps the lines crisp in Safari -->
  <g class="bliss-grid" ...>
    <path class="bliss-grid-line bliss-grid-line--minor" .../>
    <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" .../>
  </g>
  <g class="bliss-content">
    <!-- character paths -->
  </g>
</svg>
```

The background is a group in every case, holding one rectangle that covers the picture, or one rectangle for each zone you set, so `background--` means the same thing whichever you asked for.

Because the painting defaults sit on the root, an attribute you set globally sits beside them and replaces the one it names for everything that does not set its own. Most of the artwork sets none, so a global `stroke` reaches every character. Two things do set their own, and both are worth knowing. The grid lines and the background rectangles carry their own paint, which is what the targets above are for. And a dot carries its own `stroke-width`, because a dot's size is derived from that width rather than drawn with it, so the two spellings part company on dots: `[stroke-width=2]||` grows the dot along with everything else, while `[content--stroke-width=2]||` thickens the strokes and leaves the dot exactly where it was.

### Class names

These are all the classes the library writes:

- `bliss-root` on the `<svg>`
- `bliss-background` on the background group, `bliss-background-zone` on every rectangle inside it, and `bliss-background-zone--top`, `--mid`, `--bottom` on the rectangle for each zone you set
- `bliss-grid` on the grid group, `bliss-grid-line` on every line, and `bliss-grid-line--minor`, `--medium`, `--major` by family, with `--sky` and `--earth` on the two reference lines, which carry `--major` as well
- `bliss-content` on the group holding the artwork

Anything else the library draws, including the character paths and the `<g>` around a word, character or part, carries no class of ours. These names are stable from this release on, so it is safe to write CSS and query selectors against them, and each one doubles as a target: remove `bliss-` and put the attribute after a `--`.

A `class` you set is added to the element's own name rather than replacing it, so `[class=mine]||` produces `class="bliss-root mine"` and your stylesheet and ours can coexist.

A stylesheet written against an earlier release needs two changes, and neither announces itself. `.bliss-background--top`, `--mid` and `--bottom` were renamed to `.bliss-background-zone--top`, `--mid` and `--bottom`, so the old spellings now match nothing at all. And `.bliss-background` matches the group rather than the rectangle, where a `fill` does not reach a rectangle that sets its own, so select `.bliss-background-zone` for the paper.

### Attributes the library keeps

Two names on the root belong to the library and are reported rather than applied if you set them: `xmlns`, which has one legal value and produces a file no browser can read if it is changed, and `data-generator`, which records what produced the file. Everything else about the root is yours, including `width`, `height` and `viewBox`, which replace the computed values when you write them. If you write a `viewBox` while also setting `margin`, `crop`, `min-width` or `center`, those options no longer shape it and you are told so.

## Common Pass-Through Attributes

| Attribute | Example Value | Effect |
|-----------|---------------|--------|
| `opacity` | `0.5` | Transparency |
| `stroke-dasharray` | `2,1` | Dashed lines |
| `fill` | `#eee` | Fill color |
| `transform` | `rotate(15)` | SVG transform |
| `class` | `my-class` | CSS class, added to the element's own name |
| `id` | `my-symbol` | Element ID |
| `style` | `filter:blur(1px)` | Inline CSS (lengths mean different things on the root and inside the picture, and Safari does not apply a `filter` to a group at all, see [Style Attribute](#style-attribute)) |
| `preserveAspectRatio` | `xMidYMid` | How the picture fits its box (global only, since it belongs to the root) |
