import { describe, it, expect } from 'vitest';
import { hasPathData, createTextFallbackGlyph } from '../src/lib/bliss-shape-creators.js';
import { BlissSVGBuilder } from '../src/index.js';
import { blissElementDefinitions } from '../src/lib/bliss-element-definitions.js';

/**
 * Pins the text-fallback rendering path: characters with hardcoded SVG path
 * data render via <path>, characters without fall back to a single <text>
 * element. The boundary is `hasPathData`, the fallback constructor is
 * `createTextFallbackGlyph`, and the user-visible surface is the X-prefix
 * DSL (Xhello, Xα, Xc/Xa/Xf/Xé, Xhello//Xpiǎ).
 *
 * Covers:
 * - `hasPathData` predicate across the hardcoded character set (ASCII a-z /
 *   A-Z, Swedish å/ä/ö/Å/Ä/Ö, Latin Extended é/ñ/ü/ç, Cyrillic) and outside
 *   it (Greek, CJK).
 * - `createTextFallbackGlyph` shape: getPath emits a <text> element with
 *   font-family + color; single-char glyphs carry `char` + `glyphCode`,
 *   multi-char glyphs carry only an alias-style `codeName` (`XTXT_<str>`).
 * - Builder rendering of X-prefixed multi-character strings (Xhello → 5
 *   paths, Xα → 1 text, Xcafé → 4 paths) and explicit X-code sequences
 *   joined by `/` (Xh/Xα/Xl/Xl/Xo collapses to 1 text since one char lacks
 *   hardcoded data; Xh/Xe/Xl/Xl/Xo → 5 paths).
 * - Hardcoded diacritic letters (é/ñ/ü/ç/å/Å) render as <path>, never
 *   <text>; kerning is intact (monotonically increasing x-coordinates
 *   across the glyphs of Xcafé).
 * - Out-of-range X-prefix inputs (Xǎ, Xǔ, Xḿ; mid-word Xpiǎ; cross-word
 *   Xhello//Xpiǎ) are surfaced as UNKNOWN_CODE warnings rather than
 *   silently dropped, naming the whole written token and taking no
 *   outlined letter down with them.
 * - Round-trip of partial-fallback inputs through `toJSON` preserves
 *   the rendered SVG byte-identically.
 * - Option-bracket routing (run-to-stable Phase 2.2): a character-level
 *   `[opts]` or part-level `[opts]>` prefix no longer hides an X-run from
 *   fallback routing. [color=green]Xλ renders the green fallback letter
 *   with zero warnings; a prefixed multi-letter run behaves exactly like
 *   its written `/`-expansion (option rides the first expanded glyph;
 *   an all-fallback run stays one <text> glyph); an option-prefixed
 *   member of an X-sequence stands alone instead of merging into the
 *   whole-run fallback. A `;`-part slot routes the one-glyph answer
 *   (`B291;Xλ`) and still refuses a word (`B291;Xab`).
 * - XTXT_ singleton isolation: rendering a text-fallback input does not
 *   leak `XTXT_` keys into the global definitions registry, and two
 *   builders with different XTXT_ inputs render independently.
 *
 * Does NOT cover:
 * - XTXT_ round-trip through `toJSON` (the rendered-SVG-identity contract),
 *   see `BlissSVGBuilder.round-trip.test.js` describe-path
 *   `... > when XTXT_ inputs round-trip through toJSON`.
 * - External glyph rendering for non-text X-codes (the canonical Xa
 *   single-char form is touched here as a regression check; the broader
 *   external-glyph contract lives in `BlissSVGBuilder.external-glyphs.test.js`).
 * - Wider X-prefix character coverage: the desired XTXT-fallback contract
 *   for characters outside the parser's accepted ranges (Latin Extended-B+,
 *   CJK, etc.) is captured as it.todo placeholders in the
 *   `when a base+diacritic combination lies outside the supported
 *   X-prefix character set` describe; tracked at issue #26.
 * - Expanding the hardcoded path-data set to cover more diacritic
 *   variants (a separate, future task; not currently prioritized).
 */
describe('BlissSVGBuilder text fallback', () => {
  const renderSvg = (input) => new BlissSVGBuilder(input).svgCode;
  const externalGlyphPaths = (svg) => svg.match(/<path[^>]*stroke="none"[^>]*>/g) ?? [];
  const externalGlyphPathDs = (svg) => [...svg.matchAll(/<path[^>]*stroke="none"[^>]*d="([^"]+)"/g)];
  const firstMx = (d) => {
    const m = d.match(/M(-?\d+\.?\d*),/);
    return m ? parseFloat(m[1]) : null;
  };

  describe('when checking hasPathData for individual characters', () => {
    it('reports true for hardcoded ASCII lowercase characters', () => {
      expect(hasPathData('a')).toBe(true);
      expect(hasPathData('z')).toBe(true);
      expect(hasPathData('m')).toBe(true);
    });

    it('reports true for hardcoded ASCII uppercase characters', () => {
      expect(hasPathData('A')).toBe(true);
      expect(hasPathData('Z')).toBe(true);
    });

    it('reports true for hardcoded Swedish characters (å/ä/ö/Å/Ä/Ö)', () => {
      expect(hasPathData('å')).toBe(true);
      expect(hasPathData('ä')).toBe(true);
      expect(hasPathData('ö')).toBe(true);
      expect(hasPathData('Å')).toBe(true);
      expect(hasPathData('Ä')).toBe(true);
      expect(hasPathData('Ö')).toBe(true);
    });

    it('reports false for characters not in the hardcoded set', () => {
      expect(hasPathData('α')).toBe(false); // Greek alpha
      expect(hasPathData('β')).toBe(false); // Greek beta
      expect(hasPathData('漢')).toBe(false); // Chinese
      expect(hasPathData('あ')).toBe(false); // Japanese hiragana
    });

    it('reports true for hardcoded Latin Extended characters', () => {
      expect(hasPathData('é')).toBe(true);
      expect(hasPathData('ñ')).toBe(true);
      expect(hasPathData('ü')).toBe(true);
      expect(hasPathData('ç')).toBe(true);
    });

    it('reports true for hardcoded Cyrillic characters', () => {
      expect(hasPathData('я')).toBe(true);
      expect(hasPathData('б')).toBe(true);
      expect(hasPathData('Ж')).toBe(true);
    });
  });

  describe('when creating a text fallback glyph directly', () => {
    it('returns a glyph object with required properties for a single character', () => {
      const glyph = createTextFallbackGlyph('é');
      expect(glyph).toHaveProperty('getPath');
      expect(glyph).toHaveProperty('width');
      expect(glyph).toHaveProperty('height');
      expect(glyph).toHaveProperty('isExternalGlyph', true);
      expect(glyph).toHaveProperty('char', 'é');
    });

    it('emits an SVG <text> element from getPath', () => {
      const glyph = createTextFallbackGlyph('é');
      const pathOutput = glyph.getPath(0, 0, {});
      expect(pathOutput).toContain('<text');
      expect(pathOutput).toContain('é');
      expect(pathOutput).toContain('font-family=');
      expect(pathOutput).toContain('</text>');
    });

    it('applies the color option to the rendered text element', () => {
      const glyph = createTextFallbackGlyph('ñ');
      const pathOutput = glyph.getPath(0, 0, { color: 'red' });
      expect(pathOutput).toContain('fill="red"');
    });

    it('exposes only an alias-style codeName (no char, no glyphCode) for multi-character strings', () => {
      const glyph = createTextFallbackGlyph('héllo');
      const pathOutput = glyph.getPath(0, 0, {});
      expect(pathOutput).toContain('héllo');
      // Multi-char text fallback isn't a single glyph: no `char`, no
      // `glyphCode`. Identity is carried by an alias-style `codeName`.
      expect(glyph.char).toBeUndefined();
      expect(glyph.glyphCode).toBeUndefined();
      expect(glyph.codeName).toBe('XTXT_héllo');
    });
  });

  describe('when rendering X-prefixed multi-character strings via the builder', () => {
    it('renders Xhello as five path elements (all chars have hardcoded data)', () => {
      const svg = renderSvg('Xhello');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xhéllo as five path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xhéllo');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xα as a single text element since Greek alpha lacks hardcoded data', () => {
      const svg = renderSvg('Xα');
      expect(svg).toContain('<text');
      expect(svg).toContain('α');
    });

    it('renders Xcafé as path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xcafé');
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('keeps the existing Xa single-character syntax rendering as path', () => {
      const svg = renderSvg('Xa');
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('renders Xhello with monotonically increasing x-coordinates per glyph', () => {
      const svg = renderSvg('Xhello');
      const paths = externalGlyphPathDs(svg);
      expect(paths).toHaveLength(5);
      const xCoords = paths.map(m => firstMx(m[1]));
      for (let i = 1; i < xCoords.length; i++) {
        expect(xCoords[i]).toBeGreaterThan(xCoords[i - 1]);
      }
    });
  });

  describe('when rendering explicit X-code sequences joined by /', () => {
    it('renders Xh/Xα/Xl/Xl/Xo as a single text element since one char lacks hardcoded data', () => {
      const svg = renderSvg('Xh/Xα/Xl/Xl/Xo');
      expect(svg).toContain('<text');
      expect(svg).toContain('hαllo');
      expect(svg).not.toMatch(/<path[^>]*stroke="none"[^>]*>/);
    });

    it('renders Xh/Xe/Xl/Xl/Xo as five path elements when all chars have hardcoded data', () => {
      const svg = renderSvg('Xh/Xe/Xl/Xl/Xo');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(5);
    });

    it('renders Xc/Xa/Xf/Xé as four path elements (é has hardcoded data)', () => {
      const svg = renderSvg('Xc/Xa/Xf/Xé');
      expect(svg).not.toContain('<text');
      expect(externalGlyphPaths(svg)).toHaveLength(4);
    });
  });

  describe('when rendering hardcoded diacritic letters', () => {
    it.each([
      ['Xé'],
      ['Xñ'],
      ['Xü'],
      ['Xç'],
      ['Xå'],
      ['XÅ'],
    ])('renders %s as a path element with no <text> fallback', (input) => {
      const svg = renderSvg(input);
      expect(svg).not.toContain('<text');
      expect(svg).toContain('<path');
    });

    it('renders Xcafé with monotonically increasing x-coordinates per glyph (kerning intact for diacritic-bearing words)', () => {
      const svg = renderSvg('Xcafé');
      const paths = externalGlyphPathDs(svg);
      expect(paths).toHaveLength(4);
      const xCoords = paths.map(m => firstMx(m[1]));
      for (let i = 1; i < xCoords.length; i++) {
        expect(xCoords[i]).toBeGreaterThan(xCoords[i - 1]);
      }
    });
  });

  // The X-prefix DSL today accepts only ASCII letters, Latin Extended-A,
  // Greek, and Cyrillic. A token carrying anything else is rejected WHOLE and
  // surfaced as an UNKNOWN_CODE warning (not silently dropped, and never split
  // at the character class); the active tests below pin that warning contract.
  // Wider character support (so the parser
  // falls through to the XTXT <text> path instead of rejecting) is
  // tracked at https://github.com/hlridge/bliss-svg-builder/issues/26;
  // the it.todo lines pin the desired future contract.
  describe('when a base+diacritic combination lies outside the supported X-prefix character set', () => {
    it.each([
      ['Xǎ'],
      ['Xǔ'],
      ['Xḿ'],
    ])('emits an UNKNOWN_CODE warning for %s', (input) => {
      const builder = new BlissSVGBuilder(input);
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: `Invalid format: ${input}`,
      }));
    });

    // regression: see issue #39. The source used to be `Xiǎ`, a token starting
    // mid-run: the run was truncated at the character class and the tail
    // spliced onto the last expanded code, so the ordinary outlined letter `i`
    // was consumed by the failing token and Xpiǎ rendered `p` alone. The whole
    // written token is now judged as one unit.
    it('emits an UNKNOWN_CODE warning naming the whole of Xpiǎ (mid-word)', () => {
      const builder = new BlissSVGBuilder('Xpiǎ');
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: 'Invalid format: Xpiǎ',
      }));
    });

    it('emits an UNKNOWN_CODE warning naming the whole failing word in Xhello//Xpiǎ (cross-word)', () => {
      const builder = new BlissSVGBuilder('Xhello//Xpiǎ');
      expect(builder.warnings).toContainEqual(expect.objectContaining({
        code: 'UNKNOWN_CODE',
        source: 'Invalid format: Xpiǎ',
      }));
    });

    it('keeps the outlined word of Xhello//Xpiǎ intact when the other word fails', () => {
      // the token does not lex, so the whole word drops and only its word break
      // survives, the same shape a trailing `B291//` already serializes to
      const builder = new BlissSVGBuilder('Xhello//Xpiǎ');
      expect(builder.toString()).toBe('Xh/Xe/Xl/Xl/Xo//');
      expect(new BlissSVGBuilder(builder.toString()).svgCode).toBe(builder.svgCode);
    });

    it('round-trips Xpiǎ through toJSON with byte-identical SVG output', () => {
      const original = new BlissSVGBuilder('Xpiǎ');
      const roundTripped = new BlissSVGBuilder(original.toJSON());
      expect(roundTripped.svgCode).toBe(original.svgCode);
    });

    it.todo('renders Xǎ as a single text element since the base char lacks hardcoded data (a with caron, Pinyin)');
    it.todo('renders Xǔ as a single text element since the base char lacks hardcoded data (u with caron, Pinyin)');
    it.todo('renders Xḿ as a single text element since the base char lacks hardcoded data (m with acute)');
    it.todo('renders Xpiǎ as a single text element when one mid-word char lacks hardcoded data');
    it.todo('renders Xhello//Xpiǎ as paths for the hardcoded word and a single text element for the fallback word');
  });

  // Phase 2.2 acceptance criterion (1.4 review MAJOR-1): an option bracket
  // must not hide an X-run from XTXT_ routing. processXCodes now looks
  // through a leading `[opts]` / `[opts]>` prefix at a glyph boundary.
  describe('when an option bracket precedes a fallback letter', () => {
    it('renders [color=green]Xλ as a green text-fallback element with zero warnings', () => {
      const bracketed = new BlissSVGBuilder('[color=green]Xλ');
      expect(bracketed.svgCode).toContain('<text');
      expect(bracketed.svgCode).toContain('green');
      expect(bracketed.warnings).toEqual([]);
      // regression: the bracket used to defeat XTXT_ routing entirely —
      // UNKNOWN_CODE and no render while bare Xλ rendered
      expect(renderSvg('Xλ')).toContain('<text');
    });

    it('round-trips the bracketed fallback letter byte-stably', () => {
      const b = new BlissSVGBuilder('[color=green]Xλ');
      expect(b.toString()).toBe('[color=green]Xλ');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('renders a part-option-prefixed fallback letter with zero warnings', () => {
      const b = new BlissSVGBuilder('[color=red]>Xλ');
      expect(b.svgCode).toContain('<text');
      expect(b.warnings).toEqual([]);
    });

    // pins the outlined-letter pass-through: only a FALLBACK letter is
    // rewritten to XTXT_; a hardcoded letter behind a bracket keeps its
    // path-outline route
    it('keeps an outlined letter behind a bracket on the path route', () => {
      const b = new BlissSVGBuilder('[color=green]XA');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('<path');
      expect(b.svgCode).not.toContain('<text');
    });
  });

  describe('when an option bracket precedes a multi-letter X-run', () => {
    it('behaves exactly like the written /-expansion for outlined letters', () => {
      // X-runs are string-level sugar (toString of Xab IS Xa/Xb), so the
      // prefixed form must equal its expansion: option on the first glyph
      const sugar = new BlissSVGBuilder('[color=green]Xab');
      const written = new BlissSVGBuilder('[color=green]Xa/Xb');
      expect(sugar.warnings).toEqual([]);
      expect(sugar.svgCode).toBe(written.svgCode);
      expect(sugar.toString()).toBe('[color=green]Xa/Xb');
    });

    it('keeps an all-fallback run as one styled text glyph', () => {
      const b = new BlissSVGBuilder('[color=green]Xλμ');
      expect(b.warnings).toEqual([]);
      expect((b.svgCode.match(/<text/g) ?? []).length).toBe(1);
      expect(b.svgCode).toContain('green');
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });

    it('routes a part-option prefix on a multi-letter run like its written expansion', () => {
      const sugar = new BlissSVGBuilder('[color=red]>Xab');
      const written = new BlissSVGBuilder('[color=red]>Xa/Xb');
      expect(sugar.warnings).toEqual([]);
      expect(sugar.svgCode).toBe(written.svgCode);
    });
  });

  describe('when an option-prefixed member sits inside an X-sequence', () => {
    it('stands alone instead of merging into the whole-run fallback', () => {
      const b = new BlissSVGBuilder('Xa/[color=green]Xλ/Xb');
      expect(b.warnings).toEqual([]);
      // a and b stay outlined paths; only the styled λ falls back to text
      expect((b.svgCode.match(/<text/g) ?? []).length).toBe(1);
      expect(externalGlyphPaths(b.svgCode).length).toBeGreaterThanOrEqual(2);
      expect(new BlissSVGBuilder(b.toString()).svgCode).toBe(b.svgCode);
    });
  });

  describe('when an X-code sits in a ;-part slot', () => {
    // This describe used to pin the opposite: `B291;Xλ` warned UNKNOWN_CODE
    // because the part slot never routed X codes at all. That was a routing
    // hole rather than a contract (the very same glyph was reachable by
    // writing `B291;XTXT_λ`), and it became visibly asymmetric once a `;`-part
    // was legalized ON a one-glyph run. The part slot now asks the shared run
    // grammar for the ONE-glyph answer; the word answer still fails, which is
    // the boundary this describe really guards.
    it('routes a fallback letter to the text glyph', () => {
      const b = new BlissSVGBuilder('B291;Xλ');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toContain('<text');
      expect(b.svgCode).toBe(new BlissSVGBuilder('B291;XTXT_λ').svgCode);
    });

    it('refuses a word, so a run never splits one glyph across many', () => {
      const b = new BlissSVGBuilder('B291;Xab');
      expect(b.warnings.map((w) => w.code)).toContain('WORD_AS_PART');
      expect(b.svgCode).not.toContain('<text');
    });
  });

  // A `toJSON()` re-ingest used to convert ANY unregistered `X…` code to the
  // internal text-fallback form, with no check that it was a legal X token. So
  // a code the DSL rejects came back as accepted content and the warning
  // vanished: `Xhello-world` warns and renders nothing when parsed, but through
  // JSON it rendered the text with no warning at all. The object path now asks
  // the same grammar the DSL asks.
  describe('when a rejected X code arrives through object input', () => {
    const authored = (code) => new BlissSVGBuilder({
      groups: [{ glyphs: [{ codeName: code, parts: [{ codeName: code }] }] }],
    });

    it('reports the same warning the direct parse reports', () => {
      // `Xa-Xb` is the one that pins the pattern's LEADING anchor: without it,
      // the trailing `Xb` alone would match and the whole token would route to
      // text on the object path while the DSL rejects it.
      for (const code of ['Xhello-world', 'X9', 'Xab9', 'X-', 'XRAY1', 'Xa-Xb']) {
        const direct = new BlissSVGBuilder(code);
        expect(direct.warnings.map(w => w.code)).toEqual(['UNKNOWN_CODE']);
        expect(authored(code).warnings.map(w => w.code)).toEqual(['UNKNOWN_CODE']);
      }
    });

    it('renders byte-identically to the direct parse after a toJSON round-trip', () => {
      for (const code of ['Xhello-world', 'X9', 'X-']) {
        const direct = new BlissSVGBuilder(code);
        expect(new BlissSVGBuilder(direct.toJSON()).svgCode).toBe(direct.svgCode);
      }
    });

    it('still ingests a legal text-fallback code arriving from a real toJSON', () => {
      for (const input of ['Xλ', 'Xhαllo', 'XTXT_hi']) {
        const direct = new BlissSVGBuilder(input);
        expect(direct.warnings).toEqual([]);
        const rebuilt = new BlissSVGBuilder(direct.toJSON());
        expect(rebuilt.warnings).toEqual([]);
        expect(rebuilt.svgCode).toBe(direct.svgCode);
      }
    });

    it('leaves an all-outlined run routed to text, the one divergence still open', () => {
      // `XOH` renders two outlined letters when written and one text glyph when
      // authored as object data. That is the separate "should authored object
      // data accept DSL shorthand" question, deliberately untouched here;
      // pinned so a later change to it is a decision, not a side effect.
      expect(authored('XOH').warnings).toEqual([]);
      expect(authored('XOH').svgCode).toContain('<text');
      expect(new BlissSVGBuilder('XOH').svgCode).not.toContain('<text');
    });
  });

  describe('when XTXT_ inputs are isolated from global state', () => {
    it('does not leak XTXT_ keys into the global definitions registry', () => {
      new BlissSVGBuilder('Xhéllo');
      const xtxtKeys = Object.keys(blissElementDefinitions).filter(k => k.startsWith('XTXT_'));
      expect(xtxtKeys).toHaveLength(0);
    });

    it('renders two builders with different XTXT_ inputs independently', () => {
      const builder1 = new BlissSVGBuilder('Xhéllo');
      const builder2 = new BlissSVGBuilder('Xwörld');
      expect(builder1.svgCode).toContain('<svg');
      expect(builder2.svgCode).toContain('<svg');
      expect(builder1.svgCode).not.toBe(builder2.svgCode);
    });
  });
});
