# Positioning

Control where elements appear within your Bliss compositions.

## Coordinate Syntax

Position shapes using `:x,y` after the code:

<Demo code="[grid]||DOT:0,0" title="DOT at (0,0)" />

<Demo code="[grid]||DOT:4,8" title="DOT at (4,8)" />

<Demo code="[grid]||DOT:8,16" title="DOT at (8,16)" />

Coordinates are in grid units. See [Grid Basics](/handbook/appearance/grid-basics) for coordinate system details.

### Coordinate Variations

```
CODE        → no position set
CODE:x,y    → sets both
CODE:x      → sets x only
CODE:,y     → sets y only
```

An axis you don't set keeps the position the element would have had anyway, which for ordinary shapes is 0.

<Demo code="[grid]||C8" title="C8 (defaults to 0,0)" />

<Demo code="[grid]||C8:4,8" title="C8:4,8 (explicit)" />

## Shape Box vs Character Box

Every element has a bounding box. For shapes, the box tightly wraps the ink. A shape placed at `:x,y` has its ink starting exactly at that position:

<Demo code="H:0,8" display-code="[grid]||H:0,8" title="Shape box: ink fills the entire box" before="[grid]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|VL8:0,8;HL8:0,8;HL8:0,16;VL8:8,8" />

Characters work differently. Every character occupies a 20-unit tall box, with the ink sitting at a specific position within it. Most character content appears between y=8 and y=16, while indicator ink sits around y=4. The space above and below the ink is not empty padding; it's part of the character's coordinate space, reserved for indicators and descenders:

<Demo code="B313" display-code="[grid]||B313" title="Character box: spans the full 20 units" before="[grid]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|VL10;VL10:0,10;HL8;HL8:0,20;VL10:8,0;VL10:8,10" />

When you position a character with `:x,y`, you're positioning the entire character box, not just the ink. Shapes have their ink at the top of the box, so `:x,y` places the ink exactly where you'd expect. Characters have their ink offset within the box, so the visible result is shifted accordingly.

## Indicator Positioning

Indicators (like `B81` for action) position themselves automatically:

<Demo code="[grid]||B431" title="Base character" />

<Demo code="[grid]||B431;B81" title="With indicator (auto-positioned)" />

Each glyph has an anchor point defined in its glyph data. The indicator attaches to this anchor point, which defaults to the top-center of the character but can be offset horizontally or vertically per glyph, so indicators aren't always mathematically centered:

<Demo code="[grid]||B313;B81" title="Heart, centered anchor" />

<Demo code="[grid]||B355;B86" title="Vertical offset, indicator sits higher" />

<Demo code="[grid]||B419;B81" title="Both offsets, shifted left and up" />

### Manual Indicator Positioning

Override anchor-based positioning with explicit coordinates. Since indicators are characters, `:x,y` positions the entire 20-unit character box. The indicator's ink sits at y=4 within its box, so placing the box at a given y-position shifts the ink accordingly:

<Demo code="B431;B81" display-code="[grid]||B431;B81" title="Anchor-positioned" before="[grid;min-width=16]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|HL2:7,0;VL10:7,0;VL10:7,10;HL2:7,20;VL10:9,0;VL10:9,10" />

<Demo code="[margin-bottom=2.75]||B431;B81:2,2" display-code="[grid]||B431;B81:2,2" title="B81:2,2 (box at y=2, ink appears at y=6)" before="[grid;min-width=16;margin-bottom=2.75]||[color=red;stroke-width=0.16;stroke-dasharray=2,1]|HL2:2,2;VL10:2,2;VL10:2,12;HL2:2,22;VL10:4,2;VL10:4,12;[stroke-width=0.5]>DOT:2,2;[stroke-dasharray=none]>DL4-1N:3,1;[stroke-dasharray=none]>DL4-1N:3,5" annotations='[{"x":0,"y":1.2,"text":"(2,2)","style":{"fill":"red","fontSize":"1.5"}},{"x":7.3,"y":1.2,"text":"y=2","style":{"fill":"red","fontSize":"1.5"}},{"x":7.3,"y":5.2,"text":"y=6","style":{"fill":"red","fontSize":"1.5"}}]' />

For an indicator, not setting an axis and setting it to `0` are different instructions, because an unset indicator is positioned for you:

<Demo code="[grid]||B291;B86" title="B291;B86 (placed for you, centered over its base)" />

<Demo code="[grid]||B291;B86:0,0" title="B291;B86:0,0 (you placed it, at the base's left edge)" />

Use manual positioning when:
- The anchor point doesn't produce the desired result
- You want non-standard indicator placement
- Creating custom compound characters

## Combining Positioned Elements

Build complex characters by positioning multiple elements:

<Demo code="[grid]||C8:0,8;DOT:4,12" title="Circle + centered dot" />

<Demo code="[grid]||VL8:4,8;HL8:0,12" title="Cross from lines" />

<Demo code="[grid]||C8:0,8;C4:2,10;C2:3,11" title="Nested circles" />

Each element is positioned independently. Use the grid to visualize alignment.

## Positioning in Compound Characters

Compound characters use positioning to combine base characters:

<Demo code="[grid]||B1103" title="B1103 (understanding)" />

The definition `B335;B412:4,0` shows:
- `B335` at default position (forward)
- `B412:4,0` shifted right by 4 units (knowledge)

Understanding these compositions helps when creating custom compounds.

## Alignment Tips

### Centering Elements

Narrow glyphs can be given a minimum width with `min-width`, and centered within that width using `center`:

<Demo code="[grid]||C4:0,10" title="4-unit circle, no min-width" />

<Demo code="[grid;min-width=8]||C4:0,10" title="min-width=8 (default, space added to the right)" />

<Demo code="[grid;min-width=8;center]||C4:0,10" title="min-width=8, center (centered)" />

### Vertical Alignment

Character content typically occupies y=8 to y=16:
- `y=8` is the "sky line" (top of content)
- `y=16` is the "earth line" (bottom of content)
- `y=12` is vertically centered

<Demo code="[grid]||HL8:0,8;HL8:0,12;HL8:0,16" title="Sky (8), center (12), earth (16)" />

## Position via Options

As an alternative to `:x,y` suffix syntax, you can set position using options:

```
[x=3;y=4]>H       (equivalent to H:3,4)
```

This is useful when combining position with other part-level options like color:

<Demo code="[grid]||C8:0,8;[color=red;x=2;y=10]>DOT" title="Positioned via options" />

The same options work from a program, at every level and through every call that takes options:

```js
builder.glyph(0).part(1).setOptions({ x: 2, y: 10 });
builder.glyph(0).addPart('DOT', { x: 2, y: 10 });
```

Both spellings position the part inside its character, so they are two ways of saying one thing. Write both and the **option wins**, and the coordinate it overrides is reported ([`MULTIPLE_POSITION_VALUES`](/reference/warning-codes)). The output settles on the coordinate: `[x=2]>DOT` comes back from `toString()` as `DOT:2`.

### Character-level x is leading blank

A `[x=N]` written on a **character** (no `>`) is a different thing from a part coordinate: it is blank space that belongs to the character, not a new position for it.

<Demo code="[grid]||B99/B291" title="B99/B291 (no blank)" />

<Demo code="[grid]||B99/[x=5]B291" title="B99/[x=5]B291 (5 units of blank inside the second character)" />

The second character still starts where the writing flow puts it. It is 5 units wider, its ink begins 5 units further in, and whatever follows moves along with it. That keeps a character's reported spacing step (`advanceX`) pointing at where the next character actually starts, whatever the character carries inside.

`y` is not symmetric with `x`, and deliberately so. `x` runs along the writing direction, where the flow already decides the position, so a value written there has to mean something the flow does not. `y` has no flow to negotiate with, so a character-level `[y=N]` is a plain offset.

Word and global scope (`[x=N]|`, `[x=N]||`) are a third thing again: there `x` moves the word itself, and it is measured from the end of what precedes it rather than added to the flow. `B291//B99` puts the second word at 16; `B291//[x=0]|B99` puts it at 10, where a mere character space would have put it. Leading blank is a character-level idea.

This is also what tells `[x=N]` apart from [kerning](/handbook/writing/spacing#kerning): `AK:`/`RK:` widen the gap the **previous** character leaves, while `[x=N]` fills the character that carries it. Write both and they add up.

### One value, two spellings

A position is one value, and which spelling wrote it does not show anywhere you can read it, change it or save it.

**Clearing it takes the axis name, whichever spelling wrote it:**

```js
const builder = new BlissSVGBuilder('C8:0,8;DOT:2');
builder.part(1).removeOptions('x');
builder.toString();   // 'C8:0,8;DOT'

// the same call on 'C8:0,8;[x=2]>DOT' gives the same answer
```

Removal reaches only the element you call it on, so clearing a character's `x` leaves a coordinate on a part inside that character standing.

**On the way out the position is written in one form.** The number is normalized, and the position leads the options in its bracket whatever order you typed them in:

| you write | `toString()` gives back |
|---|---|
| `[x=5.0]B291` | `[x=5]B291` |
| `[x=+5]B291` | `[x=5]B291` |
| `[x=.5]B291` | `[x=0.5]B291` |
| `[color=red;x=5]B291` | `[x=5;color=red]B291` |
| `[absolute-kerning=5;x=3]B291` | `AK:5/[x=3]B291` |

The picture is the same in every case. If you compare stored text against fresh output, expect these differences. The last row is the one exception to "the position leads": a [kerning](/handbook/writing/spacing#kerning) value is written as its marker rather than as an option, so it comes back in front of the bracket.

**In a saved composition the position sits beside the element, not in its options:**

```js
new BlissSVGBuilder('[x=5]B291').toJSON();
// { options: {},
//   groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], x: 5, codeName: 'B291' }] }] }
```

Read `x` and `y` beside the element; there is no `options.x` to read. An axis you never wrote is absent, and a `0` you did write is a position like any other, so the two are not the same thing.

Writing one by hand is fine, and it is read the same way a bracket is read: a number, or a string that spells one. A value that cannot be a coordinate is reported with [`MALFORMED_COORDINATES`](/reference/warning-codes#malformed-coordinates), that axis is dropped, and the rest of the composition still draws.

```js
{ codeName: 'C8', x: '3' }     // placed at 3
{ codeName: 'C8', x: 'abc' }   // warns, draws C8 unmoved
```

## Zero-Sized Anchor (ZSA)

`ZSA` is an invisible element that occupies no space, but occupies a position respected by auto-cropping behavior.

<Demo code="[grid;crop=auto]||ZSA:12,0;C4:4,10" title="ZSA prevents cropping from the top-right" />

