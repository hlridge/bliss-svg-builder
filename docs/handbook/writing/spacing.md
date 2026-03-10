# Spacing

Control distances between words, characters, and fine-tune specific gaps with kerning.

## Word Spacing

Control space between words with `word-space`:

<Demo code="B313/B1103//B431//B4" title="Default word spacing (8)" />

<Demo code="[word-space=4]||B313/B1103//B431//B4" title="Tight: word-space=4" />

<Demo code="[word-space=12]||B313/B1103//B431//B4" title="Wide: word-space=12" />

<Demo code="[word-space=16]||B313/B1103//B431//B4" title="Very wide: word-space=16" />

| Option | Default | Range |
|--------|---------|-------|
| `word-space` | `8` | 0 - 20 |

## Character Spacing

Control space between characters within a word with `char-space`:

<Demo code="B313/B1103" title="Default character spacing (2)" />

<Demo code="[char-space=0]||B313/B1103" title="Tight: char-space=0" />

<Demo code="[char-space=4]||B313/B1103" title="Wide: char-space=4" />

<Demo code="[char-space=6]||B313/B1103" title="Very wide: char-space=6" />

| Option | Default | Range |
|--------|---------|-------|
| `char-space` | `2` | 0 - 10 |

## External Glyph Spacing

When using external glyphs (X-codes for [Latin & Cyrillic](/handbook/writing/latin-cyrillic) characters), control their spacing with `external-glyph-space`:

| Option | Default | Range |
|--------|---------|-------|
| `external-glyph-space` | `0.8` | 0 - 3 |

## Kerning

For precise control between specific characters, use kerning codes. Unlike `char-space` which affects all characters uniformly, kerning adjusts the space before a specific character.

Bliss characters don't have automatic kerning rules yet — if you need tighter or looser spacing between specific characters, use RK or AK manually. [Latin & Cyrillic](/handbook/writing/latin-cyrillic) characters do have intrinsic kerning derived from their underlying font.

### Relative Kerning (RK)

`RK` adjusts spacing relative to what it would otherwise be:

<Demo code="B313/B1103" title="Default spacing" />

<Demo code="B313/RK:-1/B1103" title="Tighter: RK:-1" />

<Demo code="B313/RK:-2/B1103" title="Much tighter: RK:-2" />

<Demo code="B313/RK:2/B1103" title="Wider: RK:2" />

<Demo code="B313/RK:4/B1103" title="Much wider: RK:4" />

How RK works:
- `RK:0` - No change from default
- Positive values increase spacing by that amount
- Negative values decrease spacing by that amount

If characters would normally be 2 units apart, `RK:1` makes them 3 units (2 + 1).

### Absolute Kerning (AK)

`AK` sets exact spacing in grid units, ignoring all other spacing settings:

<Demo code="B313/AK:0/B1103" title="No gap: AK:0" />

<Demo code="B313/AK:2/B1103" title="2 units: AK:2" />

<Demo code="B313/AK:4/B1103" title="4 units: AK:4" />

<Demo code="B313/AK:8/B1103" title="8 units: AK:8" />

How AK works:
- `AK:0` - Characters touch (no space)
- `AK:2` - Standard-ish spacing
- Any value sets the exact distance regardless of other settings

### Mixing Kerning Types

Combine different kerning approaches in one composition:

<Demo code="B291/RK:-2/B291/AK:6/B291" title="RK:-2 then AK:6" />

Kerning codes affect the space **before** the next character, not after the previous one.

### When to Use Each

| Technique | Use Case |
|-----------|----------|
| `word-space` | Consistent sentence-wide word separation |
| `char-space` | Consistent character density across all words |
| `RK` | Fine-tune specific pairs relative to their natural spacing |
| `AK` | Force exact distances when precision is critical |

## Combined Example

<Demo code="[word-space=10;char-space=1]||B313/RK:-1/B1103//B431;B81//B4" title="Custom word/char spacing with kerning adjustment" />

This example uses:
- `word-space=10` for wider word gaps
- `char-space=1` for slightly tighter characters
- `RK:-1` to bring feeling and understanding closer together

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

