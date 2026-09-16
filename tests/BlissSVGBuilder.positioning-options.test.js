import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the positioning contract for a glyph-level `x` (GH #18, chunk C5).
 *
 * THE MODEL, ratified 2026-08-25. A glyph-level `x` is LEADING BLANK owned by
 * that glyph, not a position for it:
 *
 *   - the glyph starts where the flow puts it, i.e. at the previous glyph's
 *     advance, exactly as it would without the option;
 *   - the glyph's own width grows by `x`;
 *   - its content (ink) begins `x` further in.
 *
 * So `advanceX` keeps meaning "where the next GLYPH starts", which is what the
 * API reference documents it as, and whether a glyph carries internal blank is
 * that glyph's own business.
 *
 * Worked example, `B99/[x=5]B291` (B99 has ink width 2 and advance 4):
 *
 *   B99 advance 4  ->  B291 glyph starts at 4
 *   B291 owns 5 units of leading blank, so its width is 5 + 8 = 13
 *   B291 ink starts at 4 + 5 = 9
 *
 * This REPLACED an incoherent rule that derived the next glyph's position from
 * the previous glyph's INK width (`previous.width + x`, so ink landed at 7 and
 * `x=0` silently deleted the char-space). No text system positions a pen from
 * ink extent; side bearings exist precisely to keep the two independent.
 *
 * `x` is treated differently from `y` on purpose: `x` runs along the writing
 * direction, where the flow already owns the position, so an authored value has
 * to say something the flow does not. `y` has no flow to negotiate with and
 * stays a plain offset.
 *
 * Does NOT cover:
 * - Global (`[x=5]||`) and word (`[x=5]|`) scope, unchanged by this model; see
 *   `BlissSVGBuilder.effective-bounds.test.js`.
 * - Part-level coordinates (`B291:2,3`, `[x=2]>B291`), which position a part
 *   inside its glyph and follow the coordinate-ownership rule; see
 *   `BlissParser.coordinate-options.test.js`.
 * - The axis-presence spelling rule across all ten written coordinate forms,
 *   which decides how many slots a serialized position carries; see
 *   `BlissSVGBuilder.position-presence-serialization.test.js`.
 */

const inkXs = (builder) =>
  [...builder.svgCode.matchAll(/M(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[1]));

const glyphs = (builder) => builder.groups[0].children;

describe('BlissSVGBuilder positioning options', () => {
  describe('when a glyph carries a leading-blank x', () => {
    it('starts the glyph where the flow puts it, not where the ink lands', () => {
      const plain = new BlissSVGBuilder('B99/B291');
      const blanked = new BlissSVGBuilder('B99/[x=5]B291');
      expect(glyphs(plain)[1].x).toBe(4);
      expect(glyphs(blanked)[1].x).toBe(4);
    });

    it('grows the glyph by the blank it owns', () => {
      expect(glyphs(new BlissSVGBuilder('B99/B291'))[1].width).toBe(8);
      expect(glyphs(new BlissSVGBuilder('B99/[x=5]B291'))[1].width).toBe(13);
    });

    it('begins the ink that much further in', () => {
      expect(inkXs(new BlissSVGBuilder('B99/B291'))[2]).toBe(4);
      expect(inkXs(new BlissSVGBuilder('B99/[x=5]B291'))[2]).toBe(9);
    });

    it('keeps advanceX meaning where the next glyph starts', () => {
      // The invariant the API reference documents: `m.x + m.advanceX` is the
      // next sibling's origin. It must hold whatever a glyph carries.
      for (const input of ['B99/B291', 'B99/[x=5]B291', 'B99/[x=0]B291', 'B99/AK:5/B291']) {
        const [first, second] = glyphs(new BlissSVGBuilder(input));
        expect(first.x + first.advanceX).toBe(second.x);
      }
    });

    it('no longer lets x=0 delete the char-space', () => {
      // The old ink-derived rule put `[x=0]` at the previous glyph's ink edge,
      // silently removing the 2-unit char-space.
      expect(glyphs(new BlissSVGBuilder('B99/[x=0]B291'))[1].x)
        .toBe(glyphs(new BlissSVGBuilder('B99/B291'))[1].x);
    });

    it('carries its blank into the advance, so the rest of the line follows', () => {
      const [, second, third] = glyphs(new BlissSVGBuilder('B99/[x=5]B291/B99'));
      expect(second.x).toBe(4);
      expect(second.width).toBe(13);
      expect(third.x).toBe(second.x + second.advanceX);
    });

    it('adds the blank on top of the glyph\'s own normalized layout', () => {
      // A part written left of the glyph origin is normalized back to the
      // origin first, and the blank is added to the result. Adding the blank
      // before that normalization instead would let the overhang eat it: the
      // ink would land at 1 and 5 and the glyph would measure 7, not 11.
      const plain = new BlissSVGBuilder('HL2;HL2:-4');
      const blanked = new BlissSVGBuilder('[x=5]HL2;HL2:-4');
      expect(inkXs(plain)).toEqual([4, 0]);
      expect(inkXs(blanked)).toEqual([9, 5]);
      expect(glyphs(plain)[0].width).toBe(6);
      expect(glyphs(blanked)[0].width).toBe(11);
    });

    it('lets a negative value pull ink left without moving the glyph', () => {
      // The mirror of leading blank, and the same ownership rule: a negative
      // value is a negative side bearing. The ink pokes left of the glyph box,
      // the box itself stays where the flow put it, and the next glyph follows
      // the box rather than the ink. The old rule dragged the whole rest of the
      // word left with it.
      const plain = new BlissSVGBuilder('B99/B291/B99');
      const pulled = new BlissSVGBuilder('B99/[x=-2]B291/B99');
      expect(glyphs(pulled)[1].x).toBe(glyphs(plain)[1].x);
      expect(glyphs(pulled)[1].width).toBe(glyphs(plain)[1].width);
      expect(inkXs(pulled)[2]).toBe(inkXs(plain)[2] - 2);
      expect(glyphs(pulled)[2].x).toBe(glyphs(plain)[2].x);
    });

    it('applies the same rule to the first glyph of a word', () => {
      const b = new BlissSVGBuilder('[x=5]B291');
      expect(glyphs(b)[0].x).toBe(0);
      expect(glyphs(b)[0].width).toBe(13);
      expect(inkXs(b)[0]).toBe(5);
    });
  });

  describe('when a glyph carries leading blank alongside kerning', () => {
    it('keeps them independent: kerning moves the gap, x fills the glyph', () => {
      // AK:5 makes the PREVIOUS glyph's gap 5 (B291 still 8 wide, ink at its
      // own origin); [x=5] gives THIS glyph 5 units of blank. Different owners.
      const kerned = new BlissSVGBuilder('B99/AK:5/B291');
      expect(glyphs(kerned)[1].x).toBe(7);
      expect(glyphs(kerned)[1].width).toBe(8);

      const blanked = new BlissSVGBuilder('B99/[x=5]B291');
      expect(glyphs(blanked)[1].x).toBe(4);
      expect(glyphs(blanked)[1].width).toBe(13);
    });

    it('adds them when both are written', () => {
      const b = new BlissSVGBuilder('B99/AK:5/[x=5]B291');
      expect(glyphs(b)[1].x).toBe(7);
      expect(glyphs(b)[1].width).toBe(13);
      expect(inkXs(b)[2]).toBe(12);
    });
  });

  describe('when a glyph-level y is set', () => {
    it('stays a plain offset, since no flow owns the vertical', () => {
      const plain = new BlissSVGBuilder('B99/B291');
      const shifted = new BlissSVGBuilder('B99/[y=3]B291');
      expect(glyphs(shifted)[1].x).toBe(glyphs(plain)[1].x);
      expect(glyphs(shifted)[1].width).toBe(glyphs(plain)[1].width);
    });
  });

  describe('when an option competes with the positional shorthand it duplicates', () => {
    // Options override the DSL shorthand, and an option passed to the API
    // overrides anything written in the DSL string. The part is where the two
    // spellings meet: `[x=N]>CODE` and `CODE:x,y` both position the part
    // inside its glyph, so they are two spellings of one value and the option
    // is the one that counts. A glyph-level `[x=N]` is NOT in this family: it
    // addresses a different level (the glyph, not the part), so it composes
    // with a part coordinate instead of competing with it.
    it('lets the part option win over the coordinate written on the same part', () => {
      const b = new BlissSVGBuilder('[x=5;y=10]>B291:3,7');
      expect(b.groups[0].children[0].children[0].x).toBe(5);
      expect(b.groups[0].children[0].children[0].y).toBe(10);
    });

    it('reports the coordinate it dropped instead of dropping it in silence', () => {
      const b = new BlissSVGBuilder('[x=5;y=10]>B291:3,7');
      expect(b.warnings).toHaveLength(1);
      expect(b.warnings[0].code).toBe('MULTIPLE_POSITION_VALUES');
      expect(b.warnings[0].source).toBe(':3,7');
    });

    it('says nothing when the two spellings agree', () => {
      const b = new BlissSVGBuilder('[x=3;y=7]>B291:3,7');
      expect(b.warnings).toEqual([]);
      expect(b.groups[0].children[0].children[0].x).toBe(3);
    });

    it('says nothing when only the option is written', () => {
      expect(new BlissSVGBuilder('[x=2]>S8;C8').warnings).toEqual([]);
    });

    it('names only the axis it overrode', () => {
      // `:,7` is the y-only coordinate spelling, so it names the value that
      // lost without claiming the x was written.
      expect(new BlissSVGBuilder('[y=10]>B291:3,7').warnings.map(w => w.source)).toEqual([':,7']);
      expect(new BlissSVGBuilder('[x=5]>B291:3,7').warnings.map(w => w.source)).toEqual([':3']);
    });

    it('names the level it happened at, since object input can reach any of them', () => {
      // The DSL can only raise this on a part, where `CODE:x,y` is the other
      // spelling. Authored object data can carry both channels at any level,
      // and there the coordinate wording would be describing a spelling that
      // does not exist at that level.
      const glyph = new BlissSVGBuilder({ groups: [{ glyphs: [{ x: 3, options: { x: 5 }, parts: [{ codeName: 'B291' }] }] }] });
      expect(glyph.warnings[0].message).toContain('A character takes one position');
      expect(glyph.warnings[0].source).toBe('x=3');

      const word = new BlissSVGBuilder({ groups: [{ x: 3, options: { x: 5 }, glyphs: [{ parts: [{ codeName: 'B291' }] }] }] });
      expect(word.warnings[0].message).toContain('A word takes one position');

      const part = new BlissSVGBuilder('[x=5]>B291:3,7');
      expect(part.warnings[0].message).toContain('A part takes one position');
    });

    it('leaves a glyph option and a part coordinate composing, not competing', () => {
      // Different levels: the glyph carries 2 units of leading blank and the
      // part sits 3 further in, so the ink lands at 5 with nothing reported.
      const b = new BlissSVGBuilder('[x=2]B291:3,0');
      expect(b.warnings).toEqual([]);
      expect(inkXs(b)[0]).toBe(5);
    });
  });

  describe('when a positioned part is serialized', () => {
    // Canonicalize within a level, preserve across levels. At part scope the
    // option and the `:x,y` suffix are the same level, so the output settles on
    // one spelling: the coordinate, which is the one a part written without an
    // option already uses. At glyph scope `[x=N]` is the only spelling there is,
    // so it stays a bracket.
    //
    // The coordinate carries one slot per axis the author actually named, so a
    // one-axis option becomes a one-axis coordinate (`:2`, `:,3`) rather than a
    // pair padded with a zero nobody wrote.
    it.each([
      ['[x=2]>S8;C8', 'S8:2;C8'],
      ['[y=3]>B291', 'B291:,3'],
      ['[color=red;x=2]>B291', '[color=red]>B291:2'],
      ['[x=5;y=10]>B291:3,7', 'B291:5,10'],
      ['[x=5]B291', '[x=5]B291'],
    ])('writes the position once: %s', (input, expected) => {
      expect(new BlissSVGBuilder(input).toString()).toBe(expected);
    });

    it('renders the serialized form identically', () => {
      for (const input of ['[x=2]>S8;C8', '[color=red;x=2]>B291', '[x=5;y=10]>B291:3,7']) {
        const direct = new BlissSVGBuilder(input);
        expect(new BlissSVGBuilder(direct.toString()).svgCode).toBe(direct.svgCode);
      }
    });

    it('stops repeating the value it already reported', () => {
      // The conflict is in the input, not in the output: re-parsing what was
      // serialized must not raise the warning a second time.
      const direct = new BlissSVGBuilder('[x=5;y=10]>B291:3,7');
      expect(direct.warnings.map(w => w.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
      expect(new BlissSVGBuilder(direct.toString()).warnings).toEqual([]);
    });
  });

  describe('when the position arrives as an options object instead of DSL text', () => {
    // GH #18: `x` and `y` are options a LAYOUT reads, not attributes the
    // renderer copies, so they have to be promoted the same way whatever
    // surface sets them. Every one of these was accepted, serialized and
    // round-tripped while changing nothing on screen, with no warning.
    // Each row is asserted against the DSL spelling of the same value, byte
    // for byte, since one library should not have two answers.
    it.each([
      ['glyph setOptions', (b) => b.glyph(1).setOptions({ x: 5 }), 'B99/B291', 'B99/[x=5]B291'],
      ['glyph setOptions with both axes', (b) => b.glyph(1).setOptions({ x: 5, y: 3 }), 'B99/B291', 'B99/[x=5;y=3]B291'],
      ['part setOptions', (b) => b.glyph(0).part(1).setOptions({ x: 2, y: 3 }), 'B291;C8', 'B291;[x=2;y=3]>C8'],
      ['addGlyph opts', (b) => b.group(0).addGlyph('B291', { x: 4 }), 'B291', 'B291/[x=4]B291'],
      ['insertGlyph opts', (b) => b.group(0).insertGlyph(1, 'B291', { x: 4 }), 'B291/B99', 'B291/[x=4]B291/B99'],
      ['addPart opts', (b) => b.glyph(0).addPart('C8', { x: 3, y: 1 }), 'B291', 'B291;[x=3;y=1]>C8'],
      ['insertPart opts', (b) => b.glyph(0).insertPart(1, 'C8', { x: 3 }), 'B291;HL2', 'B291;[x=3]>C8;HL2'],
      ['replaceGlyph opts', (b) => b.group(0).replaceGlyph(1, 'B291', { x: 4 }), 'B291/C8', 'B291/[x=4]B291'],
      ['replacePart opts', (b) => b.glyph(0).replacePart(1, 'C8', { x: 3 }), 'B291;HL2', 'B291;[x=3]>C8'],
    ])('positions through %s exactly as the DSL does', (_label, mutate, start, dsl) => {
      const built = new BlissSVGBuilder(start);
      mutate(built);
      expect(built.svgCode).toBe(new BlissSVGBuilder(dsl).svgCode);
      expect(built.toString()).toBe(new BlissSVGBuilder(dsl).toString());
    });

    it('positions through constructor object input', () => {
      const built = new BlissSVGBuilder({ groups: [{ glyphs: [{ options: { x: 5 }, parts: [{ codeName: 'B291' }] }] }] });
      expect(built.svgCode).toBe(new BlissSVGBuilder('[x=5]B291').svgCode);
    });

    it('applies the same precedence to authored object data', () => {
      // The option beats the value written beside it, and says which value it
      // displaced, exactly as it does for the DSL spelling of the same thing.
      const built = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291', x: 3, options: { x: 5 } }] }] }] });
      expect(built.toString()).toBe('B291:5');
      expect(built.warnings.map(w => w.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
    });

    it('replaces a position it already carries, without inventing a conflict', () => {
      // Setting a position through the API is a command, not a second opinion:
      // it replaces what the element carries. Reading the value promoted by an
      // earlier call as a competing coordinate would report a conflict the
      // caller never wrote, once per change.
      const built = new BlissSVGBuilder('B99/[x=5]B291');
      built.glyph(1).setOptions({ x: 7 });
      expect(built.warnings).toEqual([]);
      expect(built.svgCode).toBe(new BlissSVGBuilder('B99/[x=7]B291').svgCode);
      built.glyph(1).setOptions({ x: 9 });
      expect(built.warnings).toEqual([]);
      expect(built.svgCode).toBe(new BlissSVGBuilder('B99/[x=9]B291').svgCode);
    });

    it('reaches a nested part, where every other option already works', () => {
      const built = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'S8', parts: [{ codeName: 'HL8' }, { codeName: 'VL8', options: { x: 4 } }] },
      ] }] }] });
      const plain = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'S8', parts: [{ codeName: 'HL8' }, { codeName: 'VL8', x: 4 }] },
      ] }] }] });
      expect(built.svgCode).toBe(plain.svgCode);
    });

    it('keeps reporting a conflict after an unrelated mutation', () => {
      // The promotion is idempotent, so the second rebuild finds nothing to
      // resolve; the warning has to survive that or it would vanish the moment
      // anything else on the composition changed.
      const built = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [{ codeName: 'B291', x: 3, options: { x: 5 } }] }] }] });
      built.group(0).addGlyph('B99');
      expect(built.warnings.map(w => w.code)).toEqual(['MULTIPLE_POSITION_VALUES']);
    });
  });

  describe('when a position option is not a number', () => {
    // Warn and drop, and still render: a broken decoration must not destroy
    // valid content, and it must never reach the layout as NaN, which would
    // spread through every width and the viewBox.
    it.each([
      ['[x=abc]B291', 'x=abc'],
      ['[x=abc]||B291', 'x=abc'],
      ['[x=abc]|B291', 'x=abc'],
      ['[x=abc]>B291', 'x=abc'],
      ['[y=]B291', 'y='],
      ['[x]B291', 'x'],
    ])('reports and ignores %s', (input, source) => {
      const b = new BlissSVGBuilder(input);
      expect(b.warnings.map(w => w.code)).toEqual(['MALFORMED_COORDINATES']);
      expect(b.warnings[0].source).toBe(source);
      expect(b.svgCode).not.toContain('NaN');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });

    it('leaves a coordinate written beside it standing', () => {
      const b = new BlissSVGBuilder('[x=abc]>B291:3,7');
      expect(b.warnings.map(w => w.code)).toEqual(['MALFORMED_COORDINATES']);
      expect(b.toString()).toBe('B291:3,7');
    });

    it('reports it once, however many times the composition is rebuilt', () => {
      // A NaN compares unequal to itself, so an unresolved one would look like
      // a fresh conflict on every pass and grow the warnings without end.
      const b = new BlissSVGBuilder('[x=abc]B291');
      const counts = [b.warnings.length];
      for (let i = 0; i < 4; i++) {
        b.group(0).addGlyph('B99');
        counts.push(b.warnings.length);
      }
      expect(counts).toEqual([1, 1, 1, 1, 1]);
    });
  });

  describe('when a part positioned by an option sits behind an indicator', () => {
    it('exempts the indicator exactly as the coordinate spelling does', () => {
      // An indicator that precedes default-positioned content is misplaced and
      // dropped; content at a non-origin position does not convict it. The two
      // spellings of that position must therefore agree, which means the
      // promotion has to run before the indicator rule reads it.
      const option = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'B81' }, { codeName: 'C8', options: { x: 2 } },
      ] }] }] });
      const coordinate = new BlissSVGBuilder({ groups: [{ glyphs: [{ parts: [
        { codeName: 'B81' }, { codeName: 'C8', x: 2 },
      ] }] }] });
      expect(option.toString()).toBe(coordinate.toString());
      expect(option.warnings).toEqual(coordinate.warnings);
      expect(option.svgCode).toBe(coordinate.svgCode);
    });

    it('still lets a space drop one written decoration once', () => {
      // The promotion must stay AFTER the space rule, which strips a space's
      // option and its coordinate separately: promoting first would turn one
      // written decoration into two reports.
      const b = new BlissSVGBuilder('B291/[x=5]TSP/B291');
      expect(b.warnings.map(w => w.code)).toEqual(['MISPLACED_SPACE_DECORATION']);
    });
  });

  describe('when the composition round-trips', () => {
    it.each([
      ['B99/[x=5]B291'],
      ['B99/[x=0]B291'],
      ['[x=5]B291'],
      ['B99/AK:5/[x=5]B291'],
      ['B99/[x=5]B291/B99'],
    ])('renders identically after a toString and a toJSON round-trip: %s', (input) => {
      const direct = new BlissSVGBuilder(input);
      expect(new BlissSVGBuilder(direct.toString()).svgCode).toBe(direct.svgCode);
      expect(new BlissSVGBuilder(direct.toJSON()).svgCode).toBe(direct.svgCode);
    });
  });
});
