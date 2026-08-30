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
 * - The ruled contract for a camelCase key written in a BRACKET, as `it.todo`
 *   tripwires: that surface does not convert on the way in, so the key is
 *   renamed at the emit boundary or swallowed into the library's own
 *   processed-option bag instead. Ruled and scheduled, not built.
 *
 * Does NOT cover:
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
    // RULED, NOT BUILT. The describe above pins the PROGRAMMATIC surface, where
    // the conversion happens on the way in and is correct. A bracket converts
    // nothing on the way in, so the ruling is that a camelCase key there is not
    // a curated option at all and must reach the markup verbatim, exactly as
    // preserveAspectRatio does. Today it is renamed at the emit boundary
    // instead, and where that kebab name has an internal camelCase twin (35 of
    // the 38 multi-word options) the value is swallowed into the library's own
    // processed-option bag and read as if it had already been validated.
    // Measured 2026-08-30, full census on the backlog row "Option-value
    // validation across the whole vocabulary (+ the camelCase namespace
    // collision)": [marginTop=3] silently gives height="12184.5" by string
    // concatenation, [svgHeight=200] throws out of the svgCode getter, and
    // [gridMajorColor=red] paints the major lines only where the kebab spelling
    // paints major, sky and earth. User ruling 2026-08-29: fix before the 1.1.0
    // cut. These three rows are the tripwire that keeps it visible until then.
    it.todo('emits [gridColor=blue] verbatim as gridColor="blue", never renamed to grid-color');
    it.todo('keeps a bracket key out of the processed-option bag, so [marginTop=3] cannot resize the picture');
    it.todo('renders [svgHeight=200] instead of throwing "num.toFixed is not a function"');
  });

  describe('when an attribute name is already kebab-case', () => {
    it('passes through unchanged', () => {
      const builder = new BlissSVGBuilder('[stroke-dasharray=2]||B291');
      expect(builder.svgCode).toContain('stroke-dasharray="2"');
    });
  });
});
