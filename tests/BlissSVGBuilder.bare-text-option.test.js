import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { TEXT_OPTION_KEYS, KEYWORD_OPTION_VALUES } from '../src/lib/bliss-constants.js';

/**
 * Pins a library option that takes a color or a text, written as a bare key:
 * refused and reported, with nothing written in its place.
 *
 * A bare key arrives as `true`. On a name of your own that is the DSL's
 * shorthand (`[data-selected]` writes `data-selected="true"`), and the text
 * gate used to honour it on the library's own options too, so `[background]`
 * painted `fill="true"`, `[color]` stroked `stroke="true"` and `[svg-title]`
 * named the picture "true", all in silence. A bare number option and a bare
 * keyword option were already refused this way; this file holds the rest of
 * the curated vocabulary to the same rule.
 *
 * Covers:
 * - Every color option (the symbol's color, the background and its three
 *   zones, the six grid colors) written bare at global scope: one
 *   `INVALID_OPTION_VALUE` naming the key alone, and the picture drawn as if
 *   the key were absent.
 * - A bare color and a bare background on a word, a character and a part.
 * - The fallback: a character keeps the color it inherits, and a bare
 *   background is no painted neighbour to the background beside it.
 * - The JavaScript `true`, which is what the bare key is stored as, through a
 *   composition object, the constructor's options and a setter: the same
 *   report and the same picture as the bracket.
 * - The bare key kept in the composition, written back by both saves and
 *   reported again on each reload.
 * - Both titles written bare, and a sweep DERIVED from `TEXT_OPTION_KEYS`, so
 *   a text option added later is held to the rule the day it lands.
 * - The controls: a bare name of your own still writes `true`, the empty
 *   background still means transparent, the text `true` written after `=` is
 *   carried, and a bare switch is on.
 *
 * Does NOT cover:
 * - A value with no text form (a null, an object), see
 *   `BlissSVGBuilder.text-option-values.test.js`.
 * - A bare number option, see `BlissSVGBuilder.option-value-gate.test.js`.
 * - A bare keyword option (`background-area`, `link-area`), which keeps its
 *   own words, see `BlissSVGBuilder.element-background-options.test.js`.
 * - A JavaScript `false` on a text option, drawn as the text it spells, see
 *   `BlissSVGBuilder.false-option-value.test.js`.
 * - A global-only option written bare below the whole picture, which is
 *   refused for its scope first, see `BlissParser.global-option-scope.test.js`.
 */

const build = (input, options) => new BlissSVGBuilder(input, options);
const reports = (b) => b.warnings.map(({ code, source }) => ({ code, source }));

const COLOR_REFUSAL = (key) => `"${key}" needs a color and was written without one, `
  + 'so it was ignored: the option keeps the value it would have had without it.';
const TEXT_REFUSAL = (key) => `"${key}" needs a text value and was written without one, `
  + 'so it was ignored: the option keeps the value it would have had without it.';

// A composition object exactly as `toJSON()` writes the given input, with one
// bag replaced, so the object route differs from the bracket in nothing else.
const withGlobalOptions = (input, options) => ({ ...build(input).toJSON(), options });
const withCharacterOptions = (input, options) => {
  const json = build(input).toJSON();
  json.groups[0].glyphs[0].options = options;
  return json;
};

describe('BlissSVGBuilder bare text option', () => {
  describe('when a color option is written as a bare key on the whole picture', () => {
    it.each([
      ['color', '[color]||B313', 'B313'],
      ['background', '[background]||B313', 'B313'],
      ['background-top', '[background-top]||B313', 'B313'],
      ['background-mid', '[background-mid]||B313', 'B313'],
      ['background-bottom', '[background-bottom]||B313', 'B313'],
      ['grid-color', '[grid;grid-color]||B313', '[grid]||B313'],
      ['grid-major-color', '[grid;grid-major-color]||B313', '[grid]||B313'],
      ['grid-medium-color', '[grid;grid-medium-color]||B313', '[grid]||B313'],
      ['grid-minor-color', '[grid;grid-minor-color]||B313', '[grid]||B313'],
      ['grid-sky-color', '[grid;grid-sky-color]||B313', '[grid]||B313'],
      ['grid-earth-color', '[grid;grid-earth-color]||B313', '[grid]||B313'],
    ])('refuses a bare %s, written as %s, and draws it as %s', (key, input, unwritten) => {
      // regression: each wrote `"true"` as a paint (stroke="true", fill="true")
      // with nothing said; the grid ones once the grid was drawn
      const b = build(input);
      expect(b.warnings).toEqual([{ code: 'INVALID_OPTION_VALUE', message: COLOR_REFUSAL(key), source: key }]);
      expect(b.svgCode).toBe(build(unwritten).svgCode);
    });
  });

  describe('when a color option is written bare below the whole picture', () => {
    it.each([
      ['a word', '[color]|B313', 'B313'],
      ['a character', '[color]B313', 'B313'],
      ['a part', 'B313;[color]>C8', 'B313;C8'],
    ])('refuses a bare color on %s and draws it as unwritten', (_scope, input, unwritten) => {
      const b = build(input);
      expect(reports(b)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'color' }]);
      expect(b.svgCode).toBe(build(unwritten).svgCode);
    });

    it.each([
      ['a word', '[background]|B313', 'B313'],
      ['a character', '[background]B313', 'B313'],
      ['a part', 'B313;[background]>C8', 'B313;C8'],
    ])('refuses a bare background on %s and paints no box behind it', (_scope, input, unwritten) => {
      const b = build(input);
      expect(reports(b)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'background' }]);
      expect(b.svgCode).not.toContain('bliss-element-background');
      expect(b.svgCode).toBe(build(unwritten).svgCode);
    });
  });

  describe('when the element has something to fall back on', () => {
    it('keeps the color a character inherits from the whole picture', () => {
      expect(build('[color=red]||[color]B313').svgCode).toBe(build('[color=red]||B313').svgCode);
    });

    it('leaves a bare background out of the area its neighbour reaches across', () => {
      // regression: the box painted `fill="true"` still counted as a painted
      // neighbour, so the red background stopped halfway between the two
      // characters (x=9) instead of reaching its full padding (x=7)
      expect(build('[background]B313/[background=red;background-padding=3]B313').svgCode)
        .toBe(build('B313/[background=red;background-padding=3]B313').svgCode);
    });
  });

  describe('when the bare value arrives through JavaScript as true', () => {
    it('reports and draws a global color alike through a bracket, an object and the constructor', () => {
      const viaBracket = build('[color]||B313');
      const viaObject = build(withGlobalOptions('B313', { color: true }));
      const viaConstructor = build('B313', { color: true });
      expect(reports(viaBracket)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'color' }]);
      expect(viaObject.warnings).toEqual(viaBracket.warnings);
      expect(viaObject.svgCode).toBe(viaBracket.svgCode);
      expect(viaConstructor.warnings).toEqual(viaBracket.warnings);
      expect(viaConstructor.svgCode).toBe(viaBracket.svgCode);
    });

    it('reports and draws a character background alike through a bracket, an object and a setter', () => {
      const viaBracket = build('[background]B313');
      const viaObject = build(withCharacterOptions('B313', { background: true }));
      const viaSetter = build('B313');
      viaSetter.group(0).glyph(0).setOptions({ background: true });
      expect(reports(viaBracket)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'background' }]);
      expect(viaObject.warnings).toEqual(viaBracket.warnings);
      expect(viaObject.svgCode).toBe(viaBracket.svgCode);
      expect(viaSetter.warnings).toEqual(viaBracket.warnings);
      expect(viaSetter.svgCode).toBe(viaBracket.svgCode);
    });
  });

  describe('when a composition holding a bare color is saved and loaded again', () => {
    it('writes the bare key back in both saves and reports it again on each reload', () => {
      // the key is readable text, so it is kept for the author to correct, as
      // a bare `[margin]` is; only a value with no text form is not stored
      const b = build('[background]B313');
      const fromString = build(b.toString());
      const fromJSON = build(b.toJSON());
      expect(b.toString()).toBe('[background]B313');
      expect(b.toJSON().groups[0].glyphs[0].options).toEqual({ background: true });
      expect(reports(fromString)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'background' }]);
      expect(fromString.svgCode).toBe(build('B313').svgCode);
      expect(reports(fromJSON)).toEqual([{ code: 'INVALID_OPTION_VALUE', source: 'background' }]);
      expect(fromJSON.svgCode).toBe(build('B313').svgCode);
    });
  });

  describe('when a title is written as a bare key', () => {
    it.each([
      ['svg-title', '<title>'],
      ['svg-desc', '<desc>'],
    ])('refuses a bare %s and writes no %s element', (key, element) => {
      // regression: the picture's accessible name or description was "true"
      const b = build(`[${key}]||B313`);
      expect(b.warnings).toEqual([{ code: 'INVALID_OPTION_VALUE', message: TEXT_REFUSAL(key), source: key }]);
      expect(b.svgCode).not.toContain(element);
      expect(b.svgCode).toBe(build('B313').svgCode);
    });

    it('asks the undocumented text option for a text value too', () => {
      // pins the noun for the stub, which draws nothing whatever it holds; a
      // mutant adding 'text' to the color list survived every other row in a
      // 2026-11 hand-mutant run
      const b = build('[text]||B313');
      expect(b.warnings).toEqual([{ code: 'INVALID_OPTION_VALUE', message: TEXT_REFUSAL('text'), source: 'text' }]);
      expect(b.svgCode).toBe(build('B313').svgCode);
    });
  });

  describe('when every curated text option is written bare', () => {
    // Derived from the vocabulary rather than listed, so an option added later
    // is swept the day it lands. The keyword options are left to their own
    // judge, whose refusal names the words the option takes.
    const BARE_REFUSED = [...TEXT_OPTION_KEYS].filter((key) => !KEYWORD_OPTION_VALUES.has(key));

    it('holds exactly the colors, the titles and the text stub pinned above', () => {
      // An option added to the vocabulary fails this row until it is listed
      // here and its refusal's wording is pinned above: asked for "a text
      // value" when it needs a color, it would give the wrong advice in silence.
      expect([...BARE_REFUSED].sort()).toEqual([
        'background', 'background-bottom', 'background-mid', 'background-top', 'color',
        'grid-color', 'grid-earth-color', 'grid-major-color', 'grid-medium-color',
        'grid-minor-color', 'grid-sky-color', 'svg-desc', 'svg-title', 'text',
      ]);
    });

    it.each(BARE_REFUSED)('refuses a bare %s on the whole picture, naming the key alone', (key) => {
      expect(reports(build(`[${key}]||B313`))).toEqual([{ code: 'INVALID_OPTION_VALUE', source: key }]);
    });
  });

  describe('when the bare key is not one of the library text options', () => {
    it('writes a bare name of your own as the attribute value true', () => {
      // pins that the refusal is for the library's own options: on a name of
      // your own a bare key is the DSL's shorthand for `true`
      const b = build('[data-selected]B313');
      expect(b.svgCode).toContain('data-selected="true"');
      expect(b.warnings).toEqual([]);
    });

    it('keeps the empty background that means transparent', () => {
      expect(build('[background=]||B313').warnings).toEqual([]);
    });

    it('carries the text true written after an equals sign, which the author typed', () => {
      // note: `[color]` stores the JavaScript `true`, `[color=true]` the text
      // "true"; only the first is a key written without a value
      const b = build('[color=true]B313');
      expect(b.svgCode).toContain('stroke="true"');
      expect(b.warnings).toEqual([]);
    });

    it('turns a bare switch on', () => {
      const b = build('[grid]||B313');
      expect(b.svgCode).toContain('bliss-grid');
      expect(b.warnings).toEqual([]);
    });
  });
});
