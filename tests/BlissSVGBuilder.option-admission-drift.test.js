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
 * stage are read hop by hop, and the two that pass no scope are named with
 * their reasons.
 *
 * Behavioural rows cannot state this. They can only show that the routes agree
 * TODAY, one input at a time; this states that they cannot disagree, including
 * for a route written years from now by somebody who never read the rule.
 *
 * Covers:
 * - No ingest route resolving an option name for itself.
 * - The one ingest resolution sitting inside the admission stage.
 * - The two resolutions that are not ingest at all, each named: removing an
 *   option by name, and clearing a coordinate the same call removes.
 * - Every ingest route running the stage: the DSL bracket, a composition
 *   object's bags, the JavaScript channels, a definition's `defaultOptions`.
 * - The scope table defined once, beside the stage, its codes written nowhere
 *   else, and its judge private to the stage.
 * - Every call carrying a bag toward the stage naming its scope, hop by hop, on
 *   the DSL, composition-object, setter and handle routes; the two calls that
 *   pass none, each named with its reason.
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

const libSource = (file) => readFileSync(resolve(import.meta.dirname, '..', 'src', 'lib', file), 'utf8');

const CONSTANTS = libSource('bliss-constants.js');

const nameResolutions = (text) => (text.match(/canonicalOptionKey\(/g) ?? []).length;

const stageCalls = (text) => (text.match(/admitOptions\(/g) ?? []).length;

const judgeCalls = (text) => (text.match(/\bscopeRefusal\(/g) ?? []).length;

// Every scope refusal carries one of these codes, so a route judging scope for
// itself has to write one, whatever it calls its table.
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

describe('BlissSVGBuilder option admission drift', () => {
  describe('when counting the places an option name is resolved', () => {
    it('finds none in the parser or the builder, which run the stage instead', () => {
      expect(nameResolutions(libSource('bliss-parser.js'))).toBe(0);
      expect(nameResolutions(libSource('bliss-svg-builder.js'))).toBe(0);
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

    it.each(['bliss-parser.js', 'bliss-svg-builder.js', 'element-handle.js'])(
      'finds %s naming neither the table nor its judge, and writing none of its codes',
      (file) => {
        const text = libSource(file);
        expect(text).not.toMatch(/\b(?:SCOPE_BOUND_OPTIONS|scopeRefusal)\b/);
        expect(scopeCodesWritten(text)).toBe(0);
      },
    );

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
      // `define()` refuses a canvas or layer key in `defaultOptions` as an error
      // before this call runs, and a kerning default has no scope yet: it lands
      // wherever the definition is used, which this call cannot know.
      const builder = libSource('bliss-svg-builder.js');
      expect(callArguments(builder, 'admitOptions')).toHaveLength(callCount(builder, 'admitOptions'));
      expect(unscopedCalls(builder, 'admitOptions')).toEqual(['Object.entries(defaultOptions), warn']);
    });

    it("leaves one parser part read unscoped, the one expanding a definition's code string", () => {
      // Reached only through `expandParts`, for a composition object that names
      // a definition; a DSL string expands one through its own part site, which
      // passes a scope. So a key misplaced inside a definition's code string is
      // reported when a string names the definition and kept in silence when an
      // object does: an open gap, tracked in the backlog. This row fails when
      // that gap closes, and is rewritten with it.
      const parser = libSource('bliss-parser.js');
      expect(callArguments(parser, '.parsePartString')).toHaveLength(callCount(parser, '.parsePartString'));
      expect(unscopedCalls(parser, '.parsePartString')).toEqual(['segment']);
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
  });

  describe('when checking the scope scan can fail', () => {
    it('finds a call that passes no scope', () => {
      const drifted = `${libSource('element-handle.js')}\n    const raw = this.#ctx.toRaw(opts ?? {});\n`;
      expect(unscopedCalls(drifted, '.toRaw')).toEqual(['opts ?? {}']);
    });

    it('finds a scope code written outside the table', () => {
      const drifted = `${libSource('bliss-parser.js')}\n  code: WARNING_CODES.MISPLACED_LAYER_OPTION,\n`;
      expect(scopeCodesWritten(drifted)).toBe(1);
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
