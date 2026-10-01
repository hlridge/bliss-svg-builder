import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that the two alphabet characters draw exactly as their three letters
 * written out as a run: B118 (lowercase) as `Xa/Xb/Xc` and B972 (uppercase)
 * as `XA/XB/XC`, with the same letter outlines and the same canvas size at
 * the precision the builder writes them.
 *
 * Covers:
 * - Each character alone, inside a word beside a Bliss character on either
 *   side, and as a word of its own in a sentence.
 * - Through that comparison, the letter offsets in their code strings: a
 *   change to the letters' widths, their pair kerning or the default letter
 *   gap moves the run, and the built-in has to move with it.
 *
 * Does NOT cover:
 * - A letter written next to B118 or B972: they keep the Bliss character
 *   space there, where a run would use the letter gap, by design; see
 *   `BlissSVGBuilder.decorated-character-layout.test.js`.
 * - An indicator on them, centred over all three letters; see
 *   `BlissSVGBuilder.indicator-centering.test.js`.
 * - Bliss strokes drawn after them, which are written at full precision and
 *   can differ from the run's in the eighth decimal; byte identity is not
 *   the contract.
 */

// The canvas size and the outlined letters of a drawing. Letters are filled
// paths (`stroke="none"`), so a neighbouring Bliss character's strokes stay out.
const lettersAndCanvas = (input) => {
  const svg = new BlissSVGBuilder(input).svgCode;
  const root = svg.match(/<svg [^>]*>/)[0];
  return {
    width: root.match(/ width="([^"]*)"/)[1],
    height: root.match(/ height="([^"]*)"/)[1],
    viewBox: root.match(/ viewBox="([^"]*)"/)[1],
    letters: svg.match(/<path stroke="none"[^>]*>/g),
  };
};

describe('BlissSVGBuilder alphabet characters', () => {
  describe('when drawn alone', () => {
    it.each([
      ['B118', 'Xa/Xb/Xc'],
      ['B972', 'XA/XB/XC'],
    ])('draws %s with the letter outlines and canvas size of %s', (input, run) => {
      const drawn = lettersAndCanvas(input);
      expect(drawn.letters).toHaveLength(3);
      expect(drawn).toEqual(lettersAndCanvas(run));
    });
  });

  describe('when beside a Bliss character in a word', () => {
    it.each([
      ['B313/B118', 'B313/Xa/Xb/Xc'],
      ['B118/B313', 'Xa/Xb/Xc/B313'],
      ['B313/B972', 'B313/XA/XB/XC'],
      ['B972/B313', 'XA/XB/XC/B313'],
    ])('draws %s with the letter outlines and canvas size of %s', (input, run) => {
      const drawn = lettersAndCanvas(input);
      expect(drawn.letters).toHaveLength(3);
      expect(drawn).toEqual(lettersAndCanvas(run));
    });
  });

  describe('when a word of its own in a sentence', () => {
    it.each([
      ['B313//B118//B313', 'B313//Xa/Xb/Xc//B313'],
      ['B313//B972//B313', 'B313//XA/XB/XC//B313'],
    ])('draws %s with the letter outlines and canvas size of %s', (input, run) => {
      const drawn = lettersAndCanvas(input);
      expect(drawn.letters).toHaveLength(3);
      expect(drawn).toEqual(lettersAndCanvas(run));
    });
  });
});
