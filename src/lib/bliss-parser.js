/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { blissElementDefinitions, builtInCodes, isSpaceGlyph } from "./bliss-element-definitions.js";
import { hasPathData, createTextFallbackGlyph } from "./bliss-shape-creators.js";
import {
  resolveHeadIndex, headScanCode
} from "./bliss-head-glyph-exclusions.js";
import { basePartCount, resolveEffectiveDefinition, resolveWordIndicatorOverlay, SINGLE_CODE_TOKEN } from "./indicator-utils.js";
import { KERNING_OPTION_KEYS, MAX_RECURSION_DEPTH, NUMBER_TEXT, OPTION_BRACKET_CONTENT, QUOTED_SPAN, WARNING_CODES, WRITTEN_COORDINATE_PATTERN, admitOptions, isScopeRefusal, peelCharacterBrackets, serializeOptionValue, textOfValue, withoutEmptyRegion, writtenNumber } from "./bliss-constants.js";

// The coordinate-suffix grammar parsePartString accepts: ':' with EACH axis
// optional (:2 | :2, | :,2 | :2,3 | :), each axis a number as every number
// written as text is read (NUMBER_TEXT). Every site that strips a coordinate
// suffix before a definition lookup must strip this SAME grammar, or
// equivalent spellings take different semantic paths (a y-only ':,2' used to
// bypass the misplacement gates while ':0,2' met them).
export const COORD_SUFFIX_PATTERN = new RegExp(String.raw`:(?:${NUMBER_TEXT})?(?:,(?:${NUMBER_TEXT})?)?$`);

// The letters an external-character run is written in, by Unicode block:
// Basic Latin, Latin-1 Supplement and Latin Extended-A, Latin Extended-B, IPA
// Extensions, Greek, Cyrillic, Latin Extended Additional. A letter with no
// built-in outline draws as text. Scripts whose text the text glyph cannot
// measure or lay out (CJK, right-to-left, joining) are left out.
const X_RUN_LETTERS = 'a-zA-ZÀ-ſƀ-ɏɐ-ʯͰ-ϿЀ-ӿḀ-ỿ';
// The body of a written run: letters, with a hyphen-minus allowed only between
// two of them (`Anna-Karin`). No outline holds a hyphen, so a run with one
// always draws as one text glyph. Exported so the define() namespace guard
// tests the SAME grammar the tokenizer below reads: a name of this shape is
// always read as external text, so it could never be reached as a definition.
export const X_RUN_BODY = `[${X_RUN_LETTERS}]+(?:-[${X_RUN_LETTERS}]+)*`;
// One character of a code name: a run letter, a digit, `-`, `.` or `_`. A
// code is named in the same letters a run is written in, so a definition
// named in any of them is reachable.
const CODE_NAME_CHARACTER = String.raw`[${X_RUN_LETTERS}0-9\-._]`;
// A part as parsePartString reads it: a code, then that suffix with each axis
// captured (groups: code, x, y).
const PART_STRING_PATTERN = new RegExp(String.raw`^(${CODE_NAME_CHARACTER}+)(?::(${NUMBER_TEXT})?(?:,(${NUMBER_TEXT})?)?)?$`);
// A code name followed by `:`, the marker that says a coordinate follows.
const CODE_THEN_COORDINATE_PATTERN = new RegExp(String.raw`^${CODE_NAME_CHARACTER}+:`);
// A kerning marker, RK or AK, with its value read by the same grammar (groups:
// type, value).
const KERNING_MARKER_PATTERN = new RegExp(String.raw`^(RK|AK)(?::(${NUMBER_TEXT}))?$`);

// A codeString beginning with a part option ([color=red]>B291) must nest-parse
// like a multi-code string; treated as a plain codeName it becomes one unknown
// token. Shared by the string parser and the object-rebuild expansion paths so
// a toJSON() round-trip reconstructs what the string parser accepted.
const PART_OPTION_CODESTRING = /^\[.*?\]>/;

// A `>`-less bracket is a CHARACTER option by syntax; inside a `;`-part slot
// only part options ([opts]>) apply, so the bracket is misplaced on an
// otherwise-valid code: peel + warn + drop, then parse the remainder normally.
// The quote-aware grammar keeps the match to ONE bracket token — a `.*?` body
// would backtrack across `]…[` and capture a bracket pair as one blob, and a
// bare `[^\]]`-class body would truncate at a quoted `]` in a RAW
// definition-sourced part string (top-level input is placeholder-tokenized,
// definition codeStrings are not). Group 1 is the
// bracket, group 2 the grammar's internal atom, group 3 the remainder. The
// non-empty remainder (.+) keeps a dangling bracket with no code on the
// whole-character fail path.
const PART_SLOT_CHAR_OPTION_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)(.+)$`);

// Quote-aware bracket matchers built from the shared grammar (see
// OPTION_BRACKET_CONTENT in bliss-constants.js for the rationale and the
// linear-time guarantee).
// The tokenizer pre-pass and #parseOptions' own extraction must agree, or a
// quoted `]` truncates at one layer even when the other accepts it.
const BRACKET_TOKEN_PATTERN = new RegExp(String.raw`\{(.*)\}|\[(` + OPTION_BRACKET_CONTENT + String.raw`)\]`, 'g');
const BRACKET_EXTRACT_PATTERN = new RegExp(String.raw`\[(` + OPTION_BRACKET_CONTENT + String.raw`)\]`);
// One entry of an option bracket: everything up to the next `;` outside a
// quoted span, the same spans OPTION_BRACKET_CONTENT steps over to find where
// the bracket ends. Each step commits through an atomic lookahead, so an
// unclosed quote cannot make the scan backtrack.
const BRACKET_ENTRY_PATTERN = new RegExp(String.raw`(?:(?=(?<atom>` + QUOTED_SPAN + String.raw`|[^;]))\k<atom>)+`, 'g');
// Every quoted span of a bracket, stripped before its `[`s are counted.
const QUOTED_SPANS_PATTERN = new RegExp(QUOTED_SPAN, 'g');
// One leading part-scope option bracket on a definition's code string (raw
// text, so quotes are read by the same grammar).
const LEADING_PART_BRACKET_PATTERN = new RegExp(String.raw`^\[` + OPTION_BRACKET_CONTENT + String.raw`\]>`);
// The overlay prefix matchers run on RESTORED strings (the `;;` store keeps
// codes verbatim), so they need the same quote-aware grammar; group 2 is the
// grammar's internal atom, group 3 the remainder after the bracket.
const OVERLAY_CHAR_OPTION_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])(?!>)(.+)$`);
const OVERLAY_PART_OPTION_PATTERN = new RegExp(String.raw`^(\[` + OPTION_BRACKET_CONTENT + String.raw`\])>(.+)$`);

// Strips one layer of syntactic decoration from a codeString reference (an
// option prefix, a trailing head marker, a coordinate suffix) so a DECORATED
// alias hop ('[color=green]WORD', 'WORD^', 'WORD:1,2') still resolves for
// wordness; define() inlines only undecorated direct references.
const stripReferenceDecoration = (s) => s
  .replace(/^(?:\[.*?\]>?)+/, '')
  .replace(/\^+$/, '')
  .replace(COORD_SUFFIX_PATTERN, '');

// The longest input string the parser reads. Exported so the string save
// knows which of the words it writes a reload can read back at all.
export const MAX_INPUT_LENGTH = 10_000;

// Whether a code string writes a `|` outside its option brackets and text
// blocks, read with the parser's own tokenizer: the separator that ends the
// options of a word or of the input. The part methods refuse one, since a
// part has neither.
export function writesOptionSeparator(codeString) {
  return codeString.replace(BRACKET_TOKEN_PATTERN, '').includes('|');
}

// Whether a code string writes a `;;` outside its option brackets and text
// blocks: the separator that opens a word's indicator list. The part and
// character methods refuse one wherever it stands, including first in the
// code, where the word reader takes it for two empty parts.
export function writesWordIndicatorList(codeString) {
  return codeString.replace(BRACKET_TOKEN_PATTERN, '').includes(';;');
}

// A written X token runs from a glyph boundary to the next structural
// character: another glyph boundary (`/`), a part boundary (`;`), a head
// marker (`^`) or a coordinate suffix (`:`). Taking the token WHOLE is what
// stops a character outside the run grammar from ending the match early and
// leaving its tail to glue onto the last expanded letter, which destroyed the
// letter before it. An option bracket at the boundary is part of the token,
// not a place for a run to hide from routing. A BARE `>` is an option region
// carrying nothing, and it belongs to the prefix for the same reason: without
// it a run written behind one was never expanded and then failed as a whole
// word, while `||`, `|` and even an empty `[]>` all rendered it.
const X_TOKEN_PATTERN = new RegExp(String.raw`(?<=^|\/)(\[[^\[\]]*\]>?|>)?X([^/;^:]+)`, 'g');
// A run of two characters at least: one letter alone is the sequence pass's
// to read (see processXCodes).
const X_RUN_BODY_PATTERN = new RegExp(`^(?=.{2})${X_RUN_BODY}$`);
// An unexpanded multi-letter run reaching a `;`-part slot: the run is a word,
// and a word cannot be composed onto a character. Anchored at both ends so a
// code that merely CONTAINS X+letters (MAXWELL) or ends in a non-letter
// (Xhello9) is not mis-flagged. Built from the shared ranges for the same
// reason as the pattern above: three copies of this class had drifted apart.
// Letters only: a run holding a hyphen is one glyph, never a word.
const WORD_AS_PART_PATTERN = new RegExp(`^X[${X_RUN_LETTERS}]{2,}$`);
// One X letter, optionally behind an option bracket and optionally carrying a
// trailing decoration, as written in a `/`-separated sequence.
const X_LETTER_TOKEN_PATTERN = new RegExp(String.raw`^(\[[^\[\]]*\]>?)?X([${X_RUN_LETTERS}])([;^:].*)?$`);
// A bare X code that is nothing but a run body, with no decoration of any kind.
const X_BARE_RUN_PATTERN = new RegExp(`^X(${X_RUN_BODY})$`);
const X_TEXT_FALLBACK_PREFIX = 'XTXT_';

// What a written X token DENOTES, which is the one question every X site asks:
//   'word'  - every letter has a built-in outline, so the run is shorthand for
//             a `/`-separated sequence of glyphs.
//   'glyph' - some character has no outline (a hyphen never has one), so the
//             WHOLE run becomes one text-fallback glyph; letters of one run
//             never split across two rendering mechanisms.
//   null    - not a multi-letter run: one letter (the sequence pass below
//             decides those), or something that is not a letter at all (a
//             digit, punctuation, the internal `XTXT_` routing key). Leave the
//             token exactly as written and let it resolve, or fail, as the
//             single code it is. The routing key is the one exception, and it
//             is applied before this is asked: a key whose payload is letters
//             that ALL have outlines is read as those letters first (see
//             readTextFallbackKey), so what reaches here still wearing the key
//             is a key that is genuinely needed.
// The one outline test the whole X grammar turns on: if every letter has a
// built-in outline the token stands for that many outlined letters, and if any
// letter lacks one the WHOLE token is a single text glyph. Letters of one
// written token never split across two rendering mechanisms.
const allLettersOutlined = (chars) => [...chars].every(hasPathData);

const classifyXRunBody = (body) =>
  !X_RUN_BODY_PATTERN.test(body) ? null
    : allLettersOutlined(body) ? 'word'
    : 'glyph';

// The routing key `XTXT_<chars>` read as the letters it names, or null when it
// is not that: a key whose payload some letter of has no outline is what the key
// is FOR, and a digit or an empty payload is not letters at all. The fallback
// exists for letters that cannot be drawn from outlines and asks for nothing
// when they can, and it cannot survive its own serialization there, because the
// key is never emitted: such a glyph came back as the plain letters and reparsed
// as outlines, a different picture with no warning.
//
// ONE place because two sites ask, and they answered differently until they did
// not: the written-token pass below, and the `;`-part slot, which the token pass
// never sees because its pattern is anchored to a glyph boundary.
const readTextFallbackKey = (code) => {
  if (typeof code !== 'string' || !code.startsWith(X_TEXT_FALLBACK_PREFIX)) return null;
  const asWritten = `X${code.slice(X_TEXT_FALLBACK_PREFIX.length)}`;
  return classifyXCode(asWritten) === 'letters' ? asWritten : null;
};

// Where the X pass writes the routing key: where a character starts, which is
// the start of the text, after a `/`, or after the bracket or the `>` of the
// option region in front of the character.
const ROUTING_KEY_AT_CHARACTER_START = new RegExp(String.raw`(^|[/\]>])${X_TEXT_FALLBACK_PREFIX}`, 'g');

// Text the parser reports, with each routing key spelled as the X code it
// stands for (`Xλ:abc`), so a warning quotes a letter drawn as text the way it
// is written and never names the key, which is internal. A code that merely
// contains the key's letters is left as it is.
const withXCodesAsWritten = (text) => text.replace(ROUTING_KEY_AT_CHARACTER_START, '$1X');

// The code a `;` part slot reads a code as. The glyph-boundary pass never sees
// a slot, so a letter with no outline is made its text-fallback glyph here,
// as that pass makes one written alone, and a routing key is read as the
// letters it names when they all have outlines (readTextFallbackKey). Asked
// of the code written in a slot, of the code an alias there names and of the
// one code a definition draws, so each draws what the code written in its
// place draws. Exported so define() judges a code a definition holds as it
// is read.
export const slotCodeOf = (code) => {
  const keyAsLetters = readTextFallbackKey(code);
  if (keyAsLetters !== null) return keyAsLetters;
  return classifyXCode(code) === 'glyph' ? `${X_TEXT_FALLBACK_PREFIX}${code.slice(1)}` : code;
};

// The definition a text-fallback glyph is read by in a part slot: one made for
// its letters, drawn as a shape.
const textFallbackDefinitionOf = (code) => {
  const glyph = createTextFallbackGlyph(code.slice(X_TEXT_FALLBACK_PREFIX.length));
  glyph.isShape = true;
  return glyph;
};

// Rewrites the X shorthand in a code string into the codes the renderer knows:
// per-character `X<letter>` codes for an outlined run, one `XTXT_<chars>` glyph
// for a run that needs the text fallback. Shared by the top-level input and the
// definition-expansion path so a run means the same thing wherever it is
// written, and exported so define() can ask what a codeString expands to.
export function processXCodes(codeString) {
  let expanded = codeString.replace(X_TOKEN_PATTERN, (match, optionPrefix = '', chars, offset) => {
    // Read the routing key as the letters it names (see readTextFallbackKey),
    // then treat it from here on exactly as if they had been written, so it
    // means the same thing in every position its written twin can take.
    const asWritten = readTextFallbackKey(`X${chars}`);
    const body = asWritten !== null ? asWritten.slice(1) : chars;
    // The token as it would have been written, once the key is read.
    const written = asWritten !== null ? optionPrefix + asWritten : match;

    const denotes = classifyXRunBody(body);
    if (!denotes) return written;

    // A real `;`-part composes onto ONE character. A run that is a word must
    // therefore stay whole and fail as the word it is; expanding it would bind
    // the part to the last letter instead of to the written token. A run that
    // collapses to one glyph is a character like any other and takes the part.
    // The other things a following `;` can mean are not compositions and never
    // suppress expansion: `;;` attaches a word-level overlay to the WORD the
    // run expands into (matching the written `Xa/Xb;;B81` twin), a bare
    // trailing `;` composes nothing, and a `;` immediately before a `/` opens an
    // empty part slot. That last case only reaches this pass from a definition
    // codeString, which stores word breaks as written, so without it the same
    // content expands at top level and fails inside a definition.
    const rest = codeString.slice(offset + match.length);
    const composesAPart = rest.startsWith(';')
      && !rest.startsWith(';;')
      && rest.length > 1
      && !rest.startsWith(';/');
    if (composesAPart && denotes === 'word') return written;

    // For an outlined run the option prefix rides the FIRST expanded glyph,
    // matching the written /-expansion exactly ([opts]Xab === [opts]Xa/Xb).
    // A run that collapses to one glyph keeps the prefix on that glyph, so the
    // option scopes the whole run; that deliberately differs from the written
    // sequence form, where a prefix binds one member and the member stands
    // alone.
    return denotes === 'word'
      ? optionPrefix + [...body].map(char => `X${char}`).join('/')
      : `${optionPrefix}XTXT_${body}`;
  });

  // A written sequence of single-letter X codes merges by the same rule, so
  // `Xa/Xλ` and `Xaλ` both mean one text glyph. A decoration on the LAST member
  // belongs to whatever the merge produces: without that, the decorated letter
  // stayed outside the merge and failed as an unknown code.
  const parts = expanded.split('/');
  const result = [];
  let currentXSequence = [];

  const flushXSequence = (decoration = '') => {
    if (currentXSequence.length === 0) return;

    const letters = currentXSequence;
    if (letters.every(hasPathData)) {
      letters.forEach((char, i) => {
        result.push(`X${char}${i === letters.length - 1 ? decoration : ''}`);
      });
    } else {
      result.push(`XTXT_${letters.join('')}${decoration}`);
    }
    currentXSequence = [];
  };

  for (const part of parts) {
    const token = part.match(X_LETTER_TOKEN_PATTERN);

    if (token && !token[1]) {
      currentXSequence.push(token[2]);
      if (token[3]) flushXSequence(token[3]);
      continue;
    }

    flushXSequence();
    // An option-prefixed single-char X-code stands alone: the option scopes to
    // that one character, so it never merges into a whole-run fallback. An
    // outlined letter passes through unchanged (it resolves via its definition
    // downstream); only a fallback letter is rewritten so the XTXT_ route can
    // see it.
    if (token && !hasPathData(token[2])) {
      result.push(`${token[1]}XTXT_${token[2]}${token[3] ?? ''}`);
    } else {
      result.push(part);
    }
  }
  flushXSequence();

  return result.join('/');
}

// The kerning values an options object carries, in the order they were written,
// each tagged with the numeric key it resolves to and how to name it in a
// warning.
export function kerningOptionEntries(options) {
  return Object.entries(options ?? {})
    .filter(([key]) => Object.hasOwn(KERNING_OPTION_KEYS, key))
    .map(([key, value]) => ({
      key: KERNING_OPTION_KEYS[key],
      writtenKey: key,
      value,
      source: value === true ? key : `${key}=${textOfValue(value)}`,
    }));
}

// What an element is called in a positioning warning, by tree level. A part is
// the only level with a second spelling (`CODE:x,y`), so it is the only one
// whose message can talk about a coordinate.
const POSITION_SCOPE_NAMES = ['composition', 'word', 'character', 'part'];

// One reading of "can this be a coordinate?", shared by the two channels a
// position arrives on so that the two cannot drift, and with the kerning reader
// below. The type decides before Number() is asked: see writtenNumber.
const coordinateNumber = writtenNumber;

// Reads the promoted `x`/`y` FIELD. That field is the one route to a position
// object input has and the DSL does not: a DSL coordinate is grammar-gated to
// the number grammar, so the field is a number by construction there, or the
// text as written for an axis no position can be (B291:1e400), refused here.
// An object literal can put anything in it, while `x?: number` is what the
// published declaration states at every scope, so this is that declaration
// enforced at run time.
//
// Reading the value matters more than refusing it, because that half repairs a
// corruption: the layout adds the parent offset with `+`, so a STRING axis was
// concatenated rather than added and `{ codeName: 'ZSA', x: '3' }` drew at 30.
// Going through the predicate the options channel already uses means every
// route to a position agrees on what "3" means.
//
// Must run BEFORE extractPositionFromOptions, so a refused field is already
// gone when an option at the same scope is compared against it: a value that
// was never going to be used must not also be reported as one the option
// displaced.
export function normalizePositionFields(obj, parseWarnings) {
  for (const axis of ['x', 'y']) {
    const written = obj[axis];
    if (written === undefined) continue;
    const value = coordinateNumber(written);
    if (Number.isFinite(value)) {
      obj[axis] = value;
      continue;
    }
    // Deleting is also what makes a rebuild idempotent: the next pass finds no
    // field and cannot report the same value twice.
    delete obj[axis];
    // A field always carries a written value, so it is always quoted as
    // `axis=value`. The options channel has a second spelling to account for (a
    // bare `[x]`, stored as `true`) and reports that one as the axis alone.
    const source = `${axis}=${textOfValue(written)}`;
    // Not optional, unlike its neighbour: every call site has somewhere to
    // report to. A guard here would be a branch no test can reach.
    parseWarnings.push({
      code: WARNING_CODES.MALFORMED_COORDINATES,
      message: `Malformed position "${source}"; the position is ignored.`,
      source,
    });
  }
}

// Promotes `[x=N]` / `[y=N]` to the numeric x/y the layout reads. An option
// OVERRIDES the positional shorthand it duplicates: on a part, `[x=N]>CODE`
// and `CODE:x,y` address the same level, so they are two spellings of one
// value and the option is the one that counts. The overridden value is
// reported rather than dropped in silence. A part is where the DSL can raise
// that conflict; object input can author both channels at any level, so the
// message names the level it happened at. A value that is not a number is
// dropped with MALFORMED_COORDINATES and the element still renders, since a
// broken decoration must not destroy valid content.
export function extractPositionFromOptions(obj, parseWarnings, level = 3) {
  if (!obj.options) return;
  const inline = { x: obj.x, y: obj.y };
  const overridden = [];
  let promoted = false;
  for (const axis of ['x', 'y']) {
    if (obj.options[axis] === undefined) continue;
    const written = obj.options[axis];
    const value = coordinateNumber(written);
    if (!Number.isFinite(value)) {
      delete obj.options[axis];
      // A bare key is stored as `true`, so name it the way it was written.
      const source = written === true ? axis : `${axis}=${textOfValue(written)}`;
      parseWarnings?.push({
        code: WARNING_CODES.MALFORMED_COORDINATES,
        message: `Malformed position "${source}"; the option is ignored.`,
        source,
      });
      continue;
    }
    if (inline[axis] !== undefined && inline[axis] !== value) overridden.push(axis);
    obj[axis] = value;
    // The promoted field is the position, and a copy left behind in the bag is
    // a residual: it makes the exported composition differ by the spelling that
    // entered it, it hides the position from removal by name at part scope, and
    // it gets a space's one written decoration reported twice. Cleared here,
    // where the promotion happens, so every call site inherits it.
    delete obj.options[axis];
    promoted = true;
  }
  // Leave the bag looking the way this level's bags look when nobody wrote an
  // option, so the export cannot be read backwards into how the position was
  // written. Measured on both input channels: a word, a character and a part
  // carry no bag at all until something is in one, while a COMPOSITION always
  // carries one, empty or not. So an emptied bag is removed at the three inner
  // levels and kept at the outermost, where removing it is what would make the
  // export depend on the spelling.
  //
  // Only a bag this function emptied, and only on the path that MOVED a key: a
  // refused axis above is dropped the way every other bad option is dropped,
  // and those leave the bag as they found it.
  if (promoted && level > 0 && Object.keys(obj.options).length === 0) delete obj.options;
  if (overridden.length === 0 || !parseWarnings) return;
  const scope = POSITION_SCOPE_NAMES[Math.min(level, 3)];
  const ignored = level >= 3
    ? `:${overridden.includes('x') ? inline.x : ''}${overridden.includes('y') ? `,${inline.y}` : ''}`
    : overridden.map(axis => `${axis}=${inline[axis]}`).join(';');
  const how = level >= 3 ? 'as an option or as a coordinate' : 'as an option or beside it';
  parseWarnings.push({
    code: WARNING_CODES.MULTIPLE_POSITION_VALUES,
    message: `A ${scope} takes one position: the option wins, so "${ignored}" is ignored. Write the position ${how}, not both.`,
    source: ignored,
  });
}

// Kerning is ONE value per character, however it is written: the `RK:`/`AK:`
// markers and the long-form options are four spellings of the same thing. An
// OPTION beats a MARKER (options override the DSL shorthand), and among equals
// the one written LATER wins. Every value the winner displaced is reported.
// Resolving here leaves the layout one numeric key to read and the serializer
// one spelling to emit.
//
// Every value here was written on this character. A definition cannot bring
// one: `define()` refuses kerning in `defaultOptions`, because the gap before a
// character belongs to one use of it, not to what it is.
export function resolveKerning(glyphObj, marker, bracketEntries, parseWarnings) {
  const options = glyphObj.options;
  if (!options) return;

  const numeric = (entry) => {
    const value = writtenNumber(entry.value);
    if (!Number.isFinite(value)) {
      parseWarnings.push({
        code: WARNING_CODES.MALFORMED_KERNING_VALUE,
        message: `Malformed kerning value "${entry.source}"; the option is ignored.`,
        source: entry.source,
      });
      return null;
    }
    return { ...entry, value };
  };

  // The marker first, so the last bracket option outranks it and the losers
  // fall out as "everything before the winner".
  const written = [...(marker ? [marker] : []), ...bracketEntries.map(numeric).filter(Boolean)];

  // Clear what this character wrote, in the exact spelling it wrote it, so the
  // winner is the only kerning its options keep.
  for (const entry of bracketEntries) delete options[entry.writtenKey];
  if (marker) delete options[marker.key];
  if (written.length === 0) return;

  for (const displaced of written.slice(0, -1)) {
    parseWarnings.push({
      code: WARNING_CODES.MULTIPLE_KERNING_VALUES,
      message: `A character takes one kerning value, so "${displaced.source}" is ignored. An option beats an RK:/AK: marker, and the last value written wins.`,
      source: displaced.source,
    });
  }
  const winner = written[written.length - 1];
  options[winner.key] = winner.value;
}

// What a bare X code denotes, for the sites that meet one already stripped of
// its options and decoration (a `;`-part slot, object input). The same question
// processXCodes asks of a written token, asked of a finished code:
//   'glyph'   - some character has no built-in outline (a hyphen never has
//               one), so the whole code is ONE text-fallback glyph.
//   'letters' - every letter has an outline, so the code stands for that many
//               outlined letters: one character if there is one letter, a word
//               if there are more.
//   null      - not an X run at all (`Xab9`, `X-`, `XTXT_hi`, `B291`), so it
//               denotes nothing here and has to resolve, or fail, as the
//               single code it is.
export function classifyXCode(code) {
  const match = typeof code === 'string' ? code.match(X_BARE_RUN_PATTERN) : null;
  if (!match) return null;
  return allLettersOutlined(match[1]) ? 'letters' : 'glyph';
}

// A head marker in a code string: a `^` ending a character, at the end or
// before a `;` part. An option bracket is matched whole and kept, by the
// grammar every bracket reader shares, so a caret inside a value
// (`[title=a^;color=red]`, quoted or not) is never taken for one.
const HEAD_MARKER_PATTERN = new RegExp(String.raw`(\[` + OPTION_BRACKET_CONTENT + String.raw`\])|\^(?=;|$)`, 'g');

// A definition's code string without its head marker. The marker designates
// the definition as its word's head, which the expansion reads where a word
// is read (through #readDefinition), and draws nothing: where the code string
// is read as a part, or for the parts it draws, it is left out.
const withoutHeadMarker = (codeString) => codeString.replace(HEAD_MARKER_PATTERN, (match, bracket) => bracket ?? '');

// A code string as a part slot reads it: behind its option brackets (a leading
// character bracket is a definition's own options, see ownBracketOf) and
// without its head marker.
function slotBodyOf(codeString) {
  let rest = withoutHeadMarker(peelCharacterBrackets(codeString).body);
  let bracket;
  while ((bracket = rest.match(LEADING_PART_BRACKET_PATTERN)) !== null) rest = rest.slice(bracket[0].length);
  return rest;
}

// The code the first character of a code string is made from, read as a part
// slot reads it: behind its option brackets, before any `;` part, and without
// its coordinate.
function firstBaseCode(codeString) {
  const [first] = slotBodyOf(codeString).split(';');
  const coordinate = first.match(COORD_SUFFIX_PATTERN);
  return coordinate && coordinate.index > 0 ? first.slice(0, coordinate.index) : first;
}

// The `;` parts of a code string, read as a part slot reads it: behind its
// option brackets, an empty segment (as after a trailing `;`) adding no part.
function partSegmentsOf(codeString) {
  return slotBodyOf(codeString).split(';').filter((segment) => segment !== '');
}

// The code a code string of one part is made of, read as firstBaseCode reads
// it; null when it holds several parts.
function onlyCodeOf(codeString) {
  const segments = partSegmentsOf(codeString);
  return segments.length === 1 ? firstBaseCode(segments[0]) : null;
}

// How many base parts a code string draws: its `;` parts read as a part slot
// reads them, each an indicator when its definition is one, counted as the
// layout counts a character's parts (basePartCount).
function basePartCountOf(codeString, definitions) {
  return basePartCount(partSegmentsOf(codeString).map((segment) => {
    const code = firstBaseCode(segment);
    const definition = Object.hasOwn(definitions, code) ? definitions[code] : undefined;
    return { isIndicator: resolveEffectiveDefinition(definition, definitions)?.isIndicator === true };
  }));
}

// Whether a character pulls in the word space before it: a punctuation mark,
// however it is decorated, while it draws one base part. A second base part
// makes another character, which leaves the ordinary space. Read where the
// space is decided and where the builder judges a stored one, so both agree.
export function pullsInWordSpace(glyph) {
  return glyph.shrinksPrecedingWordSpace === true && basePartCount(glyph.parts ?? []) <= 1;
}

// The layout data a code draws with, as its bare spelling gets it. Layout data
// is what places a character among its neighbours: the external-letter
// spacing, the letter it is (which pair kerning reads), its kerning table, and
// whether it pulls in the word space before it. A decoration does not change
// them; only a code of its own is lost. A coordinate, an indicator or an
// option bracket leaves a character the one it is. A second base part makes
// another character, yet the data stay with it: the layout, which sees the
// parts, turns them off (basePartCount), and they apply again once that part
// is removed. A built-in carries its own; a code without an outline draws as
// its text-fallback glyph; a defined name that stands for one character takes
// what it does not set itself from the character its code string is made of,
// as its expansion does, reading that character's code as a part slot reads
// it (slotCodeOf), so a letter without an outline lends what its text-fallback
// glyph carries. A name whose code string fuses two base parts is drawn inside
// one part, where the layout cannot see them, so it lends only what it sets
// itself. Exported so a glyph read from a composition object takes the data
// its string spelling takes.
export function layoutDefinitionOf(code, definitions, depth = 0) {
  if (code.startsWith('XTXT_')) return createTextFallbackGlyph(code.slice(5));
  const definition = Object.hasOwn(definitions, code) ? definitions[code] : undefined;
  if (typeof definition?.codeString !== 'string' || builtInCodes.has(code) || depth >= MAX_RECURSION_DEPTH) {
    return definition;
  }
  if (definition.codeString.includes('/')) return definition;
  if (basePartCountOf(definition.codeString, definitions) > 1) return definition;
  const inner = layoutDefinitionOf(slotCodeOf(firstBaseCode(definition.codeString)), definitions, depth + 1);
  if (!inner) return definition;
  return {
    isExternalGlyph: definition.isExternalGlyph ?? inner.isExternalGlyph,
    char: definition.char ?? inner.char,
    kerningRules: definition.kerningRules ?? inner.kerningRules,
    shrinksPrecedingWordSpace: definition.shrinksPrecedingWordSpace ?? inner.shrinksPrecedingWordSpace,
  };
}

// The code string an alias chain starting at `code` ends in, or null when
// `code` names no definition with a code string. A hop that is not itself a
// registry key may still be a DECORATED reference ('[color=green]WORD',
// 'WORD^', 'WORD:1,2'): the decoration is stripped and the chain followed, or
// a decorated word alias would not be recognized as a word.
function finalCodeStringOf(code, definitions, visited = new Set()) {
  if (visited.has(code)) return null;
  visited.add(code);
  const def = definitions[code];
  if (!def?.codeString) return null;
  if (!definitions[def.codeString]) {
    const core = stripReferenceDecoration(def.codeString);
    if (core !== def.codeString && definitions[core]) {
      return finalCodeStringOf(core, definitions, visited) ?? def.codeString;
    }
    return def.codeString;
  }
  return finalCodeStringOf(def.codeString, definitions, visited);
}

// Whether a code string draws one character: no word break written, and none
// made by a letter run or by an alias its first code stands for.
function drawsOneCharacter(codeString, definitions) {
  if (processXCodes(codeString).includes('/')) return false;
  const base = firstBaseCode(codeString);
  return !processXCodes(finalCodeStringOf(base, definitions) ?? base).includes('/');
}

// A definition's code string read as what the definition is. A character
// bracket leading a code string that draws one character is the definition's
// own options, as its defaultOptions are: the definition is the one part it
// draws, so the bracket styles that part wherever the code is used. Returns
// the bracket, any further bracket at the same place (one bracket per scope,
// so a use reports and drops those), and the code string behind them; null
// when no bracket leads it, nothing follows the brackets, or it draws a word,
// where the bracket stays its first character's, as written.
function ownBracketOf(codeString, definitions) {
  const { brackets, body } = peelCharacterBrackets(codeString);
  if (brackets.length === 0 || body === '' || !drawsOneCharacter(codeString, definitions)) return null;
  return { bracket: brackets[0], extras: brackets.slice(1), body };
}

export class BlissParser {
  static parse(codeStr, options) {
      const result = this.fromString(codeStr);

      if (options) {
        result.options = {...result.options, ...options};
      }

      return result;
  }

  // Only one option bracket is allowed per level ([a][b]|| is invalid; the
  // canonical multi-option form is [a;b]||). A duplicate is detected only when
  // BOTH forms agree: the tokenized (placeholder) form shows more than one
  // bracket — braces are opaque placeholders there, so a '[' inside {…} never
  // counts — AND the restored form still shows more than one top-level '['
  // once quoted values are stripped with #parseOptions's own quote grammar.
  // The second condition was added to veto the then-quote-unaware pre-pass
  // (a quoted ']' split ONE user bracket into two tokenized ones); the
  // pre-pass is quote-aware now, so both arms agree on
  // [k="]["]-class inputs and the veto is belt-and-suspenders (kept; mutation
  // testing decides whether it is still reachable).
  static #hasMultipleOptionBrackets(tokenized, restored) {
    return (tokenized.match(/\[/g) || []).length > 1
      && (restored.replace(QUOTED_SPANS_PATTERN, '').match(/\[/g) || []).length > 1;
  }

  // Where a word's `|` and `||` stand, read from the word with its option
  // brackets tokenized (a `|` inside one is never seen). A single `|` first in
  // the word closes the word's options: `options` is the text before it,
  // undefined when there is none. Any other `|` or `||` must follow option
  // brackets that start a character, which are then a misplaced word option
  // (`|`) or global option (`||`), left out of `content` and listed in
  // `misplaced`. Anywhere else it is a syntax error that fails the word:
  // null.
  static #readWordSeparators(word) {
    let options;
    let content = '';
    const misplaced = [];
    let from = 0;
    for (const [index, run] of [...word.matchAll(/\|+/g)].entries()) {
      const before = word.slice(from, run.index);
      from = run.index + run[0].length;
      if (index === 0 && run[0] === '|') {
        options = before;
        continue;
      }
      const characterStart = before.lastIndexOf('/') + 1;
      const brackets = before.slice(characterStart);
      if (run[0].length > 2 || !/^(?:\[[^[\]]*\])+$/.test(brackets)) return null;
      misplaced.push({ spelling: brackets + run[0], isGlobal: run[0].length === 2 });
      content += before.slice(0, characterStart);
    }
    return { options, content: content + word.slice(from), misplaced };
  }

  // `warn` is optional because the entry points are not uniform: `parse` keeps
  // a warnings array, and `parsePartString` is a public static that returns a
  // part object and has no warnings route of its own. The silent default
  // matches that entry point rather than hiding a hole. `scope` is the level
  // the bracket was written at, given by every site that has one.
  static #parseOptions(optionsString, warn, scope) {
    if (!optionsString) return;

    const written = BlissParser.#writtenEntries(optionsString);
    if (!written) return;

    // Admitted HERE, where a bracket first becomes an options bag, so every
    // gate, emitter and serializer downstream sees one spelling of a name the
    // library or a standard owns and none of them learns a rule. The stage
    // resolves each name before it judges the key's scope, which is what
    // satisfies "canonicalize before the gates" by construction rather than by
    // ordering discipline.
    //
    // The same stage every other entry point runs, scope included, so a key
    // misplaced in a bracket is reported exactly as the same key misplaced in
    // an object is, next to the same neighbours. A bracket can only ever
    // produce a string or the `true` of a bare key, so the value arm never
    // refuses anything here. It runs anyway, because that is what makes the
    // routes unable to drift apart rather than merely agreeing today.
    //
    // The bag has no prototype: a bracket key can be any name, `__proto__`
    // included, and on a plain object that assignment would be swallowed
    // instead of stored.
    const parsedObject = Object.create(null);
    for (const [key, value] of admitOptions(written, warn, scope)) parsedObject[key] = value;

    return parsedObject;
  }

  // The [key, value] pairs one option bracket writes, in order and as written,
  // before any spelling is resolved: the option grammar's one tokenizer, which
  // `define()` also reads a definition's own bracket with. Null for an empty
  // bracket.
  static #writtenEntries(optionsString) {
    const bracketMatch = optionsString.match(BRACKET_EXTRACT_PATTERN);
    // Stryker disable next-line all: internal invariant, unreachable from public API
    if (!bracketMatch) {
      throw new Error(`#parseOptions: expected bracketed input, got: ${optionsString}`);
    }
    const extractedContent = bracketMatch[1];
    if (!extractedContent) return null;

    const written = [];
    // A key is everything before its entry's first `=` and is never split: a
    // character the name gate refuses is reported under the name the author
    // wrote, as the same key in an object is, instead of silently starting a
    // second key with whatever followed it.
    for (const [entry] of extractedContent.matchAll(BRACKET_ENTRY_PATTERN)) {
      if (entry.trim() === '') continue;
      const equals = entry.indexOf('=');
      if (equals === -1) {
        // Bare key (e.g., [grid]) — treat as boolean true
        written.push([entry.trim(), true]);
        continue;
      }
      let value = entry.slice(equals + 1).trim();

      // Unquoted only when the value is wrapped in a pair of one quote and
      // every quote of that kind inside it is escaped, the form a save writes,
      // so a saved value reads back as itself. A value that merely starts with
      // a quote, as `"x"y` and `"x" "y"` do, is read as written.
      if (value.startsWith('"') && value.endsWith('"') && !/(?<!\\)"/.test(value.slice(1, -1))) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      } else if (value.startsWith("'") && value.endsWith("'") && !/(?<!\\)'/.test(value.slice(1, -1))) {
        value = value.slice(1, -1).replace(/\\'/g, "'");
      }

      written.push([entry.slice(0, equals).trim(), value]);
    }
    return written;
  }

  /**
   * The options a definition's code string writes in its own bracket (see
   * ownBracketOf), as written, so `define()` and `patchDefinition()` can judge
   * them as they judge `defaultOptions`. Null when the code string has no own
   * bracket, or when that bracket is empty.
   *
   * @param {string} codeString
   * @returns {Array<[string, string|true]>|null}
   */
  static ownBracketEntries(codeString) {
    const own = ownBracketOf(codeString, blissElementDefinitions);
    return own ? BlissParser.#writtenEntries(own.bracket) : null;
  }

  // What a definition is, read from its code string: the code string it draws
  // (behind its own bracket) and its own options (its defaultOptions, with
  // that bracket over them: the bracket wins, as it does where the definition
  // stands alone). Read at part scope, since the definition is the part it
  // draws. A further bracket at the same place is reported to `warn` and
  // dropped; `code` names the definition in that report. A `>` leading the
  // code string with nothing before it is an empty option region, so the code
  // behind it is what the definition draws (`>B291` draws `B291`) wherever the
  // definition is read, as the DSL reads one.
  static #readDefinition(code, definition, warn) {
    const { codeString, defaultOptions } = definition;
    const own = typeof codeString === 'string' ? ownBracketOf(codeString, blissElementDefinitions) : null;
    if (!own) {
      return { codeString: typeof codeString === 'string' ? withoutEmptyRegion(codeString) : codeString, options: defaultOptions };
    }
    for (const extra of own.extras) {
      warn?.({
        code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
        message: `Multiple option brackets lead the code string of "${code}": "${extra}" is ignored. Only the first is applied; combine options in one bracket, e.g. [a;b].`,
        source: extra,
      });
    }
    const options = { ...defaultOptions, ...BlissParser.#parseOptions(own.bracket, warn, { level: 'part', notation: 'bracket' }) };
    return { codeString: own.body, options: Object.keys(options).length > 0 ? options : undefined };
  }

  // A definition read where its code string is a part's: as #readDefinition
  // reads it, without the head marker, which designates the head of a word
  // and draws nothing in a part (see withoutHeadMarker).
  static #readPartDefinition(code, definition, warn) {
    const { codeString, options } = BlissParser.#readDefinition(code, definition, warn);
    return { codeString: typeof codeString === 'string' ? withoutHeadMarker(codeString) : codeString, options };
  }

  // Both callers read a bracket that sits on a part, and both pass that scope
  // and the channel a refused key is reported to: the DSL's part site, and the
  // expansion of a definition's code string for a composition object. So a key
  // misplaced inside a definition is reported the same way whichever of the two
  // named the definition.
  static parsePartString(str, restoreFunction = (s) => s, warn, scope) {
    const part = {};

    let optionsString, codeString;
    const match = str.match(/^(\[.*?\])>(.*)$/);
    if (match) {
      optionsString = match[1];
      codeString = match[2];
      part.options = this.#parseOptions(restoreFunction(optionsString), warn, scope);
    } else {
      codeString = str;
    }

    if (codeString) {
      const matched = codeString.match(PART_STRING_PATTERN);

      if (matched) {
        let [, code, x, y] = matched;
        part.codeName = code;
        // An axis the grammar reads but no position can be (B291:1e400) is
        // handed over as written, so the position gate refuses it quoting what
        // the author wrote, as it quotes [x=1e400], not the Infinity it reads as.
        const axisValue = (text) => (Number.isFinite(Number(text)) ? Number(text) : text);
        x !== undefined && (part.x = axisValue(x));
        y !== undefined && (part.y = axisValue(y));
      } else {
        // Restore placeholders in what is reported (a tokenized bracket
        // otherwise leaks as a literal [PLACEHOLDER_n]); the format checks
        // below stay on the tokenized string.
        const written = restoreFunction(codeString);
        part.error = `Invalid format: ${written}`;
        // A warning's source is the token as written, so it can be found where
        // it was written; the error stays the description of what went wrong.
        part.errorSource = written;
        // A recognizable code followed by a malformed coordinate suffix
        // (B291:abc, B291:., B291:5,6,7) is a coordinate FORMAT error, not an
        // unknown code: the code lexes fine, only the `:x,y` failed to parse.
        // Tag it so the renderer surfaces MALFORMED_COORDINATES instead of the
        // misleading UNKNOWN_CODE. The token is still dropped (invalid syntax is
        // not carried forward); only the warning code differs. The syntax error
        // is reported before semantics, so an unknown code with a bad suffix
        // (ZZ:abc) is MALFORMED_COORDINATES too. The `:` (not `,`) is the
        // trigger: it is the marker that says "a coordinate follows".
        if (CODE_THEN_COORDINATE_PATTERN.test(codeString)) {
          part.errorCode = WARNING_CODES.MALFORMED_COORDINATES;
        }
      }
    }

    return part;
  }
  static fromString(inputString) {
    if (typeof inputString === 'string' && inputString.length > MAX_INPUT_LENGTH) {
      throw new Error('Input string exceeds maximum length of 10,000 characters');
    }
    inputString = inputString.trim();
    const result = {};
    const parseWarnings = [];
    // The warnings route every option bracket in this parse reports through.
    const warn = (warning) => parseWarnings.push(warning);

    // Parse a Blissymbolics string and convert it to an internal representation (BlissComposition)
    //Ex. 
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4{hej}/C8:0,8;[color=green]E:0,11{hopp}/AA8N:0,2"
    //inputString = "[stroke-width=0.4;stroke-width=0.3]||[stroke-width=0.2]|H:3,4;E:2,4/C8:0,8;[color=green]E:0,11/AA8N:0,2{hej hopp}"

    let placeholderMap = {};
    let placeholderCount = 0;

    // Preserve content in both {...} and [...] to protect spaces.
    // {...} uses greedy match because text content must be able to contain any
    // characters, including literal `{` and `}`. The downside is that multiple
    // `{...}` blocks in one input collapse into a single match, which silently
    // merges the glyphs between them. We emit UNSUPPORTED_TEXT_BLOCKS below to
    // make that visible. Proper multi-block support requires a stateful
    // tokenizer and ships with the {text} rendering feature.
    // [...] uses non-greedy match since it can appear multiple times.
    const originalInput = inputString;
    inputString = inputString.replace(BRACKET_TOKEN_PATTERN, (match, textContent, optionContent) => {
      let placeholder = `PLACEHOLDER_${placeholderCount++}`;
      if (textContent !== undefined) {
        placeholderMap[placeholder] = { content: textContent, openBracket: '{', closeBracket: '}' };
        return '{' + placeholder + '}';
      } else {
        placeholderMap[placeholder] = { content: optionContent, openBracket: '[', closeBracket: ']' };
        return '[' + placeholder + ']';
      }
    });

    // {text} blocks parse onto group.text but do not render yet and are
    // dropped from toString(), so EVERY block warns — a silent single block
    // violated visible-not-silent. Counting `{` AFTER tokenization means a
    // quoted `{` inside an option value never counts, a whole block counts
    // once regardless of nested braces in its content, and a stray unmatched
    // `{` still counts as a failed block attempt.
    if ((inputString.match(/\{/g) || []).length > 0) {
      parseWarnings.push({
        code: WARNING_CODES.UNSUPPORTED_TEXT_BLOCKS,
        message: 'Text blocks ({...}) are not supported yet: the text does not render and is dropped from toString() output. Multiple {...} blocks in one input have undefined parse behavior until text-block tokenization ships. Use a single trailing {text} per group.',
        source: originalInput,
      });
    }

    // Remove all spaces in input string (but not in preserved content)
    inputString = inputString.replace(/\s/g, '');

    // The text as written, as a warning quotes it and the `;;` overlay keeps
    // it: each bracket the tokenizer set aside put back, and each letter drawn
    // as text spelled as its X code rather than the routing key the X pass
    // reads it under. The keys go first, while every bracket is still a
    // placeholder, so the text of an option is never touched.
    const restorePlaceholders = (str) => {
      if (!str) return str; // Handle undefined/null/empty (matches #parseOptions behavior)
      return withXCodesAsWritten(str).replace(/(\{|\[)PLACEHOLDER_(\d+)(\}|\])/g, (match, open, num, close) => {
        const placeholder = placeholderMap[`PLACEHOLDER_${num}`];
        if (placeholder) {
          const { content, openBracket, closeBracket } = placeholder;
          return openBracket + content + closeBracket;
        }
        return match;
      });
    };

    // An options bag with nothing left in it is stored as no options at all, so
    // a bracket the stage emptied (every key misplaced at its scope) or one
    // written empty leaves no `{}` artifact: its toJSON matches the bare form's.
    const nonEmpty = (options) => (options && Object.keys(options).length > 0 ? options : undefined);

    // Extract global options
    let [_, globalOptionsString, globalCodeString] = inputString.match(/^\s*(?:([^|]*)\s*\|\|)?(.*)$/);
    if (globalOptionsString && globalOptionsString.match(/^\[.*\]$/)) {
      const restoredGlobal = restorePlaceholders(globalOptionsString);
      // #parseOptions keeps the first bracket, so a duplicate warns and drops.
      if (BlissParser.#hasMultipleOptionBrackets(globalOptionsString, restoredGlobal)) {
        parseWarnings.push({
          code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
          message: `Multiple option brackets before ||: "${restoredGlobal}". Only the first is applied; combine options in one bracket, e.g. [a;b]||.`,
          source: restoredGlobal,
        });
      }
      // Gated like every other scope: a global-only key is at HOME here, but a
      // key bound to a lower scope (kerning) is as misplaced here as a global
      // key is down there.
      result.options = nonEmpty(this.#parseOptions(restoredGlobal, warn, { level: 'global', notation: 'bracket' })) || {};
    } else {
      if (globalOptionsString && globalOptionsString.length > 0) {
        const restored = restorePlaceholders(globalOptionsString);
        parseWarnings.push({
          code: WARNING_CODES.MALFORMED_GLOBAL_OPTIONS,
          message: `Invalid global options syntax: "${restored}||" - expected [options]|| format. Ignoring.`,
          source: restored,
        });
      }
      result.options = {};
    }

    // Step 1: Replace // patterns with /SP/ (space placeholder)
    // Each // adds one SP, /// adds two SPs, etc.
    const normalized = globalCodeString.replace(/\/{2,}/g, match =>
      '/' + 'SP/'.repeat(match.length - 1)
    );

    // Step 2: Split on / and group consecutive items by type (space vs non-space)
    const glyphCodes = normalized.split('/').filter(s => s !== '');
    const isSpaceCode = code => code === 'SP' || code === 'TSP' || code === 'QSP';

    const groupedCodes = []; // Array of { codes: [...], isSpace: boolean }
    for (const code of glyphCodes) {
      const isSpace = isSpaceCode(code);
      const lastGroup = groupedCodes[groupedCodes.length - 1];
      if (lastGroup && lastGroup.isSpace === isSpace) {
        lastGroup.codes.push(code);
      } else {
        groupedCodes.push({ codes: [code], isSpace });
      }
    }

    // Step 3: Build parsed groups, staging spaces for TSP/QSP resolution
    const parsedGroups = [];
    for (let gi = 0; gi < groupedCodes.length; gi++) {
      const { codes, isSpace } = groupedCodes[gi];

      if (isSpace) {
        // Keep explicit spaces and mark implicit SP for the later TSP/QSP pass.
        // See Step 4 below for SP -> TSP/QSP resolution.
        const spaceGlyphs = codes.map(code => {
          const fromSP = code === 'SP';
          return { parts: [{ codeName: fromSP ? 'TSP' : code, _fromSP: fromSP }] };
        });
        parsedGroups.push({ glyphs: spaceGlyphs, _isSpaceGroup: true, _spaceIndex: gi });
        continue;
      }

      // Non-space group: parse normally
      const tpgs = codes.join('/');

      let group = { glyphs: [] };

      let [_, twoPartGroupString, textKey] = tpgs.match(/(.*?)(?:\{(.*?(?<!\\))\})?$/);

      if (textKey) {
        group.text = placeholderMap[textKey]?.content ?? textKey;
      }

      // The separators are read before anything else in the word, so a word
      // that fails on one reports once, never its brackets or its codes. The
      // builder drops a failed word from the drawing and both saves, and
      // reports it then (as it does a malformed `;;`).
      const separators = BlissParser.#readWordSeparators(twoPartGroupString);
      if (separators === null) {
        const word = restorePlaceholders(twoPartGroupString);
        group.errorCode = WARNING_CODES.MALFORMED_GROUP_OPTIONS;
        group.error = `Invalid separator in the word "${word}": | goes only after a word's options at its start, as [options]|, and || only after the global options at the start of the input, as [options]||. The word was dropped.`;
        group.errorSource = word;
        parsedGroups.push(group);
        continue;
      }
      const { options: beforePipe, content: groupCodeString, misplaced } = separators;
      if (beforePipe !== undefined) {
        if (beforePipe.match(/^\[.*\]$/)) {
          const restoredBeforePipe = restorePlaceholders(beforePipe);
          // #parseOptions keeps the first bracket, so a duplicate warns and drops.
          if (BlissParser.#hasMultipleOptionBrackets(beforePipe, restoredBeforePipe)) {
            parseWarnings.push({
              code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
              message: `Multiple option brackets before |: "${restoredBeforePipe}". Only the first is applied; combine options in one bracket, e.g. [a;b]|.`,
              source: restoredBeforePipe,
            });
          }
          group.options = nonEmpty(this.#parseOptions(restoredBeforePipe, warn, { level: 'group', notation: 'bracket' }));
        } else if (beforePipe.length > 0) {
          const restoredBeforePipe = restorePlaceholders(beforePipe);
          parseWarnings.push({
            code: WARNING_CODES.MALFORMED_GROUP_OPTIONS,
            message: `Invalid group options syntax: "${restoredBeforePipe}|" - expected [options]| format. Ignoring.`,
            source: restoredBeforePipe
          });
        }
      }
      // An option bracket written inside the word stands in the wrong place:
      // it is reported and left out unread, and the word renders.
      for (const { spelling, isGlobal } of misplaced) {
        const dropped = restorePlaceholders(spelling);
        const word = restorePlaceholders(twoPartGroupString);
        parseWarnings.push(isGlobal
          ? {
            code: WARNING_CODES.MISPLACED_GLOBAL_OPTION,
            message: `Global options "${dropped}" ignored in the word "${word}": global options go only at the start of the input, as [options]||.`,
            source: dropped,
          }
          : {
            code: WARNING_CODES.MISPLACED_GROUP_OPTION,
            message: `Group options "${dropped}" ignored in the word "${word}": word options go only at the start of a word, as [options]|.`,
            source: dropped,
          });
      }

      function replaceWithDefinition(str, definitions) {
        const wordCode = str;

        // Rule-3 automatic scan: skip exclusions from the start, stop at the
        // first non-excluded character, or pick by priority tier when the
        // whole word is exclusions. Each character is read by headScanCode, as
        // the render reads it: a token of several `;` parts is never skipped,
        // whatever code it names. A token of one part is matched by its own
        // code first (glyphCode: a custom glyph wrapping an exclusion is its
        // own character, not that exclusion); without one, _scanCode (the
        // character code stashed at part creation) keeps exclusion matching
        // immune to decorations written onto part strings by outer expansion
        // levels.
        const findFallbackHeadIndex = (parts) => resolveHeadIndex(parts.map((p) =>
          headScanCode(p.glyphCode, partSegmentsOf(p.part).length, p._scanCode ?? p.part.split(';')[0])));

        // A space carries neither a designation nor a word indicator: TSP/
        // QSP/ZSA groups serialize as bare word breaks ('//'), so a `^` or
        // `;;` stored on one is eaten by toString and lost on reparse.
        // A DECORATED space token skips the
        // step-2 space branch (the token is not exactly SP/TSP/QSP) and lands
        // here; classify by the expanded part's resolved code.
        const isSpacePart = (p) => {
          const partCode = p._scanCode ?? (p.part ? p.part.split(';')[0].split(':')[0] : '');
          return partCode === 'TSP' || partCode === 'QSP' || partCode === 'ZSA';
        };

        // Per-word-string head resolution (head-marker contract):
        // rule 2 -- the leftmost written marker (_marker) in this word-string
        // wins; later ones warn and drop. With no written marker, rule 3
        // scans for the head position and rule 4 redirects the crown to the
        // designated head (_designation) of the fragment the scan stopped in.
        const resolveWordStringHead = (parts, label) => {
          const markerIndexes = parts.flatMap((p, i) => (p._marker ? [i] : []));
          for (const laterIndex of markerIndexes.slice(1)) {
            delete parts[laterIndex]._marker;
            parseWarnings.push({ code: WARNING_CODES.MULTIPLE_HEAD_MARKERS, message: `Multiple head markers (^) found in word: ${label}. Using first marked glyph.`, source: label });
          }
          if (markerIndexes.length > 0) {
            delete parts[markerIndexes[0]]._marker;
            return { index: markerIndexes[0], isDesignated: true };
          }
          const stop = findFallbackHeadIndex(parts);
          // Designated parts always carry _frag, so a fragment-less stop
          // (frag === undefined) can never match one.
          const frag = parts[stop]._frag;
          const designated = parts.findIndex(p => p._frag === frag && p._designation);
          if (designated !== -1) return { index: designated, isDesignated: true };
          return { index: stop, isDesignated: false };
        };

        // Consume a fragment's resolution into a single upward-facing
        // designation: an embedded alias contributes its characters plus at
        // most one designated head (rule 4); deeper bookkeeping is cleared.
        let fragCounter = 0;
        // Seal a span into upward-facing designations. A span containing
        // _wordBreak markers (a nested multi-word alias) is chunked at the
        // breaks and each word-string is sealed on its own fragment, so a
        // marker in a non-first word keeps its designation (rule 2: each
        // // word-string resolves independently). Returns the first word's
        // resolution in full-span coordinates, for callers that target the
        // first word's head (WORD;INDICATORS). A break-free span seals as a
        // single fragment, exactly as before.
        const sealFragment = (parts, label) => {
          let firstResolved = null;
          const sealChunk = (start, end) => {
            const chunk = parts.slice(start, end);
            // Skip empty chunks (adjacent/leading/trailing breaks, or an empty
            // span) so resolveWordStringHead is never handed []. Also the empty
            // -span guard: a break-free empty span produces one empty chunk and
            // returns null.
            if (chunk.length === 0) return;
            const resolved = resolveWordStringHead(chunk, label);
            const fragId = ++fragCounter;
            for (const p of chunk) {
              delete p._designation;
              p._frag = fragId;
            }
            if (resolved.isDesignated) chunk[resolved.index]._designation = true;
            if (firstResolved === null) {
              firstResolved = { index: start + resolved.index, isDesignated: resolved.isDesignated };
            }
          };
          let chunkStart = 0;
          for (let i = 0; i < parts.length; i++) {
            if (parts[i]._wordBreak) {
              sealChunk(chunkStart, i);
              chunkStart = i + 1;
            }
          }
          sealChunk(chunkStart, parts.length);
          return firstResolved;
        };

        // Resolve and crown one final word: only an explicit `^`/designation
        // is stamped. Fallback heads stay unstamped and are resolved at query
        // time (render/serialize/snapshot) via resolveHeadIndex, so the stamp
        // can never go stale after a structural mutation reorders the word.
        const crownWordChunk = (parts, label) => {
          if (parts.length === 0) return;
          const resolved = resolveWordStringHead(parts, label);
          if (resolved.isDesignated) {
            parts[resolved.index].isHeadGlyph = true;
          }
        };

        // Split expanded parts at word-break markers and crown each word
        // independently (rule 2: words split by // each have their own head).
        const crownWordChunks = (parts, label) => {
          let chunk = [];
          for (const p of parts) {
            if (p._wordBreak) {
              crownWordChunk(chunk, label);
              chunk = [];
            } else {
              chunk.push(p);
            }
          }
          crownWordChunk(chunk, label);
        };

        // A bare alias is shorthand: it draws the parts it expands to, so its
        // own options are theirs, on every part of every character it draws,
        // never on a character, where they would style a part added beside
        // them. Each expanded token carries them for the glyph loop, merged
        // over what an inner link of the chain brought: the outer link wins a
        // key both set. A space draws nothing and takes no option.
        const giveAliasOptions = (parts, options) => {
          for (const p of parts) {
            if (!isSpaceGlyph(p._scanCode)) p.partOptions = { ...p.partOptions, ...options };
          }
        };

        // Helper: resolve codeString through aliases to check if it's a word.
        const resolveToFinalCodeString = (code) => finalCodeStringOf(code, definitions);

        // An indicator (char-level `;` or word-level `;;`) binds to exactly one
        // word. When it is bound to a single ALIAS token that expands to MORE
        // THAN ONE word (a `_wordBreak` survives expansion), there is no single
        // head to carry it, so the binding is invalid. Fail the whole unit:
        // collapse the word-break expansion into one group (filter the breaks so
        // no `//` split survives) and flag it with `_wordError`, exactly like the
        // malformed-`;;` path. The assembly loop lifts the flag onto
        // group.errorCode and the L1 fail-render mechanism collapses it to ONE
        // placeholder (error-placeholder on) or nothing (off). This replaces the
        // legacy silent drop (direct `//` alias) and first-word-head attach
        // (nested alias / `;;` overlay). errorSource is the whole group string
        // (`wordCode`) so toString re-emits it and parse(toString(x)) re-flags;
        // the flag is static + sticky and the splitAt/mergeWithNext guards key
        // off group.errorCode. The rule applies uniformly to direct and nested
        // aliases.
        const failMultiWordIndicator = (parts) => {
          // Filtering the `_wordBreak` markers collapses the multi-word
          // expansion into one group; any head markers the words carried are
          // already sealed to per-word designations by sealFragment during
          // expansion (so the collapse cannot re-trigger MULTIPLE_HEAD_MARKERS)
          // and are inert anyway, since a placeholder renders for the unit.
          const collapsed = parts.filter(p => !p._wordBreak);
          if (collapsed.length > 0) {
            // Restore placeholders: errorSource re-emits from toString, so a
            // stored placeholder token would replace the user's option text.
            collapsed[0]._wordError = {
              code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
              message: `Indicator bound to the multi-word unit "${restorePlaceholders(wordCode)}": an indicator targets a single word, but this expands to multiple words.`,
              source: restorePlaceholders(wordCode),
            };
          }
          return collapsed;
        };

        // Detect ;; for word-level indicators on inline multi-character expressions.
        // Pattern: baseCode;;indicators. Instead of baking the indicators
        // onto the head glyph, store them as a reversible overlay on the group.
        // The base glyphs expand and crown as usual; the overlay is resolved onto
        // the head at decode time (render + serialize) via
        // mergeWordIndicatorsOntoHead, so `;;` round-trips and clears non-
        // destructively. Single ;; on a pre-defined word also becomes an overlay
        // (scope-fenced: single ; on a word still bakes via replaceWithDefinition).
        const wordLevelMatch = str.match(/^(.+);;(.*)$/);
        if (wordLevelMatch) {
          const [_, baseCode, rawIndicators] = wordLevelMatch;

          // A word-level indicator list must be the trailing part of the word:
          // exactly one `;;`, and no `/`-separated glyph after the indicators
          // (greedy match means rawIndicators holds everything after the last
          // `;;`). Otherwise the whole WORD is invalid: a word-level indicator
          // is a word property (it sets part-of-speech), so a malformed one
          // invalidates the word, not one character. Stash a word-error on the
          // first part; the assembly loop lifts it onto group.errorCode, where
          // the element collapses the word to a single error placeholder (the
          // L1 analogue of the L2 character placeholder) and records ONE warning.
          // str is inside the wordLevelMatch guard, so it always contains `;;`
          // (match is non-null). The base still expands to real (non-space)
          // glyphs so the failed group advances like a normal word; those glyphs
          // are not rendered (the placeholder stands in), and toString re-emits
          // the original `str` so parse(toString(x)) re-flags (round-trip).
          const isMalformed = str.match(/;;/g).length > 1 || rawIndicators.includes('/');
          if (isMalformed) {
            // Expand the fallback NOT at top level: this malformed `;;` already
            // fail-renders with MALFORMED_WORD_INDICATOR, so the re-expansion must
            // not also emit a spurious char-level MISPLACED_CHARACTER_INDICATOR
            // when the base is a bare alias or word. (Strict Indicator Separation.)
            const fallbackParts = str.replace(/;;/g, ';').split('/').flatMap(strPart => expand(strPart, definitions, false));
            // A malformed `;;` whose base expands past a word break (a multi-word
            // `//` alias) yields several word-groups; rendering them all makes
            // toString re-emit the full expansion, so the round-trip grows without
            // bound on every pass. Collapse to one fail-placeholder (verbatim
            // round-trip via errorSource = wordCode), mirroring the well-formed
            // multi-word `;;` fail below. (Strict Indicator Separation.)
            if (fallbackParts.some(p => p._wordBreak)) {
              return failMultiWordIndicator(fallbackParts);
            }
            crownWordChunks(fallbackParts, wordCode);
            if (fallbackParts.length > 0) {
              // Restore placeholders: errorSource re-emits from toString, so a
              // stored placeholder token would replace the user's option text.
              fallbackParts[0]._wordError = {
                code: WARNING_CODES.MALFORMED_WORD_INDICATOR,
                message: `Malformed word-level indicator in "${restorePlaceholders(str)}": ;; must be the trailing part of a word.`,
                source: restorePlaceholders(str),
              };
            }
            return fallbackParts;
          }

          const stripSemantic = rawIndicators.startsWith('!');
          const indicators = stripSemantic ? rawIndicators.slice(1) : rawIndicators;

          // Process baseCode using the normal flow (splits on / and expands each
          // part): definitions, ^ markers, options, etc.
          const expandedParts = baseCode.split('/').flatMap(strPart => expand(strPart, definitions));

          // A ;; overlay binds to ONE word. Bound to a multi-word alias (the base
          // expands past a word break), it has no single head: fail the whole
          // unit instead of overlaying only the first word (uniform
          // with the char-level multi-word-alias fail in expandSegment).
          if (expandedParts.some(part => part._wordBreak)) {
            return failMultiWordIndicator(expandedParts);
          }

          // A space carries no word indicator: the overlay
          // would be stored, then eaten by the '//' serialization. Warn ONCE
          // for the whole overlay (strip included) and keep the plain space —
          // a misplaced decoration on valid content is dropped, not
          // fail-rendered.
          if (expandedParts.length > 0 && expandedParts.every(isSpacePart)) {
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_WORD_INDICATOR,
              message: `Word-level indicator (;;${rawIndicators}) ignored on "${restorePlaceholders(str)}": a space cannot carry a word indicator.`,
              source: restorePlaceholders(str),
            });
            crownWordChunks(expandedParts, wordCode);
            return expandedParts;
          }

          // Resolve and crown the word so the head is identifiable at decode.
          crownWordChunks(expandedParts, wordCode);

          // Stash the overlay on the first part; the assembly loop lifts it onto
          // the group. Codes are merged/indicator-filtered at decode, not here;
          // filter(Boolean) drops empties so a bare `;;` yields an empty list.
          // With char-level promotion gone, no leading glyph can pre-claim the
          // word-level slot, so this explicit `;;` overlay always wins here. (A
          // `/`-composition of two explicit `;;` overlays is still resolved
          // first-wins by the assembly loop below.) (Strict Indicator Separation.)
          // Restore each code's placeholders AFTER splitting: a part-level
          // option (`[color=red]>B81`) is placeholder-substituted early, so its
          // internal `;` is safe to split on here; restoring before the split
          // would re-expose that `;` and break a multi-key option.
          const rawCodes = indicators.split(';').filter(Boolean).map((c) => restorePlaceholders(c));

          // An overlay code may carry a part option ([opts]>B81). Its
          // bracket meets the same global-only key gate as any part bracket,
          // but the overlay stores code STRINGS verbatim (parsed only at
          // render-merge), so a gated key must be stripped from the stored
          // string itself or toString would re-serialize the warned no-op
          // forever. Clean codes pass through untouched; a
          // stripped prefix is rebuilt with the shared quote-aware key=value
          // emission (serializeOptionValue), so a kept quoted value survives
          // the rebuild.
          const gatedCodes = rawCodes.map((code) => {
            // A CHARACTER-form prefix ([opts]CODE, no >) is inert in overlay
            // position for EVERY key -- the render-merge extracts parts only,
            // so the bracket styles nothing, yet it used to re-serialize
            // forever with no warning anywhere.
            // The whole bracket is misplaced (a word-indicator code has
            // no character to bind to); [opts]> is the styled form. EVERY
            // leading char-form bracket strips in this ONE pass (one warning
            // each) BEFORE the part-form gate runs: the part-form regex would
            // otherwise backtrack across stacked brackets ([a][b]>CODE read
            // as one prefix whose #parseOptions sees only bracket one),
            // leaving later keys unreached or losing a valid later bracket
            // with the misplaced first one.
            let current = code;
            let charPrefix;
            while ((charPrefix = current.match(OVERLAY_CHAR_OPTION_PATTERN)) !== null) {
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                message: `Character option (${charPrefix[1]}) ignored on the word indicator "${charPrefix[3]}": a ;; code has no character to style. Use ${charPrefix[1]}>${charPrefix[3]} to style the indicator part.`,
                source: current,
              });
              current = charPrefix[3];
            }
            const optionPrefix = current.match(OVERLAY_PART_OPTION_PATTERN);
            if (!optionPrefix) return current;
            // This pass INSPECTS the bracket rather than ingesting it: when
            // no key is misplaced, the written text is returned untouched and
            // parsed again for real downstream. So the stage's reports are
            // buffered and released only when a key was dropped for its scope,
            // which is the branch that REWRITES the text and so the last place
            // the written spellings are visible. Passing them straight through
            // would report a collapse twice.
            const reports = [];
            const kept = BlissParser.#parseOptions(optionPrefix[1], (w) => reports.push(w), { level: 'part', notation: 'bracket' }) ?? {};
            if (!reports.some(isScopeRefusal)) return current;
            parseWarnings.push(...reports);
            const keptEntries = Object.entries(kept);
            if (keptEntries.length === 0) return optionPrefix[3];
            return `[${keptEntries.map(([k, v]) => v === true ? k : `${k}=${serializeOptionValue(v)}`).join(';')}]>${optionPrefix[3]}`;
          });

          // A `;;` word-level indicator must BE an indicator. Validate + drop here
          // (not silently at render): a recognized non-indicator (a real base)
          // warns NON_INDICATOR_AS_WORD_INDICATOR, an unrecognized code warns
          // UNKNOWN_CODE, and either way the offender is DROPPED so it does not
          // re-serialize. The base still renders as written -- a bad decoration on
          // valid content is dropped, not fail-rendered.
          // resolveWordIndicatorOverlay is the shared classify + store rule (the
          // DSL, API, and object surfaces all use it, so they agree); it returns
          // null when the codes were all dropped and there is no strip. (Strict
          // Indicator Separation.) Its 'word-structure' reject reason cannot
          // fire on this path: any `/` in the `;;` tail already failed the
          // whole word at the isMalformed gate above, so this callback maps
          // only 'non-indicator' and 'unknown'.
          const overlay = resolveWordIndicatorOverlay(gatedCodes, stripSemantic, definitions, ({ code: badCode, reason }) => {
            parseWarnings.push(reason === 'non-indicator'
              ? {
                  code: WARNING_CODES.NON_INDICATOR_AS_WORD_INDICATOR,
                  message: `Word-level indicator "${badCode}" after ;; is not an indicator; it is ignored. A ;; code must be an indicator (e.g. B81).`,
                  source: badCode,
                }
              : {
                  code: WARNING_CODES.UNKNOWN_CODE,
                  message: `Word-level indicator "${badCode}" after ;; is not a known code; it is ignored.`,
                  source: badCode,
                });
          });

          if (overlay && expandedParts.length > 0) {
            expandedParts[0]._wordIndicators = overlay;
          }

          return expandedParts;
        }

        // isTopLevel: true for user input, false for internal codeString expansion
        // Indicator replacement only applies at top level (user input)
        function expand(str, definitions, isTopLevel = true, depth = 0) {
          let hasMarker = false;
          if (str.endsWith('^')) {
            hasMarker = true;
            str = str.slice(0, -1);
          }
          // A head marker attaches to the END of a character, after its
          // indicators (`B291;B81^`). A character includes its indicators, so a
          // `^` written on the base before the indicator separator (`B291^;B81`)
          // is MISPLACED -- not a synonym for the trailing form. Strip it so the
          // base is not lost as an unknown code (`B291^`), but DROP it with a
          // warning rather than honoring it (parallel to a `^` on a multi-
          // character alias below); the user must write it at the character's end.
          const caretBeforeIndicator = str.match(/^(.*?)\^(;.*)$/);
          if (caretBeforeIndicator) {
            const cleaned = caretBeforeIndicator[1] + caretBeforeIndicator[2];
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_HEAD_MARKER,
              message: `Head marker (^) ignored on "${restorePlaceholders(str)}": it must mark the end of a character, after its indicators (e.g. "${restorePlaceholders(cleaned)}^"), not the base before them.`,
              source: restorePlaceholders(str),
            });
            str = cleaned;
          }
          const parts = expandSegment(str, definitions, isTopLevel, depth);
          if (hasMarker) {
            if (parts.length === 1) {
              if (isSpacePart(parts[0])) {
                // A space cannot be a word's head: warn +
                // drop, never store a designation the space serialization
                // ('//') cannot re-emit.
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_HEAD_MARKER,
                  message: `Head marker (^) ignored on "${restorePlaceholders(str)}": a space cannot be a word's head.`,
                  source: restorePlaceholders(str),
                });
              } else {
                // Rule 1: ^ attaches to a character (one expanded glyph),
                // including an alias that resolves to a single character.
                parts[0]._marker = true;
              }
            } else {
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_HEAD_MARKER,
                message: `Head marker (^) ignored on "${restorePlaceholders(str)}": it expands to multiple characters. Mark a single character instead.`,
                source: restorePlaceholders(str),
              });
            }
          }
          return parts;
        }

        function expandSegment(str, definitions, isTopLevel, depth) {
          if (depth > MAX_RECURSION_DEPTH) throw new Error('Maximum recursion depth exceeded');

          // A `>` with no bracket in front of it is an option region carrying
          // nothing, exactly like a bare `||` or `|`, and the documented rule
          // for those is that the code "stays plain content". Consume it here,
          // before any bracket matching, so the code keeps the identity it
          // would have had written bare -- `>B291` IS `B291`, not the empty
          // part region `[]>B291`, which leaves the glyph anonymous. Exactly
          // one is consumed: two empty regions spell nothing, and the global
          // scope does not tolerate a doubled separator either.
          str = str.replace(/^>/, '');

          // Handle part-level options with > (like [x=2]>B291 or [color=red]>XW)
          const partLevelMatch = str.match(/^(\[.*?\])>(.+)$/);
          if (partLevelMatch) {
            const optionBracket = partLevelMatch[1];
            let partContent = partLevelMatch[2];
            // A SECOND part bracket is invalid syntax that parseParts warns
            // about and drops, so strip the extras here as well: the gate below
            // and the metadata lift both need to see the real code behind them.
            // `str` is left intact, so parseParts still reports each extra
            // exactly once. Without this a word alias behind two part brackets
            // was never recognized as a word and failed as a part.
            const extraPartBrackets = [];
            let extraPartBracket;
            while ((extraPartBracket = partContent.match(/^(\[[^\[\]]*\])>(.+)$/)) !== null) {
              extraPartBrackets.push(extraPartBracket[1]);
              partContent = extraPartBracket[2];
            }
            // When the code turns out to be a WORD the branch below recurses on
            // the stripped content, so parseParts never sees those extras and
            // cannot report them. Report them here in that case only, or they
            // would vanish with nothing said (the character scope does the same
            // for the same reason, a few lines down).
            const warnDroppedPartBrackets = () => {
              for (const dropped of extraPartBrackets) {
                const restored = restorePlaceholders(dropped);
                parseWarnings.push({
                  code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
                  message: `Multiple option brackets on one part: "${restored}" is ignored. Only the first is applied; combine options in one bracket, e.g. [a;b]>.`,
                  source: restored,
                });
              }
            };
            // Option-placement scope gate (mirrors the char-level `;` MISPLACED
            // gate below). A part option binds to a single part, so `[opts]>` on
            // an alias that expands to a WORD is MISPLACED: warn, drop the
            // option, and expand the rest as if written bare (a trailing
            // `;`-part then meets the normal gate). The word check runs at ANY
            // level -- a definition baking `[opts]>WORDALIAS` behaves like the
            // written form (the old WORD_AS_PART fail serialized to a form that
            // re-parsed differently). A `;`-part behind a validly placed
            // `[opts]>` on a bare alias meets the same MISPLACED rule this
            // early return used to bypass: warn, drop the parts, keep the
            // option on the base; scoped to top level in parity with the `;`
            // gate below.
            const [gateBaseRaw, ...gateParts] = partContent.split(';');
            const gateCoordMatch = gateBaseRaw.match(COORD_SUFFIX_PATTERN);
            const gateBase = gateCoordMatch && gateCoordMatch.index > 0
              ? gateBaseRaw.slice(0, gateCoordMatch.index)
              : gateBaseRaw;
            if (resolveToFinalCodeString(gateBase)?.includes('/')) {
              warnDroppedPartBrackets();
              parseWarnings.push({
                code: WARNING_CODES.MISPLACED_PART_OPTION,
                message: `Part option (${restorePlaceholders(optionBracket)}>) ignored on "${restorePlaceholders(gateBase)}": > applies an option to a single part, but this is a word. Use ${restorePlaceholders(optionBracket)}|| to apply it to the whole content.`,
                source: restorePlaceholders(gateBase),
              });
              return expandSegment(partContent, definitions, isTopLevel, depth);
            }
            if (isTopLevel) {
              const gateDef = definitions[gateBase];
              const gateBaseIsBareAlias = !!gateDef && gateDef.codeString !== undefined
                && !gateDef.isBlissGlyph && !gateDef.isShape
                && !gateDef.isExternalGlyph && !gateDef.glyphCode;
              const droppedParts = gateParts.filter(p => p !== '');
              if (gateBaseIsBareAlias && droppedParts.length > 0) {
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_CHARACTER_INDICATOR,
                  message: `Character indicator (;${droppedParts.join(';')}) ignored on "${restorePlaceholders(gateBase)}": ; composes onto a single character, but this is a word. Use ;; for a word-level indicator.`,
                  source: restorePlaceholders(gateBase),
                });
                partContent = gateBaseRaw;
                str = `${optionBracket}>${gateBaseRaw}`;
              }
            }
            // The code behind the bracket is read as the gate above reads it,
            // without its `;` parts or coordinate: `[color=red]>Xa;B86` is the
            // letter a. Reading everything up to the first `:` left the parts
            // attached, so the lookup named nothing and the letter was spaced
            // as a Bliss character. A text-fallback code is never in the
            // registry, and is derived the way the other XTXT_ sites derive it.
            const definition = layoutDefinitionOf(gateBase, definitions) ?? {};
            // The identity code stays on the PART here: `[opts]>` binds the
            // option to a part, so the glyph is an anonymous wrapper around a
            // named part. Only the layout data is lifted, so the glyph spaces,
            // kerns and pulls in the word space before it as the bare spelling
            // does. See the toJSON metadata gate in bliss-svg-builder.js, which
            // must keep that data for a glyph with no code of its own.
            return [{
              part: str,
              _scanCode: partContent.split(';')[0].split(':')[0],
              ...(definition.shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace: true }),
              ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
              ...(definition.char && { char: definition.char }),
              ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
            }];
          }

          // Strip leading glyph-level bracket options. EVERY one of them, not
          // just the first: a second bracket at one scope is invalid syntax
          // that the glyph-level peel warns about and drops, so the code behind
          // it must still resolve. Stripping only the first left a word alias
          // unresolvable (`[a][b]MYWORD` looked up `[b]MYWORD`), so the
          // character failed with WORD_AS_PART although the single-bracket
          // spelling renders it. The prefix that APPLIES is still the first.
          const optionsMatch = str.match(/^(\[.*?\])(?!>)/);
          const optionsPrefix = optionsMatch ? optionsMatch[1] : '';
          let codeForLookup = str;
          const strippedBrackets = [];
          let strippedBracket;
          while ((strippedBracket = codeForLookup.match(/^(\[.*?\])(?!>)/)) !== null) {
            strippedBrackets.push(strippedBracket[1]);
            codeForLookup = codeForLookup.slice(strippedBracket[1].length);
          }
          // Where a definition's expansion is written back, ALL the brackets go
          // in front of it, so the glyph-level peel applies the first and
          // reports the rest. Where the option is dropped as misplaced instead,
          // the text reaches no peel, so the rest are reported here.
          const writtenBrackets = strippedBrackets.join('');
          const reportExtraBrackets = () => {
            for (const dropped of strippedBrackets.slice(1)) {
              const restored = restorePlaceholders(dropped);
              parseWarnings.push({
                code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
                message: `Multiple option brackets on one character: "${restored}" is ignored. Only the first is applied; combine options in one bracket, e.g. [a;b].`,
                source: restored,
              });
            }
          };

          const [potentialBaseCodeRaw, ...rawIndicators] = codeForLookup.split(';');
          // Strict Indicator Separation: `;` is dumb part-composition, so the
          // `!` strip-semantic shortcut no longer has a special parse. A `!`
          // after a single `;` is just part of an (invalid) appended code.
          const filteredIndicators = rawIndicators.filter(ind => ind !== '');

          // Strip position modifier (e.g. ":2,0", ":,2", ":-1.5,3") from base
          // code so definition lookup works for codes like "WORD:2,0"; the
          // shared pattern matches the full grammar parsePartString accepts,
          // so a y-only ":,2" resolves the same definition as ":0,2".
          const posMatch = potentialBaseCodeRaw.match(COORD_SUFFIX_PATTERN);
          const hasPosSuffix = posMatch && posMatch.index > 0;
          const potentialBaseCode = hasPosSuffix
            ? potentialBaseCodeRaw.slice(0, posMatch.index)
            : potentialBaseCodeRaw;
          const positionSuffix = hasPosSuffix ? posMatch[0] : '';

          const resolvedCodeString = resolveToFinalCodeString(potentialBaseCode);
          const isWordDefinition = resolvedCodeString?.includes('/') ?? false;

          // A bare alias (a `{codeString}`-only definition, no glyph flag) is a
          // WORD unit, not a single character; a multi-glyph word is many
          // characters. In both cases a char-level `;`-part has no single
          // character to attach to, so it is MISPLACED: warn once, drop it, and
          // render the base as defined (the head keeps any baked indicator). A
          // glyph / literal / unknown code is a single character and dumb-appends
          // the part (base case / built-in path below). Use `;;` for a word-level
          // indicator.
          const baseCodeDef = definitions[potentialBaseCode];
          const baseIsBareAlias = !!baseCodeDef && baseCodeDef.codeString !== undefined
            && !baseCodeDef.isBlissGlyph && !baseCodeDef.isShape
            && !baseCodeDef.isExternalGlyph && !baseCodeDef.glyphCode;
          const misplacedCharIndicator = isTopLevel
            && (baseIsBareAlias || isWordDefinition)
            && filteredIndicators.length > 0;
          if (misplacedCharIndicator) {
            parseWarnings.push({
              code: WARNING_CODES.MISPLACED_CHARACTER_INDICATOR,
              message: `Character indicator (;${filteredIndicators.join(';')}) ignored on "${restorePlaceholders(potentialBaseCode)}": ; composes onto a single character, but this is a word. Use ;; for a word-level indicator.`,
              source: restorePlaceholders(potentialBaseCode),
            });
          }

          // A trailing/empty `;` (no real part: `B291;`, `WORD;`) is inert. It
          // must resolve the BASE definition so the code keeps its identity and
          // metadata (the `;` is normalized away in toString); it is neither a
          // dumb append nor misplaced.
          const isEmptyStrip = rawIndicators.length > 0 && filteredIndicators.length === 0;

          // Use base code lookup for words, a misplaced char indicator (both
          // render the base definition; the misplaced part is dropped), and an
          // inert empty `;` (preserve the base definition's metadata).
          const useBaseCodeLookup = isWordDefinition || misplacedCharIndicator || isEmptyStrip;
          const definition = useBaseCodeLookup
            ? (definitions[potentialBaseCode] || {})
            : codeForLookup.startsWith('XTXT_')
              ? textFallbackDefinitionOf(codeForLookup)
              : (definitions[codeForLookup] || {});

          // If we have a codeString, recursively expand it
          if (definition.codeString) {
            // Strict Indicator Separation: `;` no longer rewrites a definition's
            // baked indicators, so the codeString expands verbatim.
            //
            // X-runs are string-level sugar, so they have to be resolved before
            // the string is read as a sequence of codes. The top-level input is
            // processed on entry; a definition's codeString is a code string in
            // its own right and gets the same treatment here, which is the one
            // point every definition passes through at every nesting depth.
            // The pass is identity for any string without an X-run, and no
            // built-in definition contains one.
            //
            // What is expanded is the code the definition draws: a bracket
            // leading its code string is the definition's own options, which
            // travel with its defaultOptions below. What the read reports is
            // held until the definition is known not to become one named part
            // (below), whose own read in parseParts reports it instead. A code
            // string has a bracket of its own only where it draws one
            // character, and no built-in's does, so the branches returning
            // before that point have nothing held.
            const heldReports = [];
            const { codeString: drawnCodeString, options: ownOptions } = BlissParser.#readDefinition(potentialBaseCode, definition, (report) => heldReports.push(report));
            const codeStringToExpand = processXCodes(drawnCodeString);
            const isBareAlias = BlissParser.#isBareAlias(definition);

            // Built-in single-character codes: skip expansion, let parseParts handle it.
            // This eliminates the flatten-then-unflatten pattern where expand() substitutes
            // a B-code's codeString (e.g. B291 → "S8:0,8") only for a later wrapping patch
            // to reconstruct the nesting. Word codes (codeString with /) must still be
            // expanded here because word decomposition produces multiple glyphs.
            //
            // The definition's own options are not carried to the character:
            // parseParts gives them to the part the code names, so they style
            // what the code draws and never a part added beside it (`REFSQUARE`'s
            // dotted line stays off an indicator, however the indicator is added).
            if (builtInCodes.has(potentialBaseCode)
                && !codeStringToExpand.includes('/')) {
              return [{
                part: str.replace(/;$/, ''),
                _scanCode: potentialBaseCode,
                ...(definition.shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace: true }),
                ...(definition.isIndicator === true && { isIndicator: true }),
                ...(definition.isExternalGlyph && { isExternalGlyph: definition.isExternalGlyph }),
                ...(definition.char && { char: definition.char }),
                ...(definition.kerningRules && { kerningRules: definition.kerningRules }),
                ...(definition.glyphCode && { glyphCode: definition.glyphCode }),
                ...(definition.isBlissGlyph && { isBlissGlyph: definition.isBlissGlyph }),
              }];
            }

            // Handle // in codeString: split into word segments with break markers
            if (codeStringToExpand.includes('//')) {
              const wordSegments = codeStringToExpand.split('//');
              const allParts = [];
              for (let i = 0; i < wordSegments.length; i++) {
                if (i > 0) allParts.push({ part: '', _wordBreak: true });
                const segmentParts = wordSegments[i].split('/')
                  .flatMap(s => expand(s, definitions, false, depth + 1));
                // Rule 2: each //-segment of the codeString is its own
                // word-string; seal its markers into a fragment designation.
                sealFragment(segmentParts, potentialBaseCode);
                allParts.push(...segmentParts);
              }
              // Apply position suffix to first non-break part
              if (positionSuffix && allParts.length > 0) {
                const firstReal = allParts.find(p => !p._wordBreak);
                if (firstReal) {
                  const semiParts = firstReal.part.split(';');
                  if (!WRITTEN_COORDINATE_PATTERN.test(semiParts[0])) {
                    semiParts[0] += positionSuffix;
                  }
                  firstReal.part = semiParts.join(';');
                }
              }
              // Only a bare alias can spell words (`define()` refuses a typed
              // one), so its options go to the parts of every word.
              if (ownOptions) giveAliasOptions(allParts, ownOptions);
              // A char-level option on a multi-word (//) alias is MISPLACED
              // (B4): a character option applies to a single character. Warn +
              // drop at top level; nested expansion keeps its prepend behavior.
              if (optionsPrefix && allParts.length > 0) {
                if (isTopLevel) {
                  reportExtraBrackets();
                  parseWarnings.push({
                    code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                    message: `Character option (${restorePlaceholders(optionsPrefix)}) ignored on "${restorePlaceholders(potentialBaseCode)}": it applies to a single character, but this expands to multiple words. Use ${restorePlaceholders(optionsPrefix)}|| to apply it to the whole content.`,
                    source: restorePlaceholders(potentialBaseCode),
                  });
                } else {
                  allParts[0].part = writtenBrackets + allParts[0].part;
                }
              }
              // A char-level `;`-part on a multi-word (//) alias is MISPLACED
              // (warned up front): render every word and drop the part.
              return allParts;
            }

            // First expand to get all parts (including nested expansions)
            const rawExpandedParts = codeStringToExpand.split('/')
              .flatMap(subStr => expand(subStr, definitions, false, depth + 1));

            // Check if final expansion has multiple glyphs (word vs single-character composite)
            // This covers nested aliases like TestAlias → TestWord1 → H/C
            const isMultiGlyphWord = rawExpandedParts.length > 1;

            const expandedParts = rawExpandedParts.map(expandedSubPart => {
                // Word-break markers carry no glyph identity; pass them through
                // untouched so definition props don't attach and the break
                // survives into final word-chunk crowning.
                if (expandedSubPart._wordBreak) return expandedSubPart;
                // Apply properties from the definition, falling back to existing values
                const isIndicator = definition.isIndicator ?? expandedSubPart.isIndicator;
                const isExternalGlyph = expandedSubPart.isExternalGlyph;
                const kerningRules = definition.kerningRules ?? expandedSubPart.kerningRules;
                const char = expandedSubPart.char;
                // A name of a punctuation mark is that mark, so it pulls in
                // the word space before it as the mark does, unless the
                // definition says otherwise; its save writes the mark itself.
                const shrinksPrecedingWordSpace = definition.shrinksPrecedingWordSpace
                  ?? expandedSubPart.shrinksPrecedingWordSpace;
                // For multi-glyph words, each part keeps its own glyphCode.
                // For single-character composites: outer definition's glyphCode wins
                // (preserves custom glyph identity, e.g., LOVE wrapping B431).
                const glyphCode = isMultiGlyphWord
                  ? expandedSubPart.glyphCode
                  : (definition.glyphCode ?? expandedSubPart.glyphCode);
                const isBlissGlyph = expandedSubPart.isBlissGlyph ?? definition.isBlissGlyph;
                return {
                  part: expandedSubPart.part,
                  ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
                  ...(isIndicator === true && { isIndicator }),
                  ...(isExternalGlyph && { isExternalGlyph }),
                  ...(char && { char }),
                  ...(kerningRules && { kerningRules }),
                  ...(glyphCode && { glyphCode }),
                  ...(isBlissGlyph && { isBlissGlyph }),
                  ...(expandedSubPart._marker && { _marker: true }),
                  ...(expandedSubPart._designation && { _designation: true }),
                  ...(expandedSubPart._frag !== undefined && { _frag: expandedSubPart._frag }),
                  ...(expandedSubPart._scanCode !== undefined && { _scanCode: expandedSubPart._scanCode }),
                  ...(expandedSubPart._aliasCodeName !== undefined && { _aliasCodeName: expandedSubPart._aliasCodeName }),
                  ...(expandedSubPart._aliasPosition !== undefined && { _aliasPosition: expandedSubPart._aliasPosition }),
                  ...(expandedSubPart.partOptions && { partOptions: expandedSubPart.partOptions })
                };
              });

            // A char-level `;`-part on a nested alias that expands past a word
            // break is MISPLACED (warned up front): render the words, drop the
            // part.

            // Rule 2: a definition's codeString is its own word-string.
            // Resolve its written markers now (head resolution rule 4); the
            // call mutates expandedParts in place, so its return is not needed.
            sealFragment(expandedParts, potentialBaseCode);

            // A typed glyph or shape that draws one character is one part
            // named after it, as a built-in is (the branch above): the
            // character holds that part, the part holds what the definition
            // draws and carries the definition's own options, so they style
            // what it draws and never a part added beside it. The token is the
            // code as written here, its character brackets and coordinate
            // included, with the character data the expansion gave it
            // (identity, indicator flag, layout, head designation); parseParts
            // reads the definition again where it builds the part, so nothing
            // the expansion carried for the parts inside rides along. A shape
            // has no glyphCode, so the name it was written as is recorded
            // instead, the identity a lone shape is saved by.
            if (!isBareAlias && !builtInCodes.has(potentialBaseCode) && expandedParts.length === 1) {
              const { partOptions, _aliasCodeName, _aliasPosition, ...character } = expandedParts[0];
              // Drawn inside that one part, a code string fusing two base
              // parts is out of the layout's sight: the name lends only the
              // layout data it sets itself (layoutDefinitionOf).
              if (basePartCountOf(drawnCodeString, definitions) > 1) {
                delete character.isExternalGlyph;
                delete character.char;
                delete character.kerningRules;
                delete character.shrinksPrecedingWordSpace;
                if (definition.kerningRules) character.kerningRules = definition.kerningRules;
                if (definition.shrinksPrecedingWordSpace === true) character.shrinksPrecedingWordSpace = true;
              }
              return [{
                ...character,
                part: str.replace(/;$/, ''),
                ...(definition.isShape && { _aliasCodeName: potentialBaseCode }),
              }];
            }
            for (const report of heldReports) warn?.(report);

            // Strict Indicator Separation: a char-level `;`-part on a multi-glyph
            // word is handled up front -- a real part is MISPLACED and dropped
            // (warned above), a trailing `;` is inert. Either way the head is NOT
            // modified here: the word renders as defined, keeping any baked head
            // indicator. Use `;;` for a word-level indicator.

            // Apply position suffix from outer code (e.g. WORD:2,0) to first glyph's first part
            if (positionSuffix && expandedParts.length > 0) {
              const firstPart = expandedParts[0].part;
              const semiParts = firstPart.split(';');
              // Only add position if the first sub-part doesn't already have coordinates
              if (!WRITTEN_COORDINATE_PATTERN.test(semiParts[0])) {
                semiParts[0] += positionSuffix;
              }
              expandedParts[0].part = semiParts.join(';');
            }

            // The definition's own options (its defaultOptions and the bracket
            // leading its code string) ride to every part it draws, never to a
            // character. Only a bare alias reaches here, or a typed definition
            // a forward reference turned into several characters (define()
            // refuses a typed word).
            if (ownOptions) giveAliasOptions(expandedParts, ownOptions);

            // Prepend options to the first expanded part. A char-level option
            // is valid on a single character only: on an alias expanding to a
            // multi-character word it is MISPLACED (it used to
            // land silently on the FIRST character). Warn + drop at
            // top level; nested expansion keeps its prepend behavior.
            if (optionsPrefix && expandedParts.length > 0) {
              if (isTopLevel && isMultiGlyphWord) {
                // A word expands into several glyph tokens, so the bracket text
                // never reaches the glyph-level peel that reports duplicates.
                // Report them here instead, or a second bracket on a word alias
                // would vanish with nothing said about it.
                reportExtraBrackets();
                parseWarnings.push({
                  code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
                  message: `Character option (${restorePlaceholders(optionsPrefix)}) ignored on "${restorePlaceholders(potentialBaseCode)}": it applies to a single character, but this expands to a word. Use ${restorePlaceholders(optionsPrefix)}|| to apply it to the whole content.`,
                  source: restorePlaceholders(potentialBaseCode),
                });
              } else {
                expandedParts[0].part = writtenBrackets + expandedParts[0].part;
              }
            }

            // A pure single-code rename (a bare alias whose chain bottoms out
            // at a definition with identity: a glyph, an indicator, a shape,
            // an external glyph, or a getPath primitive) dissolves its written
            // name into this expansion, which `preserve` could then never
            // restore. Record it in the rename-recording side channel, extended to
            // character level here. The outermost written name wins (this
            // overwrites an inner frame's recording); a chain ending on a bare
            // alias (multi-code shorthand or an unresolved forward ref)
            // records nothing, so shorthand keeps serializing expanded. The
            // length guard keeps the recording off multi-glyph expansions,
            // where it would mislabel the first glyph.
            if (expandedParts.length === 1 && baseIsBareAlias) {
              const effective = resolveEffectiveDefinition(definition, definitions);
              if (effective && (effective.isIndicator === true
                  || effective.isBlissGlyph || effective.isShape
                  || effective.isExternalGlyph || effective.glyphCode
                  || typeof effective.getPath === 'function')) {
                expandedParts[0]._aliasCodeName = potentialBaseCode;
              } else {
                // Any other chain is read as a part slot reads it, through a
                // link that writes a position for the code it names
                // (`RED:1,0`, `RED:`) or names a letter drawn as text: where it
                // reaches a code with an identity, the name is recorded, with
                // the position its links add, which the saves take off the
                // part's own, so the name is written with what was written
                // where it was used.
                const read = { codeName: potentialBaseCode };
                const { position } = BlissParser.#readThroughRenames(read, definition);
                if (read._aliasCodeName !== undefined) {
                  expandedParts[0]._aliasCodeName = potentialBaseCode;
                  if (position !== undefined) expandedParts[0]._aliasPosition = position;
                }
              }
            }

            return expandedParts;
          }

          // Base case - create object with properties from definition. A
          // character written with a coordinate or `;` parts (`Xa:1`, `Xa;B86`)
          // names no definition as written, so its layout data is read from
          // its base code. Without it a letter was spaced as a Bliss
          // character, a digit lost its kerning and a punctuation mark stopped
          // pulling in the word space, while the builder keeps all three when
          // it gives a character a part or a position, and every save writes
          // this form. A second base part makes another character: the
          // layout, which sees the parts, turns the data off then
          // (basePartCount). Its identity stays with the bare code.
          const layout = Object.hasOwn(definitions, codeForLookup)
            ? definition
            : (layoutDefinitionOf(potentialBaseCode, definitions) ?? definition);
          const isIndicator = definition.isIndicator;
          const isExternalGlyph = layout.isExternalGlyph;
          const kerningRules = layout.kerningRules;
          const char = layout.char;
          const glyphCode = definition.glyphCode;
          const isBlissGlyph = definition.isBlissGlyph;
          const shrinksPrecedingWordSpace = layout.shrinksPrecedingWordSpace;
          // Strict Indicator Separation: `;` dumb-appends, so `str` is kept
          // verbatim (a trailing `;` is normalized away; an invalid appended
          // part such as `!B81` falls through to UNKNOWN_CODE in parseParts).
          return [{
            part: str.replace(/;$/, ''),
            _scanCode: potentialBaseCode,
            ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
            ...(isIndicator === true && { isIndicator }),
            ...(isExternalGlyph && { isExternalGlyph }),
            ...(char && { char }),
            ...(kerningRules && { kerningRules }),
            ...(glyphCode && { glyphCode }),
            ...(isBlissGlyph && { isBlissGlyph })
          }];
        }

        const expandedParts = str.split('/').flatMap(strPart => expand(strPart, definitions));

        // Resolve and crown the head of each final word (head-marker contract)
        crownWordChunks(expandedParts, wordCode);

        return expandedParts;
      }

      const processedGroupCodeString = processXCodes(groupCodeString);
      const expandedGlyphParts = replaceWithDefinition(processedGroupCodeString, blissElementDefinitions);

      // A group option binds to ONE word-group. Bound to an alias whose
      // expansion crosses a word break (a multi-word // alias), there is no
      // single group to carry it -- it used to style only the FIRST word,
      // silently. Warn + drop the bracket + render every word. The written
      // [opts]|a//b form never reaches this gate: a top-level // splits
      // groups BEFORE option parsing, so that bracket binds to group 1 by
      // syntax (the same alias-vs-written split as the character-level gate).
      // The malformed-;; fail path collapses its word breaks, so a
      // fail-rendered unit keeps its bracket (errorSource round-trips it).
      // Two separator kinds span words: a // word break AND an explicit space
      // code between glyphs (an in-alias TSP is
      // not a _wordBreak, but its serialized /TSP/ splits groups on reparse,
      // silently rebinding the bracket to the first word). A separator with
      // inked content on ONE side only (a trailing space or //) does NOT span
      // words: the bracket still binds the only inked word and round-trips
      // stably, so it keeps its option.
      const expansionSpansWords = (parts) => {
        let sawWord = false;
        let sawSeparatorAfterWord = false;
        for (const p of parts) {
          // A part re-splits into its own group on reparse ONLY as a bare
          // space token (the top-level split matches the exact token), so a
          // composed (TSP;B81) or decorated space stays in-group and
          // separates nothing; kerning markers are neither ink nor a
          // separator (they decorate the next glyph). (Matching
          // _scanCode over-classified both.)
          const partCode = p._scanCode ?? (p.part ? p.part.split(';')[0].split(':')[0] : '');
          if (partCode === 'RK' || partCode === 'AK') continue;
          if (p._wordBreak || isSpaceCode(p.part)) {
            if (sawWord) sawSeparatorAfterWord = true;
          } else if (p.part !== '') {
            if (sawSeparatorAfterWord) return true;
            sawWord = true;
          }
        }
        return false;
      };
      if (group.options && expansionSpansWords(expandedGlyphParts)) {
        const written = Object.entries(group.options)
          .map(([k, v]) => v === true ? k : `${k}=${v}`).join(';');
        const aliasSource = restorePlaceholders(groupCodeString);
        parseWarnings.push({
          code: WARNING_CODES.MISPLACED_GROUP_OPTION,
          message: `Group option ([${written}]) ignored on "${aliasSource}": | applies options to a single word, but this expands to multiple words. Use [${written}]|| to apply them to the whole content.`,
          source: aliasSource,
        });
        delete group.options;
      }

      // The kerning marker that currently wins for the next glyph, as
      // { key, value, source }. One value survives per character, so a later
      // marker displaces an earlier one rather than both riding along to a
      // silent tie-break at layout time.
      let pendingKerning;
      // Kerning is the gap before a character, so a marker whose next element
      // is a space has nothing to set. It is reported as the space's
      // decoration, the code every other decoration on a space reports.
      const dropKerningBeforeSpace = (marker) => parseWarnings.push({
        code: WARNING_CODES.MISPLACED_SPACE_DECORATION,
        message: `Kerning is the gap before a character, and a space is not one, so "${marker.source}" was dropped.`,
        source: marker.source,
      });

      for (let { part, shrinksPrecedingWordSpace, isIndicator, isExternalGlyph, char, kerningRules, glyphCode, isBlissGlyph, isHeadGlyph, partOptions, _aliasCodeName, _aliasPosition, _wordBreak, _wordIndicators, _wordError } of expandedGlyphParts) {
        // Lift a word-level fail-render flag onto its enclosing group (mirrors
        // the _wordIndicators lift below). A malformed `;;` makes the whole word
        // invalid; the element reads group.errorCode and collapses it to one
        // placeholder. The flag is static (no `;;` structure survives to
        // re-derive from), so it persists across rebuild; errorSource carries the
        // original string for the toString round-trip.
        if (_wordError) {
          group.errorCode = _wordError.code;
          group.error = _wordError.message;
          group.errorSource = _wordError.source;
        }
        // Lift a word-level indicator overlay onto its enclosing group.
        // The word-level ;; slot is a WORD property owned by the FIRST glyph:
        // the first glyph (group.glyphs still empty) claims it; a later glyph's
        // promoted overlay is dropped + DROPPED_WORD_INDICATOR (first-wins, so
        // `/`-composition matches mergeWithNext). An empty first slot still wins.
        if (_wordIndicators) {
          if (group.glyphs.length === 0) {
            group.wordIndicators = _wordIndicators;
          } else {
            const { codes = [], stripSemantic } = _wordIndicators;
            const dropped = ';;' + (stripSemantic ? '!' : '') + codes.join(';');
            parseWarnings.push({
              code: WARNING_CODES.DROPPED_WORD_INDICATOR,
              message: `Composing glyphs into one word dropped a later glyph's word-level indicator overlay (${dropped}). The word keeps only the first glyph's overlay.`,
              source: dropped,
            });
          }
        }
        // Word break marker from // in bare alias codeString:
        // push current group, add a default space group, start a new group
        if (_wordBreak) {
          if (group.glyphs.length > 0) {
            extractPositionFromOptions(group, parseWarnings, 1);
            parsedGroups.push(group);
          }
          if (pendingKerning) {
            dropKerningBeforeSpace(pendingKerning);
            pendingKerning = undefined;
          }
          parsedGroups.push({ glyphs: [{ parts: [{ codeName: 'SP', _fromSP: true }] }], _isSpaceGroup: true, _spaceIndex: parsedGroups.length });
          group = { glyphs: [] };
          continue;
        }
        if (part === "") continue;

        const glyphObj = {
          parts: [],
          ...(shrinksPrecedingWordSpace === true && { shrinksPrecedingWordSpace }),
          ...(typeof isIndicator === "boolean" && { isIndicator }),
          ...(typeof isExternalGlyph === "boolean" && { isExternalGlyph }),
          ...(typeof char === "string" && { char }),
          ...((kerningRules !== null && kerningRules?.constructor === Object) && { kerningRules }),
          ...(typeof glyphCode === "string" && { glyphCode }),
          ...(isBlissGlyph === true && { isBlissGlyph }),
          ...(isHeadGlyph === true && { isHeadGlyph })
        };

        const kerningMatch = part.match(KERNING_MARKER_PATTERN);
        // A value the grammar reads but no gap can be (RK:1e400, RK:Infinity) is
        // as malformed as one it cannot read, and falls through to that report.
        if (kerningMatch && (kerningMatch[2] === undefined || Number.isFinite(Number(kerningMatch[2])))) {
          const [_, kerningType, kerningValue] = kerningMatch;
          // A bare marker (RK/AK with no `:value`) is absent: it applies no
          // kerning and is not persisted, so it never materializes a default
          // (RK:0/AK:0 on serialization) or collapses the pair gap (a bare AK).
          // Only an explicit value (including :0, the deliberate zero-gap
          // spelling) is kept. Still `continue` so a bare marker is consumed,
          // not misread as an UNKNOWN_CODE.
          if (kerningValue !== undefined) {
            if (pendingKerning) {
              parseWarnings.push({
                code: WARNING_CODES.MULTIPLE_KERNING_VALUES,
                message: `A character takes one kerning value, so "${pendingKerning.source}" is ignored. An option beats an RK:/AK: marker, and the last value written wins.`,
                source: pendingKerning.source,
              });
            }
            pendingKerning = {
              key: kerningType === "RK" ? 'relativeKerning' : 'absoluteKerning',
              value: Number(kerningValue),
              source: part,
            };
          }
          continue;
        }

        // A kerning marker (RK:/AK:) whose value failed the grammar above is a
        // malformed kerning value (RK:abc, RK:., RK:.5.5, RK:1e400, RK:). Warn and
        // drop it — apply no kerning, leaving the next glyph unshifted — rather
        // than letting it fall through as a misleading UNKNOWN_CODE. The ^ anchor
        // keeps a real code that merely contains RK:/AK: (e.g. B86RK:abc) from
        // being mis-read as kerning.
        if (/^(RK|AK):/.test(part)) {
          parseWarnings.push({
            code: WARNING_CODES.MALFORMED_KERNING_VALUE,
            message: `Malformed kerning value "${part}"; the marker is ignored.`,
            source: part,
          });
          continue;
        }

        const markerKerning = pendingKerning;
        pendingKerning = undefined;

        let glyphCodeString = part;
        // The [^\[\]] class keeps the char-option match to ONE bracket token.
        // The old `.*?` class backtracked across `]>…;[` when the lookahead
        // failed, capturing `[a]>CODE;[b]` as one character-option blob —
        // every part before the second bracket was silently eaten.
        //
        // One bracket per scope, so peel them one at a time: the first applies
        // and every later one is invalid syntax that warns and drops, matching
        // what the global and word scopes have always done. Character scope
        // used to report UNKNOWN_CODE and destroy the whole symbol instead,
        // although a valid code sat right after the brackets. The loop stops at
        // a bracket wearing a `>`: that one belongs to the PART scope and is a
        // legal neighbour, which is what tells `[a][b]` from `[a][b]>`.
        let charBracketsSeen = 0;
        let charMatch;
        // Kerning written in the character bracket, in the order and spelling
        // it was written: only what the bracket itself carries outranks a
        // marker.
        let bracketKerning = [];
        while ((charMatch = glyphCodeString.match(/^(\[[^\[\]]*\])(?!>)(.*)/)) !== null) {
          charBracketsSeen++;
          if (charBracketsSeen === 1) {
            const parsedOptions = nonEmpty(
              this.#parseOptions(restorePlaceholders(charMatch[1]), warn, { level: 'character', notation: 'bracket' }));
            bracketKerning = kerningOptionEntries(parsedOptions);
            // Kept only when something remains: a bracket fully emptied by the
            // gate (or written empty) must not leave an options: {} artifact on
            // the glyph -- the gated form's toJSON matches the bare form's.
            if (parsedOptions) glyphObj.options = { ...parsedOptions };
          } else {
            const dropped = restorePlaceholders(charMatch[1]);
            parseWarnings.push({
              code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
              message: `Multiple option brackets on one character: "${dropped}" is ignored. Only the first is applied; combine options in one bracket, e.g. [a;b].`,
              source: dropped,
            });
          }
          glyphCodeString = charMatch[2];
        }

        // Whether this character is a space is known only once its parts are
        // read, and its kerning is settled before the parts report anything,
        // so the reports keep the order they were written in: the parts are
        // read here and their warnings held back until the kerning is done.
        const partWarnings = [];
        glyphObj.parts = BlissParser.#parseParts(glyphCodeString, {
          warn: (warning) => partWarnings.push(warning), restore: restorePlaceholders, partOptions });
        const isSpace = glyphObj.parts.length === 1 && isSpaceGlyph(glyphObj.parts[0].codeName);
        if (isSpace) {
          // A space takes no kerning. The marker is reported on its own, and
          // kerning in the bracket is left as written: the space rule drops
          // the bracket whole and quotes it once, as it does any option on a
          // space, without judging its values.
          if (markerKerning) dropKerningBeforeSpace(markerKerning);
        } else {
          // A bracket option on this character can still displace the marker;
          // resolveKerning settles that.
          if (markerKerning) (glyphObj.options ??= {})[markerKerning.key] = markerKerning.value;
          resolveKerning(glyphObj, markerKerning, bracketKerning, parseWarnings);
        }
        partWarnings.forEach(warn);

        // Land a character-level rename recording on the parsed sole part,
        // where the preserve restore already operates; a space
        // stays canonical (spaces take no custom identity). The recording
        // also rides the glyph itself: a multi-part anatomy or a custom
        // typed-glyph identity (glyphCode) has no part-level carrier, and
        // the serializer's written-name consult restores the
        // written name only for a clean instance of the definition. A letter
        // drawn as text has a glyph code too, but it names the one part
        // itself, so that part carries the recording.
        if (_aliasCodeName && !isSpace) {
          if (glyphObj.parts.length === 1
              && (!glyphObj.glyphCode || builtInCodes.has(glyphObj.glyphCode)
                || glyphObj.glyphCode.startsWith(X_TEXT_FALLBACK_PREFIX))) {
            glyphObj.parts[0]._aliasCodeName = _aliasCodeName;
            if (_aliasPosition !== undefined) glyphObj.parts[0]._aliasPosition = _aliasPosition;
          }
          glyphObj._aliasCodeName = _aliasCodeName;
        }

        extractPositionFromOptions(glyphObj, parseWarnings, 2);
        group.glyphs.push(glyphObj);
      }

      extractPositionFromOptions(group, parseWarnings, 1);
      // A marker still waiting when its word ends stands before a space when
      // anything follows at all (word groups and space groups alternate), and
      // before nothing at the end of the input, where no character takes it.
      if (pendingKerning) {
        if (gi < groupedCodes.length - 1) {
          dropKerningBeforeSpace(pendingKerning);
        } else {
          parseWarnings.push({
            code: WARNING_CODES.MISPLACED_KERNING_OPTION,
            message: `Kerning is the gap before a character, and no character follows "${pendingKerning.source}", so it was dropped.`,
            source: pendingKerning.source,
          });
        }
      }
      parsedGroups.push(group);
    }

    // Step 4: Resolve SP→QSP for space groups before punctuation
    // For implicit spaces (_fromSP): change code to QSP
    // For explicit spaces: compare against default and flag _differsFromDefault
    for (let i = 0; i < parsedGroups.length; i++) {
      const group = parsedGroups[i];
      if (group._isSpaceGroup) {
        // Determine default space code for this position
        const nextGroup = parsedGroups[i + 1];
        const isPunctuation = nextGroup && !nextGroup._isSpaceGroup &&
          (nextGroup.glyphs?.length > 0) &&
          nextGroup.glyphs.every(pullsInWordSpace);
        const defaultCode = isPunctuation ? 'QSP' : 'TSP';

        for (const glyph of group.glyphs) {
          const part = glyph.parts[0];
          if (part._fromSP) {
            // Implicit space: resolve to default
            part.codeName = defaultCode;
          } else {
            // Explicit space: flag if it differs from default
            if (part.codeName !== defaultCode) {
              part._differsFromDefault = true;
            }
          }
          delete part._fromSP;
        }
      }
      // Clean up internal markers
      delete group._isSpaceGroup;
      delete group._spaceIndex;
    }

    result.groups = parsedGroups;

    extractPositionFromOptions(result, parseWarnings, 0);
    if (parseWarnings.length) result._parseWarnings = parseWarnings;
    return result;
  }

  /**
   * Walk a blissObj structure and expand any PARTs that have a codeName
   * but no sub-parts, reading again a name the DSL reads through wherever
   * parts are kept (see #expandPartRecursive). This supports toJSON
   * round-trips where nested parts were stripped, and deep saves, which keep
   * them.
   *
   * A definition's code string is DSL text, so its brackets are read here as
   * the DSL reads them when a string names the definition: at part scope, with
   * a key that cannot act there reported to `warn` and dropped. A saved
   * composition then reports what the string it was saved from reported.
   *
   * @param {Object} blissObj - Raw parsed structure with groups/glyphs/parts
   * @param {(warning: object) => void} [warn] - where a misplaced key is reported
   * @returns {Object} The same object, mutated with expanded parts
   */
  static expandParts(blissObj, warn) {
    if (!blissObj?.groups) return blissObj;
    for (const group of blissObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        for (const [partIndex, part] of glyph.parts.entries()) {
          BlissParser.#expandPartRecursive(part, warn);
          BlissParser.#flagCompositePart(part, partIndex);
        }
      }
    }
    return blissObj;
  }

  /**
   * Re-derive the COMPOSITE_AS_PART flag on every (already-expanded) part of a
   * structure, in place. The flag is position-dependent (a composed alias is a
   * violation only when non-leading), so it must be recomputed whenever the
   * mutation API reassembles a glyph: insertPart parses a new part through an
   * `H;<code>` scaffold (index 1) and may then place it at index 0, and
   * removePart can shift a non-leading part to the leading slot. Unlike
   * expandParts this does not expand, so it is safe to run on every rebuild.
   */
  static reflagCompositeParts(blissObj) {
    if (!blissObj?.groups) return blissObj;
    for (const group of blissObj.groups) {
      if (!group.glyphs) continue;
      for (const glyph of group.glyphs) {
        if (!glyph.parts) continue;
        for (const [partIndex, part] of glyph.parts.entries()) {
          BlissParser.#flagCompositePart(part, partIndex);
        }
      }
    }
    return blissObj;
  }

  /**
   * Flag a non-leading ;-part whose operand is a composed, unflagged alias.
   * `;` is part-merge, so its operands must be PARTS: a primitive, or a flagged
   * reusable definition (an indicator, a type:'glyph', or a type:'shape'). A
   * character/word alias that expands to multiple parts is a higher-level unit;
   * superimposing it as a part would bury its internal structure (e.g. a baked
   * indicator), so it is rejected. The predicate:
   * - index > 0: a leading operand is the base (and the promotion path), not a part;
   * - the part draws several parts (#isComposition).
   * Must run AFTER #applyDefinitionMetadata stamps part.isIndicator. The element
   * layer then fails the whole character to render with a COMPOSITE_AS_PART
   * warning. Run by #parseParts on every part it reads, and by expandParts
   * on a composition object's own parts.
   */
  static #flagCompositePart(part, index) {
    if (index > 0 && BlissParser.#isComposition(part)) {
      part.error = `"${part.codeName}" is a composition and cannot be a part; a ; part must be a primitive or a flagged glyph`;
      part.errorCode = 'COMPOSITE_AS_PART';
    } else if (part.errorCode === 'COMPOSITE_AS_PART') {
      // The flag is position-dependent, so it is authoritative at the CURRENT
      // index: clear a stale one stamped elsewhere. The mutation API parses a
      // new part through an `H;<code>` scaffold (index 1) and may then insert it
      // at index 0; re-evaluation here on rebuild must un-bury it.
      delete part.errorCode;
      delete part.error;
    }
  }

  /**
   * Whether a part draws several parts that nothing with an identity holds:
   * - more than one part of its own: a composition (a primitive or single-code
   *   rename alias holds at most one and stays legal);
   * - a flagged indicator is a part whatever it holds (a built-in compound
   *   indicator such as B85 = B270;B86 or B98 = B97;B99);
   * - so is a flagged glyph or shape: isBlissGlyph / isShape are carried by the
   *   DEFINITION, not stamped onto the part, so they are read from the registry
   *   (this exempts the ~1000 built-in composite characters and custom
   *   type:'glyph'/'shape' definitions);
   * - a part holding exactly one part (a link that places or restyles the code
   *   it names, `MULTI:1,0` or `[color=red]>MULTI`) draws what that part draws,
   *   so it is read through to it.
   */
  static #isComposition(part) {
    let held = part;
    while (held.isIndicator !== true) {
      const def = blissElementDefinitions[held.codeName];
      if (def?.isBlissGlyph === true || def?.isShape === true) return false;
      if (held.parts?.length !== 1) return held.parts?.length > 1;
      [held] = held.parts;
    }
    return false;
  }

  /**
   * Apply the EFFECTIVE definition's metadata after the immediate one: a
   * pure-rename bare alias (single-code codeString, no identity of its own)
   * is transparent, so the resolved target's indicator-ness and anchor
   * metadata must reach the part (GH #35 — indicator-ness carries through an
   * alias). Runs second so explicit part options and the alias's own
   * options keep precedence over the target's. A no-op whenever no
   * rename chain applies (effective === immediate).
   */
  static #applyEffectiveMetadata(part, definition) {
    const effective = resolveEffectiveDefinition(definition, blissElementDefinitions);
    if (effective !== definition) {
      // Read without reporting: the code string that was read for this part
      // has reported already.
      BlissParser.#applyDefinitionMetadata(part, effective, BlissParser.#readDefinition(undefined, effective).options);
    }
  }

  /**
   * Rename a part to the one code its definition draws, when that code has no
   * code string to hold as a part of its own (a primitive, a letter, or a
   * shape drawn by its own function), read as a part slot reads a code
   * (slotCodeOf), so a letter without an outline draws as its text-fallback
   * glyph. The written name is recorded so a `preserve` save can restore it;
   * default output keeps the code drawn.
   *
   * A typed glyph or shape holds what it draws, so the drawn code's own
   * options are this part's too, and win over the definition's own where both
   * set a key, as a held code's options win over its holder's. A bare alias is
   * the code it names instead, and #applyEffectiveMetadata gives it that
   * code's options under the alias's own.
   */
  static #renameToDrawnCode(part, code, definition) {
    const drawnCode = slotCodeOf(code);
    // A name recorded further out (a bare alias read through to this
    // definition) is the one written, and stays.
    part._aliasCodeName ??= part.codeName;
    part.codeName = drawnCode;
    if (BlissParser.#isBareAlias(definition)) return;
    const drawn = blissElementDefinitions[drawnCode];
    const drawnOptions = drawn && BlissParser.#readDefinition(drawnCode, drawn).options;
    if (drawnOptions) part.options = { ...drawnOptions, ...part.options };
  }

  /**
   * Read a part named by a bare alias as the alias written alone expands:
   * through every link of a chain that names one code, each link's options
   * under the ones further out and the part's own bracket over them all, so
   * the outer link wins a key two links set, and a part bracket where the
   * alias is used restyles what it draws. A link may place the code it names
   * (`RED:1,0`). Where the chain reaches a code with an identity of its own
   * (a built-in, a typed definition, a shape drawn by its own function, a
   * letter), the part is that code, placed where the links place it beside
   * the position written where the alias is used, recording the name written
   * and the position the links add for the saves that keep the name, as the
   * alias written alone does. Where it ends at an alias of several codes, the
   * name written is shorthand for the same, so the part keeps it and holds
   * what that alias draws; a link that places its code is then not read
   * through, so the code stays placed where the link holds it. A word is no
   * part, so a rename of one is left as written, to fail as the word does.
   * Returns the definition the part is then read by, and the position the
   * links add, which the caller adds once the part's own position is read.
   */
  static #readThroughRenames(part, definition, warn) {
    const written = part.codeName;
    if (!BlissParser.#isShorthand(definition)
        || processXCodes(finalCodeStringOf(written, blissElementDefinitions) ?? '').includes('/')) {
      return { definition };
    }
    // Walked before any link is read, since where the chain ends decides how
    // far it is read. A link is looked at without a report: it reports where
    // it is read, here or, where the chain stops at it, where the part is
    // read by it.
    const links = [];
    const seen = new Set([written]);
    let code = written;
    let current = definition;
    while (BlissParser.#isShorthand(current)) {
      const link = BlissParser.#linkOf(BlissParser.#readDefinition(code, current).codeString);
      const next = BlissParser.#oneCodeDefinitionOf(link.code);
      if (next === undefined || seen.has(link.code)) break;
      seen.add(link.code);
      links.push({ name: code, definition: current, x: link.x, y: link.y });
      code = link.code;
      current = next;
    }
    if (BlissParser.#isShorthand(current)) {
      const placing = links.findIndex(({ x, y }) => x !== undefined || y !== undefined);
      if (placing !== -1) {
        ({ name: code, definition: current } = links[placing]);
        links.length = placing;
      }
    }
    const position = {};
    for (const { name, definition: link, x, y } of links) {
      const { options } = BlissParser.#readDefinition(name, link, warn);
      if (options) part.options = { ...options, ...part.options };
      // An anchor a link sets itself stays where the code it names sets none,
      // as #applyEffectiveMetadata leaves one.
      for (const axis of ['anchorOffsetX', 'anchorOffsetY']) {
        if (link[axis] !== undefined) part[axis] ??= link[axis];
      }
      // Read as a part's own position is read: an axis no position can be is
      // refused and reported here, where the link is read, and the rest of the
      // link still places the code.
      const at = { x, y };
      const reports = [];
      normalizePositionFields(at, reports);
      for (const report of reports) warn?.(report);
      if (at.x !== undefined) position.x = (position.x ?? 0) + at.x;
      if (at.y !== undefined) position.y = (position.y ?? 0) + at.y;
    }
    if (BlissParser.#isShorthand(current)) return { definition: current };
    part.codeName = code;
    part._aliasCodeName = written;
    if (Object.keys(position).length === 0) return { definition: current };
    part._aliasPosition = position;
    return { definition: current, position };
  }

  // Whether a part named `name` is read through to a code with an identity of
  // its own, as #readThroughRenames reads one: asked of a scratch part, so the
  // links are looked at without a report and nothing is changed.
  static #readsThrough(name) {
    const definition = blissElementDefinitions[name];
    if (!definition) return false;
    const scratch = { codeName: name };
    BlissParser.#readThroughRenames(scratch, definition);
    return scratch._aliasCodeName !== undefined;
  }

  // A link's code string read as one code and the position it places that
  // code at, each axis as written: the link is read where the chain is read
  // through it, which refuses an axis no position can be (`:1e400`) quoting
  // what was written, as parsePartString hands such an axis over. Whether the
  // code is one code is #oneCodeDefinitionOf's to say.
  static #linkOf(codeString) {
    const coordinate = codeString.match(COORD_SUFFIX_PATTERN);
    if (coordinate === null || coordinate.index === 0) return { code: slotCodeOf(codeString) };
    const [x, y] = coordinate[0].slice(1).split(',').map((axis) => (axis === '' ? undefined : axis));
    return { code: slotCodeOf(codeString.slice(0, coordinate.index)), x, y };
  }

  // Place a part read through links that place its code where they place it,
  // beside the position written where the alias is used, axis by axis: an axis
  // neither writes stays unset, so an indicator is still placed for you on it.
  // The part's own position is read first, from both its channels as every
  // route reads them (a bracket's `x` is the position written there, not one
  // displacing the links'); a value no position can be is left for that read
  // to refuse.
  static #placeByLinks(part, position, warn) {
    if (position === undefined) return;
    const reports = [];
    normalizePositionFields(part, reports);
    extractPositionFromOptions(part, reports);
    for (const report of reports) warn?.(report);
    for (const axis of ['x', 'y']) {
      if (position[axis] !== undefined) part[axis] = (part[axis] ?? 0) + position[axis];
    }
  }

  // The definition one code is read by in a part slot, or undefined when the
  // code is not one (it holds a character the DSL reads as structure, which
  // the parser splits on before it looks a name up) or names nothing. A
  // text-fallback glyph has one made for its letters.
  static #oneCodeDefinitionOf(code) {
    if (!SINGLE_CODE_TOKEN.test(code)) return undefined;
    if (code.startsWith(X_TEXT_FALLBACK_PREFIX)) return textFallbackDefinitionOf(code);
    return Object.hasOwn(blissElementDefinitions, code) ? blissElementDefinitions[code] : undefined;
  }

  // A bare alias with a code string: shorthand a part naming it is read
  // through.
  static #isShorthand(definition) {
    return typeof definition.codeString === 'string' && BlissParser.#isBareAlias(definition);
  }

  // A definition with a code string and no identity of its own (no glyph,
  // shape or external-glyph flag, no glyph code): shorthand for what it names.
  static #isBareAlias(definition) {
    return !definition.isBlissGlyph && !definition.isShape
      && !definition.isExternalGlyph && !definition.glyphCode;
  }

  /**
   * Copy definition metadata (its own options, indicator, anchor offsets)
   * onto a part object. Shared by #parseParts and #expandPartRecursive to
   * keep the logic in one place. `options` are the
   * definition's own, as #readDefinition reads them where its code string is
   * read.
   */
  static #applyDefinitionMetadata(part, definition, options) {
    if (options) {
      part.options = { ...options, ...(part.options || {}) };
    }
    const anchor = BlissParser.#anchorOf(definition);
    if (definition.isIndicator) {
      part.isIndicator = true;
      part.width = definition.width ?? 2;
    } else if (anchor.anchorOffsetY !== undefined) {
      part.anchorOffsetY = anchor.anchorOffsetY;
    }
    if (anchor.anchorOffsetX !== undefined) {
      part.anchorOffsetX = anchor.anchorOffsetX;
    }
  }

  /**
   * The anchor a definition places what is added beside it by. A definition
   * that draws one code takes what it does not set itself from that code,
   * axis by axis, so it stands in for the code (as layoutDefinitionOf gives it
   * the code's layout data) and draws as its spelled-out form reloads. A code
   * string of several codes has no single base and keeps the default anchor,
   * as written out it would.
   */
  static #anchorOf(definition, depth = 0) {
    const own = { anchorOffsetX: definition.anchorOffsetX, anchorOffsetY: definition.anchorOffsetY };
    if (typeof definition.codeString !== 'string' || depth >= MAX_RECURSION_DEPTH) return own;
    const code = onlyCodeOf(definition.codeString);
    const held = code !== null && Object.hasOwn(blissElementDefinitions, code) ? blissElementDefinitions[code] : undefined;
    if (!held) return own;
    const inherited = BlissParser.#anchorOf(held, depth + 1);
    return {
      anchorOffsetX: own.anchorOffsetX ?? inherited.anchorOffsetX,
      anchorOffsetY: own.anchorOffsetY ?? inherited.anchorOffsetY,
    };
  }

  /**
   * Recursively expand a single part from its definition's codeString, and
   * give it the definition's metadata as parseParts does, when the part has a
   * codeName and a matching definition. Parts already below a part are taken
   * as they stand, except below a name the DSL reads through to a code with
   * an identity of its own: that name is read again, as a string naming it
   * is, and what sits below it is left aside. A deep save writes there what
   * the name drew, which 1.0.0 wrote as one part per link of its chain. Such
   * a name is read again at any depth among parts taken as they stand, since
   * an alias of several codes can hold one. A definition drawn by its own
   * function (`getPath`) has no codeString to expand, but its defaults still
   * land on the part, where the DSL puts them.
   */
  static #expandPartRecursive(part, warn) {
    if (part.parts?.length > 0) {
      if (!BlissParser.#readsThrough(part.codeName)) {
        for (const held of part.parts) {
          if (held.parts?.length > 0) BlissParser.#expandPartRecursive(held, warn);
        }
        return;
      }
      delete part.parts;
    }
    if (!part.codeName || !blissElementDefinitions[part.codeName]) return;
    const { definition, position } = BlissParser.#readThroughRenames(part, blissElementDefinitions[part.codeName], warn);

    // Read as parseParts reads it: behind the definition's own bracket.
    const { codeString, options } = BlissParser.#readPartDefinition(part.codeName, definition, warn);
    if (codeString) {
      // Skip word-level codeStrings (contain /) — handled by word-as-part decomposition
      if (codeString.includes('/')) return;

      if (codeString.includes(';') || codeString.includes(':')
          || PART_OPTION_CODESTRING.test(codeString)
          || blissElementDefinitions[codeString]?.codeString) {
        part.parts = BlissParser.#parseParts(codeString, { warn });
      } else {
        BlissParser.#renameToDrawnCode(part, codeString, definition);
      }
    }

    BlissParser.#applyDefinitionMetadata(part, definition, options);
    BlissParser.#applyEffectiveMetadata(part, definition);
    BlissParser.#placeByLinks(part, position, warn);
  }

  /**
   * Read a code string's `;` part slots into parts: the one part reader. The
   * DSL reads a character's code string through it, and a composition object
   * the code string of each definition it names, so both read a code string
   * alike. A definition named in a slot has its code string read here again,
   * a level deeper. `warn` takes what a slot reports; `restore` puts back
   * the brackets the DSL tokenized (a definition's code string carries its
   * brackets as written); `partOptions` are the options of the bare alias
   * the DSL expanded the character from, which each of its parts takes.
   */
  static #parseParts(partsString, { warn, restore = (text) => text, partOptions }, depth = 0) {
    if (depth > MAX_RECURSION_DEPTH) throw new Error('Maximum recursion depth exceeded');
    const parts = [];

    // Split on ; (top-level input is placeholder-tokenized here;
    // definition-sourced strings carry RAW brackets). An empty segment
    // is inert (a leading ';' yields an indicator-only glyph, a
    // trailing ';' is normalized away) but still counts as a SEPARATOR:
    // the peel gate uses the raw index, so a bracket after ANY ';' sits
    // in a part slot even when the base is empty (';[opts]B86').
    // #flagCompositePart keeps the filtered index
    // (position among real parts). Word-level ';;' is resolved upstream
    // and never reaches here.
    const segments = partsString.split(';');
    let partIndex = 0;
    for (const [rawIndex, rawPartString] of segments.entries()) {
      if (rawPartString === '') continue;
      let twoPartPartString = rawPartString;
      // Slot 0 is the character's own option position (its bracket was
      // already read, at the glyph level or as a definition's own); a
      // `>`-less bracket in a LATER slot is a misplaced character option:
      // peel one warning per bracket, drop it, and parse the remaining code
      // normally.
      if (rawIndex > 0) {
        // The same empty-option-region tolerance expandSegment applies to
        // slot 0. Without it a bare `>` in a LATER slot failed the whole
        // character, taking the other parts down with it. Slot 0 is not
        // stripped again here: it already was, so `>>B291` still fails.
        // An empty region over an empty slot (`S8;>`) is still an empty
        // slot, and an empty slot is inert, exactly like `S8;`.
        twoPartPartString = twoPartPartString.replace(/^>/, '');
        if (twoPartPartString === '') continue;
        let peeled;
        while ((peeled = twoPartPartString.match(PART_SLOT_CHAR_OPTION_PATTERN)) !== null) {
          warn({
            code: WARNING_CODES.MISPLACED_CHARACTER_OPTION,
            message: `Character option (${restore(peeled[1])}) ignored on "${restore(peeled[3])}": a ; part slot takes part options. Use ${restore(peeled[1])}>${restore(peeled[3])} to style the part.`,
            source: restore(rawPartString),
          });
          twoPartPartString = peeled[3];
        }
      }
      // One PART bracket per slot, same rule and same handling as the
      // character scope above and the two option-region scopes: the first
      // applies, every later one warns and drops. Every slot, slot 0
      // included, since a part bracket is legal there too
      // (`[color=red]>B291`). Without this a doubled part bracket was
      // reported as an unknown code and destroyed the whole character.
      let partBracketsSeen = 0;
      let head = '';
      let partMatch;
      while ((partMatch = twoPartPartString.match(/^(\[[^\[\]]*\])>(.*)$/)) !== null) {
        partBracketsSeen++;
        if (partBracketsSeen === 1) {
          head = `${partMatch[1]}>`;
        } else {
          const dropped = restore(partMatch[1]);
          warn({
            code: WARNING_CODES.MULTIPLE_OPTION_BRACKETS,
            message: `Multiple option brackets on one part: "${dropped}" is ignored. Only the first is applied; combine options in one bracket, e.g. [a;b]>.`,
            source: dropped,
          });
        }
        twoPartPartString = partMatch[2];
      }
      twoPartPartString = head + twoPartPartString;
      const part = BlissParser.parsePartString(twoPartPartString, restore, warn, { level: 'part', notation: 'bracket' });
      if (part.options && Object.keys(part.options).length === 0) delete part.options;
      // The options of the bare alias this character was expanded from,
      // on each of its parts: under a part bracket the alias's code
      // string writes there, and over what the part's own code brings
      // (merged in below), as a link of the chain further in.
      if (depth === 0 && partOptions) part.options = { ...partOptions, ...part.options };

      // A `;`-part slot sits inside a glyph, so the glyph-boundary
      // anchored expansion pass (processXCodes) never sees it: without this, a
      // fallback letter written as a part failed as an unknown code
      // although the same glyph is reachable as `XTXT_λ`, and a run that
      // collapses to one glyph was refused as a word although it is one
      // character. Ask the shared grammar for the one-glyph answer only;
      // a real word still fails here, which is what keeps a run from
      // splitting one glyph across many.
      // The written-token pass reads a routing key as the letters it names
      // (see readTextFallbackKey); this slot has to read it the same way or
      // the two disagree about what one code means. A multi-letter one is
      // then a word here and fails below exactly as `B291;Xhello` does,
      // instead of rendering silently and reloading as that failure.
      if (part.codeName !== undefined) part.codeName = slotCodeOf(part.codeName);

      const { definition, position } = part.codeName?.startsWith('XTXT_')
        ? { definition: textFallbackDefinitionOf(part.codeName) }
        : BlissParser.#readThroughRenames(part, blissElementDefinitions[part.codeName] || {}, warn);
      // The code the definition draws, behind the bracket that leads its
      // code string, which is the definition's own options and so this
      // part's.
      const { codeString, options: ownOptions } = BlissParser.#readPartDefinition(part.codeName, definition, warn);

      if (codeString) {
        if (codeString.includes('/')) {
          // Word codeString at part level: cannot be expanded here.
          // Keep original codeName; post-parse decomposition resolves it.
        } else if (codeString.includes(';') || codeString.includes(':')
            || PART_OPTION_CODESTRING.test(codeString)
            || blissElementDefinitions[codeString]?.codeString ) {
          part.parts = BlissParser.#parseParts(codeString, { warn, restore }, depth + 1);
          // Keep part.codeName to preserve identifier alongside expansion
        } else {
          BlissParser.#renameToDrawnCode(part, codeString, definition);
        }
      }

      // Detect unexpanded multi-char X-codes (word text used as ; part)
      if (WORD_AS_PART_PATTERN.test(part.codeName)) {
        part.error = `Multi-character text "${part.codeName.slice(1)}" is a word and cannot be composed with ;`;
        part.errorCode = 'WORD_AS_PART';
      }

      BlissParser.#applyDefinitionMetadata(part, definition, ownOptions);
      BlissParser.#applyEffectiveMetadata(part, definition);
      BlissParser.#flagCompositePart(part, partIndex);
      partIndex++;

      const reports = [];
      extractPositionFromOptions(part, reports);
      for (const report of reports) warn(report);
      BlissParser.#placeByLinks(part, position, warn);
      parts.push(part);
    }
    return parts;
  }

}
