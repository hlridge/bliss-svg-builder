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
 * The gate is asked in two places and is one gate. The admission stage asks it
 * at INGEST, so a value it refuses is gone before it can be stored and cannot
 * be saved into the composition. The options pass asks it again where the
 * option is DISPATCHED, as the backstop for the one kind of bag that never
 * passes ingest: the built-in definitions' own defaults. Both ask the same
 * judge, which is what keeps the answer specific to the option the value landed
 * on, and what keeps the numeric half's twelve well-worded refusals rather than
 * replacing them with one generic one.
 *
 * Covers:
 * - The four value kinds nothing can write as text (an object, an array, a
 *   null, an undefined) on a curated text option, on a name nobody curates and
 *   on a `<target>--attribute` key: reported, and the render proceeds without
 *   the option.
 * - The two further kinds only a JavaScript channel can deliver, a function and
 *   a symbol, which used to reach the document as their own source text.
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
 * - What becomes of a refused value once it has been reported, and whether it
 *   survives a save, see `BlissSVGBuilder.refused-value-retention.test.js`.
 * - Which SPELLING of a name is resolved on the way in, see
 *   `BlissSVGBuilder.object-input-options.test.js`.
 */

const build = (composition) => new BlissSVGBuilder(composition);
const codes = (b) => b.warnings.map((w) => w.code);

// A composition object shaped the way `toJSON()` emits one. The DSL can only
// produce strings, so object input and the JavaScript channels are the two that
// can deliver these values at all; the rows at the end of this file are what
// says the two now answer alike.
const atDocument = (options) => ({ options, groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }] });
const atCharacter = (options) => ({ groups: [{ glyphs: [{ codeName: 'B291', options, parts: [{ codeName: 'B291' }] }] }] });

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

  describe('when the bag sits below the whole document', () => {
    it('gates a character bag too, not only the global one', () => {
      // Every other row here writes at document scope, where the options pass
      // takes a second argument it does not take below. A gate wired to that
      // argument would leave every inner bag ungated with the suite green.
      const b = build(atCharacter({ color: null }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toContain('stroke="null"');
    });
  });

  describe('when more than one value in a bag is refused', () => {
    it('reports every one of them, in the order they were written', () => {
      // A sweep that stopped at the first refusal would report one and let the
      // rest through to the markup, with every single-value row still green.
      const b = build(atDocument({ color: null, myOwnAttr: [1, 2], 'svg-title': { a: 1 } }));
      expect(b.warnings.map((w) => w.source)).toEqual([
        'color=null', 'myOwnAttr=1,2', 'svg-title=[object Object]',
      ]);
      expect(b.svgCode).toBe(unwritten());
    });
  });

  describe('when a key is wrong in its name as well as its value', () => {
    it.each([
      ['a layer target that does not exist', 'nosuch--fill', 'UNKNOWN_LAYER'],
      ['a layer key with no attribute after it', 'root--', 'UNKNOWN_LAYER'],
      ['a name the library stamps itself', 'data-generator', 'RESERVED_ATTRIBUTE_NAME'],
      ['a name that declares what the file is', 'xmlns', 'RESERVED_ATTRIBUTE_NAME'],
      ['an event handler', 'onclick', 'UNSAFE_ATTRIBUTE_NAME'],
      ['a whole option spelled as one word', 'autoVertical', 'MISPLACED_OPTION_SPELLING'],
    ])('keeps the report about the name for %s', (_kind, key, expected) => {
      // The name is the report worth having. Told only that `null` is not a text
      // value, an author fixes the value and `nosuch--fill` is just as dead,
      // where the name refusal hands them the targets that exist. So the value
      // gate passes over a name another gate has already refused, rather than
      // displacing it or reporting beside it.
      //
      // The control is the same key carrying a usable value: both must report
      // the same thing, or the value decided which defect the author heard about.
      const scope = key === 'xmlns' ? atCharacter : atDocument;
      expect(codes(build(scope({ [key]: null })))).toEqual([expected]);
      expect(codes(build(scope({ [key]: 'x' })))).toEqual([expected]);
    });
  });

  describe('when a value refers back to itself', () => {
    it('reports it rather than throwing out of the constructor', () => {
      // An ordinary parent/child config with a back-pointer, not a contrived
      // self-reference. The refusal message is built by serializing the value,
      // and an unguarded serializer throws here, which reaches the caller as no
      // picture and no diagnosis instead of a refusal they can act on.
      const parent = { id: 'theme' };
      const child = { name: 'accent', parent };
      parent.children = [child];
      const b = build(atDocument({ 'aria-label': child }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).toBe(unwritten());
    });

    it('refuses it on a numeric option too, which has the same message to build', () => {
      const b = build(atDocument({ margin: (() => { const o = {}; o.self = o; return o; })() }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
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
      // A control on the kerning gate rather than on the exemption: this row
      // stays green with the exemption removed, because the kerning resolver
      // deletes the written key before the options pass runs. The row below is
      // the one that can tell the exemption from its absence.
      const composition = new BlissSVGBuilder('B99/B291').toJSON();
      composition.groups[0].glyphs[1].options = { relativeKerning: { a: 1 } };
      expect(codes(build(composition))).toEqual(['MALFORMED_KERNING_VALUE']);
    });

    it.each([
      ['a list holding a number', [5]],
      ['an absent coordinate, which is what {x: record.x} yields', undefined],
      ['a null', null],
    ])('refuses a coordinate written as %s under the position code, once', (_kind, value) => {
      // `x` and `y` are uncurated names whose values never become attribute
      // text: an emitter reads them as geometry, and MALFORMED_COORDINATES is
      // their code. The claim this row keeps is that a text refusal never lands
      // on one: this gate once reported `{x: [5]}` as needing a text value while
      // the position gate honoured it, so the character moved AND was reported
      // as not moved. The value is now refused once, in the position's own
      // words, and the character stays where an unwritten one would.
      const b = build(atCharacter({ x: value }));
      expect(codes(b)).toEqual(['MALFORMED_COORDINATES']);
      expect(b.svgCode).toBe(build(atCharacter({})).svgCode);
    });

    it.each([
      ['the spelling a bracket carries', 'relative-kerning'],
      ['the spelling JavaScript uses', 'absoluteKerning'],
    ])('refuses a value with no text form in %s, at a scope no kerning gate reads', (_spelling, key) => {
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
      //
      // A value with no text form is refused on the way in wherever it is
      // written, so it is reported here too, in the kerning gate's own words.
      // The claim this row must keep is that whatever is reported is NOT
      // `INVALID_OPTION_VALUE`. (Whether an out-of-scope kerning option with a
      // usable value should be reported is still the kerning gate's question,
      // filed in `backlog.md` beside the target-prefixed-key row.)
      const b = build(atDocument({ [key]: { a: 1 } }));
      expect(codes(b)).toEqual(['MALFORMED_KERNING_VALUE']);
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

  describe('when the same value arrives on a channel that converts it to text', () => {
    it('refuses it through the options argument, as object input does', () => {
      // The channel divergence the admission stage closed: this route dropped
      // all four kinds before any gate existed, so one value was silent here
      // and reported through a composition object, and a composition saved
      // from one and reloaded through the other changed what it meant.
      const b = new BlissSVGBuilder('B291', { color: null });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toContain('stroke="null"');
    });

    it('refuses the two kinds only this channel can deliver', () => {
      // Neither reaches object input, which clones what it is given, and the
      // DSL cannot spell either. Both used to be converted with everything
      // else, so the source text of a function was painted onto the symbol.
      const b = new BlissSVGBuilder('B291', { color: () => 1, background: Symbol('x') });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE', 'INVALID_OPTION_VALUE']);
      expect(b.svgCode).not.toContain('=&gt;');
      expect(b.svgCode).not.toContain('Symbol');
    });

    it('refuses a symbol on a numeric option without throwing on the way', () => {
      // A template literal converting a symbol throws, and the refusal builds
      // its `source` from the value it refused; unguarded, that throw escapes
      // the constructor and the caller gets no picture and no diagnosis.
      const b = new BlissSVGBuilder('B291/B291', { charSpace: Symbol('x') });
      expect(b.warnings[0].source).toBe('char-space=Symbol(x)');
    });

    it('leaves the DSL untouched, which cannot spell these values at all', () => {
      const b = new BlissSVGBuilder('[color=null]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('stroke="null"');
    });
  });
});
