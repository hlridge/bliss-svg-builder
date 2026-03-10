# Shapes

Shapes are the geometric primitives that all Bliss characters are built from. Every B-code is ultimately defined as a combination of shapes placed on a grid. Understanding shapes is the best starting point for understanding how Bliss SVG Builder constructs its output.

Characters are built recursively: a character can reference other characters and shapes as part of its composition, and shapes themselves can be built from smaller shapes. The key distinction is that a shape can only incorporate other shapes, never a character, while a character can incorporate both.

When creating compound characters, you'll often reference B-codes rather than raw shapes, because B-codes carry semantic meaning that shapes alone don't have. But the shapes are always there underneath, and the DSL lets you use them directly to create characters that don't already exist as B-codes.

If you prefer a visual, interactive approach to building characters from shapes, check out [Bliss Maker](https://blissary.com/maker) on Blissary.com.

## Shape Codes, B-Codes, or Both

You can create characters from shape codes, from existing characters' B-codes, or from a combination of them.

<Demo code="B313" title="B313 - an existing B-code" />

<Demo code="C8:0,8;DOT:2,11;DOT:6,11;HW4S:2,13" title="Built from shape codes" />

<Demo code="B313;DOT:2,11;DOT:6,11;HW4S:2,13" title="A combination of both" />

## Shape Categories

Shapes fall into several categories:

| Category | Examples | Description |
|----------|----------|---------|
| Iconic | `H`, `E`, `F` | Symbolic shapes (heart, ear, fiber) |
| Circles | `C8`, `C4`, `C2`, `C1` | Full circles by diameter |
| Half Circles | `HC8N`, `HC8S`, `HC8E`, `HC8W` | Half circles by diameter and direction |
| Quarter Circles | `QC4NE`, `QC4NW`, `QC4SE`, `QC4SW` | Quarter circles by radius and direction |
| Lines | `VL8`, `HL8`, `DL8N`, `DL8S` | Vertical, horizontal, diagonal |
| Angles | `RA8NE`, `AA8N` | Right angles, acute angles |
| Arrows | `ARR8N`, `LARR8N` | Arrows and large arrows |
| Crosses | `SC8`, `DC8` | Straight and diagonal crosses |
| Dots | `DOT` | Point marker |
| Waves | `W8`, `HW4N` | Waves and half-waves (arcs) |
| Squares | `SQ8`, `SQ4` | Solid squares |
| Rectangles | `RE84`, `RE82` | Width × height rectangles |

See the [Shapes Gallery](/reference/shapes-gallery) for a complete visual reference.

## Shape Naming Conventions

All shape codes are semantically named, following predictable patterns:

### Size Suffixes

`8`, `4`, `2`, `1` indicate size in grid units:

<Demo code="[grid;crop=auto-vertical]||C8:0,8" title="C8 - [C]ircle with diameter [8]" />

<Demo code="[grid;crop=auto-vertical]||C4:0,8" title="C4 - [C]ircle with diameter [4]" />

<Demo code="[grid;crop=auto-vertical]||C2:0,8" title="C2 - [C]ircle with diameter [2]" />

### Direction Suffixes

`N`, `S`, `E`, `W`, `NE`, `SE`, `SW`, `NW` indicate orientation:

<Demo code="[grid;crop=auto-vertical]||HC8N:0,8" title="HC8N - [H]alf [C]ircle with diameter [8] towards [N]orth" />

<Demo code="[grid;crop=auto-vertical]||HC8S:0,8" title="HC8S - [H]alf [C]ircle with diameter [8] towards [S]outh" />

<Demo code="[grid;crop=auto-vertical]||LARR8N:0,8" title="LARR8N - [L]arge [ARR]ow with length [8] pointing towards [N]orth" />

<Demo code="[grid;crop=auto-vertical]||DL8N:0,8" title="DL8N - [D]iagonal [L]ine with size [8] towards [N]orth" />

### Combined Patterns

Some shapes use both size and direction:

<Demo code="[grid;crop=auto-vertical]||QC4NE:0,8" title="QC4NE - [Q]uarter [C]ircle with radius [4] towards [NE]" />

<Demo code="[grid;crop=auto-vertical]||QC4SW:0,8" title="QC4SW - [Q]uarter [C]ircle with radius [4] towards [SW]" />

## Building Custom Characters

### Positioning Shapes

Use `:x,y` to place shapes on the grid:

<Demo code="[grid]||C8:0,8" title="Circle at (0,8)" />

<Demo code="[grid]||C8:4,8" title="Circle at (4,8) - shifted right" />

<Demo code="[grid]||C8:0,12" title="Circle at (0,12) - shifted down" />

### Combining Shapes

Use `;` to combine shapes into a single character:

<Demo code="[grid]||C8:0,8;DOT:4,12" title="Circle + centered dot" />

<Demo code="[grid]||VL8:0,8;VL8:8,8;HL8:0,8;HL8:0,16" title="Square from lines" />

## How B-Codes Use Shapes

B-codes are defined using shapes internally:

<Demo code="B313" title="B313 - feeling" />

<Demo code="[grid]||H:0,8" title="Defined as H:0,8 (heart at 0,8)" />

Compound characters combine multiple elements:

<Demo code="B1103" title="B1103 - understanding" />

<Demo code="[grid]||B335;B412:4,0" title="Defined as B335;B412:4,0 (forward + knowledge)" />

## Registering Custom Characters

Once you've designed a character from shapes, you can register it as a reusable code so it works just like a B-code. See the [Custom Codes guide](/handbook/writing/custom-codes) for how to define and register custom characters.
