import { describe, it, expect } from 'vitest';
import { BlissSVGBuilder } from '../src/lib/bliss-svg-builder.js';
import { PUBLICATION_MAP } from '../src/lib/bliss-constants.js';

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
 * EVERY channel now resolves a curated name on the way in, a composition object
 * last, so none of them can deliver a camelCase curated key to the options pass:
 * `[strokeWidth=1]` IS the option and sets it. The four poisonings are therefore
 * unreachable rather than merely separated, and the report that named them,
 * `MISPLACED_OPTION_SPELLING`, is down to the two spellings that name a whole
 * option rather than a name. What the split still holds is the reverse
 * direction: the author's own keys stay the author's, at every depth, and never
 * meet the computed bag.
 *
 * Covers:
 * - The four measured poisonings asked of a bracket, where the name is resolved
 *   and the option computes, byte-identically to its curated spelling.
 * - The reverse direction: a curated key written in its curated (kebab)
 *   spelling is untouched by the split, and the two names the library both
 *   computes AND publishes (`color` -> `stroke`, `strokeWidth` -> `stroke-width`)
 *   still reach the markup at every scope.
 * - The ordering the split destroys and this file restores by stating it: the
 *   published pair is walked first and the author's keys second, so a raw
 *   `stroke` beats a curated `color` in either bracket order, exactly as before.
 * - An author's key is emitted VERBATIM. The blanket camelCase-to-kebab rename
 *   is gone, so `[myOwnAttr=blue]` ships `myOwnAttr="blue"` and not the
 *   `my-own-attr="blue"` it used to invent.
 * - The two reports that name written option keys back to the author. Both
 *   canonicalized camelCase before matching, which was wrong while the key was
 *   inert; now the key really does size the picture, so both name it, in the
 *   curated spelling it was stored under.
 * - The constructor's camelCase, which is its documented spelling and keeps
 *   working, because `#toRaw` resolves the name before the options pass runs.
 * - Kerning, which the parser promotes onto the options bag rather than the
 *   author writing it, so it belongs with the computed values and must not fall
 *   through into the markup.
 * - One row per element depth, because the wrap that emits an author's keys has
 *   five call sites (composition, group, glyph, leaf part, composite part) and a
 *   single top-level row passes with four of them still wrong.
 * - The serializers, which snapshot the authoring tree before the options pass
 *   runs and must therefore never see the second bag.
 * - The two internal names with no curated twin (`autoVertical`, `cropCompact`),
 *   which the generic rule cannot see and a two-entry lookup names the working
 *   option for. These are the only spellings anything still reports, because
 *   they name a whole option rather than a name, so there is nothing for ingest
 *   to resolve. Every route reports them alike and none of them crops.
 *
 * Does NOT cover:
 * - What a curated option's camelCase spelling now does on a composition
 *   object, which used to be this file's opening block and is
 *   `BlissSVGBuilder.object-input-options.test.js`. Retired from here with it:
 *   the derived sweep asserting each camel spelling REPORTS (the same
 *   derivation now asserts each one computes), the four poisoning rows homed on
 *   that channel, and the direct pin on `isProgrammaticSpelling`, whose
 *   predicate was deleted with the arm it fed.
 * - The two report filters that were homed on object input for as long as it
 *   was the only channel carrying an unresolved camel key. Nothing can deliver
 *   one now, so canonicalizing inside those filters no longer changes any
 *   output; their bracket rows below are what keeps them honest.
 * - The collapse when both spellings are written at once, and the `toString()`
 *   rows, which are `BlissSVGBuilder.option-spelling.test.js`.
 * - Option VALUE validation, which is `BlissSVGBuilder.option-value-gate.test.js`.
 * - The same question asked of a definition's `defaultOptions`, which is a
 *   programmatic surface and therefore translates rather than reports, see
 *   `BlissSVGBuilder.default-options.test.js`.
 */

const render = (input, opts) => (opts ? new BlissSVGBuilder(input, opts) : new BlissSVGBuilder(input));
const dotPath = (b) => b.svgCode.match(/<path[^>]*d="([^"]*)"/)[1];
const viewBox = (b) => b.svgCode.match(/viewBox="[^"]*"/)[0];
// The one report a written option key still raises, kept apart from the rest so
// a row asserting silence about everything else stays readable.
const SPELLING_REPORT = 'MISPLACED_OPTION_SPELLING';
const warningsBesidesSpelling = (b) => b.warnings.filter((w) => w.code !== SPELLING_REPORT);
const spellingReports = (b) => b.warnings.filter((w) => w.code === SPELLING_REPORT);

// A composition object with a document-scope options bag, shaped the way
// `toJSON()` emits one.
const objectInput = (options, codeName = 'B291') => ({
  groups: [{ glyphs: [{ codeName, parts: [{ codeName }] }] }],
  options,
});

describe('BlissSVGBuilder option namespace split', () => {
  describe('when a composition object carries a curated option', () => {
    // This channel stored a bag exactly as it was given for as long as any did,
    // so it was where a camelCase curated key could still reach the options
    // pass, land beside the value the library had computed under that name, and
    // be reported. It resolves the name on ingest now, so the poisonings are
    // unreachable rather than separated and the report has nothing to say here.
    // What survives is the separation itself, which is what these rows state.
    it("keeps the author's own key out of the computed values", () => {
      // A name nobody owns is emitted as typed, and the curated option written
      // beside it still computes. One bag would put them in each other's way.
      const b = render(objectInput({ myOwnAttr: 'blue', 'stroke-width': 2 }));
      expect(b.svgCode).toContain('myOwnAttr="blue"');
      expect(b.svgCode).toMatch(/<g class="bliss-content"[^>]*\sstroke-width="2"/);
      expect(warningsBesidesSpelling(b)).toEqual([]);
    });

    it('reports its root-- twin as shadowed, exactly as a bracket does', () => {
      // While the key was inert this was the row that noticed a rename coming
      // back, and the absence of a warning was the point. `strokeWidth` IS the
      // curated option on this channel now, so it lands on the content group as
      // the curated spelling does, the `root--` twin is the root paint that
      // group's own value shadows, and the two surfaces agree.
      const b = render(objectInput({ strokeWidth: 2, 'root--stroke-width': 3 }));
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_CONTAINER_ATTRIBUTE']);
      expect(b.warnings[0].source).toBe('root--stroke-width');
      expect(b.svgCode).toMatch(/<g class="bliss-content"[^>]*\sstroke-width="2"/);
      expect(b.svgCode).toMatch(/<svg[^>]*\sstroke-width="3"/);
      expect(b.svgCode).not.toContain('strokeWidth');
    });

    it('reports the one spelling left once per place it was written', () => {
      // Two scopes are two written keys and two inert values. A report keyed by
      // NAME would collapse these into one and leave the second site unnamed.
      // `autoVertical` carries the row because it names a whole option rather
      // than a name, which is the only kind of spelling still reported.
      const b = render({ groups: [{ glyphs: [{ codeName: 'B291', parts: [{ codeName: 'B291' }],
                                              options: { autoVertical: true } }] }],
                         options: { autoVertical: true } });
      expect(spellingReports(b)).toHaveLength(2);
      expect(spellingReports(b)[0].source).toBe('autoVertical');
    });

    it('still emits the reported key, because it is a usable attribute name', () => {
      // Reported AND emitted, not reported and dropped. The pass-through rule is
      // that a well-formed attribute name is emitted as typed, and this is one.
      expect(render(objectInput({ autoVertical: true })).svgCode).toContain('autoVertical="true"');
    });
  });

  describe('when the same spelling is written in a bracket, which resolves it', () => {
    // The four poisonings above, asked of the channel that now resolves the
    // name. Each one computes, and computes exactly what the curated spelling
    // computes, so the separation is never asked to hold them apart: the name
    // stops being an author's key before the two bags exist.
    it.each([
      ['[strokeWidth=1]||B4', '[stroke-width=1]||B4'],
      ['[strokeWidth=1]B291', '[stroke-width=1]B291'],
      ['[marginTop=3]||B291', '[margin-top=3]||B291'],
      ['[cropTop=5]||B291', '[crop-top=5]||B291'],
      ['[svgHeight=200]||B291', '[svg-height=200]||B291'],
      ['[grid;gridSkyColor=blue]||B291', '[grid;grid-sky-color=blue]||B291'],
    ])('renders %s exactly as %s', (camel, kebab) => {
      const b = render(camel);
      expect(b.svgCode).toBe(render(kebab).svgCode);
      expect(b.warnings).toEqual([]);
    });

    it('reports the root-- twin it used to be emitted beside as shadowed', () => {
      // Before ingest resolved the name these were two different attributes, a
      // camel author key and a `root--` key, and the absence of a warning was
      // the point. `strokeWidth` is now the curated option, so it lands on the
      // content group, and the `root--` key is the root paint that group's own
      // value shadows.
      const b = render('[strokeWidth=2;root--stroke-width=3]||B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['MISPLACED_CONTAINER_ATTRIBUTE']);
      expect(b.warnings[0].source).toBe('root--stroke-width');
      expect(b.svgCode).toMatch(/<g class="bliss-content"[^>]*\sstroke-width="2"/);
      expect(b.svgCode).toMatch(/<svg[^>]*\sstroke-width="3"/);
      expect(b.svgCode).not.toContain('strokeWidth');
    });

    // Two reports name written option keys back to the author, and both filter
    // the written list through the curated geometry sets. While the camel key
    // was inert that filtering named a key that computed nothing; now the key
    // really does size the picture, so both name it, under the curated spelling
    // the bag stored.
    it('is reported as displaced when the viewBox is written by hand', () => {
      const b = render('[marginTop=3;viewBox="0 0 10 10"]||B291');
      const displaced = b.warnings.filter((w) => w.code === 'MULTIPLE_GEOMETRY_VALUES');

      expect(displaced).toHaveLength(1);
      expect(displaced[0].source).toBe('margin-top');
      expect(b.svgCode).toContain('viewBox="0 0 10 10"');
    });

    it('is named among the values to reduce when a curated option overflows', () => {
      // This report exists to say WHICH written options to reduce, so it must
      // name every option that sized the picture and no others. Both do here.
      const b = render('[margin=1e308;marginTop=3]||B291');
      expect(b.warnings.map((w) => w.code)).toEqual(['OUT_OF_RANGE_COMPUTED_GEOMETRY']);
      expect(b.warnings[0].source).toBe('margin, margin-top');
    });

    it('takes the same branch of the overflow report as the curated spelling', () => {
      // The second arm of the same filter, where removing the named options
      // empties the list and the message BRANCHES on that. The two spellings
      // are one option, so they must land on the same branch; before ingest
      // resolved the name the camel form took the other one and claimed no
      // options had been dropped.
      const camel = render('[marginTop=3]||[x=1e308]>B291');
      const kebab = render('[margin-top=3]||[x=1e308]>B291');
      const overflow = (b) => b.warnings.find((w) => w.code === 'OUT_OF_RANGE_COMPUTED_GEOMETRY');

      expect(overflow(camel).source).toBe('margin-top');
      expect(overflow(camel).message).toBe(overflow(kebab).message);
    });

    it('says nothing about a name the library does not curate', () => {
      // The report is about OUR vocabulary in the wrong spelling. A camelCase
      // SVG attribute is not ours in either spelling, and neither is an
      // author's own name, so both pass through unjudged.
      for (const dsl of ['[preserveAspectRatio=none]||B291', '[strokeDasharray="1 1"]||B291',
                         '[dataFoo=1]||B291', '[stroke-dasharray="1 1"]||B291']) {
        expect(spellingReports(render(dsl))).toEqual([]);
      }
    });

    it('emits an author-owned key verbatim rather than kebab-casing it', () => {
      // The blanket camel->kebab conversion is gone: it was the mechanism that
      // let an author's raw key be renamed on its way out. Measured before the
      // split with `gridColor`, which is now curated vocabulary; a name nobody
      // owns is what carries the claim.
      const svg = render('[myOwnAttr=blue]||B291').svgCode;
      expect(svg).toContain('myOwnAttr="blue"');
      expect(svg).not.toContain('my-own-attr="blue"');
    });

    it('says nothing about kerning written in either spelling', () => {
      // `relativeKerning` reaches the options bag under that exact name whenever
      // a character is kerned at all, promoted there from `[relative-kerning=N]`
      // or an `RK:`/`AK:` marker. So at the report site a promoted key and a
      // written one are the same key, and the report does not guess between
      // them.
      //
      // The bracket spelling used to be Task 7's, which would have made
      // `[relativeKerning=N]` a refusal. That task is WITHDRAWN: the contract's
      // own census enumerates the two kerning names as curated vocabulary, and
      // curated vocabulary accepts either casing. These rows stay green
      // permanently and pin that; they are not an unpaid debt.
      for (const dsl of ['B99/[relative-kerning=3]B291', 'B99/[absolute-kerning=4]B291',
                         'B99/[relativeKerning=3]B291', 'B99/[absoluteKerning=4]B291']) {
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
      ['on the content group', '[color=red;stroke-width=2]||B291', /<g class="bliss-content"[^>]*\sstroke="red"[^>]*\sstroke-width="2"/],
      ['at element scope', '[color=red;stroke-width=2]B291', /<g stroke-width="2" stroke="red">/],
    ])('reaches the markup %s', (_where, dsl, placed) => {
      // Options PRECEDE the code, so `B291[color=red]` would be an unknown code
      // rendering nothing and the row would pass against a broken build.
      //
      // Matched against the ELEMENT that must carry them, not searched for
      // anywhere in the document: both names inherit down onto the shapes, so a
      // plain `toContain` passes with the values on the wrong element.
      //
      // The global half pins the paint defaults `#svgCode` writes on the content
      // group, NOT this chunk's published walk, which at global scope only
      // registers the two names so a `content--` key can collide with them; that
      // collision is pinned in `global-placement.test.js`. The element half is
      // the walk: nothing else emits these two below the content group.
      expect(render(dsl).svgCode).toMatch(placed);
      expect(warningsBesidesSpelling(render(dsl))).toEqual([]);
    });

    it.each([
      ['curated first', '[color=red;stroke=blue]'],
      ['raw first', '[stroke=blue;color=red]'],
    ])('lets a raw name beat a curated one on the content group, %s', (_order, bracket) => {
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
    it('keeps working, because #toRaw resolves the name before processing', () => {
      expect(viewBox(render('B291', { marginTop: 3 }))).toBe('viewBox="-0.75 -3 9.5 23.75"');
      expect(render('B291', { svgHeight: 86 }).svgCode).toContain('height="86"');
    });

    it('is reported as displaced under the curated spelling it arrived as', () => {
      // The key really did shape the viewBox, so the report names what the
      // author would have to remove, in the spelling the bag stored. That is the
      // existing behaviour of every camelCase key on this channel and is now
      // also what a bracket does, since both resolve the name on the way in.
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
    // They are also the only spellings a BRACKET still reports, because they are
    // not a spelling of a NAME: each is a JavaScript shorthand for a whole
    // option and its value, so ingest has nothing to resolve.
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
      ['autoVertical', 'the constructor', (camel) => render('B291', { [camel]: true }), '[autoVertical]||B291'],
      ['cropCompact', 'the constructor', (camel) => render('B291', { [camel]: true }), '[cropCompact]||B291'],
      ['autoVertical', 'setOptions on a character', (camel) => {
        const b = render('B291');
        b.glyph(0).setOptions({ [camel]: true });
        return b;
      }, '[autoVertical]B291'],
    ])('reports %s through %s exactly as a bracket does, and crops nothing', (camel, _route, build, bracket) => {
      // regression: the JavaScript entry points used to translate these two
      // internal names into the crop they stand for, the one place a whole
      // option could be written as a single word. Every route now reads them
      // as the bracket does.
      const b = build(camel);
      expect(b.warnings).toEqual(render(bracket).warnings);
      expect(b.svgCode).toBe(render(bracket).svgCode);
      expect(b.toString()).toBe(bracket);
      expect(viewBox(b)).toBe(viewBox(render('B291')));
    });

    it('reports it through the transient channel too, which never saves it', () => {
      const b = render('B291');
      b.setTransientOptions({ autoVertical: true });
      expect(spellingReports(b).map((w) => w.source)).toEqual(['autoVertical']);
      expect(viewBox(b)).toBe(viewBox(render('B291')));
      expect(b.toString()).toBe('B291');
    });

    it.each([
      ['the internal name written second', { crop: 'compact', autoVertical: true }],
      ['the real option written second', { autoVertical: true, crop: 'compact' }],
    ])('keeps the real crop whatever order the internal name sits in, %s', (_order, options) => {
      // The internal name sets nothing, so it cannot clobber the crop that was
      // really written, in either order.
      expect(viewBox(render('B291', options))).toBe(viewBox(render('B291', { crop: 'compact' })));
    });
  });

  describe('when the composition is serialized', () => {
    // The authoring tree is snapshotted before the options pass runs, so the
    // second bag is invisible to both serializers. Pinned because the split is
    // what creates something for them to leak.
    it('round-trips the DSL unchanged', () => {
      // Two author-owned keys, one camelCase and one hyphenated: neither is
      // resolved on the way in, so the text that comes back is the text that
      // went out.
      expect(render('[myOwnAttr=blue;data-depth=chr]B291').toString())
        .toBe('[myOwnAttr=blue;data-depth=chr]B291');
    });

    it('reports again when the round-tripped DSL is parsed', () => {
      // The public page promises this, and the row above cannot see it: the
      // text surviving and the report coming back with it are separable, so a
      // change to where the authoring tree is snapshotted could keep the one
      // and lose the other while every serialization row stays green.
      expect(spellingReports(render(render('[autoVertical]||B291').toString()))).toHaveLength(1);
    });

    it('never puts the second bag in the JSON', () => {
      // The serialized tree is compared WHOLE, not searched for the bag's NAME:
      // a leak under any other field name passes a name check, and a leak at the
      // root passes a check that only reads the glyph.
      expect(render('[myOwnAttr=blue;data-depth=chr]B291').toJSON()).toEqual({
        options: {},
        groups: [{
          glyphs: [{
            parts: [{ codeName: 'B291' }],
            options: { myOwnAttr: 'blue', 'data-depth': 'chr' },
            codeName: 'B291',
          }],
        }],
      });
    });
  });
});
