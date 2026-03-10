# Grid Customization

The default grid is designed to be subtle: light gray lines that reveal the coordinate system without competing with the symbols. Most of the time, the default works well. Customization is for when your specific context needs something different.

<Demo code="[grid=1]||B313" title="Default grid: subtle, readable" />

For a thorough introduction to the grid and its reference lines, see [Grid Basics](/handbook/appearance/grid-basics).

## Adapting the Grid

### On Colored Backgrounds

Colored backgrounds are common in Bliss, especially where backgrounds categorize Bliss words by part-of-speech through color coding. The default light gray grid can lose contrast or clash with these backgrounds. You can adapt the grid colors so the line hierarchy stays readable:

<Demo code="[grid=1;background=#cee9f6]||B513" title="Default grid on a blue background: lines fade into the color and looks a bit odd" />

<Demo code="[grid=1;background=#cee9f6;grid-color=#bed6e2;grid-major-color=#a1b6c0;grid-sky-color=#6b7980;grid-earth-color=#6b7980]||B513" title="Adapted: grid lines tuned to the background" />

Light backgrounds give a good contrast for symbols and grid. Here is one example, using values from the Blissary.com default color scheme. You can adjust them to suit your preferences. For example, print might require more saturated colors.

| Background | Hex | Sky / Earth | Major | Minor / Medium |
|---|---|---|---|---|
| White | `#ffffff` | `#858585` | `#c7c7c7` | `#ebebeb` |
| Yellow | `#f5eb82` | `#7f7a44` | `#bfb765` | `#e1d878` |
| Green | `#dcf0aa` | `#727d58` | `#acbb85` | `#cadd9c` |
| Red | `#fbcac4` | `#836966` | `#c49e99` | `#e7bab4` |
| Blue | `#cee9f6` | `#6b7980` | `#a1b6c0` | `#bed6e2` |
| Orange | `#ffdeaa` | `#857358` | `#c7ad85` | `#ebcc9c` |
| Gray | `#e2e2e2` | `#767676` | `#b0b0b0` | `#d0d0d0` |

Each background with adapted grid:

<Demo code="[grid=1;background=#ffffff;grid-color=#ebebeb;grid-major-color=#c7c7c7;grid-sky-color=#858585;grid-earth-color=#858585]||B313" title="White" />

<Demo code="[grid=1;background=#f5eb82;grid-color=#e1d878;grid-major-color=#bfb765;grid-sky-color=#7f7a44;grid-earth-color=#7f7a44]||B313" title="Yellow" />

<Demo code="[grid=1;background=#dcf0aa;grid-color=#cadd9c;grid-major-color=#acbb85;grid-sky-color=#727d58;grid-earth-color=#727d58]||B313" title="Green" />

<Demo code="[grid=1;background=#fbcac4;grid-color=#e7bab4;grid-major-color=#c49e99;grid-sky-color=#836966;grid-earth-color=#836966]||B313" title="Red / Pink" />

<Demo code="[grid=1;background=#cee9f6;grid-color=#bed6e2;grid-major-color=#a1b6c0;grid-sky-color=#6b7980;grid-earth-color=#6b7980]||B313" title="Blue" />

<Demo code="[grid=1;background=#ffdeaa;grid-color=#ebcc9c;grid-major-color=#c7ad85;grid-sky-color=#857358;grid-earth-color=#857358]||B313" title="Orange" />

<Demo code="[grid=1;background=#e2e2e2;grid-color=#d0d0d0;grid-major-color=#b0b0b0;grid-sky-color=#767676;grid-earth-color=#767676]||B313" title="Gray" />

### Dark Backgrounds

On dark backgrounds, the default grid becomes dominant. Use darker grid colors so the grid stays subordinate:

<Demo code="[grid=1;background=#111;color=#eee]||B313" title="Default grid on a dark background: grid dominates and looks odd" />

<Demo code="[grid=1;background=#111;color=#eee;grid-color=#888;grid-major-color=#aaa]||B313" title="Adjusted: grid visible but not dominant" />

### Highlighting the Skyline and Earthline

The skyline (y=8) and earthline (y=16) are the most important reference lines. They define where the base characters sit. You can use them in text as help lines, by applying them subtly:

<Demo code="[grid=1;grid-color=none;grid-sky-color=blue;grid-earth-color=blue]||B313" title="Skyline and earthline marked with suble lines" />

### Switch the Grid for Zone Colors

Another way to visualize the common base character area, is by using backround colors for zones to mark the skyline and earthline. The grid is divided in three background zones: above y=8, between y=8 and y=16 and below y=16:

<Demo code="[grid=1;grid-color=none;background-bottom=#ebebeb;background-top=#ebebeb]||B313;B81" title="Skyline and earthline marked with zoned background colors" />


### Use Zone Colors with <code>crop=compact</code>

The full vertical space for any characters is always 20 grid unit, but all vertical space is rarely used, leaving the Blissymbols tiny on the display in many AAC devices. With <code>crop=compact</code>, 20% of the grid is automatically cropped from the top, or bottom, if there is room to do so. Together with the grid, or marking skyline and earthline in one way or another, this can enlarge Bliss symbols a bit that would otherwise be quite tiny. With 4 units cropped, the symbol has room to grow.

<Demo code="[grid=1;grid-color=none;background-bottom=#ebebeb;background-top=#ebebeb]||B313" title="Normal, without cropping" />

<Demo code="[crop=compact;grid=1;grid-color=none;background-bottom=#ebebeb;background-top=#ebebeb]||B313" fullHeight title="Larger with 4 units automatically cropped from top, by default" />

<Demo code="[crop=compact;grid=1;grid-color=none;background-bottom=#ebebeb;background-top=#ebebeb]||B355;B86" fullHeight title="Larger with 4 units automatically cropped from bottom when there is no space to crop from top" />

<Demo code="[crop=compact;grid=1;grid-color=none;background-bottom=#ebebeb;background-top=#ebebeb]||B313;B81/B367/B355;B86" fullHeight title="If there is no room to crop anything, nothing will get cropped" />

## Option Hierarchy

Grid color and stroke-width options follow a hierarchy from general to specific. A bulk option sets the default; more specific options override it:

1. `grid-color` / `grid-stroke-width` set all lines
2. `grid-major-color`, `grid-medium-color`, `grid-minor-color` override by category
3. `grid-sky-color`, `grid-earth-color` override specific reference lines

```
[grid=1;grid-color=#cccccc;grid-major-color=#999999;grid-sky-color=#4488ff]||B313
```

This sets all lines to light gray, major lines to medium gray, and the skyline to blue:

<Demo code="[grid=1;grid-color=#cccccc;grid-major-color=#999999;grid-sky-color=#4488ff]||B313" title="Hierarchy: bulk, category, specific" />

The same pattern applies to stroke widths: `grid-stroke-width` sets the default, and `grid-major-stroke-width`, `grid-medium-stroke-width`, `grid-minor-stroke-width` override by category.

## CSS Class Names

When embedding SVGs inline in a web page, you can target grid elements with CSS. Grid lines use `bliss-` prefixed class names:

| Class | Applies to |
|-------|-----------|
| `bliss-grid-line` | All grid lines |
| `bliss-grid-line--minor` | Minor lines (every 1 unit) |
| `bliss-grid-line--medium` | Medium lines (every 2 units) |
| `bliss-grid-line--major` | Major lines (every 4 units) |
| `bliss-grid-line--sky` | Sky line (y=8) |
| `bliss-grid-line--earth` | Earth line (y=16) |

The entire grid is wrapped in `<g class="bliss-grid">`.

## Options Reference

See [Options Quick Reference](/reference/options-quick-reference) for the complete list of grid color and stroke-width options with defaults and value ranges.
