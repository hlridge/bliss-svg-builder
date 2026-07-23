import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins preserve completeness for typed entities at character level
 * (run-to-stable preserve-completeness chunk): `preserve` keeps the name of
 * a custom typed shape standalone, whatever its anatomy, and keeps the
 * WRITTEN alias name over a custom typed glyph/indicator/shape target,
 * via the glyph-level recording channel restored only for a clean instance
 * of the definition's anatomy.
 *
 * Covers:
 * - Standalone typed shapes: sole-part, multi-part, decorated anatomy,
 *   in-word and option-prefixed forms.
 * - Bare aliases to custom typed targets (glyph, indicator, shape) keeping
 *   the written name, including chains and decorated-anatomy round-trips.
 * - Divergence safety: a mutated glyph decomposes (or re-emits the typed
 *   target's delta) instead of keeping a stale written name.
 * - Glyph-level toJSON restore, public no-leak in both modes, re-ingest
 *   round-trips, object-input parity, mutation and merge survival.
 * - Built-in, letter-alias, and multi-code-shorthand guardrails.
 *
 * Does NOT cover:
 * - Bare aliases to BUILT-IN targets at character level (the part-level
 *   side channel), see `BlissSVGBuilder.char-alias-preserve.test.js`.
 * - `type: 'glyph'` identity and indicator-delta mechanics, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 * - `;`-part-slot preserve channels, see
 *   `BlissSVGBuilder.custom-definition-serialization.test.js`.
 * - merge() losing a typed glyph's OWN name (pre-existing deep-default
 *   normalization gap, backlog row; aliases survive via the recording).
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function defineAndTrack(definitions, options) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions, options);
}

// The chunk's canonical fixture set: typed shapes, typed glyphs, and bare
// aliases onto them (facet 1 = MYSH*, facet 2 = ALGL/TAL).
const defineTypedFixtures = () => defineAndTrack({
  MYSH1: { type: 'shape', codeString: 'C8' },
  MYSH2: { type: 'shape', codeString: 'C8;C2:3,3' },
  MYGL1: { type: 'glyph', codeString: 'C8' },
  MYGLYPH: { type: 'glyph', codeString: 'C8;C2:3,3' },
  ALGL: { codeString: 'MYGL1' },
  TAL: { codeString: 'MYGLYPH' },
  ALSH2: { codeString: 'MYSH2' },
});

describe('BlissSVGBuilder typed-name preserve', () => {

  describe('when preserve serializes a standalone typed shape', () => {
    it('keeps a sole-part shape name with stable render', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('MYSH1');
      expect(b.toString()).toBe('C8');
      expect(b.toString({ preserve: true })).toBe('MYSH1');
      expect(b.warnings).toEqual([]);
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps a multi-part shape name with stable render', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('MYSH2');
      expect(b.toString()).toBe('C8;C2:3,3');
      expect(b.toString({ preserve: true })).toBe('MYSH2');
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps the name in-word and under an option prefix', () => {
      defineTypedFixtures();
      expect(new BlissSVGBuilder('B313/MYSH1').toString({ preserve: true })).toBe('B313/MYSH1');
      expect(new BlissSVGBuilder('[color=red]MYSH1').toString({ preserve: true }))
        .toBe('[color=red]MYSH1');
    });

    it('keeps a decorated-anatomy shape name without leaking anatomy coordinates', () => {
      defineAndTrack({ MYSHP: { type: 'shape', codeString: 'C8:2,3' } });
      const b = new BlissSVGBuilder('MYSHP');
      // the anatomy's own :2,3 must not resurface as an instance suffix
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('MYSHP');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('keeps default emission decomposed and byte-stable', () => {
      defineTypedFixtures();
      // pins default byte-identity: the recording is preserve-only
      expect(new BlissSVGBuilder('MYSH2').toString()).toBe('C8;C2:3,3');
      expect(new BlissSVGBuilder('[color=red]MYSH1').toString()).toBe('[color=red]C8');
      const pub = new BlissSVGBuilder('MYSH2').toJSON().groups[0].glyphs[0];
      expect(pub.codeName).toBeUndefined();
      expect(Object.hasOwn(pub, '_aliasCodeName')).toBe(false);
    });
  });

  describe('when preserve serializes a bare alias to a custom typed target', () => {
    it('keeps the written name over a sole-part typed glyph target', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('ALGL');
      expect(b.toString()).toBe('C8');
      expect(b.toString({ preserve: true })).toBe('ALGL');
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps the written name over a multi-part typed glyph target', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('TAL');
      expect(b.toString({ preserve: true })).toBe('TAL');
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps the written name over a custom typed indicator target', () => {
      defineAndTrack({ MYIND2: { type: 'glyph', isIndicator: true, codeString: 'C2' } });
      defineAndTrack({ ALIND: { codeString: 'MYIND2' } });
      expect(new BlissSVGBuilder('ALIND').toString({ preserve: true })).toBe('ALIND');
    });

    it('keeps the written name over a multi-part typed shape target', () => {
      defineTypedFixtures();
      expect(new BlissSVGBuilder('ALSH2').toString({ preserve: true })).toBe('ALSH2');
    });

    it('keeps the written name over a decorated-anatomy shape target with stable render', () => {
      defineAndTrack({ MYSHP: { type: 'shape', codeString: 'C8:2,3' } });
      defineAndTrack({ ALSHP: { codeString: 'MYSHP' } });
      const b = new BlissSVGBuilder('ALSHP');
      const emitted = b.toString({ preserve: true });
      // regression: emitted 'ALSHP:2,3' before this chunk, which re-parsed
      // to a shifted render (anatomy coordinates doubled as instance ones)
      expect(emitted).toBe('ALSHP');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('keeps the written name over an option-decorated shape anatomy with stable render', () => {
      defineAndTrack({ MYSHOP: { type: 'shape', codeString: '[color=red]>C8' } });
      defineAndTrack({ ALSHOP: { codeString: 'MYSHOP' } });
      const b = new BlissSVGBuilder('ALSHOP');
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('ALSHOP');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('keeps the outermost written name through an alias chain', () => {
      defineTypedFixtures();
      defineAndTrack({ AL2GL: { codeString: 'ALGL' } });
      expect(new BlissSVGBuilder('AL2GL').toString({ preserve: true })).toBe('AL2GL');
    });

    it('keeps the name in-word and under an option prefix', () => {
      defineTypedFixtures();
      expect(new BlissSVGBuilder('B313/ALGL').toString({ preserve: true })).toBe('B313/ALGL');
      expect(new BlissSVGBuilder('[color=red]ALGL').toString({ preserve: true }))
        .toBe('[color=red]ALGL');
    });
  });

  describe('when the glyph diverges from the definition anatomy', () => {
    it('re-emits the typed target delta after applyIndicators', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('ALGL');
      b.glyph(0).applyIndicators('B81');
      // pins the clean-anatomy gate: 'ALGL;B81' would drop B81 on reparse
      // (a `;`-part on a bare-alias base is misplaced), so the typed target
      // name carries the delta instead
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('MYGL1;B81');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('decomposes a diverged shape instead of keeping a stale name', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('MYSH2');
      b.glyph(0).addPart('B81');
      expect(b.toString({ preserve: true })).toBe('C8;C2:3,3;B81');
    });

    it('ignores a hand-authored stale glyph recording', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ _aliasCodeName: 'MYSH2', parts: [{ codeName: 'C8' }] }] }],
      });
      expect(b.toString({ preserve: true })).toBe('C8');
    });

    it('never restores a name onto multi-code shorthand ink', () => {
      defineAndTrack({ PAIRISH: { codeString: 'B1103;B81' } });
      defineAndTrack({ SHORT: { codeString: 'PAIRISH' } });
      // pins the identity requirement in the consult: the chain bottoms out
      // at a bare shorthand definition, so even anatomy-identical ink stays
      // expanded (shorthand always serializes expanded)
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ _aliasCodeName: 'SHORT', parts: [{ codeName: 'B1103' }, { codeName: 'B81' }] }] }],
      });
      expect(b.toString({ preserve: true })).toBe('B1103;B81');
    });

    it('falls back to the typed name when the alias definition is gone', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('ALGL');
      BlissSVGBuilder.removeDefinition('ALGL');
      expect(b.toString({ preserve: true })).toBe('MYGL1');
    });
  });

  describe('when a word-level overlay rides the alias', () => {
    it('keeps the written name beside the overlay and the typed delta when flattened', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('ALGL;;B81');
      expect(b.toString({ preserve: true })).toBe('ALGL;;B81');
      const flattened = b.toString({ flattenIndicators: true, preserve: true });
      expect(flattened).toBe('MYGL1;B81');
      expect(new BlissSVGBuilder(flattened).svgCode).toBe(b.svgCode);
    });
  });

  describe('when toJSON carries the restored name', () => {
    it('restores the name at glyph level and keeps parts resolved', () => {
      defineTypedFixtures();
      const alias = new BlissSVGBuilder('ALGL').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(alias.codeName).toBe('ALGL');
      expect(alias.parts[0].codeName).toBe('C8');
      const shape = new BlissSVGBuilder('MYSH2').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(shape.codeName).toBe('MYSH2');
      expect(shape.parts.map(p => p.codeName)).toEqual(['C8', 'C2']);
      // review MAJOR-1: the toJSON consult must canonicalize part options the
      // same way toString does, or the two preserve surfaces diverge
      defineAndTrack({ MYSHOP: { type: 'shape', codeString: '[color=red]>C8' } });
      const decorated = new BlissSVGBuilder('MYSHOP').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(decorated.codeName).toBe('MYSHOP');
    });

    it('leaks no glyph-level recording in either public mode', () => {
      defineTypedFixtures();
      const preserved = new BlissSVGBuilder('ALGL').toJSON({ preserve: true }).groups[0].glyphs[0];
      expect(Object.hasOwn(preserved, '_aliasCodeName')).toBe(false);
      const plain = new BlissSVGBuilder('ALGL').toJSON().groups[0].glyphs[0];
      expect(Object.hasOwn(plain, '_aliasCodeName')).toBe(false);
      // hand-authored recordings must not pass through public output either
      const handAuthored = new BlissSVGBuilder({
        groups: [{ glyphs: [{ _aliasCodeName: 'MYSH2', parts: [{ codeName: 'C8' }] }] }],
      }).toJSON().groups[0].glyphs[0];
      expect(Object.hasOwn(handAuthored, '_aliasCodeName')).toBe(false);
    });

    it('keeps deep output raw so the delta pipeline sees the typed target', () => {
      defineTypedFixtures();
      // pins the deep/public restore split: deep keeps the resolved typed
      // name plus the recording (serializeCustomGlyphDelta must compute
      // divergence against the typed definition), public restores the name
      const deep = new BlissSVGBuilder('ALGL').toJSON({ preserve: true, deep: true }).groups[0].glyphs[0];
      expect(deep.codeName).toBe('MYGL1');
      expect(deep._aliasCodeName).toBe('ALGL');
    });

    it('reconstructs from preserve toJSON with identical render and stable emission', () => {
      defineTypedFixtures();
      defineAndTrack({ MYSHOP: { type: 'shape', codeString: '[color=red]>C8' } });
      defineAndTrack({ ALSHOP: { codeString: 'MYSHOP' } });
      for (const code of ['MYSH2', 'ALGL', 'MYSHOP', 'ALSHOP']) {
        const b = new BlissSVGBuilder(code);
        const rebuilt = new BlissSVGBuilder(b.toJSON({ preserve: true }));
        expect(rebuilt.svgCode).toBe(b.svgCode);
        expect(rebuilt.toString({ preserve: true })).toBe(code);
      }
    });

    it('keeps the name for object input naming the code, byte-equal to the DSL form', () => {
      defineTypedFixtures();
      const shape = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'MYSH2', parts: [{ codeName: 'C8' }, { codeName: 'C2', x: 3, y: 3 }] }] }],
      });
      expect(shape.toString({ preserve: true }))
        .toBe(new BlissSVGBuilder('MYSH2').toString({ preserve: true }));
      const alias = new BlissSVGBuilder({
        groups: [{ glyphs: [{ codeName: 'ALGL', parts: [{ codeName: 'C8' }] }] }],
      });
      expect(alias.toString({ preserve: true })).toBe('ALGL');
    });
  });

  describe('when preserved names flow through mutation and merge', () => {
    it('survives an unrelated mutation rebuild', () => {
      defineTypedFixtures();
      const b = new BlissSVGBuilder('ALGL');
      b.addGroup('B208');
      expect(b.toString({ preserve: true })).toBe('ALGL//B208');
    });

    it('survives merge into another builder', () => {
      defineTypedFixtures();
      const target = new BlissSVGBuilder('B208');
      target.merge(new BlissSVGBuilder('MYSH2'));
      expect(target.toString({ preserve: true })).toBe('B208//MYSH2');
      const target2 = new BlissSVGBuilder('B208');
      target2.merge(new BlissSVGBuilder('ALGL'));
      expect(target2.toString({ preserve: true })).toBe('B208//ALGL');
    });
  });

  describe('when built-ins and letter aliases stay untouched', () => {
    it('keeps built-in composite-shape emission unchanged', () => {
      expect(new BlissSVGBuilder('RA8NW').toString({ preserve: true })).toBe('RA8NW');
      expect(new BlissSVGBuilder('RA8NW').toString()).toBe('RA8NW');
    });

    it('keeps a bare alias to a built-in composite shape on the part channel', () => {
      defineAndTrack({ ALRA: { codeString: 'RA8NW' } });
      expect(new BlissSVGBuilder('ALRA').toString({ preserve: true })).toBe('ALRA');
      expect(new BlissSVGBuilder('ALRA:2,3').toString({ preserve: true })).toBe('ALRA:2,3');
    });

    it('keeps letter-alias emission unchanged', () => {
      const b = new BlissSVGBuilder('B29');
      expect(b.toString()).toBe('Xa');
      expect(b.toString({ preserve: true })).toBe('B29');
    });
  });
});
