/**
 * Pins a typed glyph that draws one code placing indicators as that code does:
 * where it sets no anchor of its own it takes the code's, so it can stand in
 * for the code until it is exported, and its spelled-out saves reload as drawn.
 *
 * Covers:
 * - A typed glyph wrapping a built-in with an anchor of its own (B138, both
 *   axes; B1103, x only), also with options, a coordinate, its own bracket, a
 *   part bracket, a bare `>` or an empty trailing slot in its code string,
 *   and a typed glyph or a bare alias wrapping such a wrap: given B81 by `;;`,
 *   `;` and both applies, it draws as the wrapped code does.
 * - A wrap of a code no definition holds failing as that code does (control).
 * - An anchor the glyph sets itself winning, axis by axis, a written 0
 *   included.
 * - A code string of several codes keeping the default anchor, as its
 *   spelled-out form does (control).
 * - A glyph flagged as an indicator wrapping one indicator taking that
 *   indicator's anchor.
 * - The saves of a wrap given an indicator, each reloading as drawn; a
 *   composition object naming the wrap.
 * - Controls: a bare alias of B138, which has always taken its anchor, and
 *   spacing, which a wrap already took from the code it draws.
 *
 * Does NOT cover:
 * - A glyph whose own anchor differs from the one its spelled-out codes place
 *   by: its spelled-out saves still move the indicator (chunk C25), see
 *   `BlissSVGBuilder.definition-is-a-part-routes.test.js`.
 * - How a lone typed glyph is stored and the other routes that add an
 *   indicator to it, see `BlissSVGBuilder.definition-is-a-part.test.js` and
 *   `BlissSVGBuilder.definition-is-a-part-routes.test.js`.
 * - Indicator-ness carried by a bare alias, see
 *   `BlissSVGBuilder.alias-indicator.test.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const FIXTURES = {
  WA_138: { type: 'glyph', codeString: 'B138' },
  WA_1103: { type: 'glyph', codeString: 'B1103' },
  WA_RED: { type: 'glyph', codeString: 'B138', defaultOptions: { color: 'red' } },
  WA_POS: { type: 'glyph', codeString: 'B138:2,0' },
  WA_BRACKET: { type: 'glyph', codeString: '[color=red]B138' },
  WA_BRACKET2: { type: 'glyph', codeString: '[color=red;stroke-width=1]B138' },
  WA_PART: { type: 'glyph', codeString: '[color=red]>B138' },
  WA_GT: { type: 'glyph', codeString: '>B138' },
  WA_TRAIL: { type: 'glyph', codeString: 'B138;' },
  WA_UNKNOWN: { type: 'glyph', codeString: 'B99999' },
  WA_WRAP: { type: 'glyph', codeString: 'WA_138' },
  WA_ALIAS: { codeString: 'WA_138' },
  WA_OWNY: { type: 'glyph', codeString: 'B138', anchorOffsetY: -2 },
  WA_BOTH: { type: 'glyph', codeString: 'B138', anchorOffsetX: -0.5, anchorOffsetY: -2 },
  WA_ZERO: { type: 'glyph', codeString: 'B138', anchorOffsetX: 0, anchorOffsetY: 0 },
  WA_TWO: { type: 'glyph', codeString: 'B138;C8' },
  null: { type: 'glyph', codeString: 'B1103' },
  WA_84: { type: 'glyph', isIndicator: true, codeString: 'B84' },
  WA_AL138: { codeString: 'B138' },
};

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define(FIXTURES);
  expect(errors).toEqual([]);
  expect(defined).toEqual(Object.keys(FIXTURES));
});

afterAll(() => {
  for (const code of Object.keys(FIXTURES)) BlissSVGBuilder.removeDefinition(code);
});

const svgOf = (input) => new BlissSVGBuilder(input).svgCode;

// A builder for `input` after `change` has been applied to it.
const changed = (input, change) => {
  const builder = new BlissSVGBuilder(input);
  change(builder);
  return builder;
};

describe('BlissSVGBuilder wrapped code anchor', () => {
  describe('when an indicator is added to a typed glyph that draws one code', () => {
    it.each([
      ['WA_138;;B81', 'B138;;B81'],
      ['WA_1103;;B81', 'B1103;;B81'],
      ['WA_RED;;B81', '[color=red]>B138;;B81'],
      ['WA_POS;;B81', 'B138:2,0;;B81'],
      ['WA_BRACKET;;B81', '[color=red]>B138;;B81'],
      // pins reading the code behind its bracket before counting parts: the
      // bracket's own `;` is not a second part
      ['WA_BRACKET2;;B81', '[color=red;stroke-width=1]>B138;;B81'],
      ['WA_PART;;B81', '[color=red]>B138;;B81'],
      ['WA_GT;;B81', 'B138;;B81'],
      ['WA_TRAIL;;B81', 'B138;;B81'],
      ['WA_WRAP;;B81', 'B138;;B81'],
      ['WA_ALIAS;;B81', 'B138;;B81'],
      ['WA_138;B81', 'B138;B81'],
      ['WA_1103;B81', 'B1103;B81'],
    ])('draws %s as %s', (input, twin) => {
      // regression: a typed glyph placed indicators at the plain centre, by an
      // anchor of its own it does not have; v1.0.0 did so with `;`, C23 with
      // every route (owner 2026-10-05: the wrap stands in for the code)
      expect(new BlissSVGBuilder(twin).warnings).toEqual([]);
      expect(svgOf(input)).toBe(svgOf(twin));
    });

    it.each([
      ['glyph(0).applyIndicators', (b) => b.glyph(0).applyIndicators('B81')],
      ['group(0).applyIndicators', (b) => b.group(0).applyIndicators('B81')],
    ])('draws WA_138 given B81 by %s as B138;B81', (_route, change) => {
      expect(changed('WA_138', change).svgCode).toBe(svgOf('B138;B81'));
    });
  });

  describe('when the typed glyph sets an anchor of its own', () => {
    it('takes the axis it does not set from the code it draws', () => {
      // pins per-axis inheritance: WA_OWNY sets y only, WA_BOTH spells out
      // the x it takes from B138
      expect(svgOf('WA_OWNY;;B81')).toBe(svgOf('WA_BOTH;;B81'));
      expect(svgOf('WA_OWNY;;B81')).not.toBe(svgOf('B138;;B81'));
    });

    it('keeps a written 0 as its own anchor, placing B81 at the plain centre', () => {
      // control: passes before the fix; pins that 0 is a value, not "unset"
      expect(svgOf('WA_ZERO;;B81')).toBe(svgOf('B138;;B81:2.5,0'));
    });
  });

  describe('when the typed glyph draws several codes', () => {
    it('places B81 by the default anchor, as its spelled-out form does', () => {
      // control: passes before the fix; a base of several parts has no single
      // anchor, so B138's does not reach WA_TWO
      expect(svgOf('WA_TWO;;B81')).toBe(svgOf('B138;C8;;B81'));
    });

    it('keeps the default anchor while a definition is named null', () => {
      // pins the null check in the lookup: a code string of several codes has
      // no one code, which must not read as the (legal) code `null`, here a
      // wrap of B1103
      expect(BlissSVGBuilder.getDefinition('null')).toBeDefined();
      expect(svgOf('WA_TWO;;B81')).toBe(svgOf('B138;C8;;B81'));
    });
  });

  describe('when the code the typed glyph draws is not defined', () => {
    it('draws WA_UNKNOWN;;B81 as B99999;;B81, with the same warnings', () => {
      // control: passes before the fix; there is no anchor to take, and the
      // use fails as the code written out does
      const builder = new BlissSVGBuilder('WA_UNKNOWN;;B81');
      const twin = new BlissSVGBuilder('B99999;;B81');
      expect(builder.svgCode).toBe(twin.svgCode);
      expect(builder.warnings.map((warning) => warning.code)).toEqual(['UNKNOWN_CODE']);
      expect(twin.warnings.map((warning) => warning.code)).toEqual(['UNKNOWN_CODE']);
    });
  });

  describe('when a glyph flagged as an indicator wraps one indicator', () => {
    it.each([
      ['B291;WA_84', 'B291;B84'],
      ['B291;;WA_84', 'B291;;B84'],
    ])('draws %s as %s, by B84\'s anchor', (input, twin) => {
      expect(svgOf(input)).toBe(svgOf(twin));
    });
  });

  describe('when a wrap given an indicator is saved', () => {
    it.each([
      ['toString()', 'B138;;B81', (b) => b.toString()],
      ['toString({ flattenIndicators: true })', 'B138;B81', (b) => b.toString({ flattenIndicators: true })],
      ['toString({ preserve: true })', 'WA_138;;B81', (b) => b.toString({ preserve: true })],
    ])('saves WA_138;;B81 by %s as %s, which reloads as drawn', (_save, saved, save) => {
      const builder = new BlissSVGBuilder('WA_138;;B81');
      expect(save(builder)).toBe(saved);
      expect(svgOf(saved)).toBe(builder.svgCode);
    });

    it.each([
      ['toJSON()', (b) => b.toJSON()],
      ['toJSON({ flattenIndicators: true })', (b) => b.toJSON({ flattenIndicators: true })],
      ['toJSON({ preserve: true })', (b) => b.toJSON({ preserve: true })],
    ])('rebuilds WA_138;;B81 from %s as drawn', (_save, save) => {
      const builder = new BlissSVGBuilder('WA_138;;B81');
      expect(new BlissSVGBuilder(save(builder)).svgCode).toBe(builder.svgCode);
    });
  });

  describe('when a composition object names the wrap', () => {
    it('draws it with an indicator appended as B138;B81', () => {
      const object = { groups: [{ glyphs: [{ codeName: 'WA_138', parts: [{ codeName: 'B138' }, { codeName: 'B81' }] }] }] };
      expect(new BlissSVGBuilder(object).svgCode).toBe(svgOf('B138;B81'));
    });
  });

  describe('when the code is reached another way', () => {
    it('draws a bare alias of B138 given B81 as B138;;B81', () => {
      // control: passes before the fix; an alias has always taken its target's anchor
      expect(svgOf('WA_AL138;;B81')).toBe(svgOf('B138;;B81'));
    });

    it('spaces WA_138 in a word as B138', () => {
      // control: passes before the fix; a wrap already took the code's spacing
      expect(svgOf('WA_138/B291')).toBe(svgOf('B138/B291'));
    });
  });
});
