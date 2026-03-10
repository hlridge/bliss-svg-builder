# DSL Syntax Overview

The Bliss SVG Builder uses a Domain-Specific Language (DSL) to describe characters, words, and sentences. This page is the complete syntax reference. Each element links to the page that explains it in depth.

## Full Syntax Pattern

```
[global options]||[word options]|[character options][part options]>CODE:x,y
```

Each part is optional. At its simplest, just use a B-code:

<Demo code="B313" title="Simple B-code" />

## Hierarchy

The DSL has four composition levels:

| Level | Separator | Example | Covered in |
|-------|-----------|---------|------------|
| **Sentence** | `//` between words | `B313//B431` | [Words & Sentences](/handbook/writing/words-sentences) |
| **Word** | `/` between characters | `B313/B1103` | [Words & Sentences](/handbook/writing/words-sentences) |
| **Character** | `;` between parts | `B431;B81` | [Characters & B-Codes](/handbook/writing/characters-bcodes) |
| **Part** | (atomic unit) | `H`, `B313` | [Shapes](/handbook/writing/shapes) |

<Demo code="B313;B81/B1103//B431//B4" title="All levels in one composition" />

## Structure Separators

| Separator | Purpose | Covered in |
|-----------|---------|------------|
| `;` | Attach indicator to a character | [Characters & B-Codes](/handbook/writing/characters-bcodes) |
| `;;` | Attach indicator to the head glyph of a word | [Words & Sentences](/handbook/writing/words-sentences) |
| `/` | Combine characters into a word | [Words & Sentences](/handbook/writing/words-sentences) |
| `//` | Separate words in a sentence | [Words & Sentences](/handbook/writing/words-sentences) |
| `///` | Extra word space (each `/` adds more) | [Words & Sentences](/handbook/writing/words-sentences) |

## Option Scopes

| Separator | Scope | Example | Priority |
|-----------|-------|---------|----------|
| `\|\|` | Global | `[color=red]\|\|B313` | Lowest |
| `\|` | Word | `[color=blue]\|B313` | ↓ |
| (none) | Character | `[color=green]B313` | ↓ |
| `>` | Part | `[color=orange]>B313` | Highest |

More specific scopes override broader ones. See [Options System](/handbook/syntax-options/options-system) for cascading rules.

## Coordinates

Position shapes with `:x,y` after the code:

```
CODE        → x=0, y=0 (defaults)
CODE:x,y    → explicit position
CODE:x      → y defaults to 0
CODE:,y     → x defaults to 0
```

See [Positioning](/handbook/spacing-layout/positioning) for full details.

## Kerning

| Code | Effect | Covered in |
|------|--------|------------|
| `RK:value` | Adjust spacing relative to default | [Spacing](/handbook/spacing-layout/spacing) |
| `AK:value` | Set exact spacing | [Spacing](/handbook/spacing-layout/spacing) |

## Formal Grammar

```
SENTENCE = [GLOBAL_OPTS||] WORD [// WORD]*

WORD = [WORD_OPTS|] CHARACTER [/ CHARACTER]*

CHARACTER = [CHAR_OPTS] PART [; PART]*

PART = [PART_OPTS>] CODE [:X,Y]

GLOBAL_OPTS = [opt=val;opt=val...]
WORD_OPTS = [opt=val;opt=val...]
CHAR_OPTS = [opt=val;opt=val...]
PART_OPTS = [opt=val;opt=val...]

CODE = B-code | Shape code | Custom code

KERNING = RK:value | AK:value (used in CHARACTER position)
```

## Quick Reference

| Pattern | Meaning |
|---------|---------|
| `B313` | Single character |
| `B313/B1103` | Word (two characters) |
| `B313//B431` | Sentence (two words) |
| `B431;B81` | Character with indicator |
| `B313/B1103;;B81` | Word-level indicator (on head glyph) |
| `H:0,8` | Shape at position |
| `[color=red]\|\|` | Global option |
| `[color=blue]\|` | Word option |
| `[color=green]` | Character option |
| `[color=orange]>` | Part option |
| `RK:-1` | Relative kerning |
| `AK:4` | Absolute kerning |
