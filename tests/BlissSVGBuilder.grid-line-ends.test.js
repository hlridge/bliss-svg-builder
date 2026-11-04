import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how a grid line's ends are written: butt ends, with every segment
 * lengthened by half the line's own width at both ends, which covers exactly
 * the area a square end covers (Chrome draws square-ended grid lines
 * differently from that identical butt-ended shape).
 *
 * Covers:
 * - The default grid: all five lines butt-ended, no square end left, each
 *   family's exact path data; the group's crispEdges, the WebKit stylesheet
 *   rule and the miter join kept.
 * - The width options (bulk, category, sky, earth) each lengthening its own
 *   lines by its own half; a zero width lengthening by nothing and still drawn.
 * - A raw `stroke-width` key on a line: the line is lengthened by the width
 *   that key writes, the most specific key winning, the same from the options
 *   object; a width the number grammar cannot read, or CSS refuses as a
 *   number (a trailing point), leaves the line square-ended on its plain
 *   extents, as it was written before.
 * - A raw `stroke-linecap`, `d` or `vector-effect` on a line, which takes over
 *   what the lengthening rests on, leaves that line written as before.
 * - A raw dash pattern keeps the line butt-ended and lengthened, so each dash
 *   is exactly as long as written.
 *
 * Does NOT cover:
 * - The lengthening where a crop, a margin, `center` or `grid-shift` moves or
 *   cuts the lines, that the butt-ended lines cover exactly what the
 *   square-ended ones did, and that no picture changes size, see
 *   `BlissSVGBuilder.grid-line-coverage.test.js`.
 * - Grid colours, widths and the option cascade themselves, see
 *   `BlissSVGBuilder.grid.test.js`; the raw channel's targets and reports, see
 *   `BlissSVGBuilder.layer-sub-targets.test.js`.
 * - How a browser rasterizes the lines: this repo drives no browser, and the
 *   visual-regression suite rasterizes with librsvg, which draws both forms
 *   alike.
 */

const gridLines = (input, options) => new BlissSVGBuilder(input, options).svgCode
  .split('\n').filter(line => line.includes('<path class="bliss-grid-line')).map(line => line.trim());

// The one line of a family: `bliss-grid-line--major"` (closing quote) names the
// major family's own path, not the sky and earth lines that also carry it.
const gridLine = (input, family, options) => gridLines(input, options)
  .find(line => line.includes(`bliss-grid-line--${family}"`));

const attr = (line, name) => line.match(new RegExp(` ${name}="([^"]*)"`))?.[1];

const DEFAULT_D = {
  minor: 'M-0.083,1h8.166M-0.083,3h8.166M-0.083,5h8.166M-0.083,7h8.166M-0.083,9h8.166M-0.083,11h8.166'
    + 'M-0.083,13h8.166M-0.083,15h8.166M-0.083,17h8.166M-0.083,19h8.166'
    + 'M1,-0.083V20.083M3,-0.083V20.083M5,-0.083V20.083M7,-0.083V20.083',
  medium: 'M-0.083,2h8.166M-0.083,6h8.166M-0.083,10h8.166M-0.083,14h8.166M-0.083,18h8.166'
    + 'M2,-0.083V20.083M6,-0.083V20.083',
  major: 'M-0.083,0h8.166M-0.083,4h8.166M-0.083,12h8.166M-0.083,20h8.166'
    + 'M0,-0.083V20.083M4,-0.083V20.083M8,-0.083V20.083',
  sky: 'M-0.083,8h8.166',
  earth: 'M-0.083,16h8.166',
};

describe('BlissSVGBuilder grid line ends', () => {
  describe('when the grid is drawn at its default widths', () => {
    it('writes every grid line with butt ends and leaves no square end', () => {
      const svg = new BlissSVGBuilder('[grid]||B313').svgCode;
      const lines = gridLines('[grid]||B313');

      expect(lines).toHaveLength(5);
      expect(lines.map(line => attr(line, 'stroke-linecap'))).toEqual(['butt', 'butt', 'butt', 'butt', 'butt']);
      expect(svg).not.toContain('square');
    });

    it.each(Object.entries(DEFAULT_D))('lengthens every %s segment by half its 0.166 width at both ends', (family, d) => {
      expect(attr(gridLine('[grid]||B313', family), 'd')).toBe(d);
    });

    it('keeps the group\'s crispEdges, the WebKit rule and the miter join', () => {
      const svg = new BlissSVGBuilder('[grid]||B313').svgCode;

      expect(svg).toContain('<g class="bliss-grid" shape-rendering="crispEdges">');
      expect(svg).toContain('@supports (-webkit-hyphens: none) {\n      .bliss-grid-line { shape-rendering: geometricPrecision; }\n    }');
      expect(gridLines('[grid]||B313').map(line => attr(line, 'stroke-linejoin'))).toEqual(['miter', 'miter', 'miter', 'miter', 'miter']);
    });
  });

  describe('when a width option sets the lines\' width', () => {
    it.each([
      ['grid-stroke-width=0.5', 'major', 'M-0.25,0h8.5M-0.25,4h8.5M-0.25,12h8.5M-0.25,20h8.5M0,-0.25V20.25M4,-0.25V20.25M8,-0.25V20.25'],
      ['grid-major-stroke-width=0.3', 'earth', 'M-0.15,16h8.3'],
      ['grid-major-stroke-width=0.3', 'minor', DEFAULT_D.minor],
      ['grid-medium-stroke-width=0.25', 'medium', 'M-0.125,2h8.25M-0.125,6h8.25M-0.125,10h8.25M-0.125,14h8.25M-0.125,18h8.25M2,-0.125V20.125M6,-0.125V20.125'],
      ['grid-minor-stroke-width=0.1', 'minor', 'M-0.05,1h8.1M-0.05,3h8.1M-0.05,5h8.1M-0.05,7h8.1M-0.05,9h8.1M-0.05,11h8.1M-0.05,13h8.1M-0.05,15h8.1M-0.05,17h8.1M-0.05,19h8.1M1,-0.05V20.05M3,-0.05V20.05M5,-0.05V20.05M7,-0.05V20.05'],
      ['grid-sky-stroke-width=0.4', 'sky', 'M-0.2,8h8.4'],
      ['grid-sky-stroke-width=0.4', 'earth', DEFAULT_D.earth],
      ['grid-earth-stroke-width=0.2', 'earth', 'M-0.1,16h8.2'],
    ])('with %s draws the %s line as %s', (option, family, d) => {
      expect(attr(gridLine(`[grid;${option}]||B313`, family), 'd')).toBe(d);
    });

    it('lengthens by the same width from the options object', () => {
      const dsl = new BlissSVGBuilder('[grid;grid-sky-stroke-width=0.4]||B313').svgCode;
      const api = new BlissSVGBuilder('B313', { grid: true, gridSkyStrokeWidth: 0.4 }).svgCode;

      expect(api).toBe(dsl);
    });

    it('keeps drawing a zero-width line, butt-ended and lengthened by nothing', () => {
      const lines = gridLines('[grid;grid-stroke-width=0]||B313');

      expect(lines).toHaveLength(5);
      expect(gridLine('[grid;grid-stroke-width=0]||B313', 'sky')).toBe(
        '<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0" stroke="#858585"'
        + ' stroke-linecap="butt" stroke-linejoin="miter" d="M0,8h8"/>');
    });
  });

  describe('when a raw key sets a line\'s width', () => {
    it('lengthens the line by half the width the key writes', () => {
      const input = '[grid;grid-line--sky--stroke-width=0.4]||B313';

      expect(attr(gridLine(input, 'sky'), 'd')).toBe('M-0.2,8h8.4');
      expect(attr(gridLine(input, 'earth'), 'd')).toBe(DEFAULT_D.earth);
    });

    it('lengthens by the most specific key\'s width', () => {
      const input = '[grid;grid-line--stroke-width=0.3;grid-line--sky--stroke-width=0.5]||B313';

      expect(attr(gridLine(input, 'sky'), 'd')).toBe('M-0.25,8h8.5');
      expect(attr(gridLine(input, 'earth'), 'd')).toBe('M-0.15,16h8.3');
    });

    it('lengthens by the same width from the options object', () => {
      const dsl = new BlissSVGBuilder('[grid;grid-line--sky--stroke-width=0.4]||B313').svgCode;
      const api = new BlissSVGBuilder('B313', { grid: true, 'grid-line--sky--stroke-width': 0.4 }).svgCode;

      expect(api).toBe(dsl);
    });

    // note: a width read elsewhere (CSS units, a negative one, a word, a hex
    // number JavaScript reads, a trailing point CSS refuses) is resolved by
    // the renderer; the square end follows whatever it resolves
    it.each(['1px', 'abc', '-1', 'Infinity', '0x10', '1.'])('writes a line whose width %s is no number as before, square-ended on its plain extents', (width) => {
      const input = `[grid;grid-line--sky--stroke-width=${width}]||B313`;

      expect(gridLine(input, 'sky')).toBe(
        `<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="${width}" stroke="#858585"`
        + ' stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8"/>');
      expect(attr(gridLine(input, 'earth'), 'stroke-linecap')).toBe('butt');
    });

    it('writes a line given an empty width as before, square-ended on its plain extents', () => {
      // pins the width read as written: Number() reads '' as 0 (butt ends, no
      // lengthening) and `||` puts the option's width in its place; both
      // survived a 2026-11 hand-mutant run before this row
      expect(gridLine('[grid;grid-line--sky--stroke-width=]||B313', 'sky')).toBe(
        '<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="" stroke="#858585"'
        + ' stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8"/>');
    });
  });

  describe('when a raw key takes over what the lengthening rests on', () => {
    it('draws the author\'s square ends on the plain extents, exactly as before', () => {
      const lines = gridLines('[grid;grid-line--stroke-linecap=square]||B313');

      expect(lines.map(line => attr(line, 'stroke-linecap'))).toEqual(['square', 'square', 'square', 'square', 'square']);
      expect(lines[2]).toBe('<path class="bliss-grid-line bliss-grid-line--major" stroke-width="0.166" stroke="#c7c7c7"'
        + ' stroke-linecap="square" stroke-linejoin="miter" d="M0,0h8M0,4h8M0,12h8M0,20h8M0,0V20M4,0V20M8,0V20"/>');
      expect(lines[3]).toBe('<path class="bliss-grid-line bliss-grid-line--major bliss-grid-line--sky" stroke-width="0.166"'
        + ' stroke="#858585" stroke-linecap="square" stroke-linejoin="miter" d="M0,8h8"/>');
    });

    it('writes the plain extents\' coordinates exactly as before, unrounded', () => {
      // pins "exactly as before": a lengthened line rounds its ends to 4
      // decimals (0.2503 here), a line written as before keeps the crop's 0.33333
      const minor = gridLine('[grid;crop=0.33333;grid-line--stroke-linecap=square]||B313', 'minor');

      expect(attr(minor, 'd')).toBe('M0.33333,1h7.33334M0.33333,3h7.33334M0.33333,5h7.33334M0.33333,7h7.33334'
        + 'M0.33333,9h7.33334M0.33333,11h7.33334M0.33333,13h7.33334M0.33333,15h7.33334M0.33333,17h7.33334'
        + 'M0.33333,19h7.33334M1,0.33333V19.66667M3,0.33333V19.66667M5,0.33333V19.66667M7,0.33333V19.66667');
    });

    it('draws the author\'s round ends on the sky line\'s plain extent alone', () => {
      const input = '[grid;grid-line--sky--stroke-linecap=round]||B313';

      expect(attr(gridLine(input, 'sky'), 'stroke-linecap')).toBe('round');
      expect(attr(gridLine(input, 'sky'), 'd')).toBe('M0,8h8');
      expect(attr(gridLine(input, 'earth'), 'd')).toBe(DEFAULT_D.earth);
    });

    it('keeps square ends on the author\'s own path', () => {
      const sky = gridLine('[grid;grid-line--sky--d=M0,8h4]||B313', 'sky');

      expect(attr(sky, 'stroke-linecap')).toBe('square');
      expect(attr(sky, 'd')).toBe('M0,8h4');
    });

    it('writes every line given a vector-effect as before', () => {
      const lines = gridLines('[grid;grid-line--vector-effect=non-scaling-stroke]||B313');

      expect(lines.map(line => attr(line, 'stroke-linecap'))).toEqual(['square', 'square', 'square', 'square', 'square']);
      expect(attr(lines[3], 'd')).toBe('M0,8h8');
    });
  });

  describe('when a raw key dashes a line', () => {
    it('keeps the line butt-ended and lengthened, so each dash is as long as written', () => {
      const sky = gridLine('[grid;grid-line--sky--stroke-dasharray=0.5]||B313', 'sky');

      expect(attr(sky, 'stroke-linecap')).toBe('butt');
      expect(attr(sky, 'd')).toBe(DEFAULT_D.sky);
      expect(attr(sky, 'stroke-dasharray')).toBe('0.5');
    });
  });
});
