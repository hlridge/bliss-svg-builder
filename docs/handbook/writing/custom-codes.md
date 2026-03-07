# Custom Codes

Extend Bliss SVG Builder with your own codes. Custom codes work exactly like built-in codes once defined: use them in DSL strings, combine them in words, attach indicators, and apply options.

## Why Custom Codes?

Bliss SVG Builder natively supports individual Bliss characters as B-codes (`B1` through `B1603`). It does not include codes for multi-character Bliss words. The primary use case for custom codes is extending the builder with word-level codes, typically using Blissary B-codes that map to compositions of built-in characters.

Beyond word-level codes, you can also define:

- **Readable aliases**: use `LOVE` instead of `B431`
- **Custom characters**: define compositions that don't exist as B-codes
- **Custom shapes**: add geometric primitives or composite shapes

::: warning Portability
Custom codes are local to your application. Other applications using Bliss SVG Builder will not recognize them, since the library only ships with B-codes for individual characters. If you share DSL strings that use custom codes, the receiving application must register the same definitions.
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
| *(omitted)* | Word, alias, or general code | `codeString` |
| `'glyph'` | Bliss character (with glyph metadata) | `codeString` |
| `'shape'` | Geometric shape | `getPath` + `width` + `height`, or `codeString` |
| `'externalGlyph'` | External font character | `getPath` + `width` + `glyph` |

When no `type` is specified, `getPath`-based definitions are auto-detected as shapes (or external glyphs if `glyph` is present). Definitions with only `codeString` create bare codes, suitable for words and aliases.

## Words and Aliases

The most common use case. Provide a `codeString` with no `type`:

```js
// Simple alias
BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' }
});

new BlissSVGBuilder('LOVE').svgCode; // renders B431
```

The `codeString` uses the same syntax as the DSL: `;` for parts within a character, `/` for multiple characters in a word.

### Multi-Character Words

Many Bliss words consist of multiple characters. For example, B2661 in the Blissary system represents "to understand", spelled as B1103 (understanding) with indicator B81 (action):

```js
BlissSVGBuilder.define({
  'B2661': { codeString: 'B1103;B81' }
});

new BlissSVGBuilder('B2661').svgCode;            // "to understand"
new BlissSVGBuilder('B2661//B2661//B4').svgCode; // sentence with period
```

Words with multiple characters side by side use `/` in the codeString:

```js
BlissSVGBuilder.define({
  'MYWORD': { codeString: 'B335/B412' }
});

// Expands to two characters in a word group
new BlissSVGBuilder('MYWORD').svgCode;
```

## Characters (Glyphs)

Use `type: 'glyph'` when defining a proper Bliss character. This sets internal metadata (`isBlissGlyph`, `glyphCode`) that affects how the character participates in compositions and head glyph detection:

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
```

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

Use `type: 'shape'` to create reusable geometric primitives.

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
