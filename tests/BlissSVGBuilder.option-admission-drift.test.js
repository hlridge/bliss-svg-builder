/**
 * Pins that an option value is judged in ONE place, by counting the places the
 * library resolves an option NAME.
 *
 * The two go together by construction: no route can store an option without
 * resolving its name first, so a route that resolves a name of its own is a
 * route that decided for itself what becomes of the value. That is the drift
 * this counts. Four routes each deciding separately is what it replaces: a
 * composition object kept everything, the JavaScript channels dropped four
 * kinds in silence, and a definition's defaults kept everything, so one value
 * saved through one channel and reloaded through another changed what it meant.
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
 * - That the scan can fail, on three fixtures: a route with a resolution added
 *   back, a stage that stopped resolving, and a call past the end of the
 *   function being read.
 *
 * Does NOT cover:
 * - What the stage decides, and what becomes of a value it refuses, see
 *   `BlissSVGBuilder.refused-value-retention.test.js`.
 * - The wording of each refusal, see `BlissSVGBuilder.text-option-values.test.js`
 *   and `BlissSVGBuilder.option-value-gate.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const libSource = (file) => readFileSync(resolve(import.meta.dirname, '..', 'src', 'lib', file), 'utf8');

const CONSTANTS = libSource('bliss-constants.js');

const nameResolutions = (text) => (text.match(/canonicalOptionKey\(/g) ?? []).length;

const stageCalls = (text) => (text.match(/admitOptions\(/g) ?? []).length;

// The same count narrowed to one top-level function. Its body ends at the first
// `};` in the first column, which no block nested inside it reaches. Throws
// when the name is gone, so a rename fails loudly rather than counting nothing.
const nameResolutionsIn = (text, fn) => {
  const body = text.split(`const ${fn} = `)[1];
  if (body === undefined) throw new Error(`${fn} not found in the source being scanned`);
  return nameResolutions(body.split('\n};')[0]);
};

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

    it('finds all three of the builder routes running it, and no fourth', () => {
      // A composition object's bags, the JavaScript channels (the options
      // argument and every mutation setter), and a definition's defaultOptions.
      // The JavaScript channel calls it twice: once for the bag, and once for
      // the option a shorthand stands for (`autoVertical` means a `crop`),
      // which is bound to a scope where the shorthand's own name is not.
      expect(stageCalls(libSource('bliss-svg-builder.js'))).toBe(4);
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
});
