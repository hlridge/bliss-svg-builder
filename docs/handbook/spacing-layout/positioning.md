# Positioning

Control where elements appear within your Bliss compositions.

## Coordinate Syntax

Position shapes using `:x,y` after the code:

<Demo code="[grid=1]||DOT:0,0" title="DOT at (0,0)" />

<Demo code="[grid=1]||DOT:4,8" title="DOT at (4,8)" />

<Demo code="[grid=1]||DOT:8,16" title="DOT at (8,16)" />

Coordinates are in grid units. See [Grid Basics](/handbook/appearance/grid-basics) for coordinate system details.

### Coordinate Variations

```
CODE        → x=0, y=0 (both default)
CODE:x,y    → explicit position
CODE:x      → y defaults to 0
CODE:,y     → x defaults to 0
```

<Demo code="[grid=1]||C8" title="C8 (defaults to 0,0)" />

<Demo code="[grid=1]||C8:4,8" title="C8:4,8 (explicit)" />

## Shape Box vs Character Box

Every element has a bounding box. For shapes, the box tightly wraps the ink — a shape placed at `:x,y` has its ink starting exactly at that position:

<Demo code="H:0,8" display-code="[grid=1]||H:0,8" title="Shape box — ink fills the entire box" before="[grid=1]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|VL8:0,8;HL8:0,8;HL8:0,16;VL8:8,8" />

Characters work differently. Every character occupies a 20-unit tall box, with the ink sitting at a specific position within it — most character content appears between y=8 and y=16, while indicator ink sits around y=4. The space above and below the ink is not empty padding; it's part of the character's coordinate space, reserved for indicators and descenders:

<Demo code="B313" display-code="[grid=1]||B313" title="Character box — spans the full 20 units" before="[grid=1]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|VL10;VL10:0,10;HL8;HL8:0,20;VL10:8,0;VL10:8,10" />

When you position a character with `:x,y`, you're positioning the entire character box, not just the ink. Shapes have their ink at the top of the box, so `:x,y` places the ink exactly where you'd expect. Characters have their ink offset within the box, so the visible result is shifted accordingly.

## Indicator Positioning

Indicators (like `B81` for action) position themselves automatically:

<Demo code="[grid=1]||B431" title="Base character" />

<Demo code="[grid=1]||B431;B81" title="With indicator (auto-positioned)" />

Each glyph has an anchor point defined in its glyph data. The indicator attaches to this anchor point, which defaults to the top-center of the character but can be offset horizontally or vertically per glyph, so indicators aren't always mathematically centered:

<Demo code="[grid=1]||B313;B81" title="Heart — centered anchor" />

<Demo code="[grid=1]||B355;B86" title="Vertical offset — indicator sits higher" />

<Demo code="[grid=1]||B419;B81" title="Both offsets — shifted left and up" />

### Manual Indicator Positioning

Override anchor-based positioning with explicit coordinates. Since indicators are characters, `:x,y` positions the entire 20-unit character box. The indicator's ink sits at y=4 within its box, so placing the box at a given y-position shifts the ink accordingly:

<Demo code="B431;B81" display-code="[grid=1]||B431;B81" title="Anchor-positioned" before="[grid=1;min-width=16]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|HL2:7,0;VL10:7,0;VL10:7,10;HL2:7,20;VL10:9,0;VL10:9,10" />

<Demo code="[margin-bottom=2.75]||B431;B81:2,2" display-code="[grid=1]||B431;B81:2,2" title="B81:2,2 — box at y=2, ink appears at y=6" before="[grid=1;min-width=16;margin-bottom=2.75]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|HL2:2,2;VL10:2,2;VL10:2,12;HL2:2,22;VL10:4,2;VL10:4,12;[stroke-width=0.5]>DOT:2,2;[stroke-dasharray=none]>DL4-1N:3,1;[stroke-dasharray=none]>DL4-1N:3,5" annotations='[{"x":0,"y":1.2,"text":"(2,2)","style":{"fill":"red","fontSize":"1.5"}},{"x":7.3,"y":1.2,"text":"y=2","style":{"fill":"red","fontSize":"1.5"}},{"x":7.3,"y":5.2,"text":"y=6","style":{"fill":"red","fontSize":"1.5"}}]' />

Use manual positioning when:
- The anchor point doesn't produce the desired result
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
- `B335` at default position (forward)
- `B412:4,0` shifted right by 4 units (knowledge)

Understanding these compositions helps when creating custom compounds.

## Alignment Tips

### Centering Elements

Narrow glyphs can be given a minimum width with `min-width`, and centered within that width using `center=1`:

<Demo code="[grid=1]||C4:0,10" title="4-unit circle, no min-width" />

<Demo code="[grid=1;min-width=8]||C4:0,10" title="min-width=8 (default, space added to the right)" />

<Demo code="[grid=1;min-width=8;center=1]||C4:0,10" title="min-width=8, center=1 (centered)" />

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

