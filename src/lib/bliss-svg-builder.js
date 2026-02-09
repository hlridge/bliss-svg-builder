/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";
import { INTERNAL_OPTIONS, KNOWN_OPTION_KEYS, escapeHtml } from "./bliss-constants.js";

class BlissSVGBuilder {
  #processedOptions;

  // Processes raw options (kebab-case) into internal options (camelCase).
  // Bulk options expanded here (not in output): 'margin', 'crop', 'grid-color', 'grid-stroke-width'.
  // @param {boolean} addBuilderDefaults - If true, adds defaults for builder-level options (grid, etc.)
  #processOptions(rawOptions = {}, addBuilderDefaults = false) {
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

    // dot-extra-width: Number, clamped 0-1
    if ('dot-extra-width' in rawOptions && !isNaN(rawOptions['dot-extra-width'])) {
      let dotExtraWidth = Number(rawOptions['dot-extra-width']);
      if (dotExtraWidth < 0) {
        dotExtraWidth = 0;
      } else if (dotExtraWidth > 1) {
        dotExtraWidth = 1;
      }
      options.dotExtraWidth = dotExtraWidth;
    }

    // char-space: Number, clamped 0-10
    if ('char-space' in rawOptions && !isNaN(rawOptions['char-space'])) {
      let charSpace = Number(rawOptions['char-space']);
      if (charSpace < 0) {
        charSpace = 0;
      } else if (charSpace > 10) {
        charSpace = 10;
      }
      options.charSpace = charSpace;
    }

    // word-space: Number, clamped 0-20
    if ('word-space' in rawOptions && !isNaN(rawOptions['word-space'])) {
      let wordSpace = Number(rawOptions['word-space']);
      if (wordSpace < 0) {
        wordSpace = 0;
      } else if (wordSpace > 20) {
        wordSpace = 20;
      }
      options.wordSpace = wordSpace;
    }

    // external-glyph-space: Number, clamped 0-3
    if ('external-glyph-space' in rawOptions && !isNaN(rawOptions['external-glyph-space'])) {
      let externalGlyphSpace = Number(rawOptions['external-glyph-space']);
      if (externalGlyphSpace < 0) {
        externalGlyphSpace = 0;
      } else if (externalGlyphSpace > 3) {
        externalGlyphSpace = 3;
      }
      options.externalGlyphSpace = externalGlyphSpace;
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

    // min-width: Number, clamped to 0 minimum (negative values become 0)
    if ('min-width' in rawOptions && !isNaN(rawOptions['min-width'])) {
      let minWidth = Number(rawOptions['min-width']);
      if (minWidth < 0) {
        minWidth = 0;
      }
      options.minWidth = minWidth;
    }

    // centered: Number, 0 (left-aligned) or 1 (centered, default)
    if ('centered' in rawOptions && !isNaN(rawOptions['centered'])) {
      const centered = Number(rawOptions['centered']);
      options.centered = (centered === 0) ? 0 : 1;
    }

    // freestyle: Boolean ("1" -> true, "0" -> false)
    // When true, uses actual composition height instead of fixed 20 units
    if ('freestyle' in rawOptions) {
      if (rawOptions.freestyle === "1") {
        options.freestyle = true;
      } else if (rawOptions.freestyle === "0") {
        options.freestyle = false;
      }
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
    // Only process if builder defaults requested or if grid options present
    if (addBuilderDefaults || Object.keys(rawOptions).some(k => k.startsWith('grid-'))) {
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

      // Assign to options object (escaped for safe SVG output)
      options.gridSkyColor = escapeHtml(skyColor);
      options.gridEarthColor = escapeHtml(earthColor);
      options.gridMajorColor = escapeHtml(majorColor);
      options.gridMediumColor = escapeHtml(mediumColor);
      options.gridMinorColor = escapeHtml(minorColor);
    }

    // Grid stroke widths - same hierarchy pattern
    // Only process if builder defaults requested or if grid options present
    if (addBuilderDefaults || Object.keys(rawOptions).some(k => k.startsWith('grid-'))) {
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
    }

    // crop: Sets ALL 4 crop values (number or 'auto')
    if ('crop' in rawOptions) {
      const c = rawOptions['crop'];
      if (c === 'auto') {
        options.cropTop = 'auto';
        options.cropBottom = 'auto';
        options.cropLeft = 'auto';
        options.cropRight = 'auto';
      } else if (!isNaN(c)) {
        const n = Number(c);
        options.cropTop = n;
        options.cropBottom = n;
        options.cropLeft = n;
        options.cropRight = n;
      }
    }

    // Individual crop values (override the above if present)
    // Each can be a number or 'auto'
    const parseCropValue = (val) => val === 'auto' ? 'auto' : Number(val);
    if ('crop-top' in rawOptions) {
      options.cropTop = parseCropValue(rawOptions['crop-top']);
    }
    if ('crop-bottom' in rawOptions) {
      options.cropBottom = parseCropValue(rawOptions['crop-bottom']);
    }
    if ('crop-left' in rawOptions) {
      options.cropLeft = parseCropValue(rawOptions['crop-left']);
    }
    if ('crop-right' in rawOptions) {
      options.cropRight = parseCropValue(rawOptions['crop-right']);
    }

    // Other string options
    if ('color' in rawOptions) {
      options.color = escapeHtml(rawOptions.color);
    }
    if ('background' in rawOptions) {
      options.background = escapeHtml(rawOptions.background); // empty string => transparent background
    }
    if ('text' in rawOptions) {
      options.text = escapeHtml(rawOptions.text);
    }
    if ('svg-desc' in rawOptions) {
      options.svgDesc = escapeHtml(rawOptions['svg-desc']);
    }
    if ('svg-title' in rawOptions) {
      options.svgTitle = escapeHtml(rawOptions['svg-title']);
    }

    // SVG element height (presentation size, not viewBox)
    if ('svg-height' in rawOptions && !isNaN(rawOptions['svg-height'])) {
      options.svgHeight = Number(rawOptions['svg-height']);
    }

    // Preserve any options that weren't explicitly processed (like fill, opacity, stroke-dasharray, etc.)
    // Only skip options that are in KNOWN_OPTION_KEYS (already processed above)
    // String values are escaped here at the input boundary so downstream code can use them safely.
    // Numeric values pass through as-is — they're used for calculations, not SVG markup.
    for (const [key, value] of Object.entries(rawOptions)) {
      if (!KNOWN_OPTION_KEYS.has(key)) {
        options[key] = typeof value === 'string' ? escapeHtml(value) : value;
      }
    }

    return options;
  }

  // Recursively process options at all levels (groups, glyphs, parts)
  #processAllOptions(obj, isTopLevel = false) {
    if (obj.options) {
      obj.options = this.#processOptions(obj.options, isTopLevel);
    }
    if (obj.groups) {
      for (const group of obj.groups) {
        this.#processAllOptions(group, false);
      }
    }
    if (obj.glyphs) {
      for (const glyph of obj.glyphs) {
        this.#processAllOptions(glyph, false);
      }
    }
    if (obj.parts) {
      for (const part of obj.parts) {
        this.#processAllOptions(part, false);
      }
    }
  }

  constructor(input) {
    const blissObj = BlissParser.parse(input);

    // Process options at all levels (global, group, glyph, part)
    // Only top level gets builder defaults (grid, margins, etc.)
    this.#processAllOptions(blissObj, true);

    const {
      charSpace,
      wordSpace,
      externalGlyphSpace,
      ...remainingOptions
    } = blissObj.options ?? {};

    const sharedOptions = {
      charSpace: charSpace ?? 2,
      wordSpace: wordSpace ?? 8,
      punctuationSpace: (wordSpace ?? 8) / 2,
      externalGlyphSpace: externalGlyphSpace ?? 0.8
    };

    blissObj.options = remainingOptions;

    // Store processed options privately for svgCode getter
    this.#processedOptions = blissObj.options;

    const attrMap = { 'color': 'stroke' };

    // Store global options that should become SVG attributes
    // Values are already escaped by #processOptions at the input boundary
    this.globalSvgAttributes = {};
    for (const [key, value] of Object.entries(blissObj.options ?? {})) {
      if (!INTERNAL_OPTIONS.has(key)) {
        const attrName = attrMap[key] || key;
        this.globalSvgAttributes[attrName] = value;
      }
    }

    this.composition = new BlissElement(blissObj, { sharedOptions });
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
    if (content.startsWith('<')) {
      return content;
    }

    // Otherwise, wrap raw path data in a <path> element
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
    // Computed rendering dimensions
    const width = Math.max(this.composition.width, this.#processedOptions.minWidth ?? 0);
    const height = this.#processedOptions.freestyle ? this.composition.height : 20;

    // User-provided options with defaults
    const color = this.#processedOptions.color ?? "#000000";
    const strokeWidth = this.#processedOptions.strokeWidth ?? 0.5;
    const marginTop = this.#processedOptions.marginTop ?? 0.75;
    const marginBottom = this.#processedOptions.marginBottom ?? 0.75;
    const marginLeft = this.#processedOptions.marginLeft ?? 0.75;
    const marginRight = this.#processedOptions.marginRight ?? 0.75;

    // Compute crop values - can be numeric or 'auto' (computed from effectiveBounds)
    const bounds = this.composition.effectiveBounds;
    const rawCropTop = this.#processedOptions.cropTop ?? 0;
    const rawCropBottom = this.#processedOptions.cropBottom ?? 0;
    const rawCropLeft = this.#processedOptions.cropLeft ?? 0;
    const rawCropRight = this.#processedOptions.cropRight ?? 0;

    const cropTop = rawCropTop === 'auto' ? bounds.minY : rawCropTop;
    const cropBottom = rawCropBottom === 'auto' ? (height - bounds.maxY) : rawCropBottom;
    const cropLeft = rawCropLeft === 'auto' ? bounds.minX : rawCropLeft;
    const cropRight = rawCropRight === 'auto' ? (width - bounds.maxX) : rawCropRight;

    let viewBoxX = -marginLeft + cropLeft;
    const viewBoxY = -marginTop + cropTop;
    let gridOffsetX = 0;

    if ((this.#processedOptions.centered ?? 1) === 1 && width > this.composition.width) {
      const leftOverhang = -this.composition.x;
      const rightOverhang = (this.composition.x + this.composition.width) - this.composition.baseWidth;
      const maxOverhang = Math.max(leftOverhang, rightOverhang);
      const symmetricWidth = this.composition.baseWidth + 2 * maxOverhang;
      const extraSpace = width - symmetricWidth;
      const offset = extraSpace / 2;
      viewBoxX -= offset;
      gridOffsetX = viewBoxX + marginLeft;
    }
    const content = this.svgContent;
    const viewBoxWidth = width + marginLeft + marginRight - cropLeft - cropRight;
    const viewBoxHeight = height + marginTop + marginBottom - cropTop - cropBottom;
    const svgAttributeMultiplier = 6;

    // Calculate SVG element dimensions (maintaining aspect ratio)
    let svgWidth, svgHeight;
    if (this.#processedOptions.svgHeight !== undefined) {
      // Height specified: calculate width to maintain aspect ratio
      svgHeight = this.#processedOptions.svgHeight;
      svgWidth = (viewBoxWidth / viewBoxHeight) * svgHeight;
    } else {
      // Auto-calculate both dimensions
      svgWidth = svgAttributeMultiplier * viewBoxWidth;
      svgHeight = svgAttributeMultiplier * viewBoxHeight;
    }

    const round = (num) => parseFloat(num.toFixed(4));

    const svgTitle = this.#processedOptions.svgTitle ?? "";
    const svgDesc = this.#processedOptions.svgDesc ?? "";
    const background = this.#processedOptions.background ?? "";

    let title = svgTitle ? `<title>${svgTitle}</title>` : "";
    let desc = svgDesc ? `<desc>${svgDesc}</desc>` : "";
    let gridPath = "";
    let svgText = "";//this._getSvgText();
    let backgroundRect = (background === "" ? "" : `<rect x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${background}"/>`);

    let getVerticalLines = (type) => {
      let pathData = "";
      let count = 0;

      switch(type) {
        case "minor":
          //odd numbers
          count = Math.floor((width + 1) / 2)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*2+1},0V${height}`;
          }
          break;
        case "medium":
          //even numbers not divisible with 4
          count = Math.floor((width + 2) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*4+2},0V${height}`;
          }
          break;
        case "major":
          //even numbers divisible with 4
          count = Math.floor((width + 4) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*4},0V${height}`;
          }
          break;
        default:
          break;
      }
      return pathData;
    }
    if (this.#processedOptions.grid) {
      const gridMinorStrokeWidth = this.#processedOptions.gridMinorStrokeWidth ?? 0.166;
      const gridMinorColor = this.#processedOptions.gridMinorColor ?? "#ebebeb";
      const gridMediumStrokeWidth = this.#processedOptions.gridMediumStrokeWidth ?? 0.166;
      const gridMediumColor = this.#processedOptions.gridMediumColor ?? "#ebebeb";
      const gridMajorStrokeWidth = this.#processedOptions.gridMajorStrokeWidth ?? 0.166;
      const gridMajorColor = this.#processedOptions.gridMajorColor ?? "#c7c7c7";
      const gridSkyStrokeWidth = this.#processedOptions.gridSkyStrokeWidth ?? 0.166;
      const gridSkyColor = this.#processedOptions.gridSkyColor ?? "#858585";
      const gridEarthStrokeWidth = this.#processedOptions.gridEarthStrokeWidth ?? 0.166;
      const gridEarthColor = this.#processedOptions.gridEarthColor ?? "#858585";

      gridPath =
  `<path class="grid-line grid-line--minor" stroke-width="${gridMinorStrokeWidth}" stroke="${gridMinorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},1h${width}M${gridOffsetX},3h${width}M${gridOffsetX},5h${width}M${gridOffsetX},7h${width}M${gridOffsetX},9h${width}M${gridOffsetX},11h${width}M${gridOffsetX},13h${width}M${gridOffsetX},15h${width}M${gridOffsetX},17h${width}M${gridOffsetX},19h${width}${getVerticalLines("minor")}"/>
  <path class="grid-line grid-line--medium" stroke-width="${gridMediumStrokeWidth}" stroke="${gridMediumColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},2h${width}M${gridOffsetX},6h${width}M${gridOffsetX},10h${width}M${gridOffsetX},14h${width}M${gridOffsetX},18h${width}${getVerticalLines("medium")}"/>
  <path class="grid-line grid-line--major" stroke-width="${gridMajorStrokeWidth}" stroke="${gridMajorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},0h${width}M${gridOffsetX},4h${width}M${gridOffsetX},12h${width}M${gridOffsetX},20h${width}${getVerticalLines("major")}"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="${gridSkyStrokeWidth}" stroke="${gridSkyColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},8h${width}"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="${gridEarthStrokeWidth}" stroke="${gridEarthColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},16h${width}"/>
  `;
    }

    // Build additional SVG attributes from global options (excluding explicitly handled ones)
    const explicitlyHandled = ['fill', 'stroke', 'stroke-linejoin', 'stroke-linecap', 'stroke-width', 'strokeWidth', 'color', 'width', 'height', 'viewBox'];
    const additionalAttrs = Object.entries(this.globalSvgAttributes)
      .filter(([key]) => !explicitlyHandled.includes(key))
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    const attrsStr = additionalAttrs ? ' ' + additionalAttrs : '';

    const fill = this.globalSvgAttributes.fill || 'none';
    const stroke = this.globalSvgAttributes.stroke || color;
    const strokeLinejoin = this.globalSvgAttributes['stroke-linejoin'] || 'round';
    const strokeLinecap = this.globalSvgAttributes['stroke-linecap'] || 'round';
    const strokeWidthAttr = this.globalSvgAttributes['stroke-width'] || strokeWidth;

    let svgStr =
`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="${round(svgWidth)}" height="${round(svgHeight)}" viewBox="${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}" fill="${fill}" stroke="${stroke}" stroke-linejoin="${strokeLinejoin}" stroke-linecap="${strokeLinecap}" stroke-width="${strokeWidthAttr}"${attrsStr}>
  ${title}${desc}${backgroundRect}${gridPath}${content}${svgText}
</svg>`;

    // Clean up empty <path d=""></path> elements from DOT/COMMA/external glyphs
    svgStr = svgStr.replace(/<path d=""><\/path>/g, '');

    return svgStr;
  }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { BlissSVGBuilder }; // CommonJS exports
}
export { BlissSVGBuilder }; // ES module export
