import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that a custom multi-part compound indicator applied as a word-level
 * (`;;`) overlay renders and serializes as one atomic unit, matching both the
 * built-in compound overlay and the `;`-slot twin (run-to-stable Phase 2.4b).
 *
 * The overlay merge previously extracted only the first part of a custom
 * compound's decomposed anatomy, so `B291;;COMBI` (COMBI = B97;B99:3,0) rendered
 * only B97 and flattened to `B291;B97`, silently losing B99. A built-in compound
 * (B98) was unaffected because the parser keeps it as one nested part.
 *
 * Covers:
 * - `;;COMBI` rendering the full B97+B99 anatomy, byte-identical to `;;B98`.
 * - flattenIndicators decomposing the baked compound (`B291;B97;B99:3,0`) and
 *   preserve keeping the custom name (`B291;COMBI`), parity with the `;`-slot.
 * - The correct render emitting no warnings and the default overlay code
 *   round-tripping unchanged (`B291;;COMBI`).
 * - Built-in compound (`;;B98`) and single-code alias (`;;BAREIND`) overlays
 *   staying unaffected by the multi-part reassembly.
 *
 * Does NOT cover:
 * - preserve name-restore mechanics for single-reference aliases, see
 *   `BlissSVGBuilder.custom-definition-serialization.test.js`.
 * - `;;` indicator-ness acceptance through aliases, see
 *   `BlissSVGBuilder.alias-indicator.test.js`.
 * - Indicator-row centering geometry, see
 *   `BlissSVGBuilder.multiple-indicators.test.js`.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function defineAndTrack(definitions) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions);
}

// COMBI mirrors the built-in compound B98 (= B97;B99): its second part B99 sits
// at the same 3,0 offset B98 bakes by default, so a correct overlay renders the
// two byte-identically.
const defineCombi = () =>
  defineAndTrack({ COMBI: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' } });

describe('BlissSVGBuilder compound indicator overlay', () => {

  describe('when a custom multi-part compound indicator is applied via `;;`', () => {
    it('renders the full anatomy, byte-identical to the built-in compound overlay', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').svgCode)
        .toBe(new BlissSVGBuilder('B291;;B98').svgCode);
    });

    it('renders identically to its `;`-slot twin', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').svgCode)
        .toBe(new BlissSVGBuilder('B291;COMBI').svgCode);
    });

    it('emits no warnings', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').warnings).toEqual([]);
    });

    it('round-trips the overlay code in default serialization', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').toString()).toBe('B291;;COMBI');
    });

    it('decomposes the whole baked anatomy under flattenIndicators', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').toString({ flattenIndicators: true }))
        .toBe('B291;B97;B99:3,0');
    });

    it('keeps the custom name under flattenIndicators with preserve', () => {
      defineCombi();
      expect(new BlissSVGBuilder('B291;;COMBI').toString({ flattenIndicators: true, preserve: true }))
        .toBe('B291;COMBI');
    });
  });

  describe('when a built-in compound indicator is applied via `;;`', () => {
    it('renders the full anatomy and bakes by codeName under flatten', () => {
      const b = new BlissSVGBuilder('B291;;B98');
      expect(b.warnings).toEqual([]);
      expect(b.toString({ flattenIndicators: true })).toBe('B291;B98');
      // guardrail: the multi-part reassembly must not touch the single nested
      // part a built-in compound already parses to.
    });
  });

  describe('when a single-code alias indicator is applied via `;;`', () => {
    it('bakes the resolved primitive and preserves the alias name', () => {
      defineAndTrack({ BAREIND: { codeString: 'B81', isIndicator: true } });
      const b = new BlissSVGBuilder('B291;;BAREIND');
      expect(b.toString({ flattenIndicators: true })).toBe('B291;B81');
      expect(b.toString({ flattenIndicators: true, preserve: true })).toBe('B291;BAREIND');
      // guardrail: the length===1 alias path (parsedParts[0] + _aliasCodeName
      // stamp) stays intact alongside the new multi-part branch.
    });
  });
});
