/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { camelToKebab } from "./bliss-constants.js";

/**
 * A lightweight handle that references a position in `#rawBlissObj`.
 * Survives `#rebuild()` because it references by position, not identity.
 */
export class ElementHandle {
  #ctx;
  #level;
  #path;

  constructor(ctx, level, path) {
    this.#ctx = ctx;
    this.#level = level;
    this.#path = path;
  }

  get level() {
    return this.#level;
  }

  // Navigate to the target node in #rawBlissObj
  #resolveNode() {
    const raw = this.#ctx.getRaw();
    const groups = raw.groups;
    const { groupIndex, glyphIndex, partIndex } = this.#path;

    const group = groups[groupIndex];
    if (!group) return null;
    if (this.#level === 'group') return group;

    const glyph = group.glyphs?.[glyphIndex];
    if (!glyph) return null;
    if (this.#level === 'glyph') return glyph;

    const part = glyph.parts?.[partIndex];
    return part ?? null;
  }

  // Parse a DSL code string and extract the first glyph from the result
  #parseGlyph(code) {
    const parsed = this.#ctx.parse(code);
    return parsed.groups?.[0]?.glyphs?.[0] ?? null;
  }

  // Parse a DSL code string in part context by embedding it in a helper glyph.
  // This ensures composite codes like B303 get proper nested parts expansion.
  #parsePart(code) {
    const parsed = this.#ctx.parse(`H;${code}`);
    const glyph = parsed.groups?.[0]?.glyphs?.[0];
    // Return the second part (the one we added), not the helper H
    return glyph?.parts?.[1] ?? null;
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
    const group = this.#resolveNode();
    if (!group?.glyphs?.length) return null;

    // Find the head glyph via the snapshot tree
    const snap = this.#ctx.getSnapshot();
    const groupSnap = snap.children[this.#path.groupIndex];
    if (!groupSnap) return null;

    const glyphs = groupSnap.children.filter(c => c.type === 'glyph');
    const headIndex = glyphs.findIndex(g => g.isHeadGlyph);
    const index = headIndex >= 0 ? headIndex : 0;

    if (index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 'glyph', {
      groupIndex: this.#path.groupIndex,
      glyphIndex: index
    });
  }

  glyph(index) {
    if (this.#level !== 'group') return null;
    const group = this.#resolveNode();
    if (!group?.glyphs || index < 0 || index >= group.glyphs.length) return null;
    return new ElementHandle(this.#ctx, 'glyph', {
      groupIndex: this.#path.groupIndex,
      glyphIndex: index
    });
  }

  part(index) {
    if (this.#level === 'glyph') {
      const glyph = this.#resolveNode();
      if (!glyph?.parts || index < 0 || index >= glyph.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', {
        groupIndex: this.#path.groupIndex,
        glyphIndex: this.#path.glyphIndex,
        partIndex: index
      });
    }
    if (this.#level === 'part') {
      // Recursive part navigation for nested parts (future)
      const part = this.#resolveNode();
      if (!part?.parts || index < 0 || index >= part.parts.length) return null;
      return new ElementHandle(this.#ctx, 'part', {
        ...this.#path,
        partIndex: index
      });
    }
    return null;
  }

  // --- Mutation: add/insert ---

  addGlyph(code, opts) {
    if (this.#level !== 'group') return this;
    const group = this.#resolveNode();
    if (!group) return this;
    const newGlyph = this.#parseGlyph(code);
    if (!newGlyph) return this;
    this.#applyDefaultsOverrides(newGlyph, opts);
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.push(newGlyph);
    this.#ctx.rebuild();
    return this;
  }

  insertGlyph(index, code, opts) {
    if (this.#level !== 'group') return this;
    const group = this.#resolveNode();
    if (!group) return this;
    const newGlyph = this.#parseGlyph(code);
    if (!newGlyph) return this;
    this.#applyDefaultsOverrides(newGlyph, opts);
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.splice(index, 0, newGlyph);
    this.#ctx.rebuild();
    return this;
  }

  addPart(code, opts) {
    if (this.#level !== 'glyph') return this;
    const glyph = this.#resolveNode();
    if (!glyph) return this;
    const newPart = this.#parsePart(code);
    if (!newPart) return this;
    this.#applyDefaultsOverrides(newPart, opts);
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.push(newPart);
    this.#ctx.rebuild();
    return this;
  }

  insertPart(index, code, opts) {
    if (this.#level !== 'glyph') return this;
    const glyph = this.#resolveNode();
    if (!glyph) return this;
    const newPart = this.#parsePart(code);
    if (!newPart) return this;
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
    const { groupIndex, glyphIndex, partIndex } = this.#path;

    if (this.#level === 'part') {
      const glyph = groups[groupIndex]?.glyphs?.[glyphIndex];
      if (!glyph?.parts) return undefined;
      glyph.parts.splice(partIndex, 1);
      // Cascade: last part → remove glyph
      if (glyph.parts.length === 0) {
        return this.#removeGlyphAt(groups, groupIndex, glyphIndex);
      }
      this.#ctx.rebuild();
      return undefined;
    }

    if (this.#level === 'glyph') {
      return this.#removeGlyphAt(groups, groupIndex, glyphIndex);
    }

    if (this.#level === 'group') {
      this.#ctx.removeWordGroup(raw, groupIndex);
      this.#ctx.rebuild();
      return undefined;
    }

    return undefined;
  }

  #removeGlyphAt(groups, groupIndex, glyphIndex) {
    const raw = this.#ctx.getRaw();
    const group = groups[groupIndex];
    if (!group?.glyphs) return undefined;
    group.glyphs.splice(glyphIndex, 1);
    // Cascade: last glyph → remove group + space
    if (group.glyphs.length === 0) {
      this.#ctx.removeWordGroup(raw, groupIndex);
    }
    this.#ctx.rebuild();
    return undefined;
  }

  // --- Mutation: replace ---

  replace(code, opts) {
    const raw = this.#ctx.getRaw();
    const groups = raw.groups;
    const { groupIndex, glyphIndex, partIndex } = this.#path;

    if (this.#level === 'glyph') {
      const group = groups[groupIndex];
      if (!group?.glyphs) return this;
      const newGlyph = this.#parseGlyph(code);
      if (!newGlyph) return this;
      this.#applyDefaultsOverrides(newGlyph, opts);
      group.glyphs[glyphIndex] = newGlyph;
      this.#ctx.rebuild();
      return this;
    }

    if (this.#level === 'part') {
      const glyph = groups[groupIndex]?.glyphs?.[glyphIndex];
      if (!glyph?.parts) return this;
      const newPart = this.#parsePart(code);
      if (!newPart) return this;
      this.#applyDefaultsOverrides(newPart, opts);
      glyph.parts[partIndex] = newPart;
      this.#ctx.rebuild();
      return this;
    }

    return this;
  }

  // --- Mutation: options ---

  setOptions(options) {
    const node = this.#resolveNode();
    if (!node) return this;
    const rawOpts = this.#ctx.toRaw(options);
    node.options = { ...(node.options ?? {}), ...rawOpts };
    this.#ctx.rebuild();
    return this;
  }

  removeOptions(...keys) {
    const node = this.#resolveNode();
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
