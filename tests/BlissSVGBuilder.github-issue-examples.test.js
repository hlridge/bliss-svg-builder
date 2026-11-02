import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the code examples of the project's open GitHub issues, run exactly as
 * written, at the outcome each issue expects or, where a ruling replaced that
 * outcome, at the ruled one (the test name says which).
 *
 * Covers:
 * - #37: a multi-letter X run inside a `define()` word codeString and before a
 *   `;;` word indicator.
 * - #38: external spacing between outlined letters, and a part-scope option
 *   surviving a `toJSON()` round trip.
 * - #39: a hyphenated X run is taken whole, as one text glyph.
 * - #40: a bare `>` and a doubled option bracket at every scope.
 * - #41: automatic cropping across a space, in every automatic mode.
 * - #18: positioning and kerning through object options, against the DSL.
 * - #19: `toString()` writing the compact space-group and X-run forms.
 * - #29 and #34, whose issues carry no code: #29's case built from its words,
 *   #34's taken from the handbook.
 * - #26 (open for scripts other than Latin, Greek and Cyrillic): its "works"
 *   and "does not work" lists, whose Latin rows now draw as text.
 *
 * Does NOT cover:
 * - Each feature's full contract, which lives with the feature: X runs in
 *   `BlissParser.x-codes.test.js`; external spacing in
 *   `BlissSVGBuilder.external-glyphs.test.js`, which also holds a form of
 *   #38's first case that shows a text-fallback glyph (`XM/Xhαllo`); option
 *   brackets in `BlissParser.bracket-options.test.js`; crop in
 *   `BlissSVGBuilder.space-crop.test.js`; positioning in
 *   `BlissSVGBuilder.positioning-options.test.js` and
 *   `BlissSVGBuilder.kerning-options.test.js`; compact serialization in
 *   `BlissSVGBuilder.serialization-canonicalization.test.js`; element
 *   backgrounds in `BlissSVGBuilder.element-backgrounds.test.js`; native
 *   filters in `BlissSVGBuilder.native-filters.test.js`.
 */

const render = (input) => new BlissSVGBuilder(input);
const viewBox = (input) => render(input).svgCode.match(/viewBox="([^"]*)"/)[1];
// The top edge and the height of the viewBox: what a vertical crop decides.
const verticalBox = (input) => viewBox(input).split(' ').filter((_, i) => i % 2 === 1);
const codes = (builder) => builder.warnings.map((w) => w.code);
const sources = (builder) => builder.warnings.map((w) => [w.code, w.source]);
// Paths and text elements inside the content group: what the picture draws.
const inkCount = (builder) =>
  ((builder.svgCode.split('class="bliss-content"')[1] ?? '').match(/ d="|<text/g) ?? []).length;
const gapAfterFirstGlyph = (builder) => {
  const [first, second] = builder.groups[0].children;
  return second.x - first.x - first.width;
};

describe('BlissSVGBuilder github issue examples', () => {
  describe("when GH #37's X runs are written inside define() and before ;;", () => {
    it('expands XOH inside a define() word codeString, drawing what B216/XO/XH draws', () => {
      expect(BlissSVGBuilder.define({ '1170': { codeString: 'B216/XOH' } }).defined).toContain('1170');
      const word = render('1170');
      expect(word.warnings).toEqual([]);
      expect(word.svgCode).toBe(render('B216/XO/XH').svgCode);
    });

    it('expands XOH before a ;; word indicator, drawing what B216/XO/XH;;B99 draws', () => {
      const word = render('B216/XOH;;B99');
      expect(word.warnings).toEqual([]);
      expect(word.svgCode).toBe(render('B216/XO/XH;;B99').svgCode);
    });
  });

  // scenario: #38's first case also names XMM-M; that input is the run #39 is
  // about and is pinned with #39 below.
  describe("when GH #38's external characters are spaced", () => {
    it('spaces two outlined letters (XM/XM) 0.8 apart, the external-glyph space', () => {
      expect(gapAfterFirstGlyph(render('XM/XM'))).toBeCloseTo(0.8, 6);
    });

    it('rebuilds [color=red]>Xm/XV/XA byte-identically from both toString() and toJSON()', () => {
      const original = render('[color=red]>Xm/XV/XA');
      expect(render(original.toString()).svgCode).toBe(original.svgCode);
      expect(render(original.toJSON()).svgCode).toBe(original.svgCode);
    });

    it('keeps every glyph of [color=red]>Xm/XV/XA external after a toJSON() round trip', () => {
      const rebuilt = render(render('[color=red]>Xm/XV/XA').toJSON());
      expect(rebuilt.groups[0].children.map((g) => g.isExternalGlyph)).toEqual([true, true, true]);
    });
  });

  describe("when GH #39's hyphenated X runs are written", () => {
    it('draws all five letters of Xhello and writes it back in its compact form', () => {
      const run = render('Xhello');
      expect(run.toString()).toBe('Xhello');
      expect(inkCount(run)).toBe(5);
    });

    // regression: GH #39; 1.0.0 drew 'hell' and moved the 'o' into a failing
    // tail token, Xo-world.
    it.each(['Xhello-world', 'XM-M', 'XMM-M'])(
      'takes %s whole as one text glyph: absorbs no letter, warns nothing',
      (input) => {
        const run = render(input);
        expect(run.toString()).toBe(input);
        expect(run.warnings).toEqual([]);
        expect(inkCount(run)).toBe(1);
        expect(run.svgCode).toContain(`>${input.slice(1)}</text>`);
      },
    );
  });

  describe("when GH #40's option syntax is malformed in front of a code", () => {
    it.each([
      ['||B291', 'B291'],
      ['|B291', 'B291'],
      ['>B291', 'B291'],
      ['S8;>C8', 'S8;C8'],
    ])('renders %s as %s without a warning, a bare separator carrying no options', (input, written) => {
      const result = render(input);
      expect(result.toString()).toBe(written);
      expect(result.warnings).toEqual([]);
      expect(result.svgCode).toBe(render(written).svgCode);
    });

    it.each([
      ['[grid][grid-color=red]||B291', '[grid]||B291'],
      ['[color=red][fill=green]|B291', '[color=red]|B291'],
      ['[color=red][fill=green]B291', '[color=red]B291'],
      ['[color=red]>[fill=green]>B291', '[color=red]>B291'],
    ])('renders %s as %s and reports the second bracket', (input, written) => {
      const result = render(input);
      expect(result.toString()).toBe(written);
      expect(codes(result)).toEqual(['MULTIPLE_OPTION_BRACKETS']);
      expect(result.svgCode).toBe(render(written).svgCode);
    });
  });

  describe("when GH #41's automatic crop meets a space", () => {
    it("crops B291//B291 to the ink as B291/B291 is cropped (the issue's viewBoxes)", () => {
      expect(viewBox('[crop=auto]||B291/B291')).toBe('-0.75 7.25 19.5 9.5');
      expect(viewBox('[crop=auto]||B291//B291')).toBe('-0.75 7.25 25.5 9.5');
    });

    it('takes the 4 units of crop=compact off the top of B291//B291, where the room is', () => {
      expect(viewBox('[crop=compact]||B291//B291')).toBe('-0.75 3.25 25.5 17.5');
    });

    it('removes the empty column a leading space leaves (//H:4,8 against H:4,8)', () => {
      expect(viewBox('[crop=auto]||H:4,8')).toBe('3.25 7.25 9.5 9.5');
      expect(viewBox('[crop=auto]||//H:4,8')).toBe('9.25 7.25 9.5 9.5');
    });

    it.each([
      ['crop=auto', '//'],
      ['crop=auto-vertical', '//'],
      ['crop=compact', '//'],
      ['crop-top=auto', '//'],
      ['crop=auto', '/QSP/'],
      ['crop=auto', '/TSP/'],
    ])('crops vertically under %s as if the space %s were not there', (mode, space) => {
      expect(verticalBox(`[${mode}]||B291${space}B291`)).toEqual(verticalBox(`[${mode}]||B291/B291`));
    });
  });

  describe("when GH #18's positioning options are passed as object options", () => {
    it('draws the bracket spelling [x=3;y=4]>H as H:3,4 draws', () => {
      expect(render('[x=3;y=4]>H').svgCode).toBe(render('H:3,4').svgCode);
    });

    it('applies relativeKerning set through a glyph handle as RK:-2 does', () => {
      const builder = render('C8/C8');
      builder.glyph(1).setOptions({ relativeKerning: -2 });
      expect(builder.svgCode).toBe(render('C8/RK:-2/C8').svgCode);
    });

    it('applies x and y set through a part handle as H:3,4 does', () => {
      const builder = render('H');
      builder.glyph(0).part(0).setOptions({ x: 3, y: 4 });
      expect(builder.svgCode).toBe(render('H:3,4').svgCode);
    });

    it('applies relativeKerning passed to addGlyph() as RK:-2 does', () => {
      const builder = render('C8');
      builder.group(0).addGlyph('C8', { relativeKerning: -2 });
      expect(builder.svgCode).toBe(render('C8/RK:-2/C8').svgCode);
    });

    it('reads the bracket spelling [relative-kerning=-2] as the RK:-2 marker', () => {
      expect(render('[relative-kerning=-2]C8').toString()).toBe('RK:-2/C8');
      expect(render('C8/[relative-kerning=-2]C8').svgCode).toBe(render('C8/RK:-2/C8').svgCode);
    });

    // note: kerning is the gap before one character, so at the whole picture's
    // scope it is refused on both surfaces rather than applied to every glyph.
    it('reports relativeKerning in the constructor overrides as misplaced, as [relative-kerning=-2]|| is', () => {
      const fromObject = new BlissSVGBuilder('C8/C8', { overrides: { relativeKerning: -2 } });
      const fromDsl = render('[relative-kerning=-2]||C8/C8');
      expect(sources(fromObject)).toEqual([['MISPLACED_KERNING_OPTION', 'relative-kerning=-2']]);
      expect(sources(fromDsl)).toEqual(sources(fromObject));
      expect(fromObject.svgCode).toBe(fromDsl.svgCode);
    });
  });

  describe("when GH #19's compact forms are written back", () => {
    it.each(['H///QSP/H', 'XBlissary'])('writes %s back as written and redraws it byte-identically', (input) => {
      const original = render(input);
      expect(original.toString()).toBe(input);
      expect(render(original.toString()).svgCode).toBe(original.svgCode);
    });
  });

  describe("when GH #29's case is built from its words (the issue has no code)", () => {
    it.each([
      ['a word', '[background=green]|B291/B291'],
      ['a character', '[background=green]B291'],
      ['a part', '[background=green]>H'],
    ])('paints a background on %s (%s) without a warning', (_, input) => {
      const result = render(input);
      expect(result.warnings).toEqual([]);
      expect(result.svgCode).toMatch(/<rect[^>]*fill="green"/);
    });
  });

  describe("when GH #34's case is taken from the handbook (the issue has no code)", () => {
    it('draws a CSS drop-shadow as a native SVG filter that the style points to', () => {
      const svg = render('[style=filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3))]||B313').svgCode;
      expect(svg).toContain('<feDropShadow');
      expect(svg).toMatch(/style="filter:url\(#bliss-filter-[^)"]+\)"/);
    });
  });

  describe("when GH #26's examples run as written (still open for other scripts)", () => {
    it.each(['Xa', 'Xé', 'Xñ', 'Xå', 'Xα', 'Xё', 'Xhello', 'Xcafé'])('draws %s without a warning', (input) => {
      const result = render(input);
      expect(result.warnings).toEqual([]);
      expect(inkCount(result)).toBeGreaterThan(0);
    });

    // regression: GH #39; 1.0.0 drew 'p' for Xpiǎ and 'ann' for Xanne-marie,
    // absorbing the letter before the unsupported character.
    it.each(['Xǎ', 'Xǔ', 'Xḿ', 'Xpiǎ', 'Xanne-marie'])(
      'draws %s whole as one text glyph without a warning',
      (input) => {
        const result = render(input);
        expect(result.warnings).toEqual([]);
        expect(inkCount(result)).toBe(1);
        expect(result.svgCode).toContain(`>${input.slice(1)}</text>`);
      },
    );

    it.each(['X漢', 'Xあ'])('draws nothing for %s and warns UNKNOWN_CODE naming the whole token', (input) => {
      const result = render(input);
      expect(inkCount(result)).toBe(0);
      expect(sources(result)).toEqual([['UNKNOWN_CODE', input]]);
    });
  });
});
