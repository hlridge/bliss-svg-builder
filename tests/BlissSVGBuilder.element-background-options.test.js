import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins how the options behind element backgrounds are admitted: `background`
 * kept at word, character and part scope, and `background-area` and
 * `link-area` taking exactly the words `box` and `ink`, at every scope.
 *
 * Covers:
 * - `background` at word, character and part scope: silent, saved where
 *   written; an empty value kept the same way and drawing no box.
 * - `background-area` and `link-area`: `box` and `ink` accepted globally and
 *   at every element scope, saved as written, never emitted as an attribute.
 * - Any other value (another word, the right word in capitals, a number, no
 *   value at all, a quoted blank): one INVALID_OPTION_VALUE naming it, kept in
 *   the saved string and reported again on reload, the option drawing as if
 *   left out.
 * - An area option with nothing painted or linked drawing exactly as without it.
 * - A space carrying any of the three: MISPLACED_SPACE_DECORATION, as for any
 *   option on a space.
 * - The three zone options staying global (MISPLACED_GLOBAL_OPTION below `||`).
 * - Every route alike: the DSL, a composition object, a handle's `setOptions`
 *   and the transient options, at word, character and part scope; reloads
 *   from `toString()` and both `toJSON()` modes.
 *
 * Does NOT cover:
 * - What a background draws and where, see
 *   `BlissSVGBuilder.element-backgrounds.test.js` and
 *   `BlissSVGBuilder.element-background-layer.test.js`.
 * - The ink areas for paint and links, and the routes for `link-area`, see
 *   `BlissSVGBuilder.ink-areas.test.js`.
 * - The picture's own background and its zones, see
 *   `BlissSVGBuilder.svg-structure.test.js` and
 *   `BlissSVGBuilder.layer-sub-targets.test.js`.
 * - A value with no text form (`null`, an object), which the text gate every
 *   text option shares refuses first, see
 *   `BlissSVGBuilder.text-option-values.test.js`.
 *
 * @issue: #29
 */

const build = (input) => new BlissSVGBuilder(input);
const codesAndSources = (builder) => builder.warnings.map((w) => [w.code, w.source]);

describe('BlissSVGBuilder element background options', () => {
  describe('when background is written below global scope', () => {
    it.each([
      ['a word', '[background=yellow]|B313/B291'],
      ['a character', '[background=yellow]B313'],
      ['a part', 'B313;[background=yellow]>B81'],
    ])('keeps it on %s, silently, saved where it was written', (_case, input) => {
      // pins `background` leaving the global-only set: there it is reported
      // as MISPLACED_GLOBAL_OPTION and dropped from the saved string
      const builder = build(input);

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe(input);
    });

    it('keeps an empty background the same way, and draws no box for it', () => {
      const builder = build('[background=]B313');

      expect(builder.warnings).toEqual([]);
      expect(builder.toString()).toBe('[background=]B313');
      expect(builder.svgCode).not.toContain('<rect');
    });
  });

  describe('when an area option takes one of its words', () => {
    it.each(['background-area=box', 'background-area=ink', 'link-area=box', 'link-area=ink'])(
      'accepts %s globally and at every element scope, saved as written and never emitted', (option) => {
        for (const input of [`[${option}]||B313`, `[${option}]|B313/B291`, `[${option}]B313`, `B313;[${option}]>B81`]) {
          const builder = build(input);

          expect(builder.warnings, input).toEqual([]);
          expect(builder.toString(), input).toBe(input);
          expect(builder.svgCode, input).not.toMatch(/(background|link)-area=/);
        }
      });
  });

  describe('when an area option is given any other value', () => {
    it.each([
      ['another word', '[background-area=foo]B313', 'background-area=foo'],
      ['the right word in capitals', '[link-area=INK]B313', 'link-area=INK'],
      ['no value at all', '[background-area]B313', 'background-area'],
    ])('reports %s once, keeps it in the saved string and reports it again on reload', (_case, input, source) => {
      // pins the exact match: a judge that folds case accepts INK
      const builder = build(input);

      expect(codesAndSources(builder)).toEqual([['INVALID_OPTION_VALUE', source]]);
      expect(builder.toString()).toBe(input);
      expect(build(builder.toString()).warnings).toEqual(builder.warnings);
    });

    it('names the two words it takes in the warning', () => {
      expect(build('[background-area=foo]B313').warnings[0].message).toBe(
        '"background-area" takes box or ink, and "foo" is neither, so it was ignored: '
        + 'the option keeps the value it would have had without it.');
    });

    it('says a bare key was written without a word', () => {
      // a bare key arrives as `true`, which the author never wrote, so the
      // message says what was missing rather than quoting it (as the numeric
      // options do for a bare key)
      expect(build('[background-area]B313').warnings[0].message).toBe(
        '"background-area" takes box or ink and was written without one, so it was ignored: '
        + 'the option keeps the value it would have had without it.');
    });

    it('says a quoted blank was written without a word too', () => {
      // pins the blank test's whitespace arm, which the numeric options share
      // and no other row reaches; dropping it survived a 2026-10 hand-mutant run
      expect(build('[background-area=" "]B313').warnings[0].message).toBe(
        '"background-area" takes box or ink and was written without one, so it was ignored: '
        + 'the option keeps the value it would have had without it.');
    });

    it('refuses a number from a composition object the same way', () => {
      const builder = build({
        groups: [{ glyphs: [{ options: { backgroundArea: 1 }, parts: [{ codeName: 'B313' }] }] }],
      });

      expect(codesAndSources(builder)).toEqual([['INVALID_OPTION_VALUE', 'background-area=1']]);
      expect(builder.toString()).toBe('[background-area=1]B313');
    });

    it('draws the background exactly as with the option left out', () => {
      expect(build('[background-area=foo;background=yellow]B313').svgCode)
        .toBe(build('[background=yellow]B313').svgCode);
    });
  });

  describe('when an area option meets nothing painted or linked', () => {
    it.each(['[link-area=ink]B313', '[background-area=ink]B313', '[background-area=ink;link-area=ink]||B313'])(
      'draws %s exactly as B313, silently', (input) => {
        const builder = build(input);

        expect(builder.svgCode).toBe(build('B313').svgCode);
        expect(builder.warnings).toEqual([]);
      });
  });

  describe('when a space carries one of the options', () => {
    it.each([
      ['B313/[background=red]TSP/B291', '[background=red]', 'B313//B291'],
      ['[background=yellow]|TSP', '[background=yellow]', '//'],
      ['B313/[background-area=ink]TSP/B291', '[background-area=ink]', 'B313//B291'],
      ['B313/[link-area=ink]TSP/B291', '[link-area=ink]', 'B313//B291'],
    ])('reports %s as a space decoration only, and saves it without the option', (input, source, saved) => {
      // a space is not an element that can be painted: the space rule speaks,
      // as it does for color and href, not the global-option rule
      const builder = build(input);

      expect(codesAndSources(builder)).toEqual([['MISPLACED_SPACE_DECORATION', source]]);
      expect(builder.toString()).toBe(saved);
    });
  });

  describe('when a background zone is written below global scope', () => {
    it.each(['[background-top=red]B313', '[background-mid=red]|B313', 'B313;[background-bottom=red]>B81'])(
      'keeps reporting %s as a global option', (input) => {
        expect(build(input).warnings.map((w) => w.code)).toEqual(['MISPLACED_GLOBAL_OPTION']);
      });
  });

  describe('when the same options arrive by different routes', () => {
    it('draws a character\'s background identically from the DSL, a composition object, setOptions and the transient options', () => {
      const dsl = build('[background=yellow;background-area=ink]B313/B291');
      const composition = build({
        groups: [{ glyphs: [
          { options: { background: 'yellow', backgroundArea: 'ink' }, parts: [{ codeName: 'B313' }] },
          { parts: [{ codeName: 'B291' }] },
        ] }],
      });
      const handle = build('B313/B291');
      handle.glyph(0).setOptions({ background: 'yellow', backgroundArea: 'ink' });
      const transient = build('B313/B291');
      transient.glyph(0).setTransientOptions({ background: 'yellow', backgroundArea: 'ink' });

      for (const builder of [dsl, composition, handle, transient]) {
        expect(builder.svgCode).toBe(dsl.svgCode);
        expect(builder.warnings).toEqual([]);
      }
      expect(composition.toString()).toBe(dsl.toString());
      expect(handle.toString()).toBe(dsl.toString());
      expect(transient.toString()).toBe('B313/B291');
    });

    it('draws a word\'s background identically from the DSL and a word handle', () => {
      const handle = build('B313/B291');
      handle.group(0).setOptions({ background: 'yellow' });

      expect(handle.svgCode).toBe(build('[background=yellow]|B313/B291').svgCode);
      expect(handle.warnings).toEqual([]);
      expect(handle.toString()).toBe('[background=yellow]|B313/B291');
    });

    it('draws a part\'s background identically from the DSL and a part handle', () => {
      const handle = build('B313;B81');
      handle.glyph(0).part(1).setOptions({ background: 'yellow' });

      expect(handle.svgCode).toBe(build('B313;[background=yellow]>B81').svgCode);
      expect(handle.warnings).toEqual([]);
      expect(handle.toString()).toBe('B313;[background=yellow]>B81');
    });

    it.each([
      '[background=yellow;background-area=ink]B313/B291',
      '[background=yellow]|B313/B291',
      'B313;[background=yellow]>B81',
    ])('reloads %s from toString() and both toJSON() modes to the same picture', (input) => {
      const builder = build(input);

      expect(build(builder.toString()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON()).svgCode).toBe(builder.svgCode);
      expect(build(builder.toJSON({ preserve: true })).svgCode).toBe(builder.svgCode);
    });
  });
});
