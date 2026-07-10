/**
 * Pins the singular-argument contract for the glyph-level mutation family
 * (group handle addGlyph/insertGlyph/replaceGlyph, glyph handle replace,
 * builder addGlyph): exactly one parsed glyph per call, word-level artifact
 * args throw, empty/omitted code creates a first-class empty glyph (the
 * replace forms swap one in), non-string args throw a designed TypeError,
 * and every rejected call leaves the builder untouched.
 *
 * Covers:
 * - multi-glyph codes (B313/B1103, defined word aliases) and multi-group
 *   codes (H//C8) throw with the produced count; the addGroup +
 *   mergeWithNext migration reproduces the retired word-fusion result
 * - word-level artifact args throw: word options ([opts]|CODE), word
 *   indicator lists (;;), and fail-flagged words (malformed ;;)
 * - '' / whitespace / omitted code creates {parts:[]}; on an empty builder
 *   the scaffold group holds the empty glyph; replaceGlyph/replace swap in
 *   the empty glyph destructively and the head designation dies with the
 *   replaced content
 * - commit-on-success routing: a rejected arg leaves an empty builder
 *   empty, and empty-builder addGlyph applies options to the glyph itself
 * - char-scope decorations pass through ([opts]CODE, ^, :x,y)
 * - accepted args surface their warnings (kept-node render codes and the
 *   parse-side MISPLACED_GLOBAL_OPTION); rejected args leak none
 * - gate order: on handles, wrong-level and fail-flagged-word no-ops precede
 *   the TypeError guard, and index no-op checks precede content validation;
 *   builder.addGlyph guards the arg first (a pinned surface divergence)
 *
 * Does NOT cover:
 * - group-family singular rules, see
 *   BlissSVGBuilder.group-mutation-args.test.js
 * - part-family rules (addPart/insertPart/replacePart, part replace), see
 *   ElementHandle.part-mutation-args (planned alongside this file)
 * - full DSL/API/object parity for empty content, see
 *   BlissSVGBuilder.empty-content-parity.test.js (planned)
 * - fail-flagged TARGET no-ops across all mutators, see
 *   ElementHandle.failed-word-mutation.test.js
 *
 * @issue: #33
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

beforeAll(() => {
  BlissSVGBuilder.define({ TW: { codeString: 'B291/B291' } });
});

afterAll(() => {
  BlissSVGBuilder.removeDefinition('TW');
});

const stateOf = (b) => JSON.stringify(b.toJSON());

const SURFACES = [
  { label: 'group(0).addGlyph', method: 'addGlyph', invoke: (b, ...args) => b.group(0).addGlyph(...args) },
  { label: 'group(0).insertGlyph(0, ...)', method: 'insertGlyph', invoke: (b, ...args) => b.group(0).insertGlyph(0, ...args) },
  { label: 'group(0).replaceGlyph(0, ...)', method: 'replaceGlyph', invoke: (b, ...args) => b.group(0).replaceGlyph(0, ...args) },
  { label: 'glyph(0).replace', method: 'replace', invoke: (b, ...args) => b.group(0).glyph(0).replace(...args) },
  { label: 'builder.addGlyph', method: 'addGlyph', invoke: (b, ...args) => b.addGlyph(...args) },
];
const EACH_SURFACE = SURFACES.map((s) => [s.label, s]);

describe('ElementHandle glyph mutation args', () => {
  describe('when the code parses to more than one glyph', () => {
    it.each(EACH_SURFACE)('%s throws the produced glyph count and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'B313/B1103'))
        .toThrow('Expected a single glyph, but code "B313/B1103" produced 2 glyphs');
      expect(stateOf(b)).toBe(before);
    });

    it.each(EACH_SURFACE)('%s throws the same shape for a defined word alias', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'TW'))
        .toThrow('Expected a single glyph, but code "TW" produced 2 glyphs');
      expect(stateOf(b)).toBe(before);
    });

    it('reproduces the retired addGlyph word fusion via addGroup plus mergeWithNext', () => {
      // migration pin (GH #33): addGlyph('TW') used to fuse the alias into
      // the receiver group as B291/B291/B291 (verified on a049264, the
      // pre-change runtime)
      const b = new BlissSVGBuilder('B291');
      b.addGroup('TW');
      b.group(0).mergeWithNext();
      expect(b.toString()).toBe('B291/B291/B291');
    });
  });

  describe('when the code spans multiple groups', () => {
    it.each(EACH_SURFACE)('%s throws the produced group count and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      // raw parse count: // materializes a space group, [H, TSP, C8]
      expect(() => invoke(b, 'H//C8'))
        .toThrow('Expected a single group, but code "H//C8" produced 3 groups');
      expect(stateOf(b)).toBe(before);
    });

    it('leaves an empty builder empty when the code is rejected at group level', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addGlyph('H//C8'))
        .toThrow('Expected a single group, but code "H//C8" produced 3 groups');
      expect(b.stats.groupCount).toBe(0);
      expect(b.toJSON().groups).toEqual([]);
    });

    it('leaves an empty builder empty when the code is rejected at glyph level', () => {
      // commit-on-success routing: the scaffold group is attached only after
      // glyph-level validation passes, so nothing is created here
      const b = new BlissSVGBuilder('');
      expect(() => b.addGlyph('B313/B1103'))
        .toThrow('Expected a single glyph, but code "B313/B1103" produced 2 glyphs');
      expect(b.stats.groupCount).toBe(0);
      expect(b.toJSON().groups).toEqual([]);
    });
  });

  describe('when the code parses to no group or no glyph', () => {
    it('throws the produced zero group count for a global-options-only code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).addGlyph('[color=red]||'))
        .toThrow('Expected a single group, but code "[color=red]||" produced 0 groups');
      expect(stateOf(b)).toBe(before);
    });

    it('throws the produced zero glyph count for a bare word-boundary token', () => {
      // parse('|') yields one group holding zero glyphs and no options, the
      // one zero-glyph shape that reaches the glyph-count gate
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).addGlyph('|'))
        .toThrow('Expected a single glyph, but code "|" produced 0 glyphs');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the code carries a word-level artifact', () => {
    it.each(EACH_SURFACE)('%s rejects word-level options and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, '[color=red]|B100')).toThrow('word-level options');
      expect(stateOf(b)).toBe(before);
    });

    it('points the word-options rejection to the glyph spelling and the group family', () => {
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).addGlyph('[color=red]|B100')).toThrow('[opts]CODE');
      expect(() => b.group(0).addGlyph('[color=red]|B100')).toThrow('opts parameter');
      expect(() => b.group(0).addGlyph('[color=red]|B100')).toThrow('addGroup()');
    });

    it.each([
      ['a word indicator list', 'B100;;B81'],
      ['a bare word indicator marker', 'B100;;'],
    ])('rejects %s pointing to applyIndicators and the group family', (label, code) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).addGlyph(code)).toThrow('word-level indicator list');
      expect(() => b.group(0).addGlyph(code)).toThrow('applyIndicators()');
      expect(() => b.group(0).addGlyph(code)).toThrow('addGroup()');
      expect(stateOf(b)).toBe(before);
    });

    it('rejects an options-carrying empty word token as word-level options', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).addGlyph('[color=red]|')).toThrow('word-level options');
      expect(stateOf(b)).toBe(before);
    });

    it('rejects a fail-flagged word instead of silently extracting its kept glyph', () => {
      // regression: addGlyph('B291;;B81;;B86') used to splice the kept base
      // glyph in as valid content, silently un-failing it (behavior on
      // a049264, the pre-change runtime)
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).addGlyph('B291;;B81;;B86')).toThrow('not a single valid glyph');
      expect(() => b.group(0).addGlyph('B291;;B81;;B86')).toThrow('MALFORMED_WORD_INDICATOR');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the code is empty, whitespace-only, or omitted', () => {
    it.each([
      ['an empty string', (h) => h.addGlyph('')],
      ['a whitespace-only string', (h) => h.addGlyph('   ')],
      ['an omitted argument', (h) => h.addGlyph()],
    ])('group.addGlyph appends a string-invisible empty glyph for %s', (label, act) => {
      const b = new BlissSVGBuilder('B291');
      act(b.group(0));
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[1]).toEqual({ parts: [] });
      expect(b.toString()).toBe('B291');
    });

    it('group.insertGlyph inserts the empty glyph at the index', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).insertGlyph(0, '');
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0]).toEqual({ parts: [] });
      expect(glyphs[1].parts[0].codeName).toBe('B291');
    });

    it.each([
      ['an empty string', (b) => b.addGlyph('')],
      ['a whitespace-only string', (b) => b.addGlyph('   ')],
      ['an omitted argument', (b) => b.addGlyph()],
    ])('builder.addGlyph on an empty builder creates a group holding one empty glyph for %s', (label, act) => {
      // a group HOLDING an empty glyph, not a bare empty group: the glyph
      // family creates at its own level
      const b = new BlissSVGBuilder('');
      act(b);
      expect(b.toJSON().groups).toEqual([{ glyphs: [{ parts: [] }] }]);
      expect(b.stats.groupCount).toBe(1);
    });
  });

  describe('when a replace form receives an empty code', () => {
    it('replaceGlyph swaps the target for an empty glyph destructively', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).replaceGlyph(0, '');
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs).toHaveLength(2);
      expect(glyphs[0]).toEqual({ parts: [] });
      expect(glyphs[1].parts[0].codeName).toBe('B1103');
      expect(b.toString()).toBe('B1103');
    });

    it('glyph.replace swaps this glyph for an empty glyph destructively', () => {
      const b = new BlissSVGBuilder('B313/B1103');
      b.group(0).glyph(0).replace('');
      const glyphs = b.toJSON().groups[0].glyphs;
      expect(glyphs[0]).toEqual({ parts: [] });
      expect(b.toString()).toBe('B1103');
    });

    it('kills the head designation with the replaced content while the empty node survives', () => {
      // the designation belongs to the swapped-out node; the swapped-in empty
      // glyph has no serialized form to carry it
      const b = new BlissSVGBuilder('B313^/B1103');
      b.group(0).replaceGlyph(0, '');
      expect(b.toJSON().groups[0].glyphs[0]).toEqual({ parts: [] });
      expect(JSON.stringify(b.toJSON())).not.toContain('isHeadGlyph');
    });
  });

  describe('when replaceGlyph targets an out-of-range index', () => {
    it('stays a silent no-op for an empty code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      b.group(0).replaceGlyph(99, '');
      expect(stateOf(b)).toBe(before);
    });

    it('stays a silent no-op even for a multi-glyph code', () => {
      // index no-op checks precede content validation in the replace family
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).replaceGlyph(99, 'B313/B1103')).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('still throws the designed TypeError for a non-string code', () => {
      // a non-string arg is a malformed call: the TypeError guard precedes index checks
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).replaceGlyph(99, 42)).toThrow(TypeError);
    });
  });

  describe('when the code is not a string', () => {
    it.each(EACH_SURFACE)('%s throws a designed TypeError naming the method and leaves the builder untouched', (label, { method, invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, null)).toThrow(TypeError);
      expect(() => invoke(b, null)).toThrow(`${method}() requires a DSL code string`);
      expect(() => invoke(b, 42)).toThrow(`${method}() requires a DSL code string`);
      expect(() => invoke(b, {})).toThrow(`${method}() requires a DSL code string`);
      expect(() => invoke(b, true)).toThrow(`${method}() requires a DSL code string`);
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when a non-string arg reaches a gated target', () => {
    it.each([
      ['addGlyph', (g) => g.addGlyph(42)],
      ['insertGlyph', (g) => g.insertGlyph(0, 42)],
      ['replaceGlyph', (g) => g.replaceGlyph(0, 42)],
    ])('silently no-ops %s on a fail-flagged word', (label, act) => {
      // the terminal-word gate wins over the TypeError guard (design ordering)
      const b = new BlissSVGBuilder('B291;;B81;;B86');
      const before = stateOf(b);
      expect(() => act(b.group(0))).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('silently no-ops replace on a glyph inside a fail-flagged word', () => {
      const b = new BlissSVGBuilder('B291;;B81;;B86');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).replace(42)).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it.each([
      ['addGlyph', (h) => h.addGlyph(42)],
      ['insertGlyph', (h) => h.insertGlyph(0, 42)],
      ['replaceGlyph', (h) => h.replaceGlyph(0, 42)],
    ])('silently no-ops %s on a wrong-level (glyph) handle', (label, act) => {
      // group-level operations on a glyph handle never read the arg
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => act(b.glyph(0))).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('silently no-ops replace on a wrong-level (group) handle', () => {
      // replace has no group-level arm; the arg is never read
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).replace(42)).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('still throws the designed TypeError from builder.addGlyph when the last word is fail-flagged', () => {
      // deliberate surface divergence: builder methods guard the arg FIRST
      // (builder ordering rule), while the handle surface above gates first
      // and no-ops silently on the same target
      const b = new BlissSVGBuilder('B291;;B81;;B86');
      const before = stateOf(b);
      expect(() => b.addGlyph(42)).toThrow(TypeError);
      expect(() => b.addGlyph(42)).toThrow('addGlyph() requires a DSL code string');
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when an empty code carries options', () => {
    it('creates an options-carrying empty glyph that serializes as the options-only token', () => {
      const b = new BlissSVGBuilder('B313');
      b.group(0).addGlyph('', { color: 'red' });
      expect(b.toJSON().groups[0].glyphs[1]).toEqual({ parts: [], options: { color: 'red' } });
      expect(b.toString()).toBe('B313/[color=red]');
      const reparsed = new BlissSVGBuilder(b.toString());
      expect(reparsed.toString()).toBe('B313/[color=red]');
      expect(reparsed.toJSON()).toEqual(b.toJSON());
    });
  });

  describe('when an accepted code carries a warning', () => {
    it('keeps surfacing the unknown-code warning on builder.warnings', () => {
      const b = new BlissSVGBuilder('B208');
      b.group(0).addGlyph('B291;ZZ9');
      expect(b.warnings.some(w => w.code === 'UNKNOWN_CODE')).toBe(true);
    });

    it('forwards the parse-side misplaced-global-option warning', () => {
      const b = new BlissSVGBuilder('B208');
      b.group(0).addGlyph('[grid]B291');
      expect(b.warnings.some(w => w.code === 'MISPLACED_GLOBAL_OPTION')).toBe(true);
    });

    it('gains no warning from a rejected multi-glyph code', () => {
      // pins accept-only forwarding: the old parser forwarded the parse
      // warnings before the glyph-count check threw, leaking them
      const b = new BlissSVGBuilder('B208');
      expect(() => b.group(0).replaceGlyph(0, '[grid]B291/B208'))
        .toThrow('Expected a single glyph, but code "[grid]B291/B208" produced 2 glyphs');
      expect(b.warnings.some(w => w.code === 'MISPLACED_GLOBAL_OPTION')).toBe(false);
    });
  });

  describe('when a single-glyph code carries character-scope decorations', () => {
    it('passes char-scope options through onto the glyph', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('[color=red]B100');
      expect(b.toJSON().groups[0].glyphs[1].options).toEqual({ color: 'red' });
      expect(b.toString()).toBe(new BlissSVGBuilder('B291/[color=red]B100').toString());
    });

    it('passes the head-marker suffix through onto the glyph', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('B313^');
      expect(b.toJSON().groups[0].glyphs[1].isHeadGlyph).toBe(true);
      expect(b.toString()).toBe(new BlissSVGBuilder('B291/B313^').toString());
    });

    it('passes a coordinate suffix through onto the part', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('B100:2,3');
      const part = b.toJSON().groups[0].glyphs[1].parts[0];
      expect(part.x).toBe(2);
      expect(part.y).toBe(3);
      expect(b.toString()).toBe(new BlissSVGBuilder('B291/B100:2,3').toString());
    });
  });

  describe('when builder.addGlyph targets an empty builder', () => {
    it('applies options to the glyph itself, matching the non-empty route', () => {
      // formerly routed through addGroup, landing the options on the GROUP
      // ([color=red]|B100); the glyph family now creates at its own level
      const b = new BlissSVGBuilder('');
      b.addGlyph('B100', { color: 'red' });
      expect(b.toString()).toBe('[color=red]B100');
      const group = b.toJSON().groups[0];
      expect(group.options).toBeUndefined();
      expect(group.glyphs[0].options).toEqual({ color: 'red' });
    });
  });
});
