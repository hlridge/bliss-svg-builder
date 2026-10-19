/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes, isSpaceGlyph } from "./bliss-element-definitions.js";
import { INTERNAL_OPTIONS, PUBLICATION_MAP, ANCHOR_ATTRIBUTE_NAMES, BAND_HEIGHT, HIT_MARGIN, PART_HIT_MARGIN, INK_AREA_MARGIN, DEFAULT_STROKE_WIDTH, ELEMENT_CLASSES, BACKGROUND_AREA_ELEMENTS, isDocumentDefiningAttribute, isSafeAttributeName, generateKey, MAX_RECURSION_DEPTH, WARNING_CODES } from "./bliss-constants.js";
import { createTextFallbackGlyph } from "./bliss-shape-creators.js";
import { basePartCount, classifyIndicatorKind } from "./indicator-utils.js";
import { resolveHeadIndex, headScanCode } from "./bliss-head-glyph-exclusions.js";

// Horizontal gap (in glyph units) between consecutive indicators in a stack.
// Shared by the character-level indicator layout (#positionIndicatorGroup) and
// the nested compound-indicator layout (#handleCompositeElement) so the two
// cannot drift.
const INDICATOR_GAP = 1;

// Rounds a number the tree writes into a rect as the builder rounds the
// picture's own (4 decimals), which removes the float noise of summed positions.
const roundForMarkup = (num) => parseFloat(num.toFixed(4));

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
  #linkArea; // { left, right } in its own frame, set by the root once the layout is final (levels 1 and 2)
  #paintArea; // the same for its background, the margins shared between painted neighbours instead

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
   * Whether an `href` may build a link: a web, mail or phone address, a path,
   * or a fragment. Anything else (`javascript:`, `data:`) builds none. Judged
   * with control characters removed and the ends trimmed; the value written
   * into the link is the one the author gave. Shared by every level's link and
   * the global one the builder draws, so the two cannot disagree.
   *
   * @param {*} value - the href as stored (already escaped)
   * @returns {boolean}
   */
  static isSafeHref(value) {
    const cleaned = String(value).replace(/[\x00-\x1f\x7f]/g, '').trim();
    return /^(https?:|mailto:|tel:|\/|#)/i.test(cleaned);
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
   * @param {string} content - The content to wrap (raw path data or HTML string)
   * @param {Object} processed - The library's computed values, of which only the
   *   two in PUBLICATION_MAP reach the markup
   * @param {Object} authored - The author's own keys, emitted as they were typed
   * @param {function(): string} linkHit - the markup that makes a link answer a
   *   click, drawn first inside it; called only for an element that builds a
   *   link, and '' where it covers nothing
   * @returns {string} The wrapped content
   */
  static #wrapWithAnchorAndGroup(content, processed, authored, linkHit) {
    const { anchorAttrs, groupAttrs, hasHref, vectorEffect } = BlissElement.#separateAnchorAndGroupOptions(processed, authored);

    // Content that starts with '<' is already wrapped in proper tags
    // Raw path data or fragments need wrapping
    const needsPathWrapper = !content.startsWith('<');

    // vector-effect is non-inherited: relocate it onto the <path>, not the <g>.
    const stamp = (inner) => vectorEffect ? BlissElement.applyVectorEffectToPaths(inner, vectorEffect) : inner;

    if (hasHref) {
      const hit = linkHit();
      const inner = stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
      if (groupAttrs) {
        return `<a ${anchorAttrs} style="cursor: pointer;"><g ${groupAttrs}>${hit}${inner}</g></a>`;
      }
      const body = content.includes('<a ') ? `<g>${inner}</g>` : inner;
      return `<a ${anchorAttrs} style="cursor: pointer;">${hit}${body}</a>`;
    }

    if (groupAttrs) {
      const wrappedContent = stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
      return `<g ${groupAttrs}>${wrappedContent}</g>`;
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
   * A linked or painted part's area: its ink box plus PART_HIT_MARGIN on every
   * side.
   */
  static #inkHitBox({ minX, minY, width, height }) {
    return {
      x: minX - PART_HIT_MARGIN,
      y: minY - PART_HIT_MARGIN,
      width: width + 2 * PART_HIT_MARGIN,
      height: height + 2 * PART_HIT_MARGIN,
    };
  }

  /**
   * A linked or painted word's or character's area: its link area or its paint
   * area across the band plus HIT_MARGIN above and below, placed from its
   * frame's origin. Null without an area, as for a word of no characters. A
   * character overlapped by both neighbours can be left an area of no width,
   * never a negative one.
   */
  static #bandHitBox(originX, originY, area) {
    if (!area) return null;
    return {
      x: originX + area.left,
      y: originY - HIT_MARGIN,
      width: Math.max(0, area.right - area.left),
      height: BAND_HEIGHT + 2 * HIT_MARGIN,
    };
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
   * each sharing its margins only with neighbours of its own kind. A
   * character's area runs across its base span, indicators ignored, plus
   * HIT_MARGIN on each side. Toward a linked neighbour (the next character in
   * reading order, across a word space too, linked itself or by its word) its
   * link area takes half the gap where that is less, so two links closer than
   * twice the margin meet halfway; toward any other it keeps the full margin
   * at any gap, since no other link is there to share it. Its paint area does
   * the same toward a painted neighbour, painted itself or by its word. A
   * part's link or background, or the global one, does not count for its
   * character. A word's area joins its characters'. Done here because a
   * character cannot see a neighbour in another word from its own frame.
   * Spaces and characters that draw nothing are not characters here: no area
   * of their own, and no neighbour to anyone.
   */
  #assignAreas() {
    // Base spans in the root's frame, in reading order.
    const characters = this.#children
      .filter(group => !group.#isSpaceGroup)
      .flatMap(group => {
        const wordLinked = group.#buildsLink;
        const wordPainted = group.#background !== '';
        return group.#children
          .filter(glyph => glyph.#children.length > 0)
          .map(glyph => {
            const origin = group.#relativeToParentX + glyph.#relativeToParentX;
            const { left, right } = glyph.#baseSpan;
            const linked = wordLinked || glyph.#buildsLink;
            const painted = wordPainted || glyph.#background !== '';
            return { group, glyph, origin, linked, painted, left: origin + left, right: origin + right };
          });
      });

    // Per kind: which neighbours share its margins, and where its area is kept.
    const kinds = [
      [character => character.linked, (element, area) => { element.#linkArea = area; }],
      [character => character.painted, (element, area) => { element.#paintArea = area; }],
    ];
    for (const [shares, setArea] of kinds) {
      const words = new Map(); // group -> its characters' areas joined, in the root's frame
      characters.forEach(({ group, glyph, origin, left, right }, i) => {
        const previous = characters[i - 1];
        const next = characters[i + 1];
        const areaLeft = left - (previous && shares(previous) ? Math.min(HIT_MARGIN, (left - previous.right) / 2) : HIT_MARGIN);
        const areaRight = right + (next && shares(next) ? Math.min(HIT_MARGIN, (next.left - right) / 2) : HIT_MARGIN);
        setArea(glyph, { left: areaLeft - origin, right: areaRight - origin });
        const word = words.get(group) ?? { left: areaLeft, right: areaRight };
        words.set(group, { left: Math.min(word.left, areaLeft), right: Math.max(word.right, areaRight) });
      });

      for (const [group, { left, right }] of words) {
        setArea(group, { left: left - group.#relativeToParentX, right: right - group.#relativeToParentX });
      }
    }
  }

  /**
   * What makes this element's link answer a click, drawn first inside the
   * link: a transparent rect over `box()`, its area, or where the `link-area`
   * it inherits is `ink`, its lines drawn again in transparent (#inkArea), so
   * only the lines and INK_AREA_MARGIN around them answer. The group sets
   * `fill="none"` for the reason an ink background does (#backgroundMarkup).
   * '' where it covers nothing. `x` and `y` are the origin of the frame this
   * element sits in, as getSvgContent takes them.
   */
  #linkHit(x, y, box) {
    if (this.#getInheritedOption('linkArea') === 'ink') {
      const paint = 'transparent';
      const ink = this.#inkArea(x, y, paint);
      return ink ? `<g fill="none" stroke="${paint}" stroke-width="${ink.width}">${ink.lines}</g>` : '';
    }
    const area = box();
    return area ? BlissElement.#hitRect(area) : '';
  }

  /**
   * This element's lines as an ink area draws them: rendered again in the
   * halo mode getSvgContent takes, in `paint`, each line widened by twice
   * INK_AREA_MARGIN and each letter filled in `paint` and outlined by as much.
   * Returns the lines, and the width a group strokes them at (the element's
   * computed width, widened alike); null where it draws no line, as ZSA does.
   * Built from the widths the library computes: the element's own attributes
   * reach its lines, not its ink area, as they do not reach a box.
   */
  #inkArea(x, y, paint) {
    const outline = 2 * INK_AREA_MARGIN;
    const lines = this.getSvgContent(x, y, { paint, outline, element: this });
    if (lines === '') return null;
    return {
      lines: lines.startsWith('<') ? lines : `<path d="${lines}"/>`,
      width: roundForMarkup((this.#getInheritedOption('strokeWidth') ?? DEFAULT_STROKE_WIDTH) + outline),
    };
  }

  /**
   * This element's content in the halo mode of getSvgContent, where it writes
   * none of its wrappers (no link, none of its attributes) but a width of its
   * own, re-stated widened on a group exactly where its ink states it. The
   * painted element's own width goes on its ink area's group instead.
   */
  #haloWrap(content, halo) {
    const options = this.#blissObj.options ?? {};
    if (halo.element === this || !Object.hasOwn(options, 'strokeWidth')) return content;
    const lines = content.startsWith('<') ? content : `<path d="${content}"/>`;
    return `<g stroke-width="${roundForMarkup(options.strokeWidth + halo.outline)}">${lines}</g>`;
  }

  /**
   * What this element's own background draws, in the content's coordinates,
   * from the origin of the frame it sits in, by the `background-area` it
   * inherits: `{ area: 'box', box }` or `{ area: 'ink', lines, width }`
   * (#inkArea); null where it draws none. A word's or a character's box is
   * its paint area across the band, a part's its ink box plus PART_HIT_MARGIN:
   * the shapes a link's area takes. An ink area draws nothing where there is no
   * line. A word or a character with no paint area draws nothing: a word of no
   * characters, a character that draws nothing, and the root, which is never
   * given one, as its background is the picture's own, drawn by the builder.
   */
  #backgroundDrawing(x, y) {
    if (this.#background === '') return null;
    if (this.#level <= 2 && !this.#paintArea) return null;
    if (this.#getInheritedOption('backgroundArea') === 'ink') {
      const ink = this.#inkArea(x, y, this.#background);
      return ink && { area: 'ink', ...ink };
    }
    const box = this.#level <= 2
      ? BlissElement.#bandHitBox(this.#relativeToParentX + x, this.#relativeToParentY + y, this.#paintArea)
      : BlissElement.#inkHitBox(this.#calculateBounds(x, y));
    return { area: 'box', box };
  }

  /**
   * Visits every element at or below this one that draws a background, with
   * what it draws, in the order the backgrounds are drawn: pre-order, so a
   * word comes before its characters, a character before its parts, and an
   * earlier part before a later one. `x` and `y` are the origin of the frame
   * this element sits in, as getSvgContent takes them.
   */
  #visitBackgrounds(visit, x = 0, y = 0) {
    const drawing = this.#backgroundDrawing(x, y);
    if (drawing) visit(this, drawing);
    for (const child of this.#children) {
      child.#visitBackgrounds(visit, this.#relativeToParentX + x, this.#relativeToParentY + y);
    }
  }

  /**
   * This element's background as markup, in its paint: a rect over its box,
   * or a group stroking its lines. The rect sets `stroke="none"` itself, or the
   * content group's stroke would outline it; the group sets `fill="none"`, or a
   * `fill` written for the whole symbol, which lands on the content group,
   * would fill every enclosure it rings. Their classes make them targets of
   * the layer attributes, which the builder writes through the formatter it
   * shares with the tree; a tree built without one writes the classes and the
   * computed attributes alone.
   */
  #backgroundMarkup(drawing) {
    const classes = ELEMENT_CLASSES[BACKGROUND_AREA_ELEMENTS[drawing.area]];
    const format = this.#sharedOptions.formatLayerAttributes ?? BlissElement.#ownLayerAttributes;
    if (drawing.area === 'ink') {
      const computed = { fill: 'none', stroke: this.#background, 'stroke-width': drawing.width };
      return `<g ${format(classes, computed)}>${drawing.lines}</g>`;
    }
    const { box } = drawing;
    const computed = {
      x: roundForMarkup(box.x),
      y: roundForMarkup(box.y),
      width: roundForMarkup(box.width),
      height: roundForMarkup(box.height),
      fill: this.#background,
      stroke: 'none',
    };
    return `<rect ${format(classes, computed)}/>`;
  }

  /** A layer's attributes with no author's to add: its classes, then what was computed. */
  static #ownLayerAttributes(classes, computed) {
    return Object.entries({ class: classes.join(' '), ...computed })
      .map(([name, value]) => `${name}="${value}"`)
      .join(' ');
  }

  /**
   * The ELEMENT_CLASSES entries of the element backgrounds this tree draws,
   * found by the walk that draws them (root only), which renders an ink
   * area's lines to learn whether it has any. The builder reads it to report
   * a layer attribute that displaces a written `background`, which it can
   * judge only once the tree is built.
   */
  get drawnBackgroundElements() {
    const drawn = new Set();
    this.#visitBackgrounds((element, drawing) => drawn.add(BACKGROUND_AREA_ELEMENTS[drawing.area]));
    return drawn;
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

    const groupAttrStrings = [...groupAttrs].map(([name, value]) => `${name}="${value}"`);

    return {
      anchorAttrs: anchorAttrs.join(' '),
      groupAttrs: groupAttrStrings.join(' '),
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
   * A displaced single-child composite keeps its baked offset (SIB-3), so its
   * ink begins right of x=0 while its reported width still spans from the
   * origin — indicator centering reads this to skip the leading gap (XC-1).
   */
  get #inkStartX() {
    if (!this.#children || this.#children.length === 0) return 0;
    return Math.min(...this.#children.map(child => child.#relativeToParentX + child.#inkStartX));
  }

  /**
   * True ink end within this element's own frame: the width for a leaf; for a
   * composite, the rightmost child ink edge. A negative-min composite reports
   * its width as a span SIZE (max - min), not a right-edge coordinate, so
   * position + width overstates where the ink stops (XC-1 review F1).
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

    // Calculate base glyph metrics over the TRUE INK SPAN (XC-1): both edges
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
    // (The pre-2026-07-08 rule centered the MIDPOINT of the first/last
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
        // ink of every earlier neighbour or part it reaches under. Every link
        // is drawn after them too, so none takes a link's click. The ink
        // follows as svgContent would write it alone: raw path data in a path
        // of its own.
        const backgrounds = [];
        this.#visitBackgrounds((element, drawing) => backgrounds.push(element.#backgroundMarkup(drawing)), x, y);
        if (backgrounds.length === 0) return ink;
        return backgrounds.join('') + (ink.startsWith('<') ? ink : `<path d="${ink}"/>`);
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

        if (halo) return this.#haloWrap(content, halo);
        return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
          () => this.#linkHit(x, y, () => BlissElement.#bandHitBox(originX, originY, this.#linkArea)));
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

            if (halo) return this.#haloWrap(content, halo);
            return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
              () => this.#linkHit(x, y, () => BlissElement.#bandHitBox(originX, originY, this.#linkArea)));
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
      maxRelativeXPlusWidth = Math.max(...layoutChildren.map(child =>
        child.#relativeToParentX + child.width));
    }

    let width;
    if (this.#level === 0) {
      width = maxRelativeXPlusWidth - minRelativeX + this.#childStartOffset;
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
   * Classifies an indicator part for introspection (R14 Task 6).
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

    // Content-empty groups and empty-parts glyphs are excluded from bounds
    // like they are from the width getter. A group of nothing but spaces is
    // excluded here too, though the width getter keeps it: it separates
    // words and draws nothing, and the point at its own origin would hold an
    // automatic crop open on whichever edge it sits. A ZSA draws nothing
    // either, but it is content placed to hold a crop open, so it counts.
    // An element left with no layout children collapses to a point at its
    // origin instead of Math.min/max over nothing (Infinity).
    const layoutChildren = this.#level === 0
      ? this.#children.filter(child => !child.#isEmptyGroup && !child.#holdsOnlySpaces)
      : this.#level === 1
        ? this.#children.filter(child => !child.#isEmptyGlyph)
        : this.#children;
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

      if (halo) return this.#haloWrap(pathData, halo);
      return BlissElement.#wrapWithAnchorAndGroup(pathData, this.#blissObj.options, this.#blissObj.authoredOptions,
        () => this.#linkHit(x, y, () => BlissElement.#inkHitBox(this.#calculateBounds(x, y))));
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
    // guard leaves them untouched. R15 3b-5.
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
    // stripped common min moves onto the composite as displacement (XC-2),
    // either sign. This holds for a SINGLE child too (its own x IS the n=1
    // common min): the offset is not discarded, so a use-site coord still ADDS
    // to it rather than replacing it (SIB-3's concern), while the composite's
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

      if (halo) return this.#haloWrap(content, halo);
      return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options, this.#blissObj.authoredOptions,
        () => this.#linkHit(x, y, () => BlissElement.#inkHitBox(this.#calculateBounds(x, y))));
    };
  }
}

