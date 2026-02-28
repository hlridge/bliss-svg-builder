# Characters & B-Codes

In [Get Started](/get-started/characters-bcodes) you learned that every Bliss character has a B-code and that indicators attach with `;`. This page goes deeper — how characters are built internally, compound characters, and the full indicator system.

## Character Composition

Characters are made of positioned shapes. For example, `B313` ("feeling") is defined as `H:0,8` — a heart shape at position (0,8):

<Demo code="[grid=1]||B313" title="B313 - the character" />

<Demo code="[grid=1]||H:0,8" title="H:0,8 - its underlying definition" />

Characters have standard dimensions (20 units height) designed for consistent alignment in words and sentences. The grid shows the coordinate system — see [Understanding the Grid](/handbook/coordinate-system/understanding-the-grid) for details.

## Compound Characters

Many characters are compounds — built from other characters positioned together. `B931` ("observation") combines B447 ("mind") and B303 ("eye"):

<Demo code="B931" title="B931 - observation" />

<Demo code="[grid=1]||B447;B303:2,0" title="Defined as B447;B303:2,0 (mind + eye)" />

The definition `B447;B303:2,0` uses `;` (the part separator) to overlay two elements, with `:2,0` positioning the eye relative to the mind. These internal definitions use the same syntax you'd use when [building custom characters from shapes](/handbook/writing/shapes).

## Indicators

Indicators are small diacritic marks that modify a character's grammatical function. They attach with `;` and automatically position themselves above the character.

### Indicator Reference

| Indicator | Code | Purpose | Example |
|-----------|------|---------|---------|
| Action | `B81` | Creates verbs | `B431;B81` = to love |
| Description | `B86` | Creates adjectives | `B313;B86` = emotional |
| Thing | `B97` | Creates nouns | `B431;B97` = love (the noun) |
| Plural | `B99` | Creates plurals | `B513;B99` = persons |
| Past | `B92` | Past tense | `B431;B92` = loved |
| Future | `B87` | Future tense | `B431;B87` = will love |

See the [Indicators Reference](/reference/indicators-reference) for the complete list.

### Auto-Positioning

Indicators automatically position themselves centered above the character's content area:

<Demo code="[grid=1]||B431;B81" title="Indicator auto-positioned above" />

The library calculates the optimal position based on the character's bounding box and anchor point. For most cases, this works well without any manual adjustment.

### Multiple Indicators

A character can have more than one indicator. When multiple indicators are attached, they are spaced apart and centered as a group:

<Demo code="B431;B81;B99" title="to love (plural) — two indicators" />

Each indicator is separated by `;`, just like attaching a single one.

### Manual Indicator Positioning

When you need precise control, add `:x,y` coordinates to override automatic positioning:

<Demo code="[grid=1]||B431;B81:3,2" title="Indicator manually positioned at (3,2)" />

This places the indicator exactly where specified, ignoring the auto-positioning algorithm. See the [Positioning guide](/handbook/spacing-layout/positioning) for full details on the `:x,y` coordinate syntax.

## When Indicators Meet Words

When you compose multi-character words with `/`, you'll often want an indicator on the *word* rather than a specific character. That's where word-level indicators (`;;`) and the head glyph algorithm come in — covered in [Words & Sentences](/handbook/writing/words-sentences).

## Characters to Try

| Code | Meaning |
|------|---------|
| `B313` | feeling, emotion |
| `B431` | love, affection |
| `B1103` | understanding |
| `B335` | knowledge |
| `B513` | person |
| `B278` | music |
| `B319` | ear, hearing |
| `B81` | action indicator |
| `B86` | description indicator |
| `B99` | plural indicator |
| `B4` | period (full stop) |
| `B5` | comma |
| `B1` | question mark |
| `B2` | exclamation mark |
