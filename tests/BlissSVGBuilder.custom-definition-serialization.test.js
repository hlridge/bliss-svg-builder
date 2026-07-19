import { describe, it, expect, afterEach } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';

/**
 * Pins the custom-definition serialization contract (run-to-stable Phase 2.3b):
 * default output decomposes to what exists at the receiving end, while
 * `{ preserve: true }` keeps every user-written custom name locally, including
 * a single-reference name whose target is a primitive (`MYIND` -> `C2`).
 *
 * Covers:
 * - Preserve keeping single-reference custom names on every input surface
 *   (DSL part slot, object input, addPart, coordinate/option decoration,
 *   `;;` flatten, standalone glyph).
 * - Default emission staying decomposed and byte-stable, with no internal
 *   alias metadata in either toJSON mode.
 * - Indicator metadata loss through default decomposition pinned as designed
 *   (metadata never travels; a decomposed custom indicator reparses as plain
 *   ink), with preserve as the same-environment remedy.
 * - Preserved names surviving mutation rebuilds and merge().
 * - Reparse of a preserved name without its definition (warn + stable string).
 *
 * Does NOT cover:
 * - `type: 'glyph'` identity mechanics and indicator-delta serialization, see
 *   `BlissSVGBuilder.custom-glyphs.test.js`.
 * - Typeless alias default-mode transparency, see
 *   `BlissSVGBuilder.custom-aliases.test.js`.
 * - Indicator-ness carrying through aliases at render (`;;` acceptance,
 *   applyIndicators, addPart parity), see
 *   `BlissSVGBuilder.alias-indicator.test.js`.
 * - `define()` validation rules, see `BlissSVGBuilder.define-hardening.test.js`
 *   and `BlissSVGBuilder.define-codestring-content.test.js`.
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

// The ratified docs example: a user-defined indicator aliasing one primitive.
const defineMyind = () =>
  defineAndTrack({ MYIND: { type: 'glyph', isIndicator: true, codeString: 'C2' } });

describe('BlissSVGBuilder custom definition serialization', () => {

  describe('when preserve serializes a single-reference custom name', () => {
    it('keeps a custom indicator name whose target is a primitive', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;MYIND');
      expect(b.toString({ preserve: true })).toBe('B291;MYIND');
      expect(b.warnings).toEqual([]);
    });

    it('keeps a shape alias name whose target is a primitive', () => {
      defineAndTrack({ MYSH: { type: 'shape', codeString: 'C8' } });
      expect(new BlissSVGBuilder('B291;MYSH').toString({ preserve: true })).toBe('B291;MYSH');
    });

    it('keeps a typeless flagged alias name whose target is a primitive', () => {
      defineAndTrack({ FLAGALIAS: { isIndicator: true, codeString: 'C2' } });
      expect(new BlissSVGBuilder('B291;FLAGALIAS').toString({ preserve: true }))
        .toBe('B291;FLAGALIAS');
    });

    it('keeps the name in preserve toJSON output', () => {
      defineMyind();
      const json = new BlissSVGBuilder('B291;MYIND').toJSON({ preserve: true });
      expect(json.groups[0].glyphs[0].parts[1].codeName).toBe('MYIND');
    });

    it('carries a coordinate suffix and a part option on the preserved name', () => {
      defineMyind();
      expect(new BlissSVGBuilder('B291;MYIND:3,4').toString({ preserve: true }))
        .toBe('B291;MYIND:3,4');
      expect(new BlissSVGBuilder('B291;[color=red]>MYIND').toString({ preserve: true }))
        .toBe('B291;[color=red]>MYIND');
    });

    it('keeps a standalone custom name under preserve', () => {
      defineMyind();
      const b = new BlissSVGBuilder('MYIND');
      expect(b.toString()).toBe('C2');
      expect(b.toString({ preserve: true })).toBe('MYIND');
    });

    it('bakes the preserved name onto the head under flattenIndicators', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;;MYIND');
      expect(b.toString()).toBe('B291;;MYIND');
      expect(b.toString({ flattenIndicators: true })).toBe('B291;C2');
      expect(b.toString({ flattenIndicators: true, preserve: true })).toBe('B291;MYIND');
    });

    it('bakes a composed-target alias name under flattenIndicators with preserve', () => {
      defineAndTrack({ BAREIND: { codeString: 'B81', isIndicator: true } });
      const b = new BlissSVGBuilder('B291;;BAREIND');
      expect(b.toString({ flattenIndicators: true })).toBe('B291;B81');
      expect(b.toString({ flattenIndicators: true, preserve: true })).toBe('B291;BAREIND');
      // matches the `;`-slot twin: `B291;BAREIND` preserve keeps the name
    });

    it('does not stamp a multi-part overlay name onto its first merged part', () => {
      defineAndTrack({ COMBI: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' } });
      const b = new BlissSVGBuilder('B291;;COMBI');
      // pre-existing: the word-overlay merge keeps only the first part of a
      // multi-part custom compound (backlog: custom compound `;;` anatomy
      // truncation). Restoring COMBI here would emit a string that reparses
      // to MORE ink than the original renders, so the name must stay off.
      expect(b.toString({ flattenIndicators: true, preserve: true })).toBe('B291;B97');
      // pins the single-part guard on the overlay alias stamp
    });
  });

  describe('when preserve serializes API-built and object-input content', () => {
    it('emits byte-identical preserve output for addPart and the DSL form', () => {
      defineMyind();
      const dsl = new BlissSVGBuilder('B291;MYIND');
      const api = new BlissSVGBuilder('B291');
      api.glyph(0).addPart('MYIND');
      expect(api.toString({ preserve: true })).toBe('B291;MYIND');
      expect(api.toString({ preserve: true })).toBe(dsl.toString({ preserve: true }));
    });

    it('keeps the name for object input with unexpanded parts', () => {
      defineMyind();
      const b = new BlissSVGBuilder({
        groups: [{ glyphs: [{ parts: [{ codeName: 'B291' }, { codeName: 'MYIND' }] }] }],
      });
      expect(b.toString({ preserve: true })).toBe('B291;MYIND');
      // pins the object-input expansion site; the DSL pins cannot kill it
    });

    it('keeps the name when reconstructing from preserve toJSON output', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;MYIND');
      const rebuilt = new BlissSVGBuilder(b.toJSON({ preserve: true }));
      expect(rebuilt.svgCode).toBe(b.svgCode);
      expect(rebuilt.toString({ preserve: true })).toBe('B291;MYIND');
    });
  });

  describe('when default output decomposes to what exists', () => {
    it('emits the resolved primitive and stays byte-stable across reparses', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;MYIND');
      expect(b.toString()).toBe('B291;C2');
      expect(new BlissSVGBuilder(b.toString()).toString()).toBe('B291;C2');
    });

    it('keeps default toJSON free of alias metadata', () => {
      defineMyind();
      const part = new BlissSVGBuilder('B291;MYIND').toJSON().groups[0].glyphs[0].parts[1];
      expect(part.codeName).toBe('C2');
      expect(Object.hasOwn(part, '_aliasCodeName')).toBe(false);
    });

    it('keeps preserve toJSON free of alias metadata after the restore', () => {
      defineMyind();
      const part = new BlissSVGBuilder('B291;MYIND')
        .toJSON({ preserve: true }).groups[0].glyphs[0].parts[1];
      expect(part.codeName).toBe('MYIND');
      expect(Object.hasOwn(part, '_aliasCodeName')).toBe(false);
    });

    it('keeps a getPath primitive name verbatim in both modes', () => {
      // note: a new primitive has nothing to decompose to, so the bare name is
      // the only serialized form (unrenderable without the definition).
      defineAndTrack({ QPRIM: { getPath: (x, y) => `M${x},${y}h2v2h-2Z`, width: 2, height: 2 } });
      const b = new BlissSVGBuilder('B291;QPRIM');
      expect(b.toString()).toBe('B291;QPRIM');
      expect(b.toString({ preserve: true })).toBe('B291;QPRIM');
    });

    it('keeps a name resolving to a composed indicator in preserve only', () => {
      defineAndTrack({ BAREIND: { codeString: 'B81', isIndicator: true } });
      const b = new BlissSVGBuilder('B291;BAREIND');
      expect(b.toString()).toBe('B291;B81');
      expect(b.toString({ preserve: true })).toBe('B291;BAREIND');
    });
  });

  describe('when default decomposition loses indicator metadata by design', () => {
    it('reparses the decomposed single reference as plain ink', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;MYIND');
      // metadata never travels: 'B291;C2' carries no indicator flag
      expect(new BlissSVGBuilder(b.toString()).svgCode).not.toBe(b.svgCode);
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });

    it('reparses the decomposed compound indicator as plain parts', () => {
      defineAndTrack({ COMBI: { type: 'glyph', isIndicator: true, codeString: 'B97;B99:3,0' } });
      const b = new BlissSVGBuilder('B291;COMBI');
      expect(b.toString()).toBe('B291;B97;B99:3,0');
      // the atomic indicator flag does not survive decomposition (designed;
      // supersedes the former Phase 2.5 row)
      expect(new BlissSVGBuilder(b.toString()).svgCode).not.toBe(b.svgCode);
      expect(new BlissSVGBuilder(b.toString({ preserve: true })).svgCode).toBe(b.svgCode);
    });
  });

  describe('when preserved names flow through mutation and merge', () => {
    it('survives an unrelated mutation rebuild', () => {
      defineMyind();
      const b = new BlissSVGBuilder('B291;MYIND');
      b.addGroup('B208');
      expect(b.toString({ preserve: true })).toBe('B291;MYIND//B208');
    });

    it('survives merge into another builder', () => {
      defineMyind();
      const target = new BlissSVGBuilder('B208');
      target.merge(new BlissSVGBuilder('B291;MYIND'));
      expect(target.toString({ preserve: true })).toBe('B208//B291;MYIND');
    });
  });

  describe('when the definition is absent at reparse', () => {
    it('warns UNKNOWN_CODE and keeps the preserved string stable', () => {
      defineAndTrack({ GONEIND: { type: 'glyph', isIndicator: true, codeString: 'C2' } });
      const emitted = new BlissSVGBuilder('B291;GONEIND').toString({ preserve: true });
      BlissSVGBuilder.removeDefinition('GONEIND');
      const foreign = new BlissSVGBuilder(emitted);
      expect(emitted).toBe('B291;GONEIND');
      expect(foreign.warnings.map(w => w.code)).toContain('UNKNOWN_CODE');
      expect(foreign.toString()).toBe('B291;GONEIND');
    });
  });
});
