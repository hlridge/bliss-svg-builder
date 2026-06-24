import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the parser kerning surface: RK and AK marker grammar
 * (decimal forms, bare-value default, multi-digit values,
 * malformed-fallthrough) plus preservation of kerning markers
 * alongside glyph-level and part-level bracket options.
 *
 * Covers:
 * - Decimal forms accepted by both RK and AK (0.5, .5, 5., signed, zero).
 * - Multi-digit RK values (RK:25; pins regex \d+ quantifier).
 * - Decimal-only multi-digit RK values (RK:.55; pins the \.\d+ alternative
 *   quantifier).
 * - Bare RK defaulting to 0, both between glyphs and at the start of input.
 * - A malformed kerning value (RK:/AK: followed by a non-number: RK:., RK:abc,
 *   RK:.5.5, RK:5e2, RK:, AK:.) warns MALFORMED_KERNING_VALUE and applies no
 *   kerning (the marker is dropped, the next glyph unshifted), rather than the
 *   misleading UNKNOWN_CODE the general code parser would emit.
 * - Start-anchor on the kerning regex (`^(RK|AK)...$`): a glyph code that
 *   happens to end with `RK` or `AK` is treated as a code, not consumed
 *   as a trailing-anchored kerning instruction.
 * - Relative kerning preserved on glyphs with glyph-level, multi-option,
 *   and part-level bracket options, including across consecutive glyphs.
 * - Absolute kerning preserved on glyphs with glyph-level bracket options.
 * - Kerning options propagate through `//`-separated definition-expanded
 *   word references onto the first glyph of the following expanded word.
 *
 * Does NOT cover:
 * - Effect of kerning on rendered SVG positions, see
 *   `BlissSVGBuilder.spacing.test.js`.
 * - An options-API form for kerning. The DSL `RK:` / `AK:` markers are
 *   the only public surface; `relativeKerning` / `absoluteKerning` are
 *   internal field names on the parsed tree (visible in `toJSON()`),
 *   not advertised options. An options-API form would be a future
 *   feature, not a parity gap.
 *
 * @issue: #24
 * @contract: parser-kerning-grammar
 */
describe('BlissParser kerning', () => {
  const probe = (dsl) => {
    const r = new BlissSVGBuilder(`B313/${dsl}/B1103`);
    const groups = r.toJSON().groups;
    return groups[0].glyphs.map(g => ({
      codeName: g.codeName,
      relativeKerning: g.options?.relativeKerning,
      absoluteKerning: g.options?.absoluteKerning,
    }));
  };

  describe('when relative kerning is specified', () => {
    it.each([
      ['RK:0.5',  0.5],
      ['RK:.5',   0.5],
      ['RK:5',    5],
      ['RK:5.',   5],
      ['RK:-0.5', -0.5],
      ['RK:-.5',  -0.5],
      ['RK:-5',   -5],
      ['RK:+0.5', 0.5],
      ['RK:+.5',  0.5],
      ['RK:0',    0],
    ])('parses %s as relativeKerning=%s on the next glyph', (dsl, expected) => {
      const glyphs = probe(dsl);
      expect(glyphs).toHaveLength(2);
      expect(glyphs[1].codeName).toBe('B1103');
      expect(glyphs[1].relativeKerning).toBe(expected);
    });

    it('applies an integer RK to the next glyph', () => {
      const result = BlissParser.parse('B231/RK:4/B231');
      expect(result.groups[0].glyphs[1].options.relativeKerning).toBe(4);
    });

    it('accepts multi-digit RK values like RK:25', () => {
      // kills 2405 (\d+ → \d, single-digit only)
      const r = BlissParser.parse('RK:25/H');
      expect(r.groups[0].glyphs).toHaveLength(1);
      expect(r.groups[0].glyphs[0].options.relativeKerning).toBe(25);
    });

    it('accepts a multi-digit decimal-only RK value like RK:.55', () => {
      // pins the \.\d+ alternative quantifier; a decimal-only value with two+
      // fraction digits and no leading integer only matches with the `+`
      // (killed the \.\d+ -> \.\d mutant, 2026-05-21 stryker survivor)
      const r = BlissParser.parse('RK:.55/H');
      expect(r.groups[0].glyphs).toHaveLength(1);
      expect(r.groups[0].glyphs[0].options.relativeKerning).toBe(0.55);
    });

    it('bare RK with no value defaults to 0', () => {
      const glyphs = probe('RK');
      expect(glyphs).toHaveLength(2);
      expect(glyphs[1].relativeKerning).toBe(0);
    });

    it('accepts a bare RK at the start of input (defaults to 0)', () => {
      // kills 2402 (outer `?` removed → colon-value group required)
      const r = BlissParser.parse('RK/H');
      expect(r.groups[0].glyphs).toHaveLength(1);
      expect(r.groups[0].glyphs[0].options.relativeKerning).toBe(0);
    });
  });

  describe('when absolute kerning is specified', () => {
    it.each([
      ['AK:0.5',  0.5],
      ['AK:.5',   0.5],
      ['AK:-0.5', -0.5],
      ['AK:-.5',  -0.5],
      ['AK:+0.5', 0.5],
      ['AK:+.5',  0.5],
      ['AK:5.',   5],
    ])('parses %s as absoluteKerning=%s on the next glyph', (dsl, expected) => {
      const glyphs = probe(dsl);
      expect(glyphs).toHaveLength(2);
      expect(glyphs[1].codeName).toBe('B1103');
      expect(glyphs[1].absoluteKerning).toBe(expected);
    });

    it('applies an integer AK to the next glyph', () => {
      const result = BlissParser.parse('B231/AK:2/B231');
      expect(result.groups[0].glyphs[1].options.absoluteKerning).toBe(2);
    });
  });

  describe('when a kerning value is malformed', () => {
    // A kerning marker (RK:/AK:) whose value is not a valid number is dropped
    // with a MALFORMED_KERNING_VALUE warning; no kerning is applied (the next
    // glyph is unshifted). This is a FORMAT error (the value didn't parse),
    // distinct from a value/range error, so MALFORMED_ not INVALID_.
    it.each(['RK:.', 'RK:abc', 'RK:.5.5', 'RK:5e2', 'RK:', 'AK:.', 'AK:abc'])(
      'warns MALFORMED_KERNING_VALUE and applies no kerning for %s', (dsl) => {
        const b = new BlissSVGBuilder(`B313/${dsl}/B1103`);
        const glyphs = b.toJSON().groups[0].glyphs;
        expect(glyphs).toHaveLength(2);
        expect(glyphs[1].options?.relativeKerning).toBeUndefined();
        expect(glyphs[1].options?.absoluteKerning).toBeUndefined();
        expect(b.warnings.map(w => w.code)).toContain('MALFORMED_KERNING_VALUE');
      });

    it('names the malformed marker verbatim in the warning source', () => {
      const w = new BlissSVGBuilder('B291/RK:abc/B291').warnings;
      expect(w).toHaveLength(1);
      expect(w[0].code).toBe('MALFORMED_KERNING_VALUE');
      expect(w[0].source).toBe('RK:abc');
    });

    it('does not flag a code that merely contains RK:/AK: mid-token', () => {
      // pins the ^ anchor on the malformed-kerning regex: B86RK:abc is a code
      // (it does not START with RK:/AK:), so it must not be read as kerning.
      for (const dsl of ['B86RK:abc', 'B86AK:abc']) {
        const codes = new BlissSVGBuilder(`B313/${dsl}/B1103`).warnings.map(w => w.code);
        expect(codes).not.toContain('MALFORMED_KERNING_VALUE');
      }
    });
  });

  describe('when a glyph code happens to end with RK or AK', () => {
    // pins the start-anchor (`^`) on the kerning regex; without it, any
    // code ending with RK or AK would be consumed as a kerning instruction
    // (value 0) and silently dropped
    it.each(['B86RK', 'B86AK'])('treats %s as a code, not a trailing-matched kerning instruction', (codeEndingWithKerning) => {
      const glyphs = probe(codeEndingWithKerning);
      expect(glyphs[glyphs.length - 1].relativeKerning).toBeUndefined();
      expect(glyphs[glyphs.length - 1].absoluteKerning).toBeUndefined();
    });
  });

  describe('when relative kerning combines with bracket options', () => {
    it('preserves RK on a glyph with glyph-level options', () => {
      const result = BlissParser.parse('B231/RK:4/[color=green]B231');
      expect(result.groups[0].glyphs[1].options.relativeKerning).toBe(4);
      expect(result.groups[0].glyphs[1].options.color).toBe('green');
    });

    it('preserves RK alongside multiple glyph-level options', () => {
      const result = BlissParser.parse('H/RK:-2/[color=red;stroke-width=0.3]H');
      expect(result.groups[0].glyphs[1].options.relativeKerning).toBe(-2);
      expect(result.groups[0].glyphs[1].options.color).toBe('red');
      expect(result.groups[0].glyphs[1].options['stroke-width']).toBe('0.3');
    });

    it('preserves RK alongside part-level options', () => {
      const result = BlissParser.parse('H/RK:3/[color=red]>H:0,4');
      expect(result.groups[0].glyphs[1].options.relativeKerning).toBe(3);
    });

    it('applies RK markers and glyph-level options across consecutive glyphs', () => {
      const result = BlissParser.parse('H/RK:2/[color=red]H/RK:-1/[color=blue]H');
      expect(result.groups[0].glyphs[1].options.relativeKerning).toBe(2);
      expect(result.groups[0].glyphs[1].options.color).toBe('red');
      expect(result.groups[0].glyphs[2].options.relativeKerning).toBe(-1);
      expect(result.groups[0].glyphs[2].options.color).toBe('blue');
    });
  });

  describe('when absolute kerning combines with bracket options', () => {
    it('preserves AK on a glyph with glyph-level options', () => {
      const result = BlissParser.parse('B231/AK:2/[color=blue]B231');
      expect(result.groups[0].glyphs[1].options.absoluteKerning).toBe(2);
      expect(result.groups[0].glyphs[1].options.color).toBe('blue');
    });
  });

  describe('when kerning markers precede a definition-expanded word', () => {
    const KERN_DEFS = {
      BlissChar: { codeString: 'HL2;HL2:0,2' },
      BlissWord: { codeString: 'BlissChar/BlissChar' },
    };
    beforeAll(() => BlissSVGBuilder.define(KERN_DEFS));
    afterAll(() => Object.keys(KERN_DEFS).forEach(k => BlissSVGBuilder.removeDefinition(k)));

    it('propagates RK onto the first glyph of the second expanded word', () => {
      const result = BlissParser.parse('BlissWord//RK:-2/BlissWord');
      expect(result.groups[2].glyphs[0].options.relativeKerning).toBe(-2);
    });

    it('propagates AK onto the first glyph of the second expanded word', () => {
      const result = BlissParser.parse('BlissWord//AK:5/BlissWord');
      expect(result.groups[2].glyphs[0].options.absoluteKerning).toBe(5);
    });
  });
});
