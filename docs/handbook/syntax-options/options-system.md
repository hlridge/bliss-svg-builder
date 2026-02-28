# Options System

Options control appearance and behavior. They cascade from global to specific scope.

## Option Syntax

Options use `[key=value]` syntax:

```
[color=red]||B313
```

Multiple options are separated by semicolons:

```
[color=red;stroke-width=0.8]||B313
```

<Demo code="[color=red;stroke-width=0.8]||B313" title="Multiple options" />

## Scope Levels

Options can be applied at four levels, from broadest to most specific:

| Scope | Syntax | Separator | Priority |
|-------|--------|-----------|----------|
| Global | `[opts]||` | `\|\|` | Lowest |
| Word | `[opts]|` | `\|` | ↓ |
| Character | `[opts]` | (none) | ↓ |
| Part | `[opts]>` | `>` | Highest |

### Global Scope

Applies to the entire composition:

```
[color=blue]||B313/B1103//B431
```

<Demo code="[color=blue]||B313/B1103//B431" title="Global: all blue" />

### Word Scope

Applies to a specific word:

```
B313//[color=red]|B431//B1103
```

<Demo code="B313//[color=red]|B431//B1103" title="Word scope: middle word red" />

### Character Scope

Applies to a specific character within a word:

```
B313/[color=red]B1103
```

<Demo code="B313/[color=red]B1103" title="Character scope: second char red" />

### Part Scope

Applies to a specific part within a character:

```
B431;[color=red]>B81
```

<Demo code="B431;[color=red]>B81" title="Part scope: indicator red" />

## Cascading Rules

More specific options override broader ones:

1. Part options override everything
2. Character options override word and global
3. Word options override global
4. Global options are the default

### Cascading Example

```
[color=red]||[color=blue]|[color=green][color=orange]>H;H:10,0/H//H
```

<Demo code="[color=red]||[color=blue]|[color=green][color=orange]>H;H:10,0/H//H" title="Four hearts with cascading colors" />

Breaking it down:
1. **Orange heart** (left) - Part option `[color=orange]>H` wins
2. **Green heart** - Character option `[color=green]` applies to `H:10,0`
3. **Blue heart** - Word option `[color=blue]|` applies to `/H`
4. **Red heart** (right) - Global option `[color=red]||` applies to `//H`

## Combining Scopes

You can set defaults globally and override for specific elements:

<Demo code="[color=gray;stroke-width=0.5]||B313//[color=red;stroke-width=0.8]|B431//B1103" title="Gray default, red emphasis" />

This pattern is useful for:
- Highlighting specific words
- Creating visual hierarchy
- Emphasizing important elements

## Multi-Level Example

<Demo code="[color=#666]||[color=#333]|B313;[color=#000]>B81/B1103//B431" title="Multiple scope levels" />

In this example:
- Global default: `#666` (medium gray)
- First word: `#333` (darker gray) via word option
- Indicator: `#000` (black) via part option
- Second character in first word: inherits word option (`#333`)
- Second word: inherits global option (`#666`)

## Which Options Support Scoping?

Built-in visual options can be applied at any scope:

| Option | Global | Word | Character | Part |
|--------|:------:|:----:|:---------:|:----:|
| `color` | ✓ | ✓ | ✓ | ✓ |
| `stroke-width` | ✓ | ✓ | ✓ | ✓ |

[SVG pass-through attributes](/handbook/syntax-options/svg-pass-through) (like `fill`, `opacity`, `stroke-dasharray`, etc.) also work at any scope.

Some options only make sense at global scope:

| Option | Notes |
|--------|-------|
| `word-space` | Global or word scope |
| `char-space` | Global or word scope |
| `grid` | Global only |
| `background` | Global only |
| `svg-height` | Global only |
| `margin` | Global only |
| `crop` | Global only |

## Practical Patterns

### Emphasis

<Demo code="[color=gray]||B313/B1103//[color=#dc2626]|B431//B4" title="Emphasize one word" />

### Indicator Styling

<Demo code="B431;[color=blue;stroke-width=0.3]>B81" title="Styled indicator" />

### Word-by-Word Colors

<Demo code="[color=#dc2626]|B313//[color=#16a34a]|B1103//[color=#2563eb]|B431" title="Different color per word" />

### Default with Exceptions

<Demo code="[color=#1e3a5f]||B313/[color=#dc2626]B1103//B431//B4" title="Dark blue default, red exception" />

## Setting Options from JavaScript

For setting options programmatically — app-wide defaults and enforced overrides — see [Programmatic Options](./programmatic-options).

