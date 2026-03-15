/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes } from "./bliss-element-definitions.js";
import { hasPathData, createTextFallbackGlyph } from "./bliss-shape-creators.js";
import {
  blissHeadGlyphExclusions,
  absoluteNeverHead,
  lowPriorityExclusions,
  conditionalExceptions
} from "./bliss-head-glyph-exclusions.js";
import {
  getSemanticRoot,
  hasSemantic,
  filterToIndicators,
  buildWithSemantic
} from "./indicator-utils.js";

export class BlissParser {
  static parse(codeStr, options) {
      const result = this.fromString(codeStr);

      if (options) {
        result.options = {...result.options, ...options};
      }

      return result;
  }

  static #extractPositionFromOptions(obj) {
    if (obj.options) {
      if (obj.options.x !== undefined && obj.x === undefined) {
        obj.x = Number(obj.options.x);
      }
      if (obj.options.y !== undefined && obj.y === undefined) {
        obj.y = Number(obj.options.y);
      }
    }
  }

  static #parseOptions(optionsString) {
    if (!optionsString) return;

    const extractedContent = optionsString.match(/\[([^\]]*)\]/)?.[1];
    if (!extractedContent) return;

    const parsedObject = Object.create(null);

    const regex = /([\w-]+)(?:\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]*))?/g;
    let match;

    while ((match = regex.exec(extractedContent)) !== null) {
      const key = match[1].trim();

      if (match[2] === undefined) {
        // Bare key (e.g., [grid]) — treat as boolean true
        parsedObject[key] = "1";
      } else {
        let value = match[2].trim();

        // Remove quotes and handle escapes for both double and single quotes
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1).replace(/\\"/g, '"');
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1).replace(/\\'/g, "'");
        }

        parsedObject[key] = value;
      }
    }

    return parsedObject;
  }

  static parsePartString(str, restoreFunction = (s) => s) {
    const part = {};

    let optionsString, codeString;
    const match = str.match(/^(\[.*?\])>(.*)$/);
    if (match) {
      optionsString = match[1];
      codeString = match[2];
      part.options = this.#parseOptions(restoreFunction(optionsString));
    } else {
      codeString = str;
    }

    if (codeString) {
      const matched = codeString.match(/^([a-zA-Z0-9\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF\-._]+)(?::(\-?(?:\d+(?:\.\d*)?|\.\d+))?(?:,(\-?(?:\d+(?:\.\d*)?|\.\d+))?)?)?$/);

      if (matched) {
        let [, code, x, y] = matched;
        part.codeName = code;
        x !== undefined && (part.x = Number(x));
        y !== undefined && (part.y = Number(y));
      } else {
        part.error = `Invalid format: ${codeString}`;
      }
    }

    return part;
  }
  static fromString(inputString) {
    if (typeof inputString === 'string' && inputString.length > 10_000) {
      throw new Error('Input string exceeds maximum length of 10,000 characters');
    }
    inputString = inputString.trim();
    let result = { groups: [] };

    // Parse a Blissymbolics string and convert it to an internal representation (BlissComposition)
    //Ex. 
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4{hej}/C8:0,8;[color=green]E:0,11{hopp}/AA8N:0,2"
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4/C8:0,8;[color=green]E:0,11/AA8N:0,2{hej hopp}"

    let placeholderMap = {};
    let placeholderCount = 0;

    // Preserve content in both {...} and [...] to protect spaces
    // {...} uses greedy match since it's always at the end and can contain any characters
    // [...] uses non-greedy match since it can appear multiple times
    inputString = inputString.replace(/\{(.*)\}|\[([^\]]*)\]/g, (match, textContent, optionContent) => {
      let placeholder = `PLACEHOLDER_${placeholderCount++}`;
      if (textContent !== undefined) {
        placeholderMap[placeholder] = { content: textContent, openBracket: '{', closeBracket: '}' };
        return '{' + placeholder + '}';
      } else {
        placeholderMap[placeholder] = { content: optionContent, openBracket: '[', closeBracket: ']' };
        return '[' + placeholder + ']';
      }
    });

    // Remove all spaces in input string (but not in preserved content)
    inputString = inputString.replace(/\s/g, '');

    // Helper function to restore placeholders in a string
    const restorePlaceholders = (str) => {
      if (!str) return str; // Handle undefined/null/empty (matches #parseOptions behavior)
      return str.replace(/(\{|\[)PLACEHOLDER_(\d+)(\}|\])/g, (match, open, num, close) => {
        const placeholder = placeholderMap[`PLACEHOLDER_${num}`];
        if (placeholder) {
          const { content, openBracket, closeBracket } = placeholder;
          return openBracket + content + closeBracket;
        }
        return match;
      });
    };

    // Extract global options
    let [_, globalOptionsString, globalCodeString] = inputString.match(/^\s*(?:([^|]*)\s*\|\|)?(.*)$/);
    result.options = this.#parseOptions(restorePlaceholders(globalOptionsString)) || {};

    // Step 1: Replace // patterns with /SP/ (space placeholder)
    // Each // adds one SP, /// adds two SPs, etc.
    const normalized = globalCodeString.replace(/\/{2,}/g, match =>
      '/' + 'SP/'.repeat(match.length - 1)
    );

    // Step 2: Split on / and group consecutive items by type (space vs non-space)
    const glyphCodes = normalized.split('/').filter(s => s !== '');
    const isSpaceCode = code => code === 'SP' || code === 'TSP' || code === 'QSP';

    const groupedCodes = []; // Array of { codes: [...], isSpace: boolean }
    for (const code of glyphCodes) {
      const isSpace = isSpaceCode(code);
      const lastGroup = groupedCodes[groupedCodes.length - 1];
      if (lastGroup && lastGroup.isSpace === isSpace) {
        lastGroup.codes.push(code);
      } else {
        groupedCodes.push({ codes: [code], isSpace });
      }
    }

    // Step 3: Build parsed groups, converting SP to TSP/QSP
    const parsedGroups = [];
    for (let gi = 0; gi < groupedCodes.length; gi++) {
      const { codes, isSpace } = groupedCodes[gi];

      if (isSpace) {
        // Space group: convert SP to TSP or QSP
        // Use QSP only if: single space AND next group is punctuation-only
        const nextGroup = groupedCodes[gi + 1];
        let useQSP = false;
        if (codes.length === 1 && codes[0] === 'SP' && nextGroup && !nextGroup.isSpace) {
          // Check if next group is punctuation-only (will be determined after parsing)
          // For now, mark it and we'll resolve after parsing all groups
        }
        // Convert codes: SP→TSP (or QSP), keep TSP/QSP as-is
        // Mark whether each space was from SP (implicit) or user-specified
        const spaceGlyphs = codes.map(code => {
          const fromSP = code === 'SP';
          return { parts: [{ codeName: fromSP ? 'TSP' : code, _fromSP: fromSP }] };
        });
        parsedGroups.push({ glyphs: spaceGlyphs, _isSpaceGroup: true, _spaceIndex: gi });
        continue;
      }

      // Non-space group: parse normally
      const tpgs = codes.join('/');

      let group = { glyphs: [] };

      let [_, twoPartGroupString, textKey] = tpgs.match(/(.*?)(?:\{(.*?(?<!\\))\})?$/);

      if (textKey) {
        group.text = placeholderMap[textKey]?.content ?? textKey;
      }

      let groupCodeString;
      if (twoPartGroupString.includes('|')) {
        const [beforePipe, afterPipe] = twoPartGroupString.split("|", 2);
        if (beforePipe.match(/^\[.*\]$/)) {
          group.options = this.#parseOptions(restorePlaceholders(beforePipe));
          groupCodeString = afterPipe;
        } else if (beforePipe.length > 0) {
          console.warn(`Invalid group options syntax: "${beforePipe}|" - expected [options]| format. Ignoring.`);
          groupCodeString = afterPipe;
        } else {
          groupCodeString = afterPipe;
        }
      } else {
        groupCodeString = twoPartGroupString;
      }

      function processXCodes(codeString) {
        // First, expand multi-char X-codes (like Xhello -> Xh/Xe/Xl/Xl/Xo or XTXT_héllo)
        // Match Latin, Latin Extended, and Cyrillic letters
        let expanded = codeString.replace(/X([a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]{2,})/g, (match, chars) => {
          const allHavePath = [...chars].every(char => hasPathData(char));
          if (allHavePath) {
            return [...chars].map(char => `X${char}`).join('/');
          } else {
            return `XTXT_${chars}`;
          }
        });

        // Then, process sequences of single-char X-codes (like Xh/Xé/Xl -> XTXT_hél if any needs fallback)
        const parts = expanded.split('/');
        const result = [];
        let currentXSequence = [];

        const flushXSequence = () => {
          if (currentXSequence.length === 0) return;

          if (currentXSequence.length === 1) {
            const char = currentXSequence[0].slice(1);
            if (hasPathData(char)) {
              result.push(currentXSequence[0]);
            } else {
              result.push(`XTXT_${char}`);
            }
          } else {
            const chars = currentXSequence.map(code => code.slice(1)).join('');
            const allHavePath = [...chars].every(char => hasPathData(char));

            if (allHavePath) {
              currentXSequence.forEach(code => result.push(code));
            } else {
              result.push(`XTXT_${chars}`);
            }
          }
          currentXSequence = [];
        };

        for (const part of parts) {
          // Match single-char X-codes: Latin, Latin Extended, and Cyrillic letters
          if (/^X[a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]$/.test(part)) {
            currentXSequence.push(part);
          } else {
            flushXSequence();
            result.push(part);
          }
        }
        flushXSequence();

        return result.join('/');
      }

      function replaceWithDefinition(str, definitions) {
        const wordCode = str;
        let headGlyphFound = false;

        // Helper: Find head glyph index (explicit marker or fallback skipping modifiers)
        // Defined at top level for use in both ;; handling and expand()
        const findHeadGlyphIndex = (parts) => {
          // Check for explicit marker first
          const explicitIndex = parts.findIndex(p => p.isHeadGlyph);
          if (explicitIndex !== -1) return explicitIndex;

          const getCode = (i) => parts[i].glyphCode || parts[i].part.split(';')[0];

          // Check if exclusion applies (handles conditional exceptions like B10/B4)
          const isExcluded = (code, index) => {
            for (const [excl, notWhenFollowedBy] of conditionalExceptions) {
              if (code === excl && index + 1 < parts.length && getCode(index + 1) === notWhenFollowedBy) {
                return false;
              }
            }
            return true;
          };

          // Skip modifier patterns from start
          let startIndex = 0;
          let foundMatch = true;
          while (foundMatch && startIndex < parts.length) {
            foundMatch = false;
            for (const pattern of blissHeadGlyphExclusions) {
              const codes = pattern.split('/');
              if (startIndex + codes.length <= parts.length) {
                let matches = true;
                for (let i = 0; i < codes.length; i++) {
                  const code = getCode(startIndex + i);
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

          if (startIndex < parts.length) return startIndex;

          // All exclusions: find best head by priority (regular > low-priority > never-head)
          let best = 0;
          let bestPriority = absoluteNeverHead.includes(getCode(0)) ? 0 : lowPriorityExclusions.includes(getCode(0)) ? 1 : 2;
          for (let i = 1; i < parts.length; i++) {
            const code = getCode(i);
            const priority = absoluteNeverHead.includes(code) ? 0 : lowPriorityExclusions.includes(code) ? 1 : 2;
            if (priority > bestPriority || (priority === bestPriority && priority > 0)) {
              best = i;
              bestPriority = priority;
            }
          }
          return best;
        };

        // Helper to get base code from expanded glyph, stripping only indicator parts.
        // Non-indicator parts (glyph composition like B291;B303) are preserved.
        // Defined at top level for use in both ;; handling and expand()
        const getBaseCode = (glyph) => {
          // Use glyphCode only if it's a simple code (no / or ; which indicate codeStrings/words)
          // This preserves composite glyphs like B502 = 'DOT:2,10;HL4:0,12;DOT:2,14'
          const isSimpleGlyphCode = glyph.glyphCode &&
            !glyph.glyphCode.includes('/') &&
            !glyph.glyphCode.includes(';');
          if (isSimpleGlyphCode) return glyph.glyphCode;
          const parts = glyph.part.split(';');
          const nonIndicatorParts = parts.filter((p, i) => {
            if (i === 0) return true;
            const bareCode = p.split(':')[0];
            return !definitions[bareCode]?.isIndicator;
          });
          return nonIndicatorParts.join(';');
        };

        // Extract only indicator codes from a glyph's part string (after the first ;)
        const getIndicatorParts = (glyph) => {
          return glyph.part.split(';').slice(1).filter(p => {
            const bareCode = p.split(':')[0];
            return definitions[bareCode]?.isIndicator === true;
          });
        };

        // Helper: get bare code from string with potential options prefix
        const getBareCode = (str) => {
          const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
          if (partLevelMatch) return partLevelMatch[2].split(':')[0].split(';')[0];
          const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
          const code = optionsMatch ? str.slice(optionsMatch[1].length) : str;
          return code.split(':')[0].split(';')[0];
        };

        // After ;; modifies a glyph's .part, update its identity (isBlissGlyph/glyphCode).
        // If the new part is a bare known glyph, restore identity; otherwise clear it.
        const updateGlyphIdentity = (expandedPart) => {
          const bareCode = expandedPart.part.split(';')[0].split(':')[0];
          const def = definitions[bareCode];
          if (!expandedPart.part.includes(';') && def?.isBlissGlyph) {
            expandedPart.isBlissGlyph = true;
            if (def.glyphCode) expandedPart.glyphCode = def.glyphCode;
          } else {
            delete expandedPart.isBlissGlyph;
            delete expandedPart.glyphCode;
          }
        };

        // Helper: resolve codeString through aliases to check if it's a word
        const resolveToFinalCodeString = (code, visited = new Set()) => {
          if (visited.has(code)) return null;
          visited.add(code);
          const def = definitions[code];
          if (!def?.codeString) return null;
          if (!definitions[def.codeString]) return def.codeString;
          return resolveToFinalCodeString(def.codeString, visited);
        };

        // Detect ;; for word-level indicators on inline multi-character expressions
        // Pattern: baseCode;;indicators where indicators go on head glyph
        // This enables word-level indicators without pre-defining words
        const wordLevelMatch = str.match(/^(.+);;(.*)$/);
        if (wordLevelMatch) {
          const [_, baseCode, rawIndicators] = wordLevelMatch;
          const forceStrip = rawIndicators.startsWith('!');
          const indicators = forceStrip ? rawIndicators.slice(1) : rawIndicators;

          // Process baseCode using the normal flow (splits on / and expands each part)
          // This recursive call handles everything: definitions, ^markers, options, etc.
          const expandedParts = baseCode.split('/').flatMap(strPart => expand(strPart, definitions));

          if (expandedParts.length > 1) {
            // Multiple glyphs: Apply indicators to head glyph
            const targetIndex = findHeadGlyphIndex(expandedParts);
            const existingInds = getIndicatorParts(expandedParts[targetIndex]);
            const semanticRoot = !forceStrip ? getSemanticRoot(existingInds, definitions) : null;
            const bareCode = getBaseCode(expandedParts[targetIndex]);

            if (indicators) {
              const newInds = filterToIndicators(indicators.split(';'), definitions);
              if (newInds.length > 0) {
                if (semanticRoot && !hasSemantic(newInds, definitions)) {
                  expandedParts[targetIndex].part = bareCode + ';' + buildWithSemantic(semanticRoot, newInds, definitions).join(';');
                } else {
                  expandedParts[targetIndex].part = bareCode + ';' + newInds.join(';');
                }
              } else {
                // All provided codes were non-indicators, treat as empty ;;
                expandedParts[targetIndex].part = semanticRoot
                  ? bareCode + ';' + semanticRoot
                  : bareCode;
              }
            } else {
              // Empty ;; or ;;! — preserve semantic root unless force-stripped
              expandedParts[targetIndex].part = semanticRoot
                ? bareCode + ';' + semanticRoot
                : bareCode;
            }

            // ;; modified the indicator — update glyph identity to match the new part
            updateGlyphIdentity(expandedParts[targetIndex]);

            // Mark as head glyph if not default (index > 0) and not already marked
            if (targetIndex > 0 && !expandedParts.some(p => p.isHeadGlyph)) {
              expandedParts[targetIndex].isHeadGlyph = true;
            }
          } else if (expandedParts.length === 1) {
            // Single glyph: ;; behaves like ; (attach or strip indicator on the single glyph)
            const existingInds = getIndicatorParts(expandedParts[0]);
            const semanticRoot = !forceStrip ? getSemanticRoot(existingInds, definitions) : null;
            const baseCode = getBaseCode(expandedParts[0]);

            if (indicators) {
              const newInds = filterToIndicators(indicators.split(';'), definitions);
              if (newInds.length > 0) {
                if (semanticRoot && !hasSemantic(newInds, definitions)) {
                  expandedParts[0].part = baseCode + ';' + buildWithSemantic(semanticRoot, newInds, definitions).join(';');
                } else {
                  expandedParts[0].part = baseCode + ';' + newInds.join(';');
                }
              } else {
                expandedParts[0].part = semanticRoot
                  ? baseCode + ';' + semanticRoot
                  : baseCode;
              }
            } else {
              expandedParts[0].part = semanticRoot
                ? baseCode + ';' + semanticRoot
                : baseCode;
            }

            // ;; modified the indicator — update glyph identity to match the new part
            updateGlyphIdentity(expandedParts[0]);
          }

          return expandedParts;
        }

        // isTopLevel: true for user input, false for internal codeString expansion
        // Indicator replacement only applies at top level (user input)
        function expand(str, definitions, isTopLevel = true, depth = 0) {
          if (depth > 50) throw new Error('Maximum recursion depth exceeded');
          let isHeadGlyph = false;
          if (str.endsWith('^')) {
            if (!headGlyphFound) {
              isHeadGlyph = true;
              headGlyphFound = true;
            } else {
              console.warn(`Multiple head markers (^) found in word: ${wordCode}. Using first marked glyph.`);
            }
            str = str.slice(0, -1);
          }

          // Handle part-level options with > (like [x=2]>B291 or [color=red]>XW)
          const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
          if (partLevelMatch) {
            const codeForKerning = partLevelMatch[2].split(':')[0];
            const definition = definitions[codeForKerning] || {};
            return [{
              part: str,
              ...(isHeadGlyph && { isHeadGlyph }),
              ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
              ...(definition.glyph && { glyph: definition.glyph }),
              ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
            }];
          }

          // Strip leading glyph-level bracket options
          const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
          const optionsPrefix = optionsMatch ? optionsMatch[1] : '';
          const codeForLookup = optionsPrefix ? str.slice(optionsPrefix.length) : str;

          const [potentialBaseCodeRaw, ...rawIndicators] = codeForLookup.split(';');
          // Detect force-strip modifier (! prefix on first indicator)
          const forceStrip = rawIndicators.length > 0 && rawIndicators[0]?.startsWith('!');
          if (forceStrip) rawIndicators[0] = rawIndicators[0].slice(1);
          const filteredIndicators = rawIndicators.filter(ind => ind !== '');
          const hasInputIndicators = rawIndicators.length > 0;

          // Strip position modifier (e.g. ":2,0" or ":-1.5,3") from base code
          // so definition lookup works for codes like "WORD:2,0"
          const posMatch = potentialBaseCodeRaw.match(
            /^(.+?)(:-?(?:\d+(?:\.\d*)?|\.\d+)(?:,-?(?:\d+(?:\.\d*)?|\.\d+))?)$/
          );
          const potentialBaseCode = posMatch ? posMatch[1] : potentialBaseCodeRaw;
          const positionSuffix = posMatch ? posMatch[2] : '';

          const resolvedCodeString = resolveToFinalCodeString(potentialBaseCode);
          const isWordDefinition = resolvedCodeString?.includes('/') ?? false;

          // Check if input indicators are real indicators (for replacement)
          const inputIndicatorsAreReal = filteredIndicators.length > 0 &&
            filteredIndicators.every(ind => definitions[getBareCode(ind)]?.isIndicator === true);

          // Check if base code supports indicator replacement
          const baseCodeDef = definitions[potentialBaseCode];
          const baseCodeStringParts = baseCodeDef?.codeString?.split(';') || [];
          const baseCodeExistingIndicators = baseCodeStringParts.slice(1).map(p => p.split(':')[0]);
          const baseCodeSupportsReplacement = baseCodeExistingIndicators.length > 0 &&
            baseCodeExistingIndicators.every(ind => definitions[ind]?.isIndicator === true);

          // Don't apply indicator replacement to compound indicators (like B928 = B92;B87)
          // These are indicators composed of multiple indicator parts, not characters with replaceable indicators
          const baseIsCompoundIndicator = baseCodeDef?.isIndicator === true;

          // Indicator replacement: only for top-level, non-words, with matching indicator types
          // Skip if the base code itself is an indicator (compound indicators should keep their structure)
          const canModifyIndicators = isTopLevel && !isWordDefinition && baseCodeSupportsReplacement && !baseIsCompoundIndicator;
          const shouldReplace = canModifyIndicators && inputIndicatorsAreReal;
          const shouldRemove = canModifyIndicators && hasInputIndicators && filteredIndicators.length === 0;
          // Bare empty strip: trailing ; with no indicator, on any code (even without a known indicator in its definition).
          // The user has no way to know if a B-code has a baked-in indicator, so empty ; must never warn.
          const isBareEmptyStrip = !shouldRemove && hasInputIndicators && filteredIndicators.length === 0;

          // Use base code lookup for words, or when replacing/removing indicators
          const useBaseCodeLookup = isWordDefinition || shouldReplace || shouldRemove || isBareEmptyStrip;
          const definition = useBaseCodeLookup
            ? (definitions[potentialBaseCode] || {})
            : codeForLookup.startsWith('XTXT_')
              ? (() => { const g = createTextFallbackGlyph(codeForLookup.slice(5)); g.isShape = true; return g; })()
              : (definitions[codeForLookup] || {});

          // If we have a codeString, recursively expand it
          if (definition.codeString) {
            let codeStringToExpand = definition.codeString;

            // Modify codeString for indicator replacement/removal
            if (shouldReplace || shouldRemove) {
              const codeStringParts = definition.codeString.split(';');
              const existingIndicatorCodes = codeStringParts.slice(1).map(p => p.split(':')[0]);
              const semanticRoot = !forceStrip ? getSemanticRoot(existingIndicatorCodes, definitions) : null;

              codeStringToExpand = codeStringParts[0];
              if (filteredIndicators.length > 0) {
                if (semanticRoot && !hasSemantic(filteredIndicators, definitions)) {
                  codeStringToExpand += ';' + buildWithSemantic(semanticRoot, filteredIndicators, definitions).join(';');
                } else {
                  codeStringToExpand += ';' + filteredIndicators.join(';');
                }
              } else if (semanticRoot) {
                // shouldRemove but preserve semantic root
                codeStringToExpand += ';' + semanticRoot;
              }
            }

            // Built-in single-character codes: skip expansion, let parseParts handle it.
            // This eliminates the flatten-then-unflatten pattern where expand() substitutes
            // a B-code's codeString (e.g. B291 → "S8:0,8") only for a later wrapping patch
            // to reconstruct the nesting. Word codes (codeString with /) must still be
            // expanded here because word decomposition produces multiple glyphs.
            // Indicator modification (shouldReplace/shouldRemove) must still expand because
            // the codeString is being modified, not just passed through.
            if (builtInCodes.has(potentialBaseCode)
                && !codeStringToExpand.includes('/')
                && !shouldReplace && !shouldRemove) {
              return [{
                part: isBareEmptyStrip
                  ? optionsPrefix + potentialBaseCode + positionSuffix
                  : str.replace(/;$/, ''),
                ...(definition.shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace: true }),
                ...(definition.isIndicator === true && { isIndicator: true }),
                ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
                ...(definition.glyph && { glyph: definition.glyph }),
                ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
                ...(definition.glyphCode && { glyphCode: definition.glyphCode }),
                ...(definition.isBlissGlyph && { isBlissGlyph: definition.isBlissGlyph }),
                ...(isHeadGlyph && { isHeadGlyph }),
                ...(definition.defaultOptions && { defaultOptions: definition.defaultOptions }),
              }];
            }

            // Handle // in codeString: split into word segments with break markers
            if (codeStringToExpand.includes('//')) {
              const wordSegments = codeStringToExpand.split('//');
              const allParts = [];
              for (let i = 0; i < wordSegments.length; i++) {
                if (i > 0) allParts.push({ part: '', _wordBreak: true });
                const segmentParts = wordSegments[i].split('/')
                  .flatMap(s => expand(s, definitions, false, depth + 1));
                allParts.push(...segmentParts);
              }
              // Apply position suffix to first non-break part
              if (positionSuffix && allParts.length > 0) {
                const firstReal = allParts.find(p => !p._wordBreak);
                if (firstReal) {
                  const semiParts = firstReal.part.split(';');
                  if (!/:-?[\d.]/.test(semiParts[0])) {
                    semiParts[0] += positionSuffix;
                  }
                  firstReal.part = semiParts.join(';');
                }
              }
              if (isHeadGlyph && allParts.length > 0) {
                allParts[0].isHeadGlyph = true;
              }
              if (optionsPrefix && allParts.length > 0) {
                allParts[0].part = optionsPrefix + allParts[0].part;
              }
              return allParts;
            }

            // First expand to get all parts (including nested expansions)
            const rawExpandedParts = codeStringToExpand.split('/')
              .flatMap(subStr => expand(subStr, definitions, false, depth + 1));

            // Check if final expansion has multiple glyphs (word vs single-character composite)
            // This covers nested aliases like TestAlias → TestWord1 → H/C
            const isMultiGlyphWord = rawExpandedParts.length > 1;

            const expandedParts = rawExpandedParts.map(expandedSubPart => {
                // Apply properties from the definition, falling back to existing values
                const isIndicator = definition.isIndicator ?? expandedSubPart.isIndicator;
                const isExternalGlyph = expandedSubPart.isExternalGlyph;
                const kerningRules = definition.kerningRules ?? expandedSubPart.kerningRules;
                const glyph = expandedSubPart.glyph;
                const shrinksPrecedingWordSpace = definition.shrinksPrecedingWordSpace;
                // For multi-glyph words, each part keeps its own glyphCode.
                // For single-character composites: outer definition's glyphCode wins
                // (preserves custom glyph identity, e.g., LOVE wrapping B431).
                const glyphCode = isMultiGlyphWord
                  ? expandedSubPart.glyphCode
                  : (definition.glyphCode ?? expandedSubPart.glyphCode);
                const isBlissGlyph = expandedSubPart.isBlissGlyph ?? definition.isBlissGlyph;
                return {
                  part: expandedSubPart.part,
                  ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
                  ...(isIndicator === true && { isIndicator }),
                  ...(isExternalGlyph && { isExternalGlyph }),
                  ...(glyph && { glyph }),
                  ...(kerningRules && { kerningRules }),
                  ...(glyphCode && { glyphCode }),
                  ...(isBlissGlyph && { isBlissGlyph }),
                  ...(expandedSubPart.isHeadGlyph && { isHeadGlyph: expandedSubPart.isHeadGlyph }),
                  ...(expandedSubPart.defaultOptions && { defaultOptions: expandedSubPart.defaultOptions })
                };
              });

            // Handle WORD;INDICATORS syntax (only for multi-glyph words, not single characters)
            // Single characters with indicators are handled by parseParts later
            // Use expandedParts.length to detect words (covers aliases like TestAlias → TestWord1 → H^/C)
            if (expandedParts.length > 1 && filteredIndicators.length > 0) {
              // It's a word (multiple glyphs) - strip and replace indicators on head glyph
              // Only use codes that are real indicators
              const validInds = filterToIndicators(filteredIndicators, definitions);
              if (validInds.length > 0) {
                const targetIndex = findHeadGlyphIndex(expandedParts);
                const existingInds = getIndicatorParts(expandedParts[targetIndex]);
                const semanticRoot = !forceStrip ? getSemanticRoot(existingInds, definitions) : null;
                const baseCode = getBaseCode(expandedParts[targetIndex]);

                // Reattach with new indicators, preserving semantic root when appropriate
                if (semanticRoot && !hasSemantic(validInds, definitions)) {
                  expandedParts[targetIndex].part = baseCode + ';' + buildWithSemantic(semanticRoot, validInds, definitions).join(';');
                } else {
                  expandedParts[targetIndex].part = baseCode + ';' + validInds.join(';');
                }
              }
              // If no valid indicators, don't modify the head glyph at all
            }

            // Handle WORD; (empty indicators) - strip from head glyph of multi-glyph words
            // Single-char cases are handled by: shouldRemove (if definition has real indicators)
            // or isBareEmptyStrip (if no real indicator in definition, via base case return)
            if (expandedParts.length > 1 && rawIndicators.length > 0 && filteredIndicators.length === 0) {
              const targetIndex = findHeadGlyphIndex(expandedParts);
              const existingInds = getIndicatorParts(expandedParts[targetIndex]);
              const semanticRoot = !forceStrip ? getSemanticRoot(existingInds, definitions) : null;
              const baseCode = getBaseCode(expandedParts[targetIndex]);

              expandedParts[targetIndex].part = semanticRoot
                ? baseCode + ';' + semanticRoot
                : baseCode;
            }

            // Apply isHeadGlyph to the first expanded part only (explicit ^ marker)
            if (isHeadGlyph && expandedParts.length > 0) {
              expandedParts[0].isHeadGlyph = true;
            }

            // For words without explicit marker: set isHeadGlyph only if fallback finds non-default (index > 0)
            // This keeps data clean for toString() - only mark when deviating from default
            if (!isHeadGlyph && expandedParts.length > 1 && !expandedParts.some(p => p.isHeadGlyph)) {
              const fallbackIndex = findHeadGlyphIndex(expandedParts);
              if (fallbackIndex > 0) {
                expandedParts[fallbackIndex].isHeadGlyph = true;
              }
            }

            // Apply position suffix from outer code (e.g. WORD:2,0) to first glyph's first part
            if (positionSuffix && expandedParts.length > 0) {
              const firstPart = expandedParts[0].part;
              const semiParts = firstPart.split(';');
              // Only add position if the first sub-part doesn't already have coordinates
              if (!/:-?[\d.]/.test(semiParts[0])) {
                semiParts[0] += positionSuffix;
              }
              expandedParts[0].part = semiParts.join(';');
            }

            // Carry defaultOptions from the definition as data on the first expanded part
            if (definition.defaultOptions && expandedParts.length > 0) {
              expandedParts[0].defaultOptions = definition.defaultOptions;
            }

            // Prepend options to the first expanded part
            if (optionsPrefix && expandedParts.length > 0) {
              expandedParts[0].part = optionsPrefix + expandedParts[0].part;
            }
            return expandedParts;
          }

          // Base case - create object with properties from definition
          const isIndicator = definition.isIndicator;
          const isExternalGlyph = definition.isExternalGlyph;
          const kerningRules = definition.kerningRules;
          const glyph = definition.glyph;
          const glyphCode = definition.glyphCode;
          const isBlissGlyph = definition.isBlissGlyph;
          const shrinksPrecedingWordSpace = definition.shrinksPrecedingWordSpace;
          return [{
            part: isBareEmptyStrip ? optionsPrefix + potentialBaseCode + positionSuffix : str.replace(/;$/, ''),
            ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
            ...(isIndicator === true && { isIndicator }),
            ...(isExternalGlyph && { isExternalGlyph }),
            ...(glyph && { glyph }),
            ...(kerningRules && { kerningRules }),
            ...(glyphCode && { glyphCode }),
            ...(isBlissGlyph && { isBlissGlyph }),
            ...(isHeadGlyph && { isHeadGlyph })
          }];
        }

        const expandedParts = str.split('/').flatMap(strPart => expand(strPart, definitions));

        // Run head glyph detection on top-level multi-glyph words
        if (expandedParts.length > 1 && !expandedParts.some(p => p.isHeadGlyph)) {
          const fallbackIndex = findHeadGlyphIndex(expandedParts);
          if (fallbackIndex > 0) {
            expandedParts[fallbackIndex].isHeadGlyph = true;
          }
        }

        return expandedParts;
      }

      const processedGroupCodeString = processXCodes(groupCodeString);
      const expandedGlyphParts = replaceWithDefinition(processedGroupCodeString, blissElementDefinitions);

      let pendingRelativeKerning;
      let pendingAbsoluteKerning;

      for (let { part, shrinksPrecedingWordSpace, isIndicator, isExternalGlyph, glyph, kerningRules, glyphCode, isBlissGlyph, isHeadGlyph, defaultOptions, _wordBreak } of expandedGlyphParts) {
        // Word break marker from // in bare alias codeString:
        // push current group, add a default space group, start a new group
        if (_wordBreak) {
          if (group.glyphs.length > 0) {
            this.#extractPositionFromOptions(group);
            parsedGroups.push(group);
          }
          parsedGroups.push({ glyphs: [{ parts: [{ codeName: 'SP', _fromSP: true }] }], _isSpaceGroup: true, _spaceIndex: parsedGroups.length });
          group = { glyphs: [] };
          continue;
        }
        if (part === "") continue;

        const glyphObj = {
          parts: [],
          ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
          ...(typeof isIndicator === "boolean" && { isIndicator }),
          ...(typeof isExternalGlyph === "boolean" && { isExternalGlyph }),
          ...(typeof glyph === "string" && { glyph }),
          ...((kerningRules !== null && kerningRules?.constructor === Object) && { kerningRules }),
          ...(typeof glyphCode === "string" && { glyphCode }),
          ...(isBlissGlyph === true && { isBlissGlyph }),
          ...(isHeadGlyph === true && { isHeadGlyph })
        };

        const kerningMatch = part.match(/^(RK|AK)(?::([+-]?\d+(?:\.\d+)?))?$/);
        if (kerningMatch) {
          const [_, kerningType, kerningValue = 0] = kerningMatch;
          if (kerningType === "RK") pendingRelativeKerning = Number(kerningValue);
          if (kerningType === "AK") pendingAbsoluteKerning = Number(kerningValue);
          continue;
        }

        if (pendingRelativeKerning !== undefined) {
          (glyphObj.options ??= {}).relativeKerning = pendingRelativeKerning;
          pendingRelativeKerning = undefined;
        }

        if (pendingAbsoluteKerning !== undefined) {
          (glyphObj.options ??= {}).absoluteKerning = pendingAbsoluteKerning;
          pendingAbsoluteKerning = undefined;
        }

        // Merge defaultOptions carried from expand() (standalone/composition case)
        if (defaultOptions) {
          glyphObj.options = { ...defaultOptions, ...(glyphObj.options || {}) };
        }

        let glyphCodeString = part;
        const glyphMatch = part.match(/^(\[.*?\])(?!>)(.*)/);
        if (glyphMatch) {
          const parsedOptions = this.#parseOptions(restorePlaceholders(glyphMatch[1]));
          glyphObj.options = { ...glyphObj.options, ...parsedOptions };
          glyphCodeString = glyphMatch[2];
        }

        const parseParts = (partsString, depth = 0) => {
          if (depth > 50) throw new Error('Maximum recursion depth exceeded');
          const parts = [];

          // Split on ; (brackets are already replaced with placeholders at this point)
          const twoPartPartStrings = partsString.split(';');
          for (const twoPartPartString of twoPartPartStrings) {
            const part = this.parsePartString(twoPartPartString, restorePlaceholders);

            const definition = part.codeName?.startsWith('XTXT_')
              ? (() => { const g = createTextFallbackGlyph(part.codeName.slice(5)); g.isShape = true; return g; })()
              : (blissElementDefinitions[part.codeName] || {});
            const codeString = definition.codeString;

            if (codeString) {
              if (codeString.includes('/')) {
                // Word codeString at part level — cannot be expanded here.
                // Keep original codeName; post-parse decomposition resolves it.
              } else if (codeString.includes(';') || codeString.includes(':') || blissElementDefinitions[codeString]?.codeString ) {
                part.parts = parseParts(definition.codeString, depth + 1);
                // Keep part.codeName to preserve identifier alongside expansion
              } else {
                // Built-in codes preserve identity; non-built-in resolve to target
                if (builtInCodes.has(part.codeName)) {
                  part.parts = [{ codeName: definition.codeString }];
                } else {
                  part.codeName = definition.codeString;
                }
              }
            }

            BlissParser.#applyDefinitionMetadata(part, definition);

            this.#extractPositionFromOptions(part);
            parts.push(part);
          }
          return parts;
        };

        glyphObj.parts = parseParts(glyphCodeString);

        this.#extractPositionFromOptions(glyphObj);
        group.glyphs.push(glyphObj);
      }

      this.#extractPositionFromOptions(group);
      parsedGroups.push(group);
    }

    // Step 4: Resolve SP→QSP for space groups before punctuation
    // For implicit spaces (_fromSP): change code to QSP
    // For explicit spaces: compare against default and flag _differsFromDefault
    for (let i = 0; i < parsedGroups.length; i++) {
      const group = parsedGroups[i];
      if (group._isSpaceGroup) {
        // Determine default space code for this position
        const nextGroup = parsedGroups[i + 1];
        const isPunctuation = nextGroup && !nextGroup._isSpaceGroup &&
          (nextGroup.glyphs?.every(g => g.shrinksPrecedingWordSpace === true) ?? false);
        const defaultCode = isPunctuation ? 'QSP' : 'TSP';

        for (const glyph of group.glyphs) {
          const part = glyph.parts[0];
          if (part._fromSP) {
            // Implicit space: resolve to default
            part.codeName = defaultCode;
          } else {
            // Explicit space: flag if it differs from default
            if (part.codeName !== defaultCode) {
              part._differsFromDefault = true;
            }
          }
          delete part._fromSP;
        }
      }
      // Clean up internal markers
      delete group._isSpaceGroup;
      delete group._spaceIndex;
    }

    result.groups = parsedGroups;

    this.#extractPositionFromOptions(result);
    return result;
  }

  /**
   * Walk a blissObj structure and expand any PARTs that have a codeName
   * but no sub-parts. This supports toJSON round-trips where nested
   * parts were stripped.
   *
   * @param {Object} blissObj - Raw parsed structure with groups/glyphs/parts
   * @returns {Object} The same object, mutated with expanded parts
   */
  static expandParts(blissObj) {
    if (!blissObj?.groups) return blissObj;
    for (const group of blissObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        for (const part of glyph.parts) {
          BlissParser.#expandPartRecursive(part);
        }
      }
    }
    return blissObj;
  }

  /**
   * Copy definition metadata (defaultOptions, indicator, anchor offsets)
   * onto a part object. Shared by parseParts, #expandPartRecursive, and
   * #parseCodeStringToParts to keep the logic in one place.
   */
  static #applyDefinitionMetadata(part, definition) {
    if (definition.defaultOptions) {
      part.options = { ...definition.defaultOptions, ...(part.options || {}) };
    }
    if (definition.isIndicator) {
      part.isIndicator = true;
      part.width = definition.width ?? 2;
    } else if (definition.anchorOffsetY !== undefined) {
      part.anchorOffsetY = definition.anchorOffsetY;
    }
    if (definition.anchorOffsetX !== undefined) {
      part.anchorOffsetX = definition.anchorOffsetX;
    }
  }

  /**
   * Recursively expand a single part from its definition's codeString.
   * Only expands if the part has a codeName, a matching definition with
   * codeString, and no existing sub-parts.
   */
  static #expandPartRecursive(part) {
    if (!part.codeName || part.parts?.length > 0) return;

    const definition = blissElementDefinitions[part.codeName];
    if (!definition?.codeString) return;

    const codeString = definition.codeString;

    // Skip word-level codeStrings (contain /) — handled by word-as-part decomposition
    if (codeString.includes('/')) return;

    if (codeString.includes(';') || codeString.includes(':') || blissElementDefinitions[codeString]?.codeString) {
      part.parts = BlissParser.#parseCodeStringToParts(codeString);
    } else {
      if (builtInCodes.has(part.codeName)) {
        part.parts = [{ codeName: codeString }];
      } else {
        part.codeName = codeString;
      }
    }

    BlissParser.#applyDefinitionMetadata(part, definition);
  }

  /**
   * Parse a codeString like "HL8;HL8:0,8;VL8;VL8:8,0" into an array
   * of part objects, recursively expanding nested definitions.
   */
  static #parseCodeStringToParts(codeString, depth = 0) {
    if (depth > 50) throw new Error('Maximum recursion depth exceeded');
    const segments = codeString.split(';');
    const parts = [];

    for (const segment of segments) {
      const part = BlissParser.parsePartString(segment);

      const definition = blissElementDefinitions[part.codeName] || {};
      const innerCodeString = definition.codeString;

      if (innerCodeString) {
        if (innerCodeString.includes('/')) {
          // Word codeString — skip expansion at part level
        } else if (innerCodeString.includes(';') || innerCodeString.includes(':') || blissElementDefinitions[innerCodeString]?.codeString) {
          part.parts = BlissParser.#parseCodeStringToParts(innerCodeString, depth + 1);
        } else {
          if (builtInCodes.has(part.codeName)) {
            part.parts = [{ codeName: innerCodeString }];
          } else {
            part.codeName = innerCodeString;
          }
        }
      }

      BlissParser.#applyDefinitionMetadata(part, definition);
      parts.push(part);
    }

    return parts;
  }

}
