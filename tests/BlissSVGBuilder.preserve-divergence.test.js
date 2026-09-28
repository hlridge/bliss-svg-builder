import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins `toString({ preserve: true })` keeping a custom glyph's name only while
 * the glyph still has the parts that name reloads to.
 *
 * Covers:
 * - A part-level change (a part removed, recoloured, moved on either axis, given
 *   an axis the definition never wrote, or stripped of an option the definition
 *   wrote) spelling the glyph out instead of saving the stale name, on an
 *   ordinary glyph, on a compound indicator, and through your own short name.
 * - A saved object naming the glyph over a part it does not have.
 * - Appended parts: a bare one keeps the name as `NAME;code`, including when
 *   the definition positions its own parts; one written at a position (the
 *   origin included), moved or coloured spells the glyph out.
 * - Controls that keep the name: an untouched glyph on each route that builds
 *   one, a part moved back onto the definition's own position, options rewritten
 *   to the definition's values in another order, a definition naming another
 *   custom glyph as a part, and decoration at character level.
 * - Every saved string reloading to the drawing the builder shows.
 *
 * Does NOT cover:
 * - Your own short name over a definition that spells its anatomy differently
 *   from how it is saved, see `BlissSVGBuilder.typed-name-preserve.test.js`.
 * - `toJSON({ preserve: true })`, which saves the parts beside the name and
 *   rebuilds from the parts, see `BlissSVGBuilder.custom-glyphs.test.js`.
 * - A change made inside a part that is saved by its own name (`part(0).part(0)`
 *   recoloured or moved): the part's name brings it back on every save, see
 *   backlog row "A part saved by its name forgets a change made inside it".
 * - A default option the name supplies, removed at any level, see
 *   `BlissSVGBuilder.preserve-removed-default.test.js`.
 * - A glyph authored as object input with a name and no parts, see backlog row
 *   "A glyph authored with only `codeName`".
 */

const FIXTURES = {
  PDBASE: { type: 'glyph', codeString: 'B291;C8' },
  PDOWNSPOS: { type: 'glyph', codeString: 'B291;C8:3,4' },
  PDCOLOURED: { type: 'glyph', codeString: 'B291;[color=blue]>C8' },
  PDCOMPOUND: { type: 'glyph', isIndicator: true, codeString: 'B86;B97' },
  PDDECIND: { type: 'glyph', isIndicator: true, codeString: 'B86;[color=red]>B97' },
  PDSHAPE: { type: 'shape', codeString: 'C8', defaultOptions: { color: 'blue', 'stroke-width': 0.5 } },
  PDINNER: { type: 'glyph', codeString: 'C8' },
  // note: define() accepts a name no DSL string can reach (the parser splits on
  // the separator before it looks the name up), so only a saved object uses these
  'B291/C8': { type: 'glyph', codeString: 'B291;C8' },
  'B291//C8': { type: 'glyph', codeString: 'B291;C8' },
};
const DEPENDENT_FIXTURES = {
  PDTWOOPT: { type: 'glyph', codeString: 'B291;PDSHAPE' },
  PDTYPEDPART: { type: 'glyph', codeString: 'PDINNER;C2' },
  PDALIAS: { codeString: 'PDBASE' },
};

beforeAll(() => {
  BlissSVGBuilder.define(FIXTURES);
  BlissSVGBuilder.define(DEPENDENT_FIXTURES);
});

afterAll(() => {
  for (const code of [...Object.keys(DEPENDENT_FIXTURES), ...Object.keys(FIXTURES)]) {
    BlissSVGBuilder.removeDefinition(code);
  }
});

// A builder for `code` after `change` has been applied to its first glyph.
const changed = (code, change) => {
  const builder = new BlissSVGBuilder(code);
  change(builder.glyph(0));
  return builder;
};

// What a preserve save writes, and what reloading that string draws.
const preserveSave = (builder) => {
  const saved = builder.toString({ preserve: true });
  return { saved, reloaded: new BlissSVGBuilder(saved).svgCode };
};

describe('BlissSVGBuilder preserve divergence', () => {
  describe('when a part of a custom glyph has changed', () => {
    it.each([
      ['removePart(1)', (g) => g.removePart(1), 'B291'],
      ['part(1).remove()', (g) => g.part(1).remove(), 'B291'],
      ['recolouring part 1', (g) => g.part(1).setOptions({ color: 'red' }), 'B291;[color=red]>C8'],
      ['moving part 1 on both axes', (g) => g.part(1).setOptions({ x: 3, y: 4 }), 'B291;C8:3,4'],
      ['moving part 1 on y alone', (g) => g.part(1).setOptions({ y: 4 }), 'B291;C8:,4'],
    ])('spells the glyph out after %s', (_label, change, expected) => {
      const builder = changed('PDBASE', change);
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe(expected);
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when a part gains an axis the definition never wrote, even at 0', () => {
      // note: the ruling counts axis PRESENCE, so an inert 0 still diverges;
      // spelling out is faithful, keeping the name is the direction that can move ink
      const builder = changed('PDBASE', (g) => g.part(1).setOptions({ x: 0 }));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8:0');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when an option the definition wrote is removed from its part', () => {
      const builder = changed('PDCOLOURED', (g) => g.part(1).removeOptions('color'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells a compound indicator out when one of its parts is recoloured', () => {
      const builder = changed('PDCOMPOUND', (g) => g.part(0).setOptions({ color: 'red' }));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('[color=red]>B86;B97');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells a compound indicator out when one of its parts is removed', () => {
      const builder = changed('PDCOMPOUND', (g) => g.removePart(1));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B86');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out through your own short name for it', () => {
      const builder = changed('PDALIAS', (g) => g.removePart(1));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when a saved object names it over a different part', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'PDBASE', parts: [{ codeName: 'B291' }, { codeName: 'C2' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C2');
      expect(reloaded).toBe(builder.svgCode);
    });
  });

  describe('when parts are appended to a custom glyph', () => {
    it('keeps the name and appends a bare indicator', () => {
      const builder = changed('PDBASE', (g) => g.applyIndicators('B86'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('PDBASE;B86');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when the appended indicator draws with a look of its own', () => {
      // note: the string does not write ANCHORRING's dotted line, but the
      // renderer draws a character holding a styled part part by part, so
      // `PDBASE;ANCHORRING` would reload with the base's paths merged into one
      const builder = changed('PDBASE', (g) => g.applyIndicators('ANCHORRING'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8;ANCHORRING');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('keeps the name when the definition positions its own part', () => {
      // regression: the position check read every part, so a definition owning
      // `C8:3,4` lost its name for a position the name already carries
      const builder = changed('PDOWNSPOS', (g) => g.applyIndicators('B86'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('PDOWNSPOS;B86');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('keeps the name and appends a bare part a saved object adds', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'PDBASE', parts: [{ codeName: 'B291' }, { codeName: 'C8' }, { codeName: 'C2' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('PDBASE;C2');
      expect(reloaded).toBe(builder.svgCode);
    });

    it.each([
      ['written at the origin', (g) => g.applyIndicators('B86:0,0'), 'B291;C8;B86:0,0'],
      ['written at x alone', (g) => g.applyIndicators('B86:0'), 'B291;C8;B86:0'],
      ['written at y alone', (g) => g.applyIndicators('B86:,0'), 'B291;C8;B86:,0'],
      ['then moved', (g) => { g.applyIndicators('B86'); g.part(2).setOptions({ x: 3, y: 4 }); }, 'B291;C8;B86:3,4'],
      ['then coloured', (g) => { g.applyIndicators('B86'); g.part(2).setOptions({ color: 'red' }); }, 'B291;C8;[color=red]>B86'],
    ])('spells the glyph out when the appended indicator is %s', (_label, change, expected) => {
      // regression (origin row): `NAME;B86` reloads the indicator re-centred,
      // because an indicator with no position is placed, and one at 0,0 is pinned
      const builder = changed('PDBASE', change);
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe(expected);
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when only one of two appended indicators carries a position', () => {
      const builder = changed('PDBASE', (g) => g.applyIndicators('B86;B81:0,0'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8;B86;B81:0,0');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when a saved object appends a custom glyph whose own anatomy is decorated', () => {
      // regression: the appended part is bare at its own level,
      // but `NAME;PDCOLOURED` reloads with the base's paths merged into one
      // where the builder drew them apart, so the SVG differed from what it saved
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'PDBASE', parts: [{ codeName: 'B291' }, { codeName: 'C8' }, { codeName: 'PDCOLOURED' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8;PDCOLOURED');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('keeps the name when a saved object appends a custom glyph whose anatomy only positions its parts', () => {
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'PDBASE', parts: [{ codeName: 'B291' }, { codeName: 'C8' }, { codeName: 'PDOWNSPOS' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('PDBASE;PDOWNSPOS');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells the glyph out when a flattened word-level indicator is decorated inside its own definition', () => {
      // regression, reachable from the DSL alone: flattening
      // `;;PDDECIND` appends the indicator whole, and its definition colours one
      // of its parts
      const builder = new BlissSVGBuilder('PDBASE;;PDDECIND');
      const saved = builder.toString({ preserve: true, flattenIndicators: true });
      expect(saved).toBe('B291;C8;PDDECIND');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(builder.svgCode);
    });

    it('spells a compound indicator out when an indicator is applied to it', () => {
      const builder = changed('PDCOMPOUND', (g) => g.applyIndicators('B81'));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B86;B81;B97');
      expect(reloaded).toBe(builder.svgCode);
    });

    it('spells a compound indicator out even when a saved object appends a bare indicator after its own', () => {
      // note: a compound indicator is one atomic unit, so nothing is ever
      // appended to its name, even where its own parts come through untouched
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'PDCOMPOUND', parts: [{ codeName: 'B86' }, { codeName: 'B97' }, { codeName: 'B81' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B86;B97;B81');
      expect(reloaded).toBe(builder.svgCode);
    });
  });

  describe('when the name cannot be read back as one character', () => {
    it.each([
      ['a character separator', 'B291/C8'],
      ['a word separator', 'B291//C8'],
    ])('spells the glyph out when its name holds %s', (_label, name) => {
      // pins the single-character guard on the name's reading: taking the first
      // character of `B291/C8` would save `B291/C8;C8`, which reloads as two
      const builder = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: name, parts: [{ codeName: 'B291' }, { codeName: 'C8' }] }] }],
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('B291;C8');
      expect(reloaded).toBe(builder.svgCode);
    });
  });

  describe('when the glyph still has the parts its name reloads to', () => {
    it.each([
      ['parsed from its name', () => new BlissSVGBuilder('PDBASE'), 'PDBASE'],
      ['rebuilt from its preserved JSON', () => new BlissSVGBuilder(new BlissSVGBuilder('PDBASE').toJSON({ preserve: true })), 'PDBASE'],
      ['added to a word through the API', () => { const b = new BlissSVGBuilder('B313'); b.group(0).addGlyph('PDBASE'); return b; }, 'B313/PDBASE'],
      ['written inside a word', () => new BlissSVGBuilder('B313/PDBASE'), 'B313/PDBASE'],
      ['written with a character option', () => new BlissSVGBuilder('[color=red]PDBASE'), '[color=red]PDBASE'],
      ['a compound indicator parsed from its name', () => new BlissSVGBuilder('PDCOMPOUND'), 'PDCOMPOUND'],
      ['defined over another custom glyph as a part', () => new BlissSVGBuilder('PDTYPEDPART'), 'PDTYPEDPART'],
    ])('keeps the name when %s', (_label, build, expected) => {
      const builder = build();
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe(expected);
      expect(reloaded).toBe(builder.svgCode);
    });

    it('keeps the name on both surfaces when a part is given a key', () => {
      // note: a key names the part for getElementByKey and draws nothing, and
      // both saves strip it
      const builder = changed('PDBASE', (g) => g.part(1).setOptions({ key: 'mine' }));
      expect(preserveSave(builder).saved).toBe('PDBASE');
      expect(builder.toJSON({ preserve: true }).groups[0].glyphs[0].codeName).toBe('PDBASE');
    });

    it('keeps the name when a part is moved back onto the definition\'s own position', () => {
      const builder = changed('PDOWNSPOS', (g) => g.part(1).setOptions({ x: 3, y: 4 }));
      expect(preserveSave(builder).saved).toBe('PDOWNSPOS');
    });

    it('keeps the name when a part\'s options are rewritten to the definition\'s values in another order', () => {
      const builder = changed('PDTWOOPT', (g) => {
        g.part(1).removeOptions('color');
        g.part(1).setOptions({ color: 'blue' });
      });
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe('PDTWOOPT');
      expect(reloaded).toBe(builder.svgCode);
    });

    it.each([
      ['coloured', { color: 'red' }, '[color=red]PDBASE'],
      ['positioned', { x: 2 }, '[x=2]PDBASE'],
    ])('keeps the name when the whole character is %s', (_label, options, expected) => {
      const builder = changed('PDBASE', (g) => g.setOptions(options));
      const { saved, reloaded } = preserveSave(builder);
      expect(saved).toBe(expected);
      expect(reloaded).toBe(builder.svgCode);
    });
  });
});
