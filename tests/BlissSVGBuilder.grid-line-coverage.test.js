import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that butt-ended grid lines cover exactly what the square-ended ones
 * covered, wherever the grid is cut or moved, and that no picture changes size.
 *
 * Covers:
 * - The lengthening where `grid-shift` moves the lines (the shift and the half
 *   width added before one rounding), where `crop=auto` cuts them (and a
 *   crop of five decimals, its lengthened ends rounded to 4), where a
 *   margin leaves a zero-length segment (lengthened along its own axis), where
 *   an oversize crop reverses an extent (lengthened away from the segment), and
 *   where `center` offsets the grid; a line the crop leaves no segment of is
 *   not written at all.
 * - Coverage, per segment: the rectangle each butt-ended segment covers equals
 *   the rectangle the square-ended path data the builder wrote before covered
 *   (pasted below, one row per input and line).
 * - Size: the viewBox, width and height of five codes, with and without the
 *   grid and with `crop=auto`, equal to `v1.0.0`'s.
 *
 * Does NOT cover:
 * - The ends themselves (butt), the width each line is lengthened by, and the
 *   raw keys that leave a line square-ended, see
 *   `BlissSVGBuilder.grid-line-ends.test.js`.
 * - The viewBox a crop gives, see `BlissSVGBuilder.crop.test.js`; which lines
 *   the crop window keeps when `grid-shift` moves them, and what `grid-shift`
 *   accepts, see `BlissSVGBuilder.grid-shift.test.js`.
 */

const gridLine = (input, family) => new BlissSVGBuilder(input).svgCode
  .split('\n').find(line => line.includes(`bliss-grid-line--${family}"`));

const attr = (line, name) => line.match(new RegExp(` ${name}="([^"]*)"`))?.[1];

// Each segment of a grid path as the rectangle its stroke covers,
// [minX, minY, maxX, maxY], its ends reaching `capReach` past the segment.
const horizontalRects = (d, width, capReach) => [...d.matchAll(/M(-?[\d.]+),(-?[\d.]+)h(-?[\d.]+)/g)]
  .map(([, x, y, length]) => [Math.min(+x, +x + +length) - capReach, +y - width / 2,
    Math.max(+x, +x + +length) + capReach, +y + width / 2]);
const verticalRects = (d, width, capReach) => [...d.matchAll(/M(-?[\d.]+),(-?[\d.]+)V(-?[\d.]+)/g)]
  .map(([, x, y, endY]) => [+x - width / 2, Math.min(+y, +endY) - capReach,
    +x + width / 2, Math.max(+y, +endY) + capReach]);
const coverage = (d, width, capReach) => [...horizontalRects(d, width, capReach), ...verticalRects(d, width, capReach)];

const largestGap = (rects, others) => Math.max(...rects.flat().map((value, i) => Math.abs(value - others.flat()[i])));

const sizeOf = (input) => new BlissSVGBuilder(input).svgCode
  .match(/<svg[^>]*? width="([^"]+)" height="([^"]+)" viewBox="([^"]+)"/).slice(1).join(' | ');

describe('BlissSVGBuilder grid line coverage', () => {
  describe('when grid-shift moves the lines', () => {
    it.each([
      ['0.1667', 'sky', 'M0.0837,8.1667h8.166'],
      ['0.1667', 'major', 'M0.0837,0.1667h8.166M0.0837,4.1667h8.166M0.0837,12.1667h8.166M0.0837,20.1667h8.166'
        + 'M0.1667,0.0837V20.2497M4.1667,0.0837V20.2497M8.1667,0.0837V20.2497'],
      ['-0.1667', 'sky', 'M-0.2497,7.8333h8.166'],
      ['-0.1667', 'major', 'M-0.2497,-0.1667h8.166M-0.2497,3.8333h8.166M-0.2497,11.8333h8.166M-0.2497,19.8333h8.166'
        + 'M-0.1667,-0.2497V19.9163M3.8333,-0.2497V19.9163M7.8333,-0.2497V19.9163'],
    ])('with a shift of %s draws the %s line as %s', (shift, family, d) => {
      expect(attr(gridLine(`[grid;grid-shift=${shift}]||B313`, family), 'd')).toBe(d);
    });
  });

  describe('when a crop, a margin or centring places the lines', () => {
    it.each([
      ['crop=auto', 'major', 'M-0.083,12h8.166M0,7.917V16.083M4,7.917V16.083M8,7.917V16.083'],
      ['crop=0.33333', 'major', 'M0.2503,4h7.4993M0.2503,12h7.4993M4,0.2503V19.7497'],
      ['margin=1;crop-top=8;crop-bottom=12', 'major', 'M0,7.917V8.083M4,7.917V8.083M8,7.917V8.083'],
      ['crop-left=6;crop-right=6', 'sky', 'M6.083,8h-4.166'],
      ['crop-top=12;crop-bottom=12', 'major', 'M0,12.083V7.917M4,12.083V7.917M8,12.083V7.917'],
      ['center;min-width=12', 'major', 'M-2.083,0h12.166M-2.083,4h12.166M-2.083,12h12.166M-2.083,20h12.166'
        + 'M-2,-0.083V20.083M2,-0.083V20.083M6,-0.083V20.083M10,-0.083V20.083'],
    ])('with %s draws the %s line as %s', (options, family, d) => {
      expect(attr(gridLine(`[grid;${options}]||B313`, family), 'd')).toBe(d);
    });

    it('writes no path for a line the crop leaves no segment of, as before', () => {
      // pins the drop of an empty line: the window 9 to 15 holds neither the
      // sky (y=8) nor the earth (y=16) line; an empty path survived a 2026-11
      // hand-mutant run before this row
      const svg = new BlissSVGBuilder('[grid;crop-top=9;crop-bottom=5]||B313').svgCode;

      expect(svg.match(/<path class="bliss-grid-line[^"]*"/g)).toEqual([
        '<path class="bliss-grid-line bliss-grid-line--minor"',
        '<path class="bliss-grid-line bliss-grid-line--medium"',
        '<path class="bliss-grid-line bliss-grid-line--major"',
      ]);
      expect(svg).not.toContain('d=""');
    });
  });

  describe('when a butt-ended line is laid over the square-ended one it replaces', () => {
    // The square-ended path data each input drew before the change.
    it.each([
      ['[grid]||B313', 'minor', 'M0,1h8M0,3h8M0,5h8M0,7h8M0,9h8M0,11h8M0,13h8M0,15h8M0,17h8M0,19h8M1,0V20M3,0V20M5,0V20M7,0V20'],
      ['[grid]||B313', 'major', 'M0,0h8M0,4h8M0,12h8M0,20h8M0,0V20M4,0V20M8,0V20'],
      ['[grid]||B313/B313', 'major', 'M0,0h18M0,4h18M0,12h18M0,20h18M0,0V20M4,0V20M8,0V20M12,0V20M16,0V20'],
      ['[grid;grid-stroke-width=0.5]||B431', 'major', 'M0,0h16M0,4h16M0,12h16M0,20h16M0,0V20M4,0V20M8,0V20M12,0V20M16,0V20'],
      ['[grid;crop=auto]||B313', 'minor', 'M0,9h8M0,11h8M0,13h8M0,15h8M1,8V16M3,8V16M5,8V16M7,8V16'],
      ['[grid;grid-shift=0.1667]||B313', 'major', 'M0.1667,0.1667h8M0.1667,4.1667h8M0.1667,12.1667h8M0.1667,20.1667h8'
        + 'M0.1667,0.1667V20.1667M4.1667,0.1667V20.1667M8.1667,0.1667V20.1667'],
      ['[grid;grid-shift=-0.1667;grid-sky-stroke-width=0.4]||B313', 'sky', 'M-0.1667,7.8333h8'],
      ['[grid;margin=1;crop-top=8;crop-bottom=12]||B313', 'major', 'M0,8V8M4,8V8M8,8V8'],
      ['[grid;crop-left=6;crop-right=6]||B313', 'sky', 'M6,8h-4'],
      ['[grid;crop-top=12;crop-bottom=12]||B313', 'major', 'M0,12V8M4,12V8M8,12V8'],
      ['[grid;center;min-width=12]||B313', 'major', 'M-2,0h12M-2,4h12M-2,12h12M-2,20h12M-2,0V20M2,0V20M6,0V20M10,0V20'],
    ])('%s: every segment of the %s line covers what its square ends covered', (input, family, squareEnded) => {
      const line = gridLine(input, family);
      const width = Number(attr(line, 'stroke-width'));
      const butt = coverage(attr(line, 'd'), width, 0);
      const square = coverage(squareEnded, width, width / 2);

      expect(butt).toHaveLength(square.length);
      expect(largestGap(butt, square)).toBeLessThan(1e-9);
    });
  });

  describe('when the picture\'s size is computed', () => {
    it.each([
      ['B313', '57 | 129 | -0.75 -0.75 9.5 21.5'],
      ['[grid]||B313', '57 | 129 | -0.75 -0.75 9.5 21.5'],
      ['[grid;crop=auto]||B313', '57 | 57 | -0.75 7.25 9.5 9.5'],
      ['[crop=auto]||B313', '57 | 57 | -0.75 7.25 9.5 9.5'],
      ['[grid]||B431', '105 | 129 | -0.75 -0.75 17.5 21.5'],
      ['[grid;crop=auto]||B431', '105 | 57 | -0.75 7.25 17.5 9.5'],
      ['[grid]||B1103', '81 | 129 | -0.75 -0.75 13.5 21.5'],
      ['[grid;crop=auto]||B1103', '81 | 57 | -0.75 7.25 13.5 9.5'],
      ['[grid]||H', '57 | 129 | -0.75 -0.75 9.5 21.5'],
      ['[grid;crop=auto]||H', '57 | 57 | -0.75 -0.75 9.5 9.5'],
      ['[grid]||B208/B81', '81 | 129 | -0.75 -0.75 13.5 21.5'],
      ['[grid;crop=auto]||B208/B81', '81 | 81 | -0.75 3.25 13.5 13.5'],
    ])('%s keeps 1.0.0\'s width, height and viewBox, %s', (input, size) => {
      expect(sizeOf(input)).toBe(size);
    });
  });
});
