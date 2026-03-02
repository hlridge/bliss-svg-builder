# Positioning

Control where elements appear within your Bliss compositions.

## Coordinate Syntax

Position shapes using `:x,y` after the code:

<Demo code="[grid=1]||DOT:0,0" title="DOT at (0,0)" />

<Demo code="[grid=1]||DOT:4,8" title="DOT at (4,8)" />

<Demo code="[grid=1]||DOT:8,16" title="DOT at (8,16)" />

Coordinates are in grid units. See [Understanding the Grid](/handbook/coordinate-system/understanding-the-grid) for coordinate system details.

### Coordinate Variations

```
CODE        → x=0, y=0 (both default)
CODE:x,y    → explicit position
CODE:x      → y defaults to 0
CODE:,y     → x defaults to 0
```

<Demo code="[grid=1]||C8" title="C8 (defaults to 0,0)" />

<Demo code="[grid=1]||C8:4,8" title="C8:4,8 (explicit)" />

## Indicator Positioning

Indicators (like `B81` for action) position themselves automatically:

<Demo code="[grid=1]||B431" title="Base character" />

<Demo code="[grid=1]||B431;B81" title="With indicator (auto-positioned)" />

The indicator finds the character's anchor point and positions itself above the content area.

### How Auto-Positioning Works

1. The library calculates the character's bounding box
2. It finds the anchor point (typically top-center of the content)
3. The indicator is placed above this point

Different characters have different anchor points:

<Demo code="[grid=1]||B313;B81" title="Heart with indicator" />

<Demo code="[grid=1]||B1103;B81" title="Understanding with indicator" />

<Demo code="[grid=1]||B335;B81" title="Knowledge with indicator" />

### Manual Indicator Positioning

Override automatic positioning with explicit coordinates:

<Demo code="[grid=1]||B431;B81" title="Auto-positioned" />

<Demo code="[grid=1]||B431;B81:0,2" title="Manual: B81:0,2" />

<Demo code="[grid=1]||B431;B81:6,4" title="Manual: B81:6,4" />

Use manual positioning when:
- Auto-positioning doesn't look right
- You want non-standard indicator placement
- Creating custom compound characters

## Combining Positioned Elements

Build complex characters by positioning multiple elements:

<Demo code="[grid=1]||C8:0,8;DOT:4,12" title="Circle + centered dot" />

<Demo code="[grid=1]||VL8:4,8;HL8:0,12" title="Cross from lines" />

<Demo code="[grid=1]||C8:0,8;C4:2,10;C2:3,11" title="Nested circles" />

Each element is positioned independently. Use the grid to visualize alignment.

## Positioning in Compound Characters

Compound characters use positioning to combine base characters:

<Demo code="[grid=1]||B1103" title="B1103 (understanding)" />

The definition `B335;B412:4,0` shows:
- `B335` at default position (knowledge)
- `B412:4,0` shifted right by 4 units (into)

Understanding these compositions helps when creating custom compounds.

## Alignment Tips

### Centering Elements

Narrow glyphs can be given a minimum width with `min-width`, and centered within that width using `center=1`:

<Demo code="[grid=1]||C4:0,10" title="4-unit circle, no min-width" />

<Demo code="[grid=1;min-width=8;center=0]||C4:0,10" title="min-width=8, center=0 (space added to the right)" />

<Demo code="[grid=1;min-width=8]||C4:0,10" title="min-width=8, center=1 (centered)" />

### Vertical Alignment

Character content typically occupies y=8 to y=16:
- `y=8` is the "sky line" (top of content)
- `y=16` is the "earth line" (bottom of content)
- `y=12` is vertically centered

<Demo code="[grid=1]||HL8:0,8;HL8:0,12;HL8:0,16" title="Sky (8), center (12), earth (16)" />

## Position via Options

As an alternative to `:x,y` suffix syntax, you can set position using options:

```
[x=3;y=4]>H       (equivalent to H:3,4)
```

This is useful when combining position with other part-level options like color:

<Demo code="[grid=1]||C8:0,8;[color=red;x=2;y=10]>DOT" title="Positioned via options" />

## Zero-Sized Anchor (ZSA)

`ZSA` is an invisible element that occupies no space. It prevents the automatic normalization that shifts elements to start at x=0:

<Demo code="[grid=1]||ZSA;C4:4,10" title="ZSA keeps circle at x=4 (not shifted to 0)" />

Without `ZSA`, the circle would be normalized to x=0. This is useful when you need absolute positioning within the coordinate system.

