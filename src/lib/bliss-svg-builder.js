/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";
import { INTERNAL_OPTIONS, KNOWN_OPTION_KEYS, escapeHtml, isSafeAttributeName, camelToKebab, generateKey, LIB_VERSION } from "./bliss-constants.js";
import { ElementHandle } from "./element-handle.js";

// Pre-parsed error placeholder (REFSQUARE + question mark). Parsed once at module
// load so BlissElement can clone it without importing BlissParser itself.
const ERROR_PLACEHOLDER_PARTS = BlissParser.parse('REFSQUARE;B699:3').groups[0].glyphs[0].parts;

class BlissSVGBuilder {
  #processedOptions;
  #sharedOptions;
  #mutationCtx;
  #warnings = [];
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
    if (rawOptions.center === '1') {
      options.center = true;
    }
    if (rawOptions.grid === '1') {
      options.grid = true;
    }
    if (rawOptions['error-placeholder'] === '1') {
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
    const { defaults, overrides } = options ?? {};

    if (typeof input !== 'string' && (typeof input !== 'object' || input === null || Array.isArray(input))) {
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
      for (const group of blissObj.groups) {
        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            if (glyph.codeName && !glyph.glyphCode) {
              glyph.glyphCode = glyph.codeName;
              delete glyph.codeName;
            }
            // Parts already use codeName internally, no restore needed
          }
        }
      }
    }

    // Merge: defaults (lowest) < string options (middle) < overrides (highest)
    if (defaults || overrides) {
      const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults) : {};
      const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides) : {};
      blissObj.options = { ...rawDefaults, ...(blissObj.options ?? {}), ...rawOverrides };
    }

    // Decompose word-as-part references (e.g. H;TW where TW = B291/B291)
    // into properly positioned sub-parts using the layout engine.
    // Uses quick-extracted spacing options since full #sharedOptions aren't ready yet.
    BlissSVGBuilder.#decomposeWordParts(blissObj, (code) => {
      const rawOpts = blissObj.options ?? {};
      const quickSharedOptions = {
        charSpace: rawOpts['char-space'] !== undefined ? Math.max(0, Math.min(10, Number(rawOpts['char-space']))) : 2,
        wordSpace: rawOpts['word-space'] !== undefined ? Math.max(0, Math.min(20, Number(rawOpts['word-space']))) : 8,
        externalGlyphSpace: rawOpts['external-glyph-space'] !== undefined ? Math.max(0, Math.min(3, Number(rawOpts['external-glyph-space']))) : 0.8,
        warnings: [],
        errorPlaceholder: false,
        errorPlaceholderParts: ERROR_PLACEHOLDER_PARTS,
        keys: new Set(),
      };
      const parsed = BlissParser.parse(code);
      return new BlissElement(parsed, { sharedOptions: quickSharedOptions }).snapshot();
    });

    // Store a clean copy after option merging but before processing mutates it
    this.#rawBlissObj = structuredClone(blissObj);

    this.#rebuild();

    this.#mutationCtx = {
      getRaw: () => this.#rawBlissObj,
      rebuild: () => this.#rebuild(),
      parse: (code) => {
        const parsed = BlissParser.parse(code);
        BlissSVGBuilder.#decomposeWordParts(parsed, (c) => {
          const p = BlissParser.parse(c);
          return new BlissElement(p, { sharedOptions: this.#sharedOptions }).snapshot();
        });
        return parsed;
      },
      toRaw: (obj) => BlissSVGBuilder.#toRaw(obj),
      isRawSpaceGroup: (g) => BlissSVGBuilder.#isRawSpaceGroup(g),
      makeSpaceGroup: () => BlissSVGBuilder.#makeSpaceGroup(),
      removeGlyphGroup: (obj, gi) => this.#removeGlyphGroup(obj, gi),
      getSnapshot: () => this.snapshot(),
      getGeneration: () => this.#generation,
      // Build a temporary element tree for layout computation (word-as-part decomposition)
      computeLayout: (code) => {
        const parsed = BlissParser.parse(code);
        const tempElement = new BlissElement(parsed, { sharedOptions: this.#sharedOptions });
        return tempElement.snapshot();
      },
    };
  }

  static #toRaw(obj) {
    const raw = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      const kebabKey = camelToKebab(key);
      if (typeof value === 'boolean') {
        raw[kebabKey] = value ? '1' : '0';
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
    this.#wordsCache = undefined;
    this.#warnings = [];

    BlissSVGBuilder.#assignKeys(this.#rawBlissObj);
    const blissObj = structuredClone(this.#rawBlissObj);
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
   * Returns warnings generated during parsing/rendering.
   * Each warning has { code, message, source } describing the issue.
   * @returns {Array<{ code: string, message: string, source: string }>}
   */
  get warnings() {
    return this.#warnings;
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
      if (BlissSVGBuilder.#isRawSpaceGroup(rawGroup)) continue;

      if (groupSnap.key === key) {
        return new ElementHandle(this.#mutationCtx, 'group', rawGroup);
      }

      const glyphs = groupSnap.children.filter(c => c.type === 'glyph');
      for (let gi = 0; gi < glyphs.length; gi++) {
        const rawGlyph = rawGroup.glyphs[gi];
        if (glyphs[gi].key === key) {
          return new ElementHandle(this.#mutationCtx, 'glyph', rawGlyph, rawGroup);
        }
        const parts = glyphs[gi].children;
        for (let pi = 0; pi < parts.length; pi++) {
          if (parts[pi].key === key) {
            return new ElementHandle(this.#mutationCtx, 'part', rawGlyph.parts[pi], { group: rawGroup, glyph: rawGlyph });
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
    if (index < 0) return null;
    const indices = this.#getNonSpaceGroupIndices();
    if (index >= indices.length) return null;
    const rawGroup = this.#rawBlissObj.groups[indices[index]];
    return new ElementHandle(this.#mutationCtx, 'group', rawGroup);
  }

  /**
   * Returns a live ElementHandle for the glyph at the given flat index across all groups.
   * @param {number} flatIndex
   * @returns {ElementHandle|null}
   */
  glyph(flatIndex) {
    if (flatIndex < 0) return null;
    const indices = this.#getNonSpaceGroupIndices();
    let count = 0;
    for (const gi of indices) {
      const group = this.#rawBlissObj.groups[gi];
      const glyphs = group.glyphs || [];
      if (flatIndex < count + glyphs.length) {
        return new ElementHandle(this.#mutationCtx, 'glyph', glyphs[flatIndex - count], group);
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
    if (flatIndex < 0) return null;
    const indices = this.#getNonSpaceGroupIndices();
    let count = 0;
    for (const gi of indices) {
      const group = this.#rawBlissObj.groups[gi];
      const glyphs = group.glyphs || [];
      for (const glyph of glyphs) {
        const parts = glyph.parts || [];
        if (flatIndex < count + parts.length) {
          return new ElementHandle(this.#mutationCtx, 'part', parts[flatIndex - count], { group, glyph });
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
   * @param {{ defaults?, overrides? }} [opts]
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
   * @param {{ defaults?, overrides? }} [opts]
   * @returns {this}
   */
  insertGroup(index, code, opts) {
    const parsed = BlissParser.parse(code);
    const newGroup = parsed.groups?.[0];
    if (!newGroup) return this;
    if (opts) {
      const { defaults, overrides } = opts;
      if (defaults || overrides) {
        const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults) : {};
        const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides) : {};
        newGroup.options = { ...rawDefaults, ...(newGroup.options ?? {}), ...rawOverrides };
      }
    }
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
      groups.splice(rawIndex, 0, BlissSVGBuilder.#makeSpaceGroup(), newGroup);
    }

    this.#rebuild();
    return this;
  }

  /**
   * Appends a glyph to the last non-space group (creates one if empty).
   * @param {string} code - DSL code string
   * @param {{ defaults?, overrides? }} [opts]
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
    const handle = new ElementHandle(this.#mutationCtx, 'group', rawGroup);
    handle.addGlyph(code, opts);
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

  #wordsCache;

  /**
   * Returns non-space group snapshots (words only, no space groups).
   * Cached and frozen.
   *
   * @returns {ElementSnapshot[]}
   */
  get words() {
    if (!this.#wordsCache) {
      const groups = this.elements.children.filter(g =>
        g.type === 'group' && g.children.some(c => c.codeName !== '')
      );
      this.#wordsCache = Object.freeze(groups);
    }
    return this.#wordsCache;
  }

  /**
   * Returns group and glyph counts.
   *
   * @returns {{ wordCount: number, characterCount: number }}
   */
  get stats() {
    const indices = this.#getNonSpaceGroupIndices();
    let glyphCount = 0;
    for (const gi of indices) {
      glyphCount += (this.#rawBlissObj.groups[gi].glyphs || []).length;
    }
    return {
      groupCount: indices.length, glyphCount,
      wordCount: indices.length, characterCount: glyphCount // deprecated aliases
    };
  }

  // --- Manipulation helpers ---

  // --- Word-as-part decomposition ---
  // When a word definition (codeString with /) appears at the part level,
  // the parser keeps it as a single codeName. This post-parse step resolves
  // those references into properly positioned parts using the layout engine.

  /**
   * Walk a raw parsed structure and decompose any word-as-part references.
   * @param {Object} rawObj - Raw parsed blissObj with groups/glyphs/parts
   * @param {Function} computeLayout - (code) => snapshot for position calculation
   */
  static #decomposeWordParts(rawObj, computeLayout) {
    if (!rawObj.groups) return;
    for (const group of rawObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        glyph.parts = BlissSVGBuilder.#decomposePartsArray(glyph.parts, computeLayout);
      }
    }
  }

  /**
   * Process a parts array, decomposing any word-definition parts into
   * properly positioned sub-parts. Recurses into nested parts.
   */
  static #decomposePartsArray(parts, computeLayout) {
    const result = [];
    for (const part of parts) {
      const def = blissElementDefinitions[part.codeName];
      if (def?.codeString?.includes('/')) {
        result.push(...BlissSVGBuilder.#decomposeWordPart(part, def, computeLayout));
      } else {
        if (part.parts) {
          part.parts = BlissSVGBuilder.#decomposePartsArray(part.parts, computeLayout);
        }
        result.push(part);
      }
    }
    return result;
  }

  /**
   * Decompose a single word-definition part into positioned sub-parts.
   * Each glyph in the word becomes one part at the glyph code level (e.g. B291),
   * with position offsets from the layout engine. Internal expansion of each
   * glyph code happens naturally through parseParts.
   */
  static #decomposeWordPart(part, definition, computeLayout) {
    const code = definition.codeString;

    // Get layout positions via temporary element tree
    const snapshot = computeLayout(code);
    const groupSnap = snapshot.children[0];
    if (!groupSnap) return [part]; // fallback

    const snapGlyphs = groupSnap.children.filter(c => c.type === 'glyph');

    // Position offset from the original part (e.g. TW:2,3 → offset all sub-parts)
    const offsetX = part.x ?? 0;
    const offsetY = part.y ?? 0;

    const decomposed = [];
    for (let gi = 0; gi < snapGlyphs.length; gi++) {
      const glyphSnap = snapGlyphs[gi];
      const glyphX = (glyphSnap?.x ?? 0) + offsetX;
      const glyphY = (glyphSnap?.y ?? 0) + offsetY;

      // Get the glyph's code name from the snapshot
      const glyphCode = glyphSnap.codeName;
      if (!glyphCode) continue;

      // Build position suffix
      const posStr = (glyphX !== 0 || glyphY !== 0) ? `:${glyphX},${glyphY}` : '';

      // Parse as a proper part via helper glyph — this gives full parseParts expansion
      const helperParsed = BlissParser.parse(`H;${glyphCode}${posStr}`);
      const helperGlyph = helperParsed.groups?.[0]?.glyphs?.[0];
      if (helperGlyph?.parts?.length >= 2) {
        const newPart = helperGlyph.parts[1];

        // Propagate options from the original part
        if (part.options && Object.keys(part.options).length > 0) {
          newPart.options = { ...part.options, ...(newPart.options ?? {}) };
        }

        decomposed.push(newPart);
      }
    }

    return decomposed.length > 0 ? decomposed : [part];
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
   * @returns {string}
   */
  toString(options = {}) {
    // toString always needs nested parts so serializeParts can decompose
    // custom codes. The string output itself stays flat (;-delimited).
    const obj = this.toJSON({ preserve: options.preserve, deep: true });

    // Serialize a part with ; delimiter and :x,y positions.
    // Recursively decomposes custom shapes and glyphs unless preserve is set.
    function serializeParts(parts, offsetX = 0, offsetY = 0) {
      return parts.map(part => {
        const x = (part.x ?? 0) + offsetX;
        const y = (part.y ?? 0) + offsetY;
        if (!options.preserve && part.codeName && !builtInCodes.has(part.codeName)) {
          // Custom code with nested parts (e.g., positioned custom glyph)
          if (part.parts) {
            return serializeParts(part.parts, x, y);
          }
          // Custom composite shape (has codeString, no getPath)
          const def = blissElementDefinitions[part.codeName];
          if (def?.isShape && def.codeString && !def.getPath) {
            return BlissSVGBuilder.#decomposeCodeString(def.codeString, x, y);
          }
        }
        let str = part.codeName;
        if (x !== 0 || y !== 0) {
          str += `:${x},${y}`;
        }
        return str;
      }).join(';');
    }

    // Serialize a glyph: B-codes emit their code, compositions emit parts.
    // Custom glyphs are decomposed to their codeString unless preserve is set.
    function serializeGlyph(glyph) {
      if (glyph.isBlissGlyph && glyph.codeName) {
        // Decompose custom glyphs (non-built-in) to portable output
        // Use the glyph's parts (which have correct positions) rather than
        // re-decomposing from the definition (which would lose position offsets)
        if (!options.preserve && !builtInCodes.has(glyph.codeName)) {
          if (glyph.parts) {
            return serializeParts(glyph.parts);
          }
          const def = blissElementDefinitions[glyph.codeName];
          if (def?.codeString) {
            return BlissSVGBuilder.#decomposeCodeString(def.codeString, 0, 0);
          }
        }
        return glyph.codeName;
      }
      if (glyph.parts) {
        return serializeParts(glyph.parts);
      }
      return glyph.codeName || '';
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
      const glyphStrs = group.glyphs.map(serializeGlyph).filter(Boolean);
      segments.push(glyphStrs.join('/'));
    }
    // Join: slash-only segments already include separators, others need /
    return segments.reduce((acc, seg) => {
      if (acc === '') return seg;
      if (seg.startsWith('/')) return acc + seg;
      if (acc.endsWith('/')) return acc + seg;
      return acc + '/' + seg;
    }, '');
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
   * @returns {Object} Plain object with groups/glyphs/options structure
   */
  toJSON(options = {}) {
    const obj = structuredClone(this.#rawBlissObj);

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
          if (part.options) delete part.options.key;
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
        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            delete glyph.key;
            if (glyph.options) delete glyph.options.key;
            if (glyph.parts) stripParts(glyph.parts);

            // Normalize glyphCode → codeName for public API
            if (glyph.glyphCode) {
              // Decompose custom glyphs to portable codes by default
              if (!options.preserve && !builtInCodes.has(glyph.glyphCode)) {
                const def = blissElementDefinitions[glyph.glyphCode];
                if (def?.codeString) {
                  // Resolve to the underlying built-in code (null for complex compositions)
                  const resolved = BlissSVGBuilder.#resolveToBuiltInCode(glyph.glyphCode);
                  if (resolved) glyph.codeName = resolved;
                } else {
                  glyph.codeName = glyph.glyphCode;
                }
              } else {
                glyph.codeName = glyph.glyphCode;
              }
              delete glyph.glyphCode;
            }
            // Parts already use codeName internally, no rename needed
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
    return `<path d="${content}"></path>`;
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
    return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n${this.#svgCode}`;
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

    if (definition.defaultOptions && typeof definition.defaultOptions === 'object'
        && Object.keys(definition.defaultOptions).length > 0) {
      entry.defaultOptions = { ...definition.defaultOptions };
    }

    blissElementDefinitions[code] = entry;
  }

  static #defineGlyph(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty string.`);
    }

    // Glyphs can reference other glyphs and shapes, but not external glyphs or bare aliases
    const refError = BlissSVGBuilder.#validateReferences(code, definition.codeString, ['glyph', 'shape']);
    if (refError) throw new Error(`define(${refError})`);
    if (BlissSVGBuilder.#hasCircularReference(code, definition.codeString)) {
      throw new Error(`define("${code}"): circular reference detected`);
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
    if (definition.defaultOptions && typeof definition.defaultOptions === 'object'
        && Object.keys(definition.defaultOptions).length > 0) {
      entry.defaultOptions = { ...definition.defaultOptions };
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
    if (typeof definition.glyph !== 'string' || definition.glyph.length === 0) {
      throw new Error(`define("${code}"): "glyph" must be a non-empty string.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const entry = {
      getPath: definition.getPath,
      width: definition.width,
      glyph: definition.glyph,
      isExternalGlyph: true
    };
    if (typeof definition.y === 'number') entry.y = definition.y;
    if (typeof definition.height === 'number') entry.height = definition.height;
    if (definition.kerningRules && typeof definition.kerningRules === 'object') {
      entry.kerningRules = { ...definition.kerningRules };
    }
    if (definition.defaultOptions && typeof definition.defaultOptions === 'object'
        && Object.keys(definition.defaultOptions).length > 0) {
      entry.defaultOptions = { ...definition.defaultOptions };
    }

    blissElementDefinitions[code] = entry;
  }

  // Resolve chained bare aliases in a codeString.
  // Replaces bare alias tokens with their resolved codeString, repeating
  // until no more aliases remain (up to depth 50).
  static #resolveBareAliases(codeString) {
    let resolved = codeString;
    for (let depth = 0; depth < 50; depth++) {
      let changed = false;
      resolved = resolved.replace(
        /(?<=^|[/;])([A-Za-z_][\w]*)(?=$|[/;:^])/g,
        (match, token) => {
          const def = blissElementDefinitions[token];
          if (def && def.codeString && !def.isBlissGlyph && !def.isShape && !def.isExternalGlyph && !def.glyphCode) {
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

  static #defineBare(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty string.`);
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

    if (definition.defaultOptions && typeof definition.defaultOptions === 'object'
        && Object.keys(definition.defaultOptions).length > 0) {
      entry.defaultOptions = { ...definition.defaultOptions };
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
        } else if (typeof definition?.getPath === 'function' && typeof definition?.glyph === 'string') {
          BlissSVGBuilder.#defineExternalGlyph(code, definition, options);
        } else if (typeof definition?.getPath === 'function') {
          BlissSVGBuilder.#defineShape(code, definition, options);
        } else if (typeof definition?.codeString === 'string') {
          BlissSVGBuilder.#defineBare(code, definition, options);
        } else {
          result.errors.push(`"${code}": unable to detect definition type. Provide codeString, type+getPath+width+height (shape), or type+getPath+glyph (externalGlyph).`);
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
      externalGlyph: ['getPath', 'width', 'glyph', 'y', 'height', 'kerningRules', 'defaultOptions'],
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
      const allowedRefTypes = type === 'glyph' ? ['glyph', 'shape']
        : type === 'shape' ? ['shape']
        : ['glyph', 'shape', 'bare', 'externalGlyph'];
      const refError = BlissSVGBuilder.#validateReferences(code, newCodeString, allowedRefTypes);
      if (refError) throw new Error(`patchDefinition(${refError})`);
      if (BlissSVGBuilder.#hasCircularReference(code, newCodeString)) {
        throw new Error(`patchDefinition("${code}"): circular reference detected`);
      }
    }

    // For bare definitions, resolve chained aliases in codeString
    if ('codeString' in changes && type === 'bare') {
      changes = { ...changes, codeString: BlissSVGBuilder.#resolveBareAliases(changes.codeString) };
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

    let title = svgTitle ? `<title>${svgTitle}</title>` : "";
    let desc = svgDesc ? `<desc>${svgDesc}</desc>` : "";
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
        topColor ? `<rect class="bliss-background--top" x="${zoneX}" y="${topY}" width="${zoneWidth}" height="${topHeight}" stroke="none" fill="${topColor}"/>` : '',
        midColor ? `<rect class="bliss-background--mid" x="${zoneX}" y="8" width="${zoneWidth}" height="8" stroke="none" fill="${midColor}"/>` : '',
        bottomColor ? `<rect class="bliss-background--bottom" x="${zoneX}" y="16" width="${zoneWidth}" height="${bottomHeight}" stroke="none" fill="${bottomColor}"/>` : '',
      ].filter(Boolean).join('\n  ');

      backgroundContent = `<g class="bliss-background">\n  ${zoneRects}\n</g>`;
    } else {
      backgroundContent = background === "" ? "" : `<rect class="bliss-background" x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${background}"/>`;
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
        minorD ? `  <path class="bliss-grid-line bliss-grid-line--minor" stroke-width="${gridMinorStrokeWidth}" stroke="${gridMinorColor}" stroke-linecap="square" stroke-linejoin="miter" d="${minorD}"/>` : '',
        mediumD ? `  <path class="bliss-grid-line bliss-grid-line--medium" stroke-width="${gridMediumStrokeWidth}" stroke="${gridMediumColor}" stroke-linecap="square" stroke-linejoin="miter" d="${mediumD}"/>` : '',
        majorD ? `  <path class="bliss-grid-line bliss-grid-line--major" stroke-width="${gridMajorStrokeWidth}" stroke="${gridMajorColor}" stroke-linecap="square" stroke-linejoin="miter" d="${majorD}"/>` : '',
        skyD ? `  <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="${gridSkyStrokeWidth}" stroke="${gridSkyColor}" stroke-linecap="square" stroke-linejoin="miter" d="${skyD}"/>` : '',
        earthD ? `  <path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--earth" stroke-width="${gridEarthStrokeWidth}" stroke="${gridEarthColor}" stroke-linecap="square" stroke-linejoin="miter" d="${earthD}"/>` : '',
      ].filter(Boolean).join('\n');

      gridPath =
  `<style>
  @supports (-webkit-hyphens: none) {
    .bliss-grid-line { shape-rendering: geometricPrecision; }
  }
</style>
<g class="bliss-grid" shape-rendering="crispEdges">
${gridLines}
</g>
  `;
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
    const contentAttrsStr = Object.entries(contentAttrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const generator = LIB_VERSION ? `bliss-svg-builder/${LIB_VERSION}` : 'bliss-svg-builder';

    let svgStr =
`<svg xmlns="http://www.w3.org/2000/svg" data-generator="${generator}" width="${round(svgWidth)}" height="${round(svgHeight)}" viewBox="${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}">
  ${title}${desc}${backgroundContent}${gridPath}<g class="bliss-content" ${contentAttrsStr}>${content}${svgText}</g>
</svg>`;

    // Clean up empty <path d=""></path> elements from DOT/COMMA/external glyphs
    svgStr = svgStr.replace(/<path d=""><\/path>/g, '');

    return svgStr;
  }
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { BlissSVGBuilder }; // CommonJS exports
}
export { BlissSVGBuilder }; // ES module export
