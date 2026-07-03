/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";
import { INTERNAL_OPTIONS, KNOWN_OPTION_KEYS, GLOBAL_ONLY_OPTION_KEYS, DOT_WIDTH_MAX, escapeHtml, isSafeAttributeName, camelToKebab, generateKey, LIB_VERSION, WARNING_CODES, serializeOptionValue } from "./bliss-constants.js";
import { ElementHandle } from "./element-handle.js";
import { mergeWordIndicatorsOntoHead, resolveWordIndicatorOverlay } from "./indicator-utils.js";
import { resolveHeadIndex, headScanCode } from "./bliss-head-glyph-exclusions.js";

// Pre-parsed error placeholder (REFSQUARE + question mark). Parsed once at module
// load so BlissElement can clone it without importing BlissParser itself.
const ERROR_PLACEHOLDER_PARTS = BlissParser.parse('REFSQUARE;B699:3').groups[0].glyphs[0].parts;

// Head-scan code for a raw blissObj glyph: a custom glyph's own identity, else
// its base part's codeName when single-part. A fused multi-part character is a
// character (not a leading operator), so an exclusion code among its parts does
// not exclude it: headScanCode is the single source shared with the element
// snapshot so the two query-time head sites stay in lockstep.
const getHeadCode = (glyph) =>
  headScanCode(glyph.glyphCode, glyph.parts?.length ?? 0, glyph.parts?.[0]?.codeName);

// Note: BlissSVGBuilder.LIB_VERSION is attached at the public entry point
// (src/index.js), not declared here. Code that imports the class directly
// from this file (e.g. internal tests) will see LIB_VERSION as undefined.
// External consumers always go through src/index.js, where the static is set.
class BlissSVGBuilder {
  #processedOptions;
  #sharedOptions;
  #mutationCtx;
  #warnings = [];
  // Warnings raised by mutation operations (e.g. mergeWithNext dropping an
  // absorbed word-level overlay). Unlike #warnings, these are NOT reset by
  // #rebuild — they record one-time data-loss events for the builder's
  // lifetime, since the lost data leaves no trace in the rebuilt tree.
  #mutationWarnings = [];
  #generation = 0;

  // Processes raw options (kebab-case) into internal options (camelCase).
  // Bulk options expanded here (not in output): 'margin', 'crop', 'grid-color', 'grid-stroke-width'.
  // @param {boolean} addBuilderDefaults - If true, adds defaults for builder-level options (grid, etc.)
  #processOptions(rawOptions = {}, addBuilderDefaults = false) {
    const options = {};

    // stroke-width: Number, clamped 0.1-1.5
    if ('stroke-width' in rawOptions && !isNaN(rawOptions['stroke-width'])) {
      let strokeWidth = Number(rawOptions['stroke-width']);
      if (strokeWidth < 0.1) {
        strokeWidth = 0.1;
      } else if (strokeWidth > 1.5) {
        strokeWidth = 1.5;
      }
      options.strokeWidth = strokeWidth;
    }

    // dot-extra-width: Number, clamped 0-1
    if ('dot-extra-width' in rawOptions && !isNaN(rawOptions['dot-extra-width'])) {
      let dotExtraWidth = Number(rawOptions['dot-extra-width']);
      if (dotExtraWidth < 0) {
        dotExtraWidth = 0;
      } else if (dotExtraWidth > 1) {
        dotExtraWidth = 1;
      }
      options.dotExtraWidth = dotExtraWidth;
    }

    // sdot-extra-width: Number, clamped 0-1 (small-dot override of the dot-extra-width half-default)
    if ('sdot-extra-width' in rawOptions && !isNaN(rawOptions['sdot-extra-width'])) {
      let sdotExtraWidth = Number(rawOptions['sdot-extra-width']);
      if (sdotExtraWidth < 0) {
        sdotExtraWidth = 0;
      } else if (sdotExtraWidth > 1) {
        sdotExtraWidth = 1;
      }
      options.sdotExtraWidth = sdotExtraWidth;
    }

    // dot-width: absolute rendered dot diameter, clamped [0, DOT_WIDTH_MAX]
    if ('dot-width' in rawOptions && !isNaN(rawOptions['dot-width'])) {
      let dotWidth = Number(rawOptions['dot-width']);
      if (dotWidth < 0) {
        dotWidth = 0;
      } else if (dotWidth > DOT_WIDTH_MAX) {
        dotWidth = DOT_WIDTH_MAX;
      }
      options.dotWidth = dotWidth;
    }

    // sdot-width: absolute rendered dot diameter, clamped [0, DOT_WIDTH_MAX]
    if ('sdot-width' in rawOptions && !isNaN(rawOptions['sdot-width'])) {
      let sdotWidth = Number(rawOptions['sdot-width']);
      if (sdotWidth < 0) {
        sdotWidth = 0;
      } else if (sdotWidth > DOT_WIDTH_MAX) {
        sdotWidth = DOT_WIDTH_MAX;
      }
      options.sdotWidth = sdotWidth;
    }

    // char-space: Number, clamped 0-10
    if ('char-space' in rawOptions && !isNaN(rawOptions['char-space'])) {
      let charSpace = Number(rawOptions['char-space']);
      if (charSpace < 0) {
        charSpace = 0;
      } else if (charSpace > 10) {
        charSpace = 10;
      }
      options.charSpace = charSpace;
    }

    // word-space: Number, clamped 0-20
    if ('word-space' in rawOptions && !isNaN(rawOptions['word-space'])) {
      let wordSpace = Number(rawOptions['word-space']);
      if (wordSpace < 0) {
        wordSpace = 0;
      } else if (wordSpace > 20) {
        wordSpace = 20;
      }
      options.wordSpace = wordSpace;
    }

    // external-glyph-space: Number, clamped 0-3
    if ('external-glyph-space' in rawOptions && !isNaN(rawOptions['external-glyph-space'])) {
      let externalGlyphSpace = Number(rawOptions['external-glyph-space']);
      if (externalGlyphSpace < 0) {
        externalGlyphSpace = 0;
      } else if (externalGlyphSpace > 3) {
        externalGlyphSpace = 3;
      }
      options.externalGlyphSpace = externalGlyphSpace;
    }

    // margin: Sets ALL 4 margins
    if ('margin' in rawOptions && !isNaN(rawOptions['margin'])) {
      const m = Number(rawOptions['margin']);
      options.marginTop = m;
      options.marginBottom = m;
      options.marginLeft = m;
      options.marginRight = m;
    }

    // Individual margins (override the above if present)
    if ('margin-top' in rawOptions && !isNaN(rawOptions['margin-top'])) {
      options.marginTop = Number(rawOptions['margin-top']);
    }
    if ('margin-bottom' in rawOptions && !isNaN(rawOptions['margin-bottom'])) {
      options.marginBottom = Number(rawOptions['margin-bottom']);
    }
    if ('margin-left' in rawOptions && !isNaN(rawOptions['margin-left'])) {
      options.marginLeft = Number(rawOptions['margin-left']);
    }
    if ('margin-right' in rawOptions && !isNaN(rawOptions['margin-right'])) {
      options.marginRight = Number(rawOptions['margin-right']);
    }

    // min-width: Number, clamped to 0 minimum (negative values become 0)
    if ('min-width' in rawOptions && !isNaN(rawOptions['min-width'])) {
      let minWidth = Number(rawOptions['min-width']);
      if (minWidth < 0) {
        minWidth = 0;
      }
      options.minWidth = minWidth;
    }

    // Boolean options: [option] = true, absence = false
    if (rawOptions.center === true) {
      options.center = true;
    }
    if (rawOptions.grid === true) {
      options.grid = true;
    }
    if (rawOptions['error-placeholder'] === true) {
      options.errorPlaceholder = true;
    }

    // Grid colors - hierarchy: bulk → category → specific
    // Only process if builder defaults requested or if grid options present
    if (addBuilderDefaults || Object.keys(rawOptions).some(k => k.startsWith('grid-'))) {
      // Start with defaults
      let skyColor = "#858585";
      let earthColor = "#858585";
      let majorColor = "#c7c7c7";  // major grid (non-semantic)
      let mediumColor = "#ebebeb";
      let minorColor = "#ebebeb";

      // Apply bulk option (sets all grid colors)
      if ('grid-color' in rawOptions) {
        const gc = rawOptions['grid-color'];
        skyColor = earthColor = majorColor = mediumColor = minorColor = gc;
      }

      // Apply category option for major grids (overrides bulk for major lines)
      if ('grid-major-color' in rawOptions) {
        const gmc = rawOptions['grid-major-color'];
        skyColor = earthColor = majorColor = gmc;
      }

      // Apply category option for medium grid (overrides bulk)
      if ('grid-medium-color' in rawOptions) {
        mediumColor = rawOptions['grid-medium-color'];
      }

      // Apply category option for minor grid (overrides bulk)
      if ('grid-minor-color' in rawOptions) {
        minorColor = rawOptions['grid-minor-color'];
      }

      // Apply specific options (most specific, override everything)
      if ('grid-sky-color' in rawOptions) {
        skyColor = rawOptions['grid-sky-color'];
      }

      if ('grid-earth-color' in rawOptions) {
        earthColor = rawOptions['grid-earth-color'];
      }

      // Assign to options object (escaped for safe SVG output)
      options.gridSkyColor = escapeHtml(skyColor);
      options.gridEarthColor = escapeHtml(earthColor);
      options.gridMajorColor = escapeHtml(majorColor);
      options.gridMediumColor = escapeHtml(mediumColor);
      options.gridMinorColor = escapeHtml(minorColor);
    }

    // Grid stroke widths - same hierarchy pattern
    // Only process if builder defaults requested or if grid options present
    if (addBuilderDefaults || Object.keys(rawOptions).some(k => k.startsWith('grid-'))) {
      // Start with defaults
      let skyWidth = 0.166;
      let earthWidth = 0.166;
      let majorWidth = 0.166;  // major grid (non-semantic)
      let mediumWidth = 0.166;
      let minorWidth = 0.166;

      // Apply bulk option (sets all grid widths)
      if ('grid-stroke-width' in rawOptions) {
        const gsw = Number(rawOptions['grid-stroke-width']);
        skyWidth = earthWidth = majorWidth = mediumWidth = minorWidth = gsw;
      }

      // Apply category option for major grids (overrides bulk for major lines)
      if ('grid-major-stroke-width' in rawOptions) {
        const gmsw = Number(rawOptions['grid-major-stroke-width']);
        skyWidth = earthWidth = majorWidth = gmsw;
      }

      // Apply category option for medium grid (overrides bulk)
      if ('grid-medium-stroke-width' in rawOptions) {
        mediumWidth = Number(rawOptions['grid-medium-stroke-width']);
      }

      // Apply category option for minor grid (overrides bulk)
      if ('grid-minor-stroke-width' in rawOptions) {
        minorWidth = Number(rawOptions['grid-minor-stroke-width']);
      }

      // Apply specific options (most specific, override everything)
      if ('grid-sky-stroke-width' in rawOptions) {
        skyWidth = Number(rawOptions['grid-sky-stroke-width']);
      }

      if ('grid-earth-stroke-width' in rawOptions) {
        earthWidth = Number(rawOptions['grid-earth-stroke-width']);
      }

      // Assign to options object
      options.gridSkyStrokeWidth = skyWidth;
      options.gridEarthStrokeWidth = earthWidth;
      options.gridMajorStrokeWidth = majorWidth;
      options.gridMediumStrokeWidth = mediumWidth;
      options.gridMinorStrokeWidth = minorWidth;
    }

    // crop: Sets ALL 4 crop values (number or 'auto')
    if ('crop' in rawOptions) {
      const c = rawOptions['crop'];
      if (c === 'auto') {
        options.cropTop = 'auto';
        options.cropBottom = 'auto';
        options.cropLeft = 'auto';
        options.cropRight = 'auto';
      } else if (c === 'auto-vertical') {
        options.autoVertical = true;
      } else if (c === 'compact') {
        options.cropCompact = true;
      } else if (!isNaN(c)) {
        const n = Number(c);
        options.cropTop = n;
        options.cropBottom = n;
        options.cropLeft = n;
        options.cropRight = n;
      }
    }

    // Individual crop values (override the above if present)
    // Each can be a number or 'auto'
    const parseCropValue = (val) => val === 'auto' ? 'auto' : Number(val);
    if ('crop-top' in rawOptions) {
      options.cropTop = parseCropValue(rawOptions['crop-top']);
    }
    if ('crop-bottom' in rawOptions) {
      options.cropBottom = parseCropValue(rawOptions['crop-bottom']);
    }
    if ('crop-left' in rawOptions) {
      options.cropLeft = parseCropValue(rawOptions['crop-left']);
    }
    if ('crop-right' in rawOptions) {
      options.cropRight = parseCropValue(rawOptions['crop-right']);
    }

    // Other string options
    if ('color' in rawOptions) {
      options.color = escapeHtml(rawOptions.color);
    }
    if ('background' in rawOptions) {
      options.background = escapeHtml(rawOptions.background); // empty string => transparent background
    }
    if ('background-top' in rawOptions) {
      options.backgroundTop = escapeHtml(rawOptions['background-top']);
    }
    if ('background-mid' in rawOptions) {
      options.backgroundMid = escapeHtml(rawOptions['background-mid']);
    }
    if ('background-bottom' in rawOptions) {
      options.backgroundBottom = escapeHtml(rawOptions['background-bottom']);
    }
    if ('text' in rawOptions) {
      options.text = escapeHtml(rawOptions.text);
    }
    if ('svg-desc' in rawOptions) {
      options.svgDesc = escapeHtml(rawOptions['svg-desc']);
    }
    if ('svg-title' in rawOptions) {
      options.svgTitle = escapeHtml(rawOptions['svg-title']);
    }

    // SVG element height (presentation size, not viewBox)
    if ('svg-height' in rawOptions && !isNaN(rawOptions['svg-height'])) {
      options.svgHeight = Number(rawOptions['svg-height']);
    }

    // Preserve any options that weren't explicitly processed (like fill, opacity, stroke-dasharray, etc.)
    // Only skip options that are in KNOWN_OPTION_KEYS (already processed above)
    // String values are escaped here at the input boundary so downstream code can use them safely.
    // Numeric values pass through as-is — they're used for calculations, not SVG markup.
    for (const [key, value] of Object.entries(rawOptions)) {
      if (!KNOWN_OPTION_KEYS.has(key)) {
        options[key] = typeof value === 'string' ? escapeHtml(value) : value;
      }
    }

    return options;
  }

  // Recursively process options at all levels (groups, glyphs, parts)
  #processAllOptions(obj, isTopLevel = false) {
    if (obj.options) {
      // Extract key from options (key is element identity, not an SVG option)
      if (obj.options.key !== undefined) {
        obj.key = obj.options.key;
        delete obj.options.key;
      }
      obj.options = this.#processOptions(obj.options, isTopLevel);
    }
    if (obj.groups) {
      for (const group of obj.groups) {
        this.#processAllOptions(group, false);
      }
    }
    if (obj.glyphs) {
      for (const glyph of obj.glyphs) {
        this.#processAllOptions(glyph, false);
      }
    }
    if (obj.parts) {
      for (const part of obj.parts) {
        this.#processAllOptions(part, false);
      }
    }
  }

  #rawBlissObj; // Stored for toJSON() round-trip

  constructor(input, options = {}) {
    const { defaults, overrides } = BlissSVGBuilder.#resolveOpts(options);

    // Allow empty constructor for building from scratch
    if (input === undefined || input === '') {
      input = '';
    } else if (typeof input !== 'string' && (typeof input !== 'object' || input === null || Array.isArray(input))) {
      throw new Error('Input must be a DSL string or a plain object from toJSON()');
    }

    // Accept both string (DSL) and object (from toJSON()) input
    const blissObj = (typeof input === 'string')
      ? BlissParser.parse(input)
      : structuredClone(input);

    // For object input (from toJSON), re-expand any parts that were stripped
    if (typeof input !== 'string') {
      BlissParser.expandParts(blissObj);
    }

    // Reverse toJSON() normalization: codeName → internal field names
    if (typeof input !== 'string' && blissObj.groups) {
      BlissSVGBuilder.#normalizeGlyphCodes(blissObj.groups);
    }

    // A `wordIndicators` overlay from object input (persisted toJSON, or hand-
    // authored) must pass the same "a `;;` code must BE an indicator" rule as the
    // DSL and API, so all three input surfaces agree. Older/hand-authored data can
    // carry a non-indicator overlay code; validate + drop it here via the shared
    // resolver, routing warnings through `_parseWarnings` like the parser (they
    // surface in `warnings` and are stripped from `toJSON()`).
    if (typeof input !== 'string' && blissObj.groups) {
      for (const group of blissObj.groups) {
        if (!group.wordIndicators) continue;
        const { codes = [], stripSemantic = false } = group.wordIndicators;
        const overlay = resolveWordIndicatorOverlay(codes, stripSemantic, blissElementDefinitions, ({ code: badCode, reason }) => {
          (blissObj._parseWarnings ??= []).push(reason === 'word-structure'
            ? {
                // Round-2 external review F2: a `/` hidden behind a coordinate
                // suffix serialized to a string the DSL re-parses as word
                // structure; the DSL/API surfaces reject it, so object input must too.
                code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
                message: `Word-level indicator "${badCode}" contains a character separator (a top-level /), which a word-level indicator cannot hold; it is ignored.`,
                source: badCode,
              }
            : reason === 'non-indicator'
              ? {
                  code: WARNING_CODES.NON_INDICATOR_AS_WORD_INDICATOR,
                  message: `Word-level indicator "${badCode}" is not an indicator; it is ignored. A ;; code must be an indicator (e.g. B81).`,
                  source: badCode,
                }
              : {
                  code: WARNING_CODES.UNKNOWN_CODE,
                  message: `Word-level indicator "${badCode}" is not a known code; it is ignored.`,
                  source: badCode,
                });
        }, ({ bracket, code: keptCode, source }) => {
          (blissObj._parseWarnings ??= []).push({
            code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
            message: `Character option (${bracket}) ignored on the word indicator "${keptCode}": a ;; code has no character to style. Use ${bracket}>${keptCode} to style the indicator part.`,
            source,
          });
        });
        if (overlay) group.wordIndicators = overlay;
        else delete group.wordIndicators;
      }
    }

    // Merge: defaults (lowest) < string options (middle) < overrides (highest)
    if (defaults || overrides) {
      const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults) : {};
      const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides) : {};
      blissObj.options = { ...rawDefaults, ...(blissObj.options ?? {}), ...rawOverrides };
    }

    // Flag word-as-part references (e.g. H;TW where TW = B291/B291) with
    // error so BlissElement emits a WORD_AS_PART warning instead of rendering.
    BlissSVGBuilder.#flagWordParts(blissObj);

    // Store a clean copy after option merging but before processing mutates it
    this.#rawBlissObj = structuredClone(blissObj);

    this.#rebuild();

    this.#mutationCtx = {
      getRaw: () => this.#rawBlissObj,
      rebuild: () => this.#rebuild(),
      parse: (code) => {
        const parsed = BlissParser.parse(code);
        BlissSVGBuilder.#flagWordParts(parsed);
        return parsed;
      },
      toRaw: (obj) => BlissSVGBuilder.#toRaw(obj),
      isRawSpaceGroup: (g) => BlissSVGBuilder.#isRawSpaceGroup(g),
      makeSpaceGroup: () => BlissSVGBuilder.#makeSpaceGroup(),
      removeGlyphGroup: (obj, gi) => this.#removeGlyphGroup(obj, gi),
      getSnapshot: () => this.snapshot(),
      getGeneration: () => this.#generation,
      getDefinitions: () => blissElementDefinitions,
      addMutationWarning: (warning) => this.#mutationWarnings.push(warning),
      // Build a temporary element tree for layout computation (e.g. addGlyph word expansion)
      computeLayout: (code) => {
        const parsed = BlissParser.parse(code);
        const tempElement = new BlissElement(parsed, { sharedOptions: this.#sharedOptions });
        return tempElement.snapshot();
      },
    };
  }

  // Resolve opts: accepts { defaults, overrides } or flat options (treated as overrides).
  static #resolveOpts(opts) {
    if (!opts) return { defaults: undefined, overrides: undefined };
    if ('defaults' in opts || 'overrides' in opts) {
      return { defaults: opts.defaults, overrides: opts.overrides };
    }
    return { defaults: undefined, overrides: opts };
  }

  static #toRaw(obj) {
    const raw = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      const kebabKey = camelToKebab(key);
      if (typeof value === 'boolean') {
        raw[kebabKey] = value;
      } else {
        raw[kebabKey] = String(value);
      }
    }
    return raw;
  }

  // Assigns stable keys to the three DSL-visible levels in #rawBlissObj:
  // groups (//), glyphs (/), and immediate parts (;).
  // Called before structuredClone so keys persist across rebuilds.
  // Deeper nested parts (definition expansions) are intentionally skipped —
  // they are not user-addressable and receive ephemeral keys from BlissElement.
  static #assignKeys(rawObj) {
    if (!rawObj.key) rawObj.key = generateKey();
    if (rawObj.groups) {
      for (const group of rawObj.groups) {
        if (!group.key) group.key = generateKey();
        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            if (!glyph.key) glyph.key = generateKey();
            if (glyph.parts) {
              for (const part of glyph.parts) {
                if (!part.key) part.key = generateKey();
              }
            }
          }
        }
      }
    }
  }

  #rebuild() {
    this.#generation++;
    this.#elementsCache = undefined;
    this.#groupsCache = undefined;
    this.#warnings = [];

    BlissSVGBuilder.#assignKeys(this.#rawBlissObj);
    const blissObj = structuredClone(this.#rawBlissObj);

    // Re-derive position-dependent composite-as-part flags on the rebuilt
    // structure: a mutation (insertPart via its `H;<code>` scaffold, removePart)
    // can move a part to/from the leading slot, so a parse-time flag may be stale.
    BlissParser.reflagCompositeParts(blissObj);

    // R14 resolve site 1 (render): merge each group's word-level indicator
    // overlay onto its head glyph, on the clone only so #rawBlissObj (and the
    // handles that reference it) stay base-only. The head is the explicitly
    // marked glyph (isHeadGlyph), else the query-time fallback (R15 WS-4) so a
    // structural mutation re-derives it instead of floating onto a stale stamp.
    for (const group of blissObj.groups ?? []) {
      if (group.wordIndicators && group.glyphs?.length) {
        const marked = group.glyphs.findIndex(g => g.isHeadGlyph === true);
        const headIndex = marked !== -1 ? marked : resolveHeadIndex(group.glyphs.map(getHeadCode));
        const head = group.glyphs[headIndex];
        // The overlay stores code STRINGS (SIB-2); this render-merge parse is
        // where a definition-baked misplacement (e.g. a global-only option
        // key inside an indicator definition) first becomes observable, so
        // its parse warnings must reach builder.warnings. #warnings was reset
        // above, so they re-derive per rebuild instead of accumulating.
        head.parts = mergeWordIndicatorsOntoHead(
          head, group.wordIndicators, blissElementDefinitions, (code) => {
            const parsed = BlissParser.parse(code);
            this.#warnings.push(...(parsed._parseWarnings ?? []));
            return parsed;
          }
        );
      }
    }

    this.#processAllOptions(blissObj, true);

    const { charSpace, wordSpace, externalGlyphSpace, errorPlaceholder, ...remainingOptions } = blissObj.options ?? {};
    this.#sharedOptions = {
      charSpace: charSpace ?? 2,
      wordSpace: wordSpace ?? 8,
      externalGlyphSpace: externalGlyphSpace ?? 0.8,
      warnings: this.#warnings,
      errorPlaceholder: errorPlaceholder === true,
      errorPlaceholderParts: ERROR_PLACEHOLDER_PARTS,
      keys: new Set(),
    };
    if (blissObj._parseWarnings) {
      this.#warnings.push(...blissObj._parseWarnings);
      delete blissObj._parseWarnings;
    }
    blissObj.options = remainingOptions;
    this.#processedOptions = blissObj.options;

    const attrMap = { 'color': 'stroke' };
    this.globalSvgAttributes = {};
    for (const [key, value] of Object.entries(blissObj.options ?? {})) {
      if (!INTERNAL_OPTIONS.has(key) && isSafeAttributeName(key)) {
        this.globalSvgAttributes[attrMap[key] || camelToKebab(key)] = value;
      }
    }

    this.composition = new BlissElement(blissObj, { sharedOptions: this.#sharedOptions });
  }

  /**
   * Returns warnings generated during parsing/rendering, followed by any
   * one-time mutation warnings (e.g. an overlay dropped by mergeWithNext).
   * Each warning has { code, message, source } describing the issue.
   * @returns {Array<{ code: string, message: string, source: string }>}
   */
  get warnings() {
    return [...this.#warnings, ...this.#mutationWarnings];
  }

  #elementsCache;

  /**
   * Returns the root element snapshot — a frozen tree of all element data.
   * Cached on first access (builder instances are immutable).
   *
   * @returns {ElementSnapshot} Frozen root snapshot with nested children
   */
  get elements() {
    if (!this.#elementsCache) {
      this.#elementsCache = this.composition.snapshot();
    }
    return this.#elementsCache;
  }

  /**
   * Depth-first traversal of all element snapshots.
   * Return false from the callback to stop traversal early.
   *
   * @param {function(ElementSnapshot): boolean|void} callback
   */
  traverse(callback) {
    function walk(el) {
      if (callback(el) === false) return false;
      for (const child of el.children) {
        if (walk(child) === false) return false;
      }
    }
    walk(this.elements);
  }

  /**
   * Find all element snapshots matching a predicate.
   *
   * @param {function(ElementSnapshot): boolean} predicate
   * @returns {ElementSnapshot[]}
   */
  query(predicate) {
    const results = [];
    this.traverse(el => { if (predicate(el)) results.push(el); });
    return results;
  }

  /**
   * Look up an element by its snapshot key, returning a live ElementHandle.
   *
   * @param {string} key
   * @returns {ElementHandle|null}
   */
  getElementByKey(key) {
    const snap = this.snapshot();
    const groups = snap.children;
    const rawGroups = this.#rawBlissObj.groups;

    // Walk snapshot tree in parallel with raw groups
    for (let rawGi = 0; rawGi < groups.length; rawGi++) {
      const groupSnap = groups[rawGi];
      const rawGroup = rawGroups[rawGi];

      if (groupSnap.key === key) {
        return new ElementHandle(this.#mutationCtx, 1, rawGroup);
      }

      const glyphs = groupSnap.children.filter(c => c.isGlyph);
      for (let gi = 0; gi < glyphs.length; gi++) {
        const rawGlyph = rawGroup.glyphs[gi];
        if (glyphs[gi].key === key) {
          return new ElementHandle(this.#mutationCtx, 2, rawGlyph, rawGroup);
        }
        const parts = glyphs[gi].children;
        for (let pi = 0; pi < parts.length; pi++) {
          if (parts[pi].key === key) {
            // Match the raw part by key, not snapshot position: a `;;` head's
            // snapshot carries an extra overlay-injected indicator part with no
            // raw node. Match-by-key keeps base parts addressable and returns
            // null for the overlay part (it lives only in the resolved tree).
            const rawPart = rawGlyph.parts.find(rp => rp.key === key);
            return rawPart
              ? new ElementHandle(this.#mutationCtx, 3, rawPart, { group: rawGroup, glyph: rawGlyph })
              : null;
          }
        }
      }
    }
    return null;
  }

  // --- Live Navigation ---

  #getNonSpaceGroupIndices() {
    const indices = [];
    const groups = this.#rawBlissObj.groups || [];
    for (let i = 0; i < groups.length; i++) {
      if (!BlissSVGBuilder.#isRawSpaceGroup(groups[i])) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Returns a live ElementHandle for the non-space group at the given index.
   * @param {number} index
   * @returns {ElementHandle|null}
   */
  group(index) {
    const indices = this.#getNonSpaceGroupIndices();
    if (index < 0) index = indices.length + index;
    if (index < 0 || index >= indices.length) return null;
    const rawGroup = this.#rawBlissObj.groups[indices[index]];
    return new ElementHandle(this.#mutationCtx, 1, rawGroup);
  }

  /**
   * Returns a live ElementHandle for any group (including spaces) at the given raw index.
   * @param {number} index - Raw index (supports negative: -1 = last)
   * @returns {ElementHandle|null}
   */
  element(index) {
    const groups = this.#rawBlissObj.groups;
    if (index < 0) index = groups.length + index;
    if (index < 0 || index >= groups.length) return null;
    return new ElementHandle(this.#mutationCtx, 1, groups[index]);
  }

  /**
   * Total number of raw groups (including space groups).
   * @returns {number}
   */
  get elementCount() {
    return this.#rawBlissObj.groups.length;
  }

  /**
   * Returns a live ElementHandle for the glyph at the given flat index across all groups.
   * @param {number} flatIndex
   * @returns {ElementHandle|null}
   */
  glyph(flatIndex) {
    const indices = this.#getNonSpaceGroupIndices();
    if (flatIndex < 0) {
      let total = 0;
      for (const gi of indices) {
        total += (this.#rawBlissObj.groups[gi].glyphs || []).length;
      }
      flatIndex = total + flatIndex;
    }
    if (flatIndex < 0) return null;
    let count = 0;
    for (const gi of indices) {
      const group = this.#rawBlissObj.groups[gi];
      const glyphs = group.glyphs || [];
      if (flatIndex < count + glyphs.length) {
        return new ElementHandle(this.#mutationCtx, 2, glyphs[flatIndex - count], group);
      }
      count += glyphs.length;
    }
    return null;
  }

  /**
   * Returns a live ElementHandle for the part at the given flat index across all glyphs.
   * @param {number} flatIndex
   * @returns {ElementHandle|null}
   */
  part(flatIndex) {
    const indices = this.#getNonSpaceGroupIndices();
    if (flatIndex < 0) {
      let total = 0;
      for (const gi of indices) {
        for (const glyph of (this.#rawBlissObj.groups[gi].glyphs || [])) {
          total += (glyph.parts || []).length;
        }
      }
      flatIndex = total + flatIndex;
    }
    if (flatIndex < 0) return null;
    let count = 0;
    for (const gi of indices) {
      const group = this.#rawBlissObj.groups[gi];
      const glyphs = group.glyphs || [];
      for (const glyph of glyphs) {
        const parts = glyph.parts || [];
        if (flatIndex < count + parts.length) {
          return new ElementHandle(this.#mutationCtx, 3, parts[flatIndex - count], { group, glyph });
        }
        count += parts.length;
      }
    }
    return null;
  }

  /**
   * Returns a frozen snapshot of the element tree.
   * @returns {ElementSnapshot}
   */
  snapshot() {
    return this.elements;
  }

  // --- Builder Convenience Methods ---

  /**
   * Appends a new glyph group with automatic space management.
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addGroup(code, opts) {
    const nonSpaceCount = this.#getNonSpaceGroupIndices().length;
    return this.insertGroup(nonSpaceCount, code, opts);
  }

  /**
   * Inserts a new glyph group at the given semantic (non-space) index
   * with automatic space management.
   * @param {number} index - Semantic non-space group index
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  insertGroup(index, code, opts) {
    const newGroup = BlissSVGBuilder.#parseGroupWithOpts(code, opts);
    if (!newGroup) return this;
    const groups = this.#rawBlissObj.groups;
    const indices = this.#getNonSpaceGroupIndices();

    if (groups.length === 0 || indices.length === 0) {
      // Empty — just push, no spaces needed
      groups.push(newGroup);
    } else if (index <= 0) {
      // Insert at start: [newGroup, space, ...existing]
      groups.splice(0, 0, newGroup, BlissSVGBuilder.#makeSpaceGroup());
    } else if (index >= indices.length) {
      // Insert at end: [...existing, space, newGroup]
      groups.push(BlissSVGBuilder.#makeSpaceGroup());
      groups.push(newGroup);
    } else {
      // Insert in middle: before the target raw index, add [space, newGroup]
      const rawIndex = indices[index];
      groups.splice(rawIndex, 0, newGroup, BlissSVGBuilder.#makeSpaceGroup());
    }

    this.#rebuild();
    return this;
  }

  /**
   * Appends a glyph to the last non-space group (creates one if empty).
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addGlyph(code, opts) {
    const indices = this.#getNonSpaceGroupIndices();
    if (indices.length === 0) {
      // Empty builder — create a new group with this glyph
      return this.addGroup(code, opts);
    }
    const lastGi = indices[indices.length - 1];
    const rawGroup = this.#rawBlissObj.groups[lastGi];
    const handle = new ElementHandle(this.#mutationCtx, 1, rawGroup);
    handle.addGlyph(code, opts);
    return this;
  }

  /**
   * Appends a part to the last non-space group's last glyph (creates group if empty).
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addPart(code, opts) {
    const indices = this.#getNonSpaceGroupIndices();
    if (indices.length === 0) {
      return this.addGroup(code, opts);
    }
    const lastGi = indices[indices.length - 1];
    const rawGroup = this.#rawBlissObj.groups[lastGi];
    const handle = new ElementHandle(this.#mutationCtx, 1, rawGroup);
    handle.addPart(code, opts);
    return this;
  }

  /**
   * Removes the non-space group at the given semantic index.
   * @param {number} index - Semantic index (supports negative)
   * @returns {this}
   */
  removeGroup(index) {
    const indices = this.#getNonSpaceGroupIndices();
    if (index < 0) index = indices.length + index;
    if (index < 0 || index >= indices.length) return this;
    const rawIndex = indices[index];
    this.#removeGlyphGroup(this.#rawBlissObj, rawIndex);
    this.#rebuild();
    return this;
  }

  /**
   * Replaces the non-space group at the given semantic index.
   * @param {number} index - Semantic index (supports negative)
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  replaceGroup(index, code, opts) {
    const indices = this.#getNonSpaceGroupIndices();
    if (index < 0) index = indices.length + index;
    if (index < 0 || index >= indices.length) return this;
    const newGroup = BlissSVGBuilder.#parseGroupWithOpts(code, opts);
    if (!newGroup) return this;
    const rawIndex = indices[index];
    this.#rawBlissObj.groups[rawIndex] = newGroup;
    this.#rebuild();
    return this;
  }

  /**
   * Merges another builder's content into this one. Appends the other
   * builder's word groups (with a space group between) and discards
   * its global options. The other builder is not modified.
   *
   * @param {BlissSVGBuilder} other
   * @returns {this}
   */
  merge(other) {
    if (!other || typeof other.toJSON !== 'function') {
      throw new Error('merge() requires a BlissSVGBuilder instance');
    }

    const otherRaw = other.toJSON({ deep: true });
    const otherGroups = otherRaw.groups;
    if (!otherGroups || otherGroups.length === 0) return this;

    // Filter out groups that are only spaces (no real content)
    const hasContent = otherGroups.some(
      g => !BlissSVGBuilder.#isRawSpaceGroup(g)
    );
    if (!hasContent) return this;

    // Re-ingest toJSON output into internal format (same order as constructor)
    BlissParser.expandParts({ groups: otherGroups });
    BlissSVGBuilder.#normalizeGlyphCodes(otherGroups);
    BlissSVGBuilder.#flagWordParts({ groups: otherGroups });

    const groups = this.#rawBlissObj.groups;

    // Insert space before appended content if this builder has content
    const hasExisting = groups.some(
      g => !BlissSVGBuilder.#isRawSpaceGroup(g)
    );
    if (hasExisting) {
      groups.push(BlissSVGBuilder.#makeSpaceGroup());
    }

    groups.push(...otherGroups);
    this.#rebuild();
    return this;
  }

  /**
   * Splits this builder into two at the given non-space group boundary.
   * This builder keeps groups 0 through groupIndex-1. A new builder is
   * returned with groups from groupIndex onward. Both builders share the
   * same global options. Space groups at the split boundary are consumed.
   *
   * @param {number} groupIndex - Non-space group index (1 to groupCount-1)
   * @returns {BlissSVGBuilder} New builder with the right-half groups
   */
  splitAt(groupIndex) {
    const indices = this.#getNonSpaceGroupIndices();
    if (indices.length < 2) {
      throw new Error('splitAt() requires at least 2 groups');
    }
    if (groupIndex <= 0 || groupIndex >= indices.length) {
      throw new Error(
        `splitAt(${groupIndex}) is out of range: must be between 1 and ${indices.length - 1} (inclusive) for a builder with ${indices.length} groups`
      );
    }

    // Find the raw index of the split point
    const rawSplitIndex = indices[groupIndex];

    // Extract right-half groups (from rawSplitIndex onward)
    const rightGroups = this.#rawBlissObj.groups.splice(rawSplitIndex);

    // Clean up: remove trailing space groups from the left half
    while (
      this.#rawBlissObj.groups.length > 0 &&
      BlissSVGBuilder.#isRawSpaceGroup(
        this.#rawBlissObj.groups[this.#rawBlissObj.groups.length - 1]
      )
    ) {
      this.#rawBlissObj.groups.pop();
    }

    // Clean up: remove leading space groups from the right half
    while (
      rightGroups.length > 0 &&
      BlissSVGBuilder.#isRawSpaceGroup(rightGroups[0])
    ) {
      rightGroups.shift();
    }

    // Rebuild the left half (this builder)
    this.#rebuild();

    // Build the right half as a new builder
    // Copy global options so both builders have the same styling
    const rightObj = {
      groups: rightGroups,
    };
    if (this.#rawBlissObj.options) {
      rightObj.options = { ...this.#rawBlissObj.options };
    }

    return new BlissSVGBuilder(rightObj);
  }

  /**
   * Parses a code string and applies option layers to the first parsed group.
   * @param {string} code
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {object|null} parsed group or null
   */
  static #parseGroupWithOpts(code, opts) {
    const parsed = BlissParser.parse(code);
    const newGroup = parsed.groups?.[0];
    if (!newGroup) return null;
    if (opts) {
      const { defaults, overrides } = BlissSVGBuilder.#resolveOpts(opts);
      if (defaults || overrides) {
        const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults) : {};
        const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides) : {};
        newGroup.options = { ...rawDefaults, ...(newGroup.options ?? {}), ...rawOverrides };
      }
    }
    return newGroup;
  }

  // --- Raw Element CRUD (no automatic space management) ---

  /**
   * Appends a raw group with no automatic space management.
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addElement(code, opts) {
    const newGroup = BlissSVGBuilder.#parseGroupWithOpts(code, opts);
    if (!newGroup) return this;
    this.#rawBlissObj.groups.push(newGroup);
    this.#rebuild();
    return this;
  }

  /**
   * Inserts a raw group at the given index with no automatic space management.
   * @param {number} index - Raw index (supports negative: -1 = before last)
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  insertElement(index, code, opts) {
    const newGroup = BlissSVGBuilder.#parseGroupWithOpts(code, opts);
    if (!newGroup) return this;
    const groups = this.#rawBlissObj.groups;
    if (index < 0) index = groups.length + index;
    if (index < 0) index = 0;
    if (index >= groups.length) {
      groups.push(newGroup);
    } else {
      groups.splice(index, 0, newGroup);
    }
    this.#rebuild();
    return this;
  }

  /**
   * Removes the raw group at the given index (plain splice, no space cleanup).
   * @param {number} index - Raw index (supports negative: -1 = last)
   * @returns {this}
   */
  removeElement(index) {
    const groups = this.#rawBlissObj.groups;
    if (index < 0) index = groups.length + index;
    if (index < 0 || index >= groups.length) return this;
    groups.splice(index, 1);
    this.#rebuild();
    return this;
  }

  /**
   * Replaces the raw group at the given index with new content.
   * @param {number} index - Raw index (supports negative: -1 = last)
   * @param {string} code - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  replaceElement(index, code, opts) {
    const groups = this.#rawBlissObj.groups;
    if (index < 0) index = groups.length + index;
    if (index < 0 || index >= groups.length) return this;
    const newGroup = BlissSVGBuilder.#parseGroupWithOpts(code, opts);
    if (!newGroup) return this;
    groups[index] = newGroup;
    this.#rebuild();
    return this;
  }

  /**
   * Removes all content from the builder.
   * @returns {this}
   */
  clear() {
    this.#rawBlissObj.groups = [];
    this.#rebuild();
    return this;
  }

  #groupsCache;

  /**
   * Returns non-space group snapshots.
   * Cached and frozen.
   *
   * @returns {ElementSnapshot[]}
   */
  get groups() {
    if (!this.#groupsCache) {
      const groups = this.elements.children.filter(g =>
        g.isGroup && !g.isSpaceGroup
      );
      this.#groupsCache = Object.freeze(groups);
    }
    return this.#groupsCache;
  }

  /**
   * Returns group and glyph counts.
   *
   * @returns {{ groupCount: number, glyphCount: number }}
   */
  get stats() {
    const indices = this.#getNonSpaceGroupIndices();
    let glyphCount = 0;
    for (const gi of indices) {
      glyphCount += (this.#rawBlissObj.groups[gi].glyphs || []).length;
    }
    return { groupCount: indices.length, glyphCount };
  }

  // --- Manipulation helpers ---

  // --- Word-as-part detection ---
  // When a word definition (codeString with /) appears at the part level,
  // the parser keeps it as a single codeName. This post-parse step marks
  // those references with an error so BlissElement can emit a warning.

  /**
   * Reverse toJSON() normalization for object input:
   *  - Glyph level: codeName → glyphCode rename.
   *  - Glyphs and parts: surface text-fallback form 'X<chars>' → internal
   *    routing key 'XTXT_<chars>' so BlissElement / parser routing works.
   * @param {Object[]} groups - Array of raw group objects
   */
  static #normalizeGlyphCodes(groups) {
    for (const group of groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (glyph.codeName && !glyph.glyphCode) {
          glyph.glyphCode = BlissSVGBuilder.#textFallbackInternalForm(glyph.codeName);
          delete glyph.codeName;
        }
        // Re-derive glyph-classification metadata that toJSON() omits (it is
        // fully derived from the code, not authored). The element reads these
        // directly and they round-trip external-glyph navigation/spacing, so
        // restore them from the resolved code the same way the parser does.
        BlissSVGBuilder.#reapplyGlyphMetadata(glyph);
        if (glyph.parts) BlissSVGBuilder.#normalizePartCodes(glyph.parts);
      }
    }
  }

  static #normalizePartCodes(parts) {
    for (const part of parts) {
      if (part.codeName) {
        part.codeName = BlissSVGBuilder.#textFallbackInternalForm(part.codeName);
      }
      if (part.parts) BlissSVGBuilder.#normalizePartCodes(part.parts);
    }
  }

  // 'X<chars>' (public text-fallback form) → 'XTXT_<chars>' (internal
  // routing key). Built-in / registered codes (Xa, XL8, B431, …) and
  // already-internal forms pass through unchanged.
  static #textFallbackInternalForm(code) {
    if (code.startsWith('XTXT_')) return code;
    if (code.length < 2 || code[0] !== 'X') return code;
    if (blissElementDefinitions[code]) return code;
    return 'XTXT_' + code.slice(1);
  }

  // Re-derive glyph-classification metadata (isBlissGlyph / isExternalGlyph /
  // char / kerningRules) from a glyph's resolved glyphCode. toJSON() omits these
  // (they are pure derived data, not authored composition), so object input must
  // restore them like the parser does on string input: a registered code copies
  // them from its definition; a text-fallback 'XTXT_<chars>' derives them (a
  // single char is that rendered glyph, multi-char is '' since it is text, not
  // one glyph). A composite (no glyphCode) carries no glyph-level identity.
  static #reapplyGlyphMetadata(glyph) {
    const code = glyph.glyphCode;
    if (!code) return;
    const def = blissElementDefinitions[code];
    if (def) {
      if (def.isBlissGlyph) glyph.isBlissGlyph = true;
      if (def.isExternalGlyph) glyph.isExternalGlyph = true;
      if (typeof def.char === 'string') glyph.char = def.char;
      if (def.kerningRules) glyph.kerningRules = def.kerningRules;
    } else if (code.startsWith('XTXT_')) {
      const chars = code.slice(5);
      glyph.isExternalGlyph = true;
      glyph.char = chars.length === 1 ? chars : '';
      glyph.kerningRules = {};
    }
  }

  /**
   * Walk a raw parsed structure and flag any word-as-part references.
   * @param {Object} rawObj - Raw parsed blissObj with groups/glyphs/parts
   */
  static #flagWordParts(rawObj) {
    if (!rawObj.groups) return;
    for (const group of rawObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        glyph.parts = BlissSVGBuilder.#flagWordPartsInArray(glyph.parts);
      }
    }
  }

  /**
   * Flag word-definition parts with an error. Recurses into nested parts.
   */
  static #flagWordPartsInArray(parts) {
    const result = [];
    for (const part of parts) {
      const def = blissElementDefinitions[part.codeName];
      if (def?.codeString?.includes('/')) {
        part.error = `"${part.codeName}" is a word and cannot be composed with ;`;
        part.errorCode = 'WORD_AS_PART';
        result.push(part);
      } else {
        if (part.parts) {
          part.parts = BlissSVGBuilder.#flagWordPartsInArray(part.parts);
        }
        result.push(part);
      }
    }
    return result;
  }

  // Space codes used in space groups
  static #SPACE_CODES = new Set(['TSP', 'QSP', 'ZSA', 'SP']);

  /** Returns true if a raw group is a space group */
  static #isRawSpaceGroup(group) {
    if (!group.glyphs || group.glyphs.length === 0) return false;
    return group.glyphs.every(g =>
      g.parts?.length === 1 && BlissSVGBuilder.#SPACE_CODES.has(g.parts[0].codeName)
    );
  }

  /** Creates a default space group for insertion between words */
  static #makeSpaceGroup() {
    return { glyphs: [{ parts: [{ codeName: 'TSP' }] }] };
  }

  /** Internal: removes a glyph group and its adjacent space from groups array */
  #removeGlyphGroup(obj, groupIndex) {
    const groups = obj.groups;
    // Determine which space group to also remove
    const prevIsSpace = groupIndex > 0 && BlissSVGBuilder.#isRawSpaceGroup(groups[groupIndex - 1]);
    const nextIsSpace = groupIndex < groups.length - 1 && BlissSVGBuilder.#isRawSpaceGroup(groups[groupIndex + 1]);

    if (prevIsSpace) {
      // Remove space before + the word
      groups.splice(groupIndex - 1, 2);
    } else if (nextIsSpace) {
      // Remove the word + space after
      groups.splice(groupIndex, 2);
    } else {
      // No adjacent space, just remove the word
      groups.splice(groupIndex, 1);
    }
    return obj;
  }

  /**
   * Returns a portable DSL string. Typeless aliases (word-level codes) are
   * always expanded. Custom glyphs and shapes are decomposed to built-in
   * codes by default; pass { preserve: true } to keep their names.
   *
   * @param {Object} [options]
   * @param {boolean} [options.preserve=false] - Keep custom glyph/shape code names
   * @param {boolean} [options.flattenIndicators=false] - Collapse word-level (`;;`) indicators onto the head as character-level `;`
   * @returns {string}
   */
  toString(options = {}) {
    // toString always needs nested parts so serializeParts can decompose
    // custom codes. The string output itself stays flat (;-delimited).
    const obj = this.toJSON({ preserve: options.preserve, deep: true, flattenIndicators: options.flattenIndicators });

    const GLYPH_INTERNAL_KEYS = new Set(['relativeKerning', 'absoluteKerning']);

    // Serialize an options object to [key=val;key2=val2] DSL format.
    function serializeOptions(opts, skipKeys) {
      if (!opts) return '';
      const entries = Object.entries(opts);
      const filtered = entries.filter(([k, v]) =>
        v !== false && !(skipKeys?.has(k))
      );
      if (filtered.length === 0) return '';
      const parts = filtered.map(([k, v]) => v === true ? k : `${k}=${serializeOptionValue(v)}`);
      return `[${parts.join(';')}]`;
    }

    // Serialize a part with ; delimiter and :x,y positions.
    // Recursively decomposes custom shapes and glyphs unless preserve is set.
    function serializeParts(parts, offsetX = 0, offsetY = 0) {
      return parts.map(part => {
        // An invalid part (no codeName, e.g. the `!B81` in `B291;[x=2]>!B81`)
        // must not let a coordinate suffix or `[opts]>` prefix decorate it into
        // a truthy literal-`undefined` string; drop it before decoration. It
        // already warned UNKNOWN_CODE at parse. (F3.)
        if (!part.codeName) return '';
        const x = (part.x ?? 0) + offsetX;
        const y = (part.y ?? 0) + offsetY;
        if (!options.preserve && !builtInCodes.has(part.codeName)) {
          // Custom code with nested parts (e.g., positioned custom glyph)
          if (part.parts) {
            // A part-level option on the custom base must survive decomposition,
            // but `[opts]>` binds to ONE code, so a multi-code (`;`) result
            // re-emits the option before EACH decomposed part
            // (`[opts]>B291;[opts]>C8`): render applied it to the whole
            // `;`-character, and per-part emission computes to the same ink.
            // Merging structurally, inner keys winning, keeps a part's own
            // option authoritative, the order nested <g> attribute inheritance
            // resolves to. Keys collide at the ATTRIBUTE level, not the key
            // level: `color` aliases `stroke` (and camel `strokeWidth` its
            // kebab form), and the renderer dedupes explicit-beats-alias, so an
            // outer `stroke` merged next to a part's own `color` would flip the
            // part's paint on round-trip unless it yields here. (TF-3G / TF-3.)
            const attrChannel = (k) =>
              k === 'color' ? 'stroke' : k === 'strokeWidth' ? 'stroke-width' : k;
            const innerParts = part.options
              ? part.parts.map(p => {
                  const ownChannels = new Set(Object.keys(p.options ?? {}).map(attrChannel));
                  const outer = Object.entries(part.options)
                    .filter(([k]) => !ownChannels.has(attrChannel(k)));
                  return { ...p, options: { ...Object.fromEntries(outer), ...p.options } };
                })
              : part.parts;
            return serializeParts(innerParts, x, y);
          }
          // Custom composite shape (has codeString, no getPath)
          const def = blissElementDefinitions[part.codeName];
          if (def?.isShape && def.codeString && !def.getPath) {
            return BlissSVGBuilder.#decomposeCodeString(def.codeString, x, y);
          }
        }
        // Surface text-fallback routing key 'XTXT_<chars>' as 'X<chars>'.
        let str = part.codeName.startsWith('XTXT_')
          ? 'X' + part.codeName.slice(5)
          : part.codeName;
        if (x !== 0 || y !== 0) {
          str += `:${x},${y}`;
        }
        // Prefix part-level options with [opts]> syntax
        const optPrefix = serializeOptions(part.options);
        if (optPrefix) str = `${optPrefix}>${str}`;
        return str;
      })
        // Drop empty entries (invalid parts dropped by the codeName guard above,
        // or an inner decomposition that emitted nothing) so no dangling `;`
        // appears and toString round-trips. (Strict Indicator Separation
        // surfaced this; the empty-separator artifact predates it.)
        .filter(Boolean)
        .join(';');
    }

    // Under preserve, keep a custom glyph's name but re-emit any per-instance
    // indicator delta against the definition's baked state, so a glyph whose
    // indicators were modified (`_X;B81`, `_X;!B81`, `_X;!`) round-trips
    // instead of collapsing to the bare name. Bare name when state is baked.
    function serializeCustomGlyphDelta(glyph) {
      const def = blissElementDefinitions[glyph.codeName];
      if (!def?.codeString || !glyph.parts) return glyph.codeName;
      const currentInds = glyph.parts
        .filter(p => p.isIndicator)
        .map(p => p.codeName);
      // Baked indicators are identified by isIndicator, not by position: a
      // baseless compound indicator (e.g. 'B86;B97') has no base segment to
      // skip, so its first segment counts too. A real base is non-indicator and
      // the filter excludes it anyway, so skipping the first segment is wrong
      // for the baseless case and redundant otherwise.
      const bakedInds = def.codeString.split(';')
        .filter(c => blissElementDefinitions[c.split(':')[0]]?.isIndicator);
      if (currentInds.length === bakedInds.length
          && currentInds.every((c, i) => c === bakedInds[i])) {
        return glyph.codeName;
      }
      // The smart API changed the indicator state. Only a compound-indicator
      // glyph bakes indicators (D-S1a), and the API can reorder or strip those
      // baked parts; a dumb char-level `;` delta against the name can no longer
      // encode that (re-appending a baked code doubles it, a `;!` strip becomes
      // an invalid append), so decompose to primitives, which dumb `;` rebuilds
      // exactly. (Strict Indicator Separation; supersedes the old `;`/`;!` delta.)
      if (bakedInds.length > 0) {
        return serializeParts(glyph.parts);
      }
      // A base-only glyph bakes no indicator, so the API only appends: a dumb
      // `;` delta against the name round-trips faithfully and keeps the local
      // name, which `preserve` must do independently of `flattenIndicators`
      // (R3b2-2 orthogonality). But `name;codes` maps each part's bare codeName
      // and re-references the base opaquely at 0,0, so it cannot encode a baked
      // base offset, a per-instance indicator coord, or a part-level option. If
      // any part would emit a `:x,y` / `[opts]>` suffix (the same test
      // serializeParts uses), decompose to primitives, which DO carry it,
      // instead of silently dropping it; the bare case still keeps the name.
      const carriesPositionOrOptions = (p) =>
        (p.x ?? 0) !== 0 || (p.y ?? 0) !== 0 || serializeOptions(p.options) !== '';
      if (glyph.parts.some(carriesPositionOrOptions)) {
        return serializeParts(glyph.parts);
      }
      return glyph.codeName + ';' + currentInds.join(';');
    }

    // Serialize a glyph: B-codes emit their code, compositions emit parts.
    // Custom glyphs are decomposed to their codeString unless preserve is set.
    // Returns an array (kerning codes are emitted as separate entries).
    function serializeGlyph(glyph) {
      const result = [];

      // Emit kerning as separate RK/AK codes before the glyph
      if (glyph.options?.relativeKerning !== undefined) {
        result.push(`RK:${glyph.options.relativeKerning}`);
      }
      if (glyph.options?.absoluteKerning !== undefined) {
        result.push(`AK:${glyph.options.absoluteKerning}`);
      }

      // Build the glyph code string
      let code;
      if (glyph.isBlissGlyph && glyph.codeName) {
        // Decompose custom glyphs (non-built-in) to portable output
        // Use the glyph's parts (which have correct positions) rather than
        // re-decomposing from the definition (which would lose position offsets)
        if (!options.preserve && !builtInCodes.has(glyph.codeName)) {
          if (glyph.parts) {
            code = serializeParts(glyph.parts);
          } else {
            const def = blissElementDefinitions[glyph.codeName];
            if (def?.codeString) {
              code = BlissSVGBuilder.#decomposeCodeString(def.codeString, 0, 0);
            }
          }
        } else if (options.preserve && !builtInCodes.has(glyph.codeName)) {
          code = serializeCustomGlyphDelta(glyph);
        }
        if (!code) {
          // A built-in glyph can re-acquire identity while its parts still hold
          // detail the bare code would drop: a sole part with a relocation
          // offset and/or a part-level option (N13, e.g. clearIndicators on
          // `[color=red]>B291:2,3;B86` restores codeName 'B291' but parts[0]
          // keeps x/y + options), or an applied indicator part beyond the bare
          // identity (a base-only custom glyph whose codeName collapsed to its
          // built-in base after `applyIndicators`). Route any non-empty parts
          // through serializeParts so all of them round-trip. No UNMODIFIED
          // built-in reaches here multi-part (its snapshot part is a single
          // self-reference), so this never over-decomposes a plain composite.
          code = glyph.parts?.length
            ? serializeParts(glyph.parts)
            : glyph.codeName;
        }
      } else if (glyph.parts) {
        code = serializeParts(glyph.parts);
      } else {
        code = glyph.codeName || '';
      }

      // Prefix glyph-level options (skip internal kerning keys)
      const optPrefix = serializeOptions(glyph.options, GLYPH_INTERNAL_KEYS);
      result.push(optPrefix + code);
      return result;
    }

    // Check if a group is a space (TSP, QSP, etc.)
    const SPACE_CODES = new Set(['TSP', 'QSP', 'ZSA']);
    function isSpaceGroup(group) {
      if (!group.glyphs || group.glyphs.length === 0) return false;
      return group.glyphs.every(g =>
        g.parts?.length === 1 && SPACE_CODES.has(g.parts[0].codeName)
      );
    }

    const segments = [];
    for (const group of obj.groups || []) {
      if (!group.glyphs) continue;
      // A group the parser flagged as a malformed word (errorCode) re-emits its
      // original offending string verbatim, so parse(toString(x)) re-detects the
      // same fault and re-flags. Its base glyphs (kept only so the failed word
      // advances like a normal one) are NOT serialized: they would collapse to a
      // valid word and silently lose the malformation.
      if (group.errorCode && group.errorSource !== undefined) {
        const optPrefix = serializeOptions(group.options);
        segments.push(optPrefix ? `${optPrefix}|${group.errorSource}` : group.errorSource);
        continue;
      }
      if (isSpaceGroup(group)) {
        const hasNonDefaultSpace = group.glyphs.some(g =>
          g.parts?.some(p => p._differsFromDefault)
        );
        if (hasNonDefaultSpace) {
          // Explicit space codes that differ from default — keep them
          const codes = group.glyphs.map(g => g.parts[0].codeName);
          segments.push(codes.join('/'));
        } else {
          // Default spaces — use // shorthand, N spaces = N+1 slashes
          const slashes = '/'.repeat(group.glyphs.length + 1);
          segments.push(slashes);
        }
        continue;
      }
      const glyphArrays = group.glyphs.map(serializeGlyph);
      let groupStr = glyphArrays.flat().filter(Boolean).join('/');
      // Head-marker fidelity (rc.4): a stored designation ALWAYS re-emits as
      // `^` on the marked glyph's last segment, matching toJSON's isHeadGlyph,
      // so a string round-trip never loses the designation — even when the
      // automatic head pick would re-derive the same glyph. Words without a
      // stored designation stay unmarked (the automatic pick is derived at
      // query time, never stored).
      const headIndex = group.glyphs.findIndex(g => g.isHeadGlyph === true);
      if (headIndex !== -1 && groupStr) {
        const headSegments = glyphArrays[headIndex];
        if (headSegments.length && headSegments[headSegments.length - 1]) {
          headSegments[headSegments.length - 1] += '^';
          groupStr = glyphArrays.flat().filter(Boolean).join('/');
        }
      }
      // R14: re-emit a word-level indicator overlay as trailing `;;` (kept by
      // default; `flatten` collapses it onto the head as `;` instead).
      if (group.wordIndicators && groupStr) {
        const { codes = [], stripSemantic } = group.wordIndicators;
        groupStr += ';;' + (stripSemantic ? '!' : '') + codes.join(';');
      }
      // Prefix group-level options with [opts]| syntax
      const groupOptPrefix = serializeOptions(group.options);
      if (groupOptPrefix) groupStr = `${groupOptPrefix}|${groupStr}`;
      segments.push(groupStr);
    }
    // Join: slash-only segments already include separators, others need /
    let result = segments.reduce((acc, seg) => {
      if (acc === '') return seg;
      if (seg.startsWith('/')) return acc + seg;
      if (acc.endsWith('/')) return acc + seg;
      return acc + '/' + seg;
    }, '');

    // Prefix global options with [opts]|| syntax
    const globalOptPrefix = serializeOptions(obj.options);
    if (globalOptPrefix) result = `${globalOptPrefix}||${result}`;

    return result;
  }

  /**
   * Returns the normalized parsed structure. Typeless aliases (word-level
   * codes) are always expanded. Custom glyphs are decomposed by default:
   * simple aliases resolve to their built-in code, complex compositions
   * drop the custom code (parts are already expanded).
   * Pass { preserve: true } to keep all custom names.
   *
   * @param {Object} [options]
   * @param {boolean} [options.preserve=false] - Keep custom glyph/shape code names
   * @param {boolean} [options.flattenIndicators=false] - Bake word-level (`;;`) indicators onto the head and omit the wordIndicators field
   * @returns {Object} Plain object with groups/glyphs/options structure
   */
  toJSON(options = {}) {
    const obj = structuredClone(this.#rawBlissObj);

    // Internal parse-warning record: consumed by #rebuild to repopulate
    // `warnings`, never part of the public composition data (absent from the
    // BlissJSON type). Strip it so toJSON() is clean authoring data and a JSON
    // round-trip does not re-emit a warning for an offender already dropped.
    delete obj._parseWarnings;

    // Strip keys from all levels (keys are runtime identity, not composition data)
    delete obj.key;
    if (obj.options) delete obj.options.key;

    if (obj.groups) {
      // Strip keys from parts. Unless deep: true, also strip nested sub-parts
      // (internal expansion detail). The constructor re-expands from codeName
      // via BlissParser.expandParts().
      const stripParts = (parts) => {
        for (const part of parts) {
          delete part.key;
          // Internal origin tag from the word-indicator merge (flatten path):
          // not composition data, never surfaced in serialized output.
          delete part._indicatorOrigin;
          if (part.options) delete part.options.key;
          // Surface text-fallback routing key 'XTXT_<chars>' as 'X<chars>'.
          if (part.codeName?.startsWith('XTXT_')) {
            part.codeName = 'X' + part.codeName.slice(5);
          }
          // Default output drops definition-derived anchor metadata the renderer
          // recomputes from the code; isIndicator/width stay (a documented part of
          // the default shape). deep output keeps everything for toString()/merge().
          if (!options.deep) {
            delete part.anchorOffsetX;
            delete part.anchorOffsetY;
          }
          if (options.deep && part.parts) {
            stripParts(part.parts);
          } else {
            delete part.parts;
          }
        }
      };

      for (const group of obj.groups) {
        delete group.key;
        if (group.options) delete group.options.key;

        // R14: flattenIndicators bakes the word-level overlay onto the head as
        // character-level parts and drops the field, reproducing the pre-overlay
        // (primitive) serialization. Default keeps the overlay (resolved at
        // render, re-emitted as `;;`).
        if (options.flattenIndicators && group.wordIndicators && group.glyphs?.length) {
          const marked = group.glyphs.findIndex(g => g.isHeadGlyph === true);
          const headIndex = marked !== -1 ? marked : resolveHeadIndex(group.glyphs.map(getHeadCode));
          const head = group.glyphs[headIndex];
          head.parts = mergeWordIndicatorsOntoHead(
            head, group.wordIndicators, blissElementDefinitions, (code) => BlissParser.parse(code)
          );
          // A head with baked indicator parts is no longer a bare single code,
          // so clear its single-code identity to force part-based serialization
          // (`B291;B81`); otherwise serializeGlyph emits the bare codeName and
          // drops the baked parts. The one exception is a custom glyph under
          // `preserve`: it keeps its name and re-emits the overlay as a delta
          // (`_LOVE;B81`), so leave its identity intact.
          if (head.glyphCode && head.parts.some(p => p.isIndicator)
              && !(options.preserve && !builtInCodes.has(head.glyphCode))) {
            delete head.glyphCode;
            delete head.isBlissGlyph;
          }
          delete group.wordIndicators;
        }

        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            delete glyph.key;
            if (glyph.options) delete glyph.options.key;
            if (glyph.parts) stripParts(glyph.parts);

            // Normalize glyphCode → codeName for public API
            if (glyph.glyphCode) {
              // Surface text-fallback routing key 'XTXT_<chars>' as 'X<chars>'.
              const publicCode = glyph.glyphCode.startsWith('XTXT_')
                ? 'X' + glyph.glyphCode.slice(5)
                : glyph.glyphCode;
              // Decompose custom glyphs to portable codes by default
              if (!options.preserve && !builtInCodes.has(glyph.glyphCode)) {
                const def = blissElementDefinitions[glyph.glyphCode];
                if (def?.codeString) {
                  // Resolve to the underlying built-in code (null for complex compositions)
                  const resolved = BlissSVGBuilder.#resolveToBuiltInCode(glyph.glyphCode);
                  if (resolved) glyph.codeName = resolved;
                } else {
                  glyph.codeName = publicCode;
                }
              } else {
                glyph.codeName = publicCode;
              }
              delete glyph.glyphCode;
            }
            // Parts already use codeName internally, no rename needed

            // Default output omits glyph-classification metadata: it is fully
            // derived from the code and re-derived on reconstruction (see
            // #reapplyGlyphMetadata), so it is not user-authored composition data.
            // deep output keeps it for toString()/merge(). (issue #28 toJSON audit)
            if (!options.deep) {
              delete glyph.char;
              delete glyph.isBlissGlyph;
              delete glyph.isExternalGlyph;
              delete glyph.kerningRules;
            }
          }
        }
      }
    }
    return obj;
  }



  /**
   * Returns the SVG content (path elements and groups) as a string.
   * This is useful when you need only the primary graphical content of the SVG for manipulation or for use in complex SVG compositions.
   *
   * @returns {string} SVG content string
   */
  get svgContent() {
    const content = this.composition.getSvgContent();

    // If content already contains complete SVG tags (like <g> from hierarchical options), return as-is
    if (content.startsWith('<')) {
      return content;
    }

    // Otherwise, wrap raw path data in a <path> element
    return `<path d="${content}"/>`;
  }

  /**
   * Returns the SVG as a DOM Element.
   * This property is useful when you need to directly manipulate the SVG using the native DOM API.
   * 
   * @returns {SVGSVGElement} SVG DOM element
   */
  get svgElement() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.#svgCode, 'image/svg+xml');
    return doc.documentElement;
  }
  
  /**
   * Returns the SVG code as a string, without the XML declaration.
   * This is suitable for embedding the SVG within HTML documents or using it with virtual DOM libraries like React and Preact.
   * 
   * @returns {string} SVG string without XML declaration
   */
  get svgCode() {
    return this.#svgCode;
  }

  /**
   * Returns the SVG code as a string, including the XML declaration.
   * This is suitable for creating standalone SVG files.
   * 
   * @returns {string} SVG string with XML declaration
   */
  get standaloneSvg() {
    return `<?xml version="1.0" encoding="utf-8"?>\n${this.#svgCode}`;
  }


  // Validates a definition code string
  static #validateCode(code) {
    if (typeof code !== 'string' || code.length === 0) {
      throw new Error('Definition code must be a non-empty string.');
    }
  }

  // ── Define validation helpers ───────────────────────────────────

  // Extract referenced codes from a codeString (strips positions, options, etc.)
  static #extractReferencedCodes(codeString) {
    if (!codeString) return [];
    return codeString
      .split(/[;/]+/)
      .map(part => part.replace(/\[.*?\]>?/g, '').split(':')[0].replace(/\^$/, ''))
      .filter(code => code.length > 0);
  }

  // Recursively decompose a codeString to built-in codes, adjusting coordinates.
  // Used by toString() for portable output of custom shapes and glyphs.
  static #decomposeCodeString(codeString, offsetX, offsetY) {
    const parts = codeString.split(';');
    return parts.map(part => {
      const posMatch = part.match(/^([^:]+)(?::(-?[\d.]+),(-?[\d.]+))?$/);
      if (!posMatch) return part;

      const [, code, xStr, yStr] = posMatch;
      const x = (parseFloat(xStr) || 0) + offsetX;
      const y = (parseFloat(yStr) || 0) + offsetY;

      // Recursively decompose custom composite shapes
      if (!builtInCodes.has(code)) {
        const def = blissElementDefinitions[code];
        if (def?.isShape && def.codeString && !def.getPath) {
          return BlissSVGBuilder.#decomposeCodeString(def.codeString, x, y);
        }
        if (def?.isBlissGlyph && def.codeString) {
          return BlissSVGBuilder.#decomposeCodeString(def.codeString, x, y);
        }
      }

      if (x === 0 && y === 0) return code;
      return `${code}:${x},${y}`;
    }).join(';');
  }

  // Resolve a custom glyph code to its underlying built-in code (for toJSON).
  // Follows the chain until a built-in code is found.
  static #resolveToBuiltInCode(code, visited = new Set()) {
    if (visited.has(code)) return code;
    visited.add(code);
    const def = blissElementDefinitions[code];
    if (!def?.codeString) return code;
    // If codeString is a single code reference (no ; or / or :), resolve further
    if (!def.codeString.includes(';') && !def.codeString.includes('/') && !def.codeString.includes(':')) {
      if (builtInCodes.has(def.codeString)) return def.codeString;
      return BlissSVGBuilder.#resolveToBuiltInCode(def.codeString, visited);
    }
    return null; // Complex codeString — parts already expanded, no single code
  }

  // Determine the type of a definition entry.
  // Single source of truth used by getDefinition, listDefinitions,
  // patchDefinition, and #validateReferences.
  static #detectType(def) {
    if (def.isShape) return 'shape';
    if (def.isExternalGlyph) return 'externalGlyph';
    if (def.isBlissGlyph || def.glyphCode) return 'glyph';
    if (def.codeString !== undefined) return 'bare';
    return 'space';
  }

  // Check if a codeString references only allowed types
  static #validateReferences(code, codeString, allowedTypes) {
    const refs = BlissSVGBuilder.#extractReferencedCodes(codeString);
    for (const ref of refs) {
      if (ref === code) {
        return `"${code}": circular reference (references itself)`;
      }
      const def = blissElementDefinitions[ref];
      if (!def) continue; // Unknown codes will fail at parse time
      const type = BlissSVGBuilder.#detectType(def);
      if (!allowedTypes.includes(type)) {
        return `"${code}": cannot reference ${type} "${ref}". Allowed types: ${allowedTypes.join(', ')}`;
      }
    }
    return null;
  }

  // Detect circular references via depth-first traversal
  static #hasCircularReference(code, codeString) {
    const visited = new Set();
    const walk = (refs) => {
      for (const ref of refs) {
        if (ref === code) return true;
        if (visited.has(ref)) continue;
        visited.add(ref);
        const def = blissElementDefinitions[ref];
        if (def?.codeString) {
          const subRefs = BlissSVGBuilder.#extractReferencedCodes(def.codeString);
          if (walk(subRefs)) return true;
        }
      }
      return false;
    };
    return walk(BlissSVGBuilder.#extractReferencedCodes(codeString));
  }

  // ── Private define helpers ──────────────────────────────────────

  static #defineShape(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    const hasGetPath = typeof definition?.getPath === 'function';
    const hasCodeString = typeof definition?.codeString === 'string' && definition.codeString.length > 0;

    if (!hasGetPath && !hasCodeString) {
      throw new Error(`define("${code}"): shape requires either "getPath" (function) or "codeString" (non-empty string).`);
    }

    if (hasGetPath) {
      if (typeof definition.width !== 'number' || !isFinite(definition.width)) {
        throw new Error(`define("${code}"): "width" must be a finite number.`);
      }
      if (typeof definition.height !== 'number' || !isFinite(definition.height)) {
        throw new Error(`define("${code}"): "height" must be a finite number.`);
      }
    }

    // Shapes can only reference other shapes
    if (hasCodeString) {
      const refError = BlissSVGBuilder.#validateReferences(code, definition.codeString, ['shape']);
      if (refError) throw new Error(`define(${refError})`);
      if (BlissSVGBuilder.#hasCircularReference(code, definition.codeString)) {
        throw new Error(`define("${code}"): circular reference detected`);
      }
      // A shape is a single character; `/` and `//` are word separators, so a
      // `/`-bearing codeString is a word, not a shape. Define a word as a bare
      // alias (omit type:"shape"). (Strict Indicator Separation, F4.)
      if (definition.codeString.includes('/')) {
        throw new Error(`define("${code}"): a shape definition cannot be a multi-character word (its codeString contains "/"). Define a word as a bare alias (omit type:"shape").`);
      }

      // `;;` is a word-level indicator (a word property); a shape is a single
      // character, so it cannot carry one. (Strict Indicator Separation.)
      if (definition.codeString.includes(';;')) {
        throw new Error(`define("${code}"): a shape definition cannot contain a word-level indicator (";;"); a shape is a single character.`);
      }
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const entry = { isShape: true };

    if (hasGetPath) {
      entry.getPath = definition.getPath;
      entry.width = definition.width;
      entry.height = definition.height;
      if (definition.x !== undefined) entry.x = definition.x;
      if (definition.y !== undefined) entry.y = definition.y;
      if (definition.extraPathOptions) entry.extraPathOptions = definition.extraPathOptions;
    } else {
      entry.codeString = definition.codeString;
    }

    if (definition.defaultOptions && typeof definition.defaultOptions === 'object') {
      // Snapshot ONCE, validate the snapshot, store the SAME snapshot: the
      // guard must judge exactly what the registry keeps, or an accessor /
      // Proxy could show one set of keys to validation and another to storage
      // (round-4 review F1).
      const defaultOptionsSnapshot = { ...definition.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertNoGlobalOnlyDefaultOptions('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = defaultOptionsSnapshot;
      }
    }

    blissElementDefinitions[code] = entry;
  }

  // A definition's defaultOptions attach at glyph/part level, where a
  // builder-canvas (global-only) option key is inert at EVERY use form — and a
  // ;; overlay stores the definition NAME, so such a key would never reach a
  // parse boundary that could warn (silent forever; review-fix round 2, F1).
  // A definition must be clean: reject at the source, like the codeString
  // guards. Both spellings are checked (defaultOptions are stored verbatim,
  // so a camelCase key is just as inert).
  static #assertNoGlobalOnlyDefaultOptions(callName, code, defaultOptions) {
    for (const key of Object.keys(defaultOptions)) {
      // Trim before matching: the serializer emits a padded key as
      // '[ margin=2]' and #parseOptions reads that as plain 'margin', so a
      // whitespace-padded spelling IS the global-only key at the next
      // boundary (round-3 review F1).
      const normalized = key.trim();
      // A key must be a well-formed option name at all (camelCase names pass
      // the same test): anything else — '=', ';', brackets, inner spaces —
      // would smuggle arbitrary option text into the serialized bracket,
      // where the parser can read a key this guard never saw
      // ('margin=2;color' emits as '[margin=2;color=red]').
      if (!isSafeAttributeName(normalized)) {
        throw new Error(`${callName}("${code}"): defaultOptions key "${key}" is not a valid option name.`);
      }
      if (GLOBAL_ONLY_OPTION_KEYS.has(normalized) || GLOBAL_ONLY_OPTION_KEYS.has(camelToKebab(normalized))) {
        throw new Error(`${callName}("${code}"): defaultOptions cannot include the global-only option "${key}"; it configures the whole SVG and would be inert on a definition. Set it in the global bracket ([...]||) or the builder options instead.`);
      }
    }
  }

  static #defineGlyph(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty string.`);
    }

    // A glyph is a single character; `/` and `//` are word separators, so a
    // `/`-bearing codeString is a word, not a glyph. Define a word as a bare
    // alias (omit type:"glyph"). (Strict Indicator Separation, F4.)
    if (definition.codeString.includes('/')) {
      throw new Error(`define("${code}"): a glyph definition cannot be a multi-character word (its codeString contains "/"). Define a word as a bare alias (omit type:"glyph").`);
    }

    // `;;` is a word-level indicator (a word property); a glyph is a single
    // character, so it cannot carry one. (Strict Indicator Separation.)
    if (definition.codeString.includes(';;')) {
      throw new Error(`define("${code}"): a glyph definition cannot contain a word-level indicator (";;"); a glyph is a single character. Apply a word indicator at the use site (WORD;;INDICATOR).`);
    }

    // Glyphs can reference other glyphs and shapes, but not external glyphs or bare aliases
    const refError = BlissSVGBuilder.#validateReferences(code, definition.codeString, ['glyph', 'shape']);
    if (refError) throw new Error(`define(${refError})`);
    if (BlissSVGBuilder.#hasCircularReference(code, definition.codeString)) {
      throw new Error(`define("${code}"): circular reference detected`);
    }

    // D-S1a: a glyph is a base character or a compound indicator, never a
    // base+indicator combo. Reject a glyph def (not flagged isIndicator) that
    // bakes in an indicator part; define such combos as bare aliases instead.
    if (definition.isIndicator !== true) {
      const refs = BlissSVGBuilder.#extractReferencedCodes(definition.codeString);
      if (refs.some(ref => blissElementDefinitions[ref]?.isIndicator === true)) {
        throw new Error(`define("${code}"): a glyph definition cannot bake in an indicator. Define a base+indicator combination as a bare alias (omit type:"glyph"), attach the indicator at the use site (BASE;INDICATOR), or flag a compound indicator with isIndicator:true.`);
      }
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const entry = {
      codeString: definition.codeString,
      glyphCode: code,
      isBlissGlyph: true
    };
    if (definition.isIndicator === true) entry.isIndicator = true;
    if (typeof definition.anchorOffsetX === 'number' && isFinite(definition.anchorOffsetX)) {
      entry.anchorOffsetX = definition.anchorOffsetX;
    }
    if (typeof definition.anchorOffsetY === 'number' && isFinite(definition.anchorOffsetY)) {
      entry.anchorOffsetY = definition.anchorOffsetY;
    }
    if (typeof definition.width === 'number' && isFinite(definition.width)) {
      entry.width = definition.width;
    }
    if (definition.kerningRules && typeof definition.kerningRules === 'object') {
      entry.kerningRules = { ...definition.kerningRules };
    }
    if (definition.shrinksPrecedingWordSpace === true) {
      entry.shrinksPrecedingWordSpace = true;
    }
    if (definition.defaultOptions && typeof definition.defaultOptions === 'object') {
      // Snapshot ONCE, validate the snapshot, store the SAME snapshot: the
      // guard must judge exactly what the registry keeps, or an accessor /
      // Proxy could show one set of keys to validation and another to storage
      // (round-4 review F1).
      const defaultOptionsSnapshot = { ...definition.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertNoGlobalOnlyDefaultOptions('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = defaultOptionsSnapshot;
      }
    }

    blissElementDefinitions[code] = entry;
  }

  static #defineExternalGlyph(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.getPath !== 'function') {
      throw new Error(`define("${code}"): "getPath" must be a function.`);
    }
    if (typeof definition.width !== 'number' || !isFinite(definition.width)) {
      throw new Error(`define("${code}"): "width" must be a finite number.`);
    }
    if (typeof definition.char !== 'string' || definition.char.length === 0) {
      throw new Error(`define("${code}"): "char" must be a non-empty string.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const entry = {
      getPath: definition.getPath,
      width: definition.width,
      char: definition.char,
      isExternalGlyph: true
    };
    if (typeof definition.y === 'number') entry.y = definition.y;
    if (typeof definition.height === 'number') entry.height = definition.height;
    if (definition.kerningRules && typeof definition.kerningRules === 'object') {
      entry.kerningRules = { ...definition.kerningRules };
    }
    if (definition.defaultOptions && typeof definition.defaultOptions === 'object') {
      // Snapshot ONCE, validate the snapshot, store the SAME snapshot: the
      // guard must judge exactly what the registry keeps, or an accessor /
      // Proxy could show one set of keys to validation and another to storage
      // (round-4 review F1).
      const defaultOptionsSnapshot = { ...definition.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertNoGlobalOnlyDefaultOptions('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = defaultOptionsSnapshot;
      }
    }

    blissElementDefinitions[code] = entry;
  }

  // Resolve chained bare aliases in a codeString.
  // Replaces bare alias tokens with their resolved codeString, repeating
  // until no more aliases remain (up to depth 50).
  // Head-marker contract: marked invocations (ALIAS^) and aliases whose
  // codeString carries a ^ designation stay as references, so the parser
  // resolves the marker in its own word-string scope (rules 2 and 4).
  // Inlining them would silently rebind the marker to a different scope.
  static #resolveBareAliases(codeString) {
    let resolved = codeString;
    for (let depth = 0; depth < 50; depth++) {
      let changed = false;
      resolved = resolved.replace(
        /(?<=^|[/;])([A-Za-z_][\w]*)(?=$|[/;:])/g,
        (match, token) => {
          const def = blissElementDefinitions[token];
          if (def && def.codeString && !def.codeString.includes('^')
              && !def.isBlissGlyph && !def.isShape && !def.isExternalGlyph && !def.glyphCode) {
            changed = true;
            return def.codeString;
          }
          return match;
        }
      );
      if (!changed) break;
    }
    return resolved;
  }

  /**
   * Part-merge operand check (reuses the runtime predicate via the parser):
   * true if the codeString uses a composed unflagged alias as a non-leading
   * ;-part, which the parser flags COMPOSITE_AS_PART. Run on the RAW codeString,
   * before bare-alias resolution would flatten it to the legal explicit form.
   * Parse failures (e.g. a circular reference) are not this check's concern.
   */
  static #hasCompositePartViolation(codeString) {
    let parsed;
    try {
      parsed = BlissParser.parse(codeString);
    } catch {
      return false;
    }
    for (const group of parsed.groups ?? []) {
      for (const glyph of group.glyphs ?? []) {
        for (const part of glyph.parts ?? []) {
          if (part.errorCode === 'COMPOSITE_AS_PART') return true;
        }
      }
    }
    return false;
  }

  static #defineBare(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty string.`);
    }

    // `;;` is a word-level indicator applied at the USE SITE (WORD;;INDICATOR),
    // never baked into a stored definition -- the same rule #defineGlyph and
    // #defineShape enforce, extended to bare aliases. Baking it in is nonsensical:
    // a further use-site `;;` on such a definition would nest word-indicators, yet
    // a word carries only one. Reject ANY `;;`, whether or not the code after it
    // is itself an indicator. (Strict Indicator Separation.)
    if (definition.codeString.includes(';;')) {
      throw new Error(`define("${code}"): a definition cannot contain a word-level indicator (";;"); apply a word indicator at the use site (WORD;;INDICATOR).`);
    }

    // Reject a definition cycle at define time. Bare aliases can reference any
    // type (glyph/shape/bare), so unlike #defineGlyph/#defineShape this path had
    // no cycle guard: a cycle (CA -> CB -> CA, or a direct self-reference) was
    // stored and then crashed at render with "Maximum recursion depth". Rejecting
    // one side here leaves the chain terminating at an unregistered code instead.
    if (BlissSVGBuilder.#hasCircularReference(code, definition.codeString)) {
      throw new Error(`define("${code}"): circular reference detected`);
    }

    // Part-merge operand rule: a ; part must be a part (a primitive or a flagged
    // glyph/indicator), never a composition. Reject a codeString that uses a
    // composed unflagged alias as a ;-part (checked on the raw codeString, before
    // #resolveBareAliases flattens it to the legal explicit form), so define() is
    // consistent with the use-site failure.
    if (BlissSVGBuilder.#hasCompositePartViolation(definition.codeString)) {
      throw new Error(`define("${code}"): a ; part cannot be a composition ("${definition.codeString}"). A ; part must be a primitive or a flagged glyph; attach indicators at the use site (BASE;INDICATOR) or compose words with /.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const resolved = BlissSVGBuilder.#resolveBareAliases(definition.codeString);

    // Word definitions (containing /) must not have internal position modifiers.
    // Position should be applied at the usage site, e.g. WORD:2,0
    if (resolved.includes('/')) {
      const segments = resolved.split(/[/;]/).filter(Boolean);
      const hasCoords = segments.some(seg => /:-?[\d.]/.test(seg));
      if (hasCoords) {
        throw new Error(`define("${code}"): word definitions (containing /) cannot have internal coordinates. Move coordinates to the usage site.`);
      }
    }

    const entry = { codeString: resolved };

    if (definition.defaultOptions && typeof definition.defaultOptions === 'object') {
      // Snapshot ONCE, validate the snapshot, store the SAME snapshot: the
      // guard must judge exactly what the registry keeps, or an accessor /
      // Proxy could show one set of keys to validation and another to storage
      // (round-4 review F1).
      const defaultOptionsSnapshot = { ...definition.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertNoGlobalOnlyDefaultOptions('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = defaultOptionsSnapshot;
      }
    }

    blissElementDefinitions[code] = entry;
  }

  /**
   * Define one or more codes. The single public entry point for all definitions.
   *
   * Use the optional `type` field to specify the definition type:
   * - `type: 'glyph'` — Bliss character (sets isBlissGlyph, glyphCode)
   * - `type: 'shape'` — shape (primitive with getPath, or composite with codeString)
   * - `type: 'externalGlyph'` — external glyph (getPath + glyph)
   * - No type — bare definition (word, alias, or any codeString-based code)
   *
   * When no `type` is specified, auto-detection applies for getPath-based definitions:
   * - Has getPath + glyph → externalGlyph
   * - Has getPath (no glyph) → shape
   * - Has codeString (no type) → bare definition
   *
   * @param {Object.<string, Object>} definitions - Map of code → definition
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   * @returns {{ defined: string[], skipped: string[], errors: string[] }}
   */
  static define(definitions, options = {}) {
    const result = { defined: [], skipped: [], errors: [] };

    if (!definitions || typeof definitions !== 'object') {
      return result;
    }

    for (const [code, definition] of Object.entries(definitions)) {
      try {
        const type = definition?.type;

        if (type && type !== 'glyph' && type !== 'shape' && type !== 'externalGlyph') {
          result.errors.push(`"${code}": unknown type "${type}". Use 'glyph', 'shape', or 'externalGlyph'.`);
          continue;
        }

        if (type === 'glyph') {
          BlissSVGBuilder.#defineGlyph(code, definition, options);
        } else if (type === 'shape') {
          BlissSVGBuilder.#defineShape(code, definition, options);
        } else if (type === 'externalGlyph') {
          BlissSVGBuilder.#defineExternalGlyph(code, definition, options);
        } else if (typeof definition?.getPath === 'function' && typeof definition?.char === 'string') {
          BlissSVGBuilder.#defineExternalGlyph(code, definition, options);
        } else if (typeof definition?.getPath === 'function') {
          BlissSVGBuilder.#defineShape(code, definition, options);
        } else if (typeof definition?.codeString === 'string') {
          BlissSVGBuilder.#defineBare(code, definition, options);
        } else {
          result.errors.push(`"${code}": unable to detect definition type. Provide codeString, type+getPath+width+height (shape), or type+getPath+char (externalGlyph).`);
          continue;
        }
        result.defined.push(code);
      } catch (err) {
        if (err.message.includes('already exists')) {
          result.skipped.push(code);
        } else {
          result.errors.push(`"${code}": ${err.message}`);
        }
      }
    }

    return result;
  }

  /**
   * Check if a code is defined.
   * @param {string} code
   * @returns {boolean}
   */
  static isDefined(code) {
    return code in blissElementDefinitions;
  }

  /**
   * Get definition metadata for a code (frozen copy, not the live object).
   *
   * @param {string} code
   * @returns {Object|null} Frozen metadata object, or null if not found
   */
  static getDefinition(code) {
    const def = blissElementDefinitions[code];
    if (!def) return null;

    const copy = {};
    for (const [key, value] of Object.entries(def)) {
      if (typeof value === 'object' && value !== null) {
        copy[key] = Object.freeze({ ...value });
      } else {
        copy[key] = value;
      }
    }

    copy.type = BlissSVGBuilder.#detectType(def);

    copy.isBuiltIn = builtInCodes.has(code);

    return Object.freeze(copy);
  }

  /**
   * List all defined codes, optionally filtered by type.
   *
   * @param {Object} [filter]
   * @param {'shape'|'glyph'|'externalGlyph'|'bare'|'space'} [filter.type]
   * @returns {string[]}
   */
  static listDefinitions(filter = {}) {
    const codes = Object.keys(blissElementDefinitions);

    if (!filter.type) return codes;

    return codes.filter(code => {
      return BlissSVGBuilder.#detectType(blissElementDefinitions[code]) === filter.type;
    });
  }

  /**
   * Remove a custom definition. Built-in definitions cannot be removed.
   *
   * @param {string} code
   * @returns {boolean} true if removed
   * @throws {Error} If attempting to remove a built-in definition
   */
  static removeDefinition(code) {
    if (builtInCodes.has(code)) {
      throw new Error(`removeDefinition("${code}"): cannot remove built-in definitions.`);
    }
    if (!(code in blissElementDefinitions)) {
      return false;
    }
    delete blissElementDefinitions[code];
    return true;
  }

  /**
   * Patch one or more properties on an existing custom definition.
   * Only allowed keys for the definition's type are accepted.
   * Built-in definitions cannot be patched.
   *
   * @param {string} code - The code to patch
   * @param {Object} changes - Properties to update
   * @returns {{ patched: true }}
   * @throws {Error} If code is not defined, is built-in, or changes are invalid
   */
  static patchDefinition(code, changes) {
    if (!(code in blissElementDefinitions)) {
      throw new Error(`patchDefinition("${code}"): code is not defined.`);
    }
    if (builtInCodes.has(code)) {
      throw new Error(`patchDefinition("${code}"): cannot patch built-in definitions.`);
    }
    if (!changes || typeof changes !== 'object') {
      throw new Error(`patchDefinition("${code}"): changes must be an object.`);
    }

    const def = blissElementDefinitions[code];

    const type = BlissSVGBuilder.#detectType(def);

    // Reject type changes and internal flags
    const internalKeys = new Set(['type', 'isShape', 'isExternalGlyph', 'isBlissGlyph', 'glyphCode', 'isBuiltIn']);
    for (const key of Object.keys(changes)) {
      if (internalKeys.has(key)) {
        throw new Error(`patchDefinition("${code}"): cannot change "${key}" via patch.`);
      }
    }

    // Allowed keys per type
    const allowedByType = {
      glyph: ['codeString', 'anchorOffsetX', 'anchorOffsetY', 'width', 'isIndicator', 'shrinksPrecedingWordSpace', 'kerningRules', 'defaultOptions'],
      shape: ['getPath', 'codeString', 'width', 'height', 'x', 'y', 'extraPathOptions', 'defaultOptions'],
      externalGlyph: ['getPath', 'width', 'char', 'y', 'height', 'kerningRules', 'defaultOptions'],
      bare: ['codeString', 'defaultOptions'],
      space: ['defaultOptions']
    };

    const allowed = new Set(allowedByType[type] || []);
    for (const key of Object.keys(changes)) {
      if (!allowed.has(key)) {
        throw new Error(`patchDefinition("${code}"): "${key}" is not a valid property for type "${type}".`);
      }
    }

    // Validate getPath is a function if provided
    if ('getPath' in changes && typeof changes.getPath !== 'function') {
      throw new Error(`patchDefinition("${code}"): "getPath" must be a function.`);
    }

    // If codeString is being patched, validate references and circular refs
    if ('codeString' in changes) {
      const newCodeString = changes.codeString;
      if (typeof newCodeString !== 'string' || newCodeString.length === 0) {
        throw new Error(`patchDefinition("${code}"): "codeString" must be a non-empty string.`);
      }
      // A `;;` word-level indicator is a use-site construct (WORD;;INDICATOR);
      // NO definition of any type may bake one in, so this guard is universal.
      // A `/` word separator is glyph/shape-only (a bare alias may itself be a
      // word). Mirror the #defineGlyph/#defineShape/#defineBare guards so
      // patchDefinition cannot construct a state define() forbids. (Strict
      // Indicator Separation.)
      if (newCodeString.includes(';;')) {
        throw new Error(`patchDefinition("${code}"): a definition cannot contain a word-level indicator (";;"); apply a word indicator at the use site (WORD;;INDICATOR).`);
      }
      if ((type === 'glyph' || type === 'shape') && newCodeString.includes('/')) {
        throw new Error(`patchDefinition("${code}"): a ${type} definition cannot be a multi-character word (its codeString contains "/"). Define a word as a bare alias (omit type:"${type}").`);
      }
      const allowedRefTypes = type === 'glyph' ? ['glyph', 'shape']
        : type === 'shape' ? ['shape']
        : ['glyph', 'shape', 'bare', 'externalGlyph'];
      const refError = BlissSVGBuilder.#validateReferences(code, newCodeString, allowedRefTypes);
      if (refError) throw new Error(`patchDefinition(${refError})`);
      if (BlissSVGBuilder.#hasCircularReference(code, newCodeString)) {
        throw new Error(`patchDefinition("${code}"): circular reference detected`);
      }
      // Part-merge operand rule, mirroring #defineBare so both definition
      // surfaces agree: a bare codeString cannot use a composed unflagged alias
      // as a ;-part (checked on the raw codeString, before bare-alias resolution).
      if (type === 'bare' && BlissSVGBuilder.#hasCompositePartViolation(newCodeString)) {
        throw new Error(`patchDefinition("${code}"): a ; part cannot be a composition ("${newCodeString}"). A ; part must be a primitive or a flagged glyph; attach indicators at the use site (BASE;INDICATOR) or compose words with /.`);
      }
    }

    // For bare definitions, resolve chained aliases in codeString
    if ('codeString' in changes && type === 'bare') {
      changes = { ...changes, codeString: BlissSVGBuilder.#resolveBareAliases(changes.codeString) };
    }

    // Validate BEFORE the apply loop, like every other patch guard: a
    // rejected patch must leave the definition fully unchanged, not partially
    // mutated depending on property order (round-3 review F2). The snapshot
    // taken here REPLACES the caller's object in `changes`, so the apply loop
    // stores exactly what was validated — an accessor / Proxy cannot show
    // different keys to the two reads (round-4 review F1).
    if (changes.defaultOptions && typeof changes.defaultOptions === 'object') {
      const defaultOptionsSnapshot = { ...changes.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertNoGlobalOnlyDefaultOptions('patchDefinition', code, defaultOptionsSnapshot);
      }
      changes = { ...changes, defaultOptions: defaultOptionsSnapshot };
    }

    // Apply changes
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'defaultOptions') {
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          def.defaultOptions = { ...value };
        } else {
          delete def.defaultOptions;
        }
      } else if (key === 'kerningRules') {
        if (value && typeof value === 'object') {
          def.kerningRules = { ...value };
        } else {
          delete def.kerningRules;
        }
      } else {
        def[key] = value;
      }
    }

    return { patched: true };
  }

  get #svgCode() {
    // Computed rendering dimensions
    const width = Math.max(this.composition.width, this.#processedOptions.minWidth ?? 0);
    const height = 20;

    // User-provided options with defaults
    const color = this.#processedOptions.color ?? "#000000";
    const strokeWidth = this.#processedOptions.strokeWidth ?? 0.5;
    const marginTop = this.#processedOptions.marginTop ?? 0.75;
    const marginBottom = this.#processedOptions.marginBottom ?? 0.75;
    const marginLeft = this.#processedOptions.marginLeft ?? 0.75;
    const marginRight = this.#processedOptions.marginRight ?? 0.75;

    // Compute crop values - can be numeric or 'auto' (computed from effectiveBounds)
    const bounds = this.composition.effectiveBounds;
    const rawCropLeft = this.#processedOptions.cropLeft ?? 0;
    const rawCropRight = this.#processedOptions.cropRight ?? 0;

    // Compact mode: crop up to 4 units total, preferring top then bottom,
    // limited by actual empty space (never crop into ink).
    // Explicit crop-top/crop-bottom override (not add to) the compact defaults.
    let rawCropTop, rawCropBottom;
    if (this.#processedOptions.cropCompact) {
      const topRoom = bounds.minY;
      const bottomRoom = height - bounds.maxY;
      const compactTop = Math.min(4, topRoom);
      const compactBottom = Math.min(4 - compactTop, bottomRoom);
      rawCropTop = this.#processedOptions.cropTop ?? compactTop;
      rawCropBottom = this.#processedOptions.cropBottom ?? compactBottom;
    } else if (this.#processedOptions.autoVertical) {
      rawCropTop = this.#processedOptions.cropTop ?? 'auto';
      rawCropBottom = this.#processedOptions.cropBottom ?? 'auto';
    } else {
      rawCropTop = this.#processedOptions.cropTop ?? 0;
      rawCropBottom = this.#processedOptions.cropBottom ?? 0;
    }

    const cropTop = rawCropTop === 'auto' ? bounds.minY : rawCropTop;
    const cropBottom = rawCropBottom === 'auto' ? (height - bounds.maxY) : rawCropBottom;
    let cropLeft = rawCropLeft === 'auto' ? bounds.minX : rawCropLeft;
    let cropRight = rawCropRight === 'auto' ? (width - bounds.maxX) : rawCropRight;

    // Ensure min-width is respected after auto horizontal cropping.
    // Numeric crops are deliberate, so only limit auto-computed crops.
    const minW = this.#processedOptions.minWidth ?? 0;
    if (minW > 0 && (rawCropLeft === 'auto' || rawCropRight === 'auto')) {
      const croppedWidth = width - cropLeft - cropRight;
      if (croppedWidth < minW) {
        const deficit = minW - croppedWidth;
        const autoLeft = rawCropLeft === 'auto' ? cropLeft : 0;
        const autoRight = rawCropRight === 'auto' ? cropRight : 0;
        const autoTotal = autoLeft + autoRight;
        if (autoTotal > 0) {
          const reduce = Math.min(deficit, autoTotal);
          if (rawCropLeft === 'auto') cropLeft -= reduce * (autoLeft / autoTotal);
          if (rawCropRight === 'auto') cropRight -= reduce * (autoRight / autoTotal);
        }
      }
    }

    let viewBoxX = -marginLeft + cropLeft;
    const viewBoxY = -marginTop + cropTop;
    let gridOffsetX = 0;

    if (this.#processedOptions.center === true && width > this.composition.width) {
      const leftOverhang = -this.composition.x;
      const rightOverhang = (this.composition.x + this.composition.width) - this.composition.baseWidth;
      const maxOverhang = Math.max(leftOverhang, rightOverhang);
      const symmetricWidth = this.composition.baseWidth + 2 * maxOverhang;
      const extraSpace = width - symmetricWidth;
      const offset = extraSpace / 2;
      viewBoxX -= offset;
      gridOffsetX = viewBoxX + marginLeft;
    }
    const content = this.svgContent;
    const viewBoxWidth = width + marginLeft + marginRight - cropLeft - cropRight;
    const viewBoxHeight = height + marginTop + marginBottom - cropTop - cropBottom;
    const svgAttributeMultiplier = 6;

    // Calculate SVG element dimensions (maintaining aspect ratio)
    let svgWidth, svgHeight;
    if (this.#processedOptions.svgHeight !== undefined) {
      // Height specified: calculate width to maintain aspect ratio
      svgHeight = this.#processedOptions.svgHeight;
      svgWidth = (viewBoxWidth / viewBoxHeight) * svgHeight;
    } else {
      // Auto-calculate both dimensions
      svgWidth = svgAttributeMultiplier * viewBoxWidth;
      svgHeight = svgAttributeMultiplier * viewBoxHeight;
    }

    const round = (num) => parseFloat(num.toFixed(4));

    const svgTitle = this.#processedOptions.svgTitle ?? "";
    const svgDesc = this.#processedOptions.svgDesc ?? "";
    const background = this.#processedOptions.background ?? "";
    const backgroundTop = this.#processedOptions.backgroundTop;
    const backgroundMid = this.#processedOptions.backgroundMid;
    const backgroundBottom = this.#processedOptions.backgroundBottom;
    const hasZones = backgroundTop || backgroundMid || backgroundBottom;

    let title = svgTitle ? `  <title>${svgTitle}</title>` : "";
    let desc = svgDesc ? `  <desc>${svgDesc}</desc>` : "";
    let gridPath = "";
    let svgText = "";

    let backgroundContent;
    if (hasZones) {
      const bulkBg = background;
      const topColor = backgroundTop || bulkBg;
      const midColor = backgroundMid || bulkBg;
      const bottomColor = backgroundBottom || bulkBg;
      const zoneX = round(viewBoxX);
      const zoneWidth = round(viewBoxWidth);
      const topY = round(viewBoxY);
      const topHeight = round(8 - viewBoxY);
      const bottomHeight = round(viewBoxY + viewBoxHeight - 16);

      const zoneRects = [
        topColor ? `    <rect class="bliss-background--top" x="${zoneX}" y="${topY}" width="${zoneWidth}" height="${topHeight}" stroke="none" fill="${topColor}"/>` : '',
        midColor ? `    <rect class="bliss-background--mid" x="${zoneX}" y="8" width="${zoneWidth}" height="8" stroke="none" fill="${midColor}"/>` : '',
        bottomColor ? `    <rect class="bliss-background--bottom" x="${zoneX}" y="16" width="${zoneWidth}" height="${bottomHeight}" stroke="none" fill="${bottomColor}"/>` : '',
      ].filter(Boolean).join('\n');

      backgroundContent = `  <g class="bliss-background">\n${zoneRects}\n  </g>`;
    } else {
      backgroundContent = background === "" ? "" : `  <rect class="bliss-background" x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${background}"/>`;
    }

    // Grid boundaries adjusted for cropping
    const gridStartX = gridOffsetX + cropLeft;
    const gridLineWidth = width - cropLeft - cropRight;
    const gridMinY = cropTop;
    const gridMaxY = height - cropBottom;

    const hLine = (y) => `M${gridStartX},${y}h${gridLineWidth}`;
    const hLines = (ys) => ys.filter(y => y >= gridMinY && y <= gridMaxY).map(hLine).join('');

    let getVerticalLines = (type) => {
      let pathData = "";
      let xs = [];

      switch(type) {
        case "minor":
          //odd numbers
          for (let x = 1; x <= width; x += 2) xs.push(x);
          break;
        case "medium":
          //even numbers not divisible with 4
          for (let x = 2; x <= width; x += 4) xs.push(x);
          break;
        case "major":
          //even numbers divisible with 4
          for (let x = 0; x <= width; x += 4) xs.push(x);
          break;
      }
      for (const x of xs.filter(x => x >= cropLeft && x <= width - cropRight)) {
        pathData += `M${gridOffsetX + x},${gridMinY}V${gridMaxY}`;
      }
      return pathData;
    }
    if (this.#processedOptions.grid) {
      const gridMinorStrokeWidth = this.#processedOptions.gridMinorStrokeWidth ?? 0.166;
      const gridMinorColor = this.#processedOptions.gridMinorColor ?? "#ebebeb";
      const gridMediumStrokeWidth = this.#processedOptions.gridMediumStrokeWidth ?? 0.166;
      const gridMediumColor = this.#processedOptions.gridMediumColor ?? "#ebebeb";
      const gridMajorStrokeWidth = this.#processedOptions.gridMajorStrokeWidth ?? 0.166;
      const gridMajorColor = this.#processedOptions.gridMajorColor ?? "#c7c7c7";
      const gridSkyStrokeWidth = this.#processedOptions.gridSkyStrokeWidth ?? 0.166;
      const gridSkyColor = this.#processedOptions.gridSkyColor ?? "#858585";
      const gridEarthStrokeWidth = this.#processedOptions.gridEarthStrokeWidth ?? 0.166;
      const gridEarthColor = this.#processedOptions.gridEarthColor ?? "#858585";

      const minorD = hLines([1,3,5,7,9,11,13,15,17,19]) + getVerticalLines("minor");
      const mediumD = hLines([2,6,10,14,18]) + getVerticalLines("medium");
      const majorD = hLines([0,4,12,20]) + getVerticalLines("major");
      const skyD = 8 >= gridMinY && 8 <= gridMaxY ? hLine(8) : '';
      const earthD = 16 >= gridMinY && 16 <= gridMaxY ? hLine(16) : '';

      const gridLines = [
        minorD ? `    <path class="bliss-grid-line bliss-grid-line--minor" stroke-width="${gridMinorStrokeWidth}" stroke="${gridMinorColor}" stroke-linecap="square" stroke-linejoin="miter" d="${minorD}"/>` : '',
        mediumD ? `    <path class="bliss-grid-line bliss-grid-line--medium" stroke-width="${gridMediumStrokeWidth}" stroke="${gridMediumColor}" stroke-linecap="square" stroke-linejoin="miter" d="${mediumD}"/>` : '',
        majorD ? `    <path class="bliss-grid-line bliss-grid-line--major" stroke-width="${gridMajorStrokeWidth}" stroke="${gridMajorColor}" stroke-linecap="square" stroke-linejoin="miter" d="${majorD}"/>` : '',
        skyD ? `    <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="${gridSkyStrokeWidth}" stroke="${gridSkyColor}" stroke-linecap="square" stroke-linejoin="miter" d="${skyD}"/>` : '',
        earthD ? `    <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="${gridEarthStrokeWidth}" stroke="${gridEarthColor}" stroke-linecap="square" stroke-linejoin="miter" d="${earthD}"/>` : '',
      ].filter(Boolean).join('\n');

      gridPath = [
        '  <style>',
        '    @supports (-webkit-hyphens: none) {',
        '      .bliss-grid-line { shape-rendering: geometricPrecision; }',
        '    }',
        '  </style>',
        '  <g class="bliss-grid" shape-rendering="crispEdges">',
        gridLines,
        '  </g>',
      ].join('\n');
    }

    // Build content group attributes: defaults + all global SVG attributes
    const contentDefaults = {
      fill: 'none',
      stroke: color,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'stroke-width': strokeWidth,
    };
    const contentAttrs = { ...contentDefaults, ...this.globalSvgAttributes };
    // A global `class` option merges with the structural bliss-content class
    // instead of emitting a second class attribute (invalid SVG; issue #28).
    const userClass = contentAttrs['class'];
    delete contentAttrs['class'];
    const contentClass = userClass ? `bliss-content ${userClass}` : 'bliss-content';
    // vector-effect is non-inherited; relocate it from the content group onto
    // the glyph paths so it actually takes effect. Always remove it from the
    // group (even an empty value, which would otherwise be a dead attribute on
    // the <g>); only stamp the paths when there is a value, matching the
    // element-scope handling in BlissElement.
    let contentInner = content;
    if ('vector-effect' in contentAttrs) {
      const vectorEffect = contentAttrs['vector-effect'];
      delete contentAttrs['vector-effect'];
      if (vectorEffect) contentInner = BlissElement.applyVectorEffectToPaths(content, vectorEffect);
    }
    const contentAttrsStr = Object.entries(contentAttrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const generator = LIB_VERSION ? `bliss-svg-builder/${LIB_VERSION}` : 'bliss-svg-builder';

    let svgStr = [
      `<svg xmlns="http://www.w3.org/2000/svg" data-generator="${generator}" width="${round(svgWidth)}" height="${round(svgHeight)}" viewBox="${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}">`,
      title,
      desc,
      backgroundContent,
      gridPath,
      `  <g class="${contentClass}" ${contentAttrsStr}>`,
      `    ${contentInner}`,
      '  </g>',
      svgText,
      '</svg>',
    ].filter(Boolean).join('\n');

    // Clean up empty <path d=""/> elements from DOT/COMMA/external glyphs
    svgStr = svgStr.replace(/<path d=""\/>/g, '');

    return svgStr;
  }
}

export { BlissSVGBuilder };
