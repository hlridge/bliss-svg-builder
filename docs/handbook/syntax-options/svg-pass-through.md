# SVG Pass-Through Attributes

Any option that Bliss SVG Builder doesn't recognize as a built-in option is passed through directly as an SVG attribute. This page documents how the mechanism works and what it enables.

## How It Works

The builder maintains a set of known option keys (`color`, `stroke-width`, `margin`, `grid`, etc.). When you set an option that isn't in this set, it passes through to the SVG output as an attribute.

Where a pass-through attribute lands depends on the level you set it at, and the rule is that an option applies to what it is written on. A **word**, **character**, or **part** option goes on a `<g>` that wraps just that word, character, or part. A **global** option applies to the whole symbol: it goes on the group that holds the artwork, beside the library's own painting defaults, so it never restyles the reference grid or the paper, which have options of their own.

Two kinds of global attribute go elsewhere. The ones that describe the image rather than style the drawing go on the root `<svg>`: `role`, `aria-*`, `id`, `class`, `data-*`, `lang`, `tabindex`, `preserveAspectRatio` and `overflow`, along with the root's own `viewBox`, `width` and `height`. And `href` makes the whole picture a link, as described under [Links with href](#links-with-href). To put any other attribute somewhere else, on the root or the grid for instance, name the place, as described under [Targeting One Part of the Picture](#targeting-one-part-of-the-picture).

**A name the library or a standard owns works in either casing and comes back in its owner's spelling. A name nobody owns comes back exactly as you wrote it.** So `preserveAspectRatio` comes out as `preserveAspectRatio` whether you write it that way, as `preserve-aspect-ratio`, or all in lower case, while a `data-` attribute of your own is emitted letter for letter as you typed it.

```
[opacity=0.5]||B313
```

<Demo code="[opacity=0.5]||B313" title="opacity fades the symbol" />

```
[stroke-dasharray=2,1]||B313
```

<Demo code="[stroke-dasharray=2,1]||B313" title="stroke-dasharray passes through" />

### Which name is emitted

Write one of these names either way and it is the same name, because casing and hyphenation are not what tells two of them apart. What comes back is its owner's spelling:

| What you write | Who owns the name | What comes back |
|---|---|---|
| `stroke-width` or `strokeWidth`, `margin-top` or `marginTop` | the library, as a [named option](/reference/options-quick-reference) | the option itself, whichever way you spelled it. `toString()` writes it back as `[stroke-width=…]` and `toJSON()` as `strokeWidth` |
| `viewBox`, `view-box` or `viewbox`; `strokeDasharray` or `stroke-dasharray`; `ariaLabel` or `aria-label` | SVG or ARIA | the standard's own spelling, in the markup and in both serializations: `viewBox`, `stroke-dasharray`, `aria-label` |
| `data-attr`, `dataAttr`, `myOwnAttr` | you | exactly what you typed, everywhere, never converted |
| `root--view-box`, `content--color` | nobody, because the prefix suspends all of the above | the name after the last `--`, meant literally, on the part you named: a raw `view-box`, a raw `color` |

The casing or hyphenation you choose is never reported. Nothing is lost by the choice either: the value applies exactly as you meant it, and your own `toString()` shows you which spelling it settled on. Some libraries do warn here, React among them when a DOM attribute looks misspelled, and this one deliberately does not. Write one name twice under two spellings and the last one you wrote is the one that applies, with the other reported as [`MULTIPLE_OPTION_SPELLINGS`](/reference/warning-codes#multiple-option-spellings).

The SVG names this covers are the ones SVG defines for the elements the library draws: `<svg>`, `<g>`, `<path>`, `<rect>`, `<text>`, `<a>`, `<title>`, `<desc>` and `<style>`, and the `<filter>` it draws a [CSS filter](#using-css-filter) with, along with the primitives inside it (`<feGaussianBlur>`, `<feColorMatrix>`, `<feComponentTransfer>`, `<feFuncR>`, `<feFuncG>`, `<feFuncB>`, `<feFuncA>`, and for a shadow `<feOffset>`, `<feFlood>`, `<feComposite>`, `<feMerge>` and `<feMergeNode>`). A name from elsewhere in SVG has nothing in the picture to sit on, so it counts as one of your own and is emitted as typed: `[gradientUnits=userSpaceOnUse]||` emits `gradientUnits`, and `[gradient-units=userSpaceOnUse]||` emits `gradient-units`.

## Targeting One Part of the Picture

A global option styles the whole symbol. When you want a different part of the output, prefix the attribute with the name of the thing you mean, using a double dash.

**The rule is one sentence: every class the library writes is addressable, by that same name with the `bliss-` prefix removed.** The group with `class="bliss-grid"` is `grid--`, the sky line with `class="bliss-grid-line bliss-grid-line--sky"` is `grid-line--sky--`, and the root `<svg>`, which carries `class="bliss-root"`, is `root--`. The table below is the whole vocabulary, and the library derives it from the classes its own drawing writes rather than keeping it by hand, so it cannot drift from the markup, and a class added in a later release is targetable the moment it exists. A class of your own, added with the `class` option, is not a target: it names your rule, not one of ours.

| Target | Where it lands |
|--------|----------------|
| *(none)* | the symbol, or the root `<svg>` for [the attributes that describe the image](#how-it-works) |
| `root--` | the root `<svg>`, for any attribute, so the whole image, paper and grid included |
| `background--` | the group holding the background rectangles |
| `background-zone--` | every background rectangle |
| `background-zone--top--`, `--mid--`, `--bottom--` | one zone rectangle |
| `grid--` | the reference grid group |
| `grid-line--` | every grid line |
| `grid-line--minor--`, `--medium--`, `--major--` | one family of grid lines |
| `grid-line--sky--`, `--earth--` | the sky line, or the earth line |
| `content--` | the group holding the Bliss artwork |
| `element-background--` | every [background of a word, character or part](/handbook/appearance/backgrounds-accessibility#backgrounds-on-words-characters-and-parts) |
| `element-background--box--`, `--ink--` | the boxes alone, or the halos alone |

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

Compare that with the unprefixed spelling, which fades the artwork and leaves the grid alone, and with `root--`, which fades the whole image, grid and all:

<Demo code="[grid;opacity=0.3]||B313" title="The artwork faded, the grid at full strength" />

<Demo code="[grid;root--opacity=0.3]||B313" title="Everything faded" />

Renderers do not all agree about effects written on the root itself: Safari ignores `root--transform`, for one, and a `root--style` filter is measured in pixels by some renderers and in grid units by others (see [Using CSS `filter`](#using-css-filter)).

The prefixed form is a raw channel: the attribute name is emitted exactly as written, and it goes where you sent it, with no interpretation. That is what makes `content--color` reach the real `color` attribute, where the plain `color` option is a friendlier name for `stroke`. It is also why the two spellings of `vector-effect` do different things: written plain, the library knows it only works on the shapes themselves and moves it down onto the character paths, while `root--vector-effect` writes it on the root `<svg>`, where it has no effect, because naming a target asks for a place and not for a result.

Being raw, it is the one channel where [the naming rule](#which-name-is-emitted) does not run, so it is also how you ask for a spelling that rule would otherwise settle for you. `[root--view-box=0 0 5 5]||` puts a literal `view-box` on the root, beside the real `viewBox` the library computed, and the two sit there as the different attributes they are.

A target prefix only means something at global scope, since these parts belong to the document as a whole. Written on a word, character or part it is dropped and reported, however it was written: in a bracket, in a composition object, or through a method such as `setOptions()`. The one exception is `element-background--`, because the backgrounds it reaches belong to words, characters and parts: written on one of those, it styles the backgrounds inside it (see [Classes and Keys](/handbook/appearance/backgrounds-accessibility#classes-and-keys)). A prefix that matches no class the library writes, such as `foo--x`, is reported too, and nothing is emitted for it.

Those two facts have one consequence worth stating outright. A literal spelling can be asked for at global scope and nowhere else: on the group around a word, character or part, a name SVG or ARIA owns arrives under its owner's spelling and there is no way to insist on another, because the only channel that would have carried one is refused there (an `element-background--` key reaches the element's backgrounds, never its group). Nothing you would want is lost, since the spelling you are denied is a misspelling no renderer acts on. The exception worth naming is SVG's own `color`, which is a real attribute rather than a misspelling and which the friendlier `color` option occupies at every scope. Set it through `style` instead, which passes through untouched: `[style=color:red]B313` puts `style="color:red"` on that character's group.

Raw means the library does not rename or reinterpret your attribute. It does not mean it will write a file that cannot be parsed, so `xmlns` is refused behind any prefix, and reported. A second namespace declaration moves that whole subtree out of SVG, and nothing renders it. This one is refused wherever you write it, on the root and at word, character and part scope as well. See [`RESERVED_ATTRIBUTE_NAME`](/reference/warning-codes#reserved-attribute-name).

`data-generator` is refused on the root alone: the library owns it there, where it stamps what produced the file, so `root--data-generator` is refused like the bare spelling, but `[content--data-generator=mine]||` collides with nothing and is emitted like any other data attribute.

The link attributes (`href`, `target`, `rel`, `download`, `hreflang`, `type`, `referrerpolicy`) are raw behind a prefix like any other name, so `[content--href=https://example.com]||` writes a plain `href` on the content group. That is not a link: a link is an `<a>` element around what it links, and no target is one. An `href` written without a prefix is what builds the link, as described under [Links with href](#links-with-href).

### When a value is written but cannot show

Three of the targets are containers. `background--` and `grid--` name groups, and a value written on a group can fail to show for either of two reasons: a paint name such as `stroke` is passed down to the shapes inside, which set their own and so beat it, and a geometry name such as `width` is inert on a group, which carries no geometry to begin with. `root--` is the third, for paint alone: the content group sets its own painting defaults, so a default written on the root instead never reaches the artwork. All of these end the same way, so they are reported the same way. The value is emitted where you asked for it, and you are told which target reaches what you meant:

```
[grid;grid--stroke=red]||B313        →  reports, and points at grid-line--stroke
[color=red;root--stroke=blue]||B313  →  red strokes; reports, and points at content--stroke
```

The names this covers are the ones each container's own drawing writes on what it holds: `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin` and `d` for the grid, `x`, `y`, `width`, `height`, `stroke` and `fill` for the background, and the five painting defaults (`fill`, `stroke`, `stroke-width`, `stroke-linecap` and `stroke-linejoin`) for the root. Every other name lands where you sent it and behaves as SVG says it should, so `grid--opacity` fades the whole grid as a unit and `grid--shape-rendering` replaces the value the grid sets for itself (in Safari the lines keep their own, which an inline `@supports` rule gives them). A name outside the list that a group cannot use is inert without a word from us, `background--rx` among them, since a group has no corners to round: saying which of those are meaningful would mean publishing a judgement about every SVG attribute, and this list only claims to know the names the library writes itself. See [`MISPLACED_CONTAINER_ATTRIBUTE`](/reference/warning-codes#misplaced-container-attribute).

Another case says nothing at all, because there is nothing to say. A target whose element this picture does not contain is silent: `[grid-line--sky--stroke=red]||` with no `grid` emits nothing and reports nothing, and so does `background-zone--mid--fill` when no zones are set. Switch the grid or the zone on, and the same key works.

The other report is for two keys that set one attribute on one target. The key that names its target wins, because the other one has to be resolved to a target first, and the one that lost is named:

```
[grid;grid-color=red;grid-line--stroke=blue]||B313  →  blue lines; "grid-color" is named
[color=red;content--stroke=blue]||B313              →  blue strokes; "color" is named
```

See [`MULTIPLE_ATTRIBUTE_VALUES`](/reference/warning-codes#multiple-attribute-values).

## Stroke Line Joins & Caps

Bliss SVG Builder sets `stroke-linejoin` and `stroke-linecap` to `round` by default. These produce the smooth, rounded line endings that are characteristic of Blissymbolics. They can be overridden via pass-through:

<Demo code="B313" title="Default: round joins and caps" />

<Demo code="[stroke-linejoin=miter;stroke-linecap=butt]||B313" title="Overridden: miter joins, butt caps" />

## Style Attribute

The `style` attribute passes through like any other, so you can apply inline CSS at whichever level you target (global, one part of the picture, word, character, or part):

```
[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313
```

<Demo code="[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313" title="CSS filter via style pass-through" />

### Using CSS `filter`

A filter can be written as an option of its own (`[filter=blur(1px)]`) or inside a `style` (`[style=filter:blur(1px)]`). Where you write it decides how it is drawn and what its lengths mean, and the difference is large enough to surprise you.

**Inside the picture** (a plain global `filter` or `style`, one on a word, character or part, or one behind any [target](#targeting-one-part-of-the-picture) but `root--`, such as `grid--filter`) the library draws the filter as a native SVG `<filter>`, so it looks the same in Firefox, Chrome, Edge and Safari, and in resvg and librsvg, which turn an SVG into a PNG. It behaves as part of the artwork: the effect stays locked to the symbol and scales with it.

- **Filter lengths are in grid units, not screen pixels.** Inside the SVG a CSS length is read in the symbol's own coordinate system, the same units as the strokes, so `drop-shadow(2px 2px 2px ...)` really means `drop-shadow(2 2 2 ...)` in grid units. At this scale that is a lot: a stroke is only 0.5 units wide, and most symbols span just 4 to 8 units (some as little as 2), so a 2-unit offset and blur is several times the line width and about the size of a small symbol, nothing like the 2 pixels the `px` suffix suggests. Grid units are also what let the shadow scale with the symbol rather than stay a fixed screen size, so its size in pixels depends on how large the SVG is displayed. Think in grid units, where even `1px` (one grid unit) is already a prominent shadow.
- **Multiple `drop-shadow()`s chain,** exactly as they do in any CSS filter list: each one is applied to the result of the previous.
- **A tight viewBox clips an outward shadow.** Add margin to give it room.

What is drawn this way is a value made of CSS's ten filter functions (`blur`, `brightness`, `contrast`, `drop-shadow`, `grayscale`, `hue-rotate`, `invert`, `opacity`, `saturate` and `sepia`), one or several in a row, with any length in `px` or another absolute unit such as `mm` or `pt`. Any other value is written exactly as you gave it. A `url()` that points at a filter of your own needs nothing more, but a value the library does not translate, such as `blur(1em)` or one using `var()` or `calc()`, stays CSS, which browsers draw unevenly inside an SVG: Safari ignores it on a group, and Chrome and Edge drop a shadow offset under one grid unit.

`toString()` and `toJSON()` give the filter back as you wrote it, since the `<filter>` exists only in the drawn SVG. There it sits next to what it applies to, which points at it through the attribute you used: `filter="url(#…)"` or `style="filter:url(#…)"`. Its id is made from the whole picture, so different pictures on one page do not share one. Two identical pictures do share them, and if the first is hidden with `display: none`, Chrome and Edge drop the second one's filtered element, and Firefox its effect. Give each picture its own `id` (`[id=first]||…`) and their filters' ids differ too.

**On the whole image** (`root--filter` or `root--style`) the filter is not translated: it goes on the root `<svg>` as you wrote it, and your page treats it like the CSS on any other element. In a browser the lengths are ordinary CSS pixels there, so `2px` really is 2 pixels, the effect covers the paper and grid as well as the artwork, and it is not clipped by the viewBox. It does not scale with the symbol. A PNG converter has no page to measure pixels on, so it reads these lengths its own way: resvg takes them in grid units, as it does inside the picture. For an effect that must look the same in an exported image, write it inside the picture, where a plain global `filter` already covers the whole symbol.

## ID Attribute

You can assign an `id` to the root `<svg>` via pass-through:

```
[id=my-bliss-symbol]||B313
```

This is useful when you need to reference the SVG from external CSS or JavaScript. To put an id on one part of the picture instead, name it: `[content--id=ink]||`.

## Links with href

An `href` makes what it is written on a clickable link, by wrapping it in an SVG `<a>` element. On a word, character, or part it links just that element:

```
B313/[href=https://blissary.com]B291
```

<Demo code="B313/[href=https://blissary.com]B291" title="Second character is a clickable link" />

Written globally, it makes the whole picture one link, clickable anywhere inside it, the margins, paper and grid included:

```
[href=https://blissary.com]||B313
```

<Demo code="[href=https://blissary.com]||B313" title="The whole picture is a link" />

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

Every other attribute goes where it would go without the link, so you can combine links with visual styling. On a character, the styling sits on a `<g>` inside its `<a>`:

```
[href=https://example.com;color=blue]B313
```

<Demo code="[href=https://example.com;color=blue]B313" title="Linked and colored" />

### Automatic Behaviors

- **Pointer cursor**: Links automatically get `cursor: pointer`.
- **Hit area**: every link holds a transparent rectangle, so it is clickable across a whole area rather than only on its strokes, in every browser. A global link's covers the picture. A character's covers its full 20-unit height and its width, plus 1 grid unit on every side, so the outer half of each stroke is inside it; an indicator never widens it, and where a neighbouring character that is linked too is closer than 2 units, the two meet halfway. A word's spans its characters, and a part's covers its own ink plus half a unit. A `transform` on a linked element turns its area with it.
- **Overlapping links**: the innermost one wins, so a linked part takes the clicks on its own area inside a linked character, a character does the same inside a linked word, and any of them inside a global link.

### Linking by the Lines

`link-area=ink` makes a link answer on its lines and 0.4 of a unit around them, instead of its whole area:

```
[link-area=ink;href=https://blissary.com]B313
```

It is inherited, so `[link-area=ink]||` applies it to every link on a word, character or part, while a global link stays clickable across the whole picture. `link-padding` sets how far either kind of area reaches, with the same defaults as [`background-padding`](/handbook/appearance/backgrounds-accessibility#how-far-a-background-reaches), and two linked neighbours that would overlap meet between them the same way.

## Safety

Pass-through attributes are sanitized:

- **String values** are HTML-escaped to prevent injection
- **Event handlers** (`onclick`, `onload`, etc.) are blocked entirely
- **Links** are built only to relative addresses (`page.html`, `/about`, `#top`) and to `http:`, `https:`, `mailto:` and `tel:` addresses; an `href` with any other scheme, such as `javascript:`, `data:` or `vbscript:`, builds no link

## SVG Structure

The root `<svg>` carries the document's own attributes: the size and `viewBox`, a `data-generator` attribute naming the library version, its `bliss-root` class, and the global attributes that describe the image. The content group carries the default painting values and every other attribute you set globally. Each part of the picture carries its own `<target>--` attributes; word-, character-, and part-level attributes go on nested `<g>` elements inside the content group.

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="..."
     class="bliss-root">
  <g class="bliss-background">
    <rect class="bliss-background-zone" .../>
  </g>
  <style>...</style>            <!-- only with a grid: keeps the lines crisp in Safari -->
  <g class="bliss-grid" ...>
    <path class="bliss-grid-line bliss-grid-line--minor" .../>
    <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" .../>
  </g>
  <g class="bliss-content" fill="none" stroke="#000000" stroke-width="0.5" ...>
    <rect class="bliss-element-background bliss-element-background--box" .../>  <!-- only with a background on a word, character or part -->
    <!-- character paths -->
  </g>
</svg>
```

With a global `href`, the content group sits inside an `<a>` element, after a transparent rectangle that covers the picture (see [Links with href](#links-with-href)).

The backgrounds of words, characters and parts sit inside the content group, before any line, so a global effect such as `opacity` or `transform` reaches them as part of the artwork.

The background is a group in every case, holding one rectangle that covers the picture, or one rectangle for each zone you set, so `background--` means the same thing whichever you asked for.

Because the painting defaults sit on the content group, a styling attribute you set globally sits beside them and replaces the one it names for everything in the artwork that does not set its own. Most of the artwork sets none, so a global `stroke` reaches every character. The grid and the paper sit outside that group, so global styling never reaches them, which is what their own options and the targets above are for. One more thing is worth knowing: a dot is sized from the `stroke-width` option, so the two spellings part company on dots. `[stroke-width=2]||` grows each dot to suit the heavier line, while `[content--stroke-width=2]||` leaves each dot the size it was, so next to the heavier lines it comes out smaller.

### Class names

These are all the classes the library writes:

- `bliss-root` on the `<svg>`
- `bliss-background` on the background group, `bliss-background-zone` on every rectangle inside it, and `bliss-background-zone--top`, `--mid`, `--bottom` on the rectangle for each zone you set
- `bliss-grid` on the grid group, `bliss-grid-line` on every line, and `bliss-grid-line--minor`, `--medium`, `--major` by family, with `--sky` and `--earth` on the two reference lines, which carry `--major` as well
- `bliss-content` on the group holding the artwork
- `bliss-element-background` on every background of a word, character or part, with `bliss-element-background--box` on a box and `bliss-element-background--ink` on a halo

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
| `style` | `filter:blur(1px)` | Inline CSS (a `filter` inside the picture is drawn as a native SVG filter, and its lengths mean something else on the root, see [Using CSS `filter`](#using-css-filter)) |
| `preserveAspectRatio` | `xMidYMid` | How the picture fits its box (global only, since it belongs to the root) |
