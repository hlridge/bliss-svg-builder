/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser } from "./bliss-parser.js";
import { INTERNAL_OPTIONS, KNOWN_OPTION_KEYS, escapeHtml, isSafeAttributeName, camelToKebab } from "./bliss-constants.js";

class BlissSVGBuilder {
  #processedOptions;

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

    // centered: Number, 0 (left-aligned) or 1 (centered, default)
    if ('centered' in rawOptions && !isNaN(rawOptions['centered'])) {
      const centered = Number(rawOptions['centered']);
      options.centered = (centered === 0) ? 0 : 1;
    }

    // freestyle: Boolean ("1" -> true, "0" -> false)
    // When true, uses actual composition height instead of fixed 20 units
    if ('freestyle' in rawOptions) {
      if (rawOptions.freestyle === "1") {
        options.freestyle = true;
      } else if (rawOptions.freestyle === "0") {
        options.freestyle = false;
      }
    }

    // grid: Boolean ("1" -> true, "0" -> false)
    if ('grid' in rawOptions) {
      if (rawOptions.grid === "1") {
        options.grid = true;
      } else if (rawOptions.grid === "0") {
        options.grid = false;
      }
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

    // Reverse toJSON() normalization: code → glyphCode (internal field name)
    if (typeof input !== 'string' && blissObj.groups) {
      for (const group of blissObj.groups) {
        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            if (glyph.code && !glyph.glyphCode) {
              glyph.glyphCode = glyph.code;
              delete glyph.code;
            }
          }
        }
      }
    }

    // Convert object options (camelCase, native types) to raw format (kebab-case, strings)
    const toRaw = (obj) => {
      const raw = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        const kebabKey = camelToKebab(key);
        if (typeof value === 'boolean') {
          raw[kebabKey] = value ? '1' : '0';
        } else {
          raw[kebabKey] = String(value);
        }
      }
      return raw;
    };

    // Merge: defaults (lowest) < string options (middle) < overrides (highest)
    if (defaults || overrides) {
      const rawDefaults = defaults ? toRaw(defaults) : {};
      const rawOverrides = overrides ? toRaw(overrides) : {};
      blissObj.options = { ...rawDefaults, ...(blissObj.options ?? {}), ...rawOverrides };
    }

    // Store a clean copy after option merging but before processing mutates it
    this.#rawBlissObj = structuredClone(blissObj);

    // Process options at all levels (global, group, glyph, part)
    // Only top level gets builder defaults (grid, margins, etc.)
    this.#processAllOptions(blissObj, true);

    const {
      charSpace,
      wordSpace,
      externalGlyphSpace,
      ...remainingOptions
    } = blissObj.options ?? {};

    const sharedOptions = {
      charSpace: charSpace ?? 2,
      wordSpace: wordSpace ?? 8,
      punctuationSpace: (wordSpace ?? 8) / 2,
      externalGlyphSpace: externalGlyphSpace ?? 0.8
    };

    blissObj.options = remainingOptions;

    // Store processed options privately for svgCode getter
    this.#processedOptions = blissObj.options;

    const attrMap = { 'color': 'stroke' };

    // Store global options that should become SVG attributes
    // Values are already escaped by #processOptions at the input boundary
    this.globalSvgAttributes = {};
    for (const [key, value] of Object.entries(blissObj.options ?? {})) {
      if (!INTERNAL_OPTIONS.has(key) && isSafeAttributeName(key)) {
        const attrName = attrMap[key] || key;
        this.globalSvgAttributes[attrName] = value;
      }
    }

    this.composition = new BlissElement(blissObj, { sharedOptions });
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
   * Look up an element snapshot by its ID.
   *
   * @param {string} id
   * @returns {ElementSnapshot|null}
   */
  getElementById(id) {
    let found = null;
    this.traverse(el => {
      if (el.id === id) { found = el; return false; }
    });
    return found;
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
   * @param {number} index - Word index (0-based)
   * @returns {ElementSnapshot|null}
   */
  getWord(index) {
    if (index < 0 || index >= this.words.length) return null;
    return this.words[index];
  }

  /**
   * @param {number} wordIndex - Word index (0-based)
   * @returns {ElementSnapshot[]}
   */
  getCharacters(wordIndex) {
    const word = this.getWord(wordIndex);
    if (!word) return [];
    return word.children.filter(c => c.type === 'glyph');
  }

  /**
   * @param {number} wordIndex
   * @param {number} charIndex
   * @returns {ElementSnapshot|null}
   */
  getCharacter(wordIndex, charIndex) {
    const chars = this.getCharacters(wordIndex);
    if (charIndex < 0 || charIndex >= chars.length) return null;
    return chars[charIndex];
  }

  /**
   * Returns the head glyph of a word (the semantically primary character).
   *
   * @param {number} wordIndex
   * @returns {ElementSnapshot|null}
   */
  getHeadGlyph(wordIndex) {
    const chars = this.getCharacters(wordIndex);
    return chars.find(c => c.isHeadGlyph) ?? null;
  }

  /**
   * Returns word and character counts.
   *
   * @returns {{ wordCount: number, characterCount: number }}
   */
  get stats() {
    const words = this.words;
    let characterCount = 0;
    for (const word of words) {
      characterCount += word.children.filter(c => c.type === 'glyph').length;
    }
    return { wordCount: words.length, characterCount };
  }

  // --- Manipulation helpers ---

  // Space codes used in space groups
  static #SPACE_CODES = new Set(['TSP', 'QSP', 'ZSA', 'SP']);

  /** Returns true if a raw group is a space group */
  static #isRawSpaceGroup(group) {
    if (!group.glyphs || group.glyphs.length === 0) return false;
    return group.glyphs.every(g =>
      g.parts?.length === 1 && BlissSVGBuilder.#SPACE_CODES.has(g.parts[0].code)
    );
  }

  /** Returns cloned object and array of group indices that are word groups (non-space) */
  #getWordGroupIndices() {
    const obj = this.toJSON();
    const indices = [];
    for (let i = 0; i < (obj.groups || []).length; i++) {
      if (!BlissSVGBuilder.#isRawSpaceGroup(obj.groups[i])) {
        indices.push(i);
      }
    }
    return { obj, indices };
  }

  /** Creates a default space group for insertion between words */
  static #makeSpaceGroup() {
    return { glyphs: [{ parts: [{ code: 'TSP' }] }] };
  }

  /**
   * Removes a character (glyph) from a word.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Character index within word (0-based)
   * @returns {Object|null} JSON object for constructor, or null if out of range
   */
  removeCharacter(wordIndex, charIndex) {
    const { obj, indices } = this.#getWordGroupIndices();
    if (wordIndex < 0 || wordIndex >= indices.length) return null;
    const gi = indices[wordIndex];
    const group = obj.groups[gi];
    if (!group.glyphs || charIndex < 0 || charIndex >= group.glyphs.length) return null;
    group.glyphs.splice(charIndex, 1);
    // If word is now empty, remove the word and adjacent space
    if (group.glyphs.length === 0) {
      return this.#removeWordGroup(obj, gi);
    }
    return obj;
  }

  /**
   * Replaces a character (glyph) in a word with a new code.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Character index within word (0-based)
   * @param {string} newCode - New code string for the replacement
   * @returns {Object|null} JSON object for constructor, or null if out of range
   */
  replaceCharacter(wordIndex, charIndex, newCode) {
    const { obj, indices } = this.#getWordGroupIndices();
    if (wordIndex < 0 || wordIndex >= indices.length) return null;
    const gi = indices[wordIndex];
    const group = obj.groups[gi];
    if (!group.glyphs || charIndex < 0 || charIndex >= group.glyphs.length) return null;
    // Parse the new code to get its structure
    const parsed = BlissParser.parse(newCode);
    const newGlyph = parsed.groups?.[0]?.glyphs?.[0];
    if (!newGlyph) return null;
    // Normalize glyphCode→code
    if (newGlyph.glyphCode) {
      newGlyph.code = newGlyph.glyphCode;
      delete newGlyph.glyphCode;
    }
    group.glyphs[charIndex] = newGlyph;
    return obj;
  }

  /**
   * Inserts a character (glyph) at a position in a word.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Insert position (0 = before first, length = after last)
   * @param {string} code - Code string for the new character
   * @returns {Object|null} JSON object for constructor, or null if out of range
   */
  insertCharacter(wordIndex, charIndex, code) {
    const { obj, indices } = this.#getWordGroupIndices();
    if (wordIndex < 0 || wordIndex >= indices.length) return null;
    const gi = indices[wordIndex];
    const group = obj.groups[gi];
    if (!group.glyphs || charIndex < 0 || charIndex > group.glyphs.length) return null;
    const parsed = BlissParser.parse(code);
    const newGlyph = parsed.groups?.[0]?.glyphs?.[0];
    if (!newGlyph) return null;
    if (newGlyph.glyphCode) {
      newGlyph.code = newGlyph.glyphCode;
      delete newGlyph.glyphCode;
    }
    group.glyphs.splice(charIndex, 0, newGlyph);
    return obj;
  }

  /** Internal: removes a word group and its adjacent space from groups array */
  #removeWordGroup(obj, groupIndex) {
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
   * Removes an entire word.
   * @param {number} wordIndex - Word index (0-based)
   * @returns {Object|null} JSON object for constructor, or null if out of range
   */
  removeWord(wordIndex) {
    const { obj, indices } = this.#getWordGroupIndices();
    if (wordIndex < 0 || wordIndex >= indices.length) return null;
    return this.#removeWordGroup(obj, indices[wordIndex]);
  }

  /**
   * Inserts a new word at the given position.
   * @param {number} wordIndex - Insert position (0 = before first, length = after last)
   * @param {string} code - Code string for the new word
   * @returns {Object|null} JSON object for constructor, or null if out of range
   */
  insertWord(wordIndex, code) {
    const { obj, indices } = this.#getWordGroupIndices();
    if (wordIndex < 0 || wordIndex > indices.length) return null;
    const parsed = BlissParser.parse(code);
    const newGroup = parsed.groups?.[0];
    if (!newGroup) return null;
    // Normalize glyphCode→code
    if (newGroup.glyphs) {
      for (const glyph of newGroup.glyphs) {
        if (glyph.glyphCode) {
          glyph.code = glyph.glyphCode;
          delete glyph.glyphCode;
        }
      }
    }

    const groups = obj.groups;
    if (indices.length === 0) {
      // No words yet, just add
      groups.push(newGroup);
    } else if (wordIndex === 0) {
      // Insert before first word, add space after
      const firstWordGi = indices[0];
      groups.splice(firstWordGi, 0, newGroup, BlissSVGBuilder.#makeSpaceGroup());
    } else if (wordIndex >= indices.length) {
      // Append after last word, add space before
      const lastWordGi = indices[indices.length - 1];
      groups.splice(lastWordGi + 1, 0, BlissSVGBuilder.#makeSpaceGroup(), newGroup);
    } else {
      // Insert between existing words
      const targetGi = indices[wordIndex];
      groups.splice(targetGi, 0, newGroup, BlissSVGBuilder.#makeSpaceGroup());
    }
    return obj;
  }

  /**
   * Removes an element by its snapshot ID. Works for glyphs and word groups.
   * @param {string} id - The UUID of the element to remove
   * @returns {Object|null} JSON object for constructor, or null if not found
   */
  removeById(id) {
    const el = this.getElementById(id);
    if (!el) return null;

    const { obj, indices } = this.#getWordGroupIndices();

    // If it's a word group (level 1), find its word index and remove directly
    if (el.type === 'group' && el.level === 1) {
      const words = this.words;
      const wordIndex = words.findIndex(w => w.id === id);
      if (wordIndex < 0) return null;
      return this.#removeWordGroup(obj, indices[wordIndex]);
    }

    // If it's a glyph (level 2), find word and char index and remove directly
    if (el.type === 'glyph' && el.level === 2) {
      const words = this.words;
      for (let wi = 0; wi < words.length; wi++) {
        const chars = words[wi].children.filter(c => c.type === 'glyph');
        for (let ci = 0; ci < chars.length; ci++) {
          if (chars[ci].id === id) {
            const gi = indices[wi];
            const group = obj.groups[gi];
            group.glyphs.splice(ci, 1);
            if (group.glyphs.length === 0) {
              return this.#removeWordGroup(obj, gi);
            }
            return obj;
          }
        }
      }
      return null;
    }

    return null;
  }

  // --- Part-level manipulation (operates on raw structure) ---

  /** Validates word/char/part indices and returns the parts array, or null */
  #getPartsRef(obj, indices, wordIndex, charIndex) {
    if (wordIndex < 0 || wordIndex >= indices.length) return null;
    const group = obj.groups[indices[wordIndex]];
    if (!group.glyphs || charIndex < 0 || charIndex >= group.glyphs.length) return null;
    const glyph = group.glyphs[charIndex];
    if (!glyph.parts) return null;
    return { parts: glyph.parts, glyph, group, gi: indices[wordIndex] };
  }

  /**
   * Removes a part from a character's composition.
   * If the last part is removed, the character itself is removed.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Character index within word (0-based)
   * @param {number} partIndex - Part index within character (0-based)
   * @returns {Object|null} Raw JSON object for constructor, or null if out of range
   */
  removePart(wordIndex, charIndex, partIndex) {
    const { obj, indices } = this.#getWordGroupIndices();
    const ref = this.#getPartsRef(obj, indices, wordIndex, charIndex);
    if (!ref || partIndex < 0 || partIndex >= ref.parts.length) return null;
    ref.parts.splice(partIndex, 1);
    // If no parts left, remove the character
    if (ref.parts.length === 0) {
      ref.group.glyphs.splice(charIndex, 1);
      if (ref.group.glyphs.length === 0) {
        return this.#removeWordGroup(obj, ref.gi);
      }
    }
    return obj;
  }

  /**
   * Replaces a part in a character's composition. Preserves the original position.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Character index within word (0-based)
   * @param {number} partIndex - Part index within character (0-based)
   * @param {string} newCode - New code for the replacement part
   * @returns {Object|null} Raw JSON object for constructor, or null if out of range
   */
  replacePart(wordIndex, charIndex, partIndex, newCode) {
    const { obj, indices } = this.#getWordGroupIndices();
    const ref = this.#getPartsRef(obj, indices, wordIndex, charIndex);
    if (!ref || partIndex < 0 || partIndex >= ref.parts.length) return null;
    const oldPart = ref.parts[partIndex];
    ref.parts[partIndex] = {
      code: newCode,
      ...(oldPart.x !== undefined && { x: oldPart.x }),
      ...(oldPart.y !== undefined && { y: oldPart.y }),
    };
    return obj;
  }

  /**
   * Inserts a part into a character's composition.
   * @param {number} wordIndex - Word index (0-based)
   * @param {number} charIndex - Character index within word (0-based)
   * @param {number} partIndex - Insert position (0 = before first, length = after last)
   * @param {string} code - Code for the new part
   * @param {Object} [position] - Optional { x, y } position
   * @returns {Object|null} Raw JSON object for constructor, or null if out of range
   */
  insertPart(wordIndex, charIndex, partIndex, code, position) {
    const { obj, indices } = this.#getWordGroupIndices();
    const ref = this.#getPartsRef(obj, indices, wordIndex, charIndex);
    if (!ref || partIndex < 0 || partIndex > ref.parts.length) return null;
    const newPart = { code };
    if (position) {
      if (position.x !== undefined) newPart.x = position.x;
      if (position.y !== undefined) newPart.y = position.y;
    }
    ref.parts.splice(partIndex, 0, newPart);
    return obj;
  }

  toString() {
    const obj = this.toJSON();

    // Serialize a part (and its nested parts) with ; delimiter and :x,y positions
    function serializeParts(parts) {
      return parts.map(part => {
        let str = part.code;
        if (part.x !== undefined || part.y !== undefined) {
          str += `:${part.x ?? 0},${part.y ?? 0}`;
        }
        return str;
      }).join(';');
    }

    // Serialize a glyph: B-codes emit their code, compositions emit parts
    function serializeGlyph(glyph) {
      if (glyph.isBlissGlyph && glyph.code) {
        return glyph.code;
      }
      if (glyph.parts) {
        return serializeParts(glyph.parts);
      }
      return glyph.code || '';
    }

    // Check if a group is a space (TSP, QSP, etc.)
    const SPACE_CODES = new Set(['TSP', 'QSP', 'ZSA']);
    function isSpaceGroup(group) {
      if (!group.glyphs || group.glyphs.length === 0) return false;
      return group.glyphs.every(g =>
        g.parts?.length === 1 && SPACE_CODES.has(g.parts[0].code)
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
          const codes = group.glyphs.map(g => g.parts[0].code);
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
   * Returns the normalized parsed structure. Aliases are resolved to canonical
   * codes, B-codes are preserved as character-level units.
   * Feed this back into the constructor to recreate an identical builder.
   *
   * @returns {Object} Plain object with groups/glyphs/options structure
   */
  toJSON() {
    const obj = structuredClone(this.#rawBlissObj);
    // Normalize glyph-level objects: expose glyphCode as 'code' for public API
    if (obj.groups) {
      for (const group of obj.groups) {
        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            if (glyph.glyphCode) {
              glyph.code = glyph.glyphCode;
              delete glyph.glyphCode;
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

  set code(settingsAndCodesString) {
    if (typeof settingsAndCodesString !== "string") throw new Error("Code must be a string");

    const settings = this.parseSettings(settingsAndCodesString);
    this.validateSettings(settings);
    this.applySettings(settings);

    this.pathProperties.path = this.getFullPath(settingsAndCodesString);
    this.pathProperties.code = settingsAndCodesString;
  }

  parseSettings(settingsAndCodesString) {
    // Implement the logic of parsing settings here...
  }

  validateSettings(settings) {
    // Implement the logic of validating settings here...
  }

  applySettings(settings) {
    // Implement the logic of applying settings here...
  }

  getFullPath(settingsAndCodesString) {
    // Implement the logic of getting full path here...
  }

  // ...more methods...


  // Validates a definition code string
  static #validateCode(code) {
    if (typeof code !== 'string' || code.length === 0) {
      throw new Error('Definition code must be a non-empty string.');
    }
  }

  /**
   * Define a primitive shape with a getPath function.
   *
   * @param {string} code - Shape code (e.g., "MYCIRCLE")
   * @param {Object} definition
   * @param {function} definition.getPath - Function(x, y, options) returning SVG path string
   * @param {number} definition.width - Shape width
   * @param {number} definition.height - Shape height
   * @param {number} [definition.x=0] - Default x offset
   * @param {number} [definition.y=0] - Default y offset
   * @param {Object} [definition.extraPathOptions] - Extra options passed to getPath
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false] - Allow overwriting existing definitions
   */
  static defineShape(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.getPath !== 'function') {
      throw new Error(`defineShape("${code}"): "getPath" must be a function.`);
    }
    if (typeof definition.width !== 'number' || !isFinite(definition.width)) {
      throw new Error(`defineShape("${code}"): "width" must be a finite number.`);
    }
    if (typeof definition.height !== 'number' || !isFinite(definition.height)) {
      throw new Error(`defineShape("${code}"): "height" must be a finite number.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`defineShape("${code}"): code already exists. Use { overwrite: true } to replace.`);
    }

    const entry = {
      getPath: definition.getPath,
      width: definition.width,
      height: definition.height,
      isShape: true
    };
    if (definition.x !== undefined) entry.x = definition.x;
    if (definition.y !== undefined) entry.y = definition.y;
    if (definition.extraPathOptions) entry.extraPathOptions = definition.extraPathOptions;

    blissElementDefinitions[code] = entry;
  }

  /**
   * Define a Bliss glyph (composite character defined by codeString).
   *
   * @param {string} code - Glyph code (e.g., "B5000")
   * @param {Object} definition
   * @param {string} definition.codeString - Composition string (e.g., "H:0,8;VL8")
   * @param {boolean} [definition.isIndicator=false]
   * @param {number} [definition.anchorOffsetX]
   * @param {number} [definition.anchorOffsetY]
   * @param {number} [definition.width] - Width override
   * @param {Object} [definition.kerningRules]
   * @param {boolean} [definition.shrinksPrecedingWordSpace=false]
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   */
  static defineGlyph(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.length === 0) {
      throw new Error(`defineGlyph("${code}"): "codeString" must be a non-empty string.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`defineGlyph("${code}"): code already exists. Use { overwrite: true } to replace.`);
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

    blissElementDefinitions[code] = entry;
  }

  /**
   * Define an external glyph (e.g., Latin/Cyrillic character from SVG path data).
   *
   * @param {string} code - External glyph code (e.g., "Xα")
   * @param {Object} definition
   * @param {function} definition.getPath - Function(x, y, options) returning SVG path string
   * @param {number} definition.width - Glyph width
   * @param {string} definition.glyph - Character identifier
   * @param {number} [definition.y] - Y offset
   * @param {number} [definition.height] - Glyph height
   * @param {Object} [definition.kerningRules]
   * @param {Object} [options]
   * @param {boolean} [options.overwrite=false]
   */
  static defineExternalGlyph(code, definition, options = {}) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.getPath !== 'function') {
      throw new Error(`defineExternalGlyph("${code}"): "getPath" must be a function.`);
    }
    if (typeof definition.width !== 'number' || !isFinite(definition.width)) {
      throw new Error(`defineExternalGlyph("${code}"): "width" must be a finite number.`);
    }
    if (typeof definition.glyph !== 'string' || definition.glyph.length === 0) {
      throw new Error(`defineExternalGlyph("${code}"): "glyph" must be a non-empty string.`);
    }

    if (blissElementDefinitions[code] && !options.overwrite) {
      throw new Error(`defineExternalGlyph("${code}"): code already exists. Use { overwrite: true } to replace.`);
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

    blissElementDefinitions[code] = entry;
  }

  /**
   * Define one or more definitions of any type (auto-detected from definition shape).
   * - Has getPath function → shape
   * - Has codeString → glyph
   * - Has getPath + glyph string → external glyph
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
        if (typeof definition?.getPath === 'function' && typeof definition?.glyph === 'string') {
          BlissSVGBuilder.defineExternalGlyph(code, definition, options);
        } else if (typeof definition?.getPath === 'function') {
          BlissSVGBuilder.defineShape(code, definition, options);
        } else if (typeof definition?.codeString === 'string') {
          BlissSVGBuilder.defineGlyph(code, definition, options);
        } else {
          result.errors.push(`"${code}": unable to detect definition type. Provide getPath+width+height (shape), codeString (glyph), or getPath+glyph (external glyph).`);
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
   * Functions (like getPath) are excluded from the copy.
   *
   * @param {string} code
   * @returns {Object|null} Frozen metadata object, or null if not found
   */
  static getDefinition(code) {
    const def = blissElementDefinitions[code];
    if (!def) return null;

    const copy = {};
    for (const [key, value] of Object.entries(def)) {
      if (typeof value === 'function') continue;
      if (typeof value === 'object' && value !== null) {
        copy[key] = Object.freeze({ ...value });
      } else {
        copy[key] = value;
      }
    }

    // Add computed type.
    // Two glyph detection paths: isBlissGlyph (set on B-code definitions loaded from glyph data)
    // and codeString fallback (for custom glyphs added via defineGlyph or old extendData).
    if (def.isShape) copy.type = 'shape';
    else if (def.isExternalGlyph) copy.type = 'externalGlyph';
    else if (def.isBlissGlyph) copy.type = 'glyph';
    else if (def.codeString) copy.type = 'glyph';
    else copy.type = 'space';

    copy.isBuiltIn = builtInCodes.has(code);
    if (typeof def.getPath === 'function') copy.hasGetPath = true;

    return Object.freeze(copy);
  }

  /**
   * List all defined codes, optionally filtered by type.
   *
   * @param {Object} [filter]
   * @param {'shape'|'glyph'|'externalGlyph'|'space'} [filter.type]
   * @returns {string[]}
   */
  static listDefinitions(filter = {}) {
    const codes = Object.keys(blissElementDefinitions);

    if (!filter.type) return codes;

    return codes.filter(code => {
      const def = blissElementDefinitions[code];
      // Uses same type detection logic as getDefinition() to ensure consistency
      const type = def.isShape ? 'shape'
        : def.isExternalGlyph ? 'externalGlyph'
        : (def.isBlissGlyph || def.codeString) ? 'glyph'
        : 'space';
      return type === filter.type;
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

  get #svgCode() {
    // Computed rendering dimensions
    const width = Math.max(this.composition.width, this.#processedOptions.minWidth ?? 0);
    const height = this.#processedOptions.freestyle ? this.composition.height : 20;

    // User-provided options with defaults
    const color = this.#processedOptions.color ?? "#000000";
    const strokeWidth = this.#processedOptions.strokeWidth ?? 0.5;
    const marginTop = this.#processedOptions.marginTop ?? 0.75;
    const marginBottom = this.#processedOptions.marginBottom ?? 0.75;
    const marginLeft = this.#processedOptions.marginLeft ?? 0.75;
    const marginRight = this.#processedOptions.marginRight ?? 0.75;

    // Compute crop values - can be numeric or 'auto' (computed from effectiveBounds)
    const bounds = this.composition.effectiveBounds;
    const rawCropTop = this.#processedOptions.cropTop ?? 0;
    const rawCropBottom = this.#processedOptions.cropBottom ?? 0;
    const rawCropLeft = this.#processedOptions.cropLeft ?? 0;
    const rawCropRight = this.#processedOptions.cropRight ?? 0;

    const cropTop = rawCropTop === 'auto' ? bounds.minY : rawCropTop;
    const cropBottom = rawCropBottom === 'auto' ? (height - bounds.maxY) : rawCropBottom;
    const cropLeft = rawCropLeft === 'auto' ? bounds.minX : rawCropLeft;
    const cropRight = rawCropRight === 'auto' ? (width - bounds.maxX) : rawCropRight;

    let viewBoxX = -marginLeft + cropLeft;
    const viewBoxY = -marginTop + cropTop;
    let gridOffsetX = 0;

    if ((this.#processedOptions.centered ?? 1) === 1 && width > this.composition.width) {
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

    let title = svgTitle ? `<title>${svgTitle}</title>` : "";
    let desc = svgDesc ? `<desc>${svgDesc}</desc>` : "";
    let gridPath = "";
    let svgText = "";//this._getSvgText();
    let backgroundRect = (background === "" ? "" : `<rect x="${viewBoxX}" y="${viewBoxY}" width="100%" height="100%" stroke="none" fill="${background}"/>`);

    let getVerticalLines = (type) => {
      let pathData = "";
      let count = 0;

      switch(type) {
        case "minor":
          //odd numbers
          count = Math.floor((width + 1) / 2)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*2+1},0V${height}`;
          }
          break;
        case "medium":
          //even numbers not divisible with 4
          count = Math.floor((width + 2) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*4+2},0V${height}`;
          }
          break;
        case "major":
          //even numbers divisible with 4
          count = Math.floor((width + 4) / 4)
          for (let i = 0; i < count; i++) {
              pathData += `M${gridOffsetX + i*4},0V${height}`;
          }
          break;
        default:
          break;
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

      gridPath =
  `<path class="grid-line grid-line--minor" stroke-width="${gridMinorStrokeWidth}" stroke="${gridMinorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},1h${width}M${gridOffsetX},3h${width}M${gridOffsetX},5h${width}M${gridOffsetX},7h${width}M${gridOffsetX},9h${width}M${gridOffsetX},11h${width}M${gridOffsetX},13h${width}M${gridOffsetX},15h${width}M${gridOffsetX},17h${width}M${gridOffsetX},19h${width}${getVerticalLines("minor")}"/>
  <path class="grid-line grid-line--medium" stroke-width="${gridMediumStrokeWidth}" stroke="${gridMediumColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},2h${width}M${gridOffsetX},6h${width}M${gridOffsetX},10h${width}M${gridOffsetX},14h${width}M${gridOffsetX},18h${width}${getVerticalLines("medium")}"/>
  <path class="grid-line grid-line--major" stroke-width="${gridMajorStrokeWidth}" stroke="${gridMajorColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},0h${width}M${gridOffsetX},4h${width}M${gridOffsetX},12h${width}M${gridOffsetX},20h${width}${getVerticalLines("major")}"/>
  <path class="grid-line grid-line--major grid-line--sky" stroke-width="${gridSkyStrokeWidth}" stroke="${gridSkyColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},8h${width}"/>
  <path class="grid-line grid-line--major grid-line--earth" stroke-width="${gridEarthStrokeWidth}" stroke="${gridEarthColor}" stroke-linecap="square" stroke-linejoin="miter" d="M${gridOffsetX},16h${width}"/>
  `;
    }

    // Build additional SVG attributes from global options (excluding explicitly handled ones)
    const explicitlyHandled = ['fill', 'stroke', 'stroke-linejoin', 'stroke-linecap', 'stroke-width', 'strokeWidth', 'color', 'width', 'height', 'viewBox'];
    const additionalAttrs = Object.entries(this.globalSvgAttributes)
      .filter(([key]) => !explicitlyHandled.includes(key))
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    const attrsStr = additionalAttrs ? ' ' + additionalAttrs : '';

    const fill = this.globalSvgAttributes.fill || 'none';
    const stroke = this.globalSvgAttributes.stroke || color;
    const strokeLinejoin = this.globalSvgAttributes['stroke-linejoin'] || 'round';
    const strokeLinecap = this.globalSvgAttributes['stroke-linecap'] || 'round';
    const strokeWidthAttr = this.globalSvgAttributes['stroke-width'] || strokeWidth;

    let svgStr =
`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" baseProfile="tiny" width="${round(svgWidth)}" height="${round(svgHeight)}" viewBox="${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}" fill="${fill}" stroke="${stroke}" stroke-linejoin="${strokeLinejoin}" stroke-linecap="${strokeLinecap}" stroke-width="${strokeWidthAttr}"${attrsStr}>
  ${title}${desc}${backgroundRect}${gridPath}${content}${svgText}
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
