# Changelog

## 1.1.0 (unreleased)

Everything below is the change since `1.0.0`. The first section lists what an app built on 1.0.0 may notice after upgrading, each entry with what to do if you relied on the old behavior.

### Changes to existing behavior

**Markup and styling.**

- The attributes that describe the image (`role`, `aria-*`, `id`, `data-*`, `lang`, `tabindex`, `preserveAspectRatio`, `overflow`), set globally, now go on the root `<svg>` instead of the `<g class="bliss-content">` group inside it, so `[role=img;aria-label=water]||` labels the image itself. Everything else set globally still styles the symbol from the content group (`[opacity=0.5]||` fades the symbol, not the paper or the grid); to reach the whole image, name the root (`root--opacity`, see Features).
- The root element now carries `class="bliss-root"`, and a global `class` is added there (`[class=mine]||` gives `class="bliss-root mine"`) instead of to the content group. The library's class names are stable from this release on, so selecting on them is safe.
- The background now always sits in a `<g class="bliss-background">` group, and the rects that paint it carry `bliss-background-zone` (the zones are `bliss-background-zone--top`, `--mid` and `--bottom`, renamed from `bliss-background--top` and so on). A stylesheet rule that filled `.bliss-background` should now target `.bliss-background-zone`.
- An attribute name of your own is no longer hyphenated on its way out: `[data-blissID=7]` shipped `data-bliss-i-d` and `[preserveAspectRatio=xMidYMid]||` a dead `preserve-aspect-ratio`; both now emit what you wrote. Write a name of your own the way you want it emitted (`dataBlissId` and `data-bliss-id` are now two attributes, each removed under its own spelling). The library's own options and the names SVG and ARIA own accept either spelling (see the next entry and Bug Fixes).
- The library's own options now work in either spelling in a bracket too: `[marginTop=3]` used to be an attribute named `marginTop` and now sizes the margin, serialized as `[margin-top=3]`. If you wrote a camelCase key in a bracket meaning a literal attribute, and it spells one of the library's options, rename it or write `root--marginTop`.
- A global key containing `--` now names a part of the picture to style (see attribute targeting under Features), split at its last `--`. A name of your own holding `--` (`[foo--x=1]||`), which 1.0.0 emitted as written, is now reported with `UNKNOWN_LAYER` and not emitted.
- A global link (`[href=…]||`) now wraps the whole symbol with a transparent rectangle the size of the picture, so every point of it is clickable in every browser (it was only the ink's box in Chrome and Safari, and only the strokes in Firefox). `svgContent` no longer contains this link: it holds the composition alone, as it does for every other global option.

**What some input draws.**

- `stroke-width` no longer clamps to 0.1 to 1.5: the width you write is drawn, so heavier and hairline strokes are now possible. A width nothing can draw is refused and the stroke keeps the width it would have had: a negative or infinite one with `OUT_OF_RANGE_OPTION_VALUE` (`[stroke-width=-2]` drew at 0.1), a non-number with `INVALID_OPTION_VALUE`.
- The upper limits on `char-space` (10), `word-space` (20), `external-glyph-space` (3), `dot-width` and `sdot-width` (1.5), and `dot-extra-width` and `sdot-extra-width` (1) are gone: `[char-space=50]` now spaces by 50, where it was cut to 10 without a word. A spacing too large for the picture's width to be written down (`[char-space=1e308]`) now ships `width="Infinity"` and reports `OUT_OF_RANGE_COMPUTED_GEOMETRY`, where the limit kept it finite.
- An `x` written at character scope is now blank space that belongs to the character (#18): in `B99/[x=5]B291` the second character starts where the writing flow puts it, measures 5 units wider and moves what follows. It used to be placed at the previous character's ink edge plus the value, which removed the spacing at `[x=0]`. Word, global and part positions and `y` are unchanged.
- A part positioned twice now takes the option's position (#18): `[x=5;y=10]>B291:3,7` puts the part at 5,10, where the coordinate won, and the losing value is reported with `MULTIPLE_POSITION_VALUES`.
- A character now takes one kerning value: written more than once, the last one wins and an option beats a marker, each losing value reported with `MULTIPLE_KERNING_VALUES`. `B99/RK:3/AK:4/B291` now kerns by `AK:4`, where `RK:` won in either order.
- The options a definition brings (its `defaultOptions`, a bracket leading its code string, or a built-in's own look, such as the dotted line of `REFSQUARE` and `ANCHORRING`) now style exactly what the definition draws and stay with it: an option written on the character no longer restyles them, an indicator added beside them no longer takes them on, and saves stop repeating them. With `REDGLYPH` defined `{ type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } }`:

  | | 1.0.0 | 1.1.0 |
  |---|---|---|
  | `[color=blue]REDGLYPH` draws | blue | red; write `[color=blue]>REDGLYPH` for blue |
  | `REDGLYPH`, `toString()` | `[color=red]B291` | `[color=red]>B291` |
  | `REDGLYPH`, `toString({ preserve: true })` | `[color=red]REDGLYPH` | `REDGLYPH` |
  | `REFSQUARE`, `toString()` | `[stroke-dasharray=0 0.999][stroke-dasharray=0 0.999]>REFSQUARE` | `REFSQUARE` |

  Removing such an option (`removeOptions('stroke-dasharray')`) now returns the part to the definition's value; to draw one without it, override it on the part (`[stroke-dasharray=none]>REFSQUARE`).
- An alias's options (an alias is a name defined with a code string and no `type`) now sit on every part the alias draws instead of on the character it is written as, so they no longer style what is added to that character, and an alias of several words styles all of them. An alias of one code used as a part now draws what it draws alone: with `A1` defined `{ codeString: 'B291', defaultOptions: { color: 'red' } }` and `A2` as `{ codeString: 'A1', defaultOptions: { color: 'blue' } }`, `B313;A2` and `A2:1` now draw blue, as `A2` does, where they drew red; a part bracket where an alias is used now restyles it.
- A word that starts with B402 (into, entrance) or B491 (out of, exit) now takes its word-level indicators there, since BCI-AV uses these two mostly as the nouns heading words such as "import" (`B402/B356`) and "export" (`B491/B356`): `B491/B356;;B81` now draws the action indicator on B491, where it went to B356. Where either is a modifier, mark the head with `^` (`B402/B356^;;B81`).
- A space at the end of a composition now counts in full, as one at the start already did: measured with `margin=0`, `B313//` is 16 units wide where it was 10, and a composition of only spaces is as wide as its spaces. `crop=auto` still trims to the ink.
- `autoVertical` and `cropCompact`, the library's internal names for `crop=auto-vertical` and `crop=compact`, worked as options by accident; they no longer crop, and are reported with `MISPLACED_OPTION_SPELLING`, naming the `crop` value that works.

**Saved strings and JSON.**

- `toJSON()` now writes each of the library's options under its JavaScript spelling (`strokeWidth`, `marginTop`, `gridSkyColor`), where every option came back hyphenated; a name SVG or ARIA owns comes back in that standard's spelling (`viewBox`, `aria-label`) and a name of your own as you typed it. Only code that reads those keys is affected: JSON saved by 1.0.0 still loads and draws the same, and `toString()` still writes the bracket spelling (`[margin-top=3]||`).
- `toJSON()` no longer keeps a second copy of a position in the `options` bag: read `x` and `y` beside the element (`options.x` is gone), and an options bag holding nothing but a position is now left out (the composition's own bag stays).
- A part position now comes back as you set it: an axis you did not set stays unset, and one you set stays even at `0`. `B291;B86:,3` came back as `B291;B86:0,3` and `B291;B86:0,0` as `B291;B86`, each of which reloaded with the indicator somewhere else; `C8:0,0` now comes back as `C8:0,0` rather than `C8` (same drawing).
- A position is now written in one form: the number normalized (`[x=5.0]` and `[x=+5]` come back as `[x=5]`), first in its bracket (`[color=red;x=5]B291` comes back as `[x=5;color=red]B291`), and a part position set as an option written as a coordinate (`[x=2]>S8;C8` comes back as `S8:2;C8`, where it came back as `[x=2]>S8:2,0;C8`) (#18).
- A run of spaces now comes back one space at a time, a default space as a bare separator: `H//QSP//H` comes back as written, where it was expanded to `H/TSP/QSP/TSP/H` (#19).
- A word written with the `X` letter shorthand now comes back in it: `Xhello` comes back as `Xhello`, not `Xh/Xe/Xl/Xl/Xo`, and `Xa/Xb` as `Xab` (#19). A letter carrying an option, a coordinate or a head marker keeps its run written out.

**API.**

- A custom glyph written alone is now one part named after it, as a built-in character is: `glyph(0).part(0)` is that part (its `codeName` is the glyph's name) and `glyph(0).part(1)` is whatever was added beside it, where `part(0)` was the first part the definition draws.
- `define()` now refuses `x`, `y`, `relativeKerning`, `absoluteKerning` (either spelling) and `key` as defaults, in `defaultOptions` and in a bracket that starts a code string, with an `errors` entry saying where the value belongs, and `patchDefinition()` throws. As defaults they gave every use of the character the same position or key. Write them where the code is used: `MYCHAR:2,0` or `[x=2]MYCHAR`, `B313/RK:1/MYCHAR`, `[key=subject]MYCHAR`. The bracket now also refuses an option for the whole SVG (`margin`) and a layer key, as `defaultOptions` already did.
- The part methods (`addPart()`, `insertPart()`, `replacePart()`, and `replace()` on a part) now throw on a `|` outside an option bracket (`addPart('|B313')` added `B313` with a warning about text never written), and the part and character methods now throw on a code that starts with `;;` (`addGlyph(';;B81')` added the character `B81` in silence).

**TypeScript.**

- The option names in the type definitions are now spelled the way JavaScript writes them, so autocomplete offers `strokeWidth` and `marginTop`. Both spellings still typecheck; reading a value back, `opts.strokeWidth` now gives a `number`, and `opts['stroke-width']` the catch-all type.

### Features

**Styling every part of the picture.**

- Attribute targeting: prefix a global attribute with the part of the picture it is for, and it goes there alone. `[grid;grid--opacity=0.3]||B313` fades the reference grid behind full-strength artwork, `[grid;grid-line--sky--stroke-dasharray=2]||B313` dashes the sky line alone, and `background-zone--rx=2` rounds the paper's corners. Every class the library writes is a target, named by the class without its `bliss-` prefix: `root`, `background`, `background-zone` (`--top`, `--mid`, `--bottom`), `grid`, `grid-line` (`--minor`, `--medium`, `--major`, `--sky`, `--earth`) and `content`. The attribute is emitted exactly as written, so `content--color` reaches the SVG `color` attribute. A target not drawn in the picture is silent; a prefix written below global scope is reported with `MISPLACED_LAYER_OPTION`, and one naming no target with `UNKNOWN_LAYER`.
- `root--` puts any attribute on the root element. Where a bare key and a prefixed key set the same attribute on the same element, the prefixed one wins and the other is reported with `MULTIPLE_ATTRIBUTE_VALUES` (`[role=img;root--role=none]||` writes `none`); a library option that a raw key overrode (`grid-sky-color` beside `grid-line--stroke`) is reported the same way.
- An attribute set where it cannot show is reported with `MISPLACED_CONTAINER_ATTRIBUTE`, naming the spelling that reaches it: `grid--stroke=red` sets the stroke on the grid's group, whose lines carry their own, so the report names `grid-line--stroke`. The value is still emitted where you put it.
- `viewBox`, `width` and `height` can be written directly and replace the values the library computes; a `viewBox` beside `margin`, `crop`, `min-width` or `center` reports `MULTIPLE_GEOMETRY_VALUES`.
- `xmlns` and `data-generator` are now protected: overriding either reports `RESERVED_ATTRIBUTE_NAME` and keeps the library's value. `xmlns` is refused at every scope, since a second namespace declaration gives a file browsers will not render; `data-generator` only on the root.
- A CSS `filter` on a word, a character, a part, the whole symbol or a layer (the grid, the background, an element background) is now drawn as a native SVG filter inside the picture, so it looks the same in Firefox, Chrome, Edge and Safari and in the PNG converters resvg and librsvg (#34): `[filter=drop-shadow(1px 1px 0 red)]B313`, `[grid;grid--filter=blur(1px)]||B313`. The ten CSS filter functions in absolute lengths are translated; any other value (`url()`, `var()`, `calc()`, `em`) is written as before. Saves keep the filter as written, and a filter on the root (`root--filter`) stays page CSS.
- `grid-shift` moves every grid line by a number of grid units on both axes (`[grid;grid-shift=0.1667]||B313`, `{ grid: true, gridShift: 1 / 6 }`), which can make 1-pixel grid lines crisp at small sizes. The symbol, the background and the picture's size stay where they are.

**Backgrounds and links on words, characters and parts (#29).**

- `background` now works on a word, a character and a part (`[background=yellow]|…`, `[background=yellow]B313`, `B313;[background=yellow]>B81`), so one picture can colour each word by its part of speech; below global scope it used to be dropped with `MISPLACED_GLOBAL_OPTION`. A character's background covers the full height of the writing area and its width plus one unit on every side, a word's covers its characters, and a part's its lines plus half a unit. Element backgrounds are drawn beneath all the lines, carry the class `bliss-element-background`, follow the element's own `transform`, `opacity`, `filter` and similar effects, and can be styled with `element-background--` keys at any scope.
- `background-area=ink` paints around the lines instead of a box, and `link-area=ink` makes a link answer on its lines; both are inherited.
- `background-padding` and `link-padding` set how far a background, or the area where a link answers, reaches past what it surrounds, in grid units.

**Options.**

- Transient options: `setTransientOptions()` and `removeTransientOptions()` on every element handle and on the builder, and a `transientOptions` bag at any level of object input, set values that reach the rendered SVG and never `toString()` or `toJSON()`: hit-test annotations, a selection highlight, a display width. A transient value wins over a normal option of the same key. A key the library reads while building the composition (`x`, `y`, kerning, `key`) is refused with `MISPLACED_TRANSIENT_OPTION`.
- The builder's own `setOptions()` and `removeOptions()` change global options after construction: `setOptions({ color: 'blue', grid: true })` on `[color=red]||B313` saves `[color=blue;grid]||B313`, and removing the last one drops the prefix.
- `toString({ omitOptions: true })` and `toJSON({ omitOptions: true })` save a composition without its options, every `[...]` bracket at every scope, while keeping its codes, parts, coordinates, kerning, word-level indicators and head marker: `[color=red;grid;x=5]||[stroke-width=0.8;x=2]|[color=blue;y=3]B291:1,2;[color=green]>C8:3,4/RK:2/[x=2]B313` comes back as `B291:1,2;C8:3,4/RK:2/B313`. The options a code brings by its definition stay.
- `clearOptions()` on an element and `clearAllOptions()` on the builder remove in place exactly what `omitOptions` leaves out of a save, and return what they were called on, so calls chain.
- Kerning can be written as an option: `[relative-kerning=-1]` and `[absolute-kerning=4]` now mean what `RK:-1` and `AK:4` mean (both were accepted and did nothing), and come back as the markers (#18).
- `MULTIPLE_OPTION_SPELLINGS` reports one option written twice in one bracket or options object under two spellings (`{ marginTop: 3, 'margin-top': 4 }`); the last one written applies. `define()` and `patchDefinition()` now return a `warnings` array, which carries it for a definition's `defaultOptions`.

**Letters.**

- More Latin letters can be spelled with the X notation (#26): Latin Extended-B, IPA Extensions and Latin Extended Additional join it, so `Xǎ`, `Xpiǎ`, `Xviệt` and `Xɛ` now render through the experimental text fallback, where they were refused as an invalid format. Other scripts are still refused.
- A `;` part can now be attached to a letter run that renders as one text element (`Xaλ;C8`) (#39).
- A definition name that starts with `X` but leaves the letter namespace, such as `XRAY1`, is now reachable from written input (#39).
- A custom character can now be built from Latin letters: `define()` accepts a `type: 'glyph'` whose code string holds letters, so B118 and B972 (the lowercase and uppercase Latin alphabet) can be copied under a name of your own, and a glyph of one letter (`{ type: 'glyph', codeString: 'Xa' }`) draws and spaces as that letter.

**New characters.**

- `B6443` (resource), `B6444` (state of being) and `B6579` (indirect object).

**Specified behavior for bad input.**

- Input that 1.0.0 drew wrongly, wrote into the file as `NaN`, `Infinity` or a dead attribute, or dropped in silence is now reported with a specific warning and handled predictably; the individual behaviors are listed under Bug Fixes. New warning codes: `INVALID_OPTION_VALUE`, `OUT_OF_RANGE_OPTION_VALUE`, `OUT_OF_RANGE_COMPUTED_GEOMETRY`, `MALFORMED_ELEMENT`, `MISPLACED_CONTAINER_ATTRIBUTE`, `MISPLACED_KERNING_OPTION`, `MISPLACED_LAYER_OPTION`, `MISPLACED_OPTION_SPELLING`, `MISPLACED_TRANSIENT_OPTION`, `MULTIPLE_ATTRIBUTE_VALUES`, `MULTIPLE_GEOMETRY_VALUES`, `MULTIPLE_KERNING_VALUES`, `MULTIPLE_OPTION_SPELLINGS`, `MULTIPLE_POSITION_VALUES`, `RESERVED_ATTRIBUTE_NAME`, `UNKNOWN_LAYER` and `UNSAFE_ATTRIBUTE_NAME`.

### Bug Fixes

**Options and attributes.**

- A name SVG or ARIA owns now works in either spelling, on every surface that reads a name (a bracket at any scope, the options argument, `setOptions()`, transient options, a composition object, a definition's `defaultOptions`): `[view-box=…]`, `[strokeDasharray=…]`, `{ ariaLabel: 'water' }` and `{ hrefLang: 'en' }` reach `viewBox`, `stroke-dasharray`, `aria-label` and `hreflang`, where several shipped a dead attribute. It comes back in the owner's spelling (`[view-box=0 0 8 8]||` serializes as `[viewBox=0 0 8 8]||`).
- Positioning and kerning options passed from JavaScript (`x`, `y`, `relativeKerning` and `absoluteKerning`, through the constructor, `setOptions()` and the adding and replacing methods) now take effect, matching the DSL byte for byte; they were accepted, saved and round-tripped while changing nothing on screen (#18).
- A value an option cannot write as text (an object, an array, `null`, `undefined`, a function, a symbol) is now refused with `INVALID_OPTION_VALUE` and not stored, instead of reaching the picture as `stroke="null"` or `[object Object]`; a value JavaScript cannot turn into text at all (`{ toString: 5 }`) no longer throws out of the constructor. A `null` or a list given as `x` is now refused instead of read as `0` or as text. Text that is wrong for its option (`{ crop: 'nope' }`) is kept, and reported again on load.
- A composition object holding a function or a symbol no longer throws `DataCloneError` out of the constructor; a Proxy (such as a Vue reactive object) is now read as the object it wraps, and a `BigInt` as its text.
- A kerning option written where kerning cannot apply (`[relative-kerning=3]>B291`, or at word or global scope, by any route) is now reported with `MISPLACED_KERNING_OPTION` and dropped, instead of emitting a dead `relative-kerning` attribute (#18).
- An option that configures the whole SVG (`margin`, `grid`, `crop` and the rest), set below global scope from JavaScript (a composition object, an element's `setOptions()`, the adding methods), is now reported when written and not saved; it was saved, and warned about only once reloaded.
- A key containing `--` written at word, character or part scope (`[grid--opacity=0.3]B291`) is now reported and dropped instead of emitted as a meaningless `grid--opacity` attribute, and `define()` refuses one in `defaultOptions`. The one prefix that works below global scope is `element-background--`.
- An attribute name the library refuses (an `on*` event handler, or a name outside letters, digits and dashes) is now reported with `UNSAFE_ATTRIBUTE_NAME` at every scope, where it was dropped in silence. Such a name is now read whole: `[xlink:href=…]` was split into the options `xlink` and `href`, and `[stroke width=2]||` set the picture's width.
- `xmlns` and `data-generator` are now refused in any casing (`[XMLNS=x]B291` shipped `XMLNS="x"`).
- An option key named after a built-in JavaScript property (`constructor`, `toString`) is now an ordinary attribute, where it was dropped in silence or emitted under a mangled name, and a character with such a name in a saved object no longer ships `width="NaN"`.
- `removeOptions()` now throws a `TypeError` naming the call for a key that is not a string, and changes nothing; it leaked an internal error part way through the keys.
- `removeOptions('x')` on a part now removes its position however it was written, a coordinate or a part bracket (`B291;C8:5,0` gives `B291;C8:,0`, and `B291;[x=5]>C8` gives `B291;C8`, where the position stayed), and `removeOptions('relative-kerning')` now clears kerning as `relativeKerning` does.
- An `href` written as a relative address (`page.html`, `./help`, `?q=1`) now builds a link; only `http:`, `https:`, `mailto:` and `tel:` addresses and those starting with `/` or `#` did. Every other scheme still builds no link.
- A color or title option written with no value (`[background]`, `[color]`, `[svg-title]`) now reports `INVALID_OPTION_VALUE` and keeps the value it would have had, instead of writing `true` into the picture (`fill="true"`); a bare `[key]` no longer names the element `true`.
- An element key is now always text: a number names the element by its text (`key: 5` is `'5'`), a value with no text form is refused with `INVALID_OPTION_VALUE`, and an empty `[key=]` no longer gives the element a new key after every change.

**Numbers and sizes.**

- Every option that takes a number is now checked: a non-number (`[crop-top=aut0]`, `[grid-stroke-width=abc]`, a bare `[char-space]`) is refused with `INVALID_OPTION_VALUE`, and a length nothing can draw (`[svg-height=-10]`, `[sdot-extra-width=-0.5]`) with `OUT_OF_RANGE_OPTION_VALUE`; the option falls back to what it would have been. These used to ship `NaN`, a negative size, or a value nobody wrote. A negative `margin` or `crop` is still honoured, and `crop` now reports a value it does not recognise (a bare `[crop]` cropped by one unit).
- A picture whose size is too large to write down (`[margin=1e308]||B291`) is now reported with `OUT_OF_RANGE_COMPUTED_GEOMETRY` and sized as if no sizing option had been written, instead of shipping `width="Infinity"`; a size the content itself overflows is reported too.
- A coordinate too long to be a number (`ZSA:` followed by 400 nines) no longer ships `width="Infinity"` and a save that cannot reload: the axis is refused with `MALFORMED_COORDINATES`. A position option that is not a number (`[x=abc]B291`) no longer puts `NaN` into the drawing (#18).
- A number now reads the same in every spelling: the kerning marker and coordinates take exponent notation (`RK:1e3`, `B291:1e-7`) and a coordinate a leading `+`, so a tiny value JavaScript writes with an exponent now reloads; hex, binary and octal text (`[x=0x10]`) is now reported instead of read as a number.
- A position written straight onto a composition object as text (`{ codeName: 'ZSA', x: '3' }`) is now read as a number; it was joined onto the parent offset, placing the shape at 30. A value that cannot be a coordinate reports `MALFORMED_COORDINATES`.

**Saving and reloading.**

- A position set as a field on a composition object (`{ parts: [...], x: 5 }`) now survives `toString()`; it was left out, so a reload moved the symbol back.
- `toString()` now writes a `false` set from JavaScript (`[color=false]B291`), so the reload draws what was drawn; the switches (`grid`, `center`, `errorPlaceholder`) still read `false` as off.
- The default saves now keep where an indicator was drawn: a custom glyph with its own anchor (`ANC;B81` saves `B291;B81:,2`, where the old save reloaded `B81` 2 units off), a custom compound indicator spelled out into its parts (`B291;PAIR` saves `B291;B97;B99:4.5,0`), and a word whose `;;` indicators would reload on another character, whose head is now marked (`B937^/B291;;B81`).
- The default saves now write a `;;` indicator named by a custom definition in built-in codes (`B291;;PLURAL` saves `B291;;B99`), as they already did a `;` part, and a custom indicator drawn from one plain shape where it was drawn (`B291;MYIND` saves `B291;C2:3`), so an app without your definitions draws them where you did. `preserve` keeps your names.
- `toJSON()` now breaks a custom code used as a part down into built-in codes, as documented, with the definition's options and position, and an indicator's parts keep `isIndicator` and `width`. A custom compound indicator used as a part arrives as separate indicators; save with `{ preserve: true }` to keep it one unit.
- `toString({ preserve: true })` no longer undoes a change you made to a custom character: an edited part is written beside its name (`[color=red]>MYGLYPH`, `MYGLYPH;C4`), and a name whose definition would bring back an option you removed is no longer written.
- `preserve` saves now keep your custom name where they lost it: a definition that positions a part at the origin or on one axis, your own short name for a character that positions its parts, a glyph built from a custom shape, an alias through a name holding a character such as `-`, and an alias of a code written with a position. An indicator added to a custom character that positions its own parts keeps the name, and one placed at the origin stays there (`MYGLYPH;B86:0,0`).
- A code you define after building a composition now keeps the position you placed it at (a definition setting one axis dropped it in silence) and an option written on its part; both orders of `define()` and building now save the same string.
- Several saves now reload as drawn: two words with no space between them (left by the raw element methods or a composition object) save as one word, as `mergeWithNext()` leaves them; a run of spaces from `merge()` saves as drawn (`B291/TSP//B4`); a word space before a character that pulls it in, as a punctuation mark does, is written out (`B291/QSP/B300`); an empty character holding kerning is written with its kerning (`B313/AK:10/[]`); and a head marker on an empty character holding only kerning is kept.
- Rebuilding from `toJSON()` no longer widens the spacing around external letters (`[color=red]>Xm/XV/XA`, `Xhαllo`): the JSON now records what such a glyph is, and the rebuilt SVG matches byte for byte (#38). A rejected letter code (`XM.M`) no longer turns into text on a rebuild with its warning gone (#38).
- A composition rebuilt from `toJSON()` now knows that a punctuation mark pulls in the word space before it, and a custom glyph of one character read back from a `preserve` JSON keeps that character's spacing (`NINE/B9`).
- A custom character whose definition styles what it draws no longer publishes that styling as its `codeName` (`"[color=red]>B291"`).

**Definitions and aliases.**

- A definition whose code string starts with an option bracket (`'[color=red]B291'`) or a bare `>` now works wherever it is used; as a part it drew nothing and warned `UNKNOWN_CODE`. The bracket now means what the same options in `defaultOptions` mean.
- A composition object that names a definition now gets the definition's options, as the name does in a string (it drew black where the string drew red).
- An alias of another definition now keeps both definitions' options, and a custom glyph or shape built from a shape with its own `getPath` now draws with that shape's options wherever it is used.
- A custom glyph or shape whose code string marks its head (`B291^`) now works as a part, and a custom code whose code string is a letter drawn as text (`{ codeString: 'Xλ' }`) now draws; both reported `UNKNOWN_CODE`.
- `define()` and `patchDefinition()` now refuse a code string no use could draw (`C8:1.2.3`, `C8;RK:3`, a glyph of only a kerning marker), which registered and then drew nothing, and a patch giving a shape both a `getPath` and a `codeString`, which drew with one and saved as the other.
- A definition's code string is now read as an input string is: whitespace outside brackets is dropped, so `' B313'` no longer registers and then draws nothing.
- `define()` and `patchDefinition()` now refuse a `type: 'glyph'` or `type: 'shape'` whose code string is a run of several letters (`XOH`, `Xab;C8`), which registered as one character and drew as several (#39), and a `type: 'shape'` holding any letter, which drew nothing.
- An alias of an alias of several codes is now refused as a part, as those codes are; it slipped past and drew.
- A misplaced indicator or space written through a name is now reported by that name, and an indicator misplaced through a name that gives it a position is now dropped and reported, as it is when written out.
- A character holding a custom code whose code string has a part that cannot be read is now dropped whole, as the same code string written in place is (`toString()` wrote a character the builder never drew), and a custom code read back from a `preserve` JSON now draws and warns as its string does.
- Alias saves now reload as drawn: a part named by an alias of a word keeps its `error` and `errorCode` in `toJSON({ preserve: true })`, an alias of a typed shape written alone reloads from its `preserve` JSON in its own colour, an alias inserted at the start of a character keeps the parts after it in a `preserve` save, and a `toJSON({ deep: true, preserve: true })` save of an alias of one code used as a part reloads as drawn (it could report `UNKNOWN_CODE`).

**Letters (#37, #38, #39).**

- A multi-letter run (`XOH`, shorthand for `XO/XH`) now expands inside a `define()` code string and in a word carrying `;;`, where it failed with `WORD_AS_PART`, and a `;` before a word break in a definition (`Xab;//B291`) no longer stops it (#37).
- A letter run holding a character the X notation does not accept is now read as one unit: `Xhello.world` is reported as written and draws nothing, where it drew `hell` and reported `Xo.world` (#39).
- A letter with no built-in outline at the end of a sequence written letter by letter now takes what follows it, as the run does: `Xa/Xλ;;B81`, `Xa/Xλ^`, `Xa/Xλ:5` (#39).
- A letter drawn as text can now be a part (`B291;Xλ`, `B291;Xaλ`), and is spaced as an external letter when its option is written in part scope (`[color=red]>Xhαllo`) (#38).
- A warning about letters drawn as text now quotes them as you wrote them (`Xhαllo:abc`) instead of an internal code.

**DSL syntax.**

- A part separator written without its bracket now reads as plain content, like the global and word separators: `>B291` draws `B291` and `S8;>C8` both parts, where they drew nothing, and `>Xhello` draws its letters (#40).
- Two option brackets at the same scope now warn `MULTIPLE_OPTION_BRACKETS` and keep the first at character and part scope too, as documented, instead of destroying the symbol (`[color=red][fill=green]B291`), also in front of a defined word; three or more brackets before `>` no longer lose one in silence (#40).
- A `|` or `||` written later in a word is no longer read in silence: a word or global option bracket out of place is reported (`MISPLACED_GROUP_OPTION`, `MISPLACED_GLOBAL_OPTION`) and left out, and any other later `|` drops the word with `MALFORMED_GROUP_OPTIONS`, where `[color=red]|B313/B291|B431` lost `B431` without a word.
- Kerning written on or before a space (`B313/AK:10//B291`) and a kerning marker with no character after it (`B313/AK:10`) are now reported (`MISPLACED_SPACE_DECORATION`, `MISPLACED_KERNING_OPTION`) instead of vanishing, and kerning in a custom code no longer moves past a space onto the next word.
- A space that drops a position written at the origin (`QSP:0,0`) now reports it, a position on a space written as a part option is reported once, not twice, and a saved composition no longer keeps the dropped position.
- A word-level indicator that cannot attach (`B291;B86;C8:0,0;;B97`) is now reported with `MISPLACED_WORD_INDICATOR` instead of vanishing.

**Spacing, indicators and layout.**

- A letter, a digit or a punctuation mark now keeps its spacing when it carries an indicator, a coordinate or a part-scope option: `Xa;B86/Xb` was spaced as Bliss characters are (2 units instead of 0.8), `B9;B86/B10` lost the digit kerning (45 wide, now 39), and `B291//[color=red]>B4` lost the narrower word space (105 wide, now 81). A name defined for such a character is spaced the same way.
- A second base part added through the API now makes a letter or a digit another character, as writing it does, and the saves of `flattenIndicators`, `addPart()` and `applyIndicators()` no longer change the spacing of a letter, a digit or a punctuation mark carrying an indicator.
- An indicator is no longer dropped when the part after it sits at a position written at the origin: `B86;C8:0,0` now keeps its indicator, as `B86;C8:3,0` did.
- An indicator added to a custom glyph now lands in the same place by every route (`;`, `;;`, `applyIndicators()`, `addPart()`), placed by the glyph's own anchor, and a glyph that draws one code takes that code's anchor unless it sets its own (`MY138;B81` drew `B81` across the top of B138).
- An indicator added to `REFSQUARE`, `ANCHORRING` or any code whose definition brings options no longer takes on that look (`REFSQUARE;;B99` drew `B99` dotted).
- A custom compound indicator whose parts start away from its own origin no longer adds blank space before its character or is cut off at the left edge.
- A character carrying an indicator of its own now heads its word even when a predefined word with a marked head follows it, a composition object picks a word's head by the same rule as its string, `merge()` keeps a word's `;;` indicators on a custom glyph that heads it, and an indicator written through a name keeps its place and colour when the word's `;;` indicator is the same one.
- `splitAt()` no longer moves a word's `;;` indicators onto a character of the first word: they stay only while the character they are drawn on stays there, else they are dropped with `DROPPED_WORD_INDICATOR`. A space put inside a word splits it the same way.
- A word added through the API (`addGroup()`, `insertGroup()`, `merge()`, `splitAt()`) now gets the word space `//` would give it, the quarter space before a full stop (`B291//B4`, where it gave `B291/TSP/B4`).
- `insertGroup()` now counts a negative index from the end, as documented: `insertGroup(-1, 'B313')` inserts before the last word, where it inserted at the start.
- A space no longer stops an automatic crop (#41): `crop=auto`, `auto-vertical` and `compact`, and the per-side `auto` crops, now reach past a space to the ink, and `elements.bounds` ends at the ink.
- B118 and B972, the Latin alphabet characters, now draw exactly like their letters written out; they differed by up to 0.004 units.

**Composition objects.**

- A composition object of the wrong shape no longer throws or reads as something else: a missing `groups` or `glyphs` list is read as empty in silence (it warned `DUPLICATE_KEY` on keys never written), an object of another level is read as an empty one, and something that is not an element where one belongs (`groups: [5]`) is left out and reported with `MALFORMED_ELEMENT`, naming where it sits. A `Date` or a `Map` given as the composition now throws the constructor's documented error.
- One object used in two places of a composition object is now two elements, so an edit through one place no longer lands in both, and an element inside itself is left out with `MALFORMED_ELEMENT` instead of overflowing the stack.
- A composition object built with `null` as the options argument now exports the same `toJSON()` as one built without it.
- A handle to a part inside a part (`glyph(0).part(0).part(0)`) now reads and survives changes like any part handle, and `getElementByKey()` now finds such a part, and a part by a key set on it (`B291;[key=k]>B81`).

**TypeScript.**

- `key` is now one of the typed options.
- A saved composition's option values are now typed to allow numbers (`{ options: { marginTop: 1 } }`), and `x` and `y` are declared at every scope a position can sit at.

### Improvements

- A linked word, character or part is now clickable across its whole area in every browser: each link holds a transparent rectangle beneath its lines instead of relying on `pointer-events="bounding-box"`, which Firefox ignored. Where links overlap, the innermost wins.
- Grid lines are now drawn with butt ends, each segment lengthened by half its stroke width: the grid looks the same and draws crisp in Chrome, where the square ends drew a shade light. Dashes on a grid line are now exactly as long as written; add `grid-line--stroke-linecap=square` for the old ends.
- A warning about a dropped position now quotes the position as you wrote it (`QSP:3`, where it said `QSP:3,0`).
- A token that cannot be read is now reported with the text you wrote as its `source` (`B291[data-foo=bar]`, where it was `Invalid format: B291[data-foo=bar]`), so an editor can find it; code that matched the `Invalid format:` prefix in `source` sees the change.
- A key repeated in one bracket (`[margin=1;margin=2]B291`) now reports each occurrence, where only the last one was reported.

### Documentation

- The handbook and reference now cover everything above: attribute targeting, the root and content groups, filters and `grid-shift` (SVG Pass-Through Attributes, Grid Customization); element backgrounds and links (Backgrounds & Accessibility); positions and kerning as options (Positioning, Spacing); transient options, the builder's `setOptions()`, `omitOptions` and `clearOptions()` (Programmatic Options, Programmatic Mutation, API Documentation); a definition's options and code-string brackets (Custom Codes); and the 17 new warning codes (Warning Codes).

### Chores

- CI now keeps the visual-regression diff images when the e2e suite fails, and the mutation-test configuration fits the current test suite.

## 1.0.0 (2026-07-23)

The first stable release. Everything below is the change since `1.0.0-rc.4`; "Breaking" is relative to that release.

### Breaking Changes

**Mutation API (#33).**

- `addGroup`, `insertGroup`, `replaceGroup`, `addElement`, `insertElement`, and `replaceElement` now take exactly one word group and throw on multi-group input (previously everything after the first group was silently dropped); the error reports the parsed group count. An omitted, empty, or whitespace-only code creates an empty word group, and `replaceGroup`/`replaceElement` with an empty code clears the target slot; out-of-range replace indices remain a silent no-op.
- `addGlyph`, `insertGlyph`, `replaceGlyph`, and `replace` (on a character) now take exactly one character: multi-character codes, defined word names, word options, and `;;` indicator lists throw instead of being silently trimmed or expanded. An omitted or empty code creates (or swaps in) an empty character slot that round-trips; `addGlyph` on an empty document now validates the code and applies options to the character, matching its non-empty behavior. Migration: use `addGroup` for word content plus `mergeWithNext()`, and `applyIndicators()` for indicator lists.
- `addPart`, `insertPart`, `replacePart`, and `replace` (on a part) now take exactly one part; a multi-part code or an empty code throws (an empty part has no shape to reference).
- Non-string code arguments to all of the above throw `TypeError: <method>() requires a DSL code string` instead of leaking an internal error, and the character and part methods reject options and artifacts from a higher scope (document options, a head marker `^`, a `;;` list), naming the part-level alternative.
- Every method that takes an options argument now rejects a non-object one with `TypeError: <method>() options must be an object` (the constructor, every mutation method, and `setOptions`).
- On element snapshots, `isSpaceGroup` for a character-less word group now reads `false` (an empty word group is a real, addressable group, not a space separator).

**Definitions.**

- Built-in definitions can no longer be overwritten: `define({ B291: {...} }, { overwrite: true })` now reports an error instead of silently replacing the built-in, matching `patchDefinition()` and `removeDefinition()`.
- The letter codes B29-B80 are now protected like every other built-in (overwrite, patch, and remove all refuse them; `getDefinition('B29').isBuiltIn` is `true`). Their behavior as input is unchanged.
- `define()` and `patchDefinition()` reject whitespace-only code keys and codeStrings.
- `define()` rejects names that could never work or would change DSL syntax: names containing invisible characters (zero-width space, BOM, direction marks, control characters, no-break space), names of the form `X` followed by letters (the external-character namespace), and the syntax markers `RK`, `AK`, and `SP`.
- `isIndicator: true` is now valid only on a `type: 'glyph'` definition; on a bare alias, shape, or external glyph it is an error (previously silently dropped). To alias an existing indicator, drop the flag.
- The "a glyph cannot bake in an indicator" rule now holds in every definition order and on every route, including forward-reference completion and `patchDefinition()` in both directions.
- Definition codeStrings now store bare-alias references as written and resolve them at parse time (late binding) rather than inlining the expansion at registration: redefining a referenced code flows through to every definition that uses it, a referenced alias's `defaultOptions` now apply, `preserve` keeps component alias names, and `getDefinition()` returns the codeString as written. One boundary moves: a chain of 50 or more single-code renames now hits the parser's recursion cap and throws.
- A custom single-code alias to an indicator now behaves as that indicator everywhere one can appear (`;;`, `applyIndicators()`, `addPart()`, and the `;`-part slot, where the render changes to real indicator placement). An alias to a multi-code composition still warns. (#35)

**DSL and parsing.**

- Within one character, indicators must come last; an indicator written before base content is dropped from render and serialization with the new `MISPLACED_INDICATOR_PART` warning (previously it rendered as silent overlapping ink), and the rest of the character renders. Non-origin hand-placed content and unknown codes after an indicator are exempt.
- Malformed syntax is now dropped instead of partly kept, so it never leaves a misleading trace: a malformed part token (`!`, a bad coordinate suffix) fails the whole character, and a malformed word indicator (a doubled `;;`, or `;;` on a multi-word alias) fails the whole word; neither persists an error node in `toJSON()`. A well-formed but unknown code (`ZZ9`) is still kept and warned so it renders once defined.
- A space (`TSP`, `QSP`, or the default `SP`) can no longer be composed into a character as a `;`-part: it is dropped with the new `MISPLACED_SPACE` warning (along with any coordinate or option on it) and the rest of the character renders. A space beside only unknown codes is kept.
- The `MISPLACED_SPACE_PART` warning code is renamed `MISPLACED_SPACE` (a space is a word separator, never a part); a consumer switching on the code string must update it.
- An option bracket without `>` in a `;`-part slot is now treated as a misplaced character option: dropped with `MISPLACED_CHARACTER_OPTION`, and the part renders (previously it either failed the whole character or silently relocated the option to character scope).
- A coordinate (`:x,y`) or an option on a space is now dropped and the space keeps its identity (`QSP:1,2` renders as a plain quarter-space), warning `MISPLACED_SPACE_DECORATION`. An explicit zero coordinate is dropped without a warning.
- A standalone `ZSA` (Zero-Sized Anchor) is now treated as content, not a space, on every surface: it is counted and navigated as a real group and `toString()` serializes it as its own code. A `ZSA` composed inside a character is unchanged.
- A bare kerning marker (`RK` or `AK` with no `:value`) now applies no kerning and is omitted from `toString()`, instead of behaving as an explicit zero (a bare `AK` no longer collapses the inter-character gap). The explicit `AK:0` and `RK:0` spellings are unchanged.

**TypeScript.**

- The `BlissJSON` group type no longer declares `errorCode`/`error`/`errorSource`; the runtime stopped emitting them, so code reading those fields no longer compiles. Hand-authored objects still carrying them ingest as before.
- `ElementHandle.indicatorLevel` is now typed `'character' | null` (a handle can never return `'word'`). `'word'` remains on `ElementSnapshot.indicatorLevel`, where it really occurs.
- The `define()` definition types now enforce that `isIndicator` is glyph-only, matching the runtime: `GlyphDefinition.type` is required and the shape, external-glyph, and bare-alias interfaces forbid `isIndicator`.

**Platform.**

- The minimum supported Node.js version is now 22 (`engines.node` moves from `>=18` to `>=22`, as Node 18 and 20 are end of life). The code is unchanged and still runs on older Node if you ignore the engine warning.

### Bug Fixes

- Multiple indicators composed on one character now render centered as a group over the base character's anchor point, instead of leaning up to ~1 unit off-center when the indicators had different widths. Indicators with an edge annotation dot (B84, B85) keep their established behavior. Applies identically to `;`, `;;`, and `applyIndicators()`.
- Empty word groups now appear in `.groups`, matching what `group(i)` and `stats.groupCount` already counted. (#33)
- Trailing empty word groups no longer widen the rendered SVG or shift centering off content, and a document of only empty groups renders at empty-document dimensions. (#33)
- An empty character slot at the end of a word no longer inflates the word's bounding box. (#33)
- `toString()` now serializes every run of spaces and empty word groups width-faithfully, so the serialized form always reparses to the rendered width (adjacent spaces no longer over-count, explicit space codes are preserved, and a trailing empty word no longer leaves a dangling slash). (#33)
- `addPart` on a word with no characters now adds the part wrapped in a new character; on an empty document it creates the word around the part and applies options to the part. (#33)
- A word carrying an indicator that reaches left of its character (for example `B12;B98`) now renders at the same width whether or not empty word groups sit before it. (#33)
- Every index-taking method now treats a fractional or `NaN` index the same way as any other out-of-range index, instead of silently destroying content or returning an unusable handle: navigation returns `null`, insert and remove leave content untouched, and `splitAt()` throws its documented error before any mutation. Valid indices, including negative ones, are unchanged.
- The group-level mutation methods now surface an accepted code's parse-time warning (a misplaced global option, a misplaced head marker, a non-indicator used as a word indicator), matching the constructor and character-level methods. (#33)
- Passing an empty options object (`{}`) to a mutation method no longer stamps a bare `options: {}` onto the node in `toJSON()`.
- Cropping past the available box no longer produces an invalid SVG with negative width or height; the viewBox and SVG dimensions floor at 0.
- Background zones no longer emit an invalid negative-height `<rect>` when a vertical crop crosses a zone boundary; zone heights floor at 0.
- A character- or part-level option bracket no longer hides an X-code letter from text rendering: `[color=green]Xλ` renders the green fallback letter with zero warnings (previously it reported `UNKNOWN_CODE` and rendered nothing). A bracketed run of outlined letters behaves like its written expansion.
- The "Invalid format" warning for an unparseable part now shows the option bracket as written instead of leaking an internal placeholder token.
- `define()` no longer rejects kerning markers inside a word codeString, and `patchDefinition()` now enforces the same word-internal-coordinate rule that `define()` does. (#36)
- An `SP` segment in a definition codeString now normalizes to a plain word break when stored (previously it failed at every use with `UNKNOWN_CODE`).
- `define()` now classifies skipped-versus-error by the actual failure rather than by matching error text, so a definition whose name contains "already exists" reports its real validation error.
- Link attributes set at the global level (`[href=...]||`) no longer duplicate onto the content wrapper as an invalid `<g ... href="...">`; they appear only on the wrapping `<a>`. A global bare `target` is dropped, and a global `href` that fails the safety allowlist no longer resurfaces as a plain `<g>` attribute.
- The definition registry no longer mistakes JavaScript's inherited object-property names (`toString`, `constructor`, `__proto__`, ...) for Bliss codes: `isDefined`/`getDefinition`/`removeDefinition` answer as for any unknown code, and `patchDefinition()` on such a name throws its documented error instead of writing onto `Object.prototype`.
- A hand-authored object-input glyph node with no parts and no code (`{ glyphs: [{}] }`) is now treated as the empty glyph it is: it renders nothing, reserves no width, and produces no warning. A node that names a code is unaffected.
- `toString({ preserve: true })` and `toJSON({ preserve: true })` now keep a custom name wherever it stands for a single glyph, indicator, or shape, or a bare alias renaming one existing code, across every input surface and through mutations and `merge()`; a multi-code `codeString` is shorthand and still serializes expanded. This completes the preserve rule for bare aliases, typed shapes and glyphs, and alias chains (the outermost name wins), and it composes with `flattenIndicators`.
- A custom glyph whose definition bakes a negative coordinate onto its single referenced code now renders faithfully (the reported size matches the ink and the round trip is stable).
- A custom multi-part compound indicator applied as a word-level (`;;`) indicator now keeps its whole anatomy, so `;` and `;;` agree for the same definition.
- A word-level (`;;`) indicator naming a custom alias to a non-indicator primitive now places it at the same offset as the `;`-part form.
- A composed definition alias misused as a character part now serializes by its written name instead of decomposing, so round-tripping the warned string reproduces the same result.
- Default `toJSON()` output no longer carries two internal definition-derived glyph flags (`shrinksPrecedingWordSpace` on punctuation, and a glyph-level `isIndicator` on a standalone custom compound); `{ deep: true }` output keeps them.
- TypeScript: the `BlissJSON` part type now declares the `error` and `errorCode` fields the runtime emits for a `COMPOSITE_AS_PART`/`WORD_AS_PART` part, so consumers can read them without casting.
- TypeScript: `applyIndicators(null)` now type-checks (the parameter is `string | null`, matching the runtime).
- TypeScript: top-level `BlissJSON.options` is now `Record<string, string | boolean>`, admitting the boolean value a bare option key emits.

### Improvements

- Every `{...}` text block now warns `UNSUPPORTED_TEXT_BLOCKS`, not just multiple blocks, so a single block no longer disappears with no trace. The block count is taken after option parsing, which fixes false alarms on a literal `{` inside a quoted option value and on a block whose text contains braces.
- TypeScript: the `WarningCode` type is now an open union (the known codes plus `string`), so a warning code added in a future minor release cannot break an exhaustive `switch`; known codes keep autocomplete.

### Documentation

- Error and warning handling is documented as a workflow: the calls that throw carry `@throws` in the TypeScript definitions and are listed in a new Error Handling section, `define()` is documented as non-throwing, and `builder.warnings` is noted as populated at construction but not exhaustive across mutation paths.
- The mutation-method contract is documented end to end: every add/insert/replace method lists its throws and empty-code behavior, and the handbook teaches the one-unit rule and empty-slot workflows.
- The Latin & Cyrillic handbook page is written: how X-codes spell Latin and Cyrillic text, the embedded-outline character set, the letters-only boundary, the experimental text fallback, and the X-code compatibility guarantee (X-code input keeps its meaning permanently; the serialized form and rendering mechanism are current behavior that may evolve, always release-noted).
- Serializing custom indicators and shapes is documented as a decision: when to use default output versus `{ preserve: true }`, the full per-shape behavior table, the `;;` asymmetry, and the two remedies.
- Three serialization examples now show what the library really emits (the `toJSON()` compound-character example, the Custom Codes part path, and a working `preserve` example on a typed glyph).

### Chores

- Added a GitHub Actions CI workflow: typecheck, build, and the lib, dist, property, and visual-regression test suites on a Node 22/24 matrix.
- Added a fast-check property-based test layer (serialization round-trip and input-robustness properties) to the release gates.

## 1.0.0-rc.4 (2026-07-03)

### Breaking Changes

- Strict indicator separation: `;` is now strictly character-level part composition (literal; the old replace/strip logic is gone); word-level indicators use the reversible `;;` / `;;!` layer. The char-level shortcuts are dropped; migrate `word;B81` → `word;;B81`, and `X;!B81` → `X;;!B81` or `applyIndicators('B81', { stripSemantic: true })` (there is no char-level `;!`, which also settles its silent-drop bug, #25).
- Word-level indicators (`;;`) are now a persisted, reversible overlay resolved onto the head at render: default `toString()`/`toJSON()` keep `;;` (e.g. `B313/B1103;;B81` round-trips unchanged instead of decomposing), `toJSON()` carries `groups[].wordIndicators`, and removing the overlay restores the original characters. Pass `{ flattenIndicators: true }` to collapse `;;` onto the head as `;` (the old output shape); it composes independently with `{ preserve }`.
- Head-marker (`^`) contract rework: `^` belongs to characters only (on a multi-character code it is dropped with `MISPLACED_HEAD_MARKER`), markers resolve per word-string, and `toString()` now always re-emits a stored designation (matching `toJSON()`'s `isHeadGlyph`), so an explicit `^` survives a string round-trip verbatim even when the automatic head pick would land on the same glyph (words written without `^` stay unmarked).
- Removed group-level `applyHeadIndicators()` / `clearHeadIndicators()`: use `applyIndicators(code, { flatten: true })` / `clearIndicators({ flatten: true })` for the old baking behavior, or drop `flatten` for the reversible overlay (usually the better fit).
- A `;;` word-indicator code must now BE an indicator: a recognized base warns `NON_INDICATOR_AS_WORD_INDICATOR` and is dropped (a mixed list drops only the offender), an unknown code warns `UNKNOWN_CODE`, and a code carrying a character separator (a top-level `/`, e.g. `B81:1,2/B431`) warns `MALFORMED_WORD_INDICATOR` and is rejected (the `;;` store only holds codes the DSL grammar could author); the word still renders and the dropped code never re-serializes. Applies identically to the DSL, `group.applyIndicators()`, and object input.
- Glyph-level `applyIndicators()` now validates its codes the same way: each recognized non-indicator warns a new `NON_INDICATOR_AS_CHARACTER_INDICATOR`, each unknown code `UNKNOWN_CODE`, a code spanning multiple characters (a top-level `/`) `MISPLACED_CHARACTER_INDICATOR`, and a code whose decoration fails to parse (`B81:bad`) is rejected with its parse warning instead of injecting an unrenderable part. A mixed list applies its valid subset; a call whose codes are ALL invalid is refused: the glyph keeps its existing indicators, so a failed apply can no longer clear or strip anything as a side effect. Replaces the old single "applied no indicator" no-op warning.
- `clearIndicators()` is now the pure undo and no longer takes `stripSemantic`: on a glyph it removes the grammatical indicators and always preserves the semantic; on a group it removes the `;;` overlay, un-hiding the head's own character-level indicators (it previously installed a `;;!` strip overlay with `{ stripSemantic: true }`, the opposite of a clear). `applyIndicators()` now accepts an empty code (omitted / `''` / whitespace) as the deliberate empty indicator set instead of throwing: on a group it stores the render-significant empty `;;` overlay (with `{ stripSemantic: true }`, `;;!`), on a glyph it equals `clearIndicators()`; a non-string code now throws a `TypeError` (previously silently ignored or coerced). Migrate `clearIndicators({ stripSemantic: true })` → `applyIndicators('', { stripSemantic: true })`.
- Definition validation is now strict and consistent across `define()` and `patchDefinition()`: a glyph or shape must be a single character (no `/` in its codeString), no definition of any kind may contain `;;` (word indicators are use-site only), a glyph cannot bake in an indicator (flag compound indicators with `isIndicator: true`), and a composed unflagged alias cannot be used as a `;`-part (`COMPOSITE_AS_PART`, the character fails to render). A rejected patch changes nothing.
- `defaultOptions` in definitions must now use well-formed option key names and may no longer include global-only (canvas) keys like `margin` or `grid`; they would be inert on a definition.
- Options are now scope-checked, matching the indicator model: a part option (`[opts]>`) or character option on a code that expands to a whole word warns `MISPLACED_PART_OPTION` / `MISPLACED_CHARACTER_OPTION`, a word option (`[opts]|`) on a code expanding to multiple words warns `MISPLACED_GROUP_OPTION`; the option is dropped, the content still renders, and dropped options never re-serialize. (Previously these silently styled the wrong thing or fail-rendered the word.)
- Warning-code vocabulary consolidated: all codes live in a frozen `WARNING_CODES` registry, `Warning.code` is typed as the `WarningCode` union, and two codes are renamed under a consistent scheme: `INVALID_GLOBAL_OPTIONS`→`MALFORMED_GLOBAL_OPTIONS`, `INVALID_GROUP_OPTIONS`→`MALFORMED_GROUP_OPTIONS`.
- Dot sizing is now per-family: `SDOT`'s default extra width changed `0 → 0.1665` (a real small dot), and `dot-extra-width` is now a bulk knob that preserves the DOT:SDOT half-relationship instead of scaling every dot uniformly.

### Features

- Specified behavior for bad input: malformed or misplaced syntax no longer yields undefined output. Every failure warns with a specific code and degrades predictably (the offending piece is dropped, the smallest containing unit fails to render, or the call is rejected up front), and dropped content never re-serializes. The individual behaviors are listed under Improvements.
- `applyIndicators()` / `clearIndicators()` are polymorphic by handle level: on a group handle they manage the reversible word-level `;;` overlay, on a glyph handle they keep managing the baked character-level parts. On apply, `{ stripSemantic: true }` == `;;!` and `{ flatten: true }` bakes onto the head; clear takes only `{ flatten }` (it is the pure undo).
- The `;;` overlay survives structural mutation: `splitAt()` keeps it on the left word, glyph add/remove/replace re-resolve it onto the current head, `mergeWithNext()` keeps the first word's overlay and drops the absorbed word's with a `DROPPED_WORD_INDICATOR` warning, and part handles resolve geometry and `key` by identity when the overlay reorders the head's parts (`getElementByKey()` round-trips a reordered indicator).
- Indicator introspection: `indicatorLevel` (`'word'` | `'character'`) and `indicatorKind` (`'semantic'` | `'grammatical'`) on part snapshots and handles, `null` for non-indicators.
- New dot-size options: `sdot-extra-width` (SDOT-only relative override) and absolute `dot-width` / `sdot-width` (rendered diameter, clamped 0-1.5; absolute beats relative). They cascade at every scope like `color`.

### Bug Fixes

- Kerning values accept the same decimal grammar as coordinates: `RK:.5`, `RK:-.5`, `RK:5.` (and `AK:`) now parse instead of falling through as malformed codes (#24).
- Option collisions no longer emit duplicate SVG attributes (invalid SVG): a global `class` merges with the structural `bliss-content` class, and `color`+`stroke` collapse to a single `stroke` with the explicit attribute winning (#28).
- `replacePart()` refreshes glyph identity like `addPart` already did, so `toString()` reflects the replaced part instead of the stale original code (#30).
- Serializer fidelity for modified custom glyphs: an applied indicator on a built-in-identity custom glyph re-emits (`B291;B81`, not bare `B291`); `toString({ preserve: true })` decomposes when a part carries a baked offset, per-instance indicator coordinate, or part option instead of dropping it; an unmodified baseless (all-indicator) custom glyph exports its bare name; `detach()` of the last part no longer re-emits a phantom code.
- A relocated base's offset and part-level option survive `clearIndicators()` and re-emit from `toString()` (`[color=red]>B291:2,3`), so the serialized form re-renders identically.
- Part options survive custom-glyph decomposition: `[color=blue]>MYGLYPH` re-emits the option on the decomposed code, for a multi-base glyph before EACH part (`[color=blue]>B291;[color=blue]>C8`; same computed styling for inheritable attributes, and definition-baked part options win on conflicts at the SVG-attribute level), and a styled word-level indicator (`;;[color=red]>B81`) keeps its option through parse and round-trip.
- Baked definition coordinates are real displacements: a positioned custom glyph adds its definition's base offset on both axes (single-part, multi-part with a shared offset, either sign, nested definitions accumulating once), so render and `toString()` finally agree; indicators center over the glyph's true ink span (offset glyphs, negative offsets, `;` and `;;` forms alike).
- Coordinate forms that omit an axis (`:,2`, `:2`) behave like their explicit-zero spelling everywhere, including definition lookup and the placement gates.
- A fused multi-part character now heads its word (exclusion codes are skipped only when standing alone), so word-level indicators land on the correct glyph.
- Custom code names containing `X` followed by letters (`EXTRA`, `MAXVAL`) resolve correctly, and a nested multi-word definition with an internal `^` keeps its word break and head crown.
- Option values containing DSL-significant characters (`;`, `[`, `]`, `|`, quotes, edge whitespace) round-trip as data: `toString()` emits them quoted with `\"` escapes, closing both silent value corruption and the case where an unquoted value re-parsed as extra option keys with canvas-changing effects. (Known limit: a backslash directly adjacent to a quote still does not round-trip.)
- The published type declarations no longer trip a consumer's `tsc`: the `BlissOptions` index signature includes `boolean`.
- Mutation-state fidelity on emptied words and glyphs: a group-level indicator clear/apply still works after every glyph was detached (a stale `;;` overlay no longer survives invisibly and resurrects on the next `addGlyph`), and a head designation is deleted with its emptied glyph so `toString()` and `toJSON()` agree.
- An emptied character no longer occupies a spacing slot in the rendered symbol: a glyph with no parts (emptied via `detach()`/`removePart`, or written as a DSL options-only token like `B313/[color=red]`) now contributes zero width and zero advance, spacing and kerning pair across it, and a word-level `;;` indicator resolves onto a glyph with content, closing the broken render round-trip every detach-emptied composition previously had.

### Improvements

- Canvas-wide options (`margin`/`crop`/`grid-*`/`background*`/`center`/`min-width`/spacing/`svg-*`/`error-placeholder`) used at word, character, or part scope now warn `MISPLACED_GLOBAL_OPTION` instead of being silently inert (render unchanged); they take effect only at global `[opts]||`. The key set is exported as `GLOBAL_ONLY_OPTION_KEYS`.
- Multiple `{...}` text blocks in one input emit an `UNSUPPORTED_TEXT_BLOCKS` warning (behavior was already undefined; now visible).
- A second option bracket at the same scope warns `MULTIPLE_OPTION_BRACKETS` and keeps the first bracket, instead of being dropped silently; combine options in one bracket (`[grid;grid-color=red]||`).
- Malformed word indicators fail loudly instead of producing undefined output: a non-trailing or repeated `;;` fails the whole word with one `MALFORMED_WORD_INDICATOR` (round-trips, and the failed word is terminal: every content mutation on it or inside it is a no-op, matching split/merge; group options still apply, and `replaceGroup()` or removing the word recovers), an indicator bound to a multi-word alias fails the unit instead of silently attaching to the first word, and a malformed unit's re-emitted source no longer leaks internal placeholder tokens over option text.
- Indicator behavior on atypical bases is now specified: anchors on multi-part bases are order-independent, baseless indicator stacks lay out left-to-right, a leading `;` is inert, `applyIndicators` attaches onto lone-indicator/emptied glyphs symmetrically (space glyphs warn `NOOP_INDICATOR_MUTATION`), a flatten apply never destroys an overlay it cannot bake, and compound indicators (`isIndicator` definitions) behave as atomic units identical to their standalone spelling.
- `^` written before a character's indicator (`B291^;B81`) warns and preserves the base instead of silently losing it.
- A head marker or word-level indicator written on a space (`TSP^`, `TSP;;B81`) now warns (`MISPLACED_HEAD_MARKER` / the new `MISPLACED_WORD_INDICATOR`) and is dropped at parse: a space carries neither a designation nor a word indicator, and the stored state was silently eaten by `toString()`'s `//` output. The API parallel (`applyIndicators`/`clearIndicators` on a space group) refuses with `NOOP_INDICATOR_MUTATION`. The invariant also survives structural mutation and object input: turning an indicator-bearing word into a space (`replaceGlyph(0, 'TSP')` and friends) drops the overlay with `DROPPED_WORD_INDICATOR` and deletes a designation on the became-space glyph, instead of keeping state the serialization eats and the clear API cannot reach. And a bare space glyph never stays inside a word (the DSL cannot express that state; its serialized form re-split into separate groups with a different rendering): a mutation or alias expansion that leaves one there now canonicalizes at rebuild, splitting the word at its space runs into real space groups (silent; the first word run keeps the group's options and `;;` overlay, later runs get an options copy, and explicit non-default spaces keep their code, `QSP` stays `QSP`).
- An invalid part decorated with an option or position no longer serializes as a literal `undefined`; it is dropped from output (still warns `UNKNOWN_CODE` at parse).
- `define()` rejects circular bare-alias references with a clear error at define time (previously an uncaught recursion crash at render).
- Indicator dots now render at SDOT (small-dot) size, so dots on grammatical indicators read as fine detail while structural dots stay full-size (#31).
- Indicator no-op mutations warn (`NOOP_INDICATOR_MUTATION`) instead of failing silently: a clear with nothing to remove (a glyph with no indicators, or a group with no `;;` overlay), a space-glyph or space-word target, or an invalid part pattern.
- `toJSON()` default output is now a lean authoring shape: derived definition metadata is no longer serialized (re-derived on rebuild), and boolean options keep their type.
- Warning `source`/`message` fields now surface the user's verbatim input and the underlying parse error (no internal placeholder tokens, no unactionable `"unknown"`).
- Documentation overhauled to teach the final contract, including a new consolidated Warning Codes reference page (every code with trigger and example), the rewritten DSL quick reference (`;` as literal composition, the two-layer `;;` model), the option scope contract, and the definition validation rules.

### Chores

- The full test suite is now tracked in the repository (#14): 140 test files across the unit, built-bundle, and visual-regression projects, plus a regenerated visual-regression baseline of 2,229 reference SVGs (one per test input, #27), so every behavior in this release is verifiable straight from a clone.
- Dev-dependency updates (vite 8.1, vitest 4.1.9, vue 3.5.39); esbuild pinned `<0.27.3` for VitePress compatibility; all audit advisories cleared (`pnpm audit` exits clean).
- New release gates: `pnpm run typecheck` (`tsc --noEmit` over the shipped declarations), public-surface contract tests on the built bundles, and a warning-code parity test pinning the `WarningCode` union to the runtime registry.

## 1.0.0-rc.3 (2026-05-02)

### Breaking Changes

- Glyph identity contract overhaul (#23): `codeName` no longer leaks synthetic `XTXT_` routing keys; text fallback surfaces as `'X<char>'`. Branch on the new `.char` getter instead of the `XTXT_` prefix.
- `define()` input field for external glyphs renamed from `glyph` to `char`. Same applies to `patchDefinition`.
- Drop snapshot `type` string in favor of level booleans (`isRoot`/`isGroup`/`isGlyph`/`isPart`) and numeric `level`.
- Drop UMD; ship a minified IIFE bundle (`dist/bliss-svg-builder.iife.js`) exposing `BlissSVGBuilder` as a flat global. Use `window.BlissSVGBuilder` directly (no nested namespace).
- Drop legacy `main`/`module` package.json entries.
- `engines.node` raised from `>=16` to `>=18` (Node 16 EOL'd Sept 2023).

### Features

- New `char` getter on `ElementHandle` and `char` field on `ElementSnapshot` exposing the rendered Unicode character for external glyphs.
- New `key`, `offsetX`/`offsetY`, and content flags (`isIndicator`, `isShape`, `isBlissGlyph`, `isExternalGlyph`, `isHeadGlyph`, `isSpaceGroup`) on `ElementHandle`; `measure()` now includes `offsetX`/`offsetY`.
- New numeric `level` and `isGroup`/`isGlyph`/`isPart` booleans on `ElementHandle`.
- New `isRoot`/`isGroup`/`isGlyph`/`isPart` booleans on `ElementSnapshot`.
- `LIB_VERSION` exposed as a `BlissSVGBuilder` class static; default export added.
- Minified IIFE bundle with sourcemap for browser `<script>` use.

### Bug Fixes

- Drop CJS interop shim from ESM source (#20).
- Report height of 20 for all level-2 elements regardless of indicator presence.
- Parser warning `source` field now surfaces the user's original input instead of internal `PLACEHOLDER_n` tokens.
- Malformed global options before `||` now emit `INVALID_GLOBAL_OPTIONS` instead of throwing.
- `addPart` / `insertPart` on a glyph handle now also clears `glyph.glyphCode` when invalidating identity.

### Improvements

- Add `devEngines.runtime: { name: 'node', version: '>=20.19' }` to declare the contributor toolchain floor separately from the consumer floor.

### Chores

- Drop unreachable `builtInCodes` branches in `bliss-parser.js` (no behavior change).
- Add Stryker mutation testing setup.
- Add `test:dist` gate exercising built ESM/CJS/IIFE bundles; wired into `prepublishOnly`.
- Refactor: extract shared constants and helpers; simplify `SPACE_GLYPH_CODES`.
- Update dev and build dependencies.

## 1.0.0-rc.2 (2026-04-10)

### Breaking Changes

- Rename `.words` to `.groups` (#17). The old `.words` getter no longer exists.

### Bug Fixes

- Apply part-level options on DOT/COMMA/SDOT (#16)
- Correct `insertGroup` and `insertPart` serialization (#15)

### Improvements

- SVG output: self-closing path tags, consistent indentation, one element per line, remove `standalone="yes"` from XML declaration

### Chores

- Override esbuild to fix audit vulnerability

## 1.0.0-rc.1

First release candidate: full mutation API, element snapshots, traversal/query, boolean options, error placeholders, definition management.
