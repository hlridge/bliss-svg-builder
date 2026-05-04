# DSL Syntax Quick Reference

Cheat sheet for the Bliss SVG Builder DSL syntax.

## Structure Separators

Pattern: Single = character level, Double = word level

| Separator | Level | Example | Meaning |
|-----------|-------|---------|---------|
| `//` | Word separator | `B313//B431` | Two words |
| `/` | Character separator | `B313/B1103` | Two characters in one word |
| `;;` | Word-level indicators | `B313/B1103;;B81` | Indicator on head glyph, keeps thing/abstract |
| `;;!` | Strip-semantic indicators | `B313/B1103;;!B81` | Strips all indicators including the semantic root, then adds B81 |
| `;` | Character-level indicators | `B431;B81` | Indicator on character, keeps thing/abstract |
| `;!` | Strip-semantic indicators | `B431;!B81` | Strips all indicators including the semantic root, then adds B81 |

### Indicator Resolution

The `;;` separator is an input convenience for attaching indicators to a word's head glyph. During parsing, the indicator resolves to character-level `;` syntax on the head glyph. This resolved form is what `toString()` returns:

```
Input:      B313/B1103;;B81    (indicator targets head glyph)
toString(): B313;B81/B1103     (indicator attached to B313)
```

The visual output is identical. The difference only matters when inspecting `toString()` output or the element tree.

### The semantic root and `!`

Many Bliss words carry a *semantic root* indicator: `B97` (thing) or `B6436` (abstract). It marks the word's broad part-of-speech category and is preserved by default when you replace indicators with `;` or `;;`. So `B431;B81` keeps the existing thing/abstract root and attaches `B81` alongside it.

Prefix the new indicator with `!` to strip the semantic root as well. Use `;!` for character-level and `;;!` for word-level. Either form replaces the entire indicator stack with only what you provide.

```
B431;B81    →  keeps semantic root, attaches B81
B431;!B81   →  drops semantic root, attaches only B81
```

The same behavior is available on the API as `applyIndicators(newInds, { stripSemantic: true })`.

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

