/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes, isSpaceGlyph } from "./bliss-element-definitions.js";
import { INTERNAL_OPTIONS, PUBLICATION_MAP, ANCHOR_ATTRIBUTE_NAMES, BAND_HEIGHT, HIT_MARGIN, PART_HIT_MARGIN, INK_AREA_MARGIN, DEFAULT_STROKE_WIDTH, ELEMENT_CLASSES, BACKGROUND_AREA_ELEMENTS, isDocumentDefiningAttribute, isSafeAttributeName, generateKey, MAX_RECURSION_DEPTH, WARNING_CODES, writtenWidth, cssNumber } from "./bliss-constants.js";
import { createTextFallbackGlyph } from "./bliss-shape-creators.js";
import { basePartCount, classifyIndicatorKind } from "./indicator-utils.js";
import { resolveHeadIndex, headScanCode } from "./bliss-head-glyph-exclusions.js";
import { translateFilters, filterReach, splitDeclarations } from "./bliss-filters.js";

// Horizontal gap (in glyph units) between consecutive indicators in a stack.
// Shared by the character-level indicator layout (#positionIndicatorGroup) and
// the nested compound-indicator layout (#handleCompositeElement) so the two
// cannot drift.
const INDICATOR_GAP = 1;

// Rounds a number the tree writes into a rect as the builder rounds the
// picture's own (4 decimals), which removes the float noise of summed positions.
const roundForMarkup = (num) => parseFloat(num.toFixed(4));

// Attributes as markup, from [name, value] pairs in the order they are written.
const formatEntries = (entries) => entries.map(([name, value]) => `${name}="${value}"`).join(' ');

// The smallest box ({ minX, minY, maxX, maxY }) holding every one of `boxes`
// (at least one).
const unionOf = (boxes) => ({
  minX: Math.min(...boxes.map(box => box.minX)),
  minY: Math.min(...boxes.map(box => box.minY)),
  maxX: Math.max(...boxes.map(box => box.maxX)),
  maxY: Math.max(...boxes.map(box => box.maxY)),
});

// A box grown by `distance` on every side; undefined stays undefined (nothing drawn).
const grownBy = (box, distance) => box && {
  minX: box.minX - distance,
  minY: box.minY - distance,
  maxX: box.maxX + distance,
  maxY: box.maxY + distance,
};

// The attributes of an element's own <g> that reach its background as well as
// its lines: what moves, clips, fades or hides the element as a whole. Paint
// stays with the lines, and so do `class` and `id`, and how the lines blend,
// take clicks or scale (`mix-blend-mode`, `isolation`, `pointer-events`,
// `cursor`, `vector-effect`).
const EFFECT_ATTRIBUTES = new Set([
  'transform', 'transform-origin', 'transform-box',
  'opacity', 'filter', 'clip-path', 'mask', 'display', 'visibility',
]);

// The joins and caps that draw no further from a line than half its width,
// as a renderer reads their words, in any case; and the miter limit a
// renderer draws where no `stroke-miterlimit` reads as one.
const HALF_WIDTH_JOINS = new Set(['round', 'bevel']);
const HALF_WIDTH_CAPS = new Set(['round', 'butt']);
const INITIAL_MITER_LIMIT = 4;

// A written `stroke-miterlimit` read as a renderer reads a number (cssNumber)
// at or above 1, the only limits a renderer reads, else undefined.
const writtenMiterLimit = (value) => {
  const limit = cssNumber(value);
  return Number.isFinite(limit) && limit >= 1 ? limit : undefined;
};

// Whether a written join or cap is drawn as one of `words`; a line no key
// reaches is drawn with the library's round ones. The word is trimmed only
// of the whitespace CSS skips: a renderer refuses one padded with any other
// space (a no-break space) and draws the inherited join or cap. CSS ignores
// case only in ASCII letters; JavaScript's lowercasing turns no other letter
// into one of these words' letters, so the two agree on these words.
const drawnAs = (value, words) => value === undefined
  || words.has(String(value).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '').toLowerCase());

export class BlissElement {
  //#region Private Properties
  #key
  #level
  #blissObj
  #extraPathOptions
  #isCharacter
  #isShape
  #isBlissGlyph
  #isExternalGlyph
  #leafX
  #leafY
  #leafWidth
  #leafHeight
  #anchorOffsetX
  #anchorOffsetY
  #advanceX
  #children
  #relativeToParentX
  #relativeToParentY
  #codeName
  #char
  #externalGlyphSpacing
  #isSpaceGroup
  #holdsOnlySpaces
  #isEmptyGlyph
  #isEmptyGroup
  //#endregion
  #childStartOffset
  #parentElement;
  #previousElement;
  #classifiedParts; // Cached result of #classifyParts (level 2 only)
  #isFused = false; // Two or more base parts: no spacing data (level 2 only)
  #linkArea; // { left, right, padding } in its own frame, set by the root once the layout is final (levels 1 and 2)
  #paintArea; // the same for its background, the paddings shared between painted neighbours instead

  /**
   * Stamps a non-inherited `vector-effect` onto bare <path> elements.
   *
   * vector-effect does not inherit and has no rendering effect on a <g>, so a
   * pass-through vector-effect is relocated from the group onto each descendant
   * <path> that does not already declare one. Innermost scope wins, because
   * inner groups are rendered before their enclosing content.
   *
   * @param {string} content - inner SVG string (may contain nested <g>/<path>)
   * @param {string} value - already-escaped vector-effect value
   * @returns {string} content with vector-effect applied to bare <path> elements
   */
  static applyVectorEffectToPaths(content, value) {
    // Skip empty placeholder paths (<path d=""/>): they draw nothing and are
    // stripped later, so stamping them would defeat that cleanup. Skip paths
    // that already declare a vector-effect so an inner scope wins.
    return content.replace(/<path (?!d="")(?![^>]*\bvector-effect=)/g, () => `<path vector-effect="${value}" `);
  }

  /**
   * Whether an `href` may build a link: an address with no scheme (a path, a
   * query or a fragment, read relative to the document), or a web, mail or
   * phone address. Any other scheme (`javascript:`, `data:`, `ftp:`) builds
   * none: an allowlist stays safe as browsers learn new schemes. An `href`
   * that holds no address builds none either: none written (the global link
   * asks with `undefined`), a bare key (stored as `true`, which the author
   * never wrote as an address) or a blank value.
   *
   * The scheme is read by the URL grammar a browser uses (a letter, then
   * letters, digits, `+`, `-` or `.`, up to a colon), after removing the ASCII
   * control characters and trimming the ends. That removes more than a browser
   * does, so a scheme the browser would find is never missed (`java\tscript:`
   * is still `javascript:`); the value written into the link is the one the
   * author gave. It is judged as stored, escaped, and the escaping is what
   * keeps a character reference from spelling a scheme: `&#106;avascript:`
   * reaches the browser as that text, a relative path. Shared by every level's
   * link and the global one the builder draws, so the two cannot disagree.
   *
   * @param {*} value - the href as stored (already escaped), or undefined
   * @returns {boolean}
   */
  static isSafeHref(value) {
    if (value == null || value === true) return false;
    const cleaned = String(value).replace(/[\x00-\x1f\x7f]/g, '').trim();
    if (cleaned === '') return false;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1];
    return scheme === undefined || /^(https?|mailto|tel)$/i.test(scheme);
  }

  /**
   * Wraps content with <a> and/or <g> tags based on options.
   * Ensures consistent wrapping behavior across all element levels.
   *
   * A link's first child is a transparent rect over the element's area: a
   * link is hit only where something paints, and the rect paints that area
   * without showing (`transparent` is a paint, `none` is not), so the link
   * answers a click anywhere in it and not only on the strokes. Under
   * `link-area=ink` its lines, drawn again in transparent, take the rect's
   * place (#linkHit). Either sits inside the element's own <g>, so a
   * `transform` or `pointer-events` written there governs it too, and before
   * the content, so the element's ink and any nested link paint over it: a
   * part's link wins over its character's, a character's over its word's, and
   * a later part's over an earlier one's.
   *
   * A link that holds another link and has no <g> of its own puts its content
   * in a bare one: Chromium and WebKit draw nothing of an <a> whose parent is
   * an <a> (SVG 1.1 lets an a element hold anything but itself).
   *
   * A CSS filter among the group's attributes is drawn as a native one
   * (`filters`): its <filter> is the group's first child, then the shape that
   * keeps a thin element drawn, then what the group holds, the link's rect
   * included.
   *
   * @param {string} content - The content to wrap (raw path data or HTML string)
   * @param {Object} processed - The library's computed values, of which only the
   *   two in PUBLICATION_MAP reach the markup
   * @param {Object} authored - The author's own keys, emitted as they were typed
   * @param {function(): string} linkHit - the markup that makes a link answer a
   *   click, drawn first inside it; called only for an element that builds a
   *   link, and '' where it covers nothing
   * @param {function(Array, boolean): Object} filters - translateFilters for
   *   this element (#ownFilters), over the group's attribute entries, told
   *   whether the element builds a link
   * @returns {string} The wrapped content
   */
  static #wrapWithAnchorAndGroup(content, processed, authored, linkHit, filters) {
    const { anchorAttrs, groupEntries, hasHref, vectorEffect } = BlissElement.#separateAnchorAndGroupOptions(processed, authored);
    const { entries, defs, shape } = filters(groupEntries, hasHref);
    const groupAttrs = formatEntries(entries);
    const lead = defs.join('') + shape;

    // Content that starts with '<' is already wrapped in proper tags
    // Raw path data or fragments need wrapping
    const needsPathWrapper = !content.startsWith('<');

    // vector-effect is non-inherited: relocate it onto the <path>, not the <g>.
    const stamp = (inner) => vectorEffect ? BlissElement.applyVectorEffectToPaths(inner, vectorEffect) : inner;

    if (hasHref) {
      const hit = linkHit();
      const inner = stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
      if (groupAttrs) {
        return `<a ${anchorAttrs} style="cursor: pointer;"><g ${groupAttrs}>${lead}${hit}${inner}</g></a>`;
      }
      const body = content.includes('<a ') ? `<g>${inner}</g>` : inner;
      return `<a ${anchorAttrs} style="cursor: pointer;">${hit}${body}</a>`;
    }

    if (groupAttrs) {
      const wrappedContent = stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
      return `<g ${groupAttrs}>${lead}${wrappedContent}</g>`;
    }

    if (vectorEffect) {
      return stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
    }

    return content;
  }

  /** A link's hit rect, its numbers rounded as the picture's own are. */
  static #hitRect({ x, y, width, height }) {
    const round = roundForMarkup;
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" fill="transparent" stroke="none"/>`;
  }

  /**
   * A linked or painted part's area: its ink box plus its `padding`
   * (#areaPadding) on every side.
   */
  static #inkHitBox({ minX, minY, width, height }, padding) {
    return {
      x: minX - padding,
      y: minY - padding,
      width: width + 2 * padding,
      height: height + 2 * padding,
    };
  }

  /**
   * A linked or painted word's or character's area: its link area or its paint
   * area across the band plus the area's padding above and below, placed from
   * its frame's origin. Null without an area, as for a word of no characters. A
   * character overlapped by both neighbours can be left an area of no width,
   * never a negative one.
   */
  static #bandHitBox(originX, originY, area) {
    if (!area) return null;
    return {
      x: originX + area.left,
      y: originY - area.padding,
      width: Math.max(0, area.right - area.left),
      height: BAND_HEIGHT + 2 * area.padding,
    };
  }

  /**
   * The two kinds of area an element can have, each read from its own two
   * options: its link's, where a click answers, and its background's. `has`
   * says whether an element has an area of the kind; `keep` stores a word's
   * or a character's in its own frame (#assignAreas).
   */
  static #LINK_AREAS = {
    padding: 'linkPadding',
    shape: 'linkArea',
    has: element => element.#buildsLink,
    keep: (element, area) => { element.#linkArea = area; },
  };
  static #PAINT_AREAS = {
    padding: 'backgroundPadding',
    shape: 'backgroundArea',
    has: element => element.#background !== '',
    keep: (element, area) => { element.#paintArea = area; },
  };

  /**
   * How far this element's area of `kind` reaches past what it surrounds: the
   * padding it inherits, else the default for the area's shape, INK_AREA_MARGIN
   * past an ink area's lines, HIT_MARGIN past a word's or a character's band
   * and base span, PART_HIT_MARGIN past a part's ink box. A word's or a
   * character's may reach less toward a neighbour (#assignAreas).
   */
  #areaPadding(kind) {
    const padding = this.#getInheritedOption(kind.padding);
    if (padding !== undefined) return padding;
    if (this.#getInheritedOption(kind.shape) === 'ink') return INK_AREA_MARGIN;
    return this.#level <= 2 ? HIT_MARGIN : PART_HIT_MARGIN;
  }

  /**
   * How far this word's or character's area of `kind` reaches past the base
   * span of `glyph` (this character, or one of this word's) toward a
   * neighbour, before any sharing: a box its padding, an ink area half the
   * glyph's line width plus its padding, as its lines run along the span's
   * edge.
   */
  #reach(kind, glyph) {
    const padding = this.#areaPadding(kind);
    if (this.#getInheritedOption(kind.shape) !== 'ink') return padding;
    return (glyph.#getInheritedOption('strokeWidth') ?? DEFAULT_STROKE_WIDTH) / 2 + padding;
  }

  /**
   * How far an area of `padding` reaches toward a neighbour across `gap`, when
   * the neighbour's own area of its kind reaches `other` toward it, or does
   * not exist (null): min(padding, max(gap / 2, gap - other)). Two that both
   * reach halfway meet there; one that stops short keeps its padding and the
   * other reaches to meet it, as far as its own allows, so neither passes the
   * other's lines. With no area to share, the full padding at any gap.
   */
  static #share(padding, other, gap) {
    if (other === null) return padding;
    return Math.min(padding, Math.max(gap / 2, gap - other));
  }

  /**
   * Whether this word or character draws a link of its own: judged by the
   * walk its wrap makes, so a refused href counts as no link here too.
   */
  get #buildsLink() {
    return BlissElement.#separateAnchorAndGroupOptions(this.#blissObj.options, this.#blissObj.authoredOptions).hasHref;
  }

  /**
   * The paint this element's own `background` puts behind it, or '' for none.
   * Never inherited: a word's background is one area, never one per
   * character, or a translucent paint would darken where two overlap. An empty
   * value paints nothing, as at global scope.
   */
  get #background() {
    return this.#blissObj.options?.background ?? '';
  }

  /**
   * Gives every word and character its link area and its paint area, in its
   * own frame (root only, once the layout is final). The two are built alike,
   * each from its own padding (#areaPadding) and sharing it only with
   * neighbours of its own kind. A character's area runs across its base span,
   * indicators ignored, plus its padding on each side. Toward a neighbour with
   * an area of the same kind (the next character in reading order, across a
   * word space too, by its own area or its word's) it reaches only as far as
   * #share allows, the neighbour reaching the larger of its own area's reach
   * and its word's (#reach); toward any other it keeps its padding at any gap,
   * since no other area is there to share it. A word's area joins its
   * characters' areas, each built again from the word's own padding. A part's
   * link or background, or the global one, does not count for its character.
   * Done here because a character cannot see a neighbour in another word from
   * its own frame. Spaces and characters that draw nothing are not characters
   * here: no area of their own, and no neighbour to anyone.
   */
  #assignAreas() {
    // Base spans in the root's frame, in reading order.
    const characters = this.#children
      .filter(group => !group.#isSpaceGroup)
      .flatMap(group => group.#children
        .filter(glyph => glyph.#children.length > 0)
        .map(glyph => {
          const origin = group.#relativeToParentX + glyph.#relativeToParentX;
          const { left, right } = glyph.#baseSpan;
          return { group, glyph, origin, left: origin + left, right: origin + right };
        }));

    for (const kind of [BlissElement.#LINK_AREAS, BlissElement.#PAINT_AREAS]) {
      // How far the areas of this kind on each character reach toward a
      // neighbour, its own and its word's, the larger counting; null for none.
      const reaches = characters.map(({ group, glyph }) => {
        const holders = [group, glyph].filter(kind.has);
        return holders.length > 0 ? Math.max(...holders.map(holder => holder.#reach(kind, glyph))) : null;
      });
      const words = new Map(); // group -> its characters' areas at its padding, joined, in the root's frame
      characters.forEach(({ group, glyph, origin, left, right }, i) => {
        const previous = characters[i - 1];
        const next = characters[i + 1];
        const extent = padding => ({
          left: left - (previous ? BlissElement.#share(padding, reaches[i - 1], left - previous.right) : padding),
          right: right + (next ? BlissElement.#share(padding, reaches[i + 1], next.left - right) : padding),
        });
        const padding = glyph.#areaPadding(kind);
        const own = extent(padding);
        kind.keep(glyph, { left: own.left - origin, right: own.right - origin, padding });
        const inWord = extent(group.#areaPadding(kind));
        const word = words.get(group) ?? inWord;
        words.set(group, { left: Math.min(word.left, inWord.left), right: Math.max(word.right, inWord.right) });
      });

      for (const [group, { left, right }] of words) {
        const origin = group.#relativeToParentX;
        kind.keep(group, { left: left - origin, right: right - origin, padding: group.#areaPadding(kind) });
      }
    }
  }

  /**
   * What makes this element's link answer a click, drawn first inside the
   * link: a transparent rect over `box()`, its area, or where the `link-area`
   * it inherits is `ink`, its lines drawn again in transparent (#inkArea), so
   * only the lines and its link's padding around them answer. The group sets
   * `fill="none"` for the reason an ink background does (#backgroundMarkup).
   * '' where it covers nothing. `x` and `y` are the origin of the frame this
   * element sits in, as getSvgContent takes them.
   */
  #linkHit(x, y, box) {
    if (this.#getInheritedOption('linkArea') === 'ink') {
      // drawn inside this element's own group, so inside its join and cap
      const paint = 'transparent';
      const ink = this.#inkArea(x, y, paint, this.#areaPadding(BlissElement.#LINK_AREAS), undefined, this.#lineGroups(this.#contentFrame));
      return ink ? `<g fill="none" stroke="${paint}" stroke-width="${ink.width}">${ink.lines}</g>` : '';
    }
    const area = box();
    return area ? BlissElement.#hitRect(area) : '';
  }

  /**
   * Where this element's link answers a click (#linkHit), as { minX, minY,
   * maxX, maxY }: under `link-area=ink` its lines widened by the link's
   * padding, as the ink area draws them, else `box()`; undefined where it
   * covers nothing.
   */
  #linkBox(x, y, box) {
    if (this.#getInheritedOption('linkArea') === 'ink') {
      return grownBy(this.#drawnBox(x, y), this.#areaPadding(BlissElement.#LINK_AREAS));
    }
    const area = box();
    return area ? { minX: area.x, minY: area.y, maxX: area.x + area.width, maxY: area.y + area.height } : undefined;
  }

  /**
   * This element's lines as an ink area draws them: rendered again in the
   * halo mode getSvgContent takes, in `paint`, each line widened by twice the
   * area's `padding` and each letter filled in `paint` and outlined by as much.
   * Returns the lines; the width a group strokes them at (the element's
   * computed width, widened alike); and that group as #lineWidth and
   * #lineGroups read it, the lines a copy inside `groups`, the attributes of
   * the groups around them, nearest first (#lineGroups). Its width is the
   * computed one unless an author's key writes one, `written`: that one where
   * it reads as a width (writtenWidth), else the width the group inherits,
   * the content group's (the area is drawn in it), where that is the wider.
   * Null where it draws no line,
   * as ZSA does. Built from the widths the library computes: of the element's
   * own attributes only its effects reach its ink area, on the copy the layer
   * puts around it (#backgroundLayer), and its descendants' effects reach
   * their lines inside it (#haloWrap).
   */
  #inkArea(x, y, paint, padding, written, groups) {
    const outline = 2 * padding;
    const width = (this.#getInheritedOption('strokeWidth') ?? DEFAULT_STROKE_WIDTH) + outline;
    // a tree outside a picture has no content group, and the computed width stands
    const drawn = written === undefined ? width : writtenWidth(written) ?? Math.max(width, this.#contentFrame.width ?? width);
    const frame = { top: this, width: drawn, extra: outline, copy: true, groups };
    const lines = this.getSvgContent(x, y, { paint, outline, element: this, frame });
    if (lines === '') return null;
    return {
      lines: lines.startsWith('<') ? lines : `<path d="${lines}"/>`,
      width: roundForMarkup(width),
      frame,
    };
  }

  /**
   * This element's content in the halo mode of getSvgContent, where it writes
   * none of its wrappers (no link, no paint, no class or id) but a width of
   * its own, re-stated widened, and its effects (#effectEntries), on one
   * group exactly where its ink has its own, so the area moves, clips and
   * hides with the lines. The painted element's own width goes on its ink
   * area's group instead, and its own effects on the copy around the area
   * (#backgroundLayer). Content with no line stays empty, so an area around
   * no line draws nothing, whatever group its element writes. A filter in
   * the copy is drawn as its own native one, covering the lines at the widths
   * the area draws them (`halo.frame`, #inkArea) and what the copies inside
   * it draw past them. `x` and `y` are the origin of the frame this element
   * sits in, as getSvgContent takes them.
   */
  #haloWrap(content, halo, x, y) {
    if (halo.element === this || content === '') return content;
    const options = this.#blissObj.options ?? {};
    const width = Object.hasOwn(options, 'strokeWidth')
      ? [['stroke-width', roundForMarkup(options.strokeWidth + halo.outline)]]
      : [];
    const { entries, defs } = translateFilters([...width, ...this.#effectEntries],
      () => ({ drawn: this.#drawnBox(x, y, halo.frame), outset: this.#filterOutset(halo.frame) }), this.#sharedOptions.filters);
    if (entries.length === 0) return content;
    const lines = content.startsWith('<') ? content : `<path d="${content}"/>`;
    return `<g ${formatEntries(entries)}>${defs.join('')}${lines}</g>`;
  }

  /**
   * This element's effects (EFFECT_ATTRIBUTES), as its own <g> writes them
   * and in its order, as [name, value] pairs: each effect attribute, and a
   * `style` cut down to its effect declarations (#effectDeclarations), left
   * out where it has none. Read from the walk that writes the <g>, so an
   * attribute refused there is never copied. Empty where the element has no
   * effect.
   */
  get #effectEntries() {
    const { groupEntries } = BlissElement.#separateAnchorAndGroupOptions(this.#blissObj.options, this.#blissObj.authoredOptions);
    return groupEntries.flatMap(([name, value]) => {
      if (EFFECT_ATTRIBUTES.has(name)) return [[name, value]];
      const effects = name === 'style' ? BlissElement.#effectDeclarations(value) : '';
      return effects ? [['style', effects]] : [];
    });
  }

  /**
   * The declarations of a `style` value whose property is an effect, as
   * written and in order, joined by `;`; '' where none is. Read as the filter
   * translation reads a style (splitDeclarations), so the copy carries every
   * filter its lines draw: split at each `;` outside parentheses, quotes,
   * escapes and comments, a property read in any case, spacing and comments.
   */
  static #effectDeclarations(style) {
    return splitDeclarations(style)
      .filter(({ property }) => EFFECT_ATTRIBUTES.has(property))
      .map(({ text }) => text)
      .join(';');
  }

  /**
   * What this element's own background draws, in the content's coordinates,
   * from the origin of the frame it sits in, by the `background-area` it
   * inherits: `{ area: 'box', box }` or `{ area: 'ink', lines, width }`
   * (#inkArea), each with `drawn`, the box it covers ({ minX, minY, maxX,
   * maxY }), at the widths it is drawn with once the keys that reach it
   * (`levels`, #backgroundKeyLevels) are written on it; null where it draws
   * none. A word's or a character's box is its paint area across the band, a
   * part's its ink box plus its padding: the shapes a link's area takes. An
   * ink area draws nothing where there is no line. A word or a character with
   * no paint area draws nothing: a word of no characters, a character that
   * draws nothing, and the root, which is never given one, as its background
   * is the picture's own, drawn by the builder.
   */
  #backgroundDrawing(x, y, levels) {
    if (this.#background === '') return null;
    if (this.#level <= 2 && !this.#paintArea) return null;
    if (this.#getInheritedOption('backgroundArea') === 'ink') {
      const padding = this.#areaPadding(BlissElement.#PAINT_AREAS);
      // drawn in the content group, outside the element's own group
      const authored = this.#authoredBackground('ink', levels);
      const ink = this.#inkArea(x, y, this.#background, padding, authored['stroke-width'], [authored, ...this.#contentFrame.groups]);
      return ink && { area: 'ink', lines: ink.lines, width: ink.width, frame: ink.frame, drawn: this.#drawnBox(x, y, ink.frame) };
    }
    const box = this.#level <= 2
      ? BlissElement.#bandHitBox(this.#relativeToParentX + x, this.#relativeToParentY + y, this.#paintArea)
      : BlissElement.#inkHitBox(this.#calculateBounds(x, y), this.#areaPadding(BlissElement.#PAINT_AREAS));
    // The rect is drawn with no stroke (#backgroundMarkup). One a key writes
    // is drawn at the width a key writes on the rect, else at the content
    // group's: the effect copies around the rect write no width.
    const { stroke, 'stroke-width': width } = this.#authoredBackground('box', levels);
    const outline = stroke !== undefined && stroke !== 'none' ? writtenWidth(width) ?? this.#contentFrame.width : 0;
    return { area: 'box', box, drawn: grownBy({ minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height }, outline / 2) };
  }

  /**
   * What the keys that reach this element's background (`levels`,
   * #backgroundKeyLevels) write on the `area` it draws, as { name: value }:
   * the author's attributes and the class every layer carries, none of the
   * values the library computes for the area.
   */
  #authoredBackground(area, levels) {
    const attributesOf = this.#sharedOptions.layerAttributeEntries ?? BlissElement.#ownLayerEntries;
    return Object.fromEntries(attributesOf(ELEMENT_CLASSES[BACKGROUND_AREA_ELEMENTS[area]], {}, levels));
  }

  /**
   * Visits every element at or below this one that draws a background, with
   * what it draws and the keys that reach it (#backgroundKeyLevels), in the
   * order the backgrounds are drawn: pre-order, so a word comes before its
   * characters, a character before its parts, and an earlier part before a
   * later one. `x` and `y` are the origin of the frame this element sits in,
   * as getSvgContent takes them; `levels` the keys written around it.
   */
  #visitBackgrounds(visit, x = 0, y = 0, levels = []) {
    const keys = this.#backgroundKeyLevels(levels);
    const drawing = this.#backgroundDrawing(x, y, keys);
    if (drawing) visit(this, drawing, keys);
    for (const child of this.#children) {
      child.#visitBackgrounds(visit, this.#relativeToParentX + x, this.#relativeToParentY + y, keys);
    }
  }

  /**
   * The element backgrounds' keys that reach this element's background and
   * every one inside it: `levels`, those written on the elements around it,
   * outermost first, then its own, which the builder took out of its options.
   * A new array, never the parent's extended in place, since its siblings
   * share that one. The root has none: the global bracket's keys are the
   * builder's own.
   */
  #backgroundKeyLevels(levels) {
    const own = this.#blissObj.backgroundKeys;
    return own ? [...levels, own] : levels;
  }

  /**
   * Every background at or below this element as the layer draws them: the
   * tree pared down to its effects. This element's own background, then its
   * children's, in the order #visitBackgrounds visits them, inside one copy
   * of this element's effects (#effectEntries) where it has any, so every
   * background under one element shares that copy, as its lines share its
   * <g>. A box ignores its descendants' effects, which reach only their own
   * backgrounds. The root writes no copy: a global effect lands on the
   * content group, which holds the layer. A filter in the copy is drawn as
   * its own native one, covering what the copy holds, since a box reaches
   * past the lines, and how far the filters inside the copy draw past it.
   * Returns `{ markup, drawn, spread }`: markup '', drawn undefined and
   * spread 0 where nothing at or below this element draws a background, else
   * the union of what they cover and how far past it what the layer holds
   * draws. `x` and `y` are the origin of the frame this element sits in, as
   * getSvgContent takes them; `levels` the keys written around it
   * (#backgroundKeyLevels).
   */
  #backgroundLayer(x = 0, y = 0, levels = []) {
    const keys = this.#backgroundKeyLevels(levels);
    const drawing = this.#backgroundDrawing(x, y, keys);
    const layers = [
      ...(drawing ? [{ ...this.#backgroundMarkup(drawing, keys), drawn: drawing.drawn }] : []),
      ...this.#children.map(child => child.#backgroundLayer(this.#relativeToParentX + x, this.#relativeToParentY + y, keys)),
    ].filter(layer => layer.markup !== '');
    if (layers.length === 0) return { markup: '', drawn: undefined, spread: 0 };
    const markup = layers.map(layer => layer.markup).join('');
    const drawn = unionOf(layers.map(layer => layer.drawn));
    const outset = Math.max(...layers.map(layer => layer.spread));
    if (this.#level === 0) return { markup, drawn, spread: outset };
    const effects = this.#effectEntries;
    const { entries, defs } = translateFilters(effects, () => ({ drawn, outset }), this.#sharedOptions.filters);
    return {
      markup: entries.length > 0 ? `<g ${formatEntries(entries)}>${defs.join('')}${markup}</g>` : markup,
      drawn,
      spread: filterReach(effects) + outset,
    };
  }

  /**
   * This element's background as markup, in its paint: a rect over its box,
   * or a group stroking its lines. The rect sets `stroke="none"` itself, or the
   * content group's stroke would outline it; the group sets `fill="none"`, or a
   * `fill` written for the whole symbol, which lands on the content group,
   * would fill every enclosure it rings. Their classes make them targets of
   * the layer attributes, which the builder resolves through the function it
   * shares with the tree, with the keys that reach this background (`levels`,
   * #backgroundKeyLevels); a tree built without one writes the classes and the
   * computed attributes alone. A filter among them is drawn as a native one,
   * covering what the background covers: first inside the group, or just
   * before the rect, which holds no child. Returns `{ markup, spread }`,
   * `spread` how far past what it covers the background draws: its filter's
   * reach, plus, for an ink area, how far the filters inside the lines it
   * strokes draw past them.
   */
  #backgroundMarkup(drawing, levels) {
    const classes = ELEMENT_CLASSES[BACKGROUND_AREA_ELEMENTS[drawing.area]];
    const attributesOf = this.#sharedOptions.layerAttributeEntries ?? BlissElement.#ownLayerEntries;
    const outset = drawing.area === 'ink' ? this.#filterOutset(drawing.frame) : 0;
    const translated = (computed) => {
      const attributes = attributesOf(classes, computed, levels);
      const { entries, defs } = translateFilters(attributes, () => ({ drawn: drawing.drawn, outset }), this.#sharedOptions.filters);
      return { attributes: formatEntries(entries), defs: defs.join(''), spread: filterReach(attributes) + outset };
    };
    if (drawing.area === 'ink') {
      const { attributes, defs, spread } = translated({ fill: 'none', stroke: this.#background, 'stroke-width': drawing.width });
      return { markup: `<g ${attributes}>${defs}${drawing.lines}</g>`, spread };
    }
    const { box } = drawing;
    const { attributes, defs, spread } = translated({
      x: roundForMarkup(box.x),
      y: roundForMarkup(box.y),
      width: roundForMarkup(box.width),
      height: roundForMarkup(box.height),
      fill: this.#background,
      stroke: 'none',
    });
    return { markup: `${defs}<rect ${attributes}/>`, spread };
  }

  /** A layer's attribute entries with no author's to add: its classes, then what was computed. */
  static #ownLayerEntries(classes, computed) {
    return Object.entries({ class: classes.join(' '), ...computed });
  }

  /**
   * Every element background this tree draws, as `{ element, levels }`: its
   * ELEMENT_CLASSES entry and the keys that reach it (#backgroundKeyLevels),
   * found by the walk that draws them (root only), which renders an ink area's
   * lines to learn whether it has any. The builder reads it to report a layer
   * attribute that displaces a written `background`, which it can judge only
   * once the tree is built.
   */
  get drawnBackgrounds() {
    const drawn = [];
    this.#visitBackgrounds((element, drawing, levels) =>
      drawn.push({ element: BACKGROUND_AREA_ELEMENTS[drawing.area], levels }));
    return drawn;
  }

  /**
   * Everything this tree draws (root only), as { minX, minY, maxX, maxY }: its
   * lines, each widened by half its own width (#drawnBox), and every element
   * background; undefined where it draws nothing. The builder reads it for the
   * region of a filter on the content group, which holds both.
   */
  get drawnArea() {
    const boxes = [];
    const lines = this.#drawnBox(0, 0, this.#contentFrame);
    if (lines) boxes.push(lines);
    this.#visitBackgrounds((element, drawing) => boxes.push(drawing.drawn));
    return boxes.length > 0 ? unionOf(boxes) : undefined;
  }

  /**
   * How far past its drawn area (drawnArea) this tree draws (root only): the
   * larger of how far the filters inside its lines and those in its
   * background layer carry what they filter. The builder reads it for the
   * region of a filter on the content group, which holds both.
   */
  get filterOutset() {
    return Math.max(this.#filterOutset(this.#contentFrame), this.#backgroundLayer().spread);
  }

  static #separateAnchorAndGroupOptions(processed, authored) {
    const computed = processed && typeof processed === 'object' ? processed : {};
    const written = authored && typeof authored === 'object' ? authored : {};

    const anchorAttrs = [];
    const groupAttrs = new Map(); // attrName -> value; deduped, explicit name beats alias
    let hasHref = false;
    let vectorEffect = null;

    // The two computed values the library publishes first, then everything the
    // author wrote. Two bags have no order between them, so the order is stated
    // rather than inherited from how one bag happened to be built: it reproduces
    // what that bag did, where every curated key was rebuilt ahead of every raw
    // one, so a raw `stroke` landed second and beat a curated `color` whatever
    // order the author wrote the two in.
    //
    // The rename happens HERE, on the published walk alone, and not as a lookup
    // inside the loop. A lookup would reach the author's keys too, and
    // `strokeWidth` is a map KEY as well as an internal name: a bracket can
    // spell it, it is not curated vocabulary, so it lands in the author's bag
    // and a shared lookup renamed it on its way out.
    //
    // Each entry is [name as emitted, value, whether it was RESOLVED from a
    // curated option rather than written]. The last decides the collision rule
    // below, which the pre-resolved name can no longer answer by itself.
    const emitted = [
      // Own-key test, not `in`, which walks the prototype chain.
      ...[...PUBLICATION_MAP].flatMap(([name, attribute]) =>
        Object.hasOwn(computed, name) ? [[attribute, computed[name], true]] : []),
      ...Object.entries(written).map(([key, value]) => [key, value, false]),
    ];

    // Values are already escaped by #processOptions at the input boundary
    for (const [key, value, isAlias] of emitted) {
      if (INTERNAL_OPTIONS.has(key) || !isSafeAttributeName(key)) continue;

      if (ANCHOR_ATTRIBUTE_NAMES.includes(key)) {
        if (key === 'href') {
          if (!BlissElement.isSafeHref(value)) continue;
          hasHref = true;
        }
        anchorAttrs.push(`${key}="${value}"`);
      } else {
        // A name that declares what the document IS is refused wherever it is
        // written, not only on the root: a second namespace declaration
        // re-binds the default namespace for this group and everything under
        // it, so those paths stop being SVG and nothing draws them. The
        // builder reports it once per rebuild; here it is only kept out of the
        // markup.
        if (isDocumentDefiningAttribute(key)) continue;
        // vector-effect is non-inherited; capture it for relocation onto paths
        if (key === 'vector-effect') { vectorEffect = value; continue; }
        // Each attribute name is emitted once (issue #28). On a collision the
        // explicitly-named attribute wins over an alias (color -> stroke,
        // strokeWidth -> stroke-width). The walk above already puts the aliases
        // first, so the skip branch is defensive: it keeps explicit-wins an
        // invariant rather than an artifact of that ordering, independent of
        // option order.
        if (!groupAttrs.has(key) || !isAlias) {
          groupAttrs.set(key, value);
        }
      }
    }

    return {
      anchorAttrs: anchorAttrs.join(' '),
      groupEntries: [...groupAttrs],
      hasHref,
      vectorEffect
    };
  }

  /**
   * Classifies character parts into glyph parts and indicator parts.
   * Valid pattern: [non-indicators...][indicators...] (no mixing)
   *
   * @param {BlissElement[]} children - Array of child elements to classify
   * @returns {{ glyphParts: BlissElement[], indicatorParts: BlissElement[], isValidPattern: boolean }}
   */
  static #classifyParts(children) {
    if (!children || children.length === 0) {
      return { glyphParts: [], indicatorParts: [], isValidPattern: true };
    }

    const firstIndicatorIndex = children.findIndex(c => c.isIndicator);

    // No indicators: all parts are glyph parts
    if (firstIndicatorIndex === -1) {
      return { glyphParts: children, indicatorParts: [], isValidPattern: true };
    }

    const glyphParts = children.slice(0, firstIndicatorIndex);
    const indicatorParts = children.slice(firstIndicatorIndex);

    // Validate: no non-indicators after the first indicator
    const isValidPattern = indicatorParts.every(c => c.isIndicator);

    return { glyphParts, indicatorParts, isValidPattern };
  }

  #sharedOptions;

  /**
   * Gets the first character element of the first group (level 2 element).
   * Returns null if the structure doesn't have the expected depth.
   * @returns {BlissElement|null}
   */
  #getFirstCharacterElement() {
    // Content-empty groups are invisible to layout: the reparse of toString()
    // (which omits them) computes indicator overhang from the first
    // content-bearing group, so the live render must skip empties too.
    const firstGroup = this.#children?.find(g => !g.#isEmptyGroup);
    if (!firstGroup) return null;

    // Empty-parts glyphs are invisible to layout: the reparse of toString()
    // (which omits them) computes indicator overhang from the first
    // content-bearing character, so the live render must too.
    const firstCharacter = firstGroup.#children?.find(c => !c.#isEmptyGlyph);
    if (!firstCharacter || !firstCharacter.#children) return null;

    return firstCharacter;
  }

  /**
   * Gets inherited options by walking up the parent chain.
   * Child options take precedence over parent options.
   * @param {string} optionName - The option name to look for
   * @returns {*} The option value, or undefined if not found
   */
  #getInheritedOption(optionName) {
    // Check this element's options first
    if (this.#blissObj.options?.[optionName] !== undefined) {
      return this.#blissObj.options[optionName];
    }
    // Walk up parent chain
    let current = this.#parentElement;
    while (current) {
      if (current.#blissObj.options?.[optionName] !== undefined) {
        return current.#blissObj.options[optionName];
      }
      current = current.#parentElement;
    }
    return undefined;
  }

  /**
   * True ink start within this element's own frame: 0 for a leaf (path data
   * draws from the origin); for a composite, the leftmost child ink edge.
   * A displaced single-child composite keeps its baked offset, so its
   * ink begins right of x=0 while its reported width still spans from the
   * origin. Indicator centering reads this to skip the leading gap.
   */
  get #inkStartX() {
    if (!this.#children || this.#children.length === 0) return 0;
    return Math.min(...this.#children.map(child => child.#relativeToParentX + child.#inkStartX));
  }

  /**
   * True ink end within this element's own frame: the width for a leaf; for a
   * composite, the rightmost child ink edge. A negative-min composite reports
   * its width as a span SIZE (max - min), not a right-edge coordinate, so
   * position + width overstates where the ink stops.
   */
  get #inkEndX() {
    if (!this.#children || this.#children.length === 0) return this.width;
    return Math.max(...this.#children.map(child => child.#relativeToParentX + child.#inkEndX));
  }

  /**
   * Positions indicator parts as a centered group above the glyph.
   * First indicator is positioned so the entire group is centered over the glyph anchor.
   * Subsequent indicators are positioned relative to the previous indicator.
   *
   * @param {BlissElement[]} glyphParts - The non-indicator parts (the base glyph)
   * @param {BlissElement[]} indicatorParts - The indicator parts to position
   */
  #positionIndicatorGroup(glyphParts, indicatorParts) {
    if (indicatorParts.length === 0) return;

    // Calculate base glyph metrics over the TRUE INK SPAN: both edges
    // add each part's internal ink offsets so a displaced composite base does
    // not count a leading gap (positive baked offset) as ink, and a negative
    // baked offset does not overstate the right edge (its reported width is a
    // span size, not an edge coordinate).
    const glyphMinX = glyphParts.length > 0
      ? Math.min(...glyphParts.map(p => p.#relativeToParentX + p.#inkStartX))
      : 0;
    const glyphMaxX = glyphParts.length > 0
      ? Math.max(...glyphParts.map(p => p.#relativeToParentX + p.#inkEndX))
      : 0;
    const glyphWidth = glyphMaxX - glyphMinX;
    const glyphCenterX = glyphMinX + glyphWidth / 2;

    // Anchor offset belongs to the base only when there is a single base part.
    // A multi-part / atypical base has no single owner, so it uses the default
    // (0,0) anchor, which keeps the indicator order-independent under base-part
    // reordering (coordinate ownership). A single base part uses its own
    // anchorOffset. The geometric center (glyphCenterX) is already
    // order-independent and is kept above.
    const baseAnchor = glyphParts.length === 1 ? glyphParts[0].anchorOffset : undefined;
    const baseAnchorOffsetX = baseAnchor?.x || 0;
    const baseAnchorOffsetY = baseAnchor?.y || 0;
    const anchorX = glyphCenterX + baseAnchorOffsetX;

    // Calculate total indicator group width (including gaps)
    const totalIndicatorWidth = indicatorParts.reduce((sum, ind) => sum + ind.width, 0)
      + (indicatorParts.length - 1) * INDICATOR_GAP;

    // Center the group's CONTENT span over the glyph anchor.
    //
    // An indicator's anchorOffsetX marks the center of its CONTENT (B84: the
    // description arrow with an annotation dot trailing right, a = -0.5; B85
    // mirrored, a = +0.5): the content center sits at width/2 + a, and the
    // dot occupies the remaining 2|a| on the opposite side. Alone over a
    // character, the arrow centers on the anchor and the dot hangs outside
    // the measurement (the single-indicator rule below). In a group, the
    // reader centers the same thing: the row of content from the FIRST
    // member's content-left edge to the LAST member's content-right edge
    // ("spaced apart and centered as a group", docs handbook/writing/
    // characters-bcodes). An edge dot facing OUTWARD hangs off the row and
    // is excluded — its member's content edge pulls in by 2|a| — while a dot
    // facing INTO the row and any middle member's dot sit inside it and move
    // nothing:
    //   span   = [P + max(0, 2*a1), P + totalWidth + min(0, 2*aN)]
    //   center = P + totalWidth/2 + max(0, a1) + min(0, aN) = glyphAnchorX
    //   =>  shift = -max(0, a1) - min(0, aN)
    //
    // A single indicator is the n = 1 degenerate case (first == last, one of
    // the two terms is a, the other 0):
    //   x = glyphAnchorX - width/2 - anchorOffsetX
    // sitting its content center exactly on the glyph anchor.
    //
    // (The previous rule centered the MIDPOINT of the first/last
    // anchor points instead. Its (wN - w1)/4 width term sat any group whose
    // edge members differ in CONTENT width (width minus the outer 2|a| dot
    // allowance) off the anchor, order-dependently: B391;B81;B90 vs
    // B391;B90;B81, ±0.875. Where edge content widths are equal — B84/B85
    // beside a w=2 partner (3 - 1 = 2) — the old width term coincidentally
    // equaled this dot exclusion, which is why those pairs render exactly as
    // before. Width never skews the group; only outward edge dots move it,
    // by half their 2|a| allowance.)
    const firstAnchorOffsetX = indicatorParts[0].anchorOffset?.x || 0;
    const lastAnchorOffsetX = indicatorParts[indicatorParts.length - 1].anchorOffset?.x || 0;
    const anchorShift = -Math.max(0, firstAnchorOffsetX) - Math.min(0, lastAnchorOffsetX);

    // Position indicators. A baseless stack (no base part) has nothing to
    // center over, so it lays its parts out left-to-right from the origin; a
    // based stack centers the group over the base anchor. Either way explicit
    // :x,y overrides below.
    let currentX = glyphParts.length === 0
      ? 0
      : anchorX - totalIndicatorWidth / 2 + anchorShift;

    for (const indicator of indicatorParts) {
      // X positioning: only override if no explicit x was provided
      // Position by left edge to maintain visual 1-unit gaps between indicators
      // (a member's own anchorOffsetX never repositions it INSIDE the group;
      // outward edge dots act once, via anchorShift above)
      if (indicator.#blissObj.x === undefined) {
        indicator.#relativeToParentX = currentX;
      } else {
        indicator.#relativeToParentX = indicator.#blissObj.x;
      }

      // Y positioning: use same logic as before, but reference base glyph
      if (indicator.#blissObj.y !== undefined) {
        indicator.#relativeToParentY = indicator.#blissObj.y;
      } else {
        const defaultIndicatorY = 4;
        const baseDefaultAnchorY = 4;
        const baseAnchorY = baseDefaultAnchorY + baseAnchorOffsetY;
        const indicatorAnchorOffsetY = indicator.#blissObj.anchorOffsetY || 0;
        indicator.#relativeToParentY = baseAnchorY - indicatorAnchorOffsetY - defaultIndicatorY;
      }

      // Move to next indicator position
      currentX += indicator.width + INDICATOR_GAP;
    }
  }

  constructor(blissObj = {}, { parentElement = null, previousElement = null, level = 0, sharedOptions = null } = {}) {
    this.#blissObj = blissObj;
    this.#parentElement = parentElement;
    this.#previousElement = previousElement;
    this.#level = level;
    this.#sharedOptions = sharedOptions || { charSpace: 2, wordSpace: 8, externalGlyphSpace: 0.8 };

    // Assign key: user-provided key takes precedence, otherwise auto-generate
    this.#key = this.#blissObj.key || generateKey();

    // Duplicate key detection (only when builder provides sharedOptions with key tracking).
    // The `this.#blissObj.key` guard limits warnings to user-assigned keys only;
    // auto-generated 8-char random keys have negligible collision probability (~2.8T combinations).
    if (this.#sharedOptions.keys) {
      if (this.#blissObj.key && this.#sharedOptions.keys.has(this.#key)) {
        this.#sharedOptions.warnings.push({
          code: WARNING_CODES.DUPLICATE_KEY,
          message: `Duplicate element key: "${this.#key}"`,
          source: this.#key,
        });
      }
      this.#sharedOptions.keys.add(this.#key);
    }

    this.#codeName = "";
    this.#relativeToParentX = 0;
    this.#relativeToParentY = 0;
    this.#children = [];
    this.#externalGlyphSpacing = this.#sharedOptions.externalGlyphSpace - (this.kerningRules?.[previousElement?.char] ?? 0);
    this.#childStartOffset = 0;

    if (this.#level === 0) {
      // Root level (sequence)
      if (!this.#blissObj.groups) {
        this.#blissObj = { groups: [this.#blissObj] };
      }

      for (const group of this.#blissObj.groups) {
        const child = new BlissElement(group, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1, sharedOptions: this.#sharedOptions });
        this.#children.push(child);
      }
      
      // Calculate indicator overhang for first character
      const firstCharacter = this.#getFirstCharacterElement();
      if (firstCharacter && firstCharacter.#classifiedParts) {
        const { glyphParts, indicatorParts } = firstCharacter.#classifiedParts;

        // Only calculate overhang if we have both glyph parts and indicator parts
        if (glyphParts.length > 0 && indicatorParts.length > 0 && !firstCharacter.isIndicator) {
          // Find how far the first indicator's ink (the leftmost in the default
          // layout) extends left of x=0, the glyph start. Its ink, not its frame:
          // a compound indicator's parts can start away from its own origin.
          const indicatorLeftX = indicatorParts[0].#relativeToParentX + indicatorParts[0].#inkStartX;
          if (indicatorLeftX < 0) {
            this.#childStartOffset = -indicatorLeftX;
          }
        }
      }
      this.#relativeToParentX = this.#childStartOffset + (this.#blissObj.x ?? 0);
      this.#relativeToParentY = this.#blissObj.y ?? 0;

      this.#assignAreas();

      this.getSvgContent = (x = 0, y = 0) => {
        const childContents = this.#children.map(child =>
          child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
        );

        const hasTaggedContent = childContents.some(c => c.startsWith('<'));
        const hasRawContent = childContents.some(c => !c.startsWith('<'));

        // Nothing is wrapped here: every global option, the link included,
        // is written by the builder around the content group.
        const ink = hasTaggedContent && hasRawContent
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
          : childContents.join('');

        // Every word, character and part background comes first, beneath all
        // of the ink: a background drawn inside its own element would hide the
        // ink of every earlier neighbour or part it reaches under. So an
        // element's effects reach its background through a copy of them in
        // the layer (#backgroundLayer). Every link is drawn after them too, so
        // none takes a link's click. The ink follows as svgContent would write
        // it alone: raw path data in a path of its own.
        const backgrounds = this.#backgroundLayer(x, y).markup;
        if (backgrounds === '') return ink;
        return backgrounds + (ink.startsWith('<') ? ink : `<path d="${ink}"/>`);
      };
    } else if (this.#level === 1) {
      // Group level
      if (!this.#blissObj.glyphs) {
        this.#blissObj = { glyphs: [this.#blissObj] };
      }

      // A fail-flagged group (group.errorCode) can no longer appear here:
      // the builder's #normalizeFailedWordInvariant drops such groups before
      // construction, and BlissElement itself is not exported.

      // Empty-parts glyphs are skipped in the sibling chain so surviving
      // neighbors pair up for spacing and kerning exactly as they do when
      // the serialized form (which omits empty glyphs) is reparsed.
      let previousLayoutGlyph = null;
      for (const glyph of this.#blissObj.glyphs) {
        const child = new BlissElement(glyph, { parentElement: this, previousElement: previousLayoutGlyph, level: this.#level + 1, sharedOptions: this.#sharedOptions });
        this.#children.push(child);
        if (!child.#isEmptyGlyph) previousLayoutGlyph = child;
      }

      // Content-empty groups (zero glyphs, or only empty-parts glyphs)
      // render nothing and contribute no document extent, mirroring
      // #isEmptyGlyph one level up.
      this.#isEmptyGroup = this.#children.every(child => child.#isEmptyGlyph);


      // Check if this is a space group (all glyphs are space glyphs: TSP or QSP).
      // A group with zero glyphs has no space semantics: content-empty groups
      // stay visible to navigation and are never classified as space groups.
      this.#isSpaceGroup = (this.#blissObj.glyphs?.length > 0) && this.#blissObj.glyphs.every(g => {
        const code = g.parts?.[0]?.codeName;
        return code && isSpaceGlyph(code);
      });
      const isSpaceGroup = this.#isSpaceGroup;

      // A group of nothing but spaces has no ink for an automatic crop to
      // stop at (#calculateBounds skips it). Every glyph must be a space and
      // nothing else: #isSpaceGroup reads only a glyph's first part, and a
      // glyph that starts with a space but keeps another part (an unknown
      // code drawn as an error placeholder) has that part's ink to keep.
      this.#holdsOnlySpaces = isSpaceGroup && this.#blissObj.glyphs.every(g => g.parts.length === 1);

      if (this.#previousElement) {
        if (this.#blissObj.x === undefined) {
          // Position based on previous element's advanceX
          this.#relativeToParentX = this.#previousElement.#relativeToParentX + this.#previousElement.#advanceX;
        } else {
          this.#relativeToParentX = this.#previousElement.#relativeToParentX + this.#previousElement.width + this.#blissObj.x;
        }
      } else if (this.#parentElement) {
        this.#relativeToParentX = this.#parentElement.#relativeToParentX + (this.#blissObj.x ?? 0);
      } else {
        this.#relativeToParentX = this.#blissObj.x ?? 0;
      }

      if (this.#parentElement) {
        this.#relativeToParentY = this.#parentElement.#relativeToParentY + (this.#blissObj.y ?? 0);
      } else {
        this.#relativeToParentY = this.#blissObj.y ?? 0;
      }

      // Space groups: advanceX is the sum of their dynamically-calculated glyph widths
      // Regular groups: advanceX is baseGroupWidth + charSpace (the charSpace pairs with TSP to make full wordSpace)
      if (isSpaceGroup) {
        // Sum dynamically-calculated widths for all space glyphs
        this.#advanceX = this.#blissObj.glyphs.reduce((sum, g) => {
          const code = g.parts?.[0]?.codeName;
          if (code === 'TSP') {
            return sum + (this.#sharedOptions.wordSpace - this.#sharedOptions.charSpace);
          } else if (code === 'QSP') {
            return sum + (this.#sharedOptions.wordSpace / 2 - this.#sharedOptions.charSpace);
          }
          return sum;
        }, 0);
      } else if (this.#children.every(child => child.#isEmptyGlyph)) {
        // A group whose every glyph is empty has no layout content: it
        // advances nothing, matching its serialized form, which omits it.
        // Deliberately not #isEmptyGroup: this branch also covers
        // fail-flagged groups (vacuously, with error-placeholder off).
        this.#advanceX = 0;
      } else {
        this.#advanceX = this.baseGroupWidth + this.#sharedOptions.charSpace;
      }

      this.getSvgContent = (x = 0, y = 0, halo = null) => {
        const originX = this.#relativeToParentX + x;
        const originY = this.#relativeToParentY + y;
        const childContents = this.#children.map(child => child.getSvgContent(originX, originY, halo));

        const hasTaggedContent = childContents.some(c => c.startsWith('<'));
        const hasRawContent = childContents.some(c => !c.startsWith('<'));

        const content = hasTaggedContent && hasRawContent
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
          : childContents.join('');

        if (halo) return this.#haloWrap(content, halo, x, y);
        const box = () => BlissElement.#bandHitBox(originX, originY, this.#linkArea);
        return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
          () => this.#linkHit(x, y, box), this.#ownFilters(x, y, box));
      };

      // A fail-flagged group (group.errorCode) can no longer reach here: the
      // builder's #normalizeFailedWordInvariant drops such groups before
      // construction, so no L1 fail-render override is needed.
    } else {
      if (this.#level === 2) {
        // Character level

        // codeName at glyph level: the input code that produces this glyph,
        // when the glyph is actually a glyph. Empty string for composites,
        // bare shape primitives, ad-hoc composites, and multi-char text
        // fallback. The presence of glyphCode IS the "this is a glyph" signal:
        // the parser only sets it for registered glyphs (B-codes, X-codes,
        // single-char text fallback, define()d 'glyph'-type aliases). The JSON
        // postParse step (bliss-svg-builder.js) normalizes JSON's codeName
        // field back to glyphCode, so glyph-level codeName never reaches
        // construction. For single-char text fallback the parser stores
        // 'XTXT_<char>' as the internal routing key; surface it publicly as
        // 'X<char>'.
        if (typeof this.#blissObj.glyphCode === 'string') {
          const code = this.#blissObj.glyphCode;
          this.#codeName = code.startsWith('XTXT_') ? 'X' + code.slice(5) : code;
        } else {
          this.#codeName = "";
        }

        this.#char = this.#blissObj.char ?? "";
        this.#isBlissGlyph = !!this.#blissObj.isBlissGlyph;
        this.#isExternalGlyph = !!this.#blissObj.isExternalGlyph;

        if (!this.#blissObj.parts) {
          this.#blissObj = { parts: [this.#blissObj] };
        }

        // A glyph whose parts array is empty (mutation-emptied, or a DSL
        // options-only token like `[color=red]`) is invisible to layout:
        // zero width, zero advance, no output. Serialization omits it, so
        // the live render must not let it occupy a spacing slot.
        this.#isEmptyGlyph = this.#blissObj.parts.length === 0;

        const warningCountBefore = this.#sharedOptions?.warnings?.length ?? 0;

        for (const part of this.#blissObj.parts) {
          const child = new BlissElement(part, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1, sharedOptions: this.#sharedOptions });
          this.#children.push(child);
        }

        // A character keeps the spacing data of the code it is made of (the
        // external-letter flag, its letter and its kerning table) only while
        // it draws that one code, moved, styled or carrying indicators. A
        // second base part makes another character, spaced as a Bliss
        // character. Judged on the parts as written, as the word space before
        // a punctuation mark is judged where it is read (pullsInWordSpace), so
        // a part that fails still counts.
        this.#isFused = basePartCount(this.#children) > 1;
        if (this.#isFused) {
          this.#char = "";
          this.#isExternalGlyph = false;
        }

        // If any part failed (unknown code), replace the entire character
        const hasFailedParts = (this.#sharedOptions?.warnings?.length ?? 0) > warningCountBefore;
        if (hasFailedParts) {
          if (this.#sharedOptions?.errorPlaceholder) {
            // Replace all children with a single placeholder character
            this.#children = [];
            const placeholderParts = structuredClone(this.#sharedOptions.errorPlaceholderParts);
            for (const placeholderPart of placeholderParts) {
              const child = new BlissElement(placeholderPart, {
                parentElement: this,
                previousElement: this.#children[this.#children.length - 1],
                level: this.#level + 1,
                sharedOptions: this.#sharedOptions,
              });
              this.#children.push(child);
            }
          } else {
            // Zero-width invisible character
            this.#children = [];
          }
        }

        // Classify parts into glyph parts and indicator parts (cache for reuse by getters)
        this.#classifiedParts = BlissElement.#classifyParts(this.#children);
        const { glyphParts, indicatorParts, isValidPattern } = this.#classifiedParts;

        // Position the indicator group. Runs whenever there are indicator parts
        // in a valid pattern, with or without a base: a based stack centers over
        // the base anchor; a baseless stack (every part an indicator) lays out
        // from origin (#positionIndicatorGroup branches on glyphParts.length).
        // Invalid patterns (e.g., B291;B99;H) fall through to default combination.
        // A single-part all-indicator composite (e.g., B98) lays out at origin,
        // unchanged, keeping its baked internal positioning.
        const hasPositionedIndicators = indicatorParts.length > 0 && isValidPattern;
        if (hasPositionedIndicators) {
          this.#positionIndicatorGroup(glyphParts, indicatorParts);
        }

        // Normalize: shift parts right only if any child extends left of origin (negative x)
        // Skip normalization for characters with indicators above glyph (they have their own positioning)
        if (!hasPositionedIndicators && this.#children.length > 0) {
          const minX = Math.min(...this.#children.map(child => child.#relativeToParentX));
          if (minX < 0) {
            for (const child of this.#children) {
              child.#relativeToParentX -= minX;
            }
          }
        }

        // A glyph-level `x` is LEADING BLANK owned by this glyph, not a position
        // for it. The glyph still starts where the flow puts it (below); its own
        // content begins `x` further in, and the width getter grows the glyph to
        // match, since at level >= 1 only NEGATIVE child offsets move the left
        // boundary. Deriving the next position from the previous glyph's ink
        // width instead (the rule this replaced) made `x=0` delete the
        // char-space and made `advanceX` disagree with the layout.
        // Applied after the normalization above, so the blank adds to the
        // glyph's own internal layout rather than replacing it.
        const leadingBlank = this.#blissObj.x ?? 0;
        if (leadingBlank !== 0) {
          for (const child of this.#children) {
            child.#relativeToParentX += leadingBlank;
          }
        }

        if (!this.#previousElement) {
          // The word's first glyph sits at the word's origin. Its leading blank
          // is already inside it (above), so there is nothing to add here.
          this.#relativeToParentX = 0;
        } else {
          // An empty-parts glyph must not re-space its neighbor: its serialized
          // form is absent (or a glyphless options token), so the reparse never
          // applies these identity-based adjustments. The RK/AK option blocks
          // below stay ungated — their serialized markers re-apply on reparse.
          if (this.isExternalGlyph && this.#previousElement.isExternalGlyph && !this.#isEmptyGlyph) {
            this.#previousElement.#advanceX = this.#previousElement.width + this.#externalGlyphSpacing;
          }

          const kerningKey = this.#kerningKeyAfter(this.#previousElement.kerningRules);
          if (!this.#isEmptyGlyph && !this.isExternalGlyph && !this.#previousElement.isExternalGlyph &&
              this.#previousElement.kerningRules && kerningKey) {
            // Own-key test, not a plain lookup: a kerning table is an object
            // literal, so asking it for an inherited name (constructor,
            // toString) answers with the function, which is not nullish and
            // turns the advance below into NaN for the rest of the layout.
            const rules = this.#previousElement.kerningRules;
            const kerningAdjustment = Object.hasOwn(rules, kerningKey) ? rules[kerningKey] : 0;
            if (kerningAdjustment !== 0) {
              this.#previousElement.#advanceX = this.#previousElement.width + this.#sharedOptions.charSpace + kerningAdjustment;
            }
          }

          if (typeof this.#blissObj.options?.relativeKerning === "number") {
            this.#previousElement.#advanceX += this.#blissObj.options.relativeKerning;
          } else if (typeof this.#blissObj.options?.absoluteKerning === "number") {
            this.#previousElement.#advanceX = this.#previousElement.width + this.#blissObj.options.absoluteKerning;
          }

          // Unconditional: a glyph carrying leading blank still starts where the
          // previous glyph's advance puts it, so `prev.x + prev.advanceX` is the
          // next glyph's origin for every input.
          this.#relativeToParentX = this.#previousElement.#relativeToParentX + this.#previousElement.#advanceX;
        }

        // `y` is deliberately not symmetric with `x`: `x` runs along the writing
        // direction, where the flow already owns the position, so an authored
        // value has to say something the flow does not. `y` has no flow to
        // negotiate with and stays a plain offset.
        this.#relativeToParentY = this.#blissObj.y ?? 0;

        if (hasFailedParts && !this.#sharedOptions?.errorPlaceholder) {
          // Invisible failed character takes zero space
          this.#advanceX = 0;
          this.getSvgContent = () => '';
        } else if (this.#isEmptyGlyph) {
          // Empty-parts glyph: no advance (not even charSpace) and no output,
          // so the live render equals the reparse of toString().
          this.#advanceX = 0;
          this.getSvgContent = () => '';
        } else {
          // Dynamic advanceX calculation for space glyphs (TSP, QSP)
          const code = this.#blissObj.parts?.[0]?.codeName;
          if (code && isSpaceGlyph(code)) {
            if (code === 'TSP') {
              this.#advanceX = this.#sharedOptions.wordSpace - this.#sharedOptions.charSpace;
            } else if (code === 'QSP') {
              this.#advanceX = this.#sharedOptions.wordSpace / 2 - this.#sharedOptions.charSpace;
            }
          } else {
            this.#advanceX = this.baseGlyphWidth + this.#sharedOptions.charSpace;
          }

          this.getSvgContent = (x = 0, y = 0, halo = null) => {
            const originX = this.#relativeToParentX + x;
            const originY = this.#relativeToParentY + y;
            const childContents = this.#children.map(child => child.getSvgContent(originX, originY, halo));

            const hasTaggedContent = childContents.some(c => c.startsWith('<'));
            const hasRawContent = childContents.some(c => !c.startsWith('<'));

            const content = hasTaggedContent && hasRawContent
              ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
              : childContents.join('');

            if (halo) return this.#haloWrap(content, halo, x, y);
            const box = () => BlissElement.#bandHitBox(originX, originY, this.#linkArea);
            return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
              () => this.#linkHit(x, y, box), this.#ownFilters(x, y, box));
          };
        }
      } else {
        // Part level (level >= 3)
        const elementDefinition = this.#blissObj.codeName?.startsWith('XTXT_')
          ? (() => { const g = createTextFallbackGlyph(this.#blissObj.codeName.slice(5)); g.isShape = true; return g; })()
          : blissElementDefinitions[this.#blissObj.codeName];
        const isPredefinedElement = !!elementDefinition && !!elementDefinition.getPath;
        const isCompositeElement = !!this.#blissObj.parts && this.#blissObj.parts.length > 0;
  
        this.#relativeToParentX = this.#blissObj.x ?? 0;
        this.#relativeToParentY = this.#blissObj.y ?? 0;

        if (this.#blissObj.errorCode === 'COMPOSITE_AS_PART') {
          // A composed unflagged alias used as a non-leading ;-part (the
          // part-merge operand rule). The part is a composite, so it never
          // reaches the leaf-fail branch below; record the warning and render
          // invisible so the level-2 character fails (placeholder per
          // error-placeholder), mirroring WORD_AS_PART.
          if (!this.#sharedOptions?.warnings) {
            throw new Error(`Unable to create Bliss element: ${this.#blissObj.error || this.#blissObj.codeName || 'unknown'}`);
          }
          this.#sharedOptions.warnings.push({
            code: WARNING_CODES.COMPOSITE_AS_PART,
            message: this.#blissObj.error,
            source: this.#blissObj.codeName || 'unknown',
          });
          this.#leafWidth = 0;
          this.#leafHeight = 0;
          this.getSvgContent = () => '';
        } else if (!isPredefinedElement && !isCompositeElement) {
          // When constructed directly (no builder), throw to preserve existing behaviour
          if (!this.#sharedOptions?.warnings) {
            const failedCode = this.#blissObj.codeName || this.#blissObj.error || 'unknown';
            throw new Error(`Unable to create Bliss element: ${failedCode}`);
          }

          // What a warning below quotes as its source: the token as the parser
          // read it, or, for a part built another way, its error.
          const written = this.#blissObj.errorSource ?? this.#blissObj.error;

          if (this.#blissObj.errorCode === WARNING_CODES.WORD_AS_PART) {
            this.#sharedOptions.warnings.push({
              code: WARNING_CODES.WORD_AS_PART,
              message: this.#blissObj.error,
              source: this.#blissObj.codeName || 'unknown',
            });
          } else if (this.#blissObj.errorCode === WARNING_CODES.MALFORMED_COORDINATES) {
            // A valid code with a malformed coordinate suffix: the parser tagged
            // it (parsePartString) so the warning names the coordinate, not the
            // code. The token is still dropped (rendered invisible below).
            this.#sharedOptions.warnings.push({
              code: WARNING_CODES.MALFORMED_COORDINATES,
              message: this.#blissObj.error,
              source: written,
            });
          } else {
            const failedCode = this.#blissObj.codeName || written || 'unknown';
            this.#sharedOptions.warnings.push({
              code: WARNING_CODES.UNKNOWN_CODE,
              message: `Unknown or invalid code: "${failedCode}"`,
              source: failedCode,
            });
          }

          // Render as zero-width invisible. Character level (level 2) handles
          // placeholder display for the entire character when any part fails.
          this.#leafWidth = 0;
          this.#leafHeight = 0;
          this.getSvgContent = () => '';
        } else if (isPredefinedElement) {
          this.#handlePredefinedElement(elementDefinition);

          // For predefined (leaf) elements with explicit coordinates, use them directly
          if (this.#blissObj.y !== undefined) {
            this.#relativeToParentY = this.#blissObj.y;
          }
        } else if (isCompositeElement) {
          // Surface 'XTXT_<chars>' (internal text-fallback routing key) as
          // 'X<chars>' publicly. Internal lookup uses #blissObj.codeName.
          const raw = this.#blissObj.codeName || "";
          this.#codeName = raw.startsWith('XTXT_') ? 'X' + raw.slice(5) : raw;
          this.#handleCompositeElement(this.#blissObj.parts);
        }
      }
    }
  }

  get parentElement() {
    return this.#parentElement;
  }

  get previousElement() {
    return this.#previousElement;
  }

  get advanceX() {
    return this.#advanceX || 0;
  }

  get children() {
    return this.#children;
  }

  get codeName() {
    return this.#codeName || "";
  }

  get anchorOffset() {
    return {
      x: this.#anchorOffsetX || 0,
      y: this.#anchorOffsetY || 0
    }
  }

  get width() {
    if (this.#leafWidth !== undefined) return this.#leafWidth;
    if (!this.#children || this.#children.length === 0) return 0;

    // Empty-parts glyphs and content-empty groups contribute no extent
    // (they render nothing and serialization omits them).
    const layoutChildren = this.#level === 0
      ? this.#children.filter(child => !child.#isEmptyGroup)
      : this.#level === 1
        ? this.#children.filter(child => !child.#isEmptyGlyph)
        : this.#children;
    if (layoutChildren.length === 0) return 0;

    // A character spans its parts' ink, not their frames: a compound
    // indicator whose parts start away from its own origin has a frame that
    // reaches past its ink, before it or after it, and the spacing that reads
    // this width (absolute kerning, a kerning rule, the gap between letters)
    // would count that blank.
    const minRelativeX = this.#level === 2
      ? Math.min(...layoutChildren.map(child => child.#relativeToParentX + child.#inkStartX))
      : Math.min(...layoutChildren.map(child => child.#relativeToParentX));

    let maxRelativeXPlusWidth;
    if (this.#level === 1) {
      maxRelativeXPlusWidth = Math.max(...layoutChildren.map(child =>
        child.#relativeToParentX + child.rightExtendedGlyphWidth));
    } else if (this.#level === 2) {
      maxRelativeXPlusWidth = Math.max(...layoutChildren.map(child =>
        child.#relativeToParentX + child.#inkEndX));
    } else {
      // A composition that ends in nothing but spaces ends where a word after
      // them would start: at the end of their advance, which lies left of
      // their own x when the word space is narrower than the character space.
      // Their own frame does not count, since a space draws nothing. A space
      // that keeps another part (an error placeholder) ends at that part's
      // ink, as every word does. Only the root's words can hold spaces.
      const lastChild = layoutChildren[layoutChildren.length - 1];
      const trailingSpace = lastChild.#holdsOnlySpaces ? lastChild : null;
      maxRelativeXPlusWidth = Math.max(...layoutChildren.map(child =>
        child.#relativeToParentX + (child === trailingSpace ? child.#advanceX : child.width)));
    }

    let width;
    if (this.#level === 0) {
      // Never below 0: a composition of nothing but spaces whose advance is
      // negative ends before it starts.
      width = Math.max(0, maxRelativeXPlusWidth - minRelativeX + this.#childStartOffset);
    } else {
      // When minRelativeX > 0, the left boundary is still the element's origin (0),
      // not the leftmost child. Only subtract negative offsets (e.g., indicator overhang).
      width = maxRelativeXPlusWidth - Math.min(0, minRelativeX);
    }

    return width;
  }

  get rightExtendedGlyphWidth() {
    if (this.#level !== 2) throw new Error('rightExtendedGlyphWidth can only be called on glyph elements (level 2)');

    const parts = this.#children;
    if (parts.length === 0) return 0;

    // Use cached classification (computed once in constructor)
    const { glyphParts } = this.#classifiedParts;

    // If no glyph parts (all indicators), use all parts for spacing
    const spacingParts = glyphParts.length > 0 ? glyphParts : parts;

    const minRelativeX = Math.min(...spacingParts.map(part => part.#relativeToParentX));
    // The right edge is where the parts' ink stops: a compound indicator whose
    // parts reach left of its own origin reports the span of its parts as its
    // width, which added to its position runs past its ink.
    const maxRelativeXPlusWidth = Math.max(...parts.map(part => part.#relativeToParentX + part.#inkEndX));
    // When minRelativeX > 0, the left boundary is still the element's origin (0).
    // Only subtract negative offsets (e.g., indicator overhang).
    const rightExtendedGlyphWidth = maxRelativeXPlusWidth - Math.min(0, minRelativeX);

    return rightExtendedGlyphWidth;
  }

  get baseGlyphWidth() {
    if (this.#level !== 2) throw new Error('baseGlyphWidth can only be called on glyph elements (level 2)');

    const { left, right } = this.#baseSpan;
    return right - left;
  }

  /**
   * Where the base glyph sits in this character's own frame (level 2): the
   * span baseGlyphWidth measures and a link's area is built on. Indicators
   * never count, as they never count toward spacing.
   */
  get #baseSpan() {
    const parts = this.#children;
    if (parts.length === 0) return { left: 0, right: 0 };

    // Use cached classification (computed once in constructor)
    const { glyphParts } = this.#classifiedParts;

    // If no glyph parts (all indicators), use all parts for width
    const spacingParts = glyphParts.length > 0 ? glyphParts : parts;

    const minRelativeX = Math.min(...spacingParts.map(part => part.#relativeToParentX));
    const maxRelativeXPlusWidth = Math.max(...spacingParts.map(part => part.#relativeToParentX + part.width));
    // When minRelativeX > 0, the left boundary is still the element's origin (0).
    // Only a negative offset (e.g., indicator overhang) moves it.
    return { left: Math.min(0, minRelativeX), right: maxRelativeXPlusWidth };
  }

  get baseGroupWidth() {
    if (this.#level !== 1) throw new Error('baseGroupWidth can only be called on group elements (level 1)');

    const group = this;
    // Empty-parts glyphs contribute no extent (they render nothing and
    // serialization omits them).
    const glyphs = group.#children.filter(glyph => !glyph.#isEmptyGlyph);
    if (glyphs.length === 0) return 0;

    const firstGlyph = glyphs[0];
    const lastGlyph = glyphs[glyphs.length - 1];
    const lastGlyphBaseWidth = lastGlyph.baseGlyphWidth;
    const baseGroupWidth = lastGlyph.#relativeToParentX + lastGlyphBaseWidth - firstGlyph.#relativeToParentX;

    return baseGroupWidth;
  }

  get baseWidth() {
    if (this.#level === 0) {
      // Content-empty groups contribute no extent here either: centering
      // reads baseWidth, so a leaked trailing-empty position term would
      // shift the viewBox and clip ink (mirrors baseGroupWidth's
      // empty-glyph exclusion one level down).
      const groups = this.#children.filter(group => !group.#isEmptyGroup);
      if (groups.length === 0) return 0;

      const firstGroup = groups[0];
      const lastGroup = groups[groups.length - 1];
      if (lastGroup.#holdsOnlySpaces) {
        // A final space ends the box at the end of its advance, as in `width`,
        // and never below 0.
        return Math.max(0, lastGroup.#relativeToParentX + lastGroup.#advanceX - firstGroup.#relativeToParentX);
      }
      const lastGroupBaseWidth = lastGroup.baseGroupWidth;
      const baseWidth = lastGroup.#relativeToParentX + lastGroupBaseWidth - firstGroup.#relativeToParentX;
      return baseWidth;
    }

    if (this.#level === 1) return this.baseGroupWidth;
    if (this.#level === 2) return this.baseGlyphWidth;

    return this.width;
  }

  get height() {
    if (this.#leafHeight !== undefined) return this.#leafHeight;
    if (this.#level === 2) {
      return BAND_HEIGHT;
    }
    if (this.#children && this.#children.length > 0) {
      return Math.max(...this.#children.map(child => child.#relativeToParentY + child.height));
    }
    return 0;
  }

  get baseX() {
    if (this.#leafX !== undefined) return this.#leafX;
    if (!this.#children || this.#children.length === 0) return 0;

    return this.#relativeToParentX;
  }

  get x() {
    if (this.#leafX !== undefined) return this.#leafX;
    if (!this.#children || this.#children.length === 0) return 0;

    const x = Math.min(
      this.#relativeToParentX,
      ...this.#children.map(child => this.#relativeToParentX + child.x)
    );

    return x;
  }

  get y() {
    if (this.#level <= 1) return 0;
    if (this.#leafY !== undefined) return this.#leafY;
    if (!this.#children || this.#children.length === 0) return 0;

    return Math.min(
      this.#relativeToParentY,
      ...this.#children.map(child => this.#relativeToParentY + child.y)
    );
  }

  get isCharacter() {
    return this.#isCharacter;
  }

  get char() {
    return this.#char ?? "";
  }

  get kerningRules() {
    return this.#isFused ? {} : (this.#blissObj.kerningRules || {});
  }

  // The code this character is looked up by in the previous character's
  // kerning table: its own code where the table lists it, else the built-in
  // code its base part is made of, read through a custom name that draws one
  // code, so a digit kerns after a digit however it is written or named. A
  // character fused from two base parts, here or inside the name that draws
  // it, is another character and is kerned by nothing.
  #kerningKeyAfter(rules) {
    if (this.#isFused) return "";
    if (this.codeName && Object.hasOwn(rules, this.codeName)) return this.codeName;
    let part = this.#children[0];
    while (part && !builtInCodes.has(part.codeName) && part.#children.length > 0) {
      if (basePartCount(part.#children) > 1) return "";
      part = part.#children[0];
    }
    return part?.codeName ?? "";
  }

  get isIndicator() {
    return this.#blissObj.isIndicator || false;
  }

  /**
   * Classifies an indicator part for introspection.
   * `indicatorLevel` separates a word-level overlay indicator (tagged
   * `_indicatorOrigin: 'word'` when merged onto the head at decode) from a
   * character-level one; `indicatorKind` reads the definition's
   * `semanticIndicator` flag via the shared `classifyIndicatorKind` (so the
   * snapshot and the handle classify identically). Both null for a
   * non-indicator and for an indicator whose definition cannot be resolved
   * (never throws): the `code` gate maps a non-indicator to null, and
   * `classifyIndicatorKind(null)` is null, so both fall through one return.
   * A composite indicator's internal sub-parts (level >= 3, `isIndicator`
   * inherited) also classify here, mirroring the `isIndicator` field.
   * @returns {{ indicatorLevel: ('word'|'character'|null), indicatorKind: ('semantic'|'grammatical'|null) }}
   */
  #classifyIndicator() {
    const code = this.isIndicator ? this.#blissObj.codeName : null;
    const indicatorKind = classifyIndicatorKind(code, blissElementDefinitions);
    if (indicatorKind === null) return { indicatorLevel: null, indicatorKind: null };
    return {
      indicatorLevel: this.#blissObj._indicatorOrigin === 'word' ? 'word' : 'character',
      indicatorKind,
    };
  }

  get isShape() {
    return this.#isShape;
  }

  get isBlissGlyph() {
    return this.#isBlissGlyph;
  }

  get isExternalGlyph() {
    return this.#isExternalGlyph;
  }

  get isRoot() {
    return this.#level === 0;
  }

  get isGroup() {
    return this.#level === 1;
  }

  get isGlyph() {
    return this.#level === 2;
  }

  get isPart() {
    return this.#level >= 3;
  }

  get key() {
    return this.#key;
  }

  /**
   * Returns a frozen snapshot of this element's data.
   * Snapshots are plain objects safe to expose publicly — no live references.
   *
   * @param {number} [parentOffsetX=0] - Accumulated x offset from ancestors
   * @param {number} [parentOffsetY=0] - Accumulated y offset from ancestors
   * @param {number} [index=0] - Index within parent's children
   * @returns {Object} Frozen ElementSnapshot
   */
  snapshot(parentOffsetX = 0, parentOffsetY = 0, index = 0) {
    const absX = parentOffsetX + this.#relativeToParentX;
    const absY = parentOffsetY + this.#relativeToParentY;

    let childSnapshots = (this.#children || []).map((child, i) =>
      child.snapshot(absX, absY, i)
    );

    // For group elements (level 1): resolve isHeadGlyph so every word has exactly one.
    // The parser stamps only an explicit `^`/designation; an unmarked word's head
    // is resolved here at query time via the shared exclusion scan (headScanCode),
    // so it stays correct after a structural mutation reorders the glyphs. A word
    // drawn with `;;` codes arrives marked: the render marks the character it
    // merged them onto, whose merged parts would read differently here.
    if (this.#level === 1 && childSnapshots.length > 0) {
      const marked = childSnapshots.findIndex(c => c.isHeadGlyph);
      if (marked === -1) {
        // Empty-parts glyphs cannot head a word (serialization omits them and
        // the overlay resolver skips them); resolve among the others. A word
        // of only empty glyphs has no head at all.
        const contentIndexes = this.#children.flatMap((el, i) => (el.#isEmptyGlyph ? [] : [i]));
        if (contentIndexes.length > 0) {
          const headIndex = contentIndexes[resolveHeadIndex(
            contentIndexes.map(i => headScanCode(
              childSnapshots[i].codeName,
              childSnapshots[i].children?.length ?? 0,
              childSnapshots[i].children?.[0]?.codeName
            ))
          )];
          childSnapshots[headIndex] = Object.freeze({ ...childSnapshots[headIndex], isHeadGlyph: true });
        }
      }
    }

    const children = Object.freeze(childSnapshots);

    const { indicatorLevel, indicatorKind } = this.#classifyIndicator();

    return Object.freeze({
      key: this.#key,
      codeName: this.#codeName || '',
      char: this.#char ?? '',
      x: absX,
      y: absY,
      offsetX: this.#relativeToParentX,
      offsetY: this.#relativeToParentY,
      width: this.width,
      height: this.height,
      advanceX: this.#advanceX || 0,
      baseWidth: this.baseWidth,
      level: this.#level,
      isRoot: this.#level === 0,
      isGroup: this.#level === 1,
      isGlyph: this.#level === 2,
      isPart: this.#level >= 3,
      bounds: Object.freeze(this.#calculateBounds(parentOffsetX, parentOffsetY)),
      isIndicator: this.isIndicator,
      indicatorLevel,
      indicatorKind,
      isShape: !!this.#isShape,
      isBlissGlyph: !!this.#isBlissGlyph,
      isExternalGlyph: !!this.#isExternalGlyph,
      isHeadGlyph: !!this.#blissObj.isHeadGlyph,
      isSpaceGroup: !!this.#isSpaceGroup,
      index,
      parentKey: this.#parentElement ? this.#parentElement.#key : null,
      children
    });
  }

  get effectiveBounds() {
    // Accumulate offsets from all ancestors
    let offsetX = 0;
    let offsetY = 0;
    let current = this.#parentElement;
    while (current) {
      offsetX += current.#relativeToParentX;
      offsetY += current.#relativeToParentY;
      current = current.#parentElement;
    }
    return this.#calculateBounds(offsetX, offsetY);
  }

  #calculateBounds(offsetX, offsetY) {
    const absX = offsetX + this.#relativeToParentX;
    const absY = offsetY + this.#relativeToParentY;

    if (this.#leafHeight !== undefined && this.#leafWidth !== undefined) {
      const leafY = this.#leafY || 0;
      const leafX = this.#leafX || 0;
      const minX = absX + leafX;
      const maxX = absX + leafX + this.#leafWidth;
      const minY = absY + leafY;
      const maxY = absY + leafY + this.#leafHeight;
      return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
      };
    }

    if (!this.#children || this.#children.length === 0) {
      return {
        minX: absX,
        maxX: absX,
        minY: absY,
        maxY: absY,
        width: 0,
        height: 0
      };
    }

    // An element left with no layout children collapses to a point at its
    // origin instead of Math.min/max over nothing (Infinity).
    const layoutChildren = this.#layoutChildren;
    if (layoutChildren.length === 0) {
      return {
        minX: absX,
        maxX: absX,
        minY: absY,
        maxY: absY,
        width: 0,
        height: 0
      };
    }

    const childBounds = layoutChildren.map(child =>
      child.#calculateBounds(absX, absY)
    );

    const minX = Math.min(...childBounds.map(b => b.minX));
    const maxX = Math.max(...childBounds.map(b => b.maxX));
    const minY = Math.min(...childBounds.map(b => b.minY));
    const maxY = Math.max(...childBounds.map(b => b.maxY));

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * The children an element's bounds are made of. Content-empty groups and
   * empty-parts glyphs are excluded like they are from the width getter. A
   * group of nothing but spaces is excluded here too, though the width getter
   * keeps it: it separates words and draws nothing, and the point at its own
   * origin would hold an automatic crop open on whichever edge it sits. A ZSA
   * draws nothing either, but it is content placed to hold a crop open, so it
   * counts.
   */
  get #layoutChildren() {
    if (this.#level === 0) return this.#children.filter(child => !child.#isEmptyGroup && !child.#holdsOnlySpaces);
    if (this.#level === 1) return this.#children.filter(child => !child.#isEmptyGlyph);
    return this.#children;
  }

  /**
   * What this element draws, as { minX, minY, maxX, maxY }, from the origin of
   * the frame it sits in as #calculateBounds takes it: the same boxes, each
   * leaf's widened by half the width its lines are drawn at inside the group
   * `frame` describes (#lineWidth), so the box holds the lines and not only
   * their geometry. Exact for round caps and joins, every line the library
   * draws; short of a dot's own width, which a filter region covers through
   * the viewBox, and of a corner or an end a key draws sharper, which the
   * filters carry as an outset (#lineOverhang). Undefined where the element
   * has no layout children, as it draws nothing.
   */
  #drawnBox(offsetX, offsetY, frame = {}) {
    if (this.#isLeaf) {
      return grownBy(this.#calculateBounds(offsetX, offsetY), this.#lineWidth(frame) / 2);
    }
    const absX = offsetX + this.#relativeToParentX;
    const absY = offsetY + this.#relativeToParentY;
    const boxes = this.#layoutChildren.map(child => child.#drawnBox(absX, absY, frame)).filter(Boolean);
    return boxes.length > 0 ? unionOf(boxes) : undefined;
  }

  /**
   * The width this element's lines are drawn at inside a group written with
   * `frame.width`: the nearest width an element states itself, from this one
   * up to `frame.top` (the element the group is drawn for: the group's width
   * holds its own, or a key written on the group replaces it), or the root,
   * whose option the content group writes; widened by
   * `frame.extra`, as an ink area widens every width stated inside it. Else
   * the group's, and where no group is given, the width the options give
   * this element. An element's own width is written on its own group, so it
   * beats whatever the group around it writes, an author's key included.
   */
  #lineWidth({ top, width, extra = 0 }) {
    for (let element = this; element && element !== top && element.#level > 0; element = element.#parentElement) {
      const own = element.#blissObj.options?.strokeWidth;
      if (own !== undefined) return own + extra;
    }
    return width ?? this.#getInheritedOption('strokeWidth') ?? DEFAULT_STROKE_WIDTH;
  }

  /** Whether this element draws lines of its own, as a shape does, rather than holding elements that do. */
  get #isLeaf() {
    return this.#leafHeight !== undefined && this.#leafWidth !== undefined;
  }

  /**
   * How far past its drawn box (#drawnBox) this element's lines may draw
   * inside the group `frame` describes, where a key lets a corner or an end
   * reach further than the half width the box holds: a join drawn as neither
   * round nor bevel may be a miter, its tip up to the miter limit's half
   * widths from the corner, and a cap drawn as neither round nor butt is
   * square, its corners √2 half widths from the end. The nearest join and cap
   * written around the lines decide (#lineGroups), as a renderer inherits
   * them; a word it cannot read falls back to the initial miter or to one
   * written further out, so it counts as neither safe word. The limit is the
   * nearest that reads as one (writtenMiterLimit), as a renderer ignores any
   * other, else the initial 4. Carried as an outset, as an effect's reach is,
   * so the box keeps what is surely drawn, the thin-element shape judges
   * that, and a huge limit grows a region past the picture no further than
   * an absurd effect does. 0 for an element whose lines are its children's.
   */
  #lineOverhang(frame) {
    if (!this.#isLeaf) return 0;
    const groups = this.#lineGroups(frame);
    const nearest = (name) => groups.find(group => Object.hasOwn(group, name))?.[name];
    const limit = groups.map(group => writtenMiterLimit(group['stroke-miterlimit'])).find(read => read !== undefined) ?? INITIAL_MITER_LIMIT;
    const join = drawnAs(nearest('stroke-linejoin'), HALF_WIDTH_JOINS) ? 1 : limit;
    const cap = drawnAs(nearest('stroke-linecap'), HALF_WIDTH_CAPS) ? 1 : Math.SQRT2;
    return (Math.max(join, cap) - 1) * this.#lineWidth(frame) / 2;
  }

  /**
   * The attributes of the groups this element's lines are drawn in, as
   * { name: value }, nearest first: each element's own group, from this one
   * up to its word, as the lines inherit them, except in a copy of the
   * lines (`frame.copy`, an ink area's), whose elements write none of
   * theirs; then the groups the frame holds the lines in (`frame.groups`),
   * the content group's and the root's last.
   */
  #lineGroups({ copy = false, groups = [] }) {
    const own = [];
    for (let element = this; !copy && element && element.#level > 0; element = element.#parentElement) {
      own.push(Object.fromEntries(BlissElement.#separateAnchorAndGroupOptions(element.#blissObj.options, element.#blissObj.authoredOptions).groupEntries));
    }
    return [...own, ...groups];
  }

  /**
   * The group the lines sit in as #lineWidth and #lineGroups read it: the
   * content group, with the width it is drawn at and the groups its lines
   * inherit a join, a cap and a miter limit from, itself and the root. A tree
   * rendered outside a picture has none, and its lines are sized by the
   * options and drawn round.
   */
  get #contentFrame() {
    return {
      width: this.#sharedOptions.contentStrokeWidth?.(),
      groups: this.#sharedOptions.contentGroups?.() ?? [],
    };
  }

  /**
   * How far past its drawn box (#drawnBox) what this element holds draws,
   * inside the group `frame` describes: a filter on a child carries the
   * child's ink its reach past the child, past what the filters inside the
   * child already carry it, so the reaches along a chain add up, and a line
   * reaches past the box as far as its corners and ends do (#lineOverhang);
   * 0 where neither reaches further.
   */
  #filterOutset(frame) {
    return Math.max(this.#lineOverhang(frame), ...this.#layoutChildren.map(child => filterReach(
      BlissElement.#separateAnchorAndGroupOptions(child.#blissObj.options, child.#blissObj.authoredOptions).groupEntries,
    ) + child.#filterOutset(frame)));
  }

  /**
   * translateFilters for this element's own attributes: each <filter> covers
   * the picture, what this element draws and how far the filters inside it
   * carry that (#filterOutset), and where its link answers a click (`box()`
   * as #linkHit takes it, #linkBox), and a thin element gets the shape that
   * keeps it drawn, measured in the frame at (x, y), as getSvgContent takes
   * it. The picture's numbering is the one the builder shares while it
   * renders; outside a render nothing is translated.
   */
  #ownFilters(x, y, box) {
    return (entries, linked) => translateFilters(entries, () => ({
      drawn: this.#drawnBox(x, y, this.#contentFrame),
      geometry: this.#calculateBounds(x, y),
      hit: linked ? this.#linkBox(x, y, box) : undefined,
      outset: this.#filterOutset(this.#contentFrame),
    }), this.#sharedOptions.filters);
  }

  toString() {
    const obj = this.toJSON();

    function traverse(obj, level = 1) {
      if (!obj.elements) {
          let str =  obj.codeName;
          if (obj.x !== 0 || obj.y !== 0) {
            str = `${str}:${obj.x},${obj.y}`;
          }
          return str;
      }
      
      const delimiterMap = {
          1: '//',
          2: '/',
          3: ';',
      };

      const results = obj.elements.map(subObj => traverse(subObj, level + 1)).join(delimiterMap[level]);
  
      return results;
    }

    return traverse(obj);
  }

  toJSON() {
    let obj = {};

    // B-code glyphs with a known code are emitted as leaf nodes (normalized)
    // Shapes, external glyphs, and other named elements are also leaves
    // Only unnamed composites (no codeName) recurse into children
    if (this.#codeName) {
        const element = {};
        element.codeName = this.codeName;
        element.width = this.width;
        element.x = this.#relativeToParentX;
        element.y = this.#relativeToParentY;
        obj = element;
    } else if (this.#children) {
      obj.elements = []
      for (const child of this.#children) {
        obj.elements.push(child.toJSON());
      }
    }

    return obj;
  }


  #handlePredefinedElement(definition) {
    if (typeof definition?.getPath !== 'function') throw new Error('An element is only predefined if has a proper getPath function.');

    // Surface 'XTXT_<chars>' (internal text-fallback routing key) as
    // 'X<chars>' publicly. Internal lookup uses #blissObj.codeName.
    const raw = this.#blissObj.codeName;
    this.#codeName = (typeof raw === 'string' && raw.startsWith('XTXT_'))
      ? 'X' + raw.slice(5)
      : raw;
    this.#extraPathOptions = definition.extraPathOptions || {}; //default: empty object
    this.#isCharacter = !!definition.isCharacter;               //default: false
    this.#isShape = !!definition.isShape;                      //default: false
    this.#leafWidth = definition.width;
    this.#leafHeight = definition.height;
    this.#leafX = definition.x;
    this.#leafY = definition.y;
    
    this.getSvgContent = (x = 0, y = 0, halo = null) => {
      // Build path options with inheritance: extraPathOptions < inherited < element-level
      // Use #getInheritedOption for options which already handle the inheritance chain
      const inheritedColor = this.#getInheritedOption('color');
      const inheritedStrokeWidth = this.#getInheritedOption('strokeWidth');
      const inheritedDotExtraWidth = this.#getInheritedOption('dotExtraWidth');
      const inheritedSdotExtraWidth = this.#getInheritedOption('sdotExtraWidth');
      const inheritedDotWidth = this.#getInheritedOption('dotWidth');
      const inheritedSdotWidth = this.#getInheritedOption('sdotWidth');

      // Per-family dot sizing. Absolute (dot-width/sdot-width) beats relative
      // (dot-extra-width/sdot-extra-width). DOT/COMMA take dot-extra-width
      // as-is; SDOT follows as half by default (the bulk knob preserves the
      // DOT:SDOT half-relationship), but its own sdot-* options override that.
      // Non-dot shapes get no dot knob (they ignore it).
      const dotFamily = definition.dotFamily;
      let dotPathOpts = {};
      if (dotFamily === 'dot') {
        if (inheritedDotWidth !== undefined) dotPathOpts = { dotWidth: inheritedDotWidth };
        else if (inheritedDotExtraWidth !== undefined) dotPathOpts = { extraDotWidth: inheritedDotExtraWidth };
      } else if (dotFamily === 'sdot') {
        if (inheritedSdotWidth !== undefined) dotPathOpts = { dotWidth: inheritedSdotWidth };
        else if (inheritedSdotExtraWidth !== undefined) dotPathOpts = { extraDotWidth: inheritedSdotExtraWidth };
        else if (inheritedDotExtraWidth !== undefined) dotPathOpts = { extraDotWidth: inheritedDotExtraWidth / 2 };
      }

      const pathOptions = {
        ...this.#extraPathOptions,
        ...(inheritedColor !== undefined && { color: inheritedColor }),
        ...(inheritedStrokeWidth !== undefined && { baseStrokeWidth: inheritedStrokeWidth }),
        ...dotPathOpts,
        // An ink area draws the lines in its own paint, the widths a shape
        // states itself widened by the outline (#inkArea).
        ...(halo && { color: halo.paint, outline: halo.outline }),
      };
      const pathData = definition.getPath(
        this.#relativeToParentX + x,
        this.#relativeToParentY + y,
        pathOptions
      );

      if (halo) return this.#haloWrap(pathData, halo, x, y);
      const box = () => BlissElement.#inkHitBox(this.#calculateBounds(x, y), this.#areaPadding(BlissElement.#LINK_AREAS));
      return BlissElement.#wrapWithAnchorAndGroup(pathData, this.#blissObj.options, this.#blissObj.authoredOptions,
        () => this.#linkHit(x, y, box), this.#ownFilters(x, y, box));
    };
  }

  #handleCompositeElement(parts) {
    if (this.#level > MAX_RECURSION_DEPTH) throw new Error('Maximum element nesting depth exceeded');
    this.#children = [];

    for (const part of parts) {
      const child = new BlissElement(part, {
        parentElement: this,
        previousElement: this.#children[this.#children.length - 1],
        level: this.#level + 1,
        sharedOptions: this.#sharedOptions,
      });
      this.#children.push(child);
    }

    // A compound indicator whose sub-parts carry no baked positions must lay
    // them out as a baseless stack (left-to-right from origin), the same as
    // #positionIndicatorGroup does for a baseless stack at the character level.
    // Without this, an unpositioned all-indicator composite (e.g. a user-defined
    // COMBO_IND = B86;B97) collapses its sub-parts to x=0 when nested as a glyph
    // part, so a sibling stacked indicator overlaps it and the composite's width
    // (derived from its children) under-reports. Built-in compound indicators
    // bake explicit x on their parts (B98 = B97;B99:3,0), so the x === undefined
    // guard leaves them untouched.
    // (#handleCompositeElement is only reached for a non-empty parts list, so
    // children is non-empty here and .every is never vacuous.)
    if (this.#children.every(c => c.isIndicator)) {
      let currentX = 0;
      for (const child of this.#children) {
        if (child.#blissObj.x === undefined) child.#relativeToParentX = currentX;
        currentX = child.#relativeToParentX + child.width + INDICATOR_GAP;
      }
    }

    // Check if this is an indicator at level 3 that will be positioned by #positionIndicatorGroup
    // If so, skip normalization here - let level 2 handle the positioning
    const isIndicatorAtLevel3 = this.#level === 3 && this.isIndicator;

    // Normalize: shift the child parts so the leftmost lands at x=0 and the
    // stripped common min moves onto the composite as displacement,
    // either sign. This holds for a SINGLE child too (its own x IS the n=1
    // common min): the offset is not discarded, so a use-site coord still ADDS
    // to it rather than replacing it, while the composite's
    // frame now equals its ink span. Keeping the offset on a lone child instead
    // (the former length > 1 gate) left a nonzero baked offset inside the
    // frame: a negative one made the frame a span wider than the ink (a phantom
    // right gap in the canvas + advance) and let the ink escape level-2's
    // negatives-only normalization, so the render disagreed with its own
    // decomposed toString. The serializer's decompose uniformly ADDS baked and
    // use-site coords; moving the min onto the composite matches that, and
    // level 2's negatives-only normalization then acts on the resulting final
    // absolute position exactly as it does for the decomposed form. Skip for a
    // level-3 indicator the parent #positionIndicatorGroup will place; the y
    // axis is never re-origined.
    if (!isIndicatorAtLevel3 && this.#children.length > 0) {
      const minX = Math.min(...this.#children.map(child => child.#relativeToParentX));
      if (minX !== 0) {
        for (const child of this.#children) {
          child.#relativeToParentX -= minX;
        }
        this.#relativeToParentX += minX;
      }
    }

    // Note: Indicator positioning (X and Y) is now handled at level 2 by #positionIndicatorGroup
    // This method no longer needs to calculate indicator positions

    this.#anchorOffsetX = this.#blissObj.anchorOffsetX || 0;
    this.#anchorOffsetY = this.#blissObj.anchorOffsetY || 0;

    this.getSvgContent = (x = 0, y = 0, halo = null) => {
      const childContents = this.#children.map(child =>
        child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y, halo)
      );

      const hasTaggedContent = childContents.some(c => c.startsWith('<'));
      const hasRawContent = childContents.some(c => !c.startsWith('<'));

      const content = hasTaggedContent && hasRawContent
        ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
        : childContents.join('');

      if (halo) return this.#haloWrap(content, halo, x, y);
      const box = () => BlissElement.#inkHitBox(this.#calculateBounds(x, y), this.#areaPadding(BlissElement.#LINK_AREAS));
      return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
        () => this.#linkHit(x, y, box), this.#ownFilters(x, y, box));
    };
  }
}

