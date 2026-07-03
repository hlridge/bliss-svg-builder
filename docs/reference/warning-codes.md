# Warning Codes

When the builder encounters a problem it can recover from, it renders everything that is valid and reports the problem in `builder.warnings`.

Each warning is an object with three fields:

```js
const builder = new BlissSVGBuilder('B431;ZZ9');
builder.warnings;
// [{ code: 'UNKNOWN_CODE',
//    message: 'Unknown or invalid code: "ZZ9"',
//    source: 'ZZ9' }]
```

- `code` — a stable identifier from the list below (the `WarningCode` type in TypeScript)
- `message` — a human-readable description, including how to fix the input
- `source` — the DSL fragment that triggered the warning

Match on `code` in application logic; `message` texts may be refined between releases.

## Naming Scheme

The prefix tells you what kind of problem occurred:

| Prefix | Meaning |
|--------|---------|
| `MALFORMED_` | Input did not parse in the required shape |
| `MISPLACED_` | A well-formed token in the wrong position |
| `MULTIPLE_` | More than one where only one is allowed (the first wins) |
| `DUPLICATE_` | The same identifier used twice |
| `UNKNOWN_` | An unrecognized reference |
| `DROPPED_` | Something discarded during an operation |
| `UNSUPPORTED_` | Valid input for a feature that is not implemented yet |
| `NOOP_` | A mutation call that had no effect |
| `…_AS_…` | An illegal operand in a slot (e.g. a word used as a part) |

## Malformed Input

### `MALFORMED_GLOBAL_OPTIONS`

Text before `||` that is not a valid `[options]` bracket. The options are ignored; the content renders.

```
color=red||B313        →  renders B313, the misspelled options are ignored
```

Correct form: `[color=red]||B313`.

### `MALFORMED_GROUP_OPTIONS`

Same as above at word scope: text before `|` that is not a valid `[options]` bracket.

```
color=red|B313         →  renders B313
```

Correct form: `[color=red]|B313`.

### `MALFORMED_WORD_INDICATOR`

A structurally invalid `;;`: it must be the trailing part of a word. The affected word fails to render (this is a structure error, not a droppable decoration).

```
B313;;B81/B1103        →  ;; is not at the end of the word
```

Correct form: `B313/B1103;;B81`.

The `applyIndicators()` overlay channel (group handle or object input) fires it too for a code carrying a character separator (a top-level `/`, e.g. `B81:1,2/B431`): the `;;` slot cannot hold such a code, so it is rejected and the existing overlay stays.

### `MALFORMED_COORDINATES`

A `:` suffix that is not a valid coordinate pair. The affected character fails to render.

```
B313:abc               →  not numbers
```

Correct forms: `B313:2,4`, `B313:2`, `B313:,4`.

### `MALFORMED_KERNING_VALUE`

An `RK:`/`AK:` kerning marker with a non-numeric value. The marker is ignored; the characters render at normal spacing.

```
B313/RK:x/B431         →  renders both characters, default spacing
```

## Misplaced Tokens

These fire when a well-formed token is attached to a unit whose granularity does not match. The token is dropped, the content still renders, and a dropped token is not re-emitted by `toString()`.

### `MISPLACED_HEAD_MARKER`

A head marker (`^`) on a code that expands to multiple characters, or on a space. `^` designates a single character as the word's head — a multi-character expansion has no single character to mark, and a space cannot be a head — so it is dropped.

```
MYWORD^                →  renders the word, marker dropped
TSP^                   →  renders the space, marker dropped
```

Mark a single character instead: `B313^/B1103`.

### `MISPLACED_CHARACTER_INDICATOR`

A `;` indicator on a code that expands to a whole word. `;` composes onto a single character; there is no single character for the indicator to land on. `applyIndicators()` on a glyph handle fires it too for a code spanning multiple characters (a top-level `/`).

```
MYWORD;B81             →  renders the word, indicator dropped
```

Use a word-level indicator instead: `MYWORD;;B81`.

### `MISPLACED_WORD_INDICATOR`

A word-level indicator (`;;`) on a space. A space carries no part of speech, so there is nothing for the indicator to modify: the whole overlay (including a `;;!` strip) is dropped and the space still renders.

```
TSP;;B81               →  renders the space, indicator dropped
```

Attach it to a word instead: `B313;;B81`.

### `MISPLACED_PART_OPTION`

A part option (`[opts]>`) on a code that expands to a whole word. `>` binds an option to a single part.

```
[color=red]>MYWORD     →  renders the word, option dropped
```

Use the scope that matches what you mean, e.g. `[color=red]||MYWORD`.

### `MISPLACED_CHARACTER_OPTION`

A character option on a code that expands to a whole word.

```
[color=red]MYWORD      →  renders the word, option dropped
```

A character option is valid only on a single character (a B-code, a composed character, or a code resolving to one).

### `MISPLACED_GROUP_OPTION`

A word option (`[opts]|`) on a code that expands to multiple words. The option is dropped and all the words render.

```
[color=red]|MYPHRASE   →  renders all words, option dropped
```

Written multi-word content is different: in `[color=red]|B313//B431` the bracket binds the first word by syntax, which is valid.

### `MISPLACED_GLOBAL_OPTION`

A canvas-wide option key placed at word, character, or part scope. These keys configure the whole SVG, so they only take effect at global scope (`[opts]||`); anywhere else the key is dropped and the content renders unchanged.

```
[margin=2]B313         →  renders B313, margin dropped
[grid]|B313//B431      →  renders both words, grid dropped
```

The canvas-wide keys: `margin`/`margin-*`, `crop`/`crop-*`, `grid` and all `grid-*` colors and stroke widths, `background`/`background-*`, `center`, `min-width`, `char-space`, `word-space`, `external-glyph-space`, `svg-title`, `svg-desc`, `svg-height`, `error-placeholder`.

## Duplicates

### `MULTIPLE_HEAD_MARKERS`

More than one `^` in the same word. The first marked glyph wins; the rest are dropped.

```
B313^/B1103^           →  head is B313
```

### `MULTIPLE_OPTION_BRACKETS`

Two option brackets at the same scope (global `||` or word `|`). Only the first bracket applies.

```
[grid][grid-color=red]||B313    →  grid renders, but not in red
```

Combine the options in one bracket instead: `[grid;grid-color=red]||B313`. (A character bracket followed by a part bracket, `[char][part]>CODE`, is two different scopes and is valid.)

### `DUPLICATE_KEY`

Two elements carry the same user-assigned `key` (for example in object input passed to the constructor). Keys identify elements for `getElementByKey()`, so they must be unique. Auto-generated keys never collide.

## Unknown References

### `UNKNOWN_CODE`

A code that is not a built-in and not defined. The affected character fails to render (or shows a placeholder with the `error-placeholder` option), but a well-formed unknown code is **kept** in serialized output so the data stays visible:

```
B291;ZZ9               →  warns, toString() still returns 'B291;ZZ9'
```

A token that is not even a valid code shape (for example `!B81`) cannot be represented and is dropped instead, also with `UNKNOWN_CODE`.

## Dropped Content

### `DROPPED_WORD_INDICATOR`

An operation had to discard a word-level indicator overlay. Currently this fires when `mergeWithNext()` merges two words that both carry a `;;` overlay: the merged word keeps the first word's overlay and drops the absorbed word's.

```js
const builder = new BlissSVGBuilder('B313;;B81//B431;;B86');
builder.group(0).mergeWithNext();
builder.toString(); // 'B313/B431;;B81' — the ;;B86 overlay was dropped, with a warning
```

## Unsupported Features

### `UNSUPPORTED_TEXT_BLOCKS`

More than one `{` in a single input — several `{...}` text blocks, or one block whose text itself contains a `{`. The current parser supports at most one trailing text block per input; beyond that, the content between braces can merge unpredictably.

## No-op Mutations

### `NOOP_INDICATOR_MUTATION`

An `applyIndicators()` / `clearIndicators()` call that could not change anything: a clear with nothing to remove (a glyph with no indicators, or a group with no `;;` overlay), a target that cannot carry an indicator (a space glyph; a space word given a word-level indicator), or a glyph whose parts are not a valid indicator pattern. The warning replaces a silent no-op.

```js
new BlissSVGBuilder('B313').glyph(0).clearIndicators();
// nothing to clear → warning, no change

new BlissSVGBuilder('B313/B1103').group(0).clearIndicators();
// no ;; overlay to remove → warning, no change
```

Invalid *codes* passed to `applyIndicators()` are a different case: each one warns individually (`NON_INDICATOR_AS_CHARACTER_INDICATOR` / `UNKNOWN_CODE`, below), and a call whose codes are all invalid is refused without touching the element (one exception: on a group handle, `{ stripSemantic: true }` is itself valid overlay content, so that call still stores the `;;!` strip overlay — matching the DSL `WORD;;!ZZ9`, where the bad code drops and the `!` stays). An *empty* apply (`applyIndicators('')`) is not a no-op case either: it is the deliberate empty indicator set and stays silent on any target that can carry indicators — a space target still warns the structural no-op above.

## Illegal Operands

### `WORD_AS_PART`

A `;`-part references a code that expands to a whole word. A part must be a single drawable unit, so the affected character fails to render. The reference is kept in serialized output.

```
B291;MYWORD            →  warns, the character fails to render
```

### `COMPOSITE_AS_PART`

A `;`-part references a plain (typeless) defined code that expands to several parts. Same handling as `WORD_AS_PART`. A code defined as a **glyph** or **shape** is one atomic part and is valid in a `;`-slot even when its definition composes several parts; only the bare alias has no single-part identity to compose.

### `NON_INDICATOR_AS_WORD_INDICATOR`

A word-level indicator slot (`;;` in the DSL, or `group.applyIndicators()`) received a recognized code that is not an indicator. The code is dropped; the word renders without it.

```
B313/B1103;;B291       →  B291 is a base character, not an indicator → dropped
```

```js
builder.group(0).applyIndicators('B291'); // same rule on the API
```

An *unrecognized* code in the same slot warns `UNKNOWN_CODE` instead.

### `NON_INDICATOR_AS_CHARACTER_INDICATOR`

The same rule one level down: a glyph-level `applyIndicators()` call received a recognized code that is not an indicator. Each such code warns and cannot be applied.

```js
new BlissSVGBuilder('B431;B81').glyph(0).applyIndicators('C8');
// C8 is a shape, not an indicator → warned, not applied
```

A mixed call applies its valid subset (replacing the existing grammatical indicators) and warns per rejected code. A call whose codes are *all* invalid is refused: the glyph keeps its existing indicators unchanged. An unknown code in the same call warns `UNKNOWN_CODE`.
