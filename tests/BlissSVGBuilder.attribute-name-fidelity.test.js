import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that an attribute name reaches the markup exactly as it was written,
 * and that only the curated option vocabulary is translated between its
 * camelCase and kebab-case spellings.
 *
 * Covers:
 * - A camelCase SVG attribute (`preserveAspectRatio`) emitted verbatim, from
 *   the DSL and from the object surface alike.
 * - A camelCase data attribute (`data-blissID`) keeping its case.
 * - A named option written in camelCase (`strokeWidth`, `gridSkyColor`) still
 *   translating to the kebab spelling the pipeline processes.
 * - An already-kebab attribute name passing through unchanged.
 *
 * Does NOT cover:
 * - Which element the attribute lands on, see
 *   `BlissSVGBuilder.layer-attributes.test.js`.
 * - The unsafe-name gate (`onclick`), see
 *   `BlissSVGBuilder.transient-options.test.js`.
 * - Element-scope pass-through, see `BlissSVGBuilder.svg-attributes.test.js`.
 */
describe('BlissSVGBuilder attribute name fidelity', () => {
  describe('when a camelCase SVG attribute is written', () => {
    it('emits the name exactly as written', () => {
      const builder = new BlissSVGBuilder('[preserveAspectRatio=xMidYMid]||B291');
      expect(builder.svgCode).toContain('preserveAspectRatio="xMidYMid"');
      expect(builder.svgCode).not.toContain('preserve-aspect-ratio');
    });

    it('emits the name exactly as written from the object surface too', () => {
      const builder = new BlissSVGBuilder('B291', { preserveAspectRatio: 'xMidYMid' });
      expect(builder.svgCode).toContain('preserveAspectRatio="xMidYMid"');
      expect(builder.svgCode).not.toContain('preserve-aspect-ratio');
    });

    it('keeps the case of a camelCase data attribute', () => {
      const builder = new BlissSVGBuilder('[data-blissID=7]||B291');
      expect(builder.svgCode).toContain('data-blissID="7"');
      expect(builder.svgCode).not.toContain('data-bliss-i-d');
    });
  });

  describe('when a named option is written in camelCase', () => {
    it('still translates to the kebab spelling the pipeline expects', () => {
      const builder = new BlissSVGBuilder('B291', { strokeWidth: 1.2 });
      expect(builder.svgCode).toContain('stroke-width="1.2"');
    });

    it('still reaches the processing branch that consumes it', () => {
      const builder = new BlissSVGBuilder('B291', { grid: true, gridSkyColor: '#123456' });
      expect(builder.svgCode).toContain('stroke="#123456"');
      expect(builder.svgCode).not.toContain('gridSkyColor');
    });
  });

  describe('when an attribute name is already kebab-case', () => {
    it('passes through unchanged', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=2]||B291');
      expect(builder.svgCode).toContain('stroke-dasharray="2"');
    });
  });
});
