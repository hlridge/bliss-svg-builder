# Words & Sentences

In [Get Started](/get-started/words-sentences) you learned that `/` combines characters into words and `//` separates words in a sentence. This page covers the full composition system: words, sentences, word-level indicators, the head glyph algorithm, and punctuation.

## Separators Overview

Pattern: single = character level, double = word level.

| Separator | Scope | Purpose | Example |
|-----------|-------|---------|---------|
| `;` | Within a character | Combine parts or attach indicator | `B431;B81` |
| `/` | Within a word | Combine characters | `B313/B1103` |
| `;;` | On a word | Attach indicator to head glyph | `B313/B1103;;B81` |
| `//` | Between words | Separate words | `B313//B431` |

## Words: The `/` Separator

Use `/` to combine characters into a word:

<Demo code="B313/B1103" title="feeling + understanding = empathy" />

<Demo code="B513/B431" title="person + love = sweetheart, lover" />

<Demo code="B313/B678" title="feeling + up = happiness" />

Each character maintains standard spacing within the word. This spacing can be customized. See the [Spacing guide](/handbook/spacing-layout/spacing).

## Sentences: The `//` Separator

Use `//` to separate words in a sentence:

<Demo code="B313/B1103//B431" title="Two words separated by space" />

<Demo code="B513/B10//B431;B81//B414/B167//B4" title="I love Blissymbolics." />

<Demo code="B513/B10//B313;B81/B319//B278;B81//B278/B462//B4" title="I want to listen to music." />

- `B513/B10`: person + one = I, me
- `B313;B81/B319`: feeling + action indicator + fire = to want
- `B278;B81`: ear, hearing + action indicator = to hear, to listen
- `B278/B462`: ear, hearing + musical note = music
- `B4`: period

### Extended Spacing with `///`

Use `///` to insert an additional word space. Each extra `/` adds another space:

<Demo code="B313//B431///B1103" title="Extra space before the last word" />

This is useful for visual grouping or creating deliberate pauses in a sentence. See the [Spacing guide](/handbook/spacing-layout/spacing) for the exact unit values.

## Indicators and the Head Glyph

Indicators modify grammatical function. In a multi-character word, an indicator must attach to a specific character: the **head glyph**.

Bliss literature often uses the term *classifier* for the conceptual core of a compound word. In some descriptions, the term is also used for the character that receives the indicator, even when that character alone does not represent the full core concept.

To avoid this ambiguity, this documentation distinguishes the two levels. The *classifier* refers to the conceptual core of the compound, while the **head glyph** is the single character that receives the indicator.

Some indicators operate at the character level. For example, the *thing indicator* always targets a specific character regardless of word structure. Most indicators, however, target the **head glyph** when applied to a word.

Indicators can be attached at two levels: to a specific character with `;`, or to the head glyph with `;;`.

### Character-Level Indicators (`;`)

Use `;` to attach an indicator to **one specific character**:

<Demo code="B431;B81" title="love + action indicator = to love" />

<Demo code="B313/B431;B81" title="B81 on B431 (second character)" />

<Demo code="B431;B81/B313" title="B81 on B431 (first character)" />

You choose exactly which character gets the indicator.

### Word-Level Indicators (`;;`)

Use `;;` to attach an indicator to the **head glyph** of the word:

<Demo code="B313/B1103;;B81" title="feeling + understanding + action indicator = to empathize (head: feeling)" />

<Demo code="B313/B678;;B81" title="feeling + up + action indicator = to rejoice (head: feeling)" />

The head glyph is determined automatically. You don't need to know which character is the head. The library figures it out using the rules below.

### When to Use Each

**Use `;`** when you want the indicator on a specific character, or when working with single characters.

**Use `;;`** when composing multi-character words and you want the indicator to follow Bliss grammar rules.

## The Head Glyph Algorithm

When you use `;;`, the library determines which character is the head glyph. It uses three rules in order:

1. **Explicit marker (`^`)**: Override for rare edge cases*: `B313^/B1103;;B81`
2. **Exclusion heuristics**: Certain characters are never heads (see below)
3. **Default**: The first non-excluded character is the head

*\* Could be useful in rare cases for [predefined words](/reference/api-documentation#define-definitions-options) if the heuristic would pick the wrong head glyph. For manually composed words, you can attach the indicator directly with `;` instead.*

### What Gets Excluded

The following types of concepts are skipped from the start of the word when finding the head glyph:

| Category | What it includes | Why excluded |
|----------|------------------|--------------|
| **Structural markers** | combine marker | Technical, not semantic |
| **Scalar operators** | intensity, more, most | Modify degree, not meaning |
| **Identity operators** | not, opposite | Negate or invert the concept |
| **Concept transformers** | similar to, looks like, sounds like | Compare or relate concepts |
| **Relational operators** | on, in, from, to, before, after, through, etc. | Prepositions that relate concepts |
| **Determiners** | a, the | Specify definiteness, not meaning |
| **Quantifiers** | all, many, numbers (0-9), half, etc. | Quantity modifiers |

See the [Head Glyph Exclusions reference](/reference/head-glyph-exclusions) for the complete list.

<Demo code="B486/B378;;B86" title="opposite + heat + description indicator = cold (head: heat)" />

<Demo code="B368/B392;;B99" title="many + house + plural indicator = villages (head: house)" />

<Demo code="B449/B608;;B86" title="without + sound + description indicator = silent (head: sound)" />

<Demo code="B968/B313/B678;;B86" title="most + happiness + description indicator = happiest (head: feeling)" />

In each case, the excluded character is skipped and the indicator appears on the head glyph.

## Punctuation

Blissymbolics has standard punctuation characters:

| Code | Symbol | Usage |
|------|--------|-------|
| `B4` | Period | End of statement |
| `B5` | Comma | Pause, list separator |
| `B3` | Question mark | Questions |
| `B1` | Exclamation mark | Emphasis |

<Demo code="B313/B1103//B4" title="Statement with period" />

<Demo code="B313/B1103//B3" title="Question" />

<Demo code="B313/B1103//B1" title="Exclamation" />

Certain punctuation characters automatically receive tighter spacing. The library inserts a quarter space (QSP) before them instead of the normal three-quarter space (TSP), pulling them closer to the preceding word.

Similarly, digits are automatically kerned to sit closer together, halving the normal character spacing between them.

See the [Spacing guide](/handbook/spacing-layout/spacing) for full details on automatic and manual spacing control.
