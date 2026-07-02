/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { OPTION_BRACKET_CONTENT, SEMANTIC_INDICATOR_ROOTS } from './bliss-constants.js';

// Quote-aware option-prefix matchers: overlay codes arrive RESTORED, so a
// quoted value may carry ']'/';'/':' and a lazy `\[.*?\]` would cut inside
// it. Group 2 is the shared grammar's internal atom; group 3 the remainder.
const PART_OPTION_PREFIX = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])>(.+)$`);
const CHAR_OPTION_PREFIX = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)`);

/**
 * Extract the bare B-code from a code string that may include
 * option prefixes (e.g. '[color=red]>B81') and position suffixes (':0,4').
 */
export function getBareCode(str) {
  const partLevelMatch = str.match(PART_OPTION_PREFIX);
  if (partLevelMatch) return partLevelMatch[3].split(':')[0].split(';')[0];
  const optionsMatch = str.match(CHAR_OPTION_PREFIX);
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
 * Partition a list of `;;` word-level indicator codes into the ones that are
 * real indicators (kept) and the ones that must be rejected. A word-level
 * indicator must BE an indicator (isIndicator: true); a recognized non-indicator
 * (a real base such as B291) is rejected as `'non-indicator'`, an unrecognized
 * code as `'unknown'`. Shared by the DSL `;;` parser path and the API
 * `applyIndicators` overlay path so the two classify a `;;` code identically
 * (DSL/API parity). The kept-code test mirrors `filterToIndicators`, so a code
 * accepted here always survives the later resolve.
 *
 * @param {string[]} codes - raw `;;` codes (may carry options/coords)
 * @param {Object} definitions
 * @returns {{ valid: string[], rejected: Array<{ code: string, reason: 'non-indicator'|'unknown' }> }}
 *   `valid` preserves each code verbatim (options/coords intact); each rejected
 *   `code` is the bare offending code (options/coords stripped).
 */
export function partitionWordIndicators(codes, definitions) {
  const valid = [];
  const rejected = [];
  for (const code of codes) {
    const bare = getBareCode(code);
    // Own-property check: a normal definitions object inherits Object.prototype
    // members (toString, constructor, __proto__), so a plain `definitions[bare]`
    // lookup would classify those names as recognized non-indicators. Only an
    // OWN key is a real registered code; everything else is unknown.
    const definition = Object.prototype.hasOwnProperty.call(definitions, bare)
      ? definitions[bare]
      : undefined;
    if (definition?.isIndicator === true) {
      valid.push(code);
    } else {
      rejected.push({ code: bare, reason: definition ? 'non-indicator' : 'unknown' });
    }
  }
  return { valid, rejected };
}

/**
 * Resolve a `;;` word-level indicator overlay from raw codes plus a stripSemantic
 * flag: validate each code (a `;;` code must BE an indicator) and apply the store
 * decision. The single source of truth shared by the DSL parser, the API
 * (`applyIndicators` overlay), and the object constructor, so all three input
 * surfaces classify and store a `;;` overlay identically (DSL/API/object parity).
 *
 * Each rejected code is reported via `onReject({ code, reason })` so the caller
 * emits a surface-appropriate warning (parser `parseWarnings` vs the API mutation
 * channel vs the object `_parseWarnings` channel).
 *
 * Store decision: return an overlay only when it carries meaning -- a surviving
 * indicator, an explicit strip, or a deliberately-empty input (`rawCodes` empty,
 * a bare `;;` clear). An input whose codes were ALL dropped as invalid (and no
 * strip) returns null: the overlay is discarded, not rewritten as an empty one.
 *
 * @param {string[]} rawCodes
 * @param {boolean} stripSemantic
 * @param {Object} definitions
 * @param {(rejected: { code: string, reason: 'non-indicator'|'unknown' }) => void} [onReject]
 * @returns {{ codes: string[], stripSemantic: boolean } | null}
 */
export function resolveWordIndicatorOverlay(rawCodes, stripSemantic, definitions, onReject) {
  const { valid, rejected } = partitionWordIndicators(rawCodes, definitions);
  if (onReject) for (const r of rejected) onReject(r);
  if (valid.length > 0 || stripSemantic || rawCodes.length === 0) {
    return { codes: valid, stripSemantic };
  }
  return null;
}

/**
 * Split a `;`-separated indicator code list on TOP-LEVEL semicolons only, leaving
 * a `;` inside an option block (`[color=red;stroke-width=2]>B81`) intact. The DSL
 * parser protects option-block semicolons with placeholders before splitting; the
 * API receives raw strings, so it needs this bracket-aware split to tokenize a
 * multi-key-option indicator the same way (DSL/API parity). Trims and drops empty
 * segments, matching the prior naive `code.split(';').map(trim).filter(Boolean)`.
 */
export function splitTopLevelSemicolons(code) {
  const result = [];
  let depth = 0;
  let current = '';
  for (const ch of code) {
    if (ch === '[') depth++;
    else if (ch === ']') { if (depth > 0) depth--; }
    if (ch === ';' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map(s => s.trim()).filter(Boolean);
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
 * Classify an indicator code's kind for introspection: 'semantic' when its
 * definition carries a semanticIndicator flag (e.g. THING), 'grammatical'
 * otherwise, or null when the definition cannot be resolved. The caller gates
 * on the node's `isIndicator` first; this only reads the definition, so the
 * handle (raw node) and the snapshot classify identically (DSL/API parity).
 *
 * @param {string|null} code - the indicator's bare codeName
 * @param {Object} definitions
 * @returns {'semantic'|'grammatical'|null}
 */
export function classifyIndicatorKind(code, definitions) {
  const definition = definitions[code];
  if (!definition) return null;
  return definition.semanticIndicator ? 'semantic' : 'grammatical';
}

/**
 * Resolve a word-level indicator overlay onto a head glyph's parts at decode
 * time. The single merge used by render (#rebuild) and, under flatten, by
 * serialize, so the DSL `;;` path and the API word-level path cannot drift.
 *
 * Splits the head's parts into base parts and trailing indicator parts, runs
 * resolveIndicatorCodes against the overlay (replace-all with semantic-root
 * preservation), and returns a new array of [...baseParts, ...resolved], each
 * resolved indicator appended strictly after every base part. A resolved code
 * that matches an existing character-level `;` indicator part REUSES that part
 * (a shallow clone keeping its key and its 'character' origin) so navigation
 * round-trips it (N14-2); a genuinely overlay-added code is parsed fresh and
 * tagged `_indicatorOrigin: 'word'`. The input glyph is not mutated. A head
 * whose parts hold a non-indicator after an indicator is returned unchanged.
 *
 * @param {{parts: Array}} headGlyph - the head glyph node (has .parts)
 * @param {{codes: string[], stripSemantic?: boolean}} overlay
 * @param {Object} definitions
 * @param {(code: string) => Object} parse - parser used to build part nodes
 * @returns {Array} the resolved parts array
 */
export function mergeWordIndicatorsOntoHead(headGlyph, overlay, definitions, parse) {
  const parts = headGlyph?.parts ?? [];
  // The first part is always the base, even when it is itself an indicator
  // (e.g. a head whose bareCode is B85): scan for the first trailing indicator
  // from index 1, so a word-level overlay onto an indicator base adds rather
  // than replaces it.
  const firstIndicatorIndex = parts.findIndex((p, i) => i > 0 && p.isIndicator === true);
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

  // N14-2: reuse an existing character-level `;` indicator part when a resolved
  // code matches it, so the reordered part keeps its raw key (navigation and
  // getElementByKey round-trip it) and its true 'character' origin, instead of
  // re-parsing into a fresh keyless node tagged 'word'. A code with no existing
  // match is genuinely overlay-added, so it is parsed fresh and tagged 'word'.
  const reusable = existingIndicatorParts.slice();
  const indicatorParts = [];
  for (const code of finalCodes) {
    const reuseIndex = reusable.findIndex(p => p.codeName === code);
    if (reuseIndex !== -1) {
      indicatorParts.push({ ...reusable.splice(reuseIndex, 1)[0] });
      continue;
    }
    const node = parse(code)?.groups?.[0]?.glyphs?.[0]?.parts?.[0];
    if (node) indicatorParts.push({ ...node, _indicatorOrigin: 'word' });
  }

  return [...baseParts, ...indicatorParts];
}
