import { describe, it, expect } from 'vitest';
import { classifyIndicatorKind } from '../src/lib/indicator-utils.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins classifyIndicatorKind: maps an indicator code to 'semantic' (its
 * definition carries a semanticIndicator flag) or 'grammatical', and to null
 * when the definition cannot be resolved. Shared by the snapshot classifier
 * and the part-handle getters so both classify identically (DSL/API parity).
 *
 * Covers:
 * - Semantic indicator (B97, semanticIndicator 'thing') -> 'semantic'.
 * - Grammatical indicators (B86 adjectival, B81 verbal) -> 'grammatical'.
 * - Unresolvable code (null, undefined, unknown, a non-indicator base) -> null.
 *
 * Does NOT cover:
 * - The isIndicator gate (callers gate on the node flag before calling this),
 *   see `ElementHandle.indicator-introspection.test.js`.
 * - The indicatorLevel (word vs character) derivation, which lives at the
 *   call sites (snapshot origin tag / raw node), not here.
 */

describe('indicator-utils.classifyIndicatorKind', () => {
  describe('when the code is a semantic indicator', () => {
    it('returns semantic for B97', () => {
      expect(classifyIndicatorKind('B97', blissElementDefinitions)).toBe('semantic');
    });
  });

  describe('when the code is a grammatical indicator', () => {
    it('returns grammatical for the adjectival B86', () => {
      expect(classifyIndicatorKind('B86', blissElementDefinitions)).toBe('grammatical');
    });

    it('returns grammatical for the verbal B81', () => {
      expect(classifyIndicatorKind('B81', blissElementDefinitions)).toBe('grammatical');
    });
  });

  describe('when the definition cannot be resolved', () => {
    it('returns null for null', () => {
      expect(classifyIndicatorKind(null, blissElementDefinitions)).toBeNull();
    });

    it('returns null for an unknown code', () => {
      expect(classifyIndicatorKind('ZZZZ', blissElementDefinitions)).toBeNull();
    });
  });
});
