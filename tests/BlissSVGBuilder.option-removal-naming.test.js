import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that removal reads an option name the same way ingest wrote it: a name
 * the library or a standard owns is removed under either spelling, and a name
 * nobody owns is removed under exactly the spelling the caller wrote.
 *
 * The second half is the one that had teeth. All three removal sites used to
 * hyphenate every key on the way in, so asking for `dataBlissId` also deleted
 * `data-bliss-id`. Those are two different attributes by the naming contract,
 * they can be live at the same time, and their coexistence is deliberately
 * silent, so the deletion took an attribute the caller had not named and said
 * nothing about it.
 *
 * A `<target>--name` key suspends conversion for the same reason and was wrong
 * in the same way. Kerning is the mirror case: character scope stores it under
 * its camelCase spelling, the one curated name whose stored key is not the
 * kebab one, so the kebab spelling used to be a silent no-op there.
 *
 * Covers:
 * - All three removal sites, which are three separate code paths: an element's
 *   `removeOptions`, an element's `removeTransientOptions`, and the whole-SVG
 *   `removeTransientOptions`. Fixing two of the three passes any test written
 *   against one of them.
 * - Both directions on a name nobody owns, since each spelling is the one the
 *   other must not reach.
 * - The precondition each of those rests on, asserted in the same test: both
 *   spellings really are live, and their coexistence really is silent. Without
 *   it a row passes when storage stops keeping them apart.
 * - A name the library owns, in both spellings, including the kerning pair
 *   whose stored spelling differs from every other curated option's.
 * - A name a standard owns, in all three casings it accepts.
 * - A `<target>--` key, whose two spellings are two attributes.
 *
 * Does NOT cover:
 * - What a written name RESOLVES to on the way in, see
 *   `BlissSVGBuilder.option-spelling.test.js` and
 *   `BlissSVGBuilder.svg-attribute-vocabulary.test.js`.
 * - `MULTIPLE_OPTION_SPELLINGS`, which is two spellings of ONE name meeting in
 *   one bag; the pairs here are two names and report nothing.
 * - The rest of the mutation API's behaviour, see
 *   `BlissSVGBuilder.mutation-api.test.js`.
 * - The internal-only shorthands (`autoVertical`, `cropCompact`), which name
 *   another option rather than spell their own and are removed under `crop`.
 */

const attr = (svg, name, value) => svg.includes(`${name}="${value}"`);

const authorNamed = () => {
  const builder = new BlissSVGBuilder('B291');
  builder.glyph(0).setOptions({ dataBlissId: '7', 'data-bliss-id': '8' });
  return builder;
};

describe('BlissSVGBuilder option removal naming', () => {
  describe('when the name is one nobody owns', () => {
    it('leaves the spelling the caller did not name live, on an element', () => {
      const builder = authorNamed();
      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(true);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);
      expect(builder.warnings).toEqual([]);

      builder.glyph(0).removeOptions('dataBlissId');

      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(false);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);
    });

    it('leaves the camelCase spelling live when the hyphenated one is named', () => {
      const builder = authorNamed();

      builder.glyph(0).removeOptions('data-bliss-id');

      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(false);
      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(true);
    });

    it('leaves it live on an element transient bag', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setTransientOptions({ dataBlissId: '7', 'data-bliss-id': '8' });
      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(true);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);

      builder.glyph(0).removeTransientOptions('dataBlissId');

      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(false);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);
    });

    it('leaves it live on the whole-SVG transient bag', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ dataBlissId: '7', 'data-bliss-id': '8' });
      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(true);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);

      builder.removeTransientOptions('dataBlissId');

      expect(attr(builder.svgCode, 'dataBlissId', '7')).toBe(false);
      expect(attr(builder.svgCode, 'data-bliss-id', '8')).toBe(true);
    });
  });

  describe('when the name carries a target prefix', () => {
    it('treats its two spellings as two attributes', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ 'root--dataOne': 'a', 'root--data-one': 'b' });
      expect(attr(builder.svgCode, 'dataOne', 'a')).toBe(true);
      expect(attr(builder.svgCode, 'data-one', 'b')).toBe(true);

      builder.removeTransientOptions('root--dataOne');

      expect(attr(builder.svgCode, 'dataOne', 'a')).toBe(false);
      expect(attr(builder.svgCode, 'data-one', 'b')).toBe(true);
    });
  });

  describe('when the library owns the name', () => {
    it.each([
      ['strokeWidth', 'strokeWidth'],
      ['strokeWidth', 'stroke-width'],
      ['stroke-width', 'strokeWidth'],
      ['stroke-width', 'stroke-width'],
    ])('removes an option written %s when %s is named', (written, named) => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setOptions({ [written]: 3 });
      expect(builder.svgCode).toContain('stroke-width="3"');

      builder.glyph(0).removeOptions(named);

      expect(builder.svgCode).not.toContain('stroke-width="3"');
    });

    it.each(['strokeWidth', 'stroke-width'])('removes it from an element transient bag by %s', (named) => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setTransientOptions({ strokeWidth: 3 });
      expect(builder.svgCode).toContain('stroke-width="3"');

      builder.glyph(0).removeTransientOptions(named);

      expect(builder.svgCode).not.toContain('stroke-width="3"');
    });

    it.each(['strokeWidth', 'stroke-width'])('removes it from the whole-SVG transient bag by %s', (named) => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ strokeWidth: 3 });
      expect(builder.svgCode).toContain('stroke-width="3"');

      builder.removeTransientOptions(named);

      expect(builder.svgCode).not.toContain('stroke-width="3"');
    });

    // A character promotes a kerning option to its camelCase spelling, so this
    // is the one curated name whose stored key is not the kebab one. Before the
    // removal sites asked the naming lookup, the kebab spelling missed it.
    it.each(['relativeKerning', 'relative-kerning'])('removes character kerning by %s', (named) => {
      const unkerned = new BlissSVGBuilder('B291/B291').svgCode;
      const builder = new BlissSVGBuilder('B291/RK:3/B291');
      expect(builder.svgCode).not.toBe(unkerned);

      builder.glyph(1).removeOptions(named);

      expect(builder.svgCode).toBe(unkerned);
    });
  });

  describe('when there is nothing to remove', () => {
    it('leaves an element that has no options of its own alone', () => {
      const builder = new BlissSVGBuilder('B291');
      const untouched = builder.svgCode;

      builder.glyph(0).removeOptions('strokeWidth');

      expect(builder.svgCode).toBe(untouched);
    });

    it('leaves an element that has no transient options alone', () => {
      const builder = new BlissSVGBuilder('B291');
      const untouched = builder.svgCode;

      builder.glyph(0).removeTransientOptions('strokeWidth');

      expect(builder.svgCode).toBe(untouched);
    });

    it('leaves a whole SVG that has no transient options alone', () => {
      const builder = new BlissSVGBuilder('B291');
      const untouched = builder.svgCode;

      builder.removeTransientOptions('strokeWidth');

      expect(builder.svgCode).toBe(untouched);
    });

    it('drops the options bag entirely once its last key goes', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setOptions({ strokeWidth: 3 });
      expect(builder.toJSON().groups[0].glyphs[0]).toHaveProperty('options');

      builder.glyph(0).removeOptions('strokeWidth');

      expect(builder.toJSON().groups[0].glyphs[0]).not.toHaveProperty('options');
    });
  });

  describe('when a standard owns the name', () => {
    it.each(['viewBox', 'view-box', 'VIEWBOX'])('removes an element option named as %s', (named) => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setOptions({ 'view-box': '0 0 5 5' });
      expect(attr(builder.svgCode, 'viewBox', '0 0 5 5')).toBe(true);

      builder.glyph(0).removeOptions(named);

      expect(attr(builder.svgCode, 'viewBox', '0 0 5 5')).toBe(false);
    });

    it.each(['viewBox', 'view-box', 'VIEWBOX'])('removes a whole-SVG transient option named as %s', (named) => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ viewBox: '0 0 5 5' });
      expect(attr(builder.svgCode, 'viewBox', '0 0 5 5')).toBe(true);

      builder.removeTransientOptions(named);

      expect(attr(builder.svgCode, 'viewBox', '0 0 5 5')).toBe(false);
    });
  });
});
