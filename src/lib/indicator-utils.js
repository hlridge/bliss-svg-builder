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
