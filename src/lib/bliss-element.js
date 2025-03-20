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
const DEFAULT_FULL_SPACE = 8;
const DEFAULT_HALF_SPACE = 4;
const DEFAULT_QUARTER_SPACE = 2;
const DEFAULT_SENTENCE_SPACING = DEFAULT_CHAR_SPACING + DEFAULT_FULL_SPACE;
const DEFAULT_WORD_SPACING = DEFAULT_CHAR_SPACING + DEFAULT_HALF_SPACE;
const DEFAULT_PUNCTUATION_SPACING = DEFAULT_CHAR_SPACING + DEFAULT_QUARTER_SPACE;

export class BlissElement {
  //#region Private Properties
  #level
  #extraPathOptions
  #isCharacter
  #isAtomic
  #isIndicator
  #isExternalGlyph
  #width
  #height
  #anchorOffsetX
  #anchorOffsetY
  #children
  #relativeToRootX
  #relativeToParentX
  #relativeToParentY
  //#codeString
  #codeName
  #charSpacing
  #wordSpacing
  #sentenceSpacing
  #punctuationSpacing
  //#endregion
  
  constructor(blissObj, { parentElement = null, previousElement = null, level = 0 } = {}) {
    this.#level = level;

    //this.#codeString = blissObj;
    this.#codeName = "";
    //this.#relativeToRootX = relativeToRootX;

    //måste ta reda på this.#relativeToParentX utifrån parts. för infon saknas på charactern
    this.#relativeToParentX = 0;
    this.#relativeToParentY = 0;
    this.#children = [];
    this.#charSpacing = DEFAULT_CHAR_SPACING;
    this.#wordSpacing = DEFAULT_WORD_SPACING;
    this.#sentenceSpacing = DEFAULT_SENTENCE_SPACING;
    this.#punctuationSpacing = DEFAULT_PUNCTUATION_SPACING;

    //this.#relativeToRootX = (level === 2) ? parentElement.x : previousElement ? previousElement.x + previousElement.width + 2 : parentElement ? parentElement.x : 0; //space would be added differently depending on level and type etc
    this.#relativeToRootX = (level === 2) ? parentElement.x : previousElement ? previousElement.x + previousElement.width + 2 : parentElement ? parentElement.x : 0; //space would be added differently depending on level and type etc
    //this.#relativeToRootX = (previousElement ? previousElement.x : parentElement ? parentElement.x : 0) + (blissObj ? blissObj.x || 0 : 0);
    this.parentElement = parentElement;
    this.previousElement = previousElement;
    this.#isIndicator = !!blissObj.isIndicator;

    if (blissObj.words) {
      //let relativeToRootX = this.#relativeToRootX + this.#relativeToParentX;
      for (const word of blissObj.words) {
        //const child = new BlissElement(word, relativeToRootX);
        const child = new BlissElement(word, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
        //relativeToRootX = this.#relativeToParentX + child.width + this.#wordSpacing;
        //child.type = "word";
        this.#children.push(child);
      }
      this.getPath = (x = 0, y = 0) => {
        try {
          if (this.#children && 
              this.#children[0] && 
              this.#children[0].#children && 
              this.#children[0].#children[0] && 
              this.#children[0].#children[0].#children) {
            
            const parentElement = this.#children[0].#children[0];
            const nestedChildren = parentElement.#children;
            
            if (nestedChildren.length > 1) {
              const firstChild = nestedChildren[0];
              const secondChild = nestedChildren[1];
              
              console.log(firstChild);
              console.log(secondChild);
              
              if (!parentElement.isIndicator && !firstChild.isIndicator && secondChild.isIndicator) {
                let startOffset = (secondChild.width / 2 + (secondChild.anchorOffset.x || 0)) - 
                (firstChild.width / 2 + (firstChild.anchorOffset.x || 0));

                if (startOffset < 0) {
                  startOffset = 0;
                }
                return this.#children.map(child => 
                  child.getPath(this.#relativeToRootX + x + startOffset, this.#relativeToParentY + y)
                ).join('');
              }
            }
          }
        } catch (e) {
          console.warn("Error in indicator positioning:", e);
        }
        
        return this.#children.map(child => 
          child.getPath(this.#relativeToRootX + x, this.#relativeToParentY + y)
        ).join('');
      };
    } else if (blissObj.characters) {
      if (this.#level < 1) this.#level = 1;
      let relativeToLocalX = 0;
      for (const character of blissObj.characters) {
        //const child = new BlissElement(character, this.#relativeToParentX + relativeToLocalX);
        const child = new BlissElement(character, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
        /* handle this through querying previousElement instead.
        if (child.isExternalGlyph) {
          const defaultExternalGlyphSpacing = 0.1;
          relativeToLocalX += child.width + defaultExternalGlyphSpacing;
        } else {
          relativeToLocalX += child.width + this.#charSpacing; //TODO take indicators into consideration
        }*/

        //child.type = "character";
        this.#children.push(child);        
      }
      this.getPath = (x = 0, y = 0) => this.#children.map(child => child.getPath(this.#relativeToParentX + x , this.#relativeToParentY + y)).join('');
    } else {
      if (this.#level < 2) this.#level = 2;
      const codeName = blissObj.code;
      if (level === 2) {
        //detta funkar Inte, eller? nu ändrade jag så att x() returnerar relativeToParentX och inte (relativeToParentX+relativeToRootX)
        this.#relativeToParentX = previousElement ? previousElement.x + previousElement.width + this.#charSpacing : 0;
      } else {
        this.#relativeToParentX = blissObj.x || 0;
        //this.#relativeToParentX = (blissObj.x || 0) + previousElement ? previousElement.x + previousElement.width : 0;
      }
      this.#relativeToParentY = blissObj.y || 0;
      this.#anchorOffsetX = blissObj.anchorOffsetX || 0;
      this.#anchorOffsetY = blissObj.anchorOffsetY || 0;

      const definition = blissElementDefinitions[codeName];

      if (definition) {
        this.#codeName = codeName;                                  //default: empty string
        this.#extraPathOptions = definition.extraPathOptions || {}; //default: empty object
        this.#isCharacter = !!definition.isCharacter;               //default: false
        this.#isAtomic = !!definition.isAtomic;                     //default: false
        this.#isExternalGlyph = !!definition.isExternalGlyph;       //default: false
        //hur ska jag göra så att isExternalGlyph hamnar på character, när den i själva verket läggs som en part?u
        //if parent has only one child, och childen är isExternalGlyph, så är parenten ExternalGlyph?

        //och isIndicator ligger ju på parenten, inte på definition
        this.#width = definition.width;
        this.#height = definition.height;
        if (definition.getPath) {
          this.getPath = (x = 0, y = 0) => definition.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y, this.#extraPathOptions);          
        }
      }
      if (blissObj.parts) {
        for (const part of blissObj.parts) {
          //console.log("part: ");
          //console.log(part);
          //const child = new BlissElement(part, this.#relativeToParentX);
          const child = new BlissElement(part, { parentElement: this, previousElement: this.#children[this.#children.length - 1], level: this.#level + 1 });
          //child.type = "part";
          this.#children.push(child);
        }
        if (this.#isIndicator) {
          const centerOfBaseCharacter = previousElement ? previousElement.width / 2 + previousElement.anchorOffset.x : 0;

          let anchorOffsetX = blissObj.anchorOffsetX || 0;

          const widthOfIndicator = blissObj.width ?? 2;
          let offsetX = 0;
          if (previousElement) {  
            offsetX = previousElement ? centerOfBaseCharacter - anchorOffsetX - widthOfIndicator / 2 : anchorOffsetX - widthOfIndicator / 2;
          }
          const offsetY = previousElement ? previousElement.anchorOffset.y : 0;

          this.getPath = (x = 0, y = 0, level = 0) => {
            // If level is 0, add the offsetX, else don't add it
            const appliedOffsetX = (level === 0) ? x + this.#relativeToParentX + offsetX : x + this.#relativeToParentX;
            const appliedOffsetY = y + this.#relativeToParentY + offsetY;
          
            return this.#children.map(child => child.getPath(appliedOffsetX, appliedOffsetY, level + 1)).join('');
          }

          //this.getPath = (x = 0, y = 0, level = 0) => this.#children.map(child => child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)).join('');
          //this.getPath = (x = 0, y = 0) => this.#children.map(child => child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)).join('');
        } else {
          this.getPath = (x = 0, y = 0) => this.#children.map(child => child.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y)).join('');
        }
      } 
      if (!definition?.getPath && !blissObj.parts) {
        throw new Error(`Code ${blissObj.code} did not correspond to a definition with a getPath function.`);
      }
    }
  }

  //get codeString() {
  //  return this.#codeString;
 // }

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
    if (this.#width !== undefined) {
      return this.#width;
    }
    if (this.#children) {
      let minRelativeX = Number.POSITIVE_INFINITY;
      let maxRelativeXPlusWidth = Number.NEGATIVE_INFINITY;
    
      for(let child of this.#children) {
        minRelativeX = Math.min(minRelativeX, child.x);
        maxRelativeXPlusWidth = Math.max(maxRelativeXPlusWidth, child.x + child.width);
      }
  
      return maxRelativeXPlusWidth - minRelativeX;
    }
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

  get x() {
    return this.#relativeToParentX;// + this.#relativeToRootX;
  }

  get y() {
    return this.#relativeToParentY;
  }

  //get #theOnlyChild() {
  //  return (this.#children.length === 1 && this.#children[0]) || {};
  //}

  get isCharacter() {
    return this.#isCharacter; //this.#theOnlyChild.#isCharacter;
  }

  get isIndicator() {
    return this.#isIndicator;
  }

  get isAtomic() {
    return this.#isAtomic;
  }

  get isExternalGlyph() {
    const isCharacterLevel = (this.#level === 2);
    return isCharacterLevel ? !!(this.#children[0]?.isExternalGlyph) : false;
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
      
      let delimiterMap = {
          1: '//',
          2: '/',
          3: ';',
      };

      let results = obj.elements.map(subObj => traverse(subObj, level + 1)).join(delimiterMap[level]);
  
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

  #initExplicitElement(definition) {
    this.#width = definition.width;
    this.#height = definition.height;
    this.getPath = (x = 0, y = 0) => definition.getPath(this.#relativeToParentX + x, this.#relativeToParentY + y, this.#extraPathOptions);
  }
  
  #initImplicitElement(parts) {
    for (const part of parts) {
      const child = new BlissElement(part, this.#relativeToParentX);
      this.#children.push(child);
    }
    this.getPath = (x = 0, y = 0) => this.#children.map(child => child.getPath(x + this.#relativeToParentX, y + this.#relativeToParentY)).join('');  
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