/**
 * The attribute names a standard owns in a fixed spelling, and the lookup that
 * resolves any casing or hyphenation of one back to that spelling.
 *
 * An author writing `view-box`, `viewbox` or `VIEWBOX` means SVG's `viewBox`.
 * A single lookup recovers all three shapes: strip the hyphens, lowercase, and
 * read off the owner's spelling. A name that answers nothing is a name nobody
 * owns, and those are emitted exactly as written.
 *
 * PROVENANCE, so this list can be regenerated rather than guessed at:
 *
 *   source   SVGO 4.0.1, `plugins/_collections.js` (MIT), retrieved 2026-09-10
 *            from https://cdn.jsdelivr.net/npm/svgo@4.0.1/plugins/_collections.js
 *   recipe   for each element in SVG_ELEMENT_BASIS, union `elems[el].attrs`
 *            with every `attrsGroups[g]` named by `elems[el].attrsGroups`;
 *            then drop namespaced names, then add the link attributes below.
 *   minus    namespaced names (`xlink:*`, `xml:*`). The option-key grammar
 *            splits on the colon before any lookup could see them, so owning
 *            them here would be a promise the entry points cannot keep.
 *   plus     the SVG 2 link attributes the library routes onto an `<a>`:
 *            href, rel, download, hreflang, referrerpolicy. SVGO's collections
 *            describe SVG 1.1, which knows only `xlink:href`, so the five names
 *            the library already emits are absent upstream. `target` and `type`
 *            come through the 1.1 union already.
 *   census   116 names: 13 camelCase, 50 hyphenated, 53 single-word, resolving
 *            to 116 distinct normalized keys.
 *
 * The list is pinned here rather than generated at build time. Its invariants
 * are carried by `tests/BlissSVGBuilder.svg-attribute-vocabulary.test.js`: one
 * test fails if two names ever collapse onto one key, another fails the day the
 * library emits an element this basis does not name.
 *
 * Scoped deliberately to the elements the library emits, and no wider. Every
 * name here is one the library may rewrite on the author's behalf, so a longer
 * list is a larger surface on which to rename something an author meant
 * literally. Generic SVG words like `in`, `result`, `mode` and `values` belong
 * to elements we do not emit, and stay out.
 */

/**
 * The elements the library puts in its output. Confirmed against the rendered
 * markup rather than read off the source: the vocabulary above is a union over
 * exactly these, so a feature that emits a tenth element leaves the vocabulary
 * short until it is added here.
 */
export const SVG_ELEMENT_BASIS = Object.freeze(new Set([
  'a', 'desc', 'g', 'path', 'rect', 'style', 'svg', 'text', 'title',
]));

/** The owner's spelling of every attribute name in scope. */
export const SVG_ATTRIBUTE_NAMES = Object.freeze(new Set([
  'alignment-baseline', 'baseProfile', 'baseline-shift', 'class', 'clip', 'clip-path',
  'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile',
  'color-rendering', 'contentScriptType', 'contentStyleType', 'cursor', 'd', 'direction',
  'display', 'dominant-baseline', 'download', 'dx', 'dy', 'enable-background',
  'externalResourcesRequired', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color',
  'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style',
  'font-variant', 'font-weight', 'glyph-orientation-horizontal', 'glyph-orientation-vertical',
  'height', 'href', 'hreflang', 'id', 'image-rendering', 'lengthAdjust', 'letter-spacing',
  'lighting-color', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'media', 'onabort',
  'onactivate', 'onclick', 'onerror', 'onfocusin', 'onfocusout', 'onload', 'onmousedown',
  'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onresize', 'onscroll', 'onunload',
  'onzoom', 'opacity', 'overflow', 'paint-order', 'pathLength', 'pointer-events',
  'preserveAspectRatio', 'referrerpolicy', 'rel', 'requiredExtensions', 'requiredFeatures',
  'rotate', 'rx', 'ry', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'style', 'systemLanguage', 'tabindex',
  'target', 'text-anchor', 'text-decoration', 'text-overflow', 'text-rendering', 'textLength',
  'title', 'transform', 'transform-origin', 'type', 'unicode-bidi', 'vector-effect', 'version',
  'viewBox', 'visibility', 'width', 'word-spacing', 'writing-mode', 'x', 'y', 'zoomAndPan',
]));

/**
 * The form every spelling of one name collapses to. Hyphens carry no meaning
 * once a name is known, and neither does case, so `stroke-dasharray`,
 * `strokeDasharray` and `STROKEDASHARRAY` all answer to `strokedasharray`.
 */
export const normalizeAttributeName = (name) => String(name).replace(/-/g, '').toLowerCase();

const OWNER_SPELLINGS = new Map(
  [...SVG_ATTRIBUTE_NAMES].map((name) => [normalizeAttributeName(name), name]),
);

/**
 * The owner's spelling of a written name, or `undefined` when no standard owns
 * it. `undefined` is the answer that keeps an author's own name verbatim, so
 * callers must treat it as "leave this alone" rather than as a failure.
 */
export const svgAttributeSpelling = (name) => OWNER_SPELLINGS.get(normalizeAttributeName(name));
