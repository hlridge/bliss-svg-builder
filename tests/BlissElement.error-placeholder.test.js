import { BlissSVGBuilder } from '../src/index';
import { BlissElement } from '../src/lib/bliss-element.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the error-placeholder option that controls how a character which
 * fails to resolve to a known code is rendered, and the warning-delta
 * mechanism that decides when placeholder rendering activates.
 *
 * Covers:
 * - error-placeholder ON: a failing character renders REFSQUARE + B699
 *   placeholder parts with non-zero width and advance.
 * - error-placeholder OFF (default): a failing character renders invisible
 *   and zero-width; the failure is recorded only via the UNKNOWN_CODE
 *   warning.
 * - Warning-delta semantics: pre-existing warnings on sharedOptions do NOT
 *   trigger placeholder rendering; only warnings added during construction
 *   count toward the failure check.
 * - error-placeholder also activates on malformed-coordinate parse errors
 *   (e.g. B291:5,5,5), not only on unknown-code failures.
 *
 * Does NOT cover:
 * - WORD_AS_PART, UNKNOWN_CODE, and parse-error warning codes themselves,
 *   see `BlissSVGBuilder.word-as-part.test.js` and the forthcoming
 *   `BlissElement.warning-behavior.test.js`.
 * - Defensive option validation (prototype pollution, malformed keys),
 *   see `BlissSVGBuilder.option-hardening.test.js`.
 * - Cascading of error-placeholder through nested option levels,
 *   see `BlissSVGBuilder.hierarchical-options.test.js`.
 */
describe('BlissElement error placeholder', () => {
  describe('when a character fails to render', () => {
    test('uses REFSQUARE and B699 placeholder parts when error-placeholder is enabled', () => {
      const builder = new BlissSVGBuilder('[error-placeholder]||BAD');
      const glyph = builder.elements.children[0].children[0];

      expect(builder.warnings).toEqual([{
        code: 'UNKNOWN_CODE',
        message: 'Unknown or invalid code: "BAD"',
        source: 'BAD'
      }]);
      expect(glyph.width).toBe(8);
      expect(glyph.advanceX).toBe(10);
      expect(glyph.children.map(child => child.codeName)).toEqual(['REFSQUARE', 'B699']);
      expect(builder.svgContent).toContain('M0,8h8');
    });

    test('renders invisible and zero-width when error-placeholder is not enabled', () => {
      const builder = new BlissSVGBuilder('BAD');
      const glyph = builder.elements.children[0].children[0];

      expect(builder.warnings).toEqual([{
        code: 'UNKNOWN_CODE',
        message: 'Unknown or invalid code: "BAD"',
        source: 'BAD'
      }]);
      expect(glyph.children).toEqual([]);
      expect(glyph.width).toBe(0);
      expect(glyph.advanceX).toBe(0);
      expect(builder.svgContent).toBe('<path d=""/>');
    });

    test('activates the placeholder on a malformed-coordinate parse error (B291:5,5,5)', () => {
      // The activation rule keys off any new warning during construction,
      // not just UNKNOWN_CODE on a missing code. A parse error surfaced as
      // an UNKNOWN_CODE wrapper around "Invalid format: ..." also counts.
      const withPlaceholder = new BlissSVGBuilder('[error-placeholder]||B291:5,5,5');
      const withoutPlaceholder = new BlissSVGBuilder('B291:5,5,5');

      const warningMatcher = expect.objectContaining({
        code: 'UNKNOWN_CODE',
        message: expect.stringContaining('Invalid format: B291:5,5,5'),
      });
      expect(withPlaceholder.warnings).toEqual([warningMatcher]);
      expect(withoutPlaceholder.warnings).toEqual([warningMatcher]);

      const placeholderGlyph = withPlaceholder.elements.children[0].children[0];
      expect(placeholderGlyph.children.map(child => child.codeName)).toEqual(['REFSQUARE', 'B699']);
      expect(withPlaceholder.svgCode.length).toBeGreaterThan(withoutPlaceholder.svgCode.length);

      const bareGlyph = withoutPlaceholder.elements.children[0].children[0];
      expect(bareGlyph.children).toEqual([]);
    });
  });

  describe('when sharedOptions carries warnings predating construction', () => {
    const RAW_LEAF = '_C15_RAW_LEAF';
    let previousDefinition;

    beforeAll(() => {
      previousDefinition = blissElementDefinitions[RAW_LEAF];
      blissElementDefinitions[RAW_LEAF] = {
        getPath: (x, y) => `M${x},${y}h2`,
        width: 2,
        height: 1,
        isShape: true
      };
    });

    afterAll(() => {
      if (previousDefinition === undefined) {
        delete blissElementDefinitions[RAW_LEAF];
      } else {
        blissElementDefinitions[RAW_LEAF] = previousDefinition;
      }
    });

    test('does not treat them as failed parts', () => {
      const warning = { code: 'PREVIOUS_WARNING', message: 'before constructor', source: 'setup' };
      const shared = {
        charSpace: 2,
        wordSpace: 8,
        externalGlyphSpace: 0.8,
        warnings: [warning],
      };
      const element = new BlissElement({
        groups: [{ glyphs: [{ parts: [{ codeName: RAW_LEAF }] }] }]
      }, { sharedOptions: shared });
      const glyph = element.snapshot().children[0].children[0];

      expect(shared.warnings).toEqual([warning]);
      expect(glyph.children).toHaveLength(1);
      expect(glyph.width).toBe(2);
      expect(element.getSvgContent()).toBe('M0,0h2');
    });
  });
});
