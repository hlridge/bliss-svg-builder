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
 * Every element the library paints, and the classes it carries, general to
 * specific, exactly as the emitters write them. One declaration serves three
 * readers: the emitter writes `class` from it, a `<target>--<attribute>` key
 * resolves by membership in it, and the displacement report reads the curated
 * options behind a computed attribute. Add a painted element here and it is
 * targetable the moment its emitter carries the class.
 */
export const ELEMENT_CLASSES = Object.freeze({
  root:           ['bliss-root'],
  background:     ['bliss-background'],
  backgroundZone: ['bliss-background-zone'],
  zoneTop:        ['bliss-background-zone', 'bliss-background-zone--top'],
  zoneMid:        ['bliss-background-zone', 'bliss-background-zone--mid'],
  zoneBottom:     ['bliss-background-zone', 'bliss-background-zone--bottom'],
  grid:           ['bliss-grid'],
  gridMinor:      ['bliss-grid-line', 'bliss-grid-line--minor'],
  gridMedium:     ['bliss-grid-line', 'bliss-grid-line--medium'],
  gridMajor:      ['bliss-grid-line', 'bliss-grid-line--major'],
  gridSky:        ['bliss-grid-line', 'bliss-grid-line--major', 'bliss-grid-line--sky'],
  gridEarth:      ['bliss-grid-line', 'bliss-grid-line--major', 'bliss-grid-line--earth'],
  content:        ['bliss-content'],
});

/**
 * Which written option produced a computed attribute, most specific first,
 * mirroring the order #processOptions resolves the curated cascade. Read only
 * to NAME a written curated option that a raw key displaced; nothing resolves
 * through it, and a key absent from it is simply never reported as displaced.
 *
 * Closed and ours: it lists names the library itself computes, not a table of
 * SVG semantics. Keyed by ELEMENT_CLASSES entry.
 *
 * Add an option to a chain here and it becomes reportable the moment something
 * writes it; leave one out and that option is silently never named as displaced.
 * Every name in every chain carries a row in `layer-sub-targets.test.js`, since
 * an entry no test reaches can be deleted with the whole suite green.
 */
export const CURATED_ATTRIBUTE_SOURCES = Object.freeze({
  gridMinor:  { stroke: ['grid-minor-color', 'grid-color'],
                'stroke-width': ['grid-minor-stroke-width', 'grid-stroke-width'] },
  gridMedium: { stroke: ['grid-medium-color', 'grid-color'],
                'stroke-width': ['grid-medium-stroke-width', 'grid-stroke-width'] },
  gridMajor:  { stroke: ['grid-major-color', 'grid-color'],
                'stroke-width': ['grid-major-stroke-width', 'grid-stroke-width'] },
  gridSky:    { stroke: ['grid-sky-color', 'grid-major-color', 'grid-color'],
                'stroke-width': ['grid-sky-stroke-width', 'grid-major-stroke-width', 'grid-stroke-width'] },
  gridEarth:  { stroke: ['grid-earth-color', 'grid-major-color', 'grid-color'],
                'stroke-width': ['grid-earth-stroke-width', 'grid-major-stroke-width', 'grid-stroke-width'] },
  backgroundZone: { fill: ['background'] },
  zoneTop:    { fill: ['background-top', 'background'] },
  zoneMid:    { fill: ['background-mid', 'background'] },
  zoneBottom: { fill: ['background-bottom', 'background'] },
});

/**
 * Per container, the attribute names whose value cannot take effect there, and
 * the target that reaches the children where it can. The membership rule is
 * exactly "every name this container's own emitter stamps on its CHILDREN",
 * which is checkable by eye against the emitters and needs no table of SVG
 * semantics, the open-ended thing C8 refused to build for vector-effect. That
 * is why `rx` and `opacity` are out (nothing stamps them, so we cannot say a
 * child's value takes effect instead) and why `shape-rendering` is out (the
 * grid group carries it itself, so a written one replaces it rather than being
 * shadowed by a child. The embedded `@supports` stylesheet does set it on
 * `.bliss-grid-line` in WebKit, where a CSS rule beats an inherited
 * presentation attribute and the lines keep their own; that is a stylesheet we
 * ship, not a value the emitter stamps, so it does not meet the rule above).
 * `class` is the one carve-out from the rule: every child carries it, but the
 * container carries it too and an authored value MERGES there, so reporting it
 * would report a live feature.
 *
 * STATIC, not computed from what was actually drawn: a container whose children
 * are all cropped away would have no triggers, so the warning would fall silent
 * in exactly the configuration where it is most needed.
 *
 * Two kinds of name sit in one list because the remedy is identical for both.
 * The paint names are inherited, and a child's own value beats what the parent
 * passes down. `x`, `y`, `width`, `height` and `d` are geometry: a group
 * carries none of them and passes none of them down, so the value is simply
 * inert there. The message therefore states only what an author can observe,
 * that the child's value is the one that takes effect, rather than naming the
 * inheritance mechanism, which holds for one half of the list and is false for
 * the other.
 *
 * A Map, not an object literal, so an inherited name can never answer for a
 * real target. Adding a container here means adding an arm to `containerIsDrawn`
 * in `bliss-svg-builder.js`; without one it reports whether or not anything was
 * drawn.
 */
export const CONTAINER_SHADOWED_ATTRIBUTES = new Map([
  ['grid',       { names: ['stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd'],
                   childTarget: 'grid-line' }],
  ['background', { names: ['x', 'y', 'width', 'height', 'stroke', 'fill'],
                   childTarget: 'background-zone' }],
]);

/** The `bliss-` prefix every structural class carries and no target repeats. */
export const CLASS_PREFIX = 'bliss-';

/** A class name as it is written in a key: the class minus the prefix. */
export const targetOfClass = (className) => className.slice(CLASS_PREFIX.length);

/**
 * The targets a `<target>--<attribute>` key can name: every class the library
 * writes, minus the prefix. Derived from ELEMENT_CLASSES rather than listed, so
 * the vocabulary and the markup cannot drift apart. Membership decides only
 * whether an unmatched target is SILENT or reported: resolution itself is class
 * membership at the emitters, so a target is silent when its class exists and
 * nothing drew it, and reported when no element could ever carry it.
 *
 * `root` is in here even though a bare key already reaches the root. C8 dropped
 * `svg--` on the rule that a second spelling for one target is a duplicate;
 * that rule is knowingly outweighed, because the value of this vocabulary is
 * that every class the library writes is addressable, and an exception for the
 * outermost element is the one a reader would trip on. The collision it creates
 * is resolved where the root's attributes are built, and reported.
 */
export const LAYER_TARGETS = new Set(
  Object.values(ELEMENT_CLASSES).flat().map(targetOfClass)
);

/**
 * Attribute names that state what the FILE is rather than anything about the
 * picture, so they are refused wherever they are written. `xmlns` has exactly
 * one legal value here: a second declaration, at any depth, moves that subtree
 * out of the SVG namespace, which makes a file no browser renders and our own
 * `svgElement` getter cannot parse. A bad value is one thing; producing a
 * document that is not SVG is something else, and that is why this set is not
 * scoped to the root the way the one below is.
 */
export const DOCUMENT_DEFINING_ATTRIBUTES = new Set(['xmlns']);

/**
 * Names the library owns ON THE ROOT and nowhere else, on the rule that the
 * user owns statements about the PICTURE and the library owns statements about
 * ITSELF. `data-generator` is the provenance stamp, and a stamp anyone can
 * overwrite is worth nothing to whoever reads it; a consumer recording their
 * own pipeline adds a name of their own instead. The same name on an inner
 * layer collides with nothing and is an ordinary data attribute the author set,
 * so it is left alone there.
 */
export const LIBRARY_OWNED_ROOT_ATTRIBUTES = new Set(['data-generator']);

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
 * Splits `grid-line--sky--stroke-dasharray` into its target and its attribute,
 * at the LAST `--`. The boundary we need is between the class and the attribute,
 * and every `--` inside a class name sits to the left of it, so a compound class
 * can carry any number of them. Returns null when the target names no class we
 * write or the attribute half is empty, so the caller reports rather than emits
 * a key nothing can use. The cost is that `data--foo` is unreachable as an
 * attribute NAME behind a prefix; that was weighed and accepted.
 */
export const parseLayerAttributeKey = (key) => {
  const at = key.lastIndexOf('--');
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
 * The complete warning-code vocabulary. Single source of truth: every warning
 * emitted on `builder.warnings` references `WARNING_CODES.X` rather than an inline
 * literal, so the set is typo-proof and discoverable in one place.
 *
 * Verb convention (see `.claude/plans/2026-06-24-warning-code-vocabulary-design.md`):
 *   MALFORMED_   input did not parse in the required shape (a FORMAT failure)
 *   OUT_OF_RANGE_ a well-formed number outside what the attribute can carry (a
 *                VALUE failure; INVALID_ stays reserved for a value that is not
 *                a number at all)
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
  // out-of-range: a stroke width that parses as a number but that nothing can
  // draw with. The width also feeds path geometry (a dot's radius is derived
  // from it), so a negative one reaches the path data as a negative arc radius
  // and conformant renderers drop the whole path. Negative is floored to 0, an
  // invisible but legal stroke; non-finite is refused and the default stands.
  // A width that is not a number at all still falls back to the default in
  // silence. This is the last hand-written gate: every other numeric option now
  // goes through judgeNumericOptionValue, and stroke-width joins them next,
  // which retires this code in favour of the two below.
  OUT_OF_RANGE_STROKE_WIDTH: 'OUT_OF_RANGE_STROKE_WIDTH',
  // a numeric option given something that is not a number at all. INVALID_ is
  // the reserved verb for exactly this: OUT_OF_RANGE_ answers for a well-formed
  // number the attribute cannot carry, and the two are different repairs.
  INVALID_OPTION_VALUE: 'INVALID_OPTION_VALUE',
  // a numeric option given a well-formed number nothing can use: non-finite at
  // any scope, or negative where the quantity is a length. Refused rather than
  // clamped, because a clamp substitutes a value the author did not write and
  // says nothing about it.
  OUT_OF_RANGE_OPTION_VALUE: 'OUT_OF_RANGE_OPTION_VALUE',
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
  // a link attribute (href, target, rel, download, hreflang, type,
  // referrerpolicy) written for a LAYER. A link is an <a> element wrapping the
  // content it links; a layer is a plain group or rect and is not one, so the
  // attribute has nothing to act on and is dropped rather than shipped as
  // markup that looks like a working link and is not one.
  MISPLACED_LINK_ATTRIBUTE: 'MISPLACED_LINK_ATTRIBUTE',
  // an attribute that reached a container whose children each carry the same
  // name, so the child's value is the one that takes effect and the written one
  // cannot show. Two mechanisms, one remedy: an inherited paint value is beaten
  // by the child's own, while geometry a group cannot carry is inert there. It
  // is still emitted where it was asked for; the report names the target that
  // works. Silent when the container is not drawn, since there is then no
  // landing site to describe.
  MISPLACED_CONTAINER_ATTRIBUTE: 'MISPLACED_CONTAINER_ATTRIBUTE',
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
  // one attribute written twice for one element: a bare global key and the
  // `root--` spelling of the same attribute, or a curated option and a raw key
  // that reach the same attribute on the same element. The key that NAMES its
  // target wins, because it states a destination where the other has to be
  // resolved to one, and the displaced key is named. It reports more-than-one
  // rather than value-lost, so two equal values still raise it. Silent when the
  // layer that would carry them is switched off, matching every other statement
  // about an absent layer, and silent for a single element the render does not
  // paint where that is settled before the render (an undrawn background zone).
  MULTIPLE_ATTRIBUTE_VALUES: 'MULTIPLE_ATTRIBUTE_VALUES',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  // unrecognized reference
  UNKNOWN_CODE: 'UNKNOWN_CODE',
  // a global key in `<target>--<attribute>` form that does not resolve to a
  // target and an attribute: a target we do not KNOW (`foo--x`), an empty target
  // half (`--x`), or an empty attribute half (`content--`). The test is
  // LAYER_TARGETS membership and not whether the element is currently drawn, so
  // `grid--opacity` with the grid off is silent, and so is a sub-element a crop
  // removed, matching the named grid options. Never emitted, but KEPT in the
  // options bag so it round-trips, on
  // the UNKNOWN_ family's own logic: the reference may become valid later,
  // exactly as UNKNOWN_CODE keeps a code you might define() afterwards.
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
  // an attribute whose name belongs to the library rather than to the author.
  // The written value is dropped and the library's own is kept, because
  // overriding it would break the file format or forge the library's
  // provenance stamp rather than change the picture. A new verb: refused
  // because the NAME is ours, not because the value is unsafe or the position
  // is wrong. Two sets, guarded at different reaches: a name that declares the
  // document (DOCUMENT_DEFINING_ATTRIBUTES) is refused at every layer, since it
  // breaks the file wherever it lands; a name the library owns on the root
  // (LIBRARY_OWNED_ROOT_ATTRIBUTES) is refused there only.
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
 * Every numeric option, by the spelling an author writes it in, and what its
 * value may be.
 *
 * `kind` decides one thing only, the negative rule. A LENGTH is a distance and
 * nothing can draw a negative one, so it is refused. An OFFSET may be negative
 * and means something there: a negative margin or crop pushes the viewBox out
 * instead of pulling it in, and the viewBox floors its dimensions at 0 anyway.
 *
 * `noun` is how the warning names the thing that kept its old value, so the
 * message describes an outcome the author can see rather than an internal key.
 *
 * `fallback` records where the value comes from when one is refused. A refused
 * option falls back exactly as if it had never been written, so the consumer's
 * own `?? default` supplies it; recording it here means a reader does not have
 * to find the consumer to know what a refusal looks like.
 *
 * There is no upper bound in this table and there must not be one. Seven of
 * these keys were clamped until this change, which rewrote a written value in
 * silence: `[char-space=50]` rendered byte-identical to `[char-space=10]` with
 * an empty warnings array. Honour the value or refuse it; never substitute one
 * quietly.
 *
 * These 26 are exactly the numeric members of KNOWN_OPTION_KEYS. The two
 * numeric options NOT here are `relative-kerning` and `absolute-kerning`, which
 * are absent from that set as well (the parser promotes them rather than
 * dispatching on them) and carry their own gate, MALFORMED_KERNING_VALUE. They
 * are gated, just not from here.
 */
export const NUMERIC_OPTION_POLICY = new Map([
  ['stroke-width',             { kind: 'length', noun: 'stroke',   fallback: '0.5 at the root; below it, whatever is inherited' }],
  ['dot-extra-width',          { kind: 'length', noun: 'dot',      fallback: 'the dot-sizing walk in bliss-element.js' }],
  ['sdot-extra-width',         { kind: 'length', noun: 'dot',      fallback: 'the dot-sizing walk in bliss-element.js' }],
  ['dot-width',                { kind: 'length', noun: 'dot',      fallback: 'the dot-sizing walk in bliss-element.js' }],
  ['sdot-width',               { kind: 'length', noun: 'dot',      fallback: 'the dot-sizing walk in bliss-element.js' }],
  ['char-space',               { kind: 'length', noun: 'spacing',  fallback: '2, in #sharedOptions' }],
  ['word-space',               { kind: 'length', noun: 'spacing',  fallback: '8, in #sharedOptions' }],
  ['external-glyph-space',     { kind: 'length', noun: 'spacing',  fallback: '0.8, in #sharedOptions' }],
  ['margin',                   { kind: 'offset', noun: 'margin',   fallback: '0.75, in #svgCode' }],
  ['margin-top',               { kind: 'offset', noun: 'margin',   fallback: '0.75, in #svgCode' }],
  ['margin-bottom',            { kind: 'offset', noun: 'margin',   fallback: '0.75, in #svgCode' }],
  ['margin-left',              { kind: 'offset', noun: 'margin',   fallback: '0.75, in #svgCode' }],
  ['margin-right',             { kind: 'offset', noun: 'margin',   fallback: '0.75, in #svgCode' }],
  ['min-width',                { kind: 'length', noun: 'width',    fallback: '0, in #svgCode' }],
  ['crop',                     { kind: 'offset', noun: 'crop',     fallback: '0, in #svgCode' }],
  ['crop-top',                 { kind: 'offset', noun: 'crop',     fallback: '0, in #svgCode' }],
  ['crop-bottom',              { kind: 'offset', noun: 'crop',     fallback: '0, in #svgCode' }],
  ['crop-left',                { kind: 'offset', noun: 'crop',     fallback: '0, in #svgCode' }],
  ['crop-right',               { kind: 'offset', noun: 'crop',     fallback: '0, in #svgCode' }],
  ['grid-stroke-width',        { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['grid-major-stroke-width',  { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['grid-medium-stroke-width', { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['grid-minor-stroke-width',  { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['grid-sky-stroke-width',    { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['grid-earth-stroke-width',  { kind: 'length', noun: 'grid line width', fallback: '0.166, in #processOptions' }],
  ['svg-height',               { kind: 'length', noun: 'height',   fallback: 'six times the viewBox height, in #svgCode' }],
]);

/**
 * Judges one written value for a numeric option. Two arms and no third: the
 * value is either refused, in which case the option falls back exactly as if it
 * had never been written, or honoured exactly as written.
 *
 * The order of the checks is observable, so it is fixed here rather than left to
 * each caller: something that is not a number at all is INVALID, a well-formed
 * number the SVG format cannot carry is OUT_OF_RANGE, and the negative rule runs
 * last and only for a length. A bare key (`[margin]`) and an empty value
 * (`[margin=]`) are refusals too, because `Number(true)` is 1 and `Number('')`
 * is 0 and honouring either would have the library invent a value nobody typed.
 *
 * Returns null when the value is honoured, so the caller assigns it; otherwise
 * the warning to report, and the caller assigns nothing.
 */
export const judgeNumericOptionValue = (key, rawValue) => {
  const policy = NUMERIC_OPTION_POLICY.get(key);
  if (!policy) return null;
  const tail = `so it was ignored: the ${policy.noun} keeps the value it would have had without it.`;
  const source = rawValue === true ? key : `${key}=${rawValue}`;
  // Blank rather than absent: a bare key arrives as `true`, an empty value as
  // '', a quoted blank as whitespace, and an omitted one as null or undefined.
  // Number() turns every one of them into 0, so each would otherwise set a
  // spacing nobody typed.
  const isBlank = rawValue === true || rawValue === null || rawValue === undefined
    || (typeof rawValue === 'string' && rawValue.trim() === '');
  if (isBlank) {
    return {
      code: WARNING_CODES.INVALID_OPTION_VALUE,
      message: `"${key}" needs a number and was written without one, ${tail}`,
      source,
    };
  }
  // The TYPE decides, not what Number() makes of it. Number(false) is 0 and
  // Number([5]) is 5, so trusting the NaN check below would honour a value the
  // author never wrote as a number. Only a number, or a string carrying one,
  // can be honoured; a padded number such as ' 5 ' still is.
  const written = typeof rawValue === 'number' || typeof rawValue === 'string'
    ? Number(rawValue)
    : NaN;
  if (Number.isNaN(written)) {
    return {
      code: WARNING_CODES.INVALID_OPTION_VALUE,
      // Shown as it was given, not as it coerced: `[5]` reads as a list rather
      // than as the number 5, which is the whole reason it was refused.
      message: `"${key}" needs a number and ${JSON.stringify(rawValue)} is not one, ${tail}`,
      source,
    };
  }
  // The key is quoted and leads rather than following an article, because an
  // article cannot be chosen for 26 names at once: "a sdot-extra-width" and
  // "a external-glyph-space" are both wrong, and the rule that picks between
  // "a" and "an" is about sound, not spelling.
  if (!Number.isFinite(written)) {
    return {
      code: WARNING_CODES.OUT_OF_RANGE_OPTION_VALUE,
      message: `"${key}" cannot be ${written}, which is not a length the SVG format can carry, ${tail}`,
      source,
    };
  }
  if (policy.kind === 'length' && written < 0) {
    return {
      code: WARNING_CODES.OUT_OF_RANGE_OPTION_VALUE,
      message: `"${key}" cannot be ${written}, because a negative ${policy.noun} cannot be drawn, ${tail}`,
      source,
    };
  }
  return null;
};

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
