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
 * - A camelCase key written in a BRACKET, which converts nothing on the way in
 *   and is therefore an author's key: emitted verbatim, and inert on the value
 *   the same name computes.
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

  describe('when a named option is written in camelCase inside a bracket', () => {
    // The describe above pins the PROGRAMMATIC surface, where the conversion
    // happens on the way in and is correct. A bracket converts nothing on the
    // way in, so a camelCase key there is not a curated option at all: it
    // reaches the markup verbatim, exactly as preserveAspectRatio does, and it
    // computes nothing. Until the two option bags were separated it was renamed
    // at the emit boundary instead, and where the kebab name had an internal
    // camelCase twin (35 of the 38 multi-word options) the author's string was
    // swallowed into the library's own processed bag and read as if it had
    // already been validated. Measured 2026-08-30: [marginTop=3] gave
    // height="12184.5" by string concatenation and [svgHeight=200] threw out of
    // the svgCode getter, both in silence.
    it('emits the name verbatim, never renamed to its kebab twin', () => {
      const builder = new BlissSVGBuilder('[gridColor=blue]||B291');
      expect(builder.svgCode).toContain('gridColor="blue"');
      expect(builder.svgCode).not.toContain('grid-color="blue"');
    });

    it('cannot resize the picture, because it never reaches the computed bag', () => {
      expect(new BlissSVGBuilder('[marginTop=3]||B291').svgCode)
        .toContain('viewBox="-0.75 -0.75 9.5 21.5"');
    });

    it('renders rather than throwing out of the svgCode getter', () => {
      expect(() => new BlissSVGBuilder('[svgHeight=200]||B291').svgCode).not.toThrow();
    });
  });

  describe('when an attribute name is already kebab-case', () => {
    it('passes through unchanged', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=2]||B291');
      expect(builder.svgCode).toContain('stroke-dasharray="2"');
    });
  });
});
