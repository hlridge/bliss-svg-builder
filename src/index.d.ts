/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// --- Options ---

/** Known option keys accepted by BlissSVGBuilder (kebab-case). */
export interface BlissOptions {
  // Stroke and spacing
  'stroke-width'?: number;
  'dot-extra-width'?: number;
  'sdot-extra-width'?: number;
  'dot-width'?: number;
  'sdot-width'?: number;
  'char-space'?: number;
  'word-space'?: number;
  'external-glyph-space'?: number;

  // Margins (builder-level)
  margin?: number;
  'margin-top'?: number;
  'margin-bottom'?: number;
  'margin-left'?: number;
  'margin-right'?: number;

  // Sizing
  'min-width'?: number;
  center?: boolean;

  // Cropping (builder-level)
  crop?: number | 'auto' | 'auto-vertical' | 'compact';
  'crop-top'?: number | 'auto';
  'crop-bottom'?: number | 'auto';
  'crop-left'?: number | 'auto';
  'crop-right'?: number | 'auto';

  // Grid (builder-level)
  grid?: boolean;
  'grid-color'?: string;
  'grid-major-color'?: string;
  'grid-medium-color'?: string;
  'grid-minor-color'?: string;
  'grid-sky-color'?: string;
  'grid-earth-color'?: string;
  'grid-stroke-width'?: number;
  'grid-major-stroke-width'?: number;
  'grid-medium-stroke-width'?: number;
  'grid-minor-stroke-width'?: number;
  'grid-sky-stroke-width'?: number;
  'grid-earth-stroke-width'?: number;

  // Colors and background
  color?: string;
  background?: string;
  'background-top'?: string;
  'background-mid'?: string;
  'background-bottom'?: string;

  // Text and metadata
  text?: string;
  'svg-desc'?: string;
  'svg-title'?: string;
  'svg-height'?: number;

  // Error handling
  'error-placeholder'?: boolean;

  // SVG pass-through attributes (any key not in the known set). Includes
  // `boolean` so the boolean options (`grid`, `center`, `error-placeholder`)
  // conform to the index signature; without it `tsc` rejects this interface.
  [key: string]: string | number | boolean | undefined;
}

/** Cascading option layers: defaults (lowest priority) and overrides (highest priority). */
export interface OptionLayers {
  defaults?: BlissOptions;
  overrides?: BlissOptions;
}

// --- Element snapshots ---

/** Bounding box of an element in absolute SVG coordinates. */
export interface ElementBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

/** A frozen, read-only snapshot of an element in the composition tree. */
export interface ElementSnapshot {
  readonly key: string;
  /**
   * The input code that produces this element (e.g. `'B431'`, `'Xa'`, `'H'`).
   * At part level, the structural lookup key the user would write (`'B81'`,
   * `'H'`, `'Xa'`, `'TSP'`, `'Xα'`, `'Xhαllo'`). At glyph level, the input
   * code only when the glyph is actually a glyph: B-codes (`'B431'`), single
   * X-codes (`'Xa'`, `'Xα'`), or `define()`d `type:'glyph'` aliases
   * (`'LOVE'`); `''` for composites, bare shape primitives, and
   * multi-character text fallback. Always `''` at group level. Note: this is
   * the live identity. `toString()` and `toJSON()` decompose alias names by
   * default; pass `{ preserve: true }` to keep them in serialized output.
   */
  readonly codeName: string;
  /**
   * The rendered Unicode character for an external glyph (e.g. `'a'` for
   * `Xa`, `'α'` for `Xα`). `''` for B-codes, composites, shape primitives,
   * multi-character text fallback, and non-glyph levels.
   */
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly advanceX: number;
  readonly baseWidth: number;
  readonly level: number;
  readonly isRoot: boolean;
  readonly isGroup: boolean;
  readonly isGlyph: boolean;
  readonly isPart: boolean;
  readonly bounds: ElementBounds;
  readonly isIndicator: boolean;
  /**
   * For an indicator part, whether it originates from a character-level
   * marker (single `;`, `'character'`) or a word-level overlay (`;;`,
   * `'word'`). `null` for a non-indicator, a non-part level, or an indicator
   * whose definition cannot be resolved. The `'word'` value appears only on
   * the resolved snapshot: a word overlay has no raw node, so a part handle
   * can never reach one. Like `isIndicator`, a composite indicator's internal
   * sub-parts also classify (as `'character'`), so an enumeration that
   * recurses `children` should de-duplicate by depth.
   */
  readonly indicatorLevel: 'character' | 'word' | null;
  /**
   * For an indicator part, `'semantic'` when its definition carries a
   * semantic indicator (e.g. THING), otherwise `'grammatical'`. `null` for a
   * non-indicator, a non-part level, or an unresolved definition.
   */
  readonly indicatorKind: 'semantic' | 'grammatical' | null;
  readonly isShape: boolean;
  readonly isBlissGlyph: boolean;
  readonly isExternalGlyph: boolean;
  readonly isHeadGlyph: boolean;
  readonly isSpaceGroup: boolean;
  readonly index: number;
  readonly parentKey: string | null;
  readonly children: readonly ElementSnapshot[];
}

// --- Element handle (live mutation API) ---

/**
 * A live handle referencing a node in the raw composition object.
 * Returned by `getElementByKey()`, `group()`, `glyph()`, and `part()`.
 * Mutations through a handle trigger a rebuild of the composition.
 */
export declare class ElementHandle {
  /** Structural depth: 1 = group, 2 = glyph, 3+ = part. */
  readonly level: number;

  /** True when level === 1 (a word group). */
  readonly isGroup: boolean;

  /** True when level === 2 (a Bliss character). */
  readonly isGlyph: boolean;

  /** True when level >= 3 (a part within a character). */
  readonly isPart: boolean;

  /**
   * The input code that produces this element (e.g. `'B431'`, `'Xa'`, `'H'`).
   * At part level, the structural lookup key the user would write (`'B81'`,
   * `'H'`, `'Xa'`, `'TSP'`, `'Xα'`, `'Xhαllo'`). At glyph level, the input
   * code only when the glyph is actually a glyph: B-codes (`'B431'`), single
   * X-codes (`'Xa'`, `'Xα'`), or `define()`d `type:'glyph'` aliases
   * (`'LOVE'`); `''` for composites, bare shape primitives, and
   * multi-character text fallback. Always `''` at group level. Note: this is
   * the live identity. `toString()` and `toJSON()` decompose alias names by
   * default; pass `{ preserve: true }` to keep them in serialized output.
   */
  readonly codeName: string;

  /**
   * The rendered Unicode character for an external glyph (e.g. `'a'` for
   * `Xa`, `'α'` for `Xα`). `''` for B-codes, composites, shape primitives,
   * multi-character text fallback, and non-glyph levels.
   */
  readonly char: string;

  /** Stable across mutations. Use with `getElementByKey(key)` to recover a handle to this same node later. */
  readonly key: string;

  /** Whether this part is an indicator. Only true on part-level handles. */
  readonly isIndicator: boolean;

  /**
   * Indicator origin level: `'character'` for a single-`;` indicator part, or
   * `null` for a non-indicator or non-part handle. A word-level overlay (`;;`)
   * has no raw node, so a part handle can never reference one — it reads as
   * `'word'` on `snapshot()` instead.
   */
  readonly indicatorLevel: 'character' | 'word' | null;

  /**
   * Indicator kind: `'semantic'` when the definition carries a semantic
   * indicator, `'grammatical'` otherwise, or `null` for a non-indicator part,
   * a non-part handle, or an unresolved definition.
   */
  readonly indicatorKind: 'semantic' | 'grammatical' | null;

  /** Whether this part is a shape primitive. */
  readonly isShape: boolean;

  /** Whether this glyph is a B-code Bliss character. */
  readonly isBlissGlyph: boolean;

  /** Whether this glyph is an external font character. */
  readonly isExternalGlyph: boolean;

  /** Whether this glyph is the head of its word group. */
  readonly isHeadGlyph: boolean;

  /** Whether this group is a space separator (TSP/QSP). */
  readonly isSpaceGroup: boolean;

  // --- Dimensions (read-only, from snapshot) ---

  /** Absolute x position of this element's origin. */
  readonly x: number;
  /** Absolute y position of this element's origin. */
  readonly y: number;
  /** Position offset relative to the parent. */
  readonly offsetX: number;
  /** Position offset relative to the parent. */
  readonly offsetY: number;
  /** Total width including indicator overhang. */
  readonly width: number;
  /** Total height. */
  readonly height: number;
  /** Absolute bounding box. */
  readonly bounds: ElementBounds;
  /** Horizontal spacing step to next sibling. */
  readonly advanceX: number;
  /** Width excluding indicators. Equals width when no indicators present. */
  readonly baseWidth: number;

  /** Returns all dimension properties at once. */
  measure(): {
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    bounds: ElementBounds;
    advanceX: number;
    baseWidth: number;
  };

  // --- Navigation ---

  /** Returns the head glyph handle within this group. Only valid on group handles. */
  headGlyph(): ElementHandle | null;

  /** Returns the glyph at the given index within this group. Negative indices count from the end (-1 = last). Only valid on group handles. */
  glyph(index: number): ElementHandle | null;

  /**
   * Returns the part at the given index. Negative indices count from the end (-1 = last).
   * Valid on glyph handles (returns a part of the glyph) and
   * part handles (returns a nested sub-part).
   */
  part(index: number): ElementHandle | null;

  // --- Mutation: add/insert ---

  /** Appends a glyph to this group. Only valid on group handles. */
  addGlyph(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Inserts a glyph at the given index in this group. Only valid on group handles. */
  insertGlyph(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Appends a part to this glyph. On group handles, delegates to the last glyph. */
  addPart(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Inserts a part at the given index in this glyph. Only valid on glyph handles. */
  insertPart(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: remove/replace (self) ---

  /** Removes this element. Cascades: removing the last part removes its glyph, etc. */
  remove(): undefined;

  /** Disconnects this element from its parent without cascade cleanup. May leave empty containers. */
  detach(): undefined;

  /** Replaces this element with a new one. Valid on glyph and part handles. */
  replace(code: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: remove/replace (parent-centric, by index) ---

  /** Removes the glyph at the given index in this group. Only valid on group handles. */
  removeGlyph(index: number): this;

  /** Replaces the glyph at the given index in this group. Only valid on group handles. */
  replaceGlyph(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the part at the given index in this glyph. Only valid on glyph handles. */
  removePart(index: number): this;

  /** Replaces the part at the given index in this glyph. Only valid on glyph handles. */
  replacePart(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: indicators ---

  /**
   * Replaces all indicators on this element with the given indicator codes,
   * preserving an existing semantic indicator unless `{ stripSemantic: true }`.
   *
   * Polymorphic by handle level:
   * - **Glyph handle** — character-level: bakes the indicators into the
   *   glyph's parts. `flatten` has no effect (glyph indicators are already flat).
   * - **Group handle** — word-level: sets the reversible `wordIndicators`
   *   overlay (the DSL `;;` channel), leaving the base glyphs intact so a later
   *   `clearIndicators()` restores them. `{ flatten: true }` opts out of the
   *   overlay and bakes onto the head glyph as character-level parts instead
   *   (the pre-overlay, character-level shape). A `flatten` apply keeps the
   *   overlay when its code applies no indicator (it would bake nothing), rather
   *   than silently dropping the overlay.
   *
   * The per-surface `flatten` asymmetry is deliberate: it applies only to the
   * group/word-level overlay, the only surface with a portable `;;` form to
   * collapse.
   *
   * On a glyph handle the first part is always the base, so applying onto a lone
   * indicator or a detach-emptied glyph attaches the indicator (matching
   * `addPart`). A call that still cannot apply any indicator (the requested
   * codes are not indicators, or the target glyph is a space) adds an
   * `NOOP_INDICATOR_MUTATION` warning to `warnings` instead of silently doing
   * nothing.
   */
  applyIndicators(code: string, opts?: { stripSemantic?: boolean; flatten?: boolean }): this;

  /**
   * Removes indicators, preserving an existing semantic indicator unless
   * `{ stripSemantic: true }`.
   *
   * Polymorphic by handle level (see `applyIndicators`):
   * - **Glyph handle** — removes the glyph's grammatical indicator parts.
   * - **Group handle** — removes the word-level `wordIndicators` overlay,
   *   restoring the base. `{ stripSemantic: true }` keeps a reversible
   *   empty-codes strip overlay (suppresses the base semantic at render but
   *   keeps it recoverable). `{ flatten: true }` bakes the cleared state onto
   *   the head glyph instead of leaving an overlay.
   *
   * On a glyph handle, a clear that finds no indicators to remove adds an
   * `NOOP_INDICATOR_MUTATION` warning to `warnings`.
   */
  clearIndicators(opts?: { stripSemantic?: boolean; flatten?: boolean }): this;

  // --- Mutation: space/word structure ---

  /**
   * Splits this word group into two at the glyph boundary, inserting a space
   * between. Only valid on group handles. A word-level (`;;`) indicator overlay
   * is a word property: the first (left) part always keeps it. A `^` head
   * marker is kept only if its glyph lands in the first part; otherwise the
   * second part re-derives its head.
   */
  splitAt(glyphIndex: number): this;

  /**
   * Merges this word group with the next one, removing spaces between them.
   * Only valid on group handles. The merged word keeps this group's word-level
   * (`;;`) indicator overlay; an overlay on the absorbed word is dropped and a
   * `DROPPED_WORD_INDICATOR` warning is added to `warnings`. The absorbed
   * word's `^` head marker is also dropped (silently); the merged word
   * resolves a single head.
   */
  mergeWithNext(): this;

  // --- Mutation: options ---

  /** Sets or merges options on this element. Accepts flat options (treated as overrides) or { defaults, overrides }. */
  setOptions(opts: BlissOptions | OptionLayers): this;

  /** Removes specific option keys from this element. */
  removeOptions(...keys: string[]): this;
}

// --- Definition types ---

/** Context object passed to custom `getPath` functions. */
export interface ShapeContext {
  [key: string]: any;
}

/**
 * Definition for a custom glyph: a base character or a compound indicator,
 * composed from existing codes. A glyph definition may not bake in an indicator
 * part unless it is itself a compound indicator (`isIndicator: true`); define a
 * base+indicator combination as a {@link BareDefinition} alias instead (the
 * indicator attaches at the use site). `define()` reports a violation in its
 * `errors` result rather than throwing.
 */
export interface GlyphDefinition {
  type?: 'glyph';
  codeString: string;
  /** Marks an all-indicator definition as a compound indicator. */
  isIndicator?: boolean;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
  width?: number;
  shrinksPrecedingWordSpace?: boolean;
  kerningRules?: Record<string, any>;
  defaultOptions?: BlissOptions;
}

/** Definition for a custom shape (rendered via getPath or codeString). */
export interface ShapeDefinition {
  type?: 'shape';
  getPath?: (ctx: ShapeContext) => string;
  codeString?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  extraPathOptions?: Record<string, any>;
  defaultOptions?: BlissOptions;
}

/** Definition for an external glyph (custom rendering around a Unicode character). */
export interface ExternalGlyphDefinition {
  type: 'externalGlyph';
  getPath: (ctx: ShapeContext) => string;
  width: number;
  /** The rendered Unicode character (e.g. `'a'` for the external glyph registered as `'Xa'`). */
  char: string;
  y?: number;
  height?: number;
  kerningRules?: Record<string, any>;
  defaultOptions?: BlissOptions;
}

/** Bare alias definition (maps a code name to a code string). */
export interface BareDefinition {
  codeString: string;
  defaultOptions?: BlissOptions;
}

/** Union of all definition types accepted by `BlissSVGBuilder.define()`. */
export type CodeDefinition =
  | GlyphDefinition
  | ShapeDefinition
  | ExternalGlyphDefinition
  | BareDefinition;

/** Definition type identifiers. */
export type DefinitionType = 'shape' | 'glyph' | 'externalGlyph' | 'bare' | 'space';

/** Result returned by `BlissSVGBuilder.define()`. */
export interface DefineResult {
  defined: string[];
  skipped: string[];
  errors: string[];
}

/** Frozen metadata returned by `BlissSVGBuilder.getDefinition()`. */
export interface DefinitionMetadata {
  readonly type: DefinitionType;
  readonly isBuiltIn: boolean;
  readonly [key: string]: any;
}

// --- Serialization output ---

/**
 * Normalized parsed structure returned by `toJSON()`. Describes the default
 * (authoring) shape: the composition the user wrote, plus `isIndicator`/`width`
 * on indicator parts. Definition-derived metadata
 * (`isBlissGlyph`/`isExternalGlyph`/`char`/`kerningRules` and part
 * `anchorOffsetX`/`anchorOffsetY`) is omitted — it is fully re-derived from the
 * code when this object is passed back to the constructor. `{ deep: true }`
 * retains that metadata plus nested sub-parts for `toString()`/`merge()`; those
 * extra fields are not part of this type.
 */
export interface BlissJSON {
  options?: Record<string, string>;
  groups: Array<{
    options?: Record<string, string | boolean>;
    /**
     * Word-level fail-render flag: set when the parser rejects the whole word
     * (e.g. a malformed `;;` indicator that is not the trailing part of the
     * word). The word renders as a single error placeholder (`error-placeholder`
     * on) or nothing (off) and emits one `MALFORMED_WORD_INDICATOR` warning.
     * `errorSource` is the original offending string, re-emitted verbatim by
     * `toString()` so the malformation round-trips.
     */
    errorCode?: WarningCode;
    error?: string;
    errorSource?: string;
    /**
     * Word-level indicator overlay (the DSL `;;` form): stored on the word and
     * resolved onto the head glyph at render. Present in default output (kept
     * by default); absent when there is no word-level indicator.
     */
    wordIndicators?: { codes: string[]; stripSemantic: boolean };
    glyphs?: Array<{
      codeName?: string;
      options?: Record<string, string | boolean>;
      isHeadGlyph?: boolean;
      parts?: Array<{
        codeName: string;
        options?: Record<string, string | boolean>;
        /** Present (true) only on an indicator part. */
        isIndicator?: boolean;
        /** Rendered indicator width; present only on an indicator part. */
        width?: number;
        x?: number;
        y?: number;
        parts?: Array<any>;
      }>;
    }>;
  }>;
}

// --- Warnings ---

/**
 * Every warning code the builder can emit. Mirrors the `WARNING_CODES` registry
 * in `bliss-constants.js` (the runtime source of truth).
 */
export type WarningCode =
  | 'MALFORMED_GLOBAL_OPTIONS'
  | 'MALFORMED_GROUP_OPTIONS'
  | 'MALFORMED_WORD_INDICATOR'
  | 'MALFORMED_COORDINATES'
  | 'MALFORMED_KERNING_VALUE'
  | 'MISPLACED_HEAD_MARKER'
  | 'MISPLACED_CHARACTER_INDICATOR'
  | 'MISPLACED_PART_OPTION'
  | 'MISPLACED_CHARACTER_OPTION'
  | 'MISPLACED_GROUP_OPTION'
  | 'MISPLACED_GLOBAL_OPTION'
  | 'MULTIPLE_HEAD_MARKERS'
  | 'MULTIPLE_OPTION_BRACKETS'
  | 'DUPLICATE_KEY'
  | 'UNKNOWN_CODE'
  | 'DROPPED_WORD_INDICATOR'
  | 'UNSUPPORTED_TEXT_BLOCKS'
  | 'NOOP_INDICATOR_MUTATION'
  | 'COMPOSITE_AS_PART'
  | 'WORD_AS_PART'
  | 'NON_INDICATOR_AS_WORD_INDICATOR';

/** A warning generated when the builder encounters a problem it can recover from. */
export interface Warning {
  /** Warning type identifier (see `WarningCode`). */
  readonly code: WarningCode;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** The problematic DSL code that triggered the warning. */
  readonly source: string;
}

// --- Builder stats ---

export interface BuilderStats {
  groupCount: number;
  glyphCount: number;
}

// --- Main class ---

export declare class BlissSVGBuilder {
  /**
   * Creates an instance of BlissSVGBuilder.
   * @param input - A DSL string, a plain object from `toJSON()`, or omitted for an empty builder
   * @param options - Defaults/overrides to merge, or flat options treated as overrides
   */
  constructor(input?: string | BlissJSON, options?: BlissOptions | OptionLayers);

  /**
   * Library version string (set at build time).
   * Also exported as the named `LIB_VERSION` constant.
   */
  static readonly LIB_VERSION: string;

  // --- SVG output (getters) ---

  /** SVG content (path elements and groups) without the outer `<svg>` wrapper. */
  readonly svgContent: string;

  /** Parsed SVG as a DOM element. Requires a DOM environment. */
  readonly svgElement: SVGSVGElement;

  /** Complete SVG markup without XML declaration. */
  readonly svgCode: string;

  /** Complete SVG markup with XML declaration. */
  readonly standaloneSvg: string;

  // --- Warnings ---

  /** Warnings generated during parsing/rendering (unknown codes, invalid syntax, etc.). */
  readonly warnings: readonly Warning[];

  // --- Element tree (getters) ---

  /** Root element snapshot (frozen tree of all elements). */
  readonly elements: ElementSnapshot;

  /** Non-space group snapshots. */
  readonly groups: readonly ElementSnapshot[];

  /** Group and glyph counts. */
  readonly stats: BuilderStats;

  // --- Traversal and querying ---

  /** Depth-first traversal of all element snapshots. Return `false` to stop early. */
  traverse(callback: (el: ElementSnapshot) => boolean | void): void;

  /** Returns all element snapshots matching the predicate. */
  query(predicate: (el: ElementSnapshot) => boolean): ElementSnapshot[];

  /** Looks up an element handle by its snapshot key. */
  getElementByKey(key: string): ElementHandle | null;

  /** Returns a handle to the non-space group at the given index. Negative indices count from the end (-1 = last). */
  group(index: number): ElementHandle | null;

  /** Returns a handle to any group (including spaces) at the given raw index. Negative indices count from the end (-1 = last). */
  element(index: number): ElementHandle | null;

  /** Total number of raw groups (including space groups). */
  readonly elementCount: number;

  /** Returns a handle to the glyph at the given flat index across all groups. Negative indices count from the end (-1 = last). */
  glyph(flatIndex: number): ElementHandle | null;

  /** Returns a handle to the part at the given flat index across all glyphs. Negative indices count from the end (-1 = last). */
  part(flatIndex: number): ElementHandle | null;

  /** Returns the root element snapshot (alias for `elements`). */
  snapshot(): ElementSnapshot;

  // --- Building and manipulation ---

  /** Appends a new glyph group with automatic space management. */
  addGroup(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Appends a glyph to the last non-space group (creates one if empty). */
  addGlyph(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Appends a part to the last glyph of the last group. */
  addPart(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Inserts a group at the given index. Negative indices count from the end. */
  insertGroup(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the group at the given index. Negative indices count from the end. */
  removeGroup(index: number): this;

  /** Replaces the group at the given index with new content. Negative indices count from the end. */
  replaceGroup(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Merges another builder's content into this one. Appends the other builder's groups with a space between. The other builder's global options are discarded. */
  merge(other: BlissSVGBuilder): this;

  /** Splits this builder at the given group index. This builder keeps the left half; a new builder with the right half is returned. Both share the same global options. */
  splitAt(groupIndex: number): BlissSVGBuilder;

  /** Appends a raw group with no automatic space management. SP auto-resolves to TSP/QSP. */
  addElement(code: string, opts?: BlissOptions | OptionLayers): this;

  /** Inserts a raw group at the given index with no automatic space management. SP auto-resolves. */
  insertElement(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the raw group at the given index (plain splice, no space cleanup). */
  removeElement(index: number): this;

  /** Replaces the raw group at the given index with new content. */
  replaceElement(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes all content from the builder. */
  clear(): this;

  // --- Serialization ---

  /**
   * Returns a portable DSL string. Custom codes are decomposed to built-in
   * codes by default; pass `{ preserve: true }` to keep custom names.
   *
   * `flattenIndicators` collapses word-level (`;;`) indicators onto the head
   * glyph as character-level `;`, reproducing the pre-overlay output. It is the
   * same concept as `applyIndicators(code, { flatten })`; the name is qualified
   * here only because `toString`/`toJSON` lack the "indicator" context the
   * method name provides.
   */
  toString(options?: { preserve?: boolean; flattenIndicators?: boolean }): string;

  /**
   * Returns a normalized parsed structure (plain object). Custom glyph codes
   * are resolved to built-in codes by default; pass `{ preserve: true }` to keep them.
   *
   * `flattenIndicators` bakes word-level (`;;`) indicators onto the head and
   * omits the `wordIndicators` field (see `toString`).
   *
   * `deep` keeps nested sub-parts and all definition-derived metadata (consumed
   * by `toString()`/`merge()`); the default output omits those (they are
   * re-derived from the code on reconstruction) and is the authoring shape
   * described by {@link BlissJSON}.
   */
  toJSON(options?: { preserve?: boolean; deep?: boolean; flattenIndicators?: boolean }): BlissJSON;

  // --- Static: definition management ---

  /**
   * Defines one or more custom codes (glyphs, shapes, external glyphs, or bare aliases).
   * @param definitions - Map of code names to their definitions
   * @param options - Pass `{ overwrite: true }` to replace existing custom definitions
   */
  static define(
    definitions: Record<string, CodeDefinition>,
    options?: { overwrite?: boolean }
  ): DefineResult;

  /** Returns `true` if a code is defined (built-in or custom). */
  static isDefined(code: string): boolean;

  /** Returns frozen metadata for a code, or `null` if not found. */
  static getDefinition(code: string): DefinitionMetadata | null;

  /** Lists all defined codes, optionally filtered by type. */
  static listDefinitions(filter?: { type?: DefinitionType }): string[];

  /** Removes a custom definition. Throws if the code is built-in. */
  static removeDefinition(code: string): boolean;

  /**
   * Patches properties on an existing custom definition.
   * Only keys valid for the definition's type are accepted.
   * Built-in definitions cannot be patched.
   */
  static patchDefinition(code: string, changes: Partial<CodeDefinition>): { patched: true };
}

/**
 * Library version string (set at build time).
 * Also accessible as the `BlissSVGBuilder.LIB_VERSION` static.
 */
export declare const LIB_VERSION: string;

export default BlissSVGBuilder;
