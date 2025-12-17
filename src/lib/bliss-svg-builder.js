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

    // margin: Sets ALL 4 margins
    if ('margin' in rawOptions && !isNaN(rawOptions['margin'])) {
      const m = Number(rawOptions['margin']);
      options.marginTop = m;
      options.marginBottom = m;
      options.marginLeft = m;
      options.marginRight = m;
    }

    // Individual margins (override the above if present)
    if ('margin-top' in rawOptions && !isNaN(rawOptions['margin-top'])) {
      options.marginTop = Number(rawOptions['margin-top']);
    }
    if ('margin-bottom' in rawOptions && !isNaN(rawOptions['margin-bottom'])) {
      options.marginBottom = Number(rawOptions['margin-bottom']);
    }
    if ('margin-left' in rawOptions && !isNaN(rawOptions['margin-left'])) {
      options.marginLeft = Number(rawOptions['margin-left']);
    }
    if ('margin-right' in rawOptions && !isNaN(rawOptions['margin-right'])) {
      options.marginRight = Number(rawOptions['margin-right']);
    }

    // grid: Boolean ("1" -> true, "0" -> false)
    if ('grid' in rawOptions) {
      if (rawOptions.grid === "1") {
        options.grid = true;
      } else if (rawOptions.grid === "0") {
        options.grid = false;
      }
    }

    // Grid colors - hierarchy: bulk → category → specific
    // Start with defaults
    let skyColor = "#858585";
    let earthColor = "#858585";
    let majorColor = "#c7c7c7";  // major grid (non-semantic)
    let mediumColor = "#ebebeb";
    let minorColor = "#ebebeb";

    // Apply bulk option (sets all grid colors)
    if ('grid-color' in rawOptions) {
      const gc = rawOptions['grid-color'];
      skyColor = earthColor = majorColor = mediumColor = minorColor = gc;
    }

    // Apply category option for major grids (overrides bulk for major lines)
    if ('grid-major-color' in rawOptions) {
      const gmc = rawOptions['grid-major-color'];
      skyColor = earthColor = majorColor = gmc;
    }

    // Apply category option for medium grid (overrides bulk)
    if ('grid-medium-color' in rawOptions) {
      mediumColor = rawOptions['grid-medium-color'];
    }

    // Apply category option for minor grid (overrides bulk)
    if ('grid-minor-color' in rawOptions) {
      minorColor = rawOptions['grid-minor-color'];
    }

    // Apply specific options (most specific, override everything)
    if ('grid-sky-color' in rawOptions) {
      skyColor = rawOptions['grid-sky-color'];
    }

    if ('grid-earth-color' in rawOptions) {
      earthColor = rawOptions['grid-earth-color'];
    }

    // Assign to options object
    options.gridSkyColor = skyColor;
    options.gridEarthColor = earthColor;
    options.gridMajorColor = majorColor;
    options.gridMediumColor = mediumColor;
    options.gridMinorColor = minorColor;

    // Grid stroke widths - same hierarchy pattern
    // Start with defaults
    let skyWidth = 0.166;
    let earthWidth = 0.166;
    let majorWidth = 0.166;  // major grid (non-semantic)
    let mediumWidth = 0.166;
    let minorWidth = 0.166;

    // Apply bulk option (sets all grid widths)
    if ('grid-stroke-width' in rawOptions) {
      const gsw = Number(rawOptions['grid-stroke-width']);
      skyWidth = earthWidth = majorWidth = mediumWidth = minorWidth = gsw;
    }

    // Apply category option for major grids (overrides bulk for major lines)
    if ('grid-major-stroke-width' in rawOptions) {
      const gmsw = Number(rawOptions['grid-major-stroke-width']);
      skyWidth = earthWidth = majorWidth = gmsw;
    }

    // Apply category option for medium grid (overrides bulk)
    if ('grid-medium-stroke-width' in rawOptions) {
      mediumWidth = Number(rawOptions['grid-medium-stroke-width']);
    }

    // Apply category option for minor grid (overrides bulk)
    if ('grid-minor-stroke-width' in rawOptions) {
      minorWidth = Number(rawOptions['grid-minor-stroke-width']);
    }

    // Apply specific options (most specific, override everything)
    if ('grid-sky-stroke-width' in rawOptions) {
      skyWidth = Number(rawOptions['grid-sky-stroke-width']);
    }

    if ('grid-earth-stroke-width' in rawOptions) {
      earthWidth = Number(rawOptions['grid-earth-stroke-width']);
    }

    // Assign to options object
    options.gridSkyStrokeWidth = skyWidth;
    options.gridEarthStrokeWidth = earthWidth;
    options.gridMajorStrokeWidth = majorWidth;
    options.gridMediumStrokeWidth = mediumWidth;
    options.gridMinorStrokeWidth = minorWidth;

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

    // SVG element height (presentation size, not viewBox)
    if ('svg-height' in rawOptions && !isNaN(rawOptions['svg-height'])) {
      options.svgHeight = Number(rawOptions['svg-height']);
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
      marginTop: processedOptions.marginTop ?? 0.75,
      marginBottom: processedOptions.marginBottom ?? 0.75,
      marginLeft: processedOptions.marginLeft ?? 0.75,
      marginRight: processedOptions.marginRight ?? 0.75,
      color: processedOptions.color ?? "#000000",
      gridSkyColor: processedOptions.gridSkyColor ?? "#858585", // sky line color (major semantic grid line at y=8)
      gridEarthColor: processedOptions.gridEarthColor ?? "#858585", // earth line color (major semantic grid line at y=16)
      gridMajorColor: processedOptions.gridMajorColor ?? "#c7c7c7", // major grid color (structural lines)
      gridMediumColor: processedOptions.gridMediumColor ?? "#ebebeb", // medium grid color (intermediate precision)
      gridMinorColor: processedOptions.gridMinorColor ?? "#ebebeb", // minor grid color (fine detail alignment)
      gridSkyStrokeWidth: processedOptions.gridSkyStrokeWidth ?? 0.166, // sky line stroke-width
      gridEarthStrokeWidth: processedOptions.gridEarthStrokeWidth ?? 0.166, // earth line stroke-width
      gridMajorStrokeWidth: processedOptions.gridMajorStrokeWidth ?? 0.166, // major grid stroke-width
      gridMediumStrokeWidth: processedOptions.gridMediumStrokeWidth ?? 0.166, // medium grid stroke-width
      gridMinorStrokeWidth: processedOptions.gridMinorStrokeWidth ?? 0.166, // minor grid stroke-width
      background: processedOptions.background ?? "", // empty string => transparent background
      cropTop: processedOptions.cropTop ?? 0,
      cropBottom: processedOptions.cropBottom ?? 0,
      cropLeft: processedOptions.cropLeft ?? 0,
      cropRight: processedOptions.cropRight ?? 0,
      svgHeight: processedOptions.svgHeight // optional: SVG element height attribute
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
    const content = this.composition.getSvgContent();

    // If content already contains complete SVG tags (like <g> from hierarchical options), return as-is
    if (content.includes('<g ')) {
      return content;
    }

    // Otherwise, wrap raw path data in a <path> element
    // Note: DOT/COMMA have extraPathOptions that embed </path><path.../><path d=" in the content
    // which gets wrapped properly here
    return `<path d="${content}"></path>`;
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
    const marginTop = this.options.marginTop;
    const marginBottom = this.options.marginBottom;
    const marginLeft = this.options.marginLeft;
    const marginRight = this.options.marginRight;
    const width = this.options.width;
    const height = this.options.height;

    const viewBoxX = -marginLeft + cropLeft;
    const viewBoxY = -marginTop + cropTop;
    const content = this.svgContent;
    const viewBoxWidth = width + marginLeft + marginRight - cropLeft - cropRight;
    const viewBoxHeight = height + marginTop + marginBottom - cropTop - cropBottom;
    const svgAttributeMultiplier = 6;

    // Calculate SVG element dimensions (maintaining aspect ratio)
    let svgWidth, svgHeight;
    if (this.options.svgHeight !== undefined) {
      // Height specified: calculate width to maintain aspect ratio
      svgHeight = this.options.svgHeight;
      svgWidth = (viewBoxWidth / viewBoxHeight) * svgHeight;
    } else {
      // Auto-calculate both dimensions
      svgWidth = svgAttributeMultiplier * viewBoxWidth;
      svgHeight = svgAttributeMultiplier * viewBoxHeight;
    }

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
  `<path class="grid-line grid-line--minor" stroke-width="${this.options.gridMinorStrokeWidth}" stroke="${this.options.gridMinorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M0,1H${width}M0,3H${width}M0,5H${width}M0,7H${width}M0,9H${width}M0,11H${width}M0,13H${width}M0,15H${width}M0,17H${width}M0,19H${width}${getVerticalLines("dense")}"/>
  <path class="grid-line grid-line--medium" stroke-width="${this.options.gridMediumStrokeWidth}" stroke="${this.options.gridMediumColor}" stroke-linecap="square" stroke-linejoin="miter" d="M0,2H${width}M0,6H${width}M0,10H${width}M0,14H${width}M0,18H${width}${getVerticalLines("semiDense")}"/>
  <path class="grid-line grid-line--major" stroke-width="${this.options.gridMajorStrokeWidth}" stroke="${this.options.gridMajorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M0,0H${width}M0,4H${width}M0,12H${width}M0,20H${width}${getVerticalLines("sparse")}"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="${this.options.gridSkyStrokeWidth}" stroke="${this.options.gridSkyColor}" stroke-linecap="square" stroke-linejoin="miter" d="M0,8H${width}"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="${this.options.gridEarthStrokeWidth}" stroke="${this.options.gridEarthColor}" stroke-linecap="square" stroke-linejoin="miter" d="M0,16H${width}"/>
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
