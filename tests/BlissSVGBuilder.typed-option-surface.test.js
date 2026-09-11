import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlissSVGBuilder } from '../src/index.js';
import {
  KNOWN_OPTION_KEYS,
  INTERNAL_OPTIONS,
  NUMERIC_OPTION_POLICY,
  BOOLEAN_OPTION_KEYS,
  TEXT_OPTION_KEYS,
  programmaticOptionKey,
} from '../src/lib/bliss-constants.js';

/**
 * Pins the two hand-maintained option types in `src/index.d.ts` against the
 * runtime they describe: `BlissOptions` names every option under the spelling
 * the contract gives JavaScript, and `BlissJSON.options` declares every value
 * type `toJSON()` can actually publish.
 *
 * Both are mirrors of runtime facts written by hand, so `tsc` cannot check
 * either one: a declaration that disagrees with the library still compiles, it
 * just lies. The expected row set is DERIVED from `KNOWN_OPTION_KEYS` and
 * `INTERNAL_OPTIONS` rather than restated, so an option added later is required
 * the day it lands; the value union is derived by MEASURING what the library
 * publishes rather than by reading the type back to itself.
 *
 * Covers:
 * - Every curated and internal option appears in `BlissOptions` under its
 *   programmatic spelling, as an exact set (no row missing, none invented).
 * - No `BlissOptions` row carries a kebab spelling, so the flip cannot land
 *   half-done.
 * - `key` is excluded deliberately rather than forgotten.
 * - The open index signature survives, which is what keeps a kebab key
 *   compiling after the flip.
 * - `BlissJSON.options` declares exactly the value types `toJSON()` publishes,
 *   and declares the same union at all four scopes a published bag can sit at.
 *
 * Does NOT cover:
 * - That a kebab key still typechecks, which needs a consumer fixture rather
 *   than a structural read; `pnpm run typecheck` plus the index-signature row
 *   below are what stand in for it.
 * - The `WarningCode` union, see `BlissSVGBuilder.warning-code-parity.test.js`.
 * - Which spelling `toJSON()` publishes a KEY under, see
 *   `BlissSVGBuilder.attribute-naming-contract.test.js`.
 * - Runtime presence of the public API on the built bundle, see
 *   `BlissSVGBuilder.public-surface.dist.test.js`.
 *
 * @contract: attribute-naming
 */
const dtsPath = resolve(import.meta.dirname, '..', 'src', 'index.d.ts');

// Body of a top-level `export interface <name>`. The closing brace is matched
// at column 0, which nested members never reach. Throws rather than returning
// null so a structural rename fails loudly instead of passing vacuously.
const readInterfaceBody = (name) => {
  const text = readFileSync(dtsPath, 'utf8');
  const found = text.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!found) throw new Error(`${name} interface not found in src/index.d.ts`);
  return found[1];
};

// Declared property names of `BlissOptions`. The index signature is written
// `[key: string]:` and carries no `?`, so it never enters this list.
const declaredOptionRows = () =>
  [...readInterfaceBody('BlissOptions').matchAll(/^\s*'?([A-Za-z_$][\w$-]*)'?\?:/gm)].map((m) => m[1]);

// Declared value type of each row, as the set of its union members. A row
// carrying string literals (`crop`) keeps them as members, so a test can ask
// whether `number` is among them without caring what else is.
const declaredOptionTypes = () =>
  new Map(
    [...readInterfaceBody('BlissOptions').matchAll(/^\s*'?([A-Za-z_$][\w$-]*)'?\?:\s*([^;]+);/gm)].map(
      (m) => [m[1], new Set(m[2].split('|').map((member) => member.trim()))],
    ),
  );

// Every string literal any row declares, as [option, literal] pairs. These are
// the values a union promises are legal beyond its plain `number`/`string`.
const declaredStringLiterals = () =>
  [...declaredOptionTypes()].flatMap(([option, members]) =>
    [...members].filter((member) => member.startsWith("'")).map((member) => [option, member.slice(1, -1)]),
  );

// The value type each option actually takes, derived from the runtime families
// the value gate partitions the vocabulary into. `INTERNAL_OPTIONS` carries the
// positions and the kerning markers, all numeric.
const expectedOptionTypes = () => {
  const families = [
    [[...NUMERIC_OPTION_POLICY.keys(), ...INTERNAL_OPTIONS], 'number'],
    [[...BOOLEAN_OPTION_KEYS], 'boolean'],
    [[...TEXT_OPTION_KEYS], 'string'],
  ];
  // `INTERNAL_OPTIONS` holds both spellings of each kerning name, which resolve
  // to one row, so the pairs are deduped rather than asserted twice.
  return [
    ...new Map(
      families.flatMap(([keys, type]) =>
        keys.map(programmaticOptionKey).filter((key) => key !== 'key').map((key) => [key, type]),
      ),
    ),
  ];
};

// Every option name the library curates or reserves, under the spelling the
// contract gives JavaScript. `key` is excluded on purpose: it is honoured only
// as word identity, means nothing at the other three scopes, and is stripped
// from both serializers, so advertising it on the typed surface would teach a
// name the library does not promise. Listed as an open vocabulary question in
// `backlog.md`, not as a gap here.
const expectedOptionRows = () => {
  const rows = new Set([...KNOWN_OPTION_KEYS, ...INTERNAL_OPTIONS].map(programmaticOptionKey));
  rows.delete('key');
  return [...rows].sort();
};

// The value-type union of every `options?: Record<string, …>` inside
// `BlissJSON`, one entry per scope a published bag can sit at.
const declaredJsonValueUnions = () =>
  [...readInterfaceBody('BlissJSON').matchAll(/\boptions\?: Record<string, ([^>]+)>/g)].map((m) =>
    m[1].split('|').map((part) => part.trim()).sort().join(' | '),
  );

// Every value type `toJSON().options` can actually publish, measured across the
// channels that write a bag. The options argument and a bracket stringify; a
// composition object keeps the author's native type; a switch stays boolean.
const publishedValueTypes = () => {
  const composition = (options) => ({
    options,
    groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }],
  });
  const builders = [
    new BlissSVGBuilder('B291', { marginTop: 3 }),
    new BlissSVGBuilder('[margin-top=3]||B291'),
    new BlissSVGBuilder('B291', { grid: true }),
    new BlissSVGBuilder(composition({ marginTop: 1 })),
    new BlissSVGBuilder('[relative-kerning=3]B291'),
  ];
  return [...new Set(builders.flatMap((builder) => optionValueTypes(builder.toJSON())))].sort();
};

// `typeof` of every option value, walking the four scopes a published bag can
// sit at.
const optionValueTypes = (json) => [
  ...Object.values(json.options ?? {}),
  ...(json.groups ?? []).flatMap((group) => [
    ...Object.values(group.options ?? {}),
    ...(group.glyphs ?? []).flatMap((glyph) => [
      ...Object.values(glyph.options ?? {}),
      ...(glyph.parts ?? []).flatMap((part) => Object.values(part.options ?? {})),
    ]),
  ]),
].map((value) => typeof value);

describe('BlissSVGBuilder typed option surface', () => {
  describe('when comparing BlissOptions to the option vocabulary', () => {
    it('declares every curated and internal option under its programmatic spelling', () => {
      expect(declaredOptionRows().sort()).toEqual(expectedOptionRows());
    });

    it('derives a non-empty expectation, so the comparison cannot pass vacuously', () => {
      // pins the derivation itself; a lookup that started answering undefined
      // would otherwise make both sides empty and the row above always green
      expect(expectedOptionRows().length).toBeGreaterThan(40);
      expect(declaredOptionRows()).toContain('strokeWidth');
    });

    it('carries no kebab spelling, so the flip cannot land half-done', () => {
      expect(declaredOptionRows().filter((row) => row.includes('-'))).toEqual([]);
    });

    it('leaves `key` out, which is a deliberate exclusion and not a missing row', () => {
      expect(KNOWN_OPTION_KEYS.has('key')).toBe(true);
      expect(declaredOptionRows()).not.toContain('key');
    });
  });

  describe('when comparing each declared value type to the value the option takes', () => {
    it.each(expectedOptionTypes())('declares %s as taking a %s', (option, type) => {
      // pins the TYPE of each row and not only its name: a row respelled
      // correctly but typed `strokeWidth?: string` passes every naming row
      // above and `tsc` too, while telling a caller that a valid number is a
      // type error. The families come from the value gate's own partition, so
      // an option added later is typed the day it lands.
      expect([...declaredOptionTypes().get(option)]).toContain(type);
    });

    it('covers every declared row by one of the value gate families', () => {
      const typed = new Set(expectedOptionTypes().map(([option]) => option));
      expect(declaredOptionRows().filter((row) => !typed.has(row))).toEqual([]);
    });

    it.each(declaredStringLiterals())('accepts %s = %s, the literal it declares', (option, literal) => {
      // asserting the family type is not enough on its own: a union is free to
      // list a literal the library refuses, and `crop?: … | 'sideways'` passed
      // every row above plus `tsc` while the value gate reported
      // INVALID_OPTION_VALUE on it
      const built = new BlissSVGBuilder('B291', { [option]: literal });
      expect(built.warnings.map((warning) => warning.code)).toEqual([]);
    });

    it('finds the declared literals it claims to check, so the sweep cannot go vacuous', () => {
      expect(declaredStringLiterals().length).toBeGreaterThan(4);
    });

    it('gives the four crop sides one literal vocabulary between them', () => {
      // the sweep above catches a literal the library REFUSES; the reverse, a
      // legal literal dropped from a union, has no runtime authority to derive
      // from, because the crop keywords are inline comparisons in the builder
      // rather than an exported set. Siblings holding each other is what is
      // available without restating that vocabulary here: editing one row and
      // not its three twins goes red. Dropping the same literal from all four
      // stays invisible, and that is stated rather than hidden.
      const types = declaredOptionTypes();
      const sides = ['cropTop', 'cropBottom', 'cropLeft', 'cropRight'].map((side) =>
        [...types.get(side)].sort().join(' | '),
      );
      expect(new Set(sides).size).toBe(1);
      expect(sides[0]).toContain("'auto'");
    });
  });

  describe('when reading the open index signature', () => {
    it('keeps the index signature that lets a kebab key still compile', () => {
      // the flip changes which spelling gets an inline hint, not which
      // spelling typechecks: a kebab key falls back to this signature
      expect(readInterfaceBody('BlissOptions')).toMatch(
        /\[key: string\]: string \| number \| boolean \| undefined;/,
      );
    });
  });

  describe('when comparing BlissJSON.options to what toJSON() publishes', () => {
    it('declares exactly the value types the library publishes, at every scope', () => {
      // every scope, not the first one: reading a single union let a narrowing
      // at any scope but the document pass, and the document one is index 0
      // only by the order the interface happens to be written in
      for (const union of declaredJsonValueUnions()) {
        expect(union.split(' | ')).toEqual(publishedValueTypes());
      }
    });

    it('publishes a number, which is the type the declaration used to omit', () => {
      // the routes are disjoint and each is its own guard: a composition object
      // keeps the author's native type at every scope, and a kerning option
      // promoted onto a character publishes a number where the options
      // argument publishes a string
      expect(publishedValueTypes()).toContain('number');
      expect(publishedValueTypes()).toContain('string');
      expect(publishedValueTypes()).toContain('boolean');
    });

    it('declares the same union at every scope a published bag can sit at', () => {
      const unions = declaredJsonValueUnions();
      expect(unions.length).toBe(4);
      expect(new Set(unions).size).toBe(1);
    });
  });
});
