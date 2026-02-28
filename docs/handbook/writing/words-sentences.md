# Words & Sentences

In [Get Started](/get-started/words-sentences) you learned that `/` combines characters into words and `//` separates words in a sentence. This page covers the full composition system — word-level indicators, the head glyph algorithm, and punctuation.

## Separators Overview

Pattern: single = character level, double = word level.

| Separator | Level | Purpose | Example |
|-----------|-------|---------|---------|
| `;` | Part | Attach indicator to a character | `B431;B81` |
| `/` | Character | Combine characters into a word | `B313/B1103` |
| `;;` | Word | Attach indicator to the head glyph | `B313/B1103;;B81` |
| `//` | Sentence | Separate words | `B313//B431` |

## Indicators: Character-Level vs Word-Level

Indicators modify grammatical function (see [Characters & B-Codes](/handbook/writing/characters-bcodes) for the full indicator table). They can attach at two different levels.

### Character-Level Indicators (`;`)

Use `;` to attach an indicator to **one specific character**:

<Demo code="B431;B81" title="love + action indicator = to love" />

<Demo code="B313/B431;B81" title="B81 on B431 (second character)" />

<Demo code="B431;B81/B313" title="B81 on B431 (first character)" />

You choose exactly which character gets the indicator.

### Word-Level Indicators (`;;`)

Use `;;` to attach an indicator to the **head glyph** — the main character in a multi-character word:

<Demo code="B313/B1103;;B81" title="empathy as verb (B81 on head)" />

<Demo code="B486/B1108;;B86" title="cold as description (B86 on head)" />

<Demo code="B278/B462;;B81" title="music player as action" />

The head glyph is determined automatically. You don't need to know which character is the head — the library figures it out using the rules below.

### When to Use Each

**Use `;`** when you want the indicator on a specific character, or when working with single characters.

**Use `;;`** when composing multi-character words and you want the indicator to follow Bliss grammar rules.

## The Head Glyph Algorithm

When you use `;;`, the library determines which character in a word is the "head" — the core concept that should receive the indicator. It uses three rules in order:

1. **Explicit marker (`^`)** — You can mark a character as the head: `B313^/B1103;;B81`
2. **Exclusion heuristics** — Certain characters are never heads (see below)
3. **Default** — The first non-excluded character is the head

### What Gets Excluded

Grammatical elements that modify or relate concepts are skipped when finding the head glyph:

| Category | What it includes | Why excluded |
|----------|------------------|--------------|
| **Structural markers** | combine marker | Technical, not semantic |
| **Scalar operators** | intensity, more, most | Modify degree, not meaning |
| **Identity operators** | not, opposite | Negate or invert the concept |
| **Concept transformers** | similar to, looks like, sounds like | Compare or relate concepts |
| **Relational operators** | on, in, from, to, before, after, through, etc. | Prepositions that relate concepts |
| **Quantifiers** | all, any, many, numbers (0-9), half, etc. | Quantity modifiers |

### Examples

<Demo code="B486/B1108;;B86" title="opposite + heat = cold (head: heat)" />

<Demo code="B368/B189;;B86" title="many + house = village (head: house)" />

<Demo code="B493/B291;;B81" title="over + ground = to fly (head: ground)" />

<Demo code="B117/B513;;B86" title="all + person = everyone (head: person)" />

In each case, the grammatical modifier is skipped and the indicator appears on the core concept.

### Combining Multiple Parts

You can build complex compositions with multiple parts using `;`:

<Demo code="[grid=1]||B335;B412:4,0" title="knowledge + into = understanding" />

## Words: The `/` Separator

Use `/` to combine characters into a word:

<Demo code="B313/B1103" title="feeling + understanding = empathy" />

<Demo code="B513/B431" title="person + love = sweetheart, lover" />

<Demo code="B278/B462" title="music + container = music player" />

Each character maintains standard spacing within the word. This spacing can be customized — see the [Spacing guide](/handbook/spacing-layout/spacing).

## Sentences: The `//` Separator

Use `//` to separate words in a sentence:

<Demo code="B313/B1103//B431//B4" title="Three words with period" />

<Demo code="B513/B10//B431;B81//B414/B167" title="I love Blissymbolics" />

### Extended Spacing with `///`

Use `///` to insert an additional word space. Each extra `/` adds another space:

<Demo code="B313//B431///B1103" title="Extra space before the last word" />

This is useful for visual grouping or creating deliberate pauses in a sentence. See the [Spacing guide](/handbook/spacing-layout/spacing) for the exact unit values.

### Complete Sentence Breakdown

<Demo code="B513/B10//B313;B81/B319//B278;B81//B278/B462//B4" title="I want to listen to music." />

- `B513/B10` — person + one = I
- `B313;B81/B319` — feeling+action / ear = want to hear
- `B278;B81` — music + action = to listen
- `B278/B462` — music + container = music player
- `B4` — period

## Punctuation

Blissymbolics has standard punctuation characters:

| Code | Symbol | Usage |
|------|--------|-------|
| `B4` | Period | End of statement |
| `B5` | Comma | Pause, list separator |
| `B1` | Question mark | Questions |
| `B2` | Exclamation mark | Emphasis |

<Demo code="B313/B1103//B4" title="Statement with period" />

<Demo code="B313/B1103//B1" title="Question" />

<Demo code="B313/B1103//B2" title="Exclamation" />

Certain punctuation characters automatically receive tighter spacing — the library inserts a quarter space (QSP) before them instead of the normal three-quarter space (TSP), pulling them closer to the preceding word.

Similarly, digits are automatically kerned to sit closer together, halving the normal character spacing between them.

See the [Spacing guide](/handbook/spacing-layout/spacing) for full details on automatic and manual spacing control.
