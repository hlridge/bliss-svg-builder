# Sizing

Control the dimensions and fitting of your Bliss SVG output.

## Standard Dimensions

Bliss characters use a standard 20-unit grid height. This ensures consistent sizing across all characters:

<Demo code="[grid=1]||B313" title="Standard 20-unit height" />

<Demo code="[grid=1]||B1103" title="Same height, different character" />

Most glyph content appears within y=8 to y=16 (the main content area), with space above for indicators.

## Crop Modes

The `crop` option controls how the SVG canvas is sized. Beyond numeric values and per-side cropping (see [Margins & Cropping](/handbook/spacing-layout/margins-cropping)), it accepts several named modes:

### `crop=auto`

Crops all sides to the actual content pixel bounds, the tightest possible fit:

<Demo code="B313" title="Standard" />

<Demo code="[crop=auto]||B313" title="crop=auto (tight to content)" />

You can also auto-crop individual sides with `crop-top=auto`, `crop-bottom=auto`, etc. See [Margins & Cropping](/handbook/spacing-layout/margins-cropping) for details.

### `crop=auto-vertical`

Fits the SVG height to the actual content without affecting horizontal layout. This removes the fixed 20-unit height and is intended for building shapes on a freeform canvas:

<Demo code="[grid=1]||H:0,8" title="Standard: full 20-unit height" />

<Demo code="[grid=1;crop=auto-vertical]||H:0,8" title="crop=auto-vertical: fits to content height" />

**Use `crop=auto-vertical`** when:
- Building custom shapes from primitives
- Creating icons or decorative elements
- Content doesn't need to align with standard Bliss text

**Don't use it** when:
- Working with B-codes (they have proper dimensions)
- Characters need to align in sentences

<Demo code="[crop=auto-vertical]||C8:0,8;DOT:4,12" title="Custom shape with auto-vertical" />

### `crop=compact`

Removes 4 units of unused vertical space, making characters appear larger in fixed-size containers. Ideal for communication boards and AAC applications:

<Demo code="B313" title="Standard (20 units)" />

<Demo code="[crop=compact]||B313" title="Compact (16 units)" />

Compact mode is smart about where it crops. Characters never use both the top 4 and bottom 4 grid units simultaneously, so there are always 4 units to reclaim. The library crops as much as possible from the top (where indicator space is typically empty) and the remainder from the bottom:

<Demo code="[crop=compact]||B431" title="Compact heart" />

<Demo code="[crop=compact]||B431;B81" title="Compact with indicator (still fits)" />

This makes Bliss symbols noticeably larger at any given display size without clipping any content.

## Minimum Width

Set a minimum width for the composition with `min-width`:

<Demo code="B313" title="Natural width" />

<Demo code="[min-width=16]||B313" title="min-width=16" />

<Demo code="[min-width=24]||B313" title="min-width=24" />

This is useful when you need consistent widths across different characters:

<Demo code="[min-width=12]||B313" title="Wide character, min-width=12" />

<Demo code="[min-width=12]||B4" title="Narrow character, same min-width" />

| Option | Default | Range |
|--------|---------|-------|
| `min-width` | none | Any positive number |

## Centering

By default, content is left-aligned within its width. Enable centering with `center=1`:

<Demo code="[min-width=20]||B313" title="Left-aligned (default)" />

<Demo code="[min-width=20;center=1]||B313" title="Centered (center=1)" />

Centering is most visible when using `min-width` or with asymmetric indicators:

<Demo code="B431;B81" title="With indicator: centered" />

<Demo code="[center=0]||B431;B81" title="With indicator: left-aligned" />

| Option | Default | Values |
|--------|---------|--------|
| `center` | `0` | `0` or `1` |

## Combined Examples

### Consistent Icon Sizing

For icon-like usage with consistent dimensions:

<Demo code="[crop=auto-vertical;min-width=12]||H:0,8" title="Heart icon" />

<Demo code="[crop=auto-vertical;min-width=12]||C8:0,8" title="Circle icon" />

### Compact Board Cells

For AAC communication boards:

<Demo code="[crop=compact;background=#f0f0f0]||B313" title="Compact with background" />

<Demo code="[crop=compact;background=#f0f0f0]||B431;B81" title="Compact with indicator" />

### Tight Cropping for Inline Use

<Demo code="[crop=auto;background=#f0f0f0]||B313" title="Tight for inline embedding" />

## Options Reference

| Option | Default | Values | Description |
|--------|---------|--------|-------------|
| `crop` | `0` | Number, `auto`, `auto-vertical`, `compact` | Cropping mode |
| `min-width` | none | Number | Minimum composition width |
| `center` | `0` | `0`, `1` | Center content within width |
