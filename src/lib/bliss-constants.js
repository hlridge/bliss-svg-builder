/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Replaced at build time by Vite's define (also available in Vitest and VitePress).
// Falls back to empty string when imported outside Vite (e.g. bare Node).
export const LIB_VERSION = typeof __LIB_VERSION__ !== 'undefined' ? __LIB_VERSION__ : '';

/**
 * Known option keys (kebab-case) that are explicitly processed in #processOptions().
 * Any option key NOT in this set will be passed through as-is (for unknown SVG attributes like stroke-dasharray).
 */
export const KNOWN_OPTION_KEYS = new Set([
  'stroke-width', 'dot-extra-width', 'sdot-extra-width', 'dot-width', 'sdot-width',
  'char-space', 'word-space', 'external-glyph-space',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'min-width', 'center',
  'crop', 'crop-top', 'crop-bottom', 'crop-left', 'crop-right',
  'grid', 'grid-color', 'grid-major-color', 'grid-medium-color', 'grid-minor-color',
  'grid-sky-color', 'grid-earth-color',
  'grid-stroke-width', 'grid-major-stroke-width', 'grid-medium-stroke-width',
  'grid-minor-stroke-width', 'grid-sky-stroke-width', 'grid-earth-stroke-width',
  'color', 'background', 'background-top', 'background-mid', 'background-bottom',
  'text', 'svg-desc', 'svg-title', 'svg-height', 'error-placeholder',
  'key'
]);

/**
 * The layers a global attribute can name with a `<layer>--<attribute>` key.
 * A bare key targets the root, so there is deliberately no `svg--`: a second
 * spelling for one target is a duplicate.
 */
export const LAYER_TARGETS = new Set(['background', 'grid', 'content']);

/**
 * The two root attributes the library owns outright, on the rule that the user
 * owns statements about the PICTURE and the library owns statements about the
 * FORMAT and about ITSELF. `xmlns` has exactly one legal value: overriding it
 * does not make a different picture, it makes a file that is not SVG, which no
 * browser renders and our own `svgElement` getter cannot parse.
 * `data-generator` is the library's provenance stamp about itself, and a stamp
 * anyone can overwrite is worth nothing to whoever reads it. A consumer
 * recording their own pipeline adds a name of their own instead.
 */
export const LIBRARY_OWNED_ROOT_ATTRIBUTES = new Set(['xmlns', 'data-generator']);

/**
 * The written options whose whole job is to compute the root's `viewBox`. When
 * an author writes the `viewBox` directly, the value these produced is replaced,
 * so they are reported as displaced rather than left to look effective.
 */
export const GEOMETRY_OPTION_KEYS = new Set([
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'crop', 'crop-top', 'crop-bottom', 'crop-left', 'crop-right',
  'min-width', 'center',
]);

/** True for a key written in the `<layer>--<attribute>` form, valid or not. */
export const isLayerAttributeKey = (key) => key.includes('--');

/**
 * Splits `grid--opacity` into its layer and its attribute. Returns null when
 * the layer is not one we emit or the attribute half is empty, so the caller
 * can report an unknown layer rather than emit a key nothing can use.
 */
export const parseLayerAttributeKey = (key) => {
  const at = key.indexOf('--');
  const layer = key.slice(0, at);
  const attribute = key.slice(at + 2);
  if (!LAYER_TARGETS.has(layer) || !attribute) return null;
  return { layer, attribute };
};

/**
 * Returns false for event handler attribute names (on*) or names containing
 * characters outside the safe allowlist to prevent XSS.
 */
export const isSafeAttributeName = (name) =>
  /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name) && !/^on/i.test(name);

/**
 * Escapes HTML special characters to prevent XSS in SVG output.
 */
export const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Converts a camelCase string to kebab-case.
 * e.g., strokeWidth → stroke-width, gridSkyColor → grid-sky-color
 * Single-word keys (color, grid, margin) pass through unchanged.
 */
export const camelToKebab = (str) => str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());

// The long-form kerning options are curated vocabulary too, but they are absent
// from KNOWN_OPTION_KEYS because that set lists what #processOptions dispatches
// on, and kerning is promoted by the parser instead. Their canonical spelling is
// the kebab one a bracket carries, so the API's camelCase form has to translate
// like every other named option. (INTERNAL_OPTIONS lists all four spellings for
// a different reason: keeping them out of the emitted markup.)
const KERNING_OPTION_SPELLINGS = new Set(['relative-kerning', 'absolute-kerning']);

/**
 * True when a key belongs to the curated option vocabulary, in either spelling.
 *
 * Only these keys are translated between camelCase and kebab-case. An attribute
 * name is emitted exactly as written, because hyphenating an arbitrary name is a
 * guess: it is right for our own vocabulary, where we own both spellings, and
 * wrong for every camelCase SVG attribute (preserveAspectRatio, viewBox,
 * gradientUnits) and every camelCase data attribute.
 */
export const isNamedOptionKey = (key) => {
  if (KNOWN_OPTION_KEYS.has(key)) return true;
  const kebab = camelToKebab(key);
  return KNOWN_OPTION_KEYS.has(kebab) || KERNING_OPTION_SPELLINGS.has(kebab);
};

/**
 * Serializes one option VALUE for DSL emission (`[key=value]` brackets).
 * A value carrying characters the DSL grammar would otherwise claim (`;`
 * splits options and parts, `]` ends the bracket, `[` opens one, `|` splits
 * groups and the global prefix, quotes confuse the value grammar) or
 * leading/trailing whitespace (trimmed on parse) is wrapped in double
 * quotes with inner `"` escaped as `\"` — the exact spelling the option
 * parser strips and unescapes on the way back in. Everything else emits
 * byte-unchanged. Lives here because both the builder (toString) and the
 * parser (`;;`-overlay rebuild) emit option values, and the builder already
 * imports the parser. Known residue: a backslash abutting the escaping
 * (`a\"b` class, trailing `\`) cannot round-trip — the parser unescapes
 * ONLY `\"`.
 */
export const serializeOptionValue = (value) => {
  const str = String(value);
  return /[;\[\]|"']/.test(str) || /^\s|\s$/.test(str)
    ? `"${str.replace(/"/g, '\\"')}"`
    : str;
};

/**
 * Bracket-content grammar (a regex SOURCE fragment) shared by every site
 * that tokenizes or (re-)extracts one `[option]` bracket: a quoted span
 * ("..." or '...', with \-escapes) may carry `]` `;` `|` `[` — mirroring
 * the option parser's value grammar so tokenization and value parsing agree
 * on where a bracket ends (a quoted `]` used to truncate the bracket).
 * Each step commits through an atomic lookahead ((?=(?<atom>...))\k<atom>):
 * ECMAScript lookaheads discard their interior choice points once matched,
 * so an UNCLOSED bracket fails in LINEAR time — the plain alternation form
 * backtracks exponentially there (measured ~2s at 40 stray quotes, hours at
 * 60). Trade-off: an unclosed bracket whose only `]`s sit inside complete
 * quoted spans no longer half-tokenizes; it falls through whole to the
 * malformed/unknown warn paths (visible, not silently truncated).
 * Embed at most once per composed regex (the group is named); the counterpart
 * of [[serializeOptionValue]] above.
 */
export const OPTION_BRACKET_CONTENT = String.raw`(?:(?=(?<atom>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]]))\k<atom>)*`;

/**
 * Generates a random 8-character key for element identity.
 * ~2.8 trillion combinations — negligible collision probability.
 */
export function generateKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 8; i++) key += chars[Math.floor(Math.random() * 36)];
  return key;
}

/**
 * Builder-canvas option keys (kebab-case, as written in the DSL) that take
 * effect ONLY in the global `[opts]||` bracket. Written at group `[opts]|`,
 * character `[opts]`, or part `[opts]>` level they are inert, so the parser
 * warns MISPLACED_GLOBAL_OPTION and drops the key (audit N-2).
 *
 * Deliberately curated, NOT INTERNAL_OPTIONS verbatim:
 * - `text` is excluded: it is an unimplemented stub at EVERY level including
 *   global (the deferred `{text}` overlay), so it is not "misplaced" anywhere.
 * - The dot-sizing family (dot-width/dot-extra-width/sdot-*) is excluded: it
 *   genuinely applies per element via option inheritance.
 * - x/y/key and kerning are excluded: positioning and identity, handled by
 *   their own extraction logic.
 */
export const GLOBAL_ONLY_OPTION_KEYS = new Set([
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'crop', 'crop-top', 'crop-bottom', 'crop-left', 'crop-right',
  'grid', 'grid-color', 'grid-major-color', 'grid-medium-color',
  'grid-minor-color', 'grid-sky-color', 'grid-earth-color',
  'grid-stroke-width', 'grid-major-stroke-width', 'grid-medium-stroke-width',
  'grid-minor-stroke-width', 'grid-sky-stroke-width', 'grid-earth-stroke-width',
  'background', 'background-top', 'background-mid', 'background-bottom',
  'center', 'min-width', 'char-space', 'word-space', 'external-glyph-space',
  'svg-title', 'svg-desc', 'svg-height', 'error-placeholder'
]);

/**
 * Options that should NOT be rendered as SVG attributes.
 *
 * Builder-level options: handled by SVG construction logic (margins, grid, cropping, etc.)
 * Element-level positioning: handled by element positioning logic (x, y, kerning)
 * Internal calculation options: used for calculations but not rendered (dot family: dotExtraWidth, sdotExtraWidth, dotWidth, sdotWidth)
 *
 * Note: strokeWidth is NOT here - it's a multi-level option like 'color'
 * that can appear at both global and element levels as SVG attributes.
 */
export const INTERNAL_OPTIONS = new Set([
  // Grid options (builder-level only)
  'grid',
  'gridSkyColor',
  'gridEarthColor',
  'gridMajorColor',
  'gridMediumColor',
  'gridMinorColor',
  'gridSkyStrokeWidth',
  'gridEarthStrokeWidth',
  'gridMajorStrokeWidth',
  'gridMediumStrokeWidth',
  'gridMinorStrokeWidth',

  // Cropping and margins (builder-level only)
  'cropTop',
  'cropBottom',
  'cropLeft',
  'cropRight',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',

  // Internal calculation options
  'dotExtraWidth',
  'sdotExtraWidth',
  'dotWidth',
  'sdotWidth',

  // Builder-level settings
  'background',
  'backgroundTop',
  'backgroundMid',
  'backgroundBottom',
  'charSpace',
  'wordSpace',

  'externalGlyphSpace',
  'minWidth',
  'center',
  'autoVertical',
  'cropCompact',
  'text',
  'svgDesc',
  'svgTitle',
  'svgHeight',
  'errorPlaceholder',

  // Element identity (extracted to node.key before option processing)
  'key',

  // Element positioning (handled by positioning logic, not SVG attributes).
  // Both spellings of the two kerning keys: a user writes the kebab form in a
  // bracket, and without it here an unrecognized `relative-kerning` fell
  // through to the attribute pass-through and landed in the shipped SVG as
  // `<g relative-kerning="3">`, which is not an attribute of anything.
  'x',
  'y',
  'relativeKerning',
  'absoluteKerning',
  'relative-kerning',
  'absolute-kerning'
]);

/**
 * Option keys the transient channel refuses, in every spelling.
 *
 * Each of these is consumed while the composition is being built, before the
 * render copy is taken: position is promoted onto the element itself, kerning
 * is resolved and rewritten, and `key` becomes element identity. A transient
 * spelling would therefore never reach the picture, so it is reported and
 * dropped rather than left to look as though it worked.
 *
 * All four kerning spellings are refused together on purpose. The surviving
 * camelCase numeric key IS read after the render copy, so accepting that one
 * while refusing its kebab twin would be a subtler trap than refusing both.
 */
export const TRANSIENT_REFUSED_OPTION_KEYS = new Set([
  'x',
  'y',
  'key',
  'relativeKerning',
  'absoluteKerning',
  'relative-kerning',
  'absolute-kerning'
]);

/**
 * Upper bound for the absolute `dot-width` / `sdot-width` options (a rendered
 * dot diameter in glyph units). Mirrors the `stroke-width` ceiling so an
 * absolute dot cannot exceed what the relative `dot-extra-width` knob can
 * already reach. The lower bound is 0 (an invisible dot; no crash).
 */
export const DOT_WIDTH_MAX = 1.5;

/**
 * The complete warning-code vocabulary. Single source of truth: every warning
 * emitted on `builder.warnings` references `WARNING_CODES.X` rather than an inline
 * literal, so the set is typo-proof and discoverable in one place.
 *
 * Verb convention (see `.claude/plans/2026-06-24-warning-code-vocabulary-design.md`):
 *   MALFORMED_   input did not parse in the required shape (a FORMAT failure;
 *                INVALID_/OUT_OF_RANGE are reserved for future VALUE/range checks)
 *   MISPLACED_   a well-formed token in the wrong position
 *   MULTIPLE_    more than one where one is allowed (resolved by a stated rule:
 *                the first for repeated option brackets and head markers, the
 *                higher-precedence spelling for a value written two ways)
 *   DUPLICATE_   the same identifier twice
 *   UNKNOWN_     an unrecognized reference
 *   DROPPED_     something discarded (first-wins / merge)
 *   UNSUPPORTED_ valid, but not implemented yet
 *   NOOP_        a mutation call had no effect
 *   UNSAFE_      refused by a safety gate rather than by the grammar
 *   RESERVED_    refused because the NAME is the library's own
 *   …_AS_PART    an illegal operand in a ;-part slot
 *
 * Structural attachment points use group/glyph/part (matches `toJSON()`); the
 * linguistic indicator concepts use word/character (a word-indicator sets a
 * word's part-of-speech; a space-group has none).
 */
export const WARNING_CODES = Object.freeze({
  // malformed-syntax: input did not parse in the required shape
  MALFORMED_GLOBAL_OPTIONS: 'MALFORMED_GLOBAL_OPTIONS',
  MALFORMED_GROUP_OPTIONS: 'MALFORMED_GROUP_OPTIONS',
  MALFORMED_WORD_INDICATOR: 'MALFORMED_WORD_INDICATOR',
  MALFORMED_COORDINATES: 'MALFORMED_COORDINATES',
  MALFORMED_KERNING_VALUE: 'MALFORMED_KERNING_VALUE',
  // misplaced: a well-formed token in the wrong position
  MISPLACED_HEAD_MARKER: 'MISPLACED_HEAD_MARKER',
  MISPLACED_CHARACTER_INDICATOR: 'MISPLACED_CHARACTER_INDICATOR',
  // a well-formed word-level indicator (`;;`) on a target that cannot carry
  // one (a space word)
  MISPLACED_WORD_INDICATOR: 'MISPLACED_WORD_INDICATOR',
  MISPLACED_PART_OPTION: 'MISPLACED_PART_OPTION',
  MISPLACED_CHARACTER_OPTION: 'MISPLACED_CHARACTER_OPTION',
  MISPLACED_GROUP_OPTION: 'MISPLACED_GROUP_OPTION',
  // a global-only (builder-canvas) option KEY inside a group/character/part
  // bracket: the key is well-formed but its scope is the whole SVG
  MISPLACED_GLOBAL_OPTION: 'MISPLACED_GLOBAL_OPTION',
  // the mirror image: a kerning option KEY outside character scope. Kerning is
  // the gap before a character, so the key means nothing at part, word or
  // global scope; it is dropped there rather than passing through to the SVG as
  // an attribute, which is what an unrecognized key deliberately does.
  MISPLACED_KERNING_OPTION: 'MISPLACED_KERNING_OPTION',
  // the same rule for a `<layer>--<attribute>` key below global scope: the
  // layers it can name are the whole SVG's, so there is nothing for the key to
  // target inside a group, character or part. Dropped there rather than passing
  // through to the markup as a `<g layer--attr="...">` nothing can use.
  MISPLACED_LAYER_OPTION: 'MISPLACED_LAYER_OPTION',
  // a coordinate (`:x,y`) or an option (`[opts]` at any scope) on a TSP/QSP
  // space: a space is a pure word-separator with no ink to position or style,
  // so the decoration is dropped and the space keeps its identity (ZSA is
  // content and is exempt; use it for a positionable/styleable blank)
  MISPLACED_SPACE_DECORATION: 'MISPLACED_SPACE_DECORATION',
  // an indicator part that precedes default-positioned content in a glyph's
  // part list: an indicator is only meaningful in the trailing indicator run
  // (BASE;INDICATOR), so the misplaced indicator is dropped from render and
  // serialization while the character still renders. Content explicitly
  // positioned at a non-origin `:x,y` does not convict a preceding indicator
  // (a compound indicator's decomposed anatomy must round-trip), and neither
  // does an unclassifiable part (unknown code, error node).
  MISPLACED_INDICATOR_PART: 'MISPLACED_INDICATOR_PART',
  // a space code (TSP/QSP) in a `;`-part slot: a space is a word-level
  // separator, never a character part, so the space part is dropped from
  // render and serialization while the character still renders. A single-part
  // space glyph IS the space itself and is untouched; ZSA is content (a
  // positionable inkless shape) and is exempt.
  MISPLACED_SPACE: 'MISPLACED_SPACE',
  // too-many / duplicate
  MULTIPLE_HEAD_MARKERS: 'MULTIPLE_HEAD_MARKERS',
  MULTIPLE_OPTION_BRACKETS: 'MULTIPLE_OPTION_BRACKETS',
  // one part positioned twice: an `[x=N;y=M]>` option and the `:x,y` suffix on
  // the same part are two spellings of one value, so the option wins and the
  // coordinate it overrides is reported. A glyph-level `[x=N]` is a different
  // level (leading blank on the glyph) and composes with a part coordinate
  // instead of competing with it, so it never raises this.
  MULTIPLE_POSITION_VALUES: 'MULTIPLE_POSITION_VALUES',
  // one character kerned twice: the `RK:`/`AK:` markers and the long-form
  // `[relative-kerning=N]` / `[absolute-kerning=N]` options are spellings of
  // one value, so an option beats a marker, the last one written wins, and
  // every displaced value is named. A definition default that a written value
  // overrides is not a conflict and stays silent.
  MULTIPLE_KERNING_VALUES: 'MULTIPLE_KERNING_VALUES',
  // one viewBox written two ways: a global `viewBox` attribute states the value
  // that margin/crop/min-width/center exist to compute, so the written value
  // wins and the options it displaced are named. Writing either one alone is
  // not a conflict and stays silent.
  MULTIPLE_GEOMETRY_VALUES: 'MULTIPLE_GEOMETRY_VALUES',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  // unrecognized reference
  UNKNOWN_CODE: 'UNKNOWN_CODE',
  // a global key in `<layer>--<attribute>` form naming a layer we do not emit
  // (`foo--x`), or with an empty layer half (`--x`). Never emitted, but KEPT in
  // the options bag so it round-trips, on the UNKNOWN_ family's own logic: the
  // reference may become valid later, exactly as UNKNOWN_CODE keeps a code you
  // might define() afterwards.
  UNKNOWN_LAYER: 'UNKNOWN_LAYER',
  // discarded
  DROPPED_WORD_INDICATOR: 'DROPPED_WORD_INDICATOR',
  // unsupported feature
  UNSUPPORTED_TEXT_BLOCKS: 'UNSUPPORTED_TEXT_BLOCKS',
  // no-op mutation
  NOOP_INDICATOR_MUTATION: 'NOOP_INDICATOR_MUTATION',
  // an attribute name refused by the safety gate: an `on*` event handler, or
  // characters outside the legal name set. Such a name is skipped at render
  // wherever it appears, so nothing can execute; the warning closes the
  // VISIBILITY gap, telling the author their key will never be emitted.
  UNSAFE_ATTRIBUTE_NAME: 'UNSAFE_ATTRIBUTE_NAME',
  // a root attribute whose name belongs to the library rather than to the
  // author (see LIBRARY_OWNED_ROOT_ATTRIBUTES). The written value is dropped and
  // the library's own is kept, because overriding it would break the file
  // format or forge the library's provenance stamp rather than change the
  // picture. A new verb: refused because the NAME is ours, not because the
  // value is unsafe or the position is wrong.
  RESERVED_ATTRIBUTE_NAME: 'RESERVED_ATTRIBUTE_NAME',
  // an option key that cannot travel in the transient channel because the
  // library consumes it while building the composition rather than while
  // drawing it (position, kerning, the runtime key). A transient spelling
  // would be inert, so it is reported and dropped instead of silently ignored.
  MISPLACED_TRANSIENT_OPTION: 'MISPLACED_TRANSIENT_OPTION',
  // illegal operand in a ;-part slot (also used as an internal part.errorCode)
  COMPOSITE_AS_PART: 'COMPOSITE_AS_PART',
  WORD_AS_PART: 'WORD_AS_PART',
  // illegal operand in a ;; word-indicator slot: a recognized non-indicator
  // (a real base) supplied where a word-level indicator is required
  NON_INDICATOR_AS_WORD_INDICATOR: 'NON_INDICATOR_AS_WORD_INDICATOR',
  // same rule one level down: a recognized non-indicator supplied to the
  // glyph-level applyIndicators() slot (the API's character-indicator channel)
  NON_INDICATOR_AS_CHARACTER_INDICATOR: 'NON_INDICATOR_AS_CHARACTER_INDICATOR',
});

/**
 * Maps semantic indicator types to their root B-codes.
 * When overriding indicators, the semantic root is preserved by default
 * unless the new indicators include a semantic indicator or strip-semantic (!) is used.
 */
export const SEMANTIC_INDICATOR_ROOTS = {
  thing: 'B97',
  abstract: 'B6436'
};

/**
 * Maximum allowed depth for element nesting and parser recursion.
 * Prevents stack overflow on pathological or self-referential definitions.
 */
export const MAX_RECURSION_DEPTH = 50;

/**
 * Approximate minimum y-coordinate for content bounds in external glyphs
 * and text fallbacks. Actual values vary per glyph; this is used for
 * effectiveBounds estimation only.
 */
export const APPROX_GLYPH_MIN_Y = 11;
