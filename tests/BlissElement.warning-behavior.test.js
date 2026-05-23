import { BlissElement } from '../src/lib/bliss-element.js';

/**
 * Pins the warning-collection contract on BlissElement construction at the
 * part level: how the constructor decides which warning code to record on
 * `sharedOptions.warnings`, and what source identifier to attach.
 *
 * Covers:
 * - Caller-tagged path: a part with `errorCode` records that exact code
 *   and message verbatim (e.g., WORD_AS_PART supplied by the parser).
 * - Fallback path: a part without `errorCode` records UNKNOWN_CODE; the
 *   source field reflects the codeName when present, the literal "unknown"
 *   when an empty composite is given, or the parse-error message when
 *   only `error` is provided.
 * - Common shape across all warning paths: failing parts render with width
 *   0 and empty SVG content.
 *
 * Does NOT cover:
 * - The error-placeholder rendering policy (the optional REFSQUARE+B699
 *   placeholder pair when the option is enabled), see
 *   `BlissElement.error-placeholder.test.js`.
 * - WORD_AS_PART triggered at the DSL/parser surface (when a user enters
 *   multi-character text as a part), see
 *   `BlissSVGBuilder.word-as-part.test.js`.
 * - The throwing variant (same invalid inputs without warning collection),
 *   see `BlissElement.internal-mechanics.test.js` (`when a part is directly constructed at
 *   level 3 with invalid input`).
 */
describe('BlissElement warning behavior', () => {
  const sharedOptions = () => ({
    charSpace: 2,
    wordSpace: 8,
    externalGlyphSpace: 0.8,
    warnings: [],
  });

  describe('when a part carries an explicit errorCode', () => {
    test('uses the supplied errorCode and message verbatim', () => {
      const shared = sharedOptions();
      const part = new BlissElement({
        codeName: 'Xab',
        error: 'Multi-character text "ab" is a word and cannot be composed with ;',
        errorCode: 'WORD_AS_PART'
      }, { level: 3, sharedOptions: shared });

      expect(shared.warnings).toEqual([{
        code: 'WORD_AS_PART',
        message: 'Multi-character text "ab" is a word and cannot be composed with ;',
        source: 'Xab'
      }]);
      expect(part.width).toBe(0);
      expect(part.getSvgContent()).toBe('');
    });
  });

  describe('when a part has no explicit errorCode', () => {
    test('records UNKNOWN_CODE with the codeName or "unknown" as source', () => {
      const shared = sharedOptions();
      const missingPart = new BlissElement({
        codeName: 'NO_SUCH_CODE'
      }, { level: 3, sharedOptions: shared });
      const emptyCompositeRoot = new BlissElement({
        groups: [{ glyphs: [{ parts: [{ parts: [] }] }] }]
      }, { sharedOptions: shared });

      expect(shared.warnings).toEqual([
        {
          code: 'UNKNOWN_CODE',
          message: 'Unknown or invalid code: "NO_SUCH_CODE"',
          source: 'NO_SUCH_CODE'
        },
        {
          code: 'UNKNOWN_CODE',
          message: 'Unknown or invalid code: "unknown"',
          source: 'unknown'
        }
      ]);
      expect(missingPart.width).toBe(0);
      expect(missingPart.getSvgContent()).toBe('');
      expect(emptyCompositeRoot.snapshot().children[0].children[0].children).toEqual([]);
    });

    test('records UNKNOWN_CODE with the parse-error message as source', () => {
      const shared = sharedOptions();
      const part = new BlissElement({
        error: 'Invalid format: B313$'
      }, { level: 3, sharedOptions: shared });

      expect(shared.warnings).toEqual([{
        code: 'UNKNOWN_CODE',
        message: 'Unknown or invalid code: "Invalid format: B313$"',
        source: 'Invalid format: B313$'
      }]);
      expect(part.width).toBe(0);
      expect(part.getSvgContent()).toBe('');
    });
  });
});
