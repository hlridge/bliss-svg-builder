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
 *   translating to the kebab spelling the pipeline processes, ON THE
 *   PROGRAMMATIC surface, which is the only one that converts on the way in.
 * - An already-kebab attribute name passing through unchanged.
 * - The same camelCase key on both surfaces, which is the contrast this file
 *   exists for: the options argument converts it and it curates, a bracket
 *   converts nothing and it is emitted verbatim.
 *
 * Does NOT cover:
 * - The mechanism that makes the bracket rows above true, or the collisions it
 *   ends, see `BlissSVGBuilder.option-namespace-split.test.js`.
 * - Which element the attribute lands on, see
 *   `BlissSVGBuilder.layer-attributes.test.js`.
 * - The unsafe-name gate (`onclick`), see
 *   `BlissSVGBuilder.unsafe-attribute-names.test.js`.
 * - Element-scope pass-through, see
 *   `BlissSVGBuilder.hierarchical-options.test.js` for the cascade and
 *   `BlissSVGBuilder.attribute-collisions.test.js` for one name per element.
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

  describe('when the same camelCase key is written on both surfaces', () => {
    // The contrast is the point, and it is what makes this file rather than
    // `option-namespace-split.test.js` the home for it: one spelling, two
    // surfaces, opposite treatment. The options ARGUMENT converts on the way in
    // and the key curates; a bracket converts nothing, so the same spelling is
    // an author's attribute name and reaches the markup exactly as written,
    // like preserveAspectRatio. The sibling file owns the mechanism and the
    // collisions this separates; these two rows own the fidelity claim.
    //
    // `strokeWidth` is the sharpest case and the reason the pair is written out
    // rather than assumed: it is the one key the library both computes and
    // publishes under another name, so a rename reaching the author's half
    // leaves the bracket spelling half-working, setting stroke-width while
    // computing nothing. Measured in that state: `<svg … stroke-width="1">`.
    it('converts it when it is the options argument', () => {
      const builder = new BlissSVGBuilder('B4', { strokeWidth: 1 });
      expect(builder.svgCode).toMatch(/<svg[^>]*\sstroke-width="1"/);
      expect(builder.svgCode).not.toContain('strokeWidth');
    });

    it('emits it verbatim when it is written in a bracket', () => {
      const builder = new BlissSVGBuilder('[strokeWidth=1]||B4');
      expect(builder.svgCode).toMatch(/<svg[^>]*\sstrokeWidth="1"/);
      expect(builder.svgCode).not.toContain('stroke-width="1"');
    });
  });

  describe('when an attribute name is already kebab-case', () => {
    it('passes through unchanged', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=2]||B291');
      expect(builder.svgCode).toContain('stroke-dasharray="2"');
    });
  });
});
