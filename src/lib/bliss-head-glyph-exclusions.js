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
  'B233', // combine marker
  'B937', // more (comparative)
  'B968', // most (superlative)
  'B368/B368/B368', // many/much x3 (city)
  'B368/B368', // many/much x2 (ocean, town)
  'B368', // many/much (lake, village)
  'B1060/B578/B303', // looks similar to
  'B1060/B578/B608', // sounds similar to
  'B1060/B578', // similar to
  'B578/B303', // looks like
  'B578/B608', // sounds like
  'B449/B401', // not (logical negation)
  'B449', // without (privative negation)
  'B486', // opposite to (antonymy)
  'B502', // part of
];
