/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// --- Options ---

/**
 * Known option keys accepted by BlissSVGBuilder, named the way JavaScript
 * writes them.
 *
 * Spelling carries no meaning: the library accepts either casing of one of its
 * own options on every channel and resolves the two to one option. These rows
 * are camelCase because that is the spelling `toJSON()` publishes and the one a
 * JavaScript caller writes; the kebab spelling a DSL bracket carries still
 * typechecks, falling back to the index signature below and losing only the
 * inline hint and the value type.
 *
 * The value types are the rule the library applies at runtime rather than a
 * narrowing of it, and it is one rule for every option here and every option
 * added later. An option value has to be something with a text form, so a
 * `null`, an `undefined` or anything that is not a primitive is refused on the
 * way in: it reports `INVALID_OPTION_VALUE` and does not enter the composition,
 * so it is absent from `toString()` and `toJSON()` and the picture is drawn as
 * if it had never been written. This holds wherever the value came from: a
 * composition object, the constructor's second argument, a mutation setter, or
 * a definition's `defaultOptions`.
 *
 * A value that IS text but wrong for the option (`{ crop: 'nope' }`) is kept
 * instead, because you can read it and correct it. It is reported, ignored when
 * drawing, saved with the composition, and reported again each time that
 * composition is loaded.
 *
 * Position and kerning follow the same rule under their own codes,
 * `MALFORMED_COORDINATES` and `MALFORMED_KERNING_VALUE`. Two options are left
 * alone whatever they hold: a switch (`grid`, `center`, `errorPlaceholder`) is
 * on only when it is exactly `true`, so any other value already means off, and
 * `key` names the element and reaches neither the picture nor the saved text.
 */
export interface BlissOptions {
  // Stroke and spacing
  strokeWidth?: number;
  dotExtraWidth?: number;
  sdotExtraWidth?: number;
  dotWidth?: number;
  sdotWidth?: number;
  charSpace?: number;
  wordSpace?: number;
  externalGlyphSpace?: number;

  // Margins (builder-level)
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;

  // Sizing
  minWidth?: number;
  center?: boolean;

  // Positioning (element-level, not builder-level). `x` at part scope is the
  // part's position inside its character, the same value as the `CODE:x,y`
  // suffix; at character scope it is leading blank owned by that character.
  // The two kerning options are the `RK:`/`AK:` markers written as options.
  x?: number;
  y?: number;
  relativeKerning?: number;
  absoluteKerning?: number;

  // Cropping (builder-level)
  crop?: number | 'auto' | 'auto-vertical' | 'compact';
  cropTop?: number | 'auto';
  cropBottom?: number | 'auto';
  cropLeft?: number | 'auto';
  cropRight?: number | 'auto';

  // Grid (builder-level)
  grid?: boolean;
  gridColor?: string;
  gridMajorColor?: string;
  gridMediumColor?: string;
  gridMinorColor?: string;
  gridSkyColor?: string;
  gridEarthColor?: string;
  gridStrokeWidth?: number;
  gridMajorStrokeWidth?: number;
  gridMediumStrokeWidth?: number;
  gridMinorStrokeWidth?: number;
  gridSkyStrokeWidth?: number;
  gridEarthStrokeWidth?: number;

  // Colors and background
  color?: string;
  background?: string;
  backgroundTop?: string;
  backgroundMid?: string;
  backgroundBottom?: string;

  // Text and metadata
  text?: string;
  svgDesc?: string;
  svgTitle?: string;
  svgHeight?: number;

  // Error handling
  errorPlaceholder?: boolean;

  // Element identity: the name `getElementByKey()` finds this element by. Set it
  // on a handle (`setOptions({ key: 'subject' })`), in a composition object, or
  // in a DSL bracket at element scope. It is identity rather than appearance, so
  // it changes nothing about the picture and is not published by either
  // serializer; written at document scope it names nothing and is dropped.
  key?: string;

  // SVG pass-through attributes: any key not in the known set. A name an SVG or
  // ARIA standard owns is emitted under that owner's spelling whichever way it
  // was written (`strokeDasharray` and `stroke-dasharray` both set
  // `stroke-dasharray`); a name nobody owns is emitted exactly as written, and a
  // `<target>--` key is always literal. At global scope a bare key lands on the
  // root <svg>; `<target>--<attribute>` lands on the elements carrying that
  // class, where a target is any class the library writes minus the `bliss-`
  // prefix and the key splits at the LAST `--`
  // (`'grid-line--sky--stroke-dasharray': 2`). At element scope the key lands on
  // that element's own <g>; a target prefix has nothing to name there, so it is
  // dropped and reported with `MISPLACED_LAYER_OPTION`, however it was written,
  // or with the refusal its name would get at global scope when it would get
  // one there too (`UNKNOWN_LAYER` for `nosuch--fill`).
  // Includes `boolean` so the boolean options (`grid`, `center`,
  // `errorPlaceholder`) conform to the index signature; without it `tsc` rejects
  // this interface. It is also what keeps the kebab spelling of a curated option
  // compiling after those rows moved to camelCase.
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
   * the live identity; what serialized output emits for a custom name is
   * governed by `toString()`/`toJSON()` and their `preserve` option.
   */
  readonly codeName: string;
  /**
   * The rendered Unicode character for an external glyph (e.g. `'a'` for
   * `Xa`, `'α'` for `Xα`), also when the letter carries a part, a position
   * or an option (`Xa;B86`, `Xa:1`), which keep its spacing too. `''` for
   * B-codes, other composites, shape primitives, multi-character text
   * fallback, and non-glyph levels.
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
   * the live identity; what serialized output emits for a custom name is
   * governed by `toString()`/`toJSON()` and their `preserve` option.
   */
  readonly codeName: string;

  /**
   * The rendered Unicode character for an external glyph (e.g. `'a'` for
   * `Xa`, `'α'` for `Xα`), also when the letter carries a part, a position
   * or an option (`Xa;B86`, `Xa:1`), which keep its spacing too. `''` for
   * B-codes, other composites, shape primitives, multi-character text
   * fallback, and non-glyph levels.
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
   * `'word'` on the resolved `snapshot()` tree instead (see
   * `ElementSnapshot.indicatorLevel`).
   */
  readonly indicatorLevel: 'character' | null;

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
  applyIndicators(code?: string | null, opts?: { stripSemantic?: boolean; flatten?: boolean }): this;

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
   *
   * A key that cannot act at this element's level is dropped with the warning
   * the same key gets in a bracket there: a canvas-wide option such as `margin`
   * (`MISPLACED_GLOBAL_OPTION`), kerning anywhere but a character
   * (`MISPLACED_KERNING_OPTION`), a target-prefixed key such as `grid--opacity`
   * (`MISPLACED_LAYER_OPTION`, or the refusal its name would get at global
   * scope when it would get one there too). It is not stored, so it is never
   * saved.
   * @throws {TypeError} If `opts` is provided and is not an object.
   */
  setOptions(opts: BlissOptions | OptionLayers): this;

  /**
   * Removes specific option keys from this element. A name the library or a
   * standard owns is removed in either spelling; a name of your own is removed
   * under exactly the spelling you set it with.
   *
   * Naming `x` or `y` removes the position, whichever spelling wrote it: a
   * part's `CODE:x,y` coordinate and an `[x=N]` option are two spellings of one
   * value. Only this element's own position, never one on an element below it.
   * `clearOptions()` differs here: it leaves a part's coordinates, and a
   * character's kerning, in place.
   *
   * The options a code brings by its definition are part of the code and are
   * not removed: a built-in's own look (the dotted line `REFSQUARE` and
   * `ANCHORRING` draw with), and a custom definition's `defaultOptions` or the
   * bracket that starts its `codeString`. Naming one of those keys returns it
   * to the definition's value. To change it, override it instead:
   * `[stroke-dasharray=none]>REFSQUARE` draws the square solid.
   *
   * Naming no key at all asks for nothing and is not an error. Every key is
   * read before any is removed, so a call that throws has changed nothing.
   *
   * @throws {TypeError} If any key is not a string.
   */
  removeOptions(...keys: string[]): this;

  /**
   * Removes this element's options: what `toString()` writes for it inside a
   * `[...]` bracket. A word or a character loses its position with them, and a
   * word also loses the options inside its word-level (`;;`) indicators. A part
   * keeps its coordinates and a character its kerning, since the string writes
   * those outside a bracket (`C8:3,4`, `RK:2`), unlike `removeOptions('x')`,
   * which removes a part's coordinate too.
   *
   * What sits inside the element keeps its own options, so a character's parts
   * stay styled. `key` and transient options are untouched, and so are the
   * options a code brings by its definition (see `removeOptions`). Clearing an
   * element that has no options is not an error.
   */
  clearOptions(): this;

  /**
   * Sets transient options on this element: values that reach the rendered SVG
   * and never reach `toString()` or `toJSON()`. Use for anything describing the
   * current view rather than the composition, such as hit-test annotations or a
   * selection highlight.
   *
   * A transient value wins over a normal option of the same key. Above the key,
   * the ordinary precedence still applies unchanged: an explicitly-named
   * attribute beats an alias of it, and a specific option beats a bulk one.
   *
   * Keys the library reads while building the composition rather than while
   * drawing it (`x`, `y`, either kerning option in either spelling, and `key`)
   * are refused with a `MISPLACED_TRANSIENT_OPTION` warning, and an unusable
   * attribute name with `UNSAFE_ATTRIBUTE_NAME`. A space carries no decoration
   * in this channel either, matching `MISPLACED_SPACE_DECORATION`. A key that
   * cannot act at this element's level is refused as `setOptions` refuses it:
   * `minWidth` on a character reports `MISPLACED_GLOBAL_OPTION`, since it sizes
   * the whole SVG and belongs on the builder's own `setTransientOptions`.
   *
   * @throws {TypeError} If `opts` is provided and is not an object.
   */
  setTransientOptions(opts: BlissOptions): this;

  /**
   * Removes specific transient option keys from this element, reading a name
   * exactly as `removeOptions` reads it.
   *
   * @throws {TypeError} If any key is not a string.
   */
  removeTransientOptions(...keys: string[]): this;
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
  type: 'glyph';
  /**
   * A glyph is a single character, so this may not be a multi-character word:
   * neither a `/` nor an external-letter run standing for several letters
   * (`XOH` is shorthand for `XO/XH`). Define a word as a {@link BareDefinition}
   * alias. A run that renders as one text element (`Xaλ`, where a letter has no
   * embedded outline) is a single character and is accepted.
   *
   * A character bracket at its start (`[color=red]B291`, no `>` after it)
   * gives the definition options of its own, exactly as `defaultOptions`
   * does, and wins where both set a key. It refuses the keys `defaultOptions`
   * refuses.
   */
  codeString: string;
  /**
   * Marks an all-indicator definition as a compound indicator. Valid only on a
   * `type: 'glyph'` definition; on a bare alias, shape, or external glyph
   * `define()` reports a violation in its `errors` result. Indicator-ness still
   * rides through an unflagged bare alias whose target is itself an indicator
   * (e.g. `{ codeString: 'B81' }`).
   */
  isIndicator?: boolean;
  /**
   * Adjusts the anchor point an indicator attached to this glyph is placed
   * against. A glyph whose `codeString` draws one code takes that code's value
   * where it sets none of its own, so it places indicators as that code does.
   */
  anchorOffsetX?: number;
  /** See {@link GlyphDefinition.anchorOffsetX}; each axis is taken on its own. */
  anchorOffsetY?: number;
  width?: number;
  shrinksPrecedingWordSpace?: boolean;
  kerningRules?: Record<string, any>;
  /**
   * The definition's own options. They are the options of the part the code
   * is, so they style what the definition draws and never a part added beside
   * it. An option written on the character, the word or the whole composition
   * does not override them; a part bracket where the code is used does
   * (`[color=blue]>MYGLYPH`). They stay through `clearOptions()` and
   * `removeOptions()`, and a save that keeps the name does not write them.
   *
   * Keys must be well-formed option names (letters, digits, hyphens; names
   * beginning with `on` are rejected, as for any attribute), and two kinds of
   * key are refused:
   * - One that acts on the whole SVG: a global-only (builder-canvas) key such
   *   as `margin` or `grid`, or a target-prefixed key such as `content--fill`
   *   or `grid-line--sky--stroke`. It would be inert on a definition.
   *   `autoVertical` and `cropCompact`, the library's internal names for two
   *   `crop` values, are refused on the same ground.
   * - One that belongs to a single use of the character: a position (`x`,
   *   `y`), kerning (`relativeKerning`, `absoluteKerning`, in either spelling)
   *   or `key`. A definition says what a character is, so write these where
   *   the code is used.
   *
   * `define()` reports a violation in its `errors` result, and
   * `patchDefinition()` throws.
   *
   * This is a programmatic surface, so a curated option may be written in
   * camelCase (`{ strokeWidth: 2 }`) and is stored under its `stroke-width`
   * spelling, exactly as the constructor's options argument does it. Any other
   * name is stored as written, because only names the library owns in both
   * spellings can be translated without guessing: `preserveAspectRatio` is
   * genuinely camelCase in SVG, and `stroke-dasharray` genuinely hyphenated, so
   * each must be written the way SVG spells it.
   */
  defaultOptions?: BlissOptions;
}

/** Definition for a custom shape, drawn by `getPath` or by `codeString`, not both (`define()` keeps `getPath`; `patchDefinition()` refuses a patch leaving both). */
export interface ShapeDefinition {
  type?: 'shape';
  /** `isIndicator` is glyph-only; forbidding it makes the union reject a typeless flagged literal at compile time (the runtime rejects it too). */
  isIndicator?: never;
  getPath?: (ctx: ShapeContext) => string;
  /** A shape is a single character; the rules of {@link GlyphDefinition.codeString} apply, its leading bracket included. */
  codeString?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  extraPathOptions?: Record<string, any>;
  /** The shape's own options, exactly as for a glyph, refusing the same keys (see {@link GlyphDefinition.defaultOptions}). */
  defaultOptions?: BlissOptions;
}

/** Definition for an external glyph (custom rendering around a Unicode character). */
export interface ExternalGlyphDefinition {
  type: 'externalGlyph';
  /** `isIndicator` is glyph-only; forbidding it makes the union reject a typeless flagged literal at compile time (the runtime rejects it too). */
  isIndicator?: never;
  getPath: (ctx: ShapeContext) => string;
  width: number;
  /** The rendered Unicode character (e.g. `'a'` for the external glyph registered as `'Xa'`). */
  char: string;
  y?: number;
  height?: number;
  kerningRules?: Record<string, any>;
  /** The glyph's own options, exactly as for a {@link GlyphDefinition}, refusing the same keys (see {@link GlyphDefinition.defaultOptions}). */
  defaultOptions?: BlissOptions;
}

/** Bare alias definition (maps a code name to a code string). */
export interface BareDefinition {
  /**
   * The code string the name stands for. Where it draws one character, a
   * character bracket at its start gives the alias options of its own, as for
   * {@link GlyphDefinition.codeString}; over a word it styles the first
   * character, as written.
   */
  codeString: string;
  /** `isIndicator` is glyph-only; forbidding it makes the union reject a typeless flagged literal at compile time (the runtime rejects it too). */
  isIndicator?: never;
  /**
   * Options for every part the alias draws, in every character of every word
   * it spells, never for the character itself. Where the alias names one code
   * they stay with that code as a glyph's own options do (see
   * {@link GlyphDefinition.defaultOptions}); where it spells several codes
   * they are ordinary options of the parts, which a clear removes. The keys a
   * glyph definition refuses are refused here too.
   */
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
  /**
   * Non-fatal reports about definitions that WERE registered, so this is never
   * a reason to treat the call as failed; `errors` is. Currently carries
   * `MULTIPLE_OPTION_SPELLINGS` when one `defaultOptions` bag writes one option
   * under two spellings: the last value written wins and the displaced one is
   * named here. Each message is prefixed with the code it came from, since one
   * call can define many.
   */
  warnings: Warning[];
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
 * on indicator parts. Definition-derived metadata (glyph
 * `isBlissGlyph`/`isExternalGlyph`/`char`/`kerningRules`/
 * `shrinksPrecedingWordSpace` and the glyph-level `isIndicator` flag, plus part
 * `anchorOffsetX`/`anchorOffsetY`) is omitted — it is fully re-derived from the
 * code when this object is passed back to the constructor. The one exception is
 * a glyph with no code of its own to re-derive it from, such as a
 * multi-character text fallback (`Xhαllo`) or a glyph whose option binds to its
 * part (`[color=red]>Xm`); there the metadata is written out so the
 * reconstruction still lays the glyph out the same way. `{ deep: true }`
 * retains that metadata plus nested sub-parts for `toString()`/`merge()`; those
 * extra fields are not part of this type.
 *
 * A word the parser rejects outright (a malformed `;;` word indicator) is
 * dropped from `groups` entirely; its parse warning is the only trace.
 *
 * Option keys come back under their owner's spelling: one of the library's own
 * options in the camelCase spelling JavaScript writes (`strokeWidth`,
 * `marginTop`), a name a standard owns in the spelling that standard publishes
 * (`viewBox`, `stroke-dasharray`, `aria-label`), and a name nobody owns exactly
 * as it was written. A `<target>--attribute` key means its attribute literally
 * and is never rewritten. Either spelling is accepted back on input, so this
 * object round-trips through the constructor whichever way it was authored.
 * `toString()` is the DSL's view of the same composition and spells the
 * library's own options the way a bracket carries them.
 *
 * A position is published as `x`/`y` beside the element that carries it, at the
 * scope that wrote it, and never inside that element's options bag. Every way
 * of authoring one converges here: a `CODE:x,y` coordinate (the spelling only a
 * part has), an `[x=N]` bracket, an `x` field on the element, and an `x` inside
 * its options. An axis is present when it was written and absent when it was
 * not, so a written `0` is a position and `undefined` means no position; the
 * two axes are independent. An options bag left holding nothing but a usable
 * position is omitted rather than published empty, except on the composition
 * itself, which always carries a bag. A bag emptied any other way is published
 * as it stands, so a refused value (`[x=abc]`, an `INVALID_OPTION_VALUE` or
 * `MALFORMED_COORDINATES` case) can leave `options: {}` behind.
 */
export interface BlissJSON {
  /**
   * A value keeps the type it was authored with. The options argument and a DSL
   * bracket both arrive as text, so they publish strings; a composition object
   * is stored as written, so `{ marginTop: 1 }` comes back as `1` rather than
   * `"1"`; a switch stays boolean. The type is stable across round trips in
   * either direction, so nothing silently converts. Narrow on `typeof` before
   * using a value as text.
   */
  options?: Record<string, string | number | boolean>;
  /**
   * Transient options: values that reach the rendered SVG and never reach
   * `toString()` or `toJSON()`. Accepted on INPUT at any level, and by design
   * never present on output — round-tripping a builder through its own JSON
   * therefore drops them, and the consumer re-applies. Valid at every level
   * below.
   */
  transientOptions?: Record<string, string | number | boolean>;
  /** The composition's own position (the `[x=N]||` scope). */
  x?: number;
  y?: number;
  groups: Array<{
    options?: Record<string, string | number | boolean>;
    transientOptions?: Record<string, string | number | boolean>;
    /** The word's own position (the `[x=N]|` scope). */
    x?: number;
    y?: number;
    /**
     * Word-level indicator overlay (the DSL `;;` form): stored on the word and
     * resolved onto the head glyph at render. Present in default output (kept
     * by default); absent when there is no word-level indicator.
     */
    wordIndicators?: { codes: string[]; stripSemantic: boolean };
    glyphs?: Array<{
      codeName?: string;
      options?: Record<string, string | number | boolean>;
      transientOptions?: Record<string, string | number | boolean>;
      /** The character's own position (the `[x=N]` scope, `x` being its leading blank). */
      x?: number;
      y?: number;
      isHeadGlyph?: boolean;
      /**
       * Classification metadata, present only on a glyph that has no `codeName`
       * to re-derive it from (see the interface comment). Read back on
       * reconstruction; do not author it by hand on a glyph that has a code.
       */
      isBlissGlyph?: boolean;
      isExternalGlyph?: boolean;
      char?: string;
      kerningRules?: Record<string, number>;
      shrinksPrecedingWordSpace?: boolean;
      isIndicator?: boolean;
      parts?: Array<{
        codeName: string;
        options?: Record<string, string | number | boolean>;
        transientOptions?: Record<string, string | number | boolean>;
        /** Present (true) only on an indicator part. */
        isIndicator?: boolean;
        /** Rendered indicator width; present only on an indicator part. */
        width?: number;
        /** The part's position inside its character (the `CODE:x,y` scope). */
        x?: number;
        y?: number;
        /**
         * Fail metadata retained when a known composition sits in a `;`-part
         * slot (`COMPOSITE_AS_PART` / `WORD_AS_PART`): the part is kept and
         * warned, and both fields round-trip through the constructor.
         */
        error?: string;
        errorCode?: WarningCode;
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
  | 'INVALID_OPTION_VALUE'
  | 'OUT_OF_RANGE_OPTION_VALUE'
  | 'OUT_OF_RANGE_COMPUTED_GEOMETRY'
  | 'MISPLACED_HEAD_MARKER'
  | 'MISPLACED_CHARACTER_INDICATOR'
  | 'MISPLACED_WORD_INDICATOR'
  | 'MISPLACED_PART_OPTION'
  | 'MISPLACED_CHARACTER_OPTION'
  | 'MISPLACED_GROUP_OPTION'
  | 'MISPLACED_GLOBAL_OPTION'
  | 'MISPLACED_KERNING_OPTION'
  | 'MISPLACED_LAYER_OPTION'
  | 'MISPLACED_LINK_ATTRIBUTE'
  | 'MISPLACED_CONTAINER_ATTRIBUTE'
  | 'MISPLACED_SPACE_DECORATION'
  | 'MISPLACED_INDICATOR_PART'
  | 'MISPLACED_SPACE'
  | 'MISPLACED_OPTION_SPELLING'
  | 'MULTIPLE_HEAD_MARKERS'
  | 'MULTIPLE_OPTION_BRACKETS'
  | 'MULTIPLE_OPTION_SPELLINGS'
  | 'MULTIPLE_POSITION_VALUES'
  | 'MULTIPLE_KERNING_VALUES'
  | 'MULTIPLE_GEOMETRY_VALUES'
  | 'MULTIPLE_ATTRIBUTE_VALUES'
  | 'DUPLICATE_KEY'
  | 'UNKNOWN_CODE'
  | 'UNKNOWN_LAYER'
  | 'DROPPED_WORD_INDICATOR'
  | 'UNSUPPORTED_TEXT_BLOCKS'
  | 'NOOP_INDICATOR_MUTATION'
  | 'UNSAFE_ATTRIBUTE_NAME'
  | 'RESERVED_ATTRIBUTE_NAME'
  | 'MISPLACED_TRANSIENT_OPTION'
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
  /**
   * The part of your input the warning is about. Its SHAPE follows the code
   * rather than one rule, so match on `code` first and read `source` as scoped
   * to what that code reports. For an attribute it is usually the KEY on its
   * own, prefix included, where the attribute itself is what is wrong (a
   * refused name, `content--xmlns`; a key whose value cannot take effect where
   * it landed, `grid--stroke`; the displaced half of a raw-versus-curated
   * collision, `grid-sky-color`), and usually the OPTION AS WRITTEN where the
   * option is (a refused value, `stroke-width=-2`; a key at a scope that cannot
   * use it, `grid--opacity=0.3`). Other codes point at the spelling they are
   * about instead: several option names comma-separated (`margin, crop-top`), a
   * coordinate suffix (`:1`), a whole bracket (`[color=red]`), or, where the
   * input could not be parsed as a code at all, the parser's description of what
   * it read (`Invalid format: B291[x=1]`) rather than a substring of the input.
   * It is the EMPTY string only where the report is about a computed result and
   * no written key produced it (`OUT_OF_RANGE_COMPUTED_GEOMETRY`, when the size
   * comes from the content rather than from an option); the message stands on
   * its own there.
   */
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

  /**
   * Removes every option at every scope, the global bracket included: what
   * `toString()` writes inside `[...]` brackets. Afterwards the builder saves
   * what `toString({ omitOptions: true })` saved before, with either
   * serializer. The positions of characters, words and the whole composition
   * go with the rest; a part's coordinates and a character's kerning stay.
   * `key`s and transient options are untouched, and so are the options a code
   * brings by its definition (the dotted line of `REFSQUARE`, a custom
   * definition's `defaultOptions`; see `ElementHandle.removeOptions`).
   */
  clearAllOptions(): this;

  // --- Serialization ---

  /**
   * Returns a portable DSL string. Custom codes are decomposed to built-in
   * codes by default, the options a definition gives written as part brackets
   * on what they style (`[color=red]>B291`); a shape drawn by its own `getPath`
   * function, or an external glyph, has no built-in form and keeps its name.
   * `{ preserve: true }` keeps a custom name that stands for a single glyph,
   * indicator, or shape: every `type`d definition (whatever its anatomy) and
   * every bare alias renaming one existing code; multi-code shorthand always
   * serializes expanded. A name is kept only where reading it back draws what
   * you have: a change made where the name is used is written beside it
   * (`[color=blue]>MYGLYPH`, `MYGLYPH:3,4`, `MYGLYPH;B81`), the options its
   * definition gives are not repeated, and a glyph the name no longer
   * describes (such as a composition object whose parts are not the ones the
   * definition draws) is written out in full.
   *
   * A position or a head marker appears where needed to keep an indicator
   * where it was drawn: on an indicator the built-in codes alone would draw
   * elsewhere, on that part and axis only (`B291;B81:,2` for a glyph whose own
   * anchor sits 2 lower than `B291`'s), and on the character that carries a
   * word's `;;` indicators where a reload would pick another head
   * (`B937^/B291;;B81`). A `;;` code named by a custom definition is written
   * as the built-in indicator codes it draws, or by its name where no
   * built-in code can stand in for it (an indicator drawn from a plain shape).
   *
   * The output uses the compact shorthand wherever it means the same thing: a
   * space that matches the default for its position is written as a bare
   * separator (`H//QSP/H`, not `H/TSP/QSP/H`), and consecutive single external
   * letters are written as one word (`Xhello`, not `Xh/Xe/Xl/Xl/Xo`). An
   * element that diverges stays explicit, and the rendered result is the same
   * either way. A position is likewise written one way whichever spelling
   * authored it: the number is normalized (`[x=5.0]` and `[x=+5]` come back as
   * `[x=5]`) and it leads the option keys in its bracket. A kerning value is not
   * an option key: it is written as its marker in front of the bracket
   * (`[absolute-kerning=5;x=3]B291` → `AK:5/[x=3]B291`). The options a code
   * brings by its definition are part of the code, so a built-in's own look is
   * never written as options (`REFSQUARE` comes back as `REFSQUARE`, dotted line
   * and all). Output is therefore not a
   * byte-copy of the input; compare a round trip against `toString()` output,
   * not against stored text.
   *
   * `flattenIndicators` collapses word-level (`;;`) indicators onto the head
   * glyph as character-level `;`, reproducing the pre-overlay output. It is the
   * same concept as `applyIndicators(code, { flatten })`; the name is qualified
   * here only because `toString`/`toJSON` lack the "indicator" context the
   * method name provides.
   *
   * `omitOptions` saves the composition without its options, at every scope:
   * colours and other styling, canvas settings such as margins and spacing,
   * pass-through attributes, and the position of a character, a word or the
   * whole composition. A part's coordinates and a character's kerning stay,
   * since they are written outside a bracket (`[x=1]>C8` comes back as `C8:1`),
   * and so do the options a code brings by its definition, which are part of
   * the code (where a custom code is decomposed, its definition's options are
   * still written, as part brackets). A character that held nothing but
   * options goes with them, a head marker on it included. `clearAllOptions()`
   * makes the same change in place.
   */
  toString(options?: { preserve?: boolean; flattenIndicators?: boolean; omitOptions?: boolean }): string;

  /**
   * Returns a normalized parsed structure (plain object). Custom codes are
   * decomposed to built-in codes by default, wherever they are used, each
   * part carrying the options its definition gives (a shape drawn by its own
   * `getPath` function, or an external glyph, keeps its name, as in
   * `toString()`); `{ preserve: true }` keeps custom names under the same rule
   * as `toString()`. As there, a part or a `wordIndicators` code carries the
   * position it was drawn at, and a glyph `isHeadGlyph: true`, where needed to
   * keep an indicator where it was drawn, and a `;;` code named by a custom
   * definition is written as built-in codes wherever they can stand in for it.
   *
   * `flattenIndicators` bakes word-level (`;;`) indicators onto the head and
   * omits the `wordIndicators` field (see `toString`).
   *
   * `deep` keeps nested sub-parts and all definition-derived metadata (consumed
   * by `toString()`/`merge()`); the default output omits those (they are
   * re-derived from the code on reconstruction) and is the authoring shape
   * described by {@link BlissJSON}, whose option keys use each name's owner
   * spelling.
   *
   * `omitOptions` leaves out the options `toString` leaves out: no options bag
   * keeps one, and characters, words and the composition lose their `x`/`y`,
   * while a part keeps its own. Two things stay: a character's kerning, which
   * saved JSON always keeps in its options bag, and the options a code brings
   * by its definition (the dotted line of `REFSQUARE`; a custom definition's
   * options, on the parts it is decomposed into).
   */
  toJSON(options?: { preserve?: boolean; deep?: boolean; flattenIndicators?: boolean; omitOptions?: boolean }): BlissJSON;

  /**
   * Sets transient options on the whole SVG: values that reach the rendered
   * output and never reach `toString()` or `toJSON()`. Repeated calls merge.
   *
   * There is no builder-level `setOptions` counterpart: global options arrive
   * with the composition, and `clearAllOptions()` is the one call that takes
   * them away again. This channel is the transient one, so changing it after
   * construction is what it is for.
   *
   * @throws {TypeError} If `opts` is provided and is not an object.
   */
  setTransientOptions(opts: BlissOptions): this;

  /**
   * Removes transient option keys from the whole SVG. A name the library or a
   * standard owns is removed in either spelling; a name of your own is removed
   * under exactly the spelling you set it with.
   *
   * @throws {TypeError} If any key is not a string.
   */
  removeTransientOptions(...keys: string[]): this;

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
   * invisible characters, the reserved names (`X` + letters, `RK`, `AK`, `SP`),
   * a define that would make an existing glyph definition bake an indicator (deferred
   * validation of a forward reference), a `codeString` holding content no use
   * could draw: a coordinate the DSL cannot read (`C8:.`), a kerning marker used as
   * a part (`C8;RK:3`), or a glyph or shape with no character in it (`RK:3`), and
   * a key a definition cannot hold, in `defaultOptions` or in the character
   * bracket that starts a `codeString` (see {@link GlyphDefinition.defaultOptions}).
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
   *   a `/` in a glyph-or-shape `codeString`, or one that is an external-letter run
   *   standing for several letters (`XOH` is shorthand for `XO/XH`); a disallowed
   *   reference type; a circular
   *   reference; a `;`-part that is itself a composition; a glyph `codeString` that
   *   bakes an indicator (or an `isIndicator` change that leaves one baked); internal
   *   coordinates in a multi-character bare `codeString` (kerning markers allowed);
   *   a `codeString` holding content no use could draw (see {@link BlissSVGBuilder.define});
   *   a patch that would leave a shape with both `getPath` and `codeString`;
   *   a patch that would turn an already-referenced code into an indicator; or a
   *   key a definition cannot hold, in `defaultOptions` or in the character bracket
   *   that starts `codeString` (see {@link GlyphDefinition.defaultOptions}).
   */
  static patchDefinition(code: string, changes: Partial<CodeDefinition>): { patched: true; warnings: Warning[] };
}

/**
 * Library version string (set at build time).
 * Also accessible as the `BlissSVGBuilder.LIB_VERSION` static.
 */
export declare const LIB_VERSION: string;

export default BlissSVGBuilder;
