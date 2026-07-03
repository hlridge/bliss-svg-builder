# Changelog

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
