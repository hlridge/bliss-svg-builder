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
 * Priority hierarchy for head glyph selection (highest to lowest):
 * 1. Non-exclusions - always head if present
 * 2. Regular exclusions - head if no non-exclusions available
 * 3. Low-priority exclusions (B401, B699) - head only if alone or with same/lower priority
 * 4. Absolute never-head (B233) - can NEVER be head (structural marker like quotation marks)
 *
 * When prefix modifiers are used, it's recommended to mark the head glyph
 * explicitly with ^ to avoid ambiguity.
 *
 * Examples:
 * 'B486/B1108^' (narrowness)
 * 'B486/B1108;B86^' (narrow)
 */

/**
 * Absolute never-head codes.
 * These can NEVER be head glyphs, even as a fallback.
 * They are purely structural markers (like quotation marks).
 */
export const absoluteNeverHead = [
  'B233', // combine marker (structural, like quotation mark)
];

/**
 * Low-priority exclusions.
 * These are skipped as prefixes like regular exclusions, but can only be head
 * when alone or together with other low-priority codes (no regular exclusions present).
 */
export const lowPriorityExclusions = [
  'B401', // exclamatory - when alone or with other B401s, can take indicator
  'B699', // interrogative - when alone or with other B699s, can take indicator
];

/**
 * Conditional exceptions.
 * Format: [excludedCode, notExcludedWhenFollowedBy]
 * The excludedCode is NOT treated as an exclusion when immediately followed by
 * the specified code.
 */
export const conditionalExceptions = [
  ['B10', 'B4'], // B10 (one) is NOT excluded when followed by B4
];

/**
 * Main exclusion list.
 * Characters and sequences to skip when finding the head glyph.
 * Includes all categories (regular, low-priority, and never-head).
 */
export const blissHeadGlyphExclusions = [
  // Structural markers (absolute never-head)
  'B233', // combine marker

  // Pragmatic lexical markers (low-priority)
  'B401', // exclamatory when used as a prefix, otherwise a specifier
  'B699', // interrogative when used as a prefix, otherwise a specifier

  // Scalar degree operators
  'B937', // more (comparative)
  'B968', // most (superlative)
  'B6438', // less (comparative)
  'B6321', // least (superlative)

  // Identity-affecting operators
  'B449/B401', // not (logical negation)
  'B486', // opposite to (antonymy)

  // Concept-transforming operators
  'B1060/B578/B608/B292', // rhymes with
  'B1060/B578/B303', // looks similar to
  'B1060/B578/B608', // sounds similar to
  'B1060/B578/B374', // feels similar to
  'B1060/B578/B473', // smells similar to
  'B1060/B578/B642', // tastes similar to
  'B1060/B578', // similar to
  'B578/B303', // looks like
  'B578/B608', // sounds like
  'B578/B374', // feels like
  'B578/B473', // smells like
  'B578/B642', // tastes like
  'B348', // generalization of
  'B444', // metaphor for

  // Relational operators
  'B449', // without (privative negation)
  'B578', // same as
  'B502/B167', // part of Blissymbol
  'B502', // part of
  'B102', // about
  'B104', // across
  'B109', // after
  'B111', // against
  'B120/B120', // along with
  'B162/B368', // among
  'B134', // around
  'B135', // at
  'B158', // before
  'B162', // between
  'B195', // by
  'B482', // on
  'B491', // out of (forward)
  'B492', // out of (downward)
  'B977', // out of (upward)
  'B976', // out of (backward)
  'B402', // into (forward)
  'B1124', // into (downward)
  'B1125', // into (upward)
  'B1123', // into (backward)
  'B490', // outside
  'B398', // inside
  'B493', // over, above
  'B676', // under, below
  'B1102', // under (ground level)
  'B331', // instead of
  'B332', // for the purpose of
  'B337', // from
  'B657', // to, toward
  'B653', // through
  'B677', // until
  'B160', // belongs to

  // Determiners
  'B100', // a, an (indefinite)
  'B647', // the (definite)

  // Quantifiers
  'B368/B368/B368', // many/much x3 (city)
  'B368/B368', // many/much x2 (ocean, town)
  'B368', // many/much (lake, village)
  // pending: few (not yet in bliss-glyph-data.js)
  'B117', // all
  'B11/B117', // both
  'B10/B117', // each/every
  'B286', // either
  'B449/B286', // neither
  'B951', // half
  'B962', // quarter
  'B1151', // one third
  'B1152', // two thirds
  'B1153', // three quarters
  'B559/B11', // several
  'B9', // zero
  'B10', // one (note: NOT excluded when followed by B4 - see conditionalExceptions)
  'B11', // two
  'B12', // three
  'B13', // four
  'B14', // five
  'B15', // six
  'B16', // seven
  'B17', // eight
  'B18', // nine
];

/**
 * Head-scan code for one glyph: the value fed per-glyph to resolveHeadIndex.
 * A head-exclusion code (e.g. B486 "opposite-to") excludes only when it stands
 * alone as a single glyph; a fused multi-part character is a character, not a
 * leading operator, so it is non-excludable (returns undefined). A named glyph
 * (custom code or single built-in) is classified by its own identity code.
 * Shared by the builder render path and the element snapshot so the two
 * head-resolution sites cannot drift apart.
 *
 * @param {string|undefined} identityCode - the glyph's own code (glyphCode / codeName), if any
 * @param {number} partCount - number of parts composing the glyph
 * @param {string|undefined} firstPartCode - codeName of the first part
 * @returns {string|undefined} the head-scan code, or undefined when non-excludable
 */
export const headScanCode = (identityCode, partCount, firstPartCode) =>
  identityCode || (partCount > 1 ? undefined : firstPartCode);

/**
 * Resolve which glyph index of a word is the fallback head, given each
 * glyph's head-scan code (its base character code, or a custom glyph's own
 * identity). Skips leading exclusion patterns (single- and multi-code, plus
 * the conditional B10/B4 exception); when every code is an exclusion, picks by
 * priority tier (regular > low-priority > absolute-never-head). This is the
 * single source of truth for fallback head selection, shared by the parser
 * (parse-time crowning) and the builder/element layers (query-time
 * resolution), so an explicit `^`/designation stays the only persistent
 * override.
 *
 * @param {string[]} headCodes - one head-scan code per glyph, in word order
 * @returns {number} index of the fallback head (0 for an empty list)
 */
export const resolveHeadIndex = (headCodes) => {
  // Conditional exception (e.g. B10/B4): an otherwise-excluded code is not
  // excluded when immediately followed by its paired code.
  const isExcluded = (code, index) => {
    for (const [excl, notWhenFollowedBy] of conditionalExceptions) {
      if (code === excl && index + 1 < headCodes.length && headCodes[index + 1] === notWhenFollowedBy) {
        return false;
      }
    }
    return true;
  };

  // Skip leading exclusion patterns from the start.
  let startIndex = 0;
  let foundMatch = true;
  while (foundMatch && startIndex < headCodes.length) {
    foundMatch = false;
    for (const pattern of blissHeadGlyphExclusions) {
      const codes = pattern.split('/');
      if (startIndex + codes.length <= headCodes.length) {
        let matches = true;
        for (let i = 0; i < codes.length; i++) {
          const code = headCodes[startIndex + i];
          if (code !== codes[i] || (codes.length === 1 && !isExcluded(code, startIndex + i))) {
            matches = false;
            break;
          }
        }
        if (matches) {
          startIndex += codes.length;
          foundMatch = true;
          break;
        }
      }
    }
  }

  if (startIndex < headCodes.length) return startIndex;

  // All exclusions: find best head by priority (regular > low-priority > never-head).
  let best = 0;
  let bestPriority = absoluteNeverHead.includes(headCodes[0]) ? 0 : lowPriorityExclusions.includes(headCodes[0]) ? 1 : 2;
  for (let i = 1; i < headCodes.length; i++) {
    const code = headCodes[i];
    const priority = absoluteNeverHead.includes(code) ? 0 : lowPriorityExclusions.includes(code) ? 1 : 2;
    if (priority > bestPriority || (priority === bestPriority && priority > 0)) {
      best = i;
      bestPriority = priority;
    }
  }
  return best;
};
