/**
 * Pins that an option is judged in ONE place on both of its axes: its value, by
 * counting the places the library resolves an option NAME, and the scope it was
 * written at, by counting where the scope table lives and which calls into the
 * admission stage say where their bag is being written.
 *
 * The two go together by construction: no route can store an option without
 * resolving its name first, so a route that resolves a name of its own is a
 * route that decided for itself what becomes of the value. That is the drift
 * this counts. Four routes each deciding separately is what it replaces: a
 * composition object kept everything, the JavaScript channels dropped four
 * kinds in silence, and a definition's defaults kept everything, so one value
 * saved through one channel and reloaded through another changed what it meant.
 *
 * Scope drifted the same way until it moved into the stage: the DSL judged it
 * with a table of its own and every other route skipped it, so a key a bracket
 * reported and dropped was kept by a composition object or a setter and written
 * back out by `toString()`. The table and its judge now sit beside the stage,
 * which judges scope only when a call says where its bag is written, so a call
 * that does not say is that defect again. The calls that carry a bag toward the
 * stage are read hop by hop, and the one that passes no scope is named with its
 * reason.
 *
 * Behavioural rows cannot state this. They can only show that the routes agree
 * TODAY, one input at a time; this states that they cannot disagree, including
 * for a route written years from now by somebody who never read the rule.
 *
 * Covers:
 * - No ingest route resolving an option name for itself.
 * - The one ingest resolution sitting inside the admission stage.
 * - The three resolutions that are not ingest at all, each named: removing an
 *   option by name, clearing a coordinate the same call removes, and refusing a
 *   definition default by the name it would be stored under.
 * - Every ingest route running the stage: the DSL bracket, a composition
 *   object's bags, the JavaScript channels, a definition's `defaultOptions`.
 * - The scope table defined once, beside the stage, its codes written nowhere
 *   else but the parser's one report of a kerning marker no character follows
 *   (a marker's place, not a key's scope) and its one report of a global
 *   option bracket written inside a word (a bracket's place; its keys are
 *   never read), and its judge private to the stage.
 * - Every call carrying a bag toward the stage naming its scope, hop by hop, on
 *   the DSL, definition-expansion, composition-object, setter and handle
 *   routes; the one call that passes none, named with its reason.
 * - That reason checked for every option the library names and every layer
 *   target: a key a bracket refuses below global scope is one `define()`
 *   refuses as a default, so a scope row added without the guard fails here.
 * - That both scans can fail: a route with a resolution added back, a stage
 *   that stopped resolving, a call past the end of the function being read, a
 *   call with no scope, a scope code written outside the table, and a call
 *   nested too deep to read.
 *
 * Does NOT cover:
 * - What the stage decides, and what becomes of a value it refuses, see
 *   `BlissSVGBuilder.refused-value-retention.test.js`.
 * - The wording of each refusal, see `BlissSVGBuilder.text-option-values.test.js`
 *   and `BlissSVGBuilder.option-value-gate.test.js`.
 * - Which route refuses which misplaced key, and what is saved, see
 *   `BlissSVGBuilder.option-scope-admission.test.js`; what a scope refusal says
 *   in each notation, see `BlissSVGBuilder.option-scope-wording.test.js`.
 * - Whether a call names the RIGHT scope, since a scan sees that one is passed,
 *   not which; nor the composition-object walk's descent, which takes each
 *   child's level from the array it descends into rather than from an argument.
 *   The per-level rows in `BlissSVGBuilder.option-scope-admission.test.js` and
 *   the per-method rows in `BlissSVGBuilder.option-scope-wording.test.js` pin
 *   both.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as constantsModule from '../src/lib/bliss-constants.js';
import { BlissSVGBuilder } from '../src/index.js';

const libSource = (file) => readFileSync(resolve(import.meta.dirname, '..', 'src', 'lib', file), 'utf8');

const CONSTANTS = libSource('bliss-constants.js');

const nameResolutions = (text) => (text.match(/canonicalOptionKey\(/g) ?? []).length;

const stageCalls = (text) => (text.match(/admitOptions\(/g) ?? []).length;

const judgeCalls = (text) => (text.match(/\bscopeRefusal\(/g) ?? []).length;

// Every scope refusal of a usable name carries one of these codes, so a route
// judging scope for itself has to write one, whatever it calls its table. (A
// key whose name is refused as well is reported by that refusal, under codes
// the render passes write too, so they cannot be counted here.)
const scopeCodesWritten = (text) =>
  (text.match(/WARNING_CODES\.MISPLACED_(?:GLOBAL|KERNING|LAYER)_OPTION\b/g) ?? []).length;

// One top-level function's body. It ends at the first `};` in the first column,
// which no block nested inside it reaches. Throws when the name is gone, so a
// rename fails loudly rather than counting nothing.
const bodyOf = (text, fn) => {
  const body = text.split(`const ${fn} = `)[1];
  if (body === undefined) throw new Error(`${fn} not found in the source being scanned`);
  return body.split('\n};')[0];
};

const nameResolutionsIn = (text, fn) => nameResolutions(bodyOf(text, fn));

// One static method's body, ending at the first line that closes a block at
// the method's own indent. Throws when the name is gone, as `bodyOf` does.
const methodBodyOf = (text, method) => {
  const body = text.split(`static ${method}(`)[1];
  if (body === undefined) throw new Error(`${method} not found in the source being scanned`);
  return body.split('\n  }')[0];
};

// A callee as a pattern: the `.` of a member call is literal. The `.` is what
// tells a call (`X.#toRaw(`) from its definition (`static #toRaw(`).
const asPattern = (callee) => callee.replaceAll('.', '\\.');

const callCount = (text, callee) => (text.match(new RegExp(`${asPattern(callee)}\\(`, 'g')) ?? []).length;

// The argument text of every call of `callee`. One level of nested parentheses
// is read (`Object.entries(bag)`, `(w) => list.push(w)`), as deep as any call
// scanned here goes. A deeper call is not read at all, so `callCount` disagrees
// and the row fails, rather than the call passing unread.
const callArguments = (text, callee) => [...text.matchAll(
  new RegExp(`${asPattern(callee)}\\(((?:[^()]|\\([^()]*\\))*)\\)`, 'g'),
)].map((match) => match[1]);

// A call says where it writes when its last argument is a scope, or the level
// that becomes one: handed down (`scope`, `level`, a handle's `#scopeLevel`) or
// written in place (a `{ ... notation: ... }` literal, a level's name).
const namesWhereItWrites = (args) =>
  /(?:\bscope|\blevel|#scopeLevel|\{[^{}]*\bnotation:[^{}]*\}|'(?:global|group|character|part)')\s*,?\s*$/.test(args);

const unscopedCalls = (text, callee) => callArguments(text, callee).filter((args) => !namesWhereItWrites(args));

const camelCase = (key) => key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// Every option the library names, in both spellings, and a key for every layer
// target: where a key bound to a scope would come from, now or later.
const OPTION_VOCABULARY = [...new Set([
  ...constantsModule.KNOWN_OPTION_KEYS,
  ...[...constantsModule.KNOWN_OPTION_KEYS].map(camelCase),
  ...Object.keys(constantsModule.KERNING_OPTION_KEYS),
  ...[...constantsModule.LAYER_TARGETS].map((target) => `${target}--opacity`),
])];

// True when a bracket at word, character or part scope drops the key for where
// it was written. Asked of the report, so a scope row with a code of its own
// counts too.
const refusedBelowGlobal = (key) => ['|B291', 'B291', '>B291'].some((site) =>
  new BlissSVGBuilder(`[${key}=1]${site}`).warnings.some(constantsModule.isScopeRefusal));

const refusedAsDefault = (key, code) => BlissSVGBuilder.define({
  [code]: { type: 'glyph', codeString: 'B291', defaultOptions: { [key]: '1' } },
}).errors.length > 0;

describe('BlissSVGBuilder option admission drift', () => {
  describe('when counting the places an option name is resolved', () => {
    it('finds none in the parser, which runs the stage instead', () => {
      expect(nameResolutions(libSource('bliss-parser.js'))).toBe(0);
    });

    it("finds one in the builder, the definition guard's, which refuses a default by the name it is stored under", () => {
      // Not ingest: the guard stores nothing and judges no value, it refuses the
      // definition. It needs the stored name because the typed one can differ:
      // `X` is stored as `x`.
      const builder = libSource('bliss-svg-builder.js');
      expect(nameResolutions(builder)).toBe(1);
      expect(nameResolutions(methodBodyOf(builder, '#assertDefaultOptionsDescribeTheCharacter'))).toBe(1);
    });

    it('finds the one ingest resolution inside the admission stage', () => {
      expect(nameResolutionsIn(CONSTANTS, 'admitOptions')).toBe(1);
    });

    it('accounts for the whole module, so the other resolution is named too', () => {
      // `deleteOptionByName` resolves a name to REMOVE what is stored under it,
      // which is the opposite direction and judges no value.
      expect(nameResolutions(CONSTANTS)).toBe(2);
      expect(nameResolutionsIn(CONSTANTS, 'deleteOptionByName')).toBe(1);
    });

    it('leaves the handle removal path outside the stage', () => {
      // `removeOptions` resolves a name to decide whether it is the coordinate
      // the same call clears. Also a removal, and legitimately its own.
      expect(nameResolutions(libSource('element-handle.js'))).toBe(1);
    });
  });

  describe('when counting the routes that run the admission stage', () => {
    it('finds the DSL bracket running it', () => {
      expect(stageCalls(libSource('bliss-parser.js'))).toBe(1);
    });

    it('finds all three of the builder routes running it', () => {
      // A composition object's bags, the JavaScript channels (the options
      // argument and every mutation setter), and a definition's defaultOptions.
      expect(stageCalls(libSource('bliss-svg-builder.js'))).toBe(3);
    });
  });

  describe("when counting the places a key's scope is judged", () => {
    it('finds the scope table defined once, beside the stage, and its codes written only there', () => {
      expect(CONSTANTS.match(/\bconst SCOPE_BOUND_OPTIONS = /g)).toHaveLength(1);
      expect(scopeCodesWritten(CONSTANTS)).toBe(3);
    });

    it.each(['bliss-svg-builder.js', 'element-handle.js'])(
      'finds %s naming neither the table nor its judge, and writing none of its codes',
      (file) => {
        const text = libSource(file);
        expect(text).not.toMatch(/\b(?:SCOPE_BOUND_OPTIONS|scopeRefusal)\b/);
        expect(scopeCodesWritten(text)).toBe(0);
      },
    );

    it('finds bliss-parser.js naming neither the table nor its judge, and writing only the kerning code for a marker no character follows and the global code for a global bracket inside a word', () => {
      // Where a marker stands is not a key's scope, so the stage has no part in
      // it; the kerning code's rule (no character to be the gap before) covers it.
      // Nor is where a whole `[opts]||` bracket stands: it is left out unread,
      // so no key in it is judged, and only a string can write one.
      const text = libSource('bliss-parser.js');
      expect(text).not.toMatch(/\b(?:SCOPE_BOUND_OPTIONS|scopeRefusal)\b/);
      expect(scopeCodesWritten(text)).toBe(2);
      expect(text).toMatch(/code: WARNING_CODES\.MISPLACED_KERNING_OPTION,\s+message: `Kerning is the gap before a character, and no character follows /);
      expect(text).toMatch(/code: WARNING_CODES\.MISPLACED_GLOBAL_OPTION,\s+message: `Global options "\$\{dropped\}" ignored in the word /);
    });

    it('finds the judge asked by the stage alone, and exported by nothing', () => {
      expect(judgeCalls(CONSTANTS)).toBe(1);
      expect(judgeCalls(bodyOf(CONSTANTS, 'admitOptions'))).toBe(1);
      expect(Object.keys(constantsModule)).not.toContain('scopeRefusal');
      expect(Object.keys(constantsModule)).not.toContain('SCOPE_BOUND_OPTIONS');
    });
  });

  describe('when checking every call toward the stage says where it writes', () => {
    // Each hop is read, not only the stage call: `#toRaw` forwards the `scope`
    // its caller gave it, so a missing one would show at `#toRaw`'s callers.
    it.each([
      ['admitOptions', 'bliss-parser.js'],
      ['.#parseOptions', 'bliss-parser.js'],
      // both part reads: the DSL's part site, and a definition's code string
      // expanded for a composition object
      ['.parsePartString', 'bliss-parser.js'],
      ['.#admitAuthoredBag', 'bliss-svg-builder.js'],
      ['.#toRaw', 'bliss-svg-builder.js'],
      ['.toRaw', 'element-handle.js'],
      ['.#applyDefaultsOverrides', 'element-handle.js'],
    ])('finds every call of %s in %s naming its scope', (callee, file) => {
      const text = libSource(file);
      expect(callCount(text, callee)).toBeGreaterThan(0);
      expect(callArguments(text, callee)).toHaveLength(callCount(text, callee));
      expect(unscopedCalls(text, callee)).toEqual([]);
    });

    it("finds the handle reaching the stage only through the builder's toRaw", () => {
      expect(stageCalls(libSource('element-handle.js'))).toBe(0);
    });

    it("leaves one builder stage call unscoped, the one reading a definition's defaults", () => {
      // The defaults land wherever the definition is used, which this call
      // cannot know, and there is nothing for a scope to judge: `define()`
      // refuses every key bound to one (canvas-wide, target-prefixed, kerning)
      // in `defaultOptions` as an error before this call runs.
      const builder = libSource('bliss-svg-builder.js');
      expect(callArguments(builder, 'admitOptions')).toHaveLength(callCount(builder, 'admitOptions'));
      expect(unscopedCalls(builder, 'admitOptions')).toEqual(['Object.entries(defaultOptions), warn']);
    });

    it('finds that reason true for every option: define() refuses as a default each key a bracket below global scope refuses', () => {
      const bound = OPTION_VOCABULARY.filter(refusedBelowGlobal);
      expect(bound).toEqual(expect.arrayContaining(['margin', 'marginTop', 'relative-kerning', 'relativeKerning', 'background--opacity']));
      // pins the reason the unscoped call above gives; a stage judging that call
      // at part scope instead survived the 2026-09-25 close-gate mutants as
      // equivalent, because of this
      expect(bound.filter((key, index) => !refusedAsDefault(key, `DRIFTDEFAULT${index}`))).toEqual([]);
    });
  });

  describe('when checking the scan can fail', () => {
    it('counts a resolution added back to a route', () => {
      const drifted = `${libSource('bliss-parser.js')}\nconst key = canonicalOptionKey(writtenKey);\n`;
      expect(nameResolutions(drifted)).toBe(1);
    });

    it('counts a stage that stopped resolving as none', () => {
      expect(nameResolutionsIn('const admitOptions = (entries) => {\n  return [];\n};\n', 'admitOptions')).toBe(0);
    });

    it('stops at the end of the function it was asked about', () => {
      const past = 'const admitOptions = (entries) => {\n  return canonicalOptionKey(entries);\n};\n'
        + 'const elsewhere = (key) => canonicalOptionKey(key);\n';
      expect(nameResolutionsIn(past, 'admitOptions')).toBe(1);
    });

    it('stops at the end of the method it was asked about', () => {
      const past = '  static #guard(key) {\n    if (key) {\n      return canonicalOptionKey(key);\n    }\n  }\n'
        + '  static #other(key) {\n    return canonicalOptionKey(key);\n  }\n';
      expect(nameResolutions(methodBodyOf(past, '#guard'))).toBe(1);
    });
  });

  describe('when checking the scope scan can fail', () => {
    it('finds a call that passes no scope', () => {
      const drifted = `${libSource('element-handle.js')}\n    const raw = this.#ctx.toRaw(opts ?? {});\n`;
      expect(unscopedCalls(drifted, '.toRaw')).toEqual(['opts ?? {}']);
    });

    it('finds a scope code written outside the table', () => {
      const drifted = `${libSource('bliss-parser.js')}\n  code: WARNING_CODES.MISPLACED_LAYER_OPTION,\n`;
      expect(scopeCodesWritten(drifted)).toBe(scopeCodesWritten(libSource('bliss-parser.js')) + 1);
    });

    it('reads a call written across several lines, trailing comma included', () => {
      const call = "X.#toRaw(\n  opts,\n  (w) => list.push(w),\n  { level: 'part', notation: 'setter' },\n);";
      expect(callArguments(call, '.#toRaw').map(namesWhereItWrites)).toEqual([true]);
    });

    it('reads no argument list for a call nested too deep, so the count disagrees', () => {
      const deep = 'X.#toRaw(wrap(inner(opts)), warn, scope);';
      expect(callArguments(deep, '.#toRaw')).toEqual([]);
      expect(callCount(deep, '.#toRaw')).toBe(1);
    });

    it('lists the constants module exports, so an exported judge would show', () => {
      expect(Object.keys(constantsModule)).toContain('isScopeRefusal');
      expect(Object.keys(constantsModule)).toContain('admitOptions');
    });
  });
});
