# Grid Basics

The grid system in Bliss SVG Builder provides a visual reference and coordinate system for positioning elements. Turning it on helps you see how shapes align, where they sit relative to reference lines and each other, and gives you a shared vocabulary for discussing positions and sizes.

## What is the Grid?

The grid is a visual overlay showing the coordinate system. Enable it to see exactly where elements are positioned:

<Demo code="[grid=1]||B313" title="Character with grid visible" />

The grid shows:
- **Minor grid lines**, every 1 unit
- **Medium grid lines**, every 2 units
- **Major grid lines**, every 4 units
- **Skyline** (y=8), top of the base glyph area
- **Earthline** (y=16), bottom of the base glyph area

Enable the grid with the global option `grid=1`.

## Grid Units

All measurements in Bliss SVG Builder use **grid units** as the fundamental unit:

- Coordinates: `H:3,5` means x=3, y=5 grid units
- Spacing: `word-space=8` means 8 grid units
- Shape sizes: `C8` is a circle 8 grid units in diameter

**Grid units are not pixels**. They're an abstract measurement that the builder converts to SVG coordinates.

| Grid Units | Description |
|------------|-------------|
| `1 unit` | Smallest grid division (minor line spacing) |
| `4 units` | One major grid square |
| `8 units` | Standard character content width |
| `20 units` | Full grid height |

## Coordinate System

The origin `(0,0)` is at the **top-left corner**:

- **X-axis** increases going **right** (horizontal)
- **Y-axis** increases going **down** (vertical)

<Demo code="[grid=1]||DOT:0,0;DOT:8,20" title="(0,0) top-left, (8,20) bottom-right" annotations='[{"x":0.5,"y":1.5,"text":"(0,0)","style":{"fill":"red","fontSize":"1.5"}},{"x":2.5,"y":19.2,"text":"(8,20)","style":{"fill":"red","fontSize":"1.5"}}]' />

This follows the standard SVG/web coordinate system.

## Reference Lines

Bliss characters occupy a standard 20-unit tall grid. The grid is divided by named reference lines:

| Y Position | Line | Description |
|------------|------|-------------|
| 0 | Tall indicator line | Top of the grid, upper limit for elevated indicators |
| 4 | Indicator line / Ascender limit | Where indicators hang from by default, and the highest point base glyphs reach |
| 8 | Skyline | Top of the base glyph area |
| 12 | Midline | Midway between skyline and earthline |
| 16 | Earthline | Bottom of the base glyph area |
| 20 | Descender limit | The lowest point base glyphs reach |

<Demo code="[grid=1;margin-right=43]||REFSQUARE;ANCHORRING" after="[color=red;stroke-width=0.16;margin-right=43]||HL2:8,0;HL2:8,4;HL2:8,8;HL2:8,12;HL2:8,16;HL2:8,20" title="Reference lines" annotations='[{"x":10.5,"y":0.8,"text":"Tall indicator line (y=0)","style":{"fill":"red","fontSize":"1.8"}},{"x":10.5,"y":4.8,"text":"Indicator line / Ascender limit (y=4)","style":{"fill":"red","fontSize":"1.8"}},{"x":10.5,"y":8.8,"text":"Skyline (y=8)","style":{"fill":"red","fontSize":"1.8"}},{"x":10.5,"y":12.8,"text":"Midline (y=12)","style":{"fill":"red","fontSize":"1.8"}},{"x":10.5,"y":16.8,"text":"Earthline (y=16)","style":{"fill":"red","fontSize":"1.8"}},{"x":10.5,"y":20,"text":"Descender limit (y=20)","style":{"fill":"red","fontSize":"1.8"}}]' />

Most base glyphs are positioned between the skyline and earthline. This creates consistent baseline alignment when characters are combined into sentences.


See the [Positioning guide](/handbook/spacing-layout/positioning) for full details on the `:x,y` coordinate syntax and the [Grid Customization guide](/handbook/appearance/grid-customization) for styling the grid's appearance.

