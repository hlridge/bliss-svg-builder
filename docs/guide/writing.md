# Writing with Bliss

Now that you understand primitive shapes, let's explore the main use case: **writing with Blissymbolics**.

## From Shapes to Characters

Bliss characters are shapes positioned with semantic meaning. Each character represents a concept.

For example, the character **"FEELING"** (code: `B313`) is defined as a heart positioned at `H:0,8`:

<Demo code="[grid=1]||B313" title="B313 - FEELING character" />

Compare this to manually building the same shape:

<Demo code="[grid=1]||H:0,8" title="Manual: H:0,8" />

**The difference:**
- Predefined characters like `B313` already have proper height (20 units)
- No `freestyle` needed - they're ready for writing
- The grid shows the standard character boundaries

---

## Predefined Characters

Bliss SVG Builder includes thousands of predefined characters. Each has a `B` code:

<Demo code="B313" title="B313 - FEELING" />

<Demo code="B102" title="B102 - PERSON (example)" />

<Demo code="B104" title="B104 - Another character (example)" />

*Note: The exact meaning of B102 and B104 depends on the Blissymbolics standard. Check the character reference for details.*

---

## Building Words

Combine characters with `/` (character separator):

<Demo code="B313/B102" title="Two-character word" />

Unlike shapes, you don't need `freestyle` - characters are already properly sized for writing.

---

## Building Sentences

Combine words with `//` (word separator):

<Demo code="B313/B102//B104" title="Two-word sentence" />

Add spacing options for better readability:

<Demo code="[word-space=12]||B313/B102//B104" title="Sentence with wider word spacing" />

---

## Styling Your Writing

Apply options just like with shapes:

<Demo code="[color=#2563eb]||B313/B102" title="Blue word" />

<Demo code="[color=red]||B313//[color=blue]||B102" title="Different colored words" />

Remember the option cascade:
- Global options (`||`) apply to everything
- Word options (`|`) override global for that word
- Character and part options provide fine-grained control

---

## Custom Characters

You can define custom characters in two ways:

### 1. Inline Definition

Define a character on-the-fly by using shapes as normal:

<Demo code="[freestyle=1]||H:0,8;C4:3,10" title="Custom character inline" />

### 2. Register with extendData()

For reusable custom characters:

```js
import { BlissSVGBuilder } from 'bliss-svg-builder';

// Register custom character
BlissSVGBuilder.extendData({
  'CUSTOM1': { codeString: "H:0,8;C4:3,10" }
});

// Use it like a predefined character
const builder = new BlissSVGBuilder('CUSTOM1');
```

---

## Next Steps

- Explore the [full DSL syntax](/guide/dsl-syntax)
- Browse available [options](/guide/options)
- See all [primitive shapes](/reference/shapes)
