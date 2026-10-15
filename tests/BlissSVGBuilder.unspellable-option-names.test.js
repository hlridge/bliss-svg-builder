import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins that a refused option name the text form cannot write back is reported
 * and kept out of the composition, so a save never reads it back as another
 * name.
 *
 * Covers:
 * - A name holding `=`, `;`, `]`, a quote, or a leading or trailing space, at
 *   global and character scope in a composition object: reported once, not
 *   stored, absent from both saves, reloaded the same.
 * - A target-prefixed such name, reported for its target.
 * - The same names through `setOptions()` and the builder's options.
 * - A padded name in a definition's `defaultOptions`, which `define()` and
 *   `patchDefinition()` judge trimmed and so hand on to the same refusal.
 * - A bracket that spells a quote into a key.
 * - Refused names a save can write back, `[` among them, which stay kept and
 *   re-warn.
 * - Every printable character, inside a name and at either end: no name the
 *   stage keeps reads back as another.
 * - The transient channel, which never saves and so judges such a name as it
 *   always has.
 *
 * Does NOT cover:
 * - Names a bracket can spell, read whole and kept, see
 *   `BlissParser.bracket-key-grammar.test.js`.
 * - The transient channel's other refusals, see
 *   `BlissSVGBuilder.transient-refusal-values.test.js`.
 * - A sentence in the docs: the fix is peripheral and silent, so the docs
 *   have none to pin.
 */

// Each warning as `${code} ${source}`, so a row fails on either.
const reported = ({ warnings }) => warnings.map(w => `${w.code} ${w.source}`);

const withGlobalOption = (key, value) => ({ ...new BlissSVGBuilder('B291').toJSON(), options: { [key]: value } });

const withCharacterOption = (key, value) => {
  const composition = new BlissSVGBuilder('B291').toJSON();
  composition.groups[0].glyphs[0].options = { [key]: value };
  return composition;
};

const UNSPELLABLE = [' color', 'stroke ', 'a=b', 'a;b', 'a]b', 'a"b', "a'b"];

// Printable ASCII, the whitespace a reader trims, and one letter outside ASCII.
const EVERY_CHARACTER = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)),
  '\t', '\n', '\r', ' ', ' ', '﻿', 'ï',
];

describe('BlissSVGBuilder unspellable option names', () => {
  describe('when a composition object holds such a name', () => {
    it.each(UNSPELLABLE)('reports %j at global scope and keeps it out of the saves', (key) => {
      const builder = new BlissSVGBuilder(withGlobalOption(key, 'red'));

      expect(reported(builder)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(builder.toString()).toBe('B291');
      expect(Object.keys(builder.toJSON().options ?? {})).not.toContain(key);

      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });

    it.each(UNSPELLABLE)('reports %j at character scope and keeps it out of the saves', (key) => {
      const builder = new BlissSVGBuilder(withCharacterOption(key, 'red'));

      expect(reported(builder)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(builder.toString()).toBe('B291');
      expect(Object.keys(builder.toJSON().groups[0].glyphs[0].options ?? {})).not.toContain(key);

      const reloaded = new BlissSVGBuilder(builder.toString());
      expect(reloaded.warnings).toEqual([]);
      expect(reloaded.svgCode).toBe(builder.svgCode);
    });

    it('no longer reloads " color" as a working color', () => {
      // regression: it was saved as `[ color=red]||B291`, and the reader trims
      // a key's ends, so the reload drew red with nothing reported
      const saved = new BlissSVGBuilder(withGlobalOption(' color', 'red')).toString();

      expect(new BlissSVGBuilder(saved).svgCode).not.toContain('stroke="red"');
    });

    it('reports a target-prefixed such name for its target and keeps it out of the save', () => {
      const builder = new BlissSVGBuilder(withGlobalOption(' content--fill', 'red'));

      expect(reported(builder)).toEqual(['UNKNOWN_LAYER  content--fill']);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when setOptions or the builder options hand over such a name', () => {
    it('reports a name given to a group once and does not store it', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.group(0).setOptions({ 'a=b': '1' });

      expect(reported(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME a=b']);
      expect(builder.toString()).toBe('B291');
    });

    it('reports a name given to a glyph once and does not store it', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setOptions({ ' color': 'red' });

      expect(reported(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME  color']);
      expect(builder.toString()).toBe('B291');
    });

    it('reports a name in the builder options once and does not store it', () => {
      const builder = new BlissSVGBuilder('B291', { 'a;b': '1' });

      expect(reported(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME a;b']);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when a definition\'s defaultOptions hold a padded name', () => {
    const customCodes = [];
    afterEach(() => {
      for (const code of customCodes) {
        try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
      }
      customCodes.length = 0;
    });

    // Defines one code and remembers it for cleanup, returning define()'s result.
    const defineTracked = (name, definition) => {
      customCodes.push(name);
      return BlissSVGBuilder.define({ [name]: definition });
    };

    it.each([' color', 'color '])('defines the code, reports %j once and leaves it out of every use', (key) => {
      const result = defineTracked('C15_PADDED', { codeString: 'B291', defaultOptions: { [key]: 'red' } });

      expect(result.defined).toEqual(['C15_PADDED']);
      expect(reported(result)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);

      const use = new BlissSVGBuilder('C15_PADDED');
      expect(use.warnings).toEqual([]);
      expect(use.toString()).toBe('B291');
      expect(new BlissSVGBuilder(use.toString()).svgCode).toBe(use.svgCode);
    });

    it('reports one given to patchDefinition once and leaves it out of every use', () => {
      defineTracked('C15_PADDED', { codeString: 'B291' });
      const result = BlissSVGBuilder.patchDefinition('C15_PADDED', { defaultOptions: { ' color': 'red' } });

      expect(reported(result)).toEqual(['UNSAFE_ATTRIBUTE_NAME  color']);
      expect(new BlissSVGBuilder('C15_PADDED').toString()).toBe('B291');
    });
  });

  describe('when a bracket spells a quote into a key', () => {
    it.each(['a"b', "a'b"])('reports [%s=1] as one name and does not store it', (key) => {
      const builder = new BlissSVGBuilder(`[${key}=1]||B291`);

      expect(reported(builder)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(builder.toString()).toBe('B291');
    });
  });

  describe('when the refused name can be written back', () => {
    // pins the refused set's edge: a bracket reads `[` back as part of the name
    it.each(['xlink:href', 'a b', 'färg', 'a[b', ''])('keeps %j, saves it and reports it again on reload', (key) => {
      const builder = new BlissSVGBuilder(withGlobalOption(key, '1'));

      expect(reported(builder)).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
      expect(builder.toString()).toBe(`[${key}=1]||B291`);
      expect(reported(new BlissSVGBuilder(builder.toString()))).toEqual([`UNSAFE_ATTRIBUTE_NAME ${key}`]);
    });
  });

  describe('when any one character sits in a name', () => {
    // pins the refused set against the bracket grammar rather than a list: a
    // kept name must read back as itself beside a neighbour whose saved value
    // is quoted and holds the other quote, which a stray quote would pair with
    it('keeps no name that its save reads back as another', () => {
      const misread = [];
      for (const c of EVERY_CHARACTER) {
        for (const key of [`a${c}b`, `${c}ab`, `ab${c}`]) {
          const options = { [key]: '1', 'data-z': "it's;x" };
          const builder = new BlissSVGBuilder({ ...new BlissSVGBuilder('B291').toJSON(), options });
          const reloaded = new BlissSVGBuilder(builder.toString());
          if (reloaded.toString() !== builder.toString() || reloaded.svgCode !== builder.svgCode) misread.push(key);
        }
      }

      expect(misread).toEqual([]);
    });
  });

  describe('when the transient channel hands over such a name', () => {
    // note: the channel never saves, so a name it cannot write back is judged
    // as it always was: a bare one by the channel's own sweep, a prefixed one
    // on every render while it stays set
    it('reports a bare one once and draws without it', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ ' color': 'red' });

      expect(reported(builder)).toEqual(['UNSAFE_ATTRIBUTE_NAME  color']);
      expect(builder.svgCode).toBe(new BlissSVGBuilder('B291').svgCode);
    });

    it('keeps a target-prefixed one set, reported once however often it is set, until it is removed', () => {
      // pins the channel's exemption: refused on the way in, the name would be
      // reported once per call and stay reported after it is removed
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ ' content--fill': 'red' });
      builder.setTransientOptions({ ' content--fill': 'red' });

      expect(reported(builder)).toEqual(['UNKNOWN_LAYER  content--fill']);

      builder.removeTransientOptions(' content--fill');
      expect(builder.warnings).toEqual([]);
    });
  });
});
