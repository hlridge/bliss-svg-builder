import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the character-level bare-alias preserve contract (run-to-stable
 * Chunk 6): `preserve` keeps the written name of a bare alias whose chain
 * bottoms out at a definition with identity (a glyph, an indicator, a shape,
 * or a getPath primitive), on every input surface, while default emission
 * stays decomposed and byte-stable.
 *
 * Covers:
 * - Standalone, in-word, option-prefixed, coordinate-suffixed, and
 *   head-designated character-level alias forms under preserve.
 * - Alias chains: outermost written name wins; multi-part and
 *   coordinate-decorated shorthand dissolves; unknown targets stay resolved.
 * - Divergence safety: a glyph that no longer equals the pure rename
 *   (applyIndicators, addPart, object input with extra parts, flattened
 *   overlays) decomposes its base instead of emitting an unreparseable
 *   `ALIAS;part` string.
 * - DSL/API/object-input parity, toJSON restoration and no-leak, mutation
 *   and merge() survival, reparse without the definition.
 *
 * Does NOT cover:
 * - `;`-part-slot alias preserve (the original 2.3b side channel), see
 *   `BlissSVGBuilder.custom-definition-serialization.test.js`.
 * - `type: 'glyph'` identity and indicator-delta serialization, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 * - Default-mode alias transparency doctrine, see
 *   `BlissSVGBuilder.custom-aliases.test.js`.
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

// The backlog row's canonical example: a faithful rename of a built-in glyph.
const defineLove = () => defineAndTrack({ LOVE: { codeString: 'B431' } });

describe('BlissSVGBuilder character-level alias preserve', () => {

  describe('when preserve serializes a standalone bare alias', () => {
    it('keeps the written name for a bare alias to a built-in glyph', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE');
      expect(b.toString()).toBe('B431');
      expect(b.toString({ preserve: true })).toBe('LOVE');
      expect(b.warnings).toEqual([]);
    });

    it('keeps the name in-word and under an option prefix', () => {
      defineLove();
      expect(new BlissSVGBuilder('LOVE/B313').toString({ preserve: true })).toBe('LOVE/B313');
      expect(new BlissSVGBuilder('[color=red]LOVE').toString({ preserve: true }))
        .toBe('[color=red]LOVE');
    });

    it('keeps a coordinate suffix on the name', () => {
      defineLove();
      expect(new BlissSVGBuilder('LOVE:2,3').toString({ preserve: true })).toBe('LOVE:2,3');
    });

    it('keeps the name on a designated head glyph', () => {
      defineLove();
      expect(new BlissSVGBuilder('B313/LOVE^').toString({ preserve: true })).toBe('B313/LOVE^');
    });

    it('normalizes an inert trailing ; away and keeps the name', () => {
      defineLove();
      expect(new BlissSVGBuilder('LOVE;').toString({ preserve: true })).toBe('LOVE');
    });

    it('renders the preserve emission identically on reparse', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B431').svgCode);
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps names for aliases to a shape, an indicator, and a getPath primitive', () => {
      defineAndTrack({ BASH: { codeString: 'C2' } });
      defineAndTrack({ BIND: { codeString: 'B81' } });
      defineAndTrack({ QPRIM: { getPath: (x, y) => `M${x},${y}h2v2h-2Z`, width: 2, height: 2 } });
      defineAndTrack({ ALPR: { codeString: 'QPRIM' } });
      expect(new BlissSVGBuilder('BASH').toString({ preserve: true })).toBe('BASH');
      expect(new BlissSVGBuilder('BIND').toString({ preserve: true })).toBe('BIND');
      expect(new BlissSVGBuilder('ALPR').toString({ preserve: true })).toBe('ALPR');
    });

    it('keeps the name on a defaultOptions-carrying alias with stable render', () => {
      defineAndTrack({ DOPT: { codeString: 'B431', defaultOptions: { color: 'red' } } });
      const b = new BlissSVGBuilder('DOPT');
      expect(b.toString()).toBe('[color=red]B431');
      expect(b.toString({ preserve: true })).toBe('[color=red]DOPT');
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps an empty-base slot alias name as the sole part', () => {
      defineAndTrack({ BAREPRIM: { codeString: 'C2' } });
      const b = new BlissSVGBuilder(';BAREPRIM');
      expect(b.toString({ preserve: true })).toBe('BAREPRIM');
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('keeps default emission decomposed and byte-stable', () => {
      defineLove();
      // pins default byte-identity: the fix is preserve-only
      expect(new BlissSVGBuilder('LOVE').toString()).toBe('B431');
      expect(new BlissSVGBuilder('LOVE/B313').toString()).toBe('B431/B313');
      expect(new BlissSVGBuilder('[color=red]LOVE').toString()).toBe('[color=red]B431');
      expect(new BlissSVGBuilder('B313/LOVE^').toString()).toBe('B313/B431^');
    });
  });

  describe('when an alias chain resolves through other definitions', () => {
    it('keeps the outermost written name when the chain bottoms out at a built-in', () => {
      defineLove();
      defineAndTrack({ LOVE2: { codeString: 'LOVE' } });
      const b = new BlissSVGBuilder('LOVE2');
      expect(b.toString()).toBe('B431');
      expect(b.toString({ preserve: true })).toBe('LOVE2');
    });

    it('resolves component names inside a word alias at define time', () => {
      defineLove();
      defineAndTrack({ PAIR: { codeString: 'LOVE/B313' } });
      defineAndTrack({ MW: { codeString: 'LOVE//B313' } });
      // define() flattens bare-alias tokens inside a codeString at
      // registration (#resolveBareAliases), so the registered shorthand IS
      // the explicit composition; only the written form keeps the name
      expect(new BlissSVGBuilder('PAIR').toString()).toBe('B431/B313');
      expect(new BlissSVGBuilder('PAIR').toString({ preserve: true })).toBe('B431/B313');
      expect(new BlissSVGBuilder('MW').toString({ preserve: true })).toBe('B431//B313');
      expect(new BlissSVGBuilder('LOVE/B313').toString({ preserve: true })).toBe('LOVE/B313');
    });

    it('dissolves a name whose chain ends in multi-part shorthand', () => {
      defineAndTrack({ PAIRISH: { codeString: 'B1103;B81' } });
      defineAndTrack({ SHORT: { codeString: 'PAIRISH' } });
      // pins the dissolve rule: multi-code shorthand serializes expanded with
      // or without preserve, and a single-code alias to it dissolves with it
      expect(new BlissSVGBuilder('PAIRISH').toString({ preserve: true })).toBe('B1103;B81');
      expect(new BlissSVGBuilder('SHORT').toString({ preserve: true })).toBe('B1103;B81');
      expect(new BlissSVGBuilder('SHORT').toString()).toBe('B1103;B81');
    });

    it('dissolves a name whose chain ends in coordinate-decorated shorthand', () => {
      defineAndTrack({ POSAL: { codeString: 'B1103:2,3' } });
      defineAndTrack({ SHORT2: { codeString: 'POSAL' } });
      expect(new BlissSVGBuilder('POSAL').toString({ preserve: true })).toBe('B1103:2,3');
      expect(new BlissSVGBuilder('SHORT2').toString({ preserve: true })).toBe('B1103:2,3');
    });

    it('leaves a forward-referenced unknown target resolved', () => {
      defineAndTrack({ FUTREF: { codeString: 'ZZZ9' } });
      // ratified rule: the name is kept only when the chain bottoms out at a
      // definition with identity; an unresolved forward ref has none yet.
      // (The `;`-slot twin keeps the name via the 2.3b rename site instead.)
      const b = new BlissSVGBuilder('FUTREF');
      expect(b.toString({ preserve: true })).toBe('ZZZ9');
      expect(b.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
    });

    it('re-emits the target name for an alias to a custom typed glyph', () => {
      defineAndTrack({ MYGL1: { type: 'glyph', codeString: 'C8' } });
      defineAndTrack({ ALGL: { codeString: 'MYGL1' } });
      // registered facet: the typed target's own (preserved) name governs; the
      // written alias token is not restored on the glyphCode identity path
      expect(new BlissSVGBuilder('ALGL').toString({ preserve: true })).toBe('MYGL1');
      // pins the transfer's glyphCode guard: the typed identity path leaves
      // the part resolved instead of carrying an unused alias recording
      expect(new BlissSVGBuilder('ALGL').toJSON({ preserve: true })
        .groups[0].glyphs[0].parts[0].codeName).toBe('C8');
    });

    it.todo('keeps the written alias name over a custom typed glyph target (registered facet, backlog: alias-to-typed-glyph written-name restoration)');

    it('keeps the written name for an alias to a custom typed sole-part shape', () => {
      defineAndTrack({ MYSH1: { type: 'shape', codeString: 'C8' } });
      defineAndTrack({ ALSH: { codeString: 'MYSH1' } });
      expect(new BlissSVGBuilder('ALSH').toString({ preserve: true })).toBe('ALSH');
      // pins the bare-alias discriminator: a TYPED definition takes the
      // identity path, not the rename side channel (its standalone name loss
      // is the registered standalone-typed-shape gap, see the todo below)
      expect(new BlissSVGBuilder('MYSH1').toString({ preserve: true })).toBe('C8');
    });

    it('keeps a surviving forward-referenced component name in a word alias', () => {
      // a word codeString holding a then-unregistered token cannot flatten at
      // define time, so the component alias survives to parse and its name
      // rides the expansion (pins the map propagation of the recording)
      defineAndTrack({ WFUT: { codeString: 'FUT/B313' } });
      defineAndTrack({ FUT: { codeString: 'B431' } });
      const b = new BlissSVGBuilder('WFUT');
      expect(b.toString()).toBe('B431/B313');
      expect(b.toString({ preserve: true })).toBe('FUT/B313');
      // non-head position rides the same propagation
      defineAndTrack({ WMID: { codeString: 'B313/FUTB' } });
      defineAndTrack({ FUTB: { codeString: 'B431' } });
      expect(new BlissSVGBuilder('WMID').toString({ preserve: true })).toBe('B313/FUTB');
    });

    it.todo('keeps a typed shape name standalone at character level (registered gap, backlog: standalone typed-shape identity; MYSH1 emits C8 today)');

    it('keeps a space alias serializing as its canonical space code', () => {
      defineAndTrack({ SPAL: { codeString: 'QSP' } });
      // pins the space exclusion: spaces take no custom identity, so the
      // serialized space stays canonical in both modes
      expect(new BlissSVGBuilder('B313/SPAL/B208').toString({ preserve: true }))
        .toBe('B313/QSP/B208');
    });
  });

  describe('when the glyph diverges from the pure rename', () => {
    it('decomposes the base after applyIndicators instead of emitting ALIAS;part', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE');
      b.glyph(0).applyIndicators('B81');
      // pins the sole-part restore guard: 'LOVE;B81' would drop B81 on
      // reparse (a `;`-part on a bare-alias base is misplaced)
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('B431;B81');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('decomposes the base after addPart and keeps a replaced part resolved', () => {
      defineLove();
      const added = new BlissSVGBuilder('LOVE');
      added.glyph(0).addPart('C8');
      expect(added.toString({ preserve: true })).toBe('B431;C8');
      const replaced = new BlissSVGBuilder('LOVE');
      replaced.glyph(0).replacePart(0, 'C8');
      expect(replaced.toString({ preserve: true })).toBe('C8');
    });

    it('round-trips object input that puts a part beside the alias base', () => {
      defineLove();
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'LOVE' }, { codeName: 'B81' }] }] }],
      });
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('B431;B81');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
      // same rule for the rename-recorded flavor (primitive target)
      defineAndTrack({ BAREPRIM: { codeString: 'C2' } });
      const renamed = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'BAREPRIM' }, { codeName: 'C8' }] }] }],
      });
      expect(renamed.toString({ preserve: true })).toBe('C2;C8');
    });

    it('keeps a typed custom name heading a part list', () => {
      // a typed base dumb-appends on reparse, so preserve keeps its name even
      // with `;`-siblings; only the bare-alias base decomposes
      defineAndTrack({ MYGL1: { type: 'glyph', codeString: 'C8' } });
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'MYGL1' }, { codeName: 'B81' }] }] }],
      });
      const emitted = b.toString({ preserve: true });
      expect(emitted).toBe('MYGL1;B81');
      expect(new BlissSVGBuilder(emitted).svgCode).toBe(b.svgCode);
    });

    it('keeps the overlay form and decomposes only the flattened base', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE;;B81');
      expect(b.toString()).toBe('B431;;B81');
      expect(b.toString({ preserve: true })).toBe('LOVE;;B81');
      const flattened = b.toString({ flattenIndicators: true, preserve: true });
      expect(flattened).toBe('B431;B81');
      expect(new BlissSVGBuilder(flattened).svgCode).toBe(b.svgCode);
    });

    it('keeps the name after a misplaced ;-part is warned and dropped', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE;B81');
      expect(b.warnings.map(w => w.code)).toContain('MISPLACED_CHARACTER_INDICATOR');
      expect(b.toString({ preserve: true })).toBe('LOVE');
    });
  });

  describe('when API-built and object input mirror the DSL', () => {
    it('keeps the name for sole-part object input, byte-equal to the DSL form', () => {
      defineLove();
      const obj = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'LOVE' }] }] }] });
      expect(obj.toString({ preserve: true })).toBe('LOVE');
      expect(obj.toString({ preserve: true }))
        .toBe(new BlissSVGBuilder('LOVE').toString({ preserve: true }));
    });

    it('keeps the name through addGroup and insertGlyph, byte-equal to the DSL form', () => {
      defineLove();
      const grown = new BlissSVGBuilder('B208');
      grown.addGroup('LOVE');
      expect(grown.toString({ preserve: true })).toBe('B208//LOVE');
      const inserted = new BlissSVGBuilder('B313/B208');
      inserted.group(0).insertGlyph(1, 'LOVE');
      expect(inserted.toString({ preserve: true }))
        .toBe(new BlissSVGBuilder('B313/LOVE/B208').toString({ preserve: true }));
    });

    it('restores the name in preserve toJSON and leaks no alias metadata', () => {
      defineLove();
      const preserved = new BlissSVGBuilder('LOVE').toJSON({ preserve: true }).groups[0].glyphs[0].parts[0];
      expect(preserved.codeName).toBe('LOVE');
      expect(Object.hasOwn(preserved, '_aliasCodeName')).toBe(false);
      const plain = new BlissSVGBuilder('LOVE').toJSON().groups[0].glyphs[0].parts[0];
      expect(plain.codeName).toBe('B431');
      expect(Object.hasOwn(plain, '_aliasCodeName')).toBe(false);
    });

    it('reconstructs from preserve toJSON with identical render and stable emission', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE');
      const rebuilt = new BlissSVGBuilder(b.toJSON({ preserve: true }));
      expect(rebuilt.svgCode).toBe(b.svgCode);
      expect(rebuilt.toString({ preserve: true })).toBe('LOVE');
    });
  });

  describe('when preserved names flow through mutation and merge', () => {
    it('survives an unrelated mutation rebuild', () => {
      defineLove();
      const b = new BlissSVGBuilder('LOVE');
      b.addGroup('B208');
      expect(b.toString({ preserve: true })).toBe('LOVE//B208');
    });

    it('survives merge into another builder', () => {
      defineLove();
      const target = new BlissSVGBuilder('B208');
      target.merge(new BlissSVGBuilder('LOVE'));
      expect(target.toString({ preserve: true })).toBe('B208//LOVE');
    });
  });

  describe('when the definition is absent at reparse', () => {
    it('warns UNKNOWN_CODE and keeps the preserved string stable', () => {
      defineLove();
      const emitted = new BlissSVGBuilder('LOVE').toString({ preserve: true });
      BlissSVGBuilder.removeDefinition('LOVE');
      const foreign = new BlissSVGBuilder(emitted);
      expect(emitted).toBe('LOVE');
      expect(foreign.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(foreign.toString()).toBe('LOVE');
    });
  });
});
