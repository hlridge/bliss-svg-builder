import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the "one kerning value per character" contract (GH #18, chunk C5).
 *
 * Kerning can be written four ways, and they are four spellings of one value:
 * the `RK:`/`AK:` markers, and the long-form `[relative-kerning=N]` /
 * `[absolute-kerning=N]` options in either the kebab or the camel spelling.
 * They resolve in one place:
 *
 *   - an OPTION beats a MARKER, because options override the DSL shorthand;
 *   - among equals, the one written LATER wins;
 *   - a definition's `defaultOptions` is a default, so it loses to both;
 *   - every value a writer supplied and the winner displaced is reported with
 *     `MULTIPLE_KERNING_VALUES`. Nothing throws, and a displaced DEFAULT says
 *     nothing, since being overridden is what a default is for.
 *
 * Before this, `RK:` always beat `AK:` whatever the order, the loser vanished
 * in silence, and both long-form options were accepted, serialized, and inert.
 *
 * Output settles on the marker: `[relative-kerning=5]B291` serializes as
 * `RK:5/B291`. Canonicalize within a level, preserve across levels, and the
 * marker is the spelling every kerned composition already uses.
 *
 * Reference numbers, all against `B99` (ink width 2) followed by `B291`:
 *   no kerning  second glyph at 4   (2 ink + 2 char-space)
 *   RK:3        second glyph at 7   (relative: the default gap plus 3)
 *   AK:4        second glyph at 6   (absolute: 2 ink + 4)
 *
 * Does NOT cover:
 * - The bare-vs-explicit marker contract (`RK` with no value is absent), see
 *   `BlissSVGBuilder.kerning-markers.test.js`.
 * - The marker grammar and its malformed forms, see `BlissParser.kerning.test.js`.
 * - Rendered positions from single markers and the DSL/option parity pair, see
 *   `BlissSVGBuilder.spacing.test.js`.
 * - Kerning between adjacent EXTERNAL letters, which is font data rather than
 *   an authored value, see `BlissSVGBuilder.external-glyphs.test.js`.
 */

const glyphXs = (input) => new BlissSVGBuilder(input).groups[0].children.map(g => g.x);
const codes = (input) => new BlissSVGBuilder(input).warnings.map(w => w.code);
const sources = (input) => new BlissSVGBuilder(input).warnings.map(w => w.source);

describe('BlissSVGBuilder kerning options', () => {
  describe('when kerning is written as a long-form option', () => {
    it.each([
      ['[relative-kerning=3]', 7],
      ['[absolute-kerning=4]', 6],
      ['[relativeKerning=3]', 7],
      ['[absoluteKerning=4]', 6],
    ])('applies %s like the marker it spells out', (bracket, expected) => {
      expect(glyphXs(`B99/${bracket}B291`)[1]).toBe(expected);
    });

    it.each([
      ['B99/[relative-kerning=3]B291', 'B99/RK:3/B291'],
      ['B99/[absolute-kerning=4]B291', 'B99/AK:4/B291'],
      ['B99/[relativeKerning=3]B291', 'B99/RK:3/B291'],
    ])('serializes %s as the marker spelling', (input, expected) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(expected);
    });

    it('keeps the other options in the bracket', () => {
      expect(new BlissSVGBuilder('B99/[color=red;relative-kerning=3]B291').toString())
        .toBe('B99/RK:3/[color=red]B291');
    });

    it('reports a value that is not a number instead of kerning by NaN', () => {
      expect(codes('B99/[relative-kerning=abc]B291')).toEqual(['MALFORMED_KERNING_VALUE']);
      expect(glyphXs('B99/[relative-kerning=abc]B291')[1]).toBe(4);
      expect(new BlissSVGBuilder('B99/[relative-kerning=abc]B291').toString()).toBe('B99/B291');
    });

    it('reports a bare kerning key, which carries no value to apply', () => {
      expect(codes('B99/[relative-kerning]B291')).toEqual(['MALFORMED_KERNING_VALUE']);
      // Named the way it was written: a bare key is stored as `true`, and
      // reporting "relative-kerning=true" would name something nobody wrote.
      expect(sources('B99/[relative-kerning]B291')).toEqual(['relative-kerning']);
      expect(glyphXs('B99/[relative-kerning]B291')[1]).toBe(4);
    });
  });

  describe('when more than one kerning value reaches the same character', () => {
    it('lets the later marker win and names the one it displaced', () => {
      expect(glyphXs('B99/AK:4/RK:3/B291')[1]).toBe(7);
      expect(codes('B99/AK:4/RK:3/B291')).toEqual(['MULTIPLE_KERNING_VALUES']);
      expect(sources('B99/AK:4/RK:3/B291')).toEqual(['AK:4']);
    });

    it('resolves the mirror-image input the mirror-image way', () => {
      // The old rule made these two inputs identical: RK won whichever order
      // the markers were written in, and AK vanished without a word.
      expect(glyphXs('B99/RK:3/AK:4/B291')[1]).toBe(6);
      expect(sources('B99/RK:3/AK:4/B291')).toEqual(['RK:3']);
    });

    it('applies the same rule to two markers of the same kind', () => {
      expect(glyphXs('B99/RK:3/RK:5/B291')[1]).toBe(9);
      expect(sources('B99/RK:3/RK:5/B291')).toEqual(['RK:3']);
    });

    it('lets an option beat a marker wherever the marker sits', () => {
      expect(glyphXs('B99/RK:3/[absolute-kerning=4]B291')[1]).toBe(6);
      expect(sources('B99/RK:3/[absolute-kerning=4]B291')).toEqual(['RK:3']);
    });

    it('lets the last option in one bracket win', () => {
      expect(glyphXs('B99/[relative-kerning=3;absolute-kerning=4]B291')[1]).toBe(6);
      expect(sources('B99/[relative-kerning=3;absolute-kerning=4]B291')).toEqual(['relative-kerning=3']);
    });

    it('reports every displaced value, not just the last one', () => {
      const b = new BlissSVGBuilder('B99/RK:1/AK:2/[relative-kerning=3]B291');
      expect(b.groups[0].children[1].x).toBe(7);
      expect(b.warnings.map(w => w.code)).toEqual(['MULTIPLE_KERNING_VALUES', 'MULTIPLE_KERNING_VALUES']);
      expect(b.warnings.map(w => w.source)).toEqual(['RK:1', 'AK:2']);
    });

    it('never throws, whatever is piled onto one character', () => {
      expect(() => new BlissSVGBuilder('B99/RK:1/AK:2/RK:3/[relative-kerning=4;absolute-kerning=5]B291'))
        .not.toThrow();
    });

    it('serializes and re-renders the winner alone, without re-reporting', () => {
      for (const input of ['B99/AK:4/RK:3/B291', 'B99/RK:3/AK:4/B291', 'B99/RK:3/[absolute-kerning=4]B291']) {
        const direct = new BlissSVGBuilder(input);
        const reparsed = new BlissSVGBuilder(direct.toString());
        expect(reparsed.svgCode).toBe(direct.svgCode);
        expect(reparsed.warnings).toEqual([]);
      }
    });
  });

  describe('when kerning arrives as an options object instead of DSL text', () => {
    // GH #18: the option was accepted, serialized and round-tripped while
    // changing nothing on screen. Each row is asserted against the marker
    // spelling of the same value, byte for byte.
    it.each([
      ['setOptions', (b) => b.glyph(1).setOptions({ relativeKerning: 3 }), 'B99/B291', 'B99/RK:3/B291'],
      ['setOptions, absolute', (b) => b.glyph(1).setOptions({ absoluteKerning: 4 }), 'B99/B291', 'B99/AK:4/B291'],
      ['addGlyph opts', (b) => b.group(0).addGlyph('B291', { relativeKerning: 3 }), 'B99', 'B99/RK:3/B291'],
      ['insertGlyph opts', (b) => b.group(0).insertGlyph(1, 'B291', { absoluteKerning: 4 }), 'B99/C8', 'B99/AK:4/B291/C8'],
      ['replaceGlyph opts', (b) => b.group(0).replaceGlyph(1, 'B291', { relativeKerning: 3 }), 'B99/C8', 'B99/RK:3/B291'],
    ])('kerns through %s exactly as the marker does', (_label, mutate, start, dsl) => {
      const built = new BlissSVGBuilder(start);
      mutate(built);
      expect(built.svgCode).toBe(new BlissSVGBuilder(dsl).svgCode);
      expect(built.toString()).toBe(new BlissSVGBuilder(dsl).toString());
    });

    it('kerns through constructor object input', () => {
      const built = new BlissSVGBuilder({
        groups: [{ glyphs: [
          { parts: [{ codeName: 'B99' }] },
          { options: { relativeKerning: 3 }, parts: [{ codeName: 'B291' }] },
        ] }],
      });
      expect(built.svgCode).toBe(new BlissSVGBuilder('B99/RK:3/B291').svgCode);
    });

    it('resolves two values set in one call the same way the DSL does', () => {
      const built = new BlissSVGBuilder('B99/B291');
      built.glyph(1).setOptions({ absoluteKerning: 5, relativeKerning: 1 });
      expect(built.groups[0].children[1].x).toBe(5);
      expect(built.warnings.map(w => w.code)).toEqual(['MULTIPLE_KERNING_VALUES']);
      expect(built.toString()).toBe('B99/RK:1/B291');
    });
  });

  describe('when a definition carries kerning in its defaultOptions', () => {
    const KDEF = 'C5_KERN_DEFAULT';

    beforeEach(() => {
      BlissSVGBuilder.define({ [KDEF]: { type: 'glyph', codeString: 'B291', defaultOptions: { relativeKerning: 3 } } });
    });

    afterEach(() => {
      BlissSVGBuilder.removeDefinition(KDEF);
    });

    it('applies the default when the writer says nothing', () => {
      expect(glyphXs(`B99/${KDEF}`)[1]).toBe(7);
    });

    it('lets a written marker override it silently', () => {
      // Overriding a default is what a default is for, so this is not a
      // conflict between two written values and says nothing.
      expect(glyphXs(`B99/AK:4/${KDEF}`)[1]).toBe(6);
      expect(codes(`B99/AK:4/${KDEF}`)).toEqual([]);
    });

    it('lets a written option override it silently', () => {
      expect(glyphXs(`B99/[absolute-kerning=4]${KDEF}`)[1]).toBe(6);
      expect(codes(`B99/[absolute-kerning=4]${KDEF}`)).toEqual([]);
    });

    it('lets an API-set value override it as silently as the DSL does', () => {
      // Once the default is normalized onto the character it looks like any
      // other kerning value, so setting the other kind through the API must
      // replace it rather than be read as a second authored value. The two
      // surfaces hold the same state, so they must report the same thing.
      const built = new BlissSVGBuilder(`B99/${KDEF}`);
      built.glyph(1).setOptions({ absoluteKerning: 4 });
      const dsl = new BlissSVGBuilder(`B99/AK:4/${KDEF}`);
      expect(built.groups[0].children[1].x).toBe(6);
      expect(built.warnings).toEqual(dsl.warnings);
      expect(built.svgCode).toBe(dsl.svgCode);
    });

    it('takes the last of two defaults, silently, since neither was written here', () => {
      BlissSVGBuilder.define({
        [`${KDEF}2`]: { type: 'glyph', codeString: 'B291', defaultOptions: { relativeKerning: 3, absoluteKerning: 4 } },
      });
      try {
        expect(glyphXs(`B99/${KDEF}2`)[1]).toBe(6);
        expect(codes(`B99/${KDEF}2`)).toEqual([]);
      } finally {
        BlissSVGBuilder.removeDefinition(`${KDEF}2`);
      }
    });
  });
});
