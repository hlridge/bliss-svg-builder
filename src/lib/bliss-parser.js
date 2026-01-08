/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions } from "./bliss-element-definitions.js";
import { hasPathData, createTextFallbackGlyph } from "./bliss-shape-creators.js";
import { blissModifiers } from "./bliss-modifiers.js";

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

    const parsedObject = {};

    const regex = /([\w-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]+)/g;
    let match;

    while ((match = regex.exec(extractedContent)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes and handle escapes for both double and single quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1).replace(/\\'/g, "'");
      }

      parsedObject[key] = value;
    }

    return parsedObject;
  }

    // Helper function to encode string and parse global options
  static encodeString(inputString, unescapeMap) {
    // ... existing encoding and global option parsing code here ...
    return { encodedString, globalOptions };
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
      const matched = codeString.match(/^([a-zA-Z0-9\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF\-._]+):?(\-?\d*(?:\.\d*)?)?,?(\-?\d*(?:\.\d*)?)?$/);

      if (matched) {
        let [, code, x, y] = matched;
        part.code = code;
        x !== undefined && (part.x = Number(x));
        y !== undefined && (part.y = Number(y));
      } else {
        part.error = `Invalid format: ${codeString}`;
      }
    }

    return part;
  }
  // Helper function to parse character parts
  static parseCharacterParts(encodedString, escapeMap, unescapeMap) {
    let parts = [];
    // ... existing character parts parsing code here ...
    return parts;
  }

  static fromString(inputString) {
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
        const spaceGlyphs = codes.map(code => ({
          parts: [{ code: code === 'SP' ? 'TSP' : code }]
        }));
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

      function processXCodes(codeString, definitions) {
        // First, expand multi-char X-codes (like Xhello -> Xh/Xe/Xl/Xl/Xo or XTXT_héllo)
        // Match Latin, Latin Extended, and Cyrillic letters
        let expanded = codeString.replace(/X([a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]{2,})/g, (match, chars) => {
          const allHavePath = [...chars].every(char => hasPathData(char));
          if (allHavePath) {
            return [...chars].map(char => `X${char}`).join('/');
          } else {
            const fallbackCode = `XTXT_${chars}`;
            if (!definitions[fallbackCode]) {
              const glyph = createTextFallbackGlyph(chars);
              glyph.isShape = true;
              definitions[fallbackCode] = glyph;
            }
            return fallbackCode;
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
              const fallbackCode = `XTXT_${char}`;
              if (!definitions[fallbackCode]) {
                const glyph = createTextFallbackGlyph(char);
                glyph.isShape = true;
                definitions[fallbackCode] = glyph;
              }
              result.push(fallbackCode);
            }
          } else {
            const chars = currentXSequence.map(code => code.slice(1)).join('');
            const allHavePath = [...chars].every(char => hasPathData(char));

            if (allHavePath) {
              currentXSequence.forEach(code => result.push(code));
            } else {
              const fallbackCode = `XTXT_${chars}`;
              if (!definitions[fallbackCode]) {
                const glyph = createTextFallbackGlyph(chars);
                glyph.isShape = true;
                definitions[fallbackCode] = glyph;
              }
              result.push(fallbackCode);
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

        // allowIndicatorReplacement: true for top-level user input, false for codeString expansion
        function expand(str, definitions, allowIndicatorReplacement = true) {
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
          // Don't expand codeString, but DO get kerning rules for external glyphs
          const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
          if (partLevelMatch) {
            const codeForKerning = partLevelMatch[2].split(':')[0]; // Strip any :x,y positioning
            const definition = definitions[codeForKerning] || {};
            // Return original string unchanged, but include kerning-related properties
            return [{
              part: str,
              ...(isHeadGlyph && { isHeadGlyph }),
              ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
              ...(definition.glyph && { glyph: definition.glyph }),
              ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
            }];
          }

          // Strip leading glyph-level bracket options to get the actual code for lookup
          // Only matches [options]code (NOT [options]>code, which are part-level options)
          const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
          const optionsPrefix = optionsMatch ? optionsMatch[1] : '';
          const codeForLookup = optionsPrefix ? str.slice(optionsPrefix.length) : str;

          // Check if this might be a WORD;INDICATORS pattern
          const [potentialBaseCode, ...rawIndicators] = codeForLookup.split(';');
          const filteredIndicators = rawIndicators.filter(ind => ind !== '');
          const hasInputIndicators = rawIndicators.length > 0;

          // Recursively resolve codeString to final form to check if it's a word
          const resolveToFinalCodeString = (code, visited = new Set()) => {
            if (visited.has(code)) return null;
            visited.add(code);
            const def = definitions[code];
            if (!def?.codeString) return null;
            if (!definitions[def.codeString]) return def.codeString;
            return resolveToFinalCodeString(def.codeString, visited);
          };
          const resolvedCodeString = resolveToFinalCodeString(potentialBaseCode);
          const isWordDefinition = resolvedCodeString?.includes('/') ?? false;

          // Helper: get bare code from string with potential options prefix
          const getBareCode = (str) => {
            const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
            if (partLevelMatch) return partLevelMatch[2].split(':')[0].split(';')[0];
            const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
            const code = optionsMatch ? str.slice(optionsMatch[1].length) : str;
            return code.split(':')[0].split(';')[0];
          };

          // Check if input indicators are real indicators (isIndicator: true)
          const inputIndicatorsAreRealIndicators = filteredIndicators.length > 0 &&
            filteredIndicators.every(ind => definitions[getBareCode(ind)]?.isIndicator === true);

          // Check if base code's definition has real indicators in its codeString
          const baseCodeDef = definitions[potentialBaseCode];
          const baseCodeStringParts = baseCodeDef?.codeString?.split(';') || [];
          const baseCodeExistingIndicators = baseCodeStringParts.slice(1).map(p => p.split(':')[0]);
          const baseCodeHasRealIndicators = baseCodeExistingIndicators.length > 0 &&
            baseCodeExistingIndicators.every(ind => definitions[ind]?.isIndicator === true);

          // Determine indicator operation (for non-words with real existing indicators)
          // Only apply when processing user input, not during codeString expansion
          const canModifyIndicators = allowIndicatorReplacement && !isWordDefinition && baseCodeHasRealIndicators;
          const shouldReplaceIndicators = canModifyIndicators && inputIndicatorsAreRealIndicators;
          const shouldRemoveIndicators = canModifyIndicators && hasInputIndicators && filteredIndicators.length === 0;

          // Use base code lookup for words, or for characters when replacing/removing indicators
          const useBaseCodeLookup = isWordDefinition || shouldReplaceIndicators || shouldRemoveIndicators;
          const definition = useBaseCodeLookup
            ? (definitions[potentialBaseCode] || {})
            : (definitions[codeForLookup] || {});

          // If we have a codeString, recursively expand it
          if (definition.codeString) {
            let codeStringToExpand = definition.codeString;

            // Replace/remove indicators on non-word definitions
            if (shouldReplaceIndicators || shouldRemoveIndicators) {
              const codeStringParts = definition.codeString.split(';');
              codeStringToExpand = codeStringParts[0];
              if (filteredIndicators.length > 0) {
                codeStringToExpand += ';' + filteredIndicators.join(';');
              }
            }

            const expandedParts = codeStringToExpand.split('/')
              .flatMap(subStr => expand(subStr, definitions, false))
              .map(expandedSubPart => {
                // Apply properties from the definition, falling back to existing values
                const isIndicator = definition.isIndicator ?? expandedSubPart.isIndicator;
                const isExternalGlyph = expandedSubPart.isExternalGlyph;
                const kerningRules = definition.kerningRules ?? expandedSubPart.kerningRules;
                const glyph = expandedSubPart.glyph;
                const shrinksPrecedingWordSpace = definition.shrinksPrecedingWordSpace;
                const glyphCode = expandedSubPart.glyphCode ?? definition.glyphCode;
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
                  ...(expandedSubPart.isHeadGlyph && { isHeadGlyph: expandedSubPart.isHeadGlyph })
                };
              });

            // Helper: Find head glyph index (explicit marker or fallback skipping modifiers)
            const findHeadGlyphIndex = (parts) => {
              // Check for explicit marker first
              const explicitIndex = parts.findIndex(p => p.isHeadGlyph);
              if (explicitIndex !== -1) return explicitIndex;

              // Fallback: skip modifier patterns (keep matching until no more found)
              let startIndex = 0;
              let foundMatch = true;
              while (foundMatch && startIndex < parts.length) {
                foundMatch = false;
                for (const modifierPattern of blissModifiers) {
                  const modifierCodes = modifierPattern.split('/');
                  if (startIndex + modifierCodes.length <= parts.length) {
                    let matches = true;
                    for (let i = 0; i < modifierCodes.length; i++) {
                      // Check glyphCode first (preserved after expansion), then fall back to part
                      const glyphCode = parts[startIndex + i].glyphCode || parts[startIndex + i].part.split(';')[0];
                      if (glyphCode !== modifierCodes[i]) {
                        matches = false;
                        break;
                      }
                    }
                    if (matches) {
                      startIndex += modifierCodes.length;
                      foundMatch = true;
                      break; // Restart pattern matching from new position
                    }
                  }
                }
              }
              return startIndex < parts.length ? startIndex : 0;
            };

            // Handle WORD;INDICATORS syntax (only for words, not single characters)
            // Single characters with indicators are handled by parseParts later
            if (isWordDefinition && filteredIndicators.length > 0 && expandedParts.length > 1) {
              // It's a word (multiple glyphs) - strip and replace indicators on head glyph
              const targetIndex = findHeadGlyphIndex(expandedParts);

              // Strip existing indicators from head glyph part
              const headPart = expandedParts[targetIndex].part;
              const basePartWithoutIndicators = headPart.split(';')[0];

              // Reattach with new indicators
              expandedParts[targetIndex].part = basePartWithoutIndicators + ';' + filteredIndicators.join(';');
            }

            // Handle WORD; (empty indicators) - removal for words only
            if (isWordDefinition && rawIndicators.length > 0 && filteredIndicators.length === 0 && expandedParts.length > 1) {
              const targetIndex = findHeadGlyphIndex(expandedParts);

              // Strip existing indicators from head glyph part
              const headPart = expandedParts[targetIndex].part;
              const basePartWithoutIndicators = headPart.split(';')[0];
              expandedParts[targetIndex].part = basePartWithoutIndicators;
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
            part: str,
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

        return str.split('/').flatMap(strPart => expand(strPart, definitions));
      }

      const processedGroupCodeString = processXCodes(groupCodeString, blissElementDefinitions);
      const expandedGlyphParts = replaceWithDefinition(processedGroupCodeString, blissElementDefinitions);

      let pendingRelativeKerning;
      let pendingAbsoluteKerning;

      for (let { part, shrinksPrecedingWordSpace, isIndicator, isExternalGlyph, glyph, kerningRules, glyphCode, isBlissGlyph, isHeadGlyph } of expandedGlyphParts) {
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

        let glyphCodeString = part;
        const glyphMatch = part.match(/^(\[.*?\])(?!>)(.*)/);
        if (glyphMatch) {
          const parsedOptions = this.#parseOptions(restorePlaceholders(glyphMatch[1]));
          glyphObj.options = { ...glyphObj.options, ...parsedOptions };
          glyphCodeString = glyphMatch[2];
        }

        const parseParts = (partsString) => {
          const parts = [];

          // Split on ; (brackets are already replaced with placeholders at this point)
          const twoPartPartStrings = partsString.split(';');
          for (const twoPartPartString of twoPartPartStrings) {
            const part = this.parsePartString(twoPartPartString, restorePlaceholders);

            const definition = blissElementDefinitions[part.code] || {};
            const codeString = definition.codeString;

            if (codeString) {
              if (codeString.includes(';') || codeString.includes(':') || blissElementDefinitions[codeString]?.codeString ) {
                part.parts = parseParts(definition.codeString);
                // Keep part.code to preserve identifier alongside expansion
              } else {
                part.code = definition.codeString;
              }
            }
            // Else keep part.code

            if (definition.isIndicator) {
              part.isIndicator = true;
              part.width = definition.width ?? 2;
            } else {
              if (definition.anchorOffsetY !== undefined) {
                part.anchorOffsetY = definition.anchorOffsetY;
              }
            }

            if (definition.anchorOffsetX !== undefined) {
              part.anchorOffsetX = definition.anchorOffsetX
            }

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

    // Step 4: Resolve SP→QSP for single-space groups before punctuation
    for (let i = 0; i < parsedGroups.length; i++) {
      const group = parsedGroups[i];
      if (group._isSpaceGroup && group.glyphs.length === 1) {
        const nextGroup = parsedGroups[i + 1];
        if (nextGroup && !nextGroup._isSpaceGroup) {
          // Check if next group is punctuation-only
          const isPunctuation = nextGroup.glyphs?.every(g =>
            g.shrinksPrecedingWordSpace === true
          ) ?? false;
          if (isPunctuation) {
            group.glyphs[0].parts[0].code = 'QSP';
          }
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

  static #fromStream(blissStream) {
    // Parse a Blissymbolics stream and convert it to an internal representation (BlissComposition)
  }

  static #toString(blissComposition) {
    // Convert the internal representation to a Blissymbolics string
  }

  static #toObject(blissComposition) {
    // Convert the internal representation to a Blissymbolics object (JSON)
  }

  static #toStream(blissComposition) {
    // Convert the internal representation to a Blissymbolics stream
  }
}
