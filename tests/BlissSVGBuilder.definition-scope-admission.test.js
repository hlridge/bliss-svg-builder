/**
 * Pins that a key misplaced inside a definition's code string is reported and
 * dropped however the composition names the definition: in a string, or in a
 * composition object such as a saved `toJSON()`.
 *
 * A code string is DSL text, so its brackets are brackets wherever the
 * definition is expanded, and a key a part bracket cannot act on (a canvas-wide
 * key, a kerning key, a target-prefixed key) gets the bracket's own report. A
 * string naming the definition always got it. A composition object expanded
 * the same definition through a second reader that judged no scope, so a
 * composition saved with `toJSON()` and reloaded kept the key in silence and
 * wrote it back out through `toString()`, where the next reload reported it.
 *
 * Covers:
 * - Each family (canvas-wide, target-prefixed, kerning) in a definition used as
 *   a part, and one a definition deeper: a reloaded `toJSON()` reports exactly
 *   what the string it came from reports, both pinned word for word.
 * - What is saved: none of the key in `toString()`, `toJSON()` or the deep
 *   `toJSON()`, and the same string and deep `toJSON()` the string route saves.
 * - A saved string that reloads clean and draws the same picture.
 * - The report outliving a later mutation.
 * - `merge()` of a builder built before the definition existed, the one case
 *   in which merging expands a definition.
 * - What must not change: a key that acts on a part is kept, silently.
 *
 * Does NOT cover:
 * - A misplaced key in a bag or bracket the caller wrote, on each route, see
 *   `BlissSVGBuilder.option-scope-admission.test.js`.
 * - A definition's `defaultOptions`, which refuse a canvas or layer key as a
 *   definition error, see `BlissParser.global-option-scope.test.js`, and a
 *   position, kerning or `key` too, see
 *   `BlissSVGBuilder.definition-use-site-options.test.js`.
 * - The other ways the two readers of a code string differ (a bare `>` or a
 *   second bracket in a slot), tracked in the backlog.
 * - That no route skips the scope, see
 *   `BlissSVGBuilder.option-admission-drift.test.js`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

const DEFINITIONS = {
  DSCC: { type: 'shape', codeString: '[margin-top=3]>HL8;VL8' },
  DSCL: { type: 'shape', codeString: '[content--fill=red]>HL8;VL8' },
  DSCK: { type: 'shape', codeString: '[relative-kerning=3]>HL8;VL8' },
  DSCN: { type: 'glyph', codeString: 'DSCC;B291' },
  DSCH: { type: 'shape', codeString: '[color=red]>HL8;VL8' },
};

beforeAll(() => {
  const { errors } = BlissSVGBuilder.define(DEFINITIONS);
  if (errors.length) throw new Error(`fixture definitions refused: ${errors.join('; ')}`);
});

afterAll(() => {
  for (const code of Object.keys(DEFINITIONS)) BlissSVGBuilder.removeDefinition(code);
});

const CANVAS_REPORT = {
  code: 'MISPLACED_GLOBAL_OPTION',
  message: 'Global option (margin-top=3) ignored at part level: it configures the whole SVG. Use [margin-top=3]|| to apply it globally.',
  source: 'margin-top=3',
};

const LAYER_REPORT = {
  code: 'MISPLACED_LAYER_OPTION',
  message: 'Layer option (content--fill=red) ignored at part level: it names a layer of the whole SVG. Use [content--fill=red]|| to apply it, or write the attribute without a layer prefix to put it on this element.',
  source: 'content--fill=red',
};

const KERNING_REPORT = {
  code: 'MISPLACED_KERNING_OPTION',
  message: 'Kerning option (relative-kerning=3) ignored at part level: kerning is the gap before a character. Write it on the character, or use the RK:/AK: marker before it.',
  source: 'relative-kerning=3',
};

const FAMILIES = [
  ['a canvas-wide key', 'DSCC', CANVAS_REPORT, /margin-?top/i],
  ['a target-prefixed key', 'DSCL', LAYER_REPORT, /content--fill/],
  ['a kerning key', 'DSCK', KERNING_REPORT, /relative-?kerning/i],
  ['a canvas-wide key one definition deeper', 'DSCN', CANVAS_REPORT, /margin-?top/i],
];

const namedInString = (code) => new BlissSVGBuilder(`B313;${code}`);

// A real save reloaded: the saved part names the definition and holds none of
// its content, so reloading is what expands it.
const namedInObject = (code) => new BlissSVGBuilder(namedInString(code).toJSON());

const everySave = (builder) =>
  `${builder.toString()} ${JSON.stringify(builder.toJSON())} ${JSON.stringify(builder.toJSON({ deep: true }))}`;

describe('BlissSVGBuilder definition scope admission', () => {
  describe('when a saved composition names a definition whose code string misplaces a key', () => {
    it.each(FAMILIES)('reports %s exactly as the string naming the definition does', (_family, code, report) => {
      const saved = namedInString(code).toJSON();

      // the row only tests the expansion while the save names the definition
      expect(saved.groups[0].glyphs[0].parts[1]).toEqual({ codeName: code });
      expect(namedInString(code).warnings).toEqual([report]);
      expect(new BlissSVGBuilder(saved).warnings).toEqual([report]);
    });

    it.each(FAMILIES)('leaves %s out of every save', (_family, code, _report, spelled) => {
      expect(everySave(namedInObject(code))).not.toMatch(spelled);
    });

    it.each(FAMILIES)('saves what the string naming the definition saves, for %s', (_family, code) => {
      expect(namedInObject(code).toString()).toBe(namedInString(code).toString());
      // pins a bracket emptied by the refusal storing no `{}`: without that,
      // the deep save holds an empty options bag the string's save does not
      expect(namedInObject(code).toJSON({ deep: true })).toEqual(namedInString(code).toJSON({ deep: true }));
    });

    it.each(FAMILIES)('reloads its string with nothing to report and the same picture, for %s', (_family, code) => {
      const builder = namedInObject(code);
      const reloaded = new BlissSVGBuilder(builder.toString());

      // regression: the reload used to be the FIRST place the key was
      // reported, so one composition warned or not depending on how it was saved
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });
  });

  describe('when the composition changes after the key was refused', () => {
    it('still reports the refusal made while the definition was expanded', () => {
      const builder = namedInObject('DSCC');
      builder.group(0).glyph(0).setOptions({ color: 'red' });

      expect(builder.warnings).toEqual([CANVAS_REPORT]);
    });
  });

  describe('when a builder built before the definition existed is merged in', () => {
    it('reports the key once, saves none of it, and reloads clean', () => {
      const other = new BlissSVGBuilder('B313;DSCM');
      BlissSVGBuilder.define({ DSCM: { type: 'shape', codeString: '[margin-top=3]>HL8;VL8' } });
      try {
        const target = new BlissSVGBuilder('B291');
        target.merge(other);
        const reloaded = new BlissSVGBuilder(target.toString());

        expect(target.warnings).toEqual([CANVAS_REPORT]);
        expect(target.toString()).toBe('B291//B313;HL8;VL8');
        expect(reloaded.warnings).toEqual([]);
        expect(reloaded.svgCode).toBe(target.svgCode);
      } finally {
        BlissSVGBuilder.removeDefinition('DSCM');
      }
    });
  });

  describe('when the key in the code string acts on a part', () => {
    it('keeps it and reports nothing, whichever way the definition is named', () => {
      const fromObject = namedInObject('DSCH');

      expect(namedInString('DSCH').warnings).toEqual([]);
      expect(fromObject.warnings).toEqual([]);
      expect(fromObject.toString()).toBe('B313;[color=red]>HL8;VL8');
    });
  });
});
