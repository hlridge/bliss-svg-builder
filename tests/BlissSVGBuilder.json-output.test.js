import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the toJSON() output shape and related parsed-tree invariants. Treats
 * the parsed tree (groups, glyphs, parts) as the load-bearing snapshot of
 * what the builder understood from its input.
 *
 * Covers:
 * - Top-level shape: groups, glyphs, parts, options, text labels, space groups.
 * - Part-level fields: codeName (user-level B-code identity), x, y, isIndicator, width, options.
 * - Default toJSON() strips nested parts; { deep: true } preserves them.
 * - Constructor accepts a string or a toJSON() object as input.
 * - JSON input with unknown or unresolvable codeName produces a UNKNOWN_CODE
 *   warning, not a crash.
 * - Structural consistency: unpositioned codes and codes with explicit (0,0)
 *   positions produce equivalent parsed trees and identical SVG.
 * - Parsed-tree width invariants for /, //, ///, //// and explicit TSP/QSP
 *   space variants (kept here as a structural parsed-tree invariant adjacent
 *   to the JSON-shape pins, rather than split into the spacing file — decided
 *   best-fit, low-stakes scope-stretch).
 *
 * Does NOT cover:
 * - Round-trip identity through toJSON (parse → toJSON → reconstruct →
 *   identical SVG); see `BlissSVGBuilder.round-trip.test.js`.
 * - toString() serialization; see `BlissSVGBuilder.string-output.test.js`.
 * - Element keys (auto/user-assigned, lookup, key/id separation); see
 *   `BlissSVGBuilder.element-keys.test.js`.
 */
describe('BlissSVGBuilder JSON output', () => {

  const customCodes = [];
  afterEach(() => {
    for (const code of customCodes) {
      try { BlissSVGBuilder.removeDefinition(code); } catch {}
    }
    customCodes.length = 0;
  });

  describe('when reading the top-level toJSON shape', () => {
    it('outputs groups/glyphs structure, not decomposed shapes', () => {
      const json = new BlissSVGBuilder('B291//B292').toJSON();
      expect(json).toHaveProperty('groups');
      expect(json.groups.length).toBeGreaterThanOrEqual(1);
      expect(json.groups[0]).toHaveProperty('glyphs');
    });

    it('preserves glyph codes at the character level', () => {
      const json = new BlissSVGBuilder('B291/B292').toJSON();
      const glyphs = json.groups[0].glyphs;
      const codes = glyphs.map(g => g.codeName);
      expect(codes).toContain('B291');
      expect(codes).toContain('B292');
    });

    it('preserves global options', () => {
      const json = new BlissSVGBuilder('[color=red]||B291').toJSON();
      expect(json.options).toBeDefined();
      expect(json.options.color).toBe('red');
    });

    it('preserves group-level options', () => {
      const json = new BlissSVGBuilder('[color=blue]|B291//B292').toJSON();
      const firstGroup = json.groups[0];
      expect(firstGroup.options).toBeDefined();
      expect(firstGroup.options.color).toBe('blue');
    });

    it('preserves text labels', () => {
      const json = new BlissSVGBuilder('B291{hello}').toJSON();
      expect(json.groups[0].text).toBe('hello');
    });

    it('preserves space groups (// separator)', () => {
      const json = new BlissSVGBuilder('B291//B292').toJSON();
      expect(json.groups.length).toBe(3);
    });
  });

  describe('when parsing / and // space variants to space groups', () => {
    it('// stores as a space group with TSP', () => {
      const raw = new BlissSVGBuilder('B291//B292').toJSON();
      expect(raw.groups.length).toBe(3);
      expect(raw.groups[1].glyphs[0].parts[0].codeName).toBe('TSP');
    });

    it('/// stores as a space group with two TSPs', () => {
      const raw = new BlissSVGBuilder('B291///B292').toJSON();
      const spaceParts = raw.groups[1].glyphs.flatMap(g => g.parts);
      const tspCount = spaceParts.filter(p => p.codeName === 'TSP').length;
      expect(tspCount).toBe(2);
    });

    it('// produces wider output than single glyph', () => {
      const single = new BlissSVGBuilder('B291').elements.width;
      const withSpace = new BlissSVGBuilder('B291//B292').elements.width;
      expect(withSpace).toBeGreaterThan(single);
    });

    it('/// produces wider space than //', () => {
      const doubleSpace = new BlissSVGBuilder('B291//B292').elements.width;
      const tripleSpace = new BlissSVGBuilder('B291///B292').elements.width;
      expect(tripleSpace).toBeGreaterThan(doubleSpace);
    });

    it('//// produces wider space than ///', () => {
      const tripleSpace = new BlissSVGBuilder('B291///B292').elements.width;
      const quadSpace = new BlissSVGBuilder('B291////B292').elements.width;
      expect(quadSpace).toBeGreaterThan(tripleSpace);
    });

    it('explicit /TSP/ preserves TSP in parsed structure', () => {
      const raw = new BlissSVGBuilder('B291/TSP/B292').toJSON();
      const spaceGroup = raw.groups[1];
      expect(spaceGroup.glyphs[0].parts[0].codeName).toBe('TSP');
    });

    it('explicit /QSP/ preserves QSP in parsed structure', () => {
      const raw = new BlissSVGBuilder('B291/QSP/B292').toJSON();
      const spaceGroup = raw.groups[1];
      expect(spaceGroup.glyphs[0].parts[0].codeName).toBe('QSP');
    });

    it('explicit TSP and QSP produce different widths', () => {
      const tsp = new BlissSVGBuilder('B291/TSP/B292').elements.width;
      const qsp = new BlissSVGBuilder('B291/QSP/B292').elements.width;
      expect(tsp).not.toBe(qsp);
    });
  });

  describe('when reading toJSON parts (default mode)', () => {
    it('returns the raw parsed input structure', () => {
      const raw = new BlissSVGBuilder('B291').toJSON();
      expect(raw).toHaveProperty('groups');
    });

    it('preserves exact input structure for compositions', () => {
      const raw = new BlissSVGBuilder('H;E:10,0;B313:20,0/B313').toJSON();
      const firstGlyph = raw.groups[0].glyphs[0];
      // Should have 3 parts (H, E, B313); not collapsed
      expect(firstGlyph.parts.length).toBe(3);
    });

    it('preserves codeName on parts', () => {
      const json = new BlissSVGBuilder('H;E:10,0;B313:20,0').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts[0].codeName).toBe('H');
      expect(parts[1].codeName).toBe('E');
      expect(parts[2].codeName).toBe('B313');
    });

    it('preserves x,y on parts', () => {
      const json = new BlissSVGBuilder('H;E:10,0;B313:20,0').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts[1].x).toBe(10);
      expect(parts[1].y).toBe(0);
      expect(parts[2].x).toBe(20);
      expect(parts[2].y).toBe(0);
    });

    it('preserves isIndicator and width on indicator parts', () => {
      const json = new BlissSVGBuilder('B291;B86').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      const indicator = parts.find(p => p.isIndicator);
      expect(indicator).toBeDefined();
      expect(indicator.codeName).toBe('B86');
      expect(indicator.width).toBeDefined();
    });

    it('preserves options on parts', () => {
      const json = new BlissSVGBuilder('[color=red]>H;E:10,0').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      // The part-level option should be preserved
      const partWithOpts = parts.find(p => p.options?.color === 'red');
      expect(partWithOpts).toBeDefined();
    });

    it('part codeName reflects user-level B-code, not internal expansion', () => {
      // Standalone B291 has codeString "S8:0,8"; expand() substitutes this,
      // so the PART currently shows codeName "S8". It should show "B291".
      const json = new BlissSVGBuilder('B291').toJSON();
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('B291');
    });

    it('each glyph part reflects its own B-code in multi-glyph words', () => {
      // B335 is single-part (LARR8E:0,10), so wrapping applies to both glyphs
      const json = new BlissSVGBuilder('B291/B335').toJSON();
      const g1part = json.groups[0].glyphs[0].parts[0];
      const g2part = json.groups[0].glyphs[1].parts[0];
      expect(g1part.codeName).toBe('B291');
      expect(g2part.codeName).toBe('B335');
    });

    it('composite glyph parts already preserve their codeNames', () => {
      // B291;B86: parseParts handles this correctly today (guard test)
      const json = new BlissSVGBuilder('B291;B86').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts[0].codeName).toBe('B291');
      expect(parts[1].codeName).toBe('B86');
    });

    it('direct shape code stays as written', () => {
      // User wrote "S8:0,8" directly; codeName should remain S8
      const json = new BlissSVGBuilder('S8:0,8').toJSON();
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('S8');
    });

    it('typed glyph decomposes in toJSON', () => {
      // type: 'glyph' codes decompose to their underlying built-in code
      customCodes.push('LOVE');
      BlissSVGBuilder.define({'LOVE': { type: 'glyph', codeString: 'B431' }});
      const json = new BlissSVGBuilder('LOVE').toJSON();
      expect(json.groups[0].glyphs[0].codeName).toBe('B431');
    });
  });

  describe('when reading toJSON with { deep: true }', () => {
    it('positioned B-code keeps user position on outer, definition position on inner', () => {
      // B291:2,2 means B291 at user position (2,2). Internally, B291 expands
      // to S8:0,8. The (0,8) is S8's position within B291's composition,
      // separate from the user's (2,2).
      const json = new BlissSVGBuilder('B291:2,2').toJSON({ deep: true });
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('B291');
      expect(part.x).toBe(2);
      expect(part.y).toBe(2);
      expect(part.parts[0].codeName).toBe('S8');
      expect(part.parts[0].x).toBe(0);
      expect(part.parts[0].y).toBe(8);
    });

    it('B-code with position matching definition does not conflate levels', () => {
      // B291:0,8: user position (0,8) happens to match S8's internal (0,8).
      // They must remain on separate levels, not be merged or deleted.
      const json = new BlissSVGBuilder('B291:0,8').toJSON({ deep: true });
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('B291');
      expect(part.x).toBe(0);
      expect(part.y).toBe(8);
      expect(part.parts[0].codeName).toBe('S8');
      expect(part.parts[0].x).toBe(0);
      expect(part.parts[0].y).toBe(8);
    });

    it('deep: true preserves nested parts', () => {
      const json = new BlissSVGBuilder('B313').toJSON({ deep: true });
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.parts).toBeDefined();
      expect(part.parts.length).toBeGreaterThan(0);
    });
  });

  describe('when default toJSON strips nested parts', () => {
    it('does not include nested parts for composite codes', () => {
      const json = new BlissSVGBuilder('B291').toJSON();
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.codeName).toBe('B291');
      expect(part.parts).toBeUndefined();
    });

    it('does not include nested parts for multi-part compositions', () => {
      const json = new BlissSVGBuilder('H;E:10,0;B313:20,0').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts.length).toBe(3);
      for (const part of parts) {
        expect(part.parts).toBeUndefined();
      }
    });

    it('preserves codeName, x, y on stripped parts', () => {
      const json = new BlissSVGBuilder('H;E:10,0;B313:20,0').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      expect(parts[0].codeName).toBe('H');
      expect(parts[1].codeName).toBe('E');
      expect(parts[1].x).toBe(10);
      expect(parts[1].y).toBe(0);
      expect(parts[2].codeName).toBe('B313');
    });

    it('preserves isIndicator and width on stripped indicator parts', () => {
      const json = new BlissSVGBuilder('B291;B86').toJSON();
      const parts = json.groups[0].glyphs[0].parts;
      const indicator = parts.find(p => p.isIndicator);
      expect(indicator).toBeDefined();
      expect(indicator.codeName).toBe('B86');
      expect(indicator.width).toBeDefined();
    });

    it('default toJSON strips nested parts', () => {
      const json = new BlissSVGBuilder('B313').toJSON();
      const part = json.groups[0].glyphs[0].parts[0];
      expect(part.parts).toBeUndefined();
    });
  });

  describe('when accepting different kinds of constructor input', () => {
    it('accepts a string', () => {
      const builder = new BlissSVGBuilder('B291');
      expect(builder.svgCode).toContain('<svg');
    });

    it('accepts an object (JSON)', () => {
      const json = new BlissSVGBuilder('B291').toJSON();
      const builder = new BlissSVGBuilder(json);
      expect(builder.svgCode).toContain('<svg');
    });

    it('accepts JSON with options parameter', () => {
      const json = new BlissSVGBuilder('B291').toJSON();
      const builder = new BlissSVGBuilder(json, { overrides: { color: 'green' } });
      expect(builder.svgCode).toContain('green');
    });
  });

  describe('when handling unknown or unresolvable codes in JSON input', () => {
    it('unknown codeName in JSON input produces warning, not crash', () => {
      const json = {
        groups: [{ glyphs: [{ parts: [{ codeName: 'NONEXISTENT' }] }] }],
        options: {}
      };
      const builder = new BlissSVGBuilder(json);
      expect(builder.warnings.length).toBeGreaterThan(0);
      expect(builder.warnings[0].code).toBe('UNKNOWN_CODE');
    });

    it('code referencing unknown target produces warning', () => {
      // LOOP_A references LOOP_B which doesn't exist
      customCodes.push('LOOP_A');
      BlissSVGBuilder.define({
        LOOP_A: { type: 'shape', codeString: 'LOOP_B:0,0' },
      });
      const json = {
        groups: [{ glyphs: [{ parts: [{ codeName: 'LOOP_A' }] }] }],
        options: {}
      };
      const builder = new BlissSVGBuilder(json);
      expect(builder.warnings.some(w => w.source === 'LOOP_B')).toBe(true);
    });
  });

  describe('when comparing parsed-tree consistency between unpositioned and explicit zero-position inputs', () => {
    it('B291 and B291:0,0 produce structurally similar deep trees', () => {
      const json1 = new BlissSVGBuilder('B291').toJSON({ deep: true });
      const json2 = new BlissSVGBuilder('B291:0,0').toJSON({ deep: true });
      const part1 = json1.groups[0].glyphs[0].parts[0];
      const part2 = json2.groups[0].glyphs[0].parts[0];
      expect(part1.codeName).toBe('B291');
      expect(part2.codeName).toBe('B291');
      expect(part1.parts).toBeDefined();
      expect(part1.parts[0].codeName).toBe('S8');
      expect(part2.parts).toBeDefined();
      expect(part2.parts[0].codeName).toBe('S8');
    });

    it('B339 and B339:0,0 produce structurally similar deep trees', () => {
      const json1 = new BlissSVGBuilder('B339').toJSON({ deep: true });
      const json2 = new BlissSVGBuilder('B339:0,0').toJSON({ deep: true });
      const part1 = json1.groups[0].glyphs[0].parts[0];
      const part2 = json2.groups[0].glyphs[0].parts[0];
      expect(part1.codeName).toBe('B339');
      expect(part2.codeName).toBe('B339');
      expect(part1.parts).toBeDefined();
      expect(part2.parts).toBeDefined();
    });

    it('B29 (bare alias to Xa) and B29:0,0 produce similar trees', () => {
      const json1 = new BlissSVGBuilder('B29').toJSON({ deep: true });
      const json2 = new BlissSVGBuilder('B29:0,0').toJSON({ deep: true });
      const part1 = json1.groups[0].glyphs[0].parts[0];
      const part2 = json2.groups[0].glyphs[0].parts[0];
      // B29 is a bare alias (not builtIn), resolves to Xa
      expect(part1.codeName).toBe('Xa');
      expect(part2.codeName).toBe('Xa');
    });

    it('B291 renders identically to B291:0,0', () => {
      expect(new BlissSVGBuilder('B291').svgCode)
        .toBe(new BlissSVGBuilder('B291:0,0').svgCode);
    });

    it('B339 renders identically to B339:0,0', () => {
      expect(new BlissSVGBuilder('B339').svgCode)
        .toBe(new BlissSVGBuilder('B339:0,0').svgCode);
    });
  });
});
