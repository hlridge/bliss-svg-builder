# DSL Syntax Quick Reference

Cheat sheet for the Bliss SVG Builder DSL syntax.

## Structure Separators

Single separators work within a word (`/` between characters, `;` between the parts of one character); double separators work at word level (`//` between words, `;;` on a word).

| Separator | Level | Example | Meaning |
|-----------|-------|---------|---------|
| `//` | Word separator | `B313//B431` | Two words |
| `/` | Character separator | `B313/B1103` | Two characters in one word |
| `;;` | Word-level indicator | `B313/B1103;;B81` | Indicator applied to the word's head glyph (picked for you) |
| `;;!` | Word-level indicator, strip semantic | `B313/B1103;;!B81` | Same, but also strips the thing/abstract root |
| `;` | Part composition (character level) | `B431;B81` | Superimposes a part onto a glyph, exactly as written |

### `;` composes parts literally

`;` attaches a part to a single character (a glyph): `B431;B81` renders the action indicator `B81` over `B431` and serializes back exactly as written. Nothing implicit happens. `;` never replaces existing parts, never removes other indicators, and never adds anything you did not write: `B291;B86;B81` keeps all three parts.

Because `;` targets one glyph, it has no meaning on a code that expands to a whole word (a predefined multi-character code): there is no single character for the indicator to land on, so it is dropped with a `MISPLACED_CHARACTER_INDICATOR` warning and the word still renders. Use `;;` there instead.

Within one character, indicators come last: `base;base;indicator;indicator`. An indicator written before base content has no meaning in Bliss, so it is dropped with a `MISPLACED_INDICATOR_PART` warning and the rest of the character renders: `B86;B291` renders as `B291`. Parts you explicitly position at a non-origin `:x,y` are hand-placed artwork and never trigger this.

A `;`-part must itself be a single part (a primitive or defined shape, or a defined glyph — a glyph is one atomic part even when its definition composes several). Composing a whole word or a plain multi-part alias into a `;`-slot fails that character with a `WORD_AS_PART` / `COMPOSITE_AS_PART` warning. See [Warning Codes](/reference/warning-codes).

### `;;` applies word grammar

A word has two indicator layers: each character's own parts (written with `;`) and the word's indicator (written with `;;`), which sits on top:

- The builder picks the **head glyph** to display the indicator on; you don't name it. See [the head glyph algorithm](/handbook/writing/words-sentences#the-head-glyph-algorithm).
- While a `;;` indicator is active, it **hides the head glyph's own grammatical indicators**: the word's grammar wins over the character's. Removing the overlay un-hides them (the overlay is a layer, not a rewrite).
- The word's semantic root (`B97` thing / `B6436` abstract) is preserved; `;;!` strips it too (see below).
- The code after `;;` must be an indicator. A base character there is dropped with a `NON_INDICATOR_AS_WORD_INDICATOR` warning; an unknown code with `UNKNOWN_CODE`. The word renders either way.

```
B291;B81;B97/C8;;B86    →  head shows B86 + B97 (its own B81 is hidden)
B291;B81;B97/C8;;!B86   →  head shows B86 only (B97 stripped as well)
```

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

The head marker (`^`) that explicitly designates the head glyph now always survives `toString()`, even when the automatic head pick would land on the same glyph (a `^` dropped from a multi-character code at parse time is gone and never reappears).

### The semantic root and `;;!`

Many Bliss words carry a *semantic root* indicator: `B97` (thing) or `B6436` (abstract). It marks the word's broad category and is preserved by default when a `;;` indicator applies. So in `B291;B97/C8;;B86` the head keeps its `B97` root and displays `B86` alongside it.

Use `;;!` to strip the semantic root as well: the word then displays only the indicators you provide.

There is no character-level strip form. `;` composes literally, so there is nothing for it to strip: `B431;!B81` is not valid syntax (the `!B81` token is unknown and dropped with a warning). To replace a glyph's own indicators programmatically, use `glyph.applyIndicators(code)` or `applyIndicators(code, { stripSemantic: true })`, see [Programmatic Mutation](/handbook/syntax-options/programmatic-mutation#indicator-operations).

## Option Scope Separators

| Separator | Scope | Example |
|-----------|-------|---------|
| `\|\|` | Global | `[color=red]\|\|B313` |
| `\|` | Word | `[color=blue]\|B313` |
| (none) | Character | `[color=green]B313` |
| `>` | Part | `[color=orange]>B313` |

### Option placement rules

An option bracket binds to a single unit of its scope, and the builder checks that the unit matches:

- A **character** option on a code that expands to a whole word, or a **part** option (`[opts]>`) on one, is dropped with a `MISPLACED_CHARACTER_OPTION` / `MISPLACED_PART_OPTION` warning; the word still renders. A **word** option (`[opts]|`) on a code that expands to multiple words is dropped with `MISPLACED_GROUP_OPTION`, and all the words render.
- **Canvas-wide options** (`margin`, `crop`, `grid` and `grid-*`, `background*`, `center`, `min-width`, `char-space`, `word-space`, `external-glyph-space`, `svg-*`, `error-placeholder`) configure the whole SVG, so they only work at global scope (`[opts]||`). At word, character, or part scope they are dropped with a `MISPLACED_GLOBAL_OPTION` warning; the content still renders.
- **One bracket per scope.** `[grid][grid-color=red]||B313` warns `MULTIPLE_OPTION_BRACKETS` and applies only the first bracket. Combine options in one bracket instead: `[grid;grid-color=red]||B313`.

A dropped option does not come back: `toString()` re-emits only what actually applies.

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
[key="value with ; or ] inside"]
```

A value containing `;`, `[`, `]`, `|`, a quote, or leading/trailing spaces is written in matching quotes (see [Option Values](/handbook/syntax-options/options-system#option-values)). `toString()` adds the quotes automatically, so such values survive a round-trip as data.

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

Each part is optional. Use only what you need. (The character and part brackets are separate scopes, so `[char][part]>CODE` is one bracket per scope, not a duplicate.)

## Warnings

Anything the parser has to drop or fix up is reported in `builder.warnings` with a stable code. See the [Warning Codes reference](/reference/warning-codes).
