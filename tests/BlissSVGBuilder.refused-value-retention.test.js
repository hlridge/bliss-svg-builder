/**
 * Pins what becomes of an option value the library refuses: whether it stays in
 * the composition and survives a save, or is gone once it has been reported.
 *
 * The rule has two arms, and which arm applies is decided by the value's TYPE
 * rather than by which option it was written on:
 * - A value with no text form the author meant (`null`, `undefined`, any
 *   non-primitive) is not recoverable input. It is reported once and does NOT
 *   enter the composition, so neither save format carries it.
 * - A value that IS text but is wrong for the option (`crop=nope`) is
 *   recoverable: the author can read it and fix it. It is reported and KEPT, so
 *   it survives a save and reports again on every reload.
 *
 * This is the discriminator the library already applies to CONTENT (a malformed
 * token drops whole, a well-formed-but-unknown code is kept and re-warns),
 * applied one level down to option values.
 *
 * Covers:
 * - A refused no-text-form value leaving the picture unchanged across a
 *   `toString()` save and reload, at all four scopes.
 * - The same value being absent from both `toString()` and `toJSON()`.
 * - Text the option cannot use staying put, on the bracket and object routes.
 * - All five entry routes agreeing: bracket, composition object, the
 *   constructor's options argument, the mutation setters, a definition's
 *   `defaultOptions`.
 * - A value whose conversion to text THROWS (a non-callable `toString`, no
 *   prototype, a `toString` that throws) being refused rather than crashing
 *   the builder, on every route, and a key the library keeps whatever it holds
 *   still saving without a crash.
 * - Position and kerning following the same rule under their own codes
 *   (`MALFORMED_COORDINATES`, `MALFORMED_KERNING_VALUE`), on the options bag
 *   and on the promoted position field.
 * - The two deliberate exceptions, the switches and `key`, left alone.
 *
 * Does NOT cover:
 * - Which values each half of the gate refuses and the wording of each
 *   refusal, see `BlissSVGBuilder.text-option-values.test.js` (the vocabulary
 *   sweep) and `BlissSVGBuilder.option-value-gate.test.js`.
 * - That a refused value never reaches the rendered markup, see
 *   `BlissSVGBuilder.object-input-options.test.js`.
 * - The coerced form a refusal publishes in `source`, which is its own open
 *   row (`backlog.md`, "a warning `source` publishes the coerced form the
 *   message deliberately avoids") and is deliberately not pinned here.
 * - The kerning gate beyond a value with no text form, see
 *   `BlissParser.kerning.test.js`; the position gate beyond it, see
 *   `BlissSVGBuilder.object-input-position-gate.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

// Built from a real toJSON() rather than written by hand: a glyph literal
// without `parts` serializes to its code but renders as an unknown one, which
// would make every "same picture" row below pass against an empty drawing.
const compositionWith = (options, codeString = 'B291') => {
  const json = new BlissSVGBuilder(codeString).toJSON();
  json.options = options;
  return json;
};

// The same bag placed at each of the four scopes an options bracket can sit at.
const bagAt = (scope, options) => {
  const json = new BlissSVGBuilder('B291').toJSON();
  const glyph = json.groups[0].glyphs[0];
  ({ composition: json, word: json.groups[0], character: glyph, part: glyph.parts[0] })[scope]
    .options = options;
  return json;
};

const reloaded = (builder) => new BlissSVGBuilder(builder.toString());
const codes = (builder) => builder.warnings.map((w) => w.code);

describe('BlissSVGBuilder refused value retention', () => {
  describe('when a composition object carries a value with no text form', () => {
    it.each([
      ['a null', null],
      ['undefined', undefined],
      ['an object', { a: 1 }],
      ['an array', [1, 2]],
    ])('draws the same picture after a save and a reload, given %s', (_kind, value) => {
      const b = new BlissSVGBuilder(compositionWith({ color: value }));
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it.each([
      ['composition', 'composition'],
      ['word', 'word'],
      ['character', 'character'],
      ['part', 'part'],
    ])('draws the same picture after a save and a reload at %s scope', (_scope, scope) => {
      const b = new BlissSVGBuilder(bagAt(scope, { color: null }));
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it('leaves the value out of the text the composition saves as', () => {
      const b = new BlissSVGBuilder(compositionWith({ color: null }));
      expect(b.toString()).toBe('B291');
    });

    it('leaves the value out of the object the composition saves as', () => {
      const b = new BlissSVGBuilder(compositionWith({ color: null }));
      expect(b.toJSON().options ?? {}).toEqual({});
    });

    it('keeps the options written beside it', () => {
      const b = new BlissSVGBuilder(compositionWith({ color: null, 'svg-title': 'kept' }));
      expect(b.toString()).toBe('[svg-title=kept]||B291');
    });

    it('reports it once, naming the option', () => {
      const b = new BlissSVGBuilder(compositionWith({ color: null }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.warnings[0].message).toContain('"color"');
    });

    it('still reports it after the composition has been rebuilt', () => {
      // The value leaves no trace in the rebuilt tree, so a report that is
      // regenerated per rebuild would vanish on the first mutation.
      const b = new BlissSVGBuilder(compositionWith({ color: null }));
      b.addGlyph('B99');
      expect(codes(b)).toContain('INVALID_OPTION_VALUE');
    });
  });

  describe('when a composition object carries a value that would re-read as a legal one', () => {
    // The defect this file exists for: `String([5])` is `5`, so a refused value
    // used to be saved as a legal one and honoured on reload, moving the ink.
    it('does not re-space the drawing after a save and a reload', () => {
      const b = new BlissSVGBuilder(compositionWith({ 'char-space': [5] }, 'B291/B291'));
      expect(b.toString()).toBe('B291/B291');
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it('does not move the viewBox origin after a save and a reload', () => {
      const b = new BlissSVGBuilder(compositionWith({ margin: [3] }));
      expect(b.toString()).toBe('B291');
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });
  });

  describe('when a composition object carries text the option cannot use', () => {
    it('keeps the value, so a reload reports it again', () => {
      const b = new BlissSVGBuilder(compositionWith({ crop: 'nope' }));
      expect(b.toString()).toBe('[crop=nope]||B291');
      expect(codes(reloaded(b))).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('draws the same picture after a save and a reload', () => {
      const b = new BlissSVGBuilder(compositionWith({ crop: 'nope' }));
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });
  });

  describe('when a bracket carries text the option cannot use', () => {
    it('keeps the typo in the saved text and reports it again on reload', () => {
      const b = new BlissSVGBuilder('[crop=nope]||B291');
      expect(b.toString()).toBe('[crop=nope]||B291');
      expect(codes(reloaded(b))).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('leaves a value the option accepts untouched', () => {
      const b = new BlissSVGBuilder('[color=null]||B291');
      expect(codes(b)).toEqual([]);
      expect(b.svgCode).toContain('stroke="null"');
    });
  });

  describe('when the value arrives through the constructor options argument', () => {
    it('reports it rather than dropping it in silence', () => {
      const b = new BlissSVGBuilder('B291', { color: null });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('writes nothing under the option it could not set', () => {
      const b = new BlissSVGBuilder('B291', { color: null });
      expect(b.toString()).toBe('B291');
    });
  });

  describe('when the value arrives through a mutation setter', () => {
    it('reports it rather than dropping it in silence', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ color: null });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('reports it on the transient channel too', () => {
      const b = new BlissSVGBuilder('B291');
      b.setTransientOptions({ color: null });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('leaves the option at the value it already had', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ color: 'red' });
      b.glyph(0).setOptions({ color: null });
      expect(b.toString()).toBe('[color=red]B291');
    });
  });

  describe("when a definition's own defaults carry one", () => {
    it('draws the same picture after a save and a reload', () => {
      // note: a bare alias decomposes to its codeString on the way out unless
      // `toString({ preserve: true })` asks for the name, so a dropped default
      // shows here as the plain code with no bracket in front of it.
      BlissSVGBuilder.define({
        REFUSEDDEFAULT: { codeString: 'B291', defaultOptions: { color: null } },
      });
      const b = new BlissSVGBuilder('REFUSEDDEFAULT');
      expect(b.toString()).toBe('B291');
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it('leaves a default the option can use in place', () => {
      BlissSVGBuilder.define({
        KEPTDEFAULT: { codeString: 'B291', defaultOptions: { color: 'red' } },
      });
      // re-pinned at C23 (D4): an alias's options sit on the part it draws
      expect(new BlissSVGBuilder('KEPTDEFAULT').toString()).toBe('[color=red]>B291');
    });

    it('reports it on the call that carried it, naming the definition', () => {
      const result = BlissSVGBuilder.define({
        REPORTEDDEFAULT: { codeString: 'B291', defaultOptions: { color: null } },
      });
      expect(result.warnings.map((w) => w.code)).toEqual(['INVALID_OPTION_VALUE']);
      expect(result.warnings[0].message).toContain('"REPORTEDDEFAULT"');
    });
  });

  describe('when a value cannot be converted to text at all', () => {
    // regression: refusing the RAW value meant building the refusal's `source`
    // from it, and these three throw on conversion, so the constructor threw
    // where the old channel had dropped them. All three are plain literals.
    const unconvertible = [
      ['a toString that is not a function', () => ({ toString: 5 })],
      ['no prototype at all', () => Object.create(null)],
      ['a toString that throws', () => ({ toString() { throw new Error('boom'); } })],
    ];

    it.each(unconvertible)('refuses %s on a text option rather than throwing', (_kind, make) => {
      const b = new BlissSVGBuilder('B291', { color: make() });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.toString()).toBe('B291');
    });

    it.each(unconvertible)('refuses %s on a numeric option rather than throwing', (_kind, make) => {
      const b = new BlissSVGBuilder('B291/B291', { charSpace: make() });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('refuses one through a mutation setter', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ color: { toString: 5 } });
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
    });

    it('refuses one parsed from JSON in a composition object', () => {
      const b = new BlissSVGBuilder(compositionWith({ color: JSON.parse('{"toString":5}') }));
      expect(codes(b)).toEqual(['INVALID_OPTION_VALUE']);
      expect(b.toString()).toBe('B291');
    });

    it('saves a key refused for its name without throwing', () => {
      // A key whose NAME is refused keeps its value, so the name refusal can
      // fire; the serializer then has to write that value down.
      const b = new BlissSVGBuilder(compositionWith({ onclick: { toString: 5 } }));
      expect(() => b.toString()).not.toThrow();
    });
  });

  describe('when a position or kerning value has no text form', () => {
    it.each([
      ['a null', null],
      ['undefined', undefined],
      ['a list holding a number', [5]],
    ])('refuses %s as a position through a composition object', (_kind, value) => {
      const json = new BlissSVGBuilder('B291/B313').toJSON();
      json.groups[0].glyphs[1].options = { x: value };
      const b = new BlissSVGBuilder(json);
      expect(codes(b)).toEqual(['MALFORMED_COORDINATES']);
      expect(b.toString()).toBe('B291/B313');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291/B313').svgCode);
    });

    it('refuses the same value through a mutation setter', () => {
      const b = new BlissSVGBuilder('B291/B313');
      b.glyph(1).setOptions({ x: null });
      expect(codes(b)).toEqual(['MALFORMED_COORDINATES']);
    });

    it('refuses the same value written as the position field beside an element', () => {
      const json = new BlissSVGBuilder('B291/B313').toJSON();
      json.groups[0].glyphs[1].x = null;
      const b = new BlissSVGBuilder(json);
      expect(codes(b)).toEqual(['MALFORMED_COORDINATES']);
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291/B313').svgCode);
    });

    it('refuses a blank position rather than reading it as a written 0', () => {
      // note: a written 0 is a position (it moves a character to its own
      // origin), so reading blank text as 0 would invent ink nobody asked for.
      const b = new BlissSVGBuilder('[x=" "]B291');
      expect(codes(b)).toEqual(['MALFORMED_COORDINATES']);
    });

    it('refuses a kerning value with no text form', () => {
      const b = new BlissSVGBuilder('B291/B313');
      b.glyph(1).setOptions({ relativeKerning: null });
      expect(codes(b)).toEqual(['MALFORMED_KERNING_VALUE']);
      expect(b.toString()).toBe('B291/B313');
    });
  });

  describe('when a switch or an element key holds a value with no text form', () => {
    // The two deliberate exceptions. A switch is on only when it is exactly
    // `true`, so any other value already means off and reporting one would
    // scold an ordinary way of turning it off. A key names the element and
    // reaches neither the picture nor the saved text.
    it('leaves a switch off and says nothing', () => {
      const b = new BlissSVGBuilder(compositionWith({ grid: null }));
      expect(codes(b)).toEqual([]);
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it('saves a switch holding a value that cannot be converted without throwing', () => {
      const b = new BlissSVGBuilder(compositionWith({ grid: { toString: 5 } }));
      expect(() => b.toString()).not.toThrow();
      expect(reloaded(b).svgCode).toBe(b.svgCode);
    });

    it('keeps an element key out of the saved text', () => {
      const b = new BlissSVGBuilder('B291');
      b.glyph(0).setOptions({ key: null });
      expect(codes(b)).toEqual([]);
      expect(b.toString()).toBe('B291');
    });
  });
});
