# Characters & B-Codes

In [Get Started](/get-started/characters-bcodes) you learned that every Bliss character has a B-code and that indicators attach with `;`. This page goes deeper into how characters are built internally, compound characters, and the full indicator system.

## Character Composition

Characters are made of positioned shapes. For example, `B313` ("feeling") is defined as `H:0,8`, a heart shape at position (0,8):

<Demo code="[grid=1]||B313" title="B313 - the character" />

<Demo code="[grid=1]||H:0,8" title="H:0,8 - its underlying definition" />

Characters have standard dimensions (20 units height) designed for consistent alignment in words and sentences. The grid shows the coordinate system. See [Understanding the Grid](/handbook/coordinate-system/understanding-the-grid) for details.

## Compound Characters

Many characters are compounds, built from other characters positioned together. `B931` ("observation") combines B447 ("mind") and B303 ("eye"):

<Demo code="B931" title="B931 - observation" />

<Demo code="[grid=1]||B447;B303:2,0" title="Defined as B447;B303:2,0 (mind + eye)" />

The definition `B447;B303:2,0` uses `;` (the part separator) to overlay two elements, with `:2,0` positioning the eye relative to the mind. These internal definitions use the same syntax you'd use when [building custom characters from shapes](/handbook/writing/shapes).

## Indicators

Indicators are small diacritic marks that modify a character's grammatical function. They attach with `;` and automatically position themselves above the character.

### Indicators Reference

| Indicator | Code | Purpose | Example |
|-----------|------|---------|---------|
| Action | `B81` | Marks as action (verb) | `B431;B81` = to love |
| Description | `B86` | Marks as description (adjective/adverb) | `B313;B86` = emotional |
| Thing | `B97` | Marks concrete sense | `B447;B97` = brain |
| Plural | `B99` | Marks plural | `B513;B99` = persons |
| Past | `B92` | Marks past tense | `B431;B92` = loved |
| Future | `B87` | Marks future tense | `B431;B87` = will love |

See the [Indicators Reference](/reference/indicators-reference) for the complete list.

### Auto-Positioning

Indicators position themselves automatically above the character. Each glyph defines its own anchor point, so the indicator is placed correctly even when that means it's not mathematically centered:

<Demo code="[grid=1]||B431;B81" title="Centered indicator" />

<Demo code="[grid=1]||B391;B81" title="Indicator automatically shifted left" />

For details on how anchor points work and how to override positioning manually, see [Positioning](/handbook/spacing-layout/positioning).

### Combined Indicators

Many grammatical meanings require multiple indicators together. Bliss provides pre-combined indicators for common combinations:

| Combined | Code | Equivalent to |
|----------|------|---------------|
| Definite plural | `B5996` | `B904` + `B99` |
| Plural thing | `B98` | `B99` + `B97` |
| Definite thing | `B5997` | `B904` + `B97` |
| Past passive | `B95` | `B92` + `B91` |

<Demo code="B513;B5996" title="the persons — combined definite plural indicator" />

<Demo code="B431;B95" title="was loved — combined past passive indicator" />

See the [Indicators Reference](/reference/indicators-reference) for all combined indicators.

### Custom Indicator Combinations

You can also combine indicators yourself by separating them with `;`. The indicators are spaced apart and centered as a group:

<Demo code="B431;B81;B99" title="to love (plural) — two separate indicators" />

### Manual Indicator Positioning

You can override automatic indicator positioning with `:x,y` coordinates. See the [Positioning guide](/handbook/spacing-layout/positioning) for how this works within the character's coordinate space.

## When Indicators Meet Words

An indicator semantically applies to an entire word, but it's still physically placed above a single character. When you build multi-character words, `;;` lets you attach indicators at the word level, and the builder determines which character receives it. See [Words & Sentences](/handbook/writing/words-sentences).

## Characters to Try

| Code | Meaning |
|------|---------|
| `B313` | feeling, emotion |
| `B431` | love, affection |
| `B1103` | understanding |
| `B412` | knowledge |
| `B513` | person |
| `B278` | ear |
| `B319` | fire |
| `B81` | action indicator |
| `B86` | description indicator |
| `B99` | plural indicator |
| `B4` | period (full stop) |
| `B5` | comma |
| `B3` | question mark |
| `B1` | exclamation mark |
