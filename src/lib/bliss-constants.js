/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { svgAttributeSpelling } from "./bliss-svg-attribute-names.js";

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
 * Whether a written name IS one of the two reserved names, judged without
 * regard to casing.
 *
 * A file served as SVG keeps `XMLNS` distinct from `xmlns`, so the miscased
 * spelling would merely be dead there. The same markup pasted into an HTML
 * page is a different story: the HTML parser lowercases every attribute name,
 * so `XMLNS="…"` becomes a real second namespace declaration on the page it
 * was written into, and `DATA-GENERATOR` overwrites the provenance stamp. The
 * guards judge the name rather than the spelling, or they hold on one of the
 * two routes this library's output takes.
 */
export const isDocumentDefiningAttribute = (name) =>
  DOCUMENT_DEFINING_ATTRIBUTES.has(String(name).toLowerCase());

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

/** Whether a written name is the root stamp, judged like the set above. */
export const isLibraryOwnedRootAttribute = (name) =>
  LIBRARY_OWNED_ROOT_ATTRIBUTES.has(String(name).toLowerCase());

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

/**
 * The written options whose values reach one of the six numbers the root
 * carries: the four `viewBox` terms and the `width`/`height` pair. A superset
 * of `GEOMETRY_OPTION_KEYS`, which answers the narrower question of what a
 * hand-written `viewBox` displaces: `svg-height` sizes the root without
 * touching the viewBox, and the three spacings widen the composition the
 * viewBox is measured from. An overflow report names whichever of these was
 * written, so the author is told which values to reduce.
 */
export const SIZE_OPTION_KEYS = new Set([
  ...GEOMETRY_OPTION_KEYS,
  'svg-height',
  'char-space', 'word-space', 'external-glyph-space',
]);

/**
 * Every processed option the geometry is computed from, in the internal
 * spelling the options pass leaves behind once the bulk keys are expanded.
 * Removing all of them is how an overflow falls back: the consumers' own `??`
 * defaults then supply the size, so there is no second mode to write.
 *
 * The spacings are deliberately absent. They are consumed into the shared
 * options and baked into the composition before the geometry can be judged, so
 * removing them here would narrow nothing;
 * `BlissSVGBuilder.option-value-gate.test.js` pins that limit.
 */
export const COMPUTED_GEOMETRY_INPUTS = [
  'minWidth', 'center',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'cropTop', 'cropBottom', 'cropLeft', 'cropRight',
  'cropCompact', 'autoVertical',
  'svgHeight',
];

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

/**
 * Converts a kebab-case string to camelCase.
 * e.g., stroke-width → strokeWidth, grid-sky-color → gridSkyColor
 * Single-word keys (color, grid, margin) pass through unchanged.
 *
 * The inverse of camelToKebab over the curated vocabulary, which is the only
 * vocabulary either one is applied to: both directions are lossy on a name with
 * digits or consecutive capitals, and the library's own option names have
 * neither.
 */
const kebabToCamel = (str) => str.replace(/-(.)/g, (_, letter) => letter.toUpperCase());

// The long-form kerning options are curated vocabulary too, but they are absent
// from KNOWN_OPTION_KEYS because that set lists what #processOptions dispatches
// on, and kerning is promoted by the parser instead. Their canonical spelling is
// the kebab one a bracket carries, so the API's camelCase form has to translate
// like every other named option. (INTERNAL_OPTIONS lists all four spellings for
// a different reason: keeping them out of the emitted markup.)
const KERNING_OPTION_SPELLINGS = new Set(['relative-kerning', 'absolute-kerning']);

// The long-form option spellings of the two kerning markers, mapped to the one
// numeric key the layout reads. Kebab is what a writer puts in a bracket, camel
// is what the API and a definition's `defaultOptions` use; both mean the same
// value, so both resolve here rather than at each consumer. Exported so no site
// re-derives the set.
export const KERNING_OPTION_KEYS = Object.freeze({
  'relative-kerning': 'relativeKerning',
  relativeKerning: 'relativeKerning',
  'absolute-kerning': 'absoluteKerning',
  absoluteKerning: 'absoluteKerning',
});

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
 * An ARIA name written the way JavaScript spells things. Matched by pattern
 * rather than by list, which is what keeps it from going stale as ARIA grows:
 * every state and property is `aria-` followed by ONE lowercase token with no
 * internal hyphen, so the remainder is lowercased whole rather than hyphenated
 * at its capitals. Hyphenating would invent `aria-value-now`,
 * `aria-labelled-by` and `aria-has-popup`, none of which exist.
 *
 * The capital after `aria` is what makes the pattern safe to apply without a
 * list: it is the camelCase boundary, so `arialFont` is not claimed.
 */
const ARIA_PROGRAMMATIC_NAME = /^aria[A-Z]/;

/**
 * The spelling an option key is stored and emitted under: the owner's, when a
 * standard owns the name in a fixed spelling, and the key exactly as written
 * when nobody does. Casing and hyphenation carry no meaning in a name a
 * standard owns, so `view-box`, `viewbox` and `VIEWBOX` all reach `viewBox`.
 *
 * The library's OWN vocabulary is asked first, and it accepts exactly two
 * spellings: the kebab one a bracket carries and the camelCase one JavaScript
 * writes. It is asked first so a name we share with a standard stays ours:
 * `strokeWidth` means the option that computes a stroke width, not the raw
 * attribute of that name, and `color` still means the paint we publish as
 * `stroke`. The narrower acceptance is deliberate and is what keeps
 * `STROKE-WIDTH` a literal attribute name: a standard owns its names in every
 * casing and hyphenation, we own ours in the two we publish.
 *
 * Three kinds of key are then returned untouched.
 *
 * A name the library will REFUSE is not a name it renames, which is the reason
 * the eighteen event handlers in the vocabulary are inert in both directions
 * rather than merely unemitted.
 *
 * A `<target>--attribute` key means its attribute LITERALLY, which is the one
 * way to demand a name the library would otherwise resolve. Skipping the whole
 * key also keeps a prefix from being read as part of a name: stripping the
 * dashes from `content--script-type` would otherwise land on SVG's
 * `contentScriptType`.
 *
 * A name nobody owns is the author's, and an author's name is never rewritten.
 */
export const canonicalOptionKey = (key) => {
  // Resolution exists to make a written name WORK, so it buys nothing on a name
  // that can never be emitted, and it costs the author the ability to find in
  // their own input the spelling the refusal names.
  if (!isSafeAttributeName(key)) return key;
  if (isLayerAttributeKey(key)) return key;
  if (isNamedOptionKey(key)) return camelToKebab(key);
  if (ARIA_PROGRAMMATIC_NAME.test(key)) return `aria-${key.slice(4).toLowerCase()}`;
  const owner = svgAttributeSpelling(key);
  // A miscased spelling of a name we curate (`STROKE-WIDTH`) reaches here with
  // a curated owner and no curated spelling of its own, and stays literal.
  return owner === undefined || isNamedOptionKey(owner) ? key : owner;
};

/**
 * The spelling an option key is PUBLISHED under, which is the mirror of
 * `canonicalOptionKey` rather than a second opinion on it.
 *
 * Storage is kebab for the library's own vocabulary, because that is the
 * spelling a bracket carries and the one the options pass dispatches on.
 * Publication is camelCase, because published output is JavaScript's view of a
 * composition and camelCase is how JavaScript spells a name. The DSL's view
 * keeps the kebab spelling, which is why the two serializers differ on purpose.
 *
 * Only the library's own vocabulary moves. A name a standard owns is already
 * stored under its owner's spelling, and rewriting `stroke-dasharray` or
 * `aria-label` into our house style would claim a name we do not own; an
 * author's name is never rewritten at all.
 *
 * `canonicalOptionKey`'s three refusals need no counterpart here, because none
 * of the three can reach the curated test: a `<target>--attribute` key keeps its
 * `--` through `camelToKebab`, and no curated option contains one; and the names
 * the safety gate refuses are event handlers and namespaced names, which the
 * curated vocabulary has none of.
 *
 * Resolving the stored key through `camelToKebab` first is DEFENSIVE and
 * changes no answer: for the kebab form to be a curated name at all, every
 * capital in the key must already sit at one of that name's hyphens, and a
 * hyphen written before a capital doubles into `--`, which no curated name
 * carries. It is kept because it states the rule, publish the canonical form of
 * this name, rather than resting on `kebabToCamel` happening to be the identity
 * on a key that is already camelCase. Storage is not always the kebab spelling:
 * a bracket's kerning option is promoted onto the character under the camelCase
 * one while the options argument stores the kebab one, and those are one name.
 */
export const programmaticOptionKey = (key) => (
  isNamedOptionKey(key) ? kebabToCamel(camelToKebab(key)) : key
);

/**
 * Removes one option name from a bag, by READING the name the way ingest wrote
 * it rather than by converting it. A name the library or a standard owns goes
 * under either spelling; a name nobody owns goes under exactly the spelling the
 * caller wrote.
 *
 * Hyphenating every key is what this replaces, and it deleted attributes the
 * caller had not named: `dataBlissId` and `data-bliss-id` are two different
 * names, both can be live at once, and their coexistence is deliberately silent,
 * so the extra deletion was invisible from outside. A `<target>--name` key was
 * wrong the same way, since the prefix suspends conversion by design.
 *
 * The two lookups this repeats are the two a name can be STORED under, so
 * between them they are exhaustive and neither needs a guard of its own:
 *
 * - `canonicalOptionKey` is the spelling ingest stores, which is kebab for the
 *   library's vocabulary and the owner's for a name a standard owns.
 * - `programmaticOptionKey` is the camelCase spelling, which character scope
 *   promotes a kerning option to. That makes kerning the one curated name whose
 *   stored key is not the kebab one, and the kebab spelling used to miss it.
 *
 * On a name nobody owns both lookups are the identity, so the pair collapses to
 * the one key the caller named, which is the whole point.
 */
export const deleteOptionByName = (bag, key) => {
  delete bag[canonicalOptionKey(key)];
  delete bag[programmaticOptionKey(key)];
};

/**
 * Watches one options bag being filled and reports when two spellings of one
 * name land on the same key. Resolution is what makes the collision invisible:
 * before it, both spellings survived side by side and the reader could see
 * them; after it, one value silently displaces the other.
 *
 * The LAST value written wins, so the displaced one is the earlier. That is
 * the only rule available once spelling has been declared meaningless, and it
 * is the one object spread already implies: `{...defaults, marginTop: 3}` must
 * let the explicit override beat a `margin-top` default, whichever way each was
 * spelled.
 *
 * Two writes of the SAME spelling are not this: a plain duplicate is visible in
 * the source and has always taken the last value in silence.
 *
 * @param {(warning: object) => void} warn - where to send the report
 * @returns {(writtenKey: string, storedKey: string, value: unknown) => void}
 */
export const optionSpellingWatcher = (warn) => {
  const written = new Map();
  return (writtenKey, storedKey, value) => {
    const displaced = written.get(storedKey);
    written.set(storedKey, { key: writtenKey, value });
    if (displaced === undefined || displaced.key === writtenKey) return;
    // A bare key is stored as `true`, so name it the way it was written.
    const source = displaced.value === true ? displaced.key : `${displaced.key}=${textOfValue(displaced.value)}`;
    warn({
      code: WARNING_CODES.MULTIPLE_OPTION_SPELLINGS,
      message: `An option takes one value however it is spelled, so "${source}" is ignored. "${displaced.key}" and "${writtenKey}" are two spellings of one name, and the last value written wins.`,
      source,
    });
  };
};

/**
 * The two internal option names with no curated kebab spelling of their own, and
 * the whole option that reaches the same behaviour. Both worked as input on
 * every route until the options bags were separated, by the same accident as
 * every other internal name: the key fell through into the bag under exactly
 * the name the consumer reads. Nothing documented them, and no route reads them
 * as input now; the table exists so the report can name the option that works.
 *
 * `camelToKebab` gives `auto-vertical` and `crop-compact`, neither of which is
 * an option, so `canonicalOptionKey` cannot see these two and any rule derived
 * from the curated vocabulary would name a key that does not exist. A lookup,
 * because there is no rule that derives `crop=compact` from `cropCompact`.
 *
 * That is also why these two are the last spellings anything still reports:
 * each names a whole option rather than a name, so resolving names on ingest
 * left them with nothing to resolve.
 *
 * Not a general "did you mean" mechanism, which is ruled out: these are names
 * the library itself uses, so nothing is being guessed about what was meant.
 */
export const INTERNAL_ONLY_SPELLINGS = new Map([
  ['autoVertical', 'crop=auto-vertical'],
  ['cropCompact', 'crop=compact'],
]);

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
  // Guarded, as a defence for a value `String()` throws on, though nothing
  // hands it one: the admission stage keeps a value with no text form on the
  // element key alone, and nothing serializes that key.
  const str = textOfValue(value);
  return /[;\[\]|"']/.test(str) || /^\s|\s$/.test(str)
    ? `"${str.replace(/"/g, '\\"')}"`
    : str;
};

/**
 * One quoted span inside an option bracket ("..." or '...', with \-escapes), a
 * regex SOURCE fragment with no group. Both scans of a bracket step over it
 * whole, the one that finds where the bracket ends and the one that finds where
 * each of its entries ends, so a quoted `]` or `;` ends neither.
 */
export const QUOTED_SPAN = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;

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
export const OPTION_BRACKET_CONTENT = String.raw`(?:(?=(?<atom>` + QUOTED_SPAN + String.raw`|[^\]]))\k<atom>)*`;

/**
 * One character-scope option bracket (no `>` after it) at the start of a
 * definition's code string: group 1 the bracket, group 2 the grammar's
 * internal atom, group 3 the text behind it. A code string is raw text, so the
 * bracket is read with the quote-aware grammar above: a quoted `]` does not end
 * it, and a part bracket holding one (`[data-x="a]b"]>C8`) is not mistaken for
 * a character bracket followed by junk.
 */
const CHARACTER_BRACKET_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)(.*)`);

/**
 * A definition's code string without the `>` leading it with no bracket before
 * it: an option region carrying nothing, which the DSL consumes before it reads
 * anything else (`>B291` is `B291`, `>[color=red]B291` is `[color=red]B291`).
 * Exactly one is consumed, as there.
 *
 * @param {string} codeString
 * @returns {string}
 */
export const withoutEmptyRegion = (codeString) => codeString.replace(/^>/, '');

/**
 * A definition's code string split into the character brackets leading it, in
 * order, and the text behind them, an empty option region before them read as
 * nothing (see withoutEmptyRegion). Shared by every reader of a definition's
 * code string as written: the parser's reading of a definition's own options
 * and of the code its first character is made of, the alias resolution that
 * reads through them, and the saves' reading of a rename, so none of them can
 * disagree about where such a bracket ends or what the code behind it is.
 *
 * @param {string} codeString
 * @returns {{ brackets: string[], body: string }}
 */
export const peelCharacterBrackets = (codeString) => {
  const brackets = [];
  let body = withoutEmptyRegion(codeString);
  let match;
  while ((match = body.match(CHARACTER_BRACKET_PATTERN)) !== null) {
    brackets.push(match[1]);
    body = match[3];
  }
  return { brackets, body };
};

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
 * Keys the emitters must never write as SVG attributes even though they reach
 * them in the author's bag.
 *
 * It used to hide the library's own computed values as well, which is no longer
 * a job anybody has: the options pass returns those in a separate bag, and the
 * only ones that reach the markup at all are the two the publication map
 * renames. What is left is position and kerning, which reach the emitters
 * through the author's bag whether the author wrote them in a bracket or the
 * parser promoted them there. Both spellings of each kerning key, because a
 * bracket carries the kebab one and without it an unrecognized
 * `relative-kerning` fell through to the attribute pass-through and landed in
 * the shipped SVG as `<g relative-kerning="3">`, which is not an attribute of
 * anything.
 */
export const INTERNAL_OPTIONS = new Set([
  'x',
  'y',
  'relativeKerning',
  'absoluteKerning',
  'relative-kerning',
  'absolute-kerning'
]);

/**
 * The only renaming on the way OUT: the two values the library computes that
 * also reach the markup, and the attribute names they reach it under.
 * Everything else in the computed bag is consumed by the emitters, and
 * everything in the author's bag is emitted exactly as the author typed it.
 * (`#toRaw` still renames on the way IN, translating the programmatic camelCase
 * spelling to the kebab one the options pass dispatches on; that is the other
 * direction and a different question.)
 *
 * It replaces a blanket `isNamedOptionKey ? camelToKebab : identity`, which was
 * the mechanism that let an author's raw key be renamed on its way out. Shared
 * by the root and the element scopes, which used to carry separate copies of the
 * same table and could therefore disagree.
 *
 * **Apply it only while building the published walk, never as a lookup over the
 * keys being emitted.** `strokeWidth` is a key here AND a spelling a bracket can
 * carry, and a bracket's `strokeWidth` is an author's key, so a shared lookup
 * renames the author's own key on its way out and leaves that one spelling
 * half-working: setting the attribute while computing nothing.
 *
 * A Map, not an object literal, so an inherited name (constructor, toString)
 * can never answer for a real key.
 */
export const PUBLICATION_MAP = new Map([
  ['strokeWidth', 'stroke-width'],
  ['color', 'stroke'],
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
 * The refusal of keys the transient channel cannot carry, in words shared by
 * the two places that refuse them: the admission stage, one key per report,
 * for a value with no text form, and the transient check, the keys of one
 * bag joined, for text.
 */
export const transientRefusalMessage = (keys) =>
  `"${keys.join('", "')}" cannot be a transient option: the value is read while the composition is built, not while it is drawn, so it would never reach the picture. Set it with setOptions() instead.`;

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
  // a numeric option given something that is not a number at all. INVALID_ is
  // the reserved verb for exactly this: OUT_OF_RANGE_ answers for a well-formed
  // number the attribute cannot carry, and the two are different repairs.
  INVALID_OPTION_VALUE: 'INVALID_OPTION_VALUE',
  // a numeric option given a well-formed number nothing can use: non-finite at
  // any scope, or negative where the quantity is a length. Refused rather than
  // clamped, because a clamp substitutes a value the author did not write and
  // says nothing about it.
  OUT_OF_RANGE_OPTION_VALUE: 'OUT_OF_RANGE_OPTION_VALUE',
  // every written value was accepted and the size they COMPUTE is what nothing
  // can carry: two terms sum past the largest double, or the six-times
  // presentation multiplier runs off the end of it. Separate from
  // OUT_OF_RANGE_OPTION_VALUE because no single value is out of range here;
  // MULTIPLE_GEOMETRY_VALUES is the precedent for a code no one key owns.
  OUT_OF_RANGE_COMPUTED_GEOMETRY: 'OUT_OF_RANGE_COMPUTED_GEOMETRY',
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
  // serialization while the character still renders. Content the author
  // explicitly positioned does not convict a preceding indicator (a compound
  // indicator's decomposed anatomy must round-trip); that asks whether an axis
  // was WRITTEN, not whether its value is non-zero, so `:0,0` carries the
  // exemption and `:,`, which writes no axis, does not. Neither does an
  // unclassifiable part (unknown code, error node).
  MISPLACED_INDICATOR_PART: 'MISPLACED_INDICATOR_PART',
  // a curated option written in the spelling only the JavaScript entry points
  // read (`[marginTop=3]`, or a hand-authored `{ marginTop: 3 }` options bag).
  // The right key in the wrong channel: those entry points translate camelCase
  // to the curated kebab spelling on the way in, and an option bracket does not,
  // so the key lands in the author's bag, is emitted as written and sets
  // nothing. Emitted rather than dropped, because it is a usable attribute name
  // and the pass-through rule is that such a name reaches the markup as typed.
  MISPLACED_OPTION_SPELLING: 'MISPLACED_OPTION_SPELLING',
  // a space code (TSP/QSP) in a `;`-part slot: a space is a word-level
  // separator, never a character part, so the space part is dropped from
  // render and serialization while the character still renders. A single-part
  // space glyph IS the space itself and is untouched; ZSA is content (a
  // positionable inkless shape) and is exempt.
  MISPLACED_SPACE: 'MISPLACED_SPACE',
  // too-many / duplicate
  MULTIPLE_HEAD_MARKERS: 'MULTIPLE_HEAD_MARKERS',
  MULTIPLE_OPTION_BRACKETS: 'MULTIPLE_OPTION_BRACKETS',
  // one option written twice under two spellings in one bag
  // (`[marginTop=3;margin-top=4]`, or `{ viewBox: …, 'view-box': … }`). Both
  // spellings name one option, so the second write displaces the first and the
  // last value written wins; the displaced value is named. Two writes of the
  // SAME spelling are a plain duplicate, visible in the source, and stay
  // silent. It reports more-than-one rather than value-lost, so two equal
  // values still raise it.
  MULTIPLE_OPTION_SPELLINGS: 'MULTIPLE_OPTION_SPELLINGS',
  // one part positioned twice: an `[x=N;y=M]>` option and the `:x,y` suffix on
  // the same part are two spellings of one value, so the option wins and the
  // coordinate it overrides is reported. A glyph-level `[x=N]` is a different
  // level (leading blank on the glyph) and composes with a part coordinate
  // instead of competing with it, so it never raises this.
  MULTIPLE_POSITION_VALUES: 'MULTIPLE_POSITION_VALUES',
  // one character kerned twice: the `RK:`/`AK:` markers and the long-form
  // `[relative-kerning=N]` / `[absolute-kerning=N]` options are spellings of
  // one value, so an option beats a marker, the last one written wins, and
  // every displaced value is named.
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
/**
 * A refused value as a refusal message should show it: as it was GIVEN, not as
 * it coerced. `[5]` reads as a list rather than as the number 5, which is the
 * whole reason it was refused, and a message built from the coerced form would
 * say a number is not a number.
 *
 * `JSON.stringify` throws on a value that refers back to itself, which an
 * ordinary parent/child config with a back-pointer does. Left unguarded that
 * throw escapes the constructor, so a caller who hands the builder a value it
 * cannot use gets no picture and no diagnosis instead of a refusal.
 */
const describeRefusedValue = (rawValue) => {
  try {
    return JSON.stringify(rawValue) ?? String(rawValue);
  } catch {
    return Object.prototype.toString.call(rawValue);
  }
};

/**
 * A value as the text a warning's `source` or a saved bracket writes, without
 * throwing. `String()` is the conversion everywhere it succeeds, so nothing it
 * can convert reads any differently.
 *
 * It fails on three plain literals, and that is why this exists: an object whose
 * `toString` is not a function (`{ toString: 5 }`, which `JSON.parse` produces
 * as readily as a hand-written literal), an object with no prototype, and a
 * `toString` that throws. Each is exactly the kind of value the library refuses,
 * so building the refusal must not be what fails: a throw here escapes the
 * constructor and hands the caller no picture and no diagnosis instead of a
 * report. On failure it falls back to the description a refusal message uses.
 */
export const textOfValue = (value) => {
  try {
    return String(value);
  } catch {
    return describeRefusedValue(value);
  }
};

/**
 * A written value read as a number, or NaN when it cannot be one, with the TYPE
 * deciding first: only a number, a bigint, or text that is not blank, is read.
 *
 * The same rule `judgeNumericOptionValue` applies to the numeric options, and
 * for the same reason. `Number()` reads `null`, `[]` and a blank string as 0 and
 * `[5]` as 5, so trusting it alone invents a value nobody wrote, and for a
 * position a 0 is not an absence: it moves the element to its own origin.
 * Shared by the position and kerning readers so the two cannot drift.
 */
export const writtenNumber = (value) => (
  typeof value === 'number' || typeof value === 'bigint'
    || (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : NaN
);

export const judgeNumericOptionValue = (key, rawValue) => {
  const policy = NUMERIC_OPTION_POLICY.get(key);
  if (!policy) return null;
  const tail = `so it was ignored: the ${policy.noun} keeps the value it would have had without it.`;
  // Guarded rather than interpolated: this judge now sees the RAW value on every
  // route, and a template literal throws on a symbol and on the three objects
  // `textOfValue` names. Every value that converts reads exactly as before.
  const source = rawValue === true ? key : `${key}=${textOfValue(rawValue)}`;
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
      message: `"${key}" needs a number and ${describeRefusedValue(rawValue)} is not one, ${tail}`,
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
 * The curated options that are SWITCHES rather than values. Each is read by
 * identity against `true`, so every other value means "off" and the ordinary
 * way to turn one off is to write something that is not `true`. Judging their
 * values would report on that.
 */
export const BOOLEAN_OPTION_KEYS = new Set(['center', 'grid', 'error-placeholder']);

/**
 * The curated options whose value reaches the document as TEXT, derived rather
 * than listed: everything in the curated vocabulary that is neither a number
 * nor a switch nor `key`, which names the element rather than anything in the
 * markup. Deriving it is what makes the sweep in
 * `BlissSVGBuilder.text-option-values.test.js` cover an option added later on
 * the day it lands, and it puts a new option in the GATED half by default,
 * which is the safe direction to be wrong in.
 */
export const TEXT_OPTION_KEYS = new Set(
  [...KNOWN_OPTION_KEYS].filter((key) => (
    !NUMERIC_OPTION_POLICY.has(key) && !BOOLEAN_OPTION_KEYS.has(key) && key !== 'key'
  ))
);

/**
 * True for a key whose value the library will write into the document as text.
 * A name the library does not curate at all is one of these too: it is emitted
 * as the author typed it, so whatever it carries becomes attribute text.
 *
 * `INTERNAL_OPTIONS` is exactly the set of uncurated names where that premise is
 * FALSE: position and kerning reach an emitter as geometry and never as text,
 * and each already has a gate of its own (MALFORMED_COORDINATES,
 * MALFORMED_KERNING_VALUE). Without the exemption a value with no text form on
 * one is refused as needing a text value, rather than in the words of the gate
 * that reports the same key everywhere else.
 */
export const isTextValuedOptionKey = (key) => (
  !INTERNAL_OPTIONS.has(key)
  && (TEXT_OPTION_KEYS.has(key) || !KNOWN_OPTION_KEYS.has(key))
);

/**
 * True when a value has a text form the author meant, which is what makes it
 * INPUT at all. Every primitive has one; `null`, `undefined` and everything
 * that is not a primitive have none.
 *
 * A boolean counts, INCLUDING as a text value: a bare key in a bracket
 * (`[myOwnAttr]`) arrives as `true`, so refusing booleans would refuse the
 * DSL's own shorthand.
 *
 * The null test is redundant on purpose, and measured so: `typeof null` is
 * 'object', so the object test already catches it. It is written out because
 * the rule is "non-primitive, null or undefined" and leaning on that quirk
 * would hide a third of the rule behind a JavaScript wart.
 *
 * Shared by the two gates that must agree on it: this is the whole test
 * `judgeTextOptionValue` applies, and it is also what `admitOptions` asks
 * before judging anything, since a value that IS text is input whether or not
 * the option can use it.
 */
const hasAuthoredTextForm = (value) => (
  value !== null && value !== undefined
  && typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'symbol'
);

/**
 * Judges one written value for a text-valued option, the string half of the
 * same gate `judgeNumericOptionValue` is the numeric half of. Same two arms and
 * no third: the value is refused, in which case the option falls back exactly
 * as if it had never been written, or it is honoured exactly as written.
 *
 * Nothing that is not a primitive is honoured, and neither is `null` or
 * `undefined`, because none of them has a text form the author meant.
 *
 * All six kinds reach the gate, including a function and a symbol: a
 * composition object cannot carry either, since `structuredClone` rejects both,
 * but the constructor's options argument and the mutation setters can, and
 * before `admitOptions` judged them they were stringified into the shipped
 * document as `stroke="() =&gt; 1"` and `stroke="Symbol(x)"` in silence.
 *
 * Without the gate, all of them were: `{color: null}` painted `stroke="null"`
 * on the symbol and `{'aria-label': {}}` shipped `[object Object]` as an
 * accessible name.
 *
 * Returns null when the value is honoured, so the caller assigns it; otherwise
 * the warning to report, and the caller assigns nothing.
 */
export const judgeTextOptionValue = (key, rawValue) => {
  if (!isTextValuedOptionKey(key)) return null;
  if (hasAuthoredTextForm(rawValue)) return null;
  const shown = describeRefusedValue(rawValue);
  // An option the library curates has a value of its own to fall back to; a
  // name it does not curate has none, so the honest thing to say about it is
  // that nothing is emitted under it at all.
  const tail = KNOWN_OPTION_KEYS.has(key)
    ? 'so it was ignored: the option keeps the value it would have had without it.'
    : 'so it was dropped and will not be emitted.';
  return {
    code: WARNING_CODES.INVALID_OPTION_VALUE,
    message: `"${key}" needs a text value and ${shown} is not one, ${tail}`,
    source: `${key}=${textOfValue(rawValue)}`,
  };
};

// What `source` carries, one rule for every refusal: THE WHOLE KEY when the
// NAME is what was refused, `key=value` when the VALUE is what was refused.
// `source` is documented as the fragment that triggered the warning, so it has
// to be a fragment the author can find in their own input and it has to name
// the thing that actually offended. `xmlns` is not a fragment of
// `[content--xmlns=x]`, and two refusals in one bracket that report the same
// string cannot be told apart; a value that was never looked at is noise.

// Why a reserved name is refused, one reason per name: the two reserved sets
// are guarded for different reasons and a single sentence covering both would
// be true of neither. A Map rather than an object literal, so an inherited
// name can never answer for a real one.
const RESERVED_ATTRIBUTE_REASONS = new Map([
  ['xmlns', 'declares what the file is rather than anything about the picture, and a second declaration moves everything under it out of SVG, where no renderer draws it'],
  ['data-generator', "is the library's own stamp recording what produced the file, and a stamp anyone can overwrite tells its reader nothing; record your own pipeline under a name of your own"],
]);

/**
 * The refusal of a reserved name, in words shared by every place that refuses
 * one. The reason is looked up on the NAME and the sentence quotes the
 * SPELLING. The two guards judge these names without regard to casing, since
 * an SVG placed inline in an HTML page has its attribute names lowercased
 * there, so a written `XMLNS` has to find `xmlns`'s reason while the author
 * still reads back the spelling they typed.
 */
export const reservedAttributeMessage = (name) =>
  `"${name}" ${RESERVED_ATTRIBUTE_REASONS.get(String(name).toLowerCase())}, so the written value was refused.`;

// The two names people reach for that the library spells another way: the
// kerning marker, which goes between characters, and SVG 1.1's namespaced link.
const unsafeNameHint = (key) => {
  if (/^(?:RK|AK):/.test(key)) return ` A kerning marker goes between two characters, as in B291/${key}/B313, not inside a bracket.`;
  if (key.toLowerCase() === 'xlink:href') return ' Write "href": SVG 2 dropped the xlink: prefix.';
  return '';
};

/** The refusal of a name the safety gate rejects, in words shared by every place that rejects one. */
export const unsafeAttributeNameMessage = (key) =>
  `"${key}" is not a usable attribute name (event handlers and names outside letters, digits and dashes are refused), so it was dropped and will not be emitted.${unsafeNameHint(key)}`;

// Why a target-prefixed key resolved to no target. All three shapes fail the
// same way, so they share a code, but each fails for its own reason and a
// message covering all three describes none of them: `content--` names a target
// we know perfectly well, and `--x` names none at all. The same split
// `parseLayerAttributeKey` makes, so the reason reported is the reason the key
// was actually rejected. The closing advice says where the attribute lands
// when written with no prefix, which is the root only in the global bracket:
// anywhere lower it lands on the element it is written on.
const unresolvedLayerKeyMessage = (key, level) => {
  const layer = key.slice(0, key.lastIndexOf('--'));
  const bareLandsOn = level === 'global' ? 'the root' : 'this element';
  const targets = `A target is a class the library writes, without the "bliss-" prefix, and the attribute follows the LAST "--": ${[...LAYER_TARGETS].join(', ')}. Write the attribute with no prefix to put it on ${bareLandsOn}.`;
  if (!LAYER_TARGETS.has(layer)) {
    return layer === ''
      ? `"${key}" has no target name before the "--", so there is nothing for it to target and nothing was emitted. ${targets}`
      : `"${key}" names no target the library knows, so nothing was emitted for it. ${targets}`;
  }
  return `"${key}" names the ${layer} target but no attribute after the "--", so there was nothing to emit.`;
};

/**
 * The report a target-prefixed key earns for its NAME, in the words of the
 * global form, or null when its name is one the global form emits.
 *
 * Three askers, so that none of them can word or rule it differently: the
 * global split, which reports it; the scope judge, which reports it IN PLACE
 * OF the misplacement when the same key is written below global scope; and
 * the name judge below. The lower report used to be the misplacement, whose
 * advice to move the key into the global bracket led the author straight to
 * this refusal without ever naming it.
 *
 * The order is the global form's: a key that resolves to no target is not
 * judged as an attribute name at all, and an unsafe name is reported before a
 * reserved one. The library's stamp is reserved behind the root prefix alone,
 * since on any other target it collides with nothing. A link attribute is not
 * here: the global form refuses it for what it does on a layer, not for its
 * name. `level` changes one sentence, the unknown target's closing advice.
 *
 * Asked only of a key `isLayerAttributeKey` accepts; any other key would be
 * read as a target that does not exist.
 *
 * @param {string} key - the stored option name, target-prefixed
 * @param {OptionScope['level']} [level] - where the key is written
 * @returns {{code: string, message: string, source: string} | null}
 */
export const layerKeyNameRefusal = (key, level = 'global') => {
  const target = parseLayerAttributeKey(key);
  if (!target) {
    return { code: WARNING_CODES.UNKNOWN_LAYER, message: unresolvedLayerKeyMessage(key, level), source: key };
  }
  if (!isSafeAttributeName(target.attribute)) {
    return { code: WARNING_CODES.UNSAFE_ATTRIBUTE_NAME, message: unsafeAttributeNameMessage(key), source: key };
  }
  if (isDocumentDefiningAttribute(target.attribute)
      || (target.layer === 'root' && isLibraryOwnedRootAttribute(target.attribute))) {
    return { code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME, message: reservedAttributeMessage(target.attribute), source: key };
  }
  return null;
};

/**
 * The report a key earns for its NAME alone, or null when no pass refuses
 * the name. One judge returns it, so every place that refuses a name words
 * it the same way.
 *
 * Two places report it, split by what the key holds. A value with no text
 * form cannot be stored, so the admission stage reports the name and drops
 * the key: left in the bag for a later pass to name, it was dropped first by
 * the JavaScript channels, with nothing said, or kept by a composition object
 * and saved as `[onclick=null]`. A text value is kept, and the pass that
 * refuses the name (the safety gate and the reserved-name guard in the
 * options pass and the root split, the layer-key split loop) reports it on
 * every load. Either way the name is the report worth having: told only that
 * `null` is not a text value, an author fixes the value and `nosuch--fill`
 * is just as dead, where the name refusal hands them the targets that exist.
 *
 * `level` is where the key is written, because one name is refused at one
 * place only: the library's stamp, which the root alone reads, so it is
 * refused written bare at global scope and behind the root prefix, and is an
 * ordinary name anywhere else. A caller that cannot know where the bag will
 * act (a definition's defaults, which act where the code is used, never on
 * the root) passes none. A target-prefixed key is judged in the words of the
 * global form, the only scope it reaches this judge from: written lower, the
 * scope judge refuses it first, in that scope's words.
 *
 * The two internal names in `INTERNAL_ONLY_SPELLINGS` are not here. They
 * name no option and refuse nothing: the pass-through emits a value written
 * under one, with a hint naming the option that works, so a value with no
 * text form on one is refused as on any name of your own.
 *
 * @param {string} key - the stored option name
 * @param {OptionScope['level']} [level] - where the key is written
 * @returns {{code: string, message: string, source: string} | null}
 */
export const optionNameRefusal = (key, level) => {
  if (isLayerAttributeKey(key)) return layerKeyNameRefusal(key);
  if (!isSafeAttributeName(key)) {
    return { code: WARNING_CODES.UNSAFE_ATTRIBUTE_NAME, message: unsafeAttributeNameMessage(key), source: key };
  }
  if (isDocumentDefiningAttribute(key) || (level === 'global' && isLibraryOwnedRootAttribute(key))) {
    return { code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME, message: reservedAttributeMessage(key), source: key };
  }
  return null;
};

/**
 * Whether a pass refuses the key's name. The render backstop asks it, to
 * leave the value gate off a key whose name refusal that pass reports
 * instead; answered by the stage's own judge, so the two cannot disagree.
 */
export const optionNameIsAlreadyRefused = (key, level) => optionNameRefusal(key, level) !== null;

/**
 * The refusal that keeps one written value OUT of the composition, or null when
 * nothing is refused.
 *
 * One test decides it, and it is a test on the value's TYPE rather than on
 * which option it was written on, so it governs every option that exists and
 * every option added later with no list to maintain. A value with no text form
 * the author meant is not input: it cannot be saved, cannot be read back and
 * cannot be fixed by reading it, so it is reported once and does not enter.
 * A value that IS text is input even when it is wrong for the option
 * (`crop=nope`), because the author can read it and fix it, so it is kept and
 * reported by the gate that knows what that option accepts.
 *
 * Asked after the scope judge, it names the first thing wrong with a key whose
 * value has no text form, in the words that thing is reported in everywhere
 * else: the channel (a key the transient channel refuses), then the name (a
 * name a later pass refuses), then the value. The value is dropped whichever
 * is named, since it cannot be stored, so naming the one the author has to fix
 * first costs nothing. A text value is not judged here at all: under a refused
 * name it is kept, and the pass that refuses the name reports it on every load.
 *
 * The judges are asked rather than the type test being reported directly, for
 * two reasons. They word the refusal for the option it landed on, so a number
 * option says it needs a number and a position is refused in its own gate's
 * words. And all of them returning null is what leaves unrefused the two kinds
 * of key no value can make wrong: a switch, on only when it is exactly `true`,
 * and the element key, which reaches neither the picture nor the saved text.
 * The element key then goes in whatever it holds; a switch holding no text
 * does not, like any value with no text form (`admitOptions` drops it, in
 * silence).
 */
const admissionRefusal = (key, value, scope) => {
  if (hasAuthoredTextForm(value)) return null;
  if (scope?.transient && TRANSIENT_REFUSED_OPTION_KEYS.has(key)) {
    return { code: WARNING_CODES.MISPLACED_TRANSIENT_OPTION, message: transientRefusalMessage([key]), source: key };
  }
  return optionNameRefusal(key, scope?.level)
    ?? judgeNumericOptionValue(key, value)
    ?? judgeTextOptionValue(key, value)
    ?? judgeGeometryOptionValue(key, value);
};

/**
 * Position and kerning under the same rule, reported the way their own gates
 * report, so a value refused here reads exactly like one refused further on.
 *
 * Their gates live downstream because a position and a kerning value are read
 * as geometry, not written as text, and a text refusal would name the wrong
 * thing. Leaving a value with no text form to those gates is what the JavaScript
 * channels could not do: they converted to text first, so a `null` there was
 * dropped in silence while the same `null` in a composition object was read as
 * a written 0, and an `undefined` was saved as `[x=undefined]`.
 */
const judgeGeometryOptionValue = (key, value) => {
  if (!INTERNAL_OPTIONS.has(key)) return null;
  const source = `${key}=${textOfValue(value)}`;
  return key === 'x' || key === 'y'
    ? {
        code: WARNING_CODES.MALFORMED_COORDINATES,
        message: `Malformed position "${source}"; the option is ignored.`,
        source,
      }
    : {
        code: WARNING_CODES.MALFORMED_KERNING_VALUE,
        message: `Malformed kerning value "${source}"; the option is ignored.`,
        source,
      };
};

/**
 * Some option keys mean something at exactly ONE scope. Written anywhere else
 * they are dropped with a warning rather than left in place, because an option
 * the library does not recognize AT THAT SCOPE falls through to the SVG
 * attribute pass-through (what `[data-*]` options are for), so a silent drop
 * would make a real option and a pass-through attribute look identical in the
 * source and behave differently with nothing said.
 *
 * One row per bound key set. A future key with a home scope of its own needs a
 * row and a warning code, not new machinery. `text` has no row: it is an
 * unimplemented stub at every level, so it is misplaced nowhere.
 *
 * Each report is two sentences. The first says what is wrong and is the same on
 * every route. The second says where the key belongs, and it is written in the
 * notation the author was using, since a bracket to paste is no help to someone
 * writing a JavaScript object.
 *
 * A row whose keys can carry a name the home scope refuses names that refusal
 * (`nameRefusal`) and the codes it can write (`nameRefusalCodes`). Sending such
 * a key home would only trade this report for that one, so it gets that one
 * here, and is dropped all the same, since no name would let it act here.
 */
const SCOPE_BOUND_OPTIONS = [
  {
    home: 'global',
    has: (key) => GLOBAL_ONLY_OPTION_KEYS.has(key),
    code: WARNING_CODES.MISPLACED_GLOBAL_OPTION,
    diagnosis: (written, level) => `Global option (${written}) ignored at ${level} level: it configures the whole SVG.`,
    fix: (written, scope) => `${documentHome(written, scope)} to apply it globally.`,
  },
  {
    home: 'character',
    has: (key) => Object.hasOwn(KERNING_OPTION_KEYS, key),
    code: WARNING_CODES.MISPLACED_KERNING_OPTION,
    diagnosis: (written, level) => `Kerning option (${written}) ignored at ${level} level: kerning is the gap before a character.`,
    // The RK:/AK: markers are code-string syntax, so only a bracket is offered them.
    fix: (_written, { notation }) => (notation === 'bracket'
      ? 'Write it on the character, or use the RK:/AK: marker before it.'
      : "Set it on the character's options."),
  },
  {
    home: 'global',
    has: (key) => isLayerAttributeKey(key),
    code: WARNING_CODES.MISPLACED_LAYER_OPTION,
    diagnosis: (written, level) => `Layer option (${written}) ignored at ${level} level: it names a layer of the whole SVG.`,
    fix: (written, scope) =>
      `${documentHome(written, scope)} to apply it, or write the attribute without a layer prefix to put it on this element.`,
    nameRefusal: layerKeyNameRefusal,
    nameRefusalCodes: [WARNING_CODES.UNKNOWN_LAYER, WARNING_CODES.UNSAFE_ATTRIBUTE_NAME, WARNING_CODES.RESERVED_ATTRIBUTE_NAME],
  },
];

// Where a key that acts on the whole SVG goes, in the author's own notation, as
// the start of the sentence that sends it there. A transient key goes to the
// transient channel's own top level, which is what keeps it transient.
const documentHome = (written, { notation, transient = false }) => {
  if (notation === 'bracket') return `Use [${written}]||`;
  if (notation === 'object') return `Put it in the composition's top-level ${transient ? 'transientOptions' : 'options'}`;
  return transient ? 'Pass it to builder.setTransientOptions()' : "Pass it in the builder's options";
};

/**
 * The refusal for one key written at a scope it cannot act on, or null when the
 * key is at home there or bound to no scope at all.
 *
 * The one judge of scope, whatever route the key arrived through, and asked only
 * by `admitOptions`: a DSL bracket and a JavaScript bag both reach it inside the
 * stage, in the same order against the same neighbours. One table read by one
 * function in one place is what keeps a key misplaced in a bracket and the same
 * key misplaced in an object from being reported differently, or one of them
 * not at all.
 *
 * `level` is the parser's vocabulary (`'global'`, `'group'`, `'character'`,
 * `'part'`) because the message prints it. `notation` is how the author wrote
 * the bag: `'bracket'` for the DSL, `'object'` for a composition object, and
 * `'setter'` for any options argument of a JavaScript call (the constructor's,
 * the handle setters', and the `opts` of the adding and replacing methods).
 * Only the second sentence of a report depends on it. `transient` marks a
 * transient bag, where a key the transient channel refuses outright is left to
 * that refusal (the stage's own for a value with no text form, the transient
 * check's for text): it refuses kerning at every level, so telling the author to
 * move a transient kerning value onto a character would only send them to the
 * second refusal.
 *
 * The report names the key as stored, and the value is written through
 * `textOfValue`, so building a report cannot throw on a value with no text form.
 * A key whose name the home scope refuses is reported by that refusal instead,
 * which names the key alone: it is the name that offended.
 *
 * @param {string} key - the stored (canonical) option name
 * @param {unknown} value - the value as written
 * @param {OptionScope} scope
 * @returns {{code: string, message: string, source: string} | null}
 */
const scopeRefusal = (key, value, scope) => {
  if (scope.transient && TRANSIENT_REFUSED_OPTION_KEYS.has(key)) return null;
  const rule = SCOPE_BOUND_OPTIONS.find((r) => r.home !== scope.level && r.has(key));
  if (!rule) return null;
  const nameRefusal = rule.nameRefusal?.(key, scope.level);
  if (nameRefusal) return nameRefusal;
  const written = value === true ? key : `${key}=${textOfValue(value)}`;
  return {
    code: rule.code,
    message: `${rule.diagnosis(written, scope.level)} ${rule.fix(written, scope)}`,
    source: written,
  };
};

/**
 * @typedef {object} OptionScope
 * @property {'global' | 'group' | 'character' | 'part'} level - where the bag is being written
 * @property {'bracket' | 'object' | 'setter'} notation - how the author wrote it
 * @property {boolean} [transient] - a transient bag
 */

/**
 * True when a report is one the scope judge wrote. For a caller that inspects a
 * bracket rather than ingesting it, and has to know whether the stage dropped a
 * key for its scope without re-deriving which keys are bound to one.
 *
 * A name refusal counts, since the judge writes one for a misplaced key whose
 * name is refused as well. Its codes are the judge's only among the stage's own
 * reports: the passes that refuse a name at render raise the same codes for
 * keys they keep, so this is asked of what the stage reported.
 *
 * @param {{code: string}} warning
 * @returns {boolean}
 */
export const isScopeRefusal = (warning) =>
  SCOPE_BOUND_OPTIONS.some((r) => r.code === warning.code || r.nameRefusalCodes?.includes(warning.code));

/**
 * The one stage an options bag passes through on its way INTO a composition:
 * the name is resolved, the value is judged, and what comes back is what the
 * composition will hold.
 *
 * Every ingest route runs it FIRST and nothing else resolves an option name, so
 * a route added later is judged whether or not its author knew this rule
 * existed. Four routes each deciding for themselves is what this replaces: a
 * composition object kept everything, the options argument and the mutation
 * setters dropped four kinds in silence, and a definition's defaults kept
 * everything, so one value saved through one channel and reloaded through
 * another changed what it meant.
 *
 * Entries in and entries out, rather than a bag in and a bag out, because the
 * routes differ in what they build and each still builds its own: the DSL's bag
 * has no prototype on purpose (a bracket may spell `__proto__`, and a plain
 * object built only to feed this stage would be a second place that bites), and
 * the JavaScript channels convert each value to text on the way into theirs.
 * What is shared is the judgement, which is the part that was drifting.
 *
 * The value is judged BEFORE the spelling is noted, so a value that never
 * enters cannot be named as displacing another. `{strokeWidth: 5,
 * 'stroke-width': null}` is why: the null is dropped and the 5 survives, so a
 * collision report would say the 5 was ignored when it is the value in force.
 * A switch holding a value with no text form never enters either, so it
 * displaces nothing: neither another spelling of the switch in the same bag
 * nor a `true` written in a lower layer, such as the builder's `defaults`,
 * which stays in force (`false` is what turns that off). It is dropped in
 * silence, since on its own it leaves the switch off anyway.
 *
 * The drop does not depend on there being anywhere to report it: every route
 * passes a warnings channel, and a caller that passes none still has the
 * refusal applied, with nobody told.
 *
 * Given the `scope` the bag is being written at, the stage also refuses a key
 * that cannot act there (`scopeRefusal`), and it asks that FIRST: where a key
 * cannot act, fixing its value would achieve nothing, so `{marginTop: null}` on
 * a character is reported once, as misplaced. Then, for a value with no text
 * form, the channel and the name, so `{x: null}` in a transient bag is
 * reported as a key that channel refuses and `{onclick: null}` as a name, each
 * in the words the same key earns with a text value. A key refused for its
 * scope is never noted as a spelling either, for the same reason a refused
 * value is not.
 * Without a scope nothing is judged for scope. That is a definition's
 * `defaultOptions`, and only those: the defaults attach wherever the definition
 * is used, which the stage cannot know when they are declared, and no key bound
 * to a scope can be among them, since `define()` refuses every one (canvas-wide,
 * target-prefixed, kerning) as a definition error. A definition's code string
 * is DSL text, so its brackets are judged at part scope wherever it is expanded.
 *
 * @param {Iterable<[string, unknown]>} writtenEntries - keys as written, with their values
 * @param {(warning: object) => void} [warn] - where to send a refusal
 * @param {OptionScope} [scope] - where the bag is being written, and how
 * @returns {Array<[string, unknown]>} the admitted entries, keys resolved
 */
export const admitOptions = (writtenEntries, warn, scope) => {
  const admitted = [];
  const noteSpelling = warn ? optionSpellingWatcher(warn) : () => {};
  for (const [writtenKey, value] of writtenEntries) {
    const key = canonicalOptionKey(writtenKey);
    const refusal = (scope ? scopeRefusal(key, value, scope) : null)
      ?? admissionRefusal(key, value, scope);
    if (refusal) {
      warn?.(refusal);
      continue;
    }
    // A switch is on only when it is exactly `true`, so on its own a value with
    // no text form leaves it off. It is dropped like every value with no text
    // form, so no save writes it and it displaces nothing, but without a report:
    // reporting it would scold a common way of saying off.
    if (BOOLEAN_OPTION_KEYS.has(key) && !hasAuthoredTextForm(value)) continue;
    noteSpelling(writtenKey, key, value);
    admitted.push([key, value]);
  }
  return admitted;
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
