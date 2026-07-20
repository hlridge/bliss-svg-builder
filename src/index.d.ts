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
  /**
   * Whether this group is a space separator (TSP/QSP). A content-empty group
   * (`{ glyphs: [] }`) is never a space group.
   */
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
 *
 * A handle whose element has been removed is stale; most operations on a stale
 * handle throw (see Handle Lifetime in the docs).
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

  /**
   * Whether this group is a space separator (TSP/QSP). A content-empty group
   * (`{ glyphs: [] }`) is never a space group.
   */
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

  /**
   * Appends a glyph to this group. Only valid on group handles. An omitted,
   * empty, or whitespace-only `code` appends an empty glyph (`{parts: []}`);
   * it renders nothing and round-trips through `toJSON()`.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` parses to anything but exactly one glyph:
   *   multi-glyph codes (including defined word names) and multi-group codes
   *   throw, as do artifacts from above the glyph (document options
   *   `[opts]||`, word options `[opts]|`, a word indicator list `;;`, or a
   *   code that fails to parse as a word). Use `addGroup()` for word content.
   */
  addGlyph(code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Inserts a glyph at the given index in this group. Only valid on group
   * handles. An omitted, empty, or whitespace-only `code` inserts an empty
   * glyph (`{parts: []}`).
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` parses to anything but exactly one glyph (see
   *   `addGlyph`).
   */
  insertGlyph(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Appends a part to this glyph. On group handles, delegates to the last
   * glyph; if the group has no glyphs, the part is wrapped in a new glyph
   * instead of being dropped. A part references a shape, so `code` is
   * required: to reserve an empty slot, use `addGlyph('')`.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` is empty or whitespace-only (a part cannot be
   *   empty), parses to anything but exactly one part (a multi-part
   *   composition takes one call per part; a word is kept as a failed part
   *   with a `WORD_AS_PART` warning instead of throwing), or carries an
   *   artifact from above the part: document options `[opts]||`, word
   *   options `[opts]|`, a word indicator list `;;`, a head marker `^`, or
   *   a code that fails to parse as a word.
   */
  addPart(code: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Inserts a part at the given index in this glyph. On group handles,
   * delegates to the last glyph; if the group has no glyphs, the part is
   * wrapped in a new glyph. A part references a shape, so `code` is
   * required.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` is empty or parses to anything but exactly one
   *   part (see `addPart`).
   */
  insertPart(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: remove/replace (self) ---

  /** Removes this element. Cascades: removing the last part removes its glyph, etc. */
  remove(): undefined;

  /** Disconnects this element from its parent without cascade cleanup. May leave empty containers. */
  detach(): undefined;

  /**
   * Replaces this element with a new one. Valid on glyph and part handles.
   * On a glyph handle an omitted, empty, or whitespace-only `code` swaps this
   * glyph for an empty glyph (`{parts: []}`), destructively discarding the
   * old content (a head designation dies with it).
   * @throws {TypeError} On glyph and part handles, if `code` is provided and
   *   is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} On a glyph handle, if `code` parses to anything but
   *   exactly one glyph (see `addGlyph`). On a part handle, if `code` is
   *   omitted or empty (a part references a shape and cannot be empty; swap
   *   in an empty slot with the glyph handle's `replace('')` instead) or
   *   parses to anything but a single part (see `addPart`).
   */
  replace(code?: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: remove/replace (parent-centric, by index) ---

  /** Removes the glyph at the given index in this group. Only valid on group handles. */
  removeGlyph(index: number): this;

  /**
   * Replaces the glyph at the given index in this group. Only valid on group
   * handles. An omitted, empty, or whitespace-only `code` swaps the target
   * for an empty glyph (`{parts: []}`), destructively discarding the old
   * content (a head designation dies with it). Out-of-range indices remain a
   * silent no-op (checked before the code is parsed).
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` parses to anything but exactly one glyph (see
   *   `addGlyph`).
   */
  replaceGlyph(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the part at the given index in this glyph. Only valid on glyph handles. */
  removePart(index: number): this;

  /**
   * Replaces the part at the given index in this glyph. Only valid on glyph
   * handles. Out-of-range indices remain a silent no-op (checked before the
   * code is parsed). A part references a shape, so `code` is required.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` is empty or parses to anything but exactly one
   *   part (see `addPart`).
   */
  replacePart(index: number, code: string, opts?: BlissOptions | OptionLayers): this;

  // --- Mutation: indicators ---

  /**
   * SETS the indicator state on this element from the given indicator codes,
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
   * An EMPTY code (omitted, `''`, or whitespace-only) is allowed as the
   * deliberate empty indicator set: on a group handle it stores the empty `;;`
   * overlay (render-significant — it hides the head's own character-level
   * indicators and adds none; with `{ stripSemantic: true }` it stores the
   * `;;!` strip overlay); on a glyph handle it has the same state effect as
   * `clearIndicators()`, with `stripSemantic` additionally removing the
   * semantic (a bare base stays a harmless silent no-op, like a trailing `;`).
   *
   * A NON-empty code whose codes are ALL invalid (non-indicators or unknown)
   * REFUSES: nothing mutates (no clearing, no stripping) and each rejected
   * code warns (`NON_INDICATOR_AS_CHARACTER_INDICATOR` /
   * `NON_INDICATOR_AS_WORD_INDICATOR` / `UNKNOWN_CODE`). A mixed list applies
   * the valid subset and warns per rejected code. One deliberate exception:
   * on a group handle, `{ stripSemantic: true }` is itself valid overlay
   * content, so an all-invalid apply WITH it still stores the `;;!` strip
   * overlay (DSL parity with `WORD;;!ZZ9` — the bad code drops, the `!`
   * stays). A non-string code (other than `null`, accepted as the deliberate
   * empty set) throws a `TypeError`.
   *
   * The per-surface `flatten` asymmetry is deliberate: it applies only to the
   * group/word-level overlay, the only surface with a portable `;;` form to
   * collapse.
   *
   * On a glyph handle the first part is always the base, so applying onto a lone
   * indicator or a detach-emptied glyph attaches the indicator (matching
   * `addPart`). An apply that targets a glyph that cannot carry an indicator
   * (a space glyph, or an invalid part pattern) adds an
   * `NOOP_INDICATOR_MUTATION` warning to `warnings` instead of silently doing
   * nothing.
   * @throws {TypeError} If `code` is provided, is not a string, and is not `null`.
   */
  applyIndicators(code?: string, opts?: { stripSemantic?: boolean; flatten?: boolean }): this;

  /**
   * The PURE UNDO: removes indicators, always preserving an existing semantic
   * indicator. Clear takes no `stripSemantic` — that option lives on apply:
   * `applyIndicators('', { stripSemantic: true })` REMOVES the baked semantic
   * on a glyph handle, but on a group handle it STORES the reversible `;;!`
   * strip overlay (hides the head's indicators at render, removes nothing).
   *
   * Polymorphic by handle level (see `applyIndicators`):
   * - **Glyph handle** — removes the glyph's grammatical indicator parts.
   * - **Group handle** — removes the word-level `wordIndicators` overlay, and
   *   thereby UN-HIDES the head glyph's own character-level indicators: while
   *   the overlay existed it replaced them at render, so clearing it restores
   *   the original characters. `{ flatten: true }` bakes the cleared state
   *   onto the head glyph instead of leaving an overlay.
   *
   * A clear that finds nothing to remove (a glyph with no indicators; a group
   * with no overlay) adds an `NOOP_INDICATOR_MUTATION` warning to `warnings`.
   */
  clearIndicators(opts?: { flatten?: boolean }): this;

  // --- Mutation: space/word structure ---

  /**
   * Splits this word group into two at the glyph boundary, inserting a space
   * between. Only valid on group handles. A word-level (`;;`) indicator overlay
   * is a word property: the first (left) part always keeps it. A `^` head
   * marker is kept only if its glyph lands in the first part; otherwise the
   * second part re-derives its head.
   * @throws {Error} On a group handle, if `glyphIndex` is out of range (must be
   *   1 to glyphs.length-1 inclusive). Returns `this` with no effect on non-group
   *   handles (no throw).
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

  /**
   * Sets or merges options on this element. Accepts flat options (treated as
   * overrides) or { defaults, overrides }.
   * @throws {TypeError} If `opts` is provided and is not an object.
   */
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
  /**
   * Marks an all-indicator definition as a compound indicator. Valid only on a
   * `type: 'glyph'` definition; on a bare alias, shape, or external glyph
   * `define()` reports a violation in its `errors` result. Indicator-ness still
   * rides through an unflagged bare alias whose target is itself an indicator
   * (e.g. `{ codeString: 'B81' }`).
   */
  isIndicator?: boolean;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
  width?: number;
  shrinksPrecedingWordSpace?: boolean;
  kerningRules?: Record<string, any>;
  /**
   * Default options merged into each use of the definition. Keys must be
   * well-formed option names (letters, digits, hyphens; camelCase accepted;
   * names beginning with `on` are rejected, as for any attribute) and may not
   * include a global-only (builder-canvas) option key such as `margin` or
   * `grid` — those configure the whole SVG and would be inert on a
   * definition; `define()` reports a violation in its `errors` result,
   * `patchDefinition()` throws.
   */
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
  /** Default options merged into each use; global-only option keys are rejected (see {@link GlyphDefinition.defaultOptions}). */
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
  /** Default options merged into each use; global-only option keys are rejected (see {@link GlyphDefinition.defaultOptions}). */
  defaultOptions?: BlissOptions;
}

/** Bare alias definition (maps a code name to a code string). */
export interface BareDefinition {
  codeString: string;
  /** Default options merged into each use; global-only option keys are rejected (see {@link GlyphDefinition.defaultOptions}). */
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
 * Every warning code the current builder version can emit. The named literals
 * mirror the `WARNING_CODES` registry in `bliss-constants.js` (the runtime
 * source of truth).
 *
 * This is an OPEN union: minor releases may add new warning codes (existing
 * code meanings never change within 1.x), so the type also accepts any string
 * while keeping autocomplete for the known codes. When switching on a warning
 * code, always include a default branch for codes added after your build.
 */
export type WarningCode =
  | 'MALFORMED_GLOBAL_OPTIONS'
  | 'MALFORMED_GROUP_OPTIONS'
  | 'MALFORMED_WORD_INDICATOR'
  | 'MALFORMED_COORDINATES'
  | 'MALFORMED_KERNING_VALUE'
  | 'MISPLACED_HEAD_MARKER'
  | 'MISPLACED_CHARACTER_INDICATOR'
  | 'MISPLACED_WORD_INDICATOR'
  | 'MISPLACED_PART_OPTION'
  | 'MISPLACED_CHARACTER_OPTION'
  | 'MISPLACED_GROUP_OPTION'
  | 'MISPLACED_GLOBAL_OPTION'
  | 'MISPLACED_SPACE_DECORATION'
  | 'MISPLACED_INDICATOR_PART'
  | 'MISPLACED_SPACE_PART'
  | 'MULTIPLE_HEAD_MARKERS'
  | 'MULTIPLE_OPTION_BRACKETS'
  | 'DUPLICATE_KEY'
  | 'UNKNOWN_CODE'
  | 'DROPPED_WORD_INDICATOR'
  | 'UNSUPPORTED_TEXT_BLOCKS'
  | 'NOOP_INDICATOR_MUTATION'
  | 'COMPOSITE_AS_PART'
  | 'WORD_AS_PART'
  | 'NON_INDICATOR_AS_WORD_INDICATOR'
  | 'NON_INDICATOR_AS_CHARACTER_INDICATOR'
  | (string & {});

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
   * @throws {Error} If `input` is neither a DSL string nor a plain `toJSON()` object
   *   (for example a number, `null`, or an array). Recoverable DSL problems (unknown codes,
   *   invalid syntax) do NOT throw; they are reported in `warnings`.
   * @throws {TypeError} If `options` is provided and is not an object.
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

  /**
   * Warnings generated during parsing/rendering (unknown codes, invalid syntax, etc.).
   * Populated at construction and re-derived on each rebuild. NOT exhaustive: a few
   * structural operations discard data without a warning (e.g. `mergeWithNext()` drops
   * the absorbed word's options and `^` head marker), so an empty array is not a
   * guarantee of zero data loss across every mutation path.
   */
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

  /**
   * Appends a new glyph group with automatic space management. An omitted,
   * empty, or whitespace-only `code` appends an empty group.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  addGroup(code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Appends a glyph to the last non-space group (creates one if empty). An
   * omitted, empty, or whitespace-only `code` appends an empty glyph
   * (`{parts: []}`). On an empty builder the glyph is validated first, then
   * wrapped in a new group, so a rejected code leaves the builder untouched
   * and `opts` land on the glyph itself.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` parses to anything but exactly one glyph:
   *   multi-glyph codes (including defined word names) and multi-group codes
   *   throw, as do artifacts from above the glyph (document options
   *   `[opts]||`, word options `[opts]|`, a word indicator list `;;`, or a
   *   code that fails to parse as a word). Use `addGroup()` for word content.
   */
  addGlyph(code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Appends a part to the last non-space group's last glyph. If that group
   * has no glyphs, the part is wrapped in a new glyph; on an empty builder
   * the part is validated first, then wrapped in a new group and glyph, so
   * a rejected code leaves the builder untouched and `opts` land on the
   * part itself. A part references a shape, so `code` is required: to
   * reserve an empty slot, use `addGlyph('')`.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` is empty or whitespace-only (a part cannot be
   *   empty), parses to anything but exactly one part (a multi-part
   *   composition takes one call per part; a word is kept as a failed part
   *   with a `WORD_AS_PART` warning instead of throwing), or carries an
   *   artifact from above the part: document options `[opts]||`, word
   *   options `[opts]|`, a word indicator list `;;`, a head marker `^`, or
   *   a code that fails to parse as a word.
   */
  addPart(code: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Inserts a group at the given index. Negative indices count from the end.
   * An omitted, empty, or whitespace-only `code` inserts an empty group.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  insertGroup(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the group at the given index. Negative indices count from the end. */
  removeGroup(index: number): this;

  /**
   * Replaces the group at the given index with new content. Negative indices
   * count from the end. An omitted, empty, or whitespace-only `code` swaps the target for an
   * empty group. Out-of-range indices remain a silent no-op (checked before
   * the code is parsed).
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  replaceGroup(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Merges another builder's content into this one. Appends the other builder's groups
   * with a space between. The other builder's global options are discarded.
   * @throws {Error} If `other` is not a `BlissSVGBuilder` instance.
   */
  merge(other: BlissSVGBuilder): this;

  /**
   * Splits this builder at the given group index. This builder keeps the left half;
   * a new builder with the right half is returned. Both share the same global options.
   * @throws {Error} If the builder has fewer than 2 groups, or `groupIndex` is out of
   *   range (must be 1 to groupCount-1 inclusive).
   */
  splitAt(groupIndex: number): BlissSVGBuilder;

  /**
   * Appends a raw group with no automatic space management. SP auto-resolves
   * to TSP/QSP. An omitted, empty, or whitespace-only `code` appends an empty group.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  addElement(code?: string, opts?: BlissOptions | OptionLayers): this;

  /**
   * Inserts a raw group at the given index with no automatic space management.
   * SP auto-resolves. An omitted, empty, or whitespace-only `code` inserts an empty group.
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  insertElement(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

  /** Removes the raw group at the given index (plain splice, no space cleanup). */
  removeElement(index: number): this;

  /**
   * Replaces the raw group at the given index with new content. An omitted,
   * empty, or whitespace-only `code` swaps the target for an empty group.
   * Out-of-range indices
   * remain a silent no-op (checked before the code is parsed).
   * @throws {TypeError} If `code` is provided and is not a string.
   * @throws {TypeError} If `opts` is provided and is not an object.
   * @throws {Error} If `code` does not parse to exactly one group, or
   *   carries document-level options (`[opts]||`).
   */
  replaceElement(index: number, code?: string, opts?: BlissOptions | OptionLayers): this;

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
   * @param options - Pass `{ overwrite: true }` to replace existing custom definitions.
   *   Built-in definitions cannot be overwritten (the entry lands in `errors`).
   *
   * Does NOT throw: each entry is validated independently, and any rejection is reported
   * in `result.errors` (other entries in the same call still register). Always inspect
   * the returned `{ defined, skipped, errors }`. Rejected entries include names with
   * invisible characters, the reserved names (`X` + letters, `RK`, `AK`, `SP`), and
   * a define that would make an existing glyph definition bake an indicator (deferred
   * validation of a forward reference).
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

  /**
   * Removes a custom definition. Returns `false` (no throw) if the code does not exist.
   * @throws {Error} If `code` is a built-in definition (built-ins cannot be removed).
   */
  static removeDefinition(code: string): boolean;

  /**
   * Patches properties on an existing custom definition.
   * Only keys valid for the definition's type are accepted.
   * Built-in definitions cannot be patched.
   * @throws {Error} If `code` is not defined or is built-in, `changes` is not an object,
   *   or a change violates the definition rules: an unknown property or internal/type
   *   flag (e.g. `type`, `isBuiltIn`) for the definition;
   *   `getPath` not a function; empty, whitespace-only, or non-string `codeString`; a `;;` in `codeString`;
   *   a `/` in a glyph-or-shape `codeString`; a disallowed reference type; a circular
   *   reference; a `;`-part that is itself a composition; a glyph `codeString` that
   *   bakes an indicator (or an `isIndicator` change that leaves one baked); internal
   *   coordinates in a multi-character bare `codeString` (kerning markers allowed);
   *   a patch that would turn an already-referenced code into an indicator; or a
   *   global-only `defaultOptions` key.
   */
  static patchDefinition(code: string, changes: Partial<CodeDefinition>): { patched: true };
}

/**
 * Library version string (set at build time).
 * Also accessible as the `BlissSVGBuilder.LIB_VERSION` static.
 */
export declare const LIB_VERSION: string;

export default BlissSVGBuilder;
