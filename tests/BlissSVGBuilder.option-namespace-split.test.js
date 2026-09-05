import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { PUBLICATION_MAP, KNOWN_OPTION_KEYS, camelToKebab, isProgrammaticSpelling } from '../src/lib/bliss-constants.js';

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
 * - The two reports that name written option keys back to the author, which both
 *   canonicalized camelCase before matching and so named keys that compute
 *   nothing: the one about a hand-written viewBox displacing the options, and
 *   the one about a computed size the format cannot carry. The second is checked
 *   on both of its arms, since removing the key can leave the list non-empty or
 *   empty it, and the message branches on that.
 * - The constructor's camelCase, which is its documented spelling and keeps
 *   working, because `#toRaw` kebab-cases before the options pass runs. It is
 *   also the control for the two reports above: on that channel the key really
 *   did shape the picture, so it is still named, in its kebab spelling.
 * - Kerning, which the parser promotes onto the options bag rather than the
 *   author writing it, so it belongs with the computed values and must not fall
 *   through into the markup.
 * - One row per element depth, because the wrap that emits an author's keys has
 *   five call sites (composition, group, glyph, leaf part, composite part) and a
 *   single top-level row passes with four of them still wrong.
 * - The serializers, which snapshot the authoring tree before the options pass
 *   runs and must therefore never see the second bag.
 * - The report the separation makes possible, `MISPLACED_OPTION_SPELLING`: every
 *   curated option's camel spelling raises it, once per place it was written, at
 *   every scope and on object input; a name the library does not curate never
 *   does; and the reported key is still EMITTED, because it is a usable
 *   attribute name.
 * - The two internal names with no curated twin (`autoVertical`, `cropCompact`),
 *   which the generic rule cannot see and a two-entry lookup handles instead.
 *
 * Does NOT cover:
 * - Option VALUE validation, which is `BlissSVGBuilder.option-value-gate.test.js`.
 * - The same question asked of a definition's `defaultOptions`, which is a
 *   programmatic surface and therefore translates rather than reports, see
 *   `BlissSVGBuilder.default-options.test.js`.
 */

const render = (input, opts) => (opts ? new BlissSVGBuilder(input, opts) : new BlissSVGBuilder(input));
const dotPath = (b) => b.svgCode.match(/<path[^>]*d="([^"]*)"/)[1];
const viewBox = (b) => b.svgCode.match(/viewBox="[^"]*"/)[0];
// The report these inputs now raise. Filtered out of the rows that mean "this
// spelling computes nothing", so each of those keeps stating that one thing.
const SPELLING_REPORT = 'MISPLACED_OPTION_SPELLING';
const warningsBesidesSpelling = (b) => b.warnings.filter((w) => w.code !== SPELLING_REPORT);
const spellingReports = (b) => b.warnings.filter((w) => w.code === SPELLING_REPORT);

// Every curated option with a camelCase spelling distinct from its kebab one,
// DERIVED rather than listed: a curated option added later is covered the day it
// lands, where a hand-written list would silently stop being the whole set.
const CURATED_CAMEL_SPELLINGS = [...KNOWN_OPTION_KEYS]
  .filter((key) => key.includes('-'))
  .map((key) => key.replace(/-(.)/g, (_, letter) => letter.toUpperCase()));

// The single-word half of the same vocabulary: one spelling serves both
// channels, so there is nothing to report and nothing to translate.
const SINGLE_WORD_OPTIONS = [...KNOWN_OPTION_KEYS].filter((key) => !key.includes('-'));

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
      // The camel key now raises its own report, which is a statement about the
      // SPELLING and not about a second value for one attribute. Filtered rather
      // than dropped: the claim here is still the absence of a collision.
      expect(warningsBesidesSpelling(b)).toEqual([]);
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

    // Two reports name written option keys back to the author, and both filtered
    // the written list through `camelToKebab` before matching it against the
    // curated geometry sets. That canonicalization was right while one bag
    // carried both spellings; with two bags it makes each report name a key that
    // computes nothing, so the author is told to remove or reduce something that
    // was never doing anything. The live channels are unaffected: the options
    // argument and `setTransientOptions` both pass through `#toRaw`, which
    // kebab-cases before the options pass, so a camelCase key that still
    // computes has already stopped being camelCase by here. A bracket and a
    // hand-written options object are the only two channels that keep the
    // spelling, and on those it is inert. Object input is not a third
    // converting channel, it is cloned verbatim; a `toJSON()` round trip is
    // safe because the converting channels kebab-case BEFORE serializing, so
    // the only camelCase a serialization carries is the inert kind.
    it('is not reported as displaced when the viewBox is written by hand', () => {
      // Measured before the fix: MULTIPLE_GEOMETRY_VALUES, source "marginTop",
      // announcing that the hand-written viewBox replaced a value this key never
      // produced. The kebab twin is displaced and still reports, in
      // `layer-attributes.test.js`.
      const b = render('[marginTop=3;viewBox="0 0 10 10"]||B291');
      expect(warningsBesidesSpelling(b)).toEqual([]);
      expect(b.svgCode).toContain('viewBox="0 0 10 10"');
    });

    it('is not named among the values to reduce when a curated option overflows', () => {
      // The second call site of the same conversion, and the plan named only the
      // first. This report exists to say WHICH written options to reduce, so a
      // key that sizes nothing is worse than noise here. Measured before the fix:
      // source "margin, marginTop". `margin` alone overflows; the camel key rides
      // along.
      const b = render('[margin=1e308;marginTop=3]||B291');
      expect(warningsBesidesSpelling(b).map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(warningsBesidesSpelling(b)[0].source).toBe('margin');
    });

    it('does not make the overflow report name an option when the content is what overflowed', () => {
      // The second arm of the same filter, and a different observable outcome:
      // above it is removed from a list that stays non-empty, here removing it
      // empties the list, and the message BRANCHES on that. The overflow comes
      // from a position at element scope, which no builder-scope set can see, so
      // there is nothing to drop and the report has to say so. Measured before
      // the fix: `"marginTop" works out to a picture size...`, which named a key
      // that sizes nothing AND claimed options had been dropped. The kebab twin
      // below is the control and still takes the named branch.
      const camel = render('[marginTop=3]||[x=1e308]>B291');
      const kebab = render('[margin-top=3]||[x=1e308]>B291');
      const overflow = (b) => b.warnings.find((w) => w.code === 'OUT_OF_RANGE_COMPUTED_GEOMETRY');

      expect(overflow(camel).source).toBe('');
      expect(overflow(camel).message).toContain('The content works out to');
      expect(overflow(kebab).source).toBe('margin-top');
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

    // Everything above pins that the spelling does NOTHING. The rows below pin
    // that the library says so, which is the whole point of separating the bags:
    // before it, the key landed on a computed value and the damage was silent.
    it.each(CURATED_CAMEL_SPELLINGS)('reports %s, naming the spelling that works', (camel) => {
      const misplaced = spellingReports(render(`[${camel}=1]||B291`));
      expect(misplaced).toHaveLength(1);
      expect(misplaced[0].source).toBe(camel);
      expect(misplaced[0].message).toContain(`"${camel}"`);
      expect(misplaced[0].message).toContain(`"${camelToKebab(camel)}"`);
    });

    it.each(SINGLE_WORD_OPTIONS)('says nothing about %s, which spells the same both ways', (key) => {
      expect(spellingReports(render(`[${key}=1]||B291`))).toEqual([]);
    });

    it('reports on object input, which keeps the spelling the way a bracket does', () => {
      // The second channel that does not convert. `#toRaw` guards the API
      // surfaces; a hand-authored options bag reaches the options pass verbatim,
      // so the same key is inert here and must be reported here too.
      const b = render({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }] }] }],
                         options: { marginTop: 3 } });
      expect(spellingReports(b)).toHaveLength(1);
      expect(spellingReports(b)[0].source).toBe('marginTop');
    });

    it('reports a hand-authored transient key, which merges into the same bag', () => {
      // `setTransientOptions` converts, so only object input can put a camel key
      // in this channel. It merges into the node's options before the pass runs,
      // which is exactly why one report site covers it.
      const b = render({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }],
                                              transientOptions: { strokeWidth: 2 } }] }] });
      expect(spellingReports(b)).toHaveLength(1);
    });

    it('reports at element scope, where the key is equally inert', () => {
      // The report site is the options pass, which reaches every scope; the
      // global bracket above would pass on its own with the lower scopes silent.
      expect(spellingReports(render('[strokeWidth=1]B291'))).toHaveLength(1);
    });

    it('reports once per place it was written, not once per name', () => {
      // Two scopes are two written keys and two inert values. A report keyed by
      // NAME would collapse these into one and leave the second site unnamed.
      expect(spellingReports(render('[strokeWidth=1]||[strokeWidth=2]B291'))).toHaveLength(2);
    });

    it('still emits the reported key, because it is a usable attribute name', () => {
      // Reported AND emitted, not reported and dropped. The pass-through rule is
      // that a well-formed attribute name is emitted as typed, and this is one;
      // MISPLACED_CONTAINER_ATTRIBUTE is the precedent, where the value is
      // emitted where it was asked for and the report names what works instead.
      // UNKNOWN_LAYER drops its key, but only because `foo--x` is not a usable
      // attribute name at all, so it is the wrong precedent to reach for here.
      expect(render('[marginTop=3]||B291').svgCode).toContain('marginTop="3"');
    });

    it('says nothing about a name the library does not curate', () => {
      // The report is about OUR vocabulary in the wrong spelling. A camelCase
      // SVG attribute is not ours in either spelling, so it passes through
      // unjudged: the same rule is what keeps `viewBox` and
      // `preserveAspectRatio` working, since kebab-casing them would break them.
      for (const dsl of ['[preserveAspectRatio=none]||B291', '[strokeDasharray="1 1"]||B291',
                         '[dataFoo=1]||B291', '[stroke-dasharray="1 1"]||B291']) {
        expect(spellingReports(render(dsl))).toEqual([]);
      }
    });

    it('answers no for the curated spelling itself, which nothing in the render path asks', () => {
      // The predicate's first clause is unreachable at its only call site: the
      // emission loop skips a curated key before it gets there. It stays because
      // the predicate is exported under a name that claims a standalone meaning,
      // and `stroke-width` is not the programmatic spelling of anything. Pinned
      // directly because behaviour cannot see it: a mutant deleting the clause
      // survives the whole suite, which is the belt-and-braces shape where
      // exactly one half is load-bearing at a time.
      expect(isProgrammaticSpelling('stroke-width')).toBe(false);
      expect(isProgrammaticSpelling('strokeWidth')).toBe(true);
    });

    it('says nothing about kerning, which the parser writes into the bag itself', () => {
      // `relativeKerning` reaches the options bag under that exact name whenever
      // a character is kerned at all, promoted there from `[relative-kerning=N]`
      // or an `RK:`/`AK:` marker. So at the report site a promoted key and a
      // written one are the same key, and the report does not guess between
      // them. The bracket spelling is Task 7's, at the parser, where the written
      // form is still visible. These two rows go red the day that lands.
      for (const dsl of ['B99/[relative-kerning=3]B291', 'B99/[absolute-kerning=4]B291']) {
        expect(spellingReports(render(dsl))).toEqual([]);
      }
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
    it('renames exactly two names and no others', () => {
      // The membership row. Behaviour CAN see the order of these two, since they
      // are emitted in table order and the element-scope row below matches
      // `stroke-width` ahead of `stroke` as a sequence: swapping the table and
      // this row together still fails there. What behaviour cannot see is a
      // THIRD entry, which publishes a computed value under a name no row looks
      // for and leaves the whole suite green. Measured both ways. Asserting the
      // table whole is what makes adding one a decision rather than an accident.
      expect([...PUBLICATION_MAP]).toEqual([['strokeWidth', 'stroke-width'], ['color', 'stroke']]);
    });

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

    it('is still reported as displaced, under the kebab spelling it arrived as', () => {
      // The control for the two silenced reports above, and the row that fails if
      // the fix is taken further than dropping the conversion. The same key on
      // the same input reports here and stays silent from a bracket, because here
      // it really did shape the viewBox: `#toRaw` turned it into `margin-top`
      // before the options pass, so the report names what the author would have
      // to remove, in a spelling the author did not type. That is the existing
      // behaviour of every other camelCase key on this channel.
      const b = render('B291', { marginTop: 3, viewBox: '0 0 10 10' });
      const displaced = b.warnings.filter((w) => w.code === 'MULTIPLE_GEOMETRY_VALUES');

      expect(displaced).toHaveLength(1);
      expect(displaced[0].source).toBe('margin-top');
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
    // with no kebab option of their own, so the separation left them nowhere to
    // land and every channel stopped cropping. `camelToKebab` gives
    // `auto-vertical` and `crop-compact`, neither of which is an option, so the
    // generic rule above is blind to them and its message would name a key that
    // does not exist.
    //
    // Ruled 2026-09-03: a bracket REPORTS them and names the option that works,
    // and the constructor keeps accepting them, by a two-entry lookup rather
    // than by a rule, because there is no rule to derive `crop=compact` from
    // `cropCompact`.
    it.each([
      ['autoVertical', 'crop=auto-vertical'],
      ['cropCompact', 'crop=compact'],
    ])('reports %s and names the whole option that works', (camel, remedy) => {
      const b = render(`[${camel}]||B291`);
      // The crop is what stopped happening, so the picture is the plain one.
      // Asserted on the viewBox rather than on the whole document, because the
      // key is still emitted (see below) and the two documents differ by it.
      expect(viewBox(b)).toBe(viewBox(render('B291')));
      const misplaced = spellingReports(b);
      expect(misplaced).toHaveLength(1);
      expect(misplaced[0].source).toBe(camel);
      expect(misplaced[0].message).toContain(remedy);
      // Emitted like every other reported spelling: `autoVertical` is a usable
      // attribute name, so the pass-through rule applies to it unchanged. An
      // exception for these two is not derivable from anything a reader can see.
      expect(b.svgCode).toContain(`${camel}="true"`);
    });

    it.each([
      ['autoVertical', 'crop', 'auto-vertical'],
      ['cropCompact', 'crop', 'compact'],
    ])('keeps %s working in the constructor, by lookup rather than by rule', (camel, key, value) => {
      // camelCase is the constructor's documented spelling, so these two keep
      // working there. Compared against the option they mean, byte for byte,
      // which is the assertion that fails if the lookup translates to the wrong
      // one; the third row is what fails if it translates unconditionally.
      const b = render('B291', { [camel]: true });
      expect(b.svgCode).toBe(render('B291', { [key]: value }).svgCode);
      expect(b.warnings).toEqual([]);
      // and it really did crop, so the row cannot pass on two plain pictures.
      expect(viewBox(b)).not.toBe(viewBox(render('B291')));
    });

    it.each([
      ['the internal name written second', { crop: 'compact', autoVertical: true }, 'crop=auto-vertical'],
      ['the bulk option written second', { autoVertical: true, crop: 'compact' }, 'crop=compact'],
    ])('lets the later of two crops win, %s', (_order, options, equivalent) => {
      // Recording, not endorsing. Both keys resolve to `crop`, so one silently
      // clobbers the other and which one depends on the order the object lists
      // them in. That is pre-existing for every bulk-and-specific pair on this
      // channel and is not this task's to change; the row exists so a later
      // reader meets it as a known outcome rather than reading it as intended.
      const [key, value] = equivalent.split('=');
      expect(viewBox(render('B291', options))).toBe(viewBox(render('B291', { [key]: value })));
    });

    it('leaves an explicit false off rather than turning it into the crop it refuses', () => {
      // Both are boolean switches, so translating unconditionally would turn
      // `{ autoVertical: false }` INTO the crop it asks not to have.
      const b = render('B291', { autoVertical: false });
      expect(viewBox(b)).toBe(viewBox(render('B291')));
      expect(b.svgCode).not.toContain('autoVertical');
      expect(b.warnings).toEqual([]);
    });
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
