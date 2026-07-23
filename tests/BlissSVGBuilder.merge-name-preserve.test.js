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
 *   definition's anatomy decomposes instead of keeping a stale name.
 *
 * Does NOT cover:
 * - Alias-over-typed-target precedence through merge (ALGL stays ALGL) and
 *   typed SHAPES through merge (no glyphCode identity; the parser-side
 *   recording carries them), see `BlissSVGBuilder.typed-name-preserve.test.js`.
 * - A glyph diverged BEFORE merge keeping its typed delta ('MYGL1;B81'):
 *   the recording restores clean instances only, so the merged tree emits
 *   decomposed parts (residual of the merge-name-loss backlog row).
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
    it('declines the written name and decomposes', () => {
      defineGlyphFixtures();
      const diverged = new BlissSVGBuilder('MYGL1');
      diverged.glyph(0).applyIndicators('B81');
      const host = new BlissSVGBuilder('B208');
      host.merge(diverged);
      expect(host.toString({ preserve: true })).toBe('B208//C8;B81');
      expect(host.toString()).toBe('B208//C8;B81');
    });
  });
});
