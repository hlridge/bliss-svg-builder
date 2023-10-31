/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";

class BlissSVGBuilder {
  constructor(input) {
    const blissObj = BlissParser.parse(input);
    this.composition = new BlissElement(blissObj);

    //default options
    this.options = {
      strokeWidth: 0.5,
      width: this.composition.width,
      height: this.composition.height,
      x: this.composition.x,
      y: this.composition.y,
      grid: true
    }
  }

  toString() {
    return this.composition.toString();
  }

  toJSON() {
    return this.composition.toJSON();
  }

  /**
   * Returns the main path element of the SVG as a string.
   * This is useful when you need only the primary graphical content of the SVG for manipulation or for use in complex SVG compositions.
   * 
   * @returns {string} SVG path string
   */
  get svgPath() {
    return `<path d="${this.composition.getPath()}"></path>`
  }

  /**
   * Returns the SVG as a DOM Element.
   * This property is useful when you need to directly manipulate the SVG using the native DOM API.
   * 
   * @returns {HTMLElement} SVG DOM element
   */
  get svgElement() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.#svgCode, 'image/svg+xml');
    return doc.documentElement;
  }
  
  /**
   * Returns the SVG code as a string, without the XML declaration.
   * This is suitable for embedding the SVG within HTML documents or using it with virtual DOM libraries like React and Preact.
   * 
   * @returns {string} SVG string without XML declaration
   */
  get svgCode() {
    return this.#svgCode;
  }

  /**
   * Returns the SVG code as a string, including the XML declaration.
   * This is suitable for creating standalone SVG files.
   * 
   * @returns {string} SVG string with XML declaration
   */
  get standaloneSvg() {
    return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n${this.#svgCode}`;
  }

  set code(settingsAndCodesString) {
    if (typeof settingsAndCodesString !== "string") throw new Error("Code must be a string");

    const settings = this.parseSettings(settingsAndCodesString);
    this.validateSettings(settings);
    this.applySettings(settings);

    this.pathProperties.path = this.getFullPath(settingsAndCodesString);
    this.pathProperties.code = settingsAndCodesString;
  }

  parseSettings(settingsAndCodesString) {
    // Implement the logic of parsing settings here...
  }

  validateSettings(settings) {
    // Implement the logic of validating settings here...
  }

  applySettings(settings) {
    // Implement the logic of applying settings here...
  }

  getFullPath(settingsAndCodesString) {
    // Implement the logic of getting full path here...
  }

  // ...more methods...

  /**
   * Extends the blissElementDefinitions with custom data.
   *
   * @static
   * @param {Object.<string, { codeString: string, isIndicator?: boolean, center?: number, top?: number, width?: number }>} data 
   *     Character code in the format { B1: { codeString: "..." }, B2: { codeString: "..." } }
   *     Optional properties: isIndicator, center, top, width.
   *     Use this function before invoking new to extend Bliss-SVG-Builder with custom data.
   */
  static extendData(data) {
    if (data) {
      for (let key in data) {
        let entry = data[key];
        
        if (entry.hasOwnProperty('codeString') && typeof entry.codeString === 'string') {
          let validEntry = { codeString: entry.codeString };
  
          if (entry.hasOwnProperty('isIndicator') && typeof entry.isIndicator === 'boolean') {
            validEntry.isIndicator = entry.isIndicator;
          }
          
          if (entry.hasOwnProperty('center') && typeof entry.center === 'number') {
            validEntry.center = entry.center;
          }

          if (entry.hasOwnProperty('top') && typeof entry.top === 'number') {
            validEntry.top = entry.top;
          }

          if (entry.hasOwnProperty('width') && typeof entry.width === 'number') {
            validEntry.width = entry.width;
          }
          
          blissElementDefinitions[key] = validEntry;
        } else {
          console.warn(`Invalid entry for key: ${key}`);
        }
      }
    }
  }

  get #svgCode() {
    //temp hard coded values
    const color = "black";
    const strokeWidth = 0.5;
    const cropTop = 0;
    const cropBottom = 0;
    const margin = 0.75;
    const width = this.composition.width;
    const height = 20;

    const viewBoxX = -margin;
    const viewBoxY = -margin + cropTop;
    const path = this.svgPath;
    const viewBoxWidth = width + margin * 2;
    const viewBoxHeight = height - cropTop - cropBottom + margin * 2;
    const svgAttributeMultiplier = 6;
    const svgWidth = svgAttributeMultiplier * viewBoxWidth;
    const svgHeight = svgAttributeMultiplier * viewBoxHeight;

    let title = "";//this._svgTitle ? `<title>${this._svgTitle}</title>` : "";
    let desc = "";//this._svgDesc ? `<desc>${this._svgDesc}</desc>` : "";
    let gridPath = "";// this._grid ? this._getGridPath() : "";
    let svgText = "";//this._getSvgText();
    let backgroundRect = "";//(this._background === "" ? "" : `<rect x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${this._background}"/>`)

    let svgStr =
`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="${svgWidth}" height="${svgHeight}" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" fill="none" stroke="${color}" stroke-linejoin="round" stroke-linecap="round" stroke-width="${strokeWidth}">
  ${title}${desc}${backgroundRect}${gridPath}${path}${svgText}
</svg>`;
    return svgStr;
  }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { BlissSVGBuilder }; // CommonJS exports
}
export { BlissSVGBuilder }; // ES module export
