/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Bliss Head Glyph Exclusions
 *
 * Characters and sequences to skip when finding the head glyph (the character
 * that receives grammatical indicators).
 *
 * Includes:
 * - Prefix modifiers: opposite of, part of, etc.
 * - Combine markers: quotation marks, structural joining characters
 *
 * When prefix modifiers are used, it's recommended to mark the head glyph
 * explicitly with ^ to avoid ambiguity.
 *
 * Examples:
 * 'B486/B1108^' (narrowness)
 * 'B486/B1108;B86^' (narrow)
 */

export const blissHeadGlyphExclusions = [
  'B233',
  'B1060/B578/B303',
  'B1060/B578/B608',
  'B1060/B578',
  'B578/B303',
  'B578/B608',
  'B449/B401',
  'B449',
  'B502',
  'B486',
];
