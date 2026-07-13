/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { camelToKebab, WARNING_CODES } from "./bliss-constants.js";
import { builtInCodes, blissElementDefinitions } from "./bliss-element-definitions.js";
import { resolveIndicatorCodes, classifyIndicatorKind, filterToIndicators, partitionWordIndicators, resolveWordIndicatorOverlay, splitTopLevelSemicolons } from "./indicator-utils.js";

// Shared arg guard for the mutation families: a code arg is a string or omitted.
export function assertCodeArg(method, code) {
  if (code !== undefined && typeof code !== 'string') {
    throw new TypeError(`${method}() requires a DSL code string`);
  }
}

// Shared arg guard for the mutation families: an opts arg is a plain options
// object or omitted. Nullish (undefined/null) means "no options"; a string,
// number, boolean, or array is a designed error. Thrown beside assertCodeArg,
// before any parse or warning-forward, so a rejected opts never leaks the
// code's parse-time warnings and never leaves the builder half-mutated.
export function assertOptsArg(method, opts) {
  if (opts == null) return;
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError(`${method}() options must be an object`);
  }
}

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
    const node = this.#nodeRef;
    if (!node) return '';

    // Glyph level: the input code that produces this glyph, when it is
    // actually a glyph. Empty string for composites, bare shape primitives,
    // and multi-char text fallback. The presence of glyphCode IS the
    // "this is a glyph" signal (set by the parser for B-codes, X-codes,
    // single-char text fallback, and define()d 'glyph'-type aliases).
    // For single-char text fallback the internal routing key 'XTXT_<char>'
    // is surfaced publicly as 'X<char>'. Mirrors the rule in BlissElement.
    if (this.#level === 2) {
      if (typeof node.glyphCode === 'string') {
        return node.glyphCode.startsWith('XTXT_')
          ? 'X' + node.glyphCode.slice(5)
          : node.glyphCode;
      }
      return '';
    }

    // Part level: structural lookup key. Group level: groups have no
    // codeName field on their data object, so this returns ''.
    // For text-fallback parts the internal routing key 'XTXT_<chars>' is
    // surfaced publicly as 'X<chars>'.
    const code = node.codeName ?? '';
    return code.startsWith('XTXT_') ? 'X' + code.slice(5) : code;
  }

  get char() {
    this.#assertReachable();
    return this.#nodeRef?.char ?? '';
  }

  get isIndicator() {
    this.#assertReachable();
    if (this.#level !== 3) return false;
    return this.#nodeRef?.isIndicator === true;
  }

  /**
   * Indicator origin level for a part handle: 'character' for an indicator
   * part, or null for a non-indicator or non-part handle. Read off the raw
   * node (like isIndicator), NOT via the snapshot: a handle references a raw
   * node, and a word-level overlay (`;;`) has no raw node (OQ1), so a handle
   * can only ever surface 'character' here — 'word' is introspected on
   * `snapshot()`. Reading the node also avoids the snapshot's positional
   * lookup, which an overlay-merged head reorders and which cannot resolve a
   * nested sub-part (so this never throws and always describes THIS node).
   * @returns {'character'|'word'|null}
   */
  get indicatorLevel() {
    this.#assertReachable();
    if (this.#level !== 3 || this.#nodeRef?.isIndicator !== true) return null;
    return 'character';
  }

  /**
   * Indicator kind for a part handle: 'semantic' (the definition carries a
   * semanticIndicator) or 'grammatical', null for a non-indicator part, a
   * non-part handle, or a part whose definition cannot be resolved. Read off
   * the raw node via the shared classifier (same logic as the snapshot).
   * @returns {'semantic'|'grammatical'|null}
   */
  get indicatorKind() {
    this.#assertReachable();
    if (this.#level !== 3 || this.#nodeRef?.isIndicator !== true) return null;
    return classifyIndicatorKind(this.#nodeRef.codeName, blissElementDefinitions);
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
      // Map to the snapshot part by identity, not raw position: a `;;` word
      // overlay on a head injects and reorders the resolved indicator parts
      // (semantic-root preservation), so the raw partIndex no longer aligns with
      // the snapshot array. Both a base part and (since N14-2) a reordered
      // character-level `;` indicator keep their object key through the merge, so
      // match by key. The by-code match is a defensive fallback for a keyless
      // node (e.g. a deep nested sub-part that #assignKeys does not key). Fall
      // back to position when nothing matches (no overlay).
      const node = this.#nodeRef;
      const parts = glyphSnap.children;
      if (node?.key != null) {
        const byKey = parts.find(c => c.key === node.key);
        if (byKey) return byKey;
      }
      if (node?.isIndicator === true) {
        const byCode = parts.find(c => c.isIndicator === true && c.codeName === node.codeName);
        if (byCode) return byCode;
      }
      return parts[idx.partIndex];
    }

    throw new Error(`Unsupported handle level: ${this.#level}`);
  }

  get x() { return this.#findSnapshot().x; }
  get y() { return this.#findSnapshot().y; }
  get offsetX() { return this.#findSnapshot().offsetX; }
  get offsetY() { return this.#findSnapshot().offsetY; }
  get width() { return this.#findSnapshot().width; }
  get height() { return this.#findSnapshot().height; }
  get bounds() { return this.#findSnapshot().bounds; }
  get advanceX() { return this.#findSnapshot().advanceX; }
  get baseWidth() { return this.#findSnapshot().baseWidth; }

  // --- Identity (read-only, from snapshot) ---

  get key() { return this.#findSnapshot().key; }

  // --- Content flags (read-only, from snapshot) ---

  get isShape() { return this.#findSnapshot().isShape; }
  get isBlissGlyph() { return this.#findSnapshot().isBlissGlyph; }
  get isExternalGlyph() { return this.#findSnapshot().isExternalGlyph; }
  get isHeadGlyph() { return this.#findSnapshot().isHeadGlyph; }
  get isSpaceGroup() { return this.#findSnapshot().isSpaceGroup; }

  measure() {
    const snap = this.#findSnapshot();
    return Object.freeze({
      x: snap.x,
      y: snap.y,
      offsetX: snap.offsetX,
      offsetY: snap.offsetY,
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

  // Surface a mutation parse's warnings on the builder's persistent mutation
  // channel. The parse result is otherwise discarded, which would make a
  // parser-side drop (e.g. the global-only option key gate) silent when the
  // string arrives through the API instead of the constructor.
  #forwardParseWarnings(parsed) {
    for (const warning of parsed?._parseWarnings ?? []) {
      this.#ctx.addMutationWarning(warning);
    }
  }

  // Parse a mutation arg in glyph context: exactly one glyph, no document or
  // word-level artifacts (document options, a fail flag, word options, or a
  // word indicator list belong above the glyph). Empty/omitted means a
  // deliberate empty glyph ({parts: []}). Warnings forward only when the arg
  // is accepted.
  #parseGlyphArg(code) {
    if (code === undefined || code.trim() === '') return { parts: [] };
    const parsed = this.#ctx.parse(code);
    const groupCount = parsed.groups?.length ?? 0;
    if (groupCount !== 1) {
      throw new Error(`Expected a single group, but code "${code}" produced ${groupCount} groups`);
    }
    // An empty "||" prefix sets no options and stays plain content.
    if (Object.keys(parsed.options ?? {}).length > 0) {
      throw new Error(`Code "${code}" carries document-level options ("[opts]||"). Set document options on the builder input, or style the glyph itself ("[opts]CODE" or the opts parameter)`);
    }
    const group = parsed.groups[0];
    if (group.errorCode !== undefined) {
      throw new Error(`Code "${code}" is not a single valid glyph (it fails as a word: ${group.errorCode}). Fix the code, or use addGroup() to work with whole words`);
    }
    if (group.options) {
      throw new Error(`Code "${code}" carries word-level options ("[opts]|"). Style the glyph itself ("[opts]CODE" or the opts parameter), or use addGroup() for word content`);
    }
    if (group.wordIndicators) {
      throw new Error(`Code "${code}" carries a word-level indicator list (";;"). Use applyIndicators() on the word, or addGroup() for word content`);
    }
    const glyphs = group.glyphs ?? [];
    if (glyphs.length !== 1) {
      throw new Error(`Expected a single glyph, but code "${code}" produced ${glyphs.length} glyphs`);
    }
    this.#forwardParseWarnings(parsed);
    return glyphs[0];
  }

  // Parse a mutation arg in part context: exactly one part. A word
  // (multi-glyph code) keeps the existing WORD_AS_PART error-part contract.
  // Empty/omitted throws: a part references a shape and has no empty form
  // (unlike group/glyph containers). Warnings forward only when the arg is
  // accepted.
  #parsePartArg(code) {
    if (code === undefined || code.trim() === '') {
      throw new Error('Expected a single part, but code "" produced none. '
        + 'A part is a reference to a shape and cannot be empty; '
        + 'to reserve an empty slot, use addGlyph("") for an empty glyph.');
    }
    const rawParsed = this.#ctx.parse(code);
    const groupCount = rawParsed.groups?.length ?? 0;
    if (groupCount !== 1) {
      throw new Error(`Expected parts within a single group, but code "${code}" produced ${groupCount} groups`);
    }
    const rawGroup = rawParsed.groups[0];
    if (!rawGroup.glyphs || rawGroup.glyphs.length === 0) {
      throw new Error(`Expected a single part, but code "${code}" produced no glyphs`);
    }
    if (rawGroup.glyphs.length > 1) {
      // Multi-glyph code is a word: words cannot be composed with ;
      return { codeName: code, error: `"${code}" is a word and cannot be composed with ;`, errorCode: 'WORD_AS_PART' };
    }
    // A single-glyph arg must not smuggle artifacts from above the part
    // level: the helper embedding below would silently launder them away
    // (document/word options, a word indicator list, a fail flag, or a head
    // marker all describe something a part cannot carry). Words take the
    // WORD_AS_PART route above instead, artifacts and all.
    if (Object.keys(rawParsed.options ?? {}).length > 0) {
      throw new Error(`Code "${code}" carries document-level options ("[opts]||"). Set document options on the builder input, or style the part itself ("[opts]>CODE" or the opts parameter)`);
    }
    if (rawGroup.options) {
      throw new Error(`Code "${code}" carries word-level options ("[opts]|"). Style the part itself ("[opts]>CODE" or the opts parameter), or use addGroup() for word content`);
    }
    if (rawGroup.wordIndicators) {
      throw new Error(`Code "${code}" carries a word-level indicator list (";;"). Use applyIndicators() on the word, or addGroup() for word content`);
    }
    if (rawGroup.errorCode !== undefined) {
      throw new Error(`Code "${code}" is not a single valid part (it fails as a word: ${rawGroup.errorCode}). Fix the code, or use addGroup() to work with whole words`);
    }
    if (rawGroup.glyphs[0].isHeadGlyph) {
      throw new Error(`Code "${code}" carries a head marker ("^"). A head marker belongs on a character: pass it to the glyph methods ("CODE^"), or use addGroup() for word content`);
    }
    // Single glyph: helper-glyph embedding for proper part-level expansion.
    // Forward only THIS parse's warnings (the raw parse above ran the same
    // gates; forwarding both would double-warn).
    const parsed = this.#ctx.parse(`H;${code}`);
    const glyph = parsed.groups?.[0]?.glyphs?.[0];
    const parts = glyph?.parts?.length >= 2
      ? glyph.parts.slice(1)
      : (rawGroup.glyphs[0].parts || []);
    if (parts.length !== 1) {
      throw new Error(`Expected a single part, but code "${code}" produced ${parts.length} parts`);
    }
    this.#forwardParseWarnings(parsed);
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
    const merged = { ...rawDefaults, ...(node.options ?? {}), ...rawOverrides };
    // An empty opts (e.g. {}) resolves to no keys: don't stamp a bare
    // options:{} onto the node, which would be toJSON noise.
    if (Object.keys(merged).length > 0) node.options = merged;
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

  // A fail-flagged word (malformed `;;` sets group.errorCode) is TERMINAL: it
  // renders as a single placeholder and toString replays its stored
  // errorSource verbatim, so a content mutation inside it would change the
  // live tree while the serialized form stays frozen (toJSON/toString
  // divergence, round-2 external review F5). Every content mutator no-ops on
  // it — SILENTLY, matching the shipped splitAt/mergeWithNext terminal arms —
  // whether it targets the group handle or a child glyph/part handle inside.
  // Recovery: replaceGroup, or removing the whole word (group detach/remove).
  // Group-level setOptions/removeOptions are exempt: group options serialize
  // OUTSIDE the error source (`[opts]|errorSource`) and round-trip.
  #inFailFlaggedGroup() {
    if (this.#level === 1) return this.#nodeRef?.errorCode !== undefined;
    if (this.#level === 2) return this.#parentRef?.errorCode !== undefined;
    if (this.#level === 3) return this.#parentRef?.group?.errorCode !== undefined;
    return false;
  }

  addGlyph(code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup. Gated here too
    // (not only in the insertGlyph delegate) so the silent no-op wins over
    // the argument guard below, per the validation ordering rule.
    if (group.errorCode) return this;
    assertCodeArg('addGlyph', code);
    assertOptsArg('addGlyph', opts);
    return this.insertGlyph(group.glyphs?.length ?? 0, code, opts);
  }

  insertGlyph(index, code, opts) {
    this.#assertReachable();
    if (this.#level !== 1) return this;
    const group = this.#nodeRef;
    if (!group) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (group.errorCode) return this;
    assertCodeArg('insertGlyph', code);
    assertOptsArg('insertGlyph', opts);
    const newGlyph = this.#parseGlyphArg(code);
    this.#applyDefaultsOverrides(newGlyph, opts);
    if (!group.glyphs) group.glyphs = [];
    group.glyphs.splice(index, 0, newGlyph);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // A glyph recomposed by part mutation is no longer the single code it was
  // parsed from, so drop its glyph-level identity and let toString() serialize
  // the individual parts instead of the stale code. No-op on a glyph that never
  // had identity (an inline composite carries no glyphCode to begin with).
  #clearGlyphIdentity(glyph) {
    delete glyph.isBlissGlyph;
    delete glyph.codeName;
    delete glyph.glyphCode;
  }

  // Level-1 addPart/insertPart on a group with zero glyphs: create a carrier
  // glyph so the part is not silently dropped (mirrors the empty-builder
  // routing one level down). Parses BEFORE any state change so a rejected
  // arg leaves the group untouched.
  #fillEmptyGroupWithPart(group, method, code, opts) {
    assertCodeArg(method, code);
    assertOptsArg(method, opts);
    const newPart = this.#parsePartArg(code);
    this.#applyDefaultsOverrides(newPart, opts);
    group.glyphs = [{ parts: [newPart] }];
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  addPart(code, opts) {
    this.#assertReachable();
    // Group level: delegate to last glyph
    if (this.#level === 1) {
      const group = this.#nodeRef;
      if (!group) return this;
      // Terminal fail-flagged word: see #inFailFlaggedGroup.
      if (group.errorCode) return this;
      if (!group.glyphs?.length) {
        return this.#fillEmptyGroupWithPart(group, 'addPart', code, opts);
      }
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 2, lastGlyph, group);
      glyphHandle.addPart(code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    // Terminal fail-flagged word: gated here too (not only in the insertPart
    // delegate) so the silent no-op wins over the argument guard below, per
    // the validation ordering rule.
    if (this.#inFailFlaggedGroup()) return this;
    assertCodeArg('addPart', code);
    assertOptsArg('addPart', opts);
    return this.insertPart(glyph.parts?.length ?? 0, code, opts);
  }

  insertPart(index, code, opts) {
    this.#assertReachable();
    // Group level: delegate to last glyph
    if (this.#level === 1) {
      const group = this.#nodeRef;
      if (!group) return this;
      // Terminal fail-flagged word: see #inFailFlaggedGroup.
      if (group.errorCode) return this;
      if (!group.glyphs?.length) {
        // The index is irrelevant for a first part.
        return this.#fillEmptyGroupWithPart(group, 'insertPart', code, opts);
      }
      const lastGlyph = group.glyphs[group.glyphs.length - 1];
      const glyphHandle = new ElementHandle(this.#ctx, 2, lastGlyph, group);
      glyphHandle.insertPart(index, code, opts);
      this.#syncGeneration();
      return this;
    }
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup. Defense-in-depth
    // for the group-handle delegation forms, which gate at level 1 already.
    if (this.#inFailFlaggedGroup()) return this;
    assertCodeArg('insertPart', code);
    assertOptsArg('insertPart', opts);
    const newPart = this.#parsePartArg(code);
    this.#applyDefaultsOverrides(newPart, opts);
    if (!glyph.parts) glyph.parts = [];
    glyph.parts.splice(index, 0, newPart);
    this.#clearGlyphIdentity(glyph);
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
    // Terminal fail-flagged word: child content cannot be detached (see
    // #inFailFlaggedGroup); detaching the WHOLE word (level 1) stays allowed —
    // removal of the unit is consistent with its frozen serialization.
    if (this.#level !== 1 && this.#inFailFlaggedGroup()) return undefined;

    if (this.#level === 3) {
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return undefined;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return undefined;
      glyph.parts.splice(partIndex, 1);
      // A glyph recomposed by part removal is no longer the single code it was
      // parsed from; drop its cached identity so an emptied glyph does not
      // re-emit a phantom codeName from toString (mirrors insertPart). N16.
      this.#clearGlyphIdentity(glyph);
      // An EMPTIED glyph serializes to nothing, so a head designation on it
      // would live only in toJSON while toString dropped it (round-2 external
      // review F4): the designation dies visibly with its glyph's content.
      // detach is the only mutation that leaves an empty glyph in the tree
      // (remove/removePart cascade the whole glyph away).
      if (glyph.parts.length === 0) delete glyph.isHeadGlyph;
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
    // Terminal fail-flagged word: mirrors detach — child removal no-ops,
    // whole-word removal (level 1) stays allowed.
    if (this.#level !== 1 && this.#inFailFlaggedGroup()) return undefined;
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
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (group.errorCode) return this;
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
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (this.#inFailFlaggedGroup()) return this;
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
    if (!group) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (group.errorCode) return this;
    assertCodeArg('replaceGlyph', code);
    assertOptsArg('replaceGlyph', opts);
    if (!group.glyphs?.length) return this;
    if (index < 0) index = group.glyphs.length + index;
    if (!Number.isInteger(index) || index < 0 || index >= group.glyphs.length) return this;
    const newGlyph = this.#parseGlyphArg(code);
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
    if (!glyph) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (this.#inFailFlaggedGroup()) return this;
    assertCodeArg('replacePart', code);
    assertOptsArg('replacePart', opts);
    if (!glyph.parts?.length) return this;
    if (index < 0) index = glyph.parts.length + index;
    if (!Number.isInteger(index) || index < 0 || index >= glyph.parts.length) return this;
    const newPart = this.#parsePartArg(code);
    this.#applyDefaultsOverrides(newPart, opts);
    glyph.parts[index] = newPart;
    this.#clearGlyphIdentity(glyph);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: self-centric replace ---

  replace(code, opts) {
    this.#assertReachable();
    // Terminal fail-flagged word: see #inFailFlaggedGroup (levels 2/3 only;
    // there is no level-1 replace arm — replaceGroup is the recovery).
    if (this.#inFailFlaggedGroup()) return this;
    if (this.#level === 2) {
      assertCodeArg('replace', code);
      assertOptsArg('replace', opts);
      const group = this.#parentRef;
      if (!group?.glyphs) return this;
      const glyphIndex = group.glyphs.indexOf(this.#nodeRef);
      if (glyphIndex < 0) return this;
      const newGlyph = this.#parseGlyphArg(code);
      this.#applyDefaultsOverrides(newGlyph, opts);
      group.glyphs[glyphIndex] = newGlyph;
      this.#nodeRef = newGlyph;
      this.#ctx.rebuild();
      this.#syncGeneration();
      return this;
    }

    if (this.#level === 3) {
      assertCodeArg('replace', code);
      assertOptsArg('replace', opts);
      const glyph = this.#parentRef.glyph;
      if (!glyph?.parts) return this;
      const partIndex = glyph.parts.indexOf(this.#nodeRef);
      if (partIndex < 0) return this;
      const newPart = this.#parsePartArg(code);
      this.#applyDefaultsOverrides(newPart, opts);
      glyph.parts[partIndex] = newPart;
      this.#clearGlyphIdentity(glyph);
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
    // A non-string, non-nullish code is a type error, not DSL content. Without
    // this guard it would tokenize to zero codes and silently store the
    // render-significant empty overlay (external review F2).
    if (code !== undefined && code !== null && typeof code !== 'string') {
      throw new TypeError('applyIndicators() code must be a string (or omitted for the empty indicator set).');
    }
    // An empty request (no argument, '', or whitespace-only) is the deliberate
    // spelling of the EMPTY indicator set, not an error: a group handle stores
    // the empty `;;` overlay (hides the head's character-level indicators,
    // adds none); a glyph handle gets the same state effect as
    // clearIndicators() (a bare base stays a harmless no-op, like a trailing
    // `;` in the DSL). stripSemantic lives on apply only, so
    // applyIndicators('', { stripSemantic: true }) is the strip spelling
    // (formerly clearIndicators({ stripSemantic: true })).
    const normalized = (code === undefined || code === null || code.trim() === '') ? '' : code;
    // Group handle (level 1): word-level overlay channel. Glyph handle
    // (level 2): character-level parts. Other levels: no-op via the level-2 path.
    if (this.#level === 1) return this.#applyOrClearWordIndicators(normalized, opts);
    return this.#applyOrClearIndicators(normalized, opts);
  }

  clearIndicators(opts) {
    this.#assertReachable();
    // Clear is the PURE UNDO: it only removes (the `;;` overlay on a group
    // handle, baked grammatical indicators on a glyph handle) and takes no
    // stripSemantic (both #applyOrClear* paths force it off for a clear).
    if (this.#level === 1) return this.#applyOrClearWordIndicators(null, opts);
    return this.#applyOrClearIndicators(null, opts);
  }

  // `suppressNoop` is set by the flatten-clear delegation when it has already
  // removed a `;;` overlay: that removal is the real effect, so a char-level
  // no-op here is not an overall no-op and must not be reported. It is a private
  // positional argument (not an opts key) so it is unreachable from the public
  // applyIndicators/clearIndicators surface.
  #applyOrClearIndicators(code, opts, suppressNoop = false) {
    if (this.#level !== 2) return this;
    const glyph = this.#nodeRef;
    if (!glyph) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup. (The flatten
    // delegation cannot reach here for a flagged group — the word-level path
    // gates first.)
    if (this.#inFailFlaggedGroup()) return this;
    if (!glyph.parts) glyph.parts = [];

    const definitions = this.#ctx.getDefinitions();
    // stripSemantic is an apply-only option: a clear (code === null) is the
    // pure undo and never strips the semantic root.
    const stripSemantic = code !== null && opts?.stripSemantic === true;
    const targetCode = glyph.codeName || glyph.parts[0]?.codeName || 'unknown';

    // A space glyph is not a base for indicators. Under the i>0 rule its single
    // part would otherwise classify as a base, so carve it out and keep the
    // no-op + warning (R15 Task 5).
    if (this.#ctx.isRawSpaceGroup(this.#parentRef)) {
      if (!suppressNoop) {
        const verb = code === null ? 'clearIndicators()' : `applyIndicators('${code}')`;
        // `||` deliberately (not `??`): the empty apply's '' must fall back to
        // the target code, never become an empty source (external review F4).
        this.#warnIndicatorNoop(
          `${verb} had no effect: the target glyph '${targetCode}' is a space.`,
          code || targetCode,
        );
      }
      return this;
    }

    // Classify parts: the first part is always the base (even when it is itself
    // an indicator), so scan for the first TRAILING indicator from index 1.
    // Mirrors mergeWordIndicatorsOntoHead, so a lone indicator or an empty glyph
    // carries a further indicator rather than no-opping (the atypical-base
    // contract, R15 Task 5).
    const firstIndicatorIndex = glyph.parts.findIndex((p, i) => i > 0 && p.isIndicator === true);

    let baseParts, indicatorParts;
    if (firstIndicatorIndex === -1) {
      baseParts = glyph.parts;
      indicatorParts = [];
    } else {
      baseParts = glyph.parts.slice(0, firstIndicatorIndex);
      indicatorParts = glyph.parts.slice(firstIndicatorIndex);
    }

    // Validate pattern: no non-indicators after the first indicator
    const isValidPattern = indicatorParts.every(p => p.isIndicator === true);
    if (!isValidPattern) {
      if (!suppressNoop) {
        const verb = code === null ? 'clearIndicators()' : `applyIndicators('${code}')`;
        // `||` deliberately (not `??`): see the space-glyph arm above (F4).
        this.#warnIndicatorNoop(
          `${verb} had no effect: the target glyph '${targetCode}' has a non-indicator part after an indicator part (an invalid indicator pattern).`,
          code || targetCode,
        );
      }
      return this;
    }

    // Extract existing indicator codes for semantic analysis
    const existingIndCodes = indicatorParts.map(p => p.codeName);

    // Determine the final indicator code list (replace-all with semantic
    // preservation; clearIndicators passes no new codes), then parse each
    // into a proper part node with metadata.
    const requestedCodes = code !== null ? splitTopLevelSemicolons(code) : [];

    // A character-level indicator slot takes indicators only (the same rule,
    // one level down, as the group `;;` overlay path — shared classifier for
    // parity). Each rejected code warns individually on the persistent
    // mutation channel; this REPLACES the old single "applied no indicator"
    // no-op arm (strictly more informative: it names each offending code even
    // when the valid subset makes the call a real mutation). A code carrying
    // word structure (a top-level `/`, hidden from the bare-code classifier
    // behind a coordinate suffix) can never be a single indicator part, so it
    // is rejected too. The surviving codes are then PARSED BEFORE the glyph is
    // touched: a code whose decoration fails to parse (e.g. `B81:bad`) yields
    // only a codeName-less error part, so it is excluded — the forwarded parse
    // warnings (MALFORMED_COORDINATES etc.) are its visibility channel. An
    // apply left with NOTHING attachable REFUSES: explicit failed content is
    // not deliberate emptiness (that spelling is applyIndicators('')), so the
    // existing indicators stay untouched and nothing strips as a side effect
    // (parity with the group overlay's null-resolver refuse arm; round-2
    // external review F2).
    let attachableEntries = [];
    if (code !== null && requestedCodes.length > 0) {
      const { valid, rejected } = partitionWordIndicators(requestedCodes, definitions);
      for (const { code: badCode, reason } of rejected) {
        this.#ctx.addMutationWarning(reason === 'word-structure'
          ? {
              code: WARNING_CODES.MISPLACED_CHARACTER_INDICATOR,
              message: `applyIndicators('${code}'): "${badCode}" spans multiple characters (it contains a top-level /); a character-level indicator code must be a single indicator. It cannot be applied.`,
              source: badCode,
            }
          : reason === 'non-indicator'
            ? {
                code: WARNING_CODES.NON_INDICATOR_AS_CHARACTER_INDICATOR,
                message: `applyIndicators('${code}'): "${badCode}" is not an indicator; it cannot be applied. A character-level indicator code must be an indicator (e.g. B81).`,
                source: badCode,
              }
            : {
                code: WARNING_CODES.UNKNOWN_CODE,
                message: `applyIndicators('${code}'): unknown indicator code "${badCode}"; it cannot be applied.`,
                source: badCode,
              });
      }
      for (const validCode of valid) {
        const parsed = this.#ctx.parse(validCode);
        this.#forwardParseWarnings(parsed);
        const glyphs = parsed.groups?.length === 1 ? parsed.groups[0].glyphs : null;
        const parts = glyphs?.length === 1 ? glyphs[0].parts : null;
        if (parts?.length > 0 && parts.every(p => p.isIndicator === true)) {
          attachableEntries.push({ code: validCode, parts });
        } else {
          // An error part's warning used to surface at render, AFTER it was
          // already inserted; the part is now never inserted, so its parse
          // error (e.g. MALFORMED_COORDINATES) is re-emitted on the mutation
          // channel as the excluded code's visibility.
          const errorPart = parts?.find(p => p.errorCode);
          const detail = errorPart?.error ? ` (${errorPart.error})` : '';
          this.#ctx.addMutationWarning({
            code: errorPart?.errorCode ?? WARNING_CODES.UNKNOWN_CODE,
            message: `applyIndicators('${code}'): "${validCode}" cannot be applied as an indicator part${detail}.`,
            source: validCode,
          });
        }
      }
      if (attachableEntries.length === 0) return this;
    }

    const finalCodes = resolveIndicatorCodes(existingIndCodes, attachableEntries.map(e => e.code), { stripSemantic }, definitions);

    // D4: a clear with no indicator parts had nothing to remove. (A clear that
    // preserves a semantic root is a documented no-op and is intentionally not
    // warned. The apply-side "applied no indicator" arm is gone: the per-code
    // validation warnings above cover every rejected apply code.)
    if (!suppressNoop) {
      if (code === null && indicatorParts.length === 0) {
        this.#warnIndicatorNoop(
          `clearIndicators() had no effect: the target glyph '${targetCode}' has no indicators to clear.`,
          targetCode,
        );
      }
    }

    // Assemble the new indicator parts. A requested code reuses the part
    // nodes from its validation parse above (parsing again would forward its
    // warnings twice); a code the resolver added back (the preserved semantic
    // root) parses fresh. Entries are consumed in order so a duplicated
    // requested code yields distinct part nodes.
    const newIndicatorParts = [];
    for (const indCode of finalCodes) {
      const entryIndex = attachableEntries.findIndex(e => e.code === indCode);
      if (entryIndex !== -1) {
        newIndicatorParts.push(...attachableEntries.splice(entryIndex, 1)[0].parts);
        continue;
      }
      const parsed = this.#ctx.parse(indCode);
      this.#forwardParseWarnings(parsed);
      const partNode = parsed.groups?.[0]?.glyphs?.[0]?.parts?.[0];
      if (partNode) newIndicatorParts.push(partNode);
    }

    // Reassemble glyph parts
    glyph.parts = [...baseParts, ...newIndicatorParts];

    // Update glyph identity
    this.#updateGlyphIdentityAfterIndicatorChange(glyph, definitions);

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // D4: emit a mutation warning (one per no-op call) when an indicator
  // apply/clear had no effect. Uses the persistent mutation-warning channel
  // (survives #rebuild), not the parse `#warnings` (which resets each rebuild).
  #warnIndicatorNoop(message, source) {
    this.#ctx.addMutationWarning({
      code: WARNING_CODES.NOOP_INDICATOR_MUTATION,
      message,
      source,
    });
  }

  #updateGlyphIdentityAfterIndicatorChange(glyph, definitions) {
    // A custom (non-built-in) Bliss glyph keeps its identity through indicator
    // changes so { preserve: true } can re-emit the delta against the baked
    // definition state, matching the DSL replacement path (DSL/API parity).
    // Built-in glyphs decompose, so they fall through to the reset logic below.
    if (glyph.isBlissGlyph === true
        && typeof glyph.glyphCode === 'string'
        && !builtInCodes.has(glyph.glyphCode)) {
      return;
    }
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

  // Word-level indicator channel for a group handle. Sets/clears the reversible
  // `group.wordIndicators` overlay (the DSL `;;` form), leaving the base glyphs
  // intact so a later clear restores them (N12). `flatten` opts out of the
  // overlay and bakes onto the head as character-level parts instead (the
  // pre-overlay, character-level shape). `code` is null for clear, '' for the
  // deliberate empty apply (== the DSL's bare `;;`). Mirrors the parser overlay
  // store -- including `;;` non-indicator validation -- so the API and the `;;`
  // DSL marker produce byte-identical state (DSL/API parity).
  #applyOrClearWordIndicators(code, opts) {
    const group = this.#nodeRef;
    // Overlay clear/apply are pure state ops on the group node, so they must
    // keep working when every glyph was detached — a stale overlay on an
    // emptied word would otherwise be unreachable and resurrect on the next
    // addGlyph (round-2 external review F3). Only flatten needs glyphs (below).
    if (!group) return this;
    // Terminal fail-flagged word: see #inFailFlaggedGroup.
    if (group.errorCode) return this;
    // A space group carries no word indicator: refuse + warn (parity with the
    // glyph-level space arm), never store an overlay the space's '//'
    // serialization would eat (round-2 external review F1).
    if (this.#ctx.isRawSpaceGroup(group)) {
      const verb = code === null ? 'clearIndicators()' : `applyIndicators('${code}')`;
      const targetCode = group.glyphs[0]?.parts?.[0]?.codeName || 'unknown';
      // `||` deliberately (not `??`): the empty apply's '' falls back to the
      // target code, never an empty source (parity with the glyph arm).
      this.#warnIndicatorNoop(
        `${verb} had no effect: the target word is a space; a space cannot carry a word indicator.`,
        code || targetCode,
      );
      return this;
    }
    // stripSemantic is an apply-only option: a clear is the pure undo.
    const stripSemantic = code !== null && opts?.stripSemantic === true;

    if (opts?.flatten === true) {
      // Flatten bakes onto a head, so it still requires glyphs (an empty word
      // has nothing to bake onto; the overlay stays for a non-flatten op).
      if (!group.glyphs?.length) return this;
      // Bake onto the head; drop any overlay so the indicator is not applied
      // twice (once baked, once re-merged at render). N15: only drop the overlay
      // when the bake actually lands. A clear always bakes (removal is the
      // effect), and so does the empty apply (same clear state effect, strip
      // honored); a code-carrying apply bakes only if it carries a recognized
      // indicator, else the overlay is kept rather than silently destroyed
      // (R15 Task 5).
      const head = this.headGlyph();
      const hadOverlay = group.wordIndicators !== undefined;
      const requestedCodes = code === null || code === '' ? [] : splitTopLevelSemicolons(code);
      const bakeApplies = code === null || code === ''
        || filterToIndicators(requestedCodes, this.#ctx.getDefinitions()).length > 0;
      if (bakeApplies) delete group.wordIndicators;
      if (head) {
        // When an overlay was removed, that removal IS the effect, so the
        // delegated char-level clear-nothing must not warn as a no-op. The
        // suppress signal is passed as a private positional arg (not an opts
        // key), so it goes through the private method, not public clearIndicators.
        // An apply is left unsuppressed so an unrecognized code still warns; but
        // stripSemantic is forwarded only when the bake applies, so a refused
        // non-indicator apply stays a pure no-op (it must not strip the head as
        // a side effect while keeping the overlay — F2). The strip spelling is
        // applyIndicators('', { flatten: true, stripSemantic: true }).
        if (code === null) head.#applyOrClearIndicators(null, {}, hadOverlay);
        else head.applyIndicators(code, { stripSemantic: bakeApplies && stripSemantic });
      } else if (hadOverlay && bakeApplies) {
        this.#ctx.rebuild();
      }
      this.#syncGeneration();
      return this;
    }

    if (code === null) {
      // Clear: the pure undo. Removing the overlay fully restores the base --
      // the head's own character-level indicators, replaced at render while
      // the overlay existed, become visible again. A clear that finds no
      // overlay warns (D4 parity with the glyph-level clear-nothing arm).
      const hadOverlay = group.wordIndicators !== undefined;
      delete group.wordIndicators;
      if (!hadOverlay) {
        const headNode = this.headGlyph()?.#nodeRef ?? group.glyphs?.[0];
        const targetCode = headNode?.codeName || headNode?.parts?.[0]?.codeName || 'unknown';
        this.#warnIndicatorNoop(
          `clearIndicators() had no effect: the word has no word-level (;;) indicator overlay to clear.`,
          targetCode,
        );
      }
    } else {
      // A `;;` overlay code must BE an indicator (same rule as the DSL `;;`
      // parser path). Tokenize bracket-aware so a multi-key option block's inner
      // `;` is not split (DSL/API parity), then validate + drop non-indicators
      // via the shared resolver, warning on the persistent mutation channel so
      // the warning survives the rebuild below.
      const requestedCodes = splitTopLevelSemicolons(code);
      const overlay = resolveWordIndicatorOverlay(requestedCodes, stripSemantic, this.#ctx.getDefinitions(), ({ code: badCode, reason }) => {
        this.#ctx.addMutationWarning(reason === 'word-structure'
          ? {
              // Round-2 external review F2: a `/` hidden behind a coordinate
              // suffix escaped the bare-code classifier, so the stored code
              // serialized to a string the DSL re-parses as word structure.
              code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
              message: `applyIndicators('${code}'): "${badCode}" contains a character separator (a top-level /), which a word-level indicator cannot hold; it is ignored.`,
              source: badCode,
            }
          : reason === 'non-indicator'
            ? {
                code: WARNING_CODES.NON_INDICATOR_AS_WORD_INDICATOR,
                message: `applyIndicators('${code}'): "${badCode}" is not an indicator; it is ignored. A word-level indicator code must be an indicator (e.g. B81).`,
                source: badCode,
              }
            : {
                code: WARNING_CODES.UNKNOWN_CODE,
                message: `applyIndicators('${code}'): unknown indicator code "${badCode}"; it is ignored.`,
                source: badCode,
              });
      }, ({ bracket, code: keptCode, source }) => {
        this.#ctx.addMutationWarning({
          code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
          message: `applyIndicators('${code}'): character option (${bracket}) ignored on the word indicator "${keptCode}": a ;; code has no character to style. Use ${bracket}>${keptCode} to style the indicator part.`,
          source,
        });
      });
      // Store every overlay the shared resolver returns: surviving indicators,
      // an explicit strip, or the deliberately-empty set (the resolver's
      // bare-`;;` arm — an empty apply IS the empty overlay, DSL parity). An
      // apply whose codes are all non-indicators (resolver null) asked for
      // nothing valid: warn and leave any existing overlay untouched rather
      // than silently destroying it. Mirrors the flatten N15 rule.
      if (overlay) {
        group.wordIndicators = overlay;
      }
    }

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
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
    // A fail-flagged word (malformed `;;`) is terminal: it renders as a single
    // placeholder, and its hidden base glyphs must not escape across a group
    // boundary and render as valid. No-op; only replaceGroup recovers it.
    if (group.errorCode) return this;
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

    // The word-level overlay is a WORD property, not head-bound, so the first
    // (left) part always keeps it; the left group already retains
    // group.wordIndicators here, so there is nothing to move. The `^` head
    // marker obeys first-wins on a structural split: a marked glyph that lands
    // in the second part loses its marker (that part re-derives its head from
    // glyph 0), while a marker that stays in the first part is kept. This keeps
    // split -> merge lossless for the word-slot and matches mergeWithNext.
    for (const g of rightGlyphs) delete g.isHeadGlyph;

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
   * options apply to the merged result. Its word-level (`;;`) overlay is
   * dropped with a `DROPPED_WORD_INDICATOR` warning, and its `^` head marker
   * is dropped silently (the merged word resolves a single head).
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
    // No-op when this word is fail-flagged (malformed `;;`): it is terminal and
    // cannot absorb a neighbor (the merged glyphs would render through the
    // re-emitted error source, silently dropping the absorbed word).
    if (group.errorCode) return this;

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
    // No-op when the neighbor is fail-flagged (malformed `;;`): absorbing its
    // hidden base glyphs would let the failed word's content render as valid
    // (a silent un-fail). The failed word stays separate until replaced.
    if (nextGroup.errorCode) return this;

    // Absorb the next word group's glyphs
    group.glyphs.push(...nextGroup.glyphs);

    // R15 WS-3: `^` is word-scoped and first-wins, so the absorbed word's head
    // marker is dropped silently (a re-derived head is not data loss). Clear it
    // on the absorbed glyphs so the merged word keeps at most the first word's
    // `^`; mirrors splitAt's right-side clear and keeps merge ≡ `/`-compose.
    for (const g of nextGroup.glyphs) delete g.isHeadGlyph;

    // The merged word keeps THIS group's word-level overlay; the absorbed
    // group's overlay is dropped (one head governs the merged word, and it is
    // this group's). Data loss must be loud, so warn rather than drop silently.
    if (nextGroup.wordIndicators) {
      const { codes = [], stripSemantic } = nextGroup.wordIndicators;
      const dropped = ';;' + (stripSemantic ? '!' : '') + codes.join(';');
      this.#ctx.addMutationWarning({
        code: WARNING_CODES.DROPPED_WORD_INDICATOR,
        message: `mergeWithNext() dropped the absorbed word's word-level indicator overlay (${dropped}). The merged word keeps only the first word's overlay.`,
        source: dropped,
      });
    }

    // Remove everything from rawIndex+1 through nextWordIndex (spaces + absorbed word)
    groups.splice(rawIndex + 1, nextWordIndex - rawIndex);

    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  // --- Mutation: options ---

  setOptions(opts) {
    this.#assertReachable();
    // Terminal fail-flagged word: CHILD options live inside the frozen error
    // source and no-op; GROUP options are the documented exemption (they
    // serialize outside it, `[opts]|errorSource`, and round-trip).
    if (this.#level !== 1 && this.#inFailFlaggedGroup()) return this;
    const node = this.#nodeRef;
    if (!node) return this;
    assertOptsArg('setOptions', opts);
    this.#applyDefaultsOverrides(node, opts);
    this.#ctx.rebuild();
    this.#syncGeneration();
    return this;
  }

  removeOptions(...keys) {
    this.#assertReachable();
    // Terminal fail-flagged word: mirrors setOptions (group-level exempt).
    if (this.#level !== 1 && this.#inFailFlaggedGroup()) return this;
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
