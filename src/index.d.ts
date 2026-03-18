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

  // SVG pass-through attributes (any key not in the known set)
  [key: string]: string | number | undefined;
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

/** Snapshot type identifiers. */
export type ElementType =
  | 'root'
  | 'group'
  | 'glyph'
  | 'characterPart'
  | 'shape'
  | 'part';

/** A frozen, read-only snapshot of an element in the composition tree. */
export interface ElementSnapshot {
  readonly key: string;
  readonly type: ElementType;
  readonly codeName: string;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly advanceX: number;
  readonly baseWidth: number;
  readonly level: number;
  readonly bounds: ElementBounds;
  readonly isIndicator: boolean;
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

/** Level of an element in the composition tree. */
export type HandleLevel = 'group' | 'glyph' | 'part';

/**
 * A live handle referencing a node in the raw composition object.
 * Returned by `getElementByKey()`, `group()`, `glyph()`, and `part()`.
 * Mutations through a handle trigger a rebuild of the composition.
 */
export declare class ElementHandle {
  /** The structural level of this element. */
  readonly level: HandleLevel;

  /** The code name of this element. */
  readonly codeName: string;

  /** Whether this part is an indicator. Only true on part-level handles. */
  readonly isIndicator: boolean;

  // --- Dimensions (read-only, from snapshot) ---

  /** Absolute x position of this element's origin. */
  readonly x: number;
  /** Absolute y position of this element's origin. */
  readonly y: number;
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

  /** Replaces all indicators on this glyph with the given indicator codes. Preserves semantic indicators by default. Only valid on glyph handles. */
  applyIndicators(codes: string, opts?: { stripSemantic?: boolean }): this;

  /** Removes all grammatical indicators from this glyph. Preserves semantic indicators by default. Only valid on glyph handles. */
  clearIndicators(opts?: { stripSemantic?: boolean }): this;

  /** Applies indicators to the head glyph of this group. Preserves semantic indicators by default. Only valid on group handles. */
  applyHeadIndicators(codes: string, opts?: { stripSemantic?: boolean }): this;

  /** Removes grammatical indicators from the head glyph of this group. Preserves semantic indicators by default. Only valid on group handles. */
  clearHeadIndicators(opts?: { stripSemantic?: boolean }): this;

  // --- Mutation: space/word structure ---

  /** Splits this word group into two at the glyph boundary, inserting a space between. Only valid on group handles. */
  splitAt(glyphIndex: number): this;

  /** Merges this word group with the next one, removing spaces between them. Only valid on group handles. */
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

/** Definition for a custom glyph (composed from existing codes). */
export interface GlyphDefinition {
  type?: 'glyph';
  codeString: string;
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

/** Definition for an external glyph (custom rendering around a glyph). */
export interface ExternalGlyphDefinition {
  type: 'externalGlyph';
  getPath: (ctx: ShapeContext) => string;
  width: number;
  glyph: string;
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

/** Normalized parsed structure returned by `toJSON()`. */
export interface BlissJSON {
  options?: Record<string, string>;
  groups: Array<{
    options?: Record<string, string>;
    glyphs?: Array<{
      codeName?: string;
      options?: Record<string, string>;
      isHeadGlyph?: boolean;
      parts?: Array<{
        codeName: string;
        options?: Record<string, string>;
        x?: number;
        y?: number;
        parts?: Array<any>;
      }>;
    }>;
  }>;
}

// --- Warnings ---

/** A warning generated when the builder encounters an unknown or invalid code. */
export interface Warning {
  /** Warning type identifier (e.g., 'UNKNOWN_CODE'). */
  readonly code: string;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** The problematic DSL code that triggered the warning. */
  readonly source: string;
}

// --- Builder stats ---

export interface BuilderStats {
  groupCount: number;
  glyphCount: number;
  /** @deprecated Use `groupCount` instead. */
  wordCount: number;
  /** @deprecated Use `glyphCount` instead. */
  characterCount: number;
}

// --- Main class ---

export declare class BlissSVGBuilder {
  /**
   * Creates an instance of BlissSVGBuilder.
   * @param input - A DSL string, a plain object from `toJSON()`, or omitted for an empty builder
   * @param options - Defaults/overrides to merge, or flat options treated as overrides
   */
  constructor(input?: string | BlissJSON, options?: BlissOptions | OptionLayers);

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

  /** Non-space group snapshots (words only). */
  readonly words: readonly ElementSnapshot[];

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
   */
  toString(options?: { preserve?: boolean }): string;

  /**
   * Returns a normalized parsed structure (plain object). Custom glyph codes
   * are resolved to built-in codes by default; pass `{ preserve: true }` to keep them.
   */
  toJSON(options?: { preserve?: boolean; deep?: boolean }): BlissJSON;

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

/** Library version string (set at build time). */
export declare const LIB_VERSION: string;
