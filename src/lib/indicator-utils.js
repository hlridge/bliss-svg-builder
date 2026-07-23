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
// Like CHAR_OPTION_PREFIX but requiring a non-empty remainder (group 3), the
// strip form used by the overlay store gate: a baseless bracket (`[opts]`)
// stays whole and classifies UNKNOWN_CODE instead of stripping to nothing
// (mirrors the DSL gate's `(.+)` requirement, round-3 review F3).
const CHAR_OPTION_STRIP = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)(.+)$`);

// A codeString that is one clean code token (no separators, coordinates,
// options, or markers): the only form a pure-rename alias can hold.
// \w+ rather than letter-first: define() accepts digit-leading names (the
// Blissary-ID pattern, e.g. '1219'), and an alias to one must resolve like
// any other single-code rename (review MINOR-4).
export const SINGLE_CODE_TOKEN = /^\w+$/;

/**
 * Resolve a definition to its EFFECTIVE definition by following pure-rename
 * bare aliases: a definition whose whole content is a single-code codeString
 * (no `/`, `;`, `:`, options, `^`) and which carries no identity or metadata
 * of its own (no glyph/shape/externalGlyph flags, no getPath, no isIndicator)
 * is transparent, so indicator-ness and layout metadata read through it.
 * The chain stops at the first definition with identity (a flagged glyph, a
 * shape, an external glyph, an indicator) or whose codeString is not a single
 * clean token — so a multi-code composition NEVER resolves through (the
 * single-code-target guardrail, user ruling 2026-07-17), and a definition's
 * own metadata is never bypassed. Unregistered targets end the chain at the
 * alias itself (classified like any recognized non-indicator).
 *
 * Shared by the `;;` classifier (partitionWordIndicators), the render-merge
 * filter (filterToIndicators), the semantic helpers, and the parser's part
 * metadata application, so every indicator surface resolves aliases
 * identically (GH #35).
 *
 * @param {Object|undefined} definition - the starting definition entry
 * @param {Object} definitions - the live definitions registry
 * @returns {Object|undefined} the effective definition (the input when no
 *   chain applies)
 */
export function resolveEffectiveDefinition(definition, definitions) {
  let current = definition;
  const seen = new Set();
  while (
    current &&
    current.isIndicator !== true &&
    !current.isBlissGlyph && !current.isShape && !current.isExternalGlyph &&
    !current.glyphCode && typeof current.getPath !== 'function' &&
    typeof current.codeString === 'string' &&
    SINGLE_CODE_TOKEN.test(current.codeString) &&
    !seen.has(current.codeString) &&
    Object.prototype.hasOwnProperty.call(definitions, current.codeString)
  ) {
    seen.add(current.codeString);
    current = definitions[current.codeString];
  }
  return current ?? definition;
}

/**
 * Look up a code's effective definition: registry lookup (own properties
 * only) followed by pure-rename resolution. The single predicate source for
 * "is this code an indicator" across the `;;` store, the render-merge, and
 * the semantic classification helpers.
 */
function lookupEffectiveDefinition(bareCode, definitions) {
  const definition = Object.prototype.hasOwnProperty.call(definitions, bareCode)
    ? definitions[bareCode]
    : undefined;
  return definition ? resolveEffectiveDefinition(definition, definitions) : undefined;
}

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
    const indDef = lookupEffectiveDefinition(bareInd, definitions);
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
  return indicatorCodes.some(ind => lookupEffectiveDefinition(getBareCode(ind), definitions)?.semanticIndicator);
}

/**
 * Filter codes to only include real indicators (isIndicator: true), reading
 * indicator-ness through pure-rename aliases (GH #35).
 * Non-indicator codes passed in indicator position are silently dropped.
 */
export function filterToIndicators(codes, definitions) {
  return codes.filter(code => lookupEffectiveDefinition(getBareCode(code), definitions)?.isIndicator === true);
}

/**
 * Detect a TOP-LEVEL character separator (`/`) in an indicator code: outside
 * option brackets and outside a quoted option value (same scan state as
 * `splitTopLevelSemicolons`). A `/` hidden behind a coordinate suffix
 * (`B81:1,2/ZZ9`) escapes `getBareCode` (which reads only up to the `:`), yet
 * the serialized form re-parses as word structure, so an indicator slot can
 * never hold such a code (round-2 external review F2).
 */
function hasTopLevelSlash(code) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote !== null) {
      if (ch === '\\' && i + 1 < code.length) i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && depth > 0) quote = ch;
    else if (ch === '[') depth++;
    else if (ch === ']') { if (depth > 0) depth--; }
    else if (ch === '/' && depth === 0) return true;
  }
  return false;
}

/**
 * Partition a list of `;;` word-level indicator codes into the ones that are
 * real indicators (kept) and the ones that must be rejected. A word-level
 * indicator must BE an indicator (isIndicator: true); a recognized non-indicator
 * (a real base such as B291) is rejected as `'non-indicator'`, an unrecognized
 * code as `'unknown'`, and a code carrying word structure (a top-level `/`,
 * which no indicator slot can serialize back out) as `'word-structure'`.
 * Shared by the DSL `;;` parser path, the API `applyIndicators` overlay path,
 * AND the glyph-level `applyIndicators` character-indicator gate, so all three
 * classify an indicator code identically (DSL/API parity; the "word" in the
 * name is historical — the classification itself is level-agnostic). The
 * kept-code test mirrors `filterToIndicators`, so a code accepted here always
 * survives the later resolve.
 *
 * @param {string[]} codes - raw `;;` codes (may carry options/coords)
 * @param {Object} definitions
 * @returns {{ valid: string[], rejected: Array<{ code: string, reason: 'non-indicator'|'unknown'|'word-structure' }> }}
 *   `valid` preserves each code verbatim (options/coords intact); each rejected
 *   `code` is the bare offending code (options/coords stripped), except a
 *   `'word-structure'` reject, which keeps the full code (its bare form would
 *   hide the offending `/`).
 */
export function partitionWordIndicators(codes, definitions) {
  const valid = [];
  const rejected = [];
  for (const code of codes) {
    if (hasTopLevelSlash(code)) {
      rejected.push({ code, reason: 'word-structure' });
      continue;
    }
    const bare = getBareCode(code);
    // Own-property check (inside lookupEffectiveDefinition): a normal
    // definitions object inherits Object.prototype members (toString,
    // constructor, __proto__), so a plain `definitions[bare]` lookup would
    // classify those names as recognized non-indicators. Only an OWN key is a
    // real registered code; everything else is unknown. Indicator-ness reads
    // through pure-rename aliases (GH #35): the effective definition is
    // checked, so a 1:1 alias to an indicator is accepted, while an alias to
    // a multi-code composition stays a recognized non-indicator (the
    // single-code-target guardrail).
    const definition = lookupEffectiveDefinition(bare, definitions);
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
 * A CHARACTER-form option prefix (`[opts]CODE`, no `>`) is inert in overlay
 * position for every key -- the render-merge extracts parts only, so the
 * bracket styles nothing (`[opts]>` is the styled form). The DSL `;;` store
 * gate strips + warns these before storing; the API and object surfaces reach
 * this resolver with raw codes, so the same strip applies here for parity
 * (external review of ce80c1b, F2: the quote-aware bare-code lookup otherwise
 * silently stored the inert prefix). Every leading char-form bracket strips
 * (one `onCharOptionStrip` report each) BEFORE validation; the code itself is
 * kept and validated normally. The parser's codes arrive pre-stripped, so the
 * pass is a no-op on the DSL path (no double warning).
 *
 * @param {string[]} rawCodes
 * @param {boolean} stripSemantic
 * @param {Object} definitions
 * @param {(rejected: { code: string, reason: 'non-indicator'|'unknown'|'word-structure' }) => void} [onReject]
 * @param {(stripped: { bracket: string, code: string, source: string }) => void} [onCharOptionStrip]
 * @returns {{ codes: string[], stripSemantic: boolean } | null}
 */
export function resolveWordIndicatorOverlay(rawCodes, stripSemantic, definitions, onReject, onCharOptionStrip) {
  const gatedCodes = rawCodes.map((code) => {
    let current = code;
    let charPrefix;
    while ((charPrefix = current.match(CHAR_OPTION_STRIP)) !== null) {
      if (onCharOptionStrip) onCharOptionStrip({ bracket: charPrefix[1], code: charPrefix[3], source: current });
      current = charPrefix[3];
    }
    return current;
  });
  const { valid, rejected } = partitionWordIndicators(gatedCodes, definitions);
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
 * multi-key-option indicator the same way (DSL/API parity). Inside a bracket, a
 * quoted span owns its characters — a `[`/`]`/`;` in a quoted option value
 * (`[data-t="a[b"]>B81;B86`) must not move the depth or split (external review
 * of ce80c1b, F1: a quoted `[` held the depth open across the real separator,
 * joining two indicators into one stored code). Escapes (`\"`) consume the next
 * character, matching the option parser's quote grammar. Trims and drops empty
 * segments, matching the prior naive `code.split(';').map(trim).filter(Boolean)`.
 */
export function splitTopLevelSemicolons(code) {
  const result = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote !== null) {
      current += ch;
      if (ch === '\\' && i + 1 < code.length) current += code[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && depth > 0) quote = ch;
    else if (ch === '[') depth++;
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
    !lookupEffectiveDefinition(getBareCode(ind), definitions)?.semanticIndicator);
  return nonSemantic.length > 0 &&
    nonSemantic.every(ind => {
      const role = lookupEffectiveDefinition(getBareCode(ind), definitions)?.indicatorRole;
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
  const definition = lookupEffectiveDefinition(code, definitions);
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
    const parsedParts = parse(code)?.groups?.[0]?.glyphs?.[0]?.parts;
    // A custom flagged compound indicator (e.g. define COMBI = 'B97;B99:3,0')
    // parses at GLYPH level into multiple decomposed parts, unlike a built-in
    // compound (B98) which the parser keeps as one nested part. Taking parts[0]
    // dropped the rest of the anatomy from render AND flatten (`;;COMBI` rendered
    // only B97; backlog: custom compound `;;` anatomy truncation). Wrap the whole
    // anatomy back into one atomic part, mirroring the `;`-slot form (`B291;COMBI`);
    // the shared indicator-metadata stamp below then flags it, so `;` and `;;`
    // agree for the same definition.
    let node = parsedParts?.length > 1
      ? { codeName: getBareCode(code), parts: parsedParts }
      : parsedParts?.[0];
    if (node) {
      const bare = getBareCode(code);
      const immediate = Object.prototype.hasOwnProperty.call(definitions, bare)
        ? definitions[bare]
        : undefined;
      // A single-code rename overlay (e.g. MYIND -> C2, BAREIND -> B81) loses
      // the written code at parse; record it so preserve-mode serialization
      // restores it (Phase 2.3b). This stamp is load-bearing for the `;;`
      // surface: the standalone parse resolves the alias at glyph level, so the
      // parser's own single-ref rename recording never fires for this node
      // (unlike an object-input part, where it does). A multi-part wrap keeps its
      // own code (its codeName is already `bare`): stamping the alias on just the
      // first part would mislabel it.
      if (parsedParts.length === 1 && node.codeName !== bare) {
        node._aliasCodeName = bare;
      }
      // The `;;` overlay parses its code standalone, which (unlike the `;`-slot's
      // #applyDefinitionMetadata) does not carry a single-code alias's own
      // indicator metadata onto the node when the alias target is not itself an
      // indicator (MYIND -> C2, isIndicator on the definition); the compound wrap
      // above also starts bare. Apply it here from the effective definition so
      // `;` and `;;` place the indicator identically and the flatten+preserve
      // round-trip is svg-stable (external review MAJOR-1). Built-in indicators
      // already carry the flag, so the guard makes this a no-op for them.
      if (node.isIndicator !== true) {
        const effective = resolveEffectiveDefinition(immediate, definitions);
        if (effective?.isIndicator) {
          node.isIndicator = true;
          node.width = effective.width ?? 2;
          if (effective.anchorOffsetX !== undefined) node.anchorOffsetX = effective.anchorOffsetX;
        }
      }
      // A standalone parse of an alias code lands the alias definition's
      // defaultOptions at GLYPH level, so the extracted part node would
      // silently lose them (`;;` diverging from the `;`-part slot). Merge them
      // here with the same precedence as #applyDefinitionMetadata: explicit
      // options on the code win.
      if (immediate?.defaultOptions) {
        node.options = { ...immediate.defaultOptions, ...(node.options || {}) };
      }
      indicatorParts.push({ ...node, _indicatorOrigin: 'word' });
    }
  }

  return [...baseParts, ...indicatorParts];
}
