import { describe, it, expect } from 'vitest';
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
 *   - every value the winner displaced is reported with
 *     `MULTIPLE_KERNING_VALUES`, and nothing throws.
 *
 * A definition cannot bring a kerning value of its own: `define()` refuses one
 * in `defaultOptions`, since the gap before a character belongs to one use of
 * it (see `BlissSVGBuilder.definition-use-site-options.test.js`).
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

  describe('when a kerning option is written outside character scope', () => {
    // Kerning is the gap before a CHARACTER, so the key means nothing at part,
    // word or global scope. A known option key written where it cannot work is
    // dropped with a warning and never reaches the markup, the same treatment a
    // canvas-wide key gets at a lower scope (MISPLACED_GLOBAL_OPTION). Silence
    // is not available: an UNRECOGNIZED key is passed through to the SVG as an
    // attribute by design, so a silent drop would make a real option and a
    // pass-through attribute look identical in the source and behave
    // differently with nothing said.
    it.each([
      ['[relative-kerning=3]>B291', 'part', 'relative-kerning=3'],
      ['[absolute-kerning=4]>B291', 'part', 'absolute-kerning=4'],
      ['[relative-kerning=3]|B291', 'group', 'relative-kerning=3'],
      ['[relative-kerning=3]||B291', 'global', 'relative-kerning=3'],
      // The refusal names the spelling the bag STORED, not the one that was
      // typed: a curated name is resolved on ingest, so by the time a scope gate
      // sees the key the written spelling is gone. Same rule a transient refusal
      // already follows.
      ['[relativeKerning=3]>B291', 'part', 'relative-kerning=3'],
      ['[relative-kerning]>B291', 'part', 'relative-kerning'],
    ])('reports and drops %s', (input, level, source) => {
      const b = new BlissSVGBuilder(input);
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_KERNING_OPTION']);
      expect(b.warnings[0].source).toBe(source);
      expect(b.warnings[0].message).toContain(`${level} level`);
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
      expect(b.toString()).toBe('B291');
    });

    it('keeps it out of the markup, which is where it used to end up', () => {
      // `<g relative-kerning="3">` is not an SVG attribute; it was reaching the
      // shipped bytes only because the key was unrecognized at that scope.
      for (const input of ['[relative-kerning=3]>B291', '[relative-kerning=3]|B291', '[relative-kerning=3]||B291']) {
        expect(new BlissSVGBuilder(input).svgCode).not.toContain('kerning=');
      }
    });

    it('keeps it out of the markup on the object surface too', () => {
      // The attribute emitter is shared, so the same key list covers a value
      // set through the API, which never passes the DSL scope gate.
      const built = new BlissSVGBuilder('B291;C8');
      built.glyph(0).part(1).setOptions({ relativeKerning: 3 });
      expect(built.svgCode).not.toContain('kerning=');
      expect(built.svgCode).toBe(new BlissSVGBuilder('B291;C8').svgCode);
    });

    it('leaves character scope, where kerning belongs, alone', () => {
      expect(codes('B99/[relative-kerning=3]B291')).toEqual([]);
      expect(glyphXs('B99/[relative-kerning=3]B291')[1]).toBe(7);
    });

    it('still passes an unrecognized key through to the SVG, warning-free', () => {
      // The gate keys off the known-kerning set and nothing else: the
      // pass-through feature is what `[data-*]` options are for.
      const b = new BlissSVGBuilder('[data-kerning=3]>B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('data-kerning="3"');
    });
  });

  describe('when a definition tries to carry kerning in its defaultOptions', () => {
    it('refuses the definition, so every kerning value a character holds was written on it', () => {
      const result = BlissSVGBuilder.define({
        C5_KERN_DEFAULT: { type: 'glyph', codeString: 'B291', defaultOptions: { relativeKerning: 3 } },
      });
      expect(result.errors).toHaveLength(1);
      expect(BlissSVGBuilder.isDefined('C5_KERN_DEFAULT')).toBe(false);
    });
  });
});
