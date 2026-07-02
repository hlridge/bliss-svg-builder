# Custom Codes

Bliss SVG Builder comes with B-codes for individual Bliss characters. `define()` lets you register your own codes that work just like built-in ones: use them in DSL strings, combine them in words, attach indicators, and apply options.

Custom codes cover a range of use cases:

- **Readable aliases**: use `LOVE` instead of `B431`
- **Word-level codes**: give a single code to a multi-character Bliss word
- **Custom characters**: define characters that don't exist in the built-in set
- **Custom shapes**: create new geometric building blocks from existing shapes or SVG paths

All definitions are global. Once defined, any `BlissSVGBuilder` instance can use them.

## Naming Things

The simplest use case: give a readable name to a B-code.

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

BlissSVGBuilder.define({
  'LOVE': { codeString: 'B431' }
});

new BlissSVGBuilder('LOVE').svgCode;
```

This creates an **alias**. `LOVE` expands to `B431` during parsing, as if you had typed `B431` directly. Once defined, use it anywhere you'd use a B-code.

## Defining Words

Many Bliss words are built from multiple characters. You can define a word as a single code:

```js
BlissSVGBuilder.define({
  'B2661': { codeString: 'B1103;B81' }
});

new BlissSVGBuilder('B2661').svgCode;
```

<Demo code="B1103;B81" displayCode="B2661" title="B2661: B1103 (understanding) + B81 (action indicator) = to understand" />

Words with side-by-side characters use `/` in the codeString, just like in the DSL:

```js
BlissSVGBuilder.define({
  'MYWORD': { codeString: 'B335/B412' }
});
```

<Demo code="B335/B412" displayCode="MYWORD" title="MYWORD: B335 (forward) / B412 (knowledge)" />

Aliases can also reference other aliases. All references are resolved during parsing:

```js
BlissSVGBuilder.define({
  'UNDERSTAND': { codeString: 'B1103;B81' },
  'TOUNDERSTAND': { codeString: 'UNDERSTAND' }
});
```

## Portable Output

Custom codes are global within the runtime environment, but they only exist in memory. If you serialize output with `toString()` or `toJSON()` and send it to a different environment, the receiving Bliss SVG Builder won't know what `LOVE` or `B2661` from the examples above means.

That's why both methods **decompose** custom codes by default, expanding them back to built-in codes:

```js
new BlissSVGBuilder('B2661').toString();
// 'B1103;B81' (anyone can read this)

new BlissSVGBuilder('B2661').toJSON();
// groups[0].glyphs[0].code → 'B1103' (built-in codes, no custom names)
```

The receiver doesn't need your definitions. The output is self-contained.

If you're serializing for your own use (where the custom codes are defined), you can keep the names with `{ preserve: true }`:

```js
new BlissSVGBuilder('B2661').toString({ preserve: true });
// 'B2661'
```

## Characters (Glyphs)

So far we've created aliases: transparent macros that disappear during parsing. But sometimes you want a custom code that has its own **identity** in the element tree, so you can find it, inspect it, and mutate it by name.

Use `type: 'glyph'` for this:

```js
BlissSVGBuilder.define({
  'SMILEY': {
    type: 'glyph',
    codeString: 'C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
  }
});
```

A glyph appears as its own node in the element tree. Inside the tree, the name is preserved. On export, it decomposes to portable output, just like aliases:

```js
const builder = new BlissSVGBuilder('B313/SMILEY');

// Inside the tree: identity preserved
builder.glyph(1).codeName;  // 'SMILEY'

// On export: decomposed to built-in codes
builder.toString();
// 'B313/C8:0,8;DOT:2,11;DOT:6,11;HC4S:4,14'
```

### When to Use Which

Use an **alias** (no type) when you just want a shortcut or a word-level mapping. The name is a convenience that disappears at parse time.

Use a **glyph** (`type: 'glyph'`) when you're defining a proper Bliss character that should have its own identity: something you want to traverse, mutate, or treat as a first-class element.

### Character Properties

Most glyphs only need `type` and `codeString`. Some characters use `anchorOffsetX` and `anchorOffsetY` to adjust their anchor point in compositions. Indicators need additional properties like `isIndicator` and `width`. See the [API Documentation](/reference/api-documentation#define-definitions-options) for all available properties, and [Metadata propagation](/reference/api-documentation#metadata-propagation) for how each field shows up in parser output, rendering, serialization, and handles.

## Shapes

Use `type: 'shape'` to create reusable geometric primitives that can be used as building blocks in characters. Shapes can only reference other shapes.

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

For full control, provide a path-generating function:

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

## Mapping External ID Systems

If your application uses an external ID system (like BCI-AV-IDs or Blissary IDs), you can register those IDs as aliases. The [bliss-blissary-bci-id-map](https://github.com/hlridge/bliss-blissary-bci-id-map) repository provides a public JSON mapping:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';
import mapping from './blissary_to_bci_mapping.json';

const definitions = {};
for (const { bciAvId, blissSvgBuilderCode } of mapping) {
  definitions[String(bciAvId)] = { codeString: blissSvgBuilderCode };
}

BlissSVGBuilder.define(definitions);

new BlissSVGBuilder('14164').svgCode;
new BlissSVGBuilder('14164/14905').svgCode;
```

Since these are aliases, `toString()` produces portable output automatically:

```js
new BlissSVGBuilder('14164//14905').toString();
// 'B313//B392' (built-in codes, no external IDs)
```

The same approach works for any external system:

```js
BlissSVGBuilder.define({
  'W17973': { codeString: 'B1103;B81' },
  'W14895': { codeString: 'B431' },
});
```

## Definition Rules

`define()` validates every entry. A failed entry is reported in the returned `errors` array (the other entries still register), so check it when defining dynamically:

```js
const result = BlissSVGBuilder.define({ 'BAD': { type: 'glyph', codeString: 'B313/B1103' } });
result.errors;
// ['"BAD": define("BAD"): a glyph definition cannot be a multi-character word …']
```

The rules keep definitions portable and unambiguous:

- **No word-level indicators in definitions.** A `codeString` cannot contain `;;`. A word indicator is a live, reversible overlay, so it belongs at the use site: `MYWORD;;B81`.
- **A glyph or shape is a single character.** Its `codeString` cannot contain `/`. Define a multi-character word as a bare code (omit `type`).
- **A glyph cannot bake in an indicator.** Indicators attach to characters at the use site (`SMILEY;B81`) or to words (`;;`). To create a new indicator of its own, flag the glyph with `isIndicator: true`; it then behaves as one atomic indicator unit.
- **`defaultOptions` keys must be valid option names**, and cannot include canvas-wide global-only options like `margin` or `grid` (they configure the whole SVG and would be inert on a definition).

`patchDefinition()` enforces the same rules and validates before applying, so a rejected patch changes nothing.

## Indicators and Options on Custom Codes

Custom codes take indicators and options at the use site just like built-ins:

- `SMILEY;B81` attaches the action indicator to the custom character; `B313/SMILEY;;B81` puts a word-level indicator on the word. Indicator positioning is computed from the glyph's actual rendered ink, including glyphs whose definition displaces its parts.
- `[color=blue]>SMILEY` styles the whole glyph as one part. On serialization the option is re-emitted before each decomposed part so the styling survives portably; see [Part Options on Custom Glyphs](/handbook/syntax-options/options-system#part-options-on-custom-glyphs).

## Coordinates in Definitions

A coordinate baked into a definition is a real position offset and survives serialization. A use-site coordinate adds to it:

```js
BlissSVGBuilder.define({
  'INNER': { type: 'glyph', codeString: 'B291:2,3' }
});

const builder = new BlissSVGBuilder('INNER:1,2');
builder.toString();
// 'B291:3,5' — baked (2,3) + use-site (1,2); re-parsing renders identically
```

The same holds for a multi-part definition whose parts share a common offset: the offset shifts the rendered glyph and the decomposed output re-renders in exactly the same place.

## Managing Definitions

Definitions can be overwritten, altered, removed, and inspected. See the [API Documentation](/reference/api-documentation#define-definitions-options) for `define()` options, [Query API](/reference/api-documentation#query-api) for `getDefinition()`, `listDefinitions()`, and `removeDefinition()`.

Quick examples:

```js
// Overwrite an existing definition
BlissSVGBuilder.define(
  { 'LOVE': { codeString: 'B313' } },
  { overwrite: true }
);

// Check if a code exists
BlissSVGBuilder.isDefined('LOVE');  // true

// Remove a custom definition
BlissSVGBuilder.removeDefinition('LOVE');
```
