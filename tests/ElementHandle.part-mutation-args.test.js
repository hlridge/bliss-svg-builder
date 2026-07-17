/**
 * Pins the singular-argument contract for the part-level mutation family
 * (glyph handle addPart/insertPart/replacePart, part handle replace, group
 * handle delegation, builder addPart): exactly one parsed part per call,
 * empty/omitted code throws a teaching error (a part references a shape and
 * cannot be empty), non-string args throw a designed TypeError, rejected
 * calls leave the builder untouched, and a part aimed at a group with no
 * glyphs fills it through a carrier glyph instead of being dropped.
 *
 * Covers:
 * - '' / whitespace / omitted throw the teaching message (the why plus the
 *   addGlyph('') alternative) on every surface, including empty builders
 *   (validation precedes routing)
 * - multi-part literals (B81;B97) throw the produced count; a composed
 *   definition alias stays ONE kept COMPOSITE_AS_PART error part (the
 *   ;-part slot keeps the alias as a single operand)
 * - a word arg stays the kept WORD_AS_PART error part on non-empty AND
 *   empty builders (uniform routing)
 * - single-part decorations pass through ([opts]>CODE, :x,y, opts param)
 *   and the char-scope spelling keeps failing like its DSL twin
 * - artifacts above part level throw on every surface: document-level
 *   options ([opts]||), word-level options ([opts]|), word indicator lists
 *   (;;), head markers (^), and fail-flagged args; a word arg with an
 *   overlay suffix stays on the WORD_AS_PART path (the word row wins)
 * - degenerate parses keep their messages (no glyphs, multiple groups)
 * - designed TypeErrors name the called method on every surface; a wrong-level
 *   gated target stays a silent no-op (a fail-flagged word is no longer a
 *   gated target: retention family rows 31/80 drop it at rebuild)
 * - R1 carrier fill: addPart/insertPart on a glyphless group creates a
 *   carrier glyph; a rejected arg leaves no scaffold behind
 * - empty-builder addPart applies options to the part itself
 * - accepted args forward parse warnings; rejected args leak none
 *
 * Does NOT cover:
 * - glyph-family singular rules, see ElementHandle.glyph-mutation-args.test.js
 * - group-family singular rules, see BlissSVGBuilder.group-mutation-args.test.js
 * - deep COMPOSITE_AS_PART semantics (placeholders, exemptions, leading-part
 *   flattening), see BlissSVGBuilder.composite-part.test.js
 * - fail-flagged TARGET no-ops across all mutators, see
 *   ElementHandle.failed-word-mutation.test.js
 * - cross-surface empty-content parity, see
 *   BlissSVGBuilder.empty-content-parity.test.js
 *
 * @issue: #33
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

beforeAll(() => {
  BlissSVGBuilder.define({ TPAIR: { codeString: 'B81;B97' } });
});

afterAll(() => {
  BlissSVGBuilder.removeDefinition('TPAIR');
});

const stateOf = (b) => JSON.stringify(b.toJSON());

const viewBoxWidth = (b) =>
  Number(b.svgCode.match(/viewBox="[^"]+ [^"]+ ([^" ]+) [^"]+"/)[1]);

const SURFACES = [
  { label: 'glyph(0).addPart', method: 'addPart', invoke: (b, ...args) => b.group(0).glyph(0).addPart(...args) },
  { label: 'glyph(0).insertPart(0, ...)', method: 'insertPart', invoke: (b, ...args) => b.group(0).glyph(0).insertPart(0, ...args) },
  { label: 'glyph(0).replacePart(0, ...)', method: 'replacePart', invoke: (b, ...args) => b.group(0).glyph(0).replacePart(0, ...args) },
  { label: 'part(0).replace', method: 'replace', invoke: (b, ...args) => b.group(0).glyph(0).part(0).replace(...args) },
  { label: 'group(0).addPart', method: 'addPart', invoke: (b, ...args) => b.group(0).addPart(...args) },
  { label: 'builder.addPart', method: 'addPart', invoke: (b, ...args) => b.addPart(...args) },
];
const EACH_SURFACE = SURFACES.map((s) => [s.label, s]);

describe('ElementHandle part mutation args', () => {
  describe('when the code is empty, whitespace-only, or omitted', () => {
    it.each(EACH_SURFACE)('%s throws the teaching message and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, '')).toThrow('Expected a single part, but code "" produced none');
      expect(() => invoke(b, '   ')).toThrow('Expected a single part, but code "" produced none');
      expect(() => invoke(b)).toThrow('Expected a single part, but code "" produced none');
      expect(stateOf(b)).toBe(before);
    });

    it('teaches why parts cannot be empty and names the addGlyph alternative', () => {
      // user-ratified requirement (design review R8): the message must explain,
      // not just count
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).addPart(''))
        .toThrow('A part is a reference to a shape and cannot be empty');
      expect(() => b.group(0).glyph(0).addPart('')).toThrow('addGlyph("")');
    });

    it('throws identically on an empty builder and leaves it empty', () => {
      // validation precedes the empty-builder routing: formerly this routed
      // through addGroup('') and quietly created an empty group
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart('')).toThrow('Expected a single part, but code "" produced none');
      expect(() => b.addPart()).toThrow('Expected a single part, but code "" produced none');
      expect(b.toJSON().groups).toEqual([]);
      expect(b.stats.groupCount).toBe(0);
    });
  });

  describe('when the code parses to more than one part', () => {
    it.each(EACH_SURFACE)('%s throws the produced part count and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'B81;B97'))
        .toThrow('Expected a single part, but code "B81;B97" produced 2 parts');
      expect(stateOf(b)).toBe(before);
    });

    it('leaves an empty builder empty when the code is rejected', () => {
      // commit-on-success routing: formerly created the whole composite glyph
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart('B81;B97'))
        .toThrow('Expected a single part, but code "B81;B97" produced 2 parts');
      expect(b.stats.groupCount).toBe(0);
      expect(b.toJSON().groups).toEqual([]);
    });
  });

  describe('when the code is a composed definition alias', () => {
    it('keeps the alias as one COMPOSITE_AS_PART error part instead of throwing', () => {
      // the ;-part slot receives the alias as a SINGLE operand, so the
      // singular rule accepts it and the existing kept-error contract applies
      // (sibling of the word row; deep coverage in
      // BlissSVGBuilder.composite-part.test.js)
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('TPAIR');
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[1].errorCode).toBe('COMPOSITE_AS_PART');
      expect(b.warnings.some((w) => w.code === 'COMPOSITE_AS_PART')).toBe(true);
      expect(b.toString()).toBe('B291;B81;B97');
    });
  });

  describe('when the code is a word', () => {
    it('keeps the word as one WORD_AS_PART error part and serializes the composition', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('B313/B1103');
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[1]).toEqual({
        codeName: 'B313/B1103',
        error: '"B313/B1103" is a word and cannot be composed with ;',
        errorCode: 'WORD_AS_PART',
      });
      expect(b.warnings.some((w) => w.code === 'WORD_AS_PART')).toBe(true);
      expect(b.toString()).toBe('B291;B313/B1103');
    });

    it('creates the same error part on an empty builder', () => {
      // uniform routing: formerly the empty-builder route went through
      // addGroup and created the whole word as valid content
      const b = new BlissSVGBuilder('');
      b.addPart('B313/B1103');
      expect(b.toJSON().groups[0].glyphs[0].parts[0].errorCode).toBe('WORD_AS_PART');
      expect(b.warnings.some((w) => w.code === 'WORD_AS_PART')).toBe(true);
    });
  });

  describe('when a single-part code carries decorations', () => {
    it('passes part-scope options through onto the part', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('[color=red]>B97');
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[1].options).toEqual({ color: 'red' });
      expect(b.toString()).toBe('B291;[color=red]>B97');
    });

    it('passes a coordinate suffix through onto the part', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('B97:2,3');
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[1].x).toBe(2);
      expect(parts[1].y).toBe(3);
      expect(b.toString()).toBe('B291;B97:2,3');
    });

    it('applies the opts parameter to the part like the DSL spelling', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('B97', { color: 'red' });
      expect(b.toJSON().groups[0].glyphs[0].parts[1].options).toEqual({ color: 'red' });
      expect(b.toString()).toBe('B291;[color=red]>B97');
    });

    it('fails the char-scope options spelling exactly like its DSL twin', () => {
      // note: '[color=red]B97' is the CHARACTER-scope spelling; in a part slot
      // it is invalid on both surfaces (G1) and surfaces UNKNOWN_CODE
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('[color=red]B97');
      expect(b.warnings.some((w) => w.code === 'UNKNOWN_CODE')).toBe(true);
      const twin = new BlissSVGBuilder('B291;[color=red]B97');
      expect(twin.warnings.some((w) => w.code === 'UNKNOWN_CODE')).toBe(true);
    });
  });

  describe('when the code carries an artifact above part level', () => {
    it.each(EACH_SURFACE)('%s rejects document-level options and leaves the builder untouched', (label, { invoke }) => {
      // the constructor applies "[opts]||" document options; a part arg has
      // no document to attach them to, so silently stripping them was loss
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, '[color=red]||B97')).toThrow('document-level options');
      expect(stateOf(b)).toBe(before);
    });

    it.each(EACH_SURFACE)('%s rejects word-level options and leaves the builder untouched', (label, { invoke }) => {
      // formerly stripped behind a MALFORMED_GROUP_OPTIONS warning from the
      // helper embedding; now rejected whole like the glyph family
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, '[color=red]|B97')).toThrow('word-level options');
      expect(stateOf(b)).toBe(before);
    });

    it.each(EACH_SURFACE)('%s rejects a word indicator list and leaves the builder untouched', (label, { invoke }) => {
      // formerly the helper embedding silently dropped the ;; overlay while
      // attaching the base part
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'B97;;B81')).toThrow('word-level indicator list');
      expect(stateOf(b)).toBe(before);
    });

    it('rejects a bare word indicator marker the same way', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart('B97;;')).toThrow('word-level indicator list');
      expect(stateOf(b)).toBe(before);
    });

    it.each(EACH_SURFACE)('%s rejects a head marker and leaves the builder untouched', (label, { invoke }) => {
      // formerly the helper embedding silently dropped the ^ designation
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'B97^')).toThrow('head marker');
      expect(stateOf(b)).toBe(before);
    });

    it.each(EACH_SURFACE)('%s rejects a fail-flagged arg and leaves the builder untouched', (label, { invoke }) => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => invoke(b, 'B291;;B81;;B86')).toThrow('not a single valid part');
      expect(() => invoke(b, 'B291;;B81;;B86')).toThrow('MALFORMED_WORD_INDICATOR');
      expect(stateOf(b)).toBe(before);
    });

    it('points each rejection to its part-level alternative', () => {
      const b = new BlissSVGBuilder('B291');
      const addPart = (code) => () => b.group(0).glyph(0).addPart(code);
      expect(addPart('[color=red]||B97')).toThrow('builder input');
      expect(addPart('[color=red]|B97')).toThrow('[opts]>CODE');
      expect(addPart('B97;;B81')).toThrow('applyIndicators()');
      expect(addPart('B97^')).toThrow('CODE^');
      expect(addPart('B291;;B81;;B86')).toThrow('addGroup()');
    });

    it('keeps a word arg with an overlay suffix on the WORD_AS_PART path', () => {
      // the word row wins: multi-glyph args stay the kept error part even
      // when they also carry a word-level artifact
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('B313/B1103;;B81');
      const parts = b.toJSON().groups[0].glyphs[0].parts;
      expect(parts[1].errorCode).toBe('WORD_AS_PART');
      expect(b.warnings.some((w) => w.code === 'WORD_AS_PART')).toBe(true);
    });

    it('rejects artifacts identically on an empty builder and leaves it empty', () => {
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart('B97;;B81')).toThrow('word-level indicator list');
      expect(b.toJSON().groups).toEqual([]);
      expect(b.stats.groupCount).toBe(0);
    });
  });

  describe('when the code parses to no glyphs or multiple groups', () => {
    it('throws the no-glyphs message for a bare word-boundary token', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart('|'))
        .toThrow('Expected a single part, but code "|" produced no glyphs');
      expect(stateOf(b)).toBe(before);
    });

    it('throws the produced group count for a multi-group code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart('H//C8'))
        .toThrow('Expected parts within a single group, but code "H//C8" produced 3 groups');
      expect(stateOf(b)).toBe(before);
    });

    it('throws the produced zero group count for a global-options-only code', () => {
      // kills the group-count !==1 -> >1 mutant: a 0-group arg must not fall
      // through to the undefined first group
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).addPart('[color=red]||'))
        .toThrow('Expected parts within a single group, but code "[color=red]||" produced 0 groups');
      expect(stateOf(b)).toBe(before);
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

    it('names addPart from an empty builder instead of leaking the routing target', () => {
      // formerly routed to addGroup first, so the TypeError said addGroup()
      const b = new BlissSVGBuilder('');
      expect(() => b.addPart(42)).toThrow('addPart() requires a DSL code string');
      expect(b.toJSON().groups).toEqual([]);
    });
  });

  describe('when an arg reaches a gated target', () => {
    // A fail-flagged word is no longer a gated target: it is dropped at rebuild
    // (retention family, rows 31/80), so it never persists to be handle-reached.
    // The remaining gate is wrong-level: a part handle has no part-mutation arms,
    // so the level gate no-ops before ever reading the arg.
    it.each([
      ['part.addPart with a non-string arg', (p) => p.addPart(42)],
      ['part.addPart with a valid single-part code', (p) => p.addPart('B81')],
      ['part.addPart with an empty code', (p) => p.addPart('')],
      ['part.addPart with an omitted arg', (p) => p.addPart()],
      ['part.insertPart with a valid code', (p) => p.insertPart(0, 'B81')],
      ['part.insertPart with a non-string arg', (p) => p.insertPart(0, 42)],
      ['part.replacePart with a valid code', (p) => p.replacePart(0, 'B81')],
      ['part.replacePart with a non-string arg', (p) => p.replacePart(0, 42)],
    ])('silently no-ops %s (wrong-level gate precedes arg validation)', (label, act) => {
      // part handles have no part-mutation arms; the level gate never reads the arg
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => act(b.group(0).glyph(0).part(0))).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });
  });

  describe('when the target group has no glyphs', () => {
    it('fills the group through a carrier glyph via builder.addPart', () => {
      // regression: R1 (GH #33): this call used to drop B81 silently
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      b.addPart('B81');
      const filled = b.toJSON().groups[2];
      expect(filled.glyphs).toHaveLength(1);
      expect(filled.glyphs[0].parts[0].codeName).toBe('B81');
      expect(b.toString()).toBe('B291//B81');
      expect(b.warnings).toHaveLength(0);
      expect(viewBoxWidth(b)).toBe(viewBoxWidth(new BlissSVGBuilder('B291//B81')));
    });

    it('fills the group the same way via group.addPart', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      b.group(1).addPart('B81');
      expect(b.toJSON().groups[2].glyphs[0].parts[0].codeName).toBe('B81');
      expect(b.toString()).toBe('B291//B81');
    });

    it('fills the group the same way via group.insertPart', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      b.group(1).insertPart(0, 'B81');
      expect(b.toJSON().groups[2].glyphs[0].parts[0].codeName).toBe('B81');
      expect(b.toString()).toBe('B291//B81');
    });

    it('leaves no carrier behind when the arg is rejected', () => {
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      expect(() => b.addPart('B81;B97'))
        .toThrow('Expected a single part, but code "B81;B97" produced 2 parts');
      expect(b.toJSON().groups[2]).toEqual({ glyphs: [] });
    });

    it('leaves no carrier behind when insertPart rejects the arg', () => {
      // the insertPart carrier arm parses before any state change too
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      expect(() => b.group(1).insertPart(0, 'B81;B97'))
        .toThrow('Expected a single part, but code "B81;B97" produced 2 parts');
      expect(b.toJSON().groups[2]).toEqual({ glyphs: [] });
    });

    it('throws the designed TypeError for a non-string arg on the empty-group target', () => {
      // the carrier arm validates like any working arm: only fail-flagged and
      // wrong-level gates precede the arg guard
      const b = new BlissSVGBuilder('B291');
      b.addGroup('');
      expect(() => b.group(1).addPart(42)).toThrow('addPart() requires a DSL code string');
      expect(() => b.group(1).insertPart(0, 42)).toThrow('insertPart() requires a DSL code string');
      expect(b.toJSON().groups[2]).toEqual({ glyphs: [] });
    });
  });

  describe('when builder.addPart targets an empty builder', () => {
    it('creates the group and carrier glyph around the part', () => {
      const b = new BlissSVGBuilder('');
      b.addPart('B81');
      expect(b.stats.groupCount).toBe(1);
      expect(b.toJSON().groups[0].glyphs[0].parts[0].codeName).toBe('B81');
      expect(b.toString()).toBe('B81');
    });

    it('applies options to the part itself, matching the non-empty route', () => {
      // formerly routed through addGroup, landing the options on the GROUP
      // ([color=red]|B81); the part family now creates at its own level
      const b = new BlissSVGBuilder('');
      b.addPart('B81', { color: 'red' });
      expect(b.toString()).toBe('[color=red]>B81');
      const group = b.toJSON().groups[0];
      expect(group.options).toBeUndefined();
      expect(group.glyphs[0].parts[0].options).toEqual({ color: 'red' });
    });
  });

  describe('when replacePart targets an out-of-range index', () => {
    it('stays a silent no-op for an empty code', () => {
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).replacePart(99, '')).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('stays a clean no-op for a fractional index', () => {
      // a fractional in-range index passes a bare bounds check and used to
      // write a stray non-index property onto the raw parts array
      const b = new BlissSVGBuilder('B291;B97');
      b.group(0).glyph(0).replacePart(0.5, 'B81');
      expect(Object.keys(b.toJSON().groups[0].glyphs[0].parts)).toEqual(['0', '1']);
      expect(b.toString()).toBe('B291;B97');
    });

    it('stays a silent no-op even for a multi-part code', () => {
      // index no-op checks precede content validation in the replace family
      const b = new BlissSVGBuilder('B291');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(0).replacePart(99, 'B81;B97')).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('still throws the designed TypeError for a non-string code', () => {
      // a non-string arg is a malformed call: the TypeError guard precedes index checks
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).replacePart(99, 42)).toThrow(TypeError);
    });
  });

  describe('when replacePart targets a glyph with no parts', () => {
    it('stays a silent no-op for an empty code', () => {
      // the no-parts state check precedes the parse, so the teaching throw
      // never fires on a target with nothing to replace
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('');
      const before = stateOf(b);
      expect(() => b.group(0).glyph(1).replacePart(0, '')).not.toThrow();
      expect(stateOf(b)).toBe(before);
    });

    it('throws the designed TypeError for a non-string code', () => {
      // the TypeError guard precedes the no-parts state check (formerly a
      // silent no-op on this target)
      const b = new BlissSVGBuilder('B291');
      b.group(0).addGlyph('');
      expect(() => b.group(0).glyph(1).replacePart(0, 42))
        .toThrow('replacePart() requires a DSL code string');
    });
  });

  describe('when an accepted or rejected code carries a parse warning', () => {
    it('forwards the parse warning when the single part is accepted', () => {
      const b = new BlissSVGBuilder('B291');
      b.group(0).glyph(0).addPart('[margin=2]>B97');
      expect(b.warnings.some((w) => w.code === 'MISPLACED_GLOBAL_OPTION')).toBe(true);
    });

    it('gains no warning from a rejected multi-part code', () => {
      // pins accept-only forwarding: the old parser forwarded the helper
      // parse's warnings before the single-part check threw, leaking them
      const b = new BlissSVGBuilder('B291');
      expect(() => b.group(0).glyph(0).replacePart(0, '[margin=2]>B81;B97'))
        .toThrow('Expected a single part, but code "[margin=2]>B81;B97" produced 2 parts');
      expect(b.warnings.some((w) => w.code === 'MISPLACED_GLOBAL_OPTION')).toBe(false);
    });
  });
});
