import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { BlissElement } from '../src/lib/bliss-element.js';

/**
 * Pins that a token the parser cannot read reports the text written as its
 * warning `source`, so the source can be found in the input.
 *
 * Covers:
 * - UNKNOWN_CODE for a token that is not a code, as a character, as a `;`
 *   part, behind a part bracket and inside a word, with the message quoting
 *   the same text.
 * - MALFORMED_COORDINATES for a coordinate that cannot be read.
 * - Neither the written text nor the parser's description reaching a save.
 * - An element built from a part that carries its written text, and from one
 *   that does not.
 *
 * Does NOT cover:
 * - The `source` of the other warning codes, see each code's own file.
 * - Which tokens fail and that the failed character is dropped, see
 *   `BlissSVGBuilder.malformed-retention.test.js` and
 *   `BlissSVGBuilder.coordinate-syntax.test.js`.
 */

// Each warning as `${code} ${source}`, so a row fails on either.
const reported = (builder) => builder.warnings.map(w => `${w.code} ${w.source}`);

const sharedOptions = () => ({
  charSpace: 2,
  wordSpace: 8,
  externalGlyphSpace: 0.8,
  warnings: [],
});

// The bracketed tokens pin the restore: the parser holds a bracket as a
// placeholder while it reads, and the source is the bracket as written.
const UNREADABLE_TOKENS = [
  ['B291[data-foo=bar]', 'B291[data-foo=bar]'],
  ['B291;B291[x=1]', 'B291[x=1]'],
  ['[color=red]>B291[x]', 'B291[x]'],
  ['B291;Q[a]', 'Q[a]'],
  ['B291>', 'B291>'],
  ['B313/B291[a]', 'B291[a]'],
];

describe('BlissSVGBuilder malformed part source', () => {
  describe('when a part cannot be read as a code', () => {
    it.each(UNREADABLE_TOKENS)('reports %s with the token %s as written', (input, fragment) => {
      const builder = new BlissSVGBuilder(input);

      expect(reported(builder)).toEqual([`UNKNOWN_CODE ${fragment}`]);
      expect(input.includes(builder.warnings[0].source)).toBe(true);
      // pins the message: it quotes the written text, not the description
      expect(builder.warnings[0].message).toBe(`Unknown or invalid code: "${fragment}"`);
    });
  });

  describe('when a coordinate cannot be read', () => {
    it.each(['B291:abc', 'ZZ:abc', 'B291:5,6,7'])('reports %s as written, with the description as its message', (input) => {
      const builder = new BlissSVGBuilder(input);

      expect(reported(builder)).toEqual([`MALFORMED_COORDINATES ${input}`]);
      // pins the split: the source moved to the written text, the message did not
      expect(builder.warnings[0].message).toBe(`Invalid format: ${input}`);
    });
  });

  describe('when the failed part is saved', () => {
    it.each(UNREADABLE_TOKENS)('keeps any trace of %s out of the JSON save', (input) => {
      const saved = JSON.stringify(new BlissSVGBuilder(input).toJSON());

      expect(saved).not.toContain('errorSource');
      expect(saved).not.toContain('Invalid format');
    });
  });

  describe('when an element is built from a failed part', () => {
    it('reports the written text of a malformed coordinate', () => {
      const shared = sharedOptions();
      new BlissElement({
        error: 'Invalid format: B291:abc',
        errorSource: 'B291:abc',
        errorCode: 'MALFORMED_COORDINATES'
      }, { level: 3, sharedOptions: shared });

      // pins the split: the message stays the description, the source is the text
      expect(shared.warnings).toEqual([{
        code: 'MALFORMED_COORDINATES',
        message: 'Invalid format: B291:abc',
        source: 'B291:abc'
      }]);
    });

    it('reports the written text of an unknown code', () => {
      const shared = sharedOptions();
      new BlissElement({
        error: 'Invalid format: B313$',
        errorSource: 'B313$'
      }, { level: 3, sharedOptions: shared });

      expect(shared.warnings).toEqual([{
        code: 'UNKNOWN_CODE',
        message: 'Unknown or invalid code: "B313$"',
        source: 'B313$'
      }]);
    });

    it('reports the description when the part carries no written text', () => {
      const shared = sharedOptions();
      new BlissElement({
        error: 'Invalid format: B291:abc',
        errorCode: 'MALFORMED_COORDINATES'
      }, { level: 3, sharedOptions: shared });

      expect(shared.warnings.map(w => w.source)).toEqual(['Invalid format: B291:abc']);
    });
  });
});
