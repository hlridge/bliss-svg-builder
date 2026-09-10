import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import {
  KNOWN_OPTION_KEYS, NUMERIC_OPTION_POLICY, BOOLEAN_OPTION_KEYS, TEXT_OPTION_KEYS,
} from '../src/lib/bliss-constants.js';

/**
 * Pins the string half of the option value gate: a value that cannot be written
 * as text is refused and reported wherever the library would otherwise have
 * stringified it into the shipped document.
 *
 * The numeric half already refused all four of these value kinds and named the
 * option. The string half did not exist, so `{color: null}` shipped
 * `stroke="null"` on a rendered symbol and `{'aria-label': {}}` shipped a
 * wrong accessible name, both in silence. Measured before the fix: 32 of 56
 * name-and-value combinations leaked.
 *
 * The gate sits where the option is DISPATCHED rather than at ingest, because
 * whether a value is legal depends on which option it is: `true` is right for
 * `grid` and wrong for `color`, and refusing at ingest would also sit upstream
 * of the numeric half and replace its twelve well-worded refusals with one
 * generic one.
 *
 * Covers:
 * - The four value kinds nothing can write as text (an object, an array, a
 *   null, an undefined) on a curated text option, on a name nobody curates and
 *   on a `<target>--attribute` key: reported, and the render proceeds without
 *   the option.
 * - A sweep DERIVED from `TEXT_OPTION_KEYS` rather than listed, so a curated
 *   option added later is covered the day it lands.
 * - The values that stay honoured: a string, a number, a boolean and the empty
 *   string that means a transparent background.
 * - The three families the gate passes over, one control each: a numeric option
 *   keeps the numeric half's own refusal byte for byte, a boolean switch stays
 *   silent because absence is how it is turned off, and a kerning value the
 *   parser promoted keeps its own `MALFORMED_KERNING_VALUE` gate.
 * - The two refusal messages, which differ by whether the library curates the
 *   name: a curated option falls back, an uncurated one is simply never
 *   emitted.
 * - The transcription of the families themselves: the four partition the
 *   curated vocabulary exactly, so an option added to it cannot escape all four.
 *
 * Does NOT cover:
 * - The numeric half of the same gate, see
 *   `BlissSVGBuilder.option-value-gate.test.js`.
 * - `#toRaw` dropping the same four value kinds in silence on the JavaScript
 *   channels, which is a separate call and stays blessed by
 *   `BlissSVGBuilder.option-value-gate.test.js` for now.
 * - Which SPELLING of a name is resolved on the way in, see
 *   `BlissSVGBuilder.object-input-options.test.js`.
 */

const build = (composition) => new BlissSVGBuilder(composition);
const codes = (b) => b.warnings.map((w) => w.code);

// A composition object shaped the way `toJSON()` emits one. Object input is the
// only channel that can deliver these values: the DSL can only produce strings,
// and `#toRaw` drops them in front of every other JavaScript entry point.
const atDocument = (options) => ({ options, groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }] });

const unwritten = () => build(atDocument({})).svgCode;

// The four kinds a text value can never be. Shared by every row below so no
// row can drift to a narrower set than the one the gate claims to cover.
const UNWRITABLE = [
  ['an object', { a: 1 }],
  ['an array', [1, 2]],
  ['a null', null],
  ['undefined', undefined],
];

describe('BlissSVGBuilder text option values', () => {
  describe('when a value nothing can write as text reaches a curated text option', () => {
    it.each(UNWRITABLE)('refuses %s written as a color, and draws as if unwritten', (_kind, value) => {
      const b = build(atDocument({ color: value }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).toBe(unwritten());
    });

    it.each(UNWRITABLE)('refuses %s written as a title, and emits no title', (_kind, value) => {
      const b = build(atDocument({ 'svg-title': value }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toMatch(/<title>/);
    });

    it('names the option it refused rather than the value it refused', () => {
      const b = build(atDocument({ background: null }));
      expect(b.warnings[0].source).toBe('background=null');
    });
  });

  describe('when the same value reaches a name the library does not curate', () => {
    it.each([
      ['a data attribute', 'data-note'],
      ['a name a standard owns', 'aria-label'],
      ['a name nobody owns', 'myOwnAttr'],
      ['a layer target', 'root--fill'],
    ])('refuses a null written as %s and emits nothing under it', (_kind, key) => {
      // Byte-identical to the same picture with no option at all, which is the
      // assertion a layer key needs: the root already carries `fill="none"` of
      // its own, so "the name is absent" would pass on a leaked `fill="null"`.
      const b = build(atDocument({ [key]: null }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).toBe(unwritten());
    });

    it('refuses every unwritable kind on a pass-through attribute, not just null', () => {
      for (const [kind, value] of UNWRITABLE) {
        const b = build(atDocument({ myOwnAttr: value }));
        expect(codes(b), kind).toEqual(['INVALID_OPTION_VALUE']);
        expect(b.svgCode, kind).toBe(unwritten());
      }
    });
  });

  describe('when every curated text option is swept', () => {
    // Derived from the vocabulary rather than listed, so an option added to
    // `KNOWN_OPTION_KEYS` later is swept the day it lands. The non-empty
    // assertion is what stops the derivation going vacuous: a filter that
    // wrongly matched nothing would otherwise pass this block in silence.
    it('holds every curated name that is neither a number nor a switch', () => {
      expect(TEXT_OPTION_KEYS.size).toBeGreaterThan(10);
      expect([...TEXT_OPTION_KEYS]).toContain('color');
      expect([...TEXT_OPTION_KEYS]).not.toContain('stroke-width');
      expect([...TEXT_OPTION_KEYS]).not.toContain('grid');
      expect([...TEXT_OPTION_KEYS]).not.toContain('key');
    });

    it.each([...TEXT_OPTION_KEYS])('refuses a null written as %s', (key) => {
      const b = build(atDocument({ [key]: null }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.warnings[0].source).toBe(`${key}=null`);
    });
  });

  describe('when the value is one the option can use', () => {
    it('honours a string, and says nothing', () => {
      const b = build(atDocument({ color: 'red' }));
      expect(b.svgCode).toContain('stroke="red"');
      expect(b.warnings).toEqual([]);
    });

    it('honours a number, which the markup carries as text', () => {
      const b = build(atDocument({ myOwnAttr: 5 }));
      expect(b.svgCode).toContain('myOwnAttr="5"');
      expect(b.warnings).toEqual([]);
    });

    it('honours a boolean, which is what a bare key in a bracket arrives as', () => {
      // pins that the refusal is about the four unwritable kinds and not about
      // "anything that is not a string": `[myOwnAttr]||B291` stores `true`, and
      // refusing booleans here would kill every bare key in the DSL.
      const b = build(atDocument({ myOwnAttr: true }));
      expect(b.svgCode).toContain('myOwnAttr="true"');
      expect(b.warnings).toEqual([]);
    });

    it('honours the empty string that means a transparent background', () => {
      // An empty background is a written value meaning transparent, so it draws
      // what an unwritten one draws and the WARNING is the only thing that can
      // tell the two apart. The null beside it is what makes the row able to
      // fail: a gate that refused blank values would silence one and not the
      // other.
      expect(build(atDocument({ background: '' })).warnings).toEqual([]);
      expect(codes(build(atDocument({ background: null })))).toEqual(['INVALID_OPTION_VALUE']);
    });
  });

  describe('when the name belongs to another half of the gate', () => {
    it('leaves a numeric option to the numeric half, message and all', () => {
      // The whole reason the fix is here rather than at ingest: these twelve
      // refusals are better worded than anything a generic rule produces, so a
      // diff here is a regression rather than an improvement.
      const b = build(atDocument({ 'char-space': [5] }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.warnings[0].message).toBe(
        '"char-space" needs a number and [5] is not one, so it was ignored: '
        + 'the spacing keeps the value it would have had without it.'
      );
    });

    it.each([
      ['false', false], ['a null', null], ['undefined', undefined],
    ])('leaves a switch alone when it is turned off with %s', (_kind, value) => {
      // A switch is read by identity against `true`, so every other value means
      // "off". Refusing them would report on the ordinary way to turn a boolean
      // option off.
      const b = build(atDocument({ grid: value }));
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).not.toContain('class="bliss-grid');
    });

    it('leaves an element key alone, because it is identity rather than markup', () => {
      const b = build(atDocument({ key: undefined }));
      expect(b.warnings).toEqual([]);
    });

    it('leaves a kerning value to its own gate where kerning applies', () => {
      // A kerning option is a NUMBER, and it already has a gate that says so.
      // It is absent from the curated vocabulary only because the parser
      // promotes it rather than dispatching on it, so without an exemption the
      // text gate would claim it and tell the author a number needs text.
      const composition = new BlissSVGBuilder('B99/B291').toJSON();
      composition.groups[0].glyphs[1].options = { relativeKerning: { a: 1 } };
      expect(codes(build(composition))).toEqual(['MALFORMED_KERNING_VALUE']);
    });

    it.each([
      ['the spelling a bracket carries', 'relative-kerning'],
      ['the spelling JavaScript uses', 'absoluteKerning'],
    ])('stays silent on %s at a scope where no kerning gate runs', (_spelling, key) => {
      // The row that can tell the exemption from its absence. At document scope
      // there is nothing for kerning to sit between, so the kerning gate never
      // runs and the key reaches the options pass carrying whatever was written.
      // Both spellings, because ingest resolves the camel one to the kebab one
      // and an exemption written in terms of the promoted spelling alone misses
      // every key that arrived through a composition object.
      //
      // Silence here matches what a VALID value does at the same scope, which
      // is also silent: whether an out-of-scope kerning option should be
      // reported at all is the kerning gate's question, not this gate's.
      const b = build(atDocument({ [key]: { a: 1 } }));
      expect(codes(b)).toEqual([]);
      expect(b.svgCode).toBe(unwritten());
    });
  });

  describe('when the refusal is reported', () => {
    it('says a curated option falls back to what it would have been', () => {
      expect(build(atDocument({ color: null })).warnings[0].message).toBe(
        '"color" needs a text value and null is not one, so it was ignored: '
        + 'the option keeps the value it would have had without it.'
      );
    });

    it('says an uncurated name is simply never emitted', () => {
      // Nothing to fall back TO: an attribute the library does not curate has
      // no value of its own, so the honest thing to say is that it is absent.
      expect(build(atDocument({ myOwnAttr: null })).warnings[0].message).toBe(
        '"myOwnAttr" needs a text value and null is not one, '
        + 'so it was dropped and will not be emitted.'
      );
    });

    it('shows the author what it was given rather than what it coerced to', () => {
      // Same reason the numeric half does it: `[1,2]` reads as a list, where
      // the coerced form reads as the string "1,2" and hides why it was refused.
      expect(build(atDocument({ color: [1, 2] })).warnings[0].message).toContain('[1,2] is not one');
    });

    it('names the undefined it was handed rather than printing nothing', () => {
      expect(build(atDocument({ color: undefined })).warnings[0].message).toContain('undefined is not one');
    });
  });

  describe('when transcribing the families the gate dispatches on', () => {
    it('partitions the curated vocabulary between the four, with nothing left over', () => {
      // The tripwire that keeps the sweep honest: an option added to
      // `KNOWN_OPTION_KEYS` lands in one of these four or this row goes red.
      const families = [
        ...NUMERIC_OPTION_POLICY.keys(), ...BOOLEAN_OPTION_KEYS, ...TEXT_OPTION_KEYS, 'key',
      ];
      expect(new Set(families).size).toBe(families.length);
      expect(families.sort()).toEqual([...KNOWN_OPTION_KEYS].sort());
    });

    it('holds the three switches and nothing else', () => {
      expect([...BOOLEAN_OPTION_KEYS].sort()).toEqual(['center', 'error-placeholder', 'grid']);
    });
  });

  describe('when the same value arrives on a channel that filters first', () => {
    it('still drops it in silence through the options argument', () => {
      // The channel divergence this task deliberately does not converge:
      // `#toRaw` drops all four kinds before any gate exists, so the option is
      // genuinely unwritten there. Whether that stays blessed is its own call.
      const b = new BlissSVGBuilder('B291', { color: null });
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).not.toContain('stroke="null"');
    });

    it('leaves the DSL untouched, which cannot spell these values at all', () => {
      const b = new BlissSVGBuilder('[color=null]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('stroke="null"');
    });
  });
});
