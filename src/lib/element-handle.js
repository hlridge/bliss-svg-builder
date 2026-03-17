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
 * Handles track a generation counter to detect staleness: any mutation on
 * the builder (by any handle) invalidates all other handles. The handle
 * that performed the mutation stays valid for chaining.
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

  #assertAlive() {
    if (this.#generation !== this.#ctx.getGeneration()) {
      throw new Error('ElementHandle is stale. Handles are invalidated when any mutation occurs on the builder.');
    }
  }

  // Update this handle's generation after a mutation it initiated,
  // so chaining (e.g. handle.setOptions(...).addPart(...)) keeps working.
  #syncGeneration() {
    this.#generation = this.#ctx.getGeneration();
  }

  get level() {
    return this.#level;
  }

  get codeName() {
    this.#assertAlive();
    return this.#nodeRef?.glyphCode || this.#nodeRef?.codeName || '';
  }

  get isIndicator() {
    this.#assertAlive();
    if (this.#level !== 'part') return false;
    return this.#nodeRef?.isIndicator === true;
  }

  // Resolve the current index of this node within its parent array
  #resolveIndex() {
    if (this.#level === 'group') {
      const groups = this.#ctx.getRaw().groups;
      return groups.indexOf(this.#nodeRef);
    }
    if (this.#level === 'glyph') {
      const groupIndex = this.#ctx.getRaw().groups.indexOf(this.#parentRef);
      if (groupIndex < 0) return null;
      const glyphIndex = this.#parentRef.glyphs?.indexOf(this.#nodeRef) ?? -1;
      if (glyphIndex < 0) return null;
      return { groupIndex, glyphIndex };
    }
    if (this.#level === 'part') {
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
    this.#assertAlive();
    if (this.#level !== 'group') return null;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return null;

    const groupIndex = this.#ctx.getRaw().groups.indexOf(this.#nodeRef);
    if (groupIndex < 0) return null;

    // Find the head glyph via the snapshot tree
    const snap = this.#ctx.getSnapshot();
    const groupSnap = snap.children[groupIndex];
    if (!groupSnap) return null;

    const glyphs = groupSnap.children.filter(c => c.type === 'glyph');
    const headIndex = glyphs.findIndex(g => g.isHeadGlyph);
    const index = headIndex >= 0 ? headIndex : 0;

    if (index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 'glyph', group.glyphs[index], group);
  }

  glyph(index) {
    this.#assertAlive();
    if (this.#level !== 'group') return null;
    const group = this.#nodeRef;
    if (!group?.glyphs?.length) return null;
    if (index < 0) index = group.glyphs.length + index;
    if (index < 0 || index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 'glyph', group.glyphs[index], group);
  }

  part(index) {
    this.#assertAlive();
    if (this.#level === 'glyph') {
      const glyph = this.#nodeRef;
      if (!glyph?.parts?.length) return null;
      if (index < 0) index = glyph.parts.length + index;
      if (index < 0 || index >= glyph.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', glyph.parts[index], {
        group: this.#parentRef,
        glyph
      });
    }
    if (this.#level === 'part') {
      const part = this.#nodeRef;
      if (!part?.parts?.length) return null;
      if (index < 0) index = part.parts.length + index;
      if (index < 0 || index >= part.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', part.parts[index], this.#parentRef);
    }
    return null;
  }

  // --- Mutation: add/insert ---

  addGlyph(code, opts) {
    this.#assertAlive();
    if (this.#level !== 'group') return this;
    const group = this.#nodeRef;
    if (!group) return this;
    return this.insertGlyph(group.glyphs?.length ?? 0, code, opts);
  }

  insertGlyph(index, code, opts) {
    this.#assertAlive();
    if (this.#level !== 'group') return this;
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
    this.#assertAlive();
    // Group level: delegate to last glyph
    if (this.#level === 'group') {
      const group = this.#nodeRef;
      if (!group?.glyphs?.length) return this;
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 'glyph', lastGlyph, group);
      glyphHandle.addPart(code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 'glyph') return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    return this.insertPart(glyph.parts?.length ?? 0, code, opts);
  }

  insertPart(index, code, opts) {
    this.#assertAlive();
    // Group level: delegate to last glyph
    if (this.#level === 'group') {
      const group = this.#nodeRef;
      if (!group?.glyphs?.length) return this;
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 'glyph', lastGlyph, group);
      glyphHandle.insertPart(index, code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 'glyph') return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    const newParts = this.#parseParts(code);
    for (const p of newParts) {
      this.#applyDefaultsOverrides(p, opts);
    }
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.splice(index, 0, ...newParts);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: detach (plain splice, no cascade) ---

  detach() {
    this.#assertAlive();

    if (this.#level === 'part') {
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return undefined;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return undefined;
      glyph.parts.splice(partIndex, 1);
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 'glyph') {
      const group = this.#parentRef;
      if (!group?.glyphs) return undefined;
      const glyphIndex = group.glyphs.indexOf(this.#nodeRef);
      if (glyphIndex < 0) return undefined;
      group.glyphs.splice(glyphIndex, 1);
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 'group') {
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

  remove() {
    this.#assertAlive();
    const raw = this.#ctx.getRaw();
    const groups = raw.groups;

    if (this.#level === 'part') {
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

    if (this.#level === 'glyph') {
      const group = this.#parentRef;
      return this.#removeGlyphFromGroup(groups, group, this.#nodeRef);
    }

    if (this.#level === 'group') {
      const groupIndex = groups.indexOf(this.#nodeRef);
      if (groupIndex < 0) return undefined;
      this.#ctx.removeGlyphGroup(raw, groupIndex);
      this.#ctx.rebuild();
      return undefined;
    }

    return undefined;
  }

  removeGlyph(index) {
    this.#assertAlive();
    if (this.#level !== 'group') return this;
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
    this.#assertAlive();
    if (this.#level !== 'glyph') return this;
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
    this.#assertAlive();
    if (this.#level !== 'group') return this;
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
    this.#assertAlive();
    if (this.#level !== 'glyph') return this;
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
    this.#assertAlive();
    if (this.#level === 'glyph') {
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

    if (this.#level === 'part') {
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

  applyIndicators(codes, opts) {
    this.#assertAlive();
    if (codes === undefined || codes === null || codes === '') {
      throw new Error('applyIndicators() requires a codes argument. Use clearIndicators() to remove indicators.');
    }
    return this.#applyOrClearIndicators(codes, opts);
  }

  clearIndicators(opts) {
    this.#assertAlive();
    return this.#applyOrClearIndicators(null, opts);
  }

  applyHeadIndicators(codes, opts) {
    this.#assertAlive();
    if (this.#level !== 'group') return this;
    const head = this.headGlyph();
    if (!head) return this;
    head.applyIndicators(codes, opts);
    this.#syncGeneration();
    return this;
  }

  clearHeadIndicators(opts) {
    this.#assertAlive();
    if (this.#level !== 'group') return this;
    const head = this.headGlyph();
    if (!head) return this;
    head.clearIndicators(opts);
    this.#syncGeneration();
    return this;
  }

  #applyOrClearIndicators(codes, opts) {
    if (this.#level !== 'glyph') return this;
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
    if (codes !== null) {
      const requestedCodes = codes.split(';').map(s => s.trim()).filter(Boolean);
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
    this.#assertAlive();
    if (this.#level !== 'group') return this;
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
    this.#assertAlive();
    if (this.#level !== 'group') return this;
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
    this.#assertAlive();
    const node = this.#nodeRef;
    if (!node) return this;
    this.#applyDefaultsOverrides(node, opts);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  removeOptions(...keys) {
    this.#assertAlive();
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
