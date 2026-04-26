/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { camelToKebab } from "./bliss-constants.js";
import {
  getSemanticRoot,
  hasSemantic,
  filterToIndicators,
  buildWithSemantic
} from "./indicator-utils.js";

/**
 * A lightweight handle that references a node in `#rawBlissObj` by identity.
 * Survives `#rebuild()` because it holds a direct reference to the raw node,
 * and resolves its current index dynamically when needed.
 *
 * Handles survive mutations to other parts of the tree. A handle only
 * becomes invalid when its own node is removed from the tree. Relocated
 * nodes (e.g. glyphs absorbed by mergeWithNext) are found via a full
 * tree scan and the handle's parent reference is updated automatically.
 */
export class ElementHandle {
  #ctx;
  #level;
  #nodeRef;
  #parentRef;
  #generation;

  constructor(ctx, level, nodeRef, parentRef) {
    this.#ctx = ctx;
    this.#level = level;
    this.#nodeRef = nodeRef;
    this.#parentRef = parentRef;
    this.#generation = ctx.getGeneration();
  }

  #assertReachable() {
    // Fast path: no mutations since last check
    if (this.#generation === this.#ctx.getGeneration()) return;

    // Parent-based lookup (fast)
    const idx = this.#resolveIndex();
    if (idx !== null && idx !== -1) {
      this.#generation = this.#ctx.getGeneration();
      return;
    }

    // Full tree scan (node may have moved to a different parent)
    if (this.#relocate()) {
      this.#generation = this.#ctx.getGeneration();
      return;
    }

    throw new Error(
      'ElementHandle references an element that has been removed.'
    );
  }

  // Full tree scan: find this node anywhere in the raw tree.
  // Updates #parentRef if the node moved to a different parent.
  // Returns true if found, false if the node is gone.
  #relocate() {
    const raw = this.#ctx.getRaw();
    const groups = raw.groups || [];

    if (this.#level === 1) {
      return groups.indexOf(this.#nodeRef) >= 0;
    }

    if (this.#level === 2) {
      for (const group of groups) {
        const gi = (group.glyphs || []).indexOf(this.#nodeRef);
        if (gi >= 0) {
          this.#parentRef = group;
          return true;
        }
      }
      return false;
    }

    if (this.#level === 3) {
      for (const group of groups) {
        for (const glyph of (group.glyphs || [])) {
          const pi = (glyph.parts || []).indexOf(this.#nodeRef);
          if (pi >= 0) {
            this.#parentRef = { group, glyph };
            return true;
          }
        }
      }
      return false;
    }

    return false;
  }

  // Update this handle's generation after a mutation it initiated,
  // so chaining (e.g. handle.setOptions(...).addPart(...)) keeps working.
  #syncGeneration() {
    this.#generation = this.#ctx.getGeneration();
  }

  get level() {
    return this.#level;
  }

  get isGroup() {
    return this.#level === 1;
  }

  get isGlyph() {
    return this.#level === 2;
  }

  get isPart() {
    return this.#level >= 3;
  }

  get codeName() {
    this.#assertReachable();
    return this.#nodeRef?.glyphCode || this.#nodeRef?.codeName || '';
  }

  get isIndicator() {
    this.#assertReachable();
    if (this.#level !== 3) return false;
    return this.#nodeRef?.isIndicator === true;
  }

  // --- Dimensions (read-only, from snapshot) ---

  #findSnapshot() {
    this.#assertReachable();
    const idx = this.#resolveIndex();
    if (idx === null || idx === -1) {
      throw new Error('Snapshot not found: handle index could not be resolved.');
    }
    const snap = this.#ctx.getSnapshot();

    if (this.#level === 1) {
      const groupSnap = snap.children[idx];
      if (!groupSnap) throw new Error('Snapshot not found for group handle.');
      return groupSnap;
    }

    if (this.#level === 2) {
      const groupSnap = snap.children[idx.groupIndex];
      if (!groupSnap) throw new Error('Snapshot not found for group in glyph handle.');
      const glyphs = groupSnap.children.filter(c => c.isGlyph);
      const glyphSnap = glyphs[idx.glyphIndex];
      if (!glyphSnap) throw new Error('Snapshot not found for glyph handle.');
      return glyphSnap;
    }

    if (this.#level === 3) {
      const groupSnap = snap.children[idx.groupIndex];
      if (!groupSnap) throw new Error('Snapshot not found for group in part handle.');
      const glyphs = groupSnap.children.filter(c => c.isGlyph);
      const glyphSnap = glyphs[idx.glyphIndex];
      if (!glyphSnap) throw new Error('Snapshot not found for glyph in part handle.');
      return glyphSnap.children[idx.partIndex];
    }

    throw new Error(`Unsupported handle level: ${this.#level}`);
  }

  get x() { return this.#findSnapshot().x; }
  get y() { return this.#findSnapshot().y; }
  get width() { return this.#findSnapshot().width; }
  get height() { return this.#findSnapshot().height; }
  get bounds() { return this.#findSnapshot().bounds; }
  get advanceX() { return this.#findSnapshot().advanceX; }
  get baseWidth() { return this.#findSnapshot().baseWidth; }

  measure() {
    const snap = this.#findSnapshot();
    return Object.freeze({
      x: snap.x,
      y: snap.y,
      width: snap.width,
      height: snap.height,
      bounds: snap.bounds,
      advanceX: snap.advanceX,
      baseWidth: snap.baseWidth,
    });
  }

  // Resolve the current index of this node within its parent array
  #resolveIndex() {
    if (this.#level === 1) {
      const groups = this.#ctx.getRaw().groups;
      return groups.indexOf(this.#nodeRef);
    }
    if (this.#level === 2) {
      const groupIndex = this.#ctx.getRaw().groups.indexOf(this.#parentRef);
      if (groupIndex < 0) return null;
      const glyphIndex = this.#parentRef.glyphs?.indexOf(this.#nodeRef) ?? -1;
      if (glyphIndex < 0) return null;
      return { groupIndex, glyphIndex };
    }
    if (this.#level === 3) {
      const raw = this.#ctx.getRaw();
      const groupIndex = raw.groups.indexOf(this.#parentRef.group);
      if (groupIndex < 0) return null;
      const glyphIndex = this.#parentRef.group.glyphs?.indexOf(this.#parentRef.glyph) ?? -1;
      if (glyphIndex < 0) return null;
      const partIndex = this.#parentRef.glyph.parts?.indexOf(this.#nodeRef) ?? -1;
      if (partIndex < 0) return null;
      return { groupIndex, glyphIndex, partIndex };
    }
    return null;
  }

  // Parse a DSL code string and extract glyphs from a single group.
  // Accepts multi-glyph codes (e.g. "H/C8" or word definitions).
  // Rejects multi-group input (e.g. "H//C8").
  #parseGlyphs(code) {
    const parsed = this.#ctx.parse(code);
    if (!parsed.groups || parsed.groups.length !== 1) {
      throw new Error(`Expected glyphs within a single group, but code "${code}" produced ${parsed.groups?.length ?? 0} groups`);
    }
    const group = parsed.groups[0];
    if (!group.glyphs || group.glyphs.length === 0) {
      throw new Error(`Code "${code}" produced no glyphs`);
    }
    return group.glyphs;
  }

  // Parse a DSL code string and extract exactly one glyph.
  // Used by replace() which must swap a single glyph.
  #parseGlyph(code) {
    const glyphs = this.#parseGlyphs(code);
    if (glyphs.length !== 1) {
      throw new Error(`Expected a single glyph, but code "${code}" produced ${glyphs.length} glyphs`);
    }
    return glyphs[0];
  }

  // Parse a DSL code string in part context.
  // For single-glyph codes: embeds in helper glyph for proper part-level expansion.
  // For multi-glyph codes (words): returns an error part (words cannot be parts).
  #parseParts(code) {
    // Check if the code parses to multiple glyphs (word) vs single glyph (part)
    const rawParsed = this.#ctx.parse(code);
    if (!rawParsed.groups || rawParsed.groups.length !== 1) {
      throw new Error(`Expected parts within a single group, but code "${code}" produced ${rawParsed.groups?.length ?? 0} groups`);
    }
    const rawGroup = rawParsed.groups[0];
    if (!rawGroup.glyphs || rawGroup.glyphs.length === 0) {
      throw new Error(`Code "${code}" produced no glyphs`);
    }

    if (rawGroup.glyphs.length === 1) {
      // Single glyph — use helper approach for proper part-level expansion
      const parsed = this.#ctx.parse(`H;${code}`);
      const glyph = parsed.groups?.[0]?.glyphs?.[0];
      if (glyph?.parts?.length >= 2) {
        return glyph.parts.slice(1);
      }
      // Fallback: return the single glyph's parts directly
      return rawGroup.glyphs[0].parts || [];
    }

    // Multi-glyph code is a word — words cannot be composed with ;
    return [{ codeName: code, error: `"${code}" is a word and cannot be composed with ;`, errorCode: 'WORD_AS_PART' }];
  }

  // Parse a single part (strict). Used by replace() which must swap exactly one part.
  #parsePart(code) {
    const parts = this.#parseParts(code);
    if (parts.length !== 1) {
      throw new Error(`Expected a single part, but code "${code}" produced ${parts.length} parts`);
    }
    return parts[0];
  }

  // Apply defaults/overrides merge to a node's options.
  // Accepts { defaults, overrides } or flat options (treated as overrides).
  #applyDefaultsOverrides(node, opts) {
    if (!opts) return;
    let defaults, overrides;
    if ('defaults' in opts || 'overrides' in opts) {
      ({ defaults, overrides } = opts);
    } else {
      overrides = opts;
    }
    if (!defaults && !overrides) return;
    const rawDefaults = defaults ? this.#ctx.toRaw(defaults) : {};
    const rawOverrides = overrides ? this.#ctx.toRaw(overrides) : {};
    node.options = { ...rawDefaults, ...(node.options ?? {}), ...rawOverrides };
  }

  // --- Navigation ---

  /**
   * Returns the head glyph handle within this group.
   * Uses the composition snapshot to determine which glyph is the head.
   * @returns {ElementHandle|null}
   */
  headGlyph() {
    this.#assertReachable();
    if (this.#level !== 1) return null;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return null;

    const groupIndex = this.#ctx.getRaw().groups.indexOf(this.#nodeRef);
    if (groupIndex < 0) return null;

    // Find the head glyph via the snapshot tree
    const snap = this.#ctx.getSnapshot();
    const groupSnap = snap.children[groupIndex];
    if (!groupSnap) return null;

    const glyphs = groupSnap.children.filter(c => c.isGlyph);
    const headIndex = glyphs.findIndex(g => g.isHeadGlyph);
    const index = headIndex >= 0 ? headIndex : 0;

    if (index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 2, group.glyphs[index], group);
  }

  glyph(index) {
    this.#assertReachable();
    if (this.#level !== 1) return null;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return null;
    if (index < 0) index = group.glyphs.length + index;
    if (index < 0 || index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 2, group.glyphs[index], group);
  }

  part(index) {
    this.#assertReachable();
    if (this.#level === 2) {
      const glyph = this.#nodeRef;
      if (!glyph?.parts?.length) return null;
      if (index < 0) index = glyph.parts.length + index;
      if (index < 0 || index >= glyph.parts.length) return null;
      return new ElementHandle(this.#ctx, 3, glyph.parts[index], {
        group: this.#parentRef,
        glyph
      });
    }
    if (this.#level === 3) {
      const part = this.#nodeRef;
      if (!part?.parts?.length) return null;
      if (index < 0) index = part.parts.length + index;
      if (index < 0 || index >= part.parts.length) return null;
      return new ElementHandle(this.#ctx, 3, part.parts[index], this.#parentRef);
    }
    return null;
  }

  // --- Mutation: add/insert ---

  addGlyph(code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group) return this;
    return this.insertGlyph(group.glyphs?.length ?? 0, code, opts);
  }

  insertGlyph(index, code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group) return this;
    const newGlyphs = this.#parseGlyphs(code);
    for (const g of newGlyphs) {
      this.#applyDefaultsOverrides(g, opts);
    }
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.splice(index, 0, ...newGlyphs);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  addPart(code, opts) {
    this.#assertReachable();
    // Group level: delegate to last glyph
    if (this.#level === 1) {
      const group = this.#nodeRef;
      if (!group?.glyphs?.length) return this;
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 2, lastGlyph, group);
      glyphHandle.addPart(code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    return this.insertPart(glyph.parts?.length ?? 0, code, opts);
  }

  insertPart(index, code, opts) {
    this.#assertReachable();
    // Group level: delegate to last glyph
    if (this.#level === 1) {
      const group = this.#nodeRef;
      if (!group?.glyphs?.length) return this;
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 2, lastGlyph, group);
      glyphHandle.insertPart(index, code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    const newParts = this.#parseParts(code);
    for (const p of newParts) {
      this.#applyDefaultsOverrides(p, opts);
    }
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.splice(index, 0, ...newParts);
    // Adding parts changes the glyph's composition, so clear its identity
    // so toString() serializes the individual parts instead of the old code.
    delete glyph.isBlissGlyph;
    delete glyph.codeName;
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: detach (plain splice, no cascade) ---

  /**
   * Removes this node from the tree without cascading deletions to its parent.
   * Terminal mutation: returns undefined (not chainable), since the handle's
   * node is no longer reachable after detach.
   * @returns {undefined}
   */
  detach() {
    this.#assertReachable();

    if (this.#level === 3) {
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return undefined;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return undefined;
      glyph.parts.splice(partIndex, 1);
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 2) {
      const group = this.#parentRef;
      if (!group?.glyphs) return undefined;
      const glyphIndex = group.glyphs.indexOf(this.#nodeRef);
      if (glyphIndex < 0) return undefined;
      group.glyphs.splice(glyphIndex, 1);
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 1) {
      const groups = this.#ctx.getRaw().groups;
      const groupIndex = groups.indexOf(this.#nodeRef);
      if (groupIndex < 0) return undefined;
      groups.splice(groupIndex, 1);
      this.#ctx.rebuild();
      return undefined;
    }

    return undefined;
  }

  // --- Mutation: remove ---

  /**
   * Removes this node and cascades cleanup upward (e.g. removing the last
   * part also removes its glyph; removing the last glyph also removes its
   * group and surrounding spaces). Terminal mutation: returns undefined
   * (not chainable), since the handle's node is no longer reachable.
   * @returns {undefined}
   */
  remove() {
    this.#assertReachable();
    const raw = this.#ctx.getRaw();
    const groups = raw.groups;

    if (this.#level === 3) {
      const idx = this.#resolveIndex();
      if (!idx) return undefined;
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return undefined;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return undefined;
      glyph.parts.splice(partIndex, 1);
      // Cascade: last part → remove glyph
      if (glyph.parts.length === 0) {
        return this.#removeGlyphFromGroup(groups, this.#parentRef.group, glyph);
      }
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 2) {
      const group = this.#parentRef;
      return this.#removeGlyphFromGroup(groups, group, this.#nodeRef);
    }

    if (this.#level === 1) {
      const groupIndex = groups.indexOf(this.#nodeRef);
      if (groupIndex < 0) return undefined;
      this.#ctx.removeGlyphGroup(raw, groupIndex);
      this.#ctx.rebuild();
      return undefined;
    }

    return undefined;
  }

  removeGlyph(index) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return this;
    if (index < 0) index = group.glyphs.length + index;
    if (index < 0 || index >= group.glyphs.length) return this;
    group.glyphs.splice(index, 1);
    if (group.glyphs.length === 0) {
      const raw = this.#ctx.getRaw();
      const groupIndex = raw.groups.indexOf(group);
      if (groupIndex >= 0) {
        this.#ctx.removeGlyphGroup(raw, groupIndex);
      }
    }
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  removePart(index) {
    this.#assertReachable();
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph?.parts?.length) return this;
    if (index < 0) index = glyph.parts.length + index;
    if (index < 0 || index >= glyph.parts.length) return this;
    glyph.parts.splice(index, 1);
    if (glyph.parts.length === 0) {
      this.#removeGlyphFromGroup(
        this.#ctx.getRaw().groups, this.#parentRef, glyph
      );
      this.#syncGeneration();
      return this;
    }
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  #removeGlyphFromGroup(groups, group, glyph) {
    const raw = this.#ctx.getRaw();
    if (!group?.glyphs) return undefined;
    const glyphIndex = group.glyphs.indexOf(glyph);
    if (glyphIndex < 0) return undefined;
    group.glyphs.splice(glyphIndex, 1);
    // Cascade: last glyph → remove group + space
    if (group.glyphs.length === 0) {
      const groupIndex = groups.indexOf(group);
      if (groupIndex >= 0) {
        this.#ctx.removeGlyphGroup(raw, groupIndex);
      }
    }
    this.#ctx.rebuild();
    return undefined;
  }

  // --- Mutation: parent-centric replace ---

  replaceGlyph(index, code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return this;
    if (index < 0) index = group.glyphs.length + index;
    if (index < 0 || index >= group.glyphs.length) return this;
    const newGlyph = this.#parseGlyph(code);
    this.#applyDefaultsOverrides(newGlyph, opts);
    group.glyphs[index] = newGlyph;
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  replacePart(index, code, opts) {
    this.#assertReachable();
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph?.parts?.length) return this;
    if (index < 0) index = glyph.parts.length + index;
    if (index < 0 || index >= glyph.parts.length) return this;
    const newPart = this.#parsePart(code);
    this.#applyDefaultsOverrides(newPart, opts);
    glyph.parts[index] = newPart;
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: self-centric replace ---

  replace(code, opts) {
    this.#assertReachable();
    if (this.#level === 2) {
      const group = this.#parentRef;
      if (!group?.glyphs) return this;
      const glyphIndex = group.glyphs.indexOf(this.#nodeRef);
      if (glyphIndex < 0) return this;
      const newGlyph = this.#parseGlyph(code);
      this.#applyDefaultsOverrides(newGlyph, opts);
      group.glyphs[glyphIndex] = newGlyph;
      this.#nodeRef = newGlyph;
      this.#ctx.rebuild();
      this.#syncGeneration();
      return this;
    }

    if (this.#level === 3) {
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return this;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return this;
      const newPart = this.#parsePart(code);
      this.#applyDefaultsOverrides(newPart, opts);
      glyph.parts[partIndex] = newPart;
      this.#nodeRef = newPart;
      this.#ctx.rebuild();
      this.#syncGeneration();
      return this;
    }

    return this;
  }

  // --- Mutation: indicators ---

  applyIndicators(code, opts) {
    this.#assertReachable();
    if (code === undefined || code === null || code === '') {
      throw new Error('applyIndicators() requires a code argument. Use clearIndicators() to remove indicators.');
    }
    return this.#applyOrClearIndicators(code, opts);
  }

  clearIndicators(opts) {
    this.#assertReachable();
    return this.#applyOrClearIndicators(null, opts);
  }

  applyHeadIndicators(code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const head = this.headGlyph();
    if (!head) return this;
    head.applyIndicators(code, opts);
    this.#syncGeneration();
    return this;
  }

  clearHeadIndicators(opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const head = this.headGlyph();
    if (!head) return this;
    head.clearIndicators(opts);
    this.#syncGeneration();
    return this;
  }

  #applyOrClearIndicators(code, opts) {
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph?.parts?.length) return this;

    const definitions = this.#ctx.getDefinitions();
    const stripSemantic = opts?.stripSemantic === true;

    // Classify parts: separate base parts from trailing indicator parts
    const firstIndicatorIndex = glyph.parts.findIndex(p => p.isIndicator === true);

    let baseParts, indicatorParts;
    if (firstIndicatorIndex === -1) {
      baseParts = glyph.parts;
      indicatorParts = [];
    } else {
      baseParts = glyph.parts.slice(0, firstIndicatorIndex);
      indicatorParts = glyph.parts.slice(firstIndicatorIndex);
    }

    // Must have base parts (indicators without a base are just normal combined parts)
    if (baseParts.length === 0) return this;

    // Validate pattern: no non-indicators after the first indicator
    const isValidPattern = indicatorParts.every(p => p.isIndicator === true);
    if (!isValidPattern) return this;

    // Extract existing indicator codes for semantic analysis
    const existingIndCodes = indicatorParts.map(p => p.codeName);
    const semanticRoot = !stripSemantic ? getSemanticRoot(existingIndCodes, definitions) : null;

    // Determine new indicator codes
    let newIndicatorParts = [];
    if (code !== null) {
      const requestedCodes = code.split(';').map(s => s.trim()).filter(Boolean);
      const validCodes = filterToIndicators(requestedCodes, definitions);

      if (validCodes.length > 0) {
        // Build final indicator list with semantic preservation
        let finalCodes;
        if (semanticRoot && !hasSemantic(validCodes, definitions)) {
          finalCodes = buildWithSemantic(semanticRoot, validCodes, definitions);
        } else {
          finalCodes = validCodes;
        }

        // Parse each indicator code to create proper part nodes with metadata
        for (const indCode of finalCodes) {
          const parsed = this.#ctx.parse(indCode);
          const partNode = parsed.groups?.[0]?.glyphs?.[0]?.parts?.[0];
          if (partNode) {
            newIndicatorParts.push(partNode);
          }
        }
      } else {
        // All provided codes were non-indicators — preserve semantic if present
        if (semanticRoot) {
          const parsed = this.#ctx.parse(semanticRoot);
          const partNode = parsed.groups?.[0]?.glyphs?.[0]?.parts?.[0];
          if (partNode) newIndicatorParts.push(partNode);
        }
      }
    } else {
      // clearIndicators: no new codes, just preserve semantic if applicable
      if (semanticRoot) {
        const parsed = this.#ctx.parse(semanticRoot);
        const partNode = parsed.groups?.[0]?.glyphs?.[0]?.parts?.[0];
        if (partNode) newIndicatorParts.push(partNode);
      }
    }

    // Reassemble glyph parts
    glyph.parts = [...baseParts, ...newIndicatorParts];

    // Update glyph identity
    this.#updateGlyphIdentityAfterIndicatorChange(glyph, definitions);

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  #updateGlyphIdentityAfterIndicatorChange(glyph, definitions) {
    const hasIndicators = glyph.parts.some(p => p.isIndicator === true);
    if (!hasIndicators && glyph.parts.length === 1) {
      const baseCode = glyph.parts[0].codeName;
      const def = definitions[baseCode];
      if (def?.isBlissGlyph) {
        glyph.isBlissGlyph = true;
        glyph.codeName = baseCode;
        if (def.glyphCode) glyph.glyphCode = def.glyphCode;
      } else {
        delete glyph.isBlissGlyph;
        delete glyph.codeName;
        delete glyph.glyphCode;
      }
    } else {
      delete glyph.isBlissGlyph;
      delete glyph.codeName;
      delete glyph.glyphCode;
    }
  }

  // --- Mutation: word structure ---

  /**
   * Splits this word group into two at the glyph boundary, inserting
   * a space group between. Only valid on group-level handles.
   * @param {number} glyphIndex - Split point (1 to glyphs.length - 1)
   * @returns {this}
   */
  splitAt(glyphIndex) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group?.glyphs) return this;
    const len = group.glyphs.length;
    if (glyphIndex <= 0 || glyphIndex >= len) {
      throw new Error(`splitAt(${glyphIndex}) is out of range: must be between 1 and ${len - 1} (inclusive) for a group with ${len} glyphs`);
    }

    // Resolve raw index before any destructive mutation
    const groups = this.#ctx.getRaw().groups;
    const rawIndex = groups.indexOf(this.#nodeRef);
    if (rawIndex < 0) return this;

    // Splice trailing glyphs from the original group (mutate in-place)
    const rightGlyphs = group.glyphs.splice(glyphIndex);

    // Build right-half group with copied options
    const rightGroup = { glyphs: rightGlyphs };
    if (group.options) {
      rightGroup.options = { ...group.options };
    }

    const spaceGroup = this.#ctx.makeSpaceGroup();

    // Insert [space, rightGroup] after the original group
    groups.splice(rawIndex + 1, 0, spaceGroup, rightGroup);

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  /**
   * Merges this word group with the next non-space group, removing any
   * space groups between them. Only valid on group-level handles.
   * No-op if no next word group exists or if this is a space group.
   * The absorbed group's options are discarded; only this group's
   * options apply to the merged result.
   * @returns {this}
   */
  mergeWithNext() {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group?.glyphs) return this;

    const groups = this.#ctx.getRaw().groups;
    const rawIndex = groups.indexOf(this.#nodeRef);
    if (rawIndex < 0) return this;

    // No-op for space groups
    if (this.#ctx.isRawSpaceGroup(group)) return this;

    // Scan right to find the next non-space group
    let nextWordIndex = -1;
    for (let i = rawIndex + 1; i < groups.length; i++) {
      if (!this.#ctx.isRawSpaceGroup(groups[i])) {
        nextWordIndex = i;
        break;
      }
    }
    if (nextWordIndex < 0) return this;

    // No-op if the next group has no glyphs to absorb
    const nextGroup = groups[nextWordIndex];
    if (!nextGroup.glyphs?.length) return this;

    // Absorb the next word group's glyphs
    group.glyphs.push(...nextGroup.glyphs);

    // Remove everything from rawIndex+1 through nextWordIndex (spaces + absorbed word)
    groups.splice(rawIndex + 1, nextWordIndex - rawIndex);

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: options ---

  setOptions(opts) {
    this.#assertReachable();
    const node = this.#nodeRef;
    if (!node) return this;
    this.#applyDefaultsOverrides(node, opts);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  removeOptions(...keys) {
    this.#assertReachable();
    const node = this.#nodeRef;
    if (!node?.options) return this;
    for (const key of keys) {
      const kebab = camelToKebab(key);
      delete node.options[kebab];
      delete node.options[key];
    }
    // Clean up empty options object
    if (Object.keys(node.options).length === 0) {
      delete node.options;
    }
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }
}
