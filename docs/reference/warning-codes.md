# Warning Codes

When the builder encounters a problem it can recover from, it renders everything that is valid and reports the problem in `builder.warnings`.

For the workflow of checking errors and warnings in code, including which calls throw versus warn, see [Error Handling](/reference/api-documentation#error-handling).

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

Match on `code` in application logic; `message` texts may be refined between releases. The list below can grow in minor releases (existing code meanings never change within a major version), so handle unrecognized codes gracefully.

## Naming Scheme

The prefix tells you what kind of problem occurred:

| Prefix | Meaning |
|--------|---------|
| `MALFORMED_` | Input did not parse in the required shape |
| `OUT_OF_RANGE_` | A well-formed number outside what the attribute can carry |
| `MISPLACED_` | A well-formed token in the wrong position |
| `MULTIPLE_` | More than one where only one is allowed (the first wins) |
| `DUPLICATE_` | The same identifier used twice |
| `UNKNOWN_` | An unrecognized reference |
| `DROPPED_` | Something discarded during an operation |
| `UNSUPPORTED_` | Valid input for a feature that is not implemented yet |
| `NOOP_` | A mutation call that had no effect |
| `UNSAFE_` | Refused by a safety gate rather than by the grammar |
| `RESERVED_` | Refused because the name belongs to the library |
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

A structurally invalid `;;`: it must be the trailing part of a word. The whole word is dropped from render and from both `toString()` and `toJSON()` (malformed syntax is not content; the warning is its only trace).

```
B313;;B81/B1103        →  ;; is not at the end of the word
```

Correct form: `B313/B1103;;B81`.

The `applyIndicators()` overlay channel (group handle or object input) fires it too for a code carrying a character separator (a top-level `/`, e.g. `B81:1,2/B431`): the `;;` slot cannot hold such a code, so it is rejected and the existing overlay stays.

### `MALFORMED_COORDINATES`

A `:` suffix that is not a valid coordinate pair. The whole character is dropped from render and from both `toString()` and `toJSON()`: a malformed part fails the entire character, since keeping the rest could silently form a different valid character.

```
B313:abc               →  not numbers
```

Correct forms: `B313:2,4`, `B313:2`, `B313:,4`.

The same code covers a position **option** whose value is not a number, at any scope. There the option alone is ignored and the content still renders, because a broken decoration should not destroy valid content:

```
[x=abc]B313            →  warns, renders B313 unmoved
[x=abc]>B313:3,7       →  warns, the part keeps the 3,7 written beside it
[x]B313                →  warns: a bare key carries no value to position with
```

### `MALFORMED_KERNING_VALUE`

An `RK:`/`AK:` kerning marker with a non-numeric value. The marker is ignored; the characters render at normal spacing.

```
B313/RK:x/B431         →  renders both characters, default spacing
```

## Values Out of Range

### `OUT_OF_RANGE_STROKE_WIDTH`

A `stroke-width` that parses as a number but that nothing can draw with. Any width you can draw is yours, at any scope, including a very heavy one; these two are refused because the width also sizes dot glyphs, where it becomes a radius, so an undrawable width can drop a whole glyph rather than just thicken a line.

```
[stroke-width=-2]||B291         →  warns, 0 is drawn (a legal, invisible stroke)
[stroke-width=Infinity]||B291   →  warns, the default 0.5 is drawn
```

A negative width is floored to `0`; a non-finite one is ignored and the default stands. A width that is not a number at all (`[stroke-width=abc]`) is not covered by this code: it falls back to the default in silence, as it always has.

The written value is kept in the composition, so it survives `toString()` and reports again when the composition is parsed back.

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

A character option where no single character can take it: on a code that expands to a whole word, or a bracket without `>` inside a `;`-part slot (a bracket without `>` is a character option by syntax; a part takes `[opts]>`).

```
[color=red]MYWORD      →  renders the word, option dropped
B291;[color=red]B81    →  renders both parts, option dropped
```

A character option is valid only on a single character (a B-code, a composed character, or a code resolving to one). To style a single part, use the part scope: `B291;[color=red]>B81`.

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

### `MISPLACED_KERNING_OPTION`

The mirror image of the one above: a kerning option (`relative-kerning`, `absolute-kerning`, in either the kebab or camel spelling) written at part, word, or global scope. Kerning is the gap **before a character**, so those scopes have nothing for it to do; the key is dropped and the content renders unchanged.

```
[relative-kerning=3]>B291   →  renders B291, kerning dropped
[absolute-kerning=4]||B291  →  renders B291, kerning dropped
B99/[relative-kerning=3]B291 →  valid: character scope is where kerning lives
```

Any other option in the same bracket is kept, so `[relative-kerning=3;color=red]>B291` still renders the part in red.

Dropping it is what keeps it out of the drawing. An option key the library does not recognize at a given scope is passed through to the SVG as an attribute (that is what `[data-*]` options are for), so leaving a misplaced kerning option in place would put `relative-kerning="3"` into the output, where it means nothing to any renderer. An unrecognized key still passes through, warning-free, exactly as before.

### `MISPLACED_LAYER_OPTION`

A layer-targeting option (`grid--opacity`, `content--color`, anything with a `--` in its key) written at part, word, or character scope. The layers belong to the document as a whole, so below global scope there is nothing for the key to name; it is dropped and the content renders unchanged.

```
[grid--opacity=0.3]|B291   →  renders B291, the layer key dropped
[grid;grid--opacity=0.3]||B291 →  valid: global scope is where layers live
```

Any other option in the same bracket is kept, so `[grid--opacity=0.3;fill=red]|B291` still renders the word filled red.

Dropping it is what keeps it out of the drawing. An unrecognized key is passed through to the SVG as an attribute, so leaving the layer key in place would put `grid--opacity="0.3"` into the output, where it means nothing to any renderer. To style just that element, write the attribute without a prefix.

### `MISPLACED_LINK_ATTRIBUTE`

A link attribute written for a layer: `href`, `target`, `rel`, `download`, `hreflang`, `type` or `referrerpolicy` behind a `background--`, `grid--` or `content--` prefix. A link is an `<a>` element wrapping the content it links, and no layer is one, so the attribute is dropped.

```
[content--href=https://example.com]||B291   →  warns, no attribute emitted
[background=beige;background--href=…]||B291 →  warns, no attribute emitted
```

The layer channel emits an attribute name exactly as written, and this is one of the few places it refuses instead. Emitted, these attributes sit on a plain `<g>` or `<rect>`, where every engine ignores them, so the markup would read as a link that had simply stopped working. The written key survives `toString()`, so it re-reports rather than disappearing from a stored composition.

### `MISPLACED_SPACE_DECORATION`

A coordinate (`:x,y`) or a scope-valid option (`[opts]`, `[opts]>`, or `[opts]|`) on a space (`TSP` or `QSP`). A space is a pure word-separator with no ink to position or style, so the decoration is dropped and the space keeps its identity and width.

```
QSP:1,2                →  renders a plain quarter-space, coordinate dropped
[color=red]|TSP        →  renders a plain space, option dropped
```

A global-only option key on a space (`[grid]|QSP`) is reported by `MISPLACED_GLOBAL_OPTION` instead: its scope, not the space, is the mismatch. The space still keeps its identity either way. For a positionable or styleable blank, use `ZSA` instead: it is inkless content, so it keeps its coordinate and options.

### `MISPLACED_INDICATOR_PART`

An indicator part written before a character's base content. A character is written as its base parts followed by its indicators (`BASE;INDICATOR`); an indicator anywhere else has no meaning in Bliss, so it is dropped and the rest of the character renders.

```
B86;B291               →  renders B291, indicator dropped
B291;B86;C8            →  renders B291;C8, indicator dropped
```

Write the indicators last instead: `B291;C8;B86`. Two things never trigger this warning: content you explicitly position at a non-origin coordinate (`B86;SDOT:3,4` is hand-placed artwork and is kept as written), and an unknown code after the indicator (it may later resolve to an indicator, so the sequence is kept).

### `MISPLACED_SPACE`

A space (`TSP`, `QSP`, or the default space `SP` that `//` expands to) written as a `;`-part. A space separates words; it is not a shape a character can be composed from, so the space part is dropped (along with any coordinate or option on it) and the rest of the character renders.

```
B313;QSP               →  renders B313, space part dropped
B313;SP                →  renders B313, space part dropped
B313;[color=red]>QSP   →  renders B313, space part and option dropped
```

Write the space between words instead (`B313//B431`, or `B313/QSP/B431` for an explicit quarter-space). For a positionable blank inside a character, use `ZSA`: it is inkless content, so `B313;ZSA:10,0` keeps its part and position. One thing never triggers this warning: a space beside only unknown codes (`TSP;ZZ9`) is kept, because the character's content is uncertain until those codes resolve. If a mutation strips a character down to a lone `SP`, it drops to an empty character for the same reason.

## Duplicates

### `MULTIPLE_HEAD_MARKERS`

More than one `^` in the same word. The first marked glyph wins; the rest are dropped.

```
B313^/B1103^           →  head is B313
```

### `MULTIPLE_OPTION_BRACKETS`

More than one option bracket at the same scope. Only the first bracket applies; the content still renders. This holds at every scope: global `||`, word `|`, character, and part `>`.

```
[grid][grid-color=red]||B313    →  grid renders, but not in red
[color=red][fill=green]B313     →  red, not green
[color=red]>[fill=green]>B313   →  red, not green
```

Combine the options in one bracket instead: `[grid;grid-color=red]||B313`. At character and part scope one warning is emitted per ignored bracket, naming it; at global and word scope a single warning names the whole run.

Brackets at *different* scopes are not duplicates and are valid: a character bracket followed by a part bracket (`[char][part]>CODE`) applies both, warning-free, as does `[global]||[word]|CODE`. The `>` is what marks the part scope, so it is what tells the two cases apart.

### `MULTIPLE_POSITION_VALUES`

One element positioned twice. A part option (`[x=N;y=M]>`) and the coordinate suffix (`CODE:x,y`) both place the part inside its character, so they are two spellings of one value. The option wins, and the value it overrides is named:

```
[x=5;y=10]>B291:3,7    →  the part sits at 5,10; ":3,7" is ignored
[x=5]>B291:3,7         →  the part sits at 5,7;  ":3" is ignored
[x=3;y=7]>B291:3,7     →  no warning: the two spellings agree
```

In written text a part is the only place this can happen, since `CODE:x,y` is the only other spelling there is. Object input can carry both channels at any level (an `x` beside an `options.x` on the same node), so the message names the level: "A part / character / word / composition takes one position".

Setting a position through the API replaces the one the element carries rather than competing with it, so `glyph.setOptions({ x: 7 })` on a character already carrying `[x=5]` is silent.

A character-scope `[x=N]` is not a duplicate of a part coordinate. It is a different level (leading blank on the character, see [Positioning](/handbook/appearance/positioning)) and composes with the part's own position, so `[x=2]B291:3,0` puts ink at 5 with nothing reported.

### `MULTIPLE_KERNING_VALUES`

One character kerned more than once. `RK:`/`AK:` and the `[relative-kerning=N]` / `[absolute-kerning=N]` options are spellings of a single value, so one of them survives: an option beats a marker, and among equals the last one written wins. Every value that loses is named:

```
B99/AK:4/RK:3/B291                    →  kerns by RK:3; "AK:4" is ignored
B99/RK:3/AK:4/B291                    →  kerns by AK:4; "RK:3" is ignored
B99/RK:3/[absolute-kerning=4]B291     →  kerns by the option; "RK:3" is ignored
```

A definition's `defaultOptions` is a default, so a value written on the character overrides it silently. That is what a default is for.

### `MULTIPLE_GEOMETRY_VALUES`

The `viewBox` written directly at global scope while `margin`, `crop`, `min-width` or `center` is also set. Those options exist to compute the viewBox, so a written one replaces what they produced, and each option it displaced is named:

```
[margin=2;viewBox="0 0 10 10"]||B291  →  uses the written viewBox; "margin" is named
[viewBox="0 0 10 10"]||B291           →  silent: nothing was displaced
[margin=2]||B291                      →  silent: nothing was overridden
```

Remove the `viewBox` to size the picture with the options, or remove the options to size it by hand.

### `DUPLICATE_KEY`

Two elements carry the same user-assigned `key` (for example in object input passed to the constructor). Keys identify elements for `getElementByKey()`, so they must be unique. Auto-generated keys never collide.

## Unknown References

### `UNKNOWN_CODE`

A code that is not a built-in and not defined. The affected character fails to render (or shows a placeholder with the `error-placeholder` option), but a well-formed unknown code is **kept** in serialized output so the data stays visible:

```
B291;ZZ9               →  warns, toString() still returns 'B291;ZZ9'
```

A token that is not even a valid code shape (for example `!B81`) cannot be represented. It is malformed syntax rather than content, so the **whole character** is dropped from render and from both `toString()` and `toJSON()`, also with `UNKNOWN_CODE`. (Only the *bad* part is not dropped in isolation: keeping the rest, `B291;!B81` -> `B291`, could silently form a different valid character.)

### `UNKNOWN_LAYER`

A global option written in `<layer>--<attribute>` form that does not resolve to a layer and an attribute. The layers are `background`, `grid` and `content`; the three ways a key can miss share one code and each says which one it is:

```
[foo--x=1]||B291       →  warns: names no layer the library knows
[--x=1]||B291          →  warns: no layer name before the "--"
[content--=red]||B291  →  warns: names the content layer but no attribute
```

The test is a layer this library **knows**, not one it happens to be drawing. `[grid--opacity=0.3]||` with the grid switched off is silent and emits nothing, exactly as the named `[grid-color=red]` is silent there.

Like `UNKNOWN_CODE`, the key is **kept** in serialized output: `foo` may be a layer this library emits later, and dropping the key would lose what you wrote. To put the attribute on the whole picture, write it without a prefix.

## Refused Because the Name Is the Library's

### `RESERVED_ATTRIBUTE_NAME`

An option naming one of the two attributes the library owns: `xmlns` and `data-generator`. The written value is dropped and the library's own is kept.

```
[xmlns=http://example.com]||B291         →  warns, the SVG namespace is kept
[data-generator=me]||B291                →  warns, the library's stamp is kept
[content--xmlns=http://example.com]||B291 →  warns: xmlns is refused on a layer too
```

The two are guarded at different reaches, because they are refused for different reasons.

`xmlns` has exactly one legal value, and it is refused **on every layer**, not only on the root: a second namespace declaration moves that whole subtree out of SVG, so browsers will not render it and this library's own `svgElement` cannot parse it. A bad value is one thing; a document that is no longer SVG is something else.

`data-generator` is refused **on the root only**. It records what produced the file, and a stamp anyone can overwrite tells a reader nothing. On an inner layer the same name collides with nothing, so `[content--data-generator=me]||` is an ordinary data attribute and is emitted. To record your own pipeline on the root, add a `data-` attribute of your own.

Every other root attribute is yours, including `width`, `height` and `viewBox`, which replace the computed values when you write them.

## Dropped Content

### `DROPPED_WORD_INDICATOR`

An operation had to discard a word-level indicator overlay. It fires when `mergeWithNext()` merges two words that both carry a `;;` overlay (the merged word keeps the first word's overlay and drops the absorbed word's), and when a structural mutation — or object input — leaves an overlay on a word that consists only of spaces (a space cannot carry a word indicator, so the overlay is dropped instead of being stored and silently eaten by the `//` serialization).

```js
const builder = new BlissSVGBuilder('B313;;B81//B431;;B86');
builder.group(0).mergeWithNext();
builder.toString(); // 'B313/B431;;B81' — the ;;B86 overlay was dropped, with a warning

const spaced = new BlissSVGBuilder('B313;;B81');
spaced.group(0).replaceGlyph(0, 'TSP');
spaced.toString(); // '//' — the word became a space; ;;B81 was dropped, with a warning
```

## Unsupported Features

### `UNSUPPORTED_TEXT_BLOCKS`

A `{...}` text block in the input. Text blocks parse but do not render yet and are dropped from `toString()` output, so every block warns until text rendering ships. Several blocks in one input additionally have undefined parse behavior (the content between braces can merge across blocks). A `{` inside a quoted option value is plain text and never counts.

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

## Refused by a Safety Gate

### `UNSAFE_ATTRIBUTE_NAME`

An attribute name that can never be emitted: an `on*` event handler, or a name containing anything outside letters, digits and dashes. Such a name is skipped at render wherever it appears, so nothing can execute; this warning exists because the skip used to be silent, leaving an author with a key they had every reason to think was working.

It is reported at every scope, and for the layer form the name after the `--` is what is judged:

```
[onclick=alert(1)]||B291         →  warns, nothing emitted
[onclick=alert(1)]|B291          →  same at word scope
[onclick=alert(1)]B291           →  same at character scope
[onclick=alert(1)]>B291          →  same at part scope
[content--onclick=alert(1)]||    →  same, judged on "onclick"
[__proto__=x]||B291              →  warns: the name must start with a letter
```

```js
builder.part(0).setTransientOptions({ 'on-click': 'x' });
// warns, and nothing is emitted; other keys in the same call are kept
```

Other options in the same bracket are kept, and the refused key **survives `toString()`**, so it re-warns when the composition is read back rather than disappearing from stored data without trace.

## Misplaced Channel

### `MISPLACED_TRANSIENT_OPTION`

An option key set through [`setTransientOptions`](/reference/api-documentation#transient-options) that the library reads while *building* the composition rather than while *drawing* it, so a transient spelling could never reach the picture: `x`, `y`, `relativeKerning` and `absoluteKerning` (in either spelling), and `key`. The key is dropped and reported rather than left looking as though it worked. Set it with `setOptions` instead.

```js
builder.part(1).setTransientOptions({ x: 5 });
// warns; the part does not move. Use setOptions({ x: 5 }).
```

A transient option written on a space is a different case and reports `MISPLACED_SPACE_DECORATION`, exactly as a normal option on a space already does.

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

A custom code counts as an indicator when it resolves to one through single-code aliases: after `define({ MYIND: { codeString: 'B81' } })`, `WORD;;MYIND` applies like `WORD;;B81`. An alias to a multi-code composition does not resolve this way and still warns (define it as a `type: 'glyph'` flagged `isIndicator: true` instead).

### `NON_INDICATOR_AS_CHARACTER_INDICATOR`

The same rule one level down: a glyph-level `applyIndicators()` call received a recognized code that is not an indicator. Each such code warns and cannot be applied.

```js
new BlissSVGBuilder('B431;B81').glyph(0).applyIndicators('C8');
// C8 is a shape, not an indicator → warned, not applied
```

A mixed call applies its valid subset (replacing the existing grammatical indicators) and warns per rejected code. A call whose codes are *all* invalid is refused: the glyph keeps its existing indicators unchanged. An unknown code in the same call warns `UNKNOWN_CODE`.
