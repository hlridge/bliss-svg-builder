# Backgrounds & Accessibility

## Background Color

Add a background with the `background` option. In the global bracket it colors the whole picture:

<Demo code="[background=#f5f5f5]||B313" title="Light gray background" />

Written on a word, a character or a part, it paints behind that element alone, as described under [Backgrounds on Words, Characters and Parts](#backgrounds-on-words-characters-and-parts).

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

The background rects sit in a group, and each one carries a class you can select on:

| Class | Applies to |
|-------|-----------|
| `bliss-background` | The group holding the rects |
| `bliss-background-zone` | Every background rect, whether there is one or three |
| `bliss-background-zone--top` | Top zone rect |
| `bliss-background-zone--mid` | Mid zone rect |
| `bliss-background-zone--bottom` | Bottom zone rect |

The group is there in both cases. `background` alone puts one `<rect class="bliss-background-zone">` in it, covering the whole picture. The zone options put in one rect for each zone that ends up with a color, so two zone options give two rects, and a `background` written beside them colors the zones you left out and brings the count to three.

Each of these names is also a target for [pass-through attributes](/handbook/syntax-options/svg-pass-through#targeting-one-part-of-the-picture): drop the `bliss-` prefix and put the attribute after a `--`, so in `[background-top=red;background-mid=green;background-bottom=blue;background-zone--top--rx=3]||` it is the top zone alone whose corners are rounded.

A stylesheet written against an earlier release needs two changes here, and neither announces itself:

- `.bliss-background--top`, `--mid` and `--bottom` are now `.bliss-background-zone--top`, `--mid` and `--bottom`. The old spellings match nothing at all.
- `.bliss-background` now matches the group rather than a rect. A `fill` written on the group does not reach a rect that sets its own, so `.bliss-background { fill: pink }` stops painting; use `.bliss-background-zone` instead.

### Bulk Default with Zone Overrides

The `background` option acts as a default for all three zones when any zone option is also present. Specific zone options override the bulk default:

<Demo code="[background=#f5f5f5;background-mid=#e8f5e9]||B313" title="Gray default, green mid override" />

When `background` is used alone (without any zone options), it produces a single rect covering the whole picture rather than three.

## Backgrounds on Words, Characters and Parts

On a word, a character or a part, `background` paints behind that element alone, so one picture can give each word a color of its own, as when words are color-coded by part of speech:

<Demo code="[background=#fde68a]|B313/B291//[background=#bfdbfe]|B431" title="A background for each word" />

```
[background=yellow]|B313/B291    →  paints behind the word
[background=yellow]B313          →  behind the character
B313;[background=yellow]>B81     →  behind the part
```

A character's background covers the full height of the writing area, however far its lines reach, and the width of its lines, plus one grid unit on every side, so the outer half of each line is inside it. Indicators never widen it. Next to a character that is painted too and closer than two units, the two meet halfway; next to one that is not, it keeps its full unit, even where that reaches under the neighbour's lines. A word's background is one area across its characters, and a part's covers its own lines plus half a unit.

<Demo code="[background=#fde68a]B313/AK:1/[background=#bfdbfe]B291" title="Two painted characters meet halfway" />

These backgrounds are drawn beneath all the lines, over the grid and the picture's own background, so a translucent color lets the grid show through:

<Demo code="[grid]||[background=rgba(250,204,21,0.4)]|B313/B291//B431" title="A translucent word background over the grid" />

The zone options (`background-top` and the other two) belong to the picture and stay in the global bracket.

### Painting Around the Lines

`background-area=ink` paints a halo around the lines instead of a box: the lines are drawn again in the background color, 0.4 of a unit wider on each side. An enclosure gets a ring rather than a filled square, and a character's halo includes its indicators:

<Demo code="[background-area=ink;background=#fde68a]B313;B81/[background-area=ink;background=#bfdbfe]B291" title="Halos around the lines" />

Like `color`, it is inherited, so `[background-area=ink]||` gives every background in the picture a halo. The picture's own background still covers the whole picture. The default is `box`.

### How Far a Background Reaches

`background-padding` sets how far a background reaches past what it surrounds, in grid units, in place of the default: 1 around a word's or a character's box, 0.5 around a part's, and 0.4 around each line of a halo. It is inherited too, and the picture's own background ignores it.

<Demo code="[background-padding=0.4;background=#fde68a]|B313/B291//B431" title="A word background reaching 0.4 units" />

0 is allowed: a halo then hides under its lines, and a box stops at the top and bottom of the writing area and at the centres of the outermost lines. Two painted neighbours that would overlap meet between them: halfway when both reach that far, otherwise where the shorter one ends. A negative padding is refused with [`OUT_OF_RANGE_OPTION_VALUE`](/reference/warning-codes#out-of-range-option-value).

### Effects Reach the Background

An element's effects reach its background as well as its lines: `transform` (with `transform-origin` and `transform-box`), `opacity`, `filter`, `clip-path`, `mask`, `display` and `visibility`, written as options or in `style`. So `[transform=rotate(45);background=yellow]B313` turns the box with the character, and a halo follows each line it surrounds, even where one character inside a painted word is turned on its own (a word's box stays where the layout puts it). The element's colors, its `class` and its `id` stay with its lines.

<Demo code="[margin=1.5]||[background-area=ink;background=#fde68a]|B313/[transform=rotate(15 14 12)]B291" title="A word's halo turning with one of its characters" />

The background is a layer of its own beneath all the lines, so three of these effects come out a little differently than they would on one drawing:

- `opacity` fades the background and the lines as two layers, so the color shows through the faded lines instead of hiding under them.
- A `clip-path`, or a `transform-origin` with `transform-box=fill-box`, is measured on the background's own box, which is larger than the lines': `[clip-path=inset(0 0 50% 0);background=yellow]B313` cuts the box at its middle, y 10, and the lines at theirs, y 12.
- A `filter` runs on the background and on the lines separately, so a drop shadow falls from the lines onto their own background.

Only those names reach a background, spelled as above. CSS's separate `rotate`, `scale` and `translate` properties and the `mask-` longhands, written in a `style`, move or mask the lines alone.

### Classes and Keys

Each of these backgrounds carries the class `bliss-element-background`, along with `bliss-element-background--box` on a box (a `<rect>`) or `bliss-element-background--ink` on a halo (a group of lines). A stylesheet can select them, and so can a [target key](/handbook/syntax-options/svg-pass-through#targeting-one-part-of-the-picture): `[element-background--rx=1]||` rounds the corners of every box.

Unlike the picture's other targets, an `element-background--` key also works on a word, a character or a part, where it styles every background inside that element, its own included. For each attribute the nearest key wins, and it replaces a farther key's value whole, `class` and `style` included:

```
[element-background--class=noun]|[background=yellow]B313/[element-background--class=verb;background=green]B291
```

That gives the first box the class `noun` and the second `verb`, ready for a stylesheet of your own.

A translucent halo is painted twice where its own lines overlap, as where a dot touches a line, so it comes out darker there. To lay the color once, make it solid and fade the layer instead: `[element-background--opacity=0.4]||` with `background=red`, rather than `background=rgba(255,0,0,0.4)`.

## Accessible Labels

Add accessible metadata with `svg-title` and `svg-desc`. These create `<title>` and `<desc>` elements inside the SVG that screen readers use to announce the symbol:

```js
const builder = new BlissSVGBuilder(
  '[svg-title=Feeling;svg-desc=Heart symbol representing emotion]||B313'
);
```

```html
<svg xmlns="..." data-generator="bliss-svg-builder/..." width="..." height="..." viewBox="..."
     class="bliss-root">
  <title>Feeling</title>
  <desc>Heart symbol representing emotion</desc>
  <g class="bliss-content" fill="none" stroke="#000000" ...>
    <!-- paths -->
  </g>
</svg>
```

For inline SVGs, you can also add `aria-label` directly on the surrounding HTML element as an alternative. Setting it as a global option works too: it goes on the `<svg>` itself, so the picture is announced as one labelled image:

```js
const builder = new BlissSVGBuilder('[role=img;aria-label=Feeling]||B313');
```

The same pair works from JavaScript, where `ariaLabel` is the spelling that reads naturally and reaches `aria-label` just the same:

```js
const builder = new BlissSVGBuilder('B313', { role: 'img', ariaLabel: 'Feeling' });
```

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
