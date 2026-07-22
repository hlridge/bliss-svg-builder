import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins definition-registry membership as OWN-property membership: inherited
 * Object.prototype names (toString, constructor, __proto__, ...) are not
 * definitions on any registry query or maintenance surface.
 *
 * Covers:
 * - isDefined() reports inherited Object.prototype names as not defined.
 * - getDefinition() returns null for them (no fictional space definition
 *   synthesized from a JS built-in function).
 * - isDefined()/listDefinitions() coherence on inherited names.
 * - removeDefinition() returns false for them (no lying `true` from a delete
 *   that never touched an own property).
 * - patchDefinition() rejects them as not defined and never mutates the
 *   shared JS built-ins (no expando on Object.prototype.toString, no
 *   Object.prototype pollution through '__proto__').
 * - Built-in and custom definitions keep resolving through the own-property
 *   check (over-rejection guard).
 *
 * Does NOT cover:
 * - define() on an inherited name: without overwrite, the existence gate
 *   classifies it as already-exists -> skipped[]; with overwrite:true a
 *   non-literal '__proto__' key (JSON.parse output) still reaches the
 *   assignment and reassigns the registry prototype (deferred hazard, see
 *   the it.todo tripwires below); the name-policy call (backlog) is not
 *   pinned here.
 * - Parser-side inherited-name tokens: 'toString' as DSL or object input
 *   warns UNKNOWN_CODE and round-trips like any unknown code (verified in
 *   temp/probe-phase35b-a2.mjs); no dedicated pin here.
 * - The general definition-maintenance surface, see
 *   `BlissSVGBuilder.definition-maintenance.test.js`.
 *
 * @regression: 2026-07-22 registry-own-membership (sweep A2)
 */
describe('BlissSVGBuilder definition registry membership', () => {

  describe('when queried with an inherited Object.prototype name', () => {
    it.each(['toString', 'hasOwnProperty', 'constructor', 'valueOf', '__proto__'])(
      `reports '%s' as not defined`,
      (name) => {
        expect(BlissSVGBuilder.isDefined(name)).toBe(false);
      }
    );

    it('returns null from getDefinition instead of a fictional definition', () => {
      expect(BlissSVGBuilder.getDefinition('toString')).toBeNull();
      expect(BlissSVGBuilder.getDefinition('constructor')).toBeNull();
      expect(BlissSVGBuilder.getDefinition('__proto__')).toBeNull();
    });

    it('agrees with listDefinitions() that inherited names are not definitions', () => {
      expect(BlissSVGBuilder.listDefinitions()).not.toContain('toString');
      expect(BlissSVGBuilder.isDefined('toString')).toBe(false);
    });
  });

  describe('when removing an inherited Object.prototype name', () => {
    it('returns false instead of reporting a removal that never happened', () => {
      expect(BlissSVGBuilder.removeDefinition('toString')).toBe(false);
      expect(BlissSVGBuilder.removeDefinition('__proto__')).toBe(false);
      // B291 still resolving proves the '__proto__' attempt could not detach
      // the registry's prototype chain
      expect(BlissSVGBuilder.isDefined('B291')).toBe(true);
    });
  });

  describe('when patching an inherited Object.prototype name', () => {
    it(`throws 'not defined' instead of writing onto the shared built-in function`, () => {
      // finally-cleanup: a regressed implementation writes the expando before
      // the assertion fails, and it must not leak into sibling tests
      try {
        expect(() =>
          BlissSVGBuilder.patchDefinition('toString', { defaultOptions: { color: 'red' } })
        ).toThrow(/not defined/);
        expect(Object.prototype.toString.defaultOptions).toBeUndefined();
      } finally {
        delete Object.prototype.toString.defaultOptions;
      }
    });

    it(`throws 'not defined' instead of polluting Object.prototype through '__proto__'`, () => {
      try {
        expect(() =>
          BlissSVGBuilder.patchDefinition('__proto__', { defaultOptions: { color: 'red' } })
        ).toThrow(/not defined/);
        expect({}.defaultOptions).toBeUndefined();
      } finally {
        delete Object.prototype.defaultOptions;
      }
    });
  });

  describe('when defining an inherited Object.prototype name (deferred name-policy)', () => {
    // tripwires for the define-side name-policy backlog row; convert when it lands
    it.todo(`define with overwrite:true and a JSON-delivered '__proto__' key must not reassign the registry prototype`);
    it.todo(`a glyph or shape codeString referencing an inherited name follows forward-reference tolerance instead of erroring "cannot reference space"`);
  });

  describe('when a definition legitimately exists', () => {
    it('keeps built-in and custom lookups working through the own-property check', () => {
      expect(BlissSVGBuilder.isDefined('B291')).toBe(true);
      expect(BlissSVGBuilder.getDefinition('H').type).toBe('shape');

      BlissSVGBuilder.define({ ZZMEMB1: { codeString: 'B291' } });
      try {
        expect(BlissSVGBuilder.isDefined('ZZMEMB1')).toBe(true);
        expect(BlissSVGBuilder.getDefinition('ZZMEMB1').type).toBe('bare');
      } finally {
        expect(BlissSVGBuilder.removeDefinition('ZZMEMB1')).toBe(true);
      }
      expect(BlissSVGBuilder.isDefined('ZZMEMB1')).toBe(false);
    });
  });

});
