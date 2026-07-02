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

  // Element positioning (handled by positioning logic, not SVG attributes)
  'x',
  'y',
  'relativeKerning',
  'absoluteKerning'
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
 *   MULTIPLE_    more than one where one is allowed (resolved by picking the first)
 *   DUPLICATE_   the same identifier twice
 *   UNKNOWN_     an unrecognized reference
 *   DROPPED_     something discarded (first-wins / merge)
 *   UNSUPPORTED_ valid, but not implemented yet
 *   NOOP_        a mutation call had no effect
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
  MISPLACED_PART_OPTION: 'MISPLACED_PART_OPTION',
  MISPLACED_CHARACTER_OPTION: 'MISPLACED_CHARACTER_OPTION',
  MISPLACED_GROUP_OPTION: 'MISPLACED_GROUP_OPTION',
  // a global-only (builder-canvas) option KEY inside a group/character/part
  // bracket: the key is well-formed but its scope is the whole SVG
  MISPLACED_GLOBAL_OPTION: 'MISPLACED_GLOBAL_OPTION',
  // too-many / duplicate
  MULTIPLE_HEAD_MARKERS: 'MULTIPLE_HEAD_MARKERS',
  MULTIPLE_OPTION_BRACKETS: 'MULTIPLE_OPTION_BRACKETS',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  // unrecognized reference
  UNKNOWN_CODE: 'UNKNOWN_CODE',
  // discarded
  DROPPED_WORD_INDICATOR: 'DROPPED_WORD_INDICATOR',
  // unsupported feature
  UNSUPPORTED_TEXT_BLOCKS: 'UNSUPPORTED_TEXT_BLOCKS',
  // no-op mutation
  NOOP_INDICATOR_MUTATION: 'NOOP_INDICATOR_MUTATION',
  // illegal operand in a ;-part slot (also used as an internal part.errorCode)
  COMPOSITE_AS_PART: 'COMPOSITE_AS_PART',
  WORD_AS_PART: 'WORD_AS_PART',
  // illegal operand in a ;; word-indicator slot: a recognized non-indicator
  // (a real base) supplied where a word-level indicator is required
  NON_INDICATOR_AS_WORD_INDICATOR: 'NON_INDICATOR_AS_WORD_INDICATOR',
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
