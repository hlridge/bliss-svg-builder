/**
 * Pins a definition's options as part of what its code is, for a part named
 * by a definition in a `;` slot: the clears and removals return the part to
 * them instead of stripping them, a `preserve` save writes the name without
 * repeating them, and the view without options keeps them.
 *
 * Covers:
 * - `clearOptions()` on the part, `clearAllOptions()`, and `removeOptions` of
 *   each of the definition's keys in both spellings, on a typed shape and a
 *   typed glyph: the drawing unchanged, the name saved alone, and the default
 *   save unchanged down to the order of its keys.
 * - The `preserve` save writing the name alone and the default save spelling
 *   the definition out with its options as part brackets, options from
 *   `defaultOptions` and from a code string's leading character bracket alike.
 * - `omitOptions` dropping an override written on the part and keeping the
 *   definition's options: the name under `preserve`, spelled out by default.
 * - An override written on the part saved as written, and a clear returning
 *   the part to the definition's options.
 * - A clear stopping at a part named by a definition whose code string styles
 *   the parts inside it.
 * - A word-level (`;;`) code naming a definition: the clears and the view
 *   without options keep its name, and with it the definition's options, so it
 *   draws as the same definition in a `;` slot does; the name under
 *   `preserve`, spelled out by default.
 * - Controls: a `getPath` shape keeps its options when cleared, as it always
 *   has; a key set to `false` saves the `false` in place of the definition's
 *   value; clearing
 *   or removing a key on the one part of a typed shape or an alias written
 *   alone changes nothing; clearing everything equals clearing each element
 *   through its handle, alone and in a slot.
 *
 * Does NOT cover:
 * - A definition written alone, whose options sit on its one part once that is
 *   how it is stored, see `BlissSVGBuilder.definition-is-a-part.test.js`,
 *   `BlissSVGBuilder.alias-options-on-parts.test.js` and
 *   `BlissSVGBuilder.alias-options-kept.test.js`.
 * - A built-in's own look, see `BlissSVGBuilder.builtin-own-look.test.js`.
 * - A change made inside the named part through a deeper handle, see backlog
 *   row "A part saved by its name forgets a change made inside it".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  KO_SHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  KO_DOT: { type: 'glyph', codeString: 'B291', defaultOptions: { 'stroke-dasharray': '0 0.999' } },
  KO_TWO: { type: 'glyph', codeString: '[color=red]>B291;[color=blue]>C8' },
  KO_RED: { type: 'glyph', codeString: '[color=red]B291' },
  KO_FN: { type: 'shape', getPath: () => 'M0,0h4', width: 4, height: 0, defaultOptions: { color: 'red' } },
  KO_IND: { type: 'glyph', isIndicator: true, codeString: 'B81', defaultOptions: { color: 'red' } },
  KO_ALIAS: { codeString: 'B291', defaultOptions: { 'stroke-dasharray': '0 0.999' } },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

describe('BlissSVGBuilder definition options kept', () => {
  describe('when a part named by a definition is cleared or has a key removed', () => {
    it.each([
      ['B291;KO_SHAPE', 'clearing the part', (b) => b.glyph(0).part(1).clearOptions()],
      ['B291;KO_SHAPE', 'clearing everything', (b) => b.clearAllOptions()],
      ['B291;KO_SHAPE', 'removing color', (b) => b.glyph(0).part(1).removeOptions('color')],
      ['B291;KO_SHAPE', 'removing stroke-width', (b) => b.glyph(0).part(1).removeOptions('stroke-width')],
      ['B291;KO_SHAPE', 'removing strokeWidth', (b) => b.glyph(0).part(1).removeOptions('strokeWidth')],
      ['B291;KO_DOT', 'clearing the part', (b) => b.glyph(0).part(1).clearOptions()],
      ['B291;KO_DOT', 'clearing everything', (b) => b.clearAllOptions()],
      ['B291;KO_DOT', 'removing stroke-dasharray', (b) => b.glyph(0).part(1).removeOptions('stroke-dasharray')],
      ['B291;KO_DOT', 'removing strokeDasharray', (b) => b.glyph(0).part(1).removeOptions('strokeDasharray')],
      // control: passes before C23
      ['B291;KO_FN', 'clearing everything', (b) => b.clearAllOptions()],
    ])('keeps the definition\'s options on %s after %s', (input, _label, change) => {
      // note: a definition's options are part of what its code is, like its
      // strokes; the options methods take off only what was written on top
      const builder = changed(input, change);
      expect(builder.svgCode).toBe(new BlissSVGBuilder(input).svgCode);
      expect(builder.toString({ preserve: true })).toBe(input);
      // pins a removed key's value going back where it was (C23 Task 6): put
      // back after the rest, the default save wrote the keys in a new order
      expect(builder.toString()).toBe(new BlissSVGBuilder(input).toString());
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a part named by a definition is saved', () => {
    it.each([
      ['B291;KO_SHAPE', 'B291;[color=blue;stroke-width=0.5]>C8'],
      ['B291;KO_DOT', 'B291;[stroke-dasharray=0 0.999]>B291'],
      // note: the options come from the code string's leading character bracket
      ['KO_RED;B99', '[color=red]>B291;B99'],
      // control: passes before C23
      ['B291;KO_TWO', 'B291;[color=red]>B291;[color=blue]>C8'],
    ])('writes %s by its name alone under preserve, and as %s by default', (input, spelled) => {
      // regression: the preserve save repeated the definition's options as a
      // part bracket on the name
      const builder = new BlissSVGBuilder(input);
      expect(builder.toString({ preserve: true })).toBe(input);
      expect(builder.toString()).toBe(spelled);
      expect(new BlissSVGBuilder(spelled).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when an override on the part is left out by omitOptions', () => {
    it.each([
      ['B291;[color=green]>KO_SHAPE', 'B291;KO_SHAPE', 'B291;[color=blue;stroke-width=0.5]>C8'],
      ['B291;[color=green]>KO_DOT', 'B291;KO_DOT', 'B291;[stroke-dasharray=0 0.999]>B291'],
      ['B291;[color=green]>KO_TWO', 'B291;KO_TWO', 'B291;[color=red]>B291;[color=blue]>C8'],
    ])('saves %s as %s under preserve, and as %s by default', (input, preserved, spelled) => {
      // regression: the view stripped the definition's options with the
      // override, so the part reloaded as a different drawing
      const builder = new BlissSVGBuilder(input);
      const plain = new BlissSVGBuilder(preserved).svgCode;
      expect(builder.toString({ preserve: true, omitOptions: true })).toBe(preserved);
      expect(builder.toString({ omitOptions: true })).toBe(spelled);
      expect(new BlissSVGBuilder(spelled).svgCode).toBe(plain);
    });
  });

  describe('when the definition\'s options are overridden on the part', () => {
    it.each([
      ['B291;KO_SHAPE', 'B291;[color=green;stroke-width=0.5]>C8', 'B291;[color=green]>KO_SHAPE'],
      ['B291;KO_DOT', 'B291;[stroke-dasharray=0 0.999;color=green]>B291', 'B291;[color=green]>KO_DOT'],
    ])('writes the override on %s, as %s by default and %s under preserve', (input, spelled, preserved) => {
      const builder = changed(input, (b) => b.glyph(0).part(1).setOptions({ color: 'green' }));
      expect(builder.toString()).toBe(spelled);
      expect(builder.toString({ preserve: true })).toBe(preserved);
      expect(new BlissSVGBuilder(spelled).svgCode).toBe(builder.svgCode);
      expect(new BlissSVGBuilder(preserved).svgCode).toBe(builder.svgCode);
    });

    it.each(['B291;KO_SHAPE', 'B291;KO_DOT'])('returns %s to the definition\'s options when the override is cleared', (input) => {
      const builder = changed(input, (b) => {
        b.glyph(0).part(1).setOptions({ color: 'green' });
        b.glyph(0).part(1).clearOptions();
      });
      expect(builder.svgCode).toBe(new BlissSVGBuilder(input).svgCode);
      expect(builder.toString({ preserve: true })).toBe(input);
    });

    it('saves a colour set to false in place of the definition\'s colour', () => {
      // control: passes before C23
      // re-pinned at C28 (Task 1): was `B291;[stroke-width=0.5]>C8` from both,
      // when no save wrote `false`; the string now writes it like any override,
      // so the default save spells the shape out with it and `preserve` keeps
      // the name beside it
      const builder = changed('B291;KO_SHAPE', (b) => b.glyph(0).part(1).setOptions({ color: false }));
      expect(builder.svgCode).not.toContain('stroke="blue"');
      expect(builder.toString()).toBe('B291;[color=false;stroke-width=0.5]>C8');
      expect(builder.toString({ preserve: true })).toBe('B291;[color=false]>KO_SHAPE');
      const reloaded = new BlissSVGBuilder(builder.toString()).svgCode;
      expect(reloaded).not.toContain('stroke="blue"');
      expect(reloaded).toBe(builder.svgCode);
    });
  });

  describe('when the one part of a definition written alone is cleared or has a key removed', () => {
    it.each([
      ['KO_SHAPE', 'clearing it', (b) => b.glyph(0).part(0).clearOptions()],
      ['KO_SHAPE', 'removing color', (b) => b.glyph(0).part(0).removeOptions('color')],
      ['KO_ALIAS', 'clearing it', (b) => b.glyph(0).part(0).clearOptions()],
      ['KO_ALIAS', 'removing stroke-dasharray', (b) => b.glyph(0).part(0).removeOptions('stroke-dasharray')],
    ])('leaves %s as it was after %s', (input, _label, change) => {
      // control: passes before C23. The part records the name it was written
      // by, as a part a rename resolved in a `;` slot does, but the record came
      // down from its character, so it brings the part nothing to keep; once
      // a definition written alone keeps its options on its part, the clear
      // has to leave them there instead
      const builder = changed(input, change);
      const untouched = new BlissSVGBuilder(input);
      expect(builder.svgCode).toBe(untouched.svgCode);
      expect(builder.toString()).toBe(untouched.toString());
      expect(builder.toString({ preserve: true })).toBe(untouched.toString({ preserve: true }));
    });
  });

  describe('when each element is cleared through its handle', () => {
    it.each([
      ['KO_SHAPE', (b) => { b.glyph(0).clearOptions(); b.glyph(0).part(0).clearOptions(); }],
      ['KO_ALIAS', (b) => { b.glyph(0).clearOptions(); b.glyph(0).part(0).clearOptions(); }],
      ['B291;KO_SHAPE', (b) => { b.glyph(0).clearOptions(); b.glyph(0).part(0).clearOptions(); b.glyph(0).part(1).clearOptions(); }],
    ])('clears %s everywhere as clearing each of its elements through its handle does', (input, clearEach) => {
      // control: passes before C23. Pins the two routes reading a part's
      // definition through the same character
      const everywhere = changed(input, (b) => b.clearAllOptions());
      const each = changed(input, clearEach);
      expect(everywhere.svgCode).toBe(each.svgCode);
      expect(everywhere.toString({ preserve: true })).toBe(each.toString({ preserve: true }));
    });
  });

  describe('when a definition styles the parts inside it', () => {
    it('keeps the inner colours of B291;KO_TWO when everything is cleared', () => {
      // note: what sits inside a part named by a definition is the
      // definition's, so a clear stops at that part
      const builder = changed('B291;KO_TWO', (b) => b.clearAllOptions());
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;KO_TWO').svgCode);
      expect(builder.toString({ preserve: true })).toBe('B291;KO_TWO');
    });
  });

  describe('when a word-level indicator names a definition', () => {
    it.each([
      ['clearing everything', (b) => b.clearAllOptions()],
      ['clearing the word', (b) => b.group(0).clearOptions()],
    ])('keeps the definition\'s options on B291;;[color=green]>KO_IND after %s', (_label, change) => {
      // regression: the clear wrote the name down to the code it draws and
      // dropped the definition's colour with the override.
      // re-pinned (C25 Task 5, 2026-10-08): the stored code keeps its name,
      // which preserve shows; the default save spells it out with the
      // definition's options as a part bracket
      const builder = changed('B291;;[color=green]>KO_IND', change);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291;;KO_IND').svgCode);
      expect(builder.toString({ preserve: true })).toBe('B291;;KO_IND');
      expect(builder.toString()).toBe('B291;;[color=red]>B81');
    });

    it('keeps the definition\'s options when omitOptions leaves out the override', () => {
      // re-pinned (C25 Task 5, 2026-10-08): the default save spells the name
      // out, the definition's options with it; preserve keeps the name
      const builder = new BlissSVGBuilder('B291;;[color=green]>KO_IND');
      expect(builder.toString({ omitOptions: true })).toBe('B291;;[color=red]>B81');
      expect(builder.toString({ preserve: true, omitOptions: true })).toBe('B291;;KO_IND');
    });

    it('draws as the same definition in a ; slot does after everything is cleared', () => {
      const overlay = changed('B291;;KO_IND', (b) => b.clearAllOptions());
      expect(overlay.svgCode).toBe(changed('B291;KO_IND', (b) => b.clearAllOptions()).svgCode);
      expect(overlay.svgCode).toBe(new BlissSVGBuilder('B291;;KO_IND').svgCode);
    });

    it('writes the name alone when a flatten under preserve bakes it onto the head', () => {
      expect(new BlissSVGBuilder('B291;;KO_IND').toString({ preserve: true, flattenIndicators: true })).toBe('B291;KO_IND');
    });
  });
});
