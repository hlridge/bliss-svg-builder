/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { camelToKebab } from "./bliss-constants.js";

/**
 * A lightweight handle that references a node in `#rawBlissObj` by identity.
 * Survives `#rebuild()` because it holds a direct reference to the raw node,
 * and resolves its current index dynamically when needed.
 */
export class ElementHandle {
  #ctx;
  #level;
  #nodeRef;
  #parentRef;

  constructor(ctx, level, nodeRef, parentRef) {
    this.#ctx = ctx;
    this.#level = level;
    this.#nodeRef = nodeRef;
    this.#parentRef = parentRef;
  }

  get level() {
    return this.#level;
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

  // Parse a DSL code string and extract the first glyph from the result.
  // Validates that the code represents exactly one glyph (no / or // separators).
  #parseGlyph(code) {
    const parsed = this.#ctx.parse(code);
    if (!parsed.groups || parsed.groups.length !== 1) {
      throw new Error(`Expected a single glyph, but code "${code}" produced ${parsed.groups?.length ?? 0} groups`);
    }
    const group = parsed.groups[0];
    if (!group.glyphs || group.glyphs.length !== 1) {
      throw new Error(`Expected a single glyph, but code "${code}" produced ${group.glyphs?.length ?? 0} glyphs`);
    }
    return group.glyphs[0];
  }

  // Parse a DSL code string in part context by embedding it in a helper glyph.
  // This ensures composite codes like B303 get proper nested parts expansion.
  // Validates that the code represents exactly one part (no ;, / or // separators).
  #parsePart(code) {
    const parsed = this.#ctx.parse(`H;${code}`);
    if (!parsed.groups || parsed.groups.length !== 1) {
      throw new Error(`Expected a single part, but code "${code}" produced multiple groups`);
    }
    const glyph = parsed.groups[0]?.glyphs?.[0];
    if (!glyph?.parts || glyph.parts.length !== 2) {
      throw new Error(`Expected a single part, but code "${code}" produced ${(glyph?.parts?.length ?? 1) - 1} parts`);
    }
    return glyph.parts[1];
  }

  // Apply defaults/overrides merge to a node's options
  #applyDefaultsOverrides(node, opts) {
    if (!opts) return;
    const { defaults, overrides } = opts;
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
    if (this.#level !== 'group') return null;
    const group = this.#nodeRef;
    if (!group?.glyphs || index < 0 || index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 'glyph', group.glyphs[index], group);
  }

  part(index) {
    if (this.#level === 'glyph') {
      const glyph = this.#nodeRef;
      if (!glyph?.parts || index < 0 || index >= glyph.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', glyph.parts[index], {
        group: this.#parentRef,
        glyph
      });
    }
    if (this.#level === 'part') {
      const part = this.#nodeRef;
      if (!part?.parts || index < 0 || index >= part.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', part.parts[index], this.#parentRef);
    }
    return null;
  }

  // --- Mutation: add/insert ---

  addGlyph(code, opts) {
    if (this.#level !== 'group') return this;
    const group = this.#nodeRef;
    if (!group) return this;
    const newGlyph = this.#parseGlyph(code);
    this.#applyDefaultsOverrides(newGlyph, opts);
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.push(newGlyph);
    this.#ctx.rebuild();
    return this;
  }

  insertGlyph(index, code, opts) {
    if (this.#level !== 'group') return this;
    const group = this.#nodeRef;
    if (!group) return this;
    const newGlyph = this.#parseGlyph(code);
    this.#applyDefaultsOverrides(newGlyph, opts);
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.splice(index, 0, newGlyph);
    this.#ctx.rebuild();
    return this;
  }

  addPart(code, opts) {
    if (this.#level !== 'glyph') return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    const newPart = this.#parsePart(code);
    this.#applyDefaultsOverrides(newPart, opts);
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.push(newPart);
    this.#ctx.rebuild();
    return this;
  }

  insertPart(index, code, opts) {
    if (this.#level !== 'glyph') return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    const newPart = this.#parsePart(code);
    this.#applyDefaultsOverrides(newPart, opts);
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.splice(index, 0, newPart);
    this.#ctx.rebuild();
    return this;
  }

  // --- Mutation: remove ---

  remove() {
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

  // --- Mutation: replace ---

  replace(code, opts) {
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
      return this;
    }

    return this;
  }

  // --- Mutation: options ---

  setOptions(options) {
    const node = this.#nodeRef;
    if (!node) return this;
    const rawOpts = this.#ctx.toRaw(options);
    node.options = { ...(node.options ?? {}), ...rawOpts };
    this.#ctx.rebuild();
    return this;
  }

  removeOptions(...keys) {
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
    return this;
  }
}
