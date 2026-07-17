# Latin & Cyrillic

Integrate Latin and Cyrillic text into your Blissymbolics compositions.

## Overview

Prefix a letter with `X` to render it as a text character alongside Bliss symbols. A multi-letter code spells a whole run of text:

<Demo code="Xhello" title="Latin text: Xhello" />

This is useful for proper names and other words that are spelled rather than symbolized:

<Demo code="B464//XAnna" title="name (B464) + the spelled name Anna" />

Letters render from outlines embedded in the library, so the output is self-contained: it looks the same everywhere, with no font needed where the SVG is displayed.

## Writing Latin text

Each letter is its own code: `Xa` through `Xz` and `XA` through `XZ`. A multi-letter code is shorthand for the letter sequence, and serializes in the expanded form:

<Demo code="Xh/Xe/Xl/Xl/Xo" title="The same word, written letter by letter" />

Accented letters work the same way. The embedded set covers å/ä/ö and a wide selection of European accented letters (é, ñ, ü, ç, š, ł, ž, and more):

<Demo code="Xcafé" title="Accented letters: Xcafé" />

<Demo code="Xnaïve" title="Xnaïve" />

The BCI character codes `B29`-`B54` (a-z) and `B55`-`B80` (A-Z) are aliases for the basic Latin letters; they render identically and serialize as their X-code equivalents.

## Writing Cyrillic text

The Russian Cyrillic alphabet (а-я, А-Я, including ё/Ё) is fully covered by embedded outlines:

<Demo code="Xпривет" title="Cyrillic text: Xпривет" />

## Letters only

The X notation spells letters, nothing else. Punctuation and digits have no X form: in `XAnna-Karin`, the letters of `Anna` render and `-Karin` is reported as an unknown code. Combining Bliss with full text beyond letters is an open design area; see [Compatibility](#compatibility) below.

## Spacing and styling

Letters in a run are spaced by `external-glyph-space` (default `0.8` grid units), and carry intrinsic kerning derived from their underlying font. See [Spacing](/handbook/writing/spacing) for details:

<Demo code="[external-glyph-space=1.5]||Xhello" title="Wider letter spacing" />

Styling options apply to letters like to any other glyph:

<Demo code="[color=green]XA/Xn/Xn/Xa" title="Character-level color on the first letter" />

## The supported set

Embedded outlines currently cover:

| Group | Characters |
|-------|------------|
| Basic Latin | a-z, A-Z |
| Nordic | å ä ö, Å Ä Ö |
| European accented letters | a wide selection from Latin-1 and Latin Extended-A (é, ñ, ü, ç, š, ł, ž, œ, and more) |
| Russian Cyrillic | а-я, А-Я, ё Ё |

The set can grow in minor releases. A letter outside it does not fail: it falls back to text rendering, described next.

## Text fallback <Badge type="warning" text="Experimental" />

A letter the parser recognizes but has no embedded outline for (for example Greek) still renders, as an SVG `<text>` element:

<Demo code="Xλόγος" title="Greek renders through the text fallback" />

The fallback comes with real limitations, which is why it carries the experimental marking:

- **Environment-dependent appearance.** A `<text>` element is drawn with the fonts available where the SVG is displayed, so the exact appearance varies between systems and is not covered by the [compatibility guarantee](/reference/compatibility#external-glyphs-x-codes).
- **SVG display only.** For the same reason, a `<text>` element is typically lost or changed when the SVG is converted to an image (for example PNG) in an environment without matching fonts. Outlined letters survive conversion; fallback letters may not.
- **Approximate metrics.** Widths for fallback characters are estimated, so precise layouts may need manual kerning or cropping.
- **The run falls back as a whole.** When a text run mixes outlined and non-outlined letters, the whole run renders as one fallback element, and serializes as one code (`Xa/Xλ/Xb` serializes as `Xaλb`).

Text rendering covers the Latin, Greek, and Cyrillic letter ranges. `X` followed by a character outside them (a digit, punctuation) is an unknown code, reported with an `UNKNOWN_CODE` warning.

## Compatibility

X-code input keeps its meaning permanently: a string that parses today keeps parsing and keeps meaning the same text in every future version. The X notation is the library's current mechanism for spelled text, not necessarily its final one: the serialized form and the rendering mechanism may evolve in future releases, always release-noted, and a future mechanism may depend on a font being available where the SVG is generated. The letter B-codes (`B29`-`B80`) are stable like every B-code. Details in [Compatibility](/reference/compatibility#external-glyphs-x-codes).
