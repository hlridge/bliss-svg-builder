# Custom Codes

Extend Bliss SVG Builder with your own codes. Custom codes work exactly like built-in codes once defined: use them in DSL strings, combine them in words, attach indicators, and apply options.

## Why Custom Codes?

Bliss SVG Builder natively supports individual Bliss characters as B-codes (`B1` through `B1603`). It does not include codes for multi-character Bliss words. The primary use case for custom codes is extending the builder with word-level codes, typically using Blissary B-codes that map to compositions of built-in characters.

Beyond word-level codes, you can also define:

- **Readable aliases**: use `LOVE` instead of `B431`
- **Custom characters**: define compositions that don't exist as B-codes
- **Custom shapes**: add geometric primitives or composite shapes

::: warning Portability
Custom codes are local to your application. Other applications using Bliss SVG Builder will not recognize them, since the library only ships with B-codes for individual characters. However, `toString()` and `toJSON()` produce portable output by default, decomposing custom codes into built-in codes that any Bliss SVG Builder instance can understand.
:::

All definitions are global. Once defined, any `BlissSVGBuilder` instance can use them.

## The `define()` Method

`define()` is the single method for registering custom codes. It accepts an object mapping codes to definitions:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

const result = BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' }
});

result.defined;  // ['LOVE']
result.skipped;  // codes that already existed
result.errors;   // codes that failed validation
```

The optional `type` field controls what kind of definition is created:

| `type` | Purpose | Required fields |
|--------|---------|-----------------|
| *(omitted)* | Transparent alias or macro | `codeString` |
| `'glyph'` | Bliss character with own identity | `codeString` |
| `'shape'` | Geometric shape | `getPath` + `width` + `height`, or `codeString` |
| `'externalGlyph'` | External font character | `getPath` + `width` + `glyph` |

When no `type` is specified, `getPath`-based definitions are auto-detected as shapes (or external glyphs if `glyph` is present). Definitions with only `codeString` create transparent aliases.

## Aliases (No Type)

The most common use case. Provide a `codeString` with no `type`. The alias is a transparent macro: it expands to its codeString during parsing and does not appear in the element tree. The result is identical to typing the codeString directly.

```js
BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' }
});

new BlissSVGBuilder('LOVE').svgCode;     // renders B431
new BlissSVGBuilder('LOVE').toString();  // 'B431'
```

The `codeString` uses the same syntax as the DSL: `;` for parts within a character, `/` for multiple characters in a word, `//` for word separation.

### Multi-Character Words

Many Bliss words consist of multiple characters. For example, B2661 in the Blissary system represents "to understand", spelled as B1103 (understanding) with indicator B81 (action):

```js
BlissSVGBuilder.define({
  'B2661': { codeString: 'B1103;B81' }
});

new BlissSVGBuilder('B2661').svgCode;            // "to understand"
new BlissSVGBuilder('B2661').toString();          // 'B1103;B81'
new BlissSVGBuilder('B2661//B2661//B4').svgCode;  // sentence with period
```

Words with multiple characters side by side use `/` in the codeString:

```js
BlissSVGBuilder.define({
  'MYWORD': { codeString: 'B335/B412' }
});

new BlissSVGBuilder('MYWORD').svgCode;     // two characters in a word group
new BlissSVGBuilder('MYWORD').toString();  // 'B335/B412'
```

### Alias Chaining

Aliases can reference other aliases. All references are resolved during parsing:

```js
BlissSVGBuilder.define({
  'UNDERSTAND': { codeString: 'B1103;B81' },
  'TOUNDERSTAND': { codeString: 'UNDERSTAND' }
});

new BlissSVGBuilder('TOUNDERSTAND').toString();  // 'B1103;B81'
```

## Characters (Glyphs)

Use `type: 'glyph'` when defining a proper Bliss character. Unlike aliases, glyphs have their own identity in the element tree. The custom code name is preserved when working with the tree (traversal, mutation), and only decomposed to portable output on export.

```js
BlissSVGBuilder.define({
  'SMILEY': {
    type: 'glyph',
    codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
  }
});

new BlissSVGBuilder('SMILEY').svgCode;
new BlissSVGBuilder('SMILEY;B81').svgCode;      // with indicator
new BlissSVGBuilder('B313/SMILEY').svgCode;      // in a word

// toString() decomposes to portable output by default
new BlissSVGBuilder('SMILEY').toString();
// 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'

// toJSON() also decomposes simple glyphs by default
new BlissSVGBuilder('SMILEY').toJSON();
// groups[0].glyphs[0].code → 'SMILEY' (complex compositions keep their name)

// Use preserve option to keep custom code names in either method
new BlissSVGBuilder('SMILEY').toString({ preserve: true });
// 'SMILEY'
```

### Aliases vs Glyphs

The key difference:

| | Alias (no type) | Glyph (`type: 'glyph'`) |
|---|---|---|
| **In the tree** | Fully expanded, alias name gone | Preserved as own glyph node |
| **Mutation API** | Works with expanded codes | Works with custom code name |
| **toString()** | Always expanded, never preserved | Portable by default, preservable |
| **toJSON()** | Always expanded, never preserved | Simple glyphs decomposed, preservable |
| **Best for** | Word-level mappings, shortcuts | Custom characters with identity |

### Character Properties

Beyond `codeString`, glyphs accept properties that control their behavior in compositions:

```js
BlissSVGBuilder.define({
  'MYCHAR': {
    type: 'glyph',
    codeString: 'C8:0,8;VL8:4,8',
    isIndicator: true,          // marks as indicator (auto-positions above)
    anchorOffsetX: 1.5,         // horizontal anchor adjustment
    anchorOffsetY: -0.5,        // vertical anchor adjustment
    width: 4,                   // width override
    shrinksPrecedingWordSpace: true  // tighten word space before (like punctuation)
  }
});
```

See the [API Documentation](/reference/api-documentation#define-definitions-options) for all properties.

## Shapes

Use `type: 'shape'` to create reusable geometric primitives. Shapes can only reference other shapes; they cannot reference glyphs or external glyphs.

### Composite Shapes

Build a shape from existing shape codes:

```js
BlissSVGBuilder.define({
  'CROSS': {
    type: 'shape',
    codeString: 'HL8:0,4;VL8:4,0'
  }
});

new BlissSVGBuilder('CROSS:0,8').svgCode;
```

### Primitive Shapes

Create a shape with a path-generating function for full control over the SVG path:

```js
BlissSVGBuilder.define({
  'DIAMOND': {
    type: 'shape',
    getPath: (x, y) => {
      const cx = x + 4, cy = y + 4;
      return `M${cx},${y} L${x + 8},${cy} L${cx},${y + 8} L${x},${cy} Z`;
    },
    width: 8,
    height: 8
  }
});

new BlissSVGBuilder('DIAMOND:0,8').svgCode;
```

Primitive shapes require `width` and `height`. The `getPath` function receives `(x, y)` coordinates and must return an SVG path `d` string.

## External Glyphs

Use `type: 'externalGlyph'` to add characters from external font systems:

```js
BlissSVGBuilder.define({
  'Xα': {
    type: 'externalGlyph',
    getPath: (x, y) => '...svg path data...',
    width: 5.2,
    glyph: 'α'
  }
});
```

External glyphs work like the built-in Latin and Cyrillic characters. See the [API Documentation](/reference/api-documentation#define-definitions-options) for details.

## Type Restrictions

Definitions are validated at registration time:

- **Shapes** can only reference other shapes. Referencing a glyph, external glyph, or alias will produce an error.
- **Glyphs** can reference other glyphs and shapes. Referencing external glyphs or aliases will produce an error.
- **Circular references** are detected and rejected for both shapes and glyphs.

```js
// This will fail: shape referencing a B-code glyph
BlissSVGBuilder.define({
  'BADSHAPE': { type: 'shape', codeString: 'B431:0,8' }
});
// result.errors: ['BADSHAPE: shapes can only reference other shapes']
```

## Mapping External ID Systems

If your application uses an external ID system (such as BCI-AV-IDs or Blissary IDs), you can map those IDs to Bliss SVG Builder codes. The [bliss-blissary-bci-id-map](https://github.com/hlridge/bliss-blissary-bci-id-map) repository provides a public JSON mapping between these systems:

```json
[
  { "blissaryId": 1, "bciAvId": 8483, "blissSvgBuilderCode": "B1" },
  { "blissaryId": 2, "bciAvId": 8484, "blissSvgBuilderCode": "B2" },
  ...
]
```

For example, you could register BCI-AV-IDs as aliases:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';
import mapping from './blissary_to_bci_mapping.json';

// Register each BCI-AV-ID as an alias for its B-code
const definitions = {};
for (const { bciAvId, blissSvgBuilderCode } of mapping) {
  definitions[String(bciAvId)] = { codeString: blissSvgBuilderCode };
}

BlissSVGBuilder.define(definitions);

// Now BCI-AV-IDs work as codes
new BlissSVGBuilder('8493').svgCode;           // renders via B-code alias
new BlissSVGBuilder('8493/8499').svgCode;      // combine in a word
```

The same approach works for any external system. Define a mapping from your IDs to compositions of existing codes:

```js
// Word-level codes from an external dictionary
BlissSVGBuilder.define({
  'W17973': { codeString: 'B1103;B81' },   // "to understand"
  'W14895': { codeString: 'B431' },         // "love"
});

new BlissSVGBuilder('W17973//W14895').svgCode;
```

Since these are typeless aliases, `toString()` will return portable output:

```js
new BlissSVGBuilder('W17973//W14895').toString();
// 'B1103;B81//B431'
```

Keep in mind that these mappings only exist within your application. See the [portability warning](#why-custom-codes) above.

## Modifying Definitions

### Overwriting

By default, defining an existing code is skipped (or throws in single-method calls). Pass `{ overwrite: true }` as the second argument to replace:

```js
BlissSVGBuilder.define({ 'LOVE': { codeString: 'B431' } });

// Later, replace completely
BlissSVGBuilder.define(
  { 'LOVE': { codeString: 'B313' } },
  { overwrite: true }
);
```

### Altering

To change specific properties without rewriting everything, read the current definition with `getDefinition()`, then overwrite with your changes:

```js
const current = BlissSVGBuilder.getDefinition('MYCHAR');

BlissSVGBuilder.define({
  'MYCHAR': {
    type: 'glyph',
    codeString: current.codeString,       // keep the original composition
    anchorOffsetX: 2.0                    // change just this property
  }
}, { overwrite: true });
```

Note that `getDefinition()` returns a metadata copy (functions like `getPath` are excluded). For primitive shapes, you'll need to provide the `getPath` function again when overwriting.

### Removing

To remove a custom definition entirely:

```js
BlissSVGBuilder.removeDefinition('LOVE'); // true
```

Built-in definitions cannot be removed.

## Inspecting Definitions

Check if a code exists, get its metadata, or list all codes:

```js
BlissSVGBuilder.isDefined('B313');   // true
BlissSVGBuilder.isDefined('LOVE');   // true (after defining it)

const def = BlissSVGBuilder.getDefinition('B313');
// { type: 'glyph', isBuiltIn: true, codeString: 'H:0,8', ... }

BlissSVGBuilder.listDefinitions();                   // all codes
BlissSVGBuilder.listDefinitions({ type: 'shape' });  // only shapes
BlissSVGBuilder.listDefinitions({ type: 'glyph' });  // only characters
```

See the [API Documentation](/reference/api-documentation#query-api) for full details.
