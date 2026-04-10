# Changelog

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
