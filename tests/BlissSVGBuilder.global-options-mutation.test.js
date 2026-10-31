import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the builder's own `setOptions()` and `removeOptions()`: they change the
 * global options after construction, the ones `toString()` writes in `[...]||`,
 * exactly as writing them in that bracket or passing them to the constructor
 * would have.
 *
 * Covers:
 * - The documented example, step by step, in the saved string and in
 *   `toJSON().options`, and both methods returning the builder.
 * - Byte-identical `svgCode`, `toString()`, `toJSON()` and warnings against
 *   the global bracket and against the constructor's options argument, over
 *   a spread of key kinds: global-only, cascading, a layer key, `<svg>`
 *   attributes, a position, an effect, the global link, a background and the
 *   grid shift.
 * - Repeated calls merging key by key, the last value winning and a key
 *   keeping its place in the bracket; an empty object and no argument
 *   changing nothing.
 * - The refusals and reports the constructor's argument gets (kerning, a
 *   value with no text form, two spellings of one name), listed after the
 *   composition's own reports as a mutation's are, and a `TypeError` for
 *   options that are not an object, with nothing changed.
 * - `key`, which names the composition's root and is not saved.
 * - `removeOptions` with several names, none, and a name not set; the
 *   composition's position under either axis name, whichever way it was
 *   written; a name that is not a string throwing before anything is
 *   removed; the last name leaving the empty bag every composition exports.
 * - A transient value still drawn over a value set here, and kept when
 *   `removeOptions` takes that value off.
 * - Handles taken before a call still working after it, and
 *   `clearAllOptions()` clearing what a call set.
 *
 * Does NOT cover:
 * - `{ defaults, overrides }` against a position or a colour the composition
 *   already has, see `BlissSVGBuilder.option-layer-positions.test.js`.
 * - How `removeOptions` reads a name's spelling, see
 *   `BlissSVGBuilder.option-removal-naming.test.js`.
 * - The wording of each report, and of the one that sends a key to
 *   `builder.setOptions()`, see `BlissSVGBuilder.option-scope-wording.test.js`.
 * - The transient pair itself, see `BlissSVGBuilder.transient-options.test.js`.
 */

// A builder made from `start`, after `mutate` has run on it.
const after = (start, mutate) => {
  const builder = new BlissSVGBuilder(start);
  mutate(builder);
  return builder;
};

// Everything a caller can read off a builder, the export as its bytes.
const readout = (builder) => ({
  saved: builder.toString(),
  json: JSON.stringify(builder.toJSON()),
  svg: builder.svgCode,
  warnings: builder.warnings,
});

// Asserts a builder saves as `expected` and exports, draws and reports as a
// builder made from that string. The export is compared as data, since a
// composition object's export keeps the key order the object was written in.
const expectSavedAs = (built, expected) => {
  const fromString = new BlissSVGBuilder(expected);
  expect(built.toString()).toBe(expected);
  expect(built.toJSON()).toEqual(fromString.toJSON());
  expect(built.svgCode).toBe(fromString.svgCode);
  expect(built.warnings).toEqual(fromString.warnings);
};

const reports = (builder) => builder.warnings.map(({ code, source }) => ({ code, source }));

const objectWithH = (fields) => ({ ...fields, groups: [{ glyphs: [{ parts: [{ codeName: 'H' }] }] }] });

describe('BlissSVGBuilder global options mutation', () => {
  describe('when the documented example runs', () => {
    it('saves and exports each step as the global bracket would', () => {
      const builder = new BlissSVGBuilder('[color=red]||B313');

      builder.setOptions({ color: 'blue', grid: true });
      expect(builder.toString()).toBe('[color=blue;grid]||B313');
      expect(builder.toJSON().options).toEqual({ color: 'blue', grid: true });

      builder.removeOptions('color');
      expect(builder.toString()).toBe('[grid]||B313');
      expect(builder.toJSON().options).toEqual({ grid: true });

      builder.removeOptions('grid');
      expect(builder.toString()).toBe('B313');
      expect(builder.toJSON().options).toEqual({});
    });

    it('returns the builder from both methods, so calls chain', () => {
      const builder = new BlissSVGBuilder('B313');
      expect(builder.setOptions({ color: 'red' })).toBe(builder);
      expect(builder.removeOptions('color')).toBe(builder);
    });
  });

  describe('when a call sets what the bracket or the constructor would', () => {
    // Each key here was checked to change the drawing against the same input
    // without it, so a call that dropped it could not match the bracket.
    it.each([
      ['a global-only option', 'margin=4', { margin: 4 }],
      ['a switch', 'grid', { grid: true }],
      ['a cascading colour', 'color=red', { color: 'red' }],
      ['a cascading stroke width', 'stroke-width=0.8', { strokeWidth: 0.8 }],
      ['a layer key', 'grid;grid--opacity=0.3', { grid: true, 'grid--opacity': 0.3 }],
      ['an attribute of your own', 'data-x=abc', { 'data-x': 'abc' }],
      ['an attribute a standard owns', 'viewBox="0 0 10 10"', { viewBox: '0 0 10 10' }],
      ['a position', 'x=5;y=2', { x: 5, y: 2 }],
      ['an effect', 'filter=blur(1px)', { filter: 'blur(1px)' }],
      ['the global link', 'href=https://blissary.com', { href: 'https://blissary.com' }],
      ['a background', 'background=yellow', { background: 'yellow' }],
      ['the grid shift', 'grid;grid-shift=0.5', { grid: true, gridShift: 0.5 }],
    ])('matches both, byte for byte, for %s', (_kind, bracket, opts) => {
      const set = after('B313', (b) => b.setOptions(opts));
      expect(readout(set)).toEqual(readout(new BlissSVGBuilder(`[${bracket}]||B313`)));
      expect(readout(set)).toEqual(readout(new BlissSVGBuilder('B313', opts)));
    });
  });

  describe('when calls repeat', () => {
    it('merges key by key, the last value winning and each key keeping its place', () => {
      const builder = after('[color=red;grid]||H', (b) => b.setOptions({ margin: 2 }).setOptions({ color: 'blue' }));
      expect(builder.toString()).toBe('[color=blue;grid;margin=2]||H');
    });

    it.each([
      ['an empty object', {}],
      ['no argument', undefined],
      ['null', null],
    ])('changes nothing for %s', (_kind, opts) => {
      const builder = after('[color=red]||H', (b) => b.setOptions(opts));
      expect(readout(builder)).toEqual(readout(new BlissSVGBuilder('[color=red]||H')));
    });
  });

  describe('when a key is refused or reported', () => {
    it.each([
      ['kerning', { relativeKerning: 3 }, 'H', [{ code: 'MISPLACED_KERNING_OPTION', source: 'relative-kerning=3' }]],
      ['a value with no text form', { color: () => 1 }, 'H', [{ code: 'INVALID_OPTION_VALUE', source: 'color=() => 1' }]],
      ['two spellings of one name', { marginTop: 3, 'margin-top': 4 }, '[margin-top=4]||H',
        [{ code: 'MULTIPLE_OPTION_SPELLINGS', source: 'marginTop=3' }]],
    ])('reports %s as the constructor does, and saves what it keeps', (_case, opts, saved, expected) => {
      const set = after('H', (b) => b.setOptions(opts));
      expect(set.toString()).toBe(saved);
      expect(reports(set)).toEqual(expected);
      expect(set.warnings).toEqual(new BlissSVGBuilder('H', opts).warnings);
    });

    // A one-time mutation report, so it follows the composition's own reports,
    // where the constructor's argument, which arrives with the composition,
    // lists its report first.
    it('lists its report after the composition\'s own, as an element\'s setOptions does', () => {
      const set = after('ZZ9', (b) => b.setOptions({ relativeKerning: 3 }));
      expect(set.warnings.map(({ code }) => code)).toEqual(['UNKNOWN_CODE', 'MISPLACED_KERNING_OPTION']);
    });

    it.each([
      ['a string', 'color=blue'],
      ['a number', 5],
      ['an array', [{ color: 'blue' }]],
    ])('throws a TypeError for %s and changes nothing', (_kind, opts) => {
      const builder = new BlissSVGBuilder('[color=red]||H');
      expect(() => builder.setOptions(opts)).toThrow(TypeError);
      expect(() => builder.setOptions(opts)).toThrow('setOptions() options must be an object');
      expect(builder.toString()).toBe('[color=red]||H');
    });
  });

  describe('when a call names the composition by key', () => {
    it('names the root snapshot and saves nothing of it', () => {
      const builder = after('H', (b) => b.setOptions({ key: 'abc' }));
      expect(builder.snapshot().key).toBe('abc');
      expect(builder.toString()).toBe('H');
      expect(builder.toJSON()).toEqual(new BlissSVGBuilder('H').toJSON());
    });
  });

  describe('when removeOptions takes options off', () => {
    it('removes several names in one call', () => {
      const builder = after('[color=red;grid;margin=2]||H', (b) => b.removeOptions('color', 'margin'));
      expect(builder.toString()).toBe('[grid]||H');
    });

    it.each([
      ['no name', []],
      ['a name that is not set', ['stroke-width']],
    ])('changes nothing for %s', (_kind, keys) => {
      const builder = after('[color=red]||H', (b) => b.removeOptions(...keys));
      expect(readout(builder)).toEqual(readout(new BlissSVGBuilder('[color=red]||H')));
    });

    it.each([
      ['x, written in the bracket', () => new BlissSVGBuilder('[x=5;y=2]||H'), 'x', '[y=2]||H'],
      ['X, written in the bracket', () => new BlissSVGBuilder('[x=5;y=2]||H'), 'X', '[y=2]||H'],
      ['y, written in the bracket', () => new BlissSVGBuilder('[x=5;y=2]||H'), 'y', '[x=5]||H'],
      ['x, set by setOptions', () => after('H', (b) => b.setOptions({ x: 5, y: 2 })), 'x', '[y=2]||H'],
      ['x, in a composition object\'s options', () => new BlissSVGBuilder(objectWithH({ options: { x: 5, y: 2 } })), 'x', '[y=2]||H'],
      ['x, on a composition object\'s own field', () => new BlissSVGBuilder(objectWithH({ x: 5, y: 2 })), 'x', '[y=2]||H'],
    ])('takes the composition\'s position off by %s', (_route, build, named, expected) => {
      const builder = build();
      builder.removeOptions(named);
      expectSavedAs(builder, expected);
    });

    it('throws a TypeError for a name that is not a string, before removing any', () => {
      const builder = new BlissSVGBuilder('[color=red;grid]||H');
      expect(() => builder.removeOptions('color', 5)).toThrow(TypeError);
      expect(() => builder.removeOptions('color', 5)).toThrow('removeOptions() option names must be strings');
      expect(builder.toString()).toBe('[color=red;grid]||H');
    });

    it('leaves the empty options bag every composition exports once the last name goes', () => {
      const builder = after('[grid]||H', (b) => b.removeOptions('grid'));
      expect(builder.toString()).toBe('H');
      expect(builder.toJSON()).toEqual(new BlissSVGBuilder('H').toJSON());
      expect(builder.toJSON()).toHaveProperty('options', {});
    });
  });

  describe('when a transient value names the same key', () => {
    it('draws the transient value and saves the one set here', () => {
      const builder = after('H', (b) => b.setTransientOptions({ color: 'blue' }).setOptions({ color: 'red' }));
      expect(builder.toString()).toBe('[color=red]||H');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=blue]||H').svgCode);
    });

    it('keeps drawing the transient value when removeOptions takes the saved one off', () => {
      const builder = after('[color=red]||H', (b) => b.setTransientOptions({ color: 'blue' }).removeOptions('color'));
      expect(builder.toString()).toBe('H');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('[color=blue]||H').svgCode);
    });
  });

  describe('when handles were taken before a call', () => {
    it('keeps a word handle working through both methods', () => {
      const builder = new BlissSVGBuilder('B313//B431');
      const word = builder.group(1);
      builder.setOptions({ color: 'red', grid: true }).removeOptions('grid');
      word.setOptions({ color: 'blue' });
      expect(builder.toString()).toBe('[color=red]||B313//[color=blue]|B431');
    });

    it('keeps finding an element by its key', () => {
      const builder = new BlissSVGBuilder('B313//B431');
      const { key } = builder.groups[1];
      builder.setOptions({ color: 'red' });
      builder.getElementByKey(key).setOptions({ color: 'blue' });
      expect(builder.toString()).toBe('[color=red]||B313//[color=blue]|B431');
    });
  });

  describe('when clearAllOptions runs after a call', () => {
    it('clears what the call set', () => {
      const builder = after('H', (b) => b.setOptions({ color: 'red', grid: true }).clearAllOptions());
      expect(readout(builder)).toEqual(readout(new BlissSVGBuilder('H')));
    });
  });
});
