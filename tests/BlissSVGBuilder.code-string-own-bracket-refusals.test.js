/**
 * Pins `define()` and `patchDefinition()` judging a leading character bracket
 * in a one-character code string as they judge `defaultOptions`: the bracket is
 * the definition's own options, so a key that cannot describe what the
 * character is gets refused there too.
 *
 * Covers:
 * - A position (`x`, `y`), a kerning key, `key`, a canvas-wide option and a
 *   layer key in that bracket refused for a typed glyph, a typed shape and a
 *   one-character bare alias, on both surfaces, the error naming the bracket
 *   and the key as written, and the registry left unchanged.
 * - A styling key and a data attribute accepted there, on both surfaces.
 * - A bracket leading a code string that draws no single character left to
 *   the use, which reports it: over a word (written, after a composed first
 *   character, or through an alias of a word or of a letter run), and over
 *   no code at all. Once the word such a bracket leads is patched into one
 *   character, a kerning key in it is reported where the code is used and
 *   does not kern.
 *
 * Does NOT cover:
 * - How such a bracket draws and saves where the definition is used, see
 *   `BlissSVGBuilder.code-string-own-bracket.test.js`.
 * - The same keys in `defaultOptions`, see
 *   `BlissSVGBuilder.definition-use-site-options.test.js` and
 *   `BlissParser.global-option-scope.test.js`.
 * - A word alias's leading bracket, which sits on its first character and is
 *   not the definition's own options.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

// Each kind of definition whose code string draws one character, with a body
// it may legally reference: a shape references shapes only.
const KINDS = [
  ['a typed glyph', (codeString) => ({ type: 'glyph', codeString }), 'B291'],
  ['a typed shape', (codeString) => ({ type: 'shape', codeString }), 'C8'],
  ['a one-character bare alias', (codeString) => ({ codeString }), 'B291'],
];

const REFUSED = [
  ['[x=2]', 'x'],
  ['[y=1]', 'y'],
  ['[relative-kerning=3]', 'relative-kerning'],
  ['[absolute-kerning=1]', 'absolute-kerning'],
  ['[key=k;color=red]', 'key'],
  ['[margin=2]', 'margin'],
  ['[grid--stroke=red]', 'grid--stroke'],
];

const ACCEPTED = ['[color=red]', '[data-x=1]'];

// One row per kind and bracket: the code string, the kind, the key, how to
// define it, its plain body, the name a define() call tries, and the name of a
// plain definition of the same kind for patchDefinition() to change.
const REFUSAL_ROWS = KINDS.flatMap(([kind, make, body], k) => REFUSED.map(([bracket, key], r) =>
  [`${bracket}${body}`, kind, key, make, body, `OB_REFUSED_${k}_${r}`, `OB_UNPATCHED_${k}_${r}`]));

const ACCEPTED_ROWS = KINDS.flatMap(([kind, make, body], k) => ACCEPTED.map((bracket, a) =>
  [`${bracket}${body}`, kind, make, body, `OB_ACCEPTED_${k}_${a}`, `OB_PATCHED_${k}_${a}`]));

const PATCH_TARGETS = {
  ...Object.fromEntries(REFUSAL_ROWS.map(([, , , make, body, , patched]) => [patched, make(body)])),
  ...Object.fromEntries(ACCEPTED_ROWS.map(([, , make, body, , patched]) => [patched, make(body)])),
};

// Codes a bare alias's code string can name and still draw a word, and one
// that a test patches into a single character.
const WORD_TARGETS = {
  OB_WORDLIKE: { codeString: 'B291/C8' },
  OB_RUNLIKE: { codeString: 'Xab' },
  OB_BECOMES_ONE: { codeString: 'B291/C8' },
};

// A bracket a define() call would refuse as the definition's own options,
// leading code strings where it is not: one per way a code string can draw a
// word, and one with no code behind the bracket at all.
const LEFT_TO_THE_USE = [
  ['a word break', '[margin=2]B291/C8'],
  ['a word break after a composed first character', '[margin=2]B291;B86/C8'],
  ['an alias of a word', '[margin=2]OB_WORDLIKE'],
  ['an alias of a letter run', '[margin=2]OB_RUNLIKE'],
  ['no code at all', '[margin=2]'],
].map(([label, codeString], i) => [label, codeString, `OB_LEFT_${i}`]);

beforeAll(() => {
  const { defined, errors } = BlissSVGBuilder.define({ ...PATCH_TARGETS, ...WORD_TARGETS });
  expect(errors).toEqual([]);
  expect(defined).toEqual([...Object.keys(PATCH_TARGETS), ...Object.keys(WORD_TARGETS)]);
});

afterAll(() => {
  const names = [...REFUSAL_ROWS.map((row) => row[5]), ...ACCEPTED_ROWS.map((row) => row[4]),
    ...LEFT_TO_THE_USE.map((row) => row[2]), 'OB_LEFT_KERNED', ...Object.keys(PATCH_TARGETS), ...Object.keys(WORD_TARGETS)];
  for (const code of names) BlissSVGBuilder.removeDefinition(code);
});

describe('BlissSVGBuilder code string own bracket refusals', () => {
  describe('when the bracket holds a key that says where one use sits or acts on the whole SVG', () => {
    it.each(REFUSAL_ROWS)('refuses %s for %s, naming the bracket and %s', (codeString, _kind, key, make, body, name, unpatched) => {
      const mentionsBracketAndKey = new RegExp(`character bracket.*"${key}"`);
      const { defined, errors } = BlissSVGBuilder.define({ [name]: make(codeString) });
      expect(defined).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(mentionsBracketAndKey);
      expect(errors[0]).not.toContain('defaultOptions');
      expect(BlissSVGBuilder.isDefined(name)).toBe(false);
      expect(() => BlissSVGBuilder.patchDefinition(unpatched, { codeString })).toThrow(mentionsBracketAndKey);
      expect(BlissSVGBuilder.getDefinition(unpatched).codeString).toBe(body);
    });
  });

  describe('when the bracket holds styling', () => {
    it.each(ACCEPTED_ROWS)('accepts %s for %s', (codeString, _kind, make, _body, name, patched) => {
      // control: passes before C23
      expect(BlissSVGBuilder.define({ [name]: make(codeString) })).toMatchObject({ defined: [name], errors: [] });
      BlissSVGBuilder.patchDefinition(patched, { codeString });
      expect(BlissSVGBuilder.getDefinition(patched).codeString).toBe(codeString);
    });
  });

  describe('when the bracket leads a code string that draws no single character', () => {
    it.each(LEFT_TO_THE_USE)('accepts a bracket leading %s (%s), which the use reports', (_label, codeString, name) => {
      // control: passes before C23. Over a word the bracket is its first
      // character's, as written, and with no code behind it there is nothing
      // for it to be the options of; either way it stays decoration
      expect(BlissSVGBuilder.define({ [name]: { codeString } })).toMatchObject({ defined: [name], errors: [] });
      expect(new BlissSVGBuilder(name).warnings.map((warning) => warning.code)).toContain('MISPLACED_GLOBAL_OPTION');
    });

    it('reports a kerning key in it once the word it leads is patched into one character, and does not kern', () => {
      // note: define() judged the bracket while it led a word; the patch makes
      // it the definition's own options, read where the definition is used as
      // the part it is, where kerning means nothing
      expect(BlissSVGBuilder.define({ OB_LEFT_KERNED: { codeString: '[relative-kerning=3]OB_BECOMES_ONE' } }).errors).toEqual([]);
      BlissSVGBuilder.patchDefinition('OB_BECOMES_ONE', { codeString: 'B291' });
      const builder = new BlissSVGBuilder('B313/OB_LEFT_KERNED');
      expect(builder.warnings.map((warning) => warning.code)).toEqual(['MISPLACED_KERNING_OPTION']);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B313/B291').svgCode);
    });
  });
});
