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
import { resolveWordIndicatorOverlay } from "./indicator-utils.js";
import { GLOBAL_ONLY_OPTION_KEYS, MAX_RECURSION_DEPTH, OPTION_BRACKET_CONTENT, WARNING_CODES, serializeOptionValue } from "./bliss-constants.js";

// The coordinate-suffix grammar parsePartString accepts: ':' with EACH axis
// optional (:2 | :2, | :,2 | :2,3 | :). Every site that strips a coordinate
// suffix before a definition lookup must strip this SAME grammar, or
// equivalent spellings take different semantic paths (a y-only ':,2' used to
// bypass the misplacement gates while ':0,2' met them).
const COORD_SUFFIX_PATTERN = /:(?:-?(?:\d+(?:\.\d*)?|\.\d+))?(?:,(?:-?(?:\d+(?:\.\d*)?|\.\d+))?)?$/;

// A codeString beginning with a part option ([color=red]>B291) must nest-parse
// like a multi-code string; treated as a plain codeName it becomes one unknown
// token. Shared by the string parser and the object-rebuild expansion paths so
// a toJSON() round-trip reconstructs what the string parser accepted.
const PART_OPTION_CODESTRING = /^\[.*?\]>/;

// A `>`-less bracket is a CHARACTER option by syntax; inside a `;`-part slot
// only part options ([opts]>) apply, so the bracket is misplaced on an
// otherwise-valid code: peel + warn + drop, then parse the remainder normally.
// The [^\[\]] class keeps the match to ONE bracket token — a `.*?` class
// would backtrack across `]…[` and capture a bracket pair as one blob. The
// non-empty remainder (.+) keeps a dangling bracket with no code on the
// whole-character fail path.
const PART_SLOT_CHAR_OPTION_PATTERN = /^(\[[^\[\]]*\])(?!>)(.+)$/;

// Quote-aware bracket matchers built from the shared grammar (see
// OPTION_BRACKET_CONTENT in bliss-constants.js for the rationale and the
// linear-time guarantee; probe: probe-chunk11-option-value-quoting.mjs).
// The tokenizer pre-pass and #parseOptions' own extraction must agree, or a
// quoted `]` truncates at one layer even when the other accepts it.
const BRACKET_TOKEN_PATTERN = new RegExp(String.raw`\{(.*)\}|\[(` + OPTION_BRACKET_CONTENT + String.raw`)\]`, 'g');
const BRACKET_EXTRACT_PATTERN = new RegExp(String.raw`\[(` + OPTION_BRACKET_CONTENT + String.raw`)\]`);
// The overlay prefix matchers run on RESTORED strings (the `;;` store keeps
// codes verbatim), so they need the same quote-aware grammar; group 2 is the
// grammar's internal atom, group 3 the remainder after the bracket.
const OVERLAY_CHAR_OPTION_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)(.+)$`);
const OVERLAY_PART_OPTION_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])>(.+)$`);

// Strips one layer of syntactic decoration from a codeString reference (an
// option prefix, a trailing head marker, a coordinate suffix) so a DECORATED
// alias hop ('[color=green]WORD', 'WORD^', 'WORD:1,2') still resolves for
// wordness; define() inlines only undecorated direct references.
const stripReferenceDecoration = (s) => s
  .replace(/^(?:\[.*?\]>?)+/, '')
  .replace(/\^+$/, '')
  .replace(COORD_SUFFIX_PATTERN, '');

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

  // Only one option bracket is allowed per level ([a][b]|| is invalid; the
  // canonical multi-option form is [a;b]||). A duplicate is detected only when
  // BOTH forms agree: the tokenized (placeholder) form shows more than one
  // bracket — braces are opaque placeholders there, so a '[' inside {…} never
  // counts — AND the restored form still shows more than one top-level '['
  // once quoted values are stripped with #parseOptions's own quote grammar.
  // The second condition was added to veto the then-quote-unaware pre-pass
  // (a quoted ']' split ONE user bracket into two tokenized ones); the
  // pre-pass is quote-aware since Chunk 11, so both arms now agree on
  // [k="]["]-class inputs and the veto is belt-and-suspenders (kept; the
  // Phase 6 Stryker re-baseline adjudicates its reachability).
  static #hasMultipleOptionBrackets(tokenized, restored) {
    const QUOTED_SPAN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
    return (tokenized.match(/\[/g) || []).length > 1
      && (restored.replace(QUOTED_SPAN, '').match(/\[/g) || []).length > 1;
  }

  static #parseOptions(optionsString) {
    if (!optionsString) return;

    const bracketMatch = optionsString.match(BRACKET_EXTRACT_PATTERN);
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
    const originalInput = inputString;
    inputString = inputString.replace(BRACKET_TOKEN_PATTERN, (match, textContent, optionContent) => {
      let placeholder = `PLACEHOLDER_${placeholderCount++}`;
      if (textContent !== undefined) {
        placeholderMap[placeholder] = { content: textContent, openBracket: '{', closeBracket: '}' };
        return '{' + placeholder + '}';
      } else {
        placeholderMap[placeholder] = { content: optionContent, openBracket: '[', closeBracket: ']' };
        return '[' + placeholder + ']';
      }
    });

    // {text} blocks parse onto group.text but do not render yet and are
    // dropped from toString(), so EVERY block warns — a silent single block
    // violated visible-not-silent. Counting `{` AFTER tokenization means a
    // quoted `{` inside an option value never counts, a whole block counts
    // once regardless of nested braces in its content, and a stray unmatched
    // `{` still counts as a failed block attempt.
    if ((inputString.match(/\{/g) || []).length > 0) {
      parseWarnings.push({
        code: WARNING_CODES.UNSUPPORTED_TEXT_BLOCKS,
        message: 'Text blocks ({...}) are not supported yet: the text does not render and is dropped from toString() output. Multiple {...} blocks in one input have undefined parse behavior until text-block tokenization ships. Use a single trailing {text} per group.',
        source: originalInput,
      });
    }

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

    // Builder-canvas option keys configure the whole SVG, so they are valid
    // only in the global [opts]|| bracket. At group/character/part level they
    // are inert but used to serialize + round-trip silently (audit N-2): warn
    // per key and drop it, keeping the bracket's other options. Returns the
    // mutated object, or undefined when every key was dropped, so call sites
    // store "no options" instead of an empty artifact. `text` is exempt via
    // the curated set (an unimplemented stub at EVERY level, not misplaced).
    const dropMisplacedGlobalKeys = (options, levelName) => {
      if (!options) return options;
      for (const key of Object.keys(options)) {
        if (!GLOBAL_ONLY_OPTION_KEYS.has(key)) continue;
        const written = options[key] === true ? key : `${key}=${options[key]}`;
        parseWarnings.push({
          code: WARNING_CODES.MISPLACED_GLOBAL_OPTION,
          message: `Global option (${written}) ignored at ${levelName} level: it configures the whole SVG. Use [${written}]|| to apply it globally.`,
          source: written,
        });
        delete options[key];
      }
      return Object.keys(options).length > 0 ? options : undefined;
    };

    // Extract global options
    let [_, globalOptionsString, globalCodeString] = inputString.match(/^\s*(?:([^|]*)\s*\|\|)?(.*)$/);
    if (globalOptionsString && globalOptionsString.match(/^\[.*\]$/)) {
      const restoredGlobal = restorePlaceholders(globalOptionsString);
      // #parseOptions keeps the first bracket, so a duplicate warns and drops.
      if (BlissParser.#hasMultipleOptionBrackets(globalOptionsString, restoredGlobal)) {
        parseWarnings.push({
          code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
          message: `Multiple option brackets before ||: "${restoredGlobal}". Only the first is applied; combine options in one bracket, e.g. [a;b]||.`,
          source: restoredGlobal,
        });
      }
      result.options = this.#parseOptions(restoredGlobal) || {};
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
          const restoredBeforePipe = restorePlaceholders(beforePipe);
          // #parseOptions keeps the first bracket, so a duplicate warns and drops.
          if (BlissParser.#hasMultipleOptionBrackets(beforePipe, restoredBeforePipe)) {
            parseWarnings.push({
              code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
              message: `Multiple option brackets before |: "${restoredBeforePipe}". Only the first is applied; combine options in one bracket, e.g. [a;b]|.`,
              source: restoredBeforePipe,
            });
          }
          group.options = dropMisplacedGlobalKeys(this.#parseOptions(restoredBeforePipe), 'group');
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
        // An option bracket ([opts] or [opts]>) at the boundary must not hide
        // the X-run from routing (run-to-stable 2.2): the prefix rides the
        // FIRST expanded glyph, matching the written /-expansion \u2014 X-runs are
        // string-level sugar, so [opts]Xab must equal [opts]Xa/Xb in every
        // observable. An all-fallback run stays ONE XTXT_ glyph, so its
        // prefix scopes the whole run.
        let expanded = codeString.replace(/(?<=^|\/)(\[[^\[\]]*\]>?)?X([a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF]{2,})/g, (match, optionPrefix = '', chars, offset) => {
          // Skip expansion when followed by ; (word expansion would break composition).
          // A past-the-end index reads as undefined, which is never ';', so no bounds guard.
          const after = codeString[offset + match.length] === ';';
          if (after) return match;

          const allHavePath = [...chars].every(char => hasPathData(char));
          if (allHavePath) {
            return optionPrefix + [...chars].map(char => `X${char}`).join('/');
          } else {
            return `${optionPrefix}XTXT_${chars}`;
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
            continue;
          }
          flushXSequence();
          // An option-prefixed single-char X-code stands alone: the option
          // scopes to that one character, so it never merges into a
          // whole-run fallback. An outlined letter passes through unchanged
          // (it resolves via its definition downstream); only a fallback
          // letter is rewritten so the XTXT_ route can see it.
          const prefixed = part.match(/^(\[[^\[\]]*\]>?)X([a-zA-Z\u00C0-\u017F\u0370-\u03FF\u0400-\u04FF])$/);
          if (prefixed && !hasPathData(prefixed[2])) {
            result.push(`${prefixed[1]}XTXT_${prefixed[2]}`);
          } else {
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

        // A space carries neither a designation nor a word indicator: TSP/
        // QSP/ZSA groups serialize as bare word breaks ('//'), so a `^` or
        // `;;` stored on one is eaten by toString and lost on reparse
        // (round-2 external review F1). A DECORATED space token skips the
        // step-2 space branch (the token is not exactly SP/TSP/QSP) and lands
        // here; classify by the expanded part's resolved code.
        const isSpacePart = (p) => {
          const partCode = p._scanCode ?? (p.part ? p.part.split(';')[0].split(':')[0] : '');
          return partCode === 'TSP' || partCode === 'QSP' || partCode === 'ZSA';
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

        // Helper: resolve codeString through aliases to check if it's a word.
        // A hop that is not itself a registry key may still be a DECORATED
        // reference ('[color=green]WORD', 'WORD^', 'WORD:1,2') — strip the
        // decoration and keep resolving, else a decorated word alias escapes
        // wordness detection (external review 2026-07-02 F2).
        const resolveToFinalCodeString = (code, visited = new Set()) => {
          if (visited.has(code)) return null;
          visited.add(code);
          const def = definitions[code];
          if (!def?.codeString) return null;
          if (!definitions[def.codeString]) {
            const core = stripReferenceDecoration(def.codeString);
            if (core !== def.codeString && definitions[core]) {
              return resolveToFinalCodeString(core, visited) ?? def.codeString;
            }
            return def.codeString;
          }
          return resolveToFinalCodeString(def.codeString, visited);
        };

        // An indicator (char-level `;` or word-level `;;`) binds to exactly one
        // word. When it is bound to a single ALIAS token that expands to MORE
        // THAN ONE word (a `_wordBreak` survives expansion), there is no single
        // head to carry it, so the binding is invalid. Fail the whole unit:
        // collapse the word-break expansion into one group (filter the breaks so
        // no `//` split survives) and flag it with `_wordError`, exactly like the
        // malformed-`;;` path. The assembly loop lifts the flag onto
        // group.errorCode and the L1 fail-render mechanism collapses it to ONE
        // placeholder (error-placeholder on) or nothing (off). This replaces the
        // legacy silent drop (direct `//` alias) and first-word-head attach
        // (nested alias / `;;` overlay). errorSource is the whole group string
        // (`wordCode`) so toString re-emits it and parse(toString(x)) re-flags;
        // the flag is static + sticky and the splitAt/mergeWithNext guards key
        // off group.errorCode. R2 corpus task 4, Decision 6 (applies uniformly to
        // direct and nested aliases). See [[feedback_no_indicator_of_a_part]].
        const failMultiWordIndicator = (parts) => {
          // Filtering the `_wordBreak` markers collapses the multi-word
          // expansion into one group; any head markers the words carried are
          // already sealed to per-word designations by sealFragment during
          // expansion (so the collapse cannot re-trigger MULTIPLE_HEAD_MARKERS)
          // and are inert anyway, since a placeholder renders for the unit.
          const collapsed = parts.filter(p => !p._wordBreak);
          if (collapsed.length > 0) {
            // Restore placeholders: errorSource re-emits from toString, so a
            // stored placeholder token would replace the user's option text.
            collapsed[0]._wordError = {
              code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
              message: `Indicator bound to the multi-word unit "${restorePlaceholders(wordCode)}": an indicator targets a single word, but this expands to multiple words.`,
              source: restorePlaceholders(wordCode),
            };
          }
          return collapsed;
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
            // Expand the fallback NOT at top level: this malformed `;;` already
            // fail-renders with MALFORMED_WORD_INDICATOR, so the re-expansion must
            // not also emit a spurious char-level MISPLACED_CHARACTER_INDICATOR
            // when the base is a bare alias or word. (Strict Indicator Separation.)
            const fallbackParts = str.replace(/;;/g, ';').split('/').flatMap(strPart => expand(strPart, definitions, false));
            // A malformed `;;` whose base expands past a word break (a multi-word
            // `//` alias) yields several word-groups; rendering them all makes
            // toString re-emit the full expansion, so the round-trip grows without
            // bound on every pass. Collapse to one fail-placeholder (verbatim
            // round-trip via errorSource = wordCode), mirroring the well-formed
            // multi-word `;;` fail below. (Strict Indicator Separation.)
            if (fallbackParts.some(p => p._wordBreak)) {
              return failMultiWordIndicator(fallbackParts);
            }
            crownWordChunks(fallbackParts, wordCode);
            if (fallbackParts.length > 0) {
              // Restore placeholders: errorSource re-emits from toString, so a
              // stored placeholder token would replace the user's option text.
              fallbackParts[0]._wordError = {
                code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
                message: `Malformed word-level indicator in "${restorePlaceholders(str)}": ;; must be the trailing part of a word.`,
                source: restorePlaceholders(str),
              };
            }
            return fallbackParts;
          }

          const stripSemantic = rawIndicators.startsWith('!');
          const indicators = stripSemantic ? rawIndicators.slice(1) : rawIndicators;

          // Process baseCode using the normal flow (splits on / and expands each
          // part): definitions, ^ markers, options, etc.
          const expandedParts = baseCode.split('/').flatMap(strPart => expand(strPart, definitions));

          // A ;; overlay binds to ONE word. Bound to a multi-word alias (the base
          // expands past a word break), it has no single head: fail the whole
          // unit instead of overlaying only the first word. Decision 6 (uniform
          // with the char-level multi-word-alias fail in expandSegment).
          if (expandedParts.some(part => part._wordBreak)) {
            return failMultiWordIndicator(expandedParts);
          }

          // A space carries no word indicator (round-2 review F1): the overlay
          // would be stored, then eaten by the '//' serialization. Warn ONCE
          // for the whole overlay (strip included) and keep the plain space —
          // a misplaced decoration on valid content is dropped, not
          // fail-rendered.
          if (expandedParts.length > 0 && expandedParts.every(isSpacePart)) {
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_WORD_INDICATOR,
              message: `Word-level indicator (;;${rawIndicators}) ignored on "${restorePlaceholders(str)}": a space cannot carry a word indicator.`,
              source: restorePlaceholders(str),
            });
            crownWordChunks(expandedParts, wordCode);
            return expandedParts;
          }

          // Resolve and crown the word so the head is identifiable at decode.
          crownWordChunks(expandedParts, wordCode);

          // Stash the overlay on the first part; the assembly loop lifts it onto
          // the group. Codes are merged/indicator-filtered at decode, not here;
          // filter(Boolean) drops empties so a bare `;;` yields an empty list.
          // With char-level promotion gone, no leading glyph can pre-claim the
          // word-level slot, so this explicit `;;` overlay always wins here. (A
          // `/`-composition of two explicit `;;` overlays is still resolved
          // first-wins by the assembly loop below.) (Strict Indicator Separation.)
          // Restore each code's placeholders AFTER splitting: a part-level
          // option (`[color=red]>B81`) is placeholder-substituted early, so its
          // internal `;` is safe to split on here; restoring before the split
          // would re-expose that `;` and break a multi-key option. (SIB-2.)
          const rawCodes = indicators.split(';').filter(Boolean).map((c) => restorePlaceholders(c));

          // An overlay code may carry a part option ([opts]>B81, SIB-2). Its
          // bracket meets the same global-only key gate as any part bracket,
          // but the overlay stores code STRINGS verbatim (parsed only at
          // render-merge), so a gated key must be stripped from the stored
          // string itself or toString would re-serialize the warned no-op
          // forever. Clean codes pass through untouched (SIB-2 fidelity); a
          // stripped prefix is rebuilt with the shared quote-aware key=value
          // emission (serializeOptionValue), so a kept quoted value survives
          // the rebuild.
          const gatedCodes = rawCodes.map((code) => {
            // A CHARACTER-form prefix ([opts]CODE, no >) is inert in overlay
            // position for EVERY key -- the render-merge extracts parts only,
            // so the bracket styles nothing, yet it used to re-serialize
            // forever with no warning anywhere (external review 2026-07-02
            // F2). The whole bracket is misplaced (a word-indicator code has
            // no character to bind to); [opts]> is the styled form. EVERY
            // leading char-form bracket strips in this ONE pass (one warning
            // each) BEFORE the part-form gate runs: the part-form regex would
            // otherwise backtrack across stacked brackets ([a][b]>CODE read
            // as one prefix whose #parseOptions sees only bracket one),
            // leaving later keys unreached or losing a valid later bracket
            // with the misplaced first one (review-fix round 2, F2).
            let current = code;
            let charPrefix;
            while ((charPrefix = current.match(OVERLAY_CHAR_OPTION_PATTERN)) !== null) {
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                message: `Character option (${charPrefix[1]}) ignored on the word indicator "${charPrefix[3]}": a ;; code has no character to style. Use ${charPrefix[1]}>${charPrefix[3]} to style the indicator part.`,
                source: current,
              });
              current = charPrefix[3];
            }
            const optionPrefix = current.match(OVERLAY_PART_OPTION_PATTERN);
            if (!optionPrefix) return current;
            const parsed = BlissParser.#parseOptions(optionPrefix[1]) ?? {};
            const keyCount = Object.keys(parsed).length;
            const kept = dropMisplacedGlobalKeys(parsed, 'part');
            const keptEntries = kept ? Object.entries(kept) : [];
            if (keptEntries.length === keyCount) return current;
            if (keptEntries.length === 0) return optionPrefix[3];
            return `[${keptEntries.map(([k, v]) => v === true ? k : `${k}=${serializeOptionValue(v)}`).join(';')}]>${optionPrefix[3]}`;
          });

          // A `;;` word-level indicator must BE an indicator. Validate + drop here
          // (not silently at render): a recognized non-indicator (a real base)
          // warns NON_INDICATOR_AS_WORD_INDICATOR, an unrecognized code warns
          // UNKNOWN_CODE, and either way the offender is DROPPED so it does not
          // re-serialize. The base still renders as written -- a bad decoration on
          // valid content is dropped, not fail-rendered ([[feedback_error_granularity]]).
          // resolveWordIndicatorOverlay is the shared classify + store rule (the
          // DSL, API, and object surfaces all use it, so they agree); it returns
          // null when the codes were all dropped and there is no strip. (Strict
          // Indicator Separation.) Its 'word-structure' reject reason cannot
          // fire on this path: any `/` in the `;;` tail already failed the
          // whole word at the isMalformed gate above, so this callback maps
          // only 'non-indicator' and 'unknown'.
          const overlay = resolveWordIndicatorOverlay(gatedCodes, stripSemantic, definitions, ({ code: badCode, reason }) => {
            parseWarnings.push(reason === 'non-indicator'
              ? {
                  code: WARNING_CODES.NON_INDICATOR_AS_WORD_INDICATOR,
                  message: `Word-level indicator "${badCode}" after ;; is not an indicator; it is ignored. A ;; code must be an indicator (e.g. B81).`,
                  source: badCode,
                }
              : {
                  code: WARNING_CODES.UNKNOWN_CODE,
                  message: `Word-level indicator "${badCode}" after ;; is not a known code; it is ignored.`,
                  source: badCode,
                });
          });

          if (overlay && expandedParts.length > 0) {
            expandedParts[0]._wordIndicators = overlay;
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
          // A head marker attaches to the END of a character, after its
          // indicators (`B291;B81^`). A character includes its indicators, so a
          // `^` written on the base before the indicator separator (`B291^;B81`)
          // is MISPLACED -- not a synonym for the trailing form. Strip it so the
          // base is not lost as an unknown code (`B291^`), but DROP it with a
          // warning rather than honoring it (parallel to a `^` on a multi-
          // character alias below); the user must write it at the character's end.
          const caretBeforeIndicator = str.match(/^(.*?)\^(;.*)$/);
          if (caretBeforeIndicator) {
            const cleaned = caretBeforeIndicator[1] + caretBeforeIndicator[2];
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_HEAD_MARKER,
              message: `Head marker (^) ignored on "${restorePlaceholders(str)}": it must mark the end of a character, after its indicators (e.g. "${restorePlaceholders(cleaned)}^"), not the base before them.`,
              source: restorePlaceholders(str),
            });
            str = cleaned;
          }
          const parts = expandSegment(str, definitions, isTopLevel, depth);
          if (hasMarker) {
            if (parts.length === 1) {
              if (isSpacePart(parts[0])) {
                // A space cannot be a word's head (round-2 review F1): warn +
                // drop, never store a designation the space serialization
                // ('//') cannot re-emit.
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_HEAD_MARKER,
                  message: `Head marker (^) ignored on "${restorePlaceholders(str)}": a space cannot be a word's head.`,
                  source: restorePlaceholders(str),
                });
              } else {
                // Rule 1: ^ attaches to a character (one expanded glyph),
                // including an alias that resolves to a single character.
                parts[0]._marker = true;
              }
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
            const optionBracket = partLevelMatch[1];
            let partContent = partLevelMatch[2];
            // Option-placement scope gate (mirrors the char-level `;` MISPLACED
            // gate below). A part option binds to a single part, so `[opts]>` on
            // an alias that expands to a WORD is MISPLACED: warn, drop the
            // option, and expand the rest as if written bare (a trailing
            // `;`-part then meets the normal gate). The word check runs at ANY
            // level -- a definition baking `[opts]>WORDALIAS` behaves like the
            // written form (the old WORD_AS_PART fail serialized to a form that
            // re-parsed differently). A `;`-part behind a validly placed
            // `[opts]>` on a bare alias meets the same MISPLACED rule this
            // early return used to bypass (F2): warn, drop the parts, keep the
            // option on the base; scoped to top level in parity with the `;`
            // gate below.
            const [gateBaseRaw, ...gateParts] = partContent.split(';');
            const gateCoordMatch = gateBaseRaw.match(COORD_SUFFIX_PATTERN);
            const gateBase = gateCoordMatch && gateCoordMatch.index > 0
              ? gateBaseRaw.slice(0, gateCoordMatch.index)
              : gateBaseRaw;
            if (resolveToFinalCodeString(gateBase)?.includes('/')) {
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_PART_OPTION,
                message: `Part option (${restorePlaceholders(optionBracket)}>) ignored on "${restorePlaceholders(gateBase)}": > applies an option to a single part, but this is a word. Use ${restorePlaceholders(optionBracket)}|| to apply it to the whole content.`,
                source: restorePlaceholders(gateBase),
              });
              return expandSegment(partContent, definitions, isTopLevel, depth);
            }
            if (isTopLevel) {
              const gateDef = definitions[gateBase];
              const gateBaseIsBareAlias = !!gateDef && gateDef.codeString !== undefined
                && !gateDef.isBlissGlyph && !gateDef.isShape
                && !gateDef.isExternalGlyph && !gateDef.glyphCode;
              const droppedParts = gateParts.filter(p => p !== '');
              if (gateBaseIsBareAlias && droppedParts.length > 0) {
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_CHARACTER_INDICATOR,
                  message: `Character indicator (;${droppedParts.join(';')}) ignored on "${restorePlaceholders(gateBase)}": ; composes onto a single character, but this is a word. Use ;; for a word-level indicator.`,
                  source: restorePlaceholders(gateBase),
                });
                partContent = gateBaseRaw;
                str = `${optionBracket}>${gateBaseRaw}`;
              }
            }
            const codeForKerning = partContent.split(':')[0];
            const definition = definitions[codeForKerning] || {};
            return [{
              part: str,
              _scanCode: partContent.split(';')[0].split(':')[0],
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
          // Strict Indicator Separation: `;` is dumb part-composition, so the
          // `!` strip-semantic shortcut no longer has a special parse. A `!`
          // after a single `;` is just part of an (invalid) appended code.
          const filteredIndicators = rawIndicators.filter(ind => ind !== '');

          // Strip position modifier (e.g. ":2,0", ":,2", ":-1.5,3") from base
          // code so definition lookup works for codes like "WORD:2,0"; the
          // shared pattern matches the full grammar parsePartString accepts,
          // so a y-only ":,2" resolves the same definition as ":0,2".
          const posMatch = potentialBaseCodeRaw.match(COORD_SUFFIX_PATTERN);
          const hasPosSuffix = posMatch && posMatch.index > 0;
          const potentialBaseCode = hasPosSuffix
            ? potentialBaseCodeRaw.slice(0, posMatch.index)
            : potentialBaseCodeRaw;
          const positionSuffix = hasPosSuffix ? posMatch[0] : '';

          const resolvedCodeString = resolveToFinalCodeString(potentialBaseCode);
          const isWordDefinition = resolvedCodeString?.includes('/') ?? false;

          // A bare alias (a `{codeString}`-only definition, no glyph flag) is a
          // WORD unit, not a single character; a multi-glyph word is many
          // characters. In both cases a char-level `;`-part has no single
          // character to attach to, so it is MISPLACED: warn once, drop it, and
          // render the base as defined (the head keeps any baked indicator). A
          // glyph / literal / unknown code is a single character and dumb-appends
          // the part (base case / built-in path below). Use `;;` for a word-level
          // indicator. See [[feedback_no_indicator_of_a_part]] (Strict Indicator
          // Separation, supersedes R15 Task 3b promotion).
          const baseCodeDef = definitions[potentialBaseCode];
          const baseIsBareAlias = !!baseCodeDef && baseCodeDef.codeString !== undefined
            && !baseCodeDef.isBlissGlyph && !baseCodeDef.isShape
            && !baseCodeDef.isExternalGlyph && !baseCodeDef.glyphCode;
          const misplacedCharIndicator = isTopLevel
            && (baseIsBareAlias || isWordDefinition)
            && filteredIndicators.length > 0;
          if (misplacedCharIndicator) {
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_CHARACTER_INDICATOR,
              message: `Character indicator (;${filteredIndicators.join(';')}) ignored on "${restorePlaceholders(potentialBaseCode)}": ; composes onto a single character, but this is a word. Use ;; for a word-level indicator.`,
              source: restorePlaceholders(potentialBaseCode),
            });
          }

          // A trailing/empty `;` (no real part: `B291;`, `WORD;`) is inert. It
          // must resolve the BASE definition so the code keeps its identity and
          // metadata (the `;` is normalized away in toString); it is neither a
          // dumb append nor misplaced.
          const isEmptyStrip = rawIndicators.length > 0 && filteredIndicators.length === 0;

          // Use base code lookup for words, a misplaced char indicator (both
          // render the base definition; the misplaced part is dropped), and an
          // inert empty `;` (preserve the base definition's metadata).
          const useBaseCodeLookup = isWordDefinition || misplacedCharIndicator || isEmptyStrip;
          const definition = useBaseCodeLookup
            ? (definitions[potentialBaseCode] || {})
            : codeForLookup.startsWith('XTXT_')
              ? (() => { const g = createTextFallbackGlyph(codeForLookup.slice(5)); g.isShape = true; return g; })()
              : (definitions[codeForLookup] || {});

          // If we have a codeString, recursively expand it
          if (definition.codeString) {
            // Strict Indicator Separation: `;` no longer rewrites a definition's
            // baked indicators, so the codeString expands verbatim.
            const codeStringToExpand = definition.codeString;

            // Built-in single-character codes: skip expansion, let parseParts handle it.
            // This eliminates the flatten-then-unflatten pattern where expand() substitutes
            // a B-code's codeString (e.g. B291 → "S8:0,8") only for a later wrapping patch
            // to reconstruct the nesting. Word codes (codeString with /) must still be
            // expanded here because word decomposition produces multiple glyphs.
            if (builtInCodes.has(potentialBaseCode)
                && !codeStringToExpand.includes('/')) {
              return [{
                part: str.replace(/;$/, ''),
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
              // A char-level option on a multi-word (//) alias is MISPLACED
              // (B4): a character option applies to a single character. Warn +
              // drop at top level; nested expansion keeps its prepend behavior.
              if (optionsPrefix && allParts.length > 0) {
                if (isTopLevel) {
                  parseWarnings.push({
                    code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                    message: `Character option (${restorePlaceholders(optionsPrefix)}) ignored on "${restorePlaceholders(potentialBaseCode)}": it applies to a single character, but this expands to multiple words. Use ${restorePlaceholders(optionsPrefix)}|| to apply it to the whole content.`,
                    source: restorePlaceholders(potentialBaseCode),
                  });
                } else {
                  allParts[0].part = optionsPrefix + allParts[0].part;
                }
              }
              // A char-level `;`-part on a multi-word (//) alias is MISPLACED
              // (warned up front): render every word and drop the part. D1.
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

            // A char-level `;`-part on a nested alias that expands past a word
            // break is MISPLACED (warned up front): render the words, drop the
            // part. D1.

            // Rule 2: a definition's codeString is its own word-string.
            // Resolve its written markers now (head resolution rule 4); the
            // call mutates expandedParts in place, so its return is not needed.
            sealFragment(expandedParts, potentialBaseCode);

            // Strict Indicator Separation: a char-level `;`-part on a multi-glyph
            // word is handled up front -- a real part is MISPLACED and dropped
            // (warned above), a trailing `;` is inert. Either way the head is NOT
            // modified here: the word renders as defined, keeping any baked head
            // indicator. Use `;;` for a word-level indicator.

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

            // Prepend options to the first expanded part. A char-level option
            // is valid on a single character only: on an alias expanding to a
            // multi-character word it is MISPLACED (B4; folds audit N-3 -- it
            // used to land silently on the FIRST character). Warn + drop at
            // top level; nested expansion keeps its prepend behavior.
            if (optionsPrefix && expandedParts.length > 0) {
              if (isTopLevel && isMultiGlyphWord) {
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                  message: `Character option (${restorePlaceholders(optionsPrefix)}) ignored on "${restorePlaceholders(potentialBaseCode)}": it applies to a single character, but this expands to a word. Use ${restorePlaceholders(optionsPrefix)}|| to apply it to the whole content.`,
                  source: restorePlaceholders(potentialBaseCode),
                });
              } else {
                expandedParts[0].part = optionsPrefix + expandedParts[0].part;
              }
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
          // Strict Indicator Separation: `;` dumb-appends, so `str` is kept
          // verbatim (a trailing `;` is normalized away; an invalid appended
          // part such as `!B81` falls through to UNKNOWN_CODE in parseParts).
          return [{
            part: str.replace(/;$/, ''),
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

      // A group option binds to ONE word-group. Bound to an alias whose
      // expansion crosses a word break (a multi-word // alias), there is no
      // single group to carry it -- it used to style only the FIRST word,
      // silently. Warn + drop the bracket + render every word. The written
      // [opts]|a//b form never reaches this gate: a top-level // splits
      // groups BEFORE option parsing, so that bracket binds to group 1 by
      // syntax (the same alias-vs-written split as the character-level gate).
      // The malformed-;; fail path collapses its word breaks, so a
      // fail-rendered unit keeps its bracket (errorSource round-trips it).
      // Two separator kinds span words: a // word break AND an explicit space
      // code between glyphs (external review 2026-07-02 F3: an in-alias TSP is
      // not a _wordBreak, but its serialized /TSP/ splits groups on reparse,
      // silently rebinding the bracket to the first word). A separator with
      // inked content on ONE side only (a trailing space or //) does NOT span
      // words: the bracket still binds the only inked word and round-trips
      // stably, so it keeps its option.
      const expansionSpansWords = (parts) => {
        let sawWord = false;
        let sawSeparatorAfterWord = false;
        for (const p of parts) {
          // A part re-splits into its own group on reparse ONLY as a bare
          // space token (the top-level split matches the exact token), so a
          // composed (TSP;B81) or decorated space stays in-group and
          // separates nothing; kerning markers are neither ink nor a
          // separator (they decorate the next glyph). (Review-fix round 2,
          // F3: matching _scanCode over-classified both.)
          const partCode = p._scanCode ?? (p.part ? p.part.split(';')[0].split(':')[0] : '');
          if (partCode === 'RK' || partCode === 'AK') continue;
          if (p._wordBreak || isSpaceCode(p.part)) {
            if (sawWord) sawSeparatorAfterWord = true;
          } else if (p.part !== '') {
            if (sawSeparatorAfterWord) return true;
            sawWord = true;
          }
        }
        return false;
      };
      if (group.options && expansionSpansWords(expandedGlyphParts)) {
        const written = Object.entries(group.options)
          .map(([k, v]) => v === true ? k : `${k}=${v}`).join(';');
        const aliasSource = restorePlaceholders(groupCodeString);
        parseWarnings.push({
          code: WARNING_CODES.MISPLACED_GROUP_OPTION,
          message: `Group option ([${written}]) ignored on "${aliasSource}": | applies options to a single word, but this expands to multiple words. Use [${written}]|| to apply them to the whole content.`,
          source: aliasSource,
        });
        delete group.options;
      }

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
        // The [^\[\]] class keeps the char-option match to ONE bracket token.
        // The old `.*?` class backtracked across `]>…;[` when the lookahead
        // failed, capturing `[a]>CODE;[b]` as one character-option blob —
        // every part before the second bracket was silently eaten.
        const glyphMatch = part.match(/^(\[[^\[\]]*\])(?!>)(.*)/);
        if (glyphMatch) {
          const parsedOptions = dropMisplacedGlobalKeys(
            this.#parseOptions(restorePlaceholders(glyphMatch[1])), 'character');
          // Merge only when something remains: a bracket fully emptied by the
          // gate (or written empty) must not leave an options: {} artifact on
          // the glyph -- the gated form's toJSON matches the bare form's.
          if (glyphObj.options || parsedOptions) {
            glyphObj.options = { ...glyphObj.options, ...parsedOptions };
          }
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
          for (const [partIndex, rawPartString] of twoPartPartStrings.entries()) {
            let twoPartPartString = rawPartString;
            // Slot 0 is the character's own option position (its bracket was
            // already stripped at the glyph level); a `>`-less bracket in a
            // LATER slot is a misplaced character option: peel one warning
            // per bracket, drop it, and parse the remaining code normally.
            if (partIndex > 0) {
              let peeled;
              while ((peeled = twoPartPartString.match(PART_SLOT_CHAR_OPTION_PATTERN)) !== null) {
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                  message: `Character option (${restorePlaceholders(peeled[1])}) ignored on "${restorePlaceholders(peeled[2])}": a ; part slot takes part options. Use ${restorePlaceholders(peeled[1])}>${restorePlaceholders(peeled[2])} to style the part.`,
                  source: restorePlaceholders(rawPartString),
                });
                twoPartPartString = peeled[2];
              }
            }
            const part = this.parsePartString(twoPartPartString, restorePlaceholders);
            if (part.options) {
              part.options = dropMisplacedGlobalKeys(part.options, 'part');
              if (!part.options) delete part.options;
            }

            const definition = part.codeName?.startsWith('XTXT_')
              ? (() => { const g = createTextFallbackGlyph(part.codeName.slice(5)); g.isShape = true; return g; })()
              : (blissElementDefinitions[part.codeName] || {});
            const codeString = definition.codeString;

            if (codeString) {
              if (codeString.includes('/')) {
                // Word codeString at part level — cannot be expanded here.
                // Keep original codeName; post-parse decomposition resolves it.
              } else if (codeString.includes(';') || codeString.includes(':')
                  || PART_OPTION_CODESTRING.test(codeString)
                  || blissElementDefinitions[codeString]?.codeString ) {
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

    if (codeString.includes(';') || codeString.includes(':')
        || PART_OPTION_CODESTRING.test(codeString)
        || blissElementDefinitions[codeString]?.codeString) {
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
        } else if (innerCodeString.includes(';') || innerCodeString.includes(':')
            || PART_OPTION_CODESTRING.test(innerCodeString)
            || blissElementDefinitions[innerCodeString]?.codeString) {
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
