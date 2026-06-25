// Code -> reference-SVG filename notation for the visual-regression corpus.
// Single source of truth, used by the curated case list
// (`BlissSVGBuilder.visual-regression.e2e.cases.js`), the reference-SVG
// regeneration engine, and the corpus tooling. Promoted from the R2
// corpus-expansion `.tmp.mjs` tooling (plan 2026-06-24, decision 8) at Phase 3
// task 10.
//
// WHY: a reference-SVG filename encodes its producing code so the composition can
// be read straight off the filename. An ALIAS NAME (SEMB, _VR_OUTER, ...) is local
// and meaningless to someone reading the corpus later, so decision 8 DROPS it and
// substitutes its expansion, wrapped to mark that it came from a definition:
//   - bare alias (codeString def, no type)    ->  ( ...expansion... )
//   - glyph  (define type:'glyph')             ->  [ ...expansion... ]
//   - indicator (glyph + isIndicator:true)     ->  { ...expansion... }
// The wrapper distinguishes the def KIND because a glyph/indicator carries identity
// and does NOT decompose to its codeString the way a bare alias does -- same
// codeString, different element tree, so it must get a distinct filename.
// The expansion is fully flattened (nested alias names resolved away to primitive
// codes) and then converted by the one separator rule used everywhere in the
// corpus filenames ("Style B" = fully converted inside the brackets too):
//
//   CONVERSION KEY (apply uniformly, inside the brackets and out):
//     //  ->  __     (word separator)
//     /   ->  _      (character separator)
//     ;;  ->  ++     (word-level indicator overlay)      [R14]
//     ;   ->  +      (character-level indicator / part)
//     :   ->  #      (position / parameter suffix)
//   DEF-LEVEL METADATA (inside [ ] / { } only, appended after the codeString):
//     @ax,ay         the def's anchorOffsetX,anchorOffsetY (how a glyph anchors /
//                    an indicator centers); omitted when (0,0), both axes written.
//                    Distinct from a ':x,y' codeString suffix (-> '#x,y') and from a
//                    use-site relocation (a TRAILING '#x,y'). width is NOT encoded.
//   Left untouched: B-codes, shape codes, ^ (head marker), ! (strip-semantic),
//   digits, , - . (coordinates / kerning), @ (anchorOffset marker), and the
//   ( ) [ ] { } wrappers themselves.
//
// Examples:
//   SEMB = B313;B97 (bare alias):           SEMB;!B81  ->  (B313+B97)+!B81.svg
//   _VR_OUTER = B208/_VR_INNER,
//   _VR_INNER = B313//B431^ (nested):       _VR_OUTER  ->  (B208_B313__B431^).svg
//                                           (both alias names dropped, flattened)
//   MI = {glyph,isIndicator} B86;SDOT:3,4 @ -0.5,0:  MI  ->  {B86+SDOT#3,4@-0.5,0}.svg
//
// OPTION cases ([opt=val]||content) are NOT rule-derived: the conversion key
// defines no mapping for [ ] = ||, so codeToFilename() returns null and the caller
// keeps a curated descriptive "opt-..." name (with any embedded alias expanded via
// expandAliasesInFilename).

// A code-position token (B-code or alias) is bounded by start-of-string or a
// separator before it, and by end-of-string / a separator / a ^ marker / a :
// position-suffix after it. ^ and ! never PRECEDE a code, so they are not opening
// boundaries; | covers the [opts]|| -> content boundary.
const BOUNDARY_BEFORE = '(?<=^|[/;|])';
const BOUNDARY_AFTER = '(?=$|[/;:^])';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize a def entry to { expansion, open, close, offset }. The wrapper encodes
// the def KIND, which determines the element tree (hence the render AND the
// serialization), so a glyph / indicator def is a DIFFERENT input than a bare alias
// with the same codeString and must NOT share its filename:
//   - bare codeString alias (no type)             ->  ( ... )  decomposes to primitives
//   - glyph  (define type:'glyph' -> isBlissGlyph) -> [ ... ]  carries identity, does
//       NOT decompose to its codeString (the N7 lesson)
//   - indicator (isIndicator: true)               ->  { ... }  glyph that also
//       auto-positions / attaches as an indicator
// A glyph/indicator def carries BOTH a codeString and its identity flags, so the
// kind MUST be checked before codeString, most-specific first.
// Def-level anchorOffset -> a filename suffix '@ax,ay', shown INSIDE the [ ] / { }
// wrapper after the codeString (the def's identity metadata: how a glyph anchors /
// an indicator centers). Distinct from a ':x,y' position suffix in the codeString
// (-> '#x,y') and from a use-site relocation (a trailing '#x,y'). Two custom
// indicators with the same codeString but different anchorOffset render differently
// on a base, so the offset MUST appear in the filename (decision 8 / F-T9-B). Omitted
// when (0,0); both axes always written. width is deliberately NOT encoded.
function offsetSuffix(value) {
  if (!value || typeof value !== 'object') return '';
  const ax = Number(value.anchorOffsetX) || 0;
  const ay = Number(value.anchorOffsetY) || 0;
  if (ax === 0 && ay === 0) return '';
  return '@' + ax + ',' + ay;
}

function defShape(value) {
  if (typeof value === 'string') return { expansion: value, open: '(', close: ')', offset: '' };
  if (!value || typeof value !== 'object') return null;
  const expansion = typeof value.codeString === 'string' ? value.codeString
    : typeof value.glyphCode === 'string' ? value.glyphCode : null;
  if (expansion === null) return null;
  const offset = offsetSuffix(value);
  if (value.isIndicator === true) return { expansion, open: '{', close: '}', offset };
  if (value.isBlissGlyph === true || value.type === 'glyph' || typeof value.glyphCode === 'string')
    return { expansion, open: '[', close: ']', offset };
  return { expansion, open: '(', close: ')', offset };
}

// Longest-first so a longer alias wins over a shorter prefix (e.g. NBC over NB).
function aliasRegex(names) {
  const alt = names.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  return new RegExp(BOUNDARY_BEFORE + '(' + alt + ')' + BOUNDARY_AFTER, 'g');
}

// Recursively replace every alias token with its RAW expansion (no brackets),
// until only primitive codes remain. The seen set guards a self/cyclic reference
// (left in place rather than looping forever).
function flattenAliases(str, defs, seen = new Set()) {
  const names = Object.keys(defs);
  if (!names.length) return str;
  return str.replace(aliasRegex(names), (m, name) => {
    if (seen.has(name)) return m;
    const shape = defShape(defs[name]);
    if (!shape) return m;
    return flattenAliases(shape.expansion, defs, new Set(seen).add(name));
  });
}

function convertSeparators(s) {
  return s
    .replace(/\/\//g, '__')
    .replace(/\//g, '_')
    .replace(/;;/g, '++')
    .replace(/;/g, '+')
    .replace(/:/g, '#');
}

export function isOptionCode(code) {
  return /^\[[^\]]*\]\|\|/.test(code);
}

// code -> reference filename (with .svg), or null for option cases (caller keeps
// the curated descriptive name).
export function codeToFilename(code, defs = {}) {
  if (isOptionCode(code)) return null;
  const names = Object.keys(defs);
  let withBrackets = code;
  if (names.length) {
    withBrackets = code.replace(aliasRegex(names), (m, name) => {
      const shape = defShape(defs[name]);
      if (!shape) return m;
      return shape.open + flattenAliases(shape.expansion, defs, new Set([name])) + shape.offset + shape.close;
    });
  }
  return convertSeparators(withBrackets) + '.svg';
}

// Expand alias-name tokens inside an ALREADY-CONVERTED filename (e.g. the curated
// `opt-...` name of an option case, which codeToFilename returns null for). The
// alias name is replaced by its flattened, separator-converted expansion, wrapped
// like codeToFilename. Boundaries use the filename character class (alias tokens
// sit between the filename separators `+ _ # - .` or the ends), so a name is never
// matched inside a longer token. Drops local alias names from option-case filenames
// (decision 8 consistency): opt-error-placeholder-H+MYADJ -> ...H+(B428+B86).
export function expandAliasesInFilename(file, defs = {}) {
  const names = Object.keys(defs).sort((a, b) => b.length - a.length); // longest first
  let out = file;
  for (const name of names) {
    const shape = defShape(defs[name]);
    if (!shape) continue;
    const expansion = shape.open + convertSeparators(flattenAliases(shape.expansion, defs, new Set([name]))) + shape.offset + shape.close;
    out = out.replace(new RegExp('(?<![A-Za-z0-9_])' + escapeRegExp(name) + '(?![A-Za-z0-9_])', 'g'), expansion);
  }
  return out;
}
