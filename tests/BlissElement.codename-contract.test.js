import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/index.js';
import { BlissElement } from '../src/lib/bliss-element.js';
import { BlissParser } from '../src/lib/bliss-parser.js';

/**
 * Pins the snapshot-side `codeName`/`char` contract for BlissElement
 * inputs across glyph types (Bliss, external-glyph text-fallback,
 * shape) and across construction surfaces (BlissSVGBuilder string
 * input, BlissSVGBuilder JSON input, parser-driven direct BlissElement,
 * raw-object direct BlissElement). Glyph- and part-level `codeName`
 * always surface the user-written form (e.g. `Xα`), never the internal
 * `XTXT_α` routing key. The `XTXT_` token must not leak through any
 * public surface (`toString`, `toJSON`, `snapshot`), and JSON / string
 * round-trips preserve the user-written form. Legacy data written
 * before the cleanup (raw `XTXT_` form) still routes correctly for
 * back-compat, whether arriving via JSON to BlissSVGBuilder or via raw
 * object to BlissElement directly.
 *
 * Covers:
 * - Glyph-level `codeName`/`char` for single-char text-fallback (`Xα`).
 * - Glyph-level emptiness for multi-char text-fallback (`Xhαllo`),
 *   reflecting "text, not a glyph".
 * - Part-level `codeName` exposes user-written form, not `XTXT_*`.
 * - `XTXT_` non-leak through `toString()`, `toJSON()` (deep
 *   stringification), and the snapshot tree (recursive walk).
 * - Round-trips through `toString()` and `toJSON()` preserve
 *   user-written form and yield identical `svgCode`.
 * - Legacy JSON with raw `XTXT_*` form normalizes back to user-written
 *   form on rebuild.
 * - Direct BlissElement construction (parser-driven and raw-object):
 *   codeName surfaces the B-code on a Bliss glyph, the user-written
 *   code on a fallback glyph, and an empty string on a shape glyph;
 *   legacy raw-object input with `XTXT_*` glyphCode / part codeName
 *   normalizes to user-written form and the part is marked a shape.
 *
 * Does NOT cover:
 * - The level/flag taxonomy, see `BlissElement.taxonomy.test.js`.
 * - The handle-side mirror of these contracts, see
 *   `ElementHandle.taxonomy.test.js`.
 * - Rendering-side fallback layout, see
 *   `BlissSVGBuilder.text-fallback.test.js`.
 */
describe('BlissElement snapshot codeName contract', () => {
  describe('when probing codeName for text-fallback glyphs at glyph level', () => {
    it('surfaces the input code on a single-char text-fallback glyph (Xα)', () => {
      const b = new BlissSVGBuilder('Xα');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.codeName).toBe('Xα');
      expect(glyph.char).toBe('α');
    });

    it('returns empty codeName and char on a multi-char text-fallback glyph (it is text, not a glyph)', () => {
      const b = new BlissSVGBuilder('Xhαllo');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      expect(glyph.isGlyph).toBe(true);
      expect(glyph.isExternalGlyph).toBe(true);
      expect(glyph.codeName).toBe('');
      expect(glyph.char).toBe('');
    });
  });

  describe('when probing codeName for text-fallback glyphs at part level', () => {
    it('exposes the user-written single-char form (Xα), not the XTXT_α routing key', () => {
      const b = new BlissSVGBuilder('Xα');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      const part = glyph.children[0];
      expect(part.isPart).toBe(true);
      expect(part.codeName).toBe('Xα');
    });

    it('exposes the user-written multi-char form (Xhαllo), not XTXT_αllo', () => {
      const b = new BlissSVGBuilder('Xhαllo');
      const glyph = b.elements.children[0].children.find(c => c.level === 2);
      const part = glyph.children[0];
      expect(part.isPart).toBe(true);
      expect(part.codeName).toBe('Xhαllo');
    });
  });

  describe('when constructing a BlissElement directly', () => {
    it('surfaces the B-code on a Bliss glyph, the user-written code on a fallback glyph, and an empty codeName on a shape glyph', () => {
      const element = new BlissElement(BlissParser.parse('B291/Xα/HL2'));
      const [blissGlyph, fallbackGlyph, shapeGlyph] = element.children[0].children;

      expect(blissGlyph.codeName).toBe('B291');
      expect(fallbackGlyph.codeName).toBe('Xα');
      expect(fallbackGlyph.char).toBe('α');
      expect(shapeGlyph.codeName).toBe('');
      expect(element.getSvgContent()).toContain('<text');
      expect(element.getSvgContent()).toContain('>α</text>');
    });

    it('normalizes legacy XTXT_ raw-object input to user-written codeName and marks the part as a shape', () => {
      const element = new BlissElement({
        groups: [{
          glyphs: [{
            glyphCode: 'XTXT_α',
            parts: [{ codeName: 'XTXT_α' }]
          }]
        }]
      });
      const glyph = element.children[0].children[0];
      const part = glyph.children[0];

      expect(glyph.codeName).toBe('Xα');
      expect(part.codeName).toBe('Xα');
      expect(part.isShape).toBe(true);
      expect(element.getSvgContent()).toContain('>α</text>');
    });
  });

  describe('when serializing text-fallback inputs through any public surface', () => {
    // Inputs that internally generate XTXT_ routing keys.
    const cases = [
      'Xα',           // single Greek
      'Xhαllo',       // mixed multi-char with non-ASCII
      'Xéllo',        // mixed multi-char (é falls back depending on alphabet)
      'B313/Xα',      // mixed B-code + fallback
      'B313/Xα/B81',  // sandwiched
    ];

    for (const input of cases) {
      describe(`given input "${input}"`, () => {
        it('emits no XTXT_ marker in toString() output', () => {
          const out = new BlissSVGBuilder(input).toString();
          expect(out).not.toContain('XTXT_');
        });

        it('emits no XTXT_ marker in toJSON() output (deep stringification check)', () => {
          const json = new BlissSVGBuilder(input).toJSON();
          expect(JSON.stringify(json)).not.toContain('XTXT_');
        });

        it('emits no XTXT_ marker in any codeName or char field of the snapshot tree', () => {
          const root = new BlissSVGBuilder(input).snapshot();
          const visit = (node) => {
            expect(node.codeName ?? '').not.toContain('XTXT_');
            expect(node.char ?? '').not.toContain('XTXT_');
            for (const c of node.children ?? []) visit(c);
          };
          visit(root);
        });
      });
    }
  });

  describe('when round-tripping text-fallback through toJSON or toString', () => {
    it('preserves single-char fallback Xα in toJSON parts[0].codeName', () => {
      const json = new BlissSVGBuilder('Xα').toJSON();
      expect(json.groups[0].glyphs[0].parts[0].codeName).toBe('Xα');
    });

    it('preserves multi-char fallback Xhαllo in toJSON parts[0].codeName', () => {
      const json = new BlissSVGBuilder('Xhαllo').toJSON();
      expect(json.groups[0].glyphs[0].parts[0].codeName).toBe('Xhαllo');
    });

    it('roundtrips a JSON object input back to the same user-written codeName and svgCode', () => {
      // Reads back as the same public-form codeName, proving the
      // X<chars> → XTXT_<chars> normalization at JSON-input time keeps
      // the round-trip fully closed at the public surface.
      const original = new BlissSVGBuilder('Xα');
      const rebuilt = new BlissSVGBuilder(original.toJSON());
      expect(rebuilt.glyph(0).codeName).toBe('Xα');
      expect(rebuilt.glyph(0).part(0).codeName).toBe('Xα');
      expect(rebuilt.glyph(0).char).toBe('α');
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('roundtrips a string input back to the same user-written codeName and svgCode', () => {
      const original = new BlissSVGBuilder('Xα');
      const rebuilt = new BlissSVGBuilder(original.toString());
      expect(rebuilt.glyph(0).codeName).toBe('Xα');
      expect(rebuilt.glyph(0).part(0).codeName).toBe('Xα');
      expect(rebuilt.svgCode).toBe(original.svgCode);
    });

    it('normalizes legacy JSON with raw XTXT_ form to user-written form (back-compat)', () => {
      // Pre-cleanup releases serialized 'XTXT_α' at glyph- and part-level.
      // The JSON-input normalizer's early-return for already-internal form
      // means such old data still loads.
      const legacy = {
        groups: [{ glyphs: [{ codeName: 'XTXT_α', parts: [{ codeName: 'XTXT_α' }] }] }],
        options: {},
      };
      const b = new BlissSVGBuilder(legacy);
      expect(b.glyph(0).codeName).toBe('Xα');
      expect(b.glyph(0).part(0).codeName).toBe('Xα');
      expect(b.svgCode).toBe(new BlissSVGBuilder('Xα').svgCode);
    });
  });
});
