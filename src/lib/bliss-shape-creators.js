/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { alphabetData } from "../external-font-data/open-sans-svg-path-data.js";

/**
 * Create an invisible zero-sized anchor element with zero width and height.
 * Used to prevent normalization when explicit positioning is needed.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createZeroSizedAnchor() {
  return {
    getPath: () => '',
    width: 0,
    height: 0,
  };
}

/**
 * Create an invisible space glyph.
 * Width is 0 (invisible). advanceWidth controls cursor movement.
 * @param {number} advanceWidth - Default advance width (may be overridden by BlissSVGBuilder based on options)
 * @returns {Object} - An object with getPath, width, height, and advanceWidth.
 */
export function createSpace(advanceWidth) {
  return {
    getPath: () => '',
    width: 0,
    height: 0,
    advanceWidth,
  };
}

/**
 * Create a circle object with a specified radius.
 * @param {number} radius - The radius of the circle.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createCircle(radius) {
  const initialX = 0;
  const initialY = radius;

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 1,1 ${radius * 2},0a${radius},${radius} 0 1,1 ${-radius * 2},0`;
    },
    width: radius * 2,
    height: radius * 2,
  };
}

/**
 * Create a half circle object with a specified radius and radial direction.
 * @param {number} radius - The radius of the half circle.
 * @param {'N'|'S'|'W'|'E'} radialDirection - The direction of the half circle's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createHalfCircle(radius, radialDirection) {
  const directionMapping = {
    'N': { initialX: 0, initialY: radius, endX: radius * 2, endY: 0, sweepFlag: 1, width: radius * 2, height: radius },
    'S': { initialX: 0, initialY: 0, endX: radius * 2, endY: 0, sweepFlag: 0, width: radius * 2, height: radius },
    'W': { initialX: radius, initialY: 0, endX: 0, endY: radius * 2, sweepFlag: 0, width: radius, height: radius * 2 },
    'E': { initialX: 0, initialY: 0, endX: 0, endY: radius * 2, sweepFlag: 1, width: radius, height: radius * 2 },
  };

  const { initialX, initialY, endX, endY, sweepFlag, width, height } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 1,${sweepFlag} ${endX},${endY}`;
    },
    width,
    height,
  };
}

/**
 * Create a quarter circle object with a specified radius and radial direction.
 * @param {number} radius - The radius of the quarter circle.
 * @param {'NW'|'NE'|'SW'|'SE'} radialDirection - The direction of the quarter circle's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createQuarterCircle(radius, radialDirection) {
  const directionMapping = {
    'NW': { initialX: 0, initialY: radius, endX: radius, endY: -radius, sweepFlag: 1 },
    'NE': { initialX: 0, initialY: 0, endX: radius, endY: radius, sweepFlag: 1 },
    'SW': { initialX: 0, initialY: 0, endX: radius, endY: radius, sweepFlag: 0 },
    'SE': { initialX: 0, initialY: radius, endX: radius, endY: -radius, sweepFlag: 0 },
  };

  const { initialX, initialY, endX, endY, sweepFlag } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,${sweepFlag} ${endX},${endY}`;
    },
    width: radius,
    height: radius,
  };
}

/**
 * Create an open circle object with a specified radius and opening direction.
 * @param {number} radius - The radius of the open circle.
 * @param {'NW'|'NE'|'SW'|'SE'} openingDirection - The direction of the open circle's opening.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createOpenCircle(radius, openingDirection) {
  const directionMapping = {
    'NW': { initialX: radius, initialY: 0, endX: -radius, endY: radius, sweepFlag: 1 },
    'NE': { initialX: radius * 2, initialY: radius, endX: -radius, endY: -radius, sweepFlag: 1 },
    'SW': { initialX: 0, initialY: radius, endX: radius, endY: radius, sweepFlag: 1 },
    'SE': { initialX: radius, initialY: radius * 2, endX: radius, endY: -radius, sweepFlag: 1 },
  };

  const { initialX, initialY, endX, endY, sweepFlag } = directionMapping[openingDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 1,${sweepFlag} ${endX},${endY}`;
    },
    width: radius * 2,
    height: radius * 2,
  };
}

/**
 * Create an wave object with a specified length and radial direction.
 * @param {number} length - The width (N/S) or height (W/E) of the wave.
 * @param {'N'|'S'|'W'|'E'} radialDirection - The direction of the leftmost (W/E) or uppermost (N/S) half-wave's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createWave(length, radialDirection) {
  const radius = length * 5 / 8 / 2;

  const directionMapping = {
    'N': { initialX: 0, initialY: length / 8, endX: length / 2, endY: 0, firstSweepFlag: 1, secondSweepFlag: 0, width: length, height: length / 4 },
    'S': { initialX: 0, initialY: length / 8, endX: length / 2, endY: 0, firstSweepFlag: 0, secondSweepFlag: 1, width: length, height: length / 4 },
    'W': { initialX: length / 8, initialY: 0, endX: 0, endY: length / 2, firstSweepFlag: 0, secondSweepFlag: 1, width: length / 4, height: length },
    'E': { initialX: length / 8, initialY: 0, endX: 0, endY: length / 2, firstSweepFlag: 1, secondSweepFlag: 0, width: length / 4, height: length },
  };

  const { initialX, initialY, endX, endY, firstSweepFlag, secondSweepFlag, width, height } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,${firstSweepFlag} ${endX},${endY}a${radius},${radius} 0 0,${secondSweepFlag} ${endX},${endY}`;
    },
    width,
    height,
  }
}

/**
 * Create an half-wave arc object with a specified length and radial direction.
 * @param {number} length - The width (N/S) or height (W/E) of the half-wave arc.
 * @param {'N'|'S'|'W'|'E'} radialDirection - The direction of the half-wave's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createHalfWave(length, radialDirection) {
  const radius = length * 5 / 8;

  const directionMapping = {
    'N': { initialX: 0, initialY: length / 4, endX: length, endY: 0, sweepFlag: 1, width: length, height: length / 4 },
    'S': { initialX: 0, initialY: 0, endX: length, endY: 0, sweepFlag: 0, width: length, height: length / 4 },
    'W': { initialX: length / 4, initialY: 0, endX: 0, endY: length, sweepFlag: 0, width: length / 4, height: length },
    'E': { initialX: 0, initialY: 0, endX: 0, endY: length, sweepFlag: 1, width: length / 4, height: length },
  };

  const { initialX, initialY, endX, endY, sweepFlag, width, height } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,${sweepFlag} ${endX},${endY}`;
    },
    width,
    height,
  };
}

/**
 * Create a horizontal quarter-wave arc object with a specified width and radial direction.
 * @param {number} width - The width of the quarter-wave arc.
 * @param {'NW'|'NE'|'SW'|'SE'} radialDirection - The direction of the quarter-wave's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createHorizontalQuarterWave(width, radialDirection) {
  const radius = width * 5 / 4;

  const directionMapping = {
    'NW': { initialX: 0, initialY: width / 2, endX: width, endY: -width / 2, sweepFlag: 1 },
    'NE': { initialX: 0, initialY: 0, endX: width, endY: width / 2, sweepFlag: 1 },
    'SW': { initialX: 0, initialY: 0, endX: width, endY: width / 2, sweepFlag: 0 },
    'SE': { initialX: 0, initialY: width / 2, endX: width, endY: -width / 2, sweepFlag: 0 },
  };

  const { initialX, initialY, endX, endY, sweepFlag } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,${sweepFlag} ${endX},${endY}`;
    },
    width,
    height: width / 2,
  };
}

/**
 * Create a vertical quarter-wave arc object with a specified height and radial direction.
 * @param {number} height - The height of the quarter-wave arc.
 * @param {'NW'|'NE'|'SW'|'SE'} radialDirection - The direction of the quarter-wave's arc.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createVerticalQuarterWave(height, radialDirection) {
  const radius = height * 5 / 4;

  const directionMapping = {
    'NW': { initialX: height / 2, initialY: 0, endX: -height / 2, endY: height, sweepFlag: 0 },
    'NE': { initialX: 0, initialY: 0, endX: height / 2, endY: height, sweepFlag: 1 },
    'SW': { initialX: 0, initialY: 0, endX: height / 2, endY: height, sweepFlag: 0 },
    'SE': { initialX: height / 2, initialY: 0, endX: -height / 2, endY: height, sweepFlag: 1 },
  };

  const { initialX, initialY, endX, endY, sweepFlag } = directionMapping[radialDirection];

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,${sweepFlag} ${endX},${endY}`;
    },
    width: height / 2,
    height,
  };
}

/**
 * Create a vertical line object with a specified length.
 * @param {number} length - The length of the line.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createVerticalLine(length) {
  return {
    getPath: (x, y) => `M${x},${y}v${length}`,
    width: 0,
    height: length,
  };
}

/**
 * Create a horizontal line object with a specified length.
 * @param {number} length - The length of the line.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createHorizontalLine(length) {
  return {
    getPath: (x, y) => `M${x},${y}h${length}`,
    width: length,
    height: 0,
  };
}

/**
 * Create an ascending diagonal line object with a specified width and height.
 * @param {number} width - The horizontal length of the line.
 * @param {number} height - The vertical length of the line.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createAscendingDiagonalLine(width, height) {
  return {
    getPath: (x, y) => `M${x},${y + height}l${width},${-height}`,
    width,
    height,
  };
};

/**
 * Create a descending diagonal line object with a specified width and height.
 * @param {number} width - The horizontal length of the line.
 * @param {number} height - The vertical length of the line.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createDescendingDiagonalLine(width, height) {
  return {
    getPath: (x, y) => `M${x},${y}l${width},${height}`,
    width,
    height,
  };
};

/** 
 * Create a diagonal line between a circle and a corner of a square in a specified direction, for a square/circle with a specified width/height/diameter.
 * @param {number} size - The width/height/diameter of the circle/square.
 * @param {'NW'|'NE'|'SW'|'SE'} direction - The direction of the diagonal line.
 * @returns {Object} - An object with a getPath method, width, and height properties.
*/
export function createDiagonalLineOutsideCircle(size, direction) {
  const radius = size / 2;
  const lineWidth = radius * (1 - 0.70711);
  const lineHeight = lineWidth;

  const directionMapping = {
    'NW': { initialX: 0, initialY: 0, endX: lineWidth, endY: lineHeight },
    'NE': { initialX: size - lineWidth, initialY: lineHeight, endX: lineWidth, endY: -lineHeight },
    'SW': { initialX: 0, initialY: size, endX: lineWidth, endY: -lineHeight },
    'SE': { initialX: size - lineWidth, initialY: size - lineHeight, endX: lineWidth, endY: lineHeight },
  };

  const { initialX, initialY, endX, endY } = directionMapping[direction];

  return {
    //x and y are in this case the coordinates of the square that the diagonal lines are related to. Also width and height relates to the square.
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}l${endX},${endY}`;
    },
    width: size,
    height: size,
  };
}

/** 
 * Create an ascending diagonal line inside a circle with a specified radius.
 * @param {number} radius - The radius of the circle.
 * @returns {Object} - An object with a getPath method, width, and height properties.
*/
export function createAscendingDiagonalLineInsideCircle(radius) {
  const lineWidth = radius * 2 * 0.70711;
  const lineHeight = lineWidth;

  return {
    //x and y are in this case the coordinates of the bounding box of the circle that the diagonal lines are related to. Also width and height relates to the square.
    getPath: (x, y) => {
      const startX = radius - lineWidth / 2 + x;
      const startY = radius + lineHeight / 2 + y;
      const endX = lineWidth;
      const endY = -lineHeight;
      return `M${startX},${startY}l${endX},${endY}`;
    },
    width: radius * 2,
    height: radius * 2,
  };
}

/** 
 * Create a descending diagonal line inside a circle with a specified radius.
 * @param {number} radius - The radius of the circle.
 * @returns {Object} - An object with a getPath method, width, and height properties.
*/
export function createDescendingDiagonalLineInsideCircle(radius) {
  const lineWidth = radius * 2 * 0.70711;
  const lineHeight = lineWidth;

  return {
    //x and y are in this case the coordinates of the bounding box of the circle that the diagonal lines are related to. Also width and height relates to the square.
    getPath: (x, y) => {
      const startX = radius - lineWidth / 2 + x;
      const startY = radius - lineHeight / 2 + y;
      const endX = lineWidth;
      const endY = lineHeight;
      return `M${startX},${startY}l${endX},${endY}`;
    },
    width: radius * 2,
    height: radius * 2,
  };
}

/** 
 * Create a heart with a specified size.
 * @param {number} size - The size of the heart.
 * @returns {Object} - An object with a getPath method, width, and height properties.
*/
export function createHeart(size) {
  const radius = size / 4

  return {
    getPath: (x, y) => `M${x},${y + radius}a${radius},${radius} 0 1,1 ${radius * 2},0a${radius},${radius} 0 1,1 ${radius * 2},0q0,${size * 3 / 8} ${-(size / 2)},${size * 3 / 4}q${-(size / 2)},${-(size * 3 / 8)} ${-(size / 2)},${-(size * 3 / 4)}`,
    width: size,
    height: size,
  };
}

/** 
 * Create an ear with a specified height.
 * @param {number} height - The height of the ear.
 * @returns {Object} - An object with a getPath method, width, and height properties.
*/
export function createEar(height) {
  const radius = height / 4
  
  return {
    getPath: (x, y) => `M${x},${y + radius}a${radius},${radius} 0 1,1 ${radius * 2},0q0,${height * 3 / 8} ${-(height / 2)},${height * 3 / 4}`,
    width: height / 2,
    height,
  };
}

/** 
 * Create a dot.
 * @param {number} defaultBaseStrokeWidth - The default stroke width to use with returned functions. The stroke-width of a normal line in the SVG, used to derive other dimensions of the dot.
 * @param {number} defaultExtraDotWidth - The default extra dot width do use with returned functions. The outer diameter of the dot is the normal stroke-width + extra-dot-width.
 * @returns {Object} - An object with a getDotData method, getDotSVGString method, width, and height properties.
*/
export function createDot(defaultBaseStrokeWidth = 0.5, defaultExtraDotWidth = 0.333) {
  const dot = {
    /**
     * Create an object with SVG string parts closePath, openPath, dotPath and openPath
     * so that joining these can be used along with other shapes' getPath functions,
     * based on specified strokeWidth and extraDotWidth.
     * @param {number} x - The x-coordinate of the dot's position.
     * @param {number} y - The y-coordinate of the dot's position.
     * @param {number} baseStrokeWidth - The stroke-width of a normal line in the SVG, used to derive other dimensions of the dot.
     * @param {number} extraDotWidth - A dot's outer diameter is the normal line stroke-width + extraDotWidth.
     * @returns {Object} - An object with closePath, openPath, dotPath and openPath properties.
     */
    getDotData: (x, y, settings = { baseStrokeWidth: defaultBaseStrokeWidth, extraDotWidth: defaultExtraDotWidth }) => {
      const dotStrokeWidth = (settings.baseStrokeWidth + settings.extraDotWidth) / 2;
      const dotStrokeRadius = dotStrokeWidth / 2;
      return {
        closePath: `"></path>`,
        openDotPath: `<path stroke-width="${dotStrokeWidth}" d="`,
        dotPath: `M${x - dotStrokeRadius},${y}a${dotStrokeRadius},${dotStrokeRadius} 0 1,1 ${dotStrokeRadius * 2},0a${dotStrokeRadius},${dotStrokeRadius} 0 1,1 ${-dotStrokeRadius * 2},0`,
        openPath: `<path d="`
      };
    },
    width: 0,
    height: 0,
  };

  /**
   * Create an SVG string with the components closePath, openDotPath, dotPath and openPath
   * so that joining these can be used along with other shapes' getPath functions,
   * based on specified baseStrokeWidth and extraDotWidth.
   * @param {number} x - The x-coordinate of the dot's position.
   * @param {number} y - The y-coordinate of the dot's position.
   * @param {number} baseStrokeWidth - The stroke-width of a normal line in the SVG, used to derive other dimensions of the dot.
   * @param {number} extraDotWidth - A dot's outer diameter is the normal line stroke-width + extraDotWidth.
   * @returns {Object} - An object with closePath, openPath, dotPath and openPath properties.
   */
  dot.getPath = (x, y, settings = { baseStrokeWidth: defaultBaseStrokeWidth, extraDotWidth: defaultExtraDotWidth }) => {
    const { closePath, openDotPath, dotPath, openPath } = dot.getDotData(x, y, settings);
    return `${closePath}${openDotPath}${dotPath}${closePath}${openPath}`;
  };

  return dot;
}

/** 
 * Create a comma.
 * @param {number} defaultBaseStrokeWidth - The default stroke width to use with returned functions. The stroke-width of a normal line in the SVG, used to derive other dimensions of the comma.
 * @param {number} defaultExtraDotWidth - The default extra dot width to use with returned functions. The outer diameter of the dot (which the comma is partly made of) is the normal stroke-width + the extra dot width.
 * @returns {Object} - An object with a getCommaData method, getCommaSVGString method, width, and height properties.
*/
export function createComma(defaultBaseStrokeWidth = 0.5, defaultExtraDotWidth = 0.333) {
  const comma = {
    /**
     * Create an object with SVG string parts closePath, openDotPath, dotPath, openCommaPath, commaPath and openPath so that joining these can be used along with other shapes' getPath functions, based on specified strokeWidth and extraDotWidth.
     * @param {number} x - The x-coordinate of the dot's position.
     * @param {number} y - The y-coordinate of the dot's position.
     * @param {number} baseStrokeWidth - The stroke-width of a normal line in the SVG, used to derive other dimensions of the comma.
     * @param {number} extraDotWidth - A dot's outer diameter is the normal line stroke-width + extraDotWidth.
     * @returns {Object} - An object with closePath, openDotPath, dotPath, commaPath and openPath properties.
     */
    getCommaData: (x, y, settings = { baseStrokeWidth: defaultBaseStrokeWidth, extraDotWidth: defaultExtraDotWidth }) => {
      const dotStrokeWidth = (settings.baseStrokeWidth + settings.extraDotWidth) / 2;
      const dotStrokeRadius = dotStrokeWidth / 2;
      const commaStrokeWidth = dotStrokeWidth * 2 / 3;
      const commaStartX = commaStrokeWidth + x;
      const commaStartY = y;
      const commaEndX = commaStrokeWidth * -2;
      const commaEndY = commaStrokeWidth * 4;
      const commaQX = commaStrokeWidth / 4
      const commaQY = commaStrokeWidth * 2.5;
      return {
        closePath: `"></path>`,
        openDotPath: `<path stroke-width="${dotStrokeWidth}" d="`,
        dotPath: `M${x - dotStrokeRadius},${y}a${dotStrokeRadius},${dotStrokeRadius} 0 1,1 ${dotStrokeRadius * 2},0a${dotStrokeRadius},${dotStrokeRadius} 0 1,1 ${-dotStrokeRadius * 2},0`,
        openCommaPath: `<path stroke-width="${commaStrokeWidth}" d="`,
        commaPath: `M${commaStartX},${commaStartY}q${commaQX},${commaQY} ${commaEndX},${commaEndY}`,
        openPath: `<path d="`
      };
    },
    width: 0,
    height: (defaultBaseStrokeWidth + defaultExtraDotWidth) * 4 / 3,
  };

  /**
   * Create an SVG string with the components closePath, openDotPath, dotPath, openCommaPath, commaPath and openPath
   * so that joining these can be used along with other elements' getPath functions,
   * based on specified baseStrokeWidth and extraDotWidth.
   * @param {number} x - The x-coordinate of the dot's position.
   * @param {number} y - The y-coordinate of the dot's position.
   * @param {number} baseStrokeWidth - The stroke-width of a normal line in the SVG, used to derive other dimensions of the comma.
   * @param {number} extraDotWidth - A dot's outer diameter is the normal line stroke-width + extraDotWidth.
   * @returns {Object} - An object with closePath, openDotPath, dotPath, openCommaPath, commaPath and openPath properties.
   */
  comma.getPath = (x, y, settings = { baseStrokeWidth: defaultBaseStrokeWidth, extraDotWidth: defaultExtraDotWidth }) => {
    const { closePath, openDotPath, dotPath, openCommaPath, commaPath, openPath } = comma.getCommaData(x, y, settings);
    return `${closePath}${openDotPath}${dotPath}${closePath}${openCommaPath}${commaPath}${closePath}${openPath}`;
  };

  return comma;
}

/**
 * Create a fiber with a specified height.
 * @param {number} height - The height of the fiber.
 * @returns {Object} - An object with a getPath method, width, and height properties.
 */
export function createFiber(height) {
  const radius = height * 5 / 8;
  const initialX = 0;
  const initialY = height;
  const midX = height / 4;
  const midY = -height / 2;
  const endX = height / 4;
  const endY = -height / 2;

  return {
    getPath: (x, y) => {
      const startX = initialX + x;
      const startY = initialY + y;
      return `M${startX},${startY}a${radius},${radius} 0 0,1 ${midX},${midY}a${radius},${radius} 0 0,0 ${endX},${endY}`;
    },
    width: height / 2,
    height,
  };
}

/**
 * Creates an external glyph object based on the given glyph identifier.
 *
 * @param {string} glyph - The glyph identifier (expects format like "Xa" where "a" is the character).
 * @return {object} An object with a getPath method, width, kerningRules, glyph and isExternalGlyph properties.
 */
export function createExternalGlyph(glyph) {
  const aObj = alphabetData[`X${glyph}`];
  const adjustX = -aObj.leftSideBearing;
  const adjustY = -0.015; //revisit this
  const closePath = `"></path>`;
  const glyphPath = aObj?.getPath() || "";
  const openPath = `<path d="`;

  const round = (num) => parseFloat(num.toFixed(4));

  return {
    getPath: (x, y) => {
      const openGlyphPath = `<path stroke="none" fill="#000000" transform="translate(${round(x+adjustX)},${round(y+adjustY)})" d="`;
      return `${closePath}${openGlyphPath}${glyphPath}${closePath}${openPath}`;
    },
    width: aObj.width || 0,
    // Indicates that this "shape" is an external, non-Bliss glyph.
    isExternalGlyph: true,
    // The glyph represented.
    glyph: aObj.glyph,
    // The kerning rules for the glyph
    kerningRules: {...aObj.kerningRules}
  }
}
