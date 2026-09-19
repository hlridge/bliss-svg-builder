import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a position arriving as the promoted `x`/`y` FIELD on a composition
 * object is read through the same gate as every other route to a position.
 *
 * The field is the one route object input has that the DSL does not: a DSL
 * coordinate is grammar-gated to digits, so `x` is always a number by the time
 * the parser hands it over. An object literal can put anything there, and
 * `src/index.d.ts` declares `x?: number` at all four scopes, so a non-number is
 * already outside the published type. This file is the runtime half of that
 * declaration.
 *
 * Covers:
 * - A numeric string is read as the number it spells, at all four position
 *   scopes, rather than being concatenated with the parent offset.
 * - A value that cannot be a coordinate is dropped with MALFORMED_COORDINATES
 *   and the composition still renders.
 * - The report names the axis and quotes the value it was handed.
 * - A refused field beside a written option is not also reported as an
 *   overridden position, since it was never going to be used.
 *
 * Does NOT cover:
 * - The OPTIONS-BAG spelling of a position (`{options:{x:'3'}}`), which has had
 *   this gate since before 1.0.0, see
 *   `BlissSVGBuilder.option-value-matrix.test.js`.
 * - The corners the shared predicate accepts as zero (`null`, `[]`, `' '`), a
 *   pre-existing looseness of the options channel this deliberately inherits
 *   rather than tightens; the option channel's own value rules live in
 *   `BlissSVGBuilder.option-value-matrix.test.js`.
 * - A `Symbol` anywhere in the input object, which is refused by the structured
 *   clone the constructor runs before any gate sees it.
 * - How a position SERIALIZES once it is a number, see
 *   `BlissSVGBuilder.part-position-presence.test.js`.
 */

// One composition per position scope, carrying the axis as the promoted field.
// B291 is a plain character; ZSA is the inkless positionable shape, so a part
// position is visible in `toString()` without changing the ink.
const AT_SCOPE = {
  composition: (axis, value) => ({ [axis]: value, groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }] }] }] }),
  word: (axis, value) => ({ groups: [{ [axis]: value, glyphs: [{ parts: [{ codeName: 'B291' }] }] }] }),
  character: (axis, value) => ({ groups: [{ glyphs: [{ [axis]: value, parts: [{ codeName: 'B291' }] }] }] }),
  part: (axis, value) => ({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', [axis]: value }] }] }] }),
};

const written = (scope, axis, value) => new BlissSVGBuilder(AT_SCOPE[scope](axis, value));

const codesOf = (builder) => builder.warnings.map((warning) => warning.code);

// What each scope spells when x is 3, and what it spells when no axis is there.
const X_IS_THREE = {
  composition: '[x=3]||B291',
  word: '[x=3]|B291',
  character: '[x=3]B291',
  part: 'B291;ZSA:3',
};
const NO_AXIS = {
  composition: 'B291',
  word: 'B291',
  character: 'B291',
  part: 'B291;ZSA',
};

const SCOPES = Object.keys(AT_SCOPE);

// Where each scope keeps its position in a saved composition. Read to assert the
// coerced TYPE: at the three outer scopes a string axis used to be emitted into
// the bracket verbatim, so the serialized string looks identical either way and
// only the saved value tells you whether the gate ran.
const SAVED_X = {
  composition: (json) => json.x,
  word: (json) => json.groups[0].x,
  character: (json) => json.groups[0].glyphs[0].x,
  part: (json) => json.groups[0].glyphs[0].parts[1].x,
};

describe('BlissSVGBuilder object-input position gate', () => {
  describe('when a position arrives as a numeric string', () => {
    it.each(SCOPES)('%s scope reads it as the number it spells', (scope) => {
      const builder = written(scope, 'x', '3');
      expect(builder.toString()).toBe(X_IS_THREE[scope]);
      expect(SAVED_X[scope](builder.toJSON())).toBe(3);
      expect(codesOf(builder)).toEqual([]);
    });

    it('does not concatenate a part position with the parent offset', () => {
      // regression: `'3' + 0` in the serializer made `{codeName:'ZSA', x:'3'}`
      // serialize as `ZSA:30`, a silent tenfold move shipped in v1.0.0
      expect(written('part', 'x', '3').toString()).toBe('B291;ZSA:3');
      expect(written('part', 'x', '-2.5').toString()).toBe('B291;ZSA:-2.5');
    });

    it('reads the two axes independently', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: '3', y: '4' }] }] }],
      });
      expect(builder.toString()).toBe('B291;ZSA:3,4');
    });

    it('reads a bigint as the number it holds', () => {
      // pins that the gate coerces before the serializer's `+`, which threw
      // "Cannot convert a BigInt value to a number" out of the constructor
      expect(written('part', 'x', 10n).toString()).toBe('B291;ZSA:10');
    });
  });

  describe('when a position arrives as a value that cannot be a coordinate', () => {
    it.each(SCOPES)('%s scope drops the axis and still renders', (scope) => {
      const builder = written(scope, 'x', 'abc');
      expect(builder.toString()).toBe(NO_AXIS[scope]);
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
    });

    it.each([
      ['a word', 'abc'],
      ['true', true],
      ['an object', {}],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['an empty string', ''],
    ])('drops a part position written as %s', (_label, value) => {
      const builder = written('part', 'x', value);
      expect(builder.toString()).toBe('B291;ZSA');
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
    });

    it('names the axis and quotes the value it was handed', () => {
      const [report] = written('part', 'y', 'abc').warnings;
      expect(report.code).toBe('MALFORMED_COORDINATES');
      expect(report.message).toBe('Malformed position "y=abc"; the position is ignored.');
      expect(report.source).toBe('y=abc');
    });

    it('quotes a boolean as the value it was written as, not as a bare key', () => {
      // pins the field channel apart from the option channel, where `[x]` is a
      // real spelling and `true` is how a bare key is stored
      expect(written('part', 'x', true).warnings[0].source).toBe('x=true');
    });

    it('reports once per refused axis', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: 'abc', y: 'def' }] }] }],
      });
      expect(builder.warnings.map((warning) => warning.source)).toEqual(['x=abc', 'y=def']);
    });

    it('keeps a valid sibling axis', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: 'abc', y: 4 }] }] }],
      });
      expect(builder.toString()).toBe('B291;ZSA:,4');
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
    });

    it('leaves the drawing free of non-finite geometry', () => {
      const svg = written('part', 'x', 'abc').svgCode;
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('Infinity');
    });
  });

  describe('when a position arrives as a number', () => {
    it.each(SCOPES)('%s scope is unchanged', (scope) => {
      const builder = written(scope, 'x', 3);
      expect(builder.toString()).toBe(X_IS_THREE[scope]);
      expect(codesOf(builder)).toEqual([]);
    });

    it('keeps a written zero, which is a position rather than an absence', () => {
      expect(written('part', 'x', 0).toString()).toBe('B291;ZSA:0');
    });
  });

  describe('when a DSL coordinate overflows what a number can hold', () => {
    // The coordinate grammar takes any run of digits, and `Number()` of 309+ of
    // them is Infinity, so the DSL can reach the gate after all. It used to
    // serialize as `ZSA:Infinity,0`, which the same grammar cannot read back.
    const manyNines = '9'.repeat(400);

    it('refuses the axis instead of writing a number nothing can reload', () => {
      const builder = new BlissSVGBuilder(`B291;ZSA:${manyNines},0`);
      expect(builder.toString()).toBe('B291;ZSA:,0');
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
    });

    it('keeps the drawing measurable', () => {
      const svg = new BlissSVGBuilder(`B291;ZSA:${manyNines},0`).svgCode;
      expect(svg).not.toContain('Infinity');
      expect(svg).not.toContain('NaN');
    });

    it('refuses a negative overflow the same way', () => {
      const builder = new BlissSVGBuilder(`B291;ZSA:-${manyNines},0`);
      expect(builder.toString()).toBe('B291;ZSA:,0');
      expect(builder.svgCode).not.toContain('NaN');
    });
  });

  describe('when the position decides another invariant', () => {
    // An indicator written before ordinary content is dropped unless that content
    // was positioned by hand. The gate runs first, so what counts as "positioned"
    // is what survived it, and a refused axis takes the exemption with it.
    const indicatorBeforePart = (x) => new BlissSVGBuilder({
      groups: [{ glyphs: [{ parts: [{ codeName: 'B86' }, { codeName: 'C8', x }] }] }],
    });

    it('lets a coerced position keep the indicator before it', () => {
      const builder = indicatorBeforePart('3');
      expect(builder.toString()).toBe('B86;C8:3');
      expect(codesOf(builder)).toEqual([]);
    });

    it('drops the indicator when the position was refused, and says both things', () => {
      const builder = indicatorBeforePart('abc');
      expect(builder.toString()).toBe('C8');
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES', 'MISPLACED_INDICATOR_PART']);
    });
  });

  describe('when the composition is rebuilt after the position was refused', () => {
    it('reports the refusal once, not once per rebuild', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: 'abc' }] }] }],
      });
      builder.glyph(0).setOptions({ color: 'red' });
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
      expect(builder.toString()).toBe('[color=red]B291;ZSA');
    });
  });

  describe('when an option spells the same axis as the field', () => {
    it('lets a valid option override a valid field', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: 3, options: { x: 5 } }] }] }],
      });
      expect(builder.toString()).toBe('B291;ZSA:5');
      expect(codesOf(builder)).toEqual(['MULTIPLE_POSITION_VALUES']);
    });

    it('does not report a refused field as an overridden position', () => {
      // the field is gone before the override test runs, so there is nothing
      // for the option to displace and nothing to tell the caller it lost
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'ZSA', x: 'abc', options: { x: 5 } }] }] }],
      });
      expect(builder.toString()).toBe('B291;ZSA:5');
      expect(codesOf(builder)).toEqual(['MALFORMED_COORDINATES']);
    });
  });
});
