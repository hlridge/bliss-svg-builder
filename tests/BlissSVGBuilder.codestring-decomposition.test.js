import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins how a definition's codeString is decomposed into built-in codes when it
 * is serialized: the position spelling it emits, and the arithmetic that folds
 * the use-site offset into the coordinate the definition wrote.
 *
 * This is the SECOND decomposition path. A composition whose definition existed
 * at parse time carries expanded `parts` and serializes through the part
 * emitter, which never reaches here. This path is reached when the definition
 * arrived AFTER the composition was built, so the tree still holds the bare
 * code and serialization has to expand the codeString itself.
 *
 * Covers:
 * - The offset fold, per axis and arithmetic: a definition's own coordinate is
 *   added to, not replaced by, the use-site position, including when either
 *   side writes only one axis.
 * - What a use-site position does to each written form. Note this is NOT the
 *   ten-form part-position table: a position on the composite is a FOLD, not a
 *   position on the part that replaces it, so a written zero adds nothing and
 *   leaves no trace, where the same zero written directly on a part survives.
 * - The spelling that comes out, one slot per axis that ends up set.
 * - A multi-part codeString, where every part takes the same offset.
 *
 * Does NOT cover:
 * - The rule itself and its ten forms at the part emitter, see
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
 * - The normal (define-before-build) path, which expands at parse time and
 *   serializes through `parts`, see `BlissSVGBuilder.custom-shapes.test.js`.
 * - That this route's RENDER disagrees with its own `toString()`: the tree keeps
 *   the unresolved code, so the part draws nothing while the string names a real
 *   code. That is a definition-binding question, not a serialization one, and it
 *   has its own backlog row. These tests therefore pin the emitted STRING and
 *   what that string means when reloaded, never the source composition's ink.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
  }
  customCodes.length = 0;
});

/** Defines and FAILS LOUDLY if the definition was refused. */
function defineOrThrow(definitions) {
  customCodes.push(...Object.keys(definitions));
  const result = BlissSVGBuilder.define(definitions);
  if (result.defined.length !== Object.keys(definitions).length) {
    throw new Error(`define() refused: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

/** Builds with the code still unknown, then defines it, which is this path. */
function serializeAfterLateDefine(input, codeString) {
  const builder = new BlissSVGBuilder(input);
  defineOrThrow({ LATEDEF: { type: 'shape', codeString } });
  return builder.toString();
}

describe('BlissSVGBuilder codeString decomposition', () => {
  describe('when a definition arrives after the composition was built', () => {
    // note: a position on the composite is a FOLD into the parts it decomposes
    // to, not a position that lands on them. The composite's own token is gone
    // afterwards, so an axis folded by zero moves nothing and leaves no trace,
    // which is why `:0,0` here comes back bare while `B291;C8:0,0` written
    // directly on a part keeps both axes.
    it.each([
      [':0,0', 'B291;C8'],
      [':0,', 'B291;C8'],
      [':,0', 'B291;C8'],
      [':0', 'B291;C8'],
      [':,', 'B291;C8'],
      ['', 'B291;C8'],
      [':3,', 'B291;C8:3'],
      [':3', 'B291;C8:3'],
      [':3,0', 'B291;C8:3'],
      [':,3', 'B291;C8:,3'],
      [':0,3', 'B291;C8:,3'],
    ])('folds %s into the part it decomposes to', (written, expected) => {
      expect(serializeAfterLateDefine(`B291;LATEDEF${written}`, 'C8')).toBe(expected);
    });

    it('names the same position the other decomposition path names', () => {
      // the two paths differ only in WHEN the definition arrived, so they must
      // agree on the string; this row is what stops them drifting again
      defineOrThrow({ EARLYDEF: { type: 'shape', codeString: 'C8' } });
      const early = new BlissSVGBuilder('B291;EARLYDEF:3').toString();
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8')).toBe(early);
    });

    it('saves a string that reloads as the position it names', () => {
      const saved = serializeAfterLateDefine('B291;LATEDEF:3', 'C8');
      expect(new BlissSVGBuilder(saved).svgCode)
        .toBe(new BlissSVGBuilder('B291;C8:3').svgCode);
    });
  });

  describe('when the decomposed codeString carries its own coordinate', () => {
    it('adds the use-site offset to a coordinate written as a pair', () => {
      // distinct values per axis on both sides, so a mutant that crosses the
      // axes or subtracts instead of adding cannot produce this string
      expect(serializeAfterLateDefine('B291;LATEDEF:3,4', 'C8:2,4')).toBe('B291;C8:5,8');
    });

    it('adds the offset to a HALF coordinate instead of returning it unfolded', () => {
      // the pair-only reader returned the part verbatim here, so the use-site
      // position vanished and the reload drew the part 3 units to the left
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8:2')).toBe('B291;C8:5');
    });

    it('forces the axis the offset moves, even when the definition left it unset', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8:,4')).toBe('B291;C8:3,4');
    });

    it('keeps a zero the definition wrote', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8:0,0')).toBe('B291;C8:3,0');
    });

    it('leaves an axis unset when neither side wrote it', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8')).toBe('B291;C8:3');
    });

    it('contributes nothing when the use site folds a zero', () => {
      // the composite's token is gone after decomposition, so its position
      // survives only as a fold, and a zero fold adds nothing to anything
      expect(serializeAfterLateDefine('B291;LATEDEF:0,0', 'C8:2')).toBe('B291;C8:2');
    });
  });

  describe('when the definition writes a coordinate that cannot be read', () => {
    // `define()` accepts these, so they are reachable rather than hypothetical.
    // pins the coordinate-slot guard: without it the slot parses to NaN, the
    // offset is added to it, and `:NaN` is written into a saved composition,
    // which no reload can read back as a position
    it('treats an unreadable slot as unset instead of writing NaN', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8:.')).toBe('B291;C8:3');
    });

    it('keeps the readable axis when only one slot is unreadable', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8:.,2')).toBe('B291;C8:3,2');
    });
  });

  describe('when the codeString names several parts', () => {
    it('folds the offset into every part, per axis', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF:3', 'C8;HL2')).toBe('B291;C8:3;HL2:3');
    });

    it('leaves every part unpositioned when the fold is empty', () => {
      expect(serializeAfterLateDefine('B291;LATEDEF', 'C8;HL2')).toBe('B291;C8;HL2');
    });
  });
});
