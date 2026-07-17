import { BlissSVGBuilder } from '../src/index';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the error-placeholder option that controls how a failing element is
 * rendered, at both the character (level 2) and word/group (level 1)
 * granularities, plus the warning-delta mechanism that decides when
 * character-level placeholder rendering activates.
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
 *   (e.g. B291:5,5,5, which warns MALFORMED_COORDINATES), not only on
 *   unknown-code failures.
 * - Word/group-level fail-render: a group flagged invalid (group.errorCode,
 *   the level-1 analogue of a failed part) records ONE warning and collapses
 *   to a single placeholder icon (ON) or renders invisible and zero-width
 *   (OFF), regardless of how many glyphs the word contained.
 *
 * Does NOT cover:
 * - WORD_AS_PART, UNKNOWN_CODE, MALFORMED_COORDINATES, and parse-error codes themselves,
 *   see `BlissSVGBuilder.word-as-part.test.js` and the forthcoming
 *   `BlissElement.warning-behavior.test.js`.
 * - The parser triggers that SET group.errorCode (malformed `;;`, an
 *   indicator bound to a multi-word alias), see `BlissParser.double-semicolon.test.js`
 *   and `BlissParser.word-indicators.test.js`.
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

    test('drops a malformed-coordinate character even with error-placeholder on (B291:5,5,5)', () => {
      // A malformed part is not content: it fails the WHOLE character and drops
      // from render and serialization (retention family, rows 31/80), so
      // error-placeholder shows NOTHING for it (only retained unknown codes get a
      // placeholder). The MALFORMED_COORDINATES warning is the only trace, and
      // the on/off SVGs are identical because nothing renders either way.
      const withPlaceholder = new BlissSVGBuilder('[error-placeholder]||B291:5,5,5');
      const withoutPlaceholder = new BlissSVGBuilder('B291:5,5,5');

      const warningMatcher = expect.objectContaining({
        code: 'MALFORMED_COORDINATES',
        message: expect.stringContaining('Invalid format: B291:5,5,5'),
      });
      expect(withPlaceholder.warnings).toEqual([warningMatcher]);
      expect(withoutPlaceholder.warnings).toEqual([warningMatcher]);

      // Only the document option survives (empty content); the character is gone.
      expect(withPlaceholder.toString()).toBe('[error-placeholder]||');
      expect(withoutPlaceholder.toString()).toBe('');
      expect(withPlaceholder.elements.children[0].children).toEqual([]);
      expect(withoutPlaceholder.elements.children[0].children).toEqual([]);
      expect(withPlaceholder.svgCode).toBe(withoutPlaceholder.svgCode);
    });
  });

  describe('when a word fails to render', () => {
    // A group the parser flags invalid (group.errorCode) is the level-1
    // analogue of a failed part: the whole word collapses to ONE icon,
    // independent of how many glyphs it held. B313/B97 stands in for a word
    // the parser would reject wholesale (e.g. a malformed `;;`).
    const PLACEHOLDER_PARTS = BlissParser.parse('REFSQUARE;B699:3').groups[0].glyphs[0].parts;

    const renderFlaggedWord = (errorPlaceholder) => {
      const shared = {
        charSpace: 2,
        wordSpace: 8,
        externalGlyphSpace: 0.8,
        warnings: [],
        errorPlaceholder,
        errorPlaceholderParts: PLACEHOLDER_PARTS,
      };
      const element = new BlissElement({
        groups: [{
          errorCode: 'MALFORMED_WORD_INDICATOR',
          error: 'Malformed word-level indicator in "B313;;B97;;B81".',
          errorSource: 'B313;;B97;;B81',
          glyphs: BlissParser.parse('B313/B97').groups[0].glyphs,
        }],
      }, { sharedOptions: shared });
      return { group: element.children[0], warnings: shared.warnings };
    };

    const EXPECTED_WARNING = {
      code: 'MALFORMED_WORD_INDICATOR',
      message: 'Malformed word-level indicator in "B313;;B97;;B81".',
      source: 'B313;;B97;;B81',
    };

    test('collapses a multi-glyph word to a single placeholder icon when error-placeholder is enabled', () => {
      const { group, warnings } = renderFlaggedWord(true);

      expect(warnings).toEqual([EXPECTED_WARNING]);
      expect(group.children).toHaveLength(1);
      expect(group.children[0].children.map(child => child.codeName)).toEqual(['REFSQUARE', 'B699']);
      expect(group.advanceX).toBe(10);
      expect(group.getSvgContent()).toContain('h8');
    });

    test('renders invisible and zero-width when error-placeholder is not enabled', () => {
      const { group, warnings } = renderFlaggedWord(false);

      expect(warnings).toEqual([EXPECTED_WARNING]);
      expect(group.children).toEqual([]);
      expect(group.width).toBe(0);
      expect(group.advanceX).toBe(0);
      expect(group.getSvgContent()).toBe('');
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
