/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { SEMANTIC_INDICATOR_ROOTS } from './bliss-constants.js';

/**
 * Extract the bare B-code from a code string that may include
 * option prefixes (e.g. '[color=red]>B81') and position suffixes (':0,4').
 */
export function getBareCode(str) {
  const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
  if (partLevelMatch) return partLevelMatch[2].split(':')[0].split(';')[0];
  const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
  const code = optionsMatch ? str.slice(optionsMatch[1].length) : str;
  return code.split(':')[0].split(';')[0];
}

/**
 * Get semantic indicator root from a list of indicator codes.
 * Returns the root B-code (e.g. 'B97') or null.
 */
export function getSemanticRoot(indicatorCodes, definitions) {
  for (const ind of indicatorCodes) {
    const bareInd = getBareCode(ind);
    const indDef = definitions[bareInd];
    if (indDef?.semanticIndicator) {
      return SEMANTIC_INDICATOR_ROOTS[indDef.semanticIndicator];
    }
  }
  return null;
}

/**
 * Check if any indicator in the list carries a semanticIndicator flag.
 */
export function hasSemantic(indicatorCodes, definitions) {
  return indicatorCodes.some(ind => definitions[getBareCode(ind)]?.semanticIndicator);
}

/**
 * Filter codes to only include real indicators (isIndicator: true).
 * Non-indicator codes passed in indicator position are silently dropped.
 */
export function filterToIndicators(codes, definitions) {
  return codes.filter(code => definitions[getBareCode(code)]?.isIndicator === true);
}

/**
 * Determine whether auto-preserved semantic root goes before or after new indicators.
 * Default: semantic first (nominal). If ALL non-semantic new indicators are verbal or
 * adjectival, semantic goes last (the word is being used as a verb/adjective).
 */
export function semanticGoesLast(newIndicatorCodes, definitions) {
  const nonSemantic = newIndicatorCodes.filter(ind =>
    !definitions[getBareCode(ind)]?.semanticIndicator);
  return nonSemantic.length > 0 &&
    nonSemantic.every(ind => {
      const role = definitions[getBareCode(ind)]?.indicatorRole;
      return role === 'verbal' || role === 'adjectival';
    });
}

/**
 * Build the indicator list with semantic root in the correct position.
 * Returns an array (not a joined string) to preserve position coordinates
 * on individual codes (e.g. 'B86:0,4').
 */
export function buildWithSemantic(semanticRoot, newInds, definitions) {
  return semanticGoesLast(newInds, definitions)
    ? [...newInds, semanticRoot]
    : [semanticRoot, ...newInds];
}

/**
 * Resolve the final indicator code list from existing indicators, the
 * requested new codes, and the stripSemantic flag. Shared decision logic
 * for both the DSL `;;` parser path and the character-level mutation path:
 *
 * - Preserve the existing semantic root (unless stripSemantic) and place it
 *   relative to the new indicators per the placement rule.
 * - Replace-all: the new indicators replace any existing grammatical ones.
 * - Never double a semantic root the new codes already carry.
 * - Drop non-indicator codes; an empty result keeps the root alone (or [] if
 *   there is no root to keep).
 *
 * Returns an array of code strings (position coordinates preserved).
 */
export function resolveIndicatorCodes(existingIndicatorCodes, newCodes, { stripSemantic } = {}, definitions) {
  const semanticRoot = !stripSemantic ? getSemanticRoot(existingIndicatorCodes, definitions) : null;
  const validNew = filterToIndicators(newCodes, definitions);
  if (validNew.length > 0) {
    return semanticRoot && !hasSemantic(validNew, definitions)
      ? buildWithSemantic(semanticRoot, validNew, definitions)
      : validNew;
  }
  return semanticRoot ? [semanticRoot] : [];
}

/**
 * Resolve a word-level indicator overlay onto a head glyph's parts at decode
 * time. The single merge used by render (#rebuild) and, under flatten, by
 * serialize, so the DSL `;;` path and the API word-level path cannot drift.
 *
 * Splits the head's parts into base parts and trailing indicator parts, runs
 * resolveIndicatorCodes against the overlay (replace-all with semantic-root
 * preservation), and returns a new array of [...baseParts, ...resolved] with
 * each resolved indicator appended strictly after every base part and tagged
 * `_indicatorOrigin: 'word'`. The input glyph is not mutated. A head whose
 * parts hold a non-indicator after an indicator is returned unchanged.
 *
 * @param {{parts: Array}} headGlyph - the head glyph node (has .parts)
 * @param {{codes: string[], stripSemantic?: boolean}} overlay
 * @param {Object} definitions
 * @param {(code: string) => Object} parse - parser used to build part nodes
 * @returns {Array} the resolved parts array
 */
export function mergeWordIndicatorsOntoHead(headGlyph, overlay, definitions, parse) {
  const parts = headGlyph?.parts ?? [];
  const firstIndicatorIndex = parts.findIndex(p => p.isIndicator === true);
  const baseParts = firstIndicatorIndex === -1 ? parts.slice() : parts.slice(0, firstIndicatorIndex);
  const existingIndicatorParts = firstIndicatorIndex === -1 ? [] : parts.slice(firstIndicatorIndex);

  // A non-indicator after the first indicator is not a clean base+indicator
  // shape; leave the glyph untouched rather than guess where the boundary is.
  if (!existingIndicatorParts.every(p => p.isIndicator === true)) return parts.slice();

  const existingIndicatorCodes = existingIndicatorParts.map(p => p.codeName);
  const finalCodes = resolveIndicatorCodes(
    existingIndicatorCodes,
    overlay?.codes ?? [],
    { stripSemantic: overlay?.stripSemantic === true },
    definitions
  );

  const indicatorParts = [];
  for (const code of finalCodes) {
    const node = parse(code)?.groups?.[0]?.glyphs?.[0]?.parts?.[0];
    if (node) indicatorParts.push({ ...node, _indicatorOrigin: 'word' });
  }

  return [...baseParts, ...indicatorParts];
}
