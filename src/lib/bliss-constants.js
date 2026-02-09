/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Known option keys (kebab-case) that are explicitly processed in #processOptions().
 * Any option key NOT in this set will be passed through as-is (for unknown SVG attributes like stroke-dasharray).
 */
export const KNOWN_OPTION_KEYS = new Set([
  'stroke-width', 'dot-extra-width', 'char-space', 'word-space', 'external-glyph-space',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'min-width', 'centered', 'freestyle',
  'crop', 'crop-top', 'crop-bottom', 'crop-left', 'crop-right',
  'grid', 'grid-color', 'grid-major-color', 'grid-medium-color', 'grid-minor-color',
  'grid-sky-color', 'grid-earth-color',
  'grid-stroke-width', 'grid-major-stroke-width', 'grid-medium-stroke-width',
  'grid-minor-stroke-width', 'grid-sky-stroke-width', 'grid-earth-stroke-width',
  'color', 'background', 'text', 'svg-desc', 'svg-title', 'svg-height'
]);

/**
 * Returns false for event handler attribute names (on*) to prevent XSS.
 */
export const isSafeAttributeName = (name) => !/^on/i.test(name);

/**
 * Escapes HTML special characters to prevent XSS in SVG output.
 */
export const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Options that should NOT be rendered as SVG attributes.
 *
 * Builder-level options: handled by SVG construction logic (margins, grid, cropping, etc.)
 * Element-level positioning: handled by element positioning logic (x, y, kerning)
 * Internal calculation options: used for calculations but not rendered (dotExtraWidth)
 *
 * Note: strokeWidth is NOT here - it's a multi-level option like 'color'
 * that can appear at both global and element levels as SVG attributes.
 */
export const INTERNAL_OPTIONS = new Set([
  // Grid options (builder-level only)
  'grid',
  'gridSkyColor',
  'gridEarthColor',
  'gridMajorColor',
  'gridMediumColor',
  'gridMinorColor',
  'gridSkyStrokeWidth',
  'gridEarthStrokeWidth',
  'gridMajorStrokeWidth',
  'gridMediumStrokeWidth',
  'gridMinorStrokeWidth',

  // Cropping and margins (builder-level only)
  'cropTop',
  'cropBottom',
  'cropLeft',
  'cropRight',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',

  // Internal calculation options
  'dotExtraWidth',

  // Builder-level settings
  'background',
  'charSpace',
  'wordSpace',
  'punctuationSpace',
  'externalGlyphSpace',
  'minWidth',
  'centered',
  'text',
  'svgDesc',
  'svgTitle',
  'svgHeight',

  // Element positioning (handled by positioning logic, not SVG attributes)
  'x',
  'y',
  'relativeKerning',
  'absoluteKerning'
]);
