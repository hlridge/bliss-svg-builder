import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins indicator-ness carrying through a single-code definition alias: a bare
 * alias whose codeString resolves (through single-code renames only) to an
 * indicator behaves as that indicator in every indicator slot, on every
 * surface (DSL `;;`, DSL `;` part, applyIndicators API, object input).
 *
 * Covers:
 * - `;;ALIAS` acceptance when ALIAS resolves to a built-in indicator (the
 *   GH #35 repro), including a chain through a flagged custom indicator
 *   glyph and a use-site coordinate suffix.
 * - The single-code-target guardrail: an alias to a multi-code composition
 *   stays rejected as NON_INDICATOR_AS_WORD_INDICATOR; aliases to
 *   non-indicators and to unknown codes stay rejected.
 * - `;`-part slot: `B291;ALIAS` renders byte-identically to `B291;B81` and
 *   its serialized form re-parses to the same SVG (parse-equivalence
 *   restored; svg round-trip was false before the fix).
 * - DSL/API parity: group-level applyIndicators, glyph-level
 *   applyIndicators, and addPart accept the alias exactly like the DSL.
 * - Object input (toJSON -> constructor) round-trips the alias overlay.
 * - Semantic classification carries: an alias to the semantic root B6436
 *   behaves as B6436 in the `;;` replace-all/preserve logic.
 *
 * Does NOT cover:
 * - define()-side validation of indicator anatomy (D-S1a, deferred
 *   validation of forward references); see
 *   `BlissSVGBuilder.define-hardening.test.js`.
 * - What a codeString alias may contain; see
 *   `BlissSVGBuilder.define-codestring-content.test.js`.
 * - Composed segments such as `SP;B81` inside definitions.
 *
 * @issue: #35
 */
describe('BlissSVGBuilder alias indicator carry', () => {

  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch {}
    }
    customCodes.length = 0;
  });

  function trackCode(code) {
    customCodes.push(code);
    return code;
  }

  // defines a bare alias to B81 (INDICATOR ACTION) under a tracked name
  function defineActionAlias(name) {
    BlissSVGBuilder.define({ [trackCode(name)]: { codeString: 'B81' } });
    return name;
  }

  const warningCodes = (builder) => builder.warnings.map(w => w.code);

  describe('when a ;; word indicator names an alias to an indicator', () => {
    it('accepts a 1:1 bare alias to a built-in indicator with zero warnings', () => {
      const alias = defineActionAlias('WIALIAS1');
      const builder = new BlissSVGBuilder(`B291;;${alias}`);
      expect(warningCodes(builder)).toEqual([]);
      expect(builder.toString()).toBe(`B291;;${alias}`);
    });

    it('renders the alias overlay byte-identically to the direct indicator', () => {
      const alias = defineActionAlias('WIALIAS2');
      const viaAlias = new BlissSVGBuilder(`B291;;${alias}`);
      const direct = new BlissSVGBuilder('B291;;B81');
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });

    it('accepts the GH #35 repro: a numeric alias to the indicator B6436', () => {
      // regression: see issue #35 (alias token was checked instead of the resolved target)
      BlissSVGBuilder.define({
        [trackCode('1219')]: { codeString: 'B297;B81/B1012/B401' },
        [trackCode('6436')]: { codeString: 'B6436' },
      });
      const builder = new BlissSVGBuilder('1219;;6436');
      expect(warningCodes(builder)).toEqual([]);
      const direct = new BlissSVGBuilder('B297;B81/B1012/B401;;B6436');
      expect(builder.svgCode).toBe(direct.svgCode);
    });

    it('accepts an alias chaining through a flagged custom indicator glyph', () => {
      BlissSVGBuilder.define({ [trackCode('CUSTIND1')]: { type: 'glyph', isIndicator: true, codeString: 'B86' } });
      BlissSVGBuilder.define({ [trackCode('WIALIAS3')]: { codeString: 'CUSTIND1' } });
      const builder = new BlissSVGBuilder('B291;;WIALIAS3');
      expect(warningCodes(builder)).toEqual([]);
    });

    it('places a flagged glyph over a non-indicator primitive like its ;-slot twin', () => {
      // review MAJOR-1: the ;; render-merge parsed the alias standalone, so it
      // never carried isIndicator/width from a definition whose target is not
      // itself an indicator (C2), placing the ink at the origin while the ;-slot
      // placed it at the indicator offset. The two surfaces now agree.
      BlissSVGBuilder.define({ [trackCode('PRIMIND1')]: { type: 'glyph', isIndicator: true, codeString: 'C2' } });
      const overlay = new BlissSVGBuilder('B291;;PRIMIND1');
      expect(warningCodes(overlay)).toEqual([]);
      expect(overlay.svgCode).toBe(new BlissSVGBuilder('B291;PRIMIND1').svgCode);
    });

    it('honors a use-site coordinate suffix on the alias', () => {
      const alias = defineActionAlias('WIALIAS4');
      const viaAlias = new BlissSVGBuilder(`B291;;${alias}:0,4`);
      const direct = new BlissSVGBuilder('B291;;B81:0,4');
      expect(warningCodes(viaAlias)).toEqual([]);
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });

    it('behaves as the semantic root when the alias resolves to B6436', () => {
      BlissSVGBuilder.define({ [trackCode('SEMAL1')]: { codeString: 'B6436' } });
      const viaAlias = new BlissSVGBuilder('B291;;SEMAL1');
      const direct = new BlissSVGBuilder('B291;;B6436');
      expect(warningCodes(viaAlias)).toEqual([]);
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });
  });

  describe('when a ;; word indicator names an alias outside the guardrail', () => {
    it('rejects an alias to a multi-code composition', () => {
      // pins the single-code-target guardrail (user ruling 2026-07-17):
      // composites qualify only via an explicit isIndicator flag
      BlissSVGBuilder.define({ [trackCode('CMPAL1')]: { codeString: 'B297;B81' } });
      const builder = new BlissSVGBuilder('B291;;CMPAL1');
      expect(warningCodes(builder)).toEqual(['NON_INDICATOR_AS_WORD_INDICATOR']);
      expect(builder.toString()).toBe('B291');
    });

    it('rejects an alias to a non-indicator shape', () => {
      BlissSVGBuilder.define({ [trackCode('SHPAL1')]: { codeString: 'C8' } });
      const builder = new BlissSVGBuilder('B291;;SHPAL1');
      expect(warningCodes(builder)).toEqual(['NON_INDICATOR_AS_WORD_INDICATOR']);
    });

    it('rejects an alias whose target is unknown', () => {
      BlissSVGBuilder.define({ [trackCode('UNKAL1')]: { codeString: 'ZZQQ99' } });
      const builder = new BlissSVGBuilder('B291;;UNKAL1');
      expect(warningCodes(builder)).toEqual(['NON_INDICATOR_AS_WORD_INDICATOR']);
    });
  });

  describe('when the applyIndicators API receives an alias to an indicator', () => {
    it('accepts it at group level, byte-equal to the DSL form', () => {
      const alias = defineActionAlias('WIALIAS5');
      const viaApi = new BlissSVGBuilder('B291');
      viaApi.group(0).applyIndicators(alias);
      const viaDsl = new BlissSVGBuilder(`B291;;${alias}`);
      expect(viaApi.warnings.map(w => w.code)).toEqual([]);
      expect(viaApi.toString()).toBe(viaDsl.toString());
      expect(viaApi.svgCode).toBe(viaDsl.svgCode);
    });

    it('accepts it at glyph level, rendering like the direct indicator', () => {
      const alias = defineActionAlias('WIALIAS6');
      const viaAlias = new BlissSVGBuilder('B291');
      viaAlias.group(0).glyph(0).applyIndicators(alias);
      const direct = new BlissSVGBuilder('B291');
      direct.group(0).glyph(0).applyIndicators('B81');
      expect(viaAlias.warnings.map(w => w.code)).toEqual([]);
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });
  });

  describe('when object input carries an alias overlay', () => {
    it('round-trips toJSON through the constructor byte-identically', () => {
      const alias = defineActionAlias('WIALIAS7');
      const original = new BlissSVGBuilder(`B291;;${alias}`);
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.toString()).toBe(original.toString());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });

  describe('when the alias definition carries its own defaultOptions', () => {
    it('applies them on both the ;-part and the ;; overlay surface', () => {
      // regression: the ;; render-merge parsed the alias standalone, landing
      // its defaultOptions at glyph level where the extracted part never saw
      // them, so ; and ;; diverged (review MINOR-2, 2026-07-18)
      BlissSVGBuilder.define({ [trackCode('DEFOPTIND1')]: { codeString: 'B81', defaultOptions: { color: 'red' } } });
      expect(new BlissSVGBuilder('B291;DEFOPTIND1').svgCode).toMatch(/red/);
      expect(new BlissSVGBuilder('B291;;DEFOPTIND1').svgCode).toMatch(/red/);
    });
  });

  describe('when the alias chain runs through a digit-leading name', () => {
    it('resolves a forward reference to a digit-named indicator alias', () => {
      // regression: the single-code-token pattern required a letter-first
      // name, so an alias to a Blissary-ID-style name (the documented define
      // example form) was misclassified as a non-indicator (review MINOR-4)
      BlissSVGBuilder.define({ [trackCode('DIGAL1')]: { codeString: '9112' } });
      BlissSVGBuilder.define({ [trackCode('9112')]: { codeString: 'B81' } });
      const viaChain = new BlissSVGBuilder('B291;;DIGAL1');
      const direct = new BlissSVGBuilder('B291;;B81');
      expect(viaChain.warnings).toEqual([]);
      expect(viaChain.svgCode).toBe(direct.svgCode);
    });

    it('resolves a digit-named alias reference at parse time', () => {
      // store-as-written (2026-07-22): the reference stores verbatim; the
      // ;; gate still resolves the digit-named chain at the use site
      BlissSVGBuilder.define({ [trackCode('9111')]: { codeString: 'B81' } });
      BlissSVGBuilder.define({ [trackCode('DIGAL2')]: { codeString: '9111' } });
      expect(BlissSVGBuilder.getDefinition('DIGAL2').codeString).toBe('9111');
      expect(new BlissSVGBuilder('B291;;DIGAL2').warnings).toEqual([]);
      expect(new BlissSVGBuilder('B291;;DIGAL2').svgCode).toBe(new BlissSVGBuilder('B291;;B81').svgCode);
    });
  });

  describe('when hand-authored object input names an alias part without flags', () => {
    it('derives indicator-ness from the registry, rendering like the direct part', () => {
      // a documented-schema part carries only codeName; isIndicator is
      // derivable metadata, so the expansion must re-derive it through the
      // alias (kills the #expandPartRecursive effective-metadata removal)
      const alias = defineActionAlias('OBJALIAS1');
      const viaObject = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: alias }] }] }] });
      const direct = new BlissSVGBuilder('B291;B81');
      expect(viaObject.svgCode).toBe(direct.svgCode);
    });

    it('resolves a forward-defined alias inside a nested definition expansion', () => {
      // the wrap must reference the alias BEFORE it exists: define-time
      // bare-alias inlining would otherwise collapse the alias away, and the
      // nested expansion would never see it. The stored verbatim reference
      // resolves at parse time through the alias. Parity pin only: the
      // #parseCodeStringToParts effective-metadata call is a recorded
      // near-equivalent (sub-part flags have no observable consumer today;
      // see mutation-testing.md, Phase 2.3 addendum)
      BlissSVGBuilder.define({ [trackCode('OBJWRAP1')]: { codeString: 'B291;OBJLATER1' } });
      defineActionAlias('OBJLATER1');
      BlissSVGBuilder.define({ [trackCode('OBJWRAP2')]: { codeString: 'B291;B81' } });
      expect(BlissSVGBuilder.getDefinition('OBJWRAP1').codeString).toBe('B291;OBJLATER1');
      const viaAlias = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'OBJWRAP1' }] }] }] });
      const viaDirect = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'OBJWRAP2' }] }] }] });
      expect(viaAlias.svgCode).toBe(viaDirect.svgCode);
    });
  });

  describe('when an alias to an indicator is a ; part', () => {
    it('renders byte-identically to the direct indicator part', () => {
      // regression: B291;ALIAS rendered the ink as a plain stacked part at
      // x=0 while serializing to B291;B81 (indicator placement) - svg
      // round-trip was false (Phase 2.3 probe 2026-07-18)
      const alias = defineActionAlias('PIALIAS1');
      const viaAlias = new BlissSVGBuilder(`B291;${alias}`);
      const direct = new BlissSVGBuilder('B291;B81');
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });

    it('re-parses its own serialized form to the same SVG', () => {
      const alias = defineActionAlias('PIALIAS2');
      const builder = new BlissSVGBuilder(`B291;${alias}`);
      const reparsed = new BlissSVGBuilder(builder.toString());
      expect(reparsed.svgCode).toBe(builder.svgCode);
    });

    it('warns MISPLACED_INDICATOR_PART like the direct form when followed by known content', () => {
      const alias = defineActionAlias('PIALIAS3');
      const viaAlias = new BlissSVGBuilder(`B291;${alias};C8`);
      const direct = new BlissSVGBuilder('B291;B81;C8');
      expect(viaAlias.warnings.map(w => w.code)).toEqual(direct.warnings.map(w => w.code));
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });

    it('keeps an alias to a non-indicator shape rendering as a plain part', () => {
      BlissSVGBuilder.define({ [trackCode('SHPAL2')]: { codeString: 'C8' } });
      const viaAlias = new BlissSVGBuilder('B291;SHPAL2');
      const direct = new BlissSVGBuilder('B291;C8');
      expect(viaAlias.svgCode).toBe(direct.svgCode);
    });

    it('accepts the alias through addPart exactly like the DSL part slot', () => {
      const alias = defineActionAlias('PIALIAS4');
      const viaApi = new BlissSVGBuilder('B291');
      viaApi.group(0).glyph(0).addPart(alias);
      const viaDsl = new BlissSVGBuilder(`B291;${alias}`);
      expect(viaApi.svgCode).toBe(viaDsl.svgCode);
    });
  });
});
