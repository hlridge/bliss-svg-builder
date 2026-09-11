import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlissSVGBuilder } from '../src/index.js';
import {
  KNOWN_OPTION_KEYS,
  INTERNAL_OPTIONS,
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
    it('declares exactly the value types the library publishes', () => {
      expect(declaredJsonValueUnions()[0].split(' | ')).toEqual(publishedValueTypes());
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
