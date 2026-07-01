import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that the deprecated group-level head-indicator aliases
 * applyHeadIndicators / clearHeadIndicators are REMOVED from ElementHandle
 * (Chunk 2, rc.4). They were `@deprecated` aliases for the flatten variant of
 * the polymorphic indicator API and carried no unique behavior. The surviving
 * word-level surface is `applyIndicators(code)` / `clearIndicators()` (the
 * reversible overlay) and its baking form `applyIndicators(code, { flatten:
 * true })` / `clearIndicators({ flatten: true })`.
 *
 * Covers:
 * - applyHeadIndicators is absent from the handle prototype and not callable.
 * - clearHeadIndicators is absent from the handle prototype and not callable.
 *
 * Does NOT cover:
 * - The surviving flatten (baking) behavior and the reversible overlay API,
 *   see `ElementHandle.word-indicators.test.js`.
 * - The built-bundle public-surface enumeration (which must also drop the two
 *   aliases), see `BlissSVGBuilder.public-surface.dist.test.js`.
 */

describe('ElementHandle head-indicator removal', () => {
  describe('when the removed aliases are accessed on a group handle', () => {
    it('no longer exposes applyHeadIndicators', () => {
      const group = new BlissSVGBuilder('B291/B303').group(0);
      expect(typeof group.applyHeadIndicators).toBe('undefined');
      expect(() => group.applyHeadIndicators('B86')).toThrow();
    });

    it('no longer exposes clearHeadIndicators', () => {
      const group = new BlissSVGBuilder('B291;B86/B303').group(0);
      expect(typeof group.clearHeadIndicators).toBe('undefined');
      expect(() => group.clearHeadIndicators()).toThrow();
    });
  });
});
