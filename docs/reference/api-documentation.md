# API Documentation

JavaScript API reference for Bliss SVG Builder.

## Constructor

```js
new BlissSVGBuilder()
new BlissSVGBuilder(input)
new BlissSVGBuilder(input, options)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string`, `object`, or omitted | DSL input string, a plain object from `toJSON()`, or omitted for an empty builder |
| `options` | `object` | Flat options (applied as overrides), or `{ defaults, overrides }` for full control (optional) |

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

// Empty builder
const builder = new BlissSVGBuilder();
builder.addGlyph('B313');

// From a DSL string
const fromDSL = new BlissSVGBuilder('B313');

// With options
const styled = new BlissSVGBuilder('B313', { color: 'red', strokeWidth: 0.6 });
```

When you need separate defaults and overrides, use the structured format:

```js
const styled = new BlissSVGBuilder('B313', {
  defaults: { color: 'red', grid: true },  // applied if not set in DSL
  overrides: { strokeWidth: 0.6 }           // always applied
});
```

Options use camelCase keys and native JS types, and the hyphenated spelling a DSL string uses is accepted here too. See [Programmatic Options](/handbook/syntax-options/programmatic-options) for the full key mapping and precedence rules, and [which name is emitted](/handbook/syntax-options/svg-pass-through#which-name-is-emitted) for how a pass-through attribute is spelled. A non-object `options` argument (a string, number, boolean, or array) throws a `TypeError`; `null` and `undefined` mean "no options" (see [error handling](#error-handling)).

### Round-trip from toJSON()

The constructor also accepts the plain object returned by `toJSON()`, recreating an identical builder (from one saved with `{ omitOptions: true }`, the same builder [without its options](#saving-without-options)):

```js
const original = new BlissSVGBuilder('B313/B1103//B431');
const snapshot = original.toJSON();

// Later: rebuild from the snapshot
const rebuilt = new BlissSVGBuilder(snapshot);
rebuilt.svgCode; // identical output
```

An object you build by hand is read in the shape `toJSON()` writes: a composition `{ groups }`, a word `{ glyphs }`, a character `{ parts }`, a part `{ codeName }`. A `groups` or `glyphs` list you leave out is read as empty, so `{ options: { color: 'red' } }` is an empty composition in red. Something of the wrong shape where a word, a character or a part belongs is left out and reported with [`MALFORMED_ELEMENT`](/reference/warning-codes#malformed-element).

## SVG Output

Four properties for getting the rendered SVG in different formats:

### `svgCode`

Returns the SVG as a string, the most common output for embedding in HTML:

```js
const builder = new BlissSVGBuilder('B313');
const svg = builder.svgCode;
// '<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'
```

Use for: HTML embedding, server-side rendering, string manipulation.

### `svgElement`

Returns the SVG as a DOM element (browser only):

```js
const builder = new BlissSVGBuilder('B313');
document.body.appendChild(builder.svgElement);
```

Use for: direct DOM insertion, event handling on SVG elements.

### `standaloneSvg`

Returns the SVG with an XML declaration, suitable for saving as `.svg` files:

```js
const builder = new BlissSVGBuilder('B313');
const fileContent = builder.standaloneSvg;
// '<?xml version="1.0" encoding="utf-8"?>\n<svg ...>...</svg>'
```

Use for: `.svg` file export, standalone SVG documents.

### `svgContent`

Returns only the composition's own markup (paths, and the backgrounds, groups and links of word, character and part options, along with the `<filter>` elements their [CSS filters](/handbook/syntax-options/svg-pass-through#using-css-filter) are drawn with), without the `<svg>` wrapper and without anything a global option adds, such as the painting defaults, a global link or a global filter:

```js
const builder = new BlissSVGBuilder('B313');
const inner = builder.svgContent;
// '<path d="..."/>' or '<g ...>...</g>'
```

Use for: compositing into larger SVG documents, extracting raw path data.

## Serialization

### `toJSON(options?)`

Returns a normalized plain object representing the parsed composition; custom code names follow the serialization rules below. Feed this back into the constructor to recreate an identical builder:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
const obj = builder.toJSON();
// {
//   options: {},
//   groups: [
//     { glyphs: [
//       { parts: [{ codeName: 'B313' }], codeName: 'B313' },
//       { parts: [{ codeName: 'B1103' }], codeName: 'B1103' }
//     ]},
//     { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
//     { glyphs: [{ parts: [{ codeName: 'B431' }, { codeName: 'B81', isIndicator: true, width: 2 }] }] }
//   ]
// }
```

Every `options` bag in that object uses the spelling its owner publishes, whichever way you wrote the option: camelCase for the library's own options (`marginTop`), the standard's own spelling for a name SVG or ARIA defines (`viewBox`, `stroke-dasharray`, `aria-label`), and exactly what you typed for a name of your own. The library's own options are the only ones the two serializations spell differently: `toString()` writes them with dashes, which is how you would type them in a string. Both spellings are read back, so a snapshot saved under the older keys still loads and draws the same picture.

By default, nested sub-parts are stripped for a cleaner structure. Each part keeps its `codeName`, position (`x`, `y`), and metadata (`isIndicator`, `width`) but no internal rendering tree. The constructor re-expands parts automatically when given an object, so round-trips work without `deep`:

```js
const snapshot = builder.toJSON();
const rebuilt = new BlissSVGBuilder(snapshot);
rebuilt.svgCode === builder.svgCode; // true
```

Pass `{ deep: true }` to preserve the full nested parts tree (useful for inspection or debugging):

```js
builder.toJSON({ deep: true });
// Parts include nested sub-parts all the way down to primitives
```

Custom code behavior:
- Default output decomposes custom names to built-in codes wherever they are used, a part of another character included, and each part it produces carries the options its definition gives. Where those codes alone would draw an indicator elsewhere than it was drawn, the part, or the word's `;;` code, carries the position it was drawn at, and the character that carries a word's `;;` indicators is marked `isHeadGlyph: true` where a reload would pick another head, as in [`toString()`](#tostring-options). A shape drawn by its own `getPath` function and an external glyph have no built-in form, so they keep their names even by default (re-parsing those needs the same definition registered).
- Pass `{ preserve: true }` to keep custom names, under the same rule as [`toString()`](#tostring-options): a name is kept when it stands for a single glyph, indicator, or shape.

```js
BlissSVGBuilder.define({ 'LOVE': { type: 'glyph', codeString: 'B431' } });

new BlissSVGBuilder('LOVE').toJSON();                     // codeName: 'B431'
new BlissSVGBuilder('LOVE').toJSON({ preserve: true });   // codeName: 'LOVE'
```

Word-level indicator behavior:
- A word-level indicator (`;;`) is carried as a reversible `wordIndicators: { codes, stripSemantic }` field on its group, not baked onto a glyph's parts. The round-trip keeps it.
- A `;;` code named by a custom definition is written in `codes` as the built-in indicator codes it draws (`['B99']` for `{ codeString: 'B99' }`); one that spells out into a plain shape, which a `;;` list cannot hold, becomes a part of the head glyph that keeps `isIndicator`. `preserve` keeps the name.
- Pass `{ flattenIndicators: true }` to bake the overlay onto the head glyph's parts and omit the `wordIndicators` field (the decomposed primitive form). `flattenIndicators` is independent of `preserve` and composes with it.

```js
new BlissSVGBuilder('B313/B1103;;B81').toJSON().groups[0].wordIndicators;
// { codes: ['B81'], stripSemantic: false }

const flat = new BlissSVGBuilder('B313/B1103;;B81').toJSON({ flattenIndicators: true });
flat.groups[0].wordIndicators;                            // undefined
flat.groups[0].glyphs[0].parts.map(p => p.codeName);      // ['B313', 'B81']
```

Options behavior:
- Pass `{ omitOptions: true }` to save the composition [without its options](#saving-without-options), the same ones `toString()` leaves out: no options bag keeps one, and characters, words and the composition lose their `x` and `y`, while a part keeps its own. Two things stay: a character's kerning, which saved JSON always keeps in its options bag, and the options a code brings by its definition (the dotted line of `REFSQUARE`, or a custom definition's own options on the parts it is decomposed into).

### Indicators in the tree

Character-level indicators (`;`) appear as parts within their parent glyph, marked with `isIndicator: true`. A word-level indicator (`;;`) is stored on its group as a `wordIndicators` overlay and resolved onto the head glyph only at render time, so by default the parts tree shows the base glyphs unchanged and the overlay lives in the group's `wordIndicators` field. Flatten it onto the head with `{ flattenIndicators: true }` if you need the indicator as an actual part.

Use for: inspecting parsed structure, storing snapshots, server-side processing.

### `toString(options?)`

Returns a portable DSL string representation of the composition:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
builder.toString();
// 'B313/B1103//B431;B81'
```

Serialized spacing always matches rendered spacing: adjacent space groups serialize as one coalesced run, and every space in that run is written on its own. A space that matches its position's default is a bare separator, so a run of N default spaces emits N+1 slashes; a space that differs (like `QSP` between words, where the default is `TSP`) keeps its name while the spaces around it stay compact. `H/TSP/QSP/TSP/H` therefore comes back as `H//QSP//H`. [Empty slots](#empty-slots-are-deliberate) contribute nothing. A bare empty group or glyph has no DSL token of its own, so it is omitted from the string (an options-carrying empty does have one: `[color=red]|` for a group, `[color=red]` for a glyph, unless the options are [left out](#saving-without-options)); use `toJSON()` when empty slots must survive a round-trip.

Words with no space between them, which the [raw element methods](#raw-element-methods) can leave, are written as one word, since a space is what makes two, the way [`.mergeWithNext()`](#mergewithnext) leaves them: the first word's options, `;;` indicators and `^` hold for the whole word, and a later word's are left out. `[color=red]|B313` then `B431;;B81` is written `[color=red]|B313/B431`. `toJSON()` keeps the two words.

A word written with the `X` shorthand comes back in that shorthand. `Xhello` parses into one glyph per letter and serializes as `Xhello`, not as `Xh/Xe/Xl/Xl/Xo`. A letter that carries something of its own (an option, a coordinate, a head marker) is written out on its own, because the compact form has nowhere to put it, but the letters beside it still join up: `Xa/[color=red]>Xb` stays as written, while `Xa^/Xb/Xc` comes back as `Xa^/Xbc`. Both spellings render the same image and parse back to the same composition; the compact one is just the one you would have typed.

The options a code brings by its definition are part of the code, so they are not written out where the name brings them. `REFSQUARE` and `ANCHORRING` draw a dotted line by definition, and `REFSQUARE` comes back as `REFSQUARE`, dotted line and all. A look you set yourself is written as usual (`[stroke-dasharray=4 4]>REFSQUARE`); to draw the square solid, write `[stroke-dasharray=none]>REFSQUARE`. A [custom definition's own options](/handbook/writing/custom-codes#a-definition-s-own-options) work the same way under `preserve`; where the default output spells the code out in built-in codes, they are written as a part bracket on what they style (`[color=red]>B291`).

Custom code behavior: custom names are decomposed to built-in codes by default. `{ preserve: true }` keeps a custom name when the name stands for a single glyph, indicator, or shape. That covers every code defined with a `type` (such a definition is itself a glyph, indicator, or shape, whatever its anatomy) and every bare alias of one existing code, with or without a position (a `codeString` of `B431` or `B431:1,0`). A `codeString` that combines several codes is shorthand for the composition it spells out; shorthand always serializes expanded, with or without `preserve`. A name is kept only while reading it back draws what you have: a change you make where the name is used is written beside it (`[color=blue]>SMILEY`, `SMILEY:3,4`, `SMILEY;B81`), and the options its definition gives are not written again. A glyph the name no longer describes, such as a composition object holding other parts than the definition draws, is written out in full, so the string reloads to what you see.

Where the built-in codes alone would draw an indicator elsewhere than it was drawn (a glyph with an anchor of its own, a compound indicator broken into its parts), the decomposed output writes the position it was drawn at, on that part and axis only; where a reload would put a word's `;;` indicators on another character, it marks the head with `^` (see [Head Marker Resolution](#head-marker-resolution)). A word-level (`;;`) code named by a custom definition is written as the built-in codes it draws; one that spells out into a plain shape, which a `;;` list cannot hold, is written as a part of the head where it was drawn (`B291;;MYIND` comes back as `B291;C2:3`). [Serializing Custom Indicators and Shapes](/handbook/writing/custom-codes#serializing-custom-indicators-and-shapes) has the cases.

```js
BlissSVGBuilder.define({
  'SMILEY': { type: 'glyph', codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14' },
  'ANC': { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 }
});

new BlissSVGBuilder('SMILEY').toString();
// 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'

new BlissSVGBuilder('SMILEY').toString({ preserve: true });
// 'SMILEY'

new BlissSVGBuilder('ANC;B81').toString();
// 'B291;B81:,2' (B81 where ANC's own anchor placed it)
```

Which mode to use:

- **Default** for output that leaves your environment: files, APIs, other Bliss tools. It spells your definitions out in built-in codes as well as they allow, so any receiver renders it without your definitions, usually with the same ink. A shape drawn by its own `getPath` function has no built-in form and keeps its name.
- **`{ preserve: true }`** for output that stays where your definitions live: app-local storage, a document you reload in the same app. You get your own names back on re-parse, including a name that aliases a single primitive (`MYIND` for `C2`).

Definition *metadata* does not travel in the default **string**: decomposition keeps the ink, and where it was drawn, but the `toString()` form drops fields like `isIndicator`, so a custom indicator serializes to its plain anatomy, which re-parses as ordinary ink, not as an indicator: with `MYIND` defined `{ type: 'glyph', isIndicator: true, codeString: 'C2' }`, `B291;MYIND` comes back as `B291;C2:3`. (`toJSON()` is different: each part it decomposes into keeps `isIndicator` and `width`, so a rebuilt builder places a custom indicator as an indicator, though a compound one arrives as separate parts rather than one unit.) When the string form must stay an indicator, run the same `define()` calls in the receiving environment, or keep the string local and use `preserve`. See [Serializing Custom Indicators and Shapes](/handbook/writing/custom-codes#serializing-custom-indicators-and-shapes) for the full behavior table.

### Word-level indicators in the output

A word-level indicator (`;;`) is kept in `toString()` output by default, because `;;` is universal DSL grammar (every builder parses it and it resolves to the same render), so keeping it is portable and lossless:

```js
const builder = new BlissSVGBuilder('B313/B1103;;B81');
builder.toString();
// 'B313/B1103;;B81' — the ;; overlay is preserved
```

Pass `{ flattenIndicators: true }` to collapse `;;` onto the head glyph as character-level `;` (the decomposed primitive form, which is what the builder used to emit by default before the overlay model):

```js
builder.toString({ flattenIndicators: true });
// 'B313;B81/B1103' — indicator baked onto the head glyph
```

Both forms render an identical image; passing either back into the constructor reproduces the same result. `flattenIndicators` governs word *structure* (`;;`) and `preserve` governs local *names* (aliases / custom glyphs); they are independent and compose (see [Combining the serializer options](#combining-the-serializer-options)).

### Saving without options

An option is anything `toString()` writes inside a `[...]` bracket, at any scope. Pass `{ omitOptions: true }` to leave the options out and keep the content: every code, part and separator, word-level indicators, the head marker, a part's coordinates and kerning.

```js
const builder = new BlissSVGBuilder('[color=red;grid]||[stroke-width=0.8;x=2]|B291;[color=green]>C8:3,4/RK:2/[x=2]B313');
builder.toString({ omitOptions: true });
// 'B291;C8:3,4/RK:2/B313'
```

That hands back what was written without the styling somebody added, so your app can apply its own, or gives you the string without its global options.

A part's position or a kerning value entered as an option keeps its own spelling, which sits outside a bracket: `[x=1]>C8` comes back as `C8:1`, and `B291/[relative-kerning=2]B313` as `B291/RK:2/B313`. The position of a character, a word or the whole composition has no spelling outside a bracket, so it goes, and ink that an option placed or spaced moves: `[char-space=4]||B291/B291` comes back as `B291/B291`, with the two characters closer together. Options written inside a word-level indicator go too (`B291;;[x=2;color=red]>B81` comes back as `B291;;B81:2`), and a character that holds nothing but options goes with them, a head marker on it included: `[color=red]^/B291;;B81` comes back as `B291;;B81`, so the indicator moves to `B291`. Kerning keeps such a character, written `[]` after its marker: `RK:2/[color=red]^/B291` comes back as `RK:2/[]^/B291`.

The options a code brings by its definition are part of the code, not options in this sense, so they stay: `REFSQUARE` keeps its dotted line, and `REDGLYPH`, defined `{ type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } }`, comes back as `[color=red]>B291`, or as `REDGLYPH` with `preserve`.

To take the options off the builder itself, call [`clearAllOptions()`](#clearalloptions): afterwards it saves what `toString({ omitOptions: true })` saved before. [`clearOptions()`](#clearoptions) takes them off one element, and the builder's own [`removeOptions()`](#setoptions-opts-and-removeoptions-keys) takes off the global options you name. [`toJSON()`](#tojson-options) takes the same flag.

### Combining the serializer options

`preserve`, `flattenIndicators` and `omitOptions` are independent and combine freely, on `toString()` and `toJSON()` alike:

| Option | Governs | Off *(default)* | On |
|---|---|---|---|
| `preserve` | custom names | decomposed to built-in codes | kept |
| `flattenIndicators` | word-level `;;` indicators | kept | collapsed onto the head glyph as `;` |
| `omitOptions` | options | written | left out |

### Head Marker Resolution

The head marker (`^`) designates which glyph in a word carries word-level indicators. An explicit designation is stored, and `toString()` always re-emits it, exactly as `toJSON()` keeps `isHeadGlyph`, so a string round-trip never loses it, even when the automatic head pick would land on the same glyph anyway. A word written without `^` stays unmarked (the automatic pick is derived at read time, never stored), with one exception: where a reload of the written word would pick another head for its `;;` indicators, as when a custom glyph heads the word and the built-in code it is written as is one the automatic pick passes over, the output marks the head, so the indicators reload on the same character:

```js
// The stored designation round-trips verbatim:
new BlissSVGBuilder('B101/B208^/B303').toString();
// 'B101/B208^/B303'

// A redundant designation (the automatic pick lands there anyway) is now
// kept too:
new BlissSVGBuilder('B486/B208^').toString();
// 'B486/B208^'

// No explicit marker was written, so none is emitted:
new BlissSVGBuilder('B486/B208').toString();
// 'B486/B208'

// The exception: MORE heads its word, but the automatic pick passes over
// B937 (comparative "more"), so the default output marks it:
BlissSVGBuilder.define({ 'MORE': { type: 'glyph', codeString: 'B937' } });
new BlissSVGBuilder('MORE/B291;;B81').toString();
// 'B937^/B291;;B81'
```

A `^` on a multi-character code (an alias or word) is not a valid head designation: it is dropped at parse time with a `MISPLACED_HEAD_MARKER` warning and never reappears on export. Saving [without options](#saving-without-options) drops one too: a head marker on a character that holds nothing but options goes with that character, unless the character holds kerning, which that save keeps.

Use for: serializing back to DSL format, portable exchange, logging.

## Navigation

Methods for traversing the element tree. All navigation returns live `ElementHandle` objects (see below) or `null` when out of range.

### `group(index)`

Returns a live handle for the glyph group at the given index, skipping space groups. Negative indices count from the end (`-1` = last):

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');
const first = builder.group(0);   // B313/B1103
const second = builder.group(1);  // B431
builder.group(-1);                // last group (B431)
builder.group(99);                // null
```

### `glyph(flatIndex)`

Returns a live handle for the glyph at a flat index across all groups. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');
builder.glyph(0);  // B313
builder.glyph(1);  // B1103
builder.glyph(-1); // last glyph (B431)
```

### `part(flatIndex)`

Returns a live handle for the part at a flat index across all glyphs in all groups. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431;B81');
builder.part(0);  // B313's single part
builder.part(1);  // B431 (first part of second glyph)
builder.part(-1); // last part (B81)
```

### `element(index)`

Returns a live handle for the group at a raw index, including space groups. Negative indices count from the end. Unlike `group()`, this does not skip space groups:

```js
const builder = new BlissSVGBuilder('B313//B431');
// Raw layout: [word] [space] [word]

builder.element(0);  // word group (B313)
builder.element(1);  // space group (TSP)
builder.element(2);  // word group (B431)
builder.element(-1); // last group (B431)
builder.element(99); // null
```

| Navigation | Indexing |
|------------|---------|
| `group(i)` | Skips space groups (word 0, word 1, ...) |
| `element(i)` | Raw index over all groups including spaces |

### `elementCount`

Total number of raw groups, including space groups:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.elementCount; // 3 (word + space + word)
builder.stats.groupCount; // 2 (words only)
```

### `getElementByKey(key)`

Returns a live handle for the element matching a snapshot key, including space groups:

```js
const builder = new BlissSVGBuilder('B313/B1103');
const snap = builder.snapshot();
const key = snap.children[0].children[0].key;
builder.getElementByKey(key); // live handle for B313
```

### `snapshot()`

Returns a frozen element tree for read-only inspection:

```js
const snap = builder.snapshot();
snap.children;  // groups (frozen)
```

Group-level snapshots include `isSpaceGroup` to identify space groups:

```js
const builder = new BlissSVGBuilder('B313//B431');
const snap = builder.snapshot();
snap.children[0].isSpaceGroup; // false (word group)
snap.children[1].isSpaceGroup; // true  (space group)
snap.children[2].isSpaceGroup; // false (word group)
```

Every snapshot node carries `level` (a number: `0` root, `1` group, `2` glyph, `3+` part) and four convenience booleans derived from it: `isRoot`, `isGroup`, `isGlyph`, `isPart`. Use these to filter or branch by structural depth without comparing strings:

```js
const snap = builder.snapshot();
snap.isRoot;                                     // true
snap.children[0].isGroup;                        // true
snap.children[0].children[0].isGlyph;            // true
snap.children[0].children[0].children[0].isPart; // true
```

Content flags (`isShape`, `isBlissGlyph`, `isExternalGlyph`, `isIndicator`, `isHeadGlyph`, `isSpaceGroup`) are orthogonal to level. For example, an inline composite character has `isGlyph: true` and `isBlissGlyph: false`.

### `stats`

Returns group and glyph counts:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');
builder.stats; // { groupCount: 2, glyphCount: 3 }
```

### `traverse(callback)`

Depth-first walk of all element snapshots. Return `false` to stop early:

```js
builder.traverse(el => {
  console.log(el.level, el.codeName);
});
```

### `query(predicate)`

Returns all element snapshots matching a predicate:

```js
const glyphs = builder.query(el => el.isGlyph);
```

## Builder Mutation

Methods on the builder instance for modifying content. All return `this` for chaining. Out-of-range indices are silently ignored (no error thrown, no mutation performed), except by an insert: an index past either end inserts at that end.

Every add/insert/replace method takes exactly one unit of its own level (one word group, one character, or one part) and throws when the code spans more, so content is never silently dropped. An omitted or empty `code` creates an empty slot at group and glyph level; parts always name a shape. See [One unit per mutation call](#one-unit-per-mutation-call) and [Empty slots are deliberate](#empty-slots-are-deliberate) for the full contract.

```js
// Builder methods return the builder, so you can chain into properties
const svg = new BlissSVGBuilder()
  .addGlyph('B313')
  .addGlyph('B1103')
  .addGroup('B431')
  .svgCode;
```

### `addGroup(code?, opts?)`

Appends a new glyph group with automatic space management:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGroup('B431');
// equivalent to new BlissSVGBuilder('B313//B431')
```

The code must be exactly one word group (one call per word). An omitted, empty, or whitespace-only `code` appends an [empty group](#empty-slots-are-deliberate):

```js
builder.addGroup('');                   // an empty word slot, renders nothing
builder.addGroup('', { color: 'red' }); // empty slot with options, serializes as '[color=red]|'
```

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

### `addGlyph(code?, opts?)`

Appends a glyph to the last glyph group. Creates a group if the builder is empty:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGlyph('B1103');
// equivalent to new BlissSVGBuilder('B313/B1103')
```

The code must be exactly one character. An omitted or empty `code` appends an [empty glyph](#empty-slots-are-deliberate). On an empty builder the code is validated first and only then wrapped in a new group, so a rejected code leaves the builder untouched, and `opts` land on the glyph itself.

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to anything but exactly one character: multi-character codes and defined word names throw, as do word options (`[color=red]|B313`), a word indicator list (`B291;;B81`), document options (`[color=red]||B313`), and codes that fail to parse. Use the group methods for word content (see [One unit per mutation call](#one-unit-per-mutation-call)).

### `addPart(code, opts?)`

Appends a part to the last glyph of the last group:

```js
const builder = new BlissSVGBuilder('B313');
builder.addPart('B81');
// appends B81 to B313, equivalent to 'B313;B81'
```

The code must be exactly one part (one call per part). If the last group has no glyphs, the part is wrapped in a new glyph; on an empty builder the group is created too, with `opts` landing on the part itself. A part references a shape, so `code` is required: to reserve an empty slot, use `addGlyph('')`.

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` is empty, parses to more than one part, or carries an artifact from above the part (a head marker `^`, a word indicator list `;;`, word options `[opts]|`, document options `[opts]||`, or any other `|` outside an option bracket, as in `|B313` or `B313|B431`). A word code (`B313/B1103`) does not throw: it is kept as a failed part with a `WORD_AS_PART` warning, exactly like the DSL.

### `insertGroup(index, code?, opts?)`

Inserts a group at the given position. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.insertGroup(1, 'B291');
// now equivalent to 'B313//B291//B431'

const other = new BlissSVGBuilder('B313//B431');
other.insertGroup(-1, 'B291');
// before the last word: also 'B313//B291//B431'
```

An omitted or empty `code` inserts an [empty group](#empty-slots-are-deliberate).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

### `removeGroup(index)`

Removes the group at the given index. Negative indices count from the end:

```js
builder.removeGroup(-1); // remove last group
```

### `replaceGroup(index, code?, opts?)`

Replaces the group at the given index with new content:

```js
builder.replaceGroup(0, 'B431', { color: 'red' });
```

An omitted or empty `code` deliberately clears the slot: the target group is swapped for an [empty group](#empty-slots-are-deliberate), discarding its content. Out-of-range indices remain a silent no-op (checked before the code is parsed).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

### `.merge(other)`

Merges another builder's content into this one. The other builder's word
groups are appended (with a space group between), and its global options
are discarded. The other builder is not modified.

```js
const textA = new BlissSVGBuilder('[color=red]||B313/B1103');
const textB = new BlissSVGBuilder('[color=blue]||B431//B291');

textA.merge(textB);
// textA now has 3 words: B313/B1103, B431, B291
// textA's global options (color=red) apply to all
// textB is unchanged
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `other` | `BlissSVGBuilder` | Builder whose content to append |

Returns `this` for chaining.

**Throws** if `other` is not a `BlissSVGBuilder` instance.

### `.splitAt(groupIndex)`

Splits this builder into two at the given group boundary. This builder
keeps the left half; a new independent builder is returned with the
right half. Both builders share the same global options.

```js
const builder = new BlissSVGBuilder('[color=red]||B313//B431//B291');
const right = builder.splitAt(1);

builder.stats.groupCount;  // 1 (B313)
right.stats.groupCount;    // 2 (B431, B291)
right.toJSON().options;    // { color: 'red' }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `groupIndex` | `number` | Split point: 1 to groupCount-1 |

Returns a new `BlissSVGBuilder` with the right-half groups.

**Throws** if the builder has fewer than 2 groups, or `groupIndex` is out of range (must be 1 to groupCount-1 inclusive).

### `clear()`

Removes all content:

```js
builder.clear();
builder.toJSON().groups; // []
```

### `setOptions(opts)` and `removeOptions(...keys)`

Change the global options of a builder that already exists, the ones `toString()` writes in the `[...]||` bracket:

```js
const builder = new BlissSVGBuilder('[color=red]||B313');

builder.setOptions({ color: 'blue', grid: true });
builder.toString(); // '[color=blue;grid]||B313'

builder.removeOptions('color');
builder.toString(); // '[grid]||B313'

builder.removeOptions('grid');
builder.toString(); // 'B313'
```

`setOptions` takes what the constructor's options argument takes, flat options or `{ defaults, overrides }`, and stores what passing the same keys to the constructor would. Repeated calls merge, and the last value of a key wins. `x` and `y` move the whole composition. Kerning (`relativeKerning`, `absoluteKerning`) belongs to a character, so it is dropped with [`MISPLACED_KERNING_OPTION`](/reference/warning-codes#misplaced-kerning-option).

`removeOptions` reads a name as an element's [`.removeOptions()`](#removeoptions-keys) does, and naming `x` or `y` removes the composition's position, however it was set. Once the last global option goes, the string has no `[...]||` prefix.

A [transient](#transient-options) value of the same key still wins in the picture, and neither call changes what the other channel set.

### `clearAllOptions()`

Removes every option at every scope, the global bracket included, and keeps the content:

```js
const builder = new BlissSVGBuilder('[color=red;x=5]||B291/[stroke-width=0.8]B313');
builder.clearAllOptions();
builder.toString(); // 'B291/B313'
```

It removes exactly what [`omitOptions`](#saving-without-options) leaves out of a save, so afterwards the builder saves what `toString({ omitOptions: true })` saved before, with either serializer. The position of a character, a word or the whole composition goes with the other options; a part's coordinates and a character's kerning stay. To remove only some of the global options, the composition's position among them, use the builder's own [`removeOptions()`](#setoptions-opts-and-removeoptions-keys). `key`s and transient options are left alone, and so are the options a code brings by its definition (see [`removeOptions`](#removeoptions-keys)). For one element, use [`clearOptions()`](#clearoptions).

### Raw Element Methods

These operate on the raw groups array with no automatic space management. Use them for direct control over space groups and element positioning.

The managed methods (`addGroup`, `insertGroup`, `removeGroup`) auto-insert and clean up space groups. The raw element methods do not.

#### `addElement(code?, opts?)`

Appends a raw group. No space group is inserted:

```js
const builder = new BlissSVGBuilder('B313');
builder.addElement('B431');
// [B313, B431], no space between; toString() writes them as one word, 'B313/B431'
```

An omitted or empty `code` appends an [empty group](#empty-slots-are-deliberate) (here without the auto-space `addGroup` would add).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

#### `insertElement(index, code?, opts?)`

Inserts a raw group at the given index. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313/B431');
builder.insertElement(0, 'SP');
// [SP, B313/B431], leading space

builder.insertElement(1, 'SP');
// inserts space at raw index 1
```

`SP` auto-resolves to `TSP` (standard spacing) or `QSP` (reduced spacing before punctuation). Use `TSP` or `QSP` explicitly to bypass resolution.

An omitted or empty `code` inserts an [empty group](#empty-slots-are-deliberate).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

#### `removeElement(index)`

Removes the raw group at the given index (plain splice, no space cleanup). Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.removeElement(1); // remove space group
// [B313, B431], no space between; toString() writes them as one word, 'B313/B431'
```

#### `replaceElement(index, code?, opts?)`

Replaces the raw group at the given index. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.replaceElement(1, 'QSP'); // swap TSP for QSP
```

An omitted or empty `code` deliberately clears the slot: the target is swapped for an [empty group](#empty-slots-are-deliberate). Out-of-range indices remain a silent no-op (checked before the code is parsed).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to more than one group or carries document options (`[opts]||`).

## ElementHandle

A live reference to a group, glyph, or part in the element tree. Obtained via `group()`, `glyph()`, `part()`, or `getElementByKey()`.

### Handle Lifetime

Handles survive mutations to other parts of the tree, just like DOM node
references. A handle only becomes invalid when its own node is removed:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');
const h1 = builder.group(0);
const h2 = builder.group(1);

h1.addGlyph('B291');     // h1 stays valid (it performed the mutation)
h2.glyph(0);             // works -- h2's node was not affected

builder.removeGroup(1);
h2.glyph(0);             // throws: "ElementHandle references an element
                         //          that has been removed."
```

Handles also survive relocations. When `mergeWithNext()` absorbs glyphs
from one group into another, handles to those glyphs remain valid:

```js
const builder = new BlissSVGBuilder('B313//B431');
const g = builder.glyph(1);        // B431 in group 1

builder.group(0).mergeWithNext();   // B431 absorbed into group 0
g.codeName;                         // 'B431' -- still works
```

### Navigation

#### `.level`, `.isGroup`, `.isGlyph`, `.isPart`

`level` is a number: `1` for group handles, `2` for glyph handles, `3+` for part handles (matches `snapshot.level`). The three boolean getters are conveniences for branching by structural depth:

```js
const g = builder.group(0);
g.level;    // 1
g.isGroup;  // true

const c = g.glyph(0);
c.level;    // 2
c.isGlyph;  // true
```

(Handles never represent the root, so there is no `isRoot`.)

#### `.glyph(index)`

On a group handle, returns a handle for the glyph at the given index within that group. Negative indices count from the end (`-1` = last):

```js
builder.group(0).glyph(1);  // second glyph in first group
builder.group(0).glyph(-1); // last glyph in first group
```

#### `.part(index)`

On a glyph handle, returns a handle for the part at the given index. Negative indices count from the end:

```js
builder.glyph(0).part(0);  // first part of first glyph
builder.glyph(0).part(-1); // last part of first glyph
```

On a part handle, returns a handle for a nested sub-part.

#### `.headGlyph()`

On a group handle, returns the head glyph (the main glyph in a composition):

```js
builder.group(0).headGlyph();
```

#### `.codeName`

Returns the input code that produces this element. The exact meaning depends on level:

- **Part level** (`builder.glyph(0).part(0).codeName`): the structural lookup key the user would write (e.g. `'B81'`, `'H'`, `'Xa'`, `'TSP'`, `'Xα'`, `'Xhαllo'`). A part written through a bare alias of one code reports the code the alias resolves to, as the alias written alone does: with `MYCODE` defined `{ codeString: 'B431' }`, `glyph(0).part(1).codeName` of `B313;MYCODE` is `'B431'`.
- **Glyph level** (`builder.glyph(0).codeName`): the live identity, set only when the glyph is actually a glyph: B-codes (`'B431'`), single X-codes (`'Xa'`, `'Xα'` — built-in alphabet OR single-character text fallback, X-prefix preserved), or `define()`d `type: 'glyph'` aliases (`'LOVE'`). Returns `''` for composites (`H;C8`), bare shape primitives written alone (`H`), and multi-character text fallback (`Xhαllo` renders as one glyph but has no identity code of its own; its code lives on its part).
- **Group level** (`builder.group(0).codeName`): always `''`. Groups are containers without identity.

```js
new BlissSVGBuilder('B431').glyph(0).codeName;   // 'B431'
new BlissSVGBuilder('Xa').glyph(0).codeName;     // 'Xa'
new BlissSVGBuilder('Xα').glyph(0).codeName;     // 'Xα'  (single-char fallback)
new BlissSVGBuilder('Xhαllo').glyph(0).codeName; // ''   (no code of its own)
new BlissSVGBuilder('H').glyph(0).codeName;      // ''   (shape primitive)
new BlissSVGBuilder('H').glyph(0).part(0).codeName; // 'H'
new BlissSVGBuilder('Xα').glyph(0).part(0).codeName; // 'Xα'
new BlissSVGBuilder('Xhαllo').glyph(0).part(0).codeName; // 'Xhαllo'
```

`.codeName` is the live identity. What serialized output emits for a custom name is governed by `toString()` / `toJSON()` and their `preserve` option (see [Serialization](#serialization)); neither affects this getter.

#### `.char`

Returns the rendered Unicode character for an external glyph (`'a'` for `Xa`, `'α'` for `Xα`). Returns `''` for B-codes, composites, shape primitives, multi-character text fallback, and non-glyph levels.

```js
builder.glyph(0).char;  // 'a' for Xa, 'α' for Xα, '' otherwise
```

`codeName` and `char` carry distinct, complementary information for X-codes — input syntax (`'Xa'`) versus rendered character (`'a'`).

#### `.isIndicator`

On a part handle, returns `true` if this part is an indicator. Returns `false` on glyph and group handles:

```js
builder.glyph(0).part(1).isIndicator; // true for indicator parts
```

#### `.indicatorLevel` / `.indicatorKind`

On a part handle, classify an indicator part. Both return `null` (never throw) for a non-indicator part, and on glyph or group handles:

- `indicatorLevel` — `'character'` for a `;` indicator, otherwise `null`. A part handle references a node in the raw tree, and a word-level (`;;`) overlay indicator has no raw node, so a handle never returns `'word'`. The `'word'` level is surfaced on the resolved [`snapshot()`](#snapshot) tree, where the overlay part exists.
- `indicatorKind` — `'semantic'` for a thing/abstract root (e.g. `B97`, `B6436`), `'grammatical'` for an action/description/etc. indicator (e.g. `B81`, `B86`).

```js
const b = new BlissSVGBuilder('B303;B97');
b.part(1).indicatorLevel; // 'character'
b.part(1).indicatorKind;  // 'semantic'  (B97 is a thing root)
b.part(0).indicatorLevel; // null         (B303 is a base, not an indicator)

// A composite indicator's internal sub-parts are classified too:
new BlissSVGBuilder('B303;B84').part(1).part(0).indicatorKind; // 'grammatical'
```

For a word-level (`;;`) indicator, read the resolved snapshot instead of a part handle:

```js
const head = new BlissSVGBuilder('B313/B1103;;B86')
  .snapshot().children[0].children.find(c => c.isGlyph);
const overlay = head.children.find(c => c.indicatorLevel === 'word');
overlay.codeName;        // 'B86'
overlay.indicatorKind;   // 'grammatical'
```

#### `.key`

Stable across mutations. Use with `getElementByKey(key)` to recover a handle to this same node later:

```js
const key = builder.glyph(0).key;
// later, after mutations elsewhere
const handle = builder.getElementByKey(key);
```

#### `.isShape`, `.isBlissGlyph`, `.isExternalGlyph`, `.isHeadGlyph`, `.isSpaceGroup`

Content flags mirroring the same-named fields on snapshots. Each returns `false` when not applicable to the handle's level (e.g., `.isHeadGlyph` is `false` on group and part handles):

```js
builder.glyph(0).isBlissGlyph;          // true for B-code characters
builder.group(0).headGlyph().isHeadGlyph; // true on the head glyph
builder.element(1).isSpaceGroup;        // true for auto-inserted spaces
```

### Dimensions

Handles expose read-only dimension getters that pull values from the snapshot tree. These are live: they reflect the current state and update automatically after mutations.

#### `.x`, `.y`

Absolute position of this element's origin:

```js
const group = builder.group(0);
console.log(group.x, group.y); // position of the first word group
```

#### `.offsetX`, `.offsetY`

Position offset relative to the parent. Useful when computing local layout without mixing in ancestor offsets:

```js
const part = builder.glyph(0).part(1);
console.log(part.offsetX, part.offsetY); // offset within its glyph
```

#### `.width`, `.height`

Total dimensions including indicator overhang:

```js
const glyph = builder.group(0).glyph(0);
console.log(glyph.width, glyph.height);
```

#### `.baseWidth`

Width excluding indicators. Equals `.width` when no indicators are present:

```js
const glyph = builder.group(0).glyph(0);
glyph.baseWidth; // just the base character, no indicator overhang
```

#### `.advanceX`

Horizontal spacing step to the next sibling:

```js
builder.group(0).advanceX; // how far to advance before the next group
```

#### `.bounds`

Absolute bounding box of the ink (`{ minX, maxX, minY, maxY, width, height }`):

```js
const bounds = new BlissSVGBuilder('B313').group(0).glyph(0).bounds;
// { minX: 0, maxX: 8, minY: 8, maxY: 16, width: 8, height: 8 }
```

#### `.measure()`

Returns all dimension properties at once in a frozen object. More efficient than reading individual getters when you need multiple values:

```js
const m = builder.group(0).measure();
// { x, y, offsetX, offsetY, width, height, bounds, advanceX, baseWidth }

// Useful for editor integration
const cursor = { left: m.x + m.advanceX, top: m.y };
const highlight = { left: m.bounds.minX, width: m.bounds.width };
```

### Structural Mutation

All structural methods trigger a rebuild and return `this` for chaining (except `remove()` which returns `undefined`). Out-of-range indices are silently ignored (no error thrown, no mutation performed), except by an insert: an index past either end inserts at that end. Calling a method on the wrong handle level (e.g., `.addGlyph` on a part handle) also returns `this` with no effect.

Content arguments follow the same contract as the builder methods: exactly one glyph or part per call, an omitted or empty `code` creates an empty glyph (parts always name a shape), and a non-string `code` throws a `TypeError`. See [One unit per mutation call](#one-unit-per-mutation-call).

A word that fails to parse (a structurally malformed `;;`) is **dropped**: malformed syntax is not content, so the whole word is removed from render and from both `toString()` and `toJSON()`, leaving only a `MALFORMED_WORD_INDICATOR` warning. It therefore never appears as a group to mutate — there is no handle to reach, and the composition reads as if the failed word were never written. (A well-formed but *unknown* code is the opposite case: it is kept and warned, so it can render later once defined.)

A structural mutation that turns an indicator-bearing word into a space normalizes the now-invalid state instead of storing it: the word's `;;` overlay is dropped with a `DROPPED_WORD_INDICATOR` warning, and a head designation on a glyph that became a space is deleted (silently, like the structural `^` drops in `splitAt` / `mergeWithNext`) — a space carries neither, and the space serialization (`//`) could not re-emit them.

More generally, a bare space glyph never stays *inside* a word: the DSL has no syntax for that state (its serialized token would re-split into separate groups on reparse), so a mutation or alias expansion that leaves one there canonicalizes at rebuild: the word splits at its space runs into real space groups. The first word run keeps the group node and its options; later word runs receive an options copy (`splitAt` parity) and keep their own head designations. The `;;` overlay follows [`.splitAt()`](#splitat-glyphindex)'s rule: it stays on the first word run while the character it is drawn on is there, and otherwise is dropped with a `DROPPED_WORD_INDICATOR` warning (`B313/B431^;;B81` with a `TSP` inserted at 1 becomes `B313//B431^`). The rest of the split is silent. A non-default space keeps its explicit code (`QSP` stays `QSP`), and a space code composed as a *part* of a multi-part glyph (`ZSA;B291`) is not a space glyph and is never touched.

```js
// Handle methods return the handle, not the builder
builder.group(0)
  .addGlyph('B291')
  .setOptions({ color: 'blue' })
  .replaceGlyph(0, 'B431');

// To access builder properties after handle mutations, use a separate statement
builder.group(0).addGlyph('B291');
builder.svgCode; // back on the builder
```

#### `.addGlyph(code?, opts?)`

Appends a glyph to this group:

```js
builder.group(0).addGlyph('B1103');
```

The code must be exactly one character; an omitted or empty `code` appends an [empty glyph](#empty-slots-are-deliberate).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to anything but exactly one character (multi-character codes, defined word names, word options `[opts]|`, a word indicator list `;;`, document options `[opts]||`, or a code that fails to parse).

#### `.insertGlyph(index, code?, opts?)`

Inserts a glyph at a specific position within this group:

```js
builder.group(0).insertGlyph(0, 'B431'); // prepend
```

Same content contract as `.addGlyph()`: one character per call, empty `code` inserts an empty glyph, same **Throws**.

#### `.addPart(code, opts?)`

On a glyph handle, appends a part to that glyph. On a group handle, delegates to the last glyph in the group; if the group has no glyphs, the part is wrapped in a new glyph instead of being dropped:

```js
builder.glyph(0).addPart('B81');
builder.group(0).addPart('B81'); // appends to last glyph in group
```

The code must be exactly one part. A part references a shape, so `code` is required: to reserve an empty slot, use `addGlyph('')`.

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` is empty, parses to more than one part, or carries an artifact from above the part (`^`, `;;`, `[opts]|`, `[opts]||`, any other `|`; see [`addPart`](#addpart-code-opts)). A word code is kept as a failed part with a `WORD_AS_PART` warning instead of throwing.

#### `.insertPart(index, code, opts?)`

Inserts a part at a specific position within this glyph:

```js
builder.glyph(0).insertPart(0, 'B81'); // prepend
```

Same content contract as `.addPart()`: one part per call, `code` required, same **Throws**.

#### `.remove()`

Removes the element from its parent. Cascading: removing the last glyph in a group removes the group; removing the last part in a glyph removes the glyph. Returns `undefined` (cannot be chained):

```js
builder.glyph(1).remove();
```

#### `.detach()`

Plain splice: disconnects the element from its parent with no cascade cleanup. Unlike `remove()`, empty parents and adjacent spaces are left in place. Returns `undefined` (cannot be chained):

```js
builder.glyph(1).detach(); // removes glyph, may leave empty group
```

| Method | Behavior |
|--------|----------|
| `remove()` | Cascades: empty parents and adjacent spaces are cleaned up |
| `detach()` | Plain splice: just disconnects from parent, no cleanup |

Compose with navigation for raw-level removal without needing separate methods:

```js
builder.group(0).glyph(1).detach();  // plain-splice a glyph from a group
builder.glyph(0).part(2).detach();   // plain-splice a part from a glyph
```

#### `.replace(code?, opts?)`

Replaces the element with new content. Valid on glyph and part handles:

```js
builder.glyph(0).replace('B431');
```

On a glyph handle, an omitted or empty `code` deliberately swaps the glyph for an [empty glyph](#empty-slots-are-deliberate), discarding the old content (a head designation dies with it). On a part handle, `code` is required.

**Throws** a `TypeError` if `code` is provided and is not a string. On a glyph handle, throws an `Error` if `code` parses to anything but exactly one character (see `.addGlyph()`); on a part handle, if `code` is empty (swap in an empty slot with the glyph handle's `replace('')` instead) or parses to more than one part.

#### `.removeGlyph(index)`

On a group handle, removes the glyph at the given index. Negative indices count from the end. Returns the group handle for chaining:

```js
builder.group(0).removeGlyph(-1); // remove last glyph
```

#### `.replaceGlyph(index, code?, opts?)`

On a group handle, replaces the glyph at the given index:

```js
builder.group(0).replaceGlyph(0, 'B431');
```

An omitted or empty `code` deliberately swaps the target for an [empty glyph](#empty-slots-are-deliberate), discarding the old content (a head designation dies with it). Out-of-range indices remain a silent no-op (checked before the code is parsed).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` parses to anything but exactly one character (see `.addGlyph()`).

#### `.removePart(index)`

On a glyph handle, removes the part at the given index. Negative indices count from the end. Returns the glyph handle for chaining:

```js
builder.glyph(0).removePart(-1); // remove last part
```

#### `.replacePart(index, code, opts?)`

On a glyph handle, replaces the part at the given index:

```js
builder.glyph(0).replacePart(0, 'B81');
```

A part references a shape, so `code` is required. Out-of-range indices remain a silent no-op (checked before the code is parsed).

**Throws** a `TypeError` if `code` is provided and is not a string, and an `Error` if `code` is empty or parses to more than one part (see `.addPart()`).

### Space Manipulation

#### `.splitAt(glyphIndex)`

On a group handle, splits the word group into two at the glyph boundary, inserting a space group between. Returns `this` (the handle stays on the first half):

```js
const builder = new BlissSVGBuilder('B313/B1103/B431');
builder.group(0).splitAt(2);
// now: [B313/B1103] [SP] [B431]
```

The first half keeps the original options object. The second half receives a shallow copy. The word-level (`;;`) indicators stay with the first half while the character they are drawn on stays there; a split at or before that character drops them and adds a `DROPPED_WORD_INDICATOR` warning, so an indicator never jumps to another character (`B313/B431;;B81` split at 1 gives `B313;;B81//B431`, while `B313/B1103^;;B86` split at 1 gives `B313//B1103`). A `^` head marker that lands in the second half is dropped, and that half finds its own head. Throws if `glyphIndex` is out of range (must be between 1 and `glyphs.length - 1` inclusive):

```js
builder.group(0).splitAt(0);  // Error: would produce empty left half
builder.group(0).splitAt(3);  // Error: would produce empty right half
```

On non-group handles, returns `this` with no effect.

#### `.mergeWithNext()`

On a group handle, absorbs the next non-space word group into this one, removing any space groups in between. Returns `this`:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.group(0).mergeWithNext();
// now: [B313/B431]
```

The merged word keeps the first group's options. The absorbed group's options are discarded. Glyph-level options on absorbed glyphs are preserved.

No-op when there is no next word group, when the next word group is [empty](#empty-slots-are-deliberate) (empties are never absorbed, though an empty group absorbs its next word normally), or when called on a space group or non-group handle.

### Options Mutation

#### `.setOptions(opts)`

Merges options onto the element. Accepts flat options (treated as overrides) or the structured `{ defaults, overrides }` format:

```js
// Flat options (treated as overrides):
builder.glyph(0).setOptions({ color: 'red' });

// Structured format (defaults and overrides):
builder.glyph(0).setOptions({
  defaults: { strokeWidth: 0.6 },
  overrides: { color: 'red' }
});
```

A non-object `opts` throws a `TypeError`; an empty `{}` is a no-op (see [error handling](#error-handling)).

A key that cannot act at the element's level is dropped with the warning the same key gets in a bracket there, and is not saved: a canvas-wide option such as `margin` ([`MISPLACED_GLOBAL_OPTION`](/reference/warning-codes#misplaced-global-option)), kerning anywhere but a character ([`MISPLACED_KERNING_OPTION`](/reference/warning-codes#misplaced-kerning-option)), or a key naming a part of the picture such as `grid--opacity` ([`MISPLACED_LAYER_OPTION`](/reference/warning-codes#misplaced-layer-option)). A prefixed key whose name would be refused at global scope too, such as `nosuch--fill` or `content--onclick`, is reported with that refusal instead. An `element-background--` key is the exception: it is kept and styles the backgrounds of that element and everything inside it (see [Classes and Keys](/handbook/appearance/backgrounds-accessibility#classes-and-keys)). The same holds for the options of the adding and replacing methods.

#### `.removeOptions(...keys)`

Removes specific option keys:

```js
builder.glyph(0).removeOptions('color', 'strokeWidth');
```

A key that is not a string throws a `TypeError`. Every key is read before any is removed, so a call that throws has changed nothing; naming no key at all asks for nothing and is not an error. The same holds for `removeTransientOptions`.

Naming `x` or `y` removes the element's position, including a part's `CODE:x,y` coordinate, since that is the same value written another way.

The options a code brings by its definition are part of the code and are not removed. `REFSQUARE` and `ANCHORRING` draw a dotted line by definition, and a code you define draws with its [own options](/handbook/writing/custom-codes#a-definition-s-own-options) (its `defaultOptions`, or the bracket that starts its `codeString`) the same way; naming one of those keys returns it to the definition's value. To change the look, override it: `[stroke-dasharray=none]>REFSQUARE` draws the square solid.

#### `.clearOptions()`

Removes all of the element's options, meaning everything `toString()` writes for it inside a bracket:

```js
const builder = new BlissSVGBuilder('[color=red;x=2]|B291/[color=blue]B313;;[color=green]>B81');
builder.group(0).clearOptions();
builder.toString(); // 'B291/[color=blue]B313;;B81'
```

A word loses its options, its position and the options inside its word-level indicators; a character its options and position; a part its options. What sits inside the element keeps its own, which is why `B313` above stays blue. A part keeps its coordinates and a character its kerning, since the string writes those outside a bracket: on `B291;[x=3;color=red]>C8`, clearing the part gives `B291;C8:3`, while `removeOptions('x')` on it would remove the coordinate. `key` and transient options are left alone, and so are the options a code brings by its definition. Clearing an element that has no options is not an error. To clear the whole composition, global options included, use [`clearAllOptions()`](#clearalloptions).

### Transient Options

Transient options reach the rendered SVG and never reach `toString()` or `toJSON()`. Use them for anything that describes the current view rather than the composition: hit-test annotations an editor stamps onto each part, a selection highlight, or a display width that must not end up in the string a user saves or shares.

```js
const builder = new BlissSVGBuilder('B291/B99');

builder.setTransientOptions({ minWidth: 40 });            // whole SVG
builder.glyph(0).setOptions({ color: 'red' });            // part of the composition
builder.glyph(0).setTransientOptions({ color: 'blue' });  // only on this screen
builder.part(0).setTransientOptions({ 'data-part-index': '0' });

builder.svgCode;     // wide canvas, first character blue, data-part-index on its <g>
builder.toString();  // "[color=red]B291/B99"
builder.toJSON();    // no transientOptions field anywhere
```

They are ordinary options that happen not to serialize, so a named option such as `minWidth` works here too, not only pass-through attributes. `removeTransientOptions(...keys)` removes them again, in either spelling.

#### Precedence

A transient value wins over a normal option of the **same key**. Above the key, ordinary precedence is unchanged and does not care which channel a value came from: an explicitly named attribute still beats an alias of it, and a specific option still beats the bulk option it refines.

```js
builder.glyph(0).setOptions({ stroke: 'red' });
builder.glyph(0).setTransientOptions({ color: 'blue' });   // renders red: `stroke` is explicit, `color` is its alias
```

#### There is no DSL spelling

Transient options exist only in code, by design. The DSL string *is* the serialized form, so a spelling that round-tripped would serialize, and one that did not would break round-tripping.

#### What the channel refuses

Some option keys are read while the composition is being built rather than while it is drawn, so a transient spelling could never reach the picture. Rather than accept one and quietly do nothing, they are dropped with a `MISPLACED_TRANSIENT_OPTION` warning: `x`, `y`, `relativeKerning` and `absoluteKerning` (in either spelling), and `key`. Set those with `setOptions` instead.

An attribute name that can never be emitted (an `on*` event handler, or a name outside letters, digits and dashes) is dropped with `UNSAFE_ATTRIBUTE_NAME`. A space carries no decoration in this channel either, matching how a normal option on a space already behaves (`MISPLACED_SPACE_DECORATION`). A key that cannot act at the element's level is refused as [`setOptions`](#setoptions-opts) refuses it: `minWidth` on a character reports `MISPLACED_GLOBAL_OPTION`, since it sizes the whole SVG and belongs on the builder's own `setTransientOptions`.

#### They do not survive a JSON round trip

That is the contract working rather than a gap. `new BlissSVGBuilder(builder.toJSON())` gives a builder with no transient options, so an application that clones a builder that way re-applies them to the clone, the same way it applies them in the first place.

### Indicator Mutation

`applyIndicators` / `clearIndicators` manage indicators and are **polymorphic by handle level**. Unlike other mutation methods, the `opts` parameter is not `BlissOptions`: `applyIndicators` accepts `{ stripSemantic?: boolean, flatten?: boolean }`, while `clearIndicators` accepts only `{ flatten?: boolean }` — it is the pure undo, and `stripSemantic` lives on apply.

- On a **glyph handle**, they operate character-level: the indicator is baked into the glyph's parts (the `;` channel).
- On a **group handle**, they operate word-level on the reversible `;;` overlay (`group.wordIndicators`), leaving the base glyphs intact.

#### `.applyIndicators(code, opts?)`

On a **glyph handle**, sets the glyph's indicators to the given code. Semantic indicators are preserved unless the new code includes one or `{ stripSemantic: true }` is passed:

```js
builder.glyph(0).applyIndicators('B86');
builder.glyph(0).applyIndicators('B81;B86');
builder.glyph(0).applyIndicators('B86', { stripSemantic: true });
```

An empty `code` (omitted, `''`, or whitespace-only) is now allowed as the deliberate empty set: it has the same state effect as `clearIndicators()`, and `applyIndicators('', { stripSemantic: true })` removes the semantic too. On a bare glyph it is a harmless silent no-op, like a trailing `;` in the DSL.

Every given code must be a single indicator (a custom code qualifies when it resolves to one through single-code aliases): a recognized non-indicator is warned with `NON_INDICATOR_AS_CHARACTER_INDICATOR`, an unknown code with `UNKNOWN_CODE`, a code spanning multiple characters (a top-level `/`) with `MISPLACED_CHARACTER_INDICATOR`, and a code whose decoration fails to parse (e.g. `B81:bad`) is rejected with its parse warning; the valid subset still applies. A call whose codes are *all* invalid is now refused: nothing changes on the glyph (in particular, existing indicators are no longer replaced away, and nothing strips), and the per-code warnings are the only effect. A call that can not change anything for structural reasons (a space glyph, an invalid part pattern) adds a `NOOP_INDICATOR_MUTATION` warning instead of silently doing nothing.

On a **group handle**, sets the word-level `;;` overlay on the head glyph, byte-identical to the DSL `;;` (and `{ stripSemantic: true }` to `;;!`). The base glyphs stay intact, so a later `clearIndicators()` restores them:

```js
builder.group(0).applyIndicators('B86');                 // == DSL ;;B86
builder.group(0).applyIndicators('B86', { stripSemantic: true }); // == ;;!B86
builder.group(0).applyIndicators('');                    // == bare ;;
builder.group(0).applyIndicators('', { stripSemantic: true });    // == ;;!
builder.group(0).applyIndicators('B86', { flatten: true });       // bake onto the head instead
```

An empty `code` now stores the deliberate empty overlay (`;;`): render-significant — it hides the head glyph's own character-level indicators and adds none. With `{ stripSemantic: true }` it stores the `;;!` strip overlay.

`{ flatten: true }` opts out of the overlay and bakes the indicator onto the head glyph's parts (the pre-overlay shape).

The group-level call validates its codes the same way the DSL `;;` does: a recognized code that is not an indicator is dropped with a `NON_INDICATOR_AS_WORD_INDICATOR` warning, an unknown code with `UNKNOWN_CODE`, and a code carrying a character separator (a top-level `/`, which the `;;` slot cannot hold) with `MALFORMED_WORD_INDICATOR`. A custom code qualifies as an indicator when it resolves to one through single-code aliases (an alias to a multi-code composition does not). A space word cannot carry a word indicator at all: apply and clear on a space group refuse with a `NOOP_INDICATOR_MUTATION` warning. See [Warning Codes](/reference/warning-codes).

#### `.clearIndicators(opts?)`

`clearIndicators` is the pure undo at both levels, and it no longer takes `stripSemantic`. That option lives on apply only — and note the level difference: on a glyph handle `applyIndicators('', { stripSemantic: true })` *removes* the baked semantic too, while on a group handle the same call *stores* the reversible `;;!` strip overlay, which hides the head's indicators at render without removing anything.

On a **glyph handle**, removes all grammatical indicators. Semantic indicators are always preserved:

```js
builder.glyph(0).clearIndicators();
builder.glyph(0).applyIndicators('', { stripSemantic: true }); // removes the semantic too
```

On a **group handle**, removes the word-level `;;` overlay — the pure undo of a group-level apply: the head glyph's own character-level indicators, hidden while the overlay was active, show again (including a semantic that a `;;!` strip had suppressed). `{ flatten: true }` bakes the cleared state onto the head instead of leaving an overlay.

At either level, a clear that finds nothing to remove (a glyph with no indicators; a group with no overlay) or that targets a space adds a `NOOP_INDICATOR_MUTATION` warning instead of silently doing nothing.

### Options

All mutation methods that accept a `code` parameter also accept an optional options parameter. Pass flat options to apply them as overrides:

```js
builder.group(0).addGlyph('B431', { color: 'red' });
```

When you need separate defaults and overrides, use the structured format:

```js
builder.group(0).addGlyph('[color=red]B431', {
  defaults: { strokeWidth: 0.6 },  // applied if not set in DSL
  overrides: { fill: 'blue' }       // always applied
});
```

Flat options `{ color: 'red' }` are equivalent to `{ overrides: { color: 'red' } }`.

## Definition API

Static method for registering custom codes. All definitions are global. Once defined, any `BlissSVGBuilder` instance can use them.

### `define(definitions, options?)`

The single entry point for defining custom codes. Accepts an object mapping codes to definitions:

```js
const result = BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' },                              // word/alias (bare)
  'SMILEY': { codeString: 'C8:0,8;DOT:2,11', type: 'glyph' }, // character
  'CROSS': { codeString: 'HL8:0,4;VL8:4,0', type: 'shape' },  // composite shape
  'DIAMOND': { type: 'shape', getPath: fn, width: 8, height: 8 }, // primitive shape
});

result.defined;  // codes that were registered
result.skipped;  // codes that already existed (informational, not an error)
result.errors;   // codes that failed validation (define() does not throw; check this)
```

The `type` field controls what kind of definition is created: `'glyph'`, `'shape'`, or `'externalGlyph'`. When omitted, `codeString` definitions create bare codes (words, aliases), while `getPath` definitions are auto-detected as shapes or external glyphs. Note: `'bare'` and `'space'` are read-only types reported by `getDefinition()` and `listDefinitions()`, not valid inputs to `define()`.

**Bare definition (omit type): words, aliases, general codes:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeString` | `string` | yes | Composition using existing codes |
| `defaultOptions` | `object` | no | Options for every part the alias draws (see [own options](#a-definition-s-own-options)) |

**type: 'glyph': Bliss character with glyph metadata:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeString` | `string` | yes | Composition using existing codes |
| `defaultOptions` | `object` | no | The glyph's own options (see [own options](#a-definition-s-own-options)) |
| `isIndicator` | `boolean` | no | Marks this glyph as an indicator |
| `anchorOffsetX` | `number` | no | Horizontal anchor adjustment; unset on a glyph that draws one code, that code's |
| `anchorOffsetY` | `number` | no | Vertical anchor adjustment; unset on a glyph that draws one code, that code's |
| `width` | `number` | no | Width override |
| `shrinksPrecedingWordSpace` | `boolean` | no | Auto-shrink word space before this glyph (like punctuation) |

**type: 'shape': primitive (getPath) or composite (codeString):**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | if primitive | Returns SVG path `d` string |
| `width` | `number` | if primitive | Shape width in grid units |
| `height` | `number` | if primitive | Shape height in grid units |
| `codeString` | `string` | if composite | Composition of existing shapes |
| `x` | `number` | no | Default x offset |
| `y` | `number` | no | Default y offset |
| `extraPathOptions` | `object` | no | Extra options passed to `getPath` |
| `defaultOptions` | `object` | no | The shape's own options (see [own options](#a-definition-s-own-options)) |

Give a shape `getPath` or `codeString`, not both: `define()` keeps the function, and `patchDefinition()` refuses a patch that would leave a shape with both.

**type: 'externalGlyph': external font character:** <Badge type="warning" text="Experimental" />

For adding characters from external font systems. Requires providing your own SVG path data.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | yes | Returns SVG path `d` string |
| `width` | `number` | yes | Glyph width |
| `char` | `string` | yes | Rendered Unicode character (e.g. `'a'` for the external glyph registered as `'Xa'`) |
| `y` | `number` | no | Y offset |
| `height` | `number` | no | Glyph height |
| `kerningRules` | `object` | no | Kerning pair adjustments |

**Auto-detection (no type, getPath-based):**
- Has `getPath` + `char` → external glyph
- Has `getPath` (no `char`) → shape

### A definition's own options

A definition's `defaultOptions`, and a character bracket at the start of its `codeString` (`[color=red]B291`, with no `>` after it), are its own options; where both set a key, the bracket wins. They are the options of the part the code is:

- They style what the definition draws, and never a part added beside it, whether by `;`, `;;` or the API.
- An option on the character, the word or the whole composition does not override them. A part bracket where the code is used does (`[color=blue]>MYGLYPH`).
- They are part of the code: `removeOptions()`, `clearOptions()`, `clearAllOptions()` and `omitOptions` leave them, and `preserve` does not write them again. The default output, which spells a custom code out in built-in codes, writes them as a part bracket (`[color=red]>B291`).

An alias's options go on every part it draws, in every character of every word it spells. Where the alias names one code they behave as above wherever the alias is used (alone, as a part, with a position, through the part methods), and they win over the options that code brings; where it spells several codes they are ordinary options of those parts once it is spelled out, so a clear removes them. More examples: [A Definition's Own Options](/handbook/writing/custom-codes#a-definition-s-own-options).

### Definition validation

`define()` validates each entry and reports failures per code in `result.errors` (other entries in the same call still register). The rules:

- **Names must be visible and unreserved.** A name containing control or format characters (zero-width space, BOM, direction marks) is rejected, naming the code point. Reserved names are rejected too: `X` followed by letters (the external-character namespace: written input of that shape is always read as external text, so the definition would be unreachable) and the syntax markers `RK`, `AK`, `SP`. Unused B-codes (like `B99999`) may be defined, but future versions may claim new built-in codes, so custom names carry no collision guarantee.
- **No word-level indicators in definitions.** A `codeString` cannot contain `;;`; apply word indicators at the use site (`WORD;;B81`).
- **A glyph or shape is a single character.** Its `codeString` cannot contain `/`, and cannot be a letter run standing for several letters (`XOH` is shorthand for `XO/XH`); define a multi-character word as a bare code (omit `type`). A letter run that renders as one text element (`Xaλ`, where a letter has no embedded outline) is a single character, which a glyph may hold. A bare codeString may span whole words (`B291//C8`) and compose in sentences like the written form.
- **A glyph may hold letters; a shape holds only shapes.** A glyph's `codeString` may combine characters, shapes and letters (an `X` letter, or an external glyph you defined), so a character built from letters, such as B118, can be defined under a name of your own: `{ type: 'glyph', codeString: 'Xa;Xb:3.2353933,0;Xc:6.4707865,0' }` draws and spaces exactly as `B118` does. A glyph of one letter is spaced as that letter. A shape's `codeString` may hold only shapes: a character (`B291`) or a letter in any spelling (`Xa`, `Xλ`, `Xaλ`) is rejected.
- **A glyph cannot bake in an indicator.** Define a base+indicator combination as a bare code, attach the indicator at the use site (`BASE;B81`), or flag a compound indicator glyph with `isIndicator: true`. This holds in every definition order: a later `define()` or patch that would turn an already-referenced code into an indicator is rejected as well, with an error naming the affected definition.
- **`isIndicator` is valid only on a `type: 'glyph'` definition.** The flag marks a glyph as a compound indicator; on a bare alias, shape, or external glyph it is rejected (and `patchDefinition()` rejects it as an invalid property for those types). Indicator-ness still rides through an unflagged bare alias whose target is itself an indicator (`{ codeString: 'B81' }`).
- **Word codeStrings carry no internal coordinates.** In a multi-character `codeString` (containing `/`), a position suffix like `B516:2,0` is rejected; apply coordinates at the usage site (`WORD:2,0`). Kerning markers (`RK:-2`, `AK:1`) are spacing, not coordinates, and are allowed. A single-character `codeString` keeps its coordinate freedom.
- **A `codeString` must hold content a use can draw.** Each definition is read the way a use of it would be, and refused when that reading finds a coordinate the DSL cannot read (`C8:.`, `C8:1.2.3`; the error names `MALFORMED_COORDINATES`, the warning every use would give), a kerning marker standing as a part (`C8;RK:3`), or, for a glyph or shape, no character at all (`RK:3` alone). Every use of such a definition drew nothing for it. What a use warns about and drops while still drawing is left to the use site: an option key or value in a bracket (`[x=.]>B291`) and a kerning marker's value (`B291/RK:x/B313`). A bare code may be a lone marker: `{ codeString: 'RK:3' }` spaces two characters exactly like `RK:3`. A code not defined yet is not refused, since definitions can be registered in any order.
- **Spaces spell out as `//` or explicit space codes.** The shorthand `SP` has meaning only in top-level input (punctuation context resolves it), so an `SP` segment in a stored codeString is normalized to `//` at registration.
- **`defaultOptions` keys must be valid option names**, and cannot include the canvas-wide global-only options (`margin`, `grid`, `svg-title`, …) or a key that names a part of the picture (`grid--opacity`): those act on the whole SVG and would be inert on a definition. An `element-background--` key is allowed, since it styles the backgrounds the definition paints. Set them in the global bracket (`[opts]||`) or the builder options instead.
- **`defaultOptions` cannot hold what belongs to one use of the character**: a position (`x`, `y`), kerning (`relativeKerning`, `absoluteKerning`, in either spelling) or `key`. A definition says what a character is, so these are written where the code is used: `MYCHAR:2,0` or `[x=2]MYCHAR`, `B313/RK:1/MYCHAR`, `[key=subject]MYCHAR`. A gap that depends on which character comes next belongs in `kerningRules` on the definition of the first.
- **A character bracket at the start of a `codeString` is held to the same rules**, since it is the definition's [own options](#a-definition-s-own-options) too: `{ type: 'glyph', codeString: '[x=2]B291' }` is rejected as `defaultOptions: { x: 2 }` is, and so is a canvas-wide or target-prefixed key there. Over a word (`[color=red]B291/C8`, in a bare code) the bracket styles the first character, as written, and a use reports what it cannot apply.
- References are checked: circular reference chains are rejected. A reference to a not-yet-defined code is allowed, so definitions can be registered in any order; the pending checks complete when the missing code is defined (see the indicator rule above).

`patchDefinition()` applies the same rules and validates before changing anything, so a rejected patch leaves the definition untouched.

### Metadata propagation

The fields above are the input surface. This is how each one shows up (or
doesn't) once a custom code is used, across the four observable surfaces:
parser output (`toJSON()`), rendering (`svgCode`), serialization
(`toString()`), and handles/snapshot nodes.

| Field | Affects | Surfaced as |
|-------|---------|-------------|
| `codeString` | parser, rendering, serialization | the composition; a non-glyph code decomposes to it on export, a `type: 'glyph'` keeps its name in the tree (one part, named after it, when written alone) but still decomposes on export |
| `getPath` / `width` / `height` | rendering, measurements | path geometry and `width`/`height`/`bounds` on snapshot nodes and handles |
| `anchorOffsetX` / `anchorOffsetY` | rendering (composition) | the anchor point an applied indicator positions against; a glyph whose `codeString` draws one code takes that code's for an axis it does not set |
| `isIndicator: true` | parser (part-merge, head-glyph exclusion) | `indicatorKind` / `indicatorLevel` on the resolved part; an `isIndicator` glyph is an atomic indicator unit. Indicator-ness also reads through single-code bare aliases: an alias resolving to an indicator behaves as that indicator in every indicator slot (`;;`, `;`-parts, `applyIndicators`) |
| `char` | rendering (text path) | the rendered Unicode character on the snapshot node's `.char` (external glyphs) |
| `kerningRules` | rendering | inter-glyph positions only (no field on the tree) |
| `shrinksPrecedingWordSpace: true` | rendering (spacing) | the auto-shrunk word space before the glyph |
| `defaultOptions` | rendering, serialization | the [own options](#a-definition-s-own-options) of the part the code is: they style what the definition draws, a part bracket where it is used overrides them, and a character, word or global option does not |

Public output surface: the handle/snapshot booleans `.isGlyph`,
`.isBlissGlyph`, `.isExternalGlyph`, `.isIndicator`, plus `.codeName`,
`.char`, `indicatorKind`, and `indicatorLevel` (see the [ElementHandle
API](#elementhandle)). The input field names that begin with `is…` are the
input form; read them back through these accessors, not by reaching into a
definition object.

**Falsey flags are omitted from parsed output.** A flag set `false` (or left
off) does not appear as a key on `toJSON()` — only truthy flags are emitted, so
a missing `isIndicator` and `isIndicator: false` are equivalent. Don't test for
a flag's absence as if it carried meaning.

```js
// Composite character: identity is kept in the tree, decomposed on export.
BlissSVGBuilder.define({ SMILEY: { type: 'glyph', codeString: 'C8:0,8;DOT:2,11' } });
const b = new BlissSVGBuilder('B313/SMILEY');
b.glyph(1).codeName;   // 'SMILEY'  (handle keeps the name)
b.toString();          // 'B313/C8:0,8;DOT:2,11'  (export decomposes)
new BlissSVGBuilder('SMILEY').toJSON({ preserve: true }).groups[0].glyphs[0];
// { parts: [{ codeName: 'SMILEY' }], codeName: 'SMILEY' }: no isIndicator key (falsey, omitted)

// External glyph: char surfaces on the snapshot node.
const x = new BlissSVGBuilder('Xa').snapshot().children[0].children[0];
x.char;             // 'a'
x.isExternalGlyph;  // true
```

These describe the current behavior. `define()` validates references, rejects
cycles and refuses content no use could draw, but does not validate option
*values* or coordinate ranges: do not rely on the definition API for that.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `overwrite` | `false` | Allow replacing existing definitions |

Pass `{ overwrite: true }` as the second argument to replace existing custom codes. Without it, existing codes are added to `skipped`. Built-in definitions cannot be overwritten (matching `patchDefinition` and `removeDefinition`): replacing one would change what existing compositions render in this instance only, so such an entry lands in `errors` instead.

### Warnings

`define()` also returns a `warnings` array. It reports definitions that WERE registered, so it is never a reason to treat the call as failed; a refusal is an `errors` entry. It carries what a `defaultOptions` bag could not keep: a value with no text form, refused and left out of the definition as it is [everywhere else](/handbook/syntax-options/options-system#values-from-javascript), and a single option written under both of its spellings (`MULTIPLE_OPTION_SPELLINGS`), where the last value written wins and the displaced one is named. Each report names the code it came from, since one call can define many.

```js
const result = BlissSVGBuilder.define({
  MYCHAR: { type: 'glyph', codeString: 'B291', defaultOptions: { strokeWidth: 1, 'stroke-width': 2 } }
});

result.defined;              // ['MYCHAR'] — registered, and the width is 2
result.warnings[0].code;     // 'MULTIPLE_OPTION_SPELLINGS'
result.warnings[0].source;   // 'strokeWidth=1' — the value that lost
```

## Query API

Static methods for inspecting registered definitions.

### `isDefined(code)`

Check if a code is registered:

```js
BlissSVGBuilder.isDefined('B313');   // true
BlissSVGBuilder.isDefined('CUSTOM'); // false (unless you defined it)
```

### `getDefinition(code)`

Get a frozen metadata object for a code:

```js
const def = BlissSVGBuilder.getDefinition('B313');
// {
//   type: 'glyph',        // 'shape' | 'glyph' | 'externalGlyph' | 'bare' | 'space'
//   isBuiltIn: true,
//   codeString: 'H:0,8',
//   ...
// }
```

Returns `null` if the code is not defined. The returned object is frozen.

Functions like `getPath` are included in the returned object (as the same function reference), so the result can be used for read-modify-write patterns.

### `patchDefinition(code, changes)`

Patch one or more properties on an existing custom definition without fully replacing it:

```js
BlissSVGBuilder.patchDefinition('MYCHAR', {
  anchorOffsetX: 2.0
});
```

Returns `{ patched: true, warnings }` on success, where `warnings` is the same array `define()` returns and is empty when there is nothing to report. Only properties valid for the definition's type are accepted. Built-in definitions cannot be patched.

Allowed properties by type:
- **glyph**: `codeString`, `anchorOffsetX`, `anchorOffsetY`, `width`, `isIndicator`, `shrinksPrecedingWordSpace`, `kerningRules`, `defaultOptions`
- **shape**: `getPath`, `codeString`, `width`, `height`, `x`, `y`, `extraPathOptions`, `defaultOptions`
- **externalGlyph**: `getPath`, `width`, `char`, `y`, `height`, `kerningRules`, `defaultOptions`
- **bare**: `codeString`, `defaultOptions`

Patching `defaultOptions` replaces the entire sub-object (not a deep merge). Patching `codeString` validates references and checks for circular dependencies.

**Throws** if the code is not defined or is built-in, `changes` is not an object, or a change violates the definition rules: an unknown property or internal/type flag (e.g. `type`, `isBuiltIn`) for the definition; `getPath` not a function; empty/non-string `codeString`; a `;;` in `codeString`; a `/` in a glyph-or-shape `codeString`; a disallowed reference type; a circular reference; a `;`-part that is itself a composition; a glyph `codeString` that bakes an indicator (or an `isIndicator` change that leaves one baked); internal coordinates in a multi-character bare `codeString` (kerning markers stay allowed); a `codeString` holding content no use could draw (see [Definition validation](#definition-validation)); a patch that would leave a shape with both `getPath` and `codeString`; a patch that would turn an already-referenced code into an indicator; or a key a definition cannot hold, in `defaultOptions` or in the character bracket that starts `codeString` (see [Definition validation](#definition-validation)). A rejected patch leaves the definition untouched (validation runs before any change is applied).

### `listDefinitions(filter?)`

List all defined codes, optionally filtered by type:

```js
BlissSVGBuilder.listDefinitions();                    // all codes
BlissSVGBuilder.listDefinitions({ type: 'shape' });   // only shapes
BlissSVGBuilder.listDefinitions({ type: 'glyph' });   // only glyphs
BlissSVGBuilder.listDefinitions({ type: 'bare' });    // only bare definitions
```

Filter types: `'shape'`, `'glyph'`, `'externalGlyph'`, `'bare'`, `'space'`

### `removeDefinition(code)`

Remove a custom definition. Returns `true` if removed, `false` if the code doesn't exist. Throws an error for built-in definitions (removing a built-in is a programming error):

```js
BlissSVGBuilder.define({ TEMP: { codeString: 'H:0,8' } });
BlissSVGBuilder.removeDefinition('TEMP'); // true
BlissSVGBuilder.removeDefinition('TEMP'); // false (already removed)

BlissSVGBuilder.removeDefinition('B313');
// Error: cannot remove built-in definitions
```

## Import Patterns

```js
// ES Modules
import { BlissSVGBuilder } from 'bliss-svg-builder';

// CommonJS
const { BlissSVGBuilder } = require('bliss-svg-builder');
```

For browser usage, see [Installation](/get-started/installation-setup).

## Warnings

### `warnings`

When the builder encounters an unknown or invalid code, it records a warning instead of throwing. This keeps the rest of the composition intact:

```js
const builder = new BlissSVGBuilder('B313/BADCODE/B431');

builder.warnings;
// [{ code: 'UNKNOWN_CODE', message: 'Unknown or invalid code: "BADCODE"', source: 'BADCODE' }]
```

By default, unknown codes produce a warning and render as invisible zero-width elements. To show a visual placeholder (a question mark symbol), enable the `error-placeholder` option:

```js
const builder = new BlissSVGBuilder('[error-placeholder]||B313/BADCODE/B431');
builder.svgCode; // renders B313, ?-square placeholder, B431
```

The placeholder applies at the character level: if any part of a character is unknown (e.g., `H;BADCODE`), the entire character is replaced by a single placeholder rather than mixing valid shapes with error markers.

This is useful for displaying feedback on blur or validation, while keeping the output clean during typing.

Each warning object has:

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | Warning type identifier (e.g., `'UNKNOWN_CODE'`) |
| `message` | `string` | Human-readable description, quoting the offending input |
| `source` | `string` | The problematic DSL code, exactly as written |

`source` and `message` always quote the original input verbatim, including any bracketed options or `{text}` content the parser had to look past:

```js
new BlissSVGBuilder('bad[color=red]|B313').warnings;
// ↳ source: 'bad[color=red]'
```

Valid input produces an empty array:

```js
new BlissSVGBuilder('B313').warnings; // []
```

Warnings are recalculated on each rebuild, so fixing an issue via a handle mutation clears the corresponding warning.

**Not exhaustive.** `warnings` surfaces recoverable parse and render problems, but a few mutation operations drop data without emitting one. For example, `mergeWithNext()` discards the absorbed word's options and `^` head marker silently (only its `;;` overlay warns `DROPPED_WORD_INDICATOR`). So treat `warnings` as a "something went wrong" signal, not a guarantee that an empty array means zero data loss across every mutation path.

Every code the builder can emit, with its trigger and an example, is listed in the [Warning Codes reference](/reference/warning-codes). In TypeScript, `code` is typed as the `WarningCode` union.

## Error Handling

The library distinguishes two kinds of failure: **throws** (structural problems that prevent rendering, or invalid API arguments) and **warnings** (recoverable problems; the valid parts still render). Neither kind surfaces through a callback or event; you inspect it directly after the call.

### What throws

The builder constructor, the definition API, the split operations, and the content mutation methods throw under specific conditions. Each is annotated with `@throws` in `index.d.ts` (visible in editor hover):

| Call | Throws when |
|------|-------------|
| `new BlissSVGBuilder(input)` | `input` is neither a DSL string nor a plain `toJSON()` object (number, `null`, array, `Date`, `Map`, ...) |
| `builder.merge(other)` | `other` is not a `BlissSVGBuilder` instance |
| `builder.splitAt(groupIndex)` | fewer than 2 groups, or `groupIndex` out of range (1..groupCount-1) |
| `groupHandle.splitAt(glyphIndex)` | `glyphIndex` out of range (1..glyphs.length-1); no-op (no throw) on non-group handles |
| add/insert/replace mutation methods | `code` spans more than one unit of the method's level, is empty at part level, or is a non-string (see [One unit per mutation call](#one-unit-per-mutation-call)) |
| `removeDefinition(code)` | `code` is a built-in |
| `patchDefinition(code, changes)` | not defined / built-in / non-object `changes` / a rule violation (see its section) |

```js
// Non-string, non-object input
new BlissSVGBuilder(42);
// Error: Input must be a DSL string or a plain object from toJSON()
```

Unknown codes and invalid DSL do **not** throw. They appear in `warnings` (see above).

ElementHandle mutation methods throw in three more misuse cases (documented at each method and in [Handle Lifetime](#handle-lifetime)): using a handle after its element has been removed (a stale handle); passing a non-string `code` to a content mutation method (a `TypeError`; `applyIndicators` throws it too, though it accepts `null` as its deliberate empty indicator set); and handing an options method an argument of the wrong type, meaning a non-object `opts` to a setter or a non-string key to a removal (a `TypeError` naming the method, thrown before anything is changed). By contrast, the constructor does not throw on content: `new BlissSVGBuilder('H//C8')` renders the two words, and a composition object of the wrong shape is read with the wrong part left out (`MALFORMED_ELEMENT`); its only throw is for a wrong input type (above). The mutation methods are deliberately stricter than the constructor, holding each call to one unit of content (next section).

### One unit per mutation call

Every content mutation method takes exactly one unit of its own level: one word group (`addGroup`, `insertGroup`, `replaceGroup`, and the raw element methods), one character (`addGlyph`, `insertGlyph`, `replaceGlyph`, `replace()` on a glyph handle), or one part (`addPart`, `insertPart`, `replacePart`, `replace()` on a part handle). A code that parses to more than one unit throws instead of keeping part of it, so content is never silently dropped:

```js
const builder = new BlissSVGBuilder('B313');

builder.addGroup('B431//B291');
// Error: Expected a single group, but code "B431//B291" produced 3 groups

builder.addGroup('B431').addGroup('B291'); // one call per word
```

The character-level methods also reject content that belongs above the character: multi-character codes, defined word names, word options, word indicator lists, and document-level options:

```js
builder.addGlyph('B313/B1103');        // Error: produced 2 glyphs
builder.addGlyph('[color=red]|B313');  // Error: carries word-level options
builder.addGlyph('B291;;B81');         // Error: carries a word-level indicator list
builder.addGlyph('[color=red]||B313'); // Error: carries document-level options
```

The fix is the same in every case: style the character itself (`[color=red]B313` or the `opts` parameter), apply indicators with `applyIndicators()` on the word, set document options on the builder input, or use `addGroup()` for word content (the artifact errors each name their own alternative; the multi-character and word-name errors report only the count).

The part-level methods (`addPart`, `insertPart`, `replacePart`, `replace()` on a part handle) are stricter still: a part references a single shape, so besides multi-part codes they reject every artifact from above the part, including a head marker (`^`), a word indicator list (`;;`), word options, document options, and any other `|` outside an option bracket (`|B313`, `B313|B431`): `|` and `||` end the options of a word and of the input, which a part does not have. A whole word passed to `addPart` is the one exception: it is kept as a failed part with a `WORD_AS_PART` warning (visible, not silently dropped) rather than throwing.

Defined word names count as words. To fuse one into an existing word, go through the group level:

```js
BlissSVGBuilder.define({ MYWORD: { codeString: 'B313/B1103' } });

const text = new BlissSVGBuilder('B291');
text.addGlyph('MYWORD');          // Error: 'MYWORD' produces 2 glyphs
text.addGroup('MYWORD');          // the word becomes its own group
text.group(0).mergeWithNext();    // then fuse it into the previous word
```

A non-string `code` (a number, `null`, an object) is a malformed call and throws a `TypeError` naming the method. A non-object `opts` (a string, number, boolean, or array) does the same, on every method that takes an options argument (including `setOptions` and the constructor); `null` and `undefined` mean "no options" and are accepted. On handles, the silent no-ops for wrong-level calls and for words that failed to parse win over the argument checks (those calls never read the argument); the builder methods check the argument first. Rejected calls leave the builder unchanged, and no warnings from the rejected parse leak into `warnings` (the option check runs before the code is parsed).

### Empty slots are deliberate

An omitted, empty, or whitespace-only `code` is not an error at group and glyph level: it creates an empty slot on purpose.

- `addGroup('')` / `insertGroup(i, '')` (and the raw element forms) add an empty word group; `addGlyph('')` / `insertGlyph(i, '')` add an empty character slot.
- The replace forms are destructive: `replaceGroup(i, '')`, `replaceGlyph(i, '')`, and `replace('')` on a glyph handle swap the target for an empty slot instead of doing nothing (a head designation on the replaced glyph dies with it).
- Empty slots render nothing, add no width, stay visible to navigation (`.groups`, `group(i)`, `stats.groupCount`), and round-trip through `toJSON()`. Fill them later: `group(i).addGlyph('B313')` fills an empty group, adding a part to an empty group wraps the part in a new character, and adding a part to an empty glyph fills that glyph.
- Parts are the exception: a part is a reference to a shape, not a container, so an empty part cannot exist. `addPart('')` throws, and the message points to `addGlyph('')` for reserving an empty slot.

One serialization asymmetry to know about: `toJSON()` always keeps empty slots, but a bare empty group or glyph has no DSL token, so it survives `toJSON()` round-trips and not `toString()` round-trips. An options-carrying empty serializes and round-trips on both surfaces: `[color=red]|` for an empty group, `[color=red]` for an empty glyph (saved [without options](#saving-without-options), it is a bare empty again). An empty glyph holding kerning is written as its kerning marker and `[]` (`B313/RK:3/[]`), with or without options, so the kerning stays with the slot until something fills it. Either way, serialized spacing matches rendered spacing.

### What does NOT throw: `define()` and content errors

`define()` never throws for a bad definition. Each entry is validated independently and rejections land in `result.errors` (the other entries still register), so you must inspect the return value:

```js
const result = BlissSVGBuilder.define({ 'BAD': { type: 'glyph', codeString: 'B313/B1103' } });
result.defined;  // []
result.errors;   // ['"BAD": ... a glyph definition cannot be a multi-character word ...']
```

### The check-after-each-call discipline

```js
// 1. define(): inspect the return value (it does not throw)
const res = BlissSVGBuilder.define(defs);
if (res.errors.length) { /* rejected entries */ }

// 2. construction: try/catch only for the input-type throw; warnings for content
try {
  const builder = new BlissSVGBuilder(input);
  if (builder.warnings.length) { /* unknown codes, misplaced options, ... */ }
} catch (err) {
  // only a wrong input type (not a string / plain object) lands here
}
```

`builder.warnings` is populated at construction (no need to render first) and re-derived on each rebuild.

### Safety Limits

The library enforces limits to prevent runaway processing:

| Limit | Value | Description |
|-------|-------|-------------|
| Input length | 10,000 characters | Maximum DSL string length |
| Recursion depth | 50 levels | Maximum nesting depth for code expansion |

These limits protect against accidental infinite recursion in custom definitions (e.g., a glyph whose `codeString` references itself).

## Server-Side Usage

The library uses a **shared module-level singleton** for definitions. In browser contexts this is rarely an issue, but in server environments (Node.js, Deno, edge runtimes) there are important implications:

### Shared definitions across requests

All `BlissSVGBuilder` instances share the same definition registry. If one request calls `define()`, those definitions are visible to every subsequent request in the same process:

```js
// Request A
BlissSVGBuilder.define({ CUSTOM: { codeString: 'B313' } });

// Request B (later, same process) can use CUSTOM
new BlissSVGBuilder('CUSTOM'); // works
```

### Cleaning up custom definitions

Custom definitions persist for the lifetime of the process. If you register per-request definitions, clean them up afterwards with `removeDefinition()`:

```js
BlissSVGBuilder.define({ TEMP: { codeString: 'B431' } });
// ... use TEMP ...
BlissSVGBuilder.removeDefinition('TEMP');
```

