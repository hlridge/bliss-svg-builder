/**
 * Pins how a composition object's references are read, as JSON reads them: one
 * object met twice is two copies, as `JSON.stringify` writes it twice, and one
 * inside itself, which JSON cannot write, is left out.
 *
 * Covers:
 * - A word, a space, a character and a part used twice, read as the object's
 *   JSON copy reads: a key of its own in each place, so no `DUPLICATE_KEY`; a
 *   key written on the shared object reported as written twice.
 * - An edit through one place's handle landing there only, a shared options bag
 *   included.
 * - An element that a field of your own holds too, read as an element whether
 *   the field comes before the words or after them.
 * - An element inside itself, as a word, a character, a part and a part's own
 *   part: left out and reported with `MALFORMED_ELEMENT` where it is met again,
 *   a part taking its character, as for any wrong shape.
 * - A field of your own inside itself, or linking back to an element it sits
 *   on: the reference closing the circle left out in silence (gone from an
 *   object, `null` in a list), so the save is valid JSON; an object or a list
 *   held twice there saved as two copies.
 *
 * Does NOT cover:
 * - Every other wrong shape, see `BlissSVGBuilder.composition-object-shape.test.js`.
 * - Functions, symbols, bigints, dates and maps in the object, see
 *   `BlissSVGBuilder.composition-object-copy.test.js`.
 * - The same key written on two different elements, see
 *   `BlissSVGBuilder.element-key-values.test.js`.
 */
import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

const fn = () => 1;
const part = (codeName, extra) => ({ codeName, ...extra });
const character = (...codes) => ({ parts: codes.map((code) => part(code)) });
const word = (...characters) => ({ glyphs: characters });
const space = () => word(character('TSP'));
const b313 = () => word(character('B313'));

const reports = (builder) => builder.warnings.map((w) => [w.code, w.source]);

// The object as `JSON.stringify` writes it, read back.
const jsonCopy = (input) => new BlissSVGBuilder(JSON.parse(JSON.stringify(input)));

const wordTwice = () => {
  const shared = b313();
  return { groups: [shared, space(), shared] };
};

describe('BlissSVGBuilder composition object references', () => {
  describe('when one object fills two places', () => {
    it.each([
      ['a word', wordTwice, (b) => [b.group(0).key, b.group(1).key]],
      ['a space', () => {
        const shared = space();
        return { groups: [b313(), shared, word(character('B431')), shared, b313()] };
      }, (b) => [b.element(1).key, b.element(3).key]],
      ['a character', () => {
        const shared = character('B313');
        return { groups: [word(shared, shared)] };
      }, (b) => [b.glyph(0).key, b.glyph(1).key]],
      ['a part', () => {
        const shared = part('H');
        return { groups: [word({ parts: [shared, shared] })] };
      }, (b) => [b.part(0).key, b.part(1).key]],
    ])('reads %s used twice as its JSON copy reads, a key of its own in each place', (_label, input, keysOf) => {
      // regression: both places were one element under one key, warning
      // DUPLICATE_KEY on keys the library generated
      const builder = new BlissSVGBuilder(input());
      const expected = jsonCopy(input());
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
      expect(new Set(keysOf(builder)).size).toBe(2);
    });

    it('reports a key written on a word used twice as written twice, as its JSON copy does', () => {
      const shared = { key: 'mine', ...b313() };
      const input = { groups: [shared, space(), shared] };
      const builder = new BlissSVGBuilder(input);
      expect(reports(builder)).toEqual([['DUPLICATE_KEY', 'mine']]);
      expect(builder.warnings).toEqual(jsonCopy(input).warnings);
    });

    it.each([
      ['setOptions on the second word', wordTwice, (b) => b.group(1).setOptions({ color: 'blue' }), 'B313//[color=blue]|B313'],
      ['addGlyph on the second word', wordTwice, (b) => b.group(1).addGlyph('B291'), 'B313//B313/B291'],
      ['setOptions on the first character', () => {
        const shared = character('B313');
        return { groups: [word(shared, shared)] };
      }, (b) => b.glyph(0).setOptions({ color: 'blue' }), '[color=blue]B313/B313'],
      ['setOptions on a word sharing its options bag', () => {
        const options = { color: 'red' };
        return { groups: [{ options, ...b313() }, space(), { options, ...word(character('B431')) }] };
      }, (b) => b.group(0).setOptions({ color: 'blue' }), '[color=blue]|B313//[color=red]|B431'],
    ])('lands %s in that place only', (_edit, input, edit, expected) => {
      // regression: an edit through either handle landed in both places
      const builder = new BlissSVGBuilder(input());
      edit(builder);
      expect(builder.toString()).toBe(expected);
    });
  });

  describe('when a field of your own holds an element too', () => {
    it.each([
      ['before the words', (shared) => ({ meta: shared, groups: [shared] })],
      ['after the words', (shared) => ({ groups: [shared], meta: shared })],
    ])('reads the element as an element with the field %s', (_order, input) => {
      // regression: met first in the field, the word was read as data, so the
      // function in its character's options went unreported
      const shared = word({ parts: [part('B313')], options: { color: fn } });
      const builder = new BlissSVGBuilder(input(shared));
      expect(reports(builder)).toEqual([['INVALID_OPTION_VALUE', 'color=() => 1']]);
      expect(builder.toJSON().meta).toEqual({ glyphs: [{ parts: [{ codeName: 'B313' }], options: {} }] });
    });
  });

  describe('when an element is inside itself', () => {
    it.each([
      ['the composition as its own word', () => {
        const composition = { groups: [] };
        composition.groups.push(composition, b313());
        return composition;
      }, 'groups[0]'],
      ['a word as its own character', () => {
        const looped = b313();
        looped.glyphs.push(looped);
        return { groups: [looped] };
      }, 'groups[0].glyphs[1]'],
      ['a character as its own part', () => {
        const looped = character('H');
        looped.parts.push(looped);
        return { groups: [word(character('B313'), looped)] };
      }, 'groups[0].glyphs[1].parts[1]'],
      ['a part as its own part', () => {
        const looped = part('H', { parts: [] });
        looped.parts.push(looped);
        return { groups: [word(character('B313'), { parts: [looped] })] };
      }, 'groups[0].glyphs[1].parts[0].parts[0]'],
    ])('leaves out %s, reporting it where it is met again', (_label, input, source) => {
      // regression: the constructor overflowed the stack (RangeError), or read
      // one object at two levels under one key
      const builder = new BlissSVGBuilder(input());
      const expected = new BlissSVGBuilder({ groups: [b313()] });
      expect(reports(builder)).toEqual([['MALFORMED_ELEMENT', source]]);
      expect(builder.toJSON()).toEqual(expected.toJSON());
      expect(builder.svgCode).toBe(expected.svgCode);
    });

    it.each([
      ['a word', () => {
        const composition = { groups: [] };
        composition.groups.push(composition);
        return composition;
      }, 'groups[0] is inside itself (a circular reference), so it is left out.'],
      ['a part', () => {
        const looped = character('H');
        looped.parts.push(looped);
        return { groups: [word(looped)] };
      }, 'groups[0].glyphs[0].parts[1] is inside itself (a circular reference), so its character is left out.'],
    ])('names the circle and what is left out when %s is inside itself', (_level, input, message) => {
      expect(new BlissSVGBuilder(input()).warnings.map((w) => w.message)).toEqual([message]);
    });
  });

  describe('when a field of your own is inside itself', () => {
    it('leaves the reference closing the circle out of an object, in silence', () => {
      // regression: kept as structuredClone kept it, so the save held the
      // circle and JSON.stringify(builder.toJSON()) threw
      const meta = { name: 'board' };
      meta.self = meta;
      const builder = new BlissSVGBuilder({ groups: [word(character('B291'))], meta });
      const { meta: saved } = builder.toJSON();
      expect(builder.warnings).toEqual([]);
      expect(saved).toEqual({ name: 'board' });
      expect(saved).not.toBe(meta);
      expect(() => JSON.stringify(builder.toJSON())).not.toThrow();
    });

    it('reads the reference closing the circle as null in a list', () => {
      const notes = ['a'];
      notes.push(notes);
      const builder = new BlissSVGBuilder({ groups: [b313()], notes });
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON().notes).toEqual(['a', null]);
    });

    it('leaves out a link back to an element the field sits on', () => {
      const linked = character('B313');
      const holder = word(linked);
      linked.ownerWord = holder;
      const builder = new BlissSVGBuilder({ groups: [holder] });
      expect(builder.warnings).toEqual([]);
      expect(builder.toJSON().groups[0].glyphs[0]).not.toHaveProperty('ownerWord');
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B313').svgCode);
      expect(() => JSON.stringify(builder.toJSON())).not.toThrow();
    });
  });

  describe('when a field of your own holds one object twice', () => {
    it.each([
      ['an object', () => ({ x: 1 })],
      ['a list', () => [1]],
    ])('saves %s held twice as two copies, as JSON writes it twice', (_kind, make) => {
      const shared = make();
      const { meta } = new BlissSVGBuilder({ groups: [b313()], meta: { from: shared, to: shared } }).toJSON();
      expect(meta).toEqual({ from: make(), to: make() });
      expect(meta.from).not.toBe(meta.to);
    });
  });
});
