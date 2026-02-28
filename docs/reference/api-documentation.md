# API Documentation

JavaScript API reference for Bliss SVG Builder.

## Constructor

```js
new BlissSVGBuilder(input)
new BlissSVGBuilder(input, { defaults, overrides })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` or `object` | DSL input string, or a plain object from `toJSON()` |
| `defaults` | `object` | Options applied when the DSL string doesn't set them (optional) |
| `overrides` | `object` | Options that always win, even over the DSL string (optional) |

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const builder = new BlissSVGBuilder('B313');

// With defaults and overrides
const styled = new BlissSVGBuilder('B313', {
  defaults: { color: 'red', grid: true },
  overrides: { strokeWidth: 0.6 }
});
```

The second parameter uses camelCase keys and native JS types. See [Programmatic Options](/handbook/syntax-options/programmatic-options) for the full key mapping and precedence rules.

### Round-trip from toJSON()

The constructor also accepts the plain object returned by `toJSON()`, recreating an identical builder:

```js
const original = new BlissSVGBuilder('B313/B1103//B431');
const snapshot = original.toJSON();

// Later — rebuild from the snapshot
const rebuilt = new BlissSVGBuilder(snapshot);
rebuilt.svgCode; // identical output
```

## SVG Output

Four properties for getting the rendered SVG in different formats:

### `svgCode`

Returns the SVG as a string — the most common output for embedding in HTML:

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

Returns the SVG with an XML declaration — suitable for saving as `.svg` files:

```js
const builder = new BlissSVGBuilder('B313');
const fileContent = builder.standaloneSvg;
// '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<svg ...>...</svg>'
```

Use for: `.svg` file export, standalone SVG documents.

### `svgContent`

Returns only the inner SVG content (paths and groups) without the `<svg>` wrapper:

```js
const builder = new BlissSVGBuilder('B313');
const inner = builder.svgContent;
// '<path d="..."></path>' or '<g ...>...</g>'
```

Use for: compositing into larger SVG documents, extracting raw path data.

## Serialization

### `toJSON()`

Returns a normalized plain object representing the parsed composition. Aliases are resolved to canonical codes. Feed this back into the constructor to recreate an identical builder:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
const obj = builder.toJSON();
// {
//   groups: [
//     { glyphs: [{ code: 'B313', ... }, { code: 'B1103', ... }] },
//     { glyphs: [{ code: 'TSP' }] },
//     { glyphs: [{ code: 'B431', parts: [{ code: 'B431' }, { code: 'B81' }] }] }
//   ],
//   options: { ... }
// }
```

Use for: inspecting parsed structure, storing snapshots, server-side processing.

### `toString()`

Returns a DSL string representation of the composition:

```js
const builder = new BlissSVGBuilder('B313/B1103//B431;B81');
builder.toString();
// 'B313/B1103//B431;B81'
```

Use for: serializing back to DSL format, logging, debugging.

## Definition API

Static methods for registering custom codes. All definitions are global — once defined, any `BlissSVGBuilder` instance can use them.

### `defineGlyph(code, definition, options?)`

Define a composite character built from existing codes:

```js
BlissSVGBuilder.defineGlyph('SMILEY', {
  codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
});

new BlissSVGBuilder('SMILEY').svgCode; // renders the smiley
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeString` | `string` | yes | Composition using existing codes |
| `isIndicator` | `boolean` | no | Marks this glyph as an indicator |
| `anchorOffsetX` | `number` | no | Horizontal anchor adjustment |
| `anchorOffsetY` | `number` | no | Vertical anchor adjustment |
| `width` | `number` | no | Width override |
| `shrinksPrecedingWordSpace` | `boolean` | no | Auto-shrink word space before this glyph (like punctuation) |

### `defineShape(code, definition, options?)`

Define a primitive shape with a path-generating function:

```js
BlissSVGBuilder.defineShape('DIAMOND', {
  getPath: (x, y) => {
    const cx = x + 4, cy = y + 4;
    return `M${cx},${y} L${x + 8},${cy} L${cx},${y + 8} L${x},${cy} Z`;
  },
  width: 8,
  height: 8
});

new BlissSVGBuilder('[crop=auto-height]||DIAMOND:0,8').svgCode;
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | yes | Returns SVG path `d` string |
| `width` | `number` | yes | Shape width in grid units |
| `height` | `number` | yes | Shape height in grid units |
| `x` | `number` | no | Default x offset |
| `y` | `number` | no | Default y offset |
| `extraPathOptions` | `object` | no | Extra options passed to `getPath` |

### `defineExternalGlyph(code, definition, options?)`

Define an external glyph (e.g., a character from a custom font with SVG path data):

```js
BlissSVGBuilder.defineExternalGlyph('Xα', {
  getPath: (x, y) => '...svg path data...',
  width: 5.2,
  glyph: 'α'
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `getPath` | `function(x, y, options)` | yes | Returns SVG path `d` string |
| `width` | `number` | yes | Glyph width |
| `glyph` | `string` | yes | Character identifier |
| `y` | `number` | no | Y offset |
| `height` | `number` | no | Glyph height |
| `kerningRules` | `object` | no | Kerning pair adjustments |

### `define(definitions, options?)`

Bulk-define multiple codes at once. The type is auto-detected from the definition shape:

```js
const result = BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' },          // → defineGlyph (has codeString)
  'STAR': { getPath: fn, width: 8, height: 8 }, // → defineShape (has getPath)
});

result.defined;  // ['LOVE', 'STAR']
result.skipped;  // codes that already existed
result.errors;   // codes that failed validation
```

**Detection rules:**
- Has `getPath` + `glyph` → `defineExternalGlyph`
- Has `getPath` (no `glyph`) → `defineShape`
- Has `codeString` → `defineGlyph`

### Options for all define methods

| Option | Default | Description |
|--------|---------|-------------|
| `overwrite` | `false` | Allow replacing an existing definition |

Pass `{ overwrite: true }` to replace existing codes. Without it, defining an existing code throws an error (or is added to `skipped` in `define()`).

## Query API

Static methods for inspecting registered definitions.

### `isDefined(code)`

Check if a code is registered:

```js
BlissSVGBuilder.isDefined('B313');   // true
BlissSVGBuilder.isDefined('CUSTOM'); // false (unless you defined it)
```

### `getDefinition(code)`

Get a frozen metadata object for a code. Functions (like `getPath`) are excluded:

```js
const def = BlissSVGBuilder.getDefinition('B313');
// {
//   type: 'glyph',        // 'shape' | 'glyph' | 'externalGlyph' | 'space'
//   isBuiltIn: true,
//   codeString: 'H:0,8',
//   ...
// }
```

Returns `null` if the code is not defined. The returned object is frozen — you cannot modify it.

### `listDefinitions(filter?)`

List all defined codes, optionally filtered by type:

```js
BlissSVGBuilder.listDefinitions();                    // all codes
BlissSVGBuilder.listDefinitions({ type: 'shape' });   // only shapes
BlissSVGBuilder.listDefinitions({ type: 'glyph' });   // only glyphs
```

Filter types: `'shape'`, `'glyph'`, `'externalGlyph'`, `'space'`

### `removeDefinition(code)`

Remove a custom definition. Built-in definitions cannot be removed:

```js
BlissSVGBuilder.defineGlyph('TEMP', { codeString: 'H:0,8' });
BlissSVGBuilder.removeDefinition('TEMP'); // true

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

For browser usage (ES module and UMD), see [Installation](/get-started/installation).

## Error Handling

Invalid input throws an error:

```js
try {
  new BlissSVGBuilder('INVALID_CODE');
} catch (error) {
  console.error(error.message);
}
```

### Safety Limits

The library enforces limits to prevent runaway processing:

| Limit | Value | Description |
|-------|-------|-------------|
| Input length | 10,000 characters | Maximum DSL string length |
| Recursion depth | 50 levels | Maximum nesting depth for code expansion |

These limits protect against accidental infinite recursion in custom definitions (e.g., a glyph whose `codeString` references itself).
