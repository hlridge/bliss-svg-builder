import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the round-trip identity contract: a builder constructed from a
 * source input must produce the same SVG as one constructed from the
 * source's toJSON() (or toString()) output. Round-trip is the load-bearing
 * guarantee that toJSON()/toString() carry every load-bearing detail of
 * the parsed tree forward into a fresh build.
 *
 * Covers:
 * - Round-trip through toJSON(): basic strings, multi-glyph words, multi-words,
 *   shapes, external glyphs (Xa, XHello), bare-alias B-codes (B29), and
 *   constructor-default options.
 * - Round-trip through toString(): basic strings, ;-compositions, and the
 *   full set of option-bearing forms (global, group, glyph, part, RK/AK
 *   kerning markers).
 * - Scenario coverage: explicit /TSP/ /QSP/, positioned B-codes, indicators
 *   (single, multiple, word-level ;;), bracket options at all scopes,
 *   custom-defined alias and composition codes, external glyphs and text
 *   fallback (XTXT_ path), multi-word/deep-composition edge cases, broader
 *   parameterized SVG-equivalence set, and { deep: true } toJSON.
 * - XTXT_ singleton isolation: rendering text-fallback codes does not pollute
 *   the global definitions registry, and two builders with different XTXT_
 *   inputs produce independent output.
 *
 * Does NOT cover:
 * - The toJSON() shape itself; see `BlissSVGBuilder.json-output.test.js`.
 * - The toString() output format; see `BlissSVGBuilder.string-output.test.js`.
 * - Element keys (which intentionally do not round-trip); see
 *   `BlissSVGBuilder.element-keys.test.js`.
 * - Idempotency (same builder, repeated reads); see
 *   `BlissSVGBuilder.svg-code-idempotency.test.js`.
 */
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

describe('BlissSVGBuilder round-trip identity', () => {

  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch {}
    }
    customCodes.length = 0;
  });

  describe('when round-tripping canonical inputs through toJSON', () => {
    const testCases = [
      'B291',
      'B291/B292',
      'B291//B292',
      'B291/B292//B293/B294',
      'H',
      'Xa',
      'B29',              // bare alias (B29 → Xa)
      'XHello',
    ];

    for (const input of testCases) {
      it(`produces identical SVG for "${input}"`, () => {
        const original = new BlissSVGBuilder(input);
        const json = original.toJSON();
        const roundTripped = new BlissSVGBuilder(json);
        expect(roundTripped.svgCode).toBe(original.svgCode);
      });
    }

    it('preserves global options through round-trip', () => {
      const original = new BlissSVGBuilder('[color=red]||B291');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('preserves object options through round-trip', () => {
      const original = new BlissSVGBuilder('B291', { defaults: { color: 'blue' } });
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping canonical inputs through toString', () => {
    // toString() now preserves B-codes as normalized character codes
    const testCases = [
      'B291',
      'B291/B292',
      'B291//B292',
      'H',
      'Xa',
      'H;E:10,0',
    ];

    for (const input of testCases) {
      it(`produces identical SVG for "${input}"`, () => {
        const original = new BlissSVGBuilder(input);
        const str = original.toString();
        const roundTripped = new BlissSVGBuilder(str);
        expect(roundTripped.svgCode).toBe(original.svgCode);
      });
    }
  });

  describe('when round-tripping toString output for various option scopes', () => {
    const optionCases = [
      '[color=red]||B291',
      '[grid]||B291',
      '[color=red;stroke-width=0.3]||H',
      '[color=blue]|B291//B292',
      '[stroke-width=0.4]||[color=blue]|B291//B292',
      '[color=red]>H;E:10,0',
      '[color=green]B291//B292',
      'B291/RK:2/B292',
      'B291/AK:5/B292',
    ];

    for (const input of optionCases) {
      it(`round-trip produces identical SVG for "${input}"`, () => {
        const original = new BlissSVGBuilder(input);
        const roundTripped = new BlissSVGBuilder(original.toString());
        expect(roundTripped.svgCode).toBe(original.svgCode);
      });
    }
  });

  describe('when round-tripping explicit space glyphs through toJSON', () => {
    it('explicit /TSP/ round-trips with identical SVG', () => {
      const original = new BlissSVGBuilder('B291/TSP/B292');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('explicit /QSP/ round-trips with identical SVG', () => {
      const original = new BlissSVGBuilder('B291/QSP/B292');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('round-trips via constructor', () => {
      const original = new BlissSVGBuilder('B291//B292');
      const raw = original.toJSON();
      const rebuilt = new BlissSVGBuilder(raw);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping positioned B-codes and kerning', () => {
    it('positioned B-code round-trips with identical SVG', () => {
      const original = new BlissSVGBuilder('B291:2,2');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('explicit coordinates: H:5,3', () => {
      const original = new BlissSVGBuilder('H:5,3');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('relative kerning: B291/RK:2/B292', () => {
      const original = new BlissSVGBuilder('B291/RK:2/B292');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping with stripped nested parts', () => {
    it('round-trips via constructor with stripped parts', () => {
      const original = new BlissSVGBuilder('B291');
      const json = original.toJSON();
      expect(json.groups[0].glyphs[0].parts[0].parts).toBeUndefined();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('complex composition round-trips with stripped parts', () => {
      const original = new BlissSVGBuilder('B368/B428;B81;B97/B232//B291');
      const json = original.toJSON();
      for (const group of json.groups) {
        for (const glyph of group.glyphs || []) {
          for (const part of glyph.parts || []) {
            expect(part.parts).toBeUndefined();
          }
        }
      }
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('round-trips with options', () => {
      const original = new BlissSVGBuilder('[color=red]||B291//B292');
      const json = original.toJSON();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('round-trips with indicators', () => {
      const original = new BlissSVGBuilder('B291;B86');
      const json = original.toJSON();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('round-trips with kerning', () => {
      const original = new BlissSVGBuilder('B291/RK:2/B292');
      const json = original.toJSON();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('round-trips with deep composition', () => {
      const original = new BlissSVGBuilder('H;E:10,0;B313:20,0');
      const json = original.toJSON();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping characters with indicators', () => {
    it('character with indicator: B291;B86', () => {
      const original = new BlissSVGBuilder('B291;B86');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('word-level ;; indicator: B486/B368;;B86', () => {
      const original = new BlissSVGBuilder('B486/B368;;B86');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('character with multiple indicators', () => {
      const original = new BlissSVGBuilder('B291;B86;B87');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping inputs with bracket options', () => {
    it('element-level options: [color=red]|B291', () => {
      const original = new BlissSVGBuilder('[color=red]|B291');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('boolean option: [grid]||B291', () => {
      const original = new BlissSVGBuilder('[grid]||B291');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('global + group-level options combined', () => {
      const original = new BlissSVGBuilder('[stroke-width=0.4]||[color=blue]|B291//B292');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping with custom-defined codes', () => {
    it('alias definition round-trips', () => {
      customCodes.push('MY_ALIAS');
      BlissSVGBuilder.define({ MY_ALIAS: { codeString: 'B291' } });
      const original = new BlissSVGBuilder('MY_ALIAS');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('composition definition round-trips', () => {
      customCodes.push('MY_COMP');
      BlissSVGBuilder.define({ MY_COMP: { codeString: 'H;E:10,0' } });
      const original = new BlissSVGBuilder('MY_COMP');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('leading-semicolon (baseless) custom glyph round-trips as a nested part', () => {
      // R15 Task 2 follow-up: a custom glyph whose codeString begins with ';'
      // (an empty base). Used as a nested ;-part, default toJSON strips the
      // sub-parts to {codeName}, so reconstruction re-expands the codeString
      // through the second split site (#parseCodeStringToParts), which must
      // also drop the empty leading segment. Otherwise the round-trip injects a
      // failed empty part: spurious UNKNOWN_CODE + divergent render.
      customCodes.push('MY_BASELESS');
      BlissSVGBuilder.define({ MY_BASELESS: { type: 'glyph', codeString: ';B86;B97' } });
      const original = new BlissSVGBuilder('B291;MY_BASELESS');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.warnings.filter(w => w.code === 'UNKNOWN_CODE')).toEqual([]);
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('custom glyph with a trailing-empty codeString round-trips as a nested part', () => {
      // Pins the drop-ALL-empties scope of the nested-expansion site (not just a
      // leading ';'): a definition codeString with a trailing ';' must also
      // re-expand cleanly from a toJSON-stripped nested part. A leading-only
      // filter would inject a failed empty part here (UNKNOWN_CODE + divergence).
      customCodes.push('MY_TRAILING');
      BlissSVGBuilder.define({ MY_TRAILING: { type: 'glyph', codeString: 'B86;B97;' } });
      const original = new BlissSVGBuilder('B291;MY_TRAILING');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.warnings.filter(w => w.code === 'UNKNOWN_CODE')).toEqual([]);
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping external glyphs and text fallback', () => {
    it('single external glyph: Xa', () => {
      const original = new BlissSVGBuilder('Xa');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('multi-char external: XHello', () => {
      const original = new BlissSVGBuilder('XHello');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('text fallback with accented chars (XTXT_ path)', () => {
      const original = new BlissSVGBuilder('Xhéllo');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping multi-word and deep-composition edge cases', () => {
    it('deep composition: H;E:10,0;B313:20,0', () => {
      const original = new BlissSVGBuilder('H;E:10,0;B313:20,0');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('single shape: H', () => {
      const original = new BlissSVGBuilder('H');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it('multiple words with compositions', () => {
      const original = new BlissSVGBuilder('B291/B292//B313;B86');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping the broader SVG-equivalence set through toJSON', () => {
    const equivalenceCases = [
      'B291',
      'B291/B292',
      'B291//B292',
      'B291;B86',
      'H;E:10,0',
      'Xa',
      'XHello',
      'B291/RK:2/B292',
      '[color=red]||B291',
      '[grid]||B291//B292',
    ];

    for (const input of equivalenceCases) {
      it(`toJSON round-trip: "${input}"`, () => {
        const original = new BlissSVGBuilder(input);
        const rebuilt = new BlissSVGBuilder(original.toJSON());
        expect(rebuilt.svgCode).toBe(original.svgCode);
      });
    }
  });

  describe('when XTXT_ inputs round-trip without polluting global state', () => {
    it('rendering XTXT_ codes does not pollute global definitions', () => {
      new BlissSVGBuilder('Xhéllo');
      const xtxtKeys = Object.keys(blissElementDefinitions).filter(k => k.startsWith('XTXT_'));
      expect(xtxtKeys).toHaveLength(0);
    });

    it('two builders with different XTXT_ codes produce correct independent output', () => {
      const builder1 = new BlissSVGBuilder('Xhéllo');
      const builder2 = new BlissSVGBuilder('Xwörld');
      // Both should render without error and produce different SVG
      expect(builder1.svgCode).toContain('<svg');
      expect(builder2.svgCode).toContain('<svg');
      expect(builder1.svgCode).not.toBe(builder2.svgCode);
    });

    it('XTXT_ text fallback round-trips through JSON', () => {
      const original = new BlissSVGBuilder('Xhéllo');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping bare-alias B-codes that resolve to X-codes', () => {
    // B29 → Xa is a bare alias: resolves transparently to the X-code.
    it('B29 (bare alias to Xa) round-trips with identical SVG', () => {
      const original = new BlissSVGBuilder('B29');
      const json = original.toJSON();
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('Xa');
      expect(part.parts).toBeUndefined();
      const rebuilt = new BlissSVGBuilder(json);
      expect(rebuilt.svgCode).toBe(original.svgCode);
      expect(rebuilt.warnings).toHaveLength(0);
    });

    it('B30 (bare alias to Xb) round-trips with identical SVG', () => {
      const original = new BlissSVGBuilder('B30');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('bare alias in composition: B29;B86 round-trips', () => {
      const original = new BlissSVGBuilder('B29;B86');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });

  describe('when round-tripping with the toJSON deep option', () => {
    it('deep round-trip produces identical SVG', () => {
      const original = new BlissSVGBuilder('B313/B1103');
      const rebuilt = new BlissSVGBuilder(original.toJSON({ deep: true }));
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });
  });
});
