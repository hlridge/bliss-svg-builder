import { describe, it, expect } from 'vitest';
import { BlissElement } from '../src/lib/bliss-element.js';

/**
 * Pins BlissElement serialization output formats. `toString()` emits a
 * flat DSL-like string with level delimiters (`;` between parts, `/`
 * between glyphs, `//` between groups) and `:x,y` position suffixes on
 * leaf parts; `toJSON()` emits a nested object tree with an `elements`
 * array at every container level and `codeName`/`width`/`x`/`y` on
 * each leaf part. Both serializers operate over the same element
 * tree, exposing the same content through two distinct shapes.
 *
 * Covers:
 * - `toString()` over a multi-group, multi-glyph element: parts joined
 *   with `;`, glyphs joined with `/`, groups joined with `//`, with a
 *   `:x,y` suffix wherever a leaf part carries non-default coordinates.
 * - `toJSON()` over the same input: every container level produces an
 *   `{ elements: [...] }` wrapper (root → groups → glyphs → parts),
 *   and each leaf part surfaces `codeName`, `width`, `x`, `y`.
 *
 * Does NOT cover:
 * - Snapshot tree shape (key, parentKey, level, isRoot / isGroup /
 *   isGlyph / isPart, frozen bounds, immutability), see
 *   `BlissElement.snapshots.test.js`.
 * - codeName / char surfaces and `XTXT_` non-leak through
 *   `toString` / `toJSON`, see
 *   `BlissElement.codename-contract.test.js`.
 * - Builder-level `toString()` and `toJSON()` over the parsed DSL
 *   tree (a different serializer on a different surface), see
 *   `BlissSVGBuilder.string-output.test.js` and
 *   `BlissSVGBuilder.json-output.test.js`.
 * - Round-trip identity through serialize → reconstruct → identical
 *   SVG, see `BlissSVGBuilder.round-trip.test.js`.
 */
describe('BlissElement serialization', () => {
  describe('when serializing a nested element to a string', () => {
    it('emits level delimiters and position suffixes', () => {
      const element = new BlissElement({
        groups: [
          {
            glyphs: [
              {
                parts: [
                  { codeName: 'HL2', x: 0, y: 0 },
                  { codeName: 'VL2', x: 2, y: 4 }
                ]
              },
              {
                parts: [{ codeName: 'HL2', x: 0, y: 5 }]
              }
            ]
          },
          {
            glyphs: [{
              parts: [{ codeName: 'C8', x: 1, y: 0 }]
            }]
          }
        ]
      });

      expect(element.toString()).toBe('HL2;VL2:2,4/HL2:0,5//C8:1,0');
    });
  });

  describe('when serializing a nested element to JSON', () => {
    it('emits nested elements arrays with leaf width and position', () => {
      const element = new BlissElement({
        groups: [
          {
            glyphs: [
              {
                parts: [
                  { codeName: 'HL2', x: 0, y: 0 },
                  { codeName: 'VL2', x: 2, y: 4 }
                ]
              },
              {
                parts: [{ codeName: 'HL2', x: 0, y: 5 }]
              }
            ]
          },
          {
            glyphs: [{
              parts: [{ codeName: 'C8', x: 1, y: 0 }]
            }]
          }
        ]
      });

      expect(element.toJSON()).toEqual({
        elements: [
          {
            elements: [
              {
                elements: [
                  { codeName: 'HL2', width: 2, x: 0, y: 0 },
                  { codeName: 'VL2', width: 0, x: 2, y: 4 }
                ]
              },
              {
                elements: [
                  { codeName: 'HL2', width: 2, x: 0, y: 5 }
                ]
              }
            ]
          },
          {
            elements: [
              {
                elements: [
                  { codeName: 'C8', width: 8, x: 1, y: 0 }
                ]
              }
            ]
          }
        ]
      });
    });
  });
});
