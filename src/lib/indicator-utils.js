/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { SEMANTIC_INDICATOR_ROOTS } from './bliss-constants.js';

/**
 * Get semantic indicator root from a list of indicator codes.
 * Returns the root B-code (e.g. 'B97') or null.
 */
export function getSemanticRoot(indicatorCodes, definitions) {
  for (const ind of indicatorCodes) {
    const bareInd = ind.split(':')[0];
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
  return indicatorCodes.some(ind => definitions[ind.split(':')[0]]?.semanticIndicator);
}

/**
 * Filter codes to only include real indicators (isIndicator: true).
 * Non-indicator codes passed in indicator position are silently dropped.
 */
export function filterToIndicators(codes, definitions) {
  return codes.filter(code => definitions[code.split(':')[0]]?.isIndicator === true);
}

/**
 * Determine whether auto-preserved semantic root goes before or after new indicators.
 * Default: semantic first (nominal). If ALL non-semantic new indicators are verbal or
 * adjectival, semantic goes last (the word is being used as a verb/adjective).
 */
export function semanticGoesLast(newIndicatorCodes, definitions) {
  const nonSemantic = newIndicatorCodes.filter(ind =>
    !definitions[ind.split(':')[0]]?.semanticIndicator);
  return nonSemantic.length > 0 &&
    nonSemantic.every(ind => {
      const role = definitions[ind.split(':')[0]]?.indicatorRole;
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
