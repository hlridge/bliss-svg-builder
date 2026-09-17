import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the ruling that a position is ONE value however it was written, so which
 * spelling entered it is not observable in what you can read, set, remove or
 * export, at any of the four scopes a position can sit at.
 *
 * Kerning is the reference implementation of the same principle at character
 * scope (four spellings, one value, entry method invisible); this file is the
 * position half. The promoted numeric field is the single durable record, and
 * the options bag keeps no second copy, which is what makes the surfaces below
 * agree.
 *
 * Covers:
 * - Every spelling each scope accepts, asserted on the DSL text, on the
 *   exported composition, on removal by name, on replacement by name, and on
 *   the rendered SVG.
 * - A position written as a direct field on the composition object, which used
 *   to render and never serialize, so a save and reload lost it in silence.
 * - A position on a space, reported exactly once whichever spelling carried it,
 *   and quoted back in the spelling its own scope has.
 * - Part scope additionally pins the exported part byte for byte, key order
 *   included.
 *
 * Does NOT cover:
 * - Which value wins when both spellings are written at once
 *   (`MULTIPLE_POSITION_VALUES`), see
 *   `BlissSVGBuilder.positioning-options.test.js`.
 * - That removal stops at the caller's own scope, see
 *   `BlissSVGBuilder.position-option-removal.test.js`.
 * - Whether an axis nobody wrote is emitted at all, see
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
 * - Kerning, the same principle's reference implementation, see
 *   `BlissParser.kerning.test.js`.
 */

const composition = () => ({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }] });

// One table per scope: the spellings that scope accepts, and what the position
// looks like once written, removed and replaced. A scope with no coordinate
// spelling simply has no coordinate row, and composition scope has no handle at
// all, so its table asks nothing about removal or replacement.
const SCOPES = [
  {
    scope: 'part',
    canonical: 'B291;C8:5,0',
    withoutX: 'B291;C8:,0',
    replaced: 'B291;C8:9,0',
    handle: (b) => b.part(1),
    node: (json) => json.groups[0].glyphs[0].parts[1],
    entries: {
      coordinate: () => new BlissSVGBuilder('B291;C8:5,0'),
      'DSL option': () => new BlissSVGBuilder('B291;[x=5;y=0]>C8'),
      'object bag': () => new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'B291' }, { codeName: 'C8', options: { x: 5, y: 0 } }] }] }] }),
      'object field': () => new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'B291' }, { codeName: 'C8', x: 5, y: 0 }] }] }] }),
      API: () => {
        const b = new BlissSVGBuilder('B291;C8');
        b.part(1).setOptions({ x: 5, y: 0 });
        return b;
      },
    },
  },
  {
    scope: 'character',
    canonical: '[x=5;y=0]B291',
    withoutX: '[y=0]B291',
    replaced: '[x=9;y=0]B291',
    handle: (b) => b.glyph(0),
    node: (json) => json.groups[0].glyphs[0],
    entries: {
      'DSL option': () => new BlissSVGBuilder('[x=5;y=0]B291'),
      'object bag': () => new BlissSVGBuilder({ groups: [{ glyphs: [
        { parts: [{ codeName: 'B291' }], options: { x: 5, y: 0 } }] }] }),
      'object field': () => new BlissSVGBuilder({ groups: [{ glyphs: [
        { parts: [{ codeName: 'B291' }], x: 5, y: 0 }] }] }),
      API: () => {
        const b = new BlissSVGBuilder('B291');
        b.glyph(0).setOptions({ x: 5, y: 0 });
        return b;
      },
    },
  },
  {
    scope: 'word',
    canonical: '[x=5;y=0]|B291',
    withoutX: '[y=0]|B291',
    replaced: '[x=9;y=0]|B291',
    handle: (b) => b.group(0),
    node: (json) => json.groups[0],
    entries: {
      'DSL option': () => new BlissSVGBuilder('[x=5;y=0]|B291'),
      'object bag': () => new BlissSVGBuilder({ groups: [
        { glyphs: [{ parts: [{ codeName: 'B291' }] }], options: { x: 5, y: 0 } }] }),
      'object field': () => new BlissSVGBuilder({ groups: [
        { glyphs: [{ parts: [{ codeName: 'B291' }] }], x: 5, y: 0 }] }),
      API: () => {
        const b = new BlissSVGBuilder('B291');
        b.group(0).setOptions({ x: 5, y: 0 });
        return b;
      },
    },
  },
  {
    scope: 'composition',
    canonical: '[x=5;y=0]||B291',
    handle: null,
    node: (json) => json,
    entries: {
      'DSL option': () => new BlissSVGBuilder('[x=5;y=0]||B291'),
      'options argument': () => new BlissSVGBuilder('B291', { x: 5, y: 0 }),
      'object bag': () => new BlissSVGBuilder({ ...composition(), options: { x: 5, y: 0 } }),
      'object field': () => new BlissSVGBuilder({ ...composition(), x: 5, y: 0 }),
    },
  },
];

describe('BlissSVGBuilder position channel symmetry', () => {
  for (const table of SCOPES) {
    describe(`when a ${table.scope} position is written every way that scope accepts`, () => {
      const names = Object.keys(table.entries);

      it.each(names)('%s writes back as the canonical spelling', (name) => {
        expect(table.entries[name]().toString()).toBe(table.canonical);
      });

      it.each(names)('%s exports the position with no option left beside it', (name) => {
        // Two claims: the bag keeps no copy of the position, and the bag is the
        // same one whichever spelling wrote the position. The second is what
        // the ruling is about, and it derives each scope's own empty-bag
        // convention rather than restating it: a composition always carries a
        // bag, the three levels below it carry none until something is in one.
        const bag = table.node(table.entries[name]().toJSON()).options;
        expect(bag?.x).toBeUndefined();
        expect(bag?.y).toBeUndefined();
        expect(bag).toEqual(table.node(table.entries[names[0]]().toJSON()).options);
      });

      it.each(names)('%s draws the same picture', (name) => {
        expect(table.entries[name]().svgCode)
          .toBe(new BlissSVGBuilder(table.canonical).svgCode);
      });

      // Composition scope is read-only after construction: the builder exposes
      // transient options and nothing else, so there is no call to make here
      // rather than an asymmetry to report.
      if (table.handle) {
        it.each(names)('%s gives the position up when the axis is named', (name) => {
          const b = table.entries[name]();
          table.handle(b).removeOptions('x');
          expect(b.toString()).toBe(table.withoutX);
        });

        it.each(names)('%s takes a new value under the axis name', (name) => {
          const b = table.entries[name]();
          table.handle(b).setOptions({ x: 9 });
          expect(b.toString()).toBe(table.replaced);
        });
      }
    });
  }

  describe('when a part is exported', () => {
    // Byte equality including key order, which the per-scope rows above cannot
    // ask for: object input does not stamp the derived `codeName` that the DSL
    // and API routes stamp on a glyph or a word, so those nodes differ for a
    // reason that has nothing to do with position. A part carries no such
    // derived field, so it is the one scope where the whole node converges.
    it.each(Object.keys(SCOPES[0].entries))('%s produces the same part, key order included', (name) => {
      const partOf = (make) => JSON.stringify(make().toJSON().groups[0].glyphs[0].parts[1]);
      expect(partOf(SCOPES[0].entries[name])).toBe(partOf(SCOPES[0].entries.coordinate));
    });
  });

  describe('when a part is serialized with nothing skipping an axis in its bag', () => {
    // The part serializer used to hand its options bag a skip-set for `x` and
    // `y`, because the coordinate suffix had already emitted them. The set is
    // gone: an axis never reaches a part's bag now, so there was nothing left
    // for it to skip. What makes that deletion safe is not the deletion but
    // this row, which pins the condition the set defended against. If an axis
    // does return to a part's bag, the coordinate and an `[x=N]>` prefix both
    // emit and the position doubles; this fails loudly first.
    it.each(['B291;C8:5,0', 'B291;[x=5;y=0]>C8'])('carries no axis in its bag: %s', (input) => {
      const part = new BlissSVGBuilder(input).toJSON().groups[0].glyphs[0].parts[1];
      expect(Object.keys(part.options ?? {})).not.toContain('x');
      expect(Object.keys(part.options ?? {})).not.toContain('y');
      expect(new BlissSVGBuilder(input).toString()).toBe('B291;C8:5,0');
    });
  });

  describe('when a space carries a position', () => {
    const spaceWord = (extra) => ({
      groups: [
        { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
        { glyphs: [{ parts: [{ codeName: 'TSP' }] }], ...extra },
        { glyphs: [{ parts: [{ codeName: 'B291' }] }] },
      ],
    });

    it.each([
      ['an option', 'B291/[x=5]TSP/B291'],
      ['a field', spaceWord({ x: 5 })],
    ])('reports %s exactly once and drops it', (_how, input) => {
      const b = new BlissSVGBuilder(input);
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_SPACE_DECORATION']);
      expect(b.toString()).toBe('B291//B291');
    });

    it.each([
      ['an option', 'B291/[x=5]TSP/B291'],
      ['a field', spaceWord({ x: 5 })],
    ])('quotes %s back in the spelling a word has', (_how, input) => {
      // A word has no `:x,y` suffix, so quoting one back would name a syntax
      // that does not exist at this scope. The part row below is the only one
      // whose scope owns the coordinate spelling.
      expect(new BlissSVGBuilder(input).warnings[0].source).toBe('[x=5]');
    });

    it('reports a position written on a space part once, as a coordinate', () => {
      // Was reported twice: the option arm found the bag copy and the
      // coordinate arm found the promoted field, for one written decoration.
      const b = new BlissSVGBuilder('[x=3]>QSP');
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_SPACE_DECORATION']);
      expect(b.warnings[0].source).toBe(':3');
      expect(b.toString()).toBe('QSP');
    });
  });

  describe('when a position is written as a field on the composition object', () => {
    it.each([
      ['composition', { ...composition(), x: 5 }, '[x=5]||B291'],
      ['word', { groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }], x: 5 }] }, '[x=5]|B291'],
      ['character', { groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }], x: 5 }] }] }, '[x=5]B291'],
    ])('survives a save and reload at %s scope', (_scope, obj, expected) => {
      // Used to render and never serialize, so the position vanished silently
      // the first time a composition was written out and read back.
      const b = new BlissSVGBuilder(obj);
      expect(b.toString()).toBe(expected);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });
});
