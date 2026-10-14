import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins merge() identity survival for custom typed glyphs: deep-default
 * toJSON() records the written name on the glyph, so a merged clean
 * instance keeps its name under preserve while default emission stays
 * decomposed.
 *
 * Covers:
 * - merge() keeping a sole-part and a multi-part custom typed glyph name
 *   under preserve, with byte-identical render and stable reparse.
 * - Default emission staying decomposed and byte-unchanged after merge.
 * - toJSON preserve restore at glyph level after merge; public no-leak in
 *   both modes; the deep-output recording that carries the name (deep
 *   codeName stays the resolved built-in so the delta pipeline is
 *   unaffected).
 * - Divergence guardrail: a merged glyph that no longer matches its
 *   definition's anatomy is written as its typed delta (`MYGL1;B81`, the
 *   name on the one part the definition is) instead of a stale name.
 * - The merged character keeping its name where no one code draws the glyph,
 *   and getting no name back once an edit has re-made it, or once its deep
 *   JSON puts another part before the glyph's own.
 *
 * Does NOT cover:
 * - Which character of a merged word takes its `;;` codes, see
 *   `BlissSVGBuilder.portable-head-marker.test.js`.
 * - Alias-over-typed-target precedence through merge (ALGL stays ALGL) and
 *   typed SHAPES through merge (no glyphCode identity; the parser-side
 *   recording carries them), see `BlissSVGBuilder.typed-name-preserve.test.js`.
 */

const customCodes = [];
afterEach(() => {
  for (const code of customCodes) {
    try { BlissSVGBuilder.removeDefinition(code); } catch {}
  }
  customCodes.length = 0;
});

function defineAndTrack(definitions, options) {
  customCodes.push(...Object.keys(definitions));
  return BlissSVGBuilder.define(definitions, options);
}

const defineGlyphFixtures = () => defineAndTrack({
  MYGL1: { type: 'glyph', codeString: 'C8' },
  MYGLYPH: { type: 'glyph', codeString: 'C8;C2:3,3' },
});

// Host builder with the fixture glyph merged in as a second word.
const mergeIntoHost = (code) => {
  const host = new BlissSVGBuilder('B208');
  host.merge(new BlissSVGBuilder(code));
  return host;
};

describe('BlissSVGBuilder merge name preserve', () => {

  describe('when a merged builder holds a custom typed glyph', () => {
    it('keeps the written name under preserve', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGL1');
      expect(host.toString({ preserve: true })).toBe('B208//MYGL1');
      expect(host.warnings).toEqual([]);
    });

    it('keeps a multi-part glyph name under preserve', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGLYPH');
      expect(host.toString({ preserve: true })).toBe('B208//MYGLYPH');
    });

    it('decomposes to built-in codes in default emission', () => {
      defineGlyphFixtures();
      expect(mergeIntoHost('MYGL1').toString()).toBe('B208//C8');
      expect(mergeIntoHost('MYGLYPH').toString()).toBe('B208//C8;C2:3,3');
    });

    it('renders byte-identically to the directly written composition', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGL1');
      expect(host.svgCode).toBe(new BlissSVGBuilder('B208//MYGL1').svgCode);
    });

    it('reparses the preserve emission to an identical render', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGLYPH');
      const reparsed = new BlissSVGBuilder(host.toString({ preserve: true }));
      expect(reparsed.svgCode).toBe(host.svgCode);
      expect(reparsed.warnings).toEqual([]);
    });
  });

  describe('when the merged tree serializes to JSON', () => {
    it('restores the written name at glyph level under preserve', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGL1');
      const glyph = host.toJSON({ preserve: true }).groups.at(-1).glyphs[0];
      expect(glyph.codeName).toBe('MYGL1');
    });

    it('emits no internal recording in public output in either mode', () => {
      defineGlyphFixtures();
      const host = mergeIntoHost('MYGL1');
      expect(JSON.stringify(host.toJSON())).not.toContain('_aliasCodeName');
      expect(JSON.stringify(host.toJSON({ preserve: true }))).not.toContain('_aliasCodeName');
    });

    it('records the written name in deep output for pipeline survival', () => {
      defineGlyphFixtures();
      const sole = new BlissSVGBuilder('MYGL1').toJSON({ deep: true }).groups[0].glyphs[0];
      expect(sole._aliasCodeName).toBe('MYGL1');
      // pins deep-stays-raw: the delta pipeline computes against the
      // resolved identity, the recording rides beside it
      expect(sole.codeName).toBe('C8');
      const multi = new BlissSVGBuilder('MYGLYPH').toJSON({ deep: true }).groups[0].glyphs[0];
      expect(multi._aliasCodeName).toBe('MYGLYPH');
    });
  });

  describe('when the merged glyph has diverged from its definition', () => {
    it('writes the typed delta instead of a stale name', () => {
      // re-pinned at C23 (D2): was "declines the written name and decomposes"
      // to `B208//C8;B81`. The glyph is one part named after its definition,
      // which keeps its name through the merge, so the save is the delta
      // against it, never the bare name
      defineGlyphFixtures();
      const diverged = new BlissSVGBuilder('MYGL1');
      diverged.glyph(0).applyIndicators('B81');
      const host = new BlissSVGBuilder('B208');
      host.merge(diverged);
      const saved = host.toString({ preserve: true });
      expect(saved).toBe('B208//MYGL1;B81');
      expect(new BlissSVGBuilder(saved).svgCode).toBe(host.svgCode);
      expect(host.toString()).toBe('B208//C8;B81');
    });
  });

  describe('when the merged character is read back by its name', () => {
    it('keeps the name of a glyph no one code draws (MYGLYPH), as the absorbed builder holds it', () => {
      // regression: the deep JSON writes such a glyph by no code at all, so the
      // merged character came in nameless, reporting no code and publishing
      // the internal isBlissGlyph flag
      defineGlyphFixtures();
      const other = new BlissSVGBuilder('MYGLYPH');
      const host = new BlissSVGBuilder('B208');
      host.merge(other);
      expect(host.group(1).glyph(0).codeName).toBe('MYGLYPH');
      expect(host.toJSON().groups.at(-1)).toEqual(other.toJSON().groups[0]);
    });

    it('keeps the name of a glyph given an indicator before the merge (MYGL1 with B81)', () => {
      // pins the name read from the part the glyph is, its first: the
      // indicator is appended after it, and the glyph keeps its name
      defineGlyphFixtures();
      const other = new BlissSVGBuilder('MYGL1');
      other.glyph(0).applyIndicators('B81');
      const host = new BlissSVGBuilder('B208');
      host.merge(other);
      expect(other.glyph(0).codeName).toBe('MYGL1');
      expect(host.group(1).glyph(0).codeName).toBe('MYGL1');
      expect(host.toJSON().groups.at(-1)).toEqual(other.toJSON().groups[0]);
    });

    it('gives no name back to a character whose deep JSON puts another part before the glyph\'s own (MYGL1)', () => {
      // pins the recorded name believed only while the glyph's own part comes
      // first: with B291 before it, the character is no longer the glyph
      defineGlyphFixtures();
      const deep = new BlissSVGBuilder('MYGL1').toJSON({ deep: true });
      deep.groups[0].glyphs[0].parts.unshift({ codeName: 'B291' });
      const other = new BlissSVGBuilder(deep);
      const host = new BlissSVGBuilder('B208');
      host.merge(other);
      expect(other.glyph(0).codeName).toBe('C8');
      expect(host.group(1).glyph(0).codeName).toBe('C8');
    });

    it('gives no name back to a character re-made from the glyph its alias names (MYALIAS)', () => {
      // pins the recorded name believed only while the character is published
      // whole: replacing its part clears its name and code, while the deep
      // JSON still records MYALIAS, the name it was written as
      defineGlyphFixtures();
      defineAndTrack({ MYALIAS: { codeString: 'MYGL1' } });
      const other = new BlissSVGBuilder('MYALIAS');
      other.glyph(0).replacePart(0, 'MYGL1');
      const host = new BlissSVGBuilder('B208');
      host.merge(other);
      expect(other.glyph(0).codeName).toBe('');
      expect(host.group(1).glyph(0).codeName).toBe('');
      expect(host.toJSON().groups.at(-1)).toEqual(other.toJSON().groups[0]);
    });
  });
});
