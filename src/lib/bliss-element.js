/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";
import { BlissParser } from "./bliss-parser.js";

const DEFAULT_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 1.5;
const MIN_STROKE_WIDTH = 0.1;
const DEFAULT_CHAR_SPACING = 2;
const DEFAULT_EXTERNAL_GLYPH_SPACING = 0.8;
const DEFAULT_SENTENCE_SPACING = 8;
const DEFAULT_WORD_SPACING = 8
const DEFAULT_PUNCTUATION_SPACING = 4;

export class BlissElement {
  //#region Private Properties
  #level
  #blissObj
  #extraPathOptions
  #isCharacter
  #isAtomic
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
  //#codeString
  #codeName
  #charSpacing
  #externalGlyphSpacing
  #wordSpacing
  #sentenceSpacing
  #punctuationSpacing
  //#endregion
  #childStartOffset
  #parentElement;
  #previousElement;

  constructor(blissObj = {}, { parentElement = null, previousElement = null, level = 0 } = {}) {
    this.#blissObj = blissObj;
    this.#parentElement = parentElement;
    this.#previousElement = previousElement;
    this.#level = level;

    this.#codeName = "";
    this.#relativeToParentX = 0;
    this.#relativeToParentY = 0;
    this.#children = [];
    this.#charSpacing = DEFAULT_CHAR_SPACING;
    this.#externalGlyphSpacing = DEFAULT_EXTERNAL_GLYPH_SPACING - (this.kerningRules?.[previousElement?.glyph] ?? 0);
    this.#wordSpacing = DEFAULT_WORD_SPACING;
    this.#sentenceSpacing = DEFAULT_SENTENCE_SPACING;
    this.#punctuationSpacing = DEFAULT_PUNCTUATION_SPACING;
    this.#childStartOffset = 0;

    if (this.#level === 0) {
      // Root level
      if (!this.#blissObj.words) {
        this.#blissObj = { words: [this.#blissObj] };
      }

      for (const word of this.#blissObj.words) {
        const child = new BlissElement(word, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
        child.type = "word";
        this.#children.push(child);
      }
      
      try {
        // Checks if the first character of the first word of the entire thing is a character with indicator.
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

      this.getPath = (x = 0, y = 0) => {
        return this.#children.map(child => 
          child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)
        ).join('');
      };      
    } else if (this.#level === 1) {
      // Word level
      if (!this.#blissObj.characters) {
        this.#blissObj = { characters: [this.#blissObj] };
      }

      for (const character of this.#blissObj.characters) {
        const child = new BlissElement(character, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
        child.type = "character";
        this.#children.push(child);
      }

      if (this.#previousElement) {
        if (this.#blissObj.x === undefined) {
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

      this.#advanceX = this.baseWordWidth + this.#wordSpacing;

      this.getPath = (x = 0, y = 0) => this.#children.map(child => 
        child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)
      ).join('');
    } else {
      if (this.#level === 2) {
        // Character level
        if (!this.#blissObj.parts) {
          this.#blissObj = { parts: [this.#blissObj] };
        }

        for (const part of this.#blissObj.parts) {
          const child = new BlissElement(part, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
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
        this.#advanceX = this.baseCharacterWidth + this.#charSpacing;

        this.getPath = (x = 0, y = 0) => this.#children.map(child => 
          child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)
        ).join('');
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
        child.#relativeToParentX + child.rightExtendedCharacterWidth));
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

  get rightExtendedCharacterWidth() {
    if (this.#level !== 2) throw new Error('rightExtendedCharacterWidth can only be called on character elements (level 2)');

    const character = this;
    const parts = character.#children;

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
    const rightExtendedCharacterWidth = maxRelativeXPlusWidth - minRelativeX;
  
    return rightExtendedCharacterWidth;
  }

  get baseCharacterWidth() {
    if (this.#level !== 2) throw new Error('baseCharacterWidth can only be called on character elements (level 2)');

    const character = this;
    const parts = character.#children;

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
    const baseCharacterWidth = maxRelativeXPlusWidth - minRelativeX;

    return baseCharacterWidth;
  }

  get baseWordWidth() {
    if (this.#level !== 1) throw new Error('baseWordWidth can only be called on word elements (level 1)');

    const word = this;
    const characters = word.#children;
    const firstCharacter = characters[0];
    const lastCharacter = characters[characters.length - 1];
    const lastCharacterBaseWidth = lastCharacter.baseCharacterWidth;
    const baseWordWidth = lastCharacter.#relativeToParentX + lastCharacterBaseWidth - firstCharacter.#relativeToParentX;

    return baseWordWidth;
  }

  get baseWidth() {    
    if (this.#level === 0) {
      const words = this.#children;
      const firstWord = words[0];
      const lastWord = words[words.length - 1];
      const lastWordBaseWidth = lastWord.baseWordWidth;
      const baseWidth = lastWord.#relativeToParentX + lastWordBaseWidth - firstWord.#relativeToParentX;
      return baseWidth;
    }

    if (this.#level === 1) return this.baseWordWidth;
    if (this.#level === 2) return this.baseCharacterWidth;

    return this.width;
  }

  get height() {
    if (this.#height !== undefined) {
      return this.#height;
    }
    if (this.#isCharacter) {
      return 20;
    }
    if (this.#children) {
      return Math.max(...this.#children.map(child => this.y + child.y + child.height));
    }
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

  get isAtomic() {
    return this.#isAtomic;
  }

  get isExternalGlyph() {
    return this.#blissObj.isExternalGlyph;
  }

  get includeGrid() {
    return this.optio
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

    if (this.#codeName && this.#isAtomic) {
        const element = {};
        element.code = this.codeName;
        element.width = this.width;
        element.x = this.#relativeToParentX;//this.x;
        element.y = this.#relativeToParentY;//this.y;
        //element.level = this.#level;  // include the level in the returned object
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

    if (this.#codeName && this.#isAtomic) {
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
    this.#isAtomic = !!definition.isAtomic;                     //default: false
    this.#leafWidth = definition.width;
    this.#leafHeight = definition.height;
    this.#leafX = definition.x;
    this.#leafY = definition.y;
    
    this.getPath = (x = 0, y = 0) => definition.getPath(
      this.#relativeToParentX + x, 
      this.#relativeToParentY + y, 
      this.#extraPathOptions
    );
  }

  #handleCompositeElement(parts) {
    this.#children = [];

    for (const part of parts) {
      const child = new BlissElement(part, {
        parentElement: this,
        previousElement: this.#children[this.#children.length - 1],
        level: this.#level + 1
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

    this.getPath = (x = 0, y = 0) => this.#children.map(child =>
      child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)
    ).join('');
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