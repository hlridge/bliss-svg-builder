/**
 * Pins `clearOptions()` on an element and `clearAllOptions()` on the builder:
 * the in-place twins of `omitOptions`, removing what the canonical string
 * writes in brackets and nothing else.
 *
 * Covers:
 * - A word losing its own options and position, and the options inside its
 *   `;;` codes, while its characters keep theirs.
 * - A character losing its options and position but keeping its kerning, and a
 *   custom glyph losing the default its definition gave it.
 * - A part losing its options but keeping its coordinates, where
 *   `removeOptions('x')` still removes one: the documented exception.
 * - What survives: `key`, transient options, a live handle, and no warning when
 *   there is nothing to clear.
 * - The builder-wide clear, the global bracket and a composition position
 *   included.
 * - A part naming a shape defined after the composition was built, whose
 *   definition's options sit in no bag until the clear puts the part's reading
 *   in the tree: cleared, it saves and draws what an early-built one does.
 * - The parity anchor: clearing in place and then saving equals saving the
 *   original with the flag, for both serializers and every combination of
 *   `preserve` and `flattenIndicators`, and the cleared builder draws what its
 *   own save reloads to.
 *
 * Does NOT cover:
 * - Which options each scope drops in the flagged string, see
 *   `BlissSVGBuilder.omit-options.test.js`.
 * - A built-in's own look surviving the clear, see
 *   `BlissSVGBuilder.builtin-own-look.test.js`.
 * - `removeOptions` itself, see `BlissSVGBuilder.option-removal-naming.test.js`
 *   and `BlissSVGBuilder.position-option-removal.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  CO_BASE: { type: 'glyph', codeString: 'B291;C8' },
  CO_REDB: { type: 'glyph', codeString: 'B291', defaultOptions: { color: 'red' } },
  CO_REDIND: { type: 'glyph', isIndicator: true, codeString: 'B81', defaultOptions: { color: 'red' } },
  CO_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  CO_STYGL: { type: 'glyph', codeString: '[color=red]>B291' },
  CO_STYSH: { type: 'shape', codeString: '[color=red]>C8' },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
});

afterAll(() => {
  for (const code of [...Object.keys(FIXTURES), 'CO_LATESH']) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` with every option cleared in place.
const clearedAll = (input) => {
  const builder = new BlissSVGBuilder(input);
  builder.clearAllOptions();
  return builder;
};

// Two builders for `input`, built while `CO_LATESH` is unknown and then left
// holding its bare name when it is defined, as a composition built before its
// shape was defined does. Rows run in any order, so each defines it afresh.
const builtBeforeLateShape = (input) => {
  BlissSVGBuilder.removeDefinition('CO_LATESH');
  const builders = [new BlissSVGBuilder(input), new BlissSVGBuilder(input)];
  const { defined } = BlissSVGBuilder.define({
    CO_LATESH: { type: 'shape', codeString: '[color=red]>C8', defaultOptions: { 'stroke-width': 0.5 } },
  });
  expect(defined).toEqual(['CO_LATESH']);
  return builders;
};

// Every path and transform in the content group, joined, so a styled part drawn
// as a <path> of its own compares equal to the same part merged into its neighbour.
const inkOf = (svg) => [...svg.slice(svg.indexOf('class="bliss-content"')).matchAll(/ (?:d|transform)="([^"]*)"/g)]
  .map((match) => match[1])
  .join('');

const DESIGN_EXAMPLE =
  '[color=red;grid;x=5]||[stroke-width=0.8;x=2]|[color=blue;y=3]B291:1,2;[color=green]>C8:3,4/RK:2/[x=2]B313';

const PARITY_INPUTS = [
  DESIGN_EXAMPLE,
  '[color=red]||B291/B313',
  '[char-space=4;margin=2]||B291/B291',
  '[x=2]|B291/B313',
  'B291;[x=3;color=red]>C8',
  'B313/[relative-kerning=2;color=red]B291',
  '[color=red]B291^/B313',
  '[color=red]Xhello',
  'B291;[color=red]>Xab',
  'B291;;[x=2;color=red]>B81',
  'B291;;CO_REDIND',
  '[color=red]^/B291;;B81',
  'CO_REDB',
  '[color=blue]CO_REDB',
  'B291;CO_SHAPE',
  'CO_STYGL',
  '[color=red]|CO_BASE;;[color=red]>B81',
  'REFSQUARE',
  '[stroke-dasharray=4 4]>REFSQUARE',
  'B291;ANCHORRING',
];
const OPTION_SETS = [
  ['plain', {}],
  ['preserve', { preserve: true }],
  ['flattenIndicators', { flattenIndicators: true }],
  ['preserve and flattenIndicators', { preserve: true, flattenIndicators: true }],
];
const PARITY_ROWS = PARITY_INPUTS.flatMap((input) => OPTION_SETS.map(([label, options]) => [input, label, options]));

describe('BlissSVGBuilder clear options', () => {
  describe('when a word is cleared', () => {
    it('drops the word\'s options, its position and the options inside its ;; codes, and leaves its characters\' own', () => {
      const builder = new BlissSVGBuilder('[color=red;x=2]|B291/[color=blue]B313;;[color=green]>B81');
      builder.group(0).clearOptions();
      expect(builder.toString()).toBe('B291/[color=blue]B313;;B81');
    });

    it('writes a ;; code whose definition carries options out without them', () => {
      const builder = new BlissSVGBuilder('B291;;CO_REDIND');
      builder.group(0).clearOptions();
      expect(builder.toString()).toBe('B291;;B81');
      expect(builder.svgCode).not.toContain('stroke="red"');
    });
  });

  describe('when a character is cleared', () => {
    it('drops its options and position, keeps its kerning, and leaves its parts\' own', () => {
      const builder = new BlissSVGBuilder('B313/[color=red;x=2;relative-kerning=2]B291;[color=blue]>C8');
      builder.glyph(1).clearOptions();
      expect(builder.toString()).toBe('B313/RK:2/B291;[color=blue]>C8');
    });

    it('drops the default a custom glyph\'s definition gave it, and every save follows', () => {
      const builder = new BlissSVGBuilder('CO_REDB');
      builder.glyph(0).clearOptions();
      expect(builder.svgCode).not.toContain('stroke="red"');
      expect(builder.toString()).toBe('B291');
      expect(builder.toString({ preserve: true })).toBe('B291');
    });
  });

  describe('when a part is cleared', () => {
    it('drops its options and keeps its coordinates', () => {
      const builder = new BlissSVGBuilder('B291;[x=3;color=red;data-x=1]>C8');
      builder.glyph(0).part(1).clearOptions();
      expect(builder.toString()).toBe('B291;C8:3');
    });

    it('keeps a coordinate that removeOptions(\'x\') would remove', () => {
      // note: the options methods accept a part's position under its option name,
      // so removing `x` takes the coordinate; clearing takes only what the string
      // writes in brackets, and a coordinate is written outside them
      const cleared = new BlissSVGBuilder('B291;C8:3,4');
      cleared.glyph(0).part(1).clearOptions();
      const removed = new BlissSVGBuilder('B291;C8:3,4');
      removed.glyph(0).part(1).removeOptions('x');
      expect(cleared.toString()).toBe('B291;C8:3,4');
      expect(removed.toString()).toBe('B291;C8:,4');
    });
  });

  describe('when an element is cleared that carries more than options', () => {
    it('keeps its key and its transient options', () => {
      const builder = new BlissSVGBuilder('[color=red]B291');
      builder.glyph(0).setOptions({ key: 'mine' }).setTransientOptions({ color: 'blue' });
      builder.glyph(0).clearOptions();
      expect(builder.getElementByKey('mine')).not.toBeNull();
      expect(builder.svgCode).toContain('stroke="blue"');
      expect(builder.toString()).toBe('B291');
    });

    it('keeps a part\'s transient options', () => {
      const builder = new BlissSVGBuilder('B291;[color=red]>C8');
      builder.glyph(0).part(1).setTransientOptions({ color: 'blue' });
      builder.glyph(0).part(1).clearOptions();
      expect(builder.svgCode).toContain('stroke="blue"');
      expect(builder.toString()).toBe('B291;C8');
    });

    it('returns the same handle, which keeps working', () => {
      const builder = new BlissSVGBuilder('[color=red]B291');
      const handle = builder.glyph(0);
      expect(handle.clearOptions()).toBe(handle);
      handle.setOptions({ color: 'green' });
      expect(builder.toString()).toBe('[color=green]B291');
    });

    it('reports nothing and changes nothing when there is nothing to clear', () => {
      const builder = new BlissSVGBuilder('B291;C8:3,4');
      builder.glyph(0).clearOptions();
      builder.glyph(0).part(1).clearOptions();
      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('B291;C8:3,4');
    });
  });

  describe('when the whole builder is cleared', () => {
    it('drops the global bracket and the composition position with everything else', () => {
      const builder = clearedAll(DESIGN_EXAMPLE);
      expect(builder.toString()).toBe('B291:1,2;C8:3,4/RK:2/B313');
      expect(builder.toJSON().options).toEqual({});
      expect(builder.toJSON().x).toBeUndefined();
    });

    it('returns the builder', () => {
      const builder = new BlissSVGBuilder('[color=red]||B291');
      expect(builder.clearAllOptions()).toBe(builder);
    });

    it('keeps keys and transient options at every scope', () => {
      const builder = new BlissSVGBuilder('[color=red]||[color=red]B291');
      builder.glyph(0).setOptions({ key: 'mine' });
      builder.setTransientOptions({ color: 'blue' });
      builder.clearAllOptions();
      expect(builder.getElementByKey('mine')).not.toBeNull();
      expect(builder.svgCode).toContain('stroke="blue"');
      expect(builder.toString()).toBe('B291');
    });

    it('keeps what was changed inside a shape part', () => {
      // pins that a part already holding its parts is never read back from its
      // name, which would put the definition's inner parts back over the change
      const builder = new BlissSVGBuilder('B291;CO_STYSH');
      builder.glyph(0).part(1).part(0).setOptions({ x: 2 });
      builder.clearAllOptions();
      expect(builder.toString()).toBe('B291;C8:2');
    });
  });

  describe('when a part names a shape defined after the composition was built', () => {
    it.each(OPTION_SETS)('writes what the flagged save of the same builder wrote, under %s', (_label, options) => {
      // pins the expansion the clear makes first: the options that definition
      // brings sit in no bag, only in what every save reads the bare name as,
      // so without it the clear left them written
      // (`B291;[stroke-width=0.5;color=red]>C8:3`)
      const [cleared, original] = builtBeforeLateShape('B291;CO_LATESH:3');
      cleared.clearAllOptions();
      expect(cleared.toString(options)).toBe(original.toString({ ...options, omitOptions: true }));
      expect(cleared.toString(options)).toBe('B291;C8:3');
      expect(cleared.toJSON(options)).toEqual(original.toJSON({ ...options, omitOptions: true }));
    });

    it('saves and draws, once cleared, what a builder built after the definition does', () => {
      const [late] = builtBeforeLateShape('B291;[color=blue]>CO_LATESH');
      const early = new BlissSVGBuilder('B291;[color=blue]>CO_LATESH');
      late.clearAllOptions();
      early.clearAllOptions();
      expect(late.toString({ preserve: true })).toBe(early.toString({ preserve: true }));
      expect(inkOf(late.svgCode)).toBe(inkOf(early.svgCode));
      expect(inkOf(new BlissSVGBuilder(late.toString()).svgCode)).toBe(inkOf(late.svgCode));
    });

    it('writes the part\'s own option over the one the definition brings, as a builder built after the definition does', () => {
      // pins the merge order of the expansion every save of such a part makes
      const [late] = builtBeforeLateShape('B291;[stroke-width=0.8]>CO_LATESH');
      const early = new BlissSVGBuilder('B291;[stroke-width=0.8]>CO_LATESH');
      expect(late.toString()).toBe('B291;[stroke-width=0.8;color=red]>C8');
      expect(early.toString()).toBe('B291;[stroke-width=0.8;color=red]>C8');
    });

    it('clears the part as it clears one built after the definition, leaving what sits inside it', () => {
      // note: the bracket left is the inner part's own, the one the shape's
      // code string writes; the part's own default is what goes
      const [late] = builtBeforeLateShape('B291;[color=blue]>CO_LATESH');
      const early = new BlissSVGBuilder('B291;[color=blue]>CO_LATESH');
      late.glyph(0).part(1).clearOptions();
      early.glyph(0).part(1).clearOptions();
      expect(late.toString()).toBe('B291;[color=red]>C8');
      expect(early.toString()).toBe('B291;[color=red]>C8');
      expect(late.toString({ preserve: true })).toBe(early.toString({ preserve: true }));
    });
  });

  describe('when a builder is cleared in place and the original is saved without options', () => {
    it.each(PARITY_ROWS)('writes the same string for %s under %s', (input, _label, options) => {
      expect(clearedAll(input).toString(options))
        .toBe(new BlissSVGBuilder(input).toString({ ...options, omitOptions: true }));
    });

    it.each(PARITY_ROWS)('writes the same JSON for %s under %s', (input, _label, options) => {
      expect(clearedAll(input).toJSON(options))
        .toEqual(new BlissSVGBuilder(input).toJSON({ ...options, omitOptions: true }));
    });

    it.each(PARITY_ROWS)('draws what its own save of %s under %s reloads to', (input, _label, options) => {
      const builder = clearedAll(input);
      expect(inkOf(new BlissSVGBuilder(builder.toString(options)).svgCode)).toBe(inkOf(builder.svgCode));
    });
  });
});
