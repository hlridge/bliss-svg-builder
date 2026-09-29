import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins that `define()` and `patchDefinition()` refuse a code string the DSL
 * cannot read, judged by reading a use of the definition with the parser, and
 * that `patchDefinition()` refuses to give a shape two ways of being drawn.
 *
 * Covers:
 * - A coordinate the DSL cannot read (MALFORMED_COORDINATES) and a kerning
 *   value it cannot read (MALFORMED_KERNING_VALUE), on every code-string type,
 *   at any depth the reader reaches (a character bracket included).
 * - A kerning marker standing where a part must be (`C8;RK:3`), which the
 *   reader takes for a part named RK that no definition may ever supply.
 * - A glyph or shape that reads as no character at all (a lone marker, a
 *   lone `;`), while a bare alias of a lone marker stays a working named
 *   marker.
 * - What stays accepted: readable coordinates, an unknown code (a forward
 *   reference), a misplaced option (reported where the code is used), and a
 *   name the DSL cannot spell, since the check reads through a stand-in.
 * - The registry after a refusal, the other definitions in the same call, an
 *   existing name, and the exact wording of each refusal.
 * - patchDefinition(): the same refusals, the definition left unchanged, and a
 *   shape that would hold both a getPath function and a codeString.
 *
 * Does NOT cover:
 * - The other code-string guards (`/`, `;;`, cycles, references, indicator
 *   baking), see `BlissSVGBuilder.define-hardening.test.js` and
 *   `BlissSVGBuilder.define-codestring-content.test.js`.
 * - How a composition built before its definition saves, see
 *   `BlissSVGBuilder.codestring-decomposition.test.js`.
 * - A character bracket in a code string carrying a position, kerning or
 *   `key` to every use: readable, so not refused here; an open backlog row.
 * - `define()` given both getPath and a codeString keeping only the function:
 *   unchanged, see `BlissSVGBuilder.define-hardening.test.js`.
 */
describe('BlissSVGBuilder define readable code string', () => {

  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch { /* not defined */ }
    }
    customCodes.length = 0;
  });

  const definitionOf = (type, codeString) => (type === 'bare' ? { codeString } : { type, codeString });

  // Defines one code and remembers it for cleanup, returning define()'s result.
  const defineTracked = (name, definition, options) => {
    customCodes.push(name);
    return BlissSVGBuilder.define({ [name]: definition }, options);
  };

  const line = { type: 'shape', getPath: () => 'M0,0 L4,0', width: 4, height: 0 };

  describe('when a code string holds a coordinate the DSL cannot read', () => {
    it.each([
      ['shape', 'C8:.'],
      ['shape', 'C8:-.'],
      ['shape', 'C8:1.2.3'],
      ['shape', 'C8:1e3'],
      ['shape', 'C8: 1'],
      ['shape', '[color=red]>C8:.'],
      ['glyph', 'B291;C8:.'],
      ['glyph', '[color=red]B291:.'],
      ['bare', 'C8:.'],
      ['bare', 'B291;C8:1.2.3'],
    ])('refuses a %s whose codeString is %s', (type, codeString) => {
      const result = defineTracked('UNREADABLE', definitionOf(type, codeString));
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('(MALFORMED_COORDINATES)');
      expect(BlissSVGBuilder.isDefined('UNREADABLE')).toBe(false);
    });

    it('says which code string, what the DSL reports and how to write a position', () => {
      const result = defineTracked('UNREADABLE', { type: 'glyph', codeString: 'B291;C8:.' });
      expect(result.errors).toEqual([
        '"UNREADABLE": define("UNREADABLE"): the codeString "B291;C8:." cannot be read (MALFORMED_COORDINATES), so every use of "UNREADABLE" would warn and drop it. Write a position as :x,y with plain numbers, e.g. C8:1,2.',
      ]);
    });
  });

  describe('when a code string holds a kerning value the DSL cannot read', () => {
    it.each([
      ['shape', 'RK:x'],
      ['glyph', 'RK:3;C8'],
      ['bare', 'B291/RK:x/B313'],
    ])('refuses a %s whose codeString is %s', (type, codeString) => {
      const result = defineTracked('UNREADABLE', definitionOf(type, codeString));
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('(MALFORMED_KERNING_VALUE)');
    });

    it('says how to write a kerning marker', () => {
      const result = defineTracked('UNREADABLE', { codeString: 'B291/RK:x/B313' });
      expect(result.errors).toEqual([
        '"UNREADABLE": define("UNREADABLE"): the codeString "B291/RK:x/B313" cannot be read (MALFORMED_KERNING_VALUE), so every use of "UNREADABLE" would warn and drop it. A kerning marker is RK:n or AK:n with a plain number, written before the character it spaces, e.g. RK:2/UNREADABLE.',
      ]);
    });
  });

  describe('when a kerning marker stands where a part must be', () => {
    it.each([
      ['glyph', 'C8;RK:3', 'RK'],
      ['glyph', 'C8;RK', 'RK'],
      ['shape', 'C8;AK:1', 'AK'],
      ['bare', 'C8;RK:3', 'RK'],
    ])('refuses a %s whose codeString is %s', (type, codeString, marker) => {
      const result = defineTracked('MARKERPART', definitionOf(type, codeString));
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`uses a kerning marker (${marker}) as a part`);
    });

    it('says the part can never be drawn and where the marker goes', () => {
      const result = defineTracked('MARKERPART', { type: 'glyph', codeString: 'C8;RK:3' });
      expect(result.errors).toEqual([
        '"MARKERPART": define("MARKERPART"): the codeString "C8;RK:3" uses a kerning marker (RK) as a part, which can never be drawn: a kerning marker sets the gap before a character. Write it where "MARKERPART" is used instead, e.g. RK:2/MARKERPART.',
      ]);
    });
  });

  describe('when a glyph or shape code string reads as no character', () => {
    it.each([
      ['shape', 'RK:3'],
      ['shape', 'AK:0'],
      ['glyph', 'RK:3'],
      ['glyph', 'RK'],
      ['glyph', ';'],
    ])('refuses a %s whose codeString is %s', (type, codeString) => {
      const result = defineTracked('NOTHING', definitionOf(type, codeString));
      expect(result.defined).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('reads as no character');
    });

    it('says a shape must draw a character and where the marker goes', () => {
      const result = defineTracked('NOTHING', { type: 'shape', codeString: 'RK:3' });
      expect(result.errors).toEqual([
        '"NOTHING": define("NOTHING"): the codeString "RK:3" reads as no character, so every use of "NOTHING" would draw nothing. A shape must draw one character; a kerning marker alone is only a gap, so write it where "NOTHING" is used instead, e.g. RK:2/NOTHING.',
      ]);
    });

    it('keeps a bare alias of a lone marker, which spaces characters like the marker', () => {
      expect(defineTracked('NAMEDGAP', { codeString: 'RK:3' }).defined).toEqual(['NAMEDGAP']);
      expect(new BlissSVGBuilder('B291/NAMEDGAP/B313').svgCode)
        .toBe(new BlissSVGBuilder('B291/RK:3/B313').svgCode);
    });
  });

  describe('when the code string is readable', () => {
    it.each([
      ['bare', 'B291/RK:3/B313'],
      ['bare', 'RK:3/B291'],
      ['bare', 'B291;C8:2,3'],
      ['shape', 'C8:'],
      ['shape', 'C8:,'],
      ['shape', 'C8;'],
      ['shape', 'C8:1.5,-2'],
      ['shape', '[title=a:b]>C8'],
      ['shape', 'NOTYETDEFINED:1'],
      ['shape', '[margin=2]>C8'],
      ['glyph', 'B291:,3'],
      ['glyph', '[color=red]B291'],
    ])('defines a %s whose codeString is %s', (type, codeString) => {
      const result = defineTracked('READABLE', definitionOf(type, codeString));
      expect(result.errors).toEqual([]);
      expect(result.defined).toEqual(['READABLE']);
    });
  });

  describe('when the definition name cannot be spelled in the DSL', () => {
    // note: the check reads a use through a stand-in name; reading these
    // names themselves would judge the name (`C8:.` is a malformed coordinate)
    it.each([
      ['C8:.', { type: 'shape', codeString: 'C8' }],
      ['A;RK', { type: 'glyph', codeString: 'B291' }],
      ['A/B', { codeString: 'B291' }],
    ])('defines %s by its readable code string', (name, definition) => {
      expect(defineTracked(name, definition)).toMatchObject({ defined: [name], errors: [] });
    });
  });

  describe('when a refused definition travels with others', () => {
    it('registers the others and reports only the refused one', () => {
      customCodes.push('FIRSTOK', 'REFUSED', 'SECONDOK');
      const result = BlissSVGBuilder.define({
        FIRSTOK: { type: 'shape', codeString: 'C8' },
        REFUSED: { type: 'shape', codeString: 'C8:.' },
        SECONDOK: { type: 'glyph', codeString: 'B291' },
      });
      expect(result.defined).toEqual(['FIRSTOK', 'SECONDOK']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/^"REFUSED": /);
    });

    it('leaves no definition behind but the ones it registers', () => {
      // pins that judging a definition leaves nothing in the registry; the
      // cleanup removes every tracked code, so any other custom code is a leak
      defineTracked('REFUSED', { type: 'glyph', codeString: 'C8;RK:3' });
      defineTracked('ACCEPTED', { type: 'glyph', codeString: 'B291' });
      const custom = BlissSVGBuilder.listDefinitions()
        .filter((code) => !BlissSVGBuilder.getDefinition(code).isBuiltIn);
      expect(custom).toEqual(['ACCEPTED']);
    });

    it('keeps a definition that happens to share the name the check reads under', () => {
      // pins the restore of a displaced entry: `_definition-being-read_` is the
      // stand-in name the check puts the judged entry under while it reads it
      defineTracked('_definition-being-read_', { type: 'shape', codeString: 'C8:1,2' });
      defineTracked('JUDGED', { type: 'glyph', codeString: 'C8;RK:3' });
      expect(BlissSVGBuilder.getDefinition('_definition-being-read_').codeString).toBe('C8:1,2');
    });

    it('keeps the existing definition when overwrite is asked for', () => {
      defineTracked('KEPT', { type: 'shape', codeString: 'C8' });
      const result = defineTracked('KEPT', { type: 'shape', codeString: 'C8:.' }, { overwrite: true });
      expect(result.errors).toHaveLength(1);
      expect(BlissSVGBuilder.getDefinition('KEPT').codeString).toBe('C8');
    });

    it('skips an existing name without overwrite, as for every definition', () => {
      defineTracked('KEPT', { type: 'shape', codeString: 'C8' });
      expect(defineTracked('KEPT', { type: 'shape', codeString: 'C8:.' }))
        .toMatchObject({ defined: [], skipped: ['KEPT'], errors: [] });
    });
  });

  describe('when patchDefinition changes a code string', () => {
    it.each([
      ['shape', 'C8', 'C8:.', '(MALFORMED_COORDINATES)'],
      ['glyph', 'B291', 'RK:3;B291', '(MALFORMED_KERNING_VALUE)'],
      ['glyph', 'B291', 'B291;RK:3', 'uses a kerning marker (RK) as a part'],
      ['shape', 'C8', 'AK:0', 'reads as no character'],
      ['bare', 'B291', 'B291;C8:1.2.3', '(MALFORMED_COORDINATES)'],
    ])('refuses a %s patched from %s to %s and leaves it unchanged', (type, from, to, reason) => {
      defineTracked('PATCHED', definitionOf(type, from));
      expect(() => BlissSVGBuilder.patchDefinition('PATCHED', { codeString: to })).toThrow(reason);
      expect(BlissSVGBuilder.getDefinition('PATCHED').codeString).toBe(from);
    });

    it('names patchDefinition in the refusal', () => {
      defineTracked('PATCHED', { type: 'shape', codeString: 'C8' });
      expect(() => BlissSVGBuilder.patchDefinition('PATCHED', { codeString: 'C8:.' })).toThrow(
        'patchDefinition("PATCHED"): the codeString "C8:." cannot be read (MALFORMED_COORDINATES), so every use of "PATCHED" would warn and drop it. Write a position as :x,y with plain numbers, e.g. C8:1,2.'
      );
    });

    it('applies a readable code string', () => {
      defineTracked('PATCHED', { type: 'shape', codeString: 'C8' });
      BlissSVGBuilder.patchDefinition('PATCHED', { codeString: 'C8:1,2' });
      expect(BlissSVGBuilder.getDefinition('PATCHED').codeString).toBe('C8:1,2');
    });
  });

  describe('when patchDefinition would give a shape two drawing methods', () => {
    it('refuses a codeString on a shape drawn by getPath, and leaves it unchanged', () => {
      defineTracked('DRAWN', line);
      expect(() => BlissSVGBuilder.patchDefinition('DRAWN', { codeString: 'C8' })).toThrow(
        'patchDefinition("DRAWN"): a shape is drawn either by its getPath function or by its codeString, and this patch would leave it with both. To change how "DRAWN" is drawn, remove it and define it again.'
      );
      expect(BlissSVGBuilder.getDefinition('DRAWN').codeString).toBeUndefined();
    });

    it('refuses a getPath on a shape drawn by its codeString, and leaves it unchanged', () => {
      defineTracked('WRITTEN', { type: 'shape', codeString: 'C8' });
      expect(() => BlissSVGBuilder.patchDefinition('WRITTEN', { getPath: line.getPath }))
        .toThrow('would leave it with both');
      expect(BlissSVGBuilder.getDefinition('WRITTEN').getPath).toBeUndefined();
    });

    it('refuses both in one patch', () => {
      defineTracked('DRAWN', line);
      expect(() => BlissSVGBuilder.patchDefinition('DRAWN', { codeString: 'C8', getPath: line.getPath }))
        .toThrow('would leave it with both');
    });

    it('still replaces the getPath of a shape drawn by getPath', () => {
      defineTracked('DRAWN', line);
      const other = () => 'M0,0 L0,4';
      BlissSVGBuilder.patchDefinition('DRAWN', { getPath: other });
      expect(BlissSVGBuilder.getDefinition('DRAWN').getPath).toBe(other);
    });
  });
});
