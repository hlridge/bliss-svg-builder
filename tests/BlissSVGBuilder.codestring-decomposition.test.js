import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins how a definition's codeString is decomposed into built-in codes when it
 * is serialized: the position spelling it emits, and the arithmetic that folds
 * a use-site position into the coordinate the definition wrote.
 *
 * This is the SECOND decomposition path. A composition whose definition existed
 * at parse time is resolved then and serializes through the part emitter, which
 * never reaches here. This path is reached when the definition arrived AFTER the
 * composition was built, so the tree still holds the bare code and serialization
 * has to expand the codeString itself. It does so by reading the name the way
 * the parser reads it in that slot, never by reading the definition's text a
 * second way.
 *
 * The two paths must produce the same string, and the shape of the definition
 * decides what that string is:
 *
 * - a PLAIN RENAME (`'C8'`) is merged away by the parser, so the use-site
 *   position becomes the part's own written position and a written `0` survives;
 * - anything else (`'C8:2'`, `'C8;HL2'`) keeps a node of its own, so the
 *   use-site position reaches the parts only as a FOLD. A zero fold moves
 *   nothing, but it is still a position the author wrote, so it is written on
 *   each ordinary part the node spells out into.
 *
 * Covers:
 * - Both of those, and the cross-path parity that decides between them, swept
 *   over every definition shape by every written position rather than sampled.
 * - The fold arithmetic, per axis: a definition's own coordinate is added to,
 *   not replaced by, the use-site position, including negative offsets and when
 *   either side writes only one axis.
 * - A coordinate that cannot be read never reaches this path: `define()`
 *   refuses the definition, so a composition built first keeps its unknown name.
 * - Option text on either side: the part's own options, a bracket in the
 *   codeString, a colon inside an option value, and a trailing `;`.
 *
 * Does NOT cover:
 * - The rule itself and its ten forms at the part emitter, see
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
 * - That this route's RENDER disagrees with its own `toString()`: the tree keeps
 *   the unresolved code, so the part draws nothing while the string names a real
 *   code. That is a definition-binding question, not a serialization one, and it
 *   has its own backlog row. These tests therefore pin the emitted STRING and
 *   what that string means when reloaded, never the source composition's ink.
 * - Every code string `define()` refuses as unreadable, and the wording, see
 *   `BlissSVGBuilder.define-readable-code-string.test.js`.
 * - A save leaving out every option, on this path too, see
 *   `BlissSVGBuilder.omit-options-edges.test.js`.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
  }
  customCodes.length = 0;
});

/**
 * Defines one shape, FAILING LOUDLY if it was refused. `define()` reports a
 * refusal in its RETURN VALUE rather than by throwing, so a fixture built
 * without this check silently becomes an unknown code and the test measures
 * nothing at all. That has produced two false conclusions in this area already.
 */
function defineOrThrow(name, codeString) {
  try { BlissSVGBuilder.removeDefinition(name); } catch { /* not defined yet */ }
  customCodes.push(name);
  const result = BlissSVGBuilder.define({ [name]: { type: 'shape', codeString } });
  if (result.defined.length !== 1) {
    throw new Error(`define() refused ${codeString}: ${JSON.stringify(result.errors)}`);
  }
}

/** Builds while the code is still unknown, then defines it: this file's path. */
function serializeAfterLateDefine(input, codeString) {
  const builder = new BlissSVGBuilder(input.replace('DEF', 'LATEDEF'));
  defineOrThrow('LATEDEF', codeString);
  return builder.toString();
}

/** The reference path: the definition exists before the composition is built. */
function serializeAfterEarlyDefine(input, codeString) {
  defineOrThrow('EARLYDEF', codeString);
  return new BlissSVGBuilder(input.replace('DEF', 'EARLYDEF')).toString();
}

describe('BlissSVGBuilder codeString decomposition', () => {
  describe('when the definition is a plain rename', () => {
    // a rename is merged away when the definition exists at parse time, so the
    // use-site position is the part's OWN position, not a fold, and it follows
    // the same presence rule the part emitter follows: an axis the author wrote
    // comes back written, a zero included
    it.each([
      [':0,0', 'B291;C8:0,0'],
      [':0,', 'B291;C8:0'],
      [':,0', 'B291;C8:,0'],
      [':0', 'B291;C8:0'],
      [':3,', 'B291;C8:3'],
      [':3', 'B291;C8:3'],
      [':,3', 'B291;C8:,3'],
      [':3,0', 'B291;C8:3,0'],
      [':0,3', 'B291;C8:0,3'],
      [':-3', 'B291;C8:-3'],
      [':,', 'B291;C8'],
      ['', 'B291;C8'],
    ])('writes %s as one slot per axis the author set', (written, expected) => {
      expect(serializeAfterLateDefine(`B291;DEF${written}`, 'C8')).toBe(expected);
    });

    it('saves the shorter spelling, and it reloads as the position it names', () => {
      const saved = serializeAfterLateDefine('B291;DEF:3', 'C8');
      expect(saved).toBe('B291;C8:3');
      expect(new BlissSVGBuilder(saved).svgCode)
        .toBe(new BlissSVGBuilder('B291;C8:3').svgCode);
    });
  });

  describe('when the definition carries a position of its own', () => {
    // NOT a rename, so the parser keeps a node for it and the use-site position
    // reaches the part as a FOLD. A fold of zero moves nothing, yet the axis was
    // written, so it comes back written here as it does above
    it('adds the use-site offset to a coordinate written as a pair', () => {
      // distinct values per axis on both sides, so a mutant that crosses the
      // axes or subtracts instead of adding cannot produce this string
      expect(serializeAfterLateDefine('B291;DEF:3,4', 'C8:2,4')).toBe('B291;C8:5,8');
    });

    it('adds the offset to a HALF coordinate instead of returning it unfolded', () => {
      // the pair-only reader returned the part verbatim here, so the use-site
      // position vanished and the reload drew the part 3 units to the left
      expect(serializeAfterLateDefine('B291;DEF:3', 'C8:2')).toBe('B291;C8:5');
    });

    it('subtracts a negative offset rather than ignoring it', () => {
      expect(serializeAfterLateDefine('B291;DEF:-3', 'C8:2')).toBe('B291;C8:-1');
    });

    it('forces the axis the offset moves, even when the definition left it unset', () => {
      expect(serializeAfterLateDefine('B291;DEF:3', 'C8:,4')).toBe('B291;C8:3,4');
    });

    it('keeps a zero the definition wrote', () => {
      expect(serializeAfterLateDefine('B291;DEF:3', 'C8:0,0')).toBe('B291;C8:3,0');
    });

    it('adds nothing to the value when the use site folds a zero, and keeps the axis it wrote', () => {
      // regression: a zero fold used to leave `y` unwritten, dropping a position
      // the author wrote, which the leading-indicator rule reads
      expect(serializeAfterLateDefine('B291;DEF:0,0', 'C8:2')).toBe('B291;C8:2,0');
    });
  });

  describe('when the definition writes a coordinate that cannot be read', () => {
    // define() refuses these, so this path can no longer meet one: the
    // composition built first keeps the unknown name it was written with.
    // regression: while define() accepted them, this path saved `B291` for a
    // character that drew nothing; before that it wrote a `C8` the parser fails
    // (`B291;C8:3`), and before that the unreadable slot was saved as `:NaN`
    it.each([
      ['B291;LATEDEF:3', 'C8:.'],
      ['B291;LATEDEF', 'C8:.'],
      ['B291;LATEDEF', 'C8:.,2'],
    ])('keeps %s as written, since define() refuses %s', (input, codeString) => {
      const builder = new BlissSVGBuilder(input);
      customCodes.push('LATEDEF');
      const result = BlissSVGBuilder.define({ LATEDEF: { type: 'shape', codeString } });
      expect(result.errors).toHaveLength(1);
      expect(builder.toString()).toBe(input);
    });
  });

  describe('when options are written on either side', () => {
    // regression: reading the definition's text dropped the part's own options
    // and the use-site offset beside a colon in an option value, and kept a
    // trailing `;`, each where the composition built after define() did not
    it.each([
      ['B291;[color=blue]>DEF', 'C8;HL2', 'B291;[color=blue]>C8;[color=blue]>HL2'],
      ['B291;[color=blue]>DEF:3', 'C8', 'B291;[color=blue]>C8:3'],
      ['B291;DEF:3', '[title=a:b]>C8', 'B291;[title=a:b]>C8:3'],
      ['B291;DEF', 'C8;', 'B291;C8'],
    ])('spells %s over %s as the composition built after define() does', (input, codeString, expected) => {
      expect(serializeAfterLateDefine(input, codeString)).toBe(expected);
      expect(serializeAfterEarlyDefine(input, codeString)).toBe(expected);
    });

    it('reads each use of one name on its own, at its own position', () => {
      // pins that the save reads a name once and copies the reading for every
      // use, so one use's position cannot leak into the next
      const builder = new BlissSVGBuilder('B291;LATEDEF:3/B291;LATEDEF');
      defineOrThrow('LATEDEF', 'C8');
      expect(builder.toString()).toBe('B291;C8:3/B291;C8');
    });
  });

  describe('when the codeString names several parts', () => {
    it('folds the offset into every part, per axis', () => {
      expect(serializeAfterLateDefine('B291;DEF:3', 'C8;HL2')).toBe('B291;C8:3;HL2:3');
    });

    it('leaves every part unpositioned when the fold is empty', () => {
      expect(serializeAfterLateDefine('B291;DEF', 'C8;HL2')).toBe('B291;C8;HL2');
    });

    it('writes a zero fold on every ordinary part, as it writes any other position', () => {
      // regression: the zero used to be dropped because the composite token
      // does not survive, which lost a position the author wrote
      expect(serializeAfterLateDefine('B291;DEF:0,0', 'C8;HL2')).toBe('B291;C8:0,0;HL2:0,0');
    });

    // a composite is the ONLY place these can be pinned. On a plain rename the
    // caller's written-ness forces the axis anyway, which masks a fold that has
    // stopped working; here nothing but the fold itself can set the axis
    it.each([
      [':,3', 'B291;C8:,3;HL2:,3'],
      [':-3', 'B291;C8:-3;HL2:-3'],
      [':,-3', 'B291;C8:,-3;HL2:,-3'],
      [':-3,-4', 'B291;C8:-3,-4;HL2:-3,-4'],
    ])('folds %s on the axis it names, negative as readily as positive', (written, expected) => {
      expect(serializeAfterLateDefine(`B291;DEF${written}`, 'C8;HL2')).toBe(expected);
    });
  });

  describe('when the same composition is built on either side of the definition', () => {
    // the contract that stops the two paths drifting apart again. Swept rather
    // than sampled: the divergence this file exists for was five cells out of
    // seventy, and every hand-picked row missed it
    const DEFINITIONS = ['C8', 'C8:2', 'C8:,4', 'C8:2,4', 'C8:0,0', 'C8;HL2', 'C8;HL2:2'];
    const POSITIONS = ['', ':0,0', ':0', ':0,', ':,0', ':3', ':3,4', ':,3', ':0,3', ':-3'];

    it.each(DEFINITIONS)('spells %s the same whichever side of define() it was built on', (codeString) => {
      const late = POSITIONS.map(p => `${p || '(none)'} => ${serializeAfterLateDefine(`B291;DEF${p}`, codeString)}`);
      const early = POSITIONS.map(p => `${p || '(none)'} => ${serializeAfterEarlyDefine(`B291;DEF${p}`, codeString)}`);
      expect(late).toEqual(early);
    });

    it('passes a zero written on an enclosing composite to a shape defined late inside it', () => {
      // the enclosing composite is spelled out with its zero on each ordinary
      // part, and the part it holds by a name defined only afterwards is one
      customCodes.push('OUTERZ', 'LATEIN');
      BlissSVGBuilder.define({ OUTERZ: { type: 'shape', codeString: 'LATEIN;C8' } });
      const builtFirst = new BlissSVGBuilder('B291;OUTERZ:0,0');
      BlissSVGBuilder.define({ LATEIN: { type: 'shape', codeString: 'HL2;VL2' } });
      expect(builtFirst.toString()).toBe('B291;HL2:0,0;VL2:0,0;C8:0,0');
      expect(new BlissSVGBuilder('B291;OUTERZ:0,0').toString()).toBe(builtFirst.toString());
    });
  });
});
