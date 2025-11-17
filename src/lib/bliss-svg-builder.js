/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";

class BlissSVGBuilder {
  #processOptions(rawOptions = {}) {
    const options = {};

    // stroke-width: Number, clamped 0.1-1.5
    if ('stroke-width' in rawOptions && !isNaN(rawOptions['stroke-width'])) {
      let strokeWidth = Number(rawOptions['stroke-width']);
      if (strokeWidth < 0.1) {
        strokeWidth = 0.1;
      } else if (strokeWidth > 1.5) {
        strokeWidth = 1.5;
      }
      options.strokeWidth = strokeWidth;
    }

    // stroke-width: Number, clamped 0.1-1.5
    if ('dot-extra-width' in rawOptions && !isNaN(rawOptions['dot-extra-width'])) {
      let dotExtraWidth = Number(rawOptions['dot-extra-width']);
      if (dotExtraWidth < 0) {
        dotExtraWidth = 0;
      } else if (dotExtraWidth > 1) {
        dotExtraWidth = 1;
      }
      options.dotExtraWidth = dotExtraWidth;
    }

    // space: Number, clamped 1-10
    if ('space' in rawOptions && !isNaN(rawOptions['space'])) {
      let space = Number(rawOptions['space']);
      if (space < 1) {
        space = 1;
      } else if (space > 10) {
        space = 10;
      }
      options.space = space;
    }

    // margin: Explicit number (calculated default happens in constructor)
    if ('margin' in rawOptions && !isNaN(rawOptions['margin'])) {
      options.margin = Number(rawOptions['margin']);
    }

    // grid: Boolean ("1" -> true, "0" -> false)
    if ('grid' in rawOptions) {
      if (rawOptions.grid === "1") {
        options.grid = true;
      } else if (rawOptions.grid === "0") {
        options.grid = false;
      }
    }

    // grid-stroke-width: Sets ALL 4 grid stroke widths
    if ('grid-stroke-width' in rawOptions) {
      const gsw = Number(rawOptions['grid-stroke-width']);
      options.grid1StrokeWidth = gsw;
      options.grid2StrokeWidth = gsw;
      options.grid3StrokeWidth = gsw;
      options.grid4StrokeWidth = gsw;
    }

    // Individual grid stroke widths (override the above if present)
    if ('grid1-stroke-width' in rawOptions) {
      options.grid1StrokeWidth = Number(rawOptions['grid1-stroke-width']);
    }
    if ('grid2-stroke-width' in rawOptions) {
      options.grid2StrokeWidth = Number(rawOptions['grid2-stroke-width']);
    }
    if ('grid3-stroke-width' in rawOptions) {
      options.grid3StrokeWidth = Number(rawOptions['grid3-stroke-width']);
    }
    if ('grid4-stroke-width' in rawOptions) {
      options.grid4StrokeWidth = Number(rawOptions['grid4-stroke-width']);
    }

    // Crop values: Simple numbers
    if ('crop-top' in rawOptions) {
      options.cropTop = Number(rawOptions['crop-top']);
    }
    if ('crop-bottom' in rawOptions) {
      options.cropBottom = Number(rawOptions['crop-bottom']);
    }
    if ('crop-left' in rawOptions) {
      options.cropLeft = Number(rawOptions['crop-left']);
    }
    if ('crop-right' in rawOptions) {
      options.cropRight = Number(rawOptions['crop-right']);
    }

    // Grid colors: Strings
    if ('grid1' in rawOptions) {
      options.grid1Color = rawOptions.grid1;
    }
    if ('grid2' in rawOptions) {
      options.grid2Color = rawOptions.grid2;
    }
    if ('grid3' in rawOptions) {
      options.grid3Color = rawOptions.grid3;
    }
    if ('grid4' in rawOptions) {
      options.grid4Color = rawOptions.grid4;
    }

    // Other string options
    if ('color' in rawOptions) {
      options.color = rawOptions.color;
    }
    if ('background' in rawOptions) {
      options.background = rawOptions.background;
    }
    if ('text' in rawOptions) {
      options.text = rawOptions.text;
    }
    if ('svg-desc' in rawOptions) {
      options.svgDesc = rawOptions['svg-desc'];
    }
    if ('svg-title' in rawOptions) {
      options.svgTitle = rawOptions['svg-title'];
    }

    return options;
  }

  constructor(input) {
    const blissObj = BlissParser.parse(input);
    this.composition = new BlissElement(blissObj);

    const processedOptions = this.#processOptions(blissObj.options);

    this.options = {
      strokeWidth: processedOptions.strokeWidth ?? 0.5,
      dotExtraWidth: processedOptions.dotExtraWidth ?? 0.333,
      width: this.composition.width,
      height: 20, // fixed value
      x: this.composition.x,
      y: this.composition.y,
      space: processedOptions.space ?? 2,
      text: processedOptions.text ?? "",
      svgTitle: processedOptions.svgTitle ?? "",
      svgDesc: processedOptions.svgDesc ?? "",
      grid: processedOptions.grid ?? false,
      margin: processedOptions.margin ?? 0.75,
      color: processedOptions.color ?? "#000000",
      grid1Color: processedOptions.grid1Color ?? "#858585", // sky and earth line color
      grid2Color: processedOptions.grid2Color ?? "#c7c7c7", // sparse line color
      grid3Color: processedOptions.grid3Color ?? "#ebebeb", // semi-dense line color
      grid4Color: processedOptions.grid4Color ?? "#ebebeb", // dense line color
      grid1StrokeWidth: processedOptions.grid1StrokeWidth ?? 0.166, // sky and earth line stroke-width
      grid2StrokeWidth: processedOptions.grid2StrokeWidth ?? 0.166, // sparse line stroke-width
      grid3StrokeWidth: processedOptions.grid3StrokeWidth ?? 0.166, // semi-dense line stroke-width
      grid4StrokeWidth: processedOptions.grid4StrokeWidth ?? 0.166, // dense line stroke-width
      background: processedOptions.background ?? "", // empty string => transparent background
      cropTop: processedOptions.cropTop ?? 0,
      cropBottom: processedOptions.cropBottom ?? 0,
      cropLeft: processedOptions.cropLeft ?? 0,
      cropRight: processedOptions.cropRight ?? 0
    }
  }

  toString() {
    return this.composition.toString();
  }

  toJSON() {
    return this.composition.toJSON();
  }

  /**
   * Returns the SVG content (path elements and groups) as a string.
   * This is useful when you need only the primary graphical content of the SVG for manipulation or for use in complex SVG compositions.
   *
   * @returns {string} SVG content string
   */
  get svgContent() {
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
   * @param {Object.<string, { codeString: string, isIndicator?: boolean, anchorOffsetX?: number, anchorOffsetY?: number, width?: number }>} data 
   *     Character code in the format { B1: { codeString: "..." }, B2: { codeString: "..." } }
   *     Optional properties: isIndicator, anchorOffsetX, anchorOffsetY, width.
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
          
          if (entry.hasOwnProperty('anchorOffsetX') && typeof entry.anchorOffsetX === 'number') {
            validEntry.anchorOffsetX = entry.anchorOffsetX;
          }

          if (entry.hasOwnProperty('anchorOffsetY') && typeof entry.anchorOffsetY === 'number') {
            validEntry.anchorOffsetY = entry.anchorOffsetY;
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
    const color = this.options.color;
    const strokeWidth = this.options.strokeWidth;
    const cropTop = this.options.cropTop;
    const cropBottom = this.options.cropBottom;
    const cropLeft = this.options.cropLeft;
    const cropRight = this.options.cropRight;
    const margin = this.options.margin;
    const width = this.options.width;
    const height = this.options.height;

    const viewBoxX = -margin + cropLeft;
    const viewBoxY = -margin + cropTop;
    const content = this.svgContent;
    const viewBoxWidth = width + margin * 2 - cropLeft - cropRight;
    const viewBoxHeight = height - cropTop - cropBottom + margin * 2;
    const svgAttributeMultiplier = 6;
    const svgWidth = svgAttributeMultiplier * viewBoxWidth;
    const svgHeight = svgAttributeMultiplier * viewBoxHeight;
    const round = (num) => parseFloat(num.toFixed(4));

    let title = this.options.svgTitle ? `<title>${this.options.svgTitle}</title>` : "";
    let desc = this.options.svgDesc ? `<desc>${this.options.svgDesc}</desc>` : "";
    let gridPath = "";
    let svgText = "";//this._getSvgText();
    let backgroundRect = (this.options.background === "" ? "" : `<rect x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${this.options.background}"/>`);

    let getVerticalLines = (type) => {
      let pathData = "";
      let count = 0;

      switch(type) {
        case "dense":
          //odd numbers
          count = Math.floor((width + 1) / 2)
          for (let i = 0; i < count; i++) {
              pathData += `M${i*2+1},0V${height}`;
          }
          break;
        case "semiDense":
          //even numbers not divisible with 4
          count = Math.floor((width + 2) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${i*4+2},0V${height}`;
          }
          break;
        case "sparse":
          //even numbers divisible with 4
          count = Math.floor((width + 4) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${i*4},0V${height}`;
          }
          break;
        default:
          break;
      }
      return pathData;
    }
    if (this.options.grid) {
      gridPath =
  `<path class="denseGrid" stroke-width="${this.options.grid4StrokeWidth}" stroke="${this.options.grid4Color}" stroke-linecap="square" stroke-linejoin="miter" d="M0,1H${width}M0,3H${width}M0,5H${width}M0,7H${width}M0,9H${width}M0,11H${width}M0,13H${width}M0,15H${width}M0,17H${width}M0,19H${width}${getVerticalLines("dense")}"/>
  <path class="semiDenseGrid" stroke-width="${this.options.grid3StrokeWidth}" stroke="${this.options.grid3Color}" stroke-linecap="square" stroke-linejoin="miter" d="M0,2H${width}M0,6H${width}M0,10H${width}M0,14H${width}M0,18H${width}${getVerticalLines("semiDense")}"/>
  <path class="sparseGrid" stroke-width="${this.options.grid2StrokeWidth}" stroke="${this.options.grid2Color}" stroke-linecap="square" stroke-linejoin="miter" d="M0,0H${width}M0,4H${width}M0,12H${width}M0,20H${width}${getVerticalLines("sparse")}"/>
  <path class="skyEarthGrid" stroke-width="${this.options.grid1StrokeWidth}" stroke="${this.options.grid1Color}" stroke-linecap="square" stroke-linejoin="miter" d="M0,8H${width}M0,16H${width}"/>
  `;
    }

    let svgStr =
`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="${round(svgWidth)}" height="${round(svgHeight)}" viewBox="${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}" fill="none" stroke="${color}" stroke-linejoin="round" stroke-linecap="round" stroke-width="${strokeWidth}">
  ${title}${desc}${backgroundRect}${gridPath}${content}${svgText}
</svg>`;
    return svgStr;
  }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { BlissSVGBuilder }; // CommonJS exports
}
export { BlissSVGBuilder }; // ES module export
