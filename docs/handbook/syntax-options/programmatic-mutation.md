# Programmatic Mutation

Build and modify Bliss compositions programmatically: add glyphs, rearrange parts, change options, all from JavaScript.

## Why Mutate?

Sometimes a static DSL string isn't enough. You might need to:

- Build compositions step by step from user input
- Add or remove glyphs in a dynamic UI
- Apply conditional styling based on application state
- Transform existing compositions programmatically

The mutation API lets you do all of this on a live builder instance, with every change immediately reflected in the SVG output.

## The Element Tree

Every composition has a three-level hierarchy:

```
Builder
 └─ Glyph Groups (words)
     └─ Glyphs (characters)
         └─ Parts (components within a character)
```

For example, `B313/B1103//B431;B81` creates:

- **Group 0**: B313, B1103
- **Group 1**: one glyph with parts B431 and B81

Indicators are parts within a glyph, marked with `isIndicator: true`. Word-level indicator syntax (`;;`) resolves so indicators are always attached to a specific glyph in the tree. See [DSL Syntax Quick Reference](/reference/dsl-syntax-quick-reference#indicator-resolution) for details.

## Navigating the Tree

The builder provides methods to get live handles into this tree:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');

builder.group(0);  // first glyph group → B313/B1103
builder.group(1);  // second glyph group → B431
builder.glyph(0);  // first glyph across all groups → B313
builder.glyph(2);  // third glyph → B431
```

Handles can navigate deeper:

```js
builder.group(0).glyph(1);  // B1103 within first group
builder.glyph(0).part(0);   // first part of B313
```

Negative indices count from the end:

```js
builder.group(-1);   // last group
builder.glyph(-1);   // last glyph
builder.glyph(-2);   // second-to-last glyph
```

Out-of-range indices return `null`:

```js
builder.group(99);  // null
```

### Finding Elements by Key

Use `getElementByKey()` with keys from a snapshot:

```js
const snap = builder.snapshot();
const key = snap.children[0].children[0].key;
const handle = builder.getElementByKey(key);
```

## Adding Content

### Starting from an Empty Builder

The constructor accepts no arguments, creating an empty builder you can populate programmatically:

```js
const builder = new BlissSVGBuilder();
builder.addGlyph('B313');
builder.addGlyph('B1103');
// equivalent to new BlissSVGBuilder('B313/B1103')
```

### Adding Glyph Groups

`addGroup()` appends a new glyph group with automatic spacing:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGroup('B431');
// now equivalent to 'B313//B431'
```

### Adding Glyphs

Add to the last group with the builder's `addGlyph()`:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGlyph('B1103');
// now equivalent to 'B313/B1103'
```

Or add to a specific group via its handle:

```js
builder.group(0).addGlyph('B291');
```

Insert at a specific position:

```js
builder.group(0).insertGlyph(0, 'B431'); // prepend
```

### Adding Parts

Add parts to compose characters inline:

```js
const builder = new BlissSVGBuilder('H');
builder.glyph(0).addPart('C8');
// now equivalent to 'H;C8'
```

The builder also has a shorthand that appends to the last glyph of the last group:

```js
const builder = new BlissSVGBuilder('B313');
builder.addPart('B81');
// appends B81 to B313, equivalent to 'B313;B81'
```

Insert at a specific position:

```js
builder.glyph(0).insertPart(0, 'B81'); // prepend
```

## Modifying Content

### Replacing Elements

Replace a glyph or part with new content:

```js
const builder = new BlissSVGBuilder('B313/B1103');
builder.glyph(0).replace('B431');
// now equivalent to 'B431/B1103'
```

### Setting Options

Merge options onto any element:

```js
builder.glyph(0).setOptions({ color: 'red' });
builder.group(0).setOptions({ strokeWidth: 0.6 });
```

Options use camelCase keys, the same keys as [programmatic options](/handbook/syntax-options/programmatic-options).

### Removing Options

Remove specific options by key:

```js
builder.glyph(0).removeOptions('color');
```

## Removing Content

`remove()` deletes an element from its parent:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431');
builder.glyph(1).remove();
// now equivalent to 'B313//B431'
```

Removal cascades automatically:
- Removing the **last glyph** in a group removes the group (and its space)
- Removing the **last part** in a glyph removes the glyph

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.glyph(1).remove(); // B431 was the only glyph in group 1
// now equivalent to 'B313' (group and space removed)
```

### Non-Cascading Removal with `detach()`

Sometimes you want to remove an element without cascade cleanup. `detach()` does a plain splice: it disconnects the node from its parent and nothing more.

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.glyph(1).detach(); // removes B431 but leaves the empty group and space
```

Compare with `remove()`:

| Method | Behavior |
|--------|----------|
| `remove()` | Cascades: empty parents and adjacent spaces are cleaned up |
| `detach()` | Plain splice: just disconnects from parent, no cleanup |

Use `detach()` for fine-grained structural control. You can compose it with navigation instead of needing separate raw methods:

```js
builder.group(0).glyph(1).detach();  // plain-splice a glyph from a group
builder.glyph(0).part(2).detach();   // plain-splice a part from a glyph
```

Like `remove()`, `detach()` returns `undefined` and cannot be chained. It can produce empty containers that render as zero-width elements. This is intentional for fine-grained structural control.

### Parent-Centric Remove and Replace

Instead of getting a handle and calling `remove()` on it, you can operate by index from the parent:

```js
// Remove/replace glyphs within a group
builder.group(0).removeGlyph(-1);           // remove last glyph
builder.group(0).replaceGlyph(0, 'B431');   // replace first glyph

// Remove/replace parts within a glyph
builder.glyph(0).removePart(-1);            // remove last part
builder.glyph(0).replacePart(0, 'B81');     // replace first part
```

The parent-centric methods return the parent handle (not `undefined`), so they can be chained.

### Builder Group Operations

The builder provides direct methods for removing and replacing groups:

```js
builder.removeGroup(-1);                          // remove last group
builder.replaceGroup(0, 'B431', { color: 'red' }); // replace first group
builder.insertGroup(1, 'B291');                    // insert at position 1
```

Clear everything:

```js
builder.clear();
```

## Raw Element Access

The managed API (`group()`, `addGroup()`, `removeGroup()`) auto-manages space groups between words. For direct control, including access to space groups, use the raw element API.

### Navigating All Elements

`element()` accesses all groups by raw index, including spaces:

```js
const builder = new BlissSVGBuilder('B313//B431');
// Raw layout: [word group] [space group] [word group]

builder.element(0);  // first word group (B313)
builder.element(1);  // space group (TSP)
builder.element(2);  // second word group (B431)
builder.element(-1); // last group
builder.elementCount; // 3
```

Both return the same `ElementHandle`. The only difference is indexing:

| Navigation | Indexing |
|------------|---------|
| `builder.group(i)` | Skips space groups (word 0, word 1, ...) |
| `builder.element(i)` | Raw index over all groups including spaces |

Space management is a property of the **builder-level CRUD methods**, not the handles:

| CRUD methods | Manages spaces? |
|-------------|----------------|
| `addGroup` / `insertGroup` / `removeGroup` | Yes (auto-inserts/removes space groups) |
| `addElement` / `insertElement` / `removeElement` | No (plain splice) |

### Modifying Raw Elements

Insert, remove, and replace by raw index with no automatic space management:

```js
// Insert a space between two adjacent word groups
builder.insertElement(1, 'SP');

// Append a raw group (no auto-space inserted)
builder.addElement('B291');

// Remove a space group (adjacent words are not merged)
builder.removeElement(1);

// Replace a space with a different type
builder.replaceElement(1, 'QSP');
```

`SP` is the standard space code. It auto-resolves to `TSP` (standard word spacing) or `QSP` (reduced spacing before punctuation). You can also use `TSP` or `QSP` explicitly for precise control.

### Inspecting Space Groups

Space groups are identified in snapshots with the `isSpaceGroup` flag:

```js
const snap = builder.snapshot();
snap.children.forEach(child => {
  if (child.isSpaceGroup) {
    console.log('space group at index', child.index);
  }
});
```

Handles returned by `element()` are standard group handles. All existing methods work on them: `glyph()`, `addGlyph()`, `removeGlyph()`, `setOptions()`, `remove()`, `detach()`.

## Space Manipulation

### Splitting Words

`splitAt()` divides a word group into two separate words with a space between:

```js
const builder = new BlissSVGBuilder('B313/B1103/B431');
builder.group(0).splitAt(2);
// now equivalent to 'B313/B1103//B431'
```

The handle stays on the first half (the original group). Access the second half via `builder.group(1)`. The first half retains the original options object. The second half receives a shallow copy with the same values.

### Merging Words

`mergeWithNext()` absorbs the next word group into the current one, removing spaces in between:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.group(0).mergeWithNext();
// now equivalent to 'B313/B431'
```

The merged word keeps the first word's options. The absorbed word's options are discarded. If there is no next word group, `mergeWithNext()` is a no-op.

## Indicator Operations

Indicators mark a glyph's grammatical role (action, description, thing). The mutation API provides dedicated methods for managing indicators with the same semantic preservation behavior as the DSL's `;;` syntax.

### Applying Indicators

Replace all indicators on a glyph with `applyIndicators()`:

```js
const builder = new BlissSVGBuilder('B291');
builder.glyph(0).applyIndicators('B86');
// now equivalent to 'B291;B86'
```

Multiple indicators use semicolon-separated codes:

```js
builder.glyph(0).applyIndicators('B81;B86');
```

Non-indicator codes in the argument are silently filtered out, matching DSL behavior.

### Semantic Preservation

Semantic indicators (thing, abstract) are automatically preserved when you replace indicators, unless the new indicators already include one:

```js
const builder = new BlissSVGBuilder('B291;B97'); // B97 = thing indicator
builder.glyph(0).applyIndicators('B81');
// B97 preserved: now 'B291;B81;B97'
```

To strip the semantic indicator, pass `{ stripSemantic: true }`:

```js
builder.glyph(0).applyIndicators('B86', { stripSemantic: true });
// B97 removed: now 'B291;B86'
```

### Clearing Indicators

Remove all grammatical indicators with `clearIndicators()`. Semantic indicators are preserved by default:

```js
const builder = new BlissSVGBuilder('B291;B86;B97');
builder.glyph(0).clearIndicators();
// B86 removed, B97 preserved: now 'B291;B97'
```

To clear everything including semantic:

```js
builder.glyph(0).clearIndicators({ stripSemantic: true });
// now 'B291'
```

### Word-Level Indicators

Apply indicators to a group's head glyph with `applyHeadIndicators()` and `clearHeadIndicators()`. These are the mutation API equivalent of the `;;` DSL syntax:

```js
const builder = new BlissSVGBuilder('B291/B303');
builder.group(0).applyHeadIndicators('B86');
// equivalent to 'B291/B303;;B86'
```

```js
builder.group(0).clearHeadIndicators();
// equivalent to 'B291/B303;;'
```

Both accept `{ stripSemantic: true }` (equivalent to `;;!`).

### Inspecting Indicators

The `isIndicator` getter on part handles returns whether a part is an indicator:

```js
const builder = new BlissSVGBuilder('B291;B86');
builder.glyph(0).part(0).isIndicator; // false (B291 is base)
builder.glyph(0).part(1).isIndicator; // true  (B86 is indicator)
```

## Chaining

Builder methods return the builder, so you can chain into builder properties:

```js
const svg = new BlissSVGBuilder('B313')
  .addGroup('B1103')
  .addGroup('B431')
  .svgCode;
```

Handle methods return the handle, so you can chain further handle operations:

```js
builder.group(0)
  .setOptions({ color: 'blue' })
  .addGlyph('B291');
```

Handle chains stay on the handle. To access builder properties after handle mutations, use a separate statement:

```js
builder.group(0).addGlyph('B291');
builder.svgCode; // back on the builder
```

Note: `remove()` returns `undefined` and cannot be chained.

## Combining and Splitting Builders

### Merging Two Builders

Combine saved texts into one builder. The receiving builder's global
options apply to everything:

```js
const morning = new BlissSVGBuilder('[color=red]||B313/B1103');
const afternoon = new BlissSVGBuilder('[color=blue]||B431//B291');

morning.merge(afternoon);
// morning now contains all words, styled with color=red
// afternoon is unchanged
```

## Snapshots vs Live Handles

The builder offers two ways to inspect the tree:

| | `snapshot()` | `group()` / `glyph()` / `part()` |
|---|---|---|
| Type | Frozen tree | Live `ElementHandle` |
| Mutates? | No | Yes |
| Survives rebuilds? | Snapshot is isolated | Handle stays live across mutations |
| Use for | Reading, diffing, serialization | Modifying content |

Handles stay live across mutations to other parts of the tree. A handle
throws only when its own node has been removed (similar to DOM references).

Snapshots are frozen and unaffected by later mutations:

```js
const snap = builder.snapshot();
builder.glyph(0).remove();
snap.children; // still has the original structure
```

## Options

All mutation methods that accept a code string also accept an options parameter. Pass flat options to apply them as overrides:

```js
builder.addGroup('B431', { color: 'red' });
builder.glyph(0).replace('B313', { color: 'green' });
builder.glyph(0).setOptions({ color: 'red', strokeWidth: 0.6 });
```

### Defaults and Overrides

When you need separate defaults and overrides, use the structured format with the same precedence as the [constructor](/handbook/syntax-options/programmatic-options):

```js
builder.addGroup('[color=red]B431', {
  defaults: { strokeWidth: 0.6 },  // applied if not set in DSL
  overrides: { fill: 'blue' }       // always applied
});
```

Precedence: `defaults` → DSL string → `overrides`.

Flat options `{ color: 'red' }` are equivalent to `{ overrides: { color: 'red' } }`. The structured format is only needed when you want to set defaults that the DSL string can override.
