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

### How `;;` is stored and serialized

`;;` attaches an indicator to a word's head glyph, but it is **not** baked onto that glyph at parse time. It is stored as a reversible *word-level overlay* on the word and resolved onto the head only when the SVG is rendered. So `;;` is preserved through a round-trip by default:

```
Input:       B313/B1103;;B81
toString():  B313/B1103;;B81                                   (the ;; overlay is kept)
toJSON():    groups[0].wordIndicators = { codes: ['B81'], stripSemantic: false }
```

To collapse `;;` onto the head as character-level `;` (the decomposed "primitive" form), pass `{ flattenIndicators: true }`:

```
toString({ flattenIndicators: true }):  B313;B81/B1103         (indicator baked onto the head)
```

Both forms render the same image; the difference is only in the serialized text and the element tree. `flattenIndicators` (word structure) and `preserve` (local names) are independent and compose freely, see the [serialization reference](/reference/api-documentation#serialization).

The head marker (`^`) that explicitly designates the head glyph also survives `toString()`, but is re-emitted only when the automatic head pick would otherwise land on a different glyph (a redundant `^`, or one dropped from a multi-character code, is not re-emitted).

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

