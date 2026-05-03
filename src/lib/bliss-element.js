/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, isSpaceGlyph } from "./bliss-element-definitions.js";
import { INTERNAL_OPTIONS, isSafeAttributeName, generateKey, MAX_RECURSION_DEPTH } from "./bliss-constants.js";
import { createTextFallbackGlyph } from "./bliss-shape-creators.js";

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
  //#endregion
  #childStartOffset
  #parentElement;
  #previousElement;
  #classifiedParts; // Cached result of #classifyParts (level 2 only)

  /**
   * Wraps content with <a> and/or <g> tags based on options.
   * Ensures consistent wrapping behavior across all element levels.
   *
   * @param {string} content - The content to wrap (raw path data or HTML string)
   * @param {Object} options - The options containing anchor and group attributes
   * @returns {string} The wrapped content
   */
  static #wrapWithAnchorAndGroup(content, options) {
    const { anchorAttrs, groupAttrs, hasHref } = BlissElement.#separateAnchorAndGroupOptions(options);

    // Content that starts with '<' is already wrapped in proper tags
    // Raw path data or fragments need wrapping
    const needsPathWrapper = !content.startsWith('<');

    if (hasHref) {
      const wrappedContent = needsPathWrapper ? `<path d="${content}"/>` : content;
      if (groupAttrs) {
        return `<a ${anchorAttrs} style="cursor: pointer;"><g ${groupAttrs}>${wrappedContent}</g></a>`;
      }
      return `<a ${anchorAttrs} style="cursor: pointer;">${wrappedContent}</a>`;
    }

    if (groupAttrs) {
      const wrappedContent = needsPathWrapper ? `<path d="${content}"/>` : content;
      return `<g ${groupAttrs}>${wrappedContent}</g>`;
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
    const groupAttrs = [];
    let hasHref = false;
    let hasPointerEvents = false;

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
        if (key === 'pointer-events') hasPointerEvents = true;
        groupAttrs.push(`${attrName}="${value}"`);
      }
    }

    if (hasHref && !hasPointerEvents) {
      groupAttrs.push('pointer-events="bounding-box"');
    }

    return {
      anchorAttrs: anchorAttrs.join(' '),
      groupAttrs: groupAttrs.join(' '),
      hasHref
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

    const firstCharacter = firstGroup.#children?.[0];
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
   * Positions indicator parts as a centered group above the glyph.
   * First indicator is positioned so the entire group is centered over the glyph anchor.
   * Subsequent indicators are positioned relative to the previous indicator.
   *
   * @param {BlissElement[]} glyphParts - The non-indicator parts (the base glyph)
   * @param {BlissElement[]} indicatorParts - The indicator parts to position
   */
  #positionIndicatorGroup(glyphParts, indicatorParts) {
    if (indicatorParts.length === 0) return;

    // Calculate base glyph metrics
    // For glyph width, we need the combined width of all glyph parts
    const glyphMinX = glyphParts.length > 0
      ? Math.min(...glyphParts.map(p => p.#relativeToParentX))
      : 0;
    const glyphMaxX = glyphParts.length > 0
      ? Math.max(...glyphParts.map(p => p.#relativeToParentX + p.width))
      : 0;
    const glyphWidth = glyphMaxX - glyphMinX;
    const glyphCenterX = glyphMinX + glyphWidth / 2;

    // Get anchor offset from first glyph part (or default to 0)
    const baseAnchorOffsetX = glyphParts[0]?.anchorOffset?.x || 0;
    const baseAnchorOffsetY = glyphParts[0]?.anchorOffset?.y || 0;
    const anchorX = glyphCenterX + baseAnchorOffsetX;

    // Calculate total indicator group width (including gaps)
    const INDICATOR_GAP = 1;
    const totalIndicatorWidth = indicatorParts.reduce((sum, ind) => sum + ind.width, 0)
      + (indicatorParts.length - 1) * INDICATOR_GAP;

    // Calculate shift to center ANCHORS (not visual edges) over glyph anchor.
    //
    // Each indicator has an anchor point at: position + width/2 + anchorOffsetX
    // We want the midpoint of first and last anchors to align with glyphAnchorX.
    //
    // SINGLE INDICATOR:
    //   anchor = x + width/2 + anchorOffsetX
    //   We want: anchor = glyphAnchorX
    //   So: x = glyphAnchorX - width/2 - anchorOffsetX
    //   Without shift: x = glyphAnchorX - width/2
    //   Therefore: shift = -anchorOffsetX
    //
    // MULTIPLE INDICATORS (derivation for first/last anchor midpoint):
    //   Let P = starting position (first indicator's x)
    //   First anchor:  P + w1/2 + a1
    //   Last anchor:   P + totalWidth - w2/2 + a2  (where totalWidth includes gaps)
    //   Midpoint = (firstAnchor + lastAnchor) / 2
    //            = P + (w1/2 + a1 + totalWidth - w2/2 + a2) / 2
    //   We want midpoint = glyphAnchorX, so:
    //   P = glyphAnchorX - (w1/2 + a1 + totalWidth - w2/2 + a2) / 2
    //     = glyphAnchorX - totalWidth/2 - (w1 - w2)/4 - (a1 + a2)/2
    //   Without shift: P = glyphAnchorX - totalWidth/2
    //   Therefore: shift = -(w1 - w2)/4 - (a1 + a2)/2
    //                    = (w2 - w1)/4 - (a1 + a2)/2
    //
    const firstAnchorOffsetX = indicatorParts[0].anchorOffset?.x || 0;
    const lastAnchorOffsetX = indicatorParts[indicatorParts.length - 1].anchorOffset?.x || 0;
    const anchorShift = indicatorParts.length > 1
      ? (indicatorParts[indicatorParts.length - 1].width - indicatorParts[0].width) / 4
        - firstAnchorOffsetX / 2 - lastAnchorOffsetX / 2
      : -firstAnchorOffsetX;

    // Position indicators
    let currentX = anchorX - totalIndicatorWidth / 2 + anchorShift;

    for (const indicator of indicatorParts) {
      // X positioning: only override if no explicit x was provided
      // Position by left edge to maintain visual 1-unit gaps between indicators
      // (indicator's anchorOffsetX is NOT used here - it's for single indicator centering only)
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
          code: 'DUPLICATE_KEY',
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

      for (const glyph of this.#blissObj.glyphs) {
        const child = new BlissElement(glyph, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1, sharedOptions: this.#sharedOptions });
        this.#children.push(child);
      }


      // Check if this is a space group (all glyphs are space glyphs: TSP or QSP)
      this.#isSpaceGroup = this.#blissObj.glyphs?.every(g => {
        const code = g.parts?.[0]?.codeName;
        return code && isSpaceGlyph(code);
      }) ?? false;
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

        // Position indicators as a centered group above the glyph
        // Only apply when:
        // - We have BOTH glyph parts AND indicator parts
        // - The pattern is valid (no non-indicators after the first indicator)
        // Invalid patterns (e.g., B291;B99;H) are treated as default combination, not special indicator positioning
        // All-indicator composites (e.g., B98) keep their internal positioning
        const hasGlyphWithIndicators = glyphParts.length > 0 && indicatorParts.length > 0 && isValidPattern;
        if (hasGlyphWithIndicators) {
          this.#positionIndicatorGroup(glyphParts, indicatorParts);
        }

        // Normalize: shift parts right only if any child extends left of origin (negative x)
        // Skip normalization for characters with indicators above glyph (they have their own positioning)
        if (!hasGlyphWithIndicators && this.#children.length > 0) {
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
          if (this.isExternalGlyph && this.#previousElement.isExternalGlyph) {
            this.#previousElement.#advanceX = this.#previousElement.width + this.#externalGlyphSpacing;
          }

          if (!this.isExternalGlyph && !this.#previousElement.isExternalGlyph &&
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

        if (!isPredefinedElement && !isCompositeElement) {
          // When constructed directly (no builder), throw to preserve existing behaviour
          if (!this.#sharedOptions?.warnings) {
            const failedCode = this.#blissObj.codeName || this.#blissObj.error || 'unknown';
            throw new Error(`Unable to create Bliss element: ${failedCode}`);
          }

          if (this.#blissObj.errorCode === 'WORD_AS_PART') {
            this.#sharedOptions.warnings.push({
              code: 'WORD_AS_PART',
              message: this.#blissObj.error,
              source: this.#blissObj.codeName || 'unknown',
            });
          } else {
            const failedCode = this.#blissObj.codeName || 'unknown';
            this.#sharedOptions.warnings.push({
              code: 'UNKNOWN_CODE',
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

    const minRelativeX = Math.min(...this.#children.map(child => child.#relativeToParentX));

    let maxRelativeXPlusWidth;
    if (this.#level === 1) {
      maxRelativeXPlusWidth = Math.max(...this.#children.map(child =>
        child.#relativeToParentX + child.rightExtendedGlyphWidth));
    } else {
      maxRelativeXPlusWidth = Math.max(...this.#children.map(child =>
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
    const glyphs = group.#children;
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
    // The parser only marks head glyphs in non-default cases (optimization for toString).
    // The public API should always have exactly one isHeadGlyph per word.
    if (this.#level === 1 && childSnapshots.length > 0) {
      const hasExplicitHead = childSnapshots.some(c => c.isHeadGlyph);
      if (!hasExplicitHead) {
        // Default: first glyph is the head glyph
        childSnapshots[0] = Object.freeze({ ...childSnapshots[0], isHeadGlyph: true });
      }
    }

    const children = Object.freeze(childSnapshots);

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

      const pathOptions = {
        ...this.#extraPathOptions,
        ...(inheritedColor !== undefined && { color: inheritedColor }),
        ...(inheritedStrokeWidth !== undefined && { baseStrokeWidth: inheritedStrokeWidth }),
        ...(inheritedDotExtraWidth !== undefined && { extraDotWidth: inheritedDotExtraWidth })
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

    // Check if this is an indicator at level 3 that will be positioned by #positionIndicatorGroup
    // If so, skip normalization here - let level 2 handle the positioning
    const isIndicatorAtLevel3 = this.#level === 3 && this.isIndicator;

    // Normalize: shift all child parts so the leftmost part starts at x=0
    // Skip normalization for indicators that will be positioned by the parent's #positionIndicatorGroup
    if (!isIndicatorAtLevel3 && this.#children.length > 0) {
      const minX = Math.min(...this.#children.map(child => child.#relativeToParentX));
      if (minX !== 0) {
        for (const child of this.#children) {
          child.#relativeToParentX -= minX;
        }
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

