/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Bliss Modifiers
 *
 * Defines characters and character sequences that modify words but do not
 * serve as the head glyph (the character that receives grammatical indicators).
 *
 * When determining which character in a word should receive indicators,
 * these modifiers are skipped in favor of the next character.
 */

export const blissModifiers = [
  'B486',
  'B1060/B578/B303',
];
