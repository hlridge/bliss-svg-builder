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

As a rule of thumb: the default is for output that leaves your app, `preserve` is for output that stays where your definitions live. Custom indicators and shapes have a few extra wrinkles worth knowing; see [Serializing Custom Indicators and Shapes](#serializing-custom-indicators-and-shapes) below.

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

- **Names must be visible and unreserved.** Control and format characters (like a zero-width space) are rejected by naming the code point. So are the reserved names: built-in codes, `X` followed by letters (the external-character namespace), and the syntax markers `RK`, `AK`, `SP`. Unused B-codes may be defined, but future versions may claim new built-in codes, so custom names carry no collision guarantee.
- **No word-level indicators in definitions.** A `codeString` cannot contain `;;`. A word indicator is a live, reversible overlay, so it belongs at the use site: `MYWORD;;B81`.
- **A glyph or shape is a single character.** Its `codeString` cannot contain `/`. Define a multi-character word as a bare code (omit `type`); a bare code may even span whole words (`B291//C8`).
- **A glyph cannot bake in an indicator.** Indicators attach to characters at the use site (`SMILEY;B81`) or to words (`;;`). To create a new indicator of its own, flag the glyph with `isIndicator: true`; it then behaves as one atomic indicator unit. The rule holds in every definition order: a later `define()` that would turn an already-referenced code into an indicator is rejected too.
- **Word codeStrings carry no internal coordinates.** In a `/`-spanning codeString, apply positions at the use site (`MYWORD:2,0`) instead. Kerning markers (`RK:-2`, `AK:1`) are spacing, not coordinates, and are allowed. Single-character codeStrings keep their coordinate freedom (see below).
- **Spaces spell out as `//` or explicit space codes.** The top-level shorthand `SP` normalizes to `//` when stored.
- **`defaultOptions` keys must be valid option names**, and cannot include canvas-wide global-only options like `margin` or `grid` (they configure the whole SVG and would be inert on a definition).

`patchDefinition()` enforces the same rules and validates before applying, so a rejected patch changes nothing.

## Indicators and Options on Custom Codes

Custom codes take indicators and options at the use site just like built-ins:

- `SMILEY;B81` attaches the action indicator to the custom character; `B313/SMILEY;;B81` puts a word-level indicator on the word. Indicator positioning is computed from the glyph's actual rendered ink, including glyphs whose definition displaces its parts.
- An alias to an indicator works as that indicator. After `define({ '6436': { codeString: 'B6436' } })`, writing `MYWORD;;6436` applies the indicator exactly like `MYWORD;;B6436`, on every surface (`;;`, `;`-parts, `applyIndicators`). Only single-code aliases resolve this way; an alias to a multi-code composition needs the `isIndicator: true` flag instead.
- `[color=blue]>SMILEY` styles the whole glyph as one part. On serialization the option is re-emitted before each decomposed part so the styling survives portably; see [Part Options on Custom Glyphs](/handbook/syntax-options/options-system#part-options-on-custom-glyphs).

## Serializing Custom Indicators and Shapes

Serialization carries your *composition*, never your *definitions*. For a custom indicator or shape, that split matters, because part of what you defined is metadata:

```js
BlissSVGBuilder.define({
  'MYIND': { type: 'glyph', isIndicator: true, codeString: 'C2' }
});

const builder = new BlissSVGBuilder('B291;MYIND');
builder.toString();                    // 'B291;C2'    — portable, but plain ink
builder.toString({ preserve: true });  // 'B291;MYIND' — your name, local use
```

The default string `B291;C2` renders anywhere, but the receiver sees an ordinary circle part: `isIndicator` is metadata on your definition, and the decomposed string carries none of it. Re-parsing `B291;C2` places `C2` like any part, not like an indicator.

What travels through the default **string** output (`toString()`):

| From your definition | Travels? |
|---|---|
| The ink (the `codeString` composition) | Yes, decomposed to built-in codes |
| Baked and use-site coordinates | Yes, as explicit `:x,y` suffixes |
| `defaultOptions` | Yes, materialized as explicit options (`[color=red]>C2`) |
| `isIndicator` and `width` | No. The receiver sees plain parts |
| `getPath` geometry (primitives) | No. A primitive keeps its bare name and needs its definition to render |

That table is about the `toString()` string. `toJSON()` is the exception: it serializes the full part tree, so it *does* carry `isIndicator` and `width`, and a builder built from that object applies them, preserving indicator placement across an object round trip. Use `toJSON()` (or `preserve`) when you need the indicator to survive without redefining it at the far end.

Per definition shape, that works out to:

| Definition | Default output | `preserve` output |
|---|---|---|
| Alias of one built-in indicator (`{ codeString: 'B6436' }`) | the target code, still a real indicator | your name |
| Own indicator over plain ink (`isIndicator: true, codeString: 'C2'`) | the plain shape, indicator behavior lost | your name |
| Compound indicator (`isIndicator: true, codeString: 'B97;B99:3,0'`) | the decomposed parts, no longer one atomic unit | your name |
| New primitive (`getPath`) | your bare name, unrenderable elsewhere | your bare name |

Two remedies when the default output is not enough:

- **Define at both ends.** Run the same `define()` calls in the receiving environment and send `preserve` output (or `;;` strings). Everything then means the same thing on both sides.
- **Compose with explicit coordinates.** If you only need the *ink* to arrive exactly, skip the flag and write the anatomy with explicit positions (`B291;C2:3,0`): explicitly positioned parts render at their coordinates in any environment, no definition needed.

Word-level indicators are the asymmetry to remember: `B291;;MYIND` keeps your code in **default** output too, because `;;` is a live overlay resolved at render, not a baked part. A `;;` string that references a custom code therefore always needs the definition at the receiving end. Without it, the receiver warns `UNKNOWN_CODE`, renders the word without the overlay, and drops the unknown code from its own re-serialized output. (A `;`-part with an unknown name is kept in serialized output but fails its whole character at render, or shows a placeholder with the `error-placeholder` option; see [UNKNOWN_CODE](/reference/warning-codes#unknown-code).)

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

Custom definitions can be overwritten, altered, removed, and inspected; built-in definitions cannot be replaced by any route (overwrite, patch, or remove), so the shared vocabulary always renders the same everywhere. See the [API Documentation](/reference/api-documentation#define-definitions-options) for `define()` options, [Query API](/reference/api-documentation#query-api) for `getDefinition()`, `listDefinitions()`, and `removeDefinition()`.

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
