# Changelog

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
