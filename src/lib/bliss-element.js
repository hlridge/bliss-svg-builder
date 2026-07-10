/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, isSpaceGlyph } from "./bliss-element-definitions.js";
import { INTERNAL_OPTIONS, isSafeAttributeName, generateKey, MAX_RECURSION_DEPTH, WARNING_CODES } from "./bliss-constants.js";
import { createTextFallbackGlyph } from "./bliss-shape-creators.js";
import { classifyIndicatorKind } from "./indicator-utils.js";
import { resolveHeadIndex, headScanCode } from "./bliss-head-glyph-exclusions.js";

// Horizontal gap (in glyph units) between consecutive indicators in a stack.
// Shared by the character-level indicator layout (#positionIndicatorGroup) and
// the nested compound-indicator layout (#handleCompositeElement) so the two
// cannot drift.
const INDICATOR_GAP = 1;

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
  #isEmptyGlyph
  //#endregion
  #childStartOffset
  #parentElement;
  #previousElement;
  #classifiedParts; // Cached result of #classifyParts (level 2 only)

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
   * Wraps content with <a> and/or <g> tags based on options.
   * Ensures consistent wrapping behavior across all element levels.
   *
   * @param {string} content - The content to wrap (raw path data or HTML string)
   * @param {Object} options - The options containing anchor and group attributes
   * @returns {string} The wrapped content
   */
  static #wrapWithAnchorAndGroup(content, options) {
    const { anchorAttrs, groupAttrs, hasHref, vectorEffect } = BlissElement.#separateAnchorAndGroupOptions(options);

    // Content that starts with '<' is already wrapped in proper tags
    // Raw path data or fragments need wrapping
    const needsPathWrapper = !content.startsWith('<');

    // vector-effect is non-inherited: relocate it onto the <path>, not the <g>.
    const stamp = (inner) => vectorEffect ? BlissElement.applyVectorEffectToPaths(inner, vectorEffect) : inner;

    if (hasHref) {
      const wrappedContent = stamp(needsPathWrapper ? `<path d="${content}"/>` : content);
      if (groupAttrs) {
        return `<a ${anchorAttrs} style="cursor: pointer;"><g ${groupAttrs}>${wrappedContent}</g></a>`;
      }
      return `<a ${anchorAttrs} style="cursor: pointer;">${wrappedContent}</a>`;
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

  static #separateAnchorAndGroupOptions(options) {
    if (!options || typeof options !== 'object') {
      return { anchorAttrs: '', groupAttrs: '', hasHref: false };
    }

    const anchorAttrNames = new Set([
      'href',
      'target',
      'rel',
      'download',
      'hreflang',
      'type',
      'referrerpolicy'
    ]);

    // Use shared INTERNAL_OPTIONS constant
    // Multi-level options (strokeWidth, color, fill, opacity, etc.) are NOT in this set - they should render as attributes.

    const attrMap = {
      'color': 'stroke',
      'strokeWidth': 'stroke-width'
    };

    const anchorAttrs = [];
    const groupAttrs = new Map(); // attrName -> value; deduped, explicit name beats alias
    let hasHref = false;
    let hasPointerEvents = false;
    let vectorEffect = null;

    const isSafeHref = (value) => {
      const cleaned = String(value).replace(/[\x00-\x1f\x7f]/g, '').trim();
      return /^(https?:|mailto:|tel:|\/|#)/i.test(cleaned);
    };

    // Values are already escaped by #processOptions at the input boundary
    for (const [key, value] of Object.entries(options)) {
      if (INTERNAL_OPTIONS.has(key) || !isSafeAttributeName(key)) continue;

      if (anchorAttrNames.has(key)) {
        if (key === 'href') {
          if (!isSafeHref(value)) continue;
          hasHref = true;
        }
        anchorAttrs.push(`${key}="${value}"`);
      } else {
        const attrName = attrMap[key] || key;
        // vector-effect is non-inherited; capture it for relocation onto paths
        if (attrName === 'vector-effect') { vectorEffect = value; continue; }
        if (key === 'pointer-events') hasPointerEvents = true;
        // Each attribute name is emitted once (issue #28). On a collision the
        // explicitly-named attribute wins over an alias (color -> stroke,
        // strokeWidth -> stroke-width). Today #processOptions already orders the
        // color alias ahead of a passthrough stroke, so the skip branch is
        // defensive: it keeps explicit-wins an invariant rather than an artifact
        // of that ordering, independent of option order.
        const isAlias = attrName !== key;
        if (!groupAttrs.has(attrName) || !isAlias) {
          groupAttrs.set(attrName, value);
        }
      }
    }

    if (hasHref && !hasPointerEvents) {
      groupAttrs.set('pointer-events', 'bounding-box');
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
    const firstGroup = this.#children?.[0];
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
          // Find how far the leftmost indicator extends left of x=0 (glyph start)
          const indicatorLeftX = indicatorParts[0].#relativeToParentX;
          if (indicatorLeftX < 0) {
            this.#childStartOffset = -indicatorLeftX;
          }
        }
      }
      this.#relativeToParentX = this.#childStartOffset + (this.#blissObj.x ?? 0);
      this.#relativeToParentY = this.#blissObj.y ?? 0;

      this.getSvgContent = (x = 0, y = 0) => {
        const childContents = this.#children.map(child =>
          child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
        );

        const hasTaggedContent = childContents.some(c => c.startsWith('<'));
        const hasRawContent = childContents.some(c => !c.startsWith('<'));

        const content = hasTaggedContent && hasRawContent
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
          : childContents.join('');

        // At level 0 (sentence/global), only pass anchor attributes to #wrapWithAnchorAndGroup
        // SVG-level attributes (stroke-width, color, etc.) are handled by the SVG builder
        const anchorAttrNames = new Set(['href', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy']);
        const filteredOptions = {};
        if (this.#blissObj.options) {
          for (const [key, value] of Object.entries(this.#blissObj.options)) {
            if (anchorAttrNames.has(key)) {
              filteredOptions[key] = value;
            }
          }
        }

        return BlissElement.#wrapWithAnchorAndGroup(content, filteredOptions);
      };
    } else if (this.#level === 1) {
      // Group level
      if (!this.#blissObj.glyphs) {
        this.#blissObj = { glyphs: [this.#blissObj] };
      }

      // Word/group-level fail-render: the L1 analogue of the L2 character
      // placeholder. A group the parser flagged invalid (errorCode) -- e.g. a
      // malformed word-level indicator, or an indicator bound to a multi-word
      // alias -- records ONE warning for the whole word and collapses to a
      // single error icon (error-placeholder on) or nothing (off), instead of
      // expanding its glyphs. A malformed *word* property invalidates the word,
      // not one character, so the failure lives at L1, not L2.
      if (this.#blissObj.errorCode) {
        if (!this.#sharedOptions?.warnings) {
          throw new Error(`Unable to create Bliss element: ${this.#blissObj.error || this.#blissObj.errorCode}`);
        }
        this.#sharedOptions.warnings.push({
          code: this.#blissObj.errorCode,
          message: this.#blissObj.error,
          source: this.#blissObj.errorSource,
        });
        if (this.#sharedOptions?.errorPlaceholder) {
          // One placeholder character stands in for the whole failed word.
          const placeholderChild = new BlissElement(
            { parts: structuredClone(this.#sharedOptions.errorPlaceholderParts) },
            { parentElement: this, level: this.#level + 1, sharedOptions: this.#sharedOptions }
          );
          this.#children.push(placeholderChild);
        }
        // error-placeholder off: leave #children empty (invisible word).
      } else {
        // Empty-parts glyphs are skipped in the sibling chain so surviving
        // neighbors pair up for spacing and kerning exactly as they do when
        // the serialized form (which omits empty glyphs) is reparsed.
        let previousLayoutGlyph = null;
        for (const glyph of this.#blissObj.glyphs) {
          const child = new BlissElement(glyph, { parentElement: this, previousElement: previousLayoutGlyph, level: this.#level + 1, sharedOptions: this.#sharedOptions });
          this.#children.push(child);
          if (!child.#isEmptyGlyph) previousLayoutGlyph = child;
        }
      }


      // Check if this is a space group (all glyphs are space glyphs: TSP or QSP).
      // A group with zero glyphs has no space semantics: content-empty groups
      // stay visible to navigation and are never classified as space groups.
      this.#isSpaceGroup = (this.#blissObj.glyphs?.length > 0) && this.#blissObj.glyphs.every(g => {
        const code = g.parts?.[0]?.codeName;
        return code && isSpaceGlyph(code);
      });
      const isSpaceGroup = this.#isSpaceGroup;

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
        this.#advanceX = 0;
      } else {
        this.#advanceX = this.baseGroupWidth + this.#sharedOptions.charSpace;
      }

      this.getSvgContent = (x = 0, y = 0) => {
        const childContents = this.#children.map(child =>
          child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
        );

        const hasTaggedContent = childContents.some(c => c.startsWith('<'));
        const hasRawContent = childContents.some(c => !c.startsWith('<'));

        const content = hasTaggedContent && hasRawContent
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
          : childContents.join('');

        return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
      };

      if (this.#blissObj.errorCode && !this.#sharedOptions?.errorPlaceholder) {
        // Invisible failed word takes zero space (mirrors the L2 character path).
        this.#advanceX = 0;
        this.getSvgContent = () => '';
      }
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

        if (!this.#previousElement) {
          this.#relativeToParentX = this.#parentElement.#relativeToParentX + (this.#blissObj.x ?? 0);
        } else {
          // An empty-parts glyph must not re-space its neighbor: its serialized
          // form is absent (or a glyphless options token), so the reparse never
          // applies these identity-based adjustments. The RK/AK option blocks
          // below stay ungated — their serialized markers re-apply on reparse.
          if (this.isExternalGlyph && this.#previousElement.isExternalGlyph && !this.#isEmptyGlyph) {
            this.#previousElement.#advanceX = this.#previousElement.width + this.#externalGlyphSpacing;
          }

          if (!this.#isEmptyGlyph && !this.isExternalGlyph && !this.#previousElement.isExternalGlyph &&
              this.#previousElement.kerningRules && this.codeName) {
            const kerningAdjustment = this.#previousElement.kerningRules[this.codeName] ?? 0;
            if (kerningAdjustment !== 0) {
              this.#previousElement.#advanceX = this.#previousElement.width + this.#sharedOptions.charSpace + kerningAdjustment;
            }
          }

          if (typeof this.#blissObj.options?.relativeKerning === "number") {
            this.#previousElement.#advanceX += this.#blissObj.options.relativeKerning;
          } else if (typeof this.#blissObj.options?.absoluteKerning === "number") {
            this.#previousElement.#advanceX = this.#previousElement.width + this.#blissObj.options.absoluteKerning;
          }

          if (this.#blissObj.x === undefined) {
            this.#relativeToParentX = this.#previousElement.#relativeToParentX + this.#previousElement.#advanceX;
          } else {
            this.#relativeToParentX = this.#previousElement.#relativeToParentX + this.#previousElement.width + this.#blissObj.x;
          }
        }

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

          this.getSvgContent = (x = 0, y = 0) => {
            const childContents = this.#children.map(child =>
              child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
            );

            const hasTaggedContent = childContents.some(c => c.startsWith('<'));
            const hasRawContent = childContents.some(c => !c.startsWith('<'));

            const content = hasTaggedContent && hasRawContent
              ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
              : childContents.join('');

            return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
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
              source: this.#blissObj.error,
            });
          } else {
            const failedCode = this.#blissObj.codeName || this.#blissObj.error || 'unknown';
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

    // Empty-parts glyphs contribute no extent (they render nothing and
    // serialization omits them).
    const layoutChildren = this.#level === 1
      ? this.#children.filter(child => !child.#isEmptyGlyph)
      : this.#children;
    if (layoutChildren.length === 0) return 0;

    const minRelativeX = Math.min(...layoutChildren.map(child => child.#relativeToParentX));

    let maxRelativeXPlusWidth;
    if (this.#level === 1) {
      maxRelativeXPlusWidth = Math.max(...layoutChildren.map(child =>
        child.#relativeToParentX + child.rightExtendedGlyphWidth));
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
    const maxRelativeXPlusWidth = Math.max(...parts.map(part => part.#relativeToParentX + part.width));
    // When minRelativeX > 0, the left boundary is still the element's origin (0).
    // Only subtract negative offsets (e.g., indicator overhang).
    const rightExtendedGlyphWidth = maxRelativeXPlusWidth - Math.min(0, minRelativeX);

    return rightExtendedGlyphWidth;
  }

  get baseGlyphWidth() {
    if (this.#level !== 2) throw new Error('baseGlyphWidth can only be called on glyph elements (level 2)');

    const parts = this.#children;
    if (parts.length === 0) return 0;

    // Use cached classification (computed once in constructor)
    const { glyphParts } = this.#classifiedParts;

    // If no glyph parts (all indicators), use all parts for width
    const spacingParts = glyphParts.length > 0 ? glyphParts : parts;

    const minRelativeX = Math.min(...spacingParts.map(part => part.#relativeToParentX));
    const maxRelativeXPlusWidth = Math.max(...spacingParts.map(part => part.#relativeToParentX + part.width));
    // When minRelativeX > 0, the left boundary is still the element's origin (0).
    // Only subtract negative offsets (e.g., indicator overhang).
    const baseGlyphWidth = maxRelativeXPlusWidth - Math.min(0, minRelativeX);

    return baseGlyphWidth;
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
      const groups = this.#children;
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
      return 20;
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
    return this.#blissObj.kerningRules || {};
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
    // is resolved here at query time (R15 WS-4) via the shared exclusion scan, so
    // it stays correct after a structural mutation reorders the glyphs.
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

    const childBounds = this.#children.map(child =>
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
    
    this.getSvgContent = (x = 0, y = 0) => {
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
        ...dotPathOpts
      };
      const pathData = definition.getPath(
        this.#relativeToParentX + x,
        this.#relativeToParentY + y,
        pathOptions
      );

      return BlissElement.#wrapWithAnchorAndGroup(pathData, this.#blissObj.options);
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

    // Normalize: shift all child parts so the leftmost part starts at x=0.
    // Only for MULTI-child groups (length > 1): re-origining aligns several
    // parts against their shared leftmost, but a lone child has no relative
    // layout to align -- its x is pure displacement (a baked base offset on a
    // custom glyph), so zeroing it would drop the offset and make a use-site
    // coord REPLACE rather than ADD it (SIB-3). A single child therefore keeps
    // its x, matching the y axis (never re-origined) and the level-2 rule that
    // only negative offsets are normalized. Skip too for indicators the parent
    // #positionIndicatorGroup will place.
    // The stripped common min is NOT discarded: it moves onto the composite as
    // displacement, either sign (XC-2) -- the serializer's decompose uniformly
    // ADDS baked and use-site coords, so dropping the min here made the render
    // disagree with its own toString. Level 2's negatives-only normalization
    // then acts on the resulting final absolute position, which is exactly how
    // the decomposed form is treated.
    if (!isIndicatorAtLevel3 && this.#children.length > 1) {
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

    this.getSvgContent = (x = 0, y = 0) => {
      const childContents = this.#children.map(child =>
        child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
      );

      const hasTaggedContent = childContents.some(c => c.startsWith('<'));
      const hasRawContent = childContents.some(c => !c.startsWith('<'));

      const content = hasTaggedContent && hasRawContent
        ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"/>`).join('')
        : childContents.join('');

      return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
    };
  }
}

