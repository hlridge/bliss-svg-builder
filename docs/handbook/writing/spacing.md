# Spacing

Control distances between characters and words, and fine-tune specific gaps with kerning.

## Character Spacing

Characters within a word are separated by `char-space`, which defaults to **2 grid units**:

<Demo code="[grid=1]||B392/B666" title="Default character spacing (2 units)" />

<Demo code="[grid=1;crop=7;margin=0.25]||B392/B666" after="[color=red;stroke-width=0.05;crop=6;margin=0.25]||[stroke-width=0.16]>B392;VL2:8,10;HL2:8,10;DL.5S:8,10;DL.5N:8,9.5;DL.5N:9.5,10;DL.5S:9.5,9.5/AK:0/[stroke-width=0.16]>B666;VL2:0,10" fullHeight title="char-space annotated: 2 units between endline and startline" annotations='[{"x":8.9,"y":9,"text":"space=2","style":{"fontSize":"0.8","fill":"#c00","textAnchor":"middle"}}]' />

Spacing is measured between stroke centers, not between ink edges. This means changing `stroke-width` affects how spacious or tight characters appear without changing the actual spacing. Thicker strokes may benefit from a wider `char-space`:

<Demo code="[grid=1;stroke-width=1]||B392/B666" title="Thicker strokes, default spacing looks tight" />

<Demo code="[grid=1;stroke-width=1;char-space=2.5]||B392/B666" title="Compensating with char-space=2.5" />

| Option | Default | Range |
|--------|---------|-------|
| `char-space` | `2` | 0 - 10 |

## Word Spacing

The visible gap between words is **8 grid units** by default, but it is made up of two parts: a **2-unit advance width** that naturally follows every character (the same as `char-space`), plus **6 units of actual word spacing**:

<Demo code="[grid=1]||B392/B666//B431//B4" title="Default word gap (8 units: 2 advance + 6 spacing)" />

The `word-space` option controls the full gap. Each extra <code>/</code> (`///`, `////`) adds **6 units** (the gap minus the advance width that is already there):

<Demo code="[grid=1]||B392/B666///B431//B4" title="/// adds 6 more before the second word" />

Like `char-space`, `word-space` may benefit from adjustment when using a thicker `stroke-width`.

| Option | Default | Range |
|--------|---------|-------|
| `word-space` | `8` | 0 - 20 |

## Automatic Spacing Adjustments

Some characters have built-in spacing adjustments. Punctuation marks like period (`B4`) and comma (`B5`) are placed with half the normal word spacing before them, so they sit closer to the preceding word:

<Demo code="[grid=1]||B392/B666//B431//B4" title="Period with half word-space before it" />

Digits also have default kerning that reduces the space between them by 1 unit, so sequences of digits appear grouped:

<Demo code="[grid=1]||B452/B10/B11" title="December: Digits with automatic kerning" />

These adjustments happen automatically and respond to changes in `word-space` and `char-space`.

## External Glyph Spacing

When using external glyphs (X-codes for [Latin & Cyrillic](/handbook/writing/latin-cyrillic) characters), control their spacing with `external-glyph-space`:

| Option | Default | Range |
|--------|---------|-------|
| `external-glyph-space` | `0.8` | 0 - 3 |

## Kerning

For precise control between specific characters, use kerning codes. Unlike `char-space` which affects all characters uniformly, kerning adjusts the space before a specific character:

Bliss characters don't have automatic kerning yet, but this is planned for a future version. For now, use <code>RK</code> or <code>AK</code> manually to adjust spacing between specific characters. [Latin & Cyrillic](/handbook/writing/latin-cyrillic) characters do have intrinsic kerning derived from their underlying font.

### Relative Kerning (RK)

`RK` adjusts spacing relative to what it would otherwise be:

<Demo code="B106/B313" title="Default spacing" />

<Demo code="B106/RK:-1/B313" title="Tighter: RK:-1" />

How `RK` works:
- `RK:0` - No change from default
- Positive values increase spacing by that amount
- Negative values decrease spacing by that amount

If characters would normally be 2 units apart, `RK:-1` makes them 1 unit (2 - 1).

### Absolute Kerning (AK)

`AK` sets exact spacing in grid units, ignoring all other spacing settings:

<Demo code="B313/AK:0/B1103" title="No gap: AK:0" />

<Demo code="B313/AK:2/B1103" title="2 units: AK:2" />

How `AK` works:
- `AK:0` - Characters touch (no space)
- `AK:2` - Standard-ish spacing
- Any value sets the exact distance regardless of other settings

### Mixing Kerning Types

Combine different kerning approaches in one composition:

<Demo code="B291/RK:-2/B291/AK:6/B291" title="RK:-2 then AK:6" />

Kerning codes affect the space **before** the next character, not after the previous one.

Note: When automatic kerning is added in a future version, existing `RK` adjustments will adapt naturally since they are relative to whatever the base spacing is. `AK` values will remain unchanged since they set absolute distances.

## Options Reference

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `word-space` | `8` | 0 - 20 | Space between words (`//`) |
| `char-space` | `2` | 0 - 10 | Space between characters (`/`) |
| `external-glyph-space` | `0.8` | 0 - 3 | Space for external glyphs |

| Kerning Code | Syntax | Description |
|--------------|--------|-------------|
| `RK` | `RK:value` | Relative adjustment to spacing |
| `AK` | `AK:value` | Absolute spacing in grid units |

