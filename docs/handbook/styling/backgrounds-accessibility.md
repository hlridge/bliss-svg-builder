# Backgrounds & Accessibility

Add backgrounds to your Bliss SVGs and make them accessible with proper metadata.

## Background Color

Add a background with the `background` option:

<Demo code="[background=#f5f5f5]||B313" title="Light gray background" />

<Demo code="[background=#dbeafe]||B313" title="Light blue background" />

### Colored Characters on Backgrounds

Combine background with character colors for themed displays:

<Demo code="[color=#dc2626;background=#fee2e2]||B313" title="Red on light red" />

<Demo code="[color=#2563eb;background=#dbeafe]||B313" title="Blue on light blue" />

### High Contrast

For readability, ensure sufficient contrast between stroke and background. WCAG AA requires a contrast ratio of at least 4.5:1 for text — aim for the same with Bliss characters:

<Demo code="[color=#1e3a8a;background=#eff6ff]||B313" title="Dark blue on light blue" />

<Demo code="[color=#ffffff;background=#1e3a8a]||B313" title="White on dark blue" />

## SVG Output Options

### Fixed Height

Set an explicit pixel height with `svg-height`. The width is auto-calculated to maintain the aspect ratio:

<Demo code="[svg-height=48]||B313" title="48px tall" />

<Demo code="[svg-height=100]||B313" title="100px tall" />

This is useful when integrating with layouts that require specific dimensions.

### Accessibility Labels

Add accessible labels with `svg-title` and `svg-desc`:

```js
const builder = new BlissSVGBuilder(
  '[svg-title=Feeling;svg-desc=Heart symbol representing emotion]||B313'
);
```

These create `<title>` and `<desc>` elements inside the SVG:

```html
<svg ...>
  <title>Feeling</title>
  <desc>Heart symbol representing emotion</desc>
  <!-- paths -->
</svg>
```

Screen readers use these to describe the symbol to users. For inline SVGs, you can also add `aria-label` directly on the surrounding HTML element as an alternative.

### Combined Example

```js
const builder = new BlissSVGBuilder(`
  [svg-title=I love you;svg-desc=Bliss sentence meaning I love you;svg-height=60;background=#f8fafc]||B513/B10//B431;B81//B4
`);
```

## Best Practices for AAC Applications

When building communication boards or AAC tools:

1. **Always include titles** — use `svg-title` with the character's meaning so screen readers can announce it
2. **Add descriptions** — use `svg-desc` for additional context (e.g., "Heart symbol representing emotion")
3. **Ensure contrast** — choose background and stroke colors with a contrast ratio of at least 4.5:1
4. **Use consistent sizing** — set `svg-height` for uniform dimensions across your interface
5. **Category colors** — use background colors to group symbols by category (people, actions, feelings)

<Demo code="[background=#dcfce7;color=#166534]||B313" title="Feelings (green)" />

<Demo code="[background=#dbeafe;color=#1e40af]||B81" title="Actions (blue)" />

<Demo code="[background=#fef3c7;color=#92400e]||B513" title="People (yellow)" />

## Options Reference

| Option | Default | Description |
|--------|---------|-------------|
| `background` | none | Background color (any CSS color) |
| `svg-height` | auto | Explicit SVG height in pixels |
| `svg-title` | none | Accessible title (creates `<title>` element) |
| `svg-desc` | none | Accessible description (creates `<desc>` element) |
