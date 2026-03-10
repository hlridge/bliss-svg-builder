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

Out-of-range indices return `null`:

```js
builder.group(99);  // null
builder.glyph(-1);  // null
```

### Finding Elements by ID

Use `getElementById()` with IDs from a snapshot:

```js
const snap = builder.snapshot();
const id = snap.children[0].children[0].id;
const handle = builder.getElementById(id);
```

## Adding Content

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

Clear everything:

```js
builder.clear();
```

## Chaining

Builder methods and most handle methods return `this`, enabling fluent chains:

```js
// Builder chaining
const svg = new BlissSVGBuilder('B313')
  .addGroup('B1103')
  .addGroup('B431')
  .svgCode;

// Handle chaining
builder.group(0)
  .setOptions({ color: 'blue' })
  .addGlyph('B291');
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

## Defaults and Overrides

All mutation methods that accept a code string also accept `{ defaults, overrides }`, the same precedence as the [constructor](/handbook/syntax-options/programmatic-options):

```js
builder.addGroup('[color=red]B431', {
  defaults: { strokeWidth: 0.6 },  // applied if not set in DSL
  overrides: { fill: 'blue' }       // always applied
});

builder.glyph(0).replace('B313', {
  overrides: { color: 'green' }
});
```

Precedence: `defaults` → DSL string → `overrides`.
