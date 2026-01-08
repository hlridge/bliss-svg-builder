/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Bliss Prefix Modifiers
 *
 * Defines characters and character sequences that modify words but do not
 * serve as the head glyph (the character that receives grammatical 
 * indicators), even though they appear to the left in a Bliss word.
 *
 * When determining which character in a word should receive indicators,
 * these modifiers are skipped in favor of the next character.
 * 
 * This list contains some of the most common ones. Despite this list,
 * which can change from time to time, it's always recommended to annotate
 * the head glyph whenever it's not the leftmost glyph.
 * 
 * Examples:
 * 'B486/B1108^' (narrowness)
 * 'B486/B1108;B86^' (narrow)
 */

export const blissModifiers = [
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
