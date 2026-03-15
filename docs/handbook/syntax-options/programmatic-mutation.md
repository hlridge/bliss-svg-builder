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

## Snapshots vs Live Handles

The builder offers two ways to inspect the tree:

| | `snapshot()` | `group()` / `glyph()` / `part()` |
|---|---|---|
| Type | Frozen tree | Live `ElementHandle` |
| Mutates? | No | Yes |
| Survives rebuilds? | Snapshot is isolated | Handle stays live |
| Use for | Reading, diffing, serialization | Modifying content |

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
