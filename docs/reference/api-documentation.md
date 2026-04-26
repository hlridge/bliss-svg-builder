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

Options use camelCase keys and native JS types. See [Programmatic Options](/handbook/syntax-options/programmatic-options) for the full key mapping and precedence rules.

### Round-trip from toJSON()

The constructor also accepts the plain object returned by `toJSON()`, recreating an identical builder:

```js
const original = new BlissSVGBuilder('B313/B1103//B431');
const snapshot = original.toJSON();

// Later: rebuild from the snapshot
const rebuilt = new BlissSVGBuilder(snapshot);
rebuilt.svgCode; // identical output
```

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

Returns only the inner SVG content (paths and groups) without the `<svg>` wrapper:

```js
const builder = new BlissSVGBuilder('B313');
const inner = builder.svgContent;
// '<path d="..."/>' or '<g ...>...</g>'
```

Use for: compositing into larger SVG documents, extracting raw path data.

## Serialization

### `toJSON(options?)`

Returns a normalized plain object representing the parsed composition. Aliases are resolved to canonical codes. Feed this back into the constructor to recreate an identical builder:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
const obj = builder.toJSON();
// {
//   groups: [
//     { glyphs: [
//       { codeName: 'B313', parts: [{ codeName: 'B313' }], ... },
//       { codeName: 'B1103', parts: [{ codeName: 'B335' }, { codeName: 'B412', x: 4, y: 0 }], ... }
//     ]},
//     { glyphs: [{ parts: [{ codeName: 'TSP' }] }] },
//     { glyphs: [{ parts: [{ codeName: 'B431' }, { codeName: 'B81', isIndicator: true, width: 2 }] }] }
//   ],
//   options: {}
// }
```

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
- **Typeless aliases** (word-level codes) are always expanded to their underlying codes.
- **Custom glyphs** are decomposed by default. Simple aliases resolve to their built-in code (e.g., `LOVE` becomes `B431`). Complex compositions drop the custom code entirely (parts are already expanded).
- Pass `{ preserve: true }` to keep all custom code names as-is.

```js
BlissSVGBuilder.define({ 'LOVE': { type: 'glyph', codeString: 'B431' } });

new BlissSVGBuilder('LOVE').toJSON();                     // codeName: 'B431'
new BlissSVGBuilder('LOVE').toJSON({ preserve: true });   // codeName: 'LOVE'
```

### Indicators in the tree

Indicators always appear as parts within their parent glyph, marked with `isIndicator: true`. Word-level indicator syntax (`;;`) is resolved during parsing, so the tree always shows indicators attached to a specific glyph, never to a group.

Use for: inspecting parsed structure, storing snapshots, server-side processing.

### `toString(options?)`

Returns a portable DSL string representation of the composition:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
builder.toString();
// 'B313/B1103//B431;B81'
```

Custom code behavior:
- **Typeless aliases** (word-level codes) are always expanded, never preserved.
- **Custom glyphs and shapes** are decomposed to built-in codes by default.
- Pass `{ preserve: true }` to keep custom code names.

```js
BlissSVGBuilder.define({
  'SMILEY': { type: 'glyph', codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14' }
});

new BlissSVGBuilder('SMILEY').toString();
// 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'

new BlissSVGBuilder('SMILEY').toString({ preserve: true });
// 'SMILEY'
```

### Indicator Resolution

`toString()` returns the resolved form of the composition. Word-level indicator syntax (`;;`) resolves to character-level syntax (`;`), with indicators attached directly to the head glyph:

```js
const builder = new BlissSVGBuilder('B313/B1103;;B81');
builder.toString();
// 'B313;B81/B1103' — indicator moved to head glyph
```

Passing the resolved output back into the constructor produces an identical result.

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

Methods on the builder instance for modifying content. All return `this` for chaining. Out-of-range indices are silently ignored (no error thrown, no mutation performed).

```js
// Builder methods return the builder, so you can chain into properties
const svg = new BlissSVGBuilder()
  .addGlyph('B313')
  .addGlyph('B1103')
  .addGroup('B431')
  .svgCode;
```

### `addGroup(code, opts?)`

Appends a new glyph group with automatic space management:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGroup('B431');
// equivalent to new BlissSVGBuilder('B313//B431')
```

### `addGlyph(code, opts?)`

Appends a glyph to the last glyph group. Creates a group if the builder is empty:

```js
const builder = new BlissSVGBuilder('B313');
builder.addGlyph('B1103');
// equivalent to new BlissSVGBuilder('B313/B1103')
```

### `addPart(code, opts?)`

Appends a part to the last glyph of the last group:

```js
const builder = new BlissSVGBuilder('B313');
builder.addPart('B81');
// appends B81 to B313, equivalent to 'B313;B81'
```

### `insertGroup(index, code, opts?)`

Inserts a group at the given position. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.insertGroup(1, 'B291');
// now equivalent to 'B313//B291//B431'
```

### `removeGroup(index)`

Removes the group at the given index. Negative indices count from the end:

```js
builder.removeGroup(-1); // remove last group
```

### `replaceGroup(index, code, opts?)`

Replaces the group at the given index with new content:

```js
builder.replaceGroup(0, 'B431', { color: 'red' });
```

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
Throws if `groupIndex` is out of range.

### `clear()`

Removes all content:

```js
builder.clear();
builder.toJSON().groups; // []
```

### Raw Element Methods

These operate on the raw groups array with no automatic space management. Use them for direct control over space groups and element positioning.

The managed methods (`addGroup`, `insertGroup`, `removeGroup`) auto-insert and clean up space groups. The raw element methods do not.

#### `addElement(code, opts?)`

Appends a raw group. No space group is inserted:

```js
const builder = new BlissSVGBuilder('B313');
builder.addElement('B431');
// [B313, B431] — no space between
```

#### `insertElement(index, code, opts?)`

Inserts a raw group at the given index. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313/B431');
builder.insertElement(0, 'SP');
// [SP, B313/B431] — leading space

builder.insertElement(1, 'SP');
// inserts space at raw index 1
```

`SP` auto-resolves to `TSP` (standard spacing) or `QSP` (reduced spacing before punctuation). Use `TSP` or `QSP` explicitly to bypass resolution.

#### `removeElement(index)`

Removes the raw group at the given index (plain splice, no space cleanup). Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.removeElement(1); // remove space group
// [B313, B431] — adjacent, no space
```

#### `replaceElement(index, code, opts?)`

Replaces the raw group at the given index. Negative indices count from the end:

```js
const builder = new BlissSVGBuilder('B313//B431');
builder.replaceElement(1, 'QSP'); // swap TSP for QSP
```

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

Returns the code name of this element (e.g., `'B291'`).

#### `.isIndicator`

On a part handle, returns `true` if this part is an indicator. Returns `false` on glyph and group handles:

```js
builder.glyph(0).part(1).isIndicator; // true for indicator parts
```

### Dimensions

Handles expose read-only dimension getters that pull values from the snapshot tree. These are live: they reflect the current state and update automatically after mutations.

#### `.x`, `.y`

Absolute position of this element's origin:

```js
const group = builder.group(0);
console.log(group.x, group.y); // position of the first word group
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

Absolute bounding box (`{ x, y, width, height }`):

```js
const bounds = builder.group(0).glyph(0).bounds;
// { x: 0, y: 0, width: 128, height: 256 }
```

#### `.measure()`

Returns all dimension properties at once in a frozen object. More efficient than reading individual getters when you need multiple values:

```js
const m = builder.group(0).measure();
// { x, y, width, height, bounds, advanceX, baseWidth }

// Useful for editor integration
const cursor = { left: m.x + m.advanceX, top: m.y };
const highlight = { left: m.bounds.x, width: m.bounds.width };
```

### Structural Mutation

All structural methods trigger a rebuild and return `this` for chaining (except `remove()` which returns `undefined`). Out-of-range indices are silently ignored (no error thrown, no mutation performed). Calling a method on the wrong handle level (e.g., `.addGlyph` on a part handle) also returns `this` with no effect.

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

#### `.addGlyph(code, opts?)`

Appends a glyph to this group:

```js
builder.group(0).addGlyph('B1103');
```

#### `.insertGlyph(index, code, opts?)`

Inserts a glyph at a specific position within this group:

```js
builder.group(0).insertGlyph(0, 'B431'); // prepend
```

#### `.addPart(code, opts?)`

On a glyph handle, appends a part to that glyph. On a group handle, delegates to the last glyph in the group:

```js
builder.glyph(0).addPart('B81');
builder.group(0).addPart('B81'); // appends to last glyph in group
```

#### `.insertPart(index, code, opts?)`

Inserts a part at a specific position within this glyph:

```js
builder.glyph(0).insertPart(0, 'B81'); // prepend
```

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

#### `.replace(code, opts?)`

Replaces the element with new content:

```js
builder.glyph(0).replace('B431');
```

#### `.removeGlyph(index)`

On a group handle, removes the glyph at the given index. Negative indices count from the end. Returns the group handle for chaining:

```js
builder.group(0).removeGlyph(-1); // remove last glyph
```

#### `.replaceGlyph(index, code, opts?)`

On a group handle, replaces the glyph at the given index:

```js
builder.group(0).replaceGlyph(0, 'B431');
```

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

### Space Manipulation

#### `.splitAt(glyphIndex)`

On a group handle, splits the word group into two at the glyph boundary, inserting a space group between. Returns `this` (the handle stays on the first half):

```js
const builder = new BlissSVGBuilder('B313/B1103/B431');
builder.group(0).splitAt(2);
// now: [B313/B1103] [SP] [B431]
```

The first half keeps the original options object. The second half receives a shallow copy. Throws if `glyphIndex` is out of range (must be between 1 and `glyphs.length - 1` inclusive):

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

No-op when there is no next word group, or when called on a space group or non-group handle.

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

#### `.removeOptions(...keys)`

Removes specific option keys:

```js
builder.glyph(0).removeOptions('color', 'strokeWidth');
```

### Indicator Mutation

Indicator methods manage the grammatical indicator parts on a glyph. Unlike other mutation methods, the `opts` parameter accepts `{ stripSemantic?: boolean }`, not `BlissOptions`.

#### `.applyIndicators(code, opts?)`

On a glyph handle, replaces all existing indicators with the given code. `code` is required (throws if missing; use `clearIndicators()` to remove). Semantic indicators are preserved unless the new code includes one or `{ stripSemantic: true }` is passed:

```js
builder.glyph(0).applyIndicators('B86');
builder.glyph(0).applyIndicators('B81;B86');
builder.glyph(0).applyIndicators('B86', { stripSemantic: true });
```

Non-indicator codes are silently filtered out.

#### `.clearIndicators(opts?)`

On a glyph handle, removes all grammatical indicators. Semantic indicators are preserved by default:

```js
builder.glyph(0).clearIndicators();
builder.glyph(0).clearIndicators({ stripSemantic: true });
```

#### `.applyHeadIndicators(code, opts?)`

On a group handle, applies indicators to the head glyph. Equivalent to the `;;` DSL syntax:

```js
builder.group(0).applyHeadIndicators('B86');
```

#### `.clearHeadIndicators(opts?)`

On a group handle, clears indicators from the head glyph:

```js
builder.group(0).clearHeadIndicators();
builder.group(0).clearHeadIndicators({ stripSemantic: true });
```

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
result.skipped;  // codes that already existed
result.errors;   // codes that failed validation
```

The `type` field controls what kind of definition is created: `'glyph'`, `'shape'`, or `'externalGlyph'`. When omitted, `codeString` definitions create bare codes (words, aliases), while `getPath` definitions are auto-detected as shapes or external glyphs. Note: `'bare'` and `'space'` are read-only types reported by `getDefinition()` and `listDefinitions()`, not valid inputs to `define()`.

**Bare definition (omit type): words, aliases, general codes:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeString` | `string` | yes | Composition using existing codes |
| `defaultOptions` | `object` | no | Default options, overridable per-element |

**type: 'glyph': Bliss character with glyph metadata:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeString` | `string` | yes | Composition using existing codes |
| `defaultOptions` | `object` | no | Default options, overridable per-element |
| `isIndicator` | `boolean` | no | Marks this glyph as an indicator |
| `anchorOffsetX` | `number` | no | Horizontal anchor adjustment |
| `anchorOffsetY` | `number` | no | Vertical anchor adjustment |
| `width` | `number` | no | Width override |
| `shrinksPrecedingWordSpace` | `boolean` | no | Auto-shrink word space before this glyph (like punctuation) |

**type: 'shape': primitive (getPath) or composite (codeString):**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | if primitive | Returns SVG path `d` string |
| `width` | `number` | if primitive | Shape width in grid units |
| `height` | `number` | if primitive | Shape height in grid units |
| `codeString` | `string` | if composite | Composition using existing codes |
| `x` | `number` | no | Default x offset |
| `y` | `number` | no | Default y offset |
| `extraPathOptions` | `object` | no | Extra options passed to `getPath` |
| `defaultOptions` | `object` | no | Default options, overridable per-element |

**type: 'externalGlyph': external font character:** <Badge type="warning" text="Experimental" />

For adding characters from external font systems. Requires providing your own SVG path data.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | yes | Returns SVG path `d` string |
| `width` | `number` | yes | Glyph width |
| `glyph` | `string` | yes | Character identifier |
| `y` | `number` | no | Y offset |
| `height` | `number` | no | Glyph height |
| `kerningRules` | `object` | no | Kerning pair adjustments |

**Auto-detection (no type, getPath-based):**
- Has `getPath` + `glyph` → external glyph
- Has `getPath` (no `glyph`) → shape

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `overwrite` | `false` | Allow replacing existing definitions |

Pass `{ overwrite: true }` as the second argument to replace existing codes. Without it, existing codes are added to `skipped`.

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

Returns `{ patched: true }` on success. Only properties valid for the definition's type are accepted. Built-in definitions cannot be patched.

Allowed properties by type:
- **glyph**: `codeString`, `anchorOffsetX`, `anchorOffsetY`, `width`, `isIndicator`, `shrinksPrecedingWordSpace`, `kerningRules`, `defaultOptions`
- **shape**: `getPath`, `codeString`, `width`, `height`, `x`, `y`, `extraPathOptions`, `defaultOptions`
- **externalGlyph**: `getPath`, `width`, `glyph`, `y`, `height`, `kerningRules`, `defaultOptions`
- **bare**: `codeString`, `defaultOptions`

Patching `defaultOptions` replaces the entire sub-object (not a deep merge). Patching `codeString` validates references and checks for circular dependencies.

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

For browser usage (ES module and UMD), see [Installation](/get-started/installation-setup).

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
| `message` | `string` | Human-readable description |
| `source` | `string` | The problematic DSL code |

Valid input produces an empty array:

```js
new BlissSVGBuilder('B313').warnings; // []
```

Warnings are recalculated on each rebuild, so fixing an issue via a handle mutation clears the corresponding warning.

## Error Handling

The builder throws for structural problems that prevent any rendering:

```js
// Non-string, non-object input
new BlissSVGBuilder(42);
// Error: Input must be a DSL string or a plain object from toJSON()
```

Unknown codes do **not** throw. They appear in `warnings` (see above).

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

