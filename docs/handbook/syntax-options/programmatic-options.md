# Programmatic Options

Set default and override options from JavaScript, without encoding them in the DSL string.

## Why Use Programmatic Options?

The [DSL string syntax](./options-system) is great for inline styling, but when an app consumes Bliss SVG Builder, it often needs to:

- Provide **app-wide defaults** that users can override in their strings
- **Enforce settings** (like stroke width for accessibility) that user strings cannot change

The second constructor parameter solves both cases.

## Constructor Syntax

```js
new BlissSVGBuilder(input, { defaults, overrides })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` | DSL input string |
| `defaults` | `object` | Options applied when the string doesn't set them (optional) |
| `overrides` | `object` | Options that always win, even over the string (optional) |

Both `defaults` and `overrides` are optional. Omitting the second parameter preserves full backward compatibility.

## Precedence

Three layers, from lowest to highest priority:

```
defaults → DSL string → overrides
```

- **Defaults** provide fallback values. The DSL string wins if it sets the same option.
- **Overrides** enforce values. They always win, even if the DSL string sets the same option.

### Defaults Example

The app sets `color` to red, but the user's string sets it to blue. Blue wins:

```js
const builder = new BlissSVGBuilder('[color=blue]||B313', {
  defaults: { color: 'red' }
});
// Result: blue stroke (string wins over default)
```

<Demo code="[color=blue]||B313" title="String wins over default" />

When the string doesn't set `color`, the default applies:

```js
const builder = new BlissSVGBuilder('B313', {
  defaults: { color: 'red' }
});
// Result: red stroke (default applies)
```

<Demo code="[color=red]||B313" title="Default applies when string is silent" />

### Overrides Example

The app enforces `color` as red. It wins even though the string says blue:

```js
const builder = new BlissSVGBuilder('[color=blue]||B313', {
  overrides: { color: 'red' }
});
// Result: red stroke (override wins)
```

<Demo code="[color=red]||B313" title="Override always wins" />

### All Three Layers

Different keys across layers are all applied:

```js
const builder = new BlissSVGBuilder('[color=blue]||B313', {
  defaults: { grid: true },
  overrides: { strokeWidth: 0.8 }
});
// Result: blue stroke (from string), grid visible (from default),
//         stroke-width 0.8 (from override)
```

<Demo code="[color=blue;grid=1;stroke-width=0.8]||B313" title="Keys from all three layers" />

When the same key appears in all three layers, the override wins:

```js
const builder = new BlissSVGBuilder('[color=blue]||B313', {
  defaults: { color: 'green' },
  overrides: { color: 'red' }
});
// Result: red stroke (override wins over string and default)
```

## Option Format

Options use **camelCase** keys with native JavaScript types, not the kebab-case strings used in DSL syntax.

### Key Mapping

| JavaScript (camelCase) | DSL (kebab-case) | Type | Example |
|------------------------|------------------|------|---------|
| `color` | `color` | string | `'red'`, `'#ff0000'` |
| `strokeWidth` | `stroke-width` | number | `0.5` |
| `grid` | `grid` | boolean | `true` |
| `margin` | `margin` | number | `2` |
| `marginTop` | `margin-top` | number | `3` |
| `charSpace` | `char-space` | number | `4` |
| `wordSpace` | `word-space` | number | `10` |
| `background` | `background` | string | `'#fff'` |
| `backgroundTop` | `background-top` | string | `'#fce4ec'` |
| `backgroundMid` | `background-mid` | string | `'#e8f5e9'` |
| `backgroundBottom` | `background-bottom` | string | `'#e3f2fd'` |
| `center` | `center` | boolean | `false` |
| `crop` | `crop` | number or string | `'auto'` |
| `svgHeight` | `svg-height` | number | `100` |
| `gridColor` | `grid-color` | string | `'#ccc'` |

All options from the [Options Quick Reference](/reference/options-quick-reference) are supported. The same validation and clamping applies (e.g., `strokeWidth` is clamped to 0.1–1.5).

### Type Conventions

- **Booleans**: Use `true`/`false` (not `"1"`/`"0"`)
- **Numbers**: Use native numbers (not strings)
- **Strings**: Use regular strings. They are HTML-escaped automatically
- **Bulk options**: Work the same (`margin: 2` sets all four margins)

## Practical Patterns

### App-Wide Theme

Provide visual defaults that users can override in their strings:

```js
function renderBliss(userInput) {
  return new BlissSVGBuilder(userInput, {
    defaults: {
      color: '#333',
      strokeWidth: 0.6,
      background: '#fafafa'
    }
  });
}

// User string can override any default
renderBliss('[color=red]||B313');  // red stroke, other defaults still apply
renderBliss('B313');               // all defaults apply
```

### Enforced Accessibility

Ensure readability regardless of user input:

```js
function renderAccessible(userInput) {
  return new BlissSVGBuilder(userInput, {
    overrides: { strokeWidth: 1.0 }
  });
}

// stroke-width is always 1.0, even if user writes [stroke-width=0.2]
renderAccessible('[stroke-width=0.2]||B313');
```

### Editor Preview Mode

Show grid and margins in an editor, but not in production:

```js
function renderPreview(userInput) {
  return new BlissSVGBuilder(userInput, {
    overrides: { grid: true, margin: 1 }
  });
}
```

### Combined Defaults and Overrides

```js
function renderWithBranding(userInput) {
  return new BlissSVGBuilder(userInput, {
    defaults: {
      color: '#1e3a5f',      // brand color (user can override)
      charSpace: 3            // wider spacing (user can override)
    },
    overrides: {
      strokeWidth: 0.6,       // enforced line weight
      background: '#ffffff'   // enforced white background
    }
  });
}
```

## Edge Cases

Recall the constructor signature: `new BlissSVGBuilder(input, { defaults, overrides })`

| Scenario | Behavior |
|----------|----------|
| No second parameter | No effect. Only the DSL string is used |
| `null` second parameter | No effect. Treated the same as omitting it |
| Empty `defaults: {}` | No effect |
| Empty `overrides: {}` | No effect |
| `null`/`undefined` values in objects | Silently skipped |
| Only `defaults` provided | No overrides applied |
| Only `overrides` provided | No defaults applied |
