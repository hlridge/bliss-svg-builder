# Understanding the Grid

The grid system in Bliss SVG Builder provides a visual reference and coordinate system for positioning elements.

## What is the Grid?

The grid is a visual overlay showing the coordinate system. Enable it to see exactly where elements are positioned:

<Demo code="[grid=1]||B313" title="Character with grid visible" />

The grid shows:
- **Major grid lines** (darker) - every 4 units
- **Minor grid lines** (lighter) - every 1 unit
- **Sky line** (y=8) - top of character content area
- **Earth line** (y=16) - bottom of character content area

Enable the grid with `grid=1`:

```
[grid=1]||B313
```

The grid is purely visual for design and debugging. It doesn't affect the actual SVG output.

## Grid Units

All measurements use **grid units** as the fundamental unit:

- Coordinates: `H:3,5` means x=3, y=5 grid units
- Spacing: `word-space=8` means 8 grid units
- Shape sizes: `C8` is a circle 8 grid units in diameter

**Grid units are NOT pixels**. They're an abstract measurement converted to SVG coordinates. One grid unit equals 6 SVG units in the final output.

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

<Demo code="[grid=1;crop=auto-height]||DOT:0,0;DOT:8,20" title="(0,0) top-left, (8,20) bottom-right" />

This is the standard SVG/web coordinate system:
- Moving right increases X
- Moving down increases Y
- Y increases downward (not upward like mathematical graphs)

## Standard Character Area

Bliss characters occupy a standard 20-unit tall grid:

| Y Position | Name | Purpose |
|------------|------|---------|
| 0 | Top | Reserved for tall indicators |
| 4-6 | Indicator zone | Where indicators typically appear |
| 8 | Sky line | Top of main content area |
| 12 | Middle | Center of content |
| 16 | Earth line | Bottom of main content area |
| 20 | Bottom | Rarely used |

<Demo code="[grid=1]||DOT:0,8;DOT:8,16" title="Content area: (0,8) to (8,16)" />

The content area (y=8 to y=16) is where most character shapes appear. This creates consistent baseline alignment when characters are combined into sentences.

## Common Coordinates

| Position | Coordinates | Use |
|----------|-------------|-----|
| Origin | `(0,0)` | Top-left reference |
| Content top-left | `(0,8)` | Start of main content |
| Content center | `(4,12)` | Center of 8×8 content area |
| Content bottom-right | `(8,16)` | End of main content |
| Grid bottom | `(0,20)` | Full height reference |

## Using the Grid

The grid is a design and debugging tool. Common uses:

- **Verifying positions** — check that elements land where you expect
- **Building custom characters** — see the coordinate system while placing shapes
- **Checking indicator placement** — verify auto-positioning results

<Demo code="[grid=1]||B431;B81" title="Verify indicator placement" />

<Demo code="[grid=1;crop=auto-height]||C8:0,8;DOT:2,10;DOT:6,10;HC4S:4,13" title="Custom smiley using grid reference" />

See the [Positioning guide](/handbook/spacing-layout/positioning) for full details on the `:x,y` coordinate syntax and the [Grid Customization guide](/handbook/coordinate-system/grid-customization) for styling the grid's appearance.

