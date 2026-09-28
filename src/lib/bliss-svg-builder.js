/** 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes, isSpaceGlyph, protectedCodes } from "./bliss-element-definitions.js";
import { BlissElement } from "./bliss-element.js";
import { BlissParser, X_RUN_LETTERS, classifyXCode, processXCodes, extractPositionFromOptions, normalizePositionFields, resolveKerning, kerningOptionEntries } from "./bliss-parser.js";
import { INTERNAL_OPTIONS, KERNING_OPTION_KEYS, PUBLICATION_MAP, KNOWN_OPTION_KEYS, GLOBAL_ONLY_OPTION_KEYS, TRANSIENT_REFUSED_OPTION_KEYS, isDocumentDefiningAttribute, isLibraryOwnedRootAttribute, admitOptions, canonicalOptionKey, optionNameIsAlreadyRefused, programmaticOptionKey, deleteOptionByName, GEOMETRY_OPTION_KEYS, SIZE_OPTION_KEYS, COMPUTED_GEOMETRY_INPUTS, LAYER_TARGETS, ELEMENT_CLASSES, CURATED_ATTRIBUTE_SOURCES, CONTAINER_SHADOWED_ATTRIBUTES, targetOfClass, judgeNumericOptionValue, judgeTextOptionValue, textOfValue, escapeHtml, isSafeAttributeName, camelToKebab, isNamedOptionKey, INTERNAL_ONLY_SPELLINGS, isLayerAttributeKey, parseLayerAttributeKey, generateKey, LIB_VERSION, WARNING_CODES, serializeOptionValue } from "./bliss-constants.js";
import { ElementHandle, assertCodeArg, assertKeyArgs, assertOptsArg } from "./element-handle.js";
import { getBareCode, mergeWordIndicatorsOntoHead, partitionWordIndicators, resolveEffectiveDefinition, resolveWordIndicatorOverlay, SINGLE_CODE_TOKEN, wordIndicatorNode } from "./indicator-utils.js";
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

// Mirrors toString()'s glyph emission for an empty-parts glyph: it re-emits
// a token only when some option survives serialization. `key` is stripped by
// toJSON, the kerning keys emit as RK/AK segments (which cannot carry a `^`),
// and `false` values are filtered by serializeOptions.
const GLYPH_OPTION_KEYS_WITHOUT_TOKEN = new Set(['key', 'relativeKerning', 'absoluteKerning']);
const glyphEmitsOptionsToken = (glyph) =>
  Object.entries(glyph.options ?? {}).some(([k, v]) =>
    v !== false && !GLYPH_OPTION_KEYS_WITHOUT_TOKEN.has(k));

// A head designation on a glyph the serializer omits has no written form: no
// parts, no code, and no option that re-emits it as an options-only token. The
// rebuild drops such a designation, and so does the view without options,
// which empties glyphs on its own working copy and has to lose exactly what
// the rebuild of a builder cleared in place loses.
const designationIsUnwritten = (glyph) =>
  glyph.isHeadGlyph === true && !glyph.parts?.length
    && !glyph.glyphCode && !glyph.codeName && !glyphEmitsOptionsToken(glyph);

// The written `Xword` shorthand expands to one glyph per letter at parse time
// (`Xab` -> `Xa/Xb`), so serializing each glyph faithfully spells a word out
// letter by letter. This folds such a run back into the shorthand it came from.
// Re-expanding what it emits must reproduce the very segments it was given, and
// that requirement is what fixes the membership test: only a BARE code the
// shared grammar reads as outlined LETTERS may join,
// because those are precisely the codes the expander re-derives one-for-one. A
// code carrying any decoration (a coordinate, an option bracket, a head marker)
// fails the anchored grammar and ends the run, and so does a text fallback,
// which is one whole glyph already and would swallow its neighbour's letter.
const collapseExternalLetterRuns = (segments) => {
  const collapsed = [];
  let run = [];
  const flushRun = () => {
    if (run.length) collapsed.push('X' + run.join(''));
    run = [];
  };
  for (const segment of segments) {
    if (classifyXCode(segment) === 'letters') {
      run.push(segment.slice(1));
      continue;
    }
    flushRun();
    collapsed.push(segment);
  }
  flushRun();
  return collapsed;
};

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

// The bracket a word, a character or the composition itself serializes to,
// position included. Those three levels have no coordinate spelling, so the
// `[x=N]` option is the only way a position can be written there, while the
// value itself lives on the promoted numeric field: a position handed in as a
// field on the composition object has no bag entry to emit from, and used to
// render and then vanish the moment the composition was written out.
//
// The position takes a fixed leading slot rather than the one it was typed in,
// which is the same canonicalization a part's coordinate suffix already does:
// the bracket then reads the same however the position arrived, which is the
// whole point, and a field-entered position has no typed slot to inherit.
function serializeOptionsWithPosition(node, skipKeys) {
  const position = {};
  if (node?.x !== undefined) position.x = node.x;
  if (node?.y !== undefined) position.y = node.y;
  if (Object.keys(position).length === 0) return serializeOptions(node?.options, skipKeys);
  return serializeOptions({ ...position, ...node.options }, skipKeys);
}

// The anchor-attribute family, mirroring the two anchorAttrNames sets inside
// BlissElement (keep all three in sync: a name added there but not here would
// leak onto the content <g>). At global scope these travel through the level-0 <a> wrap
// (with its href safety allowlist), so they must never double-emit as plain
// content-<g> attributes: href is not a valid <g> attribute, and an
// allowlist-rejected href would resurface verbatim.
// Exported so the attribute-vocabulary test can assert the vocabulary still covers
// every routed name. A restated copy there would only ever catch itself moving.
export const ANCHOR_ATTRIBUTE_NAMES = ['href', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy'];

// Why a target key emitted nothing. All three shapes fail the same way, so they
// share a code, but each fails for its own reason and a message covering all
// three describes none of them: `content--` names a target we know perfectly
// well, and `--x` names none at all.
const unresolvedLayerKeyMessage = (key) => {
  // The same split parseLayerAttributeKey makes, so the reason reported is the
  // reason the key was actually rejected.
  const layer = key.slice(0, key.lastIndexOf('--'));
  const targets = `A target is a class the library writes, without the "bliss-" prefix, and the attribute follows the LAST "--": ${[...LAYER_TARGETS].join(', ')}. Write the attribute with no prefix to put it on the root.`;
  if (!LAYER_TARGETS.has(layer)) {
    return layer === ''
      ? `"${key}" has no target name before the "--", so there is nothing for it to target and nothing was emitted. ${targets}`
      : `"${key}" names no target the library knows, so nothing was emitted for it. ${targets}`;
  }
  return `"${key}" names the ${layer} target but no attribute after the "--", so there was nothing to emit.`;
};

// What `source` carries, one rule for every refusal: THE WHOLE KEY when the
// NAME is what was refused, `key=value` when the VALUE is what was refused.
// `source` is documented as the fragment that triggered the warning, so it has
// to be a fragment the author can find in their own input and it has to name
// the thing that actually offended. `xmlns` is not a fragment of
// `[content--xmlns=x]`, and two refusals in one bracket that report the same
// string cannot be told apart; a value that was never looked at is noise.
//
// Why a reserved name is refused, one reason per name: the two reserved sets
// are guarded for different reasons and a single sentence covering both would
// be true of neither. A Map rather than an object literal, so an inherited
// name can never answer for a real one.
const RESERVED_ATTRIBUTE_REASONS = new Map([
  ['xmlns', 'declares what the file is rather than anything about the picture, and a second declaration moves everything under it out of SVG, where no renderer draws it'],
  ['data-generator', "is the library's own stamp recording what produced the file, and a stamp anyone can overwrite tells its reader nothing; record your own pipeline under a name of your own"],
]);
// The reason is looked up on the NAME and the sentence quotes the SPELLING. The
// two guards judge these names without regard to casing, since an SVG placed
// inline in an HTML page has its attribute names lowercased there, so a written
// `XMLNS` has to find `xmlns`'s reason while the author still reads back the
// spelling they typed.
const reservedAttributeMessage = (name) =>
  `"${name}" ${RESERVED_ATTRIBUTE_REASONS.get(String(name).toLowerCase())}, so the written value was refused.`;

// Renders one layer's attribute map as markup. An empty map yields an empty
// string, so a tag built from it closes without a stray space.
const formatAttributes = (attrs) =>
  Object.entries(attrs).map(([name, value]) => `${name}="${value}"`).join(' ');

// A layer's structural classes are the library's identifier for that element,
// so an authored class is APPENDED to them and never replaces them: replacing
// would break the embedded <style> block, every consumer selector, and the layer
// lookups downstream apps do by class. Bounded to `class` deliberately, since it
// is the only identity-bearing attribute an element carries; every other
// authored value is free to replace what the library computed.
const mergeStructuralClass = (structural, authored) =>
  authored ? `${structural} ${authored}` : structural;

// One element's emitted attributes: its structural classes, then what the
// library computed for it, then the author's raw values, which may replace a
// computed one. The class is put back afterwards so the spread cannot drop the
// structural names.
const layerAttributes = (structuralClasses, computed, authored = {}) => {
  const structural = [structuralClasses].flat().join(' ');
  return {
    ...{ class: structural, ...computed, ...authored },
    class: mergeStructuralClass(structural, authored['class']),
  };
};

// Resolves which glyph carries a word-level (`;;`) overlay. A stored
// designation wins; the fallback resolves among content-bearing glyphs only,
// because serialization omits a bare empty-parts glyph, so a reparse of
// toString() resolves the head without it. Returns -1 when no glyph can
// carry the overlay (every glyph is empty).
const resolveOverlayHeadIndex = (glyphs) => {
  const marked = glyphs.findIndex(g => g.isHeadGlyph === true);
  if (marked !== -1) return marked;
  const contentIndexes = glyphs.flatMap((g, i) => (g.parts?.length ? [i] : []));
  if (!contentIndexes.length) return -1;
  return contentIndexes[resolveHeadIndex(contentIndexes.map(i => getHeadCode(glyphs[i])))];
};

// Note: BlissSVGBuilder.LIB_VERSION is attached at the public entry point
// (src/index.js), not declared here. Code that imports the class directly
// from this file (e.g. internal tests) will see LIB_VERSION as undefined.
// External consumers always go through src/index.js, where the static is set.
class BlissSVGBuilder {
  #processedOptions;
  // Global `<layer>--<attribute>` values, grouped by the layer they name, and
  // applied at that layer's emission point. Rebuilt with globalSvgAttributes.
  #layerAttributes = {};
  // Root attribute names that arrived as `root--`, so the render pass can tell
  // a destination the author named from one the library resolved to.
  #rootPrefixedNames = new Set();
  #sharedOptions;
  #mutationCtx;
  #warnings = [];
  // Warnings raised by mutation operations (e.g. mergeWithNext dropping an
  // absorbed word-level overlay). Unlike #warnings, these are NOT reset by
  // #rebuild — they record one-time data-loss events for the builder's
  // lifetime, since the lost data leaves no trace in the rebuilt tree.
  #mutationWarnings = [];
  #generation = 0;

  // One options bag with every refused text value reported and removed. The bag
  // is copied rather than edited, and only when something was actually refused,
  // so the caller's own tree is never reshaped by a pass that only judges.
  // The copy is defensive rather than load-bearing, and measured so: the one
  // caller replaces the bag it passed in on the next line, so editing in place
  // diverges on nothing constructible today. It stays because a second caller
  // would not know that.
  //
  // A value the AUTHOR wrote no longer reaches it: the admission stage refuses
  // that value where the composition is built, on every entry point, so by the
  // time an option is dispatched the bag holds nothing this could refuse. What
  // is left is the bags that never passed ingest, which are the library's own
  // module data: the built-in definitions' `defaultOptions` (a `define()` call
  // is admitted, the built-in table is written straight into the registry) and
  // the error-placeholder parts. Both reach an author's composition, so the
  // backstop is kept and the two gates are held to one rule by sharing the
  // predicate and the name test below.
  #withoutRefusedTextValues(rawOptions) {
    let kept = rawOptions;
    for (const [key, value] of Object.entries(rawOptions)) {
      if (optionNameIsAlreadyRefused(key)) continue;
      const refusal = judgeTextOptionValue(key, value);
      if (!refusal) continue;
      this.#warnings.push(refusal);
      if (kept === rawOptions) kept = { ...rawOptions };
      delete kept[key];
    }
    return kept;
  }

  // Processes raw options (kebab-case) into two bags that cannot collide.
  //
  // `processed` holds what the library computed, under internal camelCase names;
  // `authored` holds every key we do not curate, spelled exactly as the author
  // wrote it and escaped. One bag held both before, so an author writing a
  // curated option in its internal spelling (`[strokeWidth=1]`, `[marginTop=3]`)
  // landed on the value the library had computed under that same name: the
  // string won, and the arithmetic downstream either concatenated it into the
  // viewBox or threw. Two bags make that impossible by construction rather than
  // by a skip list somebody has to maintain.
  //
  // Bulk options expanded here (not in output): 'margin', 'crop', 'grid-color', 'grid-stroke-width'.
  // @param {boolean} addBuilderDefaults - If true, adds defaults for builder-level options (grid, etc.)
  // @returns {{processed: Object, authored: Object}}
  #processOptions(rawOptions = {}, addBuilderDefaults = false) {
    const processed = {};
    const authored = {};

    // The string half of the value gate, run before the dispatch below so a
    // refused value is simply not there when its own branch looks for it: the
    // option falls back exactly as if it had never been written, which is the
    // same shape the numeric half already has. One sweep rather than one call
    // per branch, because the names it covers are DERIVED (every curated option
    // that is neither a number nor a switch, plus every name the library does
    // not curate at all) and a per-branch edit is a list somebody has to keep.
    //
    // It runs HERE, where the option is dispatched, and not at ingest, because
    // whether a value is legal depends on which option it is: `true` is right
    // for `grid` and wrong for `color`. Ingest resolves names and knows none of
    // that, and it sits upstream of the numeric half, so refusing there would
    // replace that half's well-worded refusals with one generic one.
    rawOptions = this.#withoutRefusedTextValues(rawOptions);

    // stroke-width: honoured exactly as written, or refused and reported. The
    // old 0.1-1.5 clamp was what made the raw value unreachable: a name the
    // library curates was also the only spelling of it, so an author who
    // wanted a heavier stroke had no second channel to ask through.
    //
    // A negative width is refused rather than floored to 0. Flooring was the
    // same silent substitution the ceiling made, one step further down, and it
    // mattered here because the value feeds path geometry as well as the
    // attribute: a dot's radius is derived from it, so a negative one reaches
    // the path data as a negative arc radius and conformant renderers drop the
    // whole glyph. A refusal falls back to the width the element would have had
    // anyway, which is the library default at the root and whatever is
    // inherited below it.
    if ('stroke-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('stroke-width', rawOptions['stroke-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.strokeWidth = Number(rawOptions['stroke-width']);
    }

    // The dot and spacing family: honoured exactly as written, or refused and
    // reported. Both bounds are gone. The ceilings rewrote a written value in
    // silence, and the floor at 0 did the same thing to a negative one; a
    // refusal falls back to the value the option would have had without it,
    // which the consumer's own default supplies. `judgeNumericOptionValue`
    // also answers the "is this a number at all" question the old `!isNaN`
    // guard answered silently.
    if ('dot-extra-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('dot-extra-width', rawOptions['dot-extra-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.dotExtraWidth = Number(rawOptions['dot-extra-width']);
    }

    // sdot-extra-width: the small-dot override of the dot-extra-width half-default
    if ('sdot-extra-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('sdot-extra-width', rawOptions['sdot-extra-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.sdotExtraWidth = Number(rawOptions['sdot-extra-width']);
    }

    // dot-width / sdot-width: absolute rendered dot diameter
    if ('dot-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('dot-width', rawOptions['dot-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.dotWidth = Number(rawOptions['dot-width']);
    }

    if ('sdot-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('sdot-width', rawOptions['sdot-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.sdotWidth = Number(rawOptions['sdot-width']);
    }

    if ('char-space' in rawOptions) {
      const refusal = judgeNumericOptionValue('char-space', rawOptions['char-space']);
      if (refusal) this.#warnings.push(refusal);
      else processed.charSpace = Number(rawOptions['char-space']);
    }

    if ('word-space' in rawOptions) {
      const refusal = judgeNumericOptionValue('word-space', rawOptions['word-space']);
      if (refusal) this.#warnings.push(refusal);
      else processed.wordSpace = Number(rawOptions['word-space']);
    }

    if ('external-glyph-space' in rawOptions) {
      const refusal = judgeNumericOptionValue('external-glyph-space', rawOptions['external-glyph-space']);
      if (refusal) this.#warnings.push(refusal);
      else processed.externalGlyphSpace = Number(rawOptions['external-glyph-space']);
    }

    // The margin family. A margin is an OFFSET in the policy table, so a
    // negative one is honoured and pushes the viewBox outwards; only a
    // non-finite value or something that is not a number at all is refused.
    // margin: Sets ALL 4 margins
    if ('margin' in rawOptions) {
      const refusal = judgeNumericOptionValue('margin', rawOptions['margin']);
      if (refusal) this.#warnings.push(refusal);
      else {
        const m = Number(rawOptions['margin']);
        processed.marginTop = m;
        processed.marginBottom = m;
        processed.marginLeft = m;
        processed.marginRight = m;
      }
    }

    // Individual margins (override the above if present). A refusal assigns
    // NOTHING rather than a fallback, which is what lets an accepted bulk
    // `margin` still stand underneath it: writing `undefined` here would read
    // as "no margin" downstream and quietly undo a value the author did write.
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const key = `margin-${side}`;
      if (!(key in rawOptions)) continue;
      const refusal = judgeNumericOptionValue(key, rawOptions[key]);
      if (refusal) this.#warnings.push(refusal);
      else processed[`margin${side[0].toUpperCase()}${side.slice(1)}`] = Number(rawOptions[key]);
    }

    // min-width: a LENGTH, so a negative one is refused rather than floored to
    // 0. The floor made no visible difference, because a refused min-width
    // falls back to 0 anyway, but it was still a value the library substituted
    // without saying so.
    if ('min-width' in rawOptions) {
      const refusal = judgeNumericOptionValue('min-width', rawOptions['min-width']);
      if (refusal) this.#warnings.push(refusal);
      else processed.minWidth = Number(rawOptions['min-width']);
    }

    // Boolean options: [option] = true, absence = false
    if (rawOptions.center === true) {
      processed.center = true;
    }
    if (rawOptions.grid === true) {
      processed.grid = true;
    }
    if (rawOptions['error-placeholder'] === true) {
      processed.errorPlaceholder = true;
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

      // Assign to processed object (escaped for safe SVG output)
      processed.gridSkyColor = escapeHtml(skyColor);
      processed.gridEarthColor = escapeHtml(earthColor);
      processed.gridMajorColor = escapeHtml(majorColor);
      processed.gridMediumColor = escapeHtml(mediumColor);
      processed.gridMinorColor = escapeHtml(minorColor);
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

      // Every width is judged before it is allowed to move an accumulator, so
      // a refused value leaves whatever the level below it put there standing:
      // a bad `grid-sky-stroke-width` falls back to the bulk width if one was
      // accepted, and to the default otherwise, exactly as if it had never been
      // written. Returns undefined for both "not written" and "refused",
      // because the caller does the same thing in either case.
      //
      // These six had no check at all before. A written value went straight
      // through `Number()`, so `[grid;grid-stroke-width=abc]` stamped
      // stroke-width="NaN" on every line the option named, in silence.
      const gridStrokeWidth = (key) => {
        if (!(key in rawOptions)) return undefined;
        const refusal = judgeNumericOptionValue(key, rawOptions[key]);
        if (refusal) {
          this.#warnings.push(refusal);
          return undefined;
        }
        return Number(rawOptions[key]);
      };

      // Apply bulk option (sets all grid widths)
      const bulkWidth = gridStrokeWidth('grid-stroke-width');
      if (bulkWidth !== undefined) {
        skyWidth = earthWidth = majorWidth = mediumWidth = minorWidth = bulkWidth;
      }

      // Apply category option for major grids (overrides bulk for major lines)
      const categoryMajorWidth = gridStrokeWidth('grid-major-stroke-width');
      if (categoryMajorWidth !== undefined) {
        skyWidth = earthWidth = majorWidth = categoryMajorWidth;
      }

      // Apply category option for medium grid (overrides bulk)
      const categoryMediumWidth = gridStrokeWidth('grid-medium-stroke-width');
      if (categoryMediumWidth !== undefined) {
        mediumWidth = categoryMediumWidth;
      }

      // Apply category option for minor grid (overrides bulk)
      const categoryMinorWidth = gridStrokeWidth('grid-minor-stroke-width');
      if (categoryMinorWidth !== undefined) {
        minorWidth = categoryMinorWidth;
      }

      // Apply specific options (most specific, override everything)
      const specificSkyWidth = gridStrokeWidth('grid-sky-stroke-width');
      if (specificSkyWidth !== undefined) {
        skyWidth = specificSkyWidth;
      }

      const specificEarthWidth = gridStrokeWidth('grid-earth-stroke-width');
      if (specificEarthWidth !== undefined) {
        earthWidth = specificEarthWidth;
      }

      // Assign to processed object
      processed.gridSkyStrokeWidth = skyWidth;
      processed.gridEarthStrokeWidth = earthWidth;
      processed.gridMajorStrokeWidth = majorWidth;
      processed.gridMediumStrokeWidth = mediumWidth;
      processed.gridMinorStrokeWidth = minorWidth;
    }

    // crop: Sets ALL 4 crop values (number or 'auto')
    if ('crop' in rawOptions) {
      const c = rawOptions['crop'];
      if (c === 'auto') {
        processed.cropTop = 'auto';
        processed.cropBottom = 'auto';
        processed.cropLeft = 'auto';
        processed.cropRight = 'auto';
      } else if (c === 'auto-vertical') {
        processed.autoVertical = true;
      } else if (c === 'compact') {
        processed.cropCompact = true;
      } else {
        // Those three are the whole of crop's non-numeric vocabulary, so
        // anything else is judged as a number. The gate runs BEHIND the string
        // arms rather than in front of them, or it would refuse all three.
        // The old `!isNaN(c)` tail dropped `[crop=nonsense]` without a word.
        const refusal = judgeNumericOptionValue('crop', c);
        if (refusal) this.#warnings.push(refusal);
        else {
          const n = Number(c);
          processed.cropTop = n;
          processed.cropBottom = n;
          processed.cropLeft = n;
          processed.cropRight = n;
        }
      }
    }

    // Individual crop values (override the above if present).
    // 'auto' is a legal value here and the only string one; everything else is
    // judged as a number, which is what the old unconditional `Number(val)`
    // skipped: `[crop-top=aut0]` reached the viewBox as NaN, in silence.
    //
    // A refusal returns undefined and the caller assigns NOTHING, which is what
    // lets an accepted bulk `crop` still stand underneath: assigning undefined
    // would overwrite the value `crop=2` had already put there.
    const resolveCropValue = (key, val) => {
      if (val === 'auto') return 'auto';
      const refusal = judgeNumericOptionValue(key, val);
      if (refusal) {
        this.#warnings.push(refusal);
        return undefined;
      }
      return Number(val);
    };
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const key = `crop-${side}`;
      if (!(key in rawOptions)) continue;
      const value = resolveCropValue(key, rawOptions[key]);
      if (value !== undefined) {
        processed[`crop${side[0].toUpperCase()}${side.slice(1)}`] = value;
      }
    }

    // Other string options
    if ('color' in rawOptions) {
      processed.color = escapeHtml(rawOptions.color);
    }
    if ('background' in rawOptions) {
      processed.background = escapeHtml(rawOptions.background); // empty string => transparent background
    }
    if ('background-top' in rawOptions) {
      processed.backgroundTop = escapeHtml(rawOptions['background-top']);
    }
    if ('background-mid' in rawOptions) {
      processed.backgroundMid = escapeHtml(rawOptions['background-mid']);
    }
    if ('background-bottom' in rawOptions) {
      processed.backgroundBottom = escapeHtml(rawOptions['background-bottom']);
    }
    if ('text' in rawOptions) {
      processed.text = escapeHtml(rawOptions.text);
    }
    if ('svg-desc' in rawOptions) {
      processed.svgDesc = escapeHtml(rawOptions['svg-desc']);
    }
    if ('svg-title' in rawOptions) {
      processed.svgTitle = escapeHtml(rawOptions['svg-title']);
    }

    // SVG element height (presentation size, not viewBox). A LENGTH: the root
    // width is derived from it, so a negative one emitted a negative width and
    // height on the <svg> itself. Zero is legal and draws an empty picture.
    if ('svg-height' in rawOptions) {
      const refusal = judgeNumericOptionValue('svg-height', rawOptions['svg-height']);
      if (refusal) this.#warnings.push(refusal);
      else processed.svgHeight = Number(rawOptions['svg-height']);
    }

    // Promoted by the parser, not written by the author: these two are
    // library-resolved numbers and belong with the computed values. The curated
    // set does not list them, because it lists what this method dispatches on
    // and kerning is resolved earlier, so without this they fall through the
    // loop below into the author's bag, ship as `<g relativeKerning="3">` and
    // move nothing.
    for (const key of ['relativeKerning', 'absoluteKerning']) {
      // Own-key test, not `in`, which walks the prototype chain.
      if (Object.hasOwn(rawOptions, key)) processed[key] = rawOptions[key];
    }

    // Everything the library does not curate keeps the author's exact spelling
    // (fill, opacity, stroke-dasharray, a data attribute, a camelCase SVG name).
    // String values are escaped here at the input boundary so downstream code can use them safely.
    // Numeric values pass through as-is — they're used for calculations, not SVG markup.
    //
    // ONE kind of key reaches here meaning a curated option and not setting one:
    // a name the computed bag uses for a crop value (`autoVertical` for
    // `crop=auto-vertical`), written as an option. It is not a spelling of a
    // NAME, so ingest has nothing to resolve, and no route reads it as the crop:
    // it reached the renderer only while the author's options and the computed
    // ones shared a bag, which was an accident rather than a design. Reported
    // HERE rather than at an emitter: this pass runs once per rebuild and
    // reaches every scope, where the emitters run per render and are spread
    // across two files. The key is left in the bag, so it still
    // round-trips, re-warns on reparse and is emitted as written; a usable
    // attribute name reaches the markup as typed, which is the pass-through rule
    // and not an exception to it.
    //
    // A curated option written in its PROGRAMMATIC spelling was reported here
    // too, for as long as one channel could still deliver such a key. Object
    // input was that channel and now resolves the name on the way in like the
    // rest, so nothing can reach this loop under a curated camelCase name and
    // the arm that said so is retired.
    for (const [key, value] of Object.entries(rawOptions)) {
      if (KNOWN_OPTION_KEYS.has(key)) continue;
      const internalOnly = INTERNAL_ONLY_SPELLINGS.get(key);
      if (internalOnly) {
        this.#warnings.push({
          code: WARNING_CODES.MISPLACED_OPTION_SPELLING,
          message: `"${key}" is the library's internal name for "${internalOnly}", not an option, so it was emitted as written and sets nothing. Write "${internalOnly}" instead.`,
          source: key,
        });
      }
      authored[key] = typeof value === 'string' ? escapeHtml(value) : value;
    }

    return { processed, authored };
  }

  // Recursively process options at all levels (groups, glyphs, parts)
  #processAllOptions(obj, isTopLevel = false) {
    // A transient option is an ordinary option that never serializes, so it
    // joins the node's options HERE, on the render clone, and is processed,
    // escaped and normalized by everything downstream exactly like one. The
    // authoring tree keeps the two bags apart, which is what keeps the
    // serializers from ever seeing a transient value.
    //
    // Transient wins at the key level, because an overlay that lost to what it
    // overlays could not do its job. Above the key the existing precedence is
    // unchanged and channel-blind: an explicitly-named attribute still beats an
    // alias of it, and a specific option still beats the bulk one it refines.
    //
    // A node may carry a transient bag and no options at all, so this runs
    // before the `if (obj.options)` guard and creates the object.
    if (obj.transientOptions) {
      obj.options = { ...(obj.options ?? {}), ...obj.transientOptions };
    }
    if (obj.options) {
      // Extract key from options (key is element identity, not an SVG option)
      if (obj.options.key !== undefined) {
        obj.key = obj.options.key;
        delete obj.options.key;
      }
      // Two guards judge a NAME, and an emitter that honours either one simply
      // never writes the attribute. Reporting them HERE is what makes that
      // visible: this pass runs once per rebuild and reaches every scope,
      // where the emitters run per render and are spread across two files.
      // The key is left in place, so it still round-trips and re-warns on
      // reparse rather than vanishing from a stored composition. The transient
      // channel is already reported by #normalizeTransientInvariant, which runs
      // earlier and has removed its own offenders by now, so nothing is
      // reported twice.
      for (const [key, value] of Object.entries(obj.options)) {
        // A target key is judged on the half after the LAST `--`, since the
        // prefix is routing rather than markup: `grid-line--sky--onclick` must
        // be judged on `onclick`. When the prefix names no target, the whole key
        // is not an attribute name either, so judging it here would report the
        // wrong defect on top of the UNKNOWN_LAYER the split loop already raises.
        const target = isLayerAttributeKey(key) ? parseLayerAttributeKey(key) : null;
        if (isLayerAttributeKey(key) && !target) continue;
        const name = target ? target.attribute : key;
        if (!isSafeAttributeName(name)) {
          this.#warnings.push({
            code: WARNING_CODES.UNSAFE_ATTRIBUTE_NAME,
            message: `"${key}" is not a usable attribute name (event handlers and names outside letters, digits and dashes are refused), so it was dropped and will not be emitted.`,
            source: key,
          });
          continue;
        }
        // A name that declares what the document IS breaks the file wherever
        // it lands, so the guard reaches every scope rather than the root
        // alone. Global scope is judged in the split loop below instead, on
        // the name actually emitted, since an alias there can rename the key.
        if (!isTopLevel && isDocumentDefiningAttribute(name)) {
          this.#warnings.push({
            code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME,
            message: reservedAttributeMessage(name),
            source: key,
          });
        }
      }
      const { processed, authored } = this.#processOptions(obj.options, isTopLevel);
      obj.options = processed;
      // Assigned unconditionally on every node that carries options, so the
      // field is present or the node had no options at all. Every reader still
      // guards with `?? {}`, because the second case is ordinary.
      obj.authoredOptions = authored;
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
    assertOptsArg('BlissSVGBuilder', options);
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

    // A composition object stores an options bag exactly as it was given, so
    // this is where it meets the admission stage. Done HERE, on the clone and
    // before anything else reads the tree, so every gate, emitter and
    // serializer downstream sees the one spelling a bracket and the options
    // argument already store, and holds only values that can be saved again.
    //
    // The reports ride `_parseWarnings`, the channel that survives a rebuild.
    // That is not cosmetic here: a refused value is DROPPED, so it leaves no
    // trace in the rebuilt tree, and a report regenerated from the tree would
    // vanish on the first mutation. It is also the honest channel for this
    // route, since the bag arrived with the composition rather than through a
    // later call.
    //
    // Before `expandParts`, so only the bags the CALLER wrote are touched: a
    // definition's own defaults are admitted where they are declared, and
    // walking them again would put this task's blame on a bag it never read.
    if (typeof input !== 'string') {
      BlissSVGBuilder.#admitAuthoredBags(
        blissObj,
        'global',
        (warning) => (blissObj._parseWarnings ??= []).push(warning),
      );
    }

    // For object input (from toJSON), re-expand any parts that were stripped.
    // A definition's code string is read as the DSL reads it, so a key misplaced
    // in one of its brackets is reported down the same channel, for the same
    // reason: it is dropped, and the rebuilt tree keeps no trace of it.
    if (typeof input !== 'string') {
      BlissParser.expandParts(blissObj, (warning) => (blissObj._parseWarnings ??= []).push(warning));
    }

    // Reverse toJSON() normalization: codeName → internal field names
    if (typeof input !== 'string' && blissObj.groups) {
      BlissSVGBuilder.#normalizeGlyphCodes(blissObj.groups);
      BlissSVGBuilder.#normalizePartlessGlyphs(blissObj.groups);
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
      // Two bags with a defined precedence between them, so each is watched on
      // its own: one option written once in `defaults` and once in `overrides`
      // is a layering, not a collision.
      const optionWarn = (warning) => (blissObj._parseWarnings ??= []).push(warning);
      const scope = { level: 'global', notation: 'setter' };
      const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults, optionWarn, scope) : {};
      const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides, optionWarn, scope) : {};
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
      toRaw: (obj, scope) => BlissSVGBuilder.#toRaw(obj, (warning) => this.#mutationWarnings.push(warning), scope),
      clearStalePositioning: (node, ...incoming) =>
        BlissSVGBuilder.#clearStalePositioning(node, ...incoming),
      isRawSpaceGroup: (g) => BlissSVGBuilder.#isRawSpaceGroup(g),
      makeSpaceGroup: () => BlissSVGBuilder.#makeSpaceGroup(),
      removeGlyphGroup: (obj, gi) => this.#removeGlyphGroup(obj, gi),
      getSnapshot: () => this.snapshot(),
      getGeneration: () => this.#generation,
      getDefinitions: () => blissElementDefinitions,
      addMutationWarning: (warning) => this.#mutationWarnings.push(warning),
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

  // Setting a position or a kerning value through the API REPLACES the one the
  // element carries, so the channels it fills are cleared before the merge.
  // Without this the element keeps what an earlier call promoted (`node.x`, or
  // the other kerning key) and the promotion pass reads that leftover as a
  // second authored value: re-setting `{x: 7}` would report the 5 it replaced
  // as a competing coordinate that was never written, once per change.
  // Two values written in ONE call still compete, and still warn, because both
  // arrive in the same incoming object.
  static #clearStalePositioning(node, ...incoming) {
    const keys = incoming.flatMap(o => Object.keys(o ?? {}));
    for (const axis of ['x', 'y']) {
      if (keys.includes(axis)) delete node[axis];
    }
    if (node.options && keys.some(key => Object.hasOwn(KERNING_OPTION_KEYS, key))) {
      for (const key of Object.keys(KERNING_OPTION_KEYS)) delete node.options[key];
    }
  }

  // Every options bag inside a composition object, admitted in place. The whole
  // tree is walked rather than the root alone because a bag can sit at any of
  // five levels and each one is a bag the caller wrote: a document-level row
  // passes with the other four still verbatim.
  //
  // A hand-authored transient bag is walked too. `setTransientOptions` admits
  // its own bag, so a composition object is the only way an unadmitted key
  // reaches that channel, and it merges into the node's options before the
  // options pass runs.
  //
  // The level each bag is judged at comes from the array its node was found
  // in, the way a bracket's comes from where it was written. A part's own
  // `parts` are parts too, at any depth.
  static #admitAuthoredBags(node, level, warn) {
    for (const [bag, transient] of [['options', false], ['transientOptions', true]]) {
      if (node[bag]) {
        node[bag] = BlissSVGBuilder.#admitAuthoredBag(node[bag], warn, { level, notation: 'object', transient });
      }
    }
    for (const [children, childLevel] of [['groups', 'group'], ['glyphs', 'character'], ['parts', 'part']]) {
      for (const child of node[children] ?? []) BlissSVGBuilder.#admitAuthoredBags(child, childLevel, warn);
    }
  }

  // One bag, admitted on its own so two bags each holding one spelling stay a
  // layering rather than a collision.
  //
  // The admitted value keeps the TYPE the caller authored, which is what this
  // channel does differently from `#toRaw`: a number stays a number here and
  // becomes text there, so a composition object round-trips through `toJSON()`
  // deep-equal. What the two channels no longer differ on is which values get
  // in at all; that moved into the shared stage.
  //
  // The two kerning names are resolved here like any other curated option, even
  // though this is the one channel where such a key may be the PARSER's rather
  // than the author's: `toJSON()` stores a kerned character as `relativeKerning`.
  // Measured, resolving it costs nothing, because the kerning resolver reads
  // either spelling and the name is promoted back on the way out, so a round
  // trip is byte-identical and `toJSON()` deep-equal either way.
  static #admitAuthoredBag(bag, warn, scope) {
    const admitted = {};
    for (const [key, value] of admitOptions(Object.entries(bag), warn, scope)) admitted[key] = value;
    return admitted;
  }

  // The JavaScript channels: the constructor's options argument, the handle
  // setters and `setTransientOptions`. Each value becomes the TEXT a bracket
  // would have carried, which is what this channel does differently from a
  // composition object; which values get in at all is the shared stage's call
  // and no longer this one's.
  //
  // `warn` is optional, and every caller that has a warnings route passes one:
  // the constructor sends its reports down `_parseWarnings`, so they survive a
  // rebuild exactly as a bracket's do, and the mutation surfaces send theirs to
  // the mutation log, which is where a one-time loss belongs. Both channels
  // survive a rebuild, which a refused value's report has to: it is dropped, so
  // nothing in the rebuilt composition records it.
  //
  // The two drops below are what is left for this channel to decide, and both
  // are silent because the stage has already reported everything it refused.
  // What reaches them is what the stage deliberately ADMITS whatever it holds:
  // a switch, which is off for any value but `true`; the element key, which
  // reaches neither the picture nor the saved text; and a key whose NAME a later
  // pass refuses.
  //
  // `scope` is where the caller is writing, which only the caller knows: the
  // document for the options argument, the new or the addressed element for
  // the setters, and the transient channel for `setTransientOptions`.
  static #toRaw(obj, warn, scope) {
    const raw = {};
    for (const [key, value] of admitOptions(Object.entries(obj), warn, scope)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      if (typeof value === 'boolean') {
        raw[key] = value;
      } else {
        raw[key] = textOfValue(value);
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

  // Space-invariant normalization (round-3/round-4 external review F1): a
  // structural mutation (replaceGlyph/removeGlyph/replacePart/detach/
  // addGlyph-on-empty/insertGlyph), an alias expanding an in-word space, or
  // hand-authored object input can leave space state the DSL cannot express —
  // an overlay/designation on a space that '//' serialization eats, or a bare
  // space glyph INSIDE a word whose serialized token the parser re-splits
  // into separate groups (so toString diverges from toJSON and the reparse
  // renders differently, silently). Enforced HERE, the one chokepoint every
  // mutation route and input surface passes through (parse and the indicator
  // API already gate their own ingestion):
  //  1. A non-head marker (a space glyph or the ZSA anchor) never carries a
  //     designation (deleted silently, matching the structural `^` drops in
  //     splitAt/mergeWithNext). Likewise a glyph serialization omits entirely
  //     (empty parts, no codeName, no options that would re-emit it as an
  //     options-only token): its designation has no serialized form, so it
  //     dies with the glyph's content (the round-2 F4 contract, enforced here
  //     for hand-authored object input).
  //  2. An all-non-head-marker word never carries a `;;` overlay (dropped
  //     LOUDLY, matching mergeWithNext's DROPPED_WORD_INDICATOR, since data
  //     loss must be visible). The deletion makes the sweep warn once, not per
  //     rebuild. An EMPTY group keeps its overlay (the F3 pure-state-op
  //     contract; isNonHeadMarkerGroup is false).
  //  3. A bare space glyph never lives inside a word: the word is split at
  //     its space runs into real space groups — canonicalization, SILENT
  //     (nothing is lost: glyph nodes move; the first word run keeps the
  //     group node, overlay, and options; later word runs get an options
  //     copy, splitAt parity, and keep their own designations, which
  //     round-trip per word). A fail-flagged group is exempt (terminal;
  //     splitting it would duplicate its errorSource replay). A multi-part
  //     glyph merely LED by a space-code part (`ZSA;B291`) is not a space
  //     glyph and is never touched.
  //  4. Adjacent space groups merge (a reparse groups consecutive space
  //     tokens into ONE group, so separate neighbors could not round-trip).
  #normalizeSpaceInvariant() {
    const groups = this.#rawBlissObj.groups ?? [];
    for (const group of groups) {
      for (const glyph of group.glyphs ?? []) {
        if (glyph.isHeadGlyph === true && BlissSVGBuilder.#isNonHeadMarkerNode(glyph)) {
          delete glyph.isHeadGlyph;
        }
        if (designationIsUnwritten(glyph)) delete glyph.isHeadGlyph;
      }
      if (group.wordIndicators && !group.errorCode && BlissSVGBuilder.#isNonHeadMarkerGroup(group)) {
        const { codes = [], stripSemantic } = group.wordIndicators;
        const dropped = ';;' + (stripSemantic ? '!' : '') + codes.join(';');
        delete group.wordIndicators;
        this.#mutationWarnings.push({
          code: WARNING_CODES.DROPPED_WORD_INDICATOR,
          message: `A space or anchor cannot carry a word indicator, so the word-level indicator overlay (${dropped}) was dropped.`,
          source: dropped,
        });
      }
    }
    const createdSpaceGroups = [];
    const movedSpaceGlyphs = [];
    // A TSP/QSP space is a pure word-separator: a coordinate (`:x,y`) or an
    // option (`[opts]` at any scope) on one cannot position or style whitespace,
    // so it is dropped with a MISPLACED_SPACE_DECORATION warning and the space
    // keeps its identity. ZSA is content (a positionable inkless shape) and is
    // exempt: the strip targets only #isSpaceGlyphNode (= {TSP, QSP}). A stripped
    // glyph joins movedSpaceGlyphs so the _differsFromDefault re-flag below keeps
    // a bared QSP serializing as `QSP`, not the default `//`. Kerning
    // (GLYPH_INTERNAL_KEYS) and the runtime key are spared.
    const warnSpaceDrop = (kind, source) => this.#mutationWarnings.push({
      code: WARNING_CODES.MISPLACED_SPACE_DECORATION,
      message: `A space cannot carry ${kind === 'coordinate' ? 'a coordinate' : 'an option'}, so "${source}" was dropped.`,
      source,
    });
    for (const group of groups) {
      if (group.errorCode || !group.glyphs?.length) continue;
      const pureSpace = BlissSVGBuilder.#isRawSpaceGroup(group);
      let groupStripped = false;
      if (pureSpace) {
        const repr = BlissSVGBuilder.#dropSpaceDecorations(group);
        if (repr) {
          warnSpaceDrop('option', repr);
          groupStripped = true;
        }
      }
      for (const glyph of group.glyphs) {
        if (!BlissSVGBuilder.#isSpaceGlyphNode(glyph)) continue;
        let touched = groupStripped;
        const glyphRepr = BlissSVGBuilder.#dropSpaceDecorations(glyph);
        if (glyphRepr) {
          warnSpaceDrop('option', glyphRepr);
          touched = true;
        }
        const part = glyph.parts[0];
        const partEntries = BlissSVGBuilder.#dropSpaceOptionEntries(part.options);
        if (partEntries.length) {
          if (Object.keys(part.options).length === 0) delete part.options;
          warnSpaceDrop('option', `[${partEntries.join(';')}]`);
          touched = true;
        }
        if (part.x !== undefined || part.y !== undefined) {
          // Presence, not value: a written `0` is a position the author stated,
          // so it is dropped here like any other and is reported like any
          // other. Asking whether the value was non-zero instead let `QSP:0,0`
          // lose a written position in silence. A form that writes neither axis
          // (`QSP:,`) never reaches here, so there is nothing to report.
          const source = BlissSVGBuilder.#positionSuffix(part.x, part.y);
          delete part.x;
          delete part.y;
          warnSpaceDrop('coordinate', source);
          touched = true;
        }
        // Re-flag for identity even when nothing survived to strip: a space that
        // arrived carrying a global-only option key (`[grid]|QSP`) is stripped by
        // the parser first (as MISPLACED_GLOBAL_OPTION), which leaves the QSP bared
        // but UNflagged, so it would serialize to the default `//` and lose its
        // quarter-space identity. Re-flag only a currently-UNflagged pure-space
        // glyph (set-only via the loop below): an already-flagged space is left
        // untouched, so a correctly parsed space never gets its flag cleared.
        if (touched || (pureSpace && !part._differsFromDefault)) movedSpaceGlyphs.push(glyph);
      }
    }
    // Pass 3: split mixed words at their space runs.
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.errorCode || !group.glyphs?.length) continue;
      if (!group.glyphs.some(g => BlissSVGBuilder.#isSpaceGlyphNode(g))) continue;
      if (BlissSVGBuilder.#isRawSpaceGroup(group)) continue;
      const runs = [];
      for (const glyph of group.glyphs) {
        const isSpace = BlissSVGBuilder.#isSpaceGlyphNode(glyph);
        const last = runs[runs.length - 1];
        if (last && last.isSpace === isSpace) last.glyphs.push(glyph);
        else runs.push({ isSpace, glyphs: [glyph] });
      }
      let keeperAssigned = false;
      const replacement = runs.map((run) => {
        if (run.isSpace) {
          const spaceGroup = { glyphs: run.glyphs };
          createdSpaceGroups.push(spaceGroup);
          movedSpaceGlyphs.push(...run.glyphs);
          return spaceGroup;
        }
        if (!keeperAssigned) {
          keeperAssigned = true;
          group.glyphs = run.glyphs;
          return group;
        }
        const wordGroup = { glyphs: run.glyphs };
        if (group.options) wordGroup.options = { ...group.options };
        // A transient option follows its word here for the same reason its
        // serializing twin does: the split produces several words where the
        // author wrote one, and both channels describe that same word.
        if (group.transientOptions) wordGroup.transientOptions = { ...group.transientOptions };
        return wordGroup;
      });
      groups.splice(i, 1, ...replacement);
      i += replacement.length - 1;
    }
    // Merge a CREATED space group into an adjacent space group (the native
    // node survives, keeping its key): '//' serialization counts N spaces as
    // N+1 slashes, so two separate neighbors would concatenate into a slash
    // run the reparse reads as one bigger group. Only normalization-created
    // groups merge — space groups the raw element API placed deliberately are
    // its documented "no automatic space management" business (GH #19 owns
    // reparse-side re-collapse).
    if (createdSpaceGroups.length > 0) {
      const created = new Set(createdSpaceGroups);
      for (let i = groups.length - 1; i > 0; i--) {
        const right = groups[i];
        const left = groups[i - 1];
        if (!created.has(right) && !created.has(left)) continue;
        if (right.errorCode || left.errorCode) continue;
        if (!BlissSVGBuilder.#isRawSpaceGroup(right) || !BlissSVGBuilder.#isRawSpaceGroup(left)) continue;
        if (created.has(left) && !created.has(right)) {
          right.glyphs.unshift(...left.glyphs);
          groups.splice(i - 1, 1);
        } else {
          left.glyphs.push(...right.glyphs);
          groups.splice(i, 1);
        }
      }
    }
    // Flag the moved space parts against their position's default space code
    // (mirrors the parser's step-4 SP/QSP resolution): the serializer emits
    // '//' only for the default, so an explicit QSP must carry
    // _differsFromDefault or its identity (and width) would be lost. Both a
    // Pass-3 split and the decoration strip above feed movedSpaceGlyphs; a bared
    // QSP whose coordinate suppressed its parse-time flag is re-flagged here.
    // ZSA is content and never a moved space glyph, so it never reaches this path.
    if (movedSpaceGlyphs.length > 0) {
      const moved = new Set(movedSpaceGlyphs);
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (!group.glyphs?.some(g => moved.has(g))) continue;
        const nextGroup = groups[i + 1];
        const isPunctuation = !!nextGroup && !BlissSVGBuilder.#isRawSpaceGroup(nextGroup)
          && nextGroup.glyphs?.length > 0
          && nextGroup.glyphs.every(g => g.shrinksPrecedingWordSpace === true);
        const defaultCode = isPunctuation ? 'QSP' : 'TSP';
        for (const glyph of group.glyphs) {
          if (!moved.has(glyph)) continue;
          const part = glyph.parts[0];
          if (part.codeName !== defaultCode) part._differsFromDefault = true;
          else delete part._differsFromDefault;
        }
      }
    }
  }

  // Space-as-part invariant (row 78, extended row 81): a space (TSP/QSP, and
  // the transient default-space SP that `//` expands to) is a word-level
  // separator, never a `;`-part — a space cannot stay a character inside a
  // word (#normalizeSpaceInvariant Pass 3 splits it out) and cannot carry a
  // decoration, so a space in a part slot is the same misplacement one level
  // down. The space part is dropped LOUDLY (MISPLACED_SPACE) from render
  // and serialization while the character still renders; a coordinate or
  // option on it dies with the part (a positionable inkless blank is ZSA's
  // job — ZSA is content and is exempt). SP is barred via a LOCAL check only:
  // it is never added to the {TSP,QSP} classifier (isSpaceGlyph), which drives
  // space-run coalescing, navigation, and counting (feedback_zsa_is_content_not_space).
  // A single-part REAL-space glyph (TSP/QSP) IS the space itself and is
  // untouched; a lone transient SP (not a real space glyph, so a mutation can
  // strand it as a lone character part) instead drops to an empty glyph rather
  // than re-emitting bare and reparsing as a word separator (row 81). A
  // fail-flagged word re-emits verbatim (replay fidelity) and an atomic
  // compound-indicator glyph's anatomy is definition-owned, so both are
  // skipped, mirroring #normalizeIndicatorInvariant. define() already rejects
  // a glyph definition referencing a space, so the isIndicator skip only
  // matters for hand-authored object input. Uncertainty exemption (the
  // indicator invariant's exemption 2, one rule over): when the non-space
  // remainder holds no definition-known part (only an unknown code like `ZZ9`,
  // whose nature is uncertain), the drop is skipped, applied uniformly to
  // TSP/QSP/SP; the character already fail-renders and the unknown-code warning
  // is the visibility. An all-space list still drops (the empty glyph is inert
  // pure state). Runs FIRST among the
  // rebuild normalizers: before #normalizeSpaceInvariant so an emptied glyph
  // gets its head-designation cleanup, and before
  // #normalizeIndicatorInvariant so a space is never a content witness that
  // convicts a trailing indicator (`B86;QSP` keeps B86).
  #normalizeSpacePartInvariant() {
    for (const group of this.#rawBlissObj.groups ?? []) {
      if (group.errorCode) continue;
      for (const glyph of group.glyphs ?? []) {
        if (glyph.isIndicator === true) continue;
        const parts = glyph.parts;
        if (!Array.isArray(parts) || parts.length === 0) continue;
        // A lone REAL-space glyph (TSP/QSP) IS the space itself and is
        // untouched; a lone transient SP is processed (it drops to an empty
        // glyph below) instead of surviving to re-emit bare. A lone non-space
        // part has no misplaced space and falls through the loop as a no-op.
        if (parts.length === 1 && isSpaceGlyph(parts[0]?.codeName)) continue;
        const misplaced = [];
        let remainderCount = 0;
        let knownRemainder = false;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          // SP is barred here via a local check but never added to isSpaceGlyph
          // (the {TSP,QSP} classifier), per feedback_zsa_is_content_not_space.
          if (p.codeName === 'SP' || isSpaceGlyph(p.codeName)) {
            misplaced.push(i);
            continue;
          }
          remainderCount++;
          if (!p.error && ((p.codeName && blissElementDefinitions[p.codeName]) || p.parts?.length > 0)) {
            knownRemainder = true;
          }
        }
        if (misplaced.length === 0) continue;
        if (remainderCount > 0 && !knownRemainder) continue;
        for (const i of misplaced) {
          const p = parts[i];
          const source = `${p.codeName}${BlissSVGBuilder.#positionSuffix(p.x, p.y)}`;
          this.#mutationWarnings.push({
            code: WARNING_CODES.MISPLACED_SPACE,
            message: `A space is a word separator, not a character part, so "${source}" was dropped.`,
            source,
          });
        }
        for (let k = misplaced.length - 1; k >= 0; k--) {
          parts.splice(misplaced[k], 1);
        }
      }
    }
  }

  // Indicator-sequence invariant (row 67): an indicator part is only
  // meaningful inside the maximal trailing indicator run of its glyph's part
  // list (the character's indicator row: BASE;INDICATOR). An indicator that
  // precedes default-positioned known content is a misplaced decoration:
  // dropped LOUDLY (MISPLACED_INDICATOR_PART) from render and serialization,
  // the warn+drop model of MISPLACED_HEAD_MARKER and
  // MISPLACED_SPACE_DECORATION, while the character still renders. Three
  // deliberate exemptions:
  //  1. Content the author explicitly positioned does not convict a preceding
  //     indicator: a compound indicator's decomposed serialization
  //     (`B86;SDOT:3,4`) is hand-placed anatomy and must round-trip
  //     (composition portability). "Explicitly positioned" asks whether an
  //     axis was WRITTEN, not whether its value is non-zero, so `:0,0`, `:0,`,
  //     `:,0` and `:0` carry the exemption too: serialization keeps a written
  //     axis whatever its value, so the exemption survives a round-trip. A
  //     part that wrote no axis at all (`C8`, `C8:,`) is still a witness.
  //  2. A part whose nature is uncertain (unknown code awaiting a definition,
  //     or a malformed error node) is no witness: the character already
  //     fail-renders, and dropping on uncertainty would destroy input the
  //     unknown-code retention contract keeps.
  //  3. A compound-indicator glyph (glyph-level isIndicator) is an atomic
  //     unit whose internal anatomy is definition-owned.
  // Enforced here, the chokepoint every input surface and mutation route
  // passes through (see #normalizeSpaceInvariant above for the rationale).
  #normalizeIndicatorInvariant() {
    for (const group of this.#rawBlissObj.groups ?? []) {
      if (group.errorCode) continue;
      for (const glyph of group.glyphs ?? []) {
        if (glyph.isIndicator === true) continue;
        const parts = glyph.parts;
        if (!Array.isArray(parts) || parts.length < 2) continue;
        let lastWitness = -1;
        for (let i = parts.length - 1; i >= 1 && lastWitness === -1; i--) {
          const p = parts[i];
          if (p.isIndicator === true || p.error) continue;
          if (p.x !== undefined || p.y !== undefined) continue;
          if ((p.codeName && blissElementDefinitions[p.codeName]) || p.parts?.length > 0) {
            lastWitness = i;
          }
        }
        if (lastWitness === -1) continue;
        const misplaced = [];
        for (let i = 0; i < lastWitness; i++) {
          if (parts[i].isIndicator === true) misplaced.push(i);
        }
        for (const i of misplaced) {
          const p = parts[i];
          const source = `${p.codeName}${BlissSVGBuilder.#positionSuffix(p.x, p.y)}`;
          this.#mutationWarnings.push({
            code: WARNING_CODES.MISPLACED_INDICATOR_PART,
            message: `An indicator can only follow its base parts at the end of a character (BASE;INDICATOR), so "${source}" was dropped.`,
            source,
          });
        }
        for (let k = misplaced.length - 1; k >= 0; k--) {
          parts.splice(misplaced[k], 1);
        }
      }
    }
  }

  // Positioning family (GH #18): `x`, `y` and the two kerning values are the
  // options a LAYOUT reads rather than an attribute the renderer copies, so
  // they need the same promotion an options object gets when it arrives as
  // DSL text: `x`/`y` onto the node as numbers, and any kerning spelling onto
  // the single numeric key. The DSL surface gets that inside the parser; every
  // other surface (constructor object input, `setOptions`, and the opts
  // argument of the add/insert/replace family) arrives here, where an option
  // set after construction lands on the authoring structure and never sees a
  // parse. Without this the option was accepted, serialized, round-tripped,
  // and changed nothing, with no warning.
  //
  // Runs on `#rawBlissObj` rather than the render clone, so the promotion also
  // reaches what `toString()`/`toJSON()` emit: an option set through the API
  // serializes exactly like the DSL spelling of the same value. It is
  // idempotent, so a later rebuild re-normalizes nothing; the warnings ride
  // `_parseWarnings`, the channel that survives a rebuild, so a conflict
  // reported once is still reported after an unrelated mutation.
  // Gates the transient channel on the AUTHORING structure, so both surfaces
  // that can fill it (the setters and constructor object input) meet one rule
  // at one site, and so an offending key is dropped once rather than re-judged
  // on every rebuild. Three refusals, each of which would otherwise be a silent
  // no-op with a plausible-looking key sitting in the bag:
  //
  //   - a key the library consumes before the render copy is taken, which a
  //     transient spelling could never reach (TRANSIENT_REFUSED_OPTION_KEYS);
  //   - a name that is not a legal attribute name, including `on*` handlers,
  //     which the render path already skips silently at every level;
  //   - anything at all on a TSP/QSP space, which has no ink to decorate. That
  //     mirrors the space rule for ordinary options exactly, including its code.
  //
  // Warnings go to the one-time channel, like the space rule's own, because the
  // offending key is deleted here: a per-rebuild channel would report it once
  // and then forget it ever happened.
  #normalizeTransientInvariant() {
    const drop = (bag, keys, code, message) => {
      for (const key of keys) delete bag[key];
      this.#mutationWarnings.push({ code, message: message(keys), source: keys[0] });
    };
    const visit = (node, onSpace) => {
      const bag = node.transientOptions;
      if (bag && typeof bag === 'object') {
        const keys = Object.keys(bag);
        if (onSpace) {
          if (keys.length > 0) {
            drop(bag, keys, WARNING_CODES.MISPLACED_SPACE_DECORATION,
              (k) => `A space cannot carry an option, so the transient "${k.join('", "')}" was dropped.`);
          }
        } else {
          const refused = keys.filter(k => TRANSIENT_REFUSED_OPTION_KEYS.has(k));
          if (refused.length > 0) {
            drop(bag, refused, WARNING_CODES.MISPLACED_TRANSIENT_OPTION,
              (k) => `"${k.join('", "')}" cannot be a transient option: the value is read while the composition is built, not while it is drawn, so it would never reach the picture. Set it with setOptions() instead.`);
          }
          const unsafe = Object.keys(bag).filter(k => !isSafeAttributeName(k));
          if (unsafe.length > 0) {
            drop(bag, unsafe, WARNING_CODES.UNSAFE_ATTRIBUTE_NAME,
              (k) => `"${k.join('", "')}" is not a usable attribute name (event handlers and names outside letters, digits and dashes are refused), so it was dropped and will not be emitted.`);
          }
        }
        if (Object.keys(bag).length === 0) delete node.transientOptions;
      }
      // The glyph-level space test is defensive: the space invariant runs just
      // before this pass and splits a mixed word into pure-space groups, so
      // today every space is caught one level up. Keeping it makes "a space
      // carries no transient decoration" an invariant rather than an artifact
      // of that ordering (probe: temp/probe-c7-m5.mjs).
      for (const glyph of node.glyphs ?? []) visit(glyph, onSpace || BlissSVGBuilder.#isSpaceGlyphNode(glyph));
      for (const part of node.parts ?? []) visit(part, onSpace);
    };
    visit(this.#rawBlissObj, false);
    for (const group of this.#rawBlissObj.groups ?? []) {
      visit(group, BlissSVGBuilder.#isRawSpaceGroup(group));
    }
  }

  #normalizePositioningInvariant() {
    const raw = this.#rawBlissObj;
    const warnings = [];
    // A position arrives on two channels, the promoted field and the options
    // bag, and every scope reads both. Field first, and the order is
    // load-bearing: see normalizePositionFields.
    const normalize = (node, level) => {
      normalizePositionFields(node, warnings);
      extractPositionFromOptions(node, warnings, level);
    };
    // Parts nest (a composite part carries its own), and the parser promotes at
    // every depth, so this does too: a nested part is reachable through the API
    // (`glyph(0).part(0).part(1)`), where any other option already works.
    const walkParts = (parts) => {
      for (const part of parts ?? []) {
        normalize(part, 3);
        walkParts(part.parts);
      }
    };
    normalize(raw, 0);
    for (const group of raw.groups ?? []) {
      normalize(group, 1);
      for (const glyph of group.glyphs ?? []) {
        normalize(glyph, 2);
        // Kerning attaches to a character: it is the gap before THIS glyph, and
        // no other level has a spelling for it. There are no markers on this
        // path, so every kerning value present was written as an option.
        const kerning = kerningOptionEntries(glyph.options);
        if (kerning.length > 0) resolveKerning(glyph, undefined, kerning, warnings);
        walkParts(glyph.parts);
      }
    }
    if (warnings.length) (raw._parseWarnings ??= []).push(...warnings);
  }

  // Retention family (row 31): malformed SYNTAX is a parse-time warning, never
  // persisted. A malformed part token is a pure error node (an `{error}` node
  // with no codeName and no nested parts): `!` (Invalid format) or a code with
  // an unparseable `:x,y` suffix (MALFORMED_COORDINATES). Dropping only the bad
  // part would let a valid sibling collapse into a DIFFERENT valid character
  // (the E->F hazard: `B291;!;B97` -> `B291;B97`), so the WHOLE character is
  // dropped from render and BOTH serializations, keeping the parse-time warning
  // as the only trace (no persisted `{error}` node). Exempt: an UNKNOWN code
  // (`ZZ9`, a codeName that cannot yet resolve) is CONTENT, kept + warned
  // (define it later and it renders); a word/composite misused as a part
  // (WORD_AS_PART / COMPOSITE_AS_PART) carries a codeName or nested parts and
  // re-emits visibly; a compound-indicator glyph (glyph-level isIndicator) is
  // atomic. A fail-flagged word (group.errorCode) is dropped whole by
  // #normalizeFailedWordInvariant, so its glyphs are skipped. Runs FIRST among
  // the rebuild normalizers so a doomed glyph raises exactly one drop warning,
  // not also a space-part or indicator warning.
  #normalizeMalformedPartInvariant() {
    for (const group of this.#rawBlissObj.groups ?? []) {
      if (group.errorCode) continue;
      const glyphs = group.glyphs;
      if (!Array.isArray(glyphs)) continue;
      const doomed = [];
      for (let gi = 0; gi < glyphs.length; gi++) {
        const glyph = glyphs[gi];
        if (glyph.isIndicator === true) continue;
        const parts = glyph.parts;
        if (!Array.isArray(parts)) continue;
        const errorParts = parts.filter(p => p.error && !p.codeName && !(p.parts?.length > 0));
        if (errorParts.length === 0) continue;
        for (const p of errorParts) {
          // Mirror BlissElement's leaf-fail warning so the visibility survives
          // the drop: a code with a bad `:x,y` suffix names the coordinate
          // error, any other malformed token is UNKNOWN_CODE.
          if (p.errorCode === WARNING_CODES.MALFORMED_COORDINATES) {
            this.#mutationWarnings.push({ code: WARNING_CODES.MALFORMED_COORDINATES, message: p.error, source: p.error });
          } else {
            this.#mutationWarnings.push({ code: WARNING_CODES.UNKNOWN_CODE, message: `Unknown or invalid code: "${p.error}"`, source: p.error });
          }
        }
        doomed.push(gi);
      }
      for (let k = doomed.length - 1; k >= 0; k--) glyphs.splice(doomed[k], 1);
    }
  }

  // Retention family (row 80): a malformed word-level indicator (a doubled `;;`,
  // or a `;;` bound to a multi-word alias) fails the WHOLE word at parse
  // (group.errorCode = MALFORMED_WORD_INDICATOR, group.errorSource = the raw
  // text). The failed word is not content: it is dropped from render and BOTH
  // serializations, reserving no extent, and neither errorCode nor errorSource
  // is persisted. The parse-time warning (formerly surfaced by the element's L1
  // fail-render, gone with the group) is re-emitted here before the drop so it
  // survives; the drop makes the sweep warn once, not per rebuild. Runs before
  // #normalizeSpaceInvariant so its adjacent-space merge sees the post-drop
  // layout (a dropped middle word can leave two neighbor spaces).
  #normalizeFailedWordInvariant() {
    const groups = this.#rawBlissObj.groups;
    if (!Array.isArray(groups)) return;
    const survivors = [];
    for (const group of groups) {
      if (group.errorCode) {
        this.#mutationWarnings.push({
          code: group.errorCode,
          message: group.error,
          source: group.errorSource,
        });
        continue;
      }
      survivors.push(group);
    }
    if (survivors.length !== groups.length) this.#rawBlissObj.groups = survivors;
  }

  #rebuild() {
    this.#generation++;
    this.#elementsCache = undefined;
    this.#groupsCache = undefined;
    this.#warnings = [];

    this.#normalizeMalformedPartInvariant();
    this.#normalizeFailedWordInvariant();
    this.#normalizeSpacePartInvariant();
    this.#normalizeSpaceInvariant();
    this.#normalizeTransientInvariant();
    // Before the indicator invariant, which reads a part's `x` to decide
    // whether it is explicitly positioned (a positioned part does not convict a
    // preceding indicator), and after the space one, which strips a space's
    // option and its coordinate separately and would otherwise report one
    // written decoration twice.
    this.#normalizePositioningInvariant();
    this.#normalizeIndicatorInvariant();
    BlissSVGBuilder.#assignKeys(this.#rawBlissObj);

    // Re-derive position-dependent composite-as-part flags on the AUTHORING
    // structure (#rawBlissObj), before the render clone: a mutation (insertPart
    // via its `H;<code>` scaffold, removePart) can move a part to/from the
    // leading slot, staling the parse-time flag. Serialization reads
    // #rawBlissObj, so the flag must be accurate there, not only on the clone:
    // a genuinely-failed part re-emits by its written name (row 80) while a
    // legal leading alias re-flattens. reflag only touches error/errorCode (no
    // expansion), so it is safe on the base-only structure; the clone inherits.
    BlissParser.reflagCompositeParts(this.#rawBlissObj);
    const blissObj = structuredClone(this.#rawBlissObj);

    // R14 resolve site 1 (render): merge each group's word-level indicator
    // overlay onto its head glyph, on the clone only so #rawBlissObj (and the
    // handles that reference it) stay base-only. The head is the explicitly
    // marked glyph (isHeadGlyph), else the query-time fallback (R15 WS-4) so a
    // structural mutation re-derives it instead of floating onto a stale stamp.
    for (const group of blissObj.groups ?? []) {
      if (group.wordIndicators && group.glyphs?.length) {
        const headIndex = resolveOverlayHeadIndex(group.glyphs);
        // Every glyph is empty: nothing can carry the rendered overlay. The
        // stored overlay persists (F3 pure-state contract) but renders
        // nothing, exactly like the reparse of the serialized form.
        if (headIndex === -1) continue;
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

    // Captured BEFORE the options pass, which expands the bulk spellings
    // (`margin` becomes four keys, `grid-color` becomes five) and so can no
    // longer name what was written.
    const writtenKeys = Object.keys({
      ...(blissObj.options ?? {}), ...(blissObj.transientOptions ?? {}),
    });
    // All three sets below match the spelling AS WRITTEN, with no camelCase
    // canonicalization, because each answers "did this key produce that value"
    // and the options pass dispatches on the curated spelling alone.
    //
    // Every channel that can deliver an options bag resolves a curated name on
    // the way in: a bracket through `#parseOptions`, the options argument and
    // the mutation setters through `#toRaw`, a definition's defaults through
    // `#toCuratedSpelling`, and a composition object through the ingest walk.
    // So a key still spelled in camelCase by the time it reaches here is a name
    // nobody owns: it lands in the second bag, is emitted as typed and shapes
    // nothing. Canonicalizing here would name such a key as displaced, or as a
    // value to reduce, on the strength of work it never did.
    const writtenGeometryOptions = writtenKeys.filter(key => GEOMETRY_OPTION_KEYS.has(key));
    // The wider set, for the overflow report below: `svg-height` and the three
    // spacings never shape the viewBox, so they are absent above, but each can
    // put a number in the root that the format cannot carry.
    const writtenSizeOptions = writtenKeys.filter(key => SIZE_OPTION_KEYS.has(key));
    // Same rule, asked of the attribute channel: `[grid;gridColor=blue]` paints
    // nothing, so naming it as displaced would report a collision that never
    // happened.
    const writtenOptions = new Set(writtenKeys);

    this.#processAllOptions(blissObj, true);

    const { charSpace, wordSpace, externalGlyphSpace, errorPlaceholder, ...remainingOptions } = blissObj.options ?? {};
    this.#sharedOptions = {
      charSpace: charSpace ?? 2,
      wordSpace: wordSpace ?? 8,
      externalGlyphSpace: externalGlyphSpace ?? 0.8,
      warnings: this.#warnings,
      errorPlaceholder: errorPlaceholder === true,
      // Parsed once at module load and injected into the tree at RENDER time,
      // which is after the options pass has run over everything else, so it
      // needs its own. REFSQUARE carries a definition default (the dashes that
      // say "this is a placeholder"), and an option that never met the pass sits
      // in the computed bag under the author's spelling, where no emitter reads
      // it: the placeholder would draw as a solid square. Processed on a clone,
      // because the constant is shared by every builder and every rebuild.
      errorPlaceholderParts: (() => {
        const parts = structuredClone(ERROR_PLACEHOLDER_PARTS);
        for (const part of parts) this.#processAllOptions(part, false);
        return parts;
      })(),
      keys: new Set(),
    };
    if (blissObj._parseWarnings) {
      this.#warnings.push(...blissObj._parseWarnings);
      delete blissObj._parseWarnings;
    }
    blissObj.options = remainingOptions;
    this.#processedOptions = blissObj.options;

    // Global options split three ways: the named vocabulary was consumed above,
    // a `<layer>--<attribute>` key goes to the layer it names, and everything
    // else goes to the root.
    // The two computed values that also reach the markup, resolved to the names
    // they reach it under. Everything else the library computes is consumed by
    // the emitters, and everything the author wrote is emitted exactly as typed.
    //
    // The rename happens HERE, while the published walk is being built, and not
    // inside the loop below. A lookup in the loop would reach the author's keys
    // too, and `strokeWidth` is a map KEY as well as an internal name: a bracket
    // can spell it, it is not curated vocabulary (the curated set holds kebab),
    // so it lands in the author's bag and a shared lookup renamed it to
    // `stroke-width` on its way out. That left one spelling half-working after
    // the split, setting the attribute while computing nothing, which is exactly
    // what the separation exists to end.
    //
    // Each entry is [the spelling a bracket carries, the attribute name, value].
    // The first is what a warning names: kebab-casing exactly these two gives
    // `stroke-width` and `color`, the options an author actually writes.
    //
    // At the ROOT this walk does not decide the markup, which surprises everyone
    // who reads it: `#svgCode` builds the root tag from its own paint defaults,
    // where `stroke` is the computed colour and `stroke-width` the computed
    // width, and the value this walk writes lands on top of an identical one.
    // What it decides is the REPORT. Registering the two names here is what lets
    // a `root--stroke` collide with a curated `color` and say so; delete the
    // walk and the markup is byte-identical while the collision goes silent.
    // Element scope is the opposite: there the walk is the only thing that emits
    // them.
    const publishedPairs = [...PUBLICATION_MAP].flatMap(([name, attribute]) =>
      // Own-key test, not `in`, which walks the prototype chain.
      Object.hasOwn(this.#processedOptions, name)
        ? [[camelToKebab(name), attribute, this.#processedOptions[name]]]
        : []);
    this.globalSvgAttributes = {};
    this.#layerAttributes = {};
    // Which key wrote each root attribute, and whether it named the root
    // explicitly. Explicit beats resolved in EITHER order, so this is an
    // invariant rather than an artifact of the iteration order, the same way
    // the element emitter resolves an explicit `stroke` against a `color`.
    const rootAttributeSource = new Map();
    // Names that arrived as `root--`. The vector-effect relocation reads this:
    // it repairs the library's own default destination, so it belongs to the
    // bare channel and never to a key that named the root deliberately.
    this.#rootPrefixedNames = new Set();
    const setRootAttribute = (name, key, explicit, value) => {
      const prior = rootAttributeSource.get(name);
      // Two bare keys are one channel and keep the silence they have always
      // had. NOT last-wins, though it reads that way: the walk above visits the
      // published pair before the author's keys, so a raw `stroke` lands second
      // and beats a curated `color` whatever order they were written in. The
      // report exists for the collision this feature creates, between a bare key
      // and the `root--` spelling of the same attribute.
      if (prior && (explicit || prior.explicit)) {
        const winner = explicit ? key : prior.key;
        const loser = explicit ? prior.key : key;
        this.#warnings.push({
          code: WARNING_CODES.MULTIPLE_ATTRIBUTE_VALUES,
          message: `"${winner}" and "${loser}" both set "${name}" on the root, and only one value can be written there, so "${winner}" was used: a key that names its target beats one that has to be resolved to it. Remove whichever you did not mean.`,
          source: loser,
        });
        if (!explicit) return;
      }
      rootAttributeSource.set(name, { key, explicit });
      if (explicit) this.#rootPrefixedNames.add(name);
      this.globalSvgAttributes[name] = value;
    };

    // Whether the element a target names is painted at all, decided from the
    // processed options exactly as the emitters decide it. A report about what an
    // attribute DOES is silent where nothing draws; UNKNOWN_LAYER, which reports
    // whether a target EXISTS, is deliberately not gated this way.
    //
    // Per element for the background, where the paper rect and the three zones
    // are mutually exclusive and that choice is already settled here: naming a
    // zone the author never asked for would name an element their output does
    // not contain. Per LAYER for the grid, because which lines survive a crop is
    // known only at render, where a warning would double on every repeated
    // svgCode read. Anything else counts as drawn, so a painted element added
    // later reports rather than falling silent.
    const { grid, background, backgroundTop, backgroundMid, backgroundBottom } = this.#processedOptions;
    const hasZones = Boolean(backgroundTop || backgroundMid || backgroundBottom);
    const backgroundDraws = new Map([
      ['backgroundZone', !hasZones && Boolean(background)],
      ['zoneTop', hasZones && Boolean(backgroundTop || background)],
      ['zoneMid', hasZones && Boolean(backgroundMid || background)],
      ['zoneBottom', hasZones && Boolean(backgroundBottom || background)],
    ]);
    const elementIsDrawn = (element) => {
      if (element.startsWith('grid')) return Boolean(grid);
      if (backgroundDraws.has(element)) return backgroundDraws.get(element);
      return true;
    };
    // A container is drawn when any child it wraps is. Deliberately not
    // elementIsDrawn, whose true-by-default answer is meant for a painted
    // element it has not been taught about: `background` is a wrapper rather
    // than one of the rects it knows, so that answer would be true with nothing
    // drawn at all. Each container is named, and one added later without an arm
    // here reports whether or not it drew, which is loudly wrong rather than
    // silently inheriting the background's answer.
    const containerIsDrawn = (layer) => {
      if (layer === 'grid') return Boolean(grid);
      if (layer === 'background') return [...backgroundDraws.values()].some(Boolean);
      return true;
    };

    // Published pair first, then the author's keys. Two bags have no order
    // between them, so the order is stated here rather than inherited from how
    // one bag happened to be built. It reproduces exactly what that bag did: the
    // options pass rebuilt it with every curated key ahead of every raw one, so
    // a raw `stroke` landed second and beat a curated `color` whatever order the
    // author wrote the two in.
    for (const [key, attrName, value] of [
      ...publishedPairs,
      // An author's key IS its own attribute name. Nothing renames it.
      ...Object.entries(blissObj.authoredOptions ?? {}).map(([k, v]) => [k, k, v]),
    ]) {
      if (INTERNAL_OPTIONS.has(key)) continue;
      if (isLayerAttributeKey(key)) {
        // The prefixed channel is RAW: the name after `--` is emitted verbatim,
        // with no alias remapping and no kebab-casing. That is what makes an
        // attribute reachable whose name a named option has taken (`color`),
        // and what makes a camelCase SVG attribute expressible.
        const target = parseLayerAttributeKey(key);
        if (!target) {
          // Kept in the options bag so it round-trips, on the UNKNOWN_ family's
          // logic: `foo` may become a layer later, exactly as an unknown code
          // may be define()d afterwards. Reported so it is never silently inert.
          this.#warnings.push({
            code: WARNING_CODES.UNKNOWN_LAYER,
            message: unresolvedLayerKeyMessage(key),
            source: key,
          });
          continue;
        }
        if (!isSafeAttributeName(target.attribute)) continue;
        // RAW means we do not rename or reinterpret the attribute. It does not
        // mean we will help write a file that cannot be parsed, or markup that
        // reads as a working link and is not one, so two guards judge the NAME
        // here. NEITHER of them matches what the root does, for opposite
        // reasons: a name that declares the document breaks it wherever it
        // lands, so that guard reaches further than the root; the anchor family
        // has a real destination at the root (the <a> wrap) and none on a
        // layer, so that guard exists here and nowhere else. The library's own
        // root stamp is the third case, and collides with nothing one level
        // down, so it is left alone here.
        if (isDocumentDefiningAttribute(target.attribute)) {
          this.#warnings.push({
            code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME,
            message: reservedAttributeMessage(target.attribute),
            source: key,
          });
          continue;
        }
        if (ANCHOR_ATTRIBUTE_NAMES.includes(target.attribute)) {
          this.#warnings.push({
            code: WARNING_CODES.MISPLACED_LINK_ATTRIBUTE,
            // "target", not "layer": the guard covers every class the library
            // writes, so calling `grid-line--sky` a layer names it as something
            // it is not. The root is the one target with a name of its own.
            message: `"${target.attribute}" only does anything on an <a> element, and ${target.layer === 'root' ? 'the root <svg>' : `the ${target.layer} target`} is not one, so it was dropped instead of being emitted as markup that looks like a working link.`,
            source: key,
          });
          continue;
        }
        // Judged after the refusals above, so a name we drop is never also
        // described as landing somewhere. No `continue` below it: the value IS
        // emitted where it was asked for, and only the silence about it goes.
        const container = CONTAINER_SHADOWED_ATTRIBUTES.get(target.layer);
        if (container?.names.includes(target.attribute) && containerIsDrawn(target.layer)) {
          this.#warnings.push({
            code: WARNING_CODES.MISPLACED_CONTAINER_ATTRIBUTE,
            // What an author can observe, and nothing about the mechanism: the
            // paint names are inherited and the child's own value beats them,
            // while `x`, `y`, `width`, `height` and `d` are geometry a group
            // never carries, so naming inheritance would be false for half the
            // list.
            message: `"${key}" was emitted on the ${target.layer} group, but each of its children carries its own "${target.attribute}", and the child's value is the one that takes effect, so the one written on the group never shows. Write "${container.childTarget}--${target.attribute}" to reach the children themselves.`,
            source: key,
          });
        }
        if (target.layer === 'root') {
          // The prefix suspends name RESOLUTION, never name GUARDS, so a
          // prefixed root key faces every guard the bare branch faces. It goes
          // into the same set the bare keys build, which is what lets the
          // geometry displacement report and the root's attribute merge see it
          // without knowing it arrived prefixed.
          if (isLibraryOwnedRootAttribute(target.attribute)) {
            this.#warnings.push({
              code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME,
              message: reservedAttributeMessage(target.attribute),
              source: key,
            });
            continue;
          }
          setRootAttribute(target.attribute, key, true, value);
          continue;
        }
        (this.#layerAttributes[target.layer] ??= {})[target.attribute] = value;
        continue;
      }
      if (!isSafeAttributeName(key)) continue;
      if (isDocumentDefiningAttribute(attrName) || isLibraryOwnedRootAttribute(attrName)) {
        this.#warnings.push({
          code: WARNING_CODES.RESERVED_ATTRIBUTE_NAME,
          message: reservedAttributeMessage(attrName),
          source: key,
        });
        continue;
      }
      setRootAttribute(attrName, key, false, value);
    }

    // A raw target displaces a written curated option when both reach the same
    // attribute on the same painted element. Judged on the two WRITTEN keys:
    // MULTIPLE_ reports that the input said a thing twice, which is why two
    // equal values still raise it. A raw key that displaces only a library
    // DEFAULT is silent, since one statement from the author is not two.
    // Collected before it is reported, because one raw key reaching five line
    // families is ONE statement about the input, and the reader still needs to
    // know which elements it reached.
    //
    // Read from #layerAttributes and never from the options bag: a refused raw
    // key (unsafe name, reserved name, link attribute) is still in the bag and
    // reaches no markup, so the bag would report a displacement that never
    // happened. The map is what the emitters actually consume.
    const displaced = new Map();
    for (const [element, attributes] of Object.entries(CURATED_ATTRIBUTE_SOURCES)) {
      if (!elementIsDrawn(element)) continue;
      const targets = ELEMENT_CLASSES[element].map(targetOfClass);
      for (const [attribute, chain] of Object.entries(attributes)) {
        // The most specific target the author wrote for this element wins, the
        // same class-order rule the emitter applies.
        const rawTarget = targets
          .filter(t => Object.hasOwn(this.#layerAttributes[t] ?? {}, attribute)).at(-1);
        const curatedKey = chain.find(k => writtenOptions.has(k));
        if (!rawTarget || !curatedKey) continue;
        const rawKey = `${rawTarget}--${attribute}`;
        const id = `${rawKey} ${curatedKey}`;
        if (!displaced.has(id)) displaced.set(id, { rawKey, curatedKey, attribute, elements: [] });
        displaced.get(id).elements.push(targets.at(-1));
      }
    }
    for (const { rawKey, curatedKey, attribute, elements } of displaced.values()) {
      this.#warnings.push({
        code: WARNING_CODES.MULTIPLE_ATTRIBUTE_VALUES,
        message: `"${rawKey}" and "${curatedKey}" both set "${attribute}" on ${elements.join(', ')}, so "${rawKey}" was used: a key that names its target beats one that has to be resolved to it. Remove whichever you did not mean.`,
        source: curatedKey,
      });
    }

    // A written viewBox states the value the geometry options exist to compute,
    // so it wins and they are named rather than left looking effective.
    if (this.globalSvgAttributes['viewBox'] && writtenGeometryOptions.length > 0) {
      this.#warnings.push({
        code: WARNING_CODES.MULTIPLE_GEOMETRY_VALUES,
        message: `The viewBox was written directly, so "${writtenGeometryOptions.join('", "')}" no longer shapes it. Remove the viewBox to size the picture with the options, or remove the options to size it by hand.`,
        source: writtenGeometryOptions.join(', '),
      });
    }

    this.composition = new BlissElement(blissObj, { sharedOptions: this.#sharedOptions });

    // The output side. Every value that got here passed its own gate, so what
    // is judged is the arithmetic: two terms can sum past the largest double,
    // and the six-times presentation multiplier can run off the end of one that
    // survived on its own. No input gate can see either.
    //
    // It runs here rather than in the `#svgCode` getter so the warning is
    // raised by construction like every other one. From the getter, this single
    // code would be absent until somebody read the markup, and would need its
    // own guard against piling up on a second read.
    const carriedNumbers = (geometry) => [
      geometry.viewBoxX, geometry.viewBoxY, geometry.viewBoxWidth, geometry.viewBoxHeight,
      geometry.svgWidth, geometry.svgHeight,
    ];
    if (!carriedNumbers(this.#computeGeometry()).every((value) => Number.isFinite(value))) {
      // Removing them IS the fallback: the getter's own `?? 0.75` and `?? 0`
      // then supply the defaults, so the picture comes out sized exactly as it
      // would have been had none of them been written, and `#computeGeometry`
      // needs no second mode. A spacing is the one cause this cannot answer,
      // because it is baked into the composition long before the geometry can
      // be judged; the report is the whole remedy there.
      for (const key of COMPUTED_GEOMETRY_INPUTS) delete this.#processedOptions[key];
      // Whether the drop WORKED is a different question from whether a size
      // option was written, and only the first is any use to the author: a
      // spacing is in `writtenSizeOptions` because it is a value to reduce,
      // yet absent from the list just deleted, for the reason above. Asking
      // the arithmetic is the only honest test. It costs one pure pass on a
      // path that has already failed, and it stays right if the set of causes
      // the fallback cannot answer ever changes.
      const repaired = carriedNumbers(this.#computeGeometry()).every((value) => Number.isFinite(value));
      // Three outcomes, and the one that names nothing leads. A glyph position or a
      // kerning value written as an OPTION (`[x=1e308]>B291`) gates on finite
      // alone, so it widens the composition from ELEMENT scope, where this
      // builder-scope set cannot see it. Naming the options anyway printed an
      // empty pair of quotes and told the author to reduce nothing.
      // Only the repaired arm may accuse the options it names. There, dropping
      // them put the size back, so they demonstrably produced it. In the
      // surviving arm they demonstrably did not, and one of them can be
      // entirely innocent: `[char-space=2]||[x=1e308]>B291` names `char-space`
      // at its own default, because the position that really caused it sits at
      // element scope where this builder-scope set cannot see it. So that arm
      // states the outcome, offers the names as somewhere to look, and names
      // the other cause as well, which is the remedy the empty arm gives and
      // which is otherwise unreachable the moment any size option is written.
      const names = `"${writtenSizeOptions.join('", "')}"`;
      this.#warnings.push({
        code: WARNING_CODES.OUT_OF_RANGE_COMPUTED_GEOMETRY,
        message: writtenSizeOptions.length === 0
          ? `The content works out to a picture size the SVG format cannot carry, and no option that sizes the picture was written to drop. Reduce the positions or kerning that spread it until the width, height and viewBox come out finite.`
          : repaired
            ? `${names} works out to a picture size the SVG format cannot carry, so every option that sizes the picture was dropped. Reduce the values until the width, height and viewBox come out finite.`
            : `The picture works out to a size the SVG format cannot carry, and dropping the options that size it did not undo that, so the picture still carries that size. Reduce ${names}, or the positions and kerning that spread the composition, until the width, height and viewBox come out finite.`,
        source: writtenSizeOptions.join(', '),
      });
    }
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
    if (!Number.isInteger(index) || index < 0 || index >= indices.length) return null;
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
    if (!Number.isInteger(index) || index < 0 || index >= groups.length) return null;
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
    if (!Number.isInteger(flatIndex) || flatIndex < 0) return null;
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
    if (!Number.isInteger(flatIndex) || flatIndex < 0) return null;
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
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted appends an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addGroup(code, opts) {
    assertCodeArg('addGroup', code);
    assertOptsArg('addGroup', opts);
    const nonSpaceCount = this.#getNonSpaceGroupIndices().length;
    return this.insertGroup(nonSpaceCount, code, opts);
  }

  /**
   * Inserts a new glyph group at the given semantic (non-space) index
   * with automatic space management.
   * @param {number} index - Semantic non-space group index
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted inserts an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  insertGroup(index, code, opts) {
    assertCodeArg('insertGroup', code);
    assertOptsArg('insertGroup', opts);
    if (!Number.isInteger(index)) return this;
    const newGroup = this.#parseGroupWithOpts(code, opts);
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
   * An omitted, empty, or whitespace-only code appends an empty glyph.
   * @param {string} [code] - DSL code string
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addGlyph(code, opts) {
    assertCodeArg('addGlyph', code);
    assertOptsArg('addGlyph', opts);
    const indices = this.#getNonSpaceGroupIndices();
    if (indices.length === 0) {
      // Empty builder: validate at glyph level FIRST. The scaffold group is
      // attached only after the handle call succeeds, so a rejected arg
      // leaves the builder untouched, and opts land at glyph level exactly
      // as they do on a non-empty builder.
      const newGroup = { glyphs: [] };
      new ElementHandle(this.#mutationCtx, 1, newGroup).addGlyph(code, opts);
      this.#rawBlissObj.groups.push(newGroup);
      this.#rebuild();
      return this;
    }
    const lastGi = indices[indices.length - 1];
    const rawGroup = this.#rawBlissObj.groups[lastGi];
    const handle = new ElementHandle(this.#mutationCtx, 1, rawGroup);
    handle.addGlyph(code, opts);
    return this;
  }

  /**
   * Appends a part to the last non-space group's last glyph (on an empty
   * document, creates the group and a glyph around the part).
   * A part references a shape, so an omitted or empty code throws;
   * use addGlyph('') to reserve an empty slot instead.
   * @param {string} code - DSL code string resolving to exactly one part
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addPart(code, opts) {
    assertCodeArg('addPart', code);
    assertOptsArg('addPart', opts);
    const indices = this.#getNonSpaceGroupIndices();
    if (indices.length === 0) {
      // Empty builder: validate at part level FIRST. The scaffold group is
      // attached only after the handle call succeeds, so a rejected arg
      // leaves the builder untouched, and opts land at part level exactly
      // as they do on a non-empty builder.
      const newGroup = { glyphs: [] };
      new ElementHandle(this.#mutationCtx, 1, newGroup).addPart(code, opts);
      this.#rawBlissObj.groups.push(newGroup);
      this.#rebuild();
      return this;
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
    if (!Number.isInteger(index) || index < 0 || index >= indices.length) return this;
    const rawIndex = indices[index];
    this.#removeGlyphGroup(this.#rawBlissObj, rawIndex);
    this.#rebuild();
    return this;
  }

  /**
   * Replaces the non-space group at the given semantic index.
   * @param {number} index - Semantic index (supports negative)
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted swaps in an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  replaceGroup(index, code, opts) {
    assertCodeArg('replaceGroup', code);
    assertOptsArg('replaceGroup', opts);
    const indices = this.#getNonSpaceGroupIndices();
    if (index < 0) index = indices.length + index;
    if (!Number.isInteger(index) || index < 0 || index >= indices.length) return this;
    const newGroup = this.#parseGroupWithOpts(code, opts);
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

    // Re-ingest toJSON output into internal format (same order as constructor).
    // What arrives is saved composition data, so it meets the admission stage
    // as a composition object does. `other` is whatever answers toJSON(), a
    // builder from another copy of the library included, and a key such a
    // builder kept would otherwise be merged in unjudged and saved.
    const warn = (warning) => this.#mutationWarnings.push(warning);
    for (const group of otherGroups) BlissSVGBuilder.#admitAuthoredBags(group, 'group', warn);
    // A deep toJSON arrives expanded, so what is left to expand here is a part
    // whose code was unknown when `other` was built and has been defined
    // since. A key misplaced in that definition's code string is reported like
    // any other this merge causes.
    BlissParser.expandParts({ groups: otherGroups }, warn);
    BlissSVGBuilder.#normalizeGlyphCodes(otherGroups);
    // Parity with the constructor's object-ingest: a partless glyph node
    // normalizes to the first-class empty glyph. A no-op today (a builder's
    // toJSON never emits a bare partless node, it emits `{ parts: [] }`), so
    // this only guards a future toJSON shape or re-ingest path from re-opening
    // the phantom-advance defect the constructor pass already closes.
    BlissSVGBuilder.#normalizePartlessGlyphs(otherGroups);
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
    if (!Number.isInteger(groupIndex) || groupIndex <= 0 || groupIndex >= indices.length) {
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
   * Parses a code string into exactly one group and applies option layers.
   * An omitted, empty, or whitespace-only code yields an empty group.
   *
   * An accepted arg's parse-time warnings (a misplaced option, head marker, or
   * word indicator) forward to the persistent mutation channel: they live on
   * no node, so unlike a kept UNKNOWN_CODE they never re-derive at rebuild and
   * would otherwise vanish. Forwarded last (after the opts resolve), so a
   * rejected code or bad opts leaks nothing, matching the handle family's
   * #forwardParseWarnings accept-only rule.
   * @param {string} [code]
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {object} parsed group
   */
  #parseGroupWithOpts(code, opts) {
    let newGroup;
    let parseWarnings;
    if (code === undefined || code.trim() === '') {
      // "Add a group with nothing in it" is meaningful: '' is the DSL
      // counterpart of the already-valid {glyphs: []} object state.
      newGroup = { glyphs: [] };
    } else {
      const parsed = BlissParser.parse(code);
      const groupCount = parsed.groups?.length ?? 0;
      if (groupCount !== 1) {
        throw new Error(`Expected a single group, but code "${code}" produced ${groupCount} groups`);
      }
      // Document-level options have no home on a single group: the same
      // string given to the constructor would style the whole document, so
      // stripping them here would be silent loss. An empty "||" prefix sets
      // no options and stays plain content.
      if (Object.keys(parsed.options ?? {}).length > 0) {
        throw new Error(`Code "${code}" carries document-level options ("[opts]||"). Set document options on the builder input, or style the group itself ("[opts]|" in the code or the opts parameter)`);
      }
      newGroup = parsed.groups[0];
      parseWarnings = parsed._parseWarnings;
    }
    if (opts) {
      const { defaults, overrides } = BlissSVGBuilder.#resolveOpts(opts);
      if (defaults || overrides) {
        const optionWarn = (warning) => this.#mutationWarnings.push(warning);
        const scope = { level: 'group', notation: 'setter' };
        const rawDefaults = defaults ? BlissSVGBuilder.#toRaw(defaults, optionWarn, scope) : {};
        const rawOverrides = overrides ? BlissSVGBuilder.#toRaw(overrides, optionWarn, scope) : {};
        const merged = { ...rawDefaults, ...(newGroup.options ?? {}), ...rawOverrides };
        // An empty opts (e.g. {}) resolves to no keys: don't stamp a bare
        // options:{} onto the group, which would be toJSON noise.
        if (Object.keys(merged).length > 0) newGroup.options = merged;
      }
    }
    if (parseWarnings?.length) this.#mutationWarnings.push(...parseWarnings);
    return newGroup;
  }

  // --- Raw Element CRUD (no automatic space management) ---

  /**
   * Appends a raw group with no automatic space management.
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted appends an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  addElement(code, opts) {
    assertCodeArg('addElement', code);
    assertOptsArg('addElement', opts);
    const newGroup = this.#parseGroupWithOpts(code, opts);
    this.#rawBlissObj.groups.push(newGroup);
    this.#rebuild();
    return this;
  }

  /**
   * Inserts a raw group at the given index with no automatic space management.
   * @param {number} index - Raw index (supports negative: -1 = before last)
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted inserts an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  insertElement(index, code, opts) {
    assertCodeArg('insertElement', code);
    assertOptsArg('insertElement', opts);
    if (!Number.isInteger(index)) return this;
    const newGroup = this.#parseGroupWithOpts(code, opts);
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
    if (!Number.isInteger(index) || index < 0 || index >= groups.length) return this;
    groups.splice(index, 1);
    this.#rebuild();
    return this;
  }

  /**
   * Replaces the raw group at the given index with new content.
   * @param {number} index - Raw index (supports negative: -1 = last)
   * @param {string} [code] - DSL code string; empty, whitespace-only, or omitted swaps in an empty group
   * @param {Object | { defaults?: Object, overrides?: Object }} [opts]
   * @returns {this}
   */
  replaceElement(index, code, opts) {
    assertCodeArg('replaceElement', code);
    assertOptsArg('replaceElement', opts);
    const groups = this.#rawBlissObj.groups;
    if (index < 0) index = groups.length + index;
    if (!Number.isInteger(index) || index < 0 || index >= groups.length) return this;
    const newGroup = this.#parseGroupWithOpts(code, opts);
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

  /**
   * Sets transient options on the whole SVG: values that reach the rendered
   * output and never reach `toString()` or `toJSON()`.
   *
   * Repeated calls MERGE, like `setOptions` on an element. Use it for anything
   * that describes this view rather than the composition — a display width, a
   * highlight, an annotation the app re-applies on each render.
   *
   * There is no builder-level `setOptions` counterpart: global options belong
   * to the composition and arrive with it. This channel is the transient one,
   * so changing it after construction is exactly what it is for.
   *
   * @param {Object} opts - Option keys and values
   * @returns {this}
   */
  setTransientOptions(opts) {
    assertOptsArg('setTransientOptions', opts);
    // #toRaw kebab-cases the keys and stringifies the values, matching how an
    // option written in a bracket arrives, and dropping object values that
    // structuredClone could not carry across a rebuild.
    const raw = BlissSVGBuilder.#toRaw(
      opts ?? {},
      (warning) => this.#mutationWarnings.push(warning),
      { level: 'global', notation: 'setter', transient: true },
    );
    this.#rawBlissObj.transientOptions = { ...(this.#rawBlissObj.transientOptions ?? {}), ...raw };
    this.#rebuild();
    return this;
  }

  /**
   * Removes transient option keys from the whole SVG. A name the library or a
   * standard owns is removed under either spelling; a name of your own is
   * removed under exactly the spelling you set it with.
   *
   * @param {...string} keys - Option keys to remove
   * @returns {this}
   */
  removeTransientOptions(...keys) {
    // Ahead of the empty-bag return, so what the call is refused for does not
    // depend on whether there happened to be anything to remove.
    assertKeyArgs('removeTransientOptions', keys);
    const bag = this.#rawBlissObj.transientOptions;
    if (!bag) return this;
    for (const key of keys) {
      deleteOptionByName(bag, key);
    }
    // Housekeeping, and deliberately unpinned for the reason the element-level
    // twin records: an empty transient bag is indistinguishable from an absent
    // one on every public surface, because transient options never serialize.
    if (Object.keys(bag).length === 0) delete this.#rawBlissObj.transientOptions;
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

  /**
   * Normalize a degenerate partless glyph node from object input to the
   * first-class empty glyph. A glyph with no `parts` array and no code identity
   * has no renderable content, but the element layer treats a partless glyph as
   * a glyph-that-IS-one-part shorthand and wraps it, so `{}` became a failed
   * part that warned UNKNOWN_CODE and reserved a phantom advance while
   * `toString()` omitted it (svg round-trip false). Setting `parts: []` makes it
   * render invisibly and match its omitting serialization, exactly like a
   * `{ parts: [] }` node. Options and key survive (an `{ options: {...} }` node
   * becomes an options-carrying empty glyph). Object input only; the DSL never
   * produces a partless glyph node. Must run AFTER `#normalizeGlyphCodes`, which
   * renames the code identity to `glyphCode`, so a `{ codeName: 'B291' }`
   * shorthand keeps its identity and still renders (its `glyphCode` is set here).
   */
  static #normalizePartlessGlyphs(groups) {
    for (const group of groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts && !glyph.glyphCode) {
          glyph.parts = [];
        }
      }
    }
  }

  // 'X<chars>' (public text-fallback form) → 'XTXT_<chars>' (internal
  // routing key). Built-in / registered codes (Xa, XL8, B431, …) and
  // already-internal forms pass through unchanged.
  static #textFallbackInternalForm(code) {
    if (code.startsWith('XTXT_')) return code;
    if (code.length < 2 || code[0] !== 'X') return code;
    if (blissElementDefinitions[code]) return code;
    // Route only what the shared X grammar recognizes. Converting anything that
    // merely starts with X laundered a REJECTED code into accepted content and
    // dropped its warning: `Xhello-world` warns UNKNOWN_CODE and renders nothing
    // when parsed, but came back through JSON as rendered text with no warning
    // at all. A code the grammar does not recognize now fails here exactly as it
    // fails on the DSL path.
    //
    // The 'letters' answer keeps its current text routing rather than expanding
    // to a letter sequence: whether authored object data should accept DSL
    // shorthand at all is an open question of its own (backlog, object-input
    // validation), and settling it here would settle it by accident.
    return classifyXCode(code) === null ? code : 'XTXT_' + code.slice(1);
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

  // Content-vs-whitespace classification: only TSP/QSP are spaces (the canonical
  // set, shared with the element snapshot and toString via isSpaceGlyph). ZSA is
  // an inkless positionable shape that counts, navigates, and serializes as
  // content; SP is a parser-internal placeholder that never reaches a real tree.
  // Drives group counting, navigation, word-splitting, and adjacent-space merges.
  /** Returns true if a raw glyph node is a space glyph (one space-code part) */
  static #isSpaceGlyphNode(glyph) {
    return glyph.parts?.length === 1 && isSpaceGlyph(glyph.parts[0].codeName);
  }

  /** Returns true if a raw group is a space group */
  static #isRawSpaceGroup(group) {
    if (!group.glyphs || group.glyphs.length === 0) return false;
    return group.glyphs.every(g => BlissSVGBuilder.#isSpaceGlyphNode(g));
  }

  // Head / word-indicator eligibility is BROADER than space classification: a
  // ZSA counts as content but, like a space, can never be a word's head or carry
  // a ;; overlay (the frozen parser's isSpacePart = {TSP,QSP,ZSA} rejects both).
  // The rebuild normalizer strips a head/overlay a mutation or object input left
  // on one so the tree stays reparse-valid.
  static #NON_HEAD_MARKER_CODES = new Set(['TSP', 'QSP', 'ZSA']);

  /** Returns true if a raw glyph node cannot be a word head (space or anchor). */
  static #isNonHeadMarkerNode(glyph) {
    return glyph.parts?.length === 1 && BlissSVGBuilder.#NON_HEAD_MARKER_CODES.has(glyph.parts[0].codeName);
  }

  /** Returns true if every glyph in a group is a non-head marker. */
  static #isNonHeadMarkerGroup(group) {
    return group.glyphs?.length > 0 && group.glyphs.every(g => BlissSVGBuilder.#isNonHeadMarkerNode(g));
  }

  // Option keys a space glyph keeps when its decorations are stripped: the
  // runtime key (identity, re-assigned each rebuild) and kerning (RK/AK, which
  // adjusts spacing between glyphs, a separate backlogged space-sizing concern).
  static #SPACE_KEPT_OPTION_KEYS = new Set(['key', 'relativeKerning', 'absoluteKerning']);

  /**
   * Removes every non-internal option (a styling decoration) from a space's
   * options object and returns the `k=v` entries that were dropped, as the
   * author wrote them. Kerning and the runtime key are spared. Mutates
   * `options` in place; taking an emptied bag away is the caller's, since only
   * the caller knows whether anything else is still to come out of it.
   */
  static #dropSpaceOptionEntries(options) {
    if (!options) return [];
    const keys = Object.keys(options).filter(k => !BlissSVGBuilder.#SPACE_KEPT_OPTION_KEYS.has(k));
    const entries = keys.map(k => (options[k] === true ? k : `${k}=${options[k]}`));
    for (const k of keys) delete options[k];
    return entries;
  }

  /**
   * Everything a space at word or character scope was decorated with, in one
   * `[k=v;…]` text, taken off both spellings a decoration can arrive in: the
   * options bag and the promoted position field. Returns null when there was
   * nothing to drop. Mutates `node` in place.
   *
   * One written decoration is one report, so the two channels share a
   * representation instead of each raising its own: `[x=5;color=red]TSP` is one
   * bracket the author typed, and splitting it in half because the position
   * travels on a different channel would describe our storage rather than their
   * input. The position leads, the slot the serializer gives it, so the text
   * quoted back is the text the serializer would have written.
   *
   * A word and a character have no `:x,y` suffix, which is why this reports the
   * option spelling while the part arm reports a coordinate: each level is
   * quoted back in a spelling that level actually has.
   */
  static #dropSpaceDecorations(node) {
    const entries = [];
    for (const axis of ['x', 'y']) {
      if (node[axis] === undefined) continue;
      entries.push(`${axis}=${node[axis]}`);
      delete node[axis];
    }
    entries.push(...BlissSVGBuilder.#dropSpaceOptionEntries(node.options));
    if (node.options && Object.keys(node.options).length === 0) delete node.options;
    return entries.length ? `[${entries.join(';')}]` : null;
  }

  /**
   * Spells a part position the way the model holds it: one slot per axis the
   * author wrote, and no suffix at all when neither was. `:x,y`, `:x` (the
   * shorter spelling of `:x,`), `:,y`, or ''.
   *
   * Every place in this class that names a position in text shares this,
   * because they are all read back as DSL: the serializer's output is
   * reparsed, the canonical token is compared against a codeString a human
   * wrote, and a warning's `source` is the author's own text quoted back.
   * Filling an unwritten axis with a `0` states a position nobody asked for,
   * which on an indicator is a different picture and in a warning is a
   * different input than the one that failed.
   *
   * `BlissElement.toString()` is a second, older serializer that still spells
   * the padded pair. It is deliberately not counted above: it is internal, on
   * no exported path, so nothing it writes reaches a saved composition.
   */
  static #positionSuffix(x, y) {
    if (x !== undefined && y !== undefined) return `:${x},${y}`;
    if (x !== undefined) return `:${x}`;
    if (y !== undefined) return `:,${y}`;
    return '';
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
   * Returns a portable DSL string. Custom codes are decomposed to built-in
   * codes by default. `preserve` keeps a custom name that stands for a
   * single glyph, indicator, or shape: every typed definition (whatever its
   * anatomy) and every bare alias renaming one existing code; multi-code
   * shorthand always serializes expanded.
   *
   * @param {Object} [options]
   * @param {boolean} [options.preserve=false] - Keep custom glyph/shape code names
   * @param {boolean} [options.flattenIndicators=false] - Collapse word-level (`;;`) indicators onto the head as character-level `;`
   * @param {boolean} [options.omitOptions=false] - Leave out every option bracket, at every scope; part coordinates and kerning stay
   * @returns {string}
   */
  toString(options = {}) {
    // toString always needs nested parts so serializeParts can decompose
    // custom codes. The string output itself stays flat (;-delimited).
    const obj = this.toJSON({
      preserve: options.preserve,
      deep: true,
      flattenIndicators: options.flattenIndicators,
      omitOptions: options.omitOptions,
    });

    const GLYPH_INTERNAL_KEYS = new Set(['relativeKerning', 'absoluteKerning']);
    // A code reads the same way throughout one save, so it is parsed once.
    const readings = new Map();

    // Serialize a part with ; delimiter and :x,y positions.
    // Recursively decomposes custom shapes and glyphs unless preserve is set.
    function serializeParts(parts, offsetX = 0, offsetY = 0) {
      return parts.map((part, partIndex) => {
        // An invalid part (no codeName, e.g. the `!B81` in `B291;[x=2]>!B81`)
        // must not let a coordinate suffix or `[opts]>` prefix decorate it into
        // a truthy literal-`undefined` string; drop it before decoration. It
        // already warned UNKNOWN_CODE at parse. (F3.)
        if (!part.codeName) return '';
        // Presence, not value: an axis nobody wrote is unset, not zero. An
        // unset axis leaves the part wherever it sits on its own, which is the
        // origin for an ordinary shape but a computed placement for an
        // indicator, so filling in a `0` the author never wrote reloads as a
        // different picture. The two questions are asked separately from here.
        //
        // A non-zero parent offset forces a value either way: when a nested
        // composite decomposes, an unset axis would have to be emitted as that
        // part's own default plus the offset, and only the layout knows the
        // default. Approximated as 0, which is exact for every ordinary part
        // and off by the anchor placement for an indicator.
        //
        // The addition below is arithmetic only because the positioning
        // invariant guarantees it: an axis on the authoring structure is a
        // finite number or absent, whichever channel wrote it. Without that
        // guarantee `+` concatenates, and a string `'3'` under a zero offset
        // becomes `30`. Any new route that writes an axis belongs behind
        // normalizePositionFields, not behind a second coercion here.
        const hasX = part.x !== undefined || offsetX !== 0;
        const hasY = part.y !== undefined || offsetY !== 0;
        const x = (part.x ?? 0) + offsetX;
        const y = (part.y ?? 0) + offsetY;
        // Under preserve a BASE-slot custom name with `;`-siblings still
        // decomposes when the name is a bare alias: a bare-alias base drops
        // its appended parts on reparse (strict separation), so emitting the
        // name would silently shed the siblings. A typed custom base keeps
        // its name (a typed base dumb-appends on reparse).
        const isBareAliasBase = options.preserve && partIndex === 0 && parts.length > 1
          && BlissSVGBuilder.#isBareAliasDefinition(blissElementDefinitions[part.codeName]);
        // A failed part (COMPOSITE_AS_PART keeps its expanded `.parts`) must
        // re-emit by its written name, never decomposed: decomposing a
        // composite alias (`_X` -> `B291;B81`) changes what the warned string
        // re-parses to (the buried baked indicator resurfaces, the whole-char
        // failure becomes a different valid character). preserve already keeps
        // the name; this makes default agree. (Row 80.) WORD_AS_PART has no
        // `.parts`, so it already round-tripped; the guard just unifies them.
        // Under preserve a custom name is also spelled out when it no longer
        // carries what it supplies. A name the save restored was judged where
        // it was restored, against the reading its spelling reloads as.
        const restored = part._aliasCodeName === part.codeName;
        if ((!options.preserve || isBareAliasBase
            || (!restored && !BlissSVGBuilder.#keepsNamedOptions(part, part.codeName, 'part', readings)))
            && !builtInCodes.has(part.codeName) && !part.errorCode) {
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
          // A custom shape part with no parts of its own: its definition arrived
          // after the composition was built, so the tree still holds the bare
          // name. Write what the parser reads the name as in this slot, with
          // this part's own position and options over it. That is the node the
          // composition would hold had the definition existed at parse time, so
          // the late save writes what the early one does, and no definition
          // text is copied that a save without options would have to strip.
          const def = blissElementDefinitions[part.codeName];
          const reading = def?.isShape && def.codeString && !def.getPath
            ? BlissSVGBuilder.#readingOf(part.codeName, 'part', readings)
            : null;
          if (reading) {
            const node = structuredClone(reading);
            if (part.x !== undefined) node.x = part.x;
            if (part.y !== undefined) node.y = part.y;
            if (part.options) node.options = { ...node.options, ...part.options };
            if (options.omitOptions) BlissSVGBuilder.#clearOptionsFrom(node, 3);
            return serializeParts([node], offsetX, offsetY);
          }
        }
        // Surface text-fallback routing key 'XTXT_<chars>' as 'X<chars>'.
        let str = part.codeName.startsWith('XTXT_')
          ? 'X' + part.codeName.slice(5)
          : part.codeName;
        // A part's position has two spellings that address the same level, the
        // `[x=N;y=M]>` option and the `:x,y` suffix, so the output settles on
        // one: the coordinate, which a part written without an option already
        // uses. The option bracket below keeps every other key, and needs
        // nothing to hold an axis back, because the promotion that gives the
        // coordinate its value takes the axis out of the bag in the same step.
        // (Canonicalize within a level, preserve across levels: a glyph, a word
        // and the composition have no coordinate spelling of their own, so a
        // position at those levels stays a bracket.)
        str += BlissSVGBuilder.#positionSuffix(hasX ? x : undefined, hasY ? y : undefined);
        // Prefix part-level options with [opts]> syntax, less the look a code
        // the string can only name draws with by its own name
        const optPrefix = serializeOptions(
          BlissSVGBuilder.#withoutOwnLook(part.options, part.codeName, 'part', readings));
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

    // Under preserve, a custom glyph keeps its name only while the name still
    // describes it: its parts must begin with exactly the parts the name
    // reloads to. Anything else spells the glyph out, because spelling out is
    // always faithful and a kept name is the one output that can reload as a
    // different drawing (a removed, moved or recoloured part coming back).
    //
    // Parts appended after the name's own are re-emitted as a dumb `;` delta
    // (`NAME;B81`), which a typed name appends on reparse, and which keeps the
    // name independently of `flattenIndicators` (R3b2-2 orthogonality). The
    // delta writes a bare code and nothing else, so an appended part with an
    // axis written (a zero included: an indicator at `0,0` is pinned where one
    // with no position is placed) or an option spells the glyph out instead.
    // An option INSIDE an appended part counts too: a custom glyph appended
    // whole carries its anatomy's options, and on reload they make the renderer
    // merge the named glyph's own parts into one path where the builder drew
    // them apart, so the SVG differs although the ink does not. For the same
    // reason a built-in's own look counts although the string never writes it
    // (`ANCHORRING`'s dotted line): the renderer reads the options, not the
    // string.
    // So does any append to a definition that bakes indicators: only a compound
    // indicator does (D-S1a), and the API reorders or strips its baked parts,
    // which no `;` delta against the name can say.
    function serializeCustomGlyphDelta(glyph) {
      const def = blissElementDefinitions[glyph.codeName];
      if (!def?.codeString || !glyph.parts) return glyph.codeName;
      const named = BlissSVGBuilder.#partsNamedBy(glyph.codeName, readings);
      if (!named || !BlissSVGBuilder.#startsWithParts(glyph.parts, named)) {
        return serializeParts(glyph.parts);
      }
      const appended = glyph.parts.slice(named.length);
      if (appended.length === 0) return glyph.codeName;
      const decorated = (p) => serializeOptions(p.options) !== '' || (p.parts ?? []).some(decorated);
      const bare = (p) => p.x === undefined && p.y === undefined && !decorated(p);
      if (named.some(p => p.isIndicator === true) || !appended.every(bare)) {
        return serializeParts(glyph.parts);
      }
      return [glyph.codeName, ...appended.map(p => p.codeName)].join(';');
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
        // Decompose custom glyphs (non-built-in) to portable output, from the
        // glyph's parts, which have the correct positions. A partless one has
        // nothing to decompose: toJSON names a custom glyph whose definition
        // has a code string by the built-in that code string resolves to, or
        // leaves it unnamed, so no definition text is ever copied from here.
        if (!options.preserve && !builtInCodes.has(glyph.codeName)) {
          if (glyph.parts) code = serializeParts(glyph.parts);
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

      // Written-name consult (preserve-completeness chunk): whatever route
      // computed `code`, a glyph that is a clean instance of a recorded
      // definition emits the written name. The recording rides the glyph
      // (parser stamp, kept in deep output); object input may carry the
      // name as a glyph-level codeName instead. A diverged glyph never
      // matches the anatomy, so the route's own output stands ('MYGL1;B81'
      // stays a typed delta: a `;`-part on a bare-alias base drops on
      // reparse).
      if (options.preserve) {
        const name = glyph._aliasCodeName
          ?? (!glyph.isBlissGlyph && glyph.codeName && !builtInCodes.has(glyph.codeName)
              ? glyph.codeName : null);
        const written = name
          ? BlissSVGBuilder.#preservedWrittenName(name, glyph, readings)
          : null;
        if (written) code = written;
      }

      // Prefix glyph-level options (skip internal kerning keys), less the look
      // a code the string can only name supplies to the character written as
      // `code`, which reading it back supplies again.
      const optPrefix = serializeOptionsWithPosition(
        { ...glyph, options: BlissSVGBuilder.#withoutOwnLook(glyph.options, code, 'glyph', readings) },
        GLYPH_INTERNAL_KEYS,
      );
      result.push(optPrefix + code);
      return result;
    }

    // Check if a group is a space (TSP or QSP). ZSA is content: it serializes as
    // its own code, not a slash, so a standalone ZSA round-trips faithfully.
    function isSpaceGroup(group) {
      if (!group.glyphs || group.glyphs.length === 0) return false;
      return group.glyphs.every(g =>
        g.parts?.length === 1 && isSpaceGlyph(g.parts[0].codeName)
      );
    }

    const segments = [];
    // Space groups and bare content-empty groups coalesce into maximal runs so
    // serialized spacing always matches rendered spacing; bare empty groups
    // contribute no units and never split a run.
    let spaceRun = null;
    const flushSpaceRun = () => {
      if (!spaceRun) return;
      // Defensive: only space groups open a run, and a space group always
      // holds a glyph. Empties never open one (they only skip the flush).
      if (spaceRun.length > 0) {
        // Each space is spelled on its own: a bare separator where it matches
        // the position's default, its explicit code where it diverges. N
        // default spaces are therefore still N+1 slashes and an all-divergent
        // run is still the full code list, while a MIXED run keeps its default
        // members compact instead of writing the whole run out. The result is
        // self-delimiting (`//`, `/QSP/`, `//QSP/`), which is what lets the
        // join below place it without doubling a separator.
        segments.push('/' + spaceRun.map(s => s.differs ? `${s.code}/` : '/').join(''));
      }
      spaceRun = null;
    };
    for (const group of obj.groups || []) {
      if (!group.glyphs) continue;
      // A malformed word (parser group.errorCode) never reaches serialization:
      // #normalizeFailedWordInvariant drops it from #rawBlissObj at rebuild
      // (retention family, rows 31/80), so no errorSource replay survives here.
      if (isSpaceGroup(group)) {
        spaceRun ??= [];
        spaceRun.push(...group.glyphs.map(g => ({
          code: g.parts[0].codeName,
          differs: g.parts[0]._differsFromDefault === true,
        })));
        continue;
      }
      const glyphArrays = group.glyphs.map(serializeGlyph);
      // Assembled after any head marker is stamped on, so a marked letter fails
      // the collapse grammar and keeps its run explicit.
      const assembleGroup = () =>
        collapseExternalLetterRuns(glyphArrays.flat().filter(Boolean)).join('/');
      let groupStr = assembleGroup();
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
          groupStr = assembleGroup();
        }
      }
      // R14: re-emit a word-level indicator overlay as trailing `;;` (kept by
      // default; `flatten` collapses it onto the head as `;` instead).
      if (group.wordIndicators && groupStr) {
        const { codes = [], stripSemantic } = group.wordIndicators;
        groupStr += ';;' + (stripSemantic ? '!' : '') + codes.join(';');
      }
      // Prefix group-level options with [opts]| syntax
      const groupOptPrefix = serializeOptionsWithPosition(group);
      if (groupOptPrefix) groupStr = `${groupOptPrefix}|${groupStr}`;
      if (groupStr === '') continue; // bare content-empty: no segment, run stays open
      flushSpaceRun();
      segments.push(groupStr);
    }
    flushSpaceRun();
    // Join: slash-only segments already include separators, others need /
    let result = segments.reduce((acc, seg) => {
      if (acc === '') return seg;
      if (seg.startsWith('/')) return acc + seg;
      if (acc.endsWith('/')) return acc + seg;
      return acc + '/' + seg;
    }, '');

    // A space run is emitted self-delimiting, so at the very start or end of
    // the string its outer separator can have nothing left to separate. Next to
    // ANOTHER slash that separator is half of the `//` that spells the space
    // itself and must stay; next to an explicit space code it is noise.
    if (result.startsWith('/') && !result.startsWith('//')) result = result.slice(1);
    if (result.endsWith('/') && !result.endsWith('//')) result = result.slice(0, -1);

    // Prefix global options with [opts]|| syntax
    const globalOptPrefix = serializeOptionsWithPosition(obj);
    if (globalOptPrefix) result = `${globalOptPrefix}||${result}`;

    return result;
  }

  /**
   * Returns the normalized parsed structure. Custom codes are decomposed to
   * built-in codes by default; { preserve: true } keeps custom names under
   * the same rule as toString() (typed definitions and bare aliases to one
   * existing code; multi-code shorthand always expands).
   *
   * @param {Object} [options]
   * @param {boolean} [options.preserve=false] - Keep custom glyph/shape code names
   * @param {boolean} [options.flattenIndicators=false] - Bake word-level (`;;`) indicators onto the head and omit the wordIndicators field
   * @param {boolean} [options.omitOptions=false] - Leave out every option the string form writes in brackets; part coordinates and kerning stay
   * @returns {Object} Plain object with groups/glyphs/options structure
   */
  toJSON(options = {}) {
    const obj = structuredClone(this.#rawBlissObj);
    // A custom name reads the same way throughout one save, so it is parsed once.
    const readings = new Map();
    // How far down a character's name is read back. Deep output feeds the
    // string, which writes the name alone; the public JSON writes the parts
    // out beside it, so there the name restores the character's own options.
    const nameLevels = options.deep ? Infinity : 0;

    // The view without options is the in-place clear run on this working copy,
    // then the one rebuild rule that reads options: a head designation on a
    // glyph the clear left with nothing to write goes with it. Both run before
    // the flatten and before any `preserve` decision reads the tree. A flatten
    // ahead of them bakes the overlay onto a glyph the clear then empties, and
    // a name judged ahead of them is judged on options that are about to go.
    if (options.omitOptions) {
      BlissSVGBuilder.#clearOptionsFrom(obj, 0);
      for (const group of obj.groups ?? []) {
        for (const glyph of group.glyphs ?? []) {
          if (designationIsUnwritten(glyph)) delete glyph.isHeadGlyph;
        }
      }
    }

    // Internal parse-warning record: consumed by #rebuild to repopulate
    // `warnings`, never part of the public composition data (absent from the
    // BlissJSON type). Strip it so toJSON() is clean authoring data and a JSON
    // round-trip does not re-emit a warning for an offender already dropped.
    delete obj._parseWarnings;

    // Publish the library's own vocabulary under the spelling JavaScript writes.
    // Default output is the authoring shape a caller reads, edits and hands
    // back, so it is JavaScript's view of the composition. `deep` output is
    // consumed by toString() and merge(), which are the DSL's view and the
    // internal one, and both keep the stored spelling: publishing there would
    // move the DSL serializer with it.
    const publishOptionSpellings = (node) => {
      if (options.deep || !node.options) return;
      node.options = Object.fromEntries(
        Object.entries(node.options).map(([key, value]) => [programmaticOptionKey(key), value])
      );
    };

    // Strip keys from all levels (keys are runtime identity, not composition data)
    delete obj.key;
    if (obj.options) delete obj.options.key;
    publishOptionSpellings(obj);
    // Transient options render and never serialize: that is the whole contract
    // of the channel, so the strip happens at every level it can appear on,
    // ungated by `deep` (merge() re-ingests deep output, which would otherwise
    // resurrect a nested bag).
    delete obj.transientOptions;

    if (obj.groups) {
      // Strip keys from parts. Unless deep: true, also strip nested sub-parts
      // (internal expansion detail). The constructor re-expands from codeName
      // via BlissParser.expandParts(). `glyph` is the character holding `parts`
      // when they are its own, and absent for a part's inner parts.
      const stripParts = (parts, glyph) => {
        for (const [partIndex, part] of parts.entries()) {
          delete part.key;
          delete part.transientOptions;
          // Internal origin tag from the word-indicator merge (flatten path):
          // not composition data, never surfaced in serialized output.
          delete part._indicatorOrigin;
          // Single-code rename resolution records the user-written name
          // (Phase 2.3b; extended to character level in Chunk 6): preserve
          // restores it, so `B291;MYIND` keeps MYIND and a standalone alias
          // keeps its name instead of leaking the resolved target. A BASE
          // slot with `;`-siblings restores only a name that survives
          // reparse: a `;`-part on a bare-alias base drops (strict
          // separation), so a bare-alias name stays decomposed there, while
          // a typed name dumb-appends and round-trips. Deep output keeps the
          // field for the toString()/merge() pipelines; public output drops it.
          if (options.preserve && part._aliasCodeName) {
            const namedDef = blissElementDefinitions[part._aliasCodeName];
            // A decorated part (coordinates or options) restores only a PURE
            // rename chain: a decorated custom anatomy dissolved its own
            // state into this part, and the written name would re-emit it as
            // instance decoration (preserve-completeness chunk; the glyph-
            // level consult keeps such a name at the clean-glyph level).
            const decorated = (part.x ?? 0) !== 0 || (part.y ?? 0) !== 0 || part.options;
            // The name also has to leave nothing to bring back. A sole part
            // carrying the character's own recording, with no options of its
            // own to write, is written as the whole character, where the name
            // puts its defaults on the character, so the character is what the
            // name is judged against. Anywhere else the name is written in a
            // part slot (`[opts]>NAME` included) and puts them on the part.
            const writesOwnOptions = Object.entries(part.options ?? {})
              .some(([key, value]) => key !== 'key' && value !== false);
            const writtenAsCharacter = parts.length === 1 && !writesOwnOptions
              && glyph?._aliasCodeName === part._aliasCodeName;
            const keepsOptions = writtenAsCharacter
              ? BlissSVGBuilder.#keepsNamedOptions(glyph, part._aliasCodeName, 'glyph', readings)
              : BlissSVGBuilder.#keepsNamedOptions(part, part._aliasCodeName, 'part', readings);
            if ((partIndex > 0 || parts.length === 1
                || (namedDef && !BlissSVGBuilder.#isBareAliasDefinition(namedDef)))
                && (!decorated || BlissSVGBuilder.#renameChainIsPure(part._aliasCodeName))
                && keepsOptions) {
              part.codeName = part._aliasCodeName;
            }
          }
          if (!options.deep) delete part._aliasCodeName;
          if (part.options) delete part.options.key;
          publishOptionSpellings(part);
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
        delete group.transientOptions;
        if (group.options) delete group.options.key;
        publishOptionSpellings(group);

        // R14: flattenIndicators bakes the word-level overlay onto the head as
        // character-level parts and drops the field, reproducing the pre-overlay
        // (primitive) serialization. Default keeps the overlay (resolved at
        // render, re-emitted as `;;`).
        // (An all-empty word keeps its unflattenable overlay: headIndex -1.)
        const overlayHeadIndex = options.flattenIndicators && group.wordIndicators && group.glyphs?.length
          ? resolveOverlayHeadIndex(group.glyphs)
          : -1;
        if (overlayHeadIndex !== -1) {
          const head = group.glyphs[overlayHeadIndex];
          head.parts = mergeWordIndicatorsOntoHead(
            head, group.wordIndicators, blissElementDefinitions, (code) => BlissParser.parse(code)
          );
          // A head with baked indicator parts is no longer a bare single code,
          // so clear its single-code identity to force part-based serialization
          // (`B291;B81`); otherwise serializeGlyph emits the bare codeName and
          // drops the baked parts. The one exception is a custom glyph under
          // `preserve` that still carries what its name supplies: it keeps its
          // name and re-emits the overlay as a delta (`_LOVE;B81`), so leave
          // its identity intact.
          if (head.glyphCode && head.parts.some(p => p.isIndicator)
              && !(options.preserve && !builtInCodes.has(head.glyphCode)
                && BlissSVGBuilder.#keepsNamedOptions(head, head.glyphCode, 'glyph', readings, nameLevels))) {
            delete head.glyphCode;
            delete head.isBlissGlyph;
          }
          delete group.wordIndicators;
        }

        if (group.glyphs) {
          for (const glyph of group.glyphs) {
            delete glyph.key;
            delete glyph.transientOptions;
            if (glyph.options) delete glyph.options.key;
            publishOptionSpellings(glyph);
            if (glyph.parts) stripParts(glyph.parts, glyph);

            // Did this glyph ever have an identity code? Read it BEFORE the
            // rename below, which drops the code for a custom glyph decomposed
            // to portable parts. That glyph is anonymous on purpose and its
            // parts still re-derive its metadata; a glyph that never had a code
            // has nothing to re-derive from. See the metadata gate further down.
            const hadIdentityCode = !!glyph.glyphCode;

            // Normalize glyphCode → codeName for public API
            if (glyph.glyphCode) {
              // Surface text-fallback routing key 'XTXT_<chars>' as 'X<chars>'.
              const publicCode = glyph.glyphCode.startsWith('XTXT_')
                ? 'X' + glyph.glyphCode.slice(5)
                : glyph.glyphCode;
              // Decompose custom glyphs to portable codes by default, and under
              // `preserve` a custom glyph that no longer carries what its name
              // supplies, which reading the name back would restore.
              if (!builtInCodes.has(glyph.glyphCode) && (!options.preserve
                  || !BlissSVGBuilder.#keepsNamedOptions(glyph, glyph.glyphCode, 'glyph', readings, nameLevels))) {
                const def = blissElementDefinitions[glyph.glyphCode];
                if (def?.codeString) {
                  // Resolve to the underlying built-in code (null for complex compositions)
                  const resolved = BlissSVGBuilder.#resolveToBuiltInCode(glyph.glyphCode);
                  if (resolved) glyph.codeName = resolved;
                  // This resolution is the one place a typed glyph's identity
                  // drops from deep output, which feeds re-ingest pipelines
                  // (merge): record the written name so preserve can restore
                  // a clean instance downstream. An existing recording (a
                  // bare alias written OVER this glyph) outranks its own name.
                  // The deep gate pairs with the `!options.deep` strip below;
                  // either alone keeps public output clean, so keep both.
                  if (options.deep) glyph._aliasCodeName ??= publicCode;
                } else {
                  glyph.codeName = publicCode;
                }
              } else {
                glyph.codeName = publicCode;
              }
              delete glyph.glyphCode;
            }
            // Parts already use codeName internally, no rename needed

            // Glyph-level rename recording (preserve-completeness chunk):
            // public preserve output restores the written name only for a
            // clean instance of the definition's anatomy. Deep output stays
            // raw (codeName = the typed target) so serializeCustomGlyphDelta
            // keeps computing the divergence delta against the right
            // definition; toString restores via its own consult instead.
            // The recording never reaches public output in either mode.
            if (options.preserve && !options.deep) {
              const name = glyph._aliasCodeName
                ?? (glyph.codeName && !builtInCodes.has(glyph.codeName) ? glyph.codeName : null);
              if (name) {
                const written = BlissSVGBuilder.#preservedWrittenName(name, glyph, readings);
                if (written) glyph.codeName = written;
              }
            }
            if (!options.deep) delete glyph._aliasCodeName;

            // Default output omits glyph-classification metadata: it is fully
            // derived from the code and re-derived on reconstruction (see
            // #reapplyGlyphMetadata), so it is not user-authored composition data.
            // deep output keeps it for toString()/merge(). (issue #28 toJSON audit)
            //
            // "Derived from the code" only holds where there IS a code. Two
            // glyphs have none: one wearing a part-scope option (`[opts]>Xm`,
            // where the option binds the code to the PART) and a multi-character
            // text fallback (`Xhαllo`, which is one <text> glyph with no code of
            // its own). Dropping their metadata made a rebuild forget they were
            // external, so every following glyph shifted by 1.2 units -- the
            // difference between external-glyph-space and char-space (GH #38).
            // Keep the metadata exactly where nothing can re-derive it.
            if (!options.deep && hadIdentityCode) {
              delete glyph.char;
              delete glyph.isBlissGlyph;
              delete glyph.isExternalGlyph;
              delete glyph.kerningRules;
              delete glyph.shrinksPrecedingWordSpace;
              delete glyph.isIndicator;
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


  // The external-character namespace: X followed by one or more letters in
  // the parser recognition ranges (Latin, Latin-1/Ext-A, Greek, Cyrillic).
  // Built from the parser's own letter ranges so the two cannot drift: written
  // input of this shape is always read as external text, never as a definition
  // name, so such a definition would be unreachable (1.4 fence; Phase 2.3
  // guard). A name that leaves the ranges (XRAY1) reaches its definition.
  static #X_NAMESPACE_PATTERN = new RegExp(`^X[${X_RUN_LETTERS}]+$`);

  // A multi-letter external-letter run is a word WITHOUT a `/` in it: XOH is
  // shorthand for XO/XH. Asking the parser's own expansion keeps a typed
  // definition and its use site from disagreeing about how many characters a
  // codeString is; a run holding a letter with no built-in outline collapses to
  // ONE text-fallback glyph and stays a legal single character. Returns the
  // expanded word form, or null when the codeString is one character.
  //
  // The BASE is classified separately because a `;`-part suppresses expansion:
  // `Xab;C8` keeps its run whole and so carries no `/`, yet the base is still a
  // word and the definition would fail WORD_AS_PART at every use. Composing a
  // part onto a run does not turn the run into one character.
  static #expandedRunWord(codeString) {
    const expanded = processXCodes(codeString);
    if (expanded.includes('/')) return expanded;
    const base = codeString.split(';')[0];
    const expandedBase = base === codeString ? expanded : processXCodes(base);
    return expandedBase.includes('/') ? expandedBase : null;
  }

  // Parser-transient tokens that are DSL syntax, not registry codes: defining
  // one would change what the bare token means at the use site (a definition
  // named RK shadows the kerning marker).
  static #RESERVED_SYNTAX_NAMES = new Set(['RK', 'AK', 'SP']);

  // Validates a definition code string
  static #validateCode(code) {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new Error('Definition code must be a non-empty, non-whitespace string.');
    }
    // Control (Cc) and format (Cf) characters — and any whitespace other
    // than a plain space (no-break space, line/paragraph separators) — make
    // a key that LOOKS like a normal code but can never be typed at a use
    // site: the definition registers unreachable, silently. Reject with the
    // code point named. A plain interior space stays allowed (the full code
    // grammar is a separate decision).
    const invisible = code.match(/[\p{Cc}\p{Cf}]|[^\S ]/u);
    if (invisible) {
      const hex = invisible[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      throw new Error(`Definition code contains an invisible character (U+${hex}). Use visible characters only.`);
    }
    if (BlissSVGBuilder.#X_NAMESPACE_PATTERN.test(code)) {
      throw new Error(`"${code}" collides with the external-character namespace (X followed by letters): the parser reads such tokens as external text, so this definition would be unreachable. Choose a name that is not X followed by letters.`);
    }
    if (BlissSVGBuilder.#RESERVED_SYNTAX_NAMES.has(code)) {
      throw new Error(`"${code}" is reserved DSL syntax (the kerning and space markers RK, AK, SP) and cannot be defined.`);
    }
  }

  // Existence/overwrite gate shared by all four define paths. A built-in
  // definition is part of the universal primitive set every portable
  // composition relies on: replacing one would change what existing strings
  // render in this instance only, so overwrite:true refuses it (mirroring
  // removeDefinition/patchDefinition). Without overwrite, an existing code
  // (built-in or custom) keeps landing in skipped[] via the already-exists
  // throw.
  static #assertReplaceable(code, options) {
    if (!blissElementDefinitions[code]) return;
    if (options.overwrite && protectedCodes.has(code)) {
      throw new Error(`define("${code}"): cannot overwrite built-in definitions.`);
    }
    if (!options.overwrite) {
      // Typed so define()'s catch classifies by code, not by message text: a
      // definition NAMED "already exists" must land in errors, not skipped
      // (review MINOR-5).
      const error = new Error(`define("${code}"): code already exists. Use { overwrite: true } to replace.`);
      error.code = 'ALREADY_EXISTS';
      throw error;
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

  // Resolve a custom glyph code to its underlying built-in code (for toJSON).
  // Follows the chain until a built-in code is found.
  static #resolveToBuiltInCode(code, visited = new Set()) {
    if (visited.has(code)) return code;
    visited.add(code);
    const def = blissElementDefinitions[code];
    if (!def?.codeString) return code;
    // Only a code string that is one code reference resolves further. A
    // separator, a coordinate, an option bracket or its part-scope marker
    // makes it a composition no single code draws, and its text would
    // otherwise be published as a code name (`[color=red]>B291`).
    if (!/[;/:[>]/.test(def.codeString)) {
      if (builtInCodes.has(def.codeString)) return def.codeString;
      return BlissSVGBuilder.#resolveToBuiltInCode(def.codeString, visited);
    }
    return null; // Complex codeString — parts already expanded, no single code
  }

  // What a code the canonical string can only name draws with by its own
  // definition, or undefined. That is every built-in, and a custom shape drawn
  // by its own function: neither is ever spelled out, so its own look is part
  // of the character rather than an option on top of it, and clearing an
  // element named by one returns it to that look instead of stripping it.
  static #ownLookOf(code) {
    if (!code || !Object.hasOwn(blissElementDefinitions, code)) return undefined;
    const def = blissElementDefinitions[code];
    if (!def.defaultOptions) return undefined;
    return builtInCodes.has(code) || typeof def.getPath === 'function' ? def.defaultOptions : undefined;
  }

  // `bag` without the values a code the string can only name supplies by its
  // own name at this level, wherever the element holds the same value: that
  // look is part of the character, so the canonical string does not repeat it
  // (`REFSQUARE`, not `[stroke-dasharray=0 0.999]...REFSQUARE`). A different
  // value is an override and is written. `code` is what the string writes for
  // the element, read at `level` the way the reload reads it. Both bags hold
  // the stored spelling of every key, so the keys compare as they stand.
  static #withoutOwnLook(bag, code, level, readings) {
    if (!bag || !BlissSVGBuilder.#ownLookOf(getBareCode(code ?? ''))) return bag;
    const own = BlissSVGBuilder.#readingOf(code, level, readings)?.options;
    if (!own) return bag;
    return Object.fromEntries(Object.entries(bag).filter(([key, value]) =>
      !Object.hasOwn(own, key) || serializeOptionValue(own[key]) !== serializeOptionValue(value)));
  }

  // One element's options emptied of everything the canonical string writes in
  // brackets, in place. `level` is 0 for the composition, 1 a word, 2 a
  // character and 3 a part. Shared by the view without options, which runs it
  // on toJSON's working copy, and by the in-place clears, so the two cannot
  // disagree about what an option is.
  //
  // What stays is what the string writes outside a bracket, or never writes:
  // a part's coordinates, a character's kerning (the JSON keeps it in the bag,
  // the string writes it as an `RK:`/`AK:` marker), the runtime `key`, and what
  // a code the string can only name draws with by its own definition. A
  // character, word or composition position has no spelling outside a bracket,
  // so it goes with the rest. Transient options sit in a bag of their own and
  // are never touched.
  //
  // A bag with nothing to take off is left exactly as it was, so a composition
  // with no options saves the same with the view as without it.
  static #clearOwnOptions(node, level) {
    const bag = node.options ?? {};
    const kept = {};
    for (const [key, value] of Object.entries(bag)) {
      if (key === 'key' || (level === 2 && Object.hasOwn(KERNING_OPTION_KEYS, key))) kept[key] = value;
    }
    Object.assign(kept, BlissSVGBuilder.#ownLookOf(level === 2 ? node.glyphCode : level === 3 ? node.codeName : undefined));
    const keptKeys = Object.keys(kept);
    const changed = keptKeys.length !== Object.keys(bag).length || keptKeys.some((key) => bag[key] !== kept[key]);
    if (changed) {
      // The composition keeps an empty bag, the shape its JSON always has.
      if (keptKeys.length > 0 || level === 0) node.options = kept;
      else delete node.options;
    }
    if (level < 3) {
      delete node.x;
      delete node.y;
    }
    const overlay = level === 1 ? node.wordIndicators : undefined;
    if (overlay?.codes?.length) {
      const codes = overlay.codes.map((code) => BlissSVGBuilder.#wordIndicatorCodeWithoutOptions(code));
      if (codes.some((code, i) => code !== overlay.codes[i])) node.wordIndicators = { ...overlay, codes };
    }
  }

  // The same clear on `node` and on everything below it: a composition's words,
  // a word's characters, and the parts of a character or a part at any depth.
  static #clearOptionsFrom(node, level) {
    BlissSVGBuilder.#clearOwnOptions(node, level);
    const children = level === 0 ? node.groups : level === 1 ? node.glyphs : node.parts;
    for (const child of children ?? []) BlissSVGBuilder.#clearOptionsFrom(child, Math.min(level + 1, 3));
  }

  // One word-level (`;;`) code without its options: the code and its position
  // stay, the position in the `:x,y` spelling. The overlay stores each code as
  // the text it was written as, brackets included, so its options live in the
  // text rather than in a bag.
  //
  // A code that names a definition bringing options of its own is written as
  // the code it draws, when that is a code a `;;` list accepts. A name with no
  // such spelling (an indicator drawn from a shape that is not one) stays, and
  // brings its definition's values back with it, as any code the string can
  // only name does.
  static #wordIndicatorCodeWithoutOptions(code) {
    const node = wordIndicatorNode(code, blissElementDefinitions, (text) => BlissParser.parse(text));
    if (!node) return code;
    const spelled = BlissSVGBuilder.#optionFreeIndicatorSpelling(node);
    if (spelled) return spelled;
    if (!code.startsWith('[')) return code;
    return getBareCode(code) + BlissSVGBuilder.#positionSuffix(node.x, node.y);
  }

  // The single code a word-level indicator node draws, written with its
  // position and no option; null when the node carries no option, or when
  // what it draws has no spelling a `;;` list accepts. A custom name that
  // brings options of its own is followed down to the one code it stands for,
  // adding up the positions on the way, which is where the render places it.
  static #optionFreeIndicatorSpelling(node) {
    if (!BlissSVGBuilder.#carriesOptions(node)) return null;
    const standsWithoutOptions = (code) => builtInCodes.has(code)
      || typeof blissElementDefinitions[code]?.getPath === 'function'
      || !BlissSVGBuilder.#carriesOptions(wordIndicatorNode(code, blissElementDefinitions, (text) => BlissParser.parse(text)));
    const addAxis = (a, b) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
    let current = node;
    let { x, y } = node;
    while (current.codeName && !standsWithoutOptions(current.codeName)) {
      if (current.parts?.length !== 1) return null;
      current = current.parts[0];
      x = addAxis(x, current.x);
      y = addAxis(y, current.y);
    }
    if (!current.codeName) return null;
    const spelled = current.codeName + BlissSVGBuilder.#positionSuffix(x, y);
    return partitionWordIndicators([spelled], blissElementDefinitions).valid.length === 1 ? spelled : null;
  }

  // Whether a part node or anything inside it holds an option.
  static #carriesOptions(node) {
    return !!node && (Object.keys(node.options ?? {}).length > 0
      || (node.parts ?? []).some((part) => BlissSVGBuilder.#carriesOptions(part)));
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

  // The bare-alias discriminator for the preserve-mode base-slot guards: a
  // name whose definition is a pure rename ({codeString} only, no identity)
  // sheds its `;`-siblings on reparse (strict separation), so such a name
  // never heads a multi-part emission; typed names dumb-append and round-trip.
  static #isBareAliasDefinition(def) {
    return !!def && BlissSVGBuilder.#detectType(def) === 'bare';
  }

  // Preserve-completeness chunk: written-name consult for the glyph-level
  // recording. Walks single-code links from `name`; the name is emittable
  // only when the chain passes a CUSTOM definition with identity (typed
  // shape/glyph/indicator; bare shorthand never qualifies) AND the glyph is a
  // clean instance: it has exactly the parts the name reloads to, and still
  // carries every option key the name supplies. The part match already asks
  // more of the parts than the key check does, so reading every level costs
  // the public JSON nothing it keeps, where the parts below them are gone.
  static #preservedWrittenName(name, glyph, readings) {
    const { parts } = glyph;
    let code = name;
    let identityDef = null;
    const seen = new Set();
    while (!seen.has(code)) {
      seen.add(code);
      if (builtInCodes.has(code)) break;
      const def = Object.prototype.hasOwnProperty.call(blissElementDefinitions, code)
        ? blissElementDefinitions[code] : undefined;
      if (!def || typeof def.codeString !== 'string') break;
      if (def.isBlissGlyph || def.isShape || def.isExternalGlyph
          || def.glyphCode || def.isIndicator === true
          || typeof def.getPath === 'function') {
        identityDef = def;
      }
      if (!SINGLE_CODE_TOKEN.test(def.codeString)) break;
      code = def.codeString;
    }
    if (!identityDef || !Array.isArray(parts)) return null;
    const named = BlissSVGBuilder.#partsNamedBy(name, readings);
    return named && parts.length === named.length
      && BlissSVGBuilder.#startsWithParts(parts, named)
      && BlissSVGBuilder.#keepsNamedOptions(glyph, name, 'glyph', readings) ? name : null;
  }

  // The parser's own reading of `code` alone, so the definition's spelling
  // cannot matter (`[x=2]>S8`, `S8:2` and `S8:2,` are one part). At 'glyph'
  // level it is the one character the code reads as; at 'part' level the part
  // it reads as in a `;` slot, through the scaffold the part methods parse a
  // new part with. The two differ: a shape's own defaults land on the
  // character when it is written alone and on the part when it sits in a slot.
  // Null when the code does not read as one character or one part, which a
  // name holding a separator can do: define() accepts one, and the parser
  // splits on the separator before it looks the name up. `readings` memoizes
  // it for one save, during which no definition can change.
  static #readingOf(code, level, readings) {
    const memoKey = `${level}:${code}`;
    if (readings.has(memoKey)) return readings.get(memoKey);
    const { groups } = BlissParser.parse(level === 'part' ? `H;${code}` : code);
    const glyphs = groups?.length === 1 ? groups[0].glyphs : undefined;
    const glyph = glyphs?.length === 1 ? glyphs[0] : undefined;
    let reading = null;
    if (level === 'glyph') {
      if (Array.isArray(glyph?.parts)) reading = glyph;
    } else if (glyph?.parts?.length === 2) {
      reading = glyph.parts[1];
    }
    readings.set(memoKey, reading);
    return reading;
  }

  // The parts a custom name reloads to as a character, or null.
  static #partsNamedBy(name, readings) {
    return BlissSVGBuilder.#readingOf(name, 'glyph', readings)?.parts ?? null;
  }

  // Whether an element written by its custom name still carries every option
  // key that reading the name back supplies, each level against the same
  // level of the element: a key the name puts on a part is not carried by the
  // character holding it. A name that fails would bring the key back on
  // reload, so the element is spelled out instead. Presence, not value: an
  // override keeps the name, and the name reloads the override. A name that
  // does not read as one element cannot vouch for anything, so it fails.
  //
  // `levels` is how far down the save's route reads the name back. The string
  // writes the name alone, so reading it back restores every level it reaches
  // (Infinity). The public JSON writes a character's parts out beside its
  // name, so the name restores only the character's own options there (0),
  // and each part is judged by its own name.
  //
  // Only custom names are asked about. A built-in is never spelled out, and a
  // shape drawn by its own function has nothing to spell out into.
  static #keepsNamedOptions(node, name, level, readings, levels = Infinity) {
    const reading = BlissSVGBuilder.#readingOf(name, level, readings);
    return !!reading && BlissSVGBuilder.#carriesKeysOf(node, reading, levels);
  }

  // Whether `node` holds a value the string writes (so not `false`) for every
  // key `reading` holds, at its own level and then, `levels` deep, part by
  // part below it. A part the element no longer has carries nothing. A part
  // with no parts array is written by its name, which brings its inner parts
  // back whatever this answers.
  static #carriesKeysOf(node, reading, levels) {
    const writtenKeys = (bag) => Object.entries(bag ?? {})
      .filter(([, value]) => value !== false)
      .map(([key]) => programmaticOptionKey(key));
    const held = new Set(writtenKeys(node?.options));
    if (!writtenKeys(reading.options).every((key) => held.has(key))) return false;
    const parts = node ? node.parts : [];
    if (levels === 0 || !Array.isArray(parts)) return true;
    return (reading.parts ?? []).every((part, i) => BlissSVGBuilder.#carriesKeysOf(parts[i], part, levels - 1));
  }

  // Whether `parts` begins with `named`, part for part, judged on the written
  // anatomy rather than on text: comparing a glyph with the text of its
  // definition read every spelling the save does not reproduce as a change
  // (`[x=2]>S8` against `S8:2`, `stroke-width` against the published
  // `strokeWidth`), and silently dropped the name.
  //
  // Axis PRESENCE counts: an axis the definition never wrote is a change even
  // at 0, because only the layout knows whether it is inert, and a kept name is
  // the one direction that can move ink. Nested parts are not compared, since
  // a part's own name writes them back on every save whatever this answers.
  static #startsWithParts(parts, named) {
    if (parts.length < named.length) return false;
    return named.every((part, i) => {
      const candidate = parts[i];
      return BlissSVGBuilder.#drawnCode(candidate.codeName) === BlissSVGBuilder.#drawnCode(part.codeName)
        && candidate.x === part.x && candidate.y === part.y
        && BlissSVGBuilder.#optionsKey(candidate.options) === BlissSVGBuilder.#optionsKey(part.options);
    });
  }

  // The code a part draws, following single-code links to their end, which is
  // how the parser reads a single-code rename. The preserve strip renames a
  // part back to the alias it was written as, and only where the part's
  // context allows it, while a part rebuilt from a save may carry no record of
  // the alias at all, so the names as they stand would read one part as two.
  static #drawnCode(code) {
    const seen = new Set();
    while (!seen.has(code)) {
      seen.add(code);
      const next = Object.prototype.hasOwnProperty.call(blissElementDefinitions, code)
        ? blissElementDefinitions[code].codeString : undefined;
      if (typeof next !== 'string' || !Object.prototype.hasOwnProperty.call(blissElementDefinitions, next)) break;
      code = next;
    }
    return code;
  }

  // An options bag in a form two bags can be compared in: each name under the
  // spelling toJSON publishes it with, so a bag toJSON has already published
  // (`strokeWidth`) meets one still stored (`stroke-width`), and in no
  // particular order, since a bag has none. Publication rather than name
  // resolution: both bags were admitted already, so nothing here is ingest.
  static #optionsKey(options) {
    return Object.entries(options ?? {})
      .map(([key, value]) => `${programmaticOptionKey(key)}=${serializeOptionValue(value)}`)
      .sort()
      .join(';');
  }

  // A rename chain is pure when every link is a single bare token down to a
  // built-in, primitive, or unknown end. A decorated custom anatomy
  // (coordinates, options, or several parts) dissolves its state INTO the
  // parsed part, so restoring the written name onto a decorated part would
  // re-emit that state as instance decoration and shift the reparse.
  static #renameChainIsPure(name) {
    let code = name;
    const seen = new Set();
    while (!builtInCodes.has(code)) {
      if (seen.has(code)) return false;
      seen.add(code);
      const def = Object.prototype.hasOwnProperty.call(blissElementDefinitions, code)
        ? blissElementDefinitions[code] : undefined;
      if (!def || typeof def.codeString !== 'string') return true;
      if (!SINGLE_CODE_TOKEN.test(def.codeString)) return false;
      code = def.codeString;
    }
    return true;
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

  // Deferred validation of forward references (Phase 2.3): define() accepts
  // a codeString that references a not-yet-defined code, so the
  // indicator-bake guard (D-S1a) can be bypassed by definition ORDER — the
  // glyph registers while its reference is unknown, and a later define/patch
  // makes that reference an indicator. This scan runs at that later moment,
  // the completing call: with `code` about to become `newEntry`, every
  // custom glyph definition (not itself a compound indicator) is re-checked
  // for a reference that would now resolve to an indicator (through
  // pure-rename aliases too, so a bare-alias completion cannot slip
  // through). A conflict rejects the COMPLETING call and changes nothing:
  // either definition order ends in the same refusal.
  static #assertNoIndicatorBakeDependents(callName, code, newEntry) {
    const view = { ...blissElementDefinitions, [code]: newEntry };
    const dependents = [];
    for (const [depCode, depDef] of Object.entries(blissElementDefinitions)) {
      if (depCode === code) continue;
      if (depDef.isBlissGlyph !== true || depDef.isIndicator === true || typeof depDef.codeString !== 'string') continue;
      const refs = BlissSVGBuilder.#extractReferencedCodes(depDef.codeString);
      const bakes = refs.some(ref => {
        const refDef = Object.prototype.hasOwnProperty.call(view, ref) ? view[ref] : undefined;
        return refDef !== undefined && resolveEffectiveDefinition(refDef, view)?.isIndicator === true;
      });
      if (bakes) dependents.push(depCode);
    }
    if (dependents.length > 0) {
      const plural = dependents.length > 1 ? 's' : '';
      const list = dependents.map(d => `"${d}"`).join(', ');
      throw new Error(`${callName}("${code}"): making "${code}" an indicator would make the glyph definition${plural} ${list} bake an indicator, a state define() rejects. Remove or redefine the dependent definition${plural} first, then define "${code}".`);
    }
  }

  // Word-internal coordinate guard shared by #defineBare and patchDefinition
  // (coordinate ownership: coordinates belong at the usage site, never baked
  // into a portable word alias). Kerning markers (RK:/AK:) are spacing, not
  // coordinates, so their `:` values are exempt (GH #36 false-positive fix).
  static #assertNoWordInternalCoordinates(callName, code, codeString) {
    if (!codeString.includes('/')) return;
    const segments = codeString.split(/[/;]/).filter(Boolean);
    const hasCoords = segments.some(seg => !/^(?:RK|AK)(?::|$)/.test(seg) && /:-?[\d.]/.test(seg));
    if (hasCoords) {
      throw new Error(`${callName}("${code}"): word definitions (containing /) cannot have internal coordinates. Move coordinates to the usage site.`);
    }
  }

  // An SP segment in a stored codeString can never resolve: SP has meaning
  // only at the top level, where punctuation context turns it into TSP/QSP.
  // `/SP/` is written sugar for `//`, so a definition using it normalizes to
  // the `//` form silently (user ruling 2026-07-18). Quote-bearing
  // codeStrings are left untouched: definition ingestion is quote-unaware
  // today (post-1.0.0 family), and a naive split could cut inside a quoted
  // option value.
  static #normalizeSpaceSegments(codeString) {
    if (!codeString.includes('/') || /["']/.test(codeString)) return codeString;
    const segments = codeString.split('/');
    const normalized = [];
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === 'SP') {
        normalized.push('');
        // An interior SP sits between two real slashes, so one empty segment
        // reproduces `//`; an edge SP has only one neighboring slash, so it
        // needs a second empty segment or the space silently vanishes
        // (`SP/B291` must store `//B291`, not `/B291`; review MAJOR-1).
        if (i === 0 || i === segments.length - 1) normalized.push('');
      } else {
        normalized.push(segments[i]);
      }
    }
    return normalized.join('/');
  }

  // ── Private define helpers ──────────────────────────────────────

  static #defineShape(code, definition, options = {}, warnings) {
    BlissSVGBuilder.#validateCode(code);

    const hasGetPath = typeof definition?.getPath === 'function';
    const hasCodeString = typeof definition?.codeString === 'string' && definition.codeString.trim().length > 0;

    if (!hasGetPath && !hasCodeString) {
      throw new Error(`define("${code}"): shape requires either "getPath" (function) or "codeString" (non-empty, non-whitespace string).`);
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

      const shapeRunWord = BlissSVGBuilder.#expandedRunWord(definition.codeString);
      if (shapeRunWord) {
        throw new Error(`define("${code}"): a shape definition cannot be a multi-character word ("${definition.codeString}" is shorthand for "${shapeRunWord}"). Define a word as a bare alias (omit type:"shape").`);
      }
    }

    BlissSVGBuilder.#assertReplaceable(code, options);

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
        BlissSVGBuilder.#assertDefaultOptionsDescribeTheCharacter('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = BlissSVGBuilder.#toCuratedSpelling(defaultOptionsSnapshot, code, warnings);
      }
    }

    blissElementDefinitions[code] = entry;
  }

  // `define()` and `patchDefinition()` are JavaScript entry points, so camelCase
  // is their spelling of the curated vocabulary, exactly as it is the
  // constructor's, `addGlyph`'s and the handle setters'. They translate it the
  // same way and by the same gate: only names the library owns in BOTH spellings
  // are touched, because hyphenating an arbitrary name is a guess that would
  // destroy `preserveAspectRatio` and every camelCase data attribute.
  //
  // Runs AFTER the defaultOptions guard, on the object that guard judged, for two
  // reasons. The guard's error must name the spelling the caller typed, or it
  // tells them to fix a key they never wrote; and translating first could not
  // smuggle anything past it anyway, since it already tests both spellings.
  //
  // A loss is reported here for the same reason it is reported at every other
  // ingest site: a definition's defaults reach a composition as authored
  // options, so a value refused there must be refused here too, and a value
  // displaced by a second spelling of its name is gone just as quietly. This
  // bag had no route out until the spelling report needed one, so `define()`
  // and `patchDefinition()` grew one rather than folding the report into
  // `errors`, which would claim the definition was refused when it is
  // registered and usable. Both reports name the code because one `define()`
  // call can carry many, and the caller otherwise cannot tell which definition
  // the lost value came from.
  static #toCuratedSpelling(defaultOptions, code, warnings) {
    const translated = {};
    const warn = warnings
      ? (w) => warnings.push({ ...w, message: `"${code}": ${w.message}` })
      : undefined;
    for (const [key, value] of admitOptions(Object.entries(defaultOptions), warn)) {
      translated[key] = value;
    }
    return translated;
  }

  // A definition says what a character IS, and its defaultOptions attach to
  // every use of it, at character or part level depending on how the use is
  // written. So a key can be a default only if it means the same thing at every
  // use, and five kinds cannot:
  // - A builder-canvas (global-only) key and a layer key act on the whole SVG,
  //   so they are inert at every use, and a ;; overlay stores the definition
  //   NAME, so no parse boundary would ever report them.
  // - A position or kerning key says where ONE use sits: in its parent, or
  //   after its neighbour. As a default neither had one meaning. Kerning
  //   applied where the definition stood as a character and was saved as a
  //   misplaced bracket where it stood as a part, and a position beat the
  //   coordinate the author wrote at the use site.
  // - `key` identifies one element, so as a default every use claims the same.
  // Refused at the source, like the codeString guards, in the spelling the
  // caller typed. The translation to the stored spelling runs after this guard,
  // so a canvas key is checked in both spellings and a use-site key by the name
  // it will be stored under.
  static #assertDefaultOptionsDescribeTheCharacter(callName, code, defaultOptions) {
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
      // The two internal names have no curated kebab twin, so neither spelling
      // test below can see that they mean `crop`, which IS global-only:
      // `camelToKebab` gives `auto-vertical`, which is not an option at all.
      // Resolved through the same lookup the options pass uses, or the guard
      // refuses `crop` while accepting two spellings of it — and an accepted one
      // is stored, is inert here exactly as `crop` would be, and then reports
      // MISPLACED_OPTION_SPELLING at render naming a remedy this guard refuses.
      const internalOnly = INTERNAL_ONLY_SPELLINGS.get(normalized);
      const meant = internalOnly ? internalOnly.split('=')[0] : normalized;
      if (GLOBAL_ONLY_OPTION_KEYS.has(meant) || GLOBAL_ONLY_OPTION_KEYS.has(camelToKebab(meant))) {
        const named = internalOnly
          ? `"${key}", the library's internal name for the global-only option "${internalOnly}"`
          : `the global-only option "${key}"`;
        throw new Error(`${callName}("${code}"): defaultOptions cannot include ${named}; it configures the whole SVG and would be inert on a definition. Set it in the global bracket ([...]||) or the builder options instead.`);
      }
      // Same reasoning one step along: a layer key targets a layer of the whole
      // SVG, so it is inert wherever a definition's defaults attach.
      if (isLayerAttributeKey(normalized)) {
        throw new Error(`${callName}("${code}"): defaultOptions cannot include the layer option "${key}"; it targets a layer of the whole SVG and would be inert on a definition. Set it in the global bracket ([...]||) or the builder options instead.`);
      }
      // The stored name is the one that acts where the definition is used, and
      // it is not always the typed one: `X` is stored as `x`.
      const stored = canonicalOptionKey(normalized);
      if (stored === 'x' || stored === 'y') {
        throw new Error(`${callName}("${code}"): defaultOptions cannot include the position option "${key}"; a position says where one use of a character sits, not what the character is. Set it where the code is used instead, as a coordinate (${code}:x,y) or the ${stored} option on that element.`);
      }
      if (Object.hasOwn(KERNING_OPTION_KEYS, stored)) {
        throw new Error(`${callName}("${code}"): defaultOptions cannot include the kerning option "${key}"; kerning is the gap before one use of a character, not part of what the character is. Set it where the code is used instead, with an RK:/AK: marker before it or in that character's options, or in the kerningRules of the character before it when the gap depends on the pair.`);
      }
      if (stored === 'key') {
        throw new Error(`${callName}("${code}"): defaultOptions cannot include "${key}"; a key identifies one element, so every use of the definition would share it. Set it on the element where the code is used instead.`);
      }
    }
  }

  static #defineGlyph(code, definition, options = {}, warnings) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.trim().length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty, non-whitespace string.`);
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

    const glyphRunWord = BlissSVGBuilder.#expandedRunWord(definition.codeString);
    if (glyphRunWord) {
      throw new Error(`define("${code}"): a glyph definition cannot be a multi-character word ("${definition.codeString}" is shorthand for "${glyphRunWord}"). Define a word as a bare alias (omit type:"glyph").`);
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

    BlissSVGBuilder.#assertReplaceable(code, options);

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
        BlissSVGBuilder.#assertDefaultOptionsDescribeTheCharacter('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = BlissSVGBuilder.#toCuratedSpelling(defaultOptionsSnapshot, code, warnings);
      }
    }

    if (entry.isIndicator === true) {
      BlissSVGBuilder.#assertNoIndicatorBakeDependents('define', code, entry);
    }

    blissElementDefinitions[code] = entry;
  }

  static #defineExternalGlyph(code, definition, options = {}, warnings) {
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

    BlissSVGBuilder.#assertReplaceable(code, options);

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
        BlissSVGBuilder.#assertDefaultOptionsDescribeTheCharacter('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = BlissSVGBuilder.#toCuratedSpelling(defaultOptionsSnapshot, code, warnings);
      }
    }

    blissElementDefinitions[code] = entry;
  }

  // Resolution VIEW of a codeString, for validation only — never stored
  // (store-as-written, ratified 2026-07-22: definition content keeps
  // bare-alias references verbatim and the parser resolves them late).
  // Replaces bare alias tokens with their resolved codeString, repeating
  // until no more aliases remain (up to depth 50), so a guard can judge
  // what a reference chain would deliver (the word-internal-coordinate
  // guard in #defineBare and patchDefinition).
  // Head-marker contract: marked invocations (ALIAS^) and aliases whose
  // codeString carries a ^ designation stay as references, so the parser
  // resolves the marker in its own word-string scope (rules 2 and 4).
  // Inlining them would silently rebind the marker to a different scope.
  static #resolveBareAliases(codeString) {
    let resolved = codeString;
    for (let depth = 0; depth < 50; depth++) {
      let changed = false;
      // \w+ (not letter-first): define() accepts digit-leading names (the
      // Blissary-ID pattern, e.g. '1219'), so aliases to them must resolve
      // like any other single-code rename (review MINOR-4). The lookbehind/
      // lookahead boundaries keep coordinate and kerning values (after ':')
      // out of reach.
      resolved = resolved.replace(
        /(?<=^|[/;])(\w+)(?=$|[/;:])/g,
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
   * ;-part, which the parser flags COMPOSITE_AS_PART. Run on the written
   * codeString — the form that gets stored (store-as-written).
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

  static #defineBare(code, definition, options = {}, warnings) {
    BlissSVGBuilder.#validateCode(code);

    if (typeof definition?.codeString !== 'string' || definition.codeString.trim().length === 0) {
      throw new Error(`define("${code}"): "codeString" must be a non-empty, non-whitespace string.`);
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
    // composed unflagged alias as a ;-part (checked on the written codeString,
    // which is also what gets stored), so define() is consistent with the
    // use-site failure.
    if (BlissSVGBuilder.#hasCompositePartViolation(definition.codeString)) {
      throw new Error(`define("${code}"): a ; part cannot be a composition ("${definition.codeString}"). A ; part must be a primitive or a flagged glyph; attach indicators at the use site (BASE;INDICATOR) or compose words with /.`);
    }

    BlissSVGBuilder.#assertReplaceable(code, options);

    // Store-as-written (ratified 2026-07-22): bare-alias references in the
    // codeString stay verbatim, so definition content is late-bound like a
    // native code (a redefine of a referenced code flows through to every
    // composition using it). Only /SP/ space segments normalize.
    const stored = BlissSVGBuilder.#normalizeSpaceSegments(definition.codeString);

    // Word definitions (containing /) must not have internal position
    // modifiers, not even through a referenced alias: the guard judges the
    // RESOLVED VIEW so a stored 'POSX/B313' cannot bake coordinates via
    // POSX = 'B291:2,3'. Position belongs at the usage site, e.g. WORD:2,0.
    BlissSVGBuilder.#assertNoWordInternalCoordinates(
      'define', code, BlissSVGBuilder.#resolveBareAliases(stored)
    );

    const entry = { codeString: stored };

    if (definition.defaultOptions && typeof definition.defaultOptions === 'object') {
      // Snapshot ONCE, validate the snapshot, store the SAME snapshot: the
      // guard must judge exactly what the registry keeps, or an accessor /
      // Proxy could show one set of keys to validation and another to storage
      // (round-4 review F1).
      const defaultOptionsSnapshot = { ...definition.defaultOptions };
      if (Object.keys(defaultOptionsSnapshot).length > 0) {
        BlissSVGBuilder.#assertDefaultOptionsDescribeTheCharacter('define', code, defaultOptionsSnapshot);
        entry.defaultOptions = BlissSVGBuilder.#toCuratedSpelling(defaultOptionsSnapshot, code, warnings);
      }
    }

    if (resolveEffectiveDefinition(entry, blissElementDefinitions)?.isIndicator === true) {
      BlissSVGBuilder.#assertNoIndicatorBakeDependents('define', code, entry);
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
    const result = { defined: [], skipped: [], errors: [], warnings: [] };

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

        // isIndicator declares a compound indicator glyph and is honored only
        // on a type:'glyph' definition. On a bare alias, shape, or external
        // glyph the flag was silently dropped, so the `;`-slot render and the
        // `;;` gate disagreed with the stated intent (run-to-stable Phase 2.4c).
        // Reject it and point to the documented form. Indicator-ness still
        // rides through an unflagged bare alias whose target is a real
        // indicator (e.g. { codeString: 'B81' }); only the flag on a non-glyph
        // definition is rejected.
        if (definition?.isIndicator === true && type !== 'glyph') {
          result.errors.push(`"${code}": isIndicator is only valid on a type:'glyph' definition (a compound indicator glyph). To declare a custom indicator, use type:'glyph' with isIndicator:true.`);
          continue;
        }

        if (type === 'glyph') {
          BlissSVGBuilder.#defineGlyph(code, definition, options, result.warnings);
        } else if (type === 'shape') {
          BlissSVGBuilder.#defineShape(code, definition, options, result.warnings);
        } else if (type === 'externalGlyph') {
          BlissSVGBuilder.#defineExternalGlyph(code, definition, options, result.warnings);
        } else if (typeof definition?.getPath === 'function' && typeof definition?.char === 'string') {
          BlissSVGBuilder.#defineExternalGlyph(code, definition, options, result.warnings);
        } else if (typeof definition?.getPath === 'function') {
          BlissSVGBuilder.#defineShape(code, definition, options, result.warnings);
        } else if (typeof definition?.codeString === 'string') {
          BlissSVGBuilder.#defineBare(code, definition, options, result.warnings);
        } else {
          result.errors.push(`"${code}": unable to detect definition type. Provide codeString, type+getPath+width+height (shape), or type+getPath+char (externalGlyph).`);
          continue;
        }
        result.defined.push(code);
      } catch (err) {
        if (err.code === 'ALREADY_EXISTS') {
          result.skipped.push(code);
        } else {
          result.errors.push(`"${code}": ${err.message}`);
        }
      }
    }

    return result;
  }

  // Registry membership is OWN-property membership: the definitions object
  // inherits from Object.prototype, so a plain `in` or truthy lookup reports
  // inherited names (toString, constructor, __proto__, ...) as defined codes
  // and hands back JS built-ins as definitions. define()'s existence gate
  // (#assertReplaceable) intentionally keeps its truthy check: it classifies
  // inherited names as already-exists in the DEFAULT path. That accident does
  // NOT hold under overwrite:true, where a non-literal "__proto__" key (e.g.
  // JSON.parse output) still reaches the registry assignment and reassigns
  // the registry's prototype through the inherited setter; the define-side
  // name-policy backlog item tracks closing that vector.
  static #ownsDefinition(code) {
    return Object.prototype.hasOwnProperty.call(blissElementDefinitions, code);
  }

  /**
   * Check if a code is defined.
   * @param {string} code
   * @returns {boolean}
   */
  static isDefined(code) {
    return BlissSVGBuilder.#ownsDefinition(code);
  }

  /**
   * Get definition metadata for a code (frozen copy, not the live object).
   *
   * @param {string} code
   * @returns {Object|null} Frozen metadata object, or null if not found
   */
  static getDefinition(code) {
    if (!BlissSVGBuilder.#ownsDefinition(code)) return null;
    const def = blissElementDefinitions[code];

    const copy = {};
    for (const [key, value] of Object.entries(def)) {
      if (typeof value === 'object' && value !== null) {
        copy[key] = Object.freeze({ ...value });
      } else {
        copy[key] = value;
      }
    }

    copy.type = BlissSVGBuilder.#detectType(def);

    copy.isBuiltIn = protectedCodes.has(code);

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
    if (protectedCodes.has(code)) {
      throw new Error(`removeDefinition("${code}"): cannot remove built-in definitions.`);
    }
    if (!BlissSVGBuilder.#ownsDefinition(code)) {
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
    // Same channel as define()'s, for the same reason: a patched
    // defaultOptions bag can collapse two spellings of one name, and the
    // displaced value must not vanish in silence here either.
    const warnings = [];
    if (!BlissSVGBuilder.#ownsDefinition(code)) {
      throw new Error(`patchDefinition("${code}"): code is not defined.`);
    }
    if (protectedCodes.has(code)) {
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
      if (typeof newCodeString !== 'string' || newCodeString.trim().length === 0) {
        throw new Error(`patchDefinition("${code}"): "codeString" must be a non-empty, non-whitespace string.`);
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
      const patchRunWord = (type === 'glyph' || type === 'shape')
        && BlissSVGBuilder.#expandedRunWord(newCodeString);
      if (patchRunWord) {
        throw new Error(`patchDefinition("${code}"): a ${type} definition cannot be a multi-character word ("${newCodeString}" is shorthand for "${patchRunWord}"). Define a word as a bare alias (omit type:"${type}").`);
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
      // as a ;-part (checked on the written codeString, the form that gets stored).
      if (type === 'bare' && BlissSVGBuilder.#hasCompositePartViolation(newCodeString)) {
        throw new Error(`patchDefinition("${code}"): a ; part cannot be a composition ("${newCodeString}"). A ; part must be a primitive or a flagged glyph; attach indicators at the use site (BASE;INDICATOR) or compose words with /.`);
      }
    }

    // D-S1a on the patch surface: a glyph (not flagged isIndicator) cannot
    // bake an indicator, whichever property the patch changes — a codeString
    // gaining indicator anatomy, or an isIndicator un-flag on a compound
    // indicator that keeps its anatomy. The POST-patch state is judged, so
    // codeString + isIndicator:true in one patch stays legal.
    if (type === 'glyph' && ('codeString' in changes || 'isIndicator' in changes)) {
      const nextCodeString = 'codeString' in changes ? changes.codeString : def.codeString;
      const nextIsIndicator = 'isIndicator' in changes ? changes.isIndicator === true : def.isIndicator === true;
      if (!nextIsIndicator && typeof nextCodeString === 'string') {
        const refs = BlissSVGBuilder.#extractReferencedCodes(nextCodeString);
        if (refs.some(ref => blissElementDefinitions[ref]?.isIndicator === true)) {
          throw new Error(`patchDefinition("${code}"): a glyph definition cannot bake in an indicator. Define a base+indicator combination as a bare alias (omit type:"glyph"), attach the indicator at the use site (BASE;INDICATOR), or flag a compound indicator with isIndicator:true.`);
        }
      }
    }

    // For bare definitions, store the codeString as written (bare-alias
    // references stay verbatim and resolve at parse time); SP segments
    // normalize to word breaks and the word-internal-coordinate guard
    // judges the resolved view, mirroring #defineBare (patch cannot
    // construct a state define() forbids).
    if ('codeString' in changes && type === 'bare') {
      const stored = BlissSVGBuilder.#normalizeSpaceSegments(changes.codeString);
      BlissSVGBuilder.#assertNoWordInternalCoordinates(
        'patchDefinition', code, BlissSVGBuilder.#resolveBareAliases(stored)
      );
      changes = { ...changes, codeString: stored };
    }

    // Deferred validation at the completing patch (Phase 2.3): a patch that
    // makes this definition an indicator — a glyph isIndicator flip, or a
    // bare codeString now resolving to an indicator — re-checks every custom
    // glyph referencing it, exactly like the completing define.
    const becomesIndicator =
      (type === 'glyph' && changes.isIndicator === true && def.isIndicator !== true) ||
      (type === 'bare' && 'codeString' in changes &&
        resolveEffectiveDefinition({ codeString: changes.codeString }, blissElementDefinitions)?.isIndicator === true);
    if (becomesIndicator) {
      BlissSVGBuilder.#assertNoIndicatorBakeDependents('patchDefinition', code, { ...def, ...changes });
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
        BlissSVGBuilder.#assertDefaultOptionsDescribeTheCharacter('patchDefinition', code, defaultOptionsSnapshot);
      }
      changes = { ...changes, defaultOptions: BlissSVGBuilder.#toCuratedSpelling(defaultOptionsSnapshot, code, warnings) };
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

    return { patched: true, warnings };
  }

  /**
   * Every number the picture is made of: the content box, the margins and crops
   * applied to it, and the two root dimensions derived from the result.
   *
   * It sits outside the `#svgCode` getter so `#rebuild` can judge the same
   * numbers the markup will carry without rendering anything. Pure arithmetic
   * over `#processedOptions` and the composition's own bounds, so calling it a
   * second time per render costs nothing and changes nothing.
   *
   * Returns exactly what its callers read. `color` and `strokeWidth` stayed
   * behind in the getter: they are paint, not geometry, and no size depends on
   * them.
   */
  #computeGeometry() {
    // Computed rendering dimensions
    const width = Math.max(this.composition.width, this.#processedOptions.minWidth ?? 0);
    const height = 20;

    // User-provided options with defaults
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
    // Clamp to >= 0: when crop insets past the available box (an empty
    // document, or a crop larger than the content), the raw difference goes
    // negative, which is invalid SVG. Flooring at 0 keeps the crop monotonic
    // (a wider crop shrinks the box toward 0 and stays there) and valid.
    const viewBoxWidth = Math.max(0, width + marginLeft + marginRight - cropLeft - cropRight);
    const viewBoxHeight = Math.max(0, height + marginTop + marginBottom - cropTop - cropBottom);
    const svgAttributeMultiplier = 6;

    // Calculate SVG element dimensions (maintaining aspect ratio)
    let svgWidth, svgHeight;
    if (this.#processedOptions.svgHeight !== undefined) {
      // Height specified: calculate width to maintain aspect ratio.
      // Guard the clamped viewBoxHeight === 0 case so it never divides to NaN.
      svgHeight = this.#processedOptions.svgHeight;
      svgWidth = viewBoxHeight > 0 ? (viewBoxWidth / viewBoxHeight) * svgHeight : 0;
    } else {
      // Auto-calculate both dimensions
      svgWidth = svgAttributeMultiplier * viewBoxWidth;
      svgHeight = svgAttributeMultiplier * viewBoxHeight;
    }

    return {
      width, height, cropTop, cropBottom, cropLeft, cropRight, gridOffsetX,
      viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, svgWidth, svgHeight,
    };
  }

  get #svgCode() {
    const {
      width, height, cropTop, cropBottom, cropLeft, cropRight, gridOffsetX,
      viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, svgWidth, svgHeight,
    } = this.#computeGeometry();

    // User-provided options with defaults
    const color = this.#processedOptions.color ?? "#000000";
    const strokeWidth = this.#processedOptions.strokeWidth ?? 0.5;

    const content = this.svgContent;

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
    // Never assigned yet, and deliberately kept: two coming features emit a
    // <text> layer here (a caption for the whole SVG, and a gloss under one
    // word). Whichever lands first must set its own `fill`, because this layer
    // sits outside the content group and inherits `fill="none"` from the root.
    let svgText = "";

    // The authored attributes for one element: every class it carries, applied
    // general to specific, so the more specific class wins. That is the order the
    // classes are written in, which is what makes the precedence readable in the
    // markup rather than a rule to look up. Every key looked up here comes from
    // ELEMENT_CLASSES and never from input, so an inherited name cannot reach it.
    const authoredFor = (classes) =>
      Object.assign({}, ...classes.map(c => this.#layerAttributes[targetOfClass(c)] ?? {}));

    // `background--` names the group, which is the background's single node; the
    // rects that paint are reached with `background-zone--`.
    const backgroundWrapper = `  <g ${formatAttributes(layerAttributes(ELEMENT_CLASSES.background,
      {}, authoredFor(ELEMENT_CLASSES.background)))}>`;

    let backgroundContent = '';
    if (hasZones) {
      const bulkBg = background;
      const topColor = backgroundTop || bulkBg;
      const midColor = backgroundMid || bulkBg;
      const bottomColor = backgroundBottom || bulkBg;
      const zoneX = round(viewBoxX);
      const zoneWidth = round(viewBoxWidth);
      const topY = round(viewBoxY);
      // Zone heights floor at 0 like the outer viewBox dimensions above: an
      // ordinary vertical crop can push the viewBox past the sky (y=8) or
      // earth (y=16) boundary, and a negative height is invalid SVG on <rect>.
      const topHeight = round(Math.max(0, 8 - viewBoxY));
      const bottomHeight = round(Math.max(0, viewBoxY + viewBoxHeight - 16));

      const zoneRect = (classes, y, height, fill) =>
        `    <rect ${formatAttributes(layerAttributes(classes,
          { x: zoneX, y, width: zoneWidth, height, stroke: 'none', fill },
          authoredFor(classes)))}/>`;

      const zoneRects = [
        topColor ? zoneRect(ELEMENT_CLASSES.zoneTop, topY, topHeight, topColor) : '',
        midColor ? zoneRect(ELEMENT_CLASSES.zoneMid, 8, 8, midColor) : '',
        bottomColor ? zoneRect(ELEMENT_CLASSES.zoneBottom, 16, bottomHeight, bottomColor) : '',
      ].filter(Boolean).join('\n');

      backgroundContent = `${backgroundWrapper}\n${zoneRects}\n  </g>`;
    } else if (background !== "") {
      const paper = `    <rect ${formatAttributes(layerAttributes(ELEMENT_CLASSES.backgroundZone,
        { x: viewBoxX, y: viewBoxY, width: '100%', height: '100%', stroke: 'none', fill: background },
        authoredFor(ELEMENT_CLASSES.backgroundZone)))}/>`;
      backgroundContent = `${backgroundWrapper}\n${paper}\n  </g>`;
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

      // The computed key order below is load-bearing: a reordered attribute is a
      // diff in every grid assertion in the suite.
      const gridLine = (classes, strokeWidth, stroke, d) =>
        `    <path ${formatAttributes(layerAttributes(classes,
          { 'stroke-width': strokeWidth, stroke, 'stroke-linecap': 'square',
            'stroke-linejoin': 'miter', d }, authoredFor(classes)))}/>`;

      const gridLines = [
        minorD  ? gridLine(ELEMENT_CLASSES.gridMinor,  gridMinorStrokeWidth,  gridMinorColor,  minorD)  : '',
        mediumD ? gridLine(ELEMENT_CLASSES.gridMedium, gridMediumStrokeWidth, gridMediumColor, mediumD) : '',
        majorD  ? gridLine(ELEMENT_CLASSES.gridMajor,  gridMajorStrokeWidth,  gridMajorColor,  majorD)  : '',
        skyD    ? gridLine(ELEMENT_CLASSES.gridSky,    gridSkyStrokeWidth,    gridSkyColor,    skyD)    : '',
        earthD  ? gridLine(ELEMENT_CLASSES.gridEarth,  gridEarthStrokeWidth,  gridEarthColor,  earthD)  : '',
      ].filter(Boolean).join('\n');

      gridPath = [
        '  <style>',
        '    @supports (-webkit-hyphens: none) {',
        // the shared class every grid line carries, read from the declaration so
        // renaming it cannot leave this rule selecting nothing
        `      .${ELEMENT_CLASSES.gridMinor[0]} { shape-rendering: geometricPrecision; }`,
        '    }',
        '  </style>',
        `  <g ${formatAttributes(layerAttributes(ELEMENT_CLASSES.grid,
          { 'shape-rendering': 'crispEdges' }, authoredFor(ELEMENT_CLASSES.grid)))}>`,
        gridLines,
        '  </g>',
      ].join('\n');
    }

    const generator = LIB_VERSION ? `bliss-svg-builder/${LIB_VERSION}` : 'bliss-svg-builder';

    // The five paint defaults belong to the DOCUMENT, so they sit on the root
    // beside the author's own global values rather than on an inner group that
    // would shadow them. They were on the content group so that a DSL-set value
    // could not be contradicted by a default written above it; moving the
    // default target moves the defaults with it, same reason at a new address.
    const paintDefaults = {
      fill: 'none',
      stroke: color,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'stroke-width': strokeWidth,
    };

    // The root's attributes are a MERGE, not a fixed string, so a user value can
    // replace a computed one rather than appending a duplicate (two width
    // attributes is invalid XML). Order matters: computed values first, then
    // anything the author supplied, then the guard for the two names the library
    // owns.
    const rootAttrs = {
      xmlns: 'http://www.w3.org/2000/svg',
      'data-generator': generator,
      width: round(svgWidth),
      height: round(svgHeight),
      viewBox: `${round(viewBoxX)} ${round(viewBoxY)} ${round(viewBoxWidth)} ${round(viewBoxHeight)}`,
      class: ELEMENT_CLASSES.root.join(' '),
      ...paintDefaults,
      ...this.globalSvgAttributes,
    };
    // The spread above let an authored `class` overwrite the structural name;
    // put it back in front, keeping the position the literal established.
    rootAttrs.class = mergeStructuralClass(ELEMENT_CLASSES.root.join(' '), this.globalSvgAttributes['class']);

    // Link attributes belong to the level-0 anchor wrap, never to a layer.
    for (const name of ANCHOR_ATTRIBUTE_NAMES) delete rootAttrs[name];
    // vector-effect is non-inherited, so on the root it would be a dead
    // attribute; relocate it onto the glyph paths, where it takes effect.
    // Always remove it (even an empty value); only stamp the paths when there
    // is a value, matching the element-scope handling in BlissElement.
    // Relocation repairs the library's OWN default destination, so it belongs
    // to the bare channel alone. `root--vector-effect` names the root
    // deliberately and is emitted there verbatim, dead, exactly as
    // `content--vector-effect` is.
    let contentInner = content;
    if ('vector-effect' in rootAttrs && !this.#rootPrefixedNames.has('vector-effect')) {
      const vectorEffect = rootAttrs['vector-effect'];
      delete rootAttrs['vector-effect'];
      if (vectorEffect) contentInner = BlissElement.applyVectorEffectToPaths(content, vectorEffect);
    }

    const contentAttrs = layerAttributes(ELEMENT_CLASSES.content, {}, authoredFor(ELEMENT_CLASSES.content));

    let svgStr = [
      `<svg ${formatAttributes(rootAttrs)}>`,
      title,
      desc,
      backgroundContent,
      gridPath,
      `  <g ${formatAttributes(contentAttrs)}>`,
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
