# Changelog

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
