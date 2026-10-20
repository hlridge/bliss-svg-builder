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

Aliases can also reference other aliases. A definition stores its `codeString` as you wrote it (an `/SP/` segment still normalizes to `//`), and all references are resolved during parsing, so redefining a referenced code (with `overwrite: true`) flows through to every definition that uses it:

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
// groups[0].glyphs[0].parts →
//   [{ codeName: 'B1103' }, { codeName: 'B81', isIndicator: true, width: 2 }]
// (built-in codes, no custom names)
```

For output like this the receiver doesn't need your definitions: it is built-in codes all the way down, wherever a custom code was used, a part of another character included. Where those codes alone would draw an indicator somewhere else than your code did, the output also says where it goes: a position on the indicator, or a head marker (`^`) on the character that carries a word's `;;` indicators. Not every name can decompose, though: a `getPath` primitive has no built-in form, so it keeps its name even in default output and needs its `define()` wherever the output is read; see [Serializing Custom Indicators and Shapes](#serializing-custom-indicators-and-shapes).

If you're serializing for your own use (where the custom codes are defined), `{ preserve: true }` keeps custom names in the output. `preserve` keeps a custom name when the name stands for a single glyph, indicator, or shape. That covers every code defined with a `type` (such a definition is itself a glyph, indicator, or shape, whatever its anatomy) and every bare alias of one existing code, with or without a position (a `codeString` of `B431` or `B431:1,0`). A `codeString` that combines several codes is shorthand for the composition it spells out; shorthand always serializes expanded, with or without `preserve`:

```js
new BlissSVGBuilder('LOVE').toString({ preserve: true });
// 'LOVE' (a bare alias renaming one code keeps its name)

new BlissSVGBuilder('B2661').toString({ preserve: true });
// 'B1103;B81' (multi-code shorthand always expands)
```

A name is kept only while reading it back draws what you have. A change you make where the name is used is written beside it (`[color=blue]>LOVE`, `LOVE:2,0`), and the options a definition gives its code are not written again, since the name brings them (see [A Definition's Own Options](#a-definition-s-own-options)). A character the name no longer describes, such as a composition object holding other parts than the definition draws, is written out in full, because reading the name back would bring the definition's parts with it.

As a rule of thumb: within your own app, save with `preserve`, which keeps your own characters, indicators and shapes as they are. Your definitions don't travel with a saved composition, so for output that leaves your app use the default, which spells them out in built-in codes as well as it can: usually the same ink, though not everything a definition does has a built-in spelling. Custom indicators and shapes have a few extra wrinkles worth knowing; see [Serializing Custom Indicators and Shapes](#serializing-custom-indicators-and-shapes) below.

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

// A glyph is a unit whatever its anatomy, so preserve keeps its
// name even for this multi-code composition (a typeless multi-code
// shorthand would expand instead)
builder.toString({ preserve: true });
// 'B313/SMILEY'
```

Like a built-in character, a glyph written alone is a character holding one part, named after it. Anything you add to the character goes beside that part:

```js
const smiley = new BlissSVGBuilder('SMILEY;B81');

smiley.glyph(0).part(0).codeName;  // 'SMILEY'
smiley.glyph(0).part(1).codeName;  // 'B81'
```

What the definition draws sits inside that one part and belongs to the definition: to change it, change the definition.

### When to Use Which

Use an **alias** (no type) when you just want a shortcut or a word-level mapping. The name is a convenience that disappears at parse time.

Use a **glyph** (`type: 'glyph'`) when you're defining a proper Bliss character that should have its own identity: something you want to traverse, mutate, or treat as a first-class element.

### Character Properties

Most glyphs only need `type` and `codeString`. Some characters use `anchorOffsetX` and `anchorOffsetY` to adjust their anchor point in compositions. A glyph whose `codeString` draws one code takes that code's anchor wherever it sets none of its own, so `{ type: 'glyph', codeString: 'B138' }` places an indicator exactly where `B138` does. Indicators need additional properties like `isIndicator` and `width`. See the [API Documentation](/reference/api-documentation#define-definitions-options) for all available properties, and [Metadata propagation](/reference/api-documentation#metadata-propagation) for how each field shows up in parser output, rendering, serialization, and handles.

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
- **A glyph or shape is a single character.** Its `codeString` cannot contain `/`, and cannot be a letter run that stands for several letters (`XOH` is shorthand for `XO/XH`, so it is a word too). Define a multi-character word as a bare code (omit `type`); a bare code may even span whole words (`B291//C8`). A letter run that renders as one text element (`Xaλ`, where a letter has no embedded outline) is a single character and stays allowed.
- **A glyph cannot bake in an indicator.** Indicators attach to characters at the use site (`SMILEY;B81`) or to words (`;;`). To create a new indicator of its own, flag the glyph with `isIndicator: true`; it then behaves as one atomic indicator unit. The rule holds in every definition order: a later `define()` that would turn an already-referenced code into an indicator is rejected too.
- **`isIndicator` is glyph-only.** The flag marks a `type: 'glyph'` definition as a compound indicator; setting it on a bare alias, shape, or external glyph is rejected. Indicator-ness still rides through an unflagged bare alias whose target is itself an indicator (`{ codeString: 'B81' }`).
- **Word codeStrings carry no internal coordinates.** In a `/`-spanning codeString, apply positions at the use site (`MYWORD:2,0`) instead. Kerning markers (`RK:-2`, `AK:1`) are spacing, not coordinates, and are allowed. Single-character codeStrings keep their coordinate freedom (see below).
- **A codeString must hold content a use can draw.** A definition is read the way a use of it would be. A coordinate the DSL cannot read (`C8:.`) is rejected, and so is a kerning marker standing as a part (`C8;RK:3`) and a glyph or shape with no character in it (`RK:3` alone): every use of such a definition drew nothing for it. What a use only warns about and drops, a bracket value like `[x=.]` or a kerning marker's value, is reported where the code is used instead. A bare code may be a lone marker, `{ codeString: 'RK:3' }`, which spaces two characters like `RK:3` does.
- **Spaces spell out as `//` or explicit space codes.** The top-level shorthand `SP` normalizes to `//` when stored.
- **`defaultOptions` keys must be valid option names**, and cannot include canvas-wide global-only options like `margin` or `grid`, or a key that names a part of the picture like `grid--opacity` (they act on the whole SVG and would be inert on a definition). An `element-background--` key is allowed, since it styles the backgrounds the definition paints. A key is read here exactly as it is anywhere else, so `{ strokeWidth: 2 }` and `{ 'stroke-width': 2 }` are one option, and a name SVG or ARIA owns is stored under that standard's spelling: `{ strokeDasharray: '2 1' }` sets `stroke-dasharray` and `{ ariaLabel: 'water' }` sets `aria-label`. See [which name is emitted](/handbook/syntax-options/svg-pass-through#which-name-is-emitted).
- **`defaultOptions` describe what the definition draws, not one use of it.** A position (`x`, `y`), kerning (`relativeKerning`, `absoluteKerning`) or `key` is rejected: each says where one use of the character sits or which element it is, so write it where the code is used, as in `MYCHAR:2,0`, `[x=2]MYCHAR`, `B313/RK:1/MYCHAR` or `[key=subject]MYCHAR`. A gap that depends on which character comes next belongs in `kerningRules` on the definition of the first.
- **A character bracket at the start of a `codeString` is the definition's own options**, exactly as if they were in `defaultOptions` (see [A Definition's Own Options](#a-definition-s-own-options)), so the same keys are rejected there: `{ type: 'glyph', codeString: '[x=2]B291' }` fails as `defaultOptions: { x: 2 }` does. Over a word, in a bare code such as `'[color=red]B291/C8'`, the bracket styles the first character, as written.

`patchDefinition()` enforces the same rules and validates before applying, so a rejected patch changes nothing.

## Indicators and Options on Custom Codes

Custom codes take indicators and options at the use site just like built-ins:

- `SMILEY;B81` attaches the action indicator to the custom character; `B313/SMILEY;;B81` puts a word-level indicator on the word. Indicator positioning is computed from the glyph's actual rendered ink, including glyphs whose definition displaces its parts.
- An alias to an indicator works as that indicator. After `define({ '6436': { codeString: 'B6436' } })`, writing `MYWORD;;6436` applies the indicator exactly like `MYWORD;;B6436`, on every surface (`;;`, `;`-parts, `applyIndicators`). Only single-code aliases resolve this way; to make an alias to a multi-code composition act as an indicator, define it as a `type: 'glyph'` flagged `isIndicator: true` instead.
- `[color=blue]>SMILEY` styles the whole glyph as one part. On serialization the option is re-emitted before each decomposed part so the styling survives portably; see [Part Options on Custom Glyphs](/handbook/syntax-options/options-system#part-options-on-custom-glyphs).

### A Definition's Own Options

A definition can carry options of its own, in `defaultOptions` or in a character bracket at the start of its `codeString`. The two mean the same thing, and where both set a key the bracket wins:

```js
BlissSVGBuilder.define({
  'REDGLYPH': { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  'REDGLYPH2': { type: 'glyph', codeString: '[color=red]B291' }  // the same glyph
});
```

They are the options of the part the code is, the way `REFSQUARE` draws its own dotted line:

- **They style exactly what the definition draws.** An indicator or a part added beside it keeps its own look, however it is added: `REDGLYPH;B81`, `REDGLYPH;;B81` and `applyIndicators('B81')` all draw `B81` black.
- **An option on the character, the word or the whole composition does not override them.** `[color=blue]REDGLYPH` still draws the glyph red, while anything added to that character is blue. To restyle the glyph where you use it, write a part bracket: `[color=blue]>REDGLYPH`. To restyle it everywhere, change the definition. The dot options (`dot-extra-width` and the others) still reach a dot inside a definition.
- **They are part of the code.** `clearOptions()`, `clearAllOptions()`, `removeOptions()` and a save [without options](/reference/api-documentation#saving-without-options) leave them in place, and `preserve` does not write them again: `REDGLYPH` comes back as `REDGLYPH`. The default output, which spells the glyph out in built-in codes, writes them as a part bracket: `[color=red]>B291`.

```js
const builder = new BlissSVGBuilder('[color=blue]REDGLYPH;B81');

builder.toString();                    // '[color=blue][color=red]>B291;B81'
builder.toString({ preserve: true });  // '[color=blue]REDGLYPH;B81'
```

An alias's options work the same way on every part it draws, in every character of every word it spells: `{ codeString: 'B291/C8', defaultOptions: { color: 'red' } }` comes back as `[color=red]>B291/[color=red]>C8`. Where an alias stands for one code, its options stay with that code as a glyph's do, and they win over the options that code brings. The alias is that code wherever you write it: with `BLUEGLYPH` defined `{ codeString: 'REDGLYPH', defaultOptions: { color: 'blue' } }`, the glyph draws blue in `BLUEGLYPH`, in `B313;BLUEGLYPH`, at `BLUEGLYPH:1,0` and added with `addPart('BLUEGLYPH')`, and a part bracket where you use it wins over both definitions (`[color=green]>BLUEGLYPH` draws green). Where it spells several codes, it is shorthand, so once spelled out its options are ordinary options of those parts, and a clear removes them.

## Serializing Custom Indicators and Shapes

Serialization carries your *composition*, never your *definitions*. For a custom indicator or shape, that split matters, because part of what you defined is metadata:

```js
BlissSVGBuilder.define({
  'MYIND': { type: 'glyph', isIndicator: true, codeString: 'C2' }
});

const builder = new BlissSVGBuilder('B291;MYIND');
builder.toString();                    // 'B291;C2:3'  (portable, but plain ink)
builder.toString({ preserve: true });  // 'B291;MYIND' (your name, local use)
```

The default string `B291;C2:3` renders anywhere, with the circle where your indicator drew it, but the receiver sees an ordinary circle part: `isIndicator` is metadata on your definition, and the decomposed string carries none of it. Re-parsing `B291;C2:3` places `C2` at the position written on it, like any part, not like an indicator.

The same goes for an indicator your definitions place in other ways: wherever the built-in codes alone would draw it elsewhere, the output writes the position it was drawn at, only on the part, and the axis, that needs one:

```js
BlissSVGBuilder.define({
  'ANC': { type: 'glyph', codeString: 'B291', anchorOffsetY: 2 },
  'PAIR': { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' }
});

new BlissSVGBuilder('ANC;B81').toString();
// 'B291;B81:,2' (B81 where ANC's own anchor placed it, 2 below B291's)

new BlissSVGBuilder('B291;PAIR').toString();
// 'B291;B97;B99:4.5,0' (B99 sits 3 into PAIR, which is drawn 1.5 into the character)
```

What travels through the default **string** output (`toString()`):

| From your definition | Travels? |
|---|---|
| The ink (the `codeString` composition) | Yes, decomposed to built-in codes |
| Baked and use-site coordinates | Yes, as explicit `:x,y` suffixes |
| Where an indicator is drawn (a glyph's own anchor, a compound indicator's layout) | Yes, as a position on the indicator wherever the built-in codes alone would draw it elsewhere |
| `defaultOptions` | Yes, written as a part bracket on what they style (`[color=red]>C2`). A `getPath` primitive's stay with its name, like a built-in's own look |
| `isIndicator` and `width` | No. The receiver sees plain parts |
| `getPath` geometry (primitives) | No. A primitive keeps its bare name and needs its definition to render |

That table is about the `toString()` string. `toJSON()` carries more: it breaks a custom code down into built-in codes too, and writes a position wherever the string does, but each part keeps `isIndicator` and `width`, so a builder rebuilt from the default JSON places a custom indicator as an indicator even where your definitions are not registered. A compound indicator arrives as its parts, each one an indicator, rather than as one unit. To keep a custom indicator whole, register the same `define()` calls wherever the output is read and save with `preserve` (a custom name that stays in the serialized output needs its definition wherever the output is read).

Per definition shape, that works out to:

| Definition | Default `toString()` | Default `toJSON()` | `preserve` output |
|---|---|---|---|
| Alias of one built-in indicator (`{ codeString: 'B6436' }`) | the target code, still a real indicator | the target code, still a real indicator | your name |
| Own indicator over plain ink (`type: 'glyph', isIndicator: true, codeString: 'C2'`) | the plain shape where it was drawn, indicator behavior lost | the plain shape, marked as an indicator | your name |
| Compound indicator (`type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0'`) | the decomposed parts where they were drawn, no longer one atomic unit | the decomposed parts where they were drawn, each marked as an indicator, no longer one atomic unit | your name |
| New primitive (`getPath`) | your bare name, unrenderable elsewhere | your bare name, unrenderable elsewhere | your bare name |

Word-level indicators are written the same way. A `;;` code named by a custom definition is saved as the built-in indicator codes it draws, with the definition's options as a part bracket and a position where one is needed, in both default outputs, and `preserve` keeps your name:

```js
BlissSVGBuilder.define({ 'PLURAL': { codeString: 'B99' } });

new BlissSVGBuilder('B291;;PLURAL').toString();                    // 'B291;;B99'
new BlissSVGBuilder('B291;;PLURAL').toString({ preserve: true });  // 'B291;;PLURAL'
```

A `;;` code that spells out into a plain shape, which a `;;` list cannot hold, is written as a part of the head where it was drawn: `B291;;MYIND` comes back as `B291;C2:3`.

A word's `;;` indicators go on its head character, and a custom glyph can head a word where the built-in code it is saved as would not, because the automatic head pick passes over some characters (see [the head glyph algorithm](/handbook/writing/words-sentences#the-head-glyph-algorithm)). The default output then marks the head, so the indicators reload on the same character:

```js
BlissSVGBuilder.define({ 'MORE': { type: 'glyph', codeString: 'B937' } });

new BlissSVGBuilder('MORE/B291;;B81').toString();
// 'B937^/B291;;B81' (a reload passes over B937, comparative "more", when it picks the head)
```

When the default output is not enough, run the same `define()` calls in the receiving environment and send `preserve` output. Everything then means the same thing on both sides.

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
