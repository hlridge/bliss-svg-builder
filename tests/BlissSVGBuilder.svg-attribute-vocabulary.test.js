/**
 * Pins the vocabulary of attribute names a standard owns, and the lookup that
 * resolves any casing or hyphenation of one back to its owner's spelling.
 *
 * Covers:
 * - The lookup is unambiguous: every name in the vocabulary has its own
 *   normalized key, so no two names can ever answer to the same written form.
 * - Resolving a written name to the owner's spelling across all three shapes a
 *   standard uses (camelCase `viewBox`, hyphenated `stroke-dasharray`, and the
 *   compound-lowercase `hreflang`/`referrerpolicy` that no shape rule recovers).
 * - Answering "nobody owns this" for an author's own name, which is what keeps
 *   a made-up name emitting exactly as written.
 * - The declared element basis matching the elements the library actually
 *   emits, by equality, so a feature that emits a new element cannot silently
 *   leave the vocabulary short.
 * - The vocabulary covering every link attribute the library routes onto an
 *   `<a>`, which the upstream SVG 1.1 source does not carry.
 *
 * Does NOT cover:
 * - Any effect on rendered output. This module is pure data plus one pure
 *   function and is wired to nothing yet; the ingest behaviour lands in the
 *   next task and is pinned alongside it in this file.
 * - Curated option names (`margin-top`), which the library owns rather than a
 *   standard, see `BlissSVGBuilder.option-spelling.test.js`.
 * - Namespaced names (`xlink:href`, `xml:lang`), deliberately outside the
 *   vocabulary because the option-key grammar splits them on the colon before
 *   any lookup could see them.
 */

import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import {
  SVG_ATTRIBUTE_NAMES,
  SVG_ELEMENT_BASIS,
  normalizeAttributeName,
  svgAttributeSpelling,
} from '../src/lib/bliss-svg-attribute-names.js';

// The library's own link attributes, restated rather than imported, so this
// file fails if either side moves. They are SVG 2 names on <a>; the SVG 1.1
// source the rest of the vocabulary is generated from has no entry for them.
const LINK_ATTRIBUTES = ['href', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy'];

// One input per element in the basis, so the equality assertion below is only
// as honest as this list is complete.
const REACHING_INPUTS = [
  'B291',
  '[grid]||B291',
  '[background=red]||B291',
  '[href=https://example.com]||B291',
  '[svg-title=Title;svg-desc=Description]||B291',
  'Xλ',
  'ZZZUNKNOWN',
  'B449;B81/B451;;B99',
  '[grid;background=red;svg-title=T;svg-desc=D;href=https://example.com;text=cap]||B449;B81/B451;;B99',
];

const elementsEmittedBy = (inputs) => {
  const emitted = new Set();
  for (const input of inputs) {
    for (const match of new BlissSVGBuilder(input).svgCode.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)[\s/>]/g)) {
      emitted.add(match[1]);
    }
  }
  return emitted;
};

describe('BlissSVGBuilder SVG attribute vocabulary', () => {
  describe('when a written name is resolved to its owner', () => {
    it.each([
      ['viewBox', 'viewBox'],
      ['view-box', 'viewBox'],
      ['viewbox', 'viewBox'],
      ['VIEWBOX', 'viewBox'],
      ['strokeDasharray', 'stroke-dasharray'],
      ['stroke-dasharray', 'stroke-dasharray'],
      ['preserveAspectRatio', 'preserveAspectRatio'],
      ['preserve-aspect-ratio', 'preserveAspectRatio'],
      ['hrefLang', 'hreflang'],
      ['referrerPolicy', 'referrerpolicy'],
    ])('resolves %s to the owner spelling %s', (written, owner) => {
      expect(svgAttributeSpelling(written)).toBe(owner);
    });

    it('answers undefined for a name nobody owns', () => {
      expect(svgAttributeSpelling('myOwnAttr')).toBeUndefined();
      expect(svgAttributeSpelling('dataAttr')).toBeUndefined();
      expect(svgAttributeSpelling('data-attr')).toBeUndefined();
    });

    it('answers undefined for a curated option the library owns instead', () => {
      expect(svgAttributeSpelling('margin-top')).toBeUndefined();
      expect(svgAttributeSpelling('marginTop')).toBeUndefined();
    });
  });

  describe('when the vocabulary is checked for ambiguity', () => {
    it('produces one distinct normalized key per name', () => {
      const keys = new Set([...SVG_ATTRIBUTE_NAMES].map(normalizeAttributeName));
      expect(keys.size).toBe(SVG_ATTRIBUTE_NAMES.size);
    });

    it('normalizes by stripping hyphens and lowercasing, and nothing else', () => {
      expect(normalizeAttributeName('stroke-dasharray')).toBe('strokedasharray');
      expect(normalizeAttributeName('viewBox')).toBe('viewbox');
      expect(normalizeAttributeName('VIEW-BOX')).toBe('viewbox');
      expect(normalizeAttributeName('myOwnAttr')).toBe('myownattr');
    });

    it('carries no namespaced name, which the option-key grammar splits before any lookup', () => {
      expect([...SVG_ATTRIBUTE_NAMES].filter((name) => name.includes(':'))).toEqual([]);
    });
  });

  describe('when the vocabulary is checked against what the library emits', () => {
    it('covers every link attribute the library routes onto an anchor', () => {
      const missing = LINK_ATTRIBUTES.filter((name) => svgAttributeSpelling(name) !== name);
      expect(missing).toEqual([]);
    });

    // Goes red the day a feature emits an element nobody added to the basis.
    // Equality, not subset: a subset assertion passes when an element goes
    // unreachable, which would hide a feature being removed.
    it('emits no element outside the declared basis, and reaches every element in it', () => {
      expect([...elementsEmittedBy(REACHING_INPUTS)].sort()).toEqual([...SVG_ELEMENT_BASIS].sort());
    });
  });
});
