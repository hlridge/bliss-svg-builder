/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, isSpaceGlyph } from "./bliss-element-definitions.js";

export class BlissElement {
  //#region Private Properties
  #level
  #blissObj
  #extraPathOptions
  #isCharacter
  #isShape
  #isBlissGlyph
  #width
  #height
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
  #externalGlyphSpacing
  //#endregion
  #childStartOffset
  #parentElement;
  #previousElement;

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

    // For content that's already tagged (starts with '<'), use as-is
    // For raw path data, wrap in <path>
    const needsPathWrapper = !content.startsWith('<');

    if (hasHref) {
      const wrappedContent = needsPathWrapper ? `<path d="${content}"></path>` : content;
      if (groupAttrs) {
        return `<a ${anchorAttrs} style="cursor: pointer;"><g ${groupAttrs}>${wrappedContent}</g></a>`;
      }
      return `<a ${anchorAttrs} style="cursor: pointer;">${wrappedContent}</a>`;
    }

    if (groupAttrs) {
      const wrappedContent = needsPathWrapper ? `<path d="${content}"></path>` : content;
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

    // Element-level options that should NOT be rendered as SVG attributes.
    // These are handled by element positioning/layout logic, not SVG attributes.
    // Multi-level options (strokeWidth, color, fill, opacity, etc.) are NOT listed - they should render as attributes.
    const internalOptions = new Set([
      'x',
      'y',
      'relativeKerning',
      'absoluteKerning'
    ]);

    const attrMap = {
      'color': 'stroke'
    };

    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const anchorAttrs = [];
    const groupAttrs = [];
    let hasHref = false;
    let hasPointerEvents = false;

    for (const [key, value] of Object.entries(options)) {
      if (internalOptions.has(key)) continue;

      const escapedValue = escapeHtml(value);

      if (anchorAttrNames.has(key)) {
        if (key === 'href') hasHref = true;
        anchorAttrs.push(`${key}="${escapedValue}"`);
      } else {
        const attrName = attrMap[key] || key;
        if (key === 'pointer-events') hasPointerEvents = true;
        groupAttrs.push(`${attrName}="${escapedValue}"`);
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

  #sharedOptions;

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

  constructor(blissObj = {}, { parentElement = null, previousElement = null, level = 0, sharedOptions = null } = {}) {
    this.#blissObj = blissObj;
    this.#parentElement = parentElement;
    this.#previousElement = previousElement;
    this.#level = level;
    this.#sharedOptions = sharedOptions || { charSpace: 2, wordSpace: 8, punctuationSpace: 4, externalGlyphSpace: 0.8 };

    this.#codeName = "";
    this.#relativeToParentX = 0;
    this.#relativeToParentY = 0;
    this.#children = [];
    this.#externalGlyphSpacing = this.#sharedOptions.externalGlyphSpace - (this.kerningRules?.[previousElement?.glyph] ?? 0);
    this.#childStartOffset = 0;

    if (this.#level === 0) {
      // Root level (sequence)
      if (!this.#blissObj.groups) {
        this.#blissObj = { groups: [this.#blissObj] };
      }

      for (const group of this.#blissObj.groups) {
        const child = new BlissElement(group, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1, sharedOptions: this.#sharedOptions });
        child.type = "group";
        this.#children.push(child);
      }
      
      try {
        // Checks if the first glyph of the first group of the entire sequence is a glyph with indicator.
        // TODO: add option for if overhang is accepted?
        if (level === 0 &&
            this.#children && 
            this.#children[0] && 
            this.#children[0].#children && 
            this.#children[0].#children[0] && 
            this.#children[0].#children[0].#children) {
          const parentElement = this.#children[0].#children[0];
          const nestedChildren = parentElement.#children;
          
          if (nestedChildren.length === 2) {
            const firstChild = nestedChildren[0];
            const secondChild = nestedChildren[1];
            
            if (!parentElement.isIndicator && !firstChild.isIndicator && secondChild.isIndicator) {
              if (secondChild.#blissObj.x !== undefined) {
                this.#childStartOffset = -secondChild.#blissObj.x || 0;
              } else {
                this.#childStartOffset = (secondChild.width / 2 + (secondChild.anchorOffset.x || 0)) - 
                  (firstChild.width / 2 + (firstChild.anchorOffset.x || 0));
              }
              if (this.#childStartOffset < 0) {
                this.#childStartOffset = 0;
              }
            }
          }
        }  
      } catch (e) {
        console.warn("Error calculating indicator position: ", e);
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
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"></path>`).join('')
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
        child.type = "glyph";
        this.#children.push(child);
      }

      // Check if this is a space group (all glyphs are space glyphs: TSP or QSP)
      const isSpaceGroup = this.#blissObj.glyphs?.every(g => {
        const code = g.parts?.[0]?.code;
        return code && isSpaceGlyph(code);
      }) ?? false;

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
          const code = g.parts?.[0]?.code;
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
          ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"></path>`).join('')
          : childContents.join('');

        return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
      };
    } else {
      if (this.#level === 2) {
        // Character level
        this.#codeName = this.#blissObj.glyphCode || this.#blissObj.code || "";
        this.#isBlissGlyph = !!this.#blissObj.isBlissGlyph;

        if (!this.#blissObj.parts) {
          this.#blissObj = { parts: [this.#blissObj] };
        }

        for (const part of this.#blissObj.parts) {
          const child = new BlissElement(part, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1, sharedOptions: this.#sharedOptions });
          child.type = "characterPart";
          this.#children.push(child);
        }

        // Normalize: shift all parts so the leftmost part starts at x=0
        // Skip normalization if this character contains a combining indicator
        const hasCombiningIndicator = this.#children.length === 2 &&
          !this.#children[0].isIndicator &&
          this.#children[1].isIndicator;

        if (!hasCombiningIndicator && this.#children.length > 0) {
          const minX = Math.min(...this.#children.map(child => child.#relativeToParentX));
          if (minX !== 0) {
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

        // Dynamic advanceX calculation for space glyphs (TSP, QSP)
        const code = this.#blissObj.parts?.[0]?.code;
        if (code && isSpaceGlyph(code)) {
          // Space glyphs have dynamic width based on word-space and char-space options
          if (code === 'TSP') {
            this.#advanceX = this.#sharedOptions.wordSpace - this.#sharedOptions.charSpace;
          } else if (code === 'QSP') {
            this.#advanceX = this.#sharedOptions.wordSpace / 2 - this.#sharedOptions.charSpace;
          }
        } else {
          // Regular glyphs use baseWidth + charSpace
          this.#advanceX = this.baseGlyphWidth + this.#sharedOptions.charSpace;
        }

        this.getSvgContent = (x = 0, y = 0) => {
          const childContents = this.#children.map(child =>
            child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
          );

          const hasTaggedContent = childContents.some(c => c.startsWith('<'));
          const hasRawContent = childContents.some(c => !c.startsWith('<'));

          const content = hasTaggedContent && hasRawContent
            ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"></path>`).join('')
            : childContents.join('');

          return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
        };
      } else {
        // Part level (level >= 3)
        const elementDefinition = blissElementDefinitions[this.#blissObj.code];
        const isPredefinedElement = !!elementDefinition && !!elementDefinition.getPath;
        const isCompositeElement = !!this.#blissObj.parts && this.#blissObj.parts.length > 0;
  
        const isValidElement = isPredefinedElement || isCompositeElement;
        if (!isValidElement) {
          throw new Error(
            `Unable to create Bliss element: "${this.#blissObj.code}" either lacks a ` +
            `rendering function (getPath()) or could not be parsed into component parts. ` + 
            `Check code or composition syntax.`
          );
        }

        this.#relativeToParentX = this.#blissObj.x ?? 0;
        this.#relativeToParentY = this.#blissObj.y ?? 0;

        if (isPredefinedElement) {
          this.#handlePredefinedElement(elementDefinition);

          // For predefined (leaf) elements with explicit coordinates, use them directly
          if (this.#blissObj.y !== undefined) {
            this.#relativeToParentY = this.#blissObj.y;
          }
        } else if (isCompositeElement) {
          this.#handleCompositeElement(this.#blissObj.parts);
        }
      }
    }
  }

  //get codeString() {
  //  return this.#codeString;
 // }

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
      width = maxRelativeXPlusWidth - minRelativeX;
    }

    return width;
  }

  get rightExtendedGlyphWidth() {
    if (this.#level !== 2) throw new Error('rightExtendedGlyphWidth can only be called on glyph elements (level 2)');

    const glyph = this;
    const parts = glyph.#children;

    if (parts.length === 0) return 0;
    if (parts.length === 1) return parts[0].width;

    const allPartsAreIndicators = parts.every(part => part.isIndicator);
    const lastPartIsIndicator = parts[parts.length - 1].isIndicator;

    let spacingParts = parts;
    if (lastPartIsIndicator && !allPartsAreIndicators) {
      spacingParts = parts.slice(0, -1);
    }

    const minRelativeX = Math.min(...spacingParts.map(part => part.#relativeToParentX));
    const maxRelativeXPlusWidth = Math.max(...parts.map(part => part.#relativeToParentX + part.width));
    const rightExtendedGlyphWidth = maxRelativeXPlusWidth - minRelativeX;

    return rightExtendedGlyphWidth;
  }

  get baseGlyphWidth() {
    if (this.#level !== 2) throw new Error('baseGlyphWidth can only be called on glyph elements (level 2)');

    const glyph = this;
    const parts = glyph.#children;

    if (parts.length === 0) return 0;
    if (parts.length === 1) {
      return parts[0].width;
    }

    const allPartsAreIndicators = parts.every(part => part.isIndicator);
    const lastPartIsIndicator = parts[parts.length - 1].isIndicator;

    let spacingParts = parts;
    if (lastPartIsIndicator && !allPartsAreIndicators) {
      spacingParts = parts.slice(0, -1);
    }

    const minRelativeX = Math.min(...spacingParts.map(part => part.#relativeToParentX));
    const maxRelativeXPlusWidth = Math.max(...spacingParts.map(part => part.#relativeToParentX + part.width));
    const baseGlyphWidth = maxRelativeXPlusWidth - minRelativeX;

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
    if (this.#height !== undefined) {
      return this.#height;
    }
    if (this.#isCharacter) {
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

  get glyph() {
    return this.#blissObj.glyph || "";
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
    return this.#blissObj.isExternalGlyph;
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

  toStringOldNotWorking() {
    //return this.toJSON().elements.map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`).join(';')
    const obj = this.toJSON();
    if (obj.atomicElements) {
      return obj.atomicElements.map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`).join(';')
    } else {
      //return obj.elements.map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`).join('/')
      return (obj.elements || [])
      .filter(e => e !== undefined && e !== null)
      .map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`)
      .join('/');
    }
  }

  toStringOld2() {
    const obj = this.toJSON();

    const joinWith = this.#level === 0 ? "//" : this.#level === 1 ? "/" : ";";
    
    return (obj.elements || [])
    .filter(e => e !== undefined && e !== null)
    .map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`)
    .join(joinWith);
  }
  
  toStringOld3() {
    const obj = this.toJSON();

    let joinWith = "";
    switch (this.#level) {
        case 0: joinWith = "//"; break;  // Sentence level
        case 1: joinWith = "/"; break;   // Word level
        case 2:                         // Character level and beyond
        default: joinWith = ";"; break;
    }

    return (obj.elements || [])
        .filter(e => e !== undefined && e !== null)
        .map(({ code, x = 0, y = 0 }) => (x === 0 && y === 0) ? code : `${code}:${x},${y}`)
        .join(joinWith);
  }

  toStringDDD() {
    const obj = this.toJSON();
    return (obj.elements || [])
        .filter(e => e !== undefined && e !== null)
        .map(({ code, x = 0, y = 0, level }) => {  // use the level of the child element
            let joinWith = "";
            switch (level) {
                case 2: joinWith = "//"; break;  // Sentence level
                case 3: joinWith = "/"; break;   // Word level
                case 4:                          // Character level and beyond
                default: joinWith = ";"; break;
            }
            return (x === 0 && y === 0) ? code : `${code}:${x},${y}${joinWith}`;  // use joinWith here
        })
        .join('');
  }
  
  toStringj() {
    const obj = this.toJSON();

  }
  toStringO() {
    const obj = this.toJSON();

    const processElement = ({ code, x = 0, y = 0, level, elements = [] }) => {
        let joinWith = "";
        switch (level) {
            case 2: joinWith = "//"; break;  // Sentence level
            case 3: joinWith = "/"; break;   // Word level
            case 4:                          // Character level and beyond
            default: joinWith = ";"; break;
        }

        const elementString = (x === 0 && y === 0) ? code : `${code}:${x},${y}`;
        const childStrings = elements.map(processElement).join('');

        return `${elementString}${joinWith}${childStrings}`;
    };

    return (obj.elements || []).map(processElement).join('');
  }

  toString() {
    const obj = this.toJSON();
    //const obj = {"elements":[{"elements":[{"elements":[{"code":"Xa","width":2.999438202247191,"x":null,"y":0,"level":3},{"code":"Xa","width":2.999438202247191,"x":null,"y":0,"level":3}]},{"elements":[{"code":"Xb","width":2.999438202247191,"x":null,"y":0,"level":3}]},{"elements":[{"code":"Xc","width":2.676404494382022,"x":null,"y":0,"level":3}]}]}]};

    function traverse(obj, level = 1) {
      if (!obj.elements) {
          let str =  obj.code;
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

    // Bliss glyphs (B-codes) decompose into their component shapes
    // Everything else (shapes, external glyphs, dots, etc.) are leaves
    if (this.#codeName && !this.#isBlissGlyph) {
        const element = {};
        element.code = this.codeName;
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

  toJSONOld4() {
    const obj = {};
    
    if (this.#codeName) {
        const element = {};
        element.code = this.codeName;
        element.width = this.width;
        element.x = this.x;
        element.y = this.y;
        element.level = this.#level;
        obj.elements = [];
        obj.elements.push(element);
    } else if (this.#children) {
        const elements = this.#children.map(child => child.toJSON().elements);
        obj.elements = [];
        obj.elements = obj.elements.concat(...elements);
    }
    
    return obj;
  }

  toJSONOldNotWorking() {
    const obj = {};

    if (this.#codeName && this.#isShape) {
      const element = {};
      element.code = this.codeName;
      element.width = this.width;
      element.x = this.x;
      element.y = this.y;
      obj.atomicElements = [];
      obj.atomicElements.push(element);
    } else if (this.#children) {
      const elements = this.#children.map(child => child.toJSON().atomicElements); //doesn't work
      obj.elements = [];
      obj.elements = obj.elements.concat(...elements);
    }

    return obj;
  }

  #handlePredefinedElement(definition) {
    if (typeof definition?.getPath !== 'function') throw new Error('An element is only predefined if has a proper getPath function.');

    this.#codeName = this.#blissObj.code;                       //default: empty string
    this.#extraPathOptions = definition.extraPathOptions || {}; //default: empty object
    this.#isCharacter = !!definition.isCharacter;               //default: false
    this.#isShape = !!definition.isShape;                      //default: false
    this.#leafWidth = definition.width;
    this.#leafHeight = definition.height;
    this.#leafX = definition.x;
    this.#leafY = definition.y;
    
    this.getSvgContent = (x = 0, y = 0) => {
      // Build path options with inheritance: extraPathOptions < inherited < element-level
      // Use #getInheritedOption for color which already handles the inheritance chain
      const inheritedColor = this.#getInheritedOption('color');
      const pathOptions = {
        ...this.#extraPathOptions,
        ...(inheritedColor !== undefined && { color: inheritedColor })
      };
      const pathData = definition.getPath(
        this.#relativeToParentX + x,
        this.#relativeToParentY + y,
        pathOptions
      );

      // If the definition returns SVG tags (like DOT/COMMA with extraPathOptions),
      // return as-is without wrapping
      if (pathData.includes('<')) {
        return pathData;
      }

      return BlissElement.#wrapWithAnchorAndGroup(pathData, this.#blissObj.options);
    };
  }

  #handleCompositeElement(parts) {
    this.#children = [];

    for (const part of parts) {
      const child = new BlissElement(part, {
        parentElement: this,
        previousElement: this.#children[this.#children.length - 1],
        level: this.#level + 1,
        sharedOptions: this.#sharedOptions
      });
      this.#children.push(child);
    }

    const isThisIndicator = this.isIndicator;
    const isParentIndicator = this.#parentElement.isIndicator;
    const isPreviousIndicator = this.#previousElement?.isIndicator;
    const isPreviousBaseCharacter = this.#previousElement && !isPreviousIndicator;
    const parentHasTwoParts = this.#parentElement && this.#parentElement.#blissObj.parts?.length === 2;
    const isThisCombiningIndicator = this.#level === 3 && isThisIndicator && !isParentIndicator && isPreviousBaseCharacter && parentHasTwoParts;

    // Normalize: shift all child parts so the leftmost part starts at x=0
    // Skip normalization for combining indicators (they have their own positioning logic)
    if (!isThisCombiningIndicator && this.#children.length > 0) {
      const minX = Math.min(...this.#children.map(child => child.#relativeToParentX));
      if (minX !== 0) {
        for (const child of this.#children) {
          child.#relativeToParentX -= minX;
        }
      }
    }

    if (isThisCombiningIndicator) {
      if (this.#blissObj.x !== undefined) {
        this.#relativeToParentX = this.#blissObj.x;
      } else {
        const baseCharacterCenterX = this.#previousElement.width / 2;
        const baseCharacterAnchorX = baseCharacterCenterX + (this.#previousElement.anchorOffset.x || 0);
        const indicatorWidth = this.#blissObj.width ?? 2;
        const indicatorHalfWidth  = indicatorWidth / 2;
        const indicatorAnchorOffsetX = this.#blissObj.anchorOffsetX || 0;
        this.#relativeToParentX = baseCharacterAnchorX - indicatorHalfWidth - indicatorAnchorOffsetX;
      }

      if (this.#blissObj.y !== undefined) {
        // Explicit y coordinates are relative to the default position (0 for element, 4 for drawing)
        // So we just use the value directly as the element's relativeToParentY
        this.#relativeToParentY = this.#blissObj.y;
      } else {
        // Implicit positioning: calculate based on base character's anchor point
        const defaultIndicatorRelativeToParentY = 4;
        const baseCharacterDefaultAnchorY = 4;
        const baseCharacterAnchorY = baseCharacterDefaultAnchorY + (this.#previousElement.anchorOffset.y || 0);
        const indicatorAnchorOffsetY = this.#blissObj.anchorOffsetY || 0; //rare
        this.#relativeToParentY = baseCharacterAnchorY - indicatorAnchorOffsetY - defaultIndicatorRelativeToParentY; //TODO: test continuous form.
      }
    }

    this.#anchorOffsetX = this.#blissObj.anchorOffsetX || 0;
    this.#anchorOffsetY = this.#blissObj.anchorOffsetY || 0;

    this.getSvgContent = (x = 0, y = 0) => {
      const childContents = this.#children.map(child =>
        child.getSvgContent(this.#relativeToParentX + x, this.#relativeToParentY + y)
      );

      const hasTaggedContent = childContents.some(c => c.startsWith('<'));
      const hasRawContent = childContents.some(c => !c.startsWith('<'));

      const content = hasTaggedContent && hasRawContent
        ? childContents.map(c => c.startsWith('<') ? c : `<path d="${c}"></path>`).join('')
        : childContents.join('');

      return BlissElement.#wrapWithAnchorAndGroup(content, this.#blissObj.options);
    };
  }
}

export class BlissCharacter extends BlissElement {
  calculatePosition() {
    // logic for calculating position of Character
  }
}

export class BlissWord extends BlissElement {
  calculatePosition() {
    // logic for calculating position of Word
  }
}

export class BlissShape extends BlissElement {
  calculatePosition() {
    // logic for calculating position of Shape
  }
}