import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';

/**
 * Pins the namespace separation: the library's computed values and the author's
 * own keys live in two bags that cannot collide.
 *
 * Before the split one object carried both, under internal camelCase names, so
 * an author writing a curated option in its programmatic spelling landed on top
 * of the value the library had computed under that same name. `[strokeWidth=1]`
 * on a dot grew its radius 7.75x, `[marginTop=3]` concatenated a string into the
 * viewBox height, and `[cropTop=5]` threw outright. None of it was reported.
 *
 * Covers:
 * - The four measured poisonings above, each now inert: a camelCase key is an
 *   author's key, so it is emitted as written and computes nothing.
 * - The reverse direction: a curated key written in its curated (kebab) spelling
 *   is untouched by the split, and the two names the library both computes AND
 *   publishes (`color` -> `stroke`, `strokeWidth` -> `stroke-width`) still reach
 *   the markup at every scope.
 * - The ordering the split destroys and this file restores by stating it: the
 *   published pair is walked first and the author's keys second, so a raw
 *   `stroke` beats a curated `color` in either bracket order, exactly as before.
 * - An author's key is emitted VERBATIM. The blanket camelCase-to-kebab rename
 *   is gone, so `[gridColor=blue]` ships `gridColor="blue"` and not the
 *   `grid-color="blue"` it used to invent.
 * - The constructor's camelCase, which is its documented spelling and keeps
 *   working, because `#toRaw` kebab-cases before the options pass runs.
 * - Kerning, which the parser promotes onto the options bag rather than the
 *   author writing it, so it belongs with the computed values and must not fall
 *   through into the markup.
 * - One row per element depth, because the wrap that emits an author's keys has
 *   five call sites (composition, group, glyph, leaf part, composite part) and a
 *   single top-level row passes with four of them still wrong.
 * - The serializers, which snapshot the authoring tree before the options pass
 *   runs and must therefore never see the second bag.
 *
 * Does NOT cover:
 * - Whether a camelCase spelling is REPORTED. It is inert here and reported from
 *   `MISPLACED_OPTION_SPELLING` onwards; the rows below filter that code out so
 *   they keep stating the same thing once it exists.
 * - Option VALUE validation, which is `BlissSVGBuilder.option-value-gate.test.js`.
 */

const render = (input, opts) => (opts ? new BlissSVGBuilder(input, opts) : new BlissSVGBuilder(input));
const dotPath = (b) => b.svgCode.match(/<path[^>]*d="([^"]*)"/)[1];
const viewBox = (b) => b.svgCode.match(/viewBox="[^"]*"/)[0];
// A warning the later tasks add for exactly these inputs. Filtered rather than
// asserted, so a row that means "this spelling computes nothing" keeps meaning
// that once the report exists.
const SPELLING_REPORT = 'MISPLACED_OPTION_SPELLING';
const warningsBesidesSpelling = (b) => b.warnings.filter((w) => w.code !== SPELLING_REPORT);

describe('BlissSVGBuilder option namespace split', () => {
  describe('when a curated option is written in its programmatic spelling', () => {
    it('does not poison the dot geometry it never set', () => {
      // The literal default rather than a second build of the same input: two
      // builds move together under a change to the default itself, and nothing
      // else in the suite pins this number. Measured before the split: r=2.58325
      // against this r=0.20825, 7.75x the radius the option it looks like gives.
      expect(dotPath(render('[strokeWidth=1]||B4')))
        .toBe('M-0.20825,16a0.20825,0.20825 0 1,1 0.4165,0a0.20825,0.20825 0 1,1 -0.4165,0');
      expect(dotPath(render('B4'))).toBe(dotPath(render('[strokeWidth=1]||B4')));
    });

    it.each([
      ['at the root', '[strokeWidth=1]||B4', /<svg[^>]*\sstrokeWidth="1"/],
      ['at element scope', '[strokeWidth=1]B291', /<g[^>]*\sstrokeWidth="1"/],
    ])('emits it verbatim %s, rather than under the name it publishes', (_where, dsl, present) => {
      // `strokeWidth` is the one spelling that is BOTH an author's key and a key
      // of the publication map, so a rename applied to the keys being emitted
      // rather than to the published walk caught it and left it half-working:
      // setting stroke-width while computing nothing. Measured in that state:
      // root `stroke-width="1"`, no camel attribute, and a paint that changed.
      const svg = render(dsl).svgCode;
      expect(svg).toMatch(present);
      expect(svg).not.toContain('stroke-width="1"');
    });

    it('does not collide with the attribute it used to be renamed to', () => {
      // Two spellings of one attribute collide and report; a camel key and a
      // `root--` key are two different attributes and must not. This row is the
      // absence of a warning, so it is the one that notices the rename coming
      // back.
      const b = render('[strokeWidth=2;root--stroke-width=3]||B291');
      expect(b.warnings).toEqual([]);
      expect(b.svgCode).toMatch(/<svg[^>]*\sstroke-width="3"/);
      expect(b.svgCode).toMatch(/<svg[^>]*\sstrokeWidth="2"/);
    });

    it('does not poison the viewBox by string concatenation', () => {
      // Measured before the split: viewBox="-0.75 -3 9.5 2030.75", from
      // 20 + '3' + 0.75 read as string concatenation.
      expect(viewBox(render('[marginTop=3]||B291'))).toBe('viewBox="-0.75 -0.75 9.5 21.5"');
    });

    // These two threw `num.toFixed is not a function` until the output-side
    // finiteness check landed, because the string reached arithmetic written for
    // the computed number. The check turned the throw into a report, so what is
    // left to fix is the report itself: it announces a picture size the author
    // never asked for, from a key that should have computed nothing.
    it('does not crop from the programmatic spelling, or report that it tried', () => {
      let b;
      expect(() => { b = render('[cropTop=5]||B291'); return b.svgCode; }).not.toThrow();
      expect(viewBox(b)).toBe('viewBox="-0.75 -0.75 9.5 21.5"');
      expect(warningsBesidesSpelling(b)).toEqual([]);
    });

    it('does not size the root from the programmatic spelling, or report that it tried', () => {
      let b;
      expect(() => { b = render('[svgHeight=200]||B291'); return b.svgCode; }).not.toThrow();
      expect(b.svgCode).toContain('width="57" height="129"');
      expect(warningsBesidesSpelling(b)).toEqual([]);
    });

    it('leaves the grid alone where the camel spelling used to paint it', () => {
      // gridSkyColor has an internal camel twin, so it painted by accident:
      // measured before the split, the sky line carried stroke="blue".
      const svg = render('[grid;gridSkyColor=blue]||B291').svgCode;
      expect(svg).not.toContain('stroke="blue"');
      // and the key itself is now an ordinary authored one, emitted as typed.
      expect(svg).toContain('gridSkyColor="blue"');
    });

    it('emits the key verbatim rather than kebab-casing it', () => {
      // The blanket camel->kebab conversion is gone: it was the mechanism that
      // let an author's raw key be renamed on its way out. Measured before the
      // split: grid-color="blue", a name the author never wrote.
      const svg = render('[gridColor=blue]||B291').svgCode;
      expect(svg).toContain('gridColor="blue"');
      expect(svg).not.toContain('grid-color="blue"');
    });
  });

  describe('when the same option is written in its curated spelling', () => {
    it('still sizes the dot from stroke-width', () => {
      expect(dotPath(render('[stroke-width=1]||B4')))
        .toBe('M-0.33325,16a0.33325,0.33325 0 1,1 0.6665,0a0.33325,0.33325 0 1,1 -0.6665,0');
    });

    it('still pushes the viewBox out by the margin', () => {
      expect(viewBox(render('[margin-top=3]||B291'))).toBe('viewBox="-0.75 -3 9.5 23.75"');
    });

    it('still paints the sky line', () => {
      expect(render('[grid;grid-sky-color=blue]||B291').svgCode).toContain('stroke="blue"');
    });

    it.each([
      '[stroke-width=1]||B4',
      '[margin-top=3]||B291',
      '[grid;grid-sky-color=blue]||B291',
    ])('reports nothing: %s', (dsl) => {
      expect(warningsBesidesSpelling(render(dsl))).toEqual([]);
    });
  });

  describe('when a computed value is also published as an attribute', () => {
    it.each([
      ['at the root', '[color=red;stroke-width=2]||B291', /<svg[^>]*\sstroke="red"[^>]*\sstroke-width="2"/],
      ['at element scope', '[color=red;stroke-width=2]B291', /<g stroke-width="2" stroke="red">/],
    ])('reaches the markup %s', (_where, dsl, placed) => {
      // Options PRECEDE the code, so `B291[color=red]` would be an unknown code
      // rendering nothing and the row would pass against a broken build.
      //
      // Matched against the ELEMENT that must carry them, not searched for
      // anywhere in the document: both names inherit down onto the shapes, so a
      // plain `toContain` passes with the values on the wrong element.
      //
      // The root half pins the paint defaults `#svgCode` writes, NOT this
      // chunk's published walk, which at the root only registers the two names
      // so a `root--` key can collide with them; that collision is pinned in
      // `layer-sub-targets.test.js`. The element half is the walk: nothing else
      // emits these two below the root.
      expect(render(dsl).svgCode).toMatch(placed);
      expect(warningsBesidesSpelling(render(dsl))).toEqual([]);
    });

    it.each([
      ['curated first', '[color=red;stroke=blue]'],
      ['raw first', '[stroke=blue;color=red]'],
    ])('lets a raw name beat a curated one at the root, %s', (_order, bracket) => {
      // Two bags have no order between them, so the order is stated rather than
      // inherited: published pair first, author's keys second. That reproduces
      // the single bag's behaviour, where the options pass rebuilt it with every
      // curated key ahead of every raw one and the raw name therefore landed
      // second whatever the author typed.
      const svg = render(`${bracket}||B291`).svgCode;
      expect(svg).toContain('stroke="blue"');
      expect(svg).not.toContain('stroke="red"');
    });

    it.each([
      ['curated first', '[color=red;stroke=blue]'],
      ['raw first', '[stroke=blue;color=red]'],
    ])('lets a raw name beat a curated one at element scope, %s', (_order, bracket) => {
      const svg = render(`${bracket}B291`).svgCode;
      expect(svg).toContain('<g stroke="blue"');
      expect(svg).not.toContain('stroke="red"');
    });
  });

  describe('when the constructor is given camelCase, which is its documented spelling', () => {
    it('keeps working, because #toRaw kebabs it before processing', () => {
      expect(viewBox(render('B291', { marginTop: 3 }))).toBe('viewBox="-0.75 -3 9.5 23.75"');
      expect(render('B291', { svgHeight: 86 }).svgCode).toContain('height="86"');
    });
  });

  describe('when kerning has been promoted by the parser', () => {
    it('still reaches the advance read rather than the markup', () => {
      // The parser promotes kerning onto the options bag, and the curated set
      // does not list it, so without explicit routing it falls through to the
      // author's bag, ships as <g relativeKerning="3"> and moves nothing.
      const b = render('B99/[relative-kerning=3]B291');
      expect(viewBox(b)).toBe('viewBox="-0.75 -0.75 16.5 21.5"');
      expect(b.svgCode).not.toContain('relativeKerning');
      expect(b.svgCode).not.toContain('relative-kerning');
    });
  });

  describe("when the author's keys are emitted at each depth", () => {
    // One row per call site of the wrap that emits them. Five sites, four of
    // which would keep passing the computed bag if only the top level were
    // pinned, and each of those depths would then emit nothing an author wrote.
    it('reaches the composition, which passes only anchor attributes', () => {
      expect(render('[href="#a"]||B291').svgCode).toContain('<a href="#a"');
    });

    it('reaches a group', () => {
      expect(render('[data-depth=grp]|B291').svgCode).toContain('<g data-depth="grp">');
    });

    it('reaches a character', () => {
      expect(render('[data-depth=chr]B291').svgCode).toContain('<g data-depth="chr">');
    });

    it('reaches a part that draws a shape of its own', () => {
      // C1 and not B291: a B-code part is built from sub-parts and takes the
      // composite branch below, so it would give this block two rows on one site
      // and leave the single-shape site pinned by nothing. Verified by nulling
      // that site alone and watching this row, and only this row, die.
      expect(render('[data-depth=prt]>C1').svgCode).toContain('<g data-depth="prt">');
    });

    it('reaches a part built from sub-parts', () => {
      // B85 is a built-in compound indicator (B270;B86), so it arrives as one
      // part carrying children and takes the composite branch, which is a
      // different emission site from the single-shape part above.
      expect(render('B291;[data-depth=cmp]>B85').svgCode).toContain('<g data-depth="cmp">');
    });
  });

  describe('when the spelling has no curated twin to fall back on', () => {
    // `autoVertical` and `cropCompact` are the only two internal camelCase names
    // with no kebab option of their own, so the separation leaves them nowhere
    // to land: measured here, all three channels stopped cropping the moment the
    // bags parted, and the DSL one now ships a dead autoVertical="true". Every
    // other camelCase key either has a kebab twin a bracket can reach or is
    // kebab-cased on the way in by the constructor.
    //
    // Ruled 2026-09-03: a bracket REPORTS them, naming crop=auto-vertical and
    // crop=compact, and the constructor keeps accepting them by lookup. Neither
    // half exists yet; both are owed, and these rows are the tripwire that keeps
    // them visible in every run until they are paid.
    it.todo('reports [autoVertical] and [cropCompact], naming crop=auto-vertical and crop=compact');
    it.todo('emits no dead autoVertical="true" on the root for a spelling that crops nothing');
    it.todo('keeps new BlissSVGBuilder(code, { autoVertical: true }) cropping, by lookup in #toRaw');
  });

  describe('when the composition is serialized', () => {
    // The authoring tree is snapshotted before the options pass runs, so the
    // second bag is invisible to both serializers. Pinned because the split is
    // what creates something for them to leak.
    it('round-trips the DSL unchanged', () => {
      expect(render('[gridColor=blue;data-depth=chr]B291').toString())
        .toBe('[gridColor=blue;data-depth=chr]B291');
    });

    it('never puts the second bag in the JSON', () => {
      // The serialized tree is compared WHOLE, not searched for the bag's NAME:
      // a leak under any other field name passes a name check, and a leak at the
      // root passes a check that only reads the glyph.
      expect(render('[gridColor=blue;data-depth=chr]B291').toJSON()).toEqual({
        options: {},
        groups: [{
          glyphs: [{
            parts: [{ codeName: 'B291' }],
            options: { gridColor: 'blue', 'data-depth': 'chr' },
            codeName: 'B291',
          }],
        }],
      });
    });
  });
});
