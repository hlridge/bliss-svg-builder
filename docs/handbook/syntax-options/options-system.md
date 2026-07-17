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

Boolean options use a bare key (no `=value`). The option is enabled when present and disabled when absent:

```
[grid]||B313
```

<Demo code="[grid]||B313" title="Boolean option" />

## Option Values

Option values are usually written bare:

```
[color=red;stroke-width=0.8]||B313
```

When a value needs to contain a `;` (which would otherwise end the option), wrap it in matching single or double quotes. The outer quotes are stripped from the parsed value:

```
[svg-title="Heart; with semicolon"]||B313
```

Inside matching quotes, `\"` and `\'` are unescaped so a literal quote of the same kind can appear in the value:

```
[svg-title="She said \"hi\""]||B313    parses to: She said "hi"
```

A lone leading or trailing quote without its partner is treated as a literal character; only matching pairs are stripped.

| Input value | Parsed value |
|---|---|
| `red` | `red` |
| `"red"` | `red` |
| `'red'` | `red` |
| `"red` | `"red` |
| `red"` | `red"` |
| `"a\"b"` | `a"b` |
| `'a\'b'` | `a'b` |

This applies to options at every scope level.

Quoting is symmetric: `toString()` adds the quotes back automatically whenever a value contains a character that would otherwise be read as syntax (`;`, `[`, `]`, `|`, a quote, or leading/trailing spaces). So special-character values round-trip as data:

```js
const builder = new BlissSVGBuilder('B313');
builder.glyph(0).setOptions({ 'data-note': 'semi;colon' });
builder.toString();
// '[data-note="semi;colon"]B313'
```

One accepted limit: a value where a backslash sits directly next to a quote (the `a\"b` class, or a trailing backslash) does not survive the round-trip, because only `\"` and `\'` are unescaped on parse.

## Scope Levels

Options can be applied at four levels, from broadest to most specific:

| Scope | Syntax | Separator | Priority |
|-------|--------|-----------|----------|
| Global | <code>[opts]&#124;&#124;</code> | <code>&#124;&#124;</code> | Lowest |
| Word | <code>[opts]&#124;</code> | <code>&#124;</code> | ↓ |
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

A custom glyph is a single part while you use it by name, so `[opts]>` works on it too. See [Part options on custom glyphs](#part-options-on-custom-glyphs) for how such an option serializes.

## Option Placement Is Checked

Each bracket binds to a single unit of its scope, and the builder verifies that the unit matches. When it does not, the option is **dropped with a warning and the content still renders**; the dropped option is not re-emitted by `toString()`.

- A character option on a code that expands to a whole word warns [`MISPLACED_CHARACTER_OPTION`](/reference/warning-codes#misplaced-character-option); a part option (`[opts]>`) on one warns [`MISPLACED_PART_OPTION`](/reference/warning-codes#misplaced-part-option). A character option is valid only on a single character, a part option only on a single part.
- A bracket without `>` inside a `;`-part slot (`B291;[color=red]B81`) is a character option by syntax where only a part option fits, so it warns `MISPLACED_CHARACTER_OPTION` and the part renders bare. To style the part, write `B291;[color=red]>B81`.
- A word option (`[opts]|`) on a predefined code that expands to multiple words warns [`MISPLACED_GROUP_OPTION`](/reference/warning-codes#misplaced-group-option). Written multi-word content is different: in `[color=red]|B313//B431` the bracket binds the first word by syntax, which is valid.
- Only one bracket is allowed per scope: `[grid][grid-color=red]||B313` applies just the first bracket and warns [`MULTIPLE_OPTION_BRACKETS`](/reference/warning-codes#multiple-option-brackets). Combine the options instead: `[grid;grid-color=red]||B313`.

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

Canvas-wide options configure the whole SVG (its margins, grid, backgrounds, spacing, metadata), so they only take effect at global scope (`[opts]||`). Placed at word, character, or part scope they are dropped with a [`MISPLACED_GLOBAL_OPTION`](/reference/warning-codes#misplaced-global-option) warning and the content renders unchanged:

| Family | Keys |
|--------|------|
| Margins & cropping | `margin`, `margin-top/-bottom/-left/-right`, `crop`, `crop-top/-bottom/-left/-right` |
| Grid | `grid`, `grid-color`, `grid-major/-medium/-minor/-sky/-earth-color`, `grid-stroke-width` and the matching `grid-*-stroke-width` keys |
| Backgrounds | `background`, `background-top`, `background-mid`, `background-bottom` |
| Layout & spacing | `center`, `min-width`, `char-space`, `word-space`, `external-glyph-space` |
| SVG document | `svg-title`, `svg-desc`, `svg-height` |
| Diagnostics | `error-placeholder` |

## Part Options on Custom Glyphs

A part option on a custom glyph used by name (`[color=blue]>SMILEY`) styles the whole glyph as one part. Because `toString()` decomposes custom glyphs to portable built-in codes by default, the option is re-emitted before **each** decomposed part, so the styling survives the round-trip:

```js
BlissSVGBuilder.define({ 'TWOBASE': { type: 'glyph', codeString: 'B291;C8' } });

new BlissSVGBuilder('[color=blue]>TWOBASE').toString();
// '[color=blue]>B291;[color=blue]>C8'
```

Reparsing that output gives identical computed styling for inheritable attributes like `color`, `stroke`, and `stroke-width`. Two classes of options behave differently in the per-part form:

- **Compositing attributes** (`opacity`, `filter`) apply to each decomposed part instead of once over the combined ink, which is visible where parts overlap.
- **Per-element options** multiply: an `id` is duplicated onto every part, and `href` anchors or `pointer-events` hit regions split per part.

When you need the single-wrapper form preserved exactly, serialize with `{ preserve: true }`; it keeps the glyph name and the option in place (`[color=blue]>TWOBASE`) losslessly.

An option baked into the definition itself (`'[color=red]>B291;C8'`) wins over an outer option for the same attribute on that part, matching how nested SVG attributes cascade.

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

For setting options programmatically (app-wide defaults and enforced overrides), see [Programmatic Options](./programmatic-options).

