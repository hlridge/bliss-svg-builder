# DSL Syntax Quick Reference

Cheat sheet for the Bliss SVG Builder DSL syntax.

## Structure Separators

Pattern: Single = character level, Double = word level

| Separator | Level | Example | Meaning |
|-----------|-------|---------|---------|
| `//` | Word separator | `B313//B431` | Two words |
| `/` | Character separator | `B313/B1103` | Two characters in one word |
| `;;` | Word-level indicators | `B313/B1103;;B81` | Indicator on head glyph |
| `;` | Character-level indicators | `B431;B81` | Indicator on specific character |

## Option Scope Separators

| Separator | Scope | Example |
|-----------|-------|---------|
| `\|\|` | Global | `[color=red]\|\|B313` |
| `\|` | Word | `[color=blue]\|B313` |
| (none) | Character | `[color=green]B313` |
| `>` | Part | `[color=orange]>B313` |

## Coordinates

| Syntax | Meaning |
|--------|---------|
| `CODE` | Position (0,0) |
| `CODE:x,y` | Position (x,y) |
| `CODE:x` | Position (x,0) |
| `CODE:,y` | Position (0,y) |

## Word Separator Internals

`//` is shorthand for `/SP/`, an explicit space character. During processing, `SP` is translated to `TSP` (three-quarter space) or `QSP` (quarter space, used before punctuation marks). Each extra `/` in `///` or `////` adds another `TSP`.

## Kerning

| Code | Syntax | Effect |
|------|--------|--------|
| `RK` | `RK:value` | Relative adjustment |
| `AK` | `AK:value` | Absolute spacing |

Examples:
- `B313/RK:-1/B1103` - 1 unit tighter
- `B313/AK:4/B1103` - exactly 4 units apart

## Option Syntax

```
[key=value]
[key=value;key=value]
```

## Common Patterns

| Pattern | Example | Result |
|---------|---------|--------|
| Single character | `B313` | One character |
| Word | `B313/B1103` | Two characters |
| Sentence | `B313//B431//B4` | Three words |
| Character-level indicator | `B431;B81` | Indicator on that character |
| Word-level indicator | `B313/B1103;;B81` | Indicator on head glyph |
| Styled | `[color=red]\|\|B313` | Red character |
| Positioned | `H:0,8` | Heart at (0,8) |

## Hierarchy (Outer to Inner)

```
SENTENCE
  └─ WORD //
       └─ CHARACTER /
            └─ PART ;
```

## Full Syntax Pattern

```
[global]||[word]|[char][part]>CODE:x,y
```

Each part is optional. Use only what you need.

