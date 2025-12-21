# DSL Syntax Reference

The Bliss SVG Builder uses a Domain-Specific Language (DSL) to describe Bliss characters, words, and sentences.

## Basic Structure

At its simplest, you can use just a shape code:

<Demo code="H" title="Simple heart" />

The DSL supports a hierarchical structure for complex compositions:

```
[global options]||[word options]|[character options][part options]>code
```

Each part is optional - you only use what you need.

---

## Hierarchy Levels

The DSL has four composition levels:

| Level | Description | Separator |
|-------|-------------|-----------|
| **Sentence** | The complete composition | (root level) |
| **Word** | Group of characters | `//` separates words |
| **Character** | Group of parts | `/` separates characters |
| **Part** | Individual shapes | `;` separates parts |

### Example: Building Up

<Demo code="H" title="Part: Single heart" />

<Demo code="H;C4:2,2" title="Character: Heart with small circle" />

<Demo code="H;C4:2,2/E:6,0" title="Word: Two characters" />

<Demo code="H/E//C8" title="Sentence: Two words" />

---

## Coordinates

Position shapes using `:x,y` after the shape code:

```
CODE        (both x and y default to 0)
CODE:x,y
CODE:x      (y defaults to 0)
CODE:,y     (x defaults to 0)
```

<Demo code="H:0,8" title="Heart at x=0, y=8" />

<Demo code="H:0,8;C4:2,10" title="Heart and circle positioned" />

<Demo code="[grid=1]||H:0,8;C4:2,10" title="Same with grid visible" />

---

## Options

Options control appearance and behavior using `[key=value]` syntax.

### Option Scope Levels

Options cascade from global to specific, with more specific options overriding broader ones:

| Scope | Syntax | Priority |
|-------|--------|----------|
| Global | `[options]||` | Lowest (applies to everything) |
| Word | `[options]|` | Overrides global |
| Character | `[options]` (directly adjacent) | Overrides word |
| Part | `[options]>` | Highest (overrides all) |

### Multiple Options

Separate multiple options with semicolons:

```
[color=red;stroke-width=0.8]||H
```

<Demo code="[color=red;stroke-width=0.8]||H" title="Red heart with thick stroke" />

---

## Cascading Example

This example shows how options cascade through the hierarchy:

```
[color=red]||[color=blue]|[color=green][color=orange]>H;H:10,0/H//H
```

<Demo code="[color=red]||[color=blue]|[color=green][color=orange]>H;H:10,0/H//H" title="Four hearts with cascading colors" />

**What's happening:**
1. **Orange heart** (left) - Part option `[color=orange]>H` has highest priority
2. **Green heart** - Character option `[color=green]` applies to `H:10,0` (no part override)
3. **Blue heart** - New character `/H` uses word option `[color=blue]` (no character override)
4. **Red heart** (right) - New word `//H` uses global option `[color=red]` (no word override)

---

## Separators Reference

### In Options

| Separator | Usage | Example |
|-----------|-------|---------|
| `\|\|` | After global options | `[color=red]\|\|H` |
| `\|` | After word options | `[color=blue]\|H` |
| `>` | After part options | `[color=green]>H` |
| (none) | Character options | `[color=yellow]H` |

### In Code Structure

| Separator | Usage | Example |
|-----------|-------|---------|
| `//` | Between words | `H//C8` |
| `/` | Between characters | `H/C8` |
| `;` | Between parts | `H;C4:3,2` |

---

## Kerning

*Under construction*

---

## Practical Examples

### Styled Composition

<Demo code="[color=#2563eb;stroke-width=0.6]||H:0,8/C8:6,4/E:12,8" title="Blue composition with custom stroke" />

### With Grid

<Demo code="[grid=1;grid-color=#ccc]||H:0,8;C4:3,10" title="Grid helper for positioning" />

### Word Separation

<Demo code="H:0,8/C4:6,8//E:0,8/F:6,8" title="Two words separated by //" />

### Complex Nesting

<Demo code="[color=red]||[stroke-width=0.8]|H:0,8;[color=blue]>C4:3,10/E:10,8" title="Mixed options and positioning" />

---

## Next Steps

- Explore available [shapes](/reference/shapes)
- Learn about all [options](/guide/options)
- Understand [positioning](/guide/positioning) in detail
