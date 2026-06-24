/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes } from "./bliss-element-definitions.js";
import { hasPathData, createTextFallbackGlyph } from "./bliss-shape-creators.js";
import {
  resolveHeadIndex
} from "./bliss-head-glyph-exclusions.js";
import {
  getSemanticRoot,
  hasSemantic,
  filterToIndicators,
  buildWithSemantic,
  getBareCode
} from "./indicator-utils.js";
import { MAX_RECURSION_DEPTH, WARNING_CODES } from "./bliss-constants.js";

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

    const bracketMatch = optionsString.match(/\[([^\]]*)\]/);
    // Stryker disable next-line all: internal invariant, unreachable from public API
    if (!bracketMatch) {
      throw new Error(`#parseOptions: expected bracketed input, got: ${optionsString}`);
    }
    const extractedContent = bracketMatch[1];
    if (!extractedContent) return;

    const parsedObject = Object.create(null);

    const regex = /([\w-]+)(?:\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]*))?/g;
    let match;

    while ((match = regex.exec(extractedContent)) !== null) {
      const key = match[1].trim();

      if (match[2] === undefined) {
        // Bare key (e.g., [grid]) — treat as boolean true
        parsedObject[key] = true;
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
        // A recognizable code followed by a malformed coordinate suffix
        // (B291:abc, B291:., B291:5,6,7) is a coordinate FORMAT error, not an
        // unknown code: the code lexes fine, only the `:x,y` failed to parse.
        // Tag it so the renderer surfaces MALFORMED_COORDINATES instead of the
        // misleading UNKNOWN_CODE. The token is still dropped (invalid syntax is
        // not carried forward); only the warning code differs. The syntax error
        // is reported before semantics, so an unknown code with a bad suffix
        // (ZZ:abc) is MALFORMED_COORDINATES too. The `:` (not `,`) is the
        // trigger: it is the marker that says "a coordinate follows".
        if (/^[a-zA-Z0-9À-ſͰ-ϿЀ-ӿ\-._]+:/.test(codeString)) {
          part.errorCode = WARNING_CODES.MALFORMED_COORDINATES;
        }
      }
    }

    return part;
  }
  static fromString(inputString) {
    if (typeof inputString === 'string' && inputString.length > 10_000) {
      throw new Error('Input string exceeds maximum length of 10,000 characters');
    }
    inputString = inputString.trim();
    const result = {};
    const parseWarnings = [];

    // Parse a Blissymbolics string and convert it to an internal representation (BlissComposition)
    //Ex. 
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4{hej}/C8:0,8;[color=green]E:0,11{hopp}/AA8N:0,2"
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4/C8:0,8;[color=green]E:0,11/AA8N:0,2{hej hopp}"

    let placeholderMap = {};
    let placeholderCount = 0;

    // Preserve content in both {...} and [...] to protect spaces.
    // {...} uses greedy match because text content must be able to contain any
    // characters, including literal `{` and `}`. The downside is that multiple
    // `{...}` blocks in one input collapse into a single match, which silently
    // merges the glyphs between them. We emit UNSUPPORTED_TEXT_BLOCKS below to
    // make that visible. Proper multi-block support requires a stateful
    // tokenizer and ships with the {text} rendering feature
    // (see .claude/backlog/text-overlay.md).
    // [...] uses non-greedy match since it can appear multiple times.
    if ((inputString.match(/\{/g) || []).length > 1) {
      parseWarnings.push({
        code: WARNING_CODES.UNSUPPORTED_TEXT_BLOCKS,
        message: 'Multiple `{...}` blocks in one input are not supported by the current parser. Behavior is undefined until proper text-block tokenization ships. Use a single trailing `{text}` per group.',
        source: inputString,
      });
    }
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
    if (globalOptionsString && globalOptionsString.match(/^\[.*\]$/)) {
      result.options = this.#parseOptions(restorePlaceholders(globalOptionsString)) || {};
    } else {
      if (globalOptionsString && globalOptionsString.length > 0) {
        const restored = restorePlaceholders(globalOptionsString);
        parseWarnings.push({
          code: WARNING_CODES.MALFORMED_GLOBAL_OPTIONS,
          message: `Invalid global options syntax: "${restored}||" - expected [options]|| format. Ignoring.`,
          source: restored,
        });
      }
      result.options = {};
    }

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

    // Step 3: Build parsed groups, staging spaces for TSP/QSP resolution
    const parsedGroups = [];
    for (let gi = 0; gi < groupedCodes.length; gi++) {
      const { codes, isSpace } = groupedCodes[gi];

      if (isSpace) {
        // Keep explicit spaces and mark implicit SP for the later TSP/QSP pass.
        // See Step 4 below for SP -> TSP/QSP resolution.
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
          const restoredBeforePipe = restorePlaceholders(beforePipe);
          parseWarnings.push({
            code: WARNING_CODES.MALFORMED_GROUP_OPTIONS,
            message: `Invalid group options syntax: "${restoredBeforePipe}|" - expected [options]| format. Ignoring.`,
            source: restoredBeforePipe
          });
          groupCodeString = afterPipe;
        } else {
          groupCodeString = afterPipe;
        }
      } else {
        groupCodeString = twoPartGroupString;
      }

      function processXCodes(codeString) {
        // First, expand multi-char X-codes (like Xhello -> Xh/Xe/Xl/Xl/Xo or XTXT_héllo)
        // Anchor to a glyph boundary (start of string or after /) so an X+letters
        // sequence embedded in a longer code name (e.g. a custom code EXTRA) is not
        // rewritten mid-token. Match Latin, Latin Extended, and Cyrillic letters.
        let expanded = codeString.replace(/(?<=^|\/)X([a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]{2,})/g, (match, chars, offset) => {
          // Skip expansion when followed by ; (word expansion would break composition).
          // A past-the-end index reads as undefined, which is never ';', so no bounds guard.
          const after = codeString[offset + match.length] === ';';
          if (after) return match;

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

        // Rule-3 automatic scan: skip exclusions from the start, stop at the
        // first non-excluded character, or pick by priority tier when the
        // whole word is exclusions. Custom glyph identity (glyphCode) governs
        // first: a custom glyph wrapping an exclusion is its own character,
        // not that exclusion. Without an identity, _scanCode (the character
        // code stashed at part creation) keeps exclusion matching immune to
        // decorations written onto part strings by outer expansion levels.
        const findFallbackHeadIndex = (parts) => {
          const getCode = (i) => parts[i].glyphCode ?? parts[i]._scanCode ?? parts[i].part.split(';')[0];
          return resolveHeadIndex(parts.map((_, i) => getCode(i)));
        };

        // Per-word-string head resolution (head-marker contract):
        // rule 2 -- the leftmost written marker (_marker) in this word-string
        // wins; later ones warn and drop. With no written marker, rule 3
        // scans for the head position and rule 4 redirects the crown to the
        // designated head (_designation) of the fragment the scan stopped in.
        const resolveWordStringHead = (parts, label) => {
          const markerIndexes = parts.flatMap((p, i) => (p._marker ? [i] : []));
          for (const laterIndex of markerIndexes.slice(1)) {
            delete parts[laterIndex]._marker;
            parseWarnings.push({ code: WARNING_CODES.MULTIPLE_HEAD_MARKERS, message: `Multiple head markers (^) found in word: ${label}. Using first marked glyph.`, source: label });
          }
          if (markerIndexes.length > 0) {
            delete parts[markerIndexes[0]]._marker;
            return { index: markerIndexes[0], isDesignated: true };
          }
          const stop = findFallbackHeadIndex(parts);
          // Designated parts always carry _frag, so a fragment-less stop
          // (frag === undefined) can never match one.
          const frag = parts[stop]._frag;
          const designated = parts.findIndex(p => p._frag === frag && p._designation);
          if (designated !== -1) return { index: designated, isDesignated: true };
          return { index: stop, isDesignated: false };
        };

        // Consume a fragment's resolution into a single upward-facing
        // designation: an embedded alias contributes its characters plus at
        // most one designated head (rule 4); deeper bookkeeping is cleared.
        let fragCounter = 0;
        // Seal a span into upward-facing designations. A span containing
        // _wordBreak markers (a nested multi-word alias) is chunked at the
        // breaks and each word-string is sealed on its own fragment, so a
        // marker in a non-first word keeps its designation (rule 2: each
        // // word-string resolves independently). Returns the first word's
        // resolution in full-span coordinates, for callers that target the
        // first word's head (WORD;INDICATORS). A break-free span seals as a
        // single fragment, exactly as before.
        const sealFragment = (parts, label) => {
          let firstResolved = null;
          const sealChunk = (start, end) => {
            const chunk = parts.slice(start, end);
            // Skip empty chunks (adjacent/leading/trailing breaks, or an empty
            // span) so resolveWordStringHead is never handed []. Also the empty
            // -span guard: a break-free empty span produces one empty chunk and
            // returns null.
            if (chunk.length === 0) return;
            const resolved = resolveWordStringHead(chunk, label);
            const fragId = ++fragCounter;
            for (const p of chunk) {
              delete p._designation;
              p._frag = fragId;
            }
            if (resolved.isDesignated) chunk[resolved.index]._designation = true;
            if (firstResolved === null) {
              firstResolved = { index: start + resolved.index, isDesignated: resolved.isDesignated };
            }
          };
          let chunkStart = 0;
          for (let i = 0; i < parts.length; i++) {
            if (parts[i]._wordBreak) {
              sealChunk(chunkStart, i);
              chunkStart = i + 1;
            }
          }
          sealChunk(chunkStart, parts.length);
          return firstResolved;
        };

        // Resolve and crown one final word: only an explicit `^`/designation
        // is stamped. Fallback heads stay unstamped and are resolved at query
        // time (render/serialize/snapshot) via resolveHeadIndex, so the stamp
        // can never go stale after a structural mutation reorders the word.
        const crownWordChunk = (parts, label) => {
          if (parts.length === 0) return;
          const resolved = resolveWordStringHead(parts, label);
          if (resolved.isDesignated) {
            parts[resolved.index].isHeadGlyph = true;
          }
        };

        // Split expanded parts at word-break markers and crown each word
        // independently (rule 2: words split by // each have their own head).
        const crownWordChunks = (parts, label) => {
          let chunk = [];
          for (const p of parts) {
            if (p._wordBreak) {
              crownWordChunk(chunk, label);
              chunk = [];
            } else {
              chunk.push(p);
            }
          }
          crownWordChunk(chunk, label);
        };

        // Helper to get base code from an expanded glyph, stripping the indicator
        // parts. The base is the NON-indicator parts and the strippable
        // indicators are the indicator parts, derived position-independently (not
        // by assuming segment 0 is the base) so an indicator-first or all-indicator
        // head is read correctly. Defined at top level for use in ;; handling and
        // expand().
        const getBaseCode = (glyph) => {
          const parts = glyph.part.split(';');
          const nonIndicatorParts = parts.filter(p => {
            const bareCode = p.split(':')[0];
            return !definitions[bareCode]?.isIndicator;
          });
          // Atomic compound indicator: every part is an indicator, so there is no
          // base to strip - the stack itself IS the base. Decompose to the parts
          // (do NOT keep the glyph-identity fast-path here: a glyph-identity head
          // keeps its parts as one composite unit and mis-positions a later
          // stacked indicator, so it must render as a flat baseless stack). R15 3b-5.
          if (nonIndicatorParts.length === 0) return glyph.part;
          // Normal base-first head: preserve the glyph-identity fast-path so a
          // composite glyph (e.g. B502 = 'DOT:2,10;HL4:0,12;DOT:2,14') keeps its
          // code. Simple code only (no / or ; that indicate words/codeStrings).
          const isSimpleGlyphCode = glyph.glyphCode &&
            !glyph.glyphCode.includes('/') &&
            !glyph.glyphCode.includes(';');
          if (isSimpleGlyphCode) return glyph.glyphCode;
          return nonIndicatorParts.join(';');
        };

        // Extract the strippable indicator parts of a glyph (position-independent).
        // An all-indicator (atomic compound indicator) glyph has no strippable
        // applied indicator - the stack itself is the base - so it returns []. R15 3b-5.
        const getIndicatorParts = (glyph) => {
          const parts = glyph.part.split(';');
          const indicatorParts = parts.filter(p => {
            const bareCode = p.split(':')[0];
            return definitions[bareCode]?.isIndicator === true;
          });
          if (indicatorParts.length === parts.length) return [];
          return indicatorParts;
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

        // Detect ;; for word-level indicators on inline multi-character expressions.
        // Pattern: baseCode;;indicators. R14: instead of baking the indicators
        // onto the head glyph, store them as a reversible overlay on the group.
        // The base glyphs expand and crown as usual; the overlay is resolved onto
        // the head at decode time (render + serialize) via
        // mergeWordIndicatorsOntoHead, so `;;` round-trips and clears non-
        // destructively. Single ;; on a pre-defined word also becomes an overlay
        // (scope-fenced: single ; on a word still bakes via replaceWithDefinition).
        const wordLevelMatch = str.match(/^(.+);;(.*)$/);
        if (wordLevelMatch) {
          const [_, baseCode, rawIndicators] = wordLevelMatch;

          // A word-level indicator list must be the trailing part of the word:
          // exactly one `;;`, and no `/`-separated glyph after the indicators
          // (greedy match means rawIndicators holds everything after the last
          // `;;`). Otherwise the whole WORD is invalid: a word-level indicator
          // is a word property (it sets part-of-speech), so a malformed one
          // invalidates the word, not one character. Stash a word-error on the
          // first part; the assembly loop lifts it onto group.errorCode, where
          // the element collapses the word to a single error placeholder (the
          // L1 analogue of the L2 character placeholder) and records ONE warning.
          // str is inside the wordLevelMatch guard, so it always contains `;;`
          // (match is non-null). The base still expands to real (non-space)
          // glyphs so the failed group advances like a normal word; those glyphs
          // are not rendered (the placeholder stands in), and toString re-emits
          // the original `str` so parse(toString(x)) re-flags (round-trip).
          const isMalformed = str.match(/;;/g).length > 1 || rawIndicators.includes('/');
          if (isMalformed) {
            const fallbackParts = str.replace(/;;/g, ';').split('/').flatMap(strPart => expand(strPart, definitions));
            crownWordChunks(fallbackParts, wordCode);
            if (fallbackParts.length > 0) {
              fallbackParts[0]._wordError = {
                code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
                message: `Malformed word-level indicator in "${str}": ;; must be the trailing part of a word.`,
                source: str,
              };
            }
            return fallbackParts;
          }

          const stripSemantic = rawIndicators.startsWith('!');
          const indicators = stripSemantic ? rawIndicators.slice(1) : rawIndicators;

          // Process baseCode using the normal flow (splits on / and expands each
          // part): definitions, ^ markers, options, etc.
          const expandedParts = baseCode.split('/').flatMap(strPart => expand(strPart, definitions));

          // Resolve and crown the word so the head is identifiable at decode.
          crownWordChunks(expandedParts, wordCode);

          // Stash the overlay on the first part; the assembly loop lifts it onto
          // the group. Codes are merged/indicator-filtered at decode, not here;
          // filter(Boolean) drops empties so a bare `;;` yields an empty list.
          const codes = indicators.split(';').filter(Boolean);
          if (expandedParts.length > 0) {
            if (expandedParts[0]._wordIndicators) {
              // The leading glyph already promoted an applied indicator into the
              // single word-level slot; this explicit `;;` is a later contender.
              // First-wins (mirrors mergeWithNext): keep the promoted overlay and
              // drop the explicit one loudly (Decision Log #7), so `/`-composition
              // stays byte-identical to mergeWithNext.
              const dropped = ';;' + (stripSemantic ? '!' : '') + codes.join(';');
              parseWarnings.push({
                code: WARNING_CODES.DROPPED_WORD_INDICATOR,
                message: `An explicit word-level indicator overlay (${dropped}) collided with the leading glyph's promoted overlay. The word keeps only the first overlay.`,
                source: dropped,
              });
            } else {
              expandedParts[0]._wordIndicators = { codes, stripSemantic };
            }
          }

          return expandedParts;
        }

        // isTopLevel: true for user input, false for internal codeString expansion
        // Indicator replacement only applies at top level (user input)
        function expand(str, definitions, isTopLevel = true, depth = 0) {
          let hasMarker = false;
          if (str.endsWith('^')) {
            hasMarker = true;
            str = str.slice(0, -1);
          }
          const parts = expandSegment(str, definitions, isTopLevel, depth);
          if (hasMarker) {
            if (parts.length === 1) {
              // Rule 1: ^ attaches to a character (one expanded glyph),
              // including an alias that resolves to a single character.
              parts[0]._marker = true;
            } else {
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_HEAD_MARKER,
                message: `Head marker (^) ignored on "${restorePlaceholders(str)}": it expands to multiple characters. Mark a single character instead.`,
                source: restorePlaceholders(str),
              });
            }
          }
          return parts;
        }

        function expandSegment(str, definitions, isTopLevel, depth) {
          if (depth > MAX_RECURSION_DEPTH) throw new Error('Maximum recursion depth exceeded');

          // Handle part-level options with > (like [x=2]>B291 or [color=red]>XW)
          const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
          if (partLevelMatch) {
            const codeForKerning = partLevelMatch[2].split(':')[0];
            const definition = definitions[codeForKerning] || {};
            return [{
              part: str,
              _scanCode: partLevelMatch[2].split(';')[0].split(':')[0],
              ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
              ...(definition.char && { char: definition.char }),
              ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
            }];
          }

          // Strip leading glyph-level bracket options
          const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
          const optionsPrefix = optionsMatch ? optionsMatch[1] : '';
          const codeForLookup = optionsPrefix ? str.slice(optionsPrefix.length) : str;

          const [potentialBaseCodeRaw, ...rawIndicators] = codeForLookup.split(';');
          // Detect strip-semantic modifier (! prefix on first indicator)
          const stripSemantic = rawIndicators.length > 0 && rawIndicators[0]?.startsWith('!');
          if (stripSemantic) rawIndicators[0] = rawIndicators[0].slice(1);
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

          // Check if base code supports indicator replacement.
          // The .slice(1) "segment 0 is the base" assumption is safe on this
          // single-glyph replace path: an indicator-first base is undefinable
          // (the D-S1a define guard rejects any type:'glyph' that bakes an
          // indicator, no built-in has an indicator-first unflagged codeString,
          // and a bare alias routes through promotion which skips this path), so
          // a base whose segment 0 is an indicator never reaches here. Generalizing
          // it would add a branch no test can cover. R15 3b-5 (guarded by
          // BlissSVGBuilder.compound-indicator-application.test.js).
          const baseCodeDef = definitions[potentialBaseCode];
          const baseCodeStringParts = baseCodeDef?.codeString?.split(';') || [];
          const baseCodeExistingIndicators = baseCodeStringParts.slice(1).map(p => p.split(':')[0]);
          const baseCodeSupportsReplacement = baseCodeExistingIndicators.length > 0 &&
            baseCodeExistingIndicators.every(ind => definitions[ind]?.isIndicator === true);

          // Don't apply indicator replacement to compound indicators (like B928 = B92;B87)
          // These are indicators composed of multiple indicator parts, not characters with replaceable indicators
          const baseIsCompoundIndicator = baseCodeDef?.isIndicator === true;

          // A base+indicator *alias* (a bare definition: has a codeString but is
          // not a glyph, shape, or external glyph) promotes an applied indicator
          // into the reversible word-level ;; overlay instead of destroying the
          // baked indicator via char-level replace-all. User glyphs keep
          // replace-all. Mirrors the bare-alias test in #resolveBareAliases.
          // See [[feedback_no_indicator_of_a_part]] (R15 Task 3b-1).
          const baseIsBareAlias = !!baseCodeDef && baseCodeDef.codeString !== undefined
            && !baseCodeDef.isBlissGlyph && !baseCodeDef.isShape
            && !baseCodeDef.isExternalGlyph && !baseCodeDef.glyphCode;

          // Indicator replacement: only for top-level, non-words, with matching indicator types
          // Skip if the base code itself is an indicator (compound indicators should keep their structure)
          const canModifyIndicators = isTopLevel && !isWordDefinition && baseCodeSupportsReplacement && !baseIsCompoundIndicator;
          const shouldReplace = canModifyIndicators && inputIndicatorsAreReal;
          // Promotion: route the applied indicator into the reversible ;; overlay
          // rather than the destructive char-level replace, for any base+indicator
          // alias. The ;; overlay is the word-level slot; when several glyphs in
          // one word promote, the assembly loop keeps the first glyph's slot and
          // drops the rest (first-wins, mirrors mergeWithNext). See the word-slot
          // model: 2026-06-18-word-indicator-slot-and-head-model-design.md.
          const shouldPromote = shouldReplace && baseIsBareAlias;
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

            // Modify codeString for indicator replacement/removal. Promotion (a
            // base+indicator alias) skips this so the baked indicator stays in
            // the codeString; the applied indicator becomes a ;; overlay below.
            if ((shouldReplace || shouldRemove) && !shouldPromote) {
              const codeStringParts = definition.codeString.split(';');
              // .slice(1) "segment 0 is the base" is safe here for the same reason
              // as the baseCodeExistingIndicators scan above: an indicator-first
              // base is undefinable and never reaches this single-glyph replace
              // path (D-S1a + no qualifying built-in + bare-alias promotion). R15 3b-5.
              const existingIndicatorCodes = codeStringParts.slice(1).map(p => p.split(':')[0]);
              const semanticRoot = !stripSemantic ? getSemanticRoot(existingIndicatorCodes, definitions) : null;

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
                _scanCode: potentialBaseCode,
                ...(definition.shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace: true }),
                ...(definition.isIndicator === true && { isIndicator: true }),
                ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
                ...(definition.char && { char: definition.char }),
                ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
                ...(definition.glyphCode && { glyphCode: definition.glyphCode }),
                ...(definition.isBlissGlyph && { isBlissGlyph: definition.isBlissGlyph }),
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
                // Rule 2: each //-segment of the codeString is its own
                // word-string; seal its markers into a fragment designation.
                sealFragment(segmentParts, potentialBaseCode);
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
                // Word-break markers carry no glyph identity; pass them through
                // untouched so definition props don't attach and the break
                // survives into final word-chunk crowning (N6).
                if (expandedSubPart._wordBreak) return expandedSubPart;
                // Apply properties from the definition, falling back to existing values
                const isIndicator = definition.isIndicator ?? expandedSubPart.isIndicator;
                const isExternalGlyph = expandedSubPart.isExternalGlyph;
                const kerningRules = definition.kerningRules ?? expandedSubPart.kerningRules;
                const char = expandedSubPart.char;
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
                  ...(char && { char }),
                  ...(kerningRules && { kerningRules }),
                  ...(glyphCode && { glyphCode }),
                  ...(isBlissGlyph && { isBlissGlyph }),
                  ...(expandedSubPart._marker && { _marker: true }),
                  ...(expandedSubPart._designation && { _designation: true }),
                  ...(expandedSubPart._frag !== undefined && { _frag: expandedSubPart._frag }),
                  ...(expandedSubPart._scanCode !== undefined && { _scanCode: expandedSubPart._scanCode }),
                  ...(expandedSubPart.defaultOptions && { defaultOptions: expandedSubPart.defaultOptions })
                };
              });

            // Rule 2: a definition's codeString is its own word-string.
            // Resolve its written markers now; the result is carried upward
            // as at most one designation that only acts when this fragment
            // occupies the word's head position (rule 4).
            const fragResolved = sealFragment(expandedParts, potentialBaseCode);

            // Handle WORD;INDICATORS syntax (only for multi-glyph words, not single characters)
            // Single characters with indicators are handled by parseParts later
            // Use expandedParts.length to detect words (covers aliases like TestAlias → TestWord1 → H^/C)
            if (expandedParts.length > 1 && filteredIndicators.length > 0) {
              // It's a word (multiple glyphs) - strip and replace indicators on head glyph
              // Only use codes that are real indicators
              const validInds = filterToIndicators(filteredIndicators, definitions);
              if (validInds.length > 0) {
                const targetIndex = fragResolved.index;
                const existingInds = getIndicatorParts(expandedParts[targetIndex]);
                const semanticRoot = !stripSemantic ? getSemanticRoot(existingInds, definitions) : null;
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
              const targetIndex = fragResolved.index;
              const existingInds = getIndicatorParts(expandedParts[targetIndex]);
              const semanticRoot = !stripSemantic ? getSemanticRoot(existingInds, definitions) : null;
              const baseCode = getBaseCode(expandedParts[targetIndex]);

              expandedParts[targetIndex].part = semanticRoot
                ? baseCode + ';' + semanticRoot
                : baseCode;
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

            // Promotion (R15 Task 3b-1): stash the applied indicators as a
            // reversible ;; overlay on the head part; the assembly loop lifts it
            // onto group.wordIndicators (mirrors the ;; handler ~L559). The
            // alias's baked indicator stays on the character and reappears when
            // the overlay is cleared. See [[feedback_no_indicator_of_a_part]].
            if (shouldPromote && expandedParts.length > 0) {
              expandedParts[0]._wordIndicators = { codes: filteredIndicators, stripSemantic };
            }
            return expandedParts;
          }

          // Base case - create object with properties from definition
          const isIndicator = definition.isIndicator;
          const isExternalGlyph = definition.isExternalGlyph;
          const kerningRules = definition.kerningRules;
          const char = definition.char;
          const glyphCode = definition.glyphCode;
          const isBlissGlyph = definition.isBlissGlyph;
          const shrinksPrecedingWordSpace = definition.shrinksPrecedingWordSpace;
          // stripSemantic consumed the ! marker from rawIndicators above, but `str`
          // still contains it. Strip it here so it doesn't leak into part.codeName.
          const baseStr = stripSemantic ? str.replace(';!', ';') : str;
          return [{
            part: isBareEmptyStrip ? optionsPrefix + potentialBaseCode + positionSuffix : baseStr.replace(/;$/, ''),
            _scanCode: potentialBaseCode,
            ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
            ...(isIndicator === true && { isIndicator }),
            ...(isExternalGlyph && { isExternalGlyph }),
            ...(char && { char }),
            ...(kerningRules && { kerningRules }),
            ...(glyphCode && { glyphCode }),
            ...(isBlissGlyph && { isBlissGlyph })
          }];
        }

        const expandedParts = str.split('/').flatMap(strPart => expand(strPart, definitions));

        // Resolve and crown the head of each final word (head-marker contract)
        crownWordChunks(expandedParts, wordCode);

        return expandedParts;
      }

      const processedGroupCodeString = processXCodes(groupCodeString);
      const expandedGlyphParts = replaceWithDefinition(processedGroupCodeString, blissElementDefinitions);

      let pendingRelativeKerning;
      let pendingAbsoluteKerning;

      for (let { part, shrinksPrecedingWordSpace, isIndicator, isExternalGlyph, char, kerningRules, glyphCode, isBlissGlyph, isHeadGlyph, defaultOptions, _wordBreak, _wordIndicators, _wordError } of expandedGlyphParts) {
        // Lift a word-level fail-render flag onto its enclosing group (mirrors
        // the _wordIndicators lift below). A malformed `;;` makes the whole word
        // invalid; the element reads group.errorCode and collapses it to one
        // placeholder. The flag is static (no `;;` structure survives to
        // re-derive from), so it persists across rebuild; errorSource carries the
        // original string for the toString round-trip.
        if (_wordError) {
          group.errorCode = _wordError.code;
          group.error = _wordError.message;
          group.errorSource = _wordError.source;
        }
        // R14/R15: lift a word-level indicator overlay onto its enclosing group.
        // The word-level ;; slot is a WORD property owned by the FIRST glyph:
        // the first glyph (group.glyphs still empty) claims it; a later glyph's
        // promoted overlay is dropped + DROPPED_WORD_INDICATOR (first-wins, so
        // `/`-composition matches mergeWithNext). An empty first slot still wins.
        if (_wordIndicators) {
          if (group.glyphs.length === 0) {
            group.wordIndicators = _wordIndicators;
          } else {
            const { codes = [], stripSemantic } = _wordIndicators;
            const dropped = ';;' + (stripSemantic ? '!' : '') + codes.join(';');
            parseWarnings.push({
              code: WARNING_CODES.DROPPED_WORD_INDICATOR,
              message: `Composing glyphs into one word dropped a later glyph's word-level indicator overlay (${dropped}). The word keeps only the first glyph's overlay.`,
              source: dropped,
            });
          }
        }
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
          ...(typeof char === "string" && { char }),
          ...((kerningRules !== null && kerningRules?.constructor === Object) && { kerningRules }),
          ...(typeof glyphCode === "string" && { glyphCode }),
          ...(isBlissGlyph === true && { isBlissGlyph }),
          ...(isHeadGlyph === true && { isHeadGlyph })
        };

        const kerningMatch = part.match(/^(RK|AK)(?::([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?$/);
        if (kerningMatch) {
          const [_, kerningType, kerningValue = 0] = kerningMatch;
          if (kerningType === "RK") pendingRelativeKerning = Number(kerningValue);
          if (kerningType === "AK") pendingAbsoluteKerning = Number(kerningValue);
          continue;
        }

        // A kerning marker (RK:/AK:) whose value failed the grammar above is a
        // malformed kerning value (RK:abc, RK:., RK:.5.5, RK:5e2, RK:). Warn and
        // drop it — apply no kerning, leaving the next glyph unshifted — rather
        // than letting it fall through as a misleading UNKNOWN_CODE. The ^ anchor
        // keeps a real code that merely contains RK:/AK: (e.g. B86RK:abc) from
        // being mis-read as kerning.
        if (/^(RK|AK):/.test(part)) {
          parseWarnings.push({
            code: WARNING_CODES.MALFORMED_KERNING_VALUE,
            message: `Malformed kerning value "${part}"; the marker is ignored.`,
            source: part,
          });
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
          if (depth > MAX_RECURSION_DEPTH) throw new Error('Maximum recursion depth exceeded');
          const parts = [];

          // Split on ; (brackets are already replaced with placeholders at this point).
          // Drop empty segments so a leading ';' (an empty base, e.g. ';B86')
          // yields an indicator-only glyph instead of a failed empty part.
          // Word-level ';;' is resolved upstream and never reaches here.
          const twoPartPartStrings = partsString.split(';').filter(s => s !== '');
          for (const [partIndex, twoPartPartString] of twoPartPartStrings.entries()) {
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
                part.codeName = definition.codeString;
              }
            }

            // Detect unexpanded multi-char X-codes (word text used as ; part)
            if (/^X[a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]{2,}$/.test(part.codeName)) {
              part.error = `Multi-character text "${part.codeName.slice(1)}" is a word and cannot be composed with ;`;
              part.errorCode = 'WORD_AS_PART';
            }

            BlissParser.#applyDefinitionMetadata(part, definition);
            BlissParser.#flagCompositePart(part, partIndex);

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
          (nextGroup.glyphs?.length > 0) &&
          nextGroup.glyphs.every(g => g.shrinksPrecedingWordSpace === true);
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

    if (parseWarnings.length) result._parseWarnings = parseWarnings;
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
        for (const [partIndex, part] of glyph.parts.entries()) {
          BlissParser.#expandPartRecursive(part);
          BlissParser.#flagCompositePart(part, partIndex);
        }
      }
    }
    return blissObj;
  }

  /**
   * Re-derive the COMPOSITE_AS_PART flag on every (already-expanded) part of a
   * structure, in place. The flag is position-dependent (a composed alias is a
   * violation only when non-leading), so it must be recomputed whenever the
   * mutation API reassembles a glyph: insertPart parses a new part through an
   * `H;<code>` scaffold (index 1) and may then place it at index 0, and
   * removePart can shift a non-leading part to the leading slot. Unlike
   * expandParts this does not expand, so it is safe to run on every rebuild.
   */
  static reflagCompositeParts(blissObj) {
    if (!blissObj?.groups) return blissObj;
    for (const group of blissObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        for (const [partIndex, part] of glyph.parts.entries()) {
          BlissParser.#flagCompositePart(part, partIndex);
        }
      }
    }
    return blissObj;
  }

  /**
   * Flag a non-leading ;-part whose operand is a composed, unflagged alias.
   * `;` is part-merge, so its operands must be PARTS: a primitive, or a flagged
   * reusable definition (an indicator, a type:'glyph', or a type:'shape'). A
   * character/word alias that expands to multiple parts is a higher-level unit;
   * superimposing it as a part would bury its internal structure (e.g. a baked
   * indicator), so it is rejected. The predicate:
   * - index > 0: a leading operand is the base (and the promotion path), not a part;
   * - part.parts.length > 1: a composition (a primitive or single-code rename
   *   alias expands to <= 1 part and stays legal);
   * - part.isIndicator !== true: a flagged indicator is a legal part (excludes a
   *   built-in compound indicator such as B85 = B270;B86 or B98 = B97;B99);
   * - the definition is not a flagged glyph/shape: isBlissGlyph / isShape are
   *   carried by the DEFINITION, not stamped onto the part, so they are read from
   *   the registry (this exempts the ~1000 built-in composite characters and
   *   custom type:'glyph'/'shape' definitions, which are legal parts).
   * Must run AFTER #applyDefinitionMetadata stamps part.isIndicator. The element
   * layer then fails the whole character to render with a COMPOSITE_AS_PART
   * warning. Shared by parseParts (DSL input) and expandParts (object input).
   */
  static #flagCompositePart(part, index) {
    const def = blissElementDefinitions[part.codeName];
    if (index > 0 && part.parts?.length > 1 && part.isIndicator !== true &&
        def?.isBlissGlyph !== true && def?.isShape !== true) {
      part.error = `"${part.codeName}" is a composition and cannot be a part; a ; part must be a primitive or a flagged glyph`;
      part.errorCode = 'COMPOSITE_AS_PART';
    } else if (part.errorCode === 'COMPOSITE_AS_PART') {
      // The flag is position-dependent, so it is authoritative at the CURRENT
      // index: clear a stale one stamped elsewhere. The mutation API parses a
      // new part through an `H;<code>` scaffold (index 1) and may then insert it
      // at index 0; re-evaluation here on rebuild must un-bury it.
      delete part.errorCode;
      delete part.error;
    }
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
      part.codeName = codeString;
    }

    BlissParser.#applyDefinitionMetadata(part, definition);
  }

  /**
   * Parse a codeString like "HL8;HL8:0,8;VL8;VL8:8,0" into an array
   * of part objects, recursively expanding nested definitions.
   */
  static #parseCodeStringToParts(codeString, depth = 0) {
    if (depth > MAX_RECURSION_DEPTH) throw new Error('Maximum recursion depth exceeded');
    // Drop empty segments, mirroring parseParts: a definition codeString with a
    // leading ';' (an empty base) must expand to an indicator-only glyph here too,
    // so a custom baseless glyph round-trips identically when re-expanded from a
    // toJSON-stripped nested part instead of injecting a failed empty part.
    const segments = codeString.split(';').filter(s => s !== '');
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
          part.codeName = innerCodeString;
        }
      }

      BlissParser.#applyDefinitionMetadata(part, definition);
      parts.push(part);
    }

    return parts;
  }

}
