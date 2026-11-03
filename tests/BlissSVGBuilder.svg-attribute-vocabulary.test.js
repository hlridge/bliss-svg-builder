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
 * - Answering nothing for a standard's name on an element the library does not
 *   emit (`mode`, `kernelMatrix`), which is what keeps the vocabulary scoped to
 *   the basis rather than to all of SVG.
 * - The declared element basis matching the elements the library actually
 *   emits, by equality, so a feature that emits a new element cannot silently
 *   leave the vocabulary short.
 * - The vocabulary covering every link attribute the library routes onto an
 *   `<a>`, which the upstream SVG 1.1 source does not carry.
 * - Ingest: a standard's name written in any casing or hyphenation reaching the
 *   markup under its owner's spelling, silently, from a DSL bracket, from the
 *   options argument, and from a definition's defaults.
 * - The three cases the lookup must refuse: a name the library curates
 *   (`strokeWidth`), a `<target>--attribute` key, and a name nobody owns.
 * - The sixteen event handlers staying refused after canonicalization.
 *
 * Does NOT cover:
 * - Markup a custom `getPath` returns. A definition whose `getPath` returns a
 *   string starting with `<` is embedded verbatim, so that documented API can
 *   put an element outside the basis into the output today, not only some
 *   future feature. The vocabulary is unaffected because attributes written
 *   inside returned markup never pass through the option system, so the basis
 *   stays the union it needs to be. The equality row below covers what the
 *   library itself emits, which is the part the vocabulary depends on.
 * - Curated option names (`margin-top`), which the library owns rather than a
 *   standard, see `BlissSVGBuilder.option-spelling.test.js`. A curated name is
 *   pinned here only where it must beat a standard sharing it.
 * - Object input (`new BlissSVGBuilder(b.toJSON())`), which is cloned verbatim
 *   and joins the converting channels in a later task.
 * - `ARIA-LABEL` and other miscased HYPHENATED ARIA spellings. ARIA is matched
 *   by a pattern rather than a list, so it cannot go stale, and the pattern
 *   keys on the camelCase boundary (`ariaLabel`); a case-blind one would claim
 *   `arialFont`. The two spellings anyone writes, camelCase and correct kebab,
 *   both resolve.
 * - Namespaced names (`xlink:href`, `xml:lang`), deliberately outside the
 *   vocabulary because the option-key grammar splits them on the colon before
 *   any lookup could see them.
 * - Reserved names (`xmlns`, `data-generator`), which are refused rather than
 *   resolved, see `BlissSVGBuilder.document-namespace.test.js`.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { ANCHOR_ATTRIBUTE_NAMES, canonicalOptionKey } from '../src/lib/bliss-constants.js';
import {
  SVG_ATTRIBUTE_NAMES,
  SVG_ELEMENT_BASIS,
  normalizeAttributeName,
  svgAttributeSpelling,
} from '../src/lib/bliss-svg-attribute-names.js';

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
  // a CSS filter drawn as a native <filter> (#34), one value per primitive family
  '[filter=blur(1px) drop-shadow(1px 1px red) grayscale(1) invert(1) opacity(0.5)]B291',
];

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
      // the filter primitives the translation emits (#34) joined the basis
      ['std-deviation', 'stdDeviation'],
      ['filterunits', 'filterUnits'],
      ['table-values', 'tableValues'],
      // and the composite a drop-shadow is drawn with
      ['OPERATOR', 'operator'],
      ['IN2', 'in2'],
      ['K4', 'k4'],
    ])('resolves %s to the owner spelling %s', (written, owner) => {
      expect(svgAttributeSpelling(written)).toBe(owner);
    });

    it('answers undefined for a name nobody owns', () => {
      expect(svgAttributeSpelling('myOwnAttr')).toBeUndefined();
      expect(svgAttributeSpelling('dataAttr')).toBeUndefined();
      expect(svgAttributeSpelling('data-attr')).toBeUndefined();
    });

    // SVGO groups every filter primitive together, so the likely slip when the
    // basis grows is regenerating over all of them: these two would then join.
    it('answers undefined for a standard name on an element the library does not emit', () => {
      expect(svgAttributeSpelling('mode')).toBeUndefined();
      expect(svgAttributeSpelling('kernelMatrix')).toBeUndefined();
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
    // The vocabulary is generated from an SVG 1.1 source, which knows only
    // `xlink:href` on an anchor, so these names were added by hand. Imported
    // rather than restated: a copy of the list would only catch itself moving.
    it('covers every link attribute the library routes onto an anchor', () => {
      const missing = ANCHOR_ATTRIBUTE_NAMES.filter((name) => svgAttributeSpelling(name) !== name);
      expect(missing).toEqual([]);
    });

    // Goes red the day a feature emits an element nobody added to the basis.
    // Equality, not subset: a subset assertion passes when an element goes
    // unreachable, which would hide a feature being removed.
    it('emits no element outside the declared basis, and reaches every element in it', () => {
      const emitted = new Set();
      for (const input of REACHING_INPUTS) {
        for (const match of new BlissSVGBuilder(input).svgCode.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)[\s/>]/g)) {
          emitted.add(match[1]);
        }
      }
      expect([...emitted].sort()).toEqual([...SVG_ELEMENT_BASIS].sort());
    });
  });

  describe('when a standard owns the name written in a bracket', () => {
    it.each([
      ['[view-box=0 0 50 50]||B291', 'viewBox="0 0 50 50"', 'view-box='],
      ['[strokeDasharray=2 2]||B291', 'stroke-dasharray="2 2"', 'strokeDasharray'],
      ['[preserve-aspect-ratio=none]||B291', 'preserveAspectRatio="none"', 'preserve-aspect-ratio'],
      ['[ariaLabel=Feeling]||B291', 'aria-label="Feeling"', 'ariaLabel'],
    ])('emits %s under the owner spelling %s', (input, owned, asWritten) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toContain(owned);
      expect(builder.svgCode).not.toContain(asWritten);
      expect(builder.warnings).toEqual([]);
    });

    it('resolves it at character scope as well as global scope', () => {
      const builder = new BlissSVGBuilder('[strokeDasharray=2 2]B291');

      expect(builder.svgCode).toContain('stroke-dasharray="2 2"');
      expect(builder.svgCode).not.toContain('strokeDasharray');
    });

    it('resolves it in a part bracket', () => {
      const builder = new BlissSVGBuilder('B449;[strokeDasharray=2 2]>B81');

      expect(builder.svgCode).toContain('stroke-dasharray="2 2"');
      expect(builder.svgCode).not.toContain('strokeDasharray');
    });
  });

  describe('when a standard owns the name given programmatically', () => {
    it('resolves an ARIA name written the JavaScript way, silently', () => {
      const builder = new BlissSVGBuilder('B291', { ariaLabel: 'Feeling', role: 'img' });

      expect(builder.svgCode).toContain('aria-label="Feeling"');
      expect(builder.svgCode).toContain('role="img"');
      expect(builder.svgCode).not.toContain('ariaLabel');
      expect(builder.warnings).toEqual([]);
    });

    // The compound-lowercase shape no casing rule recovers: camelToKebab turns
    // hrefLang into href-lang, which is not an attribute anywhere.
    it('resolves the link names the upstream SVG 1.1 source never carried', () => {
      const builder = new BlissSVGBuilder('B291', {
        href: 'https://example.com', hrefLang: 'en', referrerPolicy: 'no-referrer',
      });

      expect(builder.svgCode).toContain('hreflang="en"');
      expect(builder.svgCode).toContain('referrerpolicy="no-referrer"');
      expect(builder.svgCode).not.toContain('hrefLang');
      expect(builder.svgCode).not.toContain('referrerPolicy');
      expect(builder.warnings).toEqual([]);
    });

    it.each([
      ['view-box', 'viewBox', '0 0 50 50'],
      ['strokeDasharray', 'stroke-dasharray', '2 2'],
      ['ariaLabel', 'aria-label', 'Feeling'],
      ['preserve-aspect-ratio', 'preserveAspectRatio', 'none'],
    ])('renders %s and %s identically on both surfaces', (written, owner, value) => {
      const expected = new BlissSVGBuilder(`[${owner}=${value}]||B291`).svgCode;

      expect(new BlissSVGBuilder(`[${written}=${value}]||B291`).svgCode).toBe(expected);
      expect(new BlissSVGBuilder('B291', { [written]: value }).svgCode).toBe(expected);
      expect(new BlissSVGBuilder('B291', { [owner]: value }).svgCode).toBe(expected);
    });
  });

  describe('when an ARIA name is written the JavaScript way', () => {
    // Every ARIA state and property is `aria-` plus ONE lowercase token with no
    // internal hyphen (53 names, WAI-ARIA 1.2), so the transform lowercases the
    // remainder whole. Hyphenating at the capitals instead would invent
    // aria-value-now, aria-labelled-by and aria-has-popup, none of which exist.
    it.each([
      ['ariaLabel', 'aria-label'],
      ['ariaHidden', 'aria-hidden'],
      ['ariaValueNow', 'aria-valuenow'],
      ['ariaLabelledBy', 'aria-labelledby'],
      ['ariaDescribedBy', 'aria-describedby'],
      ['ariaHasPopup', 'aria-haspopup'],
      ['ariaRowSpan', 'aria-rowspan'],
    ])('resolves %s to the real ARIA attribute %s', (written, real) => {
      const builder = new BlissSVGBuilder('B291', { [written]: 5 });

      expect(builder.svgCode).toContain(`${real}="5"`);
      expect(builder.svgCode).not.toContain(written);
      expect(builder.svgCode).not.toMatch(/aria-\w+-\w+=/);
    });

    it('leaves a name that merely begins with those four letters alone', () => {
      const builder = new BlissSVGBuilder('B291', { arialFont: 'x' });

      expect(builder.svgCode).toContain('arialFont="x"');
      expect(builder.svgCode).not.toContain('aria-');
    });
  });

  describe('when a curated option and a standard own the same name', () => {
    it('lets the curated option win the shared name', () => {
      const builder = new BlissSVGBuilder('[stroke-width=2]||B291');

      expect(builder.svgCode).toContain('stroke-width="2"');
      expect(new BlissSVGBuilder('B291', { strokeWidth: 2 }).svgCode).toBe(builder.svgCode);
    });

    it('keeps our color meaning stroke, with the standard one behind a layer prefix', () => {
      const ours = new BlissSVGBuilder('[color=red]||B291');
      const standards = new BlissSVGBuilder('[root--color=red]||B291');

      expect(ours.svgCode).toContain('stroke="red"');
      expect(ours.svgCode).not.toMatch(/\scolor="/);
      expect(standards.svgCode).toContain('color="red"');
      expect(standards.warnings).toEqual([]);
    });

    // A name the library curates is answered before a standard is consulted, so
    // it reaches its own kebab spelling and the cascade that computes from it
    // rather than the raw attribute it shares a name with.
    it.each([
      ['strokeWidth', 'stroke-width'],
      ['stroke-width', 'stroke-width'],
      ['color', 'color'],
      ['marginTop', 'margin-top'],
    ])('resolves %s to the curated spelling %s', (key, curated) => {
      expect(canonicalOptionKey(key)).toBe(curated);
    });

    // `STROKE-WIDTH` and `COLOR` are the two that matter: they are the whole
    // curated-and-SVG intersection written in a casing the curated vocabulary
    // itself does not answer for, so the OWNER guard is the only thing holding
    // them, and without a row here a lookup that asked "is the WRITTEN key
    // curated" instead of "is the OWNER" passes the suite.
    it.each(['STROKE-WIDTH', 'COLOR'])('leaves the miscased %s literal', (key) => {
      expect(canonicalOptionKey(key)).toBe(key);
    });

    it.each(['myOwnAttr', 'dataAttr'])('leaves %s to the author', (key) => {
      expect(canonicalOptionKey(key)).toBe(key);
    });

    // RULED by the contract's §2, and it is a deliberate asymmetry rather than
    // an unfinished edge: a name a STANDARD owns takes "any casing or
    // hyphenation", while a name the LIBRARY curates takes "either casing",
    // meaning the two spellings it publishes (kebab in the DSL, camelCase in
    // JavaScript) and not an arbitrary one. So these two stay the author's own
    // attribute permanently. Do not file it as a gap for a later task to close.
    it.each([
      ['STROKE-WIDTH', '2', 'stroke-width="0.5"'],
      ['COLOR', 'red', 'stroke="#000000"'],
    ])('does not let %s reach the curated cascade', (key, value, untouched) => {
      const builder = new BlissSVGBuilder(`[${key}=${value}]||B291`);

      expect(builder.svgCode).toContain(`${key}="${value}"`);
      expect(builder.svgCode).toContain(untouched);
    });
  });

  describe('when a layer prefix suspends resolution', () => {
    // `content--script-type` strips to `contentscripttype`, which is SVG's
    // contentScriptType, so a lookup that did not skip prefixed keys would
    // rewrite a layer key into a root attribute.
    it.each([
      ['[root--view-box=1]||B291', 'view-box="1"'],
      ['[content--script-type=x]||B291', 'script-type="x"'],
      ['[content--style-type=x]||B291', 'style-type="x"'],
    ])('%s means the attribute literally', (input, literal) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.svgCode).toContain(literal);
      expect(builder.warnings).toEqual([]);
    });

    it('still reports a prefix that names no layer', () => {
      const builder = new BlissSVGBuilder('[stroke--dasharray=2 2]||B291');

      expect(builder.warnings.map(w => w.code)).toEqual(['UNKNOWN_LAYER']);
      expect(builder.svgCode).not.toContain('stroke-dasharray="2 2"');
    });
  });

  describe('when an event handler name reaches the option system', () => {
    // Sixteen on* names are in the vocabulary because the list is faithful to
    // its source, and resolution never runs on them: a name the safety gate
    // refuses is left exactly as written. These rows go red if a later change
    // to that gate opens an attribute surface through the vocabulary.
    it.each([
      '[onclick=x]||B291',
      '[ONCLICK=x]||B291',
      '[on-click=x]||B291',
    ])('refuses %s', (input) => {
      const builder = new BlissSVGBuilder(input);

      expect(builder.warnings.map(w => w.code)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(builder.svgCode).not.toMatch(/\son[a-zA-Z-]*=/);
    });

    it.each(['onclick', 'onClick', 'onMouseDown'])('refuses %s given programmatically', (key) => {
      const builder = new BlissSVGBuilder('B291', { [key]: 'x' });

      expect(builder.warnings.map(w => w.code)).toEqual(['UNSAFE_ATTRIBUTE_NAME']);
      expect(builder.svgCode).not.toMatch(/\son[a-zA-Z-]*=/);
    });

    // The refusal names the spelling the author typed, which is the fragment
    // they can search their own input for. Resolving `on-click` onto the
    // vocabulary's `onclick` first would report a name nobody wrote.
    it.each(['on-click', 'ONCLICK', 'onMouseDown'])('names %s exactly as written', (key) => {
      const builder = new BlissSVGBuilder('B291', { [key]: 'x' });

      expect(builder.warnings[0].source).toBe(key);
      expect(canonicalOptionKey(key)).toBe(key);
    });
  });

  describe('when a definition carries a standard-owned name in its defaults', () => {
    it('resolves it the way a bracket does', () => {
      BlissSVGBuilder.define({
        VOCABDASH: { codeString: 'B291', defaultOptions: { strokeDasharray: '2 2' } },
      }, { overwrite: true });
      const builder = new BlissSVGBuilder('VOCABDASH');

      expect(builder.svgCode).toContain('stroke-dasharray="2 2"');
      expect(builder.svgCode).not.toContain('strokeDasharray');
    });
  });

  describe('when an option is removed by the name it was written under', () => {
    // `view-box` is the sharp case: camelToKebab leaves it unchanged, so a
    // removal that only tries that spelling can never reach the stored viewBox.
    it('removes a transient standard-owned name from the whole SVG', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.setTransientOptions({ 'view-box': '0 0 5 5' });
      expect(builder.svgCode).toContain('viewBox="0 0 5 5"');

      builder.removeTransientOptions('view-box');

      expect(builder.svgCode).not.toContain('viewBox="0 0 5 5"');
    });

    it('removes it from a single character', () => {
      const builder = new BlissSVGBuilder('B291');
      builder.glyph(0).setOptions({ 'view-box': '0 0 5 5' });
      expect(builder.svgCode).toContain('viewBox="0 0 5 5"');

      builder.glyph(0).removeOptions('view-box');

      expect(builder.svgCode).not.toContain('viewBox="0 0 5 5"');
    });
  });
});

afterAll(() => {
  BlissSVGBuilder.removeDefinition('VOCABDASH');
});
